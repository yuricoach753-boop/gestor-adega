import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { fluxoCadastro } from '@/lib/login'
import { useAuth } from '@/contexts/AuthProvider'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { Splash } from './Splash'
import { EmptyState } from './EmptyState'
import AcessoBloqueado from '@/pages/AcessoBloqueado'
import AcessoRemovido from '@/pages/AcessoRemovido'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Precisa estar logado. Guarda a página de origem para voltar depois do login. */
export function ExigeLogin() {
  const { session, carregando } = useAuth()
  const local = useLocation()
  if (carregando) return <Splash />
  if (!session) {
    const voltar = encodeURIComponent(local.pathname + local.search)
    return <Navigate to={`/entrar?voltar=${voltar}`} replace />
  }
  return <Outlet />
}

/** Telas de login/cadastro: quem já está logado vai para o início. */
export function SomenteDeslogado() {
  const { session, carregando } = useAuth()
  const [params] = useSearchParams()
  if (carregando) return <Splash />
  // O cadastro ainda está criando a empresa / aceitando o convite: deixa a tela terminar.
  if (session && fluxoCadastro.ativo) return <Outlet />
  if (session) {
    const convite = params.get('convite')
    const voltar = params.get('voltar')
    const destino = convite ? `/convite/${encodeURIComponent(convite)}`
      : voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/'
    return <Navigate to={destino} replace />
  }
  return <Outlet />
}

/** Precisa ter uma empresa e ela precisa estar liberada (assinatura em dia). */
export function ExigeEmpresa() {
  const { carregando, empresa, liberada } = useEmpresa()
  const { user, perfil, perfilCarregando } = useAuth()
  // Sem empresa ativa: foi tirado de uma empresa? (aí não manda para "criar empresa")
  const removido = useQuery({
    queryKey: ['acesso-removido', user?.id],
    enabled: !!user && !carregando && !empresa,
    queryFn: async () => {
      const { data } = await supabase.from('membros_empresa').select('empresa_id').eq('usuario_id', user!.id).eq('ativo', false).limit(1)
      return !!data?.length
    },
  })
  if (carregando || (!empresa && (perfilCarregando || removido.isLoading))) return <Splash />
  if (!empresa && !perfil?.is_super_admin && removido.data) return <AcessoRemovido />
  if (!empresa) return <Navigate to={perfil?.is_super_admin ? '/admin' : '/criar-empresa'} replace />
  if (!liberada) return <AcessoBloqueado />
  return <Outlet />
}

/** Conteúdo restrito ao dono (financeiro, relatórios, configurações da empresa). */
export function SomenteDono({ children }: { children: ReactNode }) {
  const { ehDono } = useEmpresa()
  if (!ehDono)
    return (
      <EmptyState
        icone={ShieldAlert}
        titulo="Área do dono"
        descricao="Só o dono da empresa tem acesso a esta parte. Se você precisa dela, peça para o dono mudar sua permissão."
      />
    )
  return <>{children}</>
}

/** Só o administrador do sistema (você). */
export function ExigeSuperAdmin() {
  const { perfil, carregando, perfilCarregando } = useAuth()
  if (carregando || perfilCarregando) return <Splash />
  if (!perfil?.is_super_admin)
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState icone={ShieldAlert} titulo="Área restrita" descricao="Esta área é só para o administrador do sistema." />
      </div>
    )
  return <Outlet />
}
