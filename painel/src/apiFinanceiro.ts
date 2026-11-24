import { rpc } from './api'

// Natureza financeira, Centro de Resultado, De-Para das categorias do Bling e regras de apropriação.
// Funções da migration 0072 (schema api). Estrutura da 0066/0067. Nada é enviado ao Bling.

export interface Natureza {
  id: string; pai_id: string | null; codigo: string; nome: string; grau: number; analitico: boolean; ativo: boolean
  ordem: number; caminho_nome: string; sinal: -1 | 0 | 1; comportamento: 'variavel' | 'fixa' | null
  reconhece_em: 'lancamento' | 'cmv_itens' | 'nao_dre'; exige_cr_canal: boolean
  linha_dre_id: string | null; linha_dre_codigo: string | null; linha_dre_nome: string | null
  cr_padrao_id: string | null; cr_padrao_codigo: string | null; cr_padrao_nome: string | null
  qtd_filhos: number; qtd_apropriacoes: number; qtd_regras: number; qtd_depara: number
}
export interface CentroResultado {
  id: string; pai_id: string | null; codigo: string; nome: string; grau: number; analitico: boolean; ativo: boolean
  ordem: number; caminho_nome: string; tipo: 'canal' | 'apoio' | 'area'; aceita_receita: boolean
  canal_venda: string | null; responsavel_id: string | null
  qtd_filhos: number; qtd_apropriacoes: number; qtd_regras: number
}
export interface LinhaDre { id: string; codigo: string; nome: string; tipo: 'conta' | 'subtotal'; sinal: number; ordem: number; ativo: boolean }
export interface DeParaBling {
  categoria_bling_id: number; descricao: string; tipo: string | null; pai_bling_id: number | null
  natureza_id: string | null; natureza_codigo: string | null; natureza_caminho: string | null
  ignorar: boolean; observacao: string | null; mapeada: boolean
}
export interface RegraApropriacao {
  id: string; escopo: string[]; prioridade: number; campo: string; operador: string; valor: string | null
  natureza_id: string | null; natureza_codigo: string | null; natureza_caminho: string | null
  cr_id: string | null; cr_codigo: string | null; cr_caminho: string | null
  confianca: 'alta' | 'media' | 'baixa'; ativa: boolean; versao_regra: number; descricao: string
}

export const apiFinanceiro = {
  linhasDre: (empresa: string) => rpc<LinhaDre[]>('listar_linhas_dre', { p_empresa: empresa }),

  naturezas: (empresa: string) => rpc<Natureza[]>('listar_naturezas', { p_empresa: empresa }),
  salvarNatureza: (empresa: string, id: string | null, dados: Record<string, unknown>) =>
    rpc<string>('salvar_natureza', { p_empresa: empresa, p_id: id, p_dados: dados }),
  excluirNatureza: (empresa: string, id: string) => rpc<void>('excluir_natureza', { p_empresa: empresa, p_id: id }),

  centros: (empresa: string) => rpc<CentroResultado[]>('listar_centros_resultado', { p_empresa: empresa }),
  salvarCentro: (empresa: string, id: string | null, dados: Record<string, unknown>) =>
    rpc<string>('salvar_centro_resultado', { p_empresa: empresa, p_id: id, p_dados: dados }),
  excluirCentro: (empresa: string, id: string) => rpc<void>('excluir_centro_resultado', { p_empresa: empresa, p_id: id }),

  depara: (empresa: string) => rpc<DeParaBling[]>('listar_depara_bling', { p_empresa: empresa }),
  salvarDepara: (empresa: string, categoria: number, natureza: string | null, ignorar: boolean, obs: string | null) =>
    rpc<void>('salvar_depara_bling', { p_empresa: empresa, p_categoria_bling_id: categoria, p_natureza_id: natureza, p_ignorar: ignorar, p_observacao: obs }),

  regras: (empresa: string) => rpc<RegraApropriacao[]>('listar_regras_apropriacao', { p_empresa: empresa }),
  salvarRegra: (empresa: string, id: string | null, dados: Record<string, unknown>) =>
    rpc<string>('salvar_regra_apropriacao', { p_empresa: empresa, p_id: id, p_dados: dados }),
}
