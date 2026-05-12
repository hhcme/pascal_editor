import type {
  AnyNodeId,
  SketchCircleNode,
  SketchLineNode,
  SketchLineRelation,
} from '@pascal-app/core'
import {
  buildSketchLineAngleDimensionData,
  buildSketchLineGeometryDimensionData,
  buildSketchLineLengthDimensionData,
  getSketchLineAngleDimensionMode,
  getSketchLineLengthDimensionMode,
} from './sketch-dimensions'

export type SketchPlanPoint = [number, number]
export type SketchLineOrientation = 'horizontal' | 'vertical'

export type SketchRectangleSegment = {
  start: SketchPlanPoint
  end: SketchPlanPoint
  relations: SketchLineRelation[]
}

export type SketchProfile = {
  lineIds: SketchLineNode['id'][]
  circleIds?: SketchCircleNode['id'][]
  points: SketchPlanPoint[]
  holes?: SketchProfile[]
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

export type SketchLineFilletArcResult =
  | {
      ok: true
      center: SketchPlanPoint
      radius: number
      startAngle: number
      endAngle: number
      firstEndpoint: 'start' | 'end'
      secondEndpoint: 'start' | 'end'
      firstTrimPoint: SketchPlanPoint
      secondTrimPoint: SketchPlanPoint
    }
  | {
      ok: false
      reason: string
    }

export type SketchLineTrimToCircleResult =
  | {
      ok: true
      endpoint: 'start' | 'end'
      point: SketchPlanPoint
    }
  | {
      ok: false
      reason: string
    }

export type SketchCircleTrimExtendResult =
  | {
      ok: true
      startAngle: number
      endAngle: number
    }
  | {
      ok: false
      reason: string
    }

const MIN_SKETCH_LINE_LENGTH = 1e-4
const PROFILE_KEY_TOLERANCE = 1e-4
const EPSILON = 1e-6
const FULL_CIRCLE_RADIANS = Math.PI * 2

type ProfileEdge = {
  id: SketchLineNode['id'] | SketchCircleNode['id']
  kind: 'line' | 'arc'
  a: string
  b: string
  line?: SketchLineNode
  circle?: SketchCircleNode
  points: SketchPlanPoint[]
}

function pointDistance(a: SketchPlanPoint, b: SketchPlanPoint) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

function addPoint(a: SketchPlanPoint, b: SketchPlanPoint): SketchPlanPoint {
  return [a[0] + b[0], a[1] + b[1]]
}

function scalePoint(point: SketchPlanPoint, scalar: number): SketchPlanPoint {
  return [point[0] * scalar, point[1] * scalar]
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

export function getSketchLineAngle2D(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return normalizeAngle(Math.atan2(line.end[1] - line.start[1], line.end[0] - line.start[0]))
}

function getSketchLineStraightSnapOffset(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return Math.min(0.03, Math.max(0.005, getSketchLineLength2D(line) * 0.005))
}

function normalizeCurveOffset(line: Pick<SketchLineNode, 'start' | 'end'>, offset: number) {
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

  const radius = (chordLength * chordLength) / (8 * curveOffset) + curveOffset / 2
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

function getNearestEndpoint(line: Pick<SketchLineNode, 'start' | 'end'>, point: SketchPlanPoint) {
  return pointDistance(line.start, point) <= pointDistance(line.end, point) ? 'start' : 'end'
}

function normalizeAngle(angle: number) {
  const normalized = angle % FULL_CIRCLE_RADIANS
  return normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
}

function isSketchCircleArcLocal(circle: Pick<SketchCircleNode, 'kind'>) {
  return circle.kind === 'arc'
}

function getCounterClockwiseSweep(startAngle: number, endAngle: number) {
  return (
    (((endAngle - startAngle) % FULL_CIRCLE_RADIANS) + FULL_CIRCLE_RADIANS) % FULL_CIRCLE_RADIANS
  )
}

function getSketchCircleArcSweepLocal(
  circle: Pick<SketchCircleNode, 'kind' | 'startAngle' | 'endAngle'>,
) {
  if (!isSketchCircleArcLocal(circle)) {
    return FULL_CIRCLE_RADIANS
  }

  const sweep = getCounterClockwiseSweep(
    normalizeAngle(circle.startAngle),
    normalizeAngle(circle.endAngle),
  )
  return sweep <= EPSILON ? FULL_CIRCLE_RADIANS : Math.min(FULL_CIRCLE_RADIANS, sweep)
}

function getSketchLineIntersection(
  first: Pick<SketchLineNode, 'start' | 'end'>,
  second: Pick<SketchLineNode, 'start' | 'end'>,
) {
  const firstVector = subtract(first.end, first.start)
  const secondVector = subtract(second.end, second.start)
  const denominator = cross(firstVector, secondVector)
  if (Math.abs(denominator) <= EPSILON) {
    return null
  }

  const offset = subtract(second.start, first.start)
  const t = cross(offset, secondVector) / denominator
  return addPoint(first.start, scalePoint(firstVector, t))
}

function isPointOnSketchCircleArc(
  circle: Pick<SketchCircleNode, 'center' | 'kind' | 'startAngle' | 'endAngle'>,
  point: SketchPlanPoint,
) {
  if (!isSketchCircleArcLocal(circle)) {
    return true
  }

  const start = normalizeAngle(circle.startAngle)
  const target = normalizeAngle(
    Math.atan2(point[1] - circle.center[1], point[0] - circle.center[0]),
  )
  const sweep = getSketchCircleArcSweepLocal(circle)
  const offset = getCounterClockwiseSweep(start, target)
  return offset <= sweep + EPSILON || Math.abs(offset - FULL_CIRCLE_RADIANS) <= EPSILON
}

function getSketchCirclePointAtAngle(
  circle: Pick<SketchCircleNode, 'center' | 'radius'>,
  angle: number,
): SketchPlanPoint {
  return [
    circle.center[0] + Math.cos(angle) * circle.radius,
    circle.center[1] + Math.sin(angle) * circle.radius,
  ]
}

function getSketchCircleArcPoints(circle: SketchCircleNode): SketchPlanPoint[] {
  const sweep = getSketchCircleArcSweepLocal(circle)
  const segments = Math.max(8, Math.ceil(48 * (sweep / FULL_CIRCLE_RADIANS)))
  return Array.from({ length: segments + 1 }, (_, index) =>
    getSketchCirclePointAtAngle(circle, circle.startAngle + sweep * (index / segments)),
  )
}

function appendProfilePoints(target: SketchPlanPoint[], points: SketchPlanPoint[]) {
  for (const point of points) {
    const previous = target.at(-1)
    if (previous && pointDistance(previous, point) <= PROFILE_KEY_TOLERANCE) {
      continue
    }
    target.push(point)
  }
}

function getSketchCircleCircleIntersectionCandidates(
  first: Pick<SketchCircleNode, 'center' | 'radius'>,
  second: Pick<SketchCircleNode, 'center' | 'radius' | 'kind' | 'startAngle' | 'endAngle'>,
) {
  const dx = second.center[0] - first.center[0]
  const dy = second.center[1] - first.center[1]
  const distance = Math.hypot(dx, dy)
  if (distance <= EPSILON) {
    return [] as SketchPlanPoint[]
  }

  if (distance > first.radius + second.radius + EPSILON) {
    return [] as SketchPlanPoint[]
  }

  if (distance < Math.abs(first.radius - second.radius) - EPSILON) {
    return [] as SketchPlanPoint[]
  }

  const a =
    (first.radius * first.radius - second.radius * second.radius + distance * distance) /
    (2 * distance)
  const hSquared = first.radius * first.radius - a * a
  if (hSquared < -EPSILON) {
    return [] as SketchPlanPoint[]
  }

  const midpoint: SketchPlanPoint = [
    first.center[0] + (dx * a) / distance,
    first.center[1] + (dy * a) / distance,
  ]
  const offsetScale = Math.sqrt(Math.max(0, hSquared)) / distance
  const rawCandidates: SketchPlanPoint[] =
    Math.abs(hSquared) <= EPSILON
      ? [midpoint]
      : [
          [midpoint[0] - dy * offsetScale, midpoint[1] + dx * offsetScale],
          [midpoint[0] + dy * offsetScale, midpoint[1] - dx * offsetScale],
        ]

  const candidates: SketchPlanPoint[] = []
  for (const candidate of rawCandidates) {
    if (!isPointOnSketchCircleArc(second, candidate)) {
      continue
    }

    if (
      candidates.some(
        (existing) =>
          Math.abs(existing[0] - candidate[0]) <= EPSILON &&
          Math.abs(existing[1] - candidate[1]) <= EPSILON,
      )
    ) {
      continue
    }

    candidates.push(candidate)
  }

  return candidates
}

function getSketchLineCircleIntersectionCandidates(
  line: Pick<SketchLineNode, 'start' | 'end'>,
  circle: Pick<SketchCircleNode, 'center' | 'radius' | 'kind' | 'startAngle' | 'endAngle'>,
) {
  const direction = subtract(line.end, line.start)
  const offset = subtract(line.start, circle.center)
  const a = direction[0] * direction[0] + direction[1] * direction[1]
  if (a <= EPSILON) {
    return [] as SketchPlanPoint[]
  }

  const b = 2 * (offset[0] * direction[0] + offset[1] * direction[1])
  const c = offset[0] * offset[0] + offset[1] * offset[1] - circle.radius * circle.radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < -EPSILON) {
    return [] as SketchPlanPoint[]
  }

  const roots =
    Math.abs(discriminant) <= EPSILON
      ? [-b / (2 * a)]
      : [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]

  const candidates: SketchPlanPoint[] = []
  for (const t of roots) {
    const candidate: SketchPlanPoint = [
      line.start[0] + direction[0] * t,
      line.start[1] + direction[1] * t,
    ]
    if (!isPointOnSketchCircleArc(circle, candidate)) {
      continue
    }

    if (
      candidates.some(
        (existing) =>
          Math.abs(existing[0] - candidate[0]) <= EPSILON &&
          Math.abs(existing[1] - candidate[1]) <= EPSILON,
      )
    ) {
      continue
    }

    candidates.push(candidate)
  }

  return candidates
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
  const firstCircleIds = first.circleIds ?? []
  const secondCircleIds = second.circleIds ?? []
  if (
    first.lineIds.length !== second.lineIds.length ||
    firstCircleIds.length !== secondCircleIds.length
  ) {
    return false
  }

  const secondLineIds = new Set(second.lineIds)
  const secondCircleIdSet = new Set(secondCircleIds)
  return (
    first.lineIds.every((lineId) => secondLineIds.has(lineId)) &&
    firstCircleIds.every((circleId) => secondCircleIdSet.has(circleId))
  )
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
  options: { allowHoles?: boolean } = {},
) {
  if (!options.allowHoles && (profile.holes?.length ?? 0) > 0) {
    return '暂不支持带洞的草图轮廓。请一次只转换一个闭合轮廓。'
  }

  return null
}

export function buildSketchCircleProfile(circle: SketchCircleNode): SketchProfile | null {
  if (
    circle.visible === false ||
    circle.construction ||
    circle.kind !== 'circle' ||
    !(Number.isFinite(circle.radius) && circle.radius > MIN_SKETCH_LINE_LENGTH)
  ) {
    return null
  }

  const segments = 64
  const points = Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * FULL_CIRCLE_RADIANS
    return getSketchCirclePointAtAngle(circle, angle)
  })

  return {
    lineIds: [],
    circleIds: [circle.id],
    points,
  }
}

