// POST { empresa, integracao }  (JWT do usuário, só admin)
// Testa a conexão no servidor, SOMENTE COM LEITURA (nunca POST de negócio, nunca envia mensagem) e registra o resultado.
// Itens marcados [validar] dependem de conferência na primeira execução real (ver plano-menu-integracoes).
import { chamar, clienteServico, clienteUsuario, cors, ehUuid, json, type Resposta } from '../_shared/comum.ts'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

interface Resultado { ok: boolean; mensagem: string; http?: number; aviso?: string; detalhes?: Record<string, unknown> }
const falha = (mensagem: string, http?: number, detalhes?: Record<string, unknown>): Resultado => ({ ok: false, mensagem, http, detalhes })

async function segredo(svc: SupabaseClient, empresa: string, integracao: string, nome: string): Promise<string | null> {
  const { data, error } = await svc.rpc('svc_ler_segredo', { p_empresa: empresa, p_integracao: integracao, p_nome: nome })
  return error || typeof data !== 'string' || data === '' ? null : data
}

// ------------------------------------------------------------------ Bling
const BLING_API = 'https://api.bling.com.br/Api/v3'
const BLING_TOKEN = 'https://bling.com.br/Api/v3/oauth/token'

const getBling = (caminho: string, token: string) =>
  chamar(BLING_API + caminho, { headers: { Authorization: `Bearer ${token}`, 'enable-jwt': '1', Accept: 'application/json' } })

// Renova o token (uma única tentativa: o endpoint de token bloqueia o IP com 20 chamadas por minuto).
async function renovarBling(svc: SupabaseClient, empresa: string, clientId: string, clientSecret: string, refresh: string) {
  const basic = btoa(`${clientId}:${clientSecret}`)
  const r = await chamar(BLING_TOKEN, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'enable-jwt': '1', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }).toString(),
  })
  const j = r.json
  if (!r.ok || typeof j?.access_token !== 'string' || typeof j?.refresh_token !== 'string') return { ok: false as const, status: r.status }
  const expira = new Date(Date.now() + (Number(j.expires_in) > 0 ? Number(j.expires_in) : 3600) * 1000).toISOString()
  // guarda sempre o refresh token mais novo; renovação não derruba o modo (p_invalida_teste = false)
  await svc.rpc('svc_gravar_segredo', { p_empresa: empresa, p_integracao: 'bling', p_nome: 'refresh_token', p_valor: j.refresh_token, p_expira: new Date(Date.now() + 30 * 86400e3).toISOString(), p_invalida_teste: false })
  await svc.rpc('svc_gravar_segredo', { p_empresa: empresa, p_integracao: 'bling', p_nome: 'access_token', p_valor: j.access_token, p_expira: expira, p_invalida_teste: false })
  return { ok: true as const, access: j.access_token as string }
}

async function testarBling(svc: SupabaseClient, empresa: string, cfg: any): Promise<Resultado> {
  const clientId: string | undefined = cfg.parametros?.client_id
  const clientSecret = await segredo(svc, empresa, 'bling', 'client_secret')
  if (!clientId || !clientSecret) return falha('Informe o Client ID e o Client Secret do aplicativo e salve.')
  let access = await segredo(svc, empresa, 'bling', 'access_token')
  const refresh = await segredo(svc, empresa, 'bling', 'refresh_token')
  if (!access && !refresh) return falha('Credenciais salvas, mas falta autorizar o acesso: clique em "Conectar ao Bling".', undefined, { etapa: 'sem_autorizacao' })

  let renovado = false
  let r: Resposta = access ? await getBling('/produtos?limite=1', access) : { status: 401, ok: false, json: null }
  if (r.status === 401 && refresh) {
    const nova = await renovarBling(svc, empresa, clientId, clientSecret, refresh)
    if (!nova.ok) return falha('A autorização do Bling expirou ou foi revogada. Clique em "Conectar ao Bling" para autorizar de novo.', nova.status, { etapa: 'renovacao' })
    access = nova.access; renovado = true
    r = await getBling('/produtos?limite=1', access)
  }
  if (r.erroRede) return falha(`Não foi possível falar com o Bling (${r.erroRede}).`)
  if (r.status === 401) return falha('O Bling recusou o acesso. Clique em "Conectar ao Bling" para autorizar de novo.', 401)
  if (r.status === 403) return falha('O aplicativo não tem o escopo de produtos. Revise os escopos no Bling e autorize de novo.', 403)
  if (r.status === 429) return falha('Limite de requisições do Bling atingido. Tente de novo em alguns instantes.', 429)
  if (r.status >= 500) return falha('O Bling está indisponível no momento. Tente mais tarde.', r.status)
  if (!r.ok) return falha('Resposta inesperada do Bling.', r.status)

  const detalhes: Record<string, unknown> = { produtos_na_pagina: Array.isArray(r.json?.data) ? r.json.data.length : null, token_renovado: renovado }
  let aviso: string | undefined
  const esperado: string | null = cfg.bling_empresa_id_esperado ?? null
  if (!esperado) {
    aviso = 'O ID da empresa no Bling não foi informado: a trava que impede usar a conta errada não está ativa.'
  } else {
    // [validar] endpoint de dados da empresa; se não responder como esperado, o teste passa com aviso.
    const e = await getBling('/empresas/me/dados-basicos', access!)
    const id = e.json?.data?.id
    if (e.ok && id != null) {
      if (String(id) !== esperado) return falha('A conta do Bling autorizada não é a esperada para esta empresa. Autorize com o usuário da conta certa.', 200, { empresa_confere: false })
      detalhes.empresa_confere = true
    } else {
      aviso = 'Não foi possível confirmar o ID da empresa no Bling (conferência a validar).'
    }
  }
  return { ok: true, mensagem: 'Conexão com o Bling funcionando (leitura de produtos).', http: r.status, aviso, detalhes }
}

