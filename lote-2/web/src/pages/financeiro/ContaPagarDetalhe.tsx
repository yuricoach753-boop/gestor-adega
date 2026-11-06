import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, Copy, FileText, Pencil, Repeat, Undo2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { Confirmar } from '@/components/Confirmar'
import { SomenteDono } from '@/components/Guards'
import { BadgeSituacao } from '@/components/BadgeSituacao'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { abrirAnexo } from '@/lib/anexos'
import { formatarData, formatarMoeda } from '@/lib/format'
import { NOME_FORMA, type ContaPagar } from '@/types'
import NaoEncontrada from '@/pages/NaoEncontrada'
import { PagarDialog } from './PagarDialog'

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return <div className="flex justify-between gap-4 py-2 text-sm"><span className="text-muted-foreground">{rotulo}</span><span className="text-right font-medium">{valor}</span></div>
}

function Detalhe() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [pagar, setPagar] = useState(false)
  const [estornar, setEstornar] = useState(false)
  const [cancelar, setCancelar] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const q = useQuery({
    queryKey: ['contas-pagar', 'detalhe', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_contas_pagar').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as ContaPagar | null
    },
  })

  if (q.isLoading) return <ListaCarregando linhas={3} />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  const c = q.data
  if (!c) return <NaoEncontrada />

  const atualizar = () => { for (const k of ['contas-pagar', 'caixa', 'fornecedores', 'compras', 'painel']) qc.invalidateQueries({ queryKey: [k] }) }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(c!.codigo_barras!)
      setCopiado(true)
      toast.success('Código copiado! Cole no app do banco.')
      setTimeout(() => setCopiado(false), 2500)
    } catch { toast.error('Não foi possível copiar. Segure o dedo no código para copiar.') }
  }

  return (
    <>
      <PageHeader titulo={c.descricao} descricao={[c.fornecedor_nome, c.categoria_nome].filter(Boolean).join(' · ') || undefined} voltarPara="/financeiro/pagar"
        acoes={c.status === 'aberta' && <Button asChild variant="outline"><Link to={`/financeiro/pagar/${c.id}/editar`}><Pencil /> <span className="hidden sm:inline">Editar</span></Link></Button>} />

      {c.status === 'cancelada' && <Alert variant="destructive" className="mb-4"><AlertDescription>Conta cancelada{c.motivo_cancelamento ? `: ${c.motivo_cancelamento}` : '.'}</AlertDescription></Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="gap-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-2xl tabular">{formatarMoeda(c.status === 'paga' ? c.valor_pago : c.valor)}</CardTitle>
              <BadgeSituacao situacao={c.situacao} />
            </CardHeader>
            <CardContent className="divide-y">
              <Linha rotulo="Vencimento" valor={<>{formatarData(c.vencimento)}{c.dias_atraso > 0 && <span className="text-destructive"> · {c.dias_atraso} dias de atraso</span>}</>} />
              {c.forma_pagamento && <Linha rotulo="Forma" valor={NOME_FORMA[c.forma_pagamento]} />}
              {c.parcela_total > 1 && <Linha rotulo="Parcela" valor={`${c.parcela_numero} de ${c.parcela_total}`} />}
              {c.recorrencia_id && <Linha rotulo="Conta fixa" valor={<Link to="/financeiro/pagar/fixas" className="inline-flex items-center gap-1 text-primary hover:underline"><Repeat className="size-3.5" /> todo mês</Link>} />}
              {c.compra_id && <Linha rotulo="Origem" valor={<Link to={`/compras/${c.compra_id}`} className="text-primary hover:underline">Ver compra</Link>} />}
              {c.status === 'paga' && (
                <>
                  <Linha rotulo="Paga em" valor={formatarData(c.pago_em)} />
                  {c.juros_multa > 0 && <Linha rotulo="Juros / multa" valor={formatarMoeda(c.juros_multa)} />}
                  {c.desconto > 0 && <Linha rotulo="Desconto" valor={`−${formatarMoeda(c.desconto)}`} />}
                </>
              )}
              {c.observacoes && <Linha rotulo="Observações" valor={c.observacoes} />}
            </CardContent>
          </Card>

          {c.status === 'aberta' && <Button size="lg" className="w-full" onClick={() => setPagar(true)}><Wallet /> Marcar como paga</Button>}
          {c.status === 'paga' && <Button variant="outline" className="w-full" onClick={() => setEstornar(true)}><Undo2 /> Estornar pagamento</Button>}
        </div>

        <div className="space-y-4">
          {c.codigo_barras && (
            <Card className="gap-3">
              <CardHeader><CardTitle>Código de barras</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <p className="break-all rounded-lg bg-muted p-3 font-mono text-sm">{c.codigo_barras}</p>
                <Button variant="outline" onClick={copiar}>{copiado ? <Check /> : <Copy />} {copiado ? 'Copiado!' : 'Copiar código'}</Button>
              </CardContent>
            </Card>
          )}
          {c.anexo_path && (
            <Button variant="outline" className="w-full" onClick={() => abrirAnexo(c.anexo_path!).catch((e) => toast.error(e.message))}>
              <FileText /> Ver boleto / anexo
            </Button>
          )}
          {c.status === 'aberta' && !c.compra_id && (
            <Button variant="ghost" className="w-full text-destructive" onClick={() => setCancelar(true)}><Ban /> Cancelar conta</Button>
          )}
        </div>
      </div>

      {pagar && <PagarDialog conta={c} onFechar={() => setPagar(false)} />}

      <Confirmar aberto={estornar} onAberto={setEstornar} titulo="Estornar o pagamento?"
        descricao="O valor volta para o caixa e a conta fica em aberto de novo. Use quando marcou como paga por engano."
        textoConfirmar="Estornar" perigoso pedirMotivo
        onConfirmar={async (m) => {
          const { error } = await supabase.rpc('estornar_pagamento', { p_conta: c.id, p_motivo: m || null })
          if (error) { toast.error(mensagemErro(error)); throw error }
          toast.success('Pagamento estornado.'); atualizar()
        }} />

      <Confirmar aberto={cancelar} onAberto={setCancelar} titulo="Cancelar esta conta?"
        descricao={c.recorrencia_id ? 'Só a conta deste mês é cancelada; a conta fixa continua. Para parar de vez, desative em Contas fixas.' : 'Ela sai da lista de contas a pagar. Nada é apagado: fica no histórico como cancelada.'}
        textoConfirmar="Cancelar conta" perigoso pedirMotivo
        onConfirmar={async (m) => {
          const { error } = await supabase.rpc('cancelar_conta_pagar', { p_conta: c.id, p_motivo: m || null })
          if (error) { toast.error(mensagemErro(error)); throw error }
          toast.success('Conta cancelada.'); atualizar()
        }} />
    </>
  )
}

export default function ContaPagarDetalhe() {
  return <SomenteDono><Detalhe /></SomenteDono>
}
