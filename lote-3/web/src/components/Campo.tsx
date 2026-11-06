import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface Props {
  rotulo: string
  htmlFor: string
  erro?: string
  dica?: string
  opcional?: boolean
  className?: string
  children: ReactNode
}

/** Rótulo + campo + mensagem de erro. Marcamos o que é opcional (a maioria), não o obrigatório. */
export function Campo({ rotulo, htmlFor, erro, dica, opcional, className, children }: Props) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {rotulo}
        {opcional && <span className="font-normal text-muted-foreground">(opcional)</span>}
      </Label>
      {children}
      {erro ? (
        <p role="alert" className="text-sm text-destructive">{erro}</p>
      ) : dica ? (
        <p className="text-xs text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  )
}
