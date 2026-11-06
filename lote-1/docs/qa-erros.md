# QA do Gestor — erros identificados e CORRIGIDOS (12/10/2026)

Identificados no teste parte por parte; **todos corrigidos no mesmo dia** (site v7 + migration 20261018000001_correcoes_qa,
já aplicada no Supabase). Cada correção foi conferida de novo no ambiente local (script de verificação + 264 testes SQL).

| # | Erro | Situação |
|---|------|----------|
| 1 | Busca sem acento não achava ("agua" ≠ "Água") | Corrigido — produtos, clientes, fornecedores e vendas por cliente |
| 2 | Cadastro pelo convite às vezes caía em "Falta só a sua empresa" | Corrigido — 12 de 12 tentativas certas |
| 3 | Admin: dias de teste vazio salvava 0 | Corrigido — campo obrigatório (mín. 1) |
| 4 | Perda maior que o estoque era aceita | Corrigido — bloqueia e orienta usar "Ajuste de contagem" |
| 5 | Cursor não voltava para a busca depois de abrir o caixa | Corrigido (Nova venda e Consulta de preço) |
| 6 | Desconto % acima de 100 / negativo sem aviso | Corrigido — aviso e Finalizar travado |
| 7 | Venda de data passada em dinheiro entrava no esperado do caixa | Corrigido no banco |
| 8 | Mensagens de erro antigas ficavam na tela | Corrigido (login, nova compra, admin, consulta) |
| 9 | Erro do fiado sem cliente escondido no fim da página | Corrigido — aparece na barra junto do Finalizar |
| 10–13 | Layout no celular (Nova compra, Início, menu do admin, aviso de caixa) | Corrigido + Configurações e abas do Caixa |
| 14 | Consulta de preço só buscava nome com Enter | Corrigido — mostra opções enquanto digita |
| 15 | Conta fixa voltava para Contas a pagar | Corrigido — volta para Contas fixas |
| 16 | CSV sem 2 casas decimais | Corrigido |
| 17 | Funcionário lia clientes e fornecedores pelo banco | Fornecedores bloqueados. Clientes continuam (precisa para escolher/cadastrar cliente na venda) |

## Conferido e OK no QA
Validações de produto/cliente/empresa/perfil; código duplicado; inativo some da venda; data futura bloqueada; pagamento dividido; status de pedido; cancelar; comprovante WhatsApp; compra atualiza custo/estoque; receber/pagar/estorno; parcelado 3x; conta fixa gera contas; caixa lançar/transferir; fluxo por dia/mês/30 dias; relatórios + exportação Excel/CSV/PDF nas 4 abas; usuários/convite/tirar acesso; assinatura; trocar senha; sair; rotas protegidas; login por WhatsApp; convite reutilizado bloqueado; funcionário sem acesso às áreas do dono (tela e banco); abrir/fechar caixa com diferença; dono vê esperado; admin: criar empresa, registrar pagamento, bloquear, planos.

## Ainda testar no site real
Upload de logo, e-mail de recuperação de senha, envio real no WhatsApp.

---

# Rodada 2 do QA — 12 erros identificados e CORRIGIDOS (12/10/2026, site v8 + migration 20261019000001_correcoes_qa2)

Todos corrigidos e conferidos (script de navegador + 279 testes SQL). Como ficou:
- 1: compra_itens.custo_anterior; cancelar volta o custo se o produto ainda está com o custo daquela compra.
- 2: máximo 9.999 por item; acima do estoque pede confirmação "Vender mesmo assim".
- 3: un/cx/fardo/pct só inteiro (venda, compra, perda, contagem, estoque inicial); kg e litro aceitam fração.
- 4: "1.000" sem vírgula = mil.
- 5: antes de gravar, confere preço/ativo de novo; se mudou, atualiza a tela e avisa.
- 6: tela "Seu acesso foi removido".
- 7: vencimento ≥ data da venda; parcelas 1 a 48 com aviso.
- 8: aviso "caixa aberto desde DD/MM" e qualquer pessoa da empresa pode fechar caixa de outro dia.
- 9: bloqueia produto/cliente/fornecedor com mesmo nome (sem acento); busca não oferece cadastrar quem já existe.
- 10: CSV põe ' antes de texto que começa com = + - @.
- 11: nomes até 120 letras; nome longo quebra linha.
- 12: CPF/CNPJ com dígito verificador.

