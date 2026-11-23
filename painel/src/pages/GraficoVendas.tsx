import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiAssistenteDados, apiAssistenteIA, type PedidosDetalhe, type SerieVendas, type Recebimento } from '../api'
import {
  ROTULO_DIMENSAO, ROTULO_METRICA, ROTULO_TIPO, agruparOutros, escala, escolherGrafico, fmtEixo, fmtMetrica, formaDe, metricaEfetiva, metricaParaTipo,
  paraPontos, serieVazia, tiposCompativeis, type Dimensao, type Metrica, type Ponto, type TipoGrafico, type TipoPedido,
} from '../grafico'

// ------------------------------------------------------------------ estilo (cores validadas: paleta categórica, tema escuro e claro)
const CSS = `
.gv { --g1:#3987e5; --g2:#d95926; --g3:#199e70; --g4:#c98500; --g5:#d55181; --g6:#0ca30c; --g7:#9085e9; --gout:#8a8590; }
:root[data-tema='ane'] .gv { --g1:#2a78d6; --g2:#eb6834; --g3:#1baf7a; --g4:#eda100; --g5:#e87ba4; --g6:#008300; --g7:#6250d6; }
.gv { background: var(--card); border: 1px solid var(--borda); border-radius: 16px; padding: 16px; margin-bottom: 12px; box-shadow: var(--sombra); }
.gv-topo { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; align-items:center; }
.gv-titulo { font-weight: 700; font-size: 1.02rem; }
.gv-kpis { display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin:12px 0; }
.gv-kpi { background: var(--card2); border:1px solid var(--borda); border-radius:12px; padding:10px 12px; }
.gv-kpi small { color: var(--mudo); display:block; font-size:.75rem; letter-spacing:.02em; }
.gv-kpi strong { font-size:1.25rem; font-variant-numeric: tabular-nums; }
.gv-filtros { display:flex; flex-direction:column; gap:8px; margin-bottom:10px; }
.gv-linha { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.gv-rot { width:84px; font-size:.78rem; color: var(--mudo); flex:0 0 auto; }
.gv-seg { display:inline-flex; gap:4px; flex-wrap:wrap; }
.gv-seg button { background: var(--card2); color: var(--txt); border:1px solid var(--borda); border-radius:999px; padding:.28rem .8rem; font-size:.84rem; font-weight:600; transition: all .15s ease; }
.gv-seg button:hover:not(:disabled) { border-color: var(--g1); transform: translateY(-1px); }
.gv-seg button.on { background: var(--g1); border-color: var(--g1); color:#fff; box-shadow: 0 6px 16px -8px var(--g1); }
.gv-seg button:disabled { opacity:.45; cursor:not-allowed; }
.gv-data { display:inline-flex; gap:6px; align-items:center; }
.gv-data input[type=date] { background: var(--card2); color: var(--txt); border:1px solid var(--borda); border-radius:8px; padding:.25rem .5rem; font-size:.84rem; }
.gv-aviso { color: var(--mudo); font-size:.84rem; margin:6px 0 0; }
.gv-area { position:relative; margin-top:10px; transition: opacity .2s; }
.gv-area.carregando { opacity:.5; }
.gv-tip { position:absolute; z-index:5; pointer-events:none; background: var(--card2); border:1px solid var(--borda); border-radius:10px; padding:8px 12px; font-size:.84rem; box-shadow: 0 12px 28px -10px rgba(0,0,0,.55); min-width:140px; }
.gv-tip b { display:block; font-size:1.05rem; font-variant-numeric: tabular-nums; }
.gv-tip span { color: var(--mudo); display:block; }
.gv-tip em { font-style:normal; display:block; color: var(--g1); margin-top:4px; font-size:.78rem; }
.gv-barra { transform-box: fill-box; transform-origin: 50% 100%; animation: gv-sobe .55s cubic-bezier(.22,.8,.24,1) both; }
.gv-hbarra { transform-box: fill-box; transform-origin: 0 50%; animation: gv-entra .55s cubic-bezier(.22,.8,.24,1) both; }
.gv-linha-anim { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: gv-traca 1.1s ease-out forwards; }
.gv-fatia { transition: transform .18s ease, opacity .18s ease; cursor:pointer; animation: gv-aparece .5s ease both; }
@keyframes gv-sobe { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes gv-entra { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes gv-traca { to { stroke-dashoffset: 0; } }
@keyframes gv-aparece { from { opacity:0; } to { opacity:1; } }
.gv-leg { list-style:none; margin:0; padding:0; display:grid; gap:4px; flex:1 1 220px; }
.gv-leg button { all: unset; box-sizing:border-box; width:100%; display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:8px; cursor:pointer; font-size:.88rem; color: var(--txt); }
.gv-leg button:hover, .gv-leg button.on { background: var(--card2); }
.gv-leg i { width:12px; height:12px; border-radius:4px; flex:0 0 auto; }
.gv-ia { margin-top:12px; padding:12px 14px; border:1px solid var(--borda); border-left:3px solid var(--g7); border-radius:12px; background: var(--card2); animation: gv-aparece .3s ease both; }
.gv-det { margin-top:14px; border-top:1px dashed var(--borda); padding-top:12px; animation: gv-aparece .25s ease both; }
.gv-det table { width:100%; } .gv-det td, .gv-det th { white-space:nowrap; } .gv-det td:nth-child(3) { white-space:normal; min-width:220px; }
.gv-pill { display:inline-block; background: var(--card2); border:1px solid var(--borda); border-radius:999px; padding:.1rem .6rem; font-size:.78rem; margin-left:6px; font-weight:500; }
@media (prefers-reduced-motion: reduce) { .gv-barra, .gv-hbarra, .gv-linha-anim, .gv-fatia { animation: none; stroke-dashoffset: 0; } }
`
const COR = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)', 'var(--g6)']
const corDe = (p: Ponto, i: number) => (p.outros ? 'var(--gout)' : COR[i % COR.length])
const W = 720, H = 300

