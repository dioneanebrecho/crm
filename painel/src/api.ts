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
export const apiAssistenteDados = {
  notasPeriodo: (empresa: string, de: string | null, ate: string | null, limite = 10) =>
    rpc<NotasPeriodo>('assistente_notas_periodo', { p_empresa: empresa, p_de: de, p_ate: ate, p_limite: limite }),
  vendasCliente: (empresa: string, busca: string) => rpc<VendasCliente>('assistente_vendas_cliente', { p_empresa: empresa, p_busca: busca, p_limite: 10 }),
  registrar: (empresa: string, pergunta: string) => rpc<void>('registrar_pergunta_dados', { p_empresa: empresa, p_pergunta: pergunta }),
}
