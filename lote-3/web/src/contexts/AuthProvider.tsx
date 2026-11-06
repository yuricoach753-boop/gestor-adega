import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Perfil } from '@/types'

interface AuthCtx {
  session: Session | null
  user: User | null
  perfil: Perfil | null
  carregando: boolean
  perfilCarregando: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, nova) => setSession(nova))
    return () => data.subscription.unsubscribe()
  }, [])

  const user = session?.user ?? null

  const { data: perfil = null, isLoading: perfilCarregando } = useQuery({
    queryKey: ['perfil', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('perfis').select('id, nome, telefone, is_super_admin').eq('id', user!.id).maybeSingle()
      if (error) throw error
      return data as Perfil | null
    },
  })

  async function sair() {
    await supabase.auth.signOut()
    qc.clear()
  }

  return <Ctx.Provider value={{ session, user, perfil, carregando, perfilCarregando: !!user && perfilCarregando, sair }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}
