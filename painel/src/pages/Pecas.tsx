import { useEffect, useMemo, useRef, useState } from 'react'
import { api, brl, data, numero, type Local, type OpcaoCadastro, type PecaDetalhe } from '../api'
import { apiCampanhas, apiFotos, normalizarFotos, type Campanha, type Foto } from '../apiCatalogo'
import { Abas, Busca, Campo, Formulario, LimparFiltros, Modal, Paginacao, Selo, useCarregar, Vazio } from '../ui'
import { useEstadoTela } from '../abas'
import { Barras, Qr, conteudoQr, imprimirEtiquetas, qrApontaParaUrl } from '../etiquetas'
import { reduzirFoto } from '../fotos'
import { GRUPOS_TAMANHO, tamLabel } from '../tamanhos'
import { apiGrades, ehPadrao, sugerirLocal, tamanhoPorBling, TIPOS_PADRAO, useTiposGrade, type Atributos, type GradeAtributo, type ProdutoBlingSugerido, type ResultadoVinculo, type TipoGrade } from '../apiGrades'
import type { Contexto } from '../App'

const LIMITE = 50
type AbaPeca = 'dados' | 'grade' | 'fotos' | 'etiquetas' | 'campanhas'

const margem = (preco: number | null, custo: number | null) => (preco && custo != null && preco > 0 ? ((preco - custo) / preco) * 100 : null)
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`

export default function Pecas({ ctx }: { ctx: Contexto }) {
  const [busca, setBusca] = useEstadoTela('pecas.busca', '')
  const [offset, setOffset] = useEstadoTela('pecas.offset', 0)
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.pecas(ctx.empresa, busca, offset, LIMITE), [ctx.empresa, busca, offset])
  const [form, setForm] = useState(false)
  const [aberta, setAberta] = useState<{ id: string; aba: AbaPeca } | null>(null)
  const total = dados?.[0]?.total ?? 0

  return (
    <section>
      <div className="topo">
        <div>
          <h1>Peças</h1>
          <p className="sub">Cadastro das peças vendidas: dados, grade de tamanhos, unidades em estoque (cada uma com QR e código de barras próprios), fotos e histórico de campanhas.</p>
        </div>
        {ctx.podeCatalogo && <button onClick={() => setForm(true)}>+ Nova peça</button>}
      </div>
      <div className="filtros">
        <Busca valor={busca} onMudar={(v) => { setOffset(0); setBusca(v) }} placeholder="Buscar por código, nome, marca ou categoria" />
        <LimparFiltros ativo={!!busca} onLimpar={() => { setOffset(0); setBusca('') }} />
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && (
        <Vazio titulo={busca ? 'Nada encontrado' : 'Nenhuma peça cadastrada'}
               texto={busca ? 'Tente outro termo de busca.' : 'Cadastre a primeira peça já com a grade de tamanhos e a quantidade em estoque.'}
               acao={!busca && ctx.podeCatalogo ? <button onClick={() => setForm(true)}>Cadastrar a primeira peça</button> : undefined} />
      )}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th></th><th>Código</th><th>Peça</th><th>Categoria</th><th>Marca</th><th>Condição</th>
              <th className="num">Preço de venda</th>{ctx.veCusto && <th className="num">Custo</th>}<th className="num">Tamanhos</th><th className="num">Unidades (disp. / total)</th></tr></thead>
            <tbody>
              {dados.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => setAberta({ id: p.id, aba: 'dados' })}>
                  <td className="col-foto"><Miniatura url={p.foto_capa} nome={p.nome} /></td><td><code>{p.codigo}</code></td><td>{p.nome}</td><td>{p.categoria ?? '—'}</td><td>{p.marca ?? '—'}</td>
                  <td>{p.condicao === 'nova' ? 'Nova' : 'Usada'}</td><td className="num">{brl(p.preco_tabela)}</td>
                  {ctx.veCusto && <td className="num">{brl(p.custo)}</td>}
                  <td className="num">{p.qtd_variacoes}</td><td className="num">{p.qtd_disponiveis} / {p.qtd_unidades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
      {form && <PecaForm ctx={ctx} peca={null} onFechar={() => setForm(false)} onSalvo={(id, aba) => { setForm(false); recarregar(); setAberta({ id, aba }) }} />}
      {aberta && <PecaDetalheModal ctx={ctx} id={aberta.id} abaInicial={aberta.aba} onFechar={() => { setAberta(null); recarregar() }} />}
    </section>
  )
}

// ---------------------------------------------------------------- Campos de atributos (peça ou tamanho), montados pela configuração do tipo de grade
function CamposAtributos({ defs, valores, onMudar, desabilitado = false }: { defs: GradeAtributo[]; valores: Atributos; onMudar: (v: Atributos) => void; desabilitado?: boolean }) {
  const set = (cod: string, val: string) => { const n = { ...valores }; if (val === '') delete n[cod]; else n[cod] = val; onMudar(n) }
  return (
    <div className="grade2">
      {defs.map((a) => {
        const rotulo = a.unidade ? `${a.rotulo} (${a.unidade})` : a.rotulo
        const atual = valores[a.codigo] == null ? '' : String(valores[a.codigo])
        return (
          <Campo key={a.codigo} rotulo={a.obrigatorio ? `${rotulo} *` : rotulo}>
            {a.tipo_dado === 'lista'
              ? <select value={atual} disabled={desabilitado} onChange={(e) => set(a.codigo, e.target.value)}><option value="">—</option>{a.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : <input value={atual} disabled={desabilitado} inputMode={a.tipo_dado === 'numero' ? 'decimal' : undefined} onChange={(e) => set(a.codigo, e.target.value)} />}
          </Campo>
        )
      })}
    </div>
  )
}
const limparAtributos = (defs: GradeAtributo[], v: Atributos): Atributos =>
  Object.fromEntries(defs.filter((d) => v[d.codigo] != null && String(v[d.codigo]).trim() !== '').map((d) => [d.codigo, v[d.codigo]]))
const faltando = (defs: GradeAtributo[], v: Atributos) => defs.filter((d) => d.obrigatorio && (v[d.codigo] == null || String(v[d.codigo]).trim() === '')).map((d) => d.rotulo)

// ---------------------------------------------------------------- Busca do produto do Bling (para ligar a peça ao cadastro que já existe lá)
function BuscaBling({ empresa, onEscolher }: { empresa: string; onEscolher: (p: ProdutoBlingSugerido) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ProdutoBlingSugerido[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function buscar() {
    if (q.trim().length < 2) { setErro('Digite ao menos 2 letras do nome, o código (SKU) ou a referência.'); return }
    setBusy(true); setErro(null)
    try { setRes(await apiGrades.sugerirProdutosBling(empresa, q.trim())) } catch (e) { setErro((e as Error).message); setRes(null) } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="busca-bling">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, código (SKU) ou referência no Bling" aria-label="Buscar produto no Bling"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }} />
        <button type="button" className="sec" onClick={buscar} disabled={busy}>{busy ? 'Buscando…' : 'Buscar'}</button>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {res && res.length === 0 && <p className="sub">Nenhum produto ativo encontrado. A cópia do Bling pode estar desatualizada.</p>}
      {res && res.length > 0 && (
        <ul className="lista-bling">
          {res.map((p) => (
            <li key={p.bling_id}>
              <div>
                <strong>{p.nome ?? '(sem nome)'}</strong> <code>{p.codigo ?? p.bling_id}</code> <span className="mudo">{p.motivo}</span>
                <div className="mudo">{p.qtd_variacoes > 0 ? `${p.qtd_variacoes} variação(ões): ${p.tamanhos.join(', ') || 'sem tamanho padronizado'}` : 'produto simples'}{p.preco != null ? ` · ${brl(p.preco)}` : ''}</div>
              </div>
              {p.ja_vinculado ? <span className="mudo">já vinculado</span> : <button type="button" className="sec" onClick={() => onEscolher(p)}>Usar este</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Auxiliares: miniatura, prévia de fotos e campo com sugestões
const chaveTexto = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
// Se o texto já existe na lista (ignorando caixa, acento e espaço duplo), usa o nome cadastrado em vez de criar outro.
const nomeExistente = (texto: string, opcoes: OpcaoCadastro[] | null | undefined) =>
  (opcoes ?? []).find((o) => chaveTexto(o.nome) === chaveTexto(texto))?.nome ?? texto.replace(/\s+/g, ' ').trim()

function Miniatura({ url, nome }: { url?: string | null; nome: string }) {
  return url ? <img className="miniatura" src={url} alt={nome} loading="lazy" /> : <span className="miniatura vazia" aria-label="Sem foto">—</span>
}

function PreviaFotos({ arquivos, onRemover }: { arquivos: File[]; onRemover: (i: number) => void }) {
  const urls = useMemo(() => arquivos.map((a) => URL.createObjectURL(a)), [arquivos])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return (
    <div className="previa-fotos">
      {urls.map((u, i) => (
        <div key={u} className="previa-foto">
          <img src={u} alt={`Foto ${i + 1}`} />
          {i === 0 && <span className="selo-capa">Capa</span>}
          <button type="button" className="link" onClick={() => onRemover(i)} aria-label={`Retirar foto ${i + 1}`}>retirar</button>
        </div>
      ))}
    </div>
  )
}

function CampoSugestao({ rotulo, id, valor, opcoes, onMudar, placeholder }: { rotulo: string; id: string; valor: string; opcoes: OpcaoCadastro[]; onMudar: (t: string) => void; placeholder?: string }) {
  const texto = valor.trim()
  const existente = texto ? opcoes.find((o) => chaveTexto(o.nome) === chaveTexto(texto)) : undefined
  const dica = !texto ? (opcoes.length ? 'Escolha da lista ou digite uma nova.' : undefined)
    : existente ? (existente.nome !== valor ? `Vai usar o cadastro existente "${existente.nome}".` : undefined)
    : `"${texto.replace(/\s+/g, ' ')}" ainda não existe: será cadastrada ao salvar.`
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <input list={id} value={valor} placeholder={placeholder} autoComplete="off" onChange={(e) => onMudar(e.target.value)}
             onBlur={() => { if (existente && existente.nome !== valor) onMudar(existente.nome) }} />
      <datalist id={id}>{opcoes.map((o) => <option key={o.id} value={o.nome} />)}</datalist>
    </Campo>
  )
}

// ---------------------------------------------------------------- Formulário (nova peça com grade, ou edição dos dados)
interface PecaEditavel { id: string; codigo: string; nome: string; descricao: string | null; categoria: string | null; marca: string | null
                         condicao: 'nova' | 'usada'; custo: number | null; preco_tabela: number | null; tipo_grade_id?: string | null; atributos?: Atributos }
type AbaForm = 'dados' | 'grade' | 'bling'

function PecaForm({ ctx, peca, onFechar, onSalvo }: { ctx: Contexto; peca: PecaEditavel | null; onFechar: () => void; onSalvo: (id: string, aba: AbaPeca) => void }) {
  const novo = !peca
  const [aba, setAba] = useState<AbaForm>('dados')
  const [v, setV] = useState({
    codigo: peca?.codigo ?? '', nome: peca?.nome ?? '', descricao: peca?.descricao ?? '', categoria: peca?.categoria ?? '',
    marca: peca?.marca ?? '', condicao: peca?.condicao ?? 'nova',
    custo: peca?.custo != null ? String(peca.custo).replace('.', ',') : '', preco: peca?.preco_tabela != null ? String(peca.preco_tabela).replace('.', ',') : '',
  })
  const categorias = useCarregar(() => api.categorias(ctx.empresa), [ctx.empresa])
  const marcas = useCarregar(() => api.marcas(ctx.empresa), [ctx.empresa])
  const [arquivos, setArquivos] = useState<File[]>([])
  const tg = useTiposGrade(ctx.empresa)
  const tipos = (tg.tipos && tg.tipos.length > 0 ? tg.tipos : TIPOS_PADRAO).filter((t) => t.ativo || t.id === peca?.tipo_grade_id)
  const [tipoId, setTipoId] = useState<string | null>(peca?.tipo_grade_id ?? null)   // null = ainda não escolhido (vale a sugestão pelo nome)
  const [attrs, setAttrs] = useState<Atributos>(peca?.atributos ?? {})
  const [bling, setBling] = useState<ProdutoBlingSugerido | null>(null)
  const [grade, setGrade] = useState<Record<string, number>>({})
  const [localId, setLocalId] = useState('')
  const locais = useCarregar(() => (novo && ctx.podeUnidade ? api.locais(ctx.empresa) : Promise.resolve([] as Local[])), [ctx.empresa, novo, ctx.podeUnidade])
  const ativos = (locais.dados ?? []).filter((l) => l.ativo)
  // O que já foi criado numa tentativa que falhou no meio não se repete ao salvar de novo.
  const progresso = useRef<{ peca?: string; grade?: boolean; bling?: boolean; fotos?: boolean; variacoes: Record<string, { id?: string; unidades: boolean }> }>({ variacoes: {} })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  const sugerido = novo && tipoId === null ? sugerirLocal(tipos, v.nome) : undefined
  const escolhidoId = tipoId ?? sugerido?.id ?? ''
  const tipo = tipos.find((t) => t.id === escolhidoId)
  const valoresTipo = tipo?.valores ?? []
  const defsPeca = (tipo?.atributos ?? []).filter((a) => a.nivel === 'peca')
  const rot = (t: string) => valoresTipo.find((x) => x.valor === t)?.rotulo ?? tamLabel(t)

  const precoN = (() => { try { return numero(v.preco) } catch { return null } })()
  const custoN = (() => { try { return numero(v.custo) } catch { return null } })()
  const alertaMargem = precoN != null && custoN != null && precoN <= custoN

  const trocarTipo = (id: string) => { setTipoId(id); setAttrs({}); setGrade({}) }
  const alternar = (t: string) => setGrade((g) => { const n = { ...g }; if (t in n) delete n[t]; else n[t] = 1; return n })
  const tamanhosEscolhidos = valoresTipo.map((x) => x.valor).filter((t) => t in grade)
  const totalUnidades = tamanhosEscolhidos.reduce((s, t) => s + (grade[t] || 0), 0)

  // Escolheu o produto no Bling: preenche o que estiver vazio e já marca os tamanhos que ele tem (sem unidades: o saldo continua no Bling).
  function usarBling(b: ProdutoBlingSugerido) {
    setBling(b)
    setV((x) => ({ ...x, codigo: x.codigo || b.codigo || '', nome: x.nome || b.nome || '', preco: x.preco || (b.preco != null ? String(b.preco).replace('.', ',') : '') }))
    const alvo = tipo ?? sugerirLocal(tipos, b.nome ?? '') ?? tipos.find((t) => b.tamanhos.length > 0 && b.tamanhos.every((s) => tamanhoPorBling(t, s)))
    if (alvo && alvo.id !== tipo?.id) { setTipoId(alvo.id); setAttrs({}) }
    if (alvo) setGrade(Object.fromEntries((b.tamanhos.length ? b.tamanhos : ['U']).flatMap((s) => { const m = tamanhoPorBling(alvo, s); return m ? [[m, 0]] : [] })))
  }

  async function enviar() {
    if (!v.codigo.trim() || !v.nome.trim()) { setAba('dados'); throw new Error('Informe o código e o nome da peça.') }
    const falta = faltando(defsPeca, attrs)
    if (falta.length) { setAba('grade'); throw new Error(`Informe: ${falta.join(', ')}.`) }
    const p = progresso.current
    const id = await api.salvarPeca(ctx.empresa, { id: peca?.id ?? p.peca, ...v, categoria: nomeExistente(v.categoria, categorias.dados), marca: nomeExistente(v.marca, marcas.dados) })
    p.peca = id
    const real = !!escolhidoId && !ehPadrao(escolhidoId)
    if (!p.grade && (real || peca?.tipo_grade_id)) {
      try { await apiGrades.definirGradePeca(ctx.empresa, id, real ? escolhidoId : null, limparAtributos(defsPeca, attrs)); p.grade = true } catch (e) {
        throw new Error(`A peça foi salva, mas o tipo de grade não: ${(e as Error).message}. Corrija e salve de novo.`)
      }
    }
    if (!novo) return onSalvo(id, 'dados')
    if (ctx.podeUnidade && totalUnidades > 0 && ativos.length === 0) {
      throw new Error('A peça foi salva, mas não há local de estoque ativo para criar as unidades. Cadastre um local em Configuração › Locais e salve de novo.')
    }
    const falhas: string[] = []
    for (const tam of tamanhosEscolhidos) {
      const est = p.variacoes[tam] ?? (p.variacoes[tam] = { unidades: false })
      try {
        if (!est.id) est.id = await api.salvarVariacao(ctx.empresa, id, tam)
        if (ctx.podeUnidade && grade[tam] > 0 && !est.unidades) {
          await api.criarUnidades(ctx.empresa, est.id, localId || ativos[0].id, grade[tam], '')
          est.unidades = true
        }
      } catch (e) { falhas.push(`${rot(tam)}: ${(e as Error).message}`) }
    }
    if (falhas.length) throw new Error(`A peça foi salva, mas parte da grade falhou (${falhas.join('; ')}). Salve de novo: o que já foi criado não se repete.`)
    if (bling && !p.bling) {
      try { await apiGrades.vincular(ctx.empresa, id, bling.bling_id); p.bling = true } catch (e) {
        throw new Error(`A peça e a grade foram salvas, mas o vínculo com o Bling falhou: ${(e as Error).message}. Você pode vincular depois, na aba Dados da peça.`)
      }
    }
    if (arquivos.length > 0 && !p.fotos) {
      const enviadas: Foto[] = []
      try {
        for (const arq of arquivos) enviadas.push(await apiFotos.enviar(ctx.empresa, id, await reduzirFoto(arq)))
        await apiFotos.salvar(ctx.empresa, id, enviadas); p.fotos = true
      } catch (e) {
        if (enviadas.length) await apiFotos.remover(enviadas.map((f) => f.path)).catch(() => undefined)
        throw new Error(`A peça foi salva, mas as fotos não: ${(e as Error).message}. Salve de novo, ou retire as fotos daqui e adicione depois na aba Fotos da peça.`)
      }
    }
    const temUnidades = Object.values(p.variacoes).some((x) => x.unidades)
    onSalvo(id, temUnidades ? 'etiquetas' : tamanhosEscolhidos.length ? 'grade' : 'dados')
  }

  const abas: { id: AbaForm; rotulo: string }[] = [{ id: 'dados', rotulo: 'Dados e preço' }, { id: 'grade', rotulo: novo ? 'Tipo, grade e estoque' : 'Tipo de grade' }, ...(novo ? [{ id: 'bling' as AbaForm, rotulo: 'Vínculo com o Bling' }] : [])]
  return (
    <Modal titulo={novo ? 'Nova peça' : 'Editar dados da peça'} onFechar={onFechar} larga>
      <Formulario onCancelar={onFechar} enviarRotulo={novo ? (totalUnidades > 0 ? `Criar peça e ${totalUnidades} unidade${totalUnidades > 1 ? 's' : ''}` : 'Criar peça') : 'Salvar'} onEnviar={enviar}>
        <Abas<AbaForm> ativa={aba} onMudar={setAba} abas={abas} />
        {aba === 'dados' && (<>
          <fieldset className="grupo-form"><legend>Identificação</legend>
            <div className="grade2">
              <Campo rotulo="Código da peça" dica="Único na empresa. Vira o prefixo do código de cada tamanho e unidade. Ex.: VES-001"><input value={v.codigo} onChange={set('codigo')} autoFocus={novo} /></Campo>
              <Campo rotulo="Condição"><select value={v.condicao} onChange={set('condicao')}><option value="nova">Nova</option><option value="usada">Usada</option></select></Campo>
            </div>
            <Campo rotulo="Nome da peça" dica="Como a cliente vai ver. Ex.: Vestido midi floral"><input value={v.nome} onChange={set('nome')} /></Campo>
            <div className="grade2">
              <CampoSugestao rotulo="Categoria" id="lista-categorias" valor={v.categoria} opcoes={categorias.dados ?? []} placeholder="Vestido, blusa, saia…" onMudar={(t) => setV((x) => ({ ...x, categoria: t }))} />
              <CampoSugestao rotulo="Marca" id="lista-marcas" valor={v.marca} opcoes={marcas.dados ?? []} onMudar={(t) => setV((x) => ({ ...x, marca: t }))} />
            </div>
            <Campo rotulo="Descrição"><textarea value={v.descricao} onChange={set('descricao')} rows={2} placeholder="Medidas, tecido, detalhes e defeitos" /></Campo>
          </fieldset>
          {novo && (
            <fieldset className="grupo-form"><legend>Fotos</legend>
              <p className="sub">Opcional. As fotos são reduzidas e enviadas ao salvar a peça; a primeira é a capa.</p>
              <input type="file" accept="image/*" multiple onChange={(e) => { const novas = Array.from(e.target.files ?? []); setArquivos((a) => [...a, ...novas].slice(0, 12)); e.target.value = '' }} />
              {arquivos.length > 0 && <PreviaFotos arquivos={arquivos} onRemover={(i) => setArquivos((a) => a.filter((_, j) => j !== i))} />}
            </fieldset>
          )}
          <fieldset className="grupo-form"><legend>Preço e custo</legend>
            <div className="grade2">
              <Campo rotulo="Preço de venda (R$)"><input value={v.preco} onChange={set('preco')} inputMode="decimal" placeholder="0,00" /></Campo>
              <Campo rotulo="Custo (R$)"><input value={v.custo} onChange={set('custo')} inputMode="decimal" placeholder="0,00" /></Campo>
            </div>
            {alertaMargem && <div className="aviso-caixa">O preço de venda está igual ou abaixo do custo. Confira os valores antes de salvar.</div>}
            {!alertaMargem && precoN != null && custoN != null && margem(precoN, custoN) != null && <p className="sub">Margem bruta: <strong>{pct(margem(precoN, custoN) as number)}</strong></p>}
          </fieldset>
        </>)}
        {aba === 'grade' && (
          <fieldset className="grupo-form"><legend>Tipo de grade</legend>
            {tg.pendente && <div className="aviso-caixa">Usando a lista padrão (aguardando a migration 0025): o tipo e os detalhes não serão gravados por enquanto; os tamanhos sim.</div>}
            <Campo rotulo="Tipo de peça" dica={sugerido ? `Sugerido pelo nome "${v.nome.split(' ')[0]}": ${sugerido.nome}. Confirme ou troque.` : 'Define os tamanhos possíveis e os detalhes pedidos (cor, material, medidas…).'}>
              <select value={escolhidoId} onChange={(e) => trocarTipo(e.target.value)}>
                <option value="">Escolha…</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Campo>
            {tipo?.descricao && <p className="sub">{tipo.descricao}</p>}
            {defsPeca.length > 0 && <CamposAtributos defs={defsPeca} valores={attrs} onMudar={setAttrs} />}
            {!novo && <p className="sub">Trocar o tipo não altera os tamanhos que a peça já tem; os detalhes do tipo anterior deixam de valer.</p>}
            {novo && tipo && tipo.controla_tamanho && (<>
              <h4 className="subtitulo">Tamanhos e estoque</h4>
              <p className="sub">Marque os tamanhos que a peça tem. Cada unidade física ganha um código único, com QR e código de barras para a etiqueta.</p>
              <div className="chips">{valoresTipo.map((x) => (
                <button key={x.valor} type="button" className={x.valor in grade ? 'chip sel' : 'chip'} aria-pressed={x.valor in grade} onClick={() => alternar(x.valor)}>{x.rotulo}</button>))}</div>
              {tamanhosEscolhidos.length > 0 && ctx.podeUnidade && (
                <div className="grade-qtd">
                  <div className="grade2">
                    <Campo rotulo="Local de estoque" dica="Onde as unidades vão ficar agora.">
                      <select value={localId || ativos[0]?.id || ''} onChange={(e) => setLocalId(e.target.value)}>
                        {ativos.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.vendavel ? '' : ' (não vendável)'}</option>)}
                      </select>
                    </Campo>
                  </div>
                  <table className="compacta"><thead><tr><th>Tamanho</th><th className="num">Quantidade de unidades</th></tr></thead><tbody>
                    {tamanhosEscolhidos.map((t) => (
                      <tr key={t}><td><strong>{rot(t)}</strong></td>
                        <td className="num"><input className="qtd" type="number" min={0} max={200} value={grade[t]} aria-label={`Quantidade do tamanho ${rot(t)}`}
                          onChange={(e) => setGrade((g) => ({ ...g, [t]: Math.max(0, Math.min(200, Number(e.target.value) || 0)) }))} /></td></tr>
                    ))}
                  </tbody></table>
                  <p className="sub">Quantidade 0 cria só o tamanho, sem unidades (dá para adicionar depois).</p>
                </div>
              )}
              {tamanhosEscolhidos.length > 0 && !ctx.podeUnidade && <p className="sub">Seu perfil cria só os tamanhos; as unidades são criadas por quem cuida do estoque.</p>}
              {tipo.atributos.some((a) => a.nivel === 'variacao') && <p className="sub">As medidas de cada tamanho ({tipo.atributos.filter((a) => a.nivel === 'variacao').map((a) => a.rotulo.toLowerCase()).join(', ')}) são preenchidas depois, na aba Grade e estoque da peça.</p>}
            </>)}
            {novo && tipo && !tipo.controla_tamanho && <p className="sub">Este tipo não controla estoque por tamanho. Crie a peça e adicione as unidades depois.</p>}
            {novo && !tipo && <p className="sub">Escolha o tipo para ver os tamanhos.</p>}
          </fieldset>
        )}
        {aba === 'bling' && (
          <fieldset className="grupo-form"><legend>Vínculo com o Bling</legend>
            <p className="sub">Se esta peça já existe no Bling, busque o cadastro e ligue os dois: o código, o nome, o preço e os tamanhos são preenchidos para você. Nada é gravado no Bling.</p>
            {bling
              ? <div className="info"><strong>{bling.nome}</strong> <code>{bling.codigo ?? bling.bling_id}</code> · {bling.tamanhos.join(', ') || 'produto simples'}
                  <button type="button" className="link" onClick={() => setBling(null)}>trocar</button></div>
              : <BuscaBling empresa={ctx.empresa} onEscolher={(b) => { usarBling(b); setAba('grade') }} />}
          </fieldset>
        )}
      </Formulario>
    </Modal>
  )
}

// Liga (ou desliga) uma peça já criada ao produto do Bling.
function VinculoBlingForm({ ctx, peca, onFechar, onSalvo }: { ctx: Contexto; peca: string; onFechar: () => void; onSalvo: () => void }) {
  const [res, setRes] = useState<ResultadoVinculo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  async function ligar(b: ProdutoBlingSugerido) {
    setErro(null)
    try { setRes(await apiGrades.vincular(ctx.empresa, peca, b.bling_id)) } catch (e) { setErro((e as Error).message) }
  }
  return (
    <Modal titulo="Vincular ao produto do Bling" onFechar={res ? onSalvo : onFechar}>
      {!res && <BuscaBling empresa={ctx.empresa} onEscolher={ligar} />}
      {erro && <div className="erro">{erro}</div>}
      {res && (
        <div>
          <div className="info">Vinculado. {res.variacoes_vinculadas ?? 0} tamanho(s) ligado(s) ao Bling.</div>
          {(res.tamanhos_da_peca_sem_par_no_bling?.length ?? 0) > 0 && <p className="sub">Tamanhos da peça sem par no Bling: {res.tamanhos_da_peca_sem_par_no_bling?.join(', ')}.</p>}
          {(res.tamanhos_do_bling_sem_par_na_peca?.length ?? 0) > 0 && <p className="sub">Tamanhos do Bling que a peça não tem: {res.tamanhos_do_bling_sem_par_na_peca?.join(', ')}. Adicione na aba Grade e estoque.</p>}
          <button onClick={onSalvo}>Fechar</button>
        </div>
      )}
    </Modal>
  )
}

// Medidas (atributos por tamanho) de uma variação.
function MedidasForm({ ctx, tipo, variacao, tamanho, inicial, onFechar, onSalvo }: { ctx: Contexto; tipo: TipoGrade; variacao: string; tamanho: string; inicial: Atributos; onFechar: () => void; onSalvo: () => void }) {
  const defs = tipo.atributos.filter((a) => a.nivel === 'variacao')
  const [vals, setVals] = useState<Atributos>(inicial)
  return (
    <Modal titulo={`Medidas · tamanho ${tamanho}`} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        const falta = faltando(defs, vals)
        if (falta.length) throw new Error(`Informe: ${falta.join(', ')}.`)
        await apiGrades.atributosVariacao(ctx.empresa, variacao, limparAtributos(defs, vals)); onSalvo()
      }}>
        <CamposAtributos defs={defs} valores={vals} onMudar={setVals} />
      </Formulario>
    </Modal>
  )
}

// ---------------------------------------------------------------- Detalhe da peça (abas)
function PecaDetalheModal({ ctx, id, abaInicial, onFechar }: { ctx: Contexto; id: string; abaInicial: AbaPeca; onFechar: () => void }) {
  const { dados, erro, recarregar } = useCarregar(() => api.peca(ctx.empresa, id), [ctx.empresa, id])
  const [aba, setAba] = useState<AbaPeca>(abaInicial)
  const [acao, setAcao] = useState<'editar' | 'variacao' | 'vinculo' | { unidades: string } | { medidas: string } | null>(null)
  const tg = useTiposGrade(ctx.empresa)
  const tipo = dados?.peca.tipo_grade_id ? tg.tipos?.find((t) => t.id === dados.peca.tipo_grade_id) : undefined
  const unidadesTotal = dados ? dados.variacoes.reduce((s, va) => s + va.unidades.length, 0) : undefined
  const fotos = dados ? normalizarFotos(dados.peca.fotos) : []

  return (
    <Modal titulo={dados ? `${dados.peca.nome}` : 'Peça'} onFechar={onFechar} larga>
      {erro && <div className="erro">{erro}</div>}
      {dados && (
        <div className="detalhe">
          <p className="sub" style={{ marginTop: '-.6rem', marginBottom: '.8rem' }}>Código <code>{dados.peca.codigo}</code></p>
          <Abas<AbaPeca> ativa={aba} onMudar={setAba} abas={[
            { id: 'dados', rotulo: 'Dados' },
            { id: 'grade', rotulo: 'Grade e estoque', contagem: dados.variacoes.length },
            { id: 'fotos', rotulo: 'Fotos', contagem: fotos.length },
            { id: 'etiquetas', rotulo: 'Etiquetas (QR e barras)', contagem: unidadesTotal },
            { id: 'campanhas', rotulo: 'Campanhas' },
          ]} />
          {aba === 'dados' && <DadosAba ctx={ctx} dados={dados} tipo={tipo} onEditar={() => setAcao('editar')} onVincular={() => setAcao('vinculo')} onDesvincular={async () => { await apiGrades.vincular(ctx.empresa, id, null); recarregar() }} />}
          {aba === 'grade' && <GradeAba ctx={ctx} dados={dados} tipo={tipo} onNovoTamanho={() => setAcao('variacao')} onUnidades={(va) => setAcao({ unidades: va })} onMedidas={(va) => setAcao({ medidas: va })} />}
          {aba === 'fotos' && <FotosAba ctx={ctx} peca={id} fotosIniciais={fotos} onMudou={recarregar} />}
          {aba === 'etiquetas' && <EtiquetasAba dados={dados} irParaGrade={() => setAba('grade')} />}
          {aba === 'campanhas' && <CampanhasAba ctx={ctx} peca={id} />}
          {acao === 'editar' && <PecaForm ctx={ctx} peca={{ ...dados.peca }} onFechar={() => setAcao(null)} onSalvo={() => { setAcao(null); recarregar() }} />}
          {acao === 'vinculo' && <VinculoBlingForm ctx={ctx} peca={id} onFechar={() => setAcao(null)} onSalvo={() => { setAcao(null); recarregar() }} />}
          {acao && typeof acao === 'object' && 'medidas' in acao && tipo && (() => { const va = dados.variacoes.find((x) => x.id === acao.medidas); return va ? <MedidasForm ctx={ctx} tipo={tipo} variacao={va.id} tamanho={tamLabel(va.tamanho)} inicial={(va.atributos ?? {}) as Atributos} onFechar={() => setAcao(null)} onSalvo={() => { setAcao(null); recarregar() }} /> : null })()}
          {acao === 'variacao' && <VariacaoForm tipo={tipo} ctx={ctx} peca={id} usados={dados.variacoes.map((x) => x.tamanho)} onFechar={() => setAcao(null)} onSalvo={() => { setAcao(null); recarregar() }} />}
          {acao && typeof acao === 'object' && 'unidades' in acao && <UnidadesForm ctx={ctx} detalhe={dados} variacao={acao.unidades} onFechar={() => setAcao(null)}
                                                            onSalvo={() => { setAcao(null); recarregar(); setAba('etiquetas') }} />}
        </div>
      )}
    </Modal>
  )
}

function DadosAba({ ctx, dados, tipo, onEditar, onVincular, onDesvincular }: { ctx: Contexto; dados: PecaDetalhe; tipo?: TipoGrade; onEditar: () => void; onVincular: () => void; onDesvincular: () => Promise<void> }) {
  const p = dados.peca
  const m = margem(p.preco_tabela, p.custo)
  return (
    <div>
      <dl className="ficha">
        <div><dt>Preço de venda</dt><dd>{brl(p.preco_tabela)}</dd></div>
        {ctx.veCusto && <div><dt>Custo</dt><dd>{brl(p.custo)}</dd></div>}
        {ctx.veCusto && <div><dt>Margem bruta</dt><dd>{m == null ? '—' : <span className={m <= 0 ? 'texto-erro' : ''}>{pct(m)}</span>}</dd></div>}
        <div><dt>Condição</dt><dd>{p.condicao === 'nova' ? 'Nova' : 'Usada'}</dd></div>
        <div><dt>Categoria</dt><dd>{p.categoria ?? '—'}</dd></div>
        <div><dt>Marca</dt><dd>{p.marca ?? '—'}</dd></div>
        <div><dt>Tipo de grade</dt><dd>{tipo?.nome ?? '—'}</dd></div>
        {(tipo?.atributos ?? []).filter((a) => a.nivel === 'peca').map((a) => {
          const val = (p.atributos ?? {})[a.codigo]
          return <div key={a.codigo}><dt>{a.rotulo}</dt><dd>{val == null ? '—' : `${val}${a.unidade ? ` ${a.unidade}` : ''}`}</dd></div>
        })}
        <div><dt>Bling</dt><dd>{dados.bling ? <>{dados.bling.nome ?? dados.bling.bling_id} <code>{dados.bling.codigo ?? dados.bling.bling_id}</code></> : 'Não vinculada'}</dd></div>
        <div><dt>Última alteração</dt><dd>{data(p.atualizado_em)}</dd></div>
      </dl>
      {p.descricao ? <p>{p.descricao}</p> : <p className="sub">Sem descrição.</p>}
      {ctx.podeCatalogo && <div className="acoes-topo"><button className="sec" onClick={onEditar}>Editar dados</button>
        {dados.bling ? <button className="sec" onClick={() => { void onDesvincular() }}>Desvincular do Bling</button> : <button className="sec" onClick={onVincular}>Vincular ao Bling</button>}</div>}
    </div>
  )
}

function GradeAba({ ctx, dados, tipo, onNovoTamanho, onUnidades, onMedidas }: { ctx: Contexto; dados: PecaDetalhe; tipo?: TipoGrade; onNovoTamanho: () => void; onUnidades: (variacao: string) => void; onMedidas: (variacao: string) => void }) {
  const defsVar = (tipo?.atributos ?? []).filter((a) => a.nivel === 'variacao')
  return (
    <div>
      <div className="acoes-topo" style={{ marginTop: 0 }}>
        {ctx.podeCatalogo && <button className="sec" onClick={onNovoTamanho}>+ Tamanho</button>}
      </div>
      {dados.variacoes.length === 0 && <Vazio titulo="Sem tamanhos" texto="Adicione os tamanhos da peça (P, M, G, 38… ou Único) para poder registrar unidades em estoque." />}
      {dados.variacoes.map((va) => {
        const disp = va.unidades.filter((u) => u.estado === 'disponivel').length
        return (
          <div key={va.id} className="bloco">
            <div className="bloco-topo">
              <strong>Tamanho {tamLabel(va.tamanho)}</strong> <code>{va.codigo}</code>
              <span className="mudo">{disp} disponíve{disp === 1 ? 'l' : 'is'} · {va.unidades.length} no total</span>
              {ctx.podeUnidade && <button className="link" onClick={() => onUnidades(va.id)}>+ Unidades</button>}
              {ctx.podeCatalogo && defsVar.length > 0 && <button className="link" onClick={() => onMedidas(va.id)}>Medidas</button>}
            </div>
            {defsVar.length > 0 && <p className="sub" style={{ margin: '.2rem 0 .5rem' }}>{defsVar.map((a) => { const x = (va.atributos ?? {})[a.codigo]; return x == null ? null : `${a.rotulo} ${x}${a.unidade ? ` ${a.unidade}` : ''}` }).filter(Boolean).join(' · ') || 'Sem medidas informadas.'}</p>}
            {va.unidades.length > 0 && (
              <table className="compacta"><thead><tr><th>Código da unidade</th><th>Situação</th><th>Local</th><th>Observação</th></tr></thead><tbody>
                {va.unidades.map((u) => (
                  <tr key={u.id}><td><code>{u.codigo}</code></td><td><Selo estado={u.estado} /></td><td>{u.local_nome}</td><td className="mudo">{u.observacao ?? ''}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Fotos
function FotosAba({ ctx, peca, fotosIniciais, onMudou }: { ctx: Contexto; peca: string; fotosIniciais: Foto[]; onMudou: () => void }) {
  const [fotos, setFotos] = useState<Foto[]>(fotosIniciais)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(novas: Foto[]) {
    await apiFotos.salvar(ctx.empresa, peca, novas)
    setFotos(novas); onMudou()
  }
  async function enviar(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    setOcupado(true); setErro(null)
    const enviadas: Foto[] = []
    try {
      for (const arq of Array.from(lista)) enviadas.push(await apiFotos.enviar(ctx.empresa, peca, await reduzirFoto(arq)))
      await gravar([...fotos, ...enviadas])
    } catch (e) {
      // Foto enviada mas não gravada na peça vira lixo no depósito: remove.
      if (enviadas.length) await apiFotos.remover(enviadas.map((f) => f.path)).catch(() => undefined)
      setErro((e as Error).message)
    } finally { setOcupado(false) }
  }
  async function principal(i: number) {
    setOcupado(true); setErro(null)
    try { await gravar([fotos[i], ...fotos.filter((_, j) => j !== i)]) } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  async function remover(i: number) {
    if (!confirm('Remover esta foto da peça?')) return
    setOcupado(true); setErro(null)
    try {
      const alvo = fotos[i]
      await gravar(fotos.filter((_, j) => j !== i))
      if (alvo.path) await apiFotos.remover([alvo.path]).catch(() => undefined)
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }

  return (
    <div>
      {ctx.podeCatalogo && (
        <div className="acoes-topo" style={{ marginTop: 0 }}>
          <label className={ocupado ? 'botao-arquivo desativado' : 'botao-arquivo'}>
            {ocupado ? 'Enviando…' : '+ Adicionar fotos'}
            <input type="file" accept="image/*" multiple hidden disabled={ocupado} onChange={(e) => { void enviar(e.target.files); e.target.value = '' }} />
          </label>
          <span className="sub">A primeira foto é a principal. As imagens são reduzidas para no máximo 1600 px antes do envio.</span>
        </div>
      )}
      {erro && <div className="erro" role="alert">{erro}</div>}
      {fotos.length === 0 ? <Vazio titulo="Sem fotos" texto="As fotos aparecem na página pública da peça e vão para o cadastro no Bling." />
        : (
          <div className="fotos-grade">
            {fotos.map((f, i) => (
              <figure key={f.url} className="foto">
                <img src={f.url} alt={`Foto ${i + 1}`} loading="lazy" />
                {i === 0 && <span className="foto-principal">Principal</span>}
                {ctx.podeCatalogo && (
                  <figcaption>
                    {i > 0 && <button type="button" className="link" disabled={ocupado} onClick={() => void principal(i)}>Tornar principal</button>}
                    <button type="button" className="link perigo" disabled={ocupado} onClick={() => void remover(i)}>Remover</button>
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
    </div>
  )
}

// ---------------------------------------------------------------- Etiquetas: QR e código de barras por unidade
function EtiquetasAba({ dados, irParaGrade }: { dados: PecaDetalhe; irParaGrade: () => void }) {
  const unidades = dados.variacoes.flatMap((va) => va.unidades.map((u) => ({ ...u, tamanho: va.tamanho })))
  const [sel, setSel] = useState<Set<string>>(() => new Set(unidades.filter((u) => u.estado === 'disponivel').map((u) => u.id)))
  const [erro, setErro] = useState<string | null>(null)
  if (unidades.length === 0) {
    return <Vazio titulo="Sem unidades ainda" texto="Cada unidade física ganha um código único, com QR e código de barras para a etiqueta. Crie as unidades na aba Grade e estoque."
                  acao={<button className="sec" onClick={irParaGrade}>Ir para Grade e estoque</button>} />
  }
  const marcar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const imprimir = () => {
    setErro(null)
    const preco = dados.peca.preco_tabela != null ? brl(dados.peca.preco_tabela) : null
    const lista = unidades.filter((u) => sel.has(u.id)).map((u) => ({ codigo: u.codigo, titulo: dados.peca.nome, tamanho: tamLabel(u.tamanho), preco, marca: dados.peca.marca }))
    if (lista.length === 0) return setErro('Marque pelo menos uma unidade.')
    if (!imprimirEtiquetas(lista)) setErro('O navegador bloqueou a janela de impressão. Libere pop-ups para este endereço e tente de novo.')
  }
  return (
    <div>
      <div className="acoes-topo" style={{ marginTop: 0 }}>
        <button onClick={imprimir} disabled={sel.size === 0}>Imprimir {sel.size} etiqueta{sel.size === 1 ? '' : 's'}</button>
        <button className="sec" onClick={() => setSel(new Set(unidades.map((u) => u.id)))}>Marcar todas</button>
        <button className="sec" onClick={() => setSel(new Set())}>Limpar</button>
      </div>
      <p className="sub">
        {qrApontaParaUrl
          ? 'O QR de cada unidade abre a página pública da peça. O código de barras (Code 128) leva o código único da unidade.'
          : 'O QR e o código de barras (Code 128) levam o código único da unidade, que serve para bipar na venda da loja física e na reserva da live. Quando a página pública da peça existir, o QR passa a abrir essa página.'}
        {' '}Etiqueta de 60 × 40 mm, uma por página.
      </p>
      {erro && <div className="erro" role="alert">{erro}</div>}
      <div className="etq-grade">
        {unidades.map((u) => (
          <label key={u.id} className={sel.has(u.id) ? 'etq sel' : 'etq'}>
            <input type="checkbox" checked={sel.has(u.id)} onChange={() => marcar(u.id)} aria-label={`Selecionar ${u.codigo}`} />
            <div className="etq-corpo">
              <Qr valor={u.codigo} tam={96} />
              <div className="etq-info">
                <strong>Tam. {tamLabel(u.tamanho)}</strong>
                <Selo estado={u.estado} />
                <span className="mudo" title={conteudoQr(u.codigo)}>{u.local_nome}</span>
              </div>
            </div>
            <Barras valor={u.codigo} largura={200} altura={34} />
            <code className="etq-cod">{u.codigo}</code>
          </label>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Campanhas (histórico de links de postagem e de live)
const SIT_PEDIDO: Record<string, string> = {
  pago: 'Pago', contato_ok: 'Cliente cadastrada', criado_no_bling: 'Pedido no Bling', situacao_ok: 'Em processamento', nfe_gerada: 'NF gerada',
  nfe_enviada: 'NF enviada', nfe_autorizada: 'NF autorizada', expedido: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado', revisao_manual: 'Em revisão',
}

function CampanhasAba({ ctx, peca }: { ctx: Contexto; peca: string }) {
  const { dados, erro, carregando } = useCarregar(() => apiCampanhas.historico(ctx.empresa, peca), [ctx.empresa, peca])
  const [aberta, setAberta] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  if (erro) {
    const pendente = erro.includes('migration 0022')
    return (
      <div>
        <div className={pendente ? 'aviso-caixa' : 'erro'}>{pendente ? 'O histórico de campanhas está preparado na tela, mas ainda não foi habilitado no banco (migration 0022 aguardando aprovação). Assim que for aplicada, os links de postagem e de live desta peça aparecem aqui, com as compras de cada link.' : erro}</div>
        {pendente && <Vazio titulo="Histórico de campanhas" texto="Por link: tipo (postagem ou live), data, endereço do link, e o detalhe de quem comprou — cliente, data e hora, valor, pedido e nota fiscal." />}
      </div>
    )
  }
  if (carregando && !dados) return <p className="sub">Carregando…</p>
  if (!dados || dados.length === 0) {
    return <Vazio titulo="Esta peça ainda não participou de campanhas" texto="Quando a peça for incluída numa live ou tiver um link de venda numa postagem, o histórico aparece aqui, com as compras de cada link." />
  }
  const totalCompras = dados.reduce((s, c) => s + c.qtd_compras, 0)
  const totalValor = dados.reduce((s, c) => s + c.valor_total, 0)
  const copiar = async (c: Campanha) => { if (c.link_url) { await navigator.clipboard.writeText(c.link_url).catch(() => undefined); setCopiado(c.id); setTimeout(() => setCopiado(null), 1500) } }
  return (
    <div>
      <dl className="ficha">
        <div><dt>Campanhas</dt><dd>{dados.length}</dd></div>
        <div><dt>Compras</dt><dd>{totalCompras}</dd></div>
        <div><dt>Valor vendido</dt><dd>{brl(totalValor)}</dd></div>
      </dl>
      {dados.map((c) => {
        const aberto = aberta === c.id
        return (
          <div key={c.id} className="camp">
            <button type="button" className="camp-topo" aria-expanded={aberto} onClick={() => setAberta(aberto ? null : c.id)}>
              <span className={c.tipo === 'live' ? 'pill pill-ok' : 'pill'}>{c.tipo === 'live' ? 'Live' : 'Postagem'}</span>
              <strong>{c.titulo}</strong>
              <span className="mudo">{c.data ? data(c.data) : ''}</span>
              <span className="camp-resumo">{c.qtd_compras} compra{c.qtd_compras === 1 ? '' : 's'} · {brl(c.valor_total)}</span>
              <span aria-hidden="true">{aberto ? '▴' : '▾'}</span>
            </button>
            {aberto && (
              <div className="camp-corpo">
                {c.link_url && (
                  <div className="copiavel-linha"><code>{c.link_url}</code>
                    <button type="button" className="sec" onClick={() => void copiar(c)}>{copiado === c.id ? 'Copiado' : 'Copiar link'}</button>
                    <a className="botao sec" href={c.link_url} target="_blank" rel="noreferrer noopener">Abrir</a></div>
                )}
                {c.url_externa && <p className="sub">{c.tipo === 'live' ? 'Transmissão' : 'Postagem'}: <a href={c.url_externa} target="_blank" rel="noreferrer noopener">{c.url_externa}</a></p>}
                {c.compras.length === 0 ? <p className="sub">Nenhuma compra neste link até agora.</p> : (
                  <div className="tabela-rolavel">
                    <table className="compacta"><thead><tr><th>Cliente</th><th>Data e hora</th><th>Tamanho / unidade</th><th className="num">Valor</th><th>Pedido</th><th>Situação</th><th>Nota fiscal</th><th>Link de pagamento</th></tr></thead><tbody>
                      {c.compras.map((x, i) => (
                        <tr key={`${x.pedido_numero ?? 'sem'}-${i}`}>
                          <td>{x.cliente_nome ?? '—'}{x.cliente_instagram && <span className="mudo"> @{x.cliente_instagram}</span>}</td>
                          <td>{x.comprado_em ? data(x.comprado_em) : '—'}</td>
                          <td>{x.tamanho ? tamLabel(x.tamanho) : '—'} <code>{x.unidade_codigo ?? ''}</code></td>
                          <td className="num">{brl(x.valor)}</td>
                          <td>{x.pedido_numero ?? '—'}</td>
                          <td>{SIT_PEDIDO[x.pedido_estado ?? ''] ?? x.pedido_estado ?? '—'}</td>
                          <td>{x.nfe_numero ? `Nº ${x.nfe_numero}` : <span className="mudo">—</span>}</td>
                          <td>{x.link_pagamento ? <a href={x.link_pagamento} target="_blank" rel="noreferrer noopener">Abrir</a> : <span className="mudo">—</span>}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Formulários auxiliares
function VariacaoForm({ ctx, peca, tipo, usados, onFechar, onSalvo }: { ctx: Contexto; peca: string; tipo?: TipoGrade; usados: string[]; onFechar: () => void; onSalvo: () => void }) {
  const grupos = tipo ? [{ grupo: tipo.nome, itens: tipo.valores.map((x) => x.valor) }] : GRUPOS_TAMANHO
  const livres = grupos.map((g) => ({ ...g, itens: g.itens.filter((t) => !usados.includes(t)) })).filter((g) => g.itens.length > 0)
  const rotulo = (t: string) => tipo?.valores.find((x) => x.valor === t)?.rotulo ?? tamLabel(t)
  const [tamanho, setTamanho] = useState(livres[0]?.itens[0] ?? '')
  return (
    <Modal titulo="Novo tamanho" onFechar={onFechar}>
      {livres.length === 0 ? <Vazio titulo="Todos os tamanhos da lista já estão na peça" texto="Se precisar de outro tamanho, inclua em Configuração › Grades e atributos." /> : (
        <Formulario onCancelar={onFechar} onEnviar={async () => { await api.salvarVariacao(ctx.empresa, peca, tamanho); onSalvo() }}>
          <Campo rotulo="Tamanho" dica="Lista padrão do cadastro. O código do tamanho é gerado a partir do código da peça.">
            <select value={tamanho} onChange={(e) => setTamanho(e.target.value)} autoFocus>
              {livres.map((g) => <optgroup key={g.grupo} label={g.grupo}>{g.itens.map((t) => <option key={t} value={t}>{rotulo(t)}</option>)}</optgroup>)}
            </select>
          </Campo>
        </Formulario>
      )}
    </Modal>
  )
}

function UnidadesForm({ ctx, detalhe, variacao, onFechar, onSalvo }: { ctx: Contexto; detalhe: PecaDetalhe; variacao: string; onFechar: () => void; onSalvo: () => void }) {
  const locais = useCarregar(() => api.locais(ctx.empresa), [ctx.empresa])
  const ativos = (locais.dados ?? []).filter((l) => l.ativo)
  const [local, setLocal] = useState('')
  const [qtd, setQtd] = useState('1')
  const [obs, setObs] = useState('')
  const va = detalhe.variacoes.find((x) => x.id === variacao)
  return (
    <Modal titulo={`Adicionar unidades · tamanho ${va ? tamLabel(va.tamanho) : ''}`} onFechar={onFechar}>
      {locais.dados && ativos.length === 0 ? (
        <Vazio titulo="Nenhum local ativo" texto="Cadastre um local em Configuração › Locais antes de criar unidades." />
      ) : (
        <Formulario onCancelar={onFechar} enviarRotulo="Criar unidades"
                    onEnviar={async () => { await api.criarUnidades(ctx.empresa, variacao, local || ativos[0].id, Number(qtd), obs); onSalvo() }}>
          <div className="grade2">
            <Campo rotulo="Quantidade" dica="De 1 a 200. Cada unidade ganha um código único, com QR e código de barras.">
              <input type="number" min={1} max={200} value={qtd} onChange={(e) => setQtd(e.target.value)} required autoFocus />
            </Campo>
            <Campo rotulo="Local de estoque">
              <select value={local || ativos[0]?.id || ''} onChange={(e) => setLocal(e.target.value)}>
                {ativos.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </Campo>
          </div>
          <Campo rotulo="Observação (opcional)"><input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: pequena mancha na barra" /></Campo>
        </Formulario>
      )}
    </Modal>
  )
}
