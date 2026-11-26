import { useRef, useState } from 'react'
import type { Contexto } from '../App'
import { apiTitulos, dia, dataHora, hashTexto, hojeIso, inicioMes, lerOfx, moeda, r2, type CadastrosFin, type Conciliacao as Conc, type ExtratoOfx, type LinhaExtrato } from '../apiTitulos'
import { ComboBusca } from '../ComboBusca'
import GradeDados, { type Coluna } from '../GradeDados'
import { Abas, Campo, Modal, Titulo, useCarregar } from '../ui'
import { useEstadoTela } from '../abas'
import { ParceiroBusca, SeloSit, Valor, opcoesCr, opcoesNat, podeEditar } from './finComum'

// Conciliação bancária: importa o OFX (lido no navegador), compara o saldo do extrato com o conciliado dia a dia e liga cada linha a um movimento. Pedido 050.

type Aba = 'linhas' | 'diario' | 'sistema'

export default function Conciliacao({ ctx }: { ctx: Contexto }) {
  const pode = podeEditar(ctx, 'conciliacao')
  const cad = useCarregar(() => apiTitulos.cadastros(ctx.empresa), [ctx.empresa])
  const [conta, setConta] = useEstadoTela('conciliacao.conta', '')
  const [data, setData] = useState(hojeIso())
  const [de, setDe] = useState(inicioMes(hojeIso()))
  const [aba, setAba] = useState<Aba>('linhas')
  const [soPend, setSoPend] = useState(false)
  const [importar, setImportar] = useState<{ arquivo: string; texto: string; ofx: ExtratoOfx } | null>(null)
  const [acao, setAcao] = useState<null | { escolher: LinhaExtrato } | { ignorar: LinhaExtrato } | { criar: LinhaExtrato }>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const contas = (cad.dados?.contas ?? []).filter((c) => c.ativa)
  const contaId = contas.some((c) => c.id === conta) ? conta : contas[0]?.id ?? ''
  const conc = useCarregar(() => (contaId ? apiTitulos.conciliacao(ctx.empresa, contaId, data || null, de || null) : Promise.resolve(null)), [ctx.empresa, contaId, data, de])
  const c = conc.dados

  const executar = async (f: () => Promise<unknown>, ok?: string) => {
    setErro(null); setAviso(null)
    try { await f(); if (ok) setAviso(ok); setAcao(null); conc.recarregar() } catch (x) { setErro((x as Error).message) }
  }
  async function lerArquivo(f: File) {
    setErro(null); setAviso(null)
    // OFX de banco brasileiro costuma vir em latin1; tenta UTF-8 e cai para windows-1252 se houver caractere inválido
    const buf = await f.arrayBuffer()
    let texto = new TextDecoder('utf-8').decode(buf)
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf)
    const ofx = lerOfx(texto)
    if (ofx.linhas.length === 0) return setErro('Não encontrei lançamentos neste arquivo. Confira se é um OFX exportado pelo banco.')
    setImportar({ arquivo: f.name, texto, ofx })
  }

  const linhas = (c?.linhas ?? []).filter((l) => !soPend || l.situacao === 'pendente')
  const colunas: Coluna<LinhaExtrato>[] = [
    { id: 'data', titulo: 'Data no banco', texto: (l) => dia(l.data), valor: (l) => l.data, largura: 100 },
    { id: 'descricao', titulo: 'Descrição do extrato', texto: (l) => l.descricao ?? '', largura: 280 },
    { id: 'valor', titulo: 'Valor', texto: (l) => moeda(l.valor), valor: (l) => l.valor, direita: true, formatar: moeda, render: (l) => <Valor v={l.valor} sinal /> },
    { id: 'saldo', titulo: 'Saldo do extrato', texto: (l) => moeda(l.saldo_extrato), valor: (l) => l.saldo_extrato, direita: true, somar: false },
    { id: 'situacao', titulo: 'Situação', texto: (l) => l.situacao, render: (l) => <SeloSit s={l.situacao} />, largura: 110 },
    { id: 'sistema', titulo: 'No sistema', largura: 300, texto: (l) => l.conciliacao ? `baixa ${dia(l.conciliacao.data_baixa)} ${(l.conciliacao.titulos ?? []).map((n) => '#' + n).join(' ')}`
        : l.sugestao ? `sugestão: baixa ${dia(l.sugestao.data_baixa)}` : l.motivo_ignorar ?? '',
      render: (l) => l.conciliacao
        ? <span title={`Conciliado em ${dataHora(l.conciliacao.conciliado_em)}`}>Baixa de {dia(l.conciliacao.data_baixa)}{(l.conciliacao.titulos ?? []).length ? ` · ${(l.conciliacao.titulos ?? []).map((n) => '#' + n).join(' ')}` : ''}
            {l.conciliacao.data_baixa !== l.conciliacao.data_banco && <small className="sub"> · banco {dia(l.conciliacao.data_banco)}</small>}</span>
        : l.sugestao ? <span className="sub">Sugestão: {l.sugestao.historico ?? 'baixa'} de {dia(l.sugestao.data_baixa)}{(l.sugestao.titulos ?? []).length ? ` · ${(l.sugestao.titulos ?? []).map((n) => '#' + n).join(' ')}` : ''}</span>
        : l.situacao === 'ignorada' ? <span className="sub">{l.motivo_ignorar}</span> : <span className="sub">Sem baixa com este valor</span> },
    ...(pode ? [{ id: 'acoes', titulo: 'Ações', simples: true, somar: false, largura: 260, texto: () => '',
      render: (l: LinhaExtrato) => (
        <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {l.situacao === 'pendente' && l.sugestao && <button type="button" onClick={() => executar(() => apiTitulos.conciliar(ctx.empresa, l.id, l.sugestao!.movimento_id), 'Linha conciliada.')}>Conciliar</button>}
          {l.situacao === 'pendente' && <button type="button" className="sec" onClick={() => setAcao({ escolher: l })}>Escolher</button>}
          {l.situacao === 'pendente' && <button type="button" className="sec" onClick={() => setAcao({ criar: l })}>Criar título</button>}
          {l.situacao === 'pendente' && <button type="button" className="link" onClick={() => setAcao({ ignorar: l })}>Ignorar</button>}
          {l.situacao !== 'pendente' && <button type="button" className="link" onClick={() => executar(() => apiTitulos.desconciliar(ctx.empresa, l.id), 'Conciliação desfeita.')}>Desfazer</button>}
        </span>) }] : []),
  ]

  return (
    <section>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Importe o OFX do banco e confira dia a dia. Cada linha do extrato é ligada a um movimento do sistema (a baixa de um ou vários títulos, ou uma transferência).
            Ao conciliar, o movimento passa a contar no saldo <strong>conciliado</strong> pela data em que caiu no banco, que pode ser diferente da data da baixa.
            A conta está fechada no dia quando o saldo do extrato e o conciliado são iguais, e o saldo final do OFX confere com o calculado.</>}>
            Conciliação bancária
          </Titulo>
          {c && <p className="sub">{c.conta} · de {dia(c.de)} até {dia(c.data)} · {c.linhas_pendentes} linha{c.linhas_pendentes === 1 ? '' : 's'} pendente{c.linhas_pendentes === 1 ? '' : 's'}</p>}
        </div>
        {pode && contaId && (
          <div className="fin-acoes">
            <input ref={arquivo} type="file" accept=".ofx,.OFX,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) lerArquivo(f) }} />
            <button onClick={() => arquivo.current?.click()}>Importar OFX</button>
          </div>)}
      </div>

      <div className="fin-linha-form">
        <Campo rotulo="Conta"><select value={contaId} onChange={(e) => setConta(e.target.value)}>
          {contas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
        <Campo rotulo="Saldo em"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <Campo rotulo="Linhas desde"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
      </div>

      {(cad.erro || conc.erro) && <div className="erro">{cad.erro ?? conc.erro}</div>}
      {erro && <div className="erro" role="alert">{erro}</div>}
      {aviso && <div className="info" role="status">{aviso}</div>}
      {cad.dados && contas.length === 0 && <div className="vazio"><strong>Nenhuma conta ativa</strong><p>Cadastre as contas em Cadastros financeiros.</p></div>}
      {contaId && !c && !conc.erro && <p className="sub">Carregando…</p>}

      {c && (<>
        <div className="resumo-faixa fin-kpi">
          <div><span>Extrato em {dia(c.data)}</span><strong>{c.saldos.tem_extrato ? moeda(c.saldos.extrato) : '—'}</strong></div>
          <div><span>Conciliado em {dia(c.data)}</span><strong>{moeda(c.saldos.conciliado)}</strong></div>
          <div className={c.saldos.tem_extrato && Math.abs(c.diferenca) >= 0.005 ? 'alerta' : ''}><span>Extrato − conciliado</span>
            <strong className={c.saldos.tem_extrato && Math.abs(c.diferenca) >= 0.005 ? 'neg' : 'pos'}>{c.saldos.tem_extrato ? (Math.abs(c.diferenca) < 0.005 ? 'Confere' : moeda(c.diferenca)) : '—'}</strong></div>
          <div><span>Saldo no sistema</span><strong>{moeda(c.saldos.sistema)}</strong></div>
          <div><span>Baixas sem extrato</span><strong>{c.baixas_sem_extrato.qtd} · {moeda(c.baixas_sem_extrato.valor)}</strong></div>
        </div>

        {c.ofx && (c.ofx.confere
          ? <div className="fin-ok">Saldo final do OFX em {dia(c.ofx.data_saldo)}: {moeda(c.ofx.saldo_banco)}, igual ao saldo calculado pelas linhas importadas. O extrato está completo até essa data.</div>
          : <div className="fin-aviso">Saldo final do OFX em {dia(c.ofx.data_saldo)}: {moeda(c.ofx.saldo_banco)}, mas as linhas importadas somam {moeda(c.ofx.saldo_calculado)} (diferença {moeda(r2(c.ofx.saldo_banco - c.ofx.saldo_calculado))}).
            Falta importar algum período ou o saldo inicial da conta não confere com o banco.</div>)}
        {!c.saldos.tem_extrato && <div className="fin-aviso">Nenhum extrato importado nesta conta. Importe o OFX do banco para comparar os saldos.</div>}

        <Abas<Aba> abas={[{ id: 'linhas', rotulo: 'Linhas do extrato', contagem: c.linhas.length }, { id: 'diario', rotulo: 'Saldo dia a dia', contagem: c.diario.length },
          { id: 'sistema', rotulo: 'Baixas sem extrato', contagem: c.pendentes_sistema.length }]} ativa={aba} onMudar={setAba} />

        {aba === 'linhas' && (<>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.85rem', marginBottom: '.4rem' }}>
            <input type="checkbox" checked={soPend} onChange={(e) => setSoPend(e.target.checked)} /> Só pendentes
          </label>
          <GradeDados id="fin.conciliacao" titulo={`Extrato ${c.conta}`} colunas={colunas} linhas={linhas} chave={(l) => l.id} altura="55vh" vazio="Nenhuma linha de extrato no período." />
        </>)}

        {aba === 'diario' && (
          <div className="tabela-rolavel">
            <table className="fin-tabela">
              <thead><tr><th>Dia</th><th className="d">Movimento no extrato</th><th className="d">Saldo do extrato</th><th className="d">Saldo conciliado</th><th className="d">Diferença</th><th className="d">Saldo no sistema</th></tr></thead>
              <tbody>{c.diario.map((d) => {
                const dif = r2(d.extrato - d.conciliado)
                return (
                  <tr key={d.dia}>
                    <td>{dia(d.dia)}</td><td className="d"><Valor v={d.extrato_no_dia} sinal /></td><td className="d">{moeda(d.extrato)}</td><td className="d">{moeda(d.conciliado)}</td>
                    <td className="d" style={{ color: dif === 0 ? 'var(--ok)' : 'var(--erro)', fontWeight: 700 }}>{dif === 0 ? 'confere' : moeda(dif)}</td><td className="d">{moeda(d.sistema)}</td>
                  </tr>)
              })}</tbody>
            </table>
            <small className="sub">Dia com diferença tem linha do extrato não conciliada ou baixa conciliada com data de banco diferente. O saldo do sistema conta as baixas pela data da baixa.</small>
          </div>)}

        {aba === 'sistema' && (c.pendentes_sistema.length === 0 ? <p className="sub">Todas as baixas até {dia(c.data)} já estão no extrato.</p> : (
          <table className="fin-tabela">
            <thead><tr><th>Data da baixa</th><th>Histórico</th><th className="d">Valor</th></tr></thead>
            <tbody>{c.pendentes_sistema.map((m) => <tr key={m.id}><td>{dia(m.data)}</td><td>{m.historico ?? '—'}</td><td className="d"><Valor v={m.valor} sinal /></td></tr>)}</tbody>
            <tfoot><tr><td colSpan={2}>Total</td><td className="d">{moeda(r2(c.pendentes_sistema.reduce((s, m) => s + m.valor, 0)))}</td></tr></tfoot>
          </table>))}
      </>)}

      {importar && contaId && <ImportarOfx ctx={ctx} conta={contaId} contaNome={contas.find((x) => x.id === contaId)?.nome ?? ''} dados={importar}
        onFechar={() => setImportar(null)} onSalvo={(msg) => { setImportar(null); setAviso(msg); conc.recarregar() }} />}
      {acao && 'escolher' in acao && c && <EscolherMovimento linha={acao.escolher} c={c} onFechar={() => setAcao(null)}
        onEscolher={(mov) => executar(() => apiTitulos.conciliar(ctx.empresa, acao.escolher.id, mov), 'Linha conciliada.')} />}
      {acao && 'ignorar' in acao && <IgnorarLinha linha={acao.ignorar} onFechar={() => setAcao(null)}
        onConfirmar={(m) => executar(() => apiTitulos.ignorarLinha(ctx.empresa, acao.ignorar.id, m), 'Linha ignorada.')} />}
      {acao && 'criar' in acao && cad.dados && <CriarTituloLinha ctx={ctx} linha={acao.criar} cad={cad.dados} onFechar={() => setAcao(null)}
        onSalvo={() => { setAcao(null); setAviso('Título criado, baixado e conciliado.'); conc.recarregar() }} />}
    </section>
  )
}

