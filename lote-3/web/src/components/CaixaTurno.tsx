import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Lock, LockOpen, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarMoeda, hojeISO } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface CaixaAtual {
  aberto: boolean
  id?: string
  numero?: number
  aberto_em?: string
  aberto_por_nome?: string | null
  valor_abertura?: number
  sou_eu?: boolean
  esperado_agora?: number // só o dono recebe
  vendas?: number         // só o dono recebe
  ultimo_contado?: number | null
}

interface Fechamento {
  numero: number
  valor_abertura: number
  valor_contado: number
  valor_esperado: number
  diferenca: number
  vendas: number
}

const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '')
const dia = (iso?: string) => (iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso)) : '')

/** Caixa aberto num dia anterior (esquecido aberto). */
export function caixaDeOutroDia(c?: CaixaAtual | null) {
  if (!c?.aberto || !c.aberto_em) return false
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(c.aberto_em)) < hojeISO()
}

/** Situação do caixa (turno) da empresa. */
export function useCaixa() {
  const { empresa } = useEmpresa()
  return useQuery({
    queryKey: ['caixa-turno', empresa?.id],
    enabled: !!empresa,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('caixa_atual', { p_empresa: empresa!.id })
      if (error) throw error
      return data as CaixaAtual
    },
  })
}

function useAtualizarCaixa() {
  const qc = useQueryClient()
  return () => {
    for (const k of ['caixa-turno', 'caixa-turnos', 'painel']) qc.invalidateQueries({ queryKey: [k] })
  }
}

export function DialogoAbrirCaixa({ aberto, onAberto, sugestao }: { aberto: boolean; onAberto: (v: boolean) => void; sugestao?: number | null }) {
  const { empresa } = useEmpresa()
  const atualizar = useAtualizarCaixa()
  const [valor, setValor] = useState<number | null>(sugestao ?? null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Ao abrir o diálogo, sugere o valor que ficou na gaveta no último fechamento
  useEffect(() => {
    if (aberto) { setValor(sugestao ?? null); setErro(null) }
  }, [aberto, sugestao])

  async function abrir() {
    if (valor === null) return setErro('Informe quanto tem de dinheiro na gaveta (pode ser 0).')
    setSalvando(true)
    const { error } = await supabase.rpc('abrir_caixa', { p_empresa: empresa!.id, p_valor: valor })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Caixa aberto. Boas vendas!')
    atualizar()
    onAberto(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir caixa</DialogTitle>
          <DialogDescription>Conte o dinheiro que está na gaveta agora (troco) e informe abaixo.</DialogDescription>
        </DialogHeader>
        <Campo rotulo="Dinheiro na gaveta" htmlFor="valor-abertura" erro={erro ?? undefined}
          dica={sugestao != null ? `No último fechamento ficaram ${formatarMoeda(sugestao)}.` : undefined}>
          <CampoDinheiro id="valor-abertura" autoFocus value={valor} onChange={(v) => { setValor(v); setErro(null) }} className="h-12 text-lg" />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAberto(false)}>Cancelar</Button>
          <Button onClick={abrir} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <LockOpen />} Abrir caixa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ResultadoFechamento({ r }: { r: Fechamento }) {
  const dif = Number(r.diferenca)
  const tom = dif === 0 ? 'ok' : dif > 0 ? 'sobra' : 'falta'
  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-3 rounded-xl p-4',
        tom === 'ok' && 'bg-accent text-accent-foreground',
        tom === 'sobra' && 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
        tom === 'falta' && 'bg-destructive/10 text-destructive')}>
        {tom === 'ok' ? <CheckCircle2 className="size-7" /> : tom === 'sobra' ? <TrendingUp className="size-7" /> : <TrendingDown className="size-7" />}
        <div>
          <p className="text-lg font-semibold">
            {tom === 'ok' ? 'Bateu certinho!' : tom === 'sobra' ? `Sobrou ${formatarMoeda(dif)}` : `Faltou ${formatarMoeda(-dif)}`}
          </p>
          <p className="text-sm opacity-80">Caixa nº {r.numero} · {r.vendas} {r.vendas === 1 ? 'venda' : 'vendas'} no turno</p>
        </div>
      </div>
      <dl className="divide-y rounded-xl border text-sm">
        <div className="flex justify-between p-3"><dt className="text-muted-foreground">Abriu com</dt><dd className="tabular">{formatarMoeda(r.valor_abertura)}</dd></div>
        <div className="flex justify-between p-3"><dt className="text-muted-foreground">Deveria ter na gaveta</dt><dd className="tabular">{formatarMoeda(r.valor_esperado)}</dd></div>
        <div className="flex justify-between p-3 font-medium"><dt>Contado</dt><dd className="tabular">{formatarMoeda(r.valor_contado)}</dd></div>
      </dl>
    </div>
  )
}

