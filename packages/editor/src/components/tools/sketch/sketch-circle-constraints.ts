import type {
  AnyNodeId,
  SketchCircleConstraint,
  SketchCircleConstraintKind,
  SketchCircleNode,
  SketchCircleRelation,
} from '@pascal-app/core'
import {
  buildSketchCircleArcLengthDimensionData,
  buildSketchCircleGeometryDimensionData,
  buildSketchCircleRadiusDimensionData,
  getSketchCircleArcLengthDimensionMode,
  getSketchCircleDimensionDisplay,
  getSketchCircleRadiusDimensionMode,
  hasSketchCircleArcLengthDimension,
} from './sketch-dimensions'

export type SketchCirclePlanPoint = [number, number]
type SketchCircleTangentMode = 'external' | 'internal'

export type SketchCircleEditUpdate = {
  id: SketchCircleNode['id']
  data: Partial<SketchCircleNode>
}

export type SketchCircleEditResult =
  | {
      ok: true
      updates: SketchCircleEditUpdate[]
      selectIds?: AnyNodeId[]
    }
  | {
      ok: false
      reason: string
    }

const EPSILON = 1e-6
const FULL_CIRCLE_RADIANS = Math.PI * 2

function hasRelation(circle: SketchCircleNode, relation: SketchCircleRelation) {
  return (circle.relations ?? []).includes(relation)
}

function arePointsCoincident(first: SketchCirclePlanPoint, second: SketchCirclePlanPoint) {
  return Math.abs(first[0] - second[0]) <= EPSILON && Math.abs(first[1] - second[1]) <= EPSILON
}

function hasMatchingRadius(circle: SketchCircleNode, radius: number) {
  return Math.abs(circle.radius - radius) <= EPSILON
}

function addPoint(a: SketchCirclePlanPoint, b: SketchCirclePlanPoint): SketchCirclePlanPoint {
  return [a[0] + b[0], a[1] + b[1]]
}

function subtractPoint(a: SketchCirclePlanPoint, b: SketchCirclePlanPoint): SketchCirclePlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

function scalePoint(point: SketchCirclePlanPoint, scalar: number): SketchCirclePlanPoint {
  return [point[0] * scalar, point[1] * scalar]
}

function normalizeVector(point: SketchCirclePlanPoint): SketchCirclePlanPoint | null {
  const length = Math.hypot(point[0], point[1])
  if (length <= EPSILON) {
    return null
  }

  return [point[0] / length, point[1] / length]
}

function normalizeAngle(angle: number) {
  const normalized = angle % FULL_CIRCLE_RADIANS
  return normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
}

function getCounterClockwiseSweep(startAngle: number, endAngle: number) {
  return (
    (((endAngle - startAngle) % FULL_CIRCLE_RADIANS) + FULL_CIRCLE_RADIANS) % FULL_CIRCLE_RADIANS
  )
}

function isSketchArc(circle: Pick<SketchCircleNode, 'kind'>) {
  return circle.kind === 'arc'
}

function getSketchCircleArcSweep(
  circle: Pick<SketchCircleNode, 'kind' | 'startAngle' | 'endAngle'>,
) {
  if (!isSketchArc(circle)) {
    return FULL_CIRCLE_RADIANS
  }

  const sweep = getCounterClockwiseSweep(
    normalizeAngle(circle.startAngle),
    normalizeAngle(circle.endAngle),
  )
  return sweep <= EPSILON ? FULL_CIRCLE_RADIANS : Math.min(FULL_CIRCLE_RADIANS, sweep)
}

function isPointOnSketchCircleArc(
  circle: Pick<SketchCircleNode, 'center' | 'kind' | 'startAngle' | 'endAngle'>,
  point: SketchCirclePlanPoint,
) {
  if (!isSketchArc(circle)) {
    return true
  }

  const start = normalizeAngle(circle.startAngle)
  const target = normalizeAngle(
    Math.atan2(point[1] - circle.center[1], point[0] - circle.center[0]),
  )
  const sweep = getSketchCircleArcSweep(circle)
  const offset = getCounterClockwiseSweep(start, target)
  return offset <= sweep + EPSILON || Math.abs(offset - FULL_CIRCLE_RADIANS) <= EPSILON
}

