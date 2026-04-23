import type { AnyNodeId, SketchLineNode, SketchLineRelation } from '@pascal-app/core'

export type SketchPlanPoint = [number, number]
export type SketchLineOrientation = 'horizontal' | 'vertical'

export type SketchRectangleSegment = {
  start: SketchPlanPoint
  end: SketchPlanPoint
  relations: SketchLineRelation[]
}

export type SketchProfile = {
  lineIds: SketchLineNode['id'][]
  points: SketchPlanPoint[]
}

export type SketchLineEditUpdate = {
  id: SketchLineNode['id']
  data: Partial<SketchLineNode>
}

export type SketchLineEditResult =
  | {
      ok: true
      updates: SketchLineEditUpdate[]
      selectIds?: AnyNodeId[]
    }
  | {
      ok: false
      reason: string
    }

const MIN_SKETCH_LINE_LENGTH = 1e-4
const PROFILE_KEY_TOLERANCE = 1e-4
const EPSILON = 1e-6

type ProfileEdge = {
  id: SketchLineNode['id']
  line: SketchLineNode
  a: string
  b: string
}

function pointDistance(a: SketchPlanPoint, b: SketchPlanPoint) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

function hasRelation(line: SketchLineNode, relation: SketchLineRelation) {
  return (line.relations ?? []).includes(relation)
}

function addRelation(
  relations: SketchLineRelation[] | undefined,
  relation: SketchLineRelation,
  remove?: SketchLineRelation,
) {
  const next = new Set(relations ?? [])
  if (remove) {
    next.delete(remove)
  }
  next.add(relation)
  return [...next]
}

function getDirectionForLength(line: SketchLineNode): SketchPlanPoint | null {
  if (hasRelation(line, 'horizontal')) {
    const sign = line.end[0] >= line.start[0] ? 1 : -1
    return [sign, 0]
  }

  if (hasRelation(line, 'vertical')) {
    const sign = line.end[1] >= line.start[1] ? 1 : -1
    return [0, sign]
  }

  const length = getSketchLineLength2D(line)
  if (length <= MIN_SKETCH_LINE_LENGTH) {
    return null
  }

  return [(line.end[0] - line.start[0]) / length, (line.end[1] - line.start[1]) / length]
}

export function getSketchLineLength2D(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return pointDistance(line.start, line.end)
}

function getSketchLineStraightSnapOffset(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return Math.min(0.03, Math.max(0.005, getSketchLineLength2D(line) * 0.005))
}

function normalizeCurveOffset(
  line: Pick<SketchLineNode, 'start' | 'end'>,
  offset: number,
) {
  const maxOffset = getSketchLineLength2D(line) / 2
  if (!Number.isFinite(maxOffset) || maxOffset < EPSILON) {
    return 0
  }

  const clamped = Math.max(-maxOffset, Math.min(maxOffset, offset))
  return Math.abs(clamped) <= getSketchLineStraightSnapOffset(line) ? 0 : clamped
}

export function getSketchLinePathLength2D(
  line: Pick<SketchLineNode, 'start' | 'end' | 'curveOffset'>,
) {
  const chordLength = getSketchLineLength2D(line)
  const curveOffset = Math.abs(normalizeCurveOffset(line, line.curveOffset ?? 0))
  if (curveOffset <= EPSILON || chordLength <= EPSILON) {
    return chordLength
  }

  const radius = chordLength * chordLength / (8 * curveOffset) + curveOffset / 2
  const centralAngle = 2 * Math.asin(Math.min(1, chordLength / (2 * radius)))
  return radius * centralAngle
}

export function isSketchLineLongEnough(start: SketchPlanPoint, end: SketchPlanPoint) {
  return pointDistance(start, end) > MIN_SKETCH_LINE_LENGTH
}

function pointKey(point: SketchPlanPoint, tolerance = PROFILE_KEY_TOLERANCE) {
  return `${Math.round(point[0] / tolerance)}:${Math.round(point[1] / tolerance)}`
}

