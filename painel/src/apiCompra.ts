import { rpc } from './api'

// Entrada de mercadoria por NF-e de compra. Funções api.compra_* das migrations 0070 e 0075. Nada é enviado ao Bling.

export interface EntradaResumo {
  id: string; numero: string | null; serie: string | null; fornecedor: string; emitida_em: string | null; v_nf: number
  status: 'importada' | 'em_edicao' | 'confirmada' | 'cancelada'; diferenca: number; criado_em: string; pecas: number; liberadas: number
}
export interface EntradaCab {
  id: string; chave_acesso: string; numero: string | null; serie: string | null; fornecedor_parceiro_id: string | null; fornecedor_nome: string
  fornecedor_doc_ultimos: string | null; emitida_em: string | null
  v_prod: number; v_frete: number; v_seg: number; v_desc: number; v_outro: number; v_ipi: number; v_st: number; v_icms: number; v_nf: number
  mod_frete: number | null; transportadora_nome: string | null; peso_bruto: number | null
  regime_sim: 'simples' | 'presumido' | 'real'; pct_custo_fixo: number; diferenca: number
  status: EntradaResumo['status']
  fin_origem: 'xml' | 'manual' | 'sem_financeiro' | null; fin_motivo: string | null; fin_negociacao: string | null
  fin_natureza_id: string | null; fin_cr_id: string | null; fin_conferido: boolean
  margem_pct?: number | null; criado_em?: string; atualizado_em?: string; confirmada_em?: string | null
  rateio_conferido?: boolean; rateio_conferido_por?: string | null; rateio_conferido_em?: string | null
}
export interface EntradaItem {
  id: string; seq: number; codigo_fornecedor: string | null; descricao: string; ncm: string | null; cfop: string | null
  qtd: number; v_prod: number; v_desc: number; classe: 'completa' | 'generica' | 'existente'
}
export interface EntradaPeca {
  id: string; item_id: string; seq: number; modelo_chave: string; nome: string | null; grupo_id: string | null; marca: string | null
  tipo_grade_id: string | null; tamanho: string | null; atributos: Record<string, string> | null; condicao: string | null; qtd: number
  peca_existente_id: string | null; v_base: number; base_custo: number; credito: number; custo_contabil: number; custo_gerencial: number
  preco_sugerido: number | null; preco_final: number | null; liberada: boolean; faltas: string | null
}
export interface Rubrica { id: string; descricao: string; valor: number; criterio: string; gera_financeiro?: boolean }
export interface Parcela {
  id: string; seq: number; vencimento: string | null; valor: number | null; natureza_id: string | null; cr_id: string | null
  forma: string | null; observacao: string | null; titulo_id: string | null
  rubrica_id?: string | null; parceiro_id?: string | null; parceiro_nome?: string | null; documento?: string | null
}
export interface EntradaDetalhe {
  entrada: EntradaCab; itens: EntradaItem[]; pecas: EntradaPeca[]; rubricas: Rubrica[]; parcelas: Parcela[]
  pendencias: { seq: number; motivo: string }[]; pendencia_financeiro: string | null; fornecedor_ok: boolean
  /** Ausente até a migration 0076 ser aplicada. */
  preco_cfg?: { margem_padrao: number | null; imposto: number; taxa: number; final: number | null } | null
  quem?: { criado_por: string | null; atualizado_por: string | null; confirmada_por: string | null }
  resumo: { unidades: number; base_custo: number; credito: number; custo_contabil: number; custo_gerencial: number; diferenca: number; linhas: number; liberadas: number }
}
/** Unidade física criada pela entrada, com a etiqueta e o rastro (migration 0076). */
export interface UnidadeEntrada {
  unidade_id: string; codigo: string; numero_curto: number | null; etiqueta_estado: 'pendente' | 'impressa' | 'desatualizada' | 'encerrada' | null
  qtd_impressoes: number; ultima_impressao_em: string | null; peca_codigo: string; peca_nome: string; tamanho: string | null
  preco: number | null; custo: number | null; local: string | null; estado: string
}
export interface SimulacaoRegime { regime: 'simples' | 'presumido' | 'real'; base_custo: number; credito: number; custo_contabil: number; custo_gerencial: number; selecionado: boolean }

/** JSON enviado ao banco; o XML é lido no navegador (ver xmlNfe.ts). */
export interface DadosImportacao {
  chave_acesso: string; numero: string; serie: string; emitida_em: string | null
  fornecedor_nome: string; fornecedor_doc_ultimos: string; fornecedor_parceiro_id?: string | null
  mod_frete: number | null; transportadora_nome: string | null; peso_bruto: number | null; xml_hash: string
  totais: Record<string, number>
  itens: { seq: number; codigo: string | null; descricao: string; ncm: string | null; cfop: string | null; unidade: string | null; gtin: string | null; qtd: number
    v_unit: number; v_prod: number; v_desc: number; v_frete: number; v_seg: number; v_outro: number; v_ipi: number; v_st: number; v_icms: number; peso: number }[]
  parcelas: { seq: number; vencimento: string | null; valor: number }[]
  pagamentos?: { forma: string | null; descricao: string | null; indicador: number | null; valor: number }[]
  fornecedor_crt?: string | null
}

