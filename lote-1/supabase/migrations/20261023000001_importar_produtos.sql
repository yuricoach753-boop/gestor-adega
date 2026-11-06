-- =====================================================================
-- Importar produtos de planilha (pedido do Yuri em 23/10/2026)
-- Recebe as linhas já lidas no site (Excel/CSV/TXT) e cadastra ou atualiza em lote.
--   p_itens: [{"linha": 2, "nome": "...", "codigo_barras": "...", "codigo": "...", "unidade": "un",
--              "preco_venda": 5.5, "preco_custo": 3.2, "estoque": 24, "estoque_minimo": 6,
--              "categoria": "Cervejas", "ncm": "22030000"}]
--   p_existentes: 'atualizar' (preço, custo, mínimo, categoria e dados vazios) ou 'pular'
--   p_ajustar_estoque: true → produto que já existe fica com o estoque da planilha (lançado como contagem)
-- Uma linha com erro não impede as outras. Só o dono.
-- =====================================================================
create or replace function public.importar_produtos(
  p_empresa         uuid,
  p_itens           jsonb,
  p_existentes      text default 'atualizar',
  p_ajustar_estoque boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it        record;
  v_prod    public.produtos%rowtype;
  v_cat     uuid;
  v_nome    text;
  v_barras  text;
  v_cod     text;
  v_unid    public.unidade_produto;
  v_criados int := 0;
  v_atual   int := 0;
  v_pulados int := 0;
  v_erros   jsonb := '[]'::jsonb;
  v_achou   boolean;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode importar produtos.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A planilha não tem produtos.';
  end if;
  if jsonb_array_length(p_itens) > 1000 then
    raise exception 'Mande no máximo 1.000 produtos por vez.';
  end if;
  if p_existentes not in ('atualizar', 'pular') then
    raise exception 'Opção inválida para produtos que já existem.';
  end if;

  for it in
    select * from jsonb_to_recordset(p_itens) as x(
      linha int, nome text, codigo_barras text, codigo text, unidade text,
      preco_venda numeric, preco_custo numeric, estoque numeric, estoque_minimo numeric,
      categoria text, ncm text)
  loop
    begin
      v_nome   := left(regexp_replace(trim(coalesce(it.nome, '')), '\s+', ' ', 'g'), 120);
      v_barras := nullif(regexp_replace(coalesce(it.codigo_barras, ''), '\D', '', 'g'), '');
      v_cod    := nullif(trim(coalesce(it.codigo, '')), '');
      v_unid   := coalesce(nullif(lower(trim(it.unidade)), '')::public.unidade_produto, 'un');

      -- já existe? (código de barras → código interno → mesmo nome)
      v_achou := false;
      if v_barras is not null then
        select * into v_prod from public.produtos where empresa_id = p_empresa and codigo_barras = v_barras order by ativo desc limit 1;
        v_achou := found;
      end if;
      if not v_achou and v_cod is not null then
        select * into v_prod from public.produtos where empresa_id = p_empresa and lower(codigo) = lower(v_cod) limit 1;
        v_achou := found;
      end if;
      if not v_achou and v_nome <> '' then
        select * into v_prod from public.produtos where empresa_id = p_empresa and nome_busca = public.sem_acento(v_nome) order by ativo desc limit 1;
        v_achou := found;
      end if;

      -- categoria pelo nome (cria se não existir)
      v_cat := null;
      if nullif(trim(coalesce(it.categoria, '')), '') is not null then
        select id into v_cat from public.categorias
        where empresa_id = p_empresa and tipo = 'produto' and public.sem_acento(nome) = public.sem_acento(trim(it.categoria)) limit 1;
        if v_cat is null then
          insert into public.categorias (empresa_id, nome, tipo) values (p_empresa, left(trim(it.categoria), 60), 'produto')
          returning id into v_cat;
        end if;
      end if;

      if v_achou then
        if p_existentes = 'pular' then
          v_pulados := v_pulados + 1;
          continue;
        end if;
        if it.preco_venda is not null and it.preco_venda < 0 then raise exception 'Preço de venda negativo.'; end if;
        update public.produtos set
          preco_venda    = coalesce(nullif(round(it.preco_venda, 2), 0), preco_venda),
          preco_custo    = coalesce(nullif(round(it.preco_custo, 2), 0), preco_custo),
          estoque_minimo = coalesce(it.estoque_minimo, estoque_minimo),
          categoria_id   = coalesce(v_cat, categoria_id),
          codigo_barras  = coalesce(codigo_barras, v_barras),
          codigo         = coalesce(codigo, v_cod),
          ncm            = coalesce(ncm, nullif(regexp_replace(coalesce(it.ncm, ''), '\D', '', 'g'), '')),
          ativo          = true
        where id = v_prod.id;
        if p_ajustar_estoque and it.estoque is not null and it.estoque <> v_prod.estoque_atual then
          perform public.lancar_movimentacao(v_prod.id, 'ajuste', greatest(it.estoque, 0), 'Importação de planilha');
        end if;
        v_atual := v_atual + 1;
      else
        if v_nome = '' then raise exception 'Sem nome do produto.'; end if;
        if it.preco_venda is null or it.preco_venda <= 0 then raise exception 'Sem preço de venda.'; end if;
        insert into public.produtos
          (empresa_id, codigo, codigo_barras, nome, categoria_id, unidade, preco_custo, preco_venda,
           estoque_atual, estoque_minimo, ncm)
        values
          (p_empresa, v_cod, v_barras, v_nome, v_cat, v_unid, greatest(round(coalesce(it.preco_custo, 0), 2), 0),
           round(it.preco_venda, 2), greatest(coalesce(it.estoque, 0), 0), greatest(coalesce(it.estoque_minimo, 0), 0),
           nullif(regexp_replace(coalesce(it.ncm, ''), '\D', '', 'g'), ''));
        v_criados := v_criados + 1;
      end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object('linha', it.linha, 'nome', it.nome,
        'mensagem', case
          when sqlerrm like '%produtos_codigo_uk%' then 'Código interno já usado em outro produto.'
          when sqlerrm like '%invalid input value for enum%' then 'Unidade desconhecida.'
          when sqlerrm like '%produtos_nome_tamanho%' then 'Nome com mais de 120 letras.'
          else sqlerrm end);
    end;
  end loop;

  return jsonb_build_object('criados', v_criados, 'atualizados', v_atual, 'pulados', v_pulados, 'erros', v_erros);
end $$;
revoke execute on function public.importar_produtos(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.importar_produtos(uuid, jsonb, text, boolean) to authenticated;
