-- Testes da Fase 4: contas a pagar, recorrentes, caixa e projeção
\set ON_ERROR_STOP 1
\set QUIET 1

create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('a4a4a4a4-0000-0000-0000-00000000000a', 'dono@f4.com', '{"nome":"Dono F4"}'),
 ('b4b4b4b4-0000-0000-0000-00000000000b', 'func@f4.com', '{"nome":"Func F4"}');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a4a4a4a4-0000-0000-0000-00000000000a');
select criar_empresa('Empresa F4') as e \gset
select id as caixa from contas_financeiras where empresa_id = :'e' and tipo = 'caixa' \gset
select id as banco from contas_financeiras where empresa_id = :'e' and tipo = 'banco' \gset
select id as cat_aluguel from categorias where empresa_id = :'e' and nome = 'Aluguel' \gset
update contas_financeiras set saldo_inicial = 1000 where id = :'banco';
update contas_financeiras set saldo_inicial = 100 where id = :'caixa';
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset

-- ---------- Contas a pagar
select lancar_contas_pagar(:'e', 'Fornecedor de gelo', 300, hoje() - 3, p_parcelas => 3, p_intervalo_dias => 10,
  p_forma => 'boleto', p_codigo_barras => '34191 79001 01043', p_categoria => :'cat_aluguel') as g \gset
insert into r(teste, ok, detalhe) select 'parcelas lançadas com código só na 1ª',
  (select count(*) = 3 and sum(valor) = 300 and count(codigo_barras) = 1 from contas_pagar where grupo_parcelamento_id = :'g'),
  (select string_agg(descricao || ' ' || vencimento || ' ' || coalesce(codigo_barras, '-'), '; ' order by parcela_numero) from contas_pagar where grupo_parcelamento_id = :'g');
insert into r(teste, ok) select 'código de barras sem espaços', (select codigo_barras from contas_pagar where grupo_parcelamento_id = :'g' and parcela_numero = 1) = '341917900101043';
insert into r(teste, ok) select 'situações calculadas',
  (select array_agg(situacao order by parcela_numero) from v_contas_pagar where grupo_parcelamento_id = :'g') = '{atrasada,a_vencer,a_vencer}';

select id as cp1 from contas_pagar where grupo_parcelamento_id = :'g' and parcela_numero = 1 \gset
select pagar_conta(:'cp1', p_juros => 5.5, p_desconto => 0.5) as l1 \gset
insert into r(teste, ok, detalhe) select 'pagar com juros: valor pago 105',
  (select status = 'paga' and valor_pago = 105 and juros_multa = 5.5 and pago_em = hoje() from contas_pagar where id = :'cp1'), null;
insert into r(teste, ok, detalhe) select 'boleto pago sai do Banco',
  (select saldo_atual from v_saldo_contas where id = :'banco') = 895, (select saldo_atual::text from v_saldo_contas where id = :'banco');
insert into r(teste, ok) select 'saída na categoria da conta', (select categoria_id from lancamentos_caixa where id = :'l1') = :'cat_aluguel';
insert into r(teste, ok, detalhe) select 'não paga duas vezes',
  pg_temp.erro(format($$select pagar_conta(%L)$$, :'cp1')) like 'Esta conta já foi paga%', null;
insert into r(teste, ok, detalhe) select 'não cancela conta paga',
  pg_temp.erro(format($$select cancelar_conta_pagar(%L)$$, :'cp1')) like '%Estorne o pagamento%', null;
insert into r(teste, ok, detalhe) select 'desconto maior que a conta é recusado',
  pg_temp.erro(format($$select pagar_conta(id, p_desconto => 500) from contas_pagar where grupo_parcelamento_id = %L and parcela_numero = 2$$, :'g')) like 'O desconto não pode%', null;

select estornar_pagamento(:'cp1', 'Paguei a errada');
insert into r(teste, ok) select 'estorno reabre a conta', (select status = 'aberta' and valor_pago is null and lancamento_caixa_id is null from contas_pagar where id = :'cp1');
insert into r(teste, ok) select 'estorno devolve ao banco', (select saldo_atual from v_saldo_contas where id = :'banco') = 1000;
insert into r(teste, ok, detalhe) select 'dinheiro não fica negativo (saída maior que o saldo)',
  pg_temp.erro(format($$select lancar_caixa(%L, 'saida', 999, 'Teste', %L)$$, :'e', :'caixa')) like 'Não tem esse dinheiro%', null;
