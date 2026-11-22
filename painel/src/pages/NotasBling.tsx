import { useState } from 'react'
import { apiBling, brl, data, type NfeLinha } from '../api'
import { Busca, Modal, Paginacao, useCarregar, Vazio } from '../ui'
import type { Contexto } from '../App'

const LIMITE = 50
const SITUACOES: Record<string, string> = { '1': 'Pendente', '4': 'Rejeitada', '5': 'Autorizada', '6': 'Emitida DANFE' }
const MATCH: Record<string, string> = { ativo: 'Produto ativo', so_excluido: 'Só excluído', multiplos_ativos: 'Vários ativos', sem_match: 'Sem produto' }

export default function NotasBling({ ctx, inicial }: { ctx: Contexto; inicial?: string }) {
  const [busca, setBusca] = useState(inicial ?? '')
  const [sit, setSit] = useState('')
  const [offset, setOffset] = useState(0)
  const [det, setDet] = useState<number | null>(null)
  const { dados, erro, carregando } = useCarregar(() => apiBling.notas(ctx.empresa, busca, sit, offset, LIMITE), [ctx.empresa, busca, sit, offset])
  const total = dados?.[0]?.total ?? 0
  return (
    <section>
      <div className="topo"><div><h1>Notas Bling</h1><p className="sub">NF-e lidas do Bling (somente leitura). Contém dado pessoal: visível só para admin, gestor e financeiro. Os códigos de situação ainda precisam ser validados na conta.</p></div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <Busca valor={busca} onMudar={(v) => { setOffset(0); setBusca(v) }} placeholder="Buscar por número, cliente, código ou descrição do item" />
        <select value={sit} onChange={(e) => { setOffset(0); setSit(e.target.value) }} aria-label="Situação">
          <option value="">Situação: todas</option>{Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
        </select>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && <Vazio titulo="Nada encontrado" texto="Ajuste a busca ou o filtro." />}
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

export function DetalheNota({ ctx, id, onFechar }: { ctx: Contexto; id: number; onFechar: () => void }) {
  const { dados, erro } = useCarregar(() => apiBling.nota(ctx.empresa, id), [ctx.empresa, id])
  return (
    <Modal titulo={`Nota Bling ${id}`} onFechar={onFechar}>
      {erro && <div className="erro">{erro}</div>}
      {!dados && !erro && <p className="sub">Carregando…</p>}
      {dados && (
        <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <h3>Cabeçalho mapeado</h3>
          <table><tbody>{Object.entries(dados.nota).map(([k, v]) => <tr key={k}><td className="mudo">{k}</td><td>{String(v ?? '—')}</td></tr>)}</tbody></table>
          <h3>Itens ({dados.itens.length})</h3>
          {dados.itens.length === 0 ? <p className="sub">Detalhe ainda não lido para esta nota.</p> : (
            <table>
              <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Tam.</th><th className="num">Qtd</th><th className="num">Valor</th><th>NCM</th><th>CFOP</th><th>Produto</th></tr></thead>
              <tbody>{dados.itens.map((i) => (
                <tr key={String(i.seq)}><td>{String(i.seq)}</td><td>{String(i.codigo ?? '—')}</td><td>{String(i.descricao ?? '')}</td><td>{String(i.grade_cru ?? '—')}</td>
                  <td className="num">{String(i.quantidade)}</td><td className="num">{brl(i.valor as number)}</td><td>{String(i.ncm ?? '')}</td><td>{String(i.cfop ?? '')}</td>
                  <td>{MATCH[String(i.match_status)] ?? String(i.match_status)}{i.produto_bling_id ? ` (${i.produto_bling_id})` : ''}</td></tr>))}</tbody>
            </table>)}
        </div>
      )}
    </Modal>
  )
}
