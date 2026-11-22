// impressao-agente — porta única do agente de impressão (adaptada do zstock-agente-impressao).
// O agente NÃO recebe service key nem JWT de usuário: ele se autentica com um segredo gerado no próprio PC
// (o banco guarda só o SHA-256) e só enxerga a fila da empresa que o aprovou (aprovação feita no painel, aba Agentes).
// verify_jwt = false (ver config.toml): a autorização é o segredo do agente, conferido em api.agente_autenticar.
// Toda a lógica fica no banco (api.agente_*, migration 0031); esta função só valida a entrada e faz o long-poll.
//
// Ações (POST JSON; header x-agente-secret em tudo, exceto solicitar_pareamento):
//   solicitar_pareamento {hostname, versao, secret_hash} -> {agente_id, codigo, expira_em}
//   status_pareamento                                    -> {status}
//   proximos_jobs {espera_ms?}                           -> {jobs[]}   (long-poll de até 20 s)
//   resultado {job_id, sucesso, erro?}                   -> {resultado}
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ehUuid } from '../_shared/comum.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agente-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const erro = (status: number, msg: string, codigo?: string) => resp(status, { erro: msg, codigo })

const LONG_POLL_MAX_MS = 20_000
const LONG_POLL_INTERVALO_MS = 1_500
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return erro(405, 'Método não suportado')

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'api' },
  })
  try {
    const body = await req.json().catch(() => ({}))
    const acao = String(body.acao ?? '')

    if (acao === 'solicitar_pareamento') {
      const hostname = String(body.hostname ?? '').trim().slice(0, 120)
      const secretHash = String(body.secret_hash ?? '').toLowerCase()
      if (!hostname) return erro(400, 'hostname obrigatório')
      if (!/^[0-9a-f]{64}$/.test(secretHash)) return erro(400, 'secret_hash inválido')
      const { data, error } = await sb.rpc('agente_registrar', { p_hostname: hostname, p_versao: String(body.versao ?? '').slice(0, 30), p_secret_hash: secretHash })
      if (error) return erro(error.message.includes('Muitos') ? 429 : 500, error.message)
      return resp(200, { sucesso: true, agente_id: data.id, codigo: data.codigo, expira_em: data.expira_em })
    }

    if (!['status_pareamento', 'proximos_jobs', 'resultado'].includes(acao)) return erro(400, `Ação desconhecida: ${acao || '(vazia)'}`)

    // ---- autenticação do agente
    const secret = req.headers.get('x-agente-secret') ?? ''
    if (!ehUuid(body.agente_id) || secret.length < 32) return erro(401, 'Credencial do agente ausente ou inválida.', 'credencial_invalida')
    const agenteId = body.agente_id as string
    const { data: auth, error: aErr } = await sb.rpc('agente_autenticar', { p_agente: agenteId, p_secret_hash: await sha256Hex(secret) })
    if (aErr) throw new Error(aErr.message)
    if (auth.status === 'invalido') return erro(401, 'Credencial do agente inválida.', 'credencial_invalida')

    if (acao === 'status_pareamento') return resp(200, { sucesso: true, status: auth.status })

    if (auth.status === 'revogado') return erro(403, 'Este agente foi revogado.', 'revogado')
    if (auth.status !== 'ativo') return erro(403, 'Agente ainda não aprovado.', 'nao_aprovado')

    if (acao === 'proximos_jobs') {
      const espera = Math.max(0, Math.min(Number(body.espera_ms ?? LONG_POLL_MAX_MS) || 0, LONG_POLL_MAX_MS))
      const limite = Date.now() + espera
      // deno-lint-ignore no-explicit-any
      let jobs: any[] = []
      while (true) {
        const { data, error } = await sb.rpc('agente_reservar_jobs', { p_agente: agenteId, p_limite: 5 })
        if (error) throw new Error(error.message)
        jobs = data ?? []
        if (jobs.length > 0 || Date.now() + LONG_POLL_INTERVALO_MS > limite) break
        await sleep(LONG_POLL_INTERVALO_MS)
      }
      // o agente do ZStock também lê conteudo_pdf_url: aqui só há ZPL (PDF é a fase seguinte)
      return resp(200, { sucesso: true, jobs: jobs.map((j) => ({ ...j, conteudo_pdf_url: null })) })
    }

    // acao === 'resultado'
    if (!ehUuid(body.job_id)) return erro(400, 'job_id inválido')
    const { data: r, error: rErr } = await sb.rpc('agente_registrar_resultado', {
      p_agente: agenteId, p_job: body.job_id, p_ok: body.sucesso === true,
      p_erro: body.sucesso === true ? null : String(body.erro ?? 'Erro não informado pelo agente').slice(0, 500),
      p_hostname: String(body.hostname ?? '').slice(0, 120) || null,
    })
    if (rErr) throw new Error(rErr.message)
    if (r === 'ignorado') return erro(409, 'Job não está reservado para este agente.', 'job_nao_reservado')
    return resp(200, { sucesso: true, resultado: r })
  } catch (e) {
    console.error('impressao-agente', (e as Error).message)
    return erro(500, 'Erro interno ao processar a solicitação do agente.')
  }
})
