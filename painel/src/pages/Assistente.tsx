import { useEffect, useRef, useState } from 'react'
import { paraTrecho, resumir } from '../textoLimpo'
import { apiConhecimento as api, apiAssistenteDados, apiAssistenteIA, apiConversas, type AchadoConhecimento, type VendasCliente, type ClienteVendas, type VendasPeriodo, type Recebimento, type MargemBruta } from '../api'
import { entender, deFichaIA, pareceDado, type Intencao, type Opcao, type PeriodoComparado } from '../intencao'
import { Vazio, useCarregar } from '../ui'
import { NOME_TELA, acharReferencias, quando, type Referencia } from '../referencias'
import type { Contexto } from '../App'
import { GraficoVendas } from './GraficoVendas'
import type { ContextoDados, Dimensao, Metrica, TipoPedido } from '../grafico'

const RE_ARROBA_SIMPLES = /(?<![\w.@])@[A-Za-z0-9._]{2,30}/
const EXEMPLOS = [
  'Quais as vendas do cliente @deboraclemente?',
  'Qual foi a última nota emitida?',
  'Total de vendas do mês passado',
  'Qual a margem bruta do mês passado?',
  'Quanto tempo posso deixar um pedido pago sem nota?',
  'O que fazer com cliente que não responde ao link de pagamento?',
  'Como tratar pedido faturado e ainda não expedido?',
]
interface Resposta {
  pergunta: string; resultados: AchadoConhecimento[]; aviso: string | null; refs: Referencia[]; vendas?: VendasCliente; termo?: string; notas?: VendasPeriodo; rotulo?: string
  entendimento?: string; ia?: boolean; iaNota?: string; dctx?: ContextoDados
  assumido?: string; opcoes?: Opcao[]; esclarecer?: { pergunta: string; opcoes: Opcao[] }; comparativo?: { periodos: PeriodoComparado[]; opcoes: Opcao[] }; grafico?: boolean
  graf?: { de: string | null; ate: string | null; rotulo: string; dimensao?: Dimensao; metrica?: Metrica; tipo?: TipoPedido; limite?: number }
  indispo?: { motivo: string; sugestao?: string; regra?: { titulo: string; trecho: string } }
  margem?: MargemBruta
}

// Sugestões clicáveis: "enviar" executa a pergunta; "preencher" coloca no campo para a pessoa completar.
function Chips({ opcoes, escolher, rotulo }: { opcoes: Opcao[]; escolher: (o: Opcao) => void; rotulo?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
      {rotulo && <small className="sub">{rotulo}</small>}
      {opcoes.map((o) => <button key={o.rotulo} className="sec" onClick={() => escolher(o)}>{o.rotulo}</button>)}
    </div>)
}
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dia = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')
const diaHora = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

