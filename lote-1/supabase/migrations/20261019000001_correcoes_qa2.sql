-- =====================================================================
-- Correções da 2ª rodada do QA (12/10/2026)
--  1. Cancelar compra volta o preço de custo de antes
--  2. Quantidade: unidade inteira (un, cx, fardo, pct) não aceita fração; venda até 9.999 por item
--  3. Fiado/boleto: vencimento não pode ser antes da data da venda
--  4. Caixa esquecido aberto de outro dia: qualquer pessoa da empresa pode fechar
--  5. Nome de produto/cliente/fornecedor com no máximo 120 letras
-- =====================================================================

-- ---------- helpers de unidade
create or replace function public.unidade_fracionada(u public.unidade_produto)
returns boolean language sql immutable as $$ select u in ('kg', 'l') $$;

create or replace function public.nome_unidade(u public.unidade_produto)
returns text language sql immutable as $$
  select case u when 'un' then 'unidade' when 'cx' then 'caixa' when 'fardo' then 'fardo'
                when 'pct' then 'pacote' when 'kg' then 'kg' else 'litro' end
$$;

-- ---------- 1. custo antes da compra
alter table public.compra_itens add column if not exists custo_anterior numeric(14,2);

create or replace function public.tg_compra_item_custo_anterior()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select preco_custo into new.custo_anterior from public.produtos where id = new.produto_id;
  return new;
end $$;
drop trigger if exists t02_custo_anterior on public.compra_itens;
create trigger t02_custo_anterior before insert on public.compra_itens
  for each row execute function public.tg_compra_item_custo_anterior();

