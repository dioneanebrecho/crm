// POST { empresa, cnpj }  (JWT do usuário; admin, gestor e suporte)
// Consulta o CNPJ na ReceitaWS (mesmo serviço usado pelo "Importar dados da ReceitaWS" da Sankhya). Só leitura.
// CPF não é consultado aqui: a ReceitaWS é de CNPJ. O CPF é conferido só pelos dígitos verificadores.
// Não grava o resultado nem o CNPJ completo: o registro de auditoria guarda só os 4 últimos dígitos (api.registrar_consulta_receita).
import { chamar, clienteUsuario, cors, ehUuid, json } from '../_shared/comum.ts'

const so = (v: unknown) => String(v ?? '').replace(/\D/g, '')

function cnpjValido(v: string): boolean {
  const d = so(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string, pesos: number[]) => {
    const s = pesos.reduce((a, p, i) => a + Number(base[i]) * p, 0) % 11
    return s < 2 ? 0 : 11 - s
  }
  const a = dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const b = dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return a === Number(d[12]) && b === Number(d[13])
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { erro: 'Método não permitido.' })

  let corpo: { empresa?: unknown; cnpj?: unknown }
  try { corpo = await req.json() } catch { return json(req, 400, { erro: 'Corpo inválido.' }) }
  if (!ehUuid(corpo.empresa)) return json(req, 400, { erro: 'Empresa inválida.' })
  const cnpj = so(corpo.cnpj)
  if (!cnpjValido(cnpj)) return json(req, 422, { erro: 'CNPJ inválido: os dígitos verificadores não conferem.' })

  // Confere o papel do usuário e registra a consulta (sem o número completo).
  const { error: errPapel } = await clienteUsuario(req).rpc('registrar_consulta_receita', { p_empresa: corpo.empresa, p_documento_ultimos: cnpj })
  if (errPapel) return json(req, errPapel.code === '42501' ? 403 : 500, { erro: errPapel.code === '42501' ? 'Sem permissão para consultar a Receita.' : 'Não foi possível registrar a consulta.' })

  const r = await chamar(`https://receitaws.com.br/v1/cnpj/${cnpj}`, { headers: { Accept: 'application/json' } }, 15000)
  if (r.erroRede) return json(req, 502, { erro: `Não foi possível falar com a ReceitaWS (${r.erroRede}).` })
  if (r.status === 429) return json(req, 429, { erro: 'Limite de consultas da ReceitaWS atingido. Aguarde um minuto e tente de novo.' })
  if (!r.ok || !r.json) return json(req, 502, { erro: 'A ReceitaWS não respondeu como esperado.' })
  if (r.json.status === 'ERROR') return json(req, 404, { erro: txt(r.json.message) ?? 'CNPJ não encontrado na ReceitaWS.' })

  const j = r.json
  const atividade = Array.isArray(j.atividade_principal) && j.atividade_principal[0] ? `${j.atividade_principal[0].code ?? ''} ${j.atividade_principal[0].text ?? ''}`.trim() : null
  return json(req, 200, {
    cnpj,
    nome: txt(j.nome), fantasia: txt(j.fantasia), situacao: txt(j.situacao), data_situacao: txt(j.data_situacao),
    abertura: txt(j.abertura), porte: txt(j.porte), natureza_juridica: txt(j.natureza_juridica), atividade_principal: atividade,
    logradouro: txt(j.logradouro), numero: txt(j.numero), complemento: txt(j.complemento), bairro: txt(j.bairro),
    municipio: txt(j.municipio), uf: txt(j.uf), cep: txt(j.cep), telefone: txt(j.telefone), email: txt(j.email),
    ultima_atualizacao: txt(j.ultima_atualizacao),
  })
})
