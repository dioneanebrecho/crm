import { rpc } from './api'

// Fluxo do processo (pedido 050): etapas da operação no banco, editáveis com revisão automática, e comentários por etapa.
// O acesso segue a matriz de Permissões (tela 'fluxo'): ver = ler e comentar; editar = alterar etapas e revisões.
export type Situacao = 'uso' | 'impl' | 'plan' | 'man'
export type Area = 'compras' | 'estoque' | 'cadastro' | 'mkt' | 'live' | 'fat' | 'exp' | 'fin'
export interface Etapa {
  codigo: string; ordem: number; fase: number; area: Area; titulo: string; responsavel: string; apoio: string[]
  tela: string; entrada: string; procedimento: string[]; entrega: string; impacto: string; regras: string; situacao: Situacao; ativa: boolean
}
export interface Funcao { codigo: string; nome: string; descricao: string }
export type TipoComentario = 'comentario' | 'ajuste' | 'duvida'
export interface Comentario {
  id: string; etapa: string; tipo: TipoComentario; texto: string; criado_em: string; autor: string; meu: boolean
  resolvido: boolean; resolvido_por: string | null; resolvido_em: string | null
}
export interface Revisao { id: string; versao: string; descricao: string; etapas: string[]; tipo: 'inicial' | 'edicao' | 'restauracao' | 'anotacao'; criado_em: string; autor: string }
export interface Fluxo { nivel: 'ver' | 'editar' | 'nenhum'; versao: string | null; funcoes: Funcao[]; etapas: Etapa[]; comentarios: Comentario[]; revisoes: Revisao[] }

export const AREAS: Record<Area, { nome: string; cor: string }> = {
  compras: { nome: 'Compras', cor: '#3b7bff' },
  estoque: { nome: 'Recebimento e estoque', cor: '#d99a00' },
  cadastro: { nome: 'Cadastro e preço', cor: '#8b5cf6' },
  mkt: { nome: 'Marketing e vitrine', cor: '#d6246e' },
  live: { nome: 'Live e atendimento', cor: '#e6403a' },
  fat: { nome: 'Faturamento', cor: '#12a35f' },
  exp: { nome: 'Expedição', cor: '#0e9fbf' },
  fin: { nome: 'Financeiro e gestão', cor: '#7c8aa0' },
}
export const AREA_IDS = Object.keys(AREAS) as Area[]
export const FASES: { n: number; nome: string; texto: string }[] = [
  { n: 1, nome: 'Compra e entrada da mercadoria', texto: 'A nota do fornecedor chega, a mercadoria é contada e o XML entra no painel.' },
  { n: 2, nome: 'Cadastro, custo e estoque', texto: 'A nota vira peças com grade, custo fechado, preço, etiqueta e local.' },
  { n: 3, nome: 'Divulgação e vitrine', texto: 'Cada peça ganha conteúdo, link único com origem e a live é preparada.' },
  { n: 4, nome: 'Live e venda', texto: 'Interesse vira fila, a primeira da fila recebe a reserva e o link, e o pagamento é confirmado.' },
  { n: 5, nome: 'Expedição e faturamento', texto: 'Pedidos pagos da mesma cliente viram um envio, com frete, NF-e e rastreio.' },
  { n: 6, nome: 'Pós-venda e financeiro', texto: 'Entrega, devoluções, contas a pagar e a receber, conciliação e fechamento.' },
]
export const SITUACAO: Record<Situacao, string> = { uso: 'Em uso no painel', impl: 'Em implantação', plan: 'Planejado', man: 'Processo manual' }
export const TIPO_COM: Record<TipoComentario, string> = { comentario: 'Comentário', ajuste: 'Ajuste sugerido', duvida: 'Dúvida' }
export const TIPO_REV: Record<Revisao['tipo'], string> = { inicial: 'Versão inicial', edicao: 'Alteração de etapa', restauracao: 'Restauração', anotacao: 'Anotação' }

export const apiFluxo = {
  obter: (empresa: string) => rpc<Fluxo>('fluxo_obter', { p_empresa: empresa }),
  copia: (empresa: string, revisao: string) => rpc<Etapa[]>('fluxo_revisao_copia', { p_empresa: empresa, p_revisao: revisao }),
  salvar: (empresa: string, etapa: Partial<Etapa>, descricao: string) =>
    rpc<{ codigo: string; versao: string }>('fluxo_etapa_salvar', { p_empresa: empresa, p_etapa: etapa, p_descricao: descricao }),
  restaurar: (empresa: string, revisao: string, motivo: string) => rpc<string>('fluxo_restaurar', { p_empresa: empresa, p_revisao: revisao, p_motivo: motivo }),
  anotar: (empresa: string, descricao: string, etapas: string[]) => rpc<string>('fluxo_revisao_registrar', { p_empresa: empresa, p_descricao: descricao, p_etapas: etapas }),
  comentar: (empresa: string, etapa: string, tipo: TipoComentario, texto: string) => rpc<string>('fluxo_comentar', { p_empresa: empresa, p_etapa: etapa, p_tipo: tipo, p_texto: texto }),
  resolver: (empresa: string, id: string, resolvido: boolean) => rpc<void>('fluxo_comentario_resolver', { p_empresa: empresa, p_id: id, p_resolvido: resolvido }),
}

// rótulos dos campos para a comparação entre versões
export const CAMPOS: [keyof Etapa, string][] = [
  ['titulo', 'Título'], ['ordem', 'Ordem'], ['fase', 'Fase'], ['area', 'Área'], ['responsavel', 'Responsável'], ['apoio', 'Apoio'],
  ['tela', 'Tela'], ['entrada', 'Começa com'], ['procedimento', 'Procedimento'], ['entrega', 'Entrega'], ['impacto', 'Impacto'],
  ['regras', 'Regras'], ['situacao', 'Situação'], ['ativa', 'Ativa'],
]
export interface Diferenca { codigo: string; titulo: string; tipo: 'nova' | 'removida' | 'alterada'; campos: string[] }
/** O que muda de `de` (versão antiga) para `para` (atual). */
export function comparar(de: Etapa[], para: Etapa[]): Diferenca[] {
  const a = new Map(de.map((e) => [e.codigo, e]))
  const b = new Map(para.map((e) => [e.codigo, e]))
  const out: Diferenca[] = []
  for (const e of para) {
    const o = a.get(e.codigo)
    if (!o) { out.push({ codigo: e.codigo, titulo: e.titulo, tipo: 'nova', campos: [] }); continue }
    const campos = CAMPOS.filter(([k]) => JSON.stringify(o[k]) !== JSON.stringify(e[k])).map(([, r]) => r)
    if (campos.length) out.push({ codigo: e.codigo, titulo: e.titulo, tipo: 'alterada', campos })
  }
  for (const o of de) if (!b.has(o.codigo)) out.push({ codigo: o.codigo, titulo: o.titulo, tipo: 'removida', campos: [] })
  return out
}
