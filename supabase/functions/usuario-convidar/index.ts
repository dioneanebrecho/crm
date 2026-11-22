// POST { empresa, convite }  (JWT do admin que convidou)
// 1) confere com o banco que quem chamou é admin da empresa e que o convite está pendente (api.obter_convite);
// 2) cria o usuário no Auth e gera o link de criação de senha (service role, que nunca sai daqui);
// 3) liga o convite ao usuário (api.convite_vincular) e envia o e-mail HTML por Resend ou SMTP.
// E-mail: usa o Resend já configurado para os alertas (remetente em engine.cfg_alerta, chave no Vault; provisório) via api.svc_email_config.
// Se SMTP_HOST estiver definido, o SMTP vence (conta própria do admin). Senão, config dos alertas ou segredos da função: EMAIL_REMETENTE + RESEND_API_KEY, ou SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS.
// Se o e-mail não puder ser enviado, devolve o link ao admin para repassar só à pessoa convidada (o convite continua valendo).
// PAINEL_URL = endereço do painel.
import { clienteServico, clienteUsuario, cors, ehUuid, json } from '../_shared/comum.ts'
import { assuntoConvite, htmlConvite, textoConvite, type DadosConvite } from '../_shared/emailConvite.ts'

const PAPEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', suporte: 'Suporte', apresentadora: 'Apresentadora', expedicao: 'Expedição', financeiro: 'Financeiro', leitura: 'Consulta' }

async function enviarEmail(cfg: { remetente?: string | null; api_key?: string | null } | null, para: string, assunto: string, html: string, texto: string): Promise<{ enviado: boolean; motivo?: string }> {
  // 1) SMTP (ex.: Gmail com senha de app) tem prioridade quando SMTP_HOST está definido: o e-mail sai da própria conta do administrador.
  const host = Deno.env.get('SMTP_HOST')
  if (host) {
    const usuario = Deno.env.get('SMTP_USER') ?? ''
    const de = Deno.env.get('EMAIL_REMETENTE') || usuario
    if (!de) return { enviado: false, motivo: 'sem_provedor' }
    try {
      const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')
      const porta = Number(Deno.env.get('SMTP_PORT') ?? '465')
      const c = new SMTPClient({ connection: { hostname: host, port: porta, tls: porta === 465,
        auth: { username: usuario, password: Deno.env.get('SMTP_PASS') ?? '' } } })
      await c.send({ from: de, to: para, subject: assunto, content: texto, html })
      await c.close()
      return { enviado: true }
    } catch (e) { console.error('smtp falhou', (e as Error).name); return { enviado: false, motivo: 'falha_envio' } }
  }
  // 2) Resend (config dos alertas ou segredos da função).
  const remetente = cfg?.remetente || Deno.env.get('EMAIL_REMETENTE') || ''
  const chave = cfg?.api_key || Deno.env.get('RESEND_API_KEY')
  if (chave && remetente) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remetente, to: [para], subject: assunto, html, text: texto }),
    })
    if (!r.ok) { console.error('resend falhou', r.status); return { enviado: false, motivo: r.status === 403 || r.status === 422 ? 'remetente_restrito' : 'falha_envio' } }
    return { enviado: true }
  }
  return { enviado: false, motivo: 'sem_provedor' }
}

async function acharUsuario(admin: ReturnType<typeof clienteServico>, email: string) {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error || !data?.users?.length) return null
    const u = data.users.find((x) => (x.email ?? '').toLowerCase() === email)
    if (u) return u
    if (data.users.length < 200) return null
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { erro: 'método não permitido' })
  if (!req.headers.get('Authorization')) return json(req, 401, { erro: 'faça login novamente' })

  let c: any
  try { c = await req.json() } catch { return json(req, 400, { erro: 'corpo inválido' }) }
  const { empresa, convite } = c ?? {}
  if (!ehUuid(empresa) || !ehUuid(convite)) return json(req, 400, { erro: 'dados inválidos' })

  const { data: cv, error: e1 } = await clienteUsuario(req).rpc('obter_convite', { p_empresa: empresa, p_convite: convite })
  if (e1) return json(req, e1.code === '42501' ? 403 : 401, { erro: e1.code === '42501' ? 'só administradores enviam convites' : 'sessão inválida ou expirada' })
  if (!cv || cv.status !== 'pendente') return json(req, 409, { erro: 'este convite não está mais pendente' })
  if (cv.expirado) return json(req, 409, { erro: 'o convite expirou; crie um novo' })

  const painelUrl = (Deno.env.get('PAINEL_URL') ?? 'https://crm.evoconecta.io').replace(/\/$/, '')
  const admin = clienteServico()
  const email = String(cv.email).toLowerCase()
  let link = painelUrl, jaTinhaConta = false, usuarioId: string | null = null

  const gerar = () => admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: painelUrl, data: { nome: cv.nome } } })
  let { data: gl, error: e2 } = await gerar()
  if (e2) {
    const existente = await acharUsuario(admin, email)
    if (!existente) { console.error('generateLink falhou', e2.code); return json(req, 500, { erro: 'não foi possível criar o convite' }) }
    if (existente.email_confirmed_at) {            // já tem conta: só libera o acesso
      jaTinhaConta = true; usuarioId = existente.id
    } else {                                       // convite antigo nunca aceito: recria para invalidar o link anterior
      const { error: ed } = await admin.auth.admin.deleteUser(existente.id)
      if (ed) { console.error('deleteUser falhou'); return json(req, 500, { erro: 'não foi possível renovar o convite' }) }
      ;({ data: gl, error: e2 } = await gerar())
      if (e2) { console.error('generateLink (2) falhou', e2.code); return json(req, 500, { erro: 'não foi possível criar o convite' }) }
    }
  }
  if (!jaTinhaConta) { usuarioId = gl!.user.id; link = `${painelUrl}/#convite=${gl!.properties.hashed_token}` }

  const { error: e3 } = await admin.rpc('convite_vincular', { p_convite: convite, p_auth_user: usuarioId })
  if (e3) { console.error('convite_vincular falhou', e3.code); return json(req, 500, { erro: 'não foi possível vincular o convite' }) }

  const perfil = [...(cv.grupos as string[]), ...(cv.papeis as string[]).map((p) => PAPEL[p] ?? p)].join(', ')
  const dados: DadosConvite = {
    nome: cv.nome, empresa: cv.empresa, convidadoPor: cv.convidado_por, email, perfil, painelUrl, link, jaTinhaConta,
    validade: '24 horas', telas: (cv.telas as { rotulo: string; nivel: 'ver' | 'editar' }[]).map((t) => ({ rotulo: t.rotulo, nivel: t.nivel })),
  }
  const { data: cfg } = await admin.rpc('svc_email_config', { p_empresa: empresa })
  const r = await enviarEmail(cfg, email, assuntoConvite(dados), htmlConvite(dados), textoConvite(dados))
  if (r.enviado) return json(req, 200, { ok: true, enviado: true })
  const aviso = r.motivo === 'remetente_restrito'
    ? 'O Resend recusou o envio: o remetente provisório (onboarding@resend.dev) só entrega ao e-mail do dono da conta. Verifique um domínio no Resend para convidar outras pessoas. Por ora, repasse o link abaixo só para a pessoa convidada.'
    : r.motivo === 'sem_provedor'
      ? 'O envio de e-mail ainda não está configurado. Repasse o link abaixo só para a pessoa convidada.'
      : 'O convite foi criado, mas o e-mail não saiu. Repasse o link abaixo só para a pessoa convidada ou use "Reenviar".'
  return json(req, 200, { ok: true, enviado: false, link, aviso })
})
