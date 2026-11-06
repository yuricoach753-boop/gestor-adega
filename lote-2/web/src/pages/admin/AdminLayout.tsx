import { Link, NavLink, Outlet } from 'react-router-dom'
import { ArrowLeft, Building2, Settings, Tags } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { MenuUsuario } from '@/components/layout/MenuUsuario'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { cn } from '@/lib/utils'

const NAV = [
  { rota: '/admin', rotulo: 'Empresas', icone: Building2, end: true },
  { rota: '/admin/planos', rotulo: 'Planos', icone: Tags },
  { rota: '/admin/config', rotulo: 'Configurações', curto: 'Config.', icone: Settings },
]

export default function AdminLayout() {
  const { vinculos } = useEmpresa()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">Admin</span>
          </div>
          <div className="flex items-center gap-1">
            {vinculos.length > 0 && (
              <Link to="/" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted" aria-label="Voltar ao sistema">
                <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Voltar ao sistema</span>
              </Link>
            )}
            <MenuUsuario />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((i) => (
            <NavLink key={i.rota} to={i.rota} end={i.end}
              className={({ isActive }) => cn('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 sm:px-3 text-sm font-medium text-muted-foreground hover:bg-muted',
                isActive && 'bg-accent text-accent-foreground')}>
              <i.icone className="size-4" /> {'curto' in i ? <><span className="sm:hidden">{i.curto}</span><span className="hidden sm:inline">{i.rotulo}</span></> : i.rotulo}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-16">
        <Outlet />
      </main>
    </div>
  )
}
