import { useId, useMemo, useState } from 'react'
import type { Contexto } from '../App'
import {
  apiGestao, type FinCard, type GestaoBase, type GestaoCanalLinha, type GestaoFinanceiro, type GestaoFinLinha, type GestaoLinha,
  type GestaoLancamento, type GestaoResumo, type GestaoSerie, type GestaoTipo, type GestaoTitulo,
} from '../api'
import { Abas, Modal, useCarregar, Titulo } from '../ui'
import PeriodoData from '../PeriodoData'
import GradeDados, { type Coluna } from '../GradeDados'
import AbaNatureza from './GestaoNatureza'

// Painel de Gestão. Duas abas: Vendas (pedidos ou notas, por canal, com detalhe ao clicar) e Financeiro (a pagar/pagas,
// a receber/recebidas, fluxo de caixa e saldo inicial por parâmetro). Os números vêm prontos do banco (api.gestao_*);
// aqui só se desenha. Valores em R$ só chegam para admin/gestor/financeiro.

const CSS = `
.gs { --g1:#3987e5; --g2:#d95926; --g3:#199e70; --g4:#c98500; --g5:#d55181; --gred:#d9342b; }
:root[data-tema='ane'] .gs { --g1:#2a78d6; --g2:#eb6834; --g3:#1baf7a; --g4:#eda100; --g5:#e87ba4; --gred:#c62828; }
.gs-topo { display:flex; gap:12px; flex-wrap:wrap; align-items:center; justify-content:space-between; margin-bottom:8px; }
.gs-topo h1 { margin:0; font-size:1.25rem; }
.gs-ctl { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.gs-seg { display:inline-flex; gap:4px; flex-wrap:wrap; }
.gs-seg button { background: var(--card2); color: var(--txt); border:1px solid var(--borda); border-radius:999px; padding:.28rem .8rem; font-size:.84rem; font-weight:600; }
.gs-seg button.on { background: var(--g1); border-color: var(--g1); color:#fff; }
.gs-base { display:flex; gap:8px; align-items:center; color: var(--mudo); font-size:.8rem; }
.gs-kpis { display:grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap:12px; margin-bottom:12px; }
.gs-kpi { background: var(--card); border:1px solid var(--borda); border-radius:14px; padding:14px 16px; box-shadow: var(--sombra); text-align:left; color: var(--txt); font:inherit; }
button.gs-kpi { cursor:pointer; transition: transform .15s ease, border-color .15s ease; }
button.gs-kpi:hover { transform: translateY(-2px); border-color: var(--g1); }
button.gs-kpi.on { border-color: var(--g1); box-shadow: 0 0 0 2px var(--g1) inset; }
.gs-kpi small { display:block; color: var(--mudo); font-size:.78rem; letter-spacing:.02em; }
.gs-kpi strong { display:block; font-size:1.5rem; font-variant-numeric: tabular-nums; margin:2px 0; }
.gs-kpi .sub2 { font-size:.8rem; color: var(--mudo); display:block; }
.gs-var { font-weight:700; font-size:.82rem; }
.gs-var.bom { color: var(--g3); } .gs-var.mau { color: var(--g2); } .gs-var.neutro { color: var(--mudo); }
.gs-card { background: var(--card); border:1px solid var(--borda); border-radius:16px; padding:16px; margin-bottom:12px; box-shadow: var(--sombra); }
.gs-card h2 { margin:0 0 4px; font-size:1.02rem; }
.gs-grade { display:grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap:12px; }
.gs-nota { color: var(--mudo); font-size:.82rem; margin:6px 0 0; }
.gs-aviso { border:1px solid var(--borda); border-left:3px solid var(--g4); background: var(--card2); border-radius:10px; padding:8px 12px; font-size:.86rem; margin:0 0 12px; }
.gs-aviso.mau { border-left-color: var(--gred); }
.gs-leg { display:flex; gap:14px; flex-wrap:wrap; font-size:.82rem; color: var(--mudo); margin:4px 0 6px; }
.gs-leg i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; }
.gs-tip { position:absolute; z-index:5; pointer-events:none; background: var(--card2); border:1px solid var(--borda); border-radius:10px; padding:8px 12px; font-size:.84rem; box-shadow: 0 12px 28px -10px rgba(0,0,0,.55); min-width:170px; }
.gs-tip b { display:block; font-variant-numeric: tabular-nums; }
.gs-area { position:relative; }
.gs-barra { transform-box: fill-box; transform-origin: 50% 100%; animation: gs-sobe .5s cubic-bezier(.22,.8,.24,1) both; }
@keyframes gs-sobe { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .gs-barra { animation: none; } }
.gs-canal { display:grid; grid-template-columns: 170px 1fr auto; gap:10px; align-items:center; width:100%; background:none; border:0; border-radius:10px; padding:6px 8px; color: var(--txt); font:inherit; text-align:left; cursor:pointer; }
.gs-canal:hover, .gs-canal.on { background: var(--card2); }
.gs-canal.vazio { opacity:.55; }
.gs-canal .trilho { height:14px; background: var(--card2); border-radius:7px; overflow:hidden; }
.gs-canal .barra { height:100%; background: var(--g1); border-radius:7px; min-width:0; transition: width .4s ease; }
.gs-canal .num { font-variant-numeric: tabular-nums; font-size:.85rem; text-align:right; white-space:nowrap; }
.gs-comp { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin:0 0 10px; }
.gs-comp-t { color: var(--mudo); font-size:.8rem; margin-right:2px; }
.gs-chip { background: var(--card2); border:1px solid var(--borda); border-radius:999px; padding:.18rem .7rem; font-size:.82rem; font-weight:600; }
.gs-chip.forte { background: var(--g1); border-color: var(--g1); color:#fff; }
.gs-chip.receber { border-color: var(--g3); } .gs-chip.pagar { border-color: var(--g2); }
.gs-pill { display:inline-block; background: var(--card2); border:1px solid var(--borda); border-radius:999px; padding:.1rem .6rem; font-size:.78rem; margin-left:6px; font-weight:500; }
.gs-pill.pagar { border-color: var(--g2); } .gs-pill.receber { border-color: var(--g3); }
.gs-saldo { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
.gs-saldo label { display:flex; flex-direction:column; gap:2px; font-size:.78rem; color: var(--mudo); }
.gs-saldo input { background: var(--card2); color: var(--txt); border:1px solid var(--borda); border-radius:8px; padding:.35rem .6rem; font-size:.9rem; }
@media (max-width: 640px) { .gs-canal { grid-template-columns: 1fr; } }
`

