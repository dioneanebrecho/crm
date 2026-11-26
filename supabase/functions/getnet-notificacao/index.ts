// supabase/functions/getnet-notificacao/index.ts  (pedido 048) — NÃO PUBLICADA: aguarda credenciais da Getnet.
// URL a cadastrar no portal Getnet (Plataforma Digital > notificações):
//   https://<projeto>.supabase.co/functions/v1/getnet-notificacao?k=<segredo do webhook cadastrado em Integrações > Pagamentos>
// Aceita GET (parâmetros na URL) e POST (JSON ou formulário). Sem JWT; a proteção é o segredo "k".
// Todo o tratamento (log, idempotência, confirmação, pedido, fila) fica em api.svc_getnet_notificacao.
import { clienteServico } from '../_shared/comum.ts'

let cache: { lista: string[]; em: number } | null = null
async function segredos(svc: ReturnType<typeof clienteServico>): Promise<string[]> {
  if (cache && Date.now() - cache.em < 60000) return cache.lista
  const { data } = await svc.rpc('svc_getnet_segredos_webhook')
  cache = { lista: Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string' && x !== '') : [], em: Date.now() }
  return cache.lista
}
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const svc = clienteServico()
  const k = url.searchParams.get('k') ?? ''
  const validos = await segredos(svc)
  if (!k || !validos.some((s) => igual(s, k))) return new Response('forbidden', { status: 403 })

  let payload: Record<string, unknown> = Object.fromEntries([...url.searchParams.entries()].filter(([c]) => c !== 'k'))
  if (req.method === 'POST') {
    const tipo = req.headers.get('content-type') ?? ''
    try {
      if (tipo.includes('application/json')) payload = { ...payload, ...(await req.json()) }
      else payload = { ...payload, ...Object.fromEntries(new URLSearchParams(await req.text())) }
    } catch { /* corpo vazio */ }
  }
  const { data, error } = await svc.rpc('svc_getnet_notificacao', { p_payload: payload })
  if (error) { console.error('svc_getnet_notificacao', error.code); return new Response('erro', { status: 500 }) }   // a Getnet reenvia
  return new Response(JSON.stringify({ ok: true, resultado: data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
