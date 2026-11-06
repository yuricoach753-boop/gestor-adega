-- Testes: abertura e fechamento de caixa (turnos)
\set ON_ERROR_STOP 1
\set QUIET 1
create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('a9a9a9a9-0000-0000-0000-000000000001', 'dono@f9.com', '{"nome":"Dono F9"}'),
 ('b9b9b9b9-0000-0000-0000-000000000002', 'joao@f9.com', '{"nome":"João"}'),
 ('c9c9c9c9-0000-0000-0000-000000000003', 'maria@f9.com', '{"nome":"Maria"}');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a9a9a9a9-0000-0000-0000-000000000001');
select criar_empresa('Empresa F9') as e \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'Refri', 'un', 5, 10, 100) returning id as p \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as t1 \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as t2 \gset
reset role;

-- ---------- João abre o caixa
select pg_temp.como('b9b9b9b9-0000-0000-0000-000000000002');
select aceitar_convite(:'t1') \gset
insert into r(teste, ok, detalhe) select 'não vende com caixa fechado',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','dinheiro','valor',10)))$$, :'e', :'p')) like 'O caixa está fechado%', null;
insert into r(teste, ok) select 'caixa_atual diz fechado', (caixa_atual(:'e')->>'aberto')::boolean = false;
insert into r(teste, ok, detalhe) select 'abertura com valor negativo recusada',
  pg_temp.erro(format($$select abrir_caixa(%L, -1)$$, :'e')) like 'Informe quanto tem%', null;
select abrir_caixa(:'e', 100) as turno1 \gset
insert into r(teste, ok) select 'caixa aberto em nome do João',
  (select caixa_atual(:'e')->>'aberto_por_nome') = 'João' and (caixa_atual(:'e')->>'sou_eu')::boolean;
insert into r(teste, ok) select 'funcionário não recebe esperado parcial', not (caixa_atual(:'e') ? 'esperado_agora');
-- vendas: 3 em dinheiro (10 cada) e 1 no Pix
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','dinheiro','valor',10))) as v1 \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','dinheiro','valor',10))) as v2 \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','dinheiro','valor',10))) as v3 \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','pix','valor',10))) as v4 \gset
insert into r(teste, ok) select 'venda ligada ao turno', (select count(*) from vendas where turno_id = :'turno1') = 4;
select cancelar_venda(:'v3', 'desistiu');
reset role;

-- ---------- Maria não abre outro caixa nem fecha o do João
select pg_temp.como('c9c9c9c9-0000-0000-0000-000000000003');
select aceitar_convite(:'t2') \gset
insert into r(teste, ok, detalhe) select 'não abre dois caixas ao mesmo tempo',
  pg_temp.erro(format($$select abrir_caixa(%L, 50)$$, :'e')) like 'O caixa já está aberto por João%', null;
insert into r(teste, ok, detalhe) select 'outro funcionário não fecha o caixa do João',
  pg_temp.erro(format($$select fechar_caixa(%L, 120)$$, :'turno1')) like 'Só quem abriu%', null;
-- mas vende no caixa aberto (mesmo balcão)
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p', 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','dinheiro','valor',10))) as v5 \gset
reset role;

-- ---------- Dono vê o esperado parcial e tira R$ 15 (sangria) do caixa
select pg_temp.como('a9a9a9a9-0000-0000-0000-000000000001');
insert into r(teste, ok, detalhe) select 'dono vê esperado parcial (100 + 3 vendas em dinheiro)',
  (caixa_atual(:'e')->>'esperado_agora')::numeric = 130, caixa_atual(:'e')::text;
insert into lancamentos_caixa (empresa_id, conta_financeira_id, tipo, valor, descricao)
select :'e', id, 'saida', 15, 'Sangria' from contas_financeiras where empresa_id = :'e' and tipo = 'caixa';
reset role;

-- ---------- João fecha: contou 112 (esperado 115 → faltou 3)
select pg_temp.como('b9b9b9b9-0000-0000-0000-000000000002');
select fechar_caixa(:'turno1', 112) as fech \gset
insert into r(teste, ok, detalhe) select 'fechamento calcula esperado e diferença',
  (:'fech'::jsonb->>'valor_esperado')::numeric = 115 and (:'fech'::jsonb->>'diferenca')::numeric = -3
  and (:'fech'::jsonb->>'vendas')::int = 4, :'fech';
insert into r(teste, ok, detalhe) select 'não fecha duas vezes',
  pg_temp.erro(format($$select fechar_caixa(%L, 112)$$, :'turno1')) like 'Este caixa já foi fechado%', null;
insert into r(teste, ok) select 'caixa_atual sugere o último valor contado', (caixa_atual(:'e')->>'ultimo_contado')::numeric = 112;
insert into r(teste, ok) select 'João vê o próprio turno fechado', (select count(*) from v_caixa_turnos) = 1;
reset role;

-- ---------- Maria abre o próximo turno; venda antiga cancelada durante o turno sai da gaveta
select pg_temp.como('c9c9c9c9-0000-0000-0000-000000000003');
select abrir_caixa(:'e', 112) as turno2 \gset
insert into r(teste, ok) select 'turno 2 numerado', (select numero from caixa_turnos where id = :'turno2') = 2;
insert into r(teste, ok) select 'Maria não vê o turno fechado do João', (select count(*) from v_caixa_turnos) = 1;
select cancelar_venda(:'v5', 'devolução');
select fechar_caixa(:'turno2', 102) as fech2 \gset
insert into r(teste, ok, detalhe) select 'devolução de venda do turno anterior entra no esperado (112 − 10)',
  (:'fech2'::jsonb->>'valor_esperado')::numeric = 102 and (:'fech2'::jsonb->>'diferenca')::numeric = 0, :'fech2';
reset role;

-- ---------- Dono
select pg_temp.como('a9a9a9a9-0000-0000-0000-000000000001');
insert into r(teste, ok) select 'dono vê todos os turnos', (select count(*) from v_caixa_turnos where empresa_id = :'e') = 2;
insert into r(teste, ok) select 'histórico mostra nomes', (select aberto_por_nome || '/' || fechado_por_nome from v_caixa_turnos where id = :'turno1') = 'João/João';
insert into r(teste, ok, detalhe) select 'app não grava direto no turno',
  pg_temp.erro(format($$update caixa_turnos set diferenca = 0 where id = %L$$, :'turno1')) like '%permission denied%', null;
-- venda de data passada (dono) não precisa de caixa
insert into r(teste, ok, detalhe) select 'dono lança venda de ontem sem caixa aberto',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','pix','valor',10)), p_data => hoje() - 1)$$, :'e', :'p')) is null, null;
-- dono pode fechar o caixa de outra pessoa (esqueceu aberto)
reset role;
select pg_temp.como('b9b9b9b9-0000-0000-0000-000000000002');
select abrir_caixa(:'e', 0) as turno3 \gset
reset role;
select pg_temp.como('a9a9a9a9-0000-0000-0000-000000000001');
insert into r(teste, ok, detalhe) select 'dono fecha caixa esquecido aberto',
  pg_temp.erro(format($$select fechar_caixa(%L, 0)$$, :'turno3')) is null, null;
-- demonstração continua funcionando sem caixa
select criar_empresa_demonstracao() as demo \gset
insert into r(teste, ok) select 'demo cria vendas sem caixa', (select count(*) from vendas where empresa_id = :'demo') > 0;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
