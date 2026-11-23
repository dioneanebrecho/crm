import { useState } from 'react'
import { apiGovernanca, type TipoGov } from '../api'
import { Campo, Formulario, Modal } from '../ui'

// Pré-mascaramento no navegador (o banco mascara de novo ao gravar): evita que dado sensível
// apareça no formulário já durante a digitação do resumo.
const mascarar = (t: string) => t
  .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[omitido]')
  .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[omitido]')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[omitido]')
  .replace(/\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[omitido]')

const TIPOS: { id: TipoGov; rotulo: string; ajuda: string }[] = [
  { id: 'duvida', rotulo: 'Dúvida', ajuda: 'Não entendi algo ou preciso de orientação' },
  { id: 'ocorrencia', rotulo: 'Ocorrência', ajuda: 'Algo deu errado ou ficou diferente do esperado' },
  { id: 'sugestao', rotulo: 'Sugestão', ajuda: 'Uma ideia de melhoria' },
]

export default function RelatarOcorrencia({ empresa, tela, telaRotulo, onFechar }:
  { empresa: string; tela: string; telaRotulo: string; onFechar: () => void }) {
  const [tipo, setTipo] = useState<TipoGov>('duvida')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [severidade, setSeveridade] = useState('media')
  const [enviado, setEnviado] = useState(false)

  if (enviado) {
    return (
      <Modal titulo="Recebido, obrigado!" onFechar={onFechar}>
        <p>Seu relato foi registrado na central de governança com a tela de origem (<strong>{telaRotulo}</strong>). A equipe vai analisar e dar retorno por lá.</p>
        <p className="sub">Dados como CPF, e-mail e telefone são mascarados automaticamente no registro.</p>
        <div className="acoes"><button type="button" onClick={onFechar}>Fechar</button></div>
      </Modal>
    )
  }

  return (
    <Modal titulo="Relatar dúvida ou ocorrência" onFechar={onFechar}>
      <Formulario enviarRotulo="Enviar" onCancelar={onFechar} onEnviar={async () => {
        await apiGovernanca.registrar(empresa, {
          tela, tipo, titulo: mascarar(titulo).trim(),
          descricao: mascarar(descricao).trim(),
          severidade: tipo === 'ocorrencia' ? severidade : null,
        })
        setEnviado(true)
      }}>
        <p className="sub">Origem: <strong>{telaRotulo}</strong>. Descreva com suas palavras — não cole CPF, e-mail ou telefone (eles são mascarados).</p>
        <Campo rotulo="Tipo">
          <div className="segmentado" role="radiogroup" aria-label="Tipo do relato">
            {TIPOS.map((t) => (
              <button type="button" key={t.id} role="radio" aria-checked={tipo === t.id}
                      className={tipo === t.id ? 'sel' : ''} title={t.ajuda} onClick={() => setTipo(t.id)}>{t.rotulo}</button>
            ))}
          </div>
        </Campo>
        <Campo rotulo="Resumo"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} placeholder="Em uma linha" autoFocus required /></Campo>
        <Campo rotulo="Detalhes" dica="O que aconteceu, o que você esperava e, se for o caso, como reproduzir.">
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5} maxLength={4000} required />
        </Campo>
        {tipo === 'ocorrencia' && (
          <Campo rotulo="Gravidade">
            <div className="segmentado" role="radiogroup" aria-label="Gravidade">
              {['baixa', 'media', 'alta'].map((s) => (
                <button type="button" key={s} role="radio" aria-checked={severidade === s}
                        className={severidade === s ? 'sel' : ''} onClick={() => setSeveridade(s)}>{s === 'media' ? 'média' : s}</button>
              ))}
            </div>
          </Campo>
        )}
      </Formulario>
    </Modal>
  )
}
