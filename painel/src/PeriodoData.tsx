import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IEsq, IDir, IAgenda } from './icones'

// Seletor de período (intervalo de datas) com atalhos e calendário, no padrão do ZStock/ZAgent.
// Datas trafegam como 'AAAA-MM-DD' (string) para não depender de fuso.

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const LARGURA = 580

const p2 = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const dt = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const soma = (s: string, n: number) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d) }
const br = (s: string) => (s ? s.split('-').reverse().join('/') : '')
const doBr = (t: string): string | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t.trim()); if (!m) return null
  const d = new Date(+m[3], +m[2] - 1, +m[1])
  return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? iso(d) : null
}
const ordena = (a: string, b: string) => (a <= b ? { ini: a, fim: b } : { ini: b, fim: a })

type Atalho = 'hoje' | 'ontem' | 'semana' | 'semana_ant' | 'ult7' | 'ult30' | 'mes' | 'mes_ant' | 'ult3m' | 'ano'
const ATALHOS: ReadonlyArray<readonly [Atalho, string]> = [
  ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Esta semana'], ['semana_ant', 'Semana anterior'], ['ult7', 'Últimos 7 dias'],
  ['ult30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['ult3m', 'Últimos 3 meses'], ['ano', 'Este ano'],
]
function faixa(k: Atalho): { ini: string; fim: string } {
  const hoje = iso(new Date()); const [y, m] = hoje.split('-').map(Number); const dow = dt(hoje).getDay()
  switch (k) {
    case 'hoje': return { ini: hoje, fim: hoje }
    case 'ontem': return { ini: soma(hoje, -1), fim: soma(hoje, -1) }
    case 'semana': return { ini: soma(hoje, -dow), fim: soma(hoje, 6 - dow) }
    case 'semana_ant': return { ini: soma(hoje, -dow - 7), fim: soma(hoje, -dow - 1) }
    case 'ult7': return { ini: soma(hoje, -6), fim: hoje }
    case 'ult30': return { ini: soma(hoje, -29), fim: hoje }
    case 'mes': return { ini: iso(new Date(y, m - 1, 1)), fim: iso(new Date(y, m, 0)) }
    case 'mes_ant': return { ini: iso(new Date(y, m - 2, 1)), fim: iso(new Date(y, m - 1, 0)) }
    case 'ult3m': return { ini: soma(iso(new Date(y, m - 4, Math.min(dt(hoje).getDate(), new Date(y, m - 3, 0).getDate()))), 1), fim: hoje }
    default: return { ini: `${y}-01-01`, fim: `${y}-12-31` }
  }
}
const atalhoAtivo = (ini: string, fim: string) => ATALHOS.find(([k]) => { const f = faixa(k); return f.ini === ini && f.fim === fim })?.[0] ?? null

export default function PeriodoData({ ini, fim, onAplicar, rotulo = 'Período', vazio = 'Todas as datas' }: {
  ini: string; fim: string; onAplicar: (ini: string, fim: string) => void; rotulo?: string; vazio?: string
}) {
  const [aberto, setAberto] = useState(false)
  const gatilho = useRef<HTMLButtonElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; largura: number } | null>(null)
  const [dIni, setDIni] = useState(ini); const [dFim, setDFim] = useState(fim)
  const [tIni, setTIni] = useState(br(ini)); const [tFim, setTFim] = useState(br(fim))
  const [mes, setMes] = useState(() => { const b = ini ? dt(ini) : new Date(); return new Date(b.getFullYear(), b.getMonth(), 1) })
  const [editando, setEditando] = useState<'ini' | 'fim'>('ini')
  const [pairar, setPairar] = useState<string | null>(null)

  const abrir = () => {
    setDIni(ini); setDFim(fim); setTIni(br(ini)); setTFim(br(fim)); setEditando('ini'); setPairar(null)
    const b = ini ? dt(ini) : new Date(); setMes(new Date(b.getFullYear(), b.getMonth(), 1)); setAberto(true)
  }
  const fechar = () => { setAberto(false); setPos(null) }

  const posicionar = () => {
    const g = gatilho.current; if (!g) return
    const r = g.getBoundingClientRect(); const largura = Math.min(LARGURA, window.innerWidth - 16)
    const alto = painel.current?.offsetHeight ?? 420
    const abaixo = window.innerHeight - r.bottom - 12; const acima = r.top - 12
    const top = alto <= abaixo || abaixo >= acima ? r.bottom + 8 : Math.max(8, r.top - alto - 8)
    setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - largura - 8)), largura })
  }
  useLayoutEffect(() => { if (aberto) posicionar() }, [aberto, mes])
  useEffect(() => {
    if (!aberto) return
    const clique = (e: MouseEvent) => { const t = e.target as Node; if (!painel.current?.contains(t) && !gatilho.current?.contains(t)) fechar() }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { fechar(); gatilho.current?.focus() } }
    window.addEventListener('mousedown', clique); window.addEventListener('keydown', tecla)
    window.addEventListener('resize', posicionar); window.addEventListener('scroll', posicionar, true)
    return () => { window.removeEventListener('mousedown', clique); window.removeEventListener('keydown', tecla); window.removeEventListener('resize', posicionar); window.removeEventListener('scroll', posicionar, true) }
  }, [aberto])

  const celulas = useMemo(() => {
    const y = mes.getFullYear(); const m = mes.getMonth(); const ini1 = new Date(y, m, 1 - new Date(y, m, 1).getDay())
    const total = Math.ceil((new Date(y, m, 1).getDay() + new Date(y, m + 1, 0).getDate()) / 7) * 7
    return Array.from({ length: total }, (_, i) => { const d = new Date(ini1.getFullYear(), ini1.getMonth(), ini1.getDate() + i); return { k: iso(d), dia: d.getDate(), dentro: d.getMonth() === m } })
  }, [mes])

  const definir = (a: string, b: string) => { setDIni(a); setDFim(b); setTIni(br(a)); setTFim(br(b)) }
  const clicarDia = (k: string) => {
    if (editando === 'ini') { if (dFim && k > dFim) definir(k, k); else definir(k, dFim || k); setEditando('fim') }
    else { const o = ordena(dIni || k, k); definir(o.ini, o.fim); setEditando('ini') }
    setPairar(null)
  }
  const digitou = (qual: 'ini' | 'fim', t: string) => {
    const mascara = t.replace(/[^\d]/g, '').slice(0, 8).replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3')
    if (qual === 'ini') setTIni(mascara); else setTFim(mascara)
    const v = doBr(mascara); if (!v) return
    if (qual === 'ini') { setDIni(v); if (dFim && v > dFim) { setDFim(v); setTFim(br(v)) } } else { setDFim(v); if (dIni && v < dIni) { setDIni(v); setTIni(br(v)) } }
    const b = dt(v); setMes(new Date(b.getFullYear(), b.getMonth(), 1))
  }
  const aplicar = () => { const a = dIni || dFim; const b = dFim || dIni; if (a && b) { const o = ordena(a, b); onAplicar(o.ini, o.fim) } fechar() }
  const limpar = () => { onAplicar('', ''); fechar() }

  const previaFim = editando === 'fim' && dIni && !dFim ? pairar : null
  const [pIni, pFim] = dIni && dFim ? [dIni, dFim] : dIni && previaFim ? [ordena(dIni, previaFim).ini, ordena(dIni, previaFim).fim] : [dIni, dIni]
  const hoje = iso(new Date()); const ativo = atalhoAtivo(dIni, dFim)
  const texto = ini && fim ? (ini === fim ? br(ini) : `${br(ini)} – ${br(fim)}`) : vazio

  return (
    <div className="periodo">
      <button ref={gatilho} type="button" className={ini ? 'sec periodo-btn aplicado' : 'sec periodo-btn'} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => (aberto ? fechar() : abrir())}>
        <IAgenda /><span className="periodo-txt"><small>{rotulo}</small><strong>{texto}</strong></span>
      </button>
      {ini && <button type="button" className="sec icone-btn periodo-x" aria-label={`Limpar ${rotulo.toLowerCase()}`} title="Limpar período" onClick={() => onAplicar('', '')}>×</button>}
      {aberto && createPortal(
        <div ref={painel} className="periodo-pop" role="dialog" aria-label={rotulo} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.largura ?? LARGURA, visibility: pos ? 'visible' : 'hidden' }}>
          <div className="periodo-atalhos" role="listbox" aria-label="Atalhos de período">
            {ATALHOS.map(([k, nome]) => (
              <button key={k} type="button" role="option" aria-selected={ativo === k} className={ativo === k ? 'ativo' : ''}
                onClick={() => { const f = faixa(k); definir(f.ini, f.fim); const b = dt(f.ini); setMes(new Date(b.getFullYear(), b.getMonth(), 1)); setEditando('ini') }}>{nome}</button>
            ))}
          </div>
          <div className="periodo-cal">
            <div className="periodo-campos">
              <label className={editando === 'ini' ? 'foco' : ''}><span>De</span><input inputMode="numeric" placeholder="dd/mm/aaaa" value={tIni} onFocus={() => setEditando('ini')} onChange={(e) => digitou('ini', e.target.value)} /></label>
              <label className={editando === 'fim' ? 'foco' : ''}><span>Até</span><input inputMode="numeric" placeholder="dd/mm/aaaa" value={tFim} onFocus={() => setEditando('fim')} onChange={(e) => digitou('fim', e.target.value)} /></label>
            </div>
            <div className="periodo-mes">
              <button type="button" className="sec icone-btn" aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><IEsq /></button>
              <strong>{MESES[mes.getMonth()]} {mes.getFullYear()}</strong>
              <button type="button" className="sec icone-btn" aria-label="Próximo mês" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><IDir /></button>
            </div>
            <div className="periodo-grade" onMouseLeave={() => setPairar(null)}>
              {DIAS.map((d, i) => <div key={i} className="periodo-sem">{d}</div>)}
              {celulas.map((c) => {
                const dentroFaixa = !!pIni && !!pFim && c.k >= pIni && c.k <= pFim
                const cls = ['periodo-dia', !c.dentro && 'fora', c.k === hoje && 'hoje', dentroFaixa && 'faixa', (c.k === dIni || c.k === dFim) && 'ponta', c.k === dIni && 'ini', c.k === dFim && 'fim'].filter(Boolean).join(' ')
                return <button key={c.k} type="button" className={cls} onMouseEnter={() => setPairar(c.k)} onClick={() => clicarDia(c.k)} aria-pressed={c.k === dIni || c.k === dFim}>{c.dia}</button>
              })}
            </div>
            <div className="periodo-rodape">
              <button type="button" className="link" onClick={limpar}>Limpar</button>
              <span className="periodo-espaco" />
              <button type="button" className="sec" onClick={fechar}>Cancelar</button>
              <button type="button" onClick={aplicar} disabled={!dIni && !dFim}>Aplicar</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  )
}
