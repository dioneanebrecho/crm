import { useRef, useState } from 'react'
import { paraTrecho, resumir } from '../textoLimpo'
import { apiConhecimento as api, apiAssistenteDados, type AchadoConhecimento, type VendasCliente, type ClienteVendas } from '../api'
import { classificar } from '../intencao'
import { Vazio, useCarregar } from '../ui'
import { NOME_TELA, acharReferencias, quando, type Referencia } from '../referencias'
import type { Contexto } from '../App'

const EXEMPLOS = [
  'Quais as vendas do cliente @deboraclemente?',
  'Quanto tempo posso deixar um pedido pago sem nota?',
  'O que fazer com cliente que não responde ao link de pagamento?',
  'Como tratar pedido faturado e ainda não expedido?',
]
interface Resposta { pergunta: string; resultados: AchadoConhecimento[]; aviso: string | null; refs: Referencia[]; vendas?: VendasCliente; termo?: string; periodo?: boolean }
const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dia = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')
const diaHora = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

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

export default function Assistente({ ctx, abrir }: { ctx: Contexto; abrir: (aba: string, busca?: string) => void }) {
  const [pergunta, setPergunta] = useState('')
  const [resp, setResp] = useState<Resposta | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const hist = useCarregar(() => api.historico(ctx.empresa), [ctx.empresa])
  const admin = ctx.perm ? ctx.perm['conhecimento'] === 'editar' : ctx.papeis.some((p) => p === 'admin' || p === 'superadmin' || p === 'gestor')
  const podeAbrir = (aba: string) => (ctx.perm ? !!ctx.perm[aba] && ctx.perm[aba] !== 'nenhum' : true)

  async function perguntar(texto: string) {
    const t = texto.trim()
    if (t.length < 2 || ocupado) return
    setPergunta(t); setOcupado(true); setErro(null)
    try {
      const it = classificar(t)
      if (it.tipo === 'cliente') {
        const v = await apiAssistenteDados.vendasCliente(ctx.empresa, it.termo)
        void apiAssistenteDados.registrar(ctx.empresa, t).then(() => hist.recarregar()).catch(() => undefined)
        const refs = v.clientes.length === 0 ? [{ aba: 'clientes' as const, busca: it.termo, rotulo: `Cliente ${it.termo}` }].filter((x) => podeAbrir(x.aba)) : []
        setResp({ pergunta: t, resultados: [], aviso: null, refs, vendas: v, termo: it.termo })
        setOcupado(false); return
      }
      if (it.tipo === 'periodo') {
        void apiAssistenteDados.registrar(ctx.empresa, t).then(() => hist.recarregar()).catch(() => undefined)
        setResp({ pergunta: t, resultados: [], aviso: null, refs: [{ aba: 'fiscal' as const, busca: '', rotulo: 'Notas Bling' }].filter((x) => podeAbrir(x.aba)), periodo: true })
        setOcupado(false); return
      }
      const r = await api.buscar(ctx.empresa, t)
      const refs = acharReferencias([t, ...r.resultados.map((x) => x.conteudo)]).filter((x) => podeAbrir(x.aba))
      setResp({ pergunta: t, resultados: r.resultados, aviso: r.aviso, refs })
      hist.recarregar()
    } catch (e) { setErro((e as Error).message) }
    setOcupado(false)
  }
  const editar = (t: string) => { setPergunta(t); entrada.current?.focus() }
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
          <div className="barra-acoes">
            <input ref={entrada} style={{ flex: 1 }} placeholder="Ex.: quanto tempo dura a reserva de uma peça?" value={pergunta} maxLength={1000}
                   onChange={(e) => setPergunta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void perguntar(pergunta) }} aria-label="Pergunta" />
            <button onClick={() => void perguntar(pergunta)} disabled={ocupado || pergunta.trim().length < 2}>{ocupado ? 'Buscando…' : 'Perguntar'}</button>
          </div>
          {erro && <div className="erro" role="alert" style={{ marginTop: 8 }}>{erro}</div>}

          {!resp && !ocupado && (
            <div style={{ marginTop: 16 }}>
              <p className="sub">Experimente:</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXEMPLOS.map((e) => <button key={e} className="sec" onClick={() => void perguntar(e)}>{e}</button>)}
              </div>
            </div>
          )}

          {resp && (
            <div style={{ marginTop: 16 }}>
              {resp.refs.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                  <small className="sub">Abrir no painel:</small>
                  {resp.refs.map((r) => <button key={r.aba + r.busca} className="sec" title={`Abre ${NOME_TELA[r.aba]} já buscando "${r.busca}"`} onClick={() => abrir(r.aba, r.busca)}>{r.rotulo} →</button>)}
                </div>
              )}
              {resp.aviso && <p className="sub">{resp.aviso}</p>}
              {resp.periodo && <Vazio titulo="Vendas por período ainda não estão disponíveis aqui" texto="Esta pergunta precisa do total de vendas por data. Por enquanto você consegue consultar as vendas de um cliente (ex.: quais as vendas do cliente @fulana?). O total por período entra na próxima etapa, quando as notas estiverem com valor carregado." />}
              {resp.vendas && (!resp.vendas.ok
                ? <Vazio titulo="Informe o cliente" texto="Escreva o @ do Instagram ou o nome do cliente (pelo menos 3 letras)." />
                : resp.vendas.clientes.length === 0
                  ? <Vazio titulo={`Não encontrei cliente "${resp.termo}"`} texto="Confira o @ ou o nome. Você pode procurar na tela Clientes." />
                  : <>
                    {resp.vendas.clientes.length > 1 && <p className="sub">Encontrei {resp.vendas.clientes.length}{resp.vendas.mais_candidatos ? '+' : ''} clientes parecidos com "{resp.termo}". Confira qual é o que você procura.</p>}
                    {resp.vendas.clientes.map((c) => <CartaoCliente key={c.parceiro_id} c={c} valores={resp.vendas!.ve_valores} abrir={abrir} podeNota={podeAbrir('fiscal')} />)}
                    <p className="sub">Base: {resp.vendas.base_notas} notas do Bling carregadas ({resp.vendas.base_com_detalhe} com detalhe), atualizada em {diaHora(resp.vendas.base_ate)}. A carga ainda está em andamento, então a lista pode estar incompleta.</p>
                  </>)}
              {!resp.vendas && !resp.periodo && resp.resultados.length === 0
                ? <Vazio titulo="Não encontrei isso nos documentos" texto="Tente outras palavras. Se o assunto deveria estar documentado, peça a um gestor para incluir na base de conhecimento." />
                : resp.resultados.map((r, i) => (
                  <article key={r.chunk_id} className="aviso-caixa" style={{ marginBottom: 10 }}>
                    <strong>{r.fonte_titulo.replace(/\.(md|txt|csv|json)$/i, '')}</strong>{i === 0 && <span className="pill pill-ok" style={{ marginLeft: 8 }}><i />Melhor resposta</span>}
                    {(() => { const t = paraTrecho(r.conteudo); return (<>{t.titulo && <div className="sub" style={{ margin: '6px 0 0', fontWeight: 600 }}>{t.titulo}</div>}<p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{i === 0 ? t.corpo : resumir(t.corpo)}</p></>) })()}
                    {i > 0 && paraTrecho(r.conteudo).corpo.length > 320 && <details><summary className="sub">Ver trecho completo</summary><p style={{ whiteSpace: 'pre-wrap' }}>{paraTrecho(r.conteudo).corpo}</p></details>}
                  </article>))}
              <div className="barra-acoes">
                <button className="sec" onClick={() => editar(resp.pergunta)}>Refinar a pergunta</button>
              </div>
            </div>
          )}
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
