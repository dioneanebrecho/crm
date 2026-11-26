import { useContext, useEffect, useState, type ReactNode } from 'react'
import { AbaContexto, useEstadoTela } from '../abas'
import type { Contexto } from '../App'
import { api, type PecaLinha, type PecaDetalhe } from '../api'
import { apiVendas, CANAIS, CANAIS_PUBLICAVEIS, urlPublica, restante, mmss, brl, hora, curto,
         type Canal, type OfertaLinha, type DetalheOferta, type ClienteVendasLinha, type DetalheCliente } from '../apiVendas'
import { Abas, Busca, Campo, Formulario, Modal, useCarregar, Vazio, Titulo } from '../ui'
import MontarOferta from './MontarOferta'

// Central de vendas: a mesma oferta (peça + tamanho) com um link único divulgado em vários canais e UMA fila.
// Visão por peça (canais, reserva, fila, histórico) e por cliente (intenções, etapa, quem precisa de apoio).
type Visao = 'peca' | 'cliente'
type Modo = 'tabela' | 'cards'
type PosDet = 'lateral' | 'abaixo'
const ler = <T extends string>(k: string, padrao: T, ok: readonly T[]): T => {
  try { const v = localStorage.getItem(k) as T | null; return v && ok.includes(v) ? v : padrao } catch { return padrao }
}
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }

function useAgora() {
  const [agora, setAgora] = useState(Date.now())
  const { ativa } = useContext(AbaContexto)
  useEffect(() => { if (!ativa) return; setAgora(Date.now()); const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t) }, [ativa])
  return agora
}
const corTempo = (s: number) => (s < 180 ? 'tempo urgente' : s < 480 ? 'tempo atencao' : 'tempo')
const SITUACAO: Record<string, string> = { disponivel: 'Disponível', reservada: 'Reservada', vendida: 'Vendida', encerrada: 'Encerrada' }
const ETAPA_RES: Record<string, string> = { aguardando_dados: 'Aguardando dados', dados_confirmados: 'Dados confirmados', pix_gerado: 'Pix gerado' }
const ETAPA_CLI: Record<string, string> = { reservada: 'Reservada', paga: 'Pago', fila: 'Na fila', perdeu: 'Perdeu a peça', interesse: 'Interesse' }

const SeloCanal = ({ canal }: { canal: string | null | undefined }) => {
  const c = CANAIS[canal ?? 'outro'] ?? CANAIS.outro
  return <span className="v-canal" style={{ background: c.cor }} title={c.rotulo}>{c.curto}</span>
}

