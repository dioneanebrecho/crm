import { useState } from 'react'
import { Abas, Busca, Campo, Formulario, Modal, Paginacao, useCarregar, Vazio } from '../ui'
import { apiImpressao, type EtiquetaLinha, type Impressora, type JaImpressa, type Modelo } from '../apiImpressao'
import type { Contexto } from '../App'

type Aba = 'etiquetas' | 'fila' | 'impressoras' | 'modelos' | 'agentes'
const LIMITE = 50
const dh = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const brl = (v: number | null) => (v === null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const ROTULO_ESTADO: Record<string, string> = { pendente: 'A imprimir', impressa: 'Impressa', desatualizada: 'Número mudou: reimprimir', encerrada: 'Fora do estoque' }
const ROTULO_JOB: Record<string, string> = { pendente: 'Na fila', imprimindo: 'Imprimindo', enviado: 'Enviado', erro: 'Erro', cancelado: 'Cancelado' }

export default function Etiquetas({ ctx }: { ctx: Contexto }) {
  const [aba, setAba] = useState<Aba>('etiquetas')
  const sup = ctx.papeis.includes('superadmin')
  const papel = (...r: string[]) => sup || r.some((x) => (ctx.papeis as string[]).includes(x))
  const nivelOk = ctx.perm === null || ctx.perm['etiquetas'] === 'editar'
  const podeImprimir = nivelOk && papel('admin', 'gestor', 'expedicao')
  const podeConfigurar = nivelOk && papel('admin', 'gestor')
  const ehAdmin = nivelOk && papel('admin')
  const verFilaEAgentes = papel('admin', 'gestor', 'suporte', 'expedicao')
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'etiquetas', rotulo: 'Etiquetas' },
    ...(verFilaEAgentes ? [{ id: 'fila' as Aba, rotulo: 'Fila de impressão' }, { id: 'impressoras' as Aba, rotulo: 'Impressoras' }, { id: 'modelos' as Aba, rotulo: 'Modelos' }] : []),
    ...(papel('admin', 'gestor') ? [{ id: 'agentes' as Aba, rotulo: 'Agentes' }] : []),
  ]
  return (
    <section>
      <div className="topo"><div><h1>Etiquetas e impressão</h1><p className="sub">Número curto da live, QR de rastreio, fila e impressoras térmicas.</p></div></div>
      <Abas abas={abas} ativa={aba} onMudar={setAba} />
      {aba === 'etiquetas' && <ListaEtiquetas ctx={ctx} podeImprimir={podeImprimir} ehAdmin={ehAdmin} />}
      {aba === 'fila' && <Fila ctx={ctx} podeImprimir={podeImprimir} />}
      {aba === 'impressoras' && <Impressoras ctx={ctx} pode={podeConfigurar} />}
      {aba === 'modelos' && <Modelos ctx={ctx} pode={podeConfigurar} />}
      {aba === 'agentes' && <Agentes ctx={ctx} pode={podeConfigurar} />}
    </section>
  )
}

