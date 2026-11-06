import { supabase } from './supabase'

const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

/** Sobe um anexo (boleto em PDF ou foto) para a pasta da empresa e devolve o caminho. */
export async function enviarAnexo(empresaId: string, pasta: string, arquivo: File): Promise<string> {
  if (!TIPOS.includes(arquivo.type)) throw new Error('Envie um PDF ou uma foto (JPG, PNG ou WEBP).')
  if (arquivo.size > 10 * 1024 * 1024) throw new Error('O arquivo precisa ter até 10 MB.')
  const ext = arquivo.type === 'application/pdf' ? 'pdf' : arquivo.type.split('/')[1].replace('jpeg', 'jpg')
  const caminho = `${empresaId}/${pasta}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('anexos').upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) throw new Error('Não foi possível enviar o arquivo. Tente de novo.')
  return caminho
}

/** Abre o anexo numa nova aba (link temporário de 5 minutos). */
export async function abrirAnexo(caminho: string) {
  const janela = window.open('', '_blank')
  const { data, error } = await supabase.storage.from('anexos').createSignedUrl(caminho, 300)
  if (error || !data) {
    janela?.close()
    throw new Error('Não foi possível abrir o anexo.')
  }
  if (janela) janela.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}
