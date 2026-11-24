import { useMemo, useState } from 'react'
import type { Contexto } from '../App'
import { apiGestao, type GestaoNatureza, type GnBase, type GnNo, type GnTitulo } from '../api'
import { Modal, useCarregar } from '../ui'
import GradeDados, { type Coluna } from '../GradeDados'
import PeriodoData from '../PeriodoData'

// Painel de Gestão > Natureza e CR. Visões Sintético e Analítico por Natureza (conceito do Sankhya) e por Centro de
// Resultado, no período total ou mês a mês, com análise vertical (participação) e horizontal (variação entre meses).
// O banco entrega os valores por natureza analítica x CR x mês (api.gestao_natureza); aqui só se agrupa e se desenha.

const CSS = `
.gn-raiz { --h:36px; }
.gn-views { display:flex; gap:2px; flex-wrap:wrap; padding:3px; border:1px solid var(--borda); background: var(--card2); border-radius:12px; width:fit-content; max-width:100%; margin:0 0 12px; }
.gn-views button { height:32px; padding:0 14px; border:0; border-radius:9px; background:transparent; color: var(--mudo); font-size:.86rem; font-weight:700; cursor:pointer; }
.gn-views button:hover { color: var(--txt); }
.gn-views button.on { background: var(--g1); color:#fff; }
.gn-tool { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:0 0 12px; }
.gn-grupo { display:inline-flex; align-items:center; gap:8px; height:var(--h); padding:0 4px 0 12px; border:1px solid var(--borda); background: var(--card2); border-radius:10px; }
.gn-grupo > .lab { color: var(--mudo); font-size:.76rem; white-space:nowrap; }
.gn-grupo select { height:calc(var(--h) - 2px); border:0; background:transparent; color: var(--txt); font-size:.86rem; font-weight:600; padding:0 6px; max-width:240px; cursor:pointer; }
.gn-sg { display:inline-flex; gap:2px; }
.gn-sg button { white-space:nowrap; height:28px; padding:0 10px; border:0; border-radius:7px; background:transparent; color: var(--mudo); font-size:.82rem; font-weight:700; cursor:pointer; }
.gn-sg button:hover { color: var(--txt); }
.gn-sg button.on { background: var(--g1); color:#fff; }
.gn-btn { height:var(--h); padding:0 14px; border:1px solid var(--borda); background: var(--card2); color: var(--txt); border-radius:10px; font-size:.84rem; font-weight:700; cursor:pointer; }
.gn-btn:hover:not(:disabled) { border-color: var(--g1); }
.gn-btn:disabled { opacity:.55; cursor:default; }
.gn-btn.on { border-color: var(--g1); }
.gn-fill { flex:1; }
.gn-painel { border:1px solid var(--borda); background: var(--card); border-radius:14px; padding:14px 16px; margin:0 0 12px; display:grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap:14px 20px; }
.gn-painel .campo { display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
.gn-painel .campo > .lab { color: var(--mudo); font-size:.74rem; font-weight:700; letter-spacing:.03em; text-transform:uppercase; }
.gn-painel .gn-grupo { padding-left:4px; }
.gn-painel select { max-width:100%; }
.gn-acoes { grid-column: 1 / -1; display:flex; gap:8px; flex-wrap:wrap; padding-top:12px; border-top:1px solid var(--borda); }
.gn-resumo { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); border:1px solid var(--borda); background: var(--card); border-radius:14px; margin:0 0 6px; overflow:hidden; }
.gn-resumo > div { padding:10px 16px; border-right:1px solid var(--borda); min-width:0; }
.gn-resumo > div:last-child { border-right:0; }
.gn-resumo small { display:block; color: var(--mudo); font-size:.74rem; }
.gn-resumo strong { display:block; font-size:1.12rem; font-variant-numeric: tabular-nums; margin-top:2px; }
.gn-resumo strong.neg { color: var(--g2); }
.gn-linha { color: var(--mudo); font-size:.78rem; margin:0 0 10px; display:flex; gap:6px 14px; flex-wrap:wrap; align-items:center; }
.gn-tag { display:inline-block; border:1px solid var(--g4); color: var(--txt); border-radius:999px; padding:1px 10px; font-size:.74rem; }
.gn-msg { border:1px solid var(--borda); border-left:3px solid var(--g1); background: var(--card2); border-radius:10px; padding:8px 12px; font-size:.84rem; margin:0 0 10px; }
.gn-tab-wrap { overflow:auto; max-height:68vh; border:1px solid var(--borda); border-radius:12px; }
table.gn { border-collapse: separate; border-spacing:0; width:100%; font-size:.85rem; font-variant-numeric: tabular-nums; }
table.gn th, table.gn td { padding:.4rem .75rem; border-bottom:1px solid var(--borda); white-space:nowrap; text-align:right; }
table.gn tr:last-child td { border-bottom:0; }
table.gn th { position:sticky; top:0; background: var(--card2); z-index:2; font-size:.74rem; color: var(--mudo); font-weight:700; text-transform:uppercase; letter-spacing:.03em; }
table.gn td.nome, table.gn th.nome { text-align:left; position:sticky; left:0; background: var(--card); z-index:1; }
table.gn th.nome { background: var(--card2); z-index:3; }
table.gn tr.sint td { font-weight:700; background: var(--card2); }
table.gn tr.sint td.nome { background: var(--card2); }
table.gn tr.res td { font-weight:800; border-top:2px solid var(--borda); background: var(--card2); }
table.gn tr.res td.nome { background: var(--card2); }
table.gn tr.sem td { color: var(--gred); font-weight:700; }
table.gn td.tot { font-weight:700; border-left:1px solid var(--borda); }
table.gn .gn-c { display:flex; flex-direction:column; align-items:flex-end; line-height:1.25; }
table.gn .gn-c b { font-weight:700; }
table.gn tr:not(.sint) .gn-c b { font-weight:600; }
table.gn .gn-sub { display:flex; gap:8px; font-size:.7rem; color: var(--mudo); font-weight:600; }
table.gn td.clk { cursor:pointer; }
table.gn td.clk:hover { background: color-mix(in srgb, var(--g1) 14%, transparent); box-shadow: inset 0 0 0 1px var(--g1); }
table.gn .exp { cursor:pointer; background:none; border:0; color: var(--mudo); width:18px; padding:0; font-size:.8rem; }
table.gn .cod { color: var(--mudo); font-size:.74rem; margin-right:8px; font-weight:500; }
table.gn .neg { color: var(--g2); }
table.gn .bom { color: var(--g3); } table.gn .mau { color: var(--g2); } table.gn .mudo { color: var(--mudo); }
.gn-barra { display:inline-block; height:6px; border-radius:3px; background: var(--g1); vertical-align:middle; margin-right:8px; min-width:1px; }
.gn-caminho { color: var(--mudo); font-size:.72rem; margin-left:8px; font-weight:500; }
.gn-nota { color: var(--mudo); font-size:.78rem; margin:8px 0 0; line-height:1.45; }
`

