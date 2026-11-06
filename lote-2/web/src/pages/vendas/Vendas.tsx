import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, PackageCheck, Plus, ScanBarcode, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/PageHeader'
import { CampoBusca } from '@/components/CampoBusca'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { Fab } from '@/components/Fab'
import { BadgeStatusVenda } from '@/components/BadgeStatusVenda'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { useAuth } from '@/contexts/AuthProvider'
import { useDebounce } from '@/hooks/useDebounce'
import { supabase } from '@/lib/supabase'
import { formatarData, formatarMoeda, hojeISO, semAcento, termoBusca } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOME_FORMA, NOME_STATUS_VENDA, type FormaPagamento, type StatusVenda, type Venda } from '@/types'

type Periodo = 'hoje' | '7' | '30' | 'tudo'
const PERIODOS: Array<{ valor: Periodo; rotulo: string }> = [
  { valor: 'hoje', rotulo: 'Hoje' }, { valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: 'tudo', rotulo: 'Tudo' },
]

function inicioPeriodo(p: Periodo) {
  if (p === 'tudo') return null
  const d = new Date(`${hojeISO()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (p === 'hoje' ? 0 : Number(p) - 1))
  return d.toISOString().slice(0, 10)
}

const hora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function LinhaVenda({ v }: { v: Venda }) {
  const navigate = useNavigate()
  return (
    <li>
      <button type="button" onClick={() => navigate(`/vendas/${v.id}`)}
        className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted', v.status === 'cancelado' && 'opacity-60')}>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            <span className="text-muted-foreground">nº {v.numero}</span> · {v.cliente_nome ?? 'Balcão'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {v.dia === hojeISO() ? hora(v.data_venda) : formatarData(v.data_venda)}
            {v.formas ? ` · ${v.formas.split(',').map((f) => NOME_FORMA[f as FormaPagamento]).join(' + ')}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn('font-semibold tabular', v.status === 'cancelado' && 'line-through')}>{formatarMoeda(v.total)}</span>
          <BadgeStatusVenda status={v.status} />
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

/**
 * Vendas do funcionário: só balcão, sem faturamento.
 * Mostra as vendas que ELE fez hoje e os pedidos que ainda precisam ser separados/entregues.
 * (O banco aplica a mesma regra: ele não recebe as outras vendas.)
 */
function VendasFuncionario() {
  const { empresa } = useEmpresa()
  const { user } = useAuth()
  const [aba, setAba] = useState<'minhas' | 'pedidos'>('minhas')

  const minhas = useQuery({
    queryKey: ['vendas', 'minhas', empresa?.id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_vendas').select('*').eq('empresa_id', empresa!.id)
        .eq('vendedor_id', user!.id).eq('dia', hojeISO()).order('data_venda', { ascending: false })
      if (error) throw error
      return data as Venda[]
    },
  })
  const pedidos = useQuery({
    queryKey: ['vendas', 'pedidos', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_vendas').select('*').eq('empresa_id', empresa!.id)
        .in('status', ['aberto', 'separado']).order('data_venda', { ascending: true })
      if (error) throw error
      return data as Venda[]
    },
  })
  const q = aba === 'minhas' ? minhas : pedidos
  const qtdPedidos = pedidos.data?.length ?? 0

  return (
    <>
      <PageHeader titulo="Vendas" acoes={<>
        <Button asChild variant="outline"><Link to="/consulta-preco"><ScanBarcode /> <span className="hidden sm:inline">Consultar preço</span></Link></Button>
        <Button asChild className="hidden lg:inline-flex"><Link to="/vendas/nova"><Plus /> Nova venda</Link></Button>
      </>} />
      <div className="space-y-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {([['minhas', 'Minhas vendas de hoje'], ['pedidos', `Pedidos para separar${qtdPedidos ? ` (${qtdPedidos})` : ''}`]] as const).map(([v, r]) => (
            <button key={v} type="button" onClick={() => setAba(v)}
              className={cn('flex-1 rounded-md px-3 py-2 text-sm font-medium', aba === v ? 'bg-card shadow-xs' : 'text-muted-foreground')}>
              {r}
            </button>
          ))}
        </div>
        {q.isLoading ? <ListaCarregando /> : q.error ? <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} /> :
          q.data!.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {aba === 'minhas' ? 'Você ainda não fez vendas hoje.' : 'Nenhum pedido esperando para separar ou entregar.'}
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {q.data!.map((v) => <LinhaVenda key={v.id} v={v} />)}
            </ul>
          )}
      </div>
      <Fab para="/vendas/nova" rotulo="Nova venda" icone={Plus} />
    </>
  )
}

export default function Vendas() {
  const { ehDono } = useEmpresa()
  return ehDono ? <VendasDono /> : <VendasFuncionario />
}

