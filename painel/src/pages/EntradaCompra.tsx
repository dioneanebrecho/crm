import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Contexto } from '../App'
import { api, apiParceiros, brl, type Local, type OpcaoCadastro, type ParceiroLinha } from '../api'
import { apiCompra, type EntradaDetalhe, type EntradaPeca, type EntradaResumo, type Parcela, type SimulacaoRegime, type UnidadeEntrada } from '../apiCompra'
import { ModalHistorico, ModalImprimir } from './Etiquetas'
import { apiFinanceiro, type CentroResultado, type Natureza } from '../apiFinanceiro'
import { apiGrupos, type Caracteristica, type GrupoProduto } from '../apiGrupos'
import { useTiposGrade, type TipoGrade } from '../apiGrades'
import { useMarcas } from '../CampoMarca'
import { ComboBusca, type OpcaoCombo } from '../ComboBusca'
import GradeDados, { type Coluna } from '../GradeDados'
import { lerNfe, type NotaLida } from '../xmlNfe'
import { Campo, Modal, Titulo, useCarregar } from '../ui'

// Entrada de mercadoria por XML de NF-e de compra (pedidos de mudança 037 e 040).
// O XML é lido aqui no navegador; o banco calcula rateio, custo e preço. Nada é enviado ao Bling.

const CSS = `
.ec .cx { background: var(--card); border: 1px solid var(--borda); border-radius: 12px; padding: .9rem 1rem; margin: 0 0 .9rem; }
.ec .cx > h2 { margin: 0 0 .6rem; font-size: 1.02rem; display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
.ec .grade-cab { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: .6rem; }
.ec .aviso { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; padding: .55rem .8rem; border-radius: 8px; font-size: .88rem; margin: 0 0 .5rem; }
.ec .aviso.a { background: rgba(232,179,75,.16); color: var(--aviso); } .ec .aviso.i { background: var(--marca-suave); color: var(--txt); }
.ec .barra { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin: 0 0 .6rem; }
.ec .barra .fim { margin-left: auto; }
.ec .peca { border: 1px solid var(--borda); border-radius: 10px; margin: 0 0 .5rem; background: var(--card); }
.ec .peca.lib { border-color: color-mix(in srgb, var(--ok) 55%, var(--borda)); }
.ec .peca-topo { display: flex; gap: .6rem; align-items: center; padding: .5rem .7rem; cursor: pointer; flex-wrap: wrap; }
.ec .peca-topo .nome { font-weight: 700; flex: 1 1 220px; min-width: 0; }
.ec .peca-topo .mini { color: var(--mudo); font-size: .82rem; }
.ec .seta { width: 1.2rem; display: inline-block; color: var(--mudo); }
.ec .st { padding: .1rem .6rem; border-radius: 999px; font-size: .75rem; font-weight: 700; white-space: nowrap; }
.ec .st.ok { background: rgba(92,201,138,.16); color: var(--ok); } .ec .st.pend { background: rgba(232,179,75,.18); color: var(--aviso); } .ec .st.cad { background: var(--erro-bg); color: var(--erro); }
.ec .peca-corpo { padding: .2rem .8rem .8rem; border-top: 1px solid var(--borda); }
.ec .campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .6rem; margin: .6rem 0; }
.ec .campos .campo > span { font-size: .75rem; }
.ec table.var { width: 100%; border-collapse: collapse; font-size: .86rem; }
.ec table.var th { text-align: left; font-size: .7rem; letter-spacing: .05em; text-transform: uppercase; color: var(--mudo); padding: .25rem .4rem; }
.ec table.var td { padding: .2rem .4rem; border-top: 1px solid var(--borda); }
.ec table.var td.d, .ec table.var th.d { text-align: right; font-variant-numeric: tabular-nums; }
.ec table.var input { padding: .3rem .45rem; width: 100%; }
.ec .reg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; margin: .3rem 0 .6rem; }
.ec .reg button { text-align: left; padding: .5rem .7rem; border-radius: 10px; }
.ec .reg button.sel { border-color: var(--marca); background: var(--marca-suave); }
.ec .reg strong { display: block; font-variant-numeric: tabular-nums; }
.ec .lin { display: flex; justify-content: space-between; gap: .8rem; padding: .22rem 0; align-items: center; }
.ec .dif { display: flex; justify-content: space-between; padding: .55rem .8rem; border-radius: 10px; font-weight: 700; margin-top: .5rem; }
.ec .dif.ok { background: rgba(92,201,138,.16); color: var(--ok); } .ec .dif.x { background: var(--erro-bg); color: var(--erro); }
.ec .lista-chk { list-style: none; padding: 0; margin: 0 0 .7rem; display: grid; gap: .3rem; }
.ec .lista-chk li { display: flex; gap: .5rem; align-items: baseline; }
.ec .lista-chk .b { font-weight: 800; width: 1.1rem; } .ec .lista-chk .ok { color: var(--ok); } .ec .lista-chk .x { color: var(--erro); }
.ec .par { display: grid; grid-template-columns: 2.2rem 135px 120px minmax(200px, 1.4fr) minmax(200px, 1.4fr) minmax(110px, .7fr) 2.2rem; gap: .4rem; align-items: center; margin: 0 0 .3rem; }
.ec .par.cab { font-size: .7rem; letter-spacing: .05em; text-transform: uppercase; color: var(--mudo); font-weight: 700; }
.ec .par input, .ec .par select { padding: .35rem .5rem; }
.ec .rolar { overflow-x: auto; }
.ec .rolar > div { min-width: 920px; }
.ec .sec-peca { margin: .8rem 0 0; }
.ec .sec-peca > h3 { font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; color: var(--mudo); margin: 0 0 .45rem; font-weight: 700; }
.ec .g6 { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .7rem .8rem; align-items: start; }
.ec .g6 > .s2 { grid-column: span 2; } .ec .g6 > .s3 { grid-column: span 3; } .ec .g6 > .s4 { grid-column: span 4; }
@media (max-width: 900px) { .ec .g6 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ec .g6 > .s2, .ec .g6 > .s3, .ec .g6 > .s4 { grid-column: span 2; } }
.ec .campos { align-items: start; }
.ec .painel-topo { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; cursor: pointer; }
.ec .painel-t { font-size: 1.02rem; }
.ec .painel-r { color: var(--mudo); font-size: .86rem; flex: 1 1 260px; min-width: 0; }
.ec .painel-corpo { margin-top: .7rem; padding-top: .6rem; border-top: 1px solid var(--borda); }
.ec .painel-corpo[hidden] { display: none; }
.ec .rastro { color: var(--mudo); font-size: .82rem; margin: .5rem 0 0; }
`

const nOuNull = (v: string) => { const n = Number(v.replace(',', '.')); return v.trim() === '' || Number.isNaN(n) ? null : n }
const dh = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const ESTADO: Record<string, string> = { importada: 'Importada', em_edicao: 'Em edição', confirmada: 'Confirmada', cancelada: 'Cancelada' }

export default function EntradaCompra({ ctx }: { ctx: Contexto }) {
  const [aberta, setAberta] = useState<string | null>(null)
  const pode = (ctx.papeis.includes('admin') || ctx.papeis.includes('gestor') || ctx.papeis.includes('superadmin') || ctx.veRentabilidade)
    && (ctx.perm === null || ctx.perm['entrada_compra'] === 'editar')
  return (
    <section className="ec">
      <style>{CSS}</style>
      {aberta ? <Entrada ctx={ctx} id={aberta} pode={pode} onVoltar={() => setAberta(null)} /> : <Lista ctx={ctx} pode={pode} onAbrir={setAberta} />}
    </section>
  )
}

/* ───────────── Lista e importação ───────────── */

function Lista({ ctx, pode, onAbrir }: { ctx: Contexto; pode: boolean; onAbrir: (id: string) => void }) {
  const lista = useCarregar(() => apiCompra.listar(ctx.empresa), [ctx.empresa])
  const [nota, setNota] = useState<NotaLida | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const colunas = useMemo<Coluna<EntradaResumo>[]>(() => [
    { id: 'nota', titulo: 'Nota', texto: (l) => `${l.numero ?? 's/n'} / ${l.serie ?? '-'}` },
    { id: 'forn', titulo: 'Fornecedor', texto: (l) => l.fornecedor },
    { id: 'emissao', titulo: 'Emissão', texto: (l) => dataBr(l.emitida_em), valor: (l) => l.emitida_em },
    { id: 'valor', titulo: 'Valor', texto: (l) => brl(l.v_nf), valor: (l) => l.v_nf, direita: true },
    { id: 'pecas', titulo: 'Peças liberadas', texto: (l) => `${l.liberadas}/${l.pecas}`, valor: (l) => l.liberadas, direita: true, somar: false },
    { id: 'status', titulo: 'Situação', texto: (l) => ESTADO[l.status] ?? l.status },
  ], [])

  async function escolher(f: File | undefined) {
    if (!f) return
    setErro(null)
    try { setNota(await lerNfe(await f.text())) } catch (e) { setErro((e as Error).message) }
  }
  return (
    <>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Importe o XML da NF-e de compra, confira o cadastro das peças, o rateio do custo e o financeiro. Ao confirmar, as peças e o estoque nascem no CRM. Nada é enviado ao Bling.</>}>Entrada de mercadoria (NF-e)</Titulo>
          <p className="sub">Um XML por nota. A mesma nota não entra duas vezes.</p>
        </div>
        {pode && <>
          <input ref={arquivo} type="file" accept=".xml,text/xml" hidden onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" onClick={() => arquivo.current?.click()}>Importar XML</button>
        </>}
      </div>
      {erro && <div className="erro" role="alert">{erro}</div>}
      {lista.erro && <div className="erro">{lista.erro}</div>}
      {lista.dados && <GradeDados id="entrada_compra" titulo="Entradas de mercadoria" colunas={colunas} linhas={lista.dados} chave={(l) => l.id} aoClicar={(l) => onAbrir(l.id)} vazio="Nenhuma nota importada ainda." />}
      {nota && <ConferirNota ctx={ctx} nota={nota} onFechar={() => setNota(null)} onImportada={(id) => { setNota(null); onAbrir(id) }} />}
    </>
  )
}

