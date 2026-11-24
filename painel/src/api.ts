import { supabase } from './supabase'

export type Papel = 'admin' | 'gestor' | 'suporte' | 'apresentadora' | 'expedicao' | 'financeiro' | 'leitura' | 'superadmin'

export interface Me {
  usuario: { id: string; nome: string; email: string; is_superadmin: boolean } | null
  empresas: { id: string; nome: string; papeis: Papel[] }[]
}
export interface Local { id: string; nome: string; vendavel: boolean; ativo: boolean; qtd_unidades: number }
export interface PecaLinha {
  id: string; codigo: string; nome: string; categoria: string | null; marca: string | null; condicao: 'nova' | 'usada'
  custo: number | null; preco_tabela: number | null; qtd_variacoes: number; qtd_unidades: number; qtd_disponiveis: number
  atualizado_em: string; total: number; foto_capa?: string | null
}
export interface OpcaoCadastro { id: string; nome: string; pecas: number }
export interface UnidadeDet { id: string; codigo: string; estado: string; local_id: string; local_nome: string; observacao: string | null }
export interface PecaDetalhe {
  peca: { id: string; codigo: string; nome: string; descricao: string | null; categoria: string | null; marca: string | null
          condicao: 'nova' | 'usada'; custo: number | null; preco_tabela: number | null; fotos?: unknown; atualizado_em: string
          tipo_grade_id?: string | null; atributos?: Record<string, string | number>; bling_produto_id?: number | null }
  bling?: { bling_id: number; codigo: string | null; nome: string | null; situacao: string | null } | null
  variacoes: { id: string; tamanho: string; codigo: string; atributos?: Record<string, string | number>; bling_variacao_id?: number | null; unidades: UnidadeDet[] }[]
}
export interface UnidadeLinha {
  id: string; codigo: string; estado: string; local_id: string; local_nome: string; variacao_id: string; tamanho: string
  peca_id: string; peca_codigo: string; peca_nome: string; observacao: string | null; criado_em: string; total: number
}
export interface ClienteLinha {
  id: string; nome: string | null; instagram_username: string | null; telefone: string | null; email: string | null
  observacao_interna: string | null; bloqueado_ate: string | null; anonimizado: boolean; criado_em: string; total: number
}

export class ApiError extends Error {
  constructor(message: string, public code?: string) { super(message) }
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (error.code === 'PGRST202') throw new ApiError(`A função "${fn}" ainda não existe no banco (migration pendente).`, error.code)
    if (error.code === 'PGRST106' || /schema must be one of/i.test(error.message)) {
      throw new ApiError('O Data API do Supabase ainda não expõe o schema "api". Ative em Project Settings → API → Exposed schemas.', error.code)
    }
    throw new ApiError(error.message, error.code)
  }
  return data as T
}

