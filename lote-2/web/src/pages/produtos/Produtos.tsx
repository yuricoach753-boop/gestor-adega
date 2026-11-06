import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, FileUp, Package, PackagePlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/PageHeader'
import { CampoBusca } from '@/components/CampoBusca'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { Fab } from '@/components/Fab'
import { Caixinha } from '@/components/Caixinha'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { useDebounce } from '@/hooks/useDebounce'
import { buscarProdutos, useCategorias } from '@/lib/consultas'
import { supabase } from '@/lib/supabase'
import { formatarMoeda, formatarNumero, formatarQuantidade } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Produto } from '@/types'
import { AbasEstoque } from './AbasEstoque'

function BadgeEstoque({ p }: { p: Produto }) {
  const texto = formatarQuantidade(p.estoque_atual, p.unidade)
  if (p.estoque_atual <= 0) return <Badge variant="destructive">{texto}</Badge>
  if (p.estoque_baixo) return <Badge variant="warning">{texto}</Badge>
  return <Badge variant="secondary">{texto}</Badge>
}

export default function Produtos() {
  const { empresa, ehDono } = useEmpresa()
  const navigate = useNavigate()
  const [termo, setTermo] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [soBaixo, setSoBaixo] = useState(false)
  const [inativos, setInativos] = useState(false)
  const busca = useDebounce(termo)
  const categorias = useCategorias(empresa?.id, 'produto')

  const filtrando = !!busca.trim() || !!categoriaId || soBaixo || inativos

  const lista = useQuery({
    queryKey: ['produtos', empresa?.id, busca, categoriaId, soBaixo, inativos],
    queryFn: () => buscarProdutos(empresa!.id, { termo: busca, categoriaId: categoriaId || undefined, soEstoqueBaixo: soBaixo, incluirInativos: inativos }),
    placeholderData: (anterior) => anterior,
  })

  const qtdBaixo = useQuery({
    queryKey: ['produtos-baixo', empresa?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from('v_produtos').select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id).eq('ativo', true).eq('estoque_baixo', true)
      if (error) throw error
      return count ?? 0
    },
  })

  const vazioTotal = !filtrando && lista.data?.length === 0

  return (
    <>
      <PageHeader
        titulo="Produtos e estoque"
        acoes={ehDono && (
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to="/produtos/importar"><FileUp /> <span className="hidden sm:inline">Importar planilha</span><span className="sm:hidden">Importar</span></Link></Button>
            <Button asChild className="hidden lg:inline-flex"><Link to="/produtos/novo"><Plus /> Novo produto</Link></Button>
          </div>
        )}
      />
      <AbasEstoque />

      {vazioTotal ? (
        <EmptyState
          icone={Package}
          titulo="Cadastre seu primeiro produto"
          descricao={ehDono
            ? 'Com os produtos cadastrados você vende mais rápido, sabe o que está acabando e quanto lucra em cada item.'
            : 'O dono da empresa ainda não cadastrou produtos.'}
          acao={ehDono && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="lg"><Link to="/produtos/novo"><PackagePlus /> Cadastrar produto</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/produtos/importar"><FileUp /> Importar de planilha</Link></Button>
            </div>
          )}
        />
      ) : (
        <div className="space-y-3">
          <CampoBusca valor={termo} onChange={setTermo} placeholder="Nome, código ou código de barras" />

          <div className="flex flex-wrap items-center gap-2">
            {!!qtdBaixo.data && (
              <button
                type="button"
                onClick={() => setSoBaixo((v) => !v)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
                  soBaixo ? 'border-amber-500 bg-warning/20 text-amber-900' : 'bg-card hover:bg-muted',
                )}
              >
                <AlertTriangle className="size-4 text-amber-600" />
                Estoque baixo ({qtdBaixo.data})
              </button>
            )}
            <div className="min-w-40 flex-1 sm:max-w-56">
              <NativeSelect value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="h-9 sm:h-9" aria-label="Categoria">
                <option value="">Categoria: todas</option>
                {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </NativeSelect>
            </div>
            {ehDono && <Caixinha checked={inativos} onChange={setInativos} rotulo="Mostrar inativos" />}
          </div>

          {lista.isLoading ? <ListaCarregando /> : lista.error ? <ErroLista erro={lista.error} tentarDeNovo={() => lista.refetch()} /> : (
            lista.data!.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado com esses filtros.</p>
            ) : (
              <>
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {lista.data!.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => navigate(`/produtos/${p.id}`)}
                        className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted', !p.ativo && 'opacity-60')}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="line-clamp-2 font-medium leading-snug">{p.nome}</p>
                            <p className="shrink-0 font-semibold tabular">{formatarMoeda(p.preco_venda)}</p>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {[p.codigo, p.categoria_nome, !p.ativo && 'Inativo'].filter(Boolean).join(' · ') || 'Sem categoria'}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <BadgeEstoque p={p} />
                            {ehDono && p.preco_custo !== null && (
                              <span className="text-xs text-muted-foreground tabular">
                                custo {formatarMoeda(p.preco_custo)}
                                {p.margem_percentual !== null && <> · margem <span className={cn(p.margem_percentual < 10 && 'font-medium text-destructive')}>{formatarNumero(p.margem_percentual)}%</span></>}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-center text-xs text-muted-foreground">{lista.data!.length} {lista.data!.length === 1 ? 'produto' : 'produtos'}</p>
              </>
            )
          )}
        </div>
      )}

      {ehDono && !vazioTotal && <Fab para="/produtos/novo" rotulo="Novo produto" icone={Plus} />}
    </>
  )
}
