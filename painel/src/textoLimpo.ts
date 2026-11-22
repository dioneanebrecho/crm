// Converte markdown cru dos trechos em texto legível (sem ##, **, `, links).
export function limparMarkdown(md: string): string {
  return md
    .replace(/\r/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
    .replace(/\s*\|\s*/g, (_m, off: number, s: string) => (s[off - 1] === undefined ? '' : ' · '))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Divide em parágrafos limpos e descarta cabeçalhos soltos (linha curta sem pontuação final) como título.
export function paraTrecho(md: string): { titulo: string | null; corpo: string } {
  const t = limparMarkdown(md)
  const linhas = t.split('\n')
  const primeira = (linhas[0] ?? '').trim()
  const ehTitulo = linhas.length > 1 && primeira.length > 0 && primeira.length <= 80 && !/[.!?:;]$/.test(primeira)
  return ehTitulo
    ? { titulo: primeira, corpo: linhas.slice(1).join('\n').trim() }
    : { titulo: null, corpo: t }
}

// Resumo de até n caracteres, cortando em fim de frase/palavra.
export function resumir(txt: string, n = 320): string {
  if (txt.length <= n) return txt
  const corte = txt.slice(0, n)
  const fim = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('\n'))
  return (fim > n * 0.5 ? corte.slice(0, fim + 1) : corte.replace(/\s+\S*$/, '')) + '…'
}