const ROT_RECEB: Record<Recebimento, string> = { recebido: 'Recebido', parcial: 'Parcialmente recebido', em_aberto: 'Em aberto', sem_conta: 'Sem conta a receber' }
function ResumoVendas({ n, rotulo, semTabela }: { n: VendasPeriodo; rotulo: string; semTabela?: boolean }) {
  const ultimas = n.de == null && rotulo.startsWith('Últimas')
  const rc = n.recebimento
  const parciais = n.carga_em_andamento || (n.contas_desde != null && n.de != null && n.de < n.contas_desde)
  return (
    <article className="aviso-caixa" style={{ marginBottom: 10 }}>
      <strong>{rotulo}</strong>
      {n.qtd_pedidos === 0
        ? <p style={{ margin: '6px 0 0' }}>Nenhum pedido de venda nesse período. O primeiro pedido da base é de {dia(n.primeira_data)}.</p>
        : <p style={{ margin: '6px 0 0' }}>
            {!ultimas && <><strong>{n.qtd_validas}</strong> {n.qtd_validas === 1 ? 'pedido válido' : 'pedidos válidos'}{n.qtd_canceladas > 0 && <> (+ {n.qtd_canceladas} cancelado{n.qtd_canceladas > 1 ? 's' : ''})</>}
              {n.ve_valores && <>{' · '}total <strong>{brl(n.valor_total)}</strong></>}</>}
            {ultimas && <>Última venda: <strong>pedido nº {n.pedidos[0]?.numero}</strong> em {dia(n.pedidos[0]?.data)}{n.pedidos[0]?.cliente ? <> para <strong>{n.pedidos[0].cliente}</strong></> : null}{n.ve_valores && n.pedidos[0]?.valor != null ? <> · {brl(n.pedidos[0].valor)}</> : null}.</>}
          </p>}
      {n.qtd_validas > 0 && !ultimas && (
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Recebimento: {rc.recebido.qtd} recebido{rc.recebido.qtd === 1 ? '' : 's'}{n.ve_valores && rc.recebido.valor != null ? ` (${brl(rc.recebido.valor)})` : ''}
          {' · '}{rc.parcial.qtd > 0 ? `${rc.parcial.qtd} parcial, ` : ''}{rc.em_aberto.qtd} em aberto{n.ve_valores && rc.em_aberto.valor != null ? ` (${brl(rc.em_aberto.valor)})` : ''}
          {' · '}{rc.sem_conta.qtd} sem conta a receber{n.ve_valores && rc.sem_conta.valor != null ? ` (${brl(rc.sem_conta.valor)})` : ''}.
          {parciais && ' A carga de contas a receber ainda não cobre todo o período; "sem conta" pode estar acima do real.'}
        </p>)}
      {n.devolucoes.qtd_notas > 0 && !ultimas && (
        <p className="sub" style={{ margin: '4px 0 0' }}>Devoluções no período (notas de entrada): {n.devolucoes.qtd_notas} {n.devolucoes.qtd_notas === 1 ? 'nota' : 'notas'}{n.ve_valores && n.devolucoes.valor != null ? <> · {brl(n.devolucoes.valor)}</> : null}.</p>)}
      {n.pedidos.length > 0 && !semTabela && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table>
            <thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Situação</th><th>Recebimento</th>{n.ve_valores && <th style={{ textAlign: 'right' }}>Valor</th>}</tr></thead>
            <tbody>{n.pedidos.map((x) => (
              <tr key={x.bling_id}>
                <td>{x.numero}</td><td>{dia(x.data)}</td><td>{x.cliente}</td><td>{x.situacao_rotulo}</td><td>{ROT_RECEB[x.recebimento]}</td>
                {n.ve_valores && <td style={{ textAlign: 'right' }}>{brl(x.valor)}</td>}
              </tr>))}</tbody>
          </table>
          {n.qtd_pedidos > n.pedidos.length && <p className="sub">Mostrando os {n.pedidos.length} mais recentes de {n.qtd_pedidos}.</p>}
        </div>)}
      <p className="sub" style={{ marginTop: 8 }}>
        Base: {n.base_pedidos} pedidos de venda do Bling, atualizada em {diaHora(n.base_ate)}. Considera pedidos de venda (cancelados e em digitação ficam de fora do total); devoluções vêm das notas de entrada.
        {n.carga_em_andamento && ` A carga do histórico ainda está em andamento: a base cobre a partir de ${dia(n.primeira_data)}.`}
      </p>
    </article>)
}

