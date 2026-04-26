import type {
  SketchCircleNode,
  SketchCirclePointReference,
  SketchLineCoincidentReference,
  SketchLineEndpoint,
  SketchLineEndpointReference,
  SketchLineNode,
  SketchLinePointReference,
} from '@pascal-app/core'

export type SketchEndpoint = SketchLineEndpoint
export type SketchPlanPoint = [number, number]

export type SketchEndpointSnapTarget = {
  point: SketchPlanPoint
  reference: SketchLineEndpointReference
  distance: number
}

export type SketchCoincidentReferenceResolution = {
  point: SketchPlanPoint
  reference: SketchLineCoincidentReference
}

type SnapTargetLike = {
  kind?: string | null
  sourceId?: string
  sourceEndpoint?: string
}

const EPSILON = 1e-6
const FULL_CIRCLE_RADIANS = Math.PI * 2
const COINCIDENT_POINT_TOLERANCE = 1e-4
const SKETCH_ENDPOINT_SNAP_RADIUS = 0.35
const SKETCH_MIDPOINT_T_PARAMETER = 0.5
const LINE_REFERENCE_ENDPOINT_EPSILON = 1e-3

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function distanceSquared(a: SketchPlanPoint, b: SketchPlanPoint): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function isStraightSketchLine(line: Pick<SketchLineNode, 'curveOffset'>) {
  return Math.abs(line.curveOffset ?? 0) <= EPSILON
}

function normalizeAngle(angle: number) {
  const normalized = angle % FULL_CIRCLE_RADIANS
  return normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
}

function getCounterClockwiseSweep(startAngle: number, endAngle: number) {
  return (
    ((endAngle - startAngle) % FULL_CIRCLE_RADIANS + FULL_CIRCLE_RADIANS) % FULL_CIRCLE_RADIANS
  )
}

function getShortestAngleDistance(first: number, second: number) {
  const delta = Math.abs(normalizeAngle(first) - normalizeAngle(second))
  return Math.min(delta, FULL_CIRCLE_RADIANS - delta)
}

function getSketchCircleArcSweep(circle: Pick<SketchCircleNode, 'kind' | 'startAngle' | 'endAngle'>) {
  if (circle.kind !== 'arc') {
    return FULL_CIRCLE_RADIANS
  }

  const sweep = getCounterClockwiseSweep(
    normalizeAngle(circle.startAngle),
    normalizeAngle(circle.endAngle),
  )
  return sweep <= EPSILON ? FULL_CIRCLE_RADIANS : Math.min(FULL_CIRCLE_RADIANS, sweep)
}

function clampAngleToSketchCircleArc(
  circle: Pick<SketchCircleNode, 'kind' | 'startAngle' | 'endAngle'>,
  angle: number,
) {
  const normalizedAngle = normalizeAngle(angle)
  if (circle.kind !== 'arc') {
    return normalizedAngle
  }

  const startAngle = normalizeAngle(circle.startAngle)
  const endAngle = normalizeAngle(circle.endAngle)
  const sweep = getSketchCircleArcSweep(circle)
  const offset = getCounterClockwiseSweep(startAngle, normalizedAngle)
  if (offset <= sweep + EPSILON || Math.abs(offset - FULL_CIRCLE_RADIANS) <= EPSILON) {
    return normalizedAngle
  }

  return getShortestAngleDistance(normalizedAngle, startAngle) <=
    getShortestAngleDistance(normalizedAngle, endAngle)
    ? startAngle
    : endAngle
}

function isSketchEndpoint(value: string | undefined): value is SketchEndpoint {
  return value === 'start' || value === 'end'
}

export function getSketchEndpointKey(reference: SketchLineEndpointReference): string {
  return `${reference.lineId}:${reference.endpoint}`
}

export function areSketchEndpointReferencesEqual(
  a: SketchLineEndpointReference,
  b: SketchLineEndpointReference,
): boolean {
  return a.lineId === b.lineId && a.endpoint === b.endpoint
}