// ------------------------------------------------------------------ datas
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const doIso = (s: string) => { const [a, mm, d] = s.split('-').map(Number); return new Date(a, mm - 1, d) }
const somaDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dataBr = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const corta = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

interface Faixa { de: string | null; ate: string | null; rotulo: string }
function presets(): { id: string; rotulo: string; de: string; ate: string }[] {
  const h = new Date(); const hoje = iso(h)
  const pm = new Date(h.getFullYear(), h.getMonth() - 1, 1)
  return [
    { id: '7', rotulo: '7 dias', de: iso(somaDias(h, -6)), ate: hoje },
    { id: '30', rotulo: '30 dias', de: iso(somaDias(h, -29)), ate: hoje },
    { id: 'mes', rotulo: 'Mês atual', de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: hoje },
    { id: 'ant', rotulo: 'Mês anterior', de: iso(pm), ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)) },
    { id: '90', rotulo: '90 dias', de: iso(somaDias(h, -89)), ate: hoje },
    { id: 'ano', rotulo: 'Este ano', de: iso(new Date(h.getFullYear(), 0, 1)), ate: hoje },
  ]
}
function periodoAnterior(f: Faixa): Faixa | null {
  if (!f.de || !f.ate) return null
  const a = doIso(f.de), b = doIso(f.ate)
  const dias = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  const ateP = somaDias(a, -1), deP = somaDias(ateP, -(dias - 1))
  return { de: iso(deP), ate: iso(ateP), rotulo: `${dataBr(iso(deP))} a ${dataBr(iso(ateP))}` }
}

const DIMENSOES: Dimensao[] = ['dia', 'semana', 'mes', 'cliente', 'situacao', 'recebimento']
const ROT_RECEB: Record<Recebimento, string> = { recebido: 'Recebido', parcial: 'Parcial', em_aberto: 'Em aberto', sem_conta: 'Sem conta' }

interface Props {
  empresa: string; de: string | null; ate: string | null; rotulo: string
  dimensao?: Dimensao; metrica?: Metrica; tipo?: TipoPedido | null; limite?: number
  pergunta?: string; usarIA?: boolean; onSugestao?: (texto: string) => void
}
interface Sel { ponto: Ponto; indice: number }

