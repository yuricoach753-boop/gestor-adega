import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2, Minus, Package, Plus, ScanBarcode, ShoppingCart, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { buscarProdutos, produtoPorCodigo } from '@/lib/consultas'
import { mensagemErro } from '@/lib/erros'
import { erroQuantidade, formatarMoeda, formatarQuantidade, lerNumeroBR, numeroParaCampo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Produto } from '@/types'
import { BarraCaixa, caixaDeOutroDia, useCaixa } from '@/components/CaixaTurno'

export interface ItemSeparado { produto: Produto; quantidade: string }

const centavos = (n: number) => Math.round(n * 100) / 100
const chave = (empresaId: string) => `consulta-preco:${empresaId}`

function lerSeparados(empresaId: string): ItemSeparado[] {
  try { return JSON.parse(sessionStorage.getItem(chave(empresaId)) ?? '[]') } catch { return [] }
}

function Qtd({ valor, onChange, grande }: { valor: string; onChange: (v: string) => void; grande?: boolean }) {
  const n = lerNumeroBR(valor) ?? 0
  const passo = (d: number) => onChange(numeroParaCampo(Math.max(0, centavos(n + d))))
  const tam = grande ? 'size-12' : 'size-9'
  return (
    <div className="flex items-center">
      <Button type="button" variant="outline" size="icon" className={cn(tam, 'rounded-r-none')} onClick={() => passo(-1)} aria-label="Menos" disabled={n <= 1}>
        <Minus />
      </Button>
      <Input inputMode="decimal" value={valor} onChange={(e) => onChange(e.target.value)} aria-label="Quantidade"
        className={cn(grande ? 'h-12 w-20 text-lg' : 'h-9 w-14', 'rounded-none border-x-0 text-center sm:h-auto', grande ? 'sm:h-12' : 'sm:h-9')} />
      <Button type="button" variant="outline" size="icon" className={cn(tam, 'rounded-l-none')} onClick={() => passo(1)} aria-label="Mais">
        <Plus />
      </Button>
    </div>
  )
}

/**
 * Consulta de preço para o balcão: passa o leitor, aparece o preço grande.
 * Se o cliente for levar, "Adicionar" separa o item; se não, "Descartar".
 * No fim, "Fechar venda" leva os itens separados para a tela de Nova venda.
 */
