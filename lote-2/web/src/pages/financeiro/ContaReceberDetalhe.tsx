import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, HandCoins, Undo2 } from 'lucide-react'
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
import { BotaoCobrar } from '@/components/BotaoCobrar'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarData, formatarDataHora, formatarMoeda } from '@/lib/format'
import { NOME_FORMA, type ContaReceber, type Recebimento } from '@/types'
import NaoEncontrada from '@/pages/NaoEncontrada'
import { ReceberDialog } from './ReceberDialog'

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return <div className="flex justify-between gap-4 py-2 text-sm"><span className="text-muted-foreground">{rotulo}</span><span className="text-right font-medium">{valor}</span></div>
}

function Detalhe() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [receber, setReceber] = useState(false)
  const [cancelar, setCancelar] = useState(false)
  const [estornar, setEstornar] = useState<Recebimento | null>(null)

  const q = useQuery({
    queryKey: ['contas-receber', 'detalhe', id],
    queryFn: async () => {
      const [c, r] = await Promise.all([
        supabase.from('v_contas_receber').select('*').eq('id', id!).maybeSingle(),
        supabase.from('v_recebimentos').select('*').eq('conta_receber_id', id!).order('created_at', { ascending: false }),
      ])
      if (c.error) throw c.error
      if (r.error) throw r.error
      return { conta: c.data as ContaReceber | null, recs: r.data as Recebimento[] }
    },
  })

  if (q.isLoading) return <ListaCarregando linhas={3} />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  const { conta: c, recs } = q.data!
  if (!c) return <NaoEncontrada />
  const aberta = c.status === 'aberta' || c.status === 'parcial'

  function atualizar() {
    for (const k of ['contas-receber', 'devedores', 'clientes', 'vendas', 'caixa', 'painel']) qc.invalidateQueries({ queryKey: [k] })
  }

  return (
    <>
      <PageHeader titulo={c.cliente_nome ?? 'Conta a receber'} descricao={c.descricao} voltarPara="/financeiro/receber" />

      {c.status === 'cancelada' && (
        <Alert variant="destructive" className="mb-4"><AlertDescription>Conta cancelada{c.motivo_cancelamento ? `: ${c.motivo_cancelamento}` : '.'}</AlertDescription></Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="gap-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-2xl tabular">{formatarMoeda(aberta ? c.saldo : c.valor)}</CardTitle>
              {c.status === 'parcial' ? <Badge variant="secondary">Recebida em parte</Badge> : <BadgeSituacao situacao={c.situacao} />}
            </CardHeader>
            <CardContent className="divide-y">
              <Linha rotulo="Valor da conta" valor={formatarMoeda(c.valor)} />
              {c.valor_recebido > 0 && <Linha rotulo="Já recebido" valor={formatarMoeda(c.valor_recebido)} />}
              <Linha rotulo="Vencimento" valor={<>{formatarData(c.vencimento)}{c.dias_atraso > 0 && <span className="text-destructive"> · {c.dias_atraso} dias de atraso</span>}</>} />
              {c.parcela_total > 1 && <Linha rotulo="Parcela" valor={`${c.parcela_numero} de ${c.parcela_total}`} />}
              {c.venda_id && <Linha rotulo="Origem" valor={<Link to={`/vendas/${c.venda_id}`} className="text-primary hover:underline">Venda nº {c.venda_numero}</Link>} />}
              {c.observacoes && <Linha rotulo="Observações" valor={c.observacoes} />}
            </CardContent>
          </Card>

          {aberta && (
            <div className="flex gap-2">
              <Button size="lg" className="flex-1" onClick={() => setReceber(true)}><HandCoins /> Receber</Button>
              <BotaoCobrar cliente={c.cliente_nome} telefone={c.cliente_telefone} valor={Number(c.saldo)} vencimento={c.vencimento} className="h-12" />
            </div>
          )}
          {c.cliente_id && <Button asChild variant="outline" className="w-full"><Link to={`/clientes/${c.cliente_id}`}>Ver cliente</Link></Button>}
        </div>

        <Card className="gap-2 self-start">
          <CardHeader><CardTitle>Recebimentos</CardTitle></CardHeader>
          {recs.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">Nada recebido ainda.</p></CardContent> : (
            <ul className="divide-y">
              {recs.map((r) => (
                <li key={r.id} className={`flex items-center gap-3 px-5 py-3 ${r.status === 'cancelado' ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{NOME_FORMA[r.forma]} · {formatarData(r.data)}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.conta_nome}{r.criado_por_nome ? ` · lançado por ${r.criado_por_nome}` : ''} · {formatarDataHora(r.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium tabular ${r.status === 'cancelado' ? 'line-through' : ''}`}>{formatarMoeda(r.valor)}</p>
                    {r.status === 'cancelado' ? <Badge variant="outline">Estornado</Badge> : c.status !== 'cancelada' && (
                      <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setEstornar(r)}>
                        <Undo2 className="mr-1 inline size-3" />Estornar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {aberta && !c.venda_id && c.valor_recebido === 0 && (
        <Button variant="ghost" className="mt-4 w-full text-destructive" onClick={() => setCancelar(true)}><Ban /> Cancelar conta</Button>
      )}

      {receber && <ReceberDialog conta={c} aberto={receber} onAberto={setReceber} />}

      <Confirmar aberto={cancelar} onAberto={setCancelar} titulo="Cancelar esta conta?"
        descricao="Ela deixa de ser cobrada. Nada é apagado: a conta fica no histórico como cancelada."
        textoConfirmar="Cancelar conta" perigoso pedirMotivo
        onConfirmar={async (motivo) => {
          const { error } = await supabase.rpc('cancelar_conta_receber', { p_conta: c.id, p_motivo: motivo || null })
          if (error) { toast.error(mensagemErro(error)); throw error }
          toast.success('Conta cancelada.')
          atualizar()
        }} />

      <Confirmar aberto={!!estornar} onAberto={(v) => !v && setEstornar(null)} titulo="Estornar este recebimento?"
        descricao={estornar ? `${formatarMoeda(estornar.valor)} sai do caixa e volta a ser cobrado do cliente. Use quando o pagamento foi lançado errado ou não caiu.` : ''}
        textoConfirmar="Estornar" perigoso pedirMotivo
        onConfirmar={async (motivo) => {
          const { error } = await supabase.rpc('estornar_recebimento', { p_recebimento: estornar!.id, p_motivo: motivo || null })
          if (error) { toast.error(mensagemErro(error)); throw error }
          toast.success('Recebimento estornado.')
          atualizar()
        }} />
    </>
  )
}

export default function ContaReceberDetalhe() {
  return <SomenteDono><Detalhe /></SomenteDono>
}
