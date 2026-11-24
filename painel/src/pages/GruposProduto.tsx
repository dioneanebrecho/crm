import { useMemo, useState } from 'react'
import type { Contexto } from '../App'
import { numero } from '../api'
import { apiGrades, type TipoGrade } from '../apiGrades'
import {
  apiGrupos, type Caracteristica, type DadosLote, type FiltroProdutos, type GrupoProduto, type PalavraClassificacao, type ProdutoClassificacao,
} from '../apiGrupos'
import { CampoMarca, MarcaInput } from '../CampoMarca'
import GradeDados, { type Coluna } from '../GradeDados'
import { Abas, Busca, Campo, Formulario, LimparFiltros, Modal, Paginacao, Titulo, useCarregar } from '../ui'

type Aba = 'produtos' | 'arvore' | 'regras'
const LIMITE = 200
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ehPendente = (cod: string | null) => !!cod && cod.startsWith('99.')

export default function GruposProduto({ ctx }: { ctx: Contexto }) {
  const [aba, setAba] = useState<Aba>('produtos')
  const grupos = useCarregar(() => apiGrupos.grupos(ctx.empresa), [ctx.empresa])
  const caract = useCarregar(() => apiGrupos.caracteristicas(ctx.empresa), [ctx.empresa])
  const resumo = useCarregar(() => apiGrupos.resumo(ctx.empresa), [ctx.empresa])
  const pode = (ctx.papeis.includes('admin') || ctx.papeis.includes('gestor') || ctx.papeis.includes('superadmin'))
    && (ctx.perm === null || ctx.perm['grupos_produto'] === 'editar')
  const r = resumo.dados

  return (
    <section>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Organiza o catálogo em até 4 níveis (departamento, família, tipo de peça, subtipo). Marca e material ficam no produto, não na árvore. Tudo é gerencial no CRM: nada é enviado ao Bling.</>}>
            Grupos de produto
          </Titulo>
          {r && <p className="sub">{r.total.toLocaleString('pt-BR')} produtos · {r.classificados.toLocaleString('pt-BR')} classificados · <strong>{r.pendentes.toLocaleString('pt-BR')} em “A classificar”</strong> · {r.manuais.toLocaleString('pt-BR')} ajustados à mão · {r.com_marca.toLocaleString('pt-BR')} com marca</p>}
        </div>
      </div>
      <Abas<Aba> abas={[{ id: 'produtos', rotulo: 'Produtos' }, { id: 'arvore', rotulo: 'Árvore de grupos', contagem: grupos.dados?.length }, { id: 'regras', rotulo: 'Regras e características' }]} ativa={aba} onMudar={setAba} />
      {(grupos.erro || caract.erro) && <div className="erro">{grupos.erro ?? caract.erro}</div>}
      {aba === 'produtos' && grupos.dados && caract.dados &&
        <Produtos ctx={ctx} pode={pode} grupos={grupos.dados} caract={caract.dados} aoMudar={() => { resumo.recarregar(); grupos.recarregar() }} />}
      {aba === 'arvore' && grupos.dados && <Arvore ctx={ctx} pode={pode} grupos={grupos.dados} aoMudar={() => { grupos.recarregar(); resumo.recarregar() }} />}
      {aba === 'regras' && grupos.dados && caract.dados &&
        <Regras ctx={ctx} pode={pode} grupos={grupos.dados} caract={caract.dados} aoMudar={() => caract.recarregar()} />}
      {(grupos.carregando && !grupos.dados) && <p className="sub">Carregando…</p>}
    </section>
  )
}

