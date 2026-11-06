# Andamento do projeto

## Situação: NO AR desde 12/10/2026 — Yuri testando
- (13/10/2026) DECISÃO: o sistema NÃO será vendido. É para UM amigo do Yuri, dono de uma adega/distribuidora (disk).
  Itens de SaaS (assinatura, cobrança, termos para venda, multiempresa) ficam como estão, sem prioridade.
- (13/10/2026) Yuri quer avaliar EMISSÃO DE NOTA FISCAL (NFC-e). Caminho proposto: API Focus NFe (plano Retail, NFC-e)
  chamada por Edge Function do Supabase (token fora do navegador); precisa certificado A1, IE, credenciamento NFC-e e
  CSC na SEFAZ-GO, e dados fiscais por produto (NCM, CFOP, CSOSN/CST, CEST) definidos pelo contador. Tabela
  notas_fiscais já existe no schema. Aguardando: regime tributário do amigo (MEI ou Simples).
- Backup: zip do código completo salvo no Desktop do Yuri (sistema-gestao-codigo-13-10-2026.zip).
- Site (Netlify, deploy manual por arrastar a pasta): https://enchanting-hotteok-31650d.netlify.app
- Supabase: projeto "gestor" (ref uwkqfkodsdzthsognnft, sa-east-1, plano Free) na org "yuricoach753-boop's Org".
  TODAS as 18 migrations rodadas pelo SQL Editor (17 e 18 em 23/10/2026), pg_cron ligado (jobs gerar-contas-recorrentes e
  atualizar-assinaturas). RLS em todas as tabelas. pgcrypto fica no schema extensions (ok).
- Auth: "Confirm email" DESLIGADO; Site URL = endereço do Netlify; Redirect URL = https://enchanting-hotteok-31650d.netlify.app/**
- Yuri (yuricoach753@gmail.com) é super admin; empresas dele: "Distribuidora Exemplo (demonstração)" e "Disk Cerveja To Loko".
  Admin abre pelo menu do usuário → "Painel do administrador".
  Conta de teste de funcionário mineyur82@gmail.com ficou SEM empresa por causa do bug do convite (corrigido na v4).
- Para atualizar o site: build com VITE_SUPABASE_URL=https://uwkqfkodsdzthsognnft.supabase.co e a chave anon (legacy) do
  projeto, salvar a pasta no Desktop do Yuri e ele arrasta no Netlify (site → Deploys → arrastar a pasta).
  Pastas no Desktop: gestor-site (v1) … gestor-site-v12 (23/10, ÚLTIMA — Importar produtos de planilha + nome pelo código de barras; inclui Fechamento do mês).
  v12 enviada pelo chat como gestor-site-v12.zip (o computador não estava conectado).
  Banco e site em dia em 23/10/2026 (site v12 publicado + migrations 1–18 aplicadas).
- Ainda não testado no Supabase real: upload de logo/anexos (Storage), e-mail de "esqueci minha senha", cadastro com
  e-mail interno do WhatsApp e abertura/fechamento de caixa (testados no ambiente local).

## Histórico
6 fases concluídas em 09/10/2026 + Consulta de preço (10/10) + cadastro com leitor (11/10) + funcionário só balcão,
login pelo WhatsApp e abertura/fechamento de caixa (12/10) + QA completo e correções (12/10, ver `claude/qa-erros.md`).
Guia: `codigo/README.md`. Migrations (13) em `codigo/migrations/`. 313 testes SQL passando (tests/rodar.sh, até teste_fase14).
Teste local de navegador tem GoTrue simulado no proxy (signup/senha) — scratchpad e2e/proxy.mjs; build local precisa
de chave anon JWT válida (gerada com o segredo do pgrst.conf).
Tour com prints de todas as telas: tour-do-sistema.pdf (11/10/2026) — não inclui as mudanças de 12/10.

## Decisões aprovadas (09/10/2026)
1. Estoque sai na criação do pedido; cancelar devolve.
2. Estoque negativo permitido NA VENDA, com aviso na tela e confirmação "Vender mesmo assim" ao finalizar (desde 12/10). Perda/uso interno NÃO pode passar do estoque (desde 12/10;
   se o estoque está errado, usar "Ajuste de contagem").