export function detectClosedSketchCircleProfiles(circles: SketchCircleNode[]): SketchProfile[] {
  return attachSketchProfileHoles(
    circles
      .map(buildSketchCircleProfile)
      .filter((profile): profile is SketchProfile => Boolean(profile)),
  )
}

function isProfileInsideProfile(inner: SketchProfile, outer: SketchProfile) {
  if (areProfilesEqual(inner, outer)) {
    return false
  }

  const firstPoint = inner.points[0]
  return firstPoint ? isPointInsidePolygon(firstPoint, outer.points) : false
}

function attachSketchProfileHoles(profiles: SketchProfile[]): SketchProfile[] {
  return profiles.map((profile) => {
    const holes = profiles.filter((candidate) => {
      if (!isProfileInsideProfile(candidate, profile)) {
        return false
      }

      return !profiles.some(
        (middle) =>
          !areProfilesEqual(middle, profile) &&
          !areProfilesEqual(middle, candidate) &&
          isProfileInsideProfile(candidate, middle) &&
          isProfileInsideProfile(middle, profile),
      )
    })

    return holes.length > 0 ? { ...profile, holes } : profile
  })
}

function traceProfile(args: {
  componentEdges: ProfileEdge[]
  adjacency: Map<string, ProfileEdge[]>
}): SketchProfile | null {
  const { componentEdges, adjacency } = args
  const firstEdge = componentEdges[0]
  if (!firstEdge) {
    return null
  }

  const componentEdgeIds = new Set(componentEdges.map((edge) => edge.id))
  const usedEdgeIds = new Set<ProfileEdge['id']>([firstEdge.id])
  const orderedEdges: Array<{ edge: ProfileEdge; forward: boolean }> = [
    { edge: firstEdge, forward: true },
  ]
  let previousKey = firstEdge.a
  let currentKey = firstEdge.b

  while (currentKey !== firstEdge.a) {
    const nextEdge = (adjacency.get(currentKey) ?? []).find(
      (edge) => componentEdgeIds.has(edge.id) && !usedEdgeIds.has(edge.id),
    )
    if (!nextEdge) {
      return null
    }

    usedEdgeIds.add(nextEdge.id)
    const forward = nextEdge.a === currentKey
    orderedEdges.push({ edge: nextEdge, forward })
    const nextKey = forward ? nextEdge.b : nextEdge.a
    previousKey = currentKey
    currentKey = nextKey

    if (orderedEdges.length > componentEdges.length + 1 || currentKey === previousKey) {
      return null
    }
  }

  if (usedEdgeIds.size !== componentEdges.length || orderedEdges.length < 2) {
    return null
  }

  const points: SketchPlanPoint[] = []
  const lineIds: SketchLineNode['id'][] = []
  const circleIds: SketchCircleNode['id'][] = []
  for (const { edge, forward } of orderedEdges) {
    if (edge.kind === 'line' && edge.line) {
      lineIds.push(edge.line.id)
    }
    if (edge.kind === 'arc' && edge.circle) {
      circleIds.push(edge.circle.id)
    }
    appendProfilePoints(points, forward ? edge.points : [...edge.points].reverse())
  }

  if (points.length > 1 && pointDistance(points[0]!, points.at(-1)!) <= PROFILE_KEY_TOLERANCE) {
    points.pop()
  }

  if (
    points.length < 3 ||
    Math.abs(polygonArea(points)) <= EPSILON ||
    isSelfIntersectingPolygon(points)
  ) {
    return null
  }

  return {
    lineIds,
    circleIds,
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

export function detectClosedSketchProfiles(
  lines: SketchLineNode[],
  circles: SketchCircleNode[] = [],
): SketchProfile[] {
  const edges: ProfileEdge[] = []
  const pointByKey = new Map<string, SketchPlanPoint>()
  const adjacency = new Map<string, ProfileEdge[]>()
  const addEdge = (edge: ProfileEdge) => {
    edges.push(edge)
    adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge])
    adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge])
  }

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

    addEdge({ id: line.id, kind: 'line', line, a, b, points: [line.start, line.end] })
  }

  for (const circle of circles) {
    if (
      circle.visible === false ||
      circle.construction ||
      circle.kind !== 'arc' ||
      !(Number.isFinite(circle.radius) && circle.radius > MIN_SKETCH_LINE_LENGTH)
    ) {
      continue
    }

    const points = getSketchCircleArcPoints(circle)
    const start = points[0]
    const end = points.at(-1)
    if (!(start && end)) {
      continue
    }

    const a = pointKey(start)
    const b = pointKey(end)
    if (a === b) {
      continue
    }

    pointByKey.set(a, pointByKey.get(a) ?? start)
    pointByKey.set(b, pointByKey.get(b) ?? end)
    addEdge({ id: circle.id, kind: 'arc', circle, a, b, points })
  }

  const visited = new Set<ProfileEdge['id']>()
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

    if (componentEdges.length < 2) {
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

    const profile = traceProfile({ componentEdges, adjacency })
    if (profile) {
      profiles.push(profile)
    }
  }

  return attachSketchProfileHoles([...profiles, ...detectClosedSketchCircleProfiles(circles)])
}

