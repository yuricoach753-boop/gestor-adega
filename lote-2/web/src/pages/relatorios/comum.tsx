import { useState, type ReactNode } from 'react'
import { FileSpreadsheet, FileText, Loader2, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { exportarCsv, exportarExcel, exportarPdf, textoCelula, type Coluna, type Relatorio } from '@/lib/exportar'
import { cn } from '@/lib/utils'

export function Kpi({ titulo, valor, detalhe, alerta }: { titulo: string; valor: string; detalhe?: ReactNode; alerta?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p title={valor} className={cn('mt-0.5 truncate text-lg font-semibold tabular', alerta && 'text-destructive')}>{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  )
}

export function Tabela<T>({ colunas, linhas, totais, chave, destaque }: {
  colunas: Coluna<T>[]
  linhas: T[]
  totais?: Array<string | number | null>
  chave: (l: T, i: number) => string
  destaque?: (l: T, coluna: number) => string | undefined
}) {
  const numerica = (c: Coluna<T>) => c.tipo && c.tipo !== 'texto' && c.tipo !== 'data'
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>{colunas.map((c) => <th key={c.titulo} className={cn('px-3 py-2 font-medium', numerica(c) ? 'text-right' : 'text-left')}>{c.titulo}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {linhas.map((l, i) => (
            <tr key={chave(l, i)} className="hover:bg-muted/50">
              {colunas.map((c, j) => (
                <td key={c.titulo} className={cn('px-3 py-2', numerica(c) ? 'text-right tabular' : 'max-w-56 truncate', j === 0 && 'font-medium', destaque?.(l, j))}>
                  {textoCelula(c.valor(l), c.tipo) || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totais && (
          <tfoot className="border-t-2 bg-muted/60 font-semibold">
            <tr>{totais.map((t, i) => <td key={i} className={cn('px-3 py-2', i > 0 && numerica(colunas[i]) ? 'text-right tabular' : '')}>{i === 0 ? t : textoCelula(t, colunas[i]?.tipo)}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export function Exportar<T>({ relatorio, desabilitado }: { relatorio: () => Relatorio<T>; desabilitado?: boolean }) {
  const [carregando, setCarregando] = useState<string | null>(null)
  async function rodar(tipo: 'xlsx' | 'csv' | 'pdf') {
    setCarregando(tipo)
    try {
      const r = relatorio()
      if (tipo === 'csv') exportarCsv(r)
      else if (tipo === 'xlsx') await exportarExcel(r)
      else await exportarPdf(r)
    } catch {
      toast.error('Não foi possível gerar o arquivo. Tente de novo.')
    } finally {
      setCarregando(null)
    }
  }
  const icone = (t: string, I: typeof FileText) => (carregando === t ? <Loader2 className="animate-spin" /> : <I />)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Exportar:</span>
      <Button size="sm" variant="outline" disabled={desabilitado || !!carregando} onClick={() => rodar('xlsx')}>{icone('xlsx', FileSpreadsheet)} Excel</Button>
      <Button size="sm" variant="outline" disabled={desabilitado || !!carregando} onClick={() => rodar('csv')}>{icone('csv', Table2)} CSV</Button>
      <Button size="sm" variant="outline" disabled={desabilitado || !!carregando} onClick={() => rodar('pdf')}>{icone('pdf', FileText)} PDF</Button>
    </div>
  )
}

export function Secao({ titulo, children, acoes }: { titulo: string; children: ReactNode; acoes?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  )
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{texto}</p>
}
