import { rpc } from './api'

// Módulo financeiro de títulos (contas a receber e a pagar, baixas, contas bancárias e conciliação).
// Funções da migration 0094 (schema api, prefixo fin_). Tudo gerencial no CRM: nada é enviado ao Bling.

export type TipoTitulo = 'R' | 'D'
export type SituacaoExibicao = 'aberto' | 'vencido' | 'parcial' | 'baixado' | 'conciliado' | 'renegociado' | 'provisao' | 'cancelado'

export const SITUACOES: { id: SituacaoExibicao; rotulo: string }[] = [
  { id: 'aberto', rotulo: 'Em aberto' }, { id: 'vencido', rotulo: 'Vencido' }, { id: 'parcial', rotulo: 'Baixa parcial' },
  { id: 'baixado', rotulo: 'Baixado' }, { id: 'conciliado', rotulo: 'Conciliado' }, { id: 'provisao', rotulo: 'Provisão' },
  { id: 'renegociado', rotulo: 'Renegociado' }, { id: 'cancelado', rotulo: 'Cancelado' },
]
export const ROTULO_SITUACAO: Record<string, string> = Object.fromEntries(SITUACOES.map((s) => [s.id, s.rotulo]))

export const ORIGENS: Record<string, string> = {
  manual: 'Manual', nfe_entrada: 'NF-e de compra', nfse_entrada: 'NFS-e recebida', venda: 'Venda', renegociacao: 'Renegociação',
  adiantamento: 'Adiantamento', recorrente: 'Recorrente', parcelamento: 'Parcelamento', duplicado: 'Duplicado', retencao: 'Guia de retenção',
  extrato: 'Criado do extrato', implantacao: 'Implantação',
}
export const TIPOS_CONTA: Record<string, string> = {
  corrente: 'Conta corrente', poupanca: 'Poupança', caixa: 'Caixa (dinheiro)', carteira_gateway: 'Carteira do gateway',
  cartao_receber: 'Cartão a receber', aplicacao: 'Aplicação',
}
export const MEIOS: Record<string, string> = {
  pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', boleto: 'Boleto', dinheiro: 'Dinheiro',
  transferencia: 'Transferência', guia: 'Guia de imposto', debito_automatico: 'Débito automático', credito_loja: 'Crédito na loja',
  cheque: 'Cheque', outros: 'Outros',
}

export interface TituloResumo {
  id: string; numero: number; tipo: TipoTitulo; parceiro_id: string; parceiro_nome: string
  documento: string | null; historico: string | null; emissao: string; competencia: string; vencimento: string; vencimento_original: string | null
  valor_original: number; retencoes: number; valor_liquido: number; saldo: number; baixado: number; pct_baixado: number
  situacao: string; situacao_exibicao: SituacaoExibicao; provisao: boolean; origem_tipo: string
  tipo_titulo: string | null; conta_prevista: string | null; grupo_id: string | null; parcela: string | null
  natureza: string | null; cr: string | null; linhas_rateio: number
}
export interface ListaTitulos {
  contagem: Partial<Record<SituacaoExibicao, number>>
  resumo: { receber_aberto: number; pagar_aberto: number; vencido_receber: number; vencido_pagar: number; provisoes: number }
  total: number; itens: TituloResumo[]
}
export interface FiltroTitulos {
  tipo?: TipoTitulo; situacoes?: string[]; de?: string; ate?: string; parceiro_id?: string; origem_tipo?: string
  grupo_id?: string; conta_id?: string; natureza_id?: string; cr_id?: string; projeto_id?: string; busca?: string; limite?: number
}
export interface Baixa {
  id: string; data: string; tipo: string; principal: number; juros: number; multa: number; desconto: number; taxa: number; movimentado: number
  parcial: boolean; conta_id: string | null; conta: string | null; lote: number | null; lote_tipo: string | null; tipo_titulo: string | null
  renegociacao: number | null; estornada: boolean; estornada_em: string | null; motivo_estorno: string | null
  conciliado: boolean | null; data_banco: string | null; conciliado_em: string | null; historico: string | null
}
export interface LinhaRateio {
  natureza_id: string; natureza: string; cr_id: string; cr: string; projeto_id: string | null; projeto: string | null
  percentual: number; componente: 'principal' | 'juros'; valor: number
}
export interface TituloDetalhe extends TituloResumo {
  retencoes_detalhe: { iss: number; irrf: number; inss: number; pcc: number; recolhe: boolean }
  tipo_titulo_id: string | null; conta_prevista_id: string | null
  juros_dia_pct: number | null; multa_pct: number | null; desconto_ate: string | null; desconto_valor: number | null
  codigo_barras: string | null; pix_copia_cola: string | null; cancelado_em: string | null; motivo_cancelamento: string | null
  rateio: LinhaRateio[]; baixas: Baixa[]
  caixa: { principal: number; juros_multa: number; desconto: number; taxa: number; movimentado: number }
  renegociado_total: number
  vinculos: {
    entrada: { id: string; numero: string | null; chave: string | null; fornecedor: string | null; parcela_id: string | null } | null
    pedido: { id: string; numero: number; nfe_numero: string | null; nfe_chave: string | null } | null
    grupo: { id: string; tipo: string; descricao: string; parcelas: number; titulos: TituloResumo[] } | null
    renegociado_em: { id: string; numero: number; situacao: string; novo_total: number; novos: TituloResumo[] | null }[]
    originado_de: { id: string; numero: number; situacao: string; total_original: number; juros: number; desconto: number; originais: (TituloResumo & { saldo_renegociado: number })[] } | null
    adiantamento: { id: string; numero: number; tipo: string; situacao: string; valor: number; papel: string; titulos: (TituloResumo & { papel: string })[] } | null
    guias: TituloResumo[]; retencao_de: TituloResumo | null; duplicado_de: TituloResumo | null
    provisao_substituida: TituloResumo | null; substituido_por: TituloResumo | null
  }
}

