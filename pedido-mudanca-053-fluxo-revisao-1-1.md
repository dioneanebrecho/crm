# Pedido de mudança 053: fluxo do processo, revisão 1.1

Data: 26/11/2026 · Solicitante: Dione ("atualize o fluxo com base nas últimas atualizações do projeto") · Situação: **aplicado e testado**. Base: pedidos 049 (expedição e financeiro), 051 (telas do financeiro) e 052 (Movimentação financeira com permissão por usuário).

## O que mudou nas etapas
| Etapa | Mudança |
|---|---|
| E08 Conferir o financeiro da nota | **Em uso.** Na confirmação, cada parcela e rubrica vira título a pagar ligado à nota; título de NF-e não se altera pelo financeiro |
| E09 Confirmar a entrada | Entrega inclui os títulos a pagar; estorno cancela os títulos juntos |
| E23 Montar o envio | O envio vai para a aba Conferência; situações novas (aguardando conferência → conferida → …); peça nova devolve o envio à bancada |
| E25 → posição 24 | Vira **Conferir as peças, pesar e medir a caixa**, na Expedição › Conferência, **antes** do frete: bipagem (leitor, coletor ou câmera), peso e medidas reais |
| E24 → posição 25 | Frete só depois da conferência; título a receber do frete nasce com a cobrança e é baixado pela Getnet; Melhor Envio cadastrado, cotação ainda só na simulação |
| E27 Postar e informar o rastreio | Rastreio por pedido com link; custo da postagem vira título a pagar; `/rastreio` passa a funcionar; resultado do frete no envio |
| E28 Pós-venda | Marcar o envio como entregue (aba Enviadas) |
| E29 Devolução | Estorno, devolução ou adiantamento na Movimentação financeira |
| E30 Receitas | Retitulada; tela Movimentação financeira (Receitas); **segue em implantação**: títulos das peças ainda não nascem do pagamento do gateway |
| E31 Despesas | Retitulada; **em uso**: títulos automáticos (NF-e, rubricas, postagem), recorrência, NFS-e com retenções, baixas, compensação, renegociação; permissão por usuário |
| E32 Conciliação | **Em uso**: OFX, sugestões, título da linha, Contas e saldos; repasses da Getnet pela linha do extrato |
| E33 Fechar o mês | Saldo por conta e fechamento do período em Cadastros financeiros |

Situação geral: 23 em uso, 8 em implantação, 2 manuais (antes: 19, 9, 3 planejadas e 2 manuais).

## Banco
- `sql/0097_fluxo_revisao_1_1.sql`: só dados. Altera as 12 etapas e registra **uma** revisão (1.1, tipo edição, autor "Implantação") com a cópia completa. A 1.0 continua disponível para comparar ou restaurar na tela.
- Teste `sql/testes/95_testes_fluxo.sql` ajustado para não depender da revisão ser a 1.0; rodado de novo: `TESTES_OK` (11 grupos), nada gravado.

## Painel
Nenhuma mudança de código: a tela lê as etapas do banco.

## Observação
Empresa nova recebe a carga da revisão 1.0 (`crm._fluxo_semear`). Se houver uma segunda empresa, aplicar esta revisão a ela pela tela ou rodando o bloco da 0097 de novo.
