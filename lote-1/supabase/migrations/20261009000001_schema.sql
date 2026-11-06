-- =====================================================================
-- FASE 1 · 01 · ESTRUTURA DO BANCO (tabelas, tipos, índices)
-- Sistema de gestão para distribuidoras e pequenos negócios locais
-- =====================================================================
-- Convenções:
--   * Toda tabela de negócio tem empresa_id (isolamento multiempresa via RLS)
--   * Dinheiro: numeric(14,2) · Quantidade: numeric(14,3)
--   * Nada é apagado: registros são cancelados (status + cancelado_em/por/motivo)
--   * created_by / updated_at preenchidos por trigger (ver 02_funcoes)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos (enums)
-- ---------------------------------------------------------------------
create type public.papel_usuario        as enum ('dono', 'funcionario');
create type public.status_assinatura    as enum ('trial', 'ativa', 'inadimplente', 'bloqueada', 'cancelada');
create type public.tipo_categoria       as enum ('produto', 'receita', 'despesa');
create type public.unidade_produto      as enum ('un', 'cx', 'fardo', 'kg', 'l', 'pct');
create type public.tipo_mov_estoque     as enum ('compra', 'venda', 'perda', 'uso_interno', 'ajuste', 'estorno_venda', 'estorno_compra');
create type public.status_venda         as enum ('aberto', 'separado', 'entregue', 'cancelado');
create type public.forma_pagamento      as enum ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'boleto', 'transferencia', 'a_prazo');
create type public.status_compra        as enum ('registrada', 'cancelada');
create type public.tipo_conta_financeira as enum ('caixa', 'banco');
create type public.tipo_lancamento      as enum ('entrada', 'saida');
create type public.origem_lancamento    as enum ('venda', 'recebimento', 'conta_pagar', 'manual', 'transferencia');
create type public.status_lancamento    as enum ('confirmado', 'cancelado');
create type public.status_conta_receber as enum ('aberta', 'parcial', 'paga', 'cancelada');
create type public.status_conta_pagar   as enum ('aberta', 'paga', 'cancelada');

-- =====================================================================
-- 1. NÚCLEO E MULTIEMPRESA
-- =====================================================================

create table public.planos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  valor_mensal     numeric(14,2) not null default 0 check (valor_mensal >= 0),
  limite_usuarios  int check (limite_usuarios is null or limite_usuarios > 0),
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.empresas (
  id                        uuid primary key default gen_random_uuid(),
  nome_fantasia             text not null check (length(trim(nome_fantasia)) > 0),
  razao_social              text,
  cpf_cnpj                  text,
  telefone                  text,
  email                     text,
  cep                       text,
  logradouro                text,
  numero                    text,
  complemento               text,
  bairro                    text,
  cidade                    text,
  uf                        char(2),
  logo_path                 text,
  -- assinatura (somente super admin altera)
  plano_id                  uuid references public.planos(id),
  status_assinatura         public.status_assinatura not null default 'trial',
  trial_ate                 date default ((now() at time zone 'America/Sao_Paulo')::date + 14),
  assinatura_vence_em       date,
  -- preferências
  mensagem_cobranca_padrao  text,
  usa_dados_exemplo         boolean not null default false,
  -- preparado para NF-e (não usado ainda)
  inscricao_estadual        text,
  regime_tributario         text,
  created_at                timestamptz not null default now(),
  created_by                uuid references auth.users(id),
  updated_at                timestamptz not null default now()
);

create table public.perfis (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null default '',
  telefone        text,
  is_super_admin  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.membros_empresa (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  papel       public.papel_usuario not null default 'funcionario',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  unique (empresa_id, usuario_id)
);
create index membros_usuario_idx on public.membros_empresa (usuario_id) where ativo;

create table public.convites (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id),
  nome          text,
  email         text,
  papel         public.papel_usuario not null default 'funcionario',
  token         text not null unique default encode(gen_random_bytes(18), 'hex'),
  expira_em     timestamptz not null default (now() + interval '7 days'),
  aceito_em     timestamptz,
  aceito_por    uuid references auth.users(id),
  cancelado_em  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);