// ------------------------------------------------------------------ Meta (Instagram, Facebook, WhatsApp)
const MENSAGENS_META: Record<number, string> = {
  190: 'O token foi recusado ou expirou. Gere um novo token e salve.',
  102: 'A sessão do token expirou. Gere um novo token e salve.',
  10: 'O token não tem permissão para esta leitura. Revise as permissões do app.',
  200: 'O token não tem permissão para esta leitura. Revise as permissões do app.',
  4: 'Limite de chamadas da Meta atingido. Tente mais tarde.', 17: 'Limite de chamadas da Meta atingido. Tente mais tarde.',
  32: 'Limite de chamadas da Meta atingido. Tente mais tarde.', 613: 'Limite de chamadas da Meta atingido. Tente mais tarde.',
  100: 'A Meta não encontrou esse ID ou o token não enxerga esse recurso. Confira o ID informado.',
}
function erroMeta(r: Resposta): Resultado {
  if (r.erroRede) return falha(`Não foi possível falar com a Meta (${r.erroRede}).`)
  const cod = Number(r.json?.error?.code)
  return falha(MENSAGENS_META[cod] ?? 'A Meta recusou a chamada.', r.status, { codigo_meta: Number.isFinite(cod) ? cod : null, tipo_meta: r.json?.error?.type ?? null })
}

function baseGraph(versao?: string): string {
  // sem versão informada, a Graph API usa a versão padrão do app [validar a versão a fixar no go-live]
  return 'https://graph.facebook.com/' + (versao && /^v\d{1,2}\.\d$/.test(versao) ? versao + '/' : '')
}
const getGraph = (versao: string | undefined, caminho: string, token: string) =>
  chamar(baseGraph(versao) + caminho, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })

// Validade e permissões do token via /debug_token (precisa do App ID e do App Secret). Não é fatal se falhar.
async function inspecionarToken(svc: SupabaseClient, empresa: string, integracao: string, cfg: any, token: string, versao?: string) {
  const appId: string | undefined = cfg.parametros?.app_id
  const appSecret = await segredo(svc, empresa, integracao, 'app_secret')
  if (!appId || !appSecret) return { aviso: 'App ID ou App Secret ausente: não foi possível conferir validade e permissões do token.' }
  const r = await chamar(baseGraph(versao) + 'debug_token?' + new URLSearchParams({ input_token: token }).toString(),
    { headers: { Authorization: `Bearer ${appId}|${appSecret}`, Accept: 'application/json' } })
  const d = r.json?.data
  if (!r.ok || !d) return { aviso: 'Não foi possível inspecionar o token (conferência a validar).' }
  if (d.is_valid === false) return { invalido: true }
  const expira = Number(d.expires_at) > 0 ? new Date(Number(d.expires_at) * 1000).toISOString() : null
  return { detalhes: { validade: expira ?? 'sem expiração informada', permissoes: Array.isArray(d.scopes) ? d.scopes : [] } }
}

