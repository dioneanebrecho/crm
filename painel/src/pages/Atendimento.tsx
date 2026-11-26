import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Contexto } from '../App'
import { AbaContexto, useEstadoTela } from '../abas'
import { supabase } from '../supabase'
import { api } from '../api'
import { Busca, Vazio, Titulo, useCarregar } from '../ui'
import {
  apiAtendimento, CANAL_CONVERSA, CANAL_INTERESSE, CATEGORIAS, ENTREGA, ETAPA_VENDA, FUNIL, MOTIVO_BLOQUEIO, ORIGEM, renderizarLocal,
  type Biblioteca, type CanalConversa, type ConversaLinha, type DetalheConversa, type FonteAtendimento, type Mensagem, type OrigemEntrada, type RespostaPronta,
} from '../apiAtendimento'
import { criarDemo } from './atendimentoDemo'
import { Roteiro } from '../roteiro'

// pedido 048: roteiro de treino do modo exemplo (os passos se marcam sozinhos)
const PASSOS_DEMO = [
  { id: 'abriu', texto: <>Abra a conversa da <strong>Mariana Costa</strong>: veio da live, o Pix não abriu. Veja à direita a etapa da venda e o histórico.</> },
  { id: 'assumiu', texto: <>Clique em <strong>Assumir</strong> numa conversa sem responsável.</> },
  { id: 'respondeu', texto: <>Responda a cliente. Digite <kbd>/</kbd> para usar uma resposta pronta (o envio aparece como “Simulada”).</> },
  { id: 'nota', texto: <>Deixe uma <strong>nota interna</strong> para a equipe (a cliente não vê).</> },
  { id: 'etiqueta', texto: <>Coloque uma <strong>etiqueta</strong> (ex.: Pagamento) para organizar a caixa.</> },
  { id: 'resolveu', texto: <><strong>Resolva</strong> ou <strong>adie</strong> uma conversa já atendida.</> },
  { id: 'bloqueou', texto: <>Abra <strong>@promo_seguidores_br</strong> (pede várias peças e manda spam) e clique em <strong>Bloquear</strong>, com o motivo.</> },
  { id: 'visao_bloqueio', texto: <>Clique na visão <strong>Bloqueados</strong>: quem está na lista fica fora das filas, só para consulta.</> },
  { id: 'tentativa', texto: <>Use <strong>Simular tentativa de pessoa bloqueada</strong> e veja o número de <strong>Tentativas bloqueadas</strong> subir.</> },
]

// Caixa de entrada: conversas de Instagram e WhatsApp numa tela só.
// A resposta sai pelo mesmo canal de onde a cliente escreveu. Respostas prontas com variáveis ({{cliente.primeiro_nome}}...).
// "Ver exemplo" troca a fonte por dados fictícios na memória (atendimentoDemo): nada é gravado nem enviado.
type Visao = 'todas' | 'minhas' | 'nao_atribuidas' | 'lista_bloqueio'
type FiltroEstado = '' | 'pendente' | 'adiada' | 'resolvida'
const Fonte = createContext<FonteAtendimento>(apiAtendimento)

