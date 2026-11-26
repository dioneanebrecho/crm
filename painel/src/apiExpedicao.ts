import { rpc } from './api'

// Expedição (pedidos 048 e 049): junta os pedidos pagos da mesma pessoa e endereço num envio só.
// O fluxo é conferir as peças pelo código de barras → definir o frete (ou grátis) → cobrar → postar com rastreio.
// O frete tem dois lados no financeiro: o que a cliente paga (título a receber) e o que a loja paga (título a pagar).
export interface Pendente {
  parceiro_id: string; parceiro: string | null; endereco_id: string | null; endereco: string | null
  pedidos: number; itens: number; valor_itens: number; primeiro_pago: string; vip: boolean; reservas_acumuladas: number; expedicao_aberta: string | null
}
export type EstadoExpedicao = 'aguardando_conferencia' | 'conferida' | 'frete_cobrado' | 'pronta' | 'enviada' | 'entregue' | 'cancelada'
export type SituacaoTitulo = 'aberto' | 'parcial' | 'baixado' | 'cancelado' | 'renegociado'
export interface TituloFrete { id: string; numero: number; situacao: SituacaoTitulo; valor: number; saldo: number; vencimento: string }
export interface Expedicao {
  id: string; numero: number | null; estado: EstadoExpedicao; parceiro_id: string; parceiro: string | null; endereco: string | null
  valor_frete: number | null; frete_gratis: boolean; servico: string | null; prazo_dias: number | null; transportadora: string | null
  codigo_rastreio: string | null; url_rastreio: string | null; frete_link: string | null
  criado_em: string; enviada_em: string | null; entregue_em: string | null; valor_itens: number; reservas_acumuladas: number
  peso_g: number | null; comprimento_cm: number | null; largura_cm: number | null; altura_cm: number | null
  conferida_em: string | null; conferidos: number; itens_total: number
  custo_frete: number | null; resultado_frete: number | null
  titulo_receber: TituloFrete | null; titulo_pagar: TituloFrete | null
  pedidos: { id: string; numero: string | null; valor: number; pago_em: string; itens: string[] | null }[] | null
  // preenchidos pela fase 4 (Melhor Envio); hoje só a simulação os traz
  etiqueta?: EtiquetaEnvio | null; pix_copia_cola?: string | null
}
// Cotação e etiqueta (fase 4 do pedido 049: Melhor Envio). Hoje só a simulação preenche;
// quando o worker do Melhor Envio entrar, `api.expedicoes` passa a devolver os mesmos campos.
export interface CotacaoFrete {
  id: string; provedor: string; transportadora: string; servico: string
  custo: number; a_cobrar: number; prazo_min: number; prazo_max: number; erro: string | null
}
export type EstadoEtiqueta = 'no_carrinho' | 'paga' | 'gerada' | 'impressa' | 'postada' | 'cancelada' | 'erro'
export interface EtiquetaEnvio {
  estado: EstadoEtiqueta; protocolo: string | null; custo: number | null
  etiqueta_url: string | null; codigo_rastreio: string | null
}
export interface ItemConferencia {
  pedido_item_id: string; unidade_id: string | null; codigo: string | null; descricao: string; conferido: boolean; bipado_em: string | null
}
export interface Conferencia {
  expedicao_id: string; numero: number | null; estado: EstadoExpedicao; parceiro: string | null; endereco: string | null
  total: number; conferidos: number; itens: ItemConferencia[]
  peso_g: number; comprimento_cm: number; largura_cm: number; altura_cm: number; medidas_confirmadas: boolean; conferida_em: string | null
}
export interface Bipagem { total: number; conferidos: number; itens: ItemConferencia[]; descricao: string | null }
export interface AchadoPorCodigo { expedicao_id: string; numero: number | null; parceiro: string | null; estado: EstadoExpedicao; unidade_id: string }
export interface EventoRastreio { estado: string; descricao: string | null; ocorrido_em: string; fonte: string }
export interface Rastreio { codigo_rastreio: string | null; transportadora: string | null; url_rastreio: string | null; eventos: EventoRastreio[] }
export interface CfgExpedicao {
  peso_padrao_peca_g: number; comprimento_padrao_cm: number; largura_padrao_cm: number; altura_padrao_cm: number
  url_rastreio_modelo: string | null
  natureza_receita_frete_id: string | null; natureza_receita_frete: string | null
  natureza_custo_frete_id: string | null; natureza_custo_frete: string | null
  cr_receita_frete_id: string | null; cr_custo_frete_id: string | null
  parceiro_transportadora_id: string | null; parceiro_transportadora: string | null; conta_frete_id: string | null
}

