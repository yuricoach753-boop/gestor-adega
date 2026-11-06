import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { Caixinha } from '@/components/Caixinha'
import { BuscaProduto } from '@/components/BuscaProduto'
import { PageHeader } from '@/components/PageHeader'
import { SomenteDono } from '@/components/Guards'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { erroQuantidade, formatarData, formatarMoeda, hojeISO, lerNumeroBR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOME_FORMA, type FormaPagamento, type Produto } from '@/types'
import { PessoaRapida } from '@/pages/pessoas/PessoaRapida'

interface Linha {
  produto: Produto
  quantidade: string
  custo: number | null
}

type Pagamento = 'a_prazo' | 'pago' | 'nao_lancar'

const OPCOES_PAGAMENTO: Array<{ valor: Pagamento; titulo: string; texto: string }> = [
  { valor: 'a_prazo', titulo: 'Vou pagar depois', texto: 'Cria as contas a pagar (boleto, parcelado).' },
  { valor: 'pago', titulo: 'Já paguei', texto: 'Lança a saída no caixa hoje.' },
  { valor: 'nao_lancar', titulo: 'Não lançar no financeiro', texto: 'Só atualiza o estoque.' },
]
const FORMAS_PAGO: FormaPagamento[] = ['dinheiro', 'pix', 'transferencia', 'cartao_debito', 'cartao_credito', 'boleto']

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function Formulario() {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const hoje = hojeISO()

  const [fornecedorId, setFornecedorId] = useState(params.get('fornecedor') ?? '')
  const [nota, setNota] = useState('')
  const [data, setData] = useState(hoje)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [pagamento, setPagamento] = useState<Pagamento>('a_prazo')
  const [forma, setForma] = useState<FormaPagamento>('boleto')
  const [formaPago, setFormaPago] = useState<FormaPagamento>('pix')
  const [vencimento, setVencimento] = useState(somarDias(hoje, 30))
  const [parcelas, setParcelas] = useState('1')
  const [intervalo, setIntervalo] = useState('30')
  const [atualizarCusto, setAtualizarCusto] = useState(true)
  const [obs, setObs] = useState('')
  const [novoForn, setNovoForn] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const preenchido = useRef(false)

  const fornecedores = useQuery({
    queryKey: ['fornecedores', 'opcoes', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('id, nome').eq('empresa_id', empresa!.id).eq('ativo', true).order('nome')
      if (error) throw error
      return data
    },
  })

  // ?produto=ID vem da página do produto
  const produtoInicial = params.get('produto')
  useEffect(() => {
    if (!produtoInicial || preenchido.current) return
    preenchido.current = true
    supabase.from('v_produtos').select('*').eq('id', produtoInicial).maybeSingle().then(({ data }) => {
      if (data) adicionar(data as Produto)
    })
  }, [produtoInicial])

  function adicionar(p: Produto) {
    setErro(null)
    setLinhas((atual) => {
      const i = atual.findIndex((l) => l.produto.id === p.id)
      if (i >= 0) {
        const copia = [...atual]
        const q = (lerNumeroBR(copia[i].quantidade) ?? 0) + 1
        copia[i] = { ...copia[i], quantidade: String(q).replace('.', ',') }
        return copia
      }
      return [...atual, { produto: p, quantidade: '1', custo: p.preco_custo ?? null }]
    })
  }

  function alterar(i: number, campos: Partial<Linha>) {
    setErro(null)
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, ...campos } : l)))
  }

  const total = useMemo(
    () => linhas.reduce((s, l) => s + Math.round((lerNumeroBR(l.quantidade) ?? 0) * (l.custo ?? 0) * 100) / 100, 0),
    [linhas],
  )

  const nParcelas = Math.min(Math.max(parseInt(parcelas) || 1, 1), 48)
  const nIntervalo = Math.max(parseInt(intervalo) || 30, 1)
  const previa = useMemo(() => {
    if (pagamento !== 'a_prazo' || !vencimento || total <= 0) return []
    const base = Math.floor((total / nParcelas) * 100) / 100
    return Array.from({ length: nParcelas }, (_, i) => ({
      vencimento: somarDias(vencimento, i * nIntervalo),
      valor: i === nParcelas - 1 ? Math.round((total - base * (nParcelas - 1)) * 100) / 100 : base,
    }))
  }, [pagamento, vencimento, total, nParcelas, nIntervalo])

  async function salvar() {
    setErro(null)
    if (!linhas.length) return setErro('Adicione pelo menos um produto.')
    for (const l of linhas) {
      const eq = erroQuantidade(lerNumeroBR(l.quantidade), l.produto.unidade, l.produto.nome, 99999)
      if (eq) return setErro(eq)
      if (l.custo === null) return setErro(`Informe o custo de "${l.produto.nome}".`)
    }
    if (data > hoje) return setErro('A data da compra não pode ser no futuro.')
    if (pagamento === 'a_prazo' && !vencimento) return setErro('Informe o vencimento da primeira parcela.')

    setSalvando(true)
    const { data: id, error } = await supabase.rpc('registrar_compra', {
      p_empresa: empresa!.id,
      p_itens: linhas.map((l) => ({ produto_id: l.produto.id, quantidade: lerNumeroBR(l.quantidade), custo_unitario: l.custo })),
      p_fornecedor: fornecedorId || null,
      p_numero_nota: nota || null,
      p_data: data,
      p_observacoes: obs || null,
      p_atualizar_custo: atualizarCusto,
      p_pagamento: pagamento,
      p_forma: pagamento === 'pago' ? formaPago : pagamento === 'a_prazo' ? forma : null,
      p_primeiro_vencimento: pagamento === 'a_prazo' ? vencimento : null,
      p_parcelas: nParcelas,
      p_intervalo_dias: nIntervalo,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Compra registrada! O estoque foi atualizado.')
    for (const k of ['compras', 'produtos', 'produto', 'movimentacoes', 'produtos-baixo', 'fornecedores', 'caixa', 'contas-pagar', 'painel']) qc.invalidateQueries({ queryKey: [k] })
    navigate(`/compras/${id}`, { replace: true })
  }

  return (
    <div className="space-y-5" onChange={() => erro && setErro(null)}>
      <Card>
        <CardHeader><CardTitle>Fornecedor e nota</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Campo rotulo="Fornecedor" htmlFor="fornecedor" opcional>
            <div className="flex gap-2">
              <div className="flex-1">
                <NativeSelect id="fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                  <option value="">Sem fornecedor</option>
                  {fornecedores.data?.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </NativeSelect>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => setNovoForn(true)} aria-label="Novo fornecedor"><Plus /></Button>
            </div>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Nº da nota" htmlFor="nota" opcional>
              <Input id="nota" inputMode="numeric" value={nota} onChange={(e) => setNota(e.target.value)} />
            </Campo>
            <Campo rotulo="Data da compra" htmlFor="data">
              <Input id="data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} />
            </Campo>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
          <CardDescription>Busque pelo nome ou código, ou use o leitor de código de barras.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <BuscaProduto onEscolher={adicionar} mostrarCusto />
          {linhas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum produto adicionado ainda.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {linhas.map((l, i) => {
                const sub = (lerNumeroBR(l.quantidade) ?? 0) * (l.custo ?? 0)
                return (
                  <li key={l.produto.id} className="grid gap-2 p-3">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-sm font-medium">{l.produto.nome}</p>
                      <button type="button" onClick={() => setLinhas((a) => a.filter((_, j) => j !== i))}
                        className="-m-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Remover ${l.produto.nome}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-[5.5rem_1fr] gap-2 sm:grid-cols-[7rem_10rem_1fr]">
                      <div>
                        <label className="text-xs text-muted-foreground" htmlFor={`q-${i}`}>Qtd ({l.produto.unidade})</label>
                        <Input id={`q-${i}`} inputMode="decimal" value={l.quantidade} onChange={(e) => alterar(i, { quantidade: e.target.value })} className="text-right" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground" htmlFor={`c-${i}`}>Custo unitário</label>
                        <CampoDinheiro id={`c-${i}`} value={l.custo} onChange={(v) => alterar(i, { custo: v })} />
                      </div>
                      <p className="col-span-2 text-right text-sm sm:col-span-1 sm:self-end sm:pb-2.5">
                        Subtotal <strong className="tabular">{formatarMoeda(sub)}</strong>
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <span className="font-medium">Total da compra</span>
            <span className="text-xl font-semibold tabular">{formatarMoeda(total)}</span>
          </div>
          <Caixinha checked={atualizarCusto} onChange={setAtualizarCusto} rotulo="Atualizar o preço de custo dos produtos"
            descricao="O custo de cada produto passa a ser o desta compra. A margem é recalculada." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pagamento</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {OPCOES_PAGAMENTO.map((o) => (
              <button key={o.valor} type="button" onClick={() => { setErro(null); setPagamento(o.valor) }}
                className={cn('rounded-lg border p-3 text-left', pagamento === o.valor ? 'border-primary bg-accent/60' : 'hover:bg-muted')}>
                <span className="block text-sm font-medium">{o.titulo}</span>
                <span className="block text-xs text-muted-foreground">{o.texto}</span>
              </button>
            ))}
          </div>

          {pagamento === 'pago' && (
            <Campo rotulo="Como pagou" htmlFor="forma-pago">
              <NativeSelect id="forma-pago" value={formaPago} onChange={(e) => setFormaPago(e.target.value as FormaPagamento)}>
                {FORMAS_PAGO.map((f) => <option key={f} value={f}>{NOME_FORMA[f]}</option>)}
              </NativeSelect>
            </Campo>
          )}

          {pagamento === 'a_prazo' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Campo rotulo="1º vencimento" htmlFor="venc" className="col-span-2 sm:col-span-1">
                  <Input id="venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                </Campo>
                <Campo rotulo="Parcelas" htmlFor="parc">
                  <Input id="parc" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </Campo>
                <Campo rotulo="A cada (dias)" htmlFor="int">
                  <Input id="int" inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                </Campo>
                <Campo rotulo="Forma" htmlFor="forma" className="col-span-2 sm:col-span-1">
                  <NativeSelect id="forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                    {FORMAS_PAGO.map((f) => <option key={f} value={f}>{NOME_FORMA[f]}</option>)}
                  </NativeSelect>
                </Campo>
              </div>
              {previa.length > 0 && (
                <ul className="divide-y rounded-lg border text-sm">
                  {previa.map((p, i) => (
                    <li key={i} className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">{nParcelas > 1 ? `${i + 1}ª parcela · ` : ''}vence {formatarData(p.vencimento)}</span>
                      <span className="font-medium tabular">{formatarMoeda(p.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <Campo rotulo="Observações" htmlFor="obs" opcional>
            <Textarea id="obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </Campo>
        </CardContent>
      </Card>

      {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}

      <div className="sticky bottom-20 z-10 flex gap-2 lg:bottom-4 lg:justify-end">
        <Button type="button" variant="outline" size="lg" className="bg-card shadow-lg" onClick={() => navigate(-1)}>Cancelar</Button>
        <Button size="lg" className="min-w-0 flex-1 shadow-lg lg:flex-none" onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="animate-spin" />} <span className="truncate"><span className="hidden sm:inline">Registrar compra · </span><span className="sm:hidden">Registrar · </span>{formatarMoeda(total)}</span>
        </Button>
      </div>

      {empresa && novoForn && <PessoaRapida tipo="fornecedor" aberto={novoForn} onAberto={setNovoForn} empresaId={empresa.id} onCriado={(f) => setFornecedorId(f.id)} />}
    </div>
  )
}

export default function NovaCompra() {
  const { empresa } = useEmpresa()
  return (
    <>
      <PageHeader titulo="Registrar compra" descricao="Entrada de mercadoria do fornecedor." voltarPara="/compras" />
      <SomenteDono><Formulario key={empresa?.id} /></SomenteDono>
    </>
  )
}
