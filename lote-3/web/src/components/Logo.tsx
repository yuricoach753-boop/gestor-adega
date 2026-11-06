import { Store } from 'lucide-react'
import { APP } from '@/config'
import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 font-semibold', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Store className="size-4.5" />
      </span>
      <span className="text-lg tracking-tight">{APP.nome}</span>
    </div>
  )
}
