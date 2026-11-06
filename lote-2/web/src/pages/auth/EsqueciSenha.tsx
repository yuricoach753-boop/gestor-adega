import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { AuthLayout } from './AuthLayout'

const schema = z.object({ email: z.string().trim().min(1, 'Informe seu e-mail.').email('Este e-mail não parece válido.') })
type Form = z.infer<typeof schema>

export default function EsqueciSenha() {
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit({ email }: Form) {
    setErro(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/nova-senha` })
    if (error) return setErro(mensagemErro(error))
    setEnviado(true)
  }

  return (
    <AuthLayout
      titulo="Recuperar senha"
      subtitulo={enviado ? undefined : 'Informe seu e-mail e enviaremos um link para criar uma senha nova.'}
      rodape={<Link to="/entrar" className="font-medium text-primary hover:underline">Voltar para o login</Link>}
    >
      {enviado ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-12 text-primary" />
          <p>Se este e-mail tiver cadastro, você vai receber o link em instantes.</p>
          <p className="text-sm text-muted-foreground">Não chegou? Olhe a pasta de spam.</p>
        </div>
      ) : (
        <>
        <p className="mb-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Entra pelo <strong>WhatsApp</strong>? Peça para o dono da empresa trocar sua senha em Configurações → Usuários.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
          <Campo rotulo="E-mail" htmlFor="email" erro={errors.email?.message}>
            <Input id="email" type="email" inputMode="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
          </Campo>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />} Enviar link
          </Button>
        </form>
        </>
      )}
    </AuthLayout>
  )
}