export default function Vendas({ ctx, abrir }: { ctx: Contexto; abrir?: (id: string, q?: string) => void }) {
  const podeOperar = ctx.perm === null
    ? ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor', 'suporte', 'apresentadora'].includes(p))
    : ctx.perm.vendas === 'editar'
  const [visao, setVisao] = useState<Visao>(() => ler('ane.vendas.visao', 'peca', ['peca', 'cliente'] as const))
  const [modo, setModo] = useState<Modo>(() => ler('ane.vendas.modo', 'tabela', ['tabela', 'cards'] as const))
  const [pos, setPos] = useState<PosDet>(() => ler('ane.vendas.detalhe', 'lateral', ['lateral', 'abaixo'] as const))
  const [filtroP, setFiltroP] = useEstadoTela('vendas.filtroP', 'todas')
  const [filtroC, setFiltroC] = useEstadoTela('vendas.filtroC', 'todos')
  const [busca, setBusca] = useEstadoTela('vendas.busca', '')
  const [selPeca, setSelPeca] = useState<string | null>(null)
  const [selCli, setSelCli] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [publicando, setPublicando] = useState(false)
  const [montando, setMontando] = useState<string | null>(null)
  const agora = useAgora()
  // atualização automática: reserva e fila mudam sozinhas (prazo, comentário da live, clique no link)
  // aba oculta não consulta o banco; ao voltar, atualiza na hora
  const { ativa: abaAtiva } = useContext(AbaContexto)
  useEffect(() => { if (!abaAtiva) return; setVersao((v) => v + 1); const t = setInterval(() => setVersao((v) => v + 1), 15000); return () => clearInterval(t) }, [abaAtiva])
  useEffect(() => gravar('ane.vendas.visao', visao), [visao])
  useEffect(() => gravar('ane.vendas.modo', modo), [modo])
  useEffect(() => gravar('ane.vendas.detalhe', pos), [pos])

  const ofertas = useCarregar(() => apiVendas.ofertas(ctx.empresa, filtroP, visao === 'peca' ? busca : ''), [ctx.empresa, filtroP, busca, visao, versao])
  const clientes = useCarregar(() => visao === 'cliente' ? apiVendas.clientes(ctx.empresa, filtroC, busca) : Promise.resolve(null),
                               [ctx.empresa, filtroC, busca, visao, versao])
  const atualizar = () => setVersao((v) => v + 1)
  const abrirCliente = (id: string) => { setVisao('cliente'); setSelCli(id); setBusca('') }
  const abrirPeca = (id: string) => { setVisao('peca'); setSelPeca(id); setBusca('') }

  const co = ofertas.dados?.contagem
  const cc = clientes.dados?.contagem
  const temDetalhe = visao === 'peca' ? !!selPeca : !!selCli

  return (
    <section>
      <div className="topo">
        <div><Titulo ajuda={<>Um link por peça em todos os canais e uma fila só. Atualiza sozinha a cada 15 segundos.</>}>Central de vendas</Titulo></div>
        {podeOperar && <button onClick={() => setPublicando(true)}>+ Publicar peça</button>}
      </div>

      <div className="resumo-faixa">
        <div><strong>{co?.disponivel ?? '—'}</strong><span>Disponíveis</span></div>
        <div><strong>{co?.reservada ?? '—'}</strong><span>Reservadas agora</span></div>
        <div><strong>{co?.com_fila ?? '—'}</strong><span>Peças com fila</span></div>
        <div><strong>{co?.vendida ?? '—'}</strong><span>Vendidas</span></div>
        {visao === 'cliente' && <div className={cc?.apoio ? 'v-alerta' : ''}><strong>{cc?.apoio ?? '—'}</strong><span>Precisam de apoio</span></div>}
      </div>

      <Abas<Visao> abas={[{ id: 'peca', rotulo: 'Por peça', contagem: co?.todas }, { id: 'cliente', rotulo: 'Por cliente', contagem: cc?.todos }]}
                   ativa={visao} onMudar={(v) => { setVisao(v); setBusca('') }} />

      <div className="v-barra">
        <Busca key={visao} valor={busca} onMudar={setBusca} placeholder={visao === 'peca' ? 'Buscar peça por nome ou código' : 'Buscar cliente por nome ou @'} />
        <div className="chips">
          {visao === 'peca'
            ? ([['todas', 'Todas', co?.todas], ['disponivel', 'Disponíveis', co?.disponivel], ['reservada', 'Reservadas', co?.reservada],
                ['com_fila', 'Com fila', co?.com_fila], ['vendida', 'Vendidas', co?.vendida]] as const).map(([id, r, n]) => (
                <button key={id} className={filtroP === id ? 'chip sel' : 'chip'} onClick={() => setFiltroP(id)}>{r}{n !== undefined && ` · ${n}`}</button>))
            : ([['todos', 'Todas', cc?.todos], ['apoio', 'Precisam de apoio', cc?.apoio], ['reservada', 'Reservadas', cc?.reservada],
                ['fila', 'Na fila', cc?.fila], ['paga', 'Pagas', cc?.paga], ['perdeu', 'Perderam a peça', cc?.perdeu]] as const).map(([id, r, n]) => (
                <button key={id} className={filtroC === id ? 'chip sel' : 'chip'} onClick={() => setFiltroC(id)}>{r}{n !== undefined && ` · ${n}`}</button>))}
        </div>
        <div className="v-seg" role="group" aria-label="Formato da lista">
          {(['tabela', 'cards'] as const).map((m) => <button key={m} className={modo === m ? 'sel' : ''} aria-pressed={modo === m} onClick={() => setModo(m)}>{m === 'tabela' ? 'Tabela' : 'Cards'}</button>)}
        </div>
        <div className="v-seg" role="group" aria-label="Posição do detalhe">
          {(['lateral', 'abaixo'] as const).map((m) => <button key={m} className={pos === m ? 'sel' : ''} aria-pressed={pos === m} onClick={() => setPos(m)}>{m === 'lateral' ? 'Detalhe ao lado' : 'Detalhe abaixo'}</button>)}
        </div>
      </div>

      {visao === 'cliente' && clientes.dados && <Funil f={clientes.dados.funil} />}

      <div className={temDetalhe && pos === 'lateral' ? 'v-area lado' : 'v-area'}>
        <div className="v-lista">
          {visao === 'peca' && <ListaPecas estado={ofertas} modo={modo} sel={selPeca} agora={agora} onAbrir={setSelPeca}
                                           vazioAcao={podeOperar ? <button onClick={() => setPublicando(true)}>Publicar a primeira peça</button> : undefined} />}
          {visao === 'cliente' && <ListaClientes estado={clientes} modo={modo} sel={selCli} agora={agora} onAbrir={setSelCli} />}
        </div>
        {temDetalhe && (
          <div className="v-detalhe">
            {visao === 'peca' && selPeca && <DetalhePeca ctx={ctx} item={selPeca} versao={versao} agora={agora} podeOperar={podeOperar}
                                                         onFechar={() => setSelPeca(null)} onMudou={atualizar} onAbrirCliente={abrirCliente} onMontar={() => setMontando(selPeca)} />}
            {visao === 'cliente' && selCli && <DetalheCli ctx={ctx} cliente={selCli} versao={versao} agora={agora}
                                                          onFechar={() => setSelCli(null)} onAbrirPeca={abrirPeca} abrir={abrir} />}
          </div>
        )}
      </div>

      {publicando && <Publicar ctx={ctx} onFechar={() => setPublicando(false)} onPublicado={(item) => { setPublicando(false); setVisao('peca'); setSelPeca(item); setMontando(item); atualizar() }} />}
      {montando && <MontarOferta ctx={ctx} item={montando} onFechar={() => setMontando(null)} onSalvo={atualizar} />}
    </section>
  )
}

