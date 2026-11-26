import { rpc } from './api'

// Caixa de entrada (migration 0087). O painel só chama funções api.atendimento_*.
export type CanalConversa = 'instagram' | 'whatsapp' | 'facebook' | 'email'
export type EstadoConversa = 'aberta' | 'pendente' | 'adiada' | 'resolvida'
export type EtapaVenda = 'pix_gerado' | 'reservada' | 'na_fila' | 'paga' | 'enviada' | 'entregue' | null
export type EstadoEntrega = 'recebida' | 'simulada' | 'bloqueada' | 'pendente' | 'enviada' | 'entregue' | 'lida' | 'erro'

export const CANAL_CONVERSA: Record<CanalConversa, { rotulo: string; curto: string; cor: string }> = {
  instagram: { rotulo: 'Instagram Direct', curto: 'IG', cor: '#8A2E7C' },
  whatsapp: { rotulo: 'WhatsApp', curto: 'WA', cor: '#1E6B45' },
  facebook: { rotulo: 'Messenger', curto: 'FB', cor: '#2D5BA8' },
  email: { rotulo: 'E-mail', curto: 'E-mail', cor: '#55524C' },
}
export const ETAPA_VENDA: Record<string, string> = {
  na_fila: 'Na fila', reservada: 'Reservada', pix_gerado: 'Pix gerado', paga: 'Paga', enviada: 'Enviada', entregue: 'Entregue',
}
// Ordem do funil (visão estilo Kommo, derivada do motor de venda)
export const FUNIL: { id: Exclude<EtapaVenda, null>; rotulo: string }[] = [
  { id: 'na_fila', rotulo: 'Fila' }, { id: 'reservada', rotulo: 'Reserva' }, { id: 'pix_gerado', rotulo: 'Pix' },
  { id: 'paga', rotulo: 'Paga' }, { id: 'enviada', rotulo: 'Enviada' }, { id: 'entregue', rotulo: 'Entregue' },
]
export const ENTREGA: Record<EstadoEntrega, string> = {
  recebida: '', simulada: 'Simulada (não saiu)', bloqueada: 'Não enviada', pendente: 'Enviando…', enviada: 'Enviada',
  entregue: 'Entregue', lida: 'Lida', erro: 'Falhou',
}
export const MOTIVO_BLOQUEIO: Record<string, string> = {
  integracao_desligada: 'o canal está desligado em Integrações',
  fora_da_allowlist: 'o canal está em teste e esta cliente não está na lista de destinatários liberados',
  sem_identificador_no_canal: 'a cliente não tem identificador neste canal',
  politica_de_envio: 'a política de envio exige aprovação ou o limite por hora foi atingido',
}

export interface Etiqueta { id: string; nome: string; cor: string }
// De onde a conversa veio (0093): comentário na live, clique na vitrine, link "Quero A123" ou mensagem direta
export interface OrigemEntrada { tipo: 'live' | 'vitrine' | 'link_quero' | 'direto'; canal: string; peca?: string | null }
export const ORIGEM: Record<OrigemEntrada['tipo'], { rotulo: string; cor: string; dica: string }> = {
  live: { rotulo: 'Live', cor: '#A3241C', dica: 'Comentou na live e recebeu o link da peça' },
  vitrine: { rotulo: 'Vitrine', cor: '#9A4A08', dica: 'Tocou em "Quero" no link da peça (story, feed, grupo ou bio)' },
  link_quero: { rotulo: 'Link "Quero"', cor: '#6B3FA0', dica: 'Tocou no link com a mensagem pronta "Quero ..." (ex.: postagem no grupo)' },
  direto: { rotulo: 'Mensagem direta', cor: '#55524C', dica: 'Escreveu por conta própria, sem link de peça' },
}
export const CANAL_INTERESSE: Record<string, string> = {
  ig_feed: 'feed', ig_story: 'story', ig_reels: 'reels', live: 'live', whatsapp: 'grupo/WhatsApp', link: 'link direto', loja: 'loja', outro: 'outro',
}
export interface Canais {
  mes_inicio: string; franquia_whatsapp: number; whatsapp_enviadas_mes: number
  por_canal: Record<string, { abertas: number; entradas_30d: number }>
}
export interface ConversaLinha {
  id: string; cliente_id: string; canal: CanalConversa; estado: EstadoConversa
  cliente_nome: string; cliente_instagram: string | null
  atendente_id: string | null; atendente_nome: string | null; em_atendimento_por: string | null
  ultima_previa: string | null; ultima_mensagem_em: string | null; ultima_entrada_em: string | null
  nao_lidas: number; janela_ate: string | null; adiada_ate: string | null; aguardando_resposta: boolean
  etapa_venda: EtapaVenda; etiquetas: Etiqueta[]; origem_entrada?: OrigemEntrada | null
  lista_bloqueio?: boolean; tentativas?: number | null   // pedido 048
}
export interface Resumo {
  abertas: number; pendentes: number; adiadas: number; minhas: number; nao_atribuidas: number; nao_lidas: number
  // pedido 048: quem está na lista de bloqueio fica fora das filas; as tentativas são medidas
  lista_bloqueio?: number; tentativas_bloqueadas?: { hoje: number; d7: number; d30: number; pessoas_d30: number; por_origem: Record<string, number> }
}
export interface Mensagem {
  id: number; direcao: 'entrada' | 'saida' | 'nota'; autor_tipo: 'cliente' | 'atendente' | 'sistema' | 'automacao' | 'app_nativo'
  autor_nome: string | null; tipo: string; conteudo: string | null; midia: { type?: string; payload?: { url?: string } }[]
  estado_entrega: EstadoEntrega; erro: { motivo?: string; status?: number; detalhe?: string } | null; criado_em: string
  resposta_pronta: string | null
}
export interface DetalheConversa {
  conversa: { id: string; canal: CanalConversa; estado: EstadoConversa; atendente_id: string | null; atendente_nome: string | null
              em_atendimento_por: string | null; janela_ate: string | null; janela_humana_ate: string | null; adiada_ate: string | null
              janela_aberta: boolean; criado_em: string; lista_bloqueio?: boolean }
  cliente: { id: string; nome: string | null; instagram: string | null; telefone: string | null; email: string | null
             observacao: string | null; canais: { canal: string; identificador: string }[] }
  etapa_venda: EtapaVenda
  origem_entrada?: OrigemEntrada | null
  variaveis: Record<string, string>
  historico: { pedidos: number; total_comprado: number; reservas_vencidas: number; cancelamentos: number }
  etiquetas: Etiqueta[]
  mensagens: Mensagem[]
}
export interface Variavel { chave: string; grupo: string; rotulo: string; descricao: string; exemplo: string }
export type Categoria = 'saudacao' | 'venda' | 'pagamento' | 'envio' | 'pos_venda' | 'geral'
export const CATEGORIAS: Record<Categoria, string> = {
  saudacao: 'Saudação', venda: 'Venda e reserva', pagamento: 'Pagamento', envio: 'Envio e rastreio', pos_venda: 'Pós-venda', geral: 'Geral',
}
export interface RespostaPronta {
  id: string; atalho: string; titulo: string; categoria: Categoria; corpo: string; canais: CanalConversa[] | null
  ativo: boolean; versao: number; usos: number; ultimo_uso_em: string | null; atualizado_em: string
}
export interface Biblioteca { respostas: RespostaPronta[]; variaveis: Variavel[]; etiquetas: Etiqueta[]; pode_editar: boolean }
export interface Previa { texto: string; faltantes: string[]; desconhecidas: string[] }
export interface ResultadoEnvio {
  mensagem_id: number; estado_entrega: EstadoEntrega | 'nota'; erro: { motivo?: string } | null; texto?: string; human_agent?: boolean
}

