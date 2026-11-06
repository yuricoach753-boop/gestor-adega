import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText, Info, Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { SeletorMes, mesAtual, nomeMes } from '@/components/SeletorMes'
import { supabase } from '@/lib/supabase'
import { formatarData, formatarMoeda, formatarQuantidade, linkWhatsApp, mascaraCpfCnpj } from '@/lib/format'
import { nomeArquivo } from '@/lib/exportar'
import { cn } from '@/lib/utils'
import { NOME_FORMA, type FormaPagamento, type Unidade } from '@/types'
import { Kpi, Secao } from './comum'

/** Limite anual atual do MEI (receita bruta). Confirme com o contador se mudar. */
export const LIMITE_MEI = 81000

interface DadosFechamento {
  inicio: string
  fim: string
  empresa: { nome: string; razao_social: string | null; cpf_cnpj: string | null; inscricao_estadual: string | null; regime: string | null; cidade: string | null; uf: string | null }
  vendas: { qtd: number; bruto: number; descontos: number; liquido: number; custo: number; lucro_bruto: number; com_nota: number; sem_nota: number; canceladas_qtd: number; canceladas_total: number }
  formas: Array<{ forma: FormaPagamento; total: number }>
  recebido_fiado: number
  fiado_em_aberto: number
  compras: { qtd: number; total: number }
  despesas: Array<{ categoria: string; total: number }>
  despesas_total: number
  entradas_total: number
  produtos: Array<{ nome: string; unidade: Unidade; quantidade: number; faturamento: number }>
  receita_ano: number
}

export const NOME_REGIME: Record<string, string> = {
  mei: 'MEI', simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real',
}

const n = (v: unknown) => Number(v ?? 0)

/** Linhas "item → valor" usadas na tela, no PDF, no Excel e no WhatsApp. */
function linhasResumo(d: DadosFechamento) {
  return [
    ['Vendas no mês (quantidade)', String(d.vendas.qtd)],
    ['Vendas brutas (antes do desconto)', formatarMoeda(d.vendas.bruto)],
    ['Descontos dados', formatarMoeda(d.vendas.descontos)],
    ['Faturamento do mês (receita bruta)', formatarMoeda(d.vendas.liquido)],
    ['Vendas canceladas', `${d.vendas.canceladas_qtd} · ${formatarMoeda(d.vendas.canceladas_total)}`],
    ['Custo das mercadorias vendidas', formatarMoeda(d.vendas.custo)],
    ['Lucro bruto (faturamento - custo)', formatarMoeda(d.vendas.lucro_bruto)],
    ['Compras de mercadoria no mês', `${d.compras.qtd} · ${formatarMoeda(d.compras.total)}`],
    ['Despesas pagas no mês', formatarMoeda(d.despesas_total)],
    ['Fiado recebido no mês', formatarMoeda(d.recebido_fiado)],
    ['Fiado em aberto (hoje)', formatarMoeda(d.fiado_em_aberto)],
  ]
}

function linhasMei(d: DadosFechamento) {
  return [
    ['I – Revenda de mercadorias (comércio), sem nota fiscal', formatarMoeda(d.vendas.sem_nota)],
    ['II – Revenda de mercadorias (comércio), com nota fiscal', formatarMoeda(d.vendas.com_nota)],
    ['III – Total da revenda de mercadorias (I + II)', formatarMoeda(d.vendas.liquido)],
    ['IV a IX – Indústria e serviços', 'R$ 0,00 (não se aplica)'],
    ['X – Total geral das receitas brutas no mês', formatarMoeda(d.vendas.liquido)],
  ]
}

