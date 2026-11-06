import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { Confirmar } from '@/components/Confirmar'
import { SomenteDono } from '@/components/Guards'
import { BadgeSituacao } from '@/components/BadgeSituacao'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarData, formatarDataHora, formatarMoeda, formatarQuantidade } from '@/lib/format'
import type { Compra, CompraItem, ContaPagarResumo } from '@/types'
import NaoEncontrada from '@/pages/NaoEncontrada'

function Detalhe() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [cancelar, setCancelar] = useState(false)

  const compra = useQuery({
    queryKey: ['compras', 'detalhe', id],
    queryFn: async () => {
      const [c, itens, contas] = await Promise.all([
        supabase.from('v_compras').select('*').eq('id', id!).maybeSingle(),
        supabase.from('v_compra_itens').select('*').eq('compra_id', id!).order('created_at'),
        supabase.from('v_contas_pagar').select('id, descricao, valor, vencimento, status, situacao, parcela_numero, parcela_total, pago_em')
          .eq('compra_id', id!).order('parcela_numero'),
      ])
      for (const r of [c, itens, contas]) if (r.error) throw r.error
      return { compra: c.data as Compra | null, itens: itens.data as CompraItem[], contas: contas.data as ContaPagarResumo[] }
    },
  })

  if (compra.isLoading) return <ListaCarregando linhas={4} />
  if (compra.error) return <ErroLista erro={compra.error} tentarDeNovo={() => compra.refetch()} />
  const { compra: c, itens, contas } = compra.data!
  if (!c) return <NaoEncontrada />
  const cancelada = c.status === 'cancelada'

  async function confirmarCancelamento(motivo: string) {
    const { error } = await supabase.rpc('cancelar_compra', { p_compra: c!.id, p_motivo: motivo || null })
    if (error) { toast.error(mensagemErro(error)); throw error }
    toast.success('Compra cancelada. O estoque e o financeiro foram corrigidos.')
    for (const k of ['compras', 'produtos', 'produto', 'movimentacoes', 'produtos-baixo', 'fornecedores', 'caixa', 'contas-pagar', 'painel']) qc.invalidateQueries({ queryKey: [k] })
  }

  return (
    <>
      <PageHeader
        titulo={c.fornecedor_nome ?? 'Compra sem fornecedor'}
        descricao={`${formatarData(c.data_compra)}${c.numero_nota ? ` · NF ${c.numero_nota}` : ''}`}
        voltarPara="/compras"
      />

      {cancelada && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Compra cancelada em {formatarDataHora(c.cancelado_em)}{c.motivo_cancelamento ? `: ${c.motivo_cancelamento}` : ''}.
            O estoque e as contas desta compra foram estornados.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="gap-2">
          <CardHeader><CardTitle>Produtos ({itens.length})</CardTitle></CardHeader>
          <ul className="divide-y">
            {itens.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/produtos/${i.produto_id}`} className="block truncate font-medium hover:underline">{i.produto_nome}</Link>
                  <p className="text-xs text-muted-foreground tabular">{formatarQuantidade(i.quantidade, i.unidade)} × {formatarMoeda(i.custo_unitario)}</p>
                </div>
                <span className="font-medium tabular">{formatarMoeda(i.subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="mx-5 mt-2 flex items-center justify-between border-t pt-3">
            <span className="font-medium">Total</span>
            <span className={`text-xl font-semibold tabular ${cancelada ? 'line-through' : ''}`}>{formatarMoeda(c.valor_total)}</span>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="gap-2">
            <CardHeader><CardTitle>Financeiro</CardTitle></CardHeader>
            {contas.length === 0 ? (
              <CardContent><p className="text-sm text-muted-foreground">Esta compra não foi lançada no financeiro.</p></CardContent>
            ) : (
              <ul className="divide-y">
                {contas.map((cp) => (
                  <li key={cp.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {cp.parcela_total > 1 ? `Parcela ${cp.parcela_numero}/${cp.parcela_total}` : 'Pagamento'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cp.status === 'paga' ? `Paga em ${formatarData(cp.pago_em)}` : `Vence ${formatarData(cp.vencimento)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular">{formatarMoeda(cp.valor)}</p>
                      <BadgeSituacao situacao={cp.situacao} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Registrada por {c.criado_por_nome ?? '—'} em {formatarDataHora(c.created_at)}</p>
              {c.observacoes && <p>Obs.: {c.observacoes}</p>}
              <p>Status: <Badge variant={cancelada ? 'destructive' : 'default'}>{cancelada ? 'Cancelada' : 'Registrada'}</Badge></p>
            </CardContent>
          </Card>

          {!cancelada && (
            <Button variant="ghost" className="w-full text-destructive" onClick={() => setCancelar(true)}>
              <Ban /> Cancelar compra
            </Button>
          )}
        </div>
      </div>

      <Confirmar
        aberto={cancelar}
        onAberto={setCancelar}
        titulo="Cancelar esta compra?"
        descricao={
          <ul className="list-disc space-y-1 pl-5">
            <li>As quantidades saem do estoque.</li>
            <li>As contas a pagar desta compra são canceladas (inclusive as já pagas, que saem do caixa).</li>
            <li>O preço de custo dos produtos não volta ao valor anterior.</li>
            <li>Nada é apagado: a compra fica no histórico como cancelada.</li>
          </ul>
        }
        textoConfirmar="Cancelar compra"
        perigoso
        pedirMotivo
        onConfirmar={confirmarCancelamento}
      />
    </>
  )
}

export default function CompraDetalhe() {
  return <SomenteDono><Detalhe /></SomenteDono>
}
