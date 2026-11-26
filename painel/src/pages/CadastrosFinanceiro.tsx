import { useState } from 'react'
import type { Contexto } from '../App'
import { apiTitulos, ACOES_FIN, MEIOS, type AcaoFin, type PermissaoUsuarioFin, TIPOS_CONTA, dia, hojeIso, moeda, type CadastrosFin, type ContaBancaria, type Projeto, type TipoTituloCad } from '../apiTitulos'
import { ComboBusca } from '../ComboBusca'
import GradeDados, { type Coluna } from '../GradeDados'
import { Abas, Campo, Formulario, Modal, Titulo, useCarregar } from '../ui'
import { CampoValor, ParceiroBusca, opcoesCr, podeEditar } from './finComum'

// Cadastros do financeiro de títulos: contas bancárias, tipos de título, projetos e parâmetros. Pedido 050.

type Aba = 'contas' | 'tipos' | 'projetos' | 'parametros' | 'permissoes'

export default function CadastrosFinanceiro({ ctx }: { ctx: Contexto }) {
  const pode = podeEditar(ctx, 'cadastros_financeiro')
  const adminGestor = (['admin', 'gestor', 'superadmin'] as const).some((p) => ctx.papeis.includes(p)) && pode
  const admin = (['admin', 'superadmin'] as const).some((p) => ctx.papeis.includes(p))
  const [aba, setAba] = useState<Aba>('contas')
  const cad = useCarregar(() => apiTitulos.cadastros(ctx.empresa), [ctx.empresa])
  const d = cad.dados
  return (
    <section>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Contas bancárias (com o saldo inicial na data de implantação), tipos de título (meio de pagamento, taxa e prazo de compensação), projetos para o rateio e os parâmetros que dizem em qual natureza entram juros, multas, descontos, taxas, adiantamentos e retenções.</>}>
            Cadastros financeiros
          </Titulo>
        </div>
      </div>
      <Abas<Aba> abas={[{ id: 'contas', rotulo: 'Contas bancárias', contagem: d?.contas.length }, { id: 'tipos', rotulo: 'Tipos de título', contagem: d?.tipos.length },
        { id: 'projetos', rotulo: 'Projetos', contagem: d?.projetos.length }, { id: 'parametros', rotulo: 'Parâmetros' }, ...(admin ? [{ id: 'permissoes' as Aba, rotulo: 'Permissões por usuário' }] : [])]} ativa={aba} onMudar={setAba} />
      {cad.erro && <div className="erro">{cad.erro}</div>}
      {!d && !cad.erro && <p className="sub">Carregando…</p>}
      {d && aba === 'contas' && <Contas ctx={ctx} pode={pode} cad={d} aoMudar={cad.recarregar} />}
      {d && aba === 'tipos' && <Tipos ctx={ctx} pode={pode} cad={d} aoMudar={cad.recarregar} />}
      {d && aba === 'projetos' && <Projetos ctx={ctx} pode={pode} cad={d} aoMudar={cad.recarregar} />}
      {d && aba === 'parametros' && <Parametros ctx={ctx} pode={adminGestor} cad={d} aoMudar={cad.recarregar} />}
      {admin && aba === 'permissoes' && <PermissoesUsuario ctx={ctx} />}
    </section>
  )
}

