import { Loader2 } from 'lucide-react'

export function Splash({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm">{texto}</p>
    </div>
  )
}
