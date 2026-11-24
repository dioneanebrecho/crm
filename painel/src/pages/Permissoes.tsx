import { useEffect, useMemo, useState } from 'react'
import { apiPermissoes as api, type NivelTela } from '../api'
import { Vazio, useCarregar, Titulo } from '../ui'
import type { Contexto } from '../App'

const ROTULO_PAPEL: Record<string, string> = { gestor: 'Gestor', suporte: 'Suporte', apresentadora: 'Apresentadora', expedicao: 'Expedição', financeiro: 'Financeiro', leitura: 'Leitura' }
const ROTULO_NIVEL: Record<NivelTela, string> = { nenhum: 'Sem acesso', ver: 'Só ver', editar: 'Editar' }
const RANK: Record<NivelTela, number> = { nenhum: 0, ver: 1, editar: 2 }

export default function Permissoes({ ctx, onSalvo }: { ctx: Contexto; onSalvo: () => void }) {
  const admin = ctx.papeis.includes('admin') || ctx.papeis.includes('superadmin')
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.listar(ctx.empresa), [ctx.empresa])
  const [edit, setEdit] = useState<Record<string, Record<string, NivelTela>>>({})
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmaRestaurar, setConfirmaRestaurar] = useState(false)
  useEffect(() => { if (dados) setEdit(JSON.parse(JSON.stringify(dados.matriz))) }, [dados])

  const mudancas = useMemo(() => {
    if (!dados) return []
    const out: { tela: string; papel: string; nivel: NivelTela }[] = []
    for (const t of dados.telas) for (const p of dados.papeis) {
      const novo = edit[t.tela]?.[p]; const velho = dados.matriz[t.tela]?.[p]
      if (novo && velho && novo !== velho) out.push({ tela: t.tela, papel: p, nivel: novo })
    }
    return out
  }, [dados, edit])

  if (!admin) return <Vazio titulo="Só administradores" texto="A configuração de permissões é restrita a administradores." />
  if (erro) return <div className="erro">{erro}</div>
  if (carregando && !dados) return <p className="sub">Carregando…</p>
  if (!dados) return null
  const grupos = Array.from(new Set(dados.telas.map((t) => t.grupo)))

  async function salvar() {
    setOcupado(true); setMsg(null)
    try { const n = await api.salvar(ctx.empresa, mudancas); recarregar(); onSalvo(); setMsg({ ok: true, texto: `${n} permissão(ões) salva(s). Vale no próximo carregamento do painel de cada usuário.` }) }
    catch (e) { setMsg({ ok: false, texto: (e as Error).message }) } finally { setOcupado(false) }
  }
  async function restaurar() {
    setOcupado(true); setMsg(null); setConfirmaRestaurar(false)
    try { await api.restaurar(ctx.empresa); recarregar(); onSalvo(); setMsg({ ok: true, texto: 'Permissões restauradas para o padrão.' }) }
    catch (e) { setMsg({ ok: false, texto: (e as Error).message }) } finally { setOcupado(false) }
  }

  return (
    <section>
      <div className="topo"><div><Titulo ajuda={<>Defina o que cada papel vê e edita. Administradores sempre têm acesso total. Já estão listadas também as telas previstas; elas passam a valer quando a tela for ativada.</>}>Permissões por tela</Titulo></div></div>
      <div className="aviso-caixa">Por enquanto a matriz <strong>restringe</strong> o que o painel mostra e permite. As regras de segurança do banco para peças, estoque e clientes continuam por papel; liberar acima delas exige migrar essas funções.</div>
      {msg && <div className={msg.ok ? 'info' : 'erro'} role="status">{msg.texto}</div>}
      <div className="tabela-rolavel" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Tela</th>{dados.papeis.map((p) => <th key={p}>{ROTULO_PAPEL[p] ?? p}</th>)}</tr></thead>
          <tbody>
            {grupos.map((g) => [
              <tr key={'g' + g}><td colSpan={dados.papeis.length + 1}><strong>{g}</strong></td></tr>,
              ...dados.telas.filter((t) => t.grupo === g).map((t) => (
                <tr key={t.tela}>
                  <td style={{ whiteSpace: 'normal' }}>{t.rotulo}{' '}
                    <span className={`pill pill-${t.situacao === 'ativa' ? 'ok' : 'mudo'}`}><i />{t.situacao === 'ativa' ? 'Ativa' : 'Prevista'}</span>
                    {t.descricao && <small style={{ display: 'block' }} className="sub">{t.descricao}</small>}
                  </td>
                  {dados.papeis.map((p) => (
                    <td key={p}>
                      <select aria-label={`${t.rotulo}: ${ROTULO_PAPEL[p] ?? p}`} value={edit[t.tela]?.[p] ?? 'nenhum'} disabled={t.nivel_max === 'nenhum' || ocupado}
                              onChange={(e) => setEdit({ ...edit, [t.tela]: { ...edit[t.tela], [p]: e.target.value as NivelTela } })}>
                        {(['nenhum', 'ver', 'editar'] as NivelTela[]).filter((n) => RANK[n] <= RANK[t.nivel_max]).map((n) => <option key={n} value={n}>{ROTULO_NIVEL[n]}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="barra-acoes" style={{ marginTop: 16 }}>
        <button onClick={salvar} disabled={ocupado || mudancas.length === 0}>{ocupado ? 'Salvando…' : `Salvar${mudancas.length ? ` (${mudancas.length})` : ''}`}</button>
        {mudancas.length > 0 && !ocupado && <><button className="sec" onClick={() => setEdit(JSON.parse(JSON.stringify(dados.matriz)))}>Descartar</button><span className="sujo">Alterações não salvas</span></>}
        <span className="espaco" />
        {confirmaRestaurar
          ? <><span className="sub">Voltar tudo ao padrão?</span><button className="sec" onClick={restaurar} disabled={ocupado}>Sim, restaurar</button><button className="sec" onClick={() => setConfirmaRestaurar(false)}>Cancelar</button></>
          : <button className="sec" onClick={() => setConfirmaRestaurar(true)} disabled={ocupado}>Restaurar padrão</button>}
      </div>
    </section>
  )
}
