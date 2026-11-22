import { useEffect, useRef, useState, type ReactNode } from 'react'

// Tela de entrada (login e nova senha): fundo com as fotos das postagens em transição + logomarca acima do cartão.
// As fotos ficam em /public/fundo e são listadas em /public/fundo/fundo.json (até 10). Sem fotos, mostra um fundo padrão.
type Foto = { arquivo: string; legenda?: string }

const INTERVALO_MS = 7000
const MAX_FOTOS = 10

const reduzMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function TelaEntrada({ children }: { children: ReactNode }) {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [atual, setAtual] = useState(0)
  const [anterior, setAnterior] = useState<number | null>(null)
  const [vistoAte, setVistoAte] = useState(1) // só baixa a foto quando ela é a atual ou a próxima
  const atualRef = useRef(0)

  useEffect(() => {
    let vivo = true
    fetch('/fundo/fundo.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: unknown) => {
        if (!vivo || !Array.isArray(lista)) return
        setFotos(lista.filter((f): f is Foto => !!f && typeof (f as Foto).arquivo === 'string').slice(0, MAX_FOTOS))
      })
      .catch(() => { /* sem manifesto: fica o fundo padrão */ })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (fotos.length < 2 || reduzMovimento()) return
    const id = window.setInterval(() => {
      const a = atualRef.current
      const prox = (a + 1) % fotos.length
      atualRef.current = prox
      setAnterior(a)
      setAtual(prox)
      setVistoAte((v) => Math.max(v, Math.min(prox + 1, fotos.length - 1)))
    }, INTERVALO_MS)
    return () => window.clearInterval(id)
  }, [fotos.length])

  const legenda = fotos[atual]?.legenda

  return (
    <div className="entrada">
      <div className="fundo" aria-hidden="true">
        {fotos.length === 0 && <div className="fundo-padrao" />}
        {fotos.map((f, i) => {
          const visivel = i <= vistoAte || i === atual
          const classe = i === atual ? 'ativa' : i === anterior ? 'saindo' : ''
          return (
            <div key={f.arquivo} className={`fundo-foto ${classe}`}>
              {visivel && <img src={`/fundo/${encodeURIComponent(f.arquivo)}`} alt="" decoding="async" />}
            </div>
          )
        })}
      </div>
      <div className="fundo-veu" aria-hidden="true" />
      <main className="entrada-conteudo">
        <img className="entrada-logo" src="/logo-anebrecho.jpg" alt="Ane Brechó" width={112} height={112} />
        {children}
      </main>
      {legenda && <p className="entrada-legenda" key={atual} aria-hidden="true">{legenda}</p>}
    </div>
  )
}
