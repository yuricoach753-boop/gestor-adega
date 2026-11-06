-- =====================================================================
-- FASE 4 · CONTAS A PAGAR, CONTAS RECORRENTES E FLUXO DE CAIXA
-- =====================================================================

-- ---------------------------------------------------------------------
-- RPC: lançar conta a pagar (com parcelas). Só o dono.
-- Código de barras e anexo ficam na 1ª parcela (as outras podem ser editadas depois).
-- ---------------------------------------------------------------------
create or replace function public.lancar_contas_pagar(
  p_empresa             uuid,
  p_descricao           text,
  p_valor_total         numeric,
  p_primeiro_vencimento date,
  p_fornecedor          uuid default null,
  p_categoria           uuid default null,
  p_forma               public.forma_pagamento default null,
  p_codigo_barras       text default null,
  p_anexo_path          text default null,
  p_parcelas            int default 1,
  p_intervalo_dias      int default 30,
  p_observacoes         text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_total   numeric(14,2) := round(coalesce(p_valor_total, 0), 2);
  v_grupo   uuid := gen_random_uuid();
  v_parcela numeric(14,2);
  v_desc    text := trim(coalesce(p_descricao, ''));
  i         int;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode lançar contas a pagar.';
  end if;
  if length(v_desc) < 2 then
    raise exception 'Informe a descrição.';
  end if;
  if v_total <= 0 then
    raise exception 'Informe o valor.';
  end if;
  if p_primeiro_vencimento is null then
    raise exception 'Informe o vencimento.';
  end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 48 then
    raise exception 'O número de parcelas precisa ser entre 1 e 48.';
  end if;
  if p_intervalo_dias is null or p_intervalo_dias < 1 then
    raise exception 'O intervalo entre parcelas precisa ser de pelo menos 1 dia.';
  end if;
  if p_forma = 'a_prazo' then
    raise exception 'Escolha como a conta será paga (boleto, Pix, dinheiro…).';
  end if;
  if p_anexo_path is not null and public.empresa_do_caminho(p_anexo_path) is distinct from p_empresa then
    raise exception 'Anexo inválido.';
  end if;

  v_parcela := trunc(v_total / p_parcelas, 2);
  for i in 1..p_parcelas loop
    insert into public.contas_pagar
      (empresa_id, descricao, fornecedor_id, categoria_id, valor, vencimento, forma_pagamento,
       codigo_barras, anexo_path, parcela_numero, parcela_total, grupo_parcelamento_id, observacoes)
    values
      (p_empresa,
       v_desc || case when p_parcelas > 1 then format(' (%s/%s)', i, p_parcelas) else '' end,
       p_fornecedor, p_categoria,
       case when i = p_parcelas then v_total - v_parcela * (p_parcelas - 1) else v_parcela end,
       p_primeiro_vencimento + (i - 1) * p_intervalo_dias,
       p_forma,
       case when i = 1 then nullif(
         case when coalesce(p_codigo_barras, '') ~ '^[0-9[:space:].-]+$'
              then regexp_replace(p_codigo_barras, '\D', '', 'g')   -- linha digitável: só os números
              else trim(coalesce(p_codigo_barras, '')) end, '') end,
       case when i = 1 then p_anexo_path end,
       i, p_parcelas, v_grupo, nullif(trim(p_observacoes), ''));
  end loop;
  return v_grupo;
end $$;

-- ---------------------------------------------------------------------
-- RPC: pagar conta (com juros/multa e desconto). Lança a saída no caixa. Só o dono.
-- ---------------------------------------------------------------------
create or replace function public.pagar_conta(
  p_conta             uuid,
  p_data              date default null,
  p_conta_financeira  uuid default null,
  p_forma             public.forma_pagamento default null,
  p_juros             numeric default 0,
  p_desconto          numeric default 0
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c        public.contas_pagar%rowtype;
  v_data   date := coalesce(p_data, public.hoje());
  v_juros  numeric(14,2) := round(coalesce(p_juros, 0), 2);
  v_desc   numeric(14,2) := round(coalesce(p_desconto, 0), 2);
  v_total  numeric(14,2);
  v_forma  public.forma_pagamento;
  v_conta  uuid;
  v_lanc   uuid;
  v_forn   text;
begin
  select * into c from public.contas_pagar where id = p_conta for update;
  if not found or not public.pode_gerenciar(c.empresa_id) then
    raise exception 'Conta não encontrada.';
  end if;
  if c.status = 'paga' then
    raise exception 'Esta conta já foi paga.';
  end if;
  if c.status = 'cancelada' then
    raise exception 'Esta conta está cancelada.';
  end if;
  if v_juros < 0 or v_desc < 0 then
    raise exception 'Juros e desconto não podem ser negativos.';
  end if;
  v_total := c.valor + v_juros - v_desc;
  if v_total <= 0 then
    raise exception 'O desconto não pode ser igual ou maior que o valor da conta.';
  end if;
  if v_data > public.hoje() then
    raise exception 'A data do pagamento não pode ser no futuro.';
  end if;

  v_forma := coalesce(p_forma, c.forma_pagamento, 'pix');
  if v_forma = 'a_prazo' then
    raise exception 'Escolha como a conta foi paga.';
  end if;

  if p_conta_financeira is not null then
    select id into v_conta from public.contas_financeiras where id = p_conta_financeira and empresa_id = c.empresa_id and ativo;
  end if;
  v_conta := coalesce(v_conta, public.conta_padrao(c.empresa_id, v_forma));
  if v_conta is null then
    raise exception 'Cadastre uma conta (Caixa ou Banco) antes de pagar.';
  end if;

  select nome into v_forn from public.fornecedores where id = c.fornecedor_id;

  insert into public.lancamentos_caixa
    (empresa_id, conta_financeira_id, tipo, valor, data, categoria_id, descricao, forma_pagamento, origem_tipo, origem_id)
  values
    (c.empresa_id, v_conta, 'saida', v_total, v_data, c.categoria_id,
     c.descricao || coalesce(' · ' || v_forn, ''), v_forma, 'conta_pagar', c.id)
  returning id into v_lanc;

  perform set_config('app.rpc', 'on', true);
  update public.contas_pagar
  set status = 'paga', pago_em = v_data, valor_pago = v_total, juros_multa = v_juros, desconto = v_desc,
      forma_pagamento = v_forma, conta_financeira_id = v_conta, lancamento_caixa_id = v_lanc
  where id = c.id;
  perform set_config('app.rpc', 'off', true);

  return v_lanc;
end $$;

-- ---------------------------------------------------------------------
-- RPC: estornar pagamento (pago por engano). A conta volta a ficar em aberto.
-- ---------------------------------------------------------------------
create or replace function public.estornar_pagamento(p_conta uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contas_pagar%rowtype;
begin
  select * into c from public.contas_pagar where id = p_conta for update;
  if not found or not public.pode_gerenciar(c.empresa_id) then
    raise exception 'Conta não encontrada.';
  end if;
  if c.status <> 'paga' then
    raise exception 'Esta conta não está paga.';
  end if;

  perform set_config('app.rpc', 'on', true);

  update public.lancamentos_caixa
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = 'Pagamento estornado' || coalesce(': ' || nullif(trim(p_motivo), ''), '')
  where id = c.lancamento_caixa_id and status = 'confirmado';

  update public.contas_pagar
  set status = 'aberta', pago_em = null, valor_pago = null, juros_multa = 0, desconto = 0,
      conta_financeira_id = null, lancamento_caixa_id = null
  where id = c.id;

  perform set_config('app.rpc', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- RPC: cancelar conta a pagar em aberto
-- ---------------------------------------------------------------------
create or replace function public.cancelar_conta_pagar(p_conta uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contas_pagar%rowtype;
begin
  select * into c from public.contas_pagar where id = p_conta for update;
  if not found or not public.pode_gerenciar(c.empresa_id) then
    raise exception 'Conta não encontrada.';
  end if;
  if c.status = 'cancelada' then
    raise exception 'Esta conta já foi cancelada.';
  end if;
  if c.status = 'paga' then
    raise exception 'Esta conta já foi paga. Estorne o pagamento antes de cancelar.';
  end if;
  if c.compra_id is not null then
    raise exception 'Esta conta veio de uma compra. Para cancelar, cancele a compra.';
  end if;

  perform set_config('app.rpc', 'on', true);
  update public.contas_pagar
  set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = nullif(trim(p_motivo), '')
  where id = c.id;
  perform set_config('app.rpc', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- CONTAS RECORRENTES
-- Gera as contas do mês atual e do próximo (até ~35 dias à frente).
-- Não duplica: índice único (recorrencia_id, vencimento) — inclusive se a conta foi cancelada.
-- Dia 31 em mês curto vira o último dia do mês.
-- ---------------------------------------------------------------------
create or replace function public._gerar_recorrentes(p_empresa uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r       public.recorrencias%rowtype;
  v_mes   date;
  v_ate   date := date_trunc('month', public.hoje() + 35)::date;
  v_venc  date;
  v_ult   date;
  v_n     int;
  v_total int := 0;
begin
  for r in
    select * from public.recorrencias
    where ativo and (p_empresa is null or empresa_id = p_empresa)
    for update
  loop
    v_mes := date_trunc('month', greatest(r.inicio, coalesce(r.gerada_ate, r.inicio)))::date;
    v_ult := null;
    while v_mes <= v_ate and (r.fim is null or v_mes <= r.fim) loop
      v_venc := v_mes + (least(r.dia_vencimento, extract(day from (v_mes + interval '1 month - 1 day'))::int) - 1);
      if v_venc >= r.inicio and (r.fim is null or v_venc <= r.fim) then
        insert into public.contas_pagar
          (empresa_id, descricao, fornecedor_id, categoria_id, valor, vencimento, forma_pagamento, recorrencia_id, created_by)
        values
          (r.empresa_id, r.descricao, r.fornecedor_id, r.categoria_id, r.valor, v_venc, r.forma_pagamento, r.id, r.created_by)
        on conflict (recorrencia_id, vencimento) where recorrencia_id is not null do nothing;
        get diagnostics v_n = row_count;
        v_total := v_total + v_n;
        v_ult := v_venc;
      end if;
      v_mes := (v_mes + interval '1 month')::date;
    end loop;
    if v_ult is not null and v_ult is distinct from r.gerada_ate then
      update public.recorrencias set gerada_ate = v_ult where id = r.id;
    end if;
  end loop;
  return v_total;
end $$;

-- Chamado pelo app (ao abrir contas a pagar ou salvar uma recorrente)
create or replace function public.gerar_recorrentes(p_empresa uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode gerar contas recorrentes.';
  end if;
  return public._gerar_recorrentes(p_empresa);
end $$;

-- Chamado pelo agendador (pg_cron) para todas as empresas liberadas
create or replace function public.gerar_recorrentes_todas()
returns int language plpgsql security definer set search_path = public as $$
declare v_total int := 0; e record;
begin
  for e in select id from public.empresas loop
    if public.empresa_liberada(e.id) then
      v_total := v_total + public._gerar_recorrentes(e.id);
    end if;
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------------
-- LANÇAMENTOS DE CAIXA
-- ---------------------------------------------------------------------

-- Lançamento manual (entrada ou saída avulsa). Só o dono.
create or replace function public.lancar_caixa(
  p_empresa          uuid,
  p_tipo             public.tipo_lancamento,
  p_valor            numeric,
  p_descricao        text,
  p_conta_financeira uuid,
  p_data             date default null,
  p_categoria        uuid default null,
  p_forma            public.forma_pagamento default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_valor numeric(14,2) := round(coalesce(p_valor, 0), 2);
  v_data  date := coalesce(p_data, public.hoje());
  v_id    uuid;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode lançar no caixa.';
  end if;
  if v_valor <= 0 then
    raise exception 'Informe o valor.';
  end if;
  if length(trim(coalesce(p_descricao, ''))) < 2 then
    raise exception 'Informe a descrição.';
  end if;
  if v_data > public.hoje() then
    raise exception 'A data não pode ser no futuro. Para algo que ainda vai acontecer, lance uma conta a pagar ou a receber.';
  end if;
  if not exists (select 1 from public.contas_financeiras where id = p_conta_financeira and empresa_id = p_empresa and ativo) then
    raise exception 'Escolha a conta (Caixa ou Banco).';
  end if;
  if p_forma = 'a_prazo' then
    raise exception 'Forma de pagamento inválida para o caixa.';
  end if;

  insert into public.lancamentos_caixa
    (empresa_id, conta_financeira_id, tipo, valor, data, categoria_id, descricao, forma_pagamento, origem_tipo)
  values
    (p_empresa, p_conta_financeira, p_tipo, v_valor, v_data, p_categoria, trim(p_descricao), p_forma, 'manual')
  returning id into v_id;
  return v_id;
end $$;

-- Transferência entre contas (ex.: depositar o dinheiro do caixa no banco). Só o dono.
create or replace function public.transferir_entre_contas(
  p_empresa   uuid,
  p_de        uuid,
  p_para      uuid,
  p_valor     numeric,
  p_data      date default null,
  p_descricao text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_valor numeric(14,2) := round(coalesce(p_valor, 0), 2);
  v_data  date := coalesce(p_data, public.hoje());
  v_ref   uuid := gen_random_uuid();
  v_de    text;
  v_para  text;
  v_desc  text;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode fazer transferências.';
  end if;
  if p_de = p_para then
    raise exception 'Escolha contas diferentes.';
  end if;
  select nome into v_de from public.contas_financeiras where id = p_de and empresa_id = p_empresa and ativo;
  select nome into v_para from public.contas_financeiras where id = p_para and empresa_id = p_empresa and ativo;
  if v_de is null or v_para is null then
    raise exception 'Conta não encontrada.';
  end if;
  if v_valor <= 0 then
    raise exception 'Informe o valor.';
  end if;
  if v_data > public.hoje() then
    raise exception 'A data não pode ser no futuro.';
  end if;

  v_desc := coalesce(nullif(trim(p_descricao), ''), format('Transferência: %s → %s', v_de, v_para));

  insert into public.lancamentos_caixa (empresa_id, conta_financeira_id, tipo, valor, data, descricao, origem_tipo, origem_id)
  values (p_empresa, p_de,   'saida',   v_valor, v_data, v_desc, 'transferencia', v_ref),
         (p_empresa, p_para, 'entrada', v_valor, v_data, v_desc, 'transferencia', v_ref);
  return v_ref;
end $$;

-- Cancelar lançamento manual ou transferência (os automáticos se desfazem na origem)
create or replace function public.cancelar_lancamento(p_lancamento uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.lancamentos_caixa%rowtype;
begin
  select * into l from public.lancamentos_caixa where id = p_lancamento for update;
  if not found or not public.pode_gerenciar(l.empresa_id) then
    raise exception 'Lançamento não encontrado.';
  end if;
  if l.status = 'cancelado' then
    raise exception 'Este lançamento já foi cancelado.';
  end if;
  if l.origem_tipo = 'venda' then
    raise exception 'Este lançamento veio de uma venda. Para desfazer, cancele a venda.';
  elsif l.origem_tipo = 'recebimento' then
    raise exception 'Este lançamento veio de um recebimento. Para desfazer, estorne o recebimento na conta a receber.';
  elsif l.origem_tipo = 'conta_pagar' then
    raise exception 'Este lançamento veio de uma conta paga. Para desfazer, estorne o pagamento na conta a pagar.';
  end if;

  update public.lancamentos_caixa
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = nullif(trim(p_motivo), '')
  where status = 'confirmado'
    and (id = l.id or (l.origem_tipo = 'transferencia' and origem_tipo = 'transferencia' and origem_id = l.origem_id));
end $$;

-- ---------------------------------------------------------------------
-- FLUXO DE CAIXA (funções com permissão de quem consulta: só o dono vê dados)
-- Transferências entre contas não contam como entrada/saída, mas contam no saldo de cada conta.
-- ---------------------------------------------------------------------
create or replace view public.v_fluxo_diario with (security_invoker = true) as
select
  l.empresa_id,
  l.data,
  coalesce(sum(l.valor) filter (where l.tipo = 'entrada'), 0) as entradas,
  coalesce(sum(l.valor) filter (where l.tipo = 'saida'), 0)   as saidas,
  coalesce(sum(case when l.tipo = 'entrada' then l.valor else -l.valor end), 0) as saldo_dia
from public.lancamentos_caixa l
where l.status = 'confirmado' and l.origem_tipo <> 'transferencia'
group by l.empresa_id, l.data;

create or replace function public.fluxo_diario(p_empresa uuid, p_inicio date, p_fim date)
returns table (dia date, entradas numeric, saidas numeric, saldo_dia numeric, saldo_acumulado numeric)
language sql stable security invoker set search_path = public as $$
  with abertura as (
    select
      (select coalesce(sum(saldo_inicial), 0) from public.contas_financeiras where empresa_id = p_empresa)
      + (select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0)
         from public.lancamentos_caixa where empresa_id = p_empresa and status = 'confirmado' and data < p_inicio) as v
  ),
  mov as (
    select data,
           sum(valor) filter (where tipo = 'entrada' and origem_tipo <> 'transferencia') as e,
           sum(valor) filter (where tipo = 'saida' and origem_tipo <> 'transferencia')   as s,
           sum(case when tipo = 'entrada' then valor else -valor end)                       as liq
    from public.lancamentos_caixa
    where empresa_id = p_empresa and status = 'confirmado' and data between p_inicio and p_fim
    group by data
  )
  select d::date, coalesce(m.e, 0), coalesce(m.s, 0), coalesce(m.liq, 0),
         (select v from abertura) + sum(coalesce(m.liq, 0)) over (order by d)
  from generate_series(p_inicio, p_fim, interval '1 day') d
  left join mov m on m.data = d::date
  where public.pode_gerenciar(p_empresa)
  order by d
$$;

create or replace function public.fluxo_mensal(p_empresa uuid, p_meses int default 12)
returns table (mes date, entradas numeric, saidas numeric, resultado numeric, saldo_final numeric)
language sql stable security invoker set search_path = public as $$
  with lim as (
    select (date_trunc('month', public.hoje()) - make_interval(months => greatest(p_meses, 1) - 1))::date as ini
  ),
  abertura as (
    select
      (select coalesce(sum(saldo_inicial), 0) from public.contas_financeiras where empresa_id = p_empresa)
      + (select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0)
         from public.lancamentos_caixa, lim where empresa_id = p_empresa and status = 'confirmado' and data < lim.ini) as v
  ),
  mov as (
    select date_trunc('month', data)::date as m,
           sum(valor) filter (where tipo = 'entrada' and origem_tipo <> 'transferencia') as e,
           sum(valor) filter (where tipo = 'saida' and origem_tipo <> 'transferencia')   as s,
           sum(case when tipo = 'entrada' then valor else -valor end)                       as liq
    from public.lancamentos_caixa, lim
    where empresa_id = p_empresa and status = 'confirmado' and data >= lim.ini and data <= public.hoje()
    group by 1
  )
  select g::date, coalesce(m.e, 0), coalesce(m.s, 0), coalesce(m.e, 0) - coalesce(m.s, 0),
         (select v from abertura) + sum(coalesce(m.liq, 0)) over (order by g)
  from lim, generate_series(lim.ini, date_trunc('month', public.hoje()), interval '1 month') g
  left join mov m on m.m = g::date
  where public.pode_gerenciar(p_empresa)
  order by g
$$;

-- Projeção: parte do saldo de hoje e soma o que vence.
--   * contas a pagar atrasadas entram como se fossem pagas hoje (conservador)
--   * contas a receber atrasadas NÃO entram (pode ser que não paguem)
create or replace function public.projecao_caixa(p_empresa uuid, p_dias int default 30)
returns table (dia date, entradas numeric, saidas numeric, saldo numeric)
language sql stable security invoker set search_path = public as $$
  with saldo as (
    select coalesce(sum(saldo_atual), 0) as s from public.v_saldo_contas where empresa_id = p_empresa
  ),
  rec as (
    select vencimento as d, sum(valor - valor_recebido) as v
    from public.contas_receber
    where empresa_id = p_empresa and status in ('aberta', 'parcial')
      and vencimento between public.hoje() and public.hoje() + (p_dias - 1)
    group by vencimento
  ),
  pag as (
    select greatest(vencimento, public.hoje()) as d, sum(valor) as v
    from public.contas_pagar
    where empresa_id = p_empresa and status = 'aberta' and vencimento <= public.hoje() + (p_dias - 1)
    group by 1
  )
  select g::date, coalesce(r.v, 0), coalesce(p.v, 0),
         (select s from saldo) + sum(coalesce(r.v, 0) - coalesce(p.v, 0)) over (order by g)
  from generate_series(public.hoje(), public.hoje() + (greatest(p_dias, 1) - 1), interval '1 day') g
  left join rec r on r.d = g::date
  left join pag p on p.d = g::date
  where public.pode_gerenciar(p_empresa)
  order by g
$$;

-- ---------------------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------------------
create view public.v_lancamentos with (security_invoker = true) as
select
  l.*,
  cf.nome  as conta_nome,
  cat.nome as categoria_nome,
  pf.nome  as criado_por_nome
from public.lancamentos_caixa l
join public.contas_financeiras cf on cf.id = l.conta_financeira_id
left join public.categorias cat on cat.id = l.categoria_id
left join public.perfis pf on pf.id = l.created_by;

create view public.v_recorrencias with (security_invoker = true) as
select
  r.*,
  f.nome   as fornecedor_nome,
  cat.nome as categoria_nome,
  (select min(cp.vencimento) from public.contas_pagar cp
   where cp.recorrencia_id = r.id and cp.status = 'aberta') as proximo_vencimento
from public.recorrencias r
left join public.fornecedores f on f.id = r.fornecedor_id
left join public.categorias cat on cat.id = r.categoria_id;

revoke all on public.v_lancamentos, public.v_recorrencias from anon;
grant select on public.v_lancamentos, public.v_recorrencias to authenticated;

-- ---------------------------------------------------------------------
-- Agendamento diário das recorrentes (se a extensão pg_cron estiver ligada)
-- Supabase: Database → Extensions → pg_cron. Sem ela, o app gera ao abrir "Contas a pagar".
-- 09:10 UTC = 06:10 em Brasília.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gerar-contas-recorrentes', '10 9 * * *', 'select public.gerar_recorrentes_todas()');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Demonstração: acrescenta saldos iniciais, contas fixas e uma despesa avulsa
-- ---------------------------------------------------------------------
alter function public.criar_empresa_demonstracao() rename to _demo_base;
revoke execute on function public._demo_base() from public, anon, authenticated;

create or replace function public.criar_empresa_demonstracao()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp   uuid;
  v_inicio date := (date_trunc('month', public.hoje()) - interval '1 month')::date;
  v_cat   jsonb;
  v_caixa uuid;
  v_banco uuid;
  c       record;
begin
  v_emp := public._demo_base();

  update public.contas_financeiras set saldo_inicial = 300 where empresa_id = v_emp and tipo = 'caixa';
  update public.contas_financeiras set saldo_inicial = 2500 where empresa_id = v_emp and tipo = 'banco';
  select id into v_caixa from public.contas_financeiras where empresa_id = v_emp and tipo = 'caixa';
  select id into v_banco from public.contas_financeiras where empresa_id = v_emp and tipo = 'banco';

  select jsonb_object_agg(nome, id) into v_cat from public.categorias where empresa_id = v_emp and tipo = 'despesa';

  insert into public.recorrencias (empresa_id, descricao, categoria_id, valor, dia_vencimento, forma_pagamento, inicio)
  values
    (v_emp, 'Aluguel do galpão',      (v_cat->>'Aluguel')::uuid,             1800.00, 10, 'pix',    v_inicio),
    (v_emp, 'Conta de energia',       (v_cat->>'Energia')::uuid,              420.00, 15, 'boleto', v_inicio),
    (v_emp, 'Internet',               (v_cat->>'Internet e telefone')::uuid,  119.90,  5, 'boleto', v_inicio);

  perform public._gerar_recorrentes(v_emp);

  -- contas do mês passado já pagas
  for c in select id, vencimento from public.contas_pagar
           where empresa_id = v_emp and recorrencia_id is not null and vencimento < date_trunc('month', public.hoje())
  loop
    perform public.pagar_conta(c.id, c.vencimento);
  end loop;

  -- despesa avulsa e um depósito do caixa no banco
  perform public.lancar_caixa(v_emp, 'saida', 150.00, 'Combustível da entrega', v_caixa, public.hoje() - 4,
                              (v_cat->>'Combustível e frete')::uuid, 'dinheiro');
  perform public.transferir_entre_contas(v_emp, v_caixa, v_banco, 100.00, public.hoje() - 1, 'Depósito do caixa no banco');

  return v_emp;
end $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function public._gerar_recorrentes(uuid) from public, anon, authenticated;
revoke execute on function public.gerar_recorrentes_todas() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lancar_contas_pagar(uuid, text, numeric, date, uuid, uuid, public.forma_pagamento, text, text, int, int, text)',
    'public.pagar_conta(uuid, date, uuid, public.forma_pagamento, numeric, numeric)',
    'public.estornar_pagamento(uuid, text)',
    'public.cancelar_conta_pagar(uuid, text)',
    'public.gerar_recorrentes(uuid)',
    'public.lancar_caixa(uuid, public.tipo_lancamento, numeric, text, uuid, date, uuid, public.forma_pagamento)',
    'public.transferir_entre_contas(uuid, uuid, uuid, numeric, date, text)',
    'public.cancelar_lancamento(uuid, text)',
    'public.fluxo_diario(uuid, date, date)',
    'public.fluxo_mensal(uuid, int)',
    'public.projecao_caixa(uuid, int)',
    'public.criar_empresa_demonstracao()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