function ImportarOfx({ ctx, conta, contaNome, dados, onFechar, onSalvo }: {
  ctx: Contexto; conta: string; contaNome: string; dados: { arquivo: string; texto: string; ofx: ExtratoOfx }; onFechar: () => void; onSalvo: (msg: string) => void
}) {
  const { ofx } = dados
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const ent = r2(ofx.linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0))
  const sai = r2(ofx.linhas.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0))
  const datas = ofx.linhas.map((l) => l.data).sort()
  async function enviar() {
    setEnviando(true); setErro(null)
    try {
      const r = await apiTitulos.importarExtrato(ctx.empresa, conta, {
        arquivo_nome: dados.arquivo, arquivo_hash: await hashTexto(dados.texto), saldo_final: ofx.saldo_final, data_saldo: ofx.data_saldo, linhas: ofx.linhas,
      })
      onSalvo(`Extrato importado: ${r.novas} linha${r.novas === 1 ? '' : 's'} nova${r.novas === 1 ? '' : 's'}${r.repetidas ? `, ${r.repetidas} já existia${r.repetidas === 1 ? '' : 'm'} (ignoradas)` : ''}.`)
    } catch (x) { setErro((x as Error).message) } finally { setEnviando(false) }
  }
  return (
    <Modal titulo="Importar extrato OFX" onFechar={onFechar}>
      <div className="form">
        <p className="sub">O arquivo é lido aqui no navegador; só as linhas e o saldo final vão para o CRM. Linhas que já foram importadas (mesmo identificador do banco) são ignoradas.</p>
        <div className="fin-comp">
          <div><span>Arquivo</span><span>{dados.arquivo}</span></div>
          <div><span>Conta no CRM</span><span>{contaNome}</span></div>
          {(ofx.banco || ofx.conta) && <div><span>Conta no arquivo</span><span>banco {ofx.banco ?? '—'} · conta {ofx.conta ?? '—'}</span></div>}
          <div><span>Período</span><span>{dia(datas[0])} a {dia(datas[datas.length - 1])}</span></div>
          <div><span>Lançamentos</span><span>{ofx.linhas.length}</span></div>
          <div className="mais"><span>Entradas</span><span>{moeda(ent)}</span></div>
          <div className="menos"><span>Saídas</span><span>{moeda(sai)}</span></div>
          <div className="total"><span>Saldo final informado pelo banco</span><span>{ofx.saldo_final != null ? `${moeda(ofx.saldo_final)} em ${dia(ofx.data_saldo)}` : 'não veio no arquivo'}</span></div>
        </div>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button><button type="button" onClick={enviar} disabled={enviando}>{enviando ? 'Importando…' : 'Importar'}</button></div>
      </div>
    </Modal>
  )
}