export function GraficoVendas({ empresa, de, ate, rotulo, dimensao, metrica, tipo, limite, pergunta, usarIA, onSugestao }: Props) {
  const [dim, setDim] = useState<Dimensao>(dimensao ?? 'dia')
  const [met, setMet] = useState<Metrica>(metrica ?? 'valor')
  const [escolhido, setEscolhido] = useState<TipoGrafico | null>(null)
  const [pilha, setPilha] = useState<Faixa[]>([{ de, ate, rotulo }])
  const [comparar, setComparar] = useState(false)
  const [serie, setSerie] = useState<SerieVendas | null>(null)
  const [anterior, setAnterior] = useState<SerieVendas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [mouse, setMouse] = useState<{ x: number; y: number; w: number } | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [detalhe, setDetalhe] = useState<PedidosDetalhe | null>(null)
  const [carregandoDet, setCarregandoDet] = useState(false)
  const [custom, setCustom] = useState<{ de: string; ate: string }>({ de: de ?? '', ate: ate ?? '' })
  const area = useRef<HTMLDivElement>(null)
  const [analise, setAnalise] = useState<{ texto: string; sugestoes: string[] } | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [erroIA, setErroIA] = useState<string | null>(null)
  const auto = useRef(true)
  const faixa = pilha[pilha.length - 1]
  const prox = useMemo(() => periodoAnterior(faixa), [faixa])

  useEffect(() => {
    setPilha([{ de, ate, rotulo }]); setDim(dimensao ?? 'dia'); setMet(metrica ?? 'valor'); setEscolhido(null); setHover(null); setSel(null); setComparar(false); setAnalise(null); setErroIA(null); auto.current = true
    setCustom({ de: de ?? '', ate: ate ?? '' })
  }, [de, ate, rotulo, dimensao, metrica, tipo, limite])

  useEffect(() => {
    let ativo = true
    setCarregando(true); setErro(null)
    apiAssistenteDados.serieVendas(empresa, faixa.de, faixa.ate, dim, dim === 'cliente' ? Math.max(limite ?? 8, 3) : 10)
      .then((s) => { if (ativo) setSerie(s) })
      .catch((e) => { if (ativo) setErro((e as Error).message) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [empresa, faixa.de, faixa.ate, dim, limite])

  const dimReal = (serie?.dimensao as Dimensao | undefined) ?? dim
  const forma = formaDe(dimReal)
  const temporal = forma === 'serie_temporal'

  useEffect(() => {
    if (!comparar || !prox || !temporal) { setAnterior(null); return }
    let ativo = true
    apiAssistenteDados.serieVendas(empresa, prox.de, prox.ate, dimReal, 10).then((s) => { if (ativo) setAnterior(s) }).catch(() => { if (ativo) setAnterior(null) })
    return () => { ativo = false }
  }, [comparar, prox, temporal, empresa, dimReal])

  const sugerido = useMemo(() => escolherGrafico(forma, tipo), [forma, tipo])
  const compat = tiposCompativeis(forma)
  const tipoAtual: TipoGrafico = escolhido && compat.includes(escolhido) ? escolhido : (tipo && escolhido == null ? sugerido.tipo : compat[0])
  const ef = metricaEfetiva(met, serie?.ve_valores ?? false)
  const mt = metricaParaTipo(tipoAtual, ef.metrica)
  const m = mt.metrica
  const avisos = [escolhido == null ? sugerido.aviso : null, ef.aviso, mt.aviso].filter((x): x is string => !!x)

  const pontos = useMemo(() => {
    if (!serie?.ok) return []
    let base = paraPontos(serie.linhas, m)
    if (limite && dimReal === 'cliente') base = base.filter((p) => !p.outros).slice(0, limite)
    return tipoAtual === 'pizza' || tipoAtual === 'rosca' ? agruparOutros(base, 6).pontos : base
  }, [serie, m, tipoAtual, limite, dimReal])
  const pontosAnt = useMemo(() => (anterior?.ok && temporal && tipoAtual !== 'pizza' && tipoAtual !== 'rosca' ? paraPontos(anterior.linhas, m) : []), [anterior, m, temporal, tipoAtual])

  // Análise por IA: só números prontos do banco vão ao Google; clientes seguem como códigos (C1, C2...) e voltam com o nome aqui.
  const analisar = async () => {
    if (!serie?.ok || pontos.length === 0) return
    setAnalisando(true); setErroIA(null)
    const nomes: string[] = []
    const linhas = pontos.map((p, i) => {
      let ref = p.rotulo
      if (dimReal === 'cliente') { nomes[i] = p.rotulo; ref = `C${i + 1}` }
      return { ref, qtd: p.qtd, valor: serie.ve_valores ? p.valor : null }
    })
    const avisos: string[] = []
    if (serie.carga_em_andamento) avisos.push('A carga do histórico de pedidos ainda está em andamento; períodos antigos podem estar incompletos.')
    if (serie.primeira_data && faixa.de && faixa.de < serie.primeira_data) avisos.push(`A base de pedidos só começa em ${dataBr(serie.primeira_data)}.`)
    if (serie.contas_desde && faixa.de && faixa.de < serie.contas_desde) avisos.push('Contas a receber ainda não cobrem todo o período.')
    try {
      const r = await apiAssistenteIA.analisar(empresa, {
        pergunta: pergunta ?? '', periodo: faixa.rotulo, dimensao: dimReal, metrica: m, linhas, avisos,
        resumo: { qtd_validas: serie.qtd_validas, qtd_canceladas: serie.qtd_canceladas, valor_total: serie.ve_valores ? serie.valor_total : null },
      })
      if (r.ok && r.texto) setAnalise({ texto: r.texto.replace(/\[C(\d+)\]/g, (_, n: string) => nomes[Number(n) - 1] ?? 'um cliente'), sugestoes: (r.sugestoes ?? []).filter((x) => !/\[C\d+\]/.test(x)).map((x) => x.trim()).filter(Boolean) })
      else setErroIA(r.motivo ?? 'sem resposta')
    } catch (e) { setErroIA((e as Error).message) }
    setAnalisando(false)
  }
  useEffect(() => {
    if (usarIA && auto.current && serie?.ok && !carregando && !serieVazia(pontos)) { auto.current = false; void analisar() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usarIA, serie, carregando])

  // detalhe ao clicar: pedidos daquela coluna/fatia
  useEffect(() => {
    if (!sel) { setDetalhe(null); return }
    let ativo = true
    const p = sel.ponto
    const f = temporal ? { de: p.de ?? faixa.de, ate: p.ate ?? faixa.ate, filtro: null as string | null, valor: null as string | null }
      : { de: faixa.de, ate: faixa.ate, filtro: dimReal, valor: p.chave }
    setCarregandoDet(true)
    apiAssistenteDados.pedidosDetalhe(empresa, f.de, f.ate, f.filtro, f.valor, 30)
      .then((d) => { if (ativo) setDetalhe(d) }).catch(() => { if (ativo) setDetalhe(null) }).finally(() => { if (ativo) setCarregandoDet(false) })
    return () => { ativo = false }
  }, [sel, temporal, dimReal, faixa.de, faixa.ate, empresa])

  const escolher = (p: Ponto, i: number) => { if (p.outros) return; setSel((s) => (s && s.ponto.chave === p.chave ? null : { ponto: p, indice: i })) }
  const aplicarFaixa = (f: Faixa, reiniciar: boolean) => { setPilha((x) => (reiniciar ? [f] : [...x, f])); setSel(null); setHover(null) }
  const detalharDias = (p: Ponto) => { if (p.de && p.ate) { aplicarFaixa({ de: p.de, ate: p.ate, rotulo: `${dataBr(p.de)} a ${dataBr(p.ate)}` }, false); setDim('dia') } }
  const voltar = () => { setPilha((x) => x.slice(0, -1)); setDim('mes'); setSel(null); setHover(null) }

  const lista = presets()
  const presetAtivo = lista.find((x) => x.de === faixa.de && x.ate === faixa.ate)?.id ?? null
  const totalSoma = pontos.reduce((s, p) => s + p.v, 0)
  const ticket = serie?.ok && serie.valor_total != null && serie.qtd_validas > 0 ? serie.valor_total / serie.qtd_validas : null
  const moveu = (e: React.PointerEvent) => { const r = area.current?.getBoundingClientRect(); if (r) setMouse({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }) }
  const pHover = hover != null ? pontos[hover] : null
  const pAnt = hover != null ? pontosAnt[hover] : undefined

  return (
    <article className="gv">
      <style>{CSS}</style>
      <div className="gv-topo">
        <div className="gv-titulo">{limite && dimReal === 'cliente' ? `Top ${limite} ${limite === 1 ? 'cliente' : 'clientes'} · ${m === 'valor' ? 'valor vendido' : m === 'qtd' ? 'nº de pedidos' : 'ticket médio'}` : `Vendas por ${ROTULO_DIMENSAO[dimReal].toLowerCase()}`} <span className="gv-pill">{faixa.rotulo}</span></div>
        {pilha.length > 1 && <button className="sec" onClick={voltar}>← Voltar</button>}
      </div>

      {serie?.ok && (
        <div className="gv-kpis">
          <Kpi rot="Pedidos válidos" v={serie.qtd_validas.toLocaleString('pt-BR')} />
          {serie.ve_valores && <Kpi rot="Total vendido" v={brl(serie.valor_total)} />}
          {serie.ve_valores && <Kpi rot="Ticket médio" v={brl(ticket)} />}
          <Kpi rot="Cancelados" v={serie.qtd_canceladas.toLocaleString('pt-BR')} />
        </div>)}

      <div className="gv-filtros">
        <div className="gv-linha">
          <span className="gv-rot">Período</span>
          <div className="gv-seg">{lista.map((p) => <button key={p.id} className={p.id === presetAtivo ? 'on' : ''} onClick={() => { aplicarFaixa({ de: p.de, ate: p.ate, rotulo: p.rotulo }, true); setCustom({ de: p.de, ate: p.ate }); setDim((d) => (d === 'semana' || d === 'mes' ? 'dia' : d)) }}>{p.rotulo}</button>)}</div>
          <span className="gv-data">
            <input type="date" aria-label="Data inicial" value={custom.de} max={custom.ate || undefined} onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value }))} />
            <span className="sub">a</span>
            <input type="date" aria-label="Data final" value={custom.ate} min={custom.de || undefined} onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value }))} />
            <button className="sec" disabled={!custom.de || !custom.ate || custom.ate < custom.de} onClick={() => aplicarFaixa({ de: custom.de, ate: custom.ate, rotulo: `${dataBr(custom.de)} a ${dataBr(custom.ate)}` }, true)}>Aplicar</button>
          </span>
        </div>
        <div className="gv-linha">
          <span className="gv-rot">Gráfico</span>
          <div className="gv-seg">{compat.map((t) => <button key={t} className={t === tipoAtual ? 'on' : ''} onClick={() => { setEscolhido(t); setHover(null) }}>{ROTULO_TIPO[t]}</button>)}</div>
        </div>
        <div className="gv-linha">
          <span className="gv-rot">Agrupar por</span>
          <div className="gv-seg">{DIMENSOES.map((d) => <button key={d} className={d === dimReal ? 'on' : ''} onClick={() => { setDim(d); setEscolhido(null); setSel(null); setHover(null) }}>{ROTULO_DIMENSAO[d]}</button>)}</div>
        </div>
        <div className="gv-linha">
          <span className="gv-rot">Medir</span>
          <div className="gv-seg">{(['valor', 'qtd', 'ticket'] as Metrica[]).map((k) => <button key={k} className={k === m ? 'on' : ''} onClick={() => setMet(k)}>{ROTULO_METRICA[k]}</button>)}</div>
          <div className="gv-seg"><button className={comparar ? 'on' : ''} disabled={!temporal || !prox || tipoAtual === 'pizza' || tipoAtual === 'rosca'} title={prox ? `Compara com ${prox.rotulo}` : 'Escolha um período com datas'} onClick={() => setComparar((c) => !c)}>↔ Comparar com período anterior</button></div>
        </div>
      </div>

      {avisos.map((a) => <p key={a} className="gv-aviso">{a}</p>)}
      {serie?.ok && serie.dimensao !== serie.dimensao_pedida && <p className="gv-aviso">Período longo: agrupei por {ROTULO_DIMENSAO[dimReal].toLowerCase()} para o gráfico ficar legível.</p>}
      {erro && <div className="erro" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
      {serie && !serie.ok && <p className="gv-aviso">Não consegui montar o gráfico ({serie.motivo ?? 'erro'}).</p>}

      <div ref={area} className={'gv-area' + (carregando ? ' carregando' : '')} onPointerMove={moveu} onPointerLeave={() => { setHover(null); setMouse(null) }}>
        {serie?.ok && (serieVazia(pontos)
          ? <p className="gv-aviso">Nenhum pedido de venda nesse período.</p>
          : tipoAtual === 'pizza' || tipoAtual === 'rosca'
            ? <Rosca pontos={pontos} m={m} vazado={tipoAtual === 'rosca'} hover={hover} setHover={setHover} selecionado={sel?.ponto.chave ?? null} onClique={escolher} />
            : tipoAtual === 'barra'
              ? <Barras pontos={pontos} m={m} hover={hover} setHover={setHover} selecionado={sel?.ponto.chave ?? null} onClique={escolher} />
              : <Cartesiano pontos={pontos} ant={pontosAnt} m={m} tipo={tipoAtual} hover={hover} setHover={setHover} selecionado={sel?.ponto.chave ?? null} onClique={escolher} chaveAnim={`${dimReal}${tipoAtual}${faixa.de}${faixa.ate}${m}`} />)}
        {!serie && carregando && <p className="gv-aviso">Carregando…</p>}
        {pHover && mouse && (
          <div className="gv-tip" role="tooltip" style={{ left: mouse.x > mouse.w * 0.6 ? mouse.x - 170 : mouse.x + 16, top: Math.max(0, mouse.y - 20) }}>
            <span>{pHover.rotulo}</span>
            <b>{fmtMetrica(m, pHover.v)}</b>
            {m !== 'qtd' && <span>{pHover.qtd} {pHover.qtd === 1 ? 'pedido' : 'pedidos'}</span>}
            {m !== 'ticket' && totalSoma > 0 && <span>{((pHover.v / totalSoma) * 100).toFixed(1).replace('.', ',')}% do total</span>}
            {pAnt && <span>Período anterior: {fmtMetrica(m, pAnt.v)}{pAnt.v > 0 && <> ({pHover.v >= pAnt.v ? '+' : ''}{(((pHover.v - pAnt.v) / pAnt.v) * 100).toFixed(0)}%)</>}</span>}
            {!pHover.outros && <em>Clique para ver os pedidos</em>}
          </div>)}
      </div>

      {usarIA && serie?.ok && !serieVazia(pontos) && (
        <div className="gv-ia">
          <div className="gv-topo"><strong>✦ Análise da IA</strong><span className="gv-seg"><button disabled={analisando} onClick={() => void analisar()}>{analisando ? 'Analisando…' : 'Analisar esta visão'}</button></span></div>
          {analisando && !analise && <p className="gv-aviso">Lendo os números do gráfico…</p>}
          {analise && <p style={{ margin: '8px 0 0', lineHeight: 1.55, opacity: analisando ? 0.5 : 1 }}>{analise.texto}</p>}
          {erroIA && <p className="gv-aviso">Não consegui gerar a análise agora ({erroIA}).</p>}
          {analise && analise.sugestoes.length > 0 && onSugestao && <div className="gv-seg" style={{ marginTop: 8 }}>{analise.sugestoes.map((x) => <button key={x} onClick={() => onSugestao(x)}>{x}</button>)}</div>}
          <p className="gv-aviso">Texto gerado por IA a partir dos números acima; os valores vêm do banco, não da IA.</p>
        </div>)}

      {sel && (
        <div className="gv-det">
          <div className="gv-topo">
            <strong>{sel.ponto.rotulo}{detalhe?.ok && <span className="gv-pill">{detalhe.qtd} {detalhe.qtd === 1 ? 'pedido' : 'pedidos'}{detalhe.ve_valores && ` · ${brl(detalhe.valor_total)}`}</span>}</strong>
            <span className="gv-seg">
              {(dimReal === 'semana' || dimReal === 'mes') && <button onClick={() => detalharDias(sel.ponto)}>Ver dia a dia</button>}
              <button onClick={() => setSel(null)}>Fechar</button>
            </span>
          </div>
          {carregandoDet && <p className="gv-aviso">Carregando pedidos…</p>}
          {detalhe?.ok && detalhe.pedidos.length === 0 && <p className="gv-aviso">Nenhum pedido nesse recorte.</p>}
          {detalhe?.ok && detalhe.pedidos.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 6 }}>
              <table>
                <thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Situação</th><th>Recebimento</th>{detalhe.ve_valores && <th style={{ textAlign: 'right' }}>Valor</th>}</tr></thead>
                <tbody>{detalhe.pedidos.map((x) => (
                  <tr key={x.bling_id}><td>{x.numero}</td><td>{dataBr(x.data)}</td><td>{x.cliente}</td><td>{x.situacao_rotulo}</td><td>{ROT_RECEB[x.recebimento]}</td>{detalhe.ve_valores && <td style={{ textAlign: 'right' }}>{brl(x.valor)}</td>}</tr>))}</tbody>
              </table>
              {detalhe.qtd > detalhe.pedidos.length && <p className="gv-aviso">Mostrando os {detalhe.pedidos.length} mais recentes de {detalhe.qtd}.</p>}
            </div>)}
        </div>)}

      {serie?.ok && !serieVazia(pontos) && !sel && <p className="gv-aviso">Passe o mouse para ver os valores e clique para abrir os pedidos.</p>}
      {serie?.ok && !serieVazia(pontos) && (
        <details style={{ marginTop: 8 }}>
          <summary className="sub">Ver como tabela</summary>
          <table style={{ marginTop: 6 }}>
            <thead><tr><th>{ROTULO_DIMENSAO[dimReal]}</th><th style={{ textAlign: 'right' }}>{ROTULO_METRICA[m]}</th><th style={{ textAlign: 'right' }}>Pedidos</th></tr></thead>
            <tbody>{pontos.map((p) => <tr key={p.chave}><td>{p.rotulo}</td><td style={{ textAlign: 'right' }}>{fmtMetrica(m, p.v)}</td><td style={{ textAlign: 'right' }}>{p.qtd}</td></tr>)}</tbody>
          </table>
        </details>)}
      {serie?.ok && serie.carga_em_andamento && <p className="gv-aviso">A carga do histórico de pedidos ainda está em andamento; períodos antigos podem estar incompletos.</p>}
      {serie?.ok && serie.primeira_data && faixa.de && faixa.de < serie.primeira_data && <p className="gv-aviso">A base de pedidos começa em {dataBr(serie.primeira_data)}; antes disso não há dados.</p>}
    </article>
  )
}

