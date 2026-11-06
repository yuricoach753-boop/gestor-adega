-- =====================================================================
-- FASE 1 · 02 · FUNÇÕES AUXILIARES, TRIGGERS E RPCs DE ACESSO
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function public.hoje()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- ---------------------------------------------------------------------
-- Funções de permissão (usadas nas políticas RLS)
-- security definer: leem membros/empresas sem cair em recursão de RLS
-- ---------------------------------------------------------------------
create or replace function public.eh_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_super_admin from public.perfis p where p.id = auth.uid()), false)
$$;

create or replace function public.eh_membro(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros_empresa m
    where m.empresa_id = p_empresa and m.usuario_id = auth.uid() and m.ativo
  )
$$;

create or replace function public.papel(p_empresa uuid)
returns public.papel_usuario language sql stable security definer set search_path = public as $$
  select m.papel from public.membros_empresa m
  where m.empresa_id = p_empresa and m.usuario_id = auth.uid() and m.ativo
$$;

-- Empresa liberada = assinatura ativa, inadimplente (período de tolerância) ou trial dentro do prazo
create or replace function public.empresa_liberada(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.empresas e
    where e.id = p_empresa
      and (   e.status_assinatura in ('ativa', 'inadimplente')
           or (e.status_assinatura = 'trial' and coalesce(e.trial_ate, public.hoje()) >= public.hoje()))
  )
$$;

-- Qualquer membro ativo de empresa liberada
create or replace function public.pode_acessar(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_membro(p_empresa) and public.empresa_liberada(p_empresa)
$$;

-- Somente o dono, em empresa liberada
create or replace function public.pode_gerenciar(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel(p_empresa) = 'dono', false) and public.empresa_liberada(p_empresa)
$$;

-- ---------------------------------------------------------------------
-- Triggers genéricos
-- ---------------------------------------------------------------------

-- INSERT: grava quem criou (não confia no valor vindo do app)
create or replace function public.tg_antes_insert()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new := jsonb_populate_record(new, jsonb_build_object('created_by', auth.uid()));
  end if;
  return new;
end $$;

-- UPDATE: atualiza updated_at, impede troca de empresa e de autoria
create or replace function public.tg_antes_update()
returns trigger language plpgsql as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  if v_new ? 'empresa_id' and (v_new->>'empresa_id') is distinct from (v_old->>'empresa_id') then
    raise exception 'Não é permitido mover um registro para outra empresa.';
  end if;
  new := jsonb_populate_record(new, jsonb_build_object(
    'updated_at', now(),
    'created_at', v_old->'created_at',
    'created_by', v_old->'created_by'
  ));
  return new;
end $$;

-- Auditoria: guarda antes/depois de cada inclusão e alteração
create or replace function public.tg_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new  jsonb := to_jsonb(new);
  v_old  jsonb;
  v_acao text := 'insert';
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    -- nada mudou de fato, ou só o estoque (que já tem histórico próprio em movimentacoes_estoque)
    if (v_new - 'updated_at' - 'estoque_atual') = (v_old - 'updated_at' - 'estoque_atual') then
      return null;
    end if;
    v_acao := case
      when (v_new->>'status') like 'cancel%' and (v_old->>'status') is distinct from (v_new->>'status')
      then 'cancel' else 'update' end;
  end if;

  insert into public.auditoria (empresa_id, tabela, registro_id, acao, antes, depois, usuario_id)
  values (
    coalesce((v_new->>'empresa_id')::uuid, case when tg_table_name = 'empresas' then (v_new->>'id')::uuid end),
    tg_table_name,
    (v_new->>'id')::uuid,
    v_acao, v_old, v_new, auth.uid()
  );
  return null;
end $$;

-- Aplica os triggers genéricos nas tabelas
do $$
declare
  t text;
  com_created_by text[] := array[
    'empresas','membros_empresa','convites','pagamentos_assinatura','categorias','clientes','fornecedores',
    'produtos','compras','movimentacoes_estoque','vendas','contas_financeiras','lancamentos_caixa',
    'contas_receber','recebimentos','recorrencias','contas_pagar','notas_fiscais'];
  com_update text[] := array[
    'planos','empresas','perfis','membros_empresa','convites','pagamentos_assinatura','categorias','clientes',
    'fornecedores','produtos','compras','vendas','contas_financeiras','lancamentos_caixa','contas_receber',
    'recebimentos','recorrencias','contas_pagar','notas_fiscais'];
  auditadas text[] := array[
    'empresas','membros_empresa','categorias','clientes','fornecedores','produtos','compras','vendas',
    'contas_financeiras','lancamentos_caixa','contas_receber','recebimentos','recorrencias','contas_pagar'];
begin
  foreach t in array com_created_by loop
    execute format('create trigger t01_antes_insert before insert on public.%I for each row execute function public.tg_antes_insert()', t);
  end loop;
  foreach t in array com_update loop
    execute format('create trigger t01_antes_update before update on public.%I for each row execute function public.tg_antes_update()', t);
  end loop;
  foreach t in array auditadas loop
    execute format('create trigger t99_auditoria after insert or update on public.%I for each row execute function public.tg_auditoria()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Novo usuário no Auth → cria perfil
-- ---------------------------------------------------------------------
create or replace function public.tg_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, telefone)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''), new.raw_user_meta_data->>'telefone')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_novo_usuario();

