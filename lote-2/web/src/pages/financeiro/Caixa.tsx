import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, History, Landmark, Plus, Settings2, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { SomenteDono } from '@/components/Guards'
import { SeletorMes, limitesMes, mesAtual, nomeMes } from '@/components/SeletorMes'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { formatarData, formatarMoeda, hojeISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOME_ORIGEM, type ContaFinanceira, type Lancamento } from '@/types'
import { AbasFinanceiro } from './AbasFinanceiro'
import { ContasDialog, LancamentoDetalhe, LancarDialog, TransferirDialog } from './DialogosCaixa'

type Visao = 'extrato' | 'dia' | 'mes' | 'projecao'
const VISOES: Array<{ valor: Visao; rotulo: string }> = [
  { valor: 'extrato', rotulo: 'Extrato' }, { valor: 'dia', rotulo: 'Por dia' }, { valor: 'mes', rotulo: 'Por mês' }, { valor: 'projecao', rotulo: 'Próx. 30 dias' },
]
const diaSemana = (iso: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '')
const sinal = (v: number) => (v > 0 ? 'text-primary' : v < 0 ? 'text-destructive' : 'text-muted-foreground')

function Extrato({ empresaId, contas }: { empresaId: string; contas: ContaFinanceira[] }) {
  const [mes, setMes] = useState(mesAtual())
  const [conta, setConta] = useState('')
  const [aberto, setAberto] = useState<Lancamento | null>(null)
  const { inicio, fim } = limitesMes(mes)
  const q = useQuery({
    queryKey: ['caixa', 'extrato', empresaId, mes, conta],
    placeholderData: (a) => a,
    queryFn: async () => {
      let qq = supabase.from('v_lancamentos').select('*').eq('empresa_id', empresaId).gte('data', inicio).lte('data', fim)
      if (conta) qq = qq.eq('conta_financeira_id', conta)
      const { data, error } = await qq.order('data', { ascending: false }).order('created_at', { ascending: false }).limit(1000)
      if (error) throw error
      return data as Lancamento[]
    },
  })
  const ok = (q.data ?? []).filter((l) => l.status === 'confirmado' && (conta || l.origem_tipo !== 'transferencia'))
  const ent = ok.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0)
  const sai = ok.filter((l) => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0)

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
        <SeletorMes valor={mes} onChange={setMes} />
        <NativeSelect value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border bg-card p-2"><p className="text-xs text-muted-foreground">Entradas</p><p className="font-semibold text-primary tabular">{formatarMoeda(ent)}</p></div>
        <div className="rounded-lg border bg-card p-2"><p className="text-xs text-muted-foreground">Saídas</p><p className="font-semibold text-destructive tabular">{formatarMoeda(sai)}</p></div>
        <div className="rounded-lg border bg-card p-2"><p className="text-xs text-muted-foreground">Resultado</p><p className={cn('font-semibold tabular', sinal(ent - sai))}>{formatarMoeda(ent - sai)}</p></div>
      </div>
      {q.isLoading ? <ListaCarregando /> : q.error ? <ErroLista erro={q.error} /> : !q.data!.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum lançamento em {nomeMes(mes).toLowerCase()}.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {q.data!.map((l) => {
            const Icone = l.origem_tipo === 'transferencia' ? ArrowLeftRight : l.tipo === 'entrada' ? ArrowDownLeft : ArrowUpRight
            const cancelado = l.status === 'cancelado'
            return (
              <li key={l.id}>
                <button type="button" onClick={() => setAberto(l)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted', cancelado && 'opacity-50')}>
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', l.tipo === 'entrada' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>
                    <Icone className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium', cancelado && 'line-through')}>{l.descricao}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatarData(l.data)} · {l.conta_nome}{l.categoria_nome ? ` · ${l.categoria_nome}` : ''}{cancelado ? ' · cancelado' : ` · ${NOME_ORIGEM[l.origem_tipo]}`}
                    </p>
                  </div>
                  <span className={cn('shrink-0 font-semibold tabular', l.tipo === 'entrada' ? 'text-primary' : 'text-destructive', cancelado && 'line-through')}>
                    {l.tipo === 'entrada' ? '+' : '−'}{formatarMoeda(l.valor)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {aberto && <LancamentoDetalhe l={aberto} onFechar={() => setAberto(null)} />}
    </div>
  )
}

function PorDia({ empresaId }: { empresaId: string }) {
  const [mes, setMes] = useState(mesAtual())
  const { inicio, fim } = limitesMes(mes)
  const fimReal = fim > hojeISO() ? hojeISO() : fim
  const q = useQuery({
    queryKey: ['caixa', 'dia', empresaId, mes],
    placeholderData: (a) => a,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fluxo_diario', { p_empresa: empresaId, p_inicio: inicio, p_fim: fimReal })
      if (error) throw error
      return data as Array<{ dia: string; entradas: number; saidas: number; saldo_dia: number; saldo_acumulado: number }>
    },
  })
  const linhas = q.data ?? []
  const abertura = linhas.length ? Number(linhas[0].saldo_acumulado) - Number(linhas[0].saldo_dia) : 0
  const comMov = linhas.filter((l) => Number(l.entradas) || Number(l.saidas) || Number(l.saldo_dia)).reverse()

  return (
    <div className="space-y-3">
      <SeletorMes valor={mes} onChange={setMes} />
      {q.isLoading ? <ListaCarregando /> : q.error ? <ErroLista erro={q.error} /> : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Dia</span><span className="w-20 text-right">Entradas</span><span className="w-20 text-right">Saídas</span><span className="w-24 text-right">Saldo</span>
          </div>
          {linhas.length > 0 && (
            <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b px-4 py-2 text-sm">
              <span className="text-muted-foreground">Saldo em {formatarData(fimReal)}</span>
              <span className="w-24 text-right font-semibold tabular">{formatarMoeda(linhas[linhas.length - 1].saldo_acumulado)}</span>
            </div>
          )}
          {comMov.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma movimentação neste mês.</p>}
          <ul className="divide-y">
            {comMov.map((l) => (
              <li key={l.dia} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-4 py-2 text-sm tabular">
                <span><span className="font-medium">{l.dia.slice(8, 10)}/{l.dia.slice(5, 7)}</span> <span className="text-xs text-muted-foreground">{diaSemana(l.dia)}</span></span>
                <span className="w-20 text-right text-primary">{Number(l.entradas) ? formatarMoeda(l.entradas) : '—'}</span>
                <span className="w-20 text-right text-destructive">{Number(l.saidas) ? formatarMoeda(l.saidas) : '—'}</span>
                <span className={cn('w-24 text-right font-medium', Number(l.saldo_acumulado) < 0 && 'text-destructive')}>{formatarMoeda(l.saldo_acumulado)}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t px-4 py-2 text-sm">
            <span className="text-muted-foreground">Saldo no início do mês</span>
            <span className="w-24 text-right tabular">{formatarMoeda(abertura)}</span>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Transferências entre contas não aparecem como entrada ou saída.</p>
    </div>
  )
}

function PorMes({ empresaId }: { empresaId: string }) {
  const q = useQuery({
    queryKey: ['caixa', 'mes', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fluxo_mensal', { p_empresa: empresaId, p_meses: 12 })
      if (error) throw error
      return data as Array<{ mes: string; entradas: number; saidas: number; resultado: number; saldo_final: number }>
    },
  })
  if (q.isLoading) return <ListaCarregando />
  if (q.error) return <ErroLista erro={q.error} />
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <span>Mês</span><span className="hidden w-24 text-right sm:block">Entradas</span><span className="hidden w-24 text-right sm:block">Saídas</span>
        <span className="w-24 text-right">Resultado</span><span className="w-24 text-right">Saldo final</span>
      </div>
      <ul className="divide-y">
        {[...q.data!].reverse().map((m) => (
          <li key={m.mes} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-4 py-2.5 text-sm tabular sm:grid-cols-[1fr_auto_auto_auto_auto]">
            <span className="font-medium">{nomeMes(m.mes.slice(0, 7), true)}</span>
            <span className="hidden w-24 text-right text-primary sm:block">{formatarMoeda(m.entradas)}</span>
            <span className="hidden w-24 text-right text-destructive sm:block">{formatarMoeda(m.saidas)}</span>
            <span className={cn('w-24 text-right font-medium', sinal(Number(m.resultado)))}>{formatarMoeda(m.resultado)}</span>
            <span className={cn('w-24 text-right', Number(m.saldo_final) < 0 && 'text-destructive')}>{formatarMoeda(m.saldo_final)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Projecao({ empresaId }: { empresaId: string }) {
  const q = useQuery({
    queryKey: ['caixa', 'projecao', empresaId],
    queryFn: async () => {
      const [p, atr] = await Promise.all([
        supabase.rpc('projecao_caixa', { p_empresa: empresaId, p_dias: 30 }),
        supabase.from('v_devedores').select('total_vencido').eq('empresa_id', empresaId),
      ])
      if (p.error) throw p.error
      if (atr.error) throw atr.error
      return {
        dias: p.data as Array<{ dia: string; entradas: number; saidas: number; saldo: number }>,
        receberAtrasado: (atr.data as Array<{ total_vencido: number }>).reduce((s, d) => s + Number(d.total_vencido), 0),
      }
    },
  })
  if (q.isLoading) return <ListaCarregando />
  if (q.error) return <ErroLista erro={q.error} />
  const { dias, receberAtrasado } = q.data!
  const entradas = dias.reduce((s, d) => s + Number(d.entradas), 0)
  const saidas = dias.reduce((s, d) => s + Number(d.saidas), 0)
  const final = dias.length ? Number(dias[dias.length - 1].saldo) : 0
  const menor = dias.reduce((m, d) => (Number(d.saldo) < Number(m.saldo) ? d : m), dias[0])
  const primeiroNegativo = dias.find((d) => Number(d.saldo) < 0)
  const quando = (iso: string) => (iso === hojeISO() ? 'hoje' : formatarData(iso))
  const comMov = dias.filter((d) => Number(d.entradas) || Number(d.saidas))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border bg-card p-2"><p className="text-xs text-muted-foreground">Vai entrar</p><p className="font-semibold text-primary tabular">{formatarMoeda(entradas)}</p></div>
        <div className="rounded-lg border bg-card p-2"><p className="text-xs text-muted-foreground">Vai sair</p><p className="font-semibold text-destructive tabular">{formatarMoeda(saidas)}</p></div>
        <div className="rounded-lg border bg-card p-2"><p className="text-xs text-muted-foreground">Saldo em 30 dias</p><p className={cn('font-semibold tabular', final < 0 && 'text-destructive')}>{formatarMoeda(final)}</p></div>
      </div>
      {primeiroNegativo && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Pelas contas lançadas, o dinheiro não cobre os pagamentos a partir de <strong>{quando(primeiroNegativo.dia)}</strong>.
            {menor.dia !== primeiroNegativo.dia && <> O pior momento é <strong>{quando(menor.dia)}</strong> ({formatarMoeda(menor.saldo)}).</>}
            {' '}Vale cobrar clientes ou renegociar alguma conta.
          </span>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Dia</span><span className="w-20 text-right">Receber</span><span className="w-20 text-right">Pagar</span><span className="w-24 text-right">Saldo previsto</span>
        </div>
        {comMov.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nada vence nos próximos 30 dias.</p>}
        <ul className="divide-y">
          {comMov.map((d) => (
            <li key={d.dia} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-4 py-2 text-sm tabular">
              <span><span className="font-medium">{d.dia === hojeISO() ? 'Hoje' : `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`}</span> <span className="text-xs text-muted-foreground">{diaSemana(d.dia)}</span></span>
              <span className="w-20 text-right text-primary">{Number(d.entradas) ? formatarMoeda(d.entradas) : '—'}</span>
              <span className="w-20 text-right text-destructive">{Number(d.saidas) ? formatarMoeda(d.saidas) : '—'}</span>
              <span className={cn('w-24 text-right font-medium', Number(d.saldo) < 0 && 'text-destructive')}>{formatarMoeda(d.saldo)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Conta com o saldo de hoje, as contas a receber e as contas a pagar dos próximos 30 dias. Contas a pagar atrasadas entram como se fossem pagas hoje.
        {receberAtrasado > 0 && <> Os {formatarMoeda(receberAtrasado)} a receber que já estão atrasados <strong>não</strong> entram na conta.</>}
      </p>
    </div>
  )
}

function Conteudo() {
  const { empresa } = useEmpresa()
  const [visao, setVisao] = useState<Visao>('extrato')
  const [dialogo, setDialogo] = useState<'lancar' | 'transferir' | 'contas' | null>(null)

  const contas = useQuery({
    queryKey: ['caixa', 'saldos', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_saldo_contas').select('*').eq('empresa_id', empresa!.id).order('tipo')
      if (error) throw error
      return data as ContaFinanceira[]
    },
  })

  if (contas.isLoading) return <ListaCarregando linhas={3} />
  if (contas.error) return <ErroLista erro={contas.error} tentarDeNovo={() => contas.refetch()} />
  const lista = contas.data!
  const total = lista.reduce((s, c) => s + Number(c.saldo_atual), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Saldo hoje</p>
        <p className={cn('text-3xl font-semibold tabular', total < 0 && 'text-destructive')}>{formatarMoeda(total)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {lista.filter((c) => c.ativo || Number(c.saldo_atual) !== 0).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
              {c.tipo === 'caixa' ? <Wallet className="size-3.5" /> : <Landmark className="size-3.5" />}
              {c.nome}: <strong className={cn('tabular', Number(c.saldo_atual) < 0 && 'text-destructive')}>{formatarMoeda(c.saldo_atual)}</strong>
            </span>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={() => setDialogo('lancar')}><Plus /> Lançar</Button>
          <Button variant="outline" onClick={() => setDialogo('transferir')} disabled={lista.filter((c) => c.ativo).length < 2}><ArrowLeftRight /> Transferir</Button>
          <Button variant="outline" onClick={() => setDialogo('contas')}><Settings2 /> Contas</Button>
        </div>
        <Button asChild variant="ghost" className="mt-2 w-full"><Link to="/financeiro/caixa/turnos"><History /> Aberturas e fechamentos de caixa</Link></Button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {VISOES.map((v) => (
          <button key={v.valor} type="button" onClick={() => setVisao(v.valor)}
            className={cn('flex-1 whitespace-nowrap rounded-md px-1.5 py-2 text-[13px] font-medium sm:px-3 sm:text-sm', visao === v.valor ? 'bg-card shadow-xs' : 'text-muted-foreground')}>
            {v.rotulo}
          </button>
        ))}
      </div>

      {visao === 'extrato' && <Extrato empresaId={empresa!.id} contas={lista} />}
      {visao === 'dia' && <PorDia empresaId={empresa!.id} />}
      {visao === 'mes' && <PorMes empresaId={empresa!.id} />}
      {visao === 'projecao' && <Projecao empresaId={empresa!.id} />}

      {dialogo === 'lancar' && <LancarDialog empresaId={empresa!.id} contas={lista} onFechar={() => setDialogo(null)} />}
      {dialogo === 'transferir' && <TransferirDialog empresaId={empresa!.id} contas={lista} onFechar={() => setDialogo(null)} />}
      {dialogo === 'contas' && <ContasDialog empresaId={empresa!.id} contas={lista} onFechar={() => setDialogo(null)} />}
    </div>
  )
}

export default function Caixa() {
  return (
    <>
      <PageHeader titulo="Financeiro" />
      <AbasFinanceiro />
      <SomenteDono><Conteudo /></SomenteDono>
    </>
  )
}