function getConstraintKey(constraint: SketchCircleConstraint) {
  return `${constraint.kind}:${constraint.targetId}:${constraint.tangentMode ?? 'none'}`
}

function getTangentModeDistance(
  first: Pick<SketchCircleNode, 'radius'>,
  second: Pick<SketchCircleNode, 'radius'>,
  mode: SketchCircleTangentMode,
) {
  return mode === 'external' ? first.radius + second.radius : Math.abs(first.radius - second.radius)
}

function getConstraintTangentMode(
  constraint: Pick<SketchCircleConstraint, 'tangentMode'>,
  first: Pick<SketchCircleNode, 'center' | 'radius'>,
  second: Pick<SketchCircleNode, 'center' | 'radius'>,
): SketchCircleTangentMode {
  if (constraint.tangentMode) {
    return constraint.tangentMode
  }

  const distance = Math.hypot(
    second.center[0] - first.center[0],
    second.center[1] - first.center[1],
  )
  const externalDistance = getTangentModeDistance(first, second, 'external')
  const internalDistance = getTangentModeDistance(first, second, 'internal')

  if (internalDistance <= EPSILON) {
    return 'external'
  }

  return Math.abs(distance - internalDistance) < Math.abs(distance - externalDistance)
    ? 'internal'
    : 'external'
}

function getTangentPoint(
  first: Pick<SketchCircleNode, 'center' | 'radius'>,
  second: Pick<SketchCircleNode, 'center' | 'radius'>,
  mode: SketchCircleTangentMode,
): SketchCirclePlanPoint {
  const direction =
    normalizeVector(subtractPoint(second.center, first.center)) ??
    ([1, 0] satisfies SketchCirclePlanPoint)

  if (mode === 'external' || first.radius >= second.radius) {
    return addPoint(first.center, scalePoint(direction, first.radius))
  }

  return addPoint(first.center, scalePoint(direction, -first.radius))
}

function buildTangentPeerCenter(args: {
  source: Pick<SketchCircleNode, 'center' | 'radius' | 'kind' | 'startAngle' | 'endAngle'>
  target: Pick<SketchCircleNode, 'center' | 'radius' | 'kind' | 'startAngle' | 'endAngle'>
  mode: SketchCircleTangentMode
}) {
  const { source, target, mode } = args
  const targetDistance = getTangentModeDistance(source, target, mode)
  if (!(Number.isFinite(targetDistance) && targetDistance > EPSILON)) {
    return {
      ok: false as const,
      reason: '当前圆/圆弧半径无法建立稳定的相切约束。',
    }
  }

  const direction =
    normalizeVector(subtractPoint(target.center, source.center)) ??
    ([1, 0] satisfies SketchCirclePlanPoint)
  const center = addPoint(source.center, scalePoint(direction, targetDistance))
  const tangentPoint = getTangentPoint(source, { ...target, center }, mode)

  if (
    !isPointOnSketchCircleArc(source, tangentPoint) ||
    !isPointOnSketchCircleArc({ ...target, center }, tangentPoint)
  ) {
    return {
      ok: false as const,
      reason: '当前圆弧范围不支持保持相切。',
    }
  }

  return {
    ok: true as const,
    center,
  }
}

function normalizeConstraints(
  circleId: SketchCircleNode['id'],
  constraints: SketchCircleConstraint[] | undefined,
) {
  const next: SketchCircleConstraint[] = []
  const seen = new Set<string>()

  for (const constraint of constraints ?? []) {
    if (constraint.targetId === circleId) {
      continue
    }

    const key = getConstraintKey(constraint)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    next.push(constraint)
  }

  return next
}

function areConstraintsEqual(
  first: SketchCircleConstraint[] | undefined,
  second: SketchCircleConstraint[] | undefined,
) {
  const left = first ?? []
  const right = second ?? []
  if (left.length !== right.length) {
    return false
  }

  return left.every(
    (constraint, index) =>
      constraint.kind === right[index]?.kind &&
      constraint.targetId === right[index]?.targetId &&
      constraint.tangentMode === right[index]?.tangentMode,
  )
}

