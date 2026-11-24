// Regra de negócio (pedido 034 / migration 0061): CUSTO, MARGEM e RENTABILIDADE só aparecem para quem tem
// administração, gestão ou a marcação "Ver custo e margem" (papel `rentabilidade`, direto ou por grupo).
// No painel isso é `ctx.veRentabilidade`; no banco é `api.ver_rentabilidade(empresa)`. Toda tela ou função nova
// que mostre custo, margem, lucro ou CMV usa essa regra (e devolve null no banco para os demais), nunca uma lista de papéis própria.
/** Margem bruta em % sobre o preço de venda; null quando falta preço ou custo. */
export const margemBruta = (preco: number | null | undefined, custo: number | null | undefined): number | null =>
  preco != null && preco > 0 && custo != null ? ((preco - custo) / preco) * 100 : null
export const fmtMargem = (m: number | null) => (m == null ? '—' : `${m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`)
