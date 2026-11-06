// Supabase Edge Function: consulta-gtin
// Procura o produto pelo código de barras na base Cosmos (Bluesoft), que é brasileira e traz NCM.
// O token fica só aqui no servidor: Project Settings → Edge Functions → Secrets → COSMOS_TOKEN.
// Sem token (ou se a Cosmos não achar), responde { nome: null } e o site tenta a base aberta (Open Food Facts).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { gtin } = await req.json().catch(() => ({}))
    const codigo = String(gtin ?? '').replace(/\D/g, '')
    if (![8, 12, 13, 14].includes(codigo.length)) return json({ nome: null, erro: 'Código inválido' }, 400)
    const token = Deno.env.get('COSMOS_TOKEN')
    if (!token) return json({ nome: null, erro: 'Sem token da Cosmos' })
    const r = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${codigo}.json`, {
      headers: { 'X-Cosmos-Token': token, 'User-Agent': 'Cosmos-API-Request', 'Content-Type': 'application/json' },
    })
    if (r.status === 404) return json({ nome: null })
    if (r.status === 429) return json({ nome: null, erro: 'Limite de consultas da Cosmos atingido' })
    if (!r.ok) return json({ nome: null, erro: `Cosmos respondeu ${r.status}` })
    const p = await r.json()
    return json({
      gtin: codigo,
      nome: String(p.description ?? '').trim().slice(0, 120) || null,
      marca: p.brand?.name ?? null,
      ncm: p.ncm?.code ?? null,
      imagem: p.thumbnail ?? null,
      fonte: 'cosmos',
    })
  } catch (e) {
    return json({ nome: null, erro: String(e) }, 500)
  }
})
