import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Campo } from '@/components/Campo'
import { PageHeader } from '@/components/PageHeader'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarMoeda, mascaraTelefone, UFS } from '@/lib/format'
import type { Plano } from '@/types'
import { LinkConvite } from './LinkConvite'

export default function AdminNovaEmpresa() {
  const qc = useQueryClient()
  const { config } = useEmpresa()
  const [nome, setNome] = useState('')
  const [dono, setDono] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('GO')
  const [plano, setPlano] = useState('')
  const [dias, setDias] = useState(String(config?.trial_dias ?? 14))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [criada, setCriada] = useState<{ empresa_id: string; token: string } | null>(null)

  const planos = useQuery({
    queryKey: ['admin', 'planos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('planos').select('*').eq('ativo', true).order('valor_mensal')
      if (error) throw error
      return data as Plano[]
    },
  })

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (nome.trim().length < 2) return setErro('Informe o nome da empresa.')
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('Este e-mail não parece válido.')
    setSalvando(true)
    const { data, error } = await supabase.rpc('admin_criar_empresa', {
      p_nome_fantasia: nome, p_nome_dono: dono || null, p_telefone: telefone || null, p_email: email || null,
      p_plano: plano || null, p_trial_dias: dias === '' ? null : Number(dias), p_cidade: cidade || null, p_uf: uf || null,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    setCriada(data as { empresa_id: string; token: string })
    qc.invalidateQueries({ queryKey: ['admin'] })
  }

  if (criada)
    return (
      <>
        <PageHeader titulo="Empresa criada" voltarPara="/admin" />
        <Card className="max-w-xl">
          <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" /> {nome}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">Agora mande o link para o dono. Ao criar a senha, ele entra direto na empresa.</p>
            <LinkConvite token={criada.token} empresa={nome} nome={dono} telefone={telefone} />
            <Button asChild variant="outline"><Link to={`/admin/empresas/${criada.empresa_id}`}>Ver empresa</Link></Button>
          </CardContent>
        </Card>
      </>
    )

  return (
    <>
      <PageHeader titulo="Nova empresa cliente" descricao="Cria a empresa e gera o link para o dono entrar." voltarPara="/admin" />
      <form onSubmit={salvar} onChange={() => erro && setErro(null)} className="max-w-xl space-y-4" noValidate>
        <Card>
          <CardContent className="grid gap-4">
            <Campo rotulo="Nome da empresa" htmlFor="a-nome"><Input id="a-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome do dono" htmlFor="a-dono" opcional><Input id="a-dono" value={dono} onChange={(e) => setDono(e.target.value)} /></Campo>
              <Campo rotulo="WhatsApp" htmlFor="a-tel" opcional><Input id="a-tel" type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} /></Campo>
              <Campo rotulo="E-mail" htmlFor="a-email" opcional><Input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
              <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                <Campo rotulo="Cidade" htmlFor="a-cidade" opcional><Input id="a-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} /></Campo>
                <Campo rotulo="UF" htmlFor="a-uf"><NativeSelect id="a-uf" value={uf} onChange={(e) => setUf(e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</NativeSelect></Campo>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Assinatura</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Plano" htmlFor="a-plano" opcional>
              <NativeSelect id="a-plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
                <option value="">Sem plano</option>
                {planos.data?.map((p) => <option key={p.id} value={p.id}>{p.nome} · {formatarMoeda(p.valor_mensal)}</option>)}
              </NativeSelect>
            </Campo>
            <Campo rotulo="Dias de teste grátis" htmlFor="a-dias">
              <Input id="a-dias" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </Campo>
          </CardContent>
        </Card>
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
        <Button type="submit" size="lg" disabled={salvando} className="w-full sm:w-auto">{salvando && <Loader2 className="animate-spin" />} Criar empresa e gerar link</Button>
      </form>
    </>
  )
}
