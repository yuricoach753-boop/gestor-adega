import { supabase } from './supabase'
import { semAcento } from './format'

/** Procura cliente/fornecedor com o mesmo nome (sem acento, sem diferença de maiúscula). */
export async function nomeJaUsado(tabela: 'clientes' | 'fornecedores', empresaId: string, nome: string, ignorarId?: string) {
  let q = supabase.from(tabela).select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).eq('nome_busca', semAcento(nome.trim()))
  if (ignorarId) q = q.neq('id', ignorarId)
  const { data } = await q.limit(1)
  return (data?.[0] as { id: string; nome: string } | undefined) ?? null
}
