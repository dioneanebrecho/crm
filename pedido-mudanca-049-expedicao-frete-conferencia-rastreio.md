# Pedido de mudança 049: expedição completa — conferência por código de barras, cotação de frete, financeiro dos dois lados e rastreio automático

Data: 26/11/2026 · Situação: **fases 1 a 3 implementadas e testadas** (migrations 0094a, 0094d e 0094e aplicadas; painel com `tsc` e `build` ok). Fases 4 a 7 (Melhor Envio, webhook, aviso de WhatsApp, Correios) seguem como desenho. Continuação do pedido 048 (expedição consolidada).

> **Feito nesta rodada (26/11/2026)**
> - **0094a — conferência por código de barras.** `venda.rel_expedicao_item_conferido`, peso e medidas em `venda.mov_expedicao`, situações `aguardando_conferencia` e `conferida` no lugar de `aguardando_frete`, e `venda.cfg_expedicao`. APIs `expedicao_por_codigo`, `expedicao_conferencia`, `expedicao_conferir_peca`, `expedicao_fechar_conferencia`, `expedicao_reabrir_conferencia`, `expedicao_cfg_obter/salvar`. `expedicao_montar` devolve o envio à bancada quando entra peça nova depois da conferência; `expedicao_definir_frete` recusa envio não conferido.
> - **0094d — rastreio unificado.** `expedicao_enviar` passa a gravar `venda.mov_envio` (uma linha por pedido, com link da transportadora) e `venda.mov_evento_rastreio`. **Conserta a resposta pronta `/rastreio`.** Novas `expedicao_entregue` e `expedicao_rastreio`.
> - **0094e — financeiro do frete.** Título a receber nasce com a cobrança do frete e é baixado quando a Getnet confirma; `expedicao_registrar_custo` lança o título a pagar da postagem (com baixa opcional). `api.expedicoes` devolve os dois títulos e o resultado do frete. Naturezas semeadas do plano de contas: `1.01.02.001` e `4.01.01.001`.
> - **Painel:** aba **Conferência** com bipagem, aba **Em andamento** com situação dos títulos, custo da postagem, rastreio e entrega; simulação e roteiro de treino refeitos; ajuda e manual v0.15.0.
> - **Testes:** `sql/testes/94_testes_expedicao_conferencia_frete.sql` passou; a regressão `92` foi ajustada e passou.
> - **0094g — Melhor Envio em Integrações → Fretes.** `melhor_envio` (e `correios`) liberados nos CHECKs de `engine.cfg_integracao` e `engine.mov_outbox`; parâmetros `ambiente`, `client_id` e `user_agent` (o `User-Agent` que a API exige) e o segredo `client_secret`. Só o cadastro: a cotação e a compra ainda não chamam a API.
> - **Simulação:** a Expedição demonstra a cotação comparativa (PAC, SEDEX, Jadlog, com Correios direto recusado por falta dos serviços 38202/38210), o Pix do frete pela Getnet com "cliente pagou" e a compra de etiqueta com PDF, rastreio e custo em contas a pagar — tudo fictício.
> - **Leitura por câmera:** a Conferência tem "Ler com a câmera" para celular e coletor Android, sem aplicativo. Usa a `BarcodeDetector` nativa do Chrome no Android e, onde ela não existe (iPhone), baixa sob demanda um leitor em WebAssembly servido pelo próprio painel (chunk separado de 946 KB: quem está no Android nunca baixa). Exige https.
> - **Não feito:** cotação, compra de etiqueta, webhook e aviso automático no WhatsApp (fases 4 a 6) — e a conferência visual da tela no navegador, que ficou para a Ane.

---

## 1. O que já está pronto (pedido 048)

| Item | Onde |
|---|---|
| Pedidos pagos da mesma pessoa e endereço viram um envio só | `api.expedicao_pendentes`, `api.expedicao_montar` |
| Situações `aguardando_frete → frete_cobrado → pronta → enviada → entregue / cancelada` | `venda.mov_expedicao` |
| Frete vira cobrança separada (`venda.mov_cobranca.tipo = 'frete'`) com link de pagamento | `api.expedicao_definir_frete` |
| Pagamento do frete pela Getnet solta o envio sozinho | gatilho `venda.tg_cobranca_frete_paga` |
| **Só expede com o frete pago ou grátis** | `api.expedicao_enviar` exige `estado = 'pronta'` |
| Tela Expedição com as três abas e simulação | `painel/src/pages/Expedicao.tsx` |