function ConferirNota({ ctx, nota, onFechar, onImportada }: { ctx: Contexto; nota: NotaLida; onFechar: () => void; onImportada: (id: string) => void }) {
  const d = nota.dados
  const achado = useCarregar(() => nota.fornecedorCnpj ? apiCompra.acharFornecedor(ctx.empresa, nota.fornecedorCnpj) : Promise.resolve({ parceiro_id: null, nome: null }), [nota])
  const [cadastrar, setCadastrar] = useState(true)
  const [nome, setNome] = useState(d.fornecedor_nome)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const unidades = d.itens.reduce((s, i) => s + i.qtd, 0)
  async function importar() {
    setEnviando(true); setErro(null)
    try {
      let forn = achado.dados?.parceiro_id ?? null
      if (!forn && cadastrar && nota.fornecedorCnpj) forn = await apiCompra.criarFornecedor(ctx.empresa, nota.fornecedorCnpj, nome)
      const id = await apiCompra.importar(ctx.empresa, { ...d, fornecedor_parceiro_id: forn })
      await apiCompra.sugerirCadastro(ctx.empresa, id)
      await apiCompra.financeiroSugerir(ctx.empresa, id)
      onImportada(id)
    } catch (e) { setErro((e as Error).message); setEnviando(false) }
  }
  return (
    <Modal titulo={`Conferir a NF ${d.numero}`} onFechar={onFechar} larga>
      <div className="grade-cab">
        <div className="campo-nota"><span>Fornecedor</span><strong>{d.fornecedor_nome}</strong></div>
        <div className="campo-nota"><span>Emissão</span><strong>{dataBr(d.emitida_em)}</strong></div>
        <div className="campo-nota"><span>Valor da nota</span><strong>{brl(d.totais.v_nf)}</strong></div>
        <div className="campo-nota"><span>Itens</span><strong>{d.itens.length} linhas · {unidades} unidades</strong></div>
        <div className="campo-nota"><span>Parcelas no XML</span><strong>{d.parcelas.length || 'nenhuma'}</strong></div>
      </div>
      {nota.avisos.map((a) => <div key={a} className="aviso a" style={{ marginTop: '.6rem' }}>{a}</div>)}
      <div className="cx" style={{ marginTop: '.8rem' }}>
        <h2>Fornecedor no cadastro</h2>
        {achado.carregando && <p className="sub">Procurando pelo CNPJ…</p>}
        {achado.erro && <div className="erro">{achado.erro}</div>}
        {achado.dados?.parceiro_id && <p>Já cadastrado como <strong>{achado.dados.nome}</strong>. A nota fica vinculada a ele.</p>}
        {achado.dados && !achado.dados.parceiro_id && (
          <div className="form">
            <p className="sub">Este CNPJ ainda não está no cadastro de parceiros.</p>
            <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={cadastrar} onChange={(e) => setCadastrar(e.target.checked)} />Cadastrar o fornecedor agora, com os dados da nota</label>
            {cadastrar && <Campo rotulo="Nome do fornecedor"><input value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>}
          </div>)}
      </div>
      {erro && <div className="erro" role="alert">{erro}</div>}
      <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button>
        <button type="button" disabled={enviando || achado.carregando || (cadastrar && !achado.dados?.parceiro_id && !nome.trim())} onClick={() => void importar()}>{enviando ? 'Importando…' : 'Importar nota'}</button></div>
    </Modal>
  )
}

/* ───────────── Entrada (detalhe) ───────────── */

const REGIME: Record<string, string> = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' }

/** Painel recolhível: vem recolhido e mostra só o resumo. O conteúdo continua montado para não perder o que foi digitado. */
function Painel({ id, titulo, status, resumo, children, inicialAberto = false }: { id?: string; titulo: string; status?: ReactNode; resumo?: ReactNode; children: ReactNode; inicialAberto?: boolean }) {
  const [aberto, setAberto] = useState(inicialAberto)
  useEffect(() => {
    if (!id) return
    const h = (ev: Event) => { if ((ev as CustomEvent<string>).detail === id) { setAberto(true); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) } }
    window.addEventListener('abrir-painel', h)
    return () => window.removeEventListener('abrir-painel', h)
  }, [id])
  return (
    <div className="cx" id={id}>
      <div className="painel-topo" role="button" tabIndex={0} aria-expanded={aberto} onClick={() => setAberto(!aberto)}
           onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setAberto(!aberto) } }}>
        <span className="seta">{aberto ? '▾' : '▸'}</span><strong className="painel-t">{titulo}</strong>{status}
        {!aberto && resumo && <span className="painel-r">{resumo}</span>}
      </div>
      <div className="painel-corpo" hidden={!aberto}>{children}</div>
    </div>
  )
}

