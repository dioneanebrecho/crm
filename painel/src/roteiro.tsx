import { useState, type ReactNode } from 'react'

// Roteiro de treino dos modos de simulação: passos que se marcam sozinhos conforme a pessoa usa a tela com dados fictícios.
export interface PassoRoteiro { id: string; texto: ReactNode }

export function Roteiro({ titulo, passos, feitos, extra, onRecomecar }: {
  titulo: string; passos: PassoRoteiro[]; feitos: Set<string>; extra?: ReactNode; onRecomecar: () => void
}) {
  const [aberto, setAberto] = useState(true)
  const n = passos.filter((p) => feitos.has(p.id)).length
  const proximo = passos.find((p) => !feitos.has(p.id))
  return (
    <div className="roteiro" role="region" aria-label={titulo}>
      <div className="roteiro-topo">
        <strong>{titulo}</strong>
        <span className="roteiro-barra" aria-label={`${n} de ${passos.length} passos`}><i style={{ width: `${(n / passos.length) * 100}%` }} /></span>
        <span className="mudo pequeno">{n}/{passos.length}</span>
        <button type="button" className="link" onClick={() => setAberto(!aberto)}>{aberto ? 'Recolher' : 'Ver passos'}</button>
        <button type="button" className="link" onClick={onRecomecar}>Recomeçar</button>
      </div>
      {aberto && <ol className="roteiro-passos">
        {passos.map((p) => <li key={p.id} className={feitos.has(p.id) ? 'feito' : p === proximo ? 'agora' : ''}>{p.texto}</li>)}
      </ol>}
      {aberto && n === passos.length && <p className="roteiro-fim">Pronto! Você passou pelo fluxo completo. Clique em Recomeçar para treinar de novo.</p>}
      {aberto && extra}
    </div>
  )
}