create index convites_empresa_idx on public.convites (empresa_id);

create table public.pagamentos_assinatura (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id),
  competencia  date not null,               -- 1º dia do mês de referência
  valor        numeric(14,2) not null check (valor >= 0),
  vencimento   date not null,
  pago_em      date,
  forma        text,
  observacao   text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now()
);
create index pag_assinatura_empresa_idx on public.pagamentos_assinatura (empresa_id, competencia);

-- Numeração sequencial por empresa (ex.: nº do pedido)
create table public.contadores (
  empresa_id     uuid not null references public.empresas(id),
  chave          text not null,
  ultimo_numero  bigint not null default 0,
  primary key (empresa_id, chave)
);

-- =====================================================================
-- 2. CADASTROS
-- =====================================================================

create table public.categorias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  tipo        public.tipo_categoria not null,
  nome        text not null check (length(trim(nome)) > 0),
  cor         text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);
create unique index categorias_nome_uk on public.categorias (empresa_id, tipo, lower(nome));

create table public.clientes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id),
  nome         text not null check (length(trim(nome)) > 0),
  telefone     text,
  cpf_cnpj     text,
  cep          text,
  logradouro   text,
  numero       text,
  complemento  text,
  bairro       text,
  cidade       text,
  uf           char(2),
  observacoes  text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now()
);
create index clientes_empresa_nome_idx on public.clientes (empresa_id, lower(nome));

create table public.fornecedores (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id),
  nome          text not null check (length(trim(nome)) > 0),
  contato_nome  text,
  telefone      text,
  cpf_cnpj      text,
  cep           text,
  logradouro    text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  uf            char(2),
  observacoes   text,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);
create index fornecedores_empresa_nome_idx on public.fornecedores (empresa_id, lower(nome));

create table public.produtos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id),
  codigo             text,
  codigo_barras      text,
  nome               text not null check (length(trim(nome)) > 0),
  categoria_id       uuid references public.categorias(id),
  unidade            public.unidade_produto not null default 'un',
  preco_custo        numeric(14,2) not null default 0 check (preco_custo >= 0),
  preco_venda        numeric(14,2) not null check (preco_venda >= 0),
  -- margem sobre o preço de venda, calculada pelo banco
  margem_percentual  numeric(7,2) generated always as (
                       case when preco_venda > 0
                            then round((preco_venda - preco_custo) / preco_venda * 100, 2)
                       end) stored,
  estoque_atual      numeric(14,3) not null default 0,   -- só muda via movimentacoes_estoque
  estoque_minimo     numeric(14,3) not null default 0 check (estoque_minimo >= 0),
  observacoes        text,
  ativo              boolean not null default true,
  -- preparado para NF-e (não usado ainda)
  ncm                text,
  cest               text,
  cfop               text,
  origem_mercadoria  text,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  updated_at         timestamptz not null default now()
);
create unique index produtos_codigo_uk on public.produtos (empresa_id, lower(codigo)) where codigo is not null and codigo <> '';
create index produtos_empresa_nome_idx on public.produtos (empresa_id, lower(nome));
create index produtos_barras_idx on public.produtos (empresa_id, codigo_barras) where codigo_barras is not null;

-- =====================================================================
-- 3. ESTOQUE E COMPRAS
-- =====================================================================

create table public.compras (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas(id),
  fornecedor_id         uuid references public.fornecedores(id),
  numero_nota           text,
  data_compra           date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  valor_total           numeric(14,2) not null default 0 check (valor_total >= 0),
  status                public.status_compra not null default 'registrada',
  observacoes           text,
  cancelado_em          timestamptz,
  cancelado_por         uuid references auth.users(id),
  motivo_cancelamento   text,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id),
  updated_at            timestamptz not null default now()
);
create index compras_empresa_data_idx on public.compras (empresa_id, data_compra desc);

create table public.compra_itens (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id),
  compra_id       uuid not null references public.compras(id),
  produto_id      uuid not null references public.produtos(id),
  quantidade      numeric(14,3) not null check (quantidade > 0),
  custo_unitario  numeric(14,2) not null check (custo_unitario >= 0),
  subtotal        numeric(14,2) not null check (subtotal >= 0),
  created_at      timestamptz not null default now()
);
create index compra_itens_compra_idx on public.compra_itens (compra_id);

