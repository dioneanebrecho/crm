import { useEffect, useState, type FormEvent } from 'react'
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
import ProdutosBling from './pages/ProdutosBling'
import NotasBling from './pages/NotasBling'
import Parceiros from './pages/Parceiros'
import Conhecimento from './pages/Conhecimento'
import Assistente from './pages/Assistente'
import Etiquetas from './pages/Etiquetas'
import Vendas from './pages/Vendas'
import PreferenciasVitrine from './pages/PreferenciasVitrine'
import { IPecas, IEstoque, IClientes, IAgenda, ILocais, IIntegracoes, ILua, ITema, IMenu, ISair, IMarca } from './icones'
import { lerTema, aplicarTema, type Tema } from './tema'

export interface Contexto {
  empresa: string; papeis: Papel[]
  perm: Record<string, NivelTela> | null
  podeCatalogo: boolean; podeUnidade: boolean; podeCliente: boolean; veCusto: boolean; veContato: boolean
}

const tem = (p: Papel[], ...r: Papel[]) => p.includes('superadmin') || r.some((x) => p.includes(x))
// A matriz de permissões só restringe: o papel continua mandando no que o banco aceita (funções da 0011).
// Se a matriz não carregar, o painel cai no comportamento por papel (o banco continua protegendo).
const edita = (perm: Record<string, NivelTela> | null, tela: string) => perm === null || perm[tela] === 'editar'
const contexto = (empresa: string, papeis: Papel[], perm: Record<string, NivelTela> | null): Contexto => ({
  empresa, papeis, perm,
  podeCatalogo: tem(papeis, 'admin', 'gestor') && edita(perm, 'pecas'), podeUnidade: tem(papeis, 'admin', 'gestor', 'expedicao') && edita(perm, 'estoque'),
  podeCliente: tem(papeis, 'admin', 'gestor', 'suporte') && edita(perm, 'clientes'), veCusto: tem(papeis, 'admin', 'gestor', 'financeiro'),
  veContato: tem(papeis, 'admin', 'gestor', 'suporte'),
})

const GRUPOS = [{ rotulo: 'Catálogo' }, { rotulo: 'Relacionamento' }, { rotulo: 'Live' }, { rotulo: 'Inteligência' }, { rotulo: 'Configuração' }] as const
const ITENS = [
  { id: 'pecas', rotulo: 'Peças', grupo: 'Catálogo', icone: <IPecas /> },
  { id: 'estoque', rotulo: 'Estoque', grupo: 'Catálogo', icone: <IEstoque /> },
  { id: 'etiquetas', rotulo: 'Etiquetas', grupo: 'Catálogo', icone: <IEstoque /> },
  { id: 'saneamento', rotulo: 'Produtos Bling', grupo: 'Catálogo', icone: <IPecas /> },
  { id: 'fiscal', rotulo: 'Notas Bling', grupo: 'Catálogo', icone: <IEstoque /> },
  { id: 'clientes', rotulo: 'Clientes', grupo: 'Relacionamento', icone: <IClientes /> },
  { id: 'parceiros', rotulo: 'Parceiros', grupo: 'Relacionamento', icone: <IClientes /> },
  { id: 'vendas', rotulo: 'Central de vendas', grupo: 'Live', icone: <IMarca /> },
  { id: 'agenda', rotulo: 'Agenda', grupo: 'Live', icone: <IAgenda /> },
  { id: 'assistente', rotulo: 'Assistente', grupo: 'Inteligência', icone: <IMarca /> },
  { id: 'grades', rotulo: 'Grades e atributos', grupo: 'Configuração', icone: <IPecas /> },
  { id: 'locais', rotulo: 'Locais', grupo: 'Configuração', icone: <ILocais /> },
  { id: 'preferencias_vitrine', rotulo: 'Preferências da vitrine', grupo: 'Configuração', icone: <IIntegracoes /> },
  { id: 'integracoes', rotulo: 'Integrações', grupo: 'Configuração', icone: <IIntegracoes /> },
  { id: 'conhecimento', rotulo: 'Base de conhecimento', grupo: 'Configuração', icone: <IIntegracoes /> },
  { id: 'permissoes', rotulo: 'Permissões', grupo: 'Configuração', icone: <IIntegracoes /> },
] as const
type Aba = (typeof ITENS)[number]['id']

