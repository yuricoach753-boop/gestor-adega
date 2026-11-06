import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { buscarCep } from '@/lib/cep'
import { cpfCnpjValido, mascaraCep, mascaraCpfCnpj, mascaraTelefone, soDigitos, UFS } from '@/lib/format'
import { nomeJaUsado } from '@/lib/duplicados'
import type { Fornecedor, Pessoa } from '@/types'

export type TipoPessoa = 'cliente' | 'fornecedor'
const TABELA: Record<TipoPessoa, 'clientes' | 'fornecedores'> = { cliente: 'clientes', fornecedor: 'fornecedores' }
export const ROTA: Record<TipoPessoa, string> = { cliente: '/clientes', fornecedor: '/fornecedores' }

const opcional = z.string().trim()
const schema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(120, 'Use no máximo 120 letras no nome.'),
  telefone: opcional.refine((v) => !v || [10, 11].includes(soDigitos(v).length), 'Confira o número com DDD.'),
  cpf_cnpj: opcional.refine((v) => !v || [11, 14].includes(soDigitos(v).length), 'CPF tem 11 números e CNPJ tem 14.')
    .refine((v) => !v || ![11, 14].includes(soDigitos(v).length) || cpfCnpjValido(v), 'Este CPF/CNPJ não é válido. Confira os números.'),
  contato_nome: opcional,
  cep: opcional,
  logradouro: opcional,
  numero: opcional,
  complemento: opcional,
  bairro: opcional,
  cidade: opcional,
  uf: z.string(),
  observacoes: opcional,
})
type Form = z.infer<typeof schema>