export const apiCompra = {
  listar: (empresa: string, status?: string) => rpc<EntradaResumo[]>('compra_listar', { p_empresa: empresa, p_status: status ?? null }),
  obter: (empresa: string, id: string) => rpc<EntradaDetalhe>('compra_obter', { p_empresa: empresa, p_entrada: id }),
  importar: (empresa: string, dados: DadosImportacao) => rpc<string>('compra_importar', { p_empresa: empresa, p_dados: dados }),
  salvarPeca: (empresa: string, peca: string, dados: Record<string, unknown>) => rpc<void>('compra_salvar_peca', { p_empresa: empresa, p_peca: peca, p_dados: dados }),
  liberarPecas: (empresa: string, id: string, liberar: boolean) =>
    rpc<{ liberadas: number; com_cadastro_incompleto: number }>('compra_liberar_pecas', { p_empresa: empresa, p_entrada: id, p_liberar: liberar }),
  sugerirCadastro: (empresa: string, id: string) => rpc<{ linhas_atualizadas: number }>('compra_sugerir_cadastro', { p_empresa: empresa, p_entrada: id }),
  desmembrar: (empresa: string, item: string, partes: { qtd: number; nome?: string; tamanho?: string; valor?: number }[]) =>
    rpc<void>('compra_desmembrar_item', { p_empresa: empresa, p_item: item, p_partes: partes }),
  desmembrarGrade: (empresa: string, item: string, modelos: { nome?: string; cor?: string; tipo_grade_id: string; grade: Record<string, number> }[]) =>
    rpc<void>('compra_desmembrar_grade', { p_empresa: empresa, p_item: item, p_modelos: modelos }),
  ajustar: (empresa: string, id: string, dados: Record<string, unknown>) => rpc<void>('compra_ajustar', { p_empresa: empresa, p_entrada: id, p_dados: dados }),
  unidades: (empresa: string, id: string) => rpc<UnidadeEntrada[]>('compra_unidades', { p_empresa: empresa, p_entrada: id }),
  simular: (empresa: string, id: string) => rpc<SimulacaoRegime[]>('compra_simular_regimes', { p_empresa: empresa, p_entrada: id }),
  salvarRubrica: (empresa: string, id: string, rubrica: string | null, descricao: string, valor: number, criterio: string) =>
    rpc<string>('compra_salvar_rubrica', { p_empresa: empresa, p_entrada: id, p_rubrica: rubrica, p_descricao: descricao, p_valor: valor, p_criterio: criterio }),
  rateioConferir: (empresa: string, id: string, conferido: boolean) => rpc<void>('compra_rateio_conferir', { p_empresa: empresa, p_entrada: id, p_conferido: conferido }),
  rubricaFinanceiro: (empresa: string, id: string, rubrica: string, gera: boolean) => rpc<void>('compra_rubrica_financeiro', { p_empresa: empresa, p_entrada: id, p_rubrica: rubrica, p_gera: gera }),
  rubricaFinanceiroSalvar: (empresa: string, id: string, rubrica: string, dados: Record<string, unknown>) =>
    rpc<{ pendencia: string | null }>('compra_rubrica_financeiro_salvar', { p_empresa: empresa, p_entrada: id, p_rubrica: rubrica, p_dados: dados }),
  excluirRubrica: (empresa: string, id: string, rubrica: string) => rpc<void>('compra_excluir_rubrica', { p_empresa: empresa, p_entrada: id, p_rubrica: rubrica }),
  cancelar: (empresa: string, id: string) => rpc<void>('compra_cancelar', { p_empresa: empresa, p_entrada: id }),
  confirmar: (empresa: string, id: string, local: string) =>
    rpc<{ ja_confirmada: boolean; pecas_criadas?: number; variacoes_criadas?: number; unidades: number }>('compra_confirmar', { p_empresa: empresa, p_entrada: id, p_local: local }),

  acharFornecedor: (empresa: string, cnpj: string) => rpc<{ parceiro_id: string | null; nome: string | null }>('compra_achar_fornecedor', { p_empresa: empresa, p_cnpj: cnpj }),
  criarFornecedor: (empresa: string, cnpj: string, nome: string) => rpc<string>('compra_criar_fornecedor', { p_empresa: empresa, p_dados: { cnpj, nome } }),
  definirFornecedor: (empresa: string, id: string, parceiro: string) => rpc<void>('compra_definir_fornecedor', { p_empresa: empresa, p_entrada: id, p_parceiro: parceiro }),

  financeiroSugerir: (empresa: string, id: string) => rpc<void>('compra_financeiro_sugerir', { p_empresa: empresa, p_entrada: id }),
  financeiroSalvar: (empresa: string, id: string, dados: Record<string, unknown>) =>
    rpc<{ pendencia: string | null }>('compra_financeiro_salvar', { p_empresa: empresa, p_entrada: id, p_dados: dados }),
}
