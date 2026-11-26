import { useEffect, useState, type ReactNode } from 'react'
import type { Contexto } from '../App'
import { apiVendas, type PrefVitrine, type Preferencias } from '../apiVendas'
import { useCarregar, Titulo } from '../ui'

// Preferências da vitrine (decisão de 22/11/2026): cada item mostra o recomendado; só admin/gestor alteram.
type Chave = keyof Omit<PrefVitrine, 'atualizado_em' | 'atualizado_por'>
const ROTULO: Record<Chave, string> = {
  tema: 'tema', animacao: 'balanço dos cabides', etiqueta_codigo: 'código na etiqueta', etiqueta_preco: 'preço na etiqueta',
  ordem_midias: 'ordem da galeria', video_auto: 'vídeo automático', prazo_reserva_min: 'prazo da reserva', carencia_pix_min: 'tolerância do Pix',
  fila_visibilidade: 'o que a cliente vê na fila', limite_reservas: 'reservas por cliente', regra_horario: 'reserva fora do horário',
  avisar_fila: 'aviso à fila', qtd_parecidas: 'peças parecidas', aviseme: 'botão Avise-me', url_base: 'endereço público', whatsapp_loja: 'WhatsApp da loja',
}
const MIDIA: Record<string, string> = { frente: 'Frente', costas: 'Costas', tecido: 'Detalhe do tecido', video: 'Vídeo' }
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const mostrar = (v: unknown) => Array.isArray(v) ? v.map((x) => MIDIA[x as string] ?? x).join(', ') : typeof v === 'boolean' ? (v ? 'ligado' : 'desligado') : v == null || v === '' ? '—' : String(v)

// fora do componente: assim o campo de texto não perde o foco a cada tecla
const Linha = ({ titulo, desc, rec: r, children }: { titulo: string; desc: string; rec?: ReactNode; children: ReactNode }) => (
  <div className="v-pref"><div><div className="v-linha"><strong>{titulo}</strong>{r}</div><small className="mudo">{desc}</small></div><div>{children}</div></div>
)

