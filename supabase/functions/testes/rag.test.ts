// Roda com: node --experimental-strip-types --test testes/rag.test.ts   (Node 22+)
import test from 'node:test'
import assert from 'node:assert/strict'
import { dividirEmTrechos, mascarar, fundirRRF, tituloNorm, gerarVetores, classificarCota, sha256Hex, DIM_VETOR, type Achado, type Http } from '../_shared/rag.ts'

const ach = (id: string, fonte: string, score = 1): Achado => ({ chunk_id: id, fonte_id: 'f-' + fonte, fonte_titulo: fonte, titulo: fonte, conteudo: 'c' + id, score })
const vet = (n = DIM_VETOR) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0))

test('sha256 conhecido', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
test('texto vazio não gera trechos', async () => { assert.deepEqual(await dividirEmTrechos('t', '  \n\n '), []) })
test('texto curto = 1 trecho com hash e tokens', async () => {
  const [t] = await dividirEmTrechos('Doc', 'Uma frase curta.')
  assert.equal(t.indice, 0); assert.equal(t.conteudo, 'Uma frase curta.'); assert.equal(t.tokens, 4); assert.match(t.hash, /^[0-9a-f]{64}$/)
})
test('parágrafos viram trechos de até ~1400 com sobreposição, índices sequenciais', async () => {
  const par = (n: number) => `Parágrafo ${n}. ` + 'palavra '.repeat(80)
  const ts = await dividirEmTrechos('Doc', Array.from({ length: 12 }, (_, i) => par(i)).join('\n\n'))
  assert.ok(ts.length >= 6)
  ts.forEach((t, i) => { assert.equal(t.indice, i); assert.ok(t.conteudo.length <= 1400 + 200) })
  assert.ok(ts[1].conteudo.includes('palavra'), 'sobreposição leva o final do anterior')
})
test('parágrafo gigante sem quebra é cortado (nada passa de 8000, que é o limite do banco)', async () => {
  const ts = await dividirEmTrechos('Doc', 'x '.repeat(20000))
  assert.ok(ts.length > 20); ts.forEach((t) => assert.ok(t.conteudo.length <= 1400 + 200))
})
test('mesmo conteúdo = mesmo hash (base do reaproveitamento de vetor)', async () => {
  const a = await dividirEmTrechos('A', 'Regra um.\n\nRegra dois.'); const b = await dividirEmTrechos('B', 'Regra um.\n\nRegra dois.')
  assert.equal(a[0].hash, b[0].hash)
})
test('máscara: CPF, e-mail e telefone; CNPJ e números de pedido ficam', () => {
  const { texto, mascarados } = mascarar('Cliente 123.456.789-09 (ana@x.com.br) fone (11) 91234-5678 ou +55 11 91234-5678. CNPJ 12.345.678/0001-90 pedido 20261121.')
  assert.ok(!texto.includes('123.456.789-09') && !texto.includes('ana@') && !texto.includes('91234-5678'))
  assert.ok(texto.includes('12.345.678/0001-90') && texto.includes('20261121'))
  assert.deepEqual(mascarados, { cpf: 1, email: 1, telefone: 2 })
})
test('máscara: texto sem dado pessoal não muda', () => {
  const t = 'A reserva expira em 15 minutos. Peça 4502 tamanho M, R$ 49,90.'
  assert.equal(mascarar(t).texto, t)
})
test('tituloNorm trata extensão, (1), acento e caixa', () => {
  assert.equal(tituloNorm('Política de Devolução (1).PDF'), 'politica de devolucao'); assert.equal(tituloNorm('politica-de-devolucao.md'), 'politica de devolucao')
})
test('RRF: trecho presente nas duas listas sobe; origem registra as duas', () => {
  const r = fundirRRF([ach('1', 'A'), ach('2', 'B'), ach('3', 'C')], [ach('3', 'C'), ach('4', 'D')], 8)
  assert.equal(r[0].chunk_id, '3'); assert.deepEqual(r[0].origem, ['texto', 'vetor'])
  assert.equal(r.length, 4)
})
test('RRF: máx. 3 trechos por fonte e dedupe por título normalizado', () => {
  const lista = [ach('1', 'Regras.pdf'), ach('2', 'Regras (1).pdf'), ach('3', 'regras.md'), ach('4', 'REGRAS'), ach('5', 'Outro')]
  const r = fundirRRF(lista, [], 8)
  assert.equal(r.filter((x) => tituloNorm(x.fonte_titulo) === 'regras').length, 3); assert.equal(r.length, 4)
})
test('RRF: respeita o limite e funciona sem uma das listas', () => {
  assert.equal(fundirRRF([], [ach('1', 'A'), ach('2', 'B')], 1).length, 1); assert.deepEqual(fundirRRF([], [], 5), [])
})
test('cota: classifica dia, minuto e desconhecida', () => {
  assert.equal(classificarCota('Quota exceeded per day').tipo, 'dia'); assert.equal(classificarCota('rate limit per minute').aguardar_s, 60)
  assert.equal(classificarCota('algo').tipo, 'desconhecida')
})

const cfgV = { provedor: 'voyage' as const, modelo: 'voyage-4', base: 'https://api.voyageai.com/v1', chave: 'k' }
const cfgG = { provedor: 'google_gemini' as const, modelo: 'gemini-embedding-001', base: 'https://generativelanguage.googleapis.com/v1beta', chave: 'k' }
const http = (status: number, json: any, capt?: { url?: string; body?: any; headers?: any }): Http => async (url, init) => {
  if (capt) { capt.url = url; capt.body = JSON.parse(String(init.body)); capt.headers = init.headers }
  return { status, ok: status >= 200 && status < 300, json }
}
test('Voyage: manda output_dimension 1024, input_type e ordena por index; chave só no cabeçalho', async () => {
  const c: any = {}
  const r = await gerarVetores(http(200, { data: [{ index: 1, embedding: vet() }, { index: 0, embedding: vet().reverse() }] }, c), cfgV, ['a', 'b'], 'query')
  assert.ok(r.ok); assert.equal(c.body.output_dimension, 1024); assert.equal(c.body.input_type, 'query'); assert.equal(c.url, 'https://api.voyageai.com/v1/embeddings')
  assert.equal(r.vetores![1][0], 1); assert.equal(r.vetores![0][1023], 1); assert.ok(!c.url.includes('k') || !c.url.includes('key'))
  assert.equal(c.headers.Authorization, 'Bearer k')
})
test('Gemini: batchEmbedContents com taskType e dimensão', async () => {
  const c: any = {}
  const r = await gerarVetores(http(200, { embeddings: [{ values: vet() }] }, c), cfgG, ['a'], 'document')
  assert.ok(r.ok); assert.equal(c.body.requests[0].outputDimensionality, 1024); assert.equal(c.body.requests[0].taskType, 'RETRIEVAL_DOCUMENT')
  assert.ok(c.url.endsWith('/models/gemini-embedding-001:batchEmbedContents'))
})
test('dimensão errada vira erro (nunca grava vetor torto)', async () => {
  const r = await gerarVetores(http(200, { data: [{ index: 0, embedding: vet(768) }] }), cfgV, ['a'], 'document')
  assert.equal(r.ok, false); assert.match(r.erro!, /1024/)
})
test('429 devolve cota classificada; 401/404/500/rede têm mensagem própria', async () => {
  const a = await gerarVetores(http(429, { error: { message: 'Quota exceeded per day' } }), cfgG, ['a'], 'document'); assert.equal(a.cota?.tipo, 'dia')
  assert.match((await gerarVetores(http(401, {}), cfgV, ['a'], 'document')).erro!, /recusou a chave/)
  assert.match((await gerarVetores(http(404, {}), cfgV, ['a'], 'document')).erro!, /não encontrado/)
  assert.match((await gerarVetores(http(500, {}), cfgV, ['a'], 'document')).erro!, /500/)
  const rede: Http = async () => ({ status: 0, ok: false, json: null, erroRede: 'tempo esgotado' })
  assert.match((await gerarVetores(rede, cfgV, ['a'], 'document')).erro!, /tempo esgotado/)
})
test('resposta com quantidade diferente de textos é recusada; lista vazia é ok sem chamar', async () => {
  assert.equal((await gerarVetores(http(200, { data: [] }), cfgV, ['a'], 'document')).ok, false)
  const nunca: Http = async () => { throw new Error('não deveria chamar') }
  assert.deepEqual((await gerarVetores(nunca, cfgV, [], 'document')).vetores, [])
})
