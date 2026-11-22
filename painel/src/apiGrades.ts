import { ApiError, rpc } from './api'
import { useCarregar } from './ui'

// ---------------------------------------------------------------- Tipos de grade (configuração) e vínculo com o Bling
export interface GradeValor { valor: string; rotulo: string; ordem: number; sinonimos: string[] }
export interface GradeAtributo {
  codigo: string; rotulo: string; nivel: 'peca' | 'variacao'; tipo_dado: 'texto' | 'numero' | 'lista'
  opcoes: string[]; unidade: string | null; obrigatorio: boolean; ordem: number
}
export interface TipoGrade {
  id: string; codigo: string; nome: string; descricao: string | null; controla_tamanho: boolean; ordem: number; ativo: boolean; em_uso: number
  valores: GradeValor[]; atributos: GradeAtributo[]; palavras: string[]
}
export type Atributos = Record<string, string | number>

export interface ProdutoBlingSugerido {
  bling_id: number; codigo: string | null; nome: string | null; ref_fornecedor: string | null; preco: number | null
  tamanhos: string[]; qtd_variacoes: number; ja_vinculado: boolean; motivo: string
}
export interface ResultadoVinculo {
  vinculado: boolean; variacoes_vinculadas?: number; tamanhos_da_peca_sem_par_no_bling?: string[]; tamanhos_do_bling_sem_par_na_peca?: string[]
}

const PENDENTE = 'Recurso ainda não habilitado no banco (aguardando a migration 0025).'
async function rpcOpcional<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  try { return await rpc<T>(fn, args) } catch (e) {
    if (e instanceof ApiError && (e.code === 'PGRST202' || /Data API do Supabase ainda não expõe/.test(e.message))) throw new ApiError(PENDENTE, 'PENDENTE')
    throw e
  }
}
export const ehPendente = (e: unknown) => e instanceof ApiError && e.code === 'PENDENTE'

export const apiGrades = {
  listar: (empresa: string) => rpcOpcional<TipoGrade[]>('listar_tipos_grade', { p_empresa: empresa }),
  salvar: (empresa: string, id: string | null, dados: Partial<TipoGrade> & { nome: string }) =>
    rpcOpcional<string>('salvar_tipo_grade', { p_empresa: empresa, p_id: id, p_dados: dados }),
  semear: (empresa: string) => rpcOpcional<void>('semear_grades_padrao', { p_empresa: empresa }),
  sugerirTipo: (empresa: string, nome: string) => rpcOpcional<string | null>('sugerir_tipo_grade', { p_empresa: empresa, p_nome: nome }),
  definirGradePeca: (empresa: string, peca: string, tipo: string | null, atributos: Atributos) =>
    rpcOpcional<void>('definir_grade_peca', { p_empresa: empresa, p_peca: peca, p_tipo: tipo, p_atributos: atributos }),
  atributosVariacao: (empresa: string, variacao: string, atributos: Atributos) =>
    rpcOpcional<void>('salvar_atributos_variacao', { p_empresa: empresa, p_variacao: variacao, p_atributos: atributos }),
  sugerirProdutosBling: (empresa: string, busca: string) =>
    rpcOpcional<ProdutoBlingSugerido[]>('sugerir_produtos_bling', { p_empresa: empresa, p_busca: busca, p_limite: 8 }),
  vincular: (empresa: string, peca: string, blingId: number | null) =>
    rpcOpcional<ResultadoVinculo>('vincular_peca_bling', { p_empresa: empresa, p_peca: peca, p_bling_id: blingId }),
  criarDeBling: (empresa: string, blingId: number, tipo: string | null) =>
    rpcOpcional<{ peca_id: string; variacoes_criadas: number; avisos: string[] }>('criar_peca_de_produto_bling', { p_empresa: empresa, p_bling_id: blingId, p_tipo: tipo }),
}

// ---------------------------------------------------------------- Lista padrão embutida
// Espelha a carga da migration 0025. Serve só enquanto ela não foi aplicada (a tela avisa); depois disso vale o que está no banco.
const seq = (a: number, b: number, passo = 1) => Array.from({ length: Math.floor((b - a) / passo) + 1 }, (_, i) => a + i * passo)
const vals = (l: (string | number)[]): GradeValor[] => l.map((v, i) => ({ valor: String(v), rotulo: String(v), ordem: i + 1, sinonimos: [] }))
const at = (codigo: string, rotulo: string, nivel: 'peca' | 'variacao', tipo_dado: GradeAtributo['tipo_dado'], extra: Partial<GradeAtributo> = {}): GradeAtributo =>
  ({ codigo, rotulo, nivel, tipo_dado, opcoes: [], unidade: null, obrigatorio: false, ordem: 0, ...extra })
const ROUPA = [at('cor', 'Cor', 'peca', 'texto', { obrigatorio: true }), at('tecido', 'Tecido / composição', 'peca', 'texto'),
  ...['busto', 'cintura', 'quadril', 'comprimento'].map((c) => at(c, c[0].toUpperCase() + c.slice(1), 'variacao', 'numero', { unidade: 'cm' }))]
