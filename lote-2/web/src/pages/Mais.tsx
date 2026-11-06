import { Link } from 'react-router-dom'
import { ChevronRight, LogOut, UserRound } from 'lucide-react'
import { itensBarra, itensMenu } from '@/components/layout/navegacao'
import { PageHeader } from '@/components/PageHeader'
import { useAuth } from '@/contexts/AuthProvider'
import { useEmpresa } from '@/contexts/EmpresaProvider'

export default function Mais() {
  const { ehDono } = useEmpresa()
  const { sair } = useAuth()
  const naBarra = new Set(itensBarra(ehDono).map((i) => i.rota))
  const itens = itensMenu(ehDono).filter((i) => !naBarra.has(i.rota))
  return (
    <>
      <PageHeader titulo="Mais opções" />
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {itens.map((i) => (
          <Link key={i.rota} to={i.rota} className="flex items-center gap-3 px-4 py-4 hover:bg-muted">
            <i.icone className="size-5 text-muted-foreground" />
            <span className="flex-1 font-medium">{i.rotulo}</span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        ))}
        {!ehDono && (
          <Link to="/configuracoes/perfil" className="flex items-center gap-3 px-4 py-4 hover:bg-muted">
            <UserRound className="size-5 text-muted-foreground" />
            <span className="flex-1 font-medium">Meus dados</span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        )}
        <button onClick={() => sair()} className="flex w-full items-center gap-3 px-4 py-4 text-left text-destructive hover:bg-muted">
          <LogOut className="size-5" />
          <span className="flex-1 font-medium">Sair</span>
        </button>
      </div>
    </>
  )
}
