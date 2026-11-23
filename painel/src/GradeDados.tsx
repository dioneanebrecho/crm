import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PEvt, type ReactNode } from 'react'

// GradeDados: tabela padrão do painel (ver claude/padrao-tabelas-grade-dados.md).
// Compacta, com filtro por coluna estilo Excel (lista de valores com multisseleção e busca; em colunas de valor aceita > < = também),
// ordenação ao clicar no título, colunas reordenáveis por arrastar, e "fixar até aqui" (congela a coluna
// e todas à esquerda dela, como o congelar painéis do Excel). Ordem e fixação ficam salvas por tabela (`id`)
// neste navegador. Toda tabela nova de listagem deve usar este componente.

export interface Coluna<T> {
  id: string
  titulo: string
  /** texto exibido; também é o texto usado no filtro */
  texto: (l: T) => string
  /** valor para ordenar e para filtros numéricos (>, <, >=, <=, =); padrão: o texto */
  valor?: (l: T) => number | string | null
  render?: (l: T) => ReactNode
  direita?: boolean
  /** totaliza a coluna (tela, Excel e PDF). Padrão: sim para coluna numérica alinhada à direita; use false para desligar */
  somar?: boolean
  /** formata o total (padrão: número pt-BR com 2 casas) */
  formatar?: (n: number) => string
  /** largura inicial em px (padrão: calculada pelo conteúdo, até `max`) */
  largura?: number
  /** teto da largura calculada automaticamente (padrão 260) */
  max?: number
  /** colunas escondidas por padrão ficam acessíveis em "Colunas" */
  oculta?: boolean
}

interface Prefs { ordem: string[]; fixarAte: number | null; ocultas: string[]; larguras: Record<string, number> }

