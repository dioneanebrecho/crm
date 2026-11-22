import { useMemo, useState, type ReactNode } from 'react'
import { useEstadoTela } from '../abas'
import { apiBling, brl, data, type ProdutoBlingLinha } from '../api'
import { Abas, Busca, Campo, Modal, Paginacao, useCarregar, Vazio } from '../ui'
import { apiGrades, ehPadrao, sugerirLocal, useTiposGrade } from '../apiGrades'
import type { Contexto } from '../App'

const LIMITE = 50
const ALERTAS: Record<string, string> = {
  sem_custo: 'Sem custo', preco_menor_igual_custo: 'Preço ≤ custo', grade_desconhecida: 'Tamanho fora da lista',
  sem_grade_no_nome: 'Sem tamanho no nome', espaco_duplo: 'Espaço duplo', rotulo_tam_fora_padrao: 'Rótulo "TAM" fora do padrão',
  excluido_com_gemeo_ativo: 'Excluído com gêmeo ativo',
}
const SIT: Record<string, string> = { A: 'Ativo', E: 'Excluído', I: 'Inativo' }
const FORMATO: Record<string, string> = { V: 'Produto com variações (pai)', S: 'Simples ou variação', E: 'Com composição' }
const GRUPO_GRADE: Record<string, string> = {
  letra: 'Letras (PP, P, M, G…)', numerico: 'Numeração', infantil: 'Infantil (idade)', unico: 'Tamanho único', variados: 'Lote / variados (sem grade)',
}
const STATUS_PADRONIZACAO: Record<string, string> = {
  pendente: 'Pendente', automatico: 'Padronizado automaticamente', padronizado: 'Padronizado', revisar: 'A revisar', aprovado: 'Aprovado',
}
const VAZIO = { busca: '', situacao: '', formato: '', grade: '', alerta: '' }

