// Lógica pura do RAG (sem Deno, sem rede própria): divisão em trechos, máscara de dados pessoais, fusão de resultados
// e adaptadores de vetor (Voyage e Gemini). Portada do ZAgent (chunking 1400/180, vetor 1024, RRF K=60) e testável em Node.
// Nada aqui registra texto de documento, pergunta ou chave em log.

export const DIM_VETOR = 1024
export interface Trecho { indice: number; titulo: string; conteudo: string; tokens: number; hash: string }

export async function sha256Hex(texto: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

const normalizar = (v: string) => v.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

// Parágrafo maior que o trecho (tabela, texto sem quebra) é cortado em fronteira de linha/frase/espaço.
function cortarGrande(par: string, alvo: number): string[] {
  if (par.length <= alvo) return [par]
  const partes: string[] = []
  let resto = par
  while (resto.length > alvo) {
    const janela = resto.slice(0, alvo)
    const minimo = Math.floor(alvo * 0.5)
    const corte = [janela.lastIndexOf('\n'), janela.lastIndexOf('. '), janela.lastIndexOf('; '), janela.lastIndexOf(' ')].find((i) => i >= minimo)
    const fim = corte === undefined ? alvo : corte + 1
    partes.push(resto.slice(0, fim).trim())
    resto = resto.slice(fim).trim()
  }
  if (resto) partes.push(resto)
  return partes
}

export async function dividirEmTrechos(titulo: string, texto: string, alvo = 1400, sobreposicao = 180): Promise<Trecho[]> {
  const norm = normalizar(texto)
  if (!norm) return []
  const pars = norm.split(/\n{2,}/).filter(Boolean).flatMap((p) => cortarGrande(p, alvo))
  const blocos: string[] = []
  let atual = ''
  for (const p of pars) {
    if (atual && atual.length + p.length + 2 > alvo) {
      blocos.push(atual.trim())
      const cauda = atual.slice(Math.max(0, atual.length - sobreposicao))
      atual = `${cauda.slice(cauda.search(/\s/) + 1).trim()}\n\n${p}`
    } else atual = atual ? `${atual}\n\n${p}` : p
  }
  if (atual.trim()) blocos.push(atual.trim())
  const saida: Trecho[] = []
  for (let i = 0; i < blocos.length; i++) {
    saida.push({ indice: i, titulo, conteudo: blocos[i], tokens: Math.ceil(blocos[i].length / 4), hash: await sha256Hex(blocos[i]) })
  }
  return saida
}

// ---------------------------------------------------------------- máscara de dados pessoais (antes de gravar e antes de registrar pergunta)
// CPF formatado, e-mail e telefone BR com separador ou +55. CNPJ (dado de empresa) NÃO é mascarado.
// Limite conhecido: CPF só com dígitos (11 seguidos) não é detectado, para não mascarar códigos e números de pedido.
export interface Mascarados { cpf: number; email: number; telefone: number }
export function mascarar(texto: string): { texto: string; mascarados: Mascarados } {
  const m: Mascarados = { cpf: 0, email: 0, telefone: 0 }
  let t = texto.replace(/(?<![\d.])\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g, () => { m.cpf++; return '[CPF]' })
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, () => { m.email++; return '[EMAIL]' })
  t = t.replace(/(?<![\d.\/-])(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]\d{4}(?![\d\/-]|\.\d)/g, () => { m.telefone++; return '[TELEFONE]' })
  return { texto: t, mascarados: m }
}

// ---------------------------------------------------------------- fusão dos resultados (RRF, como no ZAgent)
export interface Achado { chunk_id: string; fonte_id: string; fonte_titulo: string; titulo: string; conteudo: string; score: number }
export interface Fundido extends Achado { origem: ('texto' | 'vetor')[] }

