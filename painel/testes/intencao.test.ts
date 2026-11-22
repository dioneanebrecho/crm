import { classificar, resolverPeriodo } from '../src/intencao.ts'
import assert from 'node:assert/strict'
const HOJE = new Date(2026, 10, 22)
const c = (p: string) => JSON.stringify(classificar(p, HOJE))
const casos: [string, string][] = [
  ['quais as vendas do cliente @deboraclemente?', '{"tipo":"cliente","termo":"deboraclemente"}'],
  ['@deboraaraujo quando foi as ultimas vendas', '{"tipo":"cliente","termo":"deboraaraujo"}'],
  ['total de vendas da semana anterior', '{"tipo":"notas","de":"2026-11-09","ate":"2026-11-15","rotulo":"Semana anterior (09/11/2026 a 15/11/2026)"}'],
  ['quanto vendemos em outubro?', '{"tipo":"notas","de":"2026-10-01","ate":"2026-10-31","rotulo":"Outubro/2026 (01/10/2026 a 31/10/2026)"}'],
  ['qual foi ultima nota emitida?', '{"tipo":"notas","de":null,"ate":null,"rotulo":"Últimas notas emitidas"}'],
  ['qual ultima venda realizada', '{"tipo":"notas","de":null,"ate":null,"rotulo":"Últimas notas emitidas"}'],
  ['total de vendas', '{"tipo":"notas","de":null,"ate":null,"rotulo":"Todo o período carregado"}'],
  ['Quanto tempo posso deixar um pedido pago sem nota?', '{"tipo":"documentos"}'],
  ['O que fazer com cliente que não responde ao link de pagamento?', '{"tipo":"documentos"}'],
  ['quais as compras da cliente Debora Clemente?', '{"tipo":"cliente","termo":"Debora Clemente"}'],
  ['como tratar pedido faturado e ainda não expedido?', '{"tipo":"documentos"}'],
]
assert.equal(resolverPeriodo('mês passado', HOJE)?.de, '2026-10-01')
assert.equal(resolverPeriodo('últimos 7 dias', HOJE)?.de, '2026-11-16')
assert.equal(resolverPeriodo('dezembro', HOJE)?.de, '2025-12-01')
assert.equal(resolverPeriodo('ontem', HOJE)?.de, '2026-11-21')
for (const [p, e] of casos) assert.equal(c(p), e, p)
console.log('ok', casos.length)
