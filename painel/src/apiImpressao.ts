import { rpc } from './api'

export interface ConfigCodigoCurto { maximo: number; ultimo_numero: number; quarentena_min: number; em_uso: number; em_quarentena: number; livres: number }
export interface EtiquetaLinha {
  etiqueta_id: string; unidade_id: string; unidade_codigo: string; numero_curto: number | null
  estado: 'pendente' | 'impressa' | 'desatualizada' | 'encerrada'; qtd_impressoes: number
  peca_nome: string; tamanho: string | null; preco: number | null
  primeira_impressao_em: string | null; primeira_impressao_por: string | null
  ultima_impressao_em: string | null; ultima_impressao_por: string | null
}
export interface JaImpressa {
  unidade_id: string; unidade_codigo: string; numero_curto: number | null; qtd_impressoes: number; em_andamento: boolean
  primeira_impressao_em: string | null; primeira_impressao_por: string | null; ultima_impressao_em: string | null; ultima_impressao_por: string | null
}
export type ResultadoSolicitacao =
  | { ok: true; lote_id: string; enfileiradas: number; reimpressoes: number }
  | { ok: false; requer_confirmacao: true; ja_impressas: JaImpressa[] }
export interface HistoricoImpressao {
  numero_impressao: number; eh_reimpressao: boolean; motivo: string | null; numero_curto: number | null; copias: number
  impressora: string | null; solicitado_por: string | null; solicitado_em: string; resultado: string; impresso_em: string | null; erro: string | null
}
export interface JobFila {
  id: string; impressora: string; origem_tela: string | null; status: 'pendente' | 'imprimindo' | 'enviado' | 'erro' | 'cancelado'; copias: number
  eh_reimpressao: boolean; tentativas: number; ultimo_erro: string | null; solicitado_por: string | null; solicitado_em: string
  enviado_em: string | null; unidade_codigo: string | null; numero_curto: number | null
}
export interface Impressora {
  id: string; nome: string; setor: string | null; tipo_conexao: 'zpl_windows' | 'zpl_tcp'; caminho_rede: string; modelo_id: string | null
  agente_id: string | null; dpi: number; ajuste_x_mm: number; ajuste_y_mm: number; ativa: boolean
}
export interface Modelo { id: string; nome: string; largura_mm: number; altura_mm: number; opcoes: { mostrar_preco?: boolean; mostrar_tamanho?: boolean; mostrar_barras?: boolean }; padrao: boolean; ativo: boolean }
export interface Agente { id: string; nome: string; hostname: string; versao: string | null; status: 'aguardando_aprovacao' | 'ativo' | 'revogado' | 'expirado'; aprovado_em: string | null; ultimo_contato_em: string | null }

export const apiImpressao = {
  config: (empresa: string) => rpc<ConfigCodigoCurto>('obter_config_codigo_curto', { p_empresa: empresa }),
  salvarConfig: (empresa: string, maximo: number, quarentena: number) => rpc<void>('salvar_config_codigo_curto', { p_empresa: empresa, p_maximo: maximo, p_quarentena_min: quarentena }),
  etiquetas: (empresa: string, estado: string, busca: string, offset: number, limite: number) =>
    rpc<EtiquetaLinha[]>('listar_etiquetas', { p_empresa: empresa, p_estado: estado || null, p_busca: busca || null, p_limite: limite, p_offset: offset }),
  historico: (empresa: string, unidade: string) => rpc<HistoricoImpressao[]>('historico_impressao_etiqueta', { p_empresa: empresa, p_unidade: unidade }),
  solicitar: (empresa: string, unidades: string[], impressora: string, copias: number, motivo: string | null, confirmar: boolean) =>
    rpc<ResultadoSolicitacao>('solicitar_impressao_etiquetas', { p_empresa: empresa, p_unidades: unidades, p_impressora: impressora, p_copias: copias, p_motivo: motivo, p_confirmar_reimpressao: confirmar }),
  teste: (empresa: string, impressora: string) => rpc<string>('solicitar_teste_impressao', { p_empresa: empresa, p_impressora: impressora }),
  fila: (empresa: string, status: string) => rpc<JobFila[]>('listar_fila_impressao', { p_empresa: empresa, p_status: status || null, p_limite: 100 }),
  cancelarJob: (empresa: string, job: string) => rpc<void>('cancelar_job_impressao', { p_empresa: empresa, p_job: job }),
  impressoras: (empresa: string) => rpc<Impressora[]>('listar_impressoras', { p_empresa: empresa }),
  salvarImpressora: (empresa: string, id: string | null, dados: Record<string, unknown>) => rpc<string>('salvar_impressora', { p_empresa: empresa, p_id: id, p_dados: dados }),
  modelos: (empresa: string) => rpc<Modelo[]>('listar_modelos_etiqueta', { p_empresa: empresa }),
  salvarModelo: (empresa: string, id: string | null, dados: Record<string, unknown>) => rpc<string>('salvar_modelo_etiqueta', { p_empresa: empresa, p_id: id, p_dados: dados }),
  agentes: (empresa: string) => rpc<Agente[]>('listar_agentes_impressao', { p_empresa: empresa }),
  aprovarAgente: (empresa: string, codigo: string, nome: string) => rpc<string>('aprovar_agente_impressao', { p_empresa: empresa, p_codigo: codigo, p_nome: nome || null }),
  revogarAgente: (empresa: string, agente: string) => rpc<void>('revogar_agente_impressao', { p_empresa: empresa, p_agente: agente }),
}
