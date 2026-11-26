# Pedido de mudança 047: pagamento confirmado, nomes saneados, parceiro como referência e link de pagamento fácil

Executado em 26/11/2026 (00h05 a 00h50). Aprovação: Dione (respostas aos itens 1 a 4 das pendências do pedido 046). Migrations `0091a` a `0091j`. Sem escrita no Bling.

## 1. Pagamento confirmado (rotina já criada)
- O motor `venda.registrar_pagamento` (cobrança → reservas pagas → pedido → fila avisada → pedido para o Bling) já existia, mas ninguém o chamava.
- **Gatilho** `live.tg_reserva_paga_pagador`: toda reserva que vira paga chama `crm.confirmar_pagador_reserva` (junta o pré-cadastro da filha ao dono do CPF).
- **Pagador propagado:** `venda.mov_cobranca.parceiro_pagador_id` (gatilho em `rel_cobranca_reserva`) e `venda.mov_pedido.parceiro_pagador_id` (gatilho antes de inserir). O pedido e a NF-e saem no nome de quem pagou.
- **`api.marcar_pago(empresa, reserva, forma, motivo, frete)`**: para Pix conferido no extrato ou pagamento na loja. Cria a cobrança se faltar, registra o pagamento pelo mesmo motor do gateway e grava em `live.log_acao_suporte` (nova ação `marcar_pago`). Papéis: admin, gestor, suporte, financeiro.
- Painel: botão **Marcar pago** na reserva da Central de vendas (forma, frete, como foi conferido).
- O webhook do gateway (Getnet ou outro) só precisa chamar `venda.registrar_pagamento`: o resto já acontece sozinho.

## 2. Saneamento dos nomes (5.915 parceiros)
- `crm.nome_civil_limpo`: tira @, barras e "INATIVO"; nome todo em MAIÚSCULAS ou minúsculas vira Nome Próprio com "da/de/do/dos/e" em minúsculas; caixa mista é mantida. Pessoa jurídica: só tira @ e "INATIVO".
- 5.915 nomes alterados, cada um com o nome anterior em `crm.log_parceiro_nome` (reversível). 20 nomes que eram só um @ ficaram como estavam.
- A reconciliação noturna do Bling passa a criar parceiros novos já com o nome limpo.

## 3. Parceiro como referência
- **Bloqueio, limite de reservas e "já participa"** passam a valer pelo parceiro (todos os @ e WhatsApp da mesma pessoa): `crm.perfis_mesmo_parceiro`, `crm.parceiro_bloqueado`, ajustes em `live.decidir_item` e `api.publico_quero`.
- **Endereços no parceiro** (`crm.cad_parceiro_endereco`, vários por parceiro, com principal, situação do CEP, IBGE e último uso). Ao juntar um pré-cadastro, os endereços vão junto.
- **CPF completo cifrado no parceiro** (`crm.cad_parceiro_documento`, mesma chave `venda._chave_documento`), necessário para a NF-e. A página nunca devolve o número.
- **Endereço fiscal** (`cad_parceiro_dados`) é preenchido com o primeiro endereço do titular quando estiver vazio. O Resumo considera o endereço principal com IBGE para "Pronto para NF-e".
- Central de vendas: "dados confirmados" passa a ser da reserva (`pagador_definido_em`), não de um endereço antigo.
- Tela Parceiros: lista de **Endereços** no Resumo (`api.parceiro_enderecos`; número e CEP completos só para admin, gestor, suporte e expedição).

## 4. Link de pagamento fácil e padronizado
**Servidor**
- `api.publico_cep(token, cep)`: responde pela base oficial guardada (`crm.cfg_cep_cache`). Se ainda não tem, agenda a consulta.
- **Consulta oficial em segundo plano:** `crm.fila_cep` + `crm.processar_fila_cep` (job `cep-consulta-oficial`, a cada minuto, até 20 CEPs, ViaCEP pelo `pg_net`). Quando o CEP chega, os endereços salvos com aquele CEP são padronizados (rua, bairro, cidade, UF e IBGE dos Correios).
- `api.publico_entrega_obter`: devolve até 5 endereços já usados (rua e cidade visíveis, número e CEP parcialmente ocultos), o final do CPF, a forma de pagamento usada antes e o link do gateway quando houver.
- `api.publico_entrega_salvar` (novos parâmetros): endereço escolhido do histórico (um toque), nome de quem paga (pedido só quando o CPF é de outra pessoa sem cadastro), e-mail (vai para Contatos), forma (Pix ou cartão, guardada na reserva e na cobrança). O nome civil informado pelo titular substitui o atual (com log).

