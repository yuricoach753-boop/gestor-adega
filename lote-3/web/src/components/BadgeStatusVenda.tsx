import { Badge } from '@/components/ui/badge'
import { NOME_STATUS_VENDA, type StatusVenda } from '@/types'

const VAR = { aberto: 'warning', separado: 'secondary', entregue: 'default', cancelado: 'destructive' } as const

export function BadgeStatusVenda({ status }: { status: StatusVenda }) {
  return <Badge variant={VAR[status]}>{NOME_STATUS_VENDA[status]}</Badge>
}
