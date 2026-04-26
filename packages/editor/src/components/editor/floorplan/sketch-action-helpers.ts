'use client'

import type {
  Point2D,
  SketchLineCoincidentReference,
  SketchLineEndpointReference,
  SketchLineNode,
} from '@pascal-app/core'
import {
  areSketchEndpointReferencesEqual,
  isSketchCoincidentEndpointReference,
  areSketchPointsCoincident,
  getSketchLineEndpointPoint,
} from '../../tools/sketch/sketch-coincident'
import { buildSketchLineGeometryDimensionData } from '../../tools/sketch/sketch-dimensions'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'

export type UnitSystem = 'metric' | 'imperial'
export type SketchLineOperation = 'split' | 'trim-extend' | 'tangent'
export type SketchCircleOperation = 'trim-extend'

export const SKETCH_EPSILON = 1e-6

export type SketchLineCreateConnections = {
  startConnection?: SketchLineEndpointReference
  endConnection?: SketchLineEndpointReference
}

export type SketchLineCreateSegment = {
  start: WallPlanPoint
  end: WallPlanPoint
  construction?: boolean
  relations?: SketchLineNode['relations']
  coincident?: SketchLineNode['coincident']
}

export type FloorplanSketchLineEntry = {
  line: SketchLineNode
  polygon: Point2D[]
}

export function formatLengthInputValue(valueMeters: number, unit: UnitSystem) {
  const value = unit === 'imperial' ? valueMeters * 3.280_84 : valueMeters
  return String(Number.parseFloat(value.toFixed(2)))
}

export function formatAngleInputValue(valueDegrees: number) {
  return String(Number.parseFloat(valueDegrees.toFixed(1)))
}

export function parseSketchLengthInput(value: string, unit: UnitSystem): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return unit === 'imperial' ? parsed / 3.280_84 : parsed
}

export function parseSketchAngleInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return ((parsed % 360) + 360) % 360
}

export function addPoint(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] + b[0], a[1] + b[1]]
}

