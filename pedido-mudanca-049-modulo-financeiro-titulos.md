# Pedido de mudança 049: módulo financeiro (títulos, baixa, banco e conciliação)

Executado em 26/11/2026, com autorização do Dione ("pode implementar e executar os migrations necessários"). Projeto `crm_anebrecho`. Plano: `plano-modulo-financeiro-titulos.md` (decisões D1 a D6). Protótipo validado no canvas "Ane Brechó · Módulo Financeiro".

Só banco. **O painel ainda não chama estas funções** (telas `contas_receber`, `contas_pagar` e `conciliacao` continuam `planejada` em `crm.cad_tela`).

## Migrations aplicadas

| Migration | Conteúdo |
|---|---|
| 0094a_fin_estrutura | 16 tabelas novas no schema `financeiro`, RLS sem policies, auditoria, `guarda_origem`; 9 naturezas neutras (8.05 adiantamentos e impostos retidos); 9 tipos de título com taxa zerada; parâmetros iniciais |
| 0094b_fin_regras | Gatilhos de integridade, recálculo de saldo e situação, período fechado, bloqueio de exclusão, títulos automáticos na confirmação da NF-e de entrada |
| 0094c_fin_api_titulos | Funções internas e API de cadastros e títulos |
| 0094d_fin_api_baixa_banco | API de baixa, estorno, cancelamento, renegociação, adiantamento, banco e conciliação; view `vw_titulo_apropriacao` |
| 0094e_fin_baixar_alias | Correção pontual de um apelido ambíguo em `fin_baixar` |
| 0094f_fin_indices | Índices das chaves usadas por vínculos e conciliação |

Arquivos: `sql/0094a_fin_estrutura.sql`, `0094b_fin_regras.sql`, `0094c_fin_api.sql` (texto final das partes c, d e e), `0094e_fin_baixar_alias.sql`, `0094f_fin_indices.sql`. Testes: `sql/testes/94_testes_financeiro.sql`, **TESTES_OK: 20**, nada gravado (conferido). Advisors: só os avisos informativos de sempre (RLS sem policy por desenho e chaves sem índice).

## Modelo

- **Cadastros:** `cad_conta_bancaria` (saldo inicial no início do dia), `cad_tipo_titulo` (modalidade, taxa, dias de compensação, natureza da taxa), `cad_projeto`, `cfg_financeiro` (natureza de cada componente da baixa, adiantamentos, retenções, CR financeiro, órgãos, dia de vencimento das guias, data de fechamento, janela de conciliação).
- **Título:** `mov_titulo` com valor original, retenções (ISS, IRRF, INSS, PIS/COFINS/CSLL), líquido calculado, saldo e situação (aberto, parcial, baixado, renegociado, cancelado); vencido e conciliado são calculados na leitura. Vínculos: entrada e parcela da NF-e, pedido, cobrança, pagamento, chave da NF-e, grupo (parcelamento, contrato, recorrente, nota, renegociação), duplicado de, guia de retenção de, provisão substituída, adiantamento (entrada ou contrapartida).
- **Rateio:** `rel_titulo_rateio` natureza × CR × projeto por %, sempre 100%; componente `juros` para o acréscimo de renegociação.
- **Baixa:** `mov_baixa` (principal, juros, multa, desconto, taxa, valor movimentado), `mov_baixa_lote` (agrupada ou compensação), `mov_conta_movimento` (data da baixa, data do banco, quando foi conciliado). Estorno marca e preserva; nada se exclui.
- **Renegociação:** `mov_renegociacao` + `rel_renegociacao_titulo` (N:N, papel original/novo). Um título renegociado pode entrar em outra renegociação, agrupado com outros.
- **Adiantamento:** `mov_adiantamento` com título de entrada (baixado na conta) e contrapartida aberta, compensada depois.
- **Extrato:** `mov_extrato` (arquivo, saldo informado pelo banco) e `mov_extrato_linha` (única por conta + FITID).

## Regras garantidas no banco

- Natureza e CR analíticos e ativos; natureza de receita não entra em título a pagar e vice-versa; regra de CR canal.
- Título de NF-e: valor, parceiro e tipo só mudam pela entrada; não se cancela pelo financeiro.
- Título com baixa ativa não muda valor, parceiro, tipo, nem é cancelado; estorne antes.
- Título de grupo só se cancela pelo grupo (todos em aberto ou desta parcela em diante).
- Provisão não aceita baixa até ser efetivada ou substituída por título real.
- Baixa não passa do saldo; baixa estornada não volta; movimento conciliado não se estorna (desconcilie antes).
- Saldo inicial da conta não muda depois de haver movimento conciliado.
- Período fechado bloqueia títulos, baixas, estornos e conciliação com data até o fechamento.
- Ao confirmar a NF-e de entrada, cada parcela (e rubrica que gera financeiro) vira um título a pagar ligado à parcela (`compra.mov_entrada_parcela.titulo_id`).

