// POST { empresa, integracao, nome, valor }  (JWT do usuário)
// Só admin da empresa grava, e só nomes de segredo permitidos para o painel. O valor vai direto ao Vault.
import { clienteServico, clienteUsuario, cors, ehUuid, json } from '../_shared/comum.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { erro: 'método não permitido' })
  if (!req.headers.get('Authorization')) return json(req, 401, { erro: 'faça login novamente' })

  let c: any
  try { c = await req.json() } catch { return json(req, 400, { erro: 'corpo inválido' }) }
  const { empresa, integracao, nome } = c ?? {}
  const valor = typeof c?.valor === 'string' ? c.valor.trim() : ''
  if (!ehUuid(empresa) || typeof integracao !== 'string' || typeof nome !== 'string' || !/^[a-z_]{2,40}$/.test(integracao) || !/^[a-z_]{2,40}$/.test(nome)) {
    return json(req, 400, { erro: 'dados inválidos' })
  }
  if (valor.length < 1 || valor.length > 4000) return json(req, 400, { erro: 'valor vazio ou longo demais' })

  const usuario = clienteUsuario(req)
  const { data: pode, error: e1 } = await usuario.rpc('pode_gravar_segredo_painel', { p_empresa: empresa, p_integracao: integracao, p_nome: nome })
  if (e1) return json(req, 401, { erro: 'sessão inválida ou expirada' })
  if (pode !== true) return json(req, 403, { erro: 'sem permissão para gravar esta credencial' })

  const { error: e2 } = await clienteServico().rpc('svc_gravar_segredo', {
    p_empresa: empresa, p_integracao: integracao, p_nome: nome, p_valor: valor, p_expira: null, p_invalida_teste: true,
  })
  if (e2) { console.error('svc_gravar_segredo falhou', e2.code); return json(req, 500, { erro: 'não foi possível gravar a credencial' }) }
  return json(req, 200, { ok: true })
})