A regra "só pode expedir o produto se o frete tiver confirmação de pagamento" **já está implementada e testada**. O resto do pedido não.

---

## 2. Diagnóstico: o que o plano previa e não existe

### 2.1 Cotação de frete — não existe
Hoje a equipe digita o valor à mão no modal "Definir frete" (`ModalFrete`, campos valor / serviço / prazo, texto livre). Não há consulta a transportadora, não há comparação, não há registro de quais opções foram oferecidas.

### 2.2 Rastreio: as tabelas e as variáveis estão órfãs — **bug em produção**
- `venda.mov_envio` e `venda.mov_evento_rastreio` existem desde a era Bling, com `codigo_rastreio`, `url_rastreio`, `etiqueta_url`, `custo_frete`, `bling_objeto_id`. **Estão vazias e ninguém escreve nelas.**
- `api.expedicao_enviar` grava o rastreio só em `venda.mov_expedicao.codigo_rastreio`.
- `atendimento.variaveis_contexto` lê `envio.transportadora`, `envio.codigo_rastreio`, `envio.link_rastreio` e `envio.situacao` **de `venda.mov_envio`**.

Consequência: a resposta pronta `/rastreio` (`"Seu pedido {{pedido.numero}} foi enviado pela {{envio.transportadora}}. Código: {{envio.codigo_rastreio}}"`) nunca preenche. `api.atendimento_enviar` levanta `variáveis sem valor para esta cliente` e a mensagem não sai. Isso vale hoje, independente do resto deste pedido.

### 2.3 Financeiro — a estrutura existe e está desligada
`financeiro.mov_titulo` é um contas a receber/pagar completo (tipo, parceiro, vencimento, saldo, situação, `cobranca_id`, `pedido_id`, `pagamento_id`, rateio por natureza em `rel_titulo_rateio`, baixas em `mov_baixa`). **Tem zero registros.** Nem a cobrança das peças nem a do frete geram título. Não há nada a pagar para a transportadora.

### 2.4 Aviso automático no WhatsApp — não existe fila
`engine.mov_outbox` + `engine.enfileirar(empresa, integracao, tipo, chave_idempotencia, entidade_tipo, entidade_id, payload, prioridade)` já são a fila genérica com idempotência, tentativas, backoff e política de aprovação. Só o atendimento manual usa (`enviar_mensagem_atendimento`). Nada enfileira aviso de envio.

### 2.5 Conferência das peças — não existe
Existem as peças: `catalogo.cad_unidade.codigo` é único por empresa e é exatamente o que a etiqueta imprime em código de barras (`{codigo_unidade}` em `etiquetaLayout.ts`, Code 128 + QR). Existe `api.resolver_codigo_curto(empresa, numero)` para o código curto numérico da live, já liberado para o papel `expedicao`. A expedição não usa nem um nem outro.

### 2.6 As integrações novas não cabem nos CHECKs
```
engine.cfg_integracao.integracao ∈ (meta_dm, meta_live, bling, gateway, whatsapp, nfe, facebook, ia_chat, ia_embedding)
engine.mov_outbox.integracao    ∈ (bling, meta_dm, gateway, whatsapp)
```
Falta `melhor_envio` (e `correios`, se entrar).

---

## 3. Decisão de arquitetura: Melhor Envio primeiro, Correios só com contrato

Pesquisei as duas APIs. O resultado muda o desenho:

**Correios (api.correios.com.br)** — as APIs de Preço e Prazo são **restritas a cliente com contrato comercial na modalidade a faturar**, e ainda exigem que os serviços **38202 (API Preços)** e **38210 (API Prazos)** estejam vinculados ao contrato *e* a cada cartão de postagem, liberados pela gestão comercial. Sem isso a API responde "API restrita". O token sai de `POST /token/v1/autentica/cartaopostagem` (Basic com a conta PJ do Meu Correios + código de acesso gerado no CWS). Os manuais ainda se contradizem entre `/preco/v1` e `/prazo/v3`, e não documentam rastreamento nem pré-postagem — isso só está no Swagger do CWS.

**Melhor Envio** — revende Correios, Jadlog, Loggi e outras **sem contrato próprio com os Correios**, e entrega o ciclo inteiro: cotação, compra, etiqueta em PDF, rastreio e webhook de eventos. Sandbox completo com saldo fictício de R$ 10.000.

