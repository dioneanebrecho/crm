// POST { empresa, cep, forcar? }  (JWT do usuário; papéis checados em api.cep_obter / api.cep_gravar)
// Consulta o CEP na base dos Correios (ViaCEP; BrasilAPI como segunda fonte) e guarda no cache do banco (crm.cfg_cep_cache).
// Cache: CEP encontrado vale 180 dias; CEP não encontrado é reconsultado após 7 dias. Se as fontes estiverem fora do ar, usa o cache vencido.
// O banco decide se a descrição dos Correios é confiável (crm._endereco_padrao); aqui só se obtém e se guarda o dado.
import { chamar, clienteUsuario, cors, ehUuid, json } from '../_shared/comum.ts'

const so = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const DIA = 86400000

interface Cep { encontrado: boolean; logradouro: string | null; complemento: string | null; bairro: string | null; municipio: string | null; uf: string | null; ibge: string | null; fonte: string }

async function viacep(cep: string): Promise<Cep | 'fora'> {
  const r = await chamar(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: 'application/json' } }, 8000)
  if (r.erroRede || !r.ok || !r.json) return 'fora'
  if (r.json.erro) return { encontrado: false, logradouro: null, complemento: null, bairro: null, municipio: null, uf: null, ibge: null, fonte: 'viacep' }
  return { encontrado: true, logradouro: txt(r.json.logradouro), complemento: txt(r.json.complemento), bairro: txt(r.json.bairro), municipio: txt(r.json.localidade), uf: txt(r.json.uf), ibge: txt(r.json.ibge), fonte: 'viacep' }
}

async function brasilapi(cep: string): Promise<Cep | 'fora'> {
  const r = await chamar(`https://brasilapi.com.br/api/cep/v1/${cep}`, { headers: { Accept: 'application/json' } }, 8000)
  if (r.erroRede) return 'fora'
  if (r.status === 404) return { encontrado: false, logradouro: null, complemento: null, bairro: null, municipio: null, uf: null, ibge: null, fonte: 'brasilapi' }
  if (!r.ok || !r.json) return 'fora'
  return { encontrado: true, logradouro: txt(r.json.street), complemento: null, bairro: txt(r.json.neighborhood), municipio: txt(r.json.city), uf: txt(r.json.state), ibge: null, fonte: 'brasilapi' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { erro: 'Método não permitido.' })

  let corpo: { empresa?: unknown; cep?: unknown; forcar?: unknown }
  try { corpo = await req.json() } catch { return json(req, 400, { erro: 'Corpo inválido.' }) }
  if (!ehUuid(corpo.empresa)) return json(req, 400, { erro: 'Empresa inválida.' })
  const cep = so(corpo.cep)
  if (cep.length !== 8) return json(req, 422, { erro: 'CEP inválido: informe 8 dígitos.' })

  const cli = clienteUsuario(req)
  const { data: cache, error: errCache } = await cli.rpc('cep_obter', { p_empresa: corpo.empresa, p_cep: cep })
  if (errCache) return json(req, errCache.code === '42501' ? 403 : 500, { erro: errCache.code === '42501' ? 'Sem permissão para consultar CEP.' : 'Não foi possível ler o cache de CEP.' })

  if (cache && corpo.forcar !== true) {
    const idade = Date.now() - new Date(cache.consultado_em).getTime()
    if (idade < (cache.encontrado ? 180 : 7) * DIA) return json(req, 200, { ...cache, do_cache: true })
  }

  // Fonte principal: ViaCEP. "Não encontrado" só vale se a segunda fonte também não achar.
  let r = await viacep(cep)
  if (r === 'fora' || !r.encontrado) {
    const b = await brasilapi(cep)
    if (b !== 'fora' && (r === 'fora' || b.encontrado)) r = b
  }
  if (r === 'fora') {
    if (cache) return json(req, 200, { ...cache, do_cache: true, vencido: true })
    return json(req, 502, { erro: 'Não foi possível consultar o CEP agora (ViaCEP e BrasilAPI fora do ar).' })
  }
  const { error } = await cli.rpc('cep_gravar', { p_empresa: corpo.empresa, p_cep: cep, p_dados: r })
  if (error) return json(req, error.code === '42501' ? 403 : 500, { erro: 'Não foi possível guardar o CEP no cache.' })
  return json(req, 200, { cep, ...r, consultado_em: new Date().toISOString(), do_cache: false })
})
