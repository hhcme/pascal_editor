import type { SketchCircleNode, SketchCircleRelation } from '@pascal-app/core'

export type SketchCirclePlanPoint = [number, number]

export type SketchCircleCreateSpec = {
  center: SketchCirclePlanPoint
  kind: SketchCircleNode['kind']
  radius: number
  startAngle: number
  endAngle: number
  construction: boolean
  relations: SketchCircleRelation[]
}

const EPSILON = 1e-6
const FULL_CIRCLE_RADIANS = Math.PI * 2

function normalizeAngle(angle: number) {
  const normalized = angle % FULL_CIRCLE_RADIANS
  return normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
}

function subtractPoint(a: SketchCirclePlanPoint, b: SketchCirclePlanPoint): SketchCirclePlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

function pointDistance(a: SketchCirclePlanPoint, b: SketchCirclePlanPoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function getSketchCircleCopyRelations(
  relations: SketchCircleRelation[] | undefined,
): SketchCircleRelation[] {
  return (relations ?? []).filter((relation) => relation !== 'fixed')
}

export function mirrorSketchPointAcrossVerticalAxis(
  point: SketchCirclePlanPoint,
  axisX: number,
): SketchCirclePlanPoint {
  return [2 * axisX - point[0], point[1]]
}

export function getSketchCircleSelectionCenterX(circles: SketchCircleNode[]) {
  return (
    circles.reduce((sum, circle) => sum + circle.center[0], 0) / Math.max(1, circles.length)
  )
}

export function mirrorSketchCircleAcrossVerticalAxis(
  circle: SketchCircleNode,
  axisX: number,
): SketchCircleCreateSpec {
  const center = mirrorSketchPointAcrossVerticalAxis(circle.center, axisX)
  const mirroredStartAngle = normalizeAngle(Math.PI - circle.startAngle)
  const mirroredEndAngle = normalizeAngle(Math.PI - circle.endAngle)

  return {
    center,
    kind: circle.kind,
    radius: circle.radius,
    startAngle: circle.kind === 'arc' ? mirroredEndAngle : circle.startAngle,
    endAngle: circle.kind === 'arc' ? mirroredStartAngle : circle.endAngle,
    construction: circle.construction,
    relations: getSketchCircleCopyRelations(circle.relations),
  }
}

export function translateSketchCircle(
  circle: SketchCircleNode,
  offset: SketchCirclePlanPoint,
): SketchCircleCreateSpec {
  return {
    center: [circle.center[0] + offset[0], circle.center[1] + offset[1]],
    kind: circle.kind,
    radius: circle.radius,
    startAngle: circle.startAngle,
    endAngle: circle.endAngle,
    construction: circle.construction,
    relations: getSketchCircleCopyRelations(circle.relations),
  }
}

export function offsetSketchCircle(
  circle: SketchCircleNode,
  offsetDistance: number,
): SketchCircleCreateSpec | null {
  const radius = circle.radius + offsetDistance
  if (!Number.isFinite(radius) || radius <= EPSILON) {
    return null
  }

  return {
    center: circle.center,
    kind: circle.kind,
    radius,
    startAngle: circle.startAngle,
    endAngle: circle.endAngle,
    construction: circle.construction,
    relations: getSketchCircleCopyRelations(circle.relations),
  }
}

export function getSketchCirclePatternDirection(
  circles: SketchCircleNode[],
): SketchCirclePlanPoint {
  for (let index = 1; index < circles.length; index += 1) {
    const previous = circles[index - 1]
    const current = circles[index]
    if (!(previous && current)) {
      continue
    }

    const delta = subtractPoint(current.center, previous.center)
    const length = pointDistance(previous.center, current.center)
    if (length > EPSILON) {
      return [delta[0] / length, delta[1] / length]
    }
  }

  return [1, 0]
}
