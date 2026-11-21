// GET ?code=...&state=...  (redirecionamento do Bling; sem JWT: deploy com --no-verify-jwt)
// Valida o state (uso único, 10 min), troca o code por tokens NO SERVIDOR e redireciona para o painel.
// O domínio padrão do Supabase não renderiza HTML, então a mensagem amigável fica no painel (PAINEL_URL).
import { chamar, clienteServico } from '../_shared/comum.ts'

const BLING_TOKEN = 'https://bling.com.br/Api/v3/oauth/token'

function voltar(resultado: 'ok' | 'erro', motivo?: string): Response {
  const painel = Deno.env.get('PAINEL_URL')
  const msg = resultado === 'ok' ? 'Bling conectado. Volte ao painel e clique em Testar conexão.' : `Não foi possível conectar ao Bling: ${motivo ?? 'erro'}.`
  if (!painel || !/^https?:\/\//.test(painel)) return new Response(msg, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const u = new URL(painel)
  u.searchParams.set('integracao', 'bling'); u.searchParams.set('resultado', resultado)
  if (motivo) u.searchParams.set('motivo', motivo)
  u.hash = 'integracoes'
  return new Response(null, { status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('método não permitido', { status: 405 })
  const q = new URL(req.url).searchParams
  if (q.get('error')) return voltar('erro', 'autorização negada no Bling')
  const code = q.get('code') ?? ''; const state = q.get('state') ?? ''
  if (!/^[0-9a-f]{64}$/.test(state) || code.length < 5 || code.length > 600) return voltar('erro', 'retorno inválido')

  const svc = clienteServico()
  const { data: estado, error: e1 } = await svc.rpc('svc_consumir_oauth_state', { p_state: state })
  const linha = Array.isArray(estado) ? estado[0] : null
  if (e1 || !linha || linha.integracao !== 'bling') return voltar('erro', 'o link expirou ou já foi usado; inicie de novo no painel')
  const empresa: string = linha.empresa_id

  const { data: cfg } = await svc.rpc('svc_ler_config', { p_empresa: empresa, p_integracao: 'bling' })
  const { data: secret } = await svc.rpc('svc_ler_segredo', { p_empresa: empresa, p_integracao: 'bling', p_nome: 'client_secret' })
  const clientId: string | undefined = cfg?.parametros?.client_id
  if (!clientId || typeof secret !== 'string' || !secret) return voltar('erro', 'Client ID ou Client Secret não configurados')

  // O code vale 30 segundos e só pode ser usado uma vez; reuso revoga o acesso do usuário no Bling.
  const r = await chamar(BLING_TOKEN, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded', 'enable-jwt': '1', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }).toString(),
  })
  const j = r.json
  if (!r.ok || typeof j?.access_token !== 'string' || typeof j?.refresh_token !== 'string') {
    console.error('troca de code falhou', r.status)
    return voltar('erro', r.status === 401 ? 'Client ID ou Client Secret recusados pelo Bling' : 'o Bling não aceitou a autorização')
  }
  const expira = new Date(Date.now() + (Number(j.expires_in) > 0 ? Number(j.expires_in) : 3600) * 1000).toISOString()
  const a = await svc.rpc('svc_gravar_segredo', { p_empresa: empresa, p_integracao: 'bling', p_nome: 'refresh_token', p_valor: j.refresh_token, p_expira: new Date(Date.now() + 30 * 86400e3).toISOString(), p_invalida_teste: true })
  const b = await svc.rpc('svc_gravar_segredo', { p_empresa: empresa, p_integracao: 'bling', p_nome: 'access_token', p_valor: j.access_token, p_expira: expira, p_invalida_teste: false })
  if (a.error || b.error) { console.error('gravação dos tokens falhou'); return voltar('erro', 'não foi possível guardar os tokens') }
  return voltar('ok')
})