**Proposta:** nascer com **Melhor Envio** como cotador e emissor. Deixar o cotador plugável (`venda.cfg_frete_provedor`) para os Correios entrarem depois **só como segunda cotação**, se e quando a Ane tiver contrato + 38202/38210 no cartão. Isso é pergunta para a Ane, não para o código — ver §9.

### Ponto que muda a expectativa do pedido
**O Melhor Envio não gera link de pagamento para a cliente.** O checkout debita o **saldo da carteira do Melhor Envio** da loja. Então são dois dinheiros distintos, e é exatamente a "parte recebida do cliente e a parte a pagar para o fornecedor" do pedido:

| | Quem paga | Como | Valor |
|---|---|---|---|
| **A receber** | a cliente | cobrança Getnet `tipo = 'frete'` com Pix/link — **já existe** | preço cotado (com ou sem margem) |
| **A pagar** | a Ane | débito na carteira do Melhor Envio no checkout | custo da etiqueta |

A diferença entre os dois é resultado de frete e precisa aparecer no DRE.

---

## 4. Fluxo proposto ponta a ponta

```
pagos            A cliente pagou as peças (já existe)
  │
  ├─ montar ───────────────────────────────► aguardando_conferencia
  │
  ├─ CONFERÊNCIA: bipar o código de barras de cada peça,
  │  pesar e medir a caixa ─────────────────► conferida  (peso e dimensões reais)
  │
  ├─ COTAR: Melhor Envio (+ Correios) com o peso real,
  │  escolher a opção, gravar ──────────────► frete_cobrado
  │     └─ gera cobrança Getnet + título A RECEBER
  │
  ├─ cliente paga (webhook Getnet) ─────────► pronta
  │     └─ baixa o título a receber
  │
  ├─ COMPRAR ETIQUETA: cart → checkout → generate → print
  │                        ─────────────────► etiqueta_gerada
  │     └─ gera título A PAGAR (Melhor Envio), já baixado pela carteira
  │     └─ guarda o PDF e o protocolo
  │
  ├─ postar ────────────────────────────────► enviada  (rastreio preenchido)
  │     └─ grava em venda.mov_envio  →  conserta as variáveis {{envio.*}}
  │     └─ ENFILEIRA o aviso de WhatsApp com o link de rastreio
  │
  └─ webhook Melhor Envio (order.posted / delivered / …)
        └─ venda.mov_evento_rastreio ────────► entregue
```

Nada avança sem a etapa anterior. Em especial: **não cota sem conferir** (o peso vem da balança, não do chute) e **não compra etiqueta sem o frete pago** (a regra que já existe passa a valer também para a compra da etiqueta, não só para o despacho).

---

## 5. Banco — migrations 0094a a 0094g

> 0094a, 0094d e 0094e estão **aplicadas**; o SQL de cada uma está em `sql/`. As demais continuam como desenho.

### 0094a — conferência por código de barras
```sql
alter table venda.mov_expedicao
  add column peso_g int check (peso_g > 0),
  add column comprimento_cm int, add column largura_cm int, add column altura_cm int,
  add column conferida_em timestamptz, add column conferida_por uuid;

alter table venda.mov_expedicao drop constraint mov_expedicao_estado_check;
alter table venda.mov_expedicao add constraint mov_expedicao_estado_check
  check (estado in ('aguardando_conferencia','conferida','frete_cobrado','pronta',
                    'etiqueta_gerada','enviada','entregue','cancelada'));
-- aguardando_frete existente → conferida (os envios abertos de hoje não voltam para conferência)

create table venda.rel_expedicao_item_conferido (
  expedicao_id uuid not null references venda.mov_expedicao(id) on delete cascade,
  pedido_item_id uuid not null references venda.mov_pedido_item(id),
  unidade_id uuid not null references catalogo.cad_unidade(id),
  bipado_em timestamptz not null default now(),
  bipado_por uuid default auth.uid(),
  primary key (expedicao_id, pedido_item_id)
);
```

APIs novas:

