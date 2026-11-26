import { useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AbaContexto } from './abas'

export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const seq = useRef(0)
  const { recarga } = useContext(AbaContexto) // sobe quando a aba volta depois de MINUTOS_PARA_ATUALIZAR oculta
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recarregar = useCallback(() => {
    const id = ++seq.current
    setCarregando(true)
    fn().then((d) => { if (id === seq.current) { setDados(d); setErro(null) } })
        .catch((e: Error) => { if (id === seq.current) setErro(e.message) })
        .finally(() => { if (id === seq.current) setCarregando(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, recarga])
  useEffect(() => { recarregar() }, [recarregar])
  return { dados, erro, carregando, recarregar }
}

export function Modal({ titulo, onFechar, larga = false, children }: { titulo: string; onFechar: () => void; larga?: boolean; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onFechar])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={larga ? 'modal larga' : 'modal'} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-topo"><h2>{titulo}</h2><button className="icone" onClick={onFechar} aria-label="Fechar">×</button></div>
        {children}
      </div>
    </div>
  )
}

export function Formulario({ onEnviar, enviarRotulo = 'Salvar', onCancelar, children }: {
  onEnviar: () => Promise<void>; enviarRotulo?: string; onCancelar: () => void; children: ReactNode
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setEnviando(true); setErro(null)
    try { await onEnviar() } catch (err) { setErro((err as Error).message) } finally { setEnviando(false) }
  }
  return (
    <form onSubmit={submit} className="form">
      {children}
      {erro && <div className="erro" role="alert">{erro}</div>}
      <div className="acoes">
        <button type="button" className="sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" disabled={enviando}>{enviando ? 'Salvando…' : enviarRotulo}</button>
      </div>
    </form>
  )
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return <label className="campo"><span>{rotulo}</span>{children}{dica && <small>{dica}</small>}</label>
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return <div className="vazio"><strong>{titulo}</strong><p>{texto}</p>{acao}</div>
}

export function Paginacao({ total, offset, limite, onMudar }: { total: number; offset: number; limite: number; onMudar: (o: number) => void }) {
  if (total <= limite) return null
  const ini = offset + 1, fim = Math.min(offset + limite, total)
  return (
    <div className="paginacao">
      <span>{ini}–{fim} de {total}</span>
      <button className="sec" disabled={offset === 0} onClick={() => onMudar(Math.max(0, offset - limite))}>Anterior</button>
      <button className="sec" disabled={fim >= total} onClick={() => onMudar(offset + limite)}>Próxima</button>
    </div>
  )
}

export function Busca({ valor, onMudar, placeholder }: { valor: string; onMudar: (v: string) => void; placeholder: string }) {
  const [local, setLocal] = useState(valor)
  const emitido = useRef(valor)
  // onMudar costuma ser uma função nova a cada render; guardá-la em ref evita que o efeito
  // reagende a emissão a cada render (isso gerava busca em loop, ~3 chamadas/s, na tela Parceiros)
  const avisar = useRef(onMudar)
  avisar.current = onMudar
  useEffect(() => {
    if (local === emitido.current) return // nada novo digitado: não emite
    const t = setTimeout(() => { emitido.current = local; avisar.current(local) }, 300)
    return () => clearTimeout(t)
  }, [local])
  // mudança vinda de fora (ex.: "Limpar filtros") reescreve o campo; o eco do que o próprio usuário digitou é ignorado
  useEffect(() => { if (valor !== emitido.current) { emitido.current = valor; setLocal(valor) } }, [valor])
  return <input className="busca" type="search" value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} />
}

/** Botão "Limpar filtros": só aparece quando há algum filtro aplicado. */
export function LimparFiltros({ ativo, onLimpar }: { ativo: boolean; onLimpar: () => void }) {
  return ativo ? <button type="button" className="link limpar-filtros" onClick={onLimpar}>Limpar filtros</button> : null
}

export const ESTADOS: Record<string, string> = {
  disponivel: 'Disponível', reservada: 'Reservada', vendida: 'Vendida', devolvida: 'Devolvida', baixada: 'Baixada',
}
export const Selo = ({ estado }: { estado: string }) => <span className={`selo selo-${estado}`}>{ESTADOS[estado] ?? estado}</span>

export function Abas<T extends string>({ abas, ativa, onMudar }: { abas: { id: T; rotulo: string; contagem?: number }[]; ativa: T; onMudar: (id: T) => void }) {
  return (
    <div className="abas-pagina" role="tablist">
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={a.id === ativa} className={a.id === ativa ? 'ativa' : ''} onClick={() => onMudar(a.id)}>
          {a.rotulo}{a.contagem !== undefined && <span>{a.contagem}</span>}
        </button>
      ))}
    </div>
  )
}

/** Título compacto da tela. A descrição longa fica no ícone "?" (abre ao clicar; Esc ou clique fora fecha). */
export function Titulo({ children, ajuda }: { children: ReactNode; ajuda?: ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: Event) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  return (
    <h1 className="tit-pag">
      <span>{children}</span>
      {ajuda && (
        <span className="ajuda-pag" ref={caixa}>
          <button type="button" className="ajuda-btn" aria-label="Sobre esta tela" aria-expanded={aberto} title="Sobre esta tela" onClick={() => setAberto((a) => !a)}>?</button>
          {aberto && <div className="ajuda-pop" role="note">{ajuda}</div>}
        </span>)}
    </h1>
  )
}
