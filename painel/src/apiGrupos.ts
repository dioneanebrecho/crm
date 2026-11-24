import { rpc } from './api'

// Grupos de produto (hierarquia até 6 níveis), características, palavras de classificação e alteração em lote.
// Funções da migration 0063 (cadastros) e 0064 (produtos e lote). Nada é enviado ao Bling.

export interface GrupoProduto {
  id: string; pai_id: string | null; seq: number; codigo: string; nome: string; grau: number
  analitico: boolean; ativo: boolean; ordem: number; caminho_nome: string
  tipo_grade_padrao_id: string | null; ncm_padrao: string | null; margem_alvo: number | null
  qtd_filhos: number; qtd_produtos: number; qtd_pecas: number
}
export interface Caracteristica {
  codigo: string; rotulo: string; tipo_dado: 'texto' | 'lista'; opcoes: string[]; ordem: number; ativo: boolean
}
export interface PalavraClassificacao {
  id: string; alvo: 'grupo' | 'caracteristica' | 'marca'; palavra: string
  grupo_id: string | null; grupo_caminho: string | null; caracteristica: string | null; valor: string | null
  marca: string | null; grupos_ids: string[] | null; prioridade: number; ativo: boolean
}
export interface ProdutoClassificacao {
  bling_id: number; codigo: string | null; nome: string
  grupo_id: string | null; grupo_codigo: string | null; grupo_caminho: string | null
  marca: string | null; caracteristicas: Record<string, string>
  origem_grupo: 'regra' | 'manual'; origem_marca: 'regra' | 'manual'; tem_imagem: boolean | null; preco: number | null
  /** unidades em estoque no CRM (disponíveis + reservadas); null = o produto ainda não virou Peça no CRM */
  estoque: number | null
}
export interface FiltroProdutos {
  grupo_id?: string; marca?: string; sem_marca?: boolean; caracteristica?: string; valor?: string
  sem_caracteristica?: string; origem?: 'manual' | 'regra'; so_pendentes?: boolean; busca?: string
  estoque?: 'com' | 'sem'
}
export interface PaginaProdutos { total: number; limite: number; offset: number; itens: ProdutoClassificacao[] }
export interface ResumoClassificacao {
  total: number; sem_registro: number; classificados: number; pendentes: number; manuais: number; com_marca: number
  por_departamento: { codigo: string; nome: string | null; qtd: number }[]
  por_caracteristica: Record<string, number>; ultimo_lote_em: string | null
}
/** Alteração em lote: só as chaves presentes mudam. marca: null limpa. caracteristicas: valor null remove. */
export interface DadosLote { grupo_id?: string; marca?: string | null; caracteristicas?: Record<string, string | null> }

export const apiGrupos = {
  grupos: (empresa: string) => rpc<GrupoProduto[]>('listar_grupos_produto', { p_empresa: empresa }),
  salvarGrupo: (empresa: string, id: string | null, dados: Record<string, unknown>) =>
    rpc<string>('salvar_grupo_produto', { p_empresa: empresa, p_id: id, p_dados: dados }),
  excluirGrupo: (empresa: string, id: string) => rpc<void>('excluir_grupo_produto', { p_empresa: empresa, p_id: id }),

  caracteristicas: (empresa: string) => rpc<Caracteristica[]>('listar_caracteristicas', { p_empresa: empresa }),
  salvarCaracteristica: (empresa: string, dados: Partial<Caracteristica> & { codigo: string; rotulo: string }) =>
    rpc<string>('salvar_caracteristica', { p_empresa: empresa, p_dados: dados }),

  palavras: (empresa: string, alvo?: string) => rpc<PalavraClassificacao[]>('listar_palavras_classificacao', { p_empresa: empresa, p_alvo: alvo ?? null }),
  salvarPalavra: (empresa: string, id: string | null, dados: Record<string, unknown>) =>
    rpc<string>('salvar_palavra_classificacao', { p_empresa: empresa, p_id: id, p_dados: dados }),
  excluirPalavra: (empresa: string, id: string) => rpc<void>('excluir_palavra_classificacao', { p_empresa: empresa, p_id: id }),

  produtos: (empresa: string, filtro: FiltroProdutos, limite: number, offset: number) =>
    rpc<PaginaProdutos>('listar_produtos_classificacao', { p_empresa: empresa, p_filtro: filtro, p_limite: limite, p_offset: offset }),
  /** Seleção explícita (ids) ou "todos do filtro" (ids = null). Máximo 20.000 por chamada. */
  alterarLote: (empresa: string, ids: number[] | null, filtro: FiltroProdutos | null, dados: DadosLote) =>
    rpc<{ alterados: number; selecionados: number }>('alterar_produtos_lote', { p_empresa: empresa, p_ids: ids, p_filtro: filtro, p_dados: dados }),
  aplicarRegras: (empresa: string, reaplicar: boolean) =>
    rpc<{ processados: number; reaplicar: boolean }>('aplicar_regras_classificacao', { p_empresa: empresa, p_reaplicar: reaplicar, p_ids: null }),
  resumo: (empresa: string) => rpc<ResumoClassificacao>('resumo_classificacao', { p_empresa: empresa }),
}
