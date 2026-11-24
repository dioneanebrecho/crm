import { useRef, useState } from 'react'
import { apiConhecimento as api } from '../api'
import { Campo, Vazio, useCarregar, Titulo } from '../ui'
import type { Contexto } from '../App'

const MAX_CARACTERES = 400_000
const CARTAO = { background: 'var(--card)', border: '1px solid var(--borda)', borderRadius: 12, padding: '.6rem 1rem', display: 'grid', gap: 2, minWidth: 120 } as const
const ROTULO_TIPO: Record<string, string> = { documento: 'Documento', regra: 'Regra', politica: 'Política', outro: 'Outro' }
const ROTULO_SENS: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }

export default function Conhecimento({ ctx, abrir }: { ctx: Contexto; abrir: (aba: string) => void }) {
  const editar = ctx.perm ? ctx.perm['conhecimento'] === 'editar' : ctx.papeis.some((p) => p === 'admin' || p === 'superadmin' || p === 'gestor')
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.listar(ctx.empresa), [ctx.empresa])
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [tipo, setTipo] = useState('documento')
  const [sens, setSens] = useState('baixa')
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const arquivos = useRef<HTMLInputElement>(null)

  if (erro) return <div className="erro">{erro}</div>
  if (carregando && !dados) return <p className="sub">Carregando…</p>
  if (!dados) return null
  const { resumo, fontes } = dados

  async function enviar(itens: { titulo: string; texto: string }[]) {
    setOcupado('envio'); setMsg(null)
    const linhas: string[] = []; let ok = true
    for (const it of itens) {
      if (it.texto.length > MAX_CARACTERES) { linhas.push(`${it.titulo}: passa de ${MAX_CARACTERES.toLocaleString('pt-BR')} caracteres; divida o arquivo.`); ok = false; continue }
      try {
        const r = await api.indexar(ctx.empresa, { titulo: it.titulo, texto: it.texto, tipo, sensibilidade: sens })
        const m = r.mascarados ? r.mascarados.cpf + r.mascarados.email + r.mascarados.telefone : 0
        linhas.push(`${it.titulo}: ${r.estado === 'sem_mudanca' ? 'sem mudança' : `${r.estado === 'criada' ? 'novo' : 'atualizado'}, ${r.trechos} trecho(s)${r.reaproveitados ? `, ${r.reaproveitados} reaproveitado(s)` : ''}`}${m ? `; ${m} dado(s) pessoal(is) mascarado(s)` : ''}`)
      } catch (e) { linhas.push(`${it.titulo}: ${(e as Error).message}`); ok = false }
    }
    setMsg({ ok, texto: linhas.join(' · ') }); setOcupado(null); recarregar()
  }
  async function aoEscolherArquivos(lista: FileList | null) {
    if (!lista?.length) return
    const itens: { titulo: string; texto: string }[] = []
    for (const f of Array.from(lista)) itens.push({ titulo: f.name, texto: await f.text() })
    if (arquivos.current) arquivos.current.value = ''
    await enviar(itens)
  }
  async function colar() {
    await enviar([{ titulo: titulo.trim(), texto }])
    setTitulo(''); setTexto('')
  }
  // Gera os vetores em rodadas; para sozinho se faltar configuração ou o provedor pedir espera.
  async function processar(reabrir = false) {
    setOcupado('vetores'); setMsg(null)
    try {
      let total = 0
      for (let i = 0; i < 40; i++) {
        const r = await api.processar(ctx.empresa, reabrir && i === 0)
        if (!r.ok && r.motivo) { setMsg({ ok: false, texto: r.motivo }); break }
        total += r.gravados ?? 0
        if (r.aguardar_s) { setMsg({ ok: false, texto: `O provedor pediu uma pausa (limite de uso). Tente de novo em cerca de ${Math.ceil(r.aguardar_s / 60)} min; nada foi perdido.` }); break }
        if (!r.ok) { setMsg({ ok: false, texto: `${r.erro ?? 'Falha ao gerar vetores'}${total ? ` (${total} gerado(s) antes da falha)` : ''}` }); break }
        if (!r.resumo || r.resumo.pendentes === 0) { setMsg({ ok: true, texto: `Vetores em dia: ${total} gerado(s) agora.` }); break }
      }
    } catch (e) { setMsg({ ok: false, texto: (e as Error).message }) }
    setOcupado(null); recarregar()
  }
  async function alternar(id: string, ativa: boolean) {
    setOcupado(id); setMsg(null)
    try { await api.alternar(ctx.empresa, id, ativa); recarregar() } catch (e) { setMsg({ ok: false, texto: (e as Error).message }) }
    setOcupado(null)
  }
  const aberto = resumo.pendentes + resumo.falhos

  return (
    <section>
      <div className="topo"><div><Titulo ajuda={<>Documentos e regras que o assistente consulta antes de responder. A busca funciona por texto desde o envio; o vetor melhora a busca por significado e é gerado depois. Quem usa o assistente faz as perguntas na tela <strong>Assistente</strong>.</>}>Base de conhecimento</Titulo></div>
        <button className="sec" onClick={() => abrir('assistente')}>Testar no Assistente</button></div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={CARTAO}><small>Documentos</small><strong>{resumo.fontes}</strong></div>
        <div style={CARTAO}><small>Trechos</small><strong>{resumo.trechos}</strong></div>
        <div style={CARTAO}><small>Com vetor</small><strong>{resumo.prontos}/{resumo.trechos}</strong></div>
        <div style={CARTAO}><small>Na fila</small><strong>{resumo.pendentes}</strong></div>
        {resumo.falhos > 0 && <div style={CARTAO}><small>Falharam (5 tentativas)</small><strong>{resumo.falhos}</strong></div>}
      </div>
      {resumo.ultimo_erro && <div className="erro">Último erro de vetor: {resumo.ultimo_erro}</div>}
      {msg && <div className={msg.ok ? 'info' : 'erro'} role="status">{msg.texto}</div>}

      {editar && <>
        <div className="aviso-caixa" style={{ marginTop: 12 }}>
          <strong>Não envie senhas, chaves de API, tokens nem dados de acesso a servidores.</strong> CPF, e-mail e telefone são mascarados automaticamente antes de gravar; CNPJ não. O que for enviado pode aparecer nas respostas do assistente.
        </div>
        <div className="barra-acoes" style={{ marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo rotulo="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value)}>{Object.entries(ROTULO_TIPO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
          <Campo rotulo="Sensibilidade"><select value={sens} onChange={(e) => setSens(e.target.value)}>{Object.entries(ROTULO_SENS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
          <input ref={arquivos} type="file" multiple accept=".md,.txt,.csv,.json,text/*" hidden onChange={(e) => void aoEscolherArquivos(e.target.files)} />
          <button onClick={() => arquivos.current?.click()} disabled={ocupado !== null}>{ocupado === 'envio' ? 'Enviando…' : 'Enviar arquivos (.md, .txt, .csv)'}</button>
          <button className="sec" onClick={() => void processar(false)} disabled={ocupado !== null || resumo.pendentes === 0}>{ocupado === 'vetores' ? 'Gerando vetores…' : `Gerar vetores${resumo.pendentes ? ` (${resumo.pendentes})` : ''}`}</button>
          {resumo.falhos > 0 && <button className="sec" onClick={() => void processar(true)} disabled={ocupado !== null}>Tentar de novo os que falharam</button>}
        </div>
        <details style={{ marginTop: 12 }}>
          <summary>Colar um texto</summary>
          <div style={{ marginTop: 8 }}>
            <Campo rotulo="Título (o mesmo título atualiza o documento)"><input value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} /></Campo>
            <Campo rotulo="Texto"><textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
            <button onClick={() => void colar()} disabled={ocupado !== null || !titulo.trim() || !texto.trim()}>Adicionar</button>
          </div>
        </details>
        {aberto > 0 && resumo.prontos === 0 && <p className="sub">Se "Gerar vetores" avisar que a IA de vetor está desligada, ligue-a em Integrações → IA (modo Simulado já basta; nada é enviado a cliente).</p>}
      </>}

      <h2 style={{ marginTop: 24 }}>Documentos</h2>
      {fontes.length === 0 ? <Vazio titulo="Nenhum documento ainda" texto={editar ? 'Envie arquivos .md ou .txt com regras, políticas e procedimentos.' : 'Peça a um gestor para cadastrar os documentos.'} /> : (
        <div className="tabela-rolavel"><table>
          <thead><tr><th>Título</th><th>Tipo</th><th>Sensib.</th><th>Versão</th><th>Trechos</th><th>Vetor</th><th>Atualizado</th><th>Ativa</th></tr></thead>
          <tbody>{fontes.map((f) => (
            <tr key={f.id}>
              <td style={{ whiteSpace: 'normal' }}>{f.titulo}{f.mascarados && (f.mascarados.cpf || f.mascarados.email || f.mascarados.telefone) ? <small className="sub" style={{ display: 'block' }}>dados pessoais mascarados: {(f.mascarados.cpf ?? 0) + (f.mascarados.email ?? 0) + (f.mascarados.telefone ?? 0)}</small> : null}</td>
              <td>{ROTULO_TIPO[f.tipo] ?? f.tipo}</td><td>{ROTULO_SENS[f.sensibilidade]}</td><td>{f.versao ?? '—'}</td><td>{f.trechos}</td>
              <td>{f.prontos}/{f.trechos}</td><td>{new Date(f.atualizado_em).toLocaleString('pt-BR')}</td>
              <td><input type="checkbox" aria-label={`Ativar ${f.titulo}`} checked={f.ativa} disabled={!editar || ocupado !== null} onChange={(e) => void alternar(f.id, e.target.checked)} /></td>
            </tr>))}</tbody>
        </table></div>
      )}

    </section>
  )
}