function getCircleConstraints(
  circleId: SketchCircleNode['id'],
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>,
  overrides?: ReadonlyMap<SketchCircleNode['id'], SketchCircleConstraint[]>,
) {
  const override = overrides?.get(circleId)
  if (override) {
    return normalizeConstraints(circleId, override)
  }

  return normalizeConstraints(circleId, circlesById.get(circleId)?.constraints)
}

function setConstraintPair(
  constraintsById: Map<SketchCircleNode['id'], SketchCircleConstraint[]>,
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>,
  firstId: SketchCircleNode['id'],
  secondId: SketchCircleNode['id'],
  kind: SketchCircleConstraintKind,
  tangentMode?: SketchCircleTangentMode,
) {
  const firstConstraints = getCircleConstraints(firstId, circlesById, constraintsById)
  if (
    !firstConstraints.some(
      (constraint) => constraint.kind === kind && constraint.targetId === secondId,
    )
  ) {
    firstConstraints.push({ kind, targetId: secondId, tangentMode })
  }
  constraintsById.set(firstId, normalizeConstraints(firstId, firstConstraints))

  const secondConstraints = getCircleConstraints(secondId, circlesById, constraintsById)
  if (
    !secondConstraints.some(
      (constraint) => constraint.kind === kind && constraint.targetId === firstId,
    )
  ) {
    secondConstraints.push({ kind, targetId: firstId, tangentMode })
  }
  constraintsById.set(secondId, normalizeConstraints(secondId, secondConstraints))
}

function removeConstraintPairs(
  constraintsById: Map<SketchCircleNode['id'], SketchCircleConstraint[]>,
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>,
  circleIds: Set<SketchCircleNode['id']>,
  kind: SketchCircleConstraintKind,
) {
  for (const circleId of circleIds) {
    const nextConstraints = getCircleConstraints(circleId, circlesById, constraintsById).filter(
      (constraint) => !(constraint.kind === kind && circleIds.has(constraint.targetId)),
    )
    constraintsById.set(circleId, nextConstraints)
  }
}

function buildConstraintAdjacency(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  constraintsById?: ReadonlyMap<SketchCircleNode['id'], SketchCircleConstraint[]>
  kind: SketchCircleConstraintKind
  scopeIds?: ReadonlySet<SketchCircleNode['id']>
}) {
  const { circlesById, constraintsById, kind, scopeIds } = args
  const adjacency = new Map<SketchCircleNode['id'], Set<SketchCircleNode['id']>>()

  const link = (firstId: SketchCircleNode['id'], secondId: SketchCircleNode['id']) => {
    if (firstId === secondId) {
      return
    }
    if (scopeIds && (!scopeIds.has(firstId) || !scopeIds.has(secondId))) {
      return
    }
    if (!circlesById.has(secondId)) {
      return
    }

    const firstPeers = adjacency.get(firstId) ?? new Set<SketchCircleNode['id']>()
    firstPeers.add(secondId)
    adjacency.set(firstId, firstPeers)

    const secondPeers = adjacency.get(secondId) ?? new Set<SketchCircleNode['id']>()
    secondPeers.add(firstId)
    adjacency.set(secondId, secondPeers)
  }

  for (const [circleId, circle] of circlesById) {
    if (scopeIds && !scopeIds.has(circleId)) {
      continue
    }

    for (const constraint of getCircleConstraints(circleId, circlesById, constraintsById)) {
      if (constraint.kind !== kind) {
        continue
      }
      link(circleId, constraint.targetId)
    }

    if (scopeIds) {
      adjacency.set(circleId, adjacency.get(circleId) ?? new Set())
    }
  }

  return adjacency
}

function collectConstraintComponent(
  startId: SketchCircleNode['id'],
  adjacency: ReadonlyMap<SketchCircleNode['id'], ReadonlySet<SketchCircleNode['id']>>,
) {
  const visited = new Set<SketchCircleNode['id']>()
  const queue: SketchCircleNode['id'][] = [startId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || visited.has(currentId)) {
      continue
    }

    visited.add(currentId)
    for (const nextId of adjacency.get(currentId) ?? []) {
      if (!visited.has(nextId)) {
        queue.push(nextId)
      }
    }
  }

  return visited
}

