-- Testes: importar produtos de planilha
\set ON_ERROR_STOP 1
\set QUIET 1
create temp table r (n serial, teste text, ok boolean, detalhe text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
 ('a14a14a1-0000-0000-0000-000000000001', 'dono@f14.com', '{"nome":"Dono F14"}'),
 ('b14b14b1-0000-0000-0000-000000000002', 'f@f14.com', '{"nome":"F"}');
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.erro(sql text) returns text language plpgsql as $$
begin execute sql; return null; exception when others then return sqlerrm; end $$;

select pg_temp.como('a14a14a1-0000-0000-0000-000000000001');
select criar_empresa('Empresa F14') as e \gset
insert into convites (empresa_id, papel) values (:'e', 'funcionario') returning token as tok \gset
insert into produtos (empresa_id, nome, unidade, preco_custo, preco_venda, estoque_atual, codigo_barras) values (:'e', 'Skol Lata 350ml', 'un', 2, 4, 10, '7891149103102');

select importar_produtos(:'e', $j$[
  {"linha": 2, "nome": "Brahma Lata 350ml", "codigo_barras": "7891149101009", "unidade": "un", "preco_venda": 4.5, "preco_custo": 2.8, "estoque": 48, "estoque_minimo": 12, "categoria": "Cervejas", "ncm": "2203.00.00"},
  {"linha": 3, "nome": "Skol lata 350ml (planilha)", "codigo_barras": "789 1149 103102", "unidade": "un", "preco_venda": 4.99, "preco_custo": 2.5, "estoque": 30},
  {"linha": 4, "nome": "Gelo 5kg", "unidade": "kg", "preco_venda": 2.5, "estoque": 12.5, "categoria": "cervejas"},
  {"linha": 5, "nome": "", "preco_venda": 3},
  {"linha": 6, "nome": "Sem preço", "preco_venda": 0},
  {"linha": 7, "nome": "Lata quebrada", "unidade": "un", "preco_venda": 3, "estoque": 2.5},
  {"linha": 8, "nome": "Unidade estranha", "unidade": "dz", "preco_venda": 3}
]$j$::jsonb) as res \gset
insert into r(teste, ok, detalhe) select 'criou 2 novos, atualizou 1, 4 erros',
  (:'res'::jsonb->>'criados')::int = 2 and (:'res'::jsonb->>'atualizados')::int = 1 and jsonb_array_length(:'res'::jsonb->'erros') = 4, :'res';
insert into r(teste, ok) select 'estoque inicial da planilha', (select estoque_atual from produtos where codigo_barras = '7891149101009') = 48;
insert into r(teste, ok) select 'categoria criada e reaproveitada (Cervejas/cervejas)', (select count(*) from categorias where empresa_id = :'e' and sem_acento(nome) = 'cervejas') = 1;
insert into r(teste, ok) select 'NCM só com números', (select ncm from produtos where codigo_barras = '7891149101009') = '22030000';
insert into r(teste, ok, detalhe) select 'existente pelo código de barras: preço atualizado, nome e estoque mantidos',
  (select preco_venda = 4.99 and nome = 'Skol Lata 350ml' and estoque_atual = 10 from produtos where codigo_barras = '7891149103102'), null;
insert into r(teste, ok) select 'kg aceita estoque quebrado', (select estoque_atual from produtos where nome = 'Gelo 5kg') = 12.5;
insert into r(teste, ok, detalhe) select 'mensagens de erro por linha',
  (select string_agg(x->>'linha' || ':' || (x->>'mensagem'), ' | ' order by (x->>'linha')::int) from jsonb_array_elements(:'res'::jsonb->'erros') x)
   like '5:Sem nome%| 6:Sem preço%| 7:%inteiro%| 8:Unidade desconhecida.%',
  (select string_agg(x->>'linha' || ':' || (x->>'mensagem'), ' | ') from jsonb_array_elements(:'res'::jsonb->'erros') x);

-- pular existentes e ajustar estoque
select importar_produtos(:'e', '[{"linha": 2, "nome": "Brahma Lata 350ml", "codigo_barras": "7891149101009", "preco_venda": 9, "estoque": 40}]'::jsonb, 'pular') as r2 \gset
insert into r(teste, ok) select 'modo pular não mexe', (:'r2'::jsonb->>'pulados')::int = 1 and (select preco_venda from produtos where codigo_barras = '7891149101009') = 4.5;
select importar_produtos(:'e', '[{"linha": 2, "codigo_barras": "7891149101009", "preco_venda": 4.7, "estoque": 40}]'::jsonb, 'atualizar', true) as r3 \gset
insert into r(teste, ok, detalhe) select 'ajustar estoque vira contagem', (select estoque_atual from produtos where codigo_barras = '7891149101009') = 40
  and exists (select 1 from movimentacoes_estoque m join produtos p on p.id = m.produto_id where p.codigo_barras = '7891149101009' and m.observacao = 'Importação de planilha'), :'r3';
reset role;

select pg_temp.como('b14b14b1-0000-0000-0000-000000000002');
select aceitar_convite(:'tok') \gset
insert into r(teste, ok, detalhe) select 'funcionário não importa', pg_temp.erro(format($$select importar_produtos(%L, '[{"nome":"x","preco_venda":1}]'::jsonb)$$, :'e')) like 'Somente o dono%', null;
reset role;

\set QUIET 0
select n, case when ok then 'OK' else 'FALHOU' end as resultado, teste, detalhe from r order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok or ok is null) as falharam from r;
