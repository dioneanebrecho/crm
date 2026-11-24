import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configurado } from './supabase'
import { api, apiPermissoes, type Me, type NivelTela, type Papel } from './api'
import { useCarregar } from './ui'
import TelaEntrada from './TelaEntrada'
import Pecas from './pages/Pecas'
import Unidades from './pages/Unidades'
import Clientes from './pages/Clientes'
import Locais from './pages/Locais'
import Grades from './pages/Grades'
import Integracoes from './pages/Integracoes'
import Agenda from './pages/Agenda'
import Permissoes from './pages/Permissoes'
import Usuarios from './pages/Usuarios'
import ProdutosBling from './pages/ProdutosBling'
import NotasBling from './pages/NotasBling'
import Parceiros from './pages/Parceiros'
import Conhecimento from './pages/Conhecimento'
import Assistente, { esquecerAssistente } from './pages/Assistente'
import Etiquetas from './pages/Etiquetas'
import Vendas from './pages/Vendas'
import PreferenciasVitrine from './pages/PreferenciasVitrine'
import Governanca from './pages/Governanca'
import Gestao from './pages/Gestao'
import GruposProduto from './pages/GruposProduto'
import EntradaCompra from './pages/EntradaCompra'
import Natureza from './pages/Natureza'
import CentroResultado from './pages/CentroResultado'
import Faixa from './Faixa'
import FaixaConfig from './pages/FaixaConfig'
import BotaoAjuda from './ajuda/Ajuda'
import { TourProvider } from './ajuda/Tour'
import { IPecas, IEstoque, IClientes, IAgenda, ILocais, IIntegracoes, ILua, ITema, IMenu, ISair, IMarca, IBaixo, IEtiqueta, IProdutos, INota, IParceiros, IGrade, IAjustes, ILivro, IEscudo, IFaisca, IGov, IGestao } from './icones'
import { lerTema, aplicarTema, type Tema } from './tema'
import { lerDensidade, aplicarDensidade, type Densidade } from './densidade'
import { AbaContexto, MINUTOS_PARA_ATUALIZAR, definirEmpresaEstado } from './abas'

export interface Contexto {
  empresa: string; papeis: Papel[]
  perm: Record<string, NivelTela> | null
  podeCatalogo: boolean; podeUnidade: boolean; podeCliente: boolean; veRentabilidade: boolean; veFinanceiro: boolean; veContato: boolean
}

const tem = (p: Papel[], ...r: Papel[]) => p.includes('superadmin') || r.some((x) => p.includes(x))
// A matriz de permissões só restringe: o papel continua mandando no que o banco aceita (funções da 0011).
// Se a matriz não carregar, o painel cai no comportamento por papel (o banco continua protegendo).
const edita = (perm: Record<string, NivelTela> | null, tela: string) => perm === null || perm[tela] === 'editar'
const contexto = (empresa: string, papeis: Papel[], perm: Record<string, NivelTela> | null): Contexto => ({
  empresa, papeis, perm,
  podeCatalogo: tem(papeis, 'admin', 'gestor') && edita(perm, 'pecas'), podeUnidade: tem(papeis, 'admin', 'gestor', 'expedicao') && edita(perm, 'estoque'),
  podeCliente: tem(papeis, 'admin', 'gestor', 'suporte') && edita(perm, 'clientes'), veRentabilidade: tem(papeis, 'admin', 'gestor', 'rentabilidade'), veFinanceiro: tem(papeis, 'admin', 'gestor', 'financeiro'),
  veContato: tem(papeis, 'admin', 'gestor', 'suporte'),
})

