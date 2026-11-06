-- Testes da Fase 6: super admin e assinatura
\set ON_ERROR_STOP 1
\set QUIET 1

create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values
 ('a6a6a6a6-0000-0000-0000-00000000000f', 'yuri@admin.com', '{"nome":"Yuri Admin"}', now()),
 ('b6b6b6b6-0000-0000-0000-000000000010', 'cliente@f6.com', '{"nome":"Cliente F6"}', now() - interval '2 days'),
 ('c6c6c6c6-0000-0000-0000-000000000011', 'curioso@f6.com', '{"nome":"Curioso"}', null);
update perfis set is_super_admin = true where id = 'a6a6a6a6-0000-0000-0000-00000000000f';

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

-- ---------- quem não é admin
select pg_temp.como('c6c6c6c6-0000-0000-0000-000000000011');
insert into r(teste, ok, detalhe) select 'não-admin não lista empresas',
  pg_temp.erro('select * from admin_listar_empresas()') like 'Acesso restrito%', null;
insert into r(teste, ok, detalhe) select 'não-admin não cria plano',
  pg_temp.erro($$insert into planos (nome, valor_mensal) values ('X', 1)$$) like '%row-level security%', null;
insert into r(teste, ok) select 'não-admin não muda configuração',
  pg_temp.erro('update config_sistema set trial_dias = 99') is null and (select trial_dias from config_sistema) = 14;
reset role;

-- ---------- admin
select pg_temp.como('a6a6a6a6-0000-0000-0000-00000000000f');
insert into planos (nome, valor_mensal, limite_usuarios) values ('Básico', 99.90, 3) returning id as plano \gset
update config_sistema set suporte_whatsapp = '62999990000', trial_dias = 7;
insert into r(teste, ok) select 'admin muda configuração', (select trial_dias from config_sistema) = 7;

select admin_criar_empresa('Distribuidora do Cliente', 'Carlos', '(62) 98888-1111', 'cliente@f6.com', :'plano', 30, 'Anápolis', 'go') as criada \gset
select (:'criada'::jsonb ->> 'empresa_id') as emp, (:'criada'::jsonb ->> 'token') as tok \gset
insert into r(teste, ok, detalhe) select 'empresa criada com teste de 30 dias e convite',
  (select status_assinatura = 'trial' and trial_ate = hoje() + 30 and uf = 'GO' from empresas where id = :'emp')
  and (select convite_pendente and qtd_usuarios = 0 from admin_listar_empresas() where id = :'emp'), null;
reset role;

-- cliente aceita o convite e vira dono
select pg_temp.como('b6b6b6b6-0000-0000-0000-000000000010');
select aceitar_convite(:'tok') \gset
insert into r(teste, ok) select 'empresa criada pelo admin já tem categorias', (select count(*) from categorias where empresa_id = :'emp') = 19;
insert into r(teste, ok) select 'cliente virou dono', (select papel from membros_empresa where empresa_id = :'emp' and usuario_id = auth.uid()) = 'dono';
insert into clientes (empresa_id, nome) values (:'emp', 'Cliente secreto');
insert into r(teste, ok, detalhe) select 'dono não altera a própria assinatura',
  pg_temp.erro(format($$update empresas set status_assinatura = 'ativa', assinatura_vence_em = '2030-01-01' where id = %L$$, :'emp')) like 'permission denied%', null;
insert into r(teste, ok, detalhe) select 'dono não registra pagamento',
  pg_temp.erro(format($$select admin_registrar_pagamento(%L, 1)$$, :'emp')) like 'Acesso restrito%', null;
select criar_empresa('Empresa de quem se cadastrou sozinho') as sozinho \gset
insert into r(teste, ok) select 'cadastro sozinho usa teste da configuração (7 dias)', (select trial_ate from empresas where id = :'sozinho') = hoje() + 7;
reset role;

select pg_temp.como('a6a6a6a6-0000-0000-0000-00000000000f');
insert into r(teste, ok) select 'admin NÃO vê clientes da empresa', (select count(*) from clientes where empresa_id = :'emp') = 0;
insert into r(teste, ok, detalhe) select 'lista mostra dono, e-mail e último acesso',
  (select dono_email = 'cliente@f6.com' and dono_nome = 'Cliente F6' and qtd_usuarios = 1 and ultimo_acesso is not null and not convite_pendente
   from admin_listar_empresas() where id = :'emp'), null;