| Função | O que faz |
|---|---|
| `api.expedicao_por_codigo(empresa, codigo text)` | **Localiza o envio bipando qualquer peça dele.** Aceita `cad_unidade.codigo` (o código de barras da etiqueta) ou o código curto numérico da live. Devolve o envio aberto que contém aquela unidade, ou um erro claro: peça não encontrada / peça não está em nenhum envio / peça já enviada |
| `api.expedicao_conferir_peca(empresa, expedicao, codigo)` | Marca a peça como conferida. Recusa peça que não pertence ao envio (`peça de outro envio: #38 da Mariana`), peça já bipada e envio fora de `aguardando_conferencia` |
| `api.expedicao_conferencia(empresa, expedicao)` | Lista as peças do envio com conferida sim/não, para a tela |
| `api.expedicao_fechar_conferencia(empresa, expedicao, peso_g, c, l, a)` | Exige **todas** as peças bipadas; grava peso e dimensões; passa para `conferida` |
| `api.expedicao_reabrir_conferencia(empresa, expedicao, motivo)` | Volta para `aguardando_conferencia` e limpa as bipagens (só antes de cobrar o frete) |

Peso e dimensões ganham padrão por configuração (`venda.cfg_expedicao`: peso médio por peça, caixa padrão) para a equipe só confirmar quando não quiser pesar.

### 0094b — provedores de frete e cotações
```sql
create table venda.cfg_frete_provedor (
  empresa_id uuid not null references crm.cad_empresa(id),
  provedor text not null check (provedor in ('melhor_envio','correios')),
  ativo boolean not null default false,
  cotar boolean not null default true,      -- entra na comparação
  emitir boolean not null default false,    -- pode comprar etiqueta (só melhor_envio por ora)
  ordem int not null default 1,
  primary key (empresa_id, provedor)
);

create table venda.mov_cotacao_frete (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null, expedicao_id uuid not null references venda.mov_expedicao(id) on delete cascade,
  provedor text not null, servico_id text, servico text, transportadora text,
  preco numeric(12,2), preco_custom numeric(12,2),   -- custom_price do Melhor Envio
  prazo_dias int, prazo_min int, prazo_max int,
  erro text, bruto jsonb, cotado_em timestamptz not null default now()
);

alter table venda.mov_expedicao
  add column cotacao_escolhida_id uuid references venda.mov_cotacao_frete(id),
  add column provedor text, add column custo_frete numeric(12,2);
```
`valor_frete` continua sendo o que a cliente paga; `custo_frete` é o que a Ane paga. A diferença é a margem.

| Função | O que faz |
|---|---|
| `api.expedicao_cotar(empresa, expedicao)` | Exige `conferida`. Enfileira `cotar_frete` na outbox para cada provedor ativo com `cotar = true` |
| `api.expedicao_cotacoes(empresa, expedicao)` | Devolve as cotações da última rodada, ordenadas por preço, com erro por provedor quando houver |
| `api.expedicao_definir_frete(…, p_cotacao uuid)` | **Assinatura estendida.** Com `p_cotacao`, copia serviço, prazo, transportadora, provedor e `custo_frete` da cotação e usa `p_valor` como o que será cobrado (padrão: o preço cotado). Sem `p_cotacao`, continua aceitando valor digitado — motoboy, retirada, combinação fora de tabela |

### 0094c — compra e emissão da etiqueta
```sql
create table venda.mov_etiqueta_envio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null, expedicao_id uuid not null references venda.mov_expedicao(id),
  provedor text not null,
  pedido_externo_id text,        -- id do carrinho no Melhor Envio
  protocolo text,                -- ORD-…
  compra_protocolo text,         -- PUR-…
  estado text not null default 'no_carrinho'
    check (estado in ('no_carrinho','paga','gerada','impressa','postada','cancelada','erro')),
  custo numeric(12,2), etiqueta_url text, codigo_rastreio text, url_rastreio text,
  bruto jsonb, erro text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
```

| Função | O que faz |
|---|---|
| `api.expedicao_comprar_etiqueta(empresa, expedicao)` | **Exige `pronta`** (frete pago ou grátis). Valida endereço e documento da cliente. Enfileira `comprar_etiqueta` |
| `api.expedicao_etiqueta(empresa, expedicao)` | Situação da etiqueta e URL do PDF para a tela |
| `api.expedicao_cancelar_etiqueta(empresa, expedicao, motivo)` | Enfileira o cancelamento (`reason_id = 2`); o estorno do Melhor Envio leva até 12 h |

`api.expedicao_enviar` passa a aceitar o rastreio vindo da etiqueta (sem digitação) e **continua** exigindo `pronta` ou `etiqueta_gerada`.