CREATE OR REPLACE FUNCTION public.cancelar_compra(p_compra uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c  public.compras%rowtype;
  it record;
begin
  select * into c from public.compras where id = p_compra for update;
  if not found or not public.pode_gerenciar(c.empresa_id) then
    raise exception 'Compra não encontrada.';
  end if;
  if c.status = 'cancelada' then
    raise exception 'Esta compra já foi cancelada.';
  end if;

  perform set_config('app.rpc', 'on', true);

  update public.compras
  set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = nullif(trim(p_motivo), '')
  where id = c.id;

  for it in select produto_id, quantidade, custo_unitario from public.compra_itens where compra_id = c.id loop
    insert into public.movimentacoes_estoque
      (empresa_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, fornecedor_id, observacao)
    values
      (c.empresa_id, it.produto_id, 'estorno_compra', -it.quantidade, it.custo_unitario, 'compra', c.id, c.fornecedor_id,
       'Cancelamento de compra' || coalesce(' · NF ' || c.numero_nota, ''));
  end loop;

  -- Custo: se o produto ainda está com o custo desta compra, volta para o custo de antes dela
  update public.produtos p
     set preco_custo = ci.custo_anterior
    from public.compra_itens ci
   where ci.compra_id = c.id and ci.custo_anterior is not null
     and p.id = ci.produto_id and p.preco_custo = ci.custo_unitario
     and p.preco_custo is distinct from ci.custo_anterior;

  update public.lancamentos_caixa
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = 'Compra cancelada'
  where status = 'confirmado'
    and id in (select lancamento_caixa_id from public.contas_pagar where compra_id = c.id and lancamento_caixa_id is not null);

  update public.contas_pagar
  set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = 'Compra cancelada'
  where compra_id = c.id and status <> 'cancelada';

  perform set_config('app.rpc', 'off', true);
end $function$;

-- ---------- 2. quantidades
create or replace function public.tg_mov_quantidade_inteira()
returns trigger language plpgsql set search_path = public as $$
declare
  v_unid public.unidade_produto;
  v_nome text;
begin
  if new.tipo in ('estorno_venda', 'estorno_compra') then return new; end if;
  if new.tipo = 'ajuste' and new.origem_tipo <> 'cadastro' then return new; end if; -- contagem: conferida na RPC
  select unidade, nome into v_unid, v_nome from public.produtos where id = new.produto_id;
  if not public.unidade_fracionada(v_unid) and new.quantidade <> trunc(new.quantidade) then
    raise exception '"%" é vendido por %: use um número inteiro (sem vírgula).', v_nome, public.nome_unidade(v_unid);
  end if;
  return new;
end $$;
drop trigger if exists t00_quantidade_inteira on public.movimentacoes_estoque;
create trigger t00_quantidade_inteira before insert on public.movimentacoes_estoque
  for each row execute function public.tg_mov_quantidade_inteira();

create or replace function public.tg_venda_item_limite()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.quantidade > 9999 then
    raise exception 'Quantidade muito alta para "%" (máximo 9.999 por item). Confira o que foi digitado.', new.descricao;
  end if;
  return new;
end $$;
drop trigger if exists t02_limite_quantidade on public.venda_itens;
create trigger t02_limite_quantidade before insert on public.venda_itens
  for each row execute function public.tg_venda_item_limite();

CREATE OR REPLACE FUNCTION public.lancar_movimentacao(p_produto uuid, p_tipo tipo_mov_estoque, p_quantidade numeric, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid;
  v_atual   numeric(14,3);
  v_qtd     numeric(14,3);
  v_id      uuid;
  v_unid    public.unidade_produto;
  v_nome    text;
begin
  select empresa_id, estoque_atual, unidade, nome into v_empresa, v_atual, v_unid, v_nome
  from public.produtos where id = p_produto
  for update;

  if not found or not public.pode_acessar(v_empresa) then
    raise exception 'Produto não encontrado.';
  end if;
  if p_quantidade is null then
    raise exception 'Informe a quantidade.';
  end if;

  if not public.unidade_fracionada(v_unid) and p_quantidade <> trunc(p_quantidade) then
    raise exception '"%" é contado por %: use um número inteiro (sem vírgula).', v_nome, public.nome_unidade(v_unid);
  end if;

  if p_tipo in ('perda', 'uso_interno') then
    if p_quantidade <= 0 then
      raise exception 'Informe uma quantidade maior que zero.';
    end if;
    if p_quantidade > greatest(v_atual, 0) then
      raise exception 'A saída (%) é maior que o estoque (%). Se o estoque está errado, use "Ajuste de contagem".',
        replace(rtrim(to_char(p_quantidade, 'FM999999990.999'), '.'), '.', ','),
        replace(rtrim(to_char(v_atual, 'FM999999990.999'), '.'), '.', ',');
    end if;
    v_qtd := -p_quantidade;
  elsif p_tipo = 'ajuste' then
    if p_quantidade < 0 then
      raise exception 'A contagem não pode ser negativa.';
    end if;
    v_qtd := p_quantidade - v_atual;
    if v_qtd = 0 then
      raise exception 'O estoque já está com essa quantidade.';
    end if;
  else
    raise exception 'Para dar entrada de mercadoria, use "Registrar compra".';
  end if;

  insert into public.movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, origem_tipo, observacao)
  values (v_empresa, p_produto, p_tipo, v_qtd, 'manual', nullif(trim(p_observacao), ''))
  returning id into v_id;

  return v_id;
end $function$;

-- ---------- 3. vencimento do fiado/boleto
create or replace function public.tg_venda_pagamento_vencimento()
returns trigger language plpgsql set search_path = public as $$
declare v_dia date;
begin
  if new.forma in ('a_prazo', 'boleto') and new.primeiro_vencimento is not null then
    select public.dia_sp(data_venda) into v_dia from public.vendas where id = new.venda_id;
    if new.primeiro_vencimento < v_dia then
      raise exception 'O vencimento do % não pode ser antes da data da venda.',
        case when new.forma = 'boleto' then 'boleto' else 'fiado' end;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t02_vencimento on public.venda_pagamentos;
create trigger t02_vencimento before insert on public.venda_pagamentos
  for each row execute function public.tg_venda_pagamento_vencimento();

-- ---------- 4. caixa esquecido aberto
CREATE OR REPLACE FUNCTION public.fechar_caixa(p_turno uuid, p_valor_contado numeric, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if t.aberto_por <> auth.uid() and not public.pode_gerenciar(t.empresa_id)
     and (t.aberto_em at time zone 'America/Sao_Paulo')::date >= public.hoje() then
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
end $function$;

-- ---------- 5. tamanho dos nomes (not valid: não mexe no que já existe)
alter table public.produtos     drop constraint if exists produtos_nome_tamanho;
alter table public.produtos     add constraint produtos_nome_tamanho check (char_length(nome) <= 120) not valid;
alter table public.clientes     drop constraint if exists clientes_nome_tamanho;
alter table public.clientes     add constraint clientes_nome_tamanho check (char_length(nome) <= 120) not valid;
alter table public.fornecedores drop constraint if exists fornecedores_nome_tamanho;
alter table public.fornecedores add constraint fornecedores_nome_tamanho check (char_length(nome) <= 120) not valid;
