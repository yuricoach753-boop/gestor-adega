import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Select nativo: no celular abre o seletor do próprio sistema, que é o mais fácil de usar. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          'h-11 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-9 text-base shadow-xs outline-none sm:h-10 sm:text-sm',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { NativeSelect }
