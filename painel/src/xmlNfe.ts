import type { DadosImportacao } from './apiCompra'

// Leitor de XML de NF-e (modelo 55) no navegador: nada do arquivo vai para fora além do JSON estruturado enviado ao banco.

const num = (v: string | null | undefined) => (v == null || v === '' ? 0 : Number(v))

function filho(pai: Element | null | undefined, nome: string): Element | null {
  if (!pai) return null
  for (const c of Array.from(pai.getElementsByTagName('*'))) if (c.localName === nome) return c
  return null
}
const txt = (pai: Element | null | undefined, nome: string) => filho(pai, nome)?.textContent?.trim() ?? null
const todos = (pai: Element | Document, nome: string) => Array.from(pai.getElementsByTagName('*')).filter((e) => e.localName === nome)

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Dados cadastrais do emitente exatamente como vêm no XML (o CNPJ completo e o endereço não seguem em DadosImportacao). */
export interface EmitenteXml {
  documento: string; razao_social: string | null; nome_fantasia: string | null; ie: string | null; im: string | null; cnae: string | null; crt: string | null
  telefone: string | null; email: string | null
  endereco: { cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null
    cod_municipio: string | null; municipio: string | null; uf: string | null; pais: string | null }
}
export interface NotaLida { dados: DadosImportacao; fornecedorCnpj: string; destinatarioCnpj: string | null; avisos: string[]; emitente: EmitenteXml }

