-- =====================================================================
-- FASE 2 · PRODUTOS, ESTOQUE, COMPRAS, CLIENTES E FORNECEDORES
-- =====================================================================

-- ---------------------------------------------------------------------
-- Conta financeira padrão para uma forma de pagamento
-- dinheiro → conta tipo "caixa"; demais → conta tipo "banco"; senão a primeira ativa
-- ---------------------------------------------------------------------
create or replace function public.conta_padrao(p_empresa uuid, p_forma public.forma_pagamento)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.contas_financeiras
  where empresa_id = p_empresa and ativo
  order by (tipo = case when p_forma = 'dinheiro' then 'caixa' else 'banco' end::public.tipo_conta_financeira) desc,
           created_at
  limit 1
$$;

-- ---------------------------------------------------------------------
-- RPC: lançar perda, uso interno ou ajuste (contagem) de estoque
--   perda / uso_interno: p_quantidade = quanto saiu (número positivo)
--   ajuste:              p_quantidade = quantidade contada na prateleira
-- Qualquer membro da empresa pode usar.
-- ---------------------------------------------------------------------
create or replace function public.lancar_movimentacao(
  p_produto     uuid,
  p_tipo        public.tipo_mov_estoque,
  p_quantidade  numeric,
  p_observacao  text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
  v_atual   numeric(14,3);
  v_qtd     numeric(14,3);
  v_id      uuid;
begin
  select empresa_id, estoque_atual into v_empresa, v_atual
  from public.produtos where id = p_produto
  for update;

  if not found or not public.pode_acessar(v_empresa) then
    raise exception 'Produto não encontrado.';
  end if;
  if p_quantidade is null then
    raise exception 'Informe a quantidade.';
  end if;

  if p_tipo in ('perda', 'uso_interno') then
    if p_quantidade <= 0 then
      raise exception 'Informe uma quantidade maior que zero.';
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
end $$;

-- ---------------------------------------------------------------------
-- RPC: registrar compra (entrada de mercadoria)
--   p_itens: [{"produto_id": "...", "quantidade": 10, "custo_unitario": 32.5}, ...]
--   p_pagamento:
--     'nao_lancar' → só estoque, nada no financeiro
--     'pago'       → conta a pagar já paga + saída no caixa (hoje)
--     'a_prazo'    → contas a pagar em p_parcelas, a cada p_intervalo_dias
-- Só o dono (envolve custo).
-- ---------------------------------------------------------------------
create or replace function public.registrar_compra(
  p_empresa              uuid,
  p_itens                jsonb,
  p_fornecedor           uuid default null,
  p_numero_nota          text default null,
  p_data                 date default null,
  p_observacoes          text default null,
  p_atualizar_custo      boolean default true,
  p_pagamento            text default 'nao_lancar',
  p_forma                public.forma_pagamento default null,
  p_conta_financeira     uuid default null,
  p_primeiro_vencimento  date default null,
  p_parcelas             int default 1,
  p_intervalo_dias       int default 30
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_compra    uuid;
  v_total     numeric(14,2) := 0;
  v_sub       numeric(14,2);
  v_data      date := coalesce(p_data, public.hoje());
  v_nota      text := nullif(trim(p_numero_nota), '');
  v_forn_nome text;
  v_cat       uuid;
  v_desc      text;
  v_conta     uuid;
  v_lanc      uuid;
  v_cp        uuid;
  v_grupo     uuid;
  v_parcela   numeric(14,2);
  it          record;
  i           int;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode registrar compras.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um produto à compra.';
  end if;
  if p_pagamento not in ('nao_lancar', 'pago', 'a_prazo') then
    raise exception 'Forma de lançamento inválida.';
  end if;
  if v_data > public.hoje() then
    raise exception 'A data da compra não pode ser no futuro.';
  end if;

  if p_fornecedor is not null then
    select nome into v_forn_nome from public.fornecedores where id = p_fornecedor and empresa_id = p_empresa;
    if not found then
      raise exception 'Fornecedor não encontrado.';
    end if;
  end if;

  insert into public.compras (empresa_id, fornecedor_id, numero_nota, data_compra, observacoes)
  values (p_empresa, p_fornecedor, v_nota, v_data, nullif(trim(p_observacoes), ''))
  returning id into v_compra;

  for it in
    select * from jsonb_to_recordset(p_itens) as x(produto_id uuid, quantidade numeric, custo_unitario numeric)
  loop
    if it.produto_id is null then
      raise exception 'Escolha o produto em todas as linhas.';
    end if;
    if it.quantidade is null or it.quantidade <= 0 then
      raise exception 'A quantidade de cada produto precisa ser maior que zero.';
    end if;
    if it.custo_unitario is null or it.custo_unitario < 0 then
      raise exception 'Informe o custo de cada produto.';
    end if;

    v_sub := round(it.quantidade * it.custo_unitario, 2);
    v_total := v_total + v_sub;

    insert into public.compra_itens (empresa_id, compra_id, produto_id, quantidade, custo_unitario, subtotal)
    values (p_empresa, v_compra, it.produto_id, it.quantidade, round(it.custo_unitario, 2), v_sub);

    insert into public.movimentacoes_estoque
      (empresa_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, fornecedor_id, observacao)
    values
      (p_empresa, it.produto_id, 'compra', it.quantidade, round(it.custo_unitario, 2), 'compra', v_compra, p_fornecedor,
       'Compra' || coalesce(' · NF ' || v_nota, ''));

    if p_atualizar_custo then
      update public.produtos set preco_custo = round(it.custo_unitario, 2)
      where id = it.produto_id and empresa_id = p_empresa;
    end if;
  end loop;

  update public.compras set valor_total = v_total where id = v_compra;

  -- Financeiro
  if p_pagamento <> 'nao_lancar' and v_total > 0 then
    select id into v_cat from public.categorias
    where empresa_id = p_empresa and tipo = 'despesa' and lower(nome) = 'compra de mercadorias' and ativo
    limit 1;

    v_desc := 'Compra' || coalesce(' · ' || v_forn_nome, '') || coalesce(' · NF ' || v_nota, '');

    if p_pagamento = 'pago' then
      v_conta := coalesce(p_conta_financeira, public.conta_padrao(p_empresa, coalesce(p_forma, 'dinheiro')));
      if v_conta is null then
        raise exception 'Cadastre uma conta (Caixa ou Banco) antes de lançar pagamentos.';
      end if;

      insert into public.lancamentos_caixa
        (empresa_id, conta_financeira_id, tipo, valor, data, categoria_id, descricao, forma_pagamento, origem_tipo)
      values
        (p_empresa, v_conta, 'saida', v_total, v_data, v_cat, v_desc, coalesce(p_forma, 'dinheiro'), 'conta_pagar')
      returning id into v_lanc;

      insert into public.contas_pagar
        (empresa_id, descricao, fornecedor_id, categoria_id, valor, vencimento, forma_pagamento, compra_id,
         status, pago_em, valor_pago, conta_financeira_id, lancamento_caixa_id)
      values
        (p_empresa, v_desc, p_fornecedor, v_cat, v_total, v_data, coalesce(p_forma, 'dinheiro'), v_compra,
         'paga', v_data, v_total, v_conta, v_lanc)
      returning id into v_cp;

      update public.lancamentos_caixa set origem_id = v_cp where id = v_lanc;

    else -- a_prazo
      if p_primeiro_vencimento is null then
        raise exception 'Informe o vencimento da primeira parcela.';
      end if;
      if p_parcelas is null or p_parcelas < 1 or p_parcelas > 48 then
        raise exception 'O número de parcelas precisa ser entre 1 e 48.';
      end if;
      if p_intervalo_dias is null or p_intervalo_dias < 1 then
        raise exception 'O intervalo entre parcelas precisa ser de pelo menos 1 dia.';
      end if;

      v_grupo := gen_random_uuid();
      v_parcela := trunc(v_total / p_parcelas, 2);
      for i in 1..p_parcelas loop
        insert into public.contas_pagar
          (empresa_id, descricao, fornecedor_id, categoria_id, valor, vencimento, forma_pagamento, compra_id,
           parcela_numero, parcela_total, grupo_parcelamento_id)
        values
          (p_empresa,
           v_desc || case when p_parcelas > 1 then format(' (%s/%s)', i, p_parcelas) else '' end,
           p_fornecedor, v_cat,
           case when i = p_parcelas then v_total - v_parcela * (p_parcelas - 1) else v_parcela end,
           p_primeiro_vencimento + (i - 1) * p_intervalo_dias,
           p_forma, v_compra, i, p_parcelas, v_grupo);
      end loop;
    end if;
  end if;

  return v_compra;
end $$;

-- ---------------------------------------------------------------------
-- RPC: cancelar compra
-- Devolve (tira) o estoque e cancela as contas a pagar e saídas de caixa ligadas.
-- O preço de custo dos produtos não volta ao valor anterior.
-- ---------------------------------------------------------------------
create or replace function public.cancelar_compra(p_compra uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
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
end $$;

-- ---------------------------------------------------------------------
-- RPC: empresa de demonstração com dados de exemplo
-- Cria uma empresa SEPARADA (nada é misturado com a empresa real).
-- ---------------------------------------------------------------------
create or replace function public.criar_empresa_demonstracao()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp   uuid;
  v_forn  uuid;
  v_cat   jsonb;
  v_itens jsonb;
begin
  v_emp := public.criar_empresa('Distribuidora Exemplo (demonstração)', '(62) 99999-0000', null, 'Anápolis', 'GO');
  update public.empresas set usa_dados_exemplo = true where id = v_emp;

  select jsonb_object_agg(nome, id) into v_cat from public.categorias where empresa_id = v_emp and tipo = 'produto';

  insert into public.produtos (empresa_id, codigo, nome, categoria_id, unidade, preco_custo, preco_venda, estoque_atual, estoque_minimo)
  values
    (v_emp, 'B001', 'Cerveja lata 350ml (cx 12)',       (v_cat->>'Bebidas')::uuid,   'cx',    32.40, 42.00, 48, 10),
    (v_emp, 'B002', 'Refrigerante 2L (fardo 6)',        (v_cat->>'Bebidas')::uuid,   'fardo', 38.90, 51.00, 22,  8),
    (v_emp, 'B003', 'Água mineral 500ml (fardo 12)',    (v_cat->>'Bebidas')::uuid,   'fardo', 11.50, 18.00,  6, 10),
    (v_emp, 'B004', 'Suco de caixinha 1L',              (v_cat->>'Bebidas')::uuid,   'un',     4.20,  6.90, 60, 24),
    (v_emp, 'A001', 'Arroz tipo 1 5kg',                 (v_cat->>'Alimentos')::uuid, 'un',    21.90, 27.50, 35, 10),
    (v_emp, 'A002', 'Feijão carioca 1kg',               (v_cat->>'Alimentos')::uuid, 'un',     6.80,  8.99, 40, 15),
    (v_emp, 'A003', 'Óleo de soja 900ml (cx 20)',       (v_cat->>'Alimentos')::uuid, 'cx',   129.00, 155.00, 3,  4),
    (v_emp, 'A004', 'Açúcar cristal 5kg',               (v_cat->>'Alimentos')::uuid, 'un',    17.50, 22.90, 18,  8),
    (v_emp, 'L001', 'Detergente 500ml (cx 24)',         (v_cat->>'Limpeza')::uuid,   'cx',    38.00, 52.80, 12,  5),
    (v_emp, 'L002', 'Água sanitária 2L (cx 6)',         (v_cat->>'Limpeza')::uuid,   'cx',    24.60, 33.00,  2,  4),
    (v_emp, 'H001', 'Papel higiênico 12 rolos',         (v_cat->>'Higiene')::uuid,   'pct',   15.90, 21.90, 30, 10),
    (v_emp, 'H002', 'Sabonete 85g (cx 12)',             (v_cat->>'Higiene')::uuid,   'cx',    16.80, 23.40,  9,  6),
    (v_emp, 'O001', 'Carvão 4kg',                       (v_cat->>'Outros')::uuid,    'un',    11.00, 17.90, 25,  8),
    (v_emp, 'O002', 'Gelo em cubos 5kg',                (v_cat->>'Outros')::uuid,    'kg',     1.20,  2.50, 80, 20);

  insert into public.clientes (empresa_id, nome, telefone, bairro, cidade, uf, observacoes)
  values
    (v_emp, 'Mercadinho do Zé',        '(62) 98811-2233', 'Jundiaí',       'Anápolis', 'GO', 'Entrega às terças e sextas'),
    (v_emp, 'Bar e Petiscaria Tchê',   '(62) 99122-4455', 'Centro',        'Anápolis', 'GO', null),
    (v_emp, 'Padaria Pão Quente',      '(62) 98455-6677', 'Vila Jaiara',   'Anápolis', 'GO', 'Paga sempre no Pix'),
    (v_emp, 'Conveniência Posto Sol',  '(62) 99633-8899', 'Maracanã',      'Anápolis', 'GO', null),
    (v_emp, 'Dona Maria (consumidor)', '(62) 98100-1122', 'Bairro de Lourdes', 'Anápolis', 'GO', null);

  insert into public.fornecedores (empresa_id, nome, contato_nome, telefone, cidade, uf)
  values
    (v_emp, 'Atacadão Bebidas Centro-Oeste', 'Carlos (vendedor)', '(62) 3311-4000', 'Goiânia', 'GO'),
    (v_emp, 'Cerealista Bom Grão',           'Renata',            '(62) 3324-1200', 'Anápolis', 'GO'),
    (v_emp, 'Distribuidora Limpa Tudo',      'Marcos',            '(62) 98877-5544', 'Goiânia', 'GO');

  select id into v_forn from public.fornecedores where empresa_id = v_emp and nome = 'Distribuidora Limpa Tudo';

  -- Uma compra a prazo para já aparecer no histórico
  select jsonb_agg(jsonb_build_object('produto_id', id, 'quantidade', 10, 'custo_unitario', preco_custo))
  into v_itens
  from public.produtos where empresa_id = v_emp and codigo in ('L001', 'H001');

  perform public.registrar_compra(
    p_empresa => v_emp, p_itens => v_itens, p_fornecedor => v_forn, p_numero_nota => '004512',
    p_pagamento => 'a_prazo', p_forma => 'boleto',
    p_primeiro_vencimento => public.hoje() + 15, p_parcelas => 2, p_intervalo_dias => 30);

  return v_emp;
end $$;

-- ---------------------------------------------------------------------
-- VIEWS (respeitam o RLS de quem consulta)
-- ---------------------------------------------------------------------
create view public.v_compras with (security_invoker = true) as
select
  c.*,
  f.nome as fornecedor_nome,
  (select count(*) from public.compra_itens ci where ci.compra_id = c.id) as qtd_itens,
  pf.nome as criado_por_nome
from public.compras c
left join public.fornecedores f on f.id = c.fornecedor_id
left join public.perfis pf on pf.id = c.created_by;

create view public.v_compra_itens with (security_invoker = true) as
select ci.*, p.nome as produto_nome, p.unidade, p.codigo
from public.compra_itens ci
join public.produtos p on p.id = ci.produto_id;

revoke all on public.v_compras, public.v_compra_itens from anon;
grant select on public.v_compras, public.v_compra_itens to authenticated;

-- ---------------------------------------------------------------------
-- Permissões das funções novas
-- ---------------------------------------------------------------------
revoke execute on function public.conta_padrao(uuid, public.forma_pagamento) from public, anon, authenticated;

revoke execute on function public.lancar_movimentacao(uuid, public.tipo_mov_estoque, numeric, text) from public, anon;
revoke execute on function public.registrar_compra(uuid, jsonb, uuid, text, date, text, boolean, text, public.forma_pagamento, uuid, date, int, int) from public, anon;
revoke execute on function public.cancelar_compra(uuid, text) from public, anon;
revoke execute on function public.criar_empresa_demonstracao() from public, anon;

grant execute on function public.lancar_movimentacao(uuid, public.tipo_mov_estoque, numeric, text) to authenticated;
grant execute on function public.registrar_compra(uuid, jsonb, uuid, text, date, text, boolean, text, public.forma_pagamento, uuid, date, int, int) to authenticated;
grant execute on function public.cancelar_compra(uuid, text) to authenticated;
grant execute on function public.criar_empresa_demonstracao() to authenticated;
