-- Testes: funcionário só balcão (não vê faturamento)
\set ON_ERROR_STOP 1
\set QUIET 1

create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('a7a7a7a7-0000-0000-0000-000000000001', 'dono@f7.com', '{"nome":"Dono F7"}'),
 ('b7b7b7b7-0000-0000-0000-000000000002', 'func@f7.com', '{"nome":"Func F7"}'),
 ('c7c7c7c7-0000-0000-0000-000000000003', 'func2@f7.com', '{"nome":"Func2 F7"}');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

-- ---------- Dono prepara e vende
select pg_temp.como('a7a7a7a7-0000-0000-0000-000000000001');
select criar_empresa('Empresa F7') as e \gset
select abrir_caixa(:'e', 0) \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'Mansão Maromba', 'un', 9.5, 15, 50) returning id as p \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok2 \gset
-- venda do dono, entregue, hoje
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 4)),
  jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', 60))) as v_dono \gset
-- venda do dono de ontem
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)),
  jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', 15)), p_data => hoje() - 1) as v_ontem \gset
-- pedido do dono ainda não entregue
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 2)),
  jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', 30)), p_entregue => false) as v_pedido \gset
reset role;

-- ---------- Funcionário 1 vende
select pg_temp.como('b7b7b7b7-0000-0000-0000-000000000002');
select aceitar_convite(:'tok') \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)),
  jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor', 15))) as v_f1 \gset

insert into r(teste, ok, detalhe) select 'funcionário vê a própria venda de hoje',
  exists (select 1 from v_vendas where id = :'v_f1'), null;
insert into r(teste, ok) select 'funcionário NÃO vê venda entregue do dono', not exists (select 1 from vendas where id = :'v_dono');
insert into r(teste, ok) select 'funcionário NÃO vê venda de ontem', not exists (select 1 from v_vendas where id = :'v_ontem');
insert into r(teste, ok) select 'funcionário vê pedido pendente do dono (para separar)', exists (select 1 from v_vendas where id = :'v_pedido');
insert into r(teste, ok) select 'itens só das vendas visíveis', (select count(*) from venda_itens) = 2;
insert into r(teste, ok) select 'pagamentos só das vendas visíveis', (select count(*) from venda_pagamentos) = 2;
insert into r(teste, ok, detalhe) select 'soma que o funcionário consegue fazer não é o faturamento',
  (select coalesce(sum(total), 0) from vendas) = 45, (select sum(total)::text from vendas);
insert into r(teste, ok, detalhe) select 'painel do funcionário sem valores de venda',
  (select not (p ? 'vendas_hoje') and not (p ? 'vendas_mes') and not (p ? 'saldo_caixa') and (p->>'minhas_vendas_hoje')::int = 1
     and (p->>'pedidos_pendentes')::int = 1
   from (select painel_resumo(:'e') p) x),
  (select painel_resumo(:'e')::text);
insert into r(teste, ok, detalhe) select 'funcionário não chama a função base do painel',
  pg_temp.erro(format($$select _painel_resumo_base(%L)$$, :'e')) like '%permission denied%', null;
insert into r(teste, ok, detalhe) select 'resumo de cliente não soma vendas escondidas',
  coalesce((select sum(total_comprado) from v_clientes_resumo), 0) = 0, null;
-- marca o pedido do dono como entregue: some da lista dele
select mudar_status_venda(:'v_pedido', 'separado');
insert into r(teste, ok) select 'funcionário separa pedido de outro', (select status from v_vendas where id = :'v_pedido') = 'separado';
select mudar_status_venda(:'v_pedido', 'entregue');
insert into r(teste, ok) select 'pedido entregue some para o funcionário', not exists (select 1 from v_vendas where id = :'v_pedido');
-- cancela a própria venda do dia
select cancelar_venda(:'v_f1', 'Cliente desistiu');
insert into r(teste, ok) select 'funcionário cancela a própria venda e ainda a vê', (select status from v_vendas where id = :'v_f1') = 'cancelado';
reset role;

-- ---------- Funcionário 2 não vê a venda do funcionário 1
select pg_temp.como('c7c7c7c7-0000-0000-0000-000000000003');
select aceitar_convite(:'tok2') \gset
insert into r(teste, ok) select 'funcionário 2 não vê venda do funcionário 1', not exists (select 1 from vendas where id = :'v_f1');
insert into r(teste, ok) select 'funcionário 2 não vê nenhuma venda entregue', (select count(*) from vendas) = 0;
reset role;

-- ---------- Dono continua vendo tudo
select pg_temp.como('a7a7a7a7-0000-0000-0000-000000000001');
insert into r(teste, ok, detalhe) select 'dono vê todas as vendas', (select count(*) from vendas where empresa_id = :'e') = 4,
  (select count(*)::text from vendas where empresa_id = :'e');
insert into r(teste, ok) select 'painel do dono mantém totais',
  (select (p ? 'vendas_hoje') and (p ? 'vendas_mes') and (p ? 'saldo_caixa') from (select painel_resumo(:'e') p) x);
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