function Funil({ f }: { f: { interessadas: number; fila: number; reservadas: number; pix: number; pagas: number } }) {
  const passos = [['Interessadas', f.interessadas], ['Na fila', f.fila], ['Reservadas', f.reservadas], ['Pix gerado', f.pix], ['Pagas', f.pagas]] as const
  const max = Math.max(1, f.interessadas)
  return (
    <div className="painel v-funil" aria-label="Funil dos últimos 30 dias">
      {passos.map(([r, n]) => (
        <div key={r}><span>{r}</span><div className="v-barra-funil"><i style={{ height: `${Math.max(6, Math.round((n / max) * 100))}%` }} /></div><strong>{n}</strong></div>
      ))}
      <small className="mudo">Últimos 30 dias · conversão {f.interessadas ? Math.round((f.pagas / f.interessadas) * 100) : 0}%</small>
    </div>
  )
}

type Estado<T> = { dados: T | null; erro: string | null; carregando: boolean }

function ListaPecas({ estado, modo, sel, agora, onAbrir, vazioAcao }: {
  estado: Estado<{ linhas: OfertaLinha[] }>; modo: Modo; sel: string | null; agora: number; onAbrir: (id: string) => void; vazioAcao?: ReactNode
}) {
  if (estado.erro) return <div className="erro">{estado.erro}</div>
  if (!estado.dados) return <p className="sub">Carregando…</p>
  const linhas = estado.dados.linhas
  if (linhas.length === 0) return <Vazio titulo="Nenhuma peça na vitrine" texto="Publique uma peça para gerar o link único e escolher os canais de divulgação." acao={vazioAcao} />
  const reservaTxt = (o: OfertaLinha) => {
    if (!o.reserva) return { a: o.situacao === 'vendida' ? 'Vendida' : '—', b: '', cls: 'mudo' }
    const s = restante(o.reserva.expira_em, agora)
    return { a: curto(o.reserva.cliente, o.reserva.instagram), b: `${mmss(s)} · ${ETAPA_RES[o.reserva.etapa] ?? ''}`, cls: corTempo(s) }
  }
  if (modo === 'cards') return (
    <div className="v-cards">
      {linhas.map((o) => { const r = reservaTxt(o); return (
        <button key={o.item_id} className={sel === o.item_id ? 'v-card sel' : 'v-card'} onClick={() => onAbrir(o.item_id)}>
          <span className="v-card-topo">
            {o.foto ? <img className="miniatura" src={o.foto} alt="" /> : <span className="miniatura vazia">—</span>}
            <span><strong>{o.nome}</strong><small>{o.codigo_live} · {o.tamanho} · {brl(o.preco)}</small></span>
          </span>
          <span className="v-card-linha"><span className={`selo selo-${o.situacao}`}>{SITUACAO[o.situacao]}</span><small>fila {o.fila}</small></span>
          <span className="v-canais">{o.canais_ativos.length ? o.canais_ativos.map((c) => <SeloCanal key={c} canal={c} />) : <small className="mudo">sem canal ativo</small>}</span>
          <span className={r.cls}>{r.a} {r.b}</span>
        </button>) })}
    </div>
  )
  return (
    <div className="tabela-rolavel">
      <table>
        <thead><tr><th>Peça</th><th>Situação</th><th>Canais ativos</th><th>Reserva agora</th><th className="num">Fila</th><th className="num">Visitas · int.</th></tr></thead>
        <tbody>
          {linhas.map((o) => { const r = reservaTxt(o); return (
            <tr key={o.item_id} className={sel === o.item_id ? 'clicavel v-sel' : 'clicavel'} onClick={() => onAbrir(o.item_id)}>
              <td><span className="v-peca">{o.foto ? <img className="miniatura" src={o.foto} alt="" /> : <span className="miniatura vazia">—</span>}
                <span><strong>{o.nome}</strong><small className="mudo">{o.codigo_live} · Tam. {o.tamanho} · {brl(o.preco)}</small></span></span></td>
              <td><span className={`selo selo-${o.situacao}`}>{SITUACAO[o.situacao]}</span></td>
              <td><span className="v-canais">{o.canais_ativos.length ? o.canais_ativos.map((c) => <SeloCanal key={c} canal={c} />) : <span className="mudo">nenhum</span>}</span></td>
              <td><strong>{r.a}</strong>{r.b && <><br /><small className={r.cls}>{r.b}</small></>}</td>
              <td className="num"><strong>{o.fila}</strong></td>
              <td className="num">{o.visitas} · {o.interessadas}</td>
            </tr>) })}
        </tbody>
      </table>
    </div>
  )
}

