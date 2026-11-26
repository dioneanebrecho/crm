import { useEffect, useMemo, useState } from 'react'
import Calendario, { chaveDia, type EventoCal, type Visao } from '../Calendario'
import { Abas, Campo, Formulario, Modal, Vazio, Titulo, Busca, useCarregar } from '../ui'
import { api, data as dataHora, type ClienteLinha, type Papel } from '../api'
import { supabase } from '../supabase'
import {
  apiAgenda, compromissoDoLink, hora, diaCurto, ESTADO_COMPROMISSO, TIPOS, CANAIS, MOTIVOS_ENCERRAR,
  situacao, ROTULO_SITUACAO, relativo, ouvirMudanca, type Situacao,
  type Compromisso, type DadosCompromisso, type TipoCompromisso, type Prioridade, type ConfigAgenda,
} from '../apiAgenda'
import type { Contexto } from '../App'
import './agenda.css'

// Pedido 045: Agenda de compromissos. Todos os papéis operacionais criam e atribuem entre si (decisão 1);
// follow-up e pós-venda só ficam "resolvidos" com resposta da cliente registrada (decisão 2);
// lembrete no painel e convite de calendário por e-mail (decisão 3).
const EDITORES: Papel[] = ['superadmin', 'admin', 'gestor', 'apresentadora', 'suporte', 'expedicao', 'financeiro']
type Aba = 'fila' | 'calendario' | 'config'

const aberto = (c: Compromisso) => c.estado === 'pendente' || c.estado === 'aguardando_cliente'

/** Relógio da tela: muda a cada 30 s para o "atrasado" e o "começa em breve" acompanharem a hora sem recarregar. */
function useAgora(ms = 30000) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return agora
}

export default function Agenda({ ctx, inicial }: { ctx: Contexto; inicial?: { q: string; n: number } }) {
  const pode = ctx.papeis.some((p) => EDITORES.includes(p)) && (ctx.perm === null || ctx.perm.agenda === 'editar')
  const gestor = ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor'].includes(p))
  const [aba, setAba] = useState<Aba>('fila')
  const [eu, setEu] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [detalhe, setDetalhe] = useState<string | null>(compromissoDoLink ?? null)
  const [form, setForm] = useState<{ inicial: Compromisso | null; dia: string; hora?: number } | null>(null)
  const { dados: pessoas } = useCarregar(() => apiAgenda.responsaveis(ctx.empresa), [ctx.empresa])
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEu(data.user?.id ?? null)) }, [])
  const mudou = () => setVersao((v) => v + 1)
  // qualquer gravação na agenda (inclusive pelo lembrete em outra tela) recarrega as listas
  useEffect(() => ouvirMudanca(() => setVersao((v) => v + 1)), [])
  // aberto pelo lembrete global: "c:<id>"
  useEffect(() => {
    if (!inicial) return
    if (inicial.q.startsWith('c:')) { setForm(null); setDetalhe(inicial.q.slice(2)) }
    else if (inicial.q === 'fila') setAba('fila')
  }, [inicial])
  const [aviso, setAviso] = useState<{ texto: string; desfazer?: () => Promise<void> } | null>(null)
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 8000); return () => clearTimeout(t) }, [aviso])

  return (
    <section>
      <div className="topo">
        <div><Titulo ajuda={<>Compromissos da operação: lives, follow-up de cliente, pós-venda, lembretes e tarefas. Qualquer pessoa da
          equipe pode criar e atribuir a outra. Follow-up e pós-venda só são resolvidos com a resposta da cliente registrada;
          sem resposta, encerre com motivo. Com o convite ligado, cada compromisso chega ao e-mail do responsável para entrar no calendário.</>}>Agenda</Titulo></div>
        {pode && <button onClick={() => setForm({ inicial: null, dia: chaveDia(new Date()) })}>+ Novo compromisso</button>}
      </div>
      <Abas abas={[
        { id: 'fila' as Aba, rotulo: 'Minha fila' }, { id: 'calendario' as Aba, rotulo: 'Calendário' },
        ...(gestor ? [{ id: 'config' as Aba, rotulo: 'Configuração' }] : []),
      ]} ativa={aba} onMudar={setAba} />
      {aba === 'fila' && <MinhaFilaView ctx={ctx} versao={versao} onAbrir={setDetalhe} />}
      {aba === 'calendario' && <CalendarioView ctx={ctx} eu={eu} pode={pode} versao={versao} onAbrir={setDetalhe}
                                               onNovo={(dia, hora) => setForm({ inicial: null, dia, hora })}
                                               onEditar={(c) => setForm({ inicial: c, dia: chaveDia(new Date(c.inicio_em)) })}
                                               onAviso={setAviso} />}
      {aviso && (
        <div className="ag-toast" role="status">
          <span>{aviso.texto}</span>
          {aviso.desfazer && <button className="link" onClick={() => { const f = aviso.desfazer!; setAviso(null); f().catch((e: Error) => setAviso({ texto: e.message })) }}>Desfazer</button>}
          <button className="icone" aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button>
        </div>
      )}
      {aba === 'config' && gestor && <ConfigView ctx={ctx} />}
      {form && <FormCompromisso ctx={ctx} pessoas={pessoas ?? []} eu={eu} inicial={form.inicial} dia={form.dia} hora={form.hora}
                                onFechar={() => setForm(null)} onSalvo={(id) => { setForm(null); mudou(); setDetalhe(id) }}
                                onDetalhe={form.inicial ? () => { const id = form.inicial!.id; setForm(null); setDetalhe(id) } : undefined} />}
      {detalhe && !form && <Detalhe ctx={ctx} id={detalhe} pode={pode} versao={versao} onFechar={() => setDetalhe(null)} onMudou={mudou}
                                    onEditar={(c) => setForm({ inicial: c, dia: chaveDia(new Date(c.inicio_em)) })} />}
    </section>
  )
}

