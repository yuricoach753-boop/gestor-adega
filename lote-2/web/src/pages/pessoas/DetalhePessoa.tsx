import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, MapPin, Pencil, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { Confirmar } from '@/components/Confirmar'
import { BotaoWhatsApp } from '@/components/BotaoWhatsApp'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import type { Pessoa } from '@/types'
import { ROTA, type TipoPessoa } from './PessoaForm'

export function enderecoTexto(p: Pessoa) {
  const rua = [p.logradouro, p.numero].filter(Boolean).join(', ')
  return [rua, p.complemento, p.bairro, [p.cidade, p.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')
}

export function Resumo({ itens }: { itens: Array<{ rotulo: string; valor: ReactNode; destaque?: 'perigo' | 'aviso' }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">{i.rotulo}</p>
          <p className={`mt-1 text-lg font-semibold tabular ${i.destaque === 'perigo' ? 'text-destructive' : i.destaque === 'aviso' ? 'text-amber-700' : ''}`}>{i.valor}</p>
        </div>
      ))}
    </div>
  )
}

export function CabecalhoPessoa({ tipo, pessoa, extra, children }: {
  tipo: TipoPessoa
  pessoa: Pessoa & { contato_nome?: string | null }
  extra?: ReactNode
  children: ReactNode
}) {
  const qc = useQueryClient()
  const [confirmar, setConfirmar] = useState(false)
  const rota = ROTA[tipo]
  const tabela = tipo === 'cliente' ? 'clientes' : 'fornecedores'
  const endereco = enderecoTexto(pessoa)

  async function alternarAtivo() {
    const { error } = await supabase.from(tabela).update({ ativo: !pessoa.ativo }).eq('id', pessoa.id)
    if (error) return toast.error(mensagemErro(error))
    toast.success(pessoa.ativo ? 'Cadastro inativado.' : 'Cadastro reativado!')
    qc.invalidateQueries({ queryKey: [tabela] })
  }

  return (
    <>
      <PageHeader
        titulo={pessoa.nome}
        descricao={pessoa.contato_nome ? `Contato: ${pessoa.contato_nome}` : undefined}
        voltarPara={rota}
        acoes={<Button asChild variant="outline"><Link to={`${rota}/${pessoa.id}/editar`}><Pencil /> <span className="hidden sm:inline">Editar</span></Link></Button>}
      />

      {!pessoa.ativo && (
        <div className="mb-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Este cadastro está <strong>inativo</strong>.</div>
      )}

      <div className="space-y-4">
        <Card className="gap-3">
          <CardContent className="space-y-2 text-sm">
            {pessoa.telefone ? (
              <div className="flex items-center justify-between gap-2">
                <a href={`tel:${pessoa.telefone.replace(/\D/g, '')}`} className="flex items-center gap-2 hover:underline">
                  <Phone className="size-4 text-muted-foreground" /> {pessoa.telefone}
                </a>
                <BotaoWhatsApp telefone={pessoa.telefone} />
              </div>
            ) : <p className="text-muted-foreground">Sem telefone cadastrado.</p>}
            {endereco && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`} target="_blank" rel="noreferrer"
                className="flex items-start gap-2 hover:underline">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {endereco}
              </a>
            )}
            {pessoa.cpf_cnpj && <p className="text-muted-foreground">CPF/CNPJ: {pessoa.cpf_cnpj}</p>}
            {pessoa.observacoes && <p className="rounded-md bg-muted p-2 text-muted-foreground">{pessoa.observacoes}</p>}
          </CardContent>
        </Card>

        {extra}
        {children}

        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => (pessoa.ativo ? setConfirmar(true) : alternarAtivo())}>
          {pessoa.ativo ? <><Archive /> Inativar cadastro</> : <><ArchiveRestore /> Reativar cadastro</>}
        </Button>
      </div>

      <Confirmar aberto={confirmar} onAberto={setConfirmar} titulo="Inativar cadastro?"
        descricao="Ele some das listas e buscas, mas todo o histórico continua guardado. Dá para reativar depois."
        textoConfirmar="Inativar" onConfirmar={alternarAtivo} />
    </>
  )
}
