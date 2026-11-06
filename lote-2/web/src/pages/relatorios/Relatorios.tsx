import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { ErroLista, ListaCarregando } from '@/components/EstadosLista'
import { SomenteDono } from '@/components/Guards'
import { GraficoColunas } from '@/components/graficos/GraficoColunas'
import { BarrasHorizontais } from '@/components/graficos/BarrasHorizontais'
import { diaMes } from '@/components/graficos/util'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { diasEntre, formatarData, formatarMoeda, formatarNumero, hojeISO } from '@/lib/format'
import { nomeArquivo, type Coluna } from '@/lib/exportar'
import { cn } from '@/lib/utils'
import { NOME_FORMA, type FormaPagamento, type Unidade } from '@/types'
import { Exportar, Kpi, Secao, Tabela, Vazio } from './comum'
import { AbaFechamento } from './Fechamento'

// ---------------------------------------------------------------- período
type Preset = 'hoje' | '7' | 'mes' | 'mes_passado' | '90' | 'ano' | 'outro'
const PRESETS: Array<{ v: Preset; r: string }> = [
  { v: 'hoje', r: 'Hoje' }, { v: '7', r: '7 dias' }, { v: 'mes', r: 'Este mês' }, { v: 'mes_passado', r: 'Mês passado' },
  { v: '90', r: '90 dias' }, { v: 'ano', r: 'Este ano' }, { v: 'outro', r: 'Escolher datas' },
]
function somar(iso: string, d: number) { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
function periodoDe(p: Preset, ini: string, fim: string) {
  const h = hojeISO()
  switch (p) {
    case 'hoje': return { inicio: h, fim: h }
    case '7': return { inicio: somar(h, -6), fim: h }
    case 'mes': return { inicio: `${h.slice(0, 7)}-01`, fim: h }
    case 'mes_passado': { const f = somar(`${h.slice(0, 7)}-01`, -1); return { inicio: `${f.slice(0, 7)}-01`, fim: f } }
    case '90': return { inicio: somar(h, -89), fim: h }
    case 'ano': return { inicio: `${h.slice(0, 4)}-01-01`, fim: h }
    default: return { inicio: ini, fim: fim }
  }
}
interface Periodo { inicio: string; fim: string; texto: string }

// ---------------------------------------------------------------- vendas
interface LinhaVendas { periodo: string; qtd_vendas: number; faturamento: number; descontos: number; custo: number; lucro_bruto: number; ticket_medio: number }
interface LinhaForma { forma: FormaPagamento; total: number; qtd_vendas: number; percentual: number }

function AbaVendas({ empresaId, empresaNome, p }: { empresaId: string; empresaNome: string; p: Periodo }) {
  const dias = diasEntre(p.inicio, p.fim) + 1
  const agrupar = dias <= 62 ? 'dia' : dias <= 200 ? 'semana' : 'mes'
  const q = useQuery({
    queryKey: ['relatorio', 'vendas', empresaId, p.inicio, p.fim, agrupar],
    queryFn: async () => {
      const [v, f] = await Promise.all([
        supabase.rpc('relatorio_vendas', { p_empresa: empresaId, p_inicio: p.inicio, p_fim: p.fim, p_agrupar: agrupar }),
        supabase.rpc('relatorio_formas', { p_empresa: empresaId, p_inicio: p.inicio, p_fim: p.fim }),
      ])
      if (v.error) throw v.error
      if (f.error) throw f.error
      return { linhas: v.data as LinhaVendas[], formas: f.data as LinhaForma[] }
    },
  })
  if (q.isLoading) return <ListaCarregando />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  const { linhas, formas } = q.data!
  const soma = (k: keyof LinhaVendas) => linhas.reduce((s, l) => s + Number(l[k]), 0)
  const fat = soma('faturamento'), lucro = soma('lucro_bruto'), qtd = soma('qtd_vendas'), desc = soma('descontos'), custo = soma('custo')
  const rotuloPeriodo = (iso: string) => agrupar === 'mes' ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : agrupar === 'semana' ? `sem. ${diaMes(iso)}` : diaMes(iso)
  const colunas: Coluna<LinhaVendas>[] = [
    { titulo: agrupar === 'dia' ? 'Dia' : agrupar === 'semana' ? 'Semana de' : 'Mês', valor: (l) => agrupar === 'mes' ? rotuloPeriodo(l.periodo) : l.periodo, tipo: agrupar === 'mes' ? 'texto' : 'data', largura: 14 },
    { titulo: 'Vendas', valor: (l) => l.qtd_vendas, tipo: 'inteiro' },
    { titulo: 'Faturamento', valor: (l) => l.faturamento, tipo: 'moeda' },
    { titulo: 'Descontos', valor: (l) => l.descontos, tipo: 'moeda' },
    { titulo: 'Custo', valor: (l) => l.custo, tipo: 'moeda' },
    { titulo: 'Lucro bruto', valor: (l) => l.lucro_bruto, tipo: 'moeda' },
    { titulo: 'Ticket médio', valor: (l) => l.ticket_medio, tipo: 'moeda' },
  ]
  const comVenda = linhas.filter((l) => l.qtd_vendas > 0).reverse()
  const totais = ['Total', qtd, fat, desc, custo, lucro, qtd ? fat / qtd : 0]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Kpi titulo="Faturamento" valor={formatarMoeda(fat)} detalhe={desc > 0 ? `${formatarMoeda(desc)} em descontos` : undefined} />
        <Kpi titulo="Lucro bruto" valor={formatarMoeda(lucro)} detalhe={fat > 0 ? `margem de ${formatarNumero(Math.round((lucro / fat) * 1000) / 10)}%` : undefined} alerta={lucro < 0} />
        <Kpi titulo="Vendas" valor={String(qtd)} />
        <Kpi titulo="Ticket médio" valor={formatarMoeda(qtd ? fat / qtd : 0)} />
      </div>
      {qtd === 0 ? <Vazio texto="Nenhuma venda neste período." /> : (
        <>
          {linhas.length > 1 && (
            <Card className="gap-3">
              <CardHeader><CardTitle>Faturamento por {agrupar === 'dia' ? 'dia' : agrupar === 'semana' ? 'semana' : 'mês'}</CardTitle></CardHeader>
              <CardContent>
                <GraficoColunas titulo={`Faturamento por ${agrupar}`} valores={linhas.map((l) => Number(l.faturamento))}
                  rotulos={linhas.map((l) => rotuloPeriodo(l.periodo))}
                  detalhes={linhas.map((l) => (agrupar === 'mes' ? rotuloPeriodo(l.periodo) : agrupar === 'semana' ? `Semana de ${formatarData(l.periodo)}` : formatarData(l.periodo)))} />
              </CardContent>
            </Card>
          )}
          <Card className="gap-3">
            <CardHeader><CardTitle>Formas de pagamento</CardTitle></CardHeader>
            <CardContent>
              <BarrasHorizontais itens={formas.map((f) => ({ rotulo: NOME_FORMA[f.forma], valor: Number(f.total), extra: `${formatarNumero(f.percentual)}%` }))} />
            </CardContent>
          </Card>
          <Secao titulo="Detalhado" acoes={
            <Exportar relatorio={() => ({
              titulo: 'Relatório de vendas', subtitulo: p.texto, empresa: empresaNome, colunas, linhas: comVenda, totais,
              arquivo: nomeArquivo('vendas', formatarData(p.inicio), 'a', formatarData(p.fim)),
            })} />
          }>
            <Tabela colunas={colunas} linhas={comVenda} totais={totais} chave={(l) => l.periodo}
              destaque={(l, j) => (j === 5 && l.lucro_bruto < 0 ? 'text-destructive' : undefined)} />
          </Secao>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- produtos
interface LinhaProduto { produto_id: string; nome: string; categoria: string | null; unidade: Unidade; quantidade: number; faturamento: number; custo: number; lucro_bruto: number; margem: number | null; qtd_vendas: number }
type Ordem = 'faturamento' | 'quantidade' | 'lucro_bruto' | 'margem'

function AbaProdutos({ empresaId, empresaNome, p }: { empresaId: string; empresaNome: string; p: Periodo }) {
  const [ordem, setOrdem] = useState<Ordem>('faturamento')
  const q = useQuery({
    queryKey: ['relatorio', 'produtos', empresaId, p.inicio, p.fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relatorio_produtos', { p_empresa: empresaId, p_inicio: p.inicio, p_fim: p.fim })
      if (error) throw error
      return data as LinhaProduto[]
    },
  })
  const linhas = useMemo(() => [...(q.data ?? [])].sort((a, b) => Number(b[ordem] ?? -999) - Number(a[ordem] ?? -999)), [q.data, ordem])
  if (q.isLoading) return <ListaCarregando />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  if (!linhas.length) return <Vazio texto="Nenhum produto vendido neste período." />

  const fat = linhas.reduce((s, l) => s + Number(l.faturamento), 0)
  const lucro = linhas.reduce((s, l) => s + Number(l.lucro_bruto), 0)
  const custo = linhas.reduce((s, l) => s + Number(l.custo), 0)
  const baixa = linhas.filter((l) => l.margem !== null && Number(l.margem) < 10)
  const colunas: Coluna<LinhaProduto>[] = [
    { titulo: 'Produto', valor: (l) => l.nome, largura: 36 },
    { titulo: 'Categoria', valor: (l) => l.categoria ?? '', largura: 18 },
    { titulo: 'Qtd vendida', valor: (l) => l.quantidade, tipo: 'numero' },
    { titulo: 'Un.', valor: (l) => l.unidade, largura: 6 },
    { titulo: 'Faturamento', valor: (l) => l.faturamento, tipo: 'moeda' },
    { titulo: 'Custo', valor: (l) => l.custo, tipo: 'moeda' },
    { titulo: 'Lucro bruto', valor: (l) => l.lucro_bruto, tipo: 'moeda' },
    { titulo: 'Margem', valor: (l) => l.margem, tipo: 'pct' },
  ]
  const totais = ['Total', '', null, '', fat, custo, lucro, fat > 0 ? Math.round((lucro / fat) * 1000) / 10 : null]
  const top = linhas.slice(0, 10)
  const fmtTop = ordem === 'margem' ? (v: number) => `${formatarNumero(v)}%` : ordem === 'quantidade' ? (v: number) => formatarNumero(v) : formatarMoeda

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Kpi titulo="Produtos vendidos" valor={String(linhas.length)} />
        <Kpi titulo="Faturamento" valor={formatarMoeda(fat)} />
        <Kpi titulo="Lucro bruto" valor={formatarMoeda(lucro)} detalhe={fat > 0 ? `margem de ${formatarNumero(Math.round((lucro / fat) * 1000) / 10)}%` : undefined} />
        <Kpi titulo="Margem abaixo de 10%" valor={`${baixa.length} ${baixa.length === 1 ? 'produto' : 'produtos'}`} alerta={baixa.length > 0} detalhe={baixa.length ? 'Reveja o preço' : 'Tudo certo'} />
      </div>
      <Card className="gap-3">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Top 10</CardTitle>
          <div className="w-48">
            <NativeSelect value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar por" className="h-9 sm:h-9">
              <option value="faturamento">Mais faturamento</option>
              <option value="quantidade">Mais quantidade</option>
              <option value="lucro_bruto">Mais lucro</option>
              <option value="margem">Maior margem</option>
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent>
          <BarrasHorizontais formatar={fmtTop} itens={top.map((l) => ({
            rotulo: l.nome, valor: Math.max(Number(l[ordem] ?? 0), 0),
            extra: ordem === 'quantidade' ? l.unidade : ordem === 'faturamento' && l.margem !== null ? `${formatarNumero(l.margem)}%` : undefined,
          }))} />
        </CardContent>
      </Card>
      <Secao titulo="Todos os produtos" acoes={
        <Exportar relatorio={() => ({
          titulo: 'Relatório de produtos vendidos', subtitulo: p.texto, empresa: empresaNome, colunas, linhas, totais,
          arquivo: nomeArquivo('produtos', formatarData(p.inicio), 'a', formatarData(p.fim)),
        })} />
      }>
        <Tabela colunas={colunas} linhas={linhas} totais={totais} chave={(l) => l.produto_id}
          destaque={(l, j) => (j === 7 && l.margem !== null && Number(l.margem) < 10 ? 'text-destructive font-medium' : undefined)} />
        <p className="text-xs text-muted-foreground">
          Lucro bruto = faturamento − custo dos produtos (custo de quando foram vendidos). Descontos dados no total da venda são divididos entre os itens.
        </p>
      </Secao>
    </div>
  )
}

// ---------------------------------------------------------------- clientes
interface LinhaCliente { cliente_id: string | null; nome: string; telefone: string | null; qtd_compras: number; faturamento: number; lucro_bruto: number; ticket_medio: number; ultima_compra: string; devendo: number }

function AbaClientes({ empresaId, empresaNome, p }: { empresaId: string; empresaNome: string; p: Periodo }) {
  const q = useQuery({
    queryKey: ['relatorio', 'clientes', empresaId, p.inicio, p.fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relatorio_clientes', { p_empresa: empresaId, p_inicio: p.inicio, p_fim: p.fim })
      if (error) throw error
      return data as LinhaCliente[]
    },
  })
  if (q.isLoading) return <ListaCarregando />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  const linhas = q.data!
  if (!linhas.length) return <Vazio texto="Nenhuma venda neste período." />
  const comCliente = linhas.filter((l) => l.cliente_id)
  const fat = linhas.reduce((s, l) => s + Number(l.faturamento), 0)
  const fatCli = comCliente.reduce((s, l) => s + Number(l.faturamento), 0)
  const colunas: Coluna<LinhaCliente>[] = [
    { titulo: 'Cliente', valor: (l) => l.nome, largura: 34 },
    { titulo: 'Compras', valor: (l) => l.qtd_compras, tipo: 'inteiro' },
    { titulo: 'Faturamento', valor: (l) => l.faturamento, tipo: 'moeda' },
    { titulo: 'Ticket médio', valor: (l) => l.ticket_medio, tipo: 'moeda' },
    { titulo: 'Lucro bruto', valor: (l) => l.lucro_bruto, tipo: 'moeda' },
    { titulo: 'Última compra', valor: (l) => l.ultima_compra, tipo: 'data' },
    { titulo: 'Devendo hoje', valor: (l) => (l.cliente_id ? l.devendo : null), tipo: 'moeda' },
  ]
  const totais = ['Total', linhas.reduce((s, l) => s + l.qtd_compras, 0), fat, null, linhas.reduce((s, l) => s + Number(l.lucro_bruto), 0), null, comCliente.reduce((s, l) => s + Number(l.devendo), 0)]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Kpi titulo="Clientes que compraram" valor={String(comCliente.length)} />
        <Kpi titulo="Faturamento com clientes" valor={formatarMoeda(fatCli)} detalhe={fat > 0 ? `${formatarNumero(Math.round((fatCli / fat) * 100))}% do total` : undefined} />
        <Kpi titulo="Venda de balcão" valor={formatarMoeda(fat - fatCli)} detalhe="sem cliente informado" />
        <Kpi titulo="Devendo hoje" valor={formatarMoeda(totais[6] as number)} alerta={(totais[6] as number) > 0} />
      </div>
      {comCliente.length > 0 && (
        <Card className="gap-3">
          <CardHeader><CardTitle>Quem mais comprou</CardTitle></CardHeader>
          <CardContent>
            <BarrasHorizontais itens={comCliente.slice(0, 10).map((l) => ({ rotulo: l.nome, valor: Number(l.faturamento), extra: `${l.qtd_compras}×` }))} />
          </CardContent>
        </Card>
      )}
      <Secao titulo="Todos" acoes={
        <Exportar relatorio={() => ({
          titulo: 'Relatório de vendas por cliente', subtitulo: p.texto, empresa: empresaNome, colunas, linhas, totais,
          arquivo: nomeArquivo('clientes', formatarData(p.inicio), 'a', formatarData(p.fim)),
        })} />
      }>
        <Tabela colunas={colunas} linhas={linhas} totais={totais} chave={(l, i) => l.cliente_id ?? `balcao-${i}`}
          destaque={(l, j) => (j === 6 && l.devendo > 0 ? 'text-destructive' : undefined)} />
      </Secao>
    </div>
  )
}

// ---------------------------------------------------------------- despesas
interface LinhaDespesa { categoria_id: string | null; categoria: string; total: number; qtd: number; percentual: number }

function AbaDespesas({ empresaId, empresaNome, p }: { empresaId: string; empresaNome: string; p: Periodo }) {
  const q = useQuery({
    queryKey: ['relatorio', 'despesas', empresaId, p.inicio, p.fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relatorio_despesas', { p_empresa: empresaId, p_inicio: p.inicio, p_fim: p.fim })
      if (error) throw error
      return data as LinhaDespesa[]
    },
  })
  if (q.isLoading) return <ListaCarregando />
  if (q.error) return <ErroLista erro={q.error} tentarDeNovo={() => q.refetch()} />
  const linhas = q.data!
  if (!linhas.length) return <Vazio texto="Nenhuma saída de dinheiro neste período." />
  const total = linhas.reduce((s, l) => s + Number(l.total), 0)
  const colunas: Coluna<LinhaDespesa>[] = [
    { titulo: 'Categoria', valor: (l) => l.categoria, largura: 30 },
    { titulo: 'Lançamentos', valor: (l) => l.qtd, tipo: 'inteiro' },
    { titulo: 'Total', valor: (l) => l.total, tipo: 'moeda' },
    { titulo: '% do total', valor: (l) => l.percentual, tipo: 'pct' },
  ]
  const totais = ['Total', linhas.reduce((s, l) => s + l.qtd, 0), total, 100]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Kpi titulo="Total de saídas" valor={formatarMoeda(total)} />
        <Kpi titulo="Maior gasto" valor={linhas[0].categoria} detalhe={`${formatarMoeda(linhas[0].total)} · ${formatarNumero(linhas[0].percentual)}%`} />
      </div>
      <Card className="gap-3">
        <CardHeader><CardTitle>Despesas por categoria</CardTitle></CardHeader>
        <CardContent>
          <BarrasHorizontais itens={linhas.map((l) => ({ rotulo: l.categoria, valor: Number(l.total), extra: `${formatarNumero(l.percentual)}%` }))} />
        </CardContent>
      </Card>
      <Secao titulo="Detalhado" acoes={
        <Exportar relatorio={() => ({
          titulo: 'Relatório de despesas por categoria', subtitulo: p.texto, empresa: empresaNome, colunas, linhas, totais,
          arquivo: nomeArquivo('despesas', formatarData(p.inicio), 'a', formatarData(p.fim)),
        })} />
      }>
        <Tabela colunas={colunas} linhas={linhas} totais={totais} chave={(l) => l.categoria_id ?? 'sem'} />
        <p className="text-xs text-muted-foreground">
          Considera tudo que saiu do caixa no período (contas pagas, compras pagas e despesas avulsas). Transferências entre contas não entram.
          Para ver cada lançamento, abra o <Link to="/financeiro/caixa" className="text-primary hover:underline">extrato do caixa</Link>.
        </p>
      </Secao>
    </div>
  )
}

// ---------------------------------------------------------------- página
type Aba = 'vendas' | 'produtos' | 'clientes' | 'despesas' | 'fechamento'
const ABAS: Array<{ v: Aba; r: string }> = [{ v: 'vendas', r: 'Vendas' }, { v: 'produtos', r: 'Produtos' }, { v: 'clientes', r: 'Clientes' }, { v: 'despesas', r: 'Despesas' }, { v: 'fechamento', r: 'Fechamento do mês' }]

function Conteudo() {
  const { empresa } = useEmpresa()
  const [preset, setPreset] = useState<Preset>('mes')
  const [ini, setIni] = useState(somar(hojeISO(), -29))
  const [fim, setFim] = useState(hojeISO())
  const [aba, setAba] = useState<Aba>('vendas')
  const per = periodoDe(preset, ini, fim)
  const valido = per.inicio && per.fim && per.inicio <= per.fim
  const p: Periodo = { ...per, texto: per.inicio === per.fim ? formatarData(per.inicio) : `${formatarData(per.inicio)} a ${formatarData(per.fim)}` }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {ABAS.map((a) => (
          <button key={a.v} type="button" onClick={() => setAba(a.v)}
            className={cn('flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium', aba === a.v ? 'bg-card shadow-xs' : 'text-muted-foreground')}>
            {a.r}
          </button>
        ))}
      </div>

      {aba === 'fechamento' ? <AbaFechamento empresaId={empresa!.id} /> : (
      <>
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRESETS.map((x) => (
            <button key={x.v} type="button" onClick={() => setPreset(x.v)}
              className={cn('h-9 shrink-0 rounded-full border px-3 text-sm font-medium', preset === x.v ? 'border-primary bg-accent text-accent-foreground' : 'bg-card')}>
              {x.r}
            </button>
          ))}
        </div>
        {preset === 'outro' ? (
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            <Input type="date" value={ini} max={fim} onChange={(e) => setIni(e.target.value)} aria-label="Data inicial" />
            <Input type="date" value={fim} min={ini} max={hojeISO()} onChange={(e) => setFim(e.target.value)} aria-label="Data final" />
          </div>
        ) : <p className="text-sm text-muted-foreground">{p.texto}</p>}
      </div>

      {!valido ? <Vazio texto="Escolha uma data inicial antes da final." /> : (
        <>
          {aba === 'vendas' && <AbaVendas empresaId={empresa!.id} empresaNome={empresa!.nome_fantasia} p={p} />}
          {aba === 'produtos' && <AbaProdutos empresaId={empresa!.id} empresaNome={empresa!.nome_fantasia} p={p} />}
          {aba === 'clientes' && <AbaClientes empresaId={empresa!.id} empresaNome={empresa!.nome_fantasia} p={p} />}
          {aba === 'despesas' && <AbaDespesas empresaId={empresa!.id} empresaNome={empresa!.nome_fantasia} p={p} />}
        </>
      )}
      </>
      )}
    </div>
  )
}

export default function Relatorios() {
  return (
    <>
      <PageHeader titulo="Relatórios" />
      <SomenteDono><Conteudo /></SomenteDono>
    </>
  )
}
