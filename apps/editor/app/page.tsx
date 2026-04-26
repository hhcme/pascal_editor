'use client'

import {
  emitter,
  GuideNode,
  type LevelNode,
  ScanNode,
  useScene,
  type ZoneNode,
} from '@pascal-app/core'
import {
  Editor,
  FurnishPanel,
  type FurnishPanelAiTab,
  type SaveStatus,
  type SceneGraph,
  type SidebarTab,
  type SitePanelProps,
  useEditor,
  useUploadStore,
  ViewerToolbarLeft,
  ViewerToolbarRight,
  type ViewMode,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { captureFloorplanDeliverable } from '../../../packages/editor/src/components/editor/delivery-export'
import {
  exportFilters,
  saveCanvasAsPng,
  saveJsonExport,
} from '../../../packages/editor/src/lib/export'
import { useDeliveryStore } from '../../../packages/editor/src/store/use-delivery'
import {
  type AiBuildingFormState,
  type AiBuildingType,
  type AiBuildingVariant,
  applyPlanToScene,
  clampNumber,
  createPlan,
  getAiBuildingPlanSummary,
  getSceneContext,
  getSceneFootprintLimits,
  MIN_DIMENSION,
  type SceneContext,
  snapDimensionToSceneGrid,
} from '../lib/ai-building'
import {
  applyDeliveryPreset,
  captureDeliveryPreset,
  type DeliveryOverlayOptions,
  type DeliveryPreset,
  withTemporaryDeliveryState,
} from '../lib/delivery-workflow'
import { AiBuildingPanel } from './ai-building-panel'

const RECOVERY_DEBOUNCE_MS = 1500

type EditorSidebarTab = SidebarTab & { component: ComponentType }

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

type AiCreateDraftPayload = {
  buildingType?: unknown
  floorCount?: unknown
  area?: unknown
  areaUnit?: unknown
  shape?: unknown
  spaceCounts?: unknown
  requirements?: unknown
}

type AiCreateApplyPayload = {
  draft?: AiCreateDraftPayload
  summary?: unknown
  language?: unknown
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

function isViewMode(value: unknown): value is ViewMode {
  return value === '3d' || value === '2d' || value === 'split' || value === 'tri-view'
}

function isLevelNodeId(value: unknown): value is LevelNode['id'] {
  return typeof value === 'string' && value.startsWith('level_')
}

function getPayloadString(payload: unknown, key: string): string {
  if (!(payload && typeof payload === 'object')) return ''
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRoomSearchValue(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isDeliveryPreset(value: unknown): value is DeliveryPreset {
  if (!isRecord(value)) return false
  if (value.kind !== 'floorplan' && value.kind !== 'camera') return false
  return typeof value.id === 'string' && typeof value.name === 'string'
}

function readDeliveryOverlayOptions(value: unknown): Partial<DeliveryOverlayOptions> | undefined {
  if (!isRecord(value)) return undefined

  const next: Partial<DeliveryOverlayOptions> = {}

  if (typeof value.showRoomName === 'boolean') {
    next.showRoomName = value.showRoomName
  }
  if (typeof value.showRoomArea === 'boolean') {
    next.showRoomArea = value.showRoomArea
  }
  if (typeof value.showWallLength === 'boolean') {
    next.showWallLength = value.showWallLength
  }
  if (typeof value.showPerimeterGuides === 'boolean') {
    next.showPerimeterGuides = value.showPerimeterGuides
  }

  return Object.keys(next).length ? next : undefined
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function mapAiCreateBuildingType(value: unknown): AiBuildingType {
  switch (value) {
    case 'office':
      return 'office'
    case 'commercial':
      return 'shop'
    case 'industrial':
      return 'office'
    case 'residential':
    default:
      return 'residential'
  }
}

function mapAiCreateVariant(value: unknown): AiBuildingVariant {
  switch (value) {
    case 'courtyard':
    case 'u_shape':
      return 'courtyard'
    case 'l_shape':
    case 't_shape':
    case 'freeform':
      return 'daylight'
    case 'rectangle':
    default:
      return 'balanced'
  }
}

function getAiCreateSpaceLabel(spaceKey: string, language: 'zh-CN' | 'en') {
  const labels: Record<string, { zh: string; en: string }> = {
    living_room: { zh: '客厅', en: 'Living Room' },
    dining_room: { zh: '餐厅', en: 'Dining Room' },
    kitchen: { zh: '厨房', en: 'Kitchen' },
    bedroom: { zh: '卧室', en: 'Bedroom' },
    primary_bedroom: { zh: '主卧', en: 'Primary Bedroom' },
    bathroom: { zh: '卫生间', en: 'Bathroom' },
    study: { zh: '书房', en: 'Study' },
    balcony: { zh: '阳台', en: 'Balcony' },
    open_office: { zh: '开放办公', en: 'Open Office' },
    meeting_room: { zh: '会议室', en: 'Meeting Room' },
    reception: { zh: '前台', en: 'Reception' },
    pantry: { zh: '茶水间', en: 'Pantry' },
    archive: { zh: '档案室', en: 'Archive' },
    retail_area: { zh: '营业区', en: 'Retail Area' },
    display_area: { zh: '展示区', en: 'Display Area' },
    cashier: { zh: '收银区', en: 'Cashier' },
    storage: { zh: '仓储', en: 'Storage' },
    production: { zh: '生产区', en: 'Production Area' },
    equipment_room: { zh: '设备间', en: 'Mechanical Room' },
    entry: { zh: '入口', en: 'Entry' },
    corridor: { zh: '走廊', en: 'Corridor' },
    stairs: { zh: '楼梯', en: 'Stairs' },
    elevator: { zh: '电梯', en: 'Elevator' },
    garage: { zh: '车库', en: 'Garage' },
  }
  const label = labels[spaceKey]
  if (!label) return spaceKey.replace(/_/g, ' ')
  return language === 'en' ? label.en : label.zh
}

function summarizeAiCreateSpaces(spaceCounts: unknown, language: 'zh-CN' | 'en') {
  if (!isRecord(spaceCounts)) return ''

  return Object.entries(spaceCounts)
    .filter(([, count]) => normalizePositiveNumber(count, 0) > 0)
    .map(([spaceKey, count]) => {
      const normalizedCount = Math.round(normalizePositiveNumber(count, 1))
      const label = getAiCreateSpaceLabel(spaceKey, language)
      return normalizedCount > 1 ? `${label} x${normalizedCount}` : label
    })
    .join(language === 'en' ? ', ' : '、')
}

function getAiCreateRequestedSpaces(
  spaceCounts: unknown,
  language: 'zh-CN' | 'en',
): NonNullable<AiBuildingFormState['requestedSpaces']> {
  if (!isRecord(spaceCounts)) return []

  return Object.entries(spaceCounts)
    .map(([spaceKey, count]) => ({
      key: spaceKey,
      label: getAiCreateSpaceLabel(spaceKey, language),
      count: Math.round(normalizePositiveNumber(count, 0)),
    }))
    .filter((space) => space.count > 0)
}

function convertAiCreateDraftToForm(
  payload: AiCreateApplyPayload,
  language: 'zh-CN' | 'en',
  sceneContext: SceneContext,
): AiBuildingFormState | null {
  const draft = payload.draft
  if (!isRecord(draft)) return null

  const buildingType = mapAiCreateBuildingType(draft.buildingType)
  const floorCount = Math.round(clampNumber(normalizePositiveNumber(draft.floorCount, 1), 1, 8))
  const area = normalizePositiveNumber(draft.area, 120)
  const areaSqm = draft.areaUnit === 'sqft' ? area * 0.092903 : area
  const footprintArea = Math.max(36, areaSqm / Math.max(1, floorCount))
  const aspect =
    draft.shape === 'freeform' || draft.shape === 'l_shape' || draft.shape === 't_shape'
      ? 1.38
      : draft.shape === 'courtyard' || draft.shape === 'u_shape'
        ? 1.12
        : 1.25
  const footprintLimits = getSceneFootprintLimits(sceneContext, buildingType)
  const maxWidth = footprintLimits.preferredMaxWidth
  const maxDepth = footprintLimits.preferredMaxDepth
  const width =
    Math.round(clampNumber(Math.sqrt(footprintArea * aspect), MIN_DIMENSION, maxWidth) * 10) / 10
  const depth = Math.round(clampNumber(footprintArea / width, MIN_DIMENSION, maxDepth) * 10) / 10
  const spaceSummary = summarizeAiCreateSpaces(draft.spaceCounts, language)
  const requestedSpaces = getAiCreateRequestedSpaces(draft.spaceCounts, language)
  const requirements = typeof draft.requirements === 'string' ? draft.requirements.trim() : ''
  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : ''
  const promptParts =
    language === 'en'
      ? [
          summary,
          spaceSummary ? `Spaces: ${spaceSummary}` : '',
          requirements ? `Additional requirements: ${requirements}` : '',
        ]
      : [
          summary,
          spaceSummary ? `功能空间：${spaceSummary}` : '',
          requirements ? `额外要求：${requirements}` : '',
        ]

  return {
    buildingType,
    style: 'modern',
    variant: mapAiCreateVariant(draft.shape),
    floors: floorCount,
    width: snapDimensionToSceneGrid(width, sceneContext, maxWidth),
    depth: snapDimensionToSceneGrid(depth, sceneContext, maxDepth),
    prompt: promptParts.filter(Boolean).join(language === 'en' ? '. ' : '。'),
    requestedSpaces,
  }
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

async function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read local file'))
    }

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to encode local file'))
        return
      }

      const [, base64 = ''] = reader.result.split(',', 2)
      resolve(base64)
    }

    reader.readAsDataURL(file)
  })
}

