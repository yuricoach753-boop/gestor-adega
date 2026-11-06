export type Papel = 'dono' | 'funcionario'
export type StatusAssinatura = 'trial' | 'ativa' | 'inadimplente' | 'bloqueada' | 'cancelada'

export interface Empresa {
  id: string
  nome_fantasia: string
  razao_social: string | null
  cpf_cnpj: string | null
  telefone: string | null
  email: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  logo_path: string | null
  plano_id: string | null
  status_assinatura: StatusAssinatura
  trial_ate: string | null
  assinatura_vence_em: string | null
  mensagem_cobranca_padrao: string | null
  usa_dados_exemplo: boolean
  inscricao_estadual?: string | null
  regime_tributario?: string | null
}

export interface Vinculo {
  papel: Papel
  ativo: boolean
  empresa: Empresa
}

export interface Perfil {
  id: string
  nome: string
  telefone: string | null
  is_super_admin: boolean
}

export interface Membro {
  id: string
  usuario_id: string
  nome: string | null
  email: string
  telefone: string | null
  papel: Papel
  ativo: boolean
  created_at: string
  eu: boolean
}

export interface Convite {
  id: string
  empresa_id: string
  nome: string | null
  email: string | null
  papel: Papel
  token: string
  expira_em: string
  aceito_em: string | null
  cancelado_em: string | null
  created_at: string
}

export const NOME_PAPEL: Record<Papel, string> = { dono: 'Dono', funcionario: 'Funcionário' }

export type Unidade = 'un' | 'cx' | 'fardo' | 'kg' | 'l' | 'pct'
export const UNIDADES: Array<{ valor: Unidade; rotulo: string }> = [
  { valor: 'un', rotulo: 'Unidade (un)' },
  { valor: 'cx', rotulo: 'Caixa (cx)' },
  { valor: 'fardo', rotulo: 'Fardo' },
  { valor: 'pct', rotulo: 'Pacote (pct)' },
  { valor: 'kg', rotulo: 'Quilo (kg)' },
  { valor: 'l', rotulo: 'Litro (L)' },
]

export interface Categoria {
  id: string
  empresa_id: string
  tipo: 'produto' | 'receita' | 'despesa'
  nome: string
  cor: string | null
  ativo: boolean
}

export interface Produto {
  id: string
  empresa_id: string
  codigo: string | null
  codigo_barras: string | null
  nome: string
  categoria_id: string | null
  categoria_nome: string | null
  unidade: Unidade
  preco_custo: number | null      // null para funcionário
  preco_venda: number
  margem_percentual: number | null // null para funcionário
  estoque_atual: number
  estoque_minimo: number
  estoque_baixo: boolean
  observacoes: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export type TipoMov = 'compra' | 'venda' | 'perda' | 'uso_interno' | 'ajuste' | 'estorno_venda' | 'estorno_compra'
export const NOME_MOV: Record<TipoMov, string> = {
  compra: 'Compra',
  venda: 'Venda',
  perda: 'Perda',
  uso_interno: 'Uso interno',
  ajuste: 'Ajuste de contagem',
  estorno_venda: 'Venda cancelada',
  estorno_compra: 'Compra cancelada',
}

export interface Movimentacao {
  id: string
  empresa_id: string
  produto_id: string
  produto_nome: string
  tipo: TipoMov
  quantidade: number
  custo_unitario: number | null
  estoque_anterior: number
  estoque_posterior: number
  origem_tipo: 'manual' | 'venda' | 'compra' | 'cadastro'
  origem_id: string | null
  observacao: string | null
  created_at: string
  criado_por_nome: string | null
}

export interface Pessoa {
  id: string
  empresa_id: string
  nome: string
  telefone: string | null
  cpf_cnpj: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
}

export interface Cliente extends Pessoa {
  total_comprado: number
  qtd_compras: number
  ultima_compra: string | null
  valor_devido: number | null // null para funcionário
}

export interface Fornecedor extends Pessoa {
  contato_nome: string | null
  total_comprado: number
  ultima_compra: string | null
  valor_em_aberto: number
}

export type FormaPagamento = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'transferencia' | 'a_prazo'
export const NOME_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  a_prazo: 'A prazo (fiado)',
}