function mergeCircleUpdateData(
  current: Partial<SketchCircleNode> | undefined,
  next: Partial<SketchCircleNode>,
) {
  if (!current) {
    return next
  }

  return {
    ...current,
    ...next,
    dimensions:
      current.dimensions || next.dimensions
        ? {
            ...(current.dimensions ?? {}),
            ...(next.dimensions ?? {}),
          }
        : undefined,
  }
}

function setCircleUpdate(
  updatesById: Map<SketchCircleNode['id'], Partial<SketchCircleNode>>,
  circleId: SketchCircleNode['id'],
  data: Partial<SketchCircleNode>,
) {
  updatesById.set(circleId, mergeCircleUpdateData(updatesById.get(circleId), data))
}

function getGeometryChangedCircleIds(
  updatesById: ReadonlyMap<SketchCircleNode['id'], Partial<SketchCircleNode>>,
) {
  return [...updatesById.entries()]
    .filter(
      ([, patch]) =>
        Object.prototype.hasOwnProperty.call(patch, 'center') ||
        Object.prototype.hasOwnProperty.call(patch, 'radius') ||
        Object.prototype.hasOwnProperty.call(patch, 'startAngle') ||
        Object.prototype.hasOwnProperty.call(patch, 'endAngle'),
    )
    .map(([circleId]) => circleId)
}

function getResolvedCircle(
  circleId: SketchCircleNode['id'],
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>,
  updatesById: ReadonlyMap<SketchCircleNode['id'], Partial<SketchCircleNode>>,
) {
  const circle = circlesById.get(circleId)
  if (!circle) {
    return null
  }

  const patch = updatesById.get(circleId)
  if (!patch) {
    return circle
  }

  return {
    ...circle,
    ...patch,
    dimensions: {
      ...(circle.dimensions ?? {}),
      ...(patch.dimensions ?? {}),
    },
  } satisfies SketchCircleNode
}

function buildRadiusChangePatch(args: {
  circle: SketchCircleNode
  radius: number
  dimensionMode?: 'driven' | 'reference'
}) {
  const { circle, radius, dimensionMode } = args
  if (getSketchCircleDimensionDisplay(circle) === 'arc-length') {
    const mode = dimensionMode ?? getSketchCircleArcLengthDimensionMode(circle)
    if (mode === 'driven' && hasSketchCircleArcLengthDimension(circle)) {
      const arcLength = circle.dimensions!.arcLength!
      const nextSweep = arcLength / radius
      if (nextSweep >= FULL_CIRCLE_RADIANS - EPSILON) {
        return {
          ok: false as const,
          reason: '当前弧长在新的半径下会退化为整圆，无法保持驱动弧长。',
        }
      }

      return {
        ok: true as const,
        patch: {
          radius,
          endAngle: circle.startAngle + nextSweep,
          dimensions: buildSketchCircleArcLengthDimensionData({
            circle,
            arcLength,
            mode,
          }),
        } satisfies Partial<SketchCircleNode>,
      }
    }

    return {
      ok: true as const,
      patch: {
        radius,
        dimensions: buildSketchCircleGeometryDimensionData({
          circle,
          radius,
          preserveDriven: true,
        }),
      } satisfies Partial<SketchCircleNode>,
    }
  }

  return {
    ok: true as const,
    patch: {
      radius,
      dimensions: buildSketchCircleRadiusDimensionData({
        circle,
        radius,
        mode: dimensionMode ?? getSketchCircleRadiusDimensionMode(circle) ?? 'driven',
        display: getSketchCircleDimensionDisplay(circle),
      }),
    } satisfies Partial<SketchCircleNode>,
  }
}

function toEditResult(
  updatesById: ReadonlyMap<SketchCircleNode['id'], Partial<SketchCircleNode>>,
  selectIds?: AnyNodeId[],
): SketchCircleEditResult {
  return {
    ok: true,
    updates: [...updatesById.entries()].map(([id, data]) => ({ id, data })),
    selectIds,
  }
}

