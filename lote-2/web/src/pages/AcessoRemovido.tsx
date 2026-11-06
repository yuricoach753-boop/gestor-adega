import { Link } from 'react-router-dom'
import { UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthProvider'
import { AuthLayout } from './auth/AuthLayout'

/** Quem foi tirado da empresa pelo dono (e não tem outra empresa) cai aqui, e não em "criar empresa". */
export default function AcessoRemovido() {
  const { sair } = useAuth()
  return (
    <AuthLayout titulo="Seu acesso foi removido">
      <div className="grid gap-4 text-center">
        <UserX className="mx-auto size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          O dono da empresa tirou o seu acesso ao sistema. Se isso foi um engano, fale com ele para liberar de novo.
        </p>
        <Button size="lg" onClick={() => sair()}>Sair</Button>
        <Link to="/criar-empresa" className="text-xs text-muted-foreground underline">Quero cadastrar uma empresa minha</Link>
      </div>
    </AuthLayout>
  )
}