// ---------------------------------------------------------------------------- Minha fila
function MinhaFilaView({ ctx, versao, onAbrir }: { ctx: Contexto; versao: number; onAbrir: (id: string) => void }) {
  const { dados, erro, carregando } = useCarregar(() => apiAgenda.minhaFila(ctx.empresa), [ctx.empresa, versao])
  const agora = useAgora()
  if (erro) return <div className="erro">{erro}</div>
  if (carregando && !dados) return <p className="sub">Carregando…</p>
  if (!dados) return null
  const total = dados.atrasados.length + dados.hoje.length + dados.aguardando_cliente.length + dados.proximos.length
  if (total === 0) return <Vazio titulo="Nada na sua fila" texto="Quando alguém criar um compromisso para você, ou você criar um, ele aparece aqui." />
  const bloco = (titulo: string, itens: Compromisso[], cls = '') => itens.length > 0 && (
    <div className={`ag-bloco ${cls}`}>
      <h3>{titulo} <span>{itens.length}</span></h3>
      <ul className="ag-lista">{itens.map((c) => <ItemLista key={c.id} c={c} comDia agora={agora} onAbrir={onAbrir} />)}</ul>
    </div>
  )
  return (
    <>
    <Legenda />
    <div className="ag-fila">
      {bloco('Atrasados', dados.atrasados, 'urgente')}
      {bloco('Hoje', dados.hoje)}
      {bloco('Aguardando cliente', dados.aguardando_cliente, 'espera')}
      {bloco('Próximos 7 dias', dados.proximos)}
    </div>
    </>
  )
}

