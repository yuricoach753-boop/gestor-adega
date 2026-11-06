import { Truck } from 'lucide-react'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { formatarMoeda } from '@/lib/format'
import type { Fornecedor } from '@/types'
import { ListaPessoas } from '@/pages/pessoas/ListaPessoas'

export default function Fornecedores() {
  const { ehDono } = useEmpresa()
  return (
    <ListaPessoas<Fornecedor>
      tipo="fornecedor"
      titulo="Fornecedores"
      icone={Truck}
      vazioTitulo="Cadastre seu primeiro fornecedor"
      vazioTexto="Guarde o contato de quem te vende mercadoria e veja as compras e contas de cada um."
      ladoDireito={(f) => ehDono ? (
        f.valor_em_aberto > 0
          ? <p className="text-xs font-medium text-amber-700 tabular">a pagar {formatarMoeda(f.valor_em_aberto)}</p>
          : <p className="text-xs text-muted-foreground tabular">{formatarMoeda(f.total_comprado)} comprados</p>
      ) : f.contato_nome ? <p className="text-xs text-muted-foreground">{f.contato_nome}</p> : null}
    />
  )
}