// Link do e-mail (recuperação/convite) chega com o resultado no # da URL. Lemos antes de o supabase-js limpar.
const erroDoLink = (() => {
  const h = new URLSearchParams(location.hash.slice(1))
  if (!h.get('error')) return null
  return h.get('error_code') === 'otp_expired'
    ? 'O link do e-mail expirou ou já foi usado. Peça um novo link de recuperação.'
    : (h.get('error_description') ?? 'Não foi possível validar o link.').replace(/\+/g, ' ')
})()

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [recuperando, setRecuperando] = useState(() => new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      setSessao(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  if (!configurado) return <Aviso titulo="Configuração ausente" texto="Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example)." />
  if (sessao === undefined) return <div className="centro"><p className="sub">Carregando…</p></div>
  if (sessao && recuperando) return <NovaSenha onConcluir={() => setRecuperando(false)} />
  return sessao ? <Painel /> : <Login />
}

function NovaSenha({ onConcluir }: { onConcluir: () => void }) {
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
    history.replaceState(null, '', location.pathname)
    onConcluir()
  }
  return (
    <TelaEntrada>
      <form className="cartao login" onSubmit={salvar}>
        <h1>Definir nova senha</h1>
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
  const [erro, setErro] = useState<string | null>(erroDoLink)
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
  // atalho entre telas: abre a tela com a busca já preenchida (ex.: da resposta do assistente para a nota citada)
  const [atalho, setAtalho] = useState<{ aba: string; q: string; n: number } | null>(null)
  const [tema, setTema] = useState<Tema>(lerTema)
  useEffect(() => { location.hash = aba }, [aba])
  useEffect(() => { if (atalho && atalho.aba !== aba) setAtalho(null) }, [aba, atalho])
  const abrir = (id: string, q?: string) => { setAtalho(q ? { aba: id, q, n: Date.now() } : null); setAba(id as Aba) }
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
  const alternarTema = () => { const t: Tema = tema === 'escuro' ? 'ane' : 'escuro'; aplicarTema(t); setTema(t) }

  if (me.erro) return <Aviso titulo="Não foi possível carregar" texto={me.erro} />
  if (!me.dados) return <div className="centro"><p className="sub">Carregando…</p></div>
  const empresas = me.dados.empresas
  const sair = () => supabase.auth.signOut()

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
  const ctx = contexto(atual.id, atual.papeis, perm)
  const visiveis = ITENS.filter((i) => perm === null ? i.id !== 'permissoes' || tem(atual.papeis, 'admin') : perm[i.id] !== undefined && perm[i.id] !== 'nenhum')
  const abaAtual: Aba = visiveis.some((i) => i.id === aba) ? aba : (visiveis[0]?.id ?? 'pecas')
  const nome = me.dados.usuario?.nome ?? me.dados.usuario?.email ?? 'Usuário'
  const iniciais = nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || 'U'

  return (
    <div className="quadro">
      <aside className={menu ? 'lateral aberta' : 'lateral'}>
        <div className="lateral-marca"><span className="marca-icone"><IMarca /></span><span><strong>Ane Brechó</strong><small>CRM</small></span></div>
        <nav className="lateral-nav" aria-label="Navegação principal">
          {GRUPOS.map((g) => (
            <div className="grupo" key={g.rotulo}>
              <div className="grupo-rotulo">{g.rotulo}</div>
              {visiveis.filter((i) => i.grupo === g.rotulo).map((i) => (
                <button key={i.id} className={i.id === abaAtual ? 'item ativo' : 'item'} onClick={() => { setAba(i.id); setMenu(false) }}>{i.icone}<span>{i.rotulo}</span></button>
              ))}
            </div>
          ))}
        </nav>
        <div className="lateral-rodape"><span>ZAYA.IT</span><span>PAINEL V0.5</span></div>
      </aside>
      {menu && <button className="cortina" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
      <div className="principal">
        <header className="topbar">
          <button className="icone-btn sec so-mobile" onClick={() => setMenu(true)} aria-label="Abrir menu"><IMenu /></button>
          {empresas.length > 1
            ? <select className="seletor-empresa" value={atual.id} onChange={(e) => { localStorage.setItem('ane.empresa', e.target.value); setEmpresaId(e.target.value) }} aria-label="Empresa">
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            : <div className="empresa-chip"><small>EMPRESA</small><strong>{atual.nome}</strong></div>}
          <div className="topbar-acoes">
            <button className="sec icone-btn" onClick={alternarTema} title={tema === 'escuro' ? 'Mudar para o tema Ane (claro)' : 'Mudar para o tema escuro'} aria-label="Alternar tema">{tema === 'escuro' ? <ITema /> : <ILua />}</button>
            <div className="perfil" title={atual.papeis.join(', ')}>
              <span className="avatar">{iniciais}</span>
              <div><strong>{nome}</strong><small>{atual.papeis.join(', ')}</small></div>
            </div>
            <button className="sec icone-btn" onClick={sair} title="Sair" aria-label="Sair"><ISair /></button>
          </div>
        </header>
        <main key={atual.id}>
          {abaAtual === 'pecas' && <Pecas ctx={ctx} />}
          {abaAtual === 'estoque' && <Unidades ctx={ctx} />}
          {abaAtual === 'etiquetas' && <Etiquetas ctx={ctx} />}
          {abaAtual === 'saneamento' && <ProdutosBling ctx={ctx} />}
          {abaAtual === 'fiscal' && <NotasBling key={atalho?.n ?? 0} ctx={ctx} inicial={atalho?.aba === 'fiscal' ? atalho.q : undefined} />}
          {abaAtual === 'clientes' && <Clientes key={atalho?.n ?? 0} ctx={ctx} inicial={atalho?.aba === 'clientes' ? atalho.q : undefined} />}
          {abaAtual === 'parceiros' && <Parceiros key={atalho?.n ?? 0} ctx={ctx} inicial={atalho?.aba === 'parceiros' ? atalho.q : undefined} />}
          {abaAtual === 'locais' && <Locais ctx={ctx} />}
          {abaAtual === 'grades' && <Grades ctx={ctx} />}
          {abaAtual === 'integracoes' && <Integracoes ctx={ctx} />}
          {abaAtual === 'vendas' && <Vendas ctx={ctx} />}
          {abaAtual === 'preferencias_vitrine' && <PreferenciasVitrine ctx={ctx} />}
          {abaAtual === 'agenda' && <Agenda />}
          {abaAtual === 'assistente' && <Assistente ctx={ctx} abrir={abrir} />}
          {abaAtual === 'conhecimento' && <Conhecimento ctx={ctx} abrir={abrir} />}
          {abaAtual === 'permissoes' && <Permissoes ctx={ctx} onSalvo={() => setVersaoPerm((v) => v + 1)} />}
          {visiveis.length === 0 && <div className="vazio"><strong>Sem telas liberadas</strong><p>Peça a um administrador para liberar seu acesso.</p></div>}
        </main>
      </div>
    </div>
  )
}