function ListaClientes({ estado, modo, sel, agora, onAbrir }: {
  estado: Estado<{ linhas: ClienteVendasLinha[] } | null>; modo: Modo; sel: string | null; agora: number; onAbrir: (id: string) => void
}) {
  if (estado.erro) return <div className="erro">{estado.erro}</div>
  if (!estado.dados) return <p className="sub">Carregando…</p>
  const linhas = estado.dados.linhas
  if (linhas.length === 0) return <Vazio titulo="Nenhuma cliente com intenção" texto="Aqui aparecem as clientes que quiseram uma peça nos últimos 30 dias, por link, comentário na live ou WhatsApp." />
  const prazo = (c: ClienteVendasLinha) => { if (!c.reserva) return { t: '—', cls: 'mudo' }; const s = restante(c.reserva.expira_em, agora); return { t: mmss(s), cls: corTempo(s) } }
  const selo = (e: string) => `selo v-etapa-${e}`
  if (modo === 'cards') return (
    <div className="v-cards">
      {linhas.map((c) => { const p = prazo(c); return (
        <button key={c.id} className={sel === c.id ? 'v-card sel' : 'v-card'} onClick={() => onAbrir(c.id)}>
          <span className="v-card-topo"><span className="avatar">{curto(c.nome, c.instagram_username).slice(0, 2).toUpperCase()}</span>
            <span><strong>{c.nome ?? `@${c.instagram_username}`}</strong><small>{c.instagram_username ? `@${c.instagram_username}` : c.telefone ?? ''}</small></span></span>
          <span className="v-card-linha"><SeloCanal canal={c.origem} /><span className={selo(c.etapa)}>{ETAPA_CLI[c.etapa]}</span><span className={p.cls}>{p.t}</span></span>
          {c.apoio.length > 0 && <span className="v-apoio">{c.apoio.join(' · ')}</span>}
        </button>) })}
    </div>
  )
  return (
    <div className="tabela-rolavel">
      <table>
        <thead><tr><th>Cliente</th><th>Origem</th><th>Etapa</th><th>Prazo</th><th>Precisa de apoio</th><th>Última interação</th></tr></thead>
        <tbody>
          {linhas.map((c) => { const p = prazo(c); return (
            <tr key={c.id} className={sel === c.id ? 'clicavel v-sel' : 'clicavel'} onClick={() => onAbrir(c.id)}>
              <td><strong>{c.nome ?? `@${c.instagram_username}`}</strong><br /><small className="mudo">{c.instagram_username ? `@${c.instagram_username}` : ''}</small></td>
              <td><SeloCanal canal={c.origem} /></td>
              <td><span className={selo(c.etapa)}>{ETAPA_CLI[c.etapa]}</span>
                <br /><small className="mudo">{[c.n_reservas && `${c.n_reservas} reserva(s)`, c.n_fila && `${c.n_fila} fila`, c.n_pagas && `${c.n_pagas} paga(s)`].filter(Boolean).join(' · ')}</small></td>
              <td><strong className={p.cls}>{p.t}</strong></td>
              <td>{c.apoio.length ? <span className="v-apoio">{c.apoio.join(' · ')}</span> : <span className="mudo">—</span>}</td>
              <td>{hora(c.ultima)}</td>
            </tr>) })}
        </tbody>
      </table>
    </div>
  )
}

