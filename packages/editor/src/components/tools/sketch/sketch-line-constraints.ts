import type {
  AnyNodeId,
  SketchLineConstraint,
  SketchLineConstraintKind,
  SketchLineNode,
} from '@pascal-app/core'

export type SketchLineConstraintEditUpdate = {
  id: SketchLineNode['id']
  data: Partial<SketchLineNode>
}

export type SketchLineConstraintEditResult =
  | {
      ok: true
      updates: SketchLineConstraintEditUpdate[]
      selectIds?: AnyNodeId[]
    }
  | {
      ok: false
      reason: string
    }

type SketchPlanPoint = [number, number]
type LineAnchorMode = 'start' | 'end' | 'midpoint' | 'locked'
type SketchLineConstraintPatchResult =
  | {
      ok: true
      patch: Partial<SketchLineNode> | null
    }
  | {
      ok: false
      reason: string
    }

const EPSILON = 1e-6

function pointDistance(a: SketchPlanPoint, b: SketchPlanPoint) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

function subtractPoint(a: SketchPlanPoint, b: SketchPlanPoint): SketchPlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

function addPoint(a: SketchPlanPoint, b: SketchPlanPoint): SketchPlanPoint {
  return [a[0] + b[0], a[1] + b[1]]
}

function scalePoint(point: SketchPlanPoint, scalar: number): SketchPlanPoint {
  return [point[0] * scalar, point[1] * scalar]
}

function dot(first: SketchPlanPoint, second: SketchPlanPoint) {
  return first[0] * second[0] + first[1] * second[1]
}

function cross(first: SketchPlanPoint, second: SketchPlanPoint) {
  return first[0] * second[1] - first[1] * second[0]
}

function midpoint(line: Pick<SketchLineNode, 'start' | 'end'>): SketchPlanPoint {
  return [(line.start[0] + line.end[0]) / 2, (line.start[1] + line.end[1]) / 2]
}

function rotatePerpendicular(direction: SketchPlanPoint): SketchPlanPoint {
  return [-direction[1], direction[0]]
}

function hasFixedRelation(line: SketchLineNode) {
  return (line.relations ?? []).includes('fixed')
}

function isStraightLine(line: Pick<SketchLineNode, 'curveOffset'>) {
  return Math.abs(line.curveOffset ?? 0) <= EPSILON
}

function getSketchLineLength(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return pointDistance(line.start, line.end)
}

function normalizeDirection(direction: SketchPlanPoint | null) {
  if (!direction) {
    return null
  }

  const length = Math.hypot(direction[0], direction[1])
  if (length <= EPSILON) {
    return null
  }

  return [direction[0] / length, direction[1] / length] as SketchPlanPoint
}

function getLineDirection(
  line: Pick<SketchLineNode, 'start' | 'end' | 'relations'>,
): SketchPlanPoint | null {
  if ((line.relations ?? []).includes('horizontal')) {
    return [line.end[0] >= line.start[0] ? 1 : -1, 0]
  }

  if ((line.relations ?? []).includes('vertical')) {
    return [0, line.end[1] >= line.start[1] ? 1 : -1]
  }

  return normalizeDirection(subtractPoint(line.end, line.start))
}

function getAnchorMode(line: SketchLineNode): LineAnchorMode {
  const hasStart = Boolean(line.coincident?.start)
  const hasEnd = Boolean(line.coincident?.end)
  if (hasStart && hasEnd) {
    return 'locked'
  }
  if (hasStart) {
    return 'start'
  }
  if (hasEnd) {
    return 'end'
  }
  return 'midpoint'
}

function pointsApproximatelyEqual(first: SketchPlanPoint, second: SketchPlanPoint) {
  return (
    Math.abs(first[0] - second[0]) <= EPSILON && Math.abs(first[1] - second[1]) <= EPSILON
  )
}

