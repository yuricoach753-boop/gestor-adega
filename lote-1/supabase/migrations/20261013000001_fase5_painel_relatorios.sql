-- =====================================================================
-- FASE 5 · PAINEL INICIAL E RELATÓRIOS
-- Relatórios usam o custo guardado em cada item vendido (venda_itens.custo_unitario),
-- coluna que o app não lê direto: por isso são funções do banco, só para o dono.
-- =====================================================================

-- Data da venda no fuso de São Paulo
create or replace function public.dia_sp(p timestamptz)
returns date language sql immutable as $$
  select (p at time zone 'America/Sao_Paulo')::date
$$;

create index if not exists vendas_empresa_dia_idx on public.vendas (empresa_id, public.dia_sp(data_venda)) where status <> 'cancelado';

create or replace function public._checar_periodo(p_inicio date, p_fim date)
returns void language plpgsql immutable as $$
begin
  if p_inicio is null or p_fim is null then
    raise exception 'Escolha o período.';
  end if;
  if p_fim < p_inicio then
    raise exception 'A data final precisa ser depois da inicial.';
  end if;
  if p_fim - p_inicio > 1100 then
    raise exception 'Escolha um período de até 3 anos.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- PAINEL: tudo que a tela inicial precisa, numa chamada só.
-- Funcionário recebe só vendas, pedidos e estoque; o dono recebe também o financeiro.
-- ---------------------------------------------------------------------
create or replace function public.painel_resumo(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_hoje    date := public.hoje();
  v_ini_mes date := date_trunc('month', public.hoje())::date;
  r         jsonb;
begin
  if not public.pode_acessar(p_empresa) then
    raise exception 'Você não tem acesso a esta empresa.';
  end if;

  select jsonb_build_object(
    'vendas_hoje', (
      select jsonb_build_object('total', coalesce(sum(total), 0), 'qtd', count(*))
      from public.vendas where empresa_id = p_empresa and status <> 'cancelado' and public.dia_sp(data_venda) = v_hoje),
    'vendas_mes', (
      select jsonb_build_object('total', coalesce(sum(total), 0), 'qtd', count(*))
      from public.vendas where empresa_id = p_empresa and status <> 'cancelado' and public.dia_sp(data_venda) >= v_ini_mes),
    'pedidos_pendentes', (
      select count(*) from public.vendas where empresa_id = p_empresa and status in ('aberto', 'separado')),
    'estoque_baixo', (
      select jsonb_build_object(
        'qtd', (select count(*) from public.produtos
                where empresa_id = p_empresa and ativo and estoque_minimo > 0 and estoque_atual <= estoque_minimo),
        'itens', coalesce(jsonb_agg(x order by x.ordem), '[]'::jsonb))
      from (
        select id, nome, unidade, estoque_atual, estoque_minimo, estoque_atual / estoque_minimo as ordem
        from public.produtos
        where empresa_id = p_empresa and ativo and estoque_minimo > 0 and estoque_atual <= estoque_minimo
        order by estoque_atual / estoque_minimo, nome
        limit 5
      ) x),
    'tem_produtos', exists (select 1 from public.produtos where empresa_id = p_empresa),
    'tem_clientes', exists (select 1 from public.clientes where empresa_id = p_empresa),
    'tem_vendas',   exists (select 1 from public.vendas where empresa_id = p_empresa),
    'tem_equipe',   (select count(*) > 1 from public.membros_empresa where empresa_id = p_empresa and ativo)
  ) into r;

  if public.pode_gerenciar(p_empresa) then
    r := r || jsonb_build_object(
      'saldo_caixa', (
        select coalesce(sum(saldo_atual), 0) from public.v_saldo_contas where empresa_id = p_empresa),
      'lucro_mes', (
        select coalesce(sum(v.total), 0) - coalesce(sum(c.custo), 0)
        from public.vendas v
        cross join lateral (
          select coalesce(sum(round(i.quantidade * i.custo_unitario, 2)), 0) as custo
          from public.venda_itens i where i.venda_id = v.id) c
        where v.empresa_id = p_empresa and v.status <> 'cancelado' and public.dia_sp(v.data_venda) >= v_ini_mes),
      'pagar', (
        select jsonb_build_object(
          'total_7dias',    coalesce(sum(valor) filter (where vencimento >= v_hoje), 0),
          'qtd_7dias',      count(*) filter (where vencimento >= v_hoje),
          'total_atrasado', coalesce(sum(valor) filter (where vencimento < v_hoje), 0),
          'qtd_atrasado',   count(*) filter (where vencimento < v_hoje),
          'itens', coalesce((
            select jsonb_agg(x order by x.vencimento, x.descricao)
            from (select id, descricao, valor, vencimento,
                         case when vencimento < v_hoje then 'atrasada' when vencimento = v_hoje then 'vence_hoje' else 'a_vencer' end as situacao
                  from public.contas_pagar
                  where empresa_id = p_empresa and status = 'aberta' and vencimento <= v_hoje + 7
                  order by vencimento, descricao limit 5) x), '[]'::jsonb))
        from public.contas_pagar
        where empresa_id = p_empresa and status = 'aberta' and vencimento <= v_hoje + 7),
      'receber_atrasado', (
        select jsonb_build_object(
          'total', coalesce(sum(total_vencido), 0),
          'qtd_clientes', count(*),
          'itens', coalesce((
            select jsonb_agg(x order by x.total_vencido desc)
            from (select cliente_id, cliente_nome, cliente_telefone, total_vencido, maior_atraso, vencimento_mais_antigo
                  from public.v_devedores
                  where empresa_id = p_empresa and maior_atraso > 0
                  order by total_vencido desc limit 5) x), '[]'::jsonb))
        from public.v_devedores where empresa_id = p_empresa and maior_atraso > 0),
      'fluxo_30', (
        select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'entradas', entradas, 'saidas', saidas) order by dia), '[]'::jsonb)
        from public.fluxo_diario(p_empresa, v_hoje - 29, v_hoje))
    );
  end if;

  return r;
