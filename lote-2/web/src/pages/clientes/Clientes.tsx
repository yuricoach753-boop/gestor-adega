import { Users } from 'lucide-react'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { formatarMoeda } from '@/lib/format'
import type { Cliente } from '@/types'
import { ListaPessoas } from '@/pages/pessoas/ListaPessoas'

export default function Clientes() {
  const { ehDono } = useEmpresa()
  return (
    <ListaPessoas<Cliente>
      tipo="cliente"
      titulo="Clientes"
      icone={Users}
      vazioTitulo="Cadastre seu primeiro cliente"
      vazioTexto="Com os clientes cadastrados você vê o histórico de compras, quem compra mais e quem está devendo."
      ladoDireito={(c) => (
        <>
          <p className="text-sm font-medium tabular">{formatarMoeda(c.total_comprado)}</p>
          {ehDono && !!c.valor_devido && c.valor_devido > 0 ? (
            <p className="text-xs font-medium text-destructive tabular">deve {formatarMoeda(c.valor_devido)}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{c.qtd_compras} {c.qtd_compras === 1 ? 'compra' : 'compras'}</p>
          )}
        </>
      )}
    />
  )
}