const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'))
const dataBr = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const somaDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const compacto = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1).replace('.', ',')} mi`
  if (a >= 1_000) return `${s}${(a / 1_000).toFixed(a >= 10_000 ? 0 : 1).replace('.', ',')} mil`
  return `${s}${a.toFixed(0)}`
}
const ROT_TIPO: Record<GestaoTipo, string> = { venda: 'Vendas', cancelamento: 'Cancelamentos', devolucao: 'Devoluções' }
const ROT_RECEB: Record<string, string> = { recebido: 'Recebido', parcial: 'Parcial', em_aberto: 'Em aberto', sem_conta: 'Sem conta' }

function Var({ v, inverter = false }: { v: number | null | undefined; inverter?: boolean }) {
  if (v == null) return <span className="gs-var neutro">sem base anterior</span>
  const sobe = v > 0
  const bom = v === 0 ? null : inverter ? !sobe : sobe
  return <span className={`gs-var ${bom == null ? 'neutro' : bom ? 'bom' : 'mau'}`}>{sobe ? '▲' : v < 0 ? '▼' : '='} {Math.abs(v).toFixed(1).replace('.', ',')}%</span>
}

function Kpi({ rot, valor, sub, variacao, inverter, onClick, ativo }: { rot: string; valor: string; sub?: string; variacao?: number | null; inverter?: boolean; onClick?: () => void; ativo?: boolean }) {
  const corpo = (
    <>
      <small>{rot}</small>
      <strong>{valor}</strong>
      {variacao !== undefined && <span><Var v={variacao} inverter={inverter} /> <span className="sub2" style={{ display: 'inline' }}>vs. período anterior</span></span>}
      {sub && <span className="sub2">{sub}</span>}
    </>
  )
  return onClick
    ? <button type="button" className={ativo ? 'gs-kpi on' : 'gs-kpi'} onClick={onClick} title="Clique para ver os lançamentos">{corpo}</button>
    : <div className="gs-kpi">{corpo}</div>
}

// ------------------------------------------------------------------ períodos
type Gran = 'dia' | 'semana' | 'mes'
interface Per { de: string; ate: string }
const presetsVendas = () => {
  const h = new Date(), hoje = iso(h)
  return [
    { id: '7', rotulo: '7 dias', de: iso(somaDias(h, -6)), ate: hoje },
    { id: '30', rotulo: '30 dias', de: iso(somaDias(h, -29)), ate: hoje },
    { id: 'mes', rotulo: 'Mês atual', de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: hoje },
    { id: 'ant', rotulo: 'Mês anterior', de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)) },
    { id: '90', rotulo: '90 dias', de: iso(somaDias(h, -89)), ate: hoje },
    { id: 'ano', rotulo: 'Este ano', de: iso(new Date(h.getFullYear(), 0, 1)), ate: hoje },
  ]
}
const presetsFin = () => {
  const h = new Date(), hoje = iso(h)
  return [
    { id: 'mes', rotulo: 'Mês atual', de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) },
    { id: 'p7', rotulo: 'Próx. 7 dias', de: hoje, ate: iso(somaDias(h, 6)) },
    { id: 'p30', rotulo: 'Próx. 30 dias', de: hoje, ate: iso(somaDias(h, 29)) },
    { id: 'u30', rotulo: 'Últimos 30 dias', de: iso(somaDias(h, -29)), ate: hoje },
    { id: 'ant', rotulo: 'Mês anterior', de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)) },
    { id: 'prox', rotulo: 'Próximo mês', de: iso(new Date(h.getFullYear(), h.getMonth() + 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth() + 2, 0)) },
  ]
}

function BarraPeriodo({ per, setPer, lista }: { per: Per; setPer: (p: Per) => void; lista: { id: string; rotulo: string; de: string; ate: string }[] }) {
  const ativo = lista.find((p) => p.de === per.de && p.ate === per.ate)?.id ?? null
  return (
    <div className="gs-ctl">
      <div className="gs-seg">{lista.map((p) => <button key={p.id} className={p.id === ativo ? 'on' : ''} onClick={() => setPer({ de: p.de, ate: p.ate })}>{p.rotulo}</button>)}</div>
      <PeriodoData ini={per.de} fim={per.ate} onAplicar={(a, b) => { if (a && b) setPer({ de: a, ate: b }) }} />
    </div>
  )
}

function Granularidade({ valor, efetiva, onMudar }: { valor: Gran; efetiva?: Gran; onMudar: (g: Gran) => void }) {
  const atual = efetiva ?? valor
  return <div className="gs-seg">{(['dia', 'semana', 'mes'] as Gran[]).map((g) => <button key={g} className={atual === g ? 'on' : ''} onClick={() => onMudar(g)}>{g === 'dia' ? 'Dia' : g === 'semana' ? 'Semana' : 'Mês'}</button>)}</div>
}

// ------------------------------------------------------------------ gráficos de vendas
interface Selecao { de: string; ate: string; tipo: GestaoTipo; canal: string | null; titulo: string }

function Cascata({ r, onSel }: { r: GestaoResumo; onSel: (t: GestaoTipo) => void }) {
  const W = 520, H = 250, ml = 62, mr = 12, mt = 20, mb = 34
  const passos = r.waterfall.filter((p) => p.valor != null)
  if (passos.length === 0) return <p className="gs-nota">Sem valores para o seu perfil.</p>
  let acc = 0
  const barras = passos.map((p) => {
    const v = p.valor as number
    if (p.total) { acc = v; return { rot: p.etapa, de: 0, ate: v, v, total: true } }
    const de = acc, ate = acc + v; acc = ate
    return { rot: p.etapa, de, ate, v, total: false }
  })
  const max = Math.max(...barras.map((b) => Math.max(b.de, b.ate)), 1)
  const iw = W - ml - mr, ih = H - mt - mb, passo = iw / barras.length, lw = Math.min(passo * 0.55, 90)
  const y = (v: number) => mt + ih - (v / max) * ih
  const tipoDe = (rot: string): GestaoTipo => (rot === 'Devoluções' ? 'devolucao' : 'venda')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Cascata: vendas, devoluções e venda líquida">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={ml} x2={W - mr} y1={y(max * f)} y2={y(max * f)} stroke="var(--borda)" strokeDasharray={f === 0 ? undefined : '3 4'} />
          <text x={ml - 8} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill="var(--mudo)">{compacto(max * f)}</text>
        </g>))}
      {barras.map((b, i) => {
        const x0 = ml + passo * i + (passo - lw) / 2
        const top = y(Math.max(b.de, b.ate)), alt = Math.max(2, Math.abs(y(b.de) - y(b.ate)))
        const cor = b.total ? 'var(--g3)' : b.v < 0 ? 'var(--g2)' : 'var(--g1)'
        return (
          <g key={b.rot} style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-label={`${b.rot}: ${brl(b.v)}. Ver lançamentos`}
             onClick={() => onSel(tipoDe(b.rot))} onKeyDown={(e) => { if (e.key === 'Enter') onSel(tipoDe(b.rot)) }}>
            <rect x={x0 - 8} y={mt} width={lw + 16} height={ih} fill="transparent" />
            <rect className="gs-barra" x={x0} y={top} width={lw} height={alt} rx={5} fill={cor} style={{ animationDelay: `${i * 90}ms` }} />
            <text x={x0 + lw / 2} y={top - 6} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="var(--txt)">{brl(b.v)}</text>
            <text x={x0 + lw / 2} y={H - mb + 18} textAnchor="middle" fontSize={11.5} fill="var(--mudo)">{b.rot}</text>
            {i < barras.length - 1 && <line x1={x0 + lw} x2={x0 + passo} y1={y(b.ate)} y2={y(b.ate)} stroke="var(--mudo)" strokeDasharray="3 3" opacity={0.6} />}
          </g>)
      })}
    </svg>
  )
}

function SerieGrafico({ s, onSel, selecionada }: { s: GestaoSerie; onSel: (l: GestaoLinha, t: GestaoTipo) => void; selecionada: string | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720, H = 280, ml = 54, mr = 12, mt = 16, mb = 34
  const cv = s.ve_valores
  const val = (l: GestaoLinha, t: GestaoTipo) => (t === 'venda' ? (cv ? (l.venda_valor ?? 0) : l.venda_qtd) : t === 'cancelamento' ? (cv ? (l.cancelamento_valor ?? 0) : l.cancelamento_qtd) : (cv ? (l.devolucao_valor ?? 0) : l.devolucao_qtd))
  const TIPOS: { t: GestaoTipo; cor: string }[] = [{ t: 'venda', cor: 'var(--g1)' }, { t: 'cancelamento', cor: 'var(--g4)' }, { t: 'devolucao', cor: 'var(--g2)' }]
  const n = s.linhas.length
  const max = Math.max(...s.linhas.flatMap((l) => TIPOS.map((x) => val(l, x.t))), 1)
  const iw = W - ml - mr, ih = H - mt - mb, passo = iw / Math.max(n, 1)
  const gw = Math.min(passo * 0.84, 54), bw = gw / 3 - 1
  const y = (v: number) => mt + ih - (v / max) * ih
  const cada = Math.ceil(n / 12)
  const fmt = (v: number) => (cv ? compacto(v) : String(Math.round(v)))
  const h = hover != null ? s.linhas[hover] : null
  return (
    <div className="gs-area" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Vendas, cancelamentos e devoluções por período">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={ml} x2={W - mr} y1={y(max * f)} y2={y(max * f)} stroke="var(--borda)" strokeDasharray={f === 0 ? undefined : '3 4'} />
            <text x={ml - 8} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill="var(--mudo)">{fmt(max * f)}</text>
          </g>))}
        {s.linhas.map((l, i) => {
          const cx = ml + passo * i + passo / 2
          const esm = (hover != null && hover !== i) || (selecionada != null && selecionada !== l.chave)
          return (
            <g key={l.chave} opacity={esm ? 0.45 : 1}>
              {TIPOS.map((x, k) => {
                const v = val(l, x.t), a = Math.max(v > 0 ? 2 : 0, y(0) - y(v)), x0 = cx - gw / 2 + k * (bw + 1)
                return (
                  <g key={x.t} style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-label={`${l.rotulo}, ${ROT_TIPO[x.t]}. Ver lançamentos`}
                     onPointerEnter={() => setHover(i)} onClick={() => onSel(l, x.t)} onKeyDown={(e) => { if (e.key === 'Enter') onSel(l, x.t) }}>
                    <rect x={x0} y={mt} width={bw} height={ih} fill="transparent" />
                    <rect className="gs-barra" x={x0} y={y(0) - a} width={bw} height={a} rx={3} fill={x.cor} />
                  </g>)
              })}
              {i % cada === 0 && <text x={cx} y={H - mb + 17} textAnchor="middle" fontSize={11} fill="var(--mudo)">{l.rotulo}</text>}
            </g>)
        })}
      </svg>
      {h && (
        <div className="gs-tip" role="tooltip" style={{ left: `${Math.min(68, (hover! / Math.max(n, 1)) * 100)}%`, top: 8 }}>
          <span>{h.rotulo}{h.de !== h.ate && ` a ${dataBr(h.ate).slice(0, 5)}`}</span>
          <b>Vendas: {cv ? brl(h.venda_valor) : '—'} · {h.venda_qtd}</b>
          <b>Cancelamentos: {cv ? brl(h.cancelamento_valor) : '—'} · {h.cancelamento_qtd}</b>
          <b>Devoluções: {cv ? brl(h.devolucao_valor) : '—'} · {h.devolucao_qtd}</b>
          <span>Clique numa barra para ver os lançamentos</span>
        </div>)}
    </div>
  )
}

// ------------------------------------------------------------------ canais
function Canais({ linhas, ve, ativo, onSel }: { linhas: GestaoCanalLinha[]; ve: boolean; ativo: string | null; onSel: (c: GestaoCanalLinha) => void }) {
  const medida = (l: GestaoCanalLinha) => (ve ? (l.valor ?? 0) : l.qtd)
  const max = Math.max(...linhas.map(medida), 1)
  const total = linhas.reduce((s, l) => s + medida(l), 0)
  return (
    <div role="list">
      {linhas.map((l) => (
        <button key={l.canal} type="button" role="listitem" className={`gs-canal${l.qtd === 0 ? ' vazio' : ''}${ativo === l.canal ? ' on' : ''}`} onClick={() => onSel(l)}
                title={l.qtd === 0 ? 'Sem movimento no período' : 'Clique para ver os lançamentos deste canal'}>
          <span>{l.rotulo}</span>
          <span className="trilho"><span className="barra" style={{ display: 'block', width: `${(medida(l) / max) * 100}%` }} /></span>
          <span className="num">
            {ve ? brl(l.valor) : `${num(l.qtd)} ped.`}
            <small style={{ color: 'var(--mudo)' }}> · {num(l.qtd)} {ve ? 'ped.' : ''}{total > 0 && ` · ${((medida(l) / total) * 100).toFixed(0)}%`}</small>
            {l.qtd_ant > 0 || l.qtd > 0 ? <> <Var v={ve ? l.var_valor : l.var_qtd} /></> : null}
          </span>
        </button>))}
    </div>
  )
}

function MapearLojas({ ctx, onFechar, onSalvo }: { ctx: Contexto; onFechar: () => void; onSalvo: () => void }) {
  const cfg = useCarregar(() => apiGestao.canaisConfig(ctx.empresa), [ctx.empresa])
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  async function mudar(loja: string, canal: string) {
    setSalvando(loja); setErro(null)
    try { await apiGestao.salvarCanal(ctx.empresa, loja, canal); cfg.recarregar(); onSalvo() } catch (e) { setErro((e as Error).message) } finally { setSalvando(null) }
  }
  return (
    <Modal titulo="Canais por loja do Bling" onFechar={onFechar} larga>
      <p className="sub">O Bling identifica cada pedido pela loja (canal de venda) de origem. Diga a qual canal cada loja corresponde; o painel agrupa as vendas por esse canal. A loja 0 é o pedido sem loja (balcão).</p>
      {cfg.erro && <div className="erro" role="alert">{cfg.erro}</div>}
      {erro && <div className="erro" role="alert">{erro}</div>}
      {cfg.dados?.ok && (
        <table>
          <thead><tr><th>Loja do Bling</th><th style={{ textAlign: 'right' }}>Pedidos</th><th style={{ textAlign: 'right' }}>Valor</th><th>Último pedido</th><th>Canal</th></tr></thead>
          <tbody>{cfg.dados.lojas.map((l) => (
            <tr key={l.loja_id}>
              <td>{l.loja_id === '0' ? '0 (sem loja / balcão)' : l.loja_id}{!l.mapeada && <span className="gs-pill">não mapeada</span>}</td>
              <td style={{ textAlign: 'right' }}>{num(l.pedidos)}</td>
              <td style={{ textAlign: 'right' }}>{brl(l.valor)}</td>
              <td>{dataBr(l.ultima)}</td>
              <td><select value={l.canal} disabled={salvando === l.loja_id} onChange={(e) => void mudar(l.loja_id, e.target.value)} aria-label={`Canal da loja ${l.loja_id}`}>
                {cfg.dados!.canais.map((c) => <option key={c.canal} value={c.canal}>{c.rotulo}</option>)}</select></td>
            </tr>))}</tbody>
        </table>)}
      {!cfg.dados && cfg.carregando && <p className="sub">Carregando…</p>}
    </Modal>
  )
}

// ------------------------------------------------------------------ detalhe (grade de lançamentos)
type Lanc = GestaoLancamento
type Titulo = GestaoTitulo
function DetalheVendas({ ctx, base, sel, canalRot, onFechar }: { ctx: Contexto; base: GestaoBase; sel: Selecao; canalRot?: string; onFechar: () => void }) {
  const d = useCarregar(() => apiGestao.lancamentos(ctx.empresa, sel.de, sel.ate, sel.tipo, sel.canal, base, 300), [ctx.empresa, sel.de, sel.ate, sel.tipo, sel.canal, base])
  const r = d.dados
  const veValor = r?.ok ? r.ve_valores : false
  const colunas = useMemo<Coluna<Lanc>[]>(() => {
    const c: Coluna<Lanc>[] = [
      { id: 'numero', titulo: 'Nº', texto: (x) => x.numero, valor: (x) => Number(x.numero) || x.numero },
      { id: 'data', titulo: 'Data', texto: (x) => dataBr(x.data), valor: (x) => x.data },
      { id: 'cliente', titulo: 'Cliente', texto: (x) => x.cliente, max: 300 },
      { id: 'canal', titulo: 'Canal', texto: (x) => x.canal_rotulo },
      { id: 'situacao', titulo: 'Situação', texto: (x) => x.situacao },
    ]
    if (base === 'pedido' && sel.tipo !== 'devolucao') c.push({ id: 'receb', titulo: 'Recebimento', texto: (x) => (x.recebimento ? ROT_RECEB[x.recebimento] ?? x.recebimento : '—') })
    if (veValor) c.push({ id: 'valor', titulo: 'Valor', texto: (x) => brl(x.valor), valor: (x) => x.valor ?? 0, direita: true, formatar: brl })
    return c
  }, [base, sel.tipo, veValor])
  return (
    <Modal titulo={sel.titulo} onFechar={onFechar} larga>
      <div className="gs-comp" aria-live="polite">
        <span className="gs-comp-t">Composição de</span>
        <span className="gs-chip">{ROT_TIPO[sel.tipo]}</span>
        <span className="gs-chip">{sel.de === sel.ate ? dataBr(sel.de) : `${dataBr(sel.de)} a ${dataBr(sel.ate)}`}</span>
        <span className="gs-chip">{sel.canal ? (canalRot ?? sel.canal) : 'Todos os canais'}</span>
        <span className="gs-chip">Base: {base === 'pedido' ? 'pedidos' : 'notas fiscais'}</span>
        {r?.ok && <span className="gs-chip forte">{num(r.qtd)} {sel.tipo === 'devolucao' || base === 'nota' ? 'notas' : 'pedidos'}{r.ve_valores && ` · ${brl(r.valor_total)}`}</span>}
      </div>
      {sel.tipo === 'devolucao' && <p className="gs-nota" style={{ marginTop: 0 }}>Notas de entrada com CFOP 1202/2202 (devolução fiscal); não têm canal.</p>}
      {d.erro && <div className="erro" role="alert">{d.erro}</div>}
      {d.carregando && !r && <p className="gs-nota">Carregando lançamentos…</p>}
      {r?.ok && r.itens.length === 0 && <p className="gs-nota">Nenhum lançamento nesse recorte.</p>}
      {r?.ok && r.itens.length > 0 && <GradeDados id={`gestao.vendas.${base}.${sel.tipo}`} titulo={`${sel.titulo} (${dataBr(sel.de)} a ${dataBr(sel.ate)})`} colunas={colunas} linhas={r.itens} chave={(x) => x.id} />}
      {r?.ok && r.qtd > r.itens.length && <p className="gs-nota">Mostrando os {r.itens.length} mais recentes de {num(r.qtd)}. Afunile o período para ver os demais.</p>}
    </Modal>
  )
}

// ------------------------------------------------------------------ aba Vendas
function AbaVendas({ ctx, base }: { ctx: Contexto; base: GestaoBase }) {
  const lista = useMemo(presetsVendas, [])
  const [per, setPer] = useState<Per>({ de: lista[2].de, ate: lista[2].ate })
  const [gran, setGran] = useState<Gran>('dia')
  const [sel, setSel] = useState<Selecao | null>(null)
  const [mapear, setMapear] = useState(false)
  const resumo = useCarregar(() => apiGestao.resumo(ctx.empresa, per.de, per.ate, base), [ctx.empresa, per.de, per.ate, base])
  const serie = useCarregar(() => apiGestao.serie(ctx.empresa, per.de, per.ate, gran, base), [ctx.empresa, per.de, per.ate, gran, base])
  const canais = useCarregar(() => apiGestao.porCanal(ctx.empresa, per.de, per.ate, base), [ctx.empresa, per.de, per.ate, base])
  const r = resumo.dados
  const ve = r?.ve_valores ?? false
  const podeMapear = ctx.papeis.some((p) => p === 'admin' || p === 'gestor' || p === 'superadmin')
  const nomeBase = base === 'pedido' ? 'pedidos de venda' : 'notas fiscais de saída'
  const abrir = (tipo: GestaoTipo, de: string, ate: string, titulo: string, canal: string | null = null) => setSel({ tipo, de, ate, canal, titulo })
  const variaQtd = (b: { qtd: number; qtd_ant: number }) => (b.qtd_ant > 0 ? ((b.qtd - b.qtd_ant) / b.qtd_ant) * 100 : null)
  const un = base === 'pedido' ? 'pedidos' : 'notas'

  return (
    <div>
      <div className="gs-topo"><BarraPeriodo per={per} setPer={(p) => { setPer(p); setSel(null) }} lista={lista} /></div>
      {resumo.erro && <div className="erro" role="alert">{resumo.erro}</div>}
      {!r && resumo.carregando && <p className="sub">Carregando…</p>}
      {r && !r.ok && <div className="erro" role="alert">Período inválido: a data final é anterior à inicial.</div>}

      {r?.ok && (
        <>
          <p className="gs-nota" style={{ marginTop: 0 }}>
            Base: {nomeBase} · {dataBr(r.periodo.de)} a {dataBr(r.periodo.ate)} ({r.periodo.dias} {r.periodo.dias === 1 ? 'dia' : 'dias'}) · comparado com {dataBr(r.periodo_anterior.de)} a {dataBr(r.periodo_anterior.ate)}
            {r.primeira_nota && r.periodo_anterior.de < r.primeira_nota && ` · a base começa em ${dataBr(r.primeira_nota)}, então o período anterior pode estar incompleto`}
          </p>
          <div className="gs-kpis">
            <Kpi rot={base === 'pedido' ? 'Vendas (pedidos)' : 'Faturamento (notas)'} valor={ve ? brl(r.faturamento.valor) : `${num(r.faturamento.qtd)} ${un}`} sub={`${num(r.faturamento.qtd)} ${un} válidos`}
                 variacao={ve ? r.faturamento.var_valor : r.faturamento.var_qtd ?? variaQtd(r.faturamento)} ativo={sel?.tipo === 'venda' && !sel.canal} onClick={() => abrir('venda', r.periodo.de, r.periodo.ate, 'Vendas do período')} />
            <Kpi rot="Cancelamentos" valor={`${num(r.cancelamentos.qtd)} ${un}`} sub={ve && r.cancelamentos.valor != null ? `${brl(r.cancelamentos.valor)} · ${r.taxa_cancelamento == null ? '—' : r.taxa_cancelamento.toFixed(1).replace('.', ',')}% das tentativas` : undefined}
                 variacao={r.cancelamentos.var_qtd ?? variaQtd(r.cancelamentos)} inverter ativo={sel?.tipo === 'cancelamento'} onClick={() => abrir('cancelamento', r.periodo.de, r.periodo.ate, 'Cancelamentos do período')} />
            <Kpi rot="Devoluções" valor={ve ? brl(r.devolucoes.valor) : `${num(r.devolucoes.qtd)} notas`} sub={`${num(r.devolucoes.qtd)} notas de entrada (CFOP 1202/2202)`}
                 variacao={ve ? r.devolucoes.var_valor : variaQtd(r.devolucoes)} inverter ativo={sel?.tipo === 'devolucao'} onClick={() => abrir('devolucao', r.periodo.de, r.periodo.ate, 'Devoluções do período')} />
            {ve && <Kpi rot="Venda líquida" valor={brl(r.venda_liquida.valor)} sub="vendas − devoluções" variacao={r.venda_liquida.var_valor} />}
            {ve && <Kpi rot="Ticket médio" valor={brl(r.ticket_medio)} sub={`vendas ÷ ${un} válidos`} />}
            <Kpi rot="Taxa de devolução" valor={r.taxa_devolucao == null ? '—' : `${r.taxa_devolucao.toFixed(1).replace('.', ',')}%`} sub="devoluções ÷ vendas" />
          </div>

          {sel && <DetalheVendas ctx={ctx} base={base} sel={sel} canalRot={canais.dados?.ok ? canais.dados.linhas.find((l) => l.canal === sel.canal)?.rotulo : undefined} onFechar={() => setSel(null)} />}

          <div className="gs-grade">
            <section className="gs-card">
              <h2>Vendas por canal</h2>
              <p className="gs-nota" style={{ marginTop: 0 }}>Canal definido pela loja do Bling de cada {base === 'pedido' ? 'pedido' : 'nota'}. Clique num canal para ver os lançamentos.</p>
              {canais.erro && <div className="erro" role="alert">{canais.erro}</div>}
              {canais.dados?.ok && <Canais linhas={canais.dados.linhas} ve={canais.dados.ve_valores} ativo={sel?.canal ?? null}
                onSel={(c) => abrir('venda', r.periodo.de, r.periodo.ate, `Vendas · ${c.rotulo}`, c.canal)} />}
              {canais.dados?.ok && canais.dados.lojas_nao_mapeadas > 0 && (
                <p className="gs-aviso" style={{ marginTop: 8 }}>{canais.dados.lojas_nao_mapeadas} {canais.dados.lojas_nao_mapeadas === 1 ? 'loja do Bling ainda não está associada' : 'lojas do Bling ainda não estão associadas'} a um canal e aparece{canais.dados.lojas_nao_mapeadas === 1 ? '' : 'm'} em “Outros / não mapeado”.</p>)}
              {podeMapear && <button className="sec" style={{ marginTop: 8 }} onClick={() => setMapear(true)}>Mapear lojas do Bling → canais</button>}
            </section>
            {ve && (
              <section className="gs-card">
                <h2>Das vendas à venda líquida</h2>
                <p className="gs-nota" style={{ marginTop: 0 }}>Quanto das vendas permanece depois das devoluções. Clique numa barra para ver os lançamentos.</p>
                <Cascata r={r} onSel={(t) => abrir(t, r.periodo.de, r.periodo.ate, t === 'devolucao' ? 'Devoluções do período' : 'Vendas do período')} />
              </section>)}
          </div>

          <section className="gs-card">
            <div className="gs-topo" style={{ marginBottom: 0 }}>
              <h2>Vendas × cancelamentos × devoluções</h2>
              <Granularidade valor={gran} efetiva={serie.dados?.granularidade} onMudar={(g) => { setGran(g) }} />
            </div>
            <div className="gs-leg"><span><i style={{ background: 'var(--g1)' }} />Vendas</span><span><i style={{ background: 'var(--g4)' }} />Cancelamentos</span><span><i style={{ background: 'var(--g2)' }} />Devoluções</span></div>
            {serie.erro && <div className="erro" role="alert">{serie.erro}</div>}
            {serie.dados?.ok && serie.dados.linhas.length > 0 && (
              <SerieGrafico s={serie.dados} selecionada={sel && serie.dados.linhas.find((l) => l.de === sel.de && l.ate === sel.ate)?.chave || null}
                onSel={(l, t) => abrir(t, l.de, l.ate, `${ROT_TIPO[t]} · ${l.rotulo}${l.de !== l.ate ? ` a ${dataBr(l.ate).slice(0, 5)}` : ''}`)} />)}
            {serie.dados?.ok && serie.dados.granularidade !== gran && <p className="gs-nota">Período longo: agrupei por {serie.dados.granularidade === 'semana' ? 'semana' : 'mês'} para o gráfico ficar legível.</p>}
            {!serie.dados && serie.carregando && <p className="gs-nota">Carregando…</p>}
          </section>

          <p className="gs-nota">
            Regras: venda = {base === 'pedido' ? 'pedido do Bling em situação válida (cancelado e “em digitação” ficam fora)' : 'nota de saída não cancelada, rejeitada ou denegada'}; cancelamento = o que fica de fora dessa regra; devolução = nota de entrada com CFOP 1202/2202 (única fonte de devolução hoje, por isso é fiscal nas duas bases).
            {r.base_ate && ` Base atualizada até ${new Date(r.base_ate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`}
            {!ve && ' Seu perfil vê apenas quantidades; valores em R$ ficam com administração, gestão e financeiro.'}
          </p>
        </>)}
      {mapear && <MapearLojas ctx={ctx} onFechar={() => setMapear(false)} onSalvo={() => { canais.recarregar(); resumo.recarregar(); serie.recarregar(); setSel(null) }} />}
    </div>
  )
}

// ------------------------------------------------------------------ aba Financeiro
interface SelFin { de: string; ate: string; lado: 'todos' | 'pagar' | 'receber'; status: 'todos' | 'aberto' | 'liquidado'; titulo: string }

const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => DIA_SEM[new Date(`${iso.slice(0, 10)}T12:00:00`).getDay()]

// Saldo em degrau: o saldo só muda quando entra ou sai dinheiro, então fica reto no dia e sobe/cai de uma vez no dia do movimento
// (a curva suave dava a impressão de subida gradual antes do dia real).
function degrau(saldos: number[], esq: number, passo: number, y: (v: number) => number): string {
  if (saldos.length === 0) return ''
  let out = `M${esq.toFixed(1)},${y(saldos[0]).toFixed(1)} H${(esq + passo).toFixed(1)}`
  for (let i = 1; i < saldos.length; i++) out += ` V${y(saldos[i]).toFixed(1)} H${(esq + passo * (i + 1)).toFixed(1)}`
  return out
}

// Marcas "redondas" do eixo único (1, 2, 2,5, 5 × 10ⁿ), incluindo valores negativos.
function marcasEixo(min: number, max: number, alvo = 5): number[] {
  const span = max - min || 1
  const bruto = span / alvo, mag = 10 ** Math.floor(Math.log10(bruto)), r = bruto / mag
  const passo = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag
  const ini = Math.floor(min / passo - 1e-9) * passo, fim = Math.ceil(max / passo - 1e-9) * passo
  const out: number[] = []
  for (let v = ini; v <= fim + passo / 1000; v += passo) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

function Fluxo({ linhas, hoje, onSel, selecionada }: { linhas: GestaoFinLinha[]; hoje: string; onSel: (l: GestaoFinLinha) => void; selecionada: string | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const W = 760, H = 392, ml = 58, mr = 16, top = 16, alt = 306
  const n = linhas.length
  const iw = W - ml - mr, passo = iw / Math.max(n, 1)
  const x = (i: number) => ml + passo * i + passo / 2
  const diario = linhas.length > 0 && linhas.every((l) => l.de === l.ate)

  // eixo único: entradas, saídas e saldo na mesma escala
  const todos = linhas.flatMap((l) => [l.entradas, l.saidas, l.saldo, 0])
  const marcas = marcasEixo(Math.min(...todos), Math.max(...todos))
  const vMin = marcas[0], vMax = marcas[marcas.length - 1]
  const y = (v: number) => top + alt - ((v - vMin) / ((vMax - vMin) || 1)) * alt
  const y0 = y(0), base = top + alt

  const curva = degrau(linhas.map((l) => l.saldo), ml, passo, y)
  const area = n > 0 ? `${curva} L${(ml + passo * n).toFixed(1)},${y0.toFixed(1)} L${ml.toFixed(1)},${y0.toFixed(1)} Z` : ''

  // até "hoje" é realizado; depois é projeção (tracejado)
  const iHoje = linhas.findIndex((l) => l.de <= hoje && hoje <= l.ate)
  const xCorte = linhas.length === 0 ? ml : hoje < linhas[0].de ? ml : hoje > linhas[n - 1].ate ? W - mr : iHoje >= 0 ? x(iHoje) : W - mr
  const temProj = xCorte < W - mr - 1
  const bw = Math.max(3, Math.min(passo * 0.34, 14))
  const cada = Math.max(1, Math.ceil(n / Math.floor(iw / (diario ? 44 : 58))))
  const h = hover != null ? linhas[hover] : null
  const rot = (l: GestaoFinLinha) => (diario ? `${diaSemana(l.de)}, ${l.rotulo}` : `${l.rotulo}${l.de !== l.ate ? ` a ${dataBr(l.ate).slice(0, 5)}` : ''}`)
  const iDes = linhas.findIndex((l) => l.desencaixe)

  const tracos = (dash: boolean, clipCorte: string) => (
    <g clipPath={`url(#${clipCorte})`}>
      {[['pos', 'var(--g1)'], ['neg', 'var(--gred)']].map(([lado, cor]) => (
        <g key={lado} clipPath={`url(#${uid}${lado})`}>
          <path d={curva} fill="none" stroke={cor} strokeWidth={3} strokeLinecap="butt" strokeLinejoin="round" strokeDasharray={dash ? '7 6' : undefined} />
        </g>))}
    </g>)

  return (
    <div className="gs-area" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Fluxo de caixa: entradas e saídas por período e saldo acumulado projetado até a data final, no mesmo eixo">
        <defs>
          <linearGradient id={`${uid}gp`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: 'var(--g1)', stopOpacity: 0.34 }} /><stop offset="100%" style={{ stopColor: 'var(--g1)', stopOpacity: 0.02 }} /></linearGradient>
          <linearGradient id={`${uid}gn`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" style={{ stopColor: 'var(--gred)', stopOpacity: 0.4 }} /><stop offset="100%" style={{ stopColor: 'var(--gred)', stopOpacity: 0.03 }} /></linearGradient>
          <clipPath id={`${uid}pos`}><rect x={ml} y={top} width={iw} height={Math.max(y0 - top, 0)} /></clipPath>
          <clipPath id={`${uid}neg`}><rect x={ml} y={y0} width={iw} height={Math.max(base - y0, 0)} /></clipPath>
          <clipPath id={`${uid}real`}><rect x={0} y={0} width={Math.max(xCorte, 0)} height={H} /></clipPath>
          <clipPath id={`${uid}proj`}><rect x={xCorte} y={0} width={Math.max(W - xCorte, 0)} height={H} /></clipPath>
        </defs>

        {/* fins de semana (só no modo dia) e dias selecionados */}
        {linhas.map((l, i) => {
          const dom = diario && ['dom', 'sáb'].includes(diaSemana(l.de))
          return (dom || selecionada === l.chave) && <rect key={`f${l.chave}`} x={x(i) - passo / 2} y={top} width={passo} height={alt} fill="var(--mudo)" opacity={selecionada === l.chave ? 0.16 : 0.07} />
        })}
        {/* projeção: do "hoje" até a data final do filtro */}
        {temProj && <g><rect x={xCorte} y={top} width={W - mr - xCorte} height={alt} fill="var(--g1)" opacity={0.045} /><text x={W - mr - 6} y={top + 12} textAnchor="end" fontSize={10.5} fill="var(--mudo)" letterSpacing=".06em">PROJEÇÃO</text></g>}

        {/* grade e eixo único */}
        {marcas.map((v) => (
          <g key={`m${v}`}>
            <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke="var(--borda)" strokeDasharray={v === 0 ? undefined : '2 5'} opacity={v === 0 ? 0 : 0.8} />
            <text x={ml - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--mudo)">{compacto(v)}</text>
          </g>))}

        {/* área do saldo: azul acima de zero, vermelha abaixo */}
        {area && <g><g clipPath={`url(#${uid}pos)`}><path d={area} fill={`url(#${uid}gp)`} /></g><g clipPath={`url(#${uid}neg)`}><path d={area} fill={`url(#${uid}gn)`} /></g></g>}

        {/* entradas e saídas: barras finas lado a lado */}
        {linhas.map((l, i) => {
          const ativo = hover === i
          return (
            <g key={`b${l.chave}`} opacity={hover == null || ativo ? 1 : 0.55}>
              {l.entradas > 0 && <rect x={x(i) - bw - 1} y={y(l.entradas)} width={bw} height={Math.max(y0 - y(l.entradas), 1)} rx={Math.min(bw / 2, 3)} fill="var(--g3)" opacity={0.92} />}
              {l.saidas > 0 && <rect x={x(i) + 1} y={y(l.saidas)} width={bw} height={Math.max(y0 - y(l.saidas), 1)} rx={Math.min(bw / 2, 3)} fill="var(--g2)" opacity={0.92} />}
            </g>)
        })}

        {/* linha do zero */}
        <line x1={ml} x2={W - mr} y1={y0} y2={y0} stroke={vMin < 0 ? 'var(--gred)' : 'var(--mudo)'} strokeWidth={1.4} opacity={0.9} />

        {/* saldo acumulado: sólido até hoje, tracejado na projeção */}
        {curva && tracos(false, `${uid}real`)}
        {curva && temProj && tracos(true, `${uid}proj`)}

        {/* pontos só onde importa: desencaixe, dia selecionado e hover */}
        {linhas.map((l, i) => (l.desencaixe && (i === iDes || hover === i)) || hover === i || selecionada === l.chave
          ? <circle key={`s${l.chave}`} cx={x(i)} cy={y(l.saldo)} r={hover === i ? 5.5 : 4.5} fill={l.saldo < 0 ? 'var(--gred)' : 'var(--g1)'} stroke="var(--card)" strokeWidth={2} />
          : null)}
        {iDes >= 0 && <g><line x1={x(iDes)} x2={x(iDes)} y1={y(linhas[iDes].saldo)} y2={base} stroke="var(--gred)" strokeDasharray="2 3" opacity={0.7} /><text x={x(iDes)} y={base - 6} textAnchor={iDes > n * 0.7 ? 'end' : 'start'} dx={iDes > n * 0.7 ? -5 : 5} fontSize={10.5} fontWeight={700} fill="var(--gred)">saldo negativo</text></g>}
        {linhas.map((l, i) => l.saida_maior && <path key={`t${l.chave}`} d={`M${x(i) - 4},${base + 11} L${x(i) + 4},${base + 11} L${x(i)},${base + 3} Z`} fill="var(--gred)"><title>Saídas maiores que entradas</title></path>)}

        {/* hoje */}
        {iHoje >= 0 && <g><line x1={x(iHoje)} x2={x(iHoje)} y1={top} y2={base} stroke="var(--txt)" strokeDasharray="3 4" opacity={0.55} /><text x={x(iHoje)} y={top - 4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--txt)">hoje</text></g>}

        {/* cruzamento no dia: linha vertical ligando entradas, saídas e saldo */}
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={top} y2={base} stroke="var(--mudo)" strokeDasharray="3 3" opacity={0.8} />
            <circle cx={x(hover) - bw / 2 - 1} cy={y(h.entradas)} r={4} fill="var(--g3)" stroke="var(--card)" strokeWidth={2} />
            <circle cx={x(hover) + bw / 2 + 1} cy={y(h.saidas)} r={4} fill="var(--g2)" stroke="var(--card)" strokeWidth={2} />
          </g>)}

        {/* eixo X: dia da semana + data */}
        {linhas.map((l, i) => i % cada === 0 && (
          <g key={`x${l.chave}`}>
            {diario ? (
              <>
                <text x={x(i)} y={base + 28} textAnchor="middle" fontSize={11} fontWeight={700} fill={hover === i ? 'var(--txt)' : ['dom', 'sáb'].includes(diaSemana(l.de)) ? 'var(--g2)' : 'var(--mudo)'}>{diaSemana(l.de)}</text>
                <text x={x(i)} y={base + 43} textAnchor="middle" fontSize={10.5} fill={hover === i ? 'var(--txt)' : 'var(--mudo)'}>{l.rotulo}</text>
              </>
            ) : <text x={x(i)} y={base + 30} textAnchor="middle" fontSize={11} fill={hover === i ? 'var(--txt)' : 'var(--mudo)'}>{l.rotulo}</text>}
          </g>))}

        {/* áreas de captura (clique e teclado) */}
        {linhas.map((l, i) => (
          <rect key={`h${l.chave}`} x={ml + passo * i} y={top} width={passo} height={alt + 14} fill="transparent" style={{ cursor: 'pointer' }} tabIndex={0} role="button"
                aria-label={`${rot(l)}: entradas ${brl(l.entradas)}, saídas ${brl(l.saidas)}, saldo ${brl(l.saldo)}. Ver títulos`}
                onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onSel(l)} onKeyDown={(e) => { if (e.key === 'Enter') onSel(l) }} />))}
      </svg>
      {h && hover != null && (
        <div className="gs-tip" role="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: 8, transform: hover > n / 2 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)' }}>
          <span><strong style={{ color: 'var(--txt)' }}>{rot(h)}</strong>{h.ate >= hoje && h.de > hoje ? ' · projeção' : ''}</span>
          <b style={{ color: 'var(--g3)' }}>Entradas: {brl(h.entradas)}</b>
          <span>recebido {brl(h.entradas_real)} · a receber {brl(h.entradas_prev)}</span>
          <b style={{ color: 'var(--g2)' }}>Saídas: {brl(h.saidas)}</b>
          <span>pago {brl(h.saidas_real)} · a pagar {brl(h.saidas_prev)}</span>
          <b style={{ color: h.saldo < 0 ? 'var(--gred)' : 'var(--g1)' }}>Saldo acumulado: {brl(h.saldo)}{h.desencaixe && ' ⚠ desencaixe'}</b>
          <span style={{ display: 'block' }}>Resultado do período: {brl(h.entradas - h.saidas)}</span>
          <span style={{ display: 'block', opacity: 0.7 }}>Clique para ver os títulos</span>
        </div>)}
    </div>
  )
}