export const ESTADO_EXP: Record<EstadoExpedicao, string> = {
  aguardando_conferencia: 'Conferir peças', conferida: 'Definir frete', frete_cobrado: 'Frete cobrado',
  pronta: 'Pronta para enviar', enviada: 'Enviada', entregue: 'Entregue', cancelada: 'Desfeita',
}
export const SITUACAO_TITULO: Record<SituacaoTitulo, string> = {
  aberto: 'em aberto', parcial: 'parcial', baixado: 'recebido', cancelado: 'cancelado', renegociado: 'renegociado',
}
// os estados que ainda estão em andamento na bancada
export const ABERTOS: EstadoExpedicao[] = ['aguardando_conferencia', 'conferida', 'frete_cobrado', 'pronta']

export const apiExpedicao = {
  pendentes: (empresa: string) => rpc<Pendente[]>('expedicao_pendentes', { p_empresa: empresa }),
  lista: (empresa: string, estado: string | null) => rpc<Expedicao[]>('expedicoes', { p_empresa: empresa, p_estado: estado }),
  montar: (empresa: string, parceiro: string, endereco: string | null) => rpc<string>('expedicao_montar', { p_empresa: empresa, p_parceiro: parceiro, p_endereco: endereco }),

  // conferência: bipar qualquer peça localiza o envio; só com tudo bipado e a caixa pesada o frete pode ser cobrado
  porCodigo: (empresa: string, codigo: string) => rpc<AchadoPorCodigo>('expedicao_por_codigo', { p_empresa: empresa, p_codigo: codigo }),
  conferencia: (empresa: string, exp: string) => rpc<Conferencia>('expedicao_conferencia', { p_empresa: empresa, p_expedicao: exp }),
  conferirPeca: (empresa: string, exp: string, codigo: string) => rpc<Bipagem>('expedicao_conferir_peca', { p_empresa: empresa, p_expedicao: exp, p_codigo: codigo }),
  fecharConferencia: (empresa: string, exp: string, pesoG: number, comp: number | null, larg: number | null, alt: number | null) =>
    rpc<{ estado: string }>('expedicao_fechar_conferencia', { p_empresa: empresa, p_expedicao: exp, p_peso_g: pesoG, p_comprimento_cm: comp, p_largura_cm: larg, p_altura_cm: alt }),
  reabrirConferencia: (empresa: string, exp: string, motivo: string) => rpc<void>('expedicao_reabrir_conferencia', { p_empresa: empresa, p_expedicao: exp, p_motivo: motivo }),

  definirFrete: (empresa: string, exp: string, valor: number, servico: string | null, prazo: number | null, gratis: boolean) =>
    rpc<{ estado: string }>('expedicao_definir_frete', { p_empresa: empresa, p_expedicao: exp, p_valor: valor, p_servico: servico, p_prazo_dias: prazo, p_gratis: gratis }),
  fretePago: (empresa: string, exp: string, metodo: string, motivo: string) => rpc<string>('expedicao_frete_pago', { p_empresa: empresa, p_expedicao: exp, p_metodo: metodo, p_motivo: motivo }),
  // custo da postagem: vira título a pagar para a transportadora, já baixado quando foi pago no balcão
  registrarCusto: (empresa: string, exp: string, custo: number, parceiro: string | null, documento: string | null, pago: boolean) =>
    rpc<{ titulo_id: string; pago: boolean }>('expedicao_registrar_custo',
      { p_empresa: empresa, p_expedicao: exp, p_custo: custo, p_parceiro: parceiro, p_documento: documento, p_vencimento: null, p_pago: pago, p_conta: null }),

  enviar: (empresa: string, exp: string, rastreio: string, transportadora: string | null) =>
    rpc<void>('expedicao_enviar', { p_empresa: empresa, p_expedicao: exp, p_rastreio: rastreio, p_transportadora: transportadora }),
  entregue: (empresa: string, exp: string) => rpc<void>('expedicao_entregue', { p_empresa: empresa, p_expedicao: exp, p_em: null }),
  rastreio: (empresa: string, exp: string) => rpc<Rastreio>('expedicao_rastreio', { p_empresa: empresa, p_expedicao: exp }),
  cancelar: (empresa: string, exp: string, motivo: string) => rpc<void>('expedicao_cancelar', { p_empresa: empresa, p_expedicao: exp, p_motivo: motivo }),

  cfg: (empresa: string) => rpc<CfgExpedicao>('expedicao_cfg_obter', { p_empresa: empresa }),
  salvarCfg: (empresa: string, dados: Record<string, unknown>) => rpc<void>('expedicao_cfg_salvar', { p_empresa: empresa, p_dados: dados }),
}