function polygonArea(points: SketchPlanPoint[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    area += current[0] * next[1] - next[0] * current[1]
  }
  return area / 2
}

function subtract(a: SketchPlanPoint, b: SketchPlanPoint): SketchPlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

function cross(a: SketchPlanPoint, b: SketchPlanPoint) {
  return a[0] * b[1] - a[1] * b[0]
}

function isPointOnSegment(point: SketchPlanPoint, start: SketchPlanPoint, end: SketchPlanPoint) {
  return (
    Math.abs(cross(subtract(point, start), subtract(end, start))) <= EPSILON &&
    point[0] >= Math.min(start[0], end[0]) - EPSILON &&
    point[0] <= Math.max(start[0], end[0]) + EPSILON &&
    point[1] >= Math.min(start[1], end[1]) - EPSILON &&
    point[1] <= Math.max(start[1], end[1]) + EPSILON
  )
}

function doSegmentsIntersect(
  firstStart: SketchPlanPoint,
  firstEnd: SketchPlanPoint,
  secondStart: SketchPlanPoint,
  secondEnd: SketchPlanPoint,
) {
  const firstVector = subtract(firstEnd, firstStart)
  const secondVector = subtract(secondEnd, secondStart)
  const firstToSecondStart = cross(firstVector, subtract(secondStart, firstStart))
  const firstToSecondEnd = cross(firstVector, subtract(secondEnd, firstStart))
  const secondToFirstStart = cross(secondVector, subtract(firstStart, secondStart))
  const secondToFirstEnd = cross(secondVector, subtract(firstEnd, secondStart))

  if (
    firstToSecondStart * firstToSecondEnd < -EPSILON &&
    secondToFirstStart * secondToFirstEnd < -EPSILON
  ) {
    return true
  }

  return (
    isPointOnSegment(secondStart, firstStart, firstEnd) ||
    isPointOnSegment(secondEnd, firstStart, firstEnd) ||
    isPointOnSegment(firstStart, secondStart, secondEnd) ||
    isPointOnSegment(firstEnd, secondStart, secondEnd)
  )
}

function isSelfIntersectingPolygon(points: SketchPlanPoint[]) {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex]!
    const firstEnd = points[(firstIndex + 1) % points.length]!

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const isAdjacent =
        Math.abs(firstIndex - secondIndex) === 1 ||
        (firstIndex === 0 && secondIndex === points.length - 1)
      if (isAdjacent) {
        continue
      }

      const secondStart = points[secondIndex]!
      const secondEnd = points[(secondIndex + 1) % points.length]!
      if (doSegmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        return true
      }
    }
  }

  return false
}

function areProfilesEqual(first: SketchProfile, second: SketchProfile) {
  if (first.lineIds.length !== second.lineIds.length) {
    return false
  }

  const secondLineIds = new Set(second.lineIds)
  return first.lineIds.every((lineId) => secondLineIds.has(lineId))
}

function isPointInsidePolygon(point: SketchPlanPoint, polygon: SketchPlanPoint[]) {
  let inside = false

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index++
  ) {
    const current = polygon[index]!
    const previous = polygon[previousIndex]!
    const intersects =
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] <
        ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) +
          current[0]

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

export function getSketchProfileUnsupportedReason(
  profile: SketchProfile,
  profiles: SketchProfile[],
) {
  const nestedProfiles = profiles.filter((candidate) => {
    if (areProfilesEqual(profile, candidate)) {
      return false
    }

    const firstPoint = candidate.points[0]
    return firstPoint ? isPointInsidePolygon(firstPoint, profile.points) : false
  })

  if (nestedProfiles.length > 0) {
    return '暂不支持带洞的草图轮廓。请一次只转换一个闭合轮廓。'
  }

  return null
}