## Lista original

## Importantes
1. **Cancelar compra não desfaz o preço de custo.** Custo 32,40 → compra a 99,00 → cancelada → custo continua 99,00. Distorce margem, lucro dos relatórios e o aviso de "prejuízo".
2. **Quantidade sem limite na venda.** 99.999 un (estoque 34) passou com só o aviso amarelo → venda de R$ 2,7 milhões e o painel do dono mostrando isso em "Vendas hoje".
3. **Quantidade quebrada em produto de unidade inteira** (un, cx, fardo): 1,5 e 2,345 un são aceitos.
4. **"1.000" vira 1** na quantidade (no Brasil "1.000" é mil).
5. **Preço mudou com a venda aberta → erro confuso**: "A soma dos pagamentos (R$ 52,80) não bate com o total (R$ 60,00)". A tela continua com o preço velho; só resolve tirando e pondo o produto.
6. **Funcionário que perdeu o acesso cai em "Falta só a sua empresa"** (convite para criar empresa própria) em vez de "seu acesso foi removido".

## Médios
7. Fiado/boleto: vencimento no passado é aceito (testado 9 meses antes) → a conta já nasce atrasada. Parcelas "99" vira 48 e "0" vira 1 sem avisar.
8. Caixa esquecido aberto desde ontem: nenhum aviso; as vendas de hoje caem no turno de ontem e o fechamento mistura dois dias.
9. Cadastros repetidos: produto com o mesmo nome é aceito; na venda, mesmo achando "Mercadinho do Zé", ainda oferece "Cadastrar 'Mercadinho do Zé'".
10. Exportação CSV/Excel: nome começando com "=" (ex.: cliente cadastrado pelo funcionário) vira fórmula quando o dono abre o arquivo no Excel.
11. Nome de produto sem limite de tamanho (300 letras aceitas); nome longo sem espaço estoura a tela do celular (detalhe do produto e consulta de preço).

## Pequenos
12. CPF/CNPJ só confere a quantidade de números, não os dígitos verificadores.

## Conferido e OK na rodada 2
Duplo clique não duplica (venda, compra, conta a pagar, recebimento, pagamento, lançamento no caixa); sem internet mostra aviso e não duplica ao tentar de novo; produto desativado com carrinho aberto é barrado; receber mais que o saldo é barrado; cancelar venda com recebimento explica o que acontece; comprovante do WhatsApp correto; período invertido nos relatórios avisa; empresa bloqueada mostra "Acesso suspenso" ao funcionário; convite vencido avisa; funcionário não abre venda de outro pelo link; dados do dono continuam protegidos no banco (relatórios, usuários, custo, faturamento); fuso horário tratado certo; ordenação com acento correta no Supabase real.


---

# Rodada 3 do QA — 5 erros identificados e CORRIGIDOS (12/10/2026, site v10 + migration 20261021000001_correcoes_qa3)
1. **Limite de usuários do plano pode ser furado**: com plano de 2 usuários, o dono tira um funcionário, convida outro e depois devolve o acesso ao primeiro → 3 ativos. O limite só é conferido ao aceitar convite.
2. **Caixa (dinheiro) pode ficar negativo**: saída ou transferência maior que o saldo é aceita sem aviso (testado R$ 99.999 de saída e R$ 888.888 de transferência).
3. **Desativar a conta "Caixa (dinheiro)"** é permitido mesmo com saldo; depois disso as vendas em dinheiro passam a cair na conta "Banco / Pix" sem avisar (e o esperado da gaveta fica errado).
4. Lançamento no caixa e conta a receber aceitam datas muito antigas (2019/2020), alterando relatórios e saldos de meses já fechados.
5. Quando o dono troca a senha do funcionário, quem já estava logado com a senha antiga continua logado.

## Conferido e OK na rodada 3
Transferência para a mesma conta é barrada; lançamento com data futura é barrado; empresa nunca fica sem dono ativo; admin: registrar pagamento só aceita 1 a 24 meses e cancelar pagamento volta o vencimento.