const hora = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso), hoje = new Date()
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
const iniciais = (nome: string) => nome.replace('@', '').split(/[\s._]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || '?'
const duracao = (min: number) => min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${Math.floor(min / 1440)} d`
const restanteJanela = (iso: string | null) => {
  if (!iso) return null
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  return m > 0 ? duracao(m) : null
}
// tempo esperando resposta: até 5 min ok, até 15 min atenção, depois atrasada
const espera = (iso: string | null) => {
  if (!iso) return null
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return { texto: m < 1 ? 'agora' : `há ${duracao(m)}`, cls: m <= 5 ? 'ok' : m <= 15 ? 'atencao' : 'atrasada' }
}

function SeloCanal({ canal }: { canal: CanalConversa }) {
  const c = CANAL_CONVERSA[canal]
  return <span className="selo at-canal" style={{ background: c.cor, color: '#fff' }} title={c.rotulo}>{c.curto}</span>
}
const textoOrigem = (o: OrigemEntrada) => {
  const via = o.tipo === 'vitrine' && CANAL_INTERESSE[o.canal] ? ` · ${CANAL_INTERESSE[o.canal]}` : ''
  return `${ORIGEM[o.tipo].rotulo}${via}${o.peca ? ` #${o.peca}` : ''}`
}
function SeloOrigem({ o }: { o?: OrigemEntrada | null }) {
  if (!o) return null
  const d = ORIGEM[o.tipo]
  return <span className="selo at-origem" style={{ borderColor: d.cor }} title={d.dica}><i style={{ background: d.cor }} />{textoOrigem(o)}</span>
}

export default function Atendimento({ ctx, inicial, abrir }: { ctx: Contexto; inicial?: string; abrir?: (id: string, q?: string) => void }) {
  const podeResponder = ctx.perm === null
    ? ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor', 'suporte', 'apresentadora', 'expedicao', 'financeiro'].includes(p))
    : ctx.perm.atendimento === 'editar'
  const [visao, setVisao] = useEstadoTela<Visao>('atendimento.visao', 'todas')
  const [filtro, setFiltro] = useEstadoTela<FiltroEstado>('atendimento.estado', '')
  const [canal, setCanal] = useEstadoTela<string>('atendimento.canal', '')
  const [origem, setOrigem] = useEstadoTela<string>('atendimento.origem', '')
  const [busca, setBusca] = useEstadoTela('atendimento.busca', '')
  const [demo, setDemo] = useState(false)   // não fica lembrado: ao voltar à tela, sempre os dados reais
  const [sel, setSel] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [eu, setEu] = useState<{ id: string | null; nome: string }>({ id: null, nome: 'Você' })
  useEffect(() => {
    // nome do cadastro de usuários (o mesmo que aparece nas mensagens reais)
    api.me().then((m) => setEu({ id: m.usuario?.id ?? null, nome: m.usuario?.nome || m.usuario?.email?.split('@')[0] || 'Você' }))
      .catch(() => supabase.auth.getUser().then(({ data }) => setEu({ id: data.user?.id ?? null, nome: data.user?.email?.split('@')[0] ?? 'Você' })))
  }, [])
  const [feitos, setFeitos] = useState<Set<string>>(new Set())
  const [rodada, setRodada] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fonteDemo = useMemo(() => criarDemo(eu.id, eu.nome, (e) => setFeitos((f) => f.has(e) ? f : new Set(f).add(e))), [eu.id, eu.nome, rodada])
  const recomecarDemo = () => { setFeitos(new Set()); setRodada((r) => r + 1); setSel(null); limparFiltros(); setVersao((v) => v + 1) }
  const fonte = demo ? fonteDemo : apiAtendimento
  const limparFiltros = () => { setVisao('todas'); setFiltro(''); setCanal(''); setOrigem(''); setBusca('') }
  const filtrando = visao !== 'todas' || filtro !== '' || canal !== '' || origem !== '' || busca !== ''
  // ao ligar o exemplo, mostra tudo para a caixa aparecer cheia
  const alternarDemo = () => { if (!demo) recomecarDemo(); setDemo(!demo); setSel(null); setAviso(null) }

  const { ativa } = useContext(AbaContexto)
  // atualização automática a cada 5 s com a aba visível (mensagem nova, outra atendente respondeu)
  useEffect(() => { if (!ativa) return; setVersao((v) => v + 1); const t = setInterval(() => setVersao((v) => v + 1), 5000); return () => clearInterval(t) }, [ativa])
  // atalho de outra tela: "cliente:<id>[:canal]" abre (ou cria) a conversa da cliente
  useEffect(() => {
    if (!inicial) return
    if (inicial.startsWith('cliente:')) {
      const [, cliente, canalIni] = inicial.split(':')
      setDemo(false)
      apiAtendimento.abrir(ctx.empresa, cliente, (canalIni as CanalConversa) || 'instagram').then((r) => { setFiltro(''); setVisao('todas'); setSel(r.conversa_id) })
        .catch((e: Error) => setAviso(e.message))
    } else setSel(inicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial, ctx.empresa])

  const lista = useCarregar(() => fonte.conversas(ctx.empresa, visao, filtro || null, canal || null, busca), [ctx.empresa, visao, filtro, canal, busca, versao, demo])
  const resumo = useCarregar(() => fonte.resumo(ctx.empresa), [ctx.empresa, versao, demo])
  const canais = useCarregar(() => fonte.canais(ctx.empresa).catch(() => null), [ctx.empresa, versao, demo])
  const biblioteca = useCarregar(() => fonte.biblioteca(ctx.empresa), [ctx.empresa, demo])
  const r = resumo.dados
  const linhas = lista.dados ? lista.dados.filter((c) => !origem || c.origem_entrada?.tipo === origem) : null
  const cn = canais.dados
  const usoWa = cn ? Math.min(100, Math.round((cn.whatsapp_enviadas_mes / cn.franquia_whatsapp) * 100)) : 0

  return (
    <Fonte.Provider value={fonte}>
    <section className="at">
      <div className="topo">
        <div><Titulo ajuda={<>Todas as conversas numa caixa só. A resposta sai pelo canal de origem da cliente. Digite <kbd>/</kbd> na mensagem para usar uma resposta pronta. Atualiza sozinha a cada 5 segundos.</>}>Caixa de entrada</Titulo></div>
        <div className="at-topo-acoes">
          <button className={demo ? '' : 'sec'} onClick={alternarDemo} aria-pressed={demo} title="Mostra a tela com conversas fictícias para entender a visão. Nada é gravado nem enviado.">{demo ? 'Sair do exemplo' : 'Ver exemplo'}</button>
          {abrir && <button className="sec" onClick={() => abrir('respostas_prontas')}>Respostas prontas</button>}
        </div>
      </div>
      {demo && <div className="at-demo" role="status"><strong>Modo exemplo:</strong> conversas fictícias para visualizar a caixa populada. Nada é gravado no banco nem enviado às clientes; as respostas aparecem como "Simulada".</div>}
      {demo && <Roteiro titulo="Roteiro de treino · Caixa de entrada" passos={PASSOS_DEMO} feitos={feitos} onRecomecar={recomecarDemo}
        extra={<div className="acoes"><button type="button" className="sec" onClick={() => { fonteDemo.simularTentativa(); setVersao((v) => v + 1) }}>Simular tentativa de pessoa bloqueada</button></div>} />}
      {aviso && <div className="erro" role="alert">{aviso}</div>}

      <div className="resumo-faixa">
        <div className={r && r.nao_lidas > 0 ? 'v-alerta' : ''}><strong>{r?.nao_lidas ?? '—'}</strong><span>Não lidas</span></div>
        <div><strong>{r?.abertas ?? '—'}</strong><span>Abertas</span></div>
        <div><strong>{r?.nao_atribuidas ?? '—'}</strong><span>Sem responsável</span></div>
        <div><strong>{r?.minhas ?? '—'}</strong><span>Minhas</span></div>
        <div><strong>{r?.adiadas ?? '—'}</strong><span>Adiadas</span></div>
        <div title={r?.tentativas_bloqueadas ? `Últimos 30 dias: ${r.tentativas_bloqueadas.d30} tentativas de ${r.tentativas_bloqueadas.pessoas_d30} pessoa(s) · live ${r.tentativas_bloqueadas.por_origem.live ?? 0} · vitrine ${r.tentativas_bloqueadas.por_origem.vitrine ?? 0} · mensagens ${r.tentativas_bloqueadas.por_origem.mensagem ?? 0}` : undefined}>
          <strong>{r?.tentativas_bloqueadas?.d7 ?? '—'}</strong><span>Tentativas bloqueadas (7 dias)</span></div>
      </div>

      {cn && (
        <div className="at-canais">
          {(Object.keys(CANAL_CONVERSA) as CanalConversa[]).filter((k) => cn.por_canal[k] || k === 'instagram' || k === 'whatsapp').map((k) => (
            <button key={k} type="button" className={canal === k ? 'at-canal-card sel' : 'at-canal-card'} aria-pressed={canal === k} onClick={() => setCanal(canal === k ? '' : k)}>
              <SeloCanal canal={k} />
              <span><strong>{cn.por_canal[k]?.abertas ?? 0}</strong> em aberto</span>
              <small className="mudo">{cn.por_canal[k]?.entradas_30d ?? 0} mensagens recebidas em 30 dias</small>
            </button>))}
          <div className="at-franquia" title="A Meta dá 1.000 respostas grátis por número a cada mês; a contagem zera no dia 1º. Respostas pelo app WhatsApp Business não contam.">
            <span>WhatsApp: <strong>{cn.whatsapp_enviadas_mes}</strong> de {cn.franquia_whatsapp} respostas grátis no mês</span>
            <div className="at-barra" aria-hidden="true"><i className={usoWa >= 90 ? 'alto' : usoWa >= 70 ? 'medio' : ''} style={{ width: `${usoWa}%` }} /></div>
            <small className="mudo">{usoWa >= 90 ? 'Quase no limite: prefira responder pelo app Business.' : `Restam ${Math.max(0, cn.franquia_whatsapp - cn.whatsapp_enviadas_mes)} sem custo.`}</small>
          </div>
        </div>)}

      <div className="at-area">
        <aside className="at-lista painel">
          <div className="chips at-visao" role="group" aria-label="Visão">
            {([['todas', 'Todas'], ['minhas', 'Minhas'], ['nao_atribuidas', 'Sem responsável'], ['lista_bloqueio', `Bloqueados${r?.lista_bloqueio ? ` (${r.lista_bloqueio})` : ''}`]] as const).map(([id, rot]) => (
              <button key={id} className={visao === id ? 'chip sel' : 'chip'} aria-pressed={visao === id} onClick={() => setVisao(id)}
                      title={id === 'lista_bloqueio' ? 'Conversas de quem está na lista de bloqueio: ficam fora das filas, só para consulta' : undefined}>{rot}</button>))}
          </div>
          <Busca valor={busca} onMudar={setBusca} placeholder="Buscar por nome, @ ou mensagem" />
          <div className="chips at-chips">
            {([['', 'Ativas'], ['pendente', 'Pendentes'], ['adiada', 'Adiadas'], ['resolvida', 'Resolvidas']] as const).map(([id, rot]) => (
              <button key={id} className={filtro === id ? 'chip sel' : 'chip'} onClick={() => setFiltro(id)}>{rot}</button>))}
          </div>
          <div className="at-filtros">
            <select value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Canal">
              <option value="">Todos os canais</option>
              {(Object.keys(CANAL_CONVERSA) as CanalConversa[]).map((c) => <option key={c} value={c}>{CANAL_CONVERSA[c].rotulo}</option>)}
            </select>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
              <option value="">Todas as origens</option>
              {(Object.keys(ORIGEM) as OrigemEntrada['tipo'][]).map((o) => <option key={o} value={o}>{ORIGEM[o].rotulo}</option>)}
            </select>
          </div>
          <ListaConversas linhas={linhas} erro={lista.erro} sel={sel} onAbrir={(id) => { setSel(id); setAviso(null) }} filtrando={filtrando} onLimpar={limparFiltros} />
        </aside>

        {sel
          ? <Conversa key={`${demo}-${sel}`} ctx={ctx} id={sel} versao={versao} podeResponder={podeResponder} biblioteca={biblioteca.dados} meuId={eu.id}
                      onMudou={() => setVersao((v) => v + 1)} onFechar={() => setSel(null)} />
          : <div className="at-vazio painel"><Vazio titulo="Escolha uma conversa" texto="As mensagens novas aparecem no topo da lista. As que aguardam resposta ficam destacadas, com o tempo de espera." /></div>}
      </div>
    </section>
    </Fonte.Provider>
  )
}

function ListaConversas({ linhas, erro, sel, onAbrir, filtrando, onLimpar }: {
  linhas: ConversaLinha[] | null; erro: string | null; sel: string | null; onAbrir: (id: string) => void; filtrando: boolean; onLimpar: () => void
}) {
  if (erro) return <div className="erro">{erro}</div>
  if (!linhas) return <p className="sub">Carregando…</p>
  if (linhas.length === 0) return filtrando
    ? <Vazio titulo="Nenhuma conversa com esses filtros" texto="Há filtros aplicados (visão, situação, canal, origem ou busca)." acao={<button className="sec" onClick={onLimpar}>Limpar filtros</button>} />
    : <Vazio titulo="Nenhuma conversa aqui" texto='Quando uma cliente mandar mensagem no Direct ou no WhatsApp, ela aparece nesta lista. Para ver como fica, use "Ver exemplo".' />
  return (
    <ul className="at-conversas">
      {linhas.map((c) => {
        const aguarda = c.aguardando_resposta && c.estado !== 'resolvida'
        const e = aguarda ? espera(c.ultima_entrada_em) : null
        return (
          <li key={c.id}>
            <button className={['at-item', sel === c.id ? 'sel' : '', aguarda ? 'aguarda' : ''].join(' ')} onClick={() => onAbrir(c.id)}>
              <span className="at-avatar-canal"><span className="avatar">{iniciais(c.cliente_nome)}</span><i style={{ background: CANAL_CONVERSA[c.canal].cor }} title={CANAL_CONVERSA[c.canal].rotulo} /></span>
              <span className="at-item-corpo">
                <span className="at-item-topo"><strong>{c.cliente_nome}</strong><small className="mudo">{hora(c.ultima_mensagem_em)}</small></span>
                <span className="at-item-previa">{c.ultima_previa ?? 'Sem mensagens'}</span>
                <span className="at-item-selos">
                  <SeloCanal canal={c.canal} />
                  <SeloOrigem o={c.origem_entrada} />
                  {c.etapa_venda && <span className={`selo at-etapa-${c.etapa_venda}`}>{ETAPA_VENDA[c.etapa_venda]}</span>}
                  {c.estado === 'adiada' && <span className="selo">Adiada até {hora(c.adiada_ate)}</span>}
                  {c.estado === 'pendente' && <span className="selo">Pendente</span>}
                  {c.etiquetas.slice(0, 2).map((x) => <span key={x.id} className="selo" style={{ borderLeft: `3px solid ${x.cor}` }}>{x.nome}</span>)}
                </span>
                <span className="at-item-rodape">
                  {e ? <span className={`at-espera ${e.cls}`}>Aguardando resposta {e.texto}</span> : <span />}
                  {c.atendente_nome ? <small className="mudo">{c.atendente_nome}</small> : <small className="at-sem-dono">sem responsável</small>}
                </span>
              </span>
              {c.nao_lidas > 0 && <span className="at-badge">{c.nao_lidas}</span>}
            </button>
          </li>)
      })}
    </ul>
  )
}

function Conversa({ ctx, id, versao, podeResponder, biblioteca, meuId, onMudou, onFechar }: {
  ctx: Contexto; id: string; versao: number; podeResponder: boolean; biblioteca: Biblioteca | null; meuId: string | null; onMudou: () => void; onFechar: () => void
}) {
  const fonte = useContext(Fonte)
  const d = useCarregar(() => fonte.conversa(ctx.empresa, id, podeResponder), [ctx.empresa, id, versao, fonte])
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [bloqueando, setBloqueando] = useState(false)
  const [motivoBloq, setMotivoBloq] = useState('')
  const podeBloquear = fonte !== apiAtendimento || ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor'].includes(p))
  const fim = useRef<HTMLDivElement>(null)
  const qtd = d.dados?.mensagens.length ?? 0
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [qtd, id])

  if (d.erro) return <div className="at-conversa painel"><div className="erro">{d.erro}</div></div>
  if (!d.dados) return <div className="at-conversa painel"><p className="sub">Carregando…</p></div>
  const c: DetalheConversa = d.dados
  const nome = c.cliente.nome || (c.cliente.instagram ? `@${c.cliente.instagram}` : 'Cliente sem nome')
  const acao = async (a: string, v: string | null = null) => {
    setErroAcao(null)
    try { await fonte.acao(ctx.empresa, id, a, v); onMudou() } catch (e) { setErroAcao((e as Error).message) }
  }
  const adiar = (horas: number | 'amanha') => {
    const t = new Date()
    if (horas === 'amanha') { t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0) } else t.setTime(t.getTime() + horas * 3600_000)
    acao('adiar', t.toISOString())
  }
  const ehMinha = !!meuId && c.conversa.atendente_id === meuId
  const o = c.origem_entrada

  return (
    <>
      <div className="at-conversa painel">
        <div className="at-conv-topo">
          <span className="at-avatar-canal"><span className="avatar">{iniciais(nome)}</span><i style={{ background: CANAL_CONVERSA[c.conversa.canal].cor }} /></span>
          <div className="at-conv-id">
            <h2>{nome}</h2>
            <small className="mudo">
              {CANAL_CONVERSA[c.conversa.canal].rotulo}{c.cliente.instagram && ` · @${c.cliente.instagram}`}
              {' · '}{c.conversa.atendente_nome ? `Com ${c.conversa.atendente_nome}` : 'Sem responsável'}
            </small>
          </div>
          {podeResponder && (
            <div className="at-conv-acoes">
              {!ehMinha && <button className="sec" onClick={() => acao('assumir')}>Assumir</button>}
              {c.conversa.estado !== 'resolvida' && <>
                {c.conversa.estado !== 'pendente' && <button className="sec" onClick={() => acao('estado', 'pendente')} title="Aguardando algo da cliente ou da equipe">Pendente</button>}
                <select className="at-adiar" value="" onChange={(e) => { const v = e.target.value; if (v) adiar(v === 'amanha' ? 'amanha' : Number(v)) }} aria-label="Adiar">
                  <option value="">Adiar…</option><option value="1">1 hora</option><option value="3">3 horas</option><option value="amanha">Amanhã 9h</option>
                </select>
                <button onClick={() => acao('estado', 'resolvida')}>Resolver</button>
              </>}
              {c.conversa.estado === 'resolvida' && !c.conversa.lista_bloqueio && <button className="sec" onClick={() => acao('estado', 'aberta')}>Reabrir</button>}
              {podeBloquear && (c.conversa.lista_bloqueio
                ? <button className="sec" onClick={() => acao('desbloquear')} title="Tira da lista de bloqueio: volta a entrar na live, vitrine e filas">Desbloquear</button>
                : <button className="sec" onClick={() => setBloqueando(!bloqueando)} title="Coloca na lista de bloqueio: ignorada na live, vitrine e mensagens">Bloquear</button>)}
            </div>)}
          <button className="icone" onClick={onFechar} aria-label="Fechar conversa">×</button>
        </div>
        {o && (
          <div className="at-origem-faixa" style={{ borderLeftColor: ORIGEM[o.tipo].cor }}>
            <strong>Como chegou:</strong> {ORIGEM[o.tipo].dica}{o.peca ? ` · peça #${o.peca}` : ''}{o.tipo === 'vitrine' && CANAL_INTERESSE[o.canal] ? ` · link postado em ${CANAL_INTERESSE[o.canal]}` : ''}
          </div>)}
        {c.conversa.em_atendimento_por && <div className="at-presenca">{c.conversa.em_atendimento_por} está com esta conversa aberta agora. Combine antes de responder para não duplicar.</div>}
        {c.conversa.lista_bloqueio && <div className="at-presenca">Na lista de bloqueio: as mensagens ficam registradas e contam como tentativa, mas a conversa não entra nas filas e a pessoa não entra na live nem na vitrine.</div>}
        {bloqueando && !c.conversa.lista_bloqueio && <form className="form-contato" onSubmit={(e) => { e.preventDefault(); acao('bloquear', motivoBloq.trim()).then(() => { setBloqueando(false); setMotivoBloq('') }) }}>
          <input value={motivoBloq} onChange={(e) => setMotivoBloq(e.target.value)} placeholder="Motivo do bloqueio (ex.: reserva e não paga, spam)" autoFocus aria-label="Motivo do bloqueio" />
          <button type="submit" disabled={motivoBloq.trim().length < 3}>Confirmar bloqueio</button><button type="button" className="sec" onClick={() => setBloqueando(false)}>Cancelar</button>
        </form>}
        {erroAcao && <div className="erro" role="alert">{erroAcao}</div>}

        <div className="at-mensagens">
          {c.mensagens.length === 0 && <p className="sub at-centro">Ainda não há mensagens. Ao responder, a conversa começa pelo canal da cliente.</p>}
          {c.mensagens.map((m) => <Balao key={m.id} m={m} />)}
          <div ref={fim} />
        </div>

        {podeResponder
          ? <Compositor ctx={ctx} c={c} biblioteca={biblioteca} onEnviado={onMudou} />
          : <p className="sub at-centro">Você tem acesso só de leitura a esta caixa.</p>}
      </div>
      <Contexto360 c={c} podeEditar={podeResponder} etiquetas={biblioteca?.etiquetas ?? []} onAcao={acao} />
    </>
  )
}

