'use client'

import { useScene } from '@pascal-app/core'
import {
  Editor,
  type SaveStatus,
  type SceneGraph,
  type SidebarTab,
  ViewerToolbarLeft,
  ViewerToolbarRight,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { exportFilters, saveCanvasAsPng, saveJsonExport } from '../../../packages/editor/src/lib/export'

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
    language: 'zh-CN'
    autosave: boolean
    hostMode: 'electron-webview'
  }
}

type HostCommand = {
  source?: string
  type?: string
  payload?: unknown
}

function getProjectApiPath(projectId: string, action: 'bootstrap' | 'scene' | 'thumbnail') {
  return `/__findtop__/projects/${encodeURIComponent(projectId)}/${action}`
}

function postToHost(type: string, payload?: unknown) {
  window.parent.postMessage({ source: 'findtop-editor', type, payload }, '*')
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
  action: 'bootstrap' | 'scene' | 'thumbnail',
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

  const handleLoad = useCallback(async () => {
    try {
      const bootstrap = await fetchBootstrap()
      bootstrapLoadedRef.current = true
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
        await saveSceneToApi(scene)
      } catch (error) {
        postToHost('error', {
          message: error instanceof Error ? error.message : 'Failed to save scene',
        })
        throw error
      }
    },
    [saveSceneToApi],
  )

  const handleDirty = useCallback(() => {
    postToHost('dirty-changed', true)
  }, [])

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

  useEffect(() => {
    async function saveFromHost() {
      if (!bootstrapLoadedRef.current) return

      postToHost('save-status', 'saving')

      try {
        await persistCurrentScene()
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

    async function exportModelFromHost(format: 'glb' | 'stl' | 'obj') {
      const exportScene = useViewer.getState().exportScene
      if (!exportScene) {
        throw new Error('3D exporter is not ready')
      }

      await exportScene(format)
    }

    async function exportScreenshotFromHost() {
      const canvas = document.querySelector('canvas')
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Viewer canvas is not ready')
      }

      const date = new Date().toISOString().split('T')[0]
      await saveCanvasAsPng(canvas, `screenshot_${date}.png`, exportFilters.png)
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
        const format = (event.data.payload as { format?: 'glb' | 'stl' | 'obj' } | undefined)?.format
        if (!format) return

        void exportModelFromHost(format).catch((error) => {
          postToHost('error', {
            message: error instanceof Error ? error.message : `Host-triggered ${format} export failed`,
          })
        })
        return
      }

      if (event.data.type === 'export-screenshot') {
        void exportScreenshotFromHost().catch((error) => {
          postToHost('error', {
            message: error instanceof Error ? error.message : 'Host-triggered screenshot export failed',
          })
        })
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
  }, [context.host, context.language, context.projectId, persistCurrentScene])

  return (
    <div className="h-screen w-screen">
      <Editor
        layoutVersion="v2"
        projectId={context.projectId || 'findtop'}
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
