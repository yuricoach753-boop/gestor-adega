-- =====================================================================
-- Correções do QA de 12/10/2026
--  1. Busca sem acento ("agua" acha "Água") em produtos, clientes, fornecedores e vendas
--  2. Perda / uso interno não pode tirar mais do que tem no estoque
--  3. Caixa: lançamento com data passada (ex.: venda de ontem lançada hoje) não entra
--     no "deveria ter na gaveta" do turno aberto
--  4. Fornecedores: só o dono vê (o funcionário não usa essa parte)
-- =====================================================================

-- ---------- 1. Busca sem acento
create or replace function public.sem_acento(t text)
returns text language sql immutable parallel safe set search_path = public as $$
  select translate(lower(coalesce(t, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy')
$$;

alter table public.produtos     add column if not exists nome_busca text generated always as (public.sem_acento(nome)) stored;
alter table public.clientes     add column if not exists nome_busca text generated always as (public.sem_acento(nome)) stored;
alter table public.fornecedores add column if not exists nome_busca text generated always as (public.sem_acento(nome)) stored;
-- produtos usa permissão por coluna (o custo fica escondido): libera a nova coluna
grant select (nome_busca) on public.produtos to authenticated;

create or replace view public.v_produtos with (security_barrier = true) as
 SELECT p.id,
    p.empresa_id,
    p.codigo,
    p.codigo_barras,
    p.nome,
    p.categoria_id,
    c.nome AS categoria_nome,
    p.unidade,
        CASE
            WHEN pode_gerenciar(p.empresa_id) THEN p.preco_custo
            ELSE NULL::numeric
        END AS preco_custo,
    p.preco_venda,
        CASE
            WHEN pode_gerenciar(p.empresa_id) THEN p.margem_percentual
            ELSE NULL::numeric
        END AS margem_percentual,
    p.estoque_atual,
    p.estoque_minimo,
    ((p.estoque_minimo > (0)::numeric) AND (p.estoque_atual <= p.estoque_minimo)) AS estoque_baixo,
    p.observacoes,
    p.ativo,
    p.created_at,
    p.updated_at,
    p.nome_busca
   FROM (produtos p
     LEFT JOIN categorias c ON ((c.id = p.categoria_id)))
  WHERE pode_acessar(p.empresa_id);

create or replace view public.v_clientes_resumo with (security_invoker = true) as
 SELECT c.id,
    c.empresa_id,
    c.nome,
    c.telefone,
    c.cpf_cnpj,
    c.cep,
    c.logradouro,
    c.numero,
    c.complemento,
    c.bairro,
    c.cidade,
    c.uf,
    c.observacoes,
    c.ativo,
    c.created_at,
    c.created_by,
    c.updated_at,
    COALESCE(v.total_comprado, (0)::numeric) AS total_comprado,
    COALESCE(v.qtd_compras, (0)::bigint) AS qtd_compras,
    v.ultima_compra,
        CASE
            WHEN pode_gerenciar(c.empresa_id) THEN COALESCE(r.valor_devido, (0)::numeric)
            ELSE NULL::numeric
        END AS valor_devido,
    c.nome_busca
   FROM ((clientes c
     LEFT JOIN LATERAL ( SELECT sum(vd.total) AS total_comprado,
            count(*) AS qtd_compras,
            max(vd.data_venda) AS ultima_compra
           FROM vendas vd
          WHERE ((vd.cliente_id = c.id) AND (vd.status <> 'cancelado'::status_venda))) v ON (true))
     LEFT JOIN LATERAL ( SELECT sum((cr.valor - cr.valor_recebido)) AS valor_devido
           FROM contas_receber cr
          WHERE ((cr.cliente_id = c.id) AND (cr.status = ANY (ARRAY['aberta'::status_conta_receber, 'parcial'::status_conta_receber])))) r ON (true));

create or replace view public.v_fornecedores_resumo with (security_invoker = true) as
 SELECT f.id,
    f.empresa_id,
    f.nome,
    f.contato_nome,
    f.telefone,
    f.cpf_cnpj,
    f.cep,
    f.logradouro,
    f.numero,
    f.complemento,
    f.bairro,
    f.cidade,
    f.uf,
    f.observacoes,
    f.ativo,
    f.created_at,
    f.created_by,
    f.updated_at,
    COALESCE(cp.total_comprado, (0)::numeric) AS total_comprado,
    cp.ultima_compra,
    COALESCE(pg.valor_em_aberto, (0)::numeric) AS valor_em_aberto,
    f.nome_busca
   FROM ((fornecedores f
     LEFT JOIN LATERAL ( SELECT sum(co.valor_total) AS total_comprado,
            max(co.data_compra) AS ultima_compra
           FROM compras co
          WHERE ((co.fornecedor_id = f.id) AND (co.status = 'registrada'::status_compra))) cp ON (true))
     LEFT JOIN LATERAL ( SELECT sum(p.valor) AS valor_em_aberto
           FROM contas_pagar p
          WHERE ((p.fornecedor_id = f.id) AND (p.status = 'aberta'::status_conta_pagar))) pg ON (true));

create or replace view public.v_vendas with (security_invoker = true) as
 SELECT v.id,
    v.empresa_id,
    v.numero,
    v.cliente_id,
    v.data_venda,
    v.status,
    v.subtotal,
    v.desconto,
    v.total,
    v.observacoes,
    v.vendedor_id,
    v.separado_em,
    v.entregue_em,
    v.cancelado_em,
    v.cancelado_por,
    v.motivo_cancelamento,
    v.created_at,
    c.nome AS cliente_nome,
    c.telefone AS cliente_telefone,
    pf.nome AS vendedor_nome,
    ( SELECT count(*) AS count
           FROM venda_itens i
          WHERE (i.venda_id = v.id)) AS qtd_itens,
    ( SELECT string_agg(DISTINCT (vp.forma)::text, ','::text) AS string_agg
           FROM venda_pagamentos vp
          WHERE (vp.venda_id = v.id)) AS formas,
    ((v.data_venda AT TIME ZONE 'America/Sao_Paulo'::text))::date AS dia,
    c.nome_busca AS cliente_busca
   FROM ((vendas v
     LEFT JOIN clientes c ON ((c.id = v.cliente_id)))
     LEFT JOIN perfis pf ON ((pf.id = v.vendedor_id)));

-- ---------- 2. Perda / uso interno limitada ao estoque
create or replace function public.lancar_movimentacao(
  p_produto     uuid,
  p_tipo        public.tipo_mov_estoque,
  p_quantidade  numeric,
  p_observacao  text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
  v_atual   numeric(14,3);
  v_qtd     numeric(14,3);
  v_id      uuid;
begin
  select empresa_id, estoque_atual into v_empresa, v_atual
  from public.produtos where id = p_produto
  for update;

  if not found or not public.pode_acessar(v_empresa) then
    raise exception 'Produto não encontrado.';
  end if;
  if p_quantidade is null then
    raise exception 'Informe a quantidade.';
  end if;

  if p_tipo in ('perda', 'uso_interno') then
    if p_quantidade <= 0 then
      raise exception 'Informe uma quantidade maior que zero.';
    end if;
    if p_quantidade > greatest(v_atual, 0) then
      raise exception 'A saída (%) é maior que o estoque (%). Se o estoque está errado, use "Ajuste de contagem".',
        replace(rtrim(to_char(p_quantidade, 'FM999999990.999'), '.'), '.', ','),
        replace(rtrim(to_char(v_atual, 'FM999999990.999'), '.'), '.', ',');
    end if;
    v_qtd := -p_quantidade;
  elsif p_tipo = 'ajuste' then
    if p_quantidade < 0 then
      raise exception 'A contagem não pode ser negativa.';
    end if;
    v_qtd := p_quantidade - v_atual;
    if v_qtd = 0 then
      raise exception 'O estoque já está com essa quantidade.';
    end if;
  else
    raise exception 'Para dar entrada de mercadoria, use "Registrar compra".';
  end if;

  insert into public.movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, origem_tipo, observacao)
  values (v_empresa, p_produto, p_tipo, v_qtd, 'manual', nullif(trim(p_observacao), ''))
  returning id into v_id;

  return v_id;
end $$;

-- ---------- 3. Caixa: só conta o que tem data a partir do dia em que o turno abriu
create or replace function public._caixa_esperado(p_turno uuid, p_ate timestamptz)
returns numeric language sql stable security definer set search_path = public as $$
  with t as (select * from public.caixa_turnos where id = p_turno),
  l as (
    select l.* from public.lancamentos_caixa l
    join public.contas_financeiras c on c.id = l.conta_financeira_id and c.tipo = 'caixa'
    join t on t.empresa_id = l.empresa_id
  )
  select (select valor_abertura from t)
    + coalesce((select sum(case when tipo = 'entrada' then valor else -valor end) from l, t
                where l.created_at >= t.aberto_em and l.created_at < p_ate
                  and l.data >= (t.aberto_em at time zone 'America/Sao_Paulo')::date
                  and (l.status = 'confirmado' or l.cancelado_em >= p_ate)), 0)
    - coalesce((select sum(case when tipo = 'entrada' then valor else -valor end) from l, t
                where l.created_at < t.aberto_em
                  and l.status <> 'confirmado' and l.cancelado_em >= t.aberto_em and l.cancelado_em < p_ate), 0);
$$;
revoke execute on function public._caixa_esperado(uuid, timestamptz) from public, anon, authenticated;

-- ---------- 4. Fornecedores: só quem gerencia (dono)
drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores for select using (public.pode_gerenciar(empresa_id));
drop policy if exists fornecedores_update on public.fornecedores;
create policy fornecedores_update on public.fornecedores for update
  using (public.pode_gerenciar(empresa_id)) with check (public.pode_gerenciar(empresa_id));
drop policy if exists fornecedores_insert on public.fornecedores;
create policy fornecedores_insert on public.fornecedores for insert with check (public.pode_gerenciar(empresa_id));
