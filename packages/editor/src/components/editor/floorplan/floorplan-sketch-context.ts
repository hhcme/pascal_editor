'use client'

import type { Point2D, SketchCircleNode, SketchLineNode } from '@pascal-app/core'
import {
  buildSketchCoincidentReferenceToCircle,
  buildSketchCoincidentReferenceToLine,
  buildSketchCoincidentReferenceToLineParameter,
  isSketchCoincidentEndpointReference,
} from '../../tools/sketch/sketch-coincident'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import {
  getDistanceToSketchPolyline,
  getDistanceToWallSegment,
  toPoint2D,
} from './floorplan-geometry'
import type { FloorplanSketchContextTarget } from './floorplan-sketch-menus'
import type { FloorplanSketchLineEntry } from './sketch-action-helpers'

export type FloorplanSketchCircleEntry = {
  circle: SketchCircleNode
  centerline: Point2D[]
}

type SketchEndpointHit = {
  line: SketchLineNode
  endpoint: 'start' | 'end'
  distance: number
}

type SketchCoincidentLineHit = {
  line: SketchLineNode
  point: WallPlanPoint
  reference: NonNullable<SketchLineNode['coincident']['start']>
  distance: number
}

type SketchCoincidentCircleHit = {
  circle: SketchCircleNode
  point: WallPlanPoint
  reference: NonNullable<SketchLineNode['coincident']['start']>
  distance: number
}

export function getSketchContextHitAtPoint({
  planPoint,
  sketchLineEntries,
  sketchCircleEntries,
  floorplanWallHitTolerance,
  floorplanWorldUnitsPerPixel,
  endpointHitStrokeWidth,
}: {
  planPoint: WallPlanPoint
  sketchLineEntries: FloorplanSketchLineEntry[]
  sketchCircleEntries: FloorplanSketchCircleEntry[]
  floorplanWallHitTolerance: number
  floorplanWorldUnitsPerPixel: number
  endpointHitStrokeWidth: number
}): FloorplanSketchContextTarget | null {
  const point = toPoint2D(planPoint)
  const endpointTolerance = Math.max(
    floorplanWorldUnitsPerPixel * (endpointHitStrokeWidth / 2),
    floorplanWallHitTolerance * 0.8,
  )
  let endpointHit: SketchEndpointHit | null = null

  for (const { line } of sketchLineEntries) {
    for (const endpoint of ['start', 'end'] as const) {
      const endpointPoint = endpoint === 'start' ? line.start : line.end
      const distance = Math.hypot(point.x - endpointPoint[0], point.y - endpointPoint[1])
      if (distance <= endpointTolerance && (!endpointHit || distance < endpointHit.distance)) {
        endpointHit = { line, endpoint, distance }
      }
    }
  }

  if (endpointHit) {
    return {
      kind: 'sketch-endpoint',
      lineId: endpointHit.line.id,
      endpoint: endpointHit.endpoint,
      hasCoincident: Boolean(endpointHit.line.coincident?.[endpointHit.endpoint]),
    }
  }

  let lineHit: { line: SketchLineNode; distance: number } | null = null
  for (const { line } of sketchLineEntries) {
    const distance = getDistanceToWallSegment(point, line.start, line.end)
    if (distance <= floorplanWallHitTolerance && (!lineHit || distance < lineHit.distance)) {
      lineHit = { line, distance }
    }
  }

  let circleHit: { circle: SketchCircleNode; distance: number } | null = null
  for (const { circle, centerline } of sketchCircleEntries) {
    const distance = getDistanceToSketchPolyline(point, centerline)
    if (distance <= floorplanWallHitTolerance && (!circleHit || distance < circleHit.distance)) {
      circleHit = { circle, distance }
    }
  }

  if (lineHit && (!circleHit || lineHit.distance <= circleHit.distance)) {
    return {
      kind: 'sketch-line',
      lineId: lineHit.line.id,
    }
  }

  return circleHit
    ? {
        kind: 'sketch-circle',
        circleId: circleHit.circle.id,
      }
    : null
}

