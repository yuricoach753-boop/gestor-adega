import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Abas que são links (cada aba é uma rota). */
export function Abas({ itens }: { itens: Array<{ rota: string; rotulo: string; end?: boolean }> }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {itens.map((i) => (
        <NavLink
          key={i.rota}
          to={i.rota}
          end={i.end}
          replace
          className={({ isActive }) =>
            cn('flex-1 whitespace-nowrap rounded-md px-3 py-2 text-center text-sm font-medium text-muted-foreground transition-colors',
              isActive ? 'bg-card text-foreground shadow-xs' : 'hover:text-foreground')
          }
        >
          {i.rotulo}
        </NavLink>
      ))}
    </div>
  )
}
