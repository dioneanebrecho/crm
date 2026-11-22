import { rpc } from './api'

// Central de vendas e Preferências da vitrine (migration 0034). O painel só chama funções api.*.
export type Canal = 'ig_feed' | 'ig_story' | 'ig_reels' | 'live' | 'whatsapp' | 'link' | 'loja' | 'outro'
export const CANAIS: Record<string, { rotulo: string; curto: string; cor: string }> = {
  ig_feed: { rotulo: 'Instagram feed', curto: 'Feed', cor: '#8A2E7C' },
  ig_story: { rotulo: 'Instagram Story', curto: 'Story', cor: '#9A4A08' },
  ig_reels: { rotulo: 'Instagram Reels', curto: 'Reels', cor: '#6B3FA0' },
  live: { rotulo: 'Live', curto: 'Live', cor: '#A3241C' },
  whatsapp: { rotulo: 'WhatsApp', curto: 'WA', cor: '#1E6B45' },
  link: { rotulo: 'Link direto', curto: 'Link', cor: '#55524C' },
  loja: { rotulo: 'Loja física', curto: 'Loja', cor: '#55524C' },
  outro: { rotulo: 'Outro', curto: 'Outro', cor: '#55524C' },
  sistema: { rotulo: 'Sistema', curto: 'Sistema', cor: '#4A5568' },
}
export const CANAIS_PUBLICAVEIS: Canal[] = ['ig_feed', 'ig_story', 'ig_reels', 'live', 'whatsapp', 'link']

export interface ReservaResumo {
  reserva_id: string; cliente_id: string; cliente: string; instagram: string | null; canal: Canal | null
  expira_em: string; etapa: 'aguardando_dados' | 'dados_confirmados' | 'pix_gerado'
}
export interface OfertaLinha {
  item_id: string; link_id: string | null; codigo_curto: string | null; peca_id: string; nome: string; codigo: string
  categoria: string | null; tamanho: string; preco: number; item_estado: string; codigo_live: string; foto: string | null
  situacao: 'disponivel' | 'reservada' | 'vendida' | 'encerrada'; fila: number; reserva: ReservaResumo | null
  canais_ativos: Canal[]; visitas: number; interessadas: number
}
export interface ListaOfertas {
  total: number; linhas: OfertaLinha[]
  contagem: { todas: number; disponivel: number; reservada: number; com_fila: number; vendida: number }
}
export interface CanalOferta {
  canal: Canal; rotulo: string; estado: 'ativa' | 'encerrada' | 'nao_publicado'; publicada_em: string | null
  url_post: string | null; visitas: number; interessadas: number
}
export interface DetalheOferta {
  peca: { item_id: string; variacao_id: string; peca_id: string; nome: string; codigo: string; tamanho: string; preco: number
          categoria: string | null; marca: string | null; condicao: string | null; foto_capa: string | null; codigo_live: string }
  status: { situacao: OfertaLinha['situacao']; fila: number }
  link: { id: string | null; codigo: string | null; url_base: string | null }
  canais: CanalOferta[]
  reserva: { id: string; cliente_id: string; cliente: string | null; instagram: string | null; canal: Canal | null; expira_em: string
             criada_em: string; promovida_da_fila: boolean; carencia_aplicada: boolean } | null
  venda: { cliente_id: string; cliente: string | null; canal: Canal | null; em: string; avisadas: number } | null
  fila: { posicao: number; fila_id: number; cliente_id: string; cliente: string | null; instagram: string | null; canal: Canal | null; entrou_em: string }[]
  historico: { em: string; canal: string; tipo: string; texto: string }[]
}
export interface ClienteVendasLinha {
  id: string; nome: string | null; instagram_username: string | null; telefone: string | null; origem: Canal | null; ultima: string
  reserva: { reserva_id: string; item_id: string; expira_em: string; pix: boolean } | null
  n_reservas: number; n_fila: number; n_pagas: number; n_perdas: number; n_expiradas_90d: number
  etapa: 'reservada' | 'paga' | 'fila' | 'perdeu' | 'interesse'; apoio: string[]
}
export interface ListaClientes {
  contagem: { todos: number; apoio: number; reservada: number; fila: number; paga: number; perdeu: number }
  funil: { interessadas: number; fila: number; reservadas: number; pix: number; pagas: number }
  linhas: ClienteVendasLinha[]
}
export interface DetalheCliente {
  cliente: { id: string; nome: string | null; instagram: string | null; telefone: string | null; bloqueado_ate: string | null; tem_igsid: boolean }
  canais: { canal: string; identificador: string }[]
  consentimentos: { finalidade: string; em: string }[]
  resumo: { pedidos: number; total_itens: number; reservas_expiradas: number; cancelamentos: number; devolucoes: number } | null
  intencoes: { interesse_id: number; canal: Canal | null; em: string; peca: DetalheOferta['peca']; reserva_id: string | null
               situacao: string; posicao: number | null; expira_em: string | null }[]
}
export interface PrefVitrine {
  tema: 'claro' | 'escuro' | 'auto'; animacao: 'nenhuma' | 'suave' | 'medio' | 'forte'; etiqueta_codigo: boolean; etiqueta_preco: boolean
  ordem_midias: string[]; video_auto: boolean; prazo_reserva_min: number; carencia_pix_min: number
  fila_visibilidade: 'posicao' | 'total' | 'nomes'; limite_reservas: number; regra_horario: 'normal' | 'manha'
  avisar_fila: boolean; qtd_parecidas: number; aviseme: boolean; url_base: string | null
  atualizado_em?: string; atualizado_por?: string | null
}
export interface Preferencias {
  valores: PrefVitrine; recomendados: Omit<PrefVitrine, 'url_base'>; pode_editar: boolean
  historico: { em: string; usuario: string; alteracoes: Record<string, { antes: unknown; depois: unknown }> }[]
}