### 0094d — rastreio unificado: consertar as variáveis `{{envio.*}}`
`api.expedicao_enviar` passa a gravar **também** em `venda.mov_envio`, uma linha por pedido do envio: `transportadora`, `servico`, `codigo_rastreio`, `url_rastreio`, `etiqueta_url`, `custo_frete`, `postado_em`, `estado = 'postado'`. O webhook do Melhor Envio alimenta `venda.mov_evento_rastreio` e empurra `mov_envio.estado` (`em_transito`, `saiu_para_entrega`, `entregue`, `nao_entregue`, `devolvido`), e `mov_expedicao` vira `entregue` junto.

Com isso `{{envio.transportadora}}`, `{{envio.codigo_rastreio}}`, `{{envio.link_rastreio}}` e `{{envio.situacao}}` passam a preencher sozinhos, sem tocar em `atendimento.variaveis_contexto`. **A resposta pronta `/rastreio` volta a funcionar.**

### 0094e — financeiro dos dois lados
Fonte única: todo dinheiro do frete nasce em `financeiro.mov_titulo`, com rateio em `rel_titulo_rateio` pela natureza configurada.

```sql
create table venda.cfg_expedicao (
  empresa_id uuid primary key references crm.cad_empresa(id),
  natureza_receita_frete_id uuid references financeiro.cad_natureza(id),
  natureza_custo_frete_id   uuid references financeiro.cad_natureza(id),
  cr_id uuid references financeiro.cad_centro_resultado(id),
  parceiro_transportadora_id uuid references crm.cad_parceiro(id),  -- "Melhor Envio"
  conta_carteira_id uuid references financeiro.cad_conta_bancaria(id), -- carteira Melhor Envio
  peso_padrao_peca_g int default 350,
  caixa_padrao_cm int[] default '{30,20,10}',
  margem_frete_pct numeric(5,2) default 0,
  avisar_rastreio_whatsapp boolean not null default true,
  modelo_whatsapp_rastreio text
);
```

| Evento | Título |
|---|---|
| `expedicao_definir_frete` com valor | **a receber**, parceiro = a cliente pagadora, `cobranca_id` = a cobrança do frete, natureza receita de frete, vencimento = `expira_em` da cobrança |
| cobrança do frete paga (gatilho que já existe) | **baixa** do título a receber, com o `pagamento_id` |
| checkout da etiqueta confirmado | **a pagar**, parceiro = Melhor Envio, valor = custo da etiqueta, já **baixado** contra a conta "carteira Melhor Envio" |
| etiqueta cancelada e estornada | título a pagar cancelado ou estorno lançado |
| frete grátis | nenhum título a receber; o título a pagar continua existindo (é custo real) |

Vínculo e status: `mov_expedicao` ganha `titulo_receber_id` e `titulo_pagar_id`, e `api.expedicoes` devolve os dois com a situação de cada um, para a tela mostrar "frete recebido" / "etiqueta paga" sem ninguém ir ao financeiro conferir. A tela de Expedição ganha a coluna **Resultado do frete** = recebido − pago.

> Decisão pendente: hoje **nenhuma** cobrança gera título (`mov_titulo` está vazia). Este pedido liga o financeiro **só para o frete**. Ligar também a venda das peças é outro pedido — senão o DRE fica com a receita de frete e sem a receita de mercadoria.

### 0094f — fila de aviso no WhatsApp
```sql
alter table engine.cfg_integracao drop constraint cfg_integracao_integracao_check;
alter table engine.cfg_integracao add constraint cfg_integracao_integracao_check
  check (integracao in (…, 'melhor_envio','correios'));
alter table engine.mov_outbox   drop constraint mov_outbox_integracao_check;
alter table engine.mov_outbox   add constraint mov_outbox_integracao_check
  check (integracao in ('bling','meta_dm','gateway','whatsapp','melhor_envio','correios'));
```
No `expedicao_enviar`, se `cfg_expedicao.avisar_rastreio_whatsapp`:
```
engine.enfileirar(empresa, 'whatsapp', 'avisar_rastreio',
                  'rastreio:' || expedicao_id,        -- idempotência: um aviso por envio
                  'expedicao', expedicao_id::text,
                  jsonb_build_object('destinatario', …, 'modelo', …,
                                     'parametros', jsonb_build_array(nome, pedido, transportadora, rastreio, url)), 1)
```
A mensagem entra também em `atendimento.mov_mensagem` como saída na conversa da cliente, com `outbox_id`, para aparecer na Caixa de entrada e não parecer que o sistema falou pelas costas da equipe. Painel: aba **"Avisos de rastreio"** na Expedição, com pendente / enviado / falhou e botão de reenviar.

