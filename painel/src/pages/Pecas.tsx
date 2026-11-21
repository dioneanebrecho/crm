import { useState } from 'react'
import { api, brl, data, type PecaDetalhe } from '../api'
import { Busca, Campo, Formulario, Modal, Paginacao, Selo, useCarregar, Vazio } from '../ui'
import type { Contexto } from '../App'

const LIMITE = 50

export default function Pecas({ ctx }: { ctx: Contexto }) {
  const [busca, setBusca] = useState('')
  const [offset, setOffset] = useState(0)
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.pecas(ctx.empresa, busca, offset, LIMITE), [ctx.empresa, busca, offset])
  const [form, setForm] = useState<'nova' | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const total = dados?.[0]?.total ?? 0

  return (
    <section>
      <div className="topo">
        <div><h1>Peças</h1><p className="sub">Cadastro de peças, tamanhos (grade) e quantidade em estoque.</p></div>
        {ctx.podeCatalogo && <button onClick={() => setForm('nova')}>+ Nova peça</button>}
      </div>
      <Busca valor={busca} onMudar={(v) => { setOffset(0); setBusca(v) }} placeholder="Buscar por código, nome, marca ou categoria" />
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && (
        <Vazio titulo={busca ? 'Nada encontrado' : 'Nenhuma peça cadastrada'}
               texto={busca ? 'Tente outro termo de busca.' : 'Cadastre a primeira peça, depois adicione os tamanhos e as unidades em estoque.'}
               acao={!busca && ctx.podeCatalogo ? <button onClick={() => setForm('nova')}>Cadastrar a primeira peça</button> : undefined} />
      )}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>Código</th><th>Nome</th><th>Categoria</th><th>Marca</th><th>Condição</th>
              <th className="num">Preço</th>{ctx.veCusto && <th className="num">Custo</th>}<th className="num">Tamanhos</th><th className="num">Disp./Total</th></tr></thead>
            <tbody>
              {dados.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => setAberta(p.id)}>
                  <td><code>{p.codigo}</code></td><td>{p.nome}</td><td>{p.categoria ?? '—'}</td><td>{p.marca ?? '—'}</td>
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
      {form && <PecaForm ctx={ctx} peca={null} onFechar={() => setForm(null)}
                         onSalvo={(id) => { setForm(null); recarregar(); setAberta(id) }} />}
      {aberta && <PecaDetalheModal ctx={ctx} id={aberta} onFechar={() => { setAberta(null); recarregar() }} />}
    </section>
  )
}

interface PecaEditavel { id: string; codigo: string; nome: string; descricao: string | null; categoria: string | null; marca: string | null
                         condicao: 'nova' | 'usada'; custo: number | null; preco_tabela: number | null }

function PecaForm({ ctx, peca, onFechar, onSalvo }: { ctx: Contexto; peca: PecaEditavel | null; onFechar: () => void; onSalvo: (id: string) => void }) {
  const [v, setV] = useState({
    codigo: peca?.codigo ?? '', nome: peca?.nome ?? '', descricao: peca?.descricao ?? '', categoria: peca?.categoria ?? '',
    marca: peca?.marca ?? '', condicao: peca?.condicao ?? 'usada',
    custo: peca?.custo != null ? String(peca.custo).replace('.', ',') : '', preco: peca?.preco_tabela != null ? String(peca.preco_tabela).replace('.', ',') : '',
  })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal titulo={peca ? 'Editar peça' : 'Nova peça'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => { onSalvo(await api.salvarPeca(ctx.empresa, { id: peca?.id, ...v })) }}>
        <div className="grade2">
          <Campo rotulo="Código" dica="Único na empresa. Ex.: VES-001"><input value={v.codigo} onChange={set('codigo')} required autoFocus /></Campo>
          <Campo rotulo="Condição"><select value={v.condicao} onChange={set('condicao')}><option value="usada">Usada</option><option value="nova">Nova</option></select></Campo>
        </div>
        <Campo rotulo="Nome"><input value={v.nome} onChange={set('nome')} required /></Campo>
        <div className="grade2">
          <Campo rotulo="Categoria"><input value={v.categoria} onChange={set('categoria')} /></Campo>
          <Campo rotulo="Marca"><input value={v.marca} onChange={set('marca')} /></Campo>
        </div>
        <div className="grade2">
          <Campo rotulo="Preço de tabela (R$)"><input value={v.preco} onChange={set('preco')} inputMode="decimal" placeholder="0,00" /></Campo>
          <Campo rotulo="Custo (R$)"><input value={v.custo} onChange={set('custo')} inputMode="decimal" placeholder="0,00" /></Campo>
        </div>
        <Campo rotulo="Descrição"><textarea value={v.descricao} onChange={set('descricao')} rows={3} /></Campo>
      </Formulario>
    </Modal>
  )
}

