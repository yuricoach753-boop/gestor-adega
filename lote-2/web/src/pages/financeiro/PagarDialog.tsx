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
import { NOME_FORMA, type ContaPagar, type FormaPagamento } from '@/types'

const FORMAS: FormaPagamento[] = ['pix', 'boleto', 'dinheiro', 'transferencia', 'cartao_debito', 'cartao_credito']

export function useContasFinanceiras(empresaId: string | undefined) {
  return useQuery({
    queryKey: ['contas-financeiras', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('contas_financeiras').select('id, nome, tipo').eq('empresa_id', empresaId!).eq('ativo', true).order('created_at')
      if (error) throw error
      return data as Array<{ id: string; nome: string; tipo: 'caixa' | 'banco' }>
    },
  })
}

export function PagarDialog({ conta, onFechar }: { conta: ContaPagar; onFechar: () => void }) {
  const qc = useQueryClient()
  const contas = useContasFinanceiras(conta.empresa_id)
  const [data, setData] = useState(hojeISO())
  const [forma, setForma] = useState<FormaPagamento>(conta.forma_pagamento && conta.forma_pagamento !== 'a_prazo' ? conta.forma_pagamento : 'pix')
  const [contaFin, setContaFin] = useState('')
  const [juros, setJuros] = useState<number | null>(null)
  const [desconto, setDesconto] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const total = Number(conta.valor) + (juros ?? 0) - (desconto ?? 0)
  const sugestao = forma === 'dinheiro' ? 'caixa' : 'banco'

  async function pagar(e: React.FormEvent) {
    e.preventDefault()
    if (total <= 0) return setErro('O desconto não pode ser maior que o valor.')
    setSalvando(true)
    const { error } = await supabase.rpc('pagar_conta', {
      p_conta: conta.id, p_data: data, p_conta_financeira: contaFin || null, p_forma: forma, p_juros: juros ?? 0, p_desconto: desconto ?? 0,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Conta paga!')
    for (const k of ['contas-pagar', 'caixa', 'fornecedores', 'compras', 'painel']) qc.invalidateQueries({ queryKey: [k] })
    onFechar()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar conta</DialogTitle>
          <DialogDescription>{conta.descricao} · {formatarMoeda(conta.valor)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={pagar} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data do pagamento" htmlFor="pg-data">
              <Input id="pg-data" type="date" max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />
            </Campo>
            <Campo rotulo="Como pagou" htmlFor="pg-forma">
              <NativeSelect id="pg-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                {FORMAS.map((f) => <option key={f} value={f}>{NOME_FORMA[f]}</option>)}
              </NativeSelect>
            </Campo>
            <Campo rotulo="Juros / multa" htmlFor="pg-juros" opcional><CampoDinheiro id="pg-juros" value={juros} onChange={setJuros} /></Campo>
            <Campo rotulo="Desconto" htmlFor="pg-desc" opcional><CampoDinheiro id="pg-desc" value={desconto} onChange={setDesconto} /></Campo>
          </div>
          <Campo rotulo="Saiu de" htmlFor="pg-conta">
            <NativeSelect id="pg-conta" value={contaFin} onChange={(e) => setContaFin(e.target.value)}>
              <option value="">Automático ({contas.data?.find((c) => c.tipo === sugestao)?.nome ?? sugestao})</option>
              {contas.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </NativeSelect>
          </Campo>
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <span className="text-sm font-medium">Total pago</span>
            <span className="text-xl font-semibold tabular">{formatarMoeda(total)}</span>
          </div>
          {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Confirmar pagamento</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
