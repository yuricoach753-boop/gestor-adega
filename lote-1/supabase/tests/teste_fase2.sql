-- Testes da Fase 2: estoque, compras, demonstração
\set ON_ERROR_STOP 1
\set QUIET 1

create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('dddddddd-0000-0000-0000-000000000004', 'dono@f2.com', '{"nome":"Dono F2"}'),
 ('eeeeeeee-0000-0000-0000-000000000005', 'func@f2.com', '{"nome":"Func F2"}'),
 ('ffffffff-0000-0000-0000-000000000006', 'outro@f2.com', '{"nome":"Outro F2"}');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

-- ---------- Dono monta a empresa
select pg_temp.como('dddddddd-0000-0000-0000-000000000004');
select criar_empresa('Empresa F2') as e \gset
insert into fornecedores (empresa_id, nome) values (:'e', 'Fornecedor X') returning id as f \gset
insert into produtos (empresa_id, codigo, nome, unidade, preco_custo, preco_venda, estoque_atual, estoque_minimo)
values (:'e', 'P1', 'Refri 2L', 'fardo', 30, 45, 5, 2) returning id as p1 \gset
insert into produtos (empresa_id, codigo, nome, unidade, preco_custo, preco_venda)
values (:'e', 'P2', 'Arroz a granel', 'kg', 20, 27) returning id as p2 \gset

insert into r(teste, ok, detalhe) select 'código repetido é recusado',
  pg_temp.erro(format($$insert into produtos (empresa_id, codigo, nome, preco_venda) values (%L, 'p1', 'Outro', 1)$$, :'e')) like '%duplicate%', null;

-- compra a prazo em 3 parcelas
select registrar_compra(
  p_empresa => :'e',
  p_itens => jsonb_build_array(
    jsonb_build_object('produto_id', :'p1', 'quantidade', 10, 'custo_unitario', 32.5),
    jsonb_build_object('produto_id', :'p2', 'quantidade', 3.5, 'custo_unitario', 21)),
  p_fornecedor => :'f', p_numero_nota => '123',
  p_pagamento => 'a_prazo', p_forma => 'boleto', p_primeiro_vencimento => hoje() + 30, p_parcelas => 3
) as c1 \gset

insert into r(teste, ok, detalhe) select 'compra soma total',
  (select valor_total from compras where id = :'c1') = 398.50, (select valor_total::text from compras where id = :'c1');
insert into r(teste, ok, detalhe) select 'compra dá entrada no estoque',
  (select estoque_atual from v_produtos where id = :'p1') = 15 and (select estoque_atual from v_produtos where id = :'p2') = 3.5, null;
insert into r(teste, ok, detalhe) select 'compra atualiza custo (último custo)',
  (select preco_custo from v_produtos where id = :'p1') = 32.50, null;
insert into r(teste, ok, detalhe) select 'parcelas somam o total exato',
  (select count(*) = 3 and sum(valor) = 398.50 from contas_pagar where compra_id = :'c1'),
  (select string_agg(valor::text || ' em ' || vencimento::text, ', ' order by parcela_numero) from contas_pagar where compra_id = :'c1');
insert into r(teste, ok) select 'parcela usa categoria Compra de mercadorias',
  (select bool_and(c.nome = 'Compra de mercadorias') from contas_pagar cp join categorias c on c.id = cp.categoria_id where cp.compra_id = :'c1');
insert into r(teste, ok) select 'v_compras mostra fornecedor e itens',
  (select fornecedor_nome = 'Fornecedor X' and qtd_itens = 2 from v_compras where id = :'c1');

-- compra paga na hora (Pix → conta Banco)
select registrar_compra(p_empresa => :'e',
  p_itens => jsonb_build_array(jsonb_build_object('produto_id', :'p1', 'quantidade', 2, 'custo_unitario', 33)),
  p_pagamento => 'pago', p_forma => 'pix') as c2 \gset
insert into r(teste, ok, detalhe) select 'compra paga gera saída no Banco',
  (select l.tipo = 'saida' and l.valor = 66 and cf.tipo = 'banco'
   from contas_pagar cp join lancamentos_caixa l on l.id = cp.lancamento_caixa_id join contas_financeiras cf on cf.id = l.conta_financeira_id
   where cp.compra_id = :'c2' and cp.status = 'paga'), null;
insert into r(teste, ok) select 'saldo do banco ficou negativo em 66', (select saldo_atual from v_saldo_contas where empresa_id = :'e' and tipo = 'banco') = -66;

insert into r(teste, ok, detalhe) select 'compra sem itens recusada',
  pg_temp.erro(format($$select registrar_compra(%L, '[]'::jsonb)$$, :'e')) like 'Adicione pelo menos%', null;
