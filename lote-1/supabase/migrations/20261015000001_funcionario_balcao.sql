-- =====================================================================
-- Funcionário = só balcão (pedido do Yuri, 12/10/2026)
-- O funcionário não vê o faturamento da loja:
--   * vendas: só as que ELE fez HOJE + pedidos ainda não entregues (de qualquer vendedor,
--     para conseguir separar/entregar o que outro lançou);
--   * itens e pagamentos seguem a mesma regra da venda;
--   * painel_resumo não devolve totais de vendas para o funcionário.
-- O dono continua vendo tudo.
-- =====================================================================

-- Regra única de visibilidade de uma venda
create or replace function public.venda_visivel(p_empresa uuid, p_vendedor uuid, p_data timestamptz, p_status public.status_venda)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_gerenciar(p_empresa)
      or (public.pode_acessar(p_empresa)
          and ((p_vendedor = auth.uid() and public.dia_sp(p_data) = public.hoje())
               or p_status in ('aberto', 'separado')));
$$;
revoke execute on function public.venda_visivel(uuid, uuid, timestamptz, public.status_venda) from public, anon;
grant  execute on function public.venda_visivel(uuid, uuid, timestamptz, public.status_venda) to authenticated;

drop policy if exists vendas_select on public.vendas;
create policy vendas_select on public.vendas for select to authenticated
  using (public.venda_visivel(empresa_id, vendedor_id, data_venda, status));

-- Itens e pagamentos: visíveis se a venda for visível (o subselect respeita o RLS de vendas)
drop policy if exists venda_itens_select on public.venda_itens;
create policy venda_itens_select on public.venda_itens for select to authenticated
  using (public.pode_gerenciar(empresa_id)
         or (public.pode_acessar(empresa_id) and exists (select 1 from public.vendas v where v.id = venda_id)));

drop policy if exists venda_pagamentos_select on public.venda_pagamentos;
create policy venda_pagamentos_select on public.venda_pagamentos for select to authenticated
  using (public.pode_gerenciar(empresa_id)
         or (public.pode_acessar(empresa_id) and exists (select 1 from public.vendas v where v.id = venda_id)));

-- Painel: o funcionário não recebe valores de venda
alter function public.painel_resumo(uuid) rename to _painel_resumo_base;
revoke execute on function public._painel_resumo_base(uuid) from public, anon, authenticated;

create or replace function public.painel_resumo(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb := public._painel_resumo_base(p_empresa);
begin
  if public.pode_gerenciar(p_empresa) then
    return r;
  end if;
  return (r - 'vendas_hoje' - 'vendas_mes')
    || jsonb_build_object('minhas_vendas_hoje', (
         select count(*) from public.vendas
         where empresa_id = p_empresa and vendedor_id = auth.uid()
           and status <> 'cancelado' and public.dia_sp(data_venda) = public.hoje()));
end $$;
revoke execute on function public.painel_resumo(uuid) from public, anon;
grant  execute on function public.painel_resumo(uuid) to authenticated;
