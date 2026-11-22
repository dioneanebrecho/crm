// Decide, só pelo texto da pergunta, se ela é sobre DADOS (vendas de um cliente, vendas por período, comparativo entre
// períodos) ou sobre REGRAS/PROCESSOS (documentos). Sem rede, sem banco.
// Quando falta clareza (ex.: "última semana"), devolve uma pergunta com opções clicáveis em vez de adivinhar em silêncio.
import type { ContextoDados, Dimensao, Metrica, TipoPedido } from './grafico'

export interface Periodo { de: string | null; ate: string | null; rotulo: string }
export interface PeriodoComparado extends Periodo { frase: string }
// modo 'enviar' = pergunta completa (o clique já executa); 'preencher' = coloca no campo para a pessoa completar.
export interface Opcao { rotulo: string; texto: string; modo: 'enviar' | 'preencher' }
export type Intencao =
  | { tipo: 'cliente'; termo: string }
  | { tipo: 'notas'; de: string | null; ate: string | null; rotulo: string; assumido?: string; opcoes?: Opcao[]; grafico?: true; dimensao?: Dimensao; metrica?: Metrica; tipoGrafico?: TipoPedido; seguimento?: true }
  | { tipo: 'esclarecer'; pergunta: string; opcoes: Opcao[]; grafico?: true }
  | { tipo: 'comparativo'; periodos: PeriodoComparado[]; opcoes: Opcao[]; grafico?: true }
  | { tipo: 'documentos' }

const RE_ARROBA = /(?<![\w.@])@([A-Za-z0-9._]{2,30})/
const RE_VENDA = /\b(vend\w*|compr\w*|nota\w*|pedid\w*|hist[oó]ric\w*|faturamento|[uú]ltim\w*)\b/i
const RE_VENDA_FORTE = /\b(vend\w*|compr\w*|faturamento)\b/i
const RE_PERIODO = /\b(semana|m[eê]s|hoje|ontem|ano|trimestre|per[ií]odo|live[s]?|dia|outubro|novembro|dezembro|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro)\b/i
const RE_PERIODO_INICIO = /^(semana|m[eê]s|ano|dia|hoje|ontem|live|per[ií]odo|trimestre|outubro|novembro|dezembro|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro)/i
const RE_TOTAL = /\b(total|quanto|quantas?|soma|ranking|maiores|melhores|gr[aá]fico)\b/i
const RE_CLIENTE = /\b(?:cliente|compras?|vendas?|notas?|pedidos?)\s+(?:d[aeo]s?\s+)(?:cliente\s+)?([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){0,2})/iu
const RE_CLIENTE2 = /\bcliente\s+(?:d[aeo]s?\s+)?([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){0,2})/iu
const RE_GRAFICO = /\b(gr[aá]fico|chart|barras?|colunas?|pizza|torta|rosca|donut|waterfall|cascata|linha|tend[eê]ncia|funil|pareto|calor)\b/i
// "última semana" é ambígua (últimos 7 dias ou semana passada, de segunda a domingo): pergunta em vez de escolher.
const RE_ULT_SEMANA = /\b(?:(?:a|o|d[aeo]s?|n[aeo]s?)\s+)?[uú]ltima\s+semana\b/i
// comparar períodos: palavra de comparação ou "x" isolado (a partir de dois períodos na frase, compara mesmo sem a palavra)
const RE_COMPARA = /\b(compar\w*|versus|vs|contra|em\s+rela[cç][aã]o\s+(?:a|ao)|diferen[cç]a\s+entre|evolu[cç][aã]o\s+(?:anual|mes\s+a\s+mes))\b|\sx\s/
const RE_ANO_ANT = /ano\s+(?:passado|anterior)/
const FRACAS = new Set(['cliente', 'clientes', 'que', 'quando', 'qual', 'quais', 'como', 'para', 'com', 'sem', 'foi', 'foram', 'fez', 'tem', 'não', 'nao', 'mais', 'semana', 'mês', 'mes', 'ontem', 'hoje', 'ano', 'último', 'ultimo', 'última', 'ultima', 'ultimas', 'últimas', 'anterior', 'passada', 'passado', 'atual', 'é', 'e', 'da', 'do', 'de', 'na', 'no'])

