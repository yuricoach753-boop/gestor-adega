import { useState } from 'react'
import { formatarMoeda } from '@/lib/format'
import { escala, moedaCurta, useLargura } from './util'

const M = { esq: 60, dir: 8, topo: 10, base: 22 }

/** Colunas de uma série (ex.: faturamento por dia). Toque na coluna para ver o valor. */
export function GraficoColunas({ rotulos, detalhes, valores, cor = 'var(--serie-1)', altura = 200, titulo, formatar = formatarMoeda }: {
  rotulos: string[]          // rótulo curto no eixo (ex.: 09/10)
  detalhes?: string[]        // rótulo longo no tooltip (ex.: 09/10/2026)
  valores: number[]
  cor?: string
  altura?: number
  titulo: string
  formatar?: (v: number) => string
}) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [ativo, setAtivo] = useState<number | null>(null)
  const n = valores.length
  const { topo, passos } = escala(Math.max(0, ...valores))
  const w = Math.max(largura - M.esq - M.dir, 10)
  const h = altura - M.topo - M.base
  const banda = w / Math.max(n, 1)
  const larg = Math.max(2, Math.min(24, banda - 2)) // ≤ 24px e 2px de respiro entre colunas
  const y = (v: number) => M.topo + h - (v / topo) * h
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 46))))

  function coluna(i: number) {
    const v = valores[i]
    const x0 = M.esq + i * banda + (banda - larg) / 2
    const altCol = Math.max(0, M.topo + h - y(v))
    if (altCol <= 0) return null
    const r = Math.min(4, larg / 2, altCol)
    const yt = y(v)
    const base = M.topo + h
    return `M${x0},${base} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + larg - r} Q${x0 + larg},${yt} ${x0 + larg},${yt + r} V${base} Z`
  }

  const tipX = ativo === null ? 0 : M.esq + ativo * banda + banda / 2

  return (
    <div ref={ref} className="relative select-none">
      {largura > 0 && (
        <svg width={largura} height={altura} role="img" aria-label={titulo} onPointerLeave={() => setAtivo(null)} className="touch-pan-y">
          {passos.map((p) => (
            <g key={p}>
              <line x1={M.esq} x2={M.esq + w} y1={y(p)} y2={y(p)} stroke="var(--border)" strokeWidth={p === 0 ? 1.5 : 1} />
              <text x={M.esq - 6} y={y(p)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular">{moedaCurta(p)}</text>
            </g>
          ))}
          {valores.map((v, i) => {
            const d = coluna(i)
            return (
              <g key={i} tabIndex={0} role="img" aria-label={`${detalhes?.[i] ?? rotulos[i]}: ${formatar(v)}`}
                onPointerEnter={() => setAtivo(i)} onPointerDown={() => setAtivo(i)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)}
                className="outline-none">
                <rect x={M.esq + i * banda} y={M.topo} width={banda} height={h} fill="transparent" />
                {d && <path d={d} fill={cor} opacity={ativo === null || ativo === i ? 1 : 0.55} />}
                {i % cada === 0 && (
                  <text x={M.esq + i * banda + banda / 2} y={altura - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{rotulos[i]}</text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {ativo !== null && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
          style={tipX > largura / 2 ? { right: largura - tipX + 8 } : { left: tipX + 8 }}>
          <p className="text-muted-foreground">{detalhes?.[ativo] ?? rotulos[ativo]}</p>
          <p><strong className="tabular">{formatar(valores[ativo])}</strong></p>
        </div>
      )}
    </div>
  )
}
