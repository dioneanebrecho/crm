import { useState } from 'react'
import type { Contexto } from '../App'
import { apiTitulos, TIPOS_CONTA, dia, dataHora, hojeIso, inicioMes, moeda, r2, type Movimento, type SaldoConta } from '../apiTitulos'
import GradeDados, { type Coluna } from '../GradeDados'
import { Campo, Modal, Titulo, useCarregar } from '../ui'
import { useEstadoTela } from '../abas'
import { CampoValor, Valor, podeEditar } from './finComum'

// Contas e saldos: saldo de cada conta em uma data (sistema, conciliado e extrato), movimentos e transferências. Pedido 050.

export default function ContasBancarias({ ctx }: { ctx: Contexto }) {
  const pode = podeEditar(ctx, 'contas_bancarias')
  const [data, setData] = useEstadoTela('contas_bancarias.data', '')
  const [contaSel, setContaSel] = useEstadoTela<string>('contas_bancarias.conta', '')
  const [de, setDe] = useState(inicioMes(hojeIso()))
  const [ate, setAte] = useState(hojeIso())
  const [modal, setModal] = useState<null | 'transferir' | { estornar: Movimento }>(null)
  const saldos = useCarregar(() => apiTitulos.saldos(ctx.empresa, data || null), [ctx.empresa, data])
  const contas = saldos.dados?.contas ?? []
  const atual = contas.find((c) => c.id === contaSel) ?? contas.find((c) => c.ativa)
  const movs = useCarregar(() => (atual ? apiTitulos.movimentos(ctx.empresa, atual.id, de || null, ate || null) : Promise.resolve(null)), [ctx.empresa, atual?.id, de, ate])
  const ativas = contas.filter((c) => c.ativa)
  const tot = (k: 'sistema' | 'conciliado' | 'extrato') => r2(ativas.reduce((s, c) => s + c[k], 0))
  const recarregar = () => { saldos.recarregar(); movs.recarregar() }

  const colunas: Coluna<Movimento>[] = [
    { id: 'data', titulo: 'Data', texto: (m) => dia(m.data), valor: (m) => m.data, largura: 95 },
    { id: 'historico', titulo: 'Histórico', texto: (m) => m.historico ?? '', largura: 300 },
    { id: 'tipo', titulo: 'Tipo', texto: (m) => (m.tipo === 'transferencia' ? 'Transferência' : m.tipo === 'ajuste' ? 'Ajuste' : m.lote ? `Baixa em lote ${m.lote}` : 'Baixa') },
    { id: 'titulos', titulo: 'Títulos', texto: (m) => (m.titulos ?? []).map((t) => `#${t.numero}`).join(' '), largura: 140 },
    { id: 'entrada', titulo: 'Entrada', texto: (m) => (m.valor > 0 && !m.estornado ? moeda(m.valor) : ''), valor: (m) => (m.valor > 0 && !m.estornado ? m.valor : 0), direita: true, formatar: moeda },
    { id: 'saida', titulo: 'Saída', texto: (m) => (m.valor < 0 && !m.estornado ? moeda(-m.valor) : ''), valor: (m) => (m.valor < 0 && !m.estornado ? -m.valor : 0), direita: true, formatar: moeda },
    { id: 'saldo', titulo: 'Saldo', texto: (m) => moeda(m.saldo), valor: (m) => m.saldo, direita: true, somar: false, render: (m) => <Valor v={m.saldo} sinal /> },
    { id: 'banco', titulo: 'No banco', largura: 170, texto: (m) => (m.estornado ? 'Estornado' : m.conciliado ? `Conciliado ${dia(m.data_banco)}` : 'Aguardando extrato'),
      render: (m) => m.estornado ? <span className="fin-sit cancelado">Estornado</span>
        : m.conciliado ? <span className="fin-sit conciliado" title={`Conciliado em ${dataHora(m.conciliado_em)}`}>Banco {dia(m.data_banco)}</span>
        : <span className="fin-sit pendente">Aguardando extrato</span> },
    ...(pode ? [{ id: 'acoes', titulo: 'Ações', simples: true, somar: false, texto: () => '',
      render: (m: Movimento) => m.tipo === 'transferencia' && !m.estornado && !m.conciliado
        ? <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setModal({ estornar: m }) }}>Estornar</button> : null }] : []),
  ]

  return (
    <section>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Saldo de cada conta em uma data. <strong>Sistema</strong> soma o saldo inicial e todas as baixas até a data. <strong>Conciliado</strong> soma só o que já foi conferido com o extrato, pela data em que caiu no banco. <strong>Extrato</strong> soma as linhas do OFX importado. Quando conciliado e extrato batem, a conta está fechada naquele dia.</>}>
            Contas e saldos
          </Titulo>
          <p className="sub">Saldo em {dia(saldos.dados?.data)} · {ativas.length} conta{ativas.length === 1 ? '' : 's'} ativa{ativas.length === 1 ? '' : 's'}</p>
        </div>
        <div className="fin-acoes" style={{ alignItems: 'flex-end' }}>
          <label className="campo"><span>Saldo em</span><input type="date" value={data || saldos.dados?.data || ''} onChange={(e) => setData(e.target.value)} /></label>
          {data && <button type="button" className="link" onClick={() => setData('')}>Hoje</button>}
          {pode && ativas.length > 1 && <button className="sec" onClick={() => setModal('transferir')}>Transferir entre contas</button>}
        </div>
      </div>

      {saldos.erro && <div className="erro">{saldos.erro}</div>}
      {saldos.dados && contas.length === 0 && <div className="vazio"><strong>Nenhuma conta cadastrada</strong><p>Cadastre as contas bancárias, o caixa e as carteiras dos gateways em Cadastros financeiros, com o saldo inicial na data de implantação.</p></div>}
      {ativas.length > 0 && (
        <div className="resumo-faixa fin-kpi">
          <div><span>Saldo no sistema</span><strong className={tot('sistema') < 0 ? 'neg' : ''}>{moeda(tot('sistema'))}</strong></div>
          <div><span>Saldo conciliado</span><strong>{moeda(tot('conciliado'))}</strong></div>
          <div><span>A conciliar</span><strong>{moeda(r2(tot('sistema') - tot('conciliado')))}</strong></div>
        </div>)}
      <div className="fin-contas">
        {contas.map((c) => <CartaoConta key={c.id} c={c} sel={c.id === atual?.id} onClick={() => setContaSel(c.id)} />)}
      </div>

      {atual && (
        <div>
          <div className="fin-linha-form">
            <strong style={{ alignSelf: 'center' }}>Movimentos · {atual.nome}</strong>
            <Campo rotulo="De"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
            <Campo rotulo="Até"><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
            {movs.dados && <span className="sub" style={{ alignSelf: 'center' }}>Saldo anterior a {dia(movs.dados.de)}: <strong>{moeda(movs.dados.saldo_anterior)}</strong></span>}
          </div>
          {movs.erro && <div className="erro">{movs.erro}</div>}
          {movs.dados && <GradeDados id="fin.movimentos" titulo={`Movimentos ${atual.nome}`} colunas={colunas} linhas={movs.dados.itens} chave={(m) => m.id} altura="50vh" vazio="Nenhum movimento no período." />}
        </div>)}

      {modal === 'transferir' && <Transferir ctx={ctx} contas={ativas} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); recarregar() }} />}
      {modal && typeof modal === 'object' && (
        <Modal titulo="Estornar transferência" onFechar={() => setModal(null)}>
          <EstornarTransf ctx={ctx} m={modal.estornar} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); recarregar() }} />
        </Modal>)}
    </section>
  )
}