> **Dependência externa, e é bloqueante.** Aviso de rastreio quase sempre sai **fora da janela de 24 h** do WhatsApp — `api.atendimento_enviar` hoje recusa com "janela de resposta fechada". Fora da janela só sai **modelo (template) de utilidade aprovado pela Meta**. Então a Ane precisa cadastrar e ter aprovado um modelo tipo `pedido_enviado` com as variáveis acima, e o worker precisa chamar a API de templates, não a de mensagem livre. Sem o modelo aprovado, o aviso fica em `aguardando_aprovacao` na outbox e a equipe manda à mão pela Caixa de entrada. Vale confirmar na conta da Ane se o template de utilidade entra na franquia mostrada no painel ("612 de 1000 no mês") ou se é cobrado à parte.

### 0094g — permissões, telas e testes
- `cad_tela`: a Expedição já existe (`envios`). A conferência entra como aba da mesma tela, sem tela nova.
- Papel `expedicao`: conferir, cotar, comprar etiqueta, postar. **Não** pode marcar frete pago (continua `financeiro`).
- Admin/gestor: configurar provedores, naturezas e margem.
- `sql/testes/94_testes_expedicao_frete_conferencia.sql` cobrindo: bipar peça de outro envio, fechar conferência incompleta, cotar sem conferir, comprar etiqueta sem frete pago, cobrança paga → título baixado, aviso enfileirado uma vez só, webhook repetido (idempotência), e as regressões de 92.

---

## 6. Edge Functions

| Função | Papel |
|---|---|
| `melhor-envio-worker` | Lê a outbox (`integracao = 'melhor_envio'`), executa `cotar_frete`, `comprar_etiqueta`, `cancelar_etiqueta`, `consultar_rastreio`; devolve o resultado às tabelas. Token OAuth guardado no Vault, renovado pelo refresh |
| `melhor-envio-oauth` | Callback do `authorization_code` (o Melhor Envio **não tem client_credentials**: a Ane precisa autorizar o app pelo navegador uma vez) |
| `melhor-envio-notificacao` | Webhook. `verify_jwt = false`; valida o header `x-me-signature` (HMAC-SHA256 do corpo com o secret do app, comparação em tempo constante). Eventos `order.*` → `mov_evento_rastreio` e `mov_envio.estado` |
| `whatsapp-worker` | Consome `avisar_rastreio` da outbox via API de templates |
| `correios-worker` *(fase 2, só com contrato)* | Token por cartão de postagem + Preço + Prazo, só para cotação comparativa |

