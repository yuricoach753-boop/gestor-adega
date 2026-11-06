import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { SomenteDono } from '@/components/Guards'
import { ListaCarregando } from '@/components/EstadosLista'
import { APP } from '@/config'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { formatarData, formatarMoeda, hojeISO, linkWhatsApp } from '@/lib/format'
import { NOME_STATUS_ASSINATURA, type PagamentoAssinatura, type Plano } from '@/types'

function Conteudo() {
  const { empresa, config, diasDeTeste } = useEmpresa()
  const e = empresa!
  const q = useQuery({
    queryKey: ['assinatura', e.id],
    queryFn: async () => {
      const [pl, pg] = await Promise.all([
        e.plano_id ? supabase.from('planos').select('*').eq('id', e.plano_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase.from('pagamentos_assinatura').select('*').eq('empresa_id', e.id).is('cancelado_em', null).order('pago_em', { ascending: false }),
      ])
      if (pl.error) throw pl.error
      if (pg.error) throw pg.error
      return { plano: pl.data as Plano | null, pagamentos: pg.data as PagamentoAssinatura[] }
    },
  })
  const suporte = config?.suporte_whatsapp || APP.suporteWhatsApp
  if (q.isLoading) return <ListaCarregando linhas={3} />
  const { plano, pagamentos } = q.data!
  const vencida = e.assinatura_vence_em && e.assinatura_vence_em < hojeISO() && e.status_assinatura !== 'trial'

  return (
    <div className="space-y-4">
      <Card className="gap-3">
        <CardHeader><CardTitle>{plano ? `Plano ${plano.nome}` : 'Sua assinatura'}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Situação</p><p className={`font-medium ${vencida ? 'text-destructive' : ''}`}>{vencida ? 'Mensalidade vencida' : NOME_STATUS_ASSINATURA[e.status_assinatura]}</p></div>
          {e.status_assinatura === 'trial' ? (
            <div><p className="text-xs text-muted-foreground">Teste grátis até</p><p className="font-medium">{formatarData(e.trial_ate)}{diasDeTeste !== null && diasDeTeste >= 0 ? ` (${diasDeTeste} ${diasDeTeste === 1 ? 'dia' : 'dias'})` : ''}</p></div>
          ) : (
            <div><p className="text-xs text-muted-foreground">Paga até</p><p className="font-medium">{formatarData(e.assinatura_vence_em) || '—'}</p></div>
          )}
          {plano && <div><p className="text-xs text-muted-foreground">Valor</p><p className="font-medium">{formatarMoeda(plano.valor_mensal)}/mês{plano.limite_usuarios ? ` · até ${plano.limite_usuarios} usuários` : ''}</p></div>}
        </CardContent>
      </Card>
      {suporte && (
        <Button asChild size="lg" className="w-full sm:w-auto">
          <a href={linkWhatsApp(`Olá! Sou da empresa ${e.nome_fantasia} e quero falar sobre a assinatura do ${APP.nome}.`, suporte)} target="_blank" rel="noreferrer">
            <MessageCircle /> {e.status_assinatura === 'trial' ? 'Quero assinar' : 'Falar sobre a assinatura'}
          </a>
        </Button>
      )}
      <Card className="gap-2">
        <CardHeader><CardTitle>Pagamentos</CardTitle></CardHeader>
        {pagamentos.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p></CardContent> : (
          <ul className="divide-y">
            {pagamentos.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>{formatarData(p.pago_em)}{p.meses > 1 ? ` · ${p.meses} meses` : ''}</span>
                <span className="font-medium tabular">{formatarMoeda(p.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default function Assinatura() {
  return (
    <>
      <PageHeader titulo="Assinatura" voltarPara="/configuracoes" />
      <SomenteDono><Conteudo /></SomenteDono>
    </>
  )
}
