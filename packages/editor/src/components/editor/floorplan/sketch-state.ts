'use client'

import type { SketchLineEndpointReference, SketchLineNode } from '@pascal-app/core'
import { useCallback, useMemo, useState } from 'react'
import {
  buildSketchRectangleSegments,
  type SketchRectangleSegment,
} from '../../tools/sketch/sketch-geometry'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'

export type SketchLineDraft = {
  start: WallPlanPoint
  end: WallPlanPoint
  construction: boolean
  startConnection?: SketchLineEndpointReference
  endConnection?: SketchLineEndpointReference
}

export type SketchRectangleDraft = {
  start: WallPlanPoint
  end: WallPlanPoint
  startConnection?: SketchLineEndpointReference
  endConnection?: SketchLineEndpointReference
}

export type SketchDimensionInputState = {
  lineId: SketchLineNode['id']
  value: string
  position?: { x: number; y: number }
}

export function useFloorplanSketchState() {
  const [sketchLineDraft, setSketchLineDraft] = useState<SketchLineDraft | null>(null)
  const [sketchRectangleDraft, setSketchRectangleDraft] = useState<SketchRectangleDraft | null>(
    null,
  )
  const [sketchDimensionInput, setSketchDimensionInput] =
    useState<SketchDimensionInputState | null>(null)

  const clearSketchLinePlacementDraft = useCallback(() => {
    setSketchLineDraft(null)
    setSketchRectangleDraft(null)
    setSketchDimensionInput(null)
  }, [])

  const sketchRectangleDraftSegments = useMemo<SketchRectangleSegment[]>(
    () =>
      sketchRectangleDraft
        ? buildSketchRectangleSegments(sketchRectangleDraft.start, sketchRectangleDraft.end)
        : [],
    [sketchRectangleDraft],
  )

  return {
    sketchLineDraft,
    setSketchLineDraft,
    sketchRectangleDraft,
    setSketchRectangleDraft,
    sketchDimensionInput,
    setSketchDimensionInput,
    clearSketchLinePlacementDraft,
    sketchRectangleDraftSegments,
  }
}