const nulo = (v: string | undefined | null) => (v && v.trim() !== '' ? v.trim() : null)
export const numero = (v: string): number | null => {
  const t = v.trim().replace(/\./g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  if (Number.isNaN(n)) throw new ApiError('valor numérico inválido')
  return n
}

async function listaOpcional(fn: string, empresa: string): Promise<OpcaoCadastro[]> {
  try { return await rpc<OpcaoCadastro[]>(fn, { p_empresa: empresa }) } catch (e) {
    if (e instanceof ApiError && (e.code === 'PGRST202' || /ainda não/.test(e.message))) return []
    throw e
  }
}

export const api = {
  me: () => rpc<Me>('me'),
  locais: (empresa: string) => rpc<Local[]>('listar_locais', { p_empresa: empresa }),
  salvarLocal: (empresa: string, d: { id?: string; nome: string; vendavel: boolean; ativo: boolean }) =>
    rpc<string>('salvar_local', { p_empresa: empresa, p_nome: d.nome, p_vendavel: d.vendavel, p_id: d.id ?? null, p_ativo: d.ativo }),
  pecas: (empresa: string, busca: string, offset: number, limite = 50) =>
    rpc<PecaLinha[]>('listar_pecas', { p_empresa: empresa, p_busca: nulo(busca), p_limite: limite, p_offset: offset }),
  peca: (empresa: string, id: string) => rpc<PecaDetalhe>('obter_peca', { p_empresa: empresa, p_peca: id }),
  // Listas sugeridas no formulário (migration 0024). Enquanto ela não existir, a lista vem vazia e o campo continua aceitando texto livre.
  categorias: (empresa: string) => listaOpcional('listar_categorias', empresa),
  marcas: (empresa: string) => listaOpcional('listar_marcas', empresa),
  salvarPeca: (empresa: string, d: { id?: string; codigo: string; nome: string; descricao: string; categoria: string; marca: string
                                    condicao: string; custo: string; preco: string }) =>
    rpc<string>('salvar_peca', { p_empresa: empresa, p_codigo: d.codigo, p_nome: d.nome, p_id: d.id ?? null, p_descricao: nulo(d.descricao),
      p_categoria: nulo(d.categoria), p_marca: nulo(d.marca), p_condicao: d.condicao, p_custo: numero(d.custo), p_preco_tabela: numero(d.preco) }),
  salvarVariacao: (empresa: string, peca: string, tamanho: string) =>
    rpc<string>('salvar_variacao', { p_empresa: empresa, p_peca: peca, p_tamanho: tamanho }),
  criarUnidades: (empresa: string, variacao: string, local: string, quantidade: number, obs: string) =>
    rpc<{ id: string; codigo: string }[]>('criar_unidades', { p_empresa: empresa, p_variacao: variacao, p_local: local,
      p_quantidade: quantidade, p_observacao: nulo(obs) }),
  unidades: (empresa: string, f: { busca: string; estado: string; local: string }, offset: number, limite = 50) =>
    rpc<UnidadeLinha[]>('listar_unidades', { p_empresa: empresa, p_busca: nulo(f.busca), p_estado: nulo(f.estado), p_local: nulo(f.local),
      p_limite: limite, p_offset: offset }),
  clientes: (empresa: string, busca: string, offset: number, limite = 50) =>
    rpc<ClienteLinha[]>('listar_clientes', { p_empresa: empresa, p_busca: nulo(busca), p_limite: limite, p_offset: offset }),
  salvarCliente: (empresa: string, d: { id?: string; nome: string; instagram: string; telefone: string; email: string; obs: string }) =>
    rpc<string>('salvar_cliente', { p_empresa: empresa, p_nome: nulo(d.nome), p_id: d.id ?? null, p_instagram_username: nulo(d.instagram),
      p_telefone: nulo(d.telefone), p_email: nulo(d.email), p_observacao_interna: nulo(d.obs) }),
}

export const brl = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
export const data = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// ---------------------------------------------------------------- Integrações (Configuração > Integrações)
export type ModoIntegracao = 'desligado' | 'simulado' | 'real'
export interface SegredoInfo { nome: string; definido_em: string; expira_em: string | null }
export interface Integracao {
  integracao: string; modo: ModoIntegracao; status: 'nao_configurada' | 'configurada' | 'testada_ok' | 'falhou'
  parametros: Record<string, string>; ultimo_teste_em: string | null; ultimo_teste_ok: boolean | null; ultimo_teste_resumo: string | null
  atualizado_em: string; observacao: string | null; segredos: SegredoInfo[]
}
export interface TesteLinha { em: string; ok: boolean; http_status: number | null; mensagem: string | null; duracao_ms: number | null }
export interface ResultadoTeste { ok: boolean; mensagem: string; aviso: string | null; detalhes: Record<string, unknown>; duracao_ms: number }

// Edge Functions: o valor de um segredo só trafega daqui até a função (HTTPS) e vai direto ao Vault.
async function funcao<T>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  let { data, error } = await supabase.functions.invoke(nome, { body: corpo })
  // Sessão expirada (aba aberta há muito tempo): renova uma vez e tenta de novo.
  if (error && (error as { context?: Response }).context?.status === 401) {
    const r = await supabase.auth.refreshSession()
    if (!r.error && r.data.session) ({ data, error } = await supabase.functions.invoke(nome, { body: corpo }))
    if (error && (error as { context?: Response }).context?.status === 401) throw new ApiError('Sua sessão expirou. Entre novamente para continuar.')
  }
  if (error) {
    let msg = 'Não foi possível concluir a operação.'
    try { const r = (error as { context?: Response }).context; if (r) { if (r.status === 404) msg = `A função "${nome}" ainda não foi publicada no servidor.`; const j = await r.json(); if (j?.erro) msg = String(j.erro) } } catch { /* mantém msg */ }
    throw new ApiError(msg)
  }
  return data as T
}

export const apiIntegracoes = {
  listar: (empresa: string) => rpc<Integracao[]>('listar_integracoes', { p_empresa: empresa }),
  salvar: (empresa: string, integracao: string, parametros: Record<string, string>) =>
    rpc<void>('salvar_integracao', { p_empresa: empresa, p_integracao: integracao, p_parametros: parametros }),
  mudarModo: (empresa: string, integracao: string, modo: ModoIntegracao, motivo?: string) =>
    rpc<void>('mudar_modo_integracao', { p_empresa: empresa, p_integracao: integracao, p_modo: modo, p_motivo: nulo(motivo) }),
  historico: (empresa: string, integracao: string) => rpc<TesteLinha[]>('historico_testes', { p_empresa: empresa, p_integracao: integracao, p_limite: 10 }),
  iniciarOauth: (empresa: string, integracao: string) => rpc<string>('iniciar_oauth', { p_empresa: empresa, p_integracao: integracao }),
  salvarSegredo: (empresa: string, integracao: string, nome: string, valor: string) =>
    funcao<{ ok: boolean }>('integracao-salvar-segredo', { empresa, integracao, nome, valor }),
  testar: (empresa: string, integracao: string) => funcao<ResultadoTeste>('integracao-testar', { empresa, integracao }),
  modelos: (empresa: string, integracao: string) => funcao<{ ok: boolean; mensagem: string; modelos: string[] }>('integracao-testar', { empresa, integracao, acao: 'modelos' }),
}

// ---------------------------------------------------------------- Assistente e permissões por tela
export interface ConfigAssistente { retencao_dias: number; usar_whatsapp: boolean; usar_instagram_dm: boolean; exigir_consentimento: boolean; atualizado_em: string | null }
export type NivelTela = 'nenhum' | 'ver' | 'editar'
export interface TelaDef { tela: string; rotulo: string; grupo: string; ordem: number; situacao: 'ativa' | 'planejada'; nivel_max: NivelTela; aplicacao: string; descricao: string | null }
export interface MatrizPermissoes { papeis: string[]; telas: TelaDef[]; matriz: Record<string, Record<string, NivelTela>> }

export const apiAssistente = {
  obter: (empresa: string) => rpc<ConfigAssistente>('obter_config_assistente', { p_empresa: empresa }),
  salvar: (empresa: string, d: Partial<Omit<ConfigAssistente, 'atualizado_em'>>) => rpc<void>('salvar_config_assistente', { p_empresa: empresa, p_dados: d }),
}
export const apiPermissoes = {
  minhas: (empresa: string) => rpc<Record<string, NivelTela>>('minhas_permissoes', { p_empresa: empresa }),
  listar: (empresa: string) => rpc<MatrizPermissoes>('listar_permissoes', { p_empresa: empresa }),
  salvar: (empresa: string, itens: { tela: string; papel: string; nivel: NivelTela }[]) => rpc<number>('salvar_permissoes', { p_empresa: empresa, p_itens: itens }),
  restaurar: (empresa: string) => rpc<void>('restaurar_permissoes_padrao', { p_empresa: empresa }),
}

