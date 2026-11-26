// supabase/functions/pagamento/index.ts  (pedido 048) — NÃO PUBLICADA: aguarda credenciais e homologação da Getnet.
// Chamado pela página pública do link (sem JWT de usuário; a autorização é o token pessoal da reserva).
// POST { token, forma: 'pix' | 'cartao' }  ->  { modo, pix_copia_cola?, pix_expira_em?, link_url?, valor_centavos }
// Fluxo: api.svc_cobranca_da_reserva (cria/reaproveita a cobrança) -> Getnet (Pix ou link de cartão) -> api.svc_getnet_registrar.
// Pagamento confirmado chega pela função getnet-notificacao (nunca pelo navegador).
// [validar] caminhos e campos marcados abaixo, com a documentação da conta da Ane na Getnet (Plataforma Digital).
import { chamar, clienteServico, cors, json } from '../_shared/comum.ts'

const BASES: Record<string, string> = {
  sandbox: 'https://api-sandbox.getnet.com.br',
  homologacao: 'https://api-homologacao.getnet.com.br',
  producao: 'https://api.getnet.com.br',
}
let tokenCache: { valor: string; expira: number; chave: string } | null = null

async function tokenGetnet(base: string, clientId: string, secret: string): Promise<string | null> {
  const chave = `${base}|${clientId}`
  if (tokenCache && tokenCache.chave === chave && tokenCache.expira > Date.now() + 60000) return tokenCache.valor
  // OAuth 2.0 client_credentials [validar escopo "oob"]
  const r = await chamar(`${base}/auth/oauth/v2/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${clientId}:${secret}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'scope=oob&grant_type=client_credentials',
  }, 10000)
  if (!r.ok || !r.json?.access_token) return null
  tokenCache = { valor: r.json.access_token, expira: Date.now() + (Number(r.json.expires_in ?? 3600) * 1000), chave }
  return tokenCache.valor
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { erro: 'método não permitido' })
  let corpo: { token?: unknown; forma?: unknown }
  try { corpo = await req.json() } catch { return json(req, 400, { erro: 'corpo inválido' }) }
  const token = typeof corpo.token === 'string' && /^[0-9a-f]{64}$/.test(corpo.token) ? corpo.token : null
  const forma = corpo.forma === 'cartao' ? 'cartao' : 'pix'
  if (!token) return json(req, 400, { erro: 'nao_encontrada' })

  const svc = clienteServico()
  const { data: cob, error } = await svc.rpc('svc_cobranca_da_reserva', { p_token: token })
  if (error) { console.error('svc_cobranca_da_reserva', error.code); return json(req, 500, { erro: 'indisponivel' }) }
  if (cob?.erro) return json(req, 409, { erro: cob.erro })
  if (cob.gateway_modo !== 'real') return json(req, 200, { modo: cob.gateway_modo ?? 'desligado' })   // página cai no WhatsApp

  if (forma === 'pix' && cob.pix_copia_cola) return json(req, 200, { modo: 'real', pix_copia_cola: cob.pix_copia_cola, pix_expira_em: cob.pix_expira_em, valor_centavos: cob.valor_centavos })
  if (forma === 'cartao' && cob.link_url) return json(req, 200, { modo: 'real', link_url: cob.link_url, valor_centavos: cob.valor_centavos })

  const cfg = cob.config ?? {}
  const base = (cfg.base_url as string | undefined)?.replace(/\/+$/, '') || BASES[cfg.ambiente as string] || BASES.homologacao
  const { data: secret } = await svc.rpc('svc_ler_segredo', { p_empresa: cob.empresa_id, p_integracao: 'gateway', p_nome: 'client_secret' })
  if (!cfg.client_id || !cfg.seller_id || !secret) return json(req, 200, { modo: 'nao_configurado' })
  const acesso = await tokenGetnet(base, cfg.client_id, secret)
  if (!acesso) return json(req, 502, { erro: 'gateway_indisponivel' })

  if (forma === 'pix') {
    // Pix dinâmico: expira junto com a reserva (máx. 30 min na Getnet; padrão 3 min) [validar limites na conta]
    const restante = Math.floor((new Date(cob.expira_em).getTime() - Date.now()) / 1000)
    const expiracao = Math.max(180, Math.min(1800, restante))
    const r = await chamar(`${base}/v1/payments/qrcode/pix`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${acesso}`, seller_id: cfg.seller_id, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: cob.valor_centavos, currency: 'BRL', order_id: cob.cobranca_id, customer_id: cob.parceiro_id ?? cob.cobranca_id, expiration_time: expiracao }),
    }, 15000)
    const qr = r.json?.additional_data?.qr_code   // [validar] campo do "copia e cola"
    if (!r.ok || !qr) { console.error('getnet pix', r.status); return json(req, 502, { erro: 'gateway_recusou' }) }
    const expira = r.json?.additional_data?.expiration_date_qrcode ?? new Date(Date.now() + expiracao * 1000).toISOString()
    await svc.rpc('svc_getnet_registrar', { p_cobranca: cob.cobranca_id, p_dados: { payment_id: r.json.payment_id, pix_copia_cola: qr, pix_expira_em: expira, status: r.json.status } })
    return json(req, 200, { modo: 'real', pix_copia_cola: qr, pix_expira_em: expira, valor_centavos: cob.valor_centavos })
  }

  // Cartão (Apple Pay / Google Pay aparecem na página da Getnet quando habilitados): Payment Link API (BR)
  // [validar] caminho e corpo na referência da conta: docs.globalgetnet.com > Payment Link API (BR)
  const caminho = (cfg.link_path as string | undefined) || '/v1/payment-links'
  const r = await chamar(`${base}${caminho}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acesso}`, seller_id: cfg.seller_id, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'custom', label: `Ane Brechó · pedido ${String(cob.cobranca_id).slice(0, 8)}`, order_id: cob.cobranca_id,
      amount: cob.valor_centavos, currency: 'BRL', expiration: cob.expira_em, max_orders: 1,
      payment: { credit: { enable: true, max_installments: 1 }, debit: { enable: true } },
    }),
  }, 15000)
  const url = r.json?.url ?? r.json?.link ?? r.json?.payment_link_url
  if (!r.ok || !url) { console.error('getnet link', r.status); return json(req, 502, { erro: 'gateway_recusou' }) }
  await svc.rpc('svc_getnet_registrar', { p_cobranca: cob.cobranca_id, p_dados: { link_id: r.json.link_id ?? r.json.id, link_url: url, status: 'link_criado' } })
  return json(req, 200, { modo: 'real', link_url: url, valor_centavos: cob.valor_centavos })
})
