import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface Props {
  titulo: string
  descricao?: string
  voltarPara?: string
  acoes?: ReactNode
}

export function PageHeader({ titulo, descricao, voltarPara, acoes }: Props) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {voltarPara && (
          <Link to={voltarPara} className="-ml-2 rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Voltar">
            <ArrowLeft className="size-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl">{titulo}</h1>
          {descricao && <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex shrink-0 gap-2">{acoes}</div>}
    </div>
  )
}
