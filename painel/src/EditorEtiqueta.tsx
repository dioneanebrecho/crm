import { useEffect, useMemo, useRef, useState } from 'react'
import { apiImpressao, type Modelo } from './apiImpressao'
import { code128Svg, qrSvg } from './etiquetas'
import {
  FONTES, VARIAVEIS, bitmapParaDataUrl, imagemParaBitmap, layoutPadrao, novoElemento, substituir,
  type Elemento, type Layout, type TipoElemento,
} from './etiquetaLayout'
import type { Contexto } from './App'

const PX_MM = 8 // 60 x 40 mm = 480 x 320 px na tela
const SNAP = 0.5
const arred = (v: number) => Math.round(v / SNAP) * SNAP
const num = (v: string, min: number, max: number, pad: number) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : pad }
const NOMES: Record<TipoElemento, string> = { texto: 'Texto', barras: 'Código de barras', qr: 'QR code', imagem: 'Imagem', linha: 'Linha', retangulo: 'Retângulo' }

type Arrasto = { id: string; modo: 'mover' | 'redim'; x0: number; y0: number; ex: number; ey: number; ew: number; eh: number }

export default function EditorEtiqueta({ ctx, atual, onFechar, onSalvo }: { ctx: Contexto; atual: Modelo | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(atual?.nome ?? '')
  const [w, setW] = useState(atual?.largura_mm ?? 60)
  const [h, setH] = useState(atual?.altura_mm ?? 40)
  const [padrao, setPadrao] = useState(atual?.padrao ?? false)
  const [ativo, setAtivo] = useState(atual?.ativo ?? true)
  const [els, setEls] = useState<Elemento[]>(() => atual?.opcoes.layout?.elementos ?? layoutPadrao(atual?.largura_mm ?? 60, atual?.altura_mm ?? 40).elementos)
  const [sel, setSel] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pontilhado, setPontilhado] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const arrasto = useRef<Arrasto | null>(null)
  const fontes = useRef<Map<string, HTMLImageElement>>(new Map())
  const escala = PX_MM * zoom
  const el = els.find((e) => e.id === sel) ?? null

  const alterar = (id: string, p: Partial<Elemento>) => setEls((l) => l.map((e) => (e.id === id ? { ...e, ...p } : e)))
  const remover = (id: string) => { setEls((l) => l.filter((e) => e.id !== id)); setSel(null) }
  const duplicar = (id: string) => setEls((l) => { const o = l.find((e) => e.id === id); if (!o) return l; const c = { ...o, id: Math.random().toString(36).slice(2, 9), x: o.x + 2, y: o.y + 2 }; setSel(c.id); return [...l, c] })
  const inserirVariavel = (chave: string) => {
    if (el && (el.tipo === 'texto' || el.tipo === 'barras' || el.tipo === 'qr')) { alterar(el.id, { valor: (el.valor ?? '') + chave }); return }
    const e = { ...novoElemento('texto', w, h), valor: chave }; setEls((l) => [...l, e]); setSel(e.id)
  }
  const adicionar = (t: TipoElemento) => { const e = novoElemento(t, w, h); setEls((l) => [...l, e]); setSel(e.id); if (t === 'imagem') escolherImagem(e.id) }

  // ---- arrastar e redimensionar com o mouse (ou dedo)
  const iniciar = (ev: React.PointerEvent, e: Elemento, modo: Arrasto['modo']) => {
    ev.stopPropagation(); (ev.target as Element).setPointerCapture?.(ev.pointerId)
    setSel(e.id); arrasto.current = { id: e.id, modo, x0: ev.clientX, y0: ev.clientY, ex: e.x, ey: e.y, ew: e.w, eh: e.h }
  }
  const mover = (ev: React.PointerEvent) => {
    const a = arrasto.current; if (!a) return
    const dx = (ev.clientX - a.x0) / escala, dy = (ev.clientY - a.y0) / escala
    if (a.modo === 'mover') alterar(a.id, { x: Math.max(0, Math.min(w - 1, arred(a.ex + dx))), y: Math.max(0, Math.min(h - 1, arred(a.ey + dy))) })
    else alterar(a.id, { w: Math.max(1, arred(a.ew + dx)), h: Math.max(0, arred(a.eh + dy)) })
  }
  const soltar = () => { arrasto.current = null }
  const teclas = (ev: React.KeyboardEvent) => {
    if (!el || (ev.target as HTMLElement).closest('input,select,textarea')) return
    const d = ev.shiftKey ? 2 : SNAP
    if (ev.key === 'Delete' || ev.key === 'Backspace') { remover(el.id); ev.preventDefault() }
    else if (ev.key === 'ArrowLeft') { alterar(el.id, { x: Math.max(0, el.x - d) }); ev.preventDefault() }
    else if (ev.key === 'ArrowRight') { alterar(el.id, { x: el.x + d }); ev.preventDefault() }
    else if (ev.key === 'ArrowUp') { alterar(el.id, { y: Math.max(0, el.y - d) }); ev.preventDefault() }
    else if (ev.key === 'ArrowDown') { alterar(el.id, { y: el.y + d }); ev.preventDefault() }
  }

  // ---- imagem: lê o arquivo, ajusta a proporção e gera o bitmap 1 bit para 203 e 300 dpi
  const converter = async (id: string, img: HTMLImageElement, lw: number, lh: number) => {
    const [b203, b300] = await Promise.all([imagemParaBitmap(img, lw, lh, 203, pontilhado), imagemParaBitmap(img, lw, lh, 300, pontilhado)])
    alterar(id, { b203, b300 })
  }
  const escolherImagem = (id: string) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/svg+xml'
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return
      if (f.size > 2_000_000) { setErro('Imagem acima de 2 MB. Use um arquivo menor.'); return }
      const url = URL.createObjectURL(f), img = new Image()
      img.onload = async () => {
        fontes.current.set(id, img)
        const lw = Math.min(30, w - 2), lh = lw * (img.naturalHeight / img.naturalWidth)
        alterar(id, { w: lw, h: Math.min(lh, h - 2), nome_arquivo: f.name })
        await converter(id, img, lw, Math.min(lh, h - 2))
      }
      img.src = url
    }
    inp.click()
  }
  // Redimensionou a imagem: refaz o bitmap no tamanho novo (usa o arquivo original da sessão ou o próprio bitmap salvo).
  useEffect(() => {
    const t = setTimeout(async () => {
      for (const e of els) {
        if (e.tipo !== 'imagem' || !e.b203) continue
        const px = Math.round((e.w * 203) / 25.4), py = Math.round((e.h * 203) / 25.4)
        if (Math.abs(px - e.b203.w) <= 1 && Math.abs(py - e.b203.h) <= 1) continue
        let img = fontes.current.get(e.id)
        if (!img) { img = new Image(); img.src = bitmapParaDataUrl(e.b300 ?? e.b203); await img.decode().catch(() => null); fontes.current.set(e.id, img) }
        await converter(e.id, img, e.w, e.h)
      }
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [els.map((e) => (e.tipo === 'imagem' ? `${e.id}:${e.w}:${e.h}` : '')).join('|')])

  const salvar = async () => {
    setErro(null)
    if (!nome.trim()) { setErro('Informe o nome do modelo.'); return }
    const fora = els.find((e) => e.x + e.w > w + 0.01 || e.y + e.h > h + 0.01)
    if (fora && !confirm(`O elemento "${NOMES[fora.tipo]}" passa da borda da etiqueta e será cortado na impressão. Salvar assim mesmo?`)) return
    setSalvando(true)
    try {
      const layout: Layout = { versao: 1, elementos: els }
      await apiImpressao.salvarModelo(ctx.empresa, atual?.id ?? null, { nome, largura_mm: w, altura_mm: h, opcoes: { ...(atual?.opcoes ?? {}), layout }, padrao, ativo })
      onSalvo()
    } catch (x) { setErro((x as Error).message) } finally { setSalvando(false) }
  }

  const dados = useMemo(() => Object.fromEntries(VARIAVEIS.map((v) => [v.chave, v.exemplo])), [])

  return (
    <div className="editor-etq" onKeyDown={teclas} tabIndex={0}>
      <div className="editor-topo">
        <label className="campo"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Etiqueta de peça 60×40" /></label>
        <label className="campo"><span>Largura (mm)</span><input type="number" min={20} max={120} step="0.5" value={w} onChange={(e) => setW(num(e.target.value, 20, 120, 60))} /></label>
        <label className="campo"><span>Altura (mm)</span><input type="number" min={15} max={100} step="0.5" value={h} onChange={(e) => setH(num(e.target.value, 15, 100, 40))} /></label>
        <label className="campo"><span>Zoom</span><input type="range" min={0.6} max={1.6} step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <label className="campo marca"><span><input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} /> Padrão da empresa</span></label>
        <label className="campo marca"><span><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo</span></label>
      </div>

      <div className="editor-corpo">
        <div className="editor-paleta">
          <strong>Adicionar</strong>
          {(['texto', 'barras', 'qr', 'imagem', 'linha', 'retangulo'] as TipoElemento[]).map((t) => <button key={t} type="button" className="sec" onClick={() => adicionar(t)}>{NOMES[t]}</button>)}
          <hr />
          <strong>Variáveis</strong>
          <small className="mudo">Clique para inserir no elemento selecionado ou criar um texto novo.</small>
          {VARIAVEIS.map((v) => <button key={v.chave} type="button" className="sec" title={`Exemplo: ${v.exemplo}`} onClick={() => inserirVariavel(v.chave)}>{v.rotulo}</button>)}
          <hr />
          <button type="button" className="sec" onClick={() => { if (confirm('Substituir o desenho atual pelo layout padrão?')) { setEls(layoutPadrao(w, h).elementos); setSel(null) } }}>Layout padrão</button>
          <label className="campo marca"><span><input type="checkbox" checked={pontilhado} onChange={(e) => setPontilhado(e.target.checked)} /> Imagem com pontilhado (fotos)</span></label>
          <small className="mudo">Setas movem 0,5 mm (Shift = 2 mm). Delete remove.</small>
        </div>

        <div className="editor-area">
          <div className="editor-regua-h" style={{ width: w * escala }}>{Array.from({ length: Math.floor(w / 10) + 1 }, (_, i) => <span key={i} style={{ left: i * 10 * escala }}>{i * 10}</span>)}</div>
          <div className="editor-tela" style={{ width: w * escala, height: h * escala, backgroundSize: `${5 * escala}px ${5 * escala}px` }}
               onPointerMove={mover} onPointerUp={soltar} onPointerLeave={soltar} onPointerDown={() => setSel(null)}>
            {els.map((e) => <ElementoVisual key={e.id} e={e} escala={escala} dados={dados} ativo={e.id === sel} onIniciar={iniciar} />)}
          </div>
          <small className="mudo">{w} × {h} mm. Pré-visualização com dados de exemplo; a impressora usa as fontes internas dela, então confira com uma impressão de teste.</small>
        </div>

        <div className="editor-props">
          {!el && <p className="mudo">Selecione um elemento para editar posição, tamanho, fonte e conteúdo.</p>}
          {el && (
            <>
              <strong>{NOMES[el.tipo]}</strong>
              <div className="grade-2">
                <label className="campo"><span>X (mm)</span><input type="number" step="0.5" value={el.x} onChange={(e) => alterar(el.id, { x: num(e.target.value, 0, w, 0) })} /></label>
                <label className="campo"><span>Y (mm)</span><input type="number" step="0.5" value={el.y} onChange={(e) => alterar(el.id, { y: num(e.target.value, 0, h, 0) })} /></label>
                <label className="campo"><span>Largura (mm)</span><input type="number" step="0.5" value={el.w} onChange={(e) => alterar(el.id, { w: num(e.target.value, 1, w, 10) })} /></label>
                {el.tipo !== 'texto' && el.tipo !== 'qr' && <label className="campo"><span>Altura (mm)</span><input type="number" step="0.5" value={el.h} onChange={(e) => alterar(el.id, { h: num(e.target.value, 0, h, 5) })} /></label>}
              </div>
              {el.tipo !== 'linha' && el.tipo !== 'retangulo' && (
                <label className="campo"><span>Rotação</span>
                  <select value={el.rot} onChange={(e) => alterar(el.id, { rot: Number(e.target.value) as Elemento['rot'] })}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select>
                </label>
              )}
              {(el.tipo === 'texto' || el.tipo === 'barras' || el.tipo === 'qr') && (
                <label className="campo"><span>Conteúdo</span>
                  <input value={el.valor ?? ''} onChange={(e) => alterar(el.id, { valor: e.target.value })} />
                  <div className="chips">{VARIAVEIS.map((v) => <button key={v.chave} type="button" className="chip" onClick={() => alterar(el.id, { valor: (el.valor ?? '') + v.chave })}>{v.rotulo}</button>)}</div>
                </label>
              )}
              {el.tipo === 'texto' && (
                <>
                  <label className="campo"><span>Fonte</span><select value={el.fonte ?? '0'} onChange={(e) => alterar(el.id, { fonte: e.target.value })}>{FONTES.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}</select></label>
                  <div className="grade-2">
                    <label className="campo"><span>Tamanho (pt)</span><input type="number" min={4} max={120} value={el.tam_pt ?? 10} onChange={(e) => alterar(el.id, { tam_pt: num(e.target.value, 4, 120, 10) })} /></label>
                    <label className="campo"><span>Linhas</span><input type="number" min={1} max={6} value={el.linhas ?? 1} onChange={(e) => alterar(el.id, { linhas: num(e.target.value, 1, 6, 1) })} /></label>
                  </div>
                  <label className="campo"><span>Alinhamento</span><select value={el.alinh ?? 'L'} onChange={(e) => alterar(el.id, { alinh: e.target.value as Elemento['alinh'] })}><option value="L">Esquerda</option><option value="C">Centro</option><option value="R">Direita</option></select></label>
                  <label className="campo marca"><span><input type="checkbox" checked={!!el.negrito} onChange={(e) => alterar(el.id, { negrito: e.target.checked })} /> Negrito (sobreposição)</span></label>
                </>
              )}
              {el.tipo === 'barras' && (
                <>
                  <label className="campo"><span>Espessura da barra (1 a 4)</span><input type="number" min={1} max={4} step="0.5" value={el.modulo ?? 2} onChange={(e) => alterar(el.id, { modulo: num(e.target.value, 1, 4, 2) })} /></label>
                  <label className="campo marca"><span><input type="checkbox" checked={el.mostrar_texto !== false} onChange={(e) => alterar(el.id, { mostrar_texto: e.target.checked })} /> Mostrar o número sob as barras</span></label>
                </>
              )}
              {(el.tipo === 'linha' || el.tipo === 'retangulo') && <label className="campo"><span>Espessura (mm)</span><input type="number" min={0.1} max={3} step="0.1" value={el.espessura ?? 0.3} onChange={(e) => alterar(el.id, { espessura: num(e.target.value, 0.1, 3, 0.3) })} /></label>}
              {el.tipo === 'imagem' && (
                <>
                  <button type="button" className="sec" onClick={() => escolherImagem(el.id)}>{el.b203 ? 'Trocar imagem' : 'Escolher imagem'}</button>
                  <small className="mudo">{el.nome_arquivo ?? ''} Convertida para preto e branco em 203 e 300 dpi.</small>
                </>
              )}
              <div className="acoes" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="sec" onClick={() => duplicar(el.id)}>Duplicar</button>
                <button type="button" className="sec" onClick={() => remover(el.id)}>Remover</button>
              </div>
            </>
          )}
        </div>
      </div>

      {erro && <div className="erro">{erro}</div>}
      <div className="acoes">
        <button type="button" className="sec" onClick={onFechar}>Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar modelo'}</button>
      </div>
    </div>
  )
}

function ElementoVisual({ e, escala, dados, ativo, onIniciar }: { e: Elemento; escala: number; dados: Record<string, string>; ativo: boolean; onIniciar: (ev: React.PointerEvent, e: Elemento, m: Arrasto['modo']) => void }) {
  const alt = e.tipo === 'linha' ? Math.max(e.h, e.espessura ?? 0.3) : e.tipo === 'texto' ? Math.max(e.h, ((e.tam_pt ?? 10) * 0.3528 * 1.15) * (e.linhas ?? 1)) : e.tipo === 'qr' ? e.w : e.h
  const estilo: React.CSSProperties = { left: e.x * escala, top: e.y * escala, width: e.w * escala, height: Math.max(alt * escala, 4), transform: e.rot ? `rotate(${e.rot}deg)` : undefined, transformOrigin: 'top left' }
  const valor = substituir(e.valor, dados)
  let corpo: React.ReactNode = null
  if (e.tipo === 'texto') {
    corpo = <div className="el-texto" style={{ fontSize: (e.tam_pt ?? 10) * 0.3528 * escala, fontWeight: e.negrito ? 700 : 400, textAlign: e.alinh === 'C' ? 'center' : e.alinh === 'R' ? 'right' : 'left', fontFamily: e.fonte && e.fonte !== '0' ? 'ui-monospace, monospace' : 'Helvetica, Arial, sans-serif', WebkitLineClamp: e.linhas ?? 1 }}>{valor}</div>
  } else if (e.tipo === 'barras') {
    corpo = <div className="el-barras"><div dangerouslySetInnerHTML={{ __html: code128Svg(valor || ' ') }} style={{ height: e.mostrar_texto !== false ? '78%' : '100%' }} />{e.mostrar_texto !== false && <small style={{ fontSize: Math.max(6, e.h * escala * 0.18) }}>{valor}</small>}</div>
  } else if (e.tipo === 'qr') {
    corpo = <div className="el-qr" dangerouslySetInnerHTML={{ __html: qrSvg(valor || ' ') }} />
  } else if (e.tipo === 'imagem') {
    corpo = e.b300 || e.b203 ? <img src={bitmapParaDataUrl((e.b300 ?? e.b203)!)} alt="" draggable={false} style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} /> : <div className="el-vazio">Imagem</div>
  } else if (e.tipo === 'linha') {
    corpo = <div style={{ background: '#000', height: Math.max((e.espessura ?? 0.3) * escala, 1), width: '100%' }} />
  } else {
    corpo = <div style={{ border: `${Math.max((e.espessura ?? 0.3) * escala, 1)}px solid #000`, width: '100%', height: '100%', boxSizing: 'border-box' }} />
  }
  return (
    <div className={`el-etq${ativo ? ' ativo' : ''}`} style={estilo} onPointerDown={(ev) => onIniciar(ev, e, 'mover')}>
      {corpo}
      {ativo && <span className="el-alca" onPointerDown={(ev) => onIniciar(ev, e, 'redim')} />}
    </div>
  )
}