end $$;

-- ---------------------------------------------------------------------
-- RELATÓRIO: vendas por período (dia, semana ou mês)
-- faturamento = total líquido (já com descontos); lucro bruto = faturamento − custo dos produtos
-- ---------------------------------------------------------------------
create or replace function public.relatorio_vendas(p_empresa uuid, p_inicio date, p_fim date, p_agrupar text default 'dia')
returns table (periodo date, qtd_vendas int, faturamento numeric, descontos numeric, custo numeric, lucro_bruto numeric, ticket_medio numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_unid text := case p_agrupar when 'mes' then 'month' when 'semana' then 'week' else 'day' end;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode ver relatórios.';
  end if;
  perform public._checar_periodo(p_inicio, p_fim);

  return query
  with v as (
    select date_trunc(v_unid, public.dia_sp(vd.data_venda))::date as per, vd.total, vd.desconto,
           (select coalesce(sum(round(i.quantidade * i.custo_unitario, 2)), 0) from public.venda_itens i where i.venda_id = vd.id) as custo
    from public.vendas vd
    where vd.empresa_id = p_empresa and vd.status <> 'cancelado'
      and public.dia_sp(vd.data_venda) between p_inicio and p_fim
  ),
  agg as (
    select per, count(*)::int as qtd, sum(total) as fat, sum(desconto) as des, sum(v.custo) as cus
    from v group by per
  )
  select g::date,
         coalesce(a.qtd, 0),
         coalesce(a.fat, 0),
         coalesce(a.des, 0),
         coalesce(a.cus, 0),
         coalesce(a.fat, 0) - coalesce(a.cus, 0),
         case when coalesce(a.qtd, 0) > 0 then round(a.fat / a.qtd, 2) else 0 end
  from generate_series(date_trunc(v_unid, p_inicio), p_fim, ('1 ' || v_unid)::interval) g
  left join agg a on a.per = g::date
  order by g;
end $$;

-- ---------------------------------------------------------------------
-- RELATÓRIO: produtos (mais vendidos e margem)
-- O desconto geral da venda é distribuído entre os itens proporcionalmente.
-- ---------------------------------------------------------------------
create or replace function public.relatorio_produtos(p_empresa uuid, p_inicio date, p_fim date)
returns table (produto_id uuid, nome text, categoria text, unidade public.unidade_produto, quantidade numeric,
               faturamento numeric, custo numeric, lucro_bruto numeric, margem numeric, qtd_vendas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode ver relatórios.';
  end if;
  perform public._checar_periodo(p_inicio, p_fim);

  return query
  with itens as (
    select i.produto_id, i.venda_id, i.quantidade,
           round(i.subtotal * case when v.subtotal > 0 then v.total / v.subtotal else 1 end, 2) as fat,
           round(i.quantidade * i.custo_unitario, 2) as cus
    from public.venda_itens i
    join public.vendas v on v.id = i.venda_id
    where v.empresa_id = p_empresa and v.status <> 'cancelado'
      and public.dia_sp(v.data_venda) between p_inicio and p_fim
  )
  select it.produto_id, p.nome, c.nome, p.unidade,
         sum(it.quantidade), sum(it.fat), sum(it.cus), sum(it.fat) - sum(it.cus),
         case when sum(it.fat) > 0 then round((sum(it.fat) - sum(it.cus)) / sum(it.fat) * 100, 1) end,
         count(distinct it.venda_id)::int
  from itens it
  join public.produtos p on p.id = it.produto_id
  left join public.categorias c on c.id = p.categoria_id
  group by it.produto_id, p.nome, c.nome, p.unidade
  order by sum(it.fat) desc, p.nome;
end $$;

-- ---------------------------------------------------------------------
-- RELATÓRIO: clientes
-- ---------------------------------------------------------------------
create or replace function public.relatorio_clientes(p_empresa uuid, p_inicio date, p_fim date)
returns table (cliente_id uuid, nome text, telefone text, qtd_compras int, faturamento numeric, lucro_bruto numeric,
               ticket_medio numeric, ultima_compra date, devendo numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode ver relatórios.';
  end if;
  perform public._checar_periodo(p_inicio, p_fim);

  return query
  with v as (
    select vd.cliente_id, vd.total, public.dia_sp(vd.data_venda) as dia,
           (select coalesce(sum(round(i.quantidade * i.custo_unitario, 2)), 0) from public.venda_itens i where i.venda_id = vd.id) as custo
    from public.vendas vd
    where vd.empresa_id = p_empresa and vd.status <> 'cancelado'
      and public.dia_sp(vd.data_venda) between p_inicio and p_fim
  )
  select v.cliente_id,
         coalesce(cl.nome, 'Venda de balcão (sem cliente)'),
         cl.telefone,
         count(*)::int,
         sum(v.total),
         sum(v.total) - sum(v.custo),
         round(sum(v.total) / count(*), 2),
         max(v.dia),
         coalesce((select sum(cr.valor - cr.valor_recebido) from public.contas_receber cr
                   where cr.cliente_id = v.cliente_id and cr.status in ('aberta', 'parcial')), 0)
  from v
  left join public.clientes cl on cl.id = v.cliente_id
  group by v.cliente_id, cl.nome, cl.telefone
  order by sum(v.total) desc;
end $$;

-- ---------------------------------------------------------------------
-- RELATÓRIO: despesas por categoria (o que saiu do caixa no período)
-- Transferências entre contas não entram.
-- ---------------------------------------------------------------------
create or replace function public.relatorio_despesas(p_empresa uuid, p_inicio date, p_fim date)
returns table (categoria_id uuid, categoria text, total numeric, qtd int, percentual numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode ver relatórios.';
  end if;
  perform public._checar_periodo(p_inicio, p_fim);

  return query
  with s as (
    select l.categoria_id, l.valor
    from public.lancamentos_caixa l
    where l.empresa_id = p_empresa and l.status = 'confirmado' and l.tipo = 'saida'
      and l.origem_tipo <> 'transferencia' and l.data between p_inicio and p_fim
  ),
  tot as (select sum(valor) as t from s)
  select s.categoria_id, coalesce(c.nome, 'Sem categoria'), sum(s.valor), count(*)::int,
         round(sum(s.valor) / nullif((select t from tot), 0) * 100, 1)
  from s left join public.categorias c on c.id = s.categoria_id
  group by s.categoria_id, c.nome
  order by sum(s.valor) desc;
end $$;

-- ---------------------------------------------------------------------
-- RELATÓRIO: vendas por forma de pagamento
-- ---------------------------------------------------------------------
create or replace function public.relatorio_formas(p_empresa uuid, p_inicio date, p_fim date)
returns table (forma public.forma_pagamento, total numeric, qtd_vendas int, percentual numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode ver relatórios.';
  end if;
  perform public._checar_periodo(p_inicio, p_fim);

  return query
  with p as (
    select vp.forma, vp.valor, vp.venda_id
    from public.venda_pagamentos vp
    join public.vendas v on v.id = vp.venda_id
    where v.empresa_id = p_empresa and v.status <> 'cancelado'
      and public.dia_sp(v.data_venda) between p_inicio and p_fim
  ),
  tot as (select sum(valor) as t from p)
  select p.forma, sum(p.valor), count(distinct p.venda_id)::int,
         round(sum(p.valor) / nullif((select t from tot), 0) * 100, 1)
  from p group by p.forma order by sum(p.valor) desc;
end $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function public._checar_periodo(date, date) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.painel_resumo(uuid)',
    'public.relatorio_vendas(uuid, date, date, text)',
    'public.relatorio_produtos(uuid, date, date)',
    'public.relatorio_clientes(uuid, date, date)',
    'public.relatorio_despesas(uuid, date, date)',
    'public.relatorio_formas(uuid, date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
