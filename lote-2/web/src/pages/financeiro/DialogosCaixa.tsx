import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Loader2, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { Caixinha } from '@/components/Caixinha'
import { Confirmar } from '@/components/Confirmar'
import { useCategorias } from '@/lib/consultas'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { diasAtrasISO, formatarData, formatarDataHora, formatarMoeda, hojeISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOME_FORMA, NOME_ORIGEM, type ContaFinanceira, type FormaPagamento, type Lancamento } from '@/types'

const invalidar = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of ['caixa', 'contas-financeiras', 'painel']) qc.invalidateQueries({ queryKey: [k] })
}

export function LancarDialog({ empresaId, contas, onFechar }: { empresaId: string; contas: ContaFinanceira[]; onFechar: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('saida')
  const cats = useCategorias(empresaId, tipo === 'entrada' ? 'receita' : 'despesa')
  const [valor, setValor] = useState<number | null>(null)
  const [descricao, setDescricao] = useState('')
  const [conta, setConta] = useState(contas.find((c) => c.tipo === 'caixa')?.id ?? contas[0]?.id ?? '')
  const [categoria, setCategoria] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')
  const [data, setData] = useState(hojeISO())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.rpc('lancar_caixa', {
      p_empresa: empresaId, p_tipo: tipo, p_valor: valor ?? 0, p_descricao: descricao, p_conta_financeira: conta,
      p_data: data, p_categoria: categoria || null, p_forma: forma,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success(tipo === 'entrada' ? 'Entrada lançada!' : 'Saída lançada!')
    invalidar(qc)
    onFechar()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar no caixa</DialogTitle>
          <DialogDescription>Para despesas pagas na hora (combustível, lanche) ou dinheiro que entrou sem venda (aporte).</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(['saida', 'entrada'] as const).map((t) => (
              <button key={t} type="button" onClick={() => { setTipo(t); setCategoria('') }}
                className={cn('rounded-lg border py-2.5 text-sm font-medium', tipo === t ? (t === 'entrada' ? 'border-primary bg-accent text-accent-foreground' : 'border-destructive bg-destructive/10 text-destructive') : 'hover:bg-muted')}>
                {t === 'entrada' ? 'Entrada' : 'Saída'}
              </button>
            ))}
          </div>
          <Campo rotulo="Descrição" htmlFor="l-desc"><Input id="l-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === 'saida' ? 'Ex.: Combustível da entrega' : 'Ex.: Aporte do dono'} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor" htmlFor="l-valor"><CampoDinheiro id="l-valor" value={valor} onChange={setValor} /></Campo>
            <Campo rotulo="Data" htmlFor="l-data"><Input id="l-data" type="date" min={diasAtrasISO(60)} max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
            <Campo rotulo="Conta" htmlFor="l-conta">
              <NativeSelect id="l-conta" value={conta} onChange={(e) => setConta(e.target.value)}>
                {contas.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </NativeSelect>
            </Campo>
            <Campo rotulo="Forma" htmlFor="l-forma">
              <NativeSelect id="l-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                {(['dinheiro', 'pix', 'transferencia', 'cartao_debito', 'cartao_credito', 'boleto'] as FormaPagamento[]).map((f) => <option key={f} value={f}>{NOME_FORMA[f]}</option>)}
              </NativeSelect>
            </Campo>
          </div>
          <Campo rotulo="Categoria" htmlFor="l-cat" opcional>
            <NativeSelect id="l-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Sem categoria</option>
              {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </NativeSelect>
          </Campo>
          {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Lançar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TransferirDialog({ empresaId, contas, onFechar }: { empresaId: string; contas: ContaFinanceira[]; onFechar: () => void }) {
  const qc = useQueryClient()
  const ativas = contas.filter((c) => c.ativo)
  const [de, setDe] = useState(ativas.find((c) => c.tipo === 'caixa')?.id ?? ativas[0]?.id ?? '')
  const [para, setPara] = useState(ativas.find((c) => c.tipo === 'banco')?.id ?? ativas[1]?.id ?? '')
  const [valor, setValor] = useState<number | null>(null)
  const [data, setData] = useState(hojeISO())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.rpc('transferir_entre_contas', { p_empresa: empresaId, p_de: de, p_para: para, p_valor: valor ?? 0, p_data: data })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Transferência feita!')
    invalidar(qc)
    onFechar()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir entre contas</DialogTitle>
          <DialogDescription>Ex.: depositou o dinheiro da gaveta no banco. Não conta como entrada nem saída da empresa.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="De" htmlFor="t-de">
              <NativeSelect id="t-de" value={de} onChange={(e) => setDe(e.target.value)}>{ativas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</NativeSelect>
            </Campo>
            <Campo rotulo="Para" htmlFor="t-para">
              <NativeSelect id="t-para" value={para} onChange={(e) => setPara(e.target.value)}>{ativas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</NativeSelect>
            </Campo>
            <Campo rotulo="Valor" htmlFor="t-valor"><CampoDinheiro id="t-valor" value={valor} onChange={setValor} /></Campo>
            <Campo rotulo="Data" htmlFor="t-data"><Input id="t-data" type="date" min={diasAtrasISO(60)} max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
          </div>
          {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Transferir</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ContasDialog({ empresaId, contas, onFechar }: { empresaId: string; contas: ContaFinanceira[]; onFechar: () => void }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState<Partial<ContaFinanceira> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editando?.nome || editando.nome.trim().length < 2) return setErro('Informe o nome da conta.')
    setSalvando(true)
    const dados = { nome: editando.nome.trim(), tipo: editando.tipo ?? 'banco', saldo_inicial: editando.saldo_inicial ?? 0, ativo: editando.ativo ?? true }
    const { error } = editando.id
      ? await supabase.from('contas_financeiras').update(dados).eq('id', editando.id)
      : await supabase.from('contas_financeiras').insert({ ...dados, empresa_id: empresaId })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Conta salva!')
    invalidar(qc)
    setEditando(null)
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? (editando.id ? 'Editar conta' : 'Nova conta') : 'Contas'}</DialogTitle>
          <DialogDescription>{editando ? 'Saldo inicial é quanto tinha na conta quando você começou a usar o sistema.' : 'Onde o dinheiro da empresa fica: gaveta, bancos, maquininha.'}</DialogDescription>
        </DialogHeader>
        {editando ? (
          <form onSubmit={salvar} className="grid gap-4">
            <Campo rotulo="Nome" htmlFor="cf-nome"><Input id="cf-nome" value={editando.nome ?? ''} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} placeholder="Ex.: Banco do Brasil" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Tipo" htmlFor="cf-tipo">
                <NativeSelect id="cf-tipo" value={editando.tipo ?? 'banco'} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as 'caixa' | 'banco' })}>
                  <option value="caixa">Dinheiro (caixa)</option><option value="banco">Banco / Pix</option>
                </NativeSelect>
              </Campo>
              <Campo rotulo="Saldo inicial" htmlFor="cf-saldo"><CampoDinheiro id="cf-saldo" value={editando.saldo_inicial ?? null} onChange={(v) => setEditando({ ...editando, saldo_inicial: v ?? 0 })} /></Campo>
            </div>
            {editando.id && <Caixinha checked={editando.ativo ?? true} onChange={(v) => setEditando({ ...editando, ativo: v })} rotulo="Conta ativa" descricao="Contas inativas não aparecem para novos lançamentos." />}
            {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditando(null)}>Voltar</Button>
              <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="grid gap-3">
            <ul className="divide-y rounded-lg border">
              {contas.map((c) => (
                <li key={c.id} className={cn('flex items-center gap-3 px-3 py-2.5', !c.ativo && 'opacity-60')}>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.nome} {!c.ativo && <Badge variant="outline">Inativa</Badge>}</p>
                    <p className="text-xs text-muted-foreground">Saldo inicial {formatarMoeda(c.saldo_inicial)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular">{formatarMoeda(c.saldo_atual)}</span>
                  <Button variant="ghost" size="icon" onClick={() => { setErro(null); setEditando(c) }} aria-label={`Editar ${c.nome}`}><Pencil /></Button>
                </li>
              ))}
            </ul>
            <Button variant="outline" onClick={() => { setErro(null); setEditando({ tipo: 'banco', saldo_inicial: 0 }) }}><Plus /> Nova conta</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function LancamentoDetalhe({ l, onFechar }: { l: Lancamento; onFechar: () => void }) {
  const qc = useQueryClient()
  const [cancelar, setCancelar] = useState(false)
  const rec = useQuery({
    queryKey: ['caixa', 'recebimento', l.origem_id],
    enabled: l.origem_tipo === 'recebimento' && !!l.origem_id,
    queryFn: async () => {
      const { data } = await supabase.from('recebimentos').select('conta_receber_id').eq('id', l.origem_id!).maybeSingle()
      return data?.conta_receber_id as string | undefined
    },
  })
  const link = l.origem_tipo === 'venda' ? `/vendas/${l.origem_id}`
    : l.origem_tipo === 'conta_pagar' ? `/financeiro/pagar/${l.origem_id}`
    : l.origem_tipo === 'recebimento' && rec.data ? `/financeiro/receber/${rec.data}` : null
  const cancelavel = l.status === 'confirmado' && (l.origem_tipo === 'manual' || l.origem_tipo === 'transferencia')

  return (
    <>
      <Dialog open={!cancelar} onOpenChange={(v) => !v && onFechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={l.tipo === 'entrada' ? 'text-primary' : 'text-destructive'}>
              {l.tipo === 'entrada' ? '+' : '−'}{formatarMoeda(l.valor)}
            </DialogTitle>
            <DialogDescription>{l.descricao}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Data</dt><dd>{formatarData(l.data)}</dd>
            <dt className="text-muted-foreground">Conta</dt><dd>{l.conta_nome}</dd>
            {l.categoria_nome && <><dt className="text-muted-foreground">Categoria</dt><dd>{l.categoria_nome}</dd></>}
            {l.forma_pagamento && <><dt className="text-muted-foreground">Forma</dt><dd>{NOME_FORMA[l.forma_pagamento]}</dd></>}
            <dt className="text-muted-foreground">Origem</dt><dd>{link ? <Link to={link} className="text-primary hover:underline">{NOME_ORIGEM[l.origem_tipo]}</Link> : NOME_ORIGEM[l.origem_tipo]}</dd>
            <dt className="text-muted-foreground">Lançado</dt><dd>{formatarDataHora(l.created_at)}{l.criado_por_nome ? ` · ${l.criado_por_nome}` : ''}</dd>
            {l.status === 'cancelado' && <><dt className="text-muted-foreground">Situação</dt><dd className="text-destructive">Cancelado{l.motivo_cancelamento ? `: ${l.motivo_cancelamento}` : ''}</dd></>}
          </dl>
          {!cancelavel && l.status === 'confirmado' && l.origem_tipo !== 'manual' && l.origem_tipo !== 'transferencia' && (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">Para desfazer, use a origem ({NOME_ORIGEM[l.origem_tipo].toLowerCase()}): cancele a venda ou estorne o pagamento/recebimento.</p>
          )}
          <DialogFooter>
            {cancelavel && <Button variant="ghost" className="text-destructive" onClick={() => setCancelar(true)}><Ban /> Cancelar lançamento</Button>}
            <Button variant="outline" onClick={onFechar}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Confirmar aberto={cancelar} onAberto={(v) => { if (!v) onFechar() }} titulo="Cancelar este lançamento?"
        descricao={l.origem_tipo === 'transferencia' ? 'Os dois lados da transferência serão cancelados.' : 'O valor sai do saldo. O lançamento fica no histórico como cancelado.'}
        textoConfirmar="Cancelar lançamento" perigoso pedirMotivo
        onConfirmar={async (m) => {
          const { error } = await supabase.rpc('cancelar_lancamento', { p_lancamento: l.id, p_motivo: m || null })
          if (error) { toast.error(mensagemErro(error)); throw error }
          toast.success('Lançamento cancelado.'); invalidar(qc)
        }} />
    </>
  )
}