function createFileFromBase64(data: string, fileName: string, mime: string): File {
  const binary = window.atob(data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new File([bytes], fileName, { type: mime })
}

async function rasterizeGuidePdfFile(file: File): Promise<{
  assetSource: { originalFileName: string; type: 'pdf-rasterized' }
  file: File
}> {
  const editorApi = (
    window as Window & {
      editorAPI?: {
        rasterizeGuidePdf?: (
          data: string,
          fileName?: string,
        ) => Promise<{
          data: string
          height: number
          mime: 'image/png'
          width: number
        }>
      }
    }
  ).editorAPI

  if (!editorApi?.rasterizeGuidePdf) {
    throw new Error('PDF rasterization is unavailable in this host environment.')
  }

  const base64 = await readFileAsBase64(file)
  const rasterized = await editorApi.rasterizeGuidePdf(base64, file.name)
  const pngName = `${getFileDisplayName(file.name)}.png`

  return {
    assetSource: {
      type: 'pdf-rasterized',
      originalFileName: file.name,
    },
    file: createFileFromBase64(rasterized.data, pngName, rasterized.mime),
  }
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
  const language = context.language === 'en' ? 'en' : 'zh-CN'
  const bootstrapLoadedRef = useRef(false)
  const recoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false)
  const sidebarTabs = useMemo<EditorSidebarTab[]>(() => {
    function AiBuildingSidebarPanel() {
      return <AiBuildingPanel language={language} />
    }

    function FurnishSidebarPanel() {
      return (
        <FurnishPanel
          language={language}
          onOpenAiWorkspace={(tab: FurnishPanelAiTab) => {
            postToHost('open-ai-workspace', { tab })
          }}
        />
      )
    }

    return [
      {
        id: 'site',
        label: language === 'zh-CN' ? '场景' : 'Scene',
        component: () => null,
      },
      {
        id: 'furnish',
        label: language === 'zh-CN' ? '布置' : 'Furnish',
        component: FurnishSidebarPanel,
      },
      {
        id: 'ai-building',
        label: language === 'zh-CN' ? '方案评估' : 'Plan Analysis',
        component: AiBuildingSidebarPanel,
      },
    ]
  }, [language])

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
        let uploadFile = file
        let guideAssetSource:
          | {
              originalFileName: string
              type: 'image' | 'pdf-rasterized'
            }
          | undefined

        if (type === 'guide' && file.name.toLowerCase().endsWith('.pdf')) {
          uploadStore.setProgress(levelId, 40)
          const rasterized = await rasterizeGuidePdfFile(file)
          uploadFile = rasterized.file
          guideAssetSource = rasterized.assetSource
          uploadStore.setProgress(levelId, 60)
        } else if (type === 'guide') {
          guideAssetSource = {
            type: 'image',
            originalFileName: file.name,
          }
        }

        const asset = await uploadProjectAsset(projectId, uploadFile, type)

        uploadStore.setProgress(levelId, 85)
        uploadStore.setStatus(levelId, 'confirming')

        const node =
          asset.kind === 'scan'
            ? ScanNode.parse({
                name: getFileDisplayName(asset.originalFileName),
                url: asset.url,
              })
            : GuideNode.parse({
                name: getFileDisplayName(file.name),
                url: asset.url,
                assetSource: guideAssetSource,
              })

        useScene.getState().createNode(node, levelId as LevelNode['id'])

        if (asset.kind === 'scan') {
          useEditor.getState().setSelectedReferenceId(null)
          useViewer.getState().setSelection({
            levelId: levelId as LevelNode['id'],
            selectedIds: [node.id],
          })
          useViewer.getState().setShowScans(true)
        } else {
          const guideNode = node as GuideNode
          const editorState = useEditor.getState()
          const currentViewMode = editorState.viewMode

          editorState.setSelectedReferenceId(guideNode.id)
          useViewer.getState().setSelection({
            levelId: levelId as LevelNode['id'],
          })
          if (!(currentViewMode === '2d' || currentViewMode === 'split')) {
            editorState.setViewMode('split')
          }
          useDeliveryStore.getState().requestCalibrationPrompt(guideNode.id)
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

    async function exportDeliverableFromHost(payload: unknown) {
      const options = isRecord(payload) ? payload : {}
      const format =
        options.format === 'png' || options.format === 'jpg' || options.format === 'pdf'
          ? options.format
          : null

      if (!format) {
        throw new Error('Invalid deliverable export format')
      }

      const preset = isDeliveryPreset(options.preset) ? options.preset : null
      const overlays = readDeliveryOverlayOptions(options.overlays)
      const requestedLevelId = isLevelNodeId(options.levelId) ? options.levelId : null
      const presetId = typeof options.presetId === 'string' ? options.presetId : null

      const artifact = await withTemporaryDeliveryState(
        {
          preset,
          includeCamera: false,
          levelId: requestedLevelId,
          overlays,
          viewMode: preset?.viewMode ?? '2d',
        },
        async () => {
          const captured = await captureFloorplanDeliverable(format === 'pdf' ? 'jpg' : format)
          const activeLevelId = useViewer.getState().selection.levelId ?? requestedLevelId
          const levelNode = activeLevelId
            ? (useScene.getState().nodes[activeLevelId] as LevelNode | undefined)
            : undefined

          return {
            ...captured,
            metadata: {
              deliverableKind: 'floorplan' as const,
              levelId: activeLevelId,
              levelName: levelNode?.type === 'level' ? (levelNode.name ?? null) : null,
              overlays: {
                ...useDeliveryStore.getState().overlays,
              },
              presetId,
            },
          }
        },
      )

      return {
        artifact,
        format,
      }
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

    function focusWalkthroughRoomFromHost(payload: unknown) {
      const roomName = getPayloadString(payload, 'roomName')
      if (!roomName) return

      const normalizedRoomName = normalizeRoomSearchValue(roomName)
      const { nodes } = useScene.getState()
      const zone = Object.values(nodes).find((node): node is ZoneNode => {
        if (node.type !== 'zone') return false
        const name = normalizeRoomSearchValue(String(node.name ?? ''))
        return name === normalizedRoomName || name.includes(normalizedRoomName)
      })

      useEditor.getState().setViewMode('3d')

      if (!zone) return

      useViewer.getState().setSelection({ zoneId: zone.id })
      requestAnimationFrame(() => {
        emitter.emit('camera-controls:focus', { nodeId: zone.id })
      })
    }

    function applyAiCreateDraftFromHost(payload: unknown) {
      try {
        const commandPayload = isRecord(payload) ? (payload as AiCreateApplyPayload) : {}
        const commandLanguage: 'zh-CN' | 'en' =
          commandPayload.language === 'en' || context.language === 'en' ? 'en' : 'zh-CN'
        const scene = useScene.getState()
        const selectedBuildingId = useViewer.getState().selection.buildingId
        const sceneContext = getSceneContext(scene.nodes, scene.rootNodeIds, selectedBuildingId)
        const form = convertAiCreateDraftToForm(commandPayload, commandLanguage, sceneContext)

        if (!form) {
          postToHost('ai-create-apply-result', {
            status: 'error',
            message: 'Invalid AI create draft payload',
          })
          return
        }

        const plan = createPlan(form, commandLanguage, sceneContext)
        const result = applyPlanToScene(plan, sceneContext)
        const analysisSummary = getAiBuildingPlanSummary(plan, commandLanguage)

        if (result.blocked) {
          postToHost('ai-create-apply-result', {
            status: 'error',
            planId: plan.id,
            message: result.message ?? '方案未通过可建造性硬验收。',
            analysisSummary,
            constructability: result.constructability,
          })
          return
        }

        postToHost('ai-create-apply-result', {
          status: 'success',
          planId: plan.id,
          wallCount: result.wallCount,
          floorCount: result.floorCount,
          createdDefaultBuilding: result.createdDefaultBuilding,
          analysisSummary,
        })
      } catch (error) {
        postToHost('ai-create-apply-result', {
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to apply AI create draft',
        })
      }
    }

    function captureDeliveryPresetFromHost(payload: unknown) {
      const options = isRecord(payload) ? payload : {}
      const requestId = typeof options.requestId === 'string' ? options.requestId : ''
      if (!requestId) return

      const kind = options.kind === 'camera' ? 'camera' : 'floorplan'
      const name =
        typeof options.name === 'string' && options.name.trim()
          ? options.name.trim()
          : kind === 'camera'
            ? 'Camera Preset'
            : 'Floorplan Preset'

      try {
        const preset = captureDeliveryPreset({
          createdAt: typeof options.createdAt === 'string' ? options.createdAt : undefined,
          kind,
          name,
          exportFormat: typeof options.exportFormat === 'string' ? options.exportFormat : undefined,
          presetId: typeof options.presetId === 'string' ? options.presetId : undefined,
        })

        postToHost('delivery-preset-captured', {
          requestId,
          status: 'success',
          preset,
        })
      } catch (error) {
        postToHost('delivery-preset-captured', {
          requestId,
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to capture delivery preset',
        })
      }
    }

    function applyDeliveryPresetFromHost(payload: unknown) {
      const preset =
        isRecord(payload) && isDeliveryPreset(payload.preset)
          ? payload.preset
          : isDeliveryPreset(payload)
            ? payload
            : null
      if (!preset) return

      void applyDeliveryPreset(preset).catch((error) => {
        postToHost('error', {
          message: error instanceof Error ? error.message : 'Failed to apply delivery preset',
        })
      })
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
              category: 'model',
              status: filePath ? 'success' : 'cancelled',
              format,
              filePath,
            })
          })
          .catch((error) => {
            postToHost('export-result', {
              category: 'model',
              status: 'error',
              format,
              message:
                error instanceof Error ? error.message : `Host-triggered ${format} export failed`,
            })
          })
        return
      }

      if (event.data.type === 'export-deliverable') {
        void exportDeliverableFromHost(event.data.payload)
          .then((result) => {
            postToHost('export-result', {
              category: 'deliverable',
              status: 'success',
              format: result.format,
              artifact: result.artifact,
            })
          })
          .catch((error) => {
            postToHost('export-result', {
              category: 'deliverable',
              status: 'error',
              format:
                isRecord(event.data.payload) && typeof event.data.payload.format === 'string'
                  ? event.data.payload.format
                  : undefined,
              message:
                error instanceof Error ? error.message : 'Host-triggered deliverable export failed',
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

      if (event.data.type === 'set-view-mode') {
        const payload =
          event.data.payload && typeof event.data.payload === 'object'
            ? (event.data.payload as { viewMode?: unknown })
            : {}
        if (isViewMode(payload.viewMode)) {
          useEditor.getState().setViewMode(payload.viewMode)
        }
        return
      }

      if (event.data.type === 'capture-delivery-preset') {
        captureDeliveryPresetFromHost(event.data.payload)
        return
      }

      if (event.data.type === 'apply-delivery-preset') {
        applyDeliveryPresetFromHost(event.data.payload)
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
        return
      }

      if (event.data.type === 'apply-ai-create-draft') {
        applyAiCreateDraftFromHost(event.data.payload)
        return
      }

      if (event.data.type === 'enter-walkthrough-room') {
        focusWalkthroughRoomFromHost(event.data.payload)
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
        sidebarTabs={sidebarTabs}
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
