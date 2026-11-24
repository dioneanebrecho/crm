export type Densidade = 'compacta' | 'confortavel'
const CHAVE = 'ane.densidade'
/** Padrão: compacta (mais linhas na tela). O modo confortável é o visual anterior. */
export const lerDensidade = (): Densidade => {
  try { return localStorage.getItem(CHAVE) === 'confortavel' ? 'confortavel' : 'compacta' } catch { return 'compacta' }
}
export function aplicarDensidade(d: Densidade) {
  document.documentElement.dataset.densidade = d
  try { localStorage.setItem(CHAVE, d) } catch { /* só não lembra */ }
}