// ================================================================= Árvore de grupos
function Arvore({ ctx, pode, grupos, aoMudar }: { ctx: Contexto; pode: boolean; grupos: GrupoProduto[]; aoMudar: () => void }) {
  const [fechados, setFechados] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<{ grupo: GrupoProduto | null; pai: GrupoProduto | null } | null>(null)
  const tipos = useCarregar(() => apiGrades.listar(ctx.empresa).catch(() => [] as TipoGrade[]), [ctx.empresa])
  const ordenados = useMemo(() => [...grupos].sort((a, b) => a.codigo.localeCompare(b.codigo)), [grupos])
  const linhas = useMemo(() => {
    const fech = ordenados.filter((g) => fechados.has(g.id))
    return ordenados.filter((g) => !fech.some((a) => g.codigo.startsWith(a.codigo + '.')))
  }, [ordenados, fechados])
  const alternar = (id: string) => setFechados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const colunas: Coluna<GrupoProduto>[] = [
    { id: 'codigo', titulo: 'Código', texto: (g) => g.codigo, max: 120 },
    { id: 'nome', titulo: 'Grupo', texto: (g) => g.nome, largura: 330, render: (g) => (
      <span style={{ paddingLeft: (g.grau - 1) * 18, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {g.qtd_filhos > 0
          ? <button type="button" className="link" style={{ padding: 0 }} aria-label={fechados.has(g.id) ? 'Expandir' : 'Recolher'} onClick={(e) => { e.stopPropagation(); alternar(g.id) }}>{fechados.has(g.id) ? '▸' : '▾'}</button>
          : <span style={{ width: 10, display: 'inline-block' }} />}
        <span style={{ fontWeight: g.analitico ? 400 : 700, opacity: g.ativo ? 1 : 0.5 }}>{g.nome}</span>
      </span>) },
    { id: 'tipo', titulo: 'Tipo', texto: (g) => (g.analitico ? 'Analítico' : 'Sintético') },
    { id: 'produtos', titulo: 'Produtos', texto: (g) => String(g.qtd_produtos), valor: (g) => g.qtd_produtos, direita: true, formatar: (n) => n.toLocaleString('pt-BR') },
    { id: 'sub', titulo: 'Subgrupos', texto: (g) => String(g.qtd_filhos), valor: (g) => g.qtd_filhos, direita: true, somar: false },
    { id: 'ncm', titulo: 'NCM padrão', texto: (g) => g.ncm_padrao ?? '', oculta: true },
    { id: 'margem', titulo: 'Margem alvo', texto: (g) => (g.margem_alvo == null ? '' : `${g.margem_alvo}%`), valor: (g) => g.margem_alvo, direita: true, somar: false, oculta: true },
    { id: 'situacao', titulo: 'Situação', texto: (g) => (g.ativo ? 'Ativo' : 'Inativo') },
    { id: 'acoes', titulo: 'Ações', simples: true, texto: () => '', render: (g) => pode ? (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditando({ grupo: g, pai: null }) }}>Editar</button>
        {!g.analitico && g.ativo && <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditando({ grupo: null, pai: g }) }}>+ Subgrupo</button>}
      </span>) : null },
  ]

  return (
    <div>
      <div className="topo">
        <p className="sub">Só grupos <strong>analíticos</strong> recebem produtos (3º nível ou abaixo). Grupos <strong>sintéticos</strong> apenas organizam a árvore.</p>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button type="button" className="sec" onClick={() => setFechados(fechados.size ? new Set() : new Set(ordenados.filter((g) => g.qtd_filhos > 0 && g.grau >= 2).map((g) => g.id)))}>{fechados.size ? 'Expandir tudo' : 'Recolher famílias'}</button>
          {pode && <button type="button" onClick={() => setEditando({ grupo: null, pai: null })}>+ Novo grupo</button>}
        </span>
      </div>
      <GradeDados id="grupos.arvore" titulo="Grupos de produto" colunas={colunas} linhas={linhas} chave={(g) => g.id} altura="68vh" vazio="Nenhum grupo cadastrado." />
      {editando && <GrupoForm ctx={ctx} pode={pode} grupos={grupos} grupo={editando.grupo} paiInicial={editando.pai} tipos={tipos.dados ?? []}
        onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); aoMudar() }} />}
    </div>
  )
}

