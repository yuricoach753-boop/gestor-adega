import { Abas } from '@/components/Abas'

export function AbasFinanceiro() {
  return (
    <Abas itens={[
      { rota: '/financeiro/receber', rotulo: 'A receber' },
      { rota: '/financeiro/pagar', rotulo: 'A pagar' },
      { rota: '/financeiro/caixa', rotulo: 'Caixa' },
    ]} />
  )
}