function ItemLista({ c, comDia = false, agora, onAbrir }: { c: Compromisso; comDia?: boolean; agora: number; onAbrir: (id: string) => void }) {
  const st = situacao(c, agora)
  return (
    <li>
      <button type="button" className={`ag-item st-${st}${aberto(c) ? '' : ' concluido'}`} onClick={() => onAbrir(c.id)}
              title={st === 'em_breve' ? `Começa ${relativo(c.inicio_em, agora)}` : ROTULO_SITUACAO[st]}>
        <span className={`ag-marca ag-cor-${c.cor}`} aria-hidden />
        <span className="ag-quando">{comDia && <small>{diaCurto(c.inicio_em)}</small>}{c.dia_inteiro ? 'Dia todo' : hora(c.inicio_em)}</span>
        <span className="ag-corpo">
          <strong>{c.prioridade === 'alta' && <em className="ag-alta">Alta</em>}{c.titulo}</strong>
          <small>{c.tipo_nome}{c.cliente_nome ? ` · ${c.cliente_nome}` : ''} · {c.responsavel_nome ?? '—'}
            {c.exige_interacao_cliente && aberto(c) && ` · ${c.qtd_tentativas} tentativa(s)${c.teve_resposta ? ', respondeu' : ''}`}</small>
        </span>
        <span className={`ag-estado ag-est-${c.estado} st-${st}`}>{st === 'atrasado' ? 'Atrasado' : st === 'em_breve' ? relativo(c.inicio_em, agora) : ESTADO_COMPROMISSO[c.estado]}</span>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------- Legenda
const LEGENDA: Situacao[] = ['atrasado', 'em_breve', 'aguardando', 'normal', 'concluido']
function Legenda({ arrastar = false }: { arrastar?: boolean }) {
  return (
    <div className="ag-legenda" aria-label="Legenda">
      {LEGENDA.map((s) => <span key={s} className="ag-leg-item"><span className={`ag-leg-amostra st-${s}`} aria-hidden />{ROTULO_SITUACAO[s]}{s === 'em_breve' ? ` (até 30 min)` : ''}</span>)}
      {arrastar && <span className="ag-leg-dica">Clique num espaço vazio para incluir; clique no compromisso para editar; arraste para outro dia (ou outra hora, na visão Dia) para remarcar.</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------- Calendário
type AvisoAgenda = { texto: string; desfazer?: () => Promise<void> }
function CalendarioView({ ctx, eu, pode, versao, onAbrir, onNovo, onEditar, onAviso }: {
  ctx: Contexto; eu: string | null; pode: boolean; versao: number; onAbrir: (id: string) => void; onNovo: (dia: string, hora?: number) => void
  onEditar: (c: Compromisso) => void; onAviso: (a: AvisoAgenda) => void
}) {
  const agora = useAgora()
  const [dia, setDia] = useState(chaveDia(new Date()))
  const [visao, setVisaoEstado] = useState<Visao>(() => { try { const v = localStorage.getItem('ane.agenda.visao'); return v === 'dia' || v === 'semana' ? v : 'mes' } catch { return 'mes' } })
  const setVisao = (v: Visao) => { setVisaoEstado(v); try { localStorage.setItem('ane.agenda.visao', v) } catch { /* modo privado */ } }
  const [per, setPer] = useState<{ de: Date; ate: Date } | null>(null)
  const [soMeus, setSoMeus] = useState(false)
  const [tipos, setTipos] = useState<TipoCompromisso[]>([])
  const [concluidos, setConcluidos] = useState(true)
  const { dados, erro } = useCarregar(() => (per ? apiAgenda.listar(ctx.empresa, per.de, per.ate, soMeus ? eu : null, tipos) : Promise.resolve([])),
    [ctx.empresa, per?.de.getTime(), per?.ate.getTime(), soMeus, eu, tipos.join(','), versao])
  const visiveis = useMemo(() => (dados ?? []).filter((c) => concluidos || aberto(c)), [dados, concluidos])
  const eventos = useMemo<EventoCal[]>(() => visiveis.map((c) => ({
    id: c.id, titulo: c.titulo, inicio: new Date(c.inicio_em), fim: c.fim_em ? new Date(c.fim_em) : null, diaInteiro: c.dia_inteiro,
    cor: c.cor, situacao: situacao(c, agora), arrastavel: pode && aberto(c),
    detalhe: [c.tipo_nome, c.cliente_nome, c.responsavel_nome].filter(Boolean).join(' · '),
  })), [visiveis, agora, pode])
  const porId = (id: string) => visiveis.find((c) => c.id === id)
  // clique no compromisso: editar (se aberto e com permissão); senão, o detalhe
  const clicar = (id: string) => { const c = porId(id); if (!c) return; if (pode && aberto(c)) onEditar(c); else onAbrir(id) }
  // soltar em outro dia (mesma hora) ou, na visão Dia, em outra hora (mesmos minutos); o término anda junto
  async function soltar(id: string, diaK: string, horaNova?: number) {
    const c = porId(id)
    if (!c || !pode || !aberto(c)) return
    const ini = new Date(c.inicio_em); const [a2, m2, d2] = diaK.split('-').map(Number)
    const novo = new Date(a2, m2 - 1, d2, horaNova ?? ini.getHours(), horaNova !== undefined ? 0 : ini.getMinutes())
    if (novo.getTime() === new Date(a2, m2 - 1, d2, ini.getHours(), ini.getMinutes()).getTime() && chaveDia(ini) === diaK) return
    const paraDiaTodo = c.dia_inteiro && horaNova !== undefined
    if (paraDiaTodo) { onAviso({ texto: 'Compromisso de dia todo: mude o horário pela edição.' }); return }
    const delta = novo.getTime() - ini.getTime()
    const fimNovo = c.fim_em ? new Date(new Date(c.fim_em).getTime() + delta) : null
    try {
      await apiAgenda.mover(ctx.empresa, c, novo, fimNovo)
      setDia(diaK)
      onAviso({ texto: `"${c.titulo}" remarcado para ${novo.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}${c.dia_inteiro ? '' : ` às ${hora(novo.toISOString())}`}.`,
                desfazer: async () => { await apiAgenda.mover(ctx.empresa, c, ini, c.fim_em ? new Date(c.fim_em) : null) } })
    } catch (e) { onAviso({ texto: `Não foi possível remarcar: ${(e as Error).message}` }) }
  }
  const doDia = visiveis.filter((c) => chaveDia(new Date(c.inicio_em)) === dia)
  const [a, m, d] = dia.split('-')
  const alternarTipo = (t: TipoCompromisso) => setTipos((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]))

  return (
    <>
      <div className="ag-filtros">
        <div className="chips">
          {TIPOS.map((t) => (
            <button key={t.codigo} type="button" className={`chip${tipos.includes(t.codigo) ? ' sel' : ''}`} onClick={() => alternarTipo(t.codigo)}>
              <span className={`ag-ponto ag-cor-${corDoTipo(t.codigo)}`} aria-hidden />{t.nome}
            </button>
          ))}
        </div>
        <label className="ag-check"><input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} /> Só os meus</label>
        <label className="ag-check"><input type="checkbox" checked={concluidos} onChange={(e) => setConcluidos(e.target.checked)} /> Mostrar concluídos</label>
      </div>
      {erro && <div className="erro">{erro}</div>}
      <div className={visao === 'mes' ? 'agenda-grid' : 'agenda-cheia'}>
        <Calendario eventos={eventos} visao={visao} onMudarVisao={setVisao} selecionado={dia} onSelecionar={setDia}
                    onPeriodo={(de, ate) => setPer({ de, ate })} onEvento={clicar}
                    onSoltar={pode ? soltar : undefined} onNovo={pode ? onNovo : undefined} />
        {visao === 'mes' && <aside className="painel ag-dia">
          <div className="ag-dia-topo">
            <h2>{d}/{m}/{a}</h2>
            {pode && <button className="sec" onClick={() => onNovo(dia)}>+ Novo neste dia</button>}
          </div>
          {doDia.length === 0
            ? <p className="mudo">Nenhum compromisso neste dia.</p>
            : <ul className="ag-lista">{doDia.map((c) => <ItemLista key={c.id} c={c} agora={agora} onAbrir={onAbrir} />)}</ul>}
        </aside>}
      </div>
      <Legenda arrastar={pode} />
    </>
  )
}
const corDoTipo = (t: TipoCompromisso) => ({ live: 'dourado', follow_up: 'azul', pos_venda: 'verde', lembrete: 'cinza', tarefa: 'roxo' }[t])

// ---------------------------------------------------------------------------- Formulário
const AVISOS = [{ min: 10, rotulo: '10 min' }, { min: 30, rotulo: '30 min' }, { min: 60, rotulo: '1 h' }, { min: 1440, rotulo: '1 dia' }]
const doisDig = (n: number) => String(n).padStart(2, '0')
const horaLocal = (iso: string) => { const x = new Date(iso); return `${doisDig(x.getHours())}:${doisDig(x.getMinutes())}` }
const montarIso = (diaK: string, hhmm: string) => new Date(`${diaK}T${hhmm || '00:00'}:00`).toISOString()

function FormCompromisso({ ctx, pessoas, eu, inicial, dia, hora: horaClicada, onFechar, onSalvo, onDetalhe }: {
  ctx: Contexto; pessoas: { id: string; nome: string; tem_email: boolean }[]; eu: string | null
  inicial: Compromisso | null; dia: string; hora?: number; onFechar: () => void; onSalvo: (id: string) => void; onDetalhe?: () => void
}) {
  // sugestão para compromisso novo: a próxima hora cheia; perto da meia-noite, passa para o dia seguinte
  const sugestao = (() => { const x = new Date(); x.setHours(x.getHours() + 1, 0, 0, 0); return x })()
  const diaInicial = !inicial && horaClicada === undefined && dia === chaveDia(new Date()) ? chaveDia(sugestao) : dia
  const [tipo, setTipo] = useState<TipoCompromisso>(inicial?.tipo ?? 'follow_up')
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [diaSel, setDiaSel] = useState(inicial ? chaveDia(new Date(inicial.inicio_em)) : diaInicial)
  const [diaInteiro, setDiaInteiro] = useState(inicial?.dia_inteiro ?? false)
  const [hIni, setHIni] = useState(inicial ? horaLocal(inicial.inicio_em) : `${doisDig(horaClicada ?? (diaInicial === chaveDia(sugestao) ? sugestao.getHours() : 9))}:00`)
  const [hFim, setHFim] = useState(inicial?.fim_em ? horaLocal(inicial.fim_em) : '')
  const [resp, setResp] = useState(inicial?.responsavel_id ?? eu ?? '')
  const [prioridade, setPrioridade] = useState<Prioridade>(inicial?.prioridade ?? 'normal')
  const [avisos, setAvisos] = useState<number[] | null>(inicial?.lembrete_min ?? null)
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(
    inicial?.cliente_id ? { id: inicial.cliente_id, nome: inicial.cliente_nome ?? 'Cliente' } : null)
  useEffect(() => { if (!resp && eu) setResp(eu) }, [eu, resp])
  const pessoa = pessoas.find((p) => p.id === resp)

  async function salvar() {
    if (!titulo.trim()) throw new Error('Informe o título.')
    if (!resp) throw new Error('Escolha o responsável.')
    if (!diaInteiro && hFim && hFim < hIni) throw new Error('O término não pode ser antes do início.')
    const dados: DadosCompromisso = {
      ...(inicial ? { id: inicial.id } : {}),
      tipo, titulo: titulo.trim(), descricao: descricao.trim() || null, dia_inteiro: diaInteiro, prioridade,
      inicio_em: montarIso(diaSel, diaInteiro ? '00:00' : hIni),
      fim_em: diaInteiro || !hFim ? null : montarIso(diaSel, hFim),
      responsavel_id: resp, cliente_id: cliente?.id ?? null, lembrete_min: avisos,
    }
    onSalvo(await apiAgenda.salvar(ctx.empresa, dados))
  }

  return (
    <Modal titulo={inicial ? 'Editar compromisso' : 'Novo compromisso'} onFechar={onFechar} larga>
      {onDetalhe && (
        <p className="ag-form-topo">
          <span className={`ag-estado st-${situacao(inicial!)}`}>{ROTULO_SITUACAO[situacao(inicial!)]}</span>
          <button type="button" className="link" onClick={onDetalhe}>Ver histórico e ações (tentativas, resolver, encerrar)</button>
        </p>
      )}
      <Formulario onEnviar={salvar} onCancelar={onFechar} enviarRotulo={inicial ? 'Salvar' : 'Criar'}>
        <Campo rotulo="Tipo">
          <div className="chips">
            {TIPOS.map((t) => (
              <button key={t.codigo} type="button" className={`chip${tipo === t.codigo ? ' sel' : ''}`} onClick={() => setTipo(t.codigo)}>
                <span className={`ag-ponto ag-cor-${corDoTipo(t.codigo)}`} aria-hidden />{t.nome}
              </button>
            ))}
          </div>
        </Campo>
        {(tipo === 'follow_up' || tipo === 'pos_venda') && (
          <p className="ag-nota">Este tipo só pode ser <strong>resolvido</strong> com a resposta da cliente registrada. Sem resposta, ele é encerrado com motivo.</p>
        )}
        <Campo rotulo="Título" dica="Evite telefone, CPF ou endereço: o título vai para o calendário do e-mail.">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} autoFocus required />
        </Campo>
        <div className="ag-linha">
          <Campo rotulo="Data"><input type="date" value={diaSel} onChange={(e) => setDiaSel(e.target.value)} required /></Campo>
          {!diaInteiro && <Campo rotulo="Início"><input type="time" value={hIni} onChange={(e) => setHIni(e.target.value)} required /></Campo>}
          {!diaInteiro && <Campo rotulo="Término" dica="Opcional"><input type="time" value={hFim} onChange={(e) => setHFim(e.target.value)} /></Campo>}
          <label className="ag-check ag-check-campo"><input type="checkbox" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} /> Dia todo</label>
        </div>
        <div className="ag-linha">
          <Campo rotulo="Responsável" dica={pessoa && !pessoa.tem_email ? 'Sem e-mail cadastrado: não recebe convite.' : undefined}>
            <select value={resp} onChange={(e) => setResp(e.target.value)} required>
              <option value="">Escolha…</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === eu ? ' (eu)' : ''}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Prioridade">
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
              <option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option>
            </select>
          </Campo>
        </div>
        <Campo rotulo="Cliente" dica="Opcional. Vincula o compromisso à cliente.">
          {cliente
            ? <div className="ag-cliente"><strong>{cliente.nome}</strong><button type="button" className="link" onClick={() => setCliente(null)}>Trocar</button></div>
            : <BuscaCliente ctx={ctx} onEscolher={(c) => setCliente({ id: c.id, nome: c.nome ?? c.instagram_username ?? 'Cliente' })} />}
        </Campo>
        <Campo rotulo="Descrição"><textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
        <Campo rotulo="Avisos no calendário" dica="Sem escolha, vale o padrão da Configuração.">
          <div className="chips">
            {AVISOS.map((a) => {
              const sel = avisos?.includes(a.min) ?? false
              return <button key={a.min} type="button" className={`chip${sel ? ' sel' : ''}`}
                             onClick={() => setAvisos((l) => { const b = l ?? []; const n = sel ? b.filter((x) => x !== a.min) : [...b, a.min].sort((x, y) => x - y); return n.length ? n : null })}>{a.rotulo} antes</button>
            })}
          </div>
        </Campo>
      </Formulario>
    </Modal>
  )
}

