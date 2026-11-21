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
  atualizado_em: string; total: number
}
export interface UnidadeDet { id: string; codigo: string; estado: string; local_id: string; local_nome: string; observacao: string | null }
export interface PecaDetalhe {
  peca: { id: string; codigo: string; nome: string; descricao: string | null; categoria: string | null; marca: string | null
          condicao: 'nova' | 'usada'; custo: number | null; preco_tabela: number | null; atualizado_em: string }
  variacoes: { id: string; tamanho: string; codigo: string; unidades: UnidadeDet[] }[]
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

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (error.code === 'PGRST106' || error.code === 'PGRST202' || /schema must be one of/i.test(error.message)) {
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

export const api = {
  me: () => rpc<Me>('me'),
  locais: (empresa: string) => rpc<Local[]>('listar_locais', { p_empresa: empresa }),
  salvarLocal: (empresa: string, d: { id?: string; nome: string; vendavel: boolean; ativo: boolean }) =>
    rpc<string>('salvar_local', { p_empresa: empresa, p_nome: d.nome, p_vendavel: d.vendavel, p_id: d.id ?? null, p_ativo: d.ativo }),
  pecas: (empresa: string, busca: string, offset: number, limite = 50) =>
    rpc<PecaLinha[]>('listar_pecas', { p_empresa: empresa, p_busca: nulo(busca), p_limite: limite, p_offset: offset }),
  peca: (empresa: string, id: string) => rpc<PecaDetalhe>('obter_peca', { p_empresa: empresa, p_peca: id }),
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
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo })
  if (error) {
    let msg = 'Não foi possível concluir a operação.'
    try { const r = (error as { context?: Response }).context; if (r) { const j = await r.json(); if (j?.erro) msg = String(j.erro) } } catch { /* mantém msg */ }
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
}