export interface Compra {
  id: string
  empresa_id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  numero_nota: string | null
  data_compra: string
  valor_total: number
  status: 'registrada' | 'cancelada'
  observacoes: string | null
  qtd_itens: number
  criado_por_nome: string | null
  cancelado_em: string | null
  motivo_cancelamento: string | null
  created_at: string
}

export interface CompraItem {
  id: string
  produto_id: string
  produto_nome: string
  unidade: Unidade
  codigo: string | null
  quantidade: number
  custo_unitario: number
  subtotal: number
}

export interface ContaPagarResumo {
  id: string
  descricao: string
  valor: number
  vencimento: string
  status: 'aberta' | 'paga' | 'cancelada'
  situacao: 'a_vencer' | 'vence_hoje' | 'atrasada' | 'paga' | 'cancelada'
  parcela_numero: number
  parcela_total: number
  pago_em: string | null
}

export type StatusVenda = 'aberto' | 'separado' | 'entregue' | 'cancelado'
export const NOME_STATUS_VENDA: Record<StatusVenda, string> = {
  aberto: 'Em aberto', separado: 'Separado', entregue: 'Entregue', cancelado: 'Cancelado',
}

export interface Venda {
  id: string
  empresa_id: string
  numero: number
  cliente_id: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  data_venda: string
  dia: string
  status: StatusVenda
  subtotal: number
  desconto: number
  total: number
  observacoes: string | null
  vendedor_id: string | null
  vendedor_nome: string | null
  separado_em: string | null
  entregue_em: string | null
  cancelado_em: string | null
  motivo_cancelamento: string | null
  qtd_itens: number
  formas: string | null
  created_at: string
}

export interface VendaItem {
  id: string
  produto_id: string
  descricao: string
  unidade: Unidade
  quantidade: number
  preco_unitario: number
  desconto: number
  subtotal: number
}

export interface VendaPagamento {
  id: string
  forma: FormaPagamento
  valor: number
  parcelas: number
  primeiro_vencimento: string | null
}

export type SituacaoConta = 'a_vencer' | 'vence_hoje' | 'atrasada' | 'paga' | 'cancelada'

export interface ContaReceber {
  id: string
  empresa_id: string
  cliente_id: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  venda_id: string | null
  venda_numero: number | null
  descricao: string
  valor: number
  valor_recebido: number
  saldo: number
  vencimento: string
  parcela_numero: number
  parcela_total: number
  status: 'aberta' | 'parcial' | 'paga' | 'cancelada'
  situacao: SituacaoConta
  dias_atraso: number
  recebido_em: string | null
  observacoes: string | null
  motivo_cancelamento: string | null
  created_at: string
}

export interface Devedor {
  empresa_id: string
  cliente_id: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  total_devido: number
  total_vencido: number
  qtd_contas: number
  vencimento_mais_antigo: string
  maior_atraso: number
}

export interface Recebimento {
  id: string
  conta_receber_id: string
  valor: number
  data: string
  forma: FormaPagamento
  conta_nome: string | null
  status: 'confirmado' | 'cancelado'
  criado_por_nome: string | null
  created_at: string
}

export interface ContaPagar {
  id: string
  empresa_id: string
  descricao: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  categoria_id: string | null
  categoria_nome: string | null
  valor: number
  vencimento: string
  forma_pagamento: FormaPagamento | null
  codigo_barras: string | null
  anexo_path: string | null
  observacoes: string | null
  parcela_numero: number
  parcela_total: number
  grupo_parcelamento_id: string | null
  recorrencia_id: string | null
  compra_id: string | null
  status: 'aberta' | 'paga' | 'cancelada'
  situacao: SituacaoConta
  dias_atraso: number
  pago_em: string | null
  valor_pago: number | null
  juros_multa: number
  desconto: number
  conta_financeira_id: string | null
  lancamento_caixa_id: string | null
  motivo_cancelamento: string | null
  created_at: string
}