export interface ContaBancaria {
  id: string; nome: string; tipo: string; banco_codigo: string | null; agencia: string | null; conta: string | null
  saldo_inicial: number; data_saldo_inicial: string; permite_negativo: boolean; ativa: boolean; observacao: string | null
}
export interface TipoTituloCad {
  id: string; codigo: string; nome: string; meio: string; aplica_a: 'R' | 'D' | 'A'; conta_padrao_id: string | null
  natureza_taxa_id: string | null; natureza_taxa: string | null; taxa_pct: number; taxa_fixa: number; dias_compensacao: number
  baixa_automatica: boolean; exige_codigo_barras: boolean; ativo: boolean; ordem: number
}
export interface Projeto {
  id: string; codigo: string; nome: string; inicio: string | null; fim: string | null; situacao: 'ativo' | 'encerrado'
  responsavel_id: string | null; orcamento: number | null; observacao: string | null
}
export interface OpcaoNat { id: string; codigo: string; nome: string; caminho: string; sinal: number; reconhece_em: string; cr_padrao_id: string | null }
export interface OpcaoCr { id: string; codigo: string; nome: string; caminho: string; aceita_receita: boolean }
export type Parametros = Record<string, string | number | null>
export interface CadastrosFin {
  contas: ContaBancaria[]; tipos: TipoTituloCad[]; projetos: Projeto[]; naturezas: OpcaoNat[]; centros: OpcaoCr[]; parametros: Parametros | null
}

export interface SaldoConta {
  id: string; nome: string; tipo: string; ativa: boolean; saldo_inicial: number; data_saldo_inicial: string
  sistema: number; conciliado: number; extrato: number; tem_extrato: boolean
}
export interface Movimento {
  id: string; data: string; valor: number; tipo: string; historico: string | null; estornado: boolean
  conciliado: boolean; data_banco: string | null; conciliado_em: string | null; lote: number | null
  titulos: { id: string; numero: number; parceiro: string }[] | null; saldo: number
}
export interface Movimentos { conta: string; de: string; ate: string; saldo_anterior: number; itens: Movimento[] }