// ---------------------------------------------------------------- Espelho Bling (produtos e notas)
export interface ProdutoBlingLinha {
  bling_id: number; formato: string | null; situacao: string | null; pai_id: number | null; codigo: string | null
  nome_cru: string | null; nome_padrao: string | null; ref_fornecedor: string | null; grade_valor_cru: string | null
  grade_valor_padrao: string | null; grade_grupo: string | null; preco: number | null; custo_cru: number | null
  alertas: string[]; status_padronizacao: string; id_ativo_equivalente: number | null; total: number
}
export interface ResumoProdutosBling {
  total: number; por_situacao: Record<string, number>; por_formato: Record<string, number>; por_status: Record<string, number>
  por_grade: Record<string, number>; por_alerta: Record<string, number>
}
export interface ProdutoBlingDetalhe {
  produto: Record<string, unknown>; bruto_lista: Record<string, unknown> | null; bruto_detalhe: Record<string, unknown> | null
  variacoes: { bling_id: number; codigo: string | null; grade: string | null; situacao: string | null }[]
}
export interface NfeLinha {
  bling_id: number; numero: string | null; serie: number | null; situacao: number | null; situacao_rotulo: string | null
  loja_id: number | null; data_emissao: string | null; valor_nota: number | null; contato_bling_id: number | null
  contato_nome: string | null; qtd_itens: number | null; tem_detalhe: boolean; tem_xml: boolean; total: number
}
export interface LinkDanfe { pdf: string | null; danfe: string | null }
export interface NfeDetalhe { nota: Record<string, unknown>; itens: Record<string, unknown>[] }
export interface FiltroProdutoBling { busca: string; situacao: string; formato: string; grade: string; alerta: string }

export const apiBling = {
  produtos: (empresa: string, f: FiltroProdutoBling, offset: number, limite = 50) =>
    rpc<ProdutoBlingLinha[]>('listar_produtos_bling', { p_empresa: empresa, p_busca: nulo(f.busca), p_situacao: nulo(f.situacao),
      p_formato: nulo(f.formato), p_grade: nulo(f.grade), p_alerta: nulo(f.alerta), p_limite: limite, p_offset: offset }),
  resumoProdutos: (empresa: string) => rpc<ResumoProdutosBling>('resumo_produtos_bling', { p_empresa: empresa }),
  produto: (empresa: string, id: number) => rpc<ProdutoBlingDetalhe | null>('obter_produto_bling', { p_empresa: empresa, p_bling_id: id }),
  // Datas só vão na chamada quando há filtro: sem período, a função antiga (5 parâmetros) continua atendendo (migration 0038 adiciona p_data_ini/p_data_fim).
  notas: (empresa: string, busca: string, situacao: string, offset: number, limite = 50, dataIni = '', dataFim = '') =>
    rpc<NfeLinha[]>('listar_nfe_bling', { p_empresa: empresa, p_busca: nulo(busca), p_situacao: situacao ? Number(situacao) : null, p_limite: limite, p_offset: offset,
      ...(dataIni || dataFim ? { p_data_ini: dataIni || null, p_data_fim: dataFim || null } : {}) }),
  nota: (empresa: string, id: number) => rpc<NfeDetalhe | null>('obter_nfe_bling', { p_empresa: empresa, p_bling_id: id }),
  linkDanfe: (empresa: string, id: number) => rpc<LinkDanfe | null>('obter_link_danfe_nfe_bling', { p_empresa: empresa, p_bling_id: id }),
  reprocessar: (empresa: string) => rpc<Record<string, number>>('reprocessar_bling', { p_empresa: empresa }),
}