const MAX_ABAS = 8
const GRUPOS = [{ rotulo: 'Catálogo' }, { rotulo: 'Relacionamento' }, { rotulo: 'Live' }, { rotulo: 'Inteligência' }, { rotulo: 'Financeiro' }, { rotulo: 'Configuração' }] as const
const ITENS = [
  { id: 'pecas', rotulo: 'Peças', grupo: 'Catálogo', icone: <IPecas /> },
  { id: 'entrada_compra', rotulo: 'Entrada de mercadoria', grupo: 'Catálogo', icone: <INota /> },
  { id: 'grupos_produto', rotulo: 'Grupos de produto', grupo: 'Catálogo', icone: <IGrade /> },
  { id: 'estoque', rotulo: 'Estoque', grupo: 'Catálogo', icone: <IEstoque /> },
  { id: 'etiquetas', rotulo: 'Etiquetas', grupo: 'Catálogo', icone: <IEtiqueta /> },
  { id: 'saneamento', rotulo: 'Produtos Bling', grupo: 'Catálogo', icone: <IProdutos /> },
  { id: 'fiscal', rotulo: 'Notas Bling', grupo: 'Catálogo', icone: <INota /> },
  { id: 'clientes', rotulo: 'Clientes', grupo: 'Relacionamento', icone: <IClientes /> },
  { id: 'parceiros', rotulo: 'Parceiros', grupo: 'Relacionamento', icone: <IParceiros /> },
  { id: 'vendas', rotulo: 'Central de vendas', grupo: 'Live', icone: <IMarca /> },
  { id: 'agenda', rotulo: 'Agenda', grupo: 'Live', icone: <IAgenda /> },
  { id: 'dashboards', rotulo: 'Painel de Gestão', grupo: 'Inteligência', icone: <IGestao /> },
  { id: 'assistente', rotulo: 'Assistente', grupo: 'Inteligência', icone: <IFaisca /> },
  { id: 'naturezas', rotulo: 'Natureza financeira', grupo: 'Financeiro', icone: <IGestao /> },
  { id: 'centros_resultado', rotulo: 'Centro de resultado', grupo: 'Financeiro', icone: <ILocais /> },
  { id: 'grades', rotulo: 'Grades e atributos', grupo: 'Configuração', icone: <IGrade /> },
  { id: 'locais', rotulo: 'Locais', grupo: 'Configuração', icone: <ILocais /> },
  { id: 'preferencias_vitrine', rotulo: 'Preferências da vitrine', grupo: 'Configuração', icone: <IAjustes /> },
  { id: 'integracoes', rotulo: 'Integrações', grupo: 'Configuração', icone: <IIntegracoes /> },
  { id: 'conhecimento', rotulo: 'Base de conhecimento', grupo: 'Configuração', icone: <ILivro /> },
  { id: 'usuarios', rotulo: 'Usuários e acessos', grupo: 'Configuração', icone: <IClientes /> },
  { id: 'permissoes', rotulo: 'Permissões', grupo: 'Configuração', icone: <IEscudo /> },
  { id: 'governanca', rotulo: 'Central de governança', grupo: 'Configuração', icone: <IGov /> },
  { id: 'faixa', rotulo: 'Faixa informativa', grupo: 'Configuração', icone: <IMarca /> },
] as const
type Aba = (typeof ITENS)[number]['id']

// Link do e-mail (recuperação/convite) chega com o resultado no # da URL. Lemos antes de o supabase-js limpar.
const erroDoLink = (() => {
  const h = new URLSearchParams(location.hash.slice(1))
  if (!h.get('error')) return null
  return h.get('error_code') === 'otp_expired'
    ? 'O link do e-mail expirou ou já foi usado. Se for um convite, peça um novo a quem convidou você; se for recuperação, use "Esqueci minha senha".'
    : (h.get('error_description') ?? 'Não foi possível validar o link.').replace(/\+/g, ' ')
})()

// Convite pelo domínio do painel: o e-mail traz https://crm.evoconecta.io/#convite=<código>; validamos aqui, sem expor a URL do Supabase.
const codigoConvite = new URLSearchParams(location.hash.slice(1)).get('convite')
const tipoConvite = new URLSearchParams(location.hash.slice(1)).get('tipo') === 'recovery' ? 'recovery' : 'invite'
const ERRO_CONVITE = 'O link do convite expirou ou já foi usado. Peça um novo convite a quem convidou você.'

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [recuperando, setRecuperando] = useState(() => !!codigoConvite || ['recovery', 'invite'].includes(new URLSearchParams(location.hash.slice(1)).get('type') ?? ''))
  const [conviteLink] = useState(() => !!codigoConvite || new URLSearchParams(location.hash.slice(1)).get('type') === 'invite')
  const [validando, setValidando] = useState(!!codigoConvite)
  useEffect(() => {
    if (!codigoConvite) return
    history.replaceState(null, '', location.pathname)   // tira o código da barra de endereço
    supabase.auth.verifyOtp({ token_hash: codigoConvite, type: tipoConvite }).then(({ error }) => {
      if (error) { sessionStorage.setItem('erro_convite', ERRO_CONVITE); setRecuperando(false) }
      setValidando(false)
    })
  }, [])
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      setSessao(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  if (!configurado) return <Aviso titulo="Configuração ausente" texto="Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example)." />
  if (sessao === undefined || validando) return <div className="centro"><p className="sub">Carregando…</p></div>
  if (sessao && recuperando) return <NovaSenha convite={conviteLink} onConcluir={() => setRecuperando(false)} />
  return sessao ? <TourProvider><Painel /></TourProvider> : <Login />
}

