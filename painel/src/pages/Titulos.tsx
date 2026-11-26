import { useMemo, useState } from 'react'
import type { Contexto } from '../App'
import {
  apiTitulos, ORIGENS, SITUACOES, dia, dataHora, dividir, hojeIso, moeda, r2, somarDias,
  type CadastrosFin, type ItemBaixa, type TipoTitulo, type TituloDetalhe, type TituloResumo,
} from '../apiTitulos'
import GradeDados, { type Coluna } from '../GradeDados'
import { Abas, Busca, Campo, LimparFiltros, Modal, Titulo, useCarregar } from '../ui'
import { useEstadoTela } from '../abas'
import { CampoValor, EditorRateio, ParceiroBusca, SeloSit, Valor, podeEditar, rateioParaApi, rateioValido, type LinhaRateioForm } from './finComum'

// Contas a receber (tipo R) e Contas a pagar (tipo D): a mesma tela, filtrada pelo tipo. Pedido 050.

const TXT = {
  R: { tela: 'contas_receber', titulo: 'Contas a receber', parceiro: 'Cliente', baixa: 'Receber', adiant: 'Adiantamento de cliente', papel: 'cliente' },
  D: { tela: 'contas_pagar', titulo: 'Contas a pagar', parceiro: 'Fornecedor', baixa: 'Pagar', adiant: 'Adiantamento a fornecedor', papel: 'fornecedor' },
} as const

const ABERTAS = ['aberto', 'vencido', 'parcial', 'provisao']

export default function Titulos({ ctx, tipo }: { ctx: Contexto; tipo: TipoTitulo }) {
  const tx = TXT[tipo]
  const pode = podeEditar(ctx, tx.tela)
  const k = (n: string) => `${tx.tela}.${n}`
  const [sits, setSits, limparSits] = useEstadoTela<string[]>(k('sits'), ['aberto', 'vencido', 'parcial'])
  const [de, setDe, limparDe] = useEstadoTela(k('de'), '')
  const [ate, setAte, limparAte] = useEstadoTela(k('ate'), '')
  const [busca, setBusca, limparBusca] = useEstadoTela(k('busca'), '')
  const [conta, setConta, limparConta] = useEstadoTela(k('conta'), '')
  const [origem, setOrigem, limparOrigem] = useEstadoTela(k('origem'), '')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'novo' | 'baixa' | 'reneg' | 'adiant'>(null)

  const cad = useCarregar(() => apiTitulos.cadastros(ctx.empresa), [ctx.empresa])
  const lista = useCarregar(() => apiTitulos.listar(ctx.empresa, {
    tipo, situacoes: sits, de: de || undefined, ate: ate || undefined, busca: busca || undefined, conta_id: conta || undefined, origem_tipo: origem || undefined, limite: 1000,
  }), [ctx.empresa, tipo, sits.join(','), de, ate, busca, conta, origem])
  const itens = lista.dados?.itens ?? []
  const selecionados = itens.filter((t) => sel.has(t.id))
  const filtrado = sits.join(',') !== 'aberto,vencido,parcial' || !!de || !!ate || !!busca || !!conta || !!origem
  const limpar = () => { limparSits(); limparDe(); limparAte(); limparBusca(); limparConta(); limparOrigem() }
  const recarregar = () => { setSel(new Set()); lista.recarregar() }

  const alternarSit = (s: string) => setSits(sits.includes(s) ? sits.filter((x) => x !== s) : [...sits, s])
  const r = lista.dados?.resumo
  const aberto$ = r ? (tipo === 'R' ? r.receber_aberto : r.pagar_aberto) : null
  const vencido$ = r ? (tipo === 'R' ? r.vencido_receber : r.vencido_pagar) : null
  const selecionaveis = (t: TituloResumo) => ABERTAS.includes(t.situacao_exibicao)

  const colunas = useMemo<Coluna<TituloResumo>[]>(() => [
    ...(pode ? [{
      id: 'sel', titulo: 'Selecionar', simples: true, somar: false, largura: 38, texto: (t: TituloResumo) => (sel.has(t.id) ? 'Sim' : 'Não'),
      cabecalho: <input type="checkbox" aria-label="Selecionar todos os títulos em aberto" checked={itens.some(selecionaveis) && itens.filter(selecionaveis).every((t) => sel.has(t.id))}
        onChange={(e) => setSel(e.target.checked ? new Set(itens.filter(selecionaveis).map((t) => t.id)) : new Set())} />,
      render: (t: TituloResumo) => selecionaveis(t) ? <input type="checkbox" checked={sel.has(t.id)} aria-label={`Selecionar título ${t.numero}`} onClick={(e) => e.stopPropagation()}
        onChange={() => setSel((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })} /> : null,
    }] : []),
    { id: 'numero', titulo: 'Nº', texto: (t) => String(t.numero), valor: (t) => t.numero, direita: true, somar: false, largura: 70 },
    { id: 'situacao', titulo: 'Situação', texto: (t) => SITUACOES.find((s) => s.id === t.situacao_exibicao)?.rotulo ?? t.situacao_exibicao, render: (t) => <SeloSit s={t.situacao_exibicao} />, largura: 120 },
    { id: 'parceiro', titulo: tx.parceiro, texto: (t) => t.parceiro_nome, largura: 220 },
    { id: 'documento', titulo: 'Documento', texto: (t) => t.documento ?? '', largura: 170 },
    { id: 'parcela', titulo: 'Parcela', texto: (t) => t.parcela ?? '', largura: 70 },
    { id: 'vencimento', titulo: 'Vencimento', texto: (t) => dia(t.vencimento), valor: (t) => t.vencimento, largura: 100 },
    { id: 'emissao', titulo: 'Emissão', texto: (t) => dia(t.emissao), valor: (t) => t.emissao, oculta: true },
    { id: 'competencia', titulo: 'Competência', texto: (t) => dia(t.competencia), valor: (t) => t.competencia, oculta: true },
    { id: 'original', titulo: 'Valor original', texto: (t) => moeda(t.valor_original), valor: (t) => t.valor_original, direita: true, formatar: moeda },
    { id: 'retencoes', titulo: 'Retenções', texto: (t) => moeda(t.retencoes), valor: (t) => t.retencoes, direita: true, formatar: moeda, oculta: true },
    { id: 'liquido', titulo: 'Líquido', texto: (t) => moeda(t.valor_liquido), valor: (t) => t.valor_liquido, direita: true, formatar: moeda, oculta: true },
    { id: 'baixado', titulo: tipo === 'R' ? 'Recebido' : 'Pago', texto: (t) => moeda(t.baixado), valor: (t) => t.baixado, direita: true, formatar: moeda },
    { id: 'saldo', titulo: 'Saldo', texto: (t) => moeda(t.saldo), valor: (t) => t.saldo, direita: true, formatar: moeda,
      render: (t) => <strong className="fin-valor">{moeda(t.saldo)}</strong> },
    { id: 'pct', titulo: '% baixado', texto: (t) => `${t.pct_baixado}%`, valor: (t) => t.pct_baixado, somar: false, largura: 90,
      render: (t) => <span className="fin-barra-pct" title={`${t.pct_baixado}%`}><i style={{ width: `${t.pct_baixado}%` }} /></span> },
    { id: 'natureza', titulo: 'Natureza', texto: (t) => (t.natureza ?? '') + (t.linhas_rateio > 1 ? ` (+${t.linhas_rateio - 1})` : ''), largura: 200 },
    { id: 'cr', titulo: 'Centro de resultado', texto: (t) => t.cr ?? '', largura: 170, oculta: true },
    { id: 'tipo_titulo', titulo: 'Tipo de título', texto: (t) => t.tipo_titulo ?? '' },
    { id: 'conta', titulo: 'Conta prevista', texto: (t) => t.conta_prevista ?? '', oculta: true },
    { id: 'origem', titulo: 'Origem', texto: (t) => ORIGENS[t.origem_tipo] ?? t.origem_tipo, oculta: true },
    { id: 'historico', titulo: 'Histórico', texto: (t) => t.historico ?? '', oculta: true, largura: 240 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [pode, sel, itens, tipo])

  const mesmoParceiro = selecionados.length > 0 && selecionados.every((t) => t.parceiro_id === selecionados[0].parceiro_id)

  return (
    <section>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Cada título é um valor a {tipo === 'R' ? 'receber de um cliente' : 'pagar a um fornecedor'}, com natureza, centro de resultado e tipo de título.
            Selecione um ou vários títulos em aberto para {tipo === 'R' ? 'receber' : 'pagar'} (baixa total, parcial ou agrupada) ou renegociar.
            Clique na linha para ver a composição do valor, o rateio, as baixas e todos os vínculos (nota, parcelas, renegociação, adiantamento).</>}>
            {tx.titulo}
          </Titulo>
          {lista.dados && <p className="sub">{lista.dados.total} título{lista.dados.total === 1 ? '' : 's'} no filtro</p>}
        </div>
        {pode && cad.dados && (
          <div className="fin-acoes">
            <button className="sec" onClick={() => setModal('adiant')}>+ {tx.adiant}</button>
            <button onClick={() => setModal('novo')}>+ Novo título</button>
          </div>)}
      </div>

      {r && (
        <div className="resumo-faixa fin-kpi">
          <div><span>Em aberto</span><strong>{moeda(aberto$)}</strong></div>
          <div className={vencido$ ? 'alerta' : ''}><span>Vencido</span><strong className={vencido$ ? 'neg' : ''}>{moeda(vencido$)}</strong></div>
          <div><span>Provisões</span><strong>{moeda(r.provisoes)}</strong></div>
          <div><span>Títulos vencidos</span><strong>{lista.dados?.contagem.vencido ?? 0}</strong></div>
        </div>)}

      <div className="fin-chips" role="group" aria-label="Situação">
        {SITUACOES.map((s) => (
          <button key={s.id} type="button" className={sits.includes(s.id) ? 'chip sel' : 'chip'} aria-pressed={sits.includes(s.id)} onClick={() => alternarSit(s.id)}>
            {s.rotulo}<span>{lista.dados?.contagem[s.id] ?? 0}</span>
          </button>))}
        <button type="button" className="link" onClick={() => setSits([])}>Todas</button>
      </div>

      <div className="filtros">
        <Busca valor={busca} onMudar={setBusca} placeholder={`Buscar por ${tx.parceiro.toLowerCase()}, documento, histórico ou número`} />
        <label className="campo" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ fontSize: '.8rem' }}>Vencimento de</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Vencimento de" /></label>
        <label className="campo" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ fontSize: '.8rem' }}>até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Vencimento até" /></label>
        <select value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>{cad.dados?.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
          <option value="">Todas as origens</option>{Object.entries(ORIGENS).map(([k2, v]) => <option key={k2} value={k2}>{v}</option>)}
        </select>
        <LimparFiltros ativo={filtrado} onLimpar={limpar} />
      </div>

      {pode && selecionados.length > 0 && (
        <div className="barra-selecao" role="status">
          <strong>{selecionados.length} selecionado{selecionados.length > 1 ? 's' : ''} · saldo {moeda(r2(selecionados.reduce((s, t) => s + t.saldo, 0)))}</strong>
          <button onClick={() => setModal('baixa')}>{tx.baixa} {selecionados.length > 1 ? 'em lote' : ''}</button>
          <button className="sec" disabled={!mesmoParceiro} title={mesmoParceiro ? '' : 'Renegociação agrupa títulos do mesmo parceiro'} onClick={() => setModal('reneg')}>Renegociar</button>
          <button className="sec" onClick={() => setSel(new Set())}>Limpar seleção</button>
        </div>)}

      {(lista.erro || cad.erro) && <div className="erro">{lista.erro ?? cad.erro}</div>}
      {!lista.dados && !lista.erro && <p className="sub">Carregando…</p>}
      {lista.dados && <GradeDados id={`fin.${tx.tela}`} titulo={tx.titulo} colunas={colunas} linhas={itens} chave={(t) => t.id} altura="60vh"
        vazio="Nenhum título neste filtro." aoClicar={(t) => setAberto(t.id)} />}

      {aberto && cad.dados && <DetalheTitulo ctx={ctx} id={aberto} cad={cad.dados} pode={pode} onFechar={() => setAberto(null)} onAbrir={setAberto} onMudou={lista.recarregar} />}
      {modal === 'novo' && cad.dados && <NovoTitulo ctx={ctx} tipo={tipo} cad={cad.dados} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); recarregar() }} />}
      {modal === 'baixa' && cad.dados && <BaixaTitulos ctx={ctx} titulos={selecionados} cad={cad.dados} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); recarregar() }} />}
      {modal === 'reneg' && cad.dados && <Renegociar ctx={ctx} titulos={selecionados} cad={cad.dados} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); recarregar() }} />}
      {modal === 'adiant' && cad.dados && <Adiantamento ctx={ctx} tipo={tipo} cad={cad.dados} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); recarregar() }} />}
    </section>
  )
}

