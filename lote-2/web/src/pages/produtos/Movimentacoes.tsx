import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { EmptyState } from '@/components/EmptyState'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { NOME_MOV, type Movimentacao, type TipoMov } from '@/types'
import { AbasEstoque } from './AbasEstoque'
import { ItemMovimentacao } from './ItemMovimentacao'

export default function Movimentacoes() {
  const { empresa, ehDono } = useEmpresa()
  const [tipo, setTipo] = useState<TipoMov | ''>('')

  const movs = useQuery({
    queryKey: ['movimentacoes', empresa?.id, tipo],
    queryFn: async () => {
      let q = supabase.from('v_movimentacoes_estoque').select('*').eq('empresa_id', empresa!.id)
      if (tipo) q = q.eq('tipo', tipo)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data as Movimentacao[]
    },
    placeholderData: (a) => a,
  })

  return (
    <>
      <PageHeader titulo="Produtos e estoque" />
      <AbasEstoque />
      <div className="mb-3 sm:max-w-64">
        <NativeSelect value={tipo} onChange={(e) => setTipo(e.target.value as TipoMov | '')} aria-label="Tipo de movimentação">
          <option value="">Todas as movimentações</option>
          {(Object.keys(NOME_MOV) as TipoMov[]).map((t) => <option key={t} value={t}>{NOME_MOV[t]}</option>)}
        </NativeSelect>
      </div>
      {movs.isLoading ? <ListaCarregando /> : movs.error ? <ErroLista erro={movs.error} tentarDeNovo={() => movs.refetch()} /> :
        movs.data!.length === 0 ? (
          <EmptyState icone={History} titulo="Nenhuma movimentação" descricao="Entradas, vendas, perdas e ajustes de estoque aparecem aqui, com quem fez e quando." />
        ) : (
          <>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {movs.data!.map((m) => <ItemMovimentacao key={m.id} m={m} mostrarProduto linkCompra={ehDono} />)}
            </ul>
            {movs.data!.length === 100 && <p className="mt-2 text-center text-xs text-muted-foreground">Mostrando as 100 mais recentes.</p>}
          </>
        )}
    </>
  )
}