export function isSketchCoincidentEndpointReference(
  reference: SketchLineCoincidentReference | null | undefined,
): reference is SketchLineEndpointReference {
  return Boolean(reference && 'lineId' in reference && 'endpoint' in reference)
}

export function isSketchCoincidentLinePointReference(
  reference: SketchLineCoincidentReference | null | undefined,
): reference is SketchLinePointReference {
  return Boolean(reference && 'kind' in reference && reference.kind === 'line-point')
}

export function isSketchCoincidentCirclePointReference(
  reference: SketchLineCoincidentReference | null | undefined,
): reference is SketchCirclePointReference {
  return Boolean(reference && 'kind' in reference && reference.kind === 'circle-point')
}

export function doesSketchCoincidentReferenceTargetLine(
  reference: SketchLineCoincidentReference | null | undefined,
  lineId: SketchLineNode['id'],
) {
  return Boolean(
    reference &&
      ((isSketchCoincidentEndpointReference(reference) && reference.lineId === lineId) ||
        (isSketchCoincidentLinePointReference(reference) && reference.lineId === lineId)),
  )
}

export function doesSketchCoincidentReferenceTargetCircle(
  reference: SketchLineCoincidentReference | null | undefined,
  circleId: SketchCircleNode['id'],
) {
  return Boolean(
    isSketchCoincidentCirclePointReference(reference) && reference.circleId === circleId,
  )
}

export function getSketchEndpointReferenceFromSnapTarget(
  target: SnapTargetLike | null | undefined,
): SketchLineEndpointReference | undefined {
  if (
    target?.kind !== 'sketch-endpoint' ||
    !target.sourceId ||
    !isSketchEndpoint(target.sourceEndpoint)
  ) {
    return undefined
  }

  return {
    lineId: target.sourceId as SketchLineEndpointReference['lineId'],
    endpoint: target.sourceEndpoint,
  }
}

export function getSketchLineEndpointPoint(
  line: SketchLineNode,
  endpoint: SketchEndpoint,
): SketchPlanPoint {
  const point = endpoint === 'start' ? line.start : line.end
  return [point[0], point[1]]
}

export function getSketchLinePointAtParameter(
  line: Pick<SketchLineNode, 'start' | 'end'>,
  t: number,
): SketchPlanPoint {
  const clampedT = clamp(t, 0, 1)
  return [
    line.start[0] + (line.end[0] - line.start[0]) * clampedT,
    line.start[1] + (line.end[1] - line.start[1]) * clampedT,
  ]
}

export function isSketchLineMidpointParameter(t: number, tolerance = LINE_REFERENCE_ENDPOINT_EPSILON) {
  return Math.abs(t - SKETCH_MIDPOINT_T_PARAMETER) <= tolerance
}

export function getSketchLineParameterAtPoint(
  line: Pick<SketchLineNode, 'start' | 'end'>,
  point: SketchPlanPoint,
) {
  const dx = line.end[0] - line.start[0]
  const dy = line.end[1] - line.start[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= EPSILON) {
    return null
  }

  return clamp(
    ((point[0] - line.start[0]) * dx + (point[1] - line.start[1]) * dy) / lengthSquared,
    0,
    1,
  )
}

export function getSketchCirclePointAtAngle(
  circle: Pick<SketchCircleNode, 'center' | 'radius'>,
  angle: number,
): SketchPlanPoint {
  return [
    circle.center[0] + Math.cos(angle) * circle.radius,
    circle.center[1] + Math.sin(angle) * circle.radius,
  ]
}

export function buildSketchCoincidentReferenceToLine(
  line: Pick<SketchLineNode, 'curveOffset' | 'end' | 'id' | 'start'>,
  point: SketchPlanPoint,
): SketchCoincidentReferenceResolution | null {
  if (!isStraightSketchLine(line)) {
    return null
  }

  const t = getSketchLineParameterAtPoint(line, point)
  if (t === null) {
    return null
  }

  return buildSketchCoincidentReferenceToLineParameter(line, t)
}

