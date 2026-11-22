import { useState, type ReactNode } from 'react'
import { apiBling, brl, data, type NfeLinha } from '../api'
import { Abas, Busca, LimparFiltros, Modal, Paginacao, useCarregar, Vazio } from '../ui'
import { useEstadoTela } from '../abas'
import type { Contexto } from '../App'
import PeriodoData from '../PeriodoData'

const LIMITE = 50
const SITUACOES: Record<string, string> = { '1': 'Pendente', '4': 'Rejeitada', '5': 'Autorizada', '6': 'Emitida DANFE' }
const MATCH: Record<string, string> = { ativo: 'Produto ativo', so_excluido: 'Só excluído', multiplos_ativos: 'Vários ativos', sem_match: 'Sem produto' }

export default function NotasBling({ ctx, inicial }: { ctx: Contexto; inicial?: string }) {
  const [busca, setBusca] = useEstadoTela('notas.busca', '', inicial)
  const [sit, setSit] = useEstadoTela('notas.sit', '')
  const [dIni, setDIni] = useEstadoTela('notas.ini', '')
  const [dFim, setDFim] = useEstadoTela('notas.fim', '')
  const [offset, setOffset] = useEstadoTela('notas.offset', 0)
  const limpar = () => { setOffset(0); setBusca(''); setSit(''); setDIni(''); setDFim('') }
  const [det, setDet] = useState<number | null>(null)
  const { dados, erro, carregando } = useCarregar(() => apiBling.notas(ctx.empresa, busca, sit, offset, LIMITE, dIni, dFim), [ctx.empresa, busca, sit, offset, dIni, dFim])
  const total = dados?.[0]?.total ?? 0
  return (
    <section>
      <div className="topo"><div><h1>Notas Bling</h1><p className="sub">NF-e lidas do Bling (somente leitura). Contém dado pessoal: visível só para admin, gestor e financeiro. Os códigos de situação ainda precisam ser validados na conta.</p></div></div>
      <div className="filtros">
        <Busca valor={busca} onMudar={(v) => { setOffset(0); setBusca(v) }} placeholder="Buscar por número, cliente, código ou descrição do item" />
        <select value={sit} onChange={(e) => { setOffset(0); setSit(e.target.value) }} aria-label="Situação">
          <option value="">Situação: todas</option>{Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
        </select>
        <PeriodoData rotulo="Emissão" ini={dIni} fim={dFim} onAplicar={(a, b) => { setOffset(0); setDIni(a); setDFim(b) }} />
        <LimparFiltros ativo={!!(busca || sit || dIni || dFim)} onLimpar={limpar} />
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && <Vazio titulo="Nada encontrado" texto="Ajuste a busca, a situação ou o período." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel"><table>
          <thead><tr><th>Número</th><th>Emissão</th><th>Situação</th><th>Canal</th><th>Cliente (Bling)</th><th className="num">Valor</th><th>Itens</th><th>XML</th></tr></thead>
          <tbody>{dados.map((n: NfeLinha) => (
            <tr key={n.bling_id} onClick={() => setDet(n.bling_id)} style={{ cursor: 'pointer' }}>
              <td>{n.numero}{n.serie != null ? `/${n.serie}` : ''}</td>
              <td>{n.data_emissao ? data(n.data_emissao) : '—'}</td>
              <td>{n.situacao} · {n.situacao_rotulo ?? '—'}</td>
              <td>{n.loja_id ? n.loja_id : 'sem canal'}</td>
              <td>{n.contato_nome ?? '—'}</td>
              <td className="num">{n.tem_detalhe ? brl(n.valor_nota) : <span className="mudo">sem detalhe</span>}</td>
              <td>{n.qtd_itens ?? '—'}</td>
              <td>{n.tem_detalhe ? (n.tem_xml ? 'link' : 'não') : '—'}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
      {det !== null && <DetalheNota ctx={ctx} id={det} onFechar={() => setDet(null)} />}
    </section>
  )
}

type AbaNota = 'itens' | 'resumo' | 'cliente' | 'tecnico'
const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="campo-nota"><span>{rotulo}</span><strong>{children}</strong></div>
}

export function DetalheNota({ ctx, id, onFechar }: { ctx: Contexto; id: number; onFechar: () => void }) {
  const { dados, erro } = useCarregar(() => apiBling.nota(ctx.empresa, id), [ctx.empresa, id])
  const [aba, setAba] = useState<AbaNota>('itens')
  const [link, setLink] = useState<{ url: string } | { vazio: true } | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erroLink, setErroLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function gerarLink() {
    setGerando(true); setErroLink(null)
    try {
      const l = await apiBling.linkDanfe(ctx.empresa, id)
      const url = l?.pdf ?? l?.danfe ?? null
      setLink(url ? { url } : { vazio: true })
    } catch (e) { setErroLink(e instanceof Error ? e.message : 'Não foi possível gerar o link.') } finally { setGerando(false) }
  }
  async function copiar(url: string) {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 1800) } catch { /* sem permissão de área de transferência */ }
  }

  const n = dados?.nota
  const itens = dados?.itens ?? []
  const totalItens = itens.reduce((a, i) => a + Number(i.valor_total ?? Number(i.valor ?? 0) * Number(i.quantidade ?? 0)), 0)
  const pecas = itens.reduce((a, i) => a + Number(i.quantidade ?? 0), 0)
  const sit = n ? `${txt(n.situacao)} · ${SITUACOES[String(n.situacao)] ?? '—'}` : ''
  const titulo = n ? `Nota ${txt(n.numero)}${n.serie != null ? `/${n.serie}` : ''}` : `Nota Bling ${id}`

  return (
    <Modal titulo={titulo} onFechar={onFechar} larga>
      {erro && <div className="erro">{erro}</div>}
      {!dados && !erro && <p className="sub">Carregando…</p>}
      {dados && n && (
        <>
          <div className="nota-topo">
            <div className="nota-resumo-linha">
              <span className="selo">{sit}</span>
              <span className="mudo">{n.data_emissao ? data(String(n.data_emissao)) : 'sem data de emissão'}</span>
              <span className="mudo">{txt(n.contato_nome)}</span>
              <strong className="nota-valor">{n.tem_detalhe ? brl(n.valor_nota as number) : '—'}</strong>
            </div>
            <div className="nota-link">
              {!link && <button type="button" onClick={() => void gerarLink()} disabled={gerando || !n.tem_detalhe} title={n.tem_detalhe ? '' : 'Detalhe ainda não lido do Bling'}>{gerando ? 'Gerando…' : 'Gerar link do DANFE (PDF)'}</button>}
              {link && 'url' in link && (
                <>
                  <a className="botao" href={link.url} target="_blank" rel="noopener noreferrer">Abrir DANFE (PDF)</a>
                  <button type="button" className="sec" onClick={() => void copiar(link.url)}>{copiado ? 'Copiado ✓' : 'Copiar link'}</button>
                </>
              )}
              {link && 'vazio' in link && <span className="sub">O Bling não devolveu link para esta nota.</span>}
            </div>
          </div>
          {!n.tem_detalhe && <div className="aviso-caixa" style={{ marginBottom: 10 }}>O detalhe desta nota ainda não foi lido do Bling: itens e link do DANFE ficam disponíveis depois da leitura.</div>}
          {erroLink && <div className="erro" style={{ marginBottom: 10 }}>{erroLink}</div>}
          {link && 'url' in link && <p className="sub" style={{ marginBottom: 10 }}>O link contém a chave de acesso da nota. Compartilhe só com quem precisa.</p>}

          <Abas<AbaNota> ativa={aba} onMudar={setAba} abas={[
            { id: 'itens', rotulo: 'Itens', contagem: itens.length },
            { id: 'resumo', rotulo: 'Resumo' },
            { id: 'cliente', rotulo: 'Cliente' },
            { id: 'tecnico', rotulo: 'Dados técnicos' },
          ]} />

          <div className="nota-corpo">
            {aba === 'itens' && (itens.length === 0 ? <p className="sub">Detalhe ainda não lido para esta nota.</p> : (
              <>
                <div className="nota-totais">
                  <Campo rotulo="Itens">{itens.length}</Campo>
                  <Campo rotulo="Peças">{pecas}</Campo>
                  <Campo rotulo="Total dos itens">{brl(totalItens)}</Campo>
                </div>
                <div className="tabela-rolavel"><table>
                  <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Tam.</th><th className="num">Qtd</th><th className="num">Valor</th><th className="num">Total</th><th>Produto</th></tr></thead>
                  <tbody>{itens.map((i) => (
                    <tr key={String(i.seq)}><td>{txt(i.seq)}</td><td>{txt(i.codigo)}</td><td style={{ whiteSpace: 'normal', minWidth: 220 }}>{String(i.descricao ?? '')}</td><td>{txt(i.grade_cru)}</td>
                      <td className="num">{txt(i.quantidade)}</td><td className="num">{brl(i.valor as number)}</td>
                      <td className="num"><strong>{brl((i.valor_total ?? Number(i.valor ?? 0) * Number(i.quantidade ?? 0)) as number)}</strong></td>
                      <td>{MATCH[String(i.match_status)] ?? txt(i.match_status)}</td></tr>))}</tbody>
                </table></div>
              </>
            ))}
            {aba === 'resumo' && (
              <div className="nota-grade">
                <Campo rotulo="Número / série">{txt(n.numero)}{n.serie != null ? ` / ${n.serie}` : ''}</Campo>
                <Campo rotulo="Situação">{sit}</Campo>
                <Campo rotulo="Emissão">{n.data_emissao ? data(String(n.data_emissao)) : '—'}</Campo>
                <Campo rotulo="Valor da nota">{brl(n.valor_nota as number)}</Campo>
                <Campo rotulo="Frete">{brl(n.valor_frete as number)}</Campo>
                <Campo rotulo="Canal">{n.loja_id ? String(n.loja_id) : 'sem canal'}</Campo>
                <Campo rotulo="Itens">{txt(n.qtd_itens)}</Campo>
                <Campo rotulo="XML">{n.tem_xml ? 'disponível' : 'não'}</Campo>
                <Campo rotulo="Simples Nacional">{n.optante_simples == null ? '—' : n.optante_simples ? 'sim' : 'não'}</Campo>
                <Campo rotulo="Chave de acesso"><span className="mono">{txt(n.chave_acesso)}</span></Campo>
              </div>
            )}
            {aba === 'cliente' && (
              <div className="nota-grade">
                <Campo rotulo="Cliente (Bling)">{txt(n.contato_nome)}</Campo>
                <Campo rotulo="Documento (final)">{txt(n.contato_doc_ultimos)}</Campo>
                <Campo rotulo="Id do contato no Bling">{txt(n.contato_bling_id)}</Campo>
                <Campo rotulo="Vendedor (id)">{txt(n.vendedor_id)}</Campo>
                <Campo rotulo="Forma de pagamento (id)">{txt(n.forma_pagamento_id)}</Campo>
              </div>
            )}
            {aba === 'tecnico' && (
              <table><tbody>{Object.entries(n).map(([k, v]) => <tr key={k}><td className="mudo">{k}</td><td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{txt(v)}</td></tr>)}</tbody></table>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