function getCircleTangentConstraints(
  circleId: SketchCircleNode['id'],
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>,
  overrides?: ReadonlyMap<SketchCircleNode['id'], SketchCircleConstraint[]>,
) {
  return getCircleConstraints(circleId, circlesById, overrides).filter(
    (constraint) => constraint.kind === 'tangent',
  )
}

function getTangentEdgeKey(firstId: SketchCircleNode['id'], secondId: SketchCircleNode['id']) {
  return [firstId, secondId].sort().join(':')
}

function applyTangentConstraintsFromSources(args: {
  sourceIds: Iterable<SketchCircleNode['id']>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  constraintsById?: ReadonlyMap<SketchCircleNode['id'], SketchCircleConstraint[]>
  updatesById: Map<SketchCircleNode['id'], Partial<SketchCircleNode>>
}) {
  const { sourceIds, circlesById, constraintsById, updatesById } = args
  const queue = Array.from(new Set(sourceIds))
  const queued = new Set(queue)
  const processedEdges = new Set<string>()

  while (queue.length > 0) {
    const sourceId = queue.shift()
    if (!sourceId) {
      continue
    }
    queued.delete(sourceId)

    const source = getResolvedCircle(sourceId, circlesById, updatesById)
    if (!source) {
      continue
    }

    for (const constraint of getCircleTangentConstraints(sourceId, circlesById, constraintsById)) {
      const target = getResolvedCircle(constraint.targetId, circlesById, updatesById)
      if (!target) {
        continue
      }

      const edgeKey = getTangentEdgeKey(source.id, target.id)
      if (processedEdges.has(edgeKey)) {
        continue
      }
      processedEdges.add(edgeKey)

      const tangentMode = getConstraintTangentMode(constraint, source, target)
      const tangentPeer = buildTangentPeerCenter({
        source,
        target,
        mode: tangentMode,
      })
      if (!tangentPeer.ok) {
        return tangentPeer
      }

      const nextCenter = tangentPeer.center
      if (hasRelation(target, 'fixed') && !arePointsCoincident(target.center, nextCenter)) {
        return {
          ok: false as const,
          reason: '相切约束组中存在固定圆，无法同步位置。',
        }
      }

      const existingCenter = updatesById.get(target.id)?.center
      if (
        existingCenter &&
        !arePointsCoincident(existingCenter as SketchCirclePlanPoint, nextCenter) &&
        !arePointsCoincident(target.center, nextCenter)
      ) {
        return {
          ok: false as const,
          reason: '相切约束当前无法同时满足多个圆心位置。',
        }
      }

      if (!arePointsCoincident(target.center, nextCenter)) {
        setCircleUpdate(updatesById, target.id, { center: nextCenter })
        if (!queued.has(target.id)) {
          queue.push(target.id)
          queued.add(target.id)
        }
      }
    }
  }

  return { ok: true as const }
}

function hasDirectConstraintKind(args: {
  firstId: SketchCircleNode['id']
  secondId: SketchCircleNode['id']
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  constraintsById?: ReadonlyMap<SketchCircleNode['id'], SketchCircleConstraint[]>
  kind: SketchCircleConstraintKind
}) {
  const { firstId, secondId, circlesById, constraintsById, kind } = args
  return getCircleConstraints(firstId, circlesById, constraintsById).some(
    (constraint) => constraint.kind === kind && constraint.targetId === secondId,
  )
}

function resolvePreferredTangentMode(args: { source: SketchCircleNode; target: SketchCircleNode }) {
  const { source, target } = args
  const distance = Math.hypot(
    target.center[0] - source.center[0],
    target.center[1] - source.center[1],
  )
  const candidateModes = (['external', 'internal'] as SketchCircleTangentMode[])
    .filter((mode) => getTangentModeDistance(source, target, mode) > EPSILON)
    .sort(
      (first, second) =>
        Math.abs(distance - getTangentModeDistance(source, target, first)) -
        Math.abs(distance - getTangentModeDistance(source, target, second)),
    )

  for (const mode of candidateModes) {
    const tangentPeer = buildTangentPeerCenter({ source, target, mode })
    if (tangentPeer.ok) {
      return {
        ok: true as const,
        mode,
      }
    }
  }

  return {
    ok: false as const,
    reason: '当前圆/圆弧组合无法建立有效的相切约束。',
  }
}