// ---------------------------------------------------------------- Parceiros (cadastro oficial único) e amarração com o Bling
export interface ParceiroLinha {
  id: string; nome: string; tipo_pessoa: string | null; ativo: boolean; papeis: string[] | null; identificadores: string[] | null
  qtd_contatos_bling: number; tem_revisao: boolean; criado_em: string; total: number
}
export interface VinculoLinha {
  bling_id: number; nome_cru: string | null; nome_padrao: string | null; situacao: string | null; documento_ultimos: string | null
  documento_valido: boolean | null; handle_social: string | null; telefone: string | null; criterio: string; status: string
  motivo: string | null; decidido_por: string; decidido_em: string
}
export interface PendenteLinha {
  bling_id: number; nome_cru: string | null; situacao: string | null; documento_ultimos: string | null; documento_valido: boolean | null
  handle_social: string | null; status: string; motivo: string | null; parceiro_id: string | null; parceiro_nome: string | null; total: number
}
export interface ContatoParceiro extends VinculoLinha {
  inativo: boolean; principal: boolean; completude: number; mais_recente: boolean; mais_completo: boolean
  qtd_notas: number | null; legado?: boolean
}
export interface NotaParceiro {
  bling_id: number; numero: string; serie: number | null; tipo: number | null; situacao: number; situacao_rotulo: string | null
  data_emissao: string | null; valor_nota: number | null; valor_frete: number | null; qtd_itens: number | null; tem_detalhe: boolean
  contato_bling_id: number | null; contato_nome: string | null; total: number
}
export interface ResumoNotasParceiro {
  qtd_notas: number; qtd_sem_detalhe: number; qtd_desconsideradas: number; valor_total: number; ticket_medio: number | null
  primeira: string | null; ultima: string | null; por_situacao: Record<string, number>
}
export interface DocumentoParceiro { tipo: 'cpf' | 'cnpj' | 'outro'; numero: string; valido: boolean; confere_identificador: boolean; bling_ids: number[] }
export interface ReceitaCnpj {
  cnpj: string; nome: string | null; fantasia: string | null; situacao: string | null; data_situacao: string | null; abertura: string | null
  porte: string | null; natureza_juridica: string | null; atividade_principal: string | null; logradouro: string | null; numero: string | null
  complemento: string | null; bairro: string | null; municipio: string | null; uf: string | null; cep: string | null; telefone: string | null
  email: string | null; ultima_atualizacao: string | null
}
// Consulta de CNPJ na ReceitaWS (Edge Function consulta-receita). CPF não tem consulta: só validação dos dígitos.
export const apiReceita = {
  consultarCnpj: (empresa: string, cnpj: string) => funcao<ReceitaCnpj>('consulta-receita', { empresa, cnpj }),
}
export interface FiltroParceiro { busca: string; papel: string; ativo: string; tipo: string; minContatos: string; soRevisao: boolean }
export const apiParceiros = {
  listar: (empresa: string, f: FiltroParceiro, offset: number, limite = 50) =>
    rpc<ParceiroLinha[]>('listar_parceiros', { p_empresa: empresa, p_busca: nulo(f.busca), p_papel: nulo(f.papel),
      p_ativo: f.ativo === '' ? null : f.ativo === 'sim', p_tipo_pessoa: nulo(f.tipo), p_min_contatos: f.minContatos ? Number(f.minContatos) : null,
      p_so_revisao: f.soRevisao, p_limite: limite, p_offset: offset }),
  vinculos: (empresa: string, parceiro: string) => rpc<VinculoLinha[]>('obter_parceiro_vinculos', { p_empresa: empresa, p_parceiro: parceiro }),
  // Contatos com indicadores de repetidos (principal, mais recente, mais completo). Se a migration 0024 ainda não foi aplicada, cai no modo antigo.
  // Documento completo (só admin, gestor e suporte; cada consulta é registrada no banco).
  documentos: (empresa: string, parceiro: string) =>
    rpc<DocumentoParceiro[]>('obter_documento_parceiro', { p_empresa: empresa, p_parceiro: parceiro }),
  contatos: async (empresa: string, parceiro: string): Promise<ContatoParceiro[]> => {
    try { return await rpc<ContatoParceiro[]>('obter_parceiro_contatos', { p_empresa: empresa, p_parceiro: parceiro }) }
    catch (e) {
      if (!(e instanceof ApiError) || (e.code !== 'PGRST202' && e.code !== '42883')) throw e
      const v = await rpc<VinculoLinha[]>('obter_parceiro_vinculos', { p_empresa: empresa, p_parceiro: parceiro })
      const base = v.map((c) => {
        const inativo = (c.situacao ?? 'A') !== 'A'
        const completude = (c.documento_valido ? 1 : 0) + (c.handle_social ? 1 : 0) + (c.telefone ? 1 : 0) + (inativo ? 0 : 1)
        return { ...c, inativo, principal: false, completude, mais_recente: false, mais_completo: false, qtd_notas: null, legado: true }
      })
      const rec = [...base].sort((a, b) => Number(a.inativo) - Number(b.inativo) || b.bling_id - a.bling_id)[0]
      const comp = [...base].sort((a, b) => b.completude - a.completude || Number(a.inativo) - Number(b.inativo) || b.bling_id - a.bling_id)[0]
      return base.map((c) => ({ ...c, mais_recente: c === rec, mais_completo: c === comp }))
    }
  },
  definirPrincipal: (empresa: string, parceiro: string, blingId: number | null) =>
    rpc<null>('definir_contato_principal', { p_empresa: empresa, p_parceiro: parceiro, p_bling_id: blingId }),
  notas: (empresa: string, parceiro: string, offset: number, limite = 20) =>
    rpc<NotaParceiro[]>('listar_notas_parceiro', { p_empresa: empresa, p_parceiro: parceiro, p_limite: limite, p_offset: offset }),
  resumoNotas: async (empresa: string, parceiro: string) =>
    (await rpc<ResumoNotasParceiro[]>('resumo_notas_parceiro', { p_empresa: empresa, p_parceiro: parceiro }))[0] ?? null,
  pendentes: (empresa: string, status: string, busca: string, offset: number, limite = 50) =>
    rpc<PendenteLinha[]>('listar_amarracoes_pendentes', { p_empresa: empresa, p_status: status, p_busca: nulo(busca), p_limite: limite, p_offset: offset }),
}

