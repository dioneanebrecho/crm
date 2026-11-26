// Simulação da Expedição: clientes, peças e pedidos fictícios, só na memória do navegador. Nada é gravado nem cobrado.
// Segue as mesmas regras do banco (venda.mov_expedicao): montar → conferir as peças bipando → definir frete (ou grátis)
// → frete pago → custo da postagem → enviar com rastreio.
import { apiExpedicao, type Bipagem, type Conferencia, type CotacaoFrete, type EstadoExpedicao, type EtiquetaEnvio, type Expedicao, type ItemConferencia, type Pendente, type TituloFrete } from '../apiExpedicao'

type Fonte = typeof apiExpedicao
const h = (horas: number) => new Date(Date.now() - horas * 3600_000).toISOString()
interface Peca { codigo: string; descricao: string }
interface Ped { id: string; numero: string; cliente: string; endereco: string; pecas: Peca[]; valor: number; pago_em: string; vip?: boolean; reservas?: number; exp?: string }

export type FonteDemoExpedicao = Fonte & {
  simularPagamentoReserva: () => string | null
  // fase 4 (Melhor Envio) e Getnet: ainda não existem no banco, aqui só para demonstrar como vai ficar
  cotar: (exp: string) => Promise<CotacaoFrete[]>
  escolherCotacao: (exp: string, cotacao: string, aCobrar: number) => Promise<{ estado: string }>
  comprarEtiqueta: (exp: string) => Promise<EtiquetaEnvio>
  simularPagamentoGetnet: (exp: string) => Promise<string>
}

