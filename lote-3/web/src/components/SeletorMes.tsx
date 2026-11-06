import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hojeISO } from '@/lib/format'

/** Mês no formato "2026-10". */
export function mesAtual() { return hojeISO().slice(0, 7) }
export function limitesMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  return { inicio: `${mes}-01`, fim }
}
function somarMes(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
export function nomeMes(mes: string, curto = false) {
  const [a, m] = mes.split('-').map(Number)
  const t = new Intl.DateTimeFormat('pt-BR', { month: curto ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 15)))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function SeletorMes({ valor, onChange }: { valor: string; onChange: (m: string) => void }) {
  const noLimite = valor >= mesAtual()
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-1">
      <Button variant="ghost" size="icon" onClick={() => onChange(somarMes(valor, -1))} aria-label="Mês anterior"><ChevronLeft /></Button>
      <span className="text-sm font-medium">{nomeMes(valor)}</span>
      <Button variant="ghost" size="icon" onClick={() => onChange(somarMes(valor, 1))} disabled={noLimite} aria-label="Próximo mês"><ChevronRight /></Button>
    </div>
  )
}
