-- =====================================================================
-- FASE 1 · 03 · SEGURANÇA (RLS + permissões de coluna) E VIEWS
-- =====================================================================
-- Regra geral:
--   * Membro ativo de empresa liberada  → pode_acessar(empresa_id)
--   * Dono de empresa liberada          → pode_gerenciar(empresa_id)
--   * Sem política de DELETE em lugar nenhum: nada é apagado.
--   * Funcionário não vê preço de custo/margem, financeiro nem relatórios.
-- =====================================================================

-- Ativa RLS em todas as tabelas do schema public
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
  end loop;
end $$;

-- Usuário compartilha alguma empresa comigo? (para ver nome de colegas)
create or replace function public.compartilha_empresa(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.membros_empresa a
    join public.membros_empresa b on b.empresa_id = a.empresa_id
    where a.usuario_id = auth.uid() and a.ativo
      and b.usuario_id = p_usuario
  )
$$;

-- ---------------------------------------------------------------------
-- NÚCLEO
-- ---------------------------------------------------------------------

-- planos
create policy planos_select on public.planos for select to authenticated
  using (ativo or public.eh_super_admin());
create policy planos_admin_insert on public.planos for insert to authenticated
  with check (public.eh_super_admin());
create policy planos_admin_update on public.planos for update to authenticated
  using (public.eh_super_admin()) with check (public.eh_super_admin());

-- empresas: membro vê a sua (mesmo bloqueada, para o app mostrar o aviso);
-- dono edita os dados cadastrais. Criação só pela RPC criar_empresa.
-- Campos de assinatura só mudam por RPC do super admin (Fase 6).
create policy empresas_select on public.empresas for select to authenticated
  using (public.eh_membro(id) or public.eh_super_admin());
create policy empresas_update on public.empresas for update to authenticated
  using (public.papel(id) = 'dono') with check (public.papel(id) = 'dono');

revoke insert, update on public.empresas from authenticated;
grant update (nome_fantasia, razao_social, cpf_cnpj, telefone, email, cep, logradouro, numero,
              complemento, bairro, cidade, uf, logo_path, mensagem_cobranca_padrao,
              usa_dados_exemplo, inscricao_estadual, regime_tributario)
  on public.empresas to authenticated;

-- perfis
create policy perfis_select on public.perfis for select to authenticated
  using (id = auth.uid() or public.compartilha_empresa(id) or public.eh_super_admin());
create policy perfis_update on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update on public.perfis from authenticated;
grant update (nome, telefone) on public.perfis to authenticated;

-- membros_empresa: cada um vê o próprio vínculo; dono vê e gerencia todos.
-- Entrada só por convite (RPC aceitar_convite).
create policy membros_select on public.membros_empresa for select to authenticated
  using (usuario_id = auth.uid() or public.pode_gerenciar(empresa_id) or public.eh_super_admin());
create policy membros_update on public.membros_empresa for update to authenticated
  using (public.pode_gerenciar(empresa_id)) with check (public.pode_gerenciar(empresa_id));

revoke insert, update on public.membros_empresa from authenticated;
grant update (papel, ativo) on public.membros_empresa to authenticated;

-- convites: só o dono
create policy convites_select on public.convites for select to authenticated
  using (public.pode_gerenciar(empresa_id));
create policy convites_insert on public.convites for insert to authenticated
  with check (public.pode_gerenciar(empresa_id) and aceito_em is null and cancelado_em is null);
create policy convites_update on public.convites for update to authenticated
  using (public.pode_gerenciar(empresa_id) and aceito_em is null)
  with check (public.pode_gerenciar(empresa_id));

revoke insert, update on public.convites from authenticated;
grant insert (empresa_id, nome, email, papel) on public.convites to authenticated;
grant update (cancelado_em) on public.convites to authenticated;

-- pagamentos de assinatura: dono consulta os seus; super admin gerencia
create policy pag_assinatura_select on public.pagamentos_assinatura for select to authenticated
  using (public.papel(empresa_id) = 'dono' or public.eh_super_admin());
create policy pag_assinatura_admin_insert on public.pagamentos_assinatura for insert to authenticated
  with check (public.eh_super_admin());
create policy pag_assinatura_admin_update on public.pagamentos_assinatura for update to authenticated
  using (public.eh_super_admin()) with check (public.eh_super_admin());

