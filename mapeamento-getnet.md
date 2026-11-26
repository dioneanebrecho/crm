# Mapeamento Getnet (gateway da Ane Brechó)

Atualizado em 26/11/2026 (pedido 048). Fonte: documentação pública da Getnet (developers.getnet.com.br e docs.globalgetnet.com). Os pontos marcados **[validar]** precisam ser confirmados na documentação liberada para a conta da Ane.

## Decisão

- **Pix dinâmico pela API (prioridade).** Aprovação na hora, menor taxa e o fluxo mais curto no celular: copiar o código e colar no app do banco.
- **Cartão pela página da Getnet (Payment Link).** A loja nunca vê nem guarda dados de cartão (PCI). A página da Getnet oferece Apple Pay e Google Pay quando habilitados, o que atende ao "usar a carteira do celular".
- **Confirmação só pelo servidor.** A notificação da Getnet chama a função `getnet-notificacao`, e o banco registra o pagamento. O navegador nunca confirma pagamento.

## Checklist para a Ane pedir à Getnet

1. Credenciamento **Ecommerce Web** (Plataforma Digital) ativo no CNPJ da loja.
2. **Pix habilitado** na conta e chave Pix vinculada.
3. **Chaves de autenticação Plataforma Digital**: Client ID, Client Secret e Seller ID (homologação e produção).
4. **Payment Link** habilitado, com Apple Pay e Google Pay, se disponíveis no plano.
5. **URL de notificação** cadastrada no portal: `https://gikudypnbnnugduphbpb.supabase.co/functions/v1/getnet-notificacao?k=<segredo>`. O segredo é o mesmo texto gravado em Integrações > Pagamentos > "Segredo da URL de notificação".
6. Confirmar o tempo máximo do QR Pix na conta. O padrão é 180 s e o máximo 1800 s; o sistema usa o prazo restante da reserva, entre 3 e 30 min.

## Fluxo técnico

1. A cliente confirma CPF, endereço e forma no link e toca em pagar.
2. A função `pagamento` chama `api.svc_cobranca_da_reserva`, que cria ou reaproveita a cobrança; se já houver Pix válido, devolve o mesmo.
3. A função obtém o token da Getnet: `POST {base}/auth/oauth/v2/token` (Basic client_id:client_secret, `grant_type=client_credentials`, `scope=oob` [validar]).
4. Conforme a forma escolhida:
   - **Pix:** `POST {base}/v1/payments/qrcode/pix`, com cabeçalho `seller_id` e corpo `amount` (centavos), `currency` BRL, `order_id` = id da cobrança, `customer_id`, `expiration_time`. O copia e cola vem em `additional_data.qr_code` [validar].
   - **Cartão:** Payment Link API (BR). Caminho padrão `/v1/payment-links` [validar]; pode ser trocado sem código pelo parâmetro `link_path`.
5. `api.svc_getnet_registrar` guarda o Pix (copia e cola + validade) ou o link na cobrança.
6. A Getnet notifica a função `getnet-notificacao`, que chama `api.svc_getnet_notificacao`:
   - registra o log, que é idempotente;
   - acha a cobrança por `order_id` ou `payment_id`;
   - com status aprovado, chama `venda.registrar_pagamento`, que confirma o pagador, gera o pedido e libera a fila.
7. O Payment Link não tem webhook documentado. Se a notificação não vier para cartão, a alternativa é consultar as ordens do link (`pending / paid / approved / refunded / denied`) num cron [validar].

## Ambientes

| Ambiente | URL base |
|---|---|
| Homologação | https://api-homologacao.getnet.com.br |
| Sandbox | https://api-sandbox.getnet.com.br |
| Produção | https://api.getnet.com.br |

## Onde está no sistema

- **Configuração:** Integrações > Pagamentos > Getnet (`engine.cfg_integracao` 'gateway'; segredos no Vault).
- **Banco:** migrations 0092e–0092i.
- **Funções:** `supabase/functions/pagamento` e `supabase/functions/getnet-notificacao`.
- **Link:** `vitrine/Vitrine.tsx` (`PagarGetnet`).
- **Modo de operação:**
  - `desligado` ou `simulado`: a página segue pelo WhatsApp.
  - `real`: Pix e cartão aparecem direto no link.
