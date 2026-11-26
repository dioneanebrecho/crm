import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useEstadoTela } from '../abas'
import type { Contexto } from '../App'
import {
  apiFluxo, AREAS, AREA_IDS, comparar, FASES, SITUACAO, TIPO_COM, TIPO_REV,
  type Comentario, type Diferenca, type Etapa, type Fluxo as Dados, type Revisao, type Situacao, type TipoComentario,
} from '../apiFluxo'
import { Abas, Busca, Campo, Formulario, Modal, Titulo, Vazio, useCarregar } from '../ui'
import './fluxo.css'

// Fluxo do processo (pedido 050): mapa das etapas da operação em raias por área, visão por papel (vários papéis por pessoa),
// comentários por etapa e revisões. Ler e comentar com nível "ver"; alterar etapas, anotar e restaurar revisões com "editar".
type Aba = 'mapa' | 'pessoa' | 'revisoes'
const cor = (c: string) => ({ '--fx-c': c }) as CSSProperties
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const texto = (e: Etapa) => [e.titulo, e.tela, e.entrada, e.entrega, e.impacto, e.regras, ...e.procedimento].join(' ').toLowerCase()

export default function Fluxo({ ctx }: { ctx: Contexto }) {
  const [versao, setVersao] = useState(0)
  const d = useCarregar(() => apiFluxo.obter(ctx.empresa), [ctx.empresa, versao])
  const atualizar = () => setVersao((v) => v + 1)
  const [aba, setAba] = useEstadoTela<Aba>('fluxo.aba', 'mapa')
  const [papeis, setPapeis] = useEstadoTela<string[]>('fluxo.papeis', [])
  const [busca, setBusca] = useState('')
  const [sit, setSit] = useState<Situacao | ''>('')
  const [inativas, setInativas] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [editar, setEditar] = useState<Partial<Etapa> | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const f = d.dados
  const ativas = useMemo(() => (f?.etapas ?? []).filter((e) => e.ativa), [f])
  if (d.erro && !f) return <section><Titulo>Fluxo do processo</Titulo><div className="erro" role="alert">{d.erro}</div></section>
  if (!f) return <section><Titulo>Fluxo do processo</Titulo><p className="sub">Carregando…</p></section>

  const pode = f.nivel === 'editar'
  const nome = (c: string) => f.funcoes.find((x) => x.codigo === c)?.nome ?? c
  const lista = inativas && pode ? f.etapas : ativas
  const q = busca.trim().toLowerCase()
  const casa = (e: Etapa) => (!sit || e.situacao === sit) && (!q || texto(e).includes(q) || nome(e.responsavel).toLowerCase().includes(q))
  const abertos = (c: string) => f.comentarios.filter((x) => x.etapa === c && !x.resolvido).length
  const totalAbertos = f.comentarios.filter((x) => !x.resolvido).length
  const etapa = aberta ? f.etapas.find((e) => e.codigo === aberta) ?? null : null

  return (
    <section className="fx">
      <div className="topo">
        <div>
          <Titulo ajuda={<>Etapas da operação em ordem, por área e por papel. Clique numa etapa para ver o procedimento, o impacto de errar e comentar.</>}>Fluxo do processo</Titulo>
          <p className="sub">Revisão {f.versao ?? '1.0'} · {ativas.length} etapas · {pode ? 'você pode editar' : 'leitura e comentários'}</p>
        </div>
        {pode && <button onClick={() => setEditar({ ordem: ativas.length + 1, fase: 1, area: 'compras', responsavel: f.funcoes[0]?.codigo, apoio: [], procedimento: [], situacao: 'plan', ativa: true })}>Nova etapa</button>}
      </div>
      {aviso && <div className="info" role="status">{aviso}</div>}
      <Abas<Aba> ativa={aba} onMudar={setAba} abas={[
        { id: 'mapa', rotulo: 'Processo completo' },
        { id: 'pessoa', rotulo: 'Por pessoa' },
        { id: 'revisoes', rotulo: 'Revisões e comentários', contagem: totalAbertos || undefined },
      ]} />

      {aba === 'mapa' && <>
        <div className="fx-filtros">
          <Busca valor={busca} onMudar={setBusca} placeholder="Buscar etapa, tela ou regra" />
          <div className="fx-chips">
            {(['', 'uso', 'impl', 'plan', 'man'] as const).map((s) => (
              <button key={s} type="button" className={`fx-chip${sit === s ? ' on' : ''}`} aria-pressed={sit === s} onClick={() => setSit(s)}>
                {s ? <><i className={`fx-st fx-st-${s}`} />{SITUACAO[s]}</> : 'Todas'}
              </button>))}
          </div>
          {pode && <label className="fx-check"><input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} /> Mostrar inativas</label>}
        </div>
        <Mapa etapas={lista} nome={nome} casa={casa} abertos={abertos} onAbrir={setAberta} />
      </>}

      {aba === 'pessoa' && <PorPessoa f={f} ativas={ativas} papeis={papeis} setPapeis={setPapeis} nome={nome} abertos={abertos} onAbrir={setAberta} />}

      {aba === 'revisoes' && <Revisoes f={f} empresa={ctx.empresa} pode={pode} onAbrir={setAberta} atualizar={atualizar} setAviso={setAviso} />}

      {etapa && <Detalhe f={f} etapa={etapa} ativas={ativas} empresa={ctx.empresa} pode={pode} nome={nome}
        onFechar={() => setAberta(null)} onAbrir={setAberta} onEditar={() => setEditar(etapa)} atualizar={atualizar} />}

      {editar && <Editor f={f} etapa={editar} total={ativas.length} onFechar={() => setEditar(null)} onSalvar={async (e, desc) => {
        const r = await apiFluxo.salvar(ctx.empresa, e, desc)
        setEditar(null); setAviso(`Revisão ${r.versao} registrada (${r.codigo}).`); setAberta(r.codigo); atualizar()
      }} />}
    </section>
  )
}

