// Lógica pura dos gráficos do Assistente (sem React, sem rede): qual gráfico serve para qual dado, métricas, escala.
// Quem calcula os números é o banco (api.assistente_serie_notas); aqui só se decide como mostrar.
export type TipoGrafico = 'coluna' | 'barra' | 'linha' | 'area' | 'pizza' | 'rosca'
// Tipos que a pessoa pode pedir; os que não estão em TipoGrafico ainda não existem e a resposta explica.
export type TipoPedido = TipoGrafico | 'waterfall' | 'funil' | 'pareto' | 'calor' | 'dispersao'
export type Dimensao = 'dia' | 'semana' | 'mes' | 'cliente' | 'situacao'
export type Metrica = 'valor' | 'qtd' | 'ticket'
export type Forma = 'serie_temporal' | 'ranking' | 'composicao'

// Linha como vem do banco.
export interface LinhaSerie { chave: string; rotulo: string; qtd: number; valor: number | null; qtd_sem_valor?: number; de?: string; ate?: string; outros?: boolean; valida?: boolean }
// Ponto já na métrica escolhida (v é o que o gráfico desenha).
export interface Ponto { chave: string; rotulo: string; v: number; qtd: number; valor: number | null; qtd_sem_valor: number; de?: string; ate?: string; outros?: boolean }
// O que a conversa guarda para a pergunta seguinte ("e do mês passado?", "agora em pizza").
export interface ContextoDados { de: string | null; ate: string | null; rotulo: string; dimensao: Dimensao; metrica: Metrica; grafico: TipoPedido | null }

export const formaDe = (d: Dimensao): Forma => (d === 'cliente' ? 'ranking' : d === 'situacao' ? 'composicao' : 'serie_temporal')
export const ROTULO_DIMENSAO: Record<Dimensao, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês', cliente: 'Cliente', situacao: 'Situação' }
export const ROTULO_METRICA: Record<Metrica, string> = { valor: 'Valor (R$)', qtd: 'Notas', ticket: 'Ticket médio' }
export const ROTULO_TIPO: Record<TipoPedido, string> = {
  coluna: 'Colunas', barra: 'Barras', linha: 'Linha', area: 'Área', pizza: 'Pizza', rosca: 'Rosca',
  waterfall: 'Waterfall (cascata)', funil: 'Funil', pareto: 'Pareto (curva ABC)', calor: 'Mapa de calor', dispersao: 'Dispersão',
}

// Gráficos que servem a cada forma de dado; o primeiro é o padrão.
const COMPAT: Record<Forma, TipoGrafico[]> = {
  serie_temporal: ['coluna', 'linha', 'area'],
  ranking: ['barra', 'coluna', 'rosca', 'pizza'],
  composicao: ['rosca', 'pizza', 'barra', 'coluna'],
}
export const tiposCompativeis = (forma: Forma): TipoGrafico[] => COMPAT[forma]

// Tipos pedidos que ainda não existem: a resposta explica o motivo em vez de ignorar o pedido.
const INDISPONIVEL: Partial<Record<TipoPedido, string>> = {
  waterfall: ' (faltam cancelamentos, devoluções e frete na base)',
  funil: ' (ainda não há dados das lives aqui)',
  pareto: ' (a curva ABC de peças depende dos itens das notas)',
  calor: '', dispersao: '',
}
export interface Sugestao { rotulo: string; dimensao: Dimensao; tipo: TipoGrafico }
export interface Escolha { tipo: TipoGrafico; aviso: string | null; sugestoes: Sugestao[] }

// Pedido explícito vence a sugestão. Se não serve para os dados, explica e usa o mais próximo, com atalhos para o que a pessoa queria.
export function escolherGrafico(forma: Forma, pedido: TipoPedido | null | undefined): Escolha {
  const padrao = COMPAT[forma][0]
  if (!pedido) return { tipo: padrao, aviso: null, sugestoes: [] }
  const indisp = INDISPONIVEL[pedido]
  if (indisp !== undefined) return { tipo: padrao, aviso: `${ROTULO_TIPO[pedido]} ainda não está disponível${indisp}; mostrei ${ROTULO_TIPO[padrao].toLowerCase()}.`, sugestoes: [] }
  const t = (pedido === 'barra' && forma === 'serie_temporal' ? 'coluna' : pedido) as TipoGrafico
  if (COMPAT[forma].includes(t)) return { tipo: t, aviso: null, sugestoes: [] }
  if (t === 'pizza' || t === 'rosca') {
    return {
      tipo: padrao, aviso: `${ROTULO_TIPO[t]} mostra partes de um todo, não a evolução no tempo; mostrei ${ROTULO_TIPO[padrao].toLowerCase()}.`,
      sugestoes: [{ rotulo: `${ROTULO_TIPO[t]} por situação das notas`, dimensao: 'situacao', tipo: t }, { rotulo: `${ROTULO_TIPO[t]} por cliente`, dimensao: 'cliente', tipo: t }],
    }
  }
  return {
    tipo: padrao, aviso: `${ROTULO_TIPO[t]} mostra a evolução no tempo; para esta comparação usei ${ROTULO_TIPO[padrao].toLowerCase()}.`,
    sugestoes: [{ rotulo: `${ROTULO_TIPO[t]} por dia`, dimensao: 'dia', tipo: t }],
  }
}

