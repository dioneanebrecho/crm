# Pedido de mudança 046: Parceiro como cadastro único, Contatos por CPF e pagador no link de pagamento

Executado em 25/11/2026 (23h40 a 00h30). Aprovação: Dione ("sim, pode executar"). Plano: `plano-parceiro-x-cliente-modelo-e-ux.md` (seções 6 e 7).

## Decisões aplicadas
1. A tela **Clientes deixa de existir**: só **Parceiros**, com papéis em multisseleção (cliente, fornecedor, transportadora, funcionário). `crm.cad_cliente` continua como perfil operacional da venda (live, fila, reservas, pós-venda), agora **sempre ligado a um parceiro** (`parceiro_id NOT NULL`).
2. **CPF/CNPJ único** por parceiro. Vários @, WhatsApp e e-mail por CPF ficam na nova tabela **Contatos** (`crm.cad_parceiro_contato`), com vínculo (titular, familiar, terceiro). Quem paga e recebe a nota é o dono do **CPF digitado no link de pagamento**.

## Banco (migrations 0090a a 0090f)
| Migration | O que faz |
|---|---|
| `0090a_parceiro_contatos_estrutura` | `cad_parceiro_contato` (único por empresa+tipo+valor e por igsid entre os ativos), `log_parceiro_contato`, `norm_instagram`, `norm_telefone`; carga dos 1.586 @ já identificados + 23 @ extras escritos no nome dos contatos Bling do mesmo CPF (os 17 @ que já são de outro parceiro ficaram onde estão); colunas de pagador em `live.mov_reserva` (`parceiro_pagador_id`, `pagador_situacao`, `pagador_definido_em`), `venda.mov_cobranca` e `venda.mov_pedido`; novas origens de parceiro |
| `0090b_parceiro_resolver_e_gatilhos` | `crm.resolver_parceiro` (igsid → @ → WhatsApp; senão cria pré-cadastro com papel cliente), `crm._registrar_contato` (nunca tira contato de outro parceiro: registra conflito), gatilho em `cad_cliente` (todo perfil nasce ligado a parceiro: cobre Direct, live, WhatsApp, vitrine e cadastro manual sem mexer nessas funções), gatilho em `cad_parceiro_identificador` (@ novo da reconciliação Bling aparece em Contatos), `crm.absorver_pre_cadastro`, `crm.confirmar_pagador_reserva`; liga o cliente existente |
| `0090c_entrega_define_pagador` | `cad_cliente.parceiro_id NOT NULL`; `api.publico_entrega_salvar` define o pagador pelo CPF e **não grava mais o CPF de terceiro no perfil de quem reservou**; resposta só traz `ok` e `cpf_reconhecido` (nenhum dado do dono do CPF) |
| `0090d_api_parceiro_contatos_resumo` | `api.listar_parceiros` (filtros `pre_cadastro` e `sem_papel`, busca por contato, @ vindos de Contatos), `api.parceiro_resumo`, `api.parceiro_contatos`, `api.parceiro_contato_salvar`, `api.parceiro_contato_mover`, `api.parceiro_absorver` |
| `0090e_parceiro_resumo_fix_faltas` | correção de concatenação de array no resumo |
| `0090f_api_parceiro_salvar` | `api.parceiro_salvar` (criar/editar parceiro, papéis, CPF/CNPJ validado e só como hash + 4 últimos, @ e WhatsApp) — substitui o formulário da tela Clientes |

### Regras do link de pagamento
| Situação | Pagador | O que muda |
|---|---|---|
| CPF é do parceiro do @ | titular | CPF salvo no perfil (como antes) |
| CPF novo e o @ é pré-cadastro | titular | o pré-cadastro recebe o CPF |
| CPF novo e o @ já tem outro CPF | parceiro novo (origem `pagamento`) | nada muda no @ |
| CPF existente, @ pré-cadastro | dono do CPF, `terceiro_confirmar` | ao aprovar o pagamento, `crm.confirmar_pagador_reserva` junta o pré-cadastro ao dono do CPF e marca o @ como **familiar** |
| CPF existente, @ com CPF próprio | dono do CPF, `terceiro` | @ continua com o próprio dono |

"Usar dados salvos" só funciona quando o CPF salvo é do próprio perfil.

