// supabase/functions/meta-webhook/index.ts
// Webhook Meta/Instagram (comments/live_comments). Deploy SEM JWT (verify_jwt=false).
// Segredos (verify_token, app_secret) vêm do Vault, cadastrados na tela de Integrações
// (meta_live), via api.svc_meta_webhook_segredos — sem secrets de função nem redeploy para trocar.
// O banco só é acessado por api.svc_* (clienteServico usa db schema 'api').
import { clienteServico } from '../_shared/comum.ts'

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

// Cache curto dos segredos do Vault (evita 1 ida ao banco por evento durante a live).
let cache: { verify: string; secret: string; em: number } | null = null
async function segredos(svc: ReturnType<typeof clienteServico>): Promise<{ verify: string; secret: string }> {
  if (cache && Date.now() - cache.em < 60000) return cache
  const { data } = await svc.rpc('svc_meta_webhook_segredos')
  cache = { verify: (data?.verify_token as string) ?? '', secret: (data?.app_secret as string) ?? '', em: Date.now() }
  return cache
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const svc = clienteServico()

  // Verificação do webhook
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token') ?? ''
    const challenge = url.searchParams.get('hub.challenge') ?? ''
    const { verify } = await segredos(svc)
    if (mode === 'subscribe' && verify && igual(token, verify)) return new Response(challenge, { status: 200 })
    return new Response('forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 })

  const raw = await req.text()
  const { secret } = await segredos(svc)
  const assinaturaOk = !!secret && igual(req.headers.get('x-hub-signature-256') ?? '', 'sha256=' + (await hmacHex(secret, raw)))

  let body: any
  try { body = JSON.parse(raw) } catch { return new Response('json inválido', { status: 400 }) }
  if (body?.object !== 'instagram') return new Response('ok', { status: 200 })

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'comments' && change.field !== 'live_comments') continue
      const payload = { field: change.field, value: change.value, time: entry.time, id: entry.id }
      const { error } = await svc.rpc('svc_ingerir_evento_meta', {
        p_payload: payload,
        p_assinatura_valida: assinaturaOk,
        p_cabecalhos: { 'x-hub-signature-256': req.headers.get('x-hub-signature-256') ?? '' },
      })
      if (error) console.error('svc_ingerir_evento_meta falhou', error.message)
    }
  }
  return new Response('ok', { status: 200 })
})
