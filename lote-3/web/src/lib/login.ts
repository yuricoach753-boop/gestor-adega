import { mascaraTelefone, soDigitos } from './format'

/**
 * Login pelo WhatsApp (sem e-mail).
 * O Supabase exige um e-mail para login com senha, então para quem entra pelo WhatsApp
 * criamos um "e-mail interno" com os números: 62999990000@<DOMINIO_LOGIN>.
 * Esse endereço nunca recebe mensagens e não aparece para ninguém: na tela mostramos o telefone.
 * NÃO MUDE este domínio depois que houver usuários cadastrados (eles entram com ele).
 */
export const DOMINIO_LOGIN = 'login.enchanting-hotteok-31650d.netlify.app'

/** Converte o que a pessoa digitou (e-mail ou WhatsApp) no e-mail usado pelo Supabase. */
export function paraEmailLogin(identificador: string) {
  const v = identificador.trim().toLowerCase()
  if (v.includes('@')) return v
  return `${soDigitos(v)}@${DOMINIO_LOGIN}`
}

export function ehLoginWhatsapp(email: string | null | undefined) {
  return !!email && email.toLowerCase().endsWith(`@${DOMINIO_LOGIN}`)
}

/** Como mostrar o login na tela: telefone formatado ou o próprio e-mail. */
export function mostrarLogin(email: string | null | undefined) {
  if (!email) return ''
  return ehLoginWhatsapp(email) ? mascaraTelefone(email.split('@')[0]) : email
}

/** O que foi digitado parece um WhatsApp com DDD (10 ou 11 números)? */
export function pareceWhatsapp(v: string) {
  return !v.includes('@') && [10, 11].includes(soDigitos(v).length)
}

/**
 * Enquanto o cadastro está terminando (criar empresa / aceitar convite), a tela de cadastro
 * não pode ser trocada pelo redirecionamento automático de "já está logado".
 */
export const fluxoCadastro = { ativo: false }
