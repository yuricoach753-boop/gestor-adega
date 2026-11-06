import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, HandCoins, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { SomenteDono } from '@/components/Guards'
import { BadgeSituacao } from '@/components/BadgeSituacao'
import { BotaoCobrar } from '@/components/BotaoCobrar'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { diasEntre, formatarData, formatarMoeda, hojeISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ContaReceber, Devedor, SituacaoConta } from '@/types'
import { AbasFinanceiro } from './AbasFinanceiro'

type Visao = 'clientes' | 'contas'
type Filtro = 'abertas' | 'atrasada' | 'vence_hoje' | 'a_vencer' | 'paga'
const FILTROS: Array<{ valor: Filtro; rotulo: string }> = [
  { valor: 'abertas', rotulo: 'Em aberto' }, { valor: 'atrasada', rotulo: 'Atrasadas' }, { valor: 'vence_hoje', rotulo: 'Vencem hoje' },
  { valor: 'a_vencer', rotulo: 'A vencer' }, { valor: 'paga', rotulo: 'Recebidas' },
]

function Conteudo() {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const [visao, setVisao] = useState<Visao>('clientes')
  const [filtro, setFiltro] = useState<Filtro>('abertas')

  const abertas = useQuery({
    queryKey: ['contas-receber', 'abertas', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_contas_receber').select('*').eq('empresa_id', empresa!.id)
        .in('status', ['aberta', 'parcial']).order('vencimento').limit(1000)
      if (error) throw error
      return data as ContaReceber[]
    },
  })

  const devedores = useQuery({
    queryKey: ['devedores', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_devedores').select('*').eq('empresa_id', empresa!.id)
        .order('total_vencido', { ascending: false }).order('total_devido', { ascending: false })
      if (error) throw error
      return data as Devedor[]
    },
  })

  const pagas = useQuery({
    queryKey: ['contas-receber', 'pagas', empresa?.id],
    enabled: visao === 'contas' && filtro === 'paga',
    queryFn: async () => {
      const { data, error } = await supabase.from('v_contas_receber').select('*').eq('empresa_id', empresa!.id)
        .eq('status', 'paga').order('recebido_em', { ascending: false }).limit(100)
      if (error) throw error
      return data as ContaReceber[]
    },
  })

  const resumo = useMemo(() => {
    const hoje = hojeISO()
    const lista = abertas.data ?? []
    return {
      total: lista.reduce((s, c) => s + Number(c.saldo), 0),
      vencido: lista.filter((c) => c.vencimento < hoje).reduce((s, c) => s + Number(c.saldo), 0),
      semana: lista.filter((c) => c.vencimento >= hoje && diasEntre(hoje, c.vencimento) <= 7).reduce((s, c) => s + Number(c.saldo), 0),
    }
  }, [abertas.data])

  const contas = filtro === 'paga' ? pagas : abertas
  const contasFiltradas = (contas.data ?? []).filter((c) => filtro === 'abertas' || filtro === 'paga' || c.situacao === (filtro as SituacaoConta))

  if (abertas.isLoading) return <ListaCarregando />
  if (abertas.error) return <ErroLista erro={abertas.error} tentarDeNovo={() => abertas.refetch()} />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">A receber</p>
          <p className="mt-0.5 font-semibold tabular sm:text-xl">{formatarMoeda(resumo.total)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Atrasado</p>
          <p className={cn('mt-0.5 font-semibold tabular sm:text-xl', resumo.vencido > 0 && 'text-destructive')}>{formatarMoeda(resumo.vencido)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Próx. 7 dias</p>
          <p className="mt-0.5 font-semibold tabular sm:text-xl">{formatarMoeda(resumo.semana)}</p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(['clientes', 'contas'] as Visao[]).map((v) => (
          <button key={v} type="button" onClick={() => setVisao(v)}
            className={cn('flex-1 rounded-md py-2 text-sm font-medium', visao === v ? 'bg-card shadow-xs' : 'text-muted-foreground')}>
            {v === 'clientes' ? 'Quem está devendo' : 'Todas as contas'}
          </button>
        ))}
      </div>

      {visao === 'clientes' ? (
        devedores.isLoading ? <ListaCarregando /> : !devedores.data?.length ? (
          <EmptyState icone={HandCoins} titulo="Ninguém está devendo"
            descricao="Quando você vender fiado ou no boleto, os clientes aparecem aqui, com quantos dias de atraso e um botão para cobrar pelo WhatsApp." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {devedores.data.map((d) => (
              <li key={d.cliente_id ?? 'sem'} className="flex items-center gap-3 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => d.cliente_id && navigate(`/clientes/${d.cliente_id}`)}>
                  <p className="truncate font-medium">{d.cliente_nome ?? 'Sem cliente'}</p>
                  <p className="text-sm tabular">
                    <strong>{formatarMoeda(d.total_devido)}</strong>
                    <span className="text-muted-foreground"> · {d.qtd_contas} {d.qtd_contas === 1 ? 'conta' : 'contas'}</span>
                  </p>
                  <div className="mt-1">
                    {d.maior_atraso > 0
                      ? <Badge variant="destructive">{d.maior_atraso} {d.maior_atraso === 1 ? 'dia' : 'dias'} de atraso · {formatarMoeda(d.total_vencido)}</Badge>
                      : <Badge variant="secondary">Em dia · vence {formatarData(d.vencimento_mais_antigo)}</Badge>}
                  </div>
                </button>
                <BotaoCobrar cliente={d.cliente_nome} telefone={d.cliente_telefone} valor={d.maior_atraso > 0 ? d.total_vencido : d.total_devido}
                  vencimento={d.vencimento_mais_antigo} compacto />
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTROS.map((f) => (
              <button key={f.valor} type="button" onClick={() => setFiltro(f.valor)}
                className={cn('h-9 shrink-0 rounded-full border px-3 text-sm font-medium', filtro === f.valor ? 'border-primary bg-accent text-accent-foreground' : 'bg-card')}>
                {f.rotulo}
              </button>
            ))}
          </div>
          {contas.isLoading ? <ListaCarregando /> : contasFiltradas.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma conta aqui.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {contasFiltradas.map((c) => (
                <li key={c.id}>
                  <Link to={`/financeiro/receber/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.cliente_nome ?? 'Sem cliente'}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.status === 'paga' ? `Recebida em ${formatarData(c.recebido_em)}` : `Vence ${formatarData(c.vencimento)}`}
                        {c.dias_atraso > 0 && <span className="text-destructive"> · {c.dias_atraso} dias de atraso</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular">{formatarMoeda(c.status === 'paga' ? c.valor : c.saldo)}</span>
                      {c.status === 'parcial' ? <Badge variant="secondary">Parcial</Badge> : <BadgeSituacao situacao={c.situacao} />}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export default function Receber() {
  return (
    <>
      <PageHeader titulo="Financeiro" acoes={<Button asChild variant="outline"><Link to="/financeiro/receber/nova"><Plus /> <span className="hidden sm:inline">Lançar a receber</span></Link></Button>} />
      <AbasFinanceiro />
      <SomenteDono><Conteudo /></SomenteDono>
    </>
  )
}
