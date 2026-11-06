-- =====================================================================
-- Abertura e fechamento de caixa (turnos) — pedido do Yuri, 12/10/2026
-- * Quem abre é o usuário logado (não se digita nome). Informa quanto tem na gaveta.
-- * Só um caixa aberto por empresa (um balcão). Troca de funcionário = fecha e o próximo abre.
-- * Só vende (venda do dia) com caixa aberto. A venda fica ligada ao turno.
-- * No fechamento informa quanto tem na gaveta; o sistema calcula o esperado e a diferença
--   e mostra também para quem fechou (decisão do Yuri).
-- Esperado = abertura + entradas em dinheiro (contas do tipo "caixa") lançadas no turno
--            − saídas em dinheiro lançadas no turno
--            − entradas de antes do turno canceladas durante o turno (ex.: devolução de venda antiga)
--            + saídas de antes do turno canceladas durante o turno.
-- =====================================================================

create type public.status_turno as enum ('aberto', 'fechado');

create table public.caixa_turnos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id),
  numero           bigint not null,
  status           public.status_turno not null default 'aberto',
  aberto_por       uuid not null references auth.users(id),
  aberto_em        timestamptz not null default now(),
  valor_abertura   numeric(14,2) not null check (valor_abertura >= 0),
  fechado_por      uuid references auth.users(id),
  fechado_em       timestamptz,
  valor_contado    numeric(14,2) check (valor_contado >= 0),
  valor_esperado   numeric(14,2),
  diferenca        numeric(14,2),
  observacoes      text,
  created_at       timestamptz not null default now(),
  unique (empresa_id, numero),
  unique (empresa_id, id)
);
-- Um caixa aberto por vez em cada empresa
create unique index caixa_turnos_um_aberto on public.caixa_turnos (empresa_id) where status = 'aberto';
create index caixa_turnos_empresa_idx on public.caixa_turnos (empresa_id, aberto_em desc);

alter table public.vendas add column turno_id uuid;
alter table public.vendas add constraint vendas_turno_fk foreign key (empresa_id, turno_id) references public.caixa_turnos (empresa_id, id);
create index vendas_turno_idx on public.vendas (turno_id);

alter table public.caixa_turnos enable row level security;
-- Dono vê todos; funcionário vê o caixa aberto e os turnos que ele abriu ou fechou
create policy turnos_select on public.caixa_turnos for select to authenticated
  using (public.pode_gerenciar(empresa_id)
         or (public.pode_acessar(empresa_id) and (status = 'aberto' or aberto_por = auth.uid() or fechado_por = auth.uid())));
revoke insert, update, delete, truncate on public.caixa_turnos from authenticated, anon;
revoke all on public.caixa_turnos from anon;

-- ---------------------------------------------------------------------
-- Venda do dia precisa de caixa aberto (liga a venda ao turno)
-- ---------------------------------------------------------------------
create or replace function public.tg_venda_turno()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_turno uuid;
begin
  if coalesce(current_setting('app.sem_caixa', true), '') = 'on' then
    return new;
  end if;
  -- Venda lançada com data passada (só o dono faz) não passa pelo caixa de hoje
  if public.dia_sp(new.data_venda) < public.hoje() then
    return new;
  end if;
  select id into v_turno from public.caixa_turnos where empresa_id = new.empresa_id and status = 'aberto';
  if v_turno is null then
    raise exception 'O caixa está fechado. Abra o caixa para vender.';
  end if;
  new.turno_id := v_turno;
  return new;
end $$;
create trigger t05_venda_turno before insert on public.vendas for each row execute function public.tg_venda_turno();

-- ---------------------------------------------------------------------
-- Cálculo do esperado em dinheiro de um turno
-- ---------------------------------------------------------------------
create or replace function public._caixa_esperado(p_turno uuid, p_ate timestamptz)
returns numeric language sql stable security definer set search_path = public as $$
  with t as (select * from public.caixa_turnos where id = p_turno),
  l as (
    select l.* from public.lancamentos_caixa l
    join public.contas_financeiras c on c.id = l.conta_financeira_id and c.tipo = 'caixa'
    join t on t.empresa_id = l.empresa_id
  )
  select (select valor_abertura from t)
    + coalesce((select sum(case when tipo = 'entrada' then valor else -valor end) from l, t
                where l.created_at >= t.aberto_em and l.created_at < p_ate
                  and (l.status = 'confirmado' or l.cancelado_em >= p_ate)), 0)
    - coalesce((select sum(case when tipo = 'entrada' then valor else -valor end) from l, t
                where l.created_at < t.aberto_em
                  and l.status <> 'confirmado' and l.cancelado_em >= t.aberto_em and l.cancelado_em < p_ate), 0);
