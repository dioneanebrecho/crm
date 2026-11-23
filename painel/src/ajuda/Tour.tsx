import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { PassoTour } from './conteudo'

interface TourCtx { iniciar: (passos: PassoTour[]) => void; ativo: boolean }
const Ctx = createContext<TourCtx>({ iniciar: () => {}, ativo: false })
export const useTour = () => useContext(Ctx)

export function TourProvider({ children }: { children: ReactNode }) {
  const [passos, setPassos] = useState<PassoTour[] | null>(null)
  const iniciar = useCallback((p: PassoTour[]) => { if (p && p.length) setPassos(p.slice()) }, [])
  const fechar = useCallback(() => setPassos(null), [])
  return (
    <Ctx.Provider value={{ iniciar, ativo: !!passos }}>
      {children}
      {passos && <Holofote passos={passos} onFechar={fechar} />}
    </Ctx.Provider>
  )
}

const MARGEM = 8   // folga ao redor do elemento destacado
const GAP = 12     // distância do balão ao elemento

type Caixa = { top: number; left: number; width: number; height: number } | null

function Holofote({ passos, onFechar }: { passos: PassoTour[]; onFechar: () => void }) {
  const [i, setI] = useState(0)
  const [caixa, setCaixa] = useState<Caixa>(null)
  const balaoRef = useRef<HTMLDivElement>(null)
  const passo = passos[i]
  const ultimo = i >= passos.length - 1

  const medir = useCallback(() => {
    const alvo = passo?.alvo ? document.querySelector(passo.alvo) : null
    if (!alvo) { setCaixa(null); return }
    const r = alvo.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) { setCaixa(null); return }   // elemento oculto: cai no cartão central
    setCaixa({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [passo])

  // ao mudar de passo: rola o alvo para a área visível e mede depois do scroll assentar
  useLayoutEffect(() => {
    const alvo = passo?.alvo ? document.querySelector(passo.alvo) : null
    if (alvo) alvo.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    const t1 = setTimeout(medir, 60)
    const t2 = setTimeout(medir, 320)   // segunda medição após o scroll suave
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [i, medir, passo])

  useEffect(() => {
    const atualizar = () => medir()
    window.addEventListener('resize', atualizar)
    window.addEventListener('scroll', atualizar, true)
    return () => { window.removeEventListener('resize', atualizar); window.removeEventListener('scroll', atualizar, true) }
  }, [medir])

  const voltar = useCallback(() => setI((n) => Math.max(0, n - 1)), [])
  const avancar = useCallback(() => { if (ultimo) onFechar(); else setI((n) => n + 1) }, [ultimo, onFechar])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onFechar() }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); avancar() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); voltar() }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [avancar, voltar, onFechar])

  // posição do balão: abaixo do alvo se couber, senão acima; sem alvo, centralizado
  const vw = window.innerWidth, vh = window.innerHeight
  const larguraBalao = Math.min(360, vw - 2 * MARGEM)
  let estiloBalao: React.CSSProperties
  let centralizado = false
  if (caixa) {
    const abaixo = caixa.top + caixa.height + GAP
    const cabeAbaixo = abaixo + 180 < vh
    const topo = cabeAbaixo ? abaixo : Math.max(MARGEM, caixa.top - GAP - 180)
    let left = caixa.left + caixa.width / 2 - larguraBalao / 2
    left = Math.max(MARGEM, Math.min(left, vw - larguraBalao - MARGEM))
    estiloBalao = { top: topo, left, width: larguraBalao }
  } else {
    centralizado = true
    estiloBalao = { top: '50%', left: '50%', width: larguraBalao, transform: 'translate(-50%, -50%)' }
  }

  return (
    <div className="tour-raiz" role="dialog" aria-modal="true" aria-label="Tutorial guiado">
      {caixa ? (
        <div className="tour-furo" style={{
          top: caixa.top - MARGEM, left: caixa.left - MARGEM,
          width: caixa.width + 2 * MARGEM, height: caixa.height + 2 * MARGEM,
        }} />
      ) : (
        <div className="tour-veu" onClick={onFechar} />
      )}
      <div ref={balaoRef} className={centralizado ? 'tour-balao centro' : 'tour-balao'} style={estiloBalao}>
        <div className="tour-balao-topo">
          <strong>{passo.titulo}</strong>
          <button type="button" className="tour-x" aria-label="Fechar tutorial" onClick={onFechar}>×</button>
        </div>
        <p>{passo.texto}</p>
        <div className="tour-rodape">
          <span className="tour-prog">{i + 1} / {passos.length}</span>
          <div className="tour-acoes">
            {i > 0 && <button type="button" className="sec" onClick={voltar}>Voltar</button>}
            {!ultimo && <button type="button" className="link" onClick={onFechar}>Pular</button>}
            <button type="button" onClick={avancar}>{ultimo ? 'Concluir' : 'Próximo'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
