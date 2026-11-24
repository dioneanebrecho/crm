import { useMemo, useState } from 'react'
import type { Contexto } from '../App'
import { apiFinanceiro, type CentroResultado as CR } from '../apiFinanceiro'
import GradeDados, { type Coluna } from '../GradeDados'
import { Campo, Formulario, Modal, Titulo, useCarregar } from '../ui'

const TIPOS: Record<CR['tipo'], string> = { canal: 'Canal de venda', apoio: 'Apoio', area: 'Área' }
const CANAIS = ['instagram', 'whatsapp', 'marketplace', 'site', 'bling', 'outros']

export default function CentroResultado({ ctx }: { ctx: Contexto }) {
  const lista = useCarregar(() => apiFinanceiro.centros(ctx.empresa), [ctx.empresa])
  const [fechados, setFechados] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<{ cr: CR | null; pai: CR | null } | null>(null)
  const pode = (ctx.papeis.includes('admin') || ctx.papeis.includes('gestor') || ctx.papeis.includes('superadmin'))
    && (ctx.perm === null || ctx.perm['centros_resultado'] === 'editar')
  const todos = lista.dados ?? []
  const ordenados = useMemo(() => [...todos].sort((a, b) => a.codigo.localeCompare(b.codigo)), [todos])
  const linhas = useMemo(() => {
    const fech = ordenados.filter((c) => fechados.has(c.id))
    return ordenados.filter((c) => !fech.some((a) => c.codigo.startsWith(a.codigo + '.')))
  }, [ordenados, fechados])
  const alternar = (id: string) => setFechados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const colunas: Coluna<CR>[] = [
    { id: 'codigo', titulo: 'Código', texto: (c) => c.codigo, max: 120 },
    { id: 'nome', titulo: 'Centro de resultado', texto: (c) => c.nome, largura: 320, render: (c) => (
      <span style={{ paddingLeft: (c.grau - 1) * 18, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {c.qtd_filhos > 0
          ? <button type="button" className="link" style={{ padding: 0 }} aria-label={fechados.has(c.id) ? 'Expandir' : 'Recolher'} onClick={(e) => { e.stopPropagation(); alternar(c.id) }}>{fechados.has(c.id) ? '▸' : '▾'}</button>
          : <span style={{ width: 10, display: 'inline-block' }} />}
        <span style={{ fontWeight: c.analitico ? 400 : 700, opacity: c.ativo ? 1 : 0.5 }}>{c.nome}</span>
      </span>) },
    { id: 'tipo', titulo: 'Tipo', texto: (c) => TIPOS[c.tipo] },
    { id: 'nivel', titulo: 'Nível', texto: (c) => (c.analitico ? 'Analítico' : 'Sintético') },
    { id: 'receita', titulo: 'Recebe receita', texto: (c) => (c.aceita_receita ? 'Sim' : '') },
    { id: 'canal', titulo: 'Canal do CRM', texto: (c) => c.canal_venda ?? '' },
    { id: 'aprop', titulo: 'Lançamentos', texto: (c) => String(c.qtd_apropriacoes), valor: (c) => c.qtd_apropriacoes, direita: true, formatar: (n) => n.toLocaleString('pt-BR') },
    { id: 'regras', titulo: 'Regras', texto: (c) => String(c.qtd_regras), valor: (c) => c.qtd_regras, direita: true, somar: false },
    { id: 'situacao', titulo: 'Situação', texto: (c) => (c.ativo ? 'Ativo' : 'Inativo') },
    { id: 'acoes', titulo: 'Ações', simples: true, texto: () => '', render: (c) => pode ? (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditando({ cr: c, pai: null }) }}>Editar</button>
        {!c.analitico && c.ativo && c.grau < 4 && <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setEditando({ cr: null, pai: c }) }}>+ Filho</button>}
      </span>) : null },
  ]

  return (
    <section>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Define <strong>quem responde</strong> pelo resultado: área, departamento ou canal de venda. Não é o tipo de gasto (isso é a Natureza). Cada lançamento recebe uma Natureza e um Centro de Resultado. Receita só entra em centro de canal. Nada é enviado ao Bling.</>}>
            Centro de resultado
          </Titulo>
          <p className="sub">{todos.length} cadastros · {todos.filter((c) => c.analitico).length} analíticos (recebem lançamentos)</p>
        </div>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button type="button" className="sec" onClick={() => setFechados(fechados.size ? new Set() : new Set(ordenados.filter((c) => c.qtd_filhos > 0 && c.grau >= 2).map((c) => c.id)))}>{fechados.size ? 'Expandir tudo' : 'Recolher subníveis'}</button>
          {pode && <button type="button" onClick={() => setEditando({ cr: null, pai: null })}>+ Nova área</button>}
        </span>
      </div>
      {lista.erro && <div className="erro">{lista.erro}</div>}
      {lista.carregando && !lista.dados && <p className="sub">Carregando…</p>}
      {lista.dados && <GradeDados id="financeiro.cr" titulo="Centros de resultado" colunas={colunas} linhas={linhas} chave={(c) => c.id} altura="70vh" vazio="Nenhum centro de resultado." />}
      {editando && <CRForm ctx={ctx} pode={pode} todos={todos} cr={editando.cr} paiInicial={editando.pai}
        onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); lista.recarregar() }} />}
    </section>
  )
}