// ---------------------------------------------------------------- Base de conhecimento do assistente (RAG)
export interface ResumoConhecimento { fontes: number; trechos: number; prontos: number; pendentes: number; falhos: number; ultimo_erro: string | null; modelos: string[] }
export interface FonteConhecimento {
  id: string; titulo: string; tipo: string; sensibilidade: 'baixa' | 'media' | 'alta'; ativa: boolean; origem: string | null
  versao: number | null; tamanho: number | null; atualizado_em: string; mascarados: { cpf?: number; email?: number; telefone?: number } | null; trechos: number; prontos: number
}
export interface AchadoConhecimento { chunk_id: string; fonte_id: string; fonte_titulo: string; titulo: string; conteudo: string; score: number; origem: ('texto' | 'vetor')[] }
export const apiConhecimento = {
  listar: (empresa: string) => rpc<{ resumo: ResumoConhecimento; fontes: FonteConhecimento[] }>('listar_fontes', { p_empresa: empresa }),
  alternar: (empresa: string, fonte: string, ativa: boolean) => rpc<void>('alternar_fonte', { p_empresa: empresa, p_fonte: fonte, p_ativa: ativa }),
  indexar: (empresa: string, d: { titulo: string; texto: string; tipo: string; sensibilidade: string; origem?: string }) =>
    funcao<{ ok: boolean; estado: 'criada' | 'atualizada' | 'sem_mudanca'; trechos?: number; reaproveitados?: number; pendentes?: number; mascarados?: { cpf: number; email: number; telefone: number } }>('conhecimento', { empresa, acao: 'indexar', ...d }),
  processar: (empresa: string, reabrir = false) =>
    funcao<{ ok: boolean; motivo?: string; gravados?: number; aguardar_s?: number | null; erro?: string | null; resumo: ResumoConhecimento | null }>('conhecimento', { empresa, acao: 'processar', reabrir }),
  historico: (empresa: string) => rpc<{ pergunta: string; em: string; achados: number }[]>('historico_perguntas', { p_empresa: empresa, p_limite: 12 }),
  limparHistorico: (empresa: string) => rpc<number>('limpar_historico_perguntas', { p_empresa: empresa }),
  buscar: (empresa: string, pergunta: string) =>
    funcao<{ ok: boolean; modo: 'text' | 'vector' | 'hybrid'; aviso: string | null; resultados: AchadoConhecimento[] }>('conhecimento', { empresa, acao: 'buscar', pergunta }),
}

export interface NotaCliente { bling_id: string; numero: string; data_emissao: string | null; situacao: number; situacao_rotulo: string; valor_nota: number | null; qtd_itens: number | null; tem_detalhe: boolean; itens: { descricao: string; grade: string | null; quantidade: number | null; valor: number | null }[] }
export interface ClienteVendas {
  parceiro_id: string; nome: string; instagram: string[]
  resumo: { qtd_notas: number; qtd_validas: number; qtd_canceladas: number; qtd_sem_detalhe: number; primeira: string | null; ultima: string | null; valor_total: number | null; ticket_medio: number | null }
  notas: NotaCliente[]
}
export interface VendasCliente { ok: boolean; motivo?: string; ve_valores: boolean; base_ate: string | null; base_notas: number; base_com_detalhe: number; mais_candidatos: boolean; clientes: ClienteVendas[] }
export interface NotaPeriodo { bling_id: string; numero: string; data_emissao: string | null; situacao: number; situacao_rotulo: string; cliente: string | null; valor_nota: number | null; tem_detalhe: boolean }
export interface NotasPeriodo {
  ok: boolean; ve_valores: boolean; de: string | null; ate: string | null
  qtd_notas: number; qtd_validas: number; qtd_canceladas: number; qtd_sem_valor: number; valor_total: number | null
  base_ate: string | null; base_notas: number; base_com_detalhe: number; primeira_nota: string | null; notas: NotaPeriodo[]
}
// Vendas = pedidos de venda do Bling (migration 0046); recebimento vem das contas a receber ligadas ao pedido.
export type Recebimento = 'recebido' | 'parcial' | 'em_aberto' | 'sem_conta'
export interface PedidoPeriodo { bling_id: string; numero: number | null; data: string | null; situacao: number | null; situacao_rotulo: string; cliente: string; valor: number | null; recebimento: Recebimento }
export interface FatiaRecebimento { qtd: number; valor: number | null }
export interface VendasPeriodo {
  ok: boolean; ve_valores: boolean; de: string | null; ate: string | null
  qtd_pedidos: number; qtd_validas: number; qtd_canceladas: number; valor_total: number | null
  recebimento: Record<Recebimento, FatiaRecebimento>
  devolucoes: { qtd_notas: number; valor: number | null }
  base_ate: string | null; base_pedidos: number; primeira_data: string | null; contas_desde: string | null; carga_em_andamento: boolean
  pedidos: PedidoPeriodo[]
}
// Margem bruta (migration 0060): valores nulos para quem não é admin/gestor/financeiro; cobertura = pedidos do período que já têm os itens lidos.
export interface MargemBruta {
  ok: boolean; ve_valores: boolean; de: string | null; ate: string | null
  receita_itens: number | null; custo_total: number | null; margem_bruta: number | null; margem_pct: number | null
  pedidos_validos_no_periodo: number; pedidos_com_itens: number; cobertura_pct: number; cobertura_baixa: boolean; itens_sem_custo: number; aviso: string
}
export interface PedidosDetalhe { ok: boolean; motivo?: string; ve_valores: boolean; qtd: number; valor_total: number | null; pedidos: PedidoPeriodo[] }
export interface LinhaSerieVendas { chave: string; rotulo: string; qtd: number; valor: number | null; qtd_sem_valor?: number; de?: string; ate?: string; outros?: boolean; valida?: boolean }
export interface SerieVendas {
  ok: boolean; motivo?: string; ve_valores: boolean; de: string; ate: string; dimensao: string; dimensao_pedida: string
  base_ate: string | null; base_pedidos: number; primeira_data: string | null; contas_desde: string | null; carga_em_andamento: boolean
  qtd_pedidos: number; qtd_validas: number; qtd_canceladas: number; valor_total: number | null; linhas: LinhaSerieVendas[]
}
export interface AnaliseIA { ok: boolean; motivo?: string; modo?: string; texto?: string; sugestoes?: string[] }
export interface InterpretacaoIA { ok: boolean; motivo?: string; modo?: string; ficha?: import('./intencao').FichaIA }
export const apiConversas = {
  salvarTurno: (empresa: string, conversa: string | null, pergunta: string, contexto: Record<string, unknown>) =>
    rpc<{ ok: boolean; conversa_id: string; ordem?: number; motivo?: string }>('salvar_turno', { p_empresa: empresa, p_conversa: conversa, p_pergunta: pergunta, p_contexto: contexto }),
  avaliar: (empresa: string, conversa: string, ordem: number, avaliacao: 'util' | 'errado', observacao?: string) =>
    rpc<{ ok: boolean }>('avaliar_turno', { p_empresa: empresa, p_conversa: conversa, p_ordem: ordem, p_avaliacao: avaliacao, p_observacao: observacao ?? null }),
}
export const apiAssistenteIA = {
  interpretar: (empresa: string, pergunta: string, hoje: string, contexto?: { rotulo: string; dimensao: string; metrica: string }) =>
    funcao<InterpretacaoIA>('assistente-ia', { empresa, acao: 'interpretar', pergunta, hoje, contexto }),
  analisar: (empresa: string, d: { pergunta: string; periodo: string; dimensao: string; metrica: string; linhas: { ref: string; qtd: number; valor: number | null }[]; avisos: string[]; resumo: { qtd_validas: number; qtd_canceladas: number; valor_total: number | null } }) =>
    funcao<AnaliseIA>('assistente-ia', { empresa, acao: 'analisar', ...d }),
}
export const apiAssistenteDados = {
  vendasPeriodo: (empresa: string, de: string | null, ate: string | null, limite = 10) =>
    rpc<VendasPeriodo>('assistente_vendas_periodo', { p_empresa: empresa, p_de: de, p_ate: ate, p_limite: limite }),
  serieVendas: (empresa: string, de: string | null, ate: string | null, dimensao: string, limite = 10) =>
    rpc<SerieVendas>('assistente_serie_vendas', { p_empresa: empresa, p_de: de, p_ate: ate, p_dimensao: dimensao, p_limite: limite }),
  pedidosDetalhe: (empresa: string, de: string | null, ate: string | null, filtro: string | null, valor: string | null, limite = 30) =>
    rpc<PedidosDetalhe>('assistente_pedidos_detalhe', { p_empresa: empresa, p_de: de, p_ate: ate, p_filtro: filtro, p_valor: valor, p_limite: limite }),
  margem: (empresa: string, de: string | null, ate: string | null) =>
    rpc<MargemBruta>('assistente_margem', { p_empresa: empresa, p_de: de, p_ate: ate }),
  notasPeriodo: (empresa: string, de: string | null, ate: string | null, limite = 10) =>
    rpc<NotasPeriodo>('assistente_notas_periodo', { p_empresa: empresa, p_de: de, p_ate: ate, p_limite: limite }),
  vendasCliente: (empresa: string, busca: string) => rpc<VendasCliente>('assistente_vendas_cliente', { p_empresa: empresa, p_busca: busca, p_limite: 10 }),
  registrar: (empresa: string, pergunta: string) => rpc<void>('registrar_pergunta_dados', { p_empresa: empresa, p_pergunta: pergunta }),
}

