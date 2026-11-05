# Gestor — sistema de gestão para adega/distribuidora

> **Dev novo no projeto? Comece por [`PASSAGEM.md`](PASSAGEM.md).** Este README tem o guia de instalação e as funções por fase (algumas contagens de testes/migrations abaixo são de fases antigas).

React + TypeScript + Tailwind + shadcn/ui no front, Supabase (Postgres, Auth, Storage, RLS) no back.

```
sistema-gestao/
├── supabase/
│   ├── migrations/          ← banco completo (rodar em ordem)
│   │   ├── ..._schema.sql             tabelas, tipos, índices, FKs de mesma empresa
│   │   ├── ..._funcoes_triggers.sql   permissões, histórico, estoque, RPCs de acesso
│   │   ├── ..._rls_views.sql          RLS, custo escondido do funcionário, views
│   │   ├── ..._storage.sql            bucket privado "anexos"
│   │   ├── ..._fase2_estoque_compras.sql  compras, movimentação de estoque, empresa de demonstração
│   │   ├── ..._fase3_vendas_receber.sql   vendas, fiado, contas a receber, cobrança
│   │   ├── ..._fase4_pagar_caixa.sql      contas a pagar, contas fixas, fluxo de caixa, projeção
│   │   ├── ..._fase5_painel_relatorios.sql painel inicial e relatórios
│   │   └── ..._fase6_admin_assinatura.sql  painel do administrador e cobrança
│   ├── tests/               ← 205 testes de isolamento e regras (Postgres local)
│   └── config.toml          ← para rodar com Supabase CLI
└── web/                     ← app React (mobile first)
```

## 1. Colocar no ar (passo a passo)

### 1.1 Supabase
1. Crie um projeto em supabase.com, na região **South America (São Paulo)**.
2. **Database → Extensions:** ative **pg_cron** *antes* das migrations. Com ele, todo dia de madrugada o banco
   gera as contas fixas do mês e atualiza quem está com a mensalidade atrasada.
3. Rode as 9 migrations **na ordem**:
   - **CLI (recomendado):** `npx supabase link --project-ref SEU_REF` e `npx supabase db push`
   - ou **SQL Editor:** cole e execute cada arquivo de `supabase/migrations`, do mais antigo para o mais novo.
4. **Authentication → URL Configuration**
   - Site URL: o endereço do app (ex.: `https://app.seudominio.com.br`)
   - Redirect URLs: `https://app.seudominio.com.br/**` e `http://localhost:5173/**`
5. **Authentication → Sign In / Providers → Email:** escolha se exige confirmação de e-mail.
   O app funciona dos dois jeitos (sem confirmação, o cliente entra direto no teste grátis).
6. **Recomendado:** configure um SMTP próprio (Authentication → SMTP) e traduza os e-mails
   (Authentication → Email Templates). O SMTP padrão do Supabase envia poucos e-mails por hora.

### 1.2 App (site)
```bash
cd web
cp .env.example .env      # URL e anon key: Supabase → Project Settings → API
npm install
npm run dev               # testar em http://localhost:5173
npm run build             # gera a pasta dist/ para publicar
```
Publique em qualquer hospedagem de site estático. Na **Vercel**: importe o repositório, pasta raiz `web`,
e cadastre as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. `vercel.json` e `public/_redirects`
já cuidam das rotas. O nome do sistema fica em `web/src/config.ts`.

### 1.3 Você como administrador
1. Abra o app, cadastre sua conta (pode criar uma empresa de teste ou não).
2. No SQL Editor, rode:
   ```sql
   update public.perfis set is_super_admin = true
   where id = (select id from auth.users where email = 'SEU_EMAIL');
   ```
3. Entre de novo. No menu do seu avatar aparece **Painel do administrador** (`/admin`).
4. Em **Configurações** do painel: seu WhatsApp de suporte, dias de teste grátis e dias de tolerância.
5. Em **Planos**: cadastre o que você cobra (ex.: Básico R$ 99,90 até 3 usuários).

## 2. Painel do administrador (Fase 6)

- **Empresas:** todas as empresas, com situação (em teste, em dia, vence em breve, vencida, bloqueada…),
  dono, cidade, plano, último acesso e quantas vendas fizeram em 30 dias (para saber quem está usando de verdade).
  No topo: receita mensal (MRR), recebido no mês, em teste, vencendo, atrasadas e bloqueadas.
  Filtro "Precisa de atenção" mostra quem cobrar. Botão de WhatsApp com mensagem pronta para cada situação.