function DetalhePeca({ ctx, item, versao, agora, podeOperar, onFechar, onMudou, onAbrirCliente, onMontar }: {
  ctx: Contexto; item: string; versao: number; agora: number; podeOperar: boolean
  onFechar: () => void; onMudou: () => void; onAbrirCliente: (id: string) => void; onMontar: () => void
}) {
  const d = useCarregar(() => apiVendas.oferta(ctx.empresa, item), [ctx.empresa, item, versao])
  const [acao, setAcao] = useState<'estender' | 'passar' | 'pago' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  if (d.erro) return <div className="painel"><div className="erro">{d.erro}</div></div>
  if (!d.dados) return <div className="painel"><p className="sub">Carregando…</p></div>
  const o: DetalheOferta = d.dados
  const link = o.link.codigo
  const copiar = async (canal: Canal) => {
    if (!link) return
    try { await navigator.clipboard.writeText(urlPublica(link, canal, o.link.url_base)); setCopiado(canal); setTimeout(() => setCopiado(null), 1500) } catch { /* sem permissão */ }
  }
  const mudar = async (canal: Canal, ativar: boolean) => {
    if (!o.link.id) return
    setErro(null)
    try { await apiVendas.mudarPublicacao(ctx.empresa, o.link.id, canal, ativar); onMudou() } catch (e) { setErro((e as Error).message) }
  }
  const s = o.reserva ? restante(o.reserva.expira_em, agora) : 0
  return (
    <div className="painel v-det">
      <div className="v-det-topo">
        {o.peca.foto_capa ? <img className="v-foto" src={o.peca.foto_capa} alt="" /> : <span className="v-foto vazia">sem foto</span>}
        <div>
          <small className="mudo">{o.peca.categoria ?? 'Peça'} · {o.peca.codigo_live} · Tam. {o.peca.tamanho}</small>
          <h2>{o.peca.nome}</h2>
          <div className="v-linha"><strong>{brl(o.peca.preco)}</strong><span className={`selo selo-${o.status.situacao}`}>{SITUACAO[o.status.situacao]}</span>
            {podeOperar && <button className="sec mini" onClick={onMontar}>Montar conteúdo</button>}</div>
        </div>
        <button className="icone" onClick={onFechar} aria-label="Fechar detalhe">×</button>
      </div>
      {erro && <div className="erro">{erro}</div>}

      <h3>Canais da oferta</h3>
      <p className="sub">Mesmo link e mesma fila em todos. Cada canal só marca de onde a cliente veio.</p>
      <div className="v-quadrante">
        {o.canais.map((c) => (
          <div key={c.canal} className={c.estado === 'ativa' ? 'v-canal-card ativo' : 'v-canal-card'} style={c.estado === 'ativa' ? { borderColor: CANAIS[c.canal]?.cor } : undefined}>
            <div className="v-linha"><SeloCanal canal={c.canal} /><small>{c.estado === 'ativa' ? 'Link ativo' : c.estado === 'encerrada' ? 'Encerrado' : 'Não publicado'}</small></div>
            <small className="mudo">{c.publicada_em ? `Publicado ${hora(c.publicada_em)}` : 'Ainda não divulgado'}</small>
            <strong>{c.canal === 'live' ? `${c.interessadas} interessada(s)` : `${c.visitas} visita(s) · ${c.interessadas} interessada(s)`}</strong>
            <div className="v-linha">
              {link && c.estado === 'ativa' && <button className="sec mini" onClick={() => copiar(c.canal)}>{copiado === c.canal ? 'Copiado' : 'Copiar link'}</button>}
              {podeOperar && o.status.situacao !== 'vendida' && (c.estado === 'ativa'
                ? <button className="link" onClick={() => mudar(c.canal, false)}>Encerrar</button>
                : <button className="link" onClick={() => mudar(c.canal, true)}>{c.estado === 'encerrada' ? 'Reativar' : 'Publicar aqui'}</button>)}
            </div>
          </div>
        ))}
      </div>
      {link && <p className="sub v-url">Link: <code>{urlPublica(link, undefined, o.link.url_base)}</code></p>}

      {o.reserva && (
        <div className="v-reserva">
          <div className="v-linha">
            <div>
              <small className="mudo">Reserva atual{o.reserva.promovida_da_fila ? ' · veio da fila' : ''}{o.reserva.carencia_aplicada ? ' · tolerância do Pix aplicada' : ''}</small>
              <div className="v-linha"><button className="link" onClick={() => onAbrirCliente(o.reserva!.cliente_id)}>{o.reserva.cliente ?? `@${o.reserva.instagram}`}</button><SeloCanal canal={o.reserva.canal} /></div>
            </div>
            <strong className={`v-relogio ${corTempo(s)}`}>{mmss(s)}</strong>
          </div>
          {podeOperar && <div className="v-linha">
            <button className="sec mini" onClick={() => setAcao('estender')}>Estender prazo</button>
            <button className="sec mini" onClick={() => setAcao('passar')}>Passar ao próximo</button>
            <button className="sec mini" onClick={() => setAcao('pago')}>Marcar pago</button>
          </div>}
        </div>
      )}
      {o.venda && (
        <div className="info">Vendida para <strong>{o.venda.cliente ?? 'cliente'}</strong> via {CANAIS[o.venda.canal ?? 'outro']?.rotulo} em {hora(o.venda.em)}.
          {o.venda.avisadas > 0 ? ` ${o.venda.avisadas} pessoa(s) da fila foram avisadas pelo canal de origem, com peças parecidas.` : ' Ninguém estava na fila.'}</div>
      )}
      {!o.reserva && !o.venda && o.status.situacao === 'disponivel' && <p className="sub">Disponível. Ninguém reservou ainda.</p>}

      <h3>Fila de espera · {o.fila.length}</h3>
      {o.fila.length === 0 ? <p className="sub">Ninguém esperando.</p> : (
        <ol className="v-fila">
          {o.fila.map((f) => (
            <li key={f.fila_id}><span className="v-pos">{f.posicao}</span>
              <button className="link" onClick={() => onAbrirCliente(f.cliente_id)}>{f.cliente ?? `@${f.instagram}`}</button>
              <SeloCanal canal={f.canal} /><small className="mudo">entrou {hora(f.entrou_em)}</small></li>
          ))}
        </ol>
      )}

      <h3>Histórico da peça</h3>
      {o.historico.length === 0 ? <p className="sub">Sem movimentação.</p> : (
        <ul className="v-hist">
          {o.historico.map((h, i) => <li key={i}><small className="mudo">{hora(h.em)}</small><SeloCanal canal={h.canal} /><span>{h.texto}</span></li>)}
        </ul>
      )}

      {acao && o.reserva && <AcaoReserva ctx={ctx} tipo={acao} reserva={o.reserva.id} cliente={o.reserva.cliente}
                                         onFechar={() => setAcao(null)} onFeito={() => { setAcao(null); onMudou() }} />}
    </div>
  )
}