function CRForm({ ctx, pode, todos, cr, paiInicial, onFechar, onSalvo }: {
  ctx: Contexto; pode: boolean; todos: CR[]; cr: CR | null; paiInicial: CR | null; onFechar: () => void; onSalvo: () => void
}) {
  const [nome, setNome] = useState(cr?.nome ?? '')
  const [paiId, setPaiId] = useState(cr ? (cr.pai_id ?? '') : (paiInicial?.id ?? ''))
  const [tipo, setTipo] = useState<CR['tipo']>(cr?.tipo ?? paiInicial?.tipo ?? 'apoio')
  const [analitico, setAnalitico] = useState(cr?.analitico ?? false)
  const [receita, setReceita] = useState(cr?.aceita_receita ?? false)
  const [canal, setCanal] = useState(cr?.canal_venda ?? '')
  const [ativo, setAtivo] = useState(cr?.ativo ?? true)
  const pais = useMemo(() => todos.filter((c) => !c.analitico && c.ativo && c.grau < 4).sort((a, b) => a.codigo.localeCompare(b.codigo)), [todos])
  const grauNovo = (todos.find((c) => c.id === paiId)?.grau ?? 0) + 1
  const podeExcluir = pode && !!cr && cr.qtd_filhos === 0 && cr.qtd_apropriacoes === 0 && cr.qtd_regras === 0 && !cr.codigo.startsWith('9')

  async function excluir() {
    if (!cr || !window.confirm(`Excluir “${cr.nome}”? Não há filhos, regras nem lançamentos nele.`)) return
    await apiFinanceiro.excluirCentro(ctx.empresa, cr.id); onSalvo()
  }
  return (
    <Modal titulo={cr ? `Editar · ${cr.codigo}` : 'Novo centro de resultado'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} enviarRotulo={pode ? 'Salvar' : 'Fechar'} onEnviar={async () => {
        if (!pode) return onFechar()
        if (analitico && grauNovo < 2 && !cr) throw new Error('O nível 1 é só agrupador (área). Escolha um pai para criar um centro analítico.')
        const dados: Record<string, unknown> = { nome, tipo, analitico, aceita_receita: analitico && tipo === 'canal' && receita, canal_venda: canal || null, ativo }
        if (!cr) dados.pai_id = paiId || null
        await apiFinanceiro.salvarCentro(ctx.empresa, cr?.id ?? null, dados)
        onSalvo()
      }}>
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required autoFocus disabled={!pode} /></Campo>
        <Campo rotulo="Pai" dica={cr ? 'O pai e o código não mudam depois de criados.' : `Ficará no nível ${grauNovo}. O código (9.99.99.999) é gerado automaticamente.`}>
          <select value={paiId} onChange={(e) => setPaiId(e.target.value)} disabled={!pode || !!cr}>
            <option value="">(nenhum: nível 1, área)</option>
            {pais.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.caminho_nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Tipo" dica="Canal de venda é o único que pode receber receita.">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as CR['tipo'])} disabled={!pode}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <label className="check"><input type="checkbox" checked={analitico} onChange={(e) => setAnalitico(e.target.checked)} disabled={!pode || (!!cr && cr.qtd_filhos > 0)} /> Recebe lançamentos (analítico)</label>
        {analitico && tipo === 'canal' && <label className="check"><input type="checkbox" checked={receita} onChange={(e) => setReceita(e.target.checked)} disabled={!pode} /> Aceita receita, dedução e CMV</label>}
        {analitico && tipo === 'canal' && (
          <Campo rotulo="Canal do CRM" dica="Liga este centro ao canal de venda dos pedidos.">
            <select value={canal} onChange={(e) => setCanal(e.target.value)} disabled={!pode}>
              <option value="">(nenhum)</option>
              {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
        )}
        {cr && <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={!pode} /> Ativo</label>}
        {podeExcluir && <button type="button" className="link" style={{ color: 'var(--erro, #e5484d)', alignSelf: 'flex-start' }} onClick={() => { void excluir().catch((e: Error) => window.alert(e.message)) }}>Excluir este centro</button>}
      </Formulario>
    </Modal>
  )
}
