import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { Splash } from '@/components/Splash'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { useAuth } from '@/contexts/AuthProvider'
import { schemaSenha } from '@/lib/validacao'
import { AuthLayout } from './AuthLayout'

type Form = z.infer<typeof schemaSenha>

export default function NovaSenha() {
  const { session, carregando } = useAuth()
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schemaSenha) })

  if (carregando) return <Splash />
  if (!session)
    return (
      <AuthLayout titulo="Link inválido ou expirado">
        <p className="text-sm text-muted-foreground">Peça um novo link de recuperação de senha.</p>
        <Button asChild className="mt-4 w-full"><Link to="/esqueci-senha">Pedir novo link</Link></Button>
      </AuthLayout>
    )

  async function onSubmit({ senha }: Form) {
    setErro(null)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) return setErro(mensagemErro(error))
    toast.success('Senha alterada!')
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout titulo="Criar senha nova">
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
        <Campo rotulo="Senha nova" htmlFor="senha" erro={errors.senha?.message}>
          <Input id="senha" type="password" autoComplete="new-password" aria-invalid={!!errors.senha} {...register('senha')} />
        </Campo>
        <Campo rotulo="Repita a senha" htmlFor="confirmar" erro={errors.confirmar?.message}>
          <Input id="confirmar" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmar} {...register('confirmar')} />
        </Campo>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Salvar senha
        </Button>
      </form>
    </AuthLayout>
  )
}
