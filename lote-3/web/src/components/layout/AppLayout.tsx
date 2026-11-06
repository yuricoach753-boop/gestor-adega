import { Link, Outlet, useLocation } from 'react-router-dom'
import { Clock, Menu } from 'lucide-react'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { cn } from '@/lib/utils'
import { diasEntre, formatarData, hojeISO } from '@/lib/format'
import { Logo } from '@/components/Logo'
import { MenuUsuario } from './MenuUsuario'
import { itemAtivo, itensBarra, itensMenu } from './navegacao'

function AvisoAssinatura() {
  const { empresa, diasDeTeste, ehDono, config } = useEmpresa()
  if (!empresa || !ehDono) return null
  const hoje = hojeISO()
  const vence = empresa.assinatura_vence_em
  const pago = empresa.status_assinatura === 'ativa' || empresa.status_assinatura === 'inadimplente'

  if (pago && vence && vence < hoje) {
    const bloqueio = new Date(`${vence}T12:00:00Z`)
    bloqueio.setUTCDate(bloqueio.getUTCDate() + (config?.dias_tolerancia ?? 7))
    return (
      <Link to="/configuracoes/assinatura" className="block bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        A mensalidade venceu em {formatarData(vence)}. Regularize até {formatarData(bloqueio.toISOString().slice(0, 10))} para não perder o acesso.
      </Link>
    )
  }
  if (pago && vence && diasEntre(hoje, vence) <= 5)
    return (
      <Link to="/configuracoes/assinatura" className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-center text-sm text-amber-900">
        <Clock className="size-4 shrink-0" />
        {vence === hoje ? 'A mensalidade vence hoje.' : `A mensalidade vence em ${formatarData(vence)}.`}
      </Link>
    )
  if (diasDeTeste !== null && diasDeTeste <= 7)
    return (
      <Link to="/configuracoes/assinatura" className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-center text-sm text-amber-900">
        <Clock className="size-4 shrink-0" />
        {diasDeTeste <= 0 ? 'Seu teste grátis termina hoje.' : `Seu teste grátis termina em ${diasDeTeste} ${diasDeTeste === 1 ? 'dia' : 'dias'}.`}
      </Link>
    )
  return null
}

export default function AppLayout() {
  const { empresa, ehDono } = useEmpresa()
  const itens = itensMenu(ehDono)
  const barra = itensBarra(ehDono)
  const { pathname } = useLocation()
  const naBarra = barra.some((i) => itemAtivo(i, pathname))

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barra lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <div className="px-5 pb-3">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{empresa?.nome_fantasia}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {itens.map((i) => (
            <Link
              key={i.rota}
              to={i.rota}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                itemAtivo(i, pathname) && 'bg-accent text-accent-foreground hover:bg-accent',
              )}
            >
              <i.icone className="size-5" />
              {i.rotulo}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <MenuUsuario comNome />
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-card/95 px-4 backdrop-blur lg:hidden">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">{empresa?.nome_fantasia}</p>
        </div>
        <MenuUsuario />
      </header>

      <AvisoAssinatura />

      <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 sm:px-6 lg:pb-10 lg:pt-8">
        <Outlet />
      </main>

      {/* Barra inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="grid grid-cols-5">
          {barra.map((i) => (
            <Link
              key={i.rota}
              to={i.rota}
              className={cn('flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground', itemAtivo(i, pathname) && 'text-primary')}
            >
              <i.icone className="size-6" />
              {i.rotulo}
            </Link>
          ))}
          <Link to="/mais" className={cn('flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground', !naBarra && 'text-primary')}>
            <Menu className="size-6" />
            Mais
          </Link>
        </div>
      </nav>
    </div>
  )
}
