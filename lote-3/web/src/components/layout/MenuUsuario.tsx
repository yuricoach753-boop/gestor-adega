import { useNavigate } from 'react-router-dom'
import { Building2, Check, LogOut, Plus, ShieldCheck, UserRound } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthProvider'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { NOME_PAPEL } from '@/types'
import { iniciais } from '@/lib/utils'
import { mostrarLogin } from '@/lib/login'

export function MenuUsuario({ comNome = false }: { comNome?: boolean }) {
  const { perfil, user, sair } = useAuth()
  const { vinculos, empresa, papel, trocarEmpresa } = useEmpresa()
  const navigate = useNavigate()
  const nome = perfil?.nome || mostrarLogin(user?.email) || ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-lg p-1.5 text-left outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {iniciais(nome)}
        </span>
        {comNome && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{nome}</span>
            <span className="block truncate text-xs text-muted-foreground">{papel ? NOME_PAPEL[papel] : ''}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate">{mostrarLogin(user?.email)}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate('/configuracoes/perfil')}>
          <UserRound /> Meus dados
        </DropdownMenuItem>
        {perfil?.is_super_admin && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <ShieldCheck /> Painel do administrador
          </DropdownMenuItem>
        )}
        {vinculos.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Trocar de empresa</DropdownMenuLabel>
            {vinculos.map((v) => (
              <DropdownMenuItem key={v.empresa.id} onSelect={() => { trocarEmpresa(v.empresa.id); navigate('/') }}>
                <Building2 />
                <span className="flex-1 truncate">{v.empresa.nome_fantasia}</span>
                {v.empresa.id === empresa?.id && <Check className="!text-primary" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuItem onSelect={() => navigate('/criar-empresa')}>
          <Plus /> Cadastrar outra empresa
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => sair()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
