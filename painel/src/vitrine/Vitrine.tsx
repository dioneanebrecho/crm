import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/700.css'
import '@fontsource-variable/dm-sans'
import './vitrine.css'
import qrcode from 'qrcode-generator'
import {
  apiPublica, brl, buscarCep, linkWhatsApp, ERROS_ENTREGA, ERROS_QUERO, ROTULO_CANAL,
  type Acompanhamento, type Entrega, type ItemArara, type MidiaPub, type Oferta, type Parecida, type Vitrine as DadosVitrine,
} from './apiPublica'

// Vitrine pública (mockup "Ane Brechó — Vitrine com cabides", validado em 22/11).
// Rotas: /vitrine (arara) · /vitrine/p/<código> (peça aberta) · /vitrine/a/<token> (acompanhamento). Canal de origem: ?c=<canal>.
const BASE = '/vitrine'
const CHAVE_TOKEN = (codigo: string) => `ane.vitrine.tok.${codigo}`
const lerToken = (codigo: string) => { try { return localStorage.getItem(CHAVE_TOKEN(codigo)) } catch { return null } }
const gravarToken = (codigo: string, tok: string) => { try { localStorage.setItem(CHAVE_TOKEN(codigo), tok) } catch { /* sem armazenamento */ } }
const ATIVAS = new Set(['reservada', 'fila', 'processando'])

type Rota = { tipo: 'arara' } | { tipo: 'peca'; codigo: string } | { tipo: 'acomp'; token: string }
function lerRota(): Rota {
  const p = location.pathname.replace(/\/+$/, '')
  const m = p.match(/^\/vitrine\/p\/([A-Za-z0-9_-]{6,40})$/)
  if (m) return { tipo: 'peca', codigo: m[1] }
  const a = p.match(/^\/vitrine\/a\/([0-9a-f]{64})$/)
  if (a) return { tipo: 'acomp', token: a[1] }
  return { tipo: 'arara' }
}
const canalDaUrl = () => new URLSearchParams(location.search).get('c')
function navegar(caminho: string) {
  const c = canalDaUrl()
  history.pushState(null, '', caminho + (c ? `?c=${encodeURIComponent(c)}` : ''))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// ---------- silhuetas (peça sem foto) ----------
const CLIPS: Record<string, string> = {
  vestido: 'polygon(26% 0%, 36% 0%, 50% 10%, 64% 0%, 74% 0%, 74% 30%, 80% 44%, 100% 100%, 0% 100%, 20% 44%, 26% 30%)',
  blusa: 'polygon(20% 0%, 40% 0%, 50% 7%, 60% 0%, 80% 0%, 100% 18%, 90% 44%, 80% 38%, 82% 100%, 18% 100%, 20% 38%, 10% 44%, 0% 18%)',
  casaco: 'polygon(18% 0%, 40% 0%, 50% 24%, 60% 0%, 82% 0%, 100% 10%, 100% 90%, 84% 92%, 82% 100%, 18% 100%, 16% 92%, 0% 90%, 0% 10%)',
  camisa: 'polygon(18% 0%, 42% 0%, 50% 8%, 58% 0%, 82% 0%, 100% 12%, 100% 72%, 88% 74%, 84% 30%, 82% 100%, 18% 100%, 16% 30%, 12% 74%, 0% 72%, 0% 12%)',
  saia: 'polygon(22% 0%, 78% 0%, 100% 100%, 0% 100%)',
  calca: 'polygon(16% 0%, 84% 0%, 94% 100%, 58% 100%, 50% 26%, 42% 100%, 6% 100%)',
}
const CORES = ['#7A1E2B', '#3A3940', '#2F3D5C', '#4F6B4A', '#C9922E', '#4A6B8C', '#8C5A6E', '#6B5B3E']
function silhueta(nome: string, categoria: string): string {
  const t = `${nome} ${categoria}`.toLowerCase()
  if (/vestido|macac/.test(t)) return 'vestido'
  if (/casaco|jaqueta|blazer|colete|cardig|moletom/.test(t)) return 'casaco'
  if (/camisa(?!ta)|polo/.test(t)) return 'camisa'
  if (/saia/.test(t)) return 'saia'
  if (/cal[çc]a|short|bermuda|jeans/.test(t)) return 'calca'
  return 'blusa'
}
const corDe = (codigo: string) => CORES[[...codigo].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length]

function Cabide({ largura }: { largura: number }) {
  const h = largura * 0.38
  return (
    <svg width={largura} height={h} viewBox="0 0 120 46" aria-hidden="true" className="cab-svg">
      <path d="M60 24 L60 17 C60 12 67 12 67 7 C67 2 58 0 55 5" />
      <path d="M60 24 L24 41 Q20 43 24 45 L96 45 Q100 43 96 41 Z" />
    </svg>
  )
}

function Roupa({ foto, nome, categoria, codigo, w, h }: { foto: string | null; nome: string; categoria: string; codigo: string; w: number; h: number }) {
  if (foto) return <img className="roupa-foto" src={foto} alt="" loading="lazy" style={{ width: w, height: h }} />
  const sombra = 'linear-gradient(90deg, rgba(0,0,0,.24), rgba(0,0,0,0) 26%, rgba(255,255,255,.07) 50%, rgba(0,0,0,0) 74%, rgba(0,0,0,.24))'
  return <div className="roupa-sil" style={{ width: w, height: h, clipPath: CLIPS[silhueta(nome, categoria)], background: `${sombra}, ${corDe(codigo)}` }} />
}

// ---------- status ----------
function textoStatus(i: { situacao: string; fila_total: number | null }) {
  if (i.situacao === 'disponivel') return { curto: 'Disponível', cls: 'ok' }
  if (i.situacao === 'reservada') return { curto: i.fila_total ? `Reservada · ${i.fila_total} na fila` : 'Reservada', cls: 'fila' }
  return { curto: 'Vendida', cls: 'vend' }
}

function useLargura() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return w
}

