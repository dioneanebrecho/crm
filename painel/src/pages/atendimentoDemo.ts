// Modo de exemplo da Caixa de entrada: conversas fictícias, só na memória do navegador.
// Nada é gravado no banco nem enviado a cliente. Serve para ver a tela populada (canais, origens, etapas, janela).
import {
  apiAtendimento, renderizarLocal,
  type Canais, type CanalConversa, type ConversaLinha, type DetalheConversa, type EstadoConversa, type EtapaVenda,
  type FonteAtendimento, type Mensagem, type OrigemEntrada, type Resumo,
} from '../apiAtendimento'

const min = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const daqui = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

interface Semente {
  id: string; nome: string | null; ig: string | null; tel: string | null; canal: CanalConversa; estado: EstadoConversa
  origem: OrigemEntrada; etapa: EtapaVenda; atendente: 'eu' | 'william' | null; vendoAgora?: string
  etiquetas: string[]; adiadaAte?: string; ultimaEntradaMin: number
  bloqueado?: boolean; tentativas?: number   // pedido 048: lista de bloqueio
  vars: Record<string, string>; hist: DetalheConversa['historico']
  msgs: [number, Mensagem['direcao'], Mensagem['autor_tipo'], string, Mensagem['estado_entrega']?, string?][]  // [min atrás, direção, autor, texto, entrega, resposta pronta]
}

const CORES: Record<string, string> = { 'Dúvida de medida': '#7a9cc6', Pagamento: '#b8975a', Rastreio: '#6fa58b', 'Troca/Devolução': '#c98a5a', 'Reclamação': '#c0605a' }
const H0 = { pedidos: 0, total_comprado: 0, reservas_vencidas: 0, cancelamentos: 0 }