// Valor em R$ e ticket só para quem pode ver valores; os demais caem para quantidade de notas, com aviso.
export function metricaEfetiva(m: Metrica, veValores: boolean): { metrica: Metrica; aviso: string | null } {
  if (!veValores && m !== 'qtd') return { metrica: 'qtd', aviso: 'Valores em R$ ficam ocultos para o seu perfil; mostrei a quantidade de notas.' }
  return { metrica: m, aviso: null }
}
// Ticket médio não é parte de um todo: pizza e rosca usam o valor.
export function metricaParaTipo(tipo: TipoGrafico, m: Metrica): { metrica: Metrica; aviso: string | null } {
  if (m === 'ticket' && (tipo === 'pizza' || tipo === 'rosca')) return { metrica: 'valor', aviso: 'Ticket médio não se divide em fatias; mostrei o valor.' }
  return { metrica: m, aviso: null }
}

export const valorDe = (l: LinhaSerie, m: Metrica): number => (m === 'qtd' ? l.qtd : m === 'valor' ? (l.valor ?? 0) : l.qtd > 0 && l.valor != null ? l.valor / l.qtd : 0)
export const paraPontos = (linhas: LinhaSerie[], m: Metrica): Ponto[] =>
  linhas.map((l) => ({ chave: l.chave, rotulo: l.rotulo, v: valorDe(l, m), qtd: l.qtd, valor: l.valor, qtd_sem_valor: l.qtd_sem_valor ?? 0, de: l.de, ate: l.ate, outros: l.outros }))

// Pizza/rosca: no máximo `max` fatias; o resto vira "Outros" (soma, junto com um "Outros" que já venha do banco).
export function agruparOutros(pontos: Ponto[], max = 6): { pontos: Ponto[]; agrupou: boolean } {
  const normais = pontos.filter((p) => !p.outros)
  const jaOutros = pontos.filter((p) => p.outros)
  if (normais.length + (jaOutros.length ? 1 : 0) <= max) return { pontos, agrupou: false }
  const manter = [...normais].sort((a, b) => b.v - a.v).slice(0, max - 1)
  const resto = [...normais.filter((p) => !manter.includes(p)), ...jaOutros]
  const outros: Ponto = {
    chave: 'Outros', rotulo: 'Outros', outros: true, v: resto.reduce((s, p) => s + p.v, 0), qtd: resto.reduce((s, p) => s + p.qtd, 0),
    valor: resto.every((p) => p.valor == null) ? null : resto.reduce((s, p) => s + (p.valor ?? 0), 0), qtd_sem_valor: resto.reduce((s, p) => s + p.qtd_sem_valor, 0),
  }
  return { pontos: [...manter, outros], agrupou: true }
}

export const serieVazia = (pontos: Ponto[]): boolean => pontos.length === 0 || pontos.every((p) => p.v === 0)

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const COMPACTO = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
export function fmtMetrica(m: Metrica, v: number): string {
  return m === 'qtd' ? `${v.toLocaleString('pt-BR')} ${v === 1 ? 'nota' : 'notas'}` : BRL.format(v)
}
export const fmtEixo = (m: Metrica, v: number): string => (m === 'qtd' ? COMPACTO.format(v) : `R$ ${COMPACTO.format(v)}`)

// Escala "bonita" do eixo: topo e marcas em passos de 1, 2, 2,5, 5 ou 10 (contagem sempre em inteiros).
export function escala(max: number, inteiro: boolean, alvo = 4): { topo: number; marcas: number[] } {
  if (!(max > 0)) return { topo: 1, marcas: [0, 1] }
  const bruto = max / alvo
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const r = bruto / mag
  let passo = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag
  if (inteiro) passo = Math.max(1, Math.round(passo))
  const topo = Math.ceil(max / passo - 1e-9) * passo
  const marcas: number[] = []
  for (let v = 0; v <= topo + passo / 1000; v += passo) marcas.push(Math.round(v * 1e6) / 1e6)
  return { topo, marcas }
}