export function PessoaForm({ tipo, pessoa }: { tipo: TipoPessoa; pessoa?: Pessoa & Partial<Pick<Fornecedor, 'contato_nome'>> }) {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [erro, setErro] = useState<string | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const editando = !!pessoa

  const { register, handleSubmit, setValue, getValues, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: pessoa?.nome ?? '',
      telefone: pessoa?.telefone ?? '',
      cpf_cnpj: pessoa?.cpf_cnpj ?? '',
      contato_nome: pessoa?.contato_nome ?? '',
      cep: pessoa?.cep ?? '',
      logradouro: pessoa?.logradouro ?? '',
      numero: pessoa?.numero ?? '',
      complemento: pessoa?.complemento ?? '',
      bairro: pessoa?.bairro ?? '',
      cidade: pessoa?.cidade ?? empresa?.cidade ?? '',
      uf: pessoa?.uf ?? empresa?.uf ?? '',
      observacoes: pessoa?.observacoes ?? '',
    },
  })

  async function completarCep(cep: string) {
    if (soDigitos(cep).length !== 8) return
    setBuscandoCep(true)
    const end = await buscarCep(cep)
    setBuscandoCep(false)
    if (!end) return
    if (end.logradouro && !getValues('logradouro')) setValue('logradouro', end.logradouro)
    if (end.bairro && !getValues('bairro')) setValue('bairro', end.bairro)
    if (end.cidade) setValue('cidade', end.cidade)
    if (end.uf) setValue('uf', end.uf)
  }

  async function onSubmit(d: Form) {
    setErro(null)
    const { contato_nome, ...resto } = d
    const dados: Record<string, string | null> = Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, v === '' ? null : v]))
    if (tipo === 'fornecedor') dados.contato_nome = contato_nome || null

    const tabela = TABELA[tipo]
    const igual = await nomeJaUsado(tabela as 'clientes' | 'fornecedores', empresa!.id, d.nome, pessoa?.id)
    if (igual) return setErro(`Já existe ${tipo === 'cliente' ? 'um cliente' : 'um fornecedor'} chamado "${igual.nome}". Mude o nome (ex.: inclua o bairro ou o apelido).`)
    if (editando) {
      const { error } = await supabase.from(tabela).update(dados).eq('id', pessoa.id)
      if (error) return setErro(mensagemErro(error))
      toast.success('Cadastro atualizado!')
      await qc.invalidateQueries({ queryKey: [tabela] })
      navigate(`${ROTA[tipo]}/${pessoa.id}`, { replace: true })
    } else {
      const { data, error } = await supabase.from(tabela).insert({ ...dados, empresa_id: empresa!.id }).select('id').single()
      if (error) return setErro(mensagemErro(error))
      toast.success(tipo === 'cliente' ? 'Cliente cadastrado!' : 'Fornecedor cadastrado!')
      await qc.invalidateQueries({ queryKey: [tabela] })
      navigate(`${ROTA[tipo]}/${data.id}`, { replace: true })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}

      <Card>
        <CardContent className="grid gap-4">
          <Campo rotulo={tipo === 'cliente' ? 'Nome do cliente' : 'Nome do fornecedor'} htmlFor="nome" erro={errors.nome?.message}>
            <Input id="nome" maxLength={120} autoComplete="off" aria-invalid={!!errors.nome} {...register('nome')}
              placeholder={tipo === 'cliente' ? 'Ex.: Mercadinho do Zé' : 'Ex.: Atacadão Bebidas'} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="WhatsApp / telefone" htmlFor="telefone" opcional erro={errors.telefone?.message}>
              <Input id="telefone" type="tel" inputMode="tel" placeholder="(62) 99999-9999" aria-invalid={!!errors.telefone}
                {...register('telefone', { onChange: (e) => setValue('telefone', mascaraTelefone(e.target.value)) })} />
            </Campo>
            {tipo === 'fornecedor' && (
              <Campo rotulo="Nome do contato" htmlFor="contato_nome" opcional>
                <Input id="contato_nome" placeholder="Ex.: Carlos (vendedor)" {...register('contato_nome')} />
              </Campo>
            )}
            <Campo rotulo="CPF ou CNPJ" htmlFor="cpf_cnpj" opcional erro={errors.cpf_cnpj?.message}>
              <Input id="cpf_cnpj" inputMode="numeric" aria-invalid={!!errors.cpf_cnpj}
                {...register('cpf_cnpj', { onChange: (e) => setValue('cpf_cnpj', mascaraCpfCnpj(e.target.value)) })} />
            </Campo>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Endereço <span className="text-sm font-normal text-muted-foreground">(opcional)</span></CardTitle></CardHeader>
        <CardContent className="grid grid-cols-6 gap-3">
          <Campo rotulo="CEP" htmlFor="cep" className="col-span-3 sm:col-span-2" dica={buscandoCep ? 'Buscando endereço…' : 'Preenche a rua sozinho.'}>
            <Input id="cep" inputMode="numeric" {...register('cep', {
              onChange: (e) => { const v = mascaraCep(e.target.value); setValue('cep', v); completarCep(v) },
            })} />
          </Campo>
          <Campo rotulo="Número" htmlFor="numero" className="col-span-3 sm:col-span-1">
            <Input id="numero" {...register('numero')} />
          </Campo>
          <Campo rotulo="Rua" htmlFor="logradouro" className="col-span-6 sm:col-span-3">
            <Input id="logradouro" {...register('logradouro')} />
          </Campo>
          <Campo rotulo="Bairro" htmlFor="bairro" className="col-span-6 sm:col-span-2">
            <Input id="bairro" {...register('bairro')} />
          </Campo>
          <Campo rotulo="Complemento" htmlFor="complemento" className="col-span-6 sm:col-span-4">
            <Input id="complemento" placeholder="Ex.: Galpão 2, fundos" {...register('complemento')} />
          </Campo>
          <Campo rotulo="Cidade" htmlFor="cidade" className="col-span-4 sm:col-span-4">
            <Input id="cidade" {...register('cidade')} />
          </Campo>
          <Campo rotulo="UF" htmlFor="uf" className="col-span-2">
            <NativeSelect id="uf" {...register('uf')}>
              <option value="">—</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </NativeSelect>
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Campo rotulo="Observações" htmlFor="observacoes" opcional>
            <Textarea id="observacoes" rows={3} {...register('observacoes')}
              placeholder={tipo === 'cliente' ? 'Ex.: Entrega às terças. Prefere pagar no Pix.' : 'Ex.: Pedido mínimo R$ 500. Entrega em 2 dias.'} />
          </Campo>
        </CardContent>
      </Card>

      <div className="sticky bottom-20 z-10 flex gap-2 lg:bottom-4 lg:justify-end">
        <Button type="button" variant="outline" size="lg" className="bg-card shadow-lg" onClick={() => navigate(-1)}>Cancelar</Button>
        <Button type="submit" size="lg" disabled={isSubmitting} className="flex-1 shadow-lg lg:flex-none">
          {isSubmitting && <Loader2 className="animate-spin" />} {editando ? 'Salvar alterações' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  )
}
