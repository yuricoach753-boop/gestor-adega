-- =====================================================================
-- FASE 6 · PAINEL DE SUPER ADMIN E CONTROLE DE ASSINATURA
-- Super admin = perfis.is_super_admin (você). Ele gerencia empresas, planos e
-- mensalidades, mas NÃO lê os dados de operação dos clientes (só contagens de uso).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configurações gerais do sistema (uma linha só)
-- ---------------------------------------------------------------------
create table public.config_sistema (
  id                boolean primary key default true check (id),
  trial_dias        int not null default 14 check (trial_dias between 0 and 365),
  dias_tolerancia   int not null default 7 check (dias_tolerancia between 0 and 90),
  suporte_whatsapp  text,
  updated_at        timestamptz not null default now()
);
insert into public.config_sistema default values;

alter table public.config_sistema enable row level security;
revoke all on public.config_sistema from anon;
revoke insert, update, delete, truncate on public.config_sistema from authenticated;
grant update (trial_dias, dias_tolerancia, suporte_whatsapp) on public.config_sistema to authenticated;
create policy config_select on public.config_sistema for select to authenticated using (true);
create policy config_update on public.config_sistema for update to authenticated
  using (public.eh_super_admin()) with check (public.eh_super_admin());
create trigger t01_antes_update before update on public.config_sistema
  for each row execute function public.tg_antes_update();

-- ---------------------------------------------------------------------
-- Ajustes de tabelas
-- ---------------------------------------------------------------------
alter table public.empresas add column observacoes_admin text;   -- anotações suas sobre o cliente

alter table public.pagamentos_assinatura
  add column meses               int not null default 1 check (meses between 1 and 24),
  add column vencimento_anterior date,
  add column novo_vencimento     date,
  add column cancelado_em        timestamptz,
  add column cancelado_por       uuid references auth.users(id),
  add column motivo_cancelamento text;

-- Teste grátis usa a configuração do sistema
alter table public.empresas alter column trial_ate drop default;

create or replace function public.tg_empresa_trial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status_assinatura = 'trial' and new.trial_ate is null then
    new.trial_ate := public.hoje() + coalesce((select trial_dias from public.config_sistema), 14);
  end if;
  return new;
end $$;

create trigger t02_trial before insert on public.empresas
  for each row execute function public.tg_empresa_trial();

-- ---------------------------------------------------------------------
-- Empresa liberada: agora também bloqueia sozinha quem passou da tolerância,
-- mesmo antes do agendamento diário mudar o status.
-- ---------------------------------------------------------------------
create or replace function public.empresa_liberada(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.empresas e
    where e.id = p_empresa
      and (
        (e.status_assinatura = 'trial' and coalesce(e.trial_ate, public.hoje()) >= public.hoje())
        or (e.status_assinatura in ('ativa', 'inadimplente')
            and (e.assinatura_vence_em is null
                 or e.assinatura_vence_em >= public.hoje() - coalesce((select dias_tolerancia from public.config_sistema), 7)))
      )
  )
$$;

-- Situação legível de uma empresa
create or replace function public.situacao_assinatura(e public.empresas)
returns text language sql stable set search_path = public as $$
  select case
    when e.status_assinatura = 'trial' and coalesce(e.trial_ate, public.hoje()) < public.hoje() then 'trial_vencido'
    when e.status_assinatura = 'trial' then 'trial'
    when e.status_assinatura in ('ativa', 'inadimplente') and e.assinatura_vence_em is not null
         and e.assinatura_vence_em < public.hoje() - coalesce((select dias_tolerancia from public.config_sistema), 7) then 'bloqueada'
    when e.status_assinatura in ('ativa', 'inadimplente') and e.assinatura_vence_em < public.hoje() then 'vencida'
    when e.status_assinatura = 'ativa' and e.assinatura_vence_em <= public.hoje() + 5 then 'vencendo'
    else e.status_assinatura::text
  end
$$;

-- ---------------------------------------------------------------------
-- Rotina diária: ativa vencida → inadimplente; passou da tolerância → bloqueada
-- ---------------------------------------------------------------------
create or replace function public.atualizar_status_assinaturas()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_tol int := coalesce((select dias_tolerancia from public.config_sistema), 7);
  v1 int; v2 int;
begin
  update public.empresas set status_assinatura = 'inadimplente'
  where status_assinatura = 'ativa' and assinatura_vence_em < public.hoje();
  get diagnostics v1 = row_count;

  update public.empresas set status_assinatura = 'bloqueada'
  where status_assinatura = 'inadimplente' and assinatura_vence_em < public.hoje() - v_tol;
  get diagnostics v2 = row_count;

  return v1 + v2;
