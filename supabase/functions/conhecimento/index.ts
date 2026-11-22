// POST { empresa, acao: 'indexar' | 'processar' | 'buscar', ... }  (JWT do usuário)
//  indexar   { titulo, texto, tipo?, sensibilidade?, origem? }  -> mascara dados pessoais, divide em trechos e grava (precisa editar a tela Conhecimento)
//  processar { reabrir? }                                       -> gera os vetores pendentes em lotes de 32 (precisa editar; exige IA de vetor ligada)
//  buscar    { pergunta, limite? }                              -> busca por texto + vetor (RRF); sem vetor, só texto (precisa ver Assistente ou Conhecimento)
// O texto nunca depende do vetor: se o provedor de vetor falhar, a busca por texto continua funcionando.
import { chamar, clienteServico, clienteUsuario, cors, ehUuid, json } from '../_shared/comum.ts'
import { DIM_VETOR, dividirEmTrechos, fundirRRF, gerarVetores, mascarar, sha256Hex, type Achado, type ConfigVetor } from '../_shared/rag.ts'

const MAX_TEXTO = 400_000
const LOTE = 32
const PRAZO_MS = 90_000 // a função devolve antes do limite da plataforma; o painel chama de novo enquanto houver pendentes
const BASE_VOYAGE = 'https://api.voyageai.com/v1'
const BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const BASE_OK = /^https:\/\/(generativelanguage\.googleapis\.com|api\.voyageai\.com)(\/[A-Za-z0-9._\/-]{1,120})?$/
const TIPOS = ['documento', 'regra', 'politica', 'outro']
const SENS = ['baixa', 'media', 'alta']
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Svc = ReturnType<typeof clienteServico>

// Lê a IA de vetor da empresa. null = desligada ou incompleta (a busca por texto segue funcionando).
async function configVetor(svc: Svc, empresa: string): Promise<{ cfg?: ConfigVetor; motivo?: string }> {
  const { data: c } = await svc.rpc('svc_ler_config', { p_empresa: empresa, p_integracao: 'ia_embedding' })
  if (!c) return { motivo: 'IA de vetor não encontrada' }
  if (c.modo === 'desligado') return { motivo: 'A IA de vetor está desligada (modo Desligado). A busca usa só o texto.' }
  const p = c.parametros ?? {}
  if (p.provedor !== 'voyage' && p.provedor !== 'google_gemini') return { motivo: 'Escolha a plataforma da IA de vetor.' }
  if (typeof p.modelo !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(p.modelo)) return { motivo: 'Informe o modelo da IA de vetor.' }
  const custom = typeof p.base_url === 'string' ? p.base_url.trim().replace(/\/+$/, '') : ''
  const base = custom || (p.provedor === 'voyage' ? BASE_VOYAGE : BASE_GEMINI)
  if (!BASE_OK.test(base) || base.includes('..')) return { motivo: 'URL base da IA de vetor não permitida.' }
  if ((p.provedor === 'voyage') !== base.startsWith('https://api.voyageai.com')) return { motivo: 'A URL base não combina com a plataforma escolhida.' }
  const { data: chave } = await svc.rpc('svc_ler_segredo', { p_empresa: empresa, p_integracao: 'ia_embedding', p_nome: 'api_key' })
  if (typeof chave !== 'string' || !chave) return { motivo: 'Falta salvar a chave da IA de vetor.' }
  return { cfg: { provedor: p.provedor, modelo: p.modelo, base, chave } }
}