/* ---------- mapa em raias ---------- */
function Mapa({ etapas, nome, casa, abertos, onAbrir }: {
  etapas: Etapa[]; nome: (c: string) => string; casa: (e: Etapa) => boolean; abertos: (c: string) => number; onAbrir: (c: string) => void
}) {
  if (!etapas.length) return <Vazio titulo="Sem etapas" texto="Nenhuma etapa cadastrada." />
  return (
    <div className="fx-mapa">
      <div className="fx-raias fx-raias-topo" aria-hidden="true">
        <span />{AREA_IDS.map((a) => <span key={a} style={cor(AREAS[a].cor)}>{AREAS[a].nome}</span>)}
      </div>
      {FASES.map((fs) => {
        const l = etapas.filter((e) => e.fase === fs.n)
        return l.length ? <Fase key={fs.n} n={fs.n} nomeFase={fs.nome} textoFase={fs.texto} lista={l} nome={nome} casa={casa} abertos={abertos} onAbrir={onAbrir} /> : null
      })}
    </div>
  )
}

function Fase({ n, nomeFase, textoFase, lista, nome, casa, abertos, onAbrir }: {
  n: number; nomeFase: string; textoFase: string; lista: Etapa[]; nome: (c: string) => string; casa: (e: Etapa) => boolean
  abertos: (c: string) => number; onAbrir: (c: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [linhas, setLinhas] = useState<{ d: string; c: string }[]>([])
  const [caixa, setCaixa] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const desenhar = () => {
      const b = el.getBoundingClientRect()
      const cs = [...el.querySelectorAll<HTMLElement>('.fx-card')].map((c) => {
        const r = c.getBoundingClientRect()
        return { x: r.left - b.left + Math.min(r.width / 2, 26), t: r.top - b.top, b: r.bottom - b.top, c: c.dataset.cor ?? '#888' }
      })
      const out: { d: string; c: string }[] = []
      for (let i = 0; i < cs.length - 1; i++) {
        const a = cs[i], z = cs[i + 1], m = (a.b + z.t) / 2
        out.push({ d: `M${a.x} ${a.b}V${m}H${z.x}V${z.t - 5}`, c: z.c }, { d: `M${z.x - 5} ${z.t - 8}L${z.x} ${z.t - 1}L${z.x + 5} ${z.t - 8}`, c: z.c })
      }
      setCaixa({ w: b.width, h: b.height }); setLinhas(out)
    }
    desenhar()
    const obs = new ResizeObserver(desenhar)
    obs.observe(el)
    return () => obs.disconnect()
  }, [lista])
  return (
    <div className="fx-fase">
      <header><span className="fx-fn">Fase {n}</span><h3>{nomeFase}</h3><p>{textoFase}</p></header>
      <div className="fx-pista" ref={ref}>
        <div className="fx-raias fx-fundo" aria-hidden="true"><span />{AREA_IDS.map((a) => <span key={a} style={cor(AREAS[a].cor)} />)}</div>
        <svg className="fx-linhas" viewBox={`0 0 ${caixa.w || 1} ${caixa.h || 1}`} aria-hidden="true">
          {linhas.map((l, i) => <path key={i} d={l.d} stroke={l.c} />)}
        </svg>
        {lista.map((e) => {
          const c = abertos(e.codigo)
          return (
            <div className="fx-raias fx-linha" key={e.codigo}>
              <span className="fx-num">{e.ordem}</span>
              <button type="button" className={`fx-card${casa(e) ? '' : ' apagado'}${e.ativa ? '' : ' inativa'}`} data-cor={AREAS[e.area].cor}
                style={{ ...cor(AREAS[e.area].cor), gridColumn: AREA_IDS.indexOf(e.area) + 2 }} onClick={() => onAbrir(e.codigo)}>
                <span className="fx-area">{AREAS[e.area].nome}</span>
                <b>{e.titulo}</b>
                <small>{nome(e.responsavel)}{e.apoio.length ? ` + ${e.apoio.map(nome).join(', ')}` : ''}</small>
                <span className="fx-sit"><i className={`fx-st fx-st-${e.situacao}`} />{e.ativa ? SITUACAO[e.situacao] : 'Inativa'}</span>
                {c > 0 && <span className="fx-cc" title="Comentários abertos">{c}</span>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- detalhe da etapa ---------- */
function Detalhe({ f, etapa: e, ativas, empresa, pode, nome, onFechar, onAbrir, onEditar, atualizar }: {
  f: Dados; etapa: Etapa; ativas: Etapa[]; empresa: string; pode: boolean; nome: (c: string) => string
  onFechar: () => void; onAbrir: (c: string) => void; onEditar: () => void; atualizar: () => void
}) {
  useEffect(() => {
    const h = (ev: KeyboardEvent) => ev.key === 'Escape' && onFechar()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onFechar])
  const i = ativas.findIndex((x) => x.codigo === e.codigo)
  const ant = i > 0 ? ativas[i - 1] : null, prox = i >= 0 && i < ativas.length - 1 ? ativas[i + 1] : null
  const coms = f.comentarios.filter((c) => c.etapa === e.codigo)
  const fase = FASES.find((x) => x.n === e.fase)
  return (
    <div className="overlay fx-overlay" onMouseDown={(ev) => ev.target === ev.currentTarget && onFechar()}>
      <aside className="fx-gaveta" style={cor(AREAS[e.area].cor)} role="dialog" aria-modal="true" aria-label={e.titulo}>
        <div className="fx-gaveta-topo">
          <div><p className="sub">Etapa {e.ordem} · {e.codigo} · Fase {e.fase}: {fase?.nome}</p><h2>{e.titulo}</h2></div>
          <div className="acoes">{pode && <button className="sec" onClick={onEditar}>Editar</button>}<button className="icone" onClick={onFechar} aria-label="Fechar">×</button></div>
        </div>
        <dl className="fx-kv">
          <dt>Área</dt><dd className="fx-cor">{AREAS[e.area].nome}</dd>
          <dt>Situação</dt><dd><i className={`fx-st fx-st-${e.situacao}`} /> {e.ativa ? SITUACAO[e.situacao] : 'Inativa'}</dd>
          <dt>Quem faz</dt><dd><span className="fx-pap r">{nome(e.responsavel)}</span>{e.apoio.map((a) => <span key={a} className="fx-pap">{nome(a)} (apoio)</span>)}</dd>
          <dt>Tela</dt><dd>{e.tela || '—'}</dd>
          <dt>Começa com</dt><dd>{e.entrada || '—'}</dd>
          <dt>Entrega</dt><dd>{e.entrega || '—'}</dd>
        </dl>
        <h3>Procedimento</h3>
        <ol className="fx-proc">{e.procedimento.map((p, k) => <li key={k}>{p}</li>)}</ol>
        {e.impacto && <div className="fx-caixa imp"><strong>Impacto se falhar:</strong> {e.impacto}</div>}
        {e.regras && <div className="fx-caixa reg"><strong>Regras e bloqueios:</strong> {e.regras}</div>}
        <div className="fx-vizinhas">
          {ant ? <button className="sec" onClick={() => onAbrir(ant.codigo)}><small>← Anterior ({nome(ant.responsavel)})</small>{ant.ordem}. {ant.titulo}</button> : <span />}
          {prox && <button className="sec" onClick={() => onAbrir(prox.codigo)}><small>Próxima → ({nome(prox.responsavel)})</small>{prox.ordem}. {prox.titulo}</button>}
        </div>
        <h3>Comentários ({coms.length})</h3>
        {coms.length ? coms.map((c) => <ItemComentario key={c.id} c={c} empresa={empresa} pode={pode} atualizar={atualizar} />) : <p className="sub">Sem comentários nesta etapa.</p>}
        <NovoComentario empresa={empresa} etapa={e.codigo} atualizar={atualizar} />
      </aside>
    </div>
  )
}

function ItemComentario({ c, empresa, pode, atualizar, etapa, onAbrir }: {
  c: Comentario; empresa: string; pode: boolean; atualizar: () => void; etapa?: Etapa; onAbrir?: (c: string) => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const alternar = async () => { setErro(null); try { await apiFluxo.resolver(empresa, c.id, !c.resolvido); atualizar() } catch (e) { setErro((e as Error).message) } }
  return (
    <div className={`fx-com${c.resolvido ? ' ok' : ''}`}>
      <header>
        <span className={`fx-tag ${c.tipo}`}>{TIPO_COM[c.tipo]}</span>
        {etapa && onAbrir && <button className="fx-link" onClick={() => onAbrir(etapa.codigo)}>{etapa.ordem}. {etapa.titulo}</button>}
        <strong>{c.autor}</strong><span>{quando(c.criado_em)}</span>
      </header>
      <p>{c.texto}</p>
      <div className="fx-com-pe">
        {(pode || c.meu) && <button className="fx-link" onClick={alternar}>{c.resolvido ? 'Reabrir' : 'Marcar como resolvido'}</button>}
        {c.resolvido && <span className="sub">resolvido por {c.resolvido_por ?? '—'}{c.resolvido_em ? ` em ${quando(c.resolvido_em)}` : ''}</span>}
      </div>
      {erro && <div className="erro" role="alert">{erro}</div>}
    </div>
  )
}

function NovoComentario({ empresa, etapa, atualizar }: { empresa: string; etapa: string; atualizar: () => void }) {
  const [tipo, setTipo] = useState<TipoComentario>('comentario')
  const [txt, setTxt] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    if (!txt.trim()) return
    setEnviando(true); setMsg(null)
    try { await apiFluxo.comentar(empresa, etapa, tipo, txt); setTxt(''); setMsg('Comentário enviado.'); atualizar() }
    catch (e) { setMsg((e as Error).message) } finally { setEnviando(false) }
  }
  return (
    <form className="form fx-novo" onSubmit={enviar}>
      <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoComentario)} aria-label="Tipo">
        {(Object.keys(TIPO_COM) as TipoComentario[]).map((t) => <option key={t} value={t}>{TIPO_COM[t]}</option>)}
      </select>
      <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={3} maxLength={4000} placeholder="O que precisa mudar, o que não ficou claro ou o que acontece na prática. Não cole CPF, telefone ou e-mail." aria-label="Comentário" />
      <div className="acoes"><button type="submit" disabled={enviando || !txt.trim()}>{enviando ? 'Enviando…' : 'Enviar comentário'}</button></div>
      {msg && <p className="sub" role="status">{msg}</p>}
    </form>
  )
}

/* ---------- editar / incluir etapa ---------- */
function Editor({ f, etapa, total, onFechar, onSalvar }: {
  f: Dados; etapa: Partial<Etapa>; total: number; onFechar: () => void; onSalvar: (e: Partial<Etapa>, desc: string) => Promise<void>
}) {
  const nova = !etapa.codigo
  const [e, setE] = useState<Partial<Etapa>>(etapa)
  const [proc, setProc] = useState((etapa.procedimento ?? []).join('\n'))
  const [desc, setDesc] = useState('')
  const set = <K extends keyof Etapa>(k: K, v: Etapa[K]) => setE((x) => ({ ...x, [k]: v }))
  const alternarApoio = (c: string) => set('apoio', (e.apoio ?? []).includes(c) ? (e.apoio ?? []).filter((x) => x !== c) : [...(e.apoio ?? []), c])
  return (
    <Modal titulo={nova ? 'Nova etapa' : `Editar etapa ${etapa.codigo}`} onFechar={onFechar} larga>
      <Formulario enviarRotulo={nova ? 'Incluir e registrar revisão' : 'Salvar e registrar revisão'} onCancelar={onFechar}
        onEnviar={() => onSalvar({ ...e, procedimento: proc.split('\n').map((x) => x.trim()).filter(Boolean) }, desc)}>
        <Campo rotulo="Título"><input value={e.titulo ?? ''} onChange={(ev) => set('titulo', ev.target.value)} required maxLength={120} /></Campo>
        <div className="fx-grade3">
          <Campo rotulo="Posição" dica={`1 a ${nova ? total + 1 : total}`}><input type="number" min={1} max={nova ? total + 1 : total} value={e.ordem ?? 1} onChange={(ev) => set('ordem', Number(ev.target.value))} /></Campo>
          <Campo rotulo="Fase"><select value={e.fase} onChange={(ev) => set('fase', Number(ev.target.value))}>{FASES.map((x) => <option key={x.n} value={x.n}>{x.n}. {x.nome}</option>)}</select></Campo>
          <Campo rotulo="Área"><select value={e.area} onChange={(ev) => set('area', ev.target.value as Etapa['area'])}>{AREA_IDS.map((a) => <option key={a} value={a}>{AREAS[a].nome}</option>)}</select></Campo>
          <Campo rotulo="Responsável"><select value={e.responsavel} onChange={(ev) => set('responsavel', ev.target.value)}>{f.funcoes.map((x) => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}</select></Campo>
          <Campo rotulo="Situação"><select value={e.situacao} onChange={(ev) => set('situacao', ev.target.value as Situacao)}>{(Object.keys(SITUACAO) as Situacao[]).map((s) => <option key={s} value={s}>{SITUACAO[s]}</option>)}</select></Campo>
          {!nova && <Campo rotulo="Ativa"><label className="fx-check"><input type="checkbox" checked={e.ativa ?? true} onChange={(ev) => set('ativa', ev.target.checked)} /> Etapa em uso no fluxo</label></Campo>}
        </div>
        <Campo rotulo="Apoio"><div className="fx-chips">{f.funcoes.filter((x) => x.codigo !== e.responsavel).map((x) => (
          <button type="button" key={x.codigo} className={`fx-chip${(e.apoio ?? []).includes(x.codigo) ? ' on' : ''}`} aria-pressed={(e.apoio ?? []).includes(x.codigo)} onClick={() => alternarApoio(x.codigo)}>{x.nome}</button>))}</div></Campo>
        <Campo rotulo="Tela do painel"><input value={e.tela ?? ''} onChange={(ev) => set('tela', ev.target.value)} /></Campo>
        <Campo rotulo="Começa com"><input value={e.entrada ?? ''} onChange={(ev) => set('entrada', ev.target.value)} /></Campo>
        <Campo rotulo="Procedimento" dica="Um passo por linha"><textarea rows={6} value={proc} onChange={(ev) => setProc(ev.target.value)} required /></Campo>
        <Campo rotulo="Entrega"><input value={e.entrega ?? ''} onChange={(ev) => set('entrega', ev.target.value)} /></Campo>
        <Campo rotulo="Impacto se falhar"><textarea rows={2} value={e.impacto ?? ''} onChange={(ev) => set('impacto', ev.target.value)} /></Campo>
        <Campo rotulo="Regras e bloqueios"><textarea rows={2} value={e.regras ?? ''} onChange={(ev) => set('regras', ev.target.value)} /></Campo>
        <Campo rotulo="O que mudou e por quê" dica="Vai para o histórico de revisões"><textarea rows={2} value={desc} onChange={(ev) => setDesc(ev.target.value)} required minLength={3} /></Campo>
      </Formulario>
    </Modal>
  )
}

/* ---------- por pessoa (vários papéis) ---------- */
function PorPessoa({ f, ativas, papeis, setPapeis, nome, abertos, onAbrir }: {
  f: Dados; ativas: Etapa[]; papeis: string[]; setPapeis: (p: string[]) => void; nome: (c: string) => string
  abertos: (c: string) => number; onAbrir: (c: string) => void
}) {
  const sel = papeis.filter((p) => f.funcoes.some((x) => x.codigo === p))
  const minhas = ativas.filter((e) => sel.includes(e.responsavel) || e.apoio.some((a) => sel.includes(a)))
  const [copiado, setCopiado] = useState('')
  const alternar = (c: string) => setPapeis(sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c])
  const papelNa = (e: Etapa) => sel.includes(e.responsavel) ? `Você executa como ${nome(e.responsavel)}`
    : `Você apoia como ${e.apoio.filter((a) => sel.includes(a)).map(nome).join(' e ')} (${nome(e.responsavel)} executa)`
  const quem = (e?: Etapa) => !e ? '' : sel.includes(e.responsavel) ? 'você' : nome(e.responsavel)
  function copiar() {
    const t = `${sel.map(nome).join(' + ')} · etapas do processo\n\n` + minhas.map((e) =>
      `${e.ordem}. ${e.titulo} [${sel.includes(e.responsavel) ? 'executa' : 'apoia'}]\n   Tela: ${e.tela}\n` + e.procedimento.map((p) => `   [ ] ${p}`).join('\n')).join('\n\n')
    navigator.clipboard.writeText(t).then(() => setCopiado('Copiado'), () => setCopiado('Não foi possível copiar'))
    setTimeout(() => setCopiado(''), 2500)
  }
  return (
    <div className="fx-pessoa">
      <p className="sub">Uma pessoa pode acumular papéis: marque todos os que ela exerce para ver a sequência combinada.</p>
      <div className="fx-chips fx-papeis">
        {f.funcoes.map((x) => {
          const n = ativas.filter((e) => e.responsavel === x.codigo || e.apoio.includes(x.codigo)).length
          return <button type="button" key={x.codigo} className={`fx-chip${sel.includes(x.codigo) ? ' on' : ''}`} aria-pressed={sel.includes(x.codigo)} onClick={() => alternar(x.codigo)} title={x.descricao}>{x.nome} <small>{n}</small></button>
        })}
        {sel.length > 0 && <button type="button" className="fx-link" onClick={() => setPapeis([])}>Limpar</button>}
      </div>
      {!sel.length ? <Vazio titulo="Escolha os papéis" texto="Marque um ou mais papéis para ver as etapas de quem os exerce, na ordem do processo." /> : <>
        <div className="fx-pessoa-topo">
          <div>
            <h3>{sel.map(nome).join(' + ')}</h3>
            {sel.map((p) => <p key={p} className="sub"><strong>{nome(p)}:</strong> {f.funcoes.find((x) => x.codigo === p)?.descricao}</p>)}
            <p className="sub">{minhas.length} etapas · {minhas.filter((e) => sel.includes(e.responsavel)).length} executa · {minhas.filter((e) => !sel.includes(e.responsavel)).length} apoia</p>
          </div>
          <button className="sec" onClick={copiar} disabled={!minhas.length}>{copiado || 'Copiar checklist'}</button>
        </div>
        <ol className="fx-lista">
          {minhas.map((e) => {
            const i = ativas.indexOf(e), ant = ativas[i - 1], prox = ativas[i + 1], c = abertos(e.codigo)
            return (
              <li key={e.codigo} style={cor(AREAS[e.area].cor)}>
                <span className="fx-num">{e.ordem}</span>
                <div>
                  <h4>{e.titulo}</h4>
                  <div className="fx-meta"><strong>{papelNa(e)}</strong><span>{AREAS[e.area].nome}</span><span><i className={`fx-st fx-st-${e.situacao}`} /> {SITUACAO[e.situacao]}</span>{c > 0 && <span>{c} comentário(s) aberto(s)</span>}</div>
                  <div className="fx-maos">
                    <div><small>Recebe de</small>{ant ? `${ant.ordem}. ${ant.titulo} (${quem(ant)})` : 'Início do ciclo'}</div>
                    <div><small>Tela</small>{e.tela || '—'}</div>
                    <div><small>Entrega para</small>{prox ? `${prox.ordem}. ${prox.titulo} (${quem(prox)})` : 'Etapa 1 do próximo ciclo'}</div>
                  </div>
                  <details><summary>Procedimento e impacto</summary>
                    <ol className="fx-proc">{e.procedimento.map((p, k) => <li key={k}>{p}</li>)}</ol>
                    {e.impacto && <div className="fx-caixa imp"><strong>Se falhar:</strong> {e.impacto}</div>}
                    {e.regras && <div className="fx-caixa reg"><strong>Regra:</strong> {e.regras}</div>}
                  </details>
                  <button className="fx-link" onClick={() => onAbrir(e.codigo)}>Abrir etapa e comentar</button>
                </div>
              </li>
            )
          })}
        </ol>
      </>}
    </div>
  )
}

/* ---------- revisões e comentários ---------- */
function Revisoes({ f, empresa, pode, onAbrir, atualizar, setAviso }: {
  f: Dados; empresa: string; pode: boolean; onAbrir: (c: string) => void; atualizar: () => void; setAviso: (s: string | null) => void
}) {
  const [filtro, setFiltro] = useState<'abertos' | 'resolvidos' | 'todos'>('abertos')
  const [comp, setComp] = useState<{ id: string; dif: Diferenca[] | null; erro?: string } | null>(null)
  const [restaurar, setRestaurar] = useState<Revisao | null>(null)
  const [anotar, setAnotar] = useState(false)
  const porCodigo = new Map(f.etapas.map((e) => [e.codigo, e]))
  const coms = f.comentarios.filter((c) => filtro === 'todos' || (filtro === 'abertos' ? !c.resolvido : c.resolvido))
  async function comparar_(r: Revisao) {
    if (comp?.id === r.id) { setComp(null); return }
    setComp({ id: r.id, dif: null })
    try { setComp({ id: r.id, dif: comparar(await apiFluxo.copia(empresa, r.id), f.etapas) }) }
    catch (e) { setComp({ id: r.id, dif: [], erro: (e as Error).message }) }
  }
  return (
    <div className="fx-rev">
      <div>
        <div className="fx-rev-topo"><h3>Histórico de revisões</h3>{pode && <button className="sec" onClick={() => setAnotar(true)}>Registrar anotação</button>}</div>
        <p className="sub">Toda alteração de etapa gera uma versão com a cópia completa do fluxo. Compare com a atual ou restaure uma versão anterior.</p>
        {f.revisoes.map((r, k) => (
          <article key={r.id} className="fx-revisao">
            <header><strong>Revisão {r.versao}</strong><span>{TIPO_REV[r.tipo]} · {quando(r.criado_em)} · {r.autor}</span></header>
            <p>{r.descricao}</p>
            {r.etapas.length > 0 && <div className="fx-chips">{r.etapas.map((c) => <button key={c} className="fx-link" onClick={() => onAbrir(c)}>{c}{porCodigo.get(c) ? ` · ${porCodigo.get(c)!.titulo}` : ''}</button>)}</div>}
            {k > 0 && <div className="acoes fx-esq">
              <button className="fx-link" onClick={() => comparar_(r)}>{comp?.id === r.id ? 'Fechar comparação' : 'Comparar com a atual'}</button>
              {pode && <button className="fx-link" onClick={() => setRestaurar(r)}>Restaurar esta versão</button>}
            </div>}
            {comp?.id === r.id && (comp.erro ? <div className="erro">{comp.erro}</div> : !comp.dif ? <p className="sub">Carregando…</p>
              : !comp.dif.length ? <p className="sub">Sem diferenças nas etapas.</p>
              : <ul className="fx-dif">{comp.dif.map((x) => <li key={x.codigo}><button className="fx-link" onClick={() => onAbrir(x.codigo)}>{x.codigo} · {x.titulo}</button> {x.tipo === 'nova' ? 'incluída depois' : x.tipo === 'removida' ? 'não existe mais' : `mudou: ${x.campos.join(', ')}`}</li>)}</ul>)}
          </article>
        ))}
      </div>
      <div>
        <h3>Comentários da equipe</h3>
        <div className="fx-chips">{(['abertos', 'resolvidos', 'todos'] as const).map((x) => <button key={x} type="button" className={`fx-chip${filtro === x ? ' on' : ''}`} aria-pressed={filtro === x} onClick={() => setFiltro(x)}>{x === 'abertos' ? 'Abertos' : x === 'resolvidos' ? 'Resolvidos' : 'Todos'}</button>)}</div>
        {coms.length ? coms.map((c) => <ItemComentario key={c.id} c={c} empresa={empresa} pode={pode} atualizar={atualizar} etapa={porCodigo.get(c.etapa)} onAbrir={onAbrir} />)
          : <Vazio titulo="Nenhum comentário" texto="Abra uma etapa no mapa para comentar." />}
      </div>
      {restaurar && <Modal titulo={`Restaurar a revisão ${restaurar.versao}`} onFechar={() => setRestaurar(null)}>
        <MotivoForm rotulo="Restaurar" dica="As etapas voltam a ficar como nessa versão; etapas criadas depois ficam inativas. Gera uma nova revisão, nada se perde."
          onCancelar={() => setRestaurar(null)} onEnviar={async (m) => { const v = await apiFluxo.restaurar(empresa, restaurar.id, m); setRestaurar(null); setAviso(`Revisão ${v} registrada (restauração da ${restaurar.versao}).`); atualizar() }} />
      </Modal>}
      {anotar && <Modal titulo="Registrar anotação de revisão" onFechar={() => setAnotar(false)}>
        <MotivoForm rotulo="Registrar" dica="Use para registrar uma validação ou decisão sem alterar etapas (ex.: validado com a Ane)." etapas
          onCancelar={() => setAnotar(false)} onEnviar={async (m, et) => { const v = await apiFluxo.anotar(empresa, m, et); setAnotar(false); setAviso(`Revisão ${v} registrada.`); atualizar() }} />
      </Modal>}
    </div>
  )
}

function MotivoForm({ rotulo, dica, etapas = false, onCancelar, onEnviar }: {
  rotulo: string; dica: string; etapas?: boolean; onCancelar: () => void; onEnviar: (m: string, etapas: string[]) => Promise<void>
}) {
  const [m, setM] = useState('')
  const [et, setEt] = useState('')
  const codigos = et.split(/[^0-9]+/).filter(Boolean).map((n) => 'E' + n.padStart(2, '0'))
  return (
    <Formulario enviarRotulo={rotulo} onCancelar={onCancelar} onEnviar={() => onEnviar(m, codigos)}>
      <p className="sub">{dica}</p>
      <Campo rotulo="Descrição"><textarea rows={3} value={m} onChange={(e) => setM(e.target.value)} required minLength={3} /></Campo>
      {etapas && <Campo rotulo="Etapas relacionadas" dica="Códigos ou números, ex.: 18, 22"><input value={et} onChange={(e) => setEt(e.target.value)} /></Campo>}
    </Formulario>
  )
}
