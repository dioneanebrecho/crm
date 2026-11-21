import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const configurado = Boolean(url && key)

// O painel só conversa com o schema `api` (funções que checam papel e empresa). Nunca com as tabelas.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'sem-chave', {
  db: { schema: 'api' },
  auth: { persistSession: true, autoRefreshToken: true },
})
