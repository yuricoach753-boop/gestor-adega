-- Testes: 2ª rodada do QA (custo ao cancelar compra, unidade inteira, limite, vencimento do fiado, caixa esquecido, nomes)
\set ON_ERROR_STOP 1
\set QUIET 1
create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
 ('a11a11a1-0000-0000-0000-000000000001', 'dono@f11.com', '{"nome":"Dono F11"}'),
 ('b11b11b1-0000-0000-0000-000000000002', 'func@f11.com', '{"nome":"Func F11"}');
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a11a11a1-0000-0000-0000-000000000001');
select criar_empresa('Empresa F11') as e \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'Cerveja cx', 'cx', 30, 40, 10) returning id as p \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'Gelo', 'kg', 1, 2.5, 50) returning id as g \gset
insert into clientes (empresa_id, nome) values (:'e', 'Cliente F11') returning id as cli \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset

-- 1. custo volta ao cancelar a compra
select registrar_compra(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 2, 'custo_unitario', 35))) as c1 \gset
select registrar_compra(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 2, 'custo_unitario', 99))) as c2 \gset
select cancelar_compra(:'c2');
insert into r(teste, ok, detalhe) select 'cancelar a última compra volta o custo anterior', (select preco_custo from v_produtos where id = :'p') = 35, (select preco_custo::text from v_produtos where id = :'p');
select cancelar_compra(:'c1');
insert into r(teste, ok, detalhe) select 'cancelar a outra volta ao custo do cadastro', (select preco_custo from v_produtos where id = :'p') = 30, (select preco_custo::text from v_produtos where id = :'p');
select registrar_compra(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1, 'custo_unitario', 31))) as c3 \gset
select registrar_compra(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1, 'custo_unitario', 33))) as c4 \gset
select cancelar_compra(:'c3');
insert into r(teste, ok) select 'cancelar compra antiga não mexe no custo da mais nova', (select preco_custo from v_produtos where id = :'p') = 33;

-- 2. unidade inteira e limite
select abrir_caixa(:'e', 0) \gset
insert into r(teste, ok, detalhe) select 'caixa não aceita 1,5 na venda',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1.5)), jsonb_build_array(jsonb_build_object('forma','pix','valor',60)))$$, :'e', :'p')) like '%use um número inteiro%', null;
insert into r(teste, ok, detalhe) select 'kg aceita 1,5 na venda',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1.5)), jsonb_build_array(jsonb_build_object('forma','pix','valor',3.75)))$$, :'e', :'g')) is null, null;
insert into r(teste, ok, detalhe) select 'compra de caixa com fração recusada',
  pg_temp.erro(format($$select registrar_compra(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 2.5, 'custo_unitario', 30)))$$, :'e', :'p')) like '%use um número inteiro%', null;
insert into r(teste, ok, detalhe) select 'perda de 0,5 cx recusada',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'perda', 0.5)$$, :'p')) like '%use um número inteiro%', null;
insert into r(teste, ok, detalhe) select 'contagem de 7,5 cx recusada',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'ajuste', 7.5)$$, :'p')) like '%use um número inteiro%', null;
insert into r(teste, ok, detalhe) select 'cadastro com estoque 2,5 cx recusado',
  pg_temp.erro(format($$insert into produtos (empresa_id, nome, unidade, preco_venda, estoque_atual) values (%L, 'X', 'cx', 1, 2.5)$$, :'e')) like '%use um número inteiro%', null;
insert into r(teste, ok, detalhe) select 'venda de 10.000 itens recusada',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 10000)), jsonb_build_array(jsonb_build_object('forma','pix','valor',400000)))$$, :'e', :'p')) like 'Quantidade muito alta%', null;

-- 3. vencimento do fiado
insert into r(teste, ok, detalhe) select 'fiado com vencimento antes da venda recusado',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','a_prazo','valor',40,'primeiro_vencimento', hoje() - 1)), p_cliente => %L)$$, :'e', :'p', :'cli')) like 'O vencimento do fiado%', null;
insert into r(teste, ok, detalhe) select 'fiado vencendo hoje passa',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','a_prazo','valor',40,'primeiro_vencimento', hoje())), p_cliente => %L)$$, :'e', :'p', :'cli')) is null, null;

-- 5. nomes
insert into r(teste, ok, detalhe) select 'nome com mais de 120 letras recusado',
  pg_temp.erro(format($$insert into produtos (empresa_id, nome, preco_venda) values (%L, repeat('A', 121), 1)$$, :'e')) like '%produtos_nome_tamanho%', null;
reset role;

-- 4. caixa esquecido aberto de ontem: o funcionário pode fechar
update caixa_turnos set aberto_em = now() - interval '1 day' where empresa_id = :'e' and status = 'aberto';
select pg_temp.como('b11b11b1-0000-0000-0000-000000000002');
select aceitar_convite(:'tok') \gset
insert into r(teste, ok, detalhe) select 'funcionário fecha caixa do dono esquecido desde ontem',
  pg_temp.erro(format($$select fechar_caixa(%L, 0)$$, (select id from caixa_turnos where empresa_id = :'e' and status = 'aberto'))) is null, null;
select abrir_caixa(:'e', 0) as t2 \gset
reset role;
select pg_temp.como('a11a11a1-0000-0000-0000-000000000001');
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('c11c11c1-0000-0000-0000-000000000003', 'f2@f11.com', '{"nome":"F2"}');
insert into membros_empresa (empresa_id, usuario_id, papel) values (:'e', 'c11c11c1-0000-0000-0000-000000000003', 'funcionario');
select pg_temp.como('c11c11c1-0000-0000-0000-000000000003');
insert into r(teste, ok, detalhe) select 'caixa de hoje de outra pessoa continua protegido',
  pg_temp.erro(format($$select fechar_caixa(%L, 0)$$, :'t2')) like 'Só quem abriu%', null;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
