'use client'

const DELIVERY_EXPORT_MAX_WIDTH = 2400

type DeliveryExportFormat = 'jpg' | 'png'

export type CapturedFloorplanDeliverable = {
  data: string
  height: number
  mime: 'image/jpeg' | 'image/png'
  width: number
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read exported floorplan image'))
    }

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to encode exported floorplan image'))
        return
      }

      const [, base64 = ''] = reader.result.split(',', 2)
      resolve(base64)
    }

    reader.readAsDataURL(blob)
  })
}

export async function captureFloorplanDeliverable(
  format: DeliveryExportFormat,
): Promise<CapturedFloorplanDeliverable> {
  const svg = document.querySelector('svg[data-editor-floorplan-thumbnail="true"]') as SVGSVGElement | null
  if (!svg) {
    throw new Error('2D floorplan is not ready yet.')
  }

  const viewBox = svg.viewBox.baseVal
  const sourceWidth = Math.max(1, viewBox?.width || 1600)
  const sourceHeight = Math.max(1, viewBox?.height || 900)
  const aspectRatio = sourceWidth / sourceHeight
  const outputWidth = DELIVERY_EXPORT_MAX_WIDTH
  const outputHeight = Math.max(1, Math.round(outputWidth / aspectRatio))

  const clonedSvg = svg.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clonedSvg.setAttribute('width', String(sourceWidth))
  clonedSvg.setAttribute('height', String(sourceHeight))
  clonedSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

  const svgMarkup = new XMLSerializer().serializeToString(clonedSvg)
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Failed to load floorplan SVG for export'))
      nextImage.src = svgUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to create floorplan export canvas context')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, outputWidth, outputHeight)
    context.drawImage(image, 0, 0, outputWidth, outputHeight)

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error('Floorplan export failed'))),
        mime,
        format === 'jpg' ? 0.92 : undefined,
      ),
    )

    return {
      data: await blobToBase64(blob),
      mime,
      width: outputWidth,
      height: outputHeight,
    }
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
