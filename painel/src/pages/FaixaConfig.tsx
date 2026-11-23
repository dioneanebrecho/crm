import { useEffect, useState } from 'react'
import { apiFaixa, type FaixaConfig, type FaixaFonte } from '../api'
import { Campo, Modal, Formulario, useCarregar, Vazio } from '../ui'
import type { Contexto } from '../App'

const quando = (iso: string | null) => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—'
const linhas = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)

export default function FaixaConfigTela({ ctx }: { ctx: Contexto }) {
  const { dados, erro, carregando, recarregar } = useCarregar(() => apiFaixa.config(ctx.empresa), [ctx.empresa])
  const podeEditar = ctx.perm ? ctx.perm['faixa'] === 'editar' : true
  const [cfg, setCfg] = useState<FaixaConfig | null>(null)
  const [chaves, setChaves] = useState(''); const [bloq, setBloq] = useState(''); const [veic, setVeic] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [fonte, setFonte] = useState<Partial<FaixaFonte> | null>(null)

  useEffect(() => {
    if (!dados) return
    setCfg(dados.config)
    setChaves(dados.config.palavras_chave.join('\n')); setBloq(dados.config.palavras_bloqueio.join('\n')); setVeic(dados.config.veiculos_permitidos.join('\n'))
  }, [dados])

  async function acao(fn: () => Promise<unknown>, ok: string) {
    setMsg(null); setFalha(null)
    try { await fn(); setMsg(ok); recarregar() } catch (e) { setFalha((e as Error).message) }
  }
  const salvar = (parcial: Partial<FaixaConfig>, ok = 'Salvo.') => acao(() => apiFaixa.salvar(ctx.empresa, parcial), ok)

  return (
    <section>
      <div className="topo"><div>
        <h1>Faixa informativa</h1>
        <p className="sub">Faixa no topo do painel com hora de Brasília, dólar do dia e manchetes do setor de moda. Cada pessoa pode ocultá-la no “×” da própria faixa; aqui a empresa decide se ela existe e de onde vêm as notícias.</p>
      </div></div>
      {erro && <div className="erro">{erro}</div>}
      {falha && <div className="erro" role="alert">{falha}</div>}
      {msg && <div className="aviso-caixa" role="status">{msg}</div>}
      {carregando && !dados && <p className="sub">Carregando…</p>}

      {dados && cfg && (
        <>
          <div className="faixa-cfg">
            <h2>Exibição</h2>
            <div className="faixa-grade">
              <label className="faixa-chk"><input type="checkbox" checked={cfg.ativa} disabled={!podeEditar} onChange={(e) => salvar({ ativa: e.target.checked }, e.target.checked ? 'Faixa ligada para a empresa.' : 'Faixa desligada para toda a empresa.')} /> Faixa ligada para a empresa</label>
              <label className="faixa-chk"><input type="checkbox" checked={cfg.mostrar_hora} disabled={!podeEditar} onChange={(e) => salvar({ mostrar_hora: e.target.checked })} /> Data, hora e clima (na cidade de quem acessa)</label>
              <label className="faixa-chk"><input type="checkbox" checked={cfg.mostrar_dolar} disabled={!podeEditar} onChange={(e) => salvar({ mostrar_dolar: e.target.checked })} /> Dólar do dia</label>
              <label className="faixa-chk"><input type="checkbox" checked={cfg.mostrar_noticias} disabled={!podeEditar} onChange={(e) => salvar({ mostrar_noticias: e.target.checked })} /> Manchetes do setor</label>
            </div>
            <div className="faixa-grade">
              <Campo rotulo="Segundos por item" dica="Entre 4 e 30.">
                <input type="number" min={4} max={30} defaultValue={cfg.segundos} disabled={!podeEditar} onBlur={(e) => { const v = Number(e.target.value); if (v !== cfg.segundos) salvar({ segundos: v }) }} />
              </Campo>
              <Campo rotulo="Idade máxima das manchetes (dias)" dica="Entre 1 e 60.">
                <input type="number" min={1} max={60} defaultValue={cfg.idade_max_dias} disabled={!podeEditar} onBlur={(e) => { const v = Number(e.target.value); if (v !== cfg.idade_max_dias) salvar({ idade_max_dias: v }) }} />
              </Campo>
            </div>
            <p className="sub">Dólar: {dados.cotacao?.valor ? `R$ ${Number(dados.cotacao.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} (${dados.cotacao.origem === 'ptax' ? 'PTAX Banco Central' : 'cotação comercial'}, referência ${quando(dados.cotacao.referencia_em)})` : 'ainda sem leitura'}{dados.cotacao?.erro ? ` · último aviso: ${dados.cotacao.erro}` : ''}</p>
          </div>

          <div className="faixa-cfg">
            <div className="faixa-cab"><h2>Fontes de notícias</h2>
              <div className="acoes">
                {podeEditar && <button className="sec" onClick={() => acao(() => apiFaixa.atualizarAgora(ctx.empresa), 'Busca pedida: as novidades aparecem em cerca de 2 minutos.')}>Atualizar agora</button>}
                {podeEditar && <button onClick={() => setFonte({ ativa: true, filtrar_veiculo: false, exigir_palavra: true, intervalo_min: 60 })}>Nova fonte</button>}
              </div>
            </div>
            {dados.fontes.length === 0 ? <Vazio titulo="Sem fontes" texto="Adicione o endereço de um feed RSS (https://…)." /> : (
              <div className="tabela-rolavel"><table>
                <thead><tr><th>Fonte</th><th>Estado</th><th>Última leitura</th><th>Lidas / aceitas</th><th /></tr></thead>
                <tbody>{dados.fontes.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.nome}</strong><br /><small className="mudo">{f.filtrar_veiculo ? 'só veículos permitidos' : 'fonte própria'}{f.exigir_palavra ? ' · exige palavra do segmento' : ''} · a cada {f.intervalo_min} min</small></td>
                    <td>{!f.ativa ? 'Desligada' : f.ultimo_erro ? <span title={f.ultimo_erro}>Com erro</span> : f.ultimo_ok_em ? 'Ok' : 'Aguardando'}</td>
                    <td>{quando(f.ultimo_ok_em)}</td>
                    <td>{f.itens_lidos} / {f.itens_aceitos}</td>
                    <td className="acoes">{podeEditar && <>
                      <button className="sec" onClick={() => setFonte(f)}>Editar</button>
                      <button className="sec" onClick={() => acao(() => apiFaixa.salvarFonte(ctx.empresa, { id: f.id, nome: f.nome, url: f.url, ativa: !f.ativa, filtrar_veiculo: f.filtrar_veiculo, exigir_palavra: f.exigir_palavra, intervalo_min: f.intervalo_min }), f.ativa ? 'Fonte desligada.' : 'Fonte ligada.')}>{f.ativa ? 'Desligar' : 'Ligar'}</button>
                    </>}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </div>

          <div className="faixa-cfg">
            <div className="faixa-cab"><h2>Filtros de qualidade</h2>
              {podeEditar && <button className="sec" onClick={() => { if (window.confirm('Voltar as três listas ao padrão da Zaya? Suas edições nelas serão perdidas.')) acao(() => apiFaixa.restaurarListas(ctx.empresa), 'Listas restauradas.') }}>Restaurar padrão</button>}
            </div>
            <p className="sub">Uma entrada por linha, sem diferenciar acento ou maiúscula. Termine com * para casar o começo da palavra (ex.: brecho* pega brechó e brechós).</p>
            <div className="faixa-listas">
              <Campo rotulo="Veículos permitidos" dica="Vale para fontes marcadas como “só veículos permitidos” (buscas do Google Notícias)."><textarea rows={10} value={veic} disabled={!podeEditar} onChange={(e) => setVeic(e.target.value)} /></Campo>
              <Campo rotulo="Palavras do segmento" dica="A manchete precisa conter ao menos uma."><textarea rows={10} value={chaves} disabled={!podeEditar} onChange={(e) => setChaves(e.target.value)} /></Campo>
              <Campo rotulo="Palavras bloqueadas" dica="Manchete com qualquer uma delas é descartada."><textarea rows={10} value={bloq} disabled={!podeEditar} onChange={(e) => setBloq(e.target.value)} /></Campo>
            </div>
            {podeEditar && <div className="acoes"><button onClick={() => salvar({ veiculos_permitidos: linhas(veic), palavras_chave: linhas(chaves), palavras_bloqueio: linhas(bloq) }, 'Filtros salvos. Valem para as próximas leituras.')}>Salvar filtros</button></div>}
          </div>

          <div className="faixa-cfg">
            <h2>Manchetes recentes</h2>
            {dados.noticias.length === 0 ? <Vazio titulo="Ainda sem manchetes" texto="A primeira leitura acontece em poucos minutos depois de ligar a faixa." /> : (
              <div className="tabela-rolavel"><table>
                <thead><tr><th>Manchete</th><th>Veículo</th><th>Publicada</th><th /></tr></thead>
                <tbody>{dados.noticias.map((n) => (
                  <tr key={n.id} style={n.oculta ? { opacity: .5 } : undefined}>
                    <td><a href={n.link} target="_blank" rel="noopener noreferrer">{n.titulo}</a></td>
                    <td>{n.veiculo}</td><td>{quando(n.publicado_em)}</td>
                    <td className="acoes">{podeEditar && <button className="sec" onClick={() => acao(() => apiFaixa.ocultar(ctx.empresa, n.id, !n.oculta), n.oculta ? 'Manchete volta à faixa.' : 'Manchete removida da faixa.')}>{n.oculta ? 'Mostrar' : 'Ocultar'}</button>}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </div>
        </>
      )}

      {fonte && <FormFonte fonte={fonte} onFechar={() => setFonte(null)} onSalvar={async (f) => { await apiFaixa.salvarFonte(ctx.empresa, f); setFonte(null); setMsg('Fonte salva. A primeira leitura acontece em cerca de 2 minutos.'); recarregar() }}
        onExcluir={fonte.id ? async () => { if (window.confirm('Excluir esta fonte e as manchetes que vieram dela?')) { await apiFaixa.excluirFonte(ctx.empresa, fonte.id!); setFonte(null); setMsg('Fonte excluída.'); recarregar() } } : undefined} />}
    </section>
  )
}

function FormFonte({ fonte, onFechar, onSalvar, onExcluir }: {
  fonte: Partial<FaixaFonte>; onFechar: () => void; onExcluir?: () => Promise<void>
  onSalvar: (f: { id: string | null; nome: string; url: string; ativa: boolean; filtrar_veiculo: boolean; exigir_palavra: boolean; intervalo_min: number }) => Promise<void>
}) {
  const [nome, setNome] = useState(fonte.nome ?? ''); const [url, setUrl] = useState(fonte.url ?? '')
  const [fv, setFv] = useState(fonte.filtrar_veiculo ?? false); const [ep, setEp] = useState(fonte.exigir_palavra ?? true)
  const [min, setMin] = useState(fonte.intervalo_min ?? 60)
  return (
    <Modal titulo={fonte.id ? 'Editar fonte' : 'Nova fonte'} onFechar={onFechar}>
      <Formulario onCancelar={onFechar} onEnviar={() => onSalvar({ id: fonte.id ?? null, nome, url, ativa: fonte.ativa ?? true, filtrar_veiculo: fv, exigir_palavra: ep, intervalo_min: min })}>
        <Campo rotulo="Nome"><input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} required /></Campo>
        <Campo rotulo="Endereço do feed RSS" dica="Precisa começar com https://."><input value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://…/feed" /></Campo>
        <label className="faixa-chk"><input type="checkbox" checked={fv} onChange={(e) => setFv(e.target.checked)} /> Aceitar só veículos permitidos (use em buscas que misturam muitos sites)</label>
        <label className="faixa-chk"><input type="checkbox" checked={ep} onChange={(e) => setEp(e.target.checked)} /> Exigir palavra do segmento na manchete</label>
        <Campo rotulo="Buscar a cada (minutos)" dica="Entre 15 e 1440."><input type="number" min={15} max={1440} value={min} onChange={(e) => setMin(Number(e.target.value))} /></Campo>
        {onExcluir && <button type="button" className="sec" onClick={() => { void onExcluir() }}>Excluir fonte</button>}
      </Formulario>
    </Modal>
  )
}
