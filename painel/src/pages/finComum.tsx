import { useEffect, useMemo, useRef, useState } from 'react'
import { apiParceiros } from '../api'
import { apiTitulos, ROTULO_SITUACAO, moeda, num, r2, type AcaoFin, type CadastrosFin, type OpcaoNat, type TipoTitulo } from '../apiTitulos'
import { useCarregar } from '../ui'
import { ComboBusca } from '../ComboBusca'
import './financeiro.css'

// Peças comuns das telas do financeiro de títulos (pedido 050).

export const SeloSit = ({ s }: { s: string }) => <span className={`fin-sit ${s}`}>{ROTULO_SITUACAO[s] ?? (s === 'pendente' ? 'Pendente' : s === 'conciliada' ? 'Conciliada' : s === 'ignorada' ? 'Ignorada' : s)}</span>

export const Valor = ({ v, sinal = false }: { v: number | null | undefined; sinal?: boolean }) =>
  <span className={`fin-valor${sinal && v != null ? (v < 0 ? ' neg' : v > 0 ? ' pos' : '') : ''}`}>{moeda(v)}</span>

/** pode editar (cadastros): papel financeiro/gestor/admin e a matriz liberando "editar" na tela */
export function podeEditar(ctx: { papeis: string[]; perm: Record<string, string> | null }, tela: string) {
  const papel = ['admin', 'gestor', 'financeiro', 'superadmin'].some((p) => ctx.papeis.includes(p))
  return papel && (ctx.perm === null || ctx.perm[tela] === 'editar')
}

/** Ações do financeiro liberadas para o usuário logado (pedido 052) */
export interface Acoes { has: (a: AcaoFin) => boolean; carregando: boolean }
export function useAcoes(ctx: { empresa: string }): Acoes {
  const r = useCarregar(() => apiTitulos.minhasAcoes(ctx.empresa).catch(() => [] as AcaoFin[]), [ctx.empresa])
  return useMemo(() => { const s = new Set(r.dados ?? []); return { has: (a: AcaoFin) => s.has(a), carregando: r.dados === null } }, [r.dados])
}

