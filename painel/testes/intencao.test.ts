import { classificar, resolverPeriodo, extrairPeriodos, deFichaIA, pareceDado } from '../src/intencao.ts'
import assert from 'node:assert/strict'
const HOJE = new Date(2026, 10, 22) // domingo, 22/11/2026
const c = (p: string) => JSON.stringify(classificar(p, HOJE))
const casos: [string, string][] = [
  ['quais as vendas do cliente @deboraclemente?', '{"tipo":"cliente","termo":"deboraclemente"}'],
  ['@deboraaraujo quando foi as ultimas vendas', '{"tipo":"cliente","termo":"deboraaraujo"}'],
  ['total de vendas da semana anterior', '{"tipo":"notas","de":"2026-11-09","ate":"2026-11-15","rotulo":"Semana anterior (09/11/2026 a 15/11/2026)"}'],
  ['quanto vendemos em outubro?', '{"tipo":"notas","de":"2026-10-01","ate":"2026-10-31","rotulo":"Outubro/2026 (01/10/2026 a 31/10/2026)"}'],
  ['qual foi ultima nota emitida?', '{"tipo":"notas","de":null,"ate":null,"rotulo":"Últimas notas emitidas"}'],
  ['qual ultima venda realizada', '{"tipo":"notas","de":null,"ate":null,"rotulo":"Últimas notas emitidas"}'],
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

// período novo: último mês = 30 dias, datas escritas, ano, todo o período, mês de outro ano
assert.equal(resolverPeriodo('no último mês', HOJE)?.de, '2026-10-24')
assert.deepEqual(resolverPeriodo('de 01/10/2025 a 31/10/2025', HOJE), { de: '2025-10-01', ate: '2025-10-31', rotulo: 'Período (01/10/2025 a 31/10/2025)' })
assert.equal(resolverPeriodo('outubro de 2025', HOJE)?.de, '2025-10-01')
assert.equal(resolverPeriodo('outubro do ano passado', HOJE)?.de, '2025-10-01')
assert.equal(resolverPeriodo('outubro deste ano', HOJE)?.de, '2026-10-01')
assert.equal(resolverPeriodo('ano passado', HOJE)?.ate, '2025-12-31')
assert.equal(resolverPeriodo('todo o período', HOJE)?.de, null)

// semana ambígua -> pergunta com 2 opções; cada opção já vira um período claro
const sem = classificar('gere gráfico de vendas da ultima semana', HOJE)
assert.equal(sem.tipo, 'esclarecer')
if (sem.tipo === 'esclarecer') {
  assert.equal(sem.grafico, true)
  assert.equal(sem.opcoes.length, 2)
  assert.equal(sem.opcoes[0].texto, 'gere gráfico de vendas nos últimos 7 dias')
  assert.equal(sem.opcoes[1].texto, 'gere gráfico de vendas na semana passada')
  assert.match(sem.opcoes[0].rotulo, /16\/11 a 22\/11/)
  assert.match(sem.opcoes[1].rotulo, /09\/11 a 15\/11/)
  const a = classificar(sem.opcoes[0].texto, HOJE), b = classificar(sem.opcoes[1].texto, HOJE)
  assert.ok(a.tipo === 'notas' && a.de === '2026-11-16' && a.ate === '2026-11-22' && !a.assumido)
  assert.ok(b.tipo === 'notas' && b.de === '2026-11-09' && b.ate === '2026-11-15' && !b.assumido)
}
assert.equal(classificar('vendas na última semana', HOJE).tipo, 'esclarecer')
assert.equal(classificar('qual a regra da última semana do mês para reservar peça?', HOJE).tipo, 'documentos')

// sem período: últimos 30 dias + aviso + opções de troca
const sp = classificar('total de vendas', HOJE)
assert.ok(sp.tipo === 'notas' && sp.de === '2026-10-24' && sp.ate === '2026-11-22')
if (sp.tipo === 'notas') {
  assert.match(sp.assumido ?? '', /não informou o período.*últimos 30 dias \(24\/10\/2026 a 22\/11\/2026\)/)
  assert.deepEqual(sp.opcoes?.map((o) => o.texto), ['total de vendas, mês passado', 'total de vendas, este mês', 'total de vendas, todo o período', 'total de vendas, '])
  assert.equal(sp.opcoes?.[3].modo, 'preencher')
  for (const o of sp.opcoes!.slice(0, 3)) { const x = classificar(o.texto, HOJE); assert.ok(x.tipo === 'notas' && !x.assumido, o.texto) }
}
const gr = classificar('gere gráfico de vendas', HOJE)
assert.ok(gr.tipo === 'notas' && gr.grafico === true && !!gr.assumido)
assert.equal(classificar('total de vendas do mês passado', HOJE).tipo === 'notas' && (classificar('total de vendas do mês passado', HOJE) as { assumido?: string }).assumido, undefined)

// comparativos (ainda sem gráfico, mas já entendidos)
const p1 = extrairPeriodos('comparar vendas de outubro de 2025 com outubro de 2026', HOJE)
assert.deepEqual(p1.map((p) => [p.de, p.ate]), [['2025-10-01', '2025-10-31'], ['2026-10-01', '2026-10-31']])
assert.deepEqual(extrairPeriodos('vendas de outubro comparado ao ano passado', HOJE).map((p) => p.de), ['2026-10-01', '2025-10-01'])
assert.deepEqual(extrairPeriodos('vendas do mês passado x mesmo mês do ano passado', HOJE).map((p) => p.ate), ['2026-10-31', '2025-10-31'])
assert.deepEqual(extrairPeriodos('vendas deste ano versus ano passado', HOJE).map((p) => p.de), ['2026-01-01', '2025-01-01'])
assert.deepEqual(extrairPeriodos('vendas 2025 e 2026', HOJE).map((p) => p.de), ['2025-01-01', '2026-01-01'])
assert.deepEqual(extrairPeriodos('vendas de fevereiro de 2024 x fevereiro de 2023', HOJE).map((p) => p.ate), ['2024-02-29', '2023-02-28'])
assert.equal(extrairPeriodos('total de vendas do mês passado', HOJE).length, 1)
const cmp = classificar('compare as vendas de novembro de 2026 e novembro de 2025', HOJE)
assert.ok(cmp.tipo === 'comparativo' && cmp.periodos.length === 2)
if (cmp.tipo === 'comparativo') {
  assert.equal(cmp.periodos[1].frase, 'de 01/11/2025 a 30/11/2025')
  const um = classificar(cmp.opcoes[1].texto, HOJE) // "Ver só Novembro/2025" vira consulta de um período
  assert.ok(um.tipo === 'notas' && um.de === '2025-11-01' && um.ate === '2025-11-30' && !um.assumido)
}
assert.equal(classificar('comparativo de vendas entre outubro de 2025 e outubro de 2026', HOJE).tipo, 'comparativo')
const ec = classificar('quero um comparativo de vendas', HOJE)
assert.ok(ec.tipo === 'esclarecer' && ec.opcoes.length === 4)
if (ec.tipo === 'esclarecer') for (const o of ec.opcoes.slice(0, 3)) assert.equal(classificar(o.texto, HOJE).tipo, 'comparativo', o.texto)
assert.equal(classificar('vendas da @deboraclemente comparado ao ano passado', HOJE).tipo, 'cliente')
console.log('ok', casos.length + ' casos + períodos, semana, 30 dias e comparativos')
{
  const r = classificar('quais os TOP 10 clientes nos ultimos 6 meses', HOJE)
  assert.equal(r.tipo, 'notas')
  if (r.tipo === 'notas') {
    assert.equal(r.de, '2026-05-23'); assert.equal(r.ate, '2026-11-22'); assert.equal(r.dimensao, 'cliente'); assert.equal(r.limite, 10); assert.equal(r.grafico, true); assert.equal(r.assumido, undefined)
  }
  const r2 = classificar('os 5 maiores clientes do ano passado', HOJE)
  assert.ok(r2.tipo === 'notas' && r2.limite === 5 && r2.dimensao === 'cliente' && r2.grafico === true)
  const r3 = classificar('vendas por mês nos últimos 3 meses', HOJE)
  assert.ok(r3.tipo === 'notas' && r3.dimensao === 'mes' && r3.de === '2026-08-23' && r3.grafico === true)
  assert.equal(resolverPeriodo('últimos 12 meses', HOJE)?.de, '2025-11-23')
  console.log('ok ranking e últimos N meses')
}
{
  const f = deFichaIA({ intencao: 'vendas', entendimento: 'Top 10 clientes por valor, últimos 6 meses', periodo: { de: '2026-05-23', ate: '2026-11-22', rotulo: 'Últimos 6 meses' }, dimensao: 'cliente', metrica: 'valor', limite: 10, mostrar_grafico: true }, 'x')
  assert.ok(f && f.tipo === 'notas' && f.dimensao === 'cliente' && f.limite === 10 && f.grafico === true && f.de === '2026-05-23' && f.entendimento)
  assert.equal(deFichaIA({ intencao: 'documentos', entendimento: '' }, 'x')?.tipo, 'documentos')
  assert.equal(deFichaIA({ intencao: 'cliente', entendimento: '' }, 'x'), null)
  assert.ok(pareceDado('quais os top 10 clientes') && !pareceDado('como funciona a reserva de peça'))
  console.log('ok ficha da IA')
}
