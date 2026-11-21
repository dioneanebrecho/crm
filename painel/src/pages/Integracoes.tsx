import { useEffect, useState } from 'react'
import { apiIntegracoes as api, type Integracao, type ModoIntegracao, type TesteLinha } from '../api'
import { Abas, Campo, Vazio, useCarregar } from '../ui'
import type { Contexto } from '../App'

interface CampoDef { chave: string; rotulo: string; dica?: string; numerico?: boolean }
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
  meta_dm: { id: 'meta_dm', titulo: 'Instagram: mensagens diretas', descricao: 'Recebimento de DMs. Envio continua bloqueado.',
    params: [{ chave: 'app_id', rotulo: 'App ID (Meta)' }, { chave: 'instagram_user_id', rotulo: 'ID da conta do Instagram', numerico: true }, VERSAO],
    segredos: [{ nome: 'app_secret', rotulo: 'App Secret' }, { nome: 'access_token', rotulo: 'Token de acesso' }, VERIFY] },
  whatsapp: { id: 'whatsapp', titulo: 'WhatsApp Business (Cloud API)', descricao: 'Número oficial para atendimento.',
    params: [{ chave: 'waba_id', rotulo: 'ID da conta WhatsApp Business', numerico: true }, { chave: 'phone_number_id', rotulo: 'ID do número (Phone Number ID)', numerico: true }, VERSAO],
    segredos: [{ nome: 'access_token', rotulo: 'Token de acesso' }, { nome: 'app_secret', rotulo: 'App Secret' }, VERIFY] },
  facebook: { id: 'facebook', titulo: 'Facebook (página)', descricao: 'Página vinculada ao Instagram/Meta.',
    params: [{ chave: 'app_id', rotulo: 'App ID (Meta)' }, { chave: 'page_id', rotulo: 'ID da página', numerico: true }, VERSAO],
    segredos: [{ nome: 'app_secret', rotulo: 'App Secret' }, { nome: 'page_token', rotulo: 'Token da página' }, VERIFY] },
}
const ABAS = [
  { id: 'bling', rotulo: 'Bling', itens: ['bling'] },
  { id: 'instagram', rotulo: 'Instagram', itens: ['meta_live', 'meta_dm'] },
  { id: 'whatsapp', rotulo: 'WhatsApp', itens: ['whatsapp'] },
  { id: 'facebook', rotulo: 'Facebook', itens: ['facebook'] },
]
const STATUS: Record<string, string> = { nao_configurada: 'Não configurada', configurada: 'Configurada, não testada', testada_ok: 'Testada com sucesso', falhou: 'Teste falhou' }
const MODOS: Record<ModoIntegracao, string> = { desligado: 'Desligado', simulado: 'Simulado', real: 'Real' }
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR') : '—')
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
  return (
    <section>
      <div className="topo"><div><h1>Integrações</h1>
        <p className="sub">Conecte cada serviço e teste antes de ligar. Senhas e tokens ficam guardados no cofre e nunca voltam para a tela.</p></div></div>
      {retorno && <div className={retorno.ok ? 'info' : 'erro'} role="status">{retorno.texto}</div>}
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      <Abas abas={ABAS.map((a) => ({ id: a.id, rotulo: a.rotulo }))} ativa={aba} onMudar={setAba} />
      {dados && atual.itens.map((id) => {
        const i = dados.find((x) => x.integracao === id)
        return i ? <Cartao key={id} def={DEFS[id]} item={i} ctx={ctx} onMudou={recarregar} />
                 : <Vazio key={id} titulo="Integração não encontrada" texto="Peça ao suporte para provisionar esta integração." />
      })}
    </section>
  )
}

