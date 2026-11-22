// node --experimental-strip-types --test testes/referencias.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { acharReferencias, quando } from '../src/referencias.ts'

test('nota por número, com e sem prefixo e zeros', () => {
  assert.deepEqual(acharReferencias(['Por que a NF 1234 foi rejeitada? Veja a nota fiscal nº 000987 e a NF-e 55']).map((r) => r.busca), ['1234', '987'])
})
test('chave de acesso vira o número da nota', () => {
  const chave = '35261112345678000190550010000012341123456780'.padEnd(44, '0').slice(0, 44)
  const r = acharReferencias([`chave ${chave}`])
  assert.equal(r.length, 1); assert.equal(r[0].aba, 'fiscal'); assert.equal(r[0].busca, String(parseInt(chave.slice(25, 34), 10)))
})
test('@ de Instagram vira cliente; e-mail não', () => {
  const r = acharReferencias(['quais as vendas do cliente @deboraclemente? contato ana@x.com'])
  assert.deepEqual(r.map((x) => x.rotulo), ['Cliente @deboraclemente'])
})
test('"cliente Nome" e "parceiro Nome" com nomes compostos', () => {
  const r = acharReferencias(['O cliente Maria da Silva reservou; falar com o parceiro Casa Bela Modas sobre a consignação'])
  assert.deepEqual(r.map((x) => [x.aba, x.busca]), [['clientes', 'Maria'], ['parceiros', 'Casa Bela Modas']])
})
test('palavra comum depois de "cliente" não vira nome', () => {
  assert.deepEqual(acharReferencias(['Todo cliente que não responde; o parceiro que atrasou']), [])
})
test('deduplica, respeita o máximo e ignora texto vazio', () => {
  assert.equal(acharReferencias(['NF 100', 'nota 100', ''], 6).length, 1)
  assert.equal(acharReferencias(['NF 100 NF 200 NF 300 NF 400'], 2).length, 2)
  assert.deepEqual(acharReferencias([]), [])
})
test('quando(): agora, minutos, horas, ontem', () => {
  const agora = Date.parse('2026-11-21T22:00:00Z')
  assert.equal(quando('2026-11-21T21:59:40Z', agora), 'agora'); assert.equal(quando('2026-11-21T21:55:00Z', agora), 'há 5 min')
  assert.equal(quando('2026-11-21T19:00:00Z', agora), 'há 3 h'); assert.equal(quando('2026-11-20T20:00:00Z', agora), 'ontem')
})
