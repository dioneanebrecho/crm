import { useMemo, useRef, useState } from 'react'
import { apiParceiros, apiReceita, apiRegras, type RegraParceiro, brl, data, type ContatoCadastro, type DadosParceiro, type DocumentoParceiro, type HistoricoNota, type ReceitaCnpj, type FiltroParceiro, type ParceiroEntrada, type ParceiroLinha, type PendenteLinha } from '../api'
import { Abas, Busca, Campo, Formulario, Modal, Paginacao, useCarregar, Vazio, Titulo } from '../ui'
import { useEstadoTela } from '../abas'
import type { Contexto } from '../App'
import { DetalheNota } from './NotasBling'
import { classificar } from '../documento'
import { lerNfe } from '../xmlNfe'

const LIMITE = 50
const LIMITE_NOTAS = 20
const PAPEIS: Record<string, string> = { cliente: 'Cliente', fornecedor: 'Fornecedor', transportadora: 'Transportadora', funcionario: 'Funcionário' }
const FILTRO_PAPEL: Record<string, string> = { ...PAPEIS, pre_cadastro: 'Pré-cadastro (sem CPF/CNPJ)', sem_papel: 'Sem papel', vip: 'VIP (paga depois)', lista_bloqueio: 'Lista de bloqueio' }
const CRITERIO: Record<string, string> = { documento: 'Mesmo CPF/CNPJ', instagram: 'Mesmo @', manual: 'Decisão manual', sem_chave: 'Sem chave (só nome)' }
const STATUS: Record<string, string> = { vinculado: 'Vinculado', revisao: 'Em revisão', proposto: 'Proposto' }
const SIT: Record<string, string> = { A: 'Ativo', E: 'Excluído', I: 'Inativo' }
const VINCULO: Record<string, string> = { titular: 'Titular', familiar: 'Familiar', terceiro: 'Terceiro', nao_informado: 'Não informado' }
const SIT_CONTATO: Record<string, string> = { confirmado: 'Confirmado', pendente: 'Pendente', inativo: 'Inativo' }
const TIPO_CONTATO: Record<string, string> = { instagram: 'Instagram', whatsapp: 'WhatsApp', email: 'E-mail', telefone: 'Telefone' }
const ORIGEM_CONTATO: Record<string, string> = { bling: 'Bling', meta_dm: 'Direct', meta_live: 'Live', whatsapp: 'WhatsApp', vitrine: 'Vitrine', pagamento: 'Link de pagamento', perfil_cliente: 'Atendimento', manual: 'Manual', migracao: 'Migração' }
const VAZIO: FiltroParceiro = { busca: '', papel: '', ativo: '', tipo: '', minContatos: '', soRevisao: false }
type Aba = 'parceiros' | 'revisao' | 'proposto'

/** Nome para exibição: tira os @, barras e "INATIVO" que vieram do Bling; nome todo em maiúsculas vira Nome Próprio. */
export function nomeLimpo(n: string): string {
  let s = n.replace(/@[\w.]+/g, ' ').replace(/[/|]+/g, ' ').replace(/\s*-?\s*INATIV[OA]?\s*$/i, '').replace(/\s+/g, ' ').trim()
  if (!s) return n
  if (s === s.toUpperCase() && /\p{L}/u.test(s)) {
    s = s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
      .replace(/ (Da|De|Do|Das|Dos|E) /g, (m) => m.toLowerCase())
  }
  return s
}
const temDocumento = (ids: string[] | null) => (ids ?? []).some((i) => /^(CPF|CNPJ) /.test(i))
const arrobas = (ids: string[] | null) => (ids ?? []).filter((i) => i.startsWith('@'))
const documentos = (ids: string[] | null) => (ids ?? []).filter((i) => !i.startsWith('@') && !i.startsWith('#'))
const marca = (ids: string[] | null, m: string) => (ids ?? []).includes(m)

function Chips({ p }: { p: ParceiroLinha }) {
  const ar = arrobas(p.identificadores)
  return (
    <div className="parceiro-chips">
      {marca(p.identificadores, '#VIP') && <span className="selo selo-reservada" title="Cliente VIP: pode acumular peças e pagar depois">VIP</span>}
      {marca(p.identificadores, '#BLOQUEIO') && <span className="selo selo-baixada" title="Na lista de bloqueio: ignorada na live, vitrine e mensagens">Bloqueado</span>}
      {(p.papeis ?? []).map((x) => <span key={x} className="selo selo-disponivel">{PAPEIS[x] ?? x}</span>)}
      {!temDocumento(p.identificadores) && <span className="selo selo-reservada" title="Sem CPF/CNPJ: nasceu pelo Instagram, WhatsApp ou vitrine">Pré-cadastro</span>}
      {documentos(p.identificadores).map((d) => <span key={d} className="selo">{d}</span>)}
      {ar.slice(0, 3).map((a) => <span key={a} className="selo" title={a}>{a}</span>)}
      {ar.length > 3 && <span className="selo" title={ar.slice(3).join(' · ')}>+{ar.length - 3}</span>}
      {!p.ativo && <span className="selo selo-baixada">Inativo</span>}
    </div>
  )
}

export default function Parceiros({ ctx, inicial, papel }: { ctx: Contexto; inicial?: string; papel?: string }) {
  const [aba, setAba] = useEstadoTela<Aba>('parceiros.aba', 'parceiros')
  const [novo, setNovo] = useState(false)
  const [bloquear, setBloquear] = useState(false)
  const [versao, setVersao] = useState(0)
  const podeBloquear = ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor'].includes(p))
  return (
    <section>
      <div className="topo">
        <div><Titulo ajuda={<>Cadastro único de pessoas e empresas: um ID por CPF/CNPJ. O mesmo parceiro pode ser cliente, fornecedor, transportadora e funcionário ao mesmo tempo. Quem chega só pelo Instagram, WhatsApp ou vitrine fica como pré-cadastro até informar o CPF no link de pagamento.</>}>Parceiros</Titulo></div>
        <div className="acoes">
          {podeBloquear && <button className="sec" onClick={() => setBloquear(true)} title="Ignorar um @ ou WhatsApp na live, vitrine e mensagens">Bloquear @ ou WhatsApp</button>}
          {ctx.veContato && <button onClick={() => setNovo(true)}>+ Novo parceiro</button>}
        </div>
      </div>
      {bloquear && <Modal titulo="Incluir na lista de bloqueio" onFechar={() => setBloquear(false)}><BloquearContato ctx={ctx} onPronto={() => { setBloquear(false); setVersao((v) => v + 1) }} onCancelar={() => setBloquear(false)} /></Modal>}
      <Abas abas={[{ id: 'parceiros', rotulo: 'Parceiros' }, ...(ctx.veContato ? [{ id: 'revisao' as const, rotulo: 'Em revisão' }, { id: 'proposto' as const, rotulo: 'Só nome (fora do oficial)' }] : [])]} ativa={aba} onMudar={setAba} />
      {aba === 'parceiros' ? <Lista key={versao} ctx={ctx} inicial={inicial} papel={papel} /> : <Pendentes ctx={ctx} status={aba} />}
      {novo && <FormParceiro ctx={ctx} parceiro={null} onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); setVersao((v) => v + 1) }} />}
    </section>
  )
}

