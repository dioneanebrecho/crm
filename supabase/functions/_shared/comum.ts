// Utilitários das Edge Functions de integração. Nada aqui registra segredo em log.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

// Origens que podem chamar a função pelo navegador: PAINEL_ORIGENS (separadas por vírgula) + localhost:5173 em desenvolvimento.
function origemPermitida(req: Request): string | null {
  const origem = req.headers.get('Origin')
  if (!origem) return null
  const lista = (Deno.env.get('PAINEL_ORIGENS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  lista.push('http://localhost:5173')
  return lista.includes(origem) ? origem : null
}

export function cors(req: Request): Record<string, string> {
  const origem = origemPermitida(req)
  return {
    ...(origem ? { 'Access-Control-Allow-Origin': origem } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(req: Request, status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// Cliente com o JWT do usuário que chamou: as funções api.* checam o papel dele.
export function clienteUsuario(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'api' },
  })
}

// Cliente de serviço: só para api.svc_*. A chave nunca sai da função.
export function clienteServico(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'api' },
  })
}

export interface Resposta { status: number; ok: boolean; json: any; erroRede?: string }

// Chamada HTTP com prazo. Nunca devolve o corpo bruto nem cabeçalhos (podem conter credencial).
export async function chamar(url: string, init: RequestInit = {}, prazoMs = 10000): Promise<Resposta> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), prazoMs)
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal })
    let j: any = null
    try { j = await r.json() } catch { /* corpo não-JSON */ }
    return { status: r.status, ok: r.ok, json: j }
  } catch (e) {
    return { status: 0, ok: false, json: null, erroRede: (e as Error).name === 'AbortError' ? 'tempo esgotado' : 'falha de rede' }
  } finally { clearTimeout(t) }
}
