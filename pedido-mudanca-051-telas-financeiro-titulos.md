# Pedido de mudança 051 — Telas do financeiro de títulos no painel

**Data:** 26/11/2026 · **Solicitante:** Dione · **Base:** pedido 049 (migrations 0094a–0094f, módulo financeiro de títulos) e protótipo validado no canvas.

## Objetivo
Levar para o painel as telas do módulo financeiro já criado no banco: contas a receber e a pagar, contas e saldos, conciliação bancária e cadastros financeiros.

## O que muda

### Banco (migration `0095_fin_telas_painel`)
- `crm.cad_tela`: `contas_receber`, `contas_pagar` e `conciliacao` passam de *planejada* para *ativa* (rótulo da conciliação vira "Conciliação bancária").
- Telas novas: `contas_bancarias` (Contas e saldos, ordem 155) e `cadastros_financeiro` (Cadastros financeiros, ordem 165).
- `crm._padrao_nivel`: as duas telas novas seguem o padrão do financeiro (gestor **ver**, financeiro **editar**; admin sempre edita).
- `crm._semear_permissoes` rodado para as empresas existentes (só insere o que falta; não altera o que já foi configurado).

### Painel (`painel-ane/painel/src`)
| Arquivo | Conteúdo |
|---|---|
| `apiTitulos.ts` (novo) | Tipos e chamadas das funções `api.fin_*`, formatação, divisão de parcelas e leitor de OFX (no navegador) com hash SHA-256 do arquivo |
| `pages/Titulos.tsx` (novo) | Contas a receber e a pagar (mesma tela, filtrada pelo tipo): KPIs, chips de situação com contagem, filtros lembrados, grade com seleção; detalhe com abas Composição, Rateio, Baixas e Vínculos; modais de novo título/parcelamento/recorrência/NFS-e com retenções, baixa (simples, parcial, em lote, compensação, taxa do tipo de título), renegociação, adiantamento, edição, duplicar, cancelar (título, grupo, a partir da parcela), efetivar provisão, estornar baixa, desfazer renegociação, cancelar adiantamento |
| `pages/ContasBancarias.tsx` (novo) | "Saldo em" uma data, cartões por conta (sistema, conciliado, a conciliar, extrato e diferença), movimentos com saldo linha a linha e situação no banco, transferência e estorno de transferência |
| `pages/Conciliacao.tsx` (novo) | Importação do OFX com prévia (período, entradas, saídas, saldo final), saldos extrato × conciliado × sistema na data, conferência do saldo final do OFX, linhas com sugestão, conciliar/escolher/criar título/ignorar/desfazer, saldo dia a dia e baixas sem extrato |
| `pages/CadastrosFinanceiro.tsx` (novo) | Contas bancárias, tipos de título, projetos e parâmetros (naturezas automáticas, CR financeiro, órgãos das guias, dia das guias, janela de sugestão, período fechado) |
| `pages/finComum.tsx`, `pages/financeiro.css` (novos) | Selo de situação, campo de valor em reais, busca de parceiro, editor de rateio, estilos |
| `App.tsx` | 5 itens no grupo Financeiro e as rotas |
| `busca.tsx` | Palavras-chave das 5 telas |
| `ajuda/conteudo.ts` | Verbetes das 5 telas; `VERSAO_DOC` 0.12.1 → 0.13.0 (manual regenerado) |

## Validação
- `node scripts/verificar-ajuda.mjs`: ok, 32 telas documentadas.
- `tsc --noEmit`: sem erros.
- `vite build` (saída em pasta temporária, porque a pasta `dist` não pode ser apagada pela sessão): ok.
- Leitor de OFX testado com arquivo de exemplo (SGML sem fechamento de tags, valor com vírgula, data com fuso, `LEDGERBAL`).
- Chamadas `fin_cadastros`, `fin_titulos_listar` e `fin_saldos` executadas como admin (transação desfeita): formatos conferem com os tipos do painel.

## Reversão
- Painel: restaurar `App.tsx`, `busca.tsx` e `ajuda/conteudo.ts` de `painel/.bak-050/` (retirando à mão as linhas de outras sessões feitas depois do backup, como a tela Fluxo do processo) e apagar os arquivos novos listados acima.
- Banco: `update crm.cad_tela set situacao = 'planejada' where tela in ('contas_receber','contas_pagar','conciliacao'); delete from crm.cfg_permissao_tela where tela in ('contas_bancarias','cadastros_financeiro'); delete from crm.cad_tela where tela in ('contas_bancarias','cadastros_financeiro');` e recriar `crm._padrao_nivel` sem as duas linhas.

## Pendências
- Gestor fica com **ver** nas telas do financeiro por padrão; para o gestor lançar e baixar, liberar **editar** em Permissões.
- Cadastrar as contas bancárias com saldo inicial na data de corte (D2) e os títulos em aberto da implantação.
- Itens do pedido 049 continuam: parcelas da NF-e já confirmada, taxas reais dos tipos de título, títulos de venda vindos do gateway, ligação de `vw_titulo_apropriacao` ao DRE, validação das retenções com o contador.
- Outra sessão criou arquivos `sql/0094a_expedicao_*`, `0094d_*`, `0094e_*` no repositório com a mesma numeração 0094 das migrations do financeiro; os nomes são diferentes e não conflitam no banco, mas vale renumerar para evitar confusão.
