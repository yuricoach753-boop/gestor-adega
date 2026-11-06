import { Lock, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthProvider'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { APP } from '@/config'
import { linkWhatsApp } from '@/lib/format'
import { AuthLayout } from './auth/AuthLayout'

export default function AcessoBloqueado() {
  const { empresa, vinculos, trocarEmpresa, ehDono, config } = useEmpresa()
  const { sair } = useAuth()
  if (!empresa) return null

  const titulo =
    empresa.status_assinatura === 'trial' ? 'Seu teste grátis terminou'
    : empresa.status_assinatura === 'ativa' || empresa.status_assinatura === 'inadimplente' ? 'Mensalidade em atraso'
    : empresa.status_assinatura === 'cancelada' ? 'Assinatura cancelada'
    : 'Acesso suspenso'

  const texto = ehDono
    ? 'Seus dados estão guardados com segurança. Para voltar a usar o sistema, fale com a gente e ative sua assinatura.'
    : 'O acesso desta empresa está suspenso. Avise o dono da empresa.'

  const outras = vinculos.filter((v) => v.empresa.id !== empresa.id)
  const suporte = config?.suporte_whatsapp || APP.suporteWhatsApp

  return (
    <AuthLayout titulo={titulo} subtitulo={empresa.nome_fantasia}>
      <div className="flex flex-col items-center gap-3 text-center">
        <Lock className="size-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{texto}</p>
      </div>
      <div className="mt-6 grid gap-2">
        {ehDono && suporte && (
          <Button asChild size="lg">
            <a href={linkWhatsApp(`Olá! Quero ativar a assinatura da empresa ${empresa.nome_fantasia}.`, suporte)} target="_blank" rel="noreferrer">
              <MessageCircle /> Falar no WhatsApp
            </a>
          </Button>
        )}
        {outras.map((v) => (
          <Button key={v.empresa.id} variant="outline" onClick={() => trocarEmpresa(v.empresa.id)}>
            Abrir {v.empresa.nome_fantasia}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => sair()}>Sair</Button>
      </div>
    </AuthLayout>
  )
}
