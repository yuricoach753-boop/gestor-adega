import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownUp, Banknote, Boxes, ClipboardCheck, PackageX, PackagePlus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/PageHeader'
import { CampoBusca } from '@/components/CampoBusca'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { buscarProdutos, useCategorias } from '@/lib/consultas'
import { formatarMoeda, formatarQuantidade, hojeISO, semAcento } from '@/lib/format'
import { nomeArquivo } from '@/lib/exportar'
import { cn } from '@/lib/utils'
import type { Produto } from '@/types'
import { Exportar } from '@/pages/relatorios/comum'
import { AbasEstoque } from './AbasEstoque'
import { MovimentarEstoque } from './MovimentarEstoque'

type Filtro = 'todos' | 'baixo' | 'sem' | 'negativo'
type Ordem = 'nome' | 'menor' | 'maior'

const situacao = (p: Produto): Exclude<Filtro, 'todos'> | 'ok' =>
  p.estoque_atual < 0 ? 'negativo' : p.estoque_atual === 0 ? 'sem' : p.estoque_baixo ? 'baixo' : 'ok'

const COR: Record<ReturnType<typeof situacao>, string> = {
  ok: 'bg-primary',
  baixo: 'bg-amber-500',
  sem: 'bg-destructive',
  negativo: 'bg-destructive',
}

function Resumo({ titulo, valor, detalhe, icone: Icone, ativo, onClick, tom }: {
  titulo: string; valor: string; detalhe?: string; icone: typeof Boxes; ativo?: boolean; onClick?: () => void; tom?: 'alerta' | 'perigo'
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cn('rounded-xl border bg-card p-3 text-left transition-colors sm:p-4', onClick && 'hover:bg-muted',
        ativo && 'border-primary ring-2 ring-primary/20')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <Icone className={cn('size-4', tom === 'alerta' && 'text-amber-600', tom === 'perigo' && 'text-destructive')} /> {titulo}
      </div>
      <p className="mt-1 text-xl font-semibold tabular sm:text-2xl">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </Tag>
  )
}

