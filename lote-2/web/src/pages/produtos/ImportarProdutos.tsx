import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, ScanBarcode, Square, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/PageHeader'
import { SomenteDono } from '@/components/Guards'
import { Caixinha } from '@/components/Caixinha'
import { useEmpresa } from '@/contexts/EmpresaProvider'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { formatarMoeda, semAcento, unidadeInteira } from '@/lib/format'
import { exportarCsv } from '@/lib/exportar'
import { buscarPorGtin, consultavel, gtinValido, PAUSA_ENTRE_CONSULTAS_MS } from '@/lib/gtin'
import { adivinharColunas, CAMPOS, converterUnidade, lerArquivo, lerBarras, lerValor, type CampoImport, type Planilha } from '@/lib/importacao'
import { cn } from '@/lib/utils'

interface LinhaProduto {
  linha: number
  nome: string
  codigo_barras: string | null
  codigo: string | null
  unidade: string
  preco_venda: number | null
  preco_custo: number | null
  estoque: number | null
  estoque_minimo: number | null
  categoria: string | null
  ncm: string | null
  erros: string[]
  avisos: string[]
  existe?: string | null // nome do produto que já está cadastrado
  nomeDaBase?: boolean
}

interface Existente { id: string; nome: string; codigo_barras: string | null; codigo: string | null; nome_busca: string }

const LOTE = 200

function montarLinhas(p: Planilha, mapa: Partial<Record<CampoImport, number>>, existentes: Existente[]): LinhaProduto[] {
  const col = (l: string[], c: CampoImport) => (mapa[c] === undefined ? '' : (l[mapa[c]!] ?? '').trim())
  const porBarras = new Map(existentes.filter((e) => e.codigo_barras).map((e) => [e.codigo_barras!, e.nome]))
  const porCodigo = new Map(existentes.filter((e) => e.codigo).map((e) => [e.codigo!.toLowerCase(), e.nome]))
  const porNome = new Map(existentes.map((e) => [e.nome_busca, e.nome]))
  const vistos = new Set<string>()
  return p.linhas.map((l, i) => {
    const erros: string[] = []
    const avisos: string[] = []
    const nome = col(l, 'nome').replace(/\s+/g, ' ').slice(0, 120)
    const b = lerBarras(col(l, 'codigo_barras'))
    if (b.estragado) avisos.push('Código de barras estragado pelo Excel (ex.: 7,89E+12) — ficou sem código')
    if (b.codigo && !gtinValido(b.codigo)) avisos.push('Código de barras com dígito inválido (pode ser código interno)')
    const unidadeOrig = col(l, 'unidade')
    const unidade = converterUnidade(unidadeOrig)
    const preco = lerValor(col(l, 'preco_venda'))
    const custo = lerValor(col(l, 'preco_custo'))
    let estoque = lerValor(col(l, 'estoque'))
    const minimo = lerValor(col(l, 'estoque_minimo'))
    if (estoque !== null && estoque < 0) { avisos.push('Estoque negativo na planilha — vai entrar como 0'); estoque = 0 }
    if (estoque !== null && unidadeInteira(unidade) && !Number.isInteger(estoque)) erros.push(`Estoque quebrado (${estoque}) em produto vendido por ${unidade}`)
    if (custo !== null && preco !== null && custo > preco && preco > 0) avisos.push('Custo maior que o preço de venda')
    const codigo = col(l, 'codigo') || null
    const existe = (b.codigo && porBarras.get(b.codigo)) || (codigo && porCodigo.get(codigo.toLowerCase())) || (nome && porNome.get(semAcento(nome))) || null
    if (!existe) {
      if (!nome) erros.push(b.codigo && consultavel(b.codigo) ? 'Sem nome (dá para buscar pelo código de barras)' : 'Sem nome')
      if (preco === null || preco <= 0) erros.push('Sem preço de venda')
    }
    const chave = b.codigo ?? semAcento(nome)
    if (chave && vistos.has(chave)) avisos.push('Repetido na planilha — a última linha vale')
    if (chave) vistos.add(chave)
    return {
      linha: i + 2, nome, codigo_barras: b.codigo, codigo, unidade,
      preco_venda: preco, preco_custo: custo, estoque, estoque_minimo: minimo,
      categoria: col(l, 'categoria') || null, ncm: col(l, 'ncm').replace(/\D/g, '') || null,
      erros, avisos, existe,
    }
  })
}