function AcaoReserva({ ctx, tipo, reserva, cliente, onFechar, onFeito }: {
  ctx: Contexto; tipo: 'estender' | 'passar' | 'pago'; reserva: string; cliente: string | null; onFechar: () => void; onFeito: () => void
}) {
  const [min, setMin] = useState('5')
  const [motivo, setMotivo] = useState('')
  const [metodo, setMetodo] = useState<'pix' | 'cartao' | 'manual' | 'outro'>('pix')
  const [frete, setFrete] = useState('')
  if (tipo === 'pago') return (
    <Modal titulo="Marcar a reserva como paga" onFechar={onFechar}>
      <Formulario enviarRotulo="Confirmar pagamento" onCancelar={onFechar} onEnviar={async () => {
        const r = await apiVendas.marcarPago(ctx.empresa, reserva, metodo, motivo, frete ? Number(frete.replace(',', '.')) : 0)
        if (r.resultado === 'revisao_manual') throw new Error('O valor não bateu com a cobrança: foi aberta uma revisão na Central de governança.')
        onFeito()
      }}>
        <p className="sub">Use quando o pagamento de {cliente ?? 'cliente'} foi conferido fora do link (Pix no extrato, pagamento na loja). A peça vira vendida, o pedido é criado no nome de quem pagou (CPF informado no link) e a fila é avisada.</p>
        <div className="grade2">
          <Campo rotulo="Forma"><select value={metodo} onChange={(e) => setMetodo(e.target.value as typeof metodo)}><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="manual">Dinheiro / loja</option><option value="outro">Outro</option></select></Campo>
          <Campo rotulo="Frete (R$)" dica="Só se ainda não houver cobrança."><input value={frete} onChange={(e) => setFrete(e.target.value)} inputMode="decimal" placeholder="0,00" /></Campo>
        </div>
        <Campo rotulo="Como foi conferido" dica="Obrigatório. Ex.: Pix conferido no extrato às 21h10."><input value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus /></Campo>
      </Formulario>
    </Modal>
  )
  return (
    <Modal titulo={tipo === 'estender' ? 'Estender o prazo da reserva' : 'Passar a vez para a próxima da fila'} onFechar={onFechar}>
      <Formulario enviarRotulo={tipo === 'estender' ? 'Estender' : 'Passar a vez'} onCancelar={onFechar} onEnviar={async () => {
        if (tipo === 'estender') await apiVendas.estender(ctx.empresa, reserva, Number(min), motivo)
        else await apiVendas.passarVez(ctx.empresa, reserva, motivo)
        onFeito()
      }}>
        <p className="sub">{tipo === 'estender'
          ? `A reserva de ${cliente ?? 'cliente'} ganha mais tempo. Fica registrado no histórico.`
          : `A reserva de ${cliente ?? 'cliente'} é cancelada e a próxima da fila recebe a vez (aviso pelo canal dela). Fica registrado como desistência.`}</p>
        {tipo === 'estender' && <Campo rotulo="Minutos a mais"><select value={min} onChange={(e) => setMin(e.target.value)}>{[3, 5, 10, 15].map((m) => <option key={m} value={m}>{m} min</option>)}</select></Campo>}
        <Campo rotulo="Motivo" dica="Obrigatório. Ex.: cliente pediu, problema no banco, desistiu pelo WhatsApp."><input value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus /></Campo>
      </Formulario>
    </Modal>
  )
}

