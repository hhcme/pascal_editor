import type { WallNode } from '@pascal-app/core'
import {
  getWallAngleSnapStep,
  getWallGridStep,
  snapPointTo45Degrees,
  snapPointToGrid,
  WALL_JOIN_SNAP_RADIUS,
  type WallPlanPoint,
} from './wall-drafting'

export type WallSketchSnapTargetKind =
  | 'endpoint'
  | 'sketch-endpoint'
  | 'midpoint'
  | 'wall'
  | 'intersection'
  | 'extension'
  | 'alignment'
  | 'relation'
export type WallSketchGuideKind =
  | 'horizontal'
  | 'vertical'
  | 'angle'
  | 'alignment'
  | 'extension'
  | 'parallel'
  | 'perpendicular'

export type WallSketchGuideLine = {
  kind: WallSketchGuideKind
  start: WallPlanPoint
  end: WallPlanPoint
}

export type WallSketchSnapTarget = {
  kind: WallSketchSnapTargetKind
  point: WallPlanPoint
  sourcePoint?: WallPlanPoint
  sourceId?: string
  sourceEndpoint?: 'start' | 'end'
  guideKind?: WallSketchGuideKind
}

export type WallSketchSnapPoint = {
  kind?: WallSketchSnapTargetKind
  point: WallPlanPoint
  sourcePoint?: WallPlanPoint
  sourceId?: string
  sourceEndpoint?: 'start' | 'end'
  guideKind?: WallSketchGuideKind
}

export type WallSketchSnapResult = {
  point: WallPlanPoint
  target: WallSketchSnapTarget | null
  guideLines: WallSketchGuideLine[]
}

export type WallSketchInputState = {
  value: string
}

const FEET_PER_METER = 3.280_84
const EPSILON = 1e-6

function distanceSquared(a: WallPlanPoint, b: WallPlanPoint): number {
  const dx = a[0] - b[0]
  const dz = a[1] - b[1]
  return dx * dx + dz * dz
}

function subtract(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

function add(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] + b[0], a[1] + b[1]]
}

function scale(point: WallPlanPoint, scalar: number): WallPlanPoint {
  return [point[0] * scalar, point[1] * scalar]
}

function dot(a: WallPlanPoint, b: WallPlanPoint): number {
  return a[0] * b[0] + a[1] * b[1]
}

function cross(a: WallPlanPoint, b: WallPlanPoint): number {
  return a[0] * b[1] - a[1] * b[0]
}

