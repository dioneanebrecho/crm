import { useEffect, useMemo, useState } from 'react'
import type { Contexto } from '../App'
import { supabase } from '../supabase'
import { apiConteudo, apiVendas, CANAIS, urlPublica, brl, type DadosConteudo, type Midia, type Canal } from '../apiVendas'
import { Modal } from '../ui'

// Montar oferta: mídias em ordem (fotos e vídeo), texto/HTML da página, legenda de cada canal com modelos,
// prévia por canal e kit de publicação manual. A página pública mostra só a versão APROVADA.
const CANAIS_LEGENDA: Canal[] = ['ig_feed', 'ig_reels', 'ig_story', 'whatsapp', 'live']
type Previa = Canal | 'pagina'
const ROTULOS: Record<Midia['rotulo'], string> = { frente: 'Frente', costas: 'Costas', tecido: 'Detalhe do tecido', video: 'Vídeo', outra: 'Outra' }
const LIMITE: Record<string, number> = { ig_feed: 2200, ig_reels: 2200, ig_story: 250, whatsapp: 2200, live: 300 }
const NOTA: Record<string, string> = {
  ig_feed: 'No feed o link da legenda não é clicável: termine com "Comente {codigo}" para a cliente entrar na fila.',
  ig_reels: 'Como no feed, o link não é clicável; use "Comente {codigo}".',
  ig_story: 'No story o link vai no adesivo de link (cole o endereço abaixo no adesivo).',
  whatsapp: 'No WhatsApp o link é clicável. *negrito* e _itálico_ funcionam.',
  live: 'Texto para a apresentadora anunciar a peça na live.',
}
const BUCKET_VIDEO = 'pecas-videos'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default function MontarOferta({ ctx, item, onFechar, onSalvo }: { ctx: Contexto; item: string; onFechar: () => void; onSalvo?: () => void }) {
  const [d, setD] = useState<DadosConteudo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [midias, setMidias] = useState<Midia[]>([])
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [usarHtml, setUsarHtml] = useState(false)
  const [html, setHtml] = useState('')
  const [legendas, setLegendas] = useState<Record<string, string>>({})
  const [canalLeg, setCanalLeg] = useState<Canal>('ig_feed')
  const [previa, setPrevia] = useState<Previa>('ig_feed')
  const [urlPost, setUrlPost] = useState('')
  const [enviandoVideo, setEnviandoVideo] = useState(false)

  const aplicar = (r: DadosConteudo) => {
    setD(r)
    const c = r.conteudo
    setMidias(c?.midias ?? r.sugestao.midias)
    setTitulo(c?.titulo ?? r.sugestao.titulo ?? '')
    setTexto(c?.texto ?? r.sugestao.texto ?? '')
    setUsarHtml(c?.usar_html ?? false)
    setHtml(c?.html ?? '')
    const leg: Record<string, string> = { ...(c?.legendas ?? {}) }
    CANAIS_LEGENDA.forEach((k) => { if (leg[k] === undefined) leg[k] = r.modelos.find((m) => m.canal === k)?.texto ?? '' })
    setLegendas(leg)
  }
  useEffect(() => { apiConteudo.obter(ctx.empresa, item).then(aplicar).catch((e: Error) => setErro(e.message)) }, [ctx.empresa, item])

  const preencher = useMemo(() => (t: string, canal?: Canal) => {
    if (!d) return t
    const v = d.variaveis
    const link = d.link.codigo ? urlPublica(d.link.codigo, canal === 'live' ? 'live' : canal, d.link.url_base) : '(link gerado ao publicar)'
    return t.replace(/\{nome\}/g, titulo || v.nome).replace(/\{codigo\}/g, v.codigo).replace(/\{tamanho\}/g, v.tamanho)
      .replace(/\{preco\}/g, brl(v.preco)).replace(/\{descricao\}/g, texto).replace(/\{prazo\}/g, String(v.prazo))
      .replace(/\{marca\}/g, v.marca ?? '').replace(/\{link\}/g, link)
  }, [d, titulo, texto])

  if (erro && !d) return <Modal titulo="Montar oferta" onFechar={onFechar}><div className="erro">{erro}</div></Modal>
  if (!d) return <Modal titulo="Montar oferta" onFechar={onFechar}><p className="sub">Carregando…</p></Modal>

  const capa = midias.find((m) => m.capa) ?? midias[0]
  const mover = (i: number, k: number) => { const a = [...midias]; const j = i + k; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setMidias(a) }
  const marcarCapa = (i: number) => setMidias(midias.map((m, k) => ({ ...m, capa: k === i })))
  const tirar = (i: number) => { const a = midias.filter((_, k) => k !== i); if (a.length && !a.some((m) => m.capa)) a[0] = { ...a[0], capa: true }; setMidias(a) }
  const fotosFora = d.fotos_peca.filter((f) => !midias.some((m) => m.path === f.path))
  const incluirFoto = (f: { url: string; path: string }) => setMidias([...midias, { tipo: 'foto', url: f.url, path: f.path, rotulo: 'outra', capa: midias.length === 0 }])

  async function enviarVideo(arq: File) {
    setErro(null)
    if (!/^video\/(mp4|quicktime|webm)$/.test(arq.type)) return setErro('Use vídeo MP4, MOV ou WebM.')
    if (arq.size > 50 * 1024 * 1024) return setErro('O vídeo passa de 50 MB. Corte ou comprima antes de enviar.')
    const dur = await new Promise<number>((ok) => { const v = document.createElement('video'); v.preload = 'metadata'
      v.onloadedmetadata = () => { ok(v.duration); URL.revokeObjectURL(v.src) }; v.onerror = () => ok(0); v.src = URL.createObjectURL(arq) })
    if (dur > 90) return setErro(`O vídeo tem ${Math.round(dur)} s. Use até 90 segundos.`)
    setEnviandoVideo(true)
    try {
      const ext = arq.type === 'video/quicktime' ? 'mov' : arq.type === 'video/webm' ? 'webm' : 'mp4'
      const path = `${ctx.empresa}/${d!.peca_id}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET_VIDEO).upload(path, arq, { contentType: arq.type, upsert: false })
      if (error) throw new Error(error.message)
      const url = supabase.storage.from(BUCKET_VIDEO).getPublicUrl(path).data.publicUrl
      setMidias((l) => [...l, { tipo: 'video', url, path, rotulo: 'video', capa: l.length === 0 }])
    } catch (e) { setErro(`Falha ao enviar o vídeo: ${(e as Error).message}`) } finally { setEnviandoVideo(false) }
  }

  async function salvar(aprovar: boolean) {
    setOcupado(true); setErro(null); setMsg(null)
    try {
      const r = await apiConteudo.salvar(ctx.empresa, item, { titulo, texto, usar_html: usarHtml, html: usarHtml ? html : '', midias, legendas }, aprovar)
      aplicar(r); onSalvo?.()
      setMsg(aprovar ? 'Aprovado: a página da peça já mostra esta versão.' : 'Rascunho salvo. A página continua com a última versão aprovada.')
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  const htmlDoTexto = () => setHtml(texto.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n'))
  const suspeito = usarHtml && /<\s*(script|iframe|style|object|embed)|\son\w+\s*=|style\s*=|javascript:/i.test(html)

  const legenda = preencher(legendas[canalLeg] ?? '', canalLeg)
  const copiar = async (t: string, oque: string) => { try { await navigator.clipboard.writeText(t); setMsg(`${oque} copiado.`) } catch { setErro('O navegador bloqueou a cópia.') } }
  async function baixarMidias() {
    setMsg(null)
    for (const [i, m] of midias.entries()) {
      try {
        const b = await (await fetch(m.url)).blob()
        const a = document.createElement('a'); a.href = URL.createObjectURL(b)
        a.download = `${d!.variaveis.codigo}-${String(i + 1).padStart(2, '0')}-${m.rotulo}.${m.path.split('.').pop()}`
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      } catch { setErro(`Não foi possível baixar a mídia ${i + 1}.`) }
    }
    setMsg('Mídias baixadas na ordem (01, 02, …).')
  }
  async function registrarPost() {
    if (!d!.link.id) return
    const u = urlPost.trim()
    if (u && !/^https:\/\//.test(u)) return setErro('Cole o endereço completo do post (https://…).')
    setErro(null)
    try { await apiVendas.mudarPublicacao(ctx.empresa, d!.link.id, canalLeg, true, u); setMsg(`Publicação no ${CANAIS[canalLeg].rotulo} registrada.`); setUrlPost(''); onSalvo?.() }
    catch (e) { setErro((e as Error).message) }
  }

  const paginaDoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:0;padding:14px;color:#2b2a30;background:#f6f1e7}
    img,video{width:100%;border-radius:10px;margin-bottom:8px;display:block}h1{font-size:20px;margin:6px 0}.p{font-weight:700;font-size:18px}</style></head><body>
    ${midias.map((m) => m.tipo === 'foto' ? `<img src="${esc(m.url)}" alt="">` : `<video src="${esc(m.url)}" muted controls></video>`).join('')}
    <h1>${esc(titulo || d.variaveis.nome)}</h1><div class="p">${esc(brl(d.variaveis.preco))} · Tam. ${esc(d.variaveis.tamanho)}</div>
    ${usarHtml ? html : `<p>${esc(texto).replace(/\n/g, '<br>')}</p>`}</body></html>`
  const wa = (t: string) => esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>')

  return (
    <Modal titulo={`Montar oferta · ${d.variaveis.nome} · ${d.variaveis.tamanho}`} onFechar={onFechar} larga>
      <div className="v-montar">
        <div className="v-linha">
          <span className={d.conteudo?.estado === 'aprovado' ? 'pill pill-ok' : 'pill pill-aviso'}>
            {d.conteudo ? (d.conteudo.estado === 'aprovado' ? `Aprovado · versão ${d.conteudo.versao}` : `Rascunho · versão ${d.conteudo.versao}`) : 'Novo'}
          </span>
          {d.conteudo && d.conteudo.estado === 'rascunho' && d.conteudo.tem_aprovado && <small className="mudo">A página mostra a última versão aprovada até você aprovar esta.</small>}
          <small className="mudo">Código da live: <strong>{d.variaveis.codigo}</strong> · {brl(d.variaveis.preco)}</small>
        </div>
        {erro && <div className="erro">{erro}</div>}
        {msg && <div className="info">{msg}</div>}

        <div className="v-montar-grade">
          <section className="v-col" aria-label="Mídias">
            <h3>Fotos e vídeo</h3>
            <p className="sub">A ordem aqui é a ordem da galeria e do carrossel. A capa abre a página e o post.</p>
            {midias.length === 0 && <p className="sub">Nenhuma mídia. Inclua fotos da peça ou envie um vídeo.</p>}
            <ol className="v-midias">
              {midias.map((m, i) => (
                <li key={m.path} className={m.capa ? 'capa' : ''}>
                  {m.tipo === 'foto' ? <img src={m.url} alt="" /> : <video src={m.url} muted preload="metadata" />}
                  <div className="v-midia-ctl">
                    <select value={m.rotulo} onChange={(e) => setMidias(midias.map((x, k) => k === i ? { ...x, rotulo: e.target.value as Midia['rotulo'] } : x))} aria-label={`Tipo da mídia ${i + 1}`}>
                      {Object.entries(ROTULOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                    </select>
                    <label className="check"><input type="radio" name="capa" checked={m.capa} onChange={() => marcarCapa(i)} /> Capa</label>
                    <span className="v-linha">
                      <button type="button" className="sec mini" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                      <button type="button" className="sec mini" disabled={i === midias.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
                      <button type="button" className="link perigo" onClick={() => tirar(i)}>Tirar</button>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            {fotosFora.length > 0 && <div className="v-linha"><small className="mudo">Fotos da peça fora da oferta:</small>
              {fotosFora.map((f) => <button key={f.path} type="button" className="v-mini-foto" onClick={() => incluirFoto(f)} title="Incluir"><img src={f.url} alt="Incluir foto" /></button>)}</div>}
            <label className={enviandoVideo ? 'botao-arquivo desativado' : 'botao-arquivo'}>
              {enviandoVideo ? 'Enviando vídeo…' : '+ Enviar vídeo (até 90 s, 50 MB)'}
              <input type="file" accept="video/mp4,video/quicktime,video/webm" hidden disabled={enviandoVideo}
                     onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviarVideo(f) }} />
            </label>
            <small className="mudo">Fotos novas entram pela tela Peças. O recorte por canal (4:5, 9:16) fica para a próxima etapa; a prévia mostra o enquadramento.</small>
          </section>

          <section className="v-col" aria-label="Texto">
            <h3>Texto da página</h3>
            <label className="campo"><span>Título</span><input value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} /></label>
            <label className="campo"><span>Descrição</span><textarea rows={5} maxLength={5000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Tecido, caimento, estado, medidas…" /></label>
            <label className="check"><input type="checkbox" checked={usarHtml} onChange={(e) => { setUsarHtml(e.target.checked); if (e.target.checked && !html) htmlDoTexto() }} /> Editar HTML da página</label>
            {usarHtml && <>
              <textarea className="mono" rows={7} value={html} onChange={(e) => setHtml(e.target.value)} />
              <div className="v-linha"><button type="button" className="link" onClick={htmlDoTexto}>Gerar HTML a partir da descrição</button></div>
              <small className={suspeito ? 'texto-erro' : 'mudo'}>{suspeito ? 'Há script, estilo, iframe ou evento: o servidor vai recusar.' : 'Permitido: títulos, parágrafos, listas, negrito, links https e imagens da própria loja.'}</small>
            </>}

            <h3>Legenda por canal</h3>
            <div className="chips">{CANAIS_LEGENDA.map((c) => <button type="button" key={c} className={canalLeg === c ? 'chip sel' : 'chip'} onClick={() => { setCanalLeg(c); setPrevia(c) }}>{CANAIS[c].rotulo}</button>)}</div>
            <div className="v-linha">
              <select aria-label="Aplicar modelo" value="" onChange={(e) => { const m = d.modelos.find((x) => x.id === e.target.value); if (m) setLegendas({ ...legendas, [canalLeg]: m.texto }) }}>
                <option value="">Aplicar modelo…</option>
                {d.modelos.filter((m) => !m.canal || m.canal === canalLeg).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <textarea rows={6} value={legendas[canalLeg] ?? ''} maxLength={2200} onChange={(e) => setLegendas({ ...legendas, [canalLeg]: e.target.value })} />
            <small className={legenda.length > LIMITE[canalLeg] ? 'texto-erro' : 'mudo'}>{legenda.length}/{LIMITE[canalLeg]} caracteres com as variáveis preenchidas · {NOTA[canalLeg]}</small>
            <small className="mudo">Variáveis: {'{nome} {codigo} {tamanho} {preco} {descricao} {prazo} {link} {marca}'}</small>
          </section>

          <section className="v-col" aria-label="Prévia e kit">
            <h3>Prévia</h3>
            <div className="chips">{(['ig_feed', 'ig_story', 'whatsapp', 'pagina'] as Previa[]).map((p) => (
              <button type="button" key={p} className={previa === p ? 'chip sel' : 'chip'} onClick={() => setPrevia(p)}>{p === 'pagina' ? 'Página' : CANAIS[p].rotulo}</button>))}</div>
            {previa === 'pagina' && <iframe className="v-previa-pagina" sandbox="" title="Prévia da página" srcDoc={paginaDoc} />}
            {(previa === 'ig_feed' || previa === 'ig_reels') && (
              <div className="v-previa-ig">
                {capa ? (capa.tipo === 'foto' ? <img src={capa.url} alt="" /> : <video src={capa.url} muted />) : <div className="v-sem-midia">sem mídia</div>}
                {midias.length > 1 && <small className="mudo">carrossel · {midias.length} mídias</small>}
                <p>{preencher(legendas[previa] ?? '', previa)}</p>
              </div>
            )}
            {previa === 'ig_story' && (
              <div className="v-previa-story">
                {capa ? (capa.tipo === 'foto' ? <img src={capa.url} alt="" /> : <video src={capa.url} muted />) : <div className="v-sem-midia">sem mídia</div>}
                <span className="v-adesivo">Link: {d.variaveis.codigo}</span>
                <p>{preencher(legendas.ig_story ?? '', 'ig_story')}</p>
              </div>
            )}
            {previa === 'whatsapp' && (
              <div className="v-previa-wa">
                {capa && capa.tipo === 'foto' && <img src={capa.url} alt="" />}
                <p dangerouslySetInnerHTML={{ __html: wa(preencher(legendas.whatsapp ?? '', 'whatsapp')) }} />
              </div>
            )}

            <h3>Kit de publicação · {CANAIS[canalLeg].rotulo}</h3>
            <div className="v-linha">
              <button type="button" className="sec mini" onClick={() => copiar(legenda, 'Legenda')}>Copiar legenda</button>
              <button type="button" className="sec mini" disabled={!midias.length} onClick={baixarMidias}>Baixar mídias</button>
              {d.link.codigo && <button type="button" className="sec mini" onClick={() => copiar(urlPublica(d.link.codigo!, canalLeg, d.link.url_base), 'Link')}>Copiar link</button>}
              {canalLeg === 'whatsapp' && <a className="botao sec mini" href={`https://wa.me/?text=${encodeURIComponent(legenda)}`} target="_blank" rel="noreferrer">Compartilhar no WhatsApp</a>}
            </div>
            <label className="campo"><span>Depois de postar, cole o endereço do post</span>
              <span className="v-linha"><input value={urlPost} onChange={(e) => setUrlPost(e.target.value)} placeholder="https://www.instagram.com/p/…" style={{ flex: 1 }} />
                <button type="button" className="sec mini" onClick={registrarPost}>Registrar</button></span></label>
            <small className="mudo">{d.publicacoes[canalLeg] ? `Canal ativo desde ${new Date(d.publicacoes[canalLeg].publicada_em).toLocaleString('pt-BR')}${d.publicacoes[canalLeg].url_post ? ' · post registrado' : ''}.` : 'Canal ainda não ativado para esta peça.'}</small>
          </section>
        </div>

        <div className="acoes">
          <button type="button" className="sec" onClick={onFechar}>Fechar</button>
          <button type="button" className="sec" disabled={ocupado} onClick={() => salvar(false)}>{ocupado ? 'Salvando…' : 'Salvar rascunho'}</button>
          {d.pode_aprovar && <button type="button" disabled={ocupado || !midias.length} onClick={() => salvar(true)}>Aprovar e mostrar na página</button>}
        </div>
      </div>
    </Modal>
  )
}