function Balao({ m }: { m: Mensagem }) {
  const lado = m.direcao === 'entrada' ? 'at-m-entrada' : m.direcao === 'nota' ? 'at-m-nota' : 'at-m-saida'   // nomes próprios: .entrada já existe no CSS global
  const autor = m.direcao === 'entrada' ? null
    : m.direcao === 'nota' ? `Nota interna · ${m.autor_nome ?? ''}`
    : m.autor_tipo === 'app_nativo' ? 'Pelo app' : m.autor_tipo === 'automacao' ? 'Resposta automática' : m.autor_nome
  const motivo = m.erro?.motivo ? MOTIVO_BLOQUEIO[m.erro.motivo] ?? m.erro.motivo : m.erro?.detalhe
  return (
    <div className={`at-msg ${lado}${m.autor_tipo === 'automacao' ? ' auto' : ''}`}>
      {autor && <small className="at-msg-autor">{autor}{m.resposta_pronta && <span className="at-atalho">/{m.resposta_pronta}</span>}</small>}
      {m.conteudo && <div className="at-msg-texto">{m.conteudo}</div>}
      {m.tipo !== 'texto' && (
        <div className="at-msg-midia">
          {m.midia.map((x, i) => x.payload?.url
            ? <a key={i} href={x.payload.url} target="_blank" rel="noreferrer">Abrir {x.type ?? 'anexo'}</a>
            : <span key={i} className="mudo">[{m.tipo}]</span>)}
          {m.midia.length === 0 && <span className="mudo">[{m.tipo}]</span>}
        </div>)}
      <small className="at-msg-pe">
        {hora(m.criado_em)}
        {m.direcao === 'saida' && ENTREGA[m.estado_entrega] && <span className={`at-entrega ${m.estado_entrega}`}> · {ENTREGA[m.estado_entrega]}</span>}
      </small>
      {(m.estado_entrega === 'bloqueada' || m.estado_entrega === 'erro') && motivo && <small className="texto-erro">Motivo: {motivo}</small>}
    </div>
  )
}

