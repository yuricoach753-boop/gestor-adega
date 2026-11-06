import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Banknote, CalendarClock, CreditCard, Loader2, Minus, Plus, QrCode, ShoppingCart, Split, Trash2, Wallet, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { Caixinha } from '@/components/Caixinha'
import { BuscaProduto } from '@/components/BuscaProduto'
import { BuscaCliente, type ClienteEscolhido } from '@/components/BuscaCliente'
import { PageHeader } from '@/components/PageHeader'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { erroQuantidade, formatarData, formatarMoeda, formatarQuantidade, hojeISO, lerNumeroBR, numeroParaCampo } from '@/lib/format'
import { Confirmar } from '@/components/Confirmar'
import { cn } from '@/lib/utils'
import type { FormaPagamento, Produto } from '@/types'
import { BarraCaixa, caixaDeOutroDia, useCaixa } from '@/components/CaixaTurno'

interface Item { produto: Produto; quantidade: string }
interface Pagamento { forma: FormaPagamento; valor: number | null; parcelas: string; vencimento: string; recebido: number | null }

const FORMAS: Array<{ forma: FormaPagamento; rotulo: string; icone: typeof Banknote }> = [
  { forma: 'dinheiro', rotulo: 'Dinheiro', icone: Banknote },
  { forma: 'pix', rotulo: 'Pix', icone: QrCode },
  { forma: 'cartao_debito', rotulo: 'Débito', icone: CreditCard },
  { forma: 'cartao_credito', rotulo: 'Crédito', icone: CreditCard },
  { forma: 'a_prazo', rotulo: 'Fiado', icone: CalendarClock },
]
const aPrazo = (f: FormaPagamento) => f === 'a_prazo' || f === 'boleto'
const centavos = (n: number) => Math.round(n * 100) / 100

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function novoPagamento(forma: FormaPagamento, valor: number | null): Pagamento {
  return { forma, valor, parcelas: '1', vencimento: somarDias(hojeISO(), 30), recebido: null }
}

function Quantidade({ valor, onChange, unidade }: { valor: string; onChange: (v: string) => void; unidade: string }) {
  const n = lerNumeroBR(valor) ?? 0
  const passo = (d: number) => onChange(numeroParaCampo(Math.max(0, centavos(n + d))))
  return (
    <div className="flex items-center">
      <Button type="button" variant="outline" size="icon" className="size-10 rounded-r-none" onClick={() => passo(-1)} aria-label="Menos" disabled={n <= 1}>
        <Minus />
      </Button>
      <Input inputMode="decimal" value={valor} onChange={(e) => onChange(e.target.value)} aria-label={`Quantidade (${unidade})`}
        className="h-10 w-16 rounded-none border-x-0 text-center sm:h-10" />
      <Button type="button" variant="outline" size="icon" className="size-10 rounded-l-none" onClick={() => passo(1)} aria-label="Mais">
        <Plus />
      </Button>
    </div>
  )
}

