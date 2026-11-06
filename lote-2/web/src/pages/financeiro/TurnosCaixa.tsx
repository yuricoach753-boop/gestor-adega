import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { SomenteDono } from '@/components/Guards'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { BarraCaixa } from '@/components/CaixaTurno'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Turno {
  id: string
  numero: number
  status: 'aberto' | 'fechado'
  aberto_em: string
  aberto_por_nome: string | null
  valor_abertura: number
  fechado_em: string | null
  fechado_por_nome: string | null
  valor_contado: number | null
  valor_esperado: number | null
  diferenca: number | null
  observacoes: string | null
  qtd_vendas: number
}

const dataHora = (iso: string | null) => (iso
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  : '')

function Diferenca({ v }: { v: number | null }) {
  if (v === null) return null
  const n = Number(v)
  return (
    <span className={cn('font-semibold tabular', n === 0 && 'text-primary', n > 0 && 'text-blue-700 dark:text-blue-300', n < 0 && 'text-destructive')}>
      {n === 0 ? 'Bateu' : n > 0 ? `Sobrou ${formatarMoeda(n)}` : `Faltou ${formatarMoeda(-n)}`}
    </span>
  )
}

function Lista() {
  const { empresa } = useEmpresa()
  const q = useQuery({
    queryKey: ['caixa-turnos', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_caixa_turnos').select('*').eq('empresa_id', empresa!.id)
        .order('aberto_em', { ascending: false }).limit(100)
      if (error) throw error
      return data as Turno[]
    },
  })
  const fechados = (q.data ?? []).filter((t) => t.status === 'fechado')
  const faltas = fechados.reduce((s, t) => s + Math.min(Number(t.diferenca ?? 0), 0), 0)

  return (
    <>
      <PageHeader titulo="Aberturas e fechamentos" descricao="Quem abriu e fechou o caixa, quanto tinha e se bateu." voltarPara="/financeiro/caixa" />
      <div className="space-y-4">
        <BarraCaixa />
        {fechados.length > 0 && faltas < 0 && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            Nos últimos {fechados.length} fechamentos, faltou ao todo <strong className="text-destructive">{formatarMoeda(-faltas)}</strong>.
          </p>
        )}
        {q.isLoading ? <ListaCarregando /> : q.error ? <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} /> :
          !q.data!.length ? (
            <EmptyState icone={History} titulo="Nenhum caixa aberto ainda" descricao="Quando alguém abrir o caixa, o turno aparece aqui com o valor de abertura e de fechamento." />
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {q.data!.map((t) => (
                <li key={t.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      Caixa nº {t.numero}{' '}
                      {t.status === 'aberto' && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">aberto agora</span>}
                    </p>
                    {t.status === 'fechado' && <Diferenca v={t.diferenca} />}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Abriu: {t.aberto_por_nome ?? '—'} · {dataHora(t.aberto_em)} · com {formatarMoeda(t.valor_abertura)}
                  </p>
                  {t.status === 'fechado' && (
                    <p className="text-sm text-muted-foreground">
                      Fechou: {t.fechado_por_nome ?? '—'} · {dataHora(t.fechado_em)} · contou {formatarMoeda(t.valor_contado)} (esperado {formatarMoeda(t.valor_esperado)}) · {t.qtd_vendas} {t.qtd_vendas === 1 ? 'venda' : 'vendas'}
                    </p>
                  )}
                  {t.observacoes && <p className="text-sm italic text-muted-foreground">“{t.observacoes}”</p>}
                </li>
              ))}
            </ul>
          )}
      </div>
    </>
  )
}

export default function TurnosCaixa() {
  return <SomenteDono><Lista /></SomenteDono>
}