function Cartao({ def, item, ctx, onMudou }: { def: Def; item: Integracao; ctx: Contexto; onMudou: () => void }) {
  const admin = ctx.papeis.includes('admin') || ctx.papeis.includes('superadmin')
  const [params, setParams] = useState<Record<string, string>>(() => Object.fromEntries(def.params.map((p) => [p.chave, item.parametros[p.chave] ?? ''])))
  const [novos, setNovos] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [hist, setHist] = useState<TesteLinha[] | null>(null)
  const definido = (n: string) => item.segredos.find((s) => s.nome === n)

  async function executar(rotulo: string, fn: () => Promise<string | void>) {
    setOcupado(rotulo); setMsg(null)
    try { const t = await fn(); if (t) setMsg({ ok: true, texto: t }) } catch (e) { setMsg({ ok: false, texto: (e as Error).message }) } finally { setOcupado(null) }
  }
  const salvar = () => executar('salvar', async () => {
    for (const p of def.params) if (p.numerico && params[p.chave].trim() && !/^[0-9]+$/.test(params[p.chave].trim())) throw new Error(`${p.rotulo}: use apenas números.`)
    await api.salvar(ctx.empresa, def.id, params)
    for (const s of def.segredos) {
      const v = (novos[s.nome] ?? '').trim()
      if (v) await api.salvarSegredo(ctx.empresa, def.id, s.nome, v)
    }
    setNovos({}); onMudou()
    return 'Salvo. Como algo mudou, teste a conexão de novo.'
  })
  const testar = () => executar('testar', async () => {
    const r = await api.testar(ctx.empresa, def.id)
    setMsg({ ok: r.ok, texto: r.aviso ? `${r.mensagem} Atenção: ${r.aviso}` : r.mensagem })
    onMudou(); if (hist) setHist(await api.historico(ctx.empresa, def.id))
  })
  const conectar = () => executar('conectar', async () => {
    const clientId = (params.client_id ?? '').trim()
    if (!clientId || !definido('client_secret')) throw new Error('Salve o Client ID e o Client Secret antes de conectar.')
    const state = await api.iniciarOauth(ctx.empresa, def.id)
    location.href = `https://bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&state=${state}`
  })
  const modo = (m: ModoIntegracao) => executar('modo', async () => {
    let motivo: string | undefined
    if (m === 'real') { motivo = prompt('Motivo para ligar no modo REAL (fica registrado):')?.trim(); if (!motivo) return }
    await api.mudarModo(ctx.empresa, def.id, m, motivo); onMudou(); return `Modo alterado para ${MODOS[m]}.`
  })
  const verHist = () => executar('hist', async () => { setHist(await api.historico(ctx.empresa, def.id)) })

  return (
    <div className="cartao" style={{ marginBottom: 16 }}>
      <h2>{def.titulo}</h2>
      <p className="sub">{def.descricao}</p>
      <p><strong>{STATUS[item.status]}</strong> · Modo: <strong>{MODOS[item.modo]}</strong>
        {item.ultimo_teste_em && <> · Último teste: {fmt(item.ultimo_teste_em)} {item.ultimo_teste_ok ? '(OK)' : '(falhou)'}</>}</p>
      {item.ultimo_teste_resumo && <p className="sub">{item.ultimo_teste_resumo}</p>}
      {def.id === 'bling' && <p className="sub">Link de redirecionamento a cadastrar no app do Bling: <code>{URL_CALLBACK}</code></p>}

      <div className="form">
        {def.params.map((p) => (
          <Campo key={p.chave} rotulo={p.rotulo} dica={p.dica}>
            <input value={params[p.chave]} disabled={!admin} onChange={(e) => setParams({ ...params, [p.chave]: e.target.value })} autoComplete="off" />
          </Campo>
        ))}
        {def.segredos.map((s) => {
          const d = definido(s.nome)
          return (
            <Campo key={s.nome} rotulo={s.rotulo} dica={s.dica ?? (d ? `Definido em ${fmt(d.definido_em)}${d.expira_em ? ` · expira ${fmt(d.expira_em)}` : ''}. Preencha só para trocar.` : 'Ainda não definido.')}>
              <input type="password" value={novos[s.nome] ?? ''} disabled={!admin} autoComplete="new-password"
                     placeholder={d ? '•••••••• (definido)' : ''} onChange={(e) => setNovos({ ...novos, [s.nome]: e.target.value })} />
            </Campo>
          )
        })}
        {msg && <div className={msg.ok ? 'info' : 'erro'} role="status">{msg.texto}</div>}
        <div className="acoes">
          {admin && <button onClick={salvar} disabled={!!ocupado}>{ocupado === 'salvar' ? 'Salvando…' : 'Salvar'}</button>}
          {admin && def.id === 'bling' && <button className="sec" onClick={conectar} disabled={!!ocupado}>Conectar ao Bling</button>}
          {admin && <button className="sec" onClick={testar} disabled={!!ocupado}>{ocupado === 'testar' ? 'Testando…' : 'Testar conexão'}</button>}
          <button className="sec" onClick={verHist} disabled={!!ocupado}>Histórico de testes</button>
        </div>
        {admin && (
          <div className="acoes">
            {(['desligado', 'simulado', 'real'] as ModoIntegracao[]).map((m) => (
              <button key={m} className={m === item.modo ? '' : 'sec'} disabled={!!ocupado || m === item.modo} onClick={() => modo(m)}>{MODOS[m]}</button>
            ))}
          </div>
        )}
        {!admin && <p className="sub">Só administradores alteram as integrações.</p>}
      </div>

      {hist && (hist.length === 0 ? <p className="sub">Nenhum teste ainda.</p> : (
        <table>
          <thead><tr><th>Quando</th><th>Resultado</th><th>Detalhe</th><th className="num">ms</th></tr></thead>
          <tbody>{hist.map((h, k) => <tr key={k}><td>{fmt(h.em)}</td><td>{h.ok ? 'OK' : 'Falhou'}</td><td>{h.mensagem}</td><td className="num">{h.duracao_ms ?? ''}</td></tr>)}</tbody>
        </table>
      ))}
    </div>
  )
}
