import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function CampoBusca({ valor, onChange, placeholder = 'Buscar…', autoFocus }: {
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
        autoFocus={autoFocus}
        enterKeyHint="search"
      />
      {valor && (
        <button type="button" onClick={() => onChange('')} aria-label="Limpar busca"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
