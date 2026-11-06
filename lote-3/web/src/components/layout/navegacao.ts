import { BarChart3, Boxes, Home, Package, ScanBarcode, Settings, ShoppingCart, Truck, Users, Wallet, type LucideIcon } from 'lucide-react'

export interface ItemNav {
  rota: string
  rotulo: string
  icone: LucideIcon
  soDono?: boolean
  /** aparece na barra inferior do celular */
  barra?: boolean
  /** outras rotas em que o item fica marcado */
  tambem?: string[]
}

export function itemAtivo(i: ItemNav, caminho: string) {
  if (i.rota === '/') return caminho === '/'
  return [i.rota, ...(i.tambem ?? [])].some((r) => caminho === r || caminho.startsWith(`${r}/`))
}

export const NAV: ItemNav[] = [
  { rota: '/', rotulo: 'Início', icone: Home, barra: true },
  { rota: '/vendas', rotulo: 'Vendas', icone: ShoppingCart, barra: true },
  { rota: '/consulta-preco', rotulo: 'Consultar preço', icone: ScanBarcode },
  { rota: '/produtos', rotulo: 'Produtos', icone: Package, barra: true, tambem: ['/compras'] },
  { rota: '/estoque', rotulo: 'Estoque', icone: Boxes },
  { rota: '/clientes', rotulo: 'Clientes', icone: Users, barra: true, soDono: true },
  { rota: '/fornecedores', rotulo: 'Fornecedores', icone: Truck, soDono: true },
  { rota: '/financeiro', rotulo: 'Financeiro', icone: Wallet, soDono: true },
  { rota: '/relatorios', rotulo: 'Relatórios', icone: BarChart3, soDono: true },
  { rota: '/configuracoes', rotulo: 'Configurações', icone: Settings, soDono: true },
]

/** Itens do menu para o papel: o funcionário só vê o que é de balcão. */
export function itensMenu(ehDono: boolean) {
  return NAV.filter((i) => !i.soDono || ehDono)
}

/** Barra inferior do celular (4 itens + "Mais"). Para o funcionário, "Consultar preço" entra no lugar de Clientes. */
export function itensBarra(ehDono: boolean) {
  return itensMenu(ehDono).filter((i) => i.barra || (!ehDono && i.rota === '/consulta-preco')).slice(0, 4)
}