// ---------------------------------------------------------------- Usuários, grupos de acesso e convites (migration 0039)
export interface GrupoAcesso { id: string; nome: string; descricao: string | null; papeis: string[]; ativo: boolean; sistema: boolean; membros: number }
export interface UsuarioAcesso {
  id: string; nome: string; email: string; superadmin: boolean; papeis: string[]; grupos: { id: string; nome: string }[]
  papeis_efetivos: string[]; status: 'ativo' | 'convidado' | 'aguardando_senha' | 'desativado'; ultimo_acesso: string | null
}
export interface ConviteLinha { id: string; nome: string; email: string; papeis: string[]; grupos: string[]; criado_em: string; expira_em: string; expirado: boolean; reenvios: number; link_aberto: boolean }
export interface ResultadoConvite { ok: boolean; enviado: boolean; link?: string; aviso?: string }

export const apiUsuarios = {
  listar: (empresa: string) => rpc<{ usuarios: UsuarioAcesso[]; convites: ConviteLinha[] }>('listar_usuarios', { p_empresa: empresa }),
  grupos: (empresa: string) => rpc<GrupoAcesso[]>('listar_grupos', { p_empresa: empresa }),
  salvarGrupo: (empresa: string, d: { id?: string; nome: string; descricao: string; papeis: string[]; ativo: boolean }) =>
    rpc<string>('salvar_grupo', { p_empresa: empresa, p_id: d.id ?? null, p_nome: d.nome, p_descricao: nulo(d.descricao), p_papeis: d.papeis, p_ativo: d.ativo }),
  excluirGrupo: (empresa: string, id: string) => rpc<void>('excluir_grupo', { p_empresa: empresa, p_id: id }),
  definirAcesso: (empresa: string, usuario: string, papeis: string[], grupos: string[], ativo: boolean) =>
    rpc<void>('definir_acesso_usuario', { p_empresa: empresa, p_usuario: usuario, p_papeis: papeis, p_grupos: grupos, p_ativo: ativo }),
  // Cria o convite no banco e pede à Edge Function para gerar o link e enviar o e-mail.
  convidar: async (empresa: string, d: { email: string; nome: string; papeis: string[]; grupos: string[] }): Promise<ResultadoConvite> => {
    const r = await rpc<{ convite_id: string }>('convidar_usuario', { p_empresa: empresa, p_email: d.email, p_nome: d.nome, p_papeis: d.papeis, p_grupos: d.grupos })
    return funcao<ResultadoConvite>('usuario-convidar', { empresa, convite: r.convite_id })
  },
  revogar: (empresa: string, convite: string) => rpc<void>('revogar_convite', { p_empresa: empresa, p_convite: convite }),
}

