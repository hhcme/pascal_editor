import { type AnyNode, type AnyNodeId, emitter, type LevelNode, useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useDeliveryStore } from '../../../packages/editor/src/store/use-delivery'
import {
  buildDeliveryPreset,
  getDeliveryCameraPresetSource,
  normalizeDeliveryOverlays,
  resolveDeliveryLevelSelection,
  resolveDeliveryPresetEffects,
  type DeliveryOverlayOptions,
  type DeliveryPreset,
  type DeliveryPresetCaptureRequest,
  type DeliveryStateSnapshot,
  type DeliveryViewMode,
} from './delivery-preset-logic'

export type {
  DeliveryCameraPreset,
  DeliveryCameraSnapshot,
  DeliveryFloorplanPreset,
  DeliveryOverlayOptions,
  DeliveryPreset,
  DeliveryPresetCaptureRequest,
  DeliveryPresetKind,
  DeliveryStateSnapshot,
  DeliveryViewMode,
} from './delivery-preset-logic'

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function normalizeOverlays(
  overlays: Partial<DeliveryOverlayOptions> | undefined | null,
): DeliveryOverlayOptions {
  return normalizeDeliveryOverlays(overlays)
}

function getCurrentSelectionLevelId(): LevelNode['id'] | null {
  return useViewer.getState().selection.levelId ?? null
}

function setLevelSelection(levelId: LevelNode['id'] | null | undefined) {
  const currentSelection = useViewer.getState().selection
  const nextSelection = resolveDeliveryLevelSelection(currentSelection, levelId)
  if (nextSelection) {
    useViewer.getState().setSelection(nextSelection)
  }
}

export function getCurrentDeliveryStateSnapshot(): DeliveryStateSnapshot {
  return {
    viewMode: useEditor.getState().viewMode,
    levelId: getCurrentSelectionLevelId(),
    overlays: {
      ...useDeliveryStore.getState().overlays,
    },
  }
}

export async function applyDeliveryPreset(preset: DeliveryPreset): Promise<void> {
  const { selection } = useViewer.getState()
  const effects = resolveDeliveryPresetEffects(preset, selection)

  if (effects.selection) {
    useViewer.getState().setSelection(effects.selection)
  }
  useEditor.getState().setViewMode(effects.viewMode)
  useDeliveryStore.getState().setOverlays(effects.overlays)
  await waitForAnimationFrame()

  if (effects.cameraEvent) {
    emitter.emit(effects.cameraEvent.type, effects.cameraEvent.payload)
  }
}

export async function restoreDeliveryState(snapshot: DeliveryStateSnapshot): Promise<void> {
  setLevelSelection(snapshot.levelId)
  useEditor.getState().setViewMode(snapshot.viewMode)
  useDeliveryStore.getState().setOverlays(snapshot.overlays)
  await waitForAnimationFrame()
}

export async function withTemporaryDeliveryState<T>(
  state: {
    includeCamera?: boolean
    levelId?: LevelNode['id'] | null
    overlays?: Partial<DeliveryOverlayOptions>
    preset?: DeliveryPreset | null
    viewMode?: DeliveryViewMode
  },
  work: () => Promise<T>,
): Promise<T> {
  const previous = getCurrentDeliveryStateSnapshot()

  try {
    if (state.preset) {
      const { selection } = useViewer.getState()
      const effects = resolveDeliveryPresetEffects(
        state.preset,
        selection,
        state.includeCamera !== false,
      )

      if (effects.selection) {
        useViewer.getState().setSelection(effects.selection)
      }
      useEditor.getState().setViewMode(effects.viewMode)
      useDeliveryStore.getState().setOverlays(effects.overlays)
      await waitForAnimationFrame()

      if (effects.cameraEvent) {
        emitter.emit(effects.cameraEvent.type, effects.cameraEvent.payload)
      }
    } else {
      setLevelSelection(state.levelId)
      if (state.viewMode) {
        useEditor.getState().setViewMode(state.viewMode)
      }
      if (state.overlays) {
        useDeliveryStore.getState().setOverlays(normalizeOverlays(state.overlays))
      }
      await waitForAnimationFrame()
    }

    await waitForAnimationFrame()
    return await work()
  } finally {
    await restoreDeliveryState(previous)
  }
}

export function captureDeliveryPreset(
  request: DeliveryPresetCaptureRequest,
): DeliveryPreset {
  const cameraSource = getDeliveryCameraPresetSource(
    useViewer.getState().selection,
    useScene.getState().nodes as Record<AnyNodeId, AnyNode>,
  )

  return buildDeliveryPreset({
    request,
    state: getCurrentDeliveryStateSnapshot(),
    cameraSource,
  })
}
