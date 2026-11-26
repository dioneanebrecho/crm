# Pedido de mudança 044: vitrine pública com araras (página da cliente)

Criado em 25/11/2026. Migration `0085_vitrine_publica` (`sql/0085_vitrine_publica.sql`), **aplicada** em 25/11 com autorização do Dione ("Pode aplicar e testar"). Testes: `sql/testes/85_testes_vitrine_publica.sql` (rodam num DO que termina em exceção, sem deixar dado; resultado esperado `TESTES_OK`).

Base: mockup validado "Ane Brechó — Vitrine com cabides" (artboard *Vitrine — arara interativa*, 22/11) e pedido 020 (fila única e link único). O mockup nunca tinha virado código: o pedido 020 deixou a página pública pendente por falta de acesso ao código.

## Decisões do Dione (25/11)
1. **Endereço:** `crm.evoconecta.io/vitrine` por enquanto; domínio próprio da loja parametrizável em **Integrações › Vitrine pública**.
2. **Pagamento:** sem gateway nesta entrega. Com a reserva ativa, a página mostra o cronômetro e o botão **Pagar pelo WhatsApp** (o suporte envia o link, como hoje).
3. **CPF e endereço:** coletados ao reservar (CEP preenche rua, bairro e cidade).
4. **WhatsApp da loja:** campo novo em **Preferências da vitrine**.

## O que entrou

**Banco (0085, só aditivo)**
- `venda.cfg_vitrine.whatsapp_loja` (55 + DDD + número, com check). `api.salvar_preferencias_vitrine` aceita o campo e normaliza o número.
- `api.publico_vitrine(p_canal, p_empresa)` (anon): arara com as peças abertas da vitrine, situação, foto (capa aprovada ou 1ª foto), categoria, aparência e regras. Sem dado pessoal. Com uma única empresa com vitrine, dispensa identificar a loja na URL.
- `api.publico_entrega_obter(token)` e `api.publico_entrega_salvar(token, ...)` (anon, protegidas pelo token de acompanhamento de 64 caracteres e só com **reserva ativa**): CPF validado (dígitos), **cifrado** em `crm.cad_cliente_documento` (`pgp_sym_encrypt` com a chave `chave_documento` do Vault, criada no primeiro uso) e hash HMAC igual ao do Bling (`bling.fn_hash_doc`); endereço novo vira o principal em `crm.cad_cliente_endereco` (origem `vitrine`). Cliente recorrente vê só dados mascarados e escolhe "Entregar aqui".
- Funções internas: `venda._chave_documento()` (sem acesso para anon/authenticated), `venda._cpf_valido()`, `venda._reserva_do_token()`.

**Painel (`painel/src`)**
- `vitrine/Vitrine.tsx`, `vitrine/apiPublica.ts`, `vitrine/vitrine.css`: página pública carregada sob demanda em `main.tsx` quando o caminho começa com `/vitrine` (não carrega o painel nem pede login).
  - Rotas: `/vitrine` (arara), `/vitrine/p/<código>` (peça aberta), `/vitrine/a/<token>` (acompanhamento). Canal pela query `?c=`.
  - Araras com balanço dos cabides (nenhum/suave/médio/forte, das Preferências; respeita "reduzir movimento"), etiqueta pendurada com código e preço (configuráveis), categorias, 2 a 5 colunas conforme a tela, tema claro/escuro/seguir o celular.
  - Ficha: galeria na ordem das Preferências (vídeo com autoplay só se configurado), tamanho, estado, marca, atributos, descrição, status e CTA "Quero esta peça" / "Entrar na fila".
  - Passos: nome + WhatsApp + @ (aceite obrigatório, marketing opcional) → reserva com cronômetro + CPF/endereço → Pagar pelo WhatsApp; fila com posição atualizada a cada 8 s; pago; fim (prazo acabou, vendida, indisponível) com parecidas e "Avise-me" pelo WhatsApp.
  - Peça sem foto usa a silhueta do mockup pela categoria/nome.
- **Integrações › Vitrine pública**: domínio da loja (grava `url_base = <domínio>/vitrine/p/`).
- **Preferências da vitrine**: campo WhatsApp da loja (o antigo "Endereço público" saiu daqui e foi para Integrações).
- Link padrão das peças (`urlPublica`): `/vitrine/p/` deste painel quando não há domínio.
- `public/_headers`: `connect-src` inclui `https://viacep.com.br` (CEP na página pública).
- Fontes do mockup como pacotes locais (`@fontsource/cormorant-garamond`, `@fontsource-variable/dm-sans`), porque a CSP não libera o Google Fonts.

## Limites
- Sem gateway: o pagamento segue pelo WhatsApp/suporte. Frete não é calculado na página.
- O HTML aprovado em "Montar oferta" **não** é renderizado na página (só a descrição em texto) até haver limpeza por lista permitida (P30).
- "Avise-me" abre o WhatsApp da loja; ainda não há lista de interesse gravada no banco.
- ~~Reservas não expiravam sozinhas~~ **Resolvido na 0086** (`sql/0086_cron_expirar_reservas.sql`, aplicada em 25/11 com "pode executar os migrations"): job `vitrine-expirar-reservas` a cada 30 s chama `live.expirar_reservas(200)`; `encerrar_reserva` promove a próxima da fila. Primeira rodada 23h08 encerrou a única reserva vencida (teste de 22h25). Reversão: `select cron.unschedule('vitrine-expirar-reservas');`. Fecha o item 3 do pedido 020.
- Proteção contra robô (Turnstile) ainda não existe; `publico_quero` tem só o limite por visitante/telefone.

## Reversão
`drop function api.publico_vitrine(text, uuid), api.publico_entrega_obter(text), api.publico_entrega_salvar(text, boolean, text, text, text, text, text, text, text, text), venda._reserva_do_token(text), venda._cpf_valido(text), venda._chave_documento();` restaurar `api.salvar_preferencias_vitrine` da 0034; `alter table venda.cfg_vitrine drop column whatsapp_loja;`. No painel, reverter os arquivos listados.