function Entrada({ ctx, id, pode, onVoltar }: { ctx: Contexto; id: string; pode: boolean; onVoltar: () => void }) {
  const det = useCarregar(() => apiCompra.obter(ctx.empresa, id), [ctx.empresa, id])
  const grupos = useCarregar(() => apiGrupos.grupos(ctx.empresa), [ctx.empresa])
  const caract = useCarregar(() => apiGrupos.caracteristicas(ctx.empresa), [ctx.empresa])
  const naturezas = useCarregar(() => apiFinanceiro.naturezas(ctx.empresa), [ctx.empresa])
  const centros = useCarregar(() => apiFinanceiro.centros(ctx.empresa), [ctx.empresa])
  const locais = useCarregar(() => api.locais(ctx.empresa), [ctx.empresa])
  const marcas = useMarcas(ctx.empresa)
  const { tipos } = useTiposGrade(ctx.empresa)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const d = det.dados
  const editavel = pode && d?.entrada.status === 'em_edicao'

  async function acao(fn: () => Promise<unknown>, ok?: string) {
    setErro(null); setMsg(null)
    try { await fn(); if (ok) setMsg(ok); det.recarregar() } catch (e) { setErro((e as Error).message); det.recarregar() }
  }
  if (!d) return <>{det.erro ? <div className="erro">{det.erro}</div> : <p className="sub">Carregando…</p>}<button className="sec" onClick={onVoltar}>Voltar</button></>
  const e = d.entrada
  const freteAviso = e.mod_frete === 1 && e.v_frete === 0 && !d.rubricas.some((r) => /frete/i.test(r.descricao))
  const descontoPorItem = e.v_desc > 0 && d.itens.some((i) => i.v_desc > 0)
  const genericos = d.itens.filter((i) => i.classe === 'generica' && d.pecas.filter((p) => p.item_id === i.id).length <= 1 && !d.pecas.find((p) => p.item_id === i.id)?.tamanho)

  return (
    <>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Confira cada peça (grupo, marca, características e grade), o rateio do custo e o financeiro. A confirmação só libera quando tudo estiver revisado e a nota fechar em R$ 0,00. O estoque nasce no CRM, não no Bling.</>}>Entrada de mercadoria (NF-e)</Titulo>
          <p className="sub">NF {e.numero ?? 's/n'} · série {e.serie ?? '-'} · {e.fornecedor_nome} · emitida em {dataBr(e.emitida_em)} · <strong>{ESTADO[e.status]}</strong></p>
        </div>
        <div className="barra">
          <button className="sec" onClick={onVoltar}>Voltar à lista</button>
          {editavel && <button className="sec" onClick={() => void acao(async () => { const r = await apiCompra.sugerirCadastro(ctx.empresa, id); setMsg(`Sugestão aplicada em ${r.linhas_atualizadas} linha(s). Só campos vazios foram preenchidos.`) })}>Sugerir cadastro</button>}
          {editavel && <button className="sec" onClick={() => { if (window.confirm('Cancelar esta entrada? Nada foi criado no estoque.')) void acao(async () => { await apiCompra.cancelar(ctx.empresa, id); onVoltar() }) }}>Cancelar entrada</button>}
        </div>
      </div>
      {msg && <div className="aviso i">{msg}</div>}
      {erro && <div className="erro" role="alert">{erro}</div>}
      {e.status === 'confirmada' && <div className="aviso i">Entrada confirmada: as peças e o estoque já foram criados no CRM. Esta tela agora é só consulta.</div>}

      <Painel titulo="Resumo da nota e custos"
        resumo={<>Nota {brl(e.v_nf)} · custo gerencial {brl(d.resumo.custo_gerencial)} · {REGIME[e.regime_sim]} · {d.resumo.liberadas} de {d.resumo.linhas} peças liberadas · <span className={e.diferenca === 0 ? 'st ok' : 'st cad'}>diferença {brl(e.diferenca)}</span></>}>
        <div className="grade-cab">
          <div className="campo-nota"><span>Fornecedor</span><strong>{e.fornecedor_nome}</strong></div>
          <div className="campo-nota"><span>Chave de acesso</span><strong>…{e.chave_acesso.slice(-12)}</strong></div>
          <div className="campo-nota"><span>Transporte</span><strong>{e.transportadora_nome ?? '—'}{e.mod_frete === 1 ? ' · frete do destinatário' : ''}</strong></div>
          <div className="campo-nota"><span>Produtos</span><strong>{brl(e.v_prod)}</strong></div>
          <div className="campo-nota"><span>Desconto</span><strong>{brl(e.v_desc)}</strong></div>
          <div className="campo-nota"><span>Valor da nota</span><strong>{brl(e.v_nf)}</strong></div>
          <div className="campo-nota"><span>Itens → peças</span><strong>{d.itens.length} linhas → {new Set(d.pecas.map((p) => p.modelo_chave)).size} peças · {d.resumo.unidades} un.</strong></div>
          <div className="campo-nota"><span>Custo-base (soma das peças)</span><strong>{brl(d.resumo.base_custo)}</strong></div>
          <div className="campo-nota"><span>Crédito de tributos ({REGIME[e.regime_sim]})</span><strong>{brl(d.resumo.credito)}</strong></div>
          <div className="campo-nota"><span>Custo contábil</span><strong>{brl(d.resumo.custo_contabil)}</strong></div>
          <div className="campo-nota"><span>Custo gerencial</span><strong>{brl(d.resumo.custo_gerencial)}</strong></div>
          <div className="campo-nota"><span>Diferença para a nota</span><strong>{brl(e.diferenca)}</strong></div>
        </div>
        <p className="rastro">Criada em {dh(e.criado_em)} por {d.quem?.criado_por ?? '—'} · última alteração em {dh(e.atualizado_em)} por {d.quem?.atualizado_por ?? '—'}{e.confirmada_em ? ` · confirmada em ${dh(e.confirmada_em)} por ${d.quem?.confirmada_por ?? '—'}` : ''}.</p>
      </Painel>

      {e.status === 'confirmada' && <EtiquetasEntrada ctx={ctx} d={d} />}

      {freteAviso && <div className="aviso a"><strong>Frete por sua conta.</strong> A nota não traz frete e ele é do destinatário. Informe o valor pago à transportadora na seção “Rateio e custo” para entrar no custo.</div>}
      {descontoPorItem && <div className="aviso i"><strong>Desconto já veio por item.</strong> Ele não é rateado de novo: o custo de cada peça é o valor da linha menos o desconto dela.</div>}

      {!d.fornecedor_ok && <FornecedorCard ctx={ctx} d={d} editavel={editavel} onMudou={det.recarregar} />}

      {genericos.length > 0 && <Genericos ctx={ctx} itens={genericos} editavel={editavel} onMudou={det.recarregar} />}

      <Pecas ctx={ctx} d={d} editavel={editavel} grupos={grupos.dados ?? []} caract={caract.dados ?? []} tipos={tipos ?? []} marcas={marcas.dados ?? []} acao={acao} />

      <Rateio ctx={ctx} d={d} editavel={editavel} acao={acao} />

      <Financeiro ctx={ctx} d={d} editavel={editavel} naturezas={naturezas.dados ?? []} centros={centros.dados ?? []} acao={acao} />

      <Confirmar ctx={ctx} d={d} editavel={editavel} locais={locais.dados ?? []} onConfirmada={(r) => { setMsg(`Entrada confirmada: ${r.pecas_criadas ?? 0} peça(s) criada(s) e ${r.unidades} unidade(s) em estoque.`); det.recarregar() }} onErro={setErro} />
    </>
  )
}

/* ───────────── Fornecedor ───────────── */

function FornecedorCard({ ctx, d, editavel, onMudou }: { ctx: Contexto; d: EntradaDetalhe; editavel: boolean; onMudou: () => void }) {
  const [cnpj, setCnpj] = useState('')
  const [nome, setNome] = useState(d.entrada.fornecedor_nome)
  const [erro, setErro] = useState<string | null>(null)
  const [achado, setAchado] = useState<{ parceiro_id: string | null; nome: string | null } | null>(null)
  async function procurar() {
    setErro(null)
    try { setAchado(await apiCompra.acharFornecedor(ctx.empresa, cnpj)) } catch (e) { setErro((e as Error).message) }
  }
  async function vincular(cadastrar: boolean) {
    setErro(null)
    try {
      const pid = cadastrar ? await apiCompra.criarFornecedor(ctx.empresa, cnpj, nome) : achado?.parceiro_id
      if (pid) { await apiCompra.definirFornecedor(ctx.empresa, d.entrada.id, pid); onMudou() }
    } catch (e) { setErro((e as Error).message) }
  }
  return (
    <Painel titulo="Fornecedor" status={<span className="st cad">não vinculado ao cadastro</span>} resumo="Informe o CNPJ para vincular ou cadastrar o fornecedor">
      <p className="sub">Informe o CNPJ do emitente para achar o fornecedor ou cadastrá-lo. O CNPJ completo não fica guardado na nota.</p>
      {editavel && (
        <div className="campos">
          <Campo rotulo="CNPJ do fornecedor"><input value={cnpj} onChange={(e) => { setCnpj(e.target.value); setAchado(null) }} placeholder="00.000.000/0000-00" /></Campo>
          <Campo rotulo="Nome (para o cadastro)"><input value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'end' }}>
            <button type="button" className="sec" disabled={!cnpj.trim()} onClick={() => void procurar()}>Procurar</button>
            {achado?.parceiro_id && <button type="button" onClick={() => void vincular(false)}>Usar {achado.nome}</button>}
            {achado && !achado.parceiro_id && <button type="button" onClick={() => void vincular(true)}>Cadastrar fornecedor</button>}
          </div>
        </div>)}
      {erro && <div className="erro" role="alert">{erro}</div>}
    </Painel>
  )
}

/* ───────────── Itens genéricos (desmembrar) ───────────── */

function Genericos({ ctx, itens, editavel, onMudou }: { ctx: Contexto; itens: EntradaDetalhe['itens']; editavel: boolean; onMudou: () => void }) {
  const [item, setItem] = useState<EntradaDetalhe['itens'][number] | null>(null)
  return (
    <Painel titulo="Itens sem tamanho" status={<span className="st pend">{itens.length} para desmembrar</span>} resumo={`${itens.length} linha(s) · ${itens.reduce((t, i) => t + i.qtd, 0)} un. · ${brl(itens.reduce((t, i) => t + i.v_prod, 0))}`}>
      <p className="sub">Estas linhas vieram sem tamanho identificável. Desmembre em peças: a soma dos valores tem de fechar com o valor da linha.</p>
      {itens.map((i) => (
        <div key={i.id} className="lin"><span>{i.descricao} · {i.qtd} un. · {brl(i.v_prod)}</span>{editavel && <button className="sec" onClick={() => setItem(i)}>Desmembrar</button>}</div>))}
      {item && <Desmembrar ctx={ctx} item={item} onFechar={() => setItem(null)} onFeito={() => { setItem(null); onMudou() }} />}
    </Painel>
  )
}