export interface Recorrencia {
  id: string
  empresa_id: string
  descricao: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  categoria_id: string | null
  categoria_nome: string | null
  valor: number
  dia_vencimento: number
  forma_pagamento: FormaPagamento | null
  inicio: string
  fim: string | null
  ativo: boolean
  proximo_vencimento: string | null
}

export interface ContaFinanceira {
  id: string
  empresa_id: string
  nome: string
  tipo: 'caixa' | 'banco'
  saldo_inicial: number
  saldo_atual: number
  ativo: boolean
}

export type OrigemLancamento = 'venda' | 'recebimento' | 'conta_pagar' | 'manual' | 'transferencia'
export const NOME_ORIGEM: Record<OrigemLancamento, string> = {
  venda: 'Venda', recebimento: 'Recebimento', conta_pagar: 'Conta paga', manual: 'Lançamento manual', transferencia: 'Transferência',
}

export interface Lancamento {
  id: string
  empresa_id: string
  conta_financeira_id: string
  conta_nome: string
  tipo: 'entrada' | 'saida'
  valor: number
  data: string
  categoria_id: string | null
  categoria_nome: string | null
  descricao: string
  forma_pagamento: FormaPagamento | null
  origem_tipo: OrigemLancamento
  origem_id: string | null
  status: 'confirmado' | 'cancelado'
  motivo_cancelamento: string | null
  criado_por_nome: string | null
  created_at: string
}

export type Situacao = 'trial' | 'trial_vencido' | 'ativa' | 'vencendo' | 'vencida' | 'inadimplente' | 'bloqueada' | 'cancelada'
export const NOME_SITUACAO: Record<Situacao, string> = {
  trial: 'Em teste', trial_vencido: 'Teste acabou', ativa: 'Em dia', vencendo: 'Vence em breve', vencida: 'Vencida',
  inadimplente: 'Inadimplente', bloqueada: 'Bloqueada', cancelada: 'Cancelada',
}
export const NOME_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  trial: 'Teste grátis', ativa: 'Ativa', inadimplente: 'Inadimplente', bloqueada: 'Bloqueada', cancelada: 'Cancelada',
}

export interface Plano { id: string; nome: string; valor_mensal: number; limite_usuarios: number | null; ativo: boolean }

export interface ConfigSistema { trial_dias: number; dias_tolerancia: number; suporte_whatsapp: string | null }

export interface PagamentoAssinatura {
  id: string
  empresa_id: string
  competencia: string
  valor: number
  vencimento: string
  pago_em: string | null
  forma: string | null
  observacao: string | null
  meses: number
  novo_vencimento: string | null
  cancelado_em: string | null
  motivo_cancelamento: string | null
  created_at: string
}

export interface AdminEmpresa {
  id: string
  nome_fantasia: string
  cidade: string | null
  uf: string | null
  telefone: string | null
  email: string | null
  created_at: string
  status_assinatura: StatusAssinatura
  situacao: Situacao
  liberada: boolean
  trial_ate: string | null
  assinatura_vence_em: string | null
  plano_id: string | null
  plano_nome: string | null
  valor_mensal: number | null
  usa_dados_exemplo: boolean
  observacoes_admin: string | null
  qtd_usuarios: number
  dono_nome: string | null
  dono_email: string | null
  dono_telefone: string | null
  convite_pendente: boolean
  ultimo_acesso: string | null
  vendas_30d: number
  ultima_venda: string | null
  total_pago: number
  ultimo_pagamento: string | null
}
