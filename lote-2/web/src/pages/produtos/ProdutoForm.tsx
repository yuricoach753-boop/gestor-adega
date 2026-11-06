import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Calculator, Loader2, Plus, ScanBarcode } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { PageHeader } from '@/components/PageHeader'
import { SomenteDono } from '@/components/Guards'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { useCategorias } from '@/lib/consultas'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarMoeda, formatarNumero, lerNumeroBR, numeroParaCampo, semAcento, unidadeInteira } from '@/lib/format'
import { UNIDADES, type Produto, type Unidade } from '@/types'
import { buscarPorGtin, consultavel, type DadosGtin } from '@/lib/gtin'
import { NovaCategoria } from './NovaCategoria'

const qtd = (msg: string) => z.string().refine((v) => !v.trim() || (lerNumeroBR(v) ?? -1) >= 0, msg)

const schema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do produto.').max(120, 'Use no máximo 120 letras no nome.'),
  preco_venda: z.number({ error: 'Informe o preço de venda.' }).nullable().refine((v) => v !== null && v > 0, 'Informe o preço de venda.'),
  preco_custo: z.number().nullable(),
  unidade: z.enum(['un', 'cx', 'fardo', 'kg', 'l', 'pct']),
  categoria_id: z.string(),
  codigo: z.string().trim().max(30, 'Use no máximo 30 caracteres.'),
  codigo_barras: z.string().trim().max(50),
  estoque_inicial: qtd('Informe um número (ex.: 12 ou 3,5).'),
  estoque_minimo: qtd('Informe um número (ex.: 5).'),
  observacoes: z.string().trim(),
})
type Form = z.infer<typeof schema>

