import { useState } from 'react'
import { api, type Local } from '../api'
import { Campo, Formulario, Modal, useCarregar, Vazio } from '../ui'
import type { Contexto } from '../App'

export default function Locais({ ctx }: { ctx: Contexto }) {
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.locais(ctx.empresa), [ctx.empresa])
  const [editando, setEditando] = useState<Local | 'novo' | null>(null)

  return (
    <section>
      <div className="topo">
        <div><h1>Locais de estoque</h1><p className="sub">Onde as peças ficam guardadas (estoque principal, loja física, live…).</p></div>
        {ctx.podeCatalogo && <button onClick={() => setEditando('novo')}>+ Novo local</button>}
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && (
        <Vazio titulo="Nenhum local cadastrado" texto="Crie pelo menos um local antes de registrar unidades de peças."
               acao={ctx.podeCatalogo ? <button onClick={() => setEditando('novo')}>Criar o primeiro local</button> : undefined} />
      )}
      {dados && dados.length > 0 && (
        <table>
          <thead><tr><th>Nome</th><th>Vendável</th><th>Situação</th><th className="num">Unidades</th><th /></tr></thead>
          <tbody>
            {dados.map((l) => (
              <tr key={l.id}>
                <td>{l.nome}</td><td>{l.vendavel ? 'Sim' : 'Não'}</td>
                <td>{l.ativo ? 'Ativo' : <span className="mudo">Inativo</span>}</td>
                <td className="num">{l.qtd_unidades}</td>
                <td className="num">{ctx.podeCatalogo && <button className="link" onClick={() => setEditando(l)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editando && <LocalForm ctx={ctx} local={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)}
                              onSalvo={() => { setEditando(null); recarregar() }} />}
    </section>
  )
}

function LocalForm({ ctx, local, onFechar, onSalvo }: { ctx: Contexto; local: Local | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(local?.nome ?? '')
  const [vendavel, setVendavel] = useState(local?.vendavel ?? true)
  const [ativo, setAtivo] = useState(local?.ativo ?? true)
  return (
    <Modal titulo={local ? 'Editar local' : 'Novo local'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        await api.salvarLocal(ctx.empresa, { id: local?.id, nome, vendavel, ativo }); onSalvo()
      }}>
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required /></Campo>
        <label className="check"><input type="checkbox" checked={vendavel} onChange={(e) => setVendavel(e.target.checked)} /> Peças deste local podem ser vendidas</label>
        {local && <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Local ativo</label>}
      </Formulario>
    </Modal>
  )
}