function limpa(nome: string): string {
  const p = nome.trim().split(/\s+/)
  while (p.length && FRACAS.has(p[p.length - 1].toLowerCase())) p.pop()
  while (p.length && FRACAS.has(p[0].toLowerCase())) p.shift()
  return p.join(' ')
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_SEM = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const RE_MES = '(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)'
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const br = (d: Date) => d.toLocaleDateString('pt-BR')
const brCurto = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const soma = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const pdata = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const fimMes = (a: Date) => new Date(a.getFullYear(), a.getMonth() + 1, 0)
const mesInteiro = (a: Date, b: Date) => a.getDate() === 1 && b.getTime() === fimMes(a).getTime()
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const rotuloIntervalo = (a: Date, b: Date) => (mesInteiro(a, b) ? `${cap(MESES[a.getMonth()])}/${a.getFullYear()} (${br(a)} a ${br(b)})` : `${br(a)} a ${br(b)}`)
const base = (t: string) => t.trim().replace(/[\s?!.,;:]+$/, '')

// Converte expressões como "semana passada", "mês anterior", "outubro", "últimos 15 dias", "01/10/2025 a 31/10/2025",
// "este ano", "todo o período" em datas. null = sem período. de/ate null = todo o período carregado.
export function resolverPeriodo(texto: string, hoje: Date = new Date()): Periodo | null {
  const t = semAcento(texto)
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const mk = (a: Date, b: Date, nome: string) => ({ de: ymd(a), ate: ymd(b), rotulo: `${nome} (${br(a)} a ${br(b)})` })
  const seg = soma(h, -((h.getDay() + 6) % 7))
  const r = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:a|ate|ao?|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (r) {
    const a = new Date(+r[3], +r[2] - 1, +r[1]), b = new Date(+r[6], +r[5] - 1, +r[4])
    if (a.getDate() === +r[1] && b.getDate() === +r[4] && a <= b) return mk(a, b, 'Período')
  }
  if (/todo\s+o\s+periodo|periodo\s+completo|desde\s+o\s+inicio/.test(t)) return { de: null, ate: null, rotulo: 'Todo o período carregado' }
  if (/\bhoje\b/.test(t)) return mk(h, h, 'Hoje')
  if (/\bontem\b/.test(t)) { const o = soma(h, -1); return mk(o, o, 'Ontem') }
  if (/semana\s+(passada|anterior)/.test(t)) return mk(soma(seg, -7), soma(seg, -1), 'Semana anterior')
  if (/(esta|essa|nesta|nessa)\s+semana|semana\s+atual/.test(t)) return mk(seg, h, 'Esta semana')
  if (/mes\s+(passado|anterior)/.test(t)) return mk(new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 0), 'Mês anterior')
  if (/(este|esse|neste|nesse)\s+mes|mes\s+atual/.test(t)) return mk(new Date(h.getFullYear(), h.getMonth(), 1), h, 'Este mês')
  const n = t.match(/ultimos?\s+(\d{1,3})\s+dias/)
  if (n) { const q = Math.min(Math.max(parseInt(n[1], 10), 1), 366); return mk(soma(h, -(q - 1)), h, `Últimos ${q} dias`) }
  if (/ultimo\s+mes/.test(t)) return mk(soma(h, -29), h, 'Últimos 30 dias')
  const m = t.match(new RegExp(`\\b${RE_MES}\\b(?:\\s+de)?(?:\\s+(\\d{4}))?`))
  if (m) {
    const mes = MESES_SEM.indexOf(m[1])
    // sem ano escrito: "do ano passado" / "deste ano" valem; senão, o mês mais recente que já começou
    const ano = m[2] ? parseInt(m[2], 10)
      : RE_ANO_ANT.test(t) ? h.getFullYear() - 1
      : /(?:este|esse|neste|nesse|deste|desse)\s+ano/.test(t) ? h.getFullYear()
      : mes <= h.getMonth() ? h.getFullYear() : h.getFullYear() - 1
    return mk(new Date(ano, mes, 1), new Date(ano, mes + 1, 0), `${cap(MESES[mes])}/${ano}`)
  }
  if (/(?:este|esse|neste|nesse|deste|desse)\s+ano|ano\s+atual/.test(t)) return mk(new Date(h.getFullYear(), 0, 1), h, 'Este ano')
  if (RE_ANO_ANT.test(t)) { const y = h.getFullYear() - 1; return mk(new Date(y, 0, 1), new Date(y, 11, 31), `Ano de ${y}`) }
  const y = t.match(/\b(20\d{2})\b/)
  if (y) { const ano = parseInt(y[1], 10); return mk(new Date(ano, 0, 1), ano === h.getFullYear() ? h : new Date(ano, 11, 31), `Ano de ${ano}`) }
  return null
}