// Margem bruta do período: valores só para admin/gestor/financeiro; cobertura baixa nunca aparece como total completo.
function ResumoMargem({ m, rotulo }: { m: MargemBruta; rotulo: string }) {
  const semItens = m.pedidos_com_itens === 0
  return (
    <article className="aviso-caixa" style={{ marginBottom: 10 }}>
      <strong>Margem bruta · {rotulo}</strong>
      {semItens
        ? <p style={{ margin: '6px 0 0' }}>Ainda não há itens lidos para os {m.pedidos_validos_no_periodo} pedidos válidos desse período, então não dá para calcular a margem. A leitura dos itens segue em andamento.</p>
        : m.ve_valores
          ? <p style={{ margin: '6px 0 0' }}>
              Receita dos itens <strong>{brl(m.receita_itens)}</strong> · custo <strong>{brl(m.custo_total)}</strong> · margem bruta <strong>{brl(m.margem_bruta)}</strong>
              {m.margem_pct != null && <> (<strong>{m.margem_pct.toLocaleString('pt-BR')}%</strong>)</>}.
            </p>
          : <p style={{ margin: '6px 0 0' }}>Você não tem permissão para ver os valores de margem.</p>}
      <p className={m.cobertura_baixa ? undefined : 'sub'} style={{ margin: '6px 0 0' }}>{m.cobertura_baixa ? <strong>{m.aviso}</strong> : m.aviso}</p>
    </article>)
}