// ---------------------------------------------------------------- Central de governança (migration 0054)
export type TipoGov = 'duvida' | 'ocorrencia' | 'sugestao'
export type EstadoGov = 'aberto' | 'em_analise' | 'resolvido' | 'descartado'
export interface ItemGov {
  id: string; tipo: TipoGov; titulo: string; descricao: string; tela: string | null; tela_rotulo: string | null
  severidade: string | null; estado: EstadoGov; origem: 'usuario' | 'sistema'
  criado_em: string; criado_por_nome: string | null
  atualizado_em: string | null; resolucao: string | null; resolvido_por_nome: string | null; resolvido_em: string | null
}
export interface ResumoGov { aberto: number; em_analise: number; resolvido: number; descartado: number; total: number }
export interface ListaGov { resumo: ResumoGov; itens: ItemGov[] }
export interface FiltroGov { tipo?: string; estado?: string; busca?: string }

export const apiGovernanca = {
  // Qualquer pessoa da empresa pode registrar (não depende da permissão da tela de governança).
  registrar: (empresa: string, d: { tela: string | null; tipo: TipoGov; titulo: string; descricao: string; severidade: string | null }) =>
    rpc<string>('governanca_registrar', { p_empresa: empresa, p_tela: d.tela, p_tipo: d.tipo, p_titulo: d.titulo, p_descricao: d.descricao, p_severidade: d.severidade }),
  listar: (empresa: string, f: FiltroGov = {}) =>
    rpc<ListaGov>('governanca_listar', { p_empresa: empresa, p_tipo: nulo(f.tipo), p_estado: nulo(f.estado), p_busca: nulo(f.busca) }),
  atualizar: (empresa: string, id: string, d: { estado: EstadoGov; resolucao?: string | null }) =>
    rpc<void>('governanca_atualizar', { p_empresa: empresa, p_id: id, p_estado: d.estado, p_resolucao: nulo(d.resolucao ?? undefined) }),
}

// ---------------------------------------------------------------- Faixa informativa (migration 0055)
export interface FaixaNoticia { id: string; titulo: string; link: string; veiculo: string; publicado_em: string }
export interface FaixaCotacao { valor: number; variacao_pct: number | null; referencia_em: string | null; origem: 'ptax' | 'awesomeapi' | null; ok_em: string | null }
export interface FaixaDados {
  ativa: boolean; mostrar_hora?: boolean; mostrar_dolar?: boolean; mostrar_noticias?: boolean; segundos?: number
  cotacao?: FaixaCotacao | null; noticias?: FaixaNoticia[]
}
export interface FaixaConfig {
  ativa: boolean; mostrar_hora: boolean; mostrar_dolar: boolean; mostrar_noticias: boolean; segundos: number; idade_max_dias: number
  palavras_chave: string[]; palavras_bloqueio: string[]; veiculos_permitidos: string[]
}
export interface FaixaFonte {
  id: string; nome: string; url: string; ativa: boolean; filtrar_veiculo: boolean; exigir_palavra: boolean; intervalo_min: number
  ultimo_ok_em: string | null; ultimo_erro: string | null; itens_lidos: number; itens_aceitos: number
}
export interface FaixaAdmin {
  config: FaixaConfig
  cotacao: (FaixaCotacao & { erro: string | null }) | null
  fontes: FaixaFonte[]
  noticias: (FaixaNoticia & { oculta: boolean })[]
}

export const apiFaixa = {
  obter: (empresa: string) => rpc<FaixaDados>('faixa_obter', { p_empresa: empresa }),
  config: (empresa: string) => rpc<FaixaAdmin>('faixa_config_obter', { p_empresa: empresa }),
  salvar: (empresa: string, d: Partial<FaixaConfig>) => rpc<void>('faixa_config_salvar', { p_empresa: empresa, p_dados: d }),
  restaurarListas: (empresa: string) => rpc<void>('faixa_restaurar_listas', { p_empresa: empresa }),
  salvarFonte: (empresa: string, f: { id: string | null; nome: string; url: string; ativa: boolean; filtrar_veiculo: boolean; exigir_palavra: boolean; intervalo_min: number }) =>
    rpc<string>('faixa_fonte_salvar', { p_empresa: empresa, p_id: f.id, p_nome: f.nome, p_url: f.url, p_ativa: f.ativa, p_filtrar_veiculo: f.filtrar_veiculo, p_exigir_palavra: f.exigir_palavra, p_intervalo_min: f.intervalo_min }),
  excluirFonte: (empresa: string, id: string) => rpc<void>('faixa_fonte_excluir', { p_empresa: empresa, p_id: id }),
  ocultar: (empresa: string, id: string, oculta: boolean) => rpc<void>('faixa_noticia_ocultar', { p_empresa: empresa, p_id: id, p_oculta: oculta }),
  atualizarAgora: (empresa: string) => rpc<void>('faixa_atualizar_agora', { p_empresa: empresa }),
}

