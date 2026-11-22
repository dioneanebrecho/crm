import { useState } from 'react'
import { apiParceiros, brl, data, type FiltroParceiro, type ParceiroLinha, type PendenteLinha } from '../api'
import { Abas, Busca, Modal, Paginacao, useCarregar, Vazio } from '../ui'
import type { Contexto } from '../App'
import { DetalheNota } from './NotasBling'

const LIMITE = 50
const LIMITE_NOTAS = 20
const PAPEIS: Record<string, string> = { cliente: 'Cliente', fornecedor: 'Fornecedor', transportadora: 'Transportadora', funcionario: 'Funcionário' }
const CRITERIO: Record<string, string> = { documento: 'Mesmo CPF/CNPJ', instagram: 'Mesmo @', manual: 'Decisão manual', sem_chave: 'Sem chave (só nome)' }
const STATUS: Record<string, string> = { vinculado: 'Vinculado', revisao: 'Em revisão', proposto: 'Proposto' }
const SIT: Record<string, string> = { A: 'Ativo', E: 'Excluído', I: 'Inativo' }
const VAZIO: FiltroParceiro = { busca: '', papel: '', ativo: '', tipo: '', minContatos: '', soRevisao: false }
type Aba = 'parceiros' | 'revisao' | 'proposto'

export default function Parceiros({ ctx, inicial }: { ctx: Contexto; inicial?: string }) {
  const [aba, setAba] = useState<Aba>('parceiros')
  return (
    <section>
      <div className="topo">
        <div><h1>Parceiros</h1><p className="sub">Cadastro oficial único: um ID por CPF/CNPJ ou @. Cada parceiro reúne os contatos do Bling que ele representa (amarração auditável). Somente leitura.</p></div>
      </div>
      <Abas abas={[{ id: 'parceiros', rotulo: 'Parceiros' }, ...(ctx.veContato ? [{ id: 'revisao' as const, rotulo: 'Em revisão' }, { id: 'proposto' as const, rotulo: 'Só nome (fora do oficial)' }] : [])]} ativa={aba} onMudar={setAba} />
      {aba === 'parceiros' ? <Lista ctx={ctx} inicial={inicial} /> : <Pendentes ctx={ctx} status={aba} />}
    </section>
  )
}

