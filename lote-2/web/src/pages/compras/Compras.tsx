import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Plus, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { EmptyState } from '@/components/EmptyState'
import { Fab } from '@/components/Fab'
import { SomenteDono } from '@/components/Guards'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { formatarData, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Compra } from '@/types'
import { AbasEstoque } from '@/pages/produtos/AbasEstoque'

function Lista() {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const compras = useQuery({
    queryKey: ['compras', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_compras').select('*').eq('empresa_id', empresa!.id)
        .order('data_compra', { ascending: false }).order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data as Compra[]
    },
  })

  if (compras.isLoading) return <ListaCarregando />
  if (compras.error) return <ErroLista erro={compras.error} tentarDeNovo={() => compras.refetch()} />
  if (!compras.data!.length)
    return (
      <EmptyState icone={Truck} titulo="Nenhuma compra registrada"
        descricao="Registre aqui a mercadoria que chega do fornecedor. O estoque aumenta, o custo é atualizado e, se quiser, as contas a pagar já são criadas."
        acao={<Button asChild size="lg"><Link to="/compras/nova"><Plus /> Registrar compra</Link></Button>} />
    )

  return (
    <>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {compras.data!.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => navigate(`/compras/${c.id}`)}
              className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted', c.status === 'cancelada' && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.fornecedor_nome ?? 'Sem fornecedor'}</p>
                <p className="text-xs text-muted-foreground">
                  {formatarData(c.data_compra)}{c.numero_nota ? ` · NF ${c.numero_nota}` : ''} · {c.qtd_itens} {c.qtd_itens === 1 ? 'item' : 'itens'}
                </p>
              </div>
              <div className="text-right">
                <p className={cn('font-semibold tabular', c.status === 'cancelada' && 'line-through')}>{formatarMoeda(c.valor_total)}</p>
                {c.status === 'cancelada' && <Badge variant="destructive">Cancelada</Badge>}
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <Fab para="/compras/nova" rotulo="Nova compra" icone={Plus} />
    </>
  )
}

export default function Compras() {
  const { ehDono } = useEmpresa()
  return (
    <>
      <PageHeader titulo="Produtos e estoque"
        acoes={ehDono && <Button asChild className="hidden lg:inline-flex"><Link to="/compras/nova"><Plus /> Registrar compra</Link></Button>} />
      <AbasEstoque />
      <SomenteDono><Lista /></SomenteDono>
    </>
  )
}