function EscolherMovimento({ linha, c, onFechar, onEscolher }: { linha: LinhaExtrato; c: Conc; onFechar: () => void; onEscolher: (mov: string) => void }) {
  const [soValor, setSoValor] = useState(true)
  const lista = c.pendentes_sistema.filter((m) => !soValor || r2(m.valor) === r2(linha.valor))
  return (
    <Modal titulo="Escolher o movimento do sistema" onFechar={onFechar} larga>
      <p className="sub">Linha do extrato: {dia(linha.data)} · {linha.descricao ?? '—'} · <Valor v={linha.valor} sinal />. O movimento escolhido passa a contar no saldo conciliado em {dia(linha.data)}.</p>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.85rem', margin: '.4rem 0' }}>
        <input type="checkbox" checked={soValor} onChange={(e) => setSoValor(e.target.checked)} /> Só movimentos com o mesmo valor
      </label>
      {lista.length === 0 ? <p className="sub">Nenhuma baixa pendente {soValor ? 'com esse valor' : ''}. Use “Criar título” se o lançamento ainda não existe no sistema.</p> : (
        <table className="fin-tabela">
          <thead><tr><th>Data da baixa</th><th>Histórico</th><th className="d">Valor</th><th /></tr></thead>
          <tbody>{lista.map((m) => <tr key={m.id}><td>{dia(m.data)}</td><td>{m.historico ?? '—'}</td><td className="d"><Valor v={m.valor} sinal /></td>
            <td><button type="button" onClick={() => onEscolher(m.id)}>Conciliar</button></td></tr>)}</tbody>
        </table>)}
      <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Fechar</button></div>
    </Modal>
  )
}