function Kpi({ rot, v }: { rot: string; v: ReactNode }) {
  return <div className="gv-kpi"><small>{rot}</small><strong>{v}</strong></div>
}

interface PGraf { pontos: Ponto[]; m: Metrica; hover: number | null; setHover: (i: number | null) => void; selecionado: string | null; onClique: (p: Ponto, i: number) => void }

function Cartesiano({ pontos, ant, m, tipo, hover, setHover, selecionado, onClique, chaveAnim }: PGraf & { ant: Ponto[]; tipo: TipoGrafico; chaveAnim: string }) {
  const ml = 58, mr = 14, mt = 18, mb = 38
  const iw = W - ml - mr, ih = H - mt - mb
  const max = Math.max(...pontos.map((p) => p.v), ...ant.map((p) => p.v), 0)
  const { topo, marcas } = escala(max, m === 'qtd')
  const n = pontos.length
  const passo = iw / n
  const x = (i: number) => ml + passo * i + passo / 2
  const y = (v: number) => mt + ih - (v / topo) * ih
  const cada = Math.ceil(n / 10)
  const caminho = (arr: Ponto[]) => arr.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const lw = Math.min(passo * 0.64, 46)
  const rotuloValor = n <= 12
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'manipulation' }} role="img" aria-label="Gráfico de vendas">
      <defs>
        <linearGradient id="gv-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--g1)" stopOpacity="1" /><stop offset="100%" stopColor="var(--g1)" stopOpacity="0.55" /></linearGradient>
        <linearGradient id="gv-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--g1)" stopOpacity="0.45" /><stop offset="100%" stopColor="var(--g1)" stopOpacity="0" /></linearGradient>
      </defs>
      {marcas.map((v) => (
        <g key={v}>
          <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke="var(--borda)" strokeWidth={1} strokeDasharray={v === 0 ? undefined : '3 4'} opacity={v === 0 ? 1 : 0.7} />
          <text x={ml - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--mudo)">{fmtEixo(m, v)}</text>
        </g>))}
      <g key={chaveAnim}>
        {tipo === 'area' && <path d={`${caminho(pontos)} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`} fill="url(#gv-area)" className="gv-fatia" />}
        {(tipo === 'linha' || tipo === 'area') && <path d={caminho(pontos)} fill="none" stroke="var(--g1)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" className="gv-linha-anim" />}
        {tipo === 'coluna' && pontos.map((p, i) => {
          const h = Math.max(p.v > 0 ? 2 : 0, y(0) - y(p.v)); const r = Math.min(6, lw / 2, h)
          const x0 = x(i) - lw / 2, y0 = y(0) - h
          const d = `M${x0},${y0 + h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + lw - r} Q${x0 + lw},${y0} ${x0 + lw},${y0 + r} V${y0 + h} Z`
          const esmaece = (hover != null && hover !== i) || (selecionado != null && selecionado !== p.chave)
          return <path key={p.chave} d={d} fill="url(#gv-grad)" className="gv-barra" style={{ animationDelay: `${Math.min(i * 18, 360)}ms`, opacity: esmaece ? 0.45 : 1, transition: 'opacity .15s', stroke: selecionado === p.chave ? 'var(--txt)' : 'none', strokeWidth: 2 }} />
        })}
        {ant.length > 0 && <path d={caminho(ant)} fill="none" stroke="var(--g4)" strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" opacity={0.9} />}
        {ant.map((p, i) => <circle key={p.chave} cx={x(i)} cy={y(p.v)} r={hover === i ? 4.5 : 2.5} fill="var(--g4)" stroke="var(--card)" strokeWidth={1.5} />)}
        {(tipo === 'linha' || tipo === 'area') && pontos.map((p, i) => <circle key={p.chave} cx={x(i)} cy={y(p.v)} r={hover === i || selecionado === p.chave ? 6 : n > 40 ? 0 : 3.5} fill="var(--g1)" stroke="var(--card)" strokeWidth={2} />)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={mt} y2={y(0)} stroke="var(--mudo)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />}
        {rotuloValor && tipo === 'coluna' && pontos.map((p, i) => p.v > 0 && <text key={p.chave} x={x(i)} y={y(p.v) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--txt)">{fmtEixo(m, p.v)}</text>)}
      </g>
      {pontos.map((p, i) => (
        <g key={p.chave}>
          <rect x={ml + passo * i} y={mt} width={passo} height={ih} fill="transparent" style={{ cursor: p.outros ? 'default' : 'pointer' }} tabIndex={0} role="button" aria-label={`${p.rotulo}: ${fmtMetrica(m, p.v)}. Abrir pedidos`}
                onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onClique(p, i)} onKeyDown={(e) => { if (e.key === 'Enter') onClique(p, i) }} />
          {i % cada === 0 && <text x={x(i)} y={H - mb + 17} textAnchor="middle" fontSize={11} fill={selecionado === p.chave || hover === i ? 'var(--txt)' : 'var(--mudo)'}>{n > 12 ? p.rotulo.slice(0, 5) : corta(p.rotulo, 11)}</text>}
        </g>))}
    </svg>
  )
}

function Barras({ pontos, m, hover, setHover, selecionado, onClique }: PGraf) {
  const ml = 160, mr = 78, linha = 34
  const h = pontos.length * linha + 10
  const max = Math.max(...pontos.map((p) => p.v)) || 1
  const total = pontos.reduce((s, p) => s + p.v, 0) || 1
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Gráfico de barras de vendas">
      {pontos.map((p, i) => {
        const w = Math.max(4, ((W - ml - mr) * p.v) / max)
        const cor = corDe(p, i)
        const esmaece = (hover != null && hover !== i) || (selecionado != null && selecionado !== p.chave)
        return (
          <g key={p.chave} style={{ cursor: p.outros ? 'default' : 'pointer' }} tabIndex={0} role="button" aria-label={`${p.rotulo}: ${fmtMetrica(m, p.v)}`}
             onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onClique(p, i)} onKeyDown={(e) => { if (e.key === 'Enter') onClique(p, i) }}>
            <rect x={0} y={i * linha} width={W} height={linha} fill="transparent" />
            <text x={ml - 10} y={i * linha + 22} textAnchor="end" fontSize={12} fill="var(--txt)">{corta(p.rotulo, 24)}</text>
            <rect className="gv-hbarra" x={ml} y={i * linha + 6} width={w} height={22} rx={6} fill={cor} style={{ animationDelay: `${i * 40}ms`, opacity: esmaece ? 0.4 : 1, transition: 'opacity .15s', stroke: selecionado === p.chave ? 'var(--txt)' : 'none', strokeWidth: 2 }} />
            <text x={ml + w + 8} y={i * linha + 22} fontSize={11.5} fontWeight={600} fill="var(--txt)">{fmtEixo(m, p.v)}{m !== 'ticket' && <tspan fill="var(--mudo)" fontWeight={400}> · {((p.v / total) * 100).toFixed(0)}%</tspan>}</text>
          </g>)
      })}
    </svg>
  )
}

