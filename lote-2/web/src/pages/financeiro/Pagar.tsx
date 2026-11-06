import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Paperclip, Plus, Receipt, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { CampoBusca } from '@/components/CampoBusca'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { SomenteDono } from '@/components/Guards'
import { BadgeSituacao } from '@/components/BadgeSituacao'
import { Fab } from '@/components/Fab'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { useDebounce } from '@/hooks/useDebounce'
import { supabase } from '@/lib/supabase'
import { diasEntre, formatarData, formatarMoeda, hojeISO, semAcento } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ContaPagar } from '@/types'
import { AbasFinanceiro } from './AbasFinanceiro'

type Filtro = 'abertas' | 'atrasada' | 'vence_hoje' | 'a_vencer' | 'paga'
const FILTROS: Array<{ valor: Filtro; rotulo: string }> = [
  { valor: 'abertas', rotulo: 'Em aberto' }, { valor: 'atrasada', rotulo: 'Atrasadas' }, { valor: 'vence_hoje', rotulo: 'Vencem hoje' },
  { valor: 'a_vencer', rotulo: 'A vencer' }, { valor: 'paga', rotulo: 'Pagas' },
]

function Conteudo() {
  const { empresa } = useEmpresa()
  const [filtro, setFiltro] = useState<Filtro>('abertas')
  const [termo, setTermo] = useState('')
  const busca = useDebounce(termo)

  // Gera as contas fixas do mês (o banco não duplica). Roda uma vez ao abrir.
  const geracao = useQuery({
    queryKey: ['gerar-recorrentes', empresa?.id],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_recorrentes', { p_empresa: empresa!.id })
      if (error) throw error
      return data as number
    },
  })

  const abertas = useQuery({
    queryKey: ['contas-pagar', 'abertas', empresa?.id, geracao.dataUpdatedAt],
    enabled: !geracao.isLoading,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_contas_pagar').select('*').eq('empresa_id', empresa!.id)
        .eq('status', 'aberta').order('vencimento').limit(1000)
      if (error) throw error
      return data as ContaPagar[]
    },
  })

  const pagas = useQuery({
    queryKey: ['contas-pagar', 'pagas', empresa?.id],
    enabled: filtro === 'paga',
    queryFn: async () => {
      const { data, error } = await supabase.from('v_contas_pagar').select('*').eq('empresa_id', empresa!.id)
        .eq('status', 'paga').order('pago_em', { ascending: false }).limit(150)
      if (error) throw error
      return data as ContaPagar[]
    },
  })

  const resumo = useMemo(() => {
    const hoje = hojeISO()
    const l = abertas.data ?? []
    const soma = (f: (c: ContaPagar) => boolean) => l.filter(f).reduce((s, c) => s + Number(c.valor), 0)
    return {
      atrasado: soma((c) => c.vencimento < hoje),
      qtdAtrasado: l.filter((c) => c.vencimento < hoje).length,
      hoje: soma((c) => c.vencimento === hoje),
      semana: soma((c) => c.vencimento > hoje && diasEntre(hoje, c.vencimento) <= 7),
      total: soma(() => true),
    }
  }, [abertas.data])

  const fonte = filtro === 'paga' ? pagas : abertas
  const t = semAcento(busca.trim())
  const lista = (fonte.data ?? [])
    .filter((c) => filtro === 'abertas' || filtro === 'paga' || c.situacao === filtro)
    .filter((c) => !t || semAcento(`${c.descricao} ${c.fornecedor_nome ?? ''} ${c.categoria_nome ?? ''}`).includes(t))

  if (abertas.isLoading || geracao.isLoading) return <ListaCarregando />
  if (abertas.error) return <ErroLista erro={abertas.error} tentarDeNovo={() => abertas.refetch()} />

  const nadaCadastrado = abertas.data!.length === 0 && filtro === 'abertas' && !t

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <button type="button" onClick={() => setFiltro('atrasada')} className="rounded-xl border bg-card p-3 text-left">
          <p className="text-xs text-muted-foreground">Atrasadas{resumo.qtdAtrasado ? ` (${resumo.qtdAtrasado})` : ''}</p>
          <p className={cn('mt-0.5 font-semibold tabular sm:text-lg', resumo.atrasado > 0 && 'text-destructive')}>{formatarMoeda(resumo.atrasado)}</p>
        </button>
        <button type="button" onClick={() => setFiltro('vence_hoje')} className="rounded-xl border bg-card p-3 text-left">
          <p className="text-xs text-muted-foreground">Vencem hoje</p>
          <p className={cn('mt-0.5 font-semibold tabular sm:text-lg', resumo.hoje > 0 && 'text-amber-700')}>{formatarMoeda(resumo.hoje)}</p>
        </button>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Próx. 7 dias</p>
          <p className="mt-0.5 font-semibold tabular sm:text-lg">{formatarMoeda(resumo.semana)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Total em aberto</p>
          <p className="mt-0.5 font-semibold tabular sm:text-lg">{formatarMoeda(resumo.total)}</p>
        </div>
      </div>

      {nadaCadastrado ? (
        <EmptyState icone={Receipt} titulo="Nenhuma conta a pagar"
          descricao="Lance aqui boletos, aluguel, luz, internet e outras despesas. As contas fixas podem se repetir todo mês sozinhas."
          acao={<Button asChild size="lg"><Link to="/financeiro/pagar/nova"><Plus /> Lançar conta</Link></Button>} />
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
          <CampoBusca valor={termo} onChange={setTermo} placeholder="Buscar por descrição, fornecedor ou categoria" />
          {fonte.isLoading ? <ListaCarregando /> : lista.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma conta aqui.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {lista.map((c) => (
                <li key={c.id}>
                  <Link to={`/financeiro/pagar/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {c.recorrencia_id && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Conta fixa" />}
                        <span className="truncate">{c.descricao}</span>
                        {c.anexo_path && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Tem anexo" />}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{[c.fornecedor_nome, c.categoria_nome].filter(Boolean).join(' · ') || 'Sem fornecedor'}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.status === 'paga' ? `Paga em ${formatarData(c.pago_em)}` : `Vence ${formatarData(c.vencimento)}`}
                        {c.dias_atraso > 0 && <span className="text-destructive"> · {c.dias_atraso} {c.dias_atraso === 1 ? 'dia' : 'dias'} de atraso</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular">{formatarMoeda(c.status === 'paga' ? c.valor_pago : c.valor)}</span>
                      <BadgeSituacao situacao={c.situacao} />
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

export default function Pagar() {
  const { ehDono } = useEmpresa()
  return (
    <>
      <PageHeader titulo="Financeiro" acoes={ehDono && (
        <>
          <Button asChild variant="outline"><Link to="/financeiro/pagar/fixas"><Repeat /> Fixas</Link></Button>
          <Button asChild className="hidden lg:inline-flex"><Link to="/financeiro/pagar/nova"><Plus /> Lançar conta</Link></Button>
        </>
      )} />
      <AbasFinanceiro />
      <SomenteDono><Conteudo /></SomenteDono>
      {ehDono && <Fab para="/financeiro/pagar/nova" rotulo="Lançar conta" icone={Plus} />}
    </>
  )
}
