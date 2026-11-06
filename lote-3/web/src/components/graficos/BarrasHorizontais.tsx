import type { ReactNode } from 'react'
import { formatarMoeda } from '@/lib/format'

/** Ranking em barras horizontais (ex.: despesas por categoria). Todos os valores ficam escritos. */
export function BarrasHorizontais({ itens, cor = 'var(--serie-1)', formatar = formatarMoeda }: {
  itens: Array<{ rotulo: string; valor: number; extra?: ReactNode }>
  cor?: string
  formatar?: (v: number) => string
}) {
  const max = Math.max(0, ...itens.map((i) => i.valor))
  return (
    <ul className="space-y-3">
      {itens.map((i) => (
        <li key={i.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{i.rotulo}</span>
            <span className="shrink-0 tabular"><strong>{formatar(i.valor)}</strong>{i.extra && <span className="ml-1.5 text-xs text-muted-foreground">{i.extra}</span>}</span>
          </div>
          <div className="h-2 w-full">
            <div className="h-2 rounded-r-[4px]" style={{ width: `${max > 0 ? Math.max((i.valor / max) * 100, 1) : 0}%`, background: cor }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