const CSS = `
.gd { --gd-ac: var(--g1, #3987e5); }
.gd-barra { display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:space-between; margin:0 0 6px; font-size:.8rem; color: var(--mudo); }
.gd-barra .acoes { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.gd-barra button { background: var(--card2); color: var(--txt); border:1px solid var(--borda); border-radius:8px; padding:.2rem .6rem; font-size:.78rem; font-weight:600; cursor:pointer; }
.gd-barra button:hover { border-color: var(--gd-ac); }
.gd-barra button.ico { padding:.15rem .45rem; font-size:.95rem; line-height:1; opacity:.7; }
.gd-barra button.ico:hover:not(:disabled) { opacity:1; }
.gd-barra button:disabled { opacity:.35; cursor:default; }
.gd-wrap { overflow:auto; max-height: var(--gd-alt, 58vh); border:1px solid var(--borda); border-radius:10px; background: var(--card); position:relative; }
.gd table { border-collapse:separate; border-spacing:0; border:0; table-layout:fixed; }
.gd th, .gd td { padding:.32rem .6rem; font-size:.84rem; line-height:1.25; border-bottom:1px solid var(--borda); text-align:left; white-space:nowrap; background: var(--card); vertical-align:middle; }
.gd td { overflow:hidden; text-overflow:ellipsis; }
.gd .res { position:absolute; top:0; right:-3px; width:8px; height:100%; cursor:col-resize; z-index:6; touch-action:none; }
.gd .res:hover, .gd .res.on { background: var(--gd-ac); opacity:.55; }
.gd td.d, .gd th.d { text-align:right; font-variant-numeric: tabular-nums; }
.gd thead th { position:sticky; top:0; z-index:3; background: var(--card2); text-transform:none; letter-spacing:0; padding:.4rem .6rem; vertical-align:middle; }
.gd .fixa { position:sticky; z-index:2; }
.gd thead .fixa { z-index:5; }
.gd .fixa-fim { box-shadow: 2px 0 0 0 var(--borda), 6px 0 8px -6px rgba(0,0,0,.5); }
.gd tfoot td.tot { position:sticky; bottom:0; z-index:3; background: var(--card2); font-weight:700; border-top:2px solid var(--borda); border-bottom:0; }
.gd tfoot td.tot.fixa { z-index:5; }
.gd tbody tr:hover td { background: var(--card2); }
.gd .cab { display:flex; align-items:center; gap:4px; cursor:grab; user-select:none; font-size:.7rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color: var(--mudo); }
.gd .cab:active { cursor:grabbing; }
.gd .cab .tit { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; text-align:inherit; background:none; border:0; padding:0; color:inherit; font:inherit; letter-spacing:inherit; text-transform:inherit; cursor:pointer; white-space:nowrap; }
.gd .cab .pin { background:none; border:0; padding:0 2px; cursor:pointer; color: var(--mudo); font-size:.8rem; opacity:.55; }
.gd .cab .pin:hover, .gd .cab .pin.on { opacity:1; color: var(--gd-ac); }
.gd th.alvo { box-shadow: inset 3px 0 0 0 var(--gd-ac); }
.gd .cab .fil { background:none; border:0; padding:0 2px; cursor:pointer; color: var(--mudo); font-size:.78rem; opacity:.6; }
.gd .cab .fil:hover, .gd .cab .fil.on { opacity:1; color: var(--gd-ac); }
.gd-pop { position:fixed; z-index:1000; width:250px; background: var(--card2, #2a2a33); color: var(--txt); border:1px solid var(--borda); border-radius:10px; padding:8px; box-shadow:0 16px 36px -10px rgba(0,0,0,.6); font-size:.82rem; text-transform:none; letter-spacing:0; font-weight:400; }
.gd-pop input[type=search] { width:100%; box-sizing:border-box; background: var(--card); color: var(--txt); border:1px solid var(--borda); border-radius:6px; padding:.3rem .5rem; font-size:.82rem; }
.gd-pop input[type=search]:focus { outline:none; border-color: var(--gd-ac); }
.gd-pop .lista { max-height:240px; overflow:auto; margin:6px 0; border:1px solid var(--borda); border-radius:6px; background: var(--card); padding:2px 0; }
.gd-pop label { display:flex; gap:6px; align-items:center; padding:.18rem .5rem; cursor:pointer; }
.gd-pop label:hover { background: var(--card2); }
.gd-pop label .v { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.gd-pop label .n { color: var(--mudo); font-size:.72rem; }
.gd-pop .rod { display:flex; justify-content:space-between; gap:6px; }
.gd-pop button { background: var(--card); color: var(--txt); border:1px solid var(--borda); border-radius:6px; padding:.2rem .55rem; font-size:.76rem; font-weight:600; cursor:pointer; }
.gd-pop button:hover { border-color: var(--gd-ac); }
.gd-pop .expr { width:100%; margin:4px 0 0; text-align:left; }
.gd-pop .nota { color: var(--mudo); font-size:.72rem; margin:2px 2px 0; }
.gd .vazio-gd { padding:18px; text-align:center; color: var(--mudo); font-size:.86rem; }
.gd .cols { position:relative; display:inline-block; }
.gd .cols-menu { position:absolute; right:0; top:100%; z-index:20; background: var(--card2); border:1px solid var(--borda); border-radius:10px; padding:8px 10px; min-width:170px; box-shadow:0 12px 28px -10px rgba(0,0,0,.55); display:flex; flex-direction:column; gap:4px; }
.gd .cols-menu label { display:flex; gap:6px; align-items:center; font-size:.82rem; color: var(--txt); }
`

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function lerPrefs(id: string): Partial<Prefs> {
  try { return JSON.parse(localStorage.getItem(`ane.grade.${id}`) ?? '{}') as Partial<Prefs> } catch { return {} }
}
function gravarPrefs(id: string, p: Prefs) { try { localStorage.setItem(`ane.grade.${id}`, JSON.stringify(p)) } catch { /* sem armazenamento */ } }

