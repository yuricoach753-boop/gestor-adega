import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/Campo'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/erros'
import { mascaraTelefone } from '@/lib/format'
import { nomeJaUsado } from '@/lib/duplicados'

/** Cadastro rápido de cliente ou fornecedor sem sair da tela (só nome e telefone). */
export function PessoaRapida({ tipo, aberto, onAberto, empresaId, onCriado, nomeInicial }: {
  tipo: 'cliente' | 'fornecedor'
  nomeInicial?: string
  aberto: boolean
  onAberto: (v: boolean) => void
  empresaId: string
  onCriado: (f: { id: string; nome: string; telefone: string | null }) => void
}) {
  const qc = useQueryClient()
  const tabela = tipo === 'cliente' ? 'clientes' : 'fornecedores'
  const [nome, setNome] = useState(nomeInicial ?? '')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (nome.trim().length < 2) return setErro(`Informe o nome do ${tipo}.`)
    setSalvando(true)
    const igual = await nomeJaUsado(tabela, empresaId, nome)
    if (igual) {
      setSalvando(false)
      return setErro(`Já existe ${tipo === 'cliente' ? 'um cliente' : 'um fornecedor'} chamado "${igual.nome}". Escolha ele na busca ou mude o nome (ex.: "${nome.trim()} da padaria").`)
    }
    const { data, error } = await supabase.from(tabela)
      .insert({ empresa_id: empresaId, nome: nome.trim(), telefone: telefone || null }).select('id, nome, telefone').single()
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    qc.invalidateQueries({ queryKey: [tabela] })
    onCriado(data)
    setNome(''); setTelefone(''); setErro(null)
    onAberto(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tipo === 'cliente' ? 'Novo cliente' : 'Novo fornecedor'}</DialogTitle>
          <DialogDescription>Depois você pode completar o cadastro em {tipo === 'cliente' ? 'Clientes' : 'Fornecedores'}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4">
          <Campo rotulo="Nome" htmlFor="fr-nome" erro={erro ?? undefined}>
            <Input id="fr-nome" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus aria-invalid={!!erro} />
          </Campo>
          <Campo rotulo="Telefone / WhatsApp" htmlFor="fr-tel" opcional>
            <Input id="fr-tel" type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Cadastrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
