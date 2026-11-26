import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AJUDA } from './ajuda/conteudo'
import { IBusca } from './icones'

// Busca rápida de telas (Ctrl/⌘ K ou "/"). Procura no nome, no grupo, em palavras-chave do dia a dia
// e no texto da ajuda de cada tela (explicação, caso de uso e dicas), então "xml", "fornecedor" ou
// "rastreio" levam à tela certa mesmo sem saber o nome dela.

export interface ItemBusca { id: string; rotulo: string; grupo: string; icone: ReactNode }

export const ATALHO_BUSCA = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

// Palavras que as pessoas usam para pedir a tela (sem acento; a busca também ignora acento e caixa).
const PALAVRAS: Record<string, string> = {
  pecas: 'produto cadastro grade tamanho cor preco custo foto sku nova peca margem',
  entrada_compra: 'nota fiscal nf-e nfe xml compra fornecedor recebimento mercadoria rateio frete custo lancamento contas a pagar fornecedor liberar financeiro',
  grupos_produto: 'categoria classificacao departamento marca regras hierarquia arvore',
  estoque: 'unidade fisica local qr numero curto baixa mover inventario saldo',
  etiquetas: 'imprimir etiqueta qr codigo barras modelo reimpressao preparar live',
  saneamento: 'produtos bling duplicidade integracao catalogo origem',
  fiscal: 'notas bling nf-e nfe venda devolucao xml danfe fiscal',
  envios: 'expedicao envio envios frete rastreio correios sedex pac despachar embalar juntar pedidos entrega transportadora',
  parceiros: 'fornecedor fornecedores parceiro cnpj cpf contato duplicados repetidos cadastro cliente clientes comprador instagram whatsapp arroba historico compras transportadora funcionario pre-cadastro',
  vendas: 'live leilao fila espera reserva cobranca link pagamento carrinho pedido venda mensagem arremate',
  agenda: 'calendario live data horario programacao preparar',
  dashboards: 'painel gestao indicadores dre margem vendas faturamento grafico kpi dashboard resultado financeiro',
  assistente: 'ia pergunta chat inteligencia artificial perguntar',
  contas_receber: 'contas a receber titulo titulos recebimento baixa receber cliente parcela parcelamento renegociacao renegociar adiantamento vencido inadimplencia provisao duplicar financeiro',
  contas_pagar: 'contas a pagar titulo titulos pagamento pagar baixa fornecedor boleto guia imposto nfs-e nfse servico retencao iss irrf inss parcela parcelamento recorrente renegociacao adiantamento provisao financeiro',
  contas_bancarias: 'conta bancaria banco saldo caixa extrato movimento transferencia transferir saldo em data financeiro',
  conciliacao: 'conciliacao conciliar ofx extrato banco saldo diferenca importar bancaria financeiro',
  cadastros_financeiro: 'cadastro financeiro conta bancaria tipo de titulo meio pagamento pix cartao boleto taxa projeto parametros fechamento',
  naturezas: 'natureza financeira plano de contas despesa receita de-para categoria bling financeiro dre',
  centros_resultado: 'centro de resultado cr area canal dre custo financeiro',
  grades: 'grade atributos tamanho cor cadastro',
  locais: 'local deposito prateleira loja fisica endereco cadastro',
  preferencias_vitrine: 'vitrine preferencias live apresentadora',
  integracoes: 'bling instagram whatsapp banco api conexao token integracao marketplace',
  conhecimento: 'base conhecimento documentos manual',
  usuarios: 'usuario convite acesso equipe senha',
  permissoes: 'permissao papel acesso tela perfil',
  governanca: 'duvida ocorrencia sugestao governanca relatar problema',
  faixa: 'faixa informativa aviso topo tempo clima noticias',
}

export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()

// distância de edição <= 1 (tolera um erro de digitação)
function perto(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, d = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++d > 1) return false
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++ }
  }
  return d + (a.length - i) + (b.length - j) <= 1
}

interface Indexado extends ItemBusca { nome: string; chaves: string; texto: string; palavras: string[]; resumo: string }

function indexar(itens: ItemBusca[]): Indexado[] {
  return itens.map((it) => {
    const v = AJUDA[it.id]
    const nome = normalizar(it.rotulo)
    const chaves = normalizar(`${it.grupo} ${PALAVRAS[it.id] ?? ''}`)
    const texto = normalizar(v ? `${v.explicacao} ${v.casoDeUso} ${v.dicas.join(' ')}` : '')
    return { ...it, nome, chaves, texto, palavras: Array.from(new Set(`${nome} ${chaves}`.split(' ').filter((w) => w.length >= 3))), resumo: v?.explicacao ?? '' }
  })
}

