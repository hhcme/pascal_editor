'use client'

import { emitter, GuideNode, type LevelNode, ScanNode, useScene } from '@pascal-app/core'
import {
  Editor,
  type SaveStatus,
  type SceneGraph,
  type SidebarTab,
  type SitePanelProps,
  useUploadStore,
  ViewerToolbarLeft,
  ViewerToolbarRight,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  exportFilters,
  saveCanvasAsPng,
  saveJsonExport,
} from '../../../packages/editor/src/lib/export'

const RECOVERY_DEBOUNCE_MS = 1500

const SIDEBAR_TABS: (SidebarTab & { component: React.ComponentType })[] = [
  { id: 'site', label: 'Scene', component: () => null },
]

type EditorBootstrapPayload = {
  project: {
    id: string
    name: string
    updatedAt: string
  }
  scene: SceneGraph
  config: {
    language: 'zh-CN' | 'en'
    autosave: boolean
    hostMode: 'electron-webview'
  }
}

type HostCommand = {
  source?: string
  type?: string
  payload?: unknown
}

type ProjectAssetKind = 'scan' | 'guide'

type UploadedProjectAsset = {
  kind: ProjectAssetKind
  originalFileName: string
  fileName: string
  url: string
}

function getProjectApiPath(
  projectId: string,
  action: 'bootstrap' | 'scene' | 'thumbnail' | 'recovery',
) {
  return `/__findtop__/projects/${encodeURIComponent(projectId)}/${action}`
}

function getProjectAssetsApiPath(projectId: string) {
  return `/__findtop__/projects/${encodeURIComponent(projectId)}/assets`
}

function postToHost(type: string, payload?: unknown) {
  window.parent.postMessage({ source: 'findtop-editor', type, payload }, '*')
}

function getFileDisplayName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || fileName
}

function isUploadedProjectAsset(value: unknown): value is UploadedProjectAsset {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  return (
    !!candidate &&
    (candidate.kind === 'scan' || candidate.kind === 'guide') &&
    typeof candidate.originalFileName === 'string' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.url === 'string'
  )
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === 'string' ? body.error : fallback
  } catch {
    return fallback
  }
}

async function uploadProjectAsset(
  projectId: string,
  file: File,
  kind: ProjectAssetKind,
): Promise<UploadedProjectAsset> {
  const params = new URLSearchParams({
    fileName: file.name,
    kind,
  })

  const response = await fetch(`${getProjectAssetsApiPath(projectId)}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, `Asset upload failed: ${response.status}`))
  }

  const payload = await response.json()
  if (!isUploadedProjectAsset(payload)) {
    throw new Error('Asset upload returned an invalid response')
  }

  return payload
}

async function readCanvasAsPng(canvas: HTMLCanvasElement): Promise<{
  data: string
  width: number
  height: number
}> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) {
    throw new Error('Failed to capture canvas as PNG')
  }

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read canvas PNG'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to encode canvas PNG'))
        return
      }
      const [, base64 = ''] = reader.result.split(',', 2)
      resolve(base64)
    }
    reader.readAsDataURL(blob)
  })

  return {
    data,
    width: canvas.width,
    height: canvas.height,
  }
}

function readProjectContext() {
  if (typeof window === 'undefined') {
    return {
      projectId: '',
      language: 'zh-CN',
      host: 'findtop',
    }
  }

  const params = new URLSearchParams(window.location.search)
  return {
    projectId: params.get('projectId') || '',
    language: params.get('lang') || 'zh-CN',
    host: params.get('host') || 'findtop',
  }
}

function normalizeScene(scene: unknown): SceneGraph {
  const candidate = scene && typeof scene === 'object' ? (scene as Record<string, unknown>) : {}

  return {
    nodes:
      candidate.nodes && typeof candidate.nodes === 'object' && !Array.isArray(candidate.nodes)
        ? (candidate.nodes as Record<string, unknown>)
        : {},
    rootNodeIds: Array.isArray(candidate.rootNodeIds)
      ? candidate.rootNodeIds.filter((value): value is string => typeof value === 'string')
      : [],
  }
}

async function requestProjectJson<TResponse>(
  projectId: string,
  action: 'bootstrap' | 'scene' | 'thumbnail' | 'recovery',
  init?: RequestInit,
): Promise<TResponse> {
  if (!projectId) {
    throw new Error('Missing projectId in editor URL')
  }

  const response = await fetch(getProjectApiPath(projectId, action), {
    cache: 'no-store',
    ...init,
  })

  if (!response.ok) {
    throw new Error(`${action} request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return null as TResponse
  }

  return (await response.json()) as TResponse
}