// ---------------------------------------------------------------- contas
function Contas({ ctx, pode, cad, aoMudar }: { ctx: Contexto; pode: boolean; cad: CadastrosFin; aoMudar: () => void }) {
  const [ed, setEd] = useState<ContaBancaria | 'nova' | null>(null)
  const colunas: Coluna<ContaBancaria>[] = [
    { id: 'nome', titulo: 'Conta', texto: (c) => c.nome, largura: 220 },
    { id: 'tipo', titulo: 'Tipo', texto: (c) => TIPOS_CONTA[c.tipo] ?? c.tipo },
    { id: 'banco', titulo: 'Banco · agência · conta', texto: (c) => [c.banco_codigo, c.agencia, c.conta].filter(Boolean).join(' · '), largura: 200 },
    { id: 'saldo_ini', titulo: 'Saldo inicial', texto: (c) => moeda(c.saldo_inicial), valor: (c) => c.saldo_inicial, direita: true, formatar: moeda },
    { id: 'data_ini', titulo: 'Em', texto: (c) => dia(c.data_saldo_inicial), valor: (c) => c.data_saldo_inicial },
    { id: 'negativo', titulo: 'Aceita negativo', texto: (c) => (c.permite_negativo ? 'Sim' : 'Não') },
    { id: 'situacao', titulo: 'Situação', texto: (c) => (c.ativa ? 'Ativa' : 'Inativa') },
  ]
  return (
    <div>
      {pode && <div className="acoes-topo"><button onClick={() => setEd('nova')}>+ Nova conta</button></div>}
      <GradeDados id="fin.contas" titulo="Contas bancárias" colunas={colunas} linhas={cad.contas} chave={(c) => c.id} altura="60vh"
        vazio="Nenhuma conta. Cadastre cada banco, o caixa da loja e a carteira de cada gateway." aoClicar={pode ? (c) => setEd(c) : undefined} />
      {ed && <ContaForm ctx={ctx} c={ed === 'nova' ? null : ed} onFechar={() => setEd(null)} onSalvo={() => { setEd(null); aoMudar() }} />}
    </div>
  )
}

function ContaForm({ ctx, c, onFechar, onSalvo }: { ctx: Contexto; c: ContaBancaria | null; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    nome: c?.nome ?? '', tipo: c?.tipo ?? 'corrente', banco_codigo: c?.banco_codigo ?? '', agencia: c?.agencia ?? '', conta: c?.conta ?? '',
    saldo_inicial: (c?.saldo_inicial ?? 0) as number | null, data_saldo_inicial: c?.data_saldo_inicial ?? hojeIso(),
    permite_negativo: c?.permite_negativo ?? true, ativa: c?.ativa ?? true, observacao: c?.observacao ?? '',
  })
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  return (
    <Modal titulo={c ? `Conta ${c.nome}` : 'Nova conta'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => { await apiTitulos.salvarConta(ctx.empresa, { ...(c ? { id: c.id } : {}), ...f, saldo_inicial: f.saldo_inicial ?? 0 }); onSalvo() }}>
        <div className="grade-2">
          <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => set({ nome: e.target.value })} required maxLength={80} placeholder="ex.: Itaú PJ, Caixa loja, Mercado Pago" /></Campo>
          <Campo rotulo="Tipo"><select value={f.tipo} onChange={(e) => set({ tipo: e.target.value })}>{Object.entries(TIPOS_CONTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo rotulo="Código do banco"><input value={f.banco_codigo} onChange={(e) => set({ banco_codigo: e.target.value })} placeholder="ex.: 341" /></Campo>
          <Campo rotulo="Agência"><input value={f.agencia} onChange={(e) => set({ agencia: e.target.value })} /></Campo>
          <Campo rotulo="Conta"><input value={f.conta} onChange={(e) => set({ conta: e.target.value })} /></Campo>
          <CampoValor rotulo="Saldo inicial" valor={f.saldo_inicial} onMudar={(n) => set({ saldo_inicial: n })} />
          <Campo rotulo="Data do saldo inicial" dica="Dia de implantação: movimentos antes dela não entram no saldo"><input type="date" value={f.data_saldo_inicial} onChange={(e) => set({ data_saldo_inicial: e.target.value })} required /></Campo>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.permite_negativo} onChange={(e) => set({ permite_negativo: e.target.checked })} /> Aceita saldo negativo (cheque especial)</label>
        {c && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.ativa} onChange={(e) => set({ ativa: e.target.checked })} /> Conta ativa</label>}
        <Campo rotulo="Observação"><input value={f.observacao} onChange={(e) => set({ observacao: e.target.value })} /></Campo>
        {c && <small className="sub">Saldo inicial e data só mudam enquanto a conta não tiver movimento conciliado anterior à nova data.</small>}
      </Formulario>
    </Modal>
  )
}

