-- Testes da Fase 3: vendas e contas a receber
\set ON_ERROR_STOP 1
\set QUIET 1

create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('a3a3a3a3-0000-0000-0000-000000000007', 'dono@f3.com', '{"nome":"Dono F3"}'),
 ('b3b3b3b3-0000-0000-0000-000000000008', 'func@f3.com', '{"nome":"Func F3"}'),
 ('c3c3c3c3-0000-0000-0000-000000000009', 'func2@f3.com', '{"nome":"Func2 F3"}');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

-- ---------- Dono prepara
select pg_temp.como('a3a3a3a3-0000-0000-0000-000000000007');
select criar_empresa('Empresa F3') as e \gset
select abrir_caixa(:'e', 0) \gset
insert into clientes (empresa_id, nome, telefone) values (:'e', 'Cliente Fiado', '(62) 98888-0000') returning id as cli \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'Cerveja cx', 'cx', 30, 42, 10) returning id as p1 \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual) values (:'e', 'Gelo', 'kg', 1, 2.5, 100) returning id as p2 \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok2 \gset
reset role;

-- ---------- Funcionário vende
select pg_temp.como('b3b3b3b3-0000-0000-0000-000000000008');
select aceitar_convite(:'tok') \gset

-- Venda de balcão: 2 cx + 4 kg = 94,00; desconto 4,00 → 90,00; 40 dinheiro + 50 pix
select registrar_venda(:'e',
  jsonb_build_array(jsonb_build_object('produto_id', :'p1', 'quantidade', 2), jsonb_build_object('produto_id', :'p2', 'quantidade', 4)),
  jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor', 40), jsonb_build_object('forma', 'pix', 'valor', 50)),
  p_desconto => 4) as v1 \gset

insert into r(teste, ok, detalhe) select 'venda calcula total com desconto',
  (select subtotal = 94 and desconto = 4 and total = 90 and status = 'entregue' from v_vendas where id = :'v1'),
  (select format('%s / %s / %s', subtotal, desconto, total) from v_vendas where id = :'v1');
insert into r(teste, ok) select 'venda numerada', (select numero from v_vendas where id = :'v1') = 1;
insert into r(teste, ok) select 'venda baixa estoque', (select estoque_atual from v_produtos where id = :'p1') = 8;
insert into r(teste, ok) select 'funcionário vê venda e formas', (select formas from v_vendas where id = :'v1') = 'dinheiro,pix';
insert into r(teste, ok) select 'funcionário não vê caixa', (select count(*) from lancamentos_caixa) = 0;

insert into r(teste, ok, detalhe) select 'pagamento que não bate é recusado',
  null,
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','pix','valor',40)))$$, :'e', :'p1'));
update r set ok = detalhe like 'A soma dos pagamentos (R$ 40,00) não bate com o total da venda (R$ 42,00)%' where teste = 'pagamento que não bate é recusado';

insert into r(teste, ok, detalhe) select 'fiado sem cliente é recusado',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','a_prazo','valor',42,'primeiro_vencimento',hoje()+30)))$$, :'e', :'p1')) like 'Para vender fiado%', null;
insert into r(teste, ok, detalhe) select 'funcionário não lança venda com data passada',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','pix','valor',42)), p_data => hoje()-1)$$, :'e', :'p1')) like 'Só o dono%', null;
insert into r(teste, ok, detalhe) select 'desconto maior que a venda é recusado',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), '[]'::jsonb, p_desconto => 50)$$, :'e', :'p1')) like 'O desconto (R$ 50,00)%', null;

-- Funcionário NÃO vende fiado nem boleto (pedido do Yuri em 12/10)
insert into r(teste, ok, detalhe) select 'funcionário não vende fiado',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','a_prazo','valor',42,'primeiro_vencimento', hoje())), p_cliente => %L)$$, :'e', :'p1', :'cli')) = 'Só o dono pode vender fiado.', null;
insert into r(teste, ok, detalhe) select 'funcionário não vende no boleto',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','boleto','valor',42,'primeiro_vencimento', hoje())), p_cliente => %L)$$, :'e', :'p1', :'cli')) = 'Só o dono pode vender fiado.', null;
reset role;
-- Fiado em 3 parcelas, pedido em aberto (lançado pelo dono): 5 cx = 210,00
select pg_temp.como('a3a3a3a3-0000-0000-0000-000000000007');
select registrar_venda(:'e',
  jsonb_build_array(jsonb_build_object('produto_id', :'p1', 'quantidade', 5)),
  jsonb_build_array(jsonb_build_object('forma', 'a_prazo', 'valor', 210, 'parcelas', 3, 'primeiro_vencimento', hoje(), 'intervalo_dias', 15)),
  p_cliente => :'cli', p_entregue => false) as v2 \gset
