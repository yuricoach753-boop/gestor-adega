import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound, Link2, Loader2, MessageCircle, MoreVertical, ShieldCheck, UserMinus, UserPlus, UserRoundCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Campo } from '@/components/Campo'
import { PageHeader } from '@/components/PageHeader'
import { SomenteDono } from '@/components/Guards'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarData, linkWhatsApp } from '@/lib/format'
import { cn, iniciais } from '@/lib/utils'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { NOME_PAPEL, type Convite, type Membro, type Papel } from '@/types'
import { ehLoginWhatsapp, mostrarLogin } from '@/lib/login'

const DESCRICAO_PAPEL: Record<Papel, string> = {
  funcionario: 'Só balcão: vende, consulta preço e estoque, separa pedidos. Não vê faturamento, custo, caixa, contas nem relatórios. Entra com o WhatsApp.',
  dono: 'Acesso total, inclusive financeiro, relatórios e usuários.',
}

const linkConvite = (token: string) => `${window.location.origin}/convite/${token}`

function CompartilharConvite({ convite, empresaNome }: { convite: Convite; empresaNome: string }) {
  const [copiado, setCopiado] = useState(false)
  const link = linkConvite(convite.token)
  const msg = `Olá${convite.nome ? `, ${convite.nome}` : ''}! Você foi convidado para usar o sistema da ${empresaNome}. Toque no link para entrar: ${link}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Segure o dedo no link para copiar.')
    }
  }

  return (
    <div className="grid gap-3">
      <div className="break-all rounded-lg border bg-muted px-3 py-2 font-mono text-xs">{link}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild>
          <a href={linkWhatsApp(msg)} target="_blank" rel="noreferrer"><MessageCircle /> Enviar pelo WhatsApp</a>
        </Button>
        <Button variant="outline" onClick={copiar}>
          {copiado ? <Check /> : <Copy />} {copiado ? 'Copiado!' : 'Copiar link'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">O link vale por 7 dias e só pode ser usado uma vez.</p>
    </div>
  )
}

function DialogoConvidar({ aberto, onAberto }: { aberto: boolean; onAberto: (v: boolean) => void }) {
  const { empresa } = useEmpresa()
  const qc = useQueryClient()
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState<Papel>('funcionario')
  const [criado, setCriado] = useState<Convite | null>(null)

  const criar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('convites')
        .insert({ empresa_id: empresa!.id, nome: nome.trim() || null, papel })
        .select('*')
        .single()
      if (error) throw error
      return data as Convite
    },
    onSuccess: (c) => {
      setCriado(c)
      qc.invalidateQueries({ queryKey: ['convites', empresa?.id] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  function mudarAberto(v: boolean) {
    onAberto(v)
    if (!v) setTimeout(() => { setCriado(null); setNome(''); setPapel('funcionario') }, 200)
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{criado ? 'Convite pronto' : 'Convidar pessoa'}</DialogTitle>
          <DialogDescription>
            {criado ? 'Envie o link para a pessoa. Ela cria a senha e já entra na empresa.' : 'Geramos um link de convite para você mandar pelo WhatsApp.'}
          </DialogDescription>
        </DialogHeader>

        {criado ? (
          <CompartilharConvite convite={criado} empresaNome={empresa!.nome_fantasia} />
        ) : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); criar.mutate() }}>
            <Campo rotulo="Nome da pessoa" htmlFor="conv-nome" opcional>
              <Input id="conv-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João" />
            </Campo>
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">Permissão</legend>
              {(['funcionario', 'dono'] as Papel[]).map((p) => (
                <label
                  key={p}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
                    papel === p ? 'border-primary bg-accent/60' : 'hover:bg-muted',
                  )}
                >
                  <input type="radio" name="papel" value={p} checked={papel === p} onChange={() => setPapel(p)} className="mt-1 accent-[var(--primary)]" />
                  <span>
                    <span className="block font-medium">{NOME_PAPEL[p]}</span>
                    <span className="block text-sm text-muted-foreground">{DESCRICAO_PAPEL[p]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => mudarAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={criar.isPending}>
                {criar.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Gerar link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ListaUsuarios() {
  const { empresa } = useEmpresa()
  const qc = useQueryClient()
  const [convidar, setConvidar] = useState(false)
  const [verConvite, setVerConvite] = useState<Convite | null>(null)
  const [trocarSenha, setTrocarSenha] = useState<Membro | null>(null)

  const membros = useQuery({
    queryKey: ['membros', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('listar_membros', { p_empresa: empresa!.id })
      if (error) throw error
      return data as Membro[]
    },
  })

  const convites = useQuery({
    queryKey: ['convites', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('convites')
        .select('*')
        .eq('empresa_id', empresa!.id)
        .is('aceito_em', null)
        .is('cancelado_em', null)
        .gt('expira_em', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Convite[]
    },
  })

  const alterar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<Pick<Membro, 'papel' | 'ativo'>> }) => {
      const { error } = await supabase.from('membros_empresa').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Acesso atualizado.'); qc.invalidateQueries({ queryKey: ['membros', empresa?.id] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const cancelarConvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('convites').update({ cancelado_em: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Convite cancelado.'); qc.invalidateQueries({ queryKey: ['convites', empresa?.id] }) },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <>
      <PageHeader
        titulo="Usuários"
        descricao="Quem pode usar o sistema da sua empresa."
        voltarPara="/configuracoes"
        acoes={<Button onClick={() => setConvidar(true)}><UserPlus /> <span className="hidden sm:inline">Convidar</span></Button>}
      />

      <div className="space-y-6">
        <section className="divide-y overflow-hidden rounded-xl border bg-card">
          {membros.isLoading &&
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4"><Skeleton className="size-10 rounded-full" /><Skeleton className="h-4 w-40" /></div>
            ))}
          {membros.error && <p className="p-4 text-sm text-destructive">{mensagemErro(membros.error)}</p>}
          {membros.data?.map((m) => (
            <div key={m.id} className={cn('flex items-center gap-3 p-4', !m.ativo && 'opacity-60')}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {iniciais(m.nome || mostrarLogin(m.email))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.nome || 'Sem nome'} {m.eu && <span className="text-sm font-normal text-muted-foreground">(você)</span>}
                </p>
                <p className="truncate text-sm text-muted-foreground">{mostrarLogin(m.email)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                <Badge variant={m.papel === 'dono' ? 'default' : 'secondary'}>{NOME_PAPEL[m.papel]}</Badge>
                {!m.ativo && <Badge variant="outline">Sem acesso</Badge>}
              </div>
              {!m.eu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Opções de ${m.nome || m.email}`}><MoreVertical /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {m.ativo && (
                      <DropdownMenuItem onSelect={() => alterar.mutate({ id: m.id, campos: { papel: m.papel === 'dono' ? 'funcionario' : 'dono' } })}>
                        <ShieldCheck /> {m.papel === 'dono' ? 'Mudar para funcionário' : 'Tornar dono'}
                      </DropdownMenuItem>
                    )}
                    {m.ativo && m.papel === 'funcionario' && ehLoginWhatsapp(m.email) && (
                      <DropdownMenuItem onSelect={() => setTrocarSenha(m)}>
                        <KeyRound /> Trocar senha
                      </DropdownMenuItem>
                    )}
                    {m.ativo ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => alterar.mutate({ id: m.id, campos: { ativo: false } })}>
                        <UserMinus /> Tirar acesso
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => alterar.mutate({ id: m.id, campos: { ativo: true } })}>
                        <UserRoundCheck /> Devolver acesso
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </section>

        {membros.data && membros.data.length === 1 && !convites.data?.length && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="font-medium">Só você usa o sistema por enquanto</p>
            <p className="max-w-sm text-sm text-muted-foreground">Convide seus funcionários. Eles vendem e cuidam do estoque, sem ver o financeiro.</p>
            <Button className="mt-2" onClick={() => setConvidar(true)}><UserPlus /> Convidar funcionário</Button>
          </div>
        )}

        {!!convites.data?.length && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Convites aguardando</h2>
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {convites.data.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-4">
                  <Link2 className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.nome || 'Convite sem nome'}</p>
                    <p className="text-sm text-muted-foreground">{NOME_PAPEL[c.papel]} · vale até {formatarData(c.expira_em)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setVerConvite(c)}>Ver link</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => cancelarConvite.mutate(c.id)} disabled={cancelarConvite.isPending}>
                    Cancelar
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <DialogoConvidar aberto={convidar} onAberto={setConvidar} />
      {trocarSenha && empresa && (
        <DialogoTrocarSenha membro={trocarSenha} empresaId={empresa.id} onFechar={() => setTrocarSenha(null)} />
      )}

      <Dialog open={!!verConvite} onOpenChange={(v) => !v && setVerConvite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link do convite</DialogTitle>
            <DialogDescription>{verConvite?.nome || 'Convite'} · {verConvite && NOME_PAPEL[verConvite.papel]}</DialogDescription>
          </DialogHeader>
          {verConvite && <CompartilharConvite convite={verConvite} empresaNome={empresa!.nome_fantasia} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function DialogoTrocarSenha({ membro, empresaId, onFechar }: { membro: Membro; empresaId: string; onFechar: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    setSalvando(true)
    const { error } = await supabase.rpc('redefinir_senha_membro', { p_empresa: empresaId, p_membro: membro.id, p_senha: senha })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Senha trocada. Avise o funcionário.')
    onFechar()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trocar senha</DialogTitle>
          <DialogDescription>{membro.nome || 'Funcionário'} · entra com o WhatsApp {mostrarLogin(membro.email)}</DialogDescription>
        </DialogHeader>
        <Campo rotulo="Senha nova" htmlFor="senha-nova" erro={erro ?? undefined} dica="Pelo menos 6 caracteres. Passe para o funcionário pessoalmente. Quem estiver logado com a senha antiga é desconectado (em até 1 hora).">
          <Input id="senha-nova" type="text" autoComplete="off" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(null) }} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar senha</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Usuarios() {
  const { empresa } = useEmpresa()
  return (
    <SomenteDono>
      <ListaUsuarios key={empresa?.id} />
    </SomenteDono>
  )
}