function Desmembrar({ ctx, item, onFechar, onFeito }: { ctx: Contexto; item: EntradaDetalhe['itens'][number]; onFechar: () => void; onFeito: () => void }) {
  const [partes, setPartes] = useState(() => Array.from({ length: item.qtd }, () => ({ nome: '', tamanho: '' })))
  return (
    <Modal titulo={`Desmembrar: ${item.descricao}`} onFechar={onFechar} larga>
      <div className="form">
        <p className="sub">{item.qtd} unidade(s), {brl(item.v_prod)}. O valor é dividido por igual entre as peças.</p>
        {partes.map((p, i) => (
          <div key={i} className="campos">
            <Campo rotulo={`Peça ${i + 1}: nome`}><input value={p.nome} onChange={(e) => setPartes(partes.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} /></Campo>
            <Campo rotulo="Tamanho"><input value={p.tamanho} onChange={(e) => setPartes(partes.map((x, j) => j === i ? { ...x, tamanho: e.target.value } : x))} /></Campo>
          </div>))}
        <div className="acoes"><button type="button" className="sec" onClick={onFechar}>Cancelar</button>
          <button type="button" onClick={() => void apiCompra.desmembrar(ctx.empresa, item.id, partes.map((p) => ({ qtd: 1, nome: p.nome || undefined, tamanho: p.tamanho || undefined }))).then(onFeito).catch((e: Error) => alert(e.message))}>Desmembrar</button></div>
      </div>
    </Modal>
  )
}

/* ───────────── Peças ───────────── */

type Acao = (fn: () => Promise<unknown>, ok?: string) => Promise<void>

function Pecas({ ctx, d, editavel, grupos, caract, tipos, marcas, acao }: {
  ctx: Contexto; d: EntradaDetalhe; editavel: boolean; grupos: GrupoProduto[]; caract: Caracteristica[]; tipos: TipoGrade[]; marcas: OpcaoCadastro[]; acao: Acao
}) {
  const modelos = useMemo(() => {
    const m = new Map<string, EntradaPeca[]>()
    for (const p of d.pecas) m.set(p.modelo_chave, [...(m.get(p.modelo_chave) ?? []), p])
    return Array.from(m.values())
  }, [d.pecas])
  const [abertas, setAbertas] = useState<Set<string>>(new Set())   // por padrão cada peça vem recolhida
  const alternar = (k: string) => setAbertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const analiticos = useMemo(() => grupos.filter((g) => g.analitico && g.ativo).sort((a, b) => a.caminho_nome.localeCompare(b.caminho_nome, 'pt-BR')), [grupos])
  const liberadas = modelos.filter((l) => l.every((p) => p.liberada)).length
  return (
    <Painel titulo="Peças a cadastrar" status={<span className={liberadas === modelos.length ? 'st ok' : 'st pend'}>{liberadas} de {modelos.length} revisadas e liberadas</span>}
      resumo={`${modelos.length} peça(s) · ${d.resumo.unidades} un. · custo gerencial ${brl(d.resumo.custo_gerencial)}`}>
      <div className="barra">
        <button className="sec" onClick={() => setAbertas(new Set(modelos.map((l) => l[0].modelo_chave)))}>Expandir tudo</button>
        <button className="sec" onClick={() => setAbertas(new Set())}>Recolher tudo</button>
        {editavel && <button className="fim" onClick={() => void acao(async () => { await apiCompra.liberarPecas(ctx.empresa, d.entrada.id, true) }, 'Peças com cadastro completo foram liberadas. As incompletas continuam pendentes.')}>Liberar todas as prontas</button>}
        {editavel && <button className="sec" onClick={() => void acao(() => apiCompra.liberarPecas(ctx.empresa, d.entrada.id, false))}>Desfazer liberações</button>}
      </div>
      <MargemPreco ctx={ctx} d={d} editavel={editavel} acao={acao} />
      <p className="sub" style={{ marginBottom: '.6rem' }}>Libere a peça depois de conferir o cadastro e o custo. Qualquer alteração na peça ou no rateio tira a liberação e pede nova revisão.</p>
      {modelos.map((linhas) => {
        const k = linhas[0].modelo_chave
        return <Peca key={k} ctx={ctx} linhas={linhas} aberta={abertas.has(k)} onAlternar={() => alternar(k)} editavel={editavel} grupos={analiticos} caract={caract} tipos={tipos} marcas={marcas} acao={acao} />
      })}
    </Painel>
  )
}

function MargemPreco({ ctx, d, editavel, acao }: { ctx: Contexto; d: EntradaDetalhe; editavel: boolean; acao: Acao }) {
  const e = d.entrada
  const cfg = d.preco_cfg
  const disponivel = cfg !== undefined   // some até a migration 0076 ser aplicada
  const padrao = cfg?.margem_padrao ?? 50
  const atual = e.margem_pct ?? padrao
  const [txt, setTxt] = useState(String(atual).replace('.', ','))
  const [limpar, setLimpar] = useState(false)
  useEffect(() => { setTxt(String(e.margem_pct ?? padrao).replace('.', ',')) }, [e.margem_pct, padrao])
  const novo = nOuNull(txt)
  const invalido = novo == null || novo < 0 || novo >= 90
  const manuais = d.pecas.filter((p) => p.preco_final != null).length
  const mudou = novo != null && novo !== atual
  const aplicar = () => acao(() => apiCompra.ajustar(ctx.empresa, e.id, { margem_pct: novo === padrao ? null : novo, limpar_precos: limpar }),
    `Preços recalculados com margem de ${String(novo).replace('.', ',')}%.${limpar ? ' Os preços ajustados à mão foram refeitos e as peças pedem nova liberação.' : manuais ? ' Os preços que você ajustou à mão foram mantidos.' : ''}`)
  return (
    <div className="aviso i" style={{ display: 'grid', gap: '.5rem', margin: '0 0 .7rem' }}>
      <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <Campo rotulo="Margem sugerida (%)" dica={`Padrão da empresa: ${String(padrao).replace('.', ',')}%${e.margem_pct != null ? ' · esta entrada usa outra margem' : ''}`}>
          <input style={{ width: 110, textAlign: 'right' }} inputMode="decimal" value={txt} disabled={!editavel || !disponivel} aria-label="Margem sugerida" onChange={(x) => setTxt(x.target.value)} />
        </Campo>
        <button type="button" disabled={!editavel || !disponivel || invalido || (!mudou && !limpar)} onClick={() => void aplicar()}>Recalcular preços</button>
        {e.margem_pct != null && <button type="button" className="sec" disabled={!editavel} onClick={() => void acao(() => apiCompra.ajustar(ctx.empresa, e.id, { margem_pct: null }), `Margem voltou ao padrão (${String(padrao).replace('.', ',')}%).`)}>Voltar ao padrão</button>}
        {manuais > 0 && <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: '.86rem' }}><input type="checkbox" checked={limpar} disabled={!editavel} onChange={(x) => setLimpar(x.target.checked)} /> Refazer também os {manuais} preço(s) que ajustei à mão</label>}
      </div>
      <span className="mini" style={{ color: 'var(--mudo)' }}>
        {disponivel ? <>Preço sugerido = custo gerencial ÷ (1 − (margem + imposto {String(cfg?.imposto ?? 0).replace('.', ',')}% + taxa {String(cfg?.taxa ?? 0).replace('.', ',')}%)){cfg?.final != null ? `, arredondado para terminar em ,${String(Math.round(cfg.final * 100)).padStart(2, '0')}` : ''}. {invalido && txt.trim() !== '' ? 'Informe uma margem entre 0 e 89,99.' : ''}</> : 'Disponível depois que a migration 0076 for aplicada no banco.'}
      </span>
    </div>
  )
}

const ETQ: Record<string, string> = { pendente: 'Pendente', impressa: 'Impressa', desatualizada: 'Desatualizada', encerrada: 'Encerrada' }

function EtiquetasEntrada({ ctx, d }: { ctx: Contexto; d: EntradaDetalhe }) {
  const un = useCarregar(() => apiCompra.unidades(ctx.empresa, d.entrada.id), [ctx.empresa, d.entrada.id])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [imprimir, setImprimir] = useState<string[] | null>(null)
  const [hist, setHist] = useState<UnidadeEntrada | null>(null)
  const e = d.entrada
  const lista = un.dados ?? []
  const pendentes = lista.filter((u) => u.etiqueta_estado === 'pendente' || u.etiqueta_estado === 'desatualizada')
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <Painel titulo="Etiquetas e rastreabilidade" inicialAberto
      status={<span className={pendentes.length ? 'st pend' : 'st ok'}>{pendentes.length ? `${pendentes.length} etiqueta(s) para imprimir` : 'todas impressas'}</span>}
      resumo={`${lista.length} unidade(s) · ${pendentes.length} pendente(s)`}>
      <p className="sub">Cada unidade tem um código único e um número curto, impressos na etiqueta. Esse código acompanha a peça na logística e na venda e leva de volta a esta nota (NF {e.numero ?? 's/n'}, {e.fornecedor_nome}, chave …{e.chave_acesso.slice(-8)}) e ao custo da entrada.</p>
      {un.erro && <div className="erro" role="alert">{un.erro}</div>}
      <div className="barra">
        <button disabled={pendentes.length === 0} onClick={() => setImprimir(pendentes.map((u) => u.unidade_id))}>Imprimir pendentes ({pendentes.length})</button>
        <button className="sec" disabled={sel.size === 0} onClick={() => setImprimir(Array.from(sel))}>Imprimir selecionadas ({sel.size})</button>
        <button className="sec" disabled={lista.length === 0} onClick={() => setSel(new Set(lista.map((u) => u.unidade_id)))}>Marcar todas</button>
        <button className="sec" disabled={sel.size === 0} onClick={() => setSel(new Set())}>Limpar seleção</button>
      </div>
      {un.dados && lista.length === 0 && <p className="sub">Nenhuma unidade vinculada a esta entrada.</p>}
      {lista.length > 0 && (
        <div className="tabela-rolavel"><table>
          <thead><tr><th></th><th>Nº curto</th><th>Código da unidade</th><th>Peça</th><th>Tam.</th><th className="d">Preço</th><th className="d">Custo</th><th>Local</th><th>Etiqueta</th><th></th></tr></thead>
          <tbody>{lista.map((u) => (
            <tr key={u.unidade_id}>
              <td><input type="checkbox" aria-label={`Selecionar ${u.codigo}`} checked={sel.has(u.unidade_id)} onChange={() => alternar(u.unidade_id)} /></td>
              <td><strong>{u.numero_curto ?? '—'}</strong></td>
              <td><code>{u.codigo}</code></td>
              <td>{u.peca_nome}<div className="mudo">{u.peca_codigo}</div></td>
              <td>{u.tamanho ?? '—'}</td>
              <td className="d">{u.preco == null ? '—' : brl(u.preco)}</td>
              <td className="d">{u.custo == null ? '—' : brl(u.custo)}</td>
              <td>{u.local ?? '—'}</td>
              <td>{u.etiqueta_estado ? ETQ[u.etiqueta_estado] : '—'}{u.qtd_impressoes > 0 ? ` · ${u.qtd_impressoes}×` : ''}{u.ultima_impressao_em ? <div className="mudo">{dh(u.ultima_impressao_em)}</div> : null}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="sec" onClick={() => setImprimir([u.unidade_id])}>{u.qtd_impressoes > 0 ? 'Reimprimir' : 'Imprimir'}</button>{' '}
                {u.qtd_impressoes > 0 && <button className="sec" onClick={() => setHist(u)}>Histórico</button>}
              </td>
            </tr>))}</tbody>
        </table></div>)}
      {imprimir && <ModalImprimir ctx={ctx} unidades={imprimir} onFechar={() => setImprimir(null)} onConcluido={() => { setImprimir(null); setSel(new Set()); un.recarregar() }} />}
      {hist && <ModalHistorico ctx={ctx} etiqueta={{ unidade_id: hist.unidade_id, unidade_codigo: hist.codigo }} onFechar={() => setHist(null)} />}
    </Painel>
  )
}