async function resumo(usuario: ReturnType<typeof clienteUsuario>, empresa: string) {
  const { data } = await usuario.rpc('listar_fontes', { p_empresa: empresa })
  return data?.resumo ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { erro: 'método não permitido' })
  if (!req.headers.get('Authorization')) return json(req, 401, { erro: 'faça login novamente' })
  let c: any
  try { c = await req.json() } catch { return json(req, 400, { erro: 'corpo inválido' }) }
  const empresa = c?.empresa; const acao = c?.acao
  if (!ehUuid(empresa) || !['indexar', 'processar', 'buscar'].includes(acao)) return json(req, 400, { erro: 'dados inválidos' })

  const usuario = clienteUsuario(req)
  const { data: u, error: eu } = await usuario.auth.getUser()
  if (eu || !u?.user) return json(req, 401, { erro: 'sessão inválida ou expirada' })
  const svc = clienteServico()
  const http = (url: string, init: RequestInit, prazo?: number) => chamar(url, init, prazo)

  try {
    // ------------------------------------------------------------ indexar
    if (acao === 'indexar') {
      const { data: pode } = await usuario.rpc('pode_tela', { p_empresa: empresa, p_tela: 'conhecimento', p_nivel: 'editar' })
      if (pode !== true) return json(req, 403, { erro: 'sem permissão para editar a base de conhecimento' })
      const titulo = typeof c.titulo === 'string' ? c.titulo.trim() : ''
      const texto = typeof c.texto === 'string' ? c.texto : ''
      const tipo = c.tipo ?? 'documento'; const sens = c.sensibilidade ?? 'baixa'
      if (titulo.length < 1 || titulo.length > 200) return json(req, 400, { erro: 'título de 1 a 200 caracteres' })
      if (texto.trim().length < 1 || texto.length > MAX_TEXTO) return json(req, 400, { erro: `o texto deve ter de 1 a ${MAX_TEXTO.toLocaleString('pt-BR')} caracteres` })
      if (!TIPOS.includes(tipo) || !SENS.includes(sens)) return json(req, 400, { erro: 'tipo ou sensibilidade inválidos' })
      const origem = typeof c.origem === 'string' ? c.origem.slice(0, 300) : null
      const m = mascarar(texto) // CPF, e-mail e telefone saem antes de gravar
      const trechos = await dividirEmTrechos(titulo, m.texto)
      if (trechos.length === 0) return json(req, 400, { erro: 'o texto não tem conteúdo útil' })
      const { data, error } = await svc.rpc('svc_gravar_fonte', {
        p_empresa: empresa, p_titulo: titulo, p_tipo: tipo, p_sensibilidade: sens, p_origem: origem, p_texto: m.texto,
        p_hash: await sha256Hex(m.texto), p_chunks: trechos.map((t) => ({ indice: t.indice, titulo: t.titulo, conteudo: t.conteudo, hash: t.hash, tokens: t.tokens })),
        p_mascarados: m.mascarados, p_por: u.user.id,
      })
      if (error) { console.error('indexar falhou', error.code); return json(req, 400, { erro: 'não foi possível gravar o documento' }) }
      return json(req, 200, { ok: true, ...data, mascarados: m.mascarados })
    }

    // ------------------------------------------------------------ processar (vetores pendentes)
    if (acao === 'processar') {
      const { data: pode } = await usuario.rpc('pode_tela', { p_empresa: empresa, p_tela: 'conhecimento', p_nivel: 'editar' })
      if (pode !== true) return json(req, 403, { erro: 'sem permissão para editar a base de conhecimento' })
      const { cfg, motivo } = await configVetor(svc, empresa)
      if (!cfg) return json(req, 200, { ok: false, motivo, resumo: await resumo(usuario, empresa) })
      // troca de modelo: descarta vetor de outro modelo (o texto segue pesquisável) e, se pedido, reabre os trechos que esgotaram as tentativas
      await svc.rpc('svc_preparar_fila', { p_empresa: empresa, p_modelo: cfg.modelo, p_zerar_falhas: c.reabrir === true })
      const inicio = Date.now(); let gravados = 0; let aguardar: number | null = null; let erro: string | null = null
      while (Date.now() - inicio < PRAZO_MS) {
        const { data: lote } = await svc.rpc('svc_chunks_pendentes', { p_empresa: empresa, p_limite: LOTE })
        if (!Array.isArray(lote) || lote.length === 0) break
        const ids: string[] = lote.map((x: any) => x.id)
        const r = await gerarVetores(http, cfg, lote.map((x: any) => x.texto), 'document')
        if (!r.ok) {
          // limite do provedor não gasta tentativa: o trecho continua na fila e o painel espera e chama de novo
          await svc.rpc('svc_marcar_falha_chunks', { p_ids: ids, p_erro: r.erro, p_conta: !r.cota })
          if (r.cota) aguardar = r.cota.aguardar_s
          erro = r.erro ?? 'falha ao gerar vetores'
          break
        }
        const { data: n, error } = await svc.rpc('svc_gravar_vetores', { p_itens: ids.map((id, i) => ({ id, embedding: r.vetores![i] })), p_modelo: cfg.modelo })
        if (error) { console.error('gravar vetores falhou', error.code); erro = 'não foi possível gravar os vetores'; break }
        gravados += Number(n) || 0
        await dormir(250)
      }
      return json(req, 200, { ok: erro === null, gravados, aguardar_s: aguardar, erro, resumo: await resumo(usuario, empresa) })
    }

    // ------------------------------------------------------------ buscar
    const pergunta = typeof c.pergunta === 'string' ? c.pergunta.trim().slice(0, 1000) : ''
    if (pergunta.length < 2) return json(req, 400, { erro: 'escreva a pergunta' })
    const limite = Math.min(Math.max(Number(c.limite) || 8, 1), 20)
    const t0 = Date.now()
    const t = await usuario.rpc('buscar_conhecimento_texto', { p_empresa: empresa, p_query: pergunta, p_limite: 20 })
    if (t.error) return json(req, t.error.code === '42501' ? 403 : 400, { erro: t.error.code === '42501' ? 'sem permissão' : 'busca indisponível' })
    const porTexto: Achado[] = (t.data ?? []).map((x: any) => ({ ...x, score: Number(x.score) }))

    let porVetor: Achado[] = []; let aviso: string | null = null
    const { cfg, motivo } = await configVetor(svc, empresa)
    if (!cfg) aviso = motivo ?? null
    else {
      const e = await gerarVetores(http, cfg, [pergunta], 'query')
      if (!e.ok) aviso = `Busca só por texto: ${e.erro}.`
      else {
        const v = await usuario.rpc('buscar_conhecimento_vetor', { p_empresa: empresa, p_embedding: JSON.stringify(e.vetores![0]), p_modelo: cfg.modelo, p_limite: 20, p_min_similaridade: 0.25 })
        if (v.error) aviso = 'Busca só por texto: a busca por vetor não respondeu.'
        else porVetor = (v.data ?? []).map((x: any) => ({ ...x, score: Number(x.score) }))
      }
    }
    const resultados = fundirRRF(porTexto, porVetor, limite)
    const modo = porTexto.length && porVetor.length ? 'hybrid' : porVetor.length ? 'vector' : 'text'
    await svc.rpc('svc_registrar_recuperacao', {
      p_empresa: empresa, p_usuario: u.user.id, p_pergunta: mascarar(pergunta).texto, p_modo: modo,
      p_chunks: resultados.map((r) => r.chunk_id), p_latencia: Date.now() - t0,
    })
    return json(req, 200, { ok: true, modo, aviso, resultados, dimensao: DIM_VETOR })
  } catch (e) {
    console.error('conhecimento falhou', (e as Error).name)
    return json(req, 500, { erro: 'erro inesperado; tente de novo' })
  }
})
