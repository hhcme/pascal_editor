'use client'

import type { AnyNode, AnyNodeId, SketchLineNode } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import { type Dispatch, type MouseEvent as ReactMouseEvent, type MutableRefObject, type SetStateAction, useCallback } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { buildSketchLineGeometryDimensionData } from '../../tools/sketch/sketch-dimensions'
import { isSketchLineLongEnough } from '../../tools/sketch/sketch-geometry'
import { clearSketchLineTangentIfGeometryChanges } from '../../tools/sketch/sketch-line-tangent'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import type { WallSketchSnapResult, WallSketchSnapTarget } from '../../tools/wall/wall-sketch'
import type { FloorplanSketchContextTarget, SketchContextTool } from './floorplan-sketch-menus'
import {
  type FloorplanSketchCircleEntry,
  findNearestSketchCircleCoincidentTarget,
  findNearestSketchEndpoint,
  findNearestSketchLineCoincidentTarget,
  findNearestSketchLineMidpointCoincidentTarget,
} from './floorplan-sketch-context'
import type { FloorplanSketchLineEntry } from './sketch-action-helpers'
import type {
  SketchArcDraft,
  SketchCircleDraft,
  SketchLineDraft,
  SketchRectangleDraft,
} from './sketch-state'

type FloorplanViewportState = {
  centerX: number
  centerY: number
  width: number
}

type UseFloorplanSketchContextActionsArgs = {
  clearDraft: () => void
  clearSketchLinePlacementDraft: () => void
  setCursorPoint: Dispatch<SetStateAction<WallPlanPoint | null>>
  setWallSketchSnapResult: Dispatch<SetStateAction<WallSketchSnapResult | null>>
  setMode: (mode: 'build' | 'select') => void
  setTool: (tool: SketchContextTool | null) => void
  setPhase: (phase: 'structure') => void
  setStructureLayer: (layer: 'elements') => void
  sketchLineDraft: SketchLineDraft | null
  sketchRectangleDraft: SketchRectangleDraft | null
  sketchCircleDraft: SketchCircleDraft | null
  sketchArcDraft: SketchArcDraft | null
  wallSketchSnapTarget: WallSketchSnapTarget | null
  handleSketchLinePlacementPoint: (
    point: WallPlanPoint,
    snapTarget?: WallSketchSnapTarget | null,
  ) => void
  handleSketchRectanglePlacementPoint: (
    point: WallPlanPoint,
    snapTarget?: WallSketchSnapTarget | null,
  ) => void
  handleSketchCirclePlacementPoint: (point: WallPlanPoint) => void
  handleSketchArcPlacementPoint: (point: WallPlanPoint) => void
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  sketchLineEntries: FloorplanSketchLineEntry[]
  sketchCircleEntries: FloorplanSketchCircleEntry[]
  floorplanWorldUnitsPerPixel: number
  setSelection: (selection: any) => void
  setSketchLineDraft: Dispatch<SetStateAction<SketchLineDraft | null>>
  showWallEditFeedback: (message: string) => void
  updateNode: (id: AnyNodeId, data: Partial<AnyNode>) => void
  handleSelectedSketchLineDelete: (event: ReactMouseEvent<HTMLButtonElement>) => void
  handleSelectedSketchCircleDelete: (event: ReactMouseEvent<HTMLButtonElement>) => void
  commitFloorplanSelection: (ids: AnyNodeId[] | string[]) => void
  fittedViewport: FloorplanViewportState
  setViewport: Dispatch<SetStateAction<FloorplanViewportState | null>>
  hasUserAdjustedViewportRef: MutableRefObject<boolean>
}

function invokeSketchContextAction(handler: (event: ReactMouseEvent<HTMLButtonElement>) => void) {
  handler({
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  } as ReactMouseEvent<HTMLButtonElement>)
}

