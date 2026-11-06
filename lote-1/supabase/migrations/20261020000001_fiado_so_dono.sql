-- =====================================================================
-- Pedido do Yuri (12/10/2026): funcionário NÃO vende fiado; boleto não é usado na venda de balcão.
--  Fiado (a_prazo) e boleto na venda: só quem gerencia a empresa (dono).
--  (A tela de Nova venda não mostra mais "Boleto"; o dono continua com "Fiado".)
-- =====================================================================
create or replace function public.tg_venda_pagamento_so_dono()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.forma in ('a_prazo', 'boleto') and not public.pode_gerenciar(new.empresa_id) then
    raise exception 'Só o dono pode vender fiado.';
  end if;
  return new;
end $$;
drop trigger if exists t01_fiado_so_dono on public.venda_pagamentos;
create trigger t01_fiado_so_dono before insert on public.venda_pagamentos
  for each row execute function public.tg_venda_pagamento_so_dono();