function traceProfile(args: {
  componentEdges: ProfileEdge[]
  adjacency: Map<string, ProfileEdge[]>
  pointByKey: Map<string, SketchPlanPoint>
}): SketchProfile | null {
  const { componentEdges, adjacency, pointByKey } = args
  const firstEdge = componentEdges[0]
  if (!firstEdge) {
    return null
  }

  const componentEdgeIds = new Set(componentEdges.map((edge) => edge.id))
  const usedEdgeIds = new Set<SketchLineNode['id']>([firstEdge.id])
  const lineIds: SketchLineNode['id'][] = [firstEdge.line.id]
  const pointKeys: string[] = [firstEdge.a]
  let previousKey = firstEdge.a
  let currentKey = firstEdge.b

  while (currentKey !== pointKeys[0]) {
    pointKeys.push(currentKey)
    const nextEdge = (adjacency.get(currentKey) ?? []).find(
      (edge) => componentEdgeIds.has(edge.id) && !usedEdgeIds.has(edge.id),
    )
    if (!nextEdge) {
      return null
    }

    usedEdgeIds.add(nextEdge.id)
    lineIds.push(nextEdge.line.id)
    const nextKey = nextEdge.a === currentKey ? nextEdge.b : nextEdge.a
    previousKey = currentKey
    currentKey = nextKey

    if (pointKeys.length > componentEdges.length + 1 || currentKey === previousKey) {
      return null
    }
  }

  if (usedEdgeIds.size !== componentEdges.length || pointKeys.length < 3) {
    return null
  }

  const points = pointKeys.map((key) => pointByKey.get(key)).filter(Boolean) as SketchPlanPoint[]
  if (
    points.length !== pointKeys.length ||
    Math.abs(polygonArea(points)) <= EPSILON ||
    isSelfIntersectingPolygon(points)
  ) {
    return null
  }

  return {
    lineIds,
    points: polygonArea(points) < 0 ? [...points].reverse() : points,
  }
}

export function buildSketchRectangleSegments(
  start: SketchPlanPoint,
  end: SketchPlanPoint,
): SketchRectangleSegment[] {
  const minX = Math.min(start[0], end[0])
  const maxX = Math.max(start[0], end[0])
  const minY = Math.min(start[1], end[1])
  const maxY = Math.max(start[1], end[1])

  if (maxX - minX <= MIN_SKETCH_LINE_LENGTH || maxY - minY <= MIN_SKETCH_LINE_LENGTH) {
    return []
  }

  const topLeft: SketchPlanPoint = [minX, minY]
  const topRight: SketchPlanPoint = [maxX, minY]
  const bottomRight: SketchPlanPoint = [maxX, maxY]
  const bottomLeft: SketchPlanPoint = [minX, maxY]

  return [
    { start: topLeft, end: topRight, relations: ['horizontal'] },
    { start: topRight, end: bottomRight, relations: ['vertical'] },
    { start: bottomRight, end: bottomLeft, relations: ['horizontal'] },
    { start: bottomLeft, end: topLeft, relations: ['vertical'] },
  ]
}

