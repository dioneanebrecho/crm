import { useMemo, useState } from 'react'
import { apiPermissoes, apiUsuarios, type ConviteLinha, type GrupoAcesso, type MatrizPermissoes, type NivelTela, type ResultadoConvite, type UsuarioAcesso } from '../api'
import { Abas, Campo, Formulario, Modal, Vazio, useCarregar } from '../ui'
import type { Contexto } from '../App'

const PAPEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', suporte: 'Suporte', apresentadora: 'Apresentadora', expedicao: 'Expedição', financeiro: 'Financeiro', leitura: 'Consulta' }
const PAPEIS_GRUPO = ['gestor', 'suporte', 'apresentadora', 'expedicao', 'financeiro', 'leitura']
const PAPEIS_DIRETOS = ['admin', ...PAPEIS_GRUPO]
const RANK: Record<NivelTela, number> = { nenhum: 0, ver: 1, editar: 2 }
const NIVEL_ROTULO: Record<string, string> = { ver: 'Só ver', editar: 'Ver e editar' }
const quando = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const alterna = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v])

type AbaId = 'usuarios' | 'grupos' | 'convites'

/** Telas que o conjunto de papéis libera, lidas da matriz de permissões (o administrador vê tudo). */
function telasLiberadas(m: MatrizPermissoes | null, papeis: string[]): { rotulo: string; nivel: NivelTela }[] {
  if (!m) return []
  return m.telas.filter((t) => t.situacao === 'ativa').map((t) => {
    const nivel: NivelTela = papeis.includes('admin') ? 'editar'
      : papeis.reduce<NivelTela>((mx, p) => (RANK[m.matriz[t.tela]?.[p] ?? 'nenhum'] > RANK[mx] ? (m.matriz[t.tela]?.[p] ?? 'nenhum') : mx), 'nenhum')
    return { rotulo: t.rotulo, nivel }
  }).filter((t) => t.nivel !== 'nenhum')
}

function PreviaTelas({ matriz, papeis }: { matriz: MatrizPermissoes | null; papeis: string[] }) {
  const telas = telasLiberadas(matriz, papeis)
  if (papeis.length === 0) return <p className="sub">Escolha ao menos um grupo ou papel para ver o que será liberado.</p>
  return (
    <div className="chips" aria-label="Telas liberadas">
      {telas.map((t) => <span key={t.rotulo} className={`pill ${t.nivel === 'editar' ? 'pill-ok' : ''}`}>{t.rotulo} · {NIVEL_ROTULO[t.nivel]}</span>)}
    </div>
  )
}

function Selecao({ itens, marcados, onAlternar, desabilitado }: { itens: { id: string; rotulo: string; dica?: string }[]; marcados: string[]; onAlternar: (id: string) => void; desabilitado?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {itens.map((i) => (
        <label className="check" key={i.id}>
          <input type="checkbox" checked={marcados.includes(i.id)} disabled={desabilitado} onChange={() => onAlternar(i.id)} /> {i.rotulo}
          {i.dica && <small className="sub"> — {i.dica}</small>}
        </label>
      ))}
    </div>
  )
}

