import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { Caixinha } from '@/components/Caixinha'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Plano } from '@/types'

function EditarPlano({ plano, onFechar }: { plano: Partial<Plano>; onFechar: () => void }) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(plano.nome ?? '')
  const [valor, setValor] = useState<number | null>(plano.valor_mensal ?? null)
  const [limite, setLimite] = useState(plano.limite_usuarios ? String(plano.limite_usuarios) : '')
  const [ativo, setAtivo] = useState(plano.ativo ?? true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nome.trim().length < 2) return setErro('Informe o nome do plano.')
    if (valor === null) return setErro('Informe o valor mensal.')
    setSalvando(true)
    const dados = { nome: nome.trim(), valor_mensal: valor, limite_usuarios: limite ? Number(limite) : null, ativo }
    const { error } = plano.id ? await supabase.from('planos').update(dados).eq('id', plano.id) : await supabase.from('planos').insert(dados)
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    toast.success('Plano salvo!')
    qc.invalidateQueries({ queryKey: ['admin'] })
    onFechar()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{plano.id ? 'Editar plano' : 'Novo plano'}</DialogTitle></DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <Campo rotulo="Nome" htmlFor="pl-nome"><Input id="pl-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Básico" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor por mês" htmlFor="pl-valor"><CampoDinheiro id="pl-valor" value={valor} onChange={setValor} /></Campo>
            <Campo rotulo="Limite de usuários" htmlFor="pl-lim" opcional dica="Em branco = sem limite">
              <Input id="pl-lim" inputMode="numeric" value={limite} onChange={(e) => setLimite(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </Campo>
          </div>
          <Caixinha checked={ativo} onChange={setAtivo} rotulo="Plano disponível" descricao="Planos inativos continuam valendo para quem já tem, mas não aparecem para novas empresas." />
          {plano.id && <p className="text-xs text-muted-foreground">Mudar o valor afeta o MRR, mas não altera pagamentos já registrados.</p>}
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

export default function AdminPlanos() {
  const [editando, setEditando] = useState<Partial<Plano> | null>(null)
  const q = useQuery({
    queryKey: ['admin', 'planos', 'todos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('planos').select('*').order('ativo', { ascending: false }).order('valor_mensal')
      if (error) throw error
      return data as Plano[]
    },
  })
  return (
    <>
      <PageHeader titulo="Planos" descricao="O que você cobra por mês de cada empresa." acoes={<Button onClick={() => setEditando({})}><Plus /> <span className="hidden sm:inline">Novo plano</span></Button>} />
      {q.isLoading ? <ListaCarregando linhas={3} /> : q.error ? <ErroLista erro={q.error} /> : !q.data!.length ? (
        <EmptyState icone={Tags} titulo="Cadastre seu primeiro plano" descricao="Ex.: Básico R$ 99,90 com até 3 usuários. O plano define o valor da mensalidade e o limite de usuários de cada empresa."
          acao={<Button onClick={() => setEditando({})}><Plus /> Novo plano</Button>} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {q.data!.map((p) => (
            <li key={p.id} className={cn('flex items-center gap-3 px-4 py-3', !p.ativo && 'opacity-60')}>
              <div className="flex-1">
                <p className="font-medium">{p.nome} {!p.ativo && <Badge variant="outline">Inativo</Badge>}</p>
                <p className="text-xs text-muted-foreground">{p.limite_usuarios ? `Até ${p.limite_usuarios} usuários` : 'Usuários ilimitados'}</p>
              </div>
              <span className="font-semibold tabular">{formatarMoeda(p.valor_mensal)}<span className="text-xs font-normal text-muted-foreground">/mês</span></span>
              <Button variant="ghost" size="icon" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}><Pencil /></Button>
            </li>
          ))}
        </ul>
      )}
      {editando && <EditarPlano plano={editando} onFechar={() => setEditando(null)} />}
    </>
  )
}
