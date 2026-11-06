import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { mascaraTelefone, soDigitos, UFS } from '@/lib/format'
import { useAuth } from '@/contexts/AuthProvider'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { AuthLayout } from './auth/AuthLayout'

const schema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da empresa.'),
  telefone: z.string().refine((v) => !v || [10, 11].includes(soDigitos(v).length), 'Confira o número com DDD.'),
  cidade: z.string().trim(),
  uf: z.string(),
})
type Form = z.infer<typeof schema>

export default function CriarEmpresa() {
  const { user, sair } = useAuth()
  const { vinculos, trocarEmpresa, recarregar } = useEmpresa()
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const meta = user?.user_metadata ?? {}
  const primeira = vinculos.length === 0

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: (meta.empresa_nome as string) ?? '',
      telefone: primeira ? ((meta.telefone as string) ?? '') : '',
      cidade: '',
      uf: 'GO',
    },
  })

  async function onSubmit(d: Form) {
    setErro(null)
    const { data, error } = await supabase.rpc('criar_empresa', {
      p_nome_fantasia: d.nome,
      p_telefone: d.telefone || null,
      p_cidade: d.cidade || null,
      p_uf: d.uf || null,
    })
    if (error) return setErro(mensagemErro(error))
    trocarEmpresa(data as string)
    await recarregar()
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout
      titulo={primeira ? 'Falta só a sua empresa' : 'Cadastrar outra empresa'}
      subtitulo={primeira ? 'Com isso o sistema fica pronto para usar.' : 'Cada empresa tem seus próprios produtos, clientes e financeiro.'}
      rodape={
        primeira ? (
          <button onClick={() => sair()} className="text-primary hover:underline">Sair e entrar com outra conta</button>
        ) : (
          <button onClick={() => navigate(-1)} className="text-primary hover:underline">Voltar</button>
        )
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
        <Campo rotulo="Nome da empresa" htmlFor="nome" erro={errors.nome?.message}>
          <Input id="nome" autoComplete="organization" aria-invalid={!!errors.nome} {...register('nome')} />
        </Campo>
        <Campo rotulo="WhatsApp da empresa" htmlFor="telefone" opcional erro={errors.telefone?.message}>
          <Input
            id="telefone" type="tel" inputMode="tel" placeholder="(62) 99999-9999" aria-invalid={!!errors.telefone}
            {...register('telefone', { onChange: (e) => setValue('telefone', mascaraTelefone(e.target.value)) })}
          />
        </Campo>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Campo rotulo="Cidade" htmlFor="cidade" opcional>
            <Input id="cidade" autoComplete="address-level2" {...register('cidade')} />
          </Campo>
          <Campo rotulo="UF" htmlFor="uf">
            <NativeSelect id="uf" {...register('uf')}>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </NativeSelect>
          </Campo>
        </div>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Criar empresa
        </Button>
      </form>
    </AuthLayout>
  )
}