## API (admin, gestor e financeiro; `fin_cfg_salvar` só admin e gestor)

| Função | Para quê |
|---|---|
| `fin_cadastros` | Contas, tipos de título, projetos, naturezas e CRs analíticos, parâmetros |
| `fin_conta_salvar`, `fin_tipo_titulo_salvar`, `fin_projeto_salvar`, `fin_cfg_salvar` | Manutenção dos cadastros |
| `fin_titulo_criar` | Título avulso, parcelamento, contrato ou recorrência; retenções na 1ª parcela e guias quando a Ane recolhe |
| `fin_titulo_salvar` | Edição (respeita as travas) e troca de rateio |
| `fin_titulos_listar` | Grade com filtros (tipo, situações, período, parceiro, natureza, CR, projeto, conta, origem, grupo, busca), contagem por situação e resumo |
| `fin_titulo_obter` | Detalhe com composição, efeito no caixa, rateio, baixas (com datas do banco) e todos os vínculos |
| `fin_baixar` | Baixa simples, parcial, agrupada e compensação (receber e pagar do mesmo parceiro) |
| `fin_baixa_estornar` | Estorno (do lote inteiro, quando agrupada) |
| `fin_titulo_cancelar`, `fin_titulo_duplicar`, `fin_provisao_efetivar` | Cancelar (com modo de grupo), duplicar (+1 mês), efetivar ou substituir provisão |
| `fin_renegociar`, `fin_renegociacao_desfazer` | Renegociação com juros e desconto; desfazer na ordem inversa |
| `fin_adiantamento_criar`, `fin_adiantamento_cancelar` | Adiantamento de cliente ou fornecedor |
| `fin_transferir`, `fin_transferencia_estornar` | Transferência entre contas |
| `fin_saldos`, `fin_movimentos` | Saldo do sistema, conciliado e do extrato numa data; extrato do sistema com saldo corrido |
| `fin_extrato_importar` | Linhas do OFX (o painel lê o arquivo); repetidas são ignoradas pelo FITID |
| `fin_conciliacao` | Saldos na data, diferença, conferência com o saldo do OFX, saldo dia a dia, linhas com sugestão e baixas sem extrato |
| `fin_conciliar`, `fin_desconciliar`, `fin_extrato_ignorar`, `fin_extrato_criar_titulo` | Conciliação; criar título já baixado e conciliado a partir da linha (tarifa, IOF, DAS) |
| `fin_gerar_titulos_entrada` | Gera os títulos de uma NF-e já confirmada (idempotente) |

`financeiro.vw_titulo_apropriacao` entrega a apropriação para o DRE: competência pelo rateio do valor original (títulos de renegociação só com a parte de juros) e juros, multa, desconto e taxa de cada baixa na natureza dos parâmetros.

## Pendências

1. **Telas do painel** (fase seguinte): contas a pagar e receber, título, baixa, renegociação, contas bancárias, conciliação e cadastros, seguindo o protótipo; leitor de OFX no navegador; ativar as telas em `crm.cad_tela`.
2. **Implantação (D2):** cadastrar as contas com saldo inicial e lançar os títulos em aberto com `origem_tipo = 'implantacao'`; definir a data de corte do Bling.
3. **NF-e já confirmada:** há 1 entrada confirmada com 2 parcelas, anterior ao módulo. Gerar os títulos com `fin_gerar_titulos_entrada` se as parcelas ainda estiverem em aberto.
4. **Taxas reais** dos tipos de título (PIX, cartão e boleto estão com 0).
5. **Vendas (fase 8):** títulos a receber a partir do pagamento confirmado no gateway, um por parcela do cartão.
6. **Painel de Gestão:** ligar `vw_titulo_apropriacao` em `financeiro._lanc_base` para o DRE ler o módulo novo junto com o histórico do Bling.
7. **Validar com o contador** as naturezas das retenções e o vencimento das guias (dia 20 do mês seguinte, parametrizável).

## Reversão

Nenhum dado existente foi alterado. Para desfazer: `drop trigger financeiro_titulos on compra.mov_entrada`; `drop view financeiro.vw_titulo_apropriacao`; `drop function` das funções `api.fin_*`, `api._fin_papeis` e das internas novas de `financeiro`; `drop table` das 16 tabelas novas (na ordem inversa das dependências); `delete` das naturezas `8.05%` e dos tipos de título.
