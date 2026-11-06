import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { supabase } from '@/lib/supabase'
import type { Fornecedor, Pessoa } from '@/types'
import NaoEncontrada from '@/pages/NaoEncontrada'
import { PessoaForm, ROTA, type TipoPessoa } from './PessoaForm'

export default function PessoaEditar({ tipo }: { tipo: TipoPessoa }) {
  const { id } = useParams()
  const titulo = tipo === 'cliente' ? 'cliente' : 'fornecedor'

  const pessoa = useQuery({
    enabled: !!id,
    queryKey: [tipo === 'cliente' ? 'clientes' : 'fornecedores', 'editar', id],
    queryFn: async () => {
      const { data, error } = await supabase.from(tipo === 'cliente' ? 'clientes' : 'fornecedores').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as (Pessoa & Partial<Pick<Fornecedor, 'contato_nome'>>) | null
    },
  })

  if (!id) {
    return (
      <>
        <PageHeader titulo={`Novo ${titulo}`} voltarPara={ROTA[tipo]} />
        <PessoaForm tipo={tipo} />
      </>
    )
  }
  if (pessoa.isLoading) return <ListaCarregando linhas={3} />
  if (pessoa.error) return <ErroLista erro={pessoa.error} />
  if (!pessoa.data) return <NaoEncontrada />
  return (
    <>
      <PageHeader titulo={`Editar ${titulo}`} voltarPara={`${ROTA[tipo]}/${id}`} />
      <PessoaForm key={id} tipo={tipo} pessoa={pessoa.data} />
    </>
  )
}
