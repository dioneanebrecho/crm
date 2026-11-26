import { rpc } from './api'

// Agenda de compromissos (pedido 045, migration 0088): lives, follow-up, pós-venda, lembretes e tarefas.
export type TipoCompromisso = 'live' | 'follow_up' | 'pos_venda' | 'lembrete' | 'tarefa'
export type EstadoCompromisso = 'pendente' | 'aguardando_cliente' | 'resolvido' | 'encerrado' | 'cancelado'
export type Prioridade = 'baixa' | 'normal' | 'alta'

export interface Compromisso {
  id: string; tipo: TipoCompromisso; tipo_nome: string; cor: string; exige_interacao_cliente: boolean
  titulo: string; descricao: string | null; inicio_em: string; fim_em: string | null; dia_inteiro: boolean
  prioridade: Prioridade; estado: EstadoCompromisso; atrasado: boolean
  responsavel_id: string; responsavel_nome: string | null; criado_por_nome: string | null
  cliente_id: string | null; cliente_nome: string | null
  pedido_id: string | null; devolucao_id: string | null; conversa_id: string | null; live_id: string | null
  desfecho: string | null; motivo_encerramento: string | null; concluido_em: string | null
  origem_regra: string | null; lembrete_min: number[] | null; qtd_tentativas: number; teve_resposta: boolean
}
export interface MinhaFila { atrasados: Compromisso[]; hoje: Compromisso[]; aguardando_cliente: Compromisso[]; proximos: Compromisso[] }
export interface Interacao { id: string; tipo: 'tentativa' | 'resposta_cliente' | 'nota'; canal: string | null; texto: string | null; registrado_por: string | null; registrado_em: string }
export interface Responsavel { id: string; nome: string; tem_email: boolean }
export interface ConfigAgenda {
  enviar_convite: boolean; lembrete_padrao_min: number[]; duracao_padrao_min: number
  nome_cliente_no_convite: boolean; max_tentativas_sem_resposta: number; url_painel: string
}
export interface DadosCompromisso {
  id?: string; tipo: TipoCompromisso; titulo: string; descricao?: string | null
  inicio_em: string; fim_em?: string | null; dia_inteiro: boolean; prioridade: Prioridade
  responsavel_id: string; cliente_id?: string | null; pedido_id?: string | null; devolucao_id?: string | null
  conversa_id?: string | null; live_id?: string | null; lembrete_min?: number[] | null
}

export const ESTADO_COMPROMISSO: Record<EstadoCompromisso, string> = {
  pendente: 'Pendente', aguardando_cliente: 'Aguardando cliente', resolvido: 'Resolvido', encerrado: 'Encerrado', cancelado: 'Cancelado',
}
export const TIPOS: { codigo: TipoCompromisso; nome: string }[] = [
  { codigo: 'live', nome: 'Live' }, { codigo: 'follow_up', nome: 'Follow-up' }, { codigo: 'pos_venda', nome: 'Pós-venda' },
  { codigo: 'lembrete', nome: 'Lembrete' }, { codigo: 'tarefa', nome: 'Tarefa' },
]
export const CANAIS = [
  { valor: 'whatsapp', rotulo: 'WhatsApp' }, { valor: 'instagram', rotulo: 'Instagram' }, { valor: 'telefone', rotulo: 'Telefone' },
  { valor: 'email', rotulo: 'E-mail' }, { valor: 'loja', rotulo: 'Na loja' }, { valor: 'outro', rotulo: 'Outro' },
]
export const MOTIVOS_ENCERRAR = [
  { valor: 'sem_resposta', rotulo: 'Cliente não respondeu' },
  { valor: 'cliente_desistiu', rotulo: 'Cliente desistiu' },
  { valor: 'resolvido_por_outro_canal', rotulo: 'Resolvido por outro canal' },
  { valor: 'outro', rotulo: 'Outro motivo' },
]

// Link do convite de calendário: crm.evoconecta.io/#agenda?c=<id>. Lido na carga do app, antes de o menu reescrever o hash.
export const compromissoDoLink: string | undefined = (location.hash.match(/[?&]c=([0-9a-f-]{36})/i) ?? [])[1]

