import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFaixa, type FaixaDados } from './api'

const CHAVE = 'ane.faixa.oculta'
const lerOculta = () => { try { return localStorage.getItem(CHAVE) === '1' } catch { return false } }
const gravarOculta = (v: boolean) => { try { if (v) localStorage.setItem(CHAVE, '1'); else localStorage.removeItem(CHAVE) } catch { /* sem armazenamento */ } }

interface Local { nome: string; lat: number; lon: number; tz: string }
const CHAVE_LOCAL = 'ane.faixa.local'
const PADRAO: Local = { nome: 'Uberlândia-MG', lat: -18.9186, lon: -48.2772, tz: 'America/Sao_Paulo' }
function lerLocal(): Local {
  try { const j = JSON.parse(localStorage.getItem(CHAVE_LOCAL) ?? 'null'); if (j && typeof j.lat === 'number' && typeof j.lon === 'number' && j.nome) return { nome: String(j.nome), lat: j.lat, lon: j.lon, tz: String(j.tz || PADRAO.tz) } } catch { /* usa padrão */ }
  return PADRAO
}
interface Clima { temp: number; codigo: number; min: number; max: number; chuva: number | null; tz: string }
const CODIGOS: Record<number, string> = { 0: 'Céu limpo', 1: 'Predomínio de sol', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina', 51: 'Garoa', 53: 'Garoa', 55: 'Garoa forte', 61: 'Chuva fraca', 63: 'Chuva', 65: 'Chuva forte', 80: 'Pancadas de chuva', 81: 'Pancadas de chuva', 82: 'Pancadas fortes', 95: 'Trovoadas', 96: 'Trovoadas com granizo', 99: 'Trovoadas com granizo' }
const textoClima = (c: number) => CODIGOS[c] ?? 'Tempo variável'

function horaLocal(d: Date, tz: string) {
  try {
    const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short' }).format(d).replace('.', '')
    const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d)
    return `${dia} · ${hora}`
  } catch { return horaLocal(d, PADRAO.tz) }
}
function ha(iso: string) {
  const h = Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5)
  if (h < 1) return 'agora há pouco'
  if (h < 24) return `há ${Math.floor(h)} h`
  return `há ${Math.floor(h / 24)} d`
}

type Item =
  | { tipo: 'hora' }
  | { tipo: 'clima' }
  | { tipo: 'dolar' }
  | { tipo: 'noticia'; id: string; titulo: string; link: string; veiculo: string; quando: string }

