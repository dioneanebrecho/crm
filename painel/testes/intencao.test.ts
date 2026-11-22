import { classificar } from '../src/intencao.ts'
import assert from 'node:assert/strict'
const c = (p: string) => JSON.stringify(classificar(p))
const casos: [string, string][] = [
  ['quais as vendas do cliente @deboraclemente?', '{"tipo":"cliente","termo":"deboraclemente"}'],
  ['@deboraaraujo quando foi as ultimas vendas', '{"tipo":"cliente","termo":"deboraaraujo"}'],
  ['total de vendas da semana anterior', '{"tipo":"periodo"}'],
  ['quanto vendemos em outubro?', '{"tipo":"periodo"}'],
  ['Quanto tempo posso deixar um pedido pago sem nota?', '{"tipo":"documentos"}'],
  ['O que fazer com cliente que não responde ao link de pagamento?', '{"tipo":"documentos"}'],
  ['quais as compras da cliente Debora Clemente?', '{"tipo":"cliente","termo":"Debora Clemente"}'],
  ['como tratar pedido faturado e ainda não expedido?', '{"tipo":"documentos"}'],
]
for (const [p, e] of casos) assert.equal(c(p), e, p)
console.log('ok', casos.length)