export const apiAgenda = {
  listar: (empresa: string, de: Date, ate: Date, responsavel?: string | null, tipos?: TipoCompromisso[] | null) =>
    rpc<Compromisso[]>('agenda_listar', {
      p_empresa: empresa, p_de: de.toISOString(), p_ate: ate.toISOString(),
      p_responsavel: responsavel ?? null, p_tipos: tipos && tipos.length ? tipos : null,
    }),
  obter: (empresa: string, id: string) => rpc<Compromisso>('agenda_obter', { p_empresa: empresa, p_compromisso: id }),
  minhaFila: (empresa: string) => rpc<MinhaFila>('agenda_minha_fila', { p_empresa: empresa }),
  responsaveis: (empresa: string) => rpc<Responsavel[]>('agenda_responsaveis', { p_empresa: empresa }),
  salvar: (empresa: string, dados: DadosCompromisso) => rpc<string>('agenda_salvar', { p_empresa: empresa, p_dados: dados }).then((id) => { avisarMudanca(); return id }),
  /** Remarca mantendo a hora (arrastar no calendário). Só envia o término quando o compromisso tem término. */
  mover: (empresa: string, c: Compromisso, inicio: Date, fim: Date | null) =>
    rpc<string>('agenda_salvar', { p_empresa: empresa, p_dados: { id: c.id, inicio_em: inicio.toISOString(), ...(c.fim_em ? { fim_em: fim?.toISOString() ?? null } : {}) } })
      .then((id) => { avisarMudanca(); return id }),
  interacoes: (empresa: string, id: string) => rpc<Interacao[]>('agenda_interacoes', { p_empresa: empresa, p_compromisso: id }),
  registrar: (empresa: string, id: string, tipo: Interacao['tipo'], canal: string | null, texto: string | null) =>
    rpc<string>('agenda_registrar_interacao', { p_empresa: empresa, p_compromisso: id, p_tipo: tipo, p_canal: canal, p_texto: texto }).then((r) => { avisarMudanca(); return r }),
  concluir: (empresa: string, id: string, estado: 'resolvido' | 'encerrado' | 'cancelado', desfecho: string | null, motivo: string | null) =>
    rpc<void>('agenda_concluir', { p_empresa: empresa, p_compromisso: id, p_estado: estado, p_desfecho: desfecho, p_motivo: motivo }).then(avisarMudanca),
  reabrir: (empresa: string, id: string, motivo: string) =>
    rpc<void>('agenda_reabrir', { p_empresa: empresa, p_compromisso: id, p_motivo: motivo }).then(avisarMudanca),
  config: (empresa: string) => rpc<ConfigAgenda | null>('agenda_obter_config', { p_empresa: empresa }),
  salvarConfig: (empresa: string, dados: Partial<ConfigAgenda>) => rpc<void>('agenda_salvar_config', { p_empresa: empresa, p_dados: dados }),
}

/** Hora local HH:MM de um ISO. */
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
/** Data local curta (dd/mm, com dia da semana). */
export const diaCurto = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })

// ---------------------------------------------------------------------------- situação visual
/** Minutos antes do início em que o compromisso passa a "começa em breve" (pisca no calendário e na fila). */
export const MIN_EM_BREVE = 30
export type Situacao = 'atrasado' | 'em_breve' | 'aguardando' | 'concluido' | 'normal'
const fimDoDia = (iso: string) => { const d = new Date(iso); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() }
/** Calculada no navegador para acompanhar o relógio (a do banco só muda quando a lista recarrega). */
export function situacao(c: Compromisso, agora = Date.now()): Situacao {
  if (c.estado === 'resolvido' || c.estado === 'encerrado' || c.estado === 'cancelado') return 'concluido'
  const ini = new Date(c.inicio_em).getTime()
  const fim = c.dia_inteiro ? fimDoDia(c.inicio_em) : new Date(c.fim_em ?? c.inicio_em).getTime()
  if (fim < agora) return 'atrasado'
  if (!c.dia_inteiro && ini - agora <= MIN_EM_BREVE * 60000) return 'em_breve'   // inclui o que já começou e ainda não terminou
  if (c.estado === 'aguardando_cliente') return 'aguardando'
  return 'normal'
}
export const ROTULO_SITUACAO: Record<Situacao, string> = {
  atrasado: 'Atrasado', em_breve: 'Começa em breve', aguardando: 'Aguardando resposta da cliente', concluido: 'Concluído', normal: 'Pendente',
}

/** Quanto falta (ou passou) até o início, em texto curto: "em 10 min", "agora", "há 2 h". */
export function relativo(iso: string, agora = Date.now()): string {
  const min = Math.round((new Date(iso).getTime() - agora) / 60000)
  const fmt = (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dia(s)`)
  if (Math.abs(min) < 1) return 'agora'
  return min > 0 ? `em ${fmt(min)}` : `há ${fmt(-min)}`
}

// ---------------------------------------------------------------------------- aviso entre telas
// Qualquer gravação na agenda avisa os ouvintes (lembretes globais e telas abertas) para recarregar na hora.
const EVENTO = 'ane:agenda-mudou'
export const avisarMudanca = () => { window.dispatchEvent(new Event(EVENTO)) }
export const ouvirMudanca = (fn: () => void) => { window.addEventListener(EVENTO, fn); return () => window.removeEventListener(EVENTO, fn) }
