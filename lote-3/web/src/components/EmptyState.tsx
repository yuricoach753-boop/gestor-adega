import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  icone: LucideIcon
  titulo: string
  descricao: ReactNode
  acao?: ReactNode
}

export function EmptyState({ icone: Icone, titulo, descricao, acao }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icone className="size-7" />
      </div>
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <div className="max-w-sm text-sm text-muted-foreground">{descricao}</div>
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}