### O que a API do Melhor Envio exige (verificado na documentação oficial)
- **Base:** sandbox `https://sandbox.melhorenvio.com.br/`, produção `https://melhorenvio.com.br/`. São contas separadas, nada migra entre elas. O sandbox dá R$ 10.000 fictícios e simula só Correios e Jadlog.
- **Headers em toda chamada:** `Accept: application/json`, `Content-Type: application/json`, `Authorization: Bearer <token>` e **`User-Agent: <nome da aplicação> (<e-mail de contato>)` — obrigatório**, chamada sem ele é recusada.
- **OAuth:** `GET /oauth/authorize?client_id=…&redirect_uri=…&response_type=code&state=…&scope=<separados por espaço>`, no navegador. A `redirect_uri` tem que ser idêntica à cadastrada, senão volta `Client invalid`. Access token vale **30 dias**, refresh token **45 dias**; a renovação é disparada quando a API devolve `Unauthenticated`.
- **Escopos necessários:** `shipping-calculate`, `cart-write`, `cart-read`, `shipping-checkout`, `shipping-generate`, `shipping-print`, `shipping-tracking`, `shipping-cancel`, `orders-read`, `transactions-read`.
- **Cotação** `POST /api/v2/me/shipment/calculate`: `from.postal_code`, `to.postal_code` e `products[]` com `id`, `width`, `height`, `length` (cm, inteiros), `weight` (kg), `insurance_value`, `quantity`; opcionais `options.receipt`, `options.own_hand`, `services`. A resposta traz, por opção: `id`, `name`, `price`, **`custom_price`**, `discount`, `delivery_time`, **`custom_delivery_time`**, `delivery_range`, `company`, `packages`. **Usar `custom_price` e `custom_delivery_time`** — são os que já refletem o desconto e o acordo da conta. Azul Cargo cota mas não compra por API.
- **Carrinho** `POST /api/v2/me/cart`: `service`, `from`, `to`, `products` (`name`, `quantity`, `unitary_value`), `volumes` (`height`, `width`, `length`, `weight`) e `options` (`insurance_value`, `receipt`, `own_hand`, `reverse`, `non_commercial`). Destinatário PF manda `document` (CPF). Sem nota fiscal: sem `options.invoice` e `from.state_register` vazio ou `"ISENTO"`. **Correios e Loggi não aceitam múltiplos volumes** — com n caixas, n chamadas de um volume cada. Volta `id` (UUID, é a chave para todo o resto) e `protocol` (`ORD-…`). A etiqueta fica no carrinho por 7 dias.
- **Compra** `POST /api/v2/me/shipment/checkout` com `{"orders": ["<id>"]}`. **Debita o saldo da carteira** — consultar `GET /api/v2/me/balance` (`{balance, reserved, debts}`) antes e avisar na tela quando estiver baixo; saldo insuficiente não tem erro documentado. Volta `PUR-…` e `status: "paid"`.
- **Etiqueta** `POST /api/v2/me/shipment/generate` → `POST /api/v2/me/shipment/print` (`{"mode":"public","orders":[…]}`) → `{"url": "https://…/imprimir/<código>"}`. Vale **20 dias** depois de gerada.
- **Rastreio** `POST /api/v2/me/shipment/tracking` com os ids; volta `status`, `tracking`, `melhorenvio_tracking` e as datas. O código de rastreio pode demorar **até 1 dia útil** depois da postagem — a tela e o aviso de WhatsApp precisam aguentar isso.
- **Webhook:** cadastrado no painel do Melhor Envio, por aplicativo. Eventos `order.created|pending|released|generated|received|posted|delivered|cancelled|undelivered|paused|suspended`. Assinatura em `x-me-signature`. Se não responder em 6 s, repete a cada 15 min, 5 vezes. No sandbox o status anda sozinho a cada 15 min.
- **Cancelamento** `POST /api/v2/me/shipment/cancel` com `{"order":{"id":…,"reason_id":"2","description":…}}`. Não cancela depois de postado; estorno em até 12 h.
- **A partir de 06/04/2026** o carrinho exige `products` completo para a DCe — está dentro do horizonte deste pedido, então já nasce preenchido.

### Correios, se entrar na fase 2
Token: `POST /token/v1/autentica/cartaopostagem`, Basic com a conta PJ do Meu Correios e o código de acesso do CWS, body `{"numero": "<cartão>"}`. Preço: `GET /preco/v1/nacional/{coProduto}?cepOrigem&cepDestino&psObjeto(g)&tpObjeto&comprimento&largura&altura[&nuContrato&nuDR&vlDeclarado]`, lote de até 100 em `POST /preco/v1/nacional`. Prazo: `GET /prazo/v1/nacional/{coProduto}?cepOrigem&cepDestino` → `{prazoEntrega, dataMaxima, entregaDomiciliar, entregaSabado, entregaDomingo}`, lote de até 20. Produtos: `03220` Sedex, `03298` PAC. Limite de 150 req/s por usuário e IP. Rastreamento e pré-postagem **não estão nos manuais públicos** — só no Swagger do CWS, a conferir com credencial em mãos. Os manuais se contradizem entre `/preco/v1` e `/prazo/v3`: confirmar no CWS antes de codificar.

---

## 7. Painel

**Expedição** ganha as abas e os passos:

1. **A montar** — como hoje.
2. **Conferência** (nova)
   - Campo de bipagem sempre em foco. A equipe bipa **qualquer peça** e o envio dela abre — é assim que se localiza o pedido sem procurar nome em lista.
   - Lista das peças do envio, cada uma riscando ao ser bipada, com contador `3 / 5`.
   - Erro grande e colorido para peça de outro envio, peça repetida ou peça desconhecida; som curto de erro.
   - Peso e dimensões, já preenchidos com o padrão da configuração, confirmados num campo só.
   - "Conferência concluída" só habilita com tudo bipado.
