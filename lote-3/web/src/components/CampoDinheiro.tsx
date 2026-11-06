import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Props = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined
  onChange: (valor: number | null) => void
}

/**
 * Campo de dinheiro estilo maquininha: os números entram pelos centavos.
 * Digitar 1 2 3 4 → 12,34. Guarda o valor como número (12.34).
 */
export const CampoDinheiro = React.forwardRef<HTMLInputElement, Props>(function CampoDinheiro(
  { value, onChange, className, ...props }, ref,
) {
  const texto = value === null || value === undefined ? '' : fmt.format(value)
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={cn('pl-9 text-right tabular', className)}
        value={texto}
        placeholder="0,00"
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12)
          onChange(digitos ? Number(digitos) / 100 : null)
        }}
        {...props}
      />
    </div>
  )
})