export function buildSketchLineFilletArc(args: {
  firstLine: SketchLineNode
  secondLine: SketchLineNode
  trimDistance: number
}): SketchLineFilletArcResult {
  const { firstLine, secondLine, trimDistance } = args
  if (!Number.isFinite(trimDistance) || trimDistance <= MIN_SKETCH_LINE_LENGTH) {
    return { ok: false, reason: '圆角距离必须大于 0。' }
  }

  const intersection = getSketchLineIntersection(firstLine, secondLine)
  if (!intersection) {
    return { ok: false, reason: '平行草图线无法进行圆角。' }
  }

  const firstEndpoint = getNearestEndpoint(firstLine, intersection)
  const secondEndpoint = getNearestEndpoint(secondLine, intersection)
  const firstFarPoint = firstEndpoint === 'start' ? firstLine.end : firstLine.start
  const secondFarPoint = secondEndpoint === 'start' ? secondLine.end : secondLine.start
  const firstLength = pointDistance(intersection, firstFarPoint)
  const secondLength = pointDistance(intersection, secondFarPoint)
  const resolvedDistance = Math.min(trimDistance, firstLength * 0.45, secondLength * 0.45)

  if (resolvedDistance <= MIN_SKETCH_LINE_LENGTH) {
    return { ok: false, reason: '选中的转角太短，无法创建草图圆角。' }
  }

  const firstDirection = scalePoint(subtract(firstFarPoint, intersection), 1 / firstLength)
  const secondDirection = scalePoint(subtract(secondFarPoint, intersection), 1 / secondLength)
  const bisectorVector = addPoint(firstDirection, secondDirection)
  const bisectorLength = pointDistance([0, 0], bisectorVector)
  if (bisectorLength <= EPSILON) {
    return { ok: false, reason: '相反方向的草图线无法创建圆角。' }
  }

  const angle = Math.acos(
    Math.max(
      -1,
      Math.min(1, firstDirection[0] * secondDirection[0] + firstDirection[1] * secondDirection[1]),
    ),
  )
  if (angle <= EPSILON || angle >= Math.PI - EPSILON) {
    return { ok: false, reason: '当前草图线夹角无法创建圆角。' }
  }

  const radius = resolvedDistance * Math.tan(angle / 2)
  const centerDistance = resolvedDistance / Math.cos(angle / 2)
  if (!(Number.isFinite(radius) && Number.isFinite(centerDistance) && radius > EPSILON)) {
    return { ok: false, reason: '当前草图线夹角无法创建圆角。' }
  }

  const bisectorDirection = scalePoint(bisectorVector, 1 / bisectorLength)
  const firstTrimPoint = addPoint(intersection, scalePoint(firstDirection, resolvedDistance))
  const secondTrimPoint = addPoint(intersection, scalePoint(secondDirection, resolvedDistance))
  const center = addPoint(intersection, scalePoint(bisectorDirection, centerDistance))
  const firstAngle = Math.atan2(firstTrimPoint[1] - center[1], firstTrimPoint[0] - center[0])
  const secondAngle = Math.atan2(secondTrimPoint[1] - center[1], secondTrimPoint[0] - center[0])
  const firstSweep = getCounterClockwiseSweep(firstAngle, secondAngle)
  const [startAngle, endAngle] =
    firstSweep <= Math.PI ? [firstAngle, secondAngle] : [secondAngle, firstAngle]

  if (getCounterClockwiseSweep(startAngle, endAngle) <= EPSILON) {
    return { ok: false, reason: '当前草图线夹角无法创建圆角。' }
  }

  return {
    ok: true,
    center,
    radius,
    startAngle,
    endAngle,
    firstEndpoint,
    secondEndpoint,
    firstTrimPoint,
    secondTrimPoint,
  }
}

