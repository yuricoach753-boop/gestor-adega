import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { CampoBusca } from '@/components/CampoBusca'
import { EmptyState } from '@/components/EmptyState'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { BotaoWhatsApp } from '@/components/BotaoWhatsApp'
import { supabase } from '@/lib/supabase'
import { formatarMoeda, semAcento } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AdminEmpresa, Situacao } from '@/types'
import { BadgeAssinatura, mensagemDono, prazo, quandoAcessou } from './comum'

interface Resumo {
  empresas: number; pagantes: number; em_teste: number; teste_acabando: number; vencendo: number
  atrasadas: number; bloqueadas: number; canceladas: number; mrr: number; recebido_mes: number; novas_mes: number
}

type Filtro = 'todas' | 'atencao' | 'pagantes' | 'teste' | 'bloqueadas' | 'canceladas' | 'demo'
const FILTROS: Array<{ v: Filtro; r: string; f: (e: AdminEmpresa) => boolean }> = [
  { v: 'atencao', r: 'Precisa de atenção', f: (e) => !e.usa_dados_exemplo && (['vencendo', 'vencida', 'inadimplente', 'trial_vencido'] as Situacao[]).includes(e.situacao) },
  { v: 'todas', r: 'Todas', f: (e) => !e.usa_dados_exemplo },
  { v: 'pagantes', r: 'Pagantes', f: (e) => !e.usa_dados_exemplo && ['ativa', 'vencendo'].includes(e.situacao) },
  { v: 'teste', r: 'Em teste', f: (e) => !e.usa_dados_exemplo && e.situacao === 'trial' },
  { v: 'bloqueadas', r: 'Bloqueadas', f: (e) => !e.usa_dados_exemplo && ['bloqueada', 'trial_vencido'].includes(e.situacao) },
  { v: 'canceladas', r: 'Canceladas', f: (e) => !e.usa_dados_exemplo && e.situacao === 'cancelada' },
  { v: 'demo', r: 'Demonstração', f: (e) => e.usa_dados_exemplo },
]

export default function AdminEmpresas() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [termo, setTermo] = useState('')

  // Atualiza vencidas/bloqueadas antes de mostrar (o banco também faz isso todo dia, se o agendador estiver ativo)
  const status = useQuery({
    queryKey: ['admin', 'atualizar-status'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_atualizar_status')
      if (error) throw error
      return data as number
    },
  })

  const dados = useQuery({
    queryKey: ['admin', 'empresas', status.dataUpdatedAt],
    enabled: !status.isLoading,
    queryFn: async () => {
      const [l, r] = await Promise.all([supabase.rpc('admin_listar_empresas'), supabase.rpc('admin_resumo')])
      if (l.error) throw l.error
      if (r.error) throw r.error
      return { empresas: l.data as AdminEmpresa[], resumo: r.data as Resumo }
    },
  })

  const lista = useMemo(() => {
    const f = FILTROS.find((x) => x.v === filtro)!.f
    const t = semAcento(termo.trim())
    return (dados.data?.empresas ?? []).filter(f).filter((e) =>
      !t || semAcento(`${e.nome_fantasia} ${e.dono_nome ?? ''} ${e.dono_email ?? ''} ${e.cidade ?? ''} ${e.telefone ?? ''}`).includes(t))
  }, [dados.data, filtro, termo])

  const contagem = (v: Filtro) => (dados.data?.empresas ?? []).filter(FILTROS.find((x) => x.v === v)!.f).length

  return (
    <>
      <PageHeader titulo="Empresas clientes" acoes={<Button asChild><Link to="/admin/empresas/nova"><Plus /> <span className="hidden sm:inline">Nova empresa</span></Link></Button>} />
      {dados.isLoading || status.isLoading ? <ListaCarregando /> : dados.error ? <ErroLista erro={dados.error} tentarDeNovo={() => dados.refetch()} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 sm:gap-3">
            {[
              { t: 'Receita mensal (MRR)', v: formatarMoeda(dados.data!.resumo.mrr), d: `${dados.data!.resumo.pagantes} pagantes` },
              { t: 'Recebido no mês', v: formatarMoeda(dados.data!.resumo.recebido_mes) },
              { t: 'Em teste', v: String(dados.data!.resumo.em_teste), d: dados.data!.resumo.teste_acabando ? `${dados.data!.resumo.teste_acabando} acabando em 3 dias` : undefined },
              { t: 'Vencendo (5 dias)', v: String(dados.data!.resumo.vencendo) },
              { t: 'Atrasadas', v: String(dados.data!.resumo.atrasadas), alerta: dados.data!.resumo.atrasadas > 0 },
              { t: 'Bloqueadas', v: String(dados.data!.resumo.bloqueadas), d: `${dados.data!.resumo.novas_mes} novas no mês` },
            ].map((k) => (
              <div key={k.t} className="rounded-xl border bg-card p-3">
                <p className="text-xs text-muted-foreground">{k.t}</p>
                <p className={cn('mt-0.5 text-lg font-semibold tabular', k.alerta && 'text-destructive')}>{k.v}</p>
                {k.d && <p className="text-xs text-muted-foreground">{k.d}</p>}
              </div>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTROS.map((f) => (
              <button key={f.v} type="button" onClick={() => setFiltro(f.v)}
                className={cn('h-9 shrink-0 rounded-full border px-3 text-sm font-medium', filtro === f.v ? 'border-primary bg-accent text-accent-foreground' : 'bg-card')}>
                {f.r} <span className="text-muted-foreground">({contagem(f.v)})</span>
              </button>
            ))}
          </div>
          <CampoBusca valor={termo} onChange={setTermo} placeholder="Buscar por empresa, dono, e-mail, cidade ou telefone" />

          {lista.length === 0 ? (
            dados.data!.empresas.length === 0
              ? <EmptyState icone={Building2} titulo="Nenhuma empresa ainda" descricao="Quando alguém se cadastrar ou você criar uma empresa para um cliente, ela aparece aqui."
                  acao={<Button asChild><Link to="/admin/empresas/nova"><Plus /> Nova empresa</Link></Button>} />
              : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma empresa neste filtro.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {lista.map((e) => (
                <li key={e.id} className="flex items-center gap-2 pr-2">
                  <button type="button" onClick={() => navigate(`/admin/empresas/${e.id}`)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate font-medium">{e.nome_fantasia}</p>
                        <BadgeAssinatura situacao={e.situacao} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.dono_nome ?? (e.convite_pendente ? 'Convite do dono pendente' : 'Sem dono')}{e.cidade ? ` · ${e.cidade}${e.uf ? `/${e.uf}` : ''}` : ''}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {prazo(e)} · {e.plano_nome ? `${e.plano_nome} ${formatarMoeda(e.valor_mensal)}` : 'sem plano'} · {quandoAcessou(e.ultimo_acesso)} · {e.vendas_30d} vendas em 30 dias
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  <BotaoWhatsApp telefone={e.dono_telefone ?? e.telefone} mensagem={mensagemDono(e)} compacto />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