export default function ProdutosBling({ ctx }: { ctx: Contexto }) {
  const [salvo, setF] = useEstadoTela('produtosbling.f', VAZIO)
  const f = useMemo(() => ({ ...VAZIO, ...salvo }), [salvo])
  const [offset, setOffset] = useEstadoTela('produtosbling.offset', 0)
  const [det, setDet] = useState<number | null>(null)
  const resumo = useCarregar(() => apiBling.resumoProdutos(ctx.empresa), [ctx.empresa])
  const { dados, erro, carregando } = useCarregar(() => apiBling.produtos(ctx.empresa, f, offset, LIMITE), [ctx.empresa, f, offset])
  const mudar = (k: keyof typeof VAZIO, v: string) => { setOffset(0); setF((x) => ({ ...x, [k]: v })) }
  const r = resumo.dados
  const total = dados?.[0]?.total ?? 0
  const gradesOrdenadas = r ? Object.entries(r.por_grade).sort((a, b) => b[1] - a[1]) : []

  return (
    <section>
      <div className="topo">
        <div>
          <h1>Produtos Bling</h1>
          <p className="sub">Cópia do cadastro de produtos do Bling, com o nome e o tamanho padronizados que o CRM propõe. <strong>Somente leitura:</strong> nada é gravado no Bling. Para cadastrar uma peça nova, com grade, estoque, QR e fotos, use <strong>Catálogo › Peças</strong>.</p>
        </div>
      </div>
      {r && (
        <div className="resumo-faixa">
          <div><strong>{r.total.toLocaleString('pt-BR')}</strong><span>produtos no total</span></div>
          <div><strong>{(r.por_situacao.A ?? 0).toLocaleString('pt-BR')}</strong><span>ativos</span></div>
          <div><strong>{(r.por_situacao.E ?? 0).toLocaleString('pt-BR')}</strong><span>excluídos</span></div>
          <div><strong>{(r.por_formato.V ?? 0).toLocaleString('pt-BR')}</strong><span>com variações (pai)</span></div>
          <div><strong>{(r.por_formato.S ?? 0).toLocaleString('pt-BR')}</strong><span>simples ou variação</span></div>
          <div><strong>{(r.por_status.padronizado ?? 0).toLocaleString('pt-BR')}</strong><span>padronizados</span></div>
          <div><strong>{(r.por_status.revisar ?? 0).toLocaleString('pt-BR')}</strong><span>a revisar</span></div>
        </div>
      )}
      <div className="filtros" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <Busca valor={f.busca} onMudar={(v) => mudar('busca', v)} placeholder="Buscar por nome, código (SKU), referência ou ID do Bling" />
        <select value={f.situacao} onChange={(e) => mudar('situacao', e.target.value)} aria-label="Situação">
          <option value="">Situação: todas</option><option value="A">Ativos</option><option value="E">Excluídos</option>
        </select>
        <select value={f.formato} onChange={(e) => mudar('formato', e.target.value)} aria-label="Tipo de cadastro">
          <option value="">Tipo: todos</option><option value="V">Pai (com variações)</option><option value="S">Simples / variação</option>
        </select>
        <select value={f.grade} onChange={(e) => mudar('grade', e.target.value)} aria-label="Tamanho padronizado">
          <option value="">Tamanho: todos</option>
          {gradesOrdenadas.filter(([k]) => !k.startsWith('?') && k !== '(sem)').map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
          <option value="(sem)">(sem tamanho no nome)</option>
        </select>
        <select value={f.alerta} onChange={(e) => mudar('alerta', e.target.value)} aria-label="Alerta de qualidade">
          <option value="">Alerta: todos</option>
          {r && Object.entries(r.por_alerta).sort((a, b) => b[1] - a[1]).map(([k, n]) => <option key={k} value={k}>{ALERTAS[k] ?? k} ({n})</option>)}
        </select>
        {JSON.stringify(f) !== JSON.stringify(VAZIO) && <button className="sec" onClick={() => { setOffset(0); setF(VAZIO) }}>Limpar filtros</button>}
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && <Vazio titulo="Nada encontrado" texto="Ajuste a busca ou os filtros." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>ID Bling</th><th>Código (SKU)</th><th>Nome no Bling (original)</th><th>Nome padrão proposto</th><th>Ref. fornecedor</th><th>Tamanho (original)</th><th>Tamanho (padrão)</th><th>Situação</th><th className="num">Preço de venda</th>{ctx.veCusto && <th className="num">Custo</th>}<th>Alertas</th></tr></thead>
            <tbody>
              {dados.map((p: ProdutoBlingLinha) => (
                <tr key={p.bling_id} className="clicavel" onClick={() => setDet(p.bling_id)}>
                  <td>{p.bling_id}</td>
                  <td>{p.codigo ?? '—'}{p.formato === 'V' && <span className="mudo"> (pai)</span>}</td>
                  <td>{p.nome_cru}</td>
                  <td>{p.nome_padrao ?? '—'}</td>
                  <td>{p.ref_fornecedor ?? '—'}</td>
                  <td>{p.grade_valor_cru ?? '—'}</td>
                  <td>{p.grade_valor_padrao ?? (p.grade_valor_cru ? <strong title="Tamanho fora da lista padrão">?</strong> : '—')}</td>
                  <td>{SIT[p.situacao ?? ''] ?? p.situacao}</td>
                  <td className="num">{brl(p.preco)}</td>
                  {ctx.veCusto && <td className="num">{brl(p.custo_cru)}</td>}
                  <td>{p.alertas.map((a) => ALERTAS[a] ?? a).join(' · ') || <span className="mudo">ok</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
      {det !== null && <DetalheProduto ctx={ctx} id={det} onFechar={() => setDet(null)} onAbrir={setDet} />}
    </section>
  )
}

// ---------------------------------------------------------------- Detalhe do produto
type Fmt = (v: unknown) => ReactNode
const texto: Fmt = (v) => (v == null || v === '' ? '—' : String(v))
const mapa = (m: Record<string, string>): Fmt => (v) => (v == null || v === '' ? '—' : (m[String(v)] ?? String(v)))
const sim: Fmt = (v) => (v == null ? '—' : v ? 'Sim' : 'Não')
const dinheiro: Fmt = (v) => (v == null || v === '' ? '—' : brl(Number(v)))
const quando: Fmt = (v) => (typeof v === 'string' && v ? data(v) : '—')

interface CampoDef { k: string; rotulo: string; fmt?: Fmt; soCusto?: boolean }
const GRUPOS_CAMPOS: { titulo: string; campos: CampoDef[] }[] = [
  { titulo: 'Identificação', campos: [
    { k: 'bling_id', rotulo: 'ID no Bling' }, { k: 'codigo', rotulo: 'Código (SKU)' }, { k: 'formato', rotulo: 'Tipo de cadastro', fmt: mapa(FORMATO) },
    { k: 'pai_id', rotulo: 'Produto pai (ID no Bling)' }, { k: 'situacao', rotulo: 'Situação no Bling', fmt: mapa(SIT) } ] },
  { titulo: 'Nome', campos: [
    { k: 'nome_cru', rotulo: 'Nome no Bling (original)' }, { k: 'nome_padrao', rotulo: 'Nome padrão proposto' },
    { k: 'nome_base', rotulo: 'Nome-base (sem referência e sem tamanho)' }, { k: 'ref_fornecedor', rotulo: 'Referência do fornecedor' } ] },
  { titulo: 'Grade (tamanho)', campos: [
    { k: 'grade_valor_cru', rotulo: 'Tamanho no Bling (original)' }, { k: 'grade_valor_padrao', rotulo: 'Tamanho padronizado' },
    { k: 'grade_grupo', rotulo: 'Grupo da grade', fmt: mapa(GRUPO_GRADE) }, { k: 'grade_ordem_padrao', rotulo: 'Posição na grade' },
    { k: 'grade_rotulo_cru', rotulo: 'Rótulo do tamanho (original)' }, { k: 'sufixo_sku_cru', rotulo: 'Sufixo do código (original)' } ] },
  { titulo: 'Valores', campos: [
    { k: 'preco', rotulo: 'Preço de venda', fmt: dinheiro }, { k: 'custo_cru', rotulo: 'Custo', fmt: dinheiro, soCusto: true } ] },
  { titulo: 'Cadastro', campos: [
    { k: 'descricao_curta_cru', rotulo: 'Descrição curta' }, { k: 'tem_imagem', rotulo: 'Tem foto no Bling', fmt: sim },
    { k: 'id_ativo_equivalente', rotulo: 'Equivalente ativo (ID no Bling)' } ] },
  { titulo: 'Padronização', campos: [
    { k: 'status_padronizacao', rotulo: 'Situação da padronização', fmt: mapa(STATUS_PADRONIZACAO) }, { k: 'versao_regra', rotulo: 'Versão da regra aplicada' },
    { k: 'atualizado_em', rotulo: 'Atualizado em', fmt: quando } ] },
]
// Campos técnicos que não interessam a quem usa a tela.
const OCULTOS = new Set(['empresa_id', 'alertas', 'hash_conteudo', 'lido_em', 'criado_em'])

type AbaProduto = 'resumo' | 'grade' | 'cadastro' | 'crm' | 'original'

function DetalheProduto({ ctx, id, onFechar, onAbrir }: { ctx: Contexto; id: number; onFechar: () => void; onAbrir: (id: number) => void }) {
  const { dados, erro } = useCarregar(() => apiBling.produto(ctx.empresa, id), [ctx.empresa, id])
  const [aba, setAba] = useState<AbaProduto>('resumo')
  const p = dados?.produto
  const titulo = p ? String(p.nome_padrao ?? p.nome_cru ?? `Produto Bling ${id}`) : `Produto Bling ${id}`
  const conhecidos = new Set(GRUPOS_CAMPOS.flatMap((g) => g.campos.map((c) => c.k)))
  const outros = p ? Object.entries(p).filter(([k]) => !conhecidos.has(k) && !OCULTOS.has(k)) : []
  const alertas = Array.isArray(p?.alertas) ? (p?.alertas as string[]) : []
  const ficha = (titulos: string[]) => GRUPOS_CAMPOS.filter((g) => titulos.includes(g.titulo)).map((g) => {
    const linhas = g.campos.filter((c) => !(c.soCusto && !ctx.veCusto))
    return (
      <div key={g.titulo}>
        <h3>{g.titulo}</h3>
        <table className="ficha-tabela"><tbody>
          {linhas.map((c) => <tr key={c.k}><th scope="row">{c.rotulo}</th><td>{(c.fmt ?? texto)(p?.[c.k])}</td></tr>)}
        </tbody></table>
      </div>
    )
  })
  const ehFilho = p != null && p.pai_id != null
  const podeCriar = ctx.podeCatalogo && p != null && p.situacao === 'A' && !ehFilho

  return (
    <Modal titulo={titulo} onFechar={onFechar} larga>
      {erro && <div className="erro">{erro}</div>}
      {!dados && !erro && <p className="sub">Carregando…</p>}
      {dados === null && !erro && <Vazio titulo="Produto não encontrado" texto="Ele pode ter sido removido da cópia local." />}
      {dados && p && (
        <div className="detalhe">
          <p className="sub" style={{ marginTop: '-.6rem' }}>ID no Bling <code>{id}</code>{p.codigo ? <> · Código <code>{String(p.codigo)}</code></> : null} · {SIT[String(p.situacao ?? '')] ?? String(p.situacao ?? '')}</p>
          <Abas<AbaProduto> ativa={aba} onMudar={setAba} abas={[
            { id: 'resumo', rotulo: 'Resumo' },
            { id: 'grade', rotulo: 'Tamanho e variações', contagem: dados.variacoes.length },
            { id: 'cadastro', rotulo: 'Cadastro e padronização', contagem: alertas.length || undefined },
            { id: 'crm', rotulo: 'Peça no CRM' },
            { id: 'original', rotulo: 'Dados originais' },
          ]} />
          {aba === 'resumo' && (<>
            {alertas.length > 0
              ? <div className="aviso-caixa"><strong>Pontos de atenção:</strong> {alertas.map((a) => ALERTAS[a] ?? a).join(' · ')}</div>
              : <div className="info">Sem alertas de qualidade neste cadastro.</div>}
            {ficha(['Identificação', 'Nome', 'Valores'])}
          </>)}
          {aba === 'grade' && (<>
            {ficha(['Grade (tamanho)'])}
            {dados.variacoes.length > 0 ? (<>
              <h3>Variações deste produto ({dados.variacoes.length})</h3>
              <table className="compacta"><thead><tr><th>ID no Bling</th><th>Código (SKU)</th><th>Tamanho</th><th>Situação</th></tr></thead><tbody>
                {dados.variacoes.map((v) => (
                  <tr key={v.bling_id} className="clicavel" onClick={() => { setAba('resumo'); onAbrir(v.bling_id) }}>
                    <td><button className="link" onClick={(e) => { e.stopPropagation(); setAba('resumo'); onAbrir(v.bling_id) }}>{v.bling_id}</button></td>
                    <td>{v.codigo ?? '—'}</td><td>{v.grade ?? '—'}</td><td>{SIT[v.situacao ?? ''] ?? v.situacao}</td>
                  </tr>))}
              </tbody></table>
            </>) : <p className="sub">{ehFilho ? 'Este cadastro é uma variação de outro produto.' : 'Sem variações ligadas a este produto na cópia local. Se ele deveria ter, a cópia pode estar desatualizada (reprocessar o espelho do Bling resolve).'}</p>}
          </>)}
          {aba === 'cadastro' && (<>
            {ficha(['Cadastro', 'Padronização'])}
            {outros.length > 0 && (<>
              <h3>Outros campos</h3>
              <table className="ficha-tabela"><tbody>
                {outros.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{Array.isArray(v) ? v.join(', ') || '—' : texto(v)}</td></tr>)}
              </tbody></table>
            </>)}
          </>)}
          {aba === 'crm' && <VinculoCrm ctx={ctx} produto={p} podeCriar={podeCriar} ehFilho={ehFilho} />}
          {aba === 'original' && (
            <div className="bruto">
              <p className="sub">Conferência técnica: exatamente o que o Bling devolveu.</p>
              <h4>Listagem</h4>
              <pre>{JSON.stringify(dados.bruto_lista, null, 2)}</pre>
              <h4>Detalhe</h4>
              {dados.bruto_detalhe ? <pre>{JSON.stringify(dados.bruto_detalhe, null, 2)}</pre> : <p className="sub">Detalhe ainda não lido (só é lido para pais e simples ativos, depois da listagem).</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// Traz o produto do Bling para o catálogo do CRM: cria a peça (com tamanhos) já ligada ao produto. Nada é gravado no Bling.
function VinculoCrm({ ctx, produto, podeCriar, ehFilho }: { ctx: Contexto; produto: Record<string, unknown>; podeCriar: boolean; ehFilho: boolean }) {
  const { tipos, pendente } = useTiposGrade(ctx.empresa)
  const nome = String(produto.nome_base ?? produto.nome_cru ?? '')
  const [tipoId, setTipoId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const sugerido = tipos ? sugerirLocal(tipos, nome) : undefined
  const escolhido = tipoId ?? sugerido?.id ?? ''
  const real = !!escolhido && !ehPadrao(escolhido)

  async function criar() {
    setEnviando(true); setMsg(null)
    try {
      const r = await apiGrades.criarDeBling(ctx.empresa, Number(produto.bling_id), real ? escolhido : null)
      setMsg({ ok: true, t: `Peça criada com ${r.variacoes_criadas} tamanho(s). Abra Catálogo › Peças para completar fotos, atributos e unidades.${r.avisos.length ? ` Avisos: ${r.avisos.join('; ')}.` : ''}` })
    } catch (e) { setMsg({ ok: false, t: (e as Error).message }) } finally { setEnviando(false) }
  }

  if (ehFilho) return <p className="sub">Este cadastro é uma variação (tamanho). O vínculo é feito pelo produto pai (ID <code>{String(produto.pai_id)}</code>).</p>
  if (produto.situacao !== 'A') return <p className="sub">Só produtos ativos podem virar peça no CRM.</p>
  return (
    <div>
      <p className="sub">Traz este produto para o catálogo do CRM: nome, preço, custo e os tamanhos ficam ligados ao Bling, sem digitar de novo. As unidades em estoque (com QR) você cria depois, na peça.</p>
      {pendente && <div className="aviso-caixa">Recurso aguardando a migration 0025.</div>}
      {!podeCriar && <p className="sub">Seu perfil não cria peças.</p>}
      {podeCriar && tipos && (<>
        <Campo rotulo="Tipo de grade" dica={sugerido ? `Sugerido pelo nome: ${sugerido.nome}` : 'Define os tamanhos e os detalhes pedidos na peça. Pode ser escolhido depois.'}>
          <select value={escolhido} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">(escolher depois)</option>
            {tipos.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
        {msg && <div className={msg.ok ? 'info' : 'erro'}>{msg.t}</div>}
        <button disabled={enviando || pendente || msg?.ok} onClick={criar}>{enviando ? 'Criando…' : 'Criar peça a partir deste produto'}</button>
      </>)}
    </div>
  )
}