function DetalheTitulos({ ctx, sel, onFechar }: { ctx: Contexto; sel: SelFin; onFechar: () => void }) {
  const d = useCarregar(() => apiGestao.titulos(ctx.empresa, sel.de, sel.ate, sel.lado, sel.status, 300), [ctx.empresa, sel.de, sel.ate, sel.lado, sel.status])
  const r = d.dados
  const colunasT = useMemo<Coluna<Titulo>[]>(() => [
    { id: 'lado', titulo: 'Tipo', texto: (t) => (t.lado === 'pagar' ? 'Pagar' : 'Receber') },
    { id: 'data', titulo: 'Data', texto: (t) => dataBr(t.data) + (t.data_aproximada ? ' ≈' : ''), valor: (t) => t.data },
    { id: 'venc', titulo: 'Vencimento', texto: (t) => dataBr(t.vencimento), valor: (t) => t.vencimento },
    { id: 'sit', titulo: 'Situação', texto: (t) => t.situacao },
    { id: 'contato', titulo: 'Contato', texto: (t) => t.contato, max: 280 },
    { id: 'origem', titulo: 'Origem', texto: (t) => t.origem },
    { id: 'cat', titulo: 'Categoria', texto: (t) => t.categoria ?? '—' },
    { id: 'valor', titulo: 'Valor', texto: (t) => (t.lado === 'pagar' ? '−' : '') + brl(t.valor), valor: (t) => (t.lado === 'pagar' ? -t.valor : t.valor), direita: true, formatar: brl,
      render: (t) => <span style={{ color: t.lado === 'pagar' ? 'var(--g2)' : 'var(--g3)' }}>{t.lado === 'pagar' ? '−' : ''}{brl(t.valor)}</span> },
  ], [])
  return (
    <Modal titulo={sel.titulo} onFechar={onFechar} larga>
      <div className="gs-comp" aria-live="polite">
        <span className="gs-comp-t">Composição de</span>
        <span className="gs-chip">{sel.lado === 'pagar' ? 'Contas a pagar' : sel.lado === 'receber' ? 'Contas a receber' : 'Entradas e saídas'}</span>
        <span className="gs-chip">{sel.status === 'aberto' ? 'Em aberto' : sel.status === 'liquidado' ? 'Liquidadas' : 'Todas as situações'}</span>
        <span className="gs-chip">{sel.de === sel.ate ? dataBr(sel.de) : `${dataBr(sel.de)} a ${dataBr(sel.ate)}`}</span>
        {r?.ok && <span className="gs-chip forte">{num(r.qtd)} títulos</span>}
        {r?.ok && r.total_receber > 0 && <span className="gs-chip receber">receber {brl(r.total_receber)}</span>}
        {r?.ok && r.total_pagar > 0 && <span className="gs-chip pagar">pagar {brl(r.total_pagar)}</span>}
      </div>
      <p className="gs-nota" style={{ marginTop: 0 }}>Data = pagamento (pagos) ou vencimento (em aberto e recebidos).</p>
      {d.erro && <div className="erro" role="alert">{d.erro}</div>}
      {d.carregando && !r && <p className="gs-nota">Carregando títulos…</p>}
      {r?.ok && r.itens.length === 0 && <p className="gs-nota">Nenhum título nesse recorte.</p>}
      {r?.ok && r.itens.length > 0 && <GradeDados id="gestao.titulos" titulo={`${sel.titulo} (${dataBr(sel.de)} a ${dataBr(sel.ate)})`} colunas={colunasT} linhas={r.itens} chave={(t) => `${t.lado}${t.id}`} />}
      {r?.ok && r.qtd > r.itens.length && <p className="gs-nota">Mostrando os {r.itens.length} primeiros de {num(r.qtd)}. Afunile o período para ver os demais.</p>}
    </Modal>
  )
}

