import { useMemo, useState } from 'react'
import { apiGovernanca, data, type EstadoGov, type ItemGov, type TipoGov } from '../api'
import { Busca, Formulario, Modal, useCarregar, Vazio } from '../ui'
import type { Contexto } from '../App'

const TIPOS: Record<TipoGov, string> = { duvida: 'Dúvida', ocorrencia: 'Ocorrência', sugestao: 'Sugestão' }
const ESTADOS: Record<EstadoGov, string> = { aberto: 'Aberto', em_analise: 'Em análise', resolvido: 'Resolvido', descartado: 'Descartado' }
const ESTADO_FLUXO: EstadoGov[] = ['aberto', 'em_analise', 'resolvido', 'descartado']

export default function Governanca({ ctx }: { ctx: Contexto }) {
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState('')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<ItemGov | null>(null)
  const { dados, erro, carregando, recarregar } = useCarregar(
    () => apiGovernanca.listar(ctx.empresa, { tipo, estado, busca }), [ctx.empresa, tipo, estado, busca])
  const podeEditar = ctx.perm ? ctx.perm['governanca'] === 'editar' : true

  const resumo = dados?.resumo
  const faixa = useMemo(() => ([
    { id: '', rotulo: 'Todos', n: resumo?.total ?? 0 },
    { id: 'aberto', rotulo: 'Abertos', n: resumo?.aberto ?? 0 },
    { id: 'em_analise', rotulo: 'Em análise', n: resumo?.em_analise ?? 0 },
    { id: 'resolvido', rotulo: 'Resolvidos', n: resumo?.resolvido ?? 0 },
    { id: 'descartado', rotulo: 'Descartados', n: resumo?.descartado ?? 0 },
  ]), [resumo])

  return (
    <section>
      <div className="topo">
        <div>
          <h1>Central de governança</h1>
          <p className="sub">Dúvidas e ocorrências relatadas no uso do painel. A equipe registra pelo menu de Ajuda (botão “?”) em qualquer tela; aqui você tria, resolve e deixa o aprendizado documentado.</p>
        </div>
      </div>
      {erro && <div className="erro">{erro}</div>}

      <div className="gov-faixa">
        {faixa.map((f) => (
          <button key={f.id || 'todos'} type="button" className={estado === f.id ? 'gov-cartao ativo' : 'gov-cartao'} onClick={() => setEstado(f.id)}>
            <strong>{f.n}</strong><span>{f.rotulo}</span>
          </button>
        ))}
      </div>

      <div className="gov-filtros">
        <div className="segmentado gov-tipos" role="radiogroup" aria-label="Tipo">
          <button type="button" role="radio" aria-checked={tipo === ''} className={tipo === '' ? 'sel' : ''} onClick={() => setTipo('')}>Todos</button>
          {(Object.keys(TIPOS) as TipoGov[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} className={tipo === t ? 'sel' : ''} onClick={() => setTipo(t)}>{TIPOS[t]}</button>
          ))}
        </div>
        <Busca valor={busca} onMudar={setBusca} placeholder="Buscar no resumo ou nos detalhes" />
      </div>

      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.itens.length === 0 && (
        <Vazio titulo="Nada por aqui" texto="Quando alguém relatar uma dúvida ou ocorrência pelo menu de Ajuda, ela aparece nesta lista para triagem." />
      )}
      {dados && dados.itens.length > 0 && (
        <table>
          <thead><tr><th>Tipo</th><th>Resumo</th><th>Tela</th><th>Quem relatou</th><th>Quando</th><th>Estado</th></tr></thead>
          <tbody>
            {dados.itens.map((i) => (
              <tr key={i.id} className="gov-linha" onClick={() => setAberto(i)}>
                <td><span className={`gov-tag tipo-${i.tipo}`}>{TIPOS[i.tipo]}</span>{i.severidade && <span className={`gov-sev sev-${i.severidade}`}>{i.severidade === 'media' ? 'média' : i.severidade}</span>}</td>
                <td>{i.titulo}</td>
                <td className="mudo">{i.tela_rotulo ?? '—'}</td>
                <td className="mudo">{i.criado_por_nome ?? '—'}</td>
                <td className="mudo">{data(i.criado_em)}</td>
                <td><span className={`gov-tag estado-${i.estado}`}>{ESTADOS[i.estado]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {aberto && <Detalhe item={aberto} podeEditar={podeEditar} empresa={ctx.empresa}
                         onFechar={() => setAberto(null)} onSalvo={() => { setAberto(null); recarregar() }} />}
    </section>
  )
}

function Detalhe({ item, podeEditar, empresa, onFechar, onSalvo }:
  { item: ItemGov; podeEditar: boolean; empresa: string; onFechar: () => void; onSalvo: () => void }) {
  const [estado, setEstado] = useState<EstadoGov>(item.estado)
  const [resolucao, setResolucao] = useState(item.resolucao ?? '')

  const corpo = (
    <>
      <div className="gov-meta">
        <span className={`gov-tag tipo-${item.tipo}`}>{TIPOS[item.tipo]}</span>
        {item.severidade && <span className={`gov-sev sev-${item.severidade}`}>gravidade {item.severidade === 'media' ? 'média' : item.severidade}</span>}
        {item.tela_rotulo && <span className="chip">Origem: {item.tela_rotulo}</span>}
        {item.origem === 'sistema' && <span className="chip">Detectado pelo sistema</span>}
      </div>
      <p className="gov-descricao">{item.descricao}</p>
      <p className="sub">Relatado por {item.criado_por_nome ?? 'usuário'} em {data(item.criado_em)}.
        {item.resolvido_por_nome && <> Resolvido por {item.resolvido_por_nome}{item.resolvido_em ? ` em ${data(item.resolvido_em)}` : ''}.</>}</p>
    </>
  )

  if (!podeEditar) {
    return (
      <Modal titulo={item.titulo} onFechar={onFechar}>
        {corpo}
        {item.resolucao && <><h4 className="gov-h">Resolução</h4><p className="gov-descricao">{item.resolucao}</p></>}
        <div className="acoes"><button type="button" onClick={onFechar}>Fechar</button></div>
      </Modal>
    )
  }

  return (
    <Modal titulo={item.titulo} onFechar={onFechar}>
      {corpo}
      <Formulario enviarRotulo="Salvar" onCancelar={onFechar} onEnviar={async () => {
        await apiGovernanca.atualizar(empresa, item.id, { estado, resolucao: resolucao.trim() || null }); onSalvo()
      }}>
        <label className="campo"><span>Estado</span>
          <div className="segmentado" role="radiogroup" aria-label="Estado">
            {ESTADO_FLUXO.map((e) => (
              <button type="button" key={e} role="radio" aria-checked={estado === e} className={estado === e ? 'sel' : ''} onClick={() => setEstado(e)}>{ESTADOS[e]}</button>
            ))}
          </div>
        </label>
        <label className="campo"><span>Resolução / nota de aprendizado</span>
          <textarea value={resolucao} onChange={(e) => setResolucao(e.target.value)} rows={4} maxLength={4000}
                    placeholder="O que foi feito ou a orientação. Vira referência para evitar a mesma dúvida." />
          <small>CPF, e-mail e telefone são mascarados ao salvar.</small>
        </label>
      </Formulario>
    </Modal>
  )
}
