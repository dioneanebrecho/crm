import { createContext, useCallback, useEffect, useRef, useState } from 'react'

// Contexto de cada aba de trabalho: `ativa` (visível agora) e `recarga` (sobe quando a aba volta depois de muito tempo oculta).
export const AbaContexto = createContext<{ ativa: boolean; recarga: number }>({ ativa: true, recarga: 0 })

// Quanto tempo uma aba pode ficar oculta antes de recarregar os dados ao voltar.
export const MINUTOS_PARA_ATUALIZAR = 5

// A empresa é definida pelo Painel antes de renderizar as telas; os filtros ficam separados por empresa.
let empresaEstado = ''
export const definirEmpresaEstado = (id: string) => { empresaEstado = id }
const chave = (c: string) => `ane.f.${empresaEstado}.${c}`

/** Como useState, mas lembra o valor no navegador (por empresa e tela). `forcar` (ex.: atalho de outra tela) vence o valor lembrado. */
export function useEstadoTela<T>(nome: string, inicial: T, forcar?: T) {
  const [valor, setValor] = useState<T>(() => {
    if (forcar !== undefined) return forcar
    try { const s = localStorage.getItem(chave(nome)); if (s !== null) return JSON.parse(s) as T } catch { /* lixo no armazenamento: usa o padrão */ }
    return inicial
  })
  const padrao = useRef(inicial)
  useEffect(() => { try { localStorage.setItem(chave(nome), JSON.stringify(valor)) } catch { /* sem armazenamento: só não lembra */ } }, [nome, valor])
  const limpar = useCallback(() => setValor(padrao.current), [])
  return [valor, setValor, limpar] as const
}