3. Preço de custo = custo da última compra (venda_itens guarda cópia do custo para relatório de margem).
4. Contas financeiras separadas: "Caixa (dinheiro)" e "Banco / Pix" criadas automaticamente.
5. (MUDOU em 12/10) Só o DONO vende fiado; funcionário não (trigger t01_fiado_so_dono, migration 20261020000001).
   Boleto saiu da Nova venda (não é usado no balcão); o banco também recusa boleto/fiado de funcionário.

## Abertura e fechamento de caixa (pedido do Yuri em 12/10/2026, migration 20261017000001)
- Decisões do Yuri: nome de quem abre vem do LOGIN (não digita); SÓ VENDE com caixa aberto; no fechamento a pessoa
  VÊ a diferença (não é caixa cego).
- Tabela caixa_turnos (numero por empresa, aberto_por/em, valor_abertura, fechado_por/em, valor_contado,
  valor_esperado, diferenca, observacoes). Um caixa aberto por empresa (índice único parcial) = um balcão.
  Troca de funcionário: quem abriu fecha (ou o dono fecha), o próximo abre. Outro funcionário pode vender no caixa aberto.
- Trigger t05_venda_turno em vendas: venda do dia sem caixa aberto → erro "O caixa está fechado"; liga vendas.turno_id.
  Venda com data passada (só dono) não passa pelo caixa. app.sem_caixa='on' pula a regra (usado na demonstração).
- Esperado = abertura + entradas − saídas em contas tipo "caixa" lançadas no turno COM DATA a partir do dia da abertura
  (lançamento de data passada não entra — migration 13) − entradas antigas canceladas durante o turno.
- RPCs: abrir_caixa, fechar_caixa (devolve resumo), caixa_atual (esperado parcial só para o dono; sugere o último valor
  contado na próxima abertura). View v_caixa_turnos. Funcionário vê o caixa aberto e os turnos dele.
- Front: components/CaixaTurno.tsx (BarraCaixa no Início, Nova venda bloqueada com caixa fechado, Consultar preço avisa);
  dono: Financeiro → Caixa → "Aberturas e fechamentos de caixa" (/financeiro/caixa/turnos) com sobra/falta por turno.
- Não lança a diferença como ajuste no financeiro (o dono vê e decide). Ideia futura: sangria pelo próprio funcionário.

## Funcionário = só balcão (decidido pelo Yuri em 12/10/2026)
- Menu do funcionário: Início, Vendas, Consultar preço, Produtos (barra do celular: os mesmos 4 + Mais com "Meus dados" e Sair).
- PODE: vender à vista (dinheiro, Pix, cartões — NÃO fiado, NÃO boleto), cadastrar cliente na hora da venda, consultar preço, ver estoque, lançar perda e
  ajustar contagem, ver/marcar pedidos (separado/entregue), abrir/fechar o caixa.
- NÃO vê: Clientes, Fornecedores, Configurações (exceto Meus dados), Financeiro, Relatórios, Compras.
- Fornecedores bloqueados também no banco para o funcionário (migration 13). Clientes continuam legíveis pelo banco
  (necessário para escolher/cadastrar cliente na venda).
- NÃO vê faturamento (migration 20261015000001): RLS de vendas/itens/pagamentos via venda_visivel() — só as vendas que
  ELE fez HOJE + pedidos aberto/separado. painel_resumo sem totais para ele (minhas_vendas_hoje = quantidade).
- Pendência aceitável: histórico de estoque mostra quantidades vendidas ("Venda nº X −2") para o funcionário.
- Na implantação: orientar o dono a convidar cada funcionário com login próprio.

## Login do funcionário pelo WhatsApp (12/10/2026, migration 20261016000001)
- Cadastro pelo convite pede só nome, WhatsApp e senha. E-mail interno <numeros>@login.enchanting-hotteok-31650d.netlify.app
  (DOMINIO_LOGIN em web/src/lib/login.ts — NÃO MUDAR). Login aceita "E-mail ou WhatsApp". Dono usa e-mail.
- Senha esquecida: dono troca em Configurações → Usuários → ⋮ → Trocar senha (RPC redefinir_senha_membro).
- Bug corrigido: cadastro pelo convite caía em "Falta só sua empresa". 2ª correção (v7): fluxoCadastro.ativo só desliga
  quando a tela de cadastro sai; EmpresaProvider espera o recarregamento quando a lista de empresas está vazia
  (refetchQueries type 'all'). Testado 12/12 vezes sem falhar.

