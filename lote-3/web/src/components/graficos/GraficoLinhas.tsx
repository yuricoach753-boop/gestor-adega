import { useState } from 'react'
import { formatarData, formatarMoeda } from '@/lib/format'
import { diaMes, escala, moedaCurta, useLargura } from './util'

export interface Serie { nome: string; cor: string; valores: number[] }

const M = { esq: 60, dir: 70, topo: 10, base: 22 }

/**
 * Linhas ao longo do tempo (ex.: entradas x saídas).
 * Passe o dedo/mouse: uma linha vertical mostra os valores de todas as séries naquele dia.
 */
export function GraficoLinhas({ dias, series, altura = 200, titulo }: { dias: string[]; series: Serie[]; altura?: number; titulo: string }) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [idx, setIdx] = useState<number | null>(null)
  const [tabela, setTabela] = useState(false)
  const n = dias.length
  const max = Math.max(0, ...series.flatMap((s) => s.valores))
  const { topo, passos } = escala(max)
  const w = Math.max(largura - M.esq - M.dir, 10)
  const h = altura - M.topo - M.base
  const x = (i: number) => M.esq + (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (v: number) => M.topo + h - (v / topo) * h

  // rótulos no fim das linhas, sem encostar um no outro
  const fins = series.map((s, i) => ({ i, y: y(s.valores[n - 1] ?? 0) })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < fins.length; k++) if (fins[k].y - fins[k - 1].y < 13) fins[k].y = fins[k - 1].y + 13
  const yFim = Object.fromEntries(fins.map((f) => [f.i, f.y]))

  const marcasX = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0]

  function mover(clientX: number, el: SVGSVGElement) {
    const r = el.getBoundingClientRect()
    const rel = clientX - r.left - M.esq
    setIdx(Math.max(0, Math.min(n - 1, Math.round((rel / w) * (n - 1)))))
  }

  const tipX = idx === null ? 0 : x(idx)
  const tipEsquerda = tipX > largura / 2

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        {series.map((s) => (
          <span key={s.nome} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.cor }} />{s.nome}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative select-none">
        {largura > 0 && (
          <svg width={largura} height={altura} role="img" aria-label={titulo} tabIndex={0}
            className="touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
            onPointerMove={(e) => mover(e.clientX, e.currentTarget)} onPointerDown={(e) => mover(e.clientX, e.currentTarget)}
            onPointerLeave={() => setIdx(null)} onBlur={() => setIdx(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setIdx((i) => Math.min(n - 1, (i ?? -1) + 1))
              if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, (i ?? n) - 1))
            }}>
            {passos.map((p) => (
              <g key={p}>
                <line x1={M.esq} x2={M.esq + w} y1={y(p)} y2={y(p)} stroke="var(--border)" strokeWidth={p === 0 ? 1.5 : 1} />
                <text x={M.esq - 6} y={y(p)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular">{moedaCurta(p)}</text>
              </g>
            ))}
            {marcasX.map((i) => (
              <text key={i} x={x(i)} y={altura - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-muted-foreground text-[10px]">{diaMes(dias[i])}</text>
            ))}
            {series.map((s, si) => (
              <g key={s.nome}>
                <polyline fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
                <circle cx={x(n - 1)} cy={y(s.valores[n - 1] ?? 0)} r={4} fill={s.cor} stroke="var(--card)" strokeWidth={2} />
                <text x={x(n - 1) + 8} y={yFim[si]} dy="0.32em" className="fill-muted-foreground text-[11px]">{s.nome}</text>
              </g>
            ))}
            {idx !== null && (
              <g pointerEvents="none">
                <line x1={tipX} x2={tipX} y1={M.topo} y2={M.topo + h} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" />
                {series.map((s) => <circle key={s.nome} cx={tipX} cy={y(s.valores[idx])} r={4} fill={s.cor} stroke="var(--card)" strokeWidth={2} />)}
              </g>
            )}
          </svg>
        )}
        {idx !== null && (
          <div className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
            style={tipEsquerda ? { right: largura - tipX + 10 } : { left: tipX + 10 }}>
            <p className="mb-1 text-muted-foreground">{formatarData(dias[idx])}</p>
            {series.map((s) => (
              <p key={s.nome} className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded-full" style={{ background: s.cor }} />
                <strong className="tabular">{formatarMoeda(s.valores[idx])}</strong>
                <span className="text-muted-foreground">{s.nome}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={() => setTabela((t) => !t)} className="mt-1 text-xs text-primary hover:underline">
        {tabela ? 'Esconder tabela' : 'Ver em tabela'}
      </button>
      {tabela && (
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border text-xs">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted"><tr><th className="px-2 py-1 text-left font-medium">Dia</th>{series.map((s) => <th key={s.nome} className="px-2 py-1 text-right font-medium">{s.nome}</th>)}</tr></thead>
            <tbody>
              {dias.map((d, i) => (
                <tr key={d} className="border-t"><td className="px-2 py-1">{formatarData(d)}</td>{series.map((s) => <td key={s.nome} className="px-2 py-1 text-right tabular">{formatarMoeda(s.valores[i])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