export function buildTrimExtendSketchLineToCirclePlan(args: {
  line: SketchLineNode
  circle: SketchCircleNode
}): SketchLineTrimToCircleResult {
  const { line, circle } = args
  if (hasRelation(line, 'fixed')) {
    return { ok: false, reason: '已固定的草图几何不能调整尺寸。' }
  }

  const candidates = getSketchLineCircleIntersectionCandidates(line, circle)
  if (candidates.length === 0) {
    return { ok: false, reason: '草图线与目标圆或圆弧没有可用交点。' }
  }

  let best: {
    endpoint: 'start' | 'end'
    point: SketchPlanPoint
    movement: number
  } | null = null

  for (const candidate of candidates) {
    const endpoint = getNearestEndpoint(line, candidate)
    const nextStart = endpoint === 'start' ? candidate : line.start
    const nextEnd = endpoint === 'end' ? candidate : line.end
    if (!isSketchLineLongEnough(nextStart, nextEnd)) {
      continue
    }

    const movement = pointDistance(endpoint === 'start' ? line.start : line.end, candidate)
    if (!best || movement < best.movement) {
      best = { endpoint, point: candidate, movement }
    }
  }

  if (!best) {
    return { ok: false, reason: '修剪或延伸后的线段太短。' }
  }

  return {
    ok: true,
    endpoint: best.endpoint,
    point: best.point,
  }
}

