# Pedido de mudança 015 — Grades configuráveis e vínculo ágil com o Bling

Status: **proposta, não aplicada** · Migration: `sql/0025_grades_vinculo_bling.sql` · Solicitante: Dione

## Por quê
- A lista de tamanhos da tela de peças estava fixa no código (letras, numeração 34–48, único). Calçado, infantil, plus size, acessório e lote não cabiam.
- O histórico do Bling mostra tipos de grade bem diferentes (análise de `bling.cad_produto`, 25.200 produtos lidos).
- Criar a peça no CRM e ligá-la ao produto do Bling era manual.

## O que a análise do histórico mostrou
| Tipo | Valores no histórico | Observação |
|---|---|---|
| Roupa · letras | PP, P, M, G, GG, XG | mais comum (~6,5 mil variações) |
| Roupa · numeração | 34–48 (pares) | calças, saias, vestidos |
| Calçado | 33–43, inclusive ímpares | ímpares não existem em roupa |
| Infantil | 1 a 16 | 58 casos |
| Plus size | EXG, G1–G3, 50–54 | hoje caem em "tamanho fora da lista" (~20) |
| Acessório | único (U, UN, ÚNICO) | ~600 casos |
| Lote | VARIADOS e sinônimos | ~1 mil casos, sem controle por tamanho |

## O que muda
1. **Tipos de grade configuráveis** (`catalogo.cfg_tipo_grade`, `_valor`, `_atributo`, `_palavra`), por empresa, com carga padrão com os 7 tipos acima. Cada tipo define: tamanhos, atributos da peça (cor, material, modelo, salto…), atributos por tamanho (busto, cintura, palmilha…) e palavras-chave que sugerem o tipo pelo nome (BOLSA → acessório, TÊNIS → calçado).
2. `cad_peca.tipo_grade_id` + `atributos`; `cad_variacao.atributos` (jsonb, validado contra o tipo no banco).
3. **Vínculo ágil**: `api.sugerir_produtos_bling` (busca por nome/SKU/referência), `api.vincular_peca_bling` (casa variações pelo tamanho) e `api.criar_peca_de_produto_bling` (cria peça + variações a partir do produto lido, sem criar unidades; o saldo continua no Bling).
4. **Correção no espelho**: `bling.processar_produtos` passa a preencher `pai_id` com `idProdutoPai` da listagem. Hoje `pai_id` está vazio em todas as linhas, e por isso as variações não aparecem ligadas ao pai.
5. Nova tela **Configuração › Grades e atributos** (`crm.cad_tela` = `grades`; gestor edita, demais só veem).
6. `api.obter_peca` devolve tipo de grade, atributos e vínculo Bling.

## Segurança e regras
- Todas as funções `security definer`, `search_path` vazio, `api._exigir` por papel; leitura para todos os papéis, escrita só admin/gestor.
- RLS ligado nas 4 tabelas novas, política só para `app_worker`, auditoria nos tipos e atributos.
- Nada é escrito no Bling (D12). O código das variações continua `peça-TAMANHO`; valores de tamanho limitados a `A-Z0-9` (até 10 caracteres).
- Atributo removido de um tipo fica inativo, os valores já gravados nas peças não se perdem.

## Aplicação e teste
1. Aplicar primeiro em branch do Supabase; depois `0022` (fotos/campanhas) e `0025`.
2. Rodar `api.reprocessar_bling` para atualizar o espelho (hoje 25.200 vs 33.367 na listagem bruta) e preencher `pai_id`.
3. Conferir: tipos semeados = 7; `select count(*) from bling.cad_produto where pai_id is not null` ≈ 18 mil.
4. Painel: enquanto a migration não for aplicada, a tela usa a lista padrão embutida e avisa "aguardando a migration 0025".

## Rollback
`drop` das 4 tabelas `cfg_tipo_grade*`, remoção das colunas novas, recriação da versão anterior de `api.obter_peca` e `bling.processar_produtos` (ver `0011` e o histórico).
