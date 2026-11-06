-- Testes: correções do QA (busca sem acento, perda limitada ao estoque, caixa x data passada, fornecedores)
\set ON_ERROR_STOP 1
\set QUIET 1
create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('a10a10a1-0000-0000-0000-000000000001', 'dono@f10.com', '{"nome":"Dono F10"}'),
 ('b10b10b1-0000-0000-0000-000000000002', 'func@f10.com', '{"nome":"Func F10"}');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a10a10a1-0000-0000-0000-000000000001');
select criar_empresa('Empresa F10') as e \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'Água Mineral', 'kg', 1, 3, 3.5) returning id as p \gset
insert into clientes (empresa_id, nome) values (:'e', 'José Conceição');
insert into fornecedores (empresa_id, nome) values (:'e', 'Fornecedor Único');
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset

-- 1. busca sem acento
insert into r(teste, ok) select 'produto: "agua" acha "Água Mineral"', exists (select 1 from v_produtos where empresa_id = :'e' and nome_busca like '%agua%');
insert into r(teste, ok) select 'cliente: "jose conceicao" acha', exists (select 1 from v_clientes_resumo where empresa_id = :'e' and nome_busca like '%jose conceicao%');
insert into r(teste, ok) select 'fornecedor: "unico" acha', exists (select 1 from v_fornecedores_resumo where empresa_id = :'e' and nome_busca like '%unico%');

-- 2. perda maior que o estoque
insert into r(teste, ok, detalhe) select 'perda maior que o estoque é recusada',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'perda', 10)$$, :'p')) like 'A saída (10) é maior que o estoque (3,5)%',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'perda', 10)$$, :'p'));
insert into r(teste, ok, detalhe) select 'perda igual ao estoque passa',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'perda', 3.5)$$, :'p')) is null, null;
insert into r(teste, ok) select 'estoque zerado', (select estoque_atual from produtos where id = :'p') = 0;
insert into r(teste, ok, detalhe) select 'ajuste continua livre',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'ajuste', 20)$$, :'p')) is null, null;

-- 3. caixa: venda de ontem em dinheiro não entra no esperado do turno de hoje
select abrir_caixa(:'e', 100) as turno \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)),
  jsonb_build_array(jsonb_build_object('forma','dinheiro','valor',3)), p_data => hoje() - 1) \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 2)),
  jsonb_build_array(jsonb_build_object('forma','dinheiro','valor',6))) \gset
insert into r(teste, ok, detalhe) select 'esperado ignora venda de data passada (100 + 6)',
  (caixa_atual(:'e')->>'esperado_agora')::numeric = 106, caixa_atual(:'e')::text;
reset role;

-- 4. fornecedores só para o dono
select pg_temp.como('b10b10b1-0000-0000-0000-000000000002');
select aceitar_convite(:'tok') \gset
insert into r(teste, ok) select 'funcionário não vê fornecedores', (select count(*) from fornecedores) = 0;
insert into r(teste, ok) select 'funcionário continua vendo clientes (para escolher na venda)', (select count(*) from clientes) = 1;
insert into r(teste, ok) select 'funcionário busca produto sem acento', exists (select 1 from v_produtos where nome_busca like '%agua%');
insert into r(teste, ok, detalhe) select 'funcionário não cadastra fornecedor',
  pg_temp.erro(format($$insert into fornecedores (empresa_id, nome) values (%L, 'X')$$, :'e')) is not null, null;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
