import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { semAcento, termoBusca } from './format'
import type { Categoria, Produto } from '@/types'

/** Filtro "nome OU código OU código de barras" para o PostgREST. */
export function filtroProduto(termo: string) {
  const t = termoBusca(termo)
  // nome_busca = nome em minúsculas e sem acento (coluna gerada no banco): "agua" acha "Água"
  return `nome_busca.ilike.%${semAcento(t)}%,codigo.ilike.%${t}%,codigo_barras.eq.${t.replace(/%/g, '')}`
}

export async function buscarProdutos(empresaId: string, opcoes: {
  termo?: string
  categoriaId?: string
  soEstoqueBaixo?: boolean
  incluirInativos?: boolean
  limite?: number
} = {}) {
  let q = supabase.from('v_produtos').select('*').eq('empresa_id', empresaId)
  if (!opcoes.incluirInativos) q = q.eq('ativo', true)
  if (opcoes.categoriaId) q = q.eq('categoria_id', opcoes.categoriaId)
  if (opcoes.soEstoqueBaixo) q = q.eq('estoque_baixo', true)
  if (opcoes.termo?.trim()) q = q.or(filtroProduto(opcoes.termo))
  const { data, error } = await q.order('nome').limit(opcoes.limite ?? 300)
  if (error) throw error
  return data as Produto[]
}

/**
 * Procura UM produto ativo pelo código de barras ou código interno exato.
 * Usado quando o leitor "digita" o código e aperta Enter.
 */
export async function produtoPorCodigo(empresaId: string, codigo: string) {
  const c = codigo.trim()
  if (!c) return null
  const { data, error } = await supabase.from('v_produtos').select('*')
    .eq('empresa_id', empresaId).eq('ativo', true).eq('codigo_barras', c).limit(1)
  if (error) throw error
  if (data?.length) return data[0] as Produto
  const r = await supabase.from('v_produtos').select('*')
    .eq('empresa_id', empresaId).eq('ativo', true).ilike('codigo', c.replace(/[%_\\]/g, '\\$&')).limit(1)
  if (r.error) throw r.error
  return (r.data?.[0] as Produto | undefined) ?? null
}

export function useCategorias(empresaId: string | undefined, tipo: Categoria['tipo']) {
  return useQuery({
    queryKey: ['categorias', empresaId, tipo],
    enabled: !!empresaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias').select('*').eq('empresa_id', empresaId!).eq('tipo', tipo).eq('ativo', true).order('nome')
      if (error) throw error
      return data as Categoria[]
    },
  })
}