## Correções do QA (12/10/2026, site v7 + migration 20261018000001_correcoes_qa)
- Busca sem acento: coluna gerada nome_busca = sem_acento(nome) em produtos/clientes/fornecedores (exposta nas views
  v_produtos, v_clientes_resumo, v_fornecedores_resumo; v_vendas.cliente_busca). Front filtra por nome_busca com semAcento().
- Consulta de preço busca pelo nome enquanto digita (só quando tem letra; o leitor manda números + Enter).
- Desconto % negativo ou >100 avisa e trava Finalizar. Erros da Nova venda aparecem na barra fixa, junto do botão.
- Foco volta para a busca depois de abrir o caixa (Nova venda e Consulta de preço).
- Admin → Configurações: dias de teste obrigatório (mín. 1), tolerância obrigatória, WhatsApp de suporte validado.
- Mensagens de erro antigas somem ao mexer no formulário (login, nova compra, admin nova empresa, consulta).
- Conta fixa criada → volta para Contas fixas. CSV com 2 casas em dinheiro e %. Ajustes de layout no celular
  (Início, Nova compra, Configurações, Caixa, menu do admin, aviso de caixa fechado).

## Correções da 2ª rodada (12/10/2026, site v8 + migration 20261019000001_correcoes_qa2)
- Unidades inteiras: un, cx, fardo, pct (trigger t00_quantidade_inteira em movimentacoes_estoque + checagem na RPC de
  contagem); kg e l aceitam fração. Venda: máx. 9.999 por item (trigger em venda_itens).
- compra_itens.custo_anterior (trigger) → cancelar_compra volta o custo. Fiado/boleto: trigger impede vencimento antes da venda.
- fechar_caixa: turno aberto em dia anterior pode ser fechado por qualquer membro. Front avisa "caixa aberto desde".
- Nomes: check (<=120) NOT VALID em produtos/clientes/fornecedores; front bloqueia nome repetido (nome_busca igual).
- Front: confere preço/ativo antes de gravar a venda; tela AcessoRemovido; CPF/CNPJ com dígito; CSV sem fórmula.

## Correções da 3ª rodada (12/10/2026, site v10 + migration 20261021000001_correcoes_qa3)
- Limite de usuários do plano também ao "Devolver acesso" (trigger t03_limite_plano em membros_empresa).
- Conta tipo caixa (dinheiro) não fica negativa: trigger t02_regras em lancamentos_caixa recusa saída > saldo
  (vale para lançar, transferir, pagar conta e compra paga). Banco pode ficar negativo.
- Não desativa conta com saldo nem a única conta de dinheiro (trigger em contas_financeiras).
- Datas: lançamento no caixa e venda até 60 dias atrás; conta a receber até 1 ano atrás (app.sem_caixa libera a demo).
- Troca de senha pelo dono apaga auth.sessions e revoga refresh tokens do funcionário (cai em até 1 hora).

## Importar produtos + código de barras (pedido do Yuri em 23/10/2026, site v12 + migration 18)
- Produtos → "Importar planilha" (/produtos/importar, só dono): lê .xlsx (read-excel-file), .csv e .txt (separador ; , tab |,
  UTF-8 ou ANSI/Windows-1252) no navegador. Adivinha colunas pelo cabeçalho (dá para trocar), mostra prévia com
  Novo / Já existe / aviso / erro, converte unidade (UN/LT/GF→un, CX→cx, FD→fardo, PCT→pct, KG, L), lê "R$ 1.234,56",
  detecta código estragado pelo Excel (7,89E+12) e dígito do código inválido. Baixar modelo; baixar lista de erros.
- RPC importar_produtos(p_empresa, p_itens ≤1000, p_existentes 'atualizar'|'pular', p_ajustar_estoque): acha existente por
  código de barras → código interno → nome; cria categoria pelo nome; erro de uma linha não para as outras.
- Código de barras → nome: lib/gtin.ts. Tenta Edge Function "consulta-gtin" (base Cosmos/Bluesoft, brasileira, traz NCM;
  precisa token COSMOS_TOKEN — código em supabase/functions/consulta-gtin, AINDA NÃO PUBLICADA) e depois Open Food Facts
  (grátis, ~15 consultas/min). Usado no cadastro de produto (preenche o nome se vazio, mostra "Achamos na base") e na
  importação ("Buscar nomes pelo código" para linhas sem nome). Códigos começando com 2 (balança/internos) não são consultados.

