/**
 * Leitura de planilhas de produtos (Excel .xlsx, CSV ou TXT) vindas de outro sistema.
 * Tudo acontece no navegador: o arquivo não sobe para lugar nenhum.
 */
import { lerNumeroBR, semAcento } from './format'

export type CampoImport = 'nome' | 'codigo_barras' | 'codigo' | 'preco_venda' | 'preco_custo' | 'estoque' | 'estoque_minimo' | 'unidade' | 'categoria' | 'ncm'

export const CAMPOS: Array<{ campo: CampoImport; rotulo: string; obrigatorio?: boolean; palavras: string[] }> = [
  { campo: 'nome', rotulo: 'Nome do produto', obrigatorio: true, palavras: ['nome', 'descricao', 'produto', 'descr', 'item', 'mercadoria'] },
  { campo: 'codigo_barras', rotulo: 'Código de barras', palavras: ['barras', 'ean', 'gtin', 'cod barra', 'codbarra', 'upc'] },
  { campo: 'codigo', rotulo: 'Código interno', palavras: ['codigo', 'cod', 'referencia', 'ref', 'sku', 'id'] },
  { campo: 'preco_venda', rotulo: 'Preço de venda', obrigatorio: true, palavras: ['preco venda', 'venda', 'preco', 'valor', 'pv', 'vlr venda', 'preco unit'] },
  { campo: 'preco_custo', rotulo: 'Preço de custo', palavras: ['custo', 'compra', 'pc', 'vlr custo', 'preco custo'] },
  { campo: 'estoque', rotulo: 'Estoque atual', palavras: ['estoque', 'saldo', 'qtd', 'quantidade', 'qtde', 'quant'] },
  { campo: 'estoque_minimo', rotulo: 'Estoque mínimo', palavras: ['minimo', 'min', 'estoque min'] },
  { campo: 'unidade', rotulo: 'Unidade', palavras: ['unidade', 'un', 'und', 'unid', 'medida'] },
  { campo: 'categoria', rotulo: 'Categoria', palavras: ['categoria', 'grupo', 'secao', 'departamento', 'familia', 'tipo'] },
  { campo: 'ncm', rotulo: 'NCM', palavras: ['ncm'] },
]

export interface Planilha {
  cabecalho: string[]
  linhas: string[][]
}

/** Lê .xlsx, .csv ou .txt e devolve uma tabela de textos. */
export async function lerArquivo(arquivo: File): Promise<Planilha> {
  const nome = arquivo.name.toLowerCase()
  if (nome.endsWith('.xls') && !nome.endsWith('.xlsx'))
    throw new Error('Arquivo .xls antigo: abra no Excel e salve como .xlsx ou .csv, depois importe de novo.')
  let tabela: string[][]
  if (nome.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    const bruto = await readSheet(arquivo)
    tabela = (bruto as unknown[][]).map((l) => l.map(celulaParaTexto))
  } else {
    tabela = lerTexto(await decodificar(arquivo))
  }
  tabela = tabela.map((l) => l.map((c) => c.trim())).filter((l) => l.some((c) => c !== ''))
  if (!tabela.length) throw new Error('O arquivo está vazio.')
  const largura = Math.max(...tabela.map((l) => l.length))
  tabela = tabela.map((l) => [...l, ...Array(largura - l.length).fill('')])
  return { cabecalho: tabela[0], linhas: tabela.slice(1) }
}

function celulaParaTexto(c: unknown): string {
  if (c === null || c === undefined) return ''
  if (typeof c === 'number') {
    // números grandes (código de barras) não podem virar "7,89E+12"
    return Number.isInteger(c) ? c.toFixed(0) : String(c).replace('.', ',')
  }
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c)
}

/** Sistemas antigos costumam exportar em ANSI (Windows-1252); tenta UTF-8 primeiro. */
async function decodificar(arquivo: File) {
  const buf = await arquivo.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** CSV/TXT com separador ; , tab ou | (descobre sozinho), aceitando aspas. */
export function lerTexto(texto: string): string[][] {
  const amostra = texto.split(/\r?\n/).slice(0, 20).join('\n')
  const candidatos = [';', '\t', ',', '|']
  const contar = (sep: string) => amostra.split('\n').filter(Boolean).map((l) => l.split(sep).length - 1)
  let sep = ';'
  let melhor = -1
  for (const c of candidatos) {
    const n = contar(c)
    if (!n.length) continue
    const min = Math.min(...n)
    const constante = n.every((x) => x === n[0])
    const pontos = min > 0 ? min * (constante ? 2 : 1) : 0
    if (pontos > melhor) { melhor = pontos; sep = c }
  }
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (ch === '"') aspas = false
      else campo += ch
    } else if (ch === '"' && campo === '') aspas = true
    else if (ch === sep) { linha.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo); linhas.push(linha); linha = []; campo = ''
    } else campo += ch
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas
}

/** Sugere qual coluna da planilha é cada campo do sistema, pelo nome do cabeçalho. */
export function adivinharColunas(cabecalho: string[]): Partial<Record<CampoImport, number>> {
  const norm = cabecalho.map((h) => semAcento(h).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim())
  const usado = new Set<number>()
  const r: Partial<Record<CampoImport, number>> = {}
  // ordem importa: código de barras antes de código; custo antes de preço
  const ordem: CampoImport[] = ['codigo_barras', 'ncm', 'estoque_minimo', 'preco_custo', 'preco_venda', 'estoque', 'unidade', 'categoria', 'codigo', 'nome']
  for (const campo of ordem) {
    const def = CAMPOS.find((c) => c.campo === campo)!
    let achou = -1
    for (const p of def.palavras) {
      achou = norm.findIndex((h, i) => !usado.has(i) && (h === p || h.split(' ').includes(p) || (p.includes(' ') && h.includes(p))))
      if (achou >= 0) break
    }
    if (achou >= 0) { r[campo] = achou; usado.add(achou) }
  }
  return r
}

/** Unidade de outro sistema → unidade do Gestor. */
export function converterUnidade(v: string): string {
  const u = semAcento(v).replace(/[^a-z]/g, '')
  if (!u) return 'un'
  // "LT" em sistema de adega quase sempre é lata, então vira unidade
  if (['un', 'und', 'unid', 'unidade', 'u', 'pc', 'peca', 'lt', 'lata', 'gf', 'grf', 'garrafa'].includes(u)) return 'un'
  if (['cx', 'caixa', 'cxa'].includes(u)) return 'cx'
  if (['fd', 'fardo', 'frd'].includes(u)) return 'fardo'
  if (['pct', 'pacote', 'pc', 'pt', 'pac'].includes(u)) return 'pct'
  if (['kg', 'kilo', 'quilo', 'kgs'].includes(u)) return 'kg'
  if (['l', 'litro', 'litros'].includes(u)) return 'l'
  return 'un'
}

/** Número em qualquer formato comum: "R$ 1.234,56", "12,5", "12.50". */
export function lerValor(v: string): number | null {
  const t = v.replace(/r\$|\s/gi, '')
  if (!t) return null
  if (/^-?\d+\.\d{1,2}$/.test(t)) return Number(t) // 12.50 (ponto como decimal)
  return lerNumeroBR(t)
}

/** Código de barras: só números; detecta o estrago do Excel ("7,89115E+12"). */
export function lerBarras(v: string): { codigo: string | null; estragado: boolean } {
  if (!v) return { codigo: null, estragado: false }
  if (/e\+?\d+$/i.test(v.replace(',', '.'))) return { codigo: null, estragado: true }
  const d = v.replace(/\D/g, '')
  return { codigo: d || null, estragado: false }
}
