# Pedido de mudança 013: fotos da peça, campanhas e histórico de compras por link

Criado em 21/11/2026. **Proposta: nada foi aplicado no banco.** SQL em `sql/0022_fotos_campanhas.sql`. Acompanha a tela de Peças v0.5 (já no código do painel, que mostra aviso até a migration existir).

## O que muda
1. **Fotos:** depósito `pecas-fotos` no Storage (público para leitura, 5 MB, só JPEG; o painel reduz a imagem para 1600 px antes de enviar). Gravar e apagar só admin e gestor, e só no caminho da própria empresa (`<empresa>/<peça>/<arquivo>.jpg`). Função `api.definir_fotos_peca` grava a lista em `catalogo.cad_peca.fotos` (máx. 12, valida que cada arquivo é da própria peça).
2. **Campanhas de postagem:** tabelas `venda.cad_campanha` (título, endereço da postagem, data) e `venda.cad_link_venda` (uma variação da peça, código curto, URL, preço, estado). Coluna nova `venda.mov_pedido_item.link_venda_id` para ligar a compra ao link.
3. **Histórico por peça:** `api.historico_campanhas_peca(empresa, peça)` junta **lives** (por `live.mov_item`; compras pela reserva) e **links de postagem**. Cada compra traz cliente (nome e @), data e hora, tamanho e unidade, valor, nº do pedido, situação, nota fiscal e link de pagamento. Totais não contam pedido cancelado. Visível para admin, gestor, suporte e financeiro; telefone e e-mail não saem da função.

## Sem mudança de banco (já na tela)
- **QR e código de barras por unidade:** gerados no navegador a partir de `cad_unidade.codigo` (único por empresa, ex.: `VES-001-P-001`). QR em nível M; código de barras Code 128 (conferido contra a biblioteca python-barcode). Etiqueta 60 × 40 mm.
- **Nova peça com grade:** cria peça, tamanhos e unidades de uma vez, com a lista fechada de tamanhos (PP a GG, 34 a 48, Único). Tamanho único é gravado como `UNICO` (sem acento, porque entra no código da unidade e o código de barras só aceita ASCII).

## Decisões em aberto
- **Domínio da página pública da peça.** Com `VITE_URL_PUBLICA_PECA` definida, o QR abre `<base>/<código da unidade>`; sem ela, o QR leva só o código (serve para bipar no painel e no app).
- **Quem cria campanha e link de postagem:** esta migration só prepara a estrutura e a leitura. Criar link (tela e função de escrita) e registrar a compra com `link_venda_id` ficam para a fase de pagamento e pedido.
- **Fotos no Bling:** a peça guarda as URLs; enviar ao Bling continua só pela porta de escrita (D12).

## Riscos
- Policies em `storage.objects` dependem de o papel que aplica a migration poder criá-las (normal no Supabase). Se falhar, criar as duas policies pelo painel do Supabase.
- Sem testes automatizados desta migration ainda (não há Postgres local nesta máquina). Antes de aplicar em produção: rodar no harness local ou numa branch do Supabase.

## Reversão
`drop function api.definir_fotos_peca(uuid,uuid,jsonb), api.historico_campanhas_peca(uuid,uuid); alter table venda.mov_pedido_item drop column link_venda_id; drop table venda.cad_link_venda, venda.cad_campanha;` mais remover o depósito e as duas policies. Nenhum dado existente é alterado.