// filtros numéricos: ">100", "<=50", "=10"; qualquer outro texto filtra por "contém" (sem acento, sem caixa)
function passa<T>(c: Coluna<T>, l: T, f: string): boolean {
  const q = f.trim()
  if (!q) return true
  const m = /^(>=|<=|>|<|=)\s*(-?[\d.,]+)$/.exec(q)
  if (m && c.valor) {
    const alvo = Number(m[2].replace(/\./g, '').replace(',', '.'))
    const v = c.valor(l)
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(alvo) && Number.isFinite(n)) {
      return m[1] === '>' ? n > alvo : m[1] === '<' ? n < alvo : m[1] === '>=' ? n >= alvo : m[1] === '<=' ? n <= alvo : n === alvo
    }
  }
  return norm(c.texto(l)).includes(norm(q))
}


const REGEX_EXPR = /^(>=|<=|>|<|=)\s*(-?[\d.,]+)$/

function FiltroColuna<T>({ c, linhas, sel, expr, onSel, onExpr }: {
  c: Coluna<T>; linhas: T[]; sel: string[] | undefined; expr: string | undefined
  onSel: (v: string[] | undefined) => void; onExpr: (v: string | undefined) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const ativo = sel !== undefined || !!expr

  useEffect(() => {
    if (!aberto) return
    const fora = (e: Event) => { const t = e.target as Node; if (!box.current?.contains(t) && !btn.current?.contains(t)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false) } }
    const rola = (e: Event) => { if (!box.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc, true)
    window.addEventListener('scroll', rola, true)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc, true); window.removeEventListener('scroll', rola, true) }
  }, [aberto])

  const valores = useMemo(() => {
    if (!aberto) return []
    const m = new Map<string, number>()
    for (const l of linhas) { const t = c.texto(l); m.set(t, (m.get(t) ?? 0) + 1) }
    return [...m].map(([v, n]) => ({ v, n })).sort((a, b) => a.v.localeCompare(b.v, 'pt-BR', { numeric: true }))
  }, [aberto, linhas, c])
  const achados = busca ? valores.filter((x) => norm(x.v).includes(norm(busca))) : valores
  const lista = achados.slice(0, 300)
  const marcado = (v: string) => sel === undefined || sel.includes(v)
  const todosVis = lista.length > 0 && lista.every((x) => marcado(x.v))
  const exprBusca = c.valor ? REGEX_EXPR.exec(busca.trim()) : null

  function abrir() {
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 262)), y: Math.min(r.bottom + 4, window.innerHeight - 380 > 0 ? r.bottom + 4 : 8) })
    setBusca(''); setAberto((a) => !a)
  }
  function alternar(v: string) {
    const atual = sel ?? valores.map((x) => x.v)
    const novo = atual.includes(v) ? atual.filter((x) => x !== v) : [...atual, v]
    onSel(novo.length === valores.length ? undefined : novo)
  }
  function alternarTodos() {
    const vs = lista.map((x) => x.v)
    if (busca) { onSel(todosVis ? [] : vs); return }
    onSel(todosVis ? [] : undefined)
  }

  return (
    <>
      <button ref={btn} type="button" className={`fil${ativo ? ' on' : ''}`} onClick={abrir} aria-haspopup="dialog" aria-expanded={aberto}
        title={ativo ? 'Filtro ativo: clique para alterar' : 'Filtrar esta coluna'} aria-label={`Filtrar ${c.titulo}`}>{ativo ? '▼' : '▽'}</button>
      {aberto && (
        <div ref={box} className="gd-pop" role="dialog" aria-label={`Filtro de ${c.titulo}`} style={{ left: pos.x, top: pos.y }}>
          <input type="search" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={c.valor && c.direita ? 'Pesquisar ou digitar > 100' : 'Pesquisar'} aria-label={`Pesquisar em ${c.titulo}`} />
          {exprBusca && <button type="button" className="expr" onClick={() => { onExpr(busca.trim()); setAberto(false) }}>Filtrar valores {busca.trim()}</button>}
          {expr && <button type="button" className="expr" onClick={() => onExpr(undefined)}>Tirar filtro “{expr}” ✕</button>}
          <div className="lista" role="listbox" aria-multiselectable="true">
            <label><input type="checkbox" checked={todosVis} onChange={alternarTodos} /><span className="v"><b>{busca ? 'Selecionar resultados' : 'Selecionar tudo'}</b></span><span className="n">{achados.length}</span></label>
            {lista.map((x) => (
              <label key={x.v}><input type="checkbox" checked={marcado(x.v)} onChange={() => alternar(x.v)} /><span className="v" title={x.v}>{x.v || '(vazio)'}</span><span className="n">{x.n}</span></label>))}
            {lista.length === 0 && <div className="nota" style={{ padding: 8 }}>Nada encontrado.</div>}
          </div>
          {achados.length > lista.length && <p className="nota">Mostrando 300 de {achados.length}. Refine a busca.</p>}
          <div className="rod"><button type="button" onClick={() => { onSel(undefined); onExpr(undefined) }}>Limpar filtro</button><button type="button" onClick={() => setAberto(false)}>Fechar</button></div>
        </div>)}
    </>
  )
}