async function gerarPdf(d: DadosFechamento, mes: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const verde: [number, number, number] = [15, 143, 122]
  let y = 16
  doc.setFontSize(15); doc.text(`Fechamento do mês — ${nomeMes(mes)}`, 14, y); y += 6
  doc.setFontSize(9); doc.setTextColor(90)
  const e = d.empresa
  const ident = [e.razao_social || e.nome, e.cpf_cnpj && `CNPJ/CPF ${mascaraCpfCnpj(e.cpf_cnpj)}`, e.inscricao_estadual && `IE ${e.inscricao_estadual}`,
    e.regime && NOME_REGIME[e.regime], [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')
  doc.text(ident, 14, y); y += 5
  doc.text(`Período: ${formatarData(d.inicio)} a ${formatarData(d.fim)}`, 14, y); y += 4
  doc.setTextColor(20)
  const tabela = (titulo: string, head: string[], body: string[][]) => {
    autoTable(doc, {
      startY: y + 3, head: [[titulo, ...head.slice(1)]], body,
      styles: { fontSize: 9, cellPadding: 1.8 }, headStyles: { fillColor: verde },
      columnStyles: { [head.length - 1]: { halign: 'right' } },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2
  }
  tabela('Resumo do mês', ['Resumo do mês', 'Valor'], linhasResumo(d))
  tabela('Vendas por forma de pagamento', ['', 'Valor'], d.formas.map((f) => [NOME_FORMA[f.forma] ?? f.forma, formatarMoeda(f.total)]))
  if (d.despesas.length) tabela('Despesas por categoria', ['', 'Valor'], d.despesas.map((x) => [x.categoria, formatarMoeda(x.total)]))
  tabela('Relatório Mensal das Receitas Brutas (modelo do MEI)', ['', 'Valor'], linhasMei(d))
  tabela(`Faturamento acumulado no ano (limite do MEI: ${formatarMoeda(LIMITE_MEI)})`, ['', 'Valor'], [
    [`Jan a ${nomeMes(mes, true)}`, formatarMoeda(d.receita_ano)],
    ['Usado do limite do MEI', `${Math.round((n(d.receita_ano) / LIMITE_MEI) * 100)}%`],
  ])
  if (d.produtos.length) tabela('Produtos que mais venderam', ['', 'Faturamento'],
    d.produtos.map((p) => [`${p.nome} (${formatarQuantidade(p.quantidade, p.unidade)})`, formatarMoeda(p.faturamento)]))
  const h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150)
    doc.text(`Gerado pelo sistema em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · página ${i}. Relatório gerencial — não substitui documento fiscal.`, 14, h - 6)
  }
  doc.save(`${nomeArquivo('fechamento', mes)}.pdf`)
}

async function gerarExcel(d: DadosFechamento, mes: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  type C = { value?: string | number; type?: StringConstructor | NumberConstructor; fontWeight?: 'bold'; format?: string }
  const t = (v: string, bold = false): C => ({ value: v, type: String, ...(bold ? { fontWeight: 'bold' as const } : {}) })
  const m = (v: number): C => ({ value: n(v), type: Number, format: '"R$" #,##0.00' })
  const linhas: Array<Array<C | null>> = [
    [t(`Fechamento do mês — ${nomeMes(mes)}`, true)], [t(d.empresa.razao_social || d.empresa.nome)], [],
    [t('Resumo do mês', true)],
    [t('Vendas no mês (quantidade)'), { value: n(d.vendas.qtd), type: Number }],
    [t('Vendas brutas (antes do desconto)'), m(d.vendas.bruto)],
    [t('Descontos dados'), m(d.vendas.descontos)],
    [t('Faturamento do mês (receita bruta)'), m(d.vendas.liquido)],
    [t('Vendas canceladas (valor)'), m(d.vendas.canceladas_total)],
    [t('Custo das mercadorias vendidas'), m(d.vendas.custo)],
    [t('Lucro bruto'), m(d.vendas.lucro_bruto)],
    [t('Compras de mercadoria'), m(d.compras.total)],
    [t('Despesas pagas'), m(d.despesas_total)],
    [t('Fiado recebido no mês'), m(d.recebido_fiado)],
    [t('Fiado em aberto (hoje)'), m(d.fiado_em_aberto)], [],
    [t('Vendas por forma de pagamento', true)], ...d.formas.map((f) => [t(NOME_FORMA[f.forma] ?? f.forma), m(f.total)]), [],
    [t('Despesas por categoria', true)], ...d.despesas.map((x) => [t(x.categoria), m(x.total)]), [],
    [t('Relatório Mensal das Receitas Brutas (MEI)', true)],
    [t('I – Revenda de mercadorias sem nota fiscal'), m(d.vendas.sem_nota)],
    [t('II – Revenda de mercadorias com nota fiscal'), m(d.vendas.com_nota)],
    [t('III – Total da revenda de mercadorias'), m(d.vendas.liquido)],
    [t('X – Total geral das receitas brutas no mês'), m(d.vendas.liquido)], [],
    [t('Faturamento acumulado no ano'), m(d.receita_ano)],
  ]
  await writeXlsxFile(linhas as never, { sheet: 'Fechamento', columns: [{ width: 48 }, { width: 18 }] }).toFile(`${nomeArquivo('fechamento', mes)}.xlsx`)
}

function textoWhatsApp(d: DadosFechamento, mes: string) {
  return [
    `*Fechamento de ${nomeMes(mes)}* — ${d.empresa.razao_social || d.empresa.nome}`,
    '',
    `Faturamento (receita bruta): ${formatarMoeda(d.vendas.liquido)} em ${d.vendas.qtd} vendas`,
    ...d.formas.map((f) => `• ${NOME_FORMA[f.forma] ?? f.forma}: ${formatarMoeda(f.total)}`),
    `Vendas sem nota: ${formatarMoeda(d.vendas.sem_nota)} · com nota: ${formatarMoeda(d.vendas.com_nota)}`,
    `Compras de mercadoria: ${formatarMoeda(d.compras.total)}`,
    `Despesas pagas: ${formatarMoeda(d.despesas_total)}`,
    `Acumulado no ano: ${formatarMoeda(d.receita_ano)}`,
    '',
    'O relatório completo vai em PDF.',
  ].join('\n')
}

export function AbaFechamento({ empresaId }: { empresaId: string }) {
  const [mes, setMes] = useState(mesAtual())
  const [gerando, setGerando] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['fechamento', empresaId, mes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relatorio_fechamento_mes', { p_empresa: empresaId, p_mes: `${mes}-01` })
      if (error) throw error
      return data as DadosFechamento
    },
  })
  const d = q.data
  const emAndamento = mes === mesAtual()

  async function rodar(tipo: 'pdf' | 'xlsx') {
    if (!d) return
    setGerando(tipo)
    try { if (tipo === 'pdf') await gerarPdf(d, mes); else await gerarExcel(d, mes) }
    catch { toast.error('Não foi possível gerar o arquivo. Tente de novo.') }
    finally { setGerando(null) }
  }

  const pctMei = d ? Math.min(Math.round((n(d.receita_ano) / LIMITE_MEI) * 100), 999) : 0
  const regime = d?.empresa.regime

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72"><SeletorMes valor={mes} onChange={setMes} /></div>
        {d && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => rodar('pdf')} disabled={!!gerando}>{gerando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileText />} Baixar PDF</Button>
            <Button size="sm" variant="outline" onClick={() => rodar('xlsx')} disabled={!!gerando}>{gerando === 'xlsx' ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel</Button>
            <Button size="sm" variant="outline" asChild>
              <a href={linkWhatsApp(textoWhatsApp(d, mes))} target="_blank" rel="noreferrer"><MessageCircle /> Mandar resumo</a>
            </Button>
          </div>
        )}
      </div>

      {emAndamento && <p className="text-sm text-amber-700">O mês ainda não terminou: os números vão mudar até o último dia.</p>}

      {q.isLoading ? <ListaCarregando /> : q.error ? <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} /> : d && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <Kpi titulo="Faturamento do mês" valor={formatarMoeda(d.vendas.liquido)} detalhe={`${d.vendas.qtd} vendas`} />
            <Kpi titulo="Lucro bruto" valor={formatarMoeda(d.vendas.lucro_bruto)} detalhe="faturamento - custo" />
            <Kpi titulo="Compras de mercadoria" valor={formatarMoeda(d.compras.total)} detalhe={`${d.compras.qtd} compras`} />
            <Kpi titulo="Despesas pagas" valor={formatarMoeda(d.despesas_total)} />
          </div>

          <Secao titulo="Resumo para o contador">
            <dl className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
              {linhasResumo(d).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium tabular">{v}</dd></div>
              ))}
            </dl>
          </Secao>

          <div className="grid gap-4 lg:grid-cols-2">
            <Secao titulo="Vendas por forma de pagamento">
              <dl className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
                {d.formas.length ? d.formas.map((f) => (
                  <div key={f.forma} className="flex justify-between px-4 py-2"><dt>{NOME_FORMA[f.forma] ?? f.forma}</dt><dd className="font-medium tabular">{formatarMoeda(f.total)}</dd></div>
                )) : <p className="px-4 py-3 text-muted-foreground">Nenhuma venda no mês.</p>}
              </dl>
            </Secao>
            <Secao titulo="Despesas por categoria">
              <dl className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
                {d.despesas.length ? d.despesas.map((x) => (
                  <div key={x.categoria} className="flex justify-between px-4 py-2"><dt>{x.categoria}</dt><dd className="font-medium tabular">{formatarMoeda(x.total)}</dd></div>
                )) : <p className="px-4 py-3 text-muted-foreground">Nenhuma despesa paga no mês.</p>}
              </dl>
            </Secao>
          </div>

          <Secao titulo="Relatório Mensal das Receitas Brutas (modelo do MEI)">
            <div className={cn('mb-2 flex gap-2 rounded-lg border p-3 text-sm', regime && regime !== 'mei' ? 'bg-muted text-muted-foreground' : 'bg-accent/40')}>
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>
                {regime === 'mei' ? 'Preencha o relatório mensal do MEI com estes valores e guarde junto com as notas de compra.'
                  : regime ? `A empresa está como ${NOME_REGIME[regime] ?? regime}: esta parte é só para MEI; o contador usa o resumo acima.`
                  : <>Se a empresa for MEI, estes são os valores do relatório mensal. Não sabe o regime? Pergunte ao contador e marque em <Link to="/configuracoes/empresa" className="font-medium text-primary underline">Dados da empresa</Link>.</>}
              </p>
            </div>
            <dl className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
              {linhasMei(d).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium tabular">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-3 rounded-xl border bg-card p-4 text-sm">
              <div className="flex justify-between"><span>Faturado no ano até {nomeMes(mes, true)}</span><strong className="tabular">{formatarMoeda(d.receita_ano)}</strong></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', pctMei >= 100 ? 'bg-destructive' : pctMei >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${Math.min(pctMei, 100)}%` }} />
              </div>
              <p className={cn('mt-1 text-xs', pctMei >= 80 ? 'font-medium text-amber-700' : 'text-muted-foreground')}>
                {pctMei}% do limite anual do MEI ({formatarMoeda(LIMITE_MEI)}).{pctMei >= 80 && ' Atenção: perto do limite — fale com o contador.'}
              </p>
            </div>
          </Secao>

          {d.produtos.length > 0 && (
            <Secao titulo="Produtos que mais venderam">
              <dl className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
                {d.produtos.map((p) => (
                  <div key={p.nome} className="flex justify-between gap-3 px-4 py-2">
                    <dt className="min-w-0 truncate">{p.nome} <span className="text-muted-foreground">· {formatarQuantidade(p.quantidade, p.unidade)}</span></dt>
                    <dd className="shrink-0 font-medium tabular">{formatarMoeda(p.faturamento)}</dd>
                  </div>
                ))}
              </dl>
            </Secao>
          )}
          <p className="text-xs text-muted-foreground">Relatório gerencial feito a partir das vendas registradas no sistema. Não substitui nota fiscal nem a análise do contador.</p>
        </>
      )}
    </div>
  )
}
