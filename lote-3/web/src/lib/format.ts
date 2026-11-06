/** Formatação padrão Brasil: R$ 1.234,56 · dd/mm/aaaa · fuso America/Sao_Paulo */

export const FUSO = 'America/Sao_Paulo'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

export function formatarMoeda(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? Number(valor) : valor
  return moeda.format(Number.isFinite(n) ? (n as number) : 0)
}

export function formatarNumero(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? Number(valor) : valor
  return numero.format(Number.isFinite(n) ? (n as number) : 0)
}

/** Aceita "2026-10-09" (date do banco) ou ISO com hora (timestamptz). */
export function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return ''
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-')
    return `${d}/${m}/${a}`
  }
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return String(valor)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export function formatarDataHora(valor: string | Date | null | undefined): string {
  if (!valor) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(valor))
}

/** Data de hoje em São Paulo no formato do banco (aaaa-mm-dd). */
export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date())
}

export function diasEntre(deISO: string, ateISO: string): number {
  const um = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10))
  const dois = Date.UTC(+ateISO.slice(0, 4), +ateISO.slice(5, 7) - 1, +ateISO.slice(8, 10))
  return Math.round((dois - um) / 86_400_000)
}

export const soDigitos = (v: string) => v.replace(/\D/g, '')

/** (62) 99999-9999 ou (62) 3333-4444 */
export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** 000.000.000-00 ou 00.000.000/0000-00 */
export function mascaraCpfCnpj(v: string): string {
  const d = soDigitos(v).slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export function mascaraCep(v: string): string {
  const d = soDigitos(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Link do WhatsApp com mensagem pronta. Sem telefone, abre para o usuário escolher o contato. */
export function linkWhatsApp(mensagem: string, telefone?: string | null): string {
  let fone = soDigitos(telefone ?? '')
  if (fone && fone.length <= 11) fone = `55${fone}`
  const texto = encodeURIComponent(mensagem)
  return fone ? `https://wa.me/${fone}?text=${texto}` : `https://wa.me/?text=${texto}`
}

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const

/** "1.234,56" / "1234.56" / "12,5" → número. Vazio ou inválido → null. */
export function lerNumeroBR(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = v.trim()
  if (!t) return null
  // "1.000" e "12.500" sem vírgula = milhar (jeito brasileiro); "1.5" continua 1,5
  const milhar = !t.includes(',') && /^-?\d{1,3}(\.\d{3})+$/.test(t)
  const normal = t.includes(',') || milhar ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** Número → texto para campo de edição ("1234,5"), sem separador de milhar. */
export function numeroParaCampo(v: number | string | null | undefined, casas = 3): string {
  const n = lerNumeroBR(v as string)
  if (n === null) return ''
  return String(Number(n.toFixed(casas))).replace('.', ',')
}

const NOME_UNIDADE: Record<string, [string, string]> = {
  un: ['un', 'un'], cx: ['cx', 'cx'], fardo: ['fardo', 'fardos'], kg: ['kg', 'kg'], l: ['L', 'L'], pct: ['pct', 'pct'],
}

/** 12 cx · 1 fardo · 3,5 kg */
export function formatarQuantidade(qtd: number | string | null | undefined, unidade?: string | null): string {
  const n = lerNumeroBR(qtd as string) ?? 0
  const [um, varios] = NOME_UNIDADE[unidade ?? ''] ?? [unidade ?? '', unidade ?? '']
  return `${formatarNumero(n)} ${Math.abs(n) === 1 ? um : varios}`.trim()
}

/** Normaliza para busca: minúsculas e sem acento. */
export function semAcento(v: string) {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Escapa curingas para usar o termo dentro de um filtro ilike do PostgREST. */
export function termoBusca(v: string) {
  return v.trim().replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, '%')
}

/** Unidades vendidas inteiras (não aceitam 1,5): un, cx, fardo, pct. kg e litro aceitam fração. */
export function unidadeInteira(unidade: string | null | undefined): boolean {
  return unidade !== 'kg' && unidade !== 'l'
}

const UNIDADE_EXTENSO: Record<string, string> = { un: 'unidade', cx: 'caixa', fardo: 'fardo', pct: 'pacote', kg: 'kg', l: 'litro' }

/** Mensagem de erro da quantidade (null = ok). `limite` = máximo por item. */
export function erroQuantidade(q: number | null, unidade: string, nome: string, limite = 9999): string | null {
  if (q === null || !Number.isFinite(q) || q <= 0) return `Informe a quantidade de "${nome}".`
  if (unidadeInteira(unidade) && !Number.isInteger(q))
    return `"${nome}" é vendido por ${UNIDADE_EXTENSO[unidade] ?? unidade}: use número inteiro (sem vírgula).`
  if (q > limite) return `Quantidade muito alta para "${nome}" (máximo ${limite.toLocaleString('pt-BR')}). Confira o que foi digitado.`
  return null
}

/** Confere os dígitos verificadores do CPF (11) ou CNPJ (14). */
export function cpfCnpjValido(v: string): boolean {
  const d = soDigitos(v)
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false
    const dig = (n: number) => {
      let s = 0
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
      const r = (s * 10) % 11
      return r === 10 ? 0 : r
    }
    return dig(9) === Number(d[9]) && dig(10) === Number(d[10])
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false
    const dig = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0)
      const r = s % 11
      return r < 2 ? 0 : 11 - r
    }
    return dig(12) === Number(d[12]) && dig(13) === Number(d[13])
  }
  return false
}

/** Data de N dias atrás (fuso de São Paulo), no formato do banco. */
export function diasAtrasISO(n: number): string {
  const d = new Date(`${hojeISO()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