export function useFloorplanSketchContextActions({
  clearDraft,
  clearSketchLinePlacementDraft,
  setCursorPoint,
  setWallSketchSnapResult,
  setMode,
  setTool,
  setPhase,
  setStructureLayer,
  sketchLineDraft,
  sketchRectangleDraft,
  sketchCircleDraft,
  sketchArcDraft,
  wallSketchSnapTarget,
  handleSketchLinePlacementPoint,
  handleSketchRectanglePlacementPoint,
  handleSketchCirclePlacementPoint,
  handleSketchArcPlacementPoint,
  sketchLineById,
  sketchLineEntries,
  sketchCircleEntries,
  floorplanWorldUnitsPerPixel,
  setSelection,
  setSketchLineDraft,
  showWallEditFeedback,
  updateNode,
  handleSelectedSketchLineDelete,
  handleSelectedSketchCircleDelete,
  commitFloorplanSelection,
  fittedViewport,
  setViewport,
  hasUserAdjustedViewportRef,
}: UseFloorplanSketchContextActionsArgs) {
  const activateSketchContextTool = useCallback(
    (nextTool: SketchContextTool) => {
      clearDraft()
      setPhase('structure')
      setStructureLayer('elements')
      setMode('build')
      setTool(nextTool)
    },
    [clearDraft, setMode, setPhase, setStructureLayer, setTool],
  )

  const cancelSketchContextDraft = useCallback(() => {
    clearSketchLinePlacementDraft()
    setCursorPoint(null)
    setWallSketchSnapResult(null)
  }, [clearSketchLinePlacementDraft, setCursorPoint, setWallSketchSnapResult])

  const endSketchContextDraft = useCallback(() => {
    clearSketchLinePlacementDraft()
    setCursorPoint(null)
    setWallSketchSnapResult(null)
    setMode('select')
    setTool(null)
  }, [clearSketchLinePlacementDraft, setCursorPoint, setMode, setTool, setWallSketchSnapResult])

  const commitSketchContextDraft = useCallback(() => {
    if (sketchLineDraft && isSketchLineLongEnough(sketchLineDraft.start, sketchLineDraft.end)) {
      handleSketchLinePlacementPoint(sketchLineDraft.end, wallSketchSnapTarget)
      return
    }

    if (
      sketchRectangleDraft &&
      isSketchLineLongEnough(sketchRectangleDraft.start, sketchRectangleDraft.end)
    ) {
      handleSketchRectanglePlacementPoint(sketchRectangleDraft.end, wallSketchSnapTarget)
      return
    }

    if (
      sketchCircleDraft &&
      Math.hypot(
        sketchCircleDraft.edge[0] - sketchCircleDraft.center[0],
        sketchCircleDraft.edge[1] - sketchCircleDraft.center[1],
      ) > 1e-6
    ) {
      handleSketchCirclePlacementPoint(sketchCircleDraft.edge)
      return
    }

    if (
      sketchArcDraft?.start &&
      Math.hypot(
        sketchArcDraft.end[0] - sketchArcDraft.center[0],
        sketchArcDraft.end[1] - sketchArcDraft.center[1],
      ) > 1e-6 &&
      Math.hypot(
        sketchArcDraft.end[0] - sketchArcDraft.start[0],
        sketchArcDraft.end[1] - sketchArcDraft.start[1],
      ) > 1e-6
    ) {
      handleSketchArcPlacementPoint(sketchArcDraft.end)
    }
  }, [
    handleSketchArcPlacementPoint,
    handleSketchCirclePlacementPoint,
    handleSketchLinePlacementPoint,
    handleSketchRectanglePlacementPoint,
    sketchArcDraft,
    sketchCircleDraft,
    sketchLineDraft,
    sketchRectangleDraft,
    wallSketchSnapTarget,
  ])

  const continueSketchFromEndpoint = useCallback(
    (target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>) => {
      const line = sketchLineById.get(target.lineId)
      if (!line) {
        return
      }

      const point = target.endpoint === 'start' ? line.start : line.end
      clearDraft()
      setPhase('structure')
      setStructureLayer('elements')
      setMode('build')
      setTool(line.construction ? 'sketch-construction-line' : 'sketch-line')
      setSelection({ selectedIds: [line.id] })
      setSketchLineDraft({
        start: point,
        end: point,
        construction: line.construction,
        startConnection: { lineId: line.id, endpoint: target.endpoint },
      })
      setCursorPoint(point)
      setWallSketchSnapResult(null)
      showWallEditFeedback('已从端点继续绘制草图线。')
    },
    [
      clearDraft,
      setCursorPoint,
      setMode,
      setPhase,
      setSelection,
      setSketchLineDraft,
      setStructureLayer,
      setTool,
      setWallSketchSnapResult,
      showWallEditFeedback,
      sketchLineById,
    ],
  )

  const applySketchEndpointConnection = useCallback(
    (args: {
      line: SketchLineNode
      endpoint: 'start' | 'end'
      point: WallPlanPoint
      reference: NonNullable<SketchLineNode['coincident']['start']>
      successMessage: string
    }) => {
      const { line, endpoint, point, reference, successMessage } = args
      updateNode(
        line.id as AnyNodeId,
        clearSketchLineTangentIfGeometryChanges(line, {
          [endpoint]: point,
          coincident: {
            ...(line.coincident ?? {}),
            [endpoint]: reference,
          },
          dimensions: buildSketchLineGeometryDimensionData({
            line,
            start: endpoint === 'start' ? point : line.start,
            end: endpoint === 'end' ? point : line.end,
          }),
        }) as Partial<AnyNode>,
      )
      useScene.getState().dirtyNodes.add(line.id as AnyNodeId)
      setSelection({ selectedIds: [line.id] })
      sfxEmitter.emit('sfx:structure-build')
      showWallEditFeedback(successMessage)
    },
    [setSelection, showWallEditFeedback, updateNode],
  )

  const connectSketchEndpointToNearest = useCallback(
    (target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>) => {
      const line = sketchLineById.get(target.lineId)
      if (!line) {
        return
      }

      if (line.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再连接端点。')
        return
      }

      const nearest = findNearestSketchEndpoint({
        target,
        sketchLineById,
        sketchLineEntries,
        floorplanWorldUnitsPerPixel,
      })
      if (!nearest) {
        showWallEditFeedback('附近没有可连接的草图端点。')
        return
      }

      applySketchEndpointConnection({
        line,
        endpoint: target.endpoint,
        point: nearest.point,
        reference: {
          lineId: nearest.line.id,
          endpoint: nearest.endpoint,
        },
        successMessage: '草图端点已连接。',
      })
    },
    [
      applySketchEndpointConnection,
      floorplanWorldUnitsPerPixel,
      showWallEditFeedback,
      sketchLineById,
      sketchLineEntries,
    ],
  )

  const connectSketchEndpointToNearestLine = useCallback(
    (target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>) => {
      const line = sketchLineById.get(target.lineId)
      if (!line) {
        return
      }

      if (line.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再连接端点。')
        return
      }

      const nearest = findNearestSketchLineCoincidentTarget({
        target,
        sketchLineById,
        sketchLineEntries,
        floorplanWorldUnitsPerPixel,
      })
      if (!nearest) {
        showWallEditFeedback('附近没有可附着的直线草图。')
        return
      }

      applySketchEndpointConnection({
        line,
        endpoint: target.endpoint,
        point: nearest.point,
        reference: nearest.reference,
        successMessage: '草图端点已附着到线段。',
      })
    },
    [
      applySketchEndpointConnection,
      floorplanWorldUnitsPerPixel,
      showWallEditFeedback,
      sketchLineById,
      sketchLineEntries,
    ],
  )

  const connectSketchEndpointToNearestMidpoint = useCallback(
    (target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>) => {
      const line = sketchLineById.get(target.lineId)
      if (!line) {
        return
      }

      if (line.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再连接端点。')
        return
      }

      const nearest = findNearestSketchLineMidpointCoincidentTarget({
        target,
        sketchLineById,
        sketchLineEntries,
        floorplanWorldUnitsPerPixel,
      })
      if (!nearest) {
        showWallEditFeedback('附近没有可附着的草图中点。')
        return
      }

      applySketchEndpointConnection({
        line,
        endpoint: target.endpoint,
        point: nearest.point,
        reference: nearest.reference,
        successMessage: '草图端点已附着到中点。',
      })
    },
    [
      applySketchEndpointConnection,
      floorplanWorldUnitsPerPixel,
      showWallEditFeedback,
      sketchLineById,
      sketchLineEntries,
    ],
  )

  const connectSketchEndpointToNearestCircle = useCallback(
    (target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>) => {
      const line = sketchLineById.get(target.lineId)
      if (!line) {
        return
      }

      if (line.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再连接端点。')
        return
      }

      const nearest = findNearestSketchCircleCoincidentTarget({
        target,
        sketchLineById,
        sketchCircleEntries,
        floorplanWorldUnitsPerPixel,
      })
      if (!nearest) {
        showWallEditFeedback('附近没有可附着的圆或圆弧。')
        return
      }

      applySketchEndpointConnection({
        line,
        endpoint: target.endpoint,
        point: nearest.point,
        reference: nearest.reference,
        successMessage: '草图端点已附着到圆或圆弧。',
      })
    },
    [
      applySketchEndpointConnection,
      floorplanWorldUnitsPerPixel,
      showWallEditFeedback,
      sketchCircleEntries,
      sketchLineById,
    ],
  )

  const clearSketchEndpointCoincident = useCallback(
    (target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>) => {
      const line = sketchLineById.get(target.lineId)
      if (!line?.coincident?.[target.endpoint]) {
        showWallEditFeedback('该端点没有重合关系。')
        return
      }

      const coincident = { ...(line.coincident ?? {}) }
      delete coincident[target.endpoint]
      updateNode(line.id as AnyNodeId, { coincident } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(line.id as AnyNodeId)
      setSelection({ selectedIds: [line.id] })
      sfxEmitter.emit('sfx:structure-build')
      showWallEditFeedback('已取消端点重合关系。')
    },
    [setSelection, showWallEditFeedback, sketchLineById, updateNode],
  )

  const deleteSketchContextSelection = useCallback(() => {
    invokeSketchContextAction(handleSelectedSketchLineDelete)
  }, [handleSelectedSketchLineDelete])

  const deleteSketchCircleContextSelection = useCallback(() => {
    invokeSketchContextAction(handleSelectedSketchCircleDelete)
  }, [handleSelectedSketchCircleDelete])

  const selectAllSketchLines = useCallback(() => {
    commitFloorplanSelection([
      ...sketchLineEntries.map(({ line }) => line.id),
      ...sketchCircleEntries.map(({ circle }) => circle.id),
    ])
  }, [commitFloorplanSelection, sketchCircleEntries, sketchLineEntries])

  const zoomFloorplanToFit = useCallback(() => {
    hasUserAdjustedViewportRef.current = false
    setViewport(fittedViewport)
  }, [fittedViewport, hasUserAdjustedViewportRef, setViewport])

  return {
    activateSketchContextTool,
    cancelSketchContextDraft,
    endSketchContextDraft,
    commitSketchContextDraft,
    continueSketchFromEndpoint,
    connectSketchEndpointToNearest,
    connectSketchEndpointToNearestCircle,
    connectSketchEndpointToNearestLine,
    connectSketchEndpointToNearestMidpoint,
    clearSketchEndpointCoincident,
    deleteSketchContextSelection,
    deleteSketchCircleContextSelection,
    selectAllSketchLines,
    zoomFloorplanToFit,
  }
}
