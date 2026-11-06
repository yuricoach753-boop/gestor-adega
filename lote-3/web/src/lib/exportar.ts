/**
 * Exportação de relatórios: Excel (.xlsx), CSV (abre certo no Excel brasileiro) e PDF.
 * As bibliotecas de Excel e PDF só são baixadas quando o usuário clica em exportar.
 */
import { formatarData, formatarMoeda, formatarNumero } from './format'

export type TipoColuna = 'texto' | 'moeda' | 'numero' | 'pct' | 'data' | 'inteiro'

export interface Coluna<T> {
  titulo: string
  valor: (linha: T) => string | number | null | undefined
  tipo?: TipoColuna
  largura?: number // em caracteres (Excel)
}

export interface Relatorio<T> {
  titulo: string
  subtitulo?: string // ex.: período
  empresa: string
  colunas: Coluna<T>[]
  linhas: T[]
  totais?: Array<string | number | null>
  arquivo: string // nome sem extensão
}

export function textoCelula(v: unknown, tipo: TipoColuna = 'texto'): string {
  if (v === null || v === undefined || v === '') return ''
  switch (tipo) {
    case 'moeda': return formatarMoeda(Number(v))
    case 'numero': return formatarNumero(Number(v))
    case 'inteiro': return String(Math.round(Number(v)))
    case 'pct': return `${formatarNumero(Number(v))}%`
    case 'data': return formatarData(String(v))
    default: return String(v)
  }
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Nome de arquivo seguro: "vendas-01-10-2026-a-09-10-2026" */
export function nomeArquivo(...partes: string[]) {
  return partes.join('-').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function exportarCsv<T>(r: Relatorio<T>) {
  // Excel em português usa ";" como separador e vírgula decimal
  // Texto que começa com = + - @ vira fórmula no Excel: põe um apóstrofo na frente (proteção contra injeção)
  const semFormula = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const num = (v: unknown, tipo?: TipoColuna) => {
    if (v === null || v === undefined || v === '') return ''
    // Valores em dinheiro e % sempre com 2 casas (407,70 e não 407,7)
    if (tipo === 'moeda' || tipo === 'pct') return Number(v).toFixed(2).replace('.', ',')
    if (tipo === 'inteiro') return String(Math.round(Number(v)))
    if (tipo === 'numero') return String(Number(v)).replace('.', ',')
    if (tipo === 'data') return formatarData(String(v))
    return semFormula(String(v))
  }
  const linhas = [
    r.colunas.map((c) => esc(c.titulo)).join(';'),
    ...r.linhas.map((l) => r.colunas.map((c) => esc(num(c.valor(l), c.tipo))).join(';')),
  ]
  if (r.totais) linhas.push(r.totais.map((t, i) => esc(num(t, i === 0 ? 'texto' : r.colunas[i]?.tipo))).join(';'))
  baixar(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${r.arquivo}.csv`)
}

export async function exportarExcel<T>(r: Relatorio<T>) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const FORMATO: Partial<Record<TipoColuna, string>> = {
    moeda: '"R$" #,##0.00', numero: '#,##0.###', pct: '0.0"%"', inteiro: '0',
  }
  type Celula = { value?: string | number | Date; type?: StringConstructor | NumberConstructor | DateConstructor; format?: string; fontWeight?: 'bold' }
  const celula = (v: unknown, tipo: TipoColuna = 'texto', negrito = false): Celula | null => {
    const fw = negrito ? { fontWeight: 'bold' as const } : {}
    if (v === null || v === undefined || v === '') return negrito ? { value: '', type: String, ...fw } : null
    if (tipo === 'data') {
      const [ano, mes, dia] = String(v).slice(0, 10).split('-').map(Number)
      return { value: new Date(Date.UTC(ano, mes - 1, dia)), type: Date, format: 'dd/mm/yyyy', ...fw }
    }
    if (tipo !== 'texto') return { value: Number(v), type: Number, format: FORMATO[tipo], ...fw }
    return { value: String(v), type: String, ...fw }
  }
  const dados: Array<Array<Celula | null>> = [
    [{ value: r.titulo, type: String, fontWeight: 'bold' }],
    [{ value: `${r.empresa}${r.subtitulo ? ` · ${r.subtitulo}` : ''}`, type: String }],
    [],
    r.colunas.map((c) => ({ value: c.titulo, type: String, fontWeight: 'bold' as const })),
    ...r.linhas.map((l) => r.colunas.map((c) => celula(c.valor(l), c.tipo))),
  ]
  if (r.totais) dados.push(r.totais.map((t, i) => celula(t, i === 0 ? 'texto' : r.colunas[i]?.tipo, true)))
  await writeXlsxFile(dados as never, {
    sheet: 'Relatório',
    columns: r.colunas.map((c) => ({ width: c.largura ?? (c.tipo === 'texto' || !c.tipo ? 30 : 15) })),
  }).toFile(`${r.arquivo}.xlsx`)
}

export async function exportarPdf<T>(r: Relatorio<T>) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const muitasColunas = r.colunas.length > 6
  const doc = new jsPDF({ orientation: muitasColunas ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  doc.setFontSize(14)
  doc.text(r.titulo, 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`${r.empresa}${r.subtitulo ? ` · ${r.subtitulo}` : ''}`, 14, 22)
  const numerica = (t?: TipoColuna) => t && t !== 'texto' && t !== 'data'
  autoTable(doc, {
    startY: 27,
    head: [r.colunas.map((c) => c.titulo)],
    body: r.linhas.map((l) => r.colunas.map((c) => textoCelula(c.valor(l), c.tipo))),
    foot: r.totais ? [r.totais.map((t, i) => (i === 0 ? String(t ?? '') : textoCelula(t, r.colunas[i]?.tipo)))] : undefined,
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 143, 122] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(r.colunas.map((c, i) => [i, numerica(c.tipo) ? { halign: 'right' } : {}])),
    didDrawPage: () => {
      const n = doc.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(150)
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · página ${n}`, 14, doc.internal.pageSize.getHeight() - 6)
    },
  })
  doc.save(`${r.arquivo}.pdf`)
}