select pagar_conta(:'cp1', p_conta_financeira => :'caixa', p_forma => 'dinheiro');
insert into r(teste, ok) select 'pagar escolhendo o Caixa', (select saldo_atual from v_saldo_contas where id = :'caixa') = 0;

update contas_pagar set descricao = 'Gelo (2/3) renegociado', valor = 120 where grupo_parcelamento_id = :'g' and parcela_numero = 2;
insert into r(teste, ok) select 'edita conta em aberto', (select valor from contas_pagar where grupo_parcelamento_id = :'g' and parcela_numero = 2) = 120;
select cancelar_conta_pagar(id, 'Fornecedor perdoou') from contas_pagar where grupo_parcelamento_id = :'g' and parcela_numero = 3;
insert into r(teste, ok) select 'cancela conta em aberto', (select status from contas_pagar where grupo_parcelamento_id = :'g' and parcela_numero = 3) = 'cancelada';

-- ---------- Recorrentes (início no mês passado, dia 31)
insert into recorrencias (empresa_id, descricao, valor, dia_vencimento, forma_pagamento, inicio)
values (:'e', 'Aluguel', 1500, 31, 'pix', (date_trunc('month', hoje()) - interval '1 month')::date) returning id as rec \gset
select gerar_recorrentes(:'e') as geradas \gset
insert into r(teste, ok, detalhe) select 'recorrente gera mês passado, atual e próximo',
  :'geradas'::int = 3 and (select count(*) from contas_pagar where recorrencia_id = :'rec') = 3,
  (select string_agg(vencimento::text, ', ' order by vencimento) from contas_pagar where recorrencia_id = :'rec');
insert into r(teste, ok) select 'dia 31 vira último dia do mês',
  (select bool_and(vencimento = (date_trunc('month', vencimento) + interval '1 month - 1 day')::date) from contas_pagar where recorrencia_id = :'rec');
select gerar_recorrentes(:'e') as de_novo \gset
insert into r(teste, ok) select 'gerar de novo não duplica', :'de_novo'::int = 0;
select cancelar_conta_pagar(id) from contas_pagar where recorrencia_id = :'rec' order by vencimento desc limit 1;
select gerar_recorrentes(:'e') as apos_cancelar \gset
insert into r(teste, ok) select 'conta recorrente cancelada não volta', :'apos_cancelar'::int = 0;
insert into r(teste, ok) select 'v_recorrencias mostra próximo vencimento', (select proximo_vencimento is not null from v_recorrencias where id = :'rec');

-- ---------- Caixa
select lancar_caixa(:'e', 'entrada', 500, 'Aporte do dono', :'caixa') as lm \gset
select transferir_entre_contas(:'e', :'caixa', :'banco', 200) as tr \gset
insert into r(teste, ok, detalhe) select 'transferência mexe nas duas contas',
  (select saldo_atual from v_saldo_contas where id = :'caixa') = 300 and (select saldo_atual from v_saldo_contas where id = :'banco') = 1200,
  (select string_agg(nome || '=' || saldo_atual, ', ') from v_saldo_contas where empresa_id = :'e');
insert into r(teste, ok) select 'transferência não conta como entrada/saída no fluxo',
  (select entradas = 500 and saidas = 100 from v_fluxo_diario where empresa_id = :'e' and data = hoje());
insert into r(teste, ok, detalhe) select 'lançamento futuro recusado',
  pg_temp.erro(format($$select lancar_caixa(%L, 'saida', 10, 'Teste', %L, hoje() + 1)$$, :'e', :'caixa')) like 'A data não pode ser no futuro%', null;
insert into r(teste, ok, detalhe) select 'não cancela lançamento de conta paga por aqui',
  pg_temp.erro(format($$select cancelar_lancamento(lancamento_caixa_id) from contas_pagar where id = %L$$, :'cp1')) like '%estorne o pagamento%', null;
select cancelar_lancamento(id) from lancamentos_caixa where origem_id = :'tr' and tipo = 'saida';
insert into r(teste, ok) select 'cancelar transferência cancela os dois lados',
  (select count(*) from lancamentos_caixa where origem_id = :'tr' and status = 'cancelado') = 2
  and (select saldo_atual from v_saldo_contas where id = :'caixa') = 500;