function DetalheCli({ ctx, cliente, versao, agora, onFechar, onAbrirPeca, abrir }: {
  ctx: Contexto; cliente: string; versao: number; agora: number; onFechar: () => void; onAbrirPeca: (item: string) => void
  abrir?: (id: string, q?: string) => void
}) {
  const d = useCarregar(() => apiVendas.cliente(ctx.empresa, cliente), [ctx.empresa, cliente, versao])
  if (d.erro) return <div className="painel"><div className="erro">{d.erro}</div></div>
  if (!d.dados) return <div className="painel"><p className="sub">Carregando…</p></div>
  const c: DetalheCliente = d.dados
  const origem = c.intencoes.length ? c.intencoes[c.intencoes.length - 1].canal : null
  const wa = c.canais.find((x) => x.canal === 'whatsapp')?.identificador ?? c.cliente.telefone?.replace(/\D/g, '')
  const viaWhatsapp = origem === 'whatsapp' || (!c.cliente.tem_igsid && !!wa)
  const PASSOS = ['Interesse', 'Fila', 'Reserva', 'Dados', 'Pix', 'Pago']
  const passo = (s: string) => ({ fila: 1, reservada: 2, paga: 5 } as Record<string, number>)[s] ?? 0
  const perdida = (s: string) => ['expirou', 'cancelada', 'vendida_para_outra', 'descartada'].includes(s)
  const SIT: Record<string, string> = { reservada: 'Reservada', paga: 'Paga', expirou: 'Prazo venceu', cancelada: 'Cancelada', fila: 'Na fila',
                                        vendida_para_outra: 'Vendida para outra pessoa', descartada: 'Não registrada (já participava)' }
  return (
    <div className="painel v-det">
      <div className="v-det-topo">
        <span className="avatar v-avatar">{curto(c.cliente.nome, c.cliente.instagram).slice(0, 2).toUpperCase()}</span>
        <div>
          <h2>{c.cliente.nome ?? `@${c.cliente.instagram}`}</h2>
          <small className="mudo">{[c.cliente.instagram && `@${c.cliente.instagram}`, c.cliente.telefone].filter(Boolean).join(' · ')}</small>
          <div className="v-linha"><span className="mudo">Veio por</span><SeloCanal canal={origem} />
            {c.resumo && c.resumo.pedidos > 0 && <span className="selo">Cliente recorrente</span>}
            {c.cliente.bloqueado_ate && new Date(c.cliente.bloqueado_ate).getTime() > agora && <span className="selo selo-devolvida">Bloqueada</span>}</div>
        </div>
        <button className="icone" onClick={onFechar} aria-label="Fechar detalhe">×</button>
      </div>

      {c.resumo && <div className="resumo-faixa">
        <div><strong>{c.resumo.pedidos}</strong><span>Pedidos</span></div>
        <div><strong>{brl(Number(c.resumo.total_itens))}</strong><span>Total comprado</span></div>
        <div><strong>{c.resumo.reservas_expiradas}</strong><span>Reservas vencidas</span></div>
        <div><strong>{c.resumo.cancelamentos + c.resumo.devolucoes}</strong><span>Cancel. e devol.</span></div>
      </div>}

      <h3>Falar com a cliente</h3>
      <p className="sub">Responda pelo canal de onde ela veio ({viaWhatsapp ? 'WhatsApp' : 'Instagram'}). Pela Caixa de entrada a conversa fica registrada, com respostas prontas e o contexto da venda.</p>
      <div className="v-linha">
        {abrir && c.cliente.tem_igsid && <button onClick={() => abrir('atendimento', `cliente:${c.cliente.id}:instagram`)}>Caixa de entrada · Instagram</button>}
        {abrir && c.canais.some((x) => x.canal === 'whatsapp') && <button onClick={() => abrir('atendimento', `cliente:${c.cliente.id}:whatsapp`)}>Caixa de entrada · WhatsApp</button>}
        {wa && <a className={viaWhatsapp ? 'botao' : 'botao sec'} href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp{viaWhatsapp ? ' (origem)' : ''}</a>}
        {c.cliente.instagram && <a className={!viaWhatsapp ? 'botao' : 'botao sec'} href={`https://ig.me/m/${c.cliente.instagram}`} target="_blank" rel="noreferrer">Instagram Direct{!viaWhatsapp ? ' (origem)' : ''}</a>}
      </div>

      <h3>Intenções e reservas · últimos 90 dias</h3>
      {c.intencoes.length === 0 ? <p className="sub">Nenhuma intenção registrada.</p> : c.intencoes.map((i) => {
        const p = passo(i.situacao), perd = perdida(i.situacao)
        const s = i.expira_em ? restante(i.expira_em, agora) : null
        return (
          <div key={i.interesse_id} className="bloco">
            <div className="bloco-topo">
              <button className="link" onClick={() => onAbrirPeca(i.peca.item_id)}>{i.peca.nome} · {i.peca.tamanho}</button>
              <SeloCanal canal={i.canal} />
              <small className="mudo">{hora(i.em)}</small>
              {s !== null && <strong className={corTempo(s)} style={{ marginLeft: 'auto' }}>{mmss(s)}</strong>}
            </div>
            <div className="v-passos" aria-hidden="true">{PASSOS.map((n, k) => <i key={n} className={!perd && k <= p ? 'on' : ''} title={n} />)}</div>
            <small className={perd ? 'texto-erro' : 'mudo'}>{SIT[i.situacao] ?? i.situacao}{i.posicao ? ` · ${i.posicao}ª da fila` : ''} · {brl(i.peca.preco)}</small>
          </div>
        )
      })}

      {c.consentimentos.length > 0 && <p className="sub">Consentimentos: {c.consentimentos.map((x) => x.finalidade === 'marketing_whatsapp' ? 'novidades pelo WhatsApp' : x.finalidade === 'atendimento_pedido' ? 'atendimento do pedido' : x.finalidade).join(', ')}.</p>}
    </div>
  )
}

