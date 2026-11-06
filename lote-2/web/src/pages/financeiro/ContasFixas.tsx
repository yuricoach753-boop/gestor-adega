import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pause, Pencil, Play, Plus, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { SomenteDono } from '@/components/Guards'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { useCategorias } from '@/lib/consultas'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarData, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOME_FORMA, type FormaPagamento, type Recorrencia } from '@/types'

const FORMAS: FormaPagamento[] = ['boleto', 'pix', 'dinheiro', 'transferencia', 'cartao_debito', 'cartao_credito']

function Editar({ r, onFechar }: { r: Recorrencia; onFechar: () => void }) {
  const qc = useQueryClient()
  const categorias = useCategorias(r.empresa_id, 'despesa')
  const [descricao, setDescricao] = useState(r.descricao)
  const [valor, setValor] = useState<number | null>(Number(r.valor))
  const [dia, setDia] = useState(String(r.dia_vencimento))
  const [forma, setForma] = useState<FormaPagamento>(r.forma_pagamento ?? 'boleto')
  const [categoriaId, setCategoriaId] = useState(r.categoria_id ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const d = parseInt(dia)
    if (descricao.trim().length < 2) return setErro('Informe a descrição.')
    if (!valor) return setErro('Informe o valor.')
    if (!d || d < 1 || d > 31) return setErro('O dia precisa ser entre 1 e 31.')
    setSalvando(true)
    const { error } = await supabase.from('recorrencias').update({
      descricao: descricao.trim(), valor, dia_vencimento: d, forma_pagamento: forma, categoria_id: categoriaId || null,
    }).eq('id', r.id)
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Conta fixa atualizada!')
    qc.invalidateQueries({ queryKey: ['recorrencias'] })
    onFechar()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar conta fixa</DialogTitle>
          <DialogDescription>Vale para os próximos meses. As contas que já apareceram não mudam (edite cada uma se precisar).</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <Campo rotulo="Descrição" htmlFor="r-desc"><Input id="r-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor" htmlFor="r-valor"><CampoDinheiro id="r-valor" value={valor} onChange={setValor} /></Campo>
            <Campo rotulo="Vence todo dia" htmlFor="r-dia"><Input id="r-dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} /></Campo>
            <Campo rotulo="Forma" htmlFor="r-forma">
              <NativeSelect id="r-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                {FORMAS.map((f) => <option key={f} value={f}>{NOME_FORMA[f]}</option>)}
              </NativeSelect>
            </Campo>
            <Campo rotulo="Categoria" htmlFor="r-cat">
              <NativeSelect id="r-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Sem categoria</option>
                {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </NativeSelect>
            </Campo>
          </div>
          {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Lista() {
  const { empresa } = useEmpresa()
  const qc = useQueryClient()
  const [editando, setEditando] = useState<Recorrencia | null>(null)

  const q = useQuery({
    queryKey: ['recorrencias', empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_recorrencias').select('*').eq('empresa_id', empresa!.id).order('ativo', { ascending: false }).order('dia_vencimento')
      if (error) throw error
      return data as Recorrencia[]
    },
  })

  async function alternar(r: Recorrencia) {
    const { error } = await supabase.from('recorrencias').update({ ativo: !r.ativo }).eq('id', r.id)
    if (error) return toast.error(mensagemErro(error))
    if (!r.ativo) await supabase.rpc('gerar_recorrentes', { p_empresa: r.empresa_id })
    toast.success(r.ativo ? 'Conta fixa pausada. Não serão criadas novas contas.' : 'Conta fixa reativada!')
    for (const k of ['recorrencias', 'contas-pagar', 'gerar-recorrentes', 'painel']) qc.invalidateQueries({ queryKey: [k] })
  }

  if (q.isLoading) return <ListaCarregando />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  if (!q.data!.length)
    return (
      <EmptyState icone={Repeat} titulo="Nenhuma conta fixa"
        descricao="Aluguel, luz, internet, salários: cadastre uma vez e a conta aparece sozinha todo mês em Contas a pagar."
        acao={<Button asChild size="lg"><Link to="/financeiro/pagar/nova?fixa=1"><Plus /> Nova conta fixa</Link></Button>} />
    )

  const totalMes = q.data!.filter((r) => r.ativo).reduce((s, r) => s + Number(r.valor), 0)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3">
        <p className="text-xs text-muted-foreground">Total das contas fixas ativas por mês</p>
        <p className="mt-0.5 text-xl font-semibold tabular">{formatarMoeda(totalMes)}</p>
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {q.data!.map((r) => (
          <li key={r.id} className={cn('flex items-center gap-3 px-4 py-3', !r.ativo && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="line-clamp-2 font-medium leading-snug">{r.descricao}</p>
                <span className="shrink-0 font-semibold tabular">{formatarMoeda(r.valor)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Todo dia {r.dia_vencimento}{r.categoria_nome ? ` · ${r.categoria_nome}` : ''}{r.forma_pagamento ? ` · ${NOME_FORMA[r.forma_pagamento]}` : ''}
              </p>
              {r.ativo
                ? r.proximo_vencimento && <p className="text-xs text-muted-foreground">Próxima em aberto: {formatarData(r.proximo_vencimento)}</p>
                : <Badge variant="outline" className="mt-1">Pausada</Badge>}
            </div>
            <div className="flex shrink-0 flex-col sm:flex-row">
              <Button variant="ghost" size="icon" onClick={() => setEditando(r)} aria-label={`Editar ${r.descricao}`}><Pencil /></Button>
              <Button variant="ghost" size="icon" onClick={() => alternar(r)} aria-label={r.ativo ? `Pausar ${r.descricao}` : `Reativar ${r.descricao}`}>
                {r.ativo ? <Pause /> : <Play />}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {editando && <Editar r={editando} onFechar={() => setEditando(null)} />}
    </div>
  )
}

export default function ContasFixas() {
  return (
    <>
      <PageHeader titulo="Contas fixas" descricao="Contas que se repetem todo mês." voltarPara="/financeiro/pagar"
        acoes={<Button asChild><Link to="/financeiro/pagar/nova?fixa=1"><Plus /> <span className="hidden sm:inline">Nova conta fixa</span></Link></Button>} />
      <SomenteDono><Lista /></SomenteDono>
    </>
  )
}