/** Visão do estoque: o que tem, o que está acabando, o que zerou e (para o dono) quanto vale. */
export default function Estoque() {
  const { empresa, ehDono } = useEmpresa()
  const navigate = useNavigate()
  const [termo, setTermo] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [categoriaId, setCategoriaId] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')
  const [contando, setContando] = useState<Produto | null>(null)
  const categorias = useCategorias(empresa?.id, 'produto')

  const lista = useQuery({
    queryKey: ['produtos', empresa?.id, 'estoque'],
    queryFn: () => buscarProdutos(empresa!.id, { limite: 2000 }),
  })
  const todos = useMemo(() => lista.data ?? [], [lista.data])

  const resumo = useMemo(() => {
    let comEstoque = 0, baixo = 0, sem = 0, negativo = 0, custo = 0, venda = 0
    for (const p of todos) {
      const s = situacao(p)
      if (p.estoque_atual > 0) comEstoque++
      if (s === 'baixo') baixo++
      if (s === 'sem') sem++
      if (s === 'negativo') negativo++
      const q = Math.max(p.estoque_atual, 0)
      custo += q * (p.preco_custo ?? 0)
      venda += q * p.preco_venda
    }
    return { comEstoque, baixo, sem, negativo, custo, venda }
  }, [todos])

  const visiveis = useMemo(() => {
    const t = semAcento(termo.trim())
    const r = todos.filter((p) =>
      (filtro === 'todos' || situacao(p) === filtro || (filtro === 'sem' && situacao(p) === 'negativo')) &&
      (!categoriaId || p.categoria_id === categoriaId) &&
      (!t || semAcento(p.nome).includes(t) || (p.codigo ?? '').toLowerCase().includes(t) || (p.codigo_barras ?? '').includes(t)))
    if (ordem === 'menor') r.sort((a, b) => a.estoque_atual - b.estoque_atual)
    else if (ordem === 'maior') r.sort((a, b) => b.estoque_atual - a.estoque_atual)
    return r
  }, [todos, filtro, categoriaId, termo, ordem])

  const relatorio = () => ({
    titulo: 'Estoque',
    subtitulo: `Posição em ${hojeISO().split('-').reverse().join('/')}`,
    empresa: empresa!.nome_fantasia,
    arquivo: nomeArquivo('estoque', hojeISO()),
    linhas: visiveis,
    colunas: [
      { titulo: 'Produto', valor: (p: Produto) => p.nome, largura: 40 },
      { titulo: 'Código', valor: (p: Produto) => p.codigo ?? '' },
      { titulo: 'Categoria', valor: (p: Produto) => p.categoria_nome ?? '' },
      { titulo: 'Unidade', valor: (p: Produto) => p.unidade },
      { titulo: 'Em estoque', valor: (p: Produto) => p.estoque_atual, tipo: 'numero' as const },
      { titulo: 'Mínimo', valor: (p: Produto) => p.estoque_minimo, tipo: 'numero' as const },
      { titulo: 'Situação', valor: (p: Produto) => ({ ok: 'Ok', baixo: 'Baixo', sem: 'Sem estoque', negativo: 'Negativo' })[situacao(p)] },
      ...(ehDono ? [
        { titulo: 'Custo un.', valor: (p: Produto) => p.preco_custo, tipo: 'moeda' as const },
        { titulo: 'Valor em estoque (custo)', valor: (p: Produto) => Math.max(p.estoque_atual, 0) * (p.preco_custo ?? 0), tipo: 'moeda' as const },
      ] : []),
    ],
  })

  const filtros: Array<{ v: Filtro; r: string; n?: number }> = [
    { v: 'todos', r: 'Todos', n: todos.length },
    { v: 'baixo', r: 'Estoque baixo', n: resumo.baixo },
    { v: 'sem', r: 'Sem estoque', n: resumo.sem + resumo.negativo },
    ...(resumo.negativo ? [{ v: 'negativo' as Filtro, r: 'Negativo', n: resumo.negativo }] : []),
  ]

  return (
    <>
      <PageHeader
        titulo="Estoque"
        descricao="O que tem na prateleira agora, o que está acabando e o que zerou."
        acoes={ehDono && <Button asChild variant="outline" className="hidden sm:inline-flex"><Link to="/compras/nova"><PackagePlus /> Registrar compra</Link></Button>}
      />
      <AbasEstoque />

      {lista.isLoading ? <ListaCarregando /> : lista.error ? <ErroLista erro={lista.error} tentarDeNovo={() => lista.refetch()} /> :
        todos.length === 0 ? (
          <EmptyState icone={Boxes} titulo="Nenhum produto cadastrado"
            descricao={ehDono ? 'Cadastre os produtos para acompanhar o estoque aqui.' : 'O dono da empresa ainda não cadastrou produtos.'}
            acao={ehDono && <Button asChild size="lg"><Link to="/produtos/novo"><PackagePlus /> Cadastrar produto</Link></Button>} />
        ) : (
          <div className="space-y-4">
            <div className={cn('grid grid-cols-2 gap-2 sm:gap-3', ehDono ? 'lg:grid-cols-5' : 'lg:grid-cols-3')}>
              <Resumo titulo="Com estoque" valor={String(resumo.comEstoque)} detalhe={`de ${todos.length} produtos`} icone={Boxes}
                ativo={filtro === 'todos'} onClick={() => setFiltro('todos')} />
              <Resumo titulo="Estoque baixo" valor={String(resumo.baixo)} detalhe="abaixo do mínimo" icone={AlertTriangle} tom="alerta"
                ativo={filtro === 'baixo'} onClick={() => setFiltro('baixo')} />
              <Resumo titulo="Sem estoque" valor={String(resumo.sem + resumo.negativo)}
                detalhe={resumo.negativo ? `${resumo.negativo} negativo${resumo.negativo > 1 ? 's' : ''}` : 'zerados'} icone={PackageX} tom="perigo"
                ativo={filtro === 'sem'} onClick={() => setFiltro('sem')} />
              {ehDono && <Resumo titulo="Valor em estoque" valor={formatarMoeda(resumo.custo)} detalhe="pelo preço de custo" icone={Wallet} />}
              {ehDono && <Resumo titulo="Valor de venda" valor={formatarMoeda(resumo.venda)} detalhe="se vender tudo" icone={Banknote} />}
            </div>

            <CampoBusca valor={termo} onChange={setTermo} placeholder="Buscar por nome, código ou código de barras" />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {filtros.map((f) => (
                  <button key={f.v} type="button" onClick={() => setFiltro(f.v)}
                    className={cn('inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-medium',
                      filtro === f.v ? 'border-primary bg-accent text-accent-foreground' : 'bg-card hover:bg-muted')}>
                    {f.r} <span className="text-muted-foreground">({f.n ?? 0})</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-1 flex-wrap gap-2 sm:justify-end">
                <div className="min-w-36 flex-1 sm:max-w-52">
                  <NativeSelect value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="h-9 sm:h-9" aria-label="Categoria">
                    <option value="">Categoria: todas</option>
                    {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </NativeSelect>
                </div>
                <div className="min-w-36 flex-1 sm:max-w-52">
                  <NativeSelect value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="h-9 sm:h-9" aria-label="Ordenar">
                    <option value="nome">Ordem: nome</option>
                    <option value="menor">Menor quantidade primeiro</option>
                    <option value="maior">Maior quantidade primeiro</option>
                  </NativeSelect>
                </div>
              </div>
            </div>

            {visiveis.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum produto com esses filtros.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {visiveis.map((p) => {
                  const s = situacao(p)
                  const pctMin = p.estoque_minimo > 0 ? Math.min(Math.max(p.estoque_atual, 0) / (p.estoque_minimo * 2), 1) : null
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <button type="button" onClick={() => navigate(`/produtos/${p.id}`)} className="min-w-0 flex-1 text-left">
                        <p className="line-clamp-2 font-medium leading-snug [overflow-wrap:anywhere]">{p.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.categoria_nome, p.estoque_minimo > 0 ? `mínimo ${formatarQuantidade(p.estoque_minimo, p.unidade)}` : null,
                            ehDono && p.preco_custo ? `vale ${formatarMoeda(Math.max(p.estoque_atual, 0) * p.preco_custo)}` : null].filter(Boolean).join(' · ') || 'Sem categoria'}
                        </p>
                        {pctMin !== null && (
                          <div className="mt-1.5 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <div className={cn('h-full rounded-full', COR[s])} style={{ width: `${Math.max(pctMin * 100, s === 'ok' ? 4 : 2)}%` }} />
                          </div>
                        )}
                      </button>
                      <div className="shrink-0 text-right">
                        <p className={cn('text-lg font-semibold tabular', (s === 'sem' || s === 'negativo') && 'text-destructive', s === 'baixo' && 'text-amber-700')}>
                          {formatarQuantidade(p.estoque_atual, p.unidade)}
                        </p>
                        <p className={cn('text-xs', s === 'ok' ? 'text-muted-foreground' : 'font-medium',
                          s === 'baixo' && 'text-amber-700', (s === 'sem' || s === 'negativo') && 'text-destructive')}>
                          {{ ok: 'em estoque', baixo: 'acabando', sem: 'zerado', negativo: 'negativo — confira' }[s]}
                        </p>
                      </div>
                      <Button variant="outline" size="icon" onClick={() => setContando(p)} aria-label={`Contar ou dar baixa em ${p.nome}`} title="Contar / perda">
                        <ClipboardCheck />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {visiveis.length} {visiveis.length === 1 ? 'produto' : 'produtos'} ·{' '}
                <Link to="/produtos/movimentacoes" className="inline-flex items-center gap-1 text-primary hover:underline"><ArrowDownUp className="size-3" /> ver entradas e saídas</Link>
              </p>
              <Exportar relatorio={relatorio} desabilitado={!visiveis.length} />
            </div>
          </div>
        )}

      {contando && (
        <MovimentarEstoque produto={contando} tipoInicial="ajuste" aberto={!!contando}
          onAberto={(v) => { if (!v) { setContando(null); void lista.refetch() } }} />
      )}
    </>
  )
}
