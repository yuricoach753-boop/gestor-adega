-- Testes: login pelo WhatsApp e troca de senha pelo dono
\set ON_ERROR_STOP 1
\set QUIET 1
create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;

insert into auth.users (id, email, raw_user_meta_data, encrypted_password) values
 ('a8a8a8a8-0000-0000-0000-000000000001', 'dono@f8.com', '{"nome":"Dono F8"}', crypt('velha', gen_salt('bf'))),
 ('b8b8b8b8-0000-0000-0000-000000000002', '62999990000@login.enchanting-hotteok-31650d.netlify.app', '{"nome":"Func Zap"}', crypt('velha', gen_salt('bf'))),
 ('c8c8c8c8-0000-0000-0000-000000000003', 'func@email.com', '{"nome":"Func Email"}', crypt('velha', gen_salt('bf'))),
 ('d8d8d8d8-0000-0000-0000-000000000004', 'outro@f8.com', '{"nome":"Outro"}', null);

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a8a8a8a8-0000-0000-0000-000000000001');
select criar_empresa('Empresa F8') as e \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as t1 \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as t2 \gset
reset role;
select pg_temp.como('b8b8b8b8-0000-0000-0000-000000000002'); select aceitar_convite(:'t1') \gset
reset role;
select pg_temp.como('c8c8c8c8-0000-0000-0000-000000000003'); select aceitar_convite(:'t2') \gset
reset role;
select id as m_zap from membros_empresa where usuario_id = 'b8b8b8b8-0000-0000-0000-000000000002' \gset
select id as m_mail from membros_empresa where usuario_id = 'c8c8c8c8-0000-0000-0000-000000000003' \gset
select id as m_dono from membros_empresa where usuario_id = 'a8a8a8a8-0000-0000-0000-000000000001' \gset

-- funcionário não troca senha de ninguém
select pg_temp.como('c8c8c8c8-0000-0000-0000-000000000003');
insert into r(teste, ok, detalhe) select 'funcionário não troca senha',
  pg_temp.erro(format($$select redefinir_senha_membro(%L, %L, 'nova123')$$, :'e', :'m_zap')) like 'Somente o dono%', null;
reset role;

select pg_temp.como('a8a8a8a8-0000-0000-0000-000000000001');
select redefinir_senha_membro(:'e', :'m_zap', 'nova123');
insert into r(teste, ok, detalhe) select 'senha curta recusada',
  pg_temp.erro(format($$select redefinir_senha_membro(%L, %L, '123')$$, :'e', :'m_zap')) like 'A senha precisa%', null;
insert into r(teste, ok, detalhe) select 'não mexe em conta com e-mail de verdade',
  pg_temp.erro(format($$select redefinir_senha_membro(%L, %L, 'nova123')$$, :'e', :'m_mail')) like 'Este funcionário entra com e-mail%', null;
insert into r(teste, ok, detalhe) select 'não mexe na conta do dono',
  pg_temp.erro(format($$select redefinir_senha_membro(%L, %L, 'nova123')$$, :'e', :'m_dono')) like 'Funcionário não encontrado%', null;
reset role;

select pg_temp.como('d8d8d8d8-0000-0000-0000-000000000004');
select criar_empresa('Outra F8') as e2 \gset
insert into r(teste, ok, detalhe) select 'dono de outra empresa não troca senha',
  pg_temp.erro(format($$select redefinir_senha_membro(%L, %L, 'nova123')$$, :'e2', :'m_zap')) like 'Funcionário não encontrado%', null;
reset role;

insert into r(teste, ok) select 'senha do funcionário (WhatsApp) trocada',
  (select encrypted_password = crypt('nova123', encrypted_password) from auth.users where id = 'b8b8b8b8-0000-0000-0000-000000000002');
insert into r(teste, ok) select 'senha da conta com e-mail intacta',
  (select encrypted_password = crypt('velha', encrypted_password) from auth.users where id = 'c8c8c8c8-0000-0000-0000-000000000003');
insert into r(teste, ok) select 'troca registrada na auditoria',
  exists (select 1 from auditoria where registro_id = :'m_zap' and depois ? 'senha_trocada_pelo_dono');

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
