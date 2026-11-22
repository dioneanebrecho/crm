import { supabase } from './supabase'
import { ApiError, rpc } from './api'

// ---------------------------------------------------------------- Fotos da peça
// Arquivos ficam no Supabase Storage (depósito "pecas-fotos", público para leitura) e a lista de fotos fica em catalogo.cad_peca.fotos.
export interface Foto { url: string; path: string }

export const normalizarFotos = (raw: unknown): Foto[] =>
  Array.isArray(raw)
    ? raw.flatMap((x): Foto[] => {
        if (typeof x === 'string') return [{ url: x, path: '' }]
        const o = x as Record<string, unknown> | null
        return o && typeof o.url === 'string' ? [{ url: o.url, path: typeof o.path === 'string' ? o.path : '' }] : []
      })
    : []

const BUCKET = 'pecas-fotos'
const PENDENTE = 'Recurso ainda não habilitado no banco (aguardando a migration 0022).'

// Função ainda não criada no banco (migration pendente) vira um aviso próprio, não o erro genérico do Data API.
async function rpcOpcional<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  try { return await rpc<T>(fn, args) } catch (e) {
    if (e instanceof ApiError && (e.code === 'PGRST202' || /Data API do Supabase ainda não expõe/.test(e.message))) throw new ApiError(PENDENTE, 'PENDENTE')
    throw e
  }
}

export const apiFotos = {
  enviar: async (empresa: string, peca: string, arquivo: Blob): Promise<Foto> => {
    const path = `${empresa}/${peca}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: 'image/jpeg', upsert: false })
    if (error) throw new ApiError(/bucket not found/i.test(error.message) ? PENDENTE : error.message, /bucket not found/i.test(error.message) ? 'PENDENTE' : undefined)
    return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path }
  },
  remover: async (paths: string[]) => { if (paths.length) await supabase.storage.from(BUCKET).remove(paths) },
  salvar: (empresa: string, peca: string, fotos: Foto[]) => rpcOpcional<void>('definir_fotos_peca', { p_empresa: empresa, p_peca: peca, p_fotos: fotos }),
}

// ---------------------------------------------------------------- Histórico de campanhas da peça
export interface CompraCampanha {
  cliente_nome: string | null; cliente_instagram: string | null; comprado_em: string | null; tamanho: string | null; unidade_codigo: string | null
  valor: number | null; pedido_numero: string | null; pedido_estado: string | null; nfe_numero: string | null; nfe_estado: string | null; link_pagamento?: string | null
}
export interface Campanha {
  id: string; tipo: 'postagem' | 'live'; titulo: string; data: string | null; url_externa: string | null; link_url: string | null
  qtd_compras: number; valor_total: number; compras: CompraCampanha[]
}
export const apiCampanhas = {
  historico: (empresa: string, peca: string) => rpcOpcional<Campanha[]>('historico_campanhas_peca', { p_empresa: empresa, p_peca: peca }),
}