export default function Usuarios({ ctx }: { ctx: Contexto }) {
  const admin = ctx.papeis.includes('admin') || ctx.papeis.includes('superadmin')
  const [aba, setAba] = useState<AbaId>('usuarios')
  const us = useCarregar(() => apiUsuarios.listar(ctx.empresa), [ctx.empresa])
  const gr = useCarregar(() => apiUsuarios.grupos(ctx.empresa), [ctx.empresa])
  const mz = useCarregar(() => apiPermissoes.listar(ctx.empresa), [ctx.empresa])
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [convidando, setConvidando] = useState(false)
  const [editando, setEditando] = useState<UsuarioAcesso | null>(null)
  const [grupoEdit, setGrupoEdit] = useState<GrupoAcesso | 'novo' | null>(null)
  const [resultado, setResultado] = useState<ResultadoConvite | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const grupos = useMemo(() => gr.dados ?? [], [gr.dados])
  const gruposAtivos = grupos.filter((g) => g.ativo)

  if (!admin) return <Vazio titulo="Só administradores" texto="O cadastro de usuários e acessos é restrito a administradores." />
  const erro = us.erro ?? gr.erro
  if (erro) return <div className="erro">{erro}</div>
  if ((us.carregando && !us.dados) || (gr.carregando && !gr.dados)) return <p className="sub">Carregando…</p>
  const usuarios = us.dados?.usuarios ?? []
  const convites = us.dados?.convites ?? []
  const recarregar = () => { us.recarregar(); gr.recarregar() }

  async function reenviar(c: ConviteLinha) {
    setOcupado(true); setMsg(null)
    try {
      const ids = c.grupos.map((n) => grupos.find((g) => g.nome === n)?.id).filter((x): x is string => !!x)
      const r = await apiUsuarios.convidar(ctx.empresa, { email: c.email, nome: c.nome, papeis: c.papeis, grupos: ids })
      recarregar(); setResultado(r)
      if (r.enviado) setMsg({ ok: true, texto: `Convite reenviado para ${c.email}.` })
    } catch (e) { setMsg({ ok: false, texto: (e as Error).message }) } finally { setOcupado(false) }
  }
  async function revogar(c: ConviteLinha) {
    setOcupado(true); setMsg(null)
    try { await apiUsuarios.revogar(ctx.empresa, c.id); recarregar(); setMsg({ ok: true, texto: `Convite de ${c.email} revogado.` }) }
    catch (e) { setMsg({ ok: false, texto: (e as Error).message }) } finally { setOcupado(false) }
  }

  const statusPill = (s: UsuarioAcesso['status']) =>
    s === 'ativo' ? <span className="pill pill-ok"><i />Ativo</span> : s === 'convidado' ? <span className="pill pill-aviso"><i />Convite pendente</span> : <span className="pill pill-mudo"><i />Desativado</span>

  return (
    <section>
      <div className="topo">
        <div><h1>Usuários e acessos</h1>
          <p className="sub">Convide pessoas por e-mail e libere o acesso por grupos. O que cada papel vê e edita é definido em Permissões.</p></div>
        <button onClick={() => setConvidando(true)}>Convidar pessoa</button>
      </div>
      {msg && <div className={msg.ok ? 'info' : 'erro'} role="status">{msg.texto}</div>}
      <Abas abas={[{ id: 'usuarios', rotulo: 'Usuários', contagem: usuarios.length }, { id: 'grupos', rotulo: 'Grupos', contagem: grupos.length }, { id: 'convites', rotulo: 'Convites', contagem: convites.length }]} ativa={aba} onMudar={setAba} />

      {aba === 'usuarios' && (usuarios.length === 0
        ? <Vazio titulo="Nenhum usuário" texto="Convide a primeira pessoa da equipe." />
        : <div className="tabela-rolavel"><table>
            <thead><tr><th>Nome</th><th>Grupos</th><th>Papéis diretos</th><th>Situação</th><th>Último acesso</th><th /></tr></thead>
            <tbody>{usuarios.map((u) => (
              <tr key={u.id}>
                <td style={{ whiteSpace: 'normal' }}><strong>{u.nome}</strong><small className="sub" style={{ display: 'block' }}>{u.email}</small></td>
                <td style={{ whiteSpace: 'normal' }}>{u.grupos.length ? u.grupos.map((g) => g.nome).join(', ') : '—'}</td>
                <td style={{ whiteSpace: 'normal' }}>{u.papeis.length ? u.papeis.map((p) => PAPEL[p] ?? p).join(', ') : '—'}</td>
                <td>{statusPill(u.status)}</td>
                <td>{quando(u.ultimo_acesso)}</td>
                <td>{!u.superadmin && <button className="sec" onClick={() => setEditando(u)}>Editar acesso</button>}</td>
              </tr>))}</tbody>
          </table></div>)}

      {aba === 'grupos' && (<>
        <div className="barra-acoes"><button onClick={() => setGrupoEdit('novo')}>Novo grupo</button></div>
        <div className="tabela-rolavel" style={{ marginTop: 8 }}><table>
          <thead><tr><th>Grupo</th><th>Papéis incluídos</th><th>Membros</th><th>Situação</th><th /></tr></thead>
          <tbody>{grupos.map((g) => (
            <tr key={g.id}>
              <td style={{ whiteSpace: 'normal' }}><strong>{g.nome}</strong>{g.sistema && <span className="pill" style={{ marginLeft: 6 }}>Padrão</span>}
                {g.descricao && <small className="sub" style={{ display: 'block' }}>{g.descricao}</small>}</td>
              <td style={{ whiteSpace: 'normal' }}>{g.papeis.map((p) => PAPEL[p] ?? p).join(', ') || '—'}</td>
              <td>{g.membros}</td>
              <td>{g.ativo ? <span className="pill pill-ok"><i />Ativo</span> : <span className="pill pill-mudo"><i />Desativado</span>}</td>
              <td><button className="sec" onClick={() => setGrupoEdit(g)}>Editar</button></td>
            </tr>))}</tbody>
        </table></div>
      </>)}

      {aba === 'convites' && (convites.length === 0
        ? <Vazio titulo="Nenhum convite pendente" texto="Os convites aceitos aparecem na aba Usuários." />
        : <div className="tabela-rolavel"><table>
            <thead><tr><th>Pessoa</th><th>Acesso</th><th>Enviado em</th><th>Validade</th><th /></tr></thead>
            <tbody>{convites.map((c) => (
              <tr key={c.id}>
                <td style={{ whiteSpace: 'normal' }}><strong>{c.nome}</strong><small className="sub" style={{ display: 'block' }}>{c.email}</small></td>
                <td style={{ whiteSpace: 'normal' }}>{[...c.grupos, ...c.papeis.map((p) => PAPEL[p] ?? p)].join(', ')}</td>
                <td>{quando(c.criado_em)}</td>
                <td>{c.expirado ? <span className="pill pill-erro"><i />Expirado</span> : <span className="pill pill-aviso"><i />Até {quando(c.expira_em)}</span>}</td>
                <td><div className="barra-acoes">
                  <button className="sec" disabled={ocupado} onClick={() => reenviar(c)}>Reenviar</button>
                  <button className="sec" disabled={ocupado} onClick={() => revogar(c)}>Revogar</button></div></td>
              </tr>))}</tbody>
          </table></div>)}

      {convidando && (
        <ModalAcesso ctx={ctx} modo="convidar" grupos={gruposAtivos} matriz={mz.dados} onFechar={() => setConvidando(false)}
          onFeito={(r) => { setConvidando(false); recarregar(); if (r?.enviado) setMsg({ ok: true, texto: 'Convite enviado por e-mail.' }); else if (r) setResultado(r) }} />)}
      {editando && (
        <ModalAcesso ctx={ctx} modo="editar" usuario={editando} grupos={gruposAtivos} matriz={mz.dados} onFechar={() => setEditando(null)}
          onFeito={() => { setEditando(null); recarregar(); setMsg({ ok: true, texto: 'Acesso atualizado. Vale na hora.' }) }} />)}
      {grupoEdit && (
        <ModalGrupo ctx={ctx} grupo={grupoEdit === 'novo' ? null : grupoEdit} onFechar={() => setGrupoEdit(null)}
          onFeito={(texto) => { setGrupoEdit(null); recarregar(); setMsg({ ok: true, texto }) }} />)}
      {resultado && (
        <Modal titulo="Convite criado" onFechar={() => setResultado(null)}>
          <div className="form">
            <div className="aviso-caixa">{resultado.aviso ?? 'O e-mail não foi enviado.'}</div>
            {resultado.link && <>
              <Campo rotulo="Link de criação de senha (uso único)"><input readOnly value={resultado.link} onFocus={(e) => e.currentTarget.select()} /></Campo>
              <div className="acoes"><button type="button" onClick={() => navigator.clipboard?.writeText(resultado.link!)}>Copiar link</button></div></>}
            <div className="acoes"><button type="button" className="sec" onClick={() => setResultado(null)}>Fechar</button></div>
          </div>
        </Modal>)}
    </section>
  )
}