export interface LinhaExtrato {
  id: string; data: string; valor: number; descricao: string | null; situacao: 'pendente' | 'conciliada' | 'ignorada'
  motivo_ignorar: string | null; movimento_id: string | null; saldo_extrato: number
  conciliacao: { data_baixa: string; data_banco: string; conciliado_em: string; titulos: number[] | null } | null
  sugestao: { movimento_id: string; data_baixa: string; historico: string | null; titulos: number[] | null } | null
}
export interface Conciliacao {
  conta: string; data: string; de: string
  saldos: { sistema: number; conciliado: number; extrato: number; tem_extrato: boolean }
  diferenca: number; linhas_pendentes: number
  baixas_sem_extrato: { qtd: number; valor: number }
  ofx: { data_saldo: string; saldo_banco: number; saldo_calculado: number; confere: boolean } | null
  diario: { dia: string; extrato_no_dia: number; sistema: number; conciliado: number; extrato: number }[]
  linhas: LinhaExtrato[]
  pendentes_sistema: { id: string; data: string; valor: number; historico: string | null }[]
}
export interface ItemBaixa { titulo_id: string; valor?: number; juros?: number; multa?: number; desconto?: number; taxa?: number; tipo_titulo_id?: string | null }

const E = (empresa: string) => ({ p_empresa: empresa })

export const apiTitulos = {
  cadastros: (empresa: string) => rpc<CadastrosFin>('fin_cadastros', E(empresa)),
  salvarConta: (empresa: string, dados: Record<string, unknown>) => rpc<string>('fin_conta_salvar', { ...E(empresa), p_dados: dados }),
  salvarTipo: (empresa: string, dados: Record<string, unknown>) => rpc<string>('fin_tipo_titulo_salvar', { ...E(empresa), p_dados: dados }),
  salvarProjeto: (empresa: string, dados: Record<string, unknown>) => rpc<string>('fin_projeto_salvar', { ...E(empresa), p_dados: dados }),
  salvarParametros: (empresa: string, dados: Record<string, unknown>) => rpc<void>('fin_cfg_salvar', { ...E(empresa), p_dados: dados }),

  listar: (empresa: string, f: FiltroTitulos) => rpc<ListaTitulos>('fin_titulos_listar', { ...E(empresa), p_filtros: f }),
  obter: (empresa: string, id: string) => rpc<TituloDetalhe>('fin_titulo_obter', { ...E(empresa), p_titulo: id }),
  criar: (empresa: string, dados: Record<string, unknown>) => rpc<{ titulos: string[]; guias: string[]; grupo_id: string | null }>('fin_titulo_criar', { ...E(empresa), p_dados: dados }),
  salvar: (empresa: string, id: string, dados: Record<string, unknown>) => rpc<void>('fin_titulo_salvar', { ...E(empresa), p_titulo: id, p_dados: dados }),
  baixar: (empresa: string, dados: { data: string; conta_id: string | null; historico?: string; itens: ItemBaixa[] }) =>
    rpc<{ baixas: string[]; lote_id: string | null; lote_numero: number | null; movimento_id: string | null; liquido: number; compensacao: boolean }>('fin_baixar', { ...E(empresa), p_dados: dados }),
  estornarBaixa: (empresa: string, baixa: string, motivo: string) => rpc<unknown>('fin_baixa_estornar', { ...E(empresa), p_baixa: baixa, p_motivo: motivo }),
  cancelar: (empresa: string, id: string, motivo: string, modo: 'titulo' | 'grupo' | 'grupo_a_partir') =>
    rpc<number>('fin_titulo_cancelar', { ...E(empresa), p_titulo: id, p_motivo: motivo, p_modo: modo }),
  duplicar: (empresa: string, id: string, venc: string | null) => rpc<string>('fin_titulo_duplicar', { ...E(empresa), p_titulo: id, p_vencimento: venc }),
  efetivarProvisao: (empresa: string, id: string, real: string | null) => rpc<void>('fin_provisao_efetivar', { ...E(empresa), p_titulo: id, p_titulo_real: real }),
  renegociar: (empresa: string, dados: Record<string, unknown>) => rpc<{ renegociacao_id: string; numero: number; novos: string[]; total_original: number; novo_total: number }>('fin_renegociar', { ...E(empresa), p_dados: dados }),
  desfazerRenegociacao: (empresa: string, id: string, motivo: string) => rpc<void>('fin_renegociacao_desfazer', { ...E(empresa), p_renegociacao: id, p_motivo: motivo }),
  criarAdiantamento: (empresa: string, dados: Record<string, unknown>) => rpc<unknown>('fin_adiantamento_criar', { ...E(empresa), p_dados: dados }),
  cancelarAdiantamento: (empresa: string, id: string, motivo: string) => rpc<void>('fin_adiantamento_cancelar', { ...E(empresa), p_adiantamento: id, p_motivo: motivo }),

  transferir: (empresa: string, de: string, para: string, valor: number, data: string, historico: string | null) =>
    rpc<unknown>('fin_transferir', { ...E(empresa), p_de: de, p_para: para, p_valor: valor, p_data: data, p_historico: historico }),
  estornarTransferencia: (empresa: string, movimento: string) => rpc<void>('fin_transferencia_estornar', { ...E(empresa), p_movimento: movimento }),
  saldos: (empresa: string, data: string | null) => rpc<{ data: string; contas: SaldoConta[] }>('fin_saldos', { ...E(empresa), p_data: data }),
  movimentos: (empresa: string, conta: string, de: string | null, ate: string | null) =>
    rpc<Movimentos>('fin_movimentos', { ...E(empresa), p_conta: conta, p_de: de, p_ate: ate }),

  importarExtrato: (empresa: string, conta: string, dados: Record<string, unknown>) =>
    rpc<{ extrato_id: string; novas: number; repetidas: number }>('fin_extrato_importar', { ...E(empresa), p_conta: conta, p_dados: dados }),
  conciliacao: (empresa: string, conta: string, data: string | null, de: string | null) =>
    rpc<Conciliacao>('fin_conciliacao', { ...E(empresa), p_conta: conta, p_data: data, p_de: de }),
  conciliar: (empresa: string, linha: string, movimento: string) => rpc<unknown>('fin_conciliar', { ...E(empresa), p_linha: linha, p_movimento: movimento }),
  desconciliar: (empresa: string, linha: string) => rpc<void>('fin_desconciliar', { ...E(empresa), p_linha: linha }),
  ignorarLinha: (empresa: string, linha: string, motivo: string) => rpc<void>('fin_extrato_ignorar', { ...E(empresa), p_linha: linha, p_motivo: motivo }),
  criarTituloDaLinha: (empresa: string, linha: string, dados: Record<string, unknown>) => rpc<string>('fin_extrato_criar_titulo', { ...E(empresa), p_linha: linha, p_dados: dados }),
}