function Peca({ ctx, linhas, aberta, onAlternar, editavel, grupos, caract, tipos, marcas, acao }: {
  ctx: Contexto; linhas: EntradaPeca[]; aberta: boolean; onAlternar: () => void; editavel: boolean
  grupos: GrupoProduto[]; caract: Caracteristica[]; tipos: TipoGrade[]; marcas: OpcaoCadastro[]; acao: Acao
}) {
  const p = linhas[0]
  const lib = linhas.every((l) => l.liberada)
  const faltas = linhas.map((l) => l.faltas).filter(Boolean).join('; ')
  const existente = !!p.peca_existente_id
  const qtd = linhas.reduce((s, l) => s + l.qtd, 0)
  const custo = linhas.reduce((s, l) => s + l.custo_gerencial, 0)
  const preco = linhas.map((l) => l.preco_final ?? l.preco_sugerido).filter((x): x is number => x != null)
  const tipo = tipos.find((t) => t.id === p.tipo_grade_id)
  const opcoesGrupo = useMemo<OpcaoCombo[]>(() => grupos.map((g) => ({ valor: g.id, rotulo: g.caminho_nome })), [grupos])
  const opcoesMarca = useMemo<OpcaoCombo[]>(() => marcas.map((m) => ({ valor: m.nome, rotulo: m.nome })), [marcas])
  const opcoesTipo = useMemo<OpcaoCombo[]>(() => tipos.map((t) => ({ valor: t.id, rotulo: t.nome, extra: t.descricao ?? '' })), [tipos])
  const opcoesTamanho = useMemo<OpcaoCombo[]>(() => (tipo?.valores ?? []).slice().sort((a, b) => a.ordem - b.ordem).map((v) => ({ valor: v.valor, rotulo: v.rotulo || v.valor })), [tipo])
  const codigosCaract = new Set(caract.filter((c) => c.ativo).map((c) => c.codigo))
  const defsTipo = (tipo?.atributos ?? []).filter((a) => a.nivel === 'peca' && a.codigo !== 'cor' && a.codigo !== 'descricao' && !codigosCaract.has(a.codigo))
  const salvarModelo = (dados: Record<string, unknown>) => acao(async () => { for (const l of linhas) await apiCompra.salvarPeca(ctx.empresa, l.id, dados) })
  const salvarLinha = (l: EntradaPeca, dados: Record<string, unknown>) => acao(() => apiCompra.salvarPeca(ctx.empresa, l.id, dados))
  const liberar = (v: boolean) => acao(async () => { for (const l of linhas) await apiCompra.salvarPeca(ctx.empresa, l.id, { revisada: v }) })
  const atributosSemChave = (c: string) => { const a = { ...(p.atributos ?? {}) }; delete a[c]; return a }
  const attr = (c: string, v: string) => salvarModelo({ atributos: v ? { ...(p.atributos ?? {}), [c]: v } : atributosSemChave(c) })

  return (
    <div className={lib ? 'peca lib' : 'peca'}>
      <div className="peca-topo" onClick={onAlternar} role="button" tabIndex={0} aria-expanded={aberta} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAlternar() } }}>
        <span className="seta">{aberta ? '▾' : '▸'}</span>
        <span className="nome">{p.nome ?? '(sem nome)'}{p.atributos?.cor ? ` · ${p.atributos.cor}` : ''}</span>
        <span className="mini">{linhas.length} tamanho(s) · {qtd} un. · custo {brl(custo / qtd)} un. · preço {preco.length ? brl(Math.min(...preco)) : '—'}</span>
        {existente && <span className="st pend">já cadastrada: entra como repetição</span>}
        {lib ? <span className="st ok">✓ Revisada e liberada</span> : faltas ? <span className="st cad" title={faltas}>Cadastro incompleto: {faltas}</span> : <span className="st pend">Rateada, falta liberar</span>}
      </div>
      {aberta && (
        <div className="peca-corpo">
          {!existente && (
            <div className="sec-peca"><h3>Identificação</h3>
            <div className="g6">
              <div className="s3">
              <Campo rotulo="Nome da peça"><input key={p.nome ?? ''} defaultValue={p.nome ?? ''} disabled={!editavel} onBlur={(e) => { if (e.target.value !== (p.nome ?? '')) void salvarModelo({ nome: e.target.value }) }} /></Campo>
              </div>
              <div className="s3">
              <Campo rotulo="Grupo de produto"><ComboBusca opcoes={opcoesGrupo} valor={p.grupo_id ?? ''} desabilitado={!editavel} placeholder="Digite para buscar o grupo…" ariaLabel="Grupo de produto" onEscolher={(v) => void salvarModelo({ grupo_id: v || null })} /></Campo>
              </div>
              <div className="s2">
              <Campo rotulo="Marca" dica={p.marca && !marcas.some((m) => m.nome.toLowerCase() === p.marca!.toLowerCase()) ? 'Marca nova: será cadastrada ao confirmar a entrada.' : undefined}>
                <ComboBusca livre opcoes={opcoesMarca} valor={p.marca ?? ''} desabilitado={!editavel} placeholder="Digite para buscar ou criar" ariaLabel="Marca da peça"
                  rotuloNovo={(t) => `Cadastrar nova marca “${t}”`} onEscolher={(v) => void salvarModelo({ marca: v })} /></Campo>
              </div>
              <div className="s2">
              <Campo rotulo="Condição">
                <select value={p.condicao ?? 'nova'} disabled={!editavel} onChange={(e) => void salvarModelo({ condicao: e.target.value })}><option value="nova">Nova</option><option value="usada">Usada</option></select>
              </Campo>
              </div>
              <div className="s2">
              <Campo rotulo="Cor"><input key={p.atributos?.cor ?? ''} defaultValue={p.atributos?.cor ?? ''} disabled={!editavel} onBlur={(e) => { if (e.target.value !== (p.atributos?.cor ?? '')) void attr('cor', e.target.value.trim()) }} /></Campo>
              </div>
            </div></div>)}
          <div className="sec-peca"><h3>Grade e tamanhos</h3>
          {!existente && (
            <div className="g6" style={{ marginBottom: '.6rem' }}>
              <div className="s2">
              <Campo rotulo="Tipo de grade"><ComboBusca opcoes={opcoesTipo} valor={p.tipo_grade_id ?? ''} desabilitado={!editavel} placeholder="Digite para buscar a grade…" ariaLabel="Tipo de grade" onEscolher={(v) => void salvarModelo({ tipo_grade_id: v || null })} /></Campo>
              </div>
              <p className="sub s4" style={{ margin: 0, alignSelf: 'center' }}>{tipo ? (tipo.descricao ?? `Tamanhos: ${opcoesTamanho.map((o) => o.rotulo).join(', ') || 'sem lista fixa'}`) : 'Escolha o tipo de grade para liberar os tamanhos.'}</p>
            </div>)}
          <table className="var">
            <thead><tr><th>Tamanho</th><th className="d">Qtd.</th><th className="d">Valor da linha</th><th className="d">Custo rateado un.</th><th className="d">Preço de venda</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td style={{ width: 150 }}><ComboBusca livre opcoes={opcoesTamanho} valor={l.tamanho ?? ''} desabilitado={!editavel} placeholder={tipo ? 'Escolha o tamanho' : 'Escolha a grade antes'} ariaLabel="Tamanho" onEscolher={(v) => { if (v.trim().toUpperCase() !== (l.tamanho ?? '')) void salvarLinha(l, { tamanho: v }) }} /></td>
                  <td className="d">{l.qtd}</td>
                  <td className="d">{brl(l.v_base)}</td>
                  <td className="d">{brl(l.custo_gerencial / l.qtd)}</td>
                  <td className="d" style={{ width: 150 }}><input key={String(l.preco_final ?? l.preco_sugerido ?? '')} defaultValue={(l.preco_final ?? l.preco_sugerido ?? '').toString().replace('.', ',')} disabled={!editavel} aria-label="Preço de venda" style={{ textAlign: 'right' }}
                    onBlur={(e) => { const n = nOuNull(e.target.value); if (n !== (l.preco_final ?? l.preco_sugerido)) void salvarLinha(l, { preco_final: n }) }} /></td>
                </tr>))}
            </tbody>
          </table>
          </div>
          {!existente && (
            <div className="sec-peca"><h3>Características</h3>
            <div className="campos">
              {caract.filter((c) => c.ativo).map((c) => (
                <Campo key={c.codigo} rotulo={c.rotulo}>
                  {c.tipo_dado === 'lista'
                    ? <ComboBusca opcoes={c.opcoes.map((o) => ({ valor: o, rotulo: o }))} valor={p.atributos?.[c.codigo] ?? ''} desabilitado={!editavel} placeholder="Digite para buscar…" ariaLabel={c.rotulo} onEscolher={(v) => void attr(c.codigo, v)} />
                    : <input key={p.atributos?.[c.codigo] ?? ''} defaultValue={p.atributos?.[c.codigo] ?? ''} disabled={!editavel} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.atributos?.[c.codigo] ?? '')) void attr(c.codigo, v) }} />}
                </Campo>))}
              {defsTipo.map((a) => (
                <Campo key={`g-${a.codigo}`} rotulo={a.unidade ? `${a.rotulo} (${a.unidade})` : a.rotulo}>
                  {a.tipo_dado === 'lista'
                    ? <ComboBusca opcoes={a.opcoes.map((o) => ({ valor: o, rotulo: o }))} valor={p.atributos?.[a.codigo] ?? ''} desabilitado={!editavel} placeholder="Digite para buscar…" ariaLabel={a.rotulo} onEscolher={(v) => void attr(a.codigo, v)} />
                    : <input key={p.atributos?.[a.codigo] ?? ''} defaultValue={p.atributos?.[a.codigo] ?? ''} disabled={!editavel} inputMode={a.tipo_dado === 'numero' ? 'decimal' : undefined} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.atributos?.[a.codigo] ?? '')) void attr(a.codigo, v) }} />}
                </Campo>))}
              <div style={{ gridColumn: '1 / -1' }}>
                <Campo rotulo="Descrição da peça (material, medidas, detalhes e defeitos)">
                  <textarea rows={2} key={p.atributos?.descricao ?? ''} defaultValue={p.atributos?.descricao ?? ''} disabled={!editavel} placeholder="Ex.: 100% algodão, forro em poliéster, pequena marca de uso na barra"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.atributos?.descricao ?? '')) void attr('descricao', v) }} />
                </Campo>
              </div>
            </div></div>)}
          {editavel && (
            <div className="barra" style={{ marginTop: '.6rem' }}>
              {lib ? <button className="sec" onClick={() => void liberar(false)}>Desfazer liberação</button>
                : <button disabled={!!faltas} title={faltas || undefined} onClick={() => void liberar(true)}>Revisei: liberar peça</button>}
              {faltas && <span className="mini" style={{ color: 'var(--mudo)' }}>Falta: {faltas}</span>}
            </div>)}
        </div>)}
    </div>
  )
}