export function detectClosedSketchProfiles(lines: SketchLineNode[]): SketchProfile[] {
  const edges: ProfileEdge[] = []
  const pointByKey = new Map<string, SketchPlanPoint>()
  const adjacency = new Map<string, ProfileEdge[]>()

  for (const line of lines) {
    if (
      line.visible === false ||
      line.construction ||
      !isSketchLineLongEnough(line.start, line.end)
    ) {
      continue
    }

    const a = pointKey(line.start)
    const b = pointKey(line.end)
    if (a === b) {
      continue
    }

    pointByKey.set(a, pointByKey.get(a) ?? line.start)
    pointByKey.set(b, pointByKey.get(b) ?? line.end)

    const edge: ProfileEdge = { id: line.id, line, a, b }
    edges.push(edge)
    adjacency.set(a, [...(adjacency.get(a) ?? []), edge])
    adjacency.set(b, [...(adjacency.get(b) ?? []), edge])
  }

  const visited = new Set<SketchLineNode['id']>()
  const profiles: SketchProfile[] = []

  for (const edge of edges) {
    if (visited.has(edge.id)) {
      continue
    }

    const componentEdges: ProfileEdge[] = []
    const stack = [edge]
    visited.add(edge.id)

    while (stack.length > 0) {
      const currentEdge = stack.pop()!
      componentEdges.push(currentEdge)
      for (const key of [currentEdge.a, currentEdge.b]) {
        for (const nextEdge of adjacency.get(key) ?? []) {
          if (!visited.has(nextEdge.id)) {
            visited.add(nextEdge.id)
            stack.push(nextEdge)
          }
        }
      }
    }

    if (componentEdges.length < 3) {
      continue
    }

    const componentKeys = new Set(
      componentEdges.flatMap((componentEdge) => [componentEdge.a, componentEdge.b]),
    )
    const hasOnlyDegreeTwoVertices = [...componentKeys].every(
      (key) =>
        (adjacency.get(key) ?? []).filter((candidate) =>
          componentEdges.some((componentEdge) => componentEdge.id === candidate.id),
        ).length === 2,
    )
    if (!hasOnlyDegreeTwoVertices || componentKeys.size !== componentEdges.length) {
      continue
    }

    const profile = traceProfile({ componentEdges, adjacency, pointByKey })
    if (profile) {
      profiles.push(profile)
    }
  }

  return profiles
}

export function buildSetSketchLineLengthPlan({
  line,
  length,
}: {
  line: SketchLineNode
  length: number
}): SketchLineEditResult {
  if (!Number.isFinite(length) || length <= MIN_SKETCH_LINE_LENGTH) {
    return { ok: false, reason: '请输入有效的草图长度。' }
  }

  if (hasRelation(line, 'fixed')) {
    return { ok: false, reason: '已固定的草图几何不能调整尺寸。' }
  }

  const direction = getDirectionForLength(line)
  if (!direction) {
    return { ok: false, reason: '选中的草图线太短，无法调整尺寸。' }
  }

  const end: SketchPlanPoint = [
    line.start[0] + direction[0] * length,
    line.start[1] + direction[1] * length,
  ]
  const curveOffset = normalizeCurveOffset({ ...line, end }, line.curveOffset ?? 0)

  return {
    ok: true,
    updates: [
      {
        id: line.id,
        data: {
          end,
          curveOffset,
          dimensions: {
            ...(line.dimensions ?? {}),
            length,
          },
        },
      },
    ],
    selectIds: [line.id as AnyNodeId],
  }
}

export function buildOrientSketchLinePlan({
  line,
  orientation,
}: {
  line: SketchLineNode
  orientation: SketchLineOrientation
}): SketchLineEditResult {
  if (hasRelation(line, 'fixed')) {
    return { ok: false, reason: '已固定的草图几何不能调整方向。' }
  }

  const length = getSketchLineLength2D(line)
  if (length <= MIN_SKETCH_LINE_LENGTH) {
    return { ok: false, reason: '选中的草图线太短，无法调整方向。' }
  }

  const end: SketchPlanPoint =
    orientation === 'horizontal'
      ? [line.start[0] + length, line.start[1]]
      : [line.start[0], line.start[1] + length]
  const curveOffset = normalizeCurveOffset({ ...line, end }, line.curveOffset ?? 0)

  return {
    ok: true,
    updates: [
      {
        id: line.id,
        data: {
          end,
          curveOffset,
          relations: addRelation(
            line.relations,
            orientation,
            orientation === 'horizontal' ? 'vertical' : 'horizontal',
          ),
          dimensions: line.dimensions?.length
            ? {
                ...line.dimensions,
                length,
              }
            : line.dimensions,
        },
      },
    ],
    selectIds: [line.id as AnyNodeId],
  }
}