// ======================================================================= Detalhe
type AbaDet = 'composicao' | 'rateio' | 'baixas' | 'vinculos'

function DetalheTitulo({ ctx, id, cad, pode, onFechar, onAbrir, onMudou }: {
  ctx: Contexto; id: string; cad: CadastrosFin; pode: boolean; onFechar: () => void; onAbrir: (id: string) => void; onMudou: () => void
}) {
  const det = useCarregar(() => apiTitulos.obter(ctx.empresa, id), [ctx.empresa, id])
  const [aba, setAba] = useState<AbaDet>('composicao')
  const [acao, setAcao] = useState<null | 'baixar' | 'editar' | 'cancelar' | 'duplicar' | 'efetivar' | { estornar: string } | { desfazer: string } | { adiant: string }>(null)
  const [erro, setErro] = useState<string | null>(null)
  const t = det.dados
  const mudou = () => { setAcao(null); det.recarregar(); onMudou() }
  const ativo = t && !['cancelado', 'renegociado'].includes(t.situacao)
  const temBaixa = !!t?.baixas.some((b) => !b.estornada)

  return (
    <Modal titulo={t ? `Título #${t.numero} · ${t.tipo === 'R' ? 'a receber' : 'a pagar'}` : 'Título'} onFechar={onFechar} larga>
      {det.erro && <div className="erro">{det.erro}</div>}
      {!t && !det.erro && <p className="sub">Carregando…</p>}
      {t && (<>
        <div className="fin-cabecalho">
          <div>
            <h3>{t.parceiro_nome} <SeloSit s={t.situacao_exibicao} /></h3>
            <p className="sub">{t.documento ?? 'sem documento'}{t.parcela ? ` · parcela ${t.parcela}` : ''} · vence {dia(t.vencimento)}
              {t.vencimento_original && t.vencimento_original !== t.vencimento ? ` (original ${dia(t.vencimento_original)})` : ''} · {ORIGENS[t.origem_tipo] ?? t.origem_tipo}</p>
            {t.historico && <p className="sub">{t.historico}</p>}
            {t.motivo_cancelamento && <p className="sub">Cancelado em {dataHora(t.cancelado_em)}: {t.motivo_cancelamento}</p>}
          </div>
          {pode && ativo && (
            <div className="fin-acoes">
              {t.saldo > 0 && <button onClick={() => setAcao('baixar')}>{t.tipo === 'R' ? 'Receber' : 'Pagar'}</button>}
              <button className="sec" onClick={() => setAcao('editar')}>Editar</button>
              <button className="sec" onClick={() => setAcao('duplicar')}>Duplicar</button>
              {t.provisao && t.situacao === 'aberto' && <button className="sec" onClick={() => setAcao('efetivar')}>Efetivar provisão</button>}
              {!temBaixa && !['nfe_entrada', 'renegociacao', 'adiantamento'].includes(t.origem_tipo) && <button className="sec" onClick={() => setAcao('cancelar')}>Cancelar</button>}
            </div>)}
        </div>

        <div className="resumo-faixa fin-kpi">
          <div><span>Valor original</span><strong>{moeda(t.valor_original)}</strong></div>
          <div><span>Líquido</span><strong>{moeda(t.valor_liquido)}</strong></div>
          <div><span>{t.tipo === 'R' ? 'Recebido' : 'Pago'}</span><strong className="pos">{moeda(t.baixado)}</strong></div>
          <div><span>Saldo</span><strong className={t.saldo > 0 ? 'neg' : ''}>{moeda(t.saldo)}</strong></div>
        </div>

        <Abas<AbaDet> abas={[{ id: 'composicao', rotulo: 'Composição' }, { id: 'rateio', rotulo: 'Rateio', contagem: t.rateio.length },
          { id: 'baixas', rotulo: 'Baixas', contagem: t.baixas.length }, { id: 'vinculos', rotulo: 'Vínculos' }]} ativa={aba} onMudar={setAba} />
        {erro && <div className="erro">{erro}</div>}

        {aba === 'composicao' && (
          <div className="grade2">
            <div>
              <h4 className="sub" style={{ margin: '0 0 .4rem' }}>Valor do título</h4>
              <div className="fin-comp">
                <div><span>Valor original (bruto)</span><span>{moeda(t.valor_original)}</span></div>
                {t.retencoes > 0 && <>
                  {(['iss', 'irrf', 'inss', 'pcc'] as const).filter((x) => t.retencoes_detalhe[x] > 0).map((x) =>
                    <div key={x} className="menos sub"><span>Retenção {x.toUpperCase()}</span><span>− {moeda(t.retencoes_detalhe[x])}</span></div>)}
                  <div className="sub"><span>{t.retencoes_detalhe.recolhe ? 'A Ane recolhe as retenções (guias geradas)' : 'Retenções informativas'}</span><span /></div>
                </>}
                <div className="total"><span>Líquido do título</span><span>{moeda(t.valor_liquido)}</span></div>
                <div className="menos"><span>Baixado (principal)</span><span>− {moeda(t.baixado - t.renegociado_total)}</span></div>
                {t.renegociado_total > 0 && <div className="menos"><span>Levado para renegociação</span><span>− {moeda(t.renegociado_total)}</span></div>}
                <div className="total"><span>Saldo em aberto</span><span>{moeda(t.saldo)}</span></div>
              </div>
            </div>
            <div>
              <h4 className="sub" style={{ margin: '0 0 .4rem' }}>Efeito no caixa</h4>
              <div className="fin-comp">
                <div><span>Principal baixado</span><span>{moeda(t.caixa.principal)}</span></div>
                <div className="mais"><span>+ Juros e multa</span><span>{moeda(t.caixa.juros_multa)}</span></div>
                <div className="menos"><span>− Desconto</span><span>{moeda(t.caixa.desconto)}</span></div>
                <div className="menos"><span>− Taxa (cartão, boleto)</span><span>{moeda(t.caixa.taxa)}</span></div>
                <div className="total"><span>Movimentado na conta</span><span>{moeda(t.caixa.movimentado)}</span></div>
              </div>
              <dl className="sub" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '.2rem .8rem', marginTop: '.7rem', fontSize: '.84rem' }}>
                <dt>Emissão</dt><dd style={{ margin: 0 }}>{dia(t.emissao)}</dd>
                <dt>Competência</dt><dd style={{ margin: 0 }}>{dia(t.competencia)}</dd>
                <dt>Tipo de título</dt><dd style={{ margin: 0 }}>{t.tipo_titulo ?? '—'}</dd>
                <dt>Conta prevista</dt><dd style={{ margin: 0 }}>{t.conta_prevista ?? '—'}</dd>
                {t.codigo_barras && <><dt>Código de barras</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{t.codigo_barras}</dd></>}
                {t.pix_copia_cola && <><dt>PIX copia e cola</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{t.pix_copia_cola}</dd></>}
              </dl>
            </div>
          </div>)}

        {aba === 'rateio' && (
          <table className="fin-tabela">
            <thead><tr><th>Componente</th><th>Natureza</th><th>Centro de resultado</th><th>Projeto</th><th className="d">%</th><th className="d">Valor</th></tr></thead>
            <tbody>{t.rateio.map((l, i) => (
              <tr key={i}><td>{l.componente === 'juros' ? 'Juros' : 'Principal'}</td><td>{l.natureza}</td><td>{l.cr}</td><td>{l.projeto ?? '—'}</td>
                <td className="d">{l.percentual}%</td><td className="d">{moeda(l.valor)}</td></tr>))}</tbody>
          </table>)}

        {aba === 'baixas' && (t.baixas.length === 0 ? <p className="sub">Nenhuma baixa ainda.</p> : (
          <div className="tabela-rolavel">
            <table className="fin-tabela">
              <thead><tr><th>Data</th><th>Tipo</th><th>Conta</th><th className="d">Principal</th><th className="d">Juros + multa</th><th className="d">Desconto</th>
                <th className="d">Taxa</th><th className="d">Movimentado</th><th>Banco</th><th /></tr></thead>
              <tbody>{t.baixas.map((b) => (
                <tr key={b.id} className={b.estornada ? 'riscada' : ''} title={b.estornada ? `Estornada em ${dataHora(b.estornada_em)}: ${b.motivo_estorno ?? ''}` : b.historico ?? ''}>
                  <td>{dia(b.data)}</td>
                  <td>{b.tipo === 'renegociacao' ? `Renegociação R-${b.renegociacao}` : b.tipo === 'compensacao' ? 'Compensação' : b.parcial ? 'Parcial' : 'Total'}
                    {b.lote ? ` · lote ${b.lote}` : ''}{b.tipo_titulo ? ` · ${b.tipo_titulo}` : ''}</td>
                  <td>{b.conta ?? '—'}</td>
                  <td className="d">{moeda(b.principal)}</td><td className="d">{moeda(b.juros + b.multa)}</td><td className="d">{moeda(b.desconto)}</td>
                  <td className="d">{moeda(b.taxa)}</td><td className="d">{moeda(b.movimentado)}</td>
                  <td>{b.estornada ? 'Estornada' : b.conciliado ? <span title={`Conciliado em ${dataHora(b.conciliado_em)}`}>Conciliado · {dia(b.data_banco)}</span> : b.conta ? 'Aguardando extrato' : '—'}</td>
                  <td>{pode && !b.estornada && b.tipo !== 'renegociacao' && !b.conciliado && <button type="button" className="link" onClick={() => setAcao({ estornar: b.id })}>Estornar</button>}</td>
                </tr>))}</tbody>
            </table>
            {t.baixas.some((b) => b.conciliado && !b.estornada) && <small className="sub">Baixa conciliada não se estorna: desfaça a conciliação na tela Conciliação antes.</small>}
          </div>))}

        {aba === 'vinculos' && <Vinculos t={t} pode={pode} onAbrir={onAbrir} onDesfazer={(rid) => setAcao({ desfazer: rid })} onCancelarAdiant={(aid) => setAcao({ adiant: aid })} />}

        {acao === 'baixar' && <BaixaTitulos ctx={ctx} titulos={[t]} cad={cad} onFechar={() => setAcao(null)} onSalvo={mudou} />}
        {acao === 'editar' && <EditarTitulo ctx={ctx} t={t} cad={cad} onFechar={() => setAcao(null)} onSalvo={mudou} />}
        {acao === 'duplicar' && <Pergunta titulo="Duplicar título" campo="Vencimento do novo título" tipoCampo="date" inicial={somarDias(t.vencimento, 30)}
          texto="Cria um título igual (parceiro, valor, rateio, tipo e retenções), sem baixas, ligado a este pelo vínculo “duplicado de”." confirmar="Duplicar"
          onFechar={() => setAcao(null)} onConfirmar={async (v) => { const nid = await apiTitulos.duplicar(ctx.empresa, t.id, v || null); mudou(); onAbrir(nid) }} />}
        {acao === 'cancelar' && <Cancelar t={t} onFechar={() => setAcao(null)}
          onConfirmar={async (motivo, modo) => { await apiTitulos.cancelar(ctx.empresa, t.id, motivo, modo); mudou() }} />}
        {acao === 'efetivar' && <Pergunta titulo="Efetivar provisão" campo="Número do título real (opcional)" inicial=""
          texto="Sem número, a provisão passa a ser um título real. Com o número de um título já lançado (do mesmo tipo), a provisão é cancelada e fica ligada a ele."
          confirmar="Efetivar" onFechar={() => setAcao(null)} onConfirmar={async (v) => {
            let real: string | null = null
            if (v.trim()) {
              const achados = await apiTitulos.listar(ctx.empresa, { tipo: t.tipo, busca: v.trim(), limite: 20 })
              const x = achados.itens.find((i) => String(i.numero) === v.trim())
              if (!x) throw new Error(`título #${v.trim()} não encontrado`)
              real = x.id
            }
            await apiTitulos.efetivarProvisao(ctx.empresa, t.id, real); mudou()
          }} />}
        {acao && typeof acao === 'object' && 'estornar' in acao && <Pergunta titulo="Estornar baixa" campo="Motivo" obrigatorio inicial=""
          texto="O valor volta ao saldo do título e o movimento na conta é estornado. Fica registrado quem estornou e por quê." confirmar="Estornar"
          onFechar={() => setAcao(null)} onConfirmar={async (m) => { await apiTitulos.estornarBaixa(ctx.empresa, acao.estornar, m); mudou() }} />}
        {acao && typeof acao === 'object' && 'desfazer' in acao && <Pergunta titulo="Desfazer renegociação" campo="Motivo" obrigatorio inicial=""
          texto="Os títulos novos são cancelados e os originais voltam a ficar em aberto com o saldo que tinham. Só é possível se nenhum título novo tiver baixa."
          confirmar="Desfazer" onFechar={() => setAcao(null)} onConfirmar={async (m) => { await apiTitulos.desfazerRenegociacao(ctx.empresa, acao.desfazer, m); mudou() }} />}
        {acao && typeof acao === 'object' && 'adiant' in acao && <Pergunta titulo="Cancelar adiantamento" campo="Motivo" obrigatorio inicial=""
          texto="Estorna o movimento na conta e cancela os dois títulos do adiantamento. Só é possível enquanto o crédito não foi usado." confirmar="Cancelar adiantamento"
          onFechar={() => setAcao(null)} onConfirmar={async (m) => { await apiTitulos.cancelarAdiantamento(ctx.empresa, acao.adiant, m); mudou() }} />}
      </>)}
      <div className="acoes"><button className="sec" onClick={() => { setErro(null); onFechar() }}>Fechar</button></div>
    </Modal>
  )
}

