import { useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Paperclip, Plus, X } from 'lucide-react'
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
import { abrirAnexo, enviarAnexo } from '@/lib/anexos'
import { formatarData, formatarMoeda, hojeISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOME_FORMA, type ContaPagar, type FormaPagamento } from '@/types'
import { NovaCategoria } from '@/pages/produtos/NovaCategoria'
import { PessoaRapida } from '@/pages/pessoas/PessoaRapida'
import NaoEncontrada from '@/pages/NaoEncontrada'

type Repeticao = 'uma' | 'parcelada' | 'fixa'
const FORMAS: FormaPagamento[] = ['boleto', 'pix', 'dinheiro', 'transferencia', 'cartao_debito', 'cartao_credito']

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function Formulario({ conta, fixaInicial }: { conta?: ContaPagar; fixaInicial?: boolean }) {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const categorias = useCategorias(empresa?.id, 'despesa')
  const arquivoRef = useRef<HTMLInputElement>(null)
  const editando = !!conta

  const [descricao, setDescricao] = useState(conta?.descricao ?? '')
  const [valor, setValor] = useState<number | null>(conta ? Number(conta.valor) : null)
  const [vencimento, setVencimento] = useState(conta?.vencimento ?? hojeISO())
  const [fornecedorId, setFornecedorId] = useState(conta?.fornecedor_id ?? '')
  const [categoriaId, setCategoriaId] = useState(conta?.categoria_id ?? '')
  const [forma, setForma] = useState<FormaPagamento>(conta?.forma_pagamento ?? 'boleto')
  const [codigo, setCodigo] = useState(conta?.codigo_barras ?? '')
  const [anexoAtual, setAnexoAtual] = useState(conta?.anexo_path ?? null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [obs, setObs] = useState(conta?.observacoes ?? '')
  const [repeticao, setRepeticao] = useState<Repeticao>(fixaInicial ? 'fixa' : 'uma')
  const [parcelas, setParcelas] = useState('2')
  const [intervalo, setIntervalo] = useState('30')
  const [novoForn, setNovoForn] = useState(false)
  const [novaCat, setNovaCat] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const fornecedores = useQuery({
    queryKey: ['fornecedores', 'opcoes', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('id, nome').eq('empresa_id', empresa!.id).eq('ativo', true).order('nome')
      if (error) throw error
      return data
    },
  })

  const nParc = Math.min(Math.max(parseInt(parcelas) || 1, 1), 48)
  const nInt = Math.max(parseInt(intervalo) || 30, 1)
  const dia = Number(vencimento.slice(8, 10))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (descricao.trim().length < 2) return setErro('Informe a descrição.')
    if (!valor || valor <= 0) return setErro('Informe o valor.')
    if (!vencimento) return setErro('Informe o vencimento.')
    setSalvando(true)
    try {
      let anexo = anexoAtual
      if (arquivo) anexo = await enviarAnexo(empresa!.id, 'contas_pagar', arquivo)
      const codigoLimpo = (/^[\d\s.-]+$/.test(codigo) ? codigo.replace(/\D/g, '') : codigo.trim()) || null

      if (editando) {
        const { error } = await supabase.from('contas_pagar').update({
          descricao: descricao.trim(), valor, vencimento, fornecedor_id: fornecedorId || null, categoria_id: categoriaId || null,
          forma_pagamento: forma, codigo_barras: codigoLimpo, anexo_path: anexo, observacoes: obs.trim() || null,
        }).eq('id', conta.id)
        if (error) throw error
        toast.success('Conta atualizada!')
        qc.invalidateQueries({ queryKey: ['contas-pagar'] })
        navigate(`/financeiro/pagar/${conta.id}`, { replace: true })
        return
      }

      if (repeticao === 'fixa') {
        const { data: rec, error } = await supabase.from('recorrencias').insert({
          empresa_id: empresa!.id, descricao: descricao.trim(), valor, dia_vencimento: dia, forma_pagamento: forma,
          categoria_id: categoriaId || null, fornecedor_id: fornecedorId || null, inicio: vencimento,
        }).select('id').single()
        if (error) throw error
        const { error: e2 } = await supabase.rpc('gerar_recorrentes', { p_empresa: empresa!.id })
        if (e2) throw e2
        if (codigoLimpo || anexo || obs.trim()) {
          await supabase.from('contas_pagar').update({ codigo_barras: codigoLimpo, anexo_path: anexo, observacoes: obs.trim() || null })
            .eq('recorrencia_id', rec.id).eq('vencimento', vencimento)
        }
        toast.success('Conta fixa criada! Ela vai aparecer todo mês.')
      } else {
        const { error } = await supabase.rpc('lancar_contas_pagar', {
          p_empresa: empresa!.id, p_descricao: descricao, p_valor_total: valor, p_primeiro_vencimento: vencimento,
          p_fornecedor: fornecedorId || null, p_categoria: categoriaId || null, p_forma: forma,
          p_codigo_barras: codigoLimpo, p_anexo_path: anexo,
          p_parcelas: repeticao === 'parcelada' ? nParc : 1, p_intervalo_dias: nInt, p_observacoes: obs || null,
        })
        if (error) throw error
        toast.success(repeticao === 'parcelada' ? `${nParc} parcelas lançadas!` : 'Conta lançada!')
      }
      for (const k of ['contas-pagar', 'gerar-recorrentes', 'recorrencias', 'fornecedores', 'painel']) qc.invalidateQueries({ queryKey: [k] })
      navigate(repeticao === 'fixa' ? '/financeiro/pagar/fixas' : '/financeiro/pagar', { replace: true })
    } catch (err) {
      setErro(err instanceof Error && !('code' in err) ? err.message : mensagemErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4" noValidate>
      <Card>
        <CardContent className="grid gap-4">
          <Campo rotulo="Descrição" htmlFor="desc">
            <Input id="desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Conta de luz, boleto do fornecedor" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={repeticao === 'parcelada' ? 'Valor total' : 'Valor'} htmlFor="valor"><CampoDinheiro id="valor" value={valor} onChange={setValor} /></Campo>
            <Campo rotulo={repeticao === 'parcelada' ? '1º vencimento' : 'Vencimento'} htmlFor="venc">
              <Input id="venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Campo>
          </div>

          {!editando && (
            <div className="grid gap-2">
              <span className="text-sm font-medium">Repetição</span>
              <div className="grid grid-cols-3 gap-2">
                {([['uma', 'Uma vez'], ['parcelada', 'Parcelada'], ['fixa', 'Todo mês']] as const).map(([v, r]) => (
                  <button key={v} type="button" onClick={() => setRepeticao(v)}
                    className={cn('rounded-lg border py-2.5 text-sm font-medium', repeticao === v ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted')}>
                    {r}
                  </button>
                ))}
              </div>
              {repeticao === 'parcelada' && (
                <div className="grid grid-cols-2 gap-3">
                  <Campo rotulo="Parcelas" htmlFor="parc">
                    <Input id="parc" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  </Campo>
                  <Campo rotulo="A cada (dias)" htmlFor="int">
                    <Input id="int" inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                  </Campo>
                  {valor ? (
                    <p className="col-span-2 text-xs text-muted-foreground">
                      {nParc}x de cerca de {formatarMoeda(valor / nParc)} · última em {formatarData(somarDias(vencimento, (nParc - 1) * nInt))}
                    </p>
                  ) : null}
                </div>
              )}
              {repeticao === 'fixa' && (
                <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
                  Vence todo dia <strong>{dia || '—'}</strong> a partir de {formatarData(vencimento)}. A conta de cada mês aparece sozinha.
                  {dia > 28 && ' Em meses mais curtos, vence no último dia.'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Detalhes</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Campo rotulo="Fornecedor" htmlFor="forn" opcional>
            <div className="flex gap-2">
              <div className="flex-1">
                <NativeSelect id="forn" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                  <option value="">Sem fornecedor</option>
                  {fornecedores.data?.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </NativeSelect>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => setNovoForn(true)} aria-label="Novo fornecedor"><Plus /></Button>
            </div>
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Categoria" htmlFor="cat" opcional>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <NativeSelect id="cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                    <option value="">Sem categoria</option>
                    {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </NativeSelect>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setNovaCat(true)} aria-label="Nova categoria"><Plus /></Button>
              </div>
            </Campo>
            <Campo rotulo="Como vai pagar" htmlFor="forma">
              <NativeSelect id="forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                {FORMAS.map((f) => <option key={f} value={f}>{NOME_FORMA[f]}</option>)}
              </NativeSelect>
            </Campo>
          </div>
          <Campo rotulo="Código de barras / linha digitável" htmlFor="codigo" opcional dica={repeticao === 'parcelada' ? 'Fica na 1ª parcela. As outras você completa depois.' : 'Cole aqui para copiar na hora de pagar no app do banco.'}>
            <Input id="codigo" inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="00190.00009 01234.567890 ..." />
          </Campo>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Boleto ou comprovante <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <input ref={arquivoRef} type="file" accept="application/pdf,image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setArquivo(f); e.target.value = '' }} />
            {arquivo || anexoAtual ? (
              <div className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                <FileText className="size-4 text-muted-foreground" />
                {arquivo ? <span className="flex-1 truncate">{arquivo.name}</span> : (
                  <button type="button" className="flex-1 truncate text-left text-primary hover:underline"
                    onClick={() => abrirAnexo(anexoAtual!).catch((er) => toast.error(er.message))}>Ver anexo atual</button>
                )}
                <button type="button" onClick={() => { setArquivo(null); setAnexoAtual(null) }} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Tirar anexo"><X className="size-4" /></button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => arquivoRef.current?.click()} className="justify-self-start">
                <Paperclip /> Anexar PDF ou foto
              </Button>
            )}
          </div>
          <Campo rotulo="Observações" htmlFor="obs" opcional>
            <Textarea id="obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </Campo>
        </CardContent>
      </Card>

      {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}

      <div className="sticky bottom-20 z-10 flex gap-2 lg:bottom-4 lg:justify-end">
        <Button type="button" variant="outline" size="lg" className="bg-card shadow-lg" onClick={() => navigate(-1)}>Cancelar</Button>
        <Button type="submit" size="lg" className="flex-1 shadow-lg lg:flex-none" disabled={salvando}>
          {salvando && <Loader2 className="animate-spin" />} {editando ? 'Salvar alterações' : repeticao === 'fixa' ? 'Criar conta fixa' : 'Lançar'}
        </Button>
      </div>

      {empresa && novoForn && <PessoaRapida tipo="fornecedor" aberto={novoForn} onAberto={setNovoForn} empresaId={empresa.id} onCriado={(f) => setFornecedorId(f.id)} />}
      {empresa && <NovaCategoria aberto={novaCat} onAberto={setNovaCat} empresaId={empresa.id} tipo="despesa" onCriada={(c) => setCategoriaId(c.id)} />}
    </form>
  )
}

export default function ContaPagarForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { empresa } = useEmpresa()
  const conta = useQuery({
    queryKey: ['contas-pagar', 'editar', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_contas_pagar').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as ContaPagar | null
    },
  })

  return (
    <>
      <PageHeader titulo={id ? 'Editar conta' : 'Lançar conta a pagar'} voltarPara={id ? `/financeiro/pagar/${id}` : '/financeiro/pagar'} />
      <SomenteDono>
        {id && conta.isLoading ? <ListaCarregando linhas={3} /> : id && conta.error ? <ErroLista erro={conta.error} /> :
          id && !conta.data ? <NaoEncontrada /> :
          id && conta.data!.status !== 'aberta' ? <Alert><AlertDescription>Só dá para editar contas em aberto.</AlertDescription></Alert> :
          <Formulario key={`${empresa?.id}-${id ?? 'nova'}`} conta={conta.data ?? undefined} fixaInicial={params.get('fixa') === '1'} />}
      </SomenteDono>
    </>
  )
}
