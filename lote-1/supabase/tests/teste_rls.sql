-- Testes de isolamento multiempresa, papéis e regras de histórico.
-- Rodar num banco com stub_supabase.sql + migrations aplicadas.
\set ON_ERROR_STOP 1
\set QUIET 1

create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

-- Usuários
insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@a.com',   '{"nome":"Ana Dona A"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002', 'bia@b.com',   '{"nome":"Bia Dona B"}'),
 ('cccccccc-0000-0000-0000-000000000003', 'caio@a.com',  '{"nome":"Caio Func A"}');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;

-- helper: espera erro
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

-- ---------- Ana cria empresa A
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
select criar_empresa('Distribuidora A', '62999990000') as ea \gset
insert into r(teste, ok) select 'perfil criado no signup', (select nome from perfis where id = auth.uid()) = 'Ana Dona A';
insert into r(teste, ok) select 'categorias padrão', (select count(*) from categorias where empresa_id = :'ea') = 19;
insert into r(teste, ok) select 'contas financeiras padrão', (select count(*) from contas_financeiras where empresa_id = :'ea') = 2;

insert into clientes (empresa_id, nome, telefone) values (:'ea', 'Mercadinho do Zé', '62988887777');
insert into produtos (empresa_id, codigo, nome, unidade, preco_custo, preco_venda, estoque_atual, estoque_minimo)
values (:'ea', 'CERV01', 'Cerveja lata 350ml', 'cx', 30, 42, 10, 3) returning id as pa \gset
insert into r(teste, ok, detalhe) select 'estoque inicial vira movimentação',
  (select estoque_atual from v_produtos where id = :'pa') = 10
  and (select count(*) from movimentacoes_estoque where produto_id = :'pa') = 1, null;
insert into r(teste, ok, detalhe) select 'margem calculada', (select margem_percentual from v_produtos where id = :'pa') = 28.57,
  (select margem_percentual::text from v_produtos where id = :'pa');
insert into r(teste, ok, detalhe) select 'estoque não pode ser alterado direto',
  pg_temp.erro($$update produtos set estoque_atual = 100$$) like 'O estoque não pode%', null;
insert into r(teste, ok, detalhe) select 'não apaga nada (delete bloqueado)',
  pg_temp.erro($$delete from clientes$$) like 'permission denied%', null;
insert into r(teste, ok, detalhe) select 'dono não altera assinatura',
  pg_temp.erro(format($$update empresas set status_assinatura = 'ativa' where id = %L$$, :'ea')) like 'permission denied%', null;
insert into r(teste, ok, detalhe) select 'não remove o último dono',
  pg_temp.erro($$update membros_empresa set papel = 'funcionario'$$) like 'A empresa precisa%', null;
insert into r(teste, ok, detalhe) select 'não cria venda direto (só RPC)',
  pg_temp.erro(format($$insert into vendas (empresa_id) values (%L)$$, :'ea')) like 'permission denied%', null;

insert into contas_pagar (empresa_id, descricao, valor, vencimento) values (:'ea', 'Aluguel', 1500, hoje() - 2) returning id as cpa \gset
insert into r(teste, ok) select 'conta atrasada calculada', (select situacao from v_contas_pagar where id = :'cpa') = 'atrasada';
insert into r(teste, ok, detalhe) select 'não marca paga direto',
  pg_temp.erro(format($$update contas_pagar set status = 'paga' where id = %L$$, :'cpa')) like 'Para pagar%', null;
update contas_pagar set descricao = 'Aluguel loja' where id = :'cpa';
insert into r(teste, ok) select 'edita conta aberta', (select descricao from contas_pagar where id = :'cpa') = 'Aluguel loja';

insert into convites (empresa_id, nome, papel) values (:'ea', 'Caio', 'funcionario') returning token as tok \gset
insert into storage.objects (bucket_id, name) values ('anexos', :'ea' || '/contas_pagar/boleto.pdf');
reset role;

-- ---------- Bia cria empresa B e tenta ver/mexer na A
select pg_temp.como('bbbbbbbb-0000-0000-0000-000000000002');
select criar_empresa('Mercearia B') as eb \gset
insert into clientes (empresa_id, nome) values (:'eb', 'Cliente da B');
insert into r(teste, ok) select 'B não vê clientes de A', (select count(*) from clientes where empresa_id = :'ea') = 0;
insert into r(teste, ok) select 'B não vê produtos de A', (select count(*) from v_produtos) = 0;
insert into r(teste, ok) select 'B não vê empresa A', (select count(*) from empresas) = 1;
insert into r(teste, ok) select 'B não vê contas de A', (select count(*) from v_contas_pagar) = 0;
insert into r(teste, ok) select 'B não vê anexo de A', (select count(*) from storage.objects) = 0;
insert into r(teste, ok, detalhe) select 'B não grava na empresa A',
  pg_temp.erro(format($$insert into clientes (empresa_id, nome) values (%L, 'Invasor')$$, :'ea')) like '%row-level security%', null;
insert into r(teste, ok, detalhe) select 'B não move registro para A',
  pg_temp.erro(format($$update clientes set empresa_id = %L$$, :'ea')) like 'Não é permitido mover%', null;
insert into r(teste, ok, detalhe) select 'B não sobe arquivo na pasta de A',
  pg_temp.erro(format($$insert into storage.objects (bucket_id, name) values ('anexos', %L)$$, :'ea' || '/x.pdf')) like '%row-level security%', null;
insert into r(teste, ok, detalhe) select 'B não lista usuários de A',
  pg_temp.erro(format($$select * from listar_membros(%L)$$, :'ea')) like 'Somente o dono%', null;
reset role;

-- ---------- Caio aceita o convite como funcionário
select pg_temp.como('cccccccc-0000-0000-0000-000000000003');
insert into r(teste, ok) select 'info do convite', (select situacao from info_convite(:'tok')) = 'valido';
select aceitar_convite(:'tok') as e_caio \gset
insert into r(teste, ok) select 'convite aceito na empresa A', :'e_caio' = :'ea';
insert into r(teste, ok) select 'convite não reutilizável', (select situacao from info_convite(:'tok')) = 'usado';
insert into r(teste, ok) select 'funcionário vê produtos', (select count(*) from v_produtos) = 1;
insert into r(teste, ok) select 'funcionário NÃO vê custo na view', (select preco_custo is null and margem_percentual is null from v_produtos limit 1);
insert into r(teste, ok, detalhe) select 'funcionário NÃO lê custo na tabela',
  pg_temp.erro($$select preco_custo from produtos$$) like 'permission denied%', null;
insert into r(teste, ok) select 'funcionário NÃO vê contas a pagar', (select count(*) from contas_pagar) = 0;
insert into r(teste, ok) select 'funcionário NÃO vê caixa', (select count(*) from v_saldo_contas) = 0;
insert into r(teste, ok) select 'funcionário NÃO vê anexos', (select count(*) from storage.objects) = 0;
insert into r(teste, ok) select 'funcionário vê clientes sem dívida', (select valor_devido is null from v_clientes_resumo limit 1);
insert into r(teste, ok, detalhe) select 'funcionário não cadastra produto',
  pg_temp.erro(format($$insert into produtos (empresa_id, nome, preco_venda) values (%L, 'X', 1)$$, :'ea')) like '%row-level security%', null;
insert into clientes (empresa_id, nome) values (:'ea', 'Bar da Esquina');
insert into r(teste, ok) select 'funcionário cadastra cliente', (select count(*) from clientes) = 2;
insert into movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, observacao)
values (:'ea', :'pa', 'perda', -2, 'Lata amassada');
insert into r(teste, ok) select 'funcionário lança perda e estoque baixa', (select estoque_atual from v_produtos where id = :'pa') = 8;
insert into r(teste, ok, detalhe) select 'perda com sinal errado é recusada',
  pg_temp.erro(format($$insert into movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade) values (%L, %L, 'perda', 5)$$, :'ea', :'pa')) is not null, null;
