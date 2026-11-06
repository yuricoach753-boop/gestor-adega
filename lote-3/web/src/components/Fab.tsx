import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Botão flutuante de ação principal (só no celular; no computador use o botão do cabeçalho). */
export function Fab({ para, rotulo, icone: Icone }: { para: string; rotulo: string; icone: LucideIcon }) {
  return (
    <Link
      to={para}
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-medium text-primary-foreground shadow-lg active:scale-95 lg:hidden"
    >
      <Icone className="size-5" />
      {rotulo}
    </Link>
  )
}