// ---------------------------------------------------------------- tipos de título
function Tipos({ ctx, pode, cad, aoMudar }: { ctx: Contexto; pode: boolean; cad: CadastrosFin; aoMudar: () => void }) {
  const [ed, setEd] = useState<TipoTituloCad | 'novo' | null>(null)
  const colunas: Coluna<TipoTituloCad>[] = [
    { id: 'codigo', titulo: 'Código', texto: (t) => t.codigo },
    { id: 'nome', titulo: 'Nome', texto: (t) => t.nome, largura: 200 },
    { id: 'meio', titulo: 'Meio', texto: (t) => MEIOS[t.meio] ?? t.meio },
    { id: 'aplica', titulo: 'Usado em', texto: (t) => (t.aplica_a === 'R' ? 'Receber' : t.aplica_a === 'D' ? 'Pagar' : 'Ambos') },
    { id: 'taxa', titulo: 'Taxa', texto: (t) => `${t.taxa_pct}%${t.taxa_fixa ? ` + ${moeda(t.taxa_fixa)}` : ''}`, valor: (t) => t.taxa_pct },
    { id: 'dias', titulo: 'Compensa em', texto: (t) => `${t.dias_compensacao} dia${t.dias_compensacao === 1 ? '' : 's'}`, valor: (t) => t.dias_compensacao, direita: true, somar: false },
    { id: 'conta', titulo: 'Conta padrão', texto: (t) => cad.contas.find((c) => c.id === t.conta_padrao_id)?.nome ?? '' },
    { id: 'nat', titulo: 'Natureza da taxa', texto: (t) => t.natureza_taxa ?? '', largura: 200, oculta: true },
    { id: 'situacao', titulo: 'Situação', texto: (t) => (t.ativo ? 'Ativo' : 'Inativo') },
  ]
  return (
    <div>
      {pode && <div className="acoes-topo"><button onClick={() => setEd('novo')}>+ Novo tipo de título</button></div>}
      <GradeDados id="fin.tipos_titulo" titulo="Tipos de título" colunas={colunas} linhas={cad.tipos} chave={(t) => t.id} altura="60vh" vazio="Nenhum tipo cadastrado." aoClicar={pode ? (t) => setEd(t) : undefined} />
      {ed && <TipoForm ctx={ctx} cad={cad} t={ed === 'novo' ? null : ed} onFechar={() => setEd(null)} onSalvo={() => { setEd(null); aoMudar() }} />}
    </div>
  )
}

