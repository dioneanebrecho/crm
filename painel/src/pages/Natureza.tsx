import { useMemo, useState } from 'react'
import type { Contexto } from '../App'
import { apiFinanceiro, type CentroResultado, type DeParaBling, type LinhaDre, type Natureza as Nat, type RegraApropriacao } from '../apiFinanceiro'
import GradeDados, { type Coluna } from '../GradeDados'
import { Abas, Campo, Formulario, Modal, Titulo, useCarregar } from '../ui'

type Aba = 'arvore' | 'depara' | 'regras'
const SINAL: Record<string, string> = { '1': 'Receita (+)', '-1': 'Despesa (−)', '0': 'Neutra' }
const RECONHECE: Record<string, string> = { lancamento: 'No lançamento', cmv_itens: 'No custo dos itens vendidos', nao_dre: 'Fora do DRE' }
const CAMPOS = ['qualquer', 'origem_tipo', 'codigo_fiscal', 'forma_pagamento_id', 'contato_bling_id', 'historico', 'valor', 'situacao']
const OPERADORES = ['qualquer', 'igual', 'em', 'regex', 'menor_igual']
const ESCOPOS = ['receber', 'pagar', 'extrato', 'derivada']

export default function Natureza({ ctx }: { ctx: Contexto }) {
  const [aba, setAba] = useState<Aba>('arvore')
  const nats = useCarregar(() => apiFinanceiro.naturezas(ctx.empresa), [ctx.empresa])
  const crs = useCarregar(() => apiFinanceiro.centros(ctx.empresa), [ctx.empresa])
  const dre = useCarregar(() => apiFinanceiro.linhasDre(ctx.empresa), [ctx.empresa])
  const pode = (ctx.papeis.includes('admin') || ctx.papeis.includes('gestor') || ctx.papeis.includes('superadmin'))
    && (ctx.perm === null || ctx.perm['naturezas'] === 'editar')
  const erro = nats.erro ?? crs.erro ?? dre.erro
  const prontos = nats.dados && crs.dados && dre.dados

  return (
    <section>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Define <strong>o que</strong> é cada receita, custo ou despesa, em até 4 níveis (9.99.99.999). Só o 4º nível recebe lançamentos. A natureza também diz em qual linha do DRE o valor entra. O De-Para liga as categorias do Bling às naturezas, e as regras sugerem natureza e centro de resultado para cada lançamento. Nada é enviado ao Bling.</>}>
            Natureza financeira
          </Titulo>
          {nats.dados && <p className="sub">{nats.dados.length} cadastros · {nats.dados.filter((n) => n.analitico).length} analíticos (recebem lançamentos)</p>}
        </div>
      </div>
      <Abas<Aba> abas={[{ id: 'arvore', rotulo: 'Árvore de naturezas', contagem: nats.dados?.length }, { id: 'depara', rotulo: 'De-Para do Bling' }, { id: 'regras', rotulo: 'Regras de apropriação' }]} ativa={aba} onMudar={setAba} />
      {erro && <div className="erro">{erro}</div>}
      {!prontos && !erro && <p className="sub">Carregando…</p>}
      {prontos && aba === 'arvore' && <Arvore ctx={ctx} pode={pode} nats={nats.dados!} crs={crs.dados!} dre={dre.dados!} aoMudar={nats.recarregar} />}
      {prontos && aba === 'depara' && <DePara ctx={ctx} pode={pode} nats={nats.dados!} />}
      {prontos && aba === 'regras' && <Regras ctx={ctx} pode={pode} nats={nats.dados!} crs={crs.dados!} />}
    </section>
  )
}

