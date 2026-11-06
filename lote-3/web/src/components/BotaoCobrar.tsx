import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { linkWhatsApp, soDigitos } from '@/lib/format'
import { textoCobranca } from '@/lib/mensagens'

/** Abre o WhatsApp do cliente com a mensagem de cobrança da empresa já preenchida. */
export function BotaoCobrar({ cliente, telefone, valor, vencimento, compacto, className }: {
  cliente: string | null
  telefone: string | null
  valor: number
  vencimento: string
  compacto?: boolean
  className?: string
}) {
  const { empresa } = useEmpresa()
  if (!telefone || soDigitos(telefone).length < 10)
    return <span className="text-xs text-muted-foreground">Sem WhatsApp</span>
  const msg = textoCobranca(empresa?.mensagem_cobranca_padrao, { cliente, valor, vencimento, empresa: empresa?.nome_fantasia ?? '' })
  return (
    <Button asChild variant="outline" size={compacto ? 'sm' : 'default'} className={`text-[#128C7E] ${className ?? ''}`}>
      <a href={linkWhatsApp(msg, telefone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        <MessageCircle /> Cobrar
      </a>
    </Button>
  )
}