insert into r(teste, ok, detalhe) select 'compra a prazo sem vencimento recusada',
  pg_temp.erro(format($$select registrar_compra(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1, 'custo_unitario', 1)), p_pagamento => 'a_prazo')$$, :'e', :'p1')) like 'Informe o vencimento%', null;

-- cancelamento
select cancelar_compra(:'c2', 'Lançada errada');
insert into r(teste, ok) select 'cancelar compra tira do estoque', (select estoque_atual from v_produtos where id = :'p1') = 15;
insert into r(teste, ok) select 'cancelar compra cancela saída de caixa', (select saldo_atual from v_saldo_contas where empresa_id = :'e' and tipo = 'banco') = 0;
insert into r(teste, ok) select 'cancelar compra cancela conta', (select status from contas_pagar where compra_id = :'c2') = 'cancelada';
insert into r(teste, ok, detalhe) select 'não cancela duas vezes',
  pg_temp.erro(format($$select cancelar_compra(%L)$$, :'c2')) like 'Esta compra já foi cancelada%', null;

-- convite para funcionário
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset
reset role;

-- ---------- Funcionário
select pg_temp.como('eeeeeeee-0000-0000-0000-000000000005');
select aceitar_convite(:'tok') \gset
select lancar_movimentacao(:'p1', 'perda', 2, 'Garrafa estourou');
insert into r(teste, ok) select 'funcionário lança perda (positivo vira saída)', (select estoque_atual from v_produtos where id = :'p1') = 13;
select lancar_movimentacao(:'p1', 'ajuste', 20, 'Contagem de sexta');
insert into r(teste, ok, detalhe) select 'ajuste por contagem calcula a diferença',
  (select estoque_atual from v_produtos where id = :'p1') = 20
  and (select quantidade from movimentacoes_estoque where produto_id = :'p1' and tipo = 'ajuste' order by created_at desc limit 1) = 7, null;
insert into r(teste, ok, detalhe) select 'ajuste igual ao atual é recusado',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'ajuste', 20)$$, :'p1')) like 'O estoque já está%', null;
insert into r(teste, ok, detalhe) select 'funcionário não usa entrada por aqui',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'compra', 5)$$, :'p1')) like 'Para dar entrada%', null;
insert into r(teste, ok, detalhe) select 'funcionário não registra compra',
  pg_temp.erro(format($$select registrar_compra(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1, 'custo_unitario', 1)))$$, :'e', :'p1')) like 'Somente o dono%', null;
insert into r(teste, ok) select 'funcionário não vê compras', (select count(*) from v_compras) = 0;
insert into r(teste, ok) select 'funcionário vê histórico sem custo',
  (select count(*) > 0 and bool_and(custo_unitario is null) from v_movimentacoes_estoque where produto_id = :'p1');
insert into r(teste, ok) select 'histórico mostra quem fez', (select criado_por_nome from v_movimentacoes_estoque where tipo = 'perda' limit 1) = 'Func F2';
reset role;

-- ---------- Outra empresa
select pg_temp.como('ffffffff-0000-0000-0000-000000000006');
select criar_empresa('Empresa Outra') as eo \gset
insert into r(teste, ok, detalhe) select 'outra empresa não mexe no estoque alheio',
  pg_temp.erro(format($$select lancar_movimentacao(%L, 'perda', 1)$$, :'p1')) like 'Produto não encontrado%', null;
insert into r(teste, ok, detalhe) select 'outra empresa não cancela compra alheia',
  pg_temp.erro(format($$select cancelar_compra(%L)$$, :'c1')) like 'Compra não encontrada%', null;
insert into r(teste, ok, detalhe) select 'compra com produto de outra empresa é recusada',
  pg_temp.erro(format($$select registrar_compra(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1, 'custo_unitario', 1)))$$, :'eo', :'p1')) like '%foreign key%', null;

-- ---------- Demonstração
select criar_empresa_demonstracao() as demo \gset
insert into r(teste, ok, detalhe) select 'demo: produtos, clientes, fornecedores',
  (select count(*) from v_produtos where empresa_id = :'demo') = 14
  and (select count(*) from clientes where empresa_id = :'demo') = 5
  and (select count(*) from fornecedores where empresa_id = :'demo') = 3,
  (select count(*)::text from v_produtos where empresa_id = :'demo');
insert into r(teste, ok) select 'demo: tem produtos com estoque baixo', (select count(*) from v_produtos where empresa_id = :'demo' and estoque_baixo) >= 3;
insert into r(teste, ok) select 'demo: compra a prazo com 2 parcelas', (select count(*) from v_contas_pagar where empresa_id = :'demo' and compra_id is not null) = 2;
insert into r(teste, ok) select 'demo: marcada como exemplo', (select usa_dados_exemplo from empresas where id = :'demo');
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