export default function NovaVenda() {
  const { empresa, ehDono } = useEmpresa()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const hoje = hojeISO()
  const location = useLocation()

  // Itens que vieram da Consulta de preço
  const [itens, setItens] = useState<Item[]>(() => (location.state as { itens?: Item[] } | null)?.itens ?? [])
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(null)
  const [descModo, setDescModo] = useState<'valor' | 'pct'>('valor')
  const [descValor, setDescValor] = useState<number | null>(null)
  const [descPct, setDescPct] = useState('')
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([novoPagamento('pix', null)])
  const [dividir, setDividir] = useState(false)
  const [entregue, setEntregue] = useState(true)
  const [obs, setObs] = useState('')
  const [data, setData] = useState(hoje)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [avisoNegativo, setAvisoNegativo] = useState<string[] | null>(null)
  const caixa = useCaixa()
  // Venda de hoje só com caixa aberto (venda lançada com data passada não passa pelo caixa)
  const caixaFechado = data >= hoje && caixa.data?.aberto === false
  // Ao abrir o caixa, o cursor volta para a busca (o leitor de código já pode "bipar")
  const estavaFechado = useRef(caixaFechado)
  useEffect(() => {
    if (estavaFechado.current && !caixaFechado)
      setTimeout(() => document.querySelector<HTMLInputElement>('main input[type="search"]')?.focus(), 150)
    estavaFechado.current = caixaFechado
  }, [caixaFechado])

  const subtotal = useMemo(
    () => centavos(itens.reduce((s, i) => s + centavos((lerNumeroBR(i.quantidade) ?? 0) * i.produto.preco_venda), 0)),
    [itens],
  )
  const pct = lerNumeroBR(descPct)
  // % negativo ou acima de 100 não é aceito em silêncio: vira aviso (antes era cortado sem avisar)
  const pctNegativo = descModo === 'pct' && (pct ?? 0) < 0
  const pctAcima = descModo === 'pct' && (pct ?? 0) > 100
  const desconto = descModo === 'valor'
    ? centavos(descValor ?? 0)
    : centavos(subtotal * Math.max(pct ?? 0, 0) / 100)
  const total = Math.max(centavos(subtotal - desconto), 0)
  // Com uma forma só, o valor do pagamento é sempre o total
  const efetivos = dividir ? pagamentos : [{ ...pagamentos[0], valor: total }]
  const somaPag = centavos(efetivos.reduce((s, p) => s + (p.valor ?? 0), 0))
  const falta = centavos(total - somaPag)

  function adicionar(p: Produto) {
    setErro(null)
    setItens((atual) => {
      const i = atual.findIndex((x) => x.produto.id === p.id)
      if (i >= 0) {
        const c = [...atual]
        c[i] = { ...c[i], quantidade: numeroParaCampo((lerNumeroBR(c[i].quantidade) ?? 0) + 1) }
        return c
      }
      return [...atual, { produto: p, quantidade: '1' }]
    })
  }

  function alterarPag(i: number, campos: Partial<Pagamento>) {
    setErro(null)
    setPagamentos((ps) => ps.map((p, j) => (j === i ? { ...p, ...campos } : p)))
  }

  function escolherForma(f: FormaPagamento) {
    setErro(null)
    setPagamentos([novoPagamento(f, total)])
  }

  // Fiado só o dono vende (pedido do Yuri); boleto não existe na venda de balcão
  const formas = FORMAS.filter((f) => f.forma !== 'a_prazo' || ehDono)

  function alternarDividir() {
    if (dividir) {
      setDividir(false)
      setPagamentos([novoPagamento(pagamentos[0].forma, total)])
    } else {
      setDividir(true)
      setPagamentos([{ ...pagamentos[0], valor: null }, novoPagamento(ehDono ? 'a_prazo' : 'pix', null)])
    }
  }

  const temPrazo = efetivos.some((p) => aPrazo(p.forma) && (p.valor ?? 0) > 0)
  const unico = efetivos[0]
  // Desconto não pode passar do valor da venda (antes o total virava R$ 0,00 sem avisar e o troco ficava errado)
  const descontoInvalido = pctNegativo || pctAcima || (desconto > 0 && desconto > subtotal)
  const troco = !dividir && unico.forma === 'dinheiro' && unico.recebido !== null && itens.length > 0 && !descontoInvalido
    ? centavos(unico.recebido - total) : null

  async function finalizar(confirmouNegativo = false) {
    setErro(null)
    if (caixaFechado) return setErro('O caixa está fechado. Abra o caixa para vender.')
    if (data < somarDias(hoje, -60)) return setErro('A data da venda não pode ser de mais de 60 dias atrás.')
    if (!itens.length) return setErro('Adicione pelo menos um produto.')
    for (const i of itens) {
      const e = erroQuantidade(lerNumeroBR(i.quantidade), i.produto.unidade, i.produto.nome)
      if (e) return setErro(e)
    }
    if (descontoInvalido) return setErro('Confira o desconto.')
    const pags = efetivos.filter((p) => (p.valor ?? 0) > 0)
    if (total > 0 && !pags.length) return setErro('Informe a forma de pagamento.')
    if (falta !== 0) return setErro(falta > 0 ? `Falta lançar ${formatarMoeda(falta)} no pagamento.` : `Os pagamentos passam do total em ${formatarMoeda(-falta)}.`)
    if (temPrazo && !cliente) return setErro('Para vender fiado, escolha o cliente.')
    for (const p of pags) {
      if (!aPrazo(p.forma)) continue
      if (!p.vencimento) return setErro('Informe o vencimento.')
      if (p.vencimento < (ehDono ? data : hoje)) return setErro('O vencimento não pode ser antes da data da venda.')
      const n = Number(p.parcelas)
      if (!p.parcelas || !Number.isInteger(n) || n < 1 || n > 48) return setErro('O número de parcelas precisa ser de 1 a 48.')
    }
    if (troco !== null && troco < 0) return setErro('O valor recebido em dinheiro é menor que o total.')

    setSalvando(true)
    // Confere preço e situação de cada produto agora (o dono pode ter mudado com a venda aberta)
    const { data: atuais, error: erroAtual } = await supabase.from('v_produtos').select('*').in('id', itens.map((i) => i.produto.id))
    if (erroAtual) { setSalvando(false); return setErro(mensagemErro(erroAtual)) }
    const porId = new Map((atuais as Produto[]).map((p) => [p.id, p]))
    const mudou: string[] = []
    for (const i of itens) {
      const a = porId.get(i.produto.id)
      if (!a || !a.ativo) mudou.push(`"${i.produto.nome}" foi desativado — tire da venda`)
      else if (Number(a.preco_venda) !== Number(i.produto.preco_venda))
        mudou.push(`"${a.nome}" mudou de ${formatarMoeda(i.produto.preco_venda)} para ${formatarMoeda(a.preco_venda)}`)
    }
    if (mudou.length) {
      setItens((lista) => lista.map((i) => { const a = porId.get(i.produto.id); return a ? { ...i, produto: a } : i }))
      setSalvando(false)
      return setErro(`O preço mudou: ${mudou.join('; ')}. A venda foi atualizada — confira o total e finalize de novo.`)
    }
    // Estoque vai ficar negativo: pede confirmação (evita vender 99.999 por engano)
    const negativos = itens.filter((i) => (porId.get(i.produto.id)?.estoque_atual ?? 0) - (lerNumeroBR(i.quantidade) ?? 0) < 0)
    if (negativos.length && !confirmouNegativo) {
      setSalvando(false)
      setAvisoNegativo(negativos.map((i) => {
        const a = porId.get(i.produto.id)!
        return `${formatarQuantidade(lerNumeroBR(i.quantidade) ?? 0, a.unidade)} de "${a.nome}" (tem ${formatarQuantidade(a.estoque_atual, a.unidade)})`
      }))
      return
    }
    const { data: id, error } = await supabase.rpc('registrar_venda', {
      p_empresa: empresa!.id,
      p_itens: itens.map((i) => ({ produto_id: i.produto.id, quantidade: lerNumeroBR(i.quantidade) })),
      p_pagamentos: pags.map((p) => ({
        forma: p.forma,
        valor: p.valor,
        ...(aPrazo(p.forma) ? { parcelas: Number(p.parcelas), primeiro_vencimento: p.vencimento, intervalo_dias: 30 } : {}),
      })),
      p_cliente: cliente?.id ?? null,
      p_desconto: desconto,
      p_observacoes: obs || null,
      p_entregue: entregue,
      p_data: ehDono ? data : null,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    for (const k of ['vendas', 'produtos', 'produto', 'movimentacoes', 'produtos-baixo', 'clientes', 'contas-receber', 'devedores', 'caixa', 'painel']) qc.invalidateQueries({ queryKey: [k] })
    toast.success('Venda registrada!')
    navigate(`/vendas/${id}?nova=1`, { replace: true })
  }

  return (
    <div className="pb-24">
      <PageHeader titulo="Nova venda" voltarPara="/vendas" />
      {caixaFechado && <div className="mb-4"><BarraCaixa destaque /></div>}
      {!caixaFechado && caixaDeOutroDia(caixa.data) && <div className="mb-4"><BarraCaixa /></div>}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card className="gap-3">
            <CardContent className="grid gap-3">
              <BuscaProduto onEscolher={adicionar} autoFocus placeholder="Buscar produto ou ler código de barras" />
              {itens.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <ShoppingCart className="size-8" />
                  Busque os produtos acima para montar a venda.
                </div>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {itens.map((i, idx) => {
                    const q = lerNumeroBR(i.quantidade) ?? 0
                    const vaiFicar = i.produto.estoque_atual - q
                    return (
                      <li key={i.produto.id} className="grid gap-2 p-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug [overflow-wrap:anywhere]">{i.produto.nome}</p>
                            <p className="text-xs text-muted-foreground tabular">{formatarMoeda(i.produto.preco_venda)} / {i.produto.unidade}</p>
                          </div>
                          <button type="button" onClick={() => setItens((a) => a.filter((_, j) => j !== idx))}
                            className="-m-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Tirar ${i.produto.nome}`}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <Quantidade valor={i.quantidade} unidade={i.produto.unidade}
                            onChange={(v) => setItens((a) => a.map((x, j) => (j === idx ? { ...x, quantidade: v } : x)))} />
                          <span className="font-semibold tabular">{formatarMoeda(q * i.produto.preco_venda)}</span>
                        </div>
                        {i.quantidade.trim() !== '' && q > 0 && erroQuantidade(q, i.produto.unidade, i.produto.nome) && (
                          <p className="text-xs text-destructive">{erroQuantidade(q, i.produto.unidade, i.produto.nome)}</p>
                        )}
                        {vaiFicar < 0 && (
                          <p className="flex items-center gap-1.5 text-xs text-amber-700">
                            <AlertTriangle className="size-3.5" /> Estoque: {formatarQuantidade(i.produto.estoque_atual, i.produto.unidade)}. Vai ficar negativo.
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
            <CardContent>
              <BuscaCliente valor={cliente} onChange={(c) => { setErro(null); setCliente(c) }} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader><CardTitle>Pagamento</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Desconto</span>
                <div className="flex gap-2">
                  <div className="flex shrink-0 rounded-md border p-0.5">
                    {(['valor', 'pct'] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setDescModo(m)}
                        className={cn('rounded px-3 text-sm font-medium', descModo === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                        {m === 'valor' ? 'R$' : '%'}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1">
                    {descModo === 'valor'
                      ? <CampoDinheiro value={descValor} onChange={setDescValor} aria-label="Desconto em reais" />
                      : <Input inputMode="decimal" value={descPct} onChange={(e) => setDescPct(e.target.value)} placeholder="0" aria-label="Desconto em porcentagem" className="text-right" />}
                  </div>
                </div>
                {descontoInvalido && (
                  <p className="mt-1.5 text-sm text-destructive">
                    {pctNegativo ? 'O desconto não pode ser negativo.'
                      : pctAcima ? 'O desconto não pode passar de 100%.'
                      : itens.length
                      ? `O desconto (${formatarMoeda(desconto)}) é maior que a venda (${formatarMoeda(subtotal)}).`
                      : 'Adicione os produtos antes de dar desconto.'}
                  </p>
                )}
              </div>

              {itens.length > 0 && (
                <dl className="grid gap-1 rounded-lg bg-muted/60 p-3 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Produtos</dt><dd className="tabular">{formatarMoeda(subtotal)}</dd></div>
                  {desconto > 0 && !descontoInvalido && (
                    <div className="flex justify-between"><dt className="text-muted-foreground">Desconto</dt><dd className="tabular">− {formatarMoeda(desconto)}</dd></div>
                  )}
                  <div className="flex justify-between text-base font-semibold"><dt>Total a pagar</dt><dd className="tabular">{formatarMoeda(total)}</dd></div>
                </dl>
              )}

              {!dividir ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {formas.map((f) => (
                      <button key={f.forma} type="button" onClick={() => escolherForma(f.forma)}
                        className={cn('flex flex-col items-center gap-1 rounded-lg border py-2.5 text-sm font-medium transition-colors',
                          unico.forma === f.forma ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted')}>
                        <f.icone className="size-5" />
                        {f.rotulo}
                      </button>
                    ))}
                  </div>
                  {unico.forma === 'dinheiro' && (
                    <div className="grid grid-cols-2 items-end gap-3">
                      <Campo rotulo="Valor recebido" htmlFor="recebido" opcional>
                        <CampoDinheiro id="recebido" value={unico.recebido} onChange={(v) => alterarPag(0, { recebido: v })} />
                      </Campo>
                      <div className={cn('rounded-lg p-2.5 text-right', troco !== null && troco < 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted')}>
                        <p className="text-xs">Troco</p>
                        <p className="text-lg font-semibold tabular">{troco === null ? '—' : troco < 0 ? `Falta ${formatarMoeda(-troco)}` : formatarMoeda(troco)}</p>
                      </div>
                    </div>
                  )}
                  {aPrazo(unico.forma) && <CamposPrazo min={ehDono ? data : hoje} p={unico} onChange={(c) => alterarPag(0, c)} />}
                </>
              ) : (
                <div className="grid gap-3">
                  {pagamentos.map((p, i) => (
                    <div key={i} className="grid gap-2 rounded-lg border p-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <NativeSelect value={p.forma} onChange={(e) => alterarPag(i, { forma: e.target.value as FormaPagamento })} aria-label="Forma">
                            {formas.map((f) => <option key={f.forma} value={f.forma}>{f.rotulo}</option>)}
                          </NativeSelect>
                        </div>
                        <div className="w-36"><CampoDinheiro value={p.valor} onChange={(v) => alterarPag(i, { valor: v })} aria-label="Valor" /></div>
                        {pagamentos.length > 1 && (
                          <button type="button" onClick={() => setPagamentos((ps) => ps.filter((_, j) => j !== i))}
                            className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Tirar pagamento"><X className="size-4" /></button>
                        )}
                      </div>
                      {aPrazo(p.forma) && <CamposPrazo min={ehDono ? data : hoje} p={p} onChange={(c) => alterarPag(i, c)} />}
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setPagamentos((ps) => [...ps, novoPagamento('dinheiro', falta > 0 ? falta : null)])}>
                      <Plus /> Outra forma
                    </Button>
                    {falta !== 0 && (
                      <button type="button" className={cn('text-sm font-medium', falta > 0 ? 'text-amber-700' : 'text-destructive')}
                        onClick={() => {
                          const i = pagamentos.findIndex((p) => p.valor === null || p.valor === 0)
                          const alvo = i >= 0 ? i : pagamentos.length - 1
                          alterarPag(alvo, { valor: Math.max(centavos((pagamentos[alvo].valor ?? 0) + falta), 0) })
                        }}>
                        {falta > 0 ? `Falta ${formatarMoeda(falta)} · preencher` : `Passou ${formatarMoeda(-falta)} · ajustar`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button type="button" onClick={alternarDividir} className="flex items-center gap-1.5 justify-self-start text-sm font-medium text-primary">
                <Split className="size-4" /> {dividir ? 'Usar uma forma só' : 'Dividir em mais de uma forma'}
              </button>
              {temPrazo && !cliente && (
                <Alert variant="warning"><AlertTriangle /><AlertDescription>Para vender fiado, escolha o cliente.</AlertDescription></Alert>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardContent className="grid gap-3">
              <Caixinha checked={entregue} onChange={setEntregue} rotulo="Cliente já levou a mercadoria"
                descricao={entregue ? 'A venda fica como entregue.' : 'Vira um pedido em aberto, para separar e entregar depois.'} />
              <Campo rotulo="Observações" htmlFor="obs" opcional>
                <Textarea id="obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: entregar no período da tarde" />
              </Campo>
              {ehDono && (
                <Campo rotulo="Data da venda" htmlFor="data" dica="Mude só se estiver lançando uma venda de outro dia.">
                  <Input id="data" type="date" min={somarDias(hoje, -60)} max={hoje} value={data} onChange={(e) => setData(e.target.value)} />
                </Campo>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      <Confirmar aberto={!!avisoNegativo} onAberto={(v) => !v && setAvisoNegativo(null)}
        titulo="Estoque vai ficar negativo"
        descricao={<>Você está vendendo mais do que tem no estoque:<br />{avisoNegativo?.map((t) => <span key={t} className="block">• {t}</span>)}<br />Confira a quantidade. Se estiver certo (faltou lançar uma compra), pode vender.</>}
        textoConfirmar="Vender mesmo assim"
        onConfirmar={() => { setAvisoNegativo(null); void finalizar(true) }} />

      {/* Barra de total e finalizar */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 border-t bg-card/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        {erro && (
          <p role="alert" className="mx-auto mb-2 max-w-5xl rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{erro}</p>
        )}
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {itens.length} {itens.length === 1 ? 'item' : 'itens'}{desconto > 0 ? ` · desconto ${formatarMoeda(desconto)}` : ''}
            </p>
            <p className="text-2xl font-semibold leading-tight tabular">{formatarMoeda(total)}</p>
          </div>
          <Button size="lg" onClick={() => finalizar()} disabled={salvando || !itens.length || caixaFechado || descontoInvalido} className="px-6">
            {salvando ? <Loader2 className="animate-spin" /> : <Wallet />} Finalizar
          </Button>
        </div>
      </div>
    </div>
  )
}

function CamposPrazo({ p, onChange, min }: { p: Pagamento; onChange: (c: Partial<Pagamento>) => void; min?: string }) {
  const n = Math.min(Math.max(parseInt(p.parcelas) || 1, 1), 48)
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Campo rotulo={n > 1 ? '1º vencimento' : 'Vencimento'} htmlFor={`venc-${p.forma}`}>
          <Input id={`venc-${p.forma}`} type="date" min={min} value={p.vencimento} onChange={(e) => onChange({ vencimento: e.target.value })} />
        </Campo>
        <Campo rotulo="Parcelas" htmlFor={`parc-${p.forma}`}>
          <Input id={`parc-${p.forma}`} inputMode="numeric" value={p.parcelas} onChange={(e) => onChange({ parcelas: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
        </Campo>
      </div>
      {n > 1 && p.valor ? (
        <p className="text-xs text-muted-foreground">
          {n}x de cerca de {formatarMoeda(p.valor / n)}, a cada 30 dias, a partir de {formatarData(p.vencimento)}.
        </p>
      ) : null}
    </div>
  )
}
