import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Campo } from '@/components/Campo'
import { PageHeader } from '@/components/PageHeader'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { mascaraTelefone, soDigitos } from '@/lib/format'
import { useAuth } from '@/contexts/AuthProvider'
import { schemaSenha } from '@/lib/validacao'
import { ehLoginWhatsapp, mostrarLogin } from '@/lib/login'

const schemaDados = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome.'),
  telefone: z.string().refine((v) => !v || [10, 11].includes(soDigitos(v).length), 'Confira o número com DDD.'),
})

function Dados() {
  const { user, perfil } = useAuth()
  const qc = useQueryClient()
  const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting, isDirty } } = useForm({
    resolver: zodResolver(schemaDados),
    defaultValues: { nome: perfil?.nome ?? '', telefone: perfil?.telefone ?? '' },
  })

  async function onSubmit(d: z.infer<typeof schemaDados>) {
    const { error } = await supabase.from('perfis').update({ nome: d.nome, telefone: d.telefone || null }).eq('id', user!.id)
    if (error) return toast.error(mensagemErro(error))
    await qc.invalidateQueries({ queryKey: ['perfil'] })
    reset(d)
    toast.success('Dados salvos!')
  }

  return (
    <Card>
      <CardHeader><CardTitle>Seus dados</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <Campo rotulo={ehLoginWhatsapp(user?.email) ? 'Você entra com o WhatsApp' : 'E-mail'} htmlFor="email"
            dica={ehLoginWhatsapp(user?.email) ? 'Para trocar a senha, fale com o dono da empresa.' : 'O e-mail é usado para entrar e não pode ser alterado aqui.'}>
            <Input id="email" value={mostrarLogin(user?.email)} disabled />
          </Campo>
          <Campo rotulo="Nome" htmlFor="nome" erro={errors.nome?.message}>
            <Input id="nome" aria-invalid={!!errors.nome} {...register('nome')} />
          </Campo>
          <Campo rotulo="WhatsApp" htmlFor="telefone" opcional erro={errors.telefone?.message}>
            <Input id="telefone" type="tel" inputMode="tel" aria-invalid={!!errors.telefone}
              {...register('telefone', { onChange: (e) => setValue('telefone', mascaraTelefone(e.target.value)) })} />
          </Campo>
          <Button type="submit" disabled={isSubmitting || !isDirty} className="sm:justify-self-start">
            {isSubmitting && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Senha() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schemaSenha) })

  async function onSubmit({ senha }: z.infer<typeof schemaSenha>) {
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) return toast.error(mensagemErro(error))
    reset({ senha: '', confirmar: '' })
    toast.success('Senha alterada!')
  }

  return (
    <Card>
      <CardHeader><CardTitle>Trocar senha</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <Campo rotulo="Senha nova" htmlFor="senha" erro={errors.senha?.message}>
            <Input id="senha" type="password" autoComplete="new-password" aria-invalid={!!errors.senha} {...register('senha')} />
          </Campo>
          <Campo rotulo="Repita a senha" htmlFor="confirmar" erro={errors.confirmar?.message}>
            <Input id="confirmar" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmar} {...register('confirmar')} />
          </Campo>
          <Button type="submit" variant="outline" disabled={isSubmitting} className="sm:justify-self-start">
            {isSubmitting && <Loader2 className="animate-spin" />} Trocar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function MeuPerfil() {
  const { perfil } = useAuth()
  return (
    <>
      <PageHeader titulo="Meus dados" voltarPara="/configuracoes" />
      <div className="space-y-5">
        <Dados key={perfil?.id ?? 'carregando'} />
        <Senha />
      </div>
    </>
  )
}
