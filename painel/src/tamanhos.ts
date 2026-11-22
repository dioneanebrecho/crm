// Lista fechada de tamanhos (decisão do saneamento do cadastro: nada de texto livre na grade).
// "UNICO" fica sem acento de propósito: o tamanho entra no código da variação e da unidade, e o código de barras só aceita ASCII.
export const GRUPOS_TAMANHO: { grupo: string; itens: string[] }[] = [
  { grupo: 'Letras', itens: ['PP', 'P', 'M', 'G', 'GG'] },
  { grupo: 'Numeração', itens: ['34', '36', '38', '40', '42', '44', '46', '48'] },
  { grupo: 'Sem grade', itens: ['UNICO'] },
]
export const TODOS_TAMANHOS = GRUPOS_TAMANHO.flatMap((g) => g.itens)
export const tamLabel = (t: string) => (t === 'UNICO' ? 'Único' : t)
