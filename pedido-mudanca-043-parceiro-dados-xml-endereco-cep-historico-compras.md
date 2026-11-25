# Pedido de mudança 043 · Parceiro com dados do XML, endereço pelo CEP dos Correios e histórico de notas de compra

Data: 25/11/2026 · Pedido de: Dione · Status: banco aplicado (0084, 0084b); painel e Edge Function prontos, **aguardando publicação**.

## Problemas relatados
1. O fornecedor criado pela importação do XML não trazia os dados cadastrais da nota (endereço, inscrição, CNPJ, telefone etc.). Causa: `api.compra_criar_fornecedor` recebia só CNPJ e nome, `crm.cad_parceiro` não tinha esses campos, e o CNPJ ficava só como hash + 4 últimos dígitos.
2. A aba “Histórico de notas” do parceiro só consultava `bling.cad_nfe` (notas dos contatos do Bling), por isso o fornecedor vindo do XML aparecia sem notas. As notas de compra (`compra.mov_entrada.fornecedor_parceiro_id`) não entravam.
3. Endereços: padronizar pela descrição oficial dos Correios (pelo CEP), mantendo o dado do XML quando a consulta não for confiável. Mesma regra para clientes (impacta os dados do cliente na venda com o link).

## Decisões
- Guardar o **CNPJ completo e os demais dados cadastrais** agora (decisão do Dione em 25/11); a proteção por permissão de usuário (mascarar/limitar) fica para uma etapa seguinte. Hoje `api.obter_parceiro_dados` exige admin, gestor, suporte, financeiro ou rentabilidade. O hash em `cad_parceiro_identificador` continua sendo a chave de busca.
- Regra de confiança do CEP (`crm._endereco_padrao`, única para fornecedor e cliente):
  - CEP com 8 dígitos, encontrado na base dos Correios, e UF + município do CEP batem com os do XML/cadastro (sem acento, sem pontuação, sem diferença de caixa) → **padronizado**: logradouro (com tipo), bairro, município e UF dos Correios; número e complemento são sempre os informados.
  - CEP geral de município (sem logradouro) → **parcial**: município/UF dos Correios; logradouro e bairro como vieram.
  - CEP não encontrado, cidade/UF divergentes, CEP inválido ou ainda não consultado → **preserva o dado original** e grava o motivo (`nao_encontrado`, `divergente`, `cep_invalido`, `sem_consulta`).
- Endereço digitado à mão (origem `manual`) nunca é sobrescrito por XML. O endereço original do XML fica em `endereco_xml` para reaplicar a regra (`api.parceiro_endereco_reaplicar`).
- Consulta do CEP em Edge Function (`consulta-cep`): cache no banco (`crm.cfg_cep_cache`, 180 dias para achado, 7 dias para não achado), fonte ViaCEP e BrasilAPI como segunda fonte. Roda no servidor porque a CSP do painel só permite chamadas ao Supabase. Falha de rede nunca bloqueia o cadastro.

## O que mudou
- Banco (0084/0084b, só objetos novos): `crm.cad_parceiro_dados`, `crm.cfg_cep_cache`, colunas novas em `crm.cad_cliente_endereco`; funções `crm._endereco_padrao`, `api.cep_obter`, `api.cep_gravar`, `api.parceiro_salvar_dados`, `api.parceiro_endereco_reaplicar`, `api.obter_parceiro_dados`, `api.cliente_endereco_salvar`, `api.historico_notas_parceiro`, `api.resumo_compras_parceiro`. Reversão no cabeçalho da 0084.
- Painel: `xmlNfe.ts` lê o emitente; `EntradaCompra.tsx` grava os dados do fornecedor ao importar (novo ou já cadastrado); `Parceiros.tsx` ganha a aba **Cadastro** (com “Atualizar a partir de um XML” e “Reconsultar CEP”) e o histórico passa a unir compras + Bling (coluna Origem); `api.ts` ganha `apiCep` e `apiEnderecoCliente`.
- Edge Function nova: `supabase/functions/consulta-cep` (JWT obrigatório, em `config.toml`).

## Clientes
`crm.cad_cliente_endereco` está vazia e ainda não há tela de endereço do cliente. A regra já está pronta em `api.cliente_endereco_salvar` e `apiEnderecoCliente.salvar` (consulta o CEP, padroniza ou preserva, marca o principal). A vitrine/venda com link deve gravar o endereço por essa função e ler o endereço principal dali.

## Publicação (no Mac)
1. Edge Function: `cd "$HOME/Documents/Projeto Ane Brecho/painel-ane" && PAINEL_URL=https://crm.evoconecta.io bash scripts/publicar-funcoes.sh consulta-cep`
2. Painel: commit e push (deploy pelo Coolify) ou `scripts/publicar-painel.command`.
3. Fornecedores já importados (ex.: POLYVOX): abrir o parceiro → aba Cadastro → “Atualizar a partir de um XML” com o XML de qualquer nota dele.

## Testes
`sql/testes/84_testes_parceiro_dados_cep.sql` (rodado em produção dentro de transação revertida): padronizado, divergente, parcial, não encontrado, CEP inválido; salvar dados com mesclagem; número preservado com o mesmo CEP; endereço do cliente; histórico e resumo de compras. Pendente: teste no navegador após a publicação.
