// Decide, só pelo texto da pergunta, se ela é sobre DADOS (vendas de um cliente, vendas por período)
// ou sobre REGRAS/PROCESSOS (documentos). Sem rede, sem banco.
export type Intencao =
  | { tipo: 'cliente'; termo: string }
  | { tipo: 'notas'; de: string | null; ate: string | null; rotulo: string }
  | { tipo: 'documentos' }

const RE_ARROBA = /(?<![\w.@])@([A-Za-z0-9._]{2,30})/
const RE_VENDA = /\b(vend\w*|compr\w*|nota\w*|pedid\w*|hist[oó]ric\w*|faturamento|[uú]ltim\w*)\b/i
const RE_VENDA_FORTE = /\b(vend\w*|compr\w*|faturamento)\b/i
const RE_PERIODO = /\b(semana|m[eê]s|hoje|ontem|ano|trimestre|per[ií]odo|live[s]?|dia|outubro|novembro|dezembro|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro)\b/i
const RE_PERIODO_INICIO = /^(semana|m[eê]s|ano|dia|hoje|ontem|live|per[ií]odo|trimestre|outubro|novembro|dezembro|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro)/i
const RE_TOTAL = /\b(total|quanto|quantas?|soma|ranking|maiores|melhores|gr[aá]fico)\b/i
const RE_CLIENTE = /\b(?:cliente|compras?|vendas?|notas?|pedidos?)\s+(?:d[aeo]s?\s+)(?:cliente\s+)?([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){0,2})/iu
const RE_CLIENTE2 = /\bcliente\s+(?:d[aeo]s?\s+)?([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){0,2})/iu
const FRACAS = new Set(['que', 'quando', 'qual', 'quais', 'como', 'para', 'com', 'sem', 'foi', 'foram', 'fez', 'tem', 'não', 'nao', 'mais', 'semana', 'mês', 'mes', 'ontem', 'hoje', 'ano', 'último', 'ultimo', 'última', 'ultima', 'ultimas', 'últimas', 'anterior', 'passada', 'passado', 'atual', 'é', 'e', 'da', 'do', 'de', 'na', 'no'])

function limpa(nome: string): string {
  const p = nome.trim().split(/\s+/)
  while (p.length && FRACAS.has(p[p.length - 1].toLowerCase())) p.pop()
  while (p.length && FRACAS.has(p[0].toLowerCase())) p.shift()
  return p.join(' ')
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const br = (d: Date) => d.toLocaleDateString('pt-BR')
const soma = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Converte expressões como "semana passada", "mês anterior", "outubro", "últimos 15 dias" em datas. null = sem período.
export function resolverPeriodo(texto: string, hoje: Date = new Date()): { de: string; ate: string; rotulo: string } | null {
  const t = semAcento(texto)
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const mk = (a: Date, b: Date, nome: string) => ({ de: ymd(a), ate: ymd(b), rotulo: `${nome} (${br(a)} a ${br(b)})` })
  const seg = soma(h, -((h.getDay() + 6) % 7))
  if (/\bhoje\b/.test(t)) return mk(h, h, 'Hoje')
  if (/\bontem\b/.test(t)) { const o = soma(h, -1); return mk(o, o, 'Ontem') }
  if (/semana\s+(passada|anterior)/.test(t)) return mk(soma(seg, -7), soma(seg, -1), 'Semana anterior')
  if (/(esta|essa|nesta|nessa)\s+semana|semana\s+atual/.test(t)) return mk(seg, h, 'Esta semana')
  if (/mes\s+(passado|anterior)/.test(t)) return mk(new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 0), 'Mês anterior')
  if (/(este|esse|neste|nesse)\s+mes|mes\s+atual/.test(t)) return mk(new Date(h.getFullYear(), h.getMonth(), 1), h, 'Este mês')
  const n = t.match(/ultimos?\s+(\d{1,3})\s+dias/)
  if (n) { const q = Math.min(Math.max(parseInt(n[1], 10), 1), 366); return mk(soma(h, -(q - 1)), h, `Últimos ${q} dias`) }
  const m = t.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b(?:\s+de\s+(\d{4}))?/)
  if (m) {
    const mes = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'].indexOf(m[1])
    const ano = m[2] ? parseInt(m[2], 10) : mes <= h.getMonth() ? h.getFullYear() : h.getFullYear() - 1
    return mk(new Date(ano, mes, 1), new Date(ano, mes + 1, 0), `${MESES[mes][0].toUpperCase()}${MESES[mes].slice(1)}/${ano}`)
  }
  return null
}

const RE_ULTIMAS = /\b[uú]ltim[ao]s?\s+(?:\d+\s+)?(nota|notas|venda|vendas|nf|nfe)\b/i

export function classificar(pergunta: string, hoje: Date = new Date()): Intencao {
  const t = pergunta.trim()
  const a = t.match(RE_ARROBA)
  if (a) return { tipo: 'cliente', termo: a[1] }
  if (RE_VENDA.test(t)) {
    const m = t.match(RE_CLIENTE2) ?? t.match(RE_CLIENTE)
    const nome = m && !RE_PERIODO_INICIO.test(m[1].trim()) ? limpa(m[1]) : ''
    if (nome.length >= 3) return { tipo: 'cliente', termo: nome }
  }
  if (RE_ULTIMAS.test(t)) return { tipo: 'notas', de: null, ate: null, rotulo: 'Últimas notas emitidas' }
  const per = resolverPeriodo(t, hoje)
  if ((RE_VENDA_FORTE.test(t) && (RE_PERIODO.test(t) || RE_TOTAL.test(t))) || (/\bnotas?\b/i.test(t) && per)) {
    return per ? { tipo: 'notas', ...per } : { tipo: 'notas', de: null, ate: null, rotulo: 'Todo o período carregado' }
  }
  return { tipo: 'documentos' }
}