function applyRadiusToConstraintComponent(args: {
  anchor: SketchCircleNode
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  constraintsById?: ReadonlyMap<SketchCircleNode['id'], SketchCircleConstraint[]>
  updatesById: Map<SketchCircleNode['id'], Partial<SketchCircleNode>>
}) {
  const { anchor, circlesById, constraintsById, updatesById } = args
  const adjacency = buildConstraintAdjacency({
    circlesById,
    constraintsById,
    kind: 'equal-radius',
  })
  const component = collectConstraintComponent(anchor.id, adjacency)

  for (const circleId of component) {
    const circle = circlesById.get(circleId)
    if (!circle) {
      continue
    }

    if (hasRelation(circle, 'fixed') && !hasMatchingRadius(circle, anchor.radius)) {
      return {
        ok: false as const,
        reason: '等半径约束组中存在固定圆，无法同步半径。',
      }
    }

    if (
      !hasMatchingRadius(circle, anchor.radius) ||
      circle.dimensions?.radius === undefined ||
      Math.abs(circle.dimensions.radius - anchor.radius) > EPSILON
    ) {
      const patch = buildRadiusChangePatch({
        circle,
        radius: anchor.radius,
      })
      if (!patch.ok) {
        return patch
      }
      setCircleUpdate(updatesById, circle.id, patch.patch)
    }
  }

  return { ok: true as const }
}

function applyCenterToConstraintComponent(args: {
  anchor: SketchCircleNode
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  constraintsById?: ReadonlyMap<SketchCircleNode['id'], SketchCircleConstraint[]>
  updatesById: Map<SketchCircleNode['id'], Partial<SketchCircleNode>>
}) {
  const { anchor, circlesById, constraintsById, updatesById } = args
  const adjacency = buildConstraintAdjacency({
    circlesById,
    constraintsById,
    kind: 'concentric',
  })
  const component = collectConstraintComponent(anchor.id, adjacency)

  for (const circleId of component) {
    const circle = circlesById.get(circleId)
    if (!circle) {
      continue
    }

    if (hasRelation(circle, 'fixed') && !arePointsCoincident(circle.center, anchor.center)) {
      return {
        ok: false as const,
        reason: '同心约束组中存在固定圆，无法移动圆心。',
      }
    }

    if (!arePointsCoincident(circle.center, anchor.center)) {
      setCircleUpdate(updatesById, circle.id, { center: anchor.center })
    }
  }

  return { ok: true as const }
}

export function buildSetSketchCircleRadiusPlan(args: {
  circle: SketchCircleNode
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  radius: number
  dimensionMode?: 'driven' | 'reference'
}): SketchCircleEditResult {
  const { circle, circlesById, dimensionMode, radius } = args
  if (!Number.isFinite(radius) || radius <= EPSILON) {
    return { ok: false, reason: '草图圆半径必须大于 0。' }
  }

  if (hasRelation(circle, 'fixed')) {
    return { ok: false, reason: '固定的草图圆无法修改半径。' }
  }

  const rootPatch = buildRadiusChangePatch({ circle, radius, dimensionMode })
  if (!rootPatch.ok) {
    return rootPatch
  }

  const anchor: SketchCircleNode = {
    ...circle,
    ...rootPatch.patch,
    dimensions: rootPatch.patch.dimensions ?? circle.dimensions,
  }
  const updatesById = new Map<SketchCircleNode['id'], Partial<SketchCircleNode>>()
  setCircleUpdate(updatesById, circle.id, rootPatch.patch)

  const propagated = applyRadiusToConstraintComponent({
    anchor,
    circlesById,
    updatesById,
  })
  if (!propagated.ok) {
    return propagated
  }

  const tangentPropagation = applyTangentConstraintsFromSources({
    sourceIds: getGeometryChangedCircleIds(updatesById),
    circlesById,
    updatesById,
  })
  if (!tangentPropagation.ok) {
    return tangentPropagation
  }

  return toEditResult(updatesById, [circle.id])
}

