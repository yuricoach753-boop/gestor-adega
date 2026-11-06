-- =====================================================================
-- Fechamento do mês (pedido do Yuri em 13/10/2026)
-- Resumo do mês para mandar ao contador + modelo do Relatório Mensal de Receitas Brutas do MEI.
-- Só o dono. Receita = vendas não canceladas pela data da venda (com desconto já abatido).
-- =====================================================================
create or replace function public.relatorio_fechamento_mes(p_empresa uuid, p_mes date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ini  date := date_trunc('month', p_mes)::date;
  v_fim  date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_ano  date := date_trunc('year', p_mes)::date;
  r      jsonb;
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono pode ver relatórios.';
  end if;
  if p_mes is null or v_ini > public.hoje() then
    raise exception 'Escolha um mês que já começou.';
  end if;

  with v as (
    select vd.id, vd.subtotal, vd.desconto, vd.total, vd.status,
           (select coalesce(sum(round(i.quantidade * i.custo_unitario, 2)), 0) from public.venda_itens i where i.venda_id = vd.id) as custo,
           exists (select 1 from public.notas_fiscais nf where nf.venda_id = vd.id and nf.status = 'autorizada') as com_nota
    from public.vendas vd
    where vd.empresa_id = p_empresa and public.dia_sp(vd.data_venda) between v_ini and v_fim
  ),
  ok as (select * from v where status <> 'cancelado')
  select jsonb_build_object(
    'inicio', v_ini, 'fim', v_fim,
    'empresa', (select jsonb_build_object('nome', nome_fantasia, 'razao_social', razao_social, 'cpf_cnpj', cpf_cnpj,
                       'inscricao_estadual', inscricao_estadual, 'regime', regime_tributario, 'cidade', cidade, 'uf', uf)
                from public.empresas where id = p_empresa),
    'vendas', jsonb_build_object(
      'qtd', (select count(*) from ok),
      'bruto', (select coalesce(sum(subtotal), 0) from ok),
      'descontos', (select coalesce(sum(desconto), 0) from ok),
      'liquido', (select coalesce(sum(total), 0) from ok),
      'custo', (select coalesce(sum(custo), 0) from ok),
      'lucro_bruto', (select coalesce(sum(total - custo), 0) from ok),
      'com_nota', (select coalesce(sum(total), 0) from ok where com_nota),
      'sem_nota', (select coalesce(sum(total), 0) from ok where not com_nota),
      'canceladas_qtd', (select count(*) from v where status = 'cancelado'),
      'canceladas_total', (select coalesce(sum(total), 0) from v where status = 'cancelado')),
    'formas', coalesce((
      select jsonb_agg(jsonb_build_object('forma', forma, 'total', total) order by total desc)
      from (select vp.forma, sum(vp.valor) as total
            from public.venda_pagamentos vp join ok on ok.id = vp.venda_id
            group by vp.forma) f), '[]'::jsonb),
    'recebido_fiado', (select coalesce(sum(r.valor), 0) from public.recebimentos r
                       where r.empresa_id = p_empresa and r.status = 'confirmado' and r.data between v_ini and v_fim),
    'fiado_em_aberto', (select coalesce(sum(cr.valor - cr.valor_recebido), 0) from public.contas_receber cr
                        where cr.empresa_id = p_empresa and cr.status in ('aberta', 'parcial')),
    'compras', jsonb_build_object(
      'qtd', (select count(*) from public.compras c where c.empresa_id = p_empresa and c.status = 'registrada' and c.data_compra between v_ini and v_fim),
      'total', (select coalesce(sum(c.valor_total), 0) from public.compras c where c.empresa_id = p_empresa and c.status = 'registrada' and c.data_compra between v_ini and v_fim)),
    'despesas', coalesce((
      select jsonb_agg(jsonb_build_object('categoria', categoria, 'total', total) order by total desc)
      from (select coalesce(cat.nome, 'Sem categoria') as categoria, sum(l.valor) as total
            from public.lancamentos_caixa l left join public.categorias cat on cat.id = l.categoria_id
            where l.empresa_id = p_empresa and l.status = 'confirmado' and l.tipo = 'saida'
              and l.origem_tipo <> 'transferencia' and l.data between v_ini and v_fim
            group by coalesce(cat.nome, 'Sem categoria')) d), '[]'::jsonb),
    'despesas_total', (select coalesce(sum(l.valor), 0) from public.lancamentos_caixa l
                       where l.empresa_id = p_empresa and l.status = 'confirmado' and l.tipo = 'saida'
                         and l.origem_tipo <> 'transferencia' and l.data between v_ini and v_fim),
    'entradas_total', (select coalesce(sum(l.valor), 0) from public.lancamentos_caixa l
                       where l.empresa_id = p_empresa and l.status = 'confirmado' and l.tipo = 'entrada'
                         and l.origem_tipo <> 'transferencia' and l.data between v_ini and v_fim),
    'produtos', coalesce((
      select jsonb_agg(x order by (x->>'faturamento')::numeric desc)
      from (select jsonb_build_object('nome', p.nome, 'unidade', p.unidade, 'quantidade', sum(i.quantidade),
                     'faturamento', sum(round(i.subtotal * case when vd.subtotal > 0 then vd.total / vd.subtotal else 1 end, 2))) as x
            from public.venda_itens i join public.vendas vd on vd.id = i.venda_id join public.produtos p on p.id = i.produto_id
            where vd.empresa_id = p_empresa and vd.status <> 'cancelado' and public.dia_sp(vd.data_venda) between v_ini and v_fim
            group by p.id, p.nome, p.unidade
            order by sum(round(i.subtotal * case when vd.subtotal > 0 then vd.total / vd.subtotal else 1 end, 2)) desc limit 10) t), '[]'::jsonb),
    'receita_ano', (select coalesce(sum(vd.total), 0) from public.vendas vd
                    where vd.empresa_id = p_empresa and vd.status <> 'cancelado'
                      and public.dia_sp(vd.data_venda) between v_ano and v_fim),
    'gerado_em', now()
  ) into r;
  return r;
end $$;
revoke execute on function public.relatorio_fechamento_mes(uuid, date) from public, anon;
grant execute on function public.relatorio_fechamento_mes(uuid, date) to authenticated;
