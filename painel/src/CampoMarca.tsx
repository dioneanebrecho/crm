import { useId, useMemo, useRef, useState } from 'react'
import { api, type OpcaoCadastro } from './api'
import { Campo, useCarregar } from './ui'

// Marca com lista de sugestões visível: ao focar mostra as marcas cadastradas (as mais usadas primeiro) e, ao digitar,
// filtra por parte do nome (sem acento nem caixa). Escolher da lista usa o nome cadastrado; se o texto bater com uma
// marca existente, o campo adota o nome dela ao sair. Marca nova é criada ao salvar.
export const chaveMarca = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function useMarcas(empresa: string) {
  return useCarregar(() => api.marcas(empresa).catch(() => [] as OpcaoCadastro[]), [empresa])
}

type Props = {
  empresa: string; valor: string; onMudar: (t: string) => void
  placeholder?: string; required?: boolean; autoFocus?: boolean; ariaLabel?: string; largura?: number
}

const existente = (valor: string, opcoes: OpcaoCadastro[]) => {
  const t = valor.trim()
  return t ? opcoes.find((o) => chaveMarca(o.nome) === chaveMarca(t)) : undefined
}

export function MarcaInput({ empresa, valor, onMudar, placeholder, required, autoFocus, ariaLabel, largura }: Props) {
  const id = useId()
  const opcoes = useMarcas(empresa).dados ?? []
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const fecharEm = useRef<number | undefined>(undefined)
  const achada = existente(valor, opcoes)
  const lista = useMemo(() => {
    const k = chaveMarca(valor)
    return (k ? opcoes.filter((o) => chaveMarca(o.nome).includes(k)) : opcoes).slice(0, 12)
  }, [valor, opcoes])
  const escolher = (nome: string) => { onMudar(nome); setAberto(false); setAtivo(-1) }

  return (
    <span style={{ position: 'relative', display: 'inline-block', width: largura ?? '100%' }}>
      <input value={valor} placeholder={placeholder} required={required} autoFocus={autoFocus} aria-label={ariaLabel} autoComplete="off"
             role="combobox" aria-expanded={aberto} aria-controls={id} aria-autocomplete="list" style={{ width: '100%' }}
             onFocus={() => { window.clearTimeout(fecharEm.current); setAberto(true) }}
             onChange={(e) => { onMudar(e.target.value); setAberto(true); setAtivo(-1) }}
             onBlur={() => {
               if (achada && achada.nome !== valor) onMudar(achada.nome)
               fecharEm.current = window.setTimeout(() => setAberto(false), 120)
             }}
             onKeyDown={(e) => {
               if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo((i) => Math.min(i + 1, lista.length - 1)) }
               else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)) }
               else if (e.key === 'Enter' && aberto && ativo >= 0 && lista[ativo]) { e.preventDefault(); escolher(lista[ativo].nome) }
               else if (e.key === 'Escape' && aberto) { e.stopPropagation(); setAberto(false) }
             }} />
      {aberto && lista.length > 0 && (
        <ul id={id} role="listbox" style={{ position: 'absolute', zIndex: 50, left: 0, right: 0, top: '100%', margin: '2px 0 0', padding: 4, listStyle: 'none',
                 minWidth: 180, maxHeight: 260, overflowY: 'auto', background: 'var(--card2, #222)', border: '1px solid var(--borda, #444)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.35)' }}>
          {lista.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === ativo}
                onMouseDown={(e) => { e.preventDefault(); escolher(o.nome) }} onMouseEnter={() => setAtivo(i)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                         background: i === ativo ? 'var(--borda, #444)' : undefined }}>
              <span>{o.nome}</span><small style={{ opacity: .6 }}>{o.pecas.toLocaleString('pt-BR')}</small>
            </li>))}
        </ul>)}
    </span>
  )
}

export function CampoMarca({ rotulo = 'Marca', ...p }: Props & { rotulo?: string }) {
  const opcoes = useMarcas(p.empresa).dados ?? []
  const t = p.valor.trim()
  const achada = existente(p.valor, opcoes)
  const dica = !t ? (opcoes.length ? 'Escolha da lista ou digite uma nova.' : undefined)
    : achada ? (achada.nome !== p.valor ? `Vai usar o cadastro existente "${achada.nome}".` : undefined)
    : `"${t.replace(/\s+/g, ' ')}" ainda não existe: será cadastrada ao salvar.`
  return <Campo rotulo={rotulo} dica={dica}><MarcaInput {...p} /></Campo>
}
