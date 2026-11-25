@AGENTS.md

<!-- grafo-premissa -->
## Grafo como premissa (painel-ane / Ane Brechó)

O grafo (`graphify-out/`) é a base das análises e decisões de arquitetura deste projeto, não um complemento opcional.

- No início da sessão, rode `sh scripts/verificar-grafo.sh`. Se acusar "GRAFO DESATUALIZADO", avise o usuário logo na primeira resposta, com o comando de correção que o script mostra, antes de apoiar qualquer conclusão no grafo.
- Antes de analisar impacto, propor mudança de arquitetura ou decidir onde implementar algo: consulte o grafo (`graphify query/path/explain`; se o comando não rodar no ambiente, leia `graphify-out/GRAPH_REPORT.md` e `graph.json`). Só depois confirme no código-fonte.
- Em análises de arquitetura e propostas de mudança, termine com uma linha de base: "Base: grafo de AAAA-MM-DD, commit <hash>, em dia|atrasado". A ausência dessa linha indica que o grafo não foi consultado.
- Depois de cada commit, rode `sh scripts/verificar-grafo.sh` e informe explicitamente "grafo atualizado" ou "grafo pendente" (com o comando para rodar no Mac). O gancho do graphify só funciona onde o graphify está instalado; commits feitos em ambiente sem ele deixam o grafo atrasado em silêncio.
- O grafo cobre `painel/src`, `sql/` (migrações) e os `pedido-mudanca-*.md`. Não cobre os documentos do Project "Anne Brecho" no claude.ai (`claude/...`); para decisões de negócio, consulte também o Project.