create table public.movimentacoes_estoque (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id),
  produto_id         uuid not null references public.produtos(id),
  tipo               public.tipo_mov_estoque not null,
  quantidade         numeric(14,3) not null check (quantidade <> 0),  -- + entrada / − saída
  custo_unitario     numeric(14,2),
  estoque_anterior   numeric(14,3) not null default 0,  -- preenchido pelo trigger
  estoque_posterior  numeric(14,3) not null default 0,  -- preenchido pelo trigger
  origem_tipo        text not null default 'manual' check (origem_tipo in ('manual', 'venda', 'compra', 'cadastro')),
  origem_id          uuid,
  fornecedor_id      uuid references public.fornecedores(id),
  observacao         text,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  constraint mov_sinal_ck check (
    (tipo in ('compra', 'estorno_venda') and quantidade > 0) or
    (tipo in ('venda', 'perda', 'uso_interno', 'estorno_compra') and quantidade < 0) or
    (tipo = 'ajuste')
  )
);
create index mov_estoque_produto_idx on public.movimentacoes_estoque (produto_id, created_at desc);
create index mov_estoque_empresa_idx on public.movimentacoes_estoque (empresa_id, created_at desc);
create index mov_estoque_origem_idx on public.movimentacoes_estoque (origem_tipo, origem_id);

-- =====================================================================
-- 4. VENDAS
-- =====================================================================

create table public.vendas (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas(id),
  numero               bigint not null,                  -- preenchido pelo trigger
  cliente_id           uuid references public.clientes(id),
  data_venda           timestamptz not null default now(),
  status               public.status_venda not null default 'aberto',
  subtotal             numeric(14,2) not null default 0 check (subtotal >= 0),
  desconto             numeric(14,2) not null default 0 check (desconto >= 0),
  total                numeric(14,2) not null default 0 check (total >= 0),
  observacoes          text,
  vendedor_id          uuid references auth.users(id),
  separado_em          timestamptz,
  entregue_em          timestamptz,
  cancelado_em         timestamptz,
  cancelado_por        uuid references auth.users(id),
  motivo_cancelamento  text,
  -- preparado para NF-e
  nfe_status           text,
  nfe_chave            text,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id),
  updated_at           timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index vendas_empresa_data_idx on public.vendas (empresa_id, data_venda desc);
create index vendas_cliente_idx on public.vendas (cliente_id);

create table public.venda_itens (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id),
  venda_id        uuid not null references public.vendas(id),
  produto_id      uuid not null references public.produtos(id),
  descricao       text not null,                   -- cópia do nome no momento da venda
  unidade         public.unidade_produto not null,
  quantidade      numeric(14,3) not null check (quantidade > 0),
  preco_unitario  numeric(14,2) not null check (preco_unitario >= 0),
  desconto        numeric(14,2) not null default 0 check (desconto >= 0),
  custo_unitario  numeric(14,2) not null default 0, -- cópia do custo (relatório de margem)
  subtotal        numeric(14,2) not null check (subtotal >= 0),
  created_at      timestamptz not null default now()
);
create index venda_itens_venda_idx on public.venda_itens (venda_id);
create index venda_itens_produto_idx on public.venda_itens (produto_id);

create table public.venda_pagamentos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas(id),
  venda_id             uuid not null references public.vendas(id),
  forma                public.forma_pagamento not null,
  valor                numeric(14,2) not null check (valor > 0),
  parcelas             int not null default 1 check (parcelas between 1 and 48),
  primeiro_vencimento  date,
  created_at           timestamptz not null default now(),
  constraint prazo_vencimento_ck check (forma <> 'a_prazo' or primeiro_vencimento is not null)
);
create index venda_pag_venda_idx on public.venda_pagamentos (venda_id);

-- =====================================================================
-- 5. FINANCEIRO
-- =====================================================================

