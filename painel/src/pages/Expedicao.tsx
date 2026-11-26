import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEstadoTela } from '../abas'
import type { Contexto } from '../App'
import { ABERTOS, apiExpedicao, ESTADO_EXP, SITUACAO_TITULO, type Conferencia, type CotacaoFrete, type Expedicao as Exp, type Pendente, type Rastreio, type TituloFrete } from '../apiExpedicao'
import { brl, hora } from '../apiVendas'
import { Abas, Campo, Formulario, Modal, useCarregar, Vazio, Titulo } from '../ui'
import { Roteiro } from '../roteiro'
import { bipeErro, bipeOk, LeitorCodigo } from '../LeitorCodigo'
import { criarDemoExpedicao, type FonteDemoExpedicao } from './expedicaoDemo'

const PASSOS = [
  { id: 'montou', texto: <>Na aba <strong>A montar</strong>, clique em <strong>Montar envio</strong> na Mariana Costa (3 peças pagas em momentos diferentes viram um envio só).</> },
  { id: 'bipou', texto: <>Vá para <strong>Conferência</strong> e bipe <code>VES-014-M-001</code>. Depois tente bipar <code>CAS-007-P-001</code>, que é de outra cliente, e veja o aviso.</> },
  { id: 'conferiu', texto: <>Bipe o resto das peças da Mariana, confirme o peso da caixa e clique em <strong>Conferência concluída</strong>.</> },
  { id: 'cobrou', texto: <>Em <strong>Em andamento</strong>, clique em <strong>Cotar frete</strong>: aparecem PAC, SEDEX e Jadlog com prazo, custo e quanto cobrar. Escolha uma e cobre da cliente.</> },
  { id: 'reserva_paga', texto: <>A Mariana ainda tinha uma peça reservada: use <strong>Simular: cliente pagou a peça reservada</strong> e junte o pedido novo ao envio aberto (ele volta para a conferência).</> },
  { id: 'pagou', texto: <>O envio mostra o Pix do frete. Clique em <strong>Simular: cliente pagou pela Getnet</strong> — no dia a dia a notificação da Getnet faz isso sozinha e o envio fica pronto.</> },
  { id: 'etiqueta', texto: <>Clique em <strong>Comprar etiqueta</strong>: o Melhor Envio gera o PDF, devolve o código de rastreio e o custo vira contas a pagar. O cartão passa a mostrar o resultado do frete.</> },
  { id: 'enviou', texto: <>Em um envio <strong>Pronto para enviar</strong>, clique em <strong>Enviar (rastreio)</strong> e informe o código (ex.: AA123456789BR).</> },
  { id: 'gratis', texto: <>Monte e confira o envio da Juliana Prado (VIP) e marque <strong>Frete grátis</strong>: o envio fica pronto na hora, sem cobrança.</> },
  { id: 'desfez', texto: <>Teste <strong>Desfazer envio</strong> na Paula Ribeiro depois de montar: os pedidos voltam para A montar.</> },
]

// Expedição (pedidos 048 e 049): cada peça é paga na hora; aqui os pedidos pagos da mesma pessoa e endereço viram UM envio,
// a equipe confere as peças bipando o código de barras, o frete é definido (ou grátis) e cobrado à parte,
// o custo da postagem vira contas a pagar, e o envio sai com o código de rastreio.
type Aba = 'pendentes' | 'conferencia' | 'andamento' | 'enviadas'
const FILTRO: Record<Aba, string | null> = { pendentes: null, conferencia: null, andamento: null, enviadas: 'enviada' }

