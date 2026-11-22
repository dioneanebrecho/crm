import qrcode from 'qrcode-generator'

// ---------------------------------------------------------------- QR code
// O QR de cada unidade carrega o código único da unidade (ex.: VES-001-P-001), que é único por empresa.
// Quando houver a página pública da peça, defina VITE_URL_PUBLICA_PECA (ex.: https://loja.exemplo.com.br/p) e o QR passa a
// apontar para `${base}/${codigo}`; sem a variável, o QR leva só o código (serve para bipar no painel e no app).
const BASE_PUBLICA = (import.meta.env.VITE_URL_PUBLICA_PECA as string | undefined)?.replace(/\/+$/, '') || ''

export const conteudoQr = (codigo: string) => (BASE_PUBLICA ? `${BASE_PUBLICA}/${encodeURIComponent(codigo)}` : codigo)
export const qrApontaParaUrl = BASE_PUBLICA !== ''

export function qrSvg(texto: string): string {
  const q = qrcode(0, 'M')
  q.addData(texto, 'Byte')
  q.make()
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
}

// ---------------------------------------------------------------- Código de barras Code 128 (subconjunto B: ASCII 32 a 126)
const PADROES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132',
  '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212',
  '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311',
  '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113',
  '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104
const STOP = 106

export function code128Modulos(texto: string): string {
  const limpo = [...texto].map((c) => (c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126 ? c : '-')).join('')
  const valores = [START_B, ...[...limpo].map((c) => c.charCodeAt(0) - 32)]
  const soma = valores.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0)
  valores.push(soma % 103, STOP)
  return valores.map((v) => PADROES[v]).join('')
}

export function code128Svg(texto: string): string {
  const larguras = code128Modulos(texto)
  const quieta = 10
  let x = quieta
  let barras = ''
  for (let i = 0; i < larguras.length; i++) {
    const w = Number(larguras[i])
    if (i % 2 === 0) barras += `<rect x="${x}" y="0" width="${w}" height="50"/>`
    x += w
  }
  const total = x + quieta
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 50" preserveAspectRatio="none" fill="#000" shape-rendering="crispEdges"><rect width="${total}" height="50" fill="#fff"/>${barras}</svg>`
}

// ---------------------------------------------------------------- Componentes
export function Qr({ valor, tam = 120 }: { valor: string; tam?: number }) {
  return <div className="qr-caixa" style={{ width: tam, height: tam }} role="img" aria-label={`QR code da unidade ${valor}`} dangerouslySetInnerHTML={{ __html: qrSvg(conteudoQr(valor)) }} />
}

export function Barras({ valor, largura = 180, altura = 44 }: { valor: string; largura?: number; altura?: number }) {
  return <div className="barras-caixa" style={{ width: largura, height: altura }} role="img" aria-label={`Código de barras ${valor}`} dangerouslySetInnerHTML={{ __html: code128Svg(valor) }} />
}

// ---------------------------------------------------------------- Impressão de etiquetas
export interface Etiqueta { codigo: string; titulo: string; tamanho: string; preco: string | null; marca: string | null }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

// Abre uma janela só com as etiquetas (60 x 40 mm, uma por página) e dispara a impressão. Funciona com impressora térmica
// (escolher o tamanho 60x40 no diálogo) e com folha A4 comum.
export function imprimirEtiquetas(etiquetas: Etiqueta[]): boolean {
  const w = window.open('', '_blank', 'width=720,height=800')
  if (!w) return false
  const itens = etiquetas.map((e) => `
    <div class="et">
      <div class="topo"><div class="qr">${qrSvg(conteudoQr(e.codigo))}</div>
        <div class="txt"><b class="nome">${esc(e.titulo)}</b>${e.marca ? `<span>${esc(e.marca)}</span>` : ''}
          <span class="tam">Tam. ${esc(e.tamanho)}</span>${e.preco ? `<b class="preco">${esc(e.preco)}</b>` : ''}</div></div>
      <div class="barras">${code128Svg(e.codigo)}</div>
      <div class="cod">${esc(e.codigo)}</div>
    </div>`).join('')
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page { size: 60mm 40mm; margin: 0 }
    * { box-sizing: border-box } body { margin: 0; font-family: system-ui, sans-serif; color: #000 }
    .et { width: 60mm; height: 40mm; padding: 2mm 3mm; page-break-after: always; display: flex; flex-direction: column; gap: 1mm; overflow: hidden }
    .topo { display: flex; gap: 2mm; align-items: flex-start; height: 21mm } .qr { width: 20mm; height: 20mm; flex: none } .qr svg { width: 100%; height: 100% }
    .txt { display: flex; flex-direction: column; font-size: 7pt; line-height: 1.2; min-width: 0 } .nome { font-size: 8pt; max-height: 9.5mm; overflow: hidden }
    .tam { font-weight: 700; font-size: 9pt } .preco { font-size: 11pt; margin-top: auto }
    .barras { height: 10mm } .barras svg { width: 100%; height: 100% } .cod { text-align: center; font: 700 8pt monospace; letter-spacing: .5px }
    @media screen { body { background: #eee; padding: 8px } .et { background: #fff; margin: 0 auto 8px; box-shadow: 0 1px 4px #0003 } }
  </style></head><body>${itens}<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script></body></html>`)
  w.document.close()
  return true
}