create table public.contas_financeiras (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  nome           text not null check (length(trim(nome)) > 0),
  tipo           public.tipo_conta_financeira not null default 'caixa',
  saldo_inicial  numeric(14,2) not null default 0,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_at     timestamptz not null default now()
);
create index contas_fin_empresa_idx on public.contas_financeiras (empresa_id);

create table public.lancamentos_caixa (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas(id),
  conta_financeira_id  uuid not null references public.contas_financeiras(id),
  tipo                 public.tipo_lancamento not null,
  valor                numeric(14,2) not null check (valor > 0),
  data                 date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  categoria_id         uuid references public.categorias(id),
  descricao            text not null,
  forma_pagamento      public.forma_pagamento,
  origem_tipo          public.origem_lancamento not null default 'manual',
  origem_id            uuid,
  status               public.status_lancamento not null default 'confirmado',
  cancelado_em         timestamptz,
  cancelado_por        uuid references auth.users(id),
  motivo_cancelamento  text,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id)
);
create index lanc_empresa_data_idx on public.lancamentos_caixa (empresa_id, data);
create index lanc_conta_idx on public.lancamentos_caixa (conta_financeira_id);
create index lanc_origem_idx on public.lancamentos_caixa (origem_tipo, origem_id);

create table public.contas_receber (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresas(id),
  cliente_id             uuid references public.clientes(id),
  venda_id               uuid references public.vendas(id),
  descricao              text not null,
  valor                  numeric(14,2) not null check (valor > 0),
  vencimento             date not null,
  parcela_numero         int not null default 1,
  parcela_total          int not null default 1,
  grupo_parcelamento_id  uuid,
  valor_recebido         numeric(14,2) not null default 0 check (valor_recebido >= 0),
  status                 public.status_conta_receber not null default 'aberta',
  recebido_em            date,
  observacoes            text,
  cancelado_em           timestamptz,
  cancelado_por          uuid references auth.users(id),
  motivo_cancelamento    text,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id),
  updated_at             timestamptz not null default now(),
  constraint receber_parcela_ck check (parcela_numero between 1 and parcela_total),
  constraint receber_valor_ck check (valor_recebido <= valor)
);
create index receber_empresa_venc_idx on public.contas_receber (empresa_id, vencimento) where status in ('aberta', 'parcial');
create index receber_cliente_idx on public.contas_receber (cliente_id);
create index receber_venda_idx on public.contas_receber (venda_id);

create table public.recebimentos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas(id),
  conta_receber_id     uuid not null references public.contas_receber(id),
  valor                numeric(14,2) not null check (valor > 0),
  data                 date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  forma                public.forma_pagamento not null,
  conta_financeira_id  uuid not null references public.contas_financeiras(id),
  lancamento_caixa_id  uuid references public.lancamentos_caixa(id),
  status               public.status_lancamento not null default 'confirmado',
  cancelado_em         timestamptz,
  cancelado_por        uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id)
);
create index recebimentos_conta_idx on public.recebimentos (conta_receber_id);

create table public.recorrencias (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id),
  descricao        text not null check (length(trim(descricao)) > 0),
  fornecedor_id    uuid references public.fornecedores(id),
  categoria_id     uuid references public.categorias(id),
  valor            numeric(14,2) not null check (valor > 0),
  dia_vencimento   int not null check (dia_vencimento between 1 and 31),
  forma_pagamento  public.forma_pagamento,
  inicio           date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  fim              date,
  gerada_ate       date,          -- último mês para o qual a conta já foi gerada
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  updated_at       timestamptz not null default now()
);