const frasePeriodo = (a: Date, b: Date) => `de ${br(a)} a ${br(b)}`
function comparado(p: Periodo): PeriodoComparado | null {
  if (!p.de || !p.ate) return null
  return { ...p, frase: frasePeriodo(pdata(p.de), pdata(p.ate)) }
}
// Mesmo intervalo n anos antes (mês fechado continua mês fechado, mesmo em fevereiro bissexto).
function deslocarAno(p: PeriodoComparado, n: number): PeriodoComparado {
  const a = pdata(p.de!), b = pdata(p.ate!)
  const a2 = new Date(a.getFullYear() + n, a.getMonth(), a.getDate())
  const b2 = mesInteiro(a, b) ? fimMes(a2) : new Date(b.getFullYear() + n, b.getMonth(), b.getDate())
  return { de: ymd(a2), ate: ymd(b2), rotulo: rotuloIntervalo(a2, b2), frase: frasePeriodo(a2, b2) }
}

// Todos os períodos citados na frase, na ordem. "outubro comparado ao ano passado" gera dois (outubro e o mesmo mês um ano antes).
export function extrairPeriodos(texto: string, hoje: Date = new Date()): PeriodoComparado[] {
  const t = semAcento(texto)
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const achados: { i: number; p: PeriodoComparado }[] = []
  const usados: [number, number][] = []
  const varrer = (re: RegExp, ajustar?: (frag: string) => string) => {
    for (const m of t.matchAll(re)) {
      const i = m.index ?? 0, f = i + m[0].length
      if (usados.some(([a, b]) => i < b && f > a)) continue
      const per = resolverPeriodo(ajustar ? ajustar(m[0]) : m[0], hoje)
      const c = per && comparado(per)
      if (c) { achados.push({ i, p: c }); usados.push([i, f]) }
    }
  }
  const semAnoNoMes = (frag: string) => (/\d{4}/.test(frag) ? frag : /(?:este|esse|neste|nesse|deste|desse)\s+ano/.test(t) ? `${frag} de ${h.getFullYear()}` : frag)
  varrer(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:a|ate|ao?|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/g)
  varrer(new RegExp(`\\b${RE_MES}\\b(?:\\s+de)?(?:\\s+\\d{4})?`, 'g'), semAnoNoMes)
  for (const re of [/mes\s+(?:passado|anterior)/g, /(?:este|esse|neste|nesse)\s+mes|mes\s+atual/g, /semana\s+(?:passada|anterior)/g, /(?:esta|essa|nesta|nessa)\s+semana|semana\s+atual/g, /\bhoje\b/g, /\bontem\b/g, /ultimos?\s+\d{1,3}\s+dias/g, /ultimo\s+mes/g]) varrer(re)
  const qtdBase = achados.length
  if (qtdBase === 0) {
    varrer(/(?:este|esse|neste|nesse|deste|desse)\s+ano|ano\s+atual/g)
    varrer(/ano\s+(?:passado|anterior)/g)
    varrer(/\b20\d{2}\b/g)
  }
  achados.sort((a, b) => a.i - b.i)
  const lista: PeriodoComparado[] = []
  for (const { p } of achados) if (!lista.some((x) => x.de === p.de && x.ate === p.ate)) lista.push(p)
  if (qtdBase >= 1 && lista.length === 1 && RE_ANO_ANT.test(t)) lista.push(deslocarAno(lista[0], -1))
  return lista
}