function Compositor({ ctx, c, biblioteca, onEnviado }: { ctx: Contexto; c: DetalheConversa; biblioteca: Biblioteca | null; onEnviado: () => void }) {
  const fonte = useContext(Fonte)
  const [texto, setTexto] = useState('')
  const [respostaId, setRespostaId] = useState<string | null>(null)
  const [nota, setNota] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [catalogo, setCatalogo] = useState(false)
  const [indice, setIndice] = useState(0)
  const campo = useRef<HTMLTextAreaElement>(null)

  // respostas do canal; as que têm todos os dados desta cliente vêm primeiro
  const respostas = useMemo(() => (biblioteca?.respostas ?? [])
    .filter((r) => r.ativo && (!r.canais || r.canais.includes(c.conversa.canal)))
    .map((r) => ({ r, falta: renderizarLocal(r.corpo, c.variaveis).faltantes.length }))
    .sort((a, b) => (a.falta > 0 ? 1 : 0) - (b.falta > 0 ? 1 : 0))
    .map((x) => x.r), [biblioteca, c.conversa.canal, c.variaveis])
  const faltaTexto = (chaves: string[]) => explicarFaltas(chaves, biblioteca)
  // "/" no início abre a busca por atalho
  const termo = texto.startsWith('/') && !texto.includes(' ') ? texto.slice(1).toLowerCase() : null
  const sugestoes = termo !== null ? respostas.filter((r) => r.atalho.includes(termo) || r.titulo.toLowerCase().includes(termo)).slice(0, 8) : []
  const previa = useMemo(() => /\{\{/.test(texto) ? renderizarLocal(texto, c.variaveis) : null, [texto, c.variaveis])

  const janelaAberta = c.conversa.janela_aberta
  const humano = !janelaAberta && c.conversa.canal === 'instagram' && !!c.conversa.janela_humana_ate && new Date(c.conversa.janela_humana_ate).getTime() > Date.now()
  const bloqueadoJanela = !nota && !janelaAberta && !humano && c.mensagens.some((m) => m.direcao === 'entrada')
  const semEntrada = !c.mensagens.some((m) => m.direcao === 'entrada')
  const canalRot = CANAL_CONVERSA[c.conversa.canal]

  const usar = (r: RespostaPronta) => { setTexto(r.corpo); setRespostaId(r.id); setCatalogo(false); setIndice(0); setTimeout(() => campo.current?.focus(), 0) }
  async function enviar() {
    if (!texto.trim() || enviando) return
    if (!nota && previa && previa.faltantes.length > 0) { setErro(`Não dá para enviar: ${faltaTexto(previa.faltantes)}. Ajuste o texto ou escolha outra resposta.`); return }
    setEnviando(true); setErro(null); setInfo(null)
    try {
      const r = await fonte.enviar(ctx.empresa, c.conversa.id, texto, respostaId, nota)
      if (r.estado_entrega === 'bloqueada') setInfo(`Mensagem registrada, mas não enviada: ${MOTIVO_BLOQUEIO[r.erro?.motivo ?? ''] ?? 'canal indisponível'}.`)
      else if (r.estado_entrega === 'simulada') setInfo('Simulada: a mensagem foi registrada e não saiu para a cliente.')
      else if (r.human_agent) setInfo('Enviada fora das 24 h, com a etiqueta de atendimento humano do Instagram.')
      setTexto(''); setRespostaId(null); setNota(false); onEnviado()
    } catch (e) { setErro((e as Error).message) } finally { setEnviando(false) }
  }
  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugestoes.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => (i + 1) % sugestoes.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => (i - 1 + sugestoes.length) % sugestoes.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); usar(sugestoes[Math.min(indice, sugestoes.length - 1)]); return }
      if (e.key === 'Escape') { setTexto(''); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
  }

  return (
    <div className={nota ? 'at-compositor nota' : 'at-compositor'}>
      <div className="at-respondendo">
        <i style={{ background: nota ? 'var(--aviso)' : canalRot.cor }} />
        {nota ? 'Nota interna: só a equipe vê' : <>Respondendo pelo <strong>{canalRot.rotulo}</strong></>}
        {!nota && janelaAberta && <span className="mudo"> · janela aberta por mais {restanteJanela(c.conversa.janela_ate)}</span>}
      </div>
      {!nota && semEntrada && c.conversa.canal === 'instagram' && <div className="at-janela">A cliente ainda não escreveu nesta conversa. O Instagram só permite responder depois que ela mandar uma mensagem.</div>}
      {!nota && humano && <div className="at-janela">Passaram 24 h da última mensagem da cliente. A resposta sai com a etiqueta de atendimento humano (vale até {hora(c.conversa.janela_humana_ate)}).</div>}
      {bloqueadoJanela && <div className="at-janela erro">Janela de resposta fechada: espere a cliente escrever de novo{c.conversa.canal === 'whatsapp' ? ' ou use um modelo aprovado do WhatsApp' : ''}. Você ainda pode deixar uma nota interna.</div>}

      {sugestoes.length > 0 && (
        <ul className="at-sugestoes" role="listbox">
          {sugestoes.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === indice} className={i === indice ? 'sel' : ''} onMouseDown={(e) => { e.preventDefault(); usar(r) }}>
              <strong>/{r.atalho}</strong> <span>{r.titulo}</span>
              {(() => { const p = renderizarLocal(r.corpo, c.variaveis)
                return p.faltantes.length ? <small className="texto-erro">Não cabe agora: {faltaTexto(p.faltantes)}</small> : <small className="mudo">{p.texto}</small> })()}
            </li>))}
        </ul>)}

      <textarea ref={campo} rows={3} value={texto} maxLength={1000} disabled={bloqueadoJanela}
                placeholder={nota ? 'Nota interna (só a equipe vê)…' : 'Escreva a resposta. Digite / para usar uma resposta pronta. Enter envia, Shift+Enter quebra a linha.'}
                onChange={(e) => { setTexto(e.target.value); setIndice(0); if (!e.target.value) setRespostaId(null) }} onKeyDown={teclas} />

      {previa && !nota && (
        <div className="at-previa">
          <small className="mudo">Como a cliente vai receber:</small>
          <div>{previa.texto}</div>
          {previa.faltantes.length > 0 && <small className="texto-erro">Faltam dados desta cliente: {faltaTexto(previa.faltantes)}. Ajuste o texto ou escolha outra resposta.</small>}
        </div>)}

      {erro && <div className="erro" role="alert">{erro}</div>}
      {info && <div className="info" role="status">{info}</div>}

      <div className="at-comp-barra">
        <button type="button" className="sec" onClick={() => setCatalogo((v) => !v)} aria-expanded={catalogo}>Respostas prontas</button>
        <label className="at-nota"><input type="checkbox" checked={nota} onChange={(e) => setNota(e.target.checked)} /> Nota interna</label>
        <small className="mudo">{texto.length}/1000</small>
        <button type="button" onClick={enviar} disabled={enviando || !texto.trim() || bloqueadoJanela || (!!previa && previa.faltantes.length > 0 && !nota)}>
          {enviando ? 'Enviando…' : nota ? 'Salvar nota' : 'Enviar'}
        </button>
      </div>

      {catalogo && <Catalogo respostas={respostas} variaveis={c.variaveis} onUsar={usar} explicar={faltaTexto} />}
    </div>
  )
}