function lineMatchesGeometry(
  line: Pick<SketchLineNode, 'start' | 'end'>,
  start: SketchPlanPoint,
  end: SketchPlanPoint,
) {
  return pointsApproximatelyEqual(line.start, start) && pointsApproximatelyEqual(line.end, end)
}

function chooseBestDirection(
  line: Pick<SketchLineNode, 'start' | 'end' | 'relations'>,
  candidates: SketchPlanPoint[],
) {
  const current = getLineDirection(line)
  if (!current) {
    return candidates[0]!
  }

  return [...candidates].sort((first, second) => {
    return dot(second, current) - dot(first, current)
  })[0]!
}

function buildLineFromAnchor(args: {
  line: SketchLineNode
  direction: SketchPlanPoint
  length: number
  mode: LineAnchorMode
  center?: SketchPlanPoint
}) {
  const { line, direction, length, mode, center } = args
  switch (mode) {
    case 'start':
      return {
        start: line.start,
        end: addPoint(line.start, scalePoint(direction, length)),
      }
    case 'end':
      return {
        start: addPoint(line.end, scalePoint(direction, -length)),
        end: line.end,
      }
    case 'midpoint': {
      const nextCenter = center ?? midpoint(line)
      const half = scalePoint(direction, length / 2)
      return {
        start: addPoint(nextCenter, scalePoint(half, -1)),
        end: addPoint(nextCenter, half),
      }
    }
    case 'locked':
      return {
        start: line.start,
        end: line.end,
      }
  }
}

function filterOrientationRelations(line: SketchLineNode) {
  return (line.relations ?? []).filter(
    (relation) => relation !== 'horizontal' && relation !== 'vertical',
  )
}

function projectPointOntoInfiniteLine(
  point: SketchPlanPoint,
  line: Pick<SketchLineNode, 'start' | 'end' | 'relations'>,
  direction: SketchPlanPoint,
) {
  const offset = subtractPoint(point, line.start)
  return addPoint(line.start, scalePoint(direction, dot(offset, direction)))
}

function isPointOnInfiniteLine(
  point: SketchPlanPoint,
  line: Pick<SketchLineNode, 'start' | 'end'>,
  direction: SketchPlanPoint,
) {
  return Math.abs(cross(subtractPoint(point, line.start), direction)) <= EPSILON
}