function getSketchLineCircleTangentCandidates(
  anchor: SketchPlanPoint,
  circle: Pick<SketchCircleNode, 'center' | 'radius' | 'kind' | 'startAngle' | 'endAngle'>,
) {
  const distance = pointDistance(anchor, circle.center)
  if (distance <= circle.radius + EPSILON) {
    return [] as SketchPlanPoint[]
  }

  const baseAngle = Math.atan2(anchor[1] - circle.center[1], anchor[0] - circle.center[0])
  const angleOffset = Math.acos(Math.min(1, circle.radius / distance))
  const candidates: SketchPlanPoint[] = []

  for (const angle of [baseAngle + angleOffset, baseAngle - angleOffset]) {
    const candidate: SketchPlanPoint = [
      circle.center[0] + Math.cos(angle) * circle.radius,
      circle.center[1] + Math.sin(angle) * circle.radius,
    ]
    if (!isPointOnSketchCircleArc(circle, candidate)) {
      continue
    }

    if (
      candidates.some(
        (existing) =>
          Math.abs(existing[0] - candidate[0]) <= EPSILON &&
          Math.abs(existing[1] - candidate[1]) <= EPSILON,
      )
    ) {
      continue
    }

    candidates.push(candidate)
  }

  return candidates
}

export function buildSetSketchLineTangentToCirclePlan(args: {
  line: SketchLineNode
  circle: SketchCircleNode
}): SketchLineTrimToCircleResult {
  const { line, circle } = args
  if (hasRelation(line, 'fixed')) {
    return { ok: false, reason: '已固定的草图几何不能调整尺寸。' }
  }

  if (Math.abs(line.curveOffset ?? 0) > EPSILON) {
    return { ok: false, reason: '当前仅支持直线草图与圆或圆弧设为相切。' }
  }

  let best: {
    endpoint: 'start' | 'end'
    point: SketchPlanPoint
    movement: number
  } | null = null

  for (const endpoint of ['start', 'end'] as const) {
    const anchor = endpoint === 'start' ? line.end : line.start
    const candidates = getSketchLineCircleTangentCandidates(anchor, circle)
    for (const candidate of candidates) {
      const nextStart = endpoint === 'start' ? candidate : line.start
      const nextEnd = endpoint === 'end' ? candidate : line.end
      if (!isSketchLineLongEnough(nextStart, nextEnd)) {
        continue
      }

      const movement = pointDistance(endpoint === 'start' ? line.start : line.end, candidate)
      if (!best || movement < best.movement) {
        best = { endpoint, point: candidate, movement }
      }
    }
  }

  if (!best) {
    return { ok: false, reason: '当前草图线与目标圆或圆弧无法建立有效相切。' }
  }

  return {
    ok: true,
    endpoint: best.endpoint,
    point: best.point,
  }
}