function Publicar({ ctx, onFechar, onPublicado }: { ctx: Contexto; onFechar: () => void; onPublicado: (item: string) => void }) {
  const [busca, setBusca] = useState('')
  const pecas = useCarregar(() => api.pecas(ctx.empresa, busca, 0, 20), [ctx.empresa, busca])
  const [peca, setPeca] = useState<PecaLinha | null>(null)
  const det = useCarregar<PecaDetalhe | null>(() => peca ? api.peca(ctx.empresa, peca.id) : Promise.resolve(null), [ctx.empresa, peca?.id])
  const [variacao, setVariacao] = useState('')
  const [preco, setPreco] = useState('')
  const [canais, setCanais] = useState<Canal[]>(['ig_feed', 'whatsapp'])
  useEffect(() => { setVariacao(det.dados?.variacoes[0]?.id ?? ''); setPreco(peca?.preco_tabela != null ? String(peca.preco_tabela).replace('.', ',') : '') }, [det.dados, peca])
  const alterna = (c: Canal) => setCanais((l) => l.includes(c) ? l.filter((x) => x !== c) : [...l, c])
  return (
    <Modal titulo="Publicar peça na vitrine" onFechar={onFechar} larga>
      {!peca ? (
        <div className="form">
          <Busca valor={busca} onMudar={setBusca} placeholder="Buscar peça por nome ou código" />
          {pecas.erro && <div className="erro">{pecas.erro}</div>}
          {pecas.dados && pecas.dados.length === 0 && <p className="sub">Nenhuma peça encontrada. Cadastre a peça na tela Peças.</p>}
          <ul className="lista-bling">
            {pecas.dados?.map((p) => (
              <li key={p.id}><span><strong>{p.nome}</strong> <small className="mudo">{p.codigo} · {p.qtd_disponiveis} disponível(is) · {brl(p.preco_tabela)}</small></span>
                <button className="sec" onClick={() => setPeca(p)}>Escolher</button></li>
            ))}
          </ul>
        </div>
      ) : (
        <Formulario enviarRotulo="Publicar e gerar link" onCancelar={onFechar} onEnviar={async () => {
          const v = preco.trim() ? Number(preco.replace(/\./g, '').replace(',', '.')) : null
          if (v !== null && (Number.isNaN(v) || v <= 0)) throw new Error('Preço inválido.')
          if (!variacao) throw new Error('Escolha o tamanho.')
          const r = await apiVendas.publicar(ctx.empresa, variacao, canais, v)
          onPublicado(r.item_id)
        }}>
          <div className="bloco-topo"><strong>{peca.nome}</strong><small className="mudo">{peca.codigo}</small><button type="button" className="link" onClick={() => setPeca(null)}>Trocar peça</button></div>
          {det.carregando && !det.dados && <p className="sub">Carregando tamanhos…</p>}
          {det.dados && det.dados.variacoes.length === 0 && <div className="erro">Esta peça não tem tamanhos (grade). Defina a grade na tela Peças.</div>}
          {det.dados && det.dados.variacoes.length > 0 && (
            <Campo rotulo="Tamanho" dica="Cada tamanho tem link e fila próprios.">
              <select value={variacao} onChange={(e) => setVariacao(e.target.value)}>
                {det.dados.variacoes.map((v) => <option key={v.id} value={v.id}>{v.tamanho} · {v.unidades.filter((u) => u.estado === 'disponivel').length} disponível(is)</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo="Preço na vitrine (R$)" dica="O mesmo em todos os canais. Em branco usa o preço de tabela."><input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} /></Campo>
          <fieldset className="grupo-form"><legend>Canais de divulgação</legend>
            <div className="chips">{CANAIS_PUBLICAVEIS.map((c) => <button type="button" key={c} className={canais.includes(c) ? 'chip sel' : 'chip'} onClick={() => alterna(c)}>{CANAIS[c].rotulo}</button>)}</div>
            <small className="mudo">Gera um link com a origem marcada para cada canal. A publicação nos perfis continua manual (a integração com a Meta ainda não foi liberada).</small>
          </fieldset>
        </Formulario>
      )}
    </Modal>
  )
}
