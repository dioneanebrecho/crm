# Pedido de mudança 050: tela "Fluxo do processo" no painel

Data: 26/11/2026 · Situação: **banco aplicado e testado; painel pronto (tsc ok), sem commit**. Aprovação: Dione ("pode iniciar", protocolo D15). Origem: mapa interativo `fluxo-processo-interativo.md` (artefato, revisão 1.0).

## Pedido e decisões
1. Uma mesma pessoa pode exercer mais de um papel. A visão "Por pessoa" aceita vários papéis combinados (no artefato e na tela).
2. O acesso segue a camada de liberação das outras telas (matriz de Permissões, tela `fluxo`).
3. **D1:** as etapas ficam no banco, editáveis na tela, e cada alteração gera revisão com cópia completa.
4. **D2:** os papéis do processo **não** ficam gravados por usuário: a pessoa marca na hora (o navegador lembra a escolha).
5. **D3:** o artefato fica como rascunho para validar com a Ane até a tela ir ao ar.

## Banco (migrations 0095a–d, aplicadas)
| Migration | O que faz |
|---|---|
| 0095a_fluxo_estrutura | `crm.cad_fluxo_funcao` (papéis do processo), `crm.cad_fluxo_etapa` (código estável E01…, ordem, fase 1–6, área, responsável, apoio, tela, entrada, procedimento, entrega, impacto, regras, situação uso/impl/plan/man, ativa), `crm.mov_fluxo_comentario`, `crm.log_fluxo_revisao` (versão, tipo inicial/edição/restauração/anotação, cópia jsonb). RLS ligada e acesso só por função. `cad_tela` ganha `fluxo` (grupo Inteligência, ordem 195); `crm._padrao_nivel` ganha `fluxo` (gestor editar; suporte, apresentadora, expedição, financeiro e leitura ver); permissões carregadas para as empresas existentes |
| 0095b_fluxo_api | `crm._fluxo_exigir` (usa `api.nivel_tela`), `_fluxo_copia`, `_fluxo_proxima_versao`, `_fluxo_revisar`, `_fluxo_carregar`; `api.fluxo_etapa_salvar` (inclui ou altera; reordena sem buraco; exige descrição; recusa "nada mudou"), `api.fluxo_revisao_copia`, `api.fluxo_revisao_registrar` (anotação), `api.fluxo_comentar` (mascara CPF, CNPJ, telefone e e-mail com `governanca.mascarar`), `api.fluxo_comentario_resolver` (editar ou o próprio autor) |
| 0095c_fluxo_carga_e_obter | `crm._fluxo_semear` (revisão 1.0: 33 etapas e 10 papéis) e `api.fluxo_obter` (nível, versão, papéis, etapas, comentários e revisões com nome do autor). Carga feita para a empresa existente; empresa nova recebe a carga na primeira abertura da tela |
| 0095d_fluxo_restaurar_ordem | `api.fluxo_restaurar`: volta as etapas para a cópia de uma revisão; as criadas depois ficam inativas no fim; gera nova revisão |

Testes: `sql/testes/95_testes_fluxo.sql`, 11 grupos (leitura, edição com revisão, "nada mudou", reordenar para cima e para baixo sem buraco, nova etapa E34 na posição, papel inválido, restauração, comentário mascarado, anotação, usuário só com "ver", nível "nenhum" e usuário de fora). `TESTES_OK`, nada gravado. Advisors: só o INFO esperado de RLS sem política nas 4 tabelas novas.

## Painel
- `src/apiFluxo.ts` (novo): tipos, áreas e cores, fases, chamadas `fluxo_*` e `comparar()` entre versões.
- `src/pages/Fluxo.tsx` + `src/pages/fluxo.css` (novos, CSS isolado com prefixo `fx-`):
  - **Processo completo:** raias por área, linha ligando as etapas por fase, busca, filtro de situação, "Mostrar inativas" (quem edita). No celular vira lista com a área no cartão.
  - **Detalhe da etapa** (painel lateral): área, situação, quem faz e apoia, tela, entrada, entrega, procedimento, impacto, regras, anterior/próxima com o responsável, comentários e novo comentário.
  - **Editar / Nova etapa** (nível editar): todos os campos, posição, ativa e "O que mudou e por quê" (vira a revisão).
  - **Por pessoa:** vários papéis ao mesmo tempo, "executa como" ou "apoia como", recebe de / entrega para ("você" quando a etapa vizinha também é dela), procedimento e "Copiar checklist".
  - **Revisões e comentários:** histórico, "Comparar com a atual" (etapas incluídas, removidas e campos alterados), "Restaurar esta versão" com motivo, "Registrar anotação"; comentários abertos, resolvidos e todos.
- `src/App.tsx`: 3 linhas (import, item "Fluxo do processo" no grupo Início, `case 'fluxo'`).
- `src/ajuda/conteudo.ts`: verbete `fluxo`; `VERSAO_DOC` 0.13.0.
- Conferência: `tsc --noEmit` sem erros. Visual conferido numa cópia local com os dados da revisão 1.0 (mapa, detalhe, edição, por pessoa, revisões; 1400 px e 390 px). **A tela não foi aberta no painel de produção** (exige login).

## Pendências
1. Commit junto ou separado do trabalho da outra sessão (financeiro e expedição) que está nos mesmos arquivos (`App.tsx`, `ajuda/conteudo.ts`, manual).
2. Regenerar o manual (`npm run ajuda:manual`) e o grafo (`graphify update .`) depois do commit.
3. Numeração: a outra sessão criou `sql/0095_empresa_nome_fantasia_ane_brecho.sql` no disco; estas são 0095a–d. Conferir a ordem no histórico do Supabase antes de publicar.
4. Revisar com a equipe as situações das etapas 30 a 32 (financeiro), que estavam "planejado" e começaram a ser implantadas pela outra sessão (0094).

## Reversão
`drop function` das `api.fluxo_*` e `crm._fluxo_*`; `drop table crm.mov_fluxo_comentario, crm.log_fluxo_revisao, crm.cad_fluxo_etapa, crm.cad_fluxo_funcao;` `delete from crm.cfg_permissao_tela where tela = 'fluxo'; delete from crm.cad_tela where tela = 'fluxo';` recriar `crm._padrao_nivel` sem as linhas `fluxo`. Painel: remover as 3 linhas do `App.tsx`, os 3 arquivos novos e o verbete.

## Linha para `changelog-banco.md`
| 26/11/2026 | 050 | `0095a`…`0095d` | tela Fluxo do processo: etapas editáveis com revisão e cópia, comentários mascarados, restauração, permissões pela matriz | ver acima | Dione |
