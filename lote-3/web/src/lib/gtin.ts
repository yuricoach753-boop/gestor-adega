/**
 * Código de barras (GTIN/EAN): conferência do dígito e consulta em base de produtos.
 *
 * A consulta tenta, nesta ordem:
 *  1. Função "consulta-gtin" no Supabase (se estiver publicada) — usa a base Cosmos (Bluesoft), que é brasileira
 *     e traz NCM; o token fica guardado no servidor.
 *  2. Open Food Facts (base aberta e gratuita, direto do navegador) — boa para bebidas e alimentos de marcas grandes.
 * Se nenhuma achar, devolve null (o usuário digita o nome).
 */
import { supabase } from './supabase'

export interface DadosGtin {
  gtin: string
  nome: string
  marca?: string | null
  ncm?: string | null
  imagem?: string | null
  fonte: 'cosmos' | 'openfoodfacts'
}

/** Confere o dígito verificador de EAN-8, UPC-A (12), EAN-13 e GTIN-14. */
export function gtinValido(codigo: string): boolean {
  const d = codigo.replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(d.length)) return false
  const nums = d.split('').map(Number)
  const verificador = nums.pop()!
  const soma = nums.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === verificador
}

/** Códigos que vale a pena consultar fora (balança e códigos internos começam com 2 e não estão em base nenhuma). */
export function consultavel(codigo: string) {
  const d = codigo.replace(/\D/g, '')
  return gtinValido(d) && !(d.length === 13 && d.startsWith('2'))
}

const cache = new Map<string, DadosGtin | null>()
let funcaoDisponivel: boolean | null = null

function montarNome(nome: string, marca?: string | null, quantidade?: string | null) {
  let n = nome.trim()
  if (marca) {
    const m = marca.split(',')[0].trim()
    if (m && !n.toLowerCase().includes(m.toLowerCase())) n = `${m} ${n}`
  }
  if (quantidade && !n.toLowerCase().includes(quantidade.toLowerCase().replace(/\s/g, ''))
      && !n.toLowerCase().includes(quantidade.toLowerCase())) n = `${n} ${quantidade}`
  return n.replace(/\s+/g, ' ').slice(0, 120)
}

async function viaFuncao(gtin: string): Promise<DadosGtin | null | undefined> {
  if (funcaoDisponivel === false) return undefined
  try {
    const { data, error } = await supabase.functions.invoke('consulta-gtin', { body: { gtin } })
    if (error) { funcaoDisponivel = false; return undefined }
    funcaoDisponivel = true
    return (data && data.nome) ? (data as DadosGtin) : null
  } catch {
    funcaoDisponivel = false
    return undefined
  }
}

async function viaOpenFoodFacts(gtin: string): Promise<DadosGtin | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${gtin}.json?fields=code,product_name,product_name_pt,generic_name_pt,brands,quantity,image_front_small_url`, { signal: ctrl.signal })
    if (!r.ok) return null
    const j = await r.json()
    const p = j?.product
    const nome = p?.product_name_pt || p?.product_name || p?.generic_name_pt
    if (j?.status !== 1 || !nome) return null
    return { gtin, nome: montarNome(nome, p.brands, p.quantity), marca: p.brands ?? null, imagem: p.image_front_small_url ?? null, fonte: 'openfoodfacts' }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** Procura nome (e NCM, quando a base tem) pelo código de barras. */
export async function buscarPorGtin(codigo: string): Promise<DadosGtin | null> {
  const gtin = codigo.replace(/\D/g, '')
  if (!consultavel(gtin)) return null
  if (cache.has(gtin)) return cache.get(gtin)!
  let r = await viaFuncao(gtin)
  if (r === undefined || r === null) r = (await viaOpenFoodFacts(gtin)) ?? null
  cache.set(gtin, r)
  return r
}

/** Para listas grandes: espera entre consultas para não ser bloqueado pela base aberta (≈15 por minuto). */
export const PAUSA_ENTRE_CONSULTAS_MS = 4200