function LinhaTit({ t, onAbrir, extra }: { t: TituloResumo; onAbrir: (id: string) => void; extra?: string }) {
  return (
    <li>
      <button type="button" className="link" onClick={() => onAbrir(t.id)}>#{t.numero}</button>
      <span>{t.parcela ? `${t.parcela} · ` : ''}{t.parceiro_nome}{extra ? ` · ${extra}` : ''}</span>
      <span className="sub">vence {dia(t.vencimento)}</span>
      <SeloSit s={t.situacao_exibicao} />
      <span className="fin-valor">{moeda(t.valor_liquido)} · saldo {moeda(t.saldo)}</span>
    </li>
  )
}

function Vinculos({ t, pode, onAbrir, onDesfazer, onCancelarAdiant }: {
  t: TituloDetalhe; pode: boolean; onAbrir: (id: string) => void; onDesfazer: (id: string) => void; onCancelarAdiant: (id: string) => void
}) {
  const v = t.vinculos
  const nada = !v.entrada && !v.pedido && !v.grupo && v.renegociado_em.length === 0 && !v.originado_de && !v.adiantamento && v.guias.length === 0
    && !v.retencao_de && !v.duplicado_de && !v.provisao_substituida && !v.substituido_por
  if (nada) return <p className="sub">Título avulso, sem nota nem outros títulos ligados.</p>
  return (
    <div className="fin-vinculos">
      {v.entrada && <section><h4>NF-e de compra</h4><ul><li>Nota {v.entrada.numero ?? '—'} · {v.entrada.fornecedor ?? ''}<small className="sub" style={{ wordBreak: 'break-all' }}>{v.entrada.chave}</small></li></ul>
        <small className="sub">Valor, parceiro e vencimento seguem a nota; alterações são feitas na Entrada de mercadoria.</small></section>}
      {v.pedido && <section><h4>Pedido de venda</h4><ul><li>Pedido {v.pedido.numero}{v.pedido.nfe_numero ? ` · NF-e ${v.pedido.nfe_numero}` : ''}</li></ul></section>}
      {v.grupo && <section><h4>{v.grupo.tipo === 'recorrente' ? 'Recorrência' : v.grupo.tipo === 'renegociacao' ? 'Parcelas da renegociação' : 'Parcelamento'} · {v.grupo.descricao} ({v.grupo.parcelas} parcelas)</h4>
        <ul>{v.grupo.titulos.map((x) => <LinhaTit key={x.id} t={x} onAbrir={onAbrir} />)}</ul>
        <small className="sub">Parcelas de um grupo não se excluem uma a uma: cancele pelo grupo inteiro ou a partir de uma parcela.</small></section>}
      {v.originado_de && <section><h4>Originado da renegociação R-{v.originado_de.numero} ({v.originado_de.situacao === 'ativa' ? 'em vigor' : 'desfeita'})</h4>
        <p className="sub" style={{ margin: '0 0 .3rem' }}>Saldo renegociado {moeda(v.originado_de.total_original)} + juros {moeda(v.originado_de.juros)} − desconto {moeda(v.originado_de.desconto)}</p>
        <ul>{v.originado_de.originais.map((x) => <LinhaTit key={x.id} t={x} onAbrir={onAbrir} extra={`levou ${moeda(x.saldo_renegociado)}`} />)}</ul>
        {pode && v.originado_de.situacao === 'ativa' && <button type="button" className="link" onClick={() => onDesfazer(v.originado_de!.id)}>Desfazer renegociação</button>}</section>}
      {v.renegociado_em.map((rn) => (
        <section key={rn.id}><h4>Renegociado em R-{rn.numero} ({rn.situacao === 'ativa' ? 'em vigor' : 'desfeita'}) · novo total {moeda(rn.novo_total)}</h4>
          <ul>{(rn.novos ?? []).map((x) => <LinhaTit key={x.id} t={x} onAbrir={onAbrir} />)}</ul>
          {pode && rn.situacao === 'ativa' && <button type="button" className="link" onClick={() => onDesfazer(rn.id)}>Desfazer renegociação</button>}</section>))}
      {v.adiantamento && <section><h4>Adiantamento A-{v.adiantamento.numero} de {v.adiantamento.tipo} · {moeda(v.adiantamento.valor)} ({v.adiantamento.situacao})</h4>
        <ul>{v.adiantamento.titulos.map((x) => <LinhaTit key={x.id} t={x} onAbrir={onAbrir} extra={x.papel === 'entrada' ? 'dinheiro recebido/pago' : 'crédito a compensar'} />)}</ul>
        {pode && v.adiantamento.situacao === 'aberto' && <button type="button" className="link" onClick={() => onCancelarAdiant(v.adiantamento!.id)}>Cancelar adiantamento</button>}</section>}
      {v.guias.length > 0 && <section><h4>Guias de retenção geradas</h4><ul>{v.guias.map((x) => <LinhaTit key={x.id} t={x} onAbrir={onAbrir} extra={x.documento ?? ''} />)}</ul></section>}
      {v.retencao_de && <section><h4>Guia da retenção do título</h4><ul><LinhaTit t={v.retencao_de} onAbrir={onAbrir} /></ul></section>}
      {v.duplicado_de && <section><h4>Duplicado de</h4><ul><LinhaTit t={v.duplicado_de} onAbrir={onAbrir} /></ul></section>}
      {v.provisao_substituida && <section><h4>Substitui a provisão</h4><ul><LinhaTit t={v.provisao_substituida} onAbrir={onAbrir} /></ul></section>}
      {v.substituido_por && <section><h4>Provisão substituída pelo título</h4><ul><LinhaTit t={v.substituido_por} onAbrir={onAbrir} /></ul></section>}
    </div>
  )
}

