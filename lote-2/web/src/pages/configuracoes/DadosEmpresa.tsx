import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { ImageUp, Loader2, Store } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Campo } from '@/components/Campo'
import { PageHeader } from '@/components/PageHeader'
import { SomenteDono } from '@/components/Guards'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { cpfCnpjValido, mascaraCep, mascaraCpfCnpj, mascaraTelefone, soDigitos, UFS } from '@/lib/format'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { MENSAGEM_COBRANCA_PADRAO } from '@/lib/mensagens'


const opcional = z.string().trim()
const schema = z.object({
  nome_fantasia: z.string().trim().min(2, 'Informe o nome da empresa.'),
  razao_social: opcional,
  cpf_cnpj: opcional.refine((v) => !v || [11, 14].includes(soDigitos(v).length), 'CPF tem 11 números e CNPJ tem 14.')
    .refine((v) => !v || ![11, 14].includes(soDigitos(v).length) || cpfCnpjValido(v), 'Este CPF/CNPJ não é válido. Confira os números.'),
  telefone: opcional.refine((v) => !v || [10, 11].includes(soDigitos(v).length), 'Confira o número com DDD.'),
  email: opcional.refine((v) => !v || z.string().email().safeParse(v).success, 'Este e-mail não parece válido.'),
  cep: opcional,
  logradouro: opcional,
  numero: opcional,
  complemento: opcional,
  bairro: opcional,
  cidade: opcional,
  uf: z.string(),
  mensagem_cobranca_padrao: opcional,
  inscricao_estadual: opcional,
  regime_tributario: z.string(),
})
type Form = z.infer<typeof schema>

const vazioParaNull = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]))

function Logo() {
  const { empresa, recarregar } = useEmpresa()
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)

  const { data: url, refetch } = useQuery({
    queryKey: ['logo', empresa?.logo_path, empresa?.id],
    enabled: !!empresa?.logo_path,
    queryFn: async () => {
      const { data } = await supabase.storage.from('anexos').createSignedUrl(empresa!.logo_path!, 3600)
      return data?.signedUrl ?? null
    },
  })

  async function enviar(arquivo: File) {
    if (!empresa) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type)) return toast.error('Envie uma imagem PNG, JPG ou WEBP.')
    if (arquivo.size > 2 * 1024 * 1024) return toast.error('A imagem precisa ter até 2 MB.')
    setEnviando(true)
    const caminho = `${empresa.id}/logo/logo`
    const { error } = await supabase.storage.from('anexos').upload(caminho, arquivo, { upsert: true, contentType: arquivo.type })
    if (!error) await supabase.from('empresas').update({ logo_path: caminho }).eq('id', empresa.id)
    setEnviando(false)
    if (error) return toast.error(mensagemErro(error))
    await recarregar()
    await refetch()
    toast.success('Logo atualizada!')
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
        {url ? <img src={url} alt="Logo" className="size-full object-contain" /> : <Store className="size-8 text-muted-foreground" />}
      </div>
      <div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = '' }} />
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <ImageUp />} {url ? 'Trocar logo' : 'Enviar logo'}
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">PNG ou JPG, até 2 MB. Aparece nos comprovantes.</p>
      </div>
    </div>
  )
}