export function buildSetSketchCircleArcLengthPlan(args: {
  circle: SketchCircleNode
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  arcLength: number
  dimensionMode?: 'driven' | 'reference'
}): SketchCircleEditResult {
  const { arcLength, circle, circlesById, dimensionMode } = args
  if (circle.kind !== 'arc') {
    return { ok: false, reason: '当前仅支持为草图圆弧设置弧长尺寸。' }
  }

  if (!Number.isFinite(arcLength) || arcLength <= EPSILON) {
    return { ok: false, reason: '草图圆弧弧长必须大于 0。' }
  }

  if (hasRelation(circle, 'fixed')) {
    return { ok: false, reason: '固定的草图圆弧无法修改弧长。' }
  }

  const nextSweep = arcLength / circle.radius
  if (nextSweep >= FULL_CIRCLE_RADIANS - EPSILON) {
    return { ok: false, reason: '草图圆弧弧长必须小于当前半径对应的整圆周长。' }
  }

  const updatesById = new Map<SketchCircleNode['id'], Partial<SketchCircleNode>>()
  setCircleUpdate(updatesById, circle.id, {
    endAngle: circle.startAngle + nextSweep,
    dimensions: buildSketchCircleArcLengthDimensionData({
      circle,
      arcLength,
      mode: dimensionMode ?? getSketchCircleArcLengthDimensionMode(circle) ?? 'driven',
    }),
  })

  const tangentPropagation = applyTangentConstraintsFromSources({
    sourceIds: [circle.id],
    circlesById,
    updatesById,
  })
  if (!tangentPropagation.ok) {
    return tangentPropagation
  }

  return toEditResult(updatesById, [circle.id])
}

export function buildSetSketchCircleCenterPlan(args: {
  circle: SketchCircleNode
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  center: SketchCirclePlanPoint
}): SketchCircleEditResult {
  const { circle, circlesById, center } = args
  if (hasRelation(circle, 'fixed')) {
    return { ok: false, reason: '固定的草图圆无法修改圆心。' }
  }

  const anchor: SketchCircleNode = {
    ...circle,
    center,
  }
  const updatesById = new Map<SketchCircleNode['id'], Partial<SketchCircleNode>>()
  if (!arePointsCoincident(circle.center, center)) {
    setCircleUpdate(updatesById, circle.id, { center })
  }

  const propagated = applyCenterToConstraintComponent({
    anchor,
    circlesById,
    updatesById,
  })
  if (!propagated.ok) {
    return propagated
  }

  const tangentPropagation = applyTangentConstraintsFromSources({
    sourceIds: getGeometryChangedCircleIds(updatesById),
    circlesById,
    updatesById,
  })
  if (!tangentPropagation.ok) {
    return tangentPropagation
  }

  return toEditResult(updatesById, [circle.id])
}

export function isSketchCircleConstraintActive(args: {
  circles: SketchCircleNode[]
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  kind: SketchCircleConstraintKind
}) {
  const { circles, circlesById, kind } = args
  const selectedIds = Array.from(new Set(circles.map((circle) => circle.id)))
  if (selectedIds.length < 2) {
    return false
  }

  if (kind === 'tangent') {
    if (selectedIds.length !== 2) {
      return false
    }

    return hasDirectConstraintKind({
      firstId: selectedIds[0]!,
      secondId: selectedIds[1]!,
      circlesById,
      kind,
    })
  }

  const scopeIds = new Set(selectedIds)
  const adjacency = buildConstraintAdjacency({
    circlesById,
    kind,
    scopeIds,
  })
  const component = collectConstraintComponent(selectedIds[0]!, adjacency)
  return selectedIds.every((circleId) => component.has(circleId))
}