export default function Expedicao({ ctx, abrir }: { ctx: Contexto; abrir?: (id: string, q?: string) => void }) {
  const pode = ctx.perm === null ? ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor', 'suporte', 'expedicao'].includes(p)) : ctx.perm.envios === 'editar'
  const podeFin = ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor', 'suporte', 'financeiro'].includes(p))
  const [aba, setAba] = useEstadoTela<Aba>('expedicao.aba', 'pendentes')
  const [versao, setVersao] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [frete, setFrete] = useState<Exp | null>(null)
  const [cotar, setCotar] = useState<Exp | null>(null)
  const [pago, setPago] = useState<Exp | null>(null)
  const [custo, setCusto] = useState<Exp | null>(null)
  const [enviar, setEnviar] = useState<Exp | null>(null)
  const [desfazer, setDesfazer] = useState<Exp | null>(null)
  const [refazer, setRefazer] = useState<Exp | null>(null)
  const [verRastreio, setVerRastreio] = useState<Exp | null>(null)
  const [conferindo, setConferindo] = useState<string | null>(null)
  const atualizar = () => setVersao((v) => v + 1)
  // simulação: dados fictícios na memória para treinar o time; nada é gravado nem cobrado (não fica lembrada ao sair da tela)
  const [demo, setDemo] = useState(false)
  const [rodada, setRodada] = useState(0)
  const [feitos, setFeitos] = useState<Set<string>>(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fonteDemo = useMemo(() => criarDemoExpedicao((e) => setFeitos((f) => new Set(f).add(e))), [rodada])
  const fonte = demo ? fonteDemo : apiExpedicao
  const recomecar = () => { setFeitos(new Set()); setRodada((r) => r + 1); setAba('pendentes'); setAviso(null); setConferindo(null); atualizar() }
  const alternarDemo = () => { if (!demo) recomecar(); setDemo(!demo); setAviso(null); setConferindo(null) }
  const podeSim = demo || pode
  const pend = useCarregar(() => fonte.pendentes(ctx.empresa), [ctx.empresa, versao, demo, rodada])
  const lista = useCarregar(() => aba === 'pendentes' || aba === 'conferencia' ? Promise.resolve([] as Exp[])
    : fonte.lista(ctx.empresa, FILTRO[aba]).then((l) => aba === 'andamento' ? l.filter((x) => ABERTOS.includes(x.estado)) : l), [ctx.empresa, aba, versao, demo, rodada])
  const abertas = useCarregar(() => fonte.lista(ctx.empresa, null).then((l) => l.filter((x) => ABERTOS.includes(x.estado))), [ctx.empresa, versao, demo, rodada])

  async function montar(p: Pendente) {
    setAviso(null)
    try {
      const id = await fonte.montar(ctx.empresa, p.parceiro_id, p.endereco_id)
      setConferindo(id); setAba('conferencia'); atualizar()
    } catch (e) { setAviso((e as Error).message) }
  }
  const ab = abertas.dados ?? []
  const conta = (e: string) => ab.filter((x) => x.estado === e).length
  const aConferir = ab.filter((x) => x.estado === 'aguardando_conferencia')

  return (
    <section>
      <div className="topo">
        <div><Titulo ajuda={<>Junte as peças pagas da mesma cliente num envio só, confira bipando o código de barras, defina o frete (ou grátis), cobre, lance o custo da postagem e informe o rastreio.</>}>Expedição</Titulo></div>
        <button className={demo ? '' : 'sec'} onClick={alternarDemo} aria-pressed={demo} title="Treine o fluxo com clientes e pedidos fictícios. Nada é gravado nem cobrado.">{demo ? 'Sair da simulação' : 'Simular'}</button>
      </div>
      {demo && <div className="at-demo" role="status"><strong>Simulação:</strong> clientes, peças e pedidos fictícios, só nesta tela. Nada é gravado no banco, cobrado ou enviado. Siga o roteiro abaixo.</div>}
      {demo && <Roteiro titulo="Roteiro de treino · Expedição" passos={PASSOS} feitos={feitos} onRecomecar={recomecar}
        extra={<div className="acoes"><button type="button" className="sec" disabled={feitos.has('reserva_paga')} onClick={() => {
          const quem = fonteDemo.simularPagamentoReserva(); setAba('pendentes'); atualizar()
          setAviso(quem ? null : 'Nenhuma cliente com peça reservada nesta rodada.')
        }}>Simular: cliente pagou a peça reservada</button></div>} />}
      {aviso && <div className="erro" role="alert">{aviso}</div>}
      <div className="resumo-faixa">
        <div className={(pend.dados?.length ?? 0) > 0 ? 'v-alerta' : ''}><strong>{pend.dados?.length ?? '—'}</strong><span>Clientes com peças pagas a enviar</span></div>
        <div className={aConferir.length > 0 ? 'v-alerta' : ''}><strong>{abertas.dados ? conta('aguardando_conferencia') : '—'}</strong><span>A conferir</span></div>
        <div><strong>{abertas.dados ? conta('conferida') : '—'}</strong><span>Definir frete</span></div>
        <div><strong>{abertas.dados ? conta('frete_cobrado') : '—'}</strong><span>Frete a receber</span></div>
        <div><strong>{abertas.dados ? conta('pronta') : '—'}</strong><span>Prontas para enviar</span></div>
      </div>
      <Abas<Aba> ativa={aba} onMudar={(a) => { setAba(a); setAviso(null) }} abas={[
        { id: 'pendentes', rotulo: 'A montar', contagem: pend.dados?.length },
        { id: 'conferencia', rotulo: 'Conferência', contagem: aConferir.length },
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

      {aba === 'conferencia' && <PainelConferencia ctx={ctx} fonte={fonte} demo={demo} podeSim={podeSim}
        expedicaoId={conferindo} onEscolher={setConferindo} aConferir={aConferir} carregando={!abertas.dados}
        onPronto={() => { setConferindo(null); setAba('andamento'); atualizar() }} onMudou={atualizar} />}

      {(aba === 'andamento' || aba === 'enviadas') && (lista.erro ? <div className="erro">{lista.erro}</div> : !lista.dados ? <p className="mudo">Carregando…</p>
        : lista.dados.length === 0 ? <Vazio titulo="Nenhum envio" texto={aba === 'andamento' ? 'Monte um envio na aba “A montar”.' : 'Os envios despachados aparecem aqui com o rastreio.'} />
        : <div className="lista-envios">{lista.dados.map((x) => (
            <article key={x.id} className="painel envio">
              <div className="envio-topo">
                <strong>Envio {x.numero ?? x.id.slice(0, 6)} · {x.parceiro ?? '—'}</strong>
                <span className={`selo selo-${x.estado === 'pronta' ? 'disponivel' : x.estado === 'enviada' || x.estado === 'entregue' ? 'vendida' : 'reservada'}`}>{ESTADO_EXP[x.estado]}</span>
              </div>
              <div className="mudo pequeno">{x.endereco ?? 'sem endereço'}</div>
              <ul className="envio-pedidos">{(x.pedidos ?? []).map((p) => <li key={p.id}>{p.numero ? `#${p.numero} · ` : ''}{(p.itens ?? []).join(', ') || 'pedido'} · {brl(p.valor)}</li>)}</ul>
              <div className="envio-valores">
                Peças {brl(x.valor_itens)} · Frete {x.frete_gratis ? 'grátis' : brl(x.valor_frete)}{x.servico ? ` (${x.servico}${x.prazo_dias ? `, ${x.prazo_dias} dias` : ''})` : ''}
                {x.peso_g !== null && <> · Caixa {(x.peso_g / 1000).toFixed(3).replace('.', ',')} kg{x.comprimento_cm ? ` · ${x.comprimento_cm}×${x.largura_cm}×${x.altura_cm} cm` : ''}</>}
              </div>
              {x.estado === 'aguardando_conferencia' && <div className="aviso-caixa">Faltam {x.itens_total - x.conferidos} de {x.itens_total} peça(s) para bipar. {podeSim && <button className="link" onClick={() => { setConferindo(x.id); setAba('conferencia') }}>Abrir conferência</button>}</div>}
              <LinhaFinanceira exp={x} />
              {x.reservas_acumuladas > 0 && ['aguardando_conferencia', 'conferida'].includes(x.estado) && <div className="aviso-caixa">A cliente ainda tem {x.reservas_acumuladas} peça(s) reservada(s). Se pagar, entra neste envio e a conferência é refeita.</div>}
              {x.frete_link && x.estado === 'frete_cobrado' && <div className="pequeno">Link do frete: {demo ? <span className="mudo">{x.frete_link} (fictício: no dia a dia vai para a cliente pagar)</span> : <a href={x.frete_link} target="_blank" rel="noopener noreferrer">{x.frete_link}</a>}</div>}
              {x.pix_copia_cola && x.estado === 'frete_cobrado' && <div className="pix-frete">
                <div className="pequeno"><strong>Pix do frete</strong> · Getnet{demo ? ' (fictício)' : ''} · copia e cola</div>
                <code className="pix-codigo">{x.pix_copia_cola}</code>
                <button type="button" className="sec" onClick={() => navigator.clipboard?.writeText(x.pix_copia_cola ?? '')}>Copiar</button>
              </div>}
              {x.etiqueta && <div className="pequeno">Etiqueta {x.etiqueta.protocolo ?? ''} · {x.etiqueta.estado}
                {x.etiqueta.custo !== null ? ` · custo ${brl(x.etiqueta.custo)}` : ''}
                {x.etiqueta.etiqueta_url && <> · {demo ? <span className="mudo">imprimir (PDF fictício)</span> : <a href={x.etiqueta.etiqueta_url} target="_blank" rel="noopener noreferrer">imprimir</a>}</>}
                {x.etiqueta.codigo_rastreio && <> · rastreio <strong>{x.etiqueta.codigo_rastreio}</strong></>}</div>}
              {x.codigo_rastreio && <div className="pequeno">Rastreio: <strong>{x.codigo_rastreio}</strong>{x.transportadora ? ` · ${x.transportadora}` : ''}
                {x.url_rastreio && !demo && <> · <a href={x.url_rastreio} target="_blank" rel="noopener noreferrer">acompanhar</a></>}
                {x.enviada_em && ` · enviado ${hora(x.enviada_em)}`}</div>}
              {podeSim && <div className="acoes">
                {x.estado === 'aguardando_conferencia' && <button onClick={() => { setConferindo(x.id); setAba('conferencia') }}>Conferir peças</button>}
                {demo && ['conferida', 'frete_cobrado'].includes(x.estado) && <button onClick={() => setCotar(x)}>Cotar frete</button>}
                {['conferida', 'frete_cobrado'].includes(x.estado) && <button className={demo ? 'sec' : ''} onClick={() => setFrete(x)}>{x.estado === 'conferida' ? 'Definir frete' : 'Alterar frete'}</button>}
                {x.estado === 'conferida' && <button className="sec" onClick={() => setRefazer(x)}>Refazer conferência</button>}
                {demo && x.estado === 'frete_cobrado' && <button onClick={async () => {
                  setAviso(null)
                  try { await fonteDemo.simularPagamentoGetnet(x.id); atualizar() } catch (e) { setAviso((e as Error).message) }
                }}>Simular: cliente pagou pela Getnet</button>}
                {x.estado === 'frete_cobrado' && (demo || podeFin) && <button className="sec" onClick={() => setPago(x)}>Frete pago</button>}
                {demo && x.estado === 'pronta' && !x.etiqueta && <button onClick={async () => {
                  setAviso(null)
                  try { await fonteDemo.comprarEtiqueta(x.id); atualizar() } catch (e) { setAviso((e as Error).message) }
                }}>Comprar etiqueta</button>}
                {['pronta', 'enviada', 'entregue'].includes(x.estado) && (demo || podeFin) && <button className="sec" onClick={() => setCusto(x)}>{x.custo_frete === null ? 'Custo da postagem' : 'Corrigir custo'}</button>}
                {x.estado === 'pronta' && <button onClick={() => setEnviar(x)}>Enviar (rastreio)</button>}
                {x.estado === 'enviada' && <button className="sec" onClick={() => setVerRastreio(x)}>Ver rastreio</button>}
                {ABERTOS.includes(x.estado) && <button className="sec" onClick={() => setDesfazer(x)}>Desfazer envio</button>}
              </div>}
            </article>))}</div>)}

      {cotar && <ModalCotacao exp={cotar} fonte={fonteDemo} onFechar={() => setCotar(null)} onPronto={() => { setCotar(null); atualizar() }} />}
      {frete && <ModalFrete exp={frete} ctx={ctx} fonte={fonte} onFechar={() => setFrete(null)} onPronto={() => { setFrete(null); atualizar() }} />}
      {custo && <ModalCusto exp={custo} ctx={ctx} fonte={fonte} onFechar={() => setCusto(null)} onPronto={() => { setCusto(null); atualizar() }} />}
      {verRastreio && <ModalRastreio exp={verRastreio} ctx={ctx} fonte={fonte} demo={demo} podeSim={podeSim}
        onFechar={() => setVerRastreio(null)} onPronto={() => { setVerRastreio(null); atualizar() }} />}
      {pago && <ModalSimples titulo="Frete pago" rotulo="Confirmar" onFechar={() => setPago(null)} campos={['metodo', 'motivo']}
        onEnviar={async (v) => { await fonte.fretePago(ctx.empresa, pago.id, v.metodo || 'pix', v.motivo); setPago(null); atualizar() }} />}
      {enviar && <ModalSimples titulo="Enviar" rotulo="Marcar como enviado" onFechar={() => setEnviar(null)} campos={['rastreio', 'transportadora']}
        onEnviar={async (v) => { await fonte.enviar(ctx.empresa, enviar.id, v.rastreio, v.transportadora || null); setEnviar(null); atualizar() }} />}
      {desfazer && <ModalSimples titulo="Desfazer envio" rotulo="Desfazer" onFechar={() => setDesfazer(null)} campos={['motivo']}
        onEnviar={async (v) => { await fonte.cancelar(ctx.empresa, desfazer.id, v.motivo); setDesfazer(null); atualizar() }} />}
      {refazer && <ModalSimples titulo="Refazer conferência" rotulo="Refazer" onFechar={() => setRefazer(null)} campos={['motivo']}
        onEnviar={async (v) => { await fonte.reabrirConferencia(ctx.empresa, refazer.id, v.motivo); setRefazer(null); setConferindo(refazer.id); setAba('conferencia'); atualizar() }} />}
    </section>
  )
}

// ---------------------------------------------------------------- financeiro do frete, no cartão do envio
function selo(t: TituloFrete | null) { return t ? `${SITUACAO_TITULO[t.situacao]} · título #${t.numero}` : null }
function LinhaFinanceira({ exp }: { exp: Exp }) {
  if (!exp.titulo_receber && !exp.titulo_pagar && exp.custo_frete === null) return null
  return (
    <div className="pequeno envio-financeiro">
      {exp.titulo_receber && <span>A receber {brl(exp.titulo_receber.valor)} — <strong>{selo(exp.titulo_receber)}</strong></span>}
      {exp.custo_frete !== null && <span>{exp.titulo_receber ? ' · ' : ''}A pagar {brl(exp.custo_frete)}{exp.titulo_pagar ? <> — <strong>{selo(exp.titulo_pagar)}</strong></> : null}</span>}
      {exp.resultado_frete !== null && <span> · Resultado do frete <strong className={exp.resultado_frete < 0 ? 'v-alerta' : ''}>{brl(exp.resultado_frete)}</strong></span>}
    </div>
  )
}

// ---------------------------------------------------------------- conferência: bipar o código de barras das peças
function PainelConferencia({ ctx, fonte, demo, podeSim, expedicaoId, onEscolher, aConferir, carregando, onPronto, onMudou }: {
  ctx: Contexto; fonte: typeof apiExpedicao; demo: boolean; podeSim: boolean
  expedicaoId: string | null; onEscolher: (id: string | null) => void; aConferir: Exp[]; carregando: boolean
  onPronto: () => void; onMudou: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [conf, setConf] = useState<Conferencia | null>(null)
  const [peso, setPeso] = useState('')
  const [medidas, setMedidas] = useState({ c: '', l: '', a: '' })
  const [ocupado, setOcupado] = useState(false)
  const [camera, setCamera] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const temCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  useEffect(() => {
    let vivo = true
    if (!expedicaoId) { setConf(null); return }
    fonte.conferencia(ctx.empresa, expedicaoId)
      .then((c) => { if (!vivo) return; setConf(c); setPeso(String(c.peso_g)); setMedidas({ c: String(c.comprimento_cm), l: String(c.largura_cm), a: String(c.altura_cm) }) })
      .catch((e) => { if (vivo) setErro((e as Error).message) })
    return () => { vivo = false }
  }, [ctx.empresa, fonte, expedicaoId])
  useEffect(() => { campo.current?.focus() }, [expedicaoId, conf?.conferidos])

  // o mesmo caminho serve para três entradas: digitar, coletor com leitor laser (digita e manda Enter) e câmera
  async function processar(bruto: string) {
    const c = bruto.trim()
    if (!c || ocupado) return
    setErro(null); setOk(null); setOcupado(true)
    try {
      if (!expedicaoId) {
        const achado = await fonte.porCodigo(ctx.empresa, c)
        onEscolher(achado.expedicao_id)
        setOk(`Envio ${achado.numero ?? ''} · ${achado.parceiro ?? ''}`)
        if (achado.estado === 'aguardando_conferencia') {
          const r = await fonte.conferirPeca(ctx.empresa, achado.expedicao_id, c)
          setOk(`${r.descricao ?? c} · ${r.conferidos} de ${r.total}`)
        }
      } else {
        const r = await fonte.conferirPeca(ctx.empresa, expedicaoId, c)
        setConf((v) => v && { ...v, total: r.total, conferidos: r.conferidos, itens: r.itens })
        setOk(`${r.descricao ?? c} · ${r.conferidos} de ${r.total}`)
      }
      bipeOk()
      setCodigo('')
      onMudou()
    } catch (e) { bipeErro(); setErro((e as Error).message); setCodigo('') }
    finally { setOcupado(false); if (!camera) campo.current?.focus() }
  }
  function bipar(ev: React.FormEvent) { ev.preventDefault(); void processar(codigo) }
  // a câmera lê em laço: o callback precisa ser estável, senão a câmera reabre a cada leitura
  const aoLer = useRef<(c: string) => void>(() => undefined)
  aoLer.current = (c) => { void processar(c) }
  const aoLerEstavel = useCallback((c: string) => aoLer.current(c), [])

  async function fechar() {
    if (!expedicaoId) return
    setErro(null)
    const g = Number(peso.replace(/\D/g, ''))
    try {
      await fonte.fecharConferencia(ctx.empresa, expedicaoId, g, Number(medidas.c) || null, Number(medidas.l) || null, Number(medidas.a) || null)
      onPronto()
    } catch (e) { setErro((e as Error).message) }
  }

  const falta = conf ? conf.total - conf.conferidos : 0
  return (
    <div className="conferencia">
      <form className="conferencia-bipagem" onSubmit={bipar}>
        <Campo rotulo={expedicaoId ? 'Bipe a próxima peça' : 'Bipe qualquer peça para achar o envio'}
          dica={expedicaoId ? 'Código de barras ou QR da etiqueta, ou o código curto da live. Serve para digitar, para o coletor e para a câmera.' : 'O envio da peça abre sozinho e a peça já entra como conferida.'}>
          <input ref={campo} value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus autoComplete="off"
            placeholder="VES-014-M-001" aria-label="Código da peça" disabled={ocupado} />
        </Campo>
        <button type="submit" disabled={ocupado || !codigo.trim()}>Bipar</button>
        {temCamera && <button type="button" className={camera ? '' : 'sec'} onClick={() => setCamera(!camera)} aria-pressed={camera}>
          {camera ? 'Fechar câmera' : 'Ler com a câmera'}</button>}
        {expedicaoId && <button type="button" className="sec" onClick={() => { onEscolher(null); setErro(null); setOk(null); setCodigo('') }}>Trocar de envio</button>}
      </form>
      {camera && <LeitorCodigo onLer={aoLerEstavel} onFechar={() => { setCamera(false); campo.current?.focus() }} ocupado={ocupado} />}
      {erro && <div className="erro conferencia-erro" role="alert">{erro}</div>}
      {ok && !erro && <div className="at-demo" role="status">{ok}</div>}

      {!expedicaoId && (carregando ? <p className="mudo">Carregando…</p>
        : aConferir.length === 0 ? <Vazio titulo="Nada a conferir" texto="Monte um envio na aba “A montar” para começar a conferência." />
        : <div className="tabela-rolagem"><table>
            <thead><tr><th>Envio</th><th>Cliente</th><th>Peças</th><th /></tr></thead>
            <tbody>{aConferir.map((x) => (
              <tr key={x.id}>
                <td>{x.numero ?? x.id.slice(0, 6)}</td><td>{x.parceiro ?? '—'}</td>
                <td>{x.conferidos} de {x.itens_total}</td>
                <td className="acoes-linha"><button className="sec" onClick={() => onEscolher(x.id)}>Abrir</button></td>
              </tr>))}</tbody></table></div>)}

      {expedicaoId && conf && (
        <article className="painel envio">
          <div className="envio-topo">
            <strong>Envio {conf.numero ?? ''} · {conf.parceiro ?? '—'}</strong>
            <span className={`selo selo-${falta === 0 ? 'disponivel' : 'reservada'}`}>{conf.conferidos} de {conf.total}</span>
          </div>
          <div className="mudo pequeno">{conf.endereco ?? 'sem endereço'}</div>
          <ul className="conferencia-itens">{conf.itens.map((i) => (
            <li key={i.pedido_item_id} className={i.conferido ? 'conferido' : ''}>
              <span aria-hidden>{i.conferido ? '✓' : '○'}</span> <code>{i.codigo ?? '—'}</code> {i.descricao}
            </li>))}</ul>
          {conf.estado !== 'aguardando_conferencia'
            ? <div className="at-demo" role="status">Conferência já concluída{conf.conferida_em ? ` em ${hora(conf.conferida_em)}` : ''}. Volte em <strong>Em andamento</strong> para o frete.</div>
            : <>
                <div className="conferencia-caixa">
                  <Campo rotulo="Peso da caixa (g)" dica="Pesa a caixa fechada. Começa com a estimativa pelo número de peças."><input inputMode="numeric" value={peso} onChange={(e) => setPeso(e.target.value.replace(/\D/g, ''))} /></Campo>
                  <Campo rotulo="Comprimento (cm)"><input inputMode="numeric" value={medidas.c} onChange={(e) => setMedidas({ ...medidas, c: e.target.value.replace(/\D/g, '') })} /></Campo>
                  <Campo rotulo="Largura (cm)"><input inputMode="numeric" value={medidas.l} onChange={(e) => setMedidas({ ...medidas, l: e.target.value.replace(/\D/g, '') })} /></Campo>
                  <Campo rotulo="Altura (cm)"><input inputMode="numeric" value={medidas.a} onChange={(e) => setMedidas({ ...medidas, a: e.target.value.replace(/\D/g, '') })} /></Campo>
                </div>
                {podeSim && <div className="acoes">
                  <button disabled={falta > 0} onClick={fechar} title={falta > 0 ? `Faltam ${falta} peça(s)` : undefined}>Conferência concluída</button>
                  {falta > 0 && <span className="mudo pequeno">Faltam {falta} peça(s) para bipar.</span>}
                </div>}
              </>}
          {demo && <p className="mudo pequeno">Na simulação os códigos são fictícios: VES-014-M-001, BLU-207-P-001, CAL-088-38-001 (Mariana); JAQ-033-G-001, SAI-112-M-001, ACE-004-U-001 (Juliana); CAM-061-M-001 (Paula).</p>}
        </article>)}
    </div>
  )
}

// ---------------------------------------------------------------- cotação de frete (fase 4: Melhor Envio)
function ModalCotacao({ exp, fonte, onFechar, onPronto }: { exp: Exp; fonte: FonteDemoExpedicao; onFechar: () => void; onPronto: () => void }) {
  const [erro, setErro] = useState<string | null>(null)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [aCobrar, setACobrar] = useState('')
  const [enviando, setEnviando] = useState(false)
  const cot = useCarregar<CotacaoFrete[]>(() => fonte.cotar(exp.id), [exp.id])
  const lista = (cot.dados ?? []).filter((c) => !c.erro)
  const falhas = (cot.dados ?? []).filter((c) => c.erro)
  const maisBarata = lista.length ? lista.reduce((a, b) => (a.custo <= b.custo ? a : b)).id : null
  const maisRapida = lista.length ? lista.reduce((a, b) => (a.prazo_max <= b.prazo_max ? a : b)).id : null

  function escolher(c: CotacaoFrete) { setEscolhida(c.id); setACobrar(c.a_cobrar.toFixed(2).replace('.', ',')) }
  async function cobrar() {
    if (!escolhida) return
    const v = Number(aCobrar.replace(/\./g, '').replace(',', '.'))
    if (!(v > 0)) { setErro('Informe quanto cobrar da cliente.'); return }
    setErro(null); setEnviando(true)
    try { await fonte.escolherCotacao(exp.id, escolhida, v); onPronto() }
    catch (e) { setErro((e as Error).message); setEnviando(false) }
  }
  return (
    <Modal titulo={`Cotar frete · envio ${exp.numero ?? ''}`} onFechar={onFechar} larga>
      <p className="mudo pequeno">
        Caixa conferida: {exp.peso_g ? `${(exp.peso_g / 1000).toFixed(3).replace('.', ',')} kg` : 'sem peso'}
        {exp.comprimento_cm ? ` · ${exp.comprimento_cm}×${exp.largura_cm}×${exp.altura_cm} cm` : ''} · CEP de destino do endereço da cliente.
      </p>
      {erro && <div className="erro" role="alert">{erro}</div>}
      {cot.erro ? <div className="erro">{cot.erro}</div> : !cot.dados ? <p className="mudo">Cotando…</p> : <>
        <div className="tabela-rolagem"><table>
          <thead><tr><th /><th>Transportadora</th><th>Serviço</th><th>Prazo</th><th>Custo</th><th>A cobrar</th></tr></thead>
          <tbody>{lista.map((c) => (
            <tr key={c.id} className={escolhida === c.id ? 'sel' : ''}>
              <td><input type="radio" name="cotacao" checked={escolhida === c.id} onChange={() => escolher(c)} aria-label={`${c.transportadora} ${c.servico}`} /></td>
              <td>{c.transportadora}</td>
              <td>{c.servico}
                {c.id === maisBarata && <span className="selo selo-disponivel" style={{ marginLeft: 6 }}>mais barato</span>}
                {c.id === maisRapida && c.id !== maisBarata && <span className="selo selo-reservada" style={{ marginLeft: 6 }}>mais rápido</span>}</td>
              <td>{c.prazo_min === c.prazo_max ? `${c.prazo_max} dias` : `${c.prazo_min} a ${c.prazo_max} dias`}</td>
              <td>{brl(c.custo)}</td>
              <td>{escolhida === c.id
                ? <input inputMode="decimal" value={aCobrar} onChange={(e) => setACobrar(e.target.value)} style={{ width: 90 }} aria-label="Valor a cobrar" />
                : brl(c.a_cobrar)}</td>
            </tr>))}</tbody></table></div>
        {falhas.map((c) => <p key={c.id} className="mudo pequeno">{c.transportadora}: {c.erro}</p>)}
        <p className="mudo pequeno">O <strong>custo</strong> é o que a loja paga ao comprar a etiqueta (vira contas a pagar). O <strong>a cobrar</strong> é o que vai no Pix da cliente — dá para ajustar.</p>
        <div className="acoes">
          <button disabled={!escolhida || enviando} onClick={cobrar}>Cobrar da cliente</button>
          <button className="sec" onClick={onFechar}>Cancelar</button>
        </div>
      </>}
    </Modal>
  )
}

// ---------------------------------------------------------------- modais
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
        {exp.peso_g !== null && <p className="mudo pequeno">Caixa conferida: {(exp.peso_g / 1000).toFixed(3).replace('.', ',')} kg · {exp.comprimento_cm}×{exp.largura_cm}×{exp.altura_cm} cm.</p>}
        <label className="check"><input type="checkbox" checked={gratis} onChange={(e) => setGratis(e.target.checked)} /> Frete grátis</label>
        {!gratis && <Campo rotulo="Valor do frete (R$)" dica="Gera uma cobrança só do frete para a cliente pagar, e um título a receber no financeiro."><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus /></Campo>}
        <Campo rotulo="Serviço (opcional)"><input value={servico} onChange={(e) => setServico(e.target.value)} placeholder="PAC, SEDEX, motoboy…" /></Campo>
        <Campo rotulo="Prazo em dias (opcional)"><input inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value.replace(/\D/g, ''))} /></Campo>
      </Formulario>
    </Modal>
  )
}

