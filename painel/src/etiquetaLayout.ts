// Layout livre de etiqueta (editor visual). Medidas em mm. É gravado em impressao.cad_modelo.opcoes.layout e lido pelo banco (impressao._gerar_zpl).

export type TipoElemento = 'texto' | 'barras' | 'qr' | 'imagem' | 'linha' | 'retangulo'
export interface Bitmap { w: number; h: number; d: string } // 1 bit por pixel, 1 = preto, linhas alinhadas em byte, base64
export interface Elemento {
  id: string; tipo: TipoElemento; x: number; y: number; w: number; h: number; rot: 0 | 90 | 180 | 270
  valor?: string; fonte?: string; tam_pt?: number; negrito?: boolean; alinh?: 'L' | 'C' | 'R'; linhas?: number
  mostrar_texto?: boolean; modulo?: number; espessura?: number
  b203?: Bitmap; b300?: Bitmap; nome_arquivo?: string
}
export interface Layout { versao: 1; elementos: Elemento[] }

export const VARIAVEIS: { chave: string; rotulo: string; exemplo: string }[] = [
  { chave: '{descricao}', rotulo: 'Descrição', exemplo: 'Vestido Floral Midi' },
  { chave: '{codigo_produto}', rotulo: 'Código do produto', exemplo: 'VES-001' },
  { chave: '{preco}', rotulo: 'Preço', exemplo: '99,90' },
  { chave: '{grade}', rotulo: 'Grade (tamanho)', exemplo: 'M' },
  { chave: '{marca}', rotulo: 'Marca', exemplo: 'Farm' },
  { chave: '{categoria}', rotulo: 'Categoria', exemplo: 'Vestidos' },
  { chave: '{codigo_variacao}', rotulo: 'Código da variação', exemplo: 'VES-001-M' },
  { chave: '{codigo_unidade}', rotulo: 'Código da unidade', exemplo: 'VES-001-M-001' },
  { chave: '{numero_curto}', rotulo: 'Número curto (live)', exemplo: '1234' },
]
// Nomes antigos continuam valendo nos modelos já salvos.
const SINONIMOS: Record<string, string> = { '{nome_peca}': '{descricao}', '{tamanho}': '{grade}' }

// Fontes de impressora térmica. '0' é a escalável da Zebra (qualquer tamanho); A–H são bitmap internas (tamanho aproximado).
export const FONTES: { id: string; rotulo: string }[] = [
  { id: '0', rotulo: 'Escalável (0), recomendada' },
  { id: 'A', rotulo: 'A, bitmap pequena' }, { id: 'B', rotulo: 'B, bitmap' }, { id: 'D', rotulo: 'D, bitmap média' },
  { id: 'E', rotulo: 'E, OCR-B' }, { id: 'F', rotulo: 'F, bitmap grande' }, { id: 'G', rotulo: 'G, bitmap extra grande' },
]

export const substituir = (modelo: string | undefined, dados: Record<string, string>) => {
  let t = modelo ?? ''
  for (const [velho, novo] of Object.entries(SINONIMOS)) t = t.split(velho).join(novo)
  return VARIAVEIS.reduce((acc, v) => acc.split(v.chave).join(dados[v.chave] ?? v.exemplo), t)
}

export const novoId = () => Math.random().toString(36).slice(2, 9)

export function novoElemento(tipo: TipoElemento, larguraMm: number, alturaMm: number): Elemento {
  const base = { id: novoId(), rot: 0 as const, x: 2, y: 2 }
  switch (tipo) {
    case 'texto': return { ...base, tipo, w: Math.min(40, larguraMm - 4), h: 6, valor: '{descricao}', fonte: '0', tam_pt: 10, negrito: false, alinh: 'L', linhas: 1 }
    case 'barras': return { ...base, tipo, w: Math.min(50, larguraMm - 4), h: 8, valor: '{codigo_unidade}', mostrar_texto: true, modulo: 2 }
    case 'qr': return { ...base, tipo, w: 20, h: 20, valor: '{codigo_unidade}' }
    case 'linha': return { ...base, tipo, y: alturaMm / 2, w: larguraMm - 4, h: 0, espessura: 0.3 }
    case 'retangulo': return { ...base, tipo, w: 20, h: 10, espessura: 0.3 }
    default: return { ...base, tipo: 'imagem', w: 15, h: 15 }
  }
}

