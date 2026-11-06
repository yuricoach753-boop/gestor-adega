import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { BadgeSituacao } from '@/components/BadgeSituacao'
import { BotaoCobrar } from '@/components/BotaoCobrar'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { formatarData, formatarMoeda } from '@/lib/format'
import type { Cliente } from '@/types'
import NaoEncontrada from '@/pages/NaoEncontrada'
import { CabecalhoPessoa, Resumo } from '@/pages/pessoas/DetalhePessoa'

const STATUS_VENDA = { aberto: 'Aberto', separado: 'Separado', entregue: 'Entregue', cancelado: 'Cancelado' } as const

export default function ClienteDetalhe() {
  const { id } = useParams()
  const { ehDono } = useEmpresa()

  const cliente = useQuery({
    queryKey: ['clientes', 'detalhe', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_clientes_resumo').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Cliente | null
    },
  })

  const vendas = useQuery({
    queryKey: ['vendas', 'cliente', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendas').select('id, numero, data_venda, total, status')
        .eq('cliente_id', id!).order('data_venda', { ascending: false }).limit(30)
      if (error) throw error
      return data as Array<{ id: string; numero: number; data_venda: string; total: number; status: keyof typeof STATUS_VENDA }>
    },
  })

  const contas = useQuery({
    queryKey: ['contas-receber', 'cliente', id],
    enabled: ehDono,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_contas_receber').select('id, descricao, saldo, vencimento, situacao, dias_atraso')
        .eq('cliente_id', id!).in('status', ['aberta', 'parcial']).order('vencimento')
      if (error) throw error
      return data as Array<{ id: string; descricao: string; saldo: number; vencimento: string; situacao: 'a_vencer' | 'vence_hoje' | 'atrasada'; dias_atraso: number }>
    },
  })

  if (cliente.isLoading) return <ListaCarregando linhas={4} />
  if (cliente.error) return <ErroLista erro={cliente.error} tentarDeNovo={() => cliente.refetch()} />
  const c = cliente.data
  if (!c) return <NaoEncontrada />

  return (
    <CabecalhoPessoa
      tipo="cliente"
      pessoa={c}
      extra={
        <Resumo itens={[
          { rotulo: 'Total comprado', valor: formatarMoeda(c.total_comprado) },
          { rotulo: 'Compras', valor: c.qtd_compras },
          { rotulo: 'Última compra', valor: c.ultima_compra ? formatarData(c.ultima_compra) : '—' },
          ...(ehDono ? [{ rotulo: 'Está devendo', valor: formatarMoeda(c.valor_devido), destaque: (c.valor_devido ?? 0) > 0 ? 'perigo' as const : undefined }] : []),
        ]} />
      }
    >
      {ehDono && (
        <Card className="gap-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Contas em aberto</CardTitle>
            {!!contas.data?.length && (
              <BotaoCobrar cliente={c.nome} telefone={c.telefone} compacto
                valor={contas.data.reduce((s, x) => s + Number(x.saldo), 0)} vencimento={contas.data[0].vencimento} />
            )}
          </CardHeader>
          {contas.isLoading ? <CardContent><ListaCarregando linhas={2} /></CardContent> : contas.data?.length ? (
            <ul className="divide-y">
              {contas.data.map((cr) => (
                <li key={cr.id}><Link to={`/financeiro/receber/${cr.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{cr.descricao}</p>
                    <p className="text-xs text-muted-foreground">Vence {formatarData(cr.vencimento)}{cr.dias_atraso > 0 ? ` · ${cr.dias_atraso} dias de atraso` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular">{formatarMoeda(cr.saldo)}</p>
                    <BadgeSituacao situacao={cr.situacao} />
                  </div>
                </Link></li>
              ))}
            </ul>
          ) : <CardContent><p className="text-sm text-muted-foreground">Nenhuma conta em aberto.</p></CardContent>}
        </Card>
      )}

      <Card className="gap-2">
        <CardHeader><CardTitle>Histórico de compras</CardTitle></CardHeader>
        {vendas.isLoading ? <CardContent><ListaCarregando linhas={2} /></CardContent> : vendas.error ? <CardContent><ErroLista erro={vendas.error} /></CardContent> :
          vendas.data?.length ? (
            <ul className="divide-y">
              {vendas.data.map((v) => (
                <li key={v.id}><Link to={`/vendas/${v.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Pedido nº {v.numero}</p>
                    <p className="text-xs text-muted-foreground">{formatarData(v.data_venda)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium tabular ${v.status === 'cancelado' ? 'line-through' : ''}`}>{formatarMoeda(v.total)}</p>
                    <Badge variant={v.status === 'cancelado' ? 'destructive' : 'secondary'}>{STATUS_VENDA[v.status]}</Badge>
                  </div>
                </Link></li>
              ))}
            </ul>
          ) : <CardContent><p className="text-sm text-muted-foreground">Nenhuma compra ainda. As vendas para este cliente vão aparecer aqui.</p></CardContent>}
      </Card>
    </CabecalhoPessoa>
  )
}