function ModalCusto({ exp, ctx, fonte, onFechar, onPronto }: { exp: Exp; ctx: Contexto; fonte: typeof apiExpedicao; onFechar: () => void; onPronto: () => void }) {
  const [valor, setValor] = useState(exp.custo_frete ? String(exp.custo_frete).replace('.', ',') : '')
  const [documento, setDocumento] = useState('')
  const [pago, setPago] = useState(true)
  return (
    <Modal titulo={`Custo da postagem · envio ${exp.numero ?? ''}`} onFechar={onFechar}>
      <Formulario enviarRotulo="Lançar custo" onCancelar={onFechar} onEnviar={async () => {
        const v = Number(valor.replace(/\./g, '').replace(',', '.'))
        if (!(v > 0)) throw new Error('Informe quanto a loja pagou pela postagem.')
        await fonte.registrarCusto(ctx.empresa, exp.id, v, null, documento.trim() || null, pago); onPronto()
      }}>
        <p className="mudo pequeno">O que a loja paga à transportadora. Vira um título a pagar no financeiro, separado do frete cobrado da cliente ({exp.frete_gratis ? 'grátis' : brl(exp.valor_frete)}).</p>
        <Campo rotulo="Custo (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus /></Campo>
        <Campo rotulo="Documento (opcional)" dica="Número do recibo ou da pré-postagem."><input value={documento} onChange={(e) => setDocumento(e.target.value)} /></Campo>
        <label className="check"><input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Já pago (baixa o título na hora)</label>
      </Formulario>
    </Modal>
  )
}