create table public.contas_pagar (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresas(id),
  descricao              text not null check (length(trim(descricao)) > 0),
  fornecedor_id          uuid references public.fornecedores(id),
  categoria_id           uuid references public.categorias(id),
  valor                  numeric(14,2) not null check (valor > 0),
  vencimento             date not null,
  forma_pagamento        public.forma_pagamento,
  codigo_barras          text,
  anexo_path             text,
  observacoes            text,
  parcela_numero         int not null default 1,
  parcela_total          int not null default 1,
  grupo_parcelamento_id  uuid,
  recorrencia_id         uuid references public.recorrencias(id),
  compra_id              uuid references public.compras(id),
  status                 public.status_conta_pagar not null default 'aberta',
  pago_em                date,
  valor_pago             numeric(14,2),
  juros_multa            numeric(14,2) not null default 0 check (juros_multa >= 0),
  desconto               numeric(14,2) not null default 0 check (desconto >= 0),
  conta_financeira_id    uuid references public.contas_financeiras(id),
  lancamento_caixa_id    uuid references public.lancamentos_caixa(id),
  cancelado_em           timestamptz,
  cancelado_por          uuid references auth.users(id),
  motivo_cancelamento    text,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id),
  updated_at             timestamptz not null default now(),
  constraint pagar_parcela_ck check (parcela_numero between 1 and parcela_total)
);
create index pagar_empresa_venc_idx on public.contas_pagar (empresa_id, vencimento) where status = 'aberta';
create index pagar_fornecedor_idx on public.contas_pagar (fornecedor_id);
create unique index pagar_recorrencia_mes_uk on public.contas_pagar (recorrencia_id, vencimento) where recorrencia_id is not null;

-- =====================================================================
-- 6. AUDITORIA E ESTRUTURA PARA O FUTURO
-- =====================================================================

create table public.auditoria (
  id           bigint generated always as identity primary key,
  empresa_id   uuid,
  tabela       text not null,
  registro_id  uuid,
  acao         text not null check (acao in ('insert', 'update', 'cancel')),
  antes        jsonb,
  depois       jsonb,
  usuario_id   uuid,
  created_at   timestamptz not null default now()
);
create index auditoria_registro_idx on public.auditoria (tabela, registro_id);
create index auditoria_empresa_idx on public.auditoria (empresa_id, created_at desc);

-- NF-e / NFC-e (integração futura com API pronta, ex.: Focus NFe)
create table public.notas_fiscais (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id),
  venda_id    uuid references public.vendas(id),
  modelo      text check (modelo in ('nfe', 'nfce')),
  provedor    text,
  referencia  text,
  status      text,
  chave       text,
  numero      text,
  serie       text,
  xml_path    text,
  pdf_path    text,
  mensagem    text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

-- Alertas automáticos por WhatsApp (integração futura)
create table public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),
  tipo           text not null,          -- ex.: 'vencimento_pagar', 'cobranca_receber'
  canal          text not null default 'whatsapp',
  destino        text,
  mensagem       text,
  referencia_id  uuid,
  agendada_para  timestamptz,
  enviada_em     timestamptz,
  status         text not null default 'pendente',
  erro           text,
  created_at     timestamptz not null default now()
);

-- =====================================================================
-- 7. GARANTIA DE MESMA EMPRESA NOS RELACIONAMENTOS
-- Chaves estrangeiras compostas (empresa_id, id): impede, por exemplo,
-- uma venda da empresa A apontar para um cliente da empresa B.
-- =====================================================================
alter table public.categorias          add constraint categorias_emp_id_uk   unique (empresa_id, id);
alter table public.clientes            add constraint clientes_emp_id_uk     unique (empresa_id, id);
alter table public.fornecedores        add constraint fornecedores_emp_id_uk unique (empresa_id, id);
alter table public.produtos            add constraint produtos_emp_id_uk     unique (empresa_id, id);
alter table public.compras             add constraint compras_emp_id_uk      unique (empresa_id, id);
alter table public.vendas              add constraint vendas_emp_id_uk       unique (empresa_id, id);
alter table public.contas_financeiras  add constraint contas_fin_emp_id_uk   unique (empresa_id, id);
alter table public.lancamentos_caixa   add constraint lanc_emp_id_uk         unique (empresa_id, id);
alter table public.contas_receber      add constraint receber_emp_id_uk      unique (empresa_id, id);
alter table public.recorrencias        add constraint recorrencias_emp_id_uk unique (empresa_id, id);