// O que a pessoa pediu sobre a forma da resposta: tipo de gráfico, agrupamento e métrica.
const TIPOS: [RegExp, TipoPedido][] = [
  [/\b(waterfall|cascata|ponte)\b/, 'waterfall'], [/\bfunil\b/, 'funil'], [/\b(pareto|curva\s+abc)\b/, 'pareto'],
  [/\b(mapa\s+de\s+calor|heatmap)\b/, 'calor'], [/\b(dispersao|scatter)\b/, 'dispersao'],
  [/\b(rosca|donut)\b/, 'rosca'], [/\b(pizza|torta|participacao|proporcao)\b/, 'pizza'], [/\barea\b/, 'area'],
  [/\b(linha|linhas|tendencia|evolucao|curva)\b/, 'linha'], [/\b(coluna|colunas)\b/, 'coluna'], [/\b(barra|barras)\b/, 'barra'],
]
export interface Pedido { tipo?: TipoPedido; dimensao?: Dimensao; metrica?: Metrica }
export function extrairPedido(texto: string): Pedido {
  const t = semAcento(texto)
  const p: Pedido = {}
  for (const [re, tipo] of TIPOS) if (re.test(t)) { p.tipo = tipo; break }
  if (/\b(por\s+clientes?|top\s+\d*\s*clientes?|(maiores|melhores)\s+clientes?|ranking\s+(de\s+)?clientes?|clientes)\b/.test(t)) p.dimensao = 'cliente'
  else if (/\b(por\s+(situacao|status)|situacao|status)\b/.test(t)) p.dimensao = 'situacao'
  else if (/\b(por\s+dia|diari[oa]s?|dia\s+a\s+dia)\b/.test(t)) p.dimensao = 'dia'
  else if (/\b(por\s+semana|semanal|semana\s+a\s+semana)\b/.test(t)) p.dimensao = 'semana'
  else if (/\b(por\s+mes|mensal|mes\s+a\s+mes)\b/.test(t)) p.dimensao = 'mes'
  if (/\bticket\b/.test(t)) p.metrica = 'ticket'
  else if (/\b(quantidade|qtd|numero\s+de\s+notas|quantas|n[o°º]\s+de\s+notas)\b/.test(t)) p.metrica = 'qtd'
  else if (/\b(valor|faturamento|r\$|reais)\b/.test(t)) p.metrica = 'valor'
  return p
}
const pedidoCampos = (t: string) => {
  const p = extrairPedido(t)
  return { ...(p.dimensao ? { dimensao: p.dimensao } : {}), ...(p.metrica ? { metrica: p.metrica } : {}), ...(p.tipo ? { tipoGrafico: p.tipo } : {}) }
}
const RE_RANKING_CLIENTES = /\b(top|maiores|melhores|ranking)\b[^.?!]*\bclientes?\b|\bclientes?\b[^.?!]*\b(top|maiores|melhores)\b/i

function esclarecerSemana(t: string, h: Date, graf: { grafico?: true }): Intencao {
  const seg = soma(h, -((h.getDay() + 6) % 7))
  return {
    tipo: 'esclarecer', pergunta: 'Por "última semana" você quer os últimos 7 dias ou a semana passada (segunda a domingo)?', ...graf,
    opcoes: [
      { rotulo: `Últimos 7 dias (${brCurto(soma(h, -6))} a ${brCurto(h)})`, texto: t.replace(RE_ULT_SEMANA, 'nos últimos 7 dias'), modo: 'enviar' },
      { rotulo: `Semana passada (${brCurto(soma(seg, -7))} a ${brCurto(soma(seg, -1))})`, texto: t.replace(RE_ULT_SEMANA, 'na semana passada'), modo: 'enviar' },
    ],
  }
}

const RE_ULTIMAS = /\b[uú]ltim[ao]s?\s+(?:\d+\s+)?(nota|notas|venda|vendas|nf|nfe)\b/i

function opcoesPeriodo(pergunta: string): Opcao[] {
  const b = base(pergunta)
  return [
    { rotulo: 'Mês passado', texto: `${b}, mês passado`, modo: 'enviar' },
    { rotulo: 'Este mês', texto: `${b}, este mês`, modo: 'enviar' },
    { rotulo: 'Todo o período', texto: `${b}, todo o período`, modo: 'enviar' },
    { rotulo: 'Outro período…', texto: `${b}, `, modo: 'preencher' },
  ]
}