function CartaoCliente({ c, valores, abrir, podeNota }: { c: ClienteVendas; valores: boolean; abrir: (aba: string, busca?: string) => void; podeNota: boolean }) {
  const r = c.resumo
  const semValor = valores && r.qtd_sem_detalhe > 0
  return (
    <article className="aviso-caixa" style={{ marginBottom: 10 }}>
      <strong>{c.nome}</strong>{c.instagram.length > 0 && <span className="sub" style={{ marginLeft: 8 }}>{c.instagram.join(' ')}</span>}
      <p style={{ margin: '6px 0 0' }}>
        {r.qtd_notas === 0 ? 'Nenhuma nota fiscal vinculada a este cliente na base.' : (<>
          <strong>{r.qtd_notas}</strong> {r.qtd_notas === 1 ? 'nota' : 'notas'}
          {r.qtd_canceladas > 0 && <> ({r.qtd_canceladas} cancelada{r.qtd_canceladas > 1 ? 's' : ''}/rejeitada{r.qtd_canceladas > 1 ? 's' : ''})</>}
          {' · '}última compra <strong>{dia(r.ultima)}</strong>
          {valores && <>{' · '}total <strong>{semValor && !r.valor_total ? 'ainda não carregado' : brl(r.valor_total)}</strong>{r.ticket_medio != null && <> · ticket médio {brl(r.ticket_medio)}</>}</>}
        </>)}
      </p>
      {semValor && <p className="sub" style={{ margin: '4px 0 0' }}>{r.qtd_sem_detalhe} {r.qtd_sem_detalhe === 1 ? 'nota ainda sem detalhe' : 'notas ainda sem detalhe'} (valor e itens chegam quando a carga do Bling lê o detalhe).</p>}
      {c.notas.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table>
            <thead><tr><th>Nota</th><th>Emissão</th><th>Situação</th>{valores && <th style={{ textAlign: 'right' }}>Valor</th>}<th>Itens</th><th /></tr></thead>
            <tbody>{c.notas.map((n) => (
              <tr key={n.bling_id}>
                <td>{n.numero}</td><td>{dia(n.data_emissao)}</td><td>{n.situacao_rotulo}</td>
                {valores && <td style={{ textAlign: 'right' }}>{brl(n.valor_nota)}</td>}
                <td>{n.itens.length > 0 ? n.itens.map((i) => `${i.quantidade ?? 1}× ${i.descricao}${i.grade ? ` (${i.grade})` : ''}`).join('; ') : n.tem_detalhe ? '—' : 'a carregar'}</td>
                <td>{podeNota && <button className="sec" onClick={() => abrir('fiscal', String(parseInt(n.numero, 10)))}>Abrir nota →</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>)}
    </article>)
}

// Última pergunta e resultado por empresa, só em memória (some ao recarregar a página ou sair). Assim, ao abrir uma nota ou
// um cliente a partir da resposta e voltar, o Assistente continua de onde parou.
interface Turno { id: number; pergunta: string; resp: Resposta | null; conversa?: string; ordem?: number; av?: 'util' | 'errado'; avAberto?: boolean }
const memoria = new Map<string, { pergunta: string; turnos: Turno[]; conversa: string | null }>()
export const esquecerAssistente = () => memoria.clear()

export default function Assistente({ ctx, abrir }: { ctx: Contexto; abrir: (aba: string, busca?: string) => void }) {
  const [pergunta, setPergunta] = useState(() => memoria.get(ctx.empresa)?.pergunta ?? '')
  const [turnos, setTurnos] = useState<Turno[]>(() => memoria.get(ctx.empresa)?.turnos ?? [])
  const [conversaId, setConversaId] = useState<string | null>(() => memoria.get(ctx.empresa)?.conversa ?? null)
  useEffect(() => { memoria.set(ctx.empresa, { pergunta, turnos, conversa: conversaId }) }, [ctx.empresa, pergunta, turnos, conversaId])
  const fim = useRef<HTMLDivElement>(null)
  const ultimo = turnos[turnos.length - 1]
  // Contexto da conversa (padrão do ZAgent: a pergunta seguinte herda o resultado estruturado da anterior, não o texto)
  const ctxDados: ContextoDados | null = [...turnos].reverse().find((x) => x.resp?.dctx)?.resp?.dctx ?? null
  const setResp = (r: Resposta) => setTurnos((ts) => ts.map((x, i) => (i === ts.length - 1 ? { ...x, resp: r } : x)))
  const novaConversa = () => { setTurnos([]); setConversaId(null); setPergunta(''); setErro(null); entrada.current?.focus() }
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [turnos.length, ultimo?.resp])
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const hist = useCarregar(() => api.historico(ctx.empresa), [ctx.empresa])
  const admin = ctx.perm ? ctx.perm['conhecimento'] === 'editar' : ctx.papeis.some((p) => p === 'admin' || p === 'superadmin' || p === 'gestor')
  const podeAbrir = (aba: string) => (ctx.perm ? !!ctx.perm[aba] && ctx.perm[aba] !== 'nenhum' : true)

  async function perguntar(texto: string) {
    const t = texto.trim()
    if (t.length < 2 || ocupado) return
    setPergunta(''); setOcupado(true); setErro(null)
    setTurnos((ts) => [...ts, { id: Date.now(), pergunta: t, resp: null }])
    try {
      let it: Intencao | null = null
      let viaIA = false; let iaNota: string | undefined
      if (!RE_ARROBA_SIMPLES.test(t) && pareceDado(t)) {
        try {
          const r = await Promise.race([
            apiAssistenteIA.interpretar(ctx.empresa, t, new Date().toISOString().slice(0, 10), ctxDados ? { rotulo: ctxDados.rotulo, dimensao: ctxDados.dimensao, metrica: ctxDados.metrica } : undefined),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 20000)),
          ])
          if (r.ok && r.ficha) { const x = deFichaIA(r.ficha, t); if (x) { it = x; viaIA = true } }
          if (!it) iaNota = r.ok ? 'A IA não conseguiu interpretar a pergunta; usei o modo básico.' : `Interpretação por IA indisponível (${r.motivo ?? 'sem resposta'}); usei o modo básico.`
        } catch { iaNota = 'Interpretação por IA indisponível no momento; usei o modo básico.' }
      }
      if (!it) it = entender(t, ctxDados)
      const dctx: ContextoDados | undefined = it.tipo === 'notas' ? { de: it.de, ate: it.ate, rotulo: it.rotulo, dimensao: it.dimensao ?? 'dia', metrica: it.metrica ?? 'valor', grafico: it.tipoGrafico ?? null } : undefined
      const extra = { entendimento: (it as { entendimento?: string }).entendimento, ia: viaIA, iaNota, dctx }
      // grava a pergunta e o que foi entendido (estruturado) para continuar a conversa e para a revisão de respostas erradas
      void apiConversas.salvarTurno(ctx.empresa, conversaId, t, {
        origem: viaIA ? 'ia' : 'regras', entendimento: extra.entendimento ?? null, tipo: it.tipo,
        ...(it.tipo === 'notas' ? { de: it.de, ate: it.ate, rotulo: it.rotulo, dimensao: it.dimensao ?? null, metrica: it.metrica ?? null, grafico: it.tipoGrafico ?? null, limite: it.limite ?? null } : {}),
      }).then((r) => {
        if (r.ok) { setConversaId(r.conversa_id); setTurnos((ts) => ts.map((x, i) => (i === ts.length - 1 ? { ...x, conversa: r.conversa_id, ordem: r.ordem } : x))) }
        else if (r.motivo === 'conversa_cheia') setConversaId(null)
      }).catch(() => undefined)
      if (it.tipo === 'esclarecer' || it.tipo === 'comparativo') {
        void apiAssistenteDados.registrar(ctx.empresa, t).then(() => hist.recarregar()).catch(() => undefined)
        setResp(it.tipo === 'esclarecer'
          ? { ...extra, pergunta: t, resultados: [], aviso: null, refs: [], esclarecer: { pergunta: it.pergunta, opcoes: it.opcoes }, grafico: !!it.grafico }
          : { ...extra, pergunta: t, resultados: [], aviso: null, refs: [], comparativo: { periodos: it.periodos, opcoes: it.opcoes }, grafico: !!it.grafico })
        setOcupado(false); return
      }
      if (it.tipo === 'indisponivel') {
        void apiAssistenteDados.registrar(ctx.empresa, t).then(() => hist.recarregar()).catch(() => undefined)
        let regra: { titulo: string; trecho: string } | undefined
        try {
          const r = await api.buscar(ctx.empresa, it.consultaConhecimento || t)
          const top = r.resultados[0]
          if (top) { const tr = paraTrecho(top.conteudo); regra = { titulo: top.fonte_titulo.replace(/\.(md|txt|csv|json)$/i, ''), trecho: resumir(tr.corpo) } }
        } catch { /* sem regra relacionada: segue só com a resposta honesta */ }
        setResp({ ...extra, pergunta: t, resultados: [], aviso: null, refs: [], indispo: { motivo: it.motivo, sugestao: it.sugestao, regra } })
        setOcupado(false); return
      }
      if (it.tipo === 'margem') {
        const m = await apiAssistenteDados.margem(ctx.empresa, it.de, it.ate)
        void apiAssistenteDados.registrar(ctx.empresa, t).then(() => hist.recarregar()).catch(() => undefined)
        setResp({ ...extra, pergunta: t, resultados: [], aviso: null, refs: [], margem: m, rotulo: it.rotulo, assumido: it.assumido, opcoes: it.opcoes })
        setOcupado(false); return
      }
      if (it.tipo === 'cliente') {
        const v = await apiAssistenteDados.vendasCliente(ctx.empresa, it.termo)
        void apiAssistenteDados.registrar(ctx.empresa, t).then(() => hist.recarregar()).catch(() => undefined)
        const refs = v.clientes.length === 0 ? [{ aba: 'clientes' as const, busca: it.termo, rotulo: `Cliente ${it.termo}` }].filter((x) => podeAbrir(x.aba)) : []
        setResp({ ...extra, pergunta: t, resultados: [], aviso: null, refs, vendas: v, termo: it.termo })
        setOcupado(false); return
      }
      if (it.tipo === 'notas') {
        const n = await apiAssistenteDados.vendasPeriodo(ctx.empresa, it.de, it.ate, it.rotulo.startsWith('Últimas') ? 5 : 20)
        void apiAssistenteDados.registrar(ctx.empresa, t).then(() => hist.recarregar()).catch(() => undefined)
        setResp({ ...extra, pergunta: t, resultados: [], aviso: null, refs: [], notas: n, rotulo: it.rotulo, assumido: it.assumido, opcoes: it.opcoes, grafico: !!it.grafico,
          graf: it.grafico ? { de: it.de, ate: it.ate, rotulo: it.rotulo, dimensao: it.dimensao, metrica: it.metrica, tipo: it.tipoGrafico, limite: it.limite } : undefined })
        setOcupado(false); return
      }
      const r = await api.buscar(ctx.empresa, t)
      const refs = acharReferencias([t, ...r.resultados.map((x) => x.conteudo)]).filter((x) => podeAbrir(x.aba))
      setResp({ ...extra, pergunta: t, resultados: r.resultados, aviso: r.aviso, refs })
      hist.recarregar()
    } catch (e) { setErro((e as Error).message) }
    setOcupado(false)
  }
  async function avaliar(tn: Turno, av: 'util' | 'errado', obs?: string) {
    if (!tn.conversa || tn.ordem == null) return
    try {
      await apiConversas.avaliar(ctx.empresa, tn.conversa, tn.ordem, av, obs)
      setTurnos((ts) => ts.map((x) => (x.id === tn.id ? { ...x, av, avAberto: false } : x)))
    } catch (e) { setErro((e as Error).message) }
  }
  const editar = (t: string) => { setPergunta(t); entrada.current?.focus() }
  const escolher = (o: Opcao) => { if (o.modo === 'enviar') void perguntar(o.texto); else editar(o.texto) }
  async function limpar() {
    try { await api.limparHistorico(ctx.empresa); hist.recarregar() } catch (e) { setErro((e as Error).message) }
  }
  const itens = hist.dados ?? []

  return (
    <section>
      <div className="topo"><div><h1>Assistente</h1>
        <p className="sub">Pergunte pelas vendas de um cliente (use o @ do Instagram ou o nome) ou sobre as regras e processos da operação. Perguntas de cliente vêm dos dados; as de regra mostram os trechos dos documentos, com a fonte.</p></div>
        {admin && <button className="sec" onClick={() => abrir('conhecimento')}>Gerenciar documentos</button>}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>

          {turnos.length === 0 && !ocupado && (
            <div style={{ marginTop: 16 }}>
              <p className="sub">Experimente:</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXEMPLOS.map((e) => <button key={e} className="sec" onClick={() => void perguntar(e)}>{e}</button>)}
              </div>
            </div>
          )}

          {turnos.map((tn) => {
            const resp = tn.resp
            return (
              <div key={tn.id} style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <div style={{ background: 'var(--marca-suave)', border: '1px solid var(--borda)', borderRadius: '14px 14px 4px 14px', padding: '8px 14px', maxWidth: '85%' }}>{tn.pergunta}</div>
                </div>
                {!resp ? <p className="sub">✦ Entendendo a pergunta…</p> : (
                  <div>
              {resp.refs.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                  <small className="sub">Abrir no painel:</small>
                  {resp.refs.map((r) => <button key={r.aba + r.busca} className="sec" title={`Abre ${NOME_TELA[r.aba]} já buscando "${r.busca}"`} onClick={() => abrir(r.aba, r.busca)}>{r.rotulo} →</button>)}
                </div>
              )}
              {resp.entendimento && <p className="sub" style={{ marginBottom: 8 }}>✦ Entendi: {resp.entendimento}</p>}
              {resp.iaNota && <p className="sub" style={{ marginBottom: 8 }}>{resp.iaNota}</p>}
              {resp.aviso && <p className="sub">{resp.aviso}</p>}
              {resp.indispo && (
                <article className="aviso-caixa" style={{ marginBottom: 10 }}>
                  <strong>Ainda não consigo calcular isso</strong>
                  <p style={{ margin: '6px 0 0' }}>{resp.indispo.motivo}</p>
                  {resp.indispo.regra && <p className="sub" style={{ margin: '8px 0 0' }}><strong>Regra relacionada — {resp.indispo.regra.titulo}:</strong> {resp.indispo.regra.trecho}</p>}
                  {resp.indispo.sugestao && <Chips opcoes={[{ rotulo: resp.indispo.sugestao, texto: resp.indispo.sugestao, modo: 'enviar' as const }]} escolher={escolher} rotulo="Posso responder agora:" />}
                </article>)}
              {resp.grafico && (resp.comparativo || resp.esclarecer) && <p className="sub">Você pediu um gráfico: os gráficos interativos estão em construção, por enquanto mostro a tabela.</p>}
              {resp.esclarecer && (
                <article className="aviso-caixa" style={{ marginBottom: 10 }}>
                  <strong>{resp.esclarecer.pergunta}</strong>
                  <Chips opcoes={resp.esclarecer.opcoes} escolher={escolher} />
                </article>)}
              {resp.comparativo && (
                <article className="aviso-caixa" style={{ marginBottom: 10 }}>
                  <strong>Comparativo entre períodos</strong>
                  <p style={{ margin: '6px 0 0' }}>Entendi {resp.comparativo.periodos.length} períodos: {resp.comparativo.periodos.map((p) => p.rotulo).join(' · ')}.</p>
                  <p className="sub" style={{ margin: '4px 0 0' }}>O comparativo lado a lado chega junto com os gráficos. Por enquanto, veja cada período separadamente:</p>
                  <Chips opcoes={resp.comparativo.opcoes} escolher={escolher} />
                </article>)}
              {resp.assumido && (
                <article className="aviso-caixa" style={{ marginBottom: 10 }}>
                  <p style={{ margin: 0 }}>{resp.assumido}</p>
                  {resp.opcoes && <Chips opcoes={resp.opcoes} escolher={escolher} rotulo="Mudar o período:" />}
                </article>)}
              {resp.graf && <GraficoVendas empresa={ctx.empresa} {...resp.graf} pergunta={resp.pergunta} usarIA={!!resp.ia} onSugestao={(x) => void perguntar(x)} />}
              {resp.margem && <ResumoMargem m={resp.margem} rotulo={resp.rotulo ?? ''} />}
              {resp.notas && <ResumoVendas n={resp.notas} rotulo={resp.rotulo ?? ''} semTabela={!!resp.graf} />}
              {resp.vendas && (!resp.vendas.ok
                ? <Vazio titulo="Informe o cliente" texto="Escreva o @ do Instagram ou o nome do cliente (pelo menos 3 letras)." />
                : resp.vendas.clientes.length === 0
                  ? <Vazio titulo={`Não encontrei cliente "${resp.termo}"`} texto="Confira o @ ou o nome. Você pode procurar na tela Clientes." />
                  : <>
                    {resp.vendas.clientes.length > 1 && <p className="sub">Encontrei {resp.vendas.clientes.length}{resp.vendas.mais_candidatos ? '+' : ''} clientes parecidos com "{resp.termo}". Confira qual é o que você procura.</p>}
                    {resp.vendas.clientes.map((c) => <CartaoCliente key={c.parceiro_id} c={c} valores={resp.vendas!.ve_valores} abrir={abrir} podeNota={podeAbrir('fiscal')} />)}
                    <p className="sub">Base: {resp.vendas.base_notas} notas do Bling carregadas ({resp.vendas.base_com_detalhe} com detalhe), atualizada em {diaHora(resp.vendas.base_ate)}. Considera só notas fiscais emitidas, não os pedidos.</p>
                  </>)}
              {!resp.vendas && !resp.notas && !resp.esclarecer && !resp.comparativo && !resp.indispo && !resp.margem && resp.resultados.length === 0
                ? <Vazio titulo="Não encontrei isso nos documentos" texto="Tente outras palavras. Se o assunto deveria estar documentado, peça a um gestor para incluir na base de conhecimento." />
                : resp.resultados.map((r, i) => (
                  <article key={r.chunk_id} className="aviso-caixa" style={{ marginBottom: 10 }}>
                    <strong>{r.fonte_titulo.replace(/\.(md|txt|csv|json)$/i, '')}</strong>{i === 0 && <span className="pill pill-ok" style={{ marginLeft: 8 }}><i />Melhor resposta</span>}
                    {(() => { const t = paraTrecho(r.conteudo); return (<>{t.titulo && <div className="sub" style={{ margin: '6px 0 0', fontWeight: 600 }}>{t.titulo}</div>}<p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{i === 0 ? t.corpo : resumir(t.corpo)}</p></>) })()}
                    {i > 0 && paraTrecho(r.conteudo).corpo.length > 320 && <details><summary className="sub">Ver trecho completo</summary><p style={{ whiteSpace: 'pre-wrap' }}>{paraTrecho(r.conteudo).corpo}</p></details>}
                  </article>))}
                    <div className="barra-acoes">
                      <button className="sec" onClick={() => editar(tn.pergunta)}>Refinar a pergunta</button>
                      {tn.conversa && tn.ordem != null && (
                        <>
                          <span className="espaco" />
                          <small className="sub">Esta resposta ajudou?</small>
                          <button className={'sec' + (tn.av === 'util' ? ' sel' : '')} onClick={() => void avaliar(tn, 'util')} aria-pressed={tn.av === 'util'}>👍 Útil</button>
                          <button className={'sec' + (tn.av === 'errado' ? ' sel' : '')} onClick={() => setTurnos((ts) => ts.map((x) => (x.id === tn.id ? { ...x, avAberto: !x.avAberto } : x)))} aria-pressed={tn.av === 'errado'}>👎 Errado</button>
                        </>)}
                    </div>
                    {tn.avAberto && (
                      <div className="barra-acoes" style={{ marginTop: 6 }}>
                        <input style={{ flex: 1 }} placeholder="O que estava errado? (opcional, sem dados pessoais)" maxLength={500} onKeyDown={(e) => { if (e.key === 'Enter') void avaliar(tn, 'errado', (e.target as HTMLInputElement).value) }} aria-label="O que estava errado" />
                        <small className="sub">Enter para enviar. A equipe revisa; o assistente não aprende sozinho.</small>
                      </div>)}
                  </div>)}
              </div>)
          })}
          <div ref={fim} />
          <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: 12, paddingBottom: 8, marginTop: 16, zIndex: 3 }}>
            {turnos.length > 0 && <div className="barra-acoes" style={{ marginBottom: 6 }}><button className="sec" onClick={novaConversa}>+ Nova conversa</button><small className="sub">Perguntas curtas, como "e do mês passado?", continuam o resultado acima.</small></div>}
          <div className="barra-acoes">
            <input ref={entrada} style={{ flex: 1 }} placeholder="Ex.: quanto tempo dura a reserva de uma peça?" value={pergunta} maxLength={1000}
                   onChange={(e) => setPergunta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void perguntar(pergunta) }} aria-label="Pergunta" />
            <button onClick={() => void perguntar(pergunta)} disabled={ocupado || pergunta.trim().length < 2}>{ocupado ? 'Buscando…' : 'Perguntar'}</button>
          </div>
          {erro && <div className="erro" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
          </div>
        </div>

        <aside style={{ flex: '0 1 300px', minWidth: 240 }} aria-label="Últimas perguntas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Últimas perguntas</h2>
            {itens.length > 0 && <button className="link" onClick={() => void limpar()}>Limpar</button>}
          </div>
          <p className="sub" style={{ marginTop: 4 }}>Só você vê este histórico.</p>
          {itens.length === 0 ? <p className="sub">As perguntas que você fizer aparecem aqui para reaproveitar.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {itens.map((h) => (
                <li key={h.pergunta + h.em} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                  <button className="sec" style={{ flex: 1, textAlign: 'left', whiteSpace: 'normal' }} onClick={() => void perguntar(h.pergunta)} disabled={ocupado} title="Perguntar de novo">
                    {h.pergunta}<small className="sub" style={{ display: 'block' }}>{quando(h.em)}</small>
                  </button>
                  <button className="sec icone-btn" onClick={() => editar(h.pergunta)} title="Editar e continuar a partir desta pergunta" aria-label={`Editar: ${h.pergunta}`}>✎</button>
                </li>))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  )
}
