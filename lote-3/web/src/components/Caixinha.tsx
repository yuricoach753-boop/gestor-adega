import { cn } from '@/lib/utils'

/** Checkbox nativo com rótulo grande (fácil de tocar no celular). */
export function Caixinha({ checked, onChange, rotulo, descricao, className }: {
  checked: boolean
  onChange: (v: boolean) => void
  rotulo: string
  descricao?: string
  className?: string
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 py-1', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 rounded accent-[var(--primary)]" />
      <span>
        <span className="block text-sm font-medium">{rotulo}</span>
        {descricao && <span className="block text-xs text-muted-foreground">{descricao}</span>}
      </span>
    </label>
  )
}