reset role;

-- ---------- Bloqueio de assinatura
update empresas set status_assinatura = 'bloqueada' where id = :'ea';
select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into r(teste, ok) select 'empresa bloqueada: dados somem', (select count(*) from clientes) = 0;
insert into r(teste, ok) select 'empresa bloqueada: ainda vê a empresa (aviso)', (select count(*) from empresas) = 1;
reset role;
update empresas set status_assinatura = 'ativa' where id = :'ea';

-- ---------- Integridade entre empresas e numeração (como admin do banco)
select set_config('app.sem_caixa', 'on', false) \gset
insert into r(teste, ok, detalhe) select 'FK composta impede venda de B com cliente de A',
  pg_temp.erro(format($$insert into vendas (empresa_id, cliente_id) values (%L, (select id from clientes where empresa_id = %L limit 1))$$, :'eb', :'ea')) like '%foreign key%', null;
insert into vendas (empresa_id) values (:'ea'), (:'ea'), (:'eb');
insert into r(teste, ok) select 'numeração de pedido por empresa',
  (select array_agg(numero order by numero) from vendas where empresa_id = :'ea') = '{1,2}'
  and (select numero from vendas where empresa_id = :'eb') = 1;
insert into r(teste, ok) select 'auditoria registrando', (select count(*) from auditoria where empresa_id = :'ea') > 5;

select pg_temp.como('aaaaaaaa-0000-0000-0000-000000000001');
insert into r(teste, ok) select 'dono lista 2 usuários', (select count(*) from listar_membros(:'ea')) = 2;
insert into r(teste, ok) select 'dono vê anexo', (select count(*) from storage.objects) = 1;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