function VendasDono() {
  const { empresa } = useEmpresa()
  const [periodo, setPeriodo] = useState<Periodo>('hoje')
  const [status, setStatus] = useState<StatusVenda | 'pendentes' | ''>('')
  const [termo, setTermo] = useState('')
  const busca = useDebounce(termo)

  const vendas = useQuery({
    queryKey: ['vendas', empresa?.id, periodo, status, busca],
    placeholderData: (a) => a,
    queryFn: async () => {
      let q = supabase.from('v_vendas').select('*').eq('empresa_id', empresa!.id)
      const ini = inicioPeriodo(status === 'pendentes' ? 'tudo' : periodo)
      if (ini) q = q.gte('dia', ini)
      if (status === 'pendentes') q = q.in('status', ['aberto', 'separado'])
      else if (status) q = q.eq('status', status)
      const t = busca.trim()
      if (t) q = /^\d+$/.test(t) ? q.eq('numero', Number(t)) : q.ilike('cliente_busca', `%${semAcento(termoBusca(t))}%`)
      const { data, error } = await q.order('data_venda', { ascending: false }).limit(200)
      if (error) throw error
      return data as Venda[]
    },
  })

  const pendentes = useQuery({
    queryKey: ['vendas', 'pendentes', empresa?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from('vendas').select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id).in('status', ['aberto', 'separado'])
      if (error) throw error
      return count ?? 0
    },
  })

  const existe = useQuery({
    queryKey: ['vendas', 'existe', empresa?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from('vendas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa!.id)
      if (error) throw error
      return count ?? 0
    },
  })

  const validas = (vendas.data ?? []).filter((v) => v.status !== 'cancelado')
  const totalPeriodo = validas.reduce((s, v) => s + Number(v.total), 0)
  const semNada = existe.data === 0

  return (
    <>
      <PageHeader titulo="Vendas" acoes={<>
        <Button asChild variant="outline"><Link to="/consulta-preco"><ScanBarcode /> <span className="hidden sm:inline">Consultar preço</span></Link></Button>
        <Button asChild className="hidden lg:inline-flex"><Link to="/vendas/nova"><Plus /> Nova venda</Link></Button>
      </>} />

      <div className="space-y-3">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {PERIODOS.map((p) => (
            <button key={p.valor} type="button" onClick={() => { setPeriodo(p.valor); if (status === 'pendentes') setStatus('') }}
              className={cn('flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium',
                periodo === p.valor && status !== 'pendentes' ? 'bg-card shadow-xs' : 'text-muted-foreground')}>
              {p.rotulo}
            </button>
          ))}
        </div>

        {!!pendentes.data && (
          <button type="button" onClick={() => setStatus(status === 'pendentes' ? '' : 'pendentes')}
            className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left',
              status === 'pendentes' ? 'border-amber-500 bg-warning/15' : 'bg-card hover:bg-muted')}>
            <PackageCheck className="size-5 text-amber-600" />
            <span className="flex-1 text-sm"><strong>{pendentes.data}</strong> {pendentes.data === 1 ? 'pedido' : 'pedidos'} para separar ou entregar</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        )}

        {status !== 'pendentes' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Vendido {periodo === 'hoje' ? 'hoje' : periodo === 'tudo' ? 'no total' : `em ${periodo} dias`}</p>
              <p className="mt-0.5 text-xl font-semibold tabular">{formatarMoeda(totalPeriodo)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Vendas</p>
              <p className="mt-0.5 text-xl font-semibold tabular">{validas.length}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1"><CampoBusca valor={termo} onChange={setTermo} placeholder="Nº do pedido ou nome do cliente" /></div>
          {status !== 'pendentes' && (
            <div className="sm:w-52">
              <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as StatusVenda | '')} aria-label="Situação">
                <option value="">Todas as situações</option>
                {(Object.keys(NOME_STATUS_VENDA) as StatusVenda[]).map((s) => <option key={s} value={s}>{NOME_STATUS_VENDA[s]}</option>)}
              </NativeSelect>
            </div>
          )}
        </div>

        {vendas.isLoading ? <ListaCarregando /> : vendas.error ? <ErroLista erro={vendas.error} tentarDeNovo={() => vendas.refetch()} /> :
          semNada ? (
            <EmptyState icone={ShoppingCart} titulo="Faça sua primeira venda"
              descricao="Busque os produtos, escolha a forma de pagamento e pronto: o estoque e o caixa se atualizam sozinhos."
              acao={<Button asChild size="lg"><Link to="/vendas/nova"><Plus /> Nova venda</Link></Button>} />
          ) : vendas.data!.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {periodo === 'hoje' && !status && !busca ? 'Nenhuma venda hoje ainda.' : 'Nenhuma venda encontrada.'}
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {vendas.data!.map((v) => <LinhaVenda key={v.id} v={v} />)}
            </ul>
          )}
      </div>

      <Fab para="/vendas/nova" rotulo="Nova venda" icone={Plus} />
    </>
  )
}