insert into r(teste, ok) select 'admin vê usuários da empresa', (select count(*) from admin_usuarios_empresa(:'emp')) = 1;

-- pagamento a partir do teste grátis: conta da data do pagamento
select admin_registrar_pagamento(:'emp', 99.90) as v1 \gset
insert into r(teste, ok, detalhe) select 'pagamento ativa e vence em 1 mês',
  :'v1'::date = (hoje() + interval '1 month')::date and (select status_assinatura = 'ativa' from empresas where id = :'emp'), :'v1';
-- segundo pagamento (2 meses) mantém o ciclo
select admin_registrar_pagamento(:'emp', 199.80, p_meses => 2, p_forma => 'boleto') as v2 \gset
insert into r(teste, ok, detalhe) select 'segundo pagamento soma ao vencimento atual',
  :'v2'::date = (:'v1'::date + interval '2 months')::date, :'v2';
select id as pg2 from pagamentos_assinatura where empresa_id = :'emp' and meses = 2 \gset
select admin_cancelar_pagamento(:'pg2', 'Lançado em dobro');
insert into r(teste, ok) select 'cancelar pagamento volta o vencimento', (select assinatura_vence_em from empresas where id = :'emp') = :'v1'::date;
insert into r(teste, ok, detalhe) select 'resumo: MRR e recebido',
  (admin_resumo() ->> 'mrr')::numeric = 99.90 and (admin_resumo() ->> 'recebido_mes')::numeric = 99.90, admin_resumo()::text;

-- vencida dentro da tolerância: ainda liberada
select admin_atualizar_assinatura(:'emp', 'ativa', :'plano', null, hoje() - 3, 'Cliente paga dia 5');
insert into r(teste, ok) select 'vencida há 3 dias: ainda liberada', empresa_liberada(:'emp')
  and (select situacao from admin_listar_empresas() where id = :'emp') = 'vencida';
select admin_atualizar_status() as mudou \gset
insert into r(teste, ok) select 'rotina marca inadimplente', (select status_assinatura from empresas where id = :'emp') = 'inadimplente';
-- passou da tolerância
select admin_atualizar_assinatura(:'emp', 'inadimplente', :'plano', null, hoje() - 10, null);
insert into r(teste, ok) select 'passou da tolerância: bloqueia sozinha', not empresa_liberada(:'emp')
  and (select situacao from admin_listar_empresas() where id = :'emp') = 'bloqueada';
select admin_atualizar_status() \gset
insert into r(teste, ok) select 'rotina marca bloqueada', (select status_assinatura from empresas where id = :'emp') = 'bloqueada';
-- pagamento reativa contando da data do pagamento
select admin_registrar_pagamento(:'emp', 99.90) as v3 \gset
insert into r(teste, ok) select 'pagar depois de bloqueada reativa a partir de hoje',
  :'v3'::date = (hoje() + interval '1 month')::date and empresa_liberada(:'emp');
insert into r(teste, ok, detalhe) select 'ativa sem vencimento é recusada',
  pg_temp.erro(format($$select admin_atualizar_assinatura(%L, 'ativa', null, null, null)$$, :'emp')) like 'Informe até quando%', null;
select admin_convite_dono(:'emp', 'Sócio') as tok2 \gset
reset role;
insert into r(teste, ok) select 'novo convite de dono (anterior cancelado)', (select papel from convites where token = :'tok2') = 'dono';

-- dono vê o próprio histórico
select pg_temp.como('b6b6b6b6-0000-0000-0000-000000000010');
insert into r(teste, ok) select 'dono vê seus pagamentos', (select count(*) from pagamentos_assinatura where empresa_id = :'emp') = 3;
insert into r(teste, ok) select 'dono lê suporte', (select suporte_whatsapp from config_sistema) = '62999990000';
insert into r(teste, ok) select 'dono vê situação calculada', (select situacao_assinatura(e) from empresas e where id = :'emp') = 'ativa';
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