function CartaoConta({ c, sel, onClick }: { c: SaldoConta; sel: boolean; onClick: () => void }) {
  const dif = r2(c.extrato - c.conciliado)
  return (
    <button type="button" className={sel ? 'fin-conta sel' : 'fin-conta'} onClick={onClick} style={{ opacity: c.ativa ? 1 : 0.55 }}>
      <span className="nome"><span>{c.nome}</span><small className="sub">{TIPOS_CONTA[c.tipo] ?? c.tipo}{c.ativa ? '' : ' · inativa'}</small></span>
      <span className="saldo"><Valor v={c.sistema} sinal /></span>
      <dl>
        <dt>Conciliado</dt><dd>{moeda(c.conciliado)}</dd>
        <dt>A conciliar</dt><dd>{moeda(r2(c.sistema - c.conciliado))}</dd>
        {c.tem_extrato && <><dt>Extrato (OFX)</dt><dd>{moeda(c.extrato)}</dd>
          <dt>Extrato − conciliado</dt><dd style={{ color: dif === 0 ? 'var(--ok)' : 'var(--erro)' }}>{dif === 0 ? 'confere' : moeda(dif)}</dd></>}
        <dt>Saldo inicial</dt><dd>{moeda(c.saldo_inicial)} em {dia(c.data_saldo_inicial)}</dd>
      </dl>
    </button>
  )
}

function Transferir({ ctx, contas, onFechar, onSalvo }: { ctx: Contexto; contas: SaldoConta[]; onFechar: () => void; onSalvo: () => void }) {
  const [de, setDe] = useState(contas[0]?.id ?? '')
  const [para, setPara] = useState(contas[1]?.id ?? '')
  const [valor, setValor] = useState<number | null>(null)
  const [data, setData] = useState(hojeIso())
  const [hist, setHist] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null)
    if (de === para) return setErro('Escolha contas diferentes.')
    if (!valor || valor <= 0) return setErro('Informe o valor.')
    try { await apiTitulos.transferir(ctx.empresa, de, para, valor, data, hist || null); onSalvo() } catch (x) { setErro((x as Error).message) }
  }
  return (
    <Modal titulo="Transferir entre contas" onFechar={onFechar}>
      <form className="form" onSubmit={salvar}>
        <p className="sub">Gera uma saída na conta de origem e uma entrada na de destino, na mesma data. Não afeta o DRE.</p>
        <div className="grade-2">
          <Campo rotulo="De"><select value={de} onChange={(e) => setDe(e.target.value)}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          <Campo rotulo="Para"><select value={para} onChange={(e) => setPara(e.target.value)}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          <CampoValor rotulo="Valor" valor={valor} onMudar={setValor} obrigatorio />
          <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Campo>
        </div>
        <Campo rotulo="Histórico"><input value={hist} onChange={(e) => setHist(e.target.value)} placeholder="ex.: saque do Mercado Pago para o Itaú" /></Campo>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button><button type="submit">Transferir</button></div>
      </form>
    </Modal>
  )
}

function EstornarTransf({ ctx, m, onFechar, onSalvo }: { ctx: Contexto; m: Movimento; onFechar: () => void; onSalvo: () => void }) {
  const [erro, setErro] = useState<string | null>(null)
  return (
    <div className="form">
      <p>Estornar a transferência de {moeda(Math.abs(m.valor))} em {dia(m.data)}? Os dois lados (saída e entrada) são estornados.</p>
      {erro && <div className="erro" role="alert">{erro}</div>}
      <div className="acoes">
        <button type="button" className="sec" onClick={onFechar}>Voltar</button>
        <button type="button" onClick={async () => { try { await apiTitulos.estornarTransferencia(ctx.empresa, m.id); onSalvo() } catch (x) { setErro((x as Error).message) } }}>Estornar</button>
      </div>
    </div>
  )
}
