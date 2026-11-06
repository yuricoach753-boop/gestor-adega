-- =====================================================================
-- FASE 1 · 04 · STORAGE (anexos de boleto, logo da empresa)
-- Caminho dos arquivos: {empresa_id}/{pasta}/{arquivo}
--   ex.: 7b1c.../contas_pagar/2f3a....pdf   ·   7b1c.../logo/logo.png
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Converte o 1º segmento do caminho em uuid sem quebrar se vier lixo
create or replace function public.empresa_do_caminho(p_nome text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(p_nome, '/', 1)::uuid;
exception when others then
  return null;
end $$;

-- Logo: qualquer membro vê. Demais anexos: só o dono.
create policy anexos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos' and (
      (split_part(name, '/', 2) = 'logo' and public.pode_acessar(public.empresa_do_caminho(name)))
      or public.pode_gerenciar(public.empresa_do_caminho(name))
    )
  );

create policy anexos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_gerenciar(public.empresa_do_caminho(name)));

create policy anexos_update on storage.objects for update to authenticated
  using      (bucket_id = 'anexos' and public.pode_gerenciar(public.empresa_do_caminho(name)))
  with check (bucket_id = 'anexos' and public.pode_gerenciar(public.empresa_do_caminho(name)));

-- Sem política de DELETE: anexos também não são apagados.
