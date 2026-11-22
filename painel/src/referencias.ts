// Acha, em um texto (pergunta ou trecho de documento), referências que têm tela própria no painel:
// nota fiscal (número ou chave de acesso de 44 dígitos), cliente (@ do Instagram ou "cliente Nome") e parceiro ("parceiro/fornecedor Nome").
// Só gera o atalho com a busca já preenchida; quem confere o cadastro é a própria tela. Sem rede, sem banco.
export type AbaAtalho = 'fiscal' | 'clientes' | 'parceiros'
export interface Referencia { aba: AbaAtalho; busca: string; rotulo: string }

const NOME = "[A-ZÀ-Ú][\\p{L}'-]+(?:\\s+[A-ZÀ-Ú][\\p{L}'-]+){0,3}"
const RE_NOTA = /\b(?:nf-?e|nfe|nf|nota(?:\s+fiscal)?)\s*(?:n[ºo°.]?\s*)?(\d{3,9})\b/gi
const RE_CHAVE = /(?<!\d)(\d{44})(?!\d)/g
const RE_ARROBA = /(?<![\w.@])@([A-Za-z0-9._]{2,30})\b/g
const RE_CLIENTE = new RegExp(`\\bcliente\\s+(?:d[aeo]s?\\s+)?(${NOME})`, 'gu')
const RE_PARCEIRO = new RegExp(`\\b(?:parceir[oa]|fornecedor[a]?|consignante)\\s+(?:d[aeo]s?\\s+)?(${NOME})`, 'gu')
const PALAVRAS_FRACAS = new Set(['Que', 'Para', 'Com', 'Sem', 'Quando', 'Qual', 'Quais', 'Como', 'Esse', 'Essa', 'Este', 'Esta', 'Pedido', 'Peça', 'Nota', 'Live'])

function limpaNome(n: string): string {
  const partes = n.trim().split(/\s+/)
  while (partes.length && PALAVRAS_FRACAS.has(partes[partes.length - 1])) partes.pop()
  return partes.join(' ')
}

export function acharReferencias(textos: string[], max = 6): Referencia[] {
  const out: Referencia[] = []; const visto = new Set<string>()
  const add = (r: Referencia) => { const k = r.aba + '|' + r.busca.toLowerCase(); if (!visto.has(k) && out.length < max) { visto.add(k); out.push(r) } }
  for (const t of textos) {
    if (!t) continue
    for (const m of t.matchAll(RE_CHAVE)) {
      const n = parseInt(m[1].slice(25, 34), 10) // posições 26 a 34 da chave = número da nota
      if (n > 0) add({ aba: 'fiscal', busca: String(n), rotulo: `Nota ${n}` })
    }
    for (const m of t.matchAll(RE_NOTA)) add({ aba: 'fiscal', busca: String(parseInt(m[1], 10)), rotulo: `Nota ${parseInt(m[1], 10)}` })
    for (const m of t.matchAll(RE_ARROBA)) add({ aba: 'clientes', busca: m[1], rotulo: `Cliente @${m[1]}` })
    for (const m of t.matchAll(RE_CLIENTE)) { const n = limpaNome(m[1]); if (n.length > 2) add({ aba: 'clientes', busca: n, rotulo: `Cliente ${n}` }) }
    for (const m of t.matchAll(RE_PARCEIRO)) { const n = limpaNome(m[1]); if (n.length > 2) add({ aba: 'parceiros', busca: n, rotulo: `Parceiro ${n}` }) }
  }
  return out
}

export const NOME_TELA: Record<AbaAtalho, string> = { fiscal: 'Notas Bling', clientes: 'Clientes', parceiros: 'Parceiros' }

// "há 5 min", "ontem", "12/11" — para o histórico
export function quando(iso: string, agora = Date.now()): string {
  const d = new Date(iso); const s = Math.max(0, Math.round((agora - d.getTime()) / 1000))
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  if (s < 172800) return 'ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