// ================================================================= Árvore
function Arvore({ ctx, pode, nats, crs, dre, aoMudar }: { ctx: Contexto; pode: boolean; nats: Nat[]; crs: CentroResultado[]; dre: LinhaDre[]; aoMudar: () => void }) {
  const [fechados, setFechados] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<{ nat: Nat | null; pai: Nat | null } | null>(null)
  const ordenados = useMemo(() => [...nats].sort((a, b) => a.codigo.localeCompare(b.codigo)), [nats])
  const linhas = useMemo(() => {
    const fech = ordenados.filter((n) => fechados.has(n.id))
    return ordenados.filter((n) => !fech.some((a) => n.codigo.startsWith(a.codigo + '.')))
  }, [ordenados, fechados])
  const alternar = (id: string) => setFechados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const colunas: Coluna<Nat>[] = [
    { id: 'codigo', titulo: 'Código', texto: (n) => n.codigo, max: 130 },
    { id: 'nome', titulo: 'Natureza', texto: (n) => n.nome, largura: 340, render: (n) => (
      <span style={{ paddingLeft: (n.grau - 1) * 18, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {n.qtd_filhos > 0
          ? <button type="button" className="link" style={{ padding: 0 }} aria-label={fechados.has(n.id) ? 'Expandir' : 'Recolher'} onClick={(e) => { e.stopPropagation(); alternar(n.id) }}>{fechados.has(n.id) ? '▸' : '▾'}</button>
          : <span style={{ width: 10, display: 'inline-block' }} />}
        <span style={{ fontWeight: n.analitico ? 400 : 700, opacity: n.ativo ? 1 : 0.5 }}>{n.nome}</span>
      </span>) },
    { id: 'nivel', titulo: 'Nível', texto: (n) => (n.analitico ? 'Analítico' : 'Sintético') },
    { id: 'sinal', titulo: 'Natureza', texto: (n) => SINAL[String(n.sinal)] ?? '' },
    { id: 'dre', titulo: 'Linha do DRE', texto: (n) => (n.linha_dre_codigo ? `${n.linha_dre_codigo} ${n.linha_dre_nome}` : ''), largura: 220 },
    { id: 'cr', titulo: 'CR padrão', texto: (n) => n.cr_padrao_codigo ?? '' },
    { id: 'comp', titulo: 'Comportamento', texto: (n) => (n.comportamento === 'fixa' ? 'Fixa' : n.comportamento === 'variavel' ? 'Variável' : ''), oculta: true },
    { id: 'reconhece', titulo: 'Reconhece', texto: (n) => RECONHECE[n.reconhece_em] ?? '', oculta: true },
    { id: 'canal', titulo: 'Exige CR de canal', texto: (n) => (n.exige_cr_canal ? 'Sim' : ''), oculta: true },
    { id: 'aprop', titulo: 'Lançamentos', texto: (n) => String(n.qtd_apropriacoes), valor: (n) => n.qtd_apropriacoes, direita: true, formatar: (v) => v.toLocaleString('pt-BR') },
    { id: 'depara', titulo: 'No De-Para', texto: (n) => String(n.qtd_depara), valor: (n) => n.qtd_depara, direita: true, somar: false },
    { id: 'situacao', titulo: 'Situação', texto: (n) => (n.ativo ? 'Ativo' : 'Inativo') },
    { id: 'acoes', titulo: 'Ações', simples: true, texto: () => '', render: (n) => pode ? (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditando({ nat: n, pai: null }) }}>Editar</button>
        {!n.analitico && n.ativo && <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditando({ nat: null, pai: n }) }}>+ Filha</button>}
      </span>) : null },
  ]

  return (
    <div>
      <div className="topo">
        <p className="sub">Só naturezas <strong>analíticas</strong> (4º nível) recebem lançamentos. As <strong>sintéticas</strong> agrupam e somam.</p>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button type="button" className="sec" onClick={() => setFechados(fechados.size ? new Set() : new Set(ordenados.filter((n) => n.qtd_filhos > 0 && n.grau >= 2).map((n) => n.id)))}>{fechados.size ? 'Expandir tudo' : 'Recolher subníveis'}</button>
          {pode && <button type="button" onClick={() => setEditando({ nat: null, pai: null })}>+ Nova natureza</button>}
        </span>
      </div>
      <GradeDados id="financeiro.natureza" titulo="Naturezas" colunas={colunas} linhas={linhas} chave={(n) => n.id} altura="68vh" vazio="Nenhuma natureza cadastrada." />
      {editando && <NaturezaForm ctx={ctx} pode={pode} nats={nats} crs={crs} dre={dre} nat={editando.nat} paiInicial={editando.pai}
        onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); aoMudar() }} />}
    </div>
  )
}

