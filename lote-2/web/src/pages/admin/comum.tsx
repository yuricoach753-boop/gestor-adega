import { Badge } from '@/components/ui/badge'
import { APP } from '@/config'
import { formatarData, formatarMoeda } from '@/lib/format'
import { NOME_SITUACAO, type AdminEmpresa, type Situacao } from '@/types'

const VAR: Record<Situacao, 'default' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  ativa: 'default', vencendo: 'warning', trial: 'secondary', trial_vencido: 'destructive', vencida: 'warning',
  inadimplente: 'destructive', bloqueada: 'destructive', cancelada: 'outline',
}

export function BadgeAssinatura({ situacao }: { situacao: Situacao }) {
  return <Badge variant={VAR[situacao]}>{NOME_SITUACAO[situacao]}</Badge>
}

/** Texto curto: "vence 10/11", "teste até 23/10" */
export function prazo(e: Pick<AdminEmpresa, 'status_assinatura' | 'trial_ate' | 'assinatura_vence_em'>) {
  if (e.status_assinatura === 'trial') return e.trial_ate ? `teste até ${formatarData(e.trial_ate)}` : 'em teste'
  if (e.status_assinatura === 'cancelada') return 'cancelada'
  return e.assinatura_vence_em ? `vence ${formatarData(e.assinatura_vence_em)}` : 'sem vencimento'
}

/** Mensagem de WhatsApp para o dono, conforme a situação da assinatura. */
export function mensagemDono(e: AdminEmpresa) {
  const nome = e.dono_nome?.split(' ')[0] ?? 'tudo bem'
  const valor = e.valor_mensal ? ` (${formatarMoeda(e.valor_mensal)})` : ''
  switch (e.situacao) {
    case 'trial':
      return `Olá, ${nome}! Seu teste do ${APP.nome} na ${e.nome_fantasia} vai até ${formatarData(e.trial_ate)}. Está gostando? Posso te ajudar a ativar a assinatura${valor}?`
    case 'trial_vencido':
      return `Olá, ${nome}! O teste grátis do ${APP.nome} na ${e.nome_fantasia} terminou. Seus dados estão guardados. Quer ativar a assinatura${valor} para continuar usando?`
    case 'vencendo':
      return `Olá, ${nome}! Passando para lembrar que a mensalidade do ${APP.nome}${valor} vence em ${formatarData(e.assinatura_vence_em)}. Qualquer dúvida, estou à disposição.`
    case 'vencida':
    case 'inadimplente':
    case 'bloqueada':
      return `Olá, ${nome}! A mensalidade do ${APP.nome}${valor} da ${e.nome_fantasia} venceu em ${formatarData(e.assinatura_vence_em)}. Consegue regularizar? Quando pagar, me manda o comprovante por aqui. Obrigado!`
    default:
      return `Olá, ${nome}! Tudo certo com o ${APP.nome} na ${e.nome_fantasia}?`
  }
}

export function quandoAcessou(iso: string | null) {
  if (!iso) return 'nunca entrou'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return dias <= 0 ? 'entrou hoje' : dias === 1 ? 'entrou ontem' : `entrou há ${dias} dias`
}