export function findNearestSketchEndpoint({
  target,
  sketchLineById,
  sketchLineEntries,
  floorplanWorldUnitsPerPixel,
}: {
  target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  sketchLineEntries: FloorplanSketchLineEntry[]
  floorplanWorldUnitsPerPixel: number
}) {
  const sourceLine = sketchLineById.get(target.lineId)
  if (!sourceLine) {
    return null
  }

  const sourcePoint = target.endpoint === 'start' ? sourceLine.start : sourceLine.end
  const maxDistance = Math.max(0.75, floorplanWorldUnitsPerPixel * 48)
  let nearest:
    | {
        line: SketchLineNode
        endpoint: 'start' | 'end'
        point: WallPlanPoint
        distance: number
      }
    | null = null

  for (const { line } of sketchLineEntries) {
    if (line.id === sourceLine.id) {
      continue
    }

    for (const endpoint of ['start', 'end'] as const) {
      const point = endpoint === 'start' ? line.start : line.end
      const distance = Math.hypot(sourcePoint[0] - point[0], sourcePoint[1] - point[1])
      if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
        nearest = { line, endpoint, point, distance }
      }
    }
  }

  return nearest
}

export function findNearestSketchLineCoincidentTarget({
  target,
  sketchLineById,
  sketchLineEntries,
  floorplanWorldUnitsPerPixel,
}: {
  target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  sketchLineEntries: FloorplanSketchLineEntry[]
  floorplanWorldUnitsPerPixel: number
}) {
  const sourceLine = sketchLineById.get(target.lineId)
  if (!sourceLine) {
    return null
  }

  const sourcePoint = target.endpoint === 'start' ? sourceLine.start : sourceLine.end
  const maxDistance = Math.max(0.75, floorplanWorldUnitsPerPixel * 48)
  let nearest: SketchCoincidentLineHit | null = null

  for (const { line } of sketchLineEntries) {
    if (line.id === sourceLine.id) {
      continue
    }

    const candidate = buildSketchCoincidentReferenceToLine(line, sourcePoint)
    if (!(candidate && !isSketchCoincidentEndpointReference(candidate.reference))) {
      continue
    }

    const distance = Math.hypot(
      sourcePoint[0] - candidate.point[0],
      sourcePoint[1] - candidate.point[1],
    )
    if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
      nearest = {
        line,
        point: candidate.point,
        reference: candidate.reference,
        distance,
      }
    }
  }

  return nearest
}

export function findNearestSketchLineMidpointCoincidentTarget({
  target,
  sketchLineById,
  sketchLineEntries,
  floorplanWorldUnitsPerPixel,
}: {
  target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  sketchLineEntries: FloorplanSketchLineEntry[]
  floorplanWorldUnitsPerPixel: number
}) {
  const sourceLine = sketchLineById.get(target.lineId)
  if (!sourceLine) {
    return null
  }

  const sourcePoint = target.endpoint === 'start' ? sourceLine.start : sourceLine.end
  const maxDistance = Math.max(0.75, floorplanWorldUnitsPerPixel * 48)
  let nearest: SketchCoincidentLineHit | null = null

  for (const { line } of sketchLineEntries) {
    if (line.id === sourceLine.id) {
      continue
    }

    const candidate = buildSketchCoincidentReferenceToLineParameter(line, 0.5)
    if (!(candidate && !isSketchCoincidentEndpointReference(candidate.reference))) {
      continue
    }

    const distance = Math.hypot(
      sourcePoint[0] - candidate.point[0],
      sourcePoint[1] - candidate.point[1],
    )
    if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
      nearest = {
        line,
        point: candidate.point,
        reference: candidate.reference,
        distance,
      }
    }
  }

  return nearest
}

export function findNearestSketchCircleCoincidentTarget({
  target,
  sketchLineById,
  sketchCircleEntries,
  floorplanWorldUnitsPerPixel,
}: {
  target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  sketchCircleEntries: FloorplanSketchCircleEntry[]
  floorplanWorldUnitsPerPixel: number
}) {
  const sourceLine = sketchLineById.get(target.lineId)
  if (!sourceLine) {
    return null
  }

  const sourcePoint = target.endpoint === 'start' ? sourceLine.start : sourceLine.end
  const maxDistance = Math.max(0.75, floorplanWorldUnitsPerPixel * 48)
  let nearest: SketchCoincidentCircleHit | null = null

  for (const { circle } of sketchCircleEntries) {
    const candidate = buildSketchCoincidentReferenceToCircle(circle, sourcePoint)
    if (!candidate) {
      continue
    }

    const distance = Math.hypot(
      sourcePoint[0] - candidate.point[0],
      sourcePoint[1] - candidate.point[1],
    )
    if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
      nearest = {
        circle,
        point: candidate.point,
        reference: candidate.reference,
        distance,
      }
    }
  }

  return nearest
}
