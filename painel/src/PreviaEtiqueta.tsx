import { ElementoVisual } from './EditorEtiqueta'
import { layoutPadrao, type Layout } from './etiquetaLayout'
import type { Modelo } from './apiImpressao'

export interface DadosPrevia { descricao?: string; grade?: string | null; preco?: number | null; numero_curto?: number | null; codigo_unidade?: string; codigo_produto?: string; codigo_variacao?: string; marca?: string | null; categoria?: string | null }

// Converte os dados da unidade nas variáveis do layout ({descricao}, {preco}...).
export const dadosDoLayout = (d: DadosPrevia): Record<string, string> => ({
  '{descricao}': d.descricao ?? '', '{codigo_produto}': d.codigo_produto ?? '', '{grade}': d.grade ?? '',
  '{preco}': d.preco == null ? '' : d.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  '{marca}': d.marca ?? '', '{categoria}': d.categoria ?? '', '{codigo_variacao}': d.codigo_variacao ?? '',
  '{codigo_unidade}': d.codigo_unidade ?? '', '{numero_curto}': d.numero_curto == null ? '—' : String(d.numero_curto),
})

// Mostra a etiqueta como o modelo desenha, com os dados reais da unidade. A impressora usa as fontes internas dela, então o tamanho das letras pode variar um pouco.
export function PreviaEtiqueta({ modelo, dados, escala = 5 }: { modelo: Modelo; dados: DadosPrevia; escala?: number }) {
  const layout: Layout = modelo.opcoes.layout ?? layoutPadrao(modelo.largura_mm, modelo.altura_mm)
  return (
    <div className="editor-tela" style={{ width: modelo.largura_mm * escala, height: modelo.altura_mm * escala, backgroundImage: 'none' }} aria-label={`Prévia da etiqueta ${modelo.nome}`}>
      {layout.elementos.map((e) => <ElementoVisual key={e.id} e={e} escala={escala} dados={dadosDoLayout(dados)} ativo={false} onIniciar={() => {}} />)}
    </div>
  )
}
