import { supabase } from '../supabase'

// Página pública da vitrine: só funções api.publico_* (executáveis por anon). Nada de tabela, nada de sessão.
export type Situacao = 'disponivel' | 'reservada' | 'vendida' | 'encerrada'
export interface ItemArara {
  codigo: string; codigo_live: string | null; nome: string; categoria: string; tamanho: string | null
  preco: number; condicao: string | null; foto: string | null; situacao: Situacao; fila_total: number | null
}
export interface Aparencia {
  tema: 'claro' | 'escuro' | 'auto'; animacao: 'nenhuma' | 'suave' | 'medio' | 'forte'
  etiqueta_codigo: boolean; etiqueta_preco: boolean; ordem_midias: string[]; video_auto: boolean
}
export interface Regras { prazo_min: number; fila_visibilidade: 'posicao' | 'total' | 'nomes'; aviseme: boolean; qtd_parecidas?: number }
export interface Vitrine {
  situacao: 'ok' | 'nao_encontrada'; loja: string; canal: string; whatsapp: string | null
  aparencia: Aparencia; regras: Regras; itens: ItemArara[]
}
export interface MidiaPub { tipo: 'foto' | 'video'; url: string; rotulo: string | null; capa?: boolean }
export interface Oferta {
  situacao: Situacao | 'nao_encontrada'; fila_total: number | null; loja: string
  peca: {
    codigo: string; codigo_live: string | null; nome: string; descricao: string | null; categoria: string | null; marca: string | null
    condicao: string | null; tamanho: string | null; preco: number; atributos: Record<string, unknown>; fotos: { url: string }[]
  }
  conteudo: { html: string | null; midias: MidiaPub[]; versao: number } | null
  aparencia: Aparencia; regras: Regras
}
export interface Parecida { codigo: string; nome: string; tamanho: string | null; preco: number; foto: string | null }
export type SituacaoAcomp = 'reservada' | 'paga' | 'expirou' | 'cancelada' | 'fila' | 'vendida_para_outra' | 'indisponivel'
  | 'saiu_da_fila' | 'nao_registrado' | 'processando' | 'nao_encontrada'
export interface Acompanhamento {
  situacao: SituacaoAcomp; posicao: number | null; fila_total: number | null; a_frente: string | null
  reserva: { expira_em?: string; segundos?: number; carencia_aplicada?: boolean }; prazo_min: number
  peca: { nome: string; codigo: string; tamanho: string | null; preco: number; foto_capa: string | null; codigo_live: string | null; link: string | null }
  parecidas: Parecida[]; aviseme: boolean; token?: string; erro?: string; limite?: number
}
export interface EnderecoSalvo { id: string; apelido: string | null; principal: boolean; resumo: string; cep_final: string; oficial: boolean }
export interface Entrega {
  pode: boolean; nome: string | null; cpf_final: string | null; endereco: { resumo: string; cep_final: string } | null; erro?: string
  enderecos?: EnderecoSalvo[]; forma?: 'pix' | 'cartao' | null; pagar_url?: string | null; definido?: boolean
}
export interface DadosEntrega {
  usarSalvo?: boolean; enderecoId?: string; cpf?: string; cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string
  municipio?: string; uf?: string; nomePagador?: string; email?: string; forma?: 'pix' | 'cartao'
}
export interface CepOficial { encontrado?: boolean; oficial?: boolean; pendente?: boolean; logradouro?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null; erro?: string }

async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.code === 'PGRST202' ? 'A vitrine ainda não foi ativada no servidor.' : 'Não foi possível falar com a loja agora. Tente de novo em instantes.')
  return data as T
}

