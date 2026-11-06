-- Testes: fechamento do mês
\set ON_ERROR_STOP 1
\set QUIET 1
create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
 ('a13a13a1-0000-0000-0000-000000000001', 'dono@f13.com', '{"nome":"Dono F13"}'),
 ('b13b13b1-0000-0000-0000-000000000002', 'f@f13.com', '{"nome":"F"}');
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a13a13a1-0000-0000-0000-000000000001');
select criar_empresa('Empresa F13') as e \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'Cerveja', 'cx', 30, 40, 100) returning id as p \gset
insert into clientes (empresa_id, nome) values (:'e', 'Cliente F13') returning id as cli \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset
select abrir_caixa(:'e', 0) \gset
-- 2 cx no Pix com 5 de desconto (75), 1 cx em dinheiro (40), 1 cx fiado (40), 1 venda cancelada (40)
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 2)), jsonb_build_array(jsonb_build_object('forma','pix','valor',75)), p_desconto => 5) \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','dinheiro','valor',40))) \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','a_prazo','valor',40,'primeiro_vencimento', hoje() + 30)), p_cliente => :'cli') \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','pix','valor',40))) as vc \gset
select cancelar_venda(:'vc', 'teste');
select relatorio_fechamento_mes(:'e', hoje()) as f \gset
insert into r(teste, ok, detalhe) select 'faturamento = vendas não canceladas com desconto (155)', (:'f'::jsonb #>> '{vendas,liquido}')::numeric = 155, :'f'::jsonb #>> '{vendas}';
insert into r(teste, ok) select 'bruto 160 e desconto 5', (:'f'::jsonb #>> '{vendas,bruto}')::numeric = 160 and (:'f'::jsonb #>> '{vendas,descontos}')::numeric = 5;
insert into r(teste, ok) select 'custo 120 e lucro bruto 35', (:'f'::jsonb #>> '{vendas,custo}')::numeric = 120 and (:'f'::jsonb #>> '{vendas,lucro_bruto}')::numeric = 35;
insert into r(teste, ok) select 'cancelada contada à parte', (:'f'::jsonb #>> '{vendas,canceladas_qtd}')::int = 1 and (:'f'::jsonb #>> '{vendas,canceladas_total}')::numeric = 40;
insert into r(teste, ok) select 'sem nota = tudo (nenhuma NF emitida)', (:'f'::jsonb #>> '{vendas,sem_nota}')::numeric = 155 and (:'f'::jsonb #>> '{vendas,com_nota}')::numeric = 0;
insert into r(teste, ok, detalhe) select 'formas somam o faturamento', (select sum((x->>'total')::numeric) from jsonb_array_elements(:'f'::jsonb->'formas') x) = 155, :'f'::jsonb ->> 'formas';
insert into r(teste, ok) select 'fiado em aberto 40', (:'f'::jsonb ->> 'fiado_em_aberto')::numeric = 40;
insert into r(teste, ok) select 'acumulado do ano inclui o mês', (:'f'::jsonb ->> 'receita_ano')::numeric >= 155;
insert into r(teste, ok, detalhe) select 'mês futuro recusado', pg_temp.erro(format($$select relatorio_fechamento_mes(%L, hoje() + 40)$$, :'e')) like 'Escolha um mês%', null;
reset role;
select pg_temp.como('b13b13b1-0000-0000-0000-000000000002');
select aceitar_convite(:'tok') \gset
insert into r(teste, ok, detalhe) select 'funcionário não vê o fechamento', pg_temp.erro(format($$select relatorio_fechamento_mes(%L, hoje())$$, :'e')) like 'Somente o dono%', null;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
