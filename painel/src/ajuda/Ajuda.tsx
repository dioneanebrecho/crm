import { useEffect, useState } from 'react'
import { AJUDA, ATUALIZADO_EM, TOUR_BOAS_VINDAS, VERSAO_DOC } from './conteudo'
import { useTour } from './Tour'
import RelatarOcorrencia from './RelatarOcorrencia'

const CHAVE_BOAS_VINDAS = 'ane.tour.boasvindas'

// Botão "?" da barra superior + painel lateral de ajuda da tela atual.
export default function BotaoAjuda({ empresa, tela }: { empresa: string; tela: string }) {
  const [aberto, setAberto] = useState(false)
  const [relatar, setRelatar] = useState(false)
  const { iniciar, ativo } = useTour()

  // tour de boas-vindas na primeira vez (uma vez por navegador/usuário)
  useEffect(() => {
    if (localStorage.getItem(CHAVE_BOAS_VINDAS)) return
    const t = setTimeout(() => {
      if (!localStorage.getItem(CHAVE_BOAS_VINDAS)) { localStorage.setItem(CHAVE_BOAS_VINDAS, '1'); iniciar(TOUR_BOAS_VINDAS) }
    }, 700)
    return () => clearTimeout(t)
  }, [iniciar])

  useEffect(() => { if (ativo) setAberto(false) }, [ativo])

  const v = AJUDA[tela]
  return (
    <>
      <button className="sec icone-btn" data-ajuda="ajuda" title="Ajuda e tutorial" aria-label="Ajuda e tutorial"
              aria-expanded={aberto} onClick={() => setAberto((x) => !x)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" /><circle cx="12" cy="17.5" r=".6" fill="currentColor" />
        </svg>
      </button>

      {aberto && (
        <>
          <button className="ajuda-veu" aria-label="Fechar ajuda" onClick={() => setAberto(false)} />
          <aside className="ajuda-painel" role="dialog" aria-label={`Ajuda — ${v?.titulo ?? tela}`}>
            <div className="ajuda-topo">
              <div><small>AJUDA</small><strong>{v?.titulo ?? 'Esta tela'}</strong></div>
              <button type="button" className="tour-x" aria-label="Fechar" onClick={() => setAberto(false)}>×</button>
            </div>

            {v ? (
              <div className="ajuda-corpo">
                <section><h4>O que é</h4><p>{v.explicacao}</p></section>
                <section><h4>Caso de uso</h4><p>{v.casoDeUso}</p></section>
                {v.dicas.length > 0 && (
                  <section><h4>Dicas</h4><ul className="ajuda-dicas">{v.dicas.map((d, k) => <li key={k}>{d}</li>)}</ul></section>
                )}
              </div>
            ) : (
              <div className="ajuda-corpo"><p className="sub">Ainda não há documentação para esta tela. Use “Relatar dúvida ou ocorrência” para pedir.</p></div>
            )}

            <div className="ajuda-acoes">
              {v && v.passos.length > 0 && <button type="button" onClick={() => iniciar(v.passos)}>Iniciar tutorial desta tela</button>}
              <button type="button" className="sec" onClick={() => iniciar(TOUR_BOAS_VINDAS)}>Tour de boas-vindas</button>
              <button type="button" className="sec" onClick={() => { setRelatar(true); setAberto(false) }}>Relatar dúvida ou ocorrência</button>
            </div>
            <div className="ajuda-rodape"><span>Documentação v{VERSAO_DOC}</span><span>atualizada em {ATUALIZADO_EM.split('-').reverse().join('/')}</span></div>
          </aside>
        </>
      )}

      {relatar && <RelatarOcorrencia empresa={empresa} tela={tela} telaRotulo={v?.titulo ?? tela} onFechar={() => setRelatar(false)} />}
    </>
  )
}