function buildTrimExtendSketchArcFromCandidates(args: {
  circle: SketchCircleNode
  candidates: SketchPlanPoint[]
}): SketchCircleTrimExtendResult {
  const { circle, candidates } = args
  if (circle.kind !== 'arc') {
    return { ok: false, reason: '当前仅支持草图圆弧修剪或延伸。' }
  }

  if (candidates.length === 0) {
    return { ok: false, reason: '草图圆弧与目标几何没有可用交点。' }
  }

  const startPoint = getSketchCirclePointAtAngle(circle, circle.startAngle)
  const endPoint = getSketchCirclePointAtAngle(circle, circle.endAngle)
  let best: {
    startAngle: number
    endAngle: number
    movement: number
  } | null = null

  for (const candidate of candidates) {
    const candidateAngle = normalizeAngle(
      Math.atan2(candidate[1] - circle.center[1], candidate[0] - circle.center[0]),
    )

    for (const endpoint of ['start', 'end'] as const) {
      const startAngle = endpoint === 'start' ? candidateAngle : normalizeAngle(circle.startAngle)
      const endAngle = endpoint === 'end' ? candidateAngle : normalizeAngle(circle.endAngle)
      const sweep = getCounterClockwiseSweep(startAngle, endAngle)
      if (sweep <= EPSILON || sweep >= FULL_CIRCLE_RADIANS - EPSILON) {
        continue
      }

      const movement = pointDistance(endpoint === 'start' ? startPoint : endPoint, candidate)
      if (!best || movement < best.movement) {
        best = { startAngle, endAngle, movement }
      }
    }
  }

  if (!best) {
    return { ok: false, reason: '修剪或延伸后的草图圆弧无效。' }
  }

  return {
    ok: true,
    startAngle: best.startAngle,
    endAngle: best.endAngle,
  }
}