3. **Frete** (dentro de "Em andamento")
   - Botão "Cotar frete" → tabela comparativa: transportadora, serviço, prazo, **custo** (o que a Ane paga) e **a cobrar** (custo + margem, editável). Mais barato e mais rápido marcados.
   - "Cobrar frete" grava a escolha e dispara a cobrança Getnet que já existe.
   - Valor manual continua disponível para motoboy e retirada.
4. **Em andamento** — ganha, por envio: situação do título a receber, situação da etiqueta, botão **"Comprar etiqueta"** (só com o frete pago), **"Imprimir etiqueta"** (abre o PDF), saldo da carteira do Melhor Envio no topo quando estiver abaixo do mínimo.
5. **Enviadas** — rastreio clicável, últimos eventos do webhook, situação do aviso de WhatsApp com botão de reenviar.
6. **Avisos de rastreio** (nova aba) — fila, com pendente / enviado / falhou e o motivo.

**Integrações** ganha a aba **Fretes**: Melhor Envio (ambiente, Client ID, Secret, botão "Autorizar no Melhor Envio", segredo do webhook, saldo atual), Correios (desligado, com o aviso de que exige contrato + 38202/38210), naturezas financeiras de receita e custo de frete, parceiro transportadora, conta da carteira, margem, peso e caixa padrão, e o modelo de WhatsApp do rastreio.

Simulação: o roteiro de treino passa a cobrir bipagem (inclusive bipar peça errada), cotação com três opções fictícias, compra de etiqueta e aviso de rastreio — tudo em memória, como já é hoje.

Ajuda e manual: verbetes de Conferência, Cotação de frete, Etiqueta e Avisos de rastreio; manual v0.13.0.

---

## 8. Ordem de implementação

| Fase | Entrega | Depende de |
|---|---|---|
| **1 ✅** | 0094a conferência + tela de bipagem | — (entregue) |
| **2 ✅** | 0094d rastreio unificado (`mov_envio`) | — (entregue; o `/rastreio` voltou a funcionar) |
| **3 ✅** | 0094e financeiro do frete | — (entregue; naturezas semeadas do plano de contas) |
| **4** | 0094b + 0094c + worker + OAuth Melhor Envio | conta e app no Melhor Envio (sandbox primeiro) |
| **5** | webhook de rastreio | app publicado com URL pública |
| **6** | 0094f aviso de WhatsApp | **template aprovado pela Meta** |
| **7** | Correios como segunda cotação | contrato + 38202/38210 no cartão |

As fases 1, 2 e 3 estão entregues. A 4 começa assim que a conta e o aplicativo do Melhor Envio existirem (item 1 da seção 9).

---

## 9. O que preciso que a Ane decida ou providencie

1. **Conta no Melhor Envio** (sandbox para o desenvolvimento, produção depois) e um aplicativo criado em Integrações → Área Dev, com a `redirect_uri` do callback. Precisa do Client ID e do Secret.
2. **Correios: tem contrato comercial a faturar?** Se não tiver, a fase 7 não existe e o Melhor Envio cobre Correios do mesmo jeito. Se tiver, precisa pedir à gestão comercial a liberação dos serviços **38202** e **38210** no contrato e nos cartões de postagem.
3. **Margem no frete:** repassar o custo exato para a cliente ou embutir percentual? (campo `margem_frete_pct`, padrão 0).
4. **Template de WhatsApp** de aviso de envio, cadastrado e aprovado na Meta.
5. **Naturezas financeiras** de receita de frete e custo de frete, o parceiro "Melhor Envio" e a conta "carteira Melhor Envio" — ou autorização para eu criar os quatro com nomes padrão.
6. **Documento da cliente (CPF):** o Melhor Envio exige CPF do destinatário no carrinho. Hoje o CPF é opcional no parceiro. Fazer o carrinho recusar sem CPF, ou pedir o CPF no link de pagamento do frete?
7. Confirmar que **"a parte a pagar para o fornecedor"** é a transportadora / Melhor Envio, e não o consignante da peça. Se for comissão de consignante, é outro pedido.

---

Base: grafo de 2026-11-24, commit 2d311af, **atrasado** (o commit 2d311af dos pedidos 044–048 não entrou no grafo). As conclusões deste documento vêm da leitura direta do código-fonte e do banco (migrations 0092a–0093 e catálogo do Postgres), não do grafo.