export const apiPublica = {
  vitrine: (canal: string | null) => chamar<Vitrine>('publico_vitrine', { p_canal: canal }),
  oferta: (codigo: string, canal: string | null) => chamar<Oferta>('publico_oferta', { p_codigo: codigo, p_canal: canal }),
  quero: (codigo: string, chave: string, nome: string, whatsapp: string, instagram: string, aceite: boolean, marketing: boolean, canal: string | null) =>
    chamar<Acompanhamento>('publico_quero', { p_codigo: codigo, p_chave: chave, p_nome: nome, p_whatsapp: whatsapp, p_instagram: instagram || null,
      p_aceite: aceite, p_marketing: marketing, p_canal: canal }),
  acompanhar: (token: string) => chamar<Acompanhamento>('publico_acompanhar', { p_token: token }),
  entregaObter: (token: string) => chamar<Entrega>('publico_entrega_obter', { p_token: token }),
  entregaSalvar: (token: string, d: DadosEntrega) =>
    chamar<{ ok?: boolean; erro?: string; cpf_reconhecido?: boolean; cep_oficial?: boolean }>('publico_entrega_salvar', { p_token: token, p_usar_salvo: d.usarSalvo ?? false,
      p_endereco_id: d.enderecoId ?? null, p_cpf: d.cpf || null, p_cep: d.cep || null, p_logradouro: d.logradouro || null, p_numero: d.numero || null,
      p_complemento: d.complemento || null, p_bairro: d.bairro || null, p_municipio: d.municipio || null, p_uf: d.uf || null,
      p_nome_pagador: d.nomePagador || null, p_email: d.email || null, p_forma: d.forma ?? null }),
  // CEP pela base oficial guardada no servidor (Correios via ViaCEP); quando ainda não consultado, o servidor agenda a consulta
  cep: (token: string, cep: string) => chamar<CepOficial>('publico_cep', { p_token: token, p_cep: cep }),
  // Pagamento pela Getnet (pedido 048). Devolve null quando o gateway não está ligado/publicado: a página cai no WhatsApp.
  pagamento: async (token: string, forma: 'pix' | 'cartao'): Promise<Pagamento | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('pagamento', { body: { token, forma } })
      if (error || !data || data.modo !== 'real') return null
      return data as Pagamento
    } catch { return null }
  },
}

export interface Pagamento { modo: 'real'; valor_centavos: number; pix_copia_cola?: string; pix_expira_em?: string; link_url?: string }

// CEP: ViaCEP direto do navegador (público, sem chave). Só preenche; o banco valida o que for salvo.
export async function buscarCep(cep: string): Promise<{ logradouro: string; bairro: string; municipio: string; uf: string } | null> {
  const so = cep.replace(/\D/g, '')
  if (so.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${so}/json/`)
    if (r.ok) {
      const j = await r.json()
      if (!j.erro) return { logradouro: j.logradouro ?? '', bairro: j.bairro ?? '', municipio: j.localidade ?? '', uf: j.uf ?? '' }
    }
  } catch { /* tenta a segunda fonte */ }
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${so}`)
    if (!r.ok) return null
    const j = await r.json()
    return { logradouro: j.street ?? '', bairro: j.neighborhood ?? '', municipio: j.city ?? '', uf: j.state ?? '' }
  } catch { return null }
}

export const ERROS_QUERO: Record<string, string> = {
  peca_nao_encontrada: 'Não encontramos esta peça.',
  pedido_invalido: 'Algo deu errado no envio. Tente de novo.',
  aceite_obrigatorio: 'Marque a concordância para seguir.',
  nome_invalido: 'Informe nome e sobrenome, sem números ou @.',
  whatsapp_invalido: 'Informe o WhatsApp com DDD, por exemplo (34) 9 9123-4567.',
  instagram_invalido: 'O @ do Instagram tem só letras, números, ponto e sublinhado.',
  oferta_encerrada: 'Esta peça saiu da vitrine.',
  muitas_tentativas: 'Muitas tentativas seguidas. Aguarde alguns minutos.',
  nao_disponivel: 'Não foi possível concluir pelo site. Fale com a loja pelo WhatsApp.',
  limite_reservas: 'Você já tem reservas aguardando pagamento. Pague uma delas para reservar outra (ou entre na fila).',
}
export const ERROS_ENTREGA: Record<string, string> = {
  nao_encontrada: 'Não encontramos sua reserva.', reserva_inativa: 'O prazo desta reserva terminou.',
  sem_dados_salvos: 'Preencha CPF e endereço.', cpf_invalido: 'CPF inválido. Confira os números.',
  cep_invalido: 'CEP inválido: são 8 números.', endereco_incompleto: 'Preencha rua, número, cidade e UF.', endereco_invalido: 'Endereço com caracteres não permitidos.',
  endereco_nao_encontrado: 'Esse endereço não está mais disponível. Escolha outro ou cadastre um novo.', forma_invalida: 'Escolha Pix ou cartão.',
  email_invalido: 'Confira o e-mail.', nome_invalido: 'Informe nome e sobrenome de quem vai pagar, sem números ou @.',
  nome_pagador: 'Esse CPF é de outra pessoa? Informe o nome completo dela para a nota fiscal.',
}

export const brl = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const ROTULO_CANAL: Record<string, string> = {
  ig_feed: 'Instagram', ig_story: 'Story do Instagram', ig_reels: 'Reels do Instagram', live: 'live do Instagram', whatsapp: 'WhatsApp', link: 'link da loja', loja: 'loja', outro: 'link da loja',
}
export function linkWhatsApp(numero: string | null, texto: string): string | null {
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null
}
