import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  aberto: boolean
  onAberto: (v: boolean) => void
  titulo: string
  descricao: ReactNode
  textoConfirmar: string
  perigoso?: boolean
  pedirMotivo?: boolean
  onConfirmar: (motivo: string) => Promise<unknown> | void
}

export function Confirmar({ aberto, onAberto, titulo, descricao, textoConfirmar, perigoso, pedirMotivo, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function confirmar() {
    setEnviando(true)
    try {
      await onConfirmar(motivo)
      onAberto(false)
      setMotivo('')
    } catch {
      // o erro já foi mostrado por quem chamou; o diálogo continua aberto
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription asChild><div>{descricao}</div></DialogDescription>
        </DialogHeader>
        {pedirMotivo && (
          <div className="grid gap-1.5">
            <Label htmlFor="motivo">Motivo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onAberto(false)} disabled={enviando}>Voltar</Button>
          <Button variant={perigoso ? 'destructive' : 'default'} onClick={confirmar} disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" />} {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