export default function GradeDados<T>({ id, titulo, colunas, linhas, chave, altura, vazio = 'Nenhum registro.' }: {
  id: string
  /** título usado no arquivo exportado e no PDF (padrão: id) */
  titulo?: string
  colunas: Coluna<T>[]
  linhas: T[]
  chave: (l: T) => string
  altura?: string
  vazio?: string
}) {
  const ids = useMemo(() => colunas.map((c) => c.id), [colunas])
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = lerPrefs(id)
    const ordem = [...(p.ordem ?? []).filter((x) => ids.includes(x)), ...ids.filter((x) => !(p.ordem ?? []).includes(x))]
    return { ordem, fixarAte: typeof p.fixarAte === 'number' && p.fixarAte < ordem.length ? p.fixarAte : null,
             ocultas: p.ocultas ?? colunas.filter((c) => c.oculta).map((c) => c.id), larguras: p.larguras ?? {} }
  })
  const [selecao, setSelecao] = useState<Record<string, string[] | undefined>>({})
  const [exprs, setExprs] = useState<Record<string, string | undefined>>({})
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null)
  const [arrasto, setArrasto] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [viva, setViva] = useState<{ id: string; w: number } | null>(null)

  const salvar = useCallback((p: Prefs) => { setPrefs(p); gravarPrefs(id, p) }, [id])
  const porId = useMemo(() => new Map(colunas.map((c) => [c.id, c])), [colunas])
  const visiveis = useMemo(() => prefs.ordem.filter((x) => !prefs.ocultas.includes(x) && porId.has(x)).map((x) => porId.get(x) as Coluna<T>), [prefs, porId])
  const fixarAte = prefs.fixarAte != null && prefs.fixarAte < visiveis.length ? prefs.fixarAte : null

  const filtradas = useMemo(() => {
    const ativos = visiveis.filter((c) => selecao[c.id] !== undefined || !!exprs[c.id])
    let r = ativos.length === 0 ? linhas : linhas.filter((l) => ativos.every((c) => {
      const sl = selecao[c.id]
      if (sl !== undefined && !sl.includes(c.texto(l))) return false
      const ex = exprs[c.id]
      return !ex || passa(c, l, ex)
    }))
    if (sort) {
      const c = porId.get(sort.id)
      if (c) {
        const v = (l: T) => (c.valor ? c.valor(l) : c.texto(l))
        r = [...r].sort((a, b) => {
          const x = v(a), y = v(b)
          if (x == null) return y == null ? 0 : 1
          if (y == null) return -1
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * sort.dir
        })
      }
    }
    return r
  }, [linhas, visiveis, selecao, exprs, sort, porId])

  const somaCol = useMemo(() => new Set(visiveis.filter((c) => c.somar ?? (!!c.direita && !!c.valor && linhas.slice(0, 20).some((l) => typeof c.valor?.(l) === 'number'))).map((c) => c.id)), [visiveis, linhas])
  const totais = useMemo(() => {
    const t: Record<string, number> = {}
    for (const c of visiveis) {
      if (!somaCol.has(c.id) || !c.valor) continue
      let a = 0
      for (const l of filtradas) { const v = c.valor(l); if (typeof v === 'number' && Number.isFinite(v)) a += v }
      t[c.id] = Math.round(a * 100) / 100
    }
    return t
  }, [visiveis, somaCol, filtradas])
  const fmtTot = (c: Coluna<T>) => (c.formatar ? c.formatar(totais[c.id]) : totais[c.id].toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  const colRotulo = visiveis.find((c) => !somaCol.has(c.id))?.id

  // largura inicial pelo conteúdo (título e primeiras linhas), até o teto da coluna
  const auto = useMemo(() => {
    const r: Record<string, number> = {}
    for (const c of colunas) {
      let m = c.titulo.length * 8 + 62
      for (const l of linhas.slice(0, 60)) m = Math.max(m, c.texto(l).length * 7.4 + 22)
      r[c.id] = Math.round(Math.min(c.max ?? 260, Math.max(64, m)))
    }
    return r
  }, [colunas, linhas])
  const larg = (c: Coluna<T>) => (viva?.id === c.id ? viva.w : prefs.larguras[c.id] ?? c.largura ?? auto[c.id] ?? 120)
  const total = visiveis.reduce((t, c) => t + larg(c), 0)
  function redimensionar(e: PEvt<HTMLElement>, c: Coluna<T>) {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = larg(c)
    const alvoEl = e.currentTarget
    alvoEl.setPointerCapture(e.pointerId)
    let w = w0
    const mover = (ev: PointerEvent) => { w = Math.round(Math.min(900, Math.max(48, w0 + ev.clientX - x0))); setViva({ id: c.id, w }) }
    const fim = () => {
      alvoEl.removeEventListener('pointermove', mover); alvoEl.removeEventListener('pointerup', fim); alvoEl.removeEventListener('pointercancel', fim)
      setViva(null)
      if (w !== w0) salvar({ ...prefs, larguras: { ...prefs.larguras, [c.id]: w } })
    }
    alvoEl.addEventListener('pointermove', mover); alvoEl.addEventListener('pointerup', fim); alvoEl.addEventListener('pointercancel', fim)
  }
  const reiniciarLargura = (c: Coluna<T>) => { const l = { ...prefs.larguras }; delete l[c.id]; salvar({ ...prefs, larguras: l }) }
  const esq = (i: number) => visiveis.slice(0, i).reduce((t, c) => t + larg(c), 0)

  function soltar(destino: string) {
    if (!arrasto || arrasto === destino) { setArrasto(null); setAlvo(null); return }
    const o = prefs.ordem.filter((x) => x !== arrasto)
    const i = o.indexOf(destino)
    const antes = prefs.ordem.indexOf(arrasto) > prefs.ordem.indexOf(destino)
    o.splice(antes ? i : i + 1, 0, arrasto)
    salvar({ ...prefs, ordem: o })
    setArrasto(null); setAlvo(null)
  }
  const mudouPadrao = prefs.fixarAte != null || prefs.ordem.some((x, i) => x !== ids[i]) || prefs.ocultas.length !== colunas.filter((c) => c.oculta).length || Object.keys(prefs.larguras).length > 0
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const resumoFiltros = () => visiveis.flatMap((c) => {
    const o: string[] = []
    const sl = selecao[c.id]
    if (sl !== undefined) o.push(`${c.titulo}: ${sl.length === 0 ? '(nenhum)' : sl.slice(0, 6).join(', ') + (sl.length > 6 ? ` +${sl.length - 6}` : '')}`)
    if (exprs[c.id]) o.push(`${c.titulo} ${exprs[c.id]}`)
    return o
  })
  // exporta o que está na tela: colunas visíveis, na ordem, com os filtros e a ordenação atuais
  function exportarExcel() {
    const cel = (c: Coluna<T>, l: T) => {
      const v = c.valor ? c.valor(l) : null
      const t = typeof v === 'number' && c.direita ? String(v).replace('.', ',') : c.texto(l)
      return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const cab = visiveis.map((c) => (/[;"]/.test(c.titulo) ? `"${c.titulo.replace(/"/g, '""')}"` : c.titulo)).join(';')
    const corpo = filtradas.map((l) => visiveis.map((c) => cel(c, l)).join(';')).join('\r\n')
    const linhaTot = somaCol.size === 0 ? '' : '\r\n' + visiveis.map((c) => (somaCol.has(c.id) ? String(totais[c.id]).replace('.', ',') : c.id === colRotulo ? 'TOTAL' : '')).join(';')
    const blob = new Blob(['\ufeff' + cab + '\r\n' + corpo + linhaTot], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(titulo ?? id).replace(/[^\w.-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  function visualizarPdf() {
    const w = window.open('', '_blank')
    if (!w) { window.alert('O navegador bloqueou a janela. Libere pop-ups para este site e tente de novo.'); return }
    const f = resumoFiltros()
    const th = visiveis.map((c) => `<th${c.direita ? ' class="d"' : ''}>${esc(c.titulo)}</th>`).join('')
    const tr = filtradas.map((l) => `<tr>${visiveis.map((c) => `<td${c.direita ? ' class="d"' : ''}>${esc(c.texto(l))}</td>`).join('')}</tr>`).join('')
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo ?? id)}</title><style>
      body{font:12px system-ui,sans-serif;margin:18px;color:#111} h1{font-size:16px;margin:0 0 4px} .m{color:#555;margin:0 0 10px}
      table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:3px 6px;text-align:left} th{background:#eee;font-size:11px} td.d,th.d{text-align:right}
      thead{display:table-header-group} tfoot td.t{font-weight:700;background:#eee} tr{page-break-inside:avoid} @page{size:landscape;margin:10mm}
    </style></head><body><h1>${esc(titulo ?? id)}</h1><p class="m">Gerado em ${new Date().toLocaleString('pt-BR')} · ${filtradas.length} de ${linhas.length} linhas${f.length ? ' · Filtros: ' + esc(f.join(' | ')) : ''}</p>
    <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody>${somaCol.size ? `<tfoot><tr>${visiveis.map((c) => `<td class="t${c.direita ? ' d' : ''}">${somaCol.has(c.id) ? esc(fmtTot(c)) : c.id === colRotulo ? 'TOTAL' : ''}</td>`).join('')}</tr></tfoot>` : ''}</table><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`)
    w.document.close()
  }
  const nFiltros = visiveis.filter((c) => selecao[c.id] !== undefined || !!exprs[c.id]).length
  const estiloFixa = (i: number) => (fixarAte != null && i <= fixarAte ? { left: esq(i) } : undefined)
  const classeFixa = (i: number) => (fixarAte != null && i <= fixarAte ? `fixa${i === fixarAte ? ' fixa-fim' : ''}` : '')

  return (
    <div className="gd" style={{ ['--gd-alt' as string]: altura ?? '58vh' }}>
      <style>{CSS}</style>
      <div className="gd-barra">
        <span>{filtradas.length === linhas.length ? `${linhas.length} linhas` : `${filtradas.length} de ${linhas.length} linhas (filtrado)`} · ▽ filtra a coluna, arraste o título para mover, 📌 fixa até a coluna</span>
        <span className="acoes">
          {nFiltros > 0 && <button onClick={() => { setSelecao({}); setExprs({}) }}>Limpar filtros ({nFiltros})</button>}
          {sort && <button onClick={() => setSort(null)}>Tirar ordenação</button>}
          {mudouPadrao && <button onClick={() => salvar({ ordem: ids, fixarAte: null, ocultas: colunas.filter((c) => c.oculta).map((c) => c.id), larguras: {} })}>Restaurar colunas</button>}
          <button type="button" className="ico" onClick={exportarExcel} disabled={filtradas.length === 0} title="Exportar para Excel (CSV com o que está na tela)" aria-label="Exportar para Excel">⤓</button>
          <button type="button" className="ico" onClick={visualizarPdf} disabled={filtradas.length === 0} title="Visualizar em PDF / imprimir" aria-label="Visualizar em PDF">⎙</button>
          <span className="cols">
            <button onClick={() => setMenu((m) => !m)} aria-expanded={menu}>Colunas ▾</button>
            {menu && (
              <div className="cols-menu" role="menu">
                {colunas.map((c) => (
                  <label key={c.id}><input type="checkbox" checked={!prefs.ocultas.includes(c.id)}
                    onChange={(e) => salvar({ ...prefs, fixarAte: null, ocultas: e.target.checked ? prefs.ocultas.filter((x) => x !== c.id) : [...prefs.ocultas, c.id] })} />{c.titulo}</label>))}
              </div>)}
          </span>
        </span>
      </div>
      <div className="gd-wrap">
        <table style={{ width: total }}>
          <colgroup>{visiveis.map((c) => <col key={c.id} style={{ width: larg(c) }} />)}</colgroup>
          <thead>
            <tr>
              {visiveis.map((c, i) => (
                <th key={c.id} className={`${c.direita ? 'd ' : ''}${classeFixa(i)}${alvo === c.id && arrasto !== c.id ? ' alvo' : ''}`} style={estiloFixa(i)}
                    aria-sort={sort?.id === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    onDragOver={(e) => { if (arrasto) { e.preventDefault(); setAlvo(c.id) } }} onDrop={() => soltar(c.id)}>
                  <div className="cab" draggable onDragStart={(e) => { setArrasto(c.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setArrasto(null); setAlvo(null) }}>
                    <button type="button" className="tit" onClick={() => setSort(sort?.id === c.id ? (sort.dir === 1 ? { id: c.id, dir: -1 } : null) : { id: c.id, dir: 1 })} title="Clique para ordenar">
                      {c.titulo}{sort?.id === c.id ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </button>
                    <button type="button" className={`pin${fixarAte === i ? ' on' : ''}`} aria-pressed={fixarAte === i}
                      title={fixarAte === i ? 'Soltar colunas fixas' : 'Fixar esta coluna e as da esquerda'} onClick={() => salvar({ ...prefs, fixarAte: fixarAte === i ? null : i })}>📌</button>
                    <FiltroColuna c={c} linhas={linhas} sel={selecao[c.id]} expr={exprs[c.id]}
                      onSel={(v) => setSelecao((x) => ({ ...x, [c.id]: v }))} onExpr={(v) => setExprs((x) => ({ ...x, [c.id]: v }))} />
                  </div>
                  <span className={`res${viva?.id === c.id ? ' on' : ''}`} role="separator" aria-orientation="vertical" aria-label={`Redimensionar ${c.titulo}`} title="Arraste para redimensionar; duplo clique restaura"
                    onPointerDown={(e) => redimensionar(e, c)} onDoubleClick={() => reiniciarLargura(c)} />
                </th>))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l) => (
              <tr key={chave(l)}>
                {visiveis.map((c, i) => (
                  <td key={c.id} className={`${c.direita ? 'd ' : ''}${classeFixa(i)}`} style={estiloFixa(i)} title={c.texto(l)}>{c.render ? c.render(l) : c.texto(l)}</td>))}
              </tr>))}
          </tbody>
          {somaCol.size > 0 && filtradas.length > 0 && (
            <tfoot>
              <tr>
                {visiveis.map((c, i) => (
                  <td key={c.id} className={`tot ${c.direita ? 'd ' : ''}${classeFixa(i)}`} style={estiloFixa(i)}>{somaCol.has(c.id) ? fmtTot(c) : c.id === colRotulo ? `Total (${filtradas.length})` : ''}</td>))}
              </tr>
            </tfoot>)}
        </table>
        {filtradas.length === 0 && <div className="vazio-gd">{linhas.length === 0 ? vazio : 'Nenhuma linha com esses filtros.'}</div>}
      </div>
    </div>
  )
}
