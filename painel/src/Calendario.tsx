import { useState } from 'react'
import { IEsq, IDir } from './icones'

export interface EventoCal { titulo: string; hora?: string }
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Calendario({ eventos = {}, selecionado, onSelecionar }: {
  eventos?: Record<string, EventoCal[]>; selecionado: string; onSelecionar: (dia: string) => void
}) {
  const hoje = new Date()
  const [ref, setRef] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1 - ref.getDay())
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
  const mover = (n: number) => setRef(new Date(ref.getFullYear(), ref.getMonth() + n, 1))
  return (
    <div className="calendario">
      <div className="cal-topo">
        <strong>{MESES[ref.getMonth()]} {ref.getFullYear()}</strong>
        <div className="cal-nav">
          <button className="sec icone-btn" onClick={() => mover(-1)} aria-label="Mês anterior"><IEsq /></button>
          <button className="sec" onClick={() => { setRef(new Date(hoje.getFullYear(), hoje.getMonth(), 1)); onSelecionar(chaveDia(hoje)) }}>Hoje</button>
          <button className="sec icone-btn" onClick={() => mover(1)} aria-label="Próximo mês"><IDir /></button>
        </div>
      </div>
      <div className="cal-grade">
        {SEMANA.map((s) => <div key={s} className="cal-sem">{s}</div>)}
        {dias.map((d) => {
          const k = chaveDia(d); const ev = eventos[k] ?? []
          const cls = ['cal-dia', d.getMonth() !== ref.getMonth() && 'fora', k === chaveDia(hoje) && 'hoje', k === selecionado && 'sel'].filter(Boolean).join(' ')
          return (
            <button key={k} className={cls} onClick={() => onSelecionar(k)}>
              <span>{d.getDate()}</span>
              {ev.length > 0 && <i title={`${ev.length} evento(s)`}>{ev.length}</i>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
