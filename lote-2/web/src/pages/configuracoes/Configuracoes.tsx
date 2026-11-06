import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, ChevronRight, CreditCard, Loader2, Presentation, UserRound, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'

function EmpresaDemonstracao() {
  const { vinculos, trocarEmpresa, recarregar } = useEmpresa()
  const navigate = useNavigate()
  const [criando, setCriando] = useState(false)
  const existente = vinculos.find((v) => v.empresa.usa_dados_exemplo)

  async function criar() {
    setCriando(true)
    const { data, error } = await supabase.rpc('criar_empresa_demonstracao')
    setCriando(false)
    if (error) return toast.error(mensagemErro(error))
    trocarEmpresa(data as string)
    await recarregar()
    toast.success('Empresa de demonstração criada!')
    navigate('/produtos')
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Presentation className="size-4" /> Empresa de demonstração</CardTitle>
        <CardDescription>
          Cria uma empresa separada, já com produtos, clientes, fornecedores e uma compra de exemplo. Boa para conhecer o sistema
          ou mostrar para alguém. Sua empresa real não é alterada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {existente ? (
          <Button variant="outline" className="h-auto max-w-full whitespace-normal py-2 text-left" onClick={() => { trocarEmpresa(existente.empresa.id); navigate('/produtos') }}>
            Abrir {existente.empresa.nome_fantasia}
          </Button>
        ) : (
          <Button variant="outline" onClick={criar} disabled={criando}>
            {criando && <Loader2 className="animate-spin" />} Criar empresa de demonstração
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default function Configuracoes() {
  const { ehDono } = useEmpresa()
  const itens = [
    { rota: '/configuracoes/perfil', titulo: 'Meus dados', texto: 'Seu nome, WhatsApp e senha', icone: UserRound, mostrar: true },
    { rota: '/configuracoes/empresa', titulo: 'Dados da empresa', texto: 'Nome, endereço, logo e mensagem de cobrança', icone: Building2, mostrar: ehDono },
    { rota: '/configuracoes/usuarios', titulo: 'Usuários e permissões', texto: 'Convide funcionários e controle o acesso', icone: Users, mostrar: ehDono },
    { rota: '/configuracoes/assinatura', titulo: 'Assinatura', texto: 'Plano, vencimento e pagamentos', icone: CreditCard, mostrar: ehDono },
  ].filter((i) => i.mostrar)

  return (
    <>
      <PageHeader titulo="Configurações" />
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {itens.map((i) => (
          <Link key={i.rota} to={i.rota} className="flex items-center gap-3 px-4 py-4 hover:bg-muted">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <i.icone className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{i.titulo}</span>
              <span className="block text-sm text-muted-foreground">{i.texto}</span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        ))}
      </div>
      <EmpresaDemonstracao />
    </>
  )
}