## Front (`painel-ane/painel`, sem commit e sem publicação)
- `src/pages/Parceiros.tsx`: botão **+ Novo parceiro**; lista com nome limpo (sem @/INATIVO, caixa normal), papéis e identificação em selos, selo **Pré-cadastro**, filtros por papel/pré-cadastro/sem papel; modal com abas **Resumo** (o que falta para NF-e, números de cliente, fornecedor e financeiro, "Juntar a outro parceiro"), **Contatos** (vínculo, principal, inativar, mover com motivo, adicionar), Cadastro fiscal, Notas, **Origem Bling** (tabela com larguras fixas: fim do @ quebrado letra por letra; "1 ativo · 141 inativos ocultos"; legenda em ⓘ) e Documento e Receita; formulário de edição (nome, papéis, pessoa, CPF/CNPJ quando não há, observação, ativo).
- `src/api.ts`: tipos `ResumoParceiro`, `ContatoCadastro`, `ParceiroEntrada` e métodos novos em `apiParceiros`.
- `src/App.tsx`: tela Clientes fora do menu; atalhos antigos para "clientes" abrem Parceiros. `src/referencias.ts` e `Assistente.tsx` apontam para Parceiros. `src/busca.tsx` (palavras de cliente em Parceiros). `src/ajuda/conteudo.ts` (verbete Parceiros novo, Clientes removido, manual v0.11.0). `src/styles.css` (classes `tabela-fixa`, `parceiro-chips`, `aviso-caixa`, `form-contato`…).
- `src/pages/Clientes.tsx` ficou no disco sem uso (pode ser apagado).
- Verificado: `tsc --noEmit` ok; `verificar-ajuda` ok (25 telas); conferido no `npm run dev` (lista, Resumo, Contatos, Origem Bling e edição). **`vite build` e publicação não feitos.**

## Testes
`testes/90_testes_parceiro_contatos_pagador.sql`: 62 asserções (normalização, Direct só com igsid, live trazendo o @ na mesma linha, @ do Bling reconhecido sem duplicar, conflito sem mover, filha pré-cadastro pagando com CPF da mãe, absorção no pagamento e idempotência, filha com CPF próprio, CPF novo, titular, resumo, contatos, mover, filtros, permissões). Resultado: `TESTES_OK`. Testes 85 (vitrine) repetidos: `TESTES_OK`. `api.parceiro_salvar` testado à parte: `TESTES_OK`. Advisors: só INFO de RLS sem política nas tabelas novas (mesmo padrão das demais).

## Pendências
1. Chamar `crm.confirmar_pagador_reserva(reserva)` no fluxo de pagamento aprovado (webhook do gateway ou "Marcar pago") quando ele existir; hoje nenhuma função marca reserva como paga.
2. Limite de reservas e fila ainda contam por perfil de cliente, não por parceiro (um parceiro com dois @ pode ter dois perfis).
3. Endereço único no parceiro (`cad_parceiro_endereco`) e visão `crm.vw_cliente`: próxima etapa.
4. 5.954 nomes importados do Bling ainda têm @ e "INATIVO" gravados (a tela já mostra limpo; o Resumo aponta "nome civil" como pendente para NF-e). Sugestão: saneamento em lote no CRM, sem gravar no Bling.
5. Na edição, a observação atual não é pré-carregada no formulário (em branco = mantém).
6. Página pública do link de pagamento: mostrar "CPF reconhecido" quando `cpf_reconhecido` vier verdadeiro.

## Reversão
Front: arquivos `*.bak-046` ao lado dos originais (`api.ts`, `Parceiros.tsx`, `App.tsx`, `referencias.ts`, `Assistente.tsx`, `busca.tsx`, `ajuda/conteudo.ts`, `styles.css`).
Banco: `drop trigger tg_cliente_parceiro on crm.cad_cliente; drop trigger tg_identificador_contato on crm.cad_parceiro_identificador; alter table crm.cad_cliente alter column parceiro_id drop not null;` recriar `api.publico_entrega_salvar` e `api.listar_parceiros` da versão anterior (0085 e 0015/0024); `drop function api.parceiro_salvar, api.parceiro_resumo, api.parceiro_contatos, api.parceiro_contato_salvar, api.parceiro_contato_mover, api.parceiro_absorver, crm.confirmar_pagador_reserva, crm.absorver_pre_cadastro, crm.resolver_parceiro, crm._registrar_contato, crm.tg_cliente_parceiro, crm.tg_identificador_contato, crm.norm_instagram, crm.norm_telefone;` `alter table live.mov_reserva drop column parceiro_pagador_id, drop column pagador_situacao, drop column pagador_definido_em; alter table venda.mov_cobranca drop column parceiro_pagador_id; alter table venda.mov_pedido drop column parceiro_pagador_id; drop table crm.log_parceiro_contato, crm.cad_parceiro_contato;` Os @ extras inseridos em `cad_parceiro_identificador` (origem `bling`, 23) podem ficar. Parceiros pré-cadastro criados pelo gatilho ficam como parceiros comuns.

## Linhas para `changelog-banco.md`
| 25/11/2026 | 046 | `0090a`…`0090f` | Contatos do parceiro, resolver e gatilhos, pagador no link de pagamento, API da tela Parceiros, `parceiro_salvar` | ver acima | Dione |