function BuscaCliente({ ctx, onEscolher }: { ctx: Contexto; onEscolher: (c: ClienteLinha) => void }) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<ClienteLinha[]>([])
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (q.trim().length < 2) { setLista([]); return }
    let vivo = true
    api.clientes(ctx.empresa, q, 0, 8).then((l) => { if (vivo) { setLista(l); setErro(null) } }).catch((e: Error) => vivo && setErro(e.message))
    return () => { vivo = false }
  }, [q, ctx.empresa])
  return (
    <div className="ag-busca-cliente">
      <Busca valor={q} onMudar={setQ} placeholder="Nome, @ ou telefone (mín. 2 letras)" />
      {erro && <small className="mudo">Não foi possível buscar clientes ({erro}).</small>}
      {lista.length > 0 && (
        <ul>{lista.map((c) => (
          <li key={c.id}><button type="button" className="link" onClick={() => onEscolher(c)}>
            {c.nome ?? 'Sem nome'}{c.instagram_username ? ` · @${c.instagram_username}` : ''}
          </button></li>))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------- Detalhe
type Acao = null | 'tentativa' | 'resposta_cliente' | 'nota' | 'resolver' | 'encerrar' | 'cancelar' | 'reabrir'

function Detalhe({ ctx, id, pode, versao, onFechar, onMudou, onEditar }: {
  ctx: Contexto; id: string; pode: boolean; versao: number; onFechar: () => void; onMudou: () => void; onEditar: (c: Compromisso) => void
}) {
  const [local, setLocal] = useState(0)
  const { dados: c, erro } = useCarregar(() => apiAgenda.obter(ctx.empresa, id), [ctx.empresa, id, versao, local])
  const { dados: hist } = useCarregar(() => apiAgenda.interacoes(ctx.empresa, id), [ctx.empresa, id, versao, local])
  const [acao, setAcao] = useState<Acao>(null)
  const atualizar = () => { setAcao(null); setLocal((n) => n + 1); onMudou() }

  return (
    <Modal titulo={c ? c.titulo : 'Compromisso'} onFechar={onFechar} larga>
      {erro && <div className="erro">{erro}</div>}
      {!c && !erro && <p className="sub">Carregando…</p>}
      {c && (
        <div className="ag-detalhe">
          <div className="ag-det-cab">
            <span className={`ag-tipo ag-cor-${c.cor}`}>{c.tipo_nome}</span>
            <span className={`ag-estado ag-est-${c.estado} st-${situacao(c)}`}>{situacao(c) === 'atrasado' ? 'Atrasado' : situacao(c) === 'em_breve' ? `Começa ${relativo(c.inicio_em)}` : ESTADO_COMPROMISSO[c.estado]}</span>
            {c.prioridade === 'alta' && <em className="ag-alta">Prioridade alta</em>}
          </div>
          <dl className="ag-dados">
            <dt>Quando</dt><dd>{diaCurto(c.inicio_em)} {c.dia_inteiro ? '(dia todo)' : `${hora(c.inicio_em)}${c.fim_em ? ` – ${hora(c.fim_em)}` : ''}`}</dd>
            <dt>Responsável</dt><dd>{c.responsavel_nome ?? '—'}{c.criado_por_nome && c.criado_por_nome !== c.responsavel_nome ? ` (criado por ${c.criado_por_nome})` : ''}</dd>
            {c.cliente_nome && <><dt>Cliente</dt><dd>{c.cliente_nome}</dd></>}
            {c.descricao && <><dt>Descrição</dt><dd className="ag-pre">{c.descricao}</dd></>}
            {c.desfecho && <><dt>Desfecho</dt><dd>{c.desfecho}</dd></>}
            {c.motivo_encerramento && <><dt>Motivo</dt><dd>{MOTIVOS_ENCERRAR.find((m) => m.valor === c.motivo_encerramento)?.rotulo ?? c.motivo_encerramento}</dd></>}
            {c.concluido_em && <><dt>Concluído em</dt><dd>{dataHora(c.concluido_em)}</dd></>}
          </dl>

          {c.exige_interacao_cliente && aberto(c) && (
            <p className="ag-nota">{c.teve_resposta
              ? 'A cliente já respondeu: pode resolver com o desfecho.'
              : `Aguardando resposta da cliente (${c.qtd_tentativas} tentativa(s) registrada(s)). Registre cada tentativa; sem resposta, encerre com motivo.`}</p>
          )}

          {pode && acao === null && (
            <div className="ag-acoes">
              {aberto(c) ? <>
                {c.exige_interacao_cliente && <button className="sec" onClick={() => setAcao('tentativa')}>Registrar tentativa</button>}
                {c.exige_interacao_cliente && <button className="sec" onClick={() => setAcao('resposta_cliente')}>Cliente respondeu</button>}
                <button className="sec" onClick={() => setAcao('nota')}>Anotar</button>
                <button className="sec" onClick={() => onEditar(c)}>Editar</button>
                <span className="espaco" />
                <button className="sec" onClick={() => setAcao('cancelar')}>Cancelar</button>
                {c.exige_interacao_cliente && <button className="sec" onClick={() => setAcao('encerrar')}>Encerrar</button>}
                <button onClick={() => setAcao('resolver')} disabled={c.exige_interacao_cliente && !c.teve_resposta}
                        title={c.exige_interacao_cliente && !c.teve_resposta ? 'Registre a resposta da cliente antes' : undefined}>Resolver</button>
              </> : <button className="sec" onClick={() => setAcao('reabrir')}>Reabrir</button>}
            </div>
          )}
          {acao && <FormAcao ctx={ctx} c={c} acao={acao} onCancelar={() => setAcao(null)} onFeito={atualizar} />}

          <h3 className="ag-sub">Histórico</h3>
          {!hist || hist.length === 0 ? <p className="mudo">Nenhum registro ainda.</p> : (
            <ol className="ag-historico">
              {hist.map((i) => (
                <li key={i.id} className={`ag-h-${i.tipo}`}>
                  <strong>{i.tipo === 'tentativa' ? 'Tentativa de contato' : i.tipo === 'resposta_cliente' ? 'Cliente respondeu' : 'Anotação'}</strong>
                  {i.canal && <span> · {CANAIS.find((x) => x.valor === i.canal)?.rotulo ?? i.canal}</span>}
                  <small> · {dataHora(i.registrado_em)}{i.registrado_por ? ` · ${i.registrado_por}` : ''}</small>
                  {i.texto && <p>{i.texto}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  )
}

function FormAcao({ ctx, c, acao, onCancelar, onFeito }: { ctx: Contexto; c: Compromisso; acao: Exclude<Acao, null>; onCancelar: () => void; onFeito: () => void }) {
  const [canal, setCanal] = useState('whatsapp')
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState(acao === 'encerrar' ? 'sem_resposta' : '')
  const rotulo = { tentativa: 'Registrar tentativa', resposta_cliente: 'Registrar resposta', nota: 'Anotar', resolver: 'Resolver',
                   encerrar: 'Encerrar', cancelar: 'Cancelar compromisso', reabrir: 'Reabrir' }[acao]
  async function enviar() {
    const t = texto.trim() || null
    if (acao === 'tentativa' || acao === 'resposta_cliente' || acao === 'nota') {
      if (acao === 'nota' && !t) throw new Error('Escreva a anotação.')
      await apiAgenda.registrar(ctx.empresa, c.id, acao, acao === 'nota' ? null : canal, t)
    } else if (acao === 'resolver') {
      if (!t) throw new Error('Descreva o desfecho.')
      await apiAgenda.concluir(ctx.empresa, c.id, 'resolvido', t, null)
    } else if (acao === 'encerrar') {
      const m = motivo === 'outro' ? t : motivo
      if (!m) throw new Error('Informe o motivo.')
      await apiAgenda.concluir(ctx.empresa, c.id, 'encerrado', motivo === 'outro' ? null : t, m)
    } else if (acao === 'cancelar') {
      if (!t) throw new Error('Informe o motivo do cancelamento.')
      await apiAgenda.concluir(ctx.empresa, c.id, 'cancelado', null, t)
    } else {
      if (!t) throw new Error('Informe o motivo para reabrir.')
      await apiAgenda.reabrir(ctx.empresa, c.id, t)
    }
    onFeito()
  }
  const precisaTexto = { tentativa: 'O que foi feito (opcional)', resposta_cliente: 'O que a cliente disse', nota: 'Anotação',
    resolver: 'Desfecho', encerrar: motivo === 'outro' ? 'Motivo' : 'Observação (opcional)', cancelar: 'Motivo', reabrir: 'Motivo' }[acao]
  return (
    <div className="ag-form-acao">
      <Formulario onEnviar={enviar} onCancelar={onCancelar} enviarRotulo={rotulo}>
        {(acao === 'tentativa' || acao === 'resposta_cliente') && (
          <Campo rotulo="Canal"><select value={canal} onChange={(e) => setCanal(e.target.value)}>
            {CANAIS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}</select></Campo>
        )}
        {acao === 'encerrar' && (
          <Campo rotulo="Motivo" dica={motivo === 'sem_resposta' ? 'Exige o número mínimo de tentativas registradas (Configuração).' : undefined}>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_ENCERRAR.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}</select>
          </Campo>
        )}
        <Campo rotulo={precisaTexto}><textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus /></Campo>
      </Formulario>
    </div>
  )
}

// ---------------------------------------------------------------------------- Configuração
function ConfigView({ ctx }: { ctx: Contexto }) {
  const { dados, erro, recarregar } = useCarregar(() => apiAgenda.config(ctx.empresa), [ctx.empresa])
  const [f, setF] = useState<ConfigAgenda | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (dados) setF(dados) }, [dados])
  if (erro) return <div className="erro">{erro}</div>
  if (!f) return <p className="sub">Carregando…</p>
  async function salvar() {
    await apiAgenda.salvarConfig(ctx.empresa, {
      enviar_convite: f!.enviar_convite, lembrete_padrao_min: f!.lembrete_padrao_min, duracao_padrao_min: f!.duracao_padrao_min,
      nome_cliente_no_convite: f!.nome_cliente_no_convite, max_tentativas_sem_resposta: f!.max_tentativas_sem_resposta,
    })
    setMsg('Configuração salva.'); recarregar()
  }
  return (
    <div className="painel ag-config">
      <Formulario onEnviar={salvar} onCancelar={() => { setF(dados ?? null); setMsg(null) }} enviarRotulo="Salvar configuração">
        <label className="ag-check"><input type="checkbox" checked={f.enviar_convite} onChange={(e) => setF({ ...f, enviar_convite: e.target.checked })} />
          <span><strong>Enviar convite de calendário por e-mail</strong><br /><small className="mudo">Cada compromisso aberto chega ao e-mail do responsável
            com um anexo de calendário (Gmail, Outlook, Apple). Mudou a data, o evento é atualizado; concluiu ou cancelou, sai do calendário.
            Vale para compromissos criados ou alterados depois de ligar.</small></span></label>
        <Campo rotulo="Avisos padrão do calendário" dica="O Google Agenda costuma usar o aviso padrão da própria conta; o Outlook respeita este.">
          <div className="chips">{AVISOS.map((a) => {
            const sel = f.lembrete_padrao_min.includes(a.min)
            return <button key={a.min} type="button" className={`chip${sel ? ' sel' : ''}`}
                           onClick={() => { const n = sel ? f.lembrete_padrao_min.filter((x) => x !== a.min) : [...f.lembrete_padrao_min, a.min].sort((x, y) => x - y); setF({ ...f, lembrete_padrao_min: n.length ? n : [30] }) }}>{a.rotulo} antes</button>
          })}</div>
        </Campo>
        <div className="ag-linha">
          <Campo rotulo="Duração padrão (min)" dica="Quando o término não é informado.">
            <input type="number" min={5} max={480} value={f.duracao_padrao_min} onChange={(e) => setF({ ...f, duracao_padrao_min: Number(e.target.value) || 30 })} />
          </Campo>
          <Campo rotulo="Tentativas antes de encerrar sem resposta" dica="Follow-up e pós-venda.">
            <input type="number" min={1} max={10} value={f.max_tentativas_sem_resposta} onChange={(e) => setF({ ...f, max_tentativas_sem_resposta: Number(e.target.value) || 3 })} />
          </Campo>
        </div>
        <label className="ag-check"><input type="checkbox" checked={f.nome_cliente_no_convite} onChange={(e) => setF({ ...f, nome_cliente_no_convite: e.target.checked })} />
          <span>Incluir o primeiro nome da cliente no convite<br /><small className="mudo">Desligado por padrão (LGPD): o convite vai para o e-mail da equipe, fora do CRM.</small></span></label>
        {msg && <div className="info">{msg}</div>}
      </Formulario>
    </div>
  )
}
