# Análise completa do sistema (22/10/2026)

Contexto: sistema de gestão para a adega/distribuidora (disk) de um amigo do Yuri. Não é para vender.
Tamanho: 108 telas/componentes, ~12 mil linhas no site, ~4.900 linhas de banco (17 migrations), 303 testes automáticos.

## Nota geral
- Segurança e regras de negócio: 9/10 — regras no banco, funcionário isolado, nada é apagado, auditoria.
- Funções de balcão (venda, caixa, estoque, fiado): 8/10.
- Encaixe com o dia a dia de adega/disk: 6/10 — faltam venda unidade × caixa, entrega, vasilhame, cupom impresso.
- Infraestrutura (backup, atualização): 4/10 — plano grátis sem backup, atualização manual, depende do Yuri logado.

## O que está bom
1. Venda de balcão rápida: leitor de código, busca sem acento, consulta de preço, desconto, várias formas de pagamento, troco.
2. Abertura e fechamento de caixa com diferença (sobrou/faltou), por quem abriu.
3. Funcionário só balcão: não vê faturamento, custo, financeiro, relatórios nem fornecedores; não vende fiado; entra pelo WhatsApp.
4. Estoque: entrada por compra, saída por venda, perda/contagem com limites, tela de Estoque com valor (dono).
5. Fiado com parcelas, cobrança pelo WhatsApp, contas a pagar, contas fixas, fluxo de caixa e projeção 30 dias.
6. Relatórios (vendas, produtos, clientes, despesas) com Excel/CSV/PDF + Fechamento do mês para o contador/MEI.
7. Proteções contra erro de digitação: quantidade inteira em un/cx/fardo, máximo 9.999, confirmação de estoque negativo,
   dinheiro do caixa não fica negativo, datas antigas bloqueadas, preço conferido na hora de finalizar.

## O que não está bom / falta para uma ADEGA
1. **Venda de unidade a partir da caixa/fardo** (crítico): cada produto tem uma unidade só. Adega vende lata solta e caixa;
   hoje precisaria de 2 produtos com estoques separados. Falta "1 cx = 12 un" com baixa automática.
2. **Entrega (disk)**: pedido não tem endereço de entrega, taxa de entrega, entregador nem "saiu para entrega".
3. **Vasilhame / casco retornável** (garrafa 600 ml, litrão, botijão de água): não controla casco emprestado/devolvido.
4. **Cupom impresso** em impressora térmica: hoje só WhatsApp.
5. **Preço gelada × natural / atacado × varejo**: um preço por produto.
6. **Cadastro inicial**: não importa produtos de planilha; cadastrar 200+ itens um a um é trabalhoso.
7. **Sangria/suprimento pelo funcionário** e taxas da maquininha (crédito/débito) no lucro.
8. **Sem internet não vende** (não há modo offline).
9. Limite de crédito do fiado por cliente.

## Riscos de infraestrutura
1. Supabase plano grátis: sem backup automático (Pro US$ 25/mês tem backup diário de 7 dias). Alternativa grátis:
   botão "Baixar cópia de tudo" (exportação) semanal.
2. Mudanças no banco dependem do Yuri logado no Supabase (em 22/10 a sessão estava deslogada → migration 17 pendente).
3. Atualização do site manual (arrastar pasta no Netlify); código só no zip do Desktop. Ideal: GitHub + deploy automático.
4. E-mail de "esqueci senha" do Supabase limitado (~4/hora) — pouco impacto (funcionário entra pelo WhatsApp e o dono troca a senha).
5. Nunca testado no site real: envio de logo, e-mail de recuperação, desconexão ao trocar senha do funcionário, fechamento do mês.

## Prioridade sugerida
1. Agora: aplicar migration 17 (fechamento), publicar v11, testar no site real com o amigo, backup (exportação ou Pro).
2. Para a adega funcionar de verdade: unidade × caixa, importar produtos de planilha, cupom térmico.
3. Se ele faz entrega: módulo de entrega (endereço, taxa, entregador, status).
4. Depois: vasilhame, preço gelada/natural, sangria do funcionário, taxa da maquininha, NFC-e se o contador exigir.