export const apiVendas = {
  ofertas: (empresa: string, filtro: string, busca: string) =>
    rpc<ListaOfertas>('listar_ofertas', { p_empresa: empresa, p_filtro: filtro, p_busca: busca || null, p_limite: 300, p_offset: 0 }),
  oferta: (empresa: string, item: string) => rpc<DetalheOferta>('detalhe_oferta', { p_empresa: empresa, p_item: item }),
  publicar: (empresa: string, variacao: string, canais: Canal[], preco: number | null) =>
    rpc<{ item_id: string; link_id: string; codigo: string }>('publicar_oferta', { p_empresa: empresa, p_variacao: variacao, p_canais: canais, p_preco: preco }),
  mudarPublicacao: (empresa: string, link: string, canal: Canal, ativar: boolean, urlPost?: string) =>
    rpc<void>('mudar_publicacao', { p_empresa: empresa, p_link: link, p_canal: canal, p_ativar: ativar, p_url_post: urlPost || null }),
  estender: (empresa: string, reserva: string, minutos: number, motivo: string) =>
    rpc<string>('estender_reserva', { p_empresa: empresa, p_reserva: reserva, p_minutos: minutos, p_motivo: motivo }),
  passarVez: (empresa: string, reserva: string, motivo: string) =>
    rpc<string | null>('passar_vez', { p_empresa: empresa, p_reserva: reserva, p_motivo: motivo }),
  clientes: (empresa: string, filtro: string, busca: string) =>
    rpc<ListaClientes>('listar_clientes_vendas', { p_empresa: empresa, p_filtro: filtro, p_busca: busca || null, p_limite: 300 }),
  cliente: (empresa: string, cliente: string) => rpc<DetalheCliente>('detalhe_cliente_vendas', { p_empresa: empresa, p_cliente: cliente }),
  preferencias: (empresa: string) => rpc<Preferencias>('obter_preferencias_vitrine', { p_empresa: empresa }),
  salvarPreferencias: (empresa: string, valores: Partial<PrefVitrine>) =>
    rpc<Preferencias>('salvar_preferencias_vitrine', { p_empresa: empresa, p_valores: valores }),
}

// Endereço público da peça: url_base das Preferências; sem ela, VITE_URL_PUBLICA_PECA; sem as duas, /p/ deste painel.
const BASE_ENV = (import.meta.env.VITE_URL_PUBLICA_PECA as string | undefined)?.replace(/\/+$/, '')
export function urlPublica(codigo: string, canal?: Canal, urlBase?: string | null): string {
  const base = (urlBase?.replace(/\/+$/, '')) || BASE_ENV || `${location.origin}/p`
  return `${base}/${codigo}${canal ? `?c=${canal}` : ''}`
}

export const restante = (iso: string, agora: number) => Math.max(0, Math.floor((new Date(iso).getTime() - agora) / 1000))
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
export const brl = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const hora = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
export const curto = (nome: string | null | undefined, ig?: string | null) => {
  if (!nome) return ig ? `@${ig}` : 'Cliente'
  const p = nome.trim().split(/\s+/)
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0]
}

// ===== Conteúdo da oferta ("Montar oferta", migration 0035) =====
export interface Midia { tipo: 'foto' | 'video'; url: string; path: string; rotulo: 'frente' | 'costas' | 'tecido' | 'video' | 'outra'; capa: boolean }
export interface ConteudoOferta {
  titulo: string | null; texto: string | null; usar_html: boolean; html: string | null; midias: Midia[]; legendas: Record<string, string>
  estado: 'rascunho' | 'aprovado'; versao: number; aprovado_em: string | null; atualizado_em: string; tem_aprovado: boolean
}
export interface ModeloLegenda { id: string; nome: string; canal: string | null; texto: string; ativo?: boolean }
export interface DadosConteudo {
  conteudo: ConteudoOferta | null
  sugestao: { titulo: string; texto: string; midias: Midia[] }
  fotos_peca: { url: string; path: string }[]
  variaveis: { nome: string; codigo: string; tamanho: string; preco: number; descricao: string; prazo: number; marca: string | null
               condicao: string | null; medidas: Record<string, string | number> }
  link: { id: string | null; codigo: string | null; url_base: string | null }
  peca_id: string; ordem_midias: string[]; video_auto: boolean
  modelos: ModeloLegenda[]
  publicacoes: Record<string, { estado: string; url_post: string | null; publicada_em: string }>
  pode_aprovar: boolean
}
export const apiConteudo = {
  obter: (empresa: string, item: string) => rpc<DadosConteudo>('obter_conteudo_oferta', { p_empresa: empresa, p_item: item }),
  salvar: (empresa: string, item: string, dados: Record<string, unknown>, aprovar: boolean) =>
    rpc<DadosConteudo>('salvar_conteudo_oferta', { p_empresa: empresa, p_item: item, p_dados: dados, p_aprovar: aprovar }),
  modelos: (empresa: string) => rpc<ModeloLegenda[]>('listar_modelos_legenda', { p_empresa: empresa }),
  salvarModelo: (empresa: string, m: { id?: string; nome: string; canal: string | null; texto: string; ativo: boolean }) =>
    rpc<string>('salvar_modelo_legenda', { p_empresa: empresa, p_id: m.id ?? null, p_nome: m.nome, p_canal: m.canal, p_texto: m.texto, p_ativo: m.ativo }),
}
