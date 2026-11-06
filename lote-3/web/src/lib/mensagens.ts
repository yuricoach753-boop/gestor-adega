import { formatarData, formatarDataHora, formatarMoeda, formatarQuantidade } from './format'
import { NOME_FORMA, type Empresa, type Venda, type VendaItem, type VendaPagamento } from '@/types'

/** Texto do comprovante para mandar no WhatsApp (*negrito* é formatação do próprio WhatsApp). */
export function textoComprovante(empresa: Pick<Empresa, 'nome_fantasia' | 'telefone'>, venda: Venda, itens: VendaItem[], pagamentos: VendaPagamento[]) {
  const linhas: string[] = []
  linhas.push(`*${empresa.nome_fantasia}*`)
  linhas.push(`Pedido nº ${venda.numero} · ${formatarDataHora(venda.data_venda)}`)
  if (venda.cliente_nome) linhas.push(`Cliente: ${venda.cliente_nome}`)
  if (venda.status === 'cancelado') linhas.push('*PEDIDO CANCELADO*')
  linhas.push('')
  for (const i of itens) {
    linhas.push(`${formatarQuantidade(i.quantidade, i.unidade)} ${i.descricao}`)
    linhas.push(`   ${formatarMoeda(i.preco_unitario)} cada = ${formatarMoeda(i.subtotal)}${i.desconto > 0 ? ` (desc. ${formatarMoeda(i.desconto)})` : ''}`)
  }
  linhas.push('')
  if (venda.desconto > 0) {
    linhas.push(`Subtotal: ${formatarMoeda(venda.subtotal)}`)
    linhas.push(`Desconto: -${formatarMoeda(venda.desconto)}`)
  }
  linhas.push(`*Total: ${formatarMoeda(venda.total)}*`)
  if (pagamentos.length) {
    linhas.push('')
    for (const p of pagamentos) {
      let t = `${NOME_FORMA[p.forma]}: ${formatarMoeda(p.valor)}`
      if ((p.forma === 'a_prazo' || p.forma === 'boleto') && p.primeiro_vencimento)
        t += p.parcelas > 1 ? ` em ${p.parcelas}x, 1ª vence ${formatarData(p.primeiro_vencimento)}` : ` · vence ${formatarData(p.primeiro_vencimento)}`
      linhas.push(t)
    }
  }
  if (venda.observacoes) linhas.push('', `Obs.: ${venda.observacoes}`)
  linhas.push('', 'Obrigado pela preferência!')
  if (empresa.telefone) linhas.push(empresa.telefone)
  return linhas.join('\n')
}

export const MENSAGEM_COBRANCA_PADRAO =
  'Olá, {cliente}! Tudo bem? Passando para lembrar do valor de {valor}, com vencimento em {vencimento}. Qualquer dúvida, estou à disposição. {empresa}'

/** Mensagem de cobrança a partir do modelo da empresa ({cliente} {valor} {vencimento} {empresa}). */
export function textoCobranca(modelo: string | null | undefined, dados: { cliente?: string | null; valor: number; vencimento: string; empresa: string }) {
  const primeiroNome = (dados.cliente ?? '').trim()
  return (modelo?.trim() || MENSAGEM_COBRANCA_PADRAO)
    .replaceAll('{cliente}', primeiroNome || 'tudo bem')
    .replaceAll('{valor}', formatarMoeda(dados.valor))
    .replaceAll('{vencimento}', formatarData(dados.vencimento))
    .replaceAll('{empresa}', dados.empresa)
}
