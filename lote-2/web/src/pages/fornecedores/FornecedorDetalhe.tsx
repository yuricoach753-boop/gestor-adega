import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { BadgeSituacao } from '@/components/BadgeSituacao'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { formatarData, formatarMoeda } from '@/lib/format'
import type { Compra, ContaPagarResumo, Fornecedor } from '@/types'
import NaoEncontrada from '@/pages/NaoEncontrada'
import { CabecalhoPessoa, Resumo } from '@/pages/pessoas/DetalhePessoa'

export default function FornecedorDetalhe() {
  const { id } = useParams()
  const { ehDono } = useEmpresa()

  const forn = useQuery({
    queryKey: ['fornecedores', 'detalhe', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_fornecedores_resumo').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Fornecedor | null
    },
  })

  const extras = useQuery({
    queryKey: ['fornecedores', 'historico', id],
    enabled: ehDono,
    queryFn: async () => {
      const [compras, contas] = await Promise.all([
        supabase.from('v_compras').select('*').eq('fornecedor_id', id!).order('data_compra', { ascending: false }).limit(30),
        supabase.from('v_contas_pagar').select('id, descricao, valor, vencimento, status, situacao, parcela_numero, parcela_total, pago_em')
          .eq('fornecedor_id', id!).eq('status', 'aberta').order('vencimento'),
      ])
      if (compras.error) throw compras.error
      if (contas.error) throw contas.error
      return { compras: compras.data as Compra[], contas: contas.data as ContaPagarResumo[] }
    },
  })

  if (forn.isLoading) return <ListaCarregando linhas={4} />
  if (forn.error) return <ErroLista erro={forn.error} tentarDeNovo={() => forn.refetch()} />
  const f = forn.data
  if (!f) return <NaoEncontrada />

  return (
    <CabecalhoPessoa
      tipo="fornecedor"
      pessoa={f}
      extra={ehDono && (
        <Resumo itens={[
          { rotulo: 'Total comprado', valor: formatarMoeda(f.total_comprado) },
          { rotulo: 'Última compra', valor: f.ultima_compra ? formatarData(f.ultima_compra) : '—' },
          { rotulo: 'A pagar', valor: formatarMoeda(f.valor_em_aberto), destaque: f.valor_em_aberto > 0 ? 'aviso' : undefined },
        ]} />
      )}
    >
      {ehDono && (
        <>
          <Card className="gap-2">
            <CardHeader><CardTitle>Contas a pagar em aberto</CardTitle></CardHeader>
            {extras.isLoading ? <CardContent><ListaCarregando linhas={2} /></CardContent> : extras.data?.contas.length ? (
              <ul className="divide-y">
                {extras.data.contas.map((cp) => (
                  <li key={cp.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{cp.descricao}</p>
                      <p className="text-xs text-muted-foreground">Vence {formatarData(cp.vencimento)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular">{formatarMoeda(cp.valor)}</p>
                      <BadgeSituacao situacao={cp.situacao} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : <CardContent><p className="text-sm text-muted-foreground">Nada a pagar para este fornecedor.</p></CardContent>}
          </Card>

          <Card className="gap-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Compras</CardTitle>
              <Button asChild size="sm" variant="outline"><Link to={`/compras/nova?fornecedor=${f.id}`}><Truck /> Nova compra</Link></Button>
            </CardHeader>
            {extras.isLoading ? <CardContent><ListaCarregando linhas={2} /></CardContent> : extras.error ? <CardContent><ErroLista erro={extras.error} /></CardContent> :
              extras.data?.compras.length ? (
                <ul className="divide-y">
                  {extras.data.compras.map((c) => (
                    <li key={c.id}>
                      <Link to={`/compras/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{formatarData(c.data_compra)}{c.numero_nota ? ` · NF ${c.numero_nota}` : ''}</p>
                          <p className="text-xs text-muted-foreground">{c.qtd_itens} {c.qtd_itens === 1 ? 'item' : 'itens'}</p>
                        </div>
                        <p className={`text-sm font-medium tabular ${c.status === 'cancelada' ? 'line-through' : ''}`}>{formatarMoeda(c.valor_total)}</p>
                        {c.status === 'cancelada' && <Badge variant="destructive">Cancelada</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <CardContent><p className="text-sm text-muted-foreground">Nenhuma compra registrada deste fornecedor.</p></CardContent>}
          </Card>
        </>
      )}
    </CabecalhoPessoa>
  )
}
