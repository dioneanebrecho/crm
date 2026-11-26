import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { IEsq, IDir } from './icones'

// Calendário com três visões: Mês (padrão), Semana e Dia.
// - Clicar numa área vazia (célula do mês, coluna da semana, faixa de hora do dia) chama `onNovo` com o dia (e a hora, no Dia).
// - Clicar num item chama `onEvento`; itens `arrastavel` podem ser soltos em outro dia (Mês/Semana) ou outra hora (Dia).
export type Visao = 'mes' | 'semana' | 'dia'
export type Situacao = 'atrasado' | 'em_breve' | 'aguardando' | 'concluido' | 'normal'
export interface EventoCal {
  id: string; titulo: string; inicio: Date; fim?: Date | null; diaInteiro?: boolean; cor?: string
  situacao?: Situacao; arrastavel?: boolean; detalhe?: string
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SEMANA_LONGA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const TIPO_ARRASTO = 'application/x-ane-evento'
const HORAS = Array.from({ length: 24 }, (_, h) => h)
const d2 = (n: number) => String(n).padStart(2, '0')

export const chaveDia = (d: Date) => `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`
const deChave = (k: string) => { const [a, m, d] = k.split('-').map(Number); return new Date(a, (m || 1) - 1, d || 1) }
const somaDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
/** Primeiro dia exibido na grade de 6 semanas do mês de `ref` (o domingo anterior ou igual ao dia 1). */
export const inicioGrade = (ref: Date) => new Date(ref.getFullYear(), ref.getMonth(), 1 - new Date(ref.getFullYear(), ref.getMonth(), 1).getDay())
const inicioSemana = (d: Date) => somaDias(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay())
const hhmm = (d: Date) => `${d2(d.getHours())}:${d2(d.getMinutes())}`

/** Período [de, ate) exibido por uma visão em torno de `ref`. */
export function periodo(visao: Visao, ref: Date): { de: Date; ate: Date } {
  if (visao === 'mes') { const de = inicioGrade(ref); return { de, ate: somaDias(de, 42) } }
  if (visao === 'semana') { const de = inicioSemana(ref); return { de, ate: somaDias(de, 7) } }
  const de = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()); return { de, ate: somaDias(de, 1) }
}