function Lista({ ctx, inicial }: { ctx: Contexto; inicial?: string }) {
  const [f, setF] = useState<FiltroParceiro>({ ...VAZIO, busca: inicial ?? '' })
  const [offset, setOffset] = useState(0)
  const [det, setDet] = useState<ParceiroLinha | null>(null)
  const { dados, erro, carregando } = useCarregar(() => apiParceiros.listar(ctx.empresa, f, offset, LIMITE), [ctx.empresa, f, offset])
  const mudar = <K extends keyof FiltroParceiro>(k: K, v: FiltroParceiro[K]) => { setOffset(0); setF((x) => ({ ...x, [k]: v })) }
  const total = dados?.[0]?.total ?? 0
  return (
    <>
      <p className="sub">{dados ? `${total.toLocaleString('pt-BR')} parceiros no filtro atual` : ' '}</p>
      <div className="filtros" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <Busca valor={f.busca} onMudar={(v) => mudar('busca', v)} placeholder="Buscar por nome, @, últimos dígitos do CPF/CNPJ, nome ou ID do Bling" />
        <select value={f.papel} onChange={(e) => mudar('papel', e.target.value)} aria-label="Papel">
          <option value="">Papel: todos</option>{Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.tipo} onChange={(e) => mudar('tipo', e.target.value)} aria-label="Tipo de pessoa">
          <option value="">Pessoa: todas</option><option value="F">Física</option><option value="J">Jurídica</option>
        </select>
        <select value={f.ativo} onChange={(e) => mudar('ativo', e.target.value)} aria-label="Situação">
          <option value="">Situação: todas</option><option value="sim">Ativos</option><option value="nao">Inativos</option>
        </select>
        <select value={f.minContatos} onChange={(e) => mudar('minContatos', e.target.value)} aria-label="Contatos Bling">
          <option value="">Contatos Bling: todos</option><option value="2">2 ou mais (repetidos)</option><option value="5">5 ou mais</option><option value="20">20 ou mais</option>
        </select>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={f.soRevisao} onChange={(e) => mudar('soRevisao', e.target.checked)} />Só com conflito</label>
        {JSON.stringify(f) !== JSON.stringify(VAZIO) && <button className="sec" onClick={() => { setOffset(0); setF(VAZIO) }}>Limpar</button>}
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && <Vazio titulo="Nada encontrado" texto="Ajuste a busca ou os filtros." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>Nome</th><th>Pessoa</th><th>Papéis</th><th>Identificadores</th><th className="num">Contatos Bling</th><th>Situação</th><th>Conflito</th></tr></thead>
            <tbody>
              {dados.map((p) => (
                <tr key={p.id} onClick={() => setDet(p)} style={{ cursor: 'pointer' }}>
                  <td>{p.nome}</td>
                  <td>{p.tipo_pessoa === 'F' ? 'Física' : p.tipo_pessoa === 'J' ? 'Jurídica' : '—'}</td>
                  <td>{(p.papeis ?? []).map((x) => PAPEIS[x] ?? x).join(', ') || '—'}</td>
                  <td>{(p.identificadores ?? []).join(' · ') || '—'}</td>
                  <td className="num">{p.qtd_contatos_bling}</td>
                  <td>{p.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td>{p.tem_revisao ? <strong>revisar</strong> : <span className="mudo">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
      {det && <Vinculos ctx={ctx} parceiro={det} onFechar={() => setDet(null)} />}
    </>
  )
}

type AbaModal = 'contatos' | 'notas'
type ModoContato = 'todos' | 'recente' | 'completo'
const SIT_NOTA_TIPO: Record<number, string> = { 0: 'Entrada', 1: 'Saída' }

function Vinculos({ ctx, parceiro, onFechar }: { ctx: Contexto; parceiro: ParceiroLinha; onFechar: () => void }) {
  const [aba, setAba] = useState<AbaModal>('contatos')
  // Notas são dado fiscal/pessoal: mesmos papéis da tela Notas Bling (admin, gestor, financeiro).
  const abas = [{ id: 'contatos' as const, rotulo: 'Contatos do Bling', contagem: parceiro.qtd_contatos_bling }, ...(ctx.veCusto ? [{ id: 'notas' as const, rotulo: 'Histórico de notas' }] : [])]
  return (
    <Modal titulo={parceiro.nome} onFechar={onFechar} larga>
      <p className="sub">Identificadores: {(parceiro.identificadores ?? []).join(' · ') || '—'} · Criado em {data(parceiro.criado_em)}</p>
      <Abas abas={abas} ativa={aba} onMudar={setAba} />
      {aba === 'contatos' ? <Contatos ctx={ctx} parceiro={parceiro} /> : <NotasParceiro ctx={ctx} parceiro={parceiro} />}
    </Modal>
  )
}

function Contatos({ ctx, parceiro }: { ctx: Contexto; parceiro: ParceiroLinha }) {
  const { dados, erro, recarregar } = useCarregar(() => apiParceiros.contatos(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const [ocultarManual, setOcultarManual] = useState<boolean | null>(null)
  const [modo, setModo] = useState<ModoContato>('todos')
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const todos = dados ?? []
  const temAtivo = todos.some((c) => !c.inativo)
  // Padrão: com vários contatos e ao menos um ativo, esconde os inativos. O usuário pode mudar.
  const ocultar = ocultarManual ?? (todos.length > 1 && temAtivo)
  let lista = ocultar ? todos.filter((c) => !c.inativo) : todos
  if (modo === 'recente') lista = lista.filter((c) => c.mais_recente)
  if (modo === 'completo') lista = lista.filter((c) => c.mais_completo)
  const legado = todos.some((c) => c.legado)

  async function principal(blingId: number | null) {
    setSalvando(true); setFalha(null)
    try { await apiParceiros.definirPrincipal(ctx.empresa, parceiro.id, blingId); recarregar() }
    catch (e) { setFalha((e as Error).message) } finally { setSalvando(false) }
  }

  return (
    <>
      {erro && <div className="erro">{erro}</div>}
      {falha && <div className="erro" role="alert">{falha}</div>}
      {!dados && !erro && <p className="sub">Carregando…</p>}
      {dados && (
        <>
          <div className="filtros-contato">
            <label><input type="checkbox" checked={ocultar} onChange={(e) => setOcultarManual(e.target.checked)} />Ocultar inativos</label>
            <div className="chips" role="group" aria-label="Quais contatos mostrar">
              {([['todos', 'Todos'], ['recente', 'Só o mais recente'], ['completo', 'Só o mais completo']] as [ModoContato, string][]).map(([k, r]) => (
                <button key={k} type="button" className={modo === k ? 'chip sel' : 'chip'} onClick={() => setModo(k)}>{r}</button>
              ))}
            </div>
            <span className="mudo">Mostrando {lista.length} de {todos.length}</span>
          </div>
          <p className="sub" style={{ margin: '4px 0 8px' }}>
            “Mais recente” = maior ID no Bling (o Bling não informa a data de alteração). “Mais completo” = pontos por CPF/CNPJ válido, @, telefone, detalhe lido e contato ativo (máx. 5).
            {legado && ' Recursos de principal e notas por contato ficam disponíveis após aplicar a migration 0024.'}
          </p>
          {lista.length === 0 ? <Vazio titulo="Nenhum contato com esses filtros" texto="Desmarque “Ocultar inativos” ou escolha “Todos”." /> : (
            <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
              <table>
                <thead><tr><th>ID Bling</th><th>Nome no Bling (cru)</th><th>Marcas</th><th>Doc.</th><th>@</th>{ctx.veContato && <th>Telefone</th>}<th className="num">Compl.</th>{ctx.veCusto && <th className="num">Notas</th>}<th>Critério</th><th>Status</th>{ctx.veContato && !legado && <th />}</tr></thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.bling_id} className={c.inativo ? 'linha-inativa' : undefined}>
                      <td>{c.bling_id}</td><td className="col-nome" title={c.nome_cru ?? undefined}>{c.nome_cru}</td>
                      <td className="marcas">
                        {c.principal && <span className="selo selo-disponivel">Principal</span>}
                        {c.mais_recente && <span className="selo">Mais recente</span>}
                        {c.mais_completo && <span className="selo">Mais completo</span>}
                        {c.inativo && <span className="selo selo-baixada">{SIT[c.situacao ?? ''] ?? 'Inativo'}</span>}
                      </td>
                      <td>{c.documento_ultimos ? `***${c.documento_ultimos}${c.documento_valido === false ? ' (inválido)' : ''}` : '—'}</td>
                      <td>{c.handle_social ? `@${c.handle_social}` : '—'}</td>
                      {ctx.veContato && <td>{c.telefone ?? '—'}</td>}
                      <td className="num">{c.completude}/5</td>
                      {ctx.veCusto && <td className="num">{c.qtd_notas ?? '—'}</td>}
                      <td>{CRITERIO[c.criterio] ?? c.criterio}</td>
                      <td title={c.motivo ?? undefined}>{STATUS[c.status] ?? c.status}</td>
                      {ctx.veContato && !legado && (
                        <td>{c.status === 'vinculado' && (c.principal
                          ? <button className="sec" disabled={salvando} onClick={() => principal(null)}>Remover principal</button>
                          : <button className="sec" disabled={salvando} onClick={() => principal(c.bling_id)}>Definir principal</button>)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}

function NotasParceiro({ ctx, parceiro }: { ctx: Contexto; parceiro: ParceiroLinha }) {
  const [offset, setOffset] = useState(0)
  const [det, setDet] = useState<number | null>(null)
  const resumo = useCarregar(() => apiParceiros.resumoNotas(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const lista = useCarregar(() => apiParceiros.notas(ctx.empresa, parceiro.id, offset, LIMITE_NOTAS), [ctx.empresa, parceiro.id, offset])
  const r = resumo.dados
  const total = lista.dados?.[0]?.total ?? 0
  const erro = resumo.erro ?? lista.erro
  return (
    <>
      {erro && <div className="erro">{/migration pendente/i.test(erro) ? 'Histórico de notas indisponível: a migration 0024 ainda não foi aplicada no banco.' : erro}</div>}
      {r && (
        <>
          <div className="resumo-notas">
            <div><small>Notas</small><strong>{r.qtd_notas}</strong></div>
            <div><small>Valor total</small><strong>{brl(r.valor_total)}</strong></div>
            <div><small>Ticket médio</small><strong>{r.ticket_medio == null ? '—' : brl(r.ticket_medio)}</strong></div>
            <div><small>Primeira nota</small><strong>{r.primeira ? data(r.primeira) : '—'}</strong></div>
            <div><small>Última nota</small><strong>{r.ultima ? data(r.ultima) : '—'}</strong></div>
          </div>
          <p className="sub" style={{ margin: '6px 0' }}>
            {Object.entries(r.por_situacao ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Sem notas vinculadas'}
            {r.qtd_sem_detalhe > 0 && ` · ${r.qtd_sem_detalhe} sem detalhe lido (valor ainda desconhecido)`}
            {r.qtd_notas > 0 && ' · Valor total e ticket médio não contam canceladas, rejeitadas e denegadas; códigos de situação ainda não validados na conta.'}
          </p>
        </>
      )}
      {lista.carregando && !lista.dados && <p className="sub">Carregando…</p>}
      {lista.dados && lista.dados.length === 0 && !erro && <Vazio titulo="Sem notas" texto="Nenhuma nota lida do Bling para os contatos deste parceiro (a carga das notas ainda pode estar em andamento)." />}
      {lista.dados && lista.dados.length > 0 && (
        <div style={{ maxHeight: '45vh', overflow: 'auto' }}>
          <table>
            <thead><tr><th>Emissão</th><th>Nota</th><th>Tipo</th><th>Situação</th><th className="num">Valor</th><th className="num">Frete</th><th className="num">Itens</th><th>Contato Bling</th></tr></thead>
            <tbody>
              {lista.dados.map((n) => (
                <tr key={n.bling_id} onClick={() => setDet(n.bling_id)} style={{ cursor: 'pointer' }}>
                  <td>{n.data_emissao ? data(n.data_emissao) : '—'}</td>
                  <td>{n.numero}{n.serie != null ? `/${n.serie}` : ''}</td>
                  <td>{n.tipo != null ? SIT_NOTA_TIPO[n.tipo] ?? n.tipo : '—'}</td>
                  <td>{n.situacao} · {n.situacao_rotulo ?? '—'}</td>
                  <td className="num">{n.tem_detalhe ? brl(n.valor_nota) : <span className="mudo">sem detalhe</span>}</td>
                  <td className="num">{n.tem_detalhe ? brl(n.valor_frete) : '—'}</td>
                  <td className="num">{n.qtd_itens ?? '—'}</td>
                  <td>{n.contato_bling_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE_NOTAS} onMudar={setOffset} />
      {det !== null && <DetalheNota ctx={ctx} id={det} onFechar={() => setDet(null)} />}
    </>
  )
}

function Pendentes({ ctx, status }: { ctx: Contexto; status: 'revisao' | 'proposto' }) {
  const [busca, setBusca] = useState('')
  const [offset, setOffset] = useState(0)
  const { dados, erro, carregando } = useCarregar(() => apiParceiros.pendentes(ctx.empresa, status, busca, offset, LIMITE), [ctx.empresa, status, busca, offset])
  const total = dados?.[0]?.total ?? 0
  return (
    <>
      <p className="sub">{status === 'revisao' ? 'Contato com o documento de um parceiro e o @ de outro: não foi fundido automaticamente.' : 'Contatos sem CPF/CNPJ válido nem @: ficam fora do cadastro oficial até haver uma chave confiável.'}</p>
      <div style={{ margin: '8px 0' }}><Busca valor={busca} onMudar={(v) => { setOffset(0); setBusca(v) }} placeholder="Buscar por nome ou ID do Bling" /></div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && <Vazio titulo="Nada pendente" texto="Nenhum contato nesta situação." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>ID Bling</th><th>Nome no Bling (cru)</th><th>Sit.</th><th>Doc.</th><th>@</th><th>Motivo</th><th>Parceiro</th></tr></thead>
            <tbody>
              {dados.map((p: PendenteLinha) => (
                <tr key={p.bling_id}>
                  <td>{p.bling_id}</td><td>{p.nome_cru}</td><td>{SIT[p.situacao ?? ''] ?? p.situacao}</td>
                  <td>{p.documento_ultimos ? `***${p.documento_ultimos}${p.documento_valido === false ? ' (inválido)' : ''}` : '—'}</td>
                  <td>{p.handle_social ? `@${p.handle_social}` : '—'}</td><td>{p.motivo ?? '—'}</td><td>{p.parceiro_nome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
    </>
  )
}