export function buildSketchCoincidentReferenceToLineParameter(
  line: Pick<SketchLineNode, 'curveOffset' | 'end' | 'id' | 'start'>,
  t: number,
): SketchCoincidentReferenceResolution | null {
  if (!isStraightSketchLine(line)) {
    return null
  }

  const clampedT = clamp(t, 0, 1)

  if (clampedT <= LINE_REFERENCE_ENDPOINT_EPSILON) {
    return {
      point: [line.start[0], line.start[1]],
      reference: {
        lineId: line.id,
        endpoint: 'start',
      },
    }
  }

  if (clampedT >= 1 - LINE_REFERENCE_ENDPOINT_EPSILON) {
    return {
      point: [line.end[0], line.end[1]],
      reference: {
        lineId: line.id,
        endpoint: 'end',
      },
    }
  }

  return {
    point: getSketchLinePointAtParameter(line, clampedT),
    reference: {
      kind: 'line-point',
      lineId: line.id,
      t: clampedT,
    },
  }
}

export function buildSketchCoincidentReferenceToCircle(
  circle: Pick<SketchCircleNode, 'center' | 'endAngle' | 'id' | 'kind' | 'radius' | 'startAngle'>,
  point: SketchPlanPoint,
): SketchCoincidentReferenceResolution | null {
  if (circle.radius <= EPSILON) {
    return null
  }

  const angle = clampAngleToSketchCircleArc(
    circle,
    Math.atan2(point[1] - circle.center[1], point[0] - circle.center[0]),
  )

  return {
    point: getSketchCirclePointAtAngle(circle, angle),
    reference: {
      kind: 'circle-point',
      circleId: circle.id,
      angle,
    },
  }
}

