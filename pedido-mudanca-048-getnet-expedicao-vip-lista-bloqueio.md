# Pedido de mudança 048: Getnet, expedição consolidada, VIP e lista de bloqueio

Data: 26/11/2026 · Situação: banco aplicado e testado; painel pronto (tsc e build ok); Edge Functions da Getnet escritas, **não publicadas**.

## O que foi pedido

1. O gateway será a Getnet.
2. O frete fica no backoffice do CRM. Várias peças pagas da mesma pessoa viram um envio só, e o frete é cobrado ao montar o envio.
3. LGPD: ok.
4. Endereço do painel: o parceiro passa a ser o lugar oficial.
5. Cada peça é paga na hora, com duas exceções:
   - **VIP:** acumula peças e paga no fim do dia ou da live. O limite de peças e de valor é definido por cliente.
   - **Lista de bloqueio** (@ ou WhatsApp): a pessoa é ignorada na live, na vitrine e nas mensagens, mas as tentativas são medidas na Caixa de entrada.

## Banco (migrations 0092a–0092i, no histórico do Supabase)

| Migration | O que faz |
|---|---|
| 0092a_vip_lista_bloqueio | `crm.cfg_parceiro_regra` (VIP: máx. peças, máx. valor, prazo fim do dia/da live, tolerância; bloqueio com motivo). `crm.log_tentativa_bloqueada`. Live descarta com motivo `lista_bloqueio`; vitrine responde "não disponível" sem revelar o bloqueio; conversa sai das filas (`mov_conversa.lista_bloqueio`); mensagem recebida conta tentativa. `atendimento_conversas` ganha a visão `lista_bloqueio`; `atendimento_resumo` ganha `lista_bloqueio` e `tentativas_bloqueadas`. Reserva VIP dentro do limite ganha prazo até o fim do dia ou da live (`pagamento_acumulado`). APIs `parceiro_regra_obter/salvar`, `lista_bloqueio_incluir`; filtros e marcas `#VIP`/`#BLOQUEIO` em `listar_parceiros` |
| 0092b | Fila: motivo de saída `lista_bloqueio` |
| 0092c | LGPD: documento expira em 5 anos (cron `lgpd-expurgo-documentos`); `api.parceiro_anonimizar` (admin). `cliente_endereco_salvar` grava em `cad_parceiro_endereco`; tabelas antigas de endereço/documento do cliente marcadas como APOSENTADAS |
| 0092d_expedicao | `venda.mov_expedicao` + `rel_expedicao_pedido`, `vw_pedido_destino`. Situações: aguardando_frete → frete_cobrado → pronta → enviada → entregue (ou cancelada). Frete vira cobrança `tipo = 'frete'`. APIs `expedicao_pendentes/montar/definir_frete/frete_pago/enviar/cancelar/expedicoes`. Tela `envios` ativada como "Expedição" |
| 0092e | Base Getnet: segredos, colunas Pix/link na cobrança, `svc_cobranca_da_reserva`, `svc_getnet_registrar`, `svc_getnet_notificacao` (APPROVED/PAID/CONFIRMED/CAPTURED → `registrar_pagamento 'getnet'`), `criar_cobranca_parceiro`, `api.vip_fechar_acumulado` |
| 0092f / 0092g | Log da notificação com fonte `gateway` (`getnet:` no id externo); `svc_getnet_segredos_webhook` |
| 0092h | Integração `gateway` aceita `provedor` (só getnet), `ambiente`, `client_id`, `seller_id`, `base_url` (só `*.getnet.com.br`), `link_path` |
| 0092i | `svc_cobranca_da_reserva` devolve `link_path` |

Testes: `sql/testes/92_testes_vip_bloqueio_expedicao_getnet.sql` (passou); regressões 85, 90 e 91 ajustadas e passando.

Para copiar o SQL de uma migration: `select array_to_string(statements, E';\n') from supabase_migrations.schema_migrations where name = '0092a_vip_lista_bloqueio';`

## Painel

- **Expedição** (nova, menu Clientes e pós-venda):
  - A montar: pedidos pagos agrupados por cliente e endereço.
  - Em andamento: definir ou alterar o frete (ou grátis), frete pago, enviar com rastreio, desfazer.
  - Enviadas.
  - Avisa quando a cliente ainda tem peças reservadas.
- **Parceiros:**
  - Aba "Regras (VIP e bloqueio)": limites, acumulado em aberto, "Fechar acumulado" (cobrança única ou pagamento já conferido), anonimizar (admin).
  - Botão "Bloquear @ ou WhatsApp".
  - Filtros "VIP" e "Lista de bloqueio".
  - Selos VIP e Bloqueado.
- **Caixa de entrada:**
  - Visão "Bloqueados (n)".
  - Indicador "Tentativas bloqueadas (7 dias)"; o detalhe de 30 dias por origem aparece ao passar o mouse.
- **Integrações:** aba Pagamentos → Getnet (ambiente, Client ID, Seller ID, URL base, Client Secret, segredo da URL de notificação).
- **Link da reserva (vitrine):**
  - Depois dos dados de entrega, chama a função `pagamento`.
  - Pix: mostra copia e cola com botão, QR e contagem do prazo, com opção de gerar outro.
  - Cartão: botão para a página da Getnet (Apple Pay / Google Pay).
  - Sem gateway ligado ou publicado, segue o WhatsApp como antes.
- Ajuda: verbetes Expedição, Parceiros e Caixa de entrada; manual v0.12.0.

## Edge Functions (não publicadas)

- `supabase/functions/pagamento`:
  - `verify_jwt = false`; a autorização é o token pessoal da reserva.
  - Faz OAuth client_credentials e gera o Pix (`/v1/payments/qrcode/pix`, com seller_id) ou o link de cartão (Payment Link API).
  - Registra o resultado na cobrança.
- `supabase/functions/getnet-notificacao`:
  - `verify_jwt = false`; a proteção é o segredo `?k=` (comparação em tempo constante).
  - Aceita GET/POST e repassa a `svc_getnet_notificacao`, que é idempotente.
- Os trechos marcados **[validar]** dependem da documentação da conta: escopo do token, campo do copia e cola, caminho e corpo do Payment Link.

## Pendências

1. A Ane solicita na Getnet: Ecommerce Web + Pix habilitado + "Chaves de autenticação Plataforma Digital" (ver `mapeamento-getnet.md`).
2. Validar os [validar] em homologação, publicar as duas funções (`scripts/publicar-funcoes.sh`) e cadastrar a URL de notificação.
3. Ligar a integração em modo real só depois de um Pix de teste aprovado ponta a ponta.
4. Conferência visual do link de pagamento com uma reserva real ativa.
5. Commit e deploy do painel (não feitos).