function NaturezaForm({ ctx, pode, nats, crs, dre, nat, paiInicial, onFechar, onSalvo }: {
  ctx: Contexto; pode: boolean; nats: Nat[]; crs: CentroResultado[]; dre: LinhaDre[]; nat: Nat | null; paiInicial: Nat | null; onFechar: () => void; onSalvo: () => void
}) {
  const p0 = paiInicial
  const [nome, setNome] = useState(nat?.nome ?? '')
  const [paiId, setPaiId] = useState(nat ? (nat.pai_id ?? '') : (p0?.id ?? ''))
  const [sinal, setSinal] = useState(String(nat?.sinal ?? p0?.sinal ?? -1))
  const [comp, setComp] = useState(nat ? (nat.comportamento ?? '') : (p0?.comportamento ?? ''))
  const [reconhece, setReconhece] = useState(nat?.reconhece_em ?? p0?.reconhece_em ?? 'lancamento')
  const [exigeCanal, setExigeCanal] = useState(nat?.exige_cr_canal ?? p0?.exige_cr_canal ?? false)
  const [dreId, setDreId] = useState(nat ? (nat.linha_dre_id ?? '') : (p0?.linha_dre_id ?? ''))
  const [crId, setCrId] = useState(nat ? (nat.cr_padrao_id ?? '') : (p0?.cr_padrao_id ?? ''))
  const [ativo, setAtivo] = useState(nat?.ativo ?? true)
  const pais = useMemo(() => nats.filter((n) => !n.analitico && n.ativo).sort((a, b) => a.codigo.localeCompare(b.codigo)), [nats])
  const grauNovo = (nats.find((n) => n.id === paiId)?.grau ?? 0) + 1
  const crAnaliticos = useMemo(() => crs.filter((c) => c.analitico && c.ativo).sort((a, b) => a.codigo.localeCompare(b.codigo)), [crs])
  const podeExcluir = pode && !!nat && nat.qtd_filhos === 0 && nat.qtd_apropriacoes === 0 && nat.qtd_regras === 0 && nat.qtd_depara === 0

  async function excluir() {
    if (!nat || !window.confirm(`Excluir a natureza “${nat.nome}”? Ela não tem filhos, regras, De-Para nem lançamentos.`)) return
    await apiFinanceiro.excluirNatureza(ctx.empresa, nat.id); onSalvo()
  }
  return (
    <Modal titulo={nat ? `Editar · ${nat.codigo}` : 'Nova natureza'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} enviarRotulo={pode ? 'Salvar' : 'Fechar'} onEnviar={async () => {
        if (!pode) return onFechar()
        const dados: Record<string, unknown> = {
          nome, ativo, sinal: Number(sinal), comportamento: comp || null, reconhece_em: reconhece,
          exige_cr_canal: exigeCanal, linha_dre_id: dreId || null, cr_padrao_id: crId || null,
        }
        if (!nat) dados.pai_id = paiId || null
        await apiFinanceiro.salvarNatureza(ctx.empresa, nat?.id ?? null, dados)
        onSalvo()
      }}>
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required autoFocus disabled={!pode} /></Campo>
        <Campo rotulo="Natureza pai" dica={nat ? 'O pai e o código não mudam depois de criados.' : `Ficará no nível ${grauNovo}${grauNovo === 4 ? ' (analítica: recebe lançamentos)' : ''}. O código é gerado automaticamente.`}>
          <select value={paiId} onChange={(e) => setPaiId(e.target.value)} disabled={!pode || !!nat}>
            <option value="">(nenhuma: nível 1)</option>
            {pais.map((n) => <option key={n.id} value={n.id}>{n.codigo} · {n.caminho_nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Tipo de valor">
          <select value={sinal} onChange={(e) => setSinal(e.target.value)} disabled={!pode}>
            {Object.entries(SINAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Comportamento" dica="Fixa ou variável com a venda. Opcional.">
          <select value={comp} onChange={(e) => setComp(e.target.value)} disabled={!pode}>
            <option value="">(não definido)</option><option value="fixa">Fixa</option><option value="variavel">Variável</option>
          </select>
        </Campo>
        <Campo rotulo="Quando entra no DRE" dica="Compras de mercadoria entram pelo custo dos itens vendidos, não no lançamento.">
          <select value={reconhece} onChange={(e) => setReconhece(e.target.value as Nat['reconhece_em'])} disabled={!pode}>
            {Object.entries(RECONHECE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Linha do DRE">
          <select value={dreId} onChange={(e) => setDreId(e.target.value)} disabled={!pode}>
            <option value="">(nenhuma)</option>
            {dre.filter((l) => l.ativo && l.tipo === 'conta').map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Centro de resultado padrão" dica="Sugestão quando nenhuma regra decidir. Opcional.">
          <select value={crId} onChange={(e) => setCrId(e.target.value)} disabled={!pode}>
            <option value="">(nenhum)</option>
            {crAnaliticos.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.caminho_nome}</option>)}
          </select>
        </Campo>
        <label className="check"><input type="checkbox" checked={exigeCanal} onChange={(e) => setExigeCanal(e.target.checked)} disabled={!pode} /> Exige centro de resultado de canal (receita, dedução e CMV)</label>
        {nat && <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={!pode} /> Natureza ativa</label>}
        {podeExcluir && <button type="button" className="link" style={{ color: 'var(--erro, #e5484d)', alignSelf: 'flex-start' }} onClick={() => { void excluir().catch((e: Error) => window.alert(e.message)) }}>Excluir esta natureza</button>}
      </Formulario>
    </Modal>
  )
}

// ================================================================= De-Para do Bling
function DePara({ ctx, pode, nats }: { ctx: Contexto; pode: boolean; nats: Nat[] }) {
  const lista = useCarregar(() => apiFinanceiro.depara(ctx.empresa), [ctx.empresa])
  const [editando, setEditando] = useState<DeParaBling | null>(null)
  const dados = lista.dados ?? []
  const pend = dados.filter((d) => !d.mapeada).length
  const colunas: Coluna<DeParaBling>[] = [
    { id: 'tipo', titulo: 'Tipo (Bling)', texto: (d) => d.tipo ?? '', max: 110 },
    { id: 'cat', titulo: 'Categoria do Bling', texto: (d) => d.descricao, largura: 320 },
    { id: 'nat', titulo: 'Natureza no CRM', texto: (d) => (d.ignorar ? '(ignorada)' : d.natureza_caminho ? `${d.natureza_codigo} · ${d.natureza_caminho}` : '(sem natureza)'), largura: 420,
      render: (d) => <span style={{ color: !d.mapeada ? 'var(--aviso, #d99a1c)' : undefined, opacity: d.ignorar ? 0.6 : 1 }}>{d.ignorar ? '(ignorada)' : d.natureza_caminho ? `${d.natureza_codigo} · ${d.natureza_caminho}` : '(sem natureza)'}</span> },
    { id: 'obs', titulo: 'Observação', texto: (d) => d.observacao ?? '', largura: 260 },
    { id: 'acoes', titulo: 'Ações', simples: true, texto: () => '', render: (d) => pode ? <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditando(d) }}>Editar</button> : null },
  ]
  return (
    <div>
      <p className="sub">Cada categoria financeira do Bling aponta para uma natureza analítica do CRM, ou é ignorada (grupos do Bling sem lançamento). {pend > 0 ? <strong>{pend} sem mapeamento.</strong> : 'Todas mapeadas.'}</p>
      {lista.erro && <div className="erro">{lista.erro}</div>}
      <GradeDados id="financeiro.depara" titulo="De-Para do Bling" colunas={colunas} linhas={dados} chave={(d) => String(d.categoria_bling_id)} altura="68vh" vazio="Nenhuma categoria do Bling carregada." />
      {editando && <DeParaForm ctx={ctx} nats={nats} item={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); lista.recarregar() }} />}
    </div>
  )
}

function DeParaForm({ ctx, nats, item, onFechar, onSalvo }: { ctx: Contexto; nats: Nat[]; item: DeParaBling; onFechar: () => void; onSalvo: () => void }) {
  const [natId, setNatId] = useState(item.natureza_id ?? '')
  const [ignorar, setIgnorar] = useState(item.ignorar)
  const [obs, setObs] = useState(item.observacao ?? '')
  const analiticas = useMemo(() => nats.filter((n) => n.analitico && n.ativo).sort((a, b) => a.codigo.localeCompare(b.codigo)), [nats])
  return (
    <Modal titulo={`De-Para · ${item.descricao}`} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        await apiFinanceiro.salvarDepara(ctx.empresa, item.categoria_bling_id, ignorar ? null : (natId || null), ignorar, obs.trim() || null)
        onSalvo()
      }}>
        <label className="check"><input type="checkbox" checked={ignorar} onChange={(e) => setIgnorar(e.target.checked)} /> Ignorar esta categoria (não gera lançamento no CRM)</label>
        {!ignorar && (
          <Campo rotulo="Natureza" dica="Só naturezas analíticas e ativas.">
            <select value={natId} onChange={(e) => setNatId(e.target.value)} required>
              <option value="">(escolha)</option>
              {analiticas.map((n) => <option key={n.id} value={n.id}>{n.codigo} · {n.caminho_nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Observação"><input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} /></Campo>
      </Formulario>
    </Modal>
  )
}

// ================================================================= Regras de apropriação
function Regras({ ctx, pode, nats, crs }: { ctx: Contexto; pode: boolean; nats: Nat[]; crs: CentroResultado[] }) {
  const lista = useCarregar(() => apiFinanceiro.regras(ctx.empresa), [ctx.empresa])
  const [editando, setEditando] = useState<RegraApropriacao | 'nova' | null>(null)
  const colunas: Coluna<RegraApropriacao>[] = [
    { id: 'prio', titulo: 'Prioridade', texto: (r) => String(r.prioridade), valor: (r) => r.prioridade, direita: true, somar: false, max: 100 },
    { id: 'desc', titulo: 'Regra', texto: (r) => r.descricao, largura: 300 },
    { id: 'escopo', titulo: 'Vale para', texto: (r) => r.escopo.join(', ') },
    { id: 'cond', titulo: 'Condição', texto: (r) => (r.operador === 'qualquer' ? 'Qualquer' : `${r.campo} ${r.operador} ${r.valor ?? ''}`), largura: 260 },
    { id: 'nat', titulo: 'Natureza', texto: (r) => (r.natureza_codigo ? `${r.natureza_codigo} · ${r.natureza_caminho}` : ''), largura: 300 },
    { id: 'cr', titulo: 'Centro de resultado', texto: (r) => (r.cr_codigo ? `${r.cr_codigo} · ${r.cr_caminho}` : ''), largura: 220 },
    { id: 'conf', titulo: 'Confiança', texto: (r) => r.confianca },
    { id: 'versao', titulo: 'Versão', texto: (r) => String(r.versao_regra), valor: (r) => r.versao_regra, direita: true, somar: false, oculta: true },
    { id: 'ativa', titulo: 'Situação', texto: (r) => (r.ativa ? 'Ativa' : 'Desligada') },
    { id: 'acoes', titulo: 'Ações', simples: true, texto: () => '', render: (r) => pode ? <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditando(r) }}>Editar</button> : null },
  ]
  return (
    <div>
      <div className="topo">
        <p className="sub">Decidem a natureza e o centro de resultado de cada lançamento. Vale a de menor prioridade que casar. Regras não são excluídas: desligue para parar de usar.</p>
        {pode && <button type="button" onClick={() => setEditando('nova')}>+ Nova regra</button>}
      </div>
      {lista.erro && <div className="erro">{lista.erro}</div>}
      <GradeDados id="financeiro.regras" titulo="Regras de apropriação" colunas={colunas} linhas={lista.dados ?? []} chave={(r) => r.id} altura="66vh" vazio="Nenhuma regra." />
      {editando && <RegraForm ctx={ctx} nats={nats} crs={crs} regra={editando === 'nova' ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); lista.recarregar() }} />}
    </div>
  )
}

function RegraForm({ ctx, nats, crs, regra, onFechar, onSalvo }: { ctx: Contexto; nats: Nat[]; crs: CentroResultado[]; regra: RegraApropriacao | null; onFechar: () => void; onSalvo: () => void }) {
  const [descricao, setDescricao] = useState(regra?.descricao ?? '')
  const [escopo, setEscopo] = useState<string[]>(regra?.escopo ?? ['pagar'])
  const [prioridade, setPrioridade] = useState(String(regra?.prioridade ?? 100))
  const [campo, setCampo] = useState(regra?.campo ?? 'qualquer')
  const [operador, setOperador] = useState(regra?.operador ?? 'qualquer')
  const [valor, setValor] = useState(regra?.valor ?? '')
  const [natId, setNatId] = useState(regra?.natureza_id ?? '')
  const [crId, setCrId] = useState(regra?.cr_id ?? '')
  const [confianca, setConfianca] = useState(regra?.confianca ?? 'media')
  const [ativa, setAtiva] = useState(regra?.ativa ?? true)
  const analiticas = useMemo(() => nats.filter((n) => n.analitico && n.ativo).sort((a, b) => a.codigo.localeCompare(b.codigo)), [nats])
  const crAnal = useMemo(() => crs.filter((c) => c.analitico && c.ativo).sort((a, b) => a.codigo.localeCompare(b.codigo)), [crs])
  return (
    <Modal titulo={regra ? 'Editar regra' : 'Nova regra'} onFechar={onFechar} larga>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        if (!natId && !crId) throw new Error('Escolha uma natureza, um centro de resultado ou os dois.')
        if (escopo.length === 0) throw new Error('Marque ao menos um escopo.')
        await apiFinanceiro.salvarRegra(ctx.empresa, regra?.id ?? null, {
          descricao, escopo, prioridade: Number(prioridade) || 100, campo, operador, valor: operador === 'qualquer' ? null : valor,
          natureza_id: natId || null, cr_id: crId || null, confianca, ativa,
        })
        onSalvo()
      }}>
        <Campo rotulo="Descrição"><input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={160} required autoFocus /></Campo>
        <Campo rotulo="Vale para">
          <span style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
            {ESCOPOS.map((e) => (
              <label key={e} className="check"><input type="checkbox" checked={escopo.includes(e)} onChange={(ev) => setEscopo((s) => ev.target.checked ? [...s, e] : s.filter((x) => x !== e))} /> {e}</label>
            ))}
          </span>
        </Campo>
        <Campo rotulo="Condição" dica="Operador “qualquer” ignora campo e valor.">
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={campo} onChange={(e) => setCampo(e.target.value)}>{CAMPOS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select value={operador} onChange={(e) => setOperador(e.target.value)}>{OPERADORES.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            {operador !== 'qualquer' && <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="valor" required />}
          </span>
        </Campo>
        <Campo rotulo="Natureza de destino">
          <select value={natId} onChange={(e) => setNatId(e.target.value)}>
            <option value="">(não define)</option>
            {analiticas.map((n) => <option key={n.id} value={n.id}>{n.codigo} · {n.caminho_nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Centro de resultado de destino">
          <select value={crId} onChange={(e) => setCrId(e.target.value)}>
            <option value="">(não define)</option>
            {crAnal.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.caminho_nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Prioridade" dica="Menor número vale primeiro."><input value={prioridade} onChange={(e) => setPrioridade(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></Campo>
        <Campo rotulo="Confiança">
          <select value={confianca} onChange={(e) => setConfianca(e.target.value as RegraApropriacao['confianca'])}>
            <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </select>
        </Campo>
        {regra && <label className="check"><input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Regra ativa</label>}
      </Formulario>
    </Modal>
  )
}