// Mesmo desenho que o banco gera quando não há layout (60 x 40 mm), para o usuário partir de algo que já funciona.
export function layoutPadrao(larguraMm: number, alturaMm: number): Layout {
  const sx = larguraMm / 60, sy = alturaMm / 40, s = Math.min(sx, sy)
  const el = (e: Omit<Elemento, 'id' | 'rot'>): Elemento => ({ id: novoId(), rot: 0, ...e, x: e.x * sx, y: e.y * sy, w: e.w * sx, h: e.h * sy })
  return {
    versao: 1,
    elementos: [
      el({ tipo: 'qr', x: 2, y: 2, w: 22, h: 22, valor: '{codigo_unidade}' }),
      el({ tipo: 'texto', x: 23.75, y: 2, w: 34, h: 14, valor: '{numero_curto}', fonte: '0', tam_pt: Math.round(23 * s), negrito: true, alinh: 'C', linhas: 1 }),
      el({ tipo: 'texto', x: 23.75, y: 16, w: 34, h: 4, valor: 'TAM {grade}', fonte: '0', tam_pt: Math.round(9 * s), alinh: 'C', linhas: 1 }),
      el({ tipo: 'texto', x: 23.75, y: 20.5, w: 34, h: 4, valor: 'R$ {preco}', fonte: '0', tam_pt: Math.round(9 * s), alinh: 'C', linhas: 1 }),
      el({ tipo: 'texto', x: 2, y: 25.5, w: 56, h: 6, valor: '{descricao}', fonte: '0', tam_pt: Math.round(7 * s), alinh: 'L', linhas: 2 }),
      el({ tipo: 'barras', x: 2, y: 33, w: 56, h: 4, valor: '{codigo_unidade}', mostrar_texto: true, modulo: 2 }),
    ],
  }
}

// ---------------------------------------------------------------- Imagem -> bitmap 1 bit (limiar ou Floyd-Steinberg)
export async function imagemParaBitmap(img: HTMLImageElement, larguraMm: number, alturaMm: number, dpi: number, pontilhado: boolean, limiar = 140): Promise<Bitmap> {
  const w = Math.max(8, Math.round((larguraMm * dpi) / 25.4))
  const h = Math.max(1, Math.round((alturaMm * dpi) / 25.4))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h)
  const px = g.getImageData(0, 0, w, h).data
  const cinza = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) cinza[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
  const preto = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = cinza[i], novo = v < (pontilhado ? 128 : limiar) ? 0 : 255
    preto[i] = novo === 0 ? 1 : 0
    if (pontilhado) {
      const err = v - novo
      if (x + 1 < w) cinza[i + 1] += (err * 7) / 16
      if (y + 1 < h) { if (x > 0) cinza[i + w - 1] += (err * 3) / 16; cinza[i + w] += (err * 5) / 16; if (x + 1 < w) cinza[i + w + 1] += err / 16 }
    }
  }
  const bpr = Math.ceil(w / 8), bytes = new Uint8Array(bpr * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (preto[y * w + x]) bytes[y * bpr + (x >> 3)] |= 0x80 >> (x & 7)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { w, h, d: btoa(bin) }
}

export function bitmapParaDataUrl(b: Bitmap): string {
  const bin = atob(b.d), bpr = Math.ceil(b.w / 8)
  const c = document.createElement('canvas'); c.width = b.w; c.height = b.h
  const g = c.getContext('2d')!, im = g.createImageData(b.w, b.h)
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const on = (bin.charCodeAt(y * bpr + (x >> 3)) & (0x80 >> (x & 7))) !== 0, o = (y * b.w + x) * 4
    im.data[o] = im.data[o + 1] = im.data[o + 2] = on ? 0 : 255; im.data[o + 3] = 255
  }
  g.putImageData(im, 0, 0)
  return c.toDataURL('image/png')
}
