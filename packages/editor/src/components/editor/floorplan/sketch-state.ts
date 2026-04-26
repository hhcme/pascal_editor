'use client'

import type {
  SketchCircleNode,
  SketchDimensionNode,
  SketchDimensionReference,
  SketchLineEndpointReference,
  SketchLineNode,
} from '@pascal-app/core'
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

export type SketchCircleDraft = {
  center: WallPlanPoint
  edge: WallPlanPoint
}

export type SketchArcDraft = {
  center: WallPlanPoint
  start?: WallPlanPoint
  end: WallPlanPoint
}

export type SketchDimensionInputState =
  | {
      target: { kind: 'line'; id: SketchLineNode['id']; metric: 'length' | 'angle' }
      value: string
      position?: { x: number; y: number }
    }
  | {
      target: {
        kind: 'circle'
        id: SketchCircleNode['id']
        metric: 'radius' | 'diameter' | 'arc-length'
      }
      value: string
      position?: { x: number; y: number }
    }
  | {
      target: {
        kind: 'distance'
        id: SketchDimensionNode['id']
        metric: 'distance'
      }
      value: string
      position?: { x: number; y: number }
    }

export type SketchDistanceDimensionDraft = {
  start: SketchDimensionReference
}

export function useFloorplanSketchState() {
  const [sketchLineDraft, setSketchLineDraft] = useState<SketchLineDraft | null>(null)
  const [sketchRectangleDraft, setSketchRectangleDraft] = useState<SketchRectangleDraft | null>(
    null,
  )
  const [sketchCircleDraft, setSketchCircleDraft] = useState<SketchCircleDraft | null>(null)
  const [sketchArcDraft, setSketchArcDraft] = useState<SketchArcDraft | null>(null)
  const [sketchDimensionInput, setSketchDimensionInput] =
    useState<SketchDimensionInputState | null>(null)
  const [sketchDistanceDimensionDraft, setSketchDistanceDimensionDraft] =
    useState<SketchDistanceDimensionDraft | null>(null)

  const clearSketchLinePlacementDraft = useCallback(() => {
    setSketchLineDraft(null)
    setSketchRectangleDraft(null)
    setSketchCircleDraft(null)
    setSketchArcDraft(null)
    setSketchDimensionInput(null)
    setSketchDistanceDimensionDraft(null)
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
    sketchCircleDraft,
    setSketchCircleDraft,
    sketchArcDraft,
    setSketchArcDraft,
    sketchDimensionInput,
    setSketchDimensionInput,
    sketchDistanceDimensionDraft,
    setSketchDistanceDimensionDraft,
    clearSketchLinePlacementDraft,
    sketchRectangleDraftSegments,
  }
}