function Lista({ ctx, inicial, papel }: { ctx: Contexto; inicial?: string; papel?: string }) {
  const [salvo, setF] = useEstadoTela<FiltroParceiro>('parceiros.f', VAZIO, inicial || papel ? { ...VAZIO, busca: inicial ?? '', papel: papel ?? '' } : undefined)
  const f = useMemo<FiltroParceiro>(() => ({ ...VAZIO, ...salvo }), [salvo])
  const [offset, setOffset] = useEstadoTela('parceiros.offset', 0)
  const [det, setDet] = useState<ParceiroLinha | null>(null)
  const { dados, erro, carregando, recarregar } = useCarregar(() => apiParceiros.listar(ctx.empresa, f, offset, LIMITE), [ctx.empresa, f, offset])
  const mudar = <K extends keyof FiltroParceiro>(k: K, v: FiltroParceiro[K]) => { setOffset(0); setF((x) => ({ ...x, [k]: v })) }
  const total = dados?.[0]?.total ?? 0
  return (
    <>
      <p className="sub">{dados ? `${total.toLocaleString('pt-BR')} parceiros no filtro atual` : ' '}</p>
      <div className="filtros" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <Busca valor={f.busca} onMudar={(v) => mudar('busca', v)} placeholder="Buscar por nome, @, WhatsApp, últimos dígitos do CPF/CNPJ ou ID do Bling" />
        <select value={f.papel} onChange={(e) => mudar('papel', e.target.value)} aria-label="Papel">
          <option value="">Papel: todos</option>{Object.entries(FILTRO_PAPEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.tipo} onChange={(e) => mudar('tipo', e.target.value)} aria-label="Tipo de pessoa">
          <option value="">Pessoa: todas</option><option value="F">Física</option><option value="J">Jurídica</option>
        </select>
        <select value={f.ativo} onChange={(e) => mudar('ativo', e.target.value)} aria-label="Situação">
          <option value="">Situação: todas</option><option value="sim">Ativos</option><option value="nao">Inativos</option>
        </select>
        <select value={f.minContatos} onChange={(e) => mudar('minContatos', e.target.value)} aria-label="Contatos Bling">
          <option value="">Contatos Bling: todos</option><option value="2">2 ou mais (repetidos)</option><option value="5">5 ou mais</option><option value="20">20 ou mais</option>
        </select>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={f.soRevisao} onChange={(e) => mudar('soRevisao', e.target.checked)} />Só com conflito</label>
        {JSON.stringify(f) !== JSON.stringify(VAZIO) && <button className="sec" onClick={() => { setOffset(0); setF(VAZIO) }}>Limpar</button>}
      </div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && <Vazio titulo="Nada encontrado" texto="Ajuste a busca ou os filtros." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table className="tabela-fixa" style={{ minWidth: 900 }}>
            <colgroup><col /><col style={{ width: 90 }} /><col style={{ width: '38%' }} /><col style={{ width: 90 }} /><col style={{ width: 80 }} /><col style={{ width: 80 }} /></colgroup>
            <thead><tr><th>Nome</th><th>Pessoa</th><th>Papéis e identificação</th><th className="num">Contatos Bling</th><th>Situação</th><th>Conflito</th></tr></thead>
            <tbody>
              {dados.map((p) => (
                <tr key={p.id} onClick={() => setDet(p)} style={{ cursor: 'pointer' }}>
                  <td title={p.nome}><span className="corta">{nomeLimpo(p.nome)}</span></td>
                  <td>{p.tipo_pessoa === 'F' ? 'Física' : p.tipo_pessoa === 'J' ? 'Jurídica' : '—'}</td>
                  <td><Chips p={{ ...p, ativo: true }} /></td>
                  <td className="num">{p.qtd_contatos_bling}</td>
                  <td>{p.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td>{p.tem_revisao ? <strong>revisar</strong> : <span className="mudo">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
      {det && <Vinculos ctx={ctx} parceiro={det} onFechar={() => setDet(null)} onAlterado={(p) => { if (p) setDet(p); recarregar() }} />}
    </>
  )
}

type AbaModal = 'resumo' | 'contatos' | 'regras' | 'origem' | 'cadastro' | 'notas' | 'documento'
const SIT_CEP: Record<string, string> = {
  padronizado: 'Padronizado pela base dos Correios (pelo CEP)',
  parcial: 'CEP geral do município: município/UF dos Correios; logradouro e bairro como vieram',
  divergente: 'O CEP não confere com a cidade/UF informadas: mantido o endereço original',
  nao_encontrado: 'CEP não encontrado nos Correios: mantido o endereço original',
  sem_consulta: 'CEP ainda não consultado nos Correios: mantido o endereço original',
  cep_invalido: 'CEP ausente ou inválido: mantido o endereço original',
}
const ORIGEM_END: Record<string, string> = { correios: 'Correios', xml: 'XML', manual: 'Manual' }
const fmtCep = (c: string | null) => (c && c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c)
const fmtFone = (t: string | null) => {
  if (!t) return null
  if (t.length === 11) return t.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (t.length === 10) return t.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return t
}
const CRT: Record<string, string> = { '1': 'Simples Nacional', '2': 'Simples Nacional (excesso de sublimite)', '3': 'Regime normal', '4': 'MEI' }
type ModoContato = 'todos' | 'recente' | 'completo'

// pedido 048: VIP (acumula peças e paga no fim do dia ou da live, com limites) e lista de bloqueio
function RegrasParceiro({ ctx, parceiro, onAlterado }: { ctx: Contexto; parceiro: ParceiroLinha; onAlterado: () => void }) {
  const podeEditar = ctx.papeis.some((p) => ['superadmin', 'admin', 'gestor'].includes(p))
  const podeFechar = podeEditar || ctx.papeis.some((p) => ['suporte', 'financeiro'].includes(p))
  const ehAdmin = ctx.papeis.some((p) => ['superadmin', 'admin'].includes(p))
  const { dados: r, erro, recarregar } = useCarregar(() => apiRegras.obter(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const [f, setF] = useState<Partial<RegraParceiro> | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [fechar, setFechar] = useState(false)
  const [anon, setAnon] = useState(false)
  if (erro) return <div className="erro">{erro}</div>
  if (!r) return <p className="mudo">Carregando…</p>
  const v = f ?? r
  const set = (d: Partial<RegraParceiro>) => setF({ ...v, ...d })
  async function salvar() {
    setMsg(null)
    try { await apiRegras.salvar(ctx.empresa, parceiro.id, v); setF(null); recarregar(); onAlterado(); setMsg({ ok: true, t: 'Regras salvas.' }) }
    catch (e) { setMsg({ ok: false, t: (e as Error).message }) }
  }
  return (
    <div className="form">
      <fieldset disabled={!podeEditar} className="regras">
        <label className="check"><input type="checkbox" checked={v.vip} onChange={(e) => set({ vip: e.target.checked, bloqueado: e.target.checked ? false : v.bloqueado })} /> <strong>Cliente VIP</strong>: pode reservar várias peças e pagar tudo junto depois</label>
        {v.vip && <div className="grade-2">
          <Campo rotulo="Máximo de peças em aberto" dica="Links diferentes que podem esperar o pagamento. Em branco: sem limite."><input inputMode="numeric" value={v.vip_max_pecas ?? ''} onChange={(e) => set({ vip_max_pecas: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></Campo>
          <Campo rotulo="Valor máximo em aberto (R$)" dica="Soma das peças acumuladas. Em branco: sem limite."><input inputMode="decimal" value={v.vip_max_valor ?? ''} onChange={(e) => set({ vip_max_valor: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} /></Campo>
          <Campo rotulo="Paga até"><select value={v.vip_prazo} onChange={(e) => set({ vip_prazo: e.target.value as RegraParceiro['vip_prazo'] })}><option value="fim_do_dia">o fim do dia</option><option value="fim_da_live">o fim da live</option></select></Campo>
          {v.vip_prazo === 'fim_da_live' && <Campo rotulo="Horas de tolerância após a live"><input inputMode="numeric" value={v.vip_horas_pos_live} onChange={(e) => set({ vip_horas_pos_live: Number(e.target.value.replace(/\D/g, '') || 0) })} /></Campo>}
          <Campo rotulo="Observação"><input value={v.vip_obs ?? ''} onChange={(e) => set({ vip_obs: e.target.value })} /></Campo>
        </div>}
        <p className="mudo pequeno">Passou do limite? A peça seguinte volta à regra normal: paga na hora, dentro do prazo da reserva.</p>
        <hr />
        <label className="check"><input type="checkbox" checked={v.bloqueado} onChange={(e) => set({ bloqueado: e.target.checked, vip: e.target.checked ? false : v.vip })} /> <strong>Lista de bloqueio</strong>: ignorar na live, na vitrine e nas mensagens</label>
        {v.bloqueado && <Campo rotulo="Motivo (obrigatório)"><input value={v.bloqueio_motivo ?? ''} onChange={(e) => set({ bloqueio_motivo: e.target.value })} placeholder="Ex.: reservou 5 vezes e nunca pagou" /></Campo>}
        {r.bloqueado && <p className="mudo pequeno">Bloqueado em {data(r.bloqueado_em ?? "")}{r.bloqueado_por ? ` por ${r.bloqueado_por}` : ''}. Vale para todos os @ e WhatsApp deste parceiro.</p>}
        <p className="mudo pequeno">Tentativas ignoradas: {r.tentativas.total} no total, {r.tentativas.d30} nos últimos 30 dias{r.tentativas.ultima ? ` (última em ${data(r.tentativas.ultima)})` : ''}.</p>
      </fieldset>
      {msg && <div className={msg.ok ? 'aviso-caixa ok' : 'erro'} role="status">{msg.t}</div>}
      {podeEditar && <div className="acoes"><button type="button" disabled={!f} onClick={salvar}>Salvar regras</button></div>}

      {(r.vip || r.acumulado.pecas > 0) && <div className="aviso-caixa">
        <strong>Acumulado em aberto:</strong> {r.acumulado.pecas} peça(s), {brl(r.acumulado.valor)}{r.acumulado.vence_em ? ` · vence ${data(r.acumulado.vence_em)}` : ''}
        {podeFechar && r.acumulado.pecas > 0 && <div className="acoes"><button type="button" onClick={() => setFechar(true)}>Fechar acumulado</button></div>}
      </div>}
      {ehAdmin && <div className="acoes"><button type="button" className="sec perigo" onClick={() => setAnon(true)}>Anonimizar (pedido do titular, LGPD)</button></div>}

      {fechar && <Modal titulo="Fechar acumulado" onFechar={() => setFechar(false)}><FecharAcumulado ctx={ctx} parceiro={parceiro.id} onPronto={() => { setFechar(false); recarregar() }} onCancelar={() => setFechar(false)} /></Modal>}
      {anon && <Modal titulo="Anonimizar parceiro" onFechar={() => setAnon(false)}><AnonimizarParceiro ctx={ctx} parceiro={parceiro.id} onPronto={() => { setAnon(false); onAlterado() }} onCancelar={() => setAnon(false)} /></Modal>}
    </div>
  )
}

function BloquearContato({ ctx, onPronto, onCancelar }: { ctx: Contexto; onPronto: () => void; onCancelar: () => void }) {
  const [contato, setContato] = useState('')
  const [motivo, setMotivo] = useState('')
  return (
    <Formulario enviarRotulo="Bloquear" onCancelar={onCancelar} onEnviar={async () => { await apiRegras.bloquearContato(ctx.empresa, contato, motivo); onPronto() }}>
      <p className="mudo">A pessoa deixa de entrar na fila da live, da vitrine e das conversas. As tentativas continuam contadas na Caixa de entrada.</p>
      <Campo rotulo="@ do Instagram ou WhatsApp com DDD"><input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="@perfil ou (34) 99999-0000" autoFocus /></Campo>
      <Campo rotulo="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: reserva e não paga, tumultua a live" /></Campo>
    </Formulario>
  )
}

function FecharAcumulado({ ctx, parceiro, onPronto, onCancelar }: { ctx: Contexto; parceiro: string; onPronto: () => void; onCancelar: () => void }) {
  const [jaPago, setJaPago] = useState(false)
  const [metodo, setMetodo] = useState('pix')
  const [motivo, setMotivo] = useState('')
  const [res, setRes] = useState<string | null>(null)
  if (res) return <div className="form"><div className="aviso-caixa ok">{res}</div><div className="acoes"><button onClick={onPronto}>Fechar</button></div></div>
  return (
    <Formulario enviarRotulo={jaPago ? 'Registrar pagamento' : 'Gerar cobrança única'} onCancelar={onCancelar} onEnviar={async () => {
      const r = await apiRegras.fecharAcumulado(ctx.empresa, parceiro, jaPago ? metodo : null, jaPago ? motivo : null)
      setRes(`${r.pecas} peça(s) numa cobrança de ${brl(r.valor)}. ${jaPago ? 'Pagamento registrado.' : 'A cobrança ficou aberta para a cliente pagar.'}`)
    }}>
      <p className="mudo">Junta todas as peças acumuladas numa cobrança só.</p>
      <label className="check"><input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} /> A cliente já pagou (fora do link)</label>
      {jaPago && <>
        <Campo rotulo="Forma"><select value={metodo} onChange={(e) => setMetodo(e.target.value)}><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="manual">Dinheiro/manual</option><option value="outro">Outro</option></select></Campo>
        <Campo rotulo="Como foi conferido"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Pix conferido no extrato às 22h" /></Campo>
      </>}
    </Formulario>
  )
}

function AnonimizarParceiro({ ctx, parceiro, onPronto, onCancelar }: { ctx: Contexto; parceiro: string; onPronto: () => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [certeza, setCerteza] = useState(false)
  return (
    <Formulario enviarRotulo="Anonimizar" onCancelar={onCancelar} onEnviar={async () => {
      if (!certeza) throw new Error('Marque a confirmação.')
      await apiRegras.anonimizar(ctx.empresa, parceiro, motivo); onPronto()
    }}>
      <p>Apaga nome, contatos, documentos e endereços deste parceiro. Vendas e notas ficam, sem os dados pessoais. <strong>Não dá para desfazer.</strong></p>
      <Campo rotulo="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: pedido do titular por e-mail em 26/11" /></Campo>
      <label className="check"><input type="checkbox" checked={certeza} onChange={(e) => setCerteza(e.target.checked)} /> Entendo que isso não pode ser desfeito</label>
    </Formulario>
  )
}

function Vinculos({ ctx, parceiro, onFechar, onAlterado }: { ctx: Contexto; parceiro: ParceiroLinha; onFechar: () => void; onAlterado: (p?: ParceiroLinha) => void }) {
  const veCadastro = ctx.veContato || ctx.veFinanceiro || ctx.veRentabilidade
  const [aba, setAba] = useState<AbaModal>('resumo')
  const [editar, setEditar] = useState(false)
  const [versao, setVersao] = useState(0)
  const alterou = (p?: ParceiroLinha) => { setVersao((v) => v + 1); onAlterado(p) }
  const abas = [
    { id: 'resumo' as const, rotulo: 'Resumo' },
    { id: 'contatos' as const, rotulo: 'Contatos' },
    { id: 'regras' as const, rotulo: 'Regras (VIP e bloqueio)' },
    ...(veCadastro ? [{ id: 'cadastro' as const, rotulo: 'Cadastro fiscal' }] : []),
    ...(ctx.veFinanceiro ? [{ id: 'notas' as const, rotulo: 'Notas' }] : []),
    { id: 'origem' as const, rotulo: 'Origem Bling', contagem: parceiro.qtd_contatos_bling },
    ...(ctx.veContato ? [{ id: 'documento' as const, rotulo: 'Documento e Receita' }] : []),
  ]
  return (
    <Modal titulo={nomeLimpo(parceiro.nome)} onFechar={onFechar} larga>
      <div className="parceiro-cabecalho">
        <Chips p={parceiro} />
        <span className="mudo">· criado em {data(parceiro.criado_em)}</span>
        {ctx.veContato && <button className="sec" onClick={() => setEditar(true)}>Editar</button>}
      </div>
      {nomeLimpo(parceiro.nome) !== parceiro.nome && <p className="sub" style={{ margin: '-4px 0 6px' }} title="Como o nome está gravado">Nome gravado: {parceiro.nome}</p>}
      <Abas abas={abas} ativa={aba} onMudar={setAba} />
      {aba === 'resumo' ? <ResumoParceiroAba key={versao} ctx={ctx} parceiro={parceiro} onIr={setAba} onAlterado={() => alterou()} />
        : aba === 'contatos' ? <ContatosCadastro key={versao} ctx={ctx} parceiro={parceiro} onAlterado={() => alterou()} />
        : aba === 'regras' ? <RegrasParceiro key={versao} ctx={ctx} parceiro={parceiro} onAlterado={() => alterou()} />
        : aba === 'origem' ? <OrigemBling ctx={ctx} parceiro={parceiro} />
        : aba === 'cadastro' ? <CadastroParceiro ctx={ctx} parceiro={parceiro} />
        : aba === 'notas' ? <NotasParceiro ctx={ctx} parceiro={parceiro} />
        : <DocumentoReceita ctx={ctx} parceiro={parceiro} />}
      {editar && <FormParceiro ctx={ctx} parceiro={parceiro} onFechar={() => setEditar(false)}
        onSalvo={(d) => { setEditar(false); alterou({ ...parceiro, nome: d.nome, ativo: d.ativo ?? parceiro.ativo, papeis: d.papeis, tipo_pessoa: d.tipo_pessoa ?? parceiro.tipo_pessoa }) }} />}
    </Modal>
  )
}

function ResumoParceiroAba({ ctx, parceiro, onIr, onAlterado }: { ctx: Contexto; parceiro: ParceiroLinha; onIr: (a: AbaModal) => void; onAlterado: () => void }) {
  const { dados: r, erro } = useCarregar(() => apiParceiros.resumo(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const ends = useCarregar(() => apiParceiros.enderecos(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const [juntar, setJuntar] = useState(false)
  const Item = ({ t, v, s, ir }: { t: string; v: string | number; s?: string; ir?: AbaModal }) => (
    <div className={ir ? 'clicavel' : undefined} onClick={ir ? () => onIr(ir) : undefined}><small>{t}</small><strong>{v}</strong>{s && <small className="mudo">{s}</small>}</div>
  )
  if (erro) return <div className="erro">{erro}</div>
  if (!r) return <p className="sub">Carregando…</p>
  const c = r.cliente
  const ehCliente = r.papeis.includes('cliente') || c.perfis > 0
  return (
    <>
      {r.pre_cadastro && (
        <div className="aviso-caixa">
          <strong>Pré-cadastro (sem CPF/CNPJ).</strong> Nasceu pelo {r.origem === 'instagram' ? 'Instagram' : r.origem === 'whatsapp' ? 'WhatsApp' : r.origem === 'vitrine' ? 'site' : 'cadastro'}.
          Vira cadastro completo quando a pessoa informa o CPF no link de pagamento. Se o CPF já for de outro parceiro, os contatos passam para ele quando o pagamento for aprovado.
          {ctx.veContato && <> <button className="link" onClick={() => setJuntar(true)}>Juntar a outro parceiro…</button></>}
        </div>
      )}
      <div className={r.pronto_nfe ? 'aviso-caixa ok' : 'aviso-caixa'}>
        {r.pronto_nfe ? <strong>Pronto para emitir NF-e.</strong> : <><strong>Para emitir NF-e falta:</strong> {r.faltas_nfe.join(', ')}.</>}
      </div>
      <div className="resumo-notas" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Item t="Papéis" v={r.papeis.map((x) => PAPEIS[x] ?? x).join(', ') || '—'} />
        <Item t="Documento" v={r.documentos.join(' · ') || 'Sem CPF/CNPJ'} />
        <Item t="Instagram" v={r.contatos.instagram} s={r.contatos.arrobas.slice(0, 3).join(' ') + (r.contatos.arrobas.length > 3 ? ` +${r.contatos.arrobas.length - 3}` : '')} ir="contatos" />
        <Item t="WhatsApp / e-mail" v={`${r.contatos.whatsapp} / ${r.contatos.email}`} ir="contatos" />
        <Item t="Contatos no Bling" v={r.bling.contatos} s={r.bling.contatos ? `${r.bling.ativos} ativos` : 'nenhum'} ir="origem" />
        {ctx.veFinanceiro && <Item t="Notas de venda (Bling)" v={r.notas.qtd} s={r.notas.qtd ? `${brl(r.notas.valor)} · última ${r.notas.ultima ? data(r.notas.ultima) : '—'}` : undefined} ir="notas" />}
        {ctx.veFinanceiro && <Item t="Contas a receber / pagar" v={`${r.receber.qtd} / ${r.pagar.qtd}`} s="lançamentos no Bling" />}
        {(r.papeis.includes('fornecedor') || r.compras.qtd > 0) && <Item t="Compras (NF-e de entrada)" v={r.compras.qtd} s={r.compras.ultima ? `última ${data(r.compras.ultima)}` : undefined} ir={ctx.veFinanceiro ? 'notas' : undefined} />}
      </div>
      {ehCliente && (
        <>
          <p className="sub" style={{ margin: '10px 0 4px' }}><strong>Como cliente</strong></p>
          <div className="resumo-notas" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Item t="Reservas ativas" v={c.reservas_ativas} />
            <Item t="Na fila" v={c.na_fila} />
            <Item t="Reservas pagas" v={c.reservas_pagas} />
            <Item t="Expiradas sem pagar" v={c.reservas_expiradas} />
            <Item t="Cancelamentos / devoluções" v={`${c.cancelamentos} / ${c.devolucoes}`} />
            <Item t="Pagou para outra pessoa" v={c.pagou_para_terceiros} s="CPF dela em compra de outro @" />
          </div>
          {c.bloqueado_ate && new Date(c.bloqueado_ate) > new Date() && <p className="erro" style={{ marginTop: 6 }}>Bloqueada para reservas até {data(c.bloqueado_ate)}.</p>}
        </>
      )}
      {(ends.dados ?? []).length > 0 && (
        <>
          <p className="sub" style={{ margin: '10px 0 4px' }}><strong>Endereços</strong> <span className="mudo">(vindos do link de pagamento e do cadastro; o primeiro é o principal)</span></p>
          <ul className="lista-enderecos">
            {(ends.dados ?? []).map((e) => (
              <li key={e.id}>
                {e.principal && <span className="selo selo-disponivel">Principal</span>}{' '}
                <span>{[[e.logradouro, e.numero].join(', '), e.complemento, e.bairro, `${e.municipio}/${e.uf}`, `CEP ${e.cep.length === 8 ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : e.cep}`].filter(Boolean).join(' · ')}</span>{' '}
                <span className={e.cep_situacao === 'padronizado' || e.cep_situacao === 'parcial' ? 'selo selo-disponivel' : 'selo'} title={SIT_CEP[e.cep_situacao ?? ''] ?? undefined}>{e.cep_situacao === 'padronizado' || e.cep_situacao === 'parcial' ? 'Correios' : e.cep_situacao === 'sem_consulta' ? 'conferindo CEP' : 'conferir'}</span>
                {e.ultimo_uso_em && <small className="mudo"> · usado em {data(e.ultimo_uso_em)}</small>}
              </li>
            ))}
          </ul>
        </>
      )}
      {r.observacao && <p className="sub" style={{ marginTop: 8 }}>Observação: {r.observacao}</p>}
      {juntar && <EscolherParceiro ctx={ctx} titulo="Juntar este pré-cadastro a outro parceiro" ignorar={parceiro.id}
        explicacao="Os contatos (@, WhatsApp), os perfis de cliente e os vínculos do Bling passam para o parceiro escolhido. Este pré-cadastro fica inativo, com registro no histórico."
        onFechar={() => setJuntar(false)}
        onEscolher={async (destino, motivo) => { await apiParceiros.absorver(ctx.empresa, parceiro.id, destino.id, motivo); setJuntar(false); onAlterado() }} />}
    </>
  )
}

function ContatosCadastro({ ctx, parceiro, onAlterado }: { ctx: Contexto; parceiro: ParceiroLinha; onAlterado: () => void }) {
  const { dados, erro, recarregar } = useCarregar(() => apiParceiros.contatosCadastro(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const [verInativos, setVerInativos] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [novo, setNovo] = useState({ tipo: 'instagram', valor: '', vinculo: 'nao_informado' })
  const [mover, setMover] = useState<ContatoCadastro | null>(null)
  const todos = dados ?? []
  const inativos = todos.filter((k) => k.situacao === 'inativo').length
  const lista = verInativos ? todos : todos.filter((k) => k.situacao !== 'inativo')
  async function salvar(d: Parameters<typeof apiParceiros.salvarContato>[2]) {
    setOcupado(true); setFalha(null)
    try { await apiParceiros.salvarContato(ctx.empresa, parceiro.id, d); recarregar(); onAlterado() }
    catch (e) { setFalha((e as Error).message) } finally { setOcupado(false) }
  }
  const mostrar = (k: ContatoCadastro) => k.tipo === 'instagram' ? (k.valor ? `@${k.valor}` : 'conta sem @ (só pelo Direct)')
    : k.tipo === 'whatsapp' || k.tipo === 'telefone' ? (k.valor ?? '').replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : k.valor
  return (
    <>
      <p className="sub">Cada @ do Instagram, WhatsApp e e-mail ligado a este cadastro. Uma filha que compra pelo próprio @ com o CPF da mãe aparece aqui como contato <em>familiar</em> da mãe. Um contato pertence a um só parceiro por vez; para trocar, use “Mover”.</p>
      {erro && <div className="erro">{erro}</div>}
      {falha && <div className="erro" role="alert">{falha}</div>}
      {!dados && !erro && <p className="sub">Carregando…</p>}
      {dados && (
        <>
          <div className="filtros-contato">
            <span className="mudo">{lista.length} contato(s){inativos > 0 && !verInativos ? ` · ${inativos} inativo(s) oculto(s)` : ''}</span>
            {inativos > 0 && <button className="link" onClick={() => setVerInativos((v) => !v)}>{verInativos ? 'Ocultar inativos' : 'Mostrar inativos'}</button>}
          </div>
          {lista.length === 0 ? <Vazio titulo="Sem contatos" texto="Nenhum @, WhatsApp ou e-mail ligado a este parceiro ainda." /> : (
            <div className="tabela-rolavel">
              <table className="tabela-fixa" style={{ minWidth: 1100 }}>
                <colgroup><col style={{ width: 95 }} /><col style={{ width: 260 }} /><col style={{ width: 140 }} /><col style={{ width: 110 }} /><col style={{ width: 120 }} /><col style={{ width: 100 }} />{ctx.veContato && <col style={{ width: 250 }} />}</colgroup>
                <thead><tr><th>Tipo</th><th>Contato</th><th>Vínculo</th><th>Situação</th><th>Origem</th><th>Último uso</th>{ctx.veContato && <th />}</tr></thead>
                <tbody>
                  {lista.map((k) => (
                    <tr key={k.id} className={k.situacao === 'inativo' ? 'linha-inativa' : undefined}>
                      <td>{TIPO_CONTATO[k.tipo] ?? k.tipo}</td>
                      <td title={k.valor ?? undefined}><span className="corta">{mostrar(k)}</span>{k.principal && <> <span className="selo selo-disponivel">Principal</span></>}{k.perfis_cliente > 0 && <> <span className="selo" title="Tem perfil de cliente (live, fila, reservas)">cliente</span></>}</td>
                      <td>{ctx.veContato && k.situacao !== 'inativo'
                        ? <select value={k.vinculo} disabled={ocupado} onChange={(e) => void salvar({ id: k.id, vinculo: e.target.value, situacao: k.situacao, principal: k.principal })}>
                            {Object.entries(VINCULO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                          </select>
                        : VINCULO[k.vinculo]}</td>
                      <td><span className={k.situacao === 'confirmado' ? 'selo selo-disponivel' : k.situacao === 'pendente' ? 'selo selo-reservada' : 'selo selo-baixada'}>{SIT_CONTATO[k.situacao]}</span></td>
                      <td>{ORIGEM_CONTATO[k.origem] ?? k.origem}</td>
                      <td>{k.ultimo_uso_em ? data(k.ultimo_uso_em) : '—'}</td>
                      {ctx.veContato && (
                        <td className="acoes-linha">
                          {k.situacao !== 'inativo' && !k.principal && <button className="sec" disabled={ocupado} onClick={() => void salvar({ id: k.id, vinculo: k.vinculo, situacao: k.situacao, principal: true })}>Principal</button>}
                          {k.situacao === 'inativo'
                            ? <button className="sec" disabled={ocupado} onClick={() => void salvar({ id: k.id, vinculo: k.vinculo, situacao: 'confirmado' })}>Reativar</button>
                            : <button className="sec" disabled={ocupado} onClick={() => void salvar({ id: k.id, vinculo: k.vinculo, situacao: 'inativo' })}>Inativar</button>}
                          <button className="sec" disabled={ocupado} onClick={() => setMover(k)}>Mover…</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ctx.veContato && (
            <div className="form-contato">
              <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })} aria-label="Tipo do contato">
                {Object.entries(TIPO_CONTATO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <input value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })}
                placeholder={novo.tipo === 'instagram' ? '@usuario' : novo.tipo === 'email' ? 'nome@exemplo.com' : '(34) 99999-0000'} />
              <select value={novo.vinculo} onChange={(e) => setNovo({ ...novo, vinculo: e.target.value })} aria-label="Vínculo">
                {Object.entries(VINCULO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <button disabled={ocupado || !novo.valor.trim()} onClick={() => void salvar({ tipo: novo.tipo, valor: novo.valor, vinculo: novo.vinculo }).then(() => setNovo({ ...novo, valor: '' }))}>Adicionar contato</button>
            </div>
          )}
        </>
      )}
      {mover && <EscolherParceiro ctx={ctx} titulo={`Mover ${mostrar(mover)} para outro parceiro`} ignorar={parceiro.id}
        explicacao="O contato e o perfil de cliente da mesma conta passam para o parceiro escolhido. Fica registrado quem moveu, quando e por quê."
        onFechar={() => setMover(null)}
        onEscolher={async (destino, motivo) => { await apiParceiros.moverContato(ctx.empresa, mover.id, destino.id, motivo); setMover(null); recarregar(); onAlterado() }} />}
    </>
  )
}

function EscolherParceiro({ ctx, titulo, explicacao, ignorar, onFechar, onEscolher }: {
  ctx: Contexto; titulo: string; explicacao: string; ignorar: string; onFechar: () => void; onEscolher: (p: ParceiroLinha, motivo: string) => Promise<void>
}) {
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<ParceiroLinha | null>(null)
  const [motivo, setMotivo] = useState('')
  const { dados } = useCarregar(() => busca.trim().length < 2 ? Promise.resolve([] as ParceiroLinha[]) : apiParceiros.listar(ctx.empresa, { ...VAZIO, busca }, 0, 8), [ctx.empresa, busca])
  const lista = (dados ?? []).filter((p) => p.id !== ignorar)
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <Formulario enviarRotulo="Confirmar" onCancelar={onFechar} onEnviar={async () => {
        if (!sel) throw new Error('Escolha o parceiro de destino')
        if (!motivo.trim()) throw new Error('Informe o motivo')
        await onEscolher(sel, motivo.trim())
      }}>
        <p className="sub">{explicacao}</p>
        <Campo rotulo="Parceiro de destino" dica="Busque por nome, @ ou últimos dígitos do CPF/CNPJ.">
          <Busca valor={busca} onMudar={(v) => { setBusca(v); setSel(null) }} placeholder="Buscar parceiro" />
        </Campo>
        {lista.length > 0 && (
          <div className="lista-escolha">
            {lista.map((p) => (
              <button type="button" key={p.id} className={sel?.id === p.id ? 'item sel' : 'item'} onClick={() => setSel(p)}>
                <strong>{nomeLimpo(p.nome)}</strong> <span className="mudo">{(p.identificadores ?? []).slice(0, 3).join(' · ')}</span>
              </button>
            ))}
          </div>
        )}
        <Campo rotulo="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: filha compra com o CPF da mãe" /></Campo>
      </Formulario>
    </Modal>
  )
}

function FormParceiro({ ctx, parceiro, onFechar, onSalvo }: { ctx: Contexto; parceiro: ParceiroLinha | null; onFechar: () => void; onSalvo: (d: ParceiroEntrada) => void }) {
  const semDoc = !parceiro || !temDocumento(parceiro.identificadores)
  const [v, setV] = useState({
    nome: parceiro ? nomeLimpo(parceiro.nome) : '', tipo_pessoa: parceiro?.tipo_pessoa ?? 'F', papeis: parceiro?.papeis ?? ['cliente'],
    documento: '', instagram: '', whatsapp: '', observacao: '', ativo: parceiro?.ativo ?? true,
  })
  const doc = classificar(v.documento)
  const alternar = (p: string) => setV((x) => ({ ...x, papeis: x.papeis.includes(p) ? x.papeis.filter((y) => y !== p) : [...x.papeis, p] }))
  return (
    <Modal titulo={parceiro ? 'Editar parceiro' : 'Novo parceiro'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        if (v.papeis.length === 0) throw new Error('Escolha ao menos um papel')
        const d: ParceiroEntrada = { id: parceiro?.id, nome: v.nome, tipo_pessoa: v.tipo_pessoa, papeis: v.papeis,
          ...(v.documento.trim() ? { documento: v.documento } : {}), ...(v.instagram.trim() ? { instagram: v.instagram } : {}),
          ...(v.whatsapp.trim() ? { whatsapp: v.whatsapp } : {}), ...(v.observacao.trim() ? { observacao: v.observacao } : {}), ...(parceiro ? { ativo: v.ativo } : {}) }
        await apiParceiros.salvar(ctx.empresa, d)
        onSalvo(d)
      }}>
        <Campo rotulo="Nome civil ou razão social" dica="Sem @ e sem “INATIVO”: o @ vai em Contatos e a situação no campo próprio."><input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} autoFocus /></Campo>
        <Campo rotulo="Papéis" dica="O mesmo parceiro pode ter vários papéis.">
          <div className="chips">
            {Object.entries(PAPEIS).map(([k, t]) => <button type="button" key={k} className={v.papeis.includes(k) ? 'chip sel' : 'chip'} onClick={() => alternar(k)}>{t}</button>)}
          </div>
        </Campo>
        <div className="grade2">
          <Campo rotulo="Pessoa"><select value={v.tipo_pessoa} onChange={(e) => setV({ ...v, tipo_pessoa: e.target.value })}><option value="F">Física</option><option value="J">Jurídica</option><option value="E">Estrangeira</option></select></Campo>
          {semDoc
            ? <Campo rotulo="CPF/CNPJ" dica={doc.mensagem ?? 'Opcional. Fica guardado só como código e os 4 últimos dígitos.'}><input value={v.documento} onChange={(e) => setV({ ...v, documento: e.target.value })} inputMode="numeric" /></Campo>
            : <Campo rotulo="CPF/CNPJ" dica="Para trocar o documento, fale com o gestor."><input value={documentos(parceiro!.identificadores).join(' · ')} disabled /></Campo>}
        </div>
        {!parceiro && (
          <div className="grade2">
            <Campo rotulo="@ do Instagram"><input value={v.instagram} onChange={(e) => setV({ ...v, instagram: e.target.value })} placeholder="@usuario" /></Campo>
            <Campo rotulo="WhatsApp"><input value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} inputMode="tel" placeholder="(34) 99999-0000" /></Campo>
          </div>
        )}
        <Campo rotulo="Observação interna" dica="Visível só para a equipe. Evite dados sensíveis."><textarea value={v.observacao} onChange={(e) => setV({ ...v, observacao: e.target.value })} rows={2} /></Campo>
        {parceiro && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.target.checked })} />Ativo</label>}
      </Formulario>
    </Modal>
  )
}

function OrigemBling({ ctx, parceiro }: { ctx: Contexto; parceiro: ParceiroLinha }) {
  const { dados, erro, recarregar } = useCarregar(() => apiParceiros.contatos(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const [ocultarManual, setOcultarManual] = useState<boolean | null>(null)
  const [modo, setModo] = useState<ModoContato>('todos')
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const todos = dados ?? []
  const temAtivo = todos.some((c) => !c.inativo)
  // Padrão: com vários contatos e ao menos um ativo, esconde os inativos. O usuário pode mudar.
  const ocultar = ocultarManual ?? (todos.length > 1 && temAtivo)
  let lista = ocultar ? todos.filter((c) => !c.inativo) : todos
  if (modo === 'recente') lista = lista.filter((c) => c.mais_recente)
  if (modo === 'completo') lista = lista.filter((c) => c.mais_completo)
  const legado = todos.some((c) => c.legado)
  const nInativos = todos.filter((c) => c.inativo).length
  const nAtivos = todos.length - nInativos

  async function principal(blingId: number | null) {
    setSalvando(true); setFalha(null)
    try { await apiParceiros.definirPrincipal(ctx.empresa, parceiro.id, blingId); recarregar() }
    catch (e) { setFalha((e as Error).message) } finally { setSalvando(false) }
  }

  return (
    <>
      <p className="sub">Espelho dos contatos do Bling que este parceiro representa (só leitura, para auditoria). O cadastro oficial fica nas abas Resumo, Contatos e Cadastro fiscal.</p>
      {erro && <div className="erro">{erro}</div>}
      {falha && <div className="erro" role="alert">{falha}</div>}
      {!dados && !erro && <p className="sub">Carregando…</p>}
      {dados && (
        <>
          <div className="filtros-contato">
            <label><input type="checkbox" checked={ocultar} onChange={(e) => setOcultarManual(e.target.checked)} />Ocultar inativos</label>
            <div className="chips" role="group" aria-label="Quais contatos mostrar">
              {([['todos', 'Todos'], ['recente', 'Só o mais recente'], ['completo', 'Só o mais completo']] as [ModoContato, string][]).map(([k, r]) => (
                <button key={k} type="button" className={modo === k ? 'chip sel' : 'chip'} onClick={() => setModo(k)}>{r}</button>
              ))}
            </div>
            <span className="mudo">{nAtivos} ativo(s){nInativos > 0 ? (ocultar ? ` · ${nInativos} inativo(s) oculto(s)` : ` · ${nInativos} inativo(s)`) : ''}{modo !== 'todos' ? ` · mostrando ${lista.length}` : ''}</span>
            <span className="ajuda-i" title={'“Mais recente” = maior ID no Bling (o Bling não informa a data de alteração).\n“Mais completo” = pontos por CPF/CNPJ válido, @, telefone, detalhe lido e contato ativo (máx. 5).'}>ⓘ</span>
          </div>
          {legado && <p className="sub">Recursos de principal e notas por contato ficam disponíveis após aplicar a migration 0024.</p>}
          {lista.length === 0 ? <Vazio titulo="Nenhum contato com esses filtros" texto="Desmarque “Ocultar inativos” ou escolha “Todos”." /> : (
            <div className="tabela-rolavel" style={{ maxHeight: '55vh' }}>
              <table className="tabela-fixa" style={{ minWidth: 1380 }}>
                <colgroup>
                  <col style={{ width: 120 }} /><col style={{ width: 320 }} /><col style={{ width: 150 }} /><col style={{ width: 95 }} /><col style={{ width: 170 }} />
                  {ctx.veContato && <col style={{ width: 140 }} />}<col style={{ width: 64 }} />{ctx.veFinanceiro && <col style={{ width: 60 }} />}
                  <col style={{ width: 125 }} /><col style={{ width: 95 }} />{ctx.veContato && !legado && <col style={{ width: 150 }} />}
                </colgroup>
                <thead><tr><th>ID Bling</th><th>Nome no Bling (cru)</th><th>Marcas</th><th>Doc.</th><th>@</th>{ctx.veContato && <th>Telefone</th>}<th className="num">Compl.</th>{ctx.veFinanceiro && <th className="num">Notas</th>}<th>Critério</th><th>Status</th>{ctx.veContato && !legado && <th />}</tr></thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.bling_id} className={c.inativo ? 'linha-inativa' : undefined}>
                      <td className="mono">{c.bling_id}</td>
                      <td title={c.nome_cru ?? undefined}><span className="corta">{c.nome_cru}</span></td>
                      <td className="marcas">
                        {c.principal && <span className="selo selo-disponivel">Principal</span>}
                        {c.mais_recente && <span className="selo">Mais recente</span>}
                        {c.mais_completo && <span className="selo">Mais completo</span>}
                        {c.inativo && <span className="selo selo-baixada">{SIT[c.situacao ?? ''] ?? 'Inativo'}</span>}
                      </td>
                      <td>{c.documento_ultimos ? `***${c.documento_ultimos}${c.documento_valido === false ? ' (inválido)' : ''}` : '—'}</td>
                      <td title={c.handle_social ? `@${c.handle_social}` : undefined}><span className="corta">{c.handle_social ? `@${c.handle_social}` : '—'}</span></td>
                      {ctx.veContato && <td className="nowrap">{c.telefone ?? '—'}</td>}
                      <td className="num">{c.completude}/5</td>
                      {ctx.veFinanceiro && <td className="num">{c.qtd_notas ?? '—'}</td>}
                      <td><span className="corta">{CRITERIO[c.criterio] ?? c.criterio}</span></td>
                      <td title={c.motivo ?? undefined}>{STATUS[c.status] ?? c.status}</td>
                      {ctx.veContato && !legado && (
                        <td>{c.status === 'vinculado' && (c.principal
                          ? <button className="sec" disabled={salvando} onClick={() => principal(null)}>Remover principal</button>
                          : <button className="sec" disabled={salvando} onClick={() => principal(c.bling_id)}>Definir principal</button>)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}

function CadastroParceiro({ ctx, parceiro }: { ctx: Contexto; parceiro: ParceiroLinha }) {
  const { dados, erro, carregando, recarregar } = useCarregar(() => apiParceiros.dados(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const seletor = useRef<HTMLInputElement>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const d: DadosParceiro | null = dados
  async function porXml(arq: File | undefined) {
    if (!arq) return
    setOcupado(true); setFalha(null); setAviso(null)
    try {
      const em = (await lerNfe(await arq.text())).emitente
      const r = await apiParceiros.salvarDados(ctx.empresa, parceiro.id, { documento: em.documento, razao_social: em.razao_social, nome_fantasia: em.nome_fantasia, ie: em.ie, im: em.im, cnae: em.cnae, crt: em.crt, telefone: em.telefone, email: em.email, origem: 'xml', endereco: em.endereco })
      setAviso(r.endereco_mantido ? 'Dados atualizados. O endereço foi mantido porque foi digitado manualmente.' : `Dados atualizados a partir do XML. ${SIT_CEP[r.situacao] ?? ''}.`)
      recarregar()
    } catch (e) { setFalha((e as Error).message) } finally { setOcupado(false) }
  }
  async function reconsultar() {
    setOcupado(true); setFalha(null); setAviso(null)
    try { const r = await apiParceiros.reaplicarEndereco(ctx.empresa, parceiro.id, d?.cep ?? null); setAviso(`${SIT_CEP[r.situacao] ?? r.situacao}.`); recarregar() }
    catch (e) { setFalha((e as Error).message) } finally { setOcupado(false) }
  }
  const doc = d?.documento ? classificar(d.documento).formatado : null
  const end = d && (d.logradouro || d.cep) ? [[d.logradouro, d.numero].filter(Boolean).join(', '), d.complemento, d.bairro, d.municipio && `${d.municipio}/${d.uf ?? ''}`, fmtCep(d.cep)].filter(Boolean).join(' · ') : null
  const Item = ({ r, v }: { r: string; v: string | null | undefined }) => <div><small>{r}</small><strong>{v || '—'}</strong></div>
  return (
    <>
      {erro && <div className="erro">{/migration pendente/i.test(erro) ? 'Cadastro indisponível: a migration 0084 ainda não foi aplicada no banco.' : erro}</div>}
      {falha && <div className="erro" role="alert">{falha}</div>}
      {aviso && <p className="sub" role="status">{aviso}</p>}
      {carregando && !dados && !erro && <p className="sub">Carregando…</p>}
      {!carregando && !dados && !erro && <Vazio titulo="Sem dados cadastrais" texto="Este parceiro ainda não tem CNPJ completo, inscrição, telefone e endereço gravados. Eles entram ao importar o XML da NF-e do fornecedor, ou use “Atualizar a partir de um XML” abaixo." />}
      {d && (
        <>
          <div className="resumo-notas" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Item r="CPF/CNPJ" v={doc} />
            <Item r="Razão social" v={d.razao_social} />
            <Item r="Nome fantasia" v={d.nome_fantasia} />
            <Item r="Inscrição estadual" v={d.ie} />
            <Item r="Inscrição municipal" v={d.im} />
            <Item r="CNAE" v={d.cnae} />
            <Item r="Regime (CRT)" v={d.crt ? CRT[d.crt] ?? d.crt : null} />
            <Item r="Telefone" v={fmtFone(d.telefone)} />
            <Item r="E-mail" v={d.email} />
            <Item r="Endereço" v={end} />
            <Item r="Cód. município (IBGE)" v={d.codigo_municipio} />
          </div>
          <p className="sub" style={{ margin: '8px 0 4px' }}>
            {d.endereco_origem && <span className={d.endereco_origem === 'correios' ? 'selo selo-disponivel' : 'selo'}>Endereço: {ORIGEM_END[d.endereco_origem]}</span>}{' '}
            {d.cep_situacao && (SIT_CEP[d.cep_situacao] ?? d.cep_situacao)}. Atualizado em {data(d.atualizado_em)}.
          </p>
        </>
      )}
      {ctx.veRentabilidade && (
        <div className="filtros-contato" style={{ marginTop: 10 }}>
          <input ref={seletor} type="file" accept=".xml,text/xml,application/xml" style={{ display: 'none' }} onChange={(e) => { void porXml(e.target.files?.[0]); e.target.value = '' }} />
          <button className="sec" disabled={ocupado} onClick={() => seletor.current?.click()}>{ocupado ? 'Processando…' : 'Atualizar a partir de um XML'}</button>
          {d?.cep && d.endereco_origem !== 'manual' && <button className="sec" disabled={ocupado} onClick={() => void reconsultar()}>Reconsultar CEP nos Correios</button>}
        </div>
      )}
      <p className="sub" style={{ marginTop: 8 }}>
        O endereço segue a descrição oficial dos Correios (pelo CEP), para evitar abreviações e tipos de logradouro diferentes. Se o CEP não for confiável (não encontrado, ou cidade/UF diferentes), fica o endereço do XML. A mesma regra vale para o endereço do cliente.
      </p>
    </>
  )
}

function DocumentoReceita({ ctx, parceiro }: { ctx: Contexto; parceiro: ParceiroLinha }) {
  const [docs, setDocs] = useState<DocumentoParceiro[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [livre, setLivre] = useState('')
  const [consultando, setConsultando] = useState<string | null>(null)
  const [receita, setReceita] = useState<ReceitaCnpj | null>(null)
  const [erroReceita, setErroReceita] = useState<string | null>(null)
  const dl = classificar(livre)

  async function mostrar() {
    setCarregando(true); setErro(null)
    try { setDocs(await apiParceiros.documentos(ctx.empresa, parceiro.id)) } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }
  async function consultar(cnpj: string) {
    setConsultando(cnpj); setErroReceita(null); setReceita(null)
    try { setReceita(await apiReceita.consultarCnpj(ctx.empresa, cnpj)) } catch (e) { setErroReceita((e as Error).message) } finally { setConsultando(null) }
  }

  return (
    <>
      <p className="sub">
        O documento completo vem do dado lido do Bling. Cada abertura do documento e cada consulta à Receita ficam registradas (quem e quando; o número não é gravado).
        Conferência por dígitos verificadores vale para CPF e CNPJ; a consulta à Receita (ReceitaWS, o mesmo serviço do cadastro de parceiros da Sankhya) existe só para CNPJ.
      </p>
      {!docs && <button onClick={mostrar} disabled={carregando}>{carregando ? 'Abrindo…' : 'Mostrar documentos completos'}</button>}
      {erro && <div className="erro" role="alert">{/migration pendente/i.test(erro) ? 'Indisponível: a migration 0028 ainda não foi aplicada no banco.' : erro}</div>}
      {docs && docs.length === 0 && <Vazio titulo="Sem documento" texto="Nenhum contato vinculado a este parceiro tem CPF/CNPJ no dado lido do Bling (parceiro identificado só pelo @)." />}
      {docs && docs.length > 0 && (
        <div style={{ maxHeight: '35vh', overflow: 'auto', marginTop: 8 }}>
          <table>
            <thead><tr><th>Tipo</th><th>Número</th><th>Dígitos</th><th>Confere com o cadastro</th><th className="num">Contatos Bling</th><th /></tr></thead>
            <tbody>
              {docs.map((d) => {
                const c = classificar(d.numero)
                return (
                  <tr key={d.numero}>
                    <td>{d.tipo.toUpperCase()}</td><td>{c.formatado}</td>
                    <td><span className={d.valido ? 'selo selo-disponivel' : 'selo selo-baixada'}>{d.valido ? 'Válido' : 'Inválido'}</span></td>
                    <td>{d.confere_identificador ? 'Sim' : <strong>Não (conflito)</strong>}</td>
                    <td className="num">{d.bling_ids.length}</td>
                    <td>{d.tipo === 'cnpj' && d.valido
                      ? <button className="sec" disabled={consultando !== null} onClick={() => consultar(d.numero)}>{consultando === d.numero ? 'Consultando…' : 'Consultar Receita'}</button>
                      : d.tipo === 'cpf' ? <span className="mudo">sem consulta (só dígitos)</span> : null}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <h3 style={{ marginTop: 16 }}>Validar ou consultar outro documento</h3>
      <div className="filtros-contato">
        <input className="busca" value={livre} onChange={(e) => { setLivre(e.target.value); setReceita(null); setErroReceita(null) }} placeholder="CPF ou CNPJ (com ou sem pontuação)" inputMode="numeric" />
        {dl.mensagem && <span className={dl.valido ? 'selo selo-disponivel' : 'selo selo-baixada'}>{dl.mensagem}</span>}
        {dl.tipo === 'cnpj' && dl.valido && <button className="sec" disabled={consultando !== null} onClick={() => consultar(dl.digitos)}>{consultando === dl.digitos ? 'Consultando…' : 'Consultar Receita'}</button>}
      </div>
      {erroReceita && <div className="erro" role="alert">{erroReceita}</div>}
      {receita && (
        <div className="resumo-notas" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 8 }}>
          <div><small>Razão social (Receita)</small><strong>{receita.nome ?? '—'}</strong></div>
          <div><small>Nome no cadastro</small><strong>{parceiro.nome}</strong></div>
          <div><small>Situação cadastral</small><strong>{receita.situacao ?? '—'}{receita.data_situacao ? ` desde ${receita.data_situacao}` : ''}</strong></div>
          <div><small>Fantasia</small><strong>{receita.fantasia ?? '—'}</strong></div>
          <div><small>Atividade principal</small><strong>{receita.atividade_principal ?? '—'}</strong></div>
          <div><small>Endereço</small><strong>{[receita.logradouro, receita.numero, receita.complemento, receita.bairro, receita.municipio && `${receita.municipio}/${receita.uf ?? ''}`, receita.cep].filter(Boolean).join(', ') || '—'}</strong></div>
          <div><small>Contato</small><strong>{[receita.telefone, receita.email].filter(Boolean).join(' · ') || '—'}</strong></div>
          <div><small>Abertura / última atualização</small><strong>{receita.abertura ?? '—'} / {receita.ultima_atualizacao ? data(receita.ultima_atualizacao) : '—'}</strong></div>
        </div>
      )}
      {receita && <p className="sub" style={{ marginTop: 6 }}>Dados da Receita para conferência pelo time de cadastro. A atualização do cadastro a partir daqui entra junto com a tela de edição de parceiros.</p>}
    </>
  )
}

function NotasParceiro({ ctx, parceiro }: { ctx: Contexto; parceiro: ParceiroLinha }) {
  const [offset, setOffset] = useState(0)
  const [det, setDet] = useState<number | null>(null)
  const resumo = useCarregar(() => apiParceiros.resumoNotas(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const compras = useCarregar(() => apiParceiros.resumoCompras(ctx.empresa, parceiro.id), [ctx.empresa, parceiro.id])
  const lista = useCarregar(() => apiParceiros.historico(ctx.empresa, parceiro.id, offset, LIMITE_NOTAS), [ctx.empresa, parceiro.id, offset])
  const r = resumo.dados
  const c = compras.dados
  const total = lista.dados?.[0]?.total ?? 0
  const erro = resumo.erro ?? lista.erro ?? compras.erro
  return (
    <>
      {erro && <div className="erro">{/migration pendente/i.test(erro) ? 'Histórico de notas indisponível: a migration 0024 ainda não foi aplicada no banco.' : erro}</div>}
      {c && (c.qtd_compras > 0 || c.qtd_canceladas > 0) && (
        <>
          <p className="sub" style={{ margin: '4px 0' }}><strong>Compras deste parceiro (NF-e de entrada)</strong></p>
          <div className="resumo-notas">
            <div><small>Notas de compra</small><strong>{c.qtd_compras}</strong></div>
            <div><small>Valor comprado</small><strong>{brl(c.valor_total)}</strong></div>
            <div><small>Primeira compra</small><strong>{c.primeira ? data(c.primeira) : '—'}</strong></div>
            <div><small>Última compra</small><strong>{c.ultima ? data(c.ultima) : '—'}</strong></div>
          </div>
          {c.qtd_canceladas > 0 && <p className="sub" style={{ margin: '4px 0' }}>{c.qtd_canceladas} nota(s) de compra cancelada(s) não entram nos totais.</p>}
        </>
      )}
      {r && r.qtd_notas > 0 && (
        <>
          <p className="sub" style={{ margin: '8px 0 4px' }}><strong>Notas lidas do Bling (contatos vinculados)</strong></p>
          <div className="resumo-notas">
            <div><small>Notas</small><strong>{r.qtd_notas}</strong></div>
            <div><small>Valor total</small><strong>{r.qtd_notas > 0 && r.qtd_sem_detalhe === r.qtd_notas ? '—' : brl(r.valor_total)}</strong></div>
            <div><small>Ticket médio</small><strong>{r.ticket_medio == null ? '—' : brl(r.ticket_medio)}</strong></div>
            <div><small>Primeira nota</small><strong>{r.primeira ? data(r.primeira) : '—'}</strong></div>
            <div><small>Última nota</small><strong>{r.ultima ? data(r.ultima) : '—'}</strong></div>
          </div>
          <p className="sub" style={{ margin: '6px 0' }}>
            {Object.entries(r.por_situacao ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Sem notas vinculadas'}
            {r.qtd_sem_detalhe > 0 && ` · ${r.qtd_sem_detalhe} sem detalhe lido (valor ainda desconhecido)`}
            {r.qtd_notas > 0 && ' · Valor total e ticket médio não contam canceladas, rejeitadas e denegadas; códigos de situação ainda não validados na conta.'}
          </p>
        </>
      )}
      {lista.carregando && !lista.dados && <p className="sub">Carregando…</p>}
      {lista.dados && lista.dados.length === 0 && !erro && <Vazio titulo="Sem notas" texto="Nenhuma nota de compra (NF-e importada na Entrada de mercadoria) nem nota lida do Bling para este parceiro (a carga das notas do Bling ainda pode estar em andamento)." />}
      {lista.dados && lista.dados.length > 0 && (
        <div style={{ maxHeight: '45vh', overflow: 'auto' }}>
          <table>
            <thead><tr><th>Emissão</th><th>Origem</th><th>Nota</th><th>Tipo</th><th>Situação</th><th className="num">Valor</th><th className="num">Frete</th><th className="num">Itens</th><th>Contato Bling</th></tr></thead>
            <tbody>
              {lista.dados.map((n: HistoricoNota) => (
                <tr key={`${n.origem}-${n.ref}`} onClick={n.bling_id != null ? () => setDet(n.bling_id) : undefined} style={{ cursor: n.bling_id != null ? 'pointer' : 'default' }} title={n.chave_acesso ? `Chave de acesso ${n.chave_acesso}` : undefined}>
                  <td>{n.data_emissao ? data(n.data_emissao) : '—'}</td>
                  <td>{n.origem === 'compra' ? <span className="selo selo-disponivel">Compra</span> : <span className="selo">Bling</span>}</td>
                  <td>{n.numero}{n.serie ? `/${n.serie}` : ''}</td>
                  <td>{n.tipo ?? '—'}</td>
                  <td>{n.situacao ?? '—'}</td>
                  <td className="num">{n.tem_detalhe ? brl(n.valor_nota) : <span className="mudo">sem detalhe</span>}</td>
                  <td className="num">{n.tem_detalhe ? brl(n.valor_frete) : '—'}</td>
                  <td className="num">{n.qtd_itens ?? '—'}</td>
                  <td>{n.contato_bling_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE_NOTAS} onMudar={setOffset} />
      {det !== null && <DetalheNota ctx={ctx} id={det} onFechar={() => setDet(null)} />}
    </>
  )
}

function Pendentes({ ctx, status }: { ctx: Contexto; status: 'revisao' | 'proposto' }) {
  const [busca, setBusca] = useState('')
  const [offset, setOffset] = useState(0)
  const { dados, erro, carregando } = useCarregar(() => apiParceiros.pendentes(ctx.empresa, status, busca, offset, LIMITE), [ctx.empresa, status, busca, offset])
  const total = dados?.[0]?.total ?? 0
  return (
    <>
      <p className="sub">{status === 'revisao' ? 'Contato com o documento de um parceiro e o @ de outro: não foi fundido automaticamente.' : 'Contatos sem CPF/CNPJ válido nem @: ficam fora do cadastro oficial até haver uma chave confiável.'}</p>
      <div style={{ margin: '8px 0' }}><Busca valor={busca} onMudar={(v) => { setOffset(0); setBusca(v) }} placeholder="Buscar por nome ou ID do Bling" /></div>
      {erro && <div className="erro">{erro}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}
      {dados && dados.length === 0 && <Vazio titulo="Nada pendente" texto="Nenhum contato nesta situação." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>ID Bling</th><th>Nome no Bling (cru)</th><th>Sit.</th><th>Doc.</th><th>@</th><th>Motivo</th><th>Parceiro</th></tr></thead>
            <tbody>
              {dados.map((p: PendenteLinha) => (
                <tr key={p.bling_id}>
                  <td>{p.bling_id}</td><td>{p.nome_cru}</td><td>{SIT[p.situacao ?? ''] ?? p.situacao}</td>
                  <td>{p.documento_ultimos ? `***${p.documento_ultimos}${p.documento_valido === false ? ' (inválido)' : ''}` : '—'}</td>
                  <td>{p.handle_social ? `@${p.handle_social}` : '—'}</td><td>{p.motivo ?? '—'}</td><td>{p.parceiro_nome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={total} offset={offset} limite={LIMITE} onMudar={setOffset} />
    </>
  )
}