-- ---------------------------------------------------------------------
-- Membros: a empresa sempre precisa de pelo menos um dono ativo
-- ---------------------------------------------------------------------
create or replace function public.tg_membro_ultimo_dono()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.papel = 'dono' and old.ativo and (new.papel <> 'dono' or not new.ativo) then
    if not exists (
      select 1 from public.membros_empresa
      where empresa_id = old.empresa_id and id <> old.id and papel = 'dono' and ativo
    ) then
      raise exception 'A empresa precisa ter pelo menos um dono ativo.';
    end if;
  end if;
  if new.usuario_id <> old.usuario_id then
    raise exception 'Não é permitido trocar o usuário de um acesso.';
  end if;
  return new;
end $$;

create trigger t02_ultimo_dono before update on public.membros_empresa
  for each row execute function public.tg_membro_ultimo_dono();

-- ---------------------------------------------------------------------
-- Numeração sequencial por empresa
-- ---------------------------------------------------------------------
create or replace function public.proximo_numero(p_empresa uuid, p_chave text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into public.contadores as c (empresa_id, chave, ultimo_numero)
  values (p_empresa, p_chave, 1)
  on conflict (empresa_id, chave) do update set ultimo_numero = c.ultimo_numero + 1
  returning c.ultimo_numero into v;
  return v;
end $$;

create or replace function public.tg_venda_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.numero := public.proximo_numero(new.empresa_id, 'venda');
  return new;
end $$;

create trigger t02_numero before insert on public.vendas
  for each row execute function public.tg_venda_numero();

-- ---------------------------------------------------------------------
-- ESTOQUE
-- estoque_atual só muda através de movimentacoes_estoque.
-- ---------------------------------------------------------------------

-- Aplica a movimentação no produto (trava a linha para evitar corrida)
create or replace function public.tg_mov_estoque_aplicar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_atual   numeric(14,3);
  v_empresa uuid;
begin
  select p.estoque_atual, p.empresa_id into v_atual, v_empresa
  from public.produtos p where p.id = new.produto_id
  for update;

  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  if v_empresa <> new.empresa_id then
    raise exception 'Este produto não pertence à sua empresa.';
  end if;

  new.estoque_anterior  := v_atual;
  new.estoque_posterior := v_atual + new.quantidade;

  perform set_config('app.mov_estoque', 'on', true);
  update public.produtos set estoque_atual = new.estoque_posterior where id = new.produto_id;
  perform set_config('app.mov_estoque', 'off', true);
  return new;
end $$;

create trigger t02_aplicar before insert on public.movimentacoes_estoque
  for each row execute function public.tg_mov_estoque_aplicar();

-- Bloqueia alteração direta do estoque
create or replace function public.tg_produto_proteger_estoque()
returns trigger language plpgsql as $$
begin
  if new.estoque_atual is distinct from old.estoque_atual
     and coalesce(current_setting('app.mov_estoque', true), 'off') <> 'on' then
    raise exception 'O estoque não pode ser alterado direto. Use uma entrada, saída ou ajuste de estoque.';
  end if;
  return new;
end $$;

create trigger t02_proteger_estoque before update on public.produtos
  for each row execute function public.tg_produto_proteger_estoque();

-- Estoque informado no cadastro do produto vira uma movimentação "Estoque inicial"
create or replace function public.tg_produto_estoque_inicial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estoque_atual <> 0 then
    perform set_config('app.mov_estoque', 'on', true);
    update public.produtos set estoque_atual = 0 where id = new.id;
    perform set_config('app.mov_estoque', 'off', true);

    insert into public.movimentacoes_estoque
      (empresa_id, produto_id, tipo, quantidade, custo_unitario, origem_tipo, origem_id, observacao)
    values
      (new.empresa_id, new.id, 'ajuste', new.estoque_atual, new.preco_custo, 'cadastro', new.id, 'Estoque inicial no cadastro');
  end if;
  return null;
end $$;

create trigger t03_estoque_inicial after insert on public.produtos
  for each row execute function public.tg_produto_estoque_inicial();

-- ---------------------------------------------------------------------
-- FINANCEIRO: protege contas pagas/canceladas.
-- Pagar, receber e cancelar são feitos por RPCs (Fases 3 e 4), que ligam
-- a flag app.rpc durante a transação.
-- ---------------------------------------------------------------------
create or replace function public.tg_conta_pagar_proteger()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.rpc', true), 'off') = 'on' then
    return new;
  end if;
  if old.status <> 'aberta' then
    raise exception 'Esta conta já está % e não pode mais ser alterada.', old.status;
  end if;
  if new.status is distinct from old.status
     or new.pago_em is distinct from old.pago_em
     or new.valor_pago is distinct from old.valor_pago
     or new.lancamento_caixa_id is distinct from old.lancamento_caixa_id then
    raise exception 'Para pagar ou cancelar a conta, use os botões "Marcar como paga" ou "Cancelar".';
  end if;
  return new;
end $$;

create trigger t02_proteger before update on public.contas_pagar
  for each row execute function public.tg_conta_pagar_proteger();

create or replace function public.tg_conta_receber_proteger()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.rpc', true), 'off') = 'on' then
    return new;
  end if;
  if old.status in ('paga', 'cancelada') then
    raise exception 'Esta conta já está % e não pode mais ser alterada.', old.status;
  end if;
  if new.status is distinct from old.status
     or new.valor_recebido is distinct from old.valor_recebido
     or new.recebido_em is distinct from old.recebido_em
     or (old.venda_id is not null and (new.valor is distinct from old.valor or new.cliente_id is distinct from old.cliente_id)) then
    raise exception 'Para receber ou cancelar, use os botões "Receber" ou "Cancelar".';
  end if;
  return new;
end $$;

create trigger t02_proteger before update on public.contas_receber
  for each row execute function public.tg_conta_receber_proteger();

-- ---------------------------------------------------------------------
-- Padrões de uma empresa nova: categorias e contas financeiras
-- ---------------------------------------------------------------------
create or replace function public.criar_padroes_empresa(p_empresa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.categorias (empresa_id, tipo, nome, cor)
  select p_empresa, c.tipo::public.tipo_categoria, c.nome, c.cor
  from (values
    ('produto', 'Bebidas',                       '#2563eb'),
    ('produto', 'Alimentos',                     '#16a34a'),
    ('produto', 'Limpeza',                       '#0891b2'),
    ('produto', 'Higiene',                       '#9333ea'),
    ('produto', 'Outros',                        '#64748b'),
    ('receita', 'Vendas',                        '#16a34a'),
    ('receita', 'Recebimento de clientes',       '#22c55e'),
    ('receita', 'Outras receitas',               '#84cc16'),
    ('despesa', 'Compra de mercadorias',         '#dc2626'),
    ('despesa', 'Aluguel',                       '#ea580c'),
    ('despesa', 'Energia',                       '#f59e0b'),
    ('despesa', 'Água',                          '#0ea5e9'),
    ('despesa', 'Internet e telefone',           '#6366f1'),
    ('despesa', 'Salários e pró-labore',         '#db2777'),
    ('despesa', 'Combustível e frete',           '#78716c'),
    ('despesa', 'Impostos',                      '#b91c1c'),
    ('despesa', 'Taxas de maquininha e banco',   '#a855f7'),
    ('despesa', 'Manutenção',                    '#0d9488'),
    ('despesa', 'Outras despesas',               '#64748b')
  ) as c(tipo, nome, cor)
  on conflict do nothing;

  insert into public.contas_financeiras (empresa_id, nome, tipo)
  values (p_empresa, 'Caixa (dinheiro)', 'caixa'),
         (p_empresa, 'Banco / Pix',      'banco');
end $$;

-- ---------------------------------------------------------------------
-- RPC: criar empresa (cadastro inicial). Quem cria vira Dono.
-- ---------------------------------------------------------------------
create or replace function public.criar_empresa(
  p_nome_fantasia text,
  p_telefone      text default null,
  p_cpf_cnpj      text default null,
  p_cidade        text default null,
  p_uf            text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar.';
  end if;
  if coalesce(trim(p_nome_fantasia), '') = '' then
    raise exception 'Informe o nome da empresa.';
  end if;
  if (select count(*) from public.membros_empresa where usuario_id = v_uid and papel = 'dono') >= 5 then
    raise exception 'Você já tem o número máximo de empresas. Fale com o suporte.';
  end if;

  insert into public.empresas (nome_fantasia, telefone, cpf_cnpj, cidade, uf)
  values (trim(p_nome_fantasia), nullif(trim(p_telefone), ''), nullif(trim(p_cpf_cnpj), ''),
          nullif(trim(p_cidade), ''), nullif(upper(trim(p_uf)), ''))
  returning id into v_id;

  insert into public.membros_empresa (empresa_id, usuario_id, papel)
  values (v_id, v_uid, 'dono');

  perform public.criar_padroes_empresa(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: informações públicas de um convite (tela "Você foi convidado")
-- ---------------------------------------------------------------------
create or replace function public.info_convite(p_token text)
returns table (empresa_nome text, papel public.papel_usuario, situacao text)
language sql stable security definer set search_path = public as $$
  select e.nome_fantasia,
         c.papel,
         case
           when c.cancelado_em is not null then 'cancelado'
           when c.aceito_em    is not null then 'usado'
           when c.expira_em    <  now()    then 'expirado'
           else 'valido'
         end
  from public.convites c
  join public.empresas e on e.id = c.empresa_id
  where c.token = p_token
$$;

-- ---------------------------------------------------------------------
-- RPC: aceitar convite (usuário logado entra na empresa)
-- ---------------------------------------------------------------------
create or replace function public.aceitar_convite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  c        public.convites%rowtype;
  v_limite int;
  v_ativos int;
begin
  if v_uid is null then
    raise exception 'Faça login para aceitar o convite.';
  end if;

  select * into c from public.convites where token = p_token for update;

  if not found or c.cancelado_em is not null then
    raise exception 'Convite inválido. Peça um novo link ao dono da empresa.';
  end if;
  if c.aceito_em is not null then
    if c.aceito_por = v_uid then
      return c.empresa_id;
    end if;
    raise exception 'Este convite já foi usado. Peça um novo link ao dono da empresa.';
  end if;
  if c.expira_em < now() then
    raise exception 'Este convite expirou. Peça um novo link ao dono da empresa.';
  end if;

  -- limite de usuários do plano (se houver)
  select p.limite_usuarios into v_limite
  from public.empresas e left join public.planos p on p.id = e.plano_id
  where e.id = c.empresa_id;

  select count(*) into v_ativos from public.membros_empresa
  where empresa_id = c.empresa_id and ativo and usuario_id <> v_uid;

  if v_limite is not null and v_ativos >= v_limite then
    raise exception 'O plano desta empresa permite até % usuários. Fale com o dono da empresa.', v_limite;
  end if;

  insert into public.membros_empresa as m (empresa_id, usuario_id, papel, ativo)
  values (c.empresa_id, v_uid, c.papel, true)
  on conflict (empresa_id, usuario_id) do update
    set ativo = true,
        papel = case when m.papel = 'dono' then 'dono'::public.papel_usuario else excluded.papel end;

  update public.convites set aceito_em = now(), aceito_por = v_uid where id = c.id;
  return c.empresa_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: lista de usuários da empresa (com e-mail, que fica no Auth)
-- ---------------------------------------------------------------------
create or replace function public.listar_membros(p_empresa uuid)
returns table (
  id uuid, usuario_id uuid, nome text, email text, telefone text,
  papel public.papel_usuario, ativo boolean, created_at timestamptz, eu boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_empresa) then
    raise exception 'Somente o dono da empresa pode ver os usuários.';
  end if;
  return query
    select m.id, m.usuario_id, p.nome, u.email::text, p.telefone, m.papel, m.ativo, m.created_at,
           m.usuario_id = auth.uid()
    from public.membros_empresa m
    join auth.users u on u.id = m.usuario_id
    left join public.perfis p on p.id = m.usuario_id
    where m.empresa_id = p_empresa
    order by m.ativo desc, m.papel, p.nome;
end $$;