function useTema(tema: string | undefined) {
  const [escuroSistema, setEsc] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!m) return
    const f = (e: MediaQueryListEvent) => setEsc(e.matches)
    m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  return tema === 'escuro' || (tema === 'auto' && escuroSistema) ? 'escuro' : 'claro'
}

// ======================================================================
export default function Vitrine() {
  const [rota, setRota] = useState<Rota>(lerRota)
  const [dados, setDados] = useState<DadosVitrine | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [cat, setCat] = useState('Todos')
  const [toast, setToast] = useState<string | null>(null)
  const [codigoAcomp, setCodigoAcomp] = useState<string | null>(null)
  const canal = canalDaUrl()
  const largura = useLargura()
  const tema = useTema(dados?.aparencia.tema)

  const carregar = useCallback(() => {
    apiPublica.vitrine(canal).then((d) => { if (d.situacao !== 'ok') setErro('Vitrine não encontrada.'); else { setDados(d); setErro(null) } })
      .catch((e: Error) => setErro(e.message))
  }, [canal])
  useEffect(() => { carregar(); const t = setInterval(carregar, 30_000); return () => clearInterval(t) }, [carregar])
  useEffect(() => { const f = () => setRota(lerRota()); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f) }, [])
  useEffect(() => { document.title = dados ? `${dados.loja} · Vitrine` : 'Vitrine' }, [dados])

  // link de acompanhamento: descobre a peça pelo token e abre a ficha nela
  useEffect(() => {
    if (rota.tipo !== 'acomp') { setCodigoAcomp(null); return }
    apiPublica.acompanhar(rota.token).then((a) => {
      if (a.situacao === 'nao_encontrada' || !a.peca?.link) { setToast('Este link de acompanhamento expirou.'); navegar(BASE); return }
      gravarToken(a.peca.link, rota.token); setCodigoAcomp(a.peca.link)
    }).catch((e: Error) => setToast(e.message))
  }, [rota])

  const mostrar = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 5000) }, [])
  const itens = dados?.itens ?? []
  const cats = useMemo(() => ['Todos', ...Array.from(new Set(itens.map((i) => i.categoria))).sort((a, b) => a.localeCompare(b, 'pt-BR'))], [itens])
  const filtradas = itens.filter((i) => cat === 'Todos' || i.categoria === cat)
  const colunas = largura < 560 ? 2 : largura < 860 ? 3 : largura < 1180 ? 4 : 5
  const linhas: ItemArara[][] = []
  for (let i = 0; i < filtradas.length; i += colunas) linhas.push(filtradas.slice(i, i + colunas))
  const amp = dados?.aparencia.animacao ?? 'suave'
  const aberto = rota.tipo === 'peca' ? rota.codigo : codigoAcomp

  return (
    <div className={`vit tema-${tema}`}>
      <div className="vit-pagina">
        <header className="vit-topo">
          <img src="/logo-anebrecho.jpg" alt="" className="vit-logo" />
          <div>
            <h1>{dados?.loja ?? 'Ane Brechó'}</h1>
            <span className="mudo">Moda sustentável, consumo consciente.</span>
          </div>
        </header>
        <div className="vit-chip-canal">
          <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="7" cy="7" r="1.6" fill="currentColor" /></svg>
          <span>{canal && ROTULO_CANAL[canal] ? <>Você chegou pelo <strong>{ROTULO_CANAL[canal]}</strong>. </> : null}Toque numa peça para ver os detalhes.</span>
        </div>
        {cats.length > 2 && (
          <nav aria-label="Categorias" className="vit-cats">
            {cats.map((c) => <button key={c} type="button" className={c === cat ? 'ativo' : ''} aria-pressed={c === cat} onClick={() => setCat(c)}>{c}</button>)}
          </nav>
        )}
        {erro && <p className="vit-aviso" role="alert">{erro}</p>}
        {!dados && !erro && <p className="vit-aviso">Carregando a arara…</p>}
        {dados && filtradas.length === 0 && <p className="vit-aviso">Nenhuma peça nesta categoria agora.</p>}

        {linhas.map((linha, li) => (
          <div key={li} className="arara">
            <div className="arara-cano" aria-hidden="true" />
            <div className="arara-grade" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
              {linha.map((it, k) => {
                const s = textoStatus(it); const n = li * colunas + k
                return (
                  <div key={it.codigo} className="arara-item">
                    <button type="button" className={`cabide amp-${amp}${s.cls === 'vend' ? ' vendida' : ''}`}
                      style={{ animationDuration: `${(2.6 + (n % 3) * 0.45).toFixed(2)}s`, animationDelay: `${(-(n * 0.7)).toFixed(2)}s` }}
                      onClick={() => navegar(`${BASE}/p/${it.codigo}`)}
                      aria-label={`${it.nome}${it.tamanho ? `, tamanho ${it.tamanho}` : ''}, ${brl(it.preco)}, ${s.curto}`}>
                      <Cabide largura={120} />
                      <div className="cabide-roupa"><Roupa foto={it.foto} nome={it.nome} categoria={it.categoria} codigo={it.codigo} w={112} h={142} /></div>
                      {(dados!.aparencia.etiqueta_codigo || dados!.aparencia.etiqueta_preco) && (
                        <span className="etiqueta">
                          {dados!.aparencia.etiqueta_codigo && it.codigo_live && <b>#{it.codigo_live}</b>}
                          {dados!.aparencia.etiqueta_preco && <span className={s.cls === 'vend' ? 'riscado' : ''}>{brl(it.preco)}</span>}
                        </span>
                      )}
                    </button>
                    <span className="arara-nome">{it.nome}</span>
                    <span className={`pilula ${s.cls}`}>{s.curto}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <footer className="vit-rodape mudo">Pix ou cartão · envio para todo o Brasil · Uberlândia-MG</footer>
      </div>

      {dados && (
        <Ficha key={aberto ?? 'nada'} codigo={aberto} dados={dados} canal={canal} mostrar={mostrar} onAtualizar={carregar}
          onFechar={() => navegar(BASE)} onAbrir={(c) => navegar(`${BASE}/p/${c}`)} />
      )}
      {toast && <button type="button" className="vit-toast" onClick={() => setToast(null)}>{toast}</button>}
    </div>
  )
}

// ======================================================================
type Passo = 'detalhe' | 'dados' | 'acomp'

function Ficha({ codigo, dados, canal, mostrar, onAtualizar, onFechar, onAbrir }: {
  codigo: string | null; dados: DadosVitrine; canal: string | null; mostrar: (m: string) => void
  onAtualizar: () => void; onFechar: () => void; onAbrir: (codigo: string) => void
}) {
  const [oferta, setOferta] = useState<Oferta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [passo, setPasso] = useState<Passo>('detalhe')
  const [acomp, setAcomp] = useState<Acompanhamento | null>(null)
  const [token, setToken] = useState<string | null>(() => (codigo ? lerToken(codigo) : null))
  const aberta = !!codigo
  const fecharRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!codigo) return
    apiPublica.oferta(codigo, canal).then((o) => { if (o.situacao === 'nao_encontrada') setErro('Esta peça não está mais na vitrine.'); else setOferta(o) })
      .catch((e: Error) => setErro(e.message))
    const tok = lerToken(codigo)
    if (tok) apiPublica.acompanhar(tok).then((a) => { if (ATIVAS.has(a.situacao) || a.situacao === 'paga') { setAcomp(a); setPasso('acomp') } }).catch(() => undefined)
  }, [codigo, canal])

  useEffect(() => { if (aberta) fecharRef.current?.focus() }, [aberta])
  useEffect(() => {
    if (!aberta) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f)
  }, [aberta, onFechar])

  // acompanhamento ao vivo: a fila anda e a reserva vence sozinha no servidor
  useEffect(() => {
    if (passo !== 'acomp' || !token || !acomp || !ATIVAS.has(acomp.situacao)) return
    const t = setInterval(() => {
      apiPublica.acompanhar(token).then((a) => {
        if (a.situacao === 'reservada' && acomp.situacao === 'fila') mostrar(`Chegou sua vez! A peça está reservada para você por ${a.prazo_min} minutos.`)
        setAcomp(a); if (a.situacao !== acomp.situacao) onAtualizar()
      }).catch(() => undefined)
    }, 8000)
    return () => clearInterval(t)
  }, [passo, token, acomp, mostrar, onAtualizar])

  const item = codigo ? dados.itens.find((i) => i.codigo === codigo) ?? null : null
  const p = oferta?.peca
  const situacao = oferta?.situacao ?? item?.situacao ?? 'disponivel'
  const filaTotal = oferta?.fila_total ?? item?.fila_total ?? null
  const prazo = dados.regras.prazo_min
  const parecidasArara: Parecida[] = useMemo(() => {
    if (!item) return []
    const qtd = dados.regras.qtd_parecidas ?? 3
    return dados.itens.filter((i) => i.situacao === 'disponivel' && i.codigo !== item.codigo)
      .sort((a, b) => Number(b.categoria === item.categoria) - Number(a.categoria === item.categoria) || Math.abs(a.preco - item.preco) - Math.abs(b.preco - item.preco))
      .slice(0, qtd).map((i) => ({ codigo: i.codigo, nome: i.nome, tamanho: i.tamanho, preco: i.preco, foto: i.foto }))
  }, [dados, item])

  const nomePeca = p?.nome ?? item?.nome ?? ''
  const codLive = p?.codigo_live ?? item?.codigo_live ?? null
  const fotoCapa = item?.foto ?? p?.fotos[0]?.url ?? null

  return (
    <>
      <div className={`veu${aberta ? ' on' : ''}`} onClick={onFechar} aria-hidden="true" />
      <section className={`sheet${aberta ? ' aberta' : ''}`} role="dialog" aria-modal="true" aria-label="Detalhes da peça" aria-hidden={!aberta}>
        <div className="sheet-topo">
          <span className="sheet-alca" aria-hidden="true" />
          <button ref={fecharRef} type="button" className="icone" onClick={onFechar} aria-label="Fechar">
            <svg width="18" height="18" aria-hidden="true"><path d="M3 3 L15 15 M15 3 L3 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="sheet-corpo">
          {erro && <p className="vit-aviso" role="alert">{erro}</p>}
          {aberta && !erro && !p && !item && <p className="vit-aviso">Carregando a peça…</p>}

          {aberta && (p || item) && passo !== 'detalhe' && (
            <div className="resumo">
              <div className="resumo-img"><Roupa foto={fotoCapa} nome={nomePeca} categoria={item?.categoria ?? ''} codigo={codigo!} w={44} h={56} /></div>
              <div><strong>{nomePeca}</strong><span className="mudo">{codLive ? `#${codLive} · ` : ''}{(p?.tamanho ?? item?.tamanho) ? `Tam. ${p?.tamanho ?? item?.tamanho} · ` : ''}{brl(p?.preco ?? item?.preco)}</span></div>
            </div>
          )}

          {aberta && (p || item) && passo === 'detalhe' && (
            <Detalhe oferta={oferta} item={item} codigo={codigo!} dados={dados} situacao={situacao} filaTotal={filaTotal} prazo={prazo}
              parecidas={parecidasArara} onQuero={() => setPasso('dados')} onAbrir={onAbrir}
              temReserva={!!acomp && ATIVAS.has(acomp.situacao)} onVerReserva={() => setPasso('acomp')} />
          )}

          {aberta && passo === 'dados' && (
            <Dados codigo={codigo!} canal={canal} modoFila={situacao !== 'disponivel'} prazo={prazo}
              onVoltar={() => setPasso('detalhe')}
              onPronto={(a) => { if (a.token) { gravarToken(codigo!, a.token); setToken(a.token) } setAcomp(a); setPasso('acomp'); onAtualizar() }} />
          )}

          {aberta && passo === 'acomp' && acomp && token && (
            <Acomp acomp={acomp} token={token} dados={dados} codLive={codLive} nomePeca={nomePeca} codigo={codigo!}
              parecidas={acomp.parecidas?.length ? acomp.parecidas : parecidasArara} onAbrir={onAbrir} mostrar={mostrar}
              onDeNovo={() => setPasso('dados')} onVerPeca={() => setPasso('detalhe')} />
          )}
        </div>
      </section>
    </>
  )
}

// ---------- ficha da peça ----------
const ROTULO_MIDIA: Record<string, string> = { frente: 'Frente', costas: 'Costas', tecido: 'Detalhe do tecido', video: 'Vídeo', outra: 'Foto' }
const CURTO_MIDIA: Record<string, string> = { frente: 'Frente', costas: 'Costas', tecido: 'Tecido', video: 'Vídeo', outra: 'Foto' }
const bonito = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

function Detalhe({ oferta, item, codigo, dados, situacao, filaTotal, prazo, parecidas, onQuero, onAbrir, temReserva, onVerReserva }: {
  oferta: Oferta | null; item: ItemArara | null; codigo: string; dados: DadosVitrine; situacao: string; filaTotal: number | null; prazo: number
  parecidas: Parecida[]; onQuero: () => void; onAbrir: (c: string) => void; temReserva: boolean; onVerReserva: () => void
}) {
  const p = oferta?.peca
  const ordem = dados.aparencia.ordem_midias
  const midias: MidiaPub[] = useMemo(() => {
    const m = oferta?.conteudo?.midias?.length ? [...oferta.conteudo.midias] : (p?.fotos ?? []).map((f) => ({ tipo: 'foto' as const, url: f.url, rotulo: 'outra' }))
    return m.sort((a, b) => (ordem.indexOf(a.rotulo ?? '') + 1 || 99) - (ordem.indexOf(b.rotulo ?? '') + 1 || 99))
  }, [oferta, p, ordem])
  const [vista, setVista] = useState(0)
  const atual = midias[vista]
  const disp = situacao === 'disponivel', fila = situacao === 'reservada', vend = !disp && !fila
  const nome = p?.nome ?? item?.nome ?? ''
  const attrs = Object.entries(p?.atributos ?? {}).filter(([, v]) => typeof v === 'string' || typeof v === 'number').slice(0, 6)
  const verFila = dados.regras.fila_visibilidade !== 'posicao' && filaTotal != null
  const amp = dados.aparencia.animacao

  return (
    <div className="passo">
      <div className="palco">
        {atual?.tipo === 'video'
          ? <video src={atual.url} controls playsInline muted={dados.aparencia.video_auto} autoPlay={dados.aparencia.video_auto} className="palco-midia" />
          : atual
            ? <img src={atual.url} alt={`${nome} — ${ROTULO_MIDIA[atual.rotulo ?? 'outra'] ?? 'foto'}`} className="palco-midia" />
            : (
              <div className={`cabide grande amp-${amp}`} style={{ animationDuration: '2.6s' }}>
                <Cabide largura={200} />
                <div className="cabide-roupa"><Roupa foto={null} nome={nome} categoria={item?.categoria ?? ''} codigo={codigo} w={180} h={214} /></div>
              </div>
            )}
        {midias.length > 0 && <span className="palco-rotulo">{vista + 1}/{midias.length} · {ROTULO_MIDIA[atual?.rotulo ?? 'outra'] ?? 'Foto'}</span>}
      </div>
      {midias.length > 1 && (
        <div role="group" aria-label="Fotos e vídeo" className="miniaturas">
          {midias.map((m, i) => (
            <button key={i} type="button" onClick={() => setVista(i)} aria-label={ROTULO_MIDIA[m.rotulo ?? 'outra'] ?? 'Foto'} aria-pressed={i === vista} className={i === vista ? 'ativa' : ''}>
              {m.tipo === 'video' ? <span>{CURTO_MIDIA.video}</span> : <img src={m.url} alt="" />}
            </button>
          ))}
        </div>
      )}

      <div className="ficha-titulo">
        <span className="sobre">{p?.categoria ?? item?.categoria}{(p?.codigo_live ?? item?.codigo_live) ? ` · código #${p?.codigo_live ?? item?.codigo_live}` : ''}</span>
        <h2>{nome}</h2>
        <div className="preco"><span className={vend ? 'riscado' : ''}>{brl(p?.preco ?? item?.preco)}</span><small className="mudo">no Pix ou cartão + frete</small></div>
      </div>
      <div className="cards3">
        <div><small>Tamanho</small><strong>{p?.tamanho ?? item?.tamanho ?? '—'}</strong></div>
        <div><small>Estado</small><strong>{p?.condicao ?? item?.condicao ?? '—'}</strong></div>
        <div><small>Marca</small><strong>{p?.marca ?? '—'}</strong></div>
      </div>
      {attrs.length > 0 && (
        <div className="caixa">
          <span className="caixa-tit">Detalhes da peça</span>
          <div className="attrs">{attrs.map(([k, v]) => <span key={k}>{bonito(k)}<br /><strong>{String(v)}</strong></span>)}</div>
        </div>
      )}
      {p?.descricao && <p className="descricao">{p.descricao}</p>}

      <div className={`status ${disp ? 'ok' : fila ? 'fila' : 'vend'}`}>
        <strong>{disp ? 'Disponível' : fila ? 'Reservada agora' : 'Vendida'}</strong>
        <span>{disp ? `Quem tocar em "Quero" primeiro garante a reserva por ${prazo} minutos.`
          : fila ? `Alguém está com a reserva${verFila && filaTotal ? ` e ${filaTotal} ${filaTotal === 1 ? 'pessoa espera' : 'pessoas esperam'} na fila` : ''}. Se não pagar em ${prazo} min, a vez passa para a próxima.`
            : 'Esta peça já encontrou dona. Separamos opções parecidas para você.'}</span>
      </div>

      {temReserva && <button type="button" className="cta" onClick={onVerReserva}>Ver minha reserva</button>}
      {!temReserva && !vend && (
        <>
          <button type="button" className="cta" onClick={onQuero}>{disp ? 'Quero esta peça' : verFila && filaTotal != null ? `Entrar na fila (${filaTotal + 1}º lugar)` : 'Entrar na fila'}</button>
          <span className="mudo centro pequeno">Agora só nome, WhatsApp e @. CPF e endereço só na hora de pagar.</span>
        </>
      )}
      {vend && <Parecidas lista={parecidas} onAbrir={onAbrir} titulo="Parecidas disponíveis" />}
    </div>
  )
}

function Parecidas({ lista, onAbrir, titulo }: { lista: Parecida[]; onAbrir: (c: string) => void; titulo: string }) {
  if (!lista.length) return null
  return (
    <div className="parecidas">
      <strong>{titulo}</strong>
      <div className="parecidas-grade">
        {lista.map((s) => (
          <button key={s.codigo} type="button" onClick={() => onAbrir(s.codigo)} aria-label={`Ver ${s.nome}, ${brl(s.preco)}`}>
            <Roupa foto={s.foto} nome={s.nome} categoria="" codigo={s.codigo} w={48} h={62} />
            <span>{s.nome}</span><strong>{brl(s.preco)}</strong>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- passo 2: quem é você ----------
const mascaraTel = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`
}
const novaChave = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`)

function Dados({ codigo, canal, modoFila, prazo, onVoltar, onPronto }: {
  codigo: string; canal: string | null; modoFila: boolean; prazo: number; onVoltar: () => void; onPronto: (a: Acompanhamento) => void
}) {
  const [nome, setNome] = useState(''); const [tel, setTel] = useState(''); const [ig, setIg] = useState('')
  const [aceite, setAceite] = useState(false); const [mkt, setMkt] = useState(false)
  const [erro, setErro] = useState<string | null>(null); const [enviando, setEnviando] = useState(false)
  const chave = useRef(novaChave())
  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!aceite) { setErro(ERROS_QUERO.aceite_obrigatorio); return }
    setEnviando(true); setErro(null)
    try {
      const a = await apiPublica.quero(codigo, chave.current, nome, tel, ig, aceite, mkt, canal)
      if (a.erro) { setErro(ERROS_QUERO[a.erro] ?? 'Não foi possível concluir. Tente de novo.'); if (a.erro !== 'muitas_tentativas') chave.current = novaChave() }
      else onPronto(a)
    } catch (x) { setErro((x as Error).message) } finally { setEnviando(false) }
  }
  return (
    <form className="passo form" onSubmit={enviar} noValidate>
      <h2>{modoFila ? 'Entrar na fila' : 'Garanta sua reserva'}</h2>
      <span className="mudo">{modoFila ? 'Avisamos quando chegar sua vez. CPF e endereço só se a peça for sua.' : 'Só 3 dados agora. CPF e endereço, só na hora de pagar.'}</span>
      <Campo rotulo="Nome completo"><input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" placeholder="Como está no documento" required maxLength={120} /></Campo>
      <Campo rotulo="WhatsApp"><input value={tel} onChange={(e) => setTel(mascaraTel(e.target.value))} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="(34) 9 0000-0000" required /></Campo>
      <Campo rotulo="@ do Instagram"><input value={ig} onChange={(e) => setIg(e.target.value)} autoComplete="off" autoCapitalize="none" placeholder="@seuperfil (opcional)" maxLength={31} /></Campo>
      <label className="check"><input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />Concordo em usar estes dados para atender meu pedido.</label>
      <label className="check mudo"><input type="checkbox" checked={mkt} onChange={(e) => setMkt(e.target.checked)} />Quero receber novidades e peças parecidas pelo WhatsApp (opcional).</label>
      {erro && <p className="erro-campo" role="alert">{erro}</p>}
      <button type="submit" className="cta" disabled={enviando}>{enviando ? 'Enviando…' : modoFila ? 'Entrar na fila' : `Reservar por ${prazo} min`}</button>
      <button type="button" className="link" onClick={onVoltar}>Voltar para a peça</button>
    </form>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <label className="campo">{rotulo}{children}</label>
}

// ---------- passo 3: reserva, fila, pago, fim ----------
function useContagem(expira?: string) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t) }, [])
  return expira ? Math.max(0, Math.floor((new Date(expira).getTime() - agora) / 1000)) : 0
}

function Acomp({ acomp, token, dados, codLive, nomePeca, codigo, parecidas, onAbrir, mostrar, onDeNovo, onVerPeca }: {
  acomp: Acompanhamento; token: string; dados: DadosVitrine; codLive: string | null; nomePeca: string; codigo: string
  parecidas: Parecida[]; onAbrir: (c: string) => void; mostrar: (m: string) => void; onDeNovo: () => void; onVerPeca: () => void
}) {
  const seg = useContagem(acomp.reserva?.expira_em)
  const total = acomp.prazo_min * 60
  const urgente = seg < 180
  const pecaTxt = `#${codLive ?? codigo} — ${nomePeca}`
  const linkAcomp = `${location.origin}${BASE}/a/${token}`
  const wa = (texto: string) => linkWhatsApp(dados.whatsapp, texto)
  const s = acomp.situacao

  if (s === 'reservada') {
    const mm = String(Math.floor(seg / 60)).padStart(2, '0'), ss = String(seg % 60).padStart(2, '0')
    return (
      <div className="passo">
        <div className="relogio">
          <span>Peça reservada para você</span>
          <span className={`relogio-tempo${urgente ? ' urgente' : ''}`} aria-live="off">{mm}:{ss}</span>
          <div className="barra" aria-hidden="true"><div style={{ width: `${Math.max(0, Math.round((seg / Math.max(total, 1)) * 100))}%` }} className={urgente ? 'urgente' : ''} /></div>
          <span className="mudo pequeno centro">Depois desse prazo a peça passa para a próxima da fila.</span>
        </div>
        <FormEntrega token={token} pecaTxt={pecaTxt} dados={dados} linkAcomp={linkAcomp} mostrar={mostrar} />
      </div>
    )
  }
  if (s === 'fila' || s === 'processando') {
    return (
      <div className="passo">
        <div className="relogio">
          <span>{s === 'fila' ? 'Sua posição na fila' : 'Registrando seu pedido…'}</span>
          {s === 'fila' && <span className="relogio-tempo">{acomp.posicao ?? '—'}º</span>}
          {acomp.a_frente && <span className="mudo pequeno">À sua frente: {acomp.a_frente}</span>}
          <span className="mudo pequeno centro">Quando chegar sua vez, avisamos aqui e no WhatsApp. Você terá {acomp.prazo_min} minutos para pagar.</span>
        </div>
        <span className="mudo pequeno">Esta página se atualiza sozinha. Se a peça for vendida para quem está à frente, você recebe um aviso com opções parecidas.</span>
        {wa(`Oi! Entrei na fila da peça ${pecaTxt}. Acompanhamento: ${linkAcomp}`) &&
          <a className="cta wa" href={wa(`Oi! Entrei na fila da peça ${pecaTxt}. Acompanhamento: ${linkAcomp}`)!} target="_blank" rel="noopener noreferrer">Continuar no WhatsApp</a>}
        <button type="button" className="link" onClick={onVerPeca}>Ver a peça</button>
      </div>
    )
  }
  if (s === 'paga') {
    const etapas = [['Pagamento confirmado', 'Recebemos seu pagamento'], ['Separação da peça', 'Avisamos quando estiver embalada'], ['Postado', 'Você recebe o código de rastreio'], ['Em trânsito', 'Acompanhe por este mesmo link'], ['Entregue', 'Conte pra gente o que achou']]
    return (
      <div className="passo">
        <div className="pago">
          <span className="pago-ok" aria-hidden="true"><svg width="26" height="26"><path d="M5 13 L11 19 L21 7" fill="none" stroke="#1F5E3C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <h2>Pagamento confirmado</h2>
          <span className="mudo pequeno">Acompanhe por este mesmo link.</span>
        </div>
        <ol className="etapas">{etapas.map(([n, d], i) => <li key={n} className={i === 0 ? 'feita' : ''}><span aria-hidden="true" /><div><strong>{n}</strong><small>{d}</small></div></li>)}</ol>
      </div>
    )
  }
  const fim: Record<string, [string, string]> = {
    expirou: ['O prazo da reserva terminou', 'A peça passou para a próxima pessoa da fila. Se ela não pagar, a peça volta a ficar disponível e você pode tentar de novo.'],
    vendida_para_outra: ['Essa peça foi vendida', 'Quem estava à frente na fila confirmou o pagamento.'],
    indisponivel: ['Essa peça ficou indisponível', 'Ela saiu do estoque antes da sua vez.'],
    cancelada: ['Reserva cancelada', 'Se quiser, você pode entrar na fila de novo.'],
    saiu_da_fila: ['Você saiu da fila', 'Se quiser, você pode entrar de novo.'],
    nao_registrado: ['Não conseguimos registrar', 'Tente de novo ou fale com a loja pelo WhatsApp.'],
  }
  const [tit, txt] = fim[s] ?? ['Reserva encerrada', 'Veja outras peças da arara.']
  const avise = dados.regras.aviseme && wa(`Oi! Quero ser avisada quando chegar algo parecido com a peça ${pecaTxt}.`)
  return (
    <div className="passo">
      <div className="status vend"><strong>{tit}</strong><span>{txt}</span></div>
      {(s === 'expirou' || s === 'cancelada' || s === 'saiu_da_fila' || s === 'nao_registrado') && <button type="button" className="sec" onClick={onDeNovo}>Entrar na fila de novo</button>}
      <Parecidas lista={parecidas} onAbrir={onAbrir} titulo="Separamos parecidas para você" />
      {avise && <a className="sec" href={avise} target="_blank" rel="noopener noreferrer">Avise-me quando chegar algo parecido</a>}
    </div>
  )
}

const mascaraCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
const mascaraCep = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')

// Pix copia e cola + QR, ou botão do cartão (Apple Pay / Google Pay na página da Getnet). Sem gateway: não mostra nada.
function PagarGetnet({ token, forma }: { token: string; forma: 'pix' | 'cartao' }) {
  const [pg, setPg] = useState<Awaited<ReturnType<typeof apiPublica.pagamento>> | undefined>(undefined)
  const [copiado, setCopiado] = useState(false)
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { let vivo = true; setPg(undefined); apiPublica.pagamento(token, forma).then((r) => { if (vivo) setPg(r) }); return () => { vivo = false } }, [token, forma])
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t) }, [])
  const svg = useMemo(() => {
    if (!pg?.pix_copia_cola) return ''
    const q = qrcode(0, 'M'); q.addData(pg.pix_copia_cola, 'Byte'); q.make()
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  }, [pg?.pix_copia_cola])
  if (pg === undefined) return <span className="mudo pequeno centro">Preparando o pagamento…</span>
  if (pg === null) return null
  if (pg.link_url) return <a className="cta" href={pg.link_url} rel="noopener noreferrer">Pagar com cartão, Apple Pay ou Google Pay</a>
  if (!pg.pix_copia_cola) return null
  const resta = pg.pix_expira_em ? Math.max(0, Math.floor((new Date(pg.pix_expira_em).getTime() - agora) / 1000)) : null
  const copiar = async () => { try { await navigator.clipboard.writeText(pg.pix_copia_cola!); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sem permissão */ } }
  return (
    <div className="pix">
      <strong>Pix de {(pg.valor_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
      <button type="button" className="cta" onClick={copiar}>{copiado ? 'Código copiado ✓' : 'Copiar código Pix'}</button>
      <span className="mudo pequeno">Abra o app do seu banco, escolha Pix copia e cola e cole o código.</span>
      <div className="pix-qr" aria-label="QR code do Pix" dangerouslySetInnerHTML={{ __html: svg }} />
      {resta !== null && (resta > 0
        ? <span className="mudo pequeno">Este código vale por mais {Math.floor(resta / 60)}:{String(resta % 60).padStart(2, '0')}</span>
        : <button type="button" className="link" onClick={() => { setPg(undefined); apiPublica.pagamento(token, 'pix').then(setPg) }}>O código venceu. Gerar outro</button>)}
    </div>
  )
}

function FormEntrega({ token, pecaTxt, dados, linkAcomp, mostrar }: { token: string; pecaTxt: string; dados: DadosVitrine; linkAcomp: string; mostrar: (m: string) => void }) {
  const [ent, setEnt] = useState<Entrega | null>(null)
  const [modo, setModo] = useState<'escolher' | 'novo'>('novo')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [f, setF] = useState({ cpf: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', email: '', nomePagador: '' })
  const [forma, setForma] = useState<'pix' | 'cartao'>('pix')
  const [pedirNome, setPedirNome] = useState(false)
  const [cepMsg, setCepMsg] = useState<{ txt: string; ok: boolean } | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erro, setErro] = useState<string | null>(null); const [enviando, setEnviando] = useState(false)
  const [reconhecido, setReconhecido] = useState(false)
  const numRef = useRef<HTMLInputElement>(null)
  const nomeRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    apiPublica.entregaObter(token).then((e) => {
      setEnt(e)
      const lista = e.enderecos ?? []
      if (lista.length > 0) { setModo('escolher'); setEscolhido(lista[0].id) }
      if (e.forma) setForma(e.forma)
    }).catch(() => setEnt({ pode: true, nome: null, cpf_final: null, endereco: null }))
  }, [token])
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const enderecos = ent?.enderecos ?? []

  async function cep(v: string) {
    set('cep', mascaraCep(v)); setCepMsg(null)
    const so = v.replace(/\D/g, '')
    if (so.length !== 8) return
    setBuscandoCep(true)
    try {
      let r: { logradouro: string; bairro: string; municipio: string; uf: string } | null = null
      let oficial = false
      try {
        const o = await apiPublica.cep(token, so)
        if (o.encontrado === false) { setCepMsg({ txt: 'Esse CEP não existe nos Correios. Confira os números ou preencha o endereço à mão.', ok: false }); return }
        if (o.encontrado && o.oficial) { r = { logradouro: o.logradouro ?? '', bairro: o.bairro ?? '', municipio: o.municipio ?? '', uf: o.uf ?? '' }; oficial = true }
      } catch { /* segue com a busca direta */ }
      if (!r) r = await buscarCep(so)
      if (r) {
        setF((x) => ({ ...x, logradouro: r!.logradouro || x.logradouro, bairro: r!.bairro || x.bairro, municipio: r!.municipio || x.municipio, uf: r!.uf || x.uf }))
        setCepMsg({ txt: oficial ? 'Endereço encontrado na base dos Correios. Falta só o número.' : 'Endereço encontrado. Falta só o número (vamos conferir o CEP na base dos Correios).', ok: true })
        setTimeout(() => numRef.current?.focus(), 50)
      } else setCepMsg({ txt: 'Não achamos esse CEP agora. Preencha rua, cidade e UF.', ok: false })
    } finally { setBuscandoCep(false) }
  }

  async function salvar(usarEscolhido: boolean) {
    setEnviando(true); setErro(null)
    try {
      const base = { cpf: f.cpf, email: f.email, nomePagador: pedirNome ? f.nomePagador : undefined, forma }
      const r = await apiPublica.entregaSalvar(token, usarEscolhido && escolhido ? { ...base, enderecoId: escolhido } : { ...base, ...f })
      if (r.erro === 'nome_pagador') { setPedirNome(true); setErro(ERROS_ENTREGA.nome_pagador); setTimeout(() => nomeRef.current?.focus(), 50); return }
      if (r.erro) { setErro(ERROS_ENTREGA[r.erro] ?? 'Não foi possível salvar.'); return }
      setReconhecido(!!r.cpf_reconhecido); setPronto(true); mostrar('Dados recebidos.')
      apiPublica.entregaObter(token).then(setEnt).catch(() => undefined)
    } catch (x) { setErro((x as Error).message) } finally { setEnviando(false) }
  }
  const pagar = linkWhatsApp(dados.whatsapp, `Oi! Reservei a peça ${pecaTxt} e escolhi pagar com ${forma === 'pix' ? 'Pix' : 'cartão'}. Pode me enviar o link? Acompanhamento: ${linkAcomp}`)

  if (pronto) {
    return (
      <div className="form">
        <div className="caixa">
          <strong>Tudo certo com a entrega</strong>
          {reconhecido && <span className="mudo pequeno">CPF reconhecido: a nota sai no nome do titular do CPF.</span>}
          <span className="mudo pequeno">Pagamento: {forma === 'pix' ? 'Pix (aprovação na hora)' : 'cartão de crédito'}. O frete é calculado pelo CEP.</span>
        </div>
        <PagarGetnet token={token} forma={forma} />
        {ent?.pagar_url
          ? <a className="cta" href={ent.pagar_url} target="_blank" rel="noopener noreferrer">{forma === 'pix' ? 'Pagar com Pix' : 'Pagar com cartão'}</a>
          : pagar
            ? <a className="cta wa" href={pagar} target="_blank" rel="noopener noreferrer">Receber o link de pagamento no WhatsApp</a>
            : <div className="caixa"><span>A loja vai te enviar o link de pagamento pelo WhatsApp em instantes.</span></div>}
        <span className="mudo pequeno centro">Pague dentro do prazo para garantir a peça. A confirmação chega sozinha.</span>
        <button type="button" className="link" onClick={() => setPronto(false)}>Corrigir dados</button>
      </div>
    )
  }

  const blocoCpf = (
    <>
      <Campo rotulo={ent?.cpf_final ? `CPF para a nota (já temos o final ${ent.cpf_final}; deixe em branco para manter)` : 'CPF para a nota fiscal'}>
        <input value={f.cpf} onChange={(e) => set('cpf', mascaraCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" autoComplete="off" name="cpf" enterKeyHint="next" />
      </Campo>
      {!pedirNome
        ? <button type="button" className="link pequeno esq" onClick={() => setPedirNome(true)}>Vai pagar com o CPF de outra pessoa?</button>
        : <Campo rotulo="Nome completo de quem vai pagar (como no CPF)">
            <input ref={nomeRef} value={f.nomePagador} onChange={(e) => set('nomePagador', e.target.value)} autoComplete="name" name="name" autoCapitalize="words" maxLength={120} enterKeyHint="next" />
          </Campo>}
    </>
  )
  const blocoForma = (
    <div className="formas" role="radiogroup" aria-label="Como prefere pagar">
      <button type="button" role="radio" aria-checked={forma === 'pix'} className={forma === 'pix' ? 'forma sel' : 'forma'} onClick={() => setForma('pix')}>
        <strong>Pix</strong><small>Aprovação na hora. Copia e cola ou QR Code.</small>
      </button>
      <button type="button" role="radio" aria-checked={forma === 'cartao'} className={forma === 'cartao' ? 'forma sel' : 'forma'} onClick={() => setForma('cartao')}>
        <strong>Cartão de crédito</strong><small>Na página segura de pagamento; o cartão salvo no celular aparece lá quando disponível.</small>
      </button>
    </div>
  )

  return (
    <div className="form">
      <h3>{ent?.nome ? `${ent.nome}, para onde enviamos?` : 'Para onde enviamos?'}</h3>
      {modo === 'escolher' && enderecos.length > 0 ? (
        <form className="form" onSubmit={(e) => { e.preventDefault(); void salvar(true) }} noValidate>
          <div className="enderecos" role="radiogroup" aria-label="Endereços usados antes">
            {enderecos.map((e) => (
              <button type="button" key={e.id} role="radio" aria-checked={escolhido === e.id} className={escolhido === e.id ? 'end-op sel' : 'end-op'} onClick={() => setEscolhido(e.id)}>
                <strong>{e.apelido ?? (e.principal ? 'Último endereço usado' : 'Endereço usado antes')}</strong>
                <span>{e.resumo}</span>
                <small className="mudo">CEP •••••-{e.cep_final}{e.oficial ? ' · conferido nos Correios' : ''}</small>
              </button>
            ))}
          </div>
          <span className="mudo pequeno">Por segurança mostramos parte do número e do CEP.</span>
          {!ent?.cpf_final && blocoCpf}
          {ent?.cpf_final && pedirNome && blocoCpf}
          {ent?.cpf_final && !pedirNome && <button type="button" className="link pequeno esq" onClick={() => setPedirNome(true)}>Vai pagar com o CPF de outra pessoa?</button>}
          {blocoForma}
          {erro && <p className="erro-campo" role="alert">{erro}</p>}
          <button type="submit" className="cta" disabled={enviando || !escolhido}>{enviando ? 'Salvando…' : 'Entregar aqui'}</button>
          <button type="button" className="link" onClick={() => { setModo('novo'); setErro(null) }}>Entregar em outro endereço</button>
        </form>
      ) : (
        <form className="form" onSubmit={(e) => { e.preventDefault(); void salvar(false) }} noValidate autoComplete="on">
          <div className="duas">
            <Campo rotulo="CEP">
              <input value={f.cep} onChange={(e) => void cep(e.target.value)} inputMode="numeric" autoComplete="postal-code" name="postal-code" placeholder="00000-000" enterKeyHint="next" autoFocus={enderecos.length === 0} />
            </Campo>
            <Campo rotulo="Número"><input ref={numRef} value={f.numero} onChange={(e) => set('numero', e.target.value)} inputMode="text" placeholder="Nº ou S/N" maxLength={20} name="numero" enterKeyHint="next" /></Campo>
          </div>
          {buscandoCep && <span className="mudo pequeno">Buscando o CEP…</span>}
          {cepMsg && <span className={cepMsg.ok ? 'ok-campo' : 'erro-campo'}>{cepMsg.txt}</span>}
          <a className="link pequeno esq" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer">Não sei meu CEP</a>
          <Campo rotulo="Rua"><input value={f.logradouro} onChange={(e) => set('logradouro', e.target.value)} autoComplete="address-line1" name="address-line1" maxLength={120} /></Campo>
          <Campo rotulo="Complemento"><input value={f.complemento} onChange={(e) => set('complemento', e.target.value)} autoComplete="address-line2" name="address-line2" placeholder="Apto, bloco, referência (opcional)" maxLength={120} /></Campo>
          <Campo rotulo="Bairro"><input value={f.bairro} onChange={(e) => set('bairro', e.target.value)} autoComplete="address-level3" name="address-level3" maxLength={120} /></Campo>
          <div className="duas">
            <Campo rotulo="Cidade"><input value={f.municipio} onChange={(e) => set('municipio', e.target.value)} autoComplete="address-level2" name="address-level2" maxLength={120} /></Campo>
            <Campo rotulo="UF"><input value={f.uf} onChange={(e) => set('uf', e.target.value.toUpperCase().slice(0, 2))} autoComplete="address-level1" name="address-level1" maxLength={2} autoCapitalize="characters" /></Campo>
          </div>
          {blocoCpf}
          <Campo rotulo="E-mail para a nota (opcional)"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} inputMode="email" autoComplete="email" name="email" maxLength={120} /></Campo>
          {blocoForma}
          {erro && <p className="erro-campo" role="alert">{erro}</p>}
          <button type="submit" className="cta" disabled={enviando}>{enviando ? 'Salvando…' : 'Confirmar entrega'}</button>
          {enderecos.length > 0 && <button type="button" className="link" onClick={() => { setModo('escolher'); setErro(null) }}>Usar um endereço salvo</button>}
        </form>
      )}
    </div>
  )
}
