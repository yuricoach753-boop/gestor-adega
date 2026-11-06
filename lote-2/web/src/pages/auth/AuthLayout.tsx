import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { APP } from '@/config'

export function AuthLayout({ titulo, subtitulo, children, rodape }: {
  titulo: string
  subtitulo?: ReactNode
  children: ReactNode
  rodape?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-accent/60 to-background">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Logo />
          <p className="text-sm text-muted-foreground">{APP.slogan}</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {rodape && <div className="mt-6 text-center text-sm text-muted-foreground">{rodape}</div>}
      </div>
    </div>
  )
}
