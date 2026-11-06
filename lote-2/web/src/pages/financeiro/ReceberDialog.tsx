import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarMoeda, hojeISO } from '@/lib/format'
import { NOME_FORMA, type ContaReceber, type FormaPagamento } from '@/types'

const FORMAS: FormaPagamento[] = ['dinheiro', 'pix', 'transferencia', 'cartao_debito', 'cartao_credito', 'boleto']

export function ReceberDialog({ conta, aberto, onAberto }: { conta: ContaReceber; aberto: boolean; onAberto: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [valor, setValor] = useState<number | null>(Number(conta.saldo))
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [data, setData] = useState(hojeISO())
  const [contaFin, setContaFin] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const contas = useQuery({
    queryKey: ['contas-financeiras', conta.empresa_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('contas_financeiras').select('id, nome, tipo').eq('empresa_id', conta.empresa_id).eq('ativo', true).order('created_at')
      if (error) throw error
      return data as Array<{ id: string; nome: string; tipo: 'caixa' | 'banco' }>
    },
  })

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!valor || valor <= 0) return setErro('Informe o valor recebido.')
    if (valor > Number(conta.saldo)) return setErro(`O valor passa do saldo (${formatarMoeda(conta.saldo)}).`)
    setSalvando(true)
    const { error } = await supabase.rpc('receber_conta', {
      p_conta: conta.id, p_valor: valor, p_forma: forma, p_data: data, p_conta_financeira: contaFin || null,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success(valor < Number(conta.saldo) ? 'Recebimento parcial lançado!' : 'Conta recebida!')
    for (const k of ['contas-receber', 'devedores', 'clientes', 'vendas', 'recebimentos', 'caixa', 'painel']) qc.invalidateQueries({ queryKey: [k] })
    onAberto(false)
  }

  const sugestao = forma === 'dinheiro' ? 'caixa' : 'banco'

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receber</DialogTitle>
          <DialogDescription>{conta.cliente_nome ? `${conta.cliente_nome} · ` : ''}saldo de {formatarMoeda(conta.saldo)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <Campo rotulo="Valor recebido" htmlFor="rec-valor" dica="Pode ser só uma parte. O resto continua em aberto.">
            <CampoDinheiro id="rec-valor" value={valor} onChange={setValor} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Como pagou" htmlFor="rec-forma">
              <NativeSelect id="rec-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                {FORMAS.map((f) => <option key={f} value={f}>{NOME_FORMA[f]}</option>)}
              </NativeSelect>
            </Campo>
            <Campo rotulo="Data" htmlFor="rec-data">
              <Input id="rec-data" type="date" max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="Entrou em" htmlFor="rec-conta">
            <NativeSelect id="rec-conta" value={contaFin} onChange={(e) => setContaFin(e.target.value)}>
              <option value="">Automático ({contas.data?.find((c) => c.tipo === sugestao)?.nome ?? sugestao})</option>
              {contas.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </NativeSelect>
          </Campo>
          {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Confirmar recebimento</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