function distance(a: WallPlanPoint, b: WallPlanPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function projectPointOntoWall(point: WallPlanPoint, wall: WallNode): WallPlanPoint | null {
  const [x1, z1] = wall.start
  const [x2, z2] = wall.end
  const dx = x2 - x1
  const dz = z2 - z1
  const lengthSquared = dx * dx + dz * dz

  if (lengthSquared < EPSILON) {
    return null
  }

  const t = ((point[0] - x1) * dx + (point[1] - z1) * dz) / lengthSquared
  if (t <= 0 || t >= 1) {
    return null
  }

  return [x1 + dx * t, z1 + dz * t]
}

function projectPointOntoInfiniteWall(
  point: WallPlanPoint,
  wall: WallNode,
): { point: WallPlanPoint; t: number } | null {
  const [x1, z1] = wall.start
  const [x2, z2] = wall.end
  const dx = x2 - x1
  const dz = z2 - z1
  const lengthSquared = dx * dx + dz * dz

  if (lengthSquared < EPSILON) {
    return null
  }

  const t = ((point[0] - x1) * dx + (point[1] - z1) * dz) / lengthSquared
  return { point: [x1 + dx * t, z1 + dz * t], t }
}

function getWallIntersection(a: WallNode, b: WallNode): WallPlanPoint | null {
  const r = subtract(a.end, a.start)
  const s = subtract(b.end, b.start)
  const denominator = cross(r, s)
  if (Math.abs(denominator) <= EPSILON) {
    return null
  }

  const offset = subtract(b.start, a.start)
  const tA = cross(offset, s) / denominator
  const tB = cross(offset, r) / denominator
  if (tA < -EPSILON || tA > 1 + EPSILON || tB < -EPSILON || tB > 1 + EPSILON) {
    return null
  }

  return add(a.start, scale(r, tA))
}

function projectPointOntoDirection(
  point: WallPlanPoint,
  origin: WallPlanPoint,
  direction: WallPlanPoint,
): WallPlanPoint | null {
  const directionLengthSquared = dot(direction, direction)
  if (directionLengthSquared <= EPSILON) {
    return null
  }

  return add(
    origin,
    scale(direction, dot(subtract(point, origin), direction) / directionLengthSquared),
  )
}

function getWallMidpoint(wall: WallNode): WallPlanPoint {
  return [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2]
}

function getGuideKind(anchor: WallPlanPoint, point: WallPlanPoint): WallSketchGuideKind {
  const dx = point[0] - anchor[0]
  const dz = point[1] - anchor[1]

  if (Math.abs(dz) <= EPSILON) {
    return 'horizontal'
  }

  if (Math.abs(dx) <= EPSILON) {
    return 'vertical'
  }

  return 'angle'
}

function findDirectSnapTarget(
  point: WallPlanPoint,
  walls: WallNode[],
  ignoreWallIds?: string[],
  snapPoints?: WallSketchSnapPoint[],
): WallSketchSnapTarget | null {
  const ignore = new Set(ignoreWallIds ?? [])
  const radiusSquared = WALL_JOIN_SNAP_RADIUS * WALL_JOIN_SNAP_RADIUS
  let best: WallSketchSnapTarget | null = null
  let bestDistanceSquared = Number.POSITIVE_INFINITY

  const considerCandidate = (candidate: WallSketchSnapTarget) => {
    const candidateDistanceSquared = distanceSquared(point, candidate.point)
    if (
      candidateDistanceSquared > radiusSquared ||
      candidateDistanceSquared >= bestDistanceSquared
    ) {
      return
    }

    best = candidate
    bestDistanceSquared = candidateDistanceSquared
  }

  for (const snapPoint of snapPoints ?? []) {
    considerCandidate({
      kind: snapPoint.kind ?? 'endpoint',
      point: snapPoint.point,
      sourcePoint: snapPoint.sourcePoint,
      sourceId: snapPoint.sourceId,
      sourceEndpoint: snapPoint.sourceEndpoint,
      guideKind: snapPoint.guideKind,
    })
  }

  for (let firstIndex = 0; firstIndex < walls.length; firstIndex += 1) {
    const first = walls[firstIndex]
    if (!first || ignore.has(first.id)) {
      continue
    }

    for (let secondIndex = firstIndex + 1; secondIndex < walls.length; secondIndex += 1) {
      const second = walls[secondIndex]
      if (!second || ignore.has(second.id)) {
        continue
      }

      const intersection = getWallIntersection(first, second)
      if (intersection) {
        considerCandidate({ kind: 'intersection', point: intersection })
      }
    }
  }

  for (const wall of walls) {
    if (ignore.has(wall.id)) {
      continue
    }

    const candidates: WallSketchSnapTarget[] = [
      { kind: 'endpoint', point: wall.start },
      { kind: 'endpoint', point: wall.end },
      { kind: 'midpoint', point: getWallMidpoint(wall) },
    ]

    const wallProjection = projectPointOntoWall(point, wall)
    if (wallProjection) {
      candidates.push({ kind: 'wall', point: wallProjection })
    }

    for (const candidate of candidates) {
      considerCandidate(candidate)
    }
  }

  return best
}

function findExtensionSnapTarget(
  point: WallPlanPoint,
  walls: WallNode[],
): WallSketchSnapTarget | null {
  const radiusSquared = WALL_JOIN_SNAP_RADIUS * WALL_JOIN_SNAP_RADIUS
  let best: WallSketchSnapTarget | null = null
  let bestDistanceSquared = Number.POSITIVE_INFINITY

  for (const wall of walls) {
    const projected = projectPointOntoInfiniteWall(point, wall)
    if (!projected || (projected.t >= 0 && projected.t <= 1)) {
      continue
    }

    const candidateDistanceSquared = distanceSquared(point, projected.point)
    if (
      candidateDistanceSquared > radiusSquared ||
      candidateDistanceSquared >= bestDistanceSquared
    ) {
      continue
    }

    const sourcePoint =
      distance(projected.point, wall.start) <= distance(projected.point, wall.end)
        ? wall.start
        : wall.end
    best = {
      kind: 'extension',
      point: projected.point,
      sourcePoint,
      guideKind: 'extension',
    }
    bestDistanceSquared = candidateDistanceSquared
  }

  return best
}

function findRelationSnapTarget(
  point: WallPlanPoint,
  walls: WallNode[],
  anchor: WallPlanPoint,
): WallSketchSnapTarget | null {
  let best: WallSketchSnapTarget | null = null
  let bestDistance = WALL_JOIN_SNAP_RADIUS

  for (const wall of walls) {
    const direction = subtract(wall.end, wall.start)
    const directionLength = Math.hypot(direction[0], direction[1])
    if (directionLength <= EPSILON) {
      continue
    }

    const unitDirection = scale(direction, 1 / directionLength)
    const candidates: Array<{ direction: WallPlanPoint; guideKind: WallSketchGuideKind }> = [
      { direction: unitDirection, guideKind: 'parallel' },
      { direction: [-unitDirection[1], unitDirection[0]], guideKind: 'perpendicular' },
    ]

    for (const candidate of candidates) {
      const projected = projectPointOntoDirection(point, anchor, candidate.direction)
      if (!projected || distance(projected, anchor) <= EPSILON) {
        continue
      }

      const candidateDistance = distance(point, projected)
      if (candidateDistance >= bestDistance) {
        continue
      }

      best = {
        kind: 'relation',
        point: projected,
        guideKind: candidate.guideKind,
      }
      bestDistance = candidateDistance
    }
  }

  return best
}

function findAlignmentSnapTarget(
  point: WallPlanPoint,
  walls: WallNode[],
  snapPoints?: WallSketchSnapPoint[],
): WallSketchSnapTarget | null {
  let best: WallSketchSnapTarget | null = null
  let bestDistance = WALL_JOIN_SNAP_RADIUS
  const sourcePoints = walls.flatMap((wall) => [wall.start, wall.end, getWallMidpoint(wall)])

  for (const snapPoint of snapPoints ?? []) {
    sourcePoints.push(snapPoint.sourcePoint ?? snapPoint.point)
  }

  for (const sourcePoint of sourcePoints) {
    const xDistance = Math.abs(point[0] - sourcePoint[0])
    if (xDistance > EPSILON && xDistance < bestDistance) {
      best = {
        kind: 'alignment',
        point: [sourcePoint[0], point[1]],
        sourcePoint,
      }
      bestDistance = xDistance
    }

    const zDistance = Math.abs(point[1] - sourcePoint[1])
    if (zDistance > EPSILON && zDistance < bestDistance) {
      best = {
        kind: 'alignment',
        point: [point[0], sourcePoint[1]],
        sourcePoint,
      }
      bestDistance = zDistance
    }
  }

  return best
}

export function resolveWallSketchSnap(args: {
  point: WallPlanPoint
  walls: WallNode[]
  anchor?: WallPlanPoint
  enableInference?: boolean
  ignoreWallIds?: string[]
  snapPoints?: WallSketchSnapPoint[]
}): WallSketchSnapResult {
  const { point, walls, anchor, enableInference = true, ignoreWallIds, snapPoints } = args
  const step = getWallGridStep()
  const gridPoint = snapPointToGrid(point, step)
  const anglePoint =
    anchor && enableInference
      ? snapPointTo45Degrees(anchor, point, step, getWallAngleSnapStep(step))
      : gridPoint

  const directTarget = findDirectSnapTarget(anglePoint, walls, ignoreWallIds, snapPoints)
  if (directTarget) {
    const guideLines =
      anchor && enableInference
        ? [
            {
              kind: getGuideKind(anchor, directTarget.point),
              start: anchor,
              end: directTarget.point,
            },
          ]
        : []

    return {
      point: directTarget.point,
      target: directTarget,
      guideLines,
    }
  }

  if (anchor && enableInference) {
    const extensionTarget = findExtensionSnapTarget(gridPoint, walls)
    if (extensionTarget) {
      return {
        point: extensionTarget.point,
        target: extensionTarget,
        guideLines: [
          {
            kind: getGuideKind(anchor, extensionTarget.point),
            start: anchor,
            end: extensionTarget.point,
          },
          ...(extensionTarget.sourcePoint
            ? [
                {
                  kind: 'extension' as const,
                  start: extensionTarget.sourcePoint,
                  end: extensionTarget.point,
                },
              ]
            : []),
        ],
      }
    }

    const relationTarget = findRelationSnapTarget(gridPoint, walls, anchor)
    if (relationTarget) {
      return {
        point: relationTarget.point,
        target: relationTarget,
        guideLines: [
          {
            kind: relationTarget.guideKind ?? getGuideKind(anchor, relationTarget.point),
            start: anchor,
            end: relationTarget.point,
          },
        ],
      }
    }

    const alignmentTarget = findAlignmentSnapTarget(gridPoint, walls, snapPoints)
    if (alignmentTarget) {
      return {
        point: alignmentTarget.point,
        target: alignmentTarget,
        guideLines: [
          {
            kind: getGuideKind(anchor, alignmentTarget.point),
            start: anchor,
            end: alignmentTarget.point,
          },
          ...(alignmentTarget.sourcePoint
            ? [
                {
                  kind: 'alignment' as const,
                  start: alignmentTarget.sourcePoint,
                  end: alignmentTarget.point,
                },
              ]
            : []),
        ],
      }
    }
  }

  return {
    point: anglePoint,
    target: null,
    guideLines:
      anchor && enableInference
        ? [
            {
              kind: getGuideKind(anchor, anglePoint),
              start: anchor,
              end: anglePoint,
            },
          ]
        : [],
  }
}

export function getWallSketchDirection(
  start: WallPlanPoint | null,
  end: WallPlanPoint | null,
): WallPlanPoint | null {
  if (!(start && end)) {
    return null
  }

  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.hypot(dx, dz)

  if (length <= EPSILON) {
    return null
  }

  return [dx / length, dz / length]
}

export function getPointAtWallSketchLength(
  start: WallPlanPoint,
  direction: WallPlanPoint,
  length: number,
): WallPlanPoint {
  return [start[0] + direction[0] * length, start[1] + direction[1] * length]
}

export function parseWallSketchLengthInput(
  value: string,
  unit: 'metric' | 'imperial',
): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized)
  if (!(Number.isFinite(parsed) && parsed > 0)) {
    return null
  }

  return unit === 'imperial' ? parsed / FEET_PER_METER : parsed
}