function TipoForm({ ctx, cad, t, onFechar, onSalvo }: { ctx: Contexto; cad: CadastrosFin; t: TipoTituloCad | null; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    codigo: t?.codigo ?? '', nome: t?.nome ?? '', meio: t?.meio ?? 'pix', aplica_a: t?.aplica_a ?? 'A', conta_padrao_id: t?.conta_padrao_id ?? '',
    natureza_taxa_id: t?.natureza_taxa_id ?? '', taxa_pct: (t?.taxa_pct ?? 0) as number | null, taxa_fixa: (t?.taxa_fixa ?? 0) as number | null,
    dias_compensacao: t?.dias_compensacao ?? 0, baixa_automatica: t?.baixa_automatica ?? false, exige_codigo_barras: t?.exige_codigo_barras ?? false,
    ativo: t?.ativo ?? true, ordem: t?.ordem ?? 100,
  })
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const nats = cad.naturezas.map((n) => ({ valor: n.id, rotulo: `${n.codigo} · ${n.nome}`, extra: n.caminho }))
  return (
    <Modal titulo={t ? `Tipo ${t.nome}` : 'Novo tipo de título'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => {
        await apiTitulos.salvarTipo(ctx.empresa, { ...(t ? { id: t.id } : {}), ...f, codigo: f.codigo.toUpperCase(), conta_padrao_id: f.conta_padrao_id || null, natureza_taxa_id: f.natureza_taxa_id || null, taxa_pct: f.taxa_pct ?? 0, taxa_fixa: f.taxa_fixa ?? 0 })
        onSalvo()
      }}>
        <div className="grade-2">
          <Campo rotulo="Código" dica="Letras maiúsculas, números e _"><input value={f.codigo} onChange={(e) => set({ codigo: e.target.value.toUpperCase() })} required disabled={!!t} pattern="[A-Z0-9_]{2,30}" /></Campo>
          <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => set({ nome: e.target.value })} required /></Campo>
          <Campo rotulo="Meio"><select value={f.meio} onChange={(e) => set({ meio: e.target.value })}>{Object.entries(MEIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo rotulo="Usado em"><select value={f.aplica_a} onChange={(e) => set({ aplica_a: e.target.value as 'R' | 'D' | 'A' })}>
            <option value="A">Receber e pagar</option><option value="R">Só receber</option><option value="D">Só pagar</option></select></Campo>
          <CampoValor rotulo="Taxa (%)" valor={f.taxa_pct} onMudar={(n) => set({ taxa_pct: n })} />
          <CampoValor rotulo="Taxa fixa (R$)" valor={f.taxa_fixa} onMudar={(n) => set({ taxa_fixa: n })} />
          <Campo rotulo="Dias para compensar" dica="Quando o dinheiro cai na conta depois da venda"><input type="number" min={0} max={400} value={f.dias_compensacao} onChange={(e) => set({ dias_compensacao: Number(e.target.value) || 0 })} /></Campo>
          <Campo rotulo="Conta padrão"><select value={f.conta_padrao_id} onChange={(e) => set({ conta_padrao_id: e.target.value })}>
            <option value="">—</option>{cad.contas.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        </div>
        <Campo rotulo="Natureza da taxa" dica="Vazio usa a natureza de taxa dos parâmetros"><ComboBusca opcoes={nats} valor={f.natureza_taxa_id} onEscolher={(v) => set({ natureza_taxa_id: v })} placeholder="Natureza analítica" /></Campo>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.exige_codigo_barras} onChange={(e) => set({ exige_codigo_barras: e.target.checked })} /> Exige código de barras (boleto, guia)</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.baixa_automatica} onChange={(e) => set({ baixa_automatica: e.target.checked })} /> Baixa automática (gateway confirma o pagamento)</label>
        {t && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.ativo} onChange={(e) => set({ ativo: e.target.checked })} /> Ativo</label>}
      </Formulario>
    </Modal>
  )
}

// ---------------------------------------------------------------- projetos
function Projetos({ ctx, pode, cad, aoMudar }: { ctx: Contexto; pode: boolean; cad: CadastrosFin; aoMudar: () => void }) {
  const [ed, setEd] = useState<Projeto | 'novo' | null>(null)
  const colunas: Coluna<Projeto>[] = [
    { id: 'codigo', titulo: 'Código', texto: (p) => p.codigo },
    { id: 'nome', titulo: 'Projeto', texto: (p) => p.nome, largura: 260 },
    { id: 'inicio', titulo: 'Início', texto: (p) => dia(p.inicio), valor: (p) => p.inicio },
    { id: 'fim', titulo: 'Fim', texto: (p) => dia(p.fim), valor: (p) => p.fim },
    { id: 'orcamento', titulo: 'Orçamento', texto: (p) => moeda(p.orcamento), valor: (p) => p.orcamento, direita: true, formatar: moeda },
    { id: 'situacao', titulo: 'Situação', texto: (p) => (p.situacao === 'ativo' ? 'Ativo' : 'Encerrado') },
  ]
  return (
    <div>
      {pode && <div className="acoes-topo"><button onClick={() => setEd('novo')}>+ Novo projeto</button></div>}
      <GradeDados id="fin.projetos" titulo="Projetos" colunas={colunas} linhas={cad.projetos} chave={(p) => p.id} altura="60vh"
        vazio="Nenhum projeto. Use projetos para acompanhar o custo de uma ação (ex.: live especial, reforma da loja) no rateio." aoClicar={pode ? (p) => setEd(p) : undefined} />
      {ed && <ProjetoForm ctx={ctx} p={ed === 'novo' ? null : ed} onFechar={() => setEd(null)} onSalvo={() => { setEd(null); aoMudar() }} />}
    </div>
  )
}

