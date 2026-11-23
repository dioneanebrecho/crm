export type Tema = 'escuro' | 'ane' | 'zagent'
const CHAVE = 'ane.tema'
const VALIDOS: readonly Tema[] = ['escuro', 'ane', 'zagent']
export const lerTema = (): Tema => {
  try { const t = localStorage.getItem(CHAVE) as Tema; return VALIDOS.includes(t) ? t : 'escuro' } catch { return 'escuro' }
}
export function aplicarTema(t: Tema) {
  document.documentElement.dataset.tema = t
  try { localStorage.setItem(CHAVE, t) } catch { /* armazenamento indisponível: só não lembra */ }
}