export default function Home() {
  const context = useMemo(readProjectContext, [])
  const bootstrapLoadedRef = useRef(false)
  const recoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false)

  useEffect(() => {
    const viewer = useViewer.getState()
    if (viewer.theme !== 'light') {
      viewer.setTheme('light')
    }
  }, [])

  const fetchBootstrap = useCallback(async (): Promise<EditorBootstrapPayload> => {
    return requestProjectJson<EditorBootstrapPayload>(context.projectId, 'bootstrap')
  }, [context.projectId])

  const saveSceneToApi = useCallback(
    async (scene: SceneGraph) => {
      await requestProjectJson<{ ok: true; updatedAt: string }>(context.projectId, 'scene', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scene),
      })
    },
    [context.projectId],
  )

  const uploadThumbnail = useCallback(
    async (dataUrl: string) => {
      if (!context.projectId) return

      await requestProjectJson<{ ok: true }>(context.projectId, 'thumbnail', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataUrl }),
      })
    },
    [context.projectId],
  )

  const persistRecovery = useCallback(async () => {
    if (!bootstrapLoadedRef.current) return

    const { nodes, rootNodeIds } = useScene.getState()
    const scene = { nodes, rootNodeIds } as SceneGraph
    await requestProjectJson<{ ok: true; updatedAt: string }>(context.projectId, 'recovery', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scene }),
    })
  }, [context.projectId])

  const scheduleRecoveryPersist = useCallback(() => {
    if (recoveryTimeoutRef.current) {
      clearTimeout(recoveryTimeoutRef.current)
    }

    recoveryTimeoutRef.current = setTimeout(() => {
      recoveryTimeoutRef.current = undefined
      void persistRecovery().catch((error) => {
        postToHost('error', {
          message: error instanceof Error ? error.message : 'Failed to persist recovery file',
        })
      })
    }, RECOVERY_DEBOUNCE_MS)
  }, [persistRecovery])

  const clearScheduledRecoveryPersist = useCallback(() => {
    if (!recoveryTimeoutRef.current) return
    clearTimeout(recoveryTimeoutRef.current)
    recoveryTimeoutRef.current = undefined
  }, [])

  const handleLoad = useCallback(async () => {
    try {
      const bootstrap = await fetchBootstrap()
      bootstrapLoadedRef.current = true
      setAutoSaveEnabled(bootstrap.config.autosave)
      return normalizeScene(bootstrap.scene)
    } catch (error) {
      bootstrapLoadedRef.current = false
      postToHost('error', {
        message: error instanceof Error ? error.message : 'Failed to load bootstrap payload',
      })
      return null
    }
  }, [fetchBootstrap])

  const handleSave = useCallback(
    async (scene: SceneGraph) => {
      try {
        clearScheduledRecoveryPersist()
        await saveSceneToApi(scene)
        emitter.emit('camera-controls:generate-thumbnail', { projectId: context.projectId })
      } catch (error) {
        postToHost('error', {
          message: error instanceof Error ? error.message : 'Failed to save scene',
        })
        throw error
      }
    },
    [clearScheduledRecoveryPersist, context.projectId, saveSceneToApi],
  )

  const handleDirty = useCallback(() => {
    postToHost('dirty-changed', true)
    scheduleRecoveryPersist()
  }, [scheduleRecoveryPersist])

  const handleSaveStatusChange = useCallback((status: SaveStatus) => {
    postToHost('save-status', status)
  }, [])

  const persistCurrentScene = useCallback(async () => {
    const { nodes, rootNodeIds } = useScene.getState()
    const scene = { nodes, rootNodeIds } as SceneGraph
    await saveSceneToApi(scene)
  }, [saveSceneToApi])

  const handleThumbnailCapture = useCallback(
    (blob: Blob) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        if (!dataUrl) return

        void uploadThumbnail(dataUrl).catch((error) => {
          postToHost('error', {
            message: error instanceof Error ? error.message : 'Failed to upload thumbnail',
          })
        })
      }
      reader.readAsDataURL(blob)
    },
    [uploadThumbnail],
  )

  const handleUploadAsset = useCallback<NonNullable<SitePanelProps['onUploadAsset']>>(
    async (projectId, levelId, file, type) => {
      const uploadStore = useUploadStore.getState()
      uploadStore.startUpload(levelId, type, file.name)

      try {
        uploadStore.setStatus(levelId, 'uploading')
        uploadStore.setProgress(levelId, 20)

        const asset = await uploadProjectAsset(projectId, file, type)

        uploadStore.setProgress(levelId, 85)
        uploadStore.setStatus(levelId, 'confirming')

        const node =
          asset.kind === 'scan'
            ? ScanNode.parse({
                name: getFileDisplayName(asset.originalFileName),
                url: asset.url,
              })
            : GuideNode.parse({
                name: getFileDisplayName(asset.originalFileName),
                url: asset.url,
              })

        useScene.getState().createNode(node, levelId as LevelNode['id'])
        useViewer.getState().setSelection({
          levelId: levelId as LevelNode['id'],
          selectedIds: [node.id],
        })

        if (asset.kind === 'scan') {
          useViewer.getState().setShowScans(true)
        } else {
          useViewer.getState().setShowGuides(true)
        }

        uploadStore.setProgress(levelId, 100)
        uploadStore.setResult(levelId, asset.url)
      } catch (error) {
        uploadStore.setError(
          levelId,
          error instanceof Error ? error.message : 'Asset upload failed.',
        )
      }
    },
    [],
  )

  const handleDeleteAsset = useCallback<NonNullable<SitePanelProps['onDeleteAsset']>>(
    (projectId, url) => {
      if (!url.startsWith(`${getProjectAssetsApiPath(projectId)}/`)) return

      void fetch(url, { method: 'DELETE' })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await readApiError(response, `Asset delete failed: ${response.status}`))
          }
        })
        .catch((error) => {
          postToHost('error', {
            message: error instanceof Error ? error.message : 'Failed to delete project asset',
          })
        })
    },
    [],
  )

  useEffect(() => {
    const uploadStore = useUploadStore.getState()
    uploadStore.registerUploadHandler(handleUploadAsset)

    return () => {
      useUploadStore.getState().unregisterUploadHandler()
    }
  }, [handleUploadAsset])

  const sitePanelProps = useMemo<SitePanelProps>(
    () => ({
      projectId: context.projectId || undefined,
      onUploadAsset: handleUploadAsset,
      onDeleteAsset: handleDeleteAsset,
    }),
    [context.projectId, handleDeleteAsset, handleUploadAsset],
  )

  useEffect(() => {
    async function saveFromHost() {
      if (!bootstrapLoadedRef.current) return

      postToHost('save-status', 'saving')

      try {
        clearScheduledRecoveryPersist()
        await persistCurrentScene()
        emitter.emit('camera-controls:generate-thumbnail', { projectId: context.projectId })
        postToHost('save-status', 'saved')
      } catch (error) {
        postToHost('error', {
          message: error instanceof Error ? error.message : 'Host-triggered save failed',
        })
        postToHost('save-status', 'error')
      }
    }

    async function exportSceneJsonFromHost() {
      const { nodes, rootNodeIds } = useScene.getState()
      const date = new Date().toISOString().split('T')[0]
      await saveJsonExport({ nodes, rootNodeIds }, `scene_${date}.json`, exportFilters.json)
    }

    async function exportModelFromHost(options: {
      format: 'glb' | 'stl' | 'obj'
      filename?: string
      directoryPath?: string
    }) {
      const exportScene = useViewer.getState().exportScene
      if (!exportScene) {
        throw new Error('3D exporter is not ready')
      }

      return exportScene(options)
    }

    async function exportScreenshotFromHost() {
      const canvas = document.querySelector('canvas')
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Viewer canvas is not ready')
      }

      const date = new Date().toISOString().split('T')[0]
      await saveCanvasAsPng(canvas, `screenshot_${date}.png`, exportFilters.png)
    }

    async function captureAiRenderSourceFromHost(payload: {
      requestId?: string
      renderType?: 'exterior' | 'interior' | 'garden'
    }) {
      const requestId = payload.requestId
      if (!requestId) return

      try {
        const canvas = document.querySelector('canvas')
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error('Viewer canvas is not ready')
        }

        const image = await readCanvasAsPng(canvas)
        postToHost('ai-render-source-result', {
          requestId,
          status: 'success',
          image: {
            ...image,
            mime: 'image/png',
          },
          camera: null,
        })
      } catch (error) {
        postToHost('ai-render-source-result', {
          requestId,
          status: 'error',
          message: error instanceof Error ? error.message : 'AI render source capture failed',
        })
      }
    }

    function onMessage(event: MessageEvent<HostCommand>) {
      if (event.data?.source !== 'findtop-host') return
      if (event.data.type === 'save') {
        void saveFromHost()
        return
      }

      if (event.data.type === 'export-json') {
        void exportSceneJsonFromHost().catch((error) => {
          postToHost('error', {
            message: error instanceof Error ? error.message : 'Host-triggered JSON export failed',
          })
        })
        return
      }

      if (event.data.type === 'export-model') {
        const payload = event.data.payload as
          | {
              format?: 'glb' | 'stl' | 'obj'
              filename?: string
              directoryPath?: string
            }
          | undefined
        const format = payload?.format
        if (!format) return

        void exportModelFromHost({
          format,
          filename: payload?.filename,
          directoryPath: payload?.directoryPath,
        })
          .then((filePath) => {
            postToHost('export-result', {
              status: filePath ? 'success' : 'cancelled',
              format,
              filePath,
            })
          })
          .catch((error) => {
            postToHost('export-result', {
              status: 'error',
              format,
              message:
                error instanceof Error ? error.message : `Host-triggered ${format} export failed`,
            })
          })
        return
      }

      if (event.data.type === 'export-screenshot') {
        void exportScreenshotFromHost().catch((error) => {
          postToHost('error', {
            message:
              error instanceof Error ? error.message : 'Host-triggered screenshot export failed',
          })
        })
        return
      }

      if (event.data.type === 'capture-ai-render-source') {
        const payload =
          event.data.payload && typeof event.data.payload === 'object'
            ? (event.data.payload as {
                requestId?: string
                renderType?: 'exterior' | 'interior' | 'garden'
              })
            : {}
        void captureAiRenderSourceFromHost(payload)
      }
    }

    window.addEventListener('message', onMessage)
    postToHost('ready', {
      projectId: context.projectId,
      language: context.language,
      host: context.host,
    })

    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [
    clearScheduledRecoveryPersist,
    context.host,
    context.language,
    context.projectId,
    persistCurrentScene,
  ])

  useEffect(() => {
    return () => {
      if (recoveryTimeoutRef.current) {
        clearTimeout(recoveryTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="h-screen w-screen">
      <Editor
        layoutVersion="v2"
        projectId={context.projectId || null}
        autoSaveEnabled={autoSaveEnabled}
        sitePanelProps={sitePanelProps}
        sidebarTabs={SIDEBAR_TABS}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
        onLoad={handleLoad}
        onSave={handleSave}
        onDirty={handleDirty}
        onSaveStatusChange={handleSaveStatusChange}
        onThumbnailCapture={handleThumbnailCapture}
      />
    </div>
  )
}
