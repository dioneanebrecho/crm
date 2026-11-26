import { useEffect, useState } from 'react'
import { apiIntegracoes as api, apiAssistente, type ConfigAssistente, type Integracao, type ModoIntegracao, type TesteLinha } from '../api'
import { Abas, Campo, Modal, Vazio, useCarregar, Titulo } from '../ui'
import type { Contexto } from '../App'
import { apiVendas } from '../apiVendas'

interface CampoDef { chave: string; rotulo: string; dica?: string; numerico?: boolean; opcoes?: { valor: string; rotulo: string }[]; padrao?: string }
interface SegDef { nome: string; rotulo: string; dica?: string }
interface Def { id: string; titulo: string; descricao: string; params: CampoDef[]; segredos: SegDef[] }

const VERSAO: CampoDef = { chave: 'api_version', rotulo: 'Versão da API (opcional)', dica: 'Ex.: v21.0. Em branco usa a padrão do app.' }
const VERIFY: SegDef = { nome: 'verify_token', rotulo: 'Token de verificação do webhook', dica: 'Texto que você inventa e cadastra igual na Meta.' }

const DEFS: Record<string, Def> = {
  bling: { id: 'bling', titulo: 'Bling (ERP)', descricao: 'Catálogo, estoque, pedidos e NF-e. Hoje só leitura.',
    params: [{ chave: 'client_id', rotulo: 'Client ID' }, { chave: 'empresa_id_bling', rotulo: 'ID da empresa no Bling', numerico: true, dica: 'Trava contra autorizar a conta errada.' }],
    segredos: [{ nome: 'client_secret', rotulo: 'Client Secret' }] },
  meta_live: { id: 'meta_live', titulo: 'Instagram: lives e comentários', descricao: 'Leitura de comentários das lives (lances e interesse).',
    params: [{ chave: 'app_id', rotulo: 'App ID (Meta)' }, { chave: 'instagram_user_id', rotulo: 'ID da conta do Instagram', numerico: true }, VERSAO],
    segredos: [{ nome: 'app_secret', rotulo: 'App Secret' }, { nome: 'access_token', rotulo: 'Token de acesso' }, VERIFY] },
  meta_dm: { id: 'meta_dm', titulo: 'Instagram: mensagens diretas', descricao: 'DMs da Caixa de entrada: recebe e responde (respeita modo, lista de teste e janela de 24 h).',
    params: [{ chave: 'app_id', rotulo: 'App ID (Meta)' }, { chave: 'instagram_user_id', rotulo: 'ID da conta do Instagram', numerico: true }, VERSAO],
    segredos: [{ nome: 'app_secret', rotulo: 'App Secret' }, { nome: 'access_token', rotulo: 'Token de acesso' }, VERIFY] },
  whatsapp: { id: 'whatsapp', titulo: 'WhatsApp Business (Cloud API)', descricao: 'Número oficial (Cloud API direta, sem provedor). Mensagens e status de entrega chegam pelo mesmo webhook da Meta; respostas da Caixa de entrada saem por aqui.',
    params: [{ chave: 'waba_id', rotulo: 'ID da conta WhatsApp Business', numerico: true }, { chave: 'phone_number_id', rotulo: 'ID do número (Phone Number ID)', numerico: true }, VERSAO],
    segredos: [{ nome: 'access_token', rotulo: 'Token de acesso' }, { nome: 'app_secret', rotulo: 'App Secret' }, VERIFY] },
  facebook: { id: 'facebook', titulo: 'Facebook (página)', descricao: 'Página vinculada ao Instagram/Meta.',
    params: [{ chave: 'app_id', rotulo: 'App ID (Meta)' }, { chave: 'page_id', rotulo: 'ID da página', numerico: true }, VERSAO],
    segredos: [{ nome: 'app_secret', rotulo: 'App Secret' }, { nome: 'page_token', rotulo: 'Token da página' }, VERIFY] },
  gateway: { id: 'gateway', titulo: 'Getnet (Pix e cartão)', descricao: 'Pix dinâmico e link de cartão (com Apple Pay e Google Pay na página da Getnet) a partir do link da reserva. Credenciais em Getnet > Plataforma Digital > Chaves de autenticação. URL de notificação a cadastrar na Getnet: <URL do projeto>/functions/v1/getnet-notificacao?k=<segredo do webhook abaixo>.',
    params: [{ chave: 'provedor', rotulo: 'Provedor', opcoes: [{ valor: 'getnet', rotulo: 'Getnet' }], padrao: 'getnet' },
             { chave: 'ambiente', rotulo: 'Ambiente', opcoes: [{ valor: 'homologacao', rotulo: 'Homologação' }, { valor: 'sandbox', rotulo: 'Sandbox' }, { valor: 'producao', rotulo: 'Produção' }], padrao: 'homologacao' },
             { chave: 'client_id', rotulo: 'Client ID' }, { chave: 'seller_id', rotulo: 'Seller ID' },
             { chave: 'base_url', rotulo: 'URL base (opcional)', dica: 'Em branco usa a do ambiente escolhido.' }],
    segredos: [{ nome: 'client_secret', rotulo: 'Client Secret' }, { nome: 'webhook_secret', rotulo: 'Segredo da URL de notificação', dica: 'Texto que você inventa (longo) e coloca no final da URL de notificação cadastrada na Getnet.' }] },
  ia_chat: { id: 'ia_chat', titulo: 'IA de resposta (Gemini)', descricao: 'Modelo que redige as respostas do assistente. Conta pessoal do Google AI Studio serve; a chave fica só no cofre.',
    params: [{ chave: 'provedor', rotulo: 'Plataforma de IA', opcoes: [{ valor: 'google_gemini', rotulo: 'Google Gemini' }], padrao: 'google_gemini' },
             { chave: 'base_url', rotulo: 'URL base do endpoint', dica: 'Google AI Studio: https://generativelanguage.googleapis.com/v1beta. Google Vertex (chave do projeto): https://aiplatform.googleapis.com/v1/publishers/google. Em branco usa o AI Studio.' },
             { chave: 'modelo', rotulo: 'Modelo', padrao: 'gemini-3.8-flash', dica: 'Nome exato do modelo no provedor. Sugestão copiada do ZAgent; troque se o teste não encontrar.' }],
    segredos: [{ nome: 'api_key', rotulo: 'API Key' }] },
  ia_embedding: { id: 'ia_embedding', titulo: 'IA de vetor (embedding)', descricao: 'Modelo que transforma textos em vetores para a busca do assistente. O banco usa vetores de 1024 números.',
    params: [{ chave: 'provedor', rotulo: 'Plataforma de IA', opcoes: [{ valor: 'voyage', rotulo: 'Voyage AI' }, { valor: 'google_gemini', rotulo: 'Google Gemini' }], padrao: 'voyage' },
             { chave: 'base_url', rotulo: 'URL base do endpoint', dica: 'Voyage: https://api.voyageai.com/v1. Gemini: https://generativelanguage.googleapis.com/v1beta. Em branco usa o padrão da plataforma escolhida.' },
             { chave: 'modelo', rotulo: 'Modelo', padrao: 'voyage-4', dica: 'Voyage: voyage-4. Gemini: gemini-embedding-001. Trocar de modelo exige reindexar o que já foi vetorizado.' }],
    segredos: [{ nome: 'api_key', rotulo: 'API Key', dica: 'Use uma chave própria deste projeto se quiser separar o consumo do ZAgent.' }] },
}
const ABAS = [
  { id: 'bling', rotulo: 'Bling', itens: ['bling'] },
  { id: 'instagram', rotulo: 'Instagram', itens: ['meta_live', 'meta_dm'] },
  { id: 'whatsapp', rotulo: 'WhatsApp', itens: ['whatsapp'] },
  { id: 'facebook', rotulo: 'Facebook', itens: ['facebook'] },
  { id: 'pagamentos', rotulo: 'Pagamentos', itens: ['gateway'] },
  { id: 'ia', rotulo: 'IA', itens: ['ia_chat', 'ia_embedding'] },
  { id: 'assistente', rotulo: 'Assistente', itens: [] as string[] },
  { id: 'vitrine', rotulo: 'Vitrine pública', itens: [] as string[] },
]
const STATUS: Record<string, { rotulo: string; tom: string }> = {
  nao_configurada: { rotulo: 'Não configurada', tom: 'mudo' }, configurada: { rotulo: 'Configurada, não testada', tom: 'aviso' },
  testada_ok: { rotulo: 'Testada com sucesso', tom: 'ok' }, falhou: { rotulo: 'Teste falhou', tom: 'erro' },
}
const MODOS: Record<ModoIntegracao, { rotulo: string; ajuda: string }> = {
  desligado: { rotulo: 'Desligado', ajuda: 'Não lê nem envia nada.' },
  simulado: { rotulo: 'Simulado', ajuda: 'Roda o fluxo sem tocar no sistema real.' },
  real: { rotulo: 'Real', ajuda: 'Conversa com o serviço de verdade. Escrita externa continua bloqueada até você liberar caso a caso.' },
}
const OPCIONAIS = ['api_version', 'empresa_id_bling', 'base_url', 'provedor', 'ambiente']
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const URL_CALLBACK = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/functions/v1/bling-oauth-callback`

export default function Integracoes({ ctx }: { ctx: Contexto }) {
  const [aba, setAba] = useState('bling')
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.listar(ctx.empresa), [ctx.empresa])
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null)

  // Retorno do Bling (callback redireciona para cá com ?resultado=ok|erro).
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const r = q.get('resultado')
    if (!r) return
    setAba('bling')
    setRetorno(r === 'ok' ? { ok: true, texto: 'Bling autorizado. Agora clique em "Testar conexão".' } : { ok: false, texto: `Não foi possível conectar ao Bling: ${q.get('motivo') ?? 'erro'}.` })
    history.replaceState(null, '', location.pathname + '#integracoes')
  }, [])

  const atual = ABAS.find((a) => a.id === aba)!
  const pontos = (ids: string[]) => ids.map((id) => dados?.find((x) => x.integracao === id)?.status).some((st) => st === 'testada_ok') ? ' ●' : ''
  return (
    <section>
      <div className="topo"><div><Titulo ajuda={<>Conecte cada serviço, teste e só então ligue. Senhas e tokens ficam no cofre e nunca voltam para a tela.</>}>Integrações</Titulo></div></div>
      {retorno && <div className={retorno.ok ? 'info' : 'erro'} role="status">{retorno.texto}</div>}
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      <Abas abas={ABAS.map((a) => ({ id: a.id, rotulo: a.rotulo + pontos(a.itens) }))} ativa={aba} onMudar={setAba} />
      {aba === 'assistente' && <ConfigAssistenteCartao ctx={ctx} />}
      {aba === 'vitrine' && <VitrinePublicaCartao ctx={ctx} />}
      {dados && atual.itens.map((id) => {
        const i = dados.find((x) => x.integracao === id)
        return i ? <Cartao key={id} def={DEFS[id]} item={i} ctx={ctx} onMudou={recarregar} />
                 : <Vazio key={id} titulo="Integração não encontrada" texto="Peça ao suporte para provisionar esta integração." />
      })}
    </section>
  )
}

type Msg = { tipo: 'ok' | 'erro' | 'aviso'; texto: string }

function Cartao({ def, item, ctx, onMudou }: { def: Def; item: Integracao; ctx: Contexto; onMudou: () => void }) {
  const admin = ctx.papeis.includes('admin') || ctx.papeis.includes('superadmin')
  const inicial = () => Object.fromEntries(def.params.map((p) => [p.chave, item.parametros[p.chave] ?? p.padrao ?? '']))
  const [params, setParams] = useState<Record<string, string>>(inicial)
  const [novos, setNovos] = useState<Record<string, string>>({})
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [hist, setHist] = useState<TesteLinha[] | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [pedirMotivo, setPedirMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [modelos, setModelos] = useState<string[]>([])
  const definido = (n: string) => item.segredos.find((s) => s.nome === n)
  const st = STATUS[item.status]

  const sujo = def.params.some((p) => (params[p.chave] ?? '').trim() !== (item.parametros[p.chave] ?? '')) || Object.values(novos).some((v) => v.trim() !== '')
  const credenciaisOk = def.params.filter((p) => !OPCIONAIS.includes(p.chave)).every((p) => !!item.parametros[p.chave]) && def.segredos.filter((x) => x.nome !== 'verify_token').every((x) => !!definido(x.nome))
  const passos = [
    { rotulo: 'Credenciais salvas', feito: credenciaisOk },
    ...(def.id === 'bling' ? [{ rotulo: 'Acesso autorizado no Bling', feito: !!definido('refresh_token') }] : []),
    { rotulo: 'Conexão testada', feito: item.status === 'testada_ok' },
    { rotulo: 'Modo ligado', feito: item.modo !== 'desligado' },
  ]
  const atualIdx = passos.findIndex((x) => !x.feito)

  async function executar(rotulo: string, fn: () => Promise<Msg[] | void>) {
    setOcupado(rotulo); setMsgs([])
    try { const m = await fn(); if (m) setMsgs(m) } catch (e) { setMsgs([{ tipo: 'erro', texto: (e as Error).message }]) } finally { setOcupado(null) }
  }
  const salvar = () => executar('salvar', async () => {
    for (const p of def.params) if (p.numerico && params[p.chave].trim() && !/^[0-9]+$/.test(params[p.chave].trim())) throw new Error(`${p.rotulo}: use apenas números.`)
    await api.salvar(ctx.empresa, def.id, params)
    for (const x of def.segredos) {
      const v = (novos[x.nome] ?? '').trim()
      if (v) await api.salvarSegredo(ctx.empresa, def.id, x.nome, v)
    }
    setNovos({}); onMudou()
    return [{ tipo: 'ok', texto: 'Salvo. Como algo mudou, teste a conexão de novo.' }]
  })
  const testar = () => executar('testar', async () => {
    const r = await api.testar(ctx.empresa, def.id)
    onMudou(); if (hist) setHist(await api.historico(ctx.empresa, def.id))
    const out: Msg[] = [{ tipo: r.ok ? 'ok' : 'erro', texto: r.mensagem }]
    if (r.aviso) out.push({ tipo: 'aviso', texto: r.aviso })
    return out
  })
  const conectar = () => executar('conectar', async () => {
    const clientId = (item.parametros.client_id ?? '').trim()
    if (!clientId || !definido('client_secret')) throw new Error('Salve o Client ID e o Client Secret antes de conectar.')
    const state = await api.iniciarOauth(ctx.empresa, def.id)
    location.href = `https://bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&state=${state}`
  })
  const mudarModo = (m: ModoIntegracao, why?: string) => executar('modo', async () => {
    await api.mudarModo(ctx.empresa, def.id, m, why); onMudou()
    return [{ tipo: 'ok', texto: `Modo alterado para ${MODOS[m].rotulo}.` }]
  })
  const escolherModo = (m: ModoIntegracao) => { if (m === 'real') { setMotivo(''); setPedirMotivo(true) } else void mudarModo(m) }
  const atualizarModelos = () => executar('modelos', async () => {
    const r = await api.modelos(ctx.empresa, def.id)
    setModelos(r.modelos)
    return [{ tipo: r.ok ? (r.modelos.length ? 'ok' : 'aviso') : 'erro', texto: r.mensagem }]
  })
  const verHist = () => executar('hist', async () => { setHist(hist ? null : await api.historico(ctx.empresa, def.id)) })
  const copiar = async () => { try { await navigator.clipboard.writeText(URL_CALLBACK); setCopiado(true); setTimeout(() => setCopiado(false), 1800) } catch { /* sem permissão de área de transferência */ } }
  const bloqueioModo = (m: ModoIntegracao) => m !== 'desligado' && item.status !== 'testada_ok' ? 'Teste a conexão com sucesso antes de ligar.' : undefined

  return (
    <div className="int-cartao">
      <div className="int-topo">
        <div><h2>{def.titulo}</h2><p className="sub">{def.descricao}</p></div>
        <div className="int-selos">
          <span className={`pill pill-${st.tom}`}><i />{st.rotulo}</span>
          <span className={`pill pill-${item.modo === 'desligado' ? 'mudo' : item.modo === 'real' ? 'ok' : 'aviso'}`}>Modo {MODOS[item.modo].rotulo.toLowerCase()}</span>
        </div>
      </div>
      {item.ultimo_teste_em && <p className="sub">Último teste em {fmt(item.ultimo_teste_em)}: {item.ultimo_teste_ok ? 'OK' : 'falhou'}{item.ultimo_teste_resumo ? ` · ${item.ultimo_teste_resumo}` : ''}</p>}

      <div className="int-grade">
        <div className="int-form">
          {def.id === 'bling' && (
            <div className="copiavel">
              <span className="copiavel-rotulo">Link de redirecionamento (cadastre exatamente assim no app do Bling)</span>
              <div className="copiavel-linha"><code>{URL_CALLBACK}</code><button className="sec" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar'}</button></div>
            </div>
          )}
          <div className="form">
            {def.params.map((p) => (
              <Campo key={p.chave} rotulo={p.rotulo + (OPCIONAIS.includes(p.chave) ? ' (opcional)' : '')} dica={p.dica}>
                {p.opcoes
                  ? <select value={params[p.chave]} disabled={!admin} onChange={(e) => setParams({ ...params, [p.chave]: e.target.value })}>{p.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>
                  : <input value={params[p.chave]} disabled={!admin} list={p.chave === 'modelo' && modelos.length ? `modelos-${def.id}` : undefined} onChange={(e) => setParams({ ...params, [p.chave]: e.target.value })} autoComplete="off" />}
                {p.chave === 'modelo' && modelos.length > 0 && <datalist id={`modelos-${def.id}`}>{modelos.map((m) => <option key={m} value={m} />)}</datalist>}
              </Campo>
            ))}
            {def.segredos.map((x) => {
              const d = definido(x.nome)
              return (
                <Campo key={x.nome} rotulo={x.rotulo} dica={x.dica ?? (d ? `Definido em ${fmt(d.definido_em)}${d.expira_em ? ` · expira ${fmt(d.expira_em)}` : ''}. Preencha só para trocar.` : 'Ainda não definido.')}>
                  <input type="password" value={novos[x.nome] ?? ''} disabled={!admin} autoComplete="new-password"
                         placeholder={d ? '•••••••• (definido)' : ''} onChange={(e) => setNovos({ ...novos, [x.nome]: e.target.value })} />
                </Campo>
              )
            })}
          </div>
          {msgs.map((m, k) => <div key={k} className={m.tipo === 'ok' ? 'info' : m.tipo === 'aviso' ? 'aviso-caixa' : 'erro'} role="status">{m.texto}</div>)}
          {admin ? (
            <div className="barra-acoes">
              <button onClick={salvar} disabled={!!ocupado || !sujo}>{ocupado === 'salvar' ? 'Salvando…' : 'Salvar'}</button>
              {sujo && !ocupado && <span className="sujo">Alterações não salvas</span>}
              <span className="espaco" />
              {def.id === 'bling' && <button className="sec" onClick={conectar} disabled={!!ocupado || sujo || !credenciaisOk}>{definido('refresh_token') ? 'Reautorizar no Bling' : 'Conectar ao Bling'}</button>}
              {(def.id === 'ia_chat' || def.id === 'ia_embedding') && <button className="sec" onClick={atualizarModelos} disabled={!!ocupado || sujo || !definido('api_key')} title={!definido('api_key') ? 'Salve a chave de API primeiro' : undefined}>{ocupado === 'modelos' ? 'Atualizando…' : 'Atualizar lista de modelos'}</button>}
              <button className="sec" onClick={testar} disabled={!!ocupado || sujo}>{ocupado === 'testar' ? 'Testando…' : 'Testar conexão'}</button>
              <button className="sec" onClick={verHist} disabled={!!ocupado}>{hist ? 'Ocultar histórico' : 'Histórico'}</button>
            </div>
          ) : <p className="sub">Só administradores alteram as integrações.</p>}
          {admin && sujo && <p className="sub">Salve antes de conectar ou testar.</p>}
        </div>

        <aside className="int-lado">
          <div className="painel">
            <h3 className="lado-tit">Passo a passo</h3>
            <ol className="passos">
              {passos.map((x, k) => (
                <li key={x.rotulo} className={x.feito ? 'feito' : k === atualIdx ? 'atual' : ''}><span>{x.feito ? '✓' : k + 1}</span>{x.rotulo}</li>
              ))}
            </ol>
          </div>
          {admin && (
            <div className="painel">
              <h3 className="lado-tit">Modo de operação</h3>
              <div className="segmentado" role="group" aria-label="Modo">
                {(['desligado', 'simulado', 'real'] as ModoIntegracao[]).map((m) => (
                  <button key={m} className={m === item.modo ? 'sel' : ''} disabled={!!ocupado || m === item.modo || !!bloqueioModo(m)} title={bloqueioModo(m)} onClick={() => escolherModo(m)}>{MODOS[m].rotulo}</button>
                ))}
              </div>
              <p className="sub">{MODOS[item.modo].ajuda}</p>
              {item.status !== 'testada_ok' && <p className="sub">Para ligar, teste a conexão com sucesso.</p>}
            </div>
          )}
        </aside>
      </div>

      {hist && (hist.length === 0 ? <p className="sub">Nenhum teste ainda.</p> : (
        <div className="tabela-rolavel" style={{ marginTop: 16 }}>
          <table>
            <thead><tr><th>Quando</th><th>Resultado</th><th>Detalhe</th><th className="num">ms</th></tr></thead>
            <tbody>{hist.map((h, k) => <tr key={k}><td>{fmt(h.em)}</td><td><span className={`pill pill-${h.ok ? 'ok' : 'erro'}`}><i />{h.ok ? 'OK' : 'Falhou'}</span></td><td style={{ whiteSpace: 'normal' }}>{h.mensagem}</td><td className="num">{h.duracao_ms ?? ''}</td></tr>)}</tbody>
          </table>
        </div>
      ))}

      {pedirMotivo && (
        <Modal titulo="Ligar no modo real" onFechar={() => setPedirMotivo(false)}>
          <div className="form">
            <p className="sub">O modo real conversa com o serviço de verdade. O motivo fica registrado na auditoria.</p>
            <Campo rotulo="Motivo"><textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
            <div className="acoes">
              <button className="sec" onClick={() => setPedirMotivo(false)}>Cancelar</button>
              <button disabled={motivo.trim().length < 3} onClick={() => { setPedirMotivo(false); void mudarModo('real', motivo.trim()) }}>Ligar no modo real</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ConfigAssistenteCartao({ ctx }: { ctx: Contexto }) {
  const admin = ctx.papeis.includes('admin') || ctx.papeis.includes('superadmin')
  const { dados, erro, recarregar } = useCarregar(() => apiAssistente.obter(ctx.empresa), [ctx.empresa])
  const [f, setF] = useState<Omit<ConfigAssistente, 'atualizado_em'> | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (dados) setF({ retencao_dias: dados.retencao_dias, usar_whatsapp: dados.usar_whatsapp, usar_instagram_dm: dados.usar_instagram_dm, exigir_consentimento: dados.exigir_consentimento }) }, [dados])
  if (erro) return <div className="erro">{erro}</div>
  if (!f || !dados) return <p className="sub">Carregando…</p>
  const sujo = f.retencao_dias !== dados.retencao_dias || f.usar_whatsapp !== dados.usar_whatsapp || f.usar_instagram_dm !== dados.usar_instagram_dm || f.exigir_consentimento !== dados.exigir_consentimento
  async function salvar() {
    if (!f) return
    setMsg(null)
    if (!Number.isInteger(f.retencao_dias) || f.retencao_dias < 7 || f.retencao_dias > 3650) return setMsg({ tipo: 'erro', texto: 'A retenção deve ser um número inteiro de 7 a 3650 dias.' })
    setOcupado(true)
    try { await apiAssistente.salvar(ctx.empresa, f); recarregar(); setMsg({ tipo: 'ok', texto: 'Configuração do assistente salva.' }) }
    catch (e) { setMsg({ tipo: 'erro', texto: (e as Error).message }) } finally { setOcupado(false) }
  }
  const marca = (k: 'usar_whatsapp' | 'usar_instagram_dm' | 'exigir_consentimento', rotulo: string, dica: string) => (
    <label className="campo"><span><input type="checkbox" checked={f[k]} disabled={!admin} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {rotulo}</span><small>{dica}</small></label>
  )
  return (
    <div className="int-cartao">
      <div className="int-topo"><div><h2>Assistente de IA</h2><p className="sub">O que o assistente pode considerar e por quanto tempo. O assistente só lê; não envia mensagens nem altera dados.</p></div></div>
      <div className="form">
        <Campo rotulo="Retenção das conversas (dias)" dica="Padrão 90. Conversas mais antigas deixam de ser consideradas. A rotina de expurgo automático ainda será ativada em fase própria.">
          <input type="number" min={7} max={3650} step={1} value={Number.isNaN(f.retencao_dias) ? '' : f.retencao_dias} disabled={!admin} onChange={(e) => setF({ ...f, retencao_dias: e.target.value === '' ? NaN : Number(e.target.value) })} />
        </Campo>
        {marca('usar_whatsapp', 'Considerar conversas do WhatsApp', 'Padrão ligado.')}
        {marca('usar_instagram_dm', 'Considerar mensagens diretas do Instagram', 'Padrão ligado.')}
        {marca('exigir_consentimento', 'Considerar só clientes com consentimento registrado', 'Padrão ligado (LGPD). Desligue só se a base legal já estiver garantida por outro meio.')}
      </div>
      {msg && <div className={msg.tipo === 'ok' ? 'info' : 'erro'} role="status">{msg.texto}</div>}
      {admin ? <div className="barra-acoes"><button onClick={salvar} disabled={ocupado || !sujo}>{ocupado ? 'Salvando…' : 'Salvar'}</button>{sujo && !ocupado && <span className="sujo">Alterações não salvas</span>}</div>
             : <p className="sub">Só administradores alteram esta configuração.</p>}
    </div>
  )
}

// Domínio da vitrine pública (araras). Guarda venda.cfg_vitrine.url_base = <domínio>/vitrine/p/ — o mesmo campo que gera os links das peças.
const dominioDe = (urlBase: string | null) => (urlBase ?? '').replace(/\/vitrine\/p\/?$/, '').replace(/\/p\/?$/, '').replace(/\/+$/, '')
function VitrinePublicaCartao({ ctx }: { ctx: Contexto }) {
  const { dados, erro, recarregar } = useCarregar(() => apiVendas.preferencias(ctx.empresa), [ctx.empresa])
  const [dom, setDom] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (dados) setDom(dominioDe(dados.valores?.url_base ?? null)) }, [dados])
  if (erro) return <div className="erro">{erro}</div>
  if (!dados || dom === null) return <p className="sub">Carregando…</p>
  const pode = dados.pode_editar
  const atual = dominioDe(dados.valores?.url_base ?? null)
  const efetivo = (dom.trim() || location.origin).replace(/\/+$/, '')
  async function salvar() {
    setMsg(null)
    const d = (dom ?? '').trim().replace(/\/+$/, '')
    if (d && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) return setMsg({ tipo: 'erro', texto: 'Informe só o domínio com https://, por exemplo https://loja.anebrecho.com.br (sem caminho no final).' })
    setOcupado(true)
    try { await apiVendas.salvarPreferencias(ctx.empresa, { url_base: d ? `${d}/vitrine/p/` : '' }); recarregar(); setMsg({ tipo: 'ok', texto: d ? 'Domínio salvo. Os links novos das peças já usam este endereço.' : 'Voltou a usar o endereço deste painel.' }) }
    catch (e) { setMsg({ tipo: 'erro', texto: (e as Error).message }) } finally { setOcupado(false) }
  }
  return (
    <div className="int-cartao">
      <div className="int-topo"><div><h2>Vitrine pública</h2><p className="sub">Página das araras que a cliente abre pelo link da peça, sem login. Em branco, usa o endereço deste painel.</p></div></div>
      <div className="form">
        <Campo rotulo="Domínio da loja" dica="Quando a loja liberar o domínio próprio, aponte-o (DNS) para este painel e informe aqui. Ex.: https://loja.anebrecho.com.br">
          <input value={dom} disabled={!pode} onChange={(e) => setDom(e.target.value)} placeholder={location.origin} inputMode="url" autoCapitalize="none" />
        </Campo>
        <p className="sub">Arara: <a href={`${efetivo}/vitrine`} target="_blank" rel="noopener noreferrer">{efetivo}/vitrine</a> · Peça: {efetivo}/vitrine/p/&lt;código&gt;</p>
      </div>
      {msg && <div className={msg.tipo === 'ok' ? 'info' : 'erro'} role="status">{msg.texto}</div>}
      {pode ? <div className="barra-acoes"><button onClick={salvar} disabled={ocupado || dom.trim().replace(/\/+$/, '') === atual}>{ocupado ? 'Salvando…' : 'Salvar'}</button></div>
            : <p className="sub">Só gestor e administrador alteram.</p>}
    </div>
  )
}