export default function Faixa({ empresa }: { empresa: string }) {
  const [dados, setDados] = useState<FaixaDados | null>(null)
  const [oculta, setOculta] = useState(lerOculta)
  const [agora, setAgora] = useState(() => new Date())
  const [i, setI] = useState(0)
  const [pausa, setPausa] = useState(false)
  const [local, setLocal] = useState<Local>(lerLocal)
  const [clima, setClima] = useState<Clima | null>(null)
  const [aberto, setAberto] = useState(false)
  const reduzido = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])

  useEffect(() => {
    let vivo = true
    const buscar = () => apiFaixa.obter(empresa).then((d) => { if (vivo) setDados(d) }).catch(() => { /* faixa é opcional: falha não atrapalha o painel */ })
    buscar()
    const t = setInterval(buscar, 10 * 60 * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [empresa])

  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 30000); return () => clearInterval(t) }, [])

  // Clima e fuso da cidade de quem acessa (Open-Meteo, sem chave; falha não atrapalha o painel).
  useEffect(() => {
    if (!dados?.ativa || !dados.mostrar_hora) return
    let vivo = true
    const buscar = () => {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${local.lat}&longitude=${local.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`
      fetch(u).then((r) => r.json()).then((j) => {
        if (!vivo || !j?.current) return
        setClima({ temp: j.current.temperature_2m, codigo: j.current.weather_code, min: j.daily.temperature_2m_min[0], max: j.daily.temperature_2m_max[0], chuva: j.daily.precipitation_probability_max?.[0] ?? null, tz: j.timezone || local.tz })
      }).catch(() => { /* sem clima */ })
    }
    setClima(null); buscar()
    const t = setInterval(buscar, 30 * 60 * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [local.lat, local.lon, dados?.ativa, dados?.mostrar_hora, local.tz])

  function escolher(l: Local) {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(l)) } catch { /* sem armazenamento */ }
    setLocal(l); setAberto(false)
  }

  // Hora, tempo e dólar voltam a cada 3 manchetes, para a referência nunca ficar longe.
  const itens = useMemo<Item[]>(() => {
    if (!dados?.ativa) return []
    const info: Item[] = []
    if (dados.mostrar_hora) { info.push({ tipo: 'hora' }); if (clima) info.push({ tipo: 'clima' }) }
    if (dados.mostrar_dolar && dados.cotacao) info.push({ tipo: 'dolar' })
    const not: Item[] = []
    if (dados.mostrar_noticias) for (const n of dados.noticias ?? []) not.push({ tipo: 'noticia', id: n.id, titulo: n.titulo, link: n.link, veiculo: n.veiculo, quando: ha(n.publicado_em) })
    const l: Item[] = [...info]
    for (let k = 0; k < not.length; k += 3) { l.push(...not.slice(k, k + 3)); if (info.length && k + 3 < not.length) l.push(...info) }
    return l
  }, [dados, clima])

  const seg = Math.min(30, Math.max(4, dados?.segundos ?? 8))
  useEffect(() => {
    if (pausa || aberto || itens.length < 2 || oculta) return
    const t = setInterval(() => setI((x) => x + 1), seg * 1000)
    return () => clearInterval(t)
  }, [pausa, aberto, itens.length, seg, oculta, i])

  if (!dados?.ativa || itens.length === 0) return null

  if (oculta) {
    return (
      <button type="button" className="sec faixa-mostrar" onClick={() => { gravarOculta(false); setOculta(false) }} title="Mostrar a faixa informativa (hora, dólar e notícias)">
        Mostrar faixa
      </button>
    )
  }

  const pos = ((i % itens.length) + itens.length) % itens.length
  const item = itens[pos]
  let conteudo: ReactNode = null
  if (item.tipo === 'hora') {
    conteudo = <><span className="faixa-rotulo">{local.nome}</span><strong>{horaLocal(agora, clima?.tz ?? local.tz)}</strong></>
  } else if (item.tipo === 'clima' && clima) {
    conteudo = (
      <>
        <span className="faixa-rotulo">Tempo</span>
        <strong>{Math.round(clima.temp)}°C</strong>
        <span>{textoClima(clima.codigo)}</span>
        <span className="faixa-fonte">hoje {Math.round(clima.min)}° / {Math.round(clima.max)}°{clima.chuva !== null ? ` · chuva ${clima.chuva}%` : ''} · {local.nome}</span>
      </>
    )
  } else if (item.tipo === 'dolar') {
    const c = dados.cotacao!
    const v = c.variacao_pct
    conteudo = (
      <>
        <span className="faixa-rotulo">Dólar</span>
        <strong>R$ {c.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong>
        {v !== null && v !== undefined && <span className={v > 0 ? 'faixa-var sobe' : v < 0 ? 'faixa-var desce' : 'faixa-var'}>{v > 0 ? '▲' : v < 0 ? '▼' : '•'} {Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</span>}
        <span className="faixa-fonte">{c.origem === 'ptax' ? 'PTAX Banco Central' : 'cotação comercial'}{c.referencia_em ? ` · ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(c.referencia_em))}` : ''}</span>
      </>
    )
  } else if (item.tipo === 'noticia') {
    conteudo = (
      <>
        <span className="faixa-rotulo">Notícia</span>
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="faixa-titulo" title={item.titulo}>{item.titulo}</a>
        <span className="faixa-fonte">{item.veiculo} · {item.quando}</span>
      </>
    )
  }

  return (
    <div className="faixa-wrap">
      <div className="faixa" data-ajuda="faixa" role="region" aria-label="Faixa informativa" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)} onFocus={() => setPausa(true)} onBlur={() => setPausa(false)}>
        {itens.length > 1 && <button type="button" className="faixa-fechar" onClick={() => setI(pos - 1)} title="Item anterior" aria-label="Item anterior">‹</button>}
        <div key={`${item.tipo}-${pos}`} className={reduzido ? 'faixa-item' : 'faixa-item anima'} aria-live="off">{conteudo}</div>
        {itens.length > 1 && <button type="button" className="faixa-fechar" onClick={() => setI(pos + 1)} title="Próximo item" aria-label="Próximo item">›</button>}
        {dados.mostrar_hora && <button type="button" className="faixa-fechar" onClick={() => setAberto((a) => !a)} title={`Local do horário e do tempo: ${local.nome}. Clique para mudar`} aria-label="Mudar a cidade do horário e do tempo" aria-expanded={aberto}>⌖</button>}
        <button type="button" className="faixa-fechar" onClick={() => { gravarOculta(true); setOculta(true) }} title="Ocultar a faixa (você pode mostrar de novo quando quiser)" aria-label="Ocultar faixa informativa">×</button>
      </div>
      {aberto && <SeletorLocal atual={local} onEscolher={escolher} onFechar={() => setAberto(false)} />}
    </div>
  )
}

function SeletorLocal({ atual, onEscolher, onFechar }: { atual: Local; onEscolher: (l: Local) => void; onFechar: () => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Local[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  async function buscar() {
    setMsg(null)
    if (q.trim().length < 2) return
    try {
      const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=pt&countryCode=BR`)).json()
      const l: Local[] = (j.results ?? []).map((r: { name: string; admin1?: string; latitude: number; longitude: number; timezone?: string }) => ({ nome: `${r.name}${r.admin1 ? ' – ' + r.admin1 : ''}`, lat: r.latitude, lon: r.longitude, tz: r.timezone || PADRAO.tz }))
      setRes(l); if (l.length === 0) setMsg('Nenhuma cidade encontrada.')
    } catch { setMsg('Não consegui buscar agora.') }
  }
  function usarMinha() {
    setMsg('Aguardando a permissão do navegador…')
    if (!navigator.geolocation) { setMsg('Este navegador não informa a localização.'); return }
    navigator.geolocation.getCurrentPosition(async (p) => {
      const lat = p.coords.latitude, lon = p.coords.longitude
      let nome = 'Minha localização'
      try {
        const j = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`)).json()
        if (j.city || j.locality) nome = `${j.city || j.locality}${j.principalSubdivisionCode ? '-' + String(j.principalSubdivisionCode).replace(/^BR-/, '') : ''}`
      } catch { /* mantém o nome genérico */ }
      onEscolher({ nome, lat, lon, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || PADRAO.tz })
    }, () => setMsg('Sem permissão de localização. Busque a cidade pelo nome.'), { timeout: 10000, maximumAge: 600000 })
  }
  return (
    <div className="faixa-pop" role="dialog" aria-label="Cidade do horário e do tempo">
      <strong>Cidade do horário e do tempo</strong>
      <small className="mudo">Atual: {atual.nome}. A escolha vale só para você, neste navegador.</small>
      <button type="button" className="sec" onClick={usarMinha}>Usar minha localização</button>
      <form onSubmit={(e) => { e.preventDefault(); void buscar() }} className="faixa-pop-busca">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cidade (ex.: Uberlândia)" aria-label="Buscar cidade" />
        <button type="submit">Buscar</button>
      </form>
      {res.map((r) => <button type="button" key={`${r.lat},${r.lon}`} className="sec faixa-pop-item" onClick={() => onEscolher(r)}>{r.nome}</button>)}
      {msg && <small className="mudo">{msg}</small>}
      <button type="button" className="sec" onClick={() => onEscolher(PADRAO)}>Voltar para {PADRAO.nome}</button>
      <button type="button" className="sec" onClick={onFechar}>Fechar</button>
    </div>
  )
}