function normalizeConstraints(
  lineId: SketchLineNode['id'],
  constraints: SketchLineConstraint[] | undefined,
) {
  const next: SketchLineConstraint[] = []
  const seen = new Set<string>()

  for (const constraint of constraints ?? []) {
    if (constraint.targetId === lineId) {
      continue
    }

    const key = `${constraint.kind}:${constraint.targetId}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    next.push(constraint)
  }

  return next
}

function areConstraintsEqual(
  first: SketchLineConstraint[] | undefined,
  second: SketchLineConstraint[] | undefined,
) {
  const left = first ?? []
  const right = second ?? []
  if (left.length !== right.length) {
    return false
  }

  return left.every(
    (constraint, index) =>
      constraint.kind === right[index]?.kind && constraint.targetId === right[index]?.targetId,
  )
}

function getLineConstraints(
  lineId: SketchLineNode['id'],
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>,
  overrides?: ReadonlyMap<SketchLineNode['id'], SketchLineConstraint[]>,
) {
  const override = overrides?.get(lineId)
  if (override) {
    return normalizeConstraints(lineId, override)
  }

  return normalizeConstraints(lineId, linesById.get(lineId)?.constraints)
}

function setConstraintPair(
  constraintsById: Map<SketchLineNode['id'], SketchLineConstraint[]>,
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>,
  firstId: SketchLineNode['id'],
  secondId: SketchLineNode['id'],
  kind: SketchLineConstraintKind,
) {
  const firstConstraints = getLineConstraints(firstId, linesById, constraintsById)
  if (!firstConstraints.some((constraint) => constraint.kind === kind && constraint.targetId === secondId)) {
    firstConstraints.push({ kind, targetId: secondId })
  }
  constraintsById.set(firstId, normalizeConstraints(firstId, firstConstraints))

  const secondConstraints = getLineConstraints(secondId, linesById, constraintsById)
  if (!secondConstraints.some((constraint) => constraint.kind === kind && constraint.targetId === firstId)) {
    secondConstraints.push({ kind, targetId: firstId })
  }
  constraintsById.set(secondId, normalizeConstraints(secondId, secondConstraints))
}

function getConstraintKindsBetweenLines(args: {
  firstId: SketchLineNode['id']
  secondId: SketchLineNode['id']
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  constraintsById?: ReadonlyMap<SketchLineNode['id'], SketchLineConstraint[]>
}) {
  const { firstId, secondId, linesById, constraintsById } = args
  const kinds = new Set<SketchLineConstraintKind>()

  for (const constraint of getLineConstraints(firstId, linesById, constraintsById)) {
    if (constraint.targetId === secondId) {
      kinds.add(constraint.kind)
    }
  }
  for (const constraint of getLineConstraints(secondId, linesById, constraintsById)) {
    if (constraint.targetId === firstId) {
      kinds.add(constraint.kind)
    }
  }

  return kinds
}

function getConstraintConflictKinds(kind: SketchLineConstraintKind) {
  if (kind === 'parallel') {
    return new Set<SketchLineConstraintKind>(['perpendicular'])
  }
  if (kind === 'perpendicular') {
    return new Set<SketchLineConstraintKind>(['parallel', 'collinear'])
  }
  if (kind === 'collinear') {
    return new Set<SketchLineConstraintKind>(['perpendicular'])
  }
  return new Set<SketchLineConstraintKind>()
}

function getConstraintKindLabel(kind: SketchLineConstraintKind) {
  if (kind === 'equal-length') {
    return '等长'
  }
  if (kind === 'parallel') {
    return '平行'
  }
  if (kind === 'perpendicular') {
    return '垂直'
  }
  return '共线'
}

function getLineDisplayName(line: SketchLineNode | undefined, fallbackIndex: number) {
  return line?.name || `草图线 ${fallbackIndex}`
}

function validateConstraintPairCompatibility(args: {
  firstId: SketchLineNode['id']
  secondId: SketchLineNode['id']
  kind: SketchLineConstraintKind
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  constraintsById?: ReadonlyMap<SketchLineNode['id'], SketchLineConstraint[]>
}): SketchLineConstraintEditResult | null {
  const { firstId, secondId, kind, linesById, constraintsById } = args
  const conflictingKinds = getConstraintConflictKinds(kind)
  if (conflictingKinds.size === 0) {
    return null
  }

  const existingKinds = getConstraintKindsBetweenLines({
    firstId,
    secondId,
    linesById,
    constraintsById,
  })
  const conflictingKind = [...existingKinds].find((existingKind) => conflictingKinds.has(existingKind))
  if (!conflictingKind) {
    return null
  }

  const firstLine = linesById.get(firstId)
  const secondLine = linesById.get(secondId)
  return {
    ok: false,
    reason: `${getLineDisplayName(firstLine, 1)} 与 ${getLineDisplayName(secondLine, 2)} 已存在${getConstraintKindLabel(conflictingKind)}约束，不能再添加${getConstraintKindLabel(kind)}约束。`,
  }
}

function removeConstraintPairs(
  constraintsById: Map<SketchLineNode['id'], SketchLineConstraint[]>,
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>,
  lineIds: Set<SketchLineNode['id']>,
  kind: SketchLineConstraintKind,
) {
  for (const lineId of lineIds) {
    const nextConstraints = getLineConstraints(lineId, linesById, constraintsById).filter(
      (constraint) => !(constraint.kind === kind && lineIds.has(constraint.targetId)),
    )
    constraintsById.set(lineId, nextConstraints)
  }
}

function buildConstraintAdjacency(args: {
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  constraintsById?: ReadonlyMap<SketchLineNode['id'], SketchLineConstraint[]>
  kind: SketchLineConstraintKind
  scopeIds?: ReadonlySet<SketchLineNode['id']>
}) {
  const { linesById, constraintsById, kind, scopeIds } = args
  const adjacency = new Map<SketchLineNode['id'], Set<SketchLineNode['id']>>()

  const link = (firstId: SketchLineNode['id'], secondId: SketchLineNode['id']) => {
    if (firstId === secondId) {
      return
    }
    if (scopeIds && (!scopeIds.has(firstId) || !scopeIds.has(secondId))) {
      return
    }
    if (!linesById.has(secondId)) {
      return
    }

    const firstPeers = adjacency.get(firstId) ?? new Set<SketchLineNode['id']>()
    firstPeers.add(secondId)
    adjacency.set(firstId, firstPeers)

    const secondPeers = adjacency.get(secondId) ?? new Set<SketchLineNode['id']>()
    secondPeers.add(firstId)
    adjacency.set(secondId, secondPeers)
  }

  for (const [lineId] of linesById) {
    if (scopeIds && !scopeIds.has(lineId)) {
      continue
    }

    for (const constraint of getLineConstraints(lineId, linesById, constraintsById)) {
      if (constraint.kind !== kind) {
        continue
      }
      link(lineId, constraint.targetId)
    }

    if (scopeIds) {
      adjacency.set(lineId, adjacency.get(lineId) ?? new Set())
    }
  }

  return adjacency
}

function collectConstraintComponent(
  startId: SketchLineNode['id'],
  adjacency: ReadonlyMap<SketchLineNode['id'], ReadonlySet<SketchLineNode['id']>>,
) {
  const visited = new Set<SketchLineNode['id']>()
  const queue: SketchLineNode['id'][] = [startId]

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

function mergeLineUpdateData(
  current: Partial<SketchLineNode> | undefined,
  next: Partial<SketchLineNode>,
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

function setLineUpdate(
  updatesById: Map<SketchLineNode['id'], Partial<SketchLineNode>>,
  lineId: SketchLineNode['id'],
  data: Partial<SketchLineNode>,
) {
  updatesById.set(lineId, mergeLineUpdateData(updatesById.get(lineId), data))
}

function toEditResult(
  updatesById: ReadonlyMap<SketchLineNode['id'], Partial<SketchLineNode>>,
  selectIds?: AnyNodeId[],
): SketchLineConstraintEditResult {
  return {
    ok: true,
    updates: [...updatesById.entries()].map(([id, data]) => ({ id, data })),
    selectIds,
  }
}

function buildConstraintTargetPatch(args: {
  source: SketchLineNode
  target: SketchLineNode
  kind: SketchLineConstraintKind
}): SketchLineConstraintPatchResult {
  const { source, target, kind } = args
  if (!(isStraightLine(source) && isStraightLine(target))) {
    return { ok: false, reason: '当前仅支持直线草图的线约束。' }
  }

  const sourceDirection = getLineDirection(source)
  if (!sourceDirection) {
    return { ok: false, reason: '约束参考草图线太短，无法传播。' }
  }

  const targetLength = getSketchLineLength(target)
  if (targetLength <= EPSILON) {
    return { ok: false, reason: '被约束草图线太短，无法参与约束。' }
  }

  const anchorMode = getAnchorMode(target)
  let nextLength = targetLength
  let direction = sourceDirection
  let nextCenter: SketchPlanPoint | undefined
  let nextRelations: SketchLineNode['relations'] | undefined

  if (kind === 'equal-length') {
    nextLength = getSketchLineLength(source)
    const targetDirection = getLineDirection(target) ?? sourceDirection
    direction = chooseBestDirection(target, [targetDirection, scalePoint(targetDirection, -1)])
  } else if (kind === 'parallel') {
    direction = chooseBestDirection(target, [sourceDirection, scalePoint(sourceDirection, -1)])
    nextRelations = filterOrientationRelations(target)
  } else if (kind === 'perpendicular') {
    const perpendicular = rotatePerpendicular(sourceDirection)
    direction = chooseBestDirection(target, [perpendicular, scalePoint(perpendicular, -1)])
    nextRelations = filterOrientationRelations(target)
  } else {
    direction = chooseBestDirection(target, [sourceDirection, scalePoint(sourceDirection, -1)])
    nextRelations = filterOrientationRelations(target)
    if (anchorMode === 'midpoint') {
      nextCenter = projectPointOntoInfiniteLine(midpoint(target), source, direction)
    } else if (anchorMode === 'start') {
      if (!isPointOnInfiniteLine(target.start, source, direction)) {
        return { ok: false, reason: '存在带端点约束的草图线，无法同时保持共线。' }
      }
    } else if (anchorMode === 'end') {
      if (!isPointOnInfiniteLine(target.end, source, direction)) {
        return { ok: false, reason: '存在带端点约束的草图线，无法同时保持共线。' }
      }
    }
  }

  const geometry = buildLineFromAnchor({
    line: target,
    direction,
    length: nextLength,
    mode: anchorMode,
    center: nextCenter,
  })

  if (anchorMode === 'locked' && !lineMatchesGeometry(target, geometry.start, geometry.end)) {
    return { ok: false, reason: '存在双端点受限的草图线，无法满足新的线约束。' }
  }

  if (hasFixedRelation(target) && !lineMatchesGeometry(target, geometry.start, geometry.end)) {
    return { ok: false, reason: '约束组中存在固定草图线，无法同步更新。' }
  }

  if (lineMatchesGeometry(target, geometry.start, geometry.end)) {
    if (
      kind !== 'equal-length' &&
      nextRelations &&
      nextRelations.length !== (target.relations ?? []).length
    ) {
      return {
        ok: true,
        patch: {
          relations: nextRelations,
        },
      }
    }
    return { ok: true, patch: null }
  }

  const patch: Partial<SketchLineNode> = {
    start: geometry.start,
    end: geometry.end,
  }
  if (kind === 'equal-length') {
    patch.dimensions = target.dimensions?.length
      ? {
          ...target.dimensions,
          length: nextLength,
        }
      : target.dimensions
  } else if (nextRelations) {
    patch.relations = nextRelations
  }

  return { ok: true, patch }
}

export function isSketchLineConstraintActive(args: {
  lines: SketchLineNode[]
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  kind: SketchLineConstraintKind
}) {
  const { lines, linesById, kind } = args
  const selectedIds = Array.from(new Set(lines.map((line) => line.id)))
  if (selectedIds.length < 2) {
    return false
  }

  const scopeIds = new Set(selectedIds)
  const adjacency = buildConstraintAdjacency({
    linesById,
    kind,
    scopeIds,
  })
  const component = collectConstraintComponent(selectedIds[0]!, adjacency)
  return selectedIds.every((lineId) => component.has(lineId))
}

export function buildToggleSketchLineConstraintPlan(args: {
  lines: SketchLineNode[]
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  kind: SketchLineConstraintKind
}): SketchLineConstraintEditResult {
  const { lines, linesById, kind } = args
  const selectedIds = Array.from(new Set(lines.map((line) => line.id)))
  if (selectedIds.length < 2) {
    return { ok: false, reason: '请至少选择两条草图线。' }
  }

  const selectedIdSet = new Set(selectedIds)
  const isActive = isSketchLineConstraintActive({ lines, linesById, kind })
  const nextConstraintsById = new Map<SketchLineNode['id'], SketchLineConstraint[]>()
  const updatesById = new Map<SketchLineNode['id'], Partial<SketchLineNode>>()

  if (isActive) {
    removeConstraintPairs(nextConstraintsById, linesById, selectedIdSet, kind)
  } else {
    for (let firstIndex = 0; firstIndex < selectedIds.length; firstIndex += 1) {
      const firstId = selectedIds[firstIndex]!
      for (let secondIndex = firstIndex + 1; secondIndex < selectedIds.length; secondIndex += 1) {
        const secondId = selectedIds[secondIndex]!
        const compatibility = validateConstraintPairCompatibility({
          firstId,
          secondId,
          kind,
          linesById,
        })
        if (compatibility) {
          return compatibility
        }
        setConstraintPair(nextConstraintsById, linesById, firstId, secondId, kind)
      }
    }
  }

  const nextLineById = new Map(linesById)
  for (const lineId of selectedIds) {
    const line = linesById.get(lineId)
    if (!line) {
      continue
    }

    const currentConstraints = getLineConstraints(lineId, linesById)
    const nextConstraints = getLineConstraints(lineId, linesById, nextConstraintsById)
    if (!areConstraintsEqual(currentConstraints, nextConstraints)) {
      setLineUpdate(updatesById, lineId, { constraints: nextConstraints })
      nextLineById.set(lineId, { ...line, constraints: nextConstraints })
    }
  }

  if (!isActive) {
    const propagated = buildPropagateSketchLineConstraintsFromLines({
      linesById: nextLineById,
      changedLineIds: [selectedIds[0]!],
    })
    if (!propagated.ok) {
      return propagated
    }

    for (const update of propagated.updates) {
      setLineUpdate(updatesById, update.id, update.data)
    }
  }

  return toEditResult(updatesById, selectedIds)
}

export function buildPropagateSketchLineConstraintsFromLines(args: {
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  changedLineIds: Iterable<SketchLineNode['id']>
}): SketchLineConstraintEditResult {
  const { linesById, changedLineIds } = args
  const nextLineById = new Map(linesById)
  const updatesById = new Map<SketchLineNode['id'], Partial<SketchLineNode>>()
  const queue = [...new Set(changedLineIds)]
  const seenKeys = new Set<string>()
  let iterationCount = 0

  while (queue.length > 0) {
    const sourceId = queue.shift()
    const source = sourceId ? nextLineById.get(sourceId) : null
    if (!source) {
      continue
    }

    for (const constraint of normalizeConstraints(source.id, source.constraints)) {
      const target = nextLineById.get(constraint.targetId)
      if (!target) {
        continue
      }

      const seenKey = `${source.id}:${constraint.kind}:${target.id}`
      if (seenKeys.has(seenKey) && iterationCount > nextLineById.size * 8) {
        continue
      }

      seenKeys.add(seenKey)
      iterationCount += 1
      const result = buildConstraintTargetPatch({
        source,
        target,
        kind: constraint.kind,
      })
      if (!result.ok) {
        return result
      }

      if (!result.patch) {
        continue
      }

      const nextTarget = { ...target, ...result.patch }
      nextLineById.set(target.id, nextTarget)
      setLineUpdate(updatesById, target.id, result.patch)
      queue.push(target.id)
    }
  }

  return toEditResult(updatesById)
}

export function buildRemoveSketchLineConstraintReferencesPlan(args: {
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  deletedIds: Iterable<SketchLineNode['id']>
}) {
  const { linesById, deletedIds } = args
  const deletedIdSet = new Set(deletedIds)
  const updates: SketchLineConstraintEditUpdate[] = []

  for (const [lineId] of linesById) {
    if (deletedIdSet.has(lineId)) {
      continue
    }

    const currentConstraints = getLineConstraints(lineId, linesById)
    const nextConstraints = currentConstraints.filter(
      (constraint) => !deletedIdSet.has(constraint.targetId),
    )
    if (!areConstraintsEqual(currentConstraints, nextConstraints)) {
      updates.push({
        id: lineId,
        data: {
          constraints: nextConstraints,
        },
      })
    }
  }

  return updates
}
