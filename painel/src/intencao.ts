// Decide, só pelo texto da pergunta, se ela é sobre DADOS (vendas de um cliente, vendas por período)
// ou sobre REGRAS/PROCESSOS (documentos). Sem rede, sem banco.
export type Intencao =
  | { tipo: 'cliente'; termo: string }
  | { tipo: 'periodo' }
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

export function classificar(pergunta: string): Intencao {
  const t = pergunta.trim()
  const a = t.match(RE_ARROBA)
  if (a) return { tipo: 'cliente', termo: a[1] }
  if (RE_VENDA.test(t)) {
    const m = t.match(RE_CLIENTE2) ?? t.match(RE_CLIENTE)
    const nome = m && !RE_PERIODO_INICIO.test(m[1].trim()) ? limpa(m[1]) : ''
    if (nome.length >= 3) return { tipo: 'cliente', termo: nome }
  }
  if (RE_VENDA_FORTE.test(t) && (RE_PERIODO.test(t) || RE_TOTAL.test(t))) return { tipo: 'periodo' }
  return { tipo: 'documentos' }
}