// Variáveis sem valor em linguagem da operação: "Pix ainda não gerado" em vez de {{cobranca.valor}}
const MOTIVO_GRUPO: Record<string, string> = {
  'Reserva': 'a cliente não tem reserva ativa', 'Fila': 'a cliente não está em nenhuma fila', 'Cobrança': 'o Pix ainda não foi gerado',
  'Pedido': 'a cliente ainda não tem pedido', 'Envio': 'o pedido ainda não foi enviado (sem rastreio)',
  'Cliente': 'falta nome ou @ da cliente no cadastro', 'Atendente': 'falta o seu nome no cadastro de usuários', 'Empresa': 'falta o nome da loja',
}
function explicarFaltas(chaves: string[], b: Biblioteca | null) {
  const grupos = [...new Set(chaves.map((k) => b?.variaveis.find((v) => v.chave === k)?.grupo ?? k))]
  return grupos.map((g) => MOTIVO_GRUPO[g] ?? `sem valor para ${g}`).join('; ')
}

function Catalogo({ respostas, variaveis, onUsar, explicar }: {
  respostas: RespostaPronta[]; variaveis: Record<string, string>; onUsar: (r: RespostaPronta) => void; explicar: (chaves: string[]) => string
}) {
  const [q, setQ] = useState('')
  const filtradas = respostas.filter((r) => !q || (r.atalho + ' ' + r.titulo + ' ' + r.corpo).toLowerCase().includes(q.toLowerCase()))
  const grupos = (Object.keys(CATEGORIAS) as (keyof typeof CATEGORIAS)[]).map((k) => ({ k, itens: filtradas.filter((r) => r.categoria === k) })).filter((g) => g.itens.length)
  return (
    <div className="at-catalogo">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar resposta pronta" autoFocus />
      {grupos.length === 0 && <p className="sub">Nenhuma resposta encontrada.</p>}
      {grupos.map((g) => (
        <div key={g.k}>
          <h4>{CATEGORIAS[g.k]}</h4>
          {g.itens.map((r) => {
            const p = renderizarLocal(r.corpo, variaveis)
            return (
              <button key={r.id} className={p.faltantes.length ? 'at-resp incompleta' : 'at-resp'} onClick={() => onUsar(r)}>
                <span><strong>/{r.atalho}</strong> {r.titulo}</span>
                <small>{p.texto}</small>
                {p.faltantes.length > 0 && <small className="texto-erro">Não cabe agora: {explicar(p.faltantes)}</small>}
              </button>)
          })}
        </div>))}
    </div>
  )
}