export function classificar(pergunta: string, hoje: Date = new Date()): Intencao {
  const t = pergunta.trim()
  const graf = RE_GRAFICO.test(t) ? ({ grafico: true } as const) : {}
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const a = t.match(RE_ARROBA)
  if (a) return { tipo: 'cliente', termo: a[1] }
  if (RE_VENDA.test(t)) {
    const m = t.match(RE_CLIENTE2) ?? t.match(RE_CLIENTE)
    const nome = m && !RE_PERIODO_INICIO.test(m[1].trim()) ? limpa(m[1]) : ''
    if (nome.length >= 3) return { tipo: 'cliente', termo: nome }
  }
  if (RE_VENDA_FORTE.test(t)) {
    const ps = extrairPeriodos(t, hoje)
    if (ps.length >= 2) {
      const lim = ps.slice(0, 6)
      return { tipo: 'comparativo', periodos: lim, opcoes: lim.map((p) => ({ rotulo: `Ver só ${p.rotulo.split(' (')[0]}`, texto: `total de vendas ${p.frase}`, modo: 'enviar' as const })), ...graf }
    }
    if (RE_COMPARA.test(semAcento(t))) {
      return {
        tipo: 'esclarecer', pergunta: 'Quais períodos você quer comparar?', ...graf,
        opcoes: [
          { rotulo: 'Mês passado x mesmo mês do ano anterior', texto: 'comparar vendas do mês passado com o mesmo mês do ano passado', modo: 'enviar' },
          { rotulo: 'Este mês x mês passado', texto: 'comparar vendas deste mês com o mês passado', modo: 'enviar' },
          { rotulo: 'Este ano x ano passado', texto: 'comparar vendas deste ano com o ano passado', modo: 'enviar' },
          { rotulo: 'Outros períodos…', texto: 'comparar vendas de ', modo: 'preencher' },
        ],
      }
    }
  }
  if (RE_ULT_SEMANA.test(t) && (RE_VENDA_FORTE.test(t) || /\bnotas?\b/i.test(t))) return esclarecerSemana(t, h, graf)
  if (RE_ULTIMAS.test(t)) return { tipo: 'notas', de: null, ate: null, rotulo: 'Últimas notas emitidas' }
  const per = resolverPeriodo(t, hoje)
  if ((RE_VENDA_FORTE.test(t) && (RE_PERIODO.test(t) || RE_TOTAL.test(t))) || RE_RANKING_CLIENTES.test(t) || (/\bnotas?\b/i.test(t) && per)) {
    if (per) return { tipo: 'notas', ...per, ...graf, ...pedidoCampos(t) }
    // período não informado: assume os últimos 30 dias e avisa
    const ini = soma(h, -29)
    return {
      tipo: 'notas', de: ymd(ini), ate: ymd(h), rotulo: `Últimos 30 dias (${br(ini)} a ${br(h)})`,
      assumido: `Você não informou o período, então mostrei os últimos 30 dias (${br(ini)} a ${br(h)}).`,
      opcoes: opcoesPeriodo(t), ...graf, ...pedidoCampos(t),
    }
  }
  return { tipo: 'documentos' }
}

// Entende a pergunta dentro da conversa: perguntas curtas sem assunto próprio ("e do mês passado?", "agora em pizza", "por cliente",
// "em quantidade") continuam o último resultado de dados, trocando só o que mudou.
export function entender(pergunta: string, ctx: ContextoDados | null, hoje: Date = new Date()): Intencao {
  const it = classificar(pergunta, hoje)
  if (it.tipo !== 'documentos' || !ctx) return it
  if (pergunta.trim().split(/\s+/).length > 7) return it
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  if (RE_ULT_SEMANA.test(pergunta)) return esclarecerSemana(pergunta.trim(), h, {})
  const ped = extrairPedido(pergunta)
  const per = resolverPeriodo(pergunta, hoje)
  if (!ped.tipo && !ped.dimensao && !ped.metrica && !per) return it
  return {
    tipo: 'notas', de: per ? per.de : ctx.de, ate: per ? per.ate : ctx.ate, rotulo: per ? per.rotulo : ctx.rotulo,
    dimensao: ped.dimensao ?? ctx.dimensao, metrica: ped.metrica ?? ctx.metrica,
    ...(ped.tipo ? { tipoGrafico: ped.tipo } : ped.dimensao || !ctx.grafico ? {} : { tipoGrafico: ctx.grafico }),
    grafico: true, seguimento: true,
  }
}