export function resolveSketchLineCoincidentReference(args: {
  reference: SketchLineCoincidentReference
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): SketchCoincidentReferenceResolution | null {
  const { reference, linesById, circlesById } = args

  if (isSketchCoincidentEndpointReference(reference)) {
    const targetLine = linesById.get(reference.lineId)
    if (!targetLine) {
      return null
    }

    return {
      point: getSketchLineEndpointPoint(targetLine, reference.endpoint),
      reference,
    }
  }

  if (isSketchCoincidentLinePointReference(reference)) {
    const targetLine = linesById.get(reference.lineId)
    if (!targetLine) {
      return null
    }

    return buildSketchCoincidentReferenceToLine(targetLine, getSketchLinePointAtParameter(targetLine, reference.t))
  }

  const targetCircle = circlesById.get(reference.circleId)
  if (!targetCircle) {
    return null
  }

  return buildSketchCoincidentReferenceToCircle(
    targetCircle,
    getSketchCirclePointAtAngle(targetCircle, reference.angle),
  )
}

export function areSketchCoincidentReferencesEqual(
  a: SketchLineCoincidentReference | undefined,
  b: SketchLineCoincidentReference | undefined,
) {
  if (a === b) {
    return true
  }

  if (!(a && b)) {
    return false
  }

  if (isSketchCoincidentEndpointReference(a) && isSketchCoincidentEndpointReference(b)) {
    return areSketchEndpointReferencesEqual(a, b)
  }

  if (isSketchCoincidentLinePointReference(a) && isSketchCoincidentLinePointReference(b)) {
    return a.lineId === b.lineId && Math.abs(a.t - b.t) <= EPSILON
  }

  if (isSketchCoincidentCirclePointReference(a) && isSketchCoincidentCirclePointReference(b)) {
    return a.circleId === b.circleId && getShortestAngleDistance(a.angle, b.angle) <= EPSILON
  }

  return false
}

export function areSketchPointsCoincident(
  a: SketchPlanPoint,
  b: SketchPlanPoint,
  tolerance = COINCIDENT_POINT_TOLERANCE,
): boolean {
  return distanceSquared(a, b) <= tolerance * tolerance
}

export function findSketchEndpointSnapTarget(args: {
  point: SketchPlanPoint
  lines: SketchLineNode[]
  ignoreEndpoints?: SketchLineEndpointReference[]
  radius?: number
}): SketchEndpointSnapTarget | null {
  const ignoreKeys = new Set((args.ignoreEndpoints ?? []).map(getSketchEndpointKey))
  const radius = args.radius ?? SKETCH_ENDPOINT_SNAP_RADIUS
  const radiusSquared = radius * radius
  let best: SketchEndpointSnapTarget | null = null
  let bestDistanceSquared = Number.POSITIVE_INFINITY

  for (const line of args.lines) {
    if (line.visible === false) {
      continue
    }

    for (const endpoint of ['start', 'end'] as const) {
      const reference: SketchLineEndpointReference = { lineId: line.id, endpoint }
      if (ignoreKeys.has(getSketchEndpointKey(reference))) {
        continue
      }

      const endpointPoint = getSketchLineEndpointPoint(line, endpoint)
      const candidateDistanceSquared = distanceSquared(args.point, endpointPoint)
      if (
        candidateDistanceSquared > radiusSquared ||
        candidateDistanceSquared >= bestDistanceSquared
      ) {
        continue
      }

      best = {
        point: endpointPoint,
        reference,
        distance: Math.sqrt(candidateDistanceSquared),
      }
      bestDistanceSquared = candidateDistanceSquared
    }
  }

  return best
}

export function getCoincidentSketchEndpointRefs(
  lines: SketchLineNode[],
  seed: SketchLineEndpointReference,
): SketchLineEndpointReference[] {
  const endpointByKey = new Map<string, SketchLineEndpointReference>()
  const pointByKey = new Map<string, SketchPlanPoint>()
  const adjacency = new Map<string, Set<string>>()

  const addEndpoint = (reference: SketchLineEndpointReference, point: SketchPlanPoint) => {
    const key = getSketchEndpointKey(reference)
    endpointByKey.set(key, reference)
    pointByKey.set(key, point)
    adjacency.set(key, adjacency.get(key) ?? new Set())
  }

  const addEdge = (a: SketchLineEndpointReference, b: SketchLineEndpointReference) => {
    const aKey = getSketchEndpointKey(a)
    const bKey = getSketchEndpointKey(b)
    if (aKey === bKey || !endpointByKey.has(aKey) || !endpointByKey.has(bKey)) {
      return
    }

    adjacency.get(aKey)?.add(bKey)
    adjacency.get(bKey)?.add(aKey)
  }

  for (const line of lines) {
    addEndpoint({ lineId: line.id, endpoint: 'start' }, getSketchLineEndpointPoint(line, 'start'))
    addEndpoint({ lineId: line.id, endpoint: 'end' }, getSketchLineEndpointPoint(line, 'end'))
  }

  for (const line of lines) {
    for (const endpoint of ['start', 'end'] as const) {
      const linked = line.coincident?.[endpoint]
      if (isSketchCoincidentEndpointReference(linked)) {
        addEdge({ lineId: line.id, endpoint }, linked)
      }
    }
  }

  const endpoints = [...endpointByKey.values()]
  for (let firstIndex = 0; firstIndex < endpoints.length; firstIndex += 1) {
    const first = endpoints[firstIndex]
    if (!first) {
      continue
    }

    const firstPoint = pointByKey.get(getSketchEndpointKey(first))
    if (!firstPoint) {
      continue
    }

    for (let secondIndex = firstIndex + 1; secondIndex < endpoints.length; secondIndex += 1) {
      const second = endpoints[secondIndex]
      if (!second) {
        continue
      }

      const secondPoint = pointByKey.get(getSketchEndpointKey(second))
      if (secondPoint && areSketchPointsCoincident(firstPoint, secondPoint)) {
        addEdge(first, second)
      }
    }
  }

  const seedKey = getSketchEndpointKey(seed)
  if (!endpointByKey.has(seedKey)) {
    return [seed]
  }

  const visited = new Set<string>([seedKey])
  const queue = [seedKey]
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index]
    if (!key) {
      continue
    }

    for (const neighbor of adjacency.get(key) ?? []) {
      if (visited.has(neighbor)) {
        continue
      }

      visited.add(neighbor)
      queue.push(neighbor)
    }
  }

  return [...visited]
    .map((key) => endpointByKey.get(key))
    .filter((reference): reference is SketchLineEndpointReference => Boolean(reference))
}