function NovaSenha({ onConcluir, convite = false }: { onConcluir: () => void; convite?: boolean }) {
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro(null)
    if (senha.length < 10) return setErro('Use pelo menos 10 caracteres.')
    if (senha !== conf) return setErro('As senhas não conferem.')
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) return setErro(error.message)
    await supabase.rpc('convite_concluir')   // marca a senha como criada e o convite como aceito (falha aqui não impede o acesso)
    history.replaceState(null, '', location.pathname)
    onConcluir()
  }
  return (
    <TelaEntrada>
      <form className="cartao login" onSubmit={salvar}>
        <h1>{convite ? 'Bem-vinda(o)! Crie sua senha' : 'Definir nova senha'}</h1>
        <label className="campo"><span>Nova senha</span><input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoFocus /></label>
        <label className="campo"><span>Repita a senha</span><input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} required /></label>
        {erro && <div className="erro" role="alert">{erro}</div>}
        <button type="submit" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar e entrar'}</button>
        <p className="sub">Mínimo de 10 caracteres. Guarde a senha no seu gerenciador de senhas.</p>
      </form>
    </TelaEntrada>
  )
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return <div className="centro"><div className="cartao"><h1>{titulo}</h1><p>{texto}</p></div></div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(() => { const e = sessionStorage.getItem('erro_convite'); sessionStorage.removeItem('erro_convite'); return e ?? erroDoLink })
  const [info, setInfo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  async function esqueci() {
    setErro(null); setInfo(null)
    if (!email.trim()) return setErro('Digite o e-mail acima e clique de novo em "Esqueci minha senha".')
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin })
    setEnviando(false)
    if (error) return setErro(error.message)
    setInfo('Se o e-mail estiver cadastrado, enviamos um link para definir a nova senha. Clique nele uma única vez.')
  }
  async function entrar(e: FormEvent) {
    e.preventDefault(); setEnviando(true); setErro(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
    setEnviando(false)
  }
  return (
    <TelaEntrada>
      <form className="cartao login" onSubmit={entrar}>
        <h1>Entrar no painel</h1>
        <label className="campo"><span>E-mail</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label className="campo"><span>Senha</span><input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
        {erro && <div className="erro" role="alert">{erro}</div>}
        {info && <div className="info" role="status">{info}</div>}
        <button type="submit" disabled={enviando}>{enviando ? 'Aguarde…' : 'Entrar'}</button>
        <button type="button" className="link" onClick={esqueci} disabled={enviando}>Esqueci minha senha</button>
        <p className="sub">Acesso só para a equipe. O cadastro é feito por convite.</p>
      </form>
    </TelaEntrada>
  )
}

