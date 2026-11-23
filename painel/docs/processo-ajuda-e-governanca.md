# Ajuda, tutorial guiado e governança: como manter

## O que existe
- **Menu de Ajuda** (botão "?" na barra superior): explicação, caso de uso e dicas da tela aberta, tutorial guiado, tour de boas-vindas e "Relatar dúvida ou ocorrência". Código em `src/ajuda/`.
- **Tutorial guiado**: holofote que destaca o campo da tela e um balão com o passo (setas do teclado, Esc fecha). Os alvos são seletores CSS; se o elemento não existir naquela tela (ou estiver oculto), o passo aparece como cartão central, sem quebrar.
- **Central de governança** (menu Configuração): dúvidas, ocorrências e sugestões com estado (aberto, em análise, resolvido, descartado), resolução e nota de aprendizado. CPF, CNPJ, e-mail e telefone são mascarados no navegador e de novo no banco.

## A cada deploy (checklist)
1. Mudou uma tela, campo, regra ou fluxo? Edite o verbete em `src/ajuda/conteudo.ts`: explicação, caso de uso, dicas e passos do tutorial.
2. Tela nova? Ela entra em `ITENS` no `App.tsx` **e** ganha verbete com o mesmo `id`. Sem verbete, o build é barrado.
3. Campo novo que o tutorial deve apontar? Dê ao elemento uma classe ou `data-ajuda="nome"` estável e use no `alvo` do passo.
4. Suba `VERSAO_DOC` (corrigir texto = patch, tela ou fluxo novo = minor) e `ATUALIZADO_EM`.
5. `npm run build`: roda `scripts/verificar-ajuda.mjs` (confere cobertura e regenera `docs/manual-painel.md`) antes do `tsc` e do Vite.
6. Espelhe o `docs/manual-painel.md` no conhecimento do projeto (`claude/manual-painel.md`) e, se a regra de negócio mudou, na Base de conhecimento do painel, para o assistente responder com o texto novo.
7. Abra a Central de governança e revise os itens abertos da tela alterada: o que virou resolução recorrente deve virar dica no verbete.

## Rotina da governança
- **Quem registra:** qualquer usuário da empresa, pelo "?" em qualquer tela (a tela de origem vai junto).
- **Quem trata:** gestor e suporte editam; financeiro só vê; administrador tem tudo. Ajustável em Permissões (tela "Central de governança").
- **Triagem sugerida:** ocorrência de gravidade alta no mesmo dia; dúvidas semanalmente. Toda resolução recebe uma nota que diga o que foi feito ou a orientação.
- **Fechar o ciclo:** dúvida que se repete vira dica no verbete (próximo deploy); ocorrência que revela falha vira pedido de mudança.

## Reversão
Banco: `drop schema governanca cascade; delete from crm.cfg_permissao_tela where tela='governanca'; delete from crm.cad_tela where tela='governanca';` (migration 0054).
Painel: remover `src/ajuda/`, `pages/Governanca.tsx`, as chamadas em `App.tsx` e o bloco `apiGovernanca` em `api.ts`.
