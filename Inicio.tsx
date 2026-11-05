import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, CheckCircle2, ChevronRight, Circle, HandCoins, Landmark, Package, PackageCheck, Plus, Receipt, ScanBarcode, ShoppingCart, UserPlus, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErroLista } from '@/components/EstadosLista'
import { BadgeSituacao } from '@/components/BadgeSituacao'
import { BotaoCobrar } from '@/components/BotaoCobrar'
import { GraficoLinhas } from '@/components/graficos/GraficoLinhas'
import { useAuth } from '@/contexts/AuthProvider'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { formatarData, formatarMoeda, formatarQuantidade, hojeISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Unidade } from '@/types'
import { BarraCaixa } from '@/components/CaixaTurno'

interface Painel {
  // só o dono recebe os totais de venda
  vendas_hoje?: { total: number; qtd: number }
  vendas_mes?: { total: number; qtd: number }
  // só o funcionário
  minhas_vendas_hoje?: number
  pedidos_pendentes: number
  estoque_baixo: { qtd: number; itens: Array<{ id: string; nome: string; unidade: Unidade; estoque_atual: number; estoque_minimo: number }> }
  tem_produtos: boolean
  tem_clientes: boolean
  tem_vendas: boolean
  tem_equipe: boolean
  // só o dono
  saldo_caixa?: number
  lucro_mes?: number
  pagar?: { total_7dias: number; qtd_7dias: number; total_atrasado: number; qtd_atrasado: number
    itens: Array<{ id: string; descricao: string; valor: number; vencimento: string; situacao: 'atrasada' | 'vence_hoje' | 'a_vencer' }> }
  receber_atrasado?: { total: number; qtd_clientes: number
    itens: Array<{ cliente_id: string | null; cliente_nome: string | null; cliente_telefone: string | null; total_vencido: number; maior_atraso: number; vencimento_mais_antigo: string }> }
  fluxo_30?: Array<{ dia: string; entradas: number; saidas: number }>
}

