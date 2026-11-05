import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'

export default function NaoEncontrada() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <EmptyState
        icone={SearchX}
        titulo="Página não encontrada"
        descricao="O endereço pode estar errado ou a página mudou de lugar."
        acao={<Button asChild><Link to="/">Ir para o início</Link></Button>}
      />
    </div>
  )
}