function Contexto360({ c, podeEditar, etiquetas, onAcao }: {
  c: DetalheConversa; podeEditar: boolean; etiquetas: { id: string; nome: string; cor: string }[]; onAcao: (a: string, v: string) => void
}) {
  const v = c.variaveis
  const passo = c.etapa_venda ? FUNIL.findIndex((f) => f.id === c.etapa_venda) : -1
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const livres = etiquetas.filter((e) => !c.etiquetas.some((x) => x.id === e.id))
  const Bloco = ({ titulo, linhas }: { titulo: string; linhas: [string, string | undefined][] }) => {
    const l = linhas.filter(([, x]) => x)
    if (!l.length) return null
    return <div className="at-bloco"><h4>{titulo}</h4><dl>{l.map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x?.startsWith('http') ? <a href={x} target="_blank" rel="noreferrer">abrir link</a> : x}</dd></div>)}</dl></div>
  }
  return (
    <aside className="at-contexto painel">
      <h3>Cliente</h3>
      <dl className="at-dados">
        {c.cliente.nome && <div><dt>Nome</dt><dd>{c.cliente.nome}</dd></div>}
        {c.cliente.instagram && <div><dt>Instagram</dt><dd>@{c.cliente.instagram}</dd></div>}
        {c.cliente.telefone && <div><dt>WhatsApp</dt><dd>{c.cliente.telefone}</dd></div>}
        {c.cliente.email && <div><dt>E-mail</dt><dd>{c.cliente.email}</dd></div>}
      </dl>
      {c.cliente.canais.length > 1 && <p className="sub">Fala com a loja por {c.cliente.canais.map((x) => CANAL_CONVERSA[x.canal as CanalConversa]?.rotulo ?? x.canal).join(' e ')}.</p>}
      {c.cliente.observacao && <p className="sub at-obs">{c.cliente.observacao}</p>}

      <h3>Etapa da venda</h3>
      <div className="at-funil" aria-label="Funil da venda">
        {FUNIL.map((f, i) => <span key={f.id} className={i <= passo ? 'on' : ''} title={f.rotulo}><i />{f.rotulo}</span>)}
      </div>
      {passo < 0 && <p className="sub">Sem reserva, fila ou pedido nos últimos 30 dias.</p>}

      <Bloco titulo="Reserva ativa" linhas={[['Peça', v['reserva.peca'] && `${v['reserva.peca']} · ${v['reserva.descricao'] ?? ''}`], ['Valor', v['reserva.valor']],
        ['Vence', v['reserva.expira_em'] && `${v['reserva.expira_em']}${v['reserva.minutos_restantes'] ? ` (${v['reserva.minutos_restantes']} min)` : ''}`], ['Link', v['reserva.link']]]} />
      <Bloco titulo="Fila" linhas={[['Peça', v['fila.peca']], ['Posição', v['fila.posicao'] && `${v['fila.posicao']}ª`]]} />
      <Bloco titulo="Pix / cobrança" linhas={[['Valor', v['cobranca.valor']], ['Vence', v['cobranca.expira_em']], ['Link', v['cobranca.link']]]} />
      <Bloco titulo="Último pedido" linhas={[['Número', v['pedido.numero']], ['Situação', v['pedido.situacao']], ['Valor', v['pedido.valor']]]} />
      <Bloco titulo="Entrega" linhas={[['Transportadora', v['envio.transportadora']], ['Rastreio', v['envio.codigo_rastreio']], ['Situação', v['envio.situacao']], ['Acompanhar', v['envio.link_rastreio']]]} />

      <div className="resumo-faixa at-hist">
        <div><strong>{c.historico.pedidos}</strong><span>Pedidos</span></div>
        <div><strong>{brl(Number(c.historico.total_comprado))}</strong><span>Comprado</span></div>
        <div><strong>{c.historico.reservas_vencidas}</strong><span>Reservas vencidas</span></div>
        <div><strong>{c.historico.cancelamentos}</strong><span>Cancelamentos</span></div>
      </div>

      <h3>Etiquetas</h3>
      <div className="at-etiquetas">
        {c.etiquetas.map((e) => (
          <span key={e.id} className="selo" style={{ borderLeft: `3px solid ${e.cor}` }}>
            {e.nome}{podeEditar && <button className="link" aria-label={`Tirar ${e.nome}`} onClick={() => onAcao('etiqueta_rem', e.id)}>×</button>}
          </span>))}
        {c.etiquetas.length === 0 && <span className="mudo">Nenhuma</span>}
      </div>
      {podeEditar && livres.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onAcao('etiqueta_add', e.target.value)} aria-label="Adicionar etiqueta">
          <option value="">+ Adicionar etiqueta</option>
          {livres.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>)}
    </aside>
  )
}
