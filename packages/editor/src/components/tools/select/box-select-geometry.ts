import {
  isSketchCircleArc,
  type SketchCircleNode,
  type SketchLineNode,
  sampleSketchCircleCenterline,
  sampleSketchLineCenterline,
} from '@pascal-app/core'

export type BoxSelectBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

type PlanPoint = readonly [number, number]

export function pointInBounds(x: number, z: number, bounds: BoxSelectBounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
}

function cross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
}

function pointOnSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): boolean {
  const epsilon = 1e-9
  return (
    Math.abs(cross(ax, az, bx, bz, cx, cz)) <= epsilon &&
    Math.min(ax, bx) - epsilon <= cx &&
    cx <= Math.max(ax, bx) + epsilon &&
    Math.min(az, bz) - epsilon <= cz &&
    cz <= Math.max(az, bz) + epsilon
  )
}

function segmentsIntersect(
  ax1: number,
  az1: number,
  ax2: number,
  az2: number,
  bx1: number,
  bz1: number,
  bx2: number,
  bz2: number,
): boolean {
  const d1 = cross(bx1, bz1, bx2, bz2, ax1, az1)
  const d2 = cross(bx1, bz1, bx2, bz2, ax2, az2)
  const d3 = cross(ax1, az1, ax2, az2, bx1, bz1)
  const d4 = cross(ax1, az1, ax2, az2, bx2, bz2)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  return (
    pointOnSegment(bx1, bz1, bx2, bz2, ax1, az1) ||
    pointOnSegment(bx1, bz1, bx2, bz2, ax2, az2) ||
    pointOnSegment(ax1, az1, ax2, az2, bx1, bz1) ||
    pointOnSegment(ax1, az1, ax2, az2, bx2, bz2)
  )
}

export function segmentIntersectsBounds(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  bounds: BoxSelectBounds,
): boolean {
  if (pointInBounds(x1, z1, bounds) || pointInBounds(x2, z2, bounds)) return true

  const edges: [number, number, number, number][] = [
    [bounds.minX, bounds.minZ, bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.minZ, bounds.maxX, bounds.maxZ],
    [bounds.maxX, bounds.maxZ, bounds.minX, bounds.maxZ],
    [bounds.minX, bounds.maxZ, bounds.minX, bounds.minZ],
  ]
  return edges.some(([ex1, ez1, ex2, ez2]) => segmentsIntersect(x1, z1, x2, z2, ex1, ez1, ex2, ez2))
}

function pointInPolygon(x: number, z: number, polygon: PlanPoint[]): boolean {
  let inside = false
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const [currentX, currentZ] = polygon[index]!
    const [previousX, previousZ] = polygon[previousIndex]!
    if (
      currentZ > z !== previousZ > z &&
      x < ((previousX - currentX) * (z - currentZ)) / (previousZ - currentZ) + currentX
    ) {
      inside = !inside
    }
  }
  return inside
}

export function polygonIntersectsBounds(polygon: PlanPoint[], bounds: BoxSelectBounds): boolean {
  if (polylineIntersectsBounds(polygon, bounds, true)) return true

  const corners: PlanPoint[] = [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
  ]
  return corners.some(([x, z]) => pointInPolygon(x, z, polygon))
}

function polylineIntersectsBounds(
  points: PlanPoint[],
  bounds: BoxSelectBounds,
  closed = false,
): boolean {
  if (points.some(([x, z]) => pointInBounds(x, z, bounds))) return true

  const segmentCount = closed ? points.length : Math.max(0, points.length - 1)
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (start && end && segmentIntersectsBounds(start[0], start[1], end[0], end[1], bounds)) {
      return true
    }
  }
  return false
}

export function sketchNodeIntersectsBounds(
  node: SketchLineNode | SketchCircleNode,
  bounds: BoxSelectBounds,
): boolean {
  if (node.visible === false) return false

  if (node.type === 'sketch-line') {
    return polylineIntersectsBounds(
      sampleSketchLineCenterline(node).map(({ x, y }) => [x, y]),
      bounds,
    )
  }

  const centerline = sampleSketchCircleCenterline(node).map(({ x, y }) => [x, y] as const)
  return isSketchCircleArc(node)
    ? polylineIntersectsBounds(centerline, bounds)
    : polygonIntersectsBounds(centerline, bounds)
}