function ModalAcesso({ ctx, modo, usuario, grupos, matriz, onFechar, onFeito }: {
  ctx: Contexto; modo: 'convidar' | 'editar'; usuario?: UsuarioAcesso; grupos: GrupoAcesso[]; matriz: MatrizPermissoes | null
  onFechar: () => void; onFeito: (r?: ResultadoConvite) => void
}) {
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [gSel, setGSel] = useState<string[]>(usuario?.grupos.map((g) => g.id) ?? [])
  const [pSel, setPSel] = useState<string[]>(usuario?.papeis ?? [])
  const [confirmaDesativar, setConfirmaDesativar] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const papeisEfetivos = useMemo(() => Array.from(new Set([...pSel, ...grupos.filter((g) => gSel.includes(g.id)).flatMap((g) => g.papeis)])), [pSel, gSel, grupos])

  async function salvar() {
    if (modo === 'convidar') {
      const r = await apiUsuarios.convidar(ctx.empresa, { email, nome, papeis: pSel, grupos: gSel })
      onFeito(r)
    } else {
      await apiUsuarios.definirAcesso(ctx.empresa, usuario!.id, pSel, gSel, true)
      onFeito()
    }
  }
  async function desativar() {
    setErroAcao(null)
    try { await apiUsuarios.definirAcesso(ctx.empresa, usuario!.id, [], [], false); onFeito() }
    catch (e) { setErroAcao((e as Error).message); setConfirmaDesativar(false) }
  }
  const reativar = usuario?.status === 'desativado'

  return (
    <Modal titulo={modo === 'convidar' ? 'Convidar pessoa' : `Acesso de ${usuario!.nome}`} onFechar={onFechar} larga>
      <Formulario onEnviar={salvar} onCancelar={onFechar} enviarRotulo={modo === 'convidar' ? 'Enviar convite' : reativar ? 'Reativar com este acesso' : 'Salvar acesso'}>
        {modo === 'convidar' ? <>
          <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} autoFocus /></Campo>
          <Campo rotulo="E-mail" dica="O convite com o link para criar a senha vai para este endereço."><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Campo>
        </> : <p className="sub">{usuario!.email}</p>}
        <Campo rotulo="Grupos de acesso" dica="Escolha o grupo que combina com a função da pessoa. Mudar o grupo depois muda o acesso na hora.">
          <Selecao itens={grupos.map((g) => ({ id: g.id, rotulo: g.nome, dica: g.descricao ?? undefined }))} marcados={gSel} onAlternar={(id) => setGSel(alterna(gSel, id))} />
        </Campo>
        <details>
          <summary>Papéis diretos (avançado)</summary>
          <Selecao itens={PAPEIS_DIRETOS.map((p) => ({ id: p, rotulo: PAPEL[p], dica: p === 'admin' ? 'acesso total, inclusive usuários e permissões' : undefined }))} marcados={pSel} onAlternar={(id) => setPSel(alterna(pSel, id))} />
        </details>
        <div><strong>O que este acesso libera</strong><PreviaTelas matriz={matriz} papeis={papeisEfetivos} /></div>
        {erroAcao && <div className="erro" role="alert">{erroAcao}</div>}
        {modo === 'editar' && !reativar && (
          <div className="barra-acoes">
            {confirmaDesativar
              ? <><span className="sub">Cortar o acesso desta pessoa agora?</span><button type="button" className="sec" onClick={desativar}>Sim, desativar</button><button type="button" className="sec" onClick={() => setConfirmaDesativar(false)}>Cancelar</button></>
              : <button type="button" className="sec" onClick={() => setConfirmaDesativar(true)}>Desativar acesso</button>}
          </div>)}
      </Formulario>
    </Modal>
  )
}