**Página (celular)**
- Endereços usados antes em cartões: um toque em "Entregar aqui". Sem CPF de novo se já temos.
- CEP primeiro: preenche rua, bairro, cidade e UF (base oficial; se ainda não houver, ViaCEP e BrasilAPI direto do celular) e pula para o número. Link "Não sei meu CEP" (busca dos Correios).
- Campos com `autocomplete` padrão (CEP, rua, complemento, bairro, cidade, UF, e-mail, nome): o preenchimento automático do celular (Chrome/Safari/Google/iCloud) funciona.
- "Vai pagar com o CPF de outra pessoa?" abre o campo do nome de quem paga. Mensagem "CPF reconhecido" sem mostrar dado de ninguém.
- Escolha **Pix** (aprovação na hora) ou **Cartão**. O cartão é digitado na página segura do gateway, onde aparecem Apple Pay/Google Pay e o cartão salvo no celular quando o gateway oferece. **A loja não recebe nem guarda número de cartão** (PCI).
- Botão final: "Pagar com Pix/cartão" quando a cobrança tiver link do gateway; enquanto não houver gateway, "Receber o link de pagamento no WhatsApp" já com a forma escolhida.
- CSP (`public/_headers`): liberado `https://brasilapi.com.br`.

## Testes
- `testes/91_testes_pagamento_endereco_link.sql` (56 asserções): nomes, CEP oficial e fila, titular com CPF/nome/e-mail/endereço padronizado/IBGE/fiscal/CPF cifrado/forma, histórico mascarado e um toque, endereço de outro parceiro recusado, filha com CPF da mãe + Marcar pago (pedido e cobrança no nome da mãe, @ e endereços vão para a mãe), pedido de nome para CPF de terceiro sem cadastro, bloqueio pelo parceiro, permissões. `TESTES_OK`.
- `testes/90_…` e `testes/85_…` atualizados (CPF agora no parceiro; final do CPF com 4 dígitos; CPF novo de terceiro pede o nome). Ambos `TESTES_OK`.
- Advisors: só INFO de RLS sem política nas tabelas novas (padrão do projeto).
- Front: `tsc --noEmit` ok, `verificar-ajuda` ok (manual v0.11.1), Parceiros conferido no `npm run dev`. **A página do link não foi conferida no navegador** (exige uma reserva ativa real). `vite build` e publicação não feitos.

## Pendências
1. Contratar/validar o gateway (Getnet tem Pix, link e webhook?) e criar a Edge Function do webhook chamando `venda.registrar_pagamento`; gravar `link_url` na cobrança.
2. Frete: hoje entra no "Marcar pago" ou na cobrança; cálculo automático pelo CEP (Melhor Envio) é etapa própria.
3. LGPD: incluir `crm.cad_parceiro_documento` e `crm.cad_parceiro_endereco` na rotina `crm.anonimizar_cliente` e definir `purgar_apos`.
4. `crm.cad_cliente_endereco`/`cad_cliente_documento` deixaram de ser gravados pela página pública; `api.cliente_endereco_salvar` (painel) ainda grava no perfil. Migrar para o parceiro e aposentar as tabelas.
5. Cobrança única por parceiro (juntar reservas de dois @ da mesma pessoa num frete só).

## Reversão
Front: `*.bak-047` (`vitrine/Vitrine.tsx`, `vitrine/apiPublica.ts`, `vitrine/vitrine.css`, `apiVendas.ts`, `pages/Vendas.tsx`, `ajuda/conteudo.ts`, `public/_headers`); em `api.ts`, `Parceiros.tsx` e `styles.css` as adições do 047 estão marcadas (endereços).
Banco: `select cron.unschedule('cep-consulta-oficial');` nomes: `update crm.cad_parceiro p set nome = l.nome_antes from crm.log_parceiro_nome l where l.parceiro_id = p.id and l.motivo = 'saneamento em lote 0091d';` gatilhos: `drop trigger tg_reserva_paga_pagador on live.mov_reserva; drop trigger tg_cobranca_reserva_pagador on venda.rel_cobranca_reserva; drop trigger tg_pedido_pagador on venda.mov_pedido;` funções `decidir_item`, `publico_quero`, `listar_ofertas`, `reconciliar_parceiros`, `publico_entrega_*`, `parceiro_resumo`, `absorver_pre_cadastro`: recriar da versão anterior (0034/0085/0090). Tabelas novas: `crm.cad_parceiro_endereco`, `crm.cad_parceiro_documento`, `crm.fila_cep`, `crm.log_parceiro_nome`; colunas `forma_pagamento` e `endereco_entrega_id`.

## Linha para `changelog-banco.md`
| 26/11/2026 | 047 | `0091a`…`0091j` | pagamento confirmado + Marcar pago, nomes saneados (5.915), bloqueio/limite por parceiro, endereço e CPF cifrado no parceiro, CEP oficial em segundo plano, link de pagamento v2 | ver acima | Dione |
