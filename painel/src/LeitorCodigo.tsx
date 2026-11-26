import { useEffect, useRef, useState } from 'react'

// Leitura de código de barras e QR pela câmera do celular, direto no navegador — não precisa de aplicativo.
// No Chrome do Android usa a BarcodeDetector nativa (sem baixar nada). Onde ela não existe (iPhone, por exemplo),
// baixa sob demanda um leitor em WebAssembly, servido pelo próprio painel: nenhuma imagem sai do aparelho.
const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13']

interface Detectado { rawValue: string }
interface Detector { detect: (origem: CanvasImageSource) => Promise<Detectado[]> }
type ConstrutorNativo = new (o: { formats: string[] }) => Detector
interface JanelaComDetector extends Window { BarcodeDetector?: ConstrutorNativo & { getSupportedFormats?: () => Promise<string[]> } }

async function criarDetector(): Promise<{ detector: Detector; nativo: boolean }> {
  const Nativo = (window as JanelaComDetector).BarcodeDetector
  if (Nativo?.getSupportedFormats) {
    try {
      const suportados = await Nativo.getSupportedFormats()
      const formats = FORMATOS.filter((f) => suportados.includes(f))
      if (formats.length > 0) return { detector: new Nativo({ formats }), nativo: true }
    } catch { /* cai no leitor em WebAssembly */ }
  }
  const [mod, wasm] = await Promise.all([
    import('barcode-detector/pure'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  mod.setZXingModuleOverrides({ locateFile: (caminho: string, prefixo: string) => (caminho.endsWith('.wasm') ? wasm.default : prefixo + caminho) })
  return { detector: new mod.BarcodeDetector({ formats: FORMATOS as never }) as Detector, nativo: false }
}

// aviso sonoro curto: confirma a leitura sem a pessoa precisar olhar para a tela
let audio: AudioContext | null = null
function bipe(hz: number, ms: number) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audio = audio ?? new Ctx()
    if (audio.state === 'suspended') void audio.resume()
    const osc = audio.createOscillator(); const vol = audio.createGain()
    osc.type = 'square'; osc.frequency.value = hz; vol.gain.value = 0.05
    osc.connect(vol); vol.connect(audio.destination)
    osc.start(); osc.stop(audio.currentTime + ms / 1000)
  } catch { /* som é um extra: nunca atrapalha a bipagem */ }
}
export function bipeOk() { bipe(1320, 90); navigator.vibrate?.(40) }
export function bipeErro() { bipe(220, 260); navigator.vibrate?.([80, 60, 80]) }

export function LeitorCodigo({ onLer, onFechar, ocupado }: { onLer: (codigo: string) => void; onFechar: () => void; ocupado: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const ultimo = useRef<{ codigo: string; em: number }>({ codigo: '', em: 0 })
  const ocupadoRef = useRef(ocupado)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [nativo, setNativo] = useState<boolean | null>(null)
  useEffect(() => { ocupadoRef.current = ocupado }, [ocupado])

  useEffect(() => {
    let vivo = true
    let stream: MediaStream | null = null
    let timer: number | undefined

    async function abrir() {
      if (!window.isSecureContext) {
        setErro('A câmera só funciona em endereço seguro (https). Abra o painel publicado no celular, não o endereço de teste do computador.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) { setErro('Este navegador não dá acesso à câmera.'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return }
        if (video.current) { video.current.srcObject = stream; await video.current.play().catch(() => undefined) }
        const { detector, nativo: nat } = await criarDetector()
        if (!vivo) return
        setNativo(nat); setPronto(true)
        timer = window.setInterval(async () => {
          const v = video.current
          if (!v || v.readyState < 2 || ocupadoRef.current) return
          try {
            const achados = await detector.detect(v)
            const codigo = achados[0]?.rawValue?.trim()
            if (!codigo) return
            const agora = Date.now()
            // a câmera lê o mesmo código muitas vezes por segundo: só vale de novo depois de 2,5 s
            if (ultimo.current.codigo === codigo && agora - ultimo.current.em < 2500) return
            ultimo.current = { codigo, em: agora }
            onLer(codigo)
          } catch { /* quadro ruim: tenta no próximo */ }
        }, 250)
      } catch (e) {
        const nome = (e as DOMException)?.name
        setErro(nome === 'NotAllowedError' ? 'Permissão da câmera negada. Libere a câmera para este site nas configurações do navegador e abra de novo.'
          : nome === 'NotFoundError' ? 'Nenhuma câmera encontrada neste aparelho.'
          : `Não foi possível abrir a câmera: ${(e as Error).message}`)
      }
    }
    void abrir()
    return () => {
      vivo = false
      if (timer) window.clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
      if (video.current) video.current.srcObject = null
    }
  }, [onLer])

  return (
    <div className="leitor">
      <div className="leitor-topo">
        <strong>Câmera</strong>
        <button type="button" className="sec" onClick={onFechar}>Fechar câmera</button>
      </div>
      {erro
        ? <div className="erro" role="alert">{erro}</div>
        : <>
            <div className="leitor-video">
              <video ref={video} playsInline muted aria-label="Imagem da câmera para leitura do código" />
              <span className="leitor-mira" aria-hidden />
            </div>
            <p className="mudo pequeno">
              {!pronto ? 'Abrindo a câmera…'
                : `Aponte para o QR da etiqueta. A leitura é automática${nativo === false ? ' (leitor baixado para este navegador)' : ''}.`}
            </p>
          </>}
    </div>
  )
}