/** Campo numérico em reais: guarda o texto digitado e devolve o número */
export function CampoValor({ valor, onMudar, rotulo, placeholder = '0,00', desabilitado, obrigatorio }: {
  valor: number | null; onMudar: (n: number | null) => void; rotulo?: string; placeholder?: string; desabilitado?: boolean; obrigatorio?: boolean
}) {
  const fmt = (n: number | null) => (n == null ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  const [t, setT] = useState(fmt(valor))
  const foco = useRef(false)
  useEffect(() => { if (!foco.current) setT(fmt(valor)) }, [valor])
  const input = <input inputMode="decimal" className="v" value={t} placeholder={placeholder} disabled={desabilitado} required={obrigatorio} aria-label={rotulo}
    onFocus={() => { foco.current = true }} onBlur={() => { foco.current = false; setT(fmt(valor)) }}
    onChange={(e) => { setT(e.target.value); const n = num(e.target.value); onMudar(n == null ? null : r2(n)) }} style={{ textAlign: 'right' }} />
  return rotulo ? <label className="campo"><span>{rotulo}</span>{input}</label> : input
}

/** Busca de parceiro pelo nome, documento ou @ (lista de parceiros do CRM) */
export function ParceiroBusca({ empresa, valor, nome, onEscolher, papel }: {
  empresa: string; valor: string | null; nome?: string | null; onEscolher: (id: string, nome: string) => void; papel?: string
}) {
  const [texto, setTexto] = useState(nome ?? '')
  const [lista, setLista] = useState<{ id: string; nome: string; ident: string }[]>([])
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => { setTexto(nome ?? '') }, [nome])
  useEffect(() => {
    if (!aberto) return
    const q = texto.trim()
    const t = setTimeout(() => {
      apiParceiros.listar(empresa, { busca: q, papel: papel ?? '', ativo: 'sim', tipo: '', minContatos: '', soRevisao: false }, 0, 15)
        .then((l) => setLista(l.map((p) => ({ id: p.id, nome: p.nome, ident: (p.identificadores ?? []).slice(0, 2).join(' · ') }))))
        .catch(() => setLista([]))
    }, 250)
    return () => clearTimeout(t)
  }, [texto, aberto, empresa, papel])
  useEffect(() => {
    const fora = (e: Event) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [])
  return (
    <div className="fin-parceiro" ref={caixa}>
      <input value={texto} placeholder="Buscar parceiro por nome, documento ou @" onFocus={() => setAberto(true)}
        onChange={(e) => { setTexto(e.target.value); setAberto(true) }} aria-label="Parceiro" required={!valor} />
      {aberto && lista.length > 0 && (
        <ul role="listbox">
          {lista.map((p) => <li key={p.id}><button type="button" onClick={() => { onEscolher(p.id, p.nome); setTexto(p.nome); setAberto(false) }}>{p.nome}{p.ident && <small>{p.ident}</small>}</button></li>)}
        </ul>)}
    </div>
  )
}

export const opcoesNat = (cad: CadastrosFin, tipo?: TipoTitulo) =>
  cad.naturezas.filter((n) => !tipo || n.sinal === 0 || (tipo === 'R' ? n.sinal > 0 : n.sinal < 0) || n.reconhece_em === 'nao_dre')
    .map((n) => ({ valor: n.id, rotulo: `${n.codigo} · ${n.nome}`, extra: n.caminho }))
export const opcoesCr = (cad: CadastrosFin) => cad.centros.map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nome}`, extra: c.caminho }))

export interface LinhaRateioForm { natureza_id: string; cr_id: string; projeto_id: string; percentual: number | null }

/** Rateio por natureza, centro de resultado e projeto; os percentuais precisam somar 100 */
export function EditorRateio({ cad, tipo, linhas, onMudar, total }: {
  cad: CadastrosFin; tipo: TipoTitulo; linhas: LinhaRateioForm[]; onMudar: (l: LinhaRateioForm[]) => void; total: number | null
}) {
  const nats = opcoesNat(cad, tipo), crs = opcoesCr(cad)
  const soma = r2(linhas.reduce((s, l) => s + (l.percentual ?? 0), 0))
  const muda = (i: number, p: Partial<LinhaRateioForm>) => onMudar(linhas.map((l, j) => {
    if (j !== i) return l
    const n = { ...l, ...p }
    // natureza nova traz o centro de resultado padrão quando ainda não há um
    if (p.natureza_id && !l.cr_id) { const nat = cad.naturezas.find((x: OpcaoNat) => x.id === p.natureza_id); if (nat?.cr_padrao_id) n.cr_id = nat.cr_padrao_id }
    return n
  }))
  return (
    <div>
      <table className="fin-tabela">
        <thead><tr><th>Natureza</th><th>Centro de resultado</th><th>Projeto</th><th className="d">%</th><th className="d">Valor</th><th /></tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td style={{ minWidth: 220 }}><ComboBusca opcoes={nats} valor={l.natureza_id} onEscolher={(v) => muda(i, { natureza_id: v })} placeholder="Natureza analítica" ariaLabel="Natureza" /></td>
              <td style={{ minWidth: 190 }}><ComboBusca opcoes={crs} valor={l.cr_id} onEscolher={(v) => muda(i, { cr_id: v })} placeholder="Centro de resultado" ariaLabel="Centro de resultado" /></td>
              <td><select value={l.projeto_id} onChange={(e) => muda(i, { projeto_id: e.target.value })} aria-label="Projeto">
                <option value="">—</option>{cad.projetos.filter((p) => p.situacao === 'ativo' || p.id === l.projeto_id).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
              </select></td>
              <td className="d"><input className="v" style={{ width: 70 }} inputMode="decimal" value={l.percentual ?? ''} onChange={(e) => muda(i, { percentual: num(e.target.value) })} aria-label="Percentual" /></td>
              <td className="d">{total != null && l.percentual != null ? moeda(r2(total * l.percentual / 100)) : '—'}</td>
              <td>{linhas.length > 1 && <button type="button" className="link" onClick={() => onMudar(linhas.filter((_, j) => j !== i))} aria-label="Remover linha">×</button>}</td>
            </tr>))}
        </tbody>
        <tfoot><tr><td colSpan={3}>
          <button type="button" className="link" onClick={() => onMudar([...linhas, { natureza_id: '', cr_id: '', projeto_id: '', percentual: r2(Math.max(0, 100 - soma)) }])}>+ Linha de rateio</button>
        </td><td className="d" style={{ color: soma === 100 ? undefined : 'var(--erro)' }}>{soma}%</td><td /><td /></tr></tfoot>
      </table>
      {soma !== 100 && <small style={{ color: 'var(--erro)' }}>Os percentuais precisam somar 100%.</small>}
    </div>
  )
}

export const rateioValido = (l: LinhaRateioForm[]) => l.length > 0 && l.every((x) => x.natureza_id && x.cr_id && (x.percentual ?? 0) > 0)
  && r2(l.reduce((s, x) => s + (x.percentual ?? 0), 0)) === 100
export const rateioParaApi = (l: LinhaRateioForm[]) => l.map((x) => ({ natureza_id: x.natureza_id, cr_id: x.cr_id, projeto_id: x.projeto_id || null, percentual: x.percentual }))