export function buildToggleSketchCircleConstraintPlan(args: {
  circles: SketchCircleNode[]
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  kind: SketchCircleConstraintKind
}): SketchCircleEditResult {
  const { circles, circlesById, kind } = args
  const selectedIds = Array.from(new Set(circles.map((circle) => circle.id)))
  if (selectedIds.length < 2) {
    return { ok: false, reason: '请至少选择两个草图圆或圆弧。' }
  }
  if (kind === 'tangent' && selectedIds.length !== 2) {
    return { ok: false, reason: '圆/圆弧相切约束一次只支持两个实体。' }
  }

  const selectedIdSet = new Set(selectedIds)
  const isActive = isSketchCircleConstraintActive({ circles, circlesById, kind })
  const nextConstraintsById = new Map<SketchCircleNode['id'], SketchCircleConstraint[]>()
  const updatesById = new Map<SketchCircleNode['id'], Partial<SketchCircleNode>>()

  if (isActive) {
    removeConstraintPairs(nextConstraintsById, circlesById, selectedIdSet, kind)
  } else {
    if (kind === 'tangent') {
      const first = circles[0]!
      const second = circles[1]!
      if (
        hasDirectConstraintKind({
          firstId: first.id,
          secondId: second.id,
          circlesById,
          kind: 'concentric',
        })
      ) {
        return { ok: false, reason: '已设为同心的圆/圆弧不能再添加相切约束。' }
      }

      const tangentMode = resolvePreferredTangentMode({
        source: first,
        target: second,
      })
      if (!tangentMode.ok) {
        return tangentMode
      }

      setConstraintPair(
        nextConstraintsById,
        circlesById,
        first.id,
        second.id,
        kind,
        tangentMode.mode,
      )
    } else {
      for (let firstIndex = 0; firstIndex < selectedIds.length; firstIndex += 1) {
        const firstId = selectedIds[firstIndex]!
        for (let secondIndex = firstIndex + 1; secondIndex < selectedIds.length; secondIndex += 1) {
          const secondId = selectedIds[secondIndex]!
          setConstraintPair(nextConstraintsById, circlesById, firstId, secondId, kind)
        }
      }
    }
  }

  for (const circleId of selectedIds) {
    const currentConstraints = getCircleConstraints(circleId, circlesById)
    const nextConstraints = getCircleConstraints(circleId, circlesById, nextConstraintsById)
    if (!areConstraintsEqual(currentConstraints, nextConstraints)) {
      setCircleUpdate(updatesById, circleId, { constraints: nextConstraints })
    }
  }

  if (!isActive) {
    const anchor = circles[0]!
    const propagated =
      kind === 'equal-radius'
        ? applyRadiusToConstraintComponent({
            anchor,
            circlesById,
            constraintsById: nextConstraintsById,
            updatesById,
          })
        : kind === 'concentric'
          ? applyCenterToConstraintComponent({
              anchor,
              circlesById,
              constraintsById: nextConstraintsById,
              updatesById,
            })
          : applyTangentConstraintsFromSources({
              sourceIds: selectedIds,
              circlesById,
              constraintsById: nextConstraintsById,
              updatesById,
            })

    if (!propagated.ok) {
      return propagated
    }

    if (kind !== 'tangent') {
      const tangentPropagation = applyTangentConstraintsFromSources({
        sourceIds: getGeometryChangedCircleIds(updatesById),
        circlesById,
        constraintsById: nextConstraintsById,
        updatesById,
      })
      if (!tangentPropagation.ok) {
        return tangentPropagation
      }
    }
  }

  return toEditResult(updatesById, selectedIds)
}

export function buildRemoveSketchCircleConstraintReferencesPlan(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  deletedIds: Iterable<SketchCircleNode['id']>
}) {
  const { circlesById, deletedIds } = args
  const deletedIdSet = new Set(deletedIds)
  const updates: SketchCircleEditUpdate[] = []

  for (const [circleId, circle] of circlesById) {
    if (deletedIdSet.has(circleId)) {
      continue
    }

    const currentConstraints = getCircleConstraints(circleId, circlesById)
    const nextConstraints = currentConstraints.filter(
      (constraint) => !deletedIdSet.has(constraint.targetId),
    )
    if (!areConstraintsEqual(currentConstraints, nextConstraints)) {
      updates.push({
        id: circleId,
        data: {
          constraints: nextConstraints,
        },
      })
    }
  }

  return updates
}
