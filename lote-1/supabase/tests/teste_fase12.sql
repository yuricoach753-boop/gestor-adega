-- Testes: 3ª rodada do QA (limite do plano, dinheiro negativo, conta de dinheiro, datas antigas, troca de senha)
\set ON_ERROR_STOP 1
\set QUIET 1
create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
 ('a12a12a1-0000-0000-0000-000000000001', 'dono@f12.com', '{"nome":"Dono F12"}'),
 ('b12b12b1-0000-0000-0000-000000000002', 'f1@f12.com', '{"nome":"F1"}'),
 ('c12c12c1-0000-0000-0000-000000000003', 'f2@f12.com', '{"nome":"F2"}');
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a12a12a1-0000-0000-0000-000000000001');
select criar_empresa('Empresa F12') as e \gset
select id as caixa from contas_financeiras where empresa_id = :'e' and tipo = 'caixa' \gset
select id as banco from contas_financeiras where empresa_id = :'e' and tipo = 'banco' \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as t1 \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as t2 \gset
reset role;

-- 1. limite do plano (2 usuários)
insert into planos (nome, valor_mensal, limite_usuarios) values ('Dois', 50, 2) returning id as plano \gset
update empresas set plano_id = :'plano' where id = :'e';
select pg_temp.como('b12b12b1-0000-0000-0000-000000000002'); select aceitar_convite(:'t1') \gset
reset role;
select pg_temp.como('a12a12a1-0000-0000-0000-000000000001');
update membros_empresa set ativo = false where usuario_id = 'b12b12b1-0000-0000-0000-000000000002';
reset role;
select pg_temp.como('c12c12c1-0000-0000-0000-000000000003'); select aceitar_convite(:'t2') \gset
reset role;
select pg_temp.como('a12a12a1-0000-0000-0000-000000000001');
insert into r(teste, ok, detalhe) select 'devolver acesso acima do limite do plano é recusado',
  pg_temp.erro($$update membros_empresa set ativo = true where usuario_id = 'b12b12b1-0000-0000-0000-000000000002'$$) like 'O plano desta empresa permite até 2%', null;

-- 2. dinheiro não fica negativo
select lancar_caixa(:'e', 'entrada', 100, 'Troco inicial', :'caixa') \gset
insert into r(teste, ok, detalhe) select 'saída maior que o dinheiro do caixa é recusada',
  pg_temp.erro(format($$select lancar_caixa(%L, 'saida', 100.01, 'Teste', %L)$$, :'e', :'caixa')) like 'Não tem esse dinheiro%', pg_temp.erro(format($$select lancar_caixa(%L, 'saida', 100.01, 'Teste', %L)$$, :'e', :'caixa'));
insert into r(teste, ok, detalhe) select 'transferir do caixa mais do que tem é recusado',
  pg_temp.erro(format($$select transferir_entre_contas(%L, %L, %L, 500)$$, :'e', :'caixa', :'banco')) like 'Não tem esse dinheiro%', null;
insert into r(teste, ok, detalhe) select 'saída igual ao saldo passa',
  pg_temp.erro(format($$select lancar_caixa(%L, 'saida', 100, 'Sangria', %L)$$, :'e', :'caixa')) is null, null;
insert into r(teste, ok, detalhe) select 'banco pode ficar negativo (cheque especial)',
  pg_temp.erro(format($$select lancar_caixa(%L, 'saida', 50, 'Tarifa', %L)$$, :'e', :'banco')) is null, null;

-- 3. conta de dinheiro
insert into r(teste, ok, detalhe) select 'não desativa a única conta de dinheiro',
  pg_temp.erro(format($$update contas_financeiras set ativo = false where id = %L$$, :'caixa')) like 'Esta é a única conta de dinheiro%', null;
insert into r(teste, ok, detalhe) select 'não desativa conta com saldo',
  pg_temp.erro(format($$update contas_financeiras set ativo = false where id = %L$$, :'banco')) like '%ainda tem saldo%', null;

-- 4. datas antigas
insert into r(teste, ok, detalhe) select 'lançamento de mais de 60 dias atrás recusado',
  pg_temp.erro(format($$select lancar_caixa(%L, 'entrada', 1, 'Teste', %L, hoje() - 61)$$, :'e', :'caixa')) like 'A data não pode ser de mais de 60 dias%', pg_temp.erro(format($$select lancar_caixa(%L, 'entrada', 1, 'Teste', %L, hoje() - 61)$$, :'e', :'caixa'));
insert into r(teste, ok, detalhe) select 'lançamento de 60 dias atrás passa',
  pg_temp.erro(format($$select lancar_caixa(%L, 'entrada', 1, 'Teste', %L, hoje() - 60)$$, :'e', :'caixa')) is null, pg_temp.erro(format($$select lancar_caixa(%L, 'entrada', 1, 'Teste', %L, hoje() - 60)$$, :'e', :'caixa'));
insert into r(teste, ok, detalhe) select 'conta a receber vencida há mais de 1 ano recusada',
  pg_temp.erro(format($$select lancar_contas_receber(%L, 'Antiga', 10, hoje() - 400)$$, :'e')) like 'O vencimento não pode ser de mais de 1 ano%', null;
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'P12', 'un', 1, 2, 10) returning id as p \gset
insert into r(teste, ok, detalhe) select 'venda de mais de 60 dias atrás recusada',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','pix','valor',2)), p_data => hoje() - 90)$$, :'e', :'p')) like 'A data da venda não pode ser de mais de 60 dias%', null;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