function IgnorarLinha({ linha, onFechar, onConfirmar }: { linha: LinhaExtrato; onFechar: () => void; onConfirmar: (m: string) => void }) {
  const [m, setM] = useState('')
  return (
    <Modal titulo="Ignorar linha do extrato" onFechar={onFechar}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onConfirmar(m) }}>
        <p className="sub">{dia(linha.data)} · {linha.descricao ?? '—'} · {moeda(linha.valor)}. A linha continua no saldo do extrato, mas sai da lista de pendências.</p>
        <Campo rotulo="Motivo"><input value={m} onChange={(e) => setM(e.target.value)} required autoFocus placeholder="ex.: estorno do próprio banco no mesmo dia" /></Campo>
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Voltar</button><button type="submit">Ignorar</button></div>
      </form>
    </Modal>
  )
}

function CriarTituloLinha({ ctx, linha, cad, onFechar, onSalvo }: { ctx: Contexto; linha: LinhaExtrato; cad: CadastrosFin; onFechar: () => void; onSalvo: () => void }) {
  const tipo = linha.valor < 0 ? 'D' : 'R'
  const [parc, setParc] = useState<{ id: string | null; nome: string }>({ id: null, nome: '' })
  const [nat, setNat] = useState('')
  const [cr, setCr] = useState('')
  const [hist, setHist] = useState(linha.descricao ?? '')
  const [erro, setErro] = useState<string | null>(null)
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(null)
    if (!parc.id) return setErro('Escolha o parceiro (para tarifa bancária, use o próprio banco).')
    if (!nat) return setErro('Escolha a natureza.')
    try { await apiTitulos.criarTituloDaLinha(ctx.empresa, linha.id, { parceiro_id: parc.id, natureza_id: nat, cr_id: cr || null, historico: hist }); onSalvo() }
    catch (x) { setErro((x as Error).message) }
  }
  return (
    <Modal titulo={`Criar título ${tipo === 'R' ? 'a receber' : 'a pagar'} desta linha`} onFechar={onFechar}>
      <form className="form" onSubmit={salvar}>
        <p className="sub">Para lançamentos que só aparecem no extrato (tarifa, IOF, rendimento, PIX recebido sem pedido). O título nasce baixado em {dia(linha.data)} por {moeda(Math.abs(linha.valor))} e já conciliado com esta linha.</p>
        <Campo rotulo="Parceiro"><ParceiroBusca empresa={ctx.empresa} valor={parc.id} nome={parc.nome} onEscolher={(id, nome) => setParc({ id, nome })} /></Campo>
        <Campo rotulo="Natureza"><ComboBusca opcoes={opcoesNat(cad, tipo)} valor={nat} onEscolher={(v) => { setNat(v); const n = cad.naturezas.find((x) => x.id === v); if (n?.cr_padrao_id && !cr) setCr(n.cr_padrao_id) }} placeholder="Natureza analítica" /></Campo>
        <Campo rotulo="Centro de resultado" dica="Vazio usa o padrão da natureza"><ComboBusca opcoes={opcoesCr(cad)} valor={cr} onEscolher={setCr} placeholder="Centro de resultado" /></Campo>
        <Campo rotulo="Histórico"><input value={hist} onChange={(e) => setHist(e.target.value)} /></Campo>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button><button type="submit">Criar e conciliar</button></div>
      </form>
    </Modal>
  )
}
