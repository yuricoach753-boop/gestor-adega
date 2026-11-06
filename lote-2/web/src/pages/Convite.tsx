import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, UserPlus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Splash } from '@/components/Splash'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { useAuth } from '@/contexts/AuthProvider'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { NOME_PAPEL, type Papel } from '@/types'
import { AuthLayout } from './auth/AuthLayout'
import { mostrarLogin } from '@/lib/login'

const MOTIVO: Record<string, string> = {
  usado: 'Este convite já foi usado.',
  expirado: 'Este convite expirou.',
  cancelado: 'Este convite foi cancelado.',
}

export default function Convite() {
  const { token = '' } = useParams()
  const { session, carregando: carregandoAuth, user, sair } = useAuth()
  const { trocarEmpresa, recarregar } = useEmpresa()
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const [aceitando, setAceitando] = useState(false)

  const { data: info, isLoading } = useQuery({
    queryKey: ['convite', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('info_convite', { p_token: token })
      if (error) throw error
      return (data as Array<{ empresa_nome: string; papel: Papel; situacao: string }>)[0] ?? null
    },
  })

  if (isLoading || carregandoAuth) return <Splash />

  if (!info || info.situacao !== 'valido')
    return (
      <AuthLayout titulo="Convite indisponível">
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="size-12 text-destructive" />
          <p>{info ? MOTIVO[info.situacao] : 'Não encontramos este convite.'}</p>
          <p className="text-sm text-muted-foreground">Peça um novo link para o dono da empresa.</p>
          <Button asChild variant="outline" className="mt-2 w-full"><Link to="/">Ir para o início</Link></Button>
        </div>
      </AuthLayout>
    )

  async function aceitar() {
    setErro(null)
    setAceitando(true)
    const { data, error } = await supabase.rpc('aceitar_convite', { p_token: token })
    if (error) {
      setAceitando(false)
      return setErro(mensagemErro(error))
    }
    trocarEmpresa(data as string)
    await recarregar()
    navigate('/', { replace: true })
  }

  const voltar = encodeURIComponent(`/convite/${token}`)

  return (
    <AuthLayout titulo="Você foi convidado">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <UserPlus className="size-7" />
        </span>
        <p className="text-lg">
          Entrar em <strong>{info.empresa_nome}</strong>
        </p>
        <p className="text-sm text-muted-foreground">como {NOME_PAPEL[info.papel].toLowerCase()}</p>
      </div>
      {erro && <Alert variant="destructive" className="mt-4"><AlertDescription>{erro}</AlertDescription></Alert>}
      <div className="mt-6 grid gap-2">
        {session ? (
          <>
            <Button size="lg" onClick={aceitar} disabled={aceitando}>
              {aceitando && <Loader2 className="animate-spin" />} Aceitar convite
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Entrando como {mostrarLogin(user?.email)}.{' '}
              <button onClick={() => sair()} className="text-primary hover:underline">Não é você?</button>
            </p>
          </>
        ) : (
          <>
            <Button asChild size="lg"><Link to={`/cadastrar?convite=${token}`}>Criar minha conta</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to={`/entrar?voltar=${voltar}`}>Já tenho conta</Link></Button>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
