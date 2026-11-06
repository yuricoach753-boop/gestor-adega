-- =====================================================================
-- Login do funcionário pelo WhatsApp (sem e-mail) — 12/10/2026
-- O app cria o usuário com um "e-mail interno" <numeros>@login.enchanting-hotteok-31650d.netlify.app.
-- Como esse endereço não recebe e-mail, o dono troca a senha do funcionário por aqui.
-- Só vale para logins pelo WhatsApp (nunca mexe em conta com e-mail de verdade).
-- =====================================================================

create or replace function public.redefinir_senha_membro(p_empresa uuid, p_membro uuid, p_senha text)
returns void language plpgsql security definer set search_path = public, extensions as $$
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

  insert into public.auditoria (empresa_id, tabela, registro_id, acao, depois, usuario_id)
  values (p_empresa, 'membros_empresa', p_membro, 'update', jsonb_build_object('senha_trocada_pelo_dono', true), auth.uid());
end $$;
revoke execute on function public.redefinir_senha_membro(uuid, uuid, text) from public, anon;
grant  execute on function public.redefinir_senha_membro(uuid, uuid, text) to authenticated;
