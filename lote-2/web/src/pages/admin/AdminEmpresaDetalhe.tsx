import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, HandCoins, Link2, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { Confirmar } from '@/components/Confirmar'
import { BotaoWhatsApp } from '@/components/BotaoWhatsApp'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarData, formatarDataHora, formatarMoeda, hojeISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOME_PAPEL, NOME_STATUS_ASSINATURA, type AdminEmpresa, type PagamentoAssinatura, type Papel, type Plano, type StatusAssinatura } from '@/types'
import NaoEncontrada from '@/pages/NaoEncontrada'
import { BadgeAssinatura, mensagemDono, quandoAcessou } from './comum'
import { LinkConvite } from './LinkConvite'
import { mostrarLogin } from '@/lib/login'

const FORMAS = ['pix', 'boleto', 'cartao', 'dinheiro', 'transferencia']
const NOME_FORMA: Record<string, string> = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão', dinheiro: 'Dinheiro', transferencia: 'Transferência' }

function FormAssinatura({ e, planos }: { e: AdminEmpresa; planos: Plano[] }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<StatusAssinatura>(e.status_assinatura)
  const [plano, setPlano] = useState(e.plano_id ?? '')
  const [trial, setTrial] = useState(e.trial_ate ?? '')
  const [vence, setVence] = useState(e.assinatura_vence_em ?? '')
  const [obs, setObs] = useState(e.observacoes_admin ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault()
    setErro(null)
    setSalvando(true)
    const { error } = await supabase.rpc('admin_atualizar_assinatura', {
      p_empresa: e.id, p_status: status, p_plano: plano || null, p_trial_ate: trial || null, p_vence_em: vence || null, p_observacoes: obs || null,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Assinatura atualizada!')
    qc.invalidateQueries({ queryKey: ['admin'] })
  }

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Assinatura</CardTitle>
        <CardDescription>Para registrar uma mensalidade recebida, use "Registrar pagamento": o vencimento é atualizado sozinho.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Situação" htmlFor="s-status">
            <NativeSelect id="s-status" value={status} onChange={(ev) => setStatus(ev.target.value as StatusAssinatura)}>
              {(Object.keys(NOME_STATUS_ASSINATURA) as StatusAssinatura[]).map((s) => <option key={s} value={s}>{NOME_STATUS_ASSINATURA[s]}</option>)}
            </NativeSelect>
          </Campo>
          <Campo rotulo="Plano" htmlFor="s-plano">
            <NativeSelect id="s-plano" value={plano} onChange={(ev) => setPlano(ev.target.value)}>
              <option value="">Sem plano</option>
              {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} · {formatarMoeda(p.valor_mensal)}{p.ativo ? '' : ' (inativo)'}</option>)}
            </NativeSelect>
          </Campo>
          <Campo rotulo="Teste grátis até" htmlFor="s-trial" opcional><Input id="s-trial" type="date" value={trial} onChange={(ev) => setTrial(ev.target.value)} /></Campo>
          <Campo rotulo="Mensalidade paga até" htmlFor="s-vence" opcional><Input id="s-vence" type="date" value={vence} onChange={(ev) => setVence(ev.target.value)} /></Campo>
          <Campo rotulo="Anotações (só você vê)" htmlFor="s-obs" opcional className="sm:col-span-2">
            <Textarea id="s-obs" rows={2} value={obs} onChange={(ev) => setObs(ev.target.value)} placeholder="Ex.: paga todo dia 5 no Pix; indicação do Zé" />
          </Campo>
          {erro && <Alert variant="destructive" className="sm:col-span-2"><AlertDescription>{erro}</AlertDescription></Alert>}
          <Button type="submit" variant="outline" disabled={salvando} className="sm:col-span-2 sm:justify-self-start">
            {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function RegistrarPagamento({ e, onFechar }: { e: AdminEmpresa; onFechar: () => void }) {
  const qc = useQueryClient()
  const [valor, setValor] = useState<number | null>(e.valor_mensal ? Number(e.valor_mensal) : null)
  const [meses, setMeses] = useState('1')
  const [data, setData] = useState(hojeISO())
  const [forma, setForma] = useState('pix')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const m = Math.max(1, parseInt(meses) || 1)

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault()
    if (valor === null) return setErro('Informe o valor recebido.')
    setSalvando(true)
    const { data: novo, error } = await supabase.rpc('admin_registrar_pagamento', {
      p_empresa: e.id, p_valor: valor, p_pago_em: data, p_forma: forma, p_meses: m, p_observacao: obs || null,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success(`Pagamento registrado! Agora vence em ${formatarData(novo as string)}.`)
    qc.invalidateQueries({ queryKey: ['admin'] })
    onFechar()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>{e.nome_fantasia} · a assinatura fica ativa e o vencimento avança {m} {m === 1 ? 'mês' : 'meses'}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor recebido" htmlFor="p-valor"><CampoDinheiro id="p-valor" value={valor} onChange={setValor} /></Campo>
            <Campo rotulo="Quantos meses" htmlFor="p-meses"><Input id="p-meses" inputMode="numeric" value={meses} onChange={(ev) => setMeses(ev.target.value.replace(/\D/g, '').slice(0, 2))} /></Campo>
            <Campo rotulo="Data do pagamento" htmlFor="p-data"><Input id="p-data" type="date" max={hojeISO()} value={data} onChange={(ev) => setData(ev.target.value)} /></Campo>
            <Campo rotulo="Forma" htmlFor="p-forma">
              <NativeSelect id="p-forma" value={forma} onChange={(ev) => setForma(ev.target.value)}>{FORMAS.map((f) => <option key={f} value={f}>{NOME_FORMA[f]}</option>)}</NativeSelect>
            </Campo>
          </div>
          <Campo rotulo="Observação" htmlFor="p-obs" opcional><Input id="p-obs" value={obs} onChange={(ev) => setObs(ev.target.value)} /></Campo>
          <p className="text-xs text-muted-foreground">
            Se estiver em dia ou dentro da tolerância, o novo vencimento conta a partir do vencimento atual
            {e.assinatura_vence_em ? ` (${formatarData(e.assinatura_vence_em)})` : ''}. Se estava em teste, bloqueada ou cancelada, conta a partir da data do pagamento.
          </p>
          {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Registrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminEmpresaDetalhe() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [pagando, setPagando] = useState(false)
  const [cancelar, setCancelar] = useState<PagamentoAssinatura | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  const q = useQuery({
    queryKey: ['admin', 'empresa', id],
    queryFn: async () => {
      const [l, pg, us, pl] = await Promise.all([
        supabase.rpc('admin_listar_empresas'),
        supabase.from('pagamentos_assinatura').select('*').eq('empresa_id', id!).order('created_at', { ascending: false }),
        supabase.rpc('admin_usuarios_empresa', { p_empresa: id }),
        supabase.from('planos').select('*').order('valor_mensal'),
      ])
      for (const r of [l, pg, us, pl]) if (r.error) throw r.error
      return {
        empresa: (l.data as AdminEmpresa[]).find((e) => e.id === id) ?? null,
        pagamentos: pg.data as PagamentoAssinatura[],
        usuarios: us.data as Array<{ usuario_id: string; nome: string | null; email: string; telefone: string | null; papel: Papel; ativo: boolean; ultimo_acesso: string | null }>,
        planos: pl.data as Plano[],
      }
    },
  })

  if (q.isLoading) return <ListaCarregando linhas={4} />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  const { empresa: e, pagamentos, usuarios, planos } = q.data!
  if (!e) return <NaoEncontrada />

  async function novoConvite() {
    setGerando(true)
    const { data, error } = await supabase.rpc('admin_convite_dono', { p_empresa: e!.id, p_nome: e!.dono_nome })
    setGerando(false)
    if (error) return toast.error(mensagemErro(error))
    setToken(data as string)
    qc.invalidateQueries({ queryKey: ['admin'] })
  }

  return (
    <>
      <PageHeader titulo={e.nome_fantasia} descricao={`Cliente desde ${formatarData(e.created_at)}${e.cidade ? ` · ${e.cidade}${e.uf ? `/${e.uf}` : ''}` : ''}`} voltarPara="/admin"
        acoes={<BadgeAssinatura situacao={e.situacao} />} />

      {e.usa_dados_exemplo && <Alert className="mb-4"><AlertDescription>Esta é uma empresa de demonstração (dados de exemplo).</AlertDescription></Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Plano</p><p className="font-medium">{e.plano_nome ? `${e.plano_nome} · ${formatarMoeda(e.valor_mensal)}` : 'Sem plano'}</p></div>
              <div><p className="text-xs text-muted-foreground">{e.status_assinatura === 'trial' ? 'Teste até' : 'Paga até'}</p>
                <p className="font-medium">{formatarData(e.status_assinatura === 'trial' ? e.trial_ate : e.assinatura_vence_em) || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Total já pago</p><p className="font-medium tabular">{formatarMoeda(e.total_pago)}</p></div>
              <div><p className="text-xs text-muted-foreground">Acesso ao sistema</p><p className={cn('font-medium', !e.liberada && 'text-destructive')}>{e.liberada ? 'Liberado' : 'Bloqueado'}</p></div>
              <div><p className="text-xs text-muted-foreground">Uso</p><p className="font-medium">{e.vendas_30d} vendas em 30 dias</p></div>
              <div><p className="text-xs text-muted-foreground">Último acesso</p><p className="font-medium">{quandoAcessou(e.ultimo_acesso)}</p></div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => setPagando(true)}><HandCoins /> Registrar pagamento</Button>
            <BotaoWhatsApp telefone={e.dono_telefone ?? e.telefone} mensagem={mensagemDono(e)} rotulo="Mensagem" />
          </div>

          <FormAssinatura key={`${e.status_assinatura}-${e.assinatura_vence_em}-${e.trial_ate}-${e.plano_id}`} e={e} planos={planos} />
        </div>

        <div className="space-y-4">
          <Card className="gap-2">
            <CardHeader><CardTitle>Mensalidades</CardTitle></CardHeader>
            {pagamentos.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p></CardContent> : (
              <ul className="divide-y">
                {pagamentos.map((p) => (
                  <li key={p.id} className={cn('flex items-center gap-3 px-5 py-2.5', p.cancelado_em && 'opacity-50')}>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">{formatarData(p.pago_em)} · {NOME_FORMA[p.forma ?? ''] ?? p.forma ?? '—'}{p.meses > 1 ? ` · ${p.meses} meses` : ''}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.cancelado_em ? `Cancelado${p.motivo_cancelamento ? `: ${p.motivo_cancelamento}` : ''}` : p.novo_vencimento ? `Passou a vencer em ${formatarData(p.novo_vencimento)}` : ''}
                        {p.observacao ? ` · ${p.observacao}` : ''}
                      </p>
                    </div>
                    <span className={cn('text-sm font-medium tabular', p.cancelado_em && 'line-through')}>{formatarMoeda(p.valor)}</span>
                    {!p.cancelado_em && (
                      <Button variant="ghost" size="icon" onClick={() => setCancelar(p)} aria-label="Cancelar pagamento"><Ban className="text-muted-foreground" /></Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="gap-2">
            <CardHeader><CardTitle>Usuários ({usuarios.filter((u) => u.ativo).length})</CardTitle></CardHeader>
            {usuarios.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">Ninguém entrou ainda.</p></CardContent> : (
              <ul className="divide-y">
                {usuarios.map((u) => (
                  <li key={u.usuario_id} className={cn('flex items-center gap-3 px-5 py-2.5', !u.ativo && 'opacity-50')}>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">{u.nome || 'Sem nome'} <Badge variant={u.papel === 'dono' ? 'default' : 'secondary'}>{NOME_PAPEL[u.papel]}</Badge></p>
                      <p className="truncate text-xs text-muted-foreground">{mostrarLogin(u.email)} · {quandoAcessou(u.ultimo_acesso)}{u.ultimo_acesso ? ` (${formatarDataHora(u.ultimo_acesso)})` : ''}</p>
                    </div>
                    <BotaoWhatsApp telefone={u.telefone} compacto />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Acesso do dono</CardTitle>
              <CardDescription>{e.convite_pendente ? 'Existe um convite de dono esperando ser aceito.' : 'Precisa colocar outro dono ou o link anterior venceu? Gere um novo link.'}</CardDescription>
            </CardHeader>
            <CardContent>
              {token ? <LinkConvite token={token} empresa={e.nome_fantasia} nome={e.dono_nome} telefone={e.dono_telefone ?? e.telefone} /> : (
                <Button variant="outline" onClick={novoConvite} disabled={gerando}>{gerando ? <Loader2 className="animate-spin" /> : <Link2 />} Gerar link de dono</Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {pagando && <RegistrarPagamento e={e} onFechar={() => setPagando(false)} />}
      <Confirmar aberto={!!cancelar} onAberto={(v) => !v && setCancelar(null)} titulo="Cancelar este pagamento?"
        descricao="Use quando foi lançado errado. Se ele foi o último, o vencimento volta para a data anterior."
        textoConfirmar="Cancelar pagamento" perigoso pedirMotivo
        onConfirmar={async (m) => {
          const { error } = await supabase.rpc('admin_cancelar_pagamento', { p_pagamento: cancelar!.id, p_motivo: m || null })
          if (error) { toast.error(mensagemErro(error)); throw error }
          toast.success('Pagamento cancelado.')
          qc.invalidateQueries({ queryKey: ['admin'] })
        }} />
    </>
  )
}
