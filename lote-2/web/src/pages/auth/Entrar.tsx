import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { paraEmailLogin, pareceWhatsapp } from '@/lib/login'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().min(1, 'Informe seu e-mail ou WhatsApp.')
    .refine((v) => (v.includes('@') ? z.string().email().safeParse(v).success : pareceWhatsapp(v)),
      'Digite um e-mail ou o WhatsApp com DDD, ex.: (62) 99999-9999.'),
  senha: z.string().min(1, 'Informe sua senha.'),
})
type Form = z.infer<typeof schema>

/** Só aceita caminhos internos, para não virar redirecionamento aberto. */
function destinoSeguro(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/'
}

export default function Entrar() {
  const [params] = useSearchParams()
  const voltar = destinoSeguro(params.get('voltar'))
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit(dados: Form) {
    setErro(null)
    const { error } = await supabase.auth.signInWithPassword({ email: paraEmailLogin(dados.email), password: dados.senha })
    if (error) {
      if (/invalid login credentials/i.test(error.message))
        return setErro(dados.email.includes('@') ? 'E-mail ou senha incorretos.' : 'WhatsApp ou senha incorretos.')
      return setErro(mensagemErro(error))
    }
    navigate(voltar, { replace: true })
  }

  return (
    <AuthLayout
      titulo="Entrar"
      subtitulo="Acesse o sistema da sua empresa."
      rodape={<>Ainda não tem conta? <Link to={`/cadastrar${params.toString() ? `?${params}` : ''}`} className="font-medium text-primary hover:underline">Cadastre sua empresa</Link></>}
    >
      <form onSubmit={(e) => { setErro(null); return handleSubmit(onSubmit)(e) }} onChange={() => erro && setErro(null)} className="grid gap-4" noValidate>
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
        <Campo rotulo="E-mail ou WhatsApp" htmlFor="email" erro={errors.email?.message}>
          <Input id="email" type="text" autoComplete="username" autoCapitalize="none" placeholder="voce@email.com ou (62) 99999-9999"
            aria-invalid={!!errors.email} {...register('email')} />
        </Campo>
        <Campo rotulo="Senha" htmlFor="senha" erro={errors.senha?.message}>
          <Input id="senha" type="password" autoComplete="current-password" aria-invalid={!!errors.senha} {...register('senha')} />
        </Campo>
        <div className="-mt-1 text-right">
          <Link to="/esqueci-senha" className="text-sm text-primary hover:underline">Esqueci minha senha</Link>
        </div>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}
