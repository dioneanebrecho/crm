import assert from 'node:assert/strict'
import { escolherGrafico, metricaEfetiva, metricaParaTipo, paraPontos, agruparOutros, escala, fmtMetrica, serieVazia, formaDe, tiposCompativeis, type LinhaSerie } from '../src/grafico.ts'

// escolha do tipo
assert.deepEqual(escolherGrafico('serie_temporal', null), { tipo: 'coluna', aviso: null, sugestoes: [] })
assert.equal(escolherGrafico('serie_temporal', 'linha').tipo, 'linha')
assert.equal(escolherGrafico('serie_temporal', 'barra').tipo, 'coluna') // barra em série no tempo = colunas, sem aviso
assert.equal(escolherGrafico('serie_temporal', 'barra').aviso, null)
assert.equal(escolherGrafico('ranking', null).tipo, 'barra')
assert.equal(escolherGrafico('composicao', null).tipo, 'rosca')
assert.equal(escolherGrafico('composicao', 'pizza').tipo, 'pizza')
const piz = escolherGrafico('serie_temporal', 'pizza')
assert.equal(piz.tipo, 'coluna')
assert.match(piz.aviso ?? '', /partes de um todo, não a evolução no tempo; mostrei colunas/)
assert.deepEqual(piz.sugestoes.map((s) => [s.dimensao, s.tipo]), [['situacao', 'pizza'], ['cliente', 'pizza']])
const lin = escolherGrafico('ranking', 'linha')
assert.equal(lin.tipo, 'barra'); assert.match(lin.aviso ?? '', /evolução no tempo/); assert.equal(lin.sugestoes[0].dimensao, 'dia')
const wf = escolherGrafico('serie_temporal', 'waterfall')
assert.equal(wf.tipo, 'coluna'); assert.match(wf.aviso ?? '', /Waterfall \(cascata\) ainda não está disponível \(faltam cancelamentos, devoluções e frete na base\); mostrei colunas\./)
assert.match(escolherGrafico('ranking', 'funil').aviso ?? '', /dados das lives/)
assert.match(escolherGrafico('composicao', 'calor').aviso ?? '', /Mapa de calor ainda não está disponível; mostrei rosca\./)
assert.deepEqual(tiposCompativeis(formaDe('cliente')).slice(0, 2), ['barra', 'coluna'])
assert.equal(formaDe('semana'), 'serie_temporal'); assert.equal(formaDe('situacao'), 'composicao')

// métricas e permissão
assert.deepEqual(metricaEfetiva('valor', true), { metrica: 'valor', aviso: null })
assert.equal(metricaEfetiva('valor', false).metrica, 'qtd'); assert.match(metricaEfetiva('ticket', false).aviso ?? '', /ocultos/)
assert.equal(metricaEfetiva('qtd', false).aviso, null)
assert.equal(metricaParaTipo('rosca', 'ticket').metrica, 'valor'); assert.equal(metricaParaTipo('linha', 'ticket').metrica, 'ticket')

const L = (chave: string, qtd: number, valor: number | null, extra: Partial<LinhaSerie> = {}): LinhaSerie => ({ chave, rotulo: chave, qtd, valor, ...extra })
const linhas = [L('a', 2, 100), L('b', 0, 0), L('c', 4, 600)]
assert.deepEqual(paraPontos(linhas, 'valor').map((p) => p.v), [100, 0, 600])
assert.deepEqual(paraPontos(linhas, 'qtd').map((p) => p.v), [2, 0, 4])
assert.deepEqual(paraPontos(linhas, 'ticket').map((p) => p.v), [50, 0, 150]) // sem divisão por zero
assert.deepEqual(paraPontos([L('x', 3, null)], 'valor').map((p) => p.v), [0]) // sem permissão de valor
assert.equal(serieVazia(paraPontos([L('a', 0, 0), L('b', 0, 0)], 'qtd')), true); assert.equal(serieVazia(paraPontos(linhas, 'qtd')), false); assert.equal(serieVazia([]), true)

// pizza: até 6 fatias, resto vira Outros (somando com o "Outros" do banco)
const muitos = [...'abcdefgh'].map((c, i) => L(c, i + 1, (i + 1) * 10))
const g = agruparOutros(paraPontos(muitos, 'valor'), 6)
assert.equal(g.agrupou, true); assert.equal(g.pontos.length, 6)
assert.equal(g.pontos[5].rotulo, 'Outros'); assert.equal(g.pontos[5].v, 10 + 20 + 30) // a, b, c (os 3 menores; ficam os 5 maiores)
assert.equal(g.pontos.reduce((s, p) => s + p.v, 0), muitos.reduce((s, l) => s + (l.valor ?? 0), 0)) // não perde nada
const poucos = agruparOutros(paraPontos(muitos.slice(0, 4), 'qtd'), 6); assert.equal(poucos.agrupou, false)
const comOutros = agruparOutros(paraPontos([...muitos.slice(0, 6), L('Outros', 9, 90, { outros: true })], 'qtd'), 6)
assert.equal(comOutros.pontos.length, 6); assert.equal(comOutros.pontos.reduce((s, p) => s + p.qtd, 0), 1 + 2 + 3 + 4 + 5 + 6 + 9)

// escala do eixo
assert.deepEqual(escala(0, true), { topo: 1, marcas: [0, 1] })
assert.deepEqual(escala(3, true), { topo: 3, marcas: [0, 1, 2, 3] })
assert.deepEqual(escala(950, false), { topo: 1000, marcas: [0, 250, 500, 750, 1000] })
assert.deepEqual(escala(26851.5, false), { topo: 30000, marcas: [0, 10000, 20000, 30000] })
assert.equal(escala(7, true).topo >= 7, true)
assert.equal(fmtMetrica('qtd', 1), '1 pedido'); assert.equal(fmtMetrica('qtd', 5), '5 pedidos')
assert.match(fmtMetrica('valor', 1234.5), /R\$\s?1\.234,50/)
console.log('ok grafico')
