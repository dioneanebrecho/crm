import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// GradeDados: tabela padrão do painel (ver claude/padrao-tabelas-grade-dados.md).
// Compacta, com filtro rápido por coluna (lista quando há poucos valores, caixa de texto nos demais),
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
  /** largura máxima em px antes de cortar com reticências (padrão 260) */
  max?: number
  /** colunas escondidas por padrão ficam acessíveis em "Colunas" */
  oculta?: boolean
}

interface Prefs { ordem: string[]; fixarAte: number | null; ocultas: string[] }

const CSS = `
.gd { --gd-ac: var(--g1, #3987e5); }
.gd-barra { display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:space-between; margin:0 0 6px; font-size:.8rem; color: var(--mudo); }
.gd-barra .acoes { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.gd-barra button { background: var(--card2); color: var(--txt); border:1px solid var(--borda); border-radius:8px; padding:.2rem .6rem; font-size:.78rem; font-weight:600; cursor:pointer; }
.gd-barra button:hover { border-color: var(--gd-ac); }
.gd-wrap { overflow:auto; max-height: var(--gd-alt, 58vh); border:1px solid var(--borda); border-radius:10px; background: var(--card); position:relative; }
.gd table { width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; border:0; table-layout:auto; }
.gd th, .gd td { padding:.32rem .6rem; font-size:.84rem; line-height:1.25; border-bottom:1px solid var(--borda); text-align:left; white-space:nowrap; background: var(--card); vertical-align:middle; }
.gd td { max-width: var(--gd-max, 260px); overflow:hidden; text-overflow:ellipsis; }
.gd td.d, .gd th.d { text-align:right; font-variant-numeric: tabular-nums; }
.gd thead th { position:sticky; top:0; z-index:3; background: var(--card2); text-transform:none; letter-spacing:0; padding:.3rem .6rem .4rem; vertical-align:top; }
.gd .fixa { position:sticky; z-index:2; }
.gd thead .fixa { z-index:5; }
.gd .fixa-fim { box-shadow: 2px 0 0 0 var(--borda), 6px 0 8px -6px rgba(0,0,0,.5); }
.gd tbody tr:hover td { background: var(--card2); }
.gd .cab { display:flex; align-items:center; gap:4px; cursor:grab; user-select:none; font-size:.7rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color: var(--mudo); }
.gd .cab:active { cursor:grabbing; }
.gd .cab .tit { flex:1; text-align:inherit; background:none; border:0; padding:0; color:inherit; font:inherit; letter-spacing:inherit; text-transform:inherit; cursor:pointer; white-space:nowrap; }
.gd .cab .pin { background:none; border:0; padding:0 2px; cursor:pointer; color: var(--mudo); font-size:.8rem; opacity:.55; }
.gd .cab .pin:hover, .gd .cab .pin.on { opacity:1; color: var(--gd-ac); }
.gd th.alvo { box-shadow: inset 3px 0 0 0 var(--gd-ac); }
.gd .filtro { display:block; width:100%; min-width:64px; margin-top:4px; background: var(--card); color: var(--txt); border:1px solid var(--borda); border-radius:6px; padding:.15rem .35rem; font-size:.76rem; font-weight:400; text-transform:none; letter-spacing:0; }
.gd .filtro:focus { outline:none; border-color: var(--gd-ac); }
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

export default function GradeDados<T>({ id, colunas, linhas, chave, altura, vazio = 'Nenhum registro.' }: {
  id: string
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
             ocultas: p.ocultas ?? colunas.filter((c) => c.oculta).map((c) => c.id) }
  })
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null)
  const [arrasto, setArrasto] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [lefts, setLefts] = useState<number[]>([])
  const refs = useRef<Record<string, HTMLTableCellElement | null>>({})

  const salvar = useCallback((p: Prefs) => { setPrefs(p); gravarPrefs(id, p) }, [id])
  const porId = useMemo(() => new Map(colunas.map((c) => [c.id, c])), [colunas])
  const visiveis = useMemo(() => prefs.ordem.filter((x) => !prefs.ocultas.includes(x) && porId.has(x)).map((x) => porId.get(x) as Coluna<T>), [prefs, porId])
  const fixarAte = prefs.fixarAte != null && prefs.fixarAte < visiveis.length ? prefs.fixarAte : null

  // opções de lista quando a coluna tem poucos valores distintos
  const opcoes = useMemo(() => {
    const r: Record<string, string[] | null> = {}
    for (const c of colunas) {
      const s = new Set<string>()
      for (const l of linhas) { s.add(c.texto(l)); if (s.size > 12) break }
      r[c.id] = s.size > 1 && s.size <= 12 ? [...s].sort((a, b) => a.localeCompare(b, 'pt-BR')) : null
    }
    return r
  }, [colunas, linhas])

  const filtradas = useMemo(() => {
    const ativos = visiveis.filter((c) => (filtros[c.id] ?? '').trim() !== '')
    let r = ativos.length === 0 ? linhas : linhas.filter((l) => ativos.every((c) => {
      const f = filtros[c.id]
      return opcoes[c.id] ? c.texto(l) === f : passa(c, l, f)
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
  }, [linhas, visiveis, filtros, opcoes, sort, porId])

  // posição de cada coluna fixada = soma das larguras das que estão à esquerda
  useLayoutEffect(() => {
    if (fixarAte == null) { if (lefts.length) setLefts([]); return }
    const out: number[] = []
    let acc = 0
    for (let i = 0; i <= fixarAte; i++) {
      out.push(acc)
      acc += refs.current[visiveis[i]?.id ?? '']?.offsetWidth ?? 0
    }
    if (out.length !== lefts.length || out.some((v, i) => Math.abs(v - lefts[i]) > 0.5)) setLefts(out)
  })

  function soltar(destino: string) {
    if (!arrasto || arrasto === destino) { setArrasto(null); setAlvo(null); return }
    const o = prefs.ordem.filter((x) => x !== arrasto)
    const i = o.indexOf(destino)
    const antes = prefs.ordem.indexOf(arrasto) > prefs.ordem.indexOf(destino)
    o.splice(antes ? i : i + 1, 0, arrasto)
    salvar({ ...prefs, ordem: o })
    setArrasto(null); setAlvo(null)
  }
  const mudouPadrao = prefs.fixarAte != null || prefs.ordem.some((x, i) => x !== ids[i]) || prefs.ocultas.length !== colunas.filter((c) => c.oculta).length
  const nFiltros = Object.values(filtros).filter((v) => v.trim()).length
  const estiloFixa = (i: number) => (fixarAte != null && i <= fixarAte ? { left: lefts[i] ?? 0 } : undefined)
  const classeFixa = (i: number) => (fixarAte != null && i <= fixarAte ? `fixa${i === fixarAte ? ' fixa-fim' : ''}` : '')

  return (
    <div className="gd" style={{ ['--gd-alt' as string]: altura ?? '58vh' }}>
      <style>{CSS}</style>
      <div className="gd-barra">
        <span>{filtradas.length === linhas.length ? `${linhas.length} linhas` : `${filtradas.length} de ${linhas.length} linhas (filtrado)`} · arraste o título para mover, 📌 fixa até a coluna</span>
        <span className="acoes">
          {nFiltros > 0 && <button onClick={() => setFiltros({})}>Limpar filtros ({nFiltros})</button>}
          {sort && <button onClick={() => setSort(null)}>Tirar ordenação</button>}
          {mudouPadrao && <button onClick={() => salvar({ ordem: ids, fixarAte: null, ocultas: colunas.filter((c) => c.oculta).map((c) => c.id) })}>Restaurar colunas</button>}
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
        <table>
          <thead>
            <tr>
              {visiveis.map((c, i) => (
                <th key={c.id} ref={(el) => { refs.current[c.id] = el }} className={`${c.direita ? 'd ' : ''}${classeFixa(i)}${alvo === c.id && arrasto !== c.id ? ' alvo' : ''}`} style={estiloFixa(i)}
                    aria-sort={sort?.id === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    onDragOver={(e) => { if (arrasto) { e.preventDefault(); setAlvo(c.id) } }} onDrop={() => soltar(c.id)}>
                  <div className="cab" draggable onDragStart={(e) => { setArrasto(c.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setArrasto(null); setAlvo(null) }}>
                    <button type="button" className="tit" onClick={() => setSort(sort?.id === c.id ? (sort.dir === 1 ? { id: c.id, dir: -1 } : null) : { id: c.id, dir: 1 })} title="Clique para ordenar">
                      {c.titulo}{sort?.id === c.id ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </button>
                    <button type="button" className={`pin${fixarAte === i ? ' on' : ''}`} aria-pressed={fixarAte === i}
                      title={fixarAte === i ? 'Soltar colunas fixas' : 'Fixar esta coluna e as da esquerda'} onClick={() => salvar({ ...prefs, fixarAte: fixarAte === i ? null : i })}>📌</button>
                  </div>
                  {opcoes[c.id]
                    ? <select className="filtro" value={filtros[c.id] ?? ''} onChange={(e) => setFiltros({ ...filtros, [c.id]: e.target.value })} aria-label={`Filtrar ${c.titulo}`}>
                        <option value="">Todos</option>{opcoes[c.id]!.map((o) => <option key={o} value={o}>{o || '(vazio)'}</option>)}</select>
                    : <input className="filtro" value={filtros[c.id] ?? ''} placeholder={c.valor && c.direita ? 'filtrar ou >100' : 'filtrar'} onChange={(e) => setFiltros({ ...filtros, [c.id]: e.target.value })} aria-label={`Filtrar ${c.titulo}`} />}
                </th>))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l) => (
              <tr key={chave(l)}>
                {visiveis.map((c, i) => (
                  <td key={c.id} className={`${c.direita ? 'd ' : ''}${classeFixa(i)}`} style={{ ...estiloFixa(i), ['--gd-max' as string]: `${c.max ?? 260}px` }} title={c.texto(l)}>{c.render ? c.render(l) : c.texto(l)}</td>))}
              </tr>))}
          </tbody>
        </table>
        {filtradas.length === 0 && <div className="vazio-gd">{linhas.length === 0 ? vazio : 'Nenhuma linha com esses filtros.'}</div>}
      </div>
    </div>
  )
}