function ProjetoForm({ ctx, p, onFechar, onSalvo }: { ctx: Contexto; p: Projeto | null; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ codigo: p?.codigo ?? '', nome: p?.nome ?? '', inicio: p?.inicio ?? '', fim: p?.fim ?? '', orcamento: p?.orcamento ?? null as number | null, situacao: p?.situacao ?? 'ativo', observacao: p?.observacao ?? '' })
  const set = (x: Partial<typeof f>) => setF((y) => ({ ...y, ...x }))
  return (
    <Modal titulo={p ? `Projeto ${p.codigo}` : 'Novo projeto'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={async () => { await apiTitulos.salvarProjeto(ctx.empresa, { ...(p ? { id: p.id } : {}), ...f }); onSalvo() }}>
        <div className="grade-2">
          <Campo rotulo="Código"><input value={f.codigo} onChange={(e) => set({ codigo: e.target.value })} required maxLength={20} disabled={!!p} /></Campo>
          <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => set({ nome: e.target.value })} required maxLength={100} /></Campo>
          <Campo rotulo="Início"><input type="date" value={f.inicio} onChange={(e) => set({ inicio: e.target.value })} /></Campo>
          <Campo rotulo="Fim"><input type="date" value={f.fim} onChange={(e) => set({ fim: e.target.value })} /></Campo>
          <CampoValor rotulo="Orçamento" valor={f.orcamento} onMudar={(n) => set({ orcamento: n })} />
          {p && <Campo rotulo="Situação"><select value={f.situacao} onChange={(e) => set({ situacao: e.target.value as 'ativo' | 'encerrado' })}><option value="ativo">Ativo</option><option value="encerrado">Encerrado</option></select></Campo>}
        </div>
        <Campo rotulo="Observação"><input value={f.observacao} onChange={(e) => set({ observacao: e.target.value })} /></Campo>
      </Formulario>
    </Modal>
  )
}

// ---------------------------------------------------------------- parâmetros
const PARAM_NAT: { k: string; r: string }[] = [
  { k: 'nat_juros_recebidos_id', r: 'Juros recebidos' }, { k: 'nat_multa_recebida_id', r: 'Multa recebida' },
  { k: 'nat_desconto_concedido_id', r: 'Desconto concedido' }, { k: 'nat_taxa_receber_id', r: 'Taxa de cartão/boleto no recebimento' },
  { k: 'nat_juros_pagos_id', r: 'Juros pagos' }, { k: 'nat_multa_paga_id', r: 'Multa paga' },
  { k: 'nat_desconto_obtido_id', r: 'Desconto obtido' }, { k: 'nat_tarifa_pagar_id', r: 'Tarifa no pagamento' },
  { k: 'nat_adiant_cliente_id', r: 'Adiantamento de clientes' }, { k: 'nat_adiant_fornecedor_id', r: 'Adiantamento a fornecedores' },
  { k: 'nat_iss_id', r: 'ISS retido' }, { k: 'nat_irrf_id', r: 'IRRF retido' }, { k: 'nat_inss_id', r: 'INSS retido' }, { k: 'nat_pcc_id', r: 'PIS/COFINS/CSLL retidos' },
  { k: 'nat_transferencia_id', r: 'Transferência entre contas' },
]

