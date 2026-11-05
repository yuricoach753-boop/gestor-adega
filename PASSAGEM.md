# Passagem do projeto para o dev

Documento de entrega (04/11/2026). Explica o que é o sistema, onde ele roda, como mexer e o que falta.

## O que é
"Gestor": sistema de gestão para a **adega/distribuidora (disk)** de um amigo do Yuri. Cobre venda de balcão,
abertura e fechamento de caixa, estoque, compras, fiado e contas a receber, contas a pagar, fluxo de caixa,
relatórios e fechamento do mês para o contador.
**Não é um produto à venda.** Ele nasceu como SaaS, por isso tem multiempresa, planos, assinatura e painel do admin.
Essa parte funciona, mas não é prioridade.

- Front: `web/` — React 19 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query. Pensado primeiro para o celular.
- Back: `supabase/` — só Postgres/Supabase (Auth, RLS, Storage, pg_cron). **Não existe servidor próprio.** As regras
  de negócio ficam no banco: triggers e funções RPC `security definer`.

## Onde está rodando (produção)
| | |
|---|---|
| Código | https://github.com/yuricoach753-boop/gestor-adega (privado) |
| Site | https://enchanting-hotteok-31650d.netlify.app (Netlify, deploy **manual**: arrastar a pasta `dist`) |
| Banco | Supabase, projeto "gestor", ref `uwkqfkodsdzthsognnft`, região sa-east-1, **plano Free** |
| Versão no ar | site v12 + migrations 1 a 18 (todas aplicadas pelo SQL Editor) |
| Super admin | conta do Yuri (yuricoach753@gmail.com) |

**Acessos que o Yuri precisa te passar** (os acessos não ficam no repositório):
1. Supabase: convite para a organização "yuricoach753-boop's Org", em Organization → Team.
2. Netlify: convite para o time, ou transferência do site.
3. Este repositório no GitHub, como colaborador.

## Rodar local
```bash
cd web
cp .env.example .env    # VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (Supabase → Project Settings → API, chave anon "legacy")
npm install
npm run dev
```
Com o `.env` apontando para produção, o app local usa os dados reais. Para desenvolver, o ideal é criar um
projeto Supabase separado (ou usar `supabase start`) e rodar as migrations nele.

Testes do banco: 313 asserts em SQL puro, sem Supabase. Precisam de um Postgres 15+ local:
```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/rodar.sh
```
O script `stub_supabase.sql` simula `auth.users`, `auth.uid()`, os roles e o Storage.

## Como publicar uma mudança hoje
- **Banco:** crie uma migration nova em `supabase/migrations/` (timestamp maior que o último) e aplique com
  `npx supabase link --project-ref uwkqfkodsdzthsognnft && npx supabase db push`, ou cole no SQL Editor.
  Depois de mexer em DDL, rode `notify pgrst, 'reload schema';`.
  ⚠️ As 18 migrations foram aplicadas pelo SQL Editor. Por isso `supabase_migrations.schema_migrations` pode estar vazio,
  e o `db push` tentaria rodar tudo de novo. Antes do primeiro push, marque como aplicadas com
  `npx supabase migration repair --status applied <versão>` para cada uma.
- **Site:** gere o build com as variáveis de produção, `VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build`,
  e suba o `web/dist`. **Recomendado:** ligar o Netlify a este repositório (base `web`, build `npm run build`,
  publish `web/dist`, variáveis no painel). `public/_redirects` já trata as rotas do SPA.
- Não mude `DOMINIO_LOGIN` em `web/src/lib/login.ts`. Funcionários entram com um e-mail interno
  `<whatsapp>@login.enchanting-hotteok-31650d.netlify.app`. Trocar o domínio quebra o login de quem já existe.

## Regras importantes (decididas com o Yuri)
- **Nada é apagado.** Não existe DELETE em nenhuma tabela nem no Storage: as coisas são canceladas ou inativadas, e
  cada alteração vai para a tabela `auditoria`.
- Venda, compra, pagamento, recebimento, caixa e importação passam por RPCs, cada uma numa transação só. O preço de venda vem
  sempre do cadastro.
- **Funcionário = só balcão.** Ele não vê faturamento, custo, financeiro, relatórios nem fornecedores, e só vê as vendas
  que fez hoje. Não vende fiado nem boleto. Essas regras ficam garantidas por RLS e trigger, não só pela tela.
- Só se vende com o caixa aberto (`caixa_turnos`). O dinheiro do caixa não pode ficar negativo. Unidades un/cx/fardo/pct
  só aceitam quantidade inteira.
- O estoque pode ficar negativo na venda, depois de confirmar. Perda e uso interno não podem passar do estoque.
- FKs compostas `(empresa_id, id)` impedem misturar dados de empresas diferentes.
- O front lê pelas views `v_*`, e não por embed do PostgREST (há FKs duplicadas, então o embed fica ambíguo).

Histórico completo das decisões: `docs/andamento.md`. QA e correções: `docs/qa-erros.md`.
Análise de pontos fortes e fracos: `docs/analise-sistema.md`.

## Pendências e riscos (por prioridade)
1. **Backup.** O plano Free não tem backup automático. Opções: Supabase Pro (US$ 25/mês, backup diário) ou um
   `pg_dump` agendado.
2. **Deploy automático.** Ligar o Netlify ao GitHub e criar um projeto Supabase de staging.
3. **Ainda não testado em produção:** upload de logo e anexos (Storage), e-mail de "esqueci minha senha" (o SMTP padrão
   do Supabase manda só ~4 por hora), sessão do funcionário caindo quando o dono troca a senha dele, Importar planilha e
   consulta ao Open Food Facts direto do navegador (CORS).
4. **Consulta de código de barras:** `supabase/functions/consulta-gtin` (base Cosmos/Bluesoft) **ainda não foi publicada**.
   Ela precisa do secret `COSMOS_TOKEN`. Sem ela, o front usa direto o Open Food Facts.
5. **O que falta para a adega:** vender unidade a partir da caixa ("1 cx = 12 un" com baixa automática), entrega
   (endereço, taxa, entregador, status), vasilhame retornável, cupom em impressora térmica, preço gelada/natural,
   sangria pelo funcionário, taxa da maquininha.
6. **NFC-e**, se o contador exigir: o caminho indicado é a Focus NFe chamada por Edge Function (precisa de certificado
   A1, IE e CSC na SEFAZ-GO). A tabela `notas_fiscais` e os campos fiscais já existem.

## Mapa do código
- `supabase/migrations/` — 18 migrations, na ordem. As 4 primeiras são o schema base. As demais seguem fases e correções:
  2 estoque/compras, 3 vendas/fiado, 4 contas a pagar/caixa, 5 painel/relatórios, 6 admin/assinatura, depois funcionário
  só balcão, login pelo WhatsApp, abertura de caixa, 3 rodadas de QA, fiado só para o dono, fechamento do mês e
  importar produtos.
- `web/src/pages/` — telas por área. `web/src/lib/` — supabase client, formatação, exportação (Excel/CSV/PDF), `gtin.ts`
  (código de barras) e `importacao.ts` (leitura de planilhas). `web/src/contexts/` — sessão e empresa ativa.
- `web/src/components/CaixaTurno.tsx` — abertura e fechamento de caixa. `web/src/config.ts` — nome do sistema.