export default function Calendario({ eventos, visao, onMudarVisao, selecionado, onSelecionar, onPeriodo, onEvento, onSoltar, onNovo, maxPorDia = 3 }: {
  eventos: EventoCal[]; visao: Visao; onMudarVisao: (v: Visao) => void
  selecionado: string; onSelecionar: (dia: string) => void
  /** Avisado quando o período exibido muda (e na montagem). */
  onPeriodo: (de: Date, ate: Date) => void
  onEvento?: (id: string) => void
  onSoltar?: (id: string, dia: string, hora?: number) => void
  onNovo?: (dia: string, hora?: number) => void
  maxPorDia?: number
}) {
  const hoje = new Date()
  // âncora: no Mês, o 1º dia do mês exibido; na Semana e no Dia, o próprio dia selecionado
  const [ref, setRef] = useState(() => deChave(selecionado))
  const [alvo, setAlvo] = useState<string | null>(null)
  useEffect(() => { if (visao !== 'mes') setRef(deChave(selecionado)) }, [visao, selecionado])
  const { de, ate } = periodo(visao, ref)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onPeriodo(de, ate) }, [de.getTime(), ate.getTime()])

  const porDia = useMemo(() => {
    const m: Record<string, EventoCal[]> = {}
    for (const e of [...eventos].sort((a, b) => Number(!a.diaInteiro) - Number(!b.diaInteiro) || a.inicio.getTime() - b.inicio.getTime())) (m[chaveDia(e.inicio)] ??= []).push(e)
    return m
  }, [eventos])

  function navegar(n: number) {
    if (visao === 'mes') { setRef(new Date(ref.getFullYear(), ref.getMonth() + n, 1)); return }
    const novo = somaDias(ref, visao === 'semana' ? 7 * n : n)
    setRef(novo); onSelecionar(chaveDia(novo))
  }
  const irHoje = () => { setRef(visao === 'mes' ? new Date(hoje.getFullYear(), hoje.getMonth(), 1) : hoje); onSelecionar(chaveDia(hoje)) }
  const titulo = visao === 'mes' ? `${MESES[ref.getMonth()]} ${ref.getFullYear()}`
    : visao === 'semana' ? rotuloSemana(de, somaDias(ate, -1))
    : `${SEMANA_LONGA[ref.getDay()]}, ${ref.getDate()} de ${MESES[ref.getMonth()].toLowerCase()} de ${ref.getFullYear()}`

  // arrastar e soltar
  const aceita = (e: DragEvent) => !!onSoltar && e.dataTransfer.types.includes(TIPO_ARRASTO)
  const alvoProps = (chave: string, dia: string, hora?: number) => ({
    onDragOver: (e: DragEvent) => { if (aceita(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (alvo !== chave) setAlvo(chave) } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setAlvo((a) => (a === chave ? null : a)) },
    onDrop: (e: DragEvent) => { if (!aceita(e)) return; e.preventDefault(); setAlvo(null); const id = e.dataTransfer.getData(TIPO_ARRASTO); if (id) onSoltar!(id, dia, hora) },
  })
  const tecla = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } }
  const clicarVazio = (dia: string, hora?: number) => { onSelecionar(dia); onNovo?.(dia, hora) }
  const dicaVazio = onNovo ? 'Clique para incluir um compromisso' : undefined

  const item = (e: EventoCal, modo: 'chip' | 'cartao') => {
    const clicavel = !!onEvento
    const quando = e.diaInteiro ? 'Dia todo' : `${hhmm(e.inicio)}${e.fim && modo === 'cartao' ? `–${hhmm(e.fim)}` : ''}`
    return (
      <span key={e.id}
            className={`${modo === 'chip' ? 'cal-ev' : 'cal-cartao'} ag-cor-${e.cor ?? 'dourado'} st-${e.situacao ?? 'normal'}${clicavel ? ' clicavel' : ''}${e.arrastavel ? ' arrastavel' : ''}`}
            title={`${quando} · ${e.titulo}${e.detalhe ? `\n${e.detalhe}` : ''}${clicavel ? '\nClique para editar' : ''}${e.arrastavel ? ' · arraste para remarcar' : ''}`}
            role={clicavel ? 'button' : undefined} tabIndex={clicavel ? 0 : undefined}
            draggable={!!(e.arrastavel && onSoltar)}
            onDragStart={(ev) => { ev.stopPropagation(); ev.dataTransfer.setData(TIPO_ARRASTO, e.id); ev.dataTransfer.effectAllowed = 'move' }}
            onDragEnd={() => setAlvo(null)}
            onClick={(ev) => { ev.stopPropagation(); if (clicavel) onEvento!(e.id) }}
            onKeyDown={(ev) => { if (clicavel && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); onEvento!(e.id) } }}>
        {modo === 'chip'
          ? <>{e.diaInteiro ? '' : `${hhmm(e.inicio)} `}{e.titulo}</>
          : <><b>{quando}</b><span>{e.titulo}</span>{e.detalhe && <small>{e.detalhe}</small>}</>}
      </span>
    )
  }

  let corpo: ReactNode
  if (visao === 'mes') {
    const dias = Array.from({ length: 42 }, (_, i) => somaDias(de, i))
    corpo = (
      <div className="cal-grade">
        {SEMANA.map((s) => <div key={s} className="cal-sem">{s}</div>)}
        {dias.map((d) => {
          const k = chaveDia(d); const ev = porDia[k] ?? []
          const pior = ev.some((e) => e.situacao === 'atrasado') ? 'atrasado' : ev.some((e) => e.situacao === 'em_breve') ? 'em_breve' : null
          const cls = ['cal-dia', d.getMonth() !== ref.getMonth() && 'fora', k === chaveDia(hoje) && 'hoje', k === selecionado && 'sel',
                       pior && `cal-${pior}`, alvo === k && 'cal-alvo', onNovo && 'pode-incluir'].filter(Boolean).join(' ')
          return (
            <div key={k} className={cls} role="button" tabIndex={0} aria-pressed={k === selecionado} title={dicaVazio}
                 aria-label={`${d.getDate()} de ${MESES[d.getMonth()]}${ev.length ? `, ${ev.length} compromisso(s)` : ''}`}
                 onClick={() => clicarVazio(k)} onKeyDown={tecla(() => clicarVazio(k))} {...alvoProps(k, k)}>
              <span className="cal-num">{d.getDate()}</span>
              {ev.length > 0 && (
                <span className="cal-eventos">
                  {ev.slice(0, maxPorDia).map((e) => item(e, 'chip'))}
                  {ev.length > maxPorDia && (
                    <span className="cal-mais" role="button" tabIndex={0} title="Ver o dia"
                          onClick={(x) => { x.stopPropagation(); onSelecionar(k); onMudarVisao('dia') }}
                          onKeyDown={(x) => { if (x.key === 'Enter') { x.stopPropagation(); onSelecionar(k); onMudarVisao('dia') } }}>+{ev.length - maxPorDia}</span>
                  )}
                </span>
              )}
              {ev.length > 0 && <i className="cal-qtd">{ev.length}</i>}
            </div>
          )
        })}
      </div>
    )
  } else if (visao === 'semana') {
    const dias = Array.from({ length: 7 }, (_, i) => somaDias(de, i))
    corpo = (
      <div className="cal-semana">
        {dias.map((d) => {
          const k = chaveDia(d); const ev = porDia[k] ?? []
          return (
            <div key={k} className={['cal-col', k === chaveDia(hoje) && 'hoje', k === selecionado && 'sel', alvo === k && 'cal-alvo'].filter(Boolean).join(' ')}>
              <button type="button" className="cal-col-topo" onClick={() => { onSelecionar(k); onMudarVisao('dia') }} title="Ver o dia">
                <small>{SEMANA[d.getDay()]}</small><strong>{d.getDate()}</strong>
              </button>
              <div className={`cal-col-corpo${onNovo ? ' pode-incluir' : ''}`} role="button" tabIndex={0} title={dicaVazio}
                   aria-label={`${SEMANA_LONGA[d.getDay()]} ${d.getDate()}: ${ev.length} compromisso(s)`}
                   onClick={() => clicarVazio(k)} onKeyDown={tecla(() => clicarVazio(k))} {...alvoProps(k, k)}>
                {ev.map((e) => item(e, 'cartao'))}
                {ev.length === 0 && onNovo && <span className="cal-vazio">+ incluir</span>}
              </div>
            </div>
          )
        })}
      </div>
    )
  } else {
    const k = chaveDia(ref); const ev = porDia[k] ?? []
    const diaTodo = ev.filter((e) => e.diaInteiro)
    corpo = (
      <DiaHoras key={k} horaInicial={k === chaveDia(hoje) ? Math.max(hoje.getHours() - 1, 0) : 7}>
        {(diaTodo.length > 0 || onNovo) && (
          <div className={`cal-hora cal-hora-todo${alvo === `${k}|todo` ? ' cal-alvo' : ''}`}>
            <span className="cal-hora-rot">Dia todo</span>
            <div className="cal-hora-itens">{diaTodo.map((e) => item(e, 'cartao'))}</div>
          </div>
        )}
        {HORAS.map((h) => {
          const daHora = ev.filter((e) => !e.diaInteiro && e.inicio.getHours() === h)
          const agoraAqui = k === chaveDia(hoje) && hoje.getHours() === h
          return (
            <div key={h} data-hora={h}
                 className={['cal-hora', agoraAqui && 'agora', alvo === `${k}|${h}` && 'cal-alvo', onNovo && 'pode-incluir'].filter(Boolean).join(' ')}
                 role="button" tabIndex={0} title={onNovo ? `Clique para incluir às ${d2(h)}:00` : undefined}
                 onClick={() => clicarVazio(k, h)} onKeyDown={tecla(() => clicarVazio(k, h))} {...alvoProps(`${k}|${h}`, k, h)}>
              <span className="cal-hora-rot">{d2(h)}:00</span>
              <div className="cal-hora-itens">{daHora.map((e) => item(e, 'cartao'))}</div>
            </div>
          )
        })}
      </DiaHoras>
    )
  }

  return (
    <div className={`calendario cal-v-${visao}`}>
      <div className="cal-topo">
        <strong>{titulo}</strong>
        <div className="cal-nav">
          <div className="cal-visoes" role="group" aria-label="Visão">
            {(['dia', 'semana', 'mes'] as Visao[]).map((v) => (
              <button key={v} type="button" className={`chip${visao === v ? ' sel' : ''}`} aria-pressed={visao === v}
                      onClick={() => { if (v === 'mes') setRef(new Date(deChave(selecionado).getFullYear(), deChave(selecionado).getMonth(), 1)); onMudarVisao(v) }}>
                {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
          <button className="sec icone-btn" onClick={() => navegar(-1)} aria-label="Anterior"><IEsq /></button>
          <button className="sec" onClick={irHoje}>Hoje</button>
          <button className="sec icone-btn" onClick={() => navegar(1)} aria-label="Próximo"><IDir /></button>
        </div>
      </div>
      {corpo}
    </div>
  )
}

/** Faixa de horas com rolagem: hoje abre perto da hora atual; outros dias, às 7h. */
function DiaHoras({ children, horaInicial }: { children: ReactNode; horaInicial: number }) {
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = caixa.current; if (!el) return
    const linha = el.querySelector<HTMLElement>(`[data-hora="${horaInicial}"]`)
    const fixa = el.querySelector<HTMLElement>('.cal-hora-todo')?.offsetHeight ?? 0   // a linha "Dia todo" fica presa no topo
    if (linha) el.scrollTop = linha.offsetTop - fixa   // .cal-dia-horas é position: relative
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div className="cal-dia-horas" ref={caixa}>{children}</div>
}

function rotuloSemana(a: Date, b: Date) {
  const mesA = MESES[a.getMonth()].toLowerCase(), mesB = MESES[b.getMonth()].toLowerCase()
  return a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${mesB} de ${b.getFullYear()}` : `${a.getDate()} de ${mesA} a ${b.getDate()} de ${mesB} de ${b.getFullYear()}`
}