function ModalGrupo({ ctx, grupo, onFechar, onFeito }: { ctx: Contexto; grupo: GrupoAcesso | null; onFechar: () => void; onFeito: (texto: string) => void }) {
  const [nome, setNome] = useState(grupo?.nome ?? '')
  const [descricao, setDescricao] = useState(grupo?.descricao ?? '')
  const [papeis, setPapeis] = useState<string[]>(grupo?.papeis ?? [])
  const [ativo, setAtivo] = useState(grupo?.ativo ?? true)
  const [confirma, setConfirma] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  async function salvar() {
    await apiUsuarios.salvarGrupo(ctx.empresa, { id: grupo?.id, nome, descricao, papeis, ativo })
    onFeito(grupo ? 'Grupo atualizado. Vale na hora para todos os membros.' : 'Grupo criado.')
  }
  async function excluir() {
    setErroAcao(null)
    try { await apiUsuarios.excluirGrupo(ctx.empresa, grupo!.id); onFeito('Grupo excluído.') }
    catch (e) { setErroAcao((e as Error).message); setConfirma(false) }
  }
  return (
    <Modal titulo={grupo ? `Grupo ${grupo.nome}` : 'Novo grupo'} onFechar={onFechar}>
      <Formulario onEnviar={salvar} onCancelar={onFechar}>
        <Campo rotulo="Nome do grupo"><input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={60} autoFocus /></Campo>
        <Campo rotulo="Descrição (opcional)"><input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} /></Campo>
        <Campo rotulo="Papéis incluídos" dica="Quem estiver no grupo recebe todos estes papéis. O papel de administrador só é dado direto à pessoa.">
          <Selecao itens={PAPEIS_GRUPO.map((p) => ({ id: p, rotulo: PAPEL[p] }))} marcados={papeis} onAlternar={(id) => setPapeis(alterna(papeis, id))} />
        </Campo>
        <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Grupo ativo (desativar tira o acesso que ele dá aos membros)</label>
        {erroAcao && <div className="erro" role="alert">{erroAcao}</div>}
        {grupo && !grupo.sistema && (
          <div className="barra-acoes">
            {confirma
              ? <><span className="sub">Excluir este grupo?</span><button type="button" className="sec" onClick={excluir}>Sim, excluir</button><button type="button" className="sec" onClick={() => setConfirma(false)}>Cancelar</button></>
              : <button type="button" className="sec" onClick={() => setConfirma(true)}>Excluir grupo</button>}
          </div>)}
      </Formulario>
    </Modal>
  )
}