function Rosca({ pontos, m, vazado, hover, setHover, selecionado, onClique }: PGraf & { vazado: boolean }) {
  const total = pontos.reduce((s, p) => s + p.v, 0) || 1
  const cx = 130, cy = 130, R = 118, r = vazado ? 72 : 0
  let ang = -Math.PI / 2
  const fatias = pontos.map((p, i) => {
    const a = (p.v / total) * Math.PI * 2
    const a0 = ang, a1 = ang + (a >= Math.PI * 2 ? Math.PI * 2 - 0.0001 : a)
    ang += a
    const meio = (a0 + a1) / 2
    const pt = (rad: number, t: number) => `${(cx + rad * Math.cos(t)).toFixed(2)},${(cy + rad * Math.sin(t)).toFixed(2)}`
    const g = a1 - a0 > Math.PI ? 1 : 0
    const d = r > 0 ? `M${pt(R, a0)} A${R},${R} 0 ${g} 1 ${pt(R, a1)} L${pt(r, a1)} A${r},${r} 0 ${g} 0 ${pt(r, a0)} Z` : `M${cx},${cy} L${pt(R, a0)} A${R},${R} 0 ${g} 1 ${pt(R, a1)} Z`
    return { p, i, d, cor: corDe(p, i), pct: (p.v / total) * 100, dx: Math.cos(meio) * 7, dy: Math.sin(meio) * 7 }
  })
  const ativo = hover != null ? fatias[hover] : null
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
      <svg viewBox="0 0 260 260" style={{ width: 260, height: 260, flex: '0 0 auto' }} role="img" aria-label="Gráfico de proporção de vendas">
        {fatias.map((f) => {
          const esmaece = (hover != null && hover !== f.i) || (selecionado != null && selecionado !== f.p.chave)
          const destaque = hover === f.i || selecionado === f.p.chave
          return <path key={f.p.chave} d={f.d} fill={f.cor} stroke="var(--card)" strokeWidth={2.5} className="gv-fatia" style={{ opacity: esmaece ? 0.45 : 1, transform: destaque ? `translate(${f.dx}px, ${f.dy}px)` : undefined }}
                       onPointerEnter={() => setHover(f.i)} onClick={() => onClique(f.p, f.i)} />
        })}
        {vazado && <>
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize={ativo ? 22 : 15} fontWeight={700} fill="var(--txt)">{ativo ? `${ativo.pct.toFixed(1).replace('.', ',')}%` : fmtEixo(m, total)}</text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill="var(--mudo)">{ativo ? corta(ativo.p.rotulo, 18) : 'total'}</text>
        </>}
      </svg>
      <ul className="gv-leg">
        {fatias.map((f) => (
          <li key={f.p.chave}>
            <button className={hover === f.i || selecionado === f.p.chave ? 'on' : ''} onPointerEnter={() => setHover(f.i)} onFocus={() => setHover(f.i)} onClick={() => onClique(f.p, f.i)}>
              <i style={{ background: f.cor }} />
              <span style={{ flex: 1 }}>{f.p.rotulo}</span>
              <span className="sub">{fmtEixo(m, f.p.v)} · {f.pct.toFixed(1).replace('.', ',')}%</span>
            </button>
          </li>))}
      </ul>
    </div>
  )
}
