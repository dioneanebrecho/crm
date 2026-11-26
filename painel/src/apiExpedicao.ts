import { rpc } from './api'

// Expedição (pedido 048): junta os pedidos pagos da mesma pessoa e endereço num envio só; o frete é cobrado depois, ao montar o envio.
export interface Pendente {
  parceiro_id: string; parceiro: string | null; endereco_id: string | null; endereco: string | null
  pedidos: number; itens: number; valor_itens: number; primeiro_pago: string; vip: boolean; reservas_acumuladas: number; expedicao_aberta: string | null
}
export type EstadoExpedicao = 'aguardando_frete' | 'frete_cobrado' | 'pronta' | 'enviada' | 'entregue' | 'cancelada'
export interface Expedicao {
  id: string; numero: number | null; estado: EstadoExpedicao; parceiro_id: string; parceiro: string | null; endereco: string | null
  valor_frete: number | null; frete_gratis: boolean; servico: string | null; prazo_dias: number | null; transportadora: string | null
  codigo_rastreio: string | null; frete_link: string | null; criado_em: string; enviada_em: string | null; valor_itens: number; reservas_acumuladas: number
  pedidos: { id: string; numero: string | null; valor: number; pago_em: string; itens: string[] | null }[] | null
}
export const ESTADO_EXP: Record<EstadoExpedicao, string> = {
  aguardando_frete: 'Definir frete', frete_cobrado: 'Frete cobrado', pronta: 'Pronta para enviar', enviada: 'Enviada', entregue: 'Entregue', cancelada: 'Desfeita',
}
export const apiExpedicao = {
  pendentes: (empresa: string) => rpc<Pendente[]>('expedicao_pendentes', { p_empresa: empresa }),
  lista: (empresa: string, estado: string | null) => rpc<Expedicao[]>('expedicoes', { p_empresa: empresa, p_estado: estado }),
  montar: (empresa: string, parceiro: string, endereco: string | null) => rpc<string>('expedicao_montar', { p_empresa: empresa, p_parceiro: parceiro, p_endereco: endereco }),
  definirFrete: (empresa: string, exp: string, valor: number, servico: string | null, prazo: number | null, gratis: boolean) =>
    rpc<{ estado: string }>('expedicao_definir_frete', { p_empresa: empresa, p_expedicao: exp, p_valor: valor, p_servico: servico, p_prazo_dias: prazo, p_gratis: gratis }),
  fretePago: (empresa: string, exp: string, metodo: string, motivo: string) => rpc<string>('expedicao_frete_pago', { p_empresa: empresa, p_expedicao: exp, p_metodo: metodo, p_motivo: motivo }),
  enviar: (empresa: string, exp: string, rastreio: string, transportadora: string | null) =>
    rpc<void>('expedicao_enviar', { p_empresa: empresa, p_expedicao: exp, p_rastreio: rastreio, p_transportadora: transportadora }),
  cancelar: (empresa: string, exp: string, motivo: string) => rpc<void>('expedicao_cancelar', { p_empresa: empresa, p_expedicao: exp, p_motivo: motivo }),
}
