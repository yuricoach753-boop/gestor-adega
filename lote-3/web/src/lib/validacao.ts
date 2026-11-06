import { z } from 'zod'

export const schemaSenha = z
  .object({
    senha: z.string().min(6, 'A senha precisa ter pelo menos 6 caracteres.'),
    confirmar: z.string(),
  })
  .refine((d) => d.senha === d.confirmar, { path: ['confirmar'], message: 'As senhas não são iguais.' })
