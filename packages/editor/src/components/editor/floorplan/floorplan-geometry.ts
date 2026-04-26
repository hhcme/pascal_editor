'use client'

import type { Point2D } from '@pascal-app/core'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'

export function toPoint2D(point: WallPlanPoint): Point2D {
  return { x: point[0], y: point[1] }
}

export function toWallPlanPoint(point: Point2D): WallPlanPoint {
  return [point.x, point.y]
}

export function getDistanceToWallSegment(
  point: Point2D,
  start: WallPlanPoint,
  end: WallPlanPoint,
) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(point.x - start[0], point.y - start[1])
  }

  const projection = Math.min(
    1,
    Math.max(0, ((point.x - start[0]) * dx + (point.y - start[1]) * dy) / lengthSquared),
  )
  const projectedX = start[0] + dx * projection
  const projectedY = start[1] + dy * projection

  return Math.hypot(point.x - projectedX, point.y - projectedY)
}

export function getDistanceToSketchPolyline(point: Point2D, polyline: Point2D[]) {
  if (polyline.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  if (polyline.length === 1) {
    const onlyPoint = polyline[0]!
    return Math.hypot(point.x - onlyPoint.x, point.y - onlyPoint.y)
  }

  let minDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index]
    const end = polyline[index + 1]
    if (!(start && end)) {
      continue
    }

    minDistance = Math.min(
      minDistance,
      getDistanceToWallSegment(point, [start.x, start.y], [end.x, end.y]),
    )
  }

  return minDistance
}
