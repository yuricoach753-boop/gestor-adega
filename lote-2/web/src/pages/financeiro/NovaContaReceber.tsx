import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { BuscaCliente, type ClienteEscolhido } from '@/components/BuscaCliente'
import { PageHeader } from '@/components/PageHeader'
import { SomenteDono } from '@/components/Guards'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { diasAtrasISO, formatarMoeda, hojeISO } from '@/lib/format'

function Formulario() {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(null)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState<number | null>(null)
  const [vencimento, setVencimento] = useState(hojeISO())
  const [parcelas, setParcelas] = useState('1')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const n = Math.min(Math.max(parseInt(parcelas) || 1, 1), 48)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (descricao.trim().length < 2) return setErro('Informe a descrição.')
    if (!valor) return setErro('Informe o valor.')
    if (!vencimento) return setErro('Informe o vencimento.')
    setSalvando(true)
    const { error } = await supabase.rpc('lancar_contas_receber', {
      p_empresa: empresa!.id, p_descricao: descricao, p_valor_total: valor, p_primeiro_vencimento: vencimento,
      p_cliente: cliente?.id ?? null, p_parcelas: n, p_intervalo_dias: 30, p_observacoes: obs || null,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Conta a receber lançada!')
    for (const k of ['contas-receber', 'devedores', 'clientes', 'caixa', 'painel']) qc.invalidateQueries({ queryKey: [k] })
    navigate('/financeiro/receber', { replace: true })
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <Card>
        <CardContent className="grid gap-4">
          <Campo rotulo="Cliente" htmlFor="cliente" opcional><BuscaCliente valor={cliente} onChange={setCliente} /></Campo>
          <Campo rotulo="Descrição" htmlFor="desc">
            <Input id="desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Saldo antigo da caderneta" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor total" htmlFor="valor"><CampoDinheiro id="valor" value={valor} onChange={setValor} /></Campo>
            <Campo rotulo="Parcelas" htmlFor="parc">
              <Input id="parc" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </Campo>
          </div>
          <Campo rotulo={n > 1 ? '1º vencimento' : 'Vencimento'} htmlFor="venc"
            dica={n > 1 && valor ? `${n}x de cerca de ${formatarMoeda(valor / n)}, a cada 30 dias.` : undefined}>
            <Input id="venc" type="date" min={diasAtrasISO(365)} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Campo>
          <Campo rotulo="Observações" htmlFor="obs" opcional><Textarea id="obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        </CardContent>
      </Card>
      {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
      <div className="flex gap-2 lg:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={() => navigate(-1)}>Cancelar</Button>
        <Button type="submit" size="lg" className="flex-1 lg:flex-none" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Lançar</Button>
      </div>
    </form>
  )
}

export default function NovaContaReceber() {
  return (
    <>
      <PageHeader titulo="Lançar conta a receber" descricao="Para valores que não vieram de uma venda no sistema (ex.: caderneta antiga)." voltarPara="/financeiro/receber" />
      <SomenteDono><Formulario /></SomenteDono>
    </>
  )
}