async function testarMeta(svc: SupabaseClient, empresa: string, integracao: string, cfg: any): Promise<Resultado> {
  const p = cfg.parametros ?? {}
  const versao: string | undefined = p.api_version
  const nomeToken = integracao === 'facebook' ? 'page_token' : 'access_token'
  const token = await segredo(svc, empresa, integracao, nomeToken)
  let recurso: string | undefined; let campos: string; let rotulo: string
  if (integracao === 'facebook') { recurso = p.page_id; campos = 'id,name'; rotulo = 'a página' }
  else if (integracao === 'whatsapp') { recurso = p.phone_number_id; campos = 'display_phone_number,verified_name,quality_rating,code_verification_status'; rotulo = 'o número' }
  else { recurso = cfg.instagram_user_id_esperado ?? undefined; campos = 'id,username'; rotulo = 'a conta do Instagram' }
  const alvo = integracao === 'facebook' ? 'da página' : integracao === 'whatsapp' ? 'do número (Phone Number ID)' : 'da conta do Instagram'
  if (!recurso) return falha(`Informe o ID ${alvo} e salve.`)
  if (!/^[0-9]{5,25}$/.test(String(recurso))) return falha('O ID informado deve ser numérico.')
  if (!token) return falha('Salve o token de acesso antes de testar.')

  const r = await getGraph(versao, `${recurso}?fields=${campos}`, token)
  if (!r.ok) return erroMeta(r)

  const detalhes: Record<string, unknown> = {}
  const avisos: string[] = []
  if (integracao === 'facebook') detalhes.pagina = r.json?.name ?? null
  else if (integracao === 'whatsapp') {
    detalhes.numero = r.json?.display_phone_number ?? null; detalhes.nome_verificado = r.json?.verified_name ?? null
    detalhes.qualidade = r.json?.quality_rating ?? null
  } else {
    detalhes.usuario = r.json?.username ?? null
    if (r.json?.id && String(r.json.id) !== String(recurso)) return falha('O token pertence a outra conta do Instagram.', r.status)
  }
  const insp = await inspecionarToken(svc, empresa, integracao, cfg, token, versao)
  if ('invalido' in insp) return falha('A Meta informa que este token não é mais válido. Gere um novo e salve.', r.status)
  if ('detalhes' in insp) Object.assign(detalhes, insp.detalhes)
  if ('aviso' in insp && insp.aviso) avisos.push(insp.aviso)
  if (!(await segredo(svc, empresa, integracao, 'verify_token'))) avisos.push('Token de verificação do webhook não definido: o webhook ainda não consegue ser validado.')
  return { ok: true, mensagem: `Conexão funcionando (leitura ${rotulo === 'a página' ? 'da página' : rotulo === 'o número' ? 'do número' : 'da conta do Instagram'}).`, http: r.status, aviso: avisos.join(' ') || undefined, detalhes }
}

// ------------------------------------------------------------------ entrada
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { erro: 'método não permitido' })
  if (!req.headers.get('Authorization')) return json(req, 401, { erro: 'faça login novamente' })

  let c: any
  try { c = await req.json() } catch { return json(req, 400, { erro: 'corpo inválido' }) }
  const { empresa, integracao } = c ?? {}
  if (!ehUuid(empresa) || typeof integracao !== 'string' || !/^[a-z_]{2,40}$/.test(integracao)) return json(req, 400, { erro: 'dados inválidos' })

  const usuario = clienteUsuario(req)
  const { data: pode, error: e1 } = await usuario.rpc('pode_gerir_integracoes', { p_empresa: empresa })
  if (e1) return json(req, 401, { erro: 'sessão inválida ou expirada' })
  if (pode !== true) return json(req, 403, { erro: 'sem permissão' })

  const svc = clienteServico()
  const { data: cfg, error: e2 } = await svc.rpc('svc_ler_config', { p_empresa: empresa, p_integracao: integracao })
  if (e2 || !cfg) return json(req, 404, { erro: 'integração não encontrada' })

  const inicio = Date.now()
  let res: Resultado
  try {
    if (integracao === 'bling') res = await testarBling(svc, empresa, cfg)
    else if (['meta_live', 'meta_dm', 'facebook', 'whatsapp'].includes(integracao)) res = await testarMeta(svc, empresa, integracao, cfg)
    else return json(req, 501, { erro: 'teste ainda não disponível para esta integração' })
  } catch (e) {
    console.error('teste falhou', (e as Error).name)
    res = falha('Erro inesperado ao testar. Tente de novo; se repetir, avise o suporte.')
  }
  const duracao = Date.now() - inicio
  const { data: u } = await usuario.auth.getUser()
  await svc.rpc('svc_registrar_teste', {
    p_empresa: empresa, p_integracao: integracao, p_ok: res.ok, p_http_status: res.http ?? null,
    p_mensagem: res.aviso ? `${res.mensagem} ${res.aviso}` : res.mensagem, p_duracao_ms: duracao, p_detalhes: res.detalhes ?? {}, p_por: u?.user?.id ?? null,
  })
  return json(req, 200, { ok: res.ok, mensagem: res.mensagem, aviso: res.aviso ?? null, detalhes: res.detalhes ?? {}, duracao_ms: duracao })
})
