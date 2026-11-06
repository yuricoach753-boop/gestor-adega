import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, SlidersHorizontal } from 'lucide-react'
import { formatarDataHora, formatarMoeda, formatarNumero } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOME_MOV, type Movimentacao } from '@/types'

export function ItemMovimentacao({ m, mostrarProduto, linkCompra }: { m: Movimentacao; mostrarProduto?: boolean; linkCompra?: boolean }) {
  const entrada = m.quantidade > 0
  const Icone = m.tipo === 'ajuste' ? SlidersHorizontal : entrada ? ArrowDownLeft : ArrowUpRight
  const titulo = m.origem_tipo === 'cadastro' ? 'Estoque inicial' : NOME_MOV[m.tipo]

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
        entrada ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>
        <Icone className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {mostrarProduto && (
          <Link to={`/produtos/${m.produto_id}`} className="block truncate font-medium hover:underline">{m.produto_nome}</Link>
        )}
        <p className={cn('text-sm', !mostrarProduto && 'font-medium')}>
          {titulo}
          {linkCompra && m.origem_tipo === 'compra' && m.origem_id && (
            <> · <Link to={`/compras/${m.origem_id}`} className="text-primary hover:underline">ver compra</Link></>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatarDataHora(m.created_at)}{m.criado_por_nome ? ` · ${m.criado_por_nome}` : ''}
          {m.custo_unitario !== null && m.tipo === 'compra' ? ` · custo ${formatarMoeda(m.custo_unitario)}` : ''}
        </p>
        {m.observacao && <p className="mt-0.5 text-xs text-muted-foreground italic">{m.observacao}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('font-semibold tabular', entrada ? 'text-primary' : 'text-destructive')}>
          {entrada ? '+' : '−'}{formatarNumero(Math.abs(m.quantidade))}
        </p>
        <p className="text-xs text-muted-foreground tabular">fica {formatarNumero(m.estoque_posterior)}</p>
      </div>
    </li>
  )
}