/* ───────────── Rateio e custo ───────────── */

function Rateio({ ctx, d, editavel, acao }: { ctx: Contexto; d: EntradaDetalhe; editavel: boolean; acao: Acao }) {
  const sim = useCarregar(() => apiCompra.simular(ctx.empresa, d.entrada.id), [ctx.empresa, d.entrada.id, d.entrada.regime_sim, d.entrada.pct_custo_fixo, d.rubricas.length, d.resumo.custo_gerencial])
  const [desc, setDesc] = useState(''); const [valor, setValor] = useState(''); const [crit, setCrit] = useState('valor'); const [geraFin, setGeraFin] = useState(false)
  const e = d.entrada
  const fecha = e.diferenca === 0
  const NOME = REGIME
  return (
    <Painel titulo="Rateio e custo" resumo={`${NOME[e.regime_sim]} · custo gerencial ${brl(d.resumo.custo_gerencial)} · custo fixo ${String(e.pct_custo_fixo).replace('.', ',')}% · ${d.rubricas.length} rubrica(s) · diferença ${brl(e.diferenca)}`}>
      <div className="sub" style={{ marginBottom: '.3rem' }}>Regime (a escolha aqui é só simulação; confirmar a entrada grava o último regime usado como padrão)</div>
      <div className="reg">
        {(sim.dados ?? []).map((s: SimulacaoRegime) => (
          <button key={s.regime} type="button" className={s.regime === e.regime_sim ? 'sec sel' : 'sec'} disabled={!editavel} onClick={() => void acao(() => apiCompra.ajustar(ctx.empresa, e.id, { regime_sim: s.regime }))}>
            {NOME[s.regime]}<strong>{brl(s.custo_gerencial)}</strong><small className="mudo">crédito {brl(s.credito)}</small>
          </button>))}
      </div>
      <p className="sub">Os percentuais de crédito de cada regime estão em configuração e precisam ser validados com o contador antes de valerem.</p>
      <div className="lin"><span>% de custo fixo sobre o custo contábil</span>
        <input key={e.pct_custo_fixo} style={{ width: 90, textAlign: 'right' }} defaultValue={String(e.pct_custo_fixo).replace('.', ',')} disabled={!editavel}
          onBlur={(ev) => { const n = nOuNull(ev.target.value); if (n != null && n !== e.pct_custo_fixo) void acao(() => apiCompra.ajustar(ctx.empresa, e.id, { pct_custo_fixo: n })) }} /></div>
      <h2 style={{ marginTop: '.8rem' }}>Rubricas extras</h2>
      {d.rubricas.length === 0 && <p className="sub">Nenhuma. Use para frete fora da nota, chapa, taxa de entrega e outras despesas que entram no custo.</p>}
      {d.rubricas.map((r) => (
        <div key={r.id} className="lin"><span>{r.descricao} · {r.criterio} {r.gera_financeiro ? <span className="st ok">gera financeiro</span> : <span className="st">só custo</span>}</span>
          <span>{brl(r.valor)}{' '}
            {editavel && <label style={{ marginRight: '.4rem' }}><input type="checkbox" checked={!!r.gera_financeiro} onChange={(x) => void acao(() => apiCompra.rubricaFinanceiro(ctx.empresa, e.id, r.id, x.target.checked))} /> gera financeiro</label>}
            {r.gera_financeiro && <button type="button" className="sec" onClick={() => window.dispatchEvent(new CustomEvent('abrir-painel', { detail: 'painel-financeiro' }))}>Ir para o financeiro</button>}{' '}
            {editavel && <button className="sec" onClick={() => void acao(() => apiCompra.excluirRubrica(ctx.empresa, e.id, r.id))}>Remover</button>}</span></div>))}
      {editavel && (
        <div className="campos" style={{ alignItems: 'end' }}>
          <Campo rotulo="Descrição"><input value={desc} onChange={(x) => setDesc(x.target.value)} placeholder="Ex.: Frete Braspress" /></Campo>
          <Campo rotulo="Valor (R$)"><input value={valor} onChange={(x) => setValor(x.target.value)} inputMode="decimal" /></Campo>
          <Campo rotulo="Ratear por"><select value={crit} onChange={(x) => setCrit(x.target.value)}><option value="valor">Valor</option><option value="quantidade">Quantidade</option><option value="peso">Peso</option></select></Campo>
          <label style={{ alignSelf: 'center' }}><input type="checkbox" checked={geraFin} onChange={(x) => setGeraFin(x.target.checked)} /> Gera financeiro (contas a pagar)</label>
          <button type="button" disabled={!desc.trim() || nOuNull(valor) == null} onClick={() => void acao(async () => { const rid = await apiCompra.salvarRubrica(ctx.empresa, e.id, null, desc.trim(), nOuNull(valor) ?? 0, crit); if (geraFin) await apiCompra.rubricaFinanceiro(ctx.empresa, e.id, rid, true); setDesc(''); setValor(''); setGeraFin(false) })}>Adicionar rubrica</button>
        </div>)}
      <div className="lin"><span>Custo-base (soma das peças)</span><strong>{brl(d.resumo.base_custo)}</strong></div>
      <div className="lin"><span>Custo gerencial (é o que vale para a peça)</span><strong>{brl(d.resumo.custo_gerencial)}</strong></div>
      <div className={fecha ? 'dif ok' : 'dif x'}><span>Diferença para a nota</span><span>{brl(e.diferenca)}</span></div>
    </Painel>
  )
}