function Parametros({ ctx, pode, cad, aoMudar }: { ctx: Contexto; pode: boolean; cad: CadastrosFin; aoMudar: () => void }) {
  const p = cad.parametros ?? {}
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v == null ? '' : String(v)])))
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const nats = cad.naturezas.map((n) => ({ valor: n.id, rotulo: `${n.codigo} · ${n.nome}`, extra: n.caminho }))
  const set = (k: string, v: string) => { setMsg(null); setF((x) => ({ ...x, [k]: v })) }
  async function salvar() {
    setErro(null); setMsg(null)
    const alterados = Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== 'atualizado_em' && k !== 'criado_em' && (p[k] == null ? '' : String(p[k])) !== v))
    if (Object.keys(alterados).length === 0) return setMsg('Nada a salvar.')
    try { await apiTitulos.salvarParametros(ctx.empresa, alterados); setMsg('Parâmetros salvos.'); aoMudar() } catch (x) { setErro((x as Error).message) }
  }
  return (
    <div className="painel">
      {!pode && <p className="sub">Só administrador e gestor alteram os parâmetros.</p>}
      <h4 style={{ margin: '0 0 .5rem' }}>Naturezas usadas automaticamente nas baixas, adiantamentos e retenções</h4>
      <div className="grade-2">
        {PARAM_NAT.map((x) => (
          <Campo key={x.k} rotulo={x.r}><ComboBusca opcoes={nats} valor={f[x.k] ?? ''} onEscolher={(v) => set(x.k, v)} desabilitado={!pode} placeholder="Natureza analítica" /></Campo>))}
        <Campo rotulo="Centro de resultado financeiro" dica="Usado em juros, taxas e transferências"><ComboBusca opcoes={opcoesCr(cad)} valor={f.cr_financeiro_id ?? ''} onEscolher={(v) => set('cr_financeiro_id', v)} desabilitado={!pode} /></Campo>
      </div>
      <h4 style={{ margin: '1rem 0 .5rem' }}>Retenções, conciliação e fechamento</h4>
      <div className="grade-2">
        <Campo rotulo="Órgão do ISS (prefeitura)" dica={f.parceiro_prefeitura_id ? 'Cadastrado' : 'Criado na 1ª guia se vazio'}>
          <ParceiroBusca empresa={ctx.empresa} valor={f.parceiro_prefeitura_id || null} nome={nomes.pref ?? (f.parceiro_prefeitura_id ? 'parceiro definido' : '')} onEscolher={(id, n) => { set('parceiro_prefeitura_id', id); setNomes((x) => ({ ...x, pref: n })) }} /></Campo>
        <Campo rotulo="Órgão federal (Receita)" dica={f.parceiro_receita_id ? 'Cadastrado' : 'Criado na 1ª guia se vazio'}>
          <ParceiroBusca empresa={ctx.empresa} valor={f.parceiro_receita_id || null} nome={nomes.rec ?? (f.parceiro_receita_id ? 'parceiro definido' : '')} onEscolher={(id, n) => { set('parceiro_receita_id', id); setNomes((x) => ({ ...x, rec: n })) }} /></Campo>
        <Campo rotulo="Dia de vencimento das guias" dica="Do mês seguinte à competência"><input type="number" min={1} max={28} value={f.dia_vencimento_retencao ?? ''} onChange={(e) => set('dia_vencimento_retencao', e.target.value)} disabled={!pode} /></Campo>
        <Campo rotulo="Janela de sugestão na conciliação (dias)"><input type="number" min={0} max={30} value={f.janela_conciliacao_dias ?? ''} onChange={(e) => set('janela_conciliacao_dias', e.target.value)} disabled={!pode} /></Campo>
        <Campo rotulo="Período fechado até" dica="Nada com data até aqui pode ser lançado, baixado ou estornado"><input type="date" value={f.data_fechamento ?? ''} onChange={(e) => set('data_fechamento', e.target.value)} disabled={!pode} /></Campo>
      </div>
      {erro && <div className="erro" role="alert">{erro}</div>}
      {msg && <div className="info" role="status">{msg}</div>}
      {pode && <div className="acoes"><button onClick={salvar}>Salvar parâmetros</button></div>}
    </div>
  )
}

