'use client'

type ExportFilter = {
  name: string
  extensions: string[]
}

type ExportFileOptions = {
  data: string
  filename: string
  filters?: ExportFilter[]
}

type ExportHostApi = {
  exportFile?: (options: ExportFileOptions) => Promise<string | null>
}

const getExportHostApi = (): ExportHostApi | undefined => {
  if (typeof window === 'undefined') {
    return undefined
  }

  const scopedWindow = window as Window & {
    editorAPI?: ExportHostApi
    electronAPI?: ExportHostApi
  }

  return scopedWindow.editorAPI ?? scopedWindow.electronAPI
}

const blobToBase64 = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read export blob'))
    }

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to encode export blob'))
        return
      }

      const [, base64 = ''] = reader.result.split(',', 2)
      resolve(base64)
    }

    reader.readAsDataURL(blob)
  })
}

export const exportFilters = {
  json: [{ name: 'JSON 场景文件', extensions: ['json'] }],
  png: [{ name: 'PNG 图片', extensions: ['png'] }],
  glb: [{ name: 'GLB 3D 模型', extensions: ['glb'] }],
  stl: [{ name: 'STL 3D 模型', extensions: ['stl'] }],
  obj: [{ name: 'OBJ 3D 模型', extensions: ['obj'] }],
} satisfies Record<string, ExportFilter[]>

export async function saveBlobExport(
  blob: Blob,
  filename: string,
  filters?: ExportFilter[],
): Promise<string | null> {
  const hostApi = getExportHostApi()

  if (hostApi?.exportFile) {
    const data = await blobToBase64(blob)
    const filePath = await hostApi.exportFile({ data, filename, filters })
    if (filePath) {
      return filePath
    }
  }

  downloadBlob(blob, filename)
  return null
}

export async function saveJsonExport(
  value: unknown,
  filename: string,
  filters: ExportFilter[] = exportFilters.json,
): Promise<string | null> {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  return saveBlobExport(blob, filename, filters)
}

export async function saveCanvasAsPng(
  canvas: HTMLCanvasElement,
  filename: string,
  filters: ExportFilter[] = exportFilters.png,
): Promise<string | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))

  if (!blob) {
    throw new Error('Failed to capture canvas screenshot')
  }

  return saveBlobExport(blob, filename, filters)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
