# Pedido de mudança 052 — Movimentação financeira (receita e despesa na mesma tela) com permissão por usuário

**Data:** 26/11/2026 · **Solicitante:** Dione · **Base:** pedidos 049 e 051.

## Objetivo
Substituir as telas separadas Contas a receber e Contas a pagar por uma tela única, **Movimentação financeira**, com o tipo (receita ou despesa) como campo do título. A tela dá a visão geral, permite compensar receita com despesa e mostra o resumo dos dois lados no mesmo painel. O acesso passa a ser liberado **por usuário**, ação por ação.

## Decisões
- Permissão **por usuário** (não por papel), escolhida pelo Dione. Admin e superadmin têm todas as ações.
- As telas Contas a receber e Contas a pagar foram **substituídas**: saem do menu e do cadastro de telas. Atalhos antigos para elas abrem a Movimentação financeira.
- A tabela de títulos já era única (`financeiro.mov_titulo`, campo `tipo` R/D); nada muda nos dados.

## Ações por usuário
| Ação | Libera |
|---|---|
| Ver receitas | Títulos a receber na lista, no resumo e no detalhe |
| Ver despesas | Títulos a pagar na lista, no resumo e no detalhe |
| Lançar | Novo título, parcelamento, recorrência, NFS-e, adiantamento, duplicar, gerar títulos da NF-e |
| Editar | Vencimento, rateio, tipo, conta, efetivar provisão |
| Baixar | Receber, pagar, baixa em lote, compensação, transferência entre contas |
| Estornar | Estorno de baixa e de transferência |
| Renegociar | Renegociar e desfazer renegociação |
| Cancelar | Cancelar título, parcelas e adiantamento |
| Conciliar | Importar OFX, conciliar, ignorar, criar título do extrato, desfazer conciliação |

Toda ação também exige ver o tipo do título envolvido (quem só vê despesas não baixa, não lança nem abre receitas).

## Banco (migration `0096a_fin_permissao_usuario`)
- Tabela `financeiro.cfg_permissao_usuario (empresa, usuário, ação)` com auditoria e RLS sem políticas (acesso só pelas funções `api`).
- Funções `financeiro._pode`, `_exigir_acesso`, `_exigir_acao`, `_ve_tipo`, `_exigir_tipo`.
- As 28 funções `api.fin_*` passaram a exigir acesso (papel do financeiro **ou** alguma ação concedida) e a ação correspondente. `fin_titulos_listar` filtra pelo que o usuário pode ver; o resumo segue o mesmo filtro.
- Novas: `api.fin_minhas_acoes`, `api.fin_permissoes_listar` e `api.fin_permissoes_salvar` (as duas últimas só admin).
- `crm.cad_tela`: nova `movimentacao_financeira` (ordem 140); `contas_receber` e `contas_pagar` removidas (e suas linhas na matriz).
- `api.nivel_tela`: para `movimentacao_financeira` o nível vem das ações do usuário (ver = só ver receita/despesa; editar = alguma outra ação), não da matriz por papel.
- Ponto de partida: quem tinha papel **financeiro** recebeu todas as ações; **gestor** recebeu ver receitas e ver despesas.

## Painel
| Arquivo | Mudança |
|---|---|
| `pages/MovimentacaoFinanceira.tsx` (novo, substitui `pages/Titulos.tsx`) | Filtro Receitas e despesas / Receitas / Despesas; resumo com a receber, a pagar, saldo previsto, vencidos e provisões; colunas Tipo e Efeito no caixa (soma com sinal); seleção mista com Compensar (mesmo parceiro); botões + Receita, + Despesa e + Adiantamento (escolhe cliente ou fornecedor); todos os botões conforme as ações do usuário |
| `pages/CadastrosFinanceiro.tsx` | Aba **Permissões por usuário** (só admin): matriz usuário × ação com salvar por linha |
| `pages/ContasBancarias.tsx`, `pages/Conciliacao.tsx` | Transferir exige Baixar; estornar transferência exige Estornar; ações da conciliação exigem Conciliar |
| `apiTitulos.ts`, `pages/finComum.tsx`, `pages/financeiro.css` | Ações, `useAcoes`, chamadas novas e estilos |
| `App.tsx`, `busca.tsx`, `ajuda/conteudo.ts` | Item e rota da Movimentação financeira; atalho dos ids antigos; verbete novo; manual v0.14.0 |

## Validação
- `sql/testes/96_testes_permissao_financeiro.sql`: **TESTES_OK: 17** (usuário só com ver despesa não vê, não abre e não baixa receita; resumo sem receita; sem Baixar/Lançar/Estornar é barrado; com Baixar faz baixa parcial da despesa; nível da tela ver/editar; só admin lista e salva permissões).
- `verificar-ajuda`: ok (31 telas). `tsc --noEmit`: sem erros. `vite build` em pasta temporária: ok.

## Reversão
- Banco: recriar as funções `api.fin_*` a partir de `sql/0094c_fin_api.sql` e `0094e_fin_baixar_alias.sql`; restaurar `api.nivel_tela` sem o caso `movimentacao_financeira`; `drop table financeiro.cfg_permissao_usuario` e as funções `financeiro._pode/_exigir_*/_ve_tipo`; recriar as telas `contas_receber`/`contas_pagar` (ver `0095_fin_telas_painel.sql`) e remover `movimentacao_financeira`.
- Painel: `git revert` do commit deste pedido.

## Pendências
- Revisar as permissões iniciais na aba Permissões por usuário (o usuário com papel financeiro recebeu todas as ações).
- O detalhe de um título pode mostrar, em Vínculos, a contrapartida do outro tipo (ex.: adiantamento ou compensação). É um resumo (número, parceiro, valor); avaliar se precisa ser ocultado para quem não vê aquele tipo.
- Contas e saldos e Conciliação continuam visíveis pela matriz por papel; o extrato mostra entradas e saídas de qualquer tipo.
