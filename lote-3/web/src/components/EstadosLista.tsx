import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { mensagemErro } from '@/lib/erros'

export function ListaCarregando({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  )
}

export function ErroLista({ erro, tentarDeNovo }: { erro: unknown; tentarDeNovo?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm text-destructive">{mensagemErro(erro)}</p>
      {tentarDeNovo && <Button variant="outline" size="sm" onClick={tentarDeNovo}><RotateCw /> Tentar de novo</Button>}
    </div>
  )
}
