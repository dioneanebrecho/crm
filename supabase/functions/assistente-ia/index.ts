// POST { empresa, acao: 'interpretar' | 'analisar', ... }  (JWT do usuário; precisa ver a tela Assistente)
//  interpretar { pergunta, hoje, contexto? } -> ficha estruturada da pergunta (período, agrupamento, métrica, top N, gráfico...), VALIDADA aqui.
//  analisar    { pergunta, periodo, dimensao, metrica, linhas, resumo } -> texto curto de análise + sugestões de próximas perguntas.
// A IA nunca calcula nem consulta o banco: quem consulta e soma são as funções api.* do banco. Nomes de cliente não saem daqui:
// na análise, cada cliente vai como código (C1, C2...) e o painel troca pelo nome ao exibir. Pergunta passa pela máscara de dados pessoais.
import { chamar, clienteServico, clienteUsuario, cors, ehUuid, json } from '../_shared/comum.ts'
import { mascarar } from '../_shared/rag.ts'

const BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const BASE_OK = /^https:\/\/(generativelanguage|aiplatform)\.googleapis\.com(\/[A-Za-z0-9._\/-]{1,120})?$/
const DIMS = ['dia', 'semana', 'mes', 'cliente', 'situacao', 'recebimento']
const METRICAS = ['valor', 'qtd', 'ticket']
const TIPOS = ['coluna', 'barra', 'linha', 'area', 'pizza', 'rosca', 'waterfall', 'funil', 'pareto', 'calor', 'dispersao']
const INTENCOES = ['vendas', 'cliente', 'documentos', 'esclarecer', 'comparativo', 'margem', 'indisponivel']
const ISO = /^\d{4}-\d{2}-\d{2}$/
const txt = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '')

type Svc = ReturnType<typeof clienteServico>

async function configChat(svc: Svc, empresa: string): Promise<{ base: string; modelo: string; chave: string; modo: string } | { motivo: string }> {
  const { data: c } = await svc.rpc('svc_ler_config', { p_empresa: empresa, p_integracao: 'ia_chat' })
  if (!c) return { motivo: 'IA de conversa não configurada' }
  if (c.modo === 'desligado') return { motivo: 'A IA de conversa está desligada' }
  const p = c.parametros ?? {}
  if (p.provedor !== 'google_gemini') return { motivo: 'Plataforma de IA não suportada' }
  if (typeof p.modelo !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(p.modelo)) return { motivo: 'Modelo de IA não informado' }
  const custom = typeof p.base_url === 'string' ? p.base_url.trim().replace(/\/+$/, '') : ''
  const base = custom || BASE_GEMINI
  if (!BASE_OK.test(base) || base.includes('..')) return { motivo: 'URL base da IA não permitida' }
  const { data: chave } = await svc.rpc('svc_ler_segredo', { p_empresa: empresa, p_integracao: 'ia_chat', p_nome: 'api_key' })
  if (typeof chave !== 'string' || !chave) return { motivo: 'Falta salvar a chave da IA de conversa' }
  return { base, modelo: p.modelo, chave, modo: String(c.modo) }
}

