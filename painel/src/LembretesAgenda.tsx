import { useCallback, useEffect, useRef, useState } from 'react'
import { apiAgenda, hora, diaCurto, relativo, ouvirMudanca, situacao, type Compromisso } from './apiAgenda'
import './pages/agenda.css'

// Lembretes da Agenda (pedido 045): pop-up em qualquer tela do painel, para os compromissos do próprio usuário.
// Dispara nos avisos do compromisso (ou no padrão da Configuração) e na hora de início; compromisso de dia todo avisa às 8h.
// Uma vez por dia, resume os atrasados. "Adiar" repete em 10 min; "Dispensar" encerra aquele aviso.
// Quando a aba do navegador está em segundo plano e a pessoa permitiu, também sai uma notificação do sistema.

const CHAVE_AVISADOS = 'ane.agenda.avisados'
const CHAVE_ADIADOS = 'ane.agenda.adiados'
const CHAVE_RESUMO = 'ane.agenda.resumo-atrasados'
const INTERVALO_MS = 60000
const ADIAR_MIN = 10
const JANELA_MS = 6 * 3600000        // aviso que venceu há mais de 6 h (painel fechado) não aparece mais
const MAX_CARTOES = 4

type Cartao = { chave: string; c: Compromisso; motivo: 'aviso' | 'inicio' | 'dia' }
type Resumo = { qtd: number; primeiro: Compromisso }

const ler = <T,>(k: string, padrao: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T } catch { return padrao } }
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* modo privado */ } }
const hojeK = () => new Date().toLocaleDateString('sv-SE')