// ---------------------------------------------------------------- permissões por usuário (pedido 052)
function PermissoesUsuario({ ctx }: { ctx: Contexto }) {
  const lista = useCarregar(() => apiTitulos.permissoes(ctx.empresa), [ctx.empresa])
  const [edit, setEdit] = useState<Record<string, AcaoFin[]>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const acoesDe = (u: PermissaoUsuarioFin) => edit[u.usuario_id] ?? u.acoes
  const alternar = (u: PermissaoUsuarioFin, a: AcaoFin) => {
    setMsg(null)
    const atual = acoesDe(u)
    let n = atual.includes(a) ? atual.filter((x) => x !== a) : [...atual, a]
    // sem ver receita nem despesa as outras ações não têm efeito na Movimentação financeira
    if (!n.includes('ver_receita') && !n.includes('ver_despesa')) n = n.filter((x) => x === 'conciliar')
    setEdit((e) => ({ ...e, [u.usuario_id]: n }))
  }
  const sujo = (u: PermissaoUsuarioFin) => edit[u.usuario_id] !== undefined && [...edit[u.usuario_id]].sort().join() !== [...u.acoes].sort().join()
  async function salvar(u: PermissaoUsuarioFin) {
    setSalvando(u.usuario_id); setErro(null); setMsg(null)
    try {
      await apiTitulos.salvarPermissoes(ctx.empresa, u.usuario_id, acoesDe(u))
      setEdit((e) => { const n = { ...e }; delete n[u.usuario_id]; return n })
      setMsg(`Permissões de ${u.nome ?? u.email} salvas. Valem no próximo carregamento da tela dele.`); lista.recarregar()
    } catch (x) { setErro((x as Error).message) } finally { setSalvando(null) }
  }
  return (
    <div className="painel">
      <p className="sub" style={{ marginBottom: '.6rem' }}>Defina, por usuário, o que cada pessoa vê e faz na Movimentação financeira, em Contas e saldos e na Conciliação.
        Quem não tem “Ver receitas” nem “Ver despesas” não vê a tela de movimentação. Administradores têm tudo liberado.</p>
      {lista.erro && <div className="erro">{lista.erro}</div>}
      {erro && <div className="erro" role="alert">{erro}</div>}
      {msg && <div className="info" role="status">{msg}</div>}
      {!lista.dados && !lista.erro && <p className="sub">Carregando…</p>}
      {lista.dados && (
        <div className="tabela-rolavel">
          <table className="fin-tabela fin-perm">
            <thead><tr><th>Usuário</th>{ACOES_FIN.map((a) => <th key={a.id} className="c" title={a.dica}>{a.rotulo}</th>)}<th /></tr></thead>
            <tbody>{lista.dados.map((u) => (
              <tr key={u.usuario_id}>
                <td><strong>{u.nome ?? u.email}</strong><br /><small className="sub">{u.email} · {u.papeis.join(', ')}</small></td>
                {ACOES_FIN.map((a) => (
                  <td key={a.id} className="c">
                    {u.admin ? <span title="Administrador tem todas as ações">✓</span>
                      : <input type="checkbox" aria-label={`${a.rotulo} para ${u.nome ?? u.email}`} checked={acoesDe(u).includes(a.id)}
                          disabled={!['ver_receita', 'ver_despesa', 'conciliar'].includes(a.id) && !acoesDe(u).includes('ver_receita') && !acoesDe(u).includes('ver_despesa')}
                          onChange={() => alternar(u, a.id)} />}
                  </td>))}
                <td>{!u.admin && <button type="button" disabled={!sujo(u) || salvando === u.usuario_id} onClick={() => salvar(u)}>{salvando === u.usuario_id ? 'Salvando…' : 'Salvar'}</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>)}
      <ul className="sub" style={{ fontSize: '.82rem', marginTop: '.7rem' }}>
        {ACOES_FIN.map((a) => <li key={a.id}><strong>{a.rotulo}:</strong> {a.dica}</li>)}
      </ul>
    </div>
  )
}
