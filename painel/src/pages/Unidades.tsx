import { useMemo, useState } from 'react'
import { api, brl, type EstoqueAgrupado, type UnidadeLinha } from '../api'
import { Busca, ESTADOS, Modal, LimparFiltros, Paginacao, Selo, Titulo, useCarregar, Vazio } from '../ui'
import { useEstadoTela } from '../abas'
import GradeDados, { type Coluna } from '../GradeDados'
import { ModalHistorico, ModalImprimir } from './Etiquetas'
import { fmtMargem, margemBruta } from '../rentabilidade'
import type { Contexto } from '../App'

const LIMITE = 200

export default function Unidades({ ctx }: { ctx: Contexto }) {
  const [busca, setBusca] = useEstadoTela('estoque.busca', '')
  const [estado, setEstado] = useEstadoTela('estoque.estado', '')
  const [local, setLocal] = useEstadoTela('estoque.local', '')
  const [offset, setOffset] = useEstadoTela('estoque.offset', 0)
  const [agrupar, setAgrupar] = useEstadoTela('estoque.agrupar', false)
  const [grupo, setGrupo] = useState<EstoqueAgrupado | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [imprimir, setImprimir] = useState<string[] | null>(null)
  const [hist, setHist] = useState<UnidadeLinha | null>(null)
  const locais = useCarregar(() => api.locais(ctx.empresa), [ctx.empresa])
  const det = useCarregar(() => (agrupar ? Promise.resolve([] as UnidadeLinha[]) : api.unidades(ctx.empresa, { busca, estado, local }, offset, LIMITE)),
                          [ctx.empresa, busca, estado, local, offset, agrupar])
  const agr = useCarregar(() => (agrupar ? api.estoqueAgrupado(ctx.empresa, { busca, estado, local }, offset, LIMITE) : Promise.resolve([] as EstoqueAgrupado[])),
                          [ctx.empresa, busca, estado, local, offset, agrupar])
  const dados = det.dados, erro = det.erro ?? agr.erro, carregando = det.carregando || agr.carregando, recarregar = () => { det.recarregar(); agr.recarregar() }
  const resumo = useCarregar(() => api.resumoEstoque(ctx.empresa, { busca, estado, local }), [ctx.empresa, busca, estado, local, dados])
  // sem filtro de estado, "estoque" = o que está fisicamente na loja (disponível + reservada); com filtro, o total do que foi filtrado
  const base = (resumo.dados ?? []).filter((r) => estado || r.estado === 'disponivel' || r.estado === 'reservada')
  const soma = base.reduce((t, r) => ({ qtd: t.qtd + Number(r.qtd), custo: t.custo + Number(r.valor_custo ?? 0), preco: t.preco + Number(r.valor_preco), semCusto: t.semCusto + Number(r.sem_custo ?? 0) }),
                           { qtd: 0, custo: 0, preco: 0, semCusto: 0 })
  // com unidade sem custo, a margem do conjunto ficaria inflada: só calcula quando todas têm custo
  const margemTotal = soma.semCusto > 0 ? null : margemBruta(soma.preco, soma.custo)
  const total = (agrupar ? agr.dados?.[0]?.total : dados?.[0]?.total) ?? 0
  const filtrar = (fn: () => void) => { setOffset(0); setSel(new Set()); fn() }

  // mesma regra da tela Etiquetas: admin, gestor ou expedição, e a matriz de permissões da tela 'etiquetas' em "editar"
  const papel = (...r: string[]) => ctx.papeis.includes('superadmin') || r.some((x) => (ctx.papeis as string[]).includes(x))
  const podeImprimir = (ctx.perm === null || ctx.perm['etiquetas'] === 'editar') && papel('admin', 'gestor', 'expedicao')

  const colunas = useMemo<Coluna<UnidadeLinha>[]>(() => [
    ...(podeImprimir ? [{
      id: 'sel', titulo: 'Selecionar', texto: (u: UnidadeLinha) => (sel.has(u.id) ? 'Sim' : 'Não'), largura: 40, simples: true, somar: false,
      cabecalho: <input type="checkbox" aria-label="Selecionar todas as unidades da página" checked={!!dados && dados.length > 0 && dados.every((u) => sel.has(u.id))}
        onChange={(e) => setSel(e.target.checked ? new Set((dados ?? []).map((u) => u.id)) : new Set())} />,
      render: (u: UnidadeLinha) => <input type="checkbox" checked={sel.has(u.id)} aria-label={`Selecionar ${u.codigo}`}
        onChange={() => setSel((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n })} />,
    }] : []),
    { id: 'codigo', titulo: 'Unidade', texto: (u) => u.codigo, render: (u) => <code>{u.codigo}</code> },
    { id: 'peca', titulo: 'Peça', texto: (u) => `${u.peca_codigo} · ${u.peca_nome}`, max: 420 },
    { id: 'tamanho', titulo: 'Tamanho', texto: (u) => u.tamanho },
    { id: 'estado', titulo: 'Estado', texto: (u) => ESTADOS[u.estado] ?? u.estado, render: (u) => <Selo estado={u.estado} /> },
    { id: 'local', titulo: 'Local', texto: (u) => u.local_nome },
    { id: 'preco', titulo: 'Preço', texto: (u) => brl(u.preco), valor: (u) => u.preco, direita: true, somar: true, formatar: brl },
    ...(ctx.veRentabilidade ? [
      { id: 'custo', titulo: 'Custo', texto: (u: UnidadeLinha) => brl(u.custo), valor: (u: UnidadeLinha) => u.custo, direita: true, somar: true, formatar: brl },
      { id: 'margem', titulo: 'Margem bruta', texto: (u: UnidadeLinha) => fmtMargem(margemBruta(u.preco, u.custo)), valor: (u: UnidadeLinha) => margemBruta(u.preco, u.custo), direita: true, somar: false,
        render: (u: UnidadeLinha) => { const m = margemBruta(u.preco, u.custo); return <span className={m != null && m <= 0 ? 'texto-erro' : ''}>{fmtMargem(m)}</span> } },
    ] : []),
    { id: 'obs', titulo: 'Observação', texto: (u) => u.observacao ?? '', max: 360 },
    ...(podeImprimir ? [{
      id: 'acoes', titulo: 'Etiqueta', texto: () => '', largura: 250, simples: true, somar: false,
      render: (u: UnidadeLinha) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" className="sec" onClick={() => setImprimir([u.id])} title="Imprime a etiqueta; se já foi impressa, avisa e pede o motivo">Imprimir / reimprimir</button>
          <button type="button" className="sec" onClick={() => setHist(u)} title="Quem imprimiu e quando">Histórico</button>
        </span>),
    }] : []),
  ], [podeImprimir, sel, dados, ctx.veRentabilidade])

  const colunasAgr = useMemo<Coluna<EstoqueAgrupado>[]>(() => [
    { id: 'peca', titulo: 'Peça', texto: (g) => `${g.peca_codigo} · ${g.peca_nome}`, max: 420 },
    { id: 'tamanho', titulo: 'Tamanho', texto: (g) => g.tamanho },
    { id: 'qtd', titulo: 'Quantidade', texto: (g) => String(g.qtd), valor: (g) => g.qtd, direita: true, somar: true, formatar: (n) => n.toLocaleString('pt-BR') },
    { id: 'preco', titulo: 'Preço unit.', texto: (g) => brl(g.preco), valor: (g) => g.preco, direita: true, somar: false },
    { id: 'vpreco', titulo: 'Valor a preço', texto: (g) => brl(g.valor_preco), valor: (g) => g.valor_preco, direita: true, somar: true, formatar: brl },
    ...(ctx.veRentabilidade ? [
      { id: 'custo', titulo: 'Custo unit.', texto: (g: EstoqueAgrupado) => brl(g.custo), valor: (g: EstoqueAgrupado) => g.custo, direita: true, somar: false },
      { id: 'vcusto', titulo: 'Valor ao custo', texto: (g: EstoqueAgrupado) => (g.custo == null ? '—' : brl(g.valor_custo)), valor: (g: EstoqueAgrupado) => (g.custo == null ? null : g.valor_custo), direita: true, somar: true, formatar: brl },
      { id: 'margem', titulo: 'Margem bruta', texto: (g: EstoqueAgrupado) => fmtMargem(margemBruta(g.preco, g.custo)), valor: (g: EstoqueAgrupado) => margemBruta(g.preco, g.custo), direita: true, somar: false,
        render: (g: EstoqueAgrupado) => { const m = margemBruta(g.preco, g.custo); return <span className={m != null && m <= 0 ? 'texto-erro' : ''}>{fmtMargem(m)}</span> } },
    ] : []),
    ...(podeImprimir ? [{
      id: 'acoes', titulo: 'Etiqueta', texto: () => '', largura: 190, simples: true, somar: false,
      render: (g: EstoqueAgrupado) => <button type="button" className="sec" onClick={(e) => { e.stopPropagation(); setGrupo(g) }} title="Abre as unidades desta peça e tamanho para imprimir etiquetas">Ver unidades / etiquetas</button>,
    }] : []),
  ], [podeImprimir, ctx.veRentabilidade])

  return (
    <section>
      <div className="topo">
        <Titulo ajuda={<>Cada unidade física, com estado e local. As unidades são criadas dentro da peça. A etiqueta de uma unidade já impressa só sai de novo depois do aviso e de informar o motivo; a reimpressão fica registrada com seu nome, data e hora. Marque "Agrupar por peça e tamanho" para ver a quantidade total e o valor do estoque por peça; clique na linha para abrir as unidades e imprimir etiquetas.</>}>Estoque</Titulo>
      </div>
      {!agrupar && podeImprimir && sel.size > 0 && (
        <div className="barra-selecao" role="status">
          <strong>{sel.size} selecionada{sel.size > 1 ? 's' : ''}</strong>
          <button onClick={() => setImprimir([...sel])}>Imprimir etiquetas</button>
          <button className="sec" onClick={() => setSel(new Set())}>Limpar seleção</button>
        </div>)}
      <div className="filtros">
        <Busca valor={busca} onMudar={(v) => { if (v !== busca) filtrar(() => setBusca(v)) }} placeholder="Buscar por código da unidade, peça ou nome" />
        <select value={estado} onChange={(e) => filtrar(() => setEstado(e.target.value))} aria-label="Estado">
          <option value="">Todos os estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={local} onChange={(e) => filtrar(() => setLocal(e.target.value))} aria-label="Local">
          <option value="">Todos os locais</option>
          {(locais.dados ?? []).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <label className="chk-agrupar" title="Junta as unidades da mesma peça e tamanho em uma linha, com a quantidade total">
          <input type="checkbox" checked={agrupar} onChange={(e) => { setOffset(0); setSel(new Set()); setAgrupar(e.target.checked) }} /> Agrupar por peça e tamanho
        </label>
        <LimparFiltros ativo={!!(busca || estado || local)} onLimpar={() => { setOffset(0); setSel(new Set()); setBusca(''); setEstado(''); setLocal('') }} />
      </div>
      {resumo.dados && resumo.dados.length > 0 && (
        <div className="resumo-faixa" aria-label="Estoque valorizado">
          <div><strong>{soma.qtd.toLocaleString('pt-BR')}</strong><span>{estado ? `unidades (${ESTADOS[estado] ?? estado})` : 'unidades em estoque'}</span></div>
          <div><strong>{brl(soma.preco)}</strong><span>valor a preço de venda</span></div>
          {ctx.veRentabilidade && <div><strong>{brl(soma.custo)}</strong><span>valor ao custo</span></div>}
          {ctx.veRentabilidade && <div><strong>{fmtMargem(margemTotal)}</strong><span>{soma.semCusto > 0 ? 'margem (falta custo)' : 'margem bruta do estoque'}</span></div>}
          {ctx.veRentabilidade && soma.semCusto > 0 && <div className="v-alerta"><strong>{soma.semCusto}</strong><span>sem custo cadastrado</span></div>}
        </div>)}
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && !agr.dados && <p className="sub">Carregando…</p>}
      {agrupar && agr.dados && agr.dados.length === 0 && <Vazio titulo="Nenhuma unidade" texto="Nenhuma unidade em estoque com esses filtros." />}
      {agrupar && agr.dados && agr.dados.length > 0 && <GradeDados id={`estoque.agrupado.${ctx.veRentabilidade ? 'c' : 's'}`} titulo="Estoque agrupado" colunas={colunasAgr} linhas={agr.dados}
        chave={(g) => g.variacao_id} altura="72vh" aoClicar={podeImprimir ? setGrupo : undefined} />}
      {!agrupar && dados && dados.length === 0 && <Vazio titulo="Nenhuma unidade" texto="Abra uma peça, adicione um tamanho e crie as unidades em estoque." />}
      {!agrupar && dados && dados.length > 0 && <GradeDados id={`estoque.unidades.${ctx.veRentabilidade ? "c" : "s"}`} titulo="Estoque" colunas={colunas} linhas={dados} chave={(u) => u.id} altura="72vh" />}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={(o) => { setSel(new Set()); setOffset(o) }} />
      {grupo && <ModalGrupo ctx={ctx} grupo={grupo} filtros={{ busca, estado, local }} podeImprimir={podeImprimir} onImprimir={(ids) => setImprimir(ids)} onFechar={() => setGrupo(null)} />}
      {imprimir && <ModalImprimir ctx={ctx} unidades={imprimir} onFechar={() => setImprimir(null)} onConcluido={() => { setImprimir(null); setSel(new Set()); recarregar() }} />}
      {hist && <ModalHistorico ctx={ctx} etiqueta={{ unidade_id: hist.id, unidade_codigo: hist.codigo }} onFechar={() => setHist(null)} />}
    </section>
  )
}