const SEMENTES: Semente[] = [
  { id: 'd1', nome: 'Mariana Costa', ig: 'mari.costa', tel: null, canal: 'instagram', estado: 'aberta', etapa: 'pix_gerado', atendente: null,
    origem: { tipo: 'live', canal: 'live', peca: 'A123' }, etiquetas: ['Pagamento'], ultimaEntradaMin: 3,
    vars: { 'reserva.peca': 'A123', 'reserva.descricao': 'Vestido midi floral M', 'reserva.valor': 'R$ 89,90', 'reserva.link': 'https://anebrecho.com.br/a/k3x9', 'reserva.expira_em': '20:17', 'reserva.minutos_restantes': '11',
            'cobranca.valor': 'R$ 102,80', 'cobranca.link': 'https://anebrecho.com.br/pix/M4r1', 'cobranca.expira_em': '20:17' },
    hist: { pedidos: 3, total_comprado: 412.7, reservas_vencidas: 0, cancelamentos: 0 },
    msgs: [[6, 'saida', 'automacao', 'Oi! Vi seu interesse na peça A123 na live. Garanta aqui: https://anebrecho.com.br/a/k3x9', 'lida'],
           [3, 'entrada', 'cliente', 'oii, tentei pagar mas o Pix não abriu 😥 ainda tá reservado pra mim?']] },
  { id: 'd2', nome: 'Bia Souza', ig: null, tel: '+55 34 99999-8888', canal: 'whatsapp', estado: 'aberta', etapa: 'na_fila', atendente: null,
    origem: { tipo: 'link_quero', canal: 'whatsapp', peca: 'A123' }, etiquetas: [], ultimaEntradaMin: 9,
    vars: { 'fila.peca': 'A123', 'fila.posicao': '2' }, hist: H0,
    msgs: [[9, 'entrada', 'cliente', 'Quero a peça A123'],
           [9, 'saida', 'automacao', 'Oi, Bia! A A123 · Vestido midi floral (M) já está reservada, mas você entrou na fila em 2º lugar. Se a reserva atual não for paga até 20:17, ela passa para você e te aviso aqui na hora.', 'lida'],
           [8, 'entrada', 'cliente', 'ai torcendo!! tem outra parecida no M?']] },
  { id: 'd3', nome: 'Carla Mendes', ig: 'carlamendes', tel: '+55 34 98888-1111', canal: 'whatsapp', estado: 'aberta', etapa: 'pix_gerado', atendente: 'eu',
    origem: { tipo: 'vitrine', canal: 'whatsapp', peca: 'B45' }, etiquetas: ['Pagamento'], ultimaEntradaMin: 25,
    vars: { 'cobranca.valor': 'R$ 142,80', 'cobranca.link': 'https://anebrecho.com.br/pix/7Hq2', 'cobranca.expira_em': '20:40', 'reserva.peca': 'B45', 'reserva.descricao': 'Blazer linho P', 'reserva.valor': 'R$ 129,90' },
    hist: { pedidos: 1, total_comprado: 89.9, reservas_vencidas: 1, cancelamentos: 0 },
    msgs: [[31, 'entrada', 'cliente', 'Oi! Reservei o blazer B45 pela vitrine, o frete pra Araguari fica quanto?'],
           [29, 'saida', 'atendente', 'Oi, Carla! Para Araguari o PAC sai R$ 12,90 e chega em 2 dias úteis.', 'lida'],
           [27, 'saida', 'atendente', 'Seu Pix de R$ 142,80 está aqui: https://anebrecho.com.br/pix/7Hq2. Ele vale até 20:40.', 'lida', 'pix'],
           [25, 'entrada', 'cliente', 'perfeito, pago daqui a pouco']] },
  { id: 'd4', nome: null, ig: 'julia.brecho', tel: null, canal: 'instagram', estado: 'aberta', etapa: null, atendente: null,
    origem: { tipo: 'direto', canal: 'instagram' }, etiquetas: ['Dúvida de medida'], ultimaEntradaMin: 18,
    vars: {}, hist: H0,
    msgs: [[18, 'entrada', 'cliente', 'boa noite! a calça pantalona da live de ontem tem quantos cm de cintura? visto 40']] },
  { id: 'd5', nome: 'Renata Lima', ig: null, tel: '+55 34 99777-2222', canal: 'whatsapp', estado: 'pendente', etapa: 'enviada', atendente: 'eu',
    origem: { tipo: 'direto', canal: 'whatsapp' }, etiquetas: ['Rastreio'], ultimaEntradaMin: 95,
    vars: { 'pedido.numero': '1045', 'pedido.situacao': 'Enviado', 'pedido.valor': 'R$ 129,70', 'envio.transportadora': 'Correios', 'envio.codigo_rastreio': 'QB123456789BR', 'envio.link_rastreio': 'https://rastreamento.correios.com.br', 'envio.situacao': 'Em trânsito' },
    hist: { pedidos: 6, total_comprado: 788.4, reservas_vencidas: 1, cancelamentos: 0 },
    msgs: [[100, 'entrada', 'cliente', 'Oi, meu pedido já foi enviado?'],
           [98, 'saida', 'atendente', 'Seu pedido 1045 foi enviado pela Correios. Código de rastreio: QB123456789BR. Acompanhe aqui: https://rastreamento.correios.com.br', 'lida', 'rastreio'],
           [95, 'entrada', 'cliente', 'obrigada! vou acompanhar'],
           [94, 'nota', 'atendente', 'Pendente: conferir se a etiqueta foi postada hoje mesmo.']] },
  { id: 'd6', nome: 'Patrícia Alves', ig: 'paty.alves', tel: null, canal: 'instagram', estado: 'aberta', etapa: 'paga', atendente: 'william',
    origem: { tipo: 'vitrine', canal: 'ig_story', peca: 'C88' }, etiquetas: [], ultimaEntradaMin: 41,
    vars: { 'pedido.numero': '1052', 'pedido.situacao': 'Pagamento confirmado', 'pedido.valor': 'R$ 74,90' },
    hist: { pedidos: 2, total_comprado: 164.8, reservas_vencidas: 0, cancelamentos: 0 },
    msgs: [[45, 'entrada', 'cliente', 'paguei a saia C88 que vi no story!'],
           [44, 'saida', 'atendente', 'Pagamento confirmado, Patrícia! Já estamos separando seu pedido 1052. Obrigada pela compra!', 'lida', 'pago'],
           [41, 'entrada', 'cliente', 'consegue mandar junto com a blusa que vou pegar na próxima live?']] },
  { id: 'd7', nome: 'Fernanda Rocha', ig: null, tel: '+55 34 99123-4567', canal: 'whatsapp', estado: 'adiada', etapa: 'entregue', atendente: 'eu',
    origem: { tipo: 'direto', canal: 'whatsapp' }, etiquetas: ['Troca/Devolução'], adiadaAte: daqui(600), ultimaEntradaMin: 180,
    vars: { 'pedido.numero': '1031', 'pedido.situacao': 'Entregue' }, hist: { pedidos: 4, total_comprado: 356, reservas_vencidas: 0, cancelamentos: 1 },
    msgs: [[190, 'entrada', 'cliente', 'O vestido ficou apertado no busto, consigo trocar?'],
           [185, 'saida', 'atendente', 'Recebi sua solicitação, Fernanda. Vou verificar com a equipe e te retorno em breve com as próximas etapas.', 'lida', 'troca'],
           [180, 'nota', 'atendente', 'Adiado para amanhã 9h: confirmar com a Ane a política de troca de peça de live.']] },
  { id: 'd8', nome: null, ig: 'lu.vintage', tel: null, canal: 'instagram', estado: 'resolvida', etapa: 'entregue', atendente: 'william',
    origem: { tipo: 'live', canal: 'live', peca: 'B12' }, etiquetas: [], ultimaEntradaMin: 1500,
    vars: {}, hist: { pedidos: 9, total_comprado: 1240.5, reservas_vencidas: 2, cancelamentos: 0 },
    msgs: [[1510, 'saida', 'automacao', 'Oi! Vi seu interesse na peça B12 na live. Garanta aqui: https://anebrecho.com.br/a/p0q1', 'lida'],
           [1500, 'entrada', 'cliente', 'chegou!! amei, obrigada 💛'],
           [1499, 'saida', 'atendente', 'Que bom que gostou! Até a próxima live 💛', 'lida']] },
  { id: 'd9', nome: 'Sandra Oliveira', ig: null, tel: '+55 34 98765-0000', canal: 'whatsapp', estado: 'aberta', etapa: null, atendente: null,
    origem: { tipo: 'link_quero', canal: 'whatsapp', peca: 'D12' }, etiquetas: [], ultimaEntradaMin: 1800,
    vars: {}, hist: H0,
    msgs: [[1800, 'entrada', 'cliente', 'Quero a peça D12'],
           [1799, 'saida', 'automacao', 'Oi, Sandra! A D12 foi vendida para quem estava à frente na fila. Separei opções parecidas para você: https://anebrecho.com.br/p/D12', 'lida']] },
  { id: 'd10', nome: 'Camila Duarte', ig: 'cami.duarte', tel: null, canal: 'instagram', estado: 'aberta', etapa: null, atendente: 'william', vendoAgora: 'William',
    origem: { tipo: 'direto', canal: 'instagram' }, etiquetas: ['Reclamação'], ultimaEntradaMin: 7,
    vars: { 'pedido.numero': '1040', 'pedido.situacao': 'Entregue' }, hist: { pedidos: 2, total_comprado: 159.8, reservas_vencidas: 3, cancelamentos: 1 },
    msgs: [[12, 'entrada', 'cliente', 'A blusa veio com uma mancha que não aparecia na foto da live'],
           [7, 'entrada', 'cliente', 'vou mandar foto, ok?']] },
  // pedido 048: perfil que só atrapalha (para treinar o bloqueio) e dois já na lista de bloqueio
  { id: 'd12', nome: null, ig: 'promo_seguidores_br', tel: null, canal: 'instagram', estado: 'aberta', etapa: null, atendente: null,
    origem: { tipo: 'live', canal: 'live', peca: 'B07' }, etiquetas: [], ultimaEntradaMin: 2, vars: {}, hist: { pedidos: 0, total_comprado: 0, reservas_vencidas: 4, cancelamentos: 0 },
    msgs: [[9, 'entrada', 'cliente', 'QUERO B07'], [8, 'entrada', 'cliente', 'quero tbm a B08 B09 B10'], [2, 'entrada', 'cliente', 'GANHE 10 MIL SEGUIDORES 👉 link na bio']] },
  { id: 'd13', nome: 'Perfil Teste Fake', ig: 'reserva_e_some', tel: null, canal: 'instagram', estado: 'resolvida', etapa: null, atendente: null, bloqueado: true, tentativas: 4,
    origem: { tipo: 'live', canal: 'live', peca: 'C21' }, etiquetas: [], ultimaEntradaMin: 40, vars: {}, hist: { pedidos: 0, total_comprado: 0, reservas_vencidas: 6, cancelamentos: 2 },
    msgs: [[300, 'entrada', 'cliente', 'quero a C21'], [295, 'nota', 'atendente', 'Bloqueada: reservou 6 peças nas últimas lives e nunca pagou.'], [40, 'entrada', 'cliente', 'quero a C30 agora']] },
  { id: 'd14', nome: null, ig: null, tel: '+55 11 98888-0000', canal: 'whatsapp', estado: 'resolvida', etapa: null, atendente: null, bloqueado: true, tentativas: 3,
    origem: { tipo: 'direto', canal: 'whatsapp' }, etiquetas: [], ultimaEntradaMin: 90, vars: {}, hist: H0,
    msgs: [[600, 'entrada', 'cliente', 'vcs vendem roupa roubada?? vou denunciar'], [590, 'nota', 'atendente', 'Bloqueado: ofensas repetidas, não é cliente.'], [90, 'entrada', 'cliente', 'oi']] },
]