function ModalRastreio({ exp, ctx, fonte, demo, podeSim, onFechar, onPronto }: {
  exp: Exp; ctx: Contexto; fonte: typeof apiExpedicao; demo: boolean; podeSim: boolean; onFechar: () => void; onPronto: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const r = useCarregar<Rastreio>(() => fonte.rastreio(ctx.empresa, exp.id), [ctx.empresa, exp.id])
  return (
    <Modal titulo={`Rastreio · envio ${exp.numero ?? ''}`} onFechar={onFechar}>
      {erro && <div className="erro" role="alert">{erro}</div>}
      {r.erro ? <div className="erro">{r.erro}</div> : !r.dados ? <p className="mudo">Carregando…</p> : <>
        <p><strong>{r.dados.codigo_rastreio ?? 'sem código'}</strong>{r.dados.transportadora ? ` · ${r.dados.transportadora}` : ''}</p>
        {r.dados.url_rastreio && (demo
          ? <p className="mudo pequeno">{r.dados.url_rastreio} (fictício)</p>
          : <p><a href={r.dados.url_rastreio} target="_blank" rel="noopener noreferrer">Acompanhar na transportadora</a></p>)}
        {r.dados.eventos.length === 0 ? <p className="mudo">Nenhum evento registrado ainda.</p>
          : <ul className="envio-pedidos">{r.dados.eventos.map((ev, i) => (
              <li key={i}>{hora(ev.ocorrido_em)} · <strong>{ev.estado}</strong>{ev.descricao ? ` — ${ev.descricao}` : ''}</li>))}</ul>}
        {podeSim && exp.estado === 'enviada' && <div className="acoes">
          <button onClick={async () => { try { await fonte.entregue(ctx.empresa, exp.id); onPronto() } catch (e) { setErro((e as Error).message) } }}>Marcar como entregue</button>
        </div>}
      </>}
    </Modal>
  )
}

const ROT: Record<string, string> = { metodo: 'Forma de pagamento', motivo: 'Como foi conferido / motivo', rastreio: 'Código de rastreio', transportadora: 'Transportadora (opcional)' }
function ModalSimples({ titulo, rotulo, campos, onFechar, onEnviar }: { titulo: string; rotulo: string; campos: string[]; onFechar: () => void; onEnviar: (v: Record<string, string>) => Promise<void> }) {
  const [v, setV] = useState<Record<string, string>>({ metodo: 'pix' })
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <Formulario enviarRotulo={rotulo} onCancelar={onFechar} onEnviar={() => onEnviar(v)}>
        {campos.map((c) => <Campo key={c} rotulo={ROT[c] ?? c}>{c === 'metodo'
          ? <select value={v.metodo} onChange={(e) => setV({ ...v, metodo: e.target.value })}><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="manual">Dinheiro/manual</option><option value="outro">Outro</option></select>
          : <input value={v[c] ?? ''} onChange={(e) => setV({ ...v, [c]: e.target.value })} autoFocus={c !== 'transportadora'} />}</Campo>)}
      </Formulario>
    </Modal>
  )
}
