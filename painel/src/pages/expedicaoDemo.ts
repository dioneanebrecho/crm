// Simulação da Expedição: clientes e pedidos fictícios, só na memória do navegador. Nada é gravado nem cobrado.
// Segue as mesmas regras do banco (venda.mov_expedicao): montar → definir frete (ou grátis) → frete pago → enviar com rastreio.
import { apiExpedicao, type EstadoExpedicao, type Expedicao, type Pendente } from '../apiExpedicao'

type Fonte = typeof apiExpedicao
const h = (horas: number) => new Date(Date.now() - horas * 3600_000).toISOString()
interface Ped { id: string; numero: string; cliente: string; endereco: string; itens: string[]; valor: number; pago_em: string; vip?: boolean; reservas?: number; exp?: string }

export type FonteDemoExpedicao = Fonte & { simularPagamentoReserva: () => string | null }

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
    { id: 'p1', numero: '1051', cliente: 'mariana', endereco: 'mariana', itens: ['Vestido midi floral M'], valor: 89.9, pago_em: h(5) },
    { id: 'p2', numero: '1054', cliente: 'mariana', endereco: 'mariana', itens: ['Blusa de seda off-white P'], valor: 59.9, pago_em: h(4) },
    { id: 'p3', numero: '1057', cliente: 'mariana', endereco: 'mariana', itens: ['Calça pantalona preta 38'], valor: 74.9, pago_em: h(3), reservas: 1 },
    { id: 'p4', numero: '1052', cliente: 'juliana', endereco: 'juliana', itens: ['Jaqueta jeans G', 'Saia plissada M', 'Cinto couro'], valor: 219.7, pago_em: h(2), vip: true },
    { id: 'p5', numero: '1058', cliente: 'paula', endereco: 'paula', itens: ['Camisa linho azul M'], valor: 64.9, pago_em: h(1) },
    { id: 'p6', numero: '1040', cliente: 'renata', endereco: 'renata', itens: ['Macacão verde M', 'Brinco dourado'], valor: 132.8, pago_em: h(26), exp: 'e1' },
    { id: 'p7', numero: '1038', cliente: 'beatriz', endereco: 'beatriz', itens: ['Casaco lã caramelo P'], valor: 149.9, pago_em: h(30), exp: 'e2' },
    { id: 'p8', numero: '1031', cliente: 'sandra', endereco: 'sandra', itens: ['Vestido longo estampado G'], valor: 119.9, pago_em: h(72), exp: 'e3' },
  ]
  type E = Omit<Expedicao, 'pedidos' | 'valor_itens' | 'reservas_acumuladas' | 'parceiro' | 'endereco'> & { cliente: string }
  const exps: E[] = [
    { id: 'e1', numero: 41, estado: 'frete_cobrado', parceiro_id: 'renata', cliente: 'renata', valor_frete: 18.5, frete_gratis: false, servico: 'PAC', prazo_dias: 6,
      transportadora: null, codigo_rastreio: null, frete_link: 'https://pagamento.exemplo/frete-41', criado_em: h(25), enviada_em: null },
    { id: 'e2', numero: 40, estado: 'pronta', parceiro_id: 'beatriz', cliente: 'beatriz', valor_frete: 0, frete_gratis: true, servico: 'SEDEX', prazo_dias: 3,
      transportadora: null, codigo_rastreio: null, frete_link: null, criado_em: h(29), enviada_em: null },
    { id: 'e3', numero: 38, estado: 'enviada', parceiro_id: 'sandra', cliente: 'sandra', valor_frete: 24.9, frete_gratis: false, servico: 'SEDEX', prazo_dias: 2,
      transportadora: 'Correios', codigo_rastreio: 'AB123456789BR', frete_link: null, criado_em: h(70), enviada_em: h(48) },
  ]
  const pausa = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))
  const achar = (id: string) => { const x = exps.find((e) => e.id === id); if (!x) throw new Error('envio não encontrado'); return x }
  const reservas = (c: string) => peds.filter((p) => p.cliente === c && !p.exp).reduce((a, p) => Math.max(a, p.reservas ?? 0), 0)
  const montarLinha = (x: E): Expedicao => {
    const ps = peds.filter((p) => p.exp === x.id)
    return { ...x, parceiro: nomes[x.cliente], endereco: ends[x.cliente], valor_itens: ps.reduce((a, p) => a + p.valor, 0),
      reservas_acumuladas: x.estado === 'aguardando_frete' ? peds.filter((p) => p.cliente === x.cliente).reduce((a, p) => Math.max(a, p.reservas ?? 0), 0) : 0,
      pedidos: ps.map((p) => ({ id: p.id, numero: p.numero, valor: p.valor, pago_em: p.pago_em, itens: p.itens })) }
  }
  return {
    ...apiExpedicao,
    // a cliente com peça ainda reservada paga: o pedido novo aparece em "A montar" e pode entrar no envio aberto
    simularPagamentoReserva: () => {
      const p = peds.find((x) => (x.reservas ?? 0) > 0)
      if (!p) return null
      p.reservas = 0
      peds.push({ id: `p${++n}`, numero: String(1060 + n - 100), cliente: p.cliente, endereco: p.endereco, itens: ['Bolsa de palha média'], valor: 69.9, pago_em: new Date().toISOString() })
      aoEvento('reserva_paga')
      return nomes[p.cliente]
    },
    pendentes: () => {
      const grupos = new Map<string, Ped[]>()
      peds.filter((p) => !p.exp).forEach((p) => grupos.set(p.cliente, [...(grupos.get(p.cliente) ?? []), p]))
      const l: Pendente[] = [...grupos.entries()].map(([c, ps]) => ({
        parceiro_id: c, parceiro: nomes[c], endereco_id: c, endereco: ends[c], pedidos: ps.length, itens: ps.reduce((a, p) => a + p.itens.length, 0),
        valor_itens: ps.reduce((a, p) => a + p.valor, 0), primeiro_pago: ps.map((p) => p.pago_em).sort()[0], vip: ps.some((p) => p.vip),
        reservas_acumuladas: reservas(c), expedicao_aberta: exps.find((e) => e.cliente === c && ['aguardando_frete', 'frete_cobrado'].includes(e.estado))?.id ?? null,
      }))
      return pausa(l.sort((a, b) => a.primeiro_pago.localeCompare(b.primeiro_pago)))
    },
    lista: (_e, estado) => pausa(exps.filter((x) => estado ? x.estado === estado : !['entregue', 'cancelada'].includes(x.estado))
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em)).map(montarLinha)),
    montar: (_e, parceiro) => {
      let x = exps.find((e) => e.cliente === parceiro && e.estado === 'aguardando_frete')
      if (!x) {
        x = { id: `e${++n}`, numero: n - 58, estado: 'aguardando_frete', parceiro_id: parceiro, cliente: parceiro, valor_frete: null, frete_gratis: false,
              servico: null, prazo_dias: null, transportadora: null, codigo_rastreio: null, frete_link: null, criado_em: new Date().toISOString(), enviada_em: null }
        exps.push(x)
      }
      const id = x.id
      peds.filter((p) => p.cliente === parceiro && !p.exp).forEach((p) => { p.exp = id })
      aoEvento('montou')
      return pausa(id)
    },
    definirFrete: (_e, id, valor, servico, prazo, gratis) => {
      const x = achar(id)
      if (!['aguardando_frete', 'frete_cobrado'].includes(x.estado)) throw new Error(`o frete deste envio não pode mais ser alterado (situação: ${x.estado})`)
      if (valor < 0) throw new Error('frete inválido')
      Object.assign(x, { servico, prazo_dias: prazo })
      if (gratis || valor === 0) { Object.assign(x, { valor_frete: 0, frete_gratis: true, frete_link: null, estado: 'pronta' as EstadoExpedicao }); aoEvento('gratis') }
      else { Object.assign(x, { valor_frete: valor, frete_gratis: false, frete_link: `https://pagamento.exemplo/frete-${x.numero}`, estado: 'frete_cobrado' as EstadoExpedicao }); aoEvento('cobrou') }
      return pausa({ estado: x.estado })
    },
    fretePago: (_e, id, _m, motivo) => {
      const x = achar(id)
      if (x.estado !== 'frete_cobrado') throw new Error('este envio não tem frete a receber')
      if (motivo.trim().length < 3) throw new Error('informe como o pagamento foi conferido')
      x.estado = 'pronta'; x.frete_link = null; aoEvento('pagou')
      return pausa('pago')
    },
    enviar: (_e, id, rastreio, transp) => {
      const x = achar(id)
      if (x.estado !== 'pronta') throw new Error(`o envio só sai depois do frete pago ou marcado como grátis (situação: ${x.estado})`)
      if (rastreio.trim().length < 5) throw new Error('informe o código de rastreio')
      Object.assign(x, { estado: 'enviada' as EstadoExpedicao, codigo_rastreio: rastreio.trim().toUpperCase(), transportadora: transp, enviada_em: new Date().toISOString() })
      aoEvento('enviou')
      return pausa(undefined)
    },
    cancelar: (_e, id) => {
      const x = achar(id)
      if (['enviada', 'entregue', 'cancelada'].includes(x.estado)) throw new Error(`não é possível desfazer um envio ${x.estado}`)
      if (x.estado === 'pronta' && !x.frete_gratis) throw new Error('o frete já foi pago: ajuste o envio em vez de desfazer')
      x.estado = 'cancelada'; peds.filter((p) => p.exp === id).forEach((p) => { p.exp = undefined }); aoEvento('desfez')
      return pausa(undefined)
    },
  }
}