export default function ConsultaPreco() {
  const { empresa, ehDono } = useEmpresa()
  const caixa = useCaixa()
  const navigate = useNavigate()
  const campo = useRef<HTMLInputElement>(null)
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [atual, setAtual] = useState<Produto | null>(null)
  const [qtd, setQtd] = useState('1')
  const [opcoes, setOpcoes] = useState<Produto[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [separados, setSeparados] = useState<ItemSeparado[]>(() => (empresa ? lerSeparados(empresa.id) : []))

  useEffect(() => {
    if (!empresa) return
    try { sessionStorage.setItem(chave(empresa.id), JSON.stringify(separados)) } catch { /* sem armazenamento: segue só na memória */ }
  }, [separados, empresa])

  const focar = () => setTimeout(() => campo.current?.focus(), 0)

  // Busca pelo nome enquanto digita (o leitor manda só números + Enter, então não entra aqui)
  useEffect(() => {
    const t = codigo.trim()
    if (!empresa || t.length < 2 || !/\p{L}/u.test(t)) return
    let vivo = true
    const id = setTimeout(async () => {
      try {
        const lista = await buscarProdutos(empresa.id, { termo: t, limite: 8 })
        if (!vivo) return
        setOpcoes(lista); setAviso(lista.length ? null : t)
      } catch { /* a busca com Enter mostra o erro */ }
    }, 350)
    return () => { vivo = false; clearTimeout(id) }
  }, [codigo, empresa])

  // Quando o caixa é aberto, o cursor volta para o campo do leitor
  const caixaFechado = caixa.data?.aberto === false
  const estavaFechado = useRef(caixaFechado)
  useEffect(() => {
    if (estavaFechado.current && !caixaFechado) setTimeout(() => campo.current?.focus(), 150)
    estavaFechado.current = caixaFechado
  }, [caixaFechado])

  function mostrar(p: Produto) {
    setAtual(p); setQtd('1'); setOpcoes([]); setAviso(null); setCodigo('')
    focar()
  }

  async function consultar() {
    const t = codigo.trim()
    if (!empresa) return
    if (!t) { if (atual) adicionar(); return }
    setBuscando(true); setAviso(null); setOpcoes([])
    try {
      const exato = await produtoPorCodigo(empresa.id, t)
      if (exato) return mostrar(exato)
      const lista = await buscarProdutos(empresa.id, { termo: t, limite: 8 })
      if (lista.length === 1) return mostrar(lista[0])
      setAtual(null)
      if (lista.length > 1) { setOpcoes(lista); setCodigo(''); return }
      setAviso(t); setCodigo('')
    } catch (e) {
      setAviso(null); setAtual(null)
      setOpcoes([]); setCodigo('')
      toast.error(mensagemErro(e))
    } finally {
      setBuscando(false); focar()
    }
  }

  function descartar() {
    setAtual(null); setOpcoes([]); setAviso(null); setCodigo(''); focar()
  }

  function adicionar() {
    if (!atual) return
    const q = lerNumeroBR(qtd) ?? 0
    if (q <= 0 || erroQuantidade(q, atual.unidade, atual.nome)) return
    setSeparados((lista) => {
      const i = lista.findIndex((x) => x.produto.id === atual.id)
      if (i >= 0) {
        const c = [...lista]
        c[i] = { ...c[i], quantidade: numeroParaCampo(centavos((lerNumeroBR(c[i].quantidade) ?? 0) + q)) }
        return c
      }
      return [...lista, { produto: atual, quantidade: numeroParaCampo(q) }]
    })
    descartar()
  }

  function alterarQtd(id: string, v: string) {
    setSeparados((l) => l.map((x) => (x.produto.id === id ? { ...x, quantidade: v } : x)))
  }
  const remover = (id: string) => setSeparados((l) => l.filter((x) => x.produto.id !== id))

  const total = centavos(separados.reduce((s, i) => s + centavos((lerNumeroBR(i.quantidade) ?? 0) * i.produto.preco_venda), 0))
  const nItens = separados.length

  function fecharVenda() {
    const itens = separados.filter((i) => (lerNumeroBR(i.quantidade) ?? 0) > 0)
    setSeparados([])
    navigate('/vendas/nova', { state: { itens } })
  }

  const qAtual = lerNumeroBR(qtd) ?? 0

  return (
    <>
      <PageHeader titulo="Consultar preço" descricao="Passe o leitor no código de barras ou digite o nome." voltarPara="/vendas" />
      {(caixa.data?.aberto === false || caixaDeOutroDia(caixa.data)) && <div className="mb-4"><BarraCaixa /></div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); void consultar() }} className="relative">
            <ScanBarcode className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={campo}
              autoFocus
              value={codigo}
              onChange={(e) => { setCodigo(e.target.value); if (aviso) setAviso(null) }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); descartar() } }}
              placeholder="Código de barras ou nome"
              aria-label="Código de barras, código ou nome do produto"
              enterKeyHint="search"
              autoComplete="off"
              className="h-14 pl-13 pr-12 text-lg sm:h-14 sm:text-lg"
            />
            {buscando && <Loader2 className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </form>

          {aviso && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-destructive">Produto não encontrado</p>
                <p className="break-all text-sm text-muted-foreground">Nada cadastrado com “{aviso}”.</p>
                {ehDono && /^\d{6,}$/.test(aviso) && (
                  <Link to={`/produtos/novo?barras=${encodeURIComponent(aviso)}`} className="mt-1 inline-block text-sm font-medium text-primary underline">
                    Cadastrar produto com este código
                  </Link>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={descartar} aria-label="Fechar aviso"><X /></Button>
            </div>
          )}

          {opcoes.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Qual destes?</CardTitle></CardHeader>
              <CardContent className="p-0">
                {opcoes.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => mostrar(p)}
                    className={cn('flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted', i > 0 && 'border-t')}>
                    <Package className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                    <span className="shrink-0 tabular">{formatarMoeda(p.preco_venda)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {atual ? (
            <Card className="border-primary/40">
              <CardContent className="space-y-5 pt-6">
                <div>
                  <p className="text-xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-2xl">{atual.nome}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[atual.codigo, atual.codigo_barras, atual.categoria_nome].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div>
                  <p className="text-5xl font-bold tracking-tight text-primary tabular sm:text-6xl">{formatarMoeda(atual.preco_venda)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">por {atual.unidade}</p>
                </div>
                <p className={cn('text-sm', atual.estoque_atual <= 0 ? 'font-medium text-destructive' : atual.estoque_baixo ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                  {atual.estoque_atual <= 0 ? 'Sem estoque no sistema' : `Em estoque: ${formatarQuantidade(atual.estoque_atual, atual.unidade)}`}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Qtd valor={qtd} onChange={setQtd} grande />
                  {qAtual > 1 && <p className="text-lg tabular">= <strong>{formatarMoeda(centavos(qAtual * atual.preco_venda))}</strong></p>}
                </div>
                {qAtual > 0 && erroQuantidade(qAtual, atual.unidade, atual.nome) && (
                  <p className="text-sm text-destructive">{erroQuantidade(qAtual, atual.unidade, atual.nome)}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Button size="lg" variant="outline" className="h-14 text-base" onClick={descartar}>
                    <X /> Descartar
                  </Button>
                  <Button size="lg" className="h-14 text-base" onClick={adicionar} disabled={qAtual <= 0 || !!erroQuantidade(qAtual, atual.unidade, atual.nome)}>
                    <Plus /> Adicionar
                  </Button>
                </div>
                <p className="hidden text-center text-xs text-muted-foreground sm:block">
                  Enter no campo vazio adiciona · Esc descarta · passar outro produto troca a consulta
                </p>
              </CardContent>
            </Card>
          ) : !aviso && opcoes.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
              <ScanBarcode className="size-12 text-muted-foreground" />
              <p className="text-muted-foreground">Passe o leitor no produto para ver o preço.</p>
            </div>
          )}
        </div>

        <Card className="lg:sticky lg:top-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="size-4" /> Separados</CardTitle>
            {nItens > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { setSeparados([]); focar() }}>Limpar</Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {nItens === 0 ? (
              <p className="text-sm text-muted-foreground">O que o cliente decidir levar aparece aqui.</p>
            ) : (
              <ul className="divide-y">
                {separados.map((i) => (
                  <li key={i.produto.id} className="space-y-2 py-3 first:pt-0">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-sm font-medium">{i.produto.nome}</p>
                      <button type="button" onClick={() => remover(i.produto.id)} aria-label={`Tirar ${i.produto.nome}`}
                        className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Qtd valor={i.quantidade} onChange={(v) => alterarQtd(i.produto.id, v)} />
                      <span className="text-sm tabular">{formatarMoeda(centavos((lerNumeroBR(i.quantidade) ?? 0) * i.produto.preco_venda))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">{nItens} {nItens === 1 ? 'item' : 'itens'}</span>
              <span className="text-2xl font-semibold tabular">{formatarMoeda(total)}</span>
            </div>
            <Button className="h-12 w-full text-base" disabled={nItens === 0} onClick={fecharVenda}>
              <ShoppingCart /> Fechar venda
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Abre a <Link to="/vendas/nova" className="underline">Nova venda</Link> já com os itens, para escolher o pagamento.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