- **Nova empresa:** você cadastra a empresa do cliente, escolhe plano e dias de teste, e o sistema gera um link para
  mandar no WhatsApp do dono. Ele cria a senha e já entra como dono.
- **Detalhe da empresa:** **Registrar pagamento** (valor, data, forma, quantos meses): a assinatura fica ativa e o
  vencimento avança sozinho. Mudar plano, situação, datas, anotações só suas, cancelar pagamento lançado errado,
  ver usuários e gerar novo link de dono.
- **Você não vê os dados dos clientes** (vendas, clientes, financeiro). Só contagens de uso.

### Como a cobrança funciona
| Situação | O que acontece |
|---|---|
| Em teste | Usa tudo. Ao acabar o teste, o acesso é bloqueado e aparece um botão para falar com você. |
| Em dia | Usa tudo. Nos 5 dias antes do vencimento, o dono vê um aviso. |
| Vencida (dentro da tolerância) | Continua usando, com aviso vermelho dizendo até quando pode pagar. |
| Passou da tolerância | Bloqueia sozinho. Os dados ficam guardados. Ao registrar o pagamento, libera na hora. |

Pagamento em dia mantém o ciclo (vencia dia 10, continua vencendo dia 10). Pagamento de quem estava bloqueado,
cancelado ou em teste começa a contar da data do pagamento.

## 3. Testes do banco

