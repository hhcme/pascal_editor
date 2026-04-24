import type { SketchCircleNode } from '../../schema'
import type { Point2D } from '../wall/wall-mitering'

const CIRCLE_EPSILON = 1e-6
const FULL_CIRCLE_RADIANS = Math.PI * 2
const DEFAULT_SAMPLE_SEGMENTS = 64

type SketchCircleCurveLike = Pick<
  SketchCircleNode,
  'center' | 'endAngle' | 'kind' | 'radius' | 'startAngle'
>

export type SketchCircleBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function normalizePositiveAngle(angle: number) {
  const normalized = angle % FULL_CIRCLE_RADIANS
  return normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
}

function normalizeSweep(startAngle: number, endAngle: number) {
  const start = normalizePositiveAngle(startAngle)
  const end = normalizePositiveAngle(endAngle)
  const sweep = end - start
  return sweep <= CIRCLE_EPSILON ? sweep + FULL_CIRCLE_RADIANS : sweep
}

function pointAtAngle(node: SketchCircleCurveLike, angle: number): Point2D {
  return {
    x: node.center[0] + Math.cos(angle) * node.radius,
    y: node.center[1] + Math.sin(angle) * node.radius,
  }
}

function boundsFromPoints(points: Point2D[]): SketchCircleBounds {
  const bounds = points.reduce<SketchCircleBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )

  return {
    minX: cleanBound(bounds.minX),
    minY: cleanBound(bounds.minY),
    maxX: cleanBound(bounds.maxX),
    maxY: cleanBound(bounds.maxY),
  }
}

function cleanBound(value: number) {
  const rounded = Math.round(value / CIRCLE_EPSILON) * CIRCLE_EPSILON
  return Math.abs(rounded) <= CIRCLE_EPSILON ? 0 : rounded
}

function isAngleOnArc(node: SketchCircleCurveLike, angle: number) {
  if (!isSketchCircleArc(node)) {
    return true
  }

  const start = normalizePositiveAngle(node.startAngle)
  const target = normalizePositiveAngle(angle)
  const sweep = getSketchCircleArcSweep(node)
  const offset = normalizeSweep(start, target)
  return offset <= sweep + CIRCLE_EPSILON || Math.abs(offset - FULL_CIRCLE_RADIANS) <= CIRCLE_EPSILON
}

export function isSketchCircleArc(node: Pick<SketchCircleNode, 'kind'>) {
  return node.kind === 'arc'
}

export function getSketchCircleArcSweep(node: SketchCircleCurveLike) {
  if (!isSketchCircleArc(node)) {
    return FULL_CIRCLE_RADIANS
  }

  return Math.min(FULL_CIRCLE_RADIANS, normalizeSweep(node.startAngle, node.endAngle))
}

export function getSketchCirclePointAt(node: SketchCircleCurveLike, t: number): Point2D {
  const clampedT = Math.max(0, Math.min(1, t))
  const angle = isSketchCircleArc(node)
    ? node.startAngle + getSketchCircleArcSweep(node) * clampedT
    : FULL_CIRCLE_RADIANS * clampedT
  return pointAtAngle(node, angle)
}

export function getSketchCirclePathLength(node: SketchCircleCurveLike) {
  return node.radius * getSketchCircleArcSweep(node)
}

export function sampleSketchCircleCenterline(
  node: SketchCircleCurveLike,
  segments = DEFAULT_SAMPLE_SEGMENTS,
) {
  const sweep = getSketchCircleArcSweep(node)
  const segmentCount = Math.max(4, Math.ceil(Math.max(1, segments) * (sweep / FULL_CIRCLE_RADIANS)))
  const points = Array.from({ length: segmentCount + 1 }, (_, index) =>
    getSketchCirclePointAt(node, index / segmentCount),
  )

  if (!isSketchCircleArc(node)) {
    points[points.length - 1] = points[0]!
  }

  return points
}

export function getSketchCircleBounds(node: SketchCircleCurveLike): SketchCircleBounds {
  if (!isSketchCircleArc(node)) {
    return {
      minX: node.center[0] - node.radius,
      minY: node.center[1] - node.radius,
      maxX: node.center[0] + node.radius,
      maxY: node.center[1] + node.radius,
    }
  }

  const points = [getSketchCirclePointAt(node, 0), getSketchCirclePointAt(node, 1)]
  for (const cardinalAngle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
    if (isAngleOnArc(node, cardinalAngle)) {
      points.push(pointAtAngle(node, cardinalAngle))
    }
  }

  return boundsFromPoints(points)
}

export function isSketchCircleRadiusValid(radius: number) {
  return Number.isFinite(radius) && radius > CIRCLE_EPSILON
}
