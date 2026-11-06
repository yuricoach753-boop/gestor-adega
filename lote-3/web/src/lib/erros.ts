/** Traduz erros do Supabase/Postgres para mensagens simples em português. */
type ErroQualquer = { message?: string; code?: string; status?: number } | null | undefined

const MAPA_AUTH: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada (e no spam).'],
  [/user already registered|already been registered/i, 'Este e-mail já tem cadastro. Tente entrar ou recuperar a senha.'],
  [/password should be at least|weak password/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/new password should be different/i, 'A nova senha precisa ser diferente da atual.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'],
  [/unable to validate email|invalid email/i, 'Este e-mail não parece válido. Confira e tente de novo.'],
  [/failed to fetch|network|load failed/i, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.'],
  [/jwt expired|session.*(missing|expired)|auth session missing/i, 'Sua sessão expirou. Entre de novo.'],
  [/token has expired or is invalid|otp_expired/i, 'Este link expirou. Peça um novo.'],
]

export function mensagemErro(erro: unknown): string {
  const e = erro as ErroQualquer
  const msg = e?.message ?? (typeof erro === 'string' ? erro : '')
  const code = e?.code

  // Mensagens que nós mesmos escrevemos no banco (raise exception) já estão em português
  if (code === 'P0001' && msg) return msg

  for (const [re, traducao] of MAPA_AUTH) if (re.test(msg)) return traducao

  if (code === '42501' || /row-level security|permission denied/i.test(msg))
    return 'Você não tem permissão para fazer isso. Fale com o dono da empresa.'
  if (code === '23505' && msg.includes('produtos_codigo_uk')) return 'Já existe um produto com esse código. Use outro código.'
  if (code === '23505' && msg.includes('categorias_nome_uk')) return 'Já existe uma categoria com esse nome.'
  if (code === '23505') return 'Já existe um cadastro com esses dados (código ou nome repetido).'
  if (code === '23503') return 'Este registro está ligado a outro que não existe mais. Atualize a página.'
  if (code === '23514' || code === '22P02') return 'Algum valor informado não é válido. Confira os campos.'

  return 'Algo deu errado. Tente de novo em instantes.'
}