export default function PreferenciasVitrine({ ctx }: { ctx: Contexto }) {
  const p = useCarregar(() => apiVendas.preferencias(ctx.empresa), [ctx.empresa])
  const [dados, setDados] = useState<Preferencias | null>(null)
  const [cfg, setCfg] = useState<PrefVitrine | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (p.dados) { setDados(p.dados); setCfg(p.dados.valores ?? (p.dados.recomendados as PrefVitrine)) } }, [p.dados])
  if (p.erro) return <section><Titulo>Preferências da vitrine</Titulo><div className="erro">{p.erro}</div></section>
  if (!dados || !cfg) return <p className="sub">Carregando…</p>
  const rec = dados.recomendados as Partial<PrefVitrine>
  // sem linha em cfg_vitrine a função devolve valores nulos: usa os recomendados em vez de travar em "Carregando…"
  const salvo = dados.valores ?? (dados.recomendados as PrefVitrine)
  const pode = dados.pode_editar
  const chaves = Object.keys(ROTULO) as Chave[]
  const pendentes = chaves.filter((k) => !igual(cfg[k] ?? null, salvo[k] ?? null))
  const set = <K extends Chave>(k: K, v: PrefVitrine[K]) => { setMsg(null); setCfg({ ...cfg, [k]: v }) }

  async function salvar() {
    if (!pendentes.length) return setMsg('Nada para salvar.')
    setSalvando(true); setErro(null); setMsg(null)
    try {
      const envio: Partial<PrefVitrine> = {}
      pendentes.forEach((k) => { (envio as Record<string, unknown>)[k] = k === 'url_base' ? (cfg!.url_base?.trim() || '') : k === 'whatsapp_loja' ? (cfg!.whatsapp_loja?.trim() || '') : cfg![k] })
      const r = await apiVendas.salvarPreferencias(ctx.empresa, envio)
      setDados(r); setCfg(r.valores ?? (r.recomendados as PrefVitrine))
      setMsg('Preferências salvas. Valem para novas reservas; as que já estão correndo mantêm o prazo.')
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  const Rec = ({ k, txt }: { k: Chave; txt?: string }): ReactNode => rec[k] === undefined ? null : igual(cfg[k], rec[k])
    ? <span className="pill pill-ok">Recomendado</span>
    : pode ? <button type="button" className="link" onClick={() => set(k, rec[k] as never)}>Usar recomendado: {txt ?? mostrar(rec[k])}</button>
    : <span className="pill">Recomendado: {txt ?? mostrar(rec[k])}</span>
  const Seg = <K extends Chave>({ k, opcoes }: { k: K; opcoes: [PrefVitrine[K], string][] }) => (
    <div className="v-seg" role="group" aria-label={ROTULO[k]}>
      {opcoes.map(([v, r]) => <button key={String(v)} type="button" disabled={!pode} className={igual(cfg[k], v) ? 'sel' : ''} aria-pressed={igual(cfg[k], v)} onClick={() => set(k, v)}>{r}</button>)}
    </div>
  )
  const Chave_ = ({ k, rotulo }: { k: 'etiqueta_codigo' | 'etiqueta_preco' | 'video_auto' | 'avisar_fila' | 'aviseme'; rotulo: string }) => (
    <label className="check"><input type="checkbox" disabled={!pode} checked={cfg[k]} onChange={(e) => set(k, e.target.checked)} /> {rotulo}</label>
  )
  const Num = ({ k, min, max, suf }: { k: 'prazo_reserva_min' | 'limite_reservas' | 'qtd_parecidas'; min: number; max: number; suf?: string }) => (
    <div className="v-passo-num">
      <button type="button" className="sec" disabled={!pode || cfg[k] <= min} onClick={() => set(k, cfg[k] - 1)} aria-label="Diminuir">−</button>
      <strong>{cfg[k]}{suf}</strong>
      <button type="button" className="sec" disabled={!pode || cfg[k] >= max} onClick={() => set(k, cfg[k] + 1)} aria-label="Aumentar">+</button>
    </div>
  )
  const mover = (i: number, d: number) => { const a = [...cfg.ordem_midias]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set('ordem_midias', a) }

  return (
    <section>
      <div className="topo">
        <Titulo ajuda={<>Aparência e regras da página pública da peça. {pode ? 'Cada item mostra o valor recomendado.' : 'Somente leitura: só gestor e admin alteram.'}</>}>Preferências da vitrine</Titulo>
        {pode && <div className="v-linha">
          <span className={pendentes.length ? 'sujo' : 'mudo'}>{pendentes.length ? `${pendentes.length} alteração(ões) não salva(s)` : 'Tudo salvo'}</span>
          <button className="sec" disabled={!pendentes.length || salvando} onClick={() => { setCfg(salvo); setMsg(null) }}>Descartar</button>
          <button disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar preferências'}</button>
        </div>}
      </div>
      {erro && <div className="erro">{erro}</div>}
      {msg && <div className="info">{msg}</div>}

      <div className="painel v-prefs">
        <h2>Aparência</h2>
        <Linha titulo="Tema da página" desc="Claro usa o creme e o vinho da marca." rec={<Rec k="tema" txt="Claro" />}>
          <Seg k="tema" opcoes={[['claro', 'Claro'], ['escuro', 'Escuro'], ['auto', 'Seguir o celular']]} /></Linha>
        <Linha titulo="Balanço dos cabides" desc="Quem pede menos movimento no celular sempre vê sem animação." rec={<Rec k="animacao" txt="Suave" />}>
          <Seg k="animacao" opcoes={[['nenhuma', 'Desligado'], ['suave', 'Suave'], ['medio', 'Médio'], ['forte', 'Forte']]} /></Linha>
        <Linha titulo="Etiqueta pendurada" desc="O código é o mesmo que a cliente comenta na live.">
          <div className="v-linha"><Chave_ k="etiqueta_codigo" rotulo="Mostrar código" /><Chave_ k="etiqueta_preco" rotulo="Mostrar preço" /></div></Linha>
      </div>

      <div className="painel v-prefs">
        <h2>Fotos e vídeo</h2>
        <Linha titulo="Ordem padrão da galeria" desc="O primeiro item vira a capa. Cada peça pode mudar a ordem na tela Montar oferta." rec={<Rec k="ordem_midias" txt="Frente, Costas, Tecido, Vídeo" />}>
          <ol className="v-fila">{cfg.ordem_midias.map((m, i) => (
            <li key={m}><span className="v-pos">{i + 1}</span><span style={{ flex: 1 }}>{MIDIA[m] ?? m}{i === 0 && <small className="mudo"> · capa</small>}</span>
              {pode && <><button type="button" className="sec mini" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${MIDIA[m]}`}>↑</button>
                <button type="button" className="sec mini" disabled={i === cfg.ordem_midias.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${MIDIA[m]}`}>↓</button></>}</li>))}
          </ol></Linha>
        <Linha titulo="Vídeo toca sozinho, sem som" desc="Desligado economiza o plano de dados da cliente." rec={<Rec k="video_auto" />}><Chave_ k="video_auto" rotulo="Ligado" /></Linha>
      </div>

      <div className="painel v-prefs">
        <h2>Reserva e fila</h2>
        <Linha titulo="Prazo para pagar a reserva" desc="Vale para novas reservas. As que já estão correndo mantêm o prazo." rec={<Rec k="prazo_reserva_min" txt="15 min" />}>
          <Num k="prazo_reserva_min" min={5} max={60} suf=" min" />
          {cfg.prazo_reserva_min > 30 && <small className="sujo">Prazo longo segura a peça e esfria a fila.</small>}
          {cfg.prazo_reserva_min < 10 && <small className="sujo">Prazo curto aumenta a desistência.</small>}</Linha>
        <Linha titulo="Tolerância se o Pix já foi gerado" desc="Uma vez só, para quem está no meio do pagamento." rec={<Rec k="carencia_pix_min" txt="5 min" />}>
          <Seg k="carencia_pix_min" opcoes={[[0, 'Nenhuma'], [3, '3 min'], [5, '5 min'], [10, '10 min']]} /></Linha>
        <Linha titulo="O que a cliente vê na fila" desc="Mostrar nomes expõe dados de outras clientes (LGPD)." rec={<Rec k="fila_visibilidade" txt="só a posição" />}>
          <Seg k="fila_visibilidade" opcoes={[['posicao', 'Só a posição'], ['total', 'Posição e tamanho da fila'], ['nomes', 'Posição e nomes à frente']]} />
          {cfg.fila_visibilidade === 'nomes' && <small className="sujo">Exige aviso na política de privacidade; mostra só primeiro nome e inicial.</small>}</Linha>
        <Linha titulo="Reservas sem pagamento por cliente" desc="Evita que uma pessoa segure várias peças únicas ao mesmo tempo." rec={<Rec k="limite_reservas" txt="3" />}>
          <Num k="limite_reservas" min={1} max={10} /></Linha>
        <Linha titulo="Reserva fora do horário (20h às 9h)" desc="Evita que a cliente perca a peça porque foi dormir." rec={<span className="pill">A decidir com a Ane</span>}>
          <Seg k="regra_horario" opcoes={[['normal', 'Prazo normal'], ['manha', 'Vale até 9h do dia seguinte']]} /></Linha>
      </div>

      <div className="painel v-prefs">
        <h2>Quando a peça é vendida</h2>
        <Linha titulo="Avisar quem estava na fila" desc="Só depois do pagamento confirmado, pelo canal de origem de cada cliente." rec={<Rec k="avisar_fila" />}><Chave_ k="avisar_fila" rotulo="Ligado" /></Linha>
        <Linha titulo="Peças parecidas no aviso" desc="Mesma categoria e tamanho, preço próximo, disponível. No WhatsApp, só para quem aceitou novidades." rec={<Rec k="qtd_parecidas" txt="3" />}>
          <Num k="qtd_parecidas" min={0} max={6} /></Linha>
        <Linha titulo='Botão "Avise-me quando chegar algo parecido"' desc="Alimenta a lista de interesse por tamanho e categoria." rec={<Rec k="aviseme" />}><Chave_ k="aviseme" rotulo="Ligado" /></Linha>
      </div>

      <div className="painel v-prefs">
        <h2>Atendimento</h2>
        <Linha titulo="WhatsApp da loja" desc="Abre nos botões “Pagar pelo WhatsApp” e “Continuar no WhatsApp” da vitrine. Com DDD. Em branco, a página avisa que a loja vai chamar a cliente.">
          <input disabled={!pode} value={cfg.whatsapp_loja ?? ''} onChange={(e) => set('whatsapp_loja', e.target.value)} inputMode="tel" placeholder="(34) 9 0000-0000" /></Linha>
        <p className="sub">O domínio da vitrine pública fica em Configuração › Integrações › Vitrine pública.</p>
      </div>

      <div className="painel v-prefs">
        <h2>Últimas alterações</h2>
        {dados.historico.length === 0 ? <p className="sub">Ainda sem alterações. Os valores atuais são os recomendados.</p> : (
          <table className="compacta"><tbody>{dados.historico.map((h, i) => (
            <tr key={i}><td>{new Date(h.em).toLocaleString('pt-BR')}</td><td>{h.usuario}</td>
              <td style={{ whiteSpace: 'normal' }}>{Object.entries(h.alteracoes).map(([k, v]) => `${ROTULO[k as Chave] ?? k}: ${mostrar(v.antes)} → ${mostrar(v.depois)}`).join('; ')}</td></tr>))}
          </tbody></table>)}
      </div>
    </section>
  )
}