export function buildTrimExtendSketchArcToLinePlan(args: {
  circle: SketchCircleNode
  line: SketchLineNode
}): SketchCircleTrimExtendResult {
  const { circle, line } = args
  const supportCircle = {
    center: circle.center,
    radius: circle.radius,
    kind: 'circle' as const,
    startAngle: 0,
    endAngle: FULL_CIRCLE_RADIANS,
  }
  return buildTrimExtendSketchArcFromCandidates({
    circle,
    candidates: getSketchLineCircleIntersectionCandidates(line, supportCircle),
  })
}

export function buildTrimExtendSketchArcToCirclePlan(args: {
  circle: SketchCircleNode
  targetCircle: SketchCircleNode
}): SketchCircleTrimExtendResult {
  const { circle, targetCircle } = args
  const supportCircle = {
    center: circle.center,
    radius: circle.radius,
  }
  return buildTrimExtendSketchArcFromCandidates({
    circle,
    candidates: getSketchCircleCircleIntersectionCandidates(supportCircle, targetCircle),
  })
}

export function buildSetSketchLineEndpointTangentToCirclePlan(args: {
  line: SketchLineNode
  circle: SketchCircleNode
  endpoint: 'start' | 'end'
  ignoreFixed?: boolean
}): SketchLineTrimToCircleResult {
  const { line, circle, endpoint, ignoreFixed = false } = args
  if (!ignoreFixed && hasRelation(line, 'fixed')) {
    return { ok: false, reason: '已固定的草图几何不能调整尺寸。' }
  }

  if (Math.abs(line.curveOffset ?? 0) > EPSILON) {
    return { ok: false, reason: '当前仅支持直线草图与圆或圆弧设为相切。' }
  }

  const anchor = endpoint === 'start' ? line.end : line.start
  const candidates = getSketchLineCircleTangentCandidates(anchor, circle)
  if (candidates.length === 0) {
    return { ok: false, reason: '当前草图线与目标圆或圆弧无法建立有效相切。' }
  }

  let best: {
    point: SketchPlanPoint
    movement: number
  } | null = null

  for (const candidate of candidates) {
    const nextStart = endpoint === 'start' ? candidate : line.start
    const nextEnd = endpoint === 'end' ? candidate : line.end
    if (!isSketchLineLongEnough(nextStart, nextEnd)) {
      continue
    }

    const movement = pointDistance(endpoint === 'start' ? line.start : line.end, candidate)
    if (!best || movement < best.movement) {
      best = { point: candidate, movement }
    }
  }

  if (!best) {
    return { ok: false, reason: '当前草图线与目标圆或圆弧无法建立有效相切。' }
  }

  return {
    ok: true,
    endpoint,
    point: best.point,
  }
}