function Formulario({ produto }: { produto?: Produto }) {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const categorias = useCategorias(empresa?.id, 'produto')
  const [novaCat, setNovaCat] = useState(false)
  const [margemAlvo, setMargemAlvo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const editando = !!produto
  const [params] = useSearchParams()

  const { register, handleSubmit, control, setValue, getValues, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: produto?.nome ?? '',
      preco_venda: produto?.preco_venda ?? null,
      preco_custo: produto?.preco_custo ?? null,
      unidade: produto?.unidade ?? 'un',
      categoria_id: produto?.categoria_id ?? '',
      codigo: produto?.codigo ?? '',
      codigo_barras: produto?.codigo_barras ?? params.get('barras') ?? '',
      estoque_inicial: '',
      estoque_minimo: produto ? numeroParaCampo(produto.estoque_minimo) : '',
      observacoes: produto?.observacoes ?? '',
    },
  })

  const [venda, custo] = useWatch({ control, name: ['preco_venda', 'preco_custo'] })
  const lucro = venda && custo !== null ? venda - custo : null
  const margem = venda && custo !== null && venda > 0 ? ((venda - custo) / venda) * 100 : null

  function aplicarMargem() {
    const m = lerNumeroBR(margemAlvo)
    if (custo === null || !custo) return toast.error('Informe primeiro o preço de custo.')
    if (m === null || m <= 0 || m >= 100) return toast.error('A margem precisa ser entre 1 e 99%.')
    setValue('preco_venda', Math.round((custo / (1 - m / 100)) * 100) / 100, { shouldDirty: true, shouldValidate: true })
  }

  const registroBarras = register('codigo_barras')
  const [repetido, setRepetido] = useState<{ id: string; nome: string } | null>(null)

  const [daBase, setDaBase] = useState<DadosGtin | null>(null)
  const [buscandoBase, setBuscandoBase] = useState(false)
  const ultimoConsultado = useRef<string | null>(null)

  /** Produto novo: procura o nome pelo código de barras na base de produtos e preenche se o nome estiver vazio. */
  async function buscarNaBase(valor: string) {
    const c = valor.replace(/\D/g, '')
    if (editando || !consultavel(c) || ultimoConsultado.current === c) return
    ultimoConsultado.current = c
    setBuscandoBase(true)
    const d = await buscarPorGtin(c)
    setBuscandoBase(false)
    setDaBase(d)
    if (d && !getValues('nome').trim()) setValue('nome', d.nome, { shouldDirty: true, shouldValidate: true })
  }

  /** Avisa se o código de barras já pertence a outro produto. */
  async function conferirBarras(valor: string) {
    const c = valor.trim()
    if (!c || !empresa) { setRepetido(null); return null }
    const { data } = await supabase.from('v_produtos').select('id, nome')
      .eq('empresa_id', empresa.id).eq('codigo_barras', c).neq('id', produto?.id ?? '00000000-0000-0000-0000-000000000000').limit(1)
    const r = data?.[0] ?? null
    setRepetido(r)
    return r
  }

  async function onSubmit(d: Form) {
    setErro(null)
    if (await conferirBarras(d.codigo_barras)) {
      setErro('Este código de barras já está em outro produto. Confira antes de salvar.')
      document.getElementById('codigo_barras')?.focus()
      return
    }
    // Nome repetido confunde na hora de vender
    const { data: mesmos } = await supabase.from('v_produtos').select('id, nome').eq('empresa_id', empresa!.id)
      .eq('ativo', true).eq('nome_busca', semAcento(d.nome.trim())).neq('id', produto?.id ?? '00000000-0000-0000-0000-000000000000').limit(1)
    if (mesmos?.length) {
      setErro(`Já existe um produto chamado "${mesmos[0].nome}". Mude o nome (ex.: inclua a marca ou o tamanho).`)
      document.getElementById('nome')?.focus()
      return
    }
    const estoqueIni = lerNumeroBR(d.estoque_inicial) ?? 0
    if (!editando && unidadeInteira(d.unidade) && !Number.isInteger(estoqueIni)) {
      setErro('Este produto é vendido inteiro: o estoque inicial precisa ser número inteiro (sem vírgula).')
      return
    }
    const dados = {
      nome: d.nome,
      preco_venda: d.preco_venda,
      preco_custo: d.preco_custo ?? 0,
      unidade: d.unidade as Unidade,
      categoria_id: d.categoria_id || null,
      codigo: d.codigo || null,
      codigo_barras: d.codigo_barras || null,
      estoque_minimo: lerNumeroBR(d.estoque_minimo) ?? 0,
      observacoes: d.observacoes || null,
    }
    if (editando) {
      const { error } = await supabase.from('produtos').update(dados).eq('id', produto.id)
      if (error) return setErro(mensagemErro(error))
      toast.success('Produto atualizado!')
      await qc.invalidateQueries({ queryKey: ['produtos'] })
      await qc.invalidateQueries({ queryKey: ['produto', produto.id] })
      navigate(`/produtos/${produto.id}`, { replace: true })
    } else {
      const { data, error } = await supabase.from('produtos')
        .insert({ ...dados, empresa_id: empresa!.id, estoque_atual: lerNumeroBR(d.estoque_inicial) ?? 0, ...(daBase?.ncm && daBase.gtin === (d.codigo_barras || '').replace(/\D/g, '') ? { ncm: daBase.ncm.replace(/\D/g, '') } : {}) })
        .select('id').single()
      if (error) return setErro(mensagemErro(error))
      toast.success('Produto cadastrado!')
      await qc.invalidateQueries({ queryKey: ['produtos'] })
      navigate(`/produtos/${data.id}`, { replace: true })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}

      <Card>
        <CardContent className="grid gap-4">
          <Campo rotulo="Código de barras" htmlFor="codigo_barras" opcional
            dica={repetido ? undefined : 'Clique aqui e passe o leitor no produto.'}>
            <div className="relative">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input id="codigo_barras" inputMode="numeric" autoComplete="off" autoFocus={!editando} className="pl-10"
                placeholder="Passe o leitor ou digite"
                {...registroBarras}
                onBlur={(e) => { registroBarras.onBlur(e); void conferirBarras(e.target.value).then((r) => { if (!r) void buscarNaBase(e.target.value) }) }}
                onKeyDown={(e) => {
                  // o leitor aperta Enter depois do código: não salva o formulário, só vai para o nome
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = e.currentTarget.value
                    void conferirBarras(v).then((r) => { if (!r) void buscarNaBase(v) })
                    document.getElementById('nome')?.focus()
                  }
                }} />
            </div>
            {buscandoBase && <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Procurando o produto pelo código…</p>}
            {!buscandoBase && daBase && !repetido && (
              <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-accent/50 p-2 text-sm">
                {daBase.imagem && <img src={daBase.imagem} alt="" className="size-10 shrink-0 rounded object-contain" />}
                <p className="min-w-0 flex-1">
                  Achamos na base de códigos: <strong>{daBase.nome}</strong>{daBase.ncm ? ` · NCM ${daBase.ncm}` : ''}.{' '}
                  <button type="button" className="font-medium text-primary underline" onClick={() => setValue('nome', daBase.nome, { shouldDirty: true, shouldValidate: true })}>Usar este nome</button>
                </p>
              </div>
            )}
            {repetido && (
              <p className="mt-1.5 text-sm text-destructive">
                Este código já está no produto <Link to={`/produtos/${repetido.id}`} className="font-medium underline">{repetido.nome}</Link>.
              </p>
            )}
          </Campo>
          <Campo rotulo="Nome do produto" htmlFor="nome" erro={errors.nome?.message}>
            <Input id="nome" maxLength={120} placeholder="Ex.: Cerveja lata 350ml (cx 12)" aria-invalid={!!errors.nome} {...register('nome')} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Preço de venda" htmlFor="preco_venda" erro={errors.preco_venda?.message}>
              <Controller control={control} name="preco_venda" render={({ field }) => (
                <CampoDinheiro id="preco_venda" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} aria-invalid={!!errors.preco_venda} />
              )} />
            </Campo>
            <Campo rotulo="Vendido por" htmlFor="unidade">
              <NativeSelect id="unidade" {...register('unidade')}>
                {UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.rotulo}</option>)}
              </NativeSelect>
            </Campo>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Custo e lucro</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Campo rotulo="Preço de custo" htmlFor="preco_custo" opcional dica="Quanto você paga ao fornecedor. Só o dono vê. Ao registrar uma compra, ele é atualizado.">
            <Controller control={control} name="preco_custo" render={({ field }) => (
              <CampoDinheiro id="preco_custo" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
            )} />
          </Campo>

          {margem !== null && (
            <div className={`rounded-lg p-3 text-sm ${margem < 0 ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}>
              {margem < 0 ? (
                <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Preço de venda abaixo do custo: prejuízo de {formatarMoeda(-lucro!)} por unidade.</p>
              ) : (
                <p>Lucro de <strong>{formatarMoeda(lucro)}</strong> por unidade · margem de <strong>{formatarNumero(Math.round(margem * 10) / 10)}%</strong></p>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <Campo rotulo="Calcular preço pela margem" htmlFor="margem_alvo" className="flex-1">
              <div className="relative">
                <Input id="margem_alvo" inputMode="decimal" placeholder="Ex.: 30" value={margemAlvo} onChange={(e) => setMargemAlvo(e.target.value)} className="pr-8" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </Campo>
            <Button type="button" variant="outline" onClick={aplicarMargem}><Calculator /> Aplicar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Estoque</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {!editando && (
            <Campo rotulo="Quantidade em estoque" htmlFor="estoque_inicial" erro={errors.estoque_inicial?.message} dica="Quanto tem hoje. Cada venda desconta sozinha.">
              <Input id="estoque_inicial" inputMode="decimal" placeholder="0" aria-invalid={!!errors.estoque_inicial} {...register('estoque_inicial')} />
            </Campo>
          )}
          <Campo rotulo="Estoque mínimo" htmlFor="estoque_minimo" erro={errors.estoque_minimo?.message} dica="Avisa quando chegar nisso."
            className={editando ? 'col-span-2' : ''}>
            <Input id="estoque_minimo" inputMode="decimal" placeholder="0" aria-invalid={!!errors.estoque_minimo} {...register('estoque_minimo')} />
          </Campo>
          {editando && (
            <p className="col-span-2 text-xs text-muted-foreground">
              Para mudar a quantidade em estoque, use "Ajustar contagem" ou "Registrar compra" na página do produto. Assim fica tudo no histórico.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Organização</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Campo rotulo="Categoria" htmlFor="categoria_id" opcional>
            <div className="flex gap-2">
              <div className="flex-1">
                <NativeSelect id="categoria_id" {...register('categoria_id')}>
                  <option value="">Sem categoria</option>
                  {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </NativeSelect>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => setNovaCat(true)} aria-label="Nova categoria"><Plus /></Button>
            </div>
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Código interno" htmlFor="codigo" opcional erro={errors.codigo?.message}>
              <Input id="codigo" autoCapitalize="characters" placeholder="Ex.: B001" {...register('codigo')} />
            </Campo>
          </div>
          <Campo rotulo="Observações" htmlFor="observacoes" opcional>
            <Textarea id="observacoes" rows={2} {...register('observacoes')} />
          </Campo>
        </CardContent>
      </Card>

      <div className="sticky bottom-20 z-10 flex gap-2 lg:bottom-4 lg:justify-end">
        <Button type="button" variant="outline" size="lg" className="bg-card shadow-lg" onClick={() => navigate(-1)}>Cancelar</Button>
        <Button type="submit" size="lg" disabled={isSubmitting} className="flex-1 shadow-lg lg:flex-none">
          {isSubmitting && <Loader2 className="animate-spin" />} {editando ? 'Salvar alterações' : 'Cadastrar produto'}
        </Button>
      </div>

      {empresa && (
        <NovaCategoria aberto={novaCat} onAberto={setNovaCat} empresaId={empresa.id} tipo="produto"
          onCriada={(c) => setValue('categoria_id', c.id, { shouldDirty: true })} />
      )}
    </form>
  )
}

export default function ProdutoForm() {
  const { id } = useParams()
  const { empresa } = useEmpresa()
  const produto = useQuery({
    queryKey: ['produto', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_produtos').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Produto | null
    },
  })

  return (
    <>
      <PageHeader titulo={id ? 'Editar produto' : 'Novo produto'} voltarPara={id ? `/produtos/${id}` : '/produtos'} />
      <SomenteDono>
        {id && produto.isLoading ? <ListaCarregando linhas={3} /> : id && produto.error ? <ErroLista erro={produto.error} /> : (
          <Formulario key={`${empresa?.id}-${id ?? 'novo'}`} produto={produto.data ?? undefined} />
        )}
      </SomenteDono>
    </>
  )
}
