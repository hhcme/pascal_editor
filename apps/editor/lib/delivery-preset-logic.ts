import type {
  AnyNodeId,
  BaseNode,
  BuildingNode,
  CameraControlEvent,
  LevelNode,
  ZoneNode,
} from '@pascal-app/core'
import type { DeliveryOverlayOptions } from '../../../packages/editor/src/store/use-delivery'

export type { DeliveryOverlayOptions } from '../../../packages/editor/src/store/use-delivery'

export type DeliveryPresetKind = 'camera' | 'floorplan'
export type DeliveryViewMode = '3d' | '2d' | 'split' | 'tri-view'
export type DeliveryNodeId = AnyNodeId
export type DeliveryLevelId = LevelNode['id']

export type DeliveryCameraSnapshot = {
  mode: 'orthographic' | 'perspective'
  nodeId?: DeliveryNodeId | null
  position: [number, number, number]
  target: [number, number, number]
  zoom?: number
}

type DeliveryPresetBase = {
  createdAt: string
  exportFormat?: string
  id: string
  name: string
  updatedAt: string
  viewMode: DeliveryViewMode
}

export type DeliveryFloorplanPreset = DeliveryPresetBase & {
  kind: 'floorplan'
  levelId?: DeliveryLevelId | null
  overlays: DeliveryOverlayOptions
}

export type DeliveryCameraPreset = DeliveryPresetBase & {
  camera: DeliveryCameraSnapshot
  kind: 'camera'
  levelId?: DeliveryLevelId | null
  overlays: DeliveryOverlayOptions
}

export type DeliveryPreset = DeliveryFloorplanPreset | DeliveryCameraPreset

export type DeliveryPresetCaptureRequest = {
  createdAt?: string
  exportFormat?: string
  kind: DeliveryPresetKind
  name: string
  presetId?: string
}

export type DeliveryStateSnapshot = {
  levelId: DeliveryLevelId | null
  overlays: DeliveryOverlayOptions
  viewMode: DeliveryViewMode
}

export type DeliverySelectionState = {
  buildingId: BuildingNode['id'] | null
  levelId: DeliveryLevelId | null
  selectedIds: BaseNode['id'][]
  zoneId: ZoneNode['id'] | null
}

export type DeliverySceneNodeLike = {
  camera?: DeliveryCameraSnapshot | null
}

export type DeliveryCameraSource = {
  camera: DeliveryCameraSnapshot
  nodeId: DeliveryNodeId
}

export type DeliveryCameraEvent =
  | {
      payload: CameraControlEvent
      type: 'camera-controls:view'
    }
  | {
      payload: {
        position: [number, number, number]
        target: [number, number, number]
      }
      type: 'camera:go-to-position'
    }

export const DEFAULT_DELIVERY_OVERLAYS: DeliveryOverlayOptions = {
  showRoomName: true,
  showRoomArea: false,
  showWallLength: true,
  showPerimeterGuides: true,
}

function createDeliveryPresetId() {
  return `delivery-preset:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeDeliveryOverlays(
  overlays: Partial<DeliveryOverlayOptions> | undefined | null,
): DeliveryOverlayOptions {
  return {
    ...DEFAULT_DELIVERY_OVERLAYS,
    ...overlays,
  }
}

export function resolveDeliveryLevelSelection(
  currentSelection: DeliverySelectionState,
  levelId: DeliveryLevelId | null | undefined,
) {
  if (!levelId || currentSelection.levelId === levelId) {
    return null
  }

  return {
    ...currentSelection,
    levelId,
    selectedIds: [],
    zoneId: null,
  } satisfies DeliverySelectionState
}

export function getDeliveryCameraPresetSource(
  selection: DeliverySelectionState,
  nodes: Record<DeliveryNodeId, DeliverySceneNodeLike>,
): DeliveryCameraSource | null {
  const candidateIds = [
    selection.zoneId,
    ...selection.selectedIds,
    selection.levelId,
    selection.buildingId,
  ].filter((value): value is DeliveryNodeId => typeof value === 'string' && value.length > 0)

  for (const candidateId of candidateIds) {
    const node = nodes[candidateId]
    if (node?.camera) {
      return {
        nodeId: candidateId,
        camera: node.camera,
      }
    }
  }

  return null
}

export function buildDeliveryPreset(params: {
  cameraSource?: DeliveryCameraSource | null
  createId?: () => string
  now?: string
  request: DeliveryPresetCaptureRequest
  state: DeliveryStateSnapshot
}): DeliveryPreset {
  const now = params.now ?? new Date().toISOString()
  const createId = params.createId ?? createDeliveryPresetId
  const base = {
    id:
      typeof params.request.presetId === 'string' && params.request.presetId.trim()
        ? params.request.presetId
        : createId(),
    name: params.request.name,
    kind: params.request.kind,
    createdAt:
      typeof params.request.createdAt === 'string' && params.request.createdAt.trim()
        ? params.request.createdAt
        : now,
    updatedAt: now,
    viewMode: params.state.viewMode,
    levelId: params.state.levelId,
    overlays: normalizeDeliveryOverlays(params.state.overlays),
    exportFormat: params.request.exportFormat,
  } as const

  if (params.request.kind === 'floorplan') {
    return {
      ...base,
      kind: 'floorplan',
    }
  }

  if (!params.cameraSource) {
    throw new Error('Take a level / building / room camera snapshot before saving a camera preset.')
  }

  return {
    ...base,
    kind: 'camera',
    camera: {
      nodeId: params.cameraSource.nodeId,
      position: params.cameraSource.camera.position,
      target: params.cameraSource.camera.target,
      mode: params.cameraSource.camera.mode,
      zoom: params.cameraSource.camera.zoom,
    },
  }
}

export function getDeliveryPresetCameraEvent(
  preset: DeliveryPreset,
  includeCamera = true,
): DeliveryCameraEvent | null {
  if (!includeCamera || preset.kind !== 'camera') {
    return null
  }

  if (preset.camera.nodeId) {
    return {
      type: 'camera-controls:view',
      payload: {
        nodeId: preset.camera.nodeId,
      },
    }
  }

  return {
    type: 'camera:go-to-position',
    payload: {
      position: preset.camera.position,
      target: preset.camera.target,
    },
  }
}

export function resolveDeliveryPresetEffects(
  preset: DeliveryPreset,
  currentSelection: DeliverySelectionState,
  includeCamera = true,
) {
  return {
    selection: resolveDeliveryLevelSelection(currentSelection, preset.levelId),
    viewMode: preset.viewMode,
    overlays: normalizeDeliveryOverlays(preset.overlays),
    cameraEvent: getDeliveryPresetCameraEvent(preset, includeCamera),
  }
}
