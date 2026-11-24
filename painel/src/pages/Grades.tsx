import { useState } from 'react'
import { apiGrades, useTiposGrade, type GradeAtributo, type GradeValor, type TipoGrade } from '../apiGrades'
import { Abas, Campo, Formulario, Modal, Vazio, Titulo } from '../ui'
import type { Contexto } from '../App'

type AbaTipo = 'tamanhos' | 'atributos' | 'palavras'
const NIVEL: Record<string, string> = { peca: 'Da peça (vale para todos os tamanhos)', variacao: 'Por tamanho (medidas)' }
const DADO: Record<string, string> = { texto: 'Texto', numero: 'Número', lista: 'Lista de opções' }
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
const lista = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)

export default function Grades({ ctx }: { ctx: Contexto }) {
  const { tipos, pendente, erro, recarregar } = useTiposGrade(ctx.empresa)
  const [edit, setEdit] = useState<TipoGrade | 'novo' | null>(null)
  const podeEditar = !pendente && ctx.papeis.some((p) => p === 'admin' || p === 'gestor') && (ctx.perm === null || ctx.perm.grades === 'editar')

  return (
    <section>
      <div className="topo">
        <div>
          <Titulo ajuda={<>Cada tipo de peça tem a sua grade: os tamanhos possíveis e os detalhes que se pedem no cadastro (cor, material, medidas…). Ao escolher o tipo na peça, o formulário já mostra só o que vale para ele. A lista abaixo nasceu do histórico importado do Bling e pode ser ajustada.</>}>Grades e atributos</Titulo>
        </div>
        {podeEditar && <button onClick={() => setEdit('novo')}>+ Novo tipo de grade</button>}
      </div>
      {pendente && <div className="aviso-caixa">A configuração ainda não está no banco (aguardando a migration 0025). Abaixo está a lista padrão, só para consulta.</div>}
      {erro && <div className="erro">{erro}</div>}
      {!tipos && !erro && <p className="sub">Carregando…</p>}
      {tipos && tipos.length === 0 && (
        <Vazio titulo="Nenhum tipo de grade" texto="Carregue a lista padrão (roupa, calçado, infantil, plus size, acessório e lote) ou crie o primeiro tipo."
          acao={podeEditar ? <button onClick={() => apiGrades.semear(ctx.empresa).then(recarregar)}>Carregar lista padrão</button> : undefined} />
      )}
      {tipos && tipos.length > 0 && (
        <div className="tabela-rolavel">
          <table>
            <thead><tr><th>Tipo</th><th>Tamanhos</th><th>Detalhes pedidos no cadastro</th><th>Sugerido para (palavras do nome)</th><th className="num">Peças</th><th>Situação</th></tr></thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id} className="clicavel" onClick={() => setEdit(t)}>
                  <td><strong>{t.nome}</strong>{t.descricao && <div className="mudo">{t.descricao}</div>}</td>
                  <td>{t.controla_tamanho ? t.valores.map((v) => v.rotulo).join(' · ') : <span className="mudo">sem controle por tamanho</span>}</td>
                  <td>{t.atributos.map((a) => a.rotulo).join(' · ') || '—'}</td>
                  <td>{t.palavras.slice(0, 6).join(', ')}{t.palavras.length > 6 ? '…' : ''}{t.palavras.length === 0 && '—'}</td>
                  <td className="num">{t.em_uso}</td>
                  <td>{t.ativo ? 'Ativo' : 'Inativo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <EditorTipo ctx={ctx} tipo={edit === 'novo' ? null : edit} somenteLeitura={!podeEditar} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar() }} />}
    </section>
  )
}

function EditorTipo({ ctx, tipo, somenteLeitura, onFechar, onSalvo }: { ctx: Contexto; tipo: TipoGrade | null; somenteLeitura: boolean; onFechar: () => void; onSalvo: () => void }) {
  const [aba, setAba] = useState<AbaTipo>('tamanhos')
  const [nome, setNome] = useState(tipo?.nome ?? '')
  const [descricao, setDescricao] = useState(tipo?.descricao ?? '')
  const [controla, setControla] = useState(tipo?.controla_tamanho ?? true)
  const [ativo, setAtivo] = useState(tipo?.ativo ?? true)
  const [valores, setValores] = useState<{ valor: string; rotulo: string; sin: string }[]>((tipo?.valores ?? []).map((v) => ({ valor: v.valor, rotulo: v.rotulo, sin: v.sinonimos.join(', ') })))
  const [atributos, setAtributos] = useState<(GradeAtributo & { opc: string })[]>((tipo?.atributos ?? []).map((a) => ({ ...a, opc: a.opcoes.join(', ') })))
  const [palavras, setPalavras] = useState((tipo?.palavras ?? []).join(', '))
  const ro = somenteLeitura

  async function enviar() {
    const vs: GradeValor[] = valores.filter((v) => v.valor.trim()).map((v, i) => ({
      valor: v.valor.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, ''), rotulo: v.rotulo.trim() || v.valor.trim(), ordem: i + 1,
      sinonimos: lista(v.sin),
    }))
    if (vs.some((v) => !v.valor)) throw new Error('Tamanho inválido: use só letras e números (sem espaço, barra ou acento).')
    if (new Set(vs.map((v) => v.valor)).size !== vs.length) throw new Error('Há tamanhos repetidos na lista.')
    if (controla && vs.length === 0) throw new Error('Informe ao menos um tamanho (ou desmarque "controla tamanho").')
    const as = atributos.filter((a) => a.rotulo.trim()).map((a, i) => ({
      codigo: a.codigo || slug(a.rotulo), rotulo: a.rotulo.trim(), nivel: a.nivel, tipo_dado: a.tipo_dado, opcoes: a.tipo_dado === 'lista' ? lista(a.opc) : [],
      unidade: a.unidade?.trim() || null, obrigatorio: a.obrigatorio, ordem: i + 1,
    }))
    if (as.some((a) => a.codigo.length < 2)) throw new Error('Cada detalhe precisa de um nome com ao menos 2 letras.')
    if (as.some((a) => a.tipo_dado === 'lista' && a.opcoes.length === 0)) throw new Error('Detalhe do tipo "Lista" precisa de opções.')
    if (new Set(as.map((a) => `${a.nivel}:${a.codigo}`)).size !== as.length) throw new Error('Há detalhes com o mesmo nome.')
    await apiGrades.salvar(ctx.empresa, tipo?.id ?? null, {
      nome, codigo: tipo?.codigo ?? (slug(nome) || 'tipo'), descricao, controla_tamanho: controla, ativo,
      valores: vs, atributos: as, palavras: lista(palavras).map((p) => p.toUpperCase()),
    } as never)
    onSalvo()
  }

  return (
    <Modal titulo={tipo ? `Tipo de grade: ${tipo.nome}` : 'Novo tipo de grade'} onFechar={onFechar} larga>
      <Formulario onCancelar={onFechar} onEnviar={ro ? async () => onFechar() : enviar} enviarRotulo={ro ? 'Fechar' : 'Salvar'}>
        <div className="grade2">
          <Campo rotulo="Nome do tipo"><input value={nome} onChange={(e) => setNome(e.target.value)} required disabled={ro} autoFocus /></Campo>
          <Campo rotulo="Situação"><select value={ativo ? '1' : '0'} onChange={(e) => setAtivo(e.target.value === '1')} disabled={ro}><option value="1">Ativo</option><option value="0">Inativo (some da lista de escolha)</option></select></Campo>
        </div>
        <Campo rotulo="Quando usar"><input value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={ro} placeholder="Ex.: Tênis, sandálias e botas" /></Campo>
        <Abas<AbaTipo> ativa={aba} onMudar={setAba} abas={[
          { id: 'tamanhos', rotulo: 'Tamanhos', contagem: valores.length }, { id: 'atributos', rotulo: 'Detalhes do cadastro', contagem: atributos.length }, { id: 'palavras', rotulo: 'Sugestão automática' },
        ]} />
        {aba === 'tamanhos' && (
          <div>
            <label className="check"><input type="checkbox" checked={controla} onChange={(e) => setControla(e.target.checked)} disabled={ro} /> Controla estoque por tamanho (desmarque para lotes e itens sem grade)</label>
            <table className="compacta"><thead><tr><th>Tamanho (vai no código)</th><th>Como aparece</th><th>Nomes equivalentes no Bling</th><th /></tr></thead><tbody>
              {valores.map((v, i) => (
                <tr key={i}>
                  <td><input value={v.valor} disabled={ro} maxLength={10} onChange={(e) => setValores(valores.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} /></td>
                  <td><input value={v.rotulo} disabled={ro} onChange={(e) => setValores(valores.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)))} /></td>
                  <td><input value={v.sin} disabled={ro} placeholder="U, UN, ÚNICO" onChange={(e) => setValores(valores.map((x, j) => (j === i ? { ...x, sin: e.target.value } : x)))} /></td>
                  <td>{!ro && <button type="button" className="link" onClick={() => setValores(valores.filter((_, j) => j !== i))}>remover</button>}</td>
                </tr>))}
            </tbody></table>
            {!ro && <button type="button" className="sec" onClick={() => setValores([...valores, { valor: '', rotulo: '', sin: '' }])}>+ Tamanho</button>}
            <p className="sub">O tamanho entra no código da variação e da unidade (ex.: VES-001-38), por isso só aceita letras e números, até 10 caracteres.</p>
          </div>
        )}
        {aba === 'atributos' && (
          <div>
            <p className="sub">Detalhes que o cadastro vai pedir para este tipo de peça. Os <strong>da peça</strong> valem para todos os tamanhos (cor, material); os <strong>por tamanho</strong> são medidas de cada tamanho.</p>
            {atributos.map((a, i) => {
              const up = (p: Partial<GradeAtributo & { opc: string }>) => setAtributos(atributos.map((x, j) => (j === i ? { ...x, ...p } : x)))
              return (
                <div key={i} className="bloco">
                  <div className="grade2">
                    <Campo rotulo="Nome do detalhe"><input value={a.rotulo} disabled={ro} onChange={(e) => up({ rotulo: e.target.value })} placeholder="Ex.: Altura do salto" /></Campo>
                    <Campo rotulo="Vale para"><select value={a.nivel} disabled={ro || !!a.codigo && !!tipo?.atributos.some((x) => x.codigo === a.codigo && x.nivel === a.nivel)} onChange={(e) => up({ nivel: e.target.value as GradeAtributo['nivel'] })}>
                      {Object.entries(NIVEL).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
                  </div>
                  <div className="grade2">
                    <Campo rotulo="Tipo de resposta"><select value={a.tipo_dado} disabled={ro} onChange={(e) => up({ tipo_dado: e.target.value as GradeAtributo['tipo_dado'] })}>
                      {Object.entries(DADO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
                    {a.tipo_dado === 'numero' && <Campo rotulo="Unidade"><input value={a.unidade ?? ''} disabled={ro} onChange={(e) => up({ unidade: e.target.value })} placeholder="cm" /></Campo>}
                    {a.tipo_dado === 'lista' && <Campo rotulo="Opções (separadas por vírgula)"><input value={a.opc} disabled={ro} onChange={(e) => up({ opc: e.target.value })} /></Campo>}
                  </div>
                  <label className="check"><input type="checkbox" checked={a.obrigatorio} disabled={ro} onChange={(e) => up({ obrigatorio: e.target.checked })} /> Obrigatório</label>
                  {!ro && <button type="button" className="link" onClick={() => setAtributos(atributos.filter((_, j) => j !== i))}>remover detalhe</button>}
                </div>
              )
            })}
            {!ro && <button type="button" className="sec" onClick={() => setAtributos([...atributos, { codigo: '', rotulo: '', nivel: 'peca', tipo_dado: 'texto', opcoes: [], unidade: null, obrigatorio: false, ordem: atributos.length + 1, opc: '' }])}>+ Detalhe</button>}
            <p className="sub">Detalhe removido deixa de ser pedido, mas o que já foi preenchido nas peças continua guardado.</p>
          </div>
        )}
        {aba === 'palavras' && (
          <Campo rotulo="Palavras que sugerem este tipo" dica="Ao digitar o nome da peça, a primeira palavra define o tipo sugerido. Ex.: BOLSA, CINTO → acessório. Separe por vírgula.">
            <textarea rows={4} value={palavras} disabled={ro} onChange={(e) => setPalavras(e.target.value)} />
          </Campo>
        )}
      </Formulario>
    </Modal>
  )
}
