import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { PageHeader } from '@/components/PageHeader'
import { ListaCarregando } from '@/components/EstadosLista'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { mascaraTelefone } from '@/lib/format'
import type { ConfigSistema } from '@/types'

function Form({ c }: { c: ConfigSistema }) {
  const qc = useQueryClient()
  const [trial, setTrial] = useState(String(c.trial_dias))
  const [tol, setTol] = useState(String(c.dias_tolerancia))
  const [sup, setSup] = useState(c.suporte_whatsapp ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    // Campo vazio não pode virar 0 sem querer (0 dias de teste = cliente novo já entra sem teste)
    if (trial.trim() === '' || Number(trial) < 1) return setErro('Informe os dias de teste grátis (pelo menos 1).')
    if (tol.trim() === '') return setErro('Informe os dias de tolerância (pode ser 0).')
    const zap = sup.replace(/\D/g, '')
    if (zap && (zap.length < 10 || zap.length > 11)) return setErro('Confira o WhatsApp de suporte com DDD.')
    setSalvando(true)
    const { error } = await supabase.from('config_sistema').update({
      trial_dias: Number(trial), dias_tolerancia: Number(tol), suporte_whatsapp: zap || null,
    }).eq('id', true)
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Configurações salvas!')
    qc.invalidateQueries({ queryKey: ['config-sistema'] })
    qc.invalidateQueries({ queryKey: ['admin'] })
  }

  return (
    <form onSubmit={salvar} onChange={() => erro && setErro(null)} className="max-w-xl space-y-4">
      <Card>
        <CardContent className="grid gap-4">
          <Campo rotulo="Dias de teste grátis" htmlFor="c-trial" dica="Vale para quem se cadastra sozinho a partir de agora.">
            <Input id="c-trial" inputMode="numeric" value={trial} onChange={(e) => setTrial(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </Campo>
          <Campo rotulo="Dias de tolerância depois do vencimento" htmlFor="c-tol" dica="Depois desse prazo sem pagamento, o acesso é bloqueado sozinho. Até lá, o dono vê um aviso.">
            <Input id="c-tol" inputMode="numeric" value={tol} onChange={(e) => setTol(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </Campo>
          <Campo rotulo="Seu WhatsApp de suporte" htmlFor="c-sup" dica="Aparece para o cliente na tela de acesso bloqueado e na página de assinatura.">
            <Input id="c-sup" type="tel" inputMode="tel" value={mascaraTelefone(sup)} onChange={(e) => setSup(e.target.value)} placeholder="(62) 99999-9999" />
          </Campo>
        </CardContent>
      </Card>
      {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
      <Button type="submit" size="lg" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar</Button>
    </form>
  )
}

export default function AdminConfig() {
  const q = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('config_sistema').select('trial_dias, dias_tolerancia, suporte_whatsapp').single()
      if (error) throw error
      return data as ConfigSistema
    },
  })
  return (
    <>
      <PageHeader titulo="Configurações do sistema" />
      {q.isLoading ? <ListaCarregando linhas={2} /> : q.data && <Form c={q.data} />}
    </>
  )
}
