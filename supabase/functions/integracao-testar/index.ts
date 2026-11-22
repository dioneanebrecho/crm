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

// ------------------------------------------------------------------ IA (Gemini para resposta, Voyage/Gemini para vetor)
// Só leitura de metadados ou 1 embedding de uma palavra. A chave vai no cabeçalho, nunca na URL, e nunca é registrada.
const DIM_VETOR = 1024
const BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const BASE_VOYAGE = 'https://api.voyageai.com/v1'
// Mesma lista do banco: a chave só é enviada a hosts do provedor, nunca a um endereço livre.
const BASE_OK = {
  ia_chat: /^https:\/\/(generativelanguage|aiplatform)\.googleapis\.com(\/[A-Za-z0-9._\/-]{1,120})?$/,
  ia_embedding: /^https:\/\/(generativelanguage\.googleapis\.com|api\.voyageai\.com)(\/[A-Za-z0-9._\/-]{1,120})?$/,
} as const
function baseIa(integracao: 'ia_chat' | 'ia_embedding', p: any): string | null {
  const custom = typeof p.base_url === 'string' ? p.base_url.trim().replace(/\/+$/, '') : ''
  if (custom) return BASE_OK[integracao].test(custom) && !custom.includes('..') ? custom : null
  return integracao === 'ia_embedding' && p.provedor === 'voyage' ? BASE_VOYAGE : BASE_GEMINI
}
function erroIa(r: Resposta, nome: string): Resultado {
  if (r.erroRede) return falha(`Não foi possível falar com ${nome} (${r.erroRede}).`)
  if (r.status === 401 || r.status === 403) return falha(`${nome} recusou a chave. Confira se ela está correta, ativa e com acesso ao modelo.`, r.status)
  if (r.status === 404) return falha(`${nome} não encontrou o modelo ou o endereço informado. Confira o nome do modelo e a URL base.`, r.status)
  if (r.status === 429) return falha(`Limite de uso de ${nome} atingido. Tente de novo em alguns instantes.`, r.status)
  if (r.status >= 500) return falha(`${nome} está indisponível no momento. Tente mais tarde.`, r.status)
  return falha(`${nome} recusou a chamada.`, r.status)
}
async function testarIa(svc: SupabaseClient, empresa: string, integracao: 'ia_chat' | 'ia_embedding', cfg: any): Promise<Resultado> {
  const p = cfg.parametros ?? {}
  const chave = await segredo(svc, empresa, integracao, 'api_key')
  if (!chave) return falha('Salve a chave de API antes de testar.')
  const modelo: string = (p.modelo ?? '').trim()
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(modelo)) return falha('Informe o nome do modelo e salve.')
  const base = baseIa(integracao, p)
  if (!base) return falha('A URL base não é permitida. Use um endereço do Google (AI Studio ou Vertex) ou da Voyage.')
  if (integracao === 'ia_chat') {
    if (p.provedor !== 'google_gemini') return falha('Escolha a plataforma e salve.')
    // 1 resposta curta: valida chave, modelo e endereço de ponta a ponta (serve para AI Studio e Vertex)
    const r = await chamar(`${base}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }], generationConfig: { maxOutputTokens: 32 } }) }, 20000)
    if (!r.ok) return erroIa(r, 'o Gemini')
    if (!Array.isArray(r.json?.candidates)) return falha('Resposta inesperada do Gemini (sem resposta gerada). Confira se o endereço e o modelo combinam.', r.status)
    return { ok: true, mensagem: 'Chave válida; o modelo respondeu.', http: r.status, detalhes: { modelo, endereco: new URL(base).host } }
  }
  // ia_embedding: gera 1 vetor e confere a dimensão (o banco usa vetores de 1024 números)
  let r: Resposta; let vetor: unknown; let nome: string
  if (p.provedor === 'voyage') {
    if (!base.startsWith(BASE_VOYAGE.slice(0, 24))) return falha('Para a Voyage use a URL base https://api.voyageai.com/v1 (ou deixe em branco).')
    nome = 'a Voyage'
    r = await chamar(`${base}/embeddings`, {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ input: ['teste'], model: modelo, output_dimension: DIM_VETOR, input_type: 'document' }) }, 15000)
    vetor = r.json?.data?.[0]?.embedding
  } else if (p.provedor === 'google_gemini') {
    if (!base.startsWith('https://generativelanguage.googleapis.com')) return falha('Para o Gemini de vetor use a URL base do Google AI Studio (ou deixe em branco).')
    nome = 'o Gemini'
    r = await chamar(`${base}/models/${encodeURIComponent(modelo)}:embedContent`, {
      method: 'POST', headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: 'teste' }] }, outputDimensionality: DIM_VETOR }) }, 15000)
    vetor = r.json?.embedding?.values
  } else return falha('Escolha a plataforma e salve.')
  if (!r.ok) return erroIa(r, nome)
  if (!Array.isArray(vetor)) return falha('Resposta inesperada do provedor de vetor.', r.status)
  if (vetor.length !== DIM_VETOR) return falha(`O modelo devolveu vetor de ${vetor.length} números; o banco exige ${DIM_VETOR}. Escolha um modelo que aceite 1024.`, r.status, { dimensao: vetor.length })
  return { ok: true, mensagem: `Chave válida; vetor de ${DIM_VETOR} números gerado.`, http: r.status, detalhes: { dimensao: vetor.length, modelo } }
}

// Lista de modelos do provedor (botão "Atualizar lista de modelos"). Não registra teste e não altera nada.
async function listarModelosIa(svc: SupabaseClient, empresa: string, integracao: 'ia_chat' | 'ia_embedding', cfg: any) {
  const p = cfg.parametros ?? {}
  const chave = await segredo(svc, empresa, integracao, 'api_key')
  if (!chave) return { ok: false, mensagem: 'Salve a chave de API antes de listar os modelos.', modelos: [] as string[] }
  const base = baseIa(integracao, p)
  if (!base) return { ok: false, mensagem: 'A URL base não é permitida.', modelos: [] as string[] }
  if (base.startsWith(BASE_VOYAGE.slice(0, 24))) return { ok: true, mensagem: 'A Voyage não oferece lista de modelos pela API. Digite o nome (ex.: voyage-4).', modelos: [] as string[] }
  const r = await chamar(`${base}/models?pageSize=1000`, { headers: { 'x-goog-api-key': chave, Accept: 'application/json' } }, 15000)
  if (r.erroRede) return { ok: false, mensagem: `Não foi possível falar com o Google (${r.erroRede}).`, modelos: [] as string[] }
  if (r.status === 401 || r.status === 403) return { ok: false, mensagem: 'O Google recusou a chave. Confira se ela está correta e ativa.', modelos: [] as string[] }
  if (!r.ok || !Array.isArray(r.json?.models)) {
    return { ok: true, mensagem: 'Este endereço não oferece lista de modelos (comum no Vertex). Digite o nome do modelo e use "Testar conexão".', modelos: [] as string[] }
  }
  const metodo = integracao === 'ia_chat' ? 'generateContent' : 'embedContent'
  const modelos = (r.json.models as any[])
    .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes(metodo) && typeof m?.name === 'string')
    .map((m) => String(m.name).replace(/^models\//, ''))
    .filter((n) => /^[A-Za-z0-9._-]{1,80}$/.test(n))
    .sort()
  return { ok: true, mensagem: modelos.length ? `${modelos.length} modelo(s) disponíveis para esta chave.` : 'Nenhum modelo compatível encontrado para esta chave.', modelos }
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

  if (c?.acao === 'modelos') {
    if (integracao !== 'ia_chat' && integracao !== 'ia_embedding') return json(req, 400, { erro: 'lista de modelos só para as integrações de IA' })
    try { return json(req, 200, await listarModelosIa(svc, empresa, integracao, cfg)) }
    catch (e) { console.error('lista de modelos falhou', (e as Error).name); return json(req, 200, { ok: false, mensagem: 'Não foi possível listar os modelos agora.', modelos: [] }) }
  }

  const inicio = Date.now()
  let res: Resultado
  try {
    if (integracao === 'bling') res = await testarBling(svc, empresa, cfg)
    else if (['meta_live', 'meta_dm', 'facebook', 'whatsapp'].includes(integracao)) res = await testarMeta(svc, empresa, integracao, cfg)
    else if (integracao === 'ia_chat' || integracao === 'ia_embedding') res = await testarIa(svc, empresa, integracao as 'ia_chat' | 'ia_embedding', cfg)
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