// ---------------------------------------------------------------- Painel de Gestão: api.gestao_* (vendas, canais, detalhe, financeiro)
export type GestaoBase = 'pedido' | 'nota'
export type GestaoTipo = 'venda' | 'cancelamento' | 'devolucao'
export interface GestaoBloco { qtd: number; valor: number | null; qtd_ant: number; valor_ant: number | null; var_qtd?: number | null; var_valor?: number | null }
export interface GestaoResumo {
  ok: boolean; motivo?: string; ve_valores: boolean; base: GestaoBase
  periodo: { de: string; ate: string; dias: number }; periodo_anterior: { de: string; ate: string }
  primeira_nota: string | null; base_ate: string | null
  faturamento: GestaoBloco; devolucoes: GestaoBloco; cancelamentos: GestaoBloco
  venda_liquida: { valor: number | null; valor_ant: number | null; var_valor: number | null }
  ticket_medio: number | null; taxa_devolucao: number | null; taxa_cancelamento: number | null
  waterfall: { etapa: string; valor: number | null; total?: boolean }[]
}
export interface GestaoLinha {
  chave: string; rotulo: string; de: string; ate: string
  venda_qtd: number; venda_valor: number | null; cancelamento_qtd: number; cancelamento_valor: number | null
  devolucao_qtd: number; devolucao_valor: number | null
}
export interface GestaoSerie { ok: boolean; motivo?: string; ve_valores: boolean; base: GestaoBase; de: string; ate: string; granularidade: 'dia' | 'semana' | 'mes'; granularidade_pedida: string; linhas: GestaoLinha[] }
export interface GestaoCanalLinha { canal: string; rotulo: string; qtd: number; valor: number | null; cancelados: number; qtd_ant: number; valor_ant: number | null; var_valor: number | null; var_qtd: number | null }
export interface GestaoPorCanal { ok: boolean; motivo?: string; ve_valores: boolean; base: GestaoBase; lojas_nao_mapeadas: number; linhas: GestaoCanalLinha[] }
export interface GestaoLancamento { id: string; numero: string; data: string; cliente: string; canal: string | null; canal_rotulo: string; situacao: string; valor: number | null; recebimento: string | null }
export interface GestaoLancamentos { ok: boolean; motivo?: string; ve_valores: boolean; base: GestaoBase; tipo: GestaoTipo; canal: string | null; de: string; ate: string; qtd: number; valor_total: number | null; limite: number; itens: GestaoLancamento[] }
export interface GestaoCanaisConfig { ok: boolean; canais: { canal: string; rotulo: string }[]; lojas: { loja_id: string; pedidos: number; valor: number; ultima: string | null; canal: string; mapeada: boolean }[] }
export interface FinCard { qtd: number; valor: number; atraso_qtd?: number; atraso_valor?: number }
export interface GestaoFinLinha {
  chave: string; rotulo: string; de: string; ate: string
  entradas: number; entradas_real: number; entradas_prev: number; saidas: number; saidas_real: number; saidas_prev: number
  saldo: number; desencaixe: boolean; saida_maior: boolean
}
export interface GestaoFinanceiro {
  ok: boolean; motivo?: string; de: string; ate: string; granularidade: 'dia' | 'semana' | 'mes'; granularidade_pedida: string; hoje: string
  saldo_inicial: { informado: boolean; valor: number | null; data: string | null }
  saldo_abertura: number; saldo_final: number; primeiro_desencaixe: string | null; menor_saldo: { valor: number; rotulo: string } | null
  cards: { a_pagar: FinCard; pago: FinCard; a_receber: FinCard; recebido: FinCard }
  vencidos_antes: { receber_qtd: number; receber_valor: number; pagar_qtd: number; pagar_valor: number }
  linhas: GestaoFinLinha[]
}
export interface GestaoTitulo { lado: 'pagar' | 'receber'; id: string; status: 'aberto' | 'liquidado'; situacao: string; data: string; vencimento: string; valor: number; contato: string; origem: string; categoria: string | null; data_aproximada: boolean }
export interface GestaoTitulos { ok: boolean; motivo?: string; de: string; ate: string; lado: string; status: string; qtd: number; total_pagar: number; total_receber: number; limite: number; itens: GestaoTitulo[] }
export const apiGestao = {
  resumo: (empresa: string, de: string | null, ate: string | null, base: GestaoBase) => rpc<GestaoResumo>('gestao_resumo', { p_empresa: empresa, p_de: de, p_ate: ate, p_base: base }),
  serie: (empresa: string, de: string | null, ate: string | null, granularidade: 'dia' | 'semana' | 'mes', base: GestaoBase) =>
    rpc<GestaoSerie>('gestao_serie', { p_empresa: empresa, p_de: de, p_ate: ate, p_granularidade: granularidade, p_base: base }),
  porCanal: (empresa: string, de: string | null, ate: string | null, base: GestaoBase) => rpc<GestaoPorCanal>('gestao_por_canal', { p_empresa: empresa, p_de: de, p_ate: ate, p_base: base }),
  lancamentos: (empresa: string, de: string, ate: string, tipo: GestaoTipo, canal: string | null, base: GestaoBase, limite = 200) =>
    rpc<GestaoLancamentos>('gestao_lancamentos', { p_empresa: empresa, p_de: de, p_ate: ate, p_tipo: tipo, p_canal: canal, p_base: base, p_limite: limite }),
  canaisConfig: (empresa: string) => rpc<GestaoCanaisConfig>('gestao_canais_config', { p_empresa: empresa }),
  salvarCanal: (empresa: string, loja: string, canal: string) => rpc<{ ok: boolean }>('gestao_salvar_canal', { p_empresa: empresa, p_loja: loja, p_canal: canal }),
  financeiro: (empresa: string, de: string | null, ate: string | null, granularidade: 'dia' | 'semana' | 'mes') =>
    rpc<GestaoFinanceiro>('gestao_financeiro', { p_empresa: empresa, p_de: de, p_ate: ate, p_granularidade: granularidade }),
  titulos: (empresa: string, de: string, ate: string, lado: 'todos' | 'pagar' | 'receber', status: 'todos' | 'aberto' | 'liquidado', limite = 300) =>
    rpc<GestaoTitulos>('gestao_titulos', { p_empresa: empresa, p_de: de, p_ate: ate, p_lado: lado, p_status: status, p_limite: limite }),
  salvarSaldo: (empresa: string, valor: number | null, data: string | null) => rpc<{ ok: boolean }>('gestao_salvar_saldo', { p_empresa: empresa, p_valor: valor, p_data: data }),
}
