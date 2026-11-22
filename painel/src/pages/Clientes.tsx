import { useState } from 'react'
import { api, data, type ClienteLinha } from '../api'
import { Busca, Campo, Formulario, LimparFiltros, Modal, Paginacao, useCarregar, Vazio } from '../ui'
import { useEstadoTela } from '../abas'
import type { Contexto } from '../App'

const LIMITE = 50

export default function Clientes({ ctx, inicial }: { ctx: Contexto; inicial?: string }) {
  const [busca, setBusca] = useEstadoTela('clientes.busca', '', inicial)
  const [offset, setOffset] = useEstadoTela('clientes.offset', 0)
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.clientes(ctx.empresa, busca, offset, LIMITE), [ctx.empresa, busca, offset])
  const [form, setForm] = useState<ClienteLinha | 'novo' | null>(null)
  const total = dados?.[0]?.total ?? 0

  return (
    <section>
      <div className="topo">
        <div><h1>Clientes</h1><p className="sub">Quem participa das lives. Contato (telefone e e-mail) aparece só para quem atende clientes.</p></div>
        {ctx.podeCliente && <button onClick={() => setForm('novo')}>+ Novo cliente</button>}
      </div>
      <div className="filtros">
        <Busca valor={busca} onMudar={(v) => { setOffset(0); setBusca(v) }} placeholder="Buscar por nome, @ do Instagram, telefone ou e-mail" />
        <LimparFiltros ativo={!!busca} onLimpar={() => { setOffset(0); setBusca('') }} />
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && (
        <Vazio titulo={busca ? 'Nada encontrado' : 'Nenhum cliente cadastrado'}
               texto={busca ? 'Tente outro termo.' : 'Clientes também serão criados automaticamente quando a leitura da live for ligada.'}
               acao={!busca && ctx.podeCliente ? <button onClick={() => setForm('novo')}>Cadastrar cliente</button> : undefined} />
      )}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>Nome</th><th>Instagram</th><th>Telefone</th><th>E-mail</th><th>Cadastro</th><th /></tr></thead>
            <tbody>
              {dados.map((c) => (
                <tr key={c.id}>
                  <td>{c.anonimizado ? <span className="mudo">(anonimizado)</span> : c.nome ?? '—'}</td>
                  <td>{c.instagram_username ? `@${c.instagram_username}` : '—'}</td>
                  <td>{c.telefone ?? (ctx.veContato ? '—' : <span className="mudo">restrito</span>)}</td>
                  <td>{c.email ?? (ctx.veContato ? '—' : <span className="mudo">restrito</span>)}</td>
                  <td>{data(c.criado_em)}</td>
                  <td className="num">{ctx.podeCliente && !c.anonimizado && <button className="link" onClick={() => setForm(c)}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
      {form && <ClienteForm ctx={ctx} cliente={form === 'novo' ? null : form} onFechar={() => setForm(null)} onSalvo={() => { setForm(null); recarregar() }} />}
    </section>
  )
}

function ClienteForm({ ctx, cliente, onFechar, onSalvo }: { ctx: Contexto; cliente: ClienteLinha | null; onFechar: () => void; onSalvo: () => void }) {
  const [v, setV] = useState({ nome: cliente?.nome ?? '', instagram: cliente?.instagram_username ?? '', telefone: cliente?.telefone ?? '',
                               email: cliente?.email ?? '', obs: cliente?.observacao_interna ?? '' })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal titulo={cliente ? 'Editar cliente' : 'Novo cliente'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => { await api.salvarCliente(ctx.empresa, { id: cliente?.id, ...v }); onSalvo() }}>
        <Campo rotulo="Nome"><input value={v.nome} onChange={set('nome')} autoFocus /></Campo>
        <Campo rotulo="@ do Instagram" dica="Informe o nome ou o @ (pelo menos um)."><input value={v.instagram} onChange={set('instagram')} placeholder="@usuario" /></Campo>
        <div className="grade2">
          <Campo rotulo="Telefone"><input value={v.telefone} onChange={set('telefone')} inputMode="tel" /></Campo>
          <Campo rotulo="E-mail"><input type="email" value={v.email} onChange={set('email')} /></Campo>
        </div>
        <Campo rotulo="Observação interna" dica="Visível só para a equipe. Evite dados sensíveis."><textarea value={v.obs} onChange={set('obs')} rows={3} /></Campo>
      </Formulario>
    </Modal>
  )
}