// ======================================================================= modais de apoio
function Pergunta({ titulo, texto, campo, tipoCampo = 'text', inicial, obrigatorio, confirmar, onFechar, onConfirmar }: {
  titulo: string; texto: string; campo: string; tipoCampo?: string; inicial: string; obrigatorio?: boolean; confirmar: string
  onFechar: () => void; onConfirmar: (v: string) => Promise<void>
}) {
  const [v, setV] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <form className="form" onSubmit={async (e) => { e.preventDefault(); setEnviando(true); setErro(null); try { await onConfirmar(v) } catch (x) { setErro((x as Error).message) } finally { setEnviando(false) } }}>
        <p className="sub">{texto}</p>
        <Campo rotulo={campo}><input type={tipoCampo} value={v} onChange={(e) => setV(e.target.value)} required={obrigatorio} autoFocus /></Campo>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Voltar</button><button type="submit" disabled={enviando}>{enviando ? 'Aguarde…' : confirmar}</button></div>
      </form>
    </Modal>
  )
}

function Cancelar({ t, onFechar, onConfirmar }: { t: TituloDetalhe; onFechar: () => void; onConfirmar: (motivo: string, modo: 'titulo' | 'grupo' | 'grupo_a_partir') => Promise<void> }) {
  const [motivo, setMotivo] = useState('')
  const [modo, setModo] = useState<'titulo' | 'grupo' | 'grupo_a_partir'>(t.grupo_id ? 'grupo' : 'titulo')
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Modal titulo={`Cancelar título #${t.numero}`} onFechar={onFechar}>
      <form className="form" onSubmit={async (e) => { e.preventDefault(); setErro(null); try { await onConfirmar(motivo, modo) } catch (x) { setErro((x as Error).message) } }}>
        <p className="sub">O título fica cancelado e visível para consulta; nada é apagado. Guias de retenção sem baixa acompanham o cancelamento.</p>
        {t.grupo_id && (
          <Campo rotulo="O que cancelar" dica="Parcelas de um grupo não se cancelam uma a uma.">
            <select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}>
              <option value="grupo">Todas as parcelas em aberto do grupo</option>
              <option value="grupo_a_partir">Desta parcela ({t.parcela}) em diante</option>
            </select>
          </Campo>)}
        <Campo rotulo="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} required autoFocus /></Campo>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Voltar</button><button type="submit">Cancelar título</button></div>
      </form>
    </Modal>
  )
}