-- fluxo diário com saldo acumulado: saldo inicial 1000 + entradas/saídas
insert into r(teste, ok, detalhe) select 'fluxo diário termina no saldo total',
  (select saldo_acumulado from fluxo_diario(:'e', hoje() - 6, hoje()) order by dia desc limit 1) = (select sum(saldo_atual) from v_saldo_contas where empresa_id = :'e'),
  (select string_agg(dia || ':' || saldo_acumulado, ' ') from fluxo_diario(:'e', hoje() - 2, hoje()));
insert into r(teste, ok) select 'fluxo diário retorna 7 dias', (select count(*) from fluxo_diario(:'e', hoje() - 6, hoje())) = 7;
insert into r(teste, ok, detalhe) select 'fluxo mensal: 12 meses, último = saldo total',
  (select count(*) from fluxo_mensal(:'e')) = 12
  and (select saldo_final from fluxo_mensal(:'e') order by mes desc limit 1) = (select sum(saldo_atual) from v_saldo_contas where empresa_id = :'e'), null;

-- projeção: saldo hoje 1400 (400 caixa + 1000 banco); a pagar: parcela 2 (120) + aluguel atual e próximo; atrasados entram hoje
insert into r(teste, ok, detalhe) select 'projeção tem 30 dias',
  (select count(*) from projecao_caixa(:'e')) = 30, null;
insert into r(teste, ok, detalhe) select 'projeção desconta contas a pagar',
  (select saldo from projecao_caixa(:'e') order by dia desc limit 1)
    = (select sum(saldo_atual) from v_saldo_contas where empresa_id = :'e') - (select coalesce(sum(valor), 0) from contas_pagar where empresa_id = :'e' and status = 'aberta' and vencimento <= hoje() + 29),
  (select saldo::text from projecao_caixa(:'e') order by dia desc limit 1);
reset role;

-- ---------- Funcionário
select pg_temp.como('b4b4b4b4-0000-0000-0000-00000000000b');
select aceitar_convite(:'tok') \gset
insert into r(teste, ok) select 'funcionário não vê contas a pagar', (select count(*) from v_contas_pagar) = 0;
insert into r(teste, ok) select 'funcionário não vê fluxo', (select count(*) from fluxo_diario(:'e', hoje() - 6, hoje())) = 0;
insert into r(teste, ok) select 'funcionário não vê projeção', (select count(*) from projecao_caixa(:'e')) = 0;
insert into r(teste, ok, detalhe) select 'funcionário não paga conta',
  pg_temp.erro(format($$select pagar_conta(id) from contas_pagar where empresa_id = %L limit 1$$, :'e')) is null
  and (select count(*) from contas_pagar where status = 'paga') = 0, null;
insert into r(teste, ok, detalhe) select 'funcionário não lança no caixa',
  pg_temp.erro(format($$select lancar_caixa(%L, 'entrada', 10, 'X', %L)$$, :'e', :'caixa')) like 'Somente o dono%', null;
insert into r(teste, ok, detalhe) select 'funcionário não transfere',
  pg_temp.erro(format($$select transferir_entre_contas(%L, %L, %L, 10)$$, :'e', :'caixa', :'banco')) like 'Somente o dono%', null;

-- ---------- Demonstração
select criar_empresa_demonstracao() as demo \gset
insert into r(teste, ok, detalhe) select 'demo: 3 contas fixas, mês passado pago',
  (select count(*) from v_recorrencias where empresa_id = :'demo') = 3
  and (select count(*) from contas_pagar where empresa_id = :'demo' and recorrencia_id is not null and vencimento < date_trunc('month', hoje()) and status = 'paga') = 3,
  (select string_agg(descricao || ' ' || vencimento || ' ' || status, '; ' order by vencimento) from contas_pagar where empresa_id = :'demo' and recorrencia_id is not null);
insert into r(teste, ok) select 'demo: internet do mês atrasada', (select count(*) from v_contas_pagar where empresa_id = :'demo' and situacao = 'atrasada' and descricao = 'Internet') = 1;
insert into r(teste, ok) select 'demo: projeção funciona', (select count(*) from projecao_caixa(:'demo')) = 30;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