export type FonteDemoAtendimento = FonteAtendimento & { simularTentativa: () => string | null }

export function criarDemo(meuId: string | null, meuNome: string, aoEvento: (e: string) => void = () => {}): FonteDemoAtendimento {
  const nomeAtendente = (a: Semente['atendente']) => (a === 'eu' ? meuNome : a === 'william' ? 'William' : null)
  const idAtendente = (a: Semente['atendente']) => (a === 'eu' ? meuId ?? 'eu' : a === 'william' ? 'demo-william' : null)
  let seq = 1
  const estado = SEMENTES.map((s) => {
    const msgs: Mensagem[] = s.msgs.map(([m, dir, autor, texto, ent, rp]) => ({
      id: seq++, direcao: dir, autor_tipo: autor, autor_nome: dir === 'nota' || autor === 'atendente' ? nomeAtendente(s.atendente) ?? meuNome : null,
      tipo: 'texto', conteudo: texto, midia: [], estado_entrega: ent ?? (dir === 'entrada' ? 'recebida' : 'enviada'), erro: null,
      criado_em: min(m), resposta_pronta: rp ?? null,
    }))
    return { s, msgs, estado: s.estado, atendente: s.atendente, adiadaAte: s.adiadaAte ?? null, naoLidas: s.estado === 'resolvida' ? 0 : msgs.filter((x) => x.direcao === 'entrada').length > 0 && msgs[msgs.length - 1].direcao === 'entrada' ? 1 : 0, etiquetas: [...s.etiquetas], bloqueado: !!s.bloqueado, tentativas: s.tentativas ?? 0 }
  })
  let tentativasExtra = 0
  type Item = (typeof estado)[number]
  const nome = (s: Semente) => s.nome ?? (s.ig ? `@${s.ig}` : 'Cliente sem nome')
  const janela = (it: Item) => new Date(new Date(min(it.s.ultimaEntradaMin)).getTime() + 24 * 3600_000).toISOString()
  const ultima = (it: Item) => it.msgs[it.msgs.length - 1]
  const aguardando = (it: Item) => {
    const ent = [...it.msgs].reverse().find((m) => m.direcao === 'entrada'), sai = [...it.msgs].reverse().find((m) => m.direcao === 'saida')
    return !!ent && (!sai || ent.id > sai.id)
  }
  const etq = (n: string) => ({ id: `demo-${n}`, nome: n, cor: CORES[n] ?? '#b8975a' })
  const linha = (it: Item): ConversaLinha => ({
    id: it.s.id, cliente_id: `cli-${it.s.id}`, canal: it.s.canal, estado: it.estado,
    cliente_nome: nome(it.s), cliente_instagram: it.s.ig,
    atendente_id: idAtendente(it.atendente), atendente_nome: nomeAtendente(it.atendente), em_atendimento_por: it.s.vendoAgora ?? null,
    ultima_previa: (ultima(it).direcao === 'nota' ? it.msgs[it.msgs.length - 2] : ultima(it)).conteudo, ultima_mensagem_em: ultima(it).criado_em,
    ultima_entrada_em: min(it.s.ultimaEntradaMin), nao_lidas: it.naoLidas, janela_ate: janela(it), adiada_ate: it.adiadaAte,
    aguardando_resposta: aguardando(it), etapa_venda: it.s.etapa, etiquetas: it.etiquetas.map(etq), origem_entrada: it.s.origem,
  })
  const achar = (id: string) => { const it = estado.find((x) => x.s.id === id); if (!it) throw new Error('conversa não encontrada'); return it }
  const pausa = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120))

  const fonte: FonteDemoAtendimento = {
    ...apiAtendimento,
    // pessoa da lista de bloqueio tenta de novo: não entra na fila, só conta no indicador
    simularTentativa: () => {
      const it = estado.find((x) => x.bloqueado)
      if (!it) return null
      it.tentativas++; tentativasExtra++
      it.msgs.push({ id: seq++, direcao: 'entrada', autor_tipo: 'cliente', autor_nome: null, tipo: 'texto', conteudo: 'quero essa peça!! me manda o link', midia: [],
        estado_entrega: 'recebida', erro: null, criado_em: new Date().toISOString(), resposta_pronta: null })
      aoEvento('tentativa')
      return nome(it.s)
    },
    conversas: (_e, visao, est, canal, busca) => { if (visao === 'lista_bloqueio') aoEvento('visao_bloqueio'); return pausa(estado
      .filter((it) => visao === 'lista_bloqueio' ? it.bloqueado : !it.bloqueado && (est ? it.estado === est : it.estado !== 'resolvida'))
      .filter((it) => !canal || it.s.canal === canal)
      .filter((it) => visao === 'minhas' ? it.atendente === 'eu' : visao === 'nao_atribuidas' ? it.atendente === null : true)
      .filter((it) => !busca || (nome(it.s) + ' ' + (it.s.ig ?? '') + ' ' + it.msgs.map((m) => m.conteudo).join(' ')).toLowerCase().includes(busca.toLowerCase().replace('@', '')))
      .map((it) => ({ ...linha(it), lista_bloqueio: it.bloqueado, tentativas: it.bloqueado ? it.tentativas : null }))
      .sort((a, b) => (b.ultima_mensagem_em ?? '').localeCompare(a.ultima_mensagem_em ?? ''))) },
    resumo: () => pausa<Resumo>({
      abertas: estado.filter((x) => x.estado === 'aberta').length, pendentes: estado.filter((x) => x.estado === 'pendente').length,
      adiadas: estado.filter((x) => x.estado === 'adiada').length, minhas: estado.filter((x) => x.estado !== 'resolvida' && x.atendente === 'eu').length,
      nao_atribuidas: estado.filter((x) => x.estado !== 'resolvida' && x.atendente === null).length,
      nao_lidas: estado.filter((x) => x.estado !== 'resolvida').reduce((a, x) => a + x.naoLidas, 0),
      lista_bloqueio: estado.filter((x) => x.bloqueado).length,
      tentativas_bloqueadas: { hoje: 1 + tentativasExtra, d7: 3 + tentativasExtra, d30: 7 + tentativasExtra, pessoas_d30: estado.filter((x) => x.bloqueado).length,
        por_origem: { live: 4, vitrine: 2, mensagem: 1 + tentativasExtra } },
    }),
    canais: () => pausa<Canais>({
      mes_inicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(), franquia_whatsapp: 1000, whatsapp_enviadas_mes: 612,
      por_canal: {
        instagram: { abertas: estado.filter((x) => x.s.canal === 'instagram' && x.estado !== 'resolvida').length, entradas_30d: 1384 },
        whatsapp: { abertas: estado.filter((x) => x.s.canal === 'whatsapp' && x.estado !== 'resolvida').length, entradas_30d: 917 },
      },
    }),
    conversa: (_e, id, marcar) => {
      const it = achar(id)
      if (marcar) { it.naoLidas = 0; aoEvento('abriu') }
      const l = linha(it)
      const d: DetalheConversa = {
        conversa: { id: it.s.id, canal: it.s.canal, estado: it.estado, lista_bloqueio: it.bloqueado, atendente_id: l.atendente_id, atendente_nome: l.atendente_nome,
          em_atendimento_por: it.s.vendoAgora ?? null, janela_ate: l.janela_ate,
          janela_humana_ate: it.s.canal === 'instagram' ? new Date(new Date(min(it.s.ultimaEntradaMin)).getTime() + 7 * 86400_000).toISOString() : null,
          adiada_ate: it.adiadaAte, janela_aberta: new Date(l.janela_ate!).getTime() > Date.now(), criado_em: it.msgs[0].criado_em },
        cliente: { id: `cli-${it.s.id}`, nome: it.s.nome, instagram: it.s.ig, telefone: it.s.tel, email: null, observacao: null,
          canais: [...(it.s.ig ? [{ canal: 'instagram', identificador: it.s.ig }] : []), ...(it.s.tel ? [{ canal: 'whatsapp', identificador: it.s.tel }] : [])] },
        etapa_venda: it.s.etapa, origem_entrada: it.s.origem,
        variaveis: { 'cliente.nome': nome(it.s), 'cliente.primeiro_nome': it.s.nome ? it.s.nome.split(' ')[0] : nome(it.s), ...(it.s.ig ? { 'cliente.instagram': `@${it.s.ig}` } : {}),
          'atendente.nome': meuNome, 'atendente.primeiro_nome': meuNome.split(' ')[0], 'empresa.nome': 'Ane Brechó', ...it.s.vars },
        historico: it.s.hist, etiquetas: it.etiquetas.map(etq), mensagens: [...it.msgs],
      }
      return pausa(d)
    },
    previa: async (_e, id, texto) => ({ ...renderizarLocal(texto, (await fonte.conversa('', id, false)).variaveis), desconhecidas: [] }),
    enviar: async (_e, id, texto, _rp, nota) => {
      const it = achar(id)
      const d = await fonte.conversa('', id, false)
      const r = renderizarLocal(texto, d.variaveis)
      if (!nota && it.bloqueado) throw new Error('contato na lista de bloqueio: só nota interna. Desbloqueie para responder.')
      if (!nota && r.faltantes.length) throw new Error(`variáveis sem valor para esta cliente: ${r.faltantes.join(', ')}`)
      if (!nota && !d.conversa.janela_aberta && !(d.conversa.janela_humana_ate && new Date(d.conversa.janela_humana_ate).getTime() > Date.now()))
        throw new Error('janela de resposta fechada: a cliente precisa escrever de novo' + (it.s.canal === 'whatsapp' ? ' (ou use um modelo aprovado)' : ''))
      const m: Mensagem = { id: seq++, direcao: nota ? 'nota' : 'saida', autor_tipo: 'atendente', autor_nome: meuNome, tipo: 'texto', conteudo: r.texto,
        midia: [], estado_entrega: nota ? 'recebida' : 'simulada', erro: null, criado_em: new Date().toISOString(), resposta_pronta: null }
      it.msgs.push(m)
      if (!it.atendente) it.atendente = 'eu'
      aoEvento(nota ? 'nota' : 'respondeu')
      return pausa({ mensagem_id: m.id, estado_entrega: nota ? 'nota' as const : 'simulada' as const, erro: null, texto: r.texto })
    },
    acao: (_e, id, acao, valor) => {
      const it = achar(id)
      if (acao === 'assumir') { it.atendente = 'eu'; aoEvento('assumiu') }
      else if (acao === 'bloquear') {
        if (!valor || valor.trim().length < 3) throw new Error('informe o motivo do bloqueio')
        it.bloqueado = true; it.estado = 'resolvida'; it.naoLidas = 0; aoEvento('bloqueou')
      }
      else if (acao === 'desbloquear') { it.bloqueado = false; aoEvento('desbloqueou') }
      else if (acao === 'estado' && valor) { it.estado = valor as EstadoConversa; it.adiadaAte = null; if (valor === 'resolvida') aoEvento('resolveu') }
      else if (acao === 'adiar' && valor) { it.estado = 'adiada'; it.adiadaAte = valor; aoEvento('resolveu') }
      else if (acao === 'etiqueta_add' && valor) { aoEvento('etiqueta'); const n = valor.replace(/^demo-/, ''); if (!it.etiquetas.includes(n)) it.etiquetas.push(n) }
      else if (acao === 'etiqueta_rem' && valor) it.etiquetas = it.etiquetas.filter((n) => `demo-${n}` !== valor)
      return pausa({ ok: true })
    },
    abrir: () => pausa({ conversa_id: 'd1' }),
    biblioteca: async (e, inativas) => {
      const b = await apiAtendimento.biblioteca(e, inativas)
      return { ...b, etiquetas: Object.keys(CORES).map(etq) }
    },
  }
  return fonte
}