function saudacao() {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

function Indicador({ titulo, valor, detalhe, para, icone: Icone, alerta }: {
  titulo: string; valor: string; detalhe?: React.ReactNode; para: string; icone: LucideIcon; alerta?: boolean
}) {
  return (
    <Link to={para} className="group rounded-xl border bg-card p-3 transition-colors hover:bg-muted sm:p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className="size-3.5" /> {titulo}
      </p>
      <p className="mt-1 truncate text-lg font-semibold tabular sm:text-xl">{valor}</p>
      {detalhe && <p className={cn('mt-0.5 text-xs', alerta ? 'font-medium text-destructive' : 'text-muted-foreground')}>{detalhe}</p>}
    </Link>
  )
}

function PrimeirosPassos({ p, ehDono }: { p: Painel; ehDono: boolean }) {
  const passos = [
    { feito: p.tem_produtos, rota: '/produtos/novo', titulo: 'Cadastre seus produtos', icone: Package, soDono: true },
    { feito: p.tem_clientes, rota: '/clientes/novo', titulo: 'Cadastre seus clientes', icone: Users, soDono: true },
    { feito: p.tem_vendas, rota: '/vendas/nova', titulo: 'Faça a primeira venda', icone: ShoppingCart },
    { feito: p.tem_equipe, rota: '/configuracoes/usuarios', titulo: 'Convide sua equipe', icone: UserPlus, soDono: true },
  ].filter((x) => !x.soDono || ehDono)
  if (passos.every((x) => x.feito)) return null
  const feitos = passos.filter((x) => x.feito).length
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Primeiros passos · {feitos} de {passos.length}</CardTitle>
        <CardDescription>Siga estes passos para deixar o sistema pronto.</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-3">
        <ul>
          {passos.map((x) => (
            <li key={x.rota}>
              <Link to={x.rota} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted', x.feito && 'text-muted-foreground')}>
                {x.feito ? <CheckCircle2 className="size-5 text-primary" /> : <Circle className="size-5 text-muted-foreground" />}
                <span className={cn('flex-1 text-sm font-medium', x.feito && 'line-through')}>{x.titulo}</span>
                {!x.feito && <ChevronRight className="size-4 text-muted-foreground" />}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function EstoqueBaixo({ p }: { p: Painel }) {
  if (!p.estoque_baixo.qtd) return null
  return (
    <Card className="gap-2">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /> Estoque baixo</CardTitle>
        <Link to="/produtos" className="text-sm text-primary hover:underline">Ver todos ({p.estoque_baixo.qtd})</Link>
      </CardHeader>
      <ul className="divide-y">
        {p.estoque_baixo.itens.map((i) => (
          <li key={i.id}>
            <Link to={`/produtos/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-muted">
              <span className="truncate">{i.nome}</span>
              <span className={cn('shrink-0 tabular', i.estoque_atual <= 0 ? 'text-destructive' : 'text-amber-700')}>
                {formatarQuantidade(i.estoque_atual, i.unidade)} <span className="text-xs text-muted-foreground">/ mín. {formatarQuantidade(i.estoque_minimo, i.unidade)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function PainelDono({ p }: { p: Painel }) {
  const fluxo = p.fluxo_30 ?? []
  const ent = fluxo.reduce((s, d) => s + Number(d.entradas), 0)
  const sai = fluxo.reduce((s, d) => s + Number(d.saidas), 0)
  const pagar = p.pagar!
  const rec = p.receber_atrasado!
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
        <Indicador titulo="Saldo em caixa hoje" valor={formatarMoeda(p.saldo_caixa)} para="/financeiro/caixa" icone={Landmark}
          detalhe={Number(p.saldo_caixa) < 0 ? 'Saldo negativo' : 'Caixa + bancos'} alerta={Number(p.saldo_caixa) < 0} />
        <Indicador titulo="Vendas hoje" valor={formatarMoeda(p.vendas_hoje!.total)} para="/vendas" icone={ShoppingCart}
          detalhe={`${p.vendas_hoje!.qtd} ${p.vendas_hoje!.qtd === 1 ? 'venda' : 'vendas'}`} />
        <Indicador titulo="Vendas do mês" valor={formatarMoeda(p.vendas_mes!.total)} para="/relatorios" icone={ShoppingCart}
          detalhe={<>Lucro bruto {formatarMoeda(p.lucro_mes)}</>} />
        <Indicador titulo="A pagar em 7 dias" valor={formatarMoeda(Number(pagar.total_7dias) + Number(pagar.total_atrasado))} para="/financeiro/pagar" icone={Receipt}
          detalhe={pagar.qtd_atrasado ? `${formatarMoeda(pagar.total_atrasado)} já atrasado` : `${pagar.qtd_7dias} ${pagar.qtd_7dias === 1 ? 'conta' : 'contas'}`} alerta={pagar.qtd_atrasado > 0} />
        <Indicador titulo="A receber atrasado" valor={formatarMoeda(rec.total)} para="/financeiro/receber" icone={HandCoins}
          detalhe={rec.qtd_clientes ? `${rec.qtd_clientes} ${rec.qtd_clientes === 1 ? 'cliente' : 'clientes'}` : 'Ninguém atrasado'} alerta={rec.qtd_clientes > 0} />
        <Indicador titulo="Estoque baixo" valor={`${p.estoque_baixo.qtd} ${p.estoque_baixo.qtd === 1 ? 'produto' : 'produtos'}`} para="/produtos" icone={Package}
          detalhe={p.pedidos_pendentes ? `${p.pedidos_pendentes} ${p.pedidos_pendentes === 1 ? 'pedido' : 'pedidos'} para separar` : 'Nenhum pedido pendente'} />
      </div>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Entradas e saídas · últimos 30 dias</CardTitle>
          <CardDescription>
            Entrou {formatarMoeda(ent)} · saiu {formatarMoeda(sai)} · resultado <span className={ent - sai < 0 ? 'text-destructive' : ''}>{formatarMoeda(ent - sai)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fluxo.length > 0 && (
            <GraficoLinhas titulo="Entradas e saídas por dia nos últimos 30 dias" dias={fluxo.map((d) => d.dia)}
              series={[
                { nome: 'Entradas', cor: 'var(--serie-1)', valores: fluxo.map((d) => Number(d.entradas)) },
                { nome: 'Saídas', cor: 'var(--serie-2)', valores: fluxo.map((d) => Number(d.saidas)) },
              ]} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="gap-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Contas a pagar</CardTitle>
            <Link to="/financeiro/pagar" className="text-sm text-primary hover:underline">Ver todas</Link>
          </CardHeader>
          {pagar.itens.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">Nada vencendo nos próximos 7 dias.</p></CardContent> : (
            <ul className="divide-y">
              {pagar.itens.map((c) => (
                <li key={c.id}>
                  <Link to={`/financeiro/pagar/${c.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.descricao}</p>
                      <p className="text-xs text-muted-foreground">{c.vencimento === hojeISO() ? 'Vence hoje' : `Vence ${formatarData(c.vencimento)}`}</p>
                    </div>
                    {/* No celular, valor e situação ficam um embaixo do outro (antes estourava a largura) */}
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <span className="text-sm font-medium tabular">{formatarMoeda(c.valor)}</span>
                      <BadgeSituacao situacao={c.situacao} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Clientes em atraso</CardTitle>
            <Link to="/financeiro/receber" className="text-sm text-primary hover:underline">Ver todos</Link>
          </CardHeader>
          {rec.itens.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">Nenhum cliente com conta atrasada.</p></CardContent> : (
            <ul className="divide-y">
              {rec.itens.map((d) => (
                <li key={d.cliente_id ?? 'sem'} className="flex items-center gap-3 px-5 py-2.5">
                  <Link to={d.cliente_id ? `/clientes/${d.cliente_id}` : '/financeiro/receber'} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-sm font-medium">{d.cliente_nome ?? 'Sem cliente'}</p>
                    <p className="text-xs text-destructive">{d.maior_atraso} {d.maior_atraso === 1 ? 'dia' : 'dias'} de atraso</p>
                  </Link>
                  <span className="text-sm font-medium tabular">{formatarMoeda(d.total_vencido)}</span>
                  <BotaoCobrar cliente={d.cliente_nome} telefone={d.cliente_telefone} valor={Number(d.total_vencido)} vencimento={d.vencimento_mais_antigo} compacto />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <EstoqueBaixo p={p} />
    </>
  )
}

function PainelFuncionario({ p }: { p: Painel }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Button asChild size="lg" className="h-14 text-base"><Link to="/vendas/nova"><Plus /> Nova venda</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-14 text-base"><Link to="/consulta-preco"><ScanBarcode /> Consultar preço</Link></Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Indicador titulo="Minhas vendas hoje" valor={String(p.minhas_vendas_hoje ?? 0)} para="/vendas" icone={ShoppingCart}
          detalhe={(p.minhas_vendas_hoje ?? 0) ? 'Toque para ver' : 'Nenhuma ainda'} />
        <Indicador titulo="Pedidos para separar" valor={String(p.pedidos_pendentes)} para="/vendas" icone={PackageCheck}
          detalhe={p.pedidos_pendentes ? 'Toque para ver' : 'Tudo em dia'} />
      </div>
      <EstoqueBaixo p={p} />
    </>
  )
}

export default function Inicio() {
  const { perfil } = useAuth()
  const { empresa, ehDono } = useEmpresa()
  const primeiroNome = perfil?.nome?.split(' ')[0]

  const q = useQuery({
    queryKey: ['painel', empresa?.id, ehDono],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('painel_resumo', { p_empresa: empresa!.id })
      if (error) throw error
      return data as Painel
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{formatarData(hojeISO())}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{saudacao()}{primeiroNome ? `, ${primeiroNome}` : ''}!</h1>
      </div>
      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : q.error ? <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} /> : (
        <>
          <BarraCaixa />
          <PrimeirosPassos p={q.data!} ehDono={ehDono} />
          {ehDono ? <PainelDono p={q.data!} /> : <PainelFuncionario p={q.data!} />}
        </>
      )}
    </div>
  )
}
