import { useMemo, useRef, useState } from 'react'
import type { Contexto } from '../App'
import { Campo, Formulario, Modal, Titulo, Vazio, useCarregar } from '../ui'
import {
  apiAtendimento, CANAL_CONVERSA, CATEGORIAS, renderizarLocal, variaveisDoTexto,
  type CanalConversa, type Categoria, type RespostaPronta, type Variavel,
} from '../apiAtendimento'

// Biblioteca de respostas prontas da Caixa de entrada. O administrador cria; toda a equipe usa digitando "/atalho".
export default function RespostasProntas({ ctx }: { ctx: Contexto }) {
  const [inativas, setInativas] = useState(false)
  const [cat, setCat] = useState<'' | Categoria>('')
  const [q, setQ] = useState('')
  const [editando, setEditando] = useState<Partial<RespostaPronta> | null>(null)
  const b = useCarregar(() => apiAtendimento.biblioteca(ctx.empresa, true), [ctx.empresa])
  const lista = (b.dados?.respostas ?? []).filter((r) => (inativas || r.ativo) && (!cat || r.categoria === cat)
    && (!q || (r.atalho + ' ' + r.titulo + ' ' + r.corpo).toLowerCase().includes(q.toLowerCase())))
  const exemplos = useMemo(() => Object.fromEntries((b.dados?.variaveis ?? []).map((v) => [v.chave, v.exemplo])), [b.dados])
  const pode = !!b.dados?.pode_editar

  return (
    <section>
      <div className="topo">
        <div><Titulo ajuda={<>Modelos de mensagem com variáveis. Na Caixa de entrada, digite <kbd>/</kbd> e o atalho: o texto entra já com os dados da cliente (nome, reserva, Pix, pedido, rastreio).</>}>Respostas prontas</Titulo></div>
        {pode && <button onClick={() => setEditando({ categoria: 'geral', ativo: true, corpo: '' })}>+ Nova resposta</button>}
      </div>
      {!pode && b.dados && <p className="sub">Só o administrador cria e edita respostas. Você pode consultar e usar todas na Caixa de entrada.</p>}

      <div className="v-barra">
        <input className="busca" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por atalho, título ou texto" />
        <div className="chips">
          <button className={cat === '' ? 'chip sel' : 'chip'} onClick={() => setCat('')}>Todas</button>
          {(Object.keys(CATEGORIAS) as Categoria[]).map((k) => <button key={k} className={cat === k ? 'chip sel' : 'chip'} onClick={() => setCat(k)}>{CATEGORIAS[k]}</button>)}
        </div>
        <label className="at-nota"><input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} /> Mostrar inativas</label>
      </div>

      {b.erro && <div className="erro">{b.erro}</div>}
      {!b.dados && !b.erro && <p className="sub">Carregando…</p>}
      {b.dados && lista.length === 0 && <Vazio titulo="Nenhuma resposta" texto="Crie respostas para as perguntas que mais se repetem: link da reserva, Pix, prazo de envio, rastreio, troca." />}
      {lista.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>Atalho</th><th>Título</th><th>Categoria</th><th>Exemplo de como sai</th><th>Usos</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} className={pode ? 'clicavel' : ''} onClick={() => pode && setEditando(r)}>
                  <td><code>/{r.atalho}</code></td>
                  <td><strong>{r.titulo}</strong>{r.canais && <><br /><small className="mudo">Só {r.canais.map((c) => CANAL_CONVERSA[c].rotulo).join(', ')}</small></>}</td>
                  <td>{CATEGORIAS[r.categoria]}</td>
                  <td className="rp-exemplo">{renderizarLocal(r.corpo, exemplos).texto}</td>
                  <td>{r.usos}</td>
                  <td>{r.ativo ? <span className="selo v-etapa-paga">Ativa</span> : <span className="selo">Inativa</span>}{r.versao > 1 && <small className="mudo"> v{r.versao}</small>}</td>
                </tr>))}
            </tbody>
          </table>
        </div>)}

      {b.dados && (
        <details className="painel rp-vars">
          <summary>Variáveis disponíveis ({b.dados.variaveis.length})</summary>
          <p className="sub">Se a cliente não tiver o dado (ex.: sem reserva ativa), a Caixa de entrada avisa e não deixa enviar a mensagem com a variável vazia.</p>
          <table><tbody>{b.dados.variaveis.map((v) => <tr key={v.chave}><td><code>{`{{${v.chave}}}`}</code></td><td>{v.rotulo}</td><td className="mudo">{v.descricao}</td><td>{v.exemplo}</td></tr>)}</tbody></table>
        </details>)}

      {editando && b.dados && <Editor ctx={ctx} inicial={editando} variaveis={b.dados.variaveis} exemplos={exemplos}
                                      onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); b.recarregar() }} />}
    </section>
  )
}