// Detalhe de um grupo (peça + tamanho): lista as unidades para imprimir/reimprimir a etiqueta de uma, de várias ou de todas.
function ModalGrupo({ ctx, grupo, filtros, podeImprimir, onImprimir, onFechar }: {
  ctx: Contexto; grupo: EstoqueAgrupado; filtros: { busca: string; estado: string; local: string }; podeImprimir: boolean
  onImprimir: (ids: string[]) => void; onFechar: () => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [hist, setHist] = useState<UnidadeLinha | null>(null)
  const { dados, erro, carregando } = useCarregar(() => api.unidades(ctx.empresa, filtros, 0, 200, grupo.variacao_id), [ctx.empresa, grupo.variacao_id])
  // mesma regra do agrupamento: sem filtro de estado, só o que está em estoque (disponível e reservada)
  const lista = (dados ?? []).filter((u) => filtros.estado || u.estado === 'disponivel' || u.estado === 'reservada')
  const todas = lista.length > 0 && lista.every((u) => sel.has(u.id))
  return (
    <Modal titulo={`${grupo.peca_codigo} · ${grupo.peca_nome} · ${grupo.tamanho}`} onFechar={onFechar} larga>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && (
        <>
          <p className="sub">{lista.length} unidade{lista.length === 1 ? '' : 's'}. Marque as que quer imprimir ou use "Imprimir todas".</p>
          <div className="tabela-rolavel"><table>
            <thead><tr>
              {podeImprimir && <th><input type="checkbox" aria-label="Selecionar todas" checked={todas} onChange={(e) => setSel(e.target.checked ? new Set(lista.map((u) => u.id)) : new Set())} /></th>}
              <th>Unidade</th><th>Estado</th><th>Local</th><th>Observação</th>{podeImprimir && <th>Etiqueta</th>}
            </tr></thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id}>
                  {podeImprimir && <td><input type="checkbox" aria-label={`Selecionar ${u.codigo}`} checked={sel.has(u.id)}
                    onChange={() => setSel((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n })} /></td>}
                  <td><code>{u.codigo}</code></td><td><Selo estado={u.estado} /></td><td>{u.local_nome}</td><td>{u.observacao ?? ''}</td>
                  {podeImprimir && <td><span style={{ display: 'inline-flex', gap: 6 }}>
                    <button type="button" className="sec" onClick={() => onImprimir([u.id])}>Imprimir / reimprimir</button>
                    <button type="button" className="sec" onClick={() => setHist(u)}>Histórico</button></span></td>}
                </tr>))}
            </tbody>
          </table></div>
          {podeImprimir && (
            <div className="acoes" style={{ marginTop: '.8rem' }}>
              <button disabled={sel.size === 0} onClick={() => onImprimir([...sel])}>Imprimir selecionadas ({sel.size})</button>
              <button className="sec" disabled={lista.length === 0} onClick={() => onImprimir(lista.map((u) => u.id))}>Imprimir todas ({lista.length})</button>
            </div>)}
        </>)}
      {hist && <ModalHistorico ctx={ctx} etiqueta={{ unidade_id: hist.id, unidade_codigo: hist.codigo }} onFechar={() => setHist(null)} />}
    </Modal>
  )
}
