import { Badge } from '@/components/ui/badge'

const MAPA = {
  a_vencer: ['A vencer', 'secondary'],
  vence_hoje: ['Vence hoje', 'warning'],
  atrasada: ['Atrasada', 'destructive'],
  paga: ['Paga', 'default'],
  cancelada: ['Cancelada', 'outline'],
} as const

export function BadgeSituacao({ situacao }: { situacao: keyof typeof MAPA }) {
  const [texto, variante] = MAPA[situacao]
  return <Badge variant={variante}>{texto}</Badge>
}
