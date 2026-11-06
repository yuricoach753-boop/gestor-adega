import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { hojeISO, diasEntre } from '@/lib/format'
import { useAuth } from './AuthProvider'
import type { ConfigSistema, Empresa, Papel, Vinculo } from '@/types'

const CHAVE = 'empresa_ativa'

function lerSalva(): string | null {
  try { return localStorage.getItem(CHAVE) } catch { return null }
}
function salvar(id: string) {
  try { localStorage.setItem(CHAVE, id) } catch { /* navegador sem storage: segue sem lembrar */ }
}

interface EmpresaCtx {
  vinculos: Vinculo[]
  carregando: boolean
  empresa: Empresa | null
  papel: Papel | null
  ehDono: boolean
  liberada: boolean
  diasDeTeste: number | null
  config: ConfigSistema | null
  trocarEmpresa: (id: string) => void
  recarregar: () => Promise<unknown>
}

const Ctx = createContext<EmpresaCtx | null>(null)

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [ativaId, setAtivaId] = useState<string | null>(lerSalva)
  const qc = useQueryClient()
  // Recarrega os vínculos do usuário ATUAL. (Usar o refetch da query aqui dava problema logo
  // depois do cadastro: a função guardada era da renderização anterior, ainda sem usuário.)
  const recarregarVinculos = useCallback(() => qc.refetchQueries({ queryKey: ['vinculos'], type: 'all' }), [qc])

  const { data: vinculos = [], isLoading, isFetching } = useQuery({
    queryKey: ['vinculos', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('membros_empresa')
        .select('papel, ativo, empresa:empresas(*)')
        .eq('usuario_id', user!.id)
        .eq('ativo', true)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as Vinculo[]
    },
  })

  const atual = vinculos.find((v) => v.empresa.id === ativaId) ?? vinculos[0] ?? null

  // A regra de liberação fica só no banco (tolerância de pagamento, teste grátis...)
  const liberacao = useQuery({
    queryKey: ['liberada', atual?.empresa.id, atual?.empresa.status_assinatura, atual?.empresa.assinatura_vence_em, atual?.empresa.trial_ate],
    enabled: !!atual,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('empresa_liberada', { p_empresa: atual!.empresa.id })
      if (error) throw error
      return data as boolean
    },
  })

  const config = useQuery({
    queryKey: ['config-sistema', user?.id],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('config_sistema').select('trial_dias, dias_tolerancia, suporte_whatsapp').maybeSingle()
      if (error) throw error
      return data as ConfigSistema | null
    },
  })

  const trocarEmpresa = useCallback((id: string) => {
    salvar(id)
    setAtivaId(id)
  }, [])

  const valor = useMemo<EmpresaCtx>(() => {
    const empresa = atual?.empresa ?? null
    const diasDeTeste =
      empresa?.status_assinatura === 'trial' && empresa.trial_ate ? diasEntre(hojeISO(), empresa.trial_ate) : null
    return {
      vinculos,
      // Sem empresa e recarregando (ex.: logo depois de aceitar o convite): espera a resposta nova
      // em vez de usar a lista antiga vazia e mandar a pessoa para "criar empresa".
      carregando: !!user && (isLoading || (vinculos.length === 0 && isFetching) || (!!atual && liberacao.isLoading)),
      empresa,
      papel: atual?.papel ?? null,
      ehDono: atual?.papel === 'dono',
      liberada: liberacao.data ?? false,
      diasDeTeste,
      config: config.data ?? null,
      trocarEmpresa,
      recarregar: recarregarVinculos,
    }
  }, [atual, vinculos, user, isLoading, isFetching, trocarEmpresa, recarregarVinculos, liberacao.data, liberacao.isLoading, config.data])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEmpresa() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEmpresa fora do EmpresaProvider')
  return ctx
}