function pontuar(it: Indexado, tokens: string[]) {
  let total = 0
  for (const t of tokens) {
    let s = 0
    if (it.nome.split(' ').some((w) => w.startsWith(t))) s = 100
    else if (it.nome.includes(t)) s = 80
    else if (it.chaves.includes(t)) s = 60
    else if (it.texto.includes(t)) s = 20
    else if (t.length >= 4 && it.palavras.some((w) => perto(w, t))) s = 30
    else return 0
    total += s
  }
  return total + (it.nome.startsWith(tokens.join(' ')) ? 50 : 0)
}

const CHAVE_RECENTES = 'ane.busca.recentes'
const lerRecentes = (): string[] => { try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]') } catch { return [] } }
const guardarRecente = (id: string) => { try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify([id, ...lerRecentes().filter((x) => x !== id)].slice(0, 5))) } catch { /* sem armazenamento: só não lembra */ } }
const resumir = (s: string) => (s.length > 110 ? s.slice(0, 107).trimEnd() + '…' : s)

type Linha = { tipo: 'titulo'; texto: string } | { tipo: 'item'; item: Indexado }

export default function BuscaRapida({ itens, atual, aberto, onFechar, onAbrir }: {
  itens: ItemBusca[]; atual: string; aberto: boolean; onFechar: () => void; onAbrir: (id: string) => void
}) {
  const indice = useMemo(() => indexar(itens), [itens])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const entrada = useRef<HTMLInputElement>(null)
  const selRef = useRef<HTMLLIElement>(null)
  useEffect(() => { if (aberto) { setQ(''); setSel(0); setTimeout(() => entrada.current?.focus(), 0) } }, [aberto])

  const linhas = useMemo<Linha[]>(() => {
    const tokens = normalizar(q).split(' ').filter(Boolean)
    if (tokens.length === 0) {
      const rec = lerRecentes().map((id) => indice.find((i) => i.id === id)).filter((x): x is Indexado => !!x)
      const resto = indice.filter((i) => !rec.includes(i))
      return [
        ...(rec.length ? [{ tipo: 'titulo', texto: 'Recentes' } as Linha, ...rec.map((item) => ({ tipo: 'item', item }) as Linha)] : []),
        { tipo: 'titulo', texto: rec.length ? 'Outras telas' : 'Todas as telas' } as Linha,
        ...resto.map((item) => ({ tipo: 'item', item }) as Linha),
      ]
    }
    return indice.map((item) => ({ item, p: pontuar(item, tokens) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p).map((x) => ({ tipo: 'item', item: x.item }) as Linha)
  }, [q, indice, aberto])
  const so = linhas.filter((l): l is Extract<Linha, { tipo: 'item' }> => l.tipo === 'item')
  useEffect(() => { setSel(0) }, [q])
  useEffect(() => { selRef.current?.scrollIntoView({ block: 'nearest' }) }, [sel, linhas])

  if (!aberto) return null
  const abrir = (id: string) => { guardarRecente(id); onFechar(); onAbrir(id) }
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onFechar() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, so.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const a = so[sel]; if (a) abrir(a.item.id) }
  }
  let n = -1
  return (
    <div className="busca-veu" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="busca-caixa" role="dialog" aria-modal="true" aria-label="Buscar tela ou funcionalidade" onKeyDown={tecla}>
        <div className="busca-campo">
          <IBusca />
          <input ref={entrada} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tela ou funcionalidade: nota fiscal, etiqueta, fornecedor, rastreio…" aria-label="Buscar" autoComplete="off" spellCheck={false} />
          <kbd>Esc</kbd>
        </div>
        <ul className="busca-lista" role="listbox">
          {linhas.map((l, k) => {
            if (l.tipo === 'titulo') return <li key={`t${k}`} className="busca-titulo" role="presentation">{l.texto}</li>
            n++
            const ativo = n === sel
            return (
              <li key={l.item.id} ref={ativo ? selRef : undefined} role="option" aria-selected={ativo} className={ativo ? 'busca-item sel' : 'busca-item'}
                onMouseMove={((i) => () => setSel(i))(n)} onClick={() => abrir(l.item.id)}>
                <span className="busca-ico">{l.item.icone}</span>
                <span className="busca-txt"><strong>{l.item.rotulo}{l.item.id === atual && <em> · aberta agora</em>}</strong>{l.item.resumo && <small>{resumir(l.item.resumo)}</small>}</span>
                <span className="busca-grupo">{l.item.grupo}</span>
              </li>
            )
          })}
          {so.length === 0 && <li className="busca-vazio" role="presentation">Nenhuma tela encontrada para “{q}”. Tente outra palavra, como nota, etiqueta, fornecedor ou rastreio.</li>}
        </ul>
        <div className="busca-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
      </div>
    </div>
  )
}
