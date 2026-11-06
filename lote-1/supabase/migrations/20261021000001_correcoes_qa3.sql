-- =====================================================================
-- Correções da 3ª rodada do QA (12/10/2026)
--  1. Limite de usuários do plano vale também ao devolver o acesso a alguém
--  2. Conta de dinheiro (tipo caixa) não fica negativa: saída maior que o saldo é recusada
--  3. Não dá para desativar a única conta de dinheiro nem uma conta com saldo
--  4. Datas muito antigas: caixa/venda até 60 dias atrás; conta a receber até 1 ano atrás
--  5. Dono troca a senha do funcionário → as sessões abertas dele caem
-- (app.sem_caixa = 'on' continua liberando os dados de demonstração)
-- =====================================================================

-- ---------- 1. limite de usuários
create or replace function public.tg_membro_limite_plano()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limite int;
  v_ativos int;
begin
  if new.ativo and not old.ativo then
    select p.limite_usuarios into v_limite
    from public.empresas e left join public.planos p on p.id = e.plano_id where e.id = new.empresa_id;
    select count(*) into v_ativos from public.membros_empresa
    where empresa_id = new.empresa_id and ativo and id <> new.id;
    if v_limite is not null and v_ativos >= v_limite then
      raise exception 'O plano desta empresa permite até % usuários. Tire o acesso de alguém antes ou fale com o suporte para mudar o plano.', v_limite;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t03_limite_plano on public.membros_empresa;
create trigger t03_limite_plano before update on public.membros_empresa
  for each row execute function public.tg_membro_limite_plano();

-- ---------- 2 e 4. lançamentos: dinheiro não fica negativo; nada muito antigo
create or replace function public.saldo_conta(p_conta uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select cf.saldo_inicial
       + coalesce(sum(l.valor) filter (where l.tipo = 'entrada'), 0)
       - coalesce(sum(l.valor) filter (where l.tipo = 'saida'), 0)
  from public.contas_financeiras cf
  left join public.lancamentos_caixa l on l.conta_financeira_id = cf.id and l.status = 'confirmado' and l.data <= public.hoje()
  where cf.id = p_conta
  group by cf.id
$$;
revoke execute on function public.saldo_conta(uuid) from public, anon;

create or replace function public.tg_lancamento_regras()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tipo  public.tipo_conta_financeira;
  v_nome  text;
  v_saldo numeric;
begin
  if coalesce(current_setting('app.sem_caixa', true), '') = 'on' then return new; end if;
  if new.data < public.hoje() - 60 then
    raise exception 'A data não pode ser de mais de 60 dias atrás (%).', to_char(new.data, 'DD/MM/YYYY');
  end if;
  if new.tipo = 'saida' and new.status = 'confirmado' then
    select tipo, nome into v_tipo, v_nome from public.contas_financeiras where id = new.conta_financeira_id;
    if v_tipo = 'caixa' then
      v_saldo := coalesce(public.saldo_conta(new.conta_financeira_id), 0);
      if new.valor > v_saldo then
        raise exception 'Não tem esse dinheiro em "%": o saldo é %. Confira o valor ou use outra conta.', v_nome, public.brl(v_saldo);
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t02_regras on public.lancamentos_caixa;
create trigger t02_regras before insert on public.lancamentos_caixa
  for each row execute function public.tg_lancamento_regras();

create or replace function public.tg_venda_data_antiga()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.sem_caixa', true), '') <> 'on'
     and public.dia_sp(new.data_venda) < public.hoje() - 60 then
    raise exception 'A data da venda não pode ser de mais de 60 dias atrás.';
  end if;
  return new;
end $$;
drop trigger if exists t06_data_antiga on public.vendas;
create trigger t06_data_antiga before insert on public.vendas
  for each row execute function public.tg_venda_data_antiga();

create or replace function public.tg_receber_vencimento_antigo()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.sem_caixa', true), '') <> 'on'
     and new.vencimento < public.hoje() - 365 then
    raise exception 'O vencimento não pode ser de mais de 1 ano atrás.';
  end if;
  return new;
end $$;
drop trigger if exists t02_vencimento_antigo on public.contas_receber;
create trigger t02_vencimento_antigo before insert on public.contas_receber
  for each row execute function public.tg_receber_vencimento_antigo();

-- ---------- 3. conta de dinheiro
create or replace function public.tg_conta_financeira_desativar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_saldo numeric;
begin
  if old.ativo and not new.ativo then
    v_saldo := coalesce(public.saldo_conta(old.id), 0);
    if v_saldo <> 0 then
      raise exception 'A conta "%" ainda tem saldo de %. Transfira o saldo para outra conta antes de desativar.', old.nome, public.brl(v_saldo);
    end if;
    if old.tipo = 'caixa' and not exists (
      select 1 from public.contas_financeiras where empresa_id = old.empresa_id and tipo = 'caixa' and ativo and id <> old.id) then
      raise exception 'Esta é a única conta de dinheiro. As vendas em dinheiro entram nela; crie outra antes de desativar.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t02_desativar on public.contas_financeiras;
create trigger t02_desativar before update on public.contas_financeiras
  for each row execute function public.tg_conta_financeira_desativar();

-- ---------- 5. troca de senha derruba as sessões
CREATE OR REPLACE FUNCTION public.redefinir_senha_membro(p_empresa uuid, p_membro uuid, p_senha text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_usuario uuid;
  v_email   text;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono da empresa pode trocar a senha de um funcionário.';
  end if;
  if coalesce(length(p_senha), 0) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;

  select m.usuario_id, u.email into v_usuario, v_email
  from public.membros_empresa m join auth.users u on u.id = m.usuario_id
  where m.id = p_membro and m.empresa_id = p_empresa and m.papel = 'funcionario';
  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.';
  end if;
  if v_email not like '%@login.enchanting-hotteok-31650d.netlify.app' then
    raise exception 'Este funcionário entra com e-mail. Ele mesmo troca a senha em "Esqueci minha senha".';
  end if;

  update auth.users
     set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now()
   where id = v_usuario;

  -- Derruba quem estava logado com a senha antiga (o acesso atual expira em até 1 hora)
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using v_usuario;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'update auth.refresh_tokens set revoked = true where user_id = $1::text' using v_usuario;
  end if;

  insert into public.auditoria (empresa_id, tabela, registro_id, acao, depois, usuario_id)
  values (p_empresa, 'membros_empresa', p_membro, 'update', jsonb_build_object('senha_trocada_pelo_dono', true), auth.uid());
end $function$;