$$;
revoke execute on function public._caixa_esperado(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Abrir caixa
-- ---------------------------------------------------------------------
create or replace function public.abrir_caixa(p_empresa uuid, p_valor numeric, p_observacoes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_numero bigint;
  v_quem   text;
begin
  if not public.pode_acessar(p_empresa) then
    raise exception 'Você não tem acesso a esta empresa.';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'Informe quanto tem de dinheiro na gaveta (pode ser 0).';
  end if;
  perform pg_advisory_xact_lock(hashtext('caixa:' || p_empresa));
  select coalesce(p.nome, 'outra pessoa') into v_quem
  from public.caixa_turnos t left join public.perfis p on p.id = t.aberto_por
  where t.empresa_id = p_empresa and t.status = 'aberto';
  if found then
    raise exception 'O caixa já está aberto por %. Ele precisa fechar o caixa antes.', v_quem;
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.caixa_turnos where empresa_id = p_empresa;
  insert into public.caixa_turnos (empresa_id, numero, aberto_por, valor_abertura, observacoes)
  values (p_empresa, v_numero, auth.uid(), round(p_valor, 2), nullif(trim(p_observacoes), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Fechar caixa (quem abriu ou o dono). Devolve o resumo do turno.
-- ---------------------------------------------------------------------
create or replace function public.fechar_caixa(p_turno uuid, p_valor_contado numeric, p_observacoes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t          public.caixa_turnos;
  v_agora    timestamptz := now();
  v_esperado numeric;
  v_vendas   int;
begin
  select * into t from public.caixa_turnos where id = p_turno for update;
  if not found or not public.pode_acessar(t.empresa_id) then
    raise exception 'Caixa não encontrado.';
  end if;
  if t.status <> 'aberto' then
    raise exception 'Este caixa já foi fechado.';
  end if;
  if t.aberto_por <> auth.uid() and not public.pode_gerenciar(t.empresa_id) then
    raise exception 'Só quem abriu o caixa (ou o dono) pode fechar.';
  end if;
  if p_valor_contado is null or p_valor_contado < 0 then
    raise exception 'Informe quanto tem de dinheiro na gaveta.';
  end if;

  v_esperado := round(public._caixa_esperado(p_turno, v_agora), 2);
  update public.caixa_turnos
     set status = 'fechado', fechado_por = auth.uid(), fechado_em = v_agora,
         valor_contado = round(p_valor_contado, 2), valor_esperado = v_esperado,
         diferenca = round(p_valor_contado, 2) - v_esperado,
         observacoes = coalesce(nullif(trim(p_observacoes), ''), observacoes)
   where id = p_turno;
  select count(*) into v_vendas from public.vendas where turno_id = p_turno and status <> 'cancelado';

  return jsonb_build_object(
    'turno_id', p_turno, 'numero', t.numero,
    'valor_abertura', t.valor_abertura, 'valor_contado', round(p_valor_contado, 2),
    'valor_esperado', v_esperado, 'diferenca', round(p_valor_contado, 2) - v_esperado,
    'vendas', v_vendas, 'aberto_em', t.aberto_em, 'fechado_em', v_agora);
end $$;

-- Caixa aberto agora (para a tela). O valor esperado parcial só vai para o dono.
create or replace function public.caixa_atual(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.caixa_turnos;
  r jsonb;
begin
  if not public.pode_acessar(p_empresa) then
    raise exception 'Você não tem acesso a esta empresa.';
  end if;
  select * into t from public.caixa_turnos where empresa_id = p_empresa and status = 'aberto';
  if not found then
    return jsonb_build_object('aberto', false,
      'ultimo_contado', (select valor_contado from public.caixa_turnos
                         where empresa_id = p_empresa and status = 'fechado' order by fechado_em desc limit 1));
  end if;
  r := jsonb_build_object('aberto', true, 'id', t.id, 'numero', t.numero, 'aberto_em', t.aberto_em,
         'aberto_por', t.aberto_por, 'aberto_por_nome', (select nome from public.perfis where id = t.aberto_por),
         'valor_abertura', t.valor_abertura, 'sou_eu', t.aberto_por = auth.uid());
  if public.pode_gerenciar(p_empresa) then
    r := r || jsonb_build_object('esperado_agora', round(public._caixa_esperado(t.id, now()), 2),
                                 'vendas', (select count(*) from public.vendas where turno_id = t.id and status <> 'cancelado'));
  end if;
  return r;
end $$;

-- Histórico de turnos para o dono
create view public.v_caixa_turnos with (security_invoker = true) as
select t.*,
       pa.nome as aberto_por_nome,
       pf.nome as fechado_por_nome,
       (select count(*) from public.vendas v where v.turno_id = t.id and v.status <> 'cancelado') as qtd_vendas
from public.caixa_turnos t
left join public.perfis pa on pa.id = t.aberto_por
left join public.perfis pf on pf.id = t.fechado_por;

revoke execute on function public.abrir_caixa(uuid, numeric, text) from public, anon;
revoke execute on function public.fechar_caixa(uuid, numeric, text) from public, anon;
revoke execute on function public.caixa_atual(uuid) from public, anon;
grant  execute on function public.abrir_caixa(uuid, numeric, text) to authenticated;
grant  execute on function public.fechar_caixa(uuid, numeric, text) to authenticated;
grant  execute on function public.caixa_atual(uuid) to authenticated;
grant  select on public.v_caixa_turnos to authenticated;
revoke all on public.v_caixa_turnos from anon;

-- Empresa de demonstração: as vendas de exemplo não passam pelo caixa
alter function public.criar_empresa_demonstracao() rename to _demo_base2;
revoke execute on function public._demo_base2() from public, anon, authenticated;
create or replace function public.criar_empresa_demonstracao()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
begin
  perform set_config('app.sem_caixa', 'on', true);
  v_emp := public._demo_base2();
  perform set_config('app.sem_caixa', '', true);
  return v_emp;
end $$;
revoke execute on function public.criar_empresa_demonstracao() from public, anon;
grant  execute on function public.criar_empresa_demonstracao() to authenticated;
