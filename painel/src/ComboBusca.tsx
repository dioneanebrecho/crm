import { useEffect, useId, useMemo, useRef, useState } from 'react'

// Campo de escolha com busca: ao focar mostra a lista inteira; ao digitar vai refinando (sem acento, sem caixa e por
// várias palavras em qualquer ordem). Com `livre`, o texto digitado que não está na lista vira o valor (marca nova,
// tamanho avulso) e aparece como a última linha da lista ("Cadastrar nova…").
export interface OpcaoCombo { valor: string; rotulo: string; extra?: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

type Props = {
  opcoes: OpcaoCombo[]; valor: string; onEscolher: (valor: string) => void
  livre?: boolean; placeholder?: string; desabilitado?: boolean; ariaLabel?: string
  rotuloNovo?: (texto: string) => string; limite?: number
}

export function ComboBusca({ opcoes, valor, onEscolher, livre = false, placeholder, desabilitado = false, ariaLabel, rotuloNovo, limite = 60 }: Props) {
  const id = useId()
  const atual = opcoes.find((o) => o.valor === valor)
  const mostrado = atual ? atual.rotulo : livre ? valor : ''
  const [texto, setTexto] = useState(mostrado)
  const [aberto, setAberto] = useState(false)
  const [filtrando, setFiltrando] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const refAtivo = useRef<HTMLLIElement>(null)
  useEffect(() => { if (!aberto) setTexto(mostrado) }, [mostrado, aberto])
  useEffect(() => { refAtivo.current?.scrollIntoView({ block: 'nearest' }) }, [ativo, aberto])

  const lista = useMemo(() => {
    const toks = filtrando ? norm(texto).split(' ').filter(Boolean) : []
    const l = toks.length ? opcoes.filter((o) => { const n = norm(`${o.rotulo} ${o.extra ?? ''}`); return toks.every((t) => n.includes(t)) }) : opcoes
    return l.slice(0, limite)
  }, [opcoes, texto, filtrando, limite])
  const novo = livre && texto.trim() && !opcoes.some((o) => norm(o.rotulo) === norm(texto)) ? texto.trim() : null
  const itens = [...lista.map((o) => ({ ...o, novo: false })), ...(novo ? [{ valor: novo, rotulo: rotuloNovo ? rotuloNovo(novo) : `Usar “${novo}”`, novo: true } as OpcaoCombo & { novo: boolean }] : [])]

  const escolher = (v: string, rotulo: string) => { onEscolher(v); setTexto(rotulo); setAberto(false); setFiltrando(false) }
  const sair = () => {
    setAberto(false); setFiltrando(false)
    const t = texto.trim()
    if (t === '') { if (valor !== '') onEscolher(''); return }
    const exato = opcoes.find((o) => norm(o.rotulo) === norm(t))
    if (exato) { if (exato.valor !== valor) onEscolher(exato.valor); else setTexto(exato.rotulo); return }
    if (livre) { if (t !== valor) onEscolher(t) } else setTexto(mostrado)
  }

  return (
    <span style={{ position: 'relative', display: 'block', width: '100%' }}>
      <input value={texto} placeholder={placeholder} aria-label={ariaLabel} disabled={desabilitado} autoComplete="off" style={{ width: '100%' }}
             role="combobox" aria-expanded={aberto} aria-controls={id} aria-autocomplete="list"
             onFocus={(e) => { setAberto(true); setFiltrando(false); setAtivo(0); e.currentTarget.select() }}
             onChange={(e) => { setTexto(e.target.value); setFiltrando(true); setAberto(true); setAtivo(0) }}
             onBlur={sair}
             onKeyDown={(e) => {
               if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo((i) => Math.min(i + 1, itens.length - 1)) }
               else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)) }
               else if (e.key === 'Enter' && aberto) { e.preventDefault(); const it = itens[ativo]; if (it) escolher(it.valor, (it as { novo?: boolean }).novo ? it.valor : it.rotulo); else sair() }
               else if (e.key === 'Escape' && aberto) { e.stopPropagation(); setAberto(false); setFiltrando(false); setTexto(mostrado) }
             }} />
      {aberto && !desabilitado && (
        <ul id={id} role="listbox" style={{ position: 'absolute', zIndex: 60, left: 0, top: '100%', margin: '2px 0 0', padding: 4, listStyle: 'none', minWidth: '100%', width: 'max-content',
                 maxWidth: 'min(560px, 90vw)', maxHeight: 280, overflowY: 'auto', background: 'var(--card2, #222)', border: '1px solid var(--borda, #444)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.35)' }}>
          {itens.length === 0 && <li style={{ padding: '6px 8px', opacity: .6 }}>Nada encontrado</li>}
          {itens.map((o, i) => (
            <li key={`${o.valor}-${i}`} ref={i === ativo ? refAtivo : undefined} role="option" aria-selected={i === ativo}
                onMouseDown={(e) => { e.preventDefault(); escolher(o.valor, (o as { novo?: boolean }).novo ? o.valor : o.rotulo) }} onMouseEnter={() => setAtivo(i)}
                style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: i === ativo ? 'var(--borda, #444)' : undefined,
                         fontWeight: (o as { novo?: boolean }).novo ? 700 : undefined }}>
              {o.rotulo}
            </li>))}
        </ul>)}
    </span>
  )
}