function GrupoForm({ ctx, pode, grupos, grupo, paiInicial, tipos, onFechar, onSalvo }: {
  ctx: Contexto; pode: boolean; grupos: GrupoProduto[]; grupo: GrupoProduto | null; paiInicial: GrupoProduto | null
  tipos: TipoGrade[]; onFechar: () => void; onSalvo: () => void
}) {
  const [nome, setNome] = useState(grupo?.nome ?? '')
  const [paiId, setPaiId] = useState(grupo ? (grupo.pai_id ?? '') : (paiInicial?.id ?? ''))
  const [analitico, setAnalitico] = useState(grupo?.analitico ?? false)
  const [ativo, setAtivo] = useState(grupo?.ativo ?? true)
  const [ncm, setNcm] = useState(grupo?.ncm_padrao ?? '')
  const [margem, setMargem] = useState(grupo?.margem_alvo == null ? '' : String(grupo.margem_alvo).replace('.', ','))
  const [tipoGrade, setTipoGrade] = useState(grupo?.tipo_grade_padrao_id ?? '')
  const pais = useMemo(() => grupos.filter((g) => !g.analitico && g.ativo && (!grupo || (g.id !== grupo.id && !g.codigo.startsWith(grupo.codigo + '.'))))
    .sort((a, b) => a.codigo.localeCompare(b.codigo)), [grupos, grupo])
  const grauPai = grupos.find((g) => g.id === paiId)?.grau ?? 0
  const grauNovo = grauPai + 1
  const podeExcluir = pode && !!grupo && grupo.qtd_filhos === 0 && grupo.qtd_produtos === 0 && grupo.qtd_pecas === 0 && !ehPendente(grupo.codigo)

  async function excluir() {
    if (!grupo || !window.confirm(`Excluir o grupo “${grupo.nome}”? Não há produtos nem subgrupos nele.`)) return
    await apiGrupos.excluirGrupo(ctx.empresa, grupo.id); onSalvo()
  }
  return (
    <Modal titulo={grupo ? `Editar grupo · ${grupo.codigo}` : 'Novo grupo'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} enviarRotulo={pode ? 'Salvar' : 'Fechar'} onEnviar={async () => {
        if (!pode) return onFechar()
        if (analitico && grauNovo < 3) throw new Error('Grupo que recebe produto precisa estar no 3º nível ou abaixo: escolha um grupo pai de nível 2.')
        await apiGrupos.salvarGrupo(ctx.empresa, grupo?.id ?? null, {
          pai_id: paiId || null, nome, analitico, ativo, ncm_padrao: ncm.trim() || null,
          margem_alvo: margem.trim() ? numero(margem) : null, tipo_grade_padrao_id: tipoGrade || null,
        })
        onSalvo()
      }}>
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required autoFocus disabled={!pode} /></Campo>
        <Campo rotulo="Grupo pai" dica={`Este grupo ficará no nível ${grauNovo}. O código é gerado automaticamente.`}>
          <select value={paiId} onChange={(e) => setPaiId(e.target.value)} disabled={!pode}>
            <option value="">(nenhum: nível 1, departamento)</option>
            {pais.map((g) => <option key={g.id} value={g.id}>{g.codigo} · {g.caminho_nome}</option>)}
          </select>
        </Campo>
        <label className="check"><input type="checkbox" checked={analitico} onChange={(e) => setAnalitico(e.target.checked)} disabled={!pode || (!!grupo && grupo.qtd_filhos > 0)} /> Recebe produtos (analítico)</label>
        {grupo && <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={!pode} /> Grupo ativo</label>}
        <Campo rotulo="Tipo de grade padrão" dica="Sugere tamanhos e atributos ao cadastrar uma peça deste grupo.">
          <select value={tipoGrade} onChange={(e) => setTipoGrade(e.target.value)} disabled={!pode}>
            <option value="">(nenhum)</option>
            {tipos.filter((t) => !t.id.startsWith('padrao:')).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="NCM padrão" dica="8 dígitos, só números. Opcional."><input value={ncm} onChange={(e) => setNcm(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" disabled={!pode} /></Campo>
        <Campo rotulo="Margem alvo (%)" dica="Opcional. Entre 0 e 100."><input value={margem} onChange={(e) => setMargem(e.target.value)} inputMode="decimal" disabled={!pode} /></Campo>
        {podeExcluir && <button type="button" className="link" style={{ color: 'var(--erro, #e5484d)', alignSelf: 'flex-start' }} onClick={() => { void excluir().catch((e: Error) => window.alert(e.message)) }}>Excluir este grupo</button>}
      </Formulario>
    </Modal>
  )
}

// ================================================================= Produtos (filtros, seleção e lote)
function Produtos({ ctx, pode, grupos, caract, aoMudar }: { ctx: Contexto; pode: boolean; grupos: GrupoProduto[]; caract: Caracteristica[]; aoMudar: () => void }) {
  const [filtro, setFiltro] = useState<FiltroProdutos>({ so_pendentes: true })
  const [offset, setOffset] = useState(0)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [todosFiltro, setTodosFiltro] = useState(false)
  const [lote, setLote] = useState(false)
  const [um, setUm] = useState<ProdutoClassificacao | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const { dados, erro, carregando, recarregar } = useCarregar(() => apiGrupos.produtos(ctx.empresa, filtro, LIMITE, offset), [ctx.empresa, filtro, offset])
  const ativas = useMemo(() => caract.filter((c) => c.ativo), [caract])
  const ordenados = useMemo(() => [...grupos].sort((a, b) => a.codigo.localeCompare(b.codigo)), [grupos])
  const itens = dados?.itens ?? []
  const total = dados?.total ?? 0
  const qtdSel = todosFiltro ? total : sel.size
  const filtroAtivo = Object.keys(filtro).length > 0

  const mudarFiltro = (f: FiltroProdutos) => { setFiltro(f); setOffset(0); setSel(new Set()); setTodosFiltro(false) }
  const alterarCampo = (k: keyof FiltroProdutos, v: string | boolean | undefined) => {
    const f: Record<string, unknown> = { ...filtro }
    if (v === undefined || v === '' || v === false) delete f[k]; else f[k] = v
    if (k === 'caracteristica') delete f.valor
    mudarFiltro(f as FiltroProdutos)
  }
  const idsPagina = itens.map((p) => p.bling_id)
  const paginaToda = idsPagina.length > 0 && idsPagina.every((i) => sel.has(i))
  const alternarPagina = () => { setTodosFiltro(false); setSel((s) => { const n = new Set(s); if (paginaToda) idsPagina.forEach((i) => n.delete(i)); else idsPagina.forEach((i) => n.add(i)); return n }) }
  const alternarUm = (id: number) => { setTodosFiltro(false); setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const depois = (msg: string) => { setAviso(msg); setLote(false); setUm(null); setSel(new Set()); setTodosFiltro(false); recarregar(); aoMudar() }
  const carActual = ativas.find((c) => c.codigo === filtro.caracteristica)

  async function reaplicar() {
    if (!window.confirm('Reaplicar as regras de palavras a todos os produtos? O que foi ajustado à mão (grupo, marca e características) é preservado.')) return
    setOcupado(true); setAviso(null)
    try { const r = await apiGrupos.aplicarRegras(ctx.empresa, true); depois(`${r.processados.toLocaleString('pt-BR')} produtos reavaliados. Ajustes manuais preservados.`) }
    catch (e) { setAviso((e as Error).message) } finally { setOcupado(false) }
  }

  const colunas: Coluna<ProdutoClassificacao>[] = [
    ...(pode ? [{ id: 'sel', titulo: 'Seleção', simples: true, largura: 44, texto: (p: ProdutoClassificacao) => (todosFiltro || sel.has(p.bling_id) ? 'Sim' : 'Não'),
      cabecalho: <input type="checkbox" aria-label="Selecionar a página" checked={paginaToda || todosFiltro} onChange={alternarPagina} />,
      render: (p: ProdutoClassificacao) => <span onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Selecionar ${p.nome}`} checked={todosFiltro || sel.has(p.bling_id)} disabled={todosFiltro} onChange={() => alternarUm(p.bling_id)} /></span> }] : []),
    { id: 'codigo', titulo: 'Código', texto: (p) => p.codigo ?? String(p.bling_id), max: 140 },
    { id: 'nome', titulo: 'Produto', texto: (p) => p.nome, largura: 300 },
    { id: 'grupo', titulo: 'Grupo', texto: (p) => p.grupo_caminho ?? '(sem grupo)', largura: 280, render: (p) => (
      <span style={{ color: ehPendente(p.grupo_codigo) ? 'var(--aviso, #d99a1c)' : undefined }}>{p.grupo_caminho ?? '(sem grupo)'}</span>) },
    { id: 'marca', titulo: 'Marca', texto: (p) => p.marca ?? '' },
    ...ativas.map((c): Coluna<ProdutoClassificacao> => ({ id: `car_${c.codigo}`, titulo: c.rotulo, texto: (p) => p.caracteristicas[c.codigo] ?? '' })),
    { id: 'origem', titulo: 'Origem do grupo', texto: (p) => (p.origem_grupo === 'manual' ? 'Manual' : 'Regra'), oculta: true },
    { id: 'estoque', titulo: 'Estoque', texto: (p) => (p.estoque == null ? '—' : String(p.estoque)), valor: (p) => p.estoque, direita: true, somar: false },
    { id: 'preco', titulo: 'Preço', texto: (p) => (p.preco == null ? '' : brl(p.preco)), valor: (p) => p.preco, direita: true, somar: false },
  ]

  return (
    <div>
      <div className="filtros" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 8px' }}>
        <Busca valor={filtro.busca ?? ''} onMudar={(v) => { const t = v.trim() || undefined; if (t !== filtro.busca) alterarCampo('busca', t) }} placeholder="Buscar por nome ou código…" />
        <select aria-label="Grupo" value={filtro.grupo_id ?? ''} onChange={(e) => alterarCampo('grupo_id', e.target.value || undefined)}>
          <option value="">Todos os grupos</option>
          {ordenados.map((g) => <option key={g.id} value={g.id}>{'  '.repeat(g.grau - 1)}{g.codigo} · {g.nome}</option>)}
        </select>
        <select aria-label="Característica" value={filtro.caracteristica ?? ''} onChange={(e) => alterarCampo('caracteristica', e.target.value || undefined)}>
          <option value="">Qualquer característica</option>
          {ativas.map((c) => <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>)}
        </select>
        {carActual && (carActual.tipo_dado === 'lista'
          ? <select aria-label="Valor" value={filtro.valor ?? ''} onChange={(e) => alterarCampo('valor', e.target.value || undefined)}>
              <option value="">(qualquer valor)</option>{carActual.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          : <input aria-label="Valor" placeholder="valor exato" value={filtro.valor ?? ''} onChange={(e) => alterarCampo('valor', e.target.value || undefined)} style={{ width: 140 }} />)}
        <MarcaInput empresa={ctx.empresa} ariaLabel="Marca" placeholder="Marca" valor={filtro.marca ?? ''} onMudar={(t) => alterarCampo('marca', t || undefined)} largura={140} />
        <select aria-label="Estoque" value={filtro.estoque ?? ''} onChange={(e) => alterarCampo('estoque', e.target.value || undefined)}>
          <option value="">Estoque: todos</option><option value="com">Só com estoque</option><option value="sem">Sem estoque</option>
        </select>
        <select aria-label="Origem do grupo" value={filtro.origem ?? ''} onChange={(e) => alterarCampo('origem', e.target.value || undefined)}>
          <option value="">Origem: todas</option><option value="regra">Pela regra</option><option value="manual">Ajustados à mão</option>
        </select>
        <label className="check"><input type="checkbox" checked={!!filtro.so_pendentes} onChange={(e) => alterarCampo('so_pendentes', e.target.checked)} /> Só “A classificar”</label>
        <label className="check"><input type="checkbox" checked={!!filtro.sem_marca} onChange={(e) => alterarCampo('sem_marca', e.target.checked)} /> Sem marca</label>
        <LimparFiltros ativo={filtroAtivo} onLimpar={() => mudarFiltro({})} />
        {pode && <button type="button" className="sec" disabled={ocupado} onClick={() => { void reaplicar() }} style={{ marginLeft: 'auto' }}>{ocupado ? 'Reaplicando…' : 'Reaplicar regras'}</button>}
      </div>
      {erro && <div className="erro">{erro}</div>}
      {aviso && <div className="aviso" role="status" style={{ margin: '4px 0' }}>{aviso} <button type="button" className="link" onClick={() => setAviso(null)}>fechar</button></div>}
      {pode && qtdSel > 0 && (
        <div role="region" aria-label="Alteração em lote" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', margin: '6px 0', background: 'var(--card2)', border: '1px solid var(--borda)', borderRadius: 10 }}>
          <strong>{qtdSel.toLocaleString('pt-BR')} {qtdSel === 1 ? 'selecionado' : 'selecionados'}</strong>
          {todosFiltro ? <span className="sub">todos do filtro</span>
            : (paginaToda && total > itens.length && total <= 20000 && <button type="button" className="link" onClick={() => setTodosFiltro(true)}>Selecionar todos os {total.toLocaleString('pt-BR')} do filtro</button>)}
          <button type="button" onClick={() => setLote(true)}>Alterar em lote…</button>
          <button type="button" className="sec" onClick={() => { setSel(new Set()); setTodosFiltro(false) }}>Limpar seleção</button>
        </div>)}
      {filtro.estoque && <p className="sub" role="note">Estoque do CRM: unidades disponíveis ou reservadas das Peças. Produto que ainda não virou Peça aparece sem estoque (“—”).</p>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && <GradeDados id="grupos.produtos" titulo="Produtos por grupo" colunas={colunas} linhas={itens} chave={(p) => String(p.bling_id)} altura="62vh"
        vazio={filtroAtivo ? 'Nenhum produto com esses filtros.' : 'Nenhum produto.'} aoClicar={pode ? setUm : undefined} />}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
      {lote && <LoteForm ctx={ctx} grupos={grupos} caract={ativas} qtd={qtdSel}
        ids={todosFiltro ? null : [...sel]} filtro={todosFiltro ? filtro : null} onFechar={() => setLote(false)}
        onSalvo={(n) => depois(`${n.toLocaleString('pt-BR')} produtos alterados. Os campos mudados passam a ser manuais e as regras não os sobrescrevem.`)} />}
      {um && <ProdutoForm ctx={ctx} grupos={grupos} caract={ativas} produto={um} onFechar={() => setUm(null)} onSalvo={() => depois('Produto atualizado.')} />}
    </div>
  )
}

type ModoCampo = 'manter' | 'definir' | 'remover'
function LoteForm({ ctx, grupos, caract, qtd, ids, filtro, onFechar, onSalvo }: {
  ctx: Contexto; grupos: GrupoProduto[]; caract: Caracteristica[]; qtd: number; ids: number[] | null; filtro: FiltroProdutos | null
  onFechar: () => void; onSalvo: (n: number) => void
}) {
  const [grupoId, setGrupoId] = useState('')
  const [marcaModo, setMarcaModo] = useState<ModoCampo>('manter')
  const [marca, setMarca] = useState('')
  const [car, setCar] = useState<Record<string, { modo: ModoCampo; valor: string }>>({})
  const analiticos = useMemo(() => grupos.filter((g) => g.analitico && g.ativo).sort((a, b) => a.caminho_nome.localeCompare(b.caminho_nome, 'pt-BR')), [grupos])
  const setC = (cod: string, p: Partial<{ modo: ModoCampo; valor: string }>) => setCar((s) => ({ ...s, [cod]: { ...(s[cod] ?? { modo: 'manter' as ModoCampo, valor: '' }), ...p } }))

  return (
    <Modal titulo={`Alterar ${qtd.toLocaleString('pt-BR')} ${qtd === 1 ? 'produto' : 'produtos'}`} onFechar={onFechar} larga>
      <Formulario onCancelar={onFechar} enviarRotulo="Aplicar" onEnviar={async () => {
        const dados: DadosLote = {}
        if (grupoId) dados.grupo_id = grupoId
        if (marcaModo === 'definir') { if (!marca.trim()) throw new Error('Informe a marca ou escolha “Manter”.'); dados.marca = marca.trim() }
        if (marcaModo === 'remover') dados.marca = null
        const cs: Record<string, string | null> = {}
        for (const c of caract) {
          const s = car[c.codigo]
          if (!s || s.modo === 'manter') continue
          if (s.modo === 'remover') cs[c.codigo] = null
          else { if (!s.valor.trim()) throw new Error(`Informe o valor de ${c.rotulo} ou escolha “Manter”.`); cs[c.codigo] = s.valor.trim() }
        }
        if (Object.keys(cs).length) dados.caracteristicas = cs
        if (Object.keys(dados).length === 0) throw new Error('Escolha ao menos uma alteração.')
        if (!window.confirm(`Aplicar a ${qtd.toLocaleString('pt-BR')} ${qtd === 1 ? 'produto' : 'produtos'}? Os campos alterados passam a ser manuais.`)) return
        const r = await apiGrupos.alterarLote(ctx.empresa, ids, filtro, dados)
        onSalvo(r.alterados)
      }}>
        <Campo rotulo="Grupo" dica="Só grupos analíticos ativos. Deixe em branco para manter o grupo atual.">
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">(manter)</option>
            {analiticos.map((g) => <option key={g.id} value={g.id}>{g.caminho_nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Marca">
          <span style={{ display: 'flex', gap: 8 }}>
            <select value={marcaModo} onChange={(e) => setMarcaModo(e.target.value as ModoCampo)}>
              <option value="manter">Manter</option><option value="definir">Definir</option><option value="remover">Remover</option></select>
            {marcaModo === 'definir' && <MarcaInput empresa={ctx.empresa} valor={marca} onMudar={setMarca} placeholder="Ex.: Farm" autoFocus />}
          </span>
        </Campo>
        {caract.map((c) => {
          const s = car[c.codigo] ?? { modo: 'manter' as ModoCampo, valor: '' }
          return (
            <Campo key={c.codigo} rotulo={c.rotulo}>
              <span style={{ display: 'flex', gap: 8 }}>
                <select value={s.modo} onChange={(e) => setC(c.codigo, { modo: e.target.value as ModoCampo })}>
                  <option value="manter">Manter</option><option value="definir">Definir</option><option value="remover">Remover</option></select>
                {s.modo === 'definir' && (c.tipo_dado === 'lista'
                  ? <select value={s.valor} onChange={(e) => setC(c.codigo, { valor: e.target.value })}><option value="">(escolha)</option>{c.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  : <input value={s.valor} onChange={(e) => setC(c.codigo, { valor: e.target.value })} />)}
              </span>
            </Campo>)
        })}
        {filtro && <p className="sub">Seleção: todos os produtos do filtro atual ({qtd.toLocaleString('pt-BR')}). Máximo de 20.000 por operação.</p>}
      </Formulario>
    </Modal>
  )
}

function ProdutoForm({ ctx, grupos, caract, produto, onFechar, onSalvo }: {
  ctx: Contexto; grupos: GrupoProduto[]; caract: Caracteristica[]; produto: ProdutoClassificacao; onFechar: () => void; onSalvo: () => void
}) {
  const [grupoId, setGrupoId] = useState(produto.grupo_id ?? '')
  const [marca, setMarca] = useState(produto.marca ?? '')
  const [car, setCar] = useState<Record<string, string>>(() => ({ ...produto.caracteristicas }))
  const analiticos = useMemo(() => grupos.filter((g) => g.analitico && (g.ativo || g.id === produto.grupo_id)).sort((a, b) => a.caminho_nome.localeCompare(b.caminho_nome, 'pt-BR')), [grupos, produto.grupo_id])
  return (
    <Modal titulo={produto.nome} onFechar={onFechar} larga>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        const dados: DadosLote = {}
        if (grupoId && grupoId !== produto.grupo_id) dados.grupo_id = grupoId
        if ((marca.trim() || null) !== (produto.marca ?? null)) dados.marca = marca.trim() || null
        const cs: Record<string, string | null> = {}
        for (const c of caract) {
          const novo = (car[c.codigo] ?? '').trim() || null
          if (novo !== (produto.caracteristicas[c.codigo] ?? null)) cs[c.codigo] = novo
        }
        if (Object.keys(cs).length) dados.caracteristicas = cs
        if (Object.keys(dados).length === 0) return onFechar()
        await apiGrupos.alterarLote(ctx.empresa, [produto.bling_id], null, dados)
        onSalvo()
      }}>
        <p className="sub">Código {produto.codigo ?? produto.bling_id} · grupo atual: {produto.grupo_caminho ?? '(sem grupo)'} ({produto.origem_grupo === 'manual' ? 'ajustado à mão' : 'pela regra'}). O que você alterar aqui passa a ser manual.</p>
        <Campo rotulo="Grupo">
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            {!produto.grupo_id && <option value="">(sem grupo)</option>}
            {analiticos.map((g) => <option key={g.id} value={g.id}>{g.caminho_nome}{g.ativo ? '' : ' (inativo)'}</option>)}
          </select>
        </Campo>
        <CampoMarca empresa={ctx.empresa} valor={marca} onMudar={setMarca} />
        <fieldset style={{ border: '1px solid var(--borda)', borderRadius: 10, padding: '8px 12px' }}>
          <legend>Características</legend>
          {caract.map((c) => (
            <Campo key={c.codigo} rotulo={c.rotulo}>
              {c.tipo_dado === 'lista'
                ? <select value={car[c.codigo] ?? ''} onChange={(e) => setCar((s) => ({ ...s, [c.codigo]: e.target.value }))}>
                    <option value="">(não informado)</option>{c.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                : <input value={car[c.codigo] ?? ''} onChange={(e) => setCar((s) => ({ ...s, [c.codigo]: e.target.value }))} />}
            </Campo>))}
        </fieldset>
      </Formulario>
    </Modal>
  )
}

// ================================================================= Regras: características e palavras
function Regras({ ctx, pode, grupos, caract, aoMudar }: { ctx: Contexto; pode: boolean; grupos: GrupoProduto[]; caract: Caracteristica[]; aoMudar: () => void }) {
  const palavras = useCarregar(() => apiGrupos.palavras(ctx.empresa), [ctx.empresa])
  const [editCar, setEditCar] = useState<Caracteristica | 'nova' | null>(null)
  const [editPal, setEditPal] = useState<PalavraClassificacao | 'nova' | null>(null)

  const colCar: Coluna<Caracteristica>[] = [
    { id: 'codigo', titulo: 'Código', texto: (c) => c.codigo },
    { id: 'rotulo', titulo: 'Característica', texto: (c) => c.rotulo },
    { id: 'tipo', titulo: 'Tipo', texto: (c) => (c.tipo_dado === 'lista' ? 'Lista' : 'Texto livre') },
    { id: 'opcoes', titulo: 'Opções', texto: (c) => c.opcoes.join(', '), largura: 360 },
    { id: 'ativo', titulo: 'Situação', texto: (c) => (c.ativo ? 'Ativa' : 'Inativa') },
    { id: 'acoes', titulo: 'Ações', simples: true, texto: () => '', render: (c) => pode ? <button type="button" className="link" onClick={() => setEditCar(c)}>Editar</button> : null },
  ]
  const destino = (p: PalavraClassificacao) => p.alvo === 'grupo' ? (p.grupo_caminho ?? '') : p.alvo === 'caracteristica' ? `${p.caracteristica}: ${p.valor}` : (p.marca ?? '')
  const colPal: Coluna<PalavraClassificacao>[] = [
    { id: 'alvo', titulo: 'Define', texto: (p) => (p.alvo === 'grupo' ? 'Grupo' : p.alvo === 'caracteristica' ? 'Característica' : 'Marca') },
    { id: 'palavra', titulo: 'Palavra no nome', texto: (p) => p.palavra },
    { id: 'destino', titulo: 'Destino', texto: destino, largura: 320 },
    { id: 'restr', titulo: 'Só nos grupos', texto: (p) => (p.grupos_ids?.length ? String(p.grupos_ids.length) : ''), valor: (p) => p.grupos_ids?.length ?? 0, direita: true, somar: false },
    { id: 'prio', titulo: 'Prioridade', texto: (p) => String(p.prioridade), valor: (p) => p.prioridade, direita: true, somar: false },
    { id: 'ativo', titulo: 'Situação', texto: (p) => (p.ativo ? 'Ativa' : 'Inativa') },
    { id: 'acoes', titulo: 'Ações', simples: true, texto: () => '', render: (p) => pode ? (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" className="link" onClick={() => setEditPal(p)}>Editar</button>
        <button type="button" className="link" onClick={() => {
          if (window.confirm(`Excluir a palavra “${p.palavra}”? Produtos já classificados não mudam.`)) void apiGrupos.excluirPalavra(ctx.empresa, p.id).then(palavras.recarregar).catch((e: Error) => window.alert(e.message))
        }}>Excluir</button>
      </span>) : null },
  ]

  return (
    <div>
      <div className="topo"><h2 style={{ margin: 0, fontSize: '1rem' }}>Características</h2>{pode && <button type="button" onClick={() => setEditCar('nova')}>+ Nova característica</button>}</div>
      <p className="sub">Descrevem a peça sem poluir a árvore (material, comprimento, composição). Aparecem no cadastro do produto e nos filtros.</p>
      <GradeDados id="grupos.caracteristicas" titulo="Características" colunas={colCar} linhas={caract} chave={(c) => c.codigo} altura="30vh" vazio="Nenhuma característica." />
      <div className="topo" style={{ marginTop: 18 }}><h2 style={{ margin: 0, fontSize: '1rem' }}>Palavras de classificação</h2>{pode && <button type="button" onClick={() => setEditPal('nova')}>+ Nova palavra</button>}</div>
      <p className="sub">O motor procura estas palavras no nome do produto para sugerir grupo, marca e características. Depois de mudar, use “Reaplicar regras” na aba Produtos. Edições manuais nunca são sobrescritas.</p>
      {palavras.erro && <div className="erro">{palavras.erro}</div>}
      {palavras.dados && <GradeDados id="grupos.palavras" titulo="Palavras de classificação" colunas={colPal} linhas={palavras.dados} chave={(p) => p.id} altura="52vh" vazio="Nenhuma palavra cadastrada." />}
      {editCar && <CaracteristicaForm ctx={ctx} car={editCar === 'nova' ? null : editCar} onFechar={() => setEditCar(null)} onSalvo={() => { setEditCar(null); aoMudar() }} />}
      {editPal && <PalavraForm ctx={ctx} grupos={grupos} caract={caract} palavra={editPal === 'nova' ? null : editPal} onFechar={() => setEditPal(null)} onSalvo={() => { setEditPal(null); palavras.recarregar() }} />}
    </div>
  )
}

function CaracteristicaForm({ ctx, car, onFechar, onSalvo }: { ctx: Contexto; car: Caracteristica | null; onFechar: () => void; onSalvo: () => void }) {
  const [codigo, setCodigo] = useState(car?.codigo ?? '')
  const [rotulo, setRotulo] = useState(car?.rotulo ?? '')
  const [tipo, setTipo] = useState<'texto' | 'lista'>(car?.tipo_dado ?? 'texto')
  const [opcoes, setOpcoes] = useState((car?.opcoes ?? []).join('\n'))
  const [ativo, setAtivo] = useState(car?.ativo ?? true)
  return (
    <Modal titulo={car ? `Editar · ${car.rotulo}` : 'Nova característica'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        await apiGrupos.salvarCaracteristica(ctx.empresa, { codigo, rotulo, tipo_dado: tipo, ativo,
          opcoes: tipo === 'lista' ? opcoes.split('\n').map((o) => o.trim()).filter(Boolean) : [] })
        onSalvo()
      }}>
        <Campo rotulo="Código" dica="Minúsculas, números e _ (2 a 30). Não muda depois."><input value={codigo} onChange={(e) => setCodigo(e.target.value.toLowerCase())} disabled={!!car} required pattern="[a-z0-9_]{2,30}" /></Campo>
        <Campo rotulo="Rótulo"><input value={rotulo} onChange={(e) => setRotulo(e.target.value)} required /></Campo>
        <Campo rotulo="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'texto' | 'lista')}><option value="texto">Texto livre</option><option value="lista">Lista de opções</option></select>
        </Campo>
        {tipo === 'lista' && <Campo rotulo="Opções" dica="Uma por linha."><textarea rows={6} value={opcoes} onChange={(e) => setOpcoes(e.target.value)} /></Campo>}
        {car && <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Característica ativa</label>}
      </Formulario>
    </Modal>
  )
}

function PalavraForm({ ctx, grupos, caract, palavra, onFechar, onSalvo }: {
  ctx: Contexto; grupos: GrupoProduto[]; caract: Caracteristica[]; palavra: PalavraClassificacao | null; onFechar: () => void; onSalvo: () => void
}) {
  const [alvo, setAlvo] = useState<PalavraClassificacao['alvo']>(palavra?.alvo ?? 'grupo')
  const [texto, setTexto] = useState(palavra?.palavra ?? '')
  const [grupoId, setGrupoId] = useState(palavra?.grupo_id ?? '')
  const [carCod, setCarCod] = useState(palavra?.caracteristica ?? '')
  const [valor, setValor] = useState(palavra?.valor ?? '')
  const [marca, setMarca] = useState(palavra?.marca ?? '')
  const [restritos, setRestritos] = useState<string[]>(palavra?.grupos_ids ?? [])
  const [prioridade, setPrioridade] = useState(String(palavra?.prioridade ?? 100))
  const [ativo, setAtivo] = useState(palavra?.ativo ?? true)
  const analiticos = useMemo(() => grupos.filter((g) => g.analitico && g.ativo).sort((a, b) => a.caminho_nome.localeCompare(b.caminho_nome, 'pt-BR')), [grupos])
  const carSel = caract.find((c) => c.codigo === carCod)
  return (
    <Modal titulo={palavra ? `Editar palavra · ${palavra.palavra}` : 'Nova palavra'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        const dados: Record<string, unknown> = { alvo, palavra: texto, prioridade: Number(prioridade) || 100, ativo }
        if (alvo === 'grupo') dados.grupo_id = grupoId
        if (alvo === 'caracteristica') { dados.caracteristica = carCod; dados.valor = valor; dados.grupos_ids = restritos }
        if (alvo === 'marca') dados.marca = marca
        await apiGrupos.salvarPalavra(ctx.empresa, palavra?.id ?? null, dados)
        onSalvo()
      }}>
        <Campo rotulo="Quando o nome tiver a palavra… define">
          <select value={alvo} onChange={(e) => setAlvo(e.target.value as PalavraClassificacao['alvo'])}>
            <option value="grupo">o grupo</option><option value="caracteristica">uma característica</option><option value="marca">a marca</option></select>
        </Campo>
        <Campo rotulo="Palavra" dica="Sem acento e em maiúsculas é como o motor compara; você pode digitar normalmente."><input value={texto} onChange={(e) => setTexto(e.target.value)} required maxLength={40} autoFocus /></Campo>
        {alvo === 'grupo' && <Campo rotulo="Grupo (analítico)"><select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} required><option value="">(escolha)</option>{analiticos.map((g) => <option key={g.id} value={g.id}>{g.caminho_nome}</option>)}</select></Campo>}
        {alvo === 'caracteristica' && (<>
          <Campo rotulo="Característica"><select value={carCod} onChange={(e) => { setCarCod(e.target.value); setValor('') }} required><option value="">(escolha)</option>{caract.map((c) => <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>)}</select></Campo>
          <Campo rotulo="Valor">{carSel?.tipo_dado === 'lista'
            ? <select value={valor} onChange={(e) => setValor(e.target.value)} required><option value="">(escolha)</option>{carSel.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            : <input value={valor} onChange={(e) => setValor(e.target.value)} required />}</Campo>
          <Campo rotulo="Vale só para os grupos" dica="Opcional. Sem seleção, vale para qualquer grupo."><select multiple size={6} value={restritos} onChange={(e) => setRestritos(Array.from(e.target.selectedOptions, (o) => o.value))}>{analiticos.map((g) => <option key={g.id} value={g.id}>{g.caminho_nome}</option>)}</select></Campo>
        </>)}
        {alvo === 'marca' && <CampoMarca empresa={ctx.empresa} valor={marca} onMudar={setMarca} required />}
        <Campo rotulo="Prioridade" dica="Menor número vence quando duas palavras do grupo aparecem no mesmo nome."><input value={prioridade} onChange={(e) => setPrioridade(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></Campo>
        {palavra && <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Palavra ativa</label>}
      </Formulario>
    </Modal>
  )
}
