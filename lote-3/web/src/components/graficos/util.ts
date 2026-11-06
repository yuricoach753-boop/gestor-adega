import { useEffect, useRef, useState } from 'react'

/** Largura do elemento (responde a mudanças de tamanho da tela). */
export function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, largura] as const
}

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
export const moedaCurta = (v: number) => `R$ ${compacto.format(v)}`

/** Escala "bonita" de 0 até um pouco acima do máximo, com ~4 marcas. */
export function escala(max: number, marcas = 4) {
  if (max <= 0) return { topo: 1, passos: [0, 1] }
  const bruto = max / marcas
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? 10 * mag
  const topo = Math.ceil(max / passo) * passo
  const passos: number[] = []
  for (let v = 0; v <= topo + 1e-9; v += passo) passos.push(v)
  return { topo, passos }
}

export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
