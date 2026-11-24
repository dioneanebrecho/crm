import { useState } from 'react'
import Calendario, { chaveDia } from '../Calendario'
import { Abas, Vazio, Titulo } from '../ui'

type Modo = 'calendario' | 'proximas'
export default function Agenda() {
  const [modo, setModo] = useState<Modo>('calendario')
  const [dia, setDia] = useState(chaveDia(new Date()))
  const [a, m, d] = dia.split('-')
  return (
    <section>
      <div className="topo"><div><Titulo ajuda={<>Calendário das lives e leilões. A programação será ligada aos dados na etapa de lives (F8).</>}>Agenda de lives</Titulo></div></div>
      <Abas abas={[{ id: 'calendario', rotulo: 'Calendário' }, { id: 'proximas', rotulo: 'Próximas lives', contagem: 0 }]} ativa={modo} onMudar={setModo} />
      {modo === 'calendario' ? (
        <div className="agenda-grid">
          <Calendario selecionado={dia} onSelecionar={setDia} />
          <aside className="painel">
            <h2>{d}/{m}/{a}</h2>
            <p className="mudo">Nenhuma live agendada para este dia.</p>
          </aside>
        </div>
      ) : <Vazio titulo="Nenhuma live agendada" texto="Quando a programação de lives for ligada, as próximas aparecem aqui em lista." />}
    </section>
  )
}