function Editor({ ctx, inicial, variaveis, exemplos, onFechar, onSalvo }: {
  ctx: Contexto; inicial: Partial<RespostaPronta>; variaveis: Variavel[]; exemplos: Record<string, string>; onFechar: () => void; onSalvo: () => void
}) {
  const [f, setF] = useState<Partial<RespostaPronta>>(inicial)
  const corpoRef = useRef<HTMLTextAreaElement>(null)
  const set = <K extends keyof RespostaPronta>(k: K, v: RespostaPronta[K] | undefined) => setF((x) => ({ ...x, [k]: v }))
  const corpo = f.corpo ?? ''
  const desconhecidas = variaveisDoTexto(corpo).filter((k) => !variaveis.some((v) => v.chave === k))
  const previa = renderizarLocal(corpo, exemplos)
  const grupos = [...new Set(variaveis.map((v) => v.grupo))]
  const inserir = (chave: string) => {
    const el = corpoRef.current, ins = `{{${chave}}}`
    const ini = el?.selectionStart ?? corpo.length, fim = el?.selectionEnd ?? corpo.length
    const novo = corpo.slice(0, ini) + ins + corpo.slice(fim)
    set('corpo', novo)
    setTimeout(() => { el?.focus(); el?.setSelectionRange(ini + ins.length, ini + ins.length) }, 0)
  }
  const canais = f.canais ?? null
  const alternarCanal = (c: CanalConversa) => {
    const atual = canais ?? []
    const novo = atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]
    set('canais', novo.length ? novo : null)
  }
  async function salvar() {
    if (!/^[a-z0-9_-]{2,30}$/.test(f.atalho ?? '')) throw new Error('Atalho: de 2 a 30 caracteres, só letras minúsculas, números, - ou _ (sem espaço e sem acento).')
    if (!f.titulo?.trim()) throw new Error('Dê um título à resposta.')
    if (!corpo.trim()) throw new Error('Escreva o texto da resposta.')
    if (desconhecidas.length) throw new Error(`Variáveis que não existem: ${desconhecidas.join(', ')}.`)
    await apiAtendimento.salvarResposta(ctx.empresa, { id: f.id, atalho: f.atalho, titulo: f.titulo, categoria: f.categoria, corpo, canais, ativo: f.ativo })
    onSalvo()
  }
  return (
    <Modal titulo={f.id ? `Editar /${inicial.atalho}` : 'Nova resposta pronta'} onFechar={onFechar} larga>
      <Formulario onEnviar={salvar} onCancelar={onFechar}>
        <div className="grade-2">
          <Campo rotulo="Atalho" dica="Na Caixa de entrada, digite / e este atalho. Ex.: pix, rastreio, link">
            <div className="rp-atalho"><span>/</span><input value={f.atalho ?? ''} onChange={(e) => set('atalho', e.target.value.toLowerCase().replace(/\s+/g, '-'))} required /></div>
          </Campo>
          <Campo rotulo="Título"><input value={f.titulo ?? ''} onChange={(e) => set('titulo', e.target.value)} required /></Campo>
          <Campo rotulo="Categoria">
            <select value={f.categoria ?? 'geral'} onChange={(e) => set('categoria', e.target.value as Categoria)}>
              {(Object.keys(CATEGORIAS) as Categoria[]).map((k) => <option key={k} value={k}>{CATEGORIAS[k]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Canais" dica="Nenhum marcado = vale para todos">
            <div className="chips">{(['instagram', 'whatsapp'] as CanalConversa[]).map((c) =>
              <button type="button" key={c} className={canais?.includes(c) ? 'chip sel' : 'chip'} onClick={() => alternarCanal(c)}>{CANAL_CONVERSA[c].rotulo}</button>)}</div>
          </Campo>
        </div>
        <Campo rotulo="Texto" dica={`${corpo.length}/1000 · clique numa variável abaixo para inserir onde está o cursor`}>
          <textarea ref={corpoRef} rows={5} maxLength={1000} value={corpo} onChange={(e) => set('corpo', e.target.value)} />
        </Campo>
        <div className="rp-chips">
          {grupos.map((g) => (
            <div key={g}><small className="mudo">{g}</small>
              {variaveis.filter((v) => v.grupo === g).map((v) => <button type="button" key={v.chave} className="chip" title={`${v.descricao} · ex.: ${v.exemplo}`} onClick={() => inserir(v.chave)}>{v.rotulo}</button>)}
            </div>))}
        </div>
        {desconhecidas.length > 0 && <div className="erro">Variáveis que não existem: {desconhecidas.map((d) => `{{${d}}}`).join(', ')}</div>}
        <div className="at-previa">
          <small className="mudo">Exemplo de como sai (com dados fictícios):</small>
          <div>{previa.texto || <span className="mudo">—</span>}</div>
        </div>
        <label className="at-nota"><input type="checkbox" checked={f.ativo ?? true} onChange={(e) => set('ativo', e.target.checked)} /> Ativa (aparece para a equipe)</label>
      </Formulario>
    </Modal>
  )
}
