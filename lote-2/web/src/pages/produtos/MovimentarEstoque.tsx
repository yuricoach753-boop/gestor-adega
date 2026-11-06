import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarQuantidade, lerNumeroBR, unidadeInteira } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Produto } from '@/types'

export type TipoManual = 'perda' | 'uso_interno' | 'ajuste'

const OPCOES: Array<{ tipo: TipoManual; rotulo: string; ajuda: string }> = [
  { tipo: 'perda', rotulo: 'Perda', ajuda: 'Quebrou, venceu, estragou ou sumiu.' },
  { tipo: 'uso_interno', rotulo: 'Uso interno', ajuda: 'Usado na própria empresa, sem venda.' },
  { tipo: 'ajuste', rotulo: 'Ajustar contagem', ajuda: 'Contou na prateleira e o número é outro.' },
]

export function MovimentarEstoque({ produto, tipoInicial, aberto, onAberto }: {
  produto: Produto
  tipoInicial: TipoManual
  aberto: boolean
  onAberto: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<TipoManual>(tipoInicial)
  const [quantidade, setQuantidade] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const n = lerNumeroBR(quantidade)
  const depois = n === null ? null : tipo === 'ajuste' ? n : produto.estoque_atual - n

  function mudarAberto(v: boolean) {
    onAberto(v)
    if (v) { setTipo(tipoInicial); setQuantidade(''); setObs(''); setErro(null) }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (n === null || (tipo !== 'ajuste' && n <= 0) || n < 0)
      return setErro(tipo === 'ajuste' ? 'Informe a quantidade contada.' : 'Informe uma quantidade maior que zero.')
    if (unidadeInteira(produto.unidade) && !Number.isInteger(n))
      return setErro(`"${produto.nome}" é contado por ${produto.unidade}: use número inteiro (sem vírgula).`)
    if (tipo !== 'ajuste' && n > Math.max(produto.estoque_atual, 0))
      return setErro(`A saída é maior que o estoque (${formatarQuantidade(produto.estoque_atual, produto.unidade)}). Se o estoque está errado, use "Ajuste de contagem".`)
    setSalvando(true)
    const { error } = await supabase.rpc('lancar_movimentacao', { p_produto: produto.id, p_tipo: tipo, p_quantidade: n, p_observacao: obs || null })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Estoque atualizado!')
    qc.invalidateQueries({ queryKey: ['produto', produto.id] })
    qc.invalidateQueries({ queryKey: ['movimentacoes'] })
    qc.invalidateQueries({ queryKey: ['produtos'] })
    qc.invalidateQueries({ queryKey: ['produtos-baixo'] })
    onAberto(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>{produto.nome} · hoje: {formatarQuantidade(produto.estoque_atual, produto.unidade)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            {OPCOES.map((o) => (
              <button key={o.tipo} type="button" onClick={() => { setTipo(o.tipo); setErro(null) }}
                className={cn('rounded-lg border px-2 py-2.5 text-sm font-medium', tipo === o.tipo ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted')}>
                {o.rotulo}
              </button>
            ))}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{OPCOES.find((o) => o.tipo === tipo)?.ajuda}</p>

          {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}

          <Campo rotulo={tipo === 'ajuste' ? 'Quantidade contada' : 'Quantidade que saiu'} htmlFor="mov-qtd">
            <Input id="mov-qtd" inputMode="decimal" value={quantidade} onChange={(e) => { setQuantidade(e.target.value); setErro(null) }} autoFocus placeholder="0" />
          </Campo>
          {depois !== null && (
            <p className={cn('rounded-lg bg-muted p-3 text-sm', depois < 0 && 'bg-warning/15 text-amber-900')}>
              O estoque vai ficar em <strong>{formatarQuantidade(depois, produto.unidade)}</strong>
              {depois < 0 && tipo !== 'ajuste' && ' — não dá: é mais do que tem. Se o estoque está errado, use "Ajuste de contagem".'}
            </p>
          )}
          <Campo rotulo="Observação" htmlFor="mov-obs" opcional>
            <Textarea id="mov-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: 2 garrafas quebradas na entrega" />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Confirmar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
