import type {
  SketchLineEndpoint,
  SketchLineEndpointReference,
  SketchLineNode,
} from '@pascal-app/core'

export type SketchEndpoint = SketchLineEndpoint
export type SketchPlanPoint = [number, number]

export type SketchEndpointSnapTarget = {
  point: SketchPlanPoint
  reference: SketchLineEndpointReference
  distance: number
}

type SnapTargetLike = {
  kind?: string | null
  sourceId?: string
  sourceEndpoint?: string
}

const COINCIDENT_POINT_TOLERANCE = 1e-4
const SKETCH_ENDPOINT_SNAP_RADIUS = 0.35

function distanceSquared(a: SketchPlanPoint, b: SketchPlanPoint): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
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
      if (linked) {
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