export function subtractPoint(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

export function scalePoint(point: WallPlanPoint, scalar: number): WallPlanPoint {
  return [point[0] * scalar, point[1] * scalar]
}

function crossPoint(a: WallPlanPoint, b: WallPlanPoint): number {
  return a[0] * b[1] - a[1] * b[0]
}

export function getPointDistance(a: WallPlanPoint, b: WallPlanPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function getAngleFromCenter(center: WallPlanPoint, point: WallPlanPoint): number {
  return Math.atan2(point[1] - center[1], point[0] - center[0])
}

export function getUnitVector(start: WallPlanPoint, end: WallPlanPoint): WallPlanPoint | null {
  const length = getPointDistance(start, end)
  if (length <= SKETCH_EPSILON) {
    return null
  }

  return [(end[0] - start[0]) / length, (end[1] - start[1]) / length]
}

export function getSketchLineDirection(line: SketchLineNode): WallPlanPoint | null {
  return getUnitVector(line.start, line.end)
}

export function getSketchLineNormal(line: SketchLineNode): WallPlanPoint | null {
  const direction = getSketchLineDirection(line)
  return direction ? [-direction[1], direction[0]] : null
}

export function translateSketchLineSegment(
  line: SketchLineNode,
  offset: WallPlanPoint,
): SketchLineCreateSegment {
  return {
    start: addPoint(line.start, offset),
    end: addPoint(line.end, offset),
    construction: line.construction,
    relations: getSketchLineSplitRelations(line),
  }
}

export function buildSketchLineCoincident(
  connections: SketchLineCreateConnections,
): SketchLineNode['coincident'] | undefined {
  if (!(connections.startConnection || connections.endConnection)) {
    return undefined
  }

  return {
    ...(connections.startConnection ? { start: connections.startConnection } : {}),
    ...(connections.endConnection ? { end: connections.endConnection } : {}),
  }
}

function getSketchLineMidpoint(line: SketchLineNode): WallPlanPoint {
  return [(line.start[0] + line.end[0]) / 2, (line.start[1] + line.end[1]) / 2]
}

export function projectPointOntoSketchLine(
  line: SketchLineNode,
  point: WallPlanPoint,
): WallPlanPoint {
  const dx = line.end[0] - line.start[0]
  const dz = line.end[1] - line.start[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 1e-9) {
    return getSketchLineMidpoint(line)
  }

  const t = ((point[0] - line.start[0]) * dx + (point[1] - line.start[1]) * dz) / lengthSquared
  const clampedT = Math.min(1, Math.max(0, t))
  return [line.start[0] + dx * clampedT, line.start[1] + dz * clampedT]
}

export function getSketchLineIntersection(
  first: SketchLineNode,
  second: SketchLineNode,
): WallPlanPoint | null {
  const r = subtractPoint(first.end, first.start)
  const s = subtractPoint(second.end, second.start)
  const denominator = crossPoint(r, s)
  if (Math.abs(denominator) <= SKETCH_EPSILON) {
    return null
  }

  const offset = subtractPoint(second.start, first.start)
  const t = crossPoint(offset, s) / denominator
  return addPoint(first.start, scalePoint(r, t))
}

export function getSketchLineSplitRelations(line: SketchLineNode): SketchLineNode['relations'] {
  return (line.relations ?? []).filter((relation) => relation !== 'fixed')
}

export function getNearestSketchEndpoint(
  line: SketchLineNode,
  point: WallPlanPoint,
): 'start' | 'end' {
  return getPointDistance(line.start, point) <= getPointDistance(line.end, point) ? 'start' : 'end'
}

export function getOppositeSketchEndpoint(endpoint: 'start' | 'end'): 'start' | 'end' {
  return endpoint === 'start' ? 'end' : 'start'
}

function setSketchLineCoincidentEndpoint(
  line: SketchLineNode,
  endpoint: 'start' | 'end',
  reference?: SketchLineCoincidentReference,
): SketchLineNode['coincident'] | undefined {
  const nextCoincident = { ...(line.coincident ?? {}) }
  if (reference) {
    nextCoincident[endpoint] = reference
  } else {
    delete nextCoincident[endpoint]
  }

  return Object.keys(nextCoincident).length > 0 ? nextCoincident : undefined
}

export function getSketchLineEndpointReferenceAtPoint(
  line: SketchLineNode,
  point: WallPlanPoint,
): SketchLineEndpointReference | undefined {
  if (areSketchPointsCoincident(line.start, point)) {
    return { lineId: line.id, endpoint: 'start' }
  }

  if (areSketchPointsCoincident(line.end, point)) {
    return { lineId: line.id, endpoint: 'end' }
  }

  return undefined
}

export function getSketchLineEndpointUpdate(
  line: SketchLineNode,
  endpoint: 'start' | 'end',
  point: WallPlanPoint,
  connection?: SketchLineCoincidentReference,
): Partial<SketchLineNode> {
  const start = endpoint === 'start' ? point : line.start
  const end = endpoint === 'end' ? point : line.end
  return {
    [endpoint]: point,
    dimensions: buildSketchLineGeometryDimensionData({
      line,
      start,
      end,
    }),
    coincident: setSketchLineCoincidentEndpoint(line, endpoint, connection),
  }
}

export function mirrorSketchPointAcrossVerticalAxis(
  point: WallPlanPoint,
  axisX: number,
): WallPlanPoint {
  return [2 * axisX - point[0], point[1]]
}

export function getSelectionCenterX(lines: SketchLineNode[]): number {
  const points = lines.flatMap((line) => [line.start, line.end])
  return points.reduce((sum, point) => sum + point[0], 0) / Math.max(1, points.length)
}

export function getCornerTrimPoint(
  line: SketchLineNode,
  intersection: WallPlanPoint,
  endpoint: 'start' | 'end',
  distance: number,
): WallPlanPoint | null {
  const farEndpoint = getOppositeSketchEndpoint(endpoint)
  const farPoint = getSketchLineEndpointPoint(line, farEndpoint)
  const direction = getUnitVector(intersection, farPoint)
  if (!direction) {
    return null
  }

  const maxDistance = getPointDistance(intersection, farPoint) * 0.45
  const resolvedDistance = Math.min(distance, maxDistance)
  if (resolvedDistance <= SKETCH_EPSILON) {
    return null
  }

  return addPoint(intersection, scalePoint(direction, resolvedDistance))
}

function endpointReferencesEqual(
  a: SketchLineCoincidentReference | undefined,
  b: SketchLineEndpointReference,
) {
  return Boolean(a && isSketchCoincidentEndpointReference(a) && areSketchEndpointReferencesEqual(a, b))
}

export function retargetSketchLineCoincidentReference(
  coincident: SketchLineNode['coincident'],
  from: SketchLineEndpointReference,
  to: SketchLineEndpointReference,
): SketchLineNode['coincident'] | null {
  let changed = false
  const nextCoincident: SketchLineNode['coincident'] = { ...(coincident ?? {}) }

  for (const endpoint of ['start', 'end'] as const) {
    if (endpointReferencesEqual(nextCoincident[endpoint], from)) {
      nextCoincident[endpoint] = to
      changed = true
    }
  }

  return changed ? nextCoincident : null
}

function applyConnectionToSegmentEndpoint(
  segment: SketchLineCreateSegment,
  endpoint: 'start' | 'end',
  connection: SketchLineEndpointReference,
): SketchLineCreateSegment {
  return {
    ...segment,
    coincident: {
      ...(segment.coincident ?? {}),
      [endpoint]: connection,
    },
  }
}

export function applyExternalRectangleConnection(
  segments: SketchLineCreateSegment[],
  point: WallPlanPoint,
  connection: SketchLineEndpointReference | undefined,
): SketchLineCreateSegment[] {
  if (!connection) {
    return segments
  }

  return segments.map((segment) => {
    let nextSegment = segment
    if (areSketchPointsCoincident(segment.start, point)) {
      nextSegment = applyConnectionToSegmentEndpoint(nextSegment, 'start', connection)
    }
    if (areSketchPointsCoincident(segment.end, point)) {
      nextSegment = applyConnectionToSegmentEndpoint(nextSegment, 'end', connection)
    }
    return nextSegment
  })
}

export function addLocalCoincidentReferences(createdLines: SketchLineNode[]): SketchLineNode[] {
  const endpointGroups: Array<
    Array<{ line: SketchLineNode; endpoint: 'start' | 'end'; point: WallPlanPoint }>
  > = []

  for (const line of createdLines) {
    for (const endpoint of ['start', 'end'] as const) {
      const point = getSketchLineEndpointPoint(line, endpoint)
      const group = endpointGroups.find((candidateGroup) =>
        areSketchPointsCoincident(candidateGroup[0]?.point ?? point, point),
      )

      if (group) {
        group.push({ line, endpoint, point })
      } else {
        endpointGroups.push([{ line, endpoint, point }])
      }
    }
  }

  const nextLineById = new Map(createdLines.map((line) => [line.id, line] as const))

  for (const group of endpointGroups) {
    if (group.length < 2) {
      continue
    }

    const externalReference = group
      .map(({ line, endpoint }) => line.coincident?.[endpoint])
      .find((reference): reference is SketchLineEndpointReference =>
        isSketchCoincidentEndpointReference(reference),
      )
    const anchor =
      externalReference ?? ({ lineId: group[0]!.line.id, endpoint: group[0]!.endpoint } as const)

    for (const { line, endpoint } of group) {
      const currentLine = nextLineById.get(line.id)
      if (!currentLine || areSketchEndpointReferencesEqual({ lineId: line.id, endpoint }, anchor)) {
        continue
      }

      nextLineById.set(line.id, {
        ...currentLine,
        coincident: {
          ...(currentLine.coincident ?? {}),
          [endpoint]: anchor,
        },
      })
    }
  }

  return createdLines.map((line) => nextLineById.get(line.id) ?? line)
}
