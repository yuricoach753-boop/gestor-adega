import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Package } from 'lucide-react'
import { CampoBusca } from '@/components/CampoBusca'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { useDebounce } from '@/hooks/useDebounce'
import { buscarProdutos, produtoPorCodigo } from '@/lib/consultas'
import { formatarMoeda, formatarQuantidade } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Produto } from '@/types'

/**
 * Busca de produto por nome, código ou código de barras.
 * Leitor de código de barras funciona: ele "digita" o código e aperta Enter.
 * No Enter procuramos o código exato na hora (sem esperar a busca digitada),
 * porque o leitor é mais rápido que a pessoa.
 */
export function BuscaProduto({ onEscolher, mostrarCusto, placeholder = 'Buscar produto por nome ou código', autoFocus }: {
  onEscolher: (p: Produto) => void
  mostrarCusto?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const { empresa } = useEmpresa()
  const [termo, setTermo] = useState('')
  const [naoAchou, setNaoAchou] = useState<string | null>(null)
  const busca = useDebounce(termo, 250)

  const { data = [], isFetching } = useQuery({
    queryKey: ['busca-produto', empresa?.id, busca],
    enabled: !!empresa && busca.trim().length > 0,
    queryFn: () => buscarProdutos(empresa!.id, { termo: busca, limite: 8 }),
  })

  function escolher(p: Produto) {
    onEscolher(p)
    setTermo('')
    setNaoAchou(null)
  }

  async function aoEnter() {
    const t = termo.trim()
    if (!t || !empresa) return
    try {
      const exato = await produtoPorCodigo(empresa.id, t)
      if (exato) return escolher(exato)
    } catch { /* cai na lista abaixo */ }
    if (busca === termo && data.length > 0) return escolher(data[0])
    if (/^\d{6,}$/.test(t)) { setNaoAchou(t); setTermo('') }
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); void aoEnter() }
      }}
    >
      <CampoBusca valor={termo} onChange={(v) => { setTermo(v); setNaoAchou(null) }} placeholder={placeholder} autoFocus={autoFocus} />
      {naoAchou && (
        <p className="mt-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Nenhum produto com o código {naoAchou}.
        </p>
      )}
      {termo.trim() && (
        <div className="mt-1 overflow-hidden rounded-lg border bg-card shadow-sm">
          {isFetching && data.length === 0 && (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Buscando…</p>
          )}
          {!isFetching && busca === termo && data.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          )}
          {data.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => escolher(p)}
              className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted', i > 0 && 'border-t')}
            >
              <Package className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.codigo && `${p.codigo} · `}Estoque: {formatarQuantidade(p.estoque_atual, p.unidade)}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular">
                {formatarMoeda(mostrarCusto ? p.preco_custo : p.preco_venda)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
