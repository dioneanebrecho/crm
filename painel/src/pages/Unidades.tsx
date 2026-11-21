import { useState } from 'react'
import { api } from '../api'
import { Busca, ESTADOS, Paginacao, Selo, useCarregar, Vazio } from '../ui'
import type { Contexto } from '../App'

const LIMITE = 50

export default function Unidades({ ctx }: { ctx: Contexto }) {
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [local, setLocal] = useState('')
  const [offset, setOffset] = useState(0)
  const locais = useCarregar(() => api.locais(ctx.empresa), [ctx.empresa])
  const { dados, erro, carregando } = useCarregar(() => api.unidades(ctx.empresa, { busca, estado, local }, offset, LIMITE),
                                                    [ctx.empresa, busca, estado, local, offset])
  const total = dados?.[0]?.total ?? 0
  const filtrar = (fn: () => void) => { setOffset(0); fn() }

  return (
    <section>
      <div className="topo"><div><h1>Estoque</h1><p className="sub">Cada unidade física, com estado e local. As unidades são criadas dentro da peça.</p></div></div>
      <div className="filtros">
        <Busca valor={busca} onMudar={(v) => filtrar(() => setBusca(v))} placeholder="Buscar por código da unidade, peça ou nome" />
        <select value={estado} onChange={(e) => filtrar(() => setEstado(e.target.value))} aria-label="Estado">
          <option value="">Todos os estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={local} onChange={(e) => filtrar(() => setLocal(e.target.value))} aria-label="Local">
          <option value="">Todos os locais</option>
          {(locais.dados ?? []).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && <Vazio titulo="Nenhuma unidade" texto="Abra uma peça, adicione um tamanho e crie as unidades em estoque." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>Unidade</th><th>Peça</th><th>Tamanho</th><th>Estado</th><th>Local</th><th>Observação</th></tr></thead>
            <tbody>
              {dados.map((u) => (
                <tr key={u.id}>
                  <td><code>{u.codigo}</code></td><td>{u.peca_codigo} · {u.peca_nome}</td><td>{u.tamanho}</td>
                  <td><Selo estado={u.estado} /></td><td>{u.local_nome}</td><td className="mudo">{u.observacao ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
    </section>
  )
}