Precisa de um Postgres 15+ local (não precisa do Supabase):

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/rodar.sh
```

Os testes cobrem: empresa A não vê nem grava dados da B, funcionário não vê custo, caixa, contas a pagar
nem anexos, nada pode ser apagado, estoque só muda por movimentação, a empresa não fica sem dono, uma empresa
bloqueada perde o acesso, as chaves estrangeiras impedem misturar dados de empresas diferentes, e cada regra de
venda, estoque, contas, relatórios e assinatura.

## Fase 2: produtos, estoque, clientes e fornecedores

- **Produtos:** cadastro com margem calculada na hora (e "calcular preço pela margem"), categorias,
  código e código de barras (funciona com leitor), estoque mínimo com alerta, inativar sem apagar.
- **Estoque:** perda, uso interno e ajuste por contagem (funcionário pode lançar), histórico com quem fez e quando.
- **Compras (entrada de mercadoria, só o dono):** vários produtos por compra, atualiza o custo, e já pode criar
  as contas a pagar parceladas, lançar como paga ou não mexer no financeiro. Cancelar estorna estoque e financeiro.
- **Clientes e fornecedores:** cadastro com CEP que preenche o endereço, botão de WhatsApp, histórico de compras,
  quanto o cliente deve e quanto falta pagar ao fornecedor (só o dono vê os valores).
- **Empresa de demonstração:** em Configurações. Cria uma empresa separada com 14 produtos, 5 clientes,
  3 fornecedores e uma compra a prazo, para mostrar o sistema a clientes.

## Fase 3: vendas e contas a receber

- **Venda rápida:** busca ou leitor de código de barras, botões − / +, desconto em R$ ou %, cliente opcional
  (busca ou cadastra na hora), aviso quando o estoque vai ficar negativo.
- **Pagamento:** dinheiro (com troco), Pix, débito, crédito, fiado e boleto (com parcelas), ou dividido em várias formas.
  Dinheiro entra na conta "Caixa"; Pix/cartão/transferência na "Banco / Pix"; fiado e boleto viram contas a receber.
  O preço vem sempre do cadastro (o app não manda preço), então ninguém altera preço na hora da venda.
- **Pedidos:** "cliente já levou" (balcão, já entregue) ou pedido em aberto → separado → entregue.
  Cancelar devolve o estoque e estorna caixa e fiado. Funcionário só cancela as próprias vendas do dia.
- **Comprovante:** botão que abre o WhatsApp do cliente com o resumo do pedido pronto (ou copiar o texto).
- **Contas a receber (só o dono):** quem está devendo e há quantos dias, botão "Cobrar" com a mensagem da empresa,
  recebimento total ou parcial, estorno de recebimento lançado errado, lançamento manual (ex.: caderneta antiga).

## Fase 4: contas a pagar e fluxo de caixa

- **Contas a pagar:** uma vez, parcelada ou **todo mês** (conta fixa). Situação automática (a vencer, vence hoje,
  atrasada, paga), código de barras com botão de copiar, anexo do boleto em PDF/foto, pagar com juros/multa e desconto,
  escolher de qual conta saiu, estornar pagamento feito por engano, cancelar.
- **Contas fixas:** aluguel, luz, internet… A conta de cada mês aparece sozinha (mês atual e o próximo). Dia 31 vira o
  último dia em meses curtos. Pausar/reativar. Para gerar mesmo sem ninguém abrir o app, ative a extensão **pg_cron**
  no Supabase (Database → Extensions) **antes** de rodar a migration da Fase 4; sem ela, as contas são geradas
  quando o dono abre "Contas a pagar". Se ativar depois, rode no SQL Editor:
  `select cron.schedule('gerar-contas-recorrentes', '10 9 * * *', 'select public.gerar_recorrentes_todas()');`
- **Caixa:** saldo de hoje por conta (Caixa, Banco…), extrato do mês, visão por dia (com saldo acumulado), por mês
  (12 meses) e **próximos 30 dias** (projeção com contas a pagar e a receber, avisando quando o dinheiro não cobre).
  Lançamento avulso (entrada/saída), transferência entre contas e cadastro de contas com saldo inicial.
- Lançamentos automáticos (vendas, recebimentos, contas pagas) só se desfazem na origem; manuais e transferências
  podem ser cancelados no próprio caixa.

## Fase 5: painel inicial e relatórios

- **Painel (dono):** saldo em caixa hoje, vendas do dia e do mês (com lucro bruto), contas a pagar nos próximos
  7 dias (destaca as atrasadas), quanto está atrasado para receber, estoque baixo, gráfico de entradas x saídas dos
  últimos 30 dias (toque no gráfico para ver o dia; "Ver em tabela" mostra os números), listas de contas vencendo,
  clientes em atraso (com botão Cobrar) e produtos acabando. Atualiza sozinho a cada minuto.
- **Painel (funcionário):** botão grande de Nova venda, vendas de hoje, pedidos para separar e estoque baixo.
  Nada de financeiro.
- **Relatórios (só o dono):** período (hoje, 7 dias, este mês, mês passado, 90 dias, este ano ou datas livres) e abas
  Vendas (faturamento por dia/semana/mês, lucro bruto, ticket médio, formas de pagamento), Produtos (top 10 por
  faturamento, quantidade, lucro ou margem; aviso de margem abaixo de 10%), Clientes (quem mais comprou e quanto
  deve) e Despesas (por categoria, com %). Cada um exporta em **Excel, CSV e PDF**.
- O lucro bruto usa o custo de cada produto **no momento da venda**. Descontos no total da venda são divididos entre
  os itens no relatório de produtos.

## Regras de segurança (resumo)

| | Dono | Funcionário |
|---|---|---|
| Produtos, estoque, clientes, fornecedores, vendas | ✅ | ✅ (não vê preço de custo/margem; não cadastra produto) |
| Lançar perda, uso interno, ajuste de estoque | ✅ | ✅ |
| Vender fiado (a prazo) | ✅ | ❌ |
| Cancelar venda | ✅ qualquer uma | só as próprias, no mesmo dia |
| Lançar venda com data passada | ✅ | ❌ |
| Lista de devedores, contas a pagar/receber, caixa, relatórios, lucro | ✅ | ❌ |
| Usuários e dados da empresa | ✅ | ❌ |

- Não existe `DELETE` em nenhuma tabela, nem no Storage. Tudo é cancelado e fica na tabela `auditoria`.
- Venda, compra, pagamento, recebimento e assinatura são feitos por funções do banco (RPCs), numa transação só.
  O app não consegue gravar venda, alterar estoque, status de conta ou a própria assinatura diretamente.
- O administrador do sistema não lê dados de operação das empresas clientes.

## Preparado para o futuro
- **Nota fiscal (NF-e/NFC-e):** tabela `notas_fiscais` e campos fiscais em produtos (NCM, CEST, CFOP, origem) e
  empresas (IE, regime). A integração indicada é com uma API pronta (ex.: Focus NFe) via Edge Function.
- **Alertas automáticos por WhatsApp:** tabela `notificacoes` pronta para uma fila de envio via API.
- **Integração bancária / DDA:** contas a pagar já guardam código de barras e anexo.