-- simula fiado antigo: a 1ª parcela venceu há 10 dias (a venda não aceita vencimento no passado)
reset role;
update contas_receber set vencimento = vencimento - 10 where venda_id = :'v2';
select pg_temp.como('b3b3b3b3-0000-0000-0000-000000000008');
insert into r(teste, ok) select 'pedido fiado do dono aparece para o funcionário separar', (select status from v_vendas where id = :'v2') = 'aberto';
insert into r(teste, ok) select 'funcionário NÃO vê contas a receber', (select count(*) from contas_receber) = 0 and (select count(*) from v_devedores) = 0;
insert into r(teste, ok) select 'funcionário NÃO vê dívida do cliente', (select valor_devido is null from v_clientes_resumo where id = :'cli');
select mudar_status_venda(:'v2', 'separado');
insert into r(teste, ok) select 'pedido separado', (select status = 'separado' and separado_em is not null from v_vendas where id = :'v2');
select mudar_status_venda(:'v2', 'entregue');
insert into r(teste, ok) select 'pedido do dono entregue sai da lista do funcionário', not exists (select 1 from v_vendas where id = :'v2');
insert into r(teste, ok, detalhe) select 'status cancelado só pelo botão',
  pg_temp.erro(format($$select mudar_status_venda(%L, 'cancelado')$$, :'v2')) like 'Para cancelar%', null;
insert into r(teste, ok, detalhe) select 'funcionário não grava venda direto',
  pg_temp.erro(format($$update vendas set total = 1 where id = %L$$, :'v2')) like 'permission denied%', null;
reset role;

-- ---------- Outro funcionário não cancela venda alheia
select pg_temp.como('c3c3c3c3-0000-0000-0000-000000000009');
select aceitar_convite(:'tok2') \gset
insert into r(teste, ok, detalhe) select 'funcionário não cancela venda de outro',
  pg_temp.erro(format($$select cancelar_venda(%L)$$, :'v1')) like 'Funcionários só podem%', null;
reset role;

-- ---------- Dono: financeiro
select pg_temp.como('a3a3a3a3-0000-0000-0000-000000000007');
insert into r(teste, ok, detalhe) select 'dinheiro no Caixa, Pix no Banco',
  (select saldo_atual from v_saldo_contas where empresa_id = :'e' and tipo = 'caixa') = 40
  and (select saldo_atual from v_saldo_contas where empresa_id = :'e' and tipo = 'banco') = 50,
  (select string_agg(nome || '=' || saldo_atual, ', ') from v_saldo_contas where empresa_id = :'e');
insert into r(teste, ok, detalhe) select 'fiado gera 3 parcelas que somam 210',
  (select count(*) = 3 and sum(valor) = 210 from contas_receber where venda_id = :'v2'),
  (select string_agg(valor::text || ' ' || vencimento::text, ', ' order by parcela_numero) from contas_receber where venda_id = :'v2');
insert into r(teste, ok, detalhe) select 'devedores: total e vencido',
  (select total_devido = 210 and total_vencido = 70 and maior_atraso = 10 and qtd_contas = 3 from v_devedores where cliente_id = :'cli'),
  (select format('%s / %s / %s', total_devido, total_vencido, maior_atraso) from v_devedores where cliente_id = :'cli');
insert into r(teste, ok) select 'cliente mostra quanto deve', (select valor_devido from v_clientes_resumo where id = :'cli') = 210;

select id as c1 from contas_receber where venda_id = :'v2' and parcela_numero = 1 \gset
select receber_conta(:'c1', 30, 'dinheiro') as rec1 \gset
insert into r(teste, ok) select 'recebimento parcial', (select status = 'parcial' and valor_recebido = 30 from contas_receber where id = :'c1');
insert into r(teste, ok) select 'recebimento entra no caixa', (select saldo_atual from v_saldo_contas where empresa_id = :'e' and tipo = 'caixa') = 70;
insert into r(teste, ok, detalhe) select 'não recebe mais que o saldo',
  pg_temp.erro(format($$select receber_conta(%L, 50, 'pix')$$, :'c1')) like 'O valor é maior que o saldo da conta (R$ 40,00)%', null;