/* ───────────── Financeiro ───────────── */

function Financeiro({ ctx, d, editavel, naturezas, centros, acao }: { ctx: Contexto; d: EntradaDetalhe; editavel: boolean; naturezas: Natureza[]; centros: CentroResultado[]; acao: Acao }) {
  const e = d.entrada
  const nats = useMemo(() => naturezas.filter((n) => n.analitico && n.ativo && n.sinal === -1), [naturezas])
  const crs = useMemo(() => centros.filter((c) => c.analitico && c.ativo), [centros])
  const parcNota = useMemo(() => d.parcelas.filter((p) => !p.rubrica_id), [d.parcelas])
  const parcRub = useMemo(() => d.parcelas.filter((p) => p.rubrica_id), [d.parcelas])
  const [parc, setParc] = useState<Parcela[]>(parcNota)
  const [origem, setOrigem] = useState<'parcelas' | 'sem'>(e.fin_origem === 'sem_financeiro' ? 'sem' : 'parcelas')
  const [motivo, setMotivo] = useState(e.fin_motivo ?? '')
  const [negoc, setNegoc] = useState(e.fin_negociacao ?? '')
  useEffect(() => { setParc(parcNota); setOrigem(e.fin_origem === 'sem_financeiro' ? 'sem' : 'parcelas'); setMotivo(e.fin_motivo ?? ''); setNegoc(e.fin_negociacao ?? '') }, [parcNota, e.fin_origem, e.fin_motivo, e.fin_negociacao])
  const soma = parc.reduce((s, p) => s + (p.valor ?? 0), 0)
  const fecha = Math.abs(soma - e.v_nf) < 0.005
  const vindoDoXml = e.fin_origem === 'xml'
  const set = (i: number, c: Partial<Parcela>) => setParc(parc.map((p, j) => (j === i ? { ...p, ...c } : p)))
  const aplicar = (c: Partial<Parcela>) => setParc(parc.map((p) => ({ ...p, ...c })))
  const payload = (conferido: boolean) => origem === 'sem'
    ? { origem: 'sem_financeiro', motivo, negociacao: negoc, parcelas: [], conferido }
    : { origem: e.fin_origem === 'xml' ? 'xml' : 'manual', negociacao: negoc, natureza_id: e.fin_natureza_id, cr_id: e.fin_cr_id, conferido,
        parcelas: parc.map((p, i) => ({ seq: i + 1, vencimento: p.vencimento, valor: p.valor, natureza_id: p.natureza_id, cr_id: p.cr_id, forma: p.forma })) }
  const salvar = async (conferido: boolean) => {
    await acao(async () => { await apiCompra.financeiroSalvar(ctx.empresa, e.id, payload(false)); if (conferido) await apiCompra.financeiroSalvar(ctx.empresa, e.id, payload(true)) }, conferido ? 'Financeiro conferido.' : 'Financeiro salvo. Falta conferir.')
  }
  return (
    <Painel id="painel-financeiro" titulo="Financeiro da nota" status={e.fin_conferido ? <span className="st ok">✓ conferido</span> : <span className="st pend">falta conferir</span>}
      resumo={origem === 'sem' ? 'Sem pagamento a gerar' : `${parc.length} parcela(s) · soma ${brl(soma)} · ${fecha ? 'fecha com a nota' : `diferença ${brl(soma - e.v_nf)}`}`}>
      <div className="grade-cab">
        <div className="campo-nota"><span>Parceiro (fornecedor)</span><strong>{e.fornecedor_nome}</strong></div>
        <div className="campo-nota"><span>Documento</span><strong>NF {e.numero ?? 's/n'} / {e.serie ?? '-'} · …{e.chave_acesso.slice(-8)}</strong></div>
        <div className="campo-nota"><span>Valor a pagar</span><strong>{brl(e.v_nf)}</strong></div>
        <div className="campo-nota"><span>Origem dos dados</span><strong>{origem === 'sem' ? 'Sem pagamento a gerar' : vindoDoXml ? 'Parcelas do XML' : 'Informado aqui (o XML não trouxe parcelas)'}</strong></div>
      </div>
      <div className="barra" style={{ marginTop: '.7rem' }}>
        <button type="button" className={origem === 'parcelas' ? 'sec sel' : 'sec'} disabled={!editavel} onClick={() => setOrigem('parcelas')}>Gerar contas a pagar</button>
        <button type="button" className={origem === 'sem' ? 'sec sel' : 'sec'} disabled={!editavel} onClick={() => setOrigem('sem')}>Não há pagamento a gerar</button>
      </div>
      {origem === 'sem' ? (
        <Campo rotulo="Por que não há pagamento a gerar?" dica="Ex.: já pago à vista na emissão, bonificação, consignação. Fica registrado na entrada."><input value={motivo} disabled={!editavel} onChange={(x) => setMotivo(x.target.value)} /></Campo>
      ) : (
        <>
          <div className="campos">
            <Campo rotulo="Negociação"><input value={negoc} disabled={!editavel} onChange={(x) => setNegoc(x.target.value)} placeholder="À vista, 30/60/90…" /></Campo>
            <Campo rotulo="Natureza para todas as parcelas"><select disabled={!editavel} value="" onChange={(x) => x.target.value && aplicar({ natureza_id: x.target.value })}><option value="">Aplicar a todas…</option>{nats.map((n) => <option key={n.id} value={n.id}>{n.codigo} {n.nome}</option>)}</select></Campo>
            <Campo rotulo="Centro de resultado para todas"><select disabled={!editavel} value="" onChange={(x) => x.target.value && aplicar({ cr_id: x.target.value })}><option value="">Aplicar a todas…</option>{crs.map((c) => <option key={c.id} value={c.id}>{c.codigo} {c.caminho_nome}</option>)}</select></Campo>
          </div>
          <div className="rolar"><div>
            <div className="par cab"><span>Nº</span><span>Vencimento</span><span>Valor</span><span>Natureza</span><span>Centro de resultado</span><span>Forma</span><span /></div>
            {parc.map((p, i) => (
              <div key={p.id ?? i} className="par">
                <span>{i + 1}</span>
                <input type="date" aria-label="Vencimento" value={p.vencimento ?? ''} disabled={!editavel} onChange={(x) => set(i, { vencimento: x.target.value || null })} />
                <input aria-label="Valor" inputMode="decimal" style={{ textAlign: 'right' }} value={p.valor == null ? '' : String(p.valor).replace('.', ',')} disabled={!editavel} onChange={(x) => set(i, { valor: nOuNull(x.target.value) })} />
                <select aria-label="Natureza" value={p.natureza_id ?? ''} disabled={!editavel} onChange={(x) => set(i, { natureza_id: x.target.value || null })}><option value="">Escolha…</option>{nats.map((n) => <option key={n.id} value={n.id}>{n.codigo} {n.nome}</option>)}</select>
                <select aria-label="Centro de resultado" value={p.cr_id ?? ''} disabled={!editavel} onChange={(x) => set(i, { cr_id: x.target.value || null })}><option value="">Escolha…</option>{crs.map((c) => <option key={c.id} value={c.id}>{c.codigo} {c.caminho_nome}</option>)}</select>
                <input aria-label="Forma de pagamento" value={p.forma ?? ''} disabled={!editavel} onChange={(x) => set(i, { forma: x.target.value })} placeholder="Boleto, Pix…" />
                {editavel && parc.length > 1 ? <button type="button" className="sec" aria-label="Remover parcela" onClick={() => setParc(parc.filter((_, j) => j !== i))}>×</button> : <span />}
              </div>))}
          </div></div>
          {editavel && <button type="button" className="sec" onClick={() => setParc([...parc, { id: '', seq: parc.length + 1, vencimento: null, valor: null, natureza_id: parc[0]?.natureza_id ?? null, cr_id: parc[0]?.cr_id ?? null, forma: null, observacao: null, titulo_id: null }])}>+ Parcela</button>}
          <div className={fecha ? 'dif ok' : 'dif x'}><span>Parcelas somam {brl(soma)} · nota {brl(e.v_nf)}</span><span>{fecha ? 'fecha' : `diferença ${brl(soma - e.v_nf)}`}</span></div>
        </>)}
      {parcRub.length > 0 && <PagamentosRubrica ctx={ctx} d={d} lancs={parcRub} editavel={editavel} nats={nats} crs={crs} acao={acao} />}
      {d.pendencia_financeiro && <p className="sub" style={{ marginTop: '.5rem' }}>Pendente: {d.pendencia_financeiro}</p>}
      {editavel && <div className="barra" style={{ marginTop: '.6rem' }}><button className="sec" onClick={() => void salvar(false)}>Salvar</button><button onClick={() => void salvar(true)}>Salvar e marcar como conferido</button></div>}
      <p className="rastro">Este lançamento fica vinculado a esta nota fiscal (NF {e.numero ?? 's/n'}, chave …{e.chave_acesso.slice(-8)}). Lançamentos criados direto no financeiro, sem documento fiscal, não têm esse vínculo, e é assim que os dois casos ficam rastreáveis.</p>
    </Painel>
  )
}