export const apiAtendimento = {
  conversas: (empresa: string, visao: string, estado: string | null, canal: string | null, busca: string) =>
    rpc<ConversaLinha[]>('atendimento_conversas', { p_empresa: empresa, p_visao: visao, p_estado: estado, p_canal: canal, p_busca: busca || null, p_limite: 200 }),
  resumo: (empresa: string) => rpc<Resumo>('atendimento_resumo', { p_empresa: empresa }),
  conversa: (empresa: string, conversa: string, marcarLida = true) =>
    rpc<DetalheConversa>('atendimento_conversa', { p_empresa: empresa, p_conversa: conversa, p_marcar_lida: marcarLida }),
  previa: (empresa: string, conversa: string, texto: string) =>
    rpc<Previa>('atendimento_previa', { p_empresa: empresa, p_conversa: conversa, p_texto: texto }),
  enviar: (empresa: string, conversa: string, texto: string, respostaPronta: string | null, nota = false) =>
    rpc<ResultadoEnvio>('atendimento_enviar', { p_empresa: empresa, p_conversa: conversa, p_texto: texto, p_resposta_pronta: respostaPronta, p_nota: nota }),
  acao: (empresa: string, conversa: string, acao: string, valor: string | null = null) =>
    rpc<{ ok: boolean }>('atendimento_acao', { p_empresa: empresa, p_conversa: conversa, p_acao: acao, p_valor: valor }),
  abrir: (empresa: string, cliente: string, canal: CanalConversa = 'instagram') =>
    rpc<{ conversa_id: string }>('atendimento_abrir', { p_empresa: empresa, p_cliente: cliente, p_canal: canal }),
  biblioteca: (empresa: string, inativas = false) =>
    rpc<Biblioteca>('atendimento_respostas', { p_empresa: empresa, p_incluir_inativas: inativas }),
  salvarResposta: (empresa: string, dados: Partial<RespostaPronta>) =>
    rpc<{ id: string }>('atendimento_resposta_salvar', { p_empresa: empresa, p_dados: dados }),
  canais: (empresa: string) => rpc<Canais>('atendimento_canais', { p_empresa: empresa }),
  salvarEtiqueta: (empresa: string, nome: string, cor?: string) =>
    rpc<{ id: string }>('atendimento_etiqueta_salvar', { p_empresa: empresa, p_nome: nome, p_cor: cor ?? null }),
}

/** Fonte de dados da Caixa de entrada: o banco (apiAtendimento) ou o modo de exemplo (atendimentoDemo). */
export type FonteAtendimento = typeof apiAtendimento

/** Prévia local (sem ir ao banco): troca {{chave}} pelo valor; o que faltar fica marcado. */
export function renderizarLocal(texto: string, valores: Record<string, string>) {
  const faltantes = new Set<string>()
  const saida = texto.replace(/\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g, (_m, k: string) => {
    const v = valores[k]
    if (v) return v
    faltantes.add(k); return `{{${k}}}`
  })
  return { texto: saida, faltantes: [...faltantes] }
}
export const variaveisDoTexto = (texto: string) => [...new Set([...texto.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]))]