-- contadores: ninguém acessa direto (só funções internas)
revoke all on public.contadores from authenticated;

-- ---------------------------------------------------------------------
-- CADASTROS E OPERAÇÃO
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  -- Todos os membros leem e gravam
  foreach t in array array['clientes', 'fornecedores'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.pode_acessar(empresa_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.pode_acessar(empresa_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.pode_acessar(empresa_id)) with check (public.pode_acessar(empresa_id))', t);
  end loop;

  -- Todos leem, só o dono grava
  foreach t in array array['produtos', 'categorias'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.pode_acessar(empresa_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.pode_gerenciar(empresa_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.pode_gerenciar(empresa_id)) with check (public.pode_gerenciar(empresa_id))', t);
  end loop;

  -- Todos leem; gravação só pelas RPCs de venda (Fase 3)
  foreach t in array array['vendas', 'venda_itens', 'venda_pagamentos'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.pode_acessar(empresa_id))', t);
    execute format('revoke insert, update on public.%1$I from authenticated', t);
  end loop;

  -- Só o dono lê e grava
  foreach t in array array['contas_financeiras', 'recorrencias'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.pode_gerenciar(empresa_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.pode_gerenciar(empresa_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.pode_gerenciar(empresa_id)) with check (public.pode_gerenciar(empresa_id))', t);
  end loop;

  -- Só o dono lê; gravação só por RPC
  foreach t in array array['compras', 'compra_itens', 'recebimentos', 'notas_fiscais', 'notificacoes'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.pode_gerenciar(empresa_id))', t);
    execute format('revoke insert, update on public.%1$I from authenticated', t);
  end loop;
end $$;

-- Movimentações de estoque: todos leem; membros lançam perda/uso interno/ajuste.
-- Compras e vendas geram movimentações pelas RPCs. Nunca editadas.
create policy mov_select on public.movimentacoes_estoque for select to authenticated
  using (public.pode_acessar(empresa_id));
create policy mov_insert on public.movimentacoes_estoque for insert to authenticated
  with check (public.pode_acessar(empresa_id)
              and origem_tipo = 'manual'
              and tipo in ('perda', 'uso_interno', 'ajuste'));
revoke update on public.movimentacoes_estoque from authenticated;

-- Lançamentos de caixa: só o dono; lança manualmente; cancelamento por RPC (Fase 4)
create policy lanc_select on public.lancamentos_caixa for select to authenticated
  using (public.pode_gerenciar(empresa_id));
create policy lanc_insert on public.lancamentos_caixa for insert to authenticated
  with check (public.pode_gerenciar(empresa_id) and origem_tipo = 'manual' and status = 'confirmado');
revoke update on public.lancamentos_caixa from authenticated;

-- Contas a receber: só o dono. Lançamento manual permitido; recebimento por RPC.
create policy receber_select on public.contas_receber for select to authenticated
  using (public.pode_gerenciar(empresa_id));
create policy receber_insert on public.contas_receber for insert to authenticated
  with check (public.pode_gerenciar(empresa_id) and venda_id is null and status = 'aberta' and valor_recebido = 0);
create policy receber_update on public.contas_receber for update to authenticated
  using (public.pode_gerenciar(empresa_id)) with check (public.pode_gerenciar(empresa_id));

-- Contas a pagar: só o dono. Pagamento e cancelamento por RPC.
create policy pagar_select on public.contas_pagar for select to authenticated
  using (public.pode_gerenciar(empresa_id));
create policy pagar_insert on public.contas_pagar for insert to authenticated
  with check (public.pode_gerenciar(empresa_id) and status = 'aberta' and pago_em is null and lancamento_caixa_id is null);
create policy pagar_update on public.contas_pagar for update to authenticated
  using (public.pode_gerenciar(empresa_id)) with check (public.pode_gerenciar(empresa_id));

-- Auditoria: só o dono consulta; escrita só pelo trigger
create policy auditoria_select on public.auditoria for select to authenticated
  using (empresa_id is not null and public.pode_gerenciar(empresa_id));
revoke insert, update on public.auditoria from authenticated;

-- ---------------------------------------------------------------------
-- CUSTO ESCONDIDO DO FUNCIONÁRIO (permissão por coluna)
-- A tabela não entrega preco_custo / margem / custo_unitario para ninguém;
-- o dono lê esses campos pela view v_produtos e pelas RPCs de relatório.
-- ---------------------------------------------------------------------
revoke select on public.produtos from authenticated;
grant select (id, empresa_id, codigo, codigo_barras, nome, categoria_id, unidade, preco_venda,
              estoque_atual, estoque_minimo, observacoes, ativo, ncm, cest, cfop, origem_mercadoria,
              created_at, created_by, updated_at)
  on public.produtos to authenticated;

revoke select on public.venda_itens from authenticated;
grant select (id, empresa_id, venda_id, produto_id, descricao, unidade, quantidade, preco_unitario,
              desconto, subtotal, created_at)
  on public.venda_itens to authenticated;

revoke select on public.movimentacoes_estoque from authenticated;
grant select (id, empresa_id, produto_id, tipo, quantidade, estoque_anterior, estoque_posterior,
              origem_tipo, origem_id, fornecedor_id, observacao, created_at, created_by)
  on public.movimentacoes_estoque to authenticated;

-- =====================================================================
-- VIEWS
-- =====================================================================

-- Produtos: custo e margem aparecem só para o dono.
-- (view com permissão do dono do banco + filtro explícito de empresa)
create view public.v_produtos with (security_barrier = true) as
select
  p.id, p.empresa_id, p.codigo, p.codigo_barras, p.nome, p.categoria_id,
  c.nome as categoria_nome,
  p.unidade,
  case when public.pode_gerenciar(p.empresa_id) then p.preco_custo end       as preco_custo,
  p.preco_venda,
  case when public.pode_gerenciar(p.empresa_id) then p.margem_percentual end as margem_percentual,
  p.estoque_atual, p.estoque_minimo,
  (p.estoque_minimo > 0 and p.estoque_atual <= p.estoque_minimo)            as estoque_baixo,
  p.observacoes, p.ativo, p.created_at, p.updated_at
from public.produtos p
left join public.categorias c on c.id = p.categoria_id
where public.pode_acessar(p.empresa_id);

-- Movimentações com custo (só dono vê o custo)
create view public.v_movimentacoes_estoque with (security_barrier = true) as
select
  m.id, m.empresa_id, m.produto_id, p.nome as produto_nome, m.tipo, m.quantidade,
  case when public.pode_gerenciar(m.empresa_id) then m.custo_unitario end as custo_unitario,
  m.estoque_anterior, m.estoque_posterior, m.origem_tipo, m.origem_id,
  m.fornecedor_id, m.observacao, m.created_at, m.created_by,
  pf.nome as criado_por_nome
from public.movimentacoes_estoque m
join public.produtos p on p.id = m.produto_id
left join public.perfis pf on pf.id = m.created_by
where public.pode_acessar(m.empresa_id);

-- As views abaixo respeitam o RLS de quem consulta (security_invoker)

create view public.v_clientes_resumo with (security_invoker = true) as
select
  c.*,
  coalesce(v.total_comprado, 0) as total_comprado,
  coalesce(v.qtd_compras, 0)    as qtd_compras,
  v.ultima_compra,
  case when public.pode_gerenciar(c.empresa_id) then coalesce(r.valor_devido, 0) end as valor_devido
from public.clientes c
left join lateral (
  select sum(vd.total) as total_comprado, count(*) as qtd_compras, max(vd.data_venda) as ultima_compra
  from public.vendas vd where vd.cliente_id = c.id and vd.status <> 'cancelado'
) v on true
left join lateral (
  select sum(cr.valor - cr.valor_recebido) as valor_devido
  from public.contas_receber cr where cr.cliente_id = c.id and cr.status in ('aberta', 'parcial')
) r on true;

create view public.v_fornecedores_resumo with (security_invoker = true) as
select
  f.*,
  coalesce(cp.total_comprado, 0) as total_comprado,
  cp.ultima_compra,
  coalesce(pg.valor_em_aberto, 0) as valor_em_aberto
from public.fornecedores f
left join lateral (
  select sum(co.valor_total) as total_comprado, max(co.data_compra) as ultima_compra
  from public.compras co where co.fornecedor_id = f.id and co.status = 'registrada'
) cp on true
left join lateral (
  select sum(p.valor) as valor_em_aberto
  from public.contas_pagar p where p.fornecedor_id = f.id and p.status = 'aberta'
) pg on true;

create view public.v_contas_pagar with (security_invoker = true) as
select
  cp.*,
  f.nome   as fornecedor_nome,
  cat.nome as categoria_nome,
  case
    when cp.status = 'paga'      then 'paga'
    when cp.status = 'cancelada' then 'cancelada'
    when cp.vencimento <  public.hoje() then 'atrasada'
    when cp.vencimento =  public.hoje() then 'vence_hoje'
    else 'a_vencer'
  end as situacao,
  case when cp.status = 'aberta' and cp.vencimento < public.hoje()
       then public.hoje() - cp.vencimento else 0 end as dias_atraso
from public.contas_pagar cp
left join public.fornecedores f on f.id = cp.fornecedor_id
left join public.categorias cat on cat.id = cp.categoria_id;

create view public.v_contas_receber with (security_invoker = true) as
select
  cr.*,
  cr.valor - cr.valor_recebido as saldo,
  cl.nome     as cliente_nome,
  cl.telefone as cliente_telefone,
  v.numero    as venda_numero,
  case
    when cr.status = 'paga'      then 'paga'
    when cr.status = 'cancelada' then 'cancelada'
    when cr.vencimento <  public.hoje() then 'atrasada'
    when cr.vencimento =  public.hoje() then 'vence_hoje'
    else 'a_vencer'
  end as situacao,
  case when cr.status in ('aberta', 'parcial') and cr.vencimento < public.hoje()
       then public.hoje() - cr.vencimento else 0 end as dias_atraso
from public.contas_receber cr
left join public.clientes cl on cl.id = cr.cliente_id
left join public.vendas v on v.id = cr.venda_id;

create view public.v_saldo_contas with (security_invoker = true) as
select
  cf.id, cf.empresa_id, cf.nome, cf.tipo, cf.ativo, cf.saldo_inicial,
  cf.saldo_inicial
    + coalesce(sum(l.valor) filter (where l.tipo = 'entrada'), 0)
    - coalesce(sum(l.valor) filter (where l.tipo = 'saida'), 0) as saldo_atual
from public.contas_financeiras cf
left join public.lancamentos_caixa l
  on l.conta_financeira_id = cf.id and l.status = 'confirmado' and l.data <= public.hoje()
group by cf.id;

create view public.v_fluxo_diario with (security_invoker = true) as
select
  l.empresa_id,
  l.data,
  coalesce(sum(l.valor) filter (where l.tipo = 'entrada'), 0) as entradas,
  coalesce(sum(l.valor) filter (where l.tipo = 'saida'), 0)   as saidas,
  coalesce(sum(case when l.tipo = 'entrada' then l.valor else -l.valor end), 0) as saldo_dia
from public.lancamentos_caixa l
where l.status = 'confirmado'
group by l.empresa_id, l.data;

do $$
declare v text;
begin
  foreach v in array array['v_produtos','v_movimentacoes_estoque','v_clientes_resumo','v_fornecedores_resumo',
                           'v_contas_pagar','v_contas_receber','v_saldo_contas','v_fluxo_diario'] loop
    execute format('revoke all on public.%I from anon', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- =====================================================================
-- PERMISSÕES DE FUNÇÕES
-- =====================================================================
-- Internas: ninguém chama pelo app
revoke execute on function public.proximo_numero(uuid, text)      from public, anon, authenticated;
revoke execute on function public.criar_padroes_empresa(uuid)     from public, anon, authenticated;

-- RPCs do app
revoke execute on function public.criar_empresa(text, text, text, text, text) from public, anon;
revoke execute on function public.aceitar_convite(text)                       from public, anon;
revoke execute on function public.listar_membros(uuid)                        from public, anon;
grant  execute on function public.criar_empresa(text, text, text, text, text) to authenticated;
grant  execute on function public.aceitar_convite(text)                       to authenticated;
grant  execute on function public.listar_membros(uuid)                        to authenticated;
grant  execute on function public.info_convite(text)                          to anon, authenticated;
grant  execute on function public.empresa_liberada(uuid)                      to authenticated;