// ---------------------------------------------------------------- utilidades
export const moeda = (v: number | null | undefined) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dia = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
export const dataHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
export const hojeIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
export const somarDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
export const inicioMes = (iso: string) => iso.slice(0, 8) + '01'
/** "1.234,56" ou "1234.56" → número (vazio = null) */
export const num = (s: string): number | null => {
  const t = s.trim(); if (t === '') return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}
export const r2 = (n: number) => Math.round(n * 100) / 100
/** divide o total em n parcelas iguais; a diferença de centavos vai na última */
export function dividir(total: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor((total / n) * 100) / 100
  const l = Array.from({ length: n }, () => base)
  l[n - 1] = r2(total - base * (n - 1))
  return l
}

// ---------------------------------------------------------------- OFX (lido no navegador; só as linhas vão ao banco)
export interface ExtratoOfx { linhas: { fitid: string; data: string; valor: number; descricao: string; tipo: string }[]; saldo_final: number | null; data_saldo: string | null; banco: string | null; conta: string | null }

const tag = (bloco: string, nome: string) => {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : ''
}
const dataOfx = (s: string) => (s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '')
const numOfx = (s: string) => Number(s.replace(',', '.'))

export function lerOfx(texto: string): ExtratoOfx {
  const linhas: ExtratoOfx['linhas'] = []
  for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)) {
    const b = m[1]
    const data = dataOfx(tag(b, 'DTPOSTED')), valor = numOfx(tag(b, 'TRNAMT'))
    if (!data || !Number.isFinite(valor)) continue
    const memo = tag(b, 'MEMO'), nome = tag(b, 'NAME')
    linhas.push({ fitid: tag(b, 'FITID'), data, valor, descricao: [nome, memo].filter((x, i, a) => x && a.indexOf(x) === i).join(' · '), tipo: tag(b, 'TRNTYPE') })
  }
  const led = texto.match(/<LEDGERBAL>([\s\S]*?)(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i)?.[1] ?? ''
  const saldo = led ? numOfx(tag(led, 'BALAMT')) : NaN
  return {
    linhas, saldo_final: Number.isFinite(saldo) ? saldo : null, data_saldo: led ? dataOfx(tag(led, 'DTASOF')) || null : null,
    banco: tag(texto, 'BANKID') || null, conta: tag(texto, 'ACCTID') || null,
  }
}

export async function hashTexto(texto: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('')
}