function Conteudo() {
  const { empresa } = useEmpresa()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [planilha, setPlanilha] = useState<Planilha | null>(null)
  const [mapa, setMapa] = useState<Partial<Record<CampoImport, number>>>({})
  const [existentes, setExistentes] = useState<Existente[]>([])
  const [ajustes, setAjustes] = useState<Record<number, Partial<LinhaProduto>>>({})
  const [modoExistentes, setModoExistentes] = useState<'atualizar' | 'pular'>('atualizar')
  const [ajustarEstoque, setAjustarEstoque] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [consulta, setConsulta] = useState<{ feitas: number; total: number; achadas: number } | null>(null)
  const parar = useRef(false)
  const [importando, setImportando] = useState<{ feitos: number; total: number } | null>(null)
  const [resultado, setResultado] = useState<{ criados: number; atualizados: number; pulados: number; erros: Array<{ linha: number; nome: string; mensagem: string }> } | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'erros' | 'avisos' | 'novos' | 'existem'>('todas')

  const linhas = useMemo(() => {
    if (!planilha) return []
    return montarLinhas(planilha, mapa, existentes).map((l) => {
      const a = ajustes[l.linha]
      if (!a) return l
      const nome = a.nome ?? l.nome
      const erros = l.erros.filter((e) => !(nome && e.startsWith('Sem nome')))
      return { ...l, ...a, nome, erros }
    })
  }, [planilha, mapa, existentes, ajustes])

  const cont = useMemo(() => ({
    erros: linhas.filter((l) => l.erros.length).length,
    avisos: linhas.filter((l) => !l.erros.length && l.avisos.length).length,
    novos: linhas.filter((l) => !l.erros.length && !l.existe).length,
    existem: linhas.filter((l) => !l.erros.length && l.existe).length,
    semNome: linhas.filter((l) => !l.nome && l.codigo_barras && consultavel(l.codigo_barras)).length,
  }), [linhas])

  async function escolher(f: File | undefined) {
    if (!f || !empresa) return
    setErroArquivo(null); setResultado(null); setAjustes({}); setLendo(true)
    try {
      const p = await lerArquivo(f)
      if (p.linhas.length > 5000) throw new Error('A planilha tem mais de 5.000 linhas. Divida em partes.')
      const { data, error } = await supabase.from('v_produtos').select('id, nome, codigo_barras, codigo, nome_busca').eq('empresa_id', empresa.id).limit(10000)
      if (error) throw error
      setExistentes((data ?? []) as Existente[])
      setPlanilha(p)
      setMapa(adivinharColunas(p.cabecalho))
      setArquivo(f.name)
    } catch (e) {
      setPlanilha(null)
      setErroArquivo(e instanceof Error ? e.message : mensagemErro(e))
    } finally {
      setLendo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function completarPelaBase() {
    const alvo = linhas.filter((l) => !l.nome && l.codigo_barras && consultavel(l.codigo_barras))
    if (!alvo.length) return
    parar.current = false
    setConsulta({ feitas: 0, total: alvo.length, achadas: 0 })
    let achadas = 0
    for (let i = 0; i < alvo.length; i++) {
      if (parar.current) break
      const l = alvo[i]
      const d = await buscarPorGtin(l.codigo_barras!)
      if (d?.nome) {
        achadas++
        setAjustes((a) => ({ ...a, [l.linha]: { ...a[l.linha], nome: d.nome, ncm: l.ncm ?? d.ncm ?? null, nomeDaBase: true } }))
      }
      setConsulta({ feitas: i + 1, total: alvo.length, achadas })
      if (i < alvo.length - 1 && !parar.current) await new Promise((r) => setTimeout(r, d?.fonte === 'cosmos' ? 300 : PAUSA_ENTRE_CONSULTAS_MS))
    }
    toast.success(`${achadas} de ${alvo.length} produtos achados pelo código de barras.`)
  }

  async function importar() {
    if (!empresa) return
    const validas = linhas.filter((l) => !l.erros.length)
    if (!validas.length) return toast.error('Nenhuma linha pronta para importar.')
    setImportando({ feitos: 0, total: validas.length })
    const total = { criados: 0, atualizados: 0, pulados: 0, erros: [] as Array<{ linha: number; nome: string; mensagem: string }> }
    try {
      for (let i = 0; i < validas.length; i += LOTE) {
        const lote = validas.slice(i, i + LOTE).map(({ erros: _e, avisos: _a, existe: _x, nomeDaBase: _n, ...resto }) => resto)
        const { data, error } = await supabase.rpc('importar_produtos', {
          p_empresa: empresa.id, p_itens: lote, p_existentes: modoExistentes, p_ajustar_estoque: ajustarEstoque,
        })
        if (error) throw error
        total.criados += data.criados; total.atualizados += data.atualizados; total.pulados += data.pulados
        total.erros.push(...data.erros)
        setImportando({ feitos: Math.min(i + LOTE, validas.length), total: validas.length })
      }
      setResultado(total)
      for (const k of ['produtos', 'produto', 'produtos-baixo', 'categorias', 'movimentacoes']) qc.invalidateQueries({ queryKey: [k] })
    } catch (e) {
      toast.error(mensagemErro(e))
      if (total.criados || total.atualizados) setResultado(total)
    } finally {
      setImportando(null)
    }
  }

  function baixarModelo() {
    exportarCsv({
      titulo: 'Modelo', empresa: '', arquivo: 'modelo-importar-produtos',
      colunas: [
        { titulo: 'Codigo de barras', valor: (l: string[]) => l[0] }, { titulo: 'Nome', valor: (l: string[]) => l[1] },
        { titulo: 'Unidade', valor: (l: string[]) => l[2] }, { titulo: 'Preco de venda', valor: (l: string[]) => l[3] },
        { titulo: 'Preco de custo', valor: (l: string[]) => l[4] }, { titulo: 'Estoque', valor: (l: string[]) => l[5] },
        { titulo: 'Estoque minimo', valor: (l: string[]) => l[6] }, { titulo: 'Categoria', valor: (l: string[]) => l[7] },
        { titulo: 'Codigo interno', valor: (l: string[]) => l[8] }, { titulo: 'NCM', valor: (l: string[]) => l[9] },
      ],
      linhas: [
        ['7891149103102', 'Cerveja Skol lata 350ml', 'UN', '4,50', '2,90', '48', '24', 'Cervejas', '', '22030000'],
        ['', 'Gelo 5kg', 'UN', '12,00', '6,00', '20', '5', 'Gelo', 'G01', ''],
      ],
    })
  }

  function baixarErros() {
    if (!resultado) return
    exportarCsv({
      titulo: 'Erros', empresa: '', arquivo: 'erros-importacao',
      colunas: [{ titulo: 'Linha', valor: (e: { linha: number }) => e.linha }, { titulo: 'Produto', valor: (e: { nome: string }) => e.nome },
        { titulo: 'Erro', valor: (e: { mensagem: string }) => e.mensagem }],
      linhas: [...resultado.erros, ...linhas.filter((l) => l.erros.length).map((l) => ({ linha: l.linha, nome: l.nome, mensagem: l.erros.join('; ') }))],
    })
  }

  // ---------- Resultado
  if (resultado) {
    const pendentes = linhas.filter((l) => l.erros.length).length + resultado.erros.length
    return (
      <Card>
        <CardContent className="space-y-4 pt-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-primary" />
          <p className="text-lg font-semibold">Importação concluída</p>
          <div className="mx-auto grid max-w-md grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-muted p-3"><p className="text-2xl font-semibold">{resultado.criados}</p>novos</div>
            <div className="rounded-lg bg-muted p-3"><p className="text-2xl font-semibold">{resultado.atualizados}</p>atualizados</div>
            <div className="rounded-lg bg-muted p-3"><p className="text-2xl font-semibold">{resultado.pulados}</p>pulados</div>
          </div>
          {pendentes > 0 && (
            <p className="text-sm text-amber-700">{pendentes} {pendentes === 1 ? 'linha ficou' : 'linhas ficaram'} de fora por erro.{' '}
              <button type="button" onClick={baixarErros} className="font-medium underline">Baixar a lista</button></p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate('/estoque')}>Ver o estoque</Button>
            <Button variant="outline" onClick={() => { setResultado(null); setPlanilha(null); setArquivo(null) }}>Importar outro arquivo</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const visiveis = linhas.filter((l) =>
    filtro === 'todas' || (filtro === 'erros' && l.erros.length) || (filtro === 'avisos' && !l.erros.length && l.avisos.length)
    || (filtro === 'novos' && !l.erros.length && !l.existe) || (filtro === 'existem' && !l.erros.length && l.existe))

  return (
    <div className="space-y-4">
      {/* 1. arquivo */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Escolha o arquivo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Exporte os produtos do sistema antigo em <strong>Excel (.xlsx)</strong>, <strong>CSV</strong> ou <strong>TXT</strong> e escolha o arquivo aqui.
            A primeira linha precisa ter os nomes das colunas (nome, preço, código de barras…). Nada é gravado antes de você conferir.
          </p>
          <div className="flex flex-wrap gap-2">
            <input ref={entrada} type="file" accept=".xlsx,.csv,.txt,.xls" className="hidden" onChange={(e) => void escolher(e.target.files?.[0])} />
            <Button onClick={() => entrada.current?.click()} disabled={lendo}>{lendo ? <Loader2 className="animate-spin" /> : <FileUp />} Escolher arquivo</Button>
            <Button variant="outline" onClick={baixarModelo}><Download /> Baixar modelo</Button>
          </div>
          {arquivo && <p className="text-sm">Arquivo: <strong>{arquivo}</strong> · {planilha?.linhas.length} linhas</p>}
          {erroArquivo && <Alert variant="destructive"><AlertDescription>{erroArquivo}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {planilha && (
        <>
          {/* 2. colunas */}
          <Card>
            <CardHeader><CardTitle className="text-base">2. Confira as colunas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">O sistema tentou adivinhar. Ajuste se alguma estiver errada.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CAMPOS.map((c) => (
                  <label key={c.campo} className="grid gap-1 text-sm">
                    <span className="font-medium">{c.rotulo}{c.obrigatorio && <span className="text-destructive"> *</span>}</span>
                    <NativeSelect value={mapa[c.campo] ?? ''} aria-label={c.rotulo}
                      onChange={(e) => setMapa((m) => { const n = { ...m }; if (e.target.value === '') delete n[c.campo]; else n[c.campo] = Number(e.target.value); return n })}>
                      <option value="">— não tem —</option>
                      {planilha.cabecalho.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}{planilha.linhas[0]?.[i] ? ` (ex.: ${planilha.linhas[0][i].slice(0, 24)})` : ''}</option>)}
                    </NativeSelect>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 3. conferir */}
          <Card>
            <CardHeader><CardTitle className="text-base">3. Confira os produtos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {([['todas', `Todas (${linhas.length})`], ['novos', `Novos (${cont.novos})`], ['existem', `Já cadastrados (${cont.existem})`],
                  ['avisos', `Com aviso (${cont.avisos})`], ['erros', `Com erro (${cont.erros})`]] as const).map(([v, r]) => (
                  <button key={v} type="button" onClick={() => setFiltro(v)}
                    className={cn('h-8 rounded-full border px-3 text-sm', filtro === v ? 'border-primary bg-accent font-medium' : 'bg-card',
                      v === 'erros' && cont.erros > 0 && 'text-destructive')}>{r}</button>
                ))}
              </div>

              {cont.semNome > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-accent/40 p-3 text-sm">
                  <ScanBarcode className="size-5 shrink-0" />
                  <p className="min-w-48 flex-1">{cont.semNome} {cont.semNome === 1 ? 'produto está' : 'produtos estão'} sem nome mas com código de barras. O sistema pode buscar o nome na base de produtos.</p>
                  {consulta && consulta.feitas < consulta.total && !parar.current ? (
                    <Button size="sm" variant="outline" onClick={() => { parar.current = true; setConsulta((c) => c && { ...c }) }}><Square /> Parar ({consulta.feitas}/{consulta.total})</Button>
                  ) : (
                    <Button size="sm" onClick={() => void completarPelaBase()}><ScanBarcode /> Buscar nomes pelo código</Button>
                  )}
                </div>
              )}
              {consulta && <p className="text-xs text-muted-foreground">Consultados {consulta.feitas} de {consulta.total} · achados {consulta.achadas}. A base gratuita libera cerca de 15 consultas por minuto.</p>}

              <div className="max-h-[28rem] overflow-auto rounded-xl border">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr><th className="px-2 py-2 text-left">Linha</th><th className="px-2 py-2 text-left">Produto</th><th className="px-2 py-2 text-left">Cód. barras</th>
                      <th className="px-2 py-2 text-left">Un.</th><th className="px-2 py-2 text-right">Venda</th><th className="px-2 py-2 text-right">Custo</th>
                      <th className="px-2 py-2 text-right">Estoque</th><th className="px-2 py-2 text-left">Situação</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {visiveis.slice(0, 500).map((l) => (
                      <tr key={l.linha} className={cn(l.erros.length > 0 && 'bg-destructive/5')}>
                        <td className="px-2 py-1.5 text-muted-foreground">{l.linha}</td>
                        <td className="max-w-64 px-2 py-1.5">
                          <span className="line-clamp-2 [overflow-wrap:anywhere]">{l.nome || <em className="text-muted-foreground">sem nome</em>}</span>
                          {l.nomeDaBase && <span className="text-xs text-primary">nome da base de códigos</span>}
                          {l.categoria && <span className="block text-xs text-muted-foreground">{l.categoria}</span>}
                        </td>
                        <td className="px-2 py-1.5 tabular">{l.codigo_barras ?? '—'}</td>
                        <td className="px-2 py-1.5">{l.unidade}</td>
                        <td className="px-2 py-1.5 text-right tabular">{l.preco_venda !== null ? formatarMoeda(l.preco_venda) : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular">{l.preco_custo !== null ? formatarMoeda(l.preco_custo) : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular">{l.estoque !== null ? l.estoque.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-2 py-1.5 text-xs">
                          {l.erros.length > 0 ? <span className="flex gap-1 text-destructive"><XCircle className="size-3.5 shrink-0" />{l.erros.join('; ')}</span>
                            : l.existe ? <span className="text-blue-700 dark:text-blue-300">Já existe: {l.existe}</span>
                            : <span className="text-primary">Novo</span>}
                          {l.avisos.map((a) => <span key={a} className="mt-0.5 flex gap-1 text-amber-700"><AlertTriangle className="size-3.5 shrink-0" />{a}</span>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visiveis.length > 500 && <p className="text-xs text-muted-foreground">Mostrando 500 de {visiveis.length} linhas (todas serão importadas).</p>}
            </CardContent>
          </Card>

          {/* 4. importar */}
          <Card>
            <CardHeader><CardTitle className="text-base">4. Importar</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {cont.existem > 0 && (
                <div className="grid gap-2 text-sm">
                  <p className="font-medium">{cont.existem} {cont.existem === 1 ? 'produto já está cadastrado' : 'produtos já estão cadastrados'} (mesmo código de barras, código ou nome):</p>
                  <label className="flex items-center gap-2"><input type="radio" checked={modoExistentes === 'atualizar'} onChange={() => setModoExistentes('atualizar')} /> Atualizar preço, custo, mínimo e categoria</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={modoExistentes === 'pular'} onChange={() => setModoExistentes('pular')} /> Não mexer neles (pular)</label>
                  {modoExistentes === 'atualizar' && mapa.estoque !== undefined && (
                    <Caixinha checked={ajustarEstoque} onChange={setAjustarEstoque} rotulo="Trocar o estoque deles pelo da planilha"
                      descricao="Fica registrado como ajuste de contagem. Deixe desmarcado se já vendeu por aqui." />
                  )}
                </div>
              )}
              {cont.erros > 0 && <p className="text-sm text-amber-700">{cont.erros} {cont.erros === 1 ? 'linha com erro fica' : 'linhas com erro ficam'} de fora. Corrija na planilha e importe de novo depois, se quiser.</p>}
              <Button size="lg" onClick={() => void importar()} disabled={!!importando || cont.novos + cont.existem === 0 || !mapa.nome && !mapa.codigo_barras}>
                {importando ? <><Loader2 className="animate-spin" /> Importando {importando.feitos} de {importando.total}…</> : <><Upload /> Importar {cont.novos + cont.existem} produtos</>}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default function ImportarProdutos() {
  return (
    <>
      <PageHeader titulo="Importar produtos" descricao="Traga os produtos de outro sistema por planilha." voltarPara="/produtos"
        acoes={<Button asChild variant="ghost" size="sm"><Link to="/produtos">Cancelar</Link></Button>} />
      <SomenteDono><Conteudo /></SomenteDono>
    </>
  )
}
