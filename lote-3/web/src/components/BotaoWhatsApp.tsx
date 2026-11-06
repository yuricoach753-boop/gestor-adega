import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { linkWhatsApp, soDigitos } from '@/lib/format'

export function BotaoWhatsApp({ telefone, mensagem = '', rotulo = 'WhatsApp', compacto }: {
  telefone: string | null | undefined
  mensagem?: string
  rotulo?: string
  compacto?: boolean
}) {
  if (!telefone || soDigitos(telefone).length < 10) return null
  return (
    <Button asChild variant="outline" size={compacto ? 'icon' : 'default'} className="text-[#128C7E]">
      <a href={linkWhatsApp(mensagem, telefone)} target="_blank" rel="noreferrer" aria-label={`${rotulo} ${telefone}`}
        onClick={(e) => e.stopPropagation()}>
        <MessageCircle /> {!compacto && rotulo}
      </a>
    </Button>
  )
}