// "Regras.pdf", "Regras.md" e "Regras (1).pdf" são o mesmo documento.
export function tituloNorm(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\.(pdf|docx?|xlsx?|csv|txt|md|pptx?)$/i, '').replace(/\s*\(\d+\)\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function fundirRRF(texto: Achado[], vetor: Achado[], limite = 8, k = 60, maxPorFonte = 3): Fundido[] {
  const mapa = new Map<string, Fundido & { rrf: number }>()
  const somar = (lista: Achado[], origem: 'texto' | 'vetor') => lista.forEach((a, pos) => {
    const e = mapa.get(a.chunk_id) ?? { ...a, origem: [], rrf: 0 }
    e.rrf += 1 / (k + pos + 1)
    if (!e.origem.includes(origem)) e.origem.push(origem)
    mapa.set(a.chunk_id, e)
  })
  somar(texto, 'texto'); somar(vetor, 'vetor')
  const ordenados = [...mapa.values()].sort((a, b) => b.rrf - a.rrf)
  const porFonte = new Map<string, number>()
  const saida: Fundido[] = []
  for (const e of ordenados) {
    const chave = tituloNorm(e.fonte_titulo) || e.fonte_id
    const n = porFonte.get(chave) ?? 0
    if (n >= maxPorFonte) continue
    porFonte.set(chave, n + 1)
    const { rrf, ...resto } = e
    saida.push({ ...resto, score: Number(rrf.toFixed(5)) })
    if (saida.length >= limite) break
  }
  return saida
}

// ---------------------------------------------------------------- vetores
export type Http = (url: string, init: RequestInit, prazoMs?: number) => Promise<{ status: number; ok: boolean; json: any; erroRede?: string }>
export interface ConfigVetor { provedor: 'voyage' | 'google_gemini'; modelo: string; base: string; chave: string }
export interface ResultadoVetor { ok: boolean; vetores?: number[][]; erro?: string; cota?: { tipo: 'minuto' | 'dia' | 'desconhecida'; aguardar_s: number } }

export function classificarCota(texto: string): { tipo: 'minuto' | 'dia' | 'desconhecida'; aguardar_s: number } {
  if (/per.?day|daily|di[aá]ri|por dia/i.test(texto)) return { tipo: 'dia', aguardar_s: 1800 }
  if (/per.?minute|minute|rate|minuto|rpm|tpm/i.test(texto)) return { tipo: 'minuto', aguardar_s: 60 }
  return { tipo: 'desconhecida', aguardar_s: 600 }
}

export async function gerarVetores(http: Http, cfg: ConfigVetor, textos: string[], tipo: 'document' | 'query'): Promise<ResultadoVetor> {
  if (textos.length === 0) return { ok: true, vetores: [] }
  let r; let extrair: (j: any) => unknown
  if (cfg.provedor === 'voyage') {
    r = await http(`${cfg.base}/embeddings`, {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.chave}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ input: textos, model: cfg.modelo, output_dimension: DIM_VETOR, input_type: tipo }) }, 30000)
    extrair = (j) => Array.isArray(j?.data) ? [...j.data].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)).map((d: any) => d.embedding) : null
  } else {
    const modelo = encodeURIComponent(cfg.modelo)
    r = await http(`${cfg.base}/models/${modelo}:batchEmbedContents`, {
      method: 'POST', headers: { 'x-goog-api-key': cfg.chave, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ requests: textos.map((t) => ({ model: `models/${cfg.modelo}`, content: { parts: [{ text: t }] },
        outputDimensionality: DIM_VETOR, taskType: tipo === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' })) }) }, 30000)
    extrair = (j) => Array.isArray(j?.embeddings) ? j.embeddings.map((e: any) => e.values) : null
  }
  if (r.erroRede) return { ok: false, erro: `não foi possível falar com o provedor de vetor (${r.erroRede})` }
  if (r.status === 429) return { ok: false, erro: 'limite de uso do provedor de vetor atingido', cota: classificarCota(String(r.json?.error?.message ?? r.json?.detail ?? '')) }
  if (r.status === 401 || r.status === 403) return { ok: false, erro: 'o provedor de vetor recusou a chave' }
  if (r.status === 404) return { ok: false, erro: 'modelo de vetor não encontrado no provedor' }
  if (!r.ok) return { ok: false, erro: `o provedor de vetor respondeu com erro ${r.status}` }
  const v = extrair(r.json) as number[][] | null
  if (!Array.isArray(v) || v.length !== textos.length || v.some((x) => !Array.isArray(x))) return { ok: false, erro: 'resposta inesperada do provedor de vetor' }
  if (v.some((x) => x.length !== DIM_VETOR)) return { ok: false, erro: `o modelo devolveu vetor com tamanho diferente de ${DIM_VETOR}` }
  return { ok: true, vetores: v }
}
