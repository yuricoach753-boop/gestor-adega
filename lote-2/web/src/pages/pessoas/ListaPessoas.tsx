import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Plus, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { CampoBusca } from '@/components/CampoBusca'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { Fab } from '@/components/Fab'
import { Caixinha } from '@/components/Caixinha'
import { BotaoWhatsApp } from '@/components/BotaoWhatsApp'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { useDebounce } from '@/hooks/useDebounce'
import { supabase } from '@/lib/supabase'
import { semAcento, soDigitos, termoBusca } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Pessoa } from '@/types'
import { ROTA, type TipoPessoa } from './PessoaForm'

const VIEW: Record<TipoPessoa, string> = { cliente: 'v_clientes_resumo', fornecedor: 'v_fornecedores_resumo' }

export function ListaPessoas<T extends Pessoa>({ tipo, titulo, icone, vazioTitulo, vazioTexto, ladoDireito, ordem = 'nome' }: {
  tipo: TipoPessoa
  titulo: string
  icone: LucideIcon
  vazioTitulo: string
  vazioTexto: string
  ladoDireito: (p: T) => ReactNode
  ordem?: string
}) {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const [termo, setTermo] = useState('')
  const [inativos, setInativos] = useState(false)
  const busca = useDebounce(termo)
  const rota = ROTA[tipo]
  const novo = tipo === 'cliente' ? 'Novo cliente' : 'Novo fornecedor'

  const lista = useQuery({
    queryKey: [tipo === 'cliente' ? 'clientes' : 'fornecedores', empresa?.id, busca, inativos],
    placeholderData: (a) => a,
    queryFn: async () => {
      let q = supabase.from(VIEW[tipo]).select('*').eq('empresa_id', empresa!.id)
      if (!inativos) q = q.eq('ativo', true)
      const t = busca.trim()
      if (t) {
        const dig = soDigitos(t)
        q = q.or(`nome_busca.ilike.%${semAcento(termoBusca(t))}%${dig.length >= 4 ? `,telefone.ilike.%${dig.slice(-4)}%` : ''}`)
      }
      const { data, error } = await q.order(ordem).limit(300)
      if (error) throw error
      return data as T[]
    },
  })

  const filtrando = !!busca.trim() || inativos
  const vazioTotal = !filtrando && lista.data?.length === 0

  return (
    <>
      <PageHeader titulo={titulo} acoes={<Button asChild className="hidden lg:inline-flex"><Link to={`${rota}/novo`}><Plus /> {novo}</Link></Button>} />
      {vazioTotal ? (
        <EmptyState icone={icone} titulo={vazioTitulo} descricao={vazioTexto}
          acao={<Button asChild size="lg"><Link to={`${rota}/novo`}><Plus /> {novo}</Link></Button>} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1"><CampoBusca valor={termo} onChange={setTermo} placeholder="Buscar por nome ou telefone" /></div>
            <Caixinha checked={inativos} onChange={setInativos} rotulo="Mostrar inativos" />
          </div>
          {lista.isLoading ? <ListaCarregando /> : lista.error ? <ErroLista erro={lista.error} tentarDeNovo={() => lista.refetch()} /> :
            lista.data!.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Ninguém encontrado com essa busca.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {lista.data!.map((p) => (
                  <li key={p.id} className={cn('flex items-center gap-2 pr-2', !p.ativo && 'opacity-60')}>
                    <button type="button" onClick={() => navigate(`${rota}/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-muted">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.telefone, p.bairro || p.cidade, !p.ativo && 'Inativo'].filter(Boolean).join(' · ') || 'Sem telefone'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">{ladoDireito(p)}</div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                    <BotaoWhatsApp telefone={p.telefone} compacto />
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
      {!vazioTotal && <Fab para={`${rota}/novo`} rotulo={novo} icone={Plus} />}
    </>
  )
}