type Classe = 'rec' | 'desp' | 'fora' | 'misto'
type Dim = 'natureza' | 'cr'
type Cel = 'tudo' | 'valor' | 'pct' | 'delta' | 'qtd'
interface Per { de: string; ate: string }
interface Det { titulo: string; sub: string; natureza: string | null; cr: string | null; mes: string | null; classe: string | null }
interface Cfg { dim: Dim; mensal: boolean; plana: boolean; nivel: number; cel: Cel }
interface Linha {
  codigo: string; nome: string; grau: number; analitico: boolean; classe: Classe; temFilho: boolean
  col: number[]; qcol: number[]; tot: number; q: number; vp: number
}

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotMes = (m: string) => `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const pai = (c: string) => (c.includes('.') ? c.slice(0, c.lastIndexOf('.')) : '')
const antecessores = (c: string) => { const o: string[] = []; let x = c; while (x) { o.push(x); x = pai(x) } return o }
const classeDe = (n?: GnNo): Exclude<Classe, 'misto'> =>
  !n || (n.reconhece_em && n.reconhece_em !== 'lancamento') ? 'fora' : n.sinal === 1 ? 'rec' : n.sinal === -1 ? 'desp' : 'fora'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')
const fmt = (v: number, dec = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

const VISOES: { id: string; rotulo: string; sub: string; cfg: Cfg }[] = [
  { id: 'sint', rotulo: 'Sintético', sub: 'grupos e participação', cfg: { dim: 'natureza', mensal: false, plana: false, nivel: 3, cel: 'tudo' } },
  { id: 'anal', rotulo: 'Analítico', sub: 'ranking das naturezas', cfg: { dim: 'natureza', mensal: false, plana: true, nivel: 4, cel: 'tudo' } },
  { id: 'sintm', rotulo: 'Sintético mensal', sub: 'grupos mês a mês', cfg: { dim: 'natureza', mensal: true, plana: false, nivel: 2, cel: 'tudo' } },
  { id: 'analm', rotulo: 'Analítico mensal', sub: 'natureza × mês', cfg: { dim: 'natureza', mensal: true, plana: true, nivel: 4, cel: 'tudo' } },
  { id: 'cr', rotulo: 'Por centro de resultado', sub: 'resultado de cada CR', cfg: { dim: 'cr', mensal: false, plana: false, nivel: 3, cel: 'tudo' } },
  { id: 'crm', rotulo: 'CR mensal', sub: 'CR × mês', cfg: { dim: 'cr', mensal: true, plana: false, nivel: 3, cel: 'tudo' } },
]
const igual = (a: Cfg, b: Cfg) => a.dim === b.dim && a.mensal === b.mensal && a.plana === b.plana && a.nivel === b.nivel

const presets = () => {
  const h = new Date()
  const fim = (y: number, m: number) => iso(new Date(y, m + 1, 0))
  return [
    { id: '6m', rotulo: 'Últimos 6 meses', de: iso(new Date(h.getFullYear(), h.getMonth() - 5, 1)), ate: fim(h.getFullYear(), h.getMonth()) },
    { id: '12m', rotulo: 'Últimos 12 meses', de: iso(new Date(h.getFullYear(), h.getMonth() - 11, 1)), ate: fim(h.getFullYear(), h.getMonth()) },
    { id: 'ano', rotulo: 'Ano atual', de: iso(new Date(h.getFullYear(), 0, 1)), ate: iso(new Date(h.getFullYear(), 11, 31)) },
    { id: 'mes', rotulo: 'Mês atual', de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: fim(h.getFullYear(), h.getMonth()) },
    { id: 'ant', rotulo: 'Mês anterior', de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: fim(h.getFullYear(), h.getMonth() - 1) },
  ]
}

function monta(g: GestaoNatureza, cfg: Cfg, classe: '' | Exclude<Classe, 'misto'>, crSel: string) {
  const nm = g.meses.length
  const idxMes = new Map(g.meses.map((m, i) => [m, i]))
  const natMap = new Map(g.naturezas.map((n) => [n.codigo, n]))
  const nos = cfg.dim === 'natureza' ? g.naturezas : g.crs
  const noMap = new Map(nos.map((n) => [n.codigo, n]))
  const acc = new Map<string, { col: number[]; qcol: number[]; vp: number; cls: Set<string> }>()
  // totais de cartões, sempre por natureza (independem da visão): receitas, despesas, fora do resultado
  const cartoes = { rec: 0, desp: 0, fora: 0, vp: 0, v: 0 }
  for (const d of g.dados) {
    const cl = classeDe(natMap.get(d.n))
    if (classe && cl !== classe) continue
    if (crSel && !(d.c === crSel || d.c.startsWith(crSel + '.'))) continue
    const mi = idxMes.get(d.m)
    if (mi === undefined) continue
    cartoes[cl] += d.v; cartoes.v += d.v; cartoes.vp += d.vp
    let val = d.v
    if (cfg.dim === 'cr' && classe !== 'fora') { if (cl === 'rec') val = d.v; else if (cl === 'desp') val = -d.v; else continue }
    const cod = cfg.dim === 'natureza' ? d.n : d.c
    for (const a of antecessores(cod)) {
      let r = acc.get(a)
      if (!r) { r = { col: Array(nm).fill(0), qcol: Array(nm).fill(0), vp: 0, cls: new Set() }; acc.set(a, r) }
      r.col[mi] += val; r.qcol[mi] += d.q; r.vp += d.vp; r.cls.add(cl)
    }
  }
  const linhas: Linha[] = []
  for (const n of nos) {
    const r = acc.get(n.codigo)
    if (!r) continue
    const tot = r.col.reduce((s, x) => s + x, 0), q = r.qcol.reduce((s, x) => s + x, 0)
    if (tot === 0 && q === 0) continue
    const cls = r.cls.size === 1 ? ([...r.cls][0] as Exclude<Classe, 'misto'>) : 'misto'
    linhas.push({ codigo: n.codigo, nome: n.nome, grau: n.grau, analitico: n.analitico, classe: cls, temFilho: false, col: r.col, qcol: r.qcol, tot, q, vp: r.vp })
  }
  const pais = new Set(linhas.map((l) => pai(l.codigo)))
  linhas.forEach((l) => { l.temFilho = pais.has(l.codigo) })
  // bases da análise vertical: soma das linhas analíticas por classe, por coluna (mês) e no total
  const base = (cl: Classe, i: number | null) => {
    let s = 0
    for (const l of linhas) {
      if (!l.analitico && l.temFilho) continue
      if (cfg.dim === 'natureza' && cl !== 'misto' && l.classe !== cl) continue
      s += Math.abs(i === null ? l.tot : l.col[i])
    }
    return s
  }
  const resultado = Array(nm).fill(0) as number[]
  for (const l of linhas) {
    if (l.analitico || !l.temFilho) {
      for (let i = 0; i < nm; i++) {
        if (cfg.dim === 'cr') resultado[i] += l.col[i]
        else if (l.classe === 'rec') resultado[i] += l.col[i]
        else if (l.classe === 'desp') resultado[i] -= l.col[i]
      }
    }
  }
  return { linhas, noMap, base, resultado, cartoes, nm }
}

function DetalheNat({ ctx, det, per, base, onFechar }: { ctx: Contexto; det: Det; per: Per; base: GnBase; onFechar: () => void }) {
  const d = useCarregar(() => apiGestao.naturezaTitulos(ctx.empresa, per.de, per.ate, base, det.natureza, det.cr, det.mes, det.classe, 500),
    [ctx.empresa, per.de, per.ate, base, det.natureza, det.cr, det.mes, det.classe])
  const r = d.dados
  const colunas = useMemo<Coluna<GnTitulo>[]>(() => [
    { id: 'lado', titulo: 'Tipo', texto: (t) => (t.lado === 'pagar' ? 'Pagar' : 'Receber') },
    { id: 'data', titulo: 'Data', texto: (t) => dataBr(t.data), valor: (t) => t.data },
    { id: 'venc', titulo: 'Vencimento', texto: (t) => dataBr(t.vencimento), valor: (t) => t.vencimento },
    { id: 'sit', titulo: 'Situação', texto: (t) => t.situacao },
    { id: 'contato', titulo: 'Contato', texto: (t) => t.contato, max: 260 },
    { id: 'origem', titulo: 'Origem', texto: (t) => t.origem },
    { id: 'nat', titulo: 'Natureza', texto: (t) => (t.natureza ? `${t.natureza} ${t.natureza_nome ?? ''}` : 'Sem natureza'), max: 240 },
    { id: 'cr', titulo: 'CR', texto: (t) => (t.cr ? `${t.cr} ${t.cr_nome ?? ''}` : '—'), max: 220 },
    { id: 'estado', titulo: 'Aprovação', texto: (t) => (t.estado === 'aprovado' ? 'Aprovado' : t.estado === 'pendente' ? 'Pendente' : '—') },
    { id: 'valor', titulo: 'Valor', texto: (t) => brl(t.valor), valor: (t) => t.valor, direita: true, formatar: brl,
      render: (t) => <span style={{ color: t.lado === 'pagar' ? 'var(--g2)' : 'var(--g3)' }}>{brl(t.valor)}</span> },
  ], [])
  return (
    <Modal titulo={det.titulo} onFechar={onFechar} larga>
      <div className="gn-linha" aria-live="polite">
        <span className="gn-tag">{det.sub}</span>
        {r?.ok && <span className="gn-tag">{r.qtd.toLocaleString('pt-BR')} títulos</span>}
        {r?.ok && <span className="gn-tag">total {brl(r.valor)}</span>}
      </div>
      {d.erro && <div className="erro" role="alert">{d.erro}</div>}
      {d.carregando && !r && <p className="gn-nota">Carregando títulos…</p>}
      {r?.ok && r.itens.length === 0 && <p className="gn-nota">Nenhum título nesse recorte.</p>}
      {r?.ok && r.itens.length > 0 && <GradeDados id="gestao.natureza.titulos" titulo={`${det.titulo} (${det.sub})`} colunas={colunas} linhas={r.itens} chave={(t) => `${t.lado}${t.id}${t.natureza ?? ''}${t.cr ?? ''}`} />}
      {r?.ok && r.qtd > r.itens.length && <p className="gn-nota">Mostrando os {r.itens.length} primeiros de {r.qtd.toLocaleString('pt-BR')}. Afunile o período, o mês ou o filtro para ver os demais.</p>}
    </Modal>
  )
}

export default function AbaNatureza({ ctx }: { ctx: Contexto }) {
  const lista = useMemo(presets, [])
  const [per, setPer] = useState<Per>({ de: lista[0].de, ate: lista[0].ate })
  const [base, setBase] = useState<GnBase>('competencia')
  const [cfg, setCfg] = useState<Cfg>(VISOES[0].cfg)
  const [classe, setClasse] = useState<'' | Exclude<Classe, 'misto'>>('')
  const [crSel, setCrSel] = useState('')
  const [over, setOver] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ajustes, setAjustes] = useState(false)
  const [det, setDet] = useState<Det | null>(null)
  const podeClassificar = ctx.papeis.some((p) => p === 'superadmin' || p === 'admin' || p === 'gestor')
  const dados = useCarregar(() => apiGestao.natureza(ctx.empresa, per.de, per.ate, base), [ctx.empresa, per.de, per.ate, base])
  const g = dados.dados

  const m = useMemo(() => (g?.ok ? monta(g, cfg, classe, crSel) : null), [g, cfg, classe, crSel])
  const ativa = VISOES.find((v) => igual(v.cfg, cfg))?.id ?? null
  const ativoPer = lista.find((p) => p.de === per.de && p.ate === per.ate)?.id ?? null
  const mudaCfg = (p: Partial<Cfg>) => { setCfg((c) => ({ ...c, ...p })); if (p.nivel !== undefined || p.dim !== undefined || p.plana !== undefined) setOver({}) }
  const cel: Cel = !cfg.mensal && cfg.cel === 'delta' ? 'pct' : cfg.cel

  async function classificar() {
    setBusy(true); setMsg(null)
    try {
      const r = await apiGestao.classificar(ctx.empresa)
      setMsg(`${r.classificados.toLocaleString('pt-BR')} lançamento(s) classificado(s) pelas regras; ${r.sem_regra.toLocaleString('pt-BR')} sem regra.`)
      dados.recarregar()
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  // linhas visíveis conforme a visão: lista plana (só analíticas) ou árvore com expansão
  const visiveis = useMemo(() => {
    if (!m) return []
    if (cfg.plana) {
      const ls = m.linhas.filter((l) => l.analitico || !l.temFilho)
      return [...ls].sort((a, b) => (cfg.mensal ? a.codigo.localeCompare(b.codigo) : Math.abs(b.tot) - Math.abs(a.tot)))
    }
    const aberto = (l: Linha) => over[l.codigo] ?? l.grau < cfg.nivel
    return m.linhas.filter((l) => antecessores(pai(l.codigo)).every((a) => { const x = m.linhas.find((y) => y.codigo === a); return !x || aberto(x) }))
  }, [m, cfg, over])

  if (g && !g.ok && g.motivo !== 'periodo_invalido') return <div className="vazio"><strong>Indisponível para o seu perfil</strong><p>Esta aba é de administração, gestão e financeiro.</p></div>

  const colunas = g?.meses ?? []
  const baseDe = (l: Linha, i: number | null) => {
    if (!m) return 0
    const b = m.base(cfg.dim === 'cr' ? 'misto' : l.classe, i)
    return b || 1
  }
  const celula = (l: Linha, i: number): { t: string; cls?: string } => {
    const v = l.col[i]
    if (cel === 'qtd') return { t: l.qcol[i] ? l.qcol[i].toLocaleString('pt-BR') : '—' }
    if (cel === 'pct') return { t: v ? pct((Math.abs(v) / baseDe(l, i)) * 100) : '—' }
    if (cel === 'delta') {
      if (i === 0) return { t: '—', cls: 'mudo' }
      const a = l.col[i - 1]
      if (!a) return { t: v ? 'novo' : '—', cls: 'mudo' }
      const d = ((v - a) / Math.abs(a)) * 100
      const bom = l.classe === 'rec' || cfg.dim === 'cr' ? d >= 0 : d <= 0
      return { t: `${d > 0 ? '+' : ''}${pct(d)}`, cls: Math.abs(d) < 0.05 ? 'mudo' : bom ? 'bom' : 'mau' }
    }
    return { t: v ? fmt(v, cfg.mensal ? 0 : 2) : '—', cls: v < 0 ? 'neg' : undefined }
  }
  const av = (l: Linha, i: number | null) => { const v = i === null ? l.tot : l.col[i]; return v ? pct((Math.abs(v) / baseDe(l, i)) * 100) : '—' }
  const ah = (l: Linha, i: number): { t: string; cls: string } => {
    if (i === 0) return { t: '—', cls: 'mudo' }
    const a = l.col[i - 1], v = l.col[i]
    if (!a) return { t: v ? 'novo' : '—', cls: 'mudo' }
    const d = ((v - a) / Math.abs(a)) * 100
    const bom = l.classe === 'rec' || cfg.dim === 'cr' ? d >= 0 : d <= 0
    return { t: `${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${pct(Math.abs(d))}`, cls: Math.abs(d) < 0.05 ? 'mudo' : bom ? 'bom' : 'mau' }
  }
  const celTotal = (l: Linha): { t: string; cls?: string } => {
    if (cel === 'qtd') return { t: l.q.toLocaleString('pt-BR') }
    if (cel === 'pct') return { t: l.tot ? pct((Math.abs(l.tot) / baseDe(l, null)) * 100) : '—' }
    return { t: l.tot ? fmt(l.tot, cfg.mensal ? 0 : 2) : '—', cls: l.tot < 0 ? 'neg' : undefined }
  }
  const comAnalises = cel === 'tudo'
  const mostraValor = cel === 'valor' || cel === 'tudo'
  const abrir = (l: Linha | null, mi: number | null) => {
    const mes = mi === null ? null : colunas[mi]
    const sub = mes ? `${rotMes(mes)} · ${rotBase[base]}` : `${dataBr(per.de)} a ${dataBr(per.ate)} · ${rotBase[base]}`
    if (!l) { setDet({ titulo: 'Sem natureza (a classificar)', sub, natureza: '__sem__', cr: null, mes, classe: null }); return }
    const titulo = `${l.codigo} ${l.nome}`
    if (cfg.dim === 'natureza') setDet({ titulo, sub, natureza: l.codigo, cr: crSel || null, mes, classe: classe || null })
    else setDet({ titulo, sub, natureza: null, cr: l.codigo, mes, classe: classe || 'resultado' })
  }

  function exportar() {
    if (!m || !g) return
    const cab = ['Código', 'Nome', ...(cfg.mensal ? colunas.map(rotMes) : []), 'Total', 'Títulos']
    const lin = visiveis.map((l) => [l.codigo, l.nome, ...(cfg.mensal ? l.col.map((x) => x.toFixed(2).replace('.', ',')) : []), l.tot.toFixed(2).replace('.', ','), String(l.q)])
    const csv = [cab, ...lin].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `${cfg.dim === 'natureza' ? 'natureza' : 'centro-resultado'}-${per.de}-${per.ate}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const sem = g?.sem_classificar ?? []
  const semV = sem.reduce((s, x) => s + x.v, 0), semQ = sem.reduce((s, x) => s + x.q, 0)
  const semPorMes = colunas.map((mm) => sem.filter((x) => x.m === mm).reduce((s, x) => s + x.v, 0))
  const nomeCr = (c: GnNo) => `${'· '.repeat(Math.max(c.grau - 1, 0))}${c.codigo} ${c.nome}`
  const rotBase: Record<GnBase, string> = { competencia: 'Competência', vencimento: 'Vencimento', caixa: 'Caixa (realizado)' }

  return (
    <div className="gn-raiz">
      <style>{CSS}</style>
      <div className="gn-views" role="group" aria-label="Visões prontas">
        {VISOES.map((v) => <button key={v.id} className={v.id === ativa ? 'on' : ''} title={v.sub} onClick={() => { setCfg(v.cfg); setOver({}) }}>{v.rotulo}</button>)}
      </div>

      <div className="gn-tool">
        <label className="gn-grupo"><span className="lab">Período</span>
          <select value={ativoPer ?? 'custom'} onChange={(e) => { const p = lista.find((x) => x.id === e.target.value); if (p) setPer({ de: p.de, ate: p.ate }) }} aria-label="Período">
            {ativoPer === null && <option value="custom">{per.de.split('-').reverse().join('/')} a {per.ate.split('-').reverse().join('/')}</option>}
            {lista.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
        </label>
        <label className="gn-grupo"><span className="lab">Base de data</span>
          <select value={base} onChange={(e) => setBase(e.target.value as GnBase)} aria-label="Base de data" title="Competência: emissão (a receber) e competência (a pagar). Vencimento: data de vencimento. Caixa: só títulos liquidados.">
            {(['competencia', 'vencimento', 'caixa'] as GnBase[]).map((b) => <option key={b} value={b}>{rotBase[b]}</option>)}
          </select>
        </label>
        <div className="gn-grupo"><span className="lab">Mostrar</span>
          <div className="gn-sg">
            <button className={cel === 'tudo' ? 'on' : ''} onClick={() => mudaCfg({ cel: 'tudo' })} title="R$ com participação (análise vertical) e variação sobre o mês anterior (análise horizontal) na mesma célula">R$ + análises</button>
            <button className={cel === 'valor' ? 'on' : ''} onClick={() => mudaCfg({ cel: 'valor' })} title="Só valores em R$">R$</button>
            <button className={cel === 'pct' ? 'on' : ''} onClick={() => mudaCfg({ cel: 'pct' })} title="Análise vertical: participação no total da classe">% vertical</button>
            {cfg.mensal && <button className={cel === 'delta' ? 'on' : ''} onClick={() => mudaCfg({ cel: 'delta' })} title="Análise horizontal: variação % sobre o mês anterior">Δ% mensal</button>}
            <button className={cel === 'qtd' ? 'on' : ''} onClick={() => mudaCfg({ cel: 'qtd' })} title="Incidência: quantidade de títulos">Títulos</button>
          </div>
        </div>
        <span className="gn-fill" />
        <button className={`gn-btn ${ajustes ? 'on' : ''}`} onClick={() => setAjustes((x) => !x)} aria-expanded={ajustes}>Personalizar {ajustes ? '▴' : '▾'}</button>
      </div>

      {ajustes && (
        <div className="gn-painel">
          <div className="campo"><span className="lab">Linhas</span>
            <div className="gn-grupo"><div className="gn-sg">
              <button className={cfg.dim === 'natureza' ? 'on' : ''} onClick={() => mudaCfg({ dim: 'natureza' })}>Natureza</button>
              <button className={cfg.dim === 'cr' ? 'on' : ''} onClick={() => mudaCfg({ dim: 'cr' })}>Centro de resultado</button>
            </div></div>
          </div>
          <div className="campo"><span className="lab">Colunas</span>
            <div className="gn-grupo"><div className="gn-sg">
              <button className={!cfg.mensal ? 'on' : ''} onClick={() => mudaCfg({ mensal: false })}>Período total</button>
              <button className={cfg.mensal ? 'on' : ''} onClick={() => mudaCfg({ mensal: true })}>Mês a mês</button>
            </div></div>
          </div>
          {!cfg.plana && (
            <div className="campo"><span className="lab">Nível de detalhe</span>
              <div className="gn-grupo"><div className="gn-sg">{[1, 2, 3, 4].map((n) => <button key={n} className={cfg.nivel === n ? 'on' : ''} onClick={() => mudaCfg({ nivel: n })}>{n === 4 ? 'Todos' : `N${n}`}</button>)}</div></div>
            </div>)}
          <div className="campo"><span className="lab">Classe</span>
            <label className="gn-grupo"><select value={classe} onChange={(e) => setClasse(e.target.value as typeof classe)} aria-label="Classe da natureza">
              <option value="">Todas</option><option value="rec">Receitas</option><option value="desp">Deduções, custos e despesas</option><option value="fora">Fora do resultado</option>
            </select></label>
          </div>
          <div className="campo"><span className="lab">Centro de resultado</span>
            <label className="gn-grupo"><select value={crSel} onChange={(e) => setCrSel(e.target.value)} aria-label="Filtrar por centro de resultado">
              <option value="">Todos</option>
              {(g?.crs ?? []).map((c) => <option key={c.codigo} value={c.codigo}>{nomeCr(c)}</option>)}
            </select></label>
          </div>
          <div className="campo"><span className="lab">Período personalizado</span>
            <PeriodoData ini={per.de} fim={per.ate} onAplicar={(a, b) => { if (a && b) setPer({ de: a, ate: b }) }} />
          </div>
          <div className="gn-acoes">
            <button className="gn-btn" onClick={exportar} disabled={!m}>Exportar CSV</button>
            {podeClassificar && <button className="gn-btn" onClick={classificar} disabled={busy} title="Aplica as regras de apropriação aos lançamentos novos do Bling (ficam pendentes de aprovação)">{busy ? 'Classificando…' : 'Classificar lançamentos novos'}</button>}
          </div>
        </div>)}

      {msg && <p className="gn-msg">{msg}</p>}
      {dados.erro && <div className="erro" role="alert">{dados.erro}</div>}
      {!g && dados.carregando && <p className="sub">Carregando…</p>}
      {g && !g.ok && <div className="erro" role="alert">Período inválido: a data final é anterior à inicial.</div>}

      {m && g?.ok && (
        <>
          <div className="gn-resumo">
            <div><small>Receitas</small><strong>{fmt(m.cartoes.rec)}</strong></div>
            <div><small>Deduções, custos e despesas</small><strong>{fmt(m.cartoes.desp)}</strong></div>
            <div><small>Resultado</small><strong className={m.cartoes.rec - m.cartoes.desp < 0 ? 'neg' : ''}>{fmt(m.cartoes.rec - m.cartoes.desp)}</strong></div>
            <div><small>Fora do resultado</small><strong>{fmt(m.cartoes.fora)}</strong></div>
            {semQ > 0 && <div><small>Sem natureza ({semQ.toLocaleString('pt-BR')} títulos)</small><strong className="neg">{fmt(semV)}</strong></div>}
          </div>
          <p className="gn-linha">
            <span>{g.total.titulos.toLocaleString('pt-BR')} títulos · {rotBase[g.base]}</span>
            {comAnalises && cfg.mensal && <span title="Em cada célula: valor em R$; abaixo, % de participação na classe (vertical) e variação sobre o mês anterior (horizontal)">Célula: <b>R$</b> · % da classe · ▲▼ vs. mês anterior</span>}
            {m.cartoes.vp > 0 && m.cartoes.v > 0 && <span className="gn-tag" title="Classificado por regra automática; ainda não aprovado. Já entra nos números.">{pct((m.cartoes.vp / m.cartoes.v) * 100)} pendente de aprovação</span>}
          </p>

          <div className="gn-tab-wrap">
            <table className="gn">
              <thead>
                <tr>
                  <th className="nome">{cfg.dim === 'natureza' ? 'Natureza' : 'Centro de resultado'}</th>
                  {cfg.mensal && colunas.map((c) => <th key={c}>{rotMes(c)}</th>)}
                  <th>{cel === 'pct' ? '% total' : cel === 'qtd' ? 'Títulos' : 'Total'}</th>
                  {!cfg.mensal && comAnalises && <th>% vertical</th>}
                  {!cfg.mensal && cel !== 'qtd' && <th>Títulos</th>}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const sint = l.temFilho && !cfg.plana
                  const aberto = over[l.codigo] ?? l.grau < cfg.nivel
                  const t = celTotal(l)
                  const pai1 = cfg.plana ? m.noMap.get(pai(l.codigo)) : undefined
                  return (
                    <tr key={l.codigo} className={sint ? 'sint' : ''}>
                      <td className="nome" style={{ paddingLeft: cfg.plana ? undefined : `${0.6 + (l.grau - 1) * 1.1}rem` }}>
                        {sint ? <button className="exp" aria-label={aberto ? 'Recolher' : 'Expandir'} onClick={() => setOver((o) => ({ ...o, [l.codigo]: !aberto }))}>{aberto ? '▾' : '▸'}</button> : <span style={{ display: 'inline-block', width: 18 }} />}
                        <span className="cod">{l.codigo}</span>{l.nome}
                        {pai1 && <span className="gn-caminho">{pai1.nome}</span>}
                      </td>
                      {cfg.mensal && l.col.map((_, i) => {
                        if (comAnalises) {
                          const v = l.col[i], a = ah(l, i)
                          return (
                            <td key={i} className="clk" onClick={() => abrir(l, i)} title={`Participação ${av(l, i)} · variação ${a.t} sobre o mês anterior. Clique para ver os títulos.`}>
                              <div className="gn-c"><b className={v < 0 ? 'neg' : ''}>{v ? fmt(v, 0) : '—'}</b>{v !== 0 || l.col[i - 1] ? <span className="gn-sub"><span>{v ? av(l, i) : ""}</span><span className={a.cls}>{a.t}</span></span> : null}</div>
                            </td>)
                        }
                        const c = celula(l, i); return <td key={i} className={`clk ${c.cls ?? ''}`} onClick={() => abrir(l, i)} title="Clique para ver os títulos">{c.t}</td>
                      })}
                      <td className={`tot clk ${t.cls ?? ''}`} onClick={() => abrir(l, null)} title="Clique para ver os títulos do período">
                        {cfg.mensal && comAnalises
                          ? <div className="gn-c"><b>{l.tot ? fmt(l.tot, 0) : '—'}</b><span className="gn-sub"><span>{av(l, null)}</span></span></div>
                          : <>{!cfg.mensal && cel === 'pct' && l.tot !== 0 && <span className="gn-barra" style={{ width: Math.min(80, (Math.abs(l.tot) / baseDe(l, null)) * 80) }} />}{t.t}</>}
                      </td>
                      {!cfg.mensal && comAnalises && <td className="clk" onClick={() => abrir(l, null)}>{l.tot !== 0 && <span className="gn-barra" style={{ width: Math.min(80, (Math.abs(l.tot) / baseDe(l, null)) * 80) }} />}{av(l, null)}</td>}
                      {!cfg.mensal && cel !== 'qtd' && <td className="mudo clk" onClick={() => abrir(l, null)}>{l.q.toLocaleString('pt-BR')}</td>}
                    </tr>
                  )
                })}
                {cfg.dim === 'natureza' && semQ > 0 && (
                  <tr className="sem">
                    <td className="nome">Sem natureza (a classificar)</td>
                    {cfg.mensal && semPorMes.map((v, i) => <td key={i} className={v ? 'clk' : ''} onClick={() => v && abrir(null, i)}>{mostraValor ? (v ? fmt(v, 0) : '—') : '—'}</td>)}
                    <td className="tot clk" onClick={() => abrir(null, null)}>{mostraValor ? fmt(semV, cfg.mensal ? 0 : 2) : cel === 'qtd' ? semQ.toLocaleString('pt-BR') : '—'}</td>
                    {!cfg.mensal && comAnalises && <td />}
                    {!cfg.mensal && cel !== 'qtd' && <td>{semQ.toLocaleString('pt-BR')}</td>}
                  </tr>)}
                {visiveis.length === 0 && <tr><td className="nome" colSpan={colunas.length + 3}>Nenhum lançamento classificado neste período e filtro.</td></tr>}
                {visiveis.length > 0 && mostraValor && classe === '' && (
                  <tr className="res">
                    <td className="nome">Resultado (receitas − despesas)</td>
                    {cfg.mensal && m.resultado.map((v, i) => {
                      const a = i > 0 ? m.resultado[i - 1] : 0
                      const d = a ? ((v - a) / Math.abs(a)) * 100 : null
                      return (
                        <td key={i}>
                          {comAnalises
                            ? <div className="gn-c"><b className={v < 0 ? 'neg' : ''}>{fmt(v, 0)}</b><span className="gn-sub"><span /><span className={d === null || Math.abs(d) < 0.05 ? 'mudo' : d > 0 ? 'bom' : 'mau'}>{d === null ? '—' : `${d > 0 ? '▲' : '▼'} ${pct(Math.abs(d))}`}</span></span></div>
                            : <span className={v < 0 ? 'neg' : ''}>{fmt(v, 0)}</span>}
                        </td>)
                    })}
                    <td className={`tot ${m.resultado.reduce((s, x) => s + x, 0) < 0 ? 'neg' : ''}`}>{fmt(m.resultado.reduce((s, x) => s + x, 0), cfg.mensal ? 0 : 2)}</td>
                    {!cfg.mensal && comAnalises && <td />}
                    {!cfg.mensal && <td />}
                  </tr>)}
              </tbody>
            </table>
          </div>
          <p className="gn-nota">
            Em “R$ + análises”, cada célula mostra o valor e, abaixo, a participação na classe (análise vertical) e a variação sobre o mês anterior (análise horizontal; verde = melhora, vermelho = piora).
            Clique em qualquer valor para ver os títulos dele; use ▸ para abrir um grupo e “Personalizar” para mudar linhas, colunas, nível e filtros.
          </p>
        </>)}
      {det && <DetalheNat ctx={ctx} det={det} per={per} base={base} onFechar={() => setDet(null)} />}
    </div>
  )
}
