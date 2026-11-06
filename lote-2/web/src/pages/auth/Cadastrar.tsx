import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import { mascaraTelefone, soDigitos } from '@/lib/format'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { fluxoCadastro, paraEmailLogin } from '@/lib/login'
import { AuthLayout } from './AuthLayout'

// Dono: e-mail obrigatório (recupera a senha por e-mail).
// Funcionário (convite): entra pelo WhatsApp; e-mail é opcional.
const criarSchema = (dono: boolean) => z.object({
  nome: z.string().trim().min(2, 'Informe seu nome.'),
  empresa: dono ? z.string().trim().min(2, 'Informe o nome da sua empresa.') : z.string(),
  telefone: dono
    ? z.string().refine((v) => !v || [10, 11].includes(soDigitos(v).length), 'Confira o número com DDD.')
    : z.string().refine((v) => [10, 11].includes(soDigitos(v).length), 'Informe seu WhatsApp com DDD. É com ele que você vai entrar.'),
  email: dono
    ? z.string().trim().min(1, 'Informe seu e-mail.').email('Este e-mail não parece válido.')
    : z.string().trim().refine((v) => !v || z.string().email().safeParse(v).success, 'Este e-mail não parece válido.'),
  senha: z.string().min(6, 'A senha precisa ter pelo menos 6 caracteres.'),
})
type Form = z.infer<ReturnType<typeof criarSchema>>

export default function Cadastrar() {
  const [params] = useSearchParams()
  const convite = params.get('convite')
  const navigate = useNavigate()
  const { trocarEmpresa, recarregar } = useEmpresa()
  const [erro, setErro] = useState<string | null>(null)
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null)
  useEffect(() => () => { fluxoCadastro.ativo = false }, [])

  const schema = useMemo(() => criarSchema(!convite), [convite])
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { nome: '', empresa: '', telefone: '', email: '', senha: '' },
  })

  async function onSubmit(d: Form) {
    setErro(null)
    const destino = convite ? `/convite/${convite}` : '/criar-empresa'
    const login = d.email.trim() ? d.email.trim() : paraEmailLogin(d.telefone)
    fluxoCadastro.ativo = true
    try {
      // Se deu certo, a tela já navegou: o aviso só é desligado quando ela sai da tela (efeito abaixo).
      // Desligar antes deixava a guarda de login redirecionar no meio do caminho.
      if (!(await cadastrar(d, login, destino))) fluxoCadastro.ativo = false
    } catch (e) {
      fluxoCadastro.ativo = false
      throw e
    }
  }

  async function cadastrar(d: Form, login: string, destino: string): Promise<boolean> {
    const { data, error } = await supabase.auth.signUp({
      email: login,
      password: d.senha,
      options: {
        data: { nome: d.nome, telefone: d.telefone || null, empresa_nome: convite ? null : d.empresa },
        emailRedirectTo: `${window.location.origin}${destino}`,
      },
    })
    if (error) {
      if (/already registered|already been registered/i.test(error.message))
        setErro(d.email.trim()
          ? 'Este e-mail já tem conta. Toque em "Entrar" aqui embaixo e use sua senha.'
          : 'Este WhatsApp já tem conta. Toque em "Entrar" aqui embaixo e use sua senha.')
      else setErro(mensagemErro(error))
      return false
    }

    // Confirmação de e-mail ligada no Supabase: precisa clicar no link antes de entrar
    if (!data.session) { setEmailEnviado(login); return false }

    if (convite) {
      // Já entra direto na empresa que convidou (sem passar pela tela de criar empresa)
      const { data: empresaId, error: erroConvite } = await supabase.rpc('aceitar_convite', { p_token: convite })
      if (erroConvite) { navigate(`/convite/${convite}`, { replace: true }); return true }
      trocarEmpresa(empresaId as string)
      await recarregar()
      navigate('/', { replace: true })
      return true
    }

    const { data: empresaId, error: erroEmpresa } = await supabase.rpc('criar_empresa', {
      p_nome_fantasia: d.empresa,
      p_telefone: d.telefone || null,
    })
    if (erroEmpresa) { navigate('/criar-empresa', { replace: true }); return true }
    trocarEmpresa(empresaId as string)
    await recarregar()
    navigate('/', { replace: true })
    return true
  }

  if (emailEnviado)
    return (
      <AuthLayout titulo="Confirme seu e-mail">
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-12 text-primary" />
          <p>Enviamos um link de confirmação para <strong>{emailEnviado}</strong>.</p>
          <p className="text-sm text-muted-foreground">Abra o e-mail e toque no link para ativar sua conta. Se não encontrar, olhe a pasta de spam.</p>
          <Button asChild variant="outline" className="mt-2 w-full"><Link to="/entrar">Voltar para o login</Link></Button>
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout
      titulo={convite ? 'Criar sua conta' : 'Cadastre sua empresa'}
      subtitulo={convite ? 'Depois de criar a conta, você entra na empresa que te convidou.' : 'Leva menos de um minuto. Teste grátis por 14 dias.'}
      rodape={<>Já tem conta? <Link to={convite ? `/entrar?voltar=/convite/${convite}` : '/entrar'} className="font-medium text-primary hover:underline">Entrar</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
        <Campo rotulo="Seu nome" htmlFor="nome" erro={errors.nome?.message}>
          <Input id="nome" autoComplete="name" aria-invalid={!!errors.nome} {...register('nome')} />
        </Campo>
        {!convite && (
          <Campo rotulo="Nome da empresa" htmlFor="empresa" erro={errors.empresa?.message} dica="Como seus clientes conhecem o negócio.">
            <Input id="empresa" autoComplete="organization" aria-invalid={!!errors.empresa} {...register('empresa')} />
          </Campo>
        )}
        <Campo rotulo="WhatsApp" htmlFor="telefone" opcional={!convite} erro={errors.telefone?.message}
          dica={convite ? 'É com ele e a senha que você vai entrar no sistema.' : undefined}>
          <Input
            id="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(62) 99999-9999"
            aria-invalid={!!errors.telefone}
            {...register('telefone', { onChange: (e) => setValue('telefone', mascaraTelefone(e.target.value)) })}
          />
        </Campo>
        {!convite && (
          <Campo rotulo="E-mail" htmlFor="email" erro={errors.email?.message}>
            <Input id="email" type="email" inputMode="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
          </Campo>
        )}
        <Campo rotulo="Senha" htmlFor="senha" erro={errors.senha?.message} dica="Pelo menos 6 caracteres.">
          <Input id="senha" type="password" autoComplete="new-password" aria-invalid={!!errors.senha} {...register('senha')} />
        </Campo>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} {convite ? 'Criar conta' : 'Começar teste grátis'}
        </Button>
      </form>
    </AuthLayout>
  )
}
