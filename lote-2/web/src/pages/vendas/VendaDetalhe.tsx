import { useState } from 'react'
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, CheckCircle2, Copy, MessageCircle, PackageCheck, Plus, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { Confirmar } from '@/components/Confirmar'
import { BadgeSituacao } from '@/components/BadgeSituacao'
import { BadgeStatusVenda } from '@/components/BadgeStatusVenda'
import { useAuth } from '@/contexts/AuthProvider'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarData, formatarDataHora, formatarMoeda, formatarQuantidade, hojeISO, linkWhatsApp } from '@/lib/format'
import { textoComprovante } from '@/lib/mensagens'
import { cn } from '@/lib/utils'
import { NOME_FORMA, type ContaReceber, type StatusVenda, type Venda, type VendaItem, type VendaPagamento } from '@/types'
import NaoEncontrada from '@/pages/NaoEncontrada'

const PASSOS: StatusVenda[] = ['aberto', 'separado', 'entregue']

export default function VendaDetalhe() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const nova = params.get('nova') === '1'
  const { empresa, ehDono } = useEmpresa()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [cancelar, setCancelar] = useState(false)
  const [mudando, setMudando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const q = useQuery({
    queryKey: ['vendas', 'detalhe', id],
    queryFn: async () => {
      const [v, itens, pags, contas] = await Promise.all([
        supabase.from('v_vendas').select('*').eq('id', id!).maybeSingle(),
        supabase.from('venda_itens').select('id, produto_id, descricao, unidade, quantidade, preco_unitario, desconto, subtotal').eq('venda_id', id!).order('created_at'),
        supabase.from('venda_pagamentos').select('id, forma, valor, parcelas, primeiro_vencimento').eq('venda_id', id!).order('created_at'),
        ehDono ? supabase.from('v_contas_receber').select('*').eq('venda_id', id!).order('parcela_numero') : Promise.resolve({ data: [], error: null }),
      ])
      for (const r of [v, itens, pags, contas]) if (r.error) throw r.error
      return { venda: v.data as Venda | null, itens: itens.data as VendaItem[], pags: pags.data as VendaPagamento[], contas: contas.data as ContaReceber[] }
    },
  })

  if (q.isLoading) return <ListaCarregando linhas={4} />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  const { venda: v, itens, pags, contas } = q.data!
  if (!v) return <NaoEncontrada />

  const cancelada = v.status === 'cancelado'
  const podeCancelar = !cancelada && (ehDono || (v.vendedor_id === user?.id && v.dia === hojeISO()))
  const texto = textoComprovante(empresa!, v, itens, pags)

  function atualizar() {
    for (const k of ['vendas', 'produtos', 'produto', 'movimentacoes', 'produtos-baixo', 'clientes', 'contas-receber', 'devedores', 'caixa', 'painel']) qc.invalidateQueries({ queryKey: [k] })
  }

  async function mudarStatus(s: StatusVenda) {
    setMudando(true)
    const { error } = await supabase.rpc('mudar_status_venda', { p_venda: v!.id, p_status: s })
    setMudando(false)
    if (error) return toast.error(mensagemErro(error))
    toast.success(s === 'entregue' ? 'Pedido entregue!' : 'Pedido separado!')
    // O funcionário só enxerga pedidos pendentes e as próprias vendas do dia:
    // ao entregar o pedido de outro vendedor, ele sai da lista dele.
    if (s === 'entregue' && !ehDono && !(v!.vendedor_id === user?.id && v!.dia === hojeISO())) {
      navigate('/vendas', { replace: true })
      return
    }
    atualizar()
  }

  async function confirmarCancelamento(motivo: string) {
    const { error } = await supabase.rpc('cancelar_venda', { p_venda: v!.id, p_motivo: motivo || null })
    if (error) { toast.error(mensagemErro(error)); throw error }
    toast.success('Venda cancelada. O estoque voltou e o financeiro foi corrigido.')
    atualizar()
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { toast.error('Não foi possível copiar.') }
  }

  const botaoWhats = (
    <Button asChild size="lg" className="flex-1 bg-[#128C7E] hover:bg-[#128C7E]/90">
      <a href={linkWhatsApp(texto, v.cliente_telefone)} target="_blank" rel="noreferrer"><MessageCircle /> Enviar comprovante</a>
    </Button>
  )

  return (
    <>
      <PageHeader titulo={`Pedido nº ${v.numero}`} descricao={`${formatarDataHora(v.data_venda)}${v.vendedor_nome ? ` · ${v.vendedor_nome}` : ''}`} voltarPara="/vendas" />

      {nova && !cancelada && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-accent p-4">
          <p className="flex items-center gap-2 font-semibold text-accent-foreground"><CheckCircle2 className="size-5" /> Venda registrada · {formatarMoeda(v.total)}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {botaoWhats}
            <Button asChild size="lg" variant="outline" className="flex-1 bg-card" onClick={() => setParams({}, { replace: true })}>
              <Link to="/vendas/nova"><Plus /> Nova venda</Link>
            </Button>
          </div>
        </div>
      )}

      {cancelada && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Venda cancelada em {formatarDataHora(v.cancelado_em)}{v.motivo_cancelamento ? `: ${v.motivo_cancelamento}` : ''}. O estoque voltou e o financeiro foi estornado.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card className="gap-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{v.cliente_nome ? (ehDono ? <Link to={`/clientes/${v.cliente_id}`} className="hover:underline">{v.cliente_nome}</Link> : v.cliente_nome) : 'Venda de balcão'}</CardTitle>
              <BadgeStatusVenda status={v.status} />
            </CardHeader>
            <ul className="divide-y">
              {itens.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/produtos/${i.produto_id}`} className="block text-sm font-medium hover:underline">{i.descricao}</Link>
                    <p className="text-xs text-muted-foreground tabular">
                      {formatarQuantidade(i.quantidade, i.unidade)} × {formatarMoeda(i.preco_unitario)}{i.desconto > 0 ? ` − ${formatarMoeda(i.desconto)}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular">{formatarMoeda(i.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mx-5 mt-1 space-y-1 border-t pt-3 text-sm">
              {v.desconto > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular">{formatarMoeda(v.subtotal)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span className="tabular">−{formatarMoeda(v.desconto)}</span></div>
                </>
              )}
              <div className="flex items-center justify-between"><span className="font-medium">Total</span>
                <span className={cn('text-xl font-semibold tabular', cancelada && 'line-through')}>{formatarMoeda(v.total)}</span></div>
            </div>
            {v.observacoes && <p className="mx-5 mt-2 rounded-md bg-muted p-2 text-sm text-muted-foreground">{v.observacoes}</p>}
          </Card>

          <Card className="gap-2">
            <CardHeader><CardTitle>Pagamento</CardTitle></CardHeader>
            <ul className="divide-y">
              {pags.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>
                    {NOME_FORMA[p.forma]}
                    {p.primeiro_vencimento && <span className="text-muted-foreground"> · {p.parcelas > 1 ? `${p.parcelas}x, 1ª vence` : 'vence'} {formatarData(p.primeiro_vencimento)}</span>}
                  </span>
                  <span className="font-medium tabular">{formatarMoeda(p.valor)}</span>
                </li>
              ))}
              {!pags.length && <li className="px-5 py-2.5 text-sm text-muted-foreground">Sem pagamento (venda de valor zero).</li>}
            </ul>
            {ehDono && contas.length > 0 && (
              <>
                <p className="mx-5 mt-2 text-xs font-medium text-muted-foreground">Contas a receber</p>
                <ul className="divide-y">
                  {contas.map((c) => (
                    <li key={c.id}>
                      <Link to={`/financeiro/receber/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-muted">
                        <span>{c.parcela_total > 1 ? `Parcela ${c.parcela_numero}/${c.parcela_total}` : 'Fiado'} · vence {formatarData(c.vencimento)}</span>
                        <span className="flex items-center gap-2"><span className="tabular">{formatarMoeda(c.status === 'parcial' ? c.saldo : c.valor)}</span><BadgeSituacao situacao={c.situacao} /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {!cancelada && (
            <Card className="gap-3">
              <CardHeader><CardTitle>Andamento do pedido</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <ol className="flex items-center gap-2 text-xs">
                  {PASSOS.map((s, i) => {
                    const feito = PASSOS.indexOf(v.status) >= i
                    return (
                      <li key={s} className="flex flex-1 items-center gap-2">
                        <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                          feito ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                          {feito ? <Check className="size-3.5" /> : i + 1}
                        </span>
                        <span className={feito ? 'font-medium' : 'text-muted-foreground'}>{s === 'aberto' ? 'Recebido' : s === 'separado' ? 'Separado' : 'Entregue'}</span>
                      </li>
                    )
                  })}
                </ol>
                {v.status === 'aberto' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" onClick={() => mudarStatus('separado')} disabled={mudando}><PackageCheck /> Marcar separado</Button>
                    <Button onClick={() => mudarStatus('entregue')} disabled={mudando}><Truck /> Marcar entregue</Button>
                  </div>
                )}
                {v.status === 'separado' && <Button onClick={() => mudarStatus('entregue')} disabled={mudando}><Truck /> Marcar entregue</Button>}
                {v.status === 'entregue' && v.entregue_em && <p className="text-sm text-muted-foreground">Entregue em {formatarDataHora(v.entregue_em)}.</p>}
              </CardContent>
            </Card>
          )}

          {!nova && (
            <div className="flex gap-2">
              {botaoWhats}
              <Button variant="outline" size="lg" onClick={copiar} aria-label="Copiar comprovante">{copiado ? <Check /> : <Copy />}</Button>
            </div>
          )}
          {nova && (
            <Button variant="outline" className="w-full" onClick={copiar}>{copiado ? <Check /> : <Copy />} Copiar comprovante</Button>
          )}

          {podeCancelar && (
            <Button variant="ghost" className="w-full text-destructive" onClick={() => setCancelar(true)}><Ban /> Cancelar venda</Button>
          )}
        </div>
      </div>

      <Confirmar
        aberto={cancelar}
        onAberto={setCancelar}
        titulo={`Cancelar o pedido nº ${v.numero}?`}
        descricao={
          <ul className="list-disc space-y-1 pl-5">
            <li>Os produtos voltam para o estoque.</li>
            <li>O valor recebido sai do caixa e o fiado deixa de ser cobrado.</li>
            <li>Nada é apagado: a venda fica no histórico como cancelada.</li>
          </ul>
        }
        textoConfirmar="Cancelar venda"
        perigoso
        pedirMotivo
        onConfirmar={confirmarCancelamento}
      />
    </>
  )
}
