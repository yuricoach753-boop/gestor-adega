import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import type { Categoria } from '@/types'

export function NovaCategoria({ aberto, onAberto, empresaId, tipo, onCriada }: {
  aberto: boolean
  onAberto: (v: boolean) => void
  empresaId: string
  tipo: Categoria['tipo']
  onCriada: (c: Categoria) => void
}) {
  const qc = useQueryClient()
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation() // não enviar o formulário do produto
    if (nome.trim().length < 2) return setErro('Informe o nome da categoria.')
    setSalvando(true)
    const { data, error } = await supabase.from('categorias').insert({ empresa_id: empresaId, tipo, nome: nome.trim() }).select('*').single()
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    await qc.invalidateQueries({ queryKey: ['categorias', empresaId, tipo] })
    onCriada(data as Categoria)
    toast.success('Categoria criada!')
    setNome('')
    setErro(null)
    onAberto(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <Campo rotulo="Nome" htmlFor="cat-nome" erro={erro ?? undefined}>
            <Input id="cat-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Frios" autoFocus aria-invalid={!!erro} />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Criar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