function Formulario() {
  const { empresa, recarregar } = useEmpresa()
  const e = empresa!
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting, isDirty }, reset } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome_fantasia: e.nome_fantasia,
      razao_social: e.razao_social ?? '',
      cpf_cnpj: e.cpf_cnpj ?? '',
      telefone: e.telefone ?? '',
      email: e.email ?? '',
      cep: e.cep ?? '',
      logradouro: e.logradouro ?? '',
      numero: e.numero ?? '',
      complemento: e.complemento ?? '',
      bairro: e.bairro ?? '',
      cidade: e.cidade ?? '',
      uf: e.uf ?? '',
      mensagem_cobranca_padrao: e.mensagem_cobranca_padrao ?? '',
      inscricao_estadual: e.inscricao_estadual ?? '',
      regime_tributario: e.regime_tributario ?? '',
    },
  })

  async function onSubmit(d: Form) {
    const { error } = await supabase.from('empresas').update(vazioParaNull(d)).eq('id', e.id)
    if (error) return toast.error(mensagemErro(error))
    await recarregar()
    reset(d)
    toast.success('Dados da empresa salvos!')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Logo />
          <Campo rotulo="Nome da empresa" htmlFor="nome_fantasia" erro={errors.nome_fantasia?.message}>
            <Input id="nome_fantasia" aria-invalid={!!errors.nome_fantasia} {...register('nome_fantasia')} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Razão social" htmlFor="razao_social" opcional>
              <Input id="razao_social" {...register('razao_social')} />
            </Campo>
            <Campo rotulo="CPF ou CNPJ" htmlFor="cpf_cnpj" opcional erro={errors.cpf_cnpj?.message}>
              <Input id="cpf_cnpj" inputMode="numeric" aria-invalid={!!errors.cpf_cnpj}
                {...register('cpf_cnpj', { onChange: (ev) => setValue('cpf_cnpj', mascaraCpfCnpj(ev.target.value)) })} />
            </Campo>
            <Campo rotulo="WhatsApp" htmlFor="telefone" opcional erro={errors.telefone?.message}>
              <Input id="telefone" type="tel" inputMode="tel" aria-invalid={!!errors.telefone}
                {...register('telefone', { onChange: (ev) => setValue('telefone', mascaraTelefone(ev.target.value)) })} />
            </Campo>
            <Campo rotulo="E-mail" htmlFor="email" opcional erro={errors.email?.message}>
              <Input id="email" type="email" inputMode="email" aria-invalid={!!errors.email} {...register('email')} />
            </Campo>
            <Campo rotulo="Inscrição estadual" htmlFor="inscricao_estadual" opcional>
              <Input id="inscricao_estadual" inputMode="numeric" {...register('inscricao_estadual')} />
            </Campo>
            <Campo rotulo="Regime tributário" htmlFor="regime_tributario" opcional dica="Aparece no fechamento do mês. Na dúvida, pergunte ao contador.">
              <NativeSelect id="regime_tributario" {...register('regime_tributario')}>
                <option value="">Não sei / não informado</option>
                <option value="mei">MEI</option>
                <option value="simples">Simples Nacional</option>
                <option value="presumido">Lucro Presumido</option>
                <option value="real">Lucro Real</option>
              </NativeSelect>
            </Campo>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Endereço</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="CEP" htmlFor="cep" opcional className="sm:col-span-2">
            <Input id="cep" inputMode="numeric" {...register('cep', { onChange: (ev) => setValue('cep', mascaraCep(ev.target.value)) })} />
          </Campo>
          <Campo rotulo="Rua" htmlFor="logradouro" opcional className="sm:col-span-4">
            <Input id="logradouro" {...register('logradouro')} />
          </Campo>
          <Campo rotulo="Número" htmlFor="numero" opcional className="sm:col-span-2">
            <Input id="numero" {...register('numero')} />
          </Campo>
          <Campo rotulo="Complemento" htmlFor="complemento" opcional className="sm:col-span-4">
            <Input id="complemento" {...register('complemento')} />
          </Campo>
          <Campo rotulo="Bairro" htmlFor="bairro" opcional className="sm:col-span-2">
            <Input id="bairro" {...register('bairro')} />
          </Campo>
          <Campo rotulo="Cidade" htmlFor="cidade" opcional className="sm:col-span-3">
            <Input id="cidade" {...register('cidade')} />
          </Campo>
          <Campo rotulo="UF" htmlFor="uf" opcional className="sm:col-span-1">
            <NativeSelect id="uf" {...register('uf')}>
              <option value="">—</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </NativeSelect>
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensagem de cobrança</CardTitle>
          <CardDescription>
            Usada no botão "Cobrar pelo WhatsApp". Você pode usar {'{cliente}'}, {'{valor}'}, {'{vencimento}'} e {'{empresa}'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea id="mensagem_cobranca_padrao" rows={4} placeholder={MENSAGEM_COBRANCA_PADRAO} {...register('mensagem_cobranca_padrao')} />
          <p className="mt-1 text-xs text-muted-foreground">Deixe em branco para usar a mensagem padrão.</p>
        </CardContent>
      </Card>

      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
        <Button type="submit" size="lg" disabled={isSubmitting || !isDirty} className="w-full shadow-lg sm:w-auto">
          {isSubmitting && <Loader2 className="animate-spin" />} Salvar alterações
        </Button>
      </div>
    </form>
  )
}

export default function DadosEmpresa() {
  const { empresa } = useEmpresa()
  return (
    <>
      <PageHeader titulo="Dados da empresa" voltarPara="/configuracoes" />
      <SomenteDono>
        {/* key: remonta o formulário ao trocar de empresa */}
        <Formulario key={empresa?.id} />
      </SomenteDono>
    </>
  )
}
