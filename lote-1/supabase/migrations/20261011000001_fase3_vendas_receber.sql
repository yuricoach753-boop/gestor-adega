-- =====================================================================
-- FASE 3 · VENDAS E CONTAS A RECEBER
-- =====================================================================

-- R$ 1.234,56 (para mensagens de erro em português)
create or replace function public.brl(v numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,')
$$;

-- ---------------------------------------------------------------------
-- RPC: registrar venda
--   p_itens:      [{"produto_id": "...", "quantidade": 2, "desconto": 0}]
--                 O preço vem SEMPRE do cadastro do produto (o app não manda preço).
--   p_pagamentos: [{"forma": "pix", "valor": 50},
--                  {"forma": "a_prazo", "valor": 60, "parcelas": 2, "primeiro_vencimento": "2026-11-10", "intervalo_dias": 30}]
--                 dinheiro/pix/cartões/transferência → entrada no caixa na hora
--                 a_prazo (fiado) e boleto → contas a receber (exige cliente)
--   p_entregue:   true = venda de balcão (já sai entregue); false = pedido em aberto para separar/entregar
--   p_data:       só o dono pode lançar venda com data passada
-- Qualquer membro da empresa pode vender (inclusive fiado).
-- ---------------------------------------------------------------------
create or replace function public.registrar_venda(
  p_empresa      uuid,
  p_itens        jsonb,
  p_pagamentos   jsonb,
  p_cliente      uuid default null,
  p_desconto     numeric default 0,
  p_observacoes  text default null,
  p_entregue     boolean default true,
  p_data         date default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_venda     uuid;
  v_numero    bigint;
  v_data      date := coalesce(p_data, public.hoje());
  v_ts        timestamptz;
  v_cliente   text;
  v_sub       numeric(14,2) := 0;
  v_desc      numeric(14,2) := round(coalesce(p_desconto, 0), 2);
  v_total     numeric(14,2);
  v_soma      numeric(14,2) := 0;
  v_item_sub  numeric(14,2);
  v_item_desc numeric(14,2);
  v_valor     numeric(14,2);
  v_parcela   numeric(14,2);
  v_cat       uuid;
  v_conta     uuid;
  v_grupo     uuid;
  v_desc_txt  text;
  v_n         int;
  v_int       int;
  p           public.produtos%rowtype;
  it          record;
  pg          record;
  i           int;
begin
  if not public.pode_acessar(p_empresa) then
    raise exception 'Você não tem acesso a esta empresa.';
  end if;
  if v_data > public.hoje() then
    raise exception 'A data da venda não pode ser no futuro.';
  end if;
  if v_data < public.hoje() and not public.pode_gerenciar(p_empresa) then
    raise exception 'Só o dono pode lançar venda com data passada.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um produto à venda.';
  end if;
  if v_desc < 0 then
    raise exception 'O desconto não pode ser negativo.';
  end if;

  if p_cliente is not null then
    select nome into v_cliente from public.clientes where id = p_cliente and empresa_id = p_empresa;
    if not found then
      raise exception 'Cliente não encontrado.';
    end if;
  end if;

  v_ts := case when v_data = public.hoje() then now()
               else (v_data + time '12:00') at time zone 'America/Sao_Paulo' end;

  insert into public.vendas (empresa_id, cliente_id, data_venda, status, observacoes, vendedor_id, entregue_em)
  values (p_empresa, p_cliente, v_ts,
          case when p_entregue then 'entregue' else 'aberto' end::public.status_venda,
          nullif(trim(p_observacoes), ''), auth.uid(),
          case when p_entregue then v_ts end)
  returning id, numero into v_venda, v_numero;

  -- Itens + baixa no estoque
  for it in select * from jsonb_to_recordset(p_itens) as x(produto_id uuid, quantidade numeric, desconto numeric) loop
    select * into p from public.produtos where id = it.produto_id and empresa_id = p_empresa;
    if not found then
      raise exception 'Produto não encontrado.';
    end if;
    if not p.ativo then
      raise exception 'O produto "%" está inativo.', p.nome;
    end if;
    if it.quantidade is null or it.quantidade <= 0 then
      raise exception 'A quantidade de "%" precisa ser maior que zero.', p.nome;
    end if;

    v_item_desc := round(coalesce(it.desconto, 0), 2);
    if v_item_desc < 0 then
      raise exception 'O desconto de "%" não pode ser negativo.', p.nome;
    end if;
    v_item_sub := round(it.quantidade * p.preco_venda, 2) - v_item_desc;
    if v_item_sub < 0 then
      raise exception 'O desconto de "%" é maior que o valor do item.', p.nome;
    end if;
    v_sub := v_sub + v_item_sub;

    insert into public.venda_itens
      (empresa_id, venda_id, produto_id, descricao, unidade, quantidade, preco_unitario, desconto, custo_unitario, subtotal)
    values
      (p_empresa, v_venda, p.id, p.nome, p.unidade, it.quantidade, p.preco_venda, v_item_desc, p.preco_custo, v_item_sub);

    insert into public.movimentacoes_estoque
      (empresa_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, observacao)
    values
      (p_empresa, p.id, 'venda', -it.quantidade, p.preco_custo, 'venda', v_venda, 'Venda nº ' || v_numero);
  end loop;

  if v_desc > v_sub then
    raise exception 'O desconto (%) é maior que o valor da venda (%).', public.brl(v_desc), public.brl(v_sub);
  end if;
  v_total := v_sub - v_desc;

  update public.vendas set subtotal = v_sub, desconto = v_desc, total = v_total where id = v_venda;

  -- Pagamentos
  if v_total > 0 and (p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0) then
    raise exception 'Informe a forma de pagamento.';
  end if;

  select id into v_cat from public.categorias
  where empresa_id = p_empresa and tipo = 'receita' and lower(nome) = 'vendas' and ativo limit 1;

  v_desc_txt := 'Venda nº ' || v_numero || coalesce(' · ' || v_cliente, '');

  for pg in
    select * from jsonb_to_recordset(coalesce(p_pagamentos, '[]'::jsonb))
      as x(forma public.forma_pagamento, valor numeric, parcelas int, primeiro_vencimento date, intervalo_dias int)
  loop
    if pg.forma is null then
      raise exception 'Escolha a forma de cada pagamento.';
    end if;
    v_valor := round(coalesce(pg.valor, 0), 2);
    if v_valor <= 0 then
      raise exception 'Informe o valor de cada pagamento.';
    end if;
    v_soma := v_soma + v_valor;

    if pg.forma in ('a_prazo', 'boleto') then
      if p_cliente is null then
        raise exception 'Para vender fiado ou no boleto, escolha o cliente.';
      end if;
      if pg.primeiro_vencimento is null then
        raise exception 'Informe a data de vencimento do %.', case when pg.forma = 'boleto' then 'boleto' else 'fiado' end;
      end if;
      v_n := coalesce(pg.parcelas, 1);
      v_int := coalesce(pg.intervalo_dias, 30);
      if v_n < 1 or v_n > 48 then
        raise exception 'O número de parcelas precisa ser entre 1 e 48.';
      end if;
      if v_int < 1 then
        raise exception 'O intervalo entre parcelas precisa ser de pelo menos 1 dia.';
      end if;

      insert into public.venda_pagamentos (empresa_id, venda_id, forma, valor, parcelas, primeiro_vencimento)
      values (p_empresa, v_venda, pg.forma, v_valor, v_n, pg.primeiro_vencimento);

      v_grupo := gen_random_uuid();
      v_parcela := trunc(v_valor / v_n, 2);
      for i in 1..v_n loop
        insert into public.contas_receber
          (empresa_id, cliente_id, venda_id, descricao, valor, vencimento, parcela_numero, parcela_total, grupo_parcelamento_id)
        values
          (p_empresa, p_cliente, v_venda,
           'Venda nº ' || v_numero
             || case when pg.forma = 'boleto' then ' (boleto)' else '' end
             || case when v_n > 1 then format(' · parcela %s/%s', i, v_n) else '' end,
           case when i = v_n then v_valor - v_parcela * (v_n - 1) else v_parcela end,
           pg.primeiro_vencimento + (i - 1) * v_int,
           i, v_n, v_grupo);
      end loop;
    else
      insert into public.venda_pagamentos (empresa_id, venda_id, forma, valor)
      values (p_empresa, v_venda, pg.forma, v_valor);

      v_conta := public.conta_padrao(p_empresa, pg.forma);
      if v_conta is null then
        raise exception 'Cadastre uma conta (Caixa ou Banco) antes de vender.';
      end if;
      insert into public.lancamentos_caixa
        (empresa_id, conta_financeira_id, tipo, valor, data, categoria_id, descricao, forma_pagamento, origem_tipo, origem_id)
      values
        (p_empresa, v_conta, 'entrada', v_valor, v_data, v_cat, v_desc_txt, pg.forma, 'venda', v_venda);
    end if;
  end loop;

  if v_soma <> v_total then
    raise exception 'A soma dos pagamentos (%) não bate com o total da venda (%).', public.brl(v_soma), public.brl(v_total);
  end if;

  return v_venda;
end $$;

-- ---------------------------------------------------------------------
-- RPC: mudar status do pedido (aberto → separado → entregue)
-- ---------------------------------------------------------------------
create or replace function public.mudar_status_venda(p_venda uuid, p_status public.status_venda)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vendas%rowtype;
begin
  select * into v from public.vendas where id = p_venda for update;
  if not found or not public.pode_acessar(v.empresa_id) then
    raise exception 'Venda não encontrada.';
  end if;
  if v.status = 'cancelado' then
    raise exception 'Esta venda está cancelada.';
  end if;
  if p_status = 'cancelado' then
    raise exception 'Para cancelar, use o botão "Cancelar venda".';
  end if;
  if p_status = v.status then
    return;
  end if;

  update public.vendas
  set status      = p_status,
      separado_em = case when p_status in ('separado', 'entregue') then coalesce(separado_em, now()) else null end,
      entregue_em = case when p_status = 'entregue' then now() else null end
  where id = v.id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: cancelar venda
-- Devolve o estoque, cancela entradas no caixa, contas a receber e recebimentos ligados.
-- Dono cancela qualquer venda; funcionário só as próprias vendas do dia.
-- ---------------------------------------------------------------------
create or replace function public.cancelar_venda(p_venda uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v  public.vendas%rowtype;
  it record;
begin
  select * into v from public.vendas where id = p_venda for update;
  if not found or not public.pode_acessar(v.empresa_id) then
    raise exception 'Venda não encontrada.';
  end if;
  if v.status = 'cancelado' then
    raise exception 'Esta venda já foi cancelada.';
  end if;
  if not public.pode_gerenciar(v.empresa_id)
     and not (v.vendedor_id = auth.uid() and (v.created_at at time zone 'America/Sao_Paulo')::date = public.hoje()) then
    raise exception 'Funcionários só podem cancelar as próprias vendas do dia. Peça ao dono.';
  end if;

  perform set_config('app.rpc', 'on', true);

  update public.vendas
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = nullif(trim(p_motivo), '')
  where id = v.id;

  for it in select produto_id, quantidade, custo_unitario from public.venda_itens where venda_id = v.id loop
    insert into public.movimentacoes_estoque
      (empresa_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, observacao)
    values
      (v.empresa_id, it.produto_id, 'estorno_venda', it.quantidade, it.custo_unitario, 'venda', v.id,
       'Cancelamento da venda nº ' || v.numero);
  end loop;

  -- entradas no caixa: da própria venda (à vista) e dos recebimentos do fiado
  update public.lancamentos_caixa
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = 'Venda nº ' || v.numero || ' cancelada'
  where status = 'confirmado'
    and ((origem_tipo = 'venda' and origem_id = v.id)
         or id in (select r.lancamento_caixa_id from public.recebimentos r
                   join public.contas_receber cr on cr.id = r.conta_receber_id
                   where cr.venda_id = v.id and r.lancamento_caixa_id is not null));

  update public.recebimentos
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid()
  where status = 'confirmado'
    and conta_receber_id in (select id from public.contas_receber where venda_id = v.id);

  update public.contas_receber
  set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = 'Venda cancelada'
  where venda_id = v.id and status <> 'cancelada';

  perform set_config('app.rpc', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- RPC: lançar conta a receber manual (com parcelas). Só o dono.
-- ---------------------------------------------------------------------
create or replace function public.lancar_contas_receber(
  p_empresa             uuid,
  p_descricao           text,
  p_valor_total         numeric,
  p_primeiro_vencimento date,
  p_cliente             uuid default null,
  p_parcelas            int default 1,
  p_intervalo_dias      int default 30,
  p_observacoes         text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_total   numeric(14,2) := round(coalesce(p_valor_total, 0), 2);
  v_grupo   uuid := gen_random_uuid();
  v_parcela numeric(14,2);
  v_desc    text := trim(coalesce(p_descricao, ''));
  i         int;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode lançar contas a receber.';
  end if;
  if length(v_desc) < 2 then
    raise exception 'Informe a descrição.';
  end if;
  if v_total <= 0 then
    raise exception 'Informe o valor.';
  end if;
  if p_primeiro_vencimento is null then
    raise exception 'Informe o vencimento.';
  end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 48 then
    raise exception 'O número de parcelas precisa ser entre 1 e 48.';
  end if;
  if p_intervalo_dias is null or p_intervalo_dias < 1 then
    raise exception 'O intervalo entre parcelas precisa ser de pelo menos 1 dia.';
  end if;
  if p_cliente is not null and not exists (select 1 from public.clientes where id = p_cliente and empresa_id = p_empresa) then
    raise exception 'Cliente não encontrado.';
  end if;

  v_parcela := trunc(v_total / p_parcelas, 2);
  for i in 1..p_parcelas loop
    insert into public.contas_receber
      (empresa_id, cliente_id, descricao, valor, vencimento, parcela_numero, parcela_total, grupo_parcelamento_id, observacoes)
    values
      (p_empresa, p_cliente,
       v_desc || case when p_parcelas > 1 then format(' · parcela %s/%s', i, p_parcelas) else '' end,
       case when i = p_parcelas then v_total - v_parcela * (p_parcelas - 1) else v_parcela end,
       p_primeiro_vencimento + (i - 1) * p_intervalo_dias,
       i, p_parcelas, v_grupo, nullif(trim(p_observacoes), ''));
  end loop;
  return v_grupo;
end $$;

-- ---------------------------------------------------------------------
-- RPC: receber (total ou parcial). Lança a entrada no caixa. Só o dono.
-- ---------------------------------------------------------------------
create or replace function public.receber_conta(
  p_conta             uuid,
  p_valor             numeric,
  p_forma             public.forma_pagamento,
  p_data              date default null,
  p_conta_financeira  uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c        public.contas_receber%rowtype;
  v_valor  numeric(14,2) := round(coalesce(p_valor, 0), 2);
  v_saldo  numeric(14,2);
  v_data   date := coalesce(p_data, public.hoje());
  v_conta  uuid;
  v_cat    uuid;
  v_lanc   uuid;
  v_rec    uuid;
  v_nome   text;
begin
  select * into c from public.contas_receber where id = p_conta for update;
  if not found or not public.pode_gerenciar(c.empresa_id) then
    raise exception 'Conta não encontrada.';
  end if;
  if c.status in ('paga', 'cancelada') then
    raise exception 'Esta conta já está %.', c.status;
  end if;
  v_saldo := c.valor - c.valor_recebido;
  if v_valor <= 0 then
    raise exception 'Informe o valor recebido.';
  end if;
  if v_valor > v_saldo then
    raise exception 'O valor é maior que o saldo da conta (%).', public.brl(v_saldo);
  end if;
  if p_forma is null or p_forma = 'a_prazo' then
    raise exception 'Escolha como o cliente pagou.';
  end if;
  if v_data > public.hoje() then
    raise exception 'A data do recebimento não pode ser no futuro.';
  end if;

  if p_conta_financeira is not null then
    select id into v_conta from public.contas_financeiras where id = p_conta_financeira and empresa_id = c.empresa_id and ativo;
  end if;
  v_conta := coalesce(v_conta, public.conta_padrao(c.empresa_id, p_forma));
  if v_conta is null then
    raise exception 'Cadastre uma conta (Caixa ou Banco) antes de receber.';
  end if;

  select id into v_cat from public.categorias
  where empresa_id = c.empresa_id and tipo = 'receita' and lower(nome) = 'recebimento de clientes' and ativo limit 1;
  select nome into v_nome from public.clientes where id = c.cliente_id;

  insert into public.lancamentos_caixa
    (empresa_id, conta_financeira_id, tipo, valor, data, categoria_id, descricao, forma_pagamento, origem_tipo)
  values
    (c.empresa_id, v_conta, 'entrada', v_valor, v_data, v_cat,
     'Recebimento' || coalesce(' · ' || v_nome, '') || ' · ' || c.descricao, p_forma, 'recebimento')
  returning id into v_lanc;

  insert into public.recebimentos (empresa_id, conta_receber_id, valor, data, forma, conta_financeira_id, lancamento_caixa_id)
  values (c.empresa_id, c.id, v_valor, v_data, p_forma, v_conta, v_lanc)
  returning id into v_rec;

  update public.lancamentos_caixa set origem_id = v_rec where id = v_lanc;

  perform set_config('app.rpc', 'on', true);
  update public.contas_receber
  set valor_recebido = valor_recebido + v_valor,
      status = case when valor_recebido + v_valor >= valor then 'paga' else 'parcial' end::public.status_conta_receber,
      recebido_em = case when valor_recebido + v_valor >= valor then v_data end
  where id = c.id;
  perform set_config('app.rpc', 'off', true);

  return v_rec;
end $$;

-- ---------------------------------------------------------------------
-- RPC: estornar um recebimento (lançado errado). Só o dono.
-- ---------------------------------------------------------------------
create or replace function public.estornar_recebimento(p_recebimento uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.recebimentos%rowtype;
  c public.contas_receber%rowtype;
begin
  select * into r from public.recebimentos where id = p_recebimento for update;
  if not found or not public.pode_gerenciar(r.empresa_id) then
    raise exception 'Recebimento não encontrado.';
  end if;
  if r.status = 'cancelado' then
    raise exception 'Este recebimento já foi estornado.';
  end if;
  select * into c from public.contas_receber where id = r.conta_receber_id for update;
  if c.status = 'cancelada' then
    raise exception 'A conta deste recebimento está cancelada.';
  end if;

  perform set_config('app.rpc', 'on', true);

  update public.recebimentos set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid() where id = r.id;

  update public.lancamentos_caixa
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = 'Recebimento estornado' || coalesce(': ' || nullif(trim(p_motivo), ''), '')
  where id = r.lancamento_caixa_id and status = 'confirmado';

  update public.contas_receber
  set valor_recebido = valor_recebido - r.valor,
      status = case when valor_recebido - r.valor <= 0 then 'aberta' else 'parcial' end::public.status_conta_receber,
      recebido_em = null
  where id = c.id;

  perform set_config('app.rpc', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- RPC: cancelar conta a receber lançada manualmente. Só o dono.
-- ---------------------------------------------------------------------
create or replace function public.cancelar_conta_receber(p_conta uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.contas_receber%rowtype;
  v_num bigint;
begin
  select * into c from public.contas_receber where id = p_conta for update;
  if not found or not public.pode_gerenciar(c.empresa_id) then
    raise exception 'Conta não encontrada.';
  end if;
  if c.status = 'cancelada' then
    raise exception 'Esta conta já foi cancelada.';
  end if;
  if c.venda_id is not null then
    select numero into v_num from public.vendas where id = c.venda_id;
    raise exception 'Esta conta veio da venda nº %. Para cancelar, cancele a venda.', v_num;
  end if;
  if c.valor_recebido > 0 then
    raise exception 'Esta conta já tem recebimentos. Estorne os recebimentos antes de cancelar.';
  end if;

  perform set_config('app.rpc', 'on', true);
  update public.contas_receber
  set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = nullif(trim(p_motivo), '')
  where id = c.id;
  perform set_config('app.rpc', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------------------
create view public.v_vendas with (security_invoker = true) as
select
  v.id, v.empresa_id, v.numero, v.cliente_id, v.data_venda, v.status, v.subtotal, v.desconto, v.total,
  v.observacoes, v.vendedor_id, v.separado_em, v.entregue_em, v.cancelado_em, v.cancelado_por,
  v.motivo_cancelamento, v.created_at,
  c.nome     as cliente_nome,
  c.telefone as cliente_telefone,
  pf.nome    as vendedor_nome,
  (select count(*) from public.venda_itens i where i.venda_id = v.id) as qtd_itens,
  (select string_agg(distinct vp.forma::text, ',') from public.venda_pagamentos vp where vp.venda_id = v.id) as formas,
  (v.data_venda at time zone 'America/Sao_Paulo')::date as dia
from public.vendas v
left join public.clientes c on c.id = v.cliente_id
left join public.perfis pf on pf.id = v.vendedor_id;

create view public.v_devedores with (security_invoker = true) as
select
  cr.empresa_id,
  cr.cliente_id,
  cl.nome     as cliente_nome,
  cl.telefone as cliente_telefone,
  sum(cr.valor - cr.valor_recebido)                                              as total_devido,
  coalesce(sum(cr.valor - cr.valor_recebido) filter (where cr.vencimento < public.hoje()), 0) as total_vencido,
  count(*)                                                                       as qtd_contas,
  min(cr.vencimento)                                                             as vencimento_mais_antigo,
  greatest(max(public.hoje() - cr.vencimento), 0)                                as maior_atraso
from public.contas_receber cr
left join public.clientes cl on cl.id = cr.cliente_id
where cr.status in ('aberta', 'parcial')
group by cr.empresa_id, cr.cliente_id, cl.nome, cl.telefone;

create view public.v_recebimentos with (security_invoker = true) as
select r.*, cf.nome as conta_nome, pf.nome as criado_por_nome
from public.recebimentos r
left join public.contas_financeiras cf on cf.id = r.conta_financeira_id
left join public.perfis pf on pf.id = r.created_by;

revoke all on public.v_vendas, public.v_devedores, public.v_recebimentos from anon;
grant select on public.v_vendas, public.v_devedores, public.v_recebimentos to authenticated;

-- ---------------------------------------------------------------------
-- Empresa de demonstração: agora com vendas, fiado e recebimento
-- ---------------------------------------------------------------------
create or replace function public.criar_empresa_demonstracao()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp   uuid;
  v_forn  uuid;
  v_cat   jsonb;
  v_prod  jsonb;
  v_cli   jsonb;
  v_itens jsonb;
  v_venda uuid;
begin
  v_emp := public.criar_empresa('Distribuidora Exemplo (demonstração)', '(62) 99999-0000', null, 'Anápolis', 'GO');
  update public.empresas set usa_dados_exemplo = true where id = v_emp;

  select jsonb_object_agg(nome, id) into v_cat from public.categorias where empresa_id = v_emp and tipo = 'produto';

  insert into public.produtos (empresa_id, codigo, nome, categoria_id, unidade, preco_custo, preco_venda, estoque_atual, estoque_minimo)
  values
    (v_emp, 'B001', 'Cerveja lata 350ml (cx 12)',       (v_cat->>'Bebidas')::uuid,   'cx',    32.40, 42.00, 60, 10),
    (v_emp, 'B002', 'Refrigerante 2L (fardo 6)',        (v_cat->>'Bebidas')::uuid,   'fardo', 38.90, 51.00, 30,  8),
    (v_emp, 'B003', 'Água mineral 500ml (fardo 12)',    (v_cat->>'Bebidas')::uuid,   'fardo', 11.50, 18.00,  8, 10),
    (v_emp, 'B004', 'Suco de caixinha 1L',              (v_cat->>'Bebidas')::uuid,   'un',     4.20,  6.90, 60, 24),
    (v_emp, 'A001', 'Arroz tipo 1 5kg',                 (v_cat->>'Alimentos')::uuid, 'un',    21.90, 27.50, 40, 10),
    (v_emp, 'A002', 'Feijão carioca 1kg',               (v_cat->>'Alimentos')::uuid, 'un',     6.80,  8.99, 40, 15),
    (v_emp, 'A003', 'Óleo de soja 900ml (cx 20)',       (v_cat->>'Alimentos')::uuid, 'cx',   129.00, 155.00, 3,  4),
    (v_emp, 'A004', 'Açúcar cristal 5kg',               (v_cat->>'Alimentos')::uuid, 'un',    17.50, 22.90, 18,  8),
    (v_emp, 'L001', 'Detergente 500ml (cx 24)',         (v_cat->>'Limpeza')::uuid,   'cx',    38.00, 52.80, 12,  5),
    (v_emp, 'L002', 'Água sanitária 2L (cx 6)',         (v_cat->>'Limpeza')::uuid,   'cx',    24.60, 33.00,  2,  4),
    (v_emp, 'H001', 'Papel higiênico 12 rolos',         (v_cat->>'Higiene')::uuid,   'pct',   15.90, 21.90, 30, 10),
    (v_emp, 'H002', 'Sabonete 85g (cx 12)',             (v_cat->>'Higiene')::uuid,   'cx',    16.80, 23.40,  9,  6),
    (v_emp, 'O001', 'Carvão 4kg',                       (v_cat->>'Outros')::uuid,    'un',    11.00, 17.90, 25,  8),
    (v_emp, 'O002', 'Gelo em cubos 5kg',                (v_cat->>'Outros')::uuid,    'kg',     1.20,  2.50, 80, 20);

  -- códigos de barras de exemplo (para testar o leitor e a Consulta de preço)
  update public.produtos p set codigo_barras = v.barras
  from (values ('B001','7891000100011'), ('B002','7891000100028'), ('B003','7891000100035'), ('B004','7891000100042'),
               ('A001','7891000200018'), ('A002','7891000200025'), ('A003','7891000200032'), ('A004','7891000200049'),
               ('L001','7891000300015'), ('L002','7891000300022'), ('H001','7891000400012'), ('H002','7891000400029'),
               ('O001','7891000500019'), ('O002','7891000500026')) v(codigo, barras)
  where p.empresa_id = v_emp and p.codigo = v.codigo;

  insert into public.clientes (empresa_id, nome, telefone, bairro, cidade, uf, observacoes)
  values
    (v_emp, 'Mercadinho do Zé',        '(62) 98811-2233', 'Jundiaí',           'Anápolis', 'GO', 'Entrega às terças e sextas'),
    (v_emp, 'Bar e Petiscaria Tchê',   '(62) 99122-4455', 'Centro',            'Anápolis', 'GO', null),
    (v_emp, 'Padaria Pão Quente',      '(62) 98455-6677', 'Vila Jaiara',       'Anápolis', 'GO', 'Paga sempre no Pix'),
    (v_emp, 'Conveniência Posto Sol',  '(62) 99633-8899', 'Maracanã',          'Anápolis', 'GO', null),
    (v_emp, 'Dona Maria (consumidor)', '(62) 98100-1122', 'Bairro de Lourdes', 'Anápolis', 'GO', null);

  insert into public.fornecedores (empresa_id, nome, contato_nome, telefone, cidade, uf)
  values
    (v_emp, 'Atacadão Bebidas Centro-Oeste', 'Carlos (vendedor)', '(62) 3311-4000', 'Goiânia', 'GO'),
    (v_emp, 'Cerealista Bom Grão',           'Renata',            '(62) 3324-1200', 'Anápolis', 'GO'),
    (v_emp, 'Distribuidora Limpa Tudo',      'Marcos',            '(62) 98877-5544', 'Goiânia', 'GO');

  select id into v_forn from public.fornecedores where empresa_id = v_emp and nome = 'Distribuidora Limpa Tudo';
  select jsonb_object_agg(codigo, id) into v_prod from public.produtos where empresa_id = v_emp;
  select jsonb_object_agg(nome, id) into v_cli from public.clientes where empresa_id = v_emp;

  -- Compra a prazo
  v_itens := jsonb_build_array(
    jsonb_build_object('produto_id', v_prod->>'L001', 'quantidade', 10, 'custo_unitario', 38.00),
    jsonb_build_object('produto_id', v_prod->>'H001', 'quantidade', 10, 'custo_unitario', 15.90));
  perform public.registrar_compra(
    p_empresa => v_emp, p_itens => v_itens, p_fornecedor => v_forn, p_numero_nota => '004512',
    p_pagamento => 'a_prazo', p_forma => 'boleto',
    p_primeiro_vencimento => public.hoje() + 15, p_parcelas => 2, p_intervalo_dias => 30);

  -- Vendas dos últimos dias
  perform public.registrar_venda(v_emp,
    jsonb_build_array(jsonb_build_object('produto_id', v_prod->>'B001', 'quantidade', 5),
                      jsonb_build_object('produto_id', v_prod->>'O002', 'quantidade', 10)),
    jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', 235.00)),
    (v_cli->>'Bar e Petiscaria Tchê')::uuid, p_data => public.hoje() - 6);

  v_venda := public.registrar_venda(v_emp,
    jsonb_build_array(jsonb_build_object('produto_id', v_prod->>'A001', 'quantidade', 6),
                      jsonb_build_object('produto_id', v_prod->>'A002', 'quantidade', 10),
                      jsonb_build_object('produto_id', v_prod->>'A004', 'quantidade', 4)),
    jsonb_build_array(jsonb_build_object('forma', 'a_prazo', 'valor', 346.50, 'parcelas', 2,
                                         'primeiro_vencimento', public.hoje() - 5, 'intervalo_dias', 15)),
    (v_cli->>'Mercadinho do Zé')::uuid, p_desconto => 0.00, p_data => public.hoje() - 20);

  perform public.registrar_venda(v_emp,
    jsonb_build_array(jsonb_build_object('produto_id', v_prod->>'B002', 'quantidade', 3),
                      jsonb_build_object('produto_id', v_prod->>'B003', 'quantidade', 2)),
    jsonb_build_array(jsonb_build_object('forma', 'a_prazo', 'valor', 189.00, 'primeiro_vencimento', public.hoje() + 7)),
    (v_cli->>'Conveniência Posto Sol')::uuid, p_data => public.hoje() - 2);

  perform public.registrar_venda(v_emp,
    jsonb_build_array(jsonb_build_object('produto_id', v_prod->>'H001', 'quantidade', 2),
                      jsonb_build_object('produto_id', v_prod->>'B004', 'quantidade', 6)),
    jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor', 85.20)),
    (v_cli->>'Dona Maria (consumidor)')::uuid, p_data => public.hoje() - 1);

  perform public.registrar_venda(v_emp,
    jsonb_build_array(jsonb_build_object('produto_id', v_prod->>'B001', 'quantidade', 2),
                      jsonb_build_object('produto_id', v_prod->>'O001', 'quantidade', 3)),
    jsonb_build_array(jsonb_build_object('forma', 'cartao_debito', 'valor', 137.70)));

  perform public.registrar_venda(v_emp,
    jsonb_build_array(jsonb_build_object('produto_id', v_prod->>'B001', 'quantidade', 4),
                      jsonb_build_object('produto_id', v_prod->>'B002', 'quantidade', 2)),
    jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', 270.00)),
    (v_cli->>'Padaria Pão Quente')::uuid, p_entregue => false);

  -- Zé pagou metade da 1ª parcela do fiado
  perform public.receber_conta(
    (select id from public.contas_receber where venda_id = v_venda and parcela_numero = 1),
    100.00, 'pix', public.hoje() - 3);

  return v_emp;
end $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function public.registrar_venda(uuid, jsonb, jsonb, uuid, numeric, text, boolean, date) from public, anon;
revoke execute on function public.mudar_status_venda(uuid, public.status_venda) from public, anon;
revoke execute on function public.cancelar_venda(uuid, text) from public, anon;
revoke execute on function public.lancar_contas_receber(uuid, text, numeric, date, uuid, int, int, text) from public, anon;
revoke execute on function public.receber_conta(uuid, numeric, public.forma_pagamento, date, uuid) from public, anon;
revoke execute on function public.estornar_recebimento(uuid, text) from public, anon;
revoke execute on function public.cancelar_conta_receber(uuid, text) from public, anon;

grant execute on function public.registrar_venda(uuid, jsonb, jsonb, uuid, numeric, text, boolean, date) to authenticated;
grant execute on function public.mudar_status_venda(uuid, public.status_venda) to authenticated;
grant execute on function public.cancelar_venda(uuid, text) to authenticated;
grant execute on function public.lancar_contas_receber(uuid, text, numeric, date, uuid, int, int, text) to authenticated;
grant execute on function public.receber_conta(uuid, numeric, public.forma_pagamento, date, uuid) to authenticated;
grant execute on function public.estornar_recebimento(uuid, text) to authenticated;
grant execute on function public.cancelar_conta_receber(uuid, text) to authenticated;
