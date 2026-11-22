// Reduz a foto no navegador (lado maior 1600 px, JPEG) antes de enviar: economiza espaço e acelera a página pública.
export async function reduzirFoto(arquivo: File, ladoMax = 1600, qualidade = 0.85): Promise<Blob> {
  if (!arquivo.type.startsWith('image/')) throw new Error(`"${arquivo.name}" não é uma imagem.`)
  if (arquivo.size > 25 * 1024 * 1024) throw new Error(`"${arquivo.name}" passa de 25 MB.`)
  const bmp = await createImageBitmap(arquivo).catch(() => { throw new Error(`Não foi possível ler "${arquivo.name}".`) })
  const f = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Este navegador não consegue processar imagens.')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao converter a imagem.'))), 'image/jpeg', qualidade))
}