export function buildSetSketchLineLengthPlan({
  line,
  length,
  dimensionMode,
}: {
  line: SketchLineNode
  length: number
  dimensionMode?: 'driven' | 'reference'
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
          dimensions: buildSketchLineLengthDimensionData({
            line,
            length,
            mode: dimensionMode ?? getSketchLineLengthDimensionMode(line) ?? 'driven',
          }),
        },
      },
    ],
    selectIds: [line.id as AnyNodeId],
  }
}

function getRelationsForAngleEdit(
  line: SketchLineNode,
  angle: number,
): SketchLineNode['relations'] {
  const baseRelations = (line.relations ?? []).filter(
    (relation) => relation !== 'horizontal' && relation !== 'vertical',
  )
  const normalized = normalizeAngle(angle)
  const isHorizontal = Math.abs(Math.sin(normalized)) <= EPSILON
  const isVertical = Math.abs(Math.cos(normalized)) <= EPSILON

  if (isHorizontal) {
    return [...baseRelations, 'horizontal']
  }
  if (isVertical) {
    return [...baseRelations, 'vertical']
  }
  return baseRelations
}

export function buildSetSketchLineAnglePlan({
  line,
  angle,
  dimensionMode,
}: {
  line: SketchLineNode
  angle: number
  dimensionMode?: 'driven' | 'reference'
}): SketchLineEditResult {
  if (!Number.isFinite(angle)) {
    return { ok: false, reason: '请输入有效的草图角度。' }
  }

  if (hasRelation(line, 'fixed')) {
    return { ok: false, reason: '已固定的草图几何不能调整角度。' }
  }

  const length = getSketchLineLength2D(line)
  if (length <= MIN_SKETCH_LINE_LENGTH) {
    return { ok: false, reason: '选中的草图线太短，无法调整角度。' }
  }

  const end: SketchPlanPoint = [
    line.start[0] + Math.cos(angle) * length,
    line.start[1] + Math.sin(angle) * length,
  ]
  const curveOffset = normalizeCurveOffset({ ...line, end }, line.curveOffset ?? 0)
  const dimensions = buildSketchLineAngleDimensionData({
    line: {
      ...line,
      dimensions:
        buildSketchLineGeometryDimensionData({
          line,
          end,
          preserveDriven: true,
        }) ?? {},
    },
    angle,
    mode: dimensionMode ?? getSketchLineAngleDimensionMode(line) ?? 'driven',
  })

  return {
    ok: true,
    updates: [
      {
        id: line.id,
        data: {
          end,
          curveOffset,
          relations: getRelationsForAngleEdit(line, angle),
          dimensions,
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
          dimensions: buildSketchLineGeometryDimensionData({
            line,
            end,
            preserveDriven: true,
          }),
        },
      },
    ],
    selectIds: [line.id as AnyNodeId],
  }
}