/* ───────────── Pagamentos das rubricas extras ───────────── */

function PagamentosRubrica({ ctx, d, lancs, editavel, nats, crs, acao }: { ctx: Contexto; d: EntradaDetalhe; lancs: Parcela[]; editavel: boolean; nats: Natureza[]; crs: CentroResultado[]; acao: Acao }) {
  const e = d.entrada
  const [busca, setBusca] = useState<string | null>(null)
  const [achados, setAchados] = useState<ParceiroLinha[]>([])
  const [alvo, setAlvo] = useState<string | null>(null)
  useEffect(() => {
    if (busca == null) return
    const t = setTimeout(() => { apiParceiros.listar(ctx.empresa, { busca, papel: '', ativo: 'sim', tipo: '', minContatos: '', soRevisao: false }, 0, 20).then(setAchados).catch(() => setAchados([])) }, 250)
    return () => clearTimeout(t)
  }, [busca, ctx.empresa])
  const salvar = (rid: string, dados: Record<string, unknown>) => acao(async () => { await apiCompra.rubricaFinanceiroSalvar(ctx.empresa, e.id, rid, dados) })
  return (
    <div style={{ marginTop: '.9rem' }}>
      <h2>Pagamentos das rubricas extras</h2>
      <p className="sub">Cada rubrica marcada como "gera financeiro" vira um pagamento à parte, fora da soma das parcelas da nota. Por padrão o parceiro é o fornecedor da nota ({e.fornecedor_nome}); troque se for outro (ex.: transportadora).</p>
      {lancs.map((p) => {
        const rid = p.rubrica_id as string
        return (
          <div key={p.id} className="cx" style={{ padding: '.6rem', marginBottom: '.5rem' }}>
            <div className="lin"><strong>{p.observacao}</strong><strong>{brl(p.valor ?? 0)}</strong></div>
            <div className="campos">
              <Campo rotulo="Parceiro (quem recebe)">
                <div className="barra">
                  <span>{p.parceiro_nome ?? `${e.fornecedor_nome} (fornecedor da nota)`}</span>
                  {editavel && <button type="button" className="sec" onClick={() => { setAlvo(rid); setBusca('') }}>Trocar</button>}
                  {editavel && p.parceiro_id && <button type="button" className="sec" onClick={() => void salvar(rid, { parceiro_id: null })}>Usar fornecedor da nota</button>}
                </div>
              </Campo>
              <Campo rotulo="NF / documento"><input key={p.documento ?? ''} defaultValue={p.documento ?? ''} disabled={!editavel} placeholder="NF, CT-e, recibo" onBlur={(x) => { if (x.target.value !== (p.documento ?? '')) void salvar(rid, { documento: x.target.value }) }} /></Campo>
              <Campo rotulo="Vencimento"><input type="date" key={p.vencimento ?? ''} defaultValue={p.vencimento ?? ''} disabled={!editavel} onBlur={(x) => { if ((x.target.value || null) !== p.vencimento) void salvar(rid, { vencimento: x.target.value || null }) }} /></Campo>
              <Campo rotulo="Natureza"><select value={p.natureza_id ?? ''} disabled={!editavel} onChange={(x) => void salvar(rid, { natureza_id: x.target.value || null })}><option value="">Escolha…</option>{nats.map((n) => <option key={n.id} value={n.id}>{n.codigo} {n.nome}</option>)}</select></Campo>
              <Campo rotulo="Centro de resultado"><select value={p.cr_id ?? ''} disabled={!editavel} onChange={(x) => void salvar(rid, { cr_id: x.target.value || null })}><option value="">Escolha…</option>{crs.map((c) => <option key={c.id} value={c.id}>{c.codigo} {c.caminho_nome}</option>)}</select></Campo>
              <Campo rotulo="Forma"><input key={p.forma ?? ''} defaultValue={p.forma ?? ''} disabled={!editavel} placeholder="Boleto, Pix…" onBlur={(x) => { if (x.target.value !== (p.forma ?? '')) void salvar(rid, { forma: x.target.value }) }} /></Campo>
            </div>
          </div>)
      })}
      {busca != null && alvo && (
        <Modal titulo="Escolher parceiro" onFechar={() => { setBusca(null); setAlvo(null) }}>
          <input autoFocus value={busca} onChange={(x) => setBusca(x.target.value)} placeholder="Digite o nome do parceiro" style={{ width: '100%' }} />
          <div style={{ maxHeight: 280, overflow: 'auto', marginTop: '.5rem' }}>
            {achados.length === 0 && <p className="sub">Nenhum parceiro encontrado.</p>}
            {achados.map((a) => <div key={a.id} className="lin"><span>{a.nome}</span><button type="button" className="sec" onClick={() => { const r = alvo; setBusca(null); setAlvo(null); void salvar(r, { parceiro_id: a.id }) }}>Escolher</button></div>)}
          </div>
        </Modal>)}
    </div>
  )
}

/* ───────────── Confirmar ───────────── */

function Confirmar({ ctx, d, editavel, locais, onConfirmada, onErro }: {
  ctx: Contexto; d: EntradaDetalhe; editavel: boolean; locais: Local[]; onConfirmada: (r: { pecas_criadas?: number; unidades: number }) => void; onErro: (m: string | null) => void
}) {
  const ativos = locais.filter((l) => l.ativo)
  const [local, setLocal] = useState('')
  const [dialogo, setDialogo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const r = d.resumo
  const checks: { ok: boolean; texto: ReactNode }[] = [
    { ok: d.fornecedor_ok, texto: d.fornecedor_ok ? 'Fornecedor vinculado ao cadastro' : 'Vincule ou cadastre o fornecedor' },
    { ok: r.liberadas === r.linhas && r.linhas > 0, texto: `Peças revisadas e liberadas: ${r.liberadas} de ${r.linhas} linhas` },
    { ok: d.entrada.diferenca === 0, texto: `Nota fecha: diferença de ${brl(d.entrada.diferenca)}` },
    { ok: d.pendencia_financeiro == null, texto: d.pendencia_financeiro ?? 'Financeiro conferido' },
    { ok: !!local, texto: local ? 'Local do estoque informado' : 'Informe o local do estoque onde as peças vão entrar' },
  ]
  const tudo = checks.every((c) => c.ok)
  async function confirmar() {
    setEnviando(true); onErro(null)
    try { const res = await apiCompra.confirmar(ctx.empresa, d.entrada.id, local); setDialogo(false); onConfirmada(res) } catch (e) { onErro((e as Error).message); setDialogo(false) } finally { setEnviando(false) }
  }
  if (d.entrada.status === 'confirmada') return null
  return (
    <Painel titulo="Confirmar entrada" status={<span className={tudo ? 'st ok' : 'st pend'}>{checks.filter((c) => c.ok).length} de {checks.length} condições</span>}
      resumo={tudo ? 'Tudo certo para confirmar' : (checks.find((c) => !c.ok)?.texto ?? '')}>
      <ul className="lista-chk">{checks.map((c, i) => <li key={i}><span className={c.ok ? 'b ok' : 'b x'}>{c.ok ? '✓' : '✗'}</span><span>{c.texto}</span></li>)}</ul>
      <div className="campos" style={{ alignItems: 'end' }}>
        <Campo rotulo="Local do estoque" dica="Informe onde as peças vão entrar. Não vem preenchido de propósito."><ComboBusca opcoes={ativos.map((l) => ({ valor: l.id, rotulo: l.nome }))} valor={local} placeholder="Digite para buscar o local…" ariaLabel="Local do estoque" onEscolher={setLocal} /></Campo>
        <button type="button" disabled={!editavel || !tudo || !local} title={tudo ? undefined : 'Resolva os itens marcados com ✗'} onClick={() => setDialogo(true)}>Confirmar entrada</button>
      </div>
      {!tudo && <p className="sub">A confirmação só libera com todas as peças revisadas, o fornecedor vinculado, a nota fechada em R$ 0,00 e o financeiro conferido.</p>}
      {dialogo && (
        <Modal titulo="Confirmar a entrada?" onFechar={() => setDialogo(false)}>
          <div className="form">
            <p>Isto cria no CRM as peças e variações novas e <strong>{r.unidades} unidade(s)</strong> em estoque, cada uma com o seu custo. As etiquetas ficam pendentes na fila de impressão. Não dá para editar a entrada depois.</p>
            <div className="acoes"><button type="button" className="sec" onClick={() => setDialogo(false)}>Voltar</button><button type="button" disabled={enviando} onClick={() => void confirmar()}>{enviando ? 'Confirmando…' : 'Confirmar'}</button></div>
          </div>
        </Modal>)}
    </Painel>
  )
}