export default function LembretesAgenda({ empresa, abrir }: { empresa: string; abrir: (aba: string, q?: string) => void }) {
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const padrao = useRef<number[]>([30])
  const notifPerm = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  const [permNotif, setPermNotif] = useState(notifPerm)
  // o App recria `abrir` a cada render; guardado em ref para não reiniciar a verificação a cada redesenho
  const abrirRef = useRef(abrir)
  abrirRef.current = abrir

  const verificar = useCallback(async () => {
    let fila
    try { fila = await apiAgenda.minhaFila(empresa) } catch { return }   // sem acesso ou fora do ar: não incomoda
    const agoraMs = Date.now(); setAgora(agoraMs)
    const avisados = ler<Record<string, number>>(CHAVE_AVISADOS, {})
    const adiados = ler<Record<string, number>>(CHAVE_ADIADOS, {})
    // limpa marcas com mais de 3 dias
    for (const [k, t] of Object.entries(avisados)) if (agoraMs - t > 3 * 86400000) delete avisados[k]
    for (const [k, t] of Object.entries(adiados)) if (t < agoraMs - 86400000) delete adiados[k]

    const candidatos = [...fila.hoje, ...fila.proximos, ...fila.aguardando_cliente]
    const novos: Cartao[] = []
    const vistos = new Set<string>()
    for (const c of candidatos) {
      if (vistos.has(c.id)) continue; vistos.add(c.id)
      const ini = new Date(c.inicio_em).getTime()
      // momentos de aviso: cada antecedência configurada e a hora de início (dia todo: 8h do dia)
      const momentos: { chave: string; t: number; motivo: Cartao['motivo'] }[] = c.dia_inteiro
        ? [{ chave: `${c.id}|${c.inicio_em}|dia`, t: new Date(new Date(ini).setHours(8, 0, 0, 0)).getTime(), motivo: 'dia' }]
        : [...(c.lembrete_min ?? padrao.current).map((m) => ({ chave: `${c.id}|${c.inicio_em}|${m}`, t: ini - m * 60000, motivo: 'aviso' as const })),
           { chave: `${c.id}|${c.inicio_em}|0`, t: ini, motivo: 'inicio' as const }]
      // vale o momento mais recente já alcançado (evita uma enxurrada ao abrir o painel)
      const vencidos = momentos.filter((m) => m.t <= agoraMs && agoraMs - m.t < JANELA_MS).sort((a, b) => b.t - a.t)
      const atual = vencidos[0]
      if (!atual) continue
      const adiadoAte = adiados[c.id]
      if (adiadoAte && adiadoAte > agoraMs) continue
      if (avisados[atual.chave] && !(adiadoAte && adiadoAte <= agoraMs)) continue
      for (const m of vencidos) avisados[m.chave] = agoraMs
      delete adiados[c.id]
      novos.push({ chave: atual.chave, c, motivo: atual.motivo })
    }
    gravar(CHAVE_AVISADOS, avisados); gravar(CHAVE_ADIADOS, adiados)

    if (novos.length) {
      setCartoes((l) => [...novos, ...l.filter((x) => !novos.some((n) => n.c.id === x.c.id))].slice(0, MAX_CARTOES))
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const n of novos) {
          const nt = new Notification(`Agenda: ${n.c.titulo}`, { body: textoQuando(n, Date.now()), tag: n.c.id })
          nt.onclick = () => { window.focus(); abrirRef.current('agenda', `c:${n.c.id}`); nt.close() }
        }
      }
    }
    // resumo dos atrasados: uma vez por dia
    if (fila.atrasados.length && localStorage.getItem(CHAVE_RESUMO) !== hojeK()) {
      setResumo({ qtd: fila.atrasados.length, primeiro: fila.atrasados[0] })
    }
  }, [empresa])

  useEffect(() => {
    apiAgenda.config(empresa).then((c) => { if (c?.lembrete_padrao_min?.length) padrao.current = c.lembrete_padrao_min }).catch(() => {})
      .finally(() => { verificar() })
    const t = setInterval(verificar, INTERVALO_MS)
    const tic = setInterval(() => setAgora(Date.now()), 30000)
    const desligar = ouvirMudanca(() => { setTimeout(verificar, 300) })
    return () => { clearInterval(t); clearInterval(tic); desligar() }
  }, [empresa, verificar])

  // o cartão some sozinho se o compromisso foi concluído em outra tela
  useEffect(() => ouvirMudanca(() => {
    apiAgenda.minhaFila(empresa).then((f) => {
      const abertos = new Set([...f.atrasados, ...f.hoje, ...f.aguardando_cliente, ...f.proximos].map((c) => c.id))
      setCartoes((l) => l.filter((x) => abertos.has(x.c.id)))
    }).catch(() => {})
  }), [empresa])

  const fechar = (id: string) => setCartoes((l) => l.filter((x) => x.c.id !== id))
  const adiar = (id: string) => {
    const adiados = ler<Record<string, number>>(CHAVE_ADIADOS, {}); adiados[id] = Date.now() + ADIAR_MIN * 60000
    gravar(CHAVE_ADIADOS, adiados); fechar(id)
  }
  const fecharResumo = () => { try { localStorage.setItem(CHAVE_RESUMO, hojeK()) } catch { /* modo privado */ } setResumo(null) }
  const pedirNotificacao = () => { Notification.requestPermission().then(setPermNotif).catch(() => {}) }

  if (!cartoes.length && !resumo) return null
  return (
    <div className="lembretes" aria-live="assertive">
      {resumo && (
        <div className="lembrete st-atrasado" role="alertdialog" aria-label="Compromissos atrasados">
          <div className="lembrete-topo"><strong>{resumo.qtd === 1 ? '1 compromisso atrasado' : `${resumo.qtd} compromissos atrasados`}</strong>
            <button className="icone" aria-label="Fechar" onClick={fecharResumo}>×</button></div>
          <p>O mais antigo: {resumo.primeiro.titulo}, previsto para {diaCurto(resumo.primeiro.inicio_em)}{resumo.primeiro.dia_inteiro ? '' : ` às ${hora(resumo.primeiro.inicio_em)}`}.</p>
          <div className="lembrete-acoes">
            <button onClick={() => { fecharResumo(); abrir('agenda', 'fila') }}>Ver minha fila</button>
            <button className="sec" onClick={fecharResumo}>Hoje não</button>
          </div>
        </div>
      )}
      {cartoes.map((k) => {
        const st = situacao(k.c, agora)
        return (
          <div key={k.c.id} className={`lembrete st-${st}`} role="alertdialog" aria-label={`Lembrete: ${k.c.titulo}`}>
            <div className="lembrete-topo">
              <span className={`ag-ponto ag-cor-${k.c.cor}`} aria-hidden /><small>{k.c.tipo_nome}</small>
              <button className="icone" aria-label="Dispensar" onClick={() => fechar(k.c.id)}>×</button>
            </div>
            <strong className="lembrete-titulo">{k.c.titulo}</strong>
            <p>{textoQuando(k, agora)}{k.c.cliente_nome ? ` · ${k.c.cliente_nome}` : ''}</p>
            <div className="lembrete-acoes">
              <button onClick={() => { fechar(k.c.id); abrir('agenda', `c:${k.c.id}`) }}>Abrir</button>
              <button className="sec" onClick={() => adiar(k.c.id)}>Adiar {ADIAR_MIN} min</button>
              <button className="sec" onClick={() => fechar(k.c.id)}>Dispensar</button>
            </div>
            {permNotif === 'default' && (
              <button className="link lembrete-notif" onClick={pedirNotificacao}>Avisar também quando o painel estiver em segundo plano</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function textoQuando(k: Cartao, agora: number) {
  if (k.motivo === 'dia') return 'Hoje, dia todo'
  const ini = new Date(k.c.inicio_em).getTime()
  if (ini > agora) return `Começa ${relativo(k.c.inicio_em, agora)}, às ${hora(k.c.inicio_em)}`
  return `Começou às ${hora(k.c.inicio_em)} (${relativo(k.c.inicio_em, agora)})`
}