export async function lerNfe(xml: string): Promise<NotaLida> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('O arquivo não é um XML válido.')
  const inf = todos(doc, 'infNFe')[0]
  if (!inf) throw new Error('Não encontrei uma NF-e neste arquivo. Envie o XML da nota (não o do pedido nem o DANFE).')
  const chave = (inf.getAttribute('Id') ?? '').replace(/\D/g, '')
  if (chave.length !== 44) throw new Error('Chave de acesso inválida no XML.')
  const ide = filho(inf, 'ide'), emit = filho(inf, 'emit'), dest = filho(inf, 'dest'), tot = filho(filho(inf, 'total'), 'ICMSTot')
  if (txt(ide, 'mod') !== '55') throw new Error('Só aceito NF-e modelo 55.')
  const avisos: string[] = []
  const itens = todos(inf, 'det').map((det, i) => {
    const p = filho(det, 'prod')
    const qtd = num(txt(p, 'qCom'))
    const gtin = txt(p, 'cEAN')
    return {
      seq: Number(det.getAttribute('nItem') ?? i + 1), codigo: txt(p, 'cProd'), descricao: txt(p, 'xProd') ?? '', ncm: txt(p, 'NCM'), cfop: txt(p, 'CFOP'),
      unidade: txt(p, 'uCom'), gtin: gtin && gtin !== 'SEM GTIN' ? gtin : null, qtd, v_unit: num(txt(p, 'vUnCom')), v_prod: num(txt(p, 'vProd')),
      v_desc: num(txt(p, 'vDesc')), v_frete: num(txt(p, 'vFrete')), v_seg: num(txt(p, 'vSeg')), v_outro: num(txt(p, 'vOutro')),
      v_ipi: num(txt(filho(det, 'IPI'), 'vIPI')), v_st: num(txt(filho(det, 'imposto'), 'vICMSST')), v_icms: num(txt(filho(filho(det, 'imposto'), 'ICMS'), 'vICMS')), peso: 0,
    }
  })
  if (!itens.length) throw new Error('A nota não tem itens.')
  const volumes = todos(inf, 'vol')
  const pesoBruto = volumes.reduce((s, v) => s + num(txt(v, 'pesoB')), 0)
  if (pesoBruto > 0) {
    const totQtd = itens.reduce((s, i) => s + i.qtd, 0)
    for (const it of itens) it.peso = Math.round((pesoBruto * it.qtd / totQtd) * 1000) / 1000   // sem peso por item no XML: rateia pela quantidade
  }
  const transp = filho(inf, 'transp')
  const crt = txt(emit, 'CRT'), finNfe = txt(ide, 'finNFe')
  const pagamentos = todos(inf, 'detPag').map((d) => ({ forma: txt(d, 'tPag'), descricao: txt(d, 'xPag'), indicador: txt(d, 'indPag') == null ? null : Number(txt(d, 'indPag')), valor: num(txt(d, 'vPag')) }))
  const parcelas = todos(inf, 'dup').map((d, i) => ({ seq: i + 1, vencimento: txt(d, 'dVenc'), valor: num(txt(d, 'vDup')) }))
  const emissao = (txt(ide, 'dhEmi') ?? txt(ide, 'dEmi') ?? '').slice(0, 10) || null
  const cnpj = (txt(emit, 'CNPJ') ?? '').replace(/\D/g, '')
  if (!cnpj) avisos.push('O emitente não tem CNPJ no XML.')
  const dados: DadosImportacao = {
    chave_acesso: chave, numero: String(Number(txt(ide, 'nNF') ?? 0) || txt(ide, 'nNF') || ''), serie: txt(ide, 'serie') ?? '', emitida_em: emissao,
    fornecedor_nome: txt(emit, 'xNome') ?? '', fornecedor_doc_ultimos: cnpj.slice(-4),
    mod_frete: txt(transp, 'modFrete') == null ? null : Number(txt(transp, 'modFrete')), transportadora_nome: txt(filho(transp, 'transporta'), 'xNome'),
    peso_bruto: pesoBruto || null, xml_hash: await sha256(xml),
    totais: { v_prod: num(txt(tot, 'vProd')), v_frete: num(txt(tot, 'vFrete')), v_seg: num(txt(tot, 'vSeg')), v_desc: num(txt(tot, 'vDesc')), v_outro: num(txt(tot, 'vOutro')),
      v_ipi: num(txt(tot, 'vIPI')), v_st: num(txt(tot, 'vST')), v_icms: num(txt(tot, 'vICMS')), v_nf: num(txt(tot, 'vNF')) },
    itens, parcelas, pagamentos, fornecedor_crt: crt,
  }
  if (finNfe && finNfe !== '1') avisos.push('Esta nota não é de finalidade normal (complementar, ajuste ou devolução). Confira antes de dar entrada.')
  if (!parcelas.length) {
    const pg = pagamentos[0]
    avisos.push(pg
      ? `O XML não traz parcelas. Pagamento informado: ${pg.descricao ?? 'forma ' + pg.forma}${pg.indicador === 1 ? ', a prazo' : pg.indicador === 0 ? ', à vista' : ''}. Informe os vencimentos no financeiro.`
      : 'O XML não traz parcelas (cobrança). Você confere o financeiro na tela.')
  }
  const nomeTransp = txt(filho(transp, 'transporta'), 'xNome')
  if (dados.mod_frete === 1 && dados.totais.v_frete === 0)
    avisos.push('Frete por conta do destinatário e sem valor na nota. Informe o frete pago à parte como rubrica extra.')
  if (nomeTransp && /^O\s+PR[OÓ]PRIO$/i.test(nomeTransp)) avisos.push('A transportadora veio como "O PROPRIO", que não identifica quem transportou. Anote a transportadora real, se houver.')
  if ((crt === '1' || crt === '2' || crt === '4') && itens.every((i) => i.v_icms === 0))
    avisos.push('Fornecedor do Simples Nacional, sem ICMS destacado: não há crédito, e os três regimes dão o mesmo custo.')
  if (emissao) {
    const dias = Math.floor((Date.now() - new Date(emissao + 'T12:00:00').getTime()) / 86400000)
    if (dias > 90) avisos.push(`Nota emitida há ${dias} dias (${emissao.split('-').reverse().join('/')}). Confirme que ainda não deu entrada em outra rotina.`)
  }
  const ender = filho(emit, 'enderEmit')
  const emitente: EmitenteXml = {
    documento: cnpj || (txt(emit, 'CPF') ?? '').replace(/\D/g, ''), razao_social: txt(emit, 'xNome'), nome_fantasia: txt(emit, 'xFant'),
    ie: txt(emit, 'IE'), im: txt(emit, 'IM'), cnae: txt(emit, 'CNAE'), crt, telefone: txt(ender, 'fone'), email: null,
    endereco: { cep: txt(ender, 'CEP'), logradouro: txt(ender, 'xLgr'), numero: txt(ender, 'nro'), complemento: txt(ender, 'xCpl'), bairro: txt(ender, 'xBairro'),
      cod_municipio: txt(ender, 'cMun'), municipio: txt(ender, 'xMun'), uf: txt(ender, 'UF'), pais: txt(ender, 'xPais') },
  }
  return { dados, fornecedorCnpj: cnpj, destinatarioCnpj: (txt(dest, 'CNPJ') ?? '').replace(/\D/g, '') || null, avisos, emitente }
}
