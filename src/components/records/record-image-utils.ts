/** Downscale large photos client-side: max 1600px long edge, JPEG ~0.85 → dataURL. */
export async function downscaleToDataURL(file: File): Promise<{ data: string; mime: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('图片解码失败'))
      el.src = url
    })
    const MAX = 1600
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('画布不可用')
    ctx.drawImage(img, 0, 0, w, h)
    const mime = file.type === 'image/png' && scale >= 1 ? 'image/png' : 'image/jpeg'
    const data = canvas.toDataURL(mime, 0.85)
    return { data, mime }
  } finally {
    URL.revokeObjectURL(url)
  }
}
