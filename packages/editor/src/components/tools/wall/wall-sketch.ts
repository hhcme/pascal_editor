import type { WallNode } from '@pascal-app/core'
import {
  getWallAngleSnapStep,
  getWallGridStep,
  snapPointTo45Degrees,
  snapPointToGrid,
  WALL_JOIN_SNAP_RADIUS,
  type WallPlanPoint,
} from './wall-drafting'

export type WallSketchSnapTargetKind = 'endpoint' | 'midpoint' | 'wall' | 'alignment'
export type WallSketchGuideKind = 'horizontal' | 'vertical' | 'angle' | 'alignment'

export type WallSketchGuideLine = {
  kind: WallSketchGuideKind
  start: WallPlanPoint
  end: WallPlanPoint
}

export type WallSketchSnapTarget = {
  kind: WallSketchSnapTargetKind
  point: WallPlanPoint
  sourcePoint?: WallPlanPoint
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
): WallSketchSnapTarget | null {
  const ignore = new Set(ignoreWallIds ?? [])
  const radiusSquared = WALL_JOIN_SNAP_RADIUS * WALL_JOIN_SNAP_RADIUS
  let best: WallSketchSnapTarget | null = null
  let bestDistanceSquared = Number.POSITIVE_INFINITY

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
      const candidateDistanceSquared = distanceSquared(point, candidate.point)
      if (
        candidateDistanceSquared > radiusSquared ||
        candidateDistanceSquared >= bestDistanceSquared
      ) {
        continue
      }

      best = candidate
      bestDistanceSquared = candidateDistanceSquared
    }
  }

  return best
}

function findAlignmentSnapTarget(
  point: WallPlanPoint,
  walls: WallNode[],
): WallSketchSnapTarget | null {
  let best: WallSketchSnapTarget | null = null
  let bestDistance = WALL_JOIN_SNAP_RADIUS

  for (const wall of walls) {
    const sourcePoints: WallPlanPoint[] = [wall.start, wall.end, getWallMidpoint(wall)]

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
  }

  return best
}

export function resolveWallSketchSnap(args: {
  point: WallPlanPoint
  walls: WallNode[]
  anchor?: WallPlanPoint
  enableInference?: boolean
  ignoreWallIds?: string[]
}): WallSketchSnapResult {
  const { point, walls, anchor, enableInference = true, ignoreWallIds } = args
  const step = getWallGridStep()
  const gridPoint = snapPointToGrid(point, step)
  const anglePoint =
    anchor && enableInference
      ? snapPointTo45Degrees(anchor, point, step, getWallAngleSnapStep(step))
      : gridPoint

  const directTarget = findDirectSnapTarget(anglePoint, walls, ignoreWallIds)
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
    const alignmentTarget = findAlignmentSnapTarget(gridPoint, walls)
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