const base = (codigo: string, nome: string, ordem: number, valores: GradeValor[], atributos: GradeAtributo[], palavras: string[] = [], extra: Partial<TipoGrade> = {}): TipoGrade => ({
  id: `padrao:${codigo}`, codigo, nome, descricao: null, controla_tamanho: true, ordem, ativo: true, em_uso: 0, valores, atributos: atributos.map((a, i) => ({ ...a, ordem: i + 1 })), palavras, ...extra,
})
export const TIPOS_PADRAO: TipoGrade[] = [
  base('roupa_letras', 'Roupa · letras', 10, vals(['PP', 'P', 'M', 'G', 'GG', 'XG']), ROUPA),
  base('roupa_numeracao', 'Roupa · numeração', 20, vals(seq(34, 48, 2)), ROUPA),
  base('calcado', 'Calçado · numeração', 30, vals(seq(33, 43)), [
    at('cor', 'Cor', 'peca', 'texto', { obrigatorio: true }),
    at('modelo', 'Modelo', 'peca', 'lista', { opcoes: ['Tênis', 'Sandália', 'Rasteira', 'Sapatilha', 'Scarpin', 'Bota', 'Mocassim', 'Mule', 'Papete', 'Chinelo', 'Tamanco', 'Outro'] }),
    at('material', 'Material', 'peca', 'lista', { opcoes: ['Couro', 'Sintético', 'Tecido', 'Borracha', 'Camurça', 'Outro'] }),
    at('salto', 'Altura do salto', 'peca', 'numero', { unidade: 'cm' }),
    at('palmilha', 'Comprimento da palmilha', 'variacao', 'numero', { unidade: 'cm' })],
    ['TÊNIS', 'TENIS', 'SAPATO', 'SAPATILHA', 'SANDÁLIA', 'SANDALIA', 'RASTEIRA', 'CHINELO', 'BOTA', 'MULE', 'SCARPIN']),
  base('infantil', 'Infantil · idade', 40, vals([1, 2, 3, 4, 6, 8, 10, 12, 14, 16]), [at('cor', 'Cor', 'peca', 'texto', { obrigatorio: true }), at('altura', 'Altura indicada', 'variacao', 'numero', { unidade: 'cm' })]),
  base('plus_size', 'Plus size', 50, vals(['EXG', 'G1', 'G2', 'G3', 50, 52, 54]), ROUPA),
  base('acessorio', 'Acessório · tamanho único', 60, [{ valor: 'UNICO', rotulo: 'Único', ordem: 1, sinonimos: ['U', 'UN', 'ÚNICO'] }], [
    at('cor', 'Cor', 'peca', 'texto', { obrigatorio: true }), at('material', 'Material', 'peca', 'texto'),
    at('largura', 'Largura', 'peca', 'numero', { unidade: 'cm' }), at('altura', 'Altura', 'peca', 'numero', { unidade: 'cm' })],
    ['BOLSA', 'CINTO', 'ÓCULOS', 'OCULOS', 'BRINCO', 'COLAR', 'CARTEIRA', 'CLUTCH', 'PULSEIRA']),
  base('lote', 'Lote / variados', 70, [{ valor: 'VARIADOS', rotulo: 'Variados', ordem: 1, sinonimos: ['VARIADO', 'DIVERSOS'] }],
    [at('qtd_pecas', 'Quantidade de peças no lote', 'peca', 'numero')], ['LOTE'], { controla_tamanho: false }),
]
export const ehPadrao = (id: string | null | undefined) => !!id && id.startsWith('padrao:')

/** Tipos de grade da empresa; se a migration ainda não existe, cai na lista padrão embutida (`pendente` = true). */
export function useTiposGrade(empresa: string) {
  const r = useCarregar(async () => {
    try { return { tipos: await apiGrades.listar(empresa), pendente: false } } catch (e) {
      if (ehPendente(e)) return { tipos: TIPOS_PADRAO, pendente: true }
      throw e
    }
  }, [empresa])
  return { tipos: r.dados?.tipos ?? null, pendente: r.dados?.pendente ?? false, erro: r.erro, recarregar: r.recarregar }
}

/** Sugere o tipo pela primeira palavra do nome (mesma regra do banco), usado quando o banco ainda não responde. */
export const sugerirLocal = (tipos: TipoGrade[], nome: string): TipoGrade | undefined => {
  const w = nome.trim().split(/\s+/)[0]?.toUpperCase()
  return w ? tipos.find((t) => t.palavras.includes(w)) : undefined
}
export const tamanhoPorBling = (tipo: TipoGrade | undefined, valor: string | null): string | null => {
  if (!valor || !tipo) return valor
  const v = valor.toUpperCase()
  return tipo.valores.find((x) => x.valor === v || x.sinonimos.includes(v))?.valor ?? null
}