// ---------------------------------------------------------------- Etiquetas
function ListaEtiquetas({ ctx, podeImprimir, ehAdmin }: { ctx: Contexto; podeImprimir: boolean; ehAdmin: boolean }) {
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [offset, setOffset] = useState(0)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [imprimir, setImprimir] = useState(false)
  const [hist, setHist] = useState<EtiquetaLinha | null>(null)
  const [cfgAberta, setCfgAberta] = useState(false)
  const cfg = useCarregar(() => apiImpressao.config(ctx.empresa), [ctx.empresa])
  const lista = useCarregar(() => apiImpressao.etiquetas(ctx.empresa, estado, busca, offset, LIMITE + 1), [ctx.empresa, estado, busca, offset])
  const linhas = (lista.dados ?? []).slice(0, LIMITE)
  const temMais = (lista.dados?.length ?? 0) > LIMITE
  const filtrar = (fn: () => void) => { setOffset(0); fn() }
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selecionaveis = linhas.filter((l) => l.estado !== 'encerrada')
  const todos = selecionaveis.length > 0 && selecionaveis.every((l) => sel.has(l.unidade_id))

  return (
    <>
      {cfg.dados && (
        <div className="acoes-topo" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="sub">Números em uso: <strong>{cfg.dados.em_uso}</strong> · livres: <strong>{cfg.dados.livres}</strong> de {cfg.dados.maximo}
            {cfg.dados.quarentena_min > 0 && <> · quarentena de {cfg.dados.quarentena_min} min ({cfg.dados.em_quarentena} aguardando)</>}</span>
          {ehAdmin && <button className="sec" onClick={() => setCfgAberta(true)}>Configurar numeração</button>}
        </div>
      )}
      <div className="filtros">
        <Busca valor={busca} onMudar={(v) => filtrar(() => setBusca(v))} placeholder="Número curto, código da unidade ou nome da peça" />
        <select value={estado} onChange={(e) => filtrar(() => setEstado(e.target.value))} aria-label="Situação da etiqueta">
          <option value="">Todas as situações</option>
          {Object.entries(ROTULO_ESTADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {podeImprimir && <button disabled={sel.size === 0} onClick={() => setImprimir(true)}>Imprimir selecionadas ({sel.size})</button>}
      </div>
      {lista.erro && <div className="erro">{lista.erro}</div>}
      {lista.carregando && !lista.dados && <p className="sub">Carregando…</p>}
      {lista.dados && linhas.length === 0 && <Vazio titulo="Nenhuma etiqueta" texto="As etiquetas surgem sozinhas quando as unidades entram no estoque." />}
      {linhas.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr>
              {podeImprimir && <th><input type="checkbox" checked={todos} aria-label="Selecionar todas" onChange={() => setSel((s) => { const n = new Set(s); selecionaveis.forEach((l) => todos ? n.delete(l.unidade_id) : n.add(l.unidade_id)); return n })} /></th>}
              <th>Nº</th><th>Unidade</th><th>Peça</th><th>Tam.</th><th>Preço</th><th>Situação</th><th>Impressões</th><th>1ª impressão</th><th>Última</th><th></th>
            </tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.etiqueta_id} className={l.estado === 'encerrada' ? 'linha-inativa' : ''}>
                  {podeImprimir && <td><input type="checkbox" disabled={l.estado === 'encerrada'} checked={sel.has(l.unidade_id)} onChange={() => alternar(l.unidade_id)} aria-label={`Selecionar ${l.unidade_codigo}`} /></td>}
                  <td><strong style={{ fontSize: '1.1rem' }}>{l.numero_curto ?? '—'}</strong></td>
                  <td><code>{l.unidade_codigo}</code></td><td>{l.peca_nome}</td><td>{l.tamanho}</td><td>{brl(l.preco)}</td>
                  <td>{ROTULO_ESTADO[l.estado]}</td><td>{l.qtd_impressoes}</td>
                  <td className="mudo">{dh(l.primeira_impressao_em)}{l.primeira_impressao_por ? ` · ${l.primeira_impressao_por}` : ''}</td>
                  <td className="mudo">{dh(l.ultima_impressao_em)}{l.ultima_impressao_por ? ` · ${l.ultima_impressao_por}` : ''}</td>
                  <td><button className="sec" onClick={() => setHist(l)}>Histórico</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao total={offset + linhas.length + (temMais ? 1 : 0)} offset={offset} limite={LIMITE} onMudar={setOffset} />
      {imprimir && <ModalImprimir ctx={ctx} unidades={[...sel]} onFechar={() => setImprimir(false)} onConcluido={() => { setImprimir(false); setSel(new Set()); lista.recarregar() }} />}
      {hist && <ModalHistorico ctx={ctx} etiqueta={hist} onFechar={() => setHist(null)} />}
      {cfgAberta && cfg.dados && (
        <Modal titulo="Numeração do código curto" onFechar={() => setCfgAberta(false)}>
          <FormConfig ctx={ctx} atual={cfg.dados.maximo} quarentena={cfg.dados.quarentena_min} onFechar={() => setCfgAberta(false)} onSalvo={() => { setCfgAberta(false); cfg.recarregar() }} />
        </Modal>
      )}
    </>
  )
}

function FormConfig({ ctx, atual, quarentena, onFechar, onSalvo }: { ctx: Contexto; atual: number; quarentena: number; onFechar: () => void; onSalvo: () => void }) {
  const [maximo, setMaximo] = useState(String(atual))
  const [q, setQ] = useState(String(quarentena))
  return (
    <Formulario onCancelar={onFechar} onEnviar={async () => { await apiImpressao.salvarConfig(ctx.empresa, Number(maximo), Number(q)); onSalvo() }}>
      <Campo rotulo="Maior número" dica="Entre 99 e 9999. Só reduza depois de liberar os números acima do novo teto."><input type="number" min={99} max={9999} value={maximo} onChange={(e) => setMaximo(e.target.value)} required /></Campo>
      <Campo rotulo="Quarentena do número liberado (minutos)" dica="0 = o número pode ser reaproveitado na hora. Use um tempo maior para evitar que um cliente compre a peça errada logo após a venda."><input type="number" min={0} max={10080} value={q} onChange={(e) => setQ(e.target.value)} required /></Campo>
    </Formulario>
  )
}

function ModalHistorico({ ctx, etiqueta, onFechar }: { ctx: Contexto; etiqueta: EtiquetaLinha; onFechar: () => void }) {
  const h = useCarregar(() => apiImpressao.historico(ctx.empresa, etiqueta.unidade_id), [etiqueta.unidade_id])
  return (
    <Modal titulo={`Impressões de ${etiqueta.unidade_codigo}`} larga onFechar={onFechar}>
      {h.erro && <div className="erro">{h.erro}</div>}
      {h.dados && h.dados.length === 0 && <p className="sub">Esta etiqueta ainda não foi impressa.</p>}
      {h.dados && h.dados.length > 0 && (
        <div className="tabela-rolavel"><table>
          <thead><tr><th>#</th><th>Quando</th><th>Quem</th><th>Nº curto</th><th>Impressora</th><th>Resultado</th><th>Motivo</th></tr></thead>
          <tbody>{h.dados.map((x) => (
            <tr key={x.numero_impressao}>
              <td>{x.numero_impressao}{x.eh_reimpressao ? ' (reimpressão)' : ''}</td><td>{dh(x.solicitado_em)}</td><td>{x.solicitado_por ?? '—'}</td>
              <td>{x.numero_curto ?? '—'}</td><td>{x.impressora ?? '—'}</td><td>{x.resultado}{x.erro ? `: ${x.erro}` : ''}</td><td className="mudo">{x.motivo ?? ''}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </Modal>
  )
}

function ModalImprimir({ ctx, unidades, onFechar, onConcluido }: { ctx: Contexto; unidades: string[]; onFechar: () => void; onConcluido: () => void }) {
  const imps = useCarregar(() => apiImpressao.impressoras(ctx.empresa), [ctx.empresa])
  const [imp, setImp] = useState('')
  const [copias, setCopias] = useState('1')
  const [motivo, setMotivo] = useState('')
  const [jaImpressas, setJa] = useState<JaImpressa[] | null>(null)
  const [pronto, setPronto] = useState<string | null>(null)
  const ativas = (imps.dados ?? []).filter((i) => i.ativa)
  const escolhida = imp || ativas[0]?.id || ''

  async function enviar(confirmar: boolean) {
    const r = await apiImpressao.solicitar(ctx.empresa, unidades, escolhida, Number(copias), confirmar ? motivo : null, confirmar)
    if (r.ok) setPronto(`${r.enfileiradas} etiqueta(s) na fila${r.reimpressoes ? `, sendo ${r.reimpressoes} reimpressão(ões)` : ''}. O agente da impressora envia em instantes.`)
    else setJa(r.ja_impressas)
  }

  if (pronto) return <Modal titulo="Enviado para a fila" onFechar={onConcluido}><p>{pronto}</p><div className="acoes"><button onClick={onConcluido}>Ok</button></div></Modal>
  if (jaImpressas) {
    return (
      <Modal titulo="Etiquetas já impressas" larga onFechar={onFechar}>
        <div className="erro" role="alert">{jaImpressas.length} etiqueta(s) já foram impressas antes. Confirme só se for reimprimir de propósito; a reimpressão fica registrada com seu nome, data e hora.</div>
        <div className="tabela-rolavel"><table>
          <thead><tr><th>Nº</th><th>Unidade</th><th>Impressões</th><th>1ª impressão</th><th>Última</th></tr></thead>
          <tbody>{jaImpressas.map((x) => (
            <tr key={x.unidade_id}><td>{x.numero_curto}</td><td><code>{x.unidade_codigo}</code></td><td>{x.qtd_impressoes}{x.em_andamento ? ' (uma ainda na fila)' : ''}</td>
              <td>{dh(x.primeira_impressao_em)} · {x.primeira_impressao_por ?? '—'}</td><td>{dh(x.ultima_impressao_em)} · {x.ultima_impressao_por ?? '—'}</td></tr>))}</tbody>
        </table></div>
        <Formulario enviarRotulo="Reimprimir mesmo assim" onCancelar={onFechar} onEnviar={async () => { if (motivo.trim().length < 3) throw new Error('Informe o motivo da reimpressão.'); await enviar(true) }}>
          <Campo rotulo="Motivo da reimpressão"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: etiqueta danificada, papel travou" required autoFocus /></Campo>
        </Formulario>
      </Modal>
    )
  }
  return (
    <Modal titulo={`Imprimir ${unidades.length} etiqueta(s)`} onFechar={onFechar}>
      {imps.erro && <div className="erro">{imps.erro}</div>}
      {imps.dados && ativas.length === 0 && <div className="erro">Cadastre uma impressora na aba Impressoras antes de imprimir.</div>}
      <Formulario enviarRotulo="Enviar para a fila" onCancelar={onFechar} onEnviar={async () => { if (!escolhida) throw new Error('Escolha uma impressora.'); await enviar(false) }}>
        <Campo rotulo="Impressora"><select value={escolhida} onChange={(e) => setImp(e.target.value)}>{ativas.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.setor ? ` · ${i.setor}` : ''}</option>)}</select></Campo>
        <Campo rotulo="Cópias de cada etiqueta"><input type="number" min={1} max={5} value={copias} onChange={(e) => setCopias(e.target.value)} /></Campo>
      </Formulario>
    </Modal>
  )
}

// ---------------------------------------------------------------- Fila
function Fila({ ctx, podeImprimir }: { ctx: Contexto; podeImprimir: boolean }) {
  const [status, setStatus] = useState('')
  const f = useCarregar(() => apiImpressao.fila(ctx.empresa, status), [ctx.empresa, status])
  const [erro, setErro] = useState<string | null>(null)
  return (
    <>
      <div className="filtros">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos</option>{Object.entries(ROTULO_JOB).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="sec" onClick={f.recarregar}>Atualizar</button>
      </div>
      {(erro || f.erro) && <div className="erro">{erro ?? f.erro}</div>}
      {f.dados && f.dados.length === 0 && <Vazio titulo="Fila vazia" texto="Nenhum envio para a impressora ainda." />}
      {f.dados && f.dados.length > 0 && (
        <div className="tabela-rolavel"><table>
          <thead><tr><th>Quando</th><th>Etiqueta</th><th>Impressora</th><th>Quem</th><th>Status</th><th>Tentativas</th><th></th></tr></thead>
          <tbody>{f.dados.map((j) => (
            <tr key={j.id}>
              <td>{dh(j.solicitado_em)}</td>
              <td>{j.unidade_codigo ? <><strong>{j.numero_curto}</strong> · <code>{j.unidade_codigo}</code></> : <span className="mudo">{j.origem_tela === 'teste_impressora' ? 'Teste de impressora' : '—'}</span>}{j.eh_reimpressao ? ' (reimpressão)' : ''}</td>
              <td>{j.impressora}</td><td>{j.solicitado_por ?? '—'}</td>
              <td>{ROTULO_JOB[j.status]}{j.ultimo_erro ? `: ${j.ultimo_erro}` : ''}</td><td>{j.tentativas}</td>
              <td>{podeImprimir && j.status === 'pendente' && <button className="sec" onClick={async () => { setErro(null); try { await apiImpressao.cancelarJob(ctx.empresa, j.id); f.recarregar() } catch (e) { setErro((e as Error).message) } }}>Cancelar</button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Impressoras
function Impressoras({ ctx, pode }: { ctx: Contexto; pode: boolean }) {
  const l = useCarregar(() => apiImpressao.impressoras(ctx.empresa), [ctx.empresa])
  const modelos = useCarregar(() => apiImpressao.modelos(ctx.empresa), [ctx.empresa])
  const agentes = useCarregar(() => apiImpressao.agentes(ctx.empresa).catch(() => []), [ctx.empresa])
  const [edit, setEdit] = useState<Impressora | 'nova' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <>
      {pode && <div className="acoes-topo"><button onClick={() => setEdit('nova')}>Nova impressora</button></div>}
      {msg && <div className="info" role="status">{msg}</div>}
      {l.erro && <div className="erro">{l.erro}</div>}
      {l.dados && l.dados.length === 0 && <Vazio titulo="Nenhuma impressora" texto="Cadastre a impressora térmica (ZPL) e pareie o agente do computador onde ela está instalada." />}
      {l.dados && l.dados.length > 0 && (
        <div className="tabela-rolavel"><table>
          <thead><tr><th>Nome</th><th>Setor</th><th>Conexão</th><th>Caminho</th><th>Modelo</th><th>Ativa</th><th></th></tr></thead>
          <tbody>{l.dados.map((i) => (
            <tr key={i.id} className={i.ativa ? '' : 'linha-inativa'}>
              <td>{i.nome}</td><td>{i.setor ?? ''}</td><td>{i.tipo_conexao === 'zpl_tcp' ? 'Rede (TCP)' : 'Windows'}</td><td><code>{i.caminho_rede}</code></td>
              <td>{modelos.dados?.find((m) => m.id === i.modelo_id)?.nome ?? 'Padrão'}</td><td>{i.ativa ? 'Sim' : 'Não'}</td>
              <td>{pode && <>
                <button className="sec" onClick={() => setEdit(i)}>Editar</button>{' '}
                <button className="sec" disabled={!i.ativa} onClick={async () => { setMsg(null); try { await apiImpressao.teste(ctx.empresa, i.id); setMsg(`Teste de ${i.nome} enviado para a fila.`) } catch (e) { setMsg((e as Error).message) } }}>Imprimir teste</button></>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {edit && (
        <Modal titulo={edit === 'nova' ? 'Nova impressora' : `Editar ${edit.nome}`} onFechar={() => setEdit(null)}>
          <FormImpressora ctx={ctx} atual={edit === 'nova' ? null : edit} modelos={modelos.dados ?? []} agentes={(agentes.dados ?? []).filter((a) => a.status === 'ativo')} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); l.recarregar() }} />
        </Modal>
      )}
    </>
  )
}

function FormImpressora({ ctx, atual, modelos, agentes, onFechar, onSalvo }: {
  ctx: Contexto; atual: Impressora | null; modelos: Modelo[]; agentes: { id: string; nome: string }[]; onFechar: () => void; onSalvo: () => void
}) {
  const [f, setF] = useState({
    nome: atual?.nome ?? '', setor: atual?.setor ?? '', tipo_conexao: atual?.tipo_conexao ?? 'zpl_windows', caminho_rede: atual?.caminho_rede ?? '',
    modelo_id: atual?.modelo_id ?? '', agente_id: atual?.agente_id ?? '', dpi: String(atual?.dpi ?? 203), ajuste_x_mm: String(atual?.ajuste_x_mm ?? 0),
    ajuste_y_mm: String(atual?.ajuste_y_mm ?? 0), ativa: atual?.ativa ?? true,
  })
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Formulario onCancelar={onFechar} onEnviar={async () => {
      await apiImpressao.salvarImpressora(ctx.empresa, atual?.id ?? null, {
        nome: f.nome, setor: f.setor, tipo_conexao: f.tipo_conexao, caminho_rede: f.caminho_rede, modelo_id: f.modelo_id || null, agente_id: f.agente_id || null,
        dpi: Number(f.dpi), ajuste_x_mm: Number(f.ajuste_x_mm), ajuste_y_mm: Number(f.ajuste_y_mm), ativa: f.ativa,
      })
      onSalvo()
    }}>
      <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus /></Campo>
      <Campo rotulo="Setor"><input value={f.setor} onChange={(e) => set('setor', e.target.value)} placeholder="Ex.: Expedição, Loja" /></Campo>
      <Campo rotulo="Tipo de conexão"><select value={f.tipo_conexao} onChange={(e) => set('tipo_conexao', e.target.value)}><option value="zpl_windows">Impressora do Windows (nome compartilhado)</option><option value="zpl_tcp">Rede (IP:porta, ex.: 192.168.0.50:9100)</option></select></Campo>
      <Campo rotulo="Caminho" dica="Windows: nome da impressora, como aparece no sistema. Rede: IP e porta."><input value={f.caminho_rede} onChange={(e) => set('caminho_rede', e.target.value)} required /></Campo>
      <Campo rotulo="Modelo de etiqueta"><select value={f.modelo_id} onChange={(e) => set('modelo_id', e.target.value)}><option value="">Padrão da empresa</option>{modelos.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.largura_mm}×{m.altura_mm} mm)</option>)}</select></Campo>
      <Campo rotulo="Agente de impressão" dica="Vazio = qualquer agente aprovado da empresa pode imprimir."><select value={f.agente_id} onChange={(e) => set('agente_id', e.target.value)}><option value="">Qualquer agente</option>{agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></Campo>
      <Campo rotulo="Resolução (dpi)"><select value={f.dpi} onChange={(e) => set('dpi', e.target.value)}>{[152, 203, 300, 600].map((d) => <option key={d} value={d}>{d}</option>)}</select></Campo>
      <Campo rotulo="Ajuste horizontal (mm)" dica="Corrige etiqueta deslocada para os lados."><input type="number" step="0.5" min={-30} max={30} value={f.ajuste_x_mm} onChange={(e) => set('ajuste_x_mm', e.target.value)} /></Campo>
      <Campo rotulo="Ajuste vertical (mm)"><input type="number" step="0.5" min={-15} max={15} value={f.ajuste_y_mm} onChange={(e) => set('ajuste_y_mm', e.target.value)} /></Campo>
      <label className="campo"><span><input type="checkbox" checked={f.ativa} onChange={(e) => set('ativa', e.target.checked)} /> Impressora ativa</span></label>
    </Formulario>
  )
}

// ---------------------------------------------------------------- Modelos
function Modelos({ ctx, pode }: { ctx: Contexto; pode: boolean }) {
  const l = useCarregar(() => apiImpressao.modelos(ctx.empresa), [ctx.empresa])
  const [edit, setEdit] = useState<Modelo | 'novo' | null>(null)
  return (
    <>
      {pode && <div className="acoes-topo"><button onClick={() => setEdit('novo')}>Novo modelo</button></div>}
      {l.erro && <div className="erro">{l.erro}</div>}
      {l.dados && (
        <div className="tabela-rolavel"><table>
          <thead><tr><th>Nome</th><th>Tamanho</th><th>Campos</th><th>Padrão</th><th>Ativo</th><th></th></tr></thead>
          <tbody>{l.dados.map((m) => (
            <tr key={m.id} className={m.ativo ? '' : 'linha-inativa'}>
              <td>{m.nome}</td><td>{m.largura_mm} × {m.altura_mm} mm</td>
              <td className="mudo">QR + número{m.opcoes.mostrar_tamanho !== false ? ' + tamanho' : ''}{m.opcoes.mostrar_preco !== false ? ' + preço' : ''}{m.opcoes.mostrar_barras !== false ? ' + código de barras' : ''}</td>
              <td>{m.padrao ? 'Sim' : ''}</td><td>{m.ativo ? 'Sim' : 'Não'}</td><td>{pode && <button className="sec" onClick={() => setEdit(m)}>Editar</button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {edit && <Modal titulo={edit === 'novo' ? 'Novo modelo' : `Editar ${edit.nome}`} onFechar={() => setEdit(null)}>
        <FormModelo ctx={ctx} atual={edit === 'novo' ? null : edit} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); l.recarregar() }} />
      </Modal>}
    </>
  )
}

function FormModelo({ ctx, atual, onFechar, onSalvo }: { ctx: Contexto; atual: Modelo | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(atual?.nome ?? '')
  const [w, setW] = useState(String(atual?.largura_mm ?? 60))
  const [h, setH] = useState(String(atual?.altura_mm ?? 40))
  const [preco, setPreco] = useState(atual?.opcoes.mostrar_preco !== false)
  const [tam, setTam] = useState(atual?.opcoes.mostrar_tamanho !== false)
  const [barras, setBarras] = useState(atual?.opcoes.mostrar_barras !== false)
  const [padrao, setPadrao] = useState(atual?.padrao ?? false)
  const [ativo, setAtivo] = useState(atual?.ativo ?? true)
  return (
    <Formulario onCancelar={onFechar} onEnviar={async () => {
      await apiImpressao.salvarModelo(ctx.empresa, atual?.id ?? null, { nome, largura_mm: Number(w), altura_mm: Number(h), opcoes: { mostrar_preco: preco, mostrar_tamanho: tam, mostrar_barras: barras }, padrao, ativo })
      onSalvo()
    }}>
      <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus /></Campo>
      <Campo rotulo="Largura (mm)"><input type="number" min={20} max={120} step="0.5" value={w} onChange={(e) => setW(e.target.value)} /></Campo>
      <Campo rotulo="Altura (mm)"><input type="number" min={15} max={100} step="0.5" value={h} onChange={(e) => setH(e.target.value)} /></Campo>
      <label className="campo"><span><input type="checkbox" checked={tam} onChange={(e) => setTam(e.target.checked)} /> Mostrar tamanho</span></label>
      <label className="campo"><span><input type="checkbox" checked={preco} onChange={(e) => setPreco(e.target.checked)} /> Mostrar preço</span></label>
      <label className="campo"><span><input type="checkbox" checked={barras} onChange={(e) => setBarras(e.target.checked)} /> Mostrar código de barras</span></label>
      <label className="campo"><span><input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} /> Modelo padrão da empresa</span></label>
      <label className="campo"><span><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo</span></label>
    </Formulario>
  )
}

// ---------------------------------------------------------------- Agentes
function Agentes({ ctx, pode }: { ctx: Contexto; pode: boolean }) {
  const l = useCarregar(() => apiImpressao.agentes(ctx.empresa), [ctx.empresa])
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const ROT: Record<string, string> = { ativo: 'Ativo', aguardando_aprovacao: 'Aguardando', revogado: 'Revogado', expirado: 'Expirado' }
  return (
    <>
      <p className="sub">O agente é o programa instalado no computador da impressora. Ao iniciar, ele mostra um código de 8 caracteres; digite aqui para aprovar.</p>
      {pode && (
        <form className="filtros" onSubmit={async (e) => { e.preventDefault(); setErro(null); try { await apiImpressao.aprovarAgente(ctx.empresa, codigo, nome); setCodigo(''); setNome(''); l.recarregar() } catch (x) { setErro((x as Error).message) } }}>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código do agente" maxLength={12} required />
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: PC da expedição)" />
          <button type="submit">Aprovar agente</button>
        </form>
      )}
      {(erro || l.erro) && <div className="erro">{erro ?? l.erro}</div>}
      {l.dados && l.dados.length === 0 && <Vazio titulo="Nenhum agente" texto="Instale o agente no computador da impressora para começar." />}
      {l.dados && l.dados.length > 0 && (
        <div className="tabela-rolavel"><table>
          <thead><tr><th>Nome</th><th>Computador</th><th>Versão</th><th>Status</th><th>Último contato</th><th></th></tr></thead>
          <tbody>{l.dados.map((a) => (
            <tr key={a.id} className={a.status === 'ativo' ? '' : 'linha-inativa'}>
              <td>{a.nome}</td><td>{a.hostname}</td><td>{a.versao ?? ''}</td><td>{ROT[a.status]}</td><td>{dh(a.ultimo_contato_em)}</td>
              <td>{pode && a.status === 'ativo' && <button className="sec" onClick={async () => { if (!confirm(`Revogar o agente ${a.nome}? Ele deixa de imprimir.`)) return; try { await apiImpressao.revogarAgente(ctx.empresa, a.id); l.recarregar() } catch (x) { setErro((x as Error).message) } }}>Revogar</button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  )
}