## Fechamento do mês (pedido do Yuri em 13/10/2026, site v11 + migration 17)
- Relatórios → aba "Fechamento do mês": RPC relatorio_fechamento_mes(p_empresa, p_mes) (só dono). Resumo para o contador,
  formas de pagamento, despesas por categoria, modelo do Relatório Mensal de Receitas Brutas do MEI (sem/com nota),
  acumulado no ano vs limite MEI (R$ 81.000, constante LIMITE_MEI), top 10 produtos. PDF, Excel e resumo pelo WhatsApp.
- Dados da empresa: campos Inscrição estadual e Regime tributário (mei/simples/presumido/real) — muda o texto do fechamento.
- Análise completa do sistema (22/10): `claude/analise-sistema.md`.

## Tela Estoque (pedido do Yuri em 12/10/2026, site v9)
- Rota /estoque, item "Estoque" no menu (no celular fica em "Mais") e aba nas abas de Produtos (Produtos | Estoque | Movimentações | Compras).
- Cards: com estoque, estoque baixo, sem estoque (e negativos); dono vê também valor em estoque (custo) e valor de venda.
- Filtros (todos/baixo/sem/negativo), busca sem acento, categoria, ordenar por quantidade; barra de nível vs. mínimo;
  botão de contagem/perda por item (MovimentarEstoque); exportar Excel/CSV/PDF (com valores só para o dono).
- Funcionário vê as quantidades, sem valores em R$.

## Outras decisões de implementação
- Funcionário não cadastra/edita produto nem registra compra (custo).
- Convite de usuário por link, enviado pelo WhatsApp; 7 dias (funcionário) / 30 dias (dono, criado pelo admin).
- Nada tem DELETE; tabela auditoria via trigger; FKs compostas (empresa_id, id) impedem misturar empresas.
- Custo/margem escondidos do funcionário por permissão de coluna; dono lê via view v_produtos e RPCs de relatório.
- Front lê pelas views (v_*), não por embed do PostgREST (FKs duplicadas → embed ambíguo).
- Venda: preço vem SEMPRE do cadastro. dinheiro → caixa; pix/cartões/transferência → banco; a_prazo e boleto → contas_receber.
  Funcionário cancela só as próprias vendas do dia; só o dono lança venda com data passada.
- Contas a pagar: pagamento integral; estorno reabre. Contas fixas: geram mês atual + próximo.
- Caixa (financeiro): transferências não contam como entrada/saída no fluxo. Projeção 30 dias: pagar atrasado entra hoje.
- Relatórios: lucro bruto = faturamento líquido − custo no momento da venda.
- Assinatura (Fase 6): config_sistema editável no /admin; empresa_liberada no banco; cron muda status; MRR sem demonstração.

## Adicionado em 10–11/10/2026
- Consulta de preço (/consulta-preco); leitor rápido na Nova venda; cadastro de produto com leitor e bloqueio de código repetido.

## Migrations (ordem)
1. 20261009000001_schema · 2. _funcoes_triggers · 3. _rls_views · 4. _storage
5. 20261010000001_fase2_estoque_compras · 6. 20261011000001_fase3_vendas_receber · 7. 20261012000001_fase4_pagar_caixa
8. 20261013000001_fase5_painel_relatorios · 9. 20261014000001_fase6_admin_assinatura · 10. 20261015000001_funcionario_balcao
11. 20261016000001_login_whatsapp · 12. 20261017000001_abertura_caixa · 13. 20261018000001_correcoes_qa
14. 20261019000001_correcoes_qa2 · 15. 20261020000001_fiado_so_dono · 16. 20261021000001_correcoes_qa3 · 17. 20261022000001_fechamento_mes · 18. 20261023000001_importar_produtos — todas aplicadas no Supabase

## Ideias para depois (não pedidas)
- Sangria/suprimento pelo funcionário; relatório de vendas por turno; NF-e/NFC-e via Focus NFe, alertas WhatsApp via API,
  cobrança automática da mensalidade, taxa de maquininha, limite de desconto por funcionário, paginação de catálogos,
  modo escuro, leitura de código de barras pela câmera, código de barras único no banco, domínio próprio, deploy via GitHub.