alter table public.produtos              add constraint produtos_categoria_emp_fk   foreign key (empresa_id, categoria_id)        references public.categorias (empresa_id, id);
alter table public.compras               add constraint compras_fornecedor_emp_fk   foreign key (empresa_id, fornecedor_id)       references public.fornecedores (empresa_id, id);
alter table public.compra_itens          add constraint compra_itens_compra_emp_fk  foreign key (empresa_id, compra_id)           references public.compras (empresa_id, id);
alter table public.compra_itens          add constraint compra_itens_produto_emp_fk foreign key (empresa_id, produto_id)          references public.produtos (empresa_id, id);
alter table public.movimentacoes_estoque add constraint mov_produto_emp_fk           foreign key (empresa_id, produto_id)          references public.produtos (empresa_id, id);
alter table public.movimentacoes_estoque add constraint mov_fornecedor_emp_fk        foreign key (empresa_id, fornecedor_id)       references public.fornecedores (empresa_id, id);
alter table public.vendas                add constraint vendas_cliente_emp_fk        foreign key (empresa_id, cliente_id)          references public.clientes (empresa_id, id);
alter table public.venda_itens           add constraint venda_itens_venda_emp_fk     foreign key (empresa_id, venda_id)            references public.vendas (empresa_id, id);
alter table public.venda_itens           add constraint venda_itens_produto_emp_fk   foreign key (empresa_id, produto_id)          references public.produtos (empresa_id, id);
alter table public.venda_pagamentos      add constraint venda_pag_venda_emp_fk       foreign key (empresa_id, venda_id)            references public.vendas (empresa_id, id);
alter table public.lancamentos_caixa     add constraint lanc_conta_emp_fk            foreign key (empresa_id, conta_financeira_id) references public.contas_financeiras (empresa_id, id);
alter table public.lancamentos_caixa     add constraint lanc_categoria_emp_fk        foreign key (empresa_id, categoria_id)        references public.categorias (empresa_id, id);
alter table public.contas_receber        add constraint receber_cliente_emp_fk       foreign key (empresa_id, cliente_id)          references public.clientes (empresa_id, id);
alter table public.contas_receber        add constraint receber_venda_emp_fk         foreign key (empresa_id, venda_id)            references public.vendas (empresa_id, id);
alter table public.recebimentos          add constraint receb_conta_emp_fk           foreign key (empresa_id, conta_receber_id)    references public.contas_receber (empresa_id, id);
alter table public.recebimentos          add constraint receb_contafin_emp_fk        foreign key (empresa_id, conta_financeira_id) references public.contas_financeiras (empresa_id, id);
alter table public.recebimentos          add constraint receb_lanc_emp_fk            foreign key (empresa_id, lancamento_caixa_id) references public.lancamentos_caixa (empresa_id, id);
alter table public.recorrencias          add constraint recorr_fornecedor_emp_fk     foreign key (empresa_id, fornecedor_id)       references public.fornecedores (empresa_id, id);
alter table public.recorrencias          add constraint recorr_categoria_emp_fk      foreign key (empresa_id, categoria_id)        references public.categorias (empresa_id, id);
alter table public.contas_pagar          add constraint pagar_fornecedor_emp_fk      foreign key (empresa_id, fornecedor_id)       references public.fornecedores (empresa_id, id);
alter table public.contas_pagar          add constraint pagar_categoria_emp_fk       foreign key (empresa_id, categoria_id)        references public.categorias (empresa_id, id);
alter table public.contas_pagar          add constraint pagar_recorrencia_emp_fk     foreign key (empresa_id, recorrencia_id)      references public.recorrencias (empresa_id, id);
alter table public.contas_pagar          add constraint pagar_compra_emp_fk          foreign key (empresa_id, compra_id)           references public.compras (empresa_id, id);
alter table public.contas_pagar          add constraint pagar_contafin_emp_fk        foreign key (empresa_id, conta_financeira_id) references public.contas_financeiras (empresa_id, id);
alter table public.contas_pagar          add constraint pagar_lanc_emp_fk            foreign key (empresa_id, lancamento_caixa_id) references public.lancamentos_caixa (empresa_id, id);
alter table public.notas_fiscais         add constraint nf_venda_emp_fk              foreign key (empresa_id, venda_id)            references public.vendas (empresa_id, id);