end $$;

-- ---------------------------------------------------------------------
-- ADMIN: lista de empresas com assinatura e sinais de uso
-- ---------------------------------------------------------------------
create or replace function public.admin_listar_empresas()
returns table (
  id uuid, nome_fantasia text, cidade text, uf char(2), telefone text, email text, created_at timestamptz,
  status_assinatura public.status_assinatura, situacao text, liberada boolean,
  trial_ate date, assinatura_vence_em date, plano_id uuid, plano_nome text, valor_mensal numeric,
  usa_dados_exemplo boolean, observacoes_admin text,
  qtd_usuarios int, dono_nome text, dono_email text, dono_telefone text, convite_pendente boolean,
  ultimo_acesso timestamptz, vendas_30d int, ultima_venda timestamptz,
  total_pago numeric, ultimo_pagamento date
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  return query
  select
    e.id, e.nome_fantasia, e.cidade, e.uf, e.telefone, e.email, e.created_at,
    e.status_assinatura, public.situacao_assinatura(e), public.empresa_liberada(e.id),
    e.trial_ate, e.assinatura_vence_em, e.plano_id, p.nome, p.valor_mensal,
    e.usa_dados_exemplo, e.observacoes_admin,
    (select count(*)::int from public.membros_empresa m where m.empresa_id = e.id and m.ativo),
    d.nome, d.email, d.telefone,
    exists (select 1 from public.convites c where c.empresa_id = e.id and c.papel = 'dono'
            and c.aceito_em is null and c.cancelado_em is null and c.expira_em > now()),
    (select max(u.last_sign_in_at) from public.membros_empresa m join auth.users u on u.id = m.usuario_id
      where m.empresa_id = e.id and m.ativo),
    (select count(*)::int from public.vendas v where v.empresa_id = e.id and v.status <> 'cancelado'
      and v.data_venda >= now() - interval '30 days'),
    (select max(v.data_venda) from public.vendas v where v.empresa_id = e.id),
    (select coalesce(sum(pa.valor), 0) from public.pagamentos_assinatura pa
      where pa.empresa_id = e.id and pa.pago_em is not null and pa.cancelado_em is null),
    (select max(pa.pago_em) from public.pagamentos_assinatura pa where pa.empresa_id = e.id and pa.cancelado_em is null)
  from public.empresas e
  left join public.planos p on p.id = e.plano_id
  left join lateral (
    select pf.nome, u.email::text as email, pf.telefone
    from public.membros_empresa m
    join auth.users u on u.id = m.usuario_id
    left join public.perfis pf on pf.id = m.usuario_id
    where m.empresa_id = e.id and m.papel = 'dono' and m.ativo
    order by m.created_at limit 1
  ) d on true
  order by e.created_at desc;
end $$;

-- ADMIN: usuários de uma empresa (para suporte)
create or replace function public.admin_usuarios_empresa(p_empresa uuid)
returns table (usuario_id uuid, nome text, email text, telefone text, papel public.papel_usuario, ativo boolean,
               ultimo_acesso timestamptz, desde timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  return query
  select m.usuario_id, pf.nome, u.email::text, pf.telefone, m.papel, m.ativo, u.last_sign_in_at, m.created_at
  from public.membros_empresa m
  join auth.users u on u.id = m.usuario_id
  left join public.perfis pf on pf.id = m.usuario_id
  where m.empresa_id = p_empresa
  order by m.ativo desc, m.papel, pf.nome;
end $$;

-- ADMIN: números do negócio
create or replace function public.admin_resumo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_ini date := date_trunc('month', public.hoje())::date;
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  select jsonb_build_object(
    'empresas',          count(*) filter (where not e.usa_dados_exemplo),
    'pagantes',          count(*) filter (where not e.usa_dados_exemplo and public.situacao_assinatura(e) in ('ativa', 'vencendo')),
    'em_teste',          count(*) filter (where not e.usa_dados_exemplo and public.situacao_assinatura(e) = 'trial'),
    'teste_acabando',    count(*) filter (where not e.usa_dados_exemplo and e.status_assinatura = 'trial' and e.trial_ate between public.hoje() and public.hoje() + 3),
    'vencendo',          count(*) filter (where not e.usa_dados_exemplo and public.situacao_assinatura(e) = 'vencendo'),
    'atrasadas',         count(*) filter (where not e.usa_dados_exemplo and public.situacao_assinatura(e) in ('vencida', 'inadimplente')),
    'bloqueadas',        count(*) filter (where not e.usa_dados_exemplo and public.situacao_assinatura(e) in ('bloqueada', 'trial_vencido')),
    'canceladas',        count(*) filter (where not e.usa_dados_exemplo and e.status_assinatura = 'cancelada'),
    'mrr',               coalesce(sum(p.valor_mensal) filter (where not e.usa_dados_exemplo and e.status_assinatura in ('ativa', 'inadimplente')), 0),
    'recebido_mes',      (select coalesce(sum(valor), 0) from public.pagamentos_assinatura
                          where pago_em >= v_ini and cancelado_em is null),
    'novas_mes',         count(*) filter (where not e.usa_dados_exemplo and e.created_at >= v_ini)
  ) into r
  from public.empresas e left join public.planos p on p.id = e.plano_id;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- ADMIN: criar empresa para um cliente e gerar o link de convite do dono
-- ---------------------------------------------------------------------
create or replace function public.admin_criar_empresa(
  p_nome_fantasia text,
  p_nome_dono     text default null,
  p_telefone      text default null,
  p_email         text default null,
  p_plano         uuid default null,
  p_trial_dias    int default null,
  p_cidade        text default null,
  p_uf            text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp   uuid;
  v_token text;
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  if coalesce(trim(p_nome_fantasia), '') = '' then
    raise exception 'Informe o nome da empresa.';
  end if;
  if p_trial_dias is not null and (p_trial_dias < 0 or p_trial_dias > 365) then
    raise exception 'O teste grátis precisa ser entre 0 e 365 dias.';
  end if;

  insert into public.empresas (nome_fantasia, telefone, email, cidade, uf, plano_id, trial_ate)
  values (trim(p_nome_fantasia), nullif(trim(p_telefone), ''), nullif(trim(p_email), ''),
          nullif(trim(p_cidade), ''), nullif(upper(trim(p_uf)), ''), p_plano,
          case when p_trial_dias is not null then public.hoje() + p_trial_dias end)
  returning id into v_emp;

  perform public.criar_padroes_empresa(v_emp);

  insert into public.convites (empresa_id, nome, email, papel, expira_em)
  values (v_emp, nullif(trim(p_nome_dono), ''), nullif(trim(p_email), ''), 'dono', now() + interval '30 days')
  returning token into v_token;

  return jsonb_build_object('empresa_id', v_emp, 'token', v_token);
end $$;

-- ADMIN: novo link de convite de dono (o anterior é cancelado)
create or replace function public.admin_convite_dono(p_empresa uuid, p_nome text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'Empresa não encontrada.';
  end if;
  update public.convites set cancelado_em = now()
  where empresa_id = p_empresa and papel = 'dono' and aceito_em is null and cancelado_em is null;
  insert into public.convites (empresa_id, nome, papel, expira_em)
  values (p_empresa, nullif(trim(p_nome), ''), 'dono', now() + interval '30 days')
  returning token into v_token;
  return v_token;
end $$;

-- ---------------------------------------------------------------------
-- ADMIN: alterar assinatura (status, plano, datas, anotações)
-- ---------------------------------------------------------------------
create or replace function public.admin_atualizar_assinatura(
  p_empresa       uuid,
  p_status        public.status_assinatura,
  p_plano         uuid,
  p_trial_ate     date,
  p_vence_em      date,
  p_observacoes   text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'Empresa não encontrada.';
  end if;
  if p_status = 'trial' and p_trial_ate is null then
    raise exception 'Informe até quando vai o teste grátis.';
  end if;
  if p_status in ('ativa', 'inadimplente') and p_vence_em is null then
    raise exception 'Informe até quando a mensalidade está paga (vencimento).';
  end if;
  if p_plano is not null and not exists (select 1 from public.planos where id = p_plano) then
    raise exception 'Plano não encontrado.';
  end if;

  update public.empresas
  set status_assinatura = p_status, plano_id = p_plano, trial_ate = p_trial_ate,
      assinatura_vence_em = p_vence_em, observacoes_admin = nullif(trim(p_observacoes), '')
  where id = p_empresa;
end $$;

-- ---------------------------------------------------------------------
-- ADMIN: registrar mensalidade recebida
--   Em dia: o próximo vencimento conta a partir do vencimento atual (mantém o ciclo).
--   Em teste, bloqueada, cancelada ou sem vencimento: conta a partir da data do pagamento.
-- ---------------------------------------------------------------------
create or replace function public.admin_registrar_pagamento(
  p_empresa    uuid,
  p_valor      numeric,
  p_pago_em    date default null,
  p_forma      text default 'pix',
  p_meses      int default 1,
  p_observacao text default null
)
returns date language plpgsql security definer set search_path = public as $$
declare
  e        public.empresas%rowtype;
  v_pago   date := coalesce(p_pago_em, public.hoje());
  v_base   date;
  v_novo   date;
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  select * into e from public.empresas where id = p_empresa for update;
  if not found then
    raise exception 'Empresa não encontrada.';
  end if;
  if coalesce(p_valor, -1) < 0 then
    raise exception 'Informe o valor recebido.';
  end if;
  if p_meses is null or p_meses < 1 or p_meses > 24 then
    raise exception 'Informe de 1 a 24 meses.';
  end if;
  if v_pago > public.hoje() then
    raise exception 'A data do pagamento não pode ser no futuro.';
  end if;

  v_base := case
    when e.status_assinatura in ('ativa', 'inadimplente') and e.assinatura_vence_em is not null
         and e.assinatura_vence_em >= public.hoje() - coalesce((select dias_tolerancia from public.config_sistema), 7)
      then e.assinatura_vence_em
    else v_pago
  end;
  v_novo := (v_base + make_interval(months => p_meses))::date;

  insert into public.pagamentos_assinatura
    (empresa_id, competencia, valor, vencimento, pago_em, forma, observacao, meses, vencimento_anterior, novo_vencimento)
  values
    (p_empresa, date_trunc('month', v_base)::date, round(p_valor, 2), v_base, v_pago, nullif(trim(p_forma), ''),
     nullif(trim(p_observacao), ''), p_meses, e.assinatura_vence_em, v_novo);

  update public.empresas set status_assinatura = 'ativa', assinatura_vence_em = v_novo where id = p_empresa;
  return v_novo;
end $$;

-- ADMIN: cancelar um pagamento lançado errado (volta o vencimento se ainda for o deste pagamento)
create or replace function public.admin_cancelar_pagamento(p_pagamento uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pa public.pagamentos_assinatura%rowtype;
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  select * into pa from public.pagamentos_assinatura where id = p_pagamento for update;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;
  if pa.cancelado_em is not null then
    raise exception 'Este pagamento já foi cancelado.';
  end if;

  update public.pagamentos_assinatura
  set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = nullif(trim(p_motivo), '')
  where id = pa.id;

  update public.empresas
  set assinatura_vence_em = pa.vencimento_anterior,
      status_assinatura = case
        when pa.vencimento_anterior is null then 'inadimplente'
        when pa.vencimento_anterior < public.hoje() then 'inadimplente'
        else status_assinatura end
  where id = pa.empresa_id and assinatura_vence_em = pa.novo_vencimento;
end $$;

-- ADMIN: rodar a atualização de status na hora
create or replace function public.admin_atualizar_status()
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_super_admin() then
    raise exception 'Acesso restrito ao administrador do sistema.';
  end if;
  return public.atualizar_status_assinaturas();
end $$;

-- ---------------------------------------------------------------------
-- Pagamentos de assinatura: o dono consulta os seus; sem escrita direta
-- ---------------------------------------------------------------------
drop policy if exists pag_assinatura_admin_insert on public.pagamentos_assinatura;
drop policy if exists pag_assinatura_admin_update on public.pagamentos_assinatura;
revoke insert, update on public.pagamentos_assinatura from authenticated;

-- ---------------------------------------------------------------------
-- Agendamento diário (se pg_cron estiver ativo): 09:20 UTC = 06:20 em Brasília
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('atualizar-assinaturas', '20 9 * * *', 'select public.atualizar_status_assinaturas()');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function public.atualizar_status_assinaturas() from public, anon, authenticated;
revoke execute on function public.situacao_assinatura(public.empresas) from public, anon;
grant execute on function public.situacao_assinatura(public.empresas) to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_listar_empresas()',
    'public.admin_usuarios_empresa(uuid)',
    'public.admin_resumo()',
    'public.admin_criar_empresa(text, text, text, text, uuid, int, text, text)',
    'public.admin_convite_dono(uuid, text)',
    'public.admin_atualizar_assinatura(uuid, public.status_assinatura, uuid, date, date, text)',
    'public.admin_registrar_pagamento(uuid, numeric, date, text, int, text)',
    'public.admin_cancelar_pagamento(uuid, text)',
    'public.admin_atualizar_status()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