async function gerar(cfg: { base: string; modelo: string; chave: string }, sistema: string, usuario: string, json_: boolean): Promise<{ ok: true; texto: string } | { ok: false; motivo: string; cota?: boolean }> {
  const r = await chamar(`${cfg.base}/models/${encodeURIComponent(cfg.modelo)}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': cfg.chave, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: 'user', parts: [{ text: usuario }] }],
      generationConfig: { temperature: json_ ? 0 : 0.3, maxOutputTokens: 2048, ...(json_ ? { responseMimeType: 'application/json' } : {}) },
    }),
  }, 25000)
  if (r.erroRede) return { ok: false, motivo: r.erroRede }
  if (r.status === 429) return { ok: false, motivo: 'limite de uso da IA atingido', cota: true }
  if (!r.ok) return { ok: false, motivo: `a IA respondeu com erro (${r.status})` }
  const partes = r.json?.candidates?.[0]?.content?.parts
  const t = Array.isArray(partes) ? partes.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('').trim() : ''
  if (!t) return { ok: false, motivo: 'a IA não devolveu resposta' }
  return { ok: true, texto: t }
}
const extrairJson = (t: string): any => {
  const limpo = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(limpo) } catch { const i = limpo.indexOf('{'), f = limpo.lastIndexOf('}'); if (i >= 0 && f > i) { try { return JSON.parse(limpo.slice(i, f + 1)) } catch { /* segue */ } } return null }
}

const dataOk = (s: unknown, hoje: string): s is string => {
  if (typeof s !== 'string' || !ISO.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s <= hoje && s >= '2015-01-01'
}
function periodoValido(p: any, hoje: string): { de: string; ate: string; rotulo: string } | null {
  if (!p || !dataOk(p.de, hoje) || !dataOk(p.ate, hoje) || p.de > p.ate) return null
  if ((new Date(p.ate).getTime() - new Date(p.de).getTime()) / 86400000 > 366 * 6) return null
  return { de: p.de, ate: p.ate, rotulo: txt(p.rotulo, 80) || `${p.de} a ${p.ate}` }
}

// Ficha que a IA devolve, conferida campo a campo: o que não está na lista permitida é descartado.
function validarFicha(f: any, hoje: string) {
  if (!f || typeof f !== 'object' || !INTENCOES.includes(f.intencao)) return null
  const out: any = { intencao: f.intencao, entendimento: txt(f.entendimento, 240) }
  if (f.intencao === 'cliente') { const t = txt(f.cliente_termo, 60).replace(/^@/, ''); if (t.length < 3) return null; out.cliente_termo = t }
  if (f.intencao === 'vendas') {
    out.periodo = f.periodo === null || f.periodo === undefined ? null : periodoValido(f.periodo, hoje)
    if (f.periodo && !out.periodo) return null
    out.todo_periodo = f.todo_periodo === true && !out.periodo
    out.periodo_assumido = f.periodo_assumido === true
    out.dimensao = DIMS.includes(f.dimensao) ? f.dimensao : null
    out.metrica = METRICAS.includes(f.metrica) ? f.metrica : null
    out.tipo_grafico = TIPOS.includes(f.tipo_grafico) ? f.tipo_grafico : null
    out.mostrar_grafico = f.mostrar_grafico === true || !!out.tipo_grafico || !!out.dimensao
    const n = Math.round(Number(f.limite)); out.limite = Number.isFinite(n) && n >= 1 && n <= 30 ? n : null
    if (!out.periodo && !out.todo_periodo) out.periodo_assumido = true
  }
  if (f.intencao === 'comparativo') {
    const ps = (Array.isArray(f.periodos) ? f.periodos : []).map((p: any) => periodoValido(p, hoje)).filter(Boolean).slice(0, 6)
    if (ps.length < 2) return null
    out.periodos = ps
  }
  if (f.intencao === 'esclarecer') {
    const q = txt(f.esclarecimento?.pergunta, 200)
    const ops = (Array.isArray(f.esclarecimento?.opcoes) ? f.esclarecimento.opcoes : []).map((o: any) => ({ rotulo: txt(o?.rotulo, 80), texto: txt(o?.pergunta_completa, 300) })).filter((o: any) => o.rotulo && o.texto).slice(0, 5)
    if (!q || ops.length < 2) return null
    out.esclarecimento = { pergunta: q, opcoes: ops }
  }
  // "margem": margem bruta de um período (api.assistente_margem, migration 0060). O período segue as mesmas regras de "vendas".
  if (f.intencao === 'margem') {
    out.periodo = f.periodo === null || f.periodo === undefined ? null : periodoValido(f.periodo, hoje)
    if (f.periodo && !out.periodo) return null
    out.todo_periodo = f.todo_periodo === true && !out.periodo
    out.periodo_assumido = f.periodo_assumido === true
    if (!out.periodo && !out.todo_periodo) out.periodo_assumido = true
  }
  // "indisponivel": é pergunta de número, mas nenhuma ferramenta responde a métrica/dimensão pedida.
  // Nunca vira "documentos": o painel mostra a resposta honesta (lacuna) e, se houver, a regra relacionada como contexto.
  if (f.intencao === 'indisponivel') {
    const lac = txt(f.lacuna, 400)
    if (!lac) return null
    out.lacuna = lac
    out.consulta_conhecimento = txt(f.consulta_conhecimento, 200) || null
    out.sugestao = txt(f.sugestao, 200) || null
  }
  return out
}

const SISTEMA_INTERPRETAR = `Você interpreta perguntas de uma gestora de um brechó (Ane Brechó, vendas por lives no Instagram e loja física) feitas ao assistente do painel.
Você NÃO responde a pergunta e NÃO calcula nada: apenas devolve uma ficha JSON que o sistema executa no banco.
Os dados de vendas são PEDIDOS DE VENDA do Bling (com situação, cliente, valor, recebimento). Responda SOMENTE com JSON, sem texto fora dele.

PRINCÍPIO CENTRAL — a intenção vence a palavra-chave: classifique pelo que a pessoa QUER, não pelo assunto que a frase menciona.
- Se pede um NÚMERO / APURAÇÃO (quanto, qual o total, quantos, ranking, "apurada", "do mês passado", "por cliente/mês/cidade/categoria", ticket, faturamento, margem, lucro, rentabilidade) => é intenção de DADO ("vendas", "cliente", "comparativo" ou "indisponivel"), NUNCA "documentos", mesmo que o termo também apareça numa regra.
- Se pede COMO FUNCIONA / POLÍTICA / DEFINIÇÃO (como funciona, qual a regra, quanto tempo dura a reserva, o que acontece se, posso, está dentro da política) => "documentos".
- Exemplos decisivos: "qual a margem bruta do mês passado" ou "qual foi a margem de outubro" => "margem" (ela quer o VALOR do período: preço − custo dos itens vendidos). "qual a margem de contribuição apurada no mês passado" => é DADO, mas a margem de contribuição ainda não é calculável: use "indisponivel"; JAMAIS "documentos". Já "como a margem é calculada?" ou "qual a margem mínima da gestão?" => "documentos".

Campos:
- intencao: "vendas" (números de vendas por período/agrupamento/ranking/gráfico), "margem" (margem bruta de um período: receita dos itens vendidos − custo dos produtos), "cliente" (vendas de UM cliente citado por @instagram ou nome), "comparativo" (comparar 2+ períodos), "documentos" (regras, processos, políticas, "como fazer"), "esclarecer" (pergunta ambígua), "indisponivel" (ver abaixo).
- Use "indisponivel" quando a pergunta é de DADO/número mas NENHUMA ferramenta responde a métrica ou a dimensão pedida. Hoje as ferramentas respondem APENAS: métrica valor/qtd/ticket; dimensão dia/semana/mes/cliente/situacao/recebimento; e a MARGEM BRUTA de um período (intenção "margem"). Ainda NÃO existe ferramenta para: margem de contribuição, lucro líquido, rentabilidade (exigem frete, comissão, taxas e imposto); custo por produto; nem para as dimensões cidade, categoria, marca, fornecedor/consignante. Pergunta de número sobre qualquer um desses => "indisponivel" (nunca "documentos", nunca invente que é "vendas").
- entendimento: uma frase curta em português dizendo como você entendeu o pedido (ex.: "Top 10 clientes por valor vendido, nos últimos 6 meses").
- Para "vendas": periodo {de, ate, rotulo} em AAAA-MM-DD (use a data de hoje informada para calcular "últimos N meses/dias", "mês passado", "este ano" etc.; "últimos 6 meses" = de 6 meses atrás +1 dia até hoje); todo_periodo (true se pediu tudo/histórico completo); periodo_assumido (true se a pessoa NÃO informou período: então use periodo = últimos 30 dias); dimensao: "dia"|"semana"|"mes"|"cliente"|"situacao"|"recebimento"|null ("top/maiores clientes", "por cliente" => "cliente"; evolução/por mês => "mes" ou "dia"; "pagos/recebidos/em aberto" => "recebimento"; "cancelados/situação" => "situacao"); metrica: "valor"|"qtd"|"ticket"|null; limite (quantos itens num ranking, ex.: top 10 => 10; sem número e ranking => 10); tipo_grafico: "coluna"|"barra"|"linha"|"area"|"pizza"|"rosca"|"waterfall"|"funil"|"pareto"|"calor"|"dispersao"|null (só se a pessoa pediu um tipo); mostrar_grafico (true se pediu gráfico, ranking, evolução ou distribuição; false para um total simples).
- Para "cliente": cliente_termo (o @ sem o @, ou o nome).
- Para "comparativo": periodos [ {de, ate, rotulo}, ... ] (2 a 6).
- Para "margem": periodo {de, ate, rotulo} em AAAA-MM-DD, todo_periodo e periodo_assumido exatamente como em "vendas" (sem período informado: últimos 30 dias, com periodo_assumido true).
- Para "indisponivel": lacuna (UMA frase honesta do que falta para calcular, sem prometer o número — ex.: "A margem de contribuição depende de frete, comissão, repasse ao consignante, taxas de pagamento e imposto, que o Bling não registra nos pedidos e ainda não foram carregados; hoje só calculo a margem bruta (preço − custo atual do produto).", com sugestao "margem bruta do mês passado"; para dimensão ausente: "A venda por cidade ainda não está disponível: as ferramentas de venda não têm essa dimensão."); consulta_conhecimento (texto curto para o sistema buscar a regra relacionada, se existir — ex.: "margem mínima precificação"); sugestao (opcional: a pergunta de dado MAIS PRÓXIMA que o sistema JÁ responde hoje, ex.: "total de vendas do mês passado").
- Para "esclarecer": esclarecimento {pergunta, opcoes:[{rotulo, pergunta_completa}, ...]} com 2 a 4 opções, cada pergunta_completa já pronta para ser enviada. Use quando a pessoa disser "última semana" (pergunte: últimos 7 dias ou semana passada de segunda a domingo) ou quando faltar algo essencial que você não pode assumir.
Nunca invente cliente, número ou período que a pessoa não pediu.`

const SISTEMA_ANALISAR = `Você escreve a análise curta de um gráfico de vendas de um brechó, em português do Brasil, tom direto e útil para a gestora.
Regras: use SOMENTE os números e fatos fornecidos (nunca calcule, estime ou invente valores; arredonde apenas o que já vier pronto). Se um número não está nos dados, não o cite.
Clientes aparecem como códigos entre colchetes, como [C1]; cite-os exatamente assim, sem inventar nomes.
Fale do que chama atenção: concentração, maiores e menores, variação, e AVISE sobre limites dos dados quando constarem (ex.: carga do histórico ainda em andamento, período sem dados).
No máximo 5 frases, sem listas longas, sem títulos. Depois, sugira até 3 perguntas de acompanhamento curtas que o assistente consiga responder (sobre vendas por período, cliente, recebimento ou situação).
As sugestões são perguntas sobre vendas gerais (período, dimensão, métrica); NUNCA cite clientes nem códigos [Cn] nelas.
Responda SOMENTE com JSON: {"texto": "...", "sugestoes": ["...", "..."]}.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { erro: 'método não permitido' })
  if (!req.headers.get('Authorization')) return json(req, 401, { erro: 'faça login novamente' })
  let c: any
  try { c = await req.json() } catch { return json(req, 400, { erro: 'corpo inválido' }) }
  const empresa = c?.empresa; const acao = c?.acao
  if (!ehUuid(empresa) || !['interpretar', 'analisar'].includes(acao)) return json(req, 400, { erro: 'dados inválidos' })

  const usuario = clienteUsuario(req)
  const { data: u, error: eu } = await usuario.auth.getUser()
  if (eu || !u?.user) return json(req, 401, { erro: 'sessão inválida ou expirada' })
  const { data: pode } = await usuario.rpc('pode_tela', { p_empresa: empresa, p_tela: 'assistente', p_nivel: 'ver' })
  if (pode !== true) return json(req, 403, { erro: 'sem permissão para usar o assistente' })
  const svc = clienteServico()

  try {
    const cfg = await configChat(svc, empresa)
    if ('motivo' in cfg) return json(req, 200, { ok: false, motivo: cfg.motivo })
    const hoje = dataOk(c.hoje, '9999-12-31') ? c.hoje : new Date().toISOString().slice(0, 10)

    if (acao === 'interpretar') {
      const pergunta = mascarar(txt(c.pergunta, 600)).texto
      if (pergunta.length < 2) return json(req, 400, { erro: 'escreva a pergunta' })
      const ctx = c.contexto && typeof c.contexto === 'object'
        ? `\nContexto da conversa (resultado anterior): período ${txt(c.contexto.rotulo, 80)}, agrupamento ${txt(c.contexto.dimensao, 20)}, métrica ${txt(c.contexto.metrica, 20)}. Perguntas curtas como "e do mês passado?" ou "agora em pizza" continuam esse resultado.` : ''
      const dow = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(hoje + 'T12:00:00Z').getUTCDay()]
      const r = await gerar(cfg, SISTEMA_INTERPRETAR, `Hoje é ${hoje} (${dow}).${ctx}\nPergunta: ${pergunta}`, true)
      if (!r.ok) return json(req, 200, { ok: false, motivo: r.motivo })
      const ficha = validarFicha(extrairJson(r.texto), hoje)
      if (!ficha) return json(req, 200, { ok: false, motivo: 'não consegui interpretar a pergunta' })
      return json(req, 200, { ok: true, modo: cfg.modo, ficha })
    }

    // ---- analisar: os números chegam prontos do banco; aqui só viram texto
    const linhas = (Array.isArray(c.linhas) ? c.linhas : []).slice(0, 40).map((l: any) => ({
      ref: txt(l?.ref, 40), qtd: Number.isFinite(Number(l?.qtd)) ? Number(l.qtd) : null, valor: l?.valor == null || !Number.isFinite(Number(l.valor)) ? null : Number(l.valor),
    }))
    if (linhas.length === 0) return json(req, 400, { erro: 'sem dados para analisar' })
    const total = linhas.reduce((s: number, l: any) => s + (l.valor ?? 0), 0)
    const qtdTotal = linhas.reduce((s: number, l: any) => s + (l.qtd ?? 0), 0)
    const usaValor = linhas.some((l: any) => l.valor != null)
    const base = usaValor ? total : qtdTotal
    const ord = [...linhas].sort((a: any, b: any) => (usaValor ? (b.valor ?? 0) - (a.valor ?? 0) : (b.qtd ?? 0) - (a.qtd ?? 0)))
    const pct = (n: number) => (base > 0 ? Math.round((n / base) * 1000) / 10 : 0)
    const v = (l: any) => (usaValor ? (l.valor ?? 0) : (l.qtd ?? 0))
    const fatos = {
      itens: linhas.length, total_valor: usaValor ? Math.round(total * 100) / 100 : null, total_pedidos: qtdTotal,
      maior: { ref: ord[0].ref, valor: ord[0].valor, pedidos: ord[0].qtd, percentual_do_total: pct(v(ord[0])) },
      menor: { ref: ord[ord.length - 1].ref, valor: ord[ord.length - 1].valor, pedidos: ord[ord.length - 1].qtd },
      top3_percentual_do_total: pct(ord.slice(0, 3).reduce((s: number, l: any) => s + v(l), 0)),
      media_por_item: usaValor ? Math.round((total / linhas.length) * 100) / 100 : null,
    }
    const msg = JSON.stringify({
      pergunta: mascarar(txt(c.pergunta, 400)).texto, periodo: txt(c.periodo, 80), agrupamento: txt(c.dimensao, 20), metrica: txt(c.metrica, 20),
      avisos_dos_dados: (Array.isArray(c.avisos) ? c.avisos : []).slice(0, 4).map((a: unknown) => txt(a, 160)),
      resumo_geral: c.resumo && typeof c.resumo === 'object' ? {
        pedidos_validos: Number(c.resumo.qtd_validas) || 0, cancelados: Number(c.resumo.qtd_canceladas) || 0,
        total_vendido: c.resumo.valor_total == null ? null : Number(c.resumo.valor_total),
      } : null,
      fatos_calculados_pelo_sistema: fatos, linhas,
    })
    const r = await gerar(cfg, SISTEMA_ANALISAR, msg, true)
    if (!r.ok) return json(req, 200, { ok: false, motivo: r.motivo })
    const j = extrairJson(r.texto)
    const texto = txt(j?.texto, 1200)
    if (!texto) return json(req, 200, { ok: false, motivo: 'a IA não devolveu análise' })
    const sugestoes = (Array.isArray(j?.sugestoes) ? j.sugestoes : []).map((s: unknown) => txt(s, 120)).filter((s: string) => s.length > 5).slice(0, 3)
    return json(req, 200, { ok: true, modo: cfg.modo, texto, sugestoes, fatos })
  } catch (e) {
    console.error('assistente-ia falhou', (e as Error).name)
    return json(req, 500, { erro: 'erro inesperado; tente de novo' })
  }
})
