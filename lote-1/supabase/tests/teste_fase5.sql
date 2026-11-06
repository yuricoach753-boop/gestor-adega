-- Testes da Fase 5: painel e relatórios
\set ON_ERROR_STOP 1
\set QUIET 1

create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('a5a5a5a5-0000-0000-0000-00000000000c', 'dono@f5.com', '{"nome":"Dono F5"}'),
 ('b5b5b5b5-0000-0000-0000-00000000000d', 'func@f5.com', '{"nome":"Func F5"}');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a5a5a5a5-0000-0000-0000-00000000000c');
select criar_empresa_demonstracao() as e \gset
select abrir_caixa(:'e', 0) \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset

-- venda com desconto geral para testar o rateio por produto
select id as p1 from produtos where empresa_id = :'e' and codigo = 'B001' \gset
select id as p2 from produtos where empresa_id = :'e' and codigo = 'O002' \gset
select registrar_venda(:'e', jsonb_build_array(jsonb_build_object('produto_id', :'p1', 'quantidade', 1), jsonb_build_object('produto_id', :'p2', 'quantidade', 4)),
  jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor', 47)), p_desconto => 5) as vd \gset

select painel_resumo(:'e') as painel \gset
insert into r(teste, ok, detalhe) select 'painel do dono tem financeiro',
  (:'painel'::jsonb ?& array['saldo_caixa', 'lucro_mes', 'pagar', 'receber_atrasado', 'fluxo_30', 'vendas_hoje', 'estoque_baixo']), null;
insert into r(teste, ok, detalhe) select 'painel: vendas de hoje',
  (:'painel'::jsonb #>> '{vendas_hoje,qtd}')::int = 3 and (:'painel'::jsonb #>> '{vendas_hoje,total}')::numeric = 137.70 + 270 + 47,
  :'painel'::jsonb #>> '{vendas_hoje}';
insert into r(teste, ok, detalhe) select 'painel: saldo igual às contas',
  (:'painel'::jsonb ->> 'saldo_caixa')::numeric = (select sum(saldo_atual) from v_saldo_contas where empresa_id = :'e'), :'painel'::jsonb ->> 'saldo_caixa';
insert into r(teste, ok) select 'painel: fluxo de 30 dias', jsonb_array_length(:'painel'::jsonb -> 'fluxo_30') = 30;
insert into r(teste, ok, detalhe) select 'painel: estoque baixo (3 itens)',
  (:'painel'::jsonb #>> '{estoque_baixo,qtd}')::int = 3 and jsonb_array_length(:'painel'::jsonb #> '{estoque_baixo,itens}') = 3, :'painel'::jsonb #>> '{estoque_baixo,qtd}';
insert into r(teste, ok, detalhe) select 'painel: internet atrasada a pagar',
  (:'painel'::jsonb #>> '{pagar,qtd_atrasado}')::int >= 1, :'painel'::jsonb #>> '{pagar}';
insert into r(teste, ok, detalhe) select 'painel: Zé no atraso a receber',
  (:'painel'::jsonb #>> '{receber_atrasado,qtd_clientes}')::int = 1, :'painel'::jsonb #>> '{receber_atrasado}';
insert into r(teste, ok) select 'painel: pedido pendente', (:'painel'::jsonb ->> 'pedidos_pendentes')::int = 1;

-- relatórios
insert into r(teste, ok, detalhe) select 'relatório por dia soma o total vendido',
  (select sum(faturamento) from relatorio_vendas(:'e', hoje() - 30, hoje())) = (select sum(total) from v_vendas where empresa_id = :'e' and status <> 'cancelado'),
  (select sum(faturamento)::text from relatorio_vendas(:'e', hoje() - 30, hoje()));
insert into r(teste, ok) select 'relatório por dia preenche dias sem venda', (select count(*) from relatorio_vendas(:'e', hoje() - 30, hoje())) = 31;
insert into r(teste, ok, detalhe) select 'relatório por mês',
  (select sum(faturamento) from relatorio_vendas(:'e', hoje() - 60, hoje(), 'mes')) = (select sum(total) from v_vendas where empresa_id = :'e' and status <> 'cancelado'), null;
insert into r(teste, ok, detalhe) select 'lucro bruto = faturamento − custo',
  (select bool_and(lucro_bruto = faturamento - custo) from relatorio_vendas(:'e', hoje() - 30, hoje())), null;
insert into r(teste, ok, detalhe) select 'produtos: soma bate com as vendas (rateio do desconto)',
  abs((select sum(faturamento) from relatorio_produtos(:'e', hoje() - 30, hoje())) - (select sum(total) from v_vendas where empresa_id = :'e' and status <> 'cancelado')) <= 0.05,
  (select sum(faturamento)::text from relatorio_produtos(:'e', hoje() - 30, hoje()));
insert into r(teste, ok, detalhe) select 'produtos: desconto rateado na venda nova',
  (select faturamento from relatorio_produtos(:'e', hoje(), hoje()) where produto_id = :'p2') = 9.04,
  (select string_agg(nome || '=' || faturamento || ' m=' || coalesce(margem::text,'-'), '; ') from relatorio_produtos(:'e', hoje(), hoje()));
insert into r(teste, ok) select 'produtos: ordenado por faturamento',
  (select bool_and(ok) from (select faturamento <= lag(faturamento) over () or lag(faturamento) over () is null as ok from relatorio_produtos(:'e', hoje() - 30, hoje())) x);
insert into r(teste, ok, detalhe) select 'clientes: Zé com dívida',
  (select devendo > 0 from relatorio_clientes(:'e', hoje() - 30, hoje()) where nome = 'Mercadinho do Zé'), null;
insert into r(teste, ok) select 'clientes: balcão agrupado', (select count(*) from relatorio_clientes(:'e', hoje() - 30, hoje()) where cliente_id is null) = 1;
insert into r(teste, ok, detalhe) select 'despesas: soma 100%',
  (select sum(percentual) between 99.8 and 100.2 from relatorio_despesas(:'e', hoje() - 60, hoje())),
  (select string_agg(categoria || '=' || total || ' (' || percentual || '%)', '; ') from relatorio_despesas(:'e', hoje() - 60, hoje()));
insert into r(teste, ok) select 'despesas: sem transferência',
  (select sum(total) from relatorio_despesas(:'e', hoje() - 60, hoje()))
    = (select sum(valor) from lancamentos_caixa where empresa_id = :'e' and status = 'confirmado' and tipo = 'saida' and origem_tipo <> 'transferencia' and data >= hoje() - 60);
insert into r(teste, ok, detalhe) select 'formas de pagamento',
  (select sum(total) from relatorio_formas(:'e', hoje() - 30, hoje())) = (select sum(total) from v_vendas where empresa_id = :'e' and status <> 'cancelado'),
  (select string_agg(forma || '=' || total, '; ') from relatorio_formas(:'e', hoje() - 30, hoje()));
insert into r(teste, ok, detalhe) select 'período invertido é recusado',
  pg_temp.erro(format($$select * from relatorio_vendas(%L, hoje(), hoje() - 1)$$, :'e')) like 'A data final%', null;
insert into r(teste, ok, detalhe) select 'venda cancelada some do relatório',
  (select sum(faturamento) from relatorio_vendas(:'e', hoje(), hoje())) = 454.70, null;
select cancelar_venda(:'vd');
insert into r(teste, ok) select 'após cancelar', (select sum(faturamento) from relatorio_vendas(:'e', hoje(), hoje())) = 407.70;
reset role;

-- funcionário
select pg_temp.como('b5b5b5b5-0000-0000-0000-00000000000d');
select aceitar_convite(:'tok') \gset
select painel_resumo(:'e') as pf \gset
insert into r(teste, ok, detalhe) select 'painel do funcionário sem financeiro',
  not (:'pf'::jsonb ?| array['saldo_caixa', 'lucro_mes', 'pagar', 'receber_atrasado', 'fluxo_30']) and not (:'pf'::jsonb ? 'vendas_hoje') and (:'pf'::jsonb ? 'minhas_vendas_hoje'), :'pf';
insert into r(teste, ok, detalhe) select 'funcionário não abre relatórios',
  pg_temp.erro(format($$select * from relatorio_produtos(%L, hoje() - 30, hoje())$$, :'e')) like 'Somente o dono%', null;
reset role;

-- estranho
insert into auth.users (id, email) values ('c5c5c5c5-0000-0000-0000-00000000000e', 'x@f5.com');
select pg_temp.como('c5c5c5c5-0000-0000-0000-00000000000e');
insert into r(teste, ok, detalhe) select 'outra pessoa não vê o painel',
  pg_temp.erro(format($$select painel_resumo(%L)$$, :'e')) like 'Você não tem acesso%', null;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
