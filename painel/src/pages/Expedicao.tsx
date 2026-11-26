import { useMemo, useState } from 'react'
import { useEstadoTela } from '../abas'
import type { Contexto } from '../App'
import { apiExpedicao, ESTADO_EXP, type Expedicao as Exp, type Pendente } from '../apiExpedicao'
import { brl, hora } from '../apiVendas'
import { Abas, Campo, Formulario, Modal, useCarregar, Vazio, Titulo } from '../ui'
import { Roteiro } from '../roteiro'
import { criarDemoExpedicao } from './expedicaoDemo'

const PASSOS = [
  { id: 'montou', texto: <>Na aba <strong>A montar</strong>, clique em <strong>Montar envio</strong> na Mariana Costa (3 peças pagas em momentos diferentes viram um envio só).</> },
  { id: 'cobrou', texto: <>Em <strong>Em andamento</strong>, clique em <strong>Definir frete</strong>, informe o valor (ex.: 22,90, SEDEX, 3 dias) e cobre o frete.</> },
  { id: 'reserva_paga', texto: <>A Mariana ainda tinha uma peça reservada: use <strong>Simular: cliente pagou a peça reservada</strong> e junte o pedido novo ao envio aberto.</> },
  { id: 'pagou', texto: <>Quando a cliente pagar o frete, use <strong>Frete pago</strong> (no dia a dia a confirmação da Getnet faz isso sozinha).</> },
  { id: 'gratis', texto: <>Monte o envio da Juliana Prado (VIP) e marque <strong>Frete grátis</strong>: o envio fica pronto na hora.</> },
  { id: 'enviou', texto: <>Em um envio <strong>Pronto para enviar</strong>, clique em <strong>Enviar (rastreio)</strong> e informe o código (ex.: AA123456789BR).</> },
  { id: 'desfez', texto: <>Teste <strong>Desfazer envio</strong> na Paula Ribeiro depois de montar: os pedidos voltam para A montar.</> },
]

// Expedição (pedido 048): cada peça é paga na hora; aqui os pedidos pagos da mesma pessoa e endereço viram UM envio,
// o frete é definido (ou grátis) e cobrado à parte, e o envio sai com o código de rastreio.
type Aba = 'pendentes' | 'andamento' | 'enviadas'
const ABERTOS = ['aguardando_frete', 'frete_cobrado', 'pronta']
const FILTRO: Record<Aba, string | null> = { pendentes: null, andamento: null, enviadas: 'enviada' }