select receber_conta(:'c1', 40, 'pix') as rec2 \gset
insert into r(teste, ok) select 'conta quitada', (select status = 'paga' and recebido_em = hoje() from contas_receber where id = :'c1');
insert into r(teste, ok) select 'conta paga sai dos devedores', (select total_devido from v_devedores where cliente_id = :'cli') = 140;

select estornar_recebimento(:'rec2', 'Pix não caiu');
insert into r(teste, ok) select 'estorno reabre a conta', (select status = 'parcial' and valor_recebido = 30 from contas_receber where id = :'c1');
insert into r(teste, ok) select 'estorno tira do banco', (select saldo_atual from v_saldo_contas where empresa_id = :'e' and tipo = 'banco') = 50;
insert into r(teste, ok) select 'histórico de recebimentos', (select count(*) = 2 and count(*) filter (where status = 'cancelado') = 1 from v_recebimentos where conta_receber_id = :'c1');

insert into r(teste, ok, detalhe) select 'conta de venda não cancela avulsa',
  pg_temp.erro(format($$select cancelar_conta_receber(%L)$$, :'c1')) like 'Esta conta veio da venda nº 2%', null;

-- conta manual
select lancar_contas_receber(:'e', 'Empréstimo de engradados', 100, hoje() + 5, :'cli', 2, 10) as g \gset
insert into r(teste, ok) select 'conta manual em 2 parcelas', (select count(*) = 2 and sum(valor) = 100 from contas_receber where grupo_parcelamento_id = :'g');
select id as cm from contas_receber where grupo_parcelamento_id = :'g' and parcela_numero = 2 \gset
select cancelar_conta_receber(:'cm', 'Lançada errada');
insert into r(teste, ok) select 'conta manual cancelada', (select status from contas_receber where id = :'cm') = 'cancelada';

-- cancelar venda fiado com recebimento: estorna tudo
select cancelar_venda(:'v2', 'Cliente devolveu');
insert into r(teste, ok) select 'cancelar venda devolve estoque', (select estoque_atual from v_produtos where id = :'p1') = 8;
insert into r(teste, ok) select 'cancelar venda cancela contas', (select bool_and(status = 'cancelada') from contas_receber where venda_id = :'v2');
insert into r(teste, ok) select 'cancelar venda estorna recebimentos do caixa', (select saldo_atual from v_saldo_contas where empresa_id = :'e' and tipo = 'caixa') = 40;
insert into r(teste, ok) select 'cliente não deve mais da venda', (select total_devido from v_devedores where cliente_id = :'cli') = 50;

select cancelar_venda(:'v1');
insert into r(teste, ok) select 'cancelar venda à vista zera o caixa', (select sum(saldo_atual) from v_saldo_contas where empresa_id = :'e') = 0;
insert into r(teste, ok) select 'histórico de estoque com estornos', (select count(*) from movimentacoes_estoque where produto_id = :'p1' and tipo = 'estorno_venda') = 2;
reset role;

-- ---------- Outra empresa
select pg_temp.como('c3c3c3c3-0000-0000-0000-000000000009');
select criar_empresa('Outra F3') as eo \gset
select abrir_caixa(:'eo', 0) \gset
insert into r(teste, ok, detalhe) select 'outra empresa não vende produto alheio',
  pg_temp.erro(format($$select registrar_venda(%L, jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1)), jsonb_build_array(jsonb_build_object('forma','pix','valor',42)))$$, :'eo', :'p1')) like 'Produto não encontrado%', null;

-- demonstração completa
select criar_empresa_demonstracao() as demo \gset
insert into r(teste, ok, detalhe) select 'demo: 6 vendas, 1 pedido aberto',
  (select count(*) = 6 and count(*) filter (where status = 'aberto') = 1 from v_vendas where empresa_id = :'demo'),
  (select count(*)::text from v_vendas where empresa_id = :'demo');
insert into r(teste, ok, detalhe) select 'demo: devedores com atraso',
  (select count(*) = 2 and max(maior_atraso) = 5 from v_devedores where empresa_id = :'demo'),
  (select string_agg(cliente_nome || ' ' || total_devido || ' atraso ' || maior_atraso, '; ') from v_devedores where empresa_id = :'demo');
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