function Painel() {
  const me = useCarregar<Me>(() => api.me(), [])
  const [empresaId, setEmpresaId] = useState<string | null>(() => localStorage.getItem('ane.empresa'))
  const [aba, setAba] = useState<Aba>(() => ITENS.find((a) => a.id === location.hash.slice(1))?.id ?? 'pecas')
  const [menu, setMenu] = useState(false)
  // abas de trabalho: uma por tela, todas mantidas montadas (só a ativa aparece), para não perder filtros nem contexto
  const [abertas, setAbertas] = useState<Aba[]>(() => [aba])
  const [recargas, setRecargas] = useState<Record<string, number>>({})
  const rolagens = useRef<Record<string, number>>({})
  const ocultoDesde = useRef<Record<string, number>>({})
  // atalho entre telas: abre a tela com a busca já preenchida (ex.: da resposta do assistente para a nota citada)
  const [atalho, setAtalho] = useState<{ aba: string; q: string; n: number } | null>(null)
  const [tema, setTema] = useState<Tema>(lerTema)
  const [densidade, setDensidade] = useState<Densidade>(lerDensidade)
  // grupos do menu recolhidos pelo título (lembrado no navegador); o item da tela aberta continua visível
  const [fechados, setFechados] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('ane.menu.fechados') ?? '[]') } catch { return [] } })
  const alternarGrupo = (g: string) => setFechados((f) => {
    const n = f.includes(g) ? f.filter((x) => x !== g) : [...f, g]
    try { localStorage.setItem('ane.menu.fechados', JSON.stringify(n)) } catch { /* sem armazenamento: só não lembra */ }
    return n
  })
  useEffect(() => { location.hash = aba }, [aba])
  useEffect(() => { if (atalho && atalho.aba !== aba) setAtalho(null) }, [aba, atalho])
  const abrir = (id: string, q?: string) => { setAtalho(q ? { aba: id, q, n: Date.now() } : null); ativar(id as Aba) }
  const [permMapa, setPermMapa] = useState<{ empresa: string; perm: Record<string, NivelTela> | null } | null>(null)
  const [versaoPerm, setVersaoPerm] = useState(0)
  const empresaAtualId = me.dados ? (me.dados.empresas.find((e) => e.id === empresaId) ?? me.dados.empresas[0])?.id : undefined
  useEffect(() => {
    if (!empresaAtualId) return
    let vivo = true
    apiPermissoes.minhas(empresaAtualId).then((perm) => { if (vivo) setPermMapa({ empresa: empresaAtualId, perm }) })
      .catch(() => { if (vivo) setPermMapa({ empresa: empresaAtualId, perm: null }) })
    return () => { vivo = false }
  }, [empresaAtualId, versaoPerm])
  useEffect(() => {
    if (!empresaAtualId) return
    try {
      const salvas = (JSON.parse(localStorage.getItem(`ane.abas.${empresaAtualId}`) ?? '[]') as string[]).filter((x) => ITENS.some((i) => i.id === x)) as Aba[]
      setAbertas(Array.from(new Set([...salvas, aba])).slice(-MAX_ABAS))
    } catch { setAbertas([aba]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtualId])
  useLayoutEffect(() => { window.scrollTo(0, rolagens.current[aba] ?? 0) }, [aba])
  const salvarAbas = (l: Aba[]) => { if (empresaAtualId) try { localStorage.setItem(`ane.abas.${empresaAtualId}`, JSON.stringify(l)) } catch { /* sem armazenamento */ } }
  // troca a aba visível: guarda a rolagem de quem sai e recarrega os dados de quem volta depois de muito tempo oculta
  const trocar = (id: Aba) => {
    if (id === aba) return
    rolagens.current[aba] = window.scrollY
    ocultoDesde.current[aba] = Date.now()
    const t = ocultoDesde.current[id]
    if (t && Date.now() - t > MINUTOS_PARA_ATUALIZAR * 60_000) setRecargas((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 }))
    delete ocultoDesde.current[id]
    setAba(id)
  }
  const ativar = (id: Aba) => {
    const l = abertas.includes(id) ? abertas : [...abertas, id]
    const cortada = l.length > MAX_ABAS ? l.filter((x, i) => x === id || x === aba || i >= l.length - MAX_ABAS) : l
    const final = cortada.length > MAX_ABAS ? cortada.slice(-MAX_ABAS) : cortada
    setAbertas(final); salvarAbas(final); trocar(id)
  }
  const fechar = (id: Aba) => {
    const l = abertas.filter((x) => x !== id)
    if (l.length === 0) return
    const prox = id === aba ? l[Math.min(abertas.indexOf(id), l.length - 1)] : aba
    delete rolagens.current[id]; delete ocultoDesde.current[id]
    setAbertas(l); salvarAbas(l)
    if (id === aba) trocar(prox)
  }
  const fecharOutras = (id: Aba) => { setAbertas([id]); salvarAbas([id]); trocar(id) }
  const alternarDensidade = () => { const d: Densidade = densidade === 'compacta' ? 'confortavel' : 'compacta'; aplicarDensidade(d); setDensidade(d) }
  const alternarTema = () => { const ordem: Tema[] = ['escuro', 'ane', 'zagent']; const t = ordem[(ordem.indexOf(tema) + 1) % ordem.length]; aplicarTema(t); setTema(t) }

  if (me.erro) return <Aviso titulo="Não foi possível carregar" texto={me.erro} />
  if (!me.dados) return <div className="centro"><p className="sub">Carregando…</p></div>
  const empresas = me.dados.empresas
  const sair = () => { esquecerAssistente(); return supabase.auth.signOut() }

  if (empresas.length === 0) {
    return (
      <div className="centro"><div className="cartao">
        <h1>Sem acesso ainda</h1>
        <p>Você entrou como <strong>{me.dados.usuario?.email ?? 'usuário'}</strong>, mas ainda não tem papel em nenhuma empresa. Peça a um administrador para liberar seu acesso.</p>
        <button className="sec" onClick={sair}>Sair</button>
      </div></div>
    )
  }
  const atual = empresas.find((e) => e.id === empresaId) ?? empresas[0]
  if (!permMapa || permMapa.empresa !== atual.id) return <div className="centro"><p className="sub">Carregando…</p></div>
  const perm = permMapa.perm
  definirEmpresaEstado(atual.id)
  const ctx = contexto(atual.id, atual.papeis, perm)
  const visiveis = ITENS.filter((i) => perm === null ? (i.id !== 'permissoes' && i.id !== 'usuarios') || tem(atual.papeis, 'admin') : perm[i.id] !== undefined && perm[i.id] !== 'nenhum')
  const abaAtual: Aba = visiveis.some((i) => i.id === aba) ? aba : (visiveis[0]?.id ?? 'pecas')
  const lista = abertas.filter((id) => visiveis.some((v) => v.id === id))
  if (!lista.includes(abaAtual) && visiveis.length > 0) lista.push(abaAtual)
  const nome = me.dados.usuario?.nome ?? me.dados.usuario?.email ?? 'Usuário'
  const iniciais = nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || 'U'

  const tela = (id: Aba) => {
    switch (id) {
      case 'pecas': return <Pecas ctx={ctx} />
      case 'entrada_compra': return <EntradaCompra ctx={ctx} />
      case 'grupos_produto': return <GruposProduto ctx={ctx} />
      case 'naturezas': return <Natureza ctx={ctx} />
      case 'centros_resultado': return <CentroResultado ctx={ctx} />
      case 'estoque': return <Unidades ctx={ctx} />
      case 'etiquetas': return <Etiquetas ctx={ctx} />
      case 'saneamento': return <ProdutosBling ctx={ctx} />
      case 'fiscal': return <NotasBling key={atalho?.n ?? 0} ctx={ctx} inicial={atalho?.aba === 'fiscal' ? atalho.q : undefined} />
      case 'clientes': return <Clientes key={atalho?.n ?? 0} ctx={ctx} inicial={atalho?.aba === 'clientes' ? atalho.q : undefined} />
      case 'parceiros': return <Parceiros key={atalho?.n ?? 0} ctx={ctx} inicial={atalho?.aba === 'parceiros' ? atalho.q : undefined} />
      case 'locais': return <Locais ctx={ctx} />
      case 'grades': return <Grades ctx={ctx} />
      case 'integracoes': return <Integracoes ctx={ctx} />
      case 'vendas': return <Vendas ctx={ctx} />
      case 'preferencias_vitrine': return <PreferenciasVitrine ctx={ctx} />
      case 'agenda': return <Agenda />
      case 'dashboards': return <Gestao ctx={ctx} />
      case 'assistente': return <Assistente ctx={ctx} abrir={abrir} />
      case 'conhecimento': return <Conhecimento ctx={ctx} abrir={abrir} />
      case 'usuarios': return <Usuarios ctx={ctx} />
      case 'permissoes': return <Permissoes ctx={ctx} onSalvo={() => setVersaoPerm((v) => v + 1)} />
      case 'governanca': return <Governanca ctx={ctx} />
      case 'faixa': return <FaixaConfig ctx={ctx} />
    }
  }

  return (
    <div className="quadro">
      <aside className={menu ? 'lateral aberta' : 'lateral'}>
        <div className="lateral-marca"><span className="marca-icone"><IMarca /></span><span><strong>Ane Brechó</strong><small>CRM</small></span></div>
        <nav className="lateral-nav" aria-label="Navegação principal" data-ajuda="menu">
          {GRUPOS.map((g) => {
            const itens = visiveis.filter((i) => i.grupo === g.rotulo)
            if (itens.length === 0) return null
            const fechado = fechados.includes(g.rotulo)
            return (
              <div className={fechado ? 'grupo fechado' : 'grupo'} key={g.rotulo}>
                <button type="button" className="grupo-rotulo" aria-expanded={!fechado} onClick={() => alternarGrupo(g.rotulo)}>
                  <span>{g.rotulo}</span><i className="seta"><IBaixo /></i>
                </button>
                {itens.filter((i) => !fechado || i.id === abaAtual).map((i) => (
                  <button key={i.id} className={i.id === abaAtual ? 'item ativo' : 'item'} title={i.rotulo} aria-current={i.id === abaAtual ? 'page' : undefined} onClick={() => { ativar(i.id); setMenu(false) }}>{i.icone}<span>{i.rotulo}</span></button>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="lateral-rodape"><span>ZAYA.IT</span><span>PAINEL V0.5</span></div>
      </aside>
      {menu && <button className="cortina" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
      <div className="principal">
        <header className="topbar">
          <button className="icone-btn sec so-mobile" onClick={() => setMenu(true)} aria-label="Abrir menu"><IMenu /></button>
          {empresas.length > 1
            ? <select className="seletor-empresa" data-ajuda="empresa" value={atual.id} onChange={(e) => { localStorage.setItem('ane.empresa', e.target.value); setEmpresaId(e.target.value) }} aria-label="Empresa">
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            : <div className="empresa-chip" data-ajuda="empresa"><small>EMPRESA</small><strong>{atual.nome}</strong></div>}
          <Faixa empresa={atual.id} />
          <div className="topbar-acoes">
            <button className="sec icone-btn" onClick={alternarDensidade} title={densidade === 'compacta' ? 'Modo compacto (mais linhas) — clique para o modo confortável' : 'Modo confortável — clique para o modo compacto'} aria-label="Alternar densidade" aria-pressed={densidade === 'compacta'}>{densidade === 'compacta' ? '▤' : '☰'}</button>
            <button className="sec icone-btn" data-ajuda="tema" onClick={alternarTema} title={tema === 'escuro' ? 'Tema Escuro — clique para o tema Ane (claro)' : tema === 'ane' ? 'Tema Ane (claro) — clique para o tema ZAgent' : 'Tema ZAgent — clique para o tema Escuro'} aria-label="Alternar tema">{tema === 'escuro' ? <ILua /> : tema === 'ane' ? <ITema /> : <IFaisca />}</button>
            <BotaoAjuda empresa={atual.id} tela={abaAtual} />
            <div className="perfil" data-ajuda="perfil" title={atual.papeis.join(', ')}>
              <span className="avatar">{iniciais}</span>
              <div><strong>{nome}</strong><small>{atual.papeis.join(', ')}</small></div>
            </div>
            <button className="sec icone-btn" onClick={sair} title="Sair" aria-label="Sair"><ISair /></button>
          </div>
        </header>
        {lista.length > 0 && (
          <div className="abas-trabalho" data-ajuda="abas">
            <div className="abas-rolagem" role="tablist" aria-label="Telas abertas">
              {lista.map((id) => {
                const it = ITENS.find((x) => x.id === id)!
                return (
                  <div key={id} className={id === abaAtual ? 'aba-t ativa' : 'aba-t'} ref={id === abaAtual ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}>
                    <button type="button" role="tab" id={`aba-${id}`} aria-selected={id === abaAtual} aria-controls={`painel-${id}`} title={it.rotulo}
                      onClick={() => ativar(id)} onAuxClick={(e) => { if (e.button === 1 && lista.length > 1) { e.preventDefault(); fechar(id) } }}>{it.icone}<span>{it.rotulo}</span></button>
                    {lista.length > 1 && <button type="button" className="aba-x" aria-label={`Fechar ${it.rotulo}`} title="Fechar aba" onClick={() => fechar(id)}>×</button>}
                  </div>
                )
              })}
            </div>
            {lista.length > 1 && <button type="button" className="link aba-outras" onClick={() => fecharOutras(abaAtual)}>Fechar outras</button>}
          </div>
        )}
        <main key={atual.id}>
          {lista.map((id) => (
            <div key={id} className="aba-painel" role="tabpanel" id={`painel-${id}`} aria-labelledby={`aba-${id}`} hidden={id !== abaAtual}>
              <AbaContexto.Provider value={{ ativa: id === abaAtual, recarga: recargas[id] ?? 0 }}>{tela(id)}</AbaContexto.Provider>
            </div>
          ))}
          {visiveis.length === 0 && <div className="vazio"><strong>Sem telas liberadas</strong><p>Peça a um administrador para liberar seu acesso.</p></div>}
        </main>
      </div>
    </div>
  )
}