export default function Expedicao({ ctx, abrir }: { ctx: Contexto; abrir?: (id: string, q?: string) => void }) {
  const pode = ctx.perm === null ? ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor', 'suporte', 'expedicao'].includes(p)) : ctx.perm.envios === 'editar'
  const podeFin = ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor', 'suporte', 'financeiro'].includes(p))
  const [aba, setAba] = useEstadoTela<Aba>('expedicao.aba', 'pendentes')
  const [versao, setVersao] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [frete, setFrete] = useState<Exp | null>(null)
  const [pago, setPago] = useState<Exp | null>(null)
  const [enviar, setEnviar] = useState<Exp | null>(null)
  const [desfazer, setDesfazer] = useState<Exp | null>(null)
  const atualizar = () => setVersao((v) => v + 1)
  // simulação: dados fictícios na memória para treinar o time; nada é gravado nem cobrado (não fica lembrada ao sair da tela)
  const [demo, setDemo] = useState(false)
  const [rodada, setRodada] = useState(0)
  const [feitos, setFeitos] = useState<Set<string>>(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fonteDemo = useMemo(() => criarDemoExpedicao((e) => setFeitos((f) => new Set(f).add(e))), [rodada])
  const fonte = demo ? fonteDemo : apiExpedicao
  const recomecar = () => { setFeitos(new Set()); setRodada((r) => r + 1); setAba('pendentes'); setAviso(null); atualizar() }
  const alternarDemo = () => { if (!demo) recomecar(); setDemo(!demo); setAviso(null) }
  const podeSim = demo || pode
  const pend = useCarregar(() => fonte.pendentes(ctx.empresa), [ctx.empresa, versao, demo, rodada])
  const lista = useCarregar(() => aba === 'pendentes' ? Promise.resolve([] as Exp[]) : fonte.lista(ctx.empresa, FILTRO[aba]).then((l) => aba === 'andamento' ? l.filter((x) => ABERTOS.includes(x.estado)) : l), [ctx.empresa, aba, versao, demo, rodada])
  const abertas = useCarregar(() => fonte.lista(ctx.empresa, null).then((l) => l.filter((x) => ABERTOS.includes(x.estado))), [ctx.empresa, versao, demo, rodada])

  async function montar(p: Pendente) {
    setAviso(null)
    try { await fonte.montar(ctx.empresa, p.parceiro_id, p.endereco_id); setAba('andamento'); atualizar() }
    catch (e) { setAviso((e as Error).message) }
  }
  const ab = abertas.dados ?? []
  const conta = (e: string) => ab.filter((x) => x.estado === e).length

  return (
    <section>
      <div className="topo">
        <div><Titulo ajuda={<>Junte as peças pagas da mesma cliente num envio só, defina o frete (ou grátis), cobre o frete e informe o rastreio.</>}>Expedição</Titulo></div>
        <button className={demo ? '' : 'sec'} onClick={alternarDemo} aria-pressed={demo} title="Treine o fluxo com clientes e pedidos fictícios. Nada é gravado nem cobrado.">{demo ? 'Sair da simulação' : 'Simular'}</button>
      </div>
      {demo && <div className="at-demo" role="status"><strong>Simulação:</strong> clientes e pedidos fictícios, só nesta tela. Nada é gravado no banco, cobrado ou enviado. Siga o roteiro abaixo.</div>}
      {demo && <Roteiro titulo="Roteiro de treino · Expedição" passos={PASSOS} feitos={feitos} onRecomecar={recomecar}
        extra={<div className="acoes"><button type="button" className="sec" disabled={feitos.has('reserva_paga')} onClick={() => {
          const quem = fonteDemo.simularPagamentoReserva(); setAba('pendentes'); atualizar()
          setAviso(quem ? null : 'Nenhuma cliente com peça reservada nesta rodada.')
        }}>Simular: cliente pagou a peça reservada</button></div>} />}
      {aviso && <div className="erro" role="alert">{aviso}</div>}
      <div className="resumo-faixa">
        <div className={(pend.dados?.length ?? 0) > 0 ? 'v-alerta' : ''}><strong>{pend.dados?.length ?? '—'}</strong><span>Clientes com peças pagas a enviar</span></div>
        <div><strong>{abertas.dados ? conta('aguardando_frete') : '—'}</strong><span>Definir frete</span></div>
        <div><strong>{abertas.dados ? conta('frete_cobrado') : '—'}</strong><span>Frete a receber</span></div>
        <div><strong>{abertas.dados ? conta('pronta') : '—'}</strong><span>Prontas para enviar</span></div>
      </div>
      <Abas<Aba> ativa={aba} onMudar={setAba} abas={[
        { id: 'pendentes', rotulo: 'A montar', contagem: pend.dados?.length },
        { id: 'andamento', rotulo: 'Em andamento', contagem: abertas.dados?.length },
        { id: 'enviadas', rotulo: 'Enviadas' }]} />

      {aba === 'pendentes' && (pend.erro ? <div className="erro">{pend.erro}</div> : !pend.dados ? <p className="mudo">Carregando…</p>
        : pend.dados.length === 0 ? <Vazio titulo="Nada para montar" texto="Quando uma peça é paga, o pedido aparece aqui agrupado por cliente e endereço." />
        : <div className="tabela-rolagem"><table>
            <thead><tr><th>Cliente</th><th>Endereço</th><th>Pedidos</th><th>Peças</th><th>Valor</th><th>Primeiro pago</th><th /></tr></thead>
            <tbody>{pend.dados.map((p) => (
              <tr key={`${p.parceiro_id}-${p.endereco_id ?? 'x'}`}>
                <td>{demo ? <strong>{p.parceiro}</strong> : <button className="link" onClick={() => abrir?.('parceiros', p.parceiro ?? '')}>{p.parceiro ?? '—'}</button>}{p.vip && <span className="selo selo-reservada" style={{ marginLeft: 6 }}>VIP</span>}
                  {p.reservas_acumuladas > 0 && <div className="mudo pequeno">{p.reservas_acumuladas} peça(s) ainda reservada(s): pode esperar para juntar</div>}</td>
                <td>{p.endereco ?? <span className="mudo">sem endereço</span>}</td>
                <td>{p.pedidos}</td><td>{p.itens}</td><td>{brl(p.valor_itens)}</td><td>{hora(p.primeiro_pago)}</td>
                <td className="acoes-linha">{podeSim && <button onClick={() => montar(p)}>{p.expedicao_aberta ? 'Juntar ao envio aberto' : 'Montar envio'}</button>}</td>
              </tr>))}</tbody></table></div>)}

      {aba !== 'pendentes' && (lista.erro ? <div className="erro">{lista.erro}</div> : !lista.dados ? <p className="mudo">Carregando…</p>
        : lista.dados.length === 0 ? <Vazio titulo="Nenhum envio" texto={aba === 'andamento' ? 'Monte um envio na aba “A montar”.' : 'Os envios despachados aparecem aqui com o rastreio.'} />
        : <div className="lista-envios">{lista.dados.map((x) => (
            <article key={x.id} className="painel envio">
              <div className="envio-topo">
                <strong>Envio {x.numero ?? x.id.slice(0, 6)} · {x.parceiro ?? '—'}</strong>
                <span className={`selo selo-${x.estado === 'pronta' ? 'disponivel' : x.estado === 'enviada' ? 'vendida' : 'reservada'}`}>{ESTADO_EXP[x.estado]}</span>
              </div>
              <div className="mudo pequeno">{x.endereco ?? 'sem endereço'}</div>
              <ul className="envio-pedidos">{(x.pedidos ?? []).map((p) => <li key={p.id}>{p.numero ? `#${p.numero} · ` : ''}{(p.itens ?? []).join(', ') || 'pedido'} · {brl(p.valor)}</li>)}</ul>
              <div className="envio-valores">Peças {brl(x.valor_itens)} · Frete {x.frete_gratis ? 'grátis' : brl(x.valor_frete)}{x.servico ? ` (${x.servico}${x.prazo_dias ? `, ${x.prazo_dias} dias` : ''})` : ''}</div>
              {x.reservas_acumuladas > 0 && x.estado === 'aguardando_frete' && <div className="aviso-caixa">A cliente ainda tem {x.reservas_acumuladas} peça(s) reservada(s). Se pagar, entra neste envio.</div>}
              {x.frete_link && x.estado === 'frete_cobrado' && <div className="pequeno">Link do frete: {demo ? <span className="mudo">{x.frete_link} (fictício: no dia a dia vai para a cliente pagar)</span> : <a href={x.frete_link} target="_blank" rel="noopener noreferrer">{x.frete_link}</a>}</div>}
              {x.codigo_rastreio && <div className="pequeno">Rastreio: <strong>{x.codigo_rastreio}</strong>{x.transportadora ? ` · ${x.transportadora}` : ''} · enviado {hora(x.enviada_em)}</div>}
              {podeSim && <div className="acoes">
                {['aguardando_frete', 'frete_cobrado'].includes(x.estado) && <button onClick={() => setFrete(x)}>{x.estado === 'aguardando_frete' ? 'Definir frete' : 'Alterar frete'}</button>}
                {x.estado === 'frete_cobrado' && (demo || podeFin) && <button className="sec" onClick={() => setPago(x)}>Frete pago</button>}
                {x.estado === 'pronta' && <button onClick={() => setEnviar(x)}>Enviar (rastreio)</button>}
                {['aguardando_frete', 'frete_cobrado', 'pronta'].includes(x.estado) && <button className="sec" onClick={() => setDesfazer(x)}>Desfazer envio</button>}
              </div>}
            </article>))}</div>)}

      {frete && <ModalFrete exp={frete} ctx={ctx} fonte={fonte} onFechar={() => setFrete(null)} onPronto={() => { setFrete(null); atualizar() }} />}
      {pago && <ModalSimples titulo="Frete pago" rotulo="Confirmar" onFechar={() => setPago(null)} campos={['metodo', 'motivo']}
        onEnviar={async (v) => { await fonte.fretePago(ctx.empresa, pago.id, v.metodo || 'pix', v.motivo); setPago(null); atualizar() }} />}
      {enviar && <ModalSimples titulo="Enviar" rotulo="Marcar como enviado" onFechar={() => setEnviar(null)} campos={['rastreio', 'transportadora']}
        onEnviar={async (v) => { await fonte.enviar(ctx.empresa, enviar.id, v.rastreio, v.transportadora || null); setEnviar(null); atualizar() }} />}
      {desfazer && <ModalSimples titulo="Desfazer envio" rotulo="Desfazer" onFechar={() => setDesfazer(null)} campos={['motivo']}
        onEnviar={async (v) => { await fonte.cancelar(ctx.empresa, desfazer.id, v.motivo); setDesfazer(null); atualizar() }} />}
    </section>
  )
}

function ModalFrete({ exp, ctx, fonte, onFechar, onPronto }: { exp: Exp; ctx: Contexto; fonte: typeof apiExpedicao; onFechar: () => void; onPronto: () => void }) {
  const [valor, setValor] = useState(exp.valor_frete ? String(exp.valor_frete).replace('.', ',') : '')
  const [servico, setServico] = useState(exp.servico ?? '')
  const [prazo, setPrazo] = useState(exp.prazo_dias ? String(exp.prazo_dias) : '')
  const [gratis, setGratis] = useState(exp.frete_gratis)
  return (
    <Modal titulo={`Frete · ${exp.parceiro ?? ''}`} onFechar={onFechar}>
      <Formulario enviarRotulo={gratis ? 'Marcar frete grátis' : 'Cobrar frete'} onCancelar={onFechar} onEnviar={async () => {
        const v = gratis ? 0 : Number(valor.replace(/\./g, '').replace(',', '.'))
        if (!gratis && !(v > 0)) throw new Error('Informe o valor do frete ou marque frete grátis.')
        await fonte.definirFrete(ctx.empresa, exp.id, v, servico.trim() || null, prazo ? Number(prazo) : null, gratis); onPronto()
      }}>
        <label className="check"><input type="checkbox" checked={gratis} onChange={(e) => setGratis(e.target.checked)} /> Frete grátis</label>
        {!gratis && <Campo rotulo="Valor do frete (R$)" dica="Gera uma cobrança só do frete para a cliente pagar."><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus /></Campo>}
        <Campo rotulo="Serviço (opcional)"><input value={servico} onChange={(e) => setServico(e.target.value)} placeholder="PAC, SEDEX, motoboy…" /></Campo>
        <Campo rotulo="Prazo em dias (opcional)"><input inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value.replace(/\D/g, ''))} /></Campo>
      </Formulario>
    </Modal>
  )
}

const ROT: Record<string, string> = { metodo: 'Forma de pagamento', motivo: 'Como foi conferido / motivo', rastreio: 'Código de rastreio', transportadora: 'Transportadora (opcional)' }
function ModalSimples({ titulo, rotulo, campos, onFechar, onEnviar }: { titulo: string; rotulo: string; campos: string[]; onFechar: () => void; onEnviar: (v: Record<string, string>) => Promise<void> }) {
  const [v, setV] = useState<Record<string, string>>({ metodo: 'pix' })
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <Formulario enviarRotulo={rotulo} onCancelar={onFechar} onEnviar={() => onEnviar(v)}>
        {campos.map((c) => <Campo key={c} rotulo={ROT[c]}>{c === 'metodo'
          ? <select value={v.metodo} onChange={(e) => setV({ ...v, metodo: e.target.value })}><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="manual">Dinheiro/manual</option><option value="outro">Outro</option></select>
          : <input value={v[c] ?? ''} onChange={(e) => setV({ ...v, [c]: e.target.value })} autoFocus={c !== 'transportadora'} />}</Campo>)}
      </Formulario>
    </Modal>
  )
}