export function DialogoFecharCaixa({ aberto, onAberto, caixa }: { aberto: boolean; onAberto: (v: boolean) => void; caixa: CaixaAtual }) {
  const atualizar = useAtualizarCaixa()
  const [valor, setValor] = useState<number | null>(null)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<Fechamento | null>(null)

  async function fechar() {
    if (valor === null) return setErro('Conte o dinheiro da gaveta e informe o valor.')
    setSalvando(true)
    const { data, error } = await supabase.rpc('fechar_caixa', { p_turno: caixa.id!, p_valor_contado: valor, p_observacoes: obs || null })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    setResultado(data as Fechamento)
    atualizar()
  }

  function mudar(v: boolean) {
    onAberto(v)
    if (!v) { setValor(null); setObs(''); setErro(null); setResultado(null) }
  }

  return (
    <Dialog open={aberto} onOpenChange={mudar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{resultado ? 'Caixa fechado' : 'Fechar caixa'}</DialogTitle>
          {!resultado && (
            <DialogDescription>
              Caixa nº {caixa.numero} · aberto por {caixa.aberto_por_nome ?? 'alguém'} às {hora(caixa.aberto_em)}. Conte todo o dinheiro da gaveta.
            </DialogDescription>
          )}
        </DialogHeader>
        {resultado ? (
          <>
            <ResultadoFechamento r={resultado} />
            <DialogFooter><Button onClick={() => mudar(false)}>Pronto</Button></DialogFooter>
          </>
        ) : (
          <>
            <Campo rotulo="Dinheiro contado na gaveta" htmlFor="valor-contado" erro={erro ?? undefined}>
              <CampoDinheiro id="valor-contado" autoFocus value={valor} onChange={(v) => { setValor(v); setErro(null) }} className="h-12 text-lg" />
            </Campo>
            <Campo rotulo="Observação" htmlFor="obs-fechamento" opcional>
              <Textarea id="obs-fechamento" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: troco de R$ 50 emprestado ao vizinho" />
            </Campo>
            <DialogFooter>
              <Button variant="outline" onClick={() => mudar(false)}>Cancelar</Button>
              <Button onClick={fechar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Lock />} Fechar caixa</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Faixa com a situação do caixa: aberto (quem, desde quando) ou fechado (botão de abrir).
 * `destaque`: versão grande usada quando o caixa fechado impede a venda.
 */
export function BarraCaixa({ destaque }: { destaque?: boolean }) {
  const { ehDono } = useEmpresa()
  const caixa = useCaixa()
  const [abrir, setAbrir] = useState(false)
  // Guarda o turno que está sendo fechado: depois de fechar, a faixa muda para "caixa fechado",
  // mas o diálogo precisa continuar aberto para mostrar o resultado.
  const [fechando, setFechando] = useState<CaixaAtual | null>(null)
  const c = caixa.data
  if (!c) return null
  const dialogos = (
    <>
      <DialogoAbrirCaixa aberto={abrir} onAberto={setAbrir} sugestao={c.ultimo_contado} />
      {fechando && <DialogoFecharCaixa aberto onAberto={(v) => !v && setFechando(null)} caixa={fechando} />}
    </>
  )

  if (!c.aberto)
    return (
      <>
        <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-warning/15 p-3', destaque && 'p-5')}>
          <Lock className={cn('shrink-0 text-amber-700', destaque ? 'size-7' : 'size-5')} />
          <div className="min-w-[10rem] flex-1">
            <p className="font-medium">Caixa fechado</p>
            <p className="text-sm text-muted-foreground">{destaque ? 'Para vender, abra o caixa informando quanto tem na gaveta.' : 'Abra o caixa para começar a vender.'}</p>
          </div>
          <Button onClick={() => setAbrir(true)} size={destaque ? 'lg' : 'default'}><LockOpen /> Abrir caixa</Button>
        </div>
        {dialogos}
      </>
    )

  // Caixa esquecido aberto de outro dia: avisa e deixa qualquer pessoa fechar
  const deOutroDia = caixaDeOutroDia(c)
  const podeFechar = c.sou_eu || ehDono || deOutroDia
  return (
    <>
      {deOutroDia && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-300 bg-warning/15 p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <p>
            <strong>Este caixa está aberto desde {dia(c.aberto_em)}.</strong> As vendas de hoje estão entrando no turno daquele dia.
            Conte a gaveta, feche e abra um caixa novo para hoje.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-3">
        <LockOpen className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-sm">
          <p>
            <span className="font-medium">Caixa nº {c.numero} aberto</span>{' '}
            <span className="text-muted-foreground">
              por {c.sou_eu ? 'você' : c.aberto_por_nome ?? 'alguém'} · {dia(c.aberto_em)} às {hora(c.aberto_em)}
            </span>
          </p>
          {ehDono && c.esperado_agora != null && (
            <p className="text-muted-foreground">
              Deve ter na gaveta: <span className="font-medium text-foreground tabular">{formatarMoeda(c.esperado_agora)}</span>
              {' · '}<Link to="/financeiro/caixa/turnos" className="text-primary hover:underline">Ver turnos</Link>
            </p>
          )}
          {!podeFechar && !deOutroDia && <p className="text-muted-foreground">Na troca de turno, {c.aberto_por_nome ?? 'quem abriu'} fecha o caixa e você abre o seu.</p>}
        </div>
        {podeFechar && <Button variant="outline" size="sm" onClick={() => setFechando(c)}><Lock /> Fechar caixa</Button>}
      </div>
      {dialogos}
    </>
  )
}