const paraNumero = (t: string): number | null => {
  const s = t.trim().replace(/\s/g, '').replace(/^R\$/, '')
  if (!s) return null
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

function SaldoInicial({ ctx, f, onSalvo }: { ctx: Contexto; f: GestaoFinanceiro; onSalvo: () => void }) {
  const [valor, setValor] = useState(f.saldo_inicial.valor != null ? String(f.saldo_inicial.valor).replace('.', ',') : '')
  const [data, setData] = useState(f.saldo_inicial.data ?? iso(new Date()))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(remover: boolean) {
    setErro(null)
    const n = remover ? null : paraNumero(valor)
    if (!remover && n == null) return setErro('Informe o saldo em reais, por exemplo 12.500,00.')
    setSalvando(true)
    try { await apiGestao.salvarSaldo(ctx.empresa, n, remover ? null : data); if (remover) setValor(''); onSalvo() } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  return (
    <section className="gs-card">
      <h2>Saldo inicial da conta (parâmetro)</h2>
      <p className="gs-nota" style={{ marginTop: 0 }}>
        Enquanto o controle das contas bancárias não é mapeado, informe o saldo em uma data. O fluxo parte dele e soma o que já foi pago e recebido desde então.
        {!f.saldo_inicial.informado && ' Sem saldo informado, o fluxo parte de R$ 0,00 e mostra só a movimentação.'}
      </p>
      <div className="gs-saldo">
        <label>Saldo (R$)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" aria-label="Saldo inicial em reais" /></label>
        <label>Na data<input type="date" value={data} max={iso(new Date())} onChange={(e) => setData(e.target.value)} aria-label="Data do saldo" /></label>
        <button disabled={salvando} onClick={() => void salvar(false)}>{salvando ? 'Salvando…' : 'Salvar saldo'}</button>
        {f.saldo_inicial.informado && <button className="sec" disabled={salvando} onClick={() => void salvar(true)}>Remover</button>}
      </div>
      {erro && <div className="erro" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
    </section>
  )
}

function AbaFinanceiro({ ctx }: { ctx: Contexto }) {
  const lista = useMemo(presetsFin, [])
  const [per, setPer] = useState<Per>({ de: lista[0].de, ate: lista[0].ate })
  const [gran, setGran] = useState<Gran>('dia')
  const [sel, setSel] = useState<SelFin | null>(null)
  const fin = useCarregar(() => apiGestao.financeiro(ctx.empresa, per.de, per.ate, gran), [ctx.empresa, per.de, per.ate, gran])
  const f = fin.dados
  const abrir = (lado: SelFin['lado'], status: SelFin['status'], titulo: string) => setSel({ de: per.de, ate: per.ate, lado, status, titulo })
  const card = (c: FinCard) => `${num(c.qtd)} títulos`

  if (f && !f.ok && f.motivo === 'sem_valores') return <div className="vazio"><strong>Financeiro indisponível para o seu perfil</strong><p>Esta aba é de administração, gestão e financeiro.</p></div>
  return (
    <div>
      <div className="gs-topo"><BarraPeriodo per={per} setPer={(p) => { setPer(p); setSel(null) }} lista={lista} /></div>
      {fin.erro && <div className="erro" role="alert">{fin.erro}</div>}
      {!f && fin.carregando && <p className="sub">Carregando…</p>}
      {f && !f.ok && f.motivo !== 'sem_valores' && <div className="erro" role="alert">Período inválido: a data final é anterior à inicial.</div>}

      {f?.ok && (
        <>
          {f.primeiro_desencaixe && (
            <p className="gs-aviso mau" role="alert">
              <strong>Possível desencaixe de caixa:</strong> o saldo projetado fica negativo a partir de {dataBr(f.primeiro_desencaixe)}
              {f.menor_saldo && <> (menor saldo {brl(f.menor_saldo.valor)} em {f.menor_saldo.rotulo})</>}. As saídas passam as entradas antes de o dinheiro entrar.
            </p>)}
          {!f.saldo_inicial.informado && <p className="gs-aviso">Saldo inicial não informado: o fluxo parte de R$ 0,00. Informe o saldo da conta no quadro mais abaixo para ver o saldo real.</p>}

          <div className="gs-kpis">
            <Kpi rot="A pagar" valor={brl(f.cards.a_pagar.valor)} sub={`${card(f.cards.a_pagar)}${f.cards.a_pagar.atraso_qtd ? ` · ${num(f.cards.a_pagar.atraso_qtd)} em atraso (${brl(f.cards.a_pagar.atraso_valor)})` : ''}`}
                 ativo={sel?.lado === 'pagar' && sel.status === 'aberto'} onClick={() => abrir('pagar', 'aberto', 'Contas a pagar em aberto')} />
            <Kpi rot="Pagas" valor={brl(f.cards.pago.valor)} sub={card(f.cards.pago)} ativo={sel?.lado === 'pagar' && sel.status === 'liquidado'} onClick={() => abrir('pagar', 'liquidado', 'Contas pagas')} />
            <Kpi rot="A receber" valor={brl(f.cards.a_receber.valor)} sub={`${card(f.cards.a_receber)}${f.cards.a_receber.atraso_qtd ? ` · ${num(f.cards.a_receber.atraso_qtd)} vencidos (${brl(f.cards.a_receber.atraso_valor)})` : ''}`}
                 ativo={sel?.lado === 'receber' && sel.status === 'aberto'} onClick={() => abrir('receber', 'aberto', 'Contas a receber em aberto')} />
            <Kpi rot="Recebido" valor={brl(f.cards.recebido.valor)} sub={`${card(f.cards.recebido)} · data pelo vencimento`} ativo={sel?.lado === 'receber' && sel.status === 'liquidado'} onClick={() => abrir('receber', 'liquidado', 'Contas recebidas')} />
            <Kpi rot="Saldo no início do período" valor={brl(f.saldo_abertura)} sub={f.saldo_inicial.informado ? `parte de ${brl(f.saldo_inicial.valor)} em ${dataBr(f.saldo_inicial.data)}` : 'sem saldo informado'} />
            <Kpi rot="Saldo no fim do período" valor={brl(f.saldo_final)} sub="início + entradas − saídas (realizadas e previstas)" />
          </div>

          {sel && <DetalheTitulos ctx={ctx} sel={sel} onFechar={() => setSel(null)} />}

          <section className="gs-card">
            <div className="gs-topo" style={{ marginBottom: 0 }}>
              <h2>Fluxo de caixa</h2>
              <Granularidade valor={gran} efetiva={f.granularidade} onMudar={setGran} />
            </div>
            <div className="gs-leg"><span><i style={{ background: 'var(--g3)' }} />Entradas (recebido + a receber)</span><span><i style={{ background: 'var(--g2)' }} />Saídas (pago + a pagar)</span><span><i style={{ background: 'var(--g1)', height: 3, borderRadius: 2, verticalAlign: 'middle' }} />Saldo acumulado</span><span><i style={{ background: 'repeating-linear-gradient(90deg,var(--g1) 0 4px,transparent 4px 7px)', height: 3, borderRadius: 2, verticalAlign: 'middle', width: 18 }} />Projeção até a data final</span><span><i style={{ background: 'var(--gred)', opacity: 0.6 }} />Saldo negativo (desencaixe)</span></div>
            {f.granularidade !== gran && <p className="gs-nota">Período longo: agrupei por {f.granularidade === 'semana' ? 'semana' : 'mês'} para o gráfico ficar legível.</p>}
            {f.linhas.length > 0 && <Fluxo linhas={f.linhas} hoje={f.hoje} selecionada={sel ? f.linhas.find((l) => l.de === sel.de && l.ate === sel.ate)?.chave ?? null : null}
              onSel={(l) => setSel({ de: l.de, ate: l.ate, lado: 'todos', status: 'todos', titulo: `Títulos de ${l.rotulo}${l.de !== l.ate ? ` a ${dataBr(l.ate).slice(0, 5)}` : ''}` })} />}
            <p className="gs-nota">Tudo no mesmo eixo: barras = entradas e saídas do período; linha = saldo acumulado, tracejada a partir de hoje (projeção até a data final do filtro). Triângulo vermelho = dia em que as saídas superam as entradas. Clique num dia para abrir os títulos.</p>
          </section>

          <SaldoInicial key={`${f.saldo_inicial.valor}|${f.saldo_inicial.data}`} ctx={ctx} f={f} onSalvo={() => fin.recarregar()} />

          {(f.vencidos_antes.receber_qtd > 0 || f.vencidos_antes.pagar_qtd > 0) && (
            <p className="gs-nota">
              Fora do fluxo: {num(f.vencidos_antes.receber_qtd)} títulos a receber ({brl(f.vencidos_antes.receber_valor)}) e {num(f.vencidos_antes.pagar_qtd)} a pagar ({brl(f.vencidos_antes.pagar_valor)}) em aberto com vencimento anterior a {dataBr(f.de)}.
              Parte dos a receber são pedidos que nunca foram pagos; por isso não entram na projeção.
            </p>)}
          <p className="gs-nota">
            Fonte: contas a pagar e a receber do Bling. O Bling não informa na listagem a data em que o recebimento caiu, então “recebido” usa o vencimento (≈). Pagamentos usam a data de pagamento.
            As contas a pagar só aparecem se forem lançadas no Bling; hoje o histórico lido vai até junho de 2026.
          </p>
        </>)}
    </div>
  )
}

// ------------------------------------------------------------------ tela
type Aba = 'vendas' | 'financeiro' | 'natureza'
export default function Gestao({ ctx }: { ctx: Contexto }) {
  const [aba, setAba] = useState<Aba>('vendas')
  const [visitouFin, setVisitouFin] = useState(false)
  const [visitouNat, setVisitouNat] = useState(false)
  const [base, setBase] = useState<GestaoBase>(() => { try { return localStorage.getItem('ane.gestao.base') === 'nota' ? 'nota' : 'pedido' } catch { return 'pedido' } })
  const trocarBase = (b: GestaoBase) => { setBase(b); try { localStorage.setItem('ane.gestao.base', b) } catch { /* sem armazenamento */ } }
  const abas: { id: Aba; rotulo: string }[] = ctx.veFinanceiro ? [{ id: 'vendas', rotulo: 'Vendas' }, { id: 'financeiro', rotulo: 'Financeiro' }, { id: 'natureza', rotulo: 'Natureza e CR' }] : [{ id: 'vendas', rotulo: 'Vendas' }]
  const mudar = (a: Aba) => { setAba(a); if (a === 'financeiro') setVisitouFin(true); if (a === 'natureza') setVisitouNat(true) }

  return (
    <div className="gs">
      <style>{CSS}</style>
      <div className="gs-topo">
        <Titulo>Painel de Gestão</Titulo>
        {aba === 'vendas' && (
          <div className="gs-base" data-ajuda="base">
            <span>Base das vendas</span>
            <div className="gs-seg">
              <button className={base === 'pedido' ? 'on' : ''} onClick={() => trocarBase('pedido')} title="Pedidos de venda do Bling (inclui vendas sem nota fiscal)">Pedidos</button>
              <button className={base === 'nota' ? 'on' : ''} onClick={() => trocarBase('nota')} title="Somente notas fiscais de saída emitidas">Notas fiscais</button>
            </div>
          </div>)}
      </div>
      {abas.length > 1 && <Abas abas={abas} ativa={aba} onMudar={mudar} />}
      <div hidden={aba !== 'vendas'}><AbaVendas ctx={ctx} base={base} /></div>
      {ctx.veFinanceiro && (visitouFin || aba === 'financeiro') && <div hidden={aba !== 'financeiro'}><AbaFinanceiro ctx={ctx} /></div>}
      {ctx.veFinanceiro && (visitouNat || aba === 'natureza') && <div hidden={aba !== 'natureza'}><AbaNatureza ctx={ctx} /></div>}
    </div>
  )
}
