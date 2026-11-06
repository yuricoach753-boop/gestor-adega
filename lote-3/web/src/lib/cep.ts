import { soDigitos } from './format'

export interface EnderecoCep { logradouro: string; bairro: string; cidade: string; uf: string }

/** Busca o endereço pelo CEP no ViaCEP (serviço público e gratuito). */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = soDigitos(cep)
  if (d.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
    if (!r.ok) return null
    const j = await r.json()
    if (j.erro) return null
    return { logradouro: j.logradouro ?? '', bairro: j.bairro ?? '', cidade: j.localidade ?? '', uf: j.uf ?? '' }
  } catch {
    return null
  }
}
