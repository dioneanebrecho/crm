// Modelo do e-mail de convite (aprovado por Dione em 22/11/2026; logo e paleta do painel em 22/11/2026). HTML com tabelas e estilo em linha, para funcionar em Gmail e Outlook.
// Tudo que vem de dados é escapado. Nada aqui registra link ou dado pessoal em log.
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const urlSegura = (u: string) => (/^https?:\/\//i.test(u) ? u : '#')

export interface DadosConvite {
  nome: string; empresa: string; convidadoPor: string | null; email: string
  perfil: string                                   // texto: grupos e papéis, ex.: "Equipe de live, Suporte"
  telas: { rotulo: string; nivel: 'ver' | 'editar' }[]
  link: string                                     // link de criação de senha (ou, se já tinha conta, o endereço do painel)
  painelUrl: string; validade: string; jaTinhaConta: boolean
}

export const assuntoConvite = (d: DadosConvite) =>
  d.jaTinhaConta ? `Seu acesso ao painel da ${d.empresa} foi liberado` : `Convite de acesso ao painel – ${d.empresa}`

const NIVEL = { ver: 'Somente ver', editar: 'Ver e editar' } as const

export function htmlConvite(d: DadosConvite): string {
  const dominio = d.painelUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const linhas = d.telas.map((t, i) => {
    const fundo = i % 2 === 0 ? ' bgcolor="#F3E9D8" style="background-color:#F3E9D8;"' : ''
    const cor = t.nivel === 'editar' ? 'color:#5A3F26;font-weight:bold;' : ''
    return `<tr${fundo}><td style="padding:9px 12px;border-bottom:1px solid #E3D4BB;"><b>${esc(t.rotulo)}</b></td><td align="right" style="padding:9px 12px;border-bottom:1px solid #E3D4BB;${cor}">${NIVEL[t.nivel]}</td></tr>`
  }).join('')
  const intro = d.jaTinhaConta
    ? `<b>${esc(d.convidadoPor ?? 'A administração')}</b> liberou o seu acesso ao painel de gestão da <b>${esc(d.empresa)}</b>. Você já tem conta: é só entrar com o seu e-mail e a sua senha de sempre.`
    : `<b>${esc(d.convidadoPor ?? 'A administração')}</b> convidou você para acessar o painel de gestão da <b>${esc(d.empresa)}</b>. É por ele que a equipe cuida das peças, do estoque, dos clientes e das lives.`
  const chamada = d.jaTinhaConta ? '' : '<p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#3A2A1B;">Para ativar seu acesso, crie sua senha pelo botão abaixo. Leva menos de um minuto.</p>'
  const botao = d.jaTinhaConta ? 'Entrar no painel' : 'Criar minha senha'
  const validade = d.jaTinhaConta ? '' : `<p style="margin:14px 0 0 0;font-size:12px;color:#7B6850;">Este link é pessoal, de uso único e vale por ${esc(d.validade)}.</p>`
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F1E7" style="background-color:#F7F1E7;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
<tr><td bgcolor="#26252B" align="center" style="background-color:#26252B;padding:34px 24px 26px 24px;border-radius:12px 12px 0 0;">
<img src="${esc(urlSegura(d.painelUrl))}/logo-anebrecho.jpg" width="96" height="96" alt="${esc(d.empresa)}" style="display:block;margin:0 auto 16px auto;width:96px;height:96px;border-radius:48px;border:3px solid #D4B073;">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:3px;color:#D4B073;">${esc(d.empresa.toUpperCase())}</p>
<p style="margin:6px 0 0 0;font-size:12px;letter-spacing:2px;color:#A9A39A;">PAINEL DE GESTÃO</p></td></tr>
<tr><td bgcolor="#D4B073" height="4" style="background-color:#D4B073;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td bgcolor="#FFFAF2" style="background-color:#FFFAF2;padding:36px 40px 12px 40px;">
<h2 style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#3A2A1B;font-weight:normal;">Olá, ${esc(d.nome)}!</h2>
<p style="margin:0 0 14px 0;font-size:15px;line-height:24px;color:#3A2A1B;">${intro}</p>${chamada}</td></tr>
<tr><td bgcolor="#FFFAF2" align="center" style="background-color:#FFFAF2;padding:0 40px 8px 40px;">
<table cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="#D4B073" style="background-color:#D4B073;border-radius:8px;padding:15px 44px;"><a href="${esc(urlSegura(d.link))}" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#2B2118;text-decoration:none;">${botao}</a></td></tr></table>${validade}</td></tr>
<tr><td bgcolor="#FFFAF2" style="background-color:#FFFAF2;padding:26px 40px 8px 40px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3E9D8" style="background-color:#F3E9D8;border-left:4px solid #D4B073;"><tr><td style="padding:16px 20px;">
<p style="margin:0 0 10px 0;font-size:12px;letter-spacing:1.5px;color:#5A3F26;"><b>SEU ACESSO</b></p>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td width="130" style="padding:4px 0;font-size:14px;color:#7B6850;">E-mail</td><td style="padding:4px 0;font-size:14px;color:#3A2A1B;"><b>${esc(d.email)}</b></td></tr>
<tr><td style="padding:4px 0;font-size:14px;color:#7B6850;">Empresa</td><td style="padding:4px 0;font-size:14px;color:#3A2A1B;"><b>${esc(d.empresa)}</b></td></tr>
<tr><td style="padding:4px 0;font-size:14px;color:#7B6850;">Perfil</td><td style="padding:4px 0;font-size:14px;color:#3A2A1B;"><b>${esc(d.perfil)}</b></td></tr>
</table></td></tr></table></td></tr>
<tr><td bgcolor="#FFFAF2" style="background-color:#FFFAF2;padding:22px 40px 8px 40px;">
<p style="margin:0 0 10px 0;font-size:12px;letter-spacing:1.5px;color:#5A3F26;"><b>O QUE VOCÊ PODERÁ FAZER</b></p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;color:#3A2A1B;">${linhas}</table>
<p style="margin:10px 0 0 0;font-size:12px;color:#7B6850;">Se precisar de mais acesso, é só pedir a quem convidou você.</p></td></tr>
<tr><td bgcolor="#FFFAF2" style="background-color:#FFFAF2;padding:24px 40px 8px 40px;">
<p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1.5px;color:#5A3F26;"><b>COMO ENTRAR DEPOIS</b></p>
<p style="margin:0 0 6px 0;font-size:14px;line-height:22px;color:#3A2A1B;">Acesse sempre por este endereço e entre com seu e-mail e a senha criada:</p>
<p style="margin:0;font-size:15px;"><a href="${esc(urlSegura(d.painelUrl))}" style="color:#5A3F26;font-weight:bold;">${esc(dominio)}</a></p></td></tr>
<tr><td bgcolor="#FFFAF2" style="background-color:#FFFAF2;padding:24px 40px 34px 40px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F1E7" style="background-color:#F7F1E7;"><tr><td style="padding:14px 18px;font-size:13px;line-height:21px;color:#7B6850;">
<b>Segurança:</b> crie uma senha forte e só sua, e nunca a compartilhe. Ninguém da equipe vai pedir sua senha. Se você não esperava este convite, ignore este e-mail: nada será ativado.</td></tr></table></td></tr>
<tr><td bgcolor="#26252B" align="center" style="background-color:#26252B;padding:22px 24px;border-radius:0 0 12px 12px;">
<p style="margin:0 0 6px 0;font-size:12px;line-height:18px;color:#A9A39A;">Convite enviado por ${esc(d.convidadoPor ?? 'a administração')} em nome de ${esc(d.empresa)}</p>
<p style="margin:0;font-size:12px;line-height:18px;color:#A9A39A;">Dúvidas? Responda este e-mail ou fale com quem convidou você.<br>Mensagem automática do painel de gestão · ${esc(dominio)}</p></td></tr>
</table></td></tr></table>`
}

export function textoConvite(d: DadosConvite): string {
  const dominio = d.painelUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  return [
    `Olá, ${d.nome}!`, '',
    d.jaTinhaConta
      ? `${d.convidadoPor ?? 'A administração'} liberou o seu acesso ao painel da ${d.empresa}. Entre com o seu e-mail e a sua senha de sempre: ${d.painelUrl}`
      : `${d.convidadoPor ?? 'A administração'} convidou você para o painel de gestão da ${d.empresa}. Crie sua senha neste link (pessoal, de uso único, vale por ${d.validade}):\n${d.link}`,
    '', `E-mail: ${d.email}`, `Perfil: ${d.perfil}`, '', 'Você poderá acessar:',
    ...d.telas.map((t) => `- ${t.rotulo}: ${NIVEL[t.nivel]}`), '',
    `Depois, entre sempre por ${dominio}.`,
    'Crie uma senha forte e só sua. Ninguém da equipe vai pedir sua senha. Se você não esperava este convite, ignore este e-mail.',
  ].join('\n')
}
