import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { APP } from '@/config'
import { linkWhatsApp } from '@/lib/format'

export function LinkConvite({ token, empresa, nome, telefone }: { token: string; empresa: string; nome?: string | null; telefone?: string | null }) {
  const [copiado, setCopiado] = useState(false)
  const link = `${window.location.origin}/convite/${token}`
  const msg = `Olá${nome ? `, ${nome.split(' ')[0]}` : ''}! Seu acesso ao ${APP.nome} da ${empresa} está pronto. Toque no link, crie sua senha e comece a usar: ${link}`
  return (
    <div className="grid gap-3">
      <div className="break-all rounded-lg border bg-muted px-3 py-2 font-mono text-xs">{link}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild><a href={linkWhatsApp(msg, telefone)} target="_blank" rel="noreferrer"><MessageCircle /> Enviar pelo WhatsApp</a></Button>
        <Button variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { toast.error('Não foi possível copiar.') }
        }}>{copiado ? <Check /> : <Copy />} {copiado ? 'Copiado!' : 'Copiar link'}</Button>
      </div>
      <p className="text-xs text-muted-foreground">O link vale 30 dias. Quem abrir cria a conta e entra como dono da empresa.</p>
    </div>
  )
}
