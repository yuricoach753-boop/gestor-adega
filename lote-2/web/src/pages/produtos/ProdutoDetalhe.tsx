import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, History, MinusCircle, Pencil, SlidersHorizontal, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { Confirmar } from '@/components/Confirmar'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarMoeda, formatarNumero, formatarQuantidade } from '@/lib/format'
import { UNIDADES, type Movimentacao, type Produto } from '@/types'
import { ItemMovimentacao } from './ItemMovimentacao'
import { MovimentarEstoque, type TipoManual } from './MovimentarEstoque'
import NaoEncontrada from '@/pages/NaoEncontrada'

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  )
}

export default function ProdutoDetalhe() {
  const { id } = useParams()
  const { ehDono } = useEmpresa()
  const qc = useQueryClient()
  const [mov, setMov] = useState<TipoManual | null>(null)
  const [confirmarInativar, setConfirmarInativar] = useState(false)

  const produto = useQuery({
    queryKey: ['produto', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_produtos').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Produto | null
    },
  })

  const movs = useQuery({
    queryKey: ['movimentacoes', 'produto', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_movimentacoes_estoque').select('*').eq('produto_id', id!)
        .order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data as Movimentacao[]
    },
  })

  if (produto.isLoading) return <ListaCarregando linhas={4} />
  if (produto.error) return <ErroLista erro={produto.error} tentarDeNovo={() => produto.refetch()} />
  const p = produto.data
  if (!p) return <NaoEncontrada />

  async function alternarAtivo() {
    const { error } = await supabase.from('produtos').update({ ativo: !p!.ativo }).eq('id', p!.id)
    if (error) return toast.error(mensagemErro(error))
    toast.success(p!.ativo ? 'Produto inativado. Ele não aparece mais nas buscas.' : 'Produto reativado!')
    qc.invalidateQueries({ queryKey: ['produto', id] })
    qc.invalidateQueries({ queryKey: ['produtos'] })
  }

  return (
    <>
      <PageHeader
        titulo={p.nome}
        descricao={[p.codigo, p.categoria_nome].filter(Boolean).join(' · ') || undefined}
        voltarPara="/produtos"
        acoes={ehDono && <Button asChild variant="outline"><Link to={`/produtos/${p.id}/editar`}><Pencil /> <span className="hidden sm:inline">Editar</span></Link></Button>}
      />

      {!p.ativo && (
        <div className="mb-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Este produto está <strong>inativo</strong>: não aparece nas buscas nem na venda.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Estoque</CardTitle>
              {p.estoque_atual <= 0 ? <Badge variant="destructive">Sem estoque</Badge>
                : p.estoque_baixo ? <Badge variant="warning">Estoque baixo</Badge> : <Badge>Normal</Badge>}
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular">{formatarQuantidade(p.estoque_atual, p.unidade)}</p>
              <p className="text-sm text-muted-foreground">
                {p.estoque_minimo > 0 ? `Aviso quando chegar a ${formatarQuantidade(p.estoque_minimo, p.unidade)}` : 'Sem aviso de estoque mínimo'}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {ehDono && (
                  <Button asChild className="sm:col-span-2"><Link to={`/compras/nova?produto=${p.id}`}><Truck /> Registrar compra (entrada)</Link></Button>
                )}
                <Button variant="outline" onClick={() => setMov('perda')}><MinusCircle /> Perda ou uso</Button>
                <Button variant="outline" onClick={() => setMov('ajuste')}><SlidersHorizontal /> Ajustar contagem</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Preço</CardTitle></CardHeader>
            <CardContent className="divide-y">
              <Linha rotulo="Preço de venda" valor={<span className="text-base">{formatarMoeda(p.preco_venda)}</span>} />
              {ehDono && p.preco_custo !== null && (
                <>
                  <Linha rotulo="Preço de custo" valor={formatarMoeda(p.preco_custo)} />
                  <Linha rotulo="Lucro por unidade" valor={formatarMoeda(p.preco_venda - p.preco_custo)} />
                  <Linha rotulo="Margem" valor={p.margem_percentual === null ? '—' : `${formatarNumero(p.margem_percentual)}%`} />
                </>
              )}
              <Linha rotulo="Vendido por" valor={UNIDADES.find((u) => u.valor === p.unidade)?.rotulo} />
              {p.codigo_barras && <Linha rotulo="Código de barras" valor={p.codigo_barras} />}
              {p.observacoes && <Linha rotulo="Observações" valor={p.observacoes} />}
            </CardContent>
          </Card>

          {ehDono && (
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => (p.ativo ? setConfirmarInativar(true) : alternarAtivo())}>
              {p.ativo ? <><Archive /> Inativar produto</> : <><ArchiveRestore /> Reativar produto</>}
            </Button>
          )}
        </div>

        <Card className="gap-2 self-start">
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> Histórico do estoque</CardTitle></CardHeader>
          {movs.isLoading ? <CardContent><ListaCarregando linhas={3} /></CardContent> : movs.data?.length ? (
            <ul className="divide-y">
              {movs.data.map((m) => <ItemMovimentacao key={m.id} m={m} linkCompra={ehDono} />)}
            </ul>
          ) : (
            <CardContent><p className="py-6 text-center text-sm text-muted-foreground">Nenhuma movimentação ainda.</p></CardContent>
          )}
        </Card>
      </div>

      {mov && <MovimentarEstoque produto={p} tipoInicial={mov} aberto={!!mov} onAberto={(v) => !v && setMov(null)} />}

      <Confirmar
        aberto={confirmarInativar}
        onAberto={setConfirmarInativar}
        titulo="Inativar produto?"
        descricao="Ele some das buscas e da tela de venda, mas o histórico continua guardado. Você pode reativar quando quiser."
        textoConfirmar="Inativar"
        onConfirmar={alternarAtivo}
      />
    </>
  )
}
