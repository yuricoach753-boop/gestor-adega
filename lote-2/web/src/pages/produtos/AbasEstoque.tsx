import { Abas } from '@/components/Abas'
import { useEmpresa } from '@/contexts/EmpresaProvider'

export function AbasEstoque() {
  const { ehDono } = useEmpresa()
  return (
    <Abas
      itens={[
        { rota: '/produtos', rotulo: 'Produtos', end: true },
        { rota: '/estoque', rotulo: 'Estoque' },
        { rota: '/produtos/movimentacoes', rotulo: 'Movimentações' },
        ...(ehDono ? [{ rota: '/compras', rotulo: 'Compras' }] : []),
      ]}
    />
  )
}
