import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserPlus, UserRound, X } from 'lucide-react'
import { CampoBusca } from '@/components/CampoBusca'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { useDebounce } from '@/hooks/useDebounce'
import { supabase } from '@/lib/supabase'
import { semAcento, soDigitos, termoBusca } from '@/lib/format'
import { PessoaRapida } from '@/pages/pessoas/PessoaRapida'

export interface ClienteEscolhido { id: string; nome: string; telefone: string | null }

/** Escolher cliente: busca por nome/telefone ou cadastra na hora. */
export function BuscaCliente({ valor, onChange }: { valor: ClienteEscolhido | null; onChange: (c: ClienteEscolhido | null) => void }) {
  const { empresa } = useEmpresa()
  const [termo, setTermo] = useState('')
  const [novo, setNovo] = useState(false)
  const busca = useDebounce(termo, 250)

  const { data = [] } = useQuery({
    queryKey: ['clientes', 'busca', empresa?.id, busca],
    enabled: !!empresa && busca.trim().length > 0,
    queryFn: async () => {
      const t = busca.trim()
      const dig = soDigitos(t)
      const { data, error } = await supabase.from('clientes').select('id, nome, telefone')
        .eq('empresa_id', empresa!.id).eq('ativo', true)
        .or(`nome_busca.ilike.%${semAcento(termoBusca(t))}%${dig.length >= 4 ? `,telefone.ilike.%${dig.slice(-4)}%` : ''}`)
        .order('nome').limit(6)
      if (error) throw error
      return data as ClienteEscolhido[]
    },
  })

  if (valor)
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-accent/50 px-3 py-2">
        <UserRound className="size-5 text-accent-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{valor.nome}</p>
          {valor.telefone && <p className="text-xs text-muted-foreground">{valor.telefone}</p>}
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Tirar cliente">
          <X className="size-4" />
        </button>
      </div>
    )

  return (
    <div>
      <CampoBusca valor={termo} onChange={setTermo} placeholder="Buscar cliente (opcional)" />
      {termo.trim() && (
        <div className="mt-1 overflow-hidden rounded-lg border bg-card shadow-sm">
          {busca === termo && data.map((c) => (
            <button key={c.id} type="button" onClick={() => { onChange(c); setTermo('') }}
              className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left hover:bg-muted">
              <UserRound className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate text-sm font-medium">{c.nome}</span>
              <span className="text-xs text-muted-foreground">{c.telefone}</span>
            </button>
          ))}
          {!(busca === termo && data.some((c) => semAcento(c.nome.trim()) === semAcento(termo.trim()))) && (
            <button type="button" onClick={() => setNovo(true)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-muted">
              <UserPlus className="size-4" /> Cadastrar "{termo.trim()}"
            </button>
          )}
        </div>
      )}
      {empresa && novo && (
        <PessoaRapida tipo="cliente" aberto={novo} onAberto={setNovo} empresaId={empresa.id} nomeInicial={/\d{4}/.test(termo) ? '' : termo.trim()}
          onCriado={(c) => { onChange(c); setTermo('') }} />
      )}
    </div>
  )
}