function PecaDetalheModal({ ctx, id, onFechar }: { ctx: Contexto; id: string; onFechar: () => void }) {
  const { dados, erro, recarregar } = useCarregar(() => api.peca(ctx.empresa, id), [ctx.empresa, id])
  const [acao, setAcao] = useState<'editar' | 'variacao' | { unidades: string } | null>(null)
  return (
    <Modal titulo={dados ? `${dados.peca.codigo} · ${dados.peca.nome}` : 'Peça'} onFechar={onFechar}>
      {erro && <div className="erro">{erro}</div>}
      {dados && (
        <div className="detalhe">
          <dl className="ficha">
            <div><dt>Preço</dt><dd>{brl(dados.peca.preco_tabela)}</dd></div>
            {ctx.veCusto && <div><dt>Custo</dt><dd>{brl(dados.peca.custo)}</dd></div>}
            <div><dt>Condição</dt><dd>{dados.peca.condicao === 'nova' ? 'Nova' : 'Usada'}</dd></div>
            <div><dt>Categoria</dt><dd>{dados.peca.categoria ?? '—'}</dd></div>
            <div><dt>Marca</dt><dd>{dados.peca.marca ?? '—'}</dd></div>
            <div><dt>Atualizada</dt><dd>{data(dados.peca.atualizado_em)}</dd></div>
          </dl>
          {dados.peca.descricao && <p>{dados.peca.descricao}</p>}
          <div className="acoes-topo">
            {ctx.podeCatalogo && <button className="sec" onClick={() => setAcao('editar')}>Editar peça</button>}
            {ctx.podeCatalogo && <button className="sec" onClick={() => setAcao('variacao')}>+ Tamanho</button>}
          </div>
          <h3>Grade e estoque</h3>
          {dados.variacoes.length === 0 && <Vazio titulo="Sem tamanhos" texto="Adicione um tamanho (P, M, G, 38…) para poder registrar unidades." />}
          {dados.variacoes.map((va) => (
            <div key={va.id} className="bloco">
              <div className="bloco-topo">
                <strong>Tamanho {va.tamanho}</strong> <code>{va.codigo}</code>
                <span className="mudo">{va.unidades.filter((u) => u.estado === 'disponivel').length} disponíveis · {va.unidades.length} no total</span>
                {ctx.podeUnidade && <button className="link" onClick={() => setAcao({ unidades: va.id })}>+ Unidades</button>}
              </div>
              {va.unidades.length > 0 && (
                <table className="compacta"><tbody>
                  {va.unidades.map((u) => (
                    <tr key={u.id}><td><code>{u.codigo}</code></td><td><Selo estado={u.estado} /></td><td>{u.local_nome}</td><td className="mudo">{u.observacao ?? ''}</td></tr>
                  ))}
                </tbody></table>
              )}
            </div>
          ))}
          {acao === 'editar' && <PecaForm ctx={ctx} peca={{ ...dados.peca }} onFechar={() => setAcao(null)} onSalvo={() => { setAcao(null); recarregar() }} />}
          {acao === 'variacao' && <VariacaoForm ctx={ctx} peca={id} onFechar={() => setAcao(null)} onSalvo={() => { setAcao(null); recarregar() }} />}
          {acao && typeof acao === 'object' && <UnidadesForm ctx={ctx} detalhe={dados} variacao={acao.unidades} onFechar={() => setAcao(null)}
                                                            onSalvo={() => { setAcao(null); recarregar() }} />}
        </div>
      )}
    </Modal>
  )
}

function VariacaoForm({ ctx, peca, onFechar, onSalvo }: { ctx: Contexto; peca: string; onFechar: () => void; onSalvo: () => void }) {
  const [tamanho, setTamanho] = useState('')
  return (
    <Modal titulo="Novo tamanho" onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => { await api.salvarVariacao(ctx.empresa, peca, tamanho); onSalvo() }}>
        <Campo rotulo="Tamanho" dica="Ex.: P, M, G, 38, ÚNICO. O código da variação é gerado a partir do código da peça.">
          <input value={tamanho} onChange={(e) => setTamanho(e.target.value)} required autoFocus />
        </Campo>
      </Formulario>
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
    <Modal titulo={`Adicionar unidades · ${va?.codigo ?? ''}`} onFechar={onFechar}>
      {locais.dados && ativos.length === 0 ? (
        <Vazio titulo="Nenhum local ativo" texto="Cadastre um local na aba Locais antes de criar unidades." />
      ) : (
        <Formulario onCancelar={onFechar} enviarRotulo="Criar unidades"
                    onEnviar={async () => { await api.criarUnidades(ctx.empresa, variacao, local || ativos[0].id, Number(qtd), obs); onSalvo() }}>
          <div className="grade2">
            <Campo rotulo="Quantidade" dica="De 1 a 200. Cada unidade ganha um código sequencial.">
              <input type="number" min={1} max={200} value={qtd} onChange={(e) => setQtd(e.target.value)} required autoFocus />
            </Campo>
            <Campo rotulo="Local">
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
