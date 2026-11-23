// Guarda de documentação no deploy.
//  1) toda tela do menu (ITENS em src/App.tsx) precisa de verbete em src/ajuda/conteudo.ts;
//  2) cada verbete precisa de explicação, caso de uso, dica e passo de tutorial preenchidos;
//  3) gera docs/manual-painel.md a partir do mesmo conteúdo (é o que se espelha no conhecimento do projeto).
// Roda antes do build (npm run build). Para só gerar o manual: node scripts/verificar-ajuda.mjs --manual
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const ler = (p) => readFileSync(join(raiz, p), 'utf8')

// carrega conteudo.ts transpilando em memória (sem dependência extra)
const js = ts.transpileModule(ler('src/ajuda/conteudo.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const { AJUDA, TOUR_BOAS_VINDAS, VERSAO_DOC, ATUALIZADO_EM } = mod

// telas do menu: { id: 'pecas', rotulo: 'Peças', grupo: 'Catálogo' ...
const app = ler('src/App.tsx')
const telas = [...app.matchAll(/\{\s*id:\s*'([a-z_]+)',\s*rotulo:\s*'([^']+)',\s*grupo:\s*'([^']+)'/g)].map((m) => ({ id: m[1], rotulo: m[2], grupo: m[3] }))

const erros = []
if (telas.length === 0) erros.push('não consegui ler as telas do menu em src/App.tsx (o formato de ITENS mudou?)')
for (const t of telas) {
  const v = AJUDA[t.id]
  if (!v) { erros.push(`tela "${t.rotulo}" (${t.id}) está no menu mas não tem verbete em src/ajuda/conteudo.ts`); continue }
  if (!v.explicacao?.trim()) erros.push(`${t.id}: falta a explicação`)
  if (!v.casoDeUso?.trim()) erros.push(`${t.id}: falta o caso de uso`)
  if (!v.dicas?.length) erros.push(`${t.id}: falta ao menos uma dica`)
  if (!v.passos?.length) erros.push(`${t.id}: falta ao menos um passo de tutorial`)
}
for (const id of Object.keys(AJUDA)) if (!telas.some((t) => t.id === id)) erros.push(`verbete "${id}" não corresponde a nenhuma tela do menu (remover ou corrigir o id)`)
if (!/^\d+\.\d+\.\d+$/.test(VERSAO_DOC)) erros.push('VERSAO_DOC deve estar no formato 0.0.0')
if (!/^\d{4}-\d{2}-\d{2}$/.test(ATUALIZADO_EM)) erros.push('ATUALIZADO_EM deve estar no formato AAAA-MM-DD')

// manual em Markdown
const dataBr = ATUALIZADO_EM.split('-').reverse().join('/')
const linhas = [
  '# Manual do painel Ane Brechó', '',
  `Documentação v${VERSAO_DOC} · atualizada em ${dataBr}. Gerado de src/ajuda/conteudo.ts; não edite este arquivo à mão.`, '',
]
for (const grupo of [...new Set(telas.map((t) => t.grupo))]) {
  linhas.push(`## ${grupo}`, '')
  for (const t of telas.filter((x) => x.grupo === grupo)) {
    const v = AJUDA[t.id]; if (!v) continue
    linhas.push(`### ${v.titulo}`, '', `**O que é.** ${v.explicacao}`, '', `**Caso de uso.** ${v.casoDeUso}`, '', '**Dicas**', '', ...v.dicas.map((d) => `- ${d}`), '',
      '**Tutorial guiado**', '', ...v.passos.map((p, i) => `${i + 1}. **${p.titulo}** — ${p.texto}`), '')
  }
}
linhas.push('## Tour de boas-vindas', '', ...TOUR_BOAS_VINDAS.map((p, i) => `${i + 1}. **${p.titulo}** — ${p.texto}`), '')
mkdirSync(join(raiz, 'docs'), { recursive: true })
writeFileSync(join(raiz, 'docs/manual-painel.md'), linhas.join('\n'), 'utf8')

if (process.argv.includes('--manual')) { console.log(`manual gerado (${telas.length} telas)`); process.exit(0) }
if (erros.length) {
  console.error('\nDocumentação incompleta — o deploy foi barrado:\n' + erros.map((e) => '  • ' + e).join('\n') + '\n\nAtualize src/ajuda/conteudo.ts (e suba VERSAO_DOC/ATUALIZADO_EM) e rode de novo.\n')
  process.exit(1)
}
console.log(`ajuda ok: ${telas.length} telas documentadas, manual v${VERSAO_DOC} gerado em docs/manual-painel.md`)