export function criarDemoExpedicao(aoEvento: (e: string) => void): FonteDemoExpedicao {
  let n = 100
  const ends: Record<string, string> = {
    mariana: 'Rua das Acácias, 120 · Santa Mônica · Uberlândia/MG · 38408-100',
    juliana: 'Av. Rondon Pacheco, 4600, ap 802 · Tibery · Uberlândia/MG · 38405-142',
    paula: 'Rua XV de Novembro, 55 · Centro · Araras/SP · 13600-010',
    renata: 'Rua Goiás, 980 · Martins · Uberlândia/MG · 38400-028',
    beatriz: 'Rua Padre Anchieta, 33 · Batel · Curitiba/PR · 80410-030',
    sandra: 'Av. Brasil, 1500 · Funcionários · Belo Horizonte/MG · 30140-002',
  }
  const nomes: Record<string, string> = { mariana: 'Mariana Costa', juliana: 'Juliana Prado', paula: 'Paula Ribeiro', renata: 'Renata Alves', beatriz: 'Beatriz Lima', sandra: 'Sandra Moura' }
  const peds: Ped[] = [
    { id: 'p1', numero: '1051', cliente: 'mariana', endereco: 'mariana', pecas: [{ codigo: 'VES-014-M-001', descricao: 'Vestido midi floral M' }], valor: 89.9, pago_em: h(5) },
    { id: 'p2', numero: '1054', cliente: 'mariana', endereco: 'mariana', pecas: [{ codigo: 'BLU-207-P-001', descricao: 'Blusa de seda off-white P' }], valor: 59.9, pago_em: h(4) },
    { id: 'p3', numero: '1057', cliente: 'mariana', endereco: 'mariana', pecas: [{ codigo: 'CAL-088-38-001', descricao: 'Calça pantalona preta 38' }], valor: 74.9, pago_em: h(3), reservas: 1 },
    { id: 'p4', numero: '1052', cliente: 'juliana', endereco: 'juliana', valor: 219.7, pago_em: h(2), vip: true,
      pecas: [{ codigo: 'JAQ-033-G-001', descricao: 'Jaqueta jeans G' }, { codigo: 'SAI-112-M-001', descricao: 'Saia plissada M' }, { codigo: 'ACE-004-U-001', descricao: 'Cinto de couro' }] },
    { id: 'p5', numero: '1058', cliente: 'paula', endereco: 'paula', pecas: [{ codigo: 'CAM-061-M-001', descricao: 'Camisa linho azul M' }], valor: 64.9, pago_em: h(1) },
    { id: 'p6', numero: '1040', cliente: 'renata', endereco: 'renata', valor: 132.8, pago_em: h(26), exp: 'e1',
      pecas: [{ codigo: 'MAC-019-M-001', descricao: 'Macacão verde M' }, { codigo: 'ACE-021-U-001', descricao: 'Brinco dourado' }] },
    { id: 'p7', numero: '1038', cliente: 'beatriz', endereco: 'beatriz', pecas: [{ codigo: 'CAS-007-P-001', descricao: 'Casaco de lã caramelo P' }], valor: 149.9, pago_em: h(30), exp: 'e2' },
    { id: 'p8', numero: '1031', cliente: 'sandra', endereco: 'sandra', pecas: [{ codigo: 'VES-002-G-001', descricao: 'Vestido longo estampado G' }], valor: 119.9, pago_em: h(72), exp: 'e3' },
  ]
  type E = Omit<Expedicao, 'pedidos' | 'valor_itens' | 'reservas_acumuladas' | 'parceiro' | 'endereco' | 'conferidos' | 'itens_total' | 'resultado_frete'>
    & { cliente: string; bipados: string[]; etiqueta: EtiquetaEnvio | null; pix_copia_cola: string | null }
  const exps: E[] = [
    { id: 'e1', numero: 41, estado: 'frete_cobrado', parceiro_id: 'renata', cliente: 'renata', valor_frete: 18.5, frete_gratis: false, servico: 'PAC', prazo_dias: 6,
      transportadora: null, codigo_rastreio: null, url_rastreio: null, frete_link: 'https://pagamento.exemplo/frete-41', criado_em: h(25), enviada_em: null, entregue_em: null,
      peso_g: 650, comprimento_cm: 30, largura_cm: 20, altura_cm: 10, conferida_em: h(25), bipados: ['MAC-019-M-001', 'ACE-021-U-001'],
      custo_frete: null, titulo_receber: titulo(41, 'aberto', 18.5, 18.5), titulo_pagar: null, etiqueta: null,
      pix_copia_cola: '00020126580014BR.GOV.BCB.PIX0136fictic1a-0000-4000-8000-exemplo41520400005303986540518.505802BR5909ANE BRECHO6009UBERLANDIA62070503***6304AB41' },
    { id: 'e2', numero: 40, estado: 'pronta', parceiro_id: 'beatriz', cliente: 'beatriz', valor_frete: 0, frete_gratis: true, servico: 'SEDEX', prazo_dias: 3,
      transportadora: null, codigo_rastreio: null, url_rastreio: null, frete_link: null, criado_em: h(29), enviada_em: null, entregue_em: null,
      peso_g: 900, comprimento_cm: 32, largura_cm: 22, altura_cm: 12, conferida_em: h(29), bipados: ['CAS-007-P-001'],
      custo_frete: null, titulo_receber: null, titulo_pagar: null, etiqueta: null, pix_copia_cola: null },
    { id: 'e3', numero: 38, estado: 'enviada', parceiro_id: 'sandra', cliente: 'sandra', valor_frete: 24.9, frete_gratis: false, servico: 'SEDEX', prazo_dias: 2,
      transportadora: 'Correios', codigo_rastreio: 'AB123456789BR', url_rastreio: 'https://rastreamento.correios.com.br/app/index.php?objeto=AB123456789BR',
      frete_link: null, criado_em: h(70), enviada_em: h(48), entregue_em: null,
      peso_g: 700, comprimento_cm: 30, largura_cm: 20, altura_cm: 10, conferida_em: h(70), bipados: ['VES-002-G-001'],
      custo_frete: 19.4, titulo_receber: titulo(38, 'baixado', 24.9, 0), titulo_pagar: titulo(380, 'baixado', 19.4, 0),
      etiqueta: { estado: 'postada', protocolo: 'ORD-2026-000038', custo: 19.4, etiqueta_url: 'https://sandbox.melhorenvio.com.br/imprimir/fict38', codigo_rastreio: 'AB123456789BR' },
      pix_copia_cola: null },
  ]
  function titulo(numero: number, situacao: TituloFrete['situacao'], valor: number, saldo: number): TituloFrete {
    return { id: `t${numero}`, numero, situacao, valor, saldo, vencimento: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10) }
  }
  function pixFicticio(numero: number, valor: number): string {
    const cents = valor.toFixed(2)
    return `00020126580014BR.GOV.BCB.PIX0136fictic1a-0000-4000-8000-frete${String(numero).padStart(4, '0')}52040000530398654${String(cents.length).padStart(2, '0')}${cents}5802BR5909ANE BRECHO6009UBERLANDIA62070503***6304F${String(numero).padStart(3, '0')}`
  }
  const pausa = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))
  const achar = (id: string) => { const x = exps.find((e) => e.id === id); if (!x) throw new Error('envio não encontrado'); return x }
  const pecasDo = (id: string) => peds.filter((p) => p.exp === id).flatMap((p) => p.pecas)
  const reservas = (c: string) => peds.filter((p) => p.cliente === c && !p.exp).reduce((a, p) => Math.max(a, p.reservas ?? 0), 0)
  const itensConf = (x: E): ItemConferencia[] => pecasDo(x.id).map((pc) => ({
    pedido_item_id: pc.codigo, unidade_id: pc.codigo, codigo: pc.codigo, descricao: pc.descricao,
    conferido: x.bipados.includes(pc.codigo), bipado_em: x.bipados.includes(pc.codigo) ? new Date().toISOString() : null,
  })).sort((a, b) => Number(a.conferido) - Number(b.conferido) || a.codigo!.localeCompare(b.codigo!))
  const resumo = (x: E): Bipagem => {
    const itens = itensConf(x)
    return { total: itens.length, conferidos: itens.filter((i) => i.conferido).length, itens, descricao: null }
  }
  const montarLinha = (x: E): Expedicao => {
    const ps = peds.filter((p) => p.exp === x.id)
    const itens = itensConf(x)
    return { ...x, parceiro: nomes[x.cliente], endereco: ends[x.cliente], valor_itens: ps.reduce((a, p) => a + p.valor, 0),
      conferidos: itens.filter((i) => i.conferido).length, itens_total: itens.length,
      resultado_frete: x.custo_frete === null ? null : (x.valor_frete ?? 0) - x.custo_frete,
      reservas_acumuladas: ['aguardando_conferencia', 'conferida'].includes(x.estado)
        ? peds.filter((p) => p.cliente === x.cliente).reduce((a, p) => Math.max(a, p.reservas ?? 0), 0) : 0,
      pedidos: ps.map((p) => ({ id: p.id, numero: p.numero, valor: p.valor, pago_em: p.pago_em, itens: p.pecas.map((c) => c.descricao) })) }
  }
  const normal = (c: string) => c.trim().toUpperCase()

  return {
    ...apiExpedicao,
    // a cliente com peça ainda reservada paga: o pedido novo aparece em "A montar" e pode entrar no envio aberto
    simularPagamentoReserva: () => {
      const p = peds.find((x) => (x.reservas ?? 0) > 0)
      if (!p) return null
      p.reservas = 0
      peds.push({ id: `p${++n}`, numero: String(1060 + n - 100), cliente: p.cliente, endereco: p.endereco,
        pecas: [{ codigo: `BOL-${100 + n}-U-001`, descricao: 'Bolsa de palha média' }], valor: 69.9, pago_em: new Date().toISOString() })
      aoEvento('reserva_paga')
      return nomes[p.cliente]
    },
    pendentes: () => {
      const grupos = new Map<string, Ped[]>()
      peds.filter((p) => !p.exp).forEach((p) => grupos.set(p.cliente, [...(grupos.get(p.cliente) ?? []), p]))
      const l: Pendente[] = [...grupos.entries()].map(([c, ps]) => ({
        parceiro_id: c, parceiro: nomes[c], endereco_id: c, endereco: ends[c], pedidos: ps.length, itens: ps.reduce((a, p) => a + p.pecas.length, 0),
        valor_itens: ps.reduce((a, p) => a + p.valor, 0), primeiro_pago: ps.map((p) => p.pago_em).sort()[0], vip: ps.some((p) => p.vip),
        reservas_acumuladas: reservas(c),
        expedicao_aberta: exps.find((e) => e.cliente === c && ['aguardando_conferencia', 'conferida', 'frete_cobrado'].includes(e.estado))?.id ?? null,
      }))
      return pausa(l.sort((a, b) => a.primeiro_pago.localeCompare(b.primeiro_pago)))
    },
    lista: (_e, estado) => pausa(exps.filter((x) => estado ? x.estado === estado : !['entregue', 'cancelada'].includes(x.estado))
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em)).map(montarLinha)),
    montar: (_e, parceiro) => {
      let x = exps.find((e) => e.cliente === parceiro && ['aguardando_conferencia', 'conferida'].includes(e.estado))
      if (!x) {
        x = { id: `e${++n}`, numero: n - 58, estado: 'aguardando_conferencia', parceiro_id: parceiro, cliente: parceiro, valor_frete: null, frete_gratis: false,
              servico: null, prazo_dias: null, transportadora: null, codigo_rastreio: null, url_rastreio: null, frete_link: null,
              criado_em: new Date().toISOString(), enviada_em: null, entregue_em: null, peso_g: null, comprimento_cm: null, largura_cm: null, altura_cm: null,
              conferida_em: null, bipados: [], custo_frete: null, titulo_receber: null, titulo_pagar: null, etiqueta: null, pix_copia_cola: null }
        exps.push(x)
      }
      const id = x.id
      const antes = peds.filter((p) => p.exp === id).length
      peds.filter((p) => p.cliente === parceiro && !p.exp).forEach((p) => { p.exp = id })
      // peça nova num envio já conferido: a caixa muda de peso, então volta para a bancada
      if (x.estado === 'conferida' && peds.filter((p) => p.exp === id).length > antes) {
        Object.assign(x, { estado: 'aguardando_conferencia' as EstadoExpedicao, conferida_em: null, peso_g: null })
      }
      aoEvento('montou')
      return pausa(id)
    },

    porCodigo: (_e, codigo) => {
      const c = normal(codigo)
      const ped = peds.find((p) => p.pecas.some((pc) => pc.codigo === c))
      if (!ped) throw new Error(`peça ${codigo.trim()} não encontrada no estoque`)
      if (!ped.exp) throw new Error('esta peça não está em nenhum envio montado: monte o envio na aba “A montar”')
      const x = achar(ped.exp)
      if (['enviada', 'entregue'].includes(x.estado)) throw new Error(`esta peça já saiu no envio ${x.numero}`)
      return pausa({ expedicao_id: x.id, numero: x.numero, parceiro: nomes[x.cliente], estado: x.estado, unidade_id: c })
    },
    conferencia: (_e, id) => {
      const x = achar(id)
      const r = resumo(x)
      return pausa<Conferencia>({
        expedicao_id: x.id, numero: x.numero, estado: x.estado, parceiro: nomes[x.cliente], endereco: ends[x.cliente],
        total: r.total, conferidos: r.conferidos, itens: r.itens,
        peso_g: x.peso_g ?? Math.max(r.total, 1) * 350, comprimento_cm: x.comprimento_cm ?? 30,
        largura_cm: x.largura_cm ?? 20, altura_cm: x.altura_cm ?? 10,
        medidas_confirmadas: x.peso_g !== null, conferida_em: x.conferida_em,
      })
    },
    conferirPeca: (_e, id, codigo) => {
      const x = achar(id)
      if (x.estado !== 'aguardando_conferencia') throw new Error(`este envio não está em conferência (situação: ${x.estado})`)
      const c = normal(codigo)
      const aqui = pecasDo(id).find((pc) => pc.codigo === c)
      if (!aqui) {
        const outro = peds.find((p) => p.exp && p.exp !== id && p.pecas.some((pc) => pc.codigo === c))
        if (outro) { const o = achar(outro.exp!); throw new Error(`esta peça é do envio ${o.numero} (${nomes[o.cliente]}): separe na caixa certa`) }
        if (peds.some((p) => p.pecas.some((pc) => pc.codigo === c))) throw new Error('esta peça não faz parte deste envio')
        throw new Error(`peça ${codigo.trim()} não encontrada no estoque`)
      }
      if (x.bipados.includes(c)) throw new Error(`a peça ${aqui.descricao} já foi conferida`)
      x.bipados.push(c)
      aoEvento('bipou')
      const r = resumo(x)
      return pausa({ ...r, descricao: aqui.descricao })
    },
    fecharConferencia: (_e, id, pesoG, comp, larg, alt) => {
      const x = achar(id)
      if (x.estado !== 'aguardando_conferencia') throw new Error(`este envio não está em conferência (situação: ${x.estado})`)
      const r = resumo(x)
      if (r.total === 0) throw new Error('este envio está sem peças')
      if (r.conferidos < r.total) throw new Error(`faltam ${r.total - r.conferidos} peça(s) para bipar`)
      if (!(pesoG > 0)) throw new Error('informe o peso da caixa em gramas')
      if (pesoG > 30000) throw new Error('peso acima de 30 kg: confira a balança')
      Object.assign(x, { peso_g: pesoG, comprimento_cm: comp ?? 30, largura_cm: larg ?? 20, altura_cm: alt ?? 10,
        conferida_em: new Date().toISOString(), estado: 'conferida' as EstadoExpedicao })
      aoEvento('conferiu')
      return pausa({ estado: 'conferida' })
    },
    reabrirConferencia: (_e, id, motivo) => {
      const x = achar(id)
      if (x.estado !== 'conferida') throw new Error(`só dá para refazer a conferência antes de cobrar o frete (situação: ${x.estado})`)
      if (motivo.trim().length < 3) throw new Error('informe o motivo')
      Object.assign(x, { estado: 'aguardando_conferencia' as EstadoExpedicao, conferida_em: null, peso_g: null, bipados: [] })
      return pausa(undefined)
    },

    definirFrete: (_e, id, valor, servico, prazo, gratis) => {
      const x = achar(id)
      if (x.estado === 'aguardando_conferencia') throw new Error('confira as peças e informe o peso antes de cobrar o frete')
      if (!['conferida', 'frete_cobrado'].includes(x.estado)) throw new Error(`o frete deste envio não pode mais ser alterado (situação: ${x.estado})`)
      if (valor < 0) throw new Error('frete inválido')
      Object.assign(x, { servico, prazo_dias: prazo })
      if (gratis || valor === 0) {
        Object.assign(x, { valor_frete: 0, frete_gratis: true, frete_link: null, pix_copia_cola: null, titulo_receber: null, estado: 'pronta' as EstadoExpedicao })
        aoEvento('gratis')
      } else {
        Object.assign(x, { valor_frete: valor, frete_gratis: false, frete_link: `https://pagamento.exemplo/frete-${x.numero}`,
          pix_copia_cola: pixFicticio(x.numero ?? 0, valor),
          titulo_receber: titulo(x.numero ?? 0, 'aberto', valor, valor), estado: 'frete_cobrado' as EstadoExpedicao })
        aoEvento('cobrou')
      }
      return pausa({ estado: x.estado })
    },
    fretePago: (_e, id, _m, motivo) => {
      const x = achar(id)
      if (x.estado !== 'frete_cobrado') throw new Error('este envio não tem frete a receber')
      if (motivo.trim().length < 3) throw new Error('informe como o pagamento foi conferido')
      Object.assign(x, { estado: 'pronta' as EstadoExpedicao, frete_link: null, pix_copia_cola: null,
        titulo_receber: titulo(x.numero ?? 0, 'baixado', x.valor_frete ?? 0, 0) })
      aoEvento('pagou')
      return pausa('pago')
    },
    registrarCusto: (_e, id, custo, _p, _d, pago) => {
      const x = achar(id)
      if (x.estado === 'cancelada') throw new Error('envio desfeito não tem custo de frete')
      if (!(custo > 0)) throw new Error('informe o custo da postagem')
      Object.assign(x, { custo_frete: custo, titulo_pagar: titulo((x.numero ?? 0) * 10, pago ? 'baixado' : 'aberto', custo, pago ? 0 : custo) })
      aoEvento('custo')
      return pausa({ titulo_id: `t${(x.numero ?? 0) * 10}`, pago })
    },

    enviar: (_e, id, rastreio, transp) => {
      const x = achar(id)
      if (x.estado !== 'pronta') throw new Error(`o envio só sai depois do frete pago ou marcado como grátis (situação: ${x.estado})`)
      if (rastreio.trim().length < 5) throw new Error('informe o código de rastreio')
      const cod = normal(rastreio)
      Object.assign(x, { estado: 'enviada' as EstadoExpedicao, codigo_rastreio: cod, transportadora: transp, enviada_em: new Date().toISOString(),
        url_rastreio: `https://rastreamento.correios.com.br/app/index.php?objeto=${cod}` })
      aoEvento('enviou')
      return pausa(undefined)
    },
    entregue: (_e, id) => {
      const x = achar(id)
      if (x.estado !== 'enviada') throw new Error(`só um envio já despachado pode ser marcado como entregue (situação: ${x.estado})`)
      Object.assign(x, { estado: 'entregue' as EstadoExpedicao, entregue_em: new Date().toISOString() })
      return pausa(undefined)
    },
    rastreio: (_e, id) => {
      const x = achar(id)
      return pausa({
        codigo_rastreio: x.codigo_rastreio, transportadora: x.transportadora, url_rastreio: x.url_rastreio,
        eventos: x.enviada_em
          ? [...(x.entregue_em ? [{ estado: 'entregue', descricao: 'Entrega confirmada (fictícia)', ocorrido_em: x.entregue_em, fonte: 'painel' }] : []),
             { estado: 'postado', descricao: 'Postado pela expedição (fictício)', ocorrido_em: x.enviada_em, fonte: 'painel' }]
          : [],
      })
    },
    cancelar: (_e, id) => {
      const x = achar(id)
      if (['enviada', 'entregue', 'cancelada'].includes(x.estado)) throw new Error(`não é possível desfazer um envio ${x.estado}`)
      if (x.titulo_receber?.situacao === 'baixado') throw new Error('o frete já foi pago: ajuste o envio em vez de desfazer')
      Object.assign(x, { estado: 'cancelada' as EstadoExpedicao, bipados: [], titulo_receber: null, titulo_pagar: null })
      peds.filter((p) => p.exp === id).forEach((p) => { p.exp = undefined })
      aoEvento('desfez')
      return pausa(undefined)
    },
    // ---------------- fase 4: cotação e etiqueta do Melhor Envio (fictícias)
    cotar: (id) => {
      const x = achar(id)
      if (!['conferida', 'frete_cobrado'].includes(x.estado)) throw new Error('confira as peças e informe o peso antes de cotar')
      const kg = (x.peso_g ?? 700) / 1000
      const r2 = (v: number) => Math.round(v * 100) / 100
      const l: CotacaoFrete[] = [
        { id: `${id}-1`, provedor: 'melhor_envio', transportadora: 'Correios', servico: 'PAC', custo: r2(14.9 + kg * 3.5), a_cobrar: r2(14.9 + kg * 3.5), prazo_min: 6, prazo_max: 8, erro: null },
        { id: `${id}-2`, provedor: 'melhor_envio', transportadora: 'Correios', servico: 'SEDEX', custo: r2(22.4 + kg * 5.2), a_cobrar: r2(22.4 + kg * 5.2), prazo_min: 2, prazo_max: 3, erro: null },
        { id: `${id}-3`, provedor: 'melhor_envio', transportadora: 'Jadlog', servico: '.Package', custo: r2(17.8 + kg * 4), a_cobrar: r2(17.8 + kg * 4), prazo_min: 4, prazo_max: 5, erro: null },
        { id: `${id}-4`, provedor: 'correios', transportadora: 'Correios (contrato)', servico: 'SEDEX', custo: 0, a_cobrar: 0, prazo_min: 0, prazo_max: 0, erro: 'contrato sem os serviços 38202/38210 liberados' },
      ]
      aoEvento('cotou')
      return pausa(l.sort((a, b) => (a.erro ? 1 : 0) - (b.erro ? 1 : 0) || a.custo - b.custo))
    },
    escolherCotacao: (id, cotacao, aCobrar) => {
      const x = achar(id)
      const kg = (x.peso_g ?? 700) / 1000
      const r2 = (v: number) => Math.round(v * 100) / 100
      const mapa: Record<string, { t: string; s: string; c: number; p: number }> = {
        '1': { t: 'Correios', s: 'PAC', c: r2(14.9 + kg * 3.5), p: 8 },
        '2': { t: 'Correios', s: 'SEDEX', c: r2(22.4 + kg * 5.2), p: 3 },
        '3': { t: 'Jadlog', s: '.Package', c: r2(17.8 + kg * 4), p: 5 },
      }
      const esc = mapa[cotacao.slice(-1)]
      if (!esc) throw new Error('cotação não encontrada')
      Object.assign(x, { transportadora: esc.t, servico: esc.s, prazo_dias: esc.p, custo_frete: esc.c,
        valor_frete: aCobrar, frete_gratis: false, frete_link: `https://pagamento.exemplo/frete-${x.numero}`,
        pix_copia_cola: pixFicticio(x.numero ?? 0, aCobrar),
        titulo_receber: titulo(x.numero ?? 0, 'aberto', aCobrar, aCobrar),
        titulo_pagar: titulo((x.numero ?? 0) * 10, 'aberto', esc.c, esc.c),
        estado: 'frete_cobrado' as EstadoExpedicao })
      aoEvento('cobrou')
      return pausa({ estado: 'frete_cobrado' })
    },
    comprarEtiqueta: (id) => {
      const x = achar(id)
      if (x.estado !== 'pronta') throw new Error(`a etiqueta só é comprada depois do frete pago (situação: ${x.estado})`)
      if (x.etiqueta) throw new Error('a etiqueta deste envio já foi comprada')
      const cod = `AA${String(100000000 + (x.numero ?? 0) * 7919).slice(0, 9)}BR`
      const et: EtiquetaEnvio = { estado: 'gerada', protocolo: `ORD-2026-${String(x.numero ?? 0).padStart(6, '0')}`,
        custo: x.custo_frete ?? 18.4, etiqueta_url: `https://sandbox.melhorenvio.com.br/imprimir/fict${x.numero}`, codigo_rastreio: cod }
      Object.assign(x, { etiqueta: et, custo_frete: et.custo, transportadora: x.transportadora ?? 'Correios',
        titulo_pagar: titulo((x.numero ?? 0) * 10, 'baixado', et.custo ?? 0, 0) })
      aoEvento('etiqueta')
      return pausa(et)
    },
    // ---------------- Getnet: a cliente paga o frete pelo link e a notificação solta o envio sozinha
    simularPagamentoGetnet: (id) => {
      const x = achar(id)
      if (x.estado !== 'frete_cobrado') throw new Error('este envio não tem frete a receber')
      Object.assign(x, { estado: 'pronta' as EstadoExpedicao, frete_link: null, pix_copia_cola: null,
        titulo_receber: titulo(x.numero ?? 0, 'baixado', x.valor_frete ?? 0, 0) })
      aoEvento('pagou')
      return pausa('ok')
    },
    cfg: () => pausa({
      peso_padrao_peca_g: 350, comprimento_padrao_cm: 30, largura_padrao_cm: 20, altura_padrao_cm: 10, url_rastreio_modelo: null,
      natureza_receita_frete_id: null, natureza_receita_frete: 'RECEITAS > Receita operacional > Frete e outras receitas > Frete cobrado do cliente',
      natureza_custo_frete_id: null, natureza_custo_frete: 'DESPESAS OPERACIONAIS > Despesas com vendas > Logística de entrega > Frete de envio',
      cr_receita_frete_id: null, cr_custo_frete_id: null,
      parceiro_transportadora_id: null, parceiro_transportadora: 'Correios (fictício)', conta_frete_id: null,
    }),
    salvarCfg: () => pausa(undefined),
  }
}
