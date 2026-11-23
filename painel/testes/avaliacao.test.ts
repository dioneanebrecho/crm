// Conjunto de avaliação do entendimento de perguntas (padrão ZAgent: perguntas reais + resultado esperado).
// Valida o caminho por regras (fallback). Quando a IA estiver publicada, o mesmo conjunto serve para comparar.
import { entender } from '../src/intencao.ts'
import assert from 'node:assert/strict'
const HOJE = new Date(2026, 10, 22)
type Esp = Partial<{ tipo: string; de: string; ate: string; dimensao: string; metrica: string; tipoGrafico: string; limite: number; termo: string }>
const ctxMes = { de: '2026-08-23', ate: '2026-11-22', rotulo: 'Últimos 3 meses', dimensao: 'mes' as const, metrica: 'valor' as const, grafico: null }
const casos: [string, Esp, typeof ctxMes | null][] = [
  ['quais as vendas do cliente @deboraclemente?', { tipo: 'cliente', termo: 'deboraclemente' }, null],
  ['total de vendas da semana anterior', { tipo: 'notas', de: '2026-11-09', ate: '2026-11-15' }, null],
  ['quanto vendemos em outubro?', { tipo: 'notas', de: '2026-10-01', ate: '2026-10-31' }, null],
  ['TOP 10 clientes nos últimos 6 meses', { tipo: 'notas', de: '2026-05-23', dimensao: 'cliente', limite: 10 }, null],
  ['5 maiores clientes do ano passado', { tipo: 'notas', dimensao: 'cliente', limite: 5 }, null],
  ['vendas por mês nos últimos 3 meses', { tipo: 'notas', de: '2026-08-23', dimensao: 'mes' }, null],
  ['Quanto tempo posso deixar um pedido pago sem nota?', { tipo: 'documentos' }, null],
  ['quanto tempo dura a reserva de uma peça?', { tipo: 'documentos' }, null],
  ['agora por cliente', { tipo: 'notas', de: '2026-08-23', ate: '2026-11-22', dimensao: 'cliente' }, ctxMes],
  ['em pizza', { tipo: 'notas', de: '2026-08-23', ate: '2026-11-22', tipoGrafico: 'pizza' }, { ...ctxMes, dimensao: 'situacao' as never }],
  ['por semana', { tipo: 'notas', dimensao: 'semana', de: '2026-08-23' }, ctxMes],
  ['em pedidos', { tipo: 'notas', metrica: 'qtd', de: '2026-08-23' }, ctxMes],
]
let falhas = 0
for (const [p, esp, ctx] of casos) {
  const it = entender(p, ctx, HOJE) as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(esp)) {
    try { assert.equal(it[k], v, `${p} -> ${k}`) } catch (e) { falhas++; console.error('FALHA:', (e as Error).message, 'obtido', it[k]) }
  }
}
console.log(falhas ? `${falhas} falha(s) na avaliação` : `avaliação ok (${casos.length} perguntas)`)
process.exit(falhas ? 1 : 0)