function EditarTitulo({ ctx, t, cad, onFechar, onSalvo }: { ctx: Contexto; t: TituloDetalhe; cad: CadastrosFin; onFechar: () => void; onSalvo: () => void }) {
  const travadoValor = t.origem_tipo === 'nfe_entrada' || t.baixas.some((b) => !b.estornada) || t.origem_tipo === 'renegociacao'
  const [f, setF] = useState({
    documento: t.documento ?? '', historico: t.historico ?? '', vencimento: t.vencimento, competencia: t.competencia,
    valor_original: t.valor_original as number | null, tipo_titulo_id: t.tipo_titulo_id ?? '', conta_prevista_id: t.conta_prevista_id ?? '',
    codigo_barras: t.codigo_barras ?? '', pix_copia_cola: t.pix_copia_cola ?? '',
  })
  const [rat, setRat] = useState<LinhaRateioForm[]>(t.rateio.filter((r) => r.componente === 'principal').map((r) => ({ natureza_id: r.natureza_id, cr_id: r.cr_id, projeto_id: r.projeto_id ?? '', percentual: r.percentual })))
  const rateioMudou = JSON.stringify(rat) !== JSON.stringify(t.rateio.filter((r) => r.componente === 'principal').map((r) => ({ natureza_id: r.natureza_id, cr_id: r.cr_id, projeto_id: r.projeto_id ?? '', percentual: r.percentual })))
  const temJuros = t.rateio.some((r) => r.componente === 'juros')
  const [erro, setErro] = useState<string | null>(null)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null)
    if (rateioMudou && !rateioValido(rat)) return setErro('Complete o rateio: natureza, centro de resultado e percentuais somando 100%.')
    const d: Record<string, unknown> = { ...f, tipo_titulo_id: f.tipo_titulo_id || null, conta_prevista_id: f.conta_prevista_id || null }
    if (travadoValor) delete d.valor_original
    if (rateioMudou) d.rateio = rateioParaApi(rat)
    try { await apiTitulos.salvar(ctx.empresa, t.id, d); onSalvo() } catch (x) { setErro((x as Error).message) }
  }
  return (
    <Modal titulo={`Editar título #${t.numero}`} onFechar={onFechar} larga>
      <form className="form" onSubmit={salvar}>
        <div className="grade-2">
          <Campo rotulo="Documento"><input value={f.documento} onChange={(e) => set({ documento: e.target.value })} /></Campo>
          <Campo rotulo="Vencimento"><input type="date" value={f.vencimento} onChange={(e) => set({ vencimento: e.target.value })} required /></Campo>
          <Campo rotulo="Competência" dica="Mês em que entra no DRE"><input type="date" value={f.competencia} onChange={(e) => set({ competencia: e.target.value })} required /></Campo>
          <CampoValor rotulo={travadoValor ? 'Valor original (travado: nota ou baixa)' : 'Valor original'} valor={f.valor_original} onMudar={(n) => set({ valor_original: n })} desabilitado={travadoValor} />
          <Campo rotulo="Tipo de título"><select value={f.tipo_titulo_id} onChange={(e) => set({ tipo_titulo_id: e.target.value })}>
            <option value="">—</option>{cad.tipos.filter((x) => x.ativo && (x.aplica_a === 'A' || x.aplica_a === t.tipo)).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
          <Campo rotulo="Conta prevista"><select value={f.conta_prevista_id} onChange={(e) => set({ conta_prevista_id: e.target.value })}>
            <option value="">—</option>{cad.contas.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        </div>
        <Campo rotulo="Histórico"><input value={f.historico} onChange={(e) => set({ historico: e.target.value })} /></Campo>
        {t.tipo === 'D' && <div className="grade-2">
          <Campo rotulo="Código de barras"><input value={f.codigo_barras} onChange={(e) => set({ codigo_barras: e.target.value })} /></Campo>
          <Campo rotulo="PIX copia e cola"><input value={f.pix_copia_cola} onChange={(e) => set({ pix_copia_cola: e.target.value })} /></Campo>
        </div>}
        <div>
          <strong style={{ fontSize: '.85rem' }}>Rateio do principal</strong>
          {temJuros && <small className="sub"> · a linha de juros da renegociação é mantida</small>}
          <EditorRateio cad={cad} tipo={t.tipo} linhas={rat} onMudar={setRat} total={f.valor_original} />
        </div>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button><button type="submit">Salvar</button></div>
      </form>
    </Modal>
  )
}

// ======================================================================= Novo título / parcelamento
function NovoTitulo({ ctx, tipo, cad, onFechar, onSalvo }: { ctx: Contexto; tipo: TipoTitulo; cad: CadastrosFin; onFechar: () => void; onSalvo: () => void }) {
  const hoje = hojeIso()
  const [parc, setParc] = useState<{ id: string | null; nome: string }>({ id: null, nome: '' })
  const [f, setF] = useState({
    origem_tipo: 'manual', documento: '', historico: '', emissao: hoje, competencia: hoje, vencimento: somarDias(hoje, 30),
    valor_total: null as number | null, parcelas: 1, periodicidade: 'mensal', intervalo_dias: 30, grupo_tipo: 'parcelamento',
    tipo_titulo_id: '', conta_prevista_id: '', provisao: false, codigo_barras: '',
  })
  const [ret, setRet] = useState({ iss: null as number | null, irrf: null as number | null, inss: null as number | null, pcc: null as number | null, recolhe: false })
  const [rat, setRat] = useState<LinhaRateioForm[]>([{ natureza_id: '', cr_id: '', projeto_id: '', percentual: 100 }])
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const recorrente = f.origem_tipo === 'recorrente'
  const nfse = f.origem_tipo === 'nfse_entrada'
  const totRet = r2((ret.iss ?? 0) + (ret.irrf ?? 0) + (ret.inss ?? 0) + (ret.pcc ?? 0))
  const valores = f.valor_total ? (recorrente ? Array(f.parcelas).fill(f.valor_total) : dividir(f.valor_total, f.parcelas)) : []
  const venc = (i: number) => {
    const d = new Date(f.vencimento + 'T12:00:00')
    if (f.periodicidade === 'mensal') d.setMonth(d.getMonth() + i)
    else d.setDate(d.getDate() + i * (f.periodicidade === 'quinzenal' ? 15 : f.periodicidade === 'semanal' ? 7 : f.intervalo_dias))
    return d.toISOString().slice(0, 10)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null)
    if (!parc.id) return setErro(`Escolha o ${TXT[tipo].parceiro.toLowerCase()}.`)
    if (!f.valor_total || f.valor_total <= 0) return setErro('Informe o valor.')
    if (!rateioValido(rat)) return setErro('Complete o rateio: natureza, centro de resultado e percentuais somando 100%.')
    if (nfse && f.valor_total && totRet >= (recorrente ? f.valor_total : valores[0])) return setErro('As retenções não podem ser maiores que a 1ª parcela.')
    setEnviando(true)
    try {
      await apiTitulos.criar(ctx.empresa, {
        tipo, parceiro_id: parc.id, documento: f.documento, historico: f.historico, emissao: f.emissao, competencia: f.competencia, vencimento: f.vencimento,
        valor_total: f.valor_total, parcelas: f.parcelas, periodicidade: f.periodicidade, intervalo_dias: f.periodicidade === 'dias' ? f.intervalo_dias : null,
        origem_tipo: f.parcelas > 1 && f.origem_tipo === 'manual' ? 'parcelamento' : f.origem_tipo, grupo_tipo: f.grupo_tipo,
        tipo_titulo_id: f.tipo_titulo_id || null, conta_prevista_id: f.conta_prevista_id || null, provisao: f.provisao, codigo_barras: f.codigo_barras || null,
        rateio: rateioParaApi(rat),
        ...(nfse ? { retencoes: { iss: ret.iss, irrf: ret.irrf, inss: ret.inss, pcc: ret.pcc }, retencao_recolhe: ret.recolhe } : {}),
      })
      onSalvo()
    } catch (x) { setErro((x as Error).message) } finally { setEnviando(false) }
  }

  return (
    <Modal titulo={`Novo título ${tipo === 'R' ? 'a receber' : 'a pagar'}`} onFechar={onFechar} larga>
      <form className="form" onSubmit={salvar}>
        <div className="grade-2">
          <Campo rotulo="Lançamento">
            <select value={f.origem_tipo} onChange={(e) => set({ origem_tipo: e.target.value, parcelas: e.target.value === 'recorrente' ? Math.max(f.parcelas, 12) : f.parcelas })}>
              <option value="manual">Título avulso ou parcelado (recibo, taxa, imposto)</option>
              {tipo === 'D' && <option value="nfse_entrada">NFS-e recebida (serviço, com retenções)</option>}
              <option value="recorrente">Recorrente (mesmo valor todo período)</option>
              <option value="implantacao">Implantação (saldo em aberto antes do CRM)</option>
            </select>
          </Campo>
          <Campo rotulo={TXT[tipo].parceiro}><ParceiroBusca empresa={ctx.empresa} valor={parc.id} nome={parc.nome} onEscolher={(id, nome) => setParc({ id, nome })} /></Campo>
          <Campo rotulo={nfse ? 'Número da NFS-e' : 'Documento'}><input value={f.documento} onChange={(e) => set({ documento: e.target.value })} placeholder={nfse ? 'ex.: NFS-e 1234' : 'ex.: recibo 55, guia DAS 11/2026'} /></Campo>
          <CampoValor rotulo={recorrente ? 'Valor de cada lançamento' : f.parcelas > 1 ? 'Valor total (dividido nas parcelas)' : 'Valor'} valor={f.valor_total} onMudar={(n) => set({ valor_total: n })} obrigatorio />
          <Campo rotulo="Emissão"><input type="date" value={f.emissao} onChange={(e) => set({ emissao: e.target.value, competencia: e.target.value })} required /></Campo>
          <Campo rotulo="Competência" dica="Mês em que o valor entra no DRE"><input type="date" value={f.competencia} onChange={(e) => set({ competencia: e.target.value })} required /></Campo>
          <Campo rotulo={f.parcelas > 1 ? '1º vencimento' : 'Vencimento'}><input type="date" value={f.vencimento} onChange={(e) => set({ vencimento: e.target.value })} required /></Campo>
          <Campo rotulo={recorrente ? 'Quantidade de lançamentos' : 'Parcelas'}>
            <input type="number" min={recorrente ? 2 : 1} max={360} value={f.parcelas} onChange={(e) => set({ parcelas: Math.max(1, Math.min(360, Number(e.target.value) || 1)) })} />
          </Campo>
          {f.parcelas > 1 && <Campo rotulo="Periodicidade">
            <select value={f.periodicidade} onChange={(e) => set({ periodicidade: e.target.value })}>
              <option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option><option value="dias">A cada N dias</option>
            </select></Campo>}
          {f.parcelas > 1 && f.periodicidade === 'dias' && <Campo rotulo="Intervalo (dias)"><input type="number" min={1} value={f.intervalo_dias} onChange={(e) => set({ intervalo_dias: Number(e.target.value) || 30 })} /></Campo>}
          {f.parcelas > 1 && !recorrente && <Campo rotulo="Agrupar como"><select value={f.grupo_tipo} onChange={(e) => set({ grupo_tipo: e.target.value })}>
            <option value="parcelamento">Parcelamento</option><option value="contrato">Contrato</option></select></Campo>}
          <Campo rotulo="Tipo de título"><select value={f.tipo_titulo_id} onChange={(e) => set({ tipo_titulo_id: e.target.value })}>
            <option value="">—</option>{cad.tipos.filter((x) => x.ativo && (x.aplica_a === 'A' || x.aplica_a === tipo)).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
          <Campo rotulo="Conta prevista"><select value={f.conta_prevista_id} onChange={(e) => set({ conta_prevista_id: e.target.value })}>
            <option value="">—</option>{cad.contas.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          {tipo === 'D' && <Campo rotulo="Código de barras (opcional)"><input value={f.codigo_barras} onChange={(e) => set({ codigo_barras: e.target.value })} /></Campo>}
        </div>
        <Campo rotulo="Histórico"><input value={f.historico} onChange={(e) => set({ historico: e.target.value })} placeholder="Descrição que aparece no extrato do título" /></Campo>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.88rem' }}>
          <input type="checkbox" checked={f.provisao} onChange={(e) => set({ provisao: e.target.checked })} />
          Provisão (valor estimado; aparece no fluxo, mas é efetivado ou substituído quando o documento real chegar)
        </label>

        {nfse && (
          <div className="painel">
            <strong style={{ fontSize: '.88rem' }}>Retenções da NFS-e</strong>
            <p className="sub" style={{ fontSize: '.82rem' }}>Entram na 1ª parcela. O fornecedor recebe o líquido; com a opção abaixo, o CRM gera as guias a pagar para os órgãos.</p>
            <div className="grade-2" style={{ marginTop: '.5rem' }}>
              <CampoValor rotulo="ISS retido" valor={ret.iss} onMudar={(n) => setRet((x) => ({ ...x, iss: n }))} />
              <CampoValor rotulo="IRRF" valor={ret.irrf} onMudar={(n) => setRet((x) => ({ ...x, irrf: n }))} />
              <CampoValor rotulo="INSS" valor={ret.inss} onMudar={(n) => setRet((x) => ({ ...x, inss: n }))} />
              <CampoValor rotulo="PIS/COFINS/CSLL" valor={ret.pcc} onMudar={(n) => setRet((x) => ({ ...x, pcc: n }))} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.86rem', marginTop: '.5rem' }}>
              <input type="checkbox" checked={ret.recolhe} onChange={(e) => setRet((x) => ({ ...x, recolhe: e.target.checked }))} />
              A Ane recolhe as retenções (gera uma guia a pagar por imposto, no dia de vencimento configurado)
            </label>
            {totRet > 0 && valores.length > 0 && <p className="sub" style={{ margin: '.4rem 0 0' }}>1ª parcela: bruto {moeda(valores[0])} − retenções {moeda(totRet)} = líquido ao fornecedor <strong>{moeda(r2(valores[0] - totRet))}</strong></p>}
          </div>)}

        <div>
          <strong style={{ fontSize: '.85rem' }}>Rateio (natureza · centro de resultado · projeto)</strong>
          <EditorRateio cad={cad} tipo={tipo} linhas={rat} onMudar={setRat} total={valores[0] ?? null} />
        </div>

        {valores.length > 1 && (
          <details>
            <summary className="sub" style={{ cursor: 'pointer' }}>Prévia das {valores.length} parcelas · total {moeda(r2(valores.reduce((s, v) => s + v, 0)))}</summary>
            <table className="fin-tabela" style={{ marginTop: '.4rem' }}>
              <thead><tr><th>Parcela</th><th>Vencimento</th><th className="d">Valor</th></tr></thead>
              <tbody>{valores.slice(0, 60).map((v, i) => <tr key={i}><td>{i + 1}/{valores.length}</td><td>{dia(venc(i))}</td><td className="d">{moeda(v)}</td></tr>)}</tbody>
            </table>
          </details>)}

        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes">
          <button type="button" className="sec" onClick={onFechar}>Cancelar</button>
          <button type="submit" disabled={enviando}>{enviando ? 'Salvando…' : f.parcelas > 1 ? `Lançar ${f.parcelas} títulos` : 'Lançar título'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ======================================================================= Baixa (simples, parcial, agrupada, compensação)
interface LinhaB { t: TituloResumo; valor: number | null; juros: number | null; multa: number | null; desconto: number | null; taxa: number | null }

export function BaixaTitulos({ ctx, titulos, cad, onFechar, onSalvo }: { ctx: Contexto; titulos: TituloResumo[]; cad: CadastrosFin; onFechar: () => void; onSalvo: () => void }) {
  const [data, setData] = useState(hojeIso())
  const [conta, setConta] = useState(titulos.length === 1 ? (cad.contas.find((c) => c.nome === titulos[0].conta_prevista)?.id ?? '') : '')
  const [tipoTit, setTipoTit] = useState('')
  const [hist, setHist] = useState('')
  const [linhas, setLinhas] = useState<LinhaB[]>(titulos.map((t) => ({ t, valor: t.saldo, juros: null, multa: null, desconto: null, taxa: null })))
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const mix = new Set(titulos.map((t) => t.tipo)).size > 1
  const sinal = (t: TituloResumo) => (t.tipo === 'R' ? 1 : -1)
  const mov = (l: LinhaB) => r2((l.valor ?? 0) + (l.juros ?? 0) + (l.multa ?? 0) - (l.desconto ?? 0) - (l.taxa ?? 0))
  const liquido = r2(linhas.reduce((s, l) => s + sinal(l.t) * mov(l), 0))
  const muda = (i: number, p: Partial<LinhaB>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const tt = cad.tipos.find((x) => x.id === tipoTit)
  const aplicarTaxa = () => tt && setLinhas((ls) => ls.map((l) => ({ ...l, taxa: l.t.tipo === 'R' ? r2((l.valor ?? 0) * tt.taxa_pct / 100 + tt.taxa_fixa) : l.taxa })))

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null)
    if (liquido !== 0 && !conta) return setErro('Escolha a conta onde o dinheiro entra ou sai.')
    if (linhas.some((l) => !l.valor || l.valor <= 0 || l.valor > l.t.saldo)) return setErro('O valor de cada título precisa ser maior que zero e no máximo o saldo.')
    setEnviando(true)
    try {
      const itens: ItemBaixa[] = linhas.map((l) => ({ titulo_id: l.t.id, valor: l.valor ?? undefined, juros: l.juros ?? 0, multa: l.multa ?? 0, desconto: l.desconto ?? 0, taxa: l.taxa ?? 0, tipo_titulo_id: tipoTit || null }))
      await apiTitulos.baixar(ctx.empresa, { data, conta_id: conta || null, historico: hist || undefined, itens })
      onSalvo()
    } catch (x) { setErro((x as Error).message) } finally { setEnviando(false) }
  }

  const rotulo = mix ? 'Compensar' : titulos[0]?.tipo === 'R' ? 'Receber' : 'Pagar'
  return (
    <Modal titulo={`${rotulo} ${titulos.length > 1 ? `${titulos.length} títulos` : `título #${titulos[0]?.numero}`}`} onFechar={onFechar} larga>
      <form className="form" onSubmit={salvar}>
        {mix && <div className="fin-aviso">Compensação: títulos a receber e a pagar do mesmo parceiro se abatem. Só a diferença passa pela conta{liquido === 0 ? ' (aqui, nenhuma: não há movimento bancário)' : ''}.</div>}
        <div className="fin-linha-form">
          <Campo rotulo="Data da baixa"><input type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Campo>
          <Campo rotulo="Conta"><select value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">—</option>{cad.contas.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          <Campo rotulo="Meio (tipo de título)"><select value={tipoTit} onChange={(e) => setTipoTit(e.target.value)}>
            <option value="">O do título</option>{cad.tipos.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
          {tt && (tt.taxa_pct > 0 || tt.taxa_fixa > 0) && <button type="button" className="sec" onClick={aplicarTaxa}>Aplicar taxa {tt.taxa_pct}%{tt.taxa_fixa ? ` + ${moeda(tt.taxa_fixa)}` : ''}</button>}
          <Campo rotulo="Histórico"><input value={hist} onChange={(e) => setHist(e.target.value)} placeholder="Opcional" /></Campo>
        </div>
        <div className="tabela-rolavel">
          <table className="fin-tabela">
            <thead><tr><th>Título</th><th>Parceiro</th><th className="d">Saldo</th><th className="d">Valor a baixar</th><th className="d">Juros</th><th className="d">Multa</th>
              <th className="d">Desconto</th><th className="d">Taxa</th><th className="d">Na conta</th></tr></thead>
            <tbody>{linhas.map((l, i) => (
              <tr key={l.t.id}>
                <td>#{l.t.numero} {l.t.tipo === 'R' ? '↑' : '↓'}{l.t.parcela ? ` · ${l.t.parcela}` : ''}<br /><small className="sub">vence {dia(l.t.vencimento)}</small></td>
                <td>{l.t.parceiro_nome}</td>
                <td className="d">{moeda(l.t.saldo)}</td>
                <td className="d"><CampoValor valor={l.valor} onMudar={(n) => muda(i, { valor: n })} />{l.valor != null && l.valor < l.t.saldo && <><br /><small className="sub">parcial · resta {moeda(r2(l.t.saldo - l.valor))}</small></>}</td>
                <td className="d"><CampoValor valor={l.juros} onMudar={(n) => muda(i, { juros: n })} /></td>
                <td className="d"><CampoValor valor={l.multa} onMudar={(n) => muda(i, { multa: n })} /></td>
                <td className="d"><CampoValor valor={l.desconto} onMudar={(n) => muda(i, { desconto: n })} /></td>
                <td className="d"><CampoValor valor={l.taxa} onMudar={(n) => muda(i, { taxa: n })} /></td>
                <td className="d"><Valor v={sinal(l.t) * mov(l)} sinal /></td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={8}>Movimento na conta {liquido > 0 ? '(entrada)' : liquido < 0 ? '(saída)' : ''}</td><td className="d"><Valor v={liquido} sinal /></td></tr></tfoot>
          </table>
        </div>
        <small className="sub">Valor menor que o saldo faz baixa parcial: o restante continua em aberto no mesmo título. Várias linhas viram um lote com um único movimento na conta.</small>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button><button type="submit" disabled={enviando}>{enviando ? 'Baixando…' : `Confirmar ${rotulo.toLowerCase()}`}</button></div>
      </form>
    </Modal>
  )
}

// ======================================================================= Renegociação
function Renegociar({ ctx, titulos, cad, onFechar, onSalvo }: { ctx: Contexto; titulos: TituloResumo[]; cad: CadastrosFin; onFechar: () => void; onSalvo: () => void }) {
  const total = r2(titulos.reduce((s, t) => s + t.saldo, 0))
  const [juros, setJuros] = useState<number | null>(null)
  const [desc, setDesc] = useState<number | null>(null)
  const [parcelas, setParcelas] = useState(1)
  const [venc, setVenc] = useState(somarDias(hojeIso(), 30))
  const [per, setPer] = useState('mensal')
  const [tipoTit, setTipoTit] = useState('')
  const [hist, setHist] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const novo = r2(total + (juros ?? 0) - (desc ?? 0))
  const vals = novo > 0 ? dividir(novo, parcelas) : []
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null)
    try {
      await apiTitulos.renegociar(ctx.empresa, { titulos: titulos.map((t) => t.id), juros, desconto: desc, parcelas, primeiro_vencimento: venc, periodicidade: per, tipo_titulo_id: tipoTit || null, historico: hist || null })
      onSalvo()
    } catch (x) { setErro((x as Error).message) }
  }
  return (
    <Modal titulo={`Renegociar ${titulos.length} título${titulos.length > 1 ? 's' : ''} · ${titulos[0]?.parceiro_nome}`} onFechar={onFechar} larga>
      <form className="form" onSubmit={salvar}>
        <p className="sub">Os títulos originais ficam como “renegociado”, visíveis para consulta, e o saldo deles passa para os novos títulos. Dá para renegociar de novo depois e para desfazer enquanto nenhum título novo tiver baixa.</p>
        <table className="fin-tabela">
          <thead><tr><th>Título</th><th>Documento</th><th>Vencimento</th><th className="d">Saldo levado</th></tr></thead>
          <tbody>{titulos.map((t) => <tr key={t.id}><td>#{t.numero}</td><td>{t.documento ?? '—'}</td><td>{dia(t.vencimento)}</td><td className="d">{moeda(t.saldo)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Saldo renegociado</td><td className="d">{moeda(total)}</td></tr></tfoot>
        </table>
        <div className="grade-2">
          <CampoValor rotulo="Juros da renegociação" valor={juros} onMudar={setJuros} />
          <CampoValor rotulo="Desconto concedido" valor={desc} onMudar={setDesc} />
          <Campo rotulo="Parcelas"><input type="number" min={1} max={360} value={parcelas} onChange={(e) => setParcelas(Math.max(1, Number(e.target.value) || 1))} /></Campo>
          <Campo rotulo="1º vencimento"><input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} required /></Campo>
          {parcelas > 1 && <Campo rotulo="Periodicidade"><select value={per} onChange={(e) => setPer(e.target.value)}>
            <option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option></select></Campo>}
          <Campo rotulo="Tipo de título"><select value={tipoTit} onChange={(e) => setTipoTit(e.target.value)}>
            <option value="">O mesmo do original</option>{cad.tipos.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
        </div>
        <Campo rotulo="Histórico"><input value={hist} onChange={(e) => setHist(e.target.value)} placeholder="ex.: acordo por WhatsApp em 26/11" /></Campo>
        <div className="fin-comp">
          <div><span>Saldo renegociado</span><span>{moeda(total)}</span></div>
          <div className="mais"><span>+ Juros (entram no DRE como receita/despesa financeira)</span><span>{moeda(juros ?? 0)}</span></div>
          <div className="menos"><span>− Desconto</span><span>{moeda(desc ?? 0)}</span></div>
          <div className="total"><span>Novo total em {parcelas} parcela{parcelas > 1 ? 's' : ''}</span><span>{moeda(novo)}{vals.length > 1 ? ` (${parcelas}× ~${moeda(vals[0])})` : ''}</span></div>
        </div>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button><button type="submit" disabled={novo <= 0}>Renegociar</button></div>
      </form>
    </Modal>
  )
}

// ======================================================================= Adiantamento
function Adiantamento({ ctx, tipo, cad, onFechar, onSalvo }: { ctx: Contexto; tipo: TipoTitulo; cad: CadastrosFin; onFechar: () => void; onSalvo: () => void }) {
  const [parc, setParc] = useState<{ id: string | null; nome: string }>({ id: null, nome: '' })
  const [valor, setValor] = useState<number | null>(null)
  const [data, setData] = useState(hojeIso())
  const [conta, setConta] = useState('')
  const [hist, setHist] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null)
    if (!parc.id) return setErro('Escolha o parceiro.')
    try {
      await apiTitulos.criarAdiantamento(ctx.empresa, { tipo: tipo === 'R' ? 'cliente' : 'fornecedor', parceiro_id: parc.id, valor, data, conta_id: conta || null, historico: hist || null })
      onSalvo()
    } catch (x) { setErro((x as Error).message) }
  }
  return (
    <Modal titulo={TXT[tipo].adiant} onFechar={onFechar}>
      <form className="form" onSubmit={salvar}>
        <p className="sub">{tipo === 'R'
          ? 'O cliente pagou antes da compra. O CRM registra a entrada do dinheiro e cria um crédito a pagar para o cliente; os dois ficam ligados e o crédito é usado na compensação com a venda.'
          : 'A Ane pagou antes de receber. O CRM registra a saída do dinheiro e cria um crédito a receber do fornecedor; os dois ficam ligados e o crédito é usado na compensação com a conta a pagar.'}</p>
        <Campo rotulo={TXT[tipo].parceiro}><ParceiroBusca empresa={ctx.empresa} valor={parc.id} nome={parc.nome} onEscolher={(id, nome) => setParc({ id, nome })} /></Campo>
        <div className="grade-2">
          <CampoValor rotulo="Valor" valor={valor} onMudar={setValor} obrigatorio />
          <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Campo>
        </div>
        <Campo rotulo="Conta"><select value={conta} onChange={(e) => setConta(e.target.value)} required>
          <option value="">—</option>{cad.contas.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        <Campo rotulo="Histórico"><input value={hist} onChange={(e) => setHist(e.target.value)} /></Campo>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button><button type="submit">Registrar adiantamento</button></div>
      </form>
    </Modal>
  )
}
