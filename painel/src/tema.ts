export type Tema = 'escuro' | 'ane'
const CHAVE = 'ane.tema'
export const lerTema = (): Tema => {
  try { return localStorage.getItem(CHAVE) === 'ane' ? 'ane' : 'escuro' } catch { return 'escuro' }
}
export function aplicarTema(t: Tema) {
  document.documentElement.dataset.tema = t
  try { localStorage.setItem(CHAVE, t) } catch { /* armazenamento indisponível: só não lembra */ }
}
