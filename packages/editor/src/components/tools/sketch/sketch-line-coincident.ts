import type { SketchCircleNode, SketchLineNode } from '@pascal-app/core'
import type { SketchLineEditUpdate } from './sketch-geometry'
import {
  areSketchCoincidentReferencesEqual,
  doesSketchCoincidentReferenceTargetCircle,
  doesSketchCoincidentReferenceTargetLine,
  isSketchCoincidentCirclePointReference,
  isSketchCoincidentEndpointReference,
  isSketchCoincidentLinePointReference,
  resolveSketchLineCoincidentReference,
  type SketchPlanPoint,
} from './sketch-coincident'

type SketchLineCoincidentPropagationResult =
  | {
      ok: true
      updates: SketchLineEditUpdate[]
    }
  | {
      ok: false
      reason: string
    }

type SketchLineCoincidentPatchResult =
  | {
      ok: true
      patch: Partial<SketchLineNode> | null
    }
  | {
      ok: false
      reason: string
    }

const EPSILON = 1e-6
const FULL_CIRCLE_RADIANS = Math.PI * 2

function pointsApproximatelyEqual(first: SketchPlanPoint, second: SketchPlanPoint) {
  return (
    Math.abs(first[0] - second[0]) <= EPSILON && Math.abs(first[1] - second[1]) <= EPSILON
  )
}

function hasFixedRelation(line: SketchLineNode) {
  return (line.relations ?? []).includes('fixed')
}

function getCoincidentReferenceFailureReason(
  endpoint: 'start' | 'end',
  line: SketchLineNode,
) {
  const reference = line.coincident?.[endpoint]
  if (isSketchCoincidentLinePointReference(reference)) {
    return '目标草图线更新后，关联端点无法继续保持在线上。'
  }
  if (isSketchCoincidentCirclePointReference(reference)) {
    return '目标圆或圆弧更新后，关联端点无法继续保持在圆弧上。'
  }
  return '关联草图端点更新后，重合关系无法继续保持。'
}

function getGeometrySafeRelations(
  line: SketchLineNode,
  start: SketchPlanPoint,
  end: SketchPlanPoint,
) {
  return (line.relations ?? []).filter((relation) => {
    if (relation === 'horizontal') {
      return Math.abs(start[1] - end[1]) <= EPSILON
    }
    if (relation === 'vertical') {
      return Math.abs(start[0] - end[0]) <= EPSILON
    }
    return true
  })
}

function relationArraysEqual(
  first: SketchLineNode['relations'] | undefined,
  second: SketchLineNode['relations'] | undefined,
) {
  const left = first ?? []
  const right = second ?? []
  return left.length === right.length && left.every((relation, index) => relation === right[index])
}

function setLineUpdate(
  updatesById: Map<SketchLineNode['id'], Partial<SketchLineNode>>,
  lineId: SketchLineNode['id'],
  data: Partial<SketchLineNode>,
) {
  updatesById.set(lineId, {
    ...(updatesById.get(lineId) ?? {}),
    ...data,
  })
}

function buildLineGeometryDimensionData(
  line: Pick<SketchLineNode, 'dimensions'>,
  start: SketchPlanPoint,
  end: SketchPlanPoint,
) {
  const hasLength = line.dimensions?.length !== undefined
  const hasAngle = line.dimensions?.angle !== undefined
  if (!(hasLength || hasAngle)) {
    return line.dimensions
  }

  const next = { ...(line.dimensions ?? {}) }

  if (hasLength) {
    const lengthMode = line.dimensions?.lengthMode ?? 'driven'
    if (lengthMode === 'driven') {
      delete next.length
      delete next.lengthMode
    } else {
      next.length = Math.hypot(end[0] - start[0], end[1] - start[1])
      next.lengthMode = lengthMode
    }
  }

  if (hasAngle) {
    const angleMode = line.dimensions?.angleMode ?? 'driven'
    if (angleMode === 'driven') {
      delete next.angle
      delete next.angleMode
    } else {
      const normalized = Math.atan2(end[1] - start[1], end[0] - start[0]) % FULL_CIRCLE_RADIANS
      next.angle = normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
      next.angleMode = angleMode
    }
  }

  return next
}

function buildCoincidentPatch(args: {
  line: SketchLineNode
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  shouldResolveReference?: (
    reference: NonNullable<SketchLineNode['coincident']['start']>,
  ) => boolean
}): SketchLineCoincidentPatchResult {
  const { line, linesById, circlesById, shouldResolveReference } = args
  let nextStart: SketchPlanPoint = [line.start[0], line.start[1]]
  let nextEnd: SketchPlanPoint = [line.end[0], line.end[1]]
  let nextCoincident = line.coincident
    ? {
        ...(line.coincident ?? {}),
      }
    : undefined
  let geometryChanged = false
  let coincidentChanged = false

  for (const endpoint of ['start', 'end'] as const) {
    const reference = line.coincident?.[endpoint]
    if (!reference || (shouldResolveReference && !shouldResolveReference(reference))) {
      continue
    }

    const resolution = resolveSketchLineCoincidentReference({
      reference,
      linesById,
      circlesById,
    })
    if (!resolution) {
      return { ok: false, reason: getCoincidentReferenceFailureReason(endpoint, line) }
    }

    const currentPoint = endpoint === 'start' ? nextStart : nextEnd
    if (!pointsApproximatelyEqual(currentPoint, resolution.point)) {
      if (hasFixedRelation(line)) {
        return { ok: false, reason: '存在固定的附着草图线，无法随目标更新。' }
      }

      if (endpoint === 'start') {
        nextStart = resolution.point
      } else {
        nextEnd = resolution.point
      }
      geometryChanged = true
    }

    if (!areSketchCoincidentReferencesEqual(reference, resolution.reference)) {
      nextCoincident = {
        ...(nextCoincident ?? {}),
        [endpoint]: resolution.reference,
      }
      coincidentChanged = true
    }
  }

  if (
    geometryChanged &&
    Math.hypot(nextEnd[0] - nextStart[0], nextEnd[1] - nextStart[1]) <= EPSILON
  ) {
    return { ok: false, reason: '附着关系会导致草图线退化为零长度。' }
  }

  if (!geometryChanged && !coincidentChanged) {
    return { ok: true, patch: null }
  }

  const patch: Partial<SketchLineNode> = {}
  if (geometryChanged) {
    patch.start = nextStart
    patch.end = nextEnd
    patch.dimensions = buildLineGeometryDimensionData(line, nextStart, nextEnd)

    const nextRelations = getGeometrySafeRelations(line, nextStart, nextEnd)
    if (!relationArraysEqual(line.relations, nextRelations)) {
      patch.relations = nextRelations
    }
  }

  if (coincidentChanged) {
    patch.coincident = nextCoincident
  }

  return { ok: true, patch }
}

export function buildPropagateSketchLineCoincidentReferences(args: {
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  changedLineIds?: Iterable<SketchLineNode['id']>
  changedCircleIds?: Iterable<SketchCircleNode['id']>
}): SketchLineCoincidentPropagationResult {
  const { linesById, circlesById } = args
  const nextLineById = new Map(linesById)
  const updatesById = new Map<SketchLineNode['id'], Partial<SketchLineNode>>()
  const queue: Array<
    | { kind: 'line'; id: SketchLineNode['id'] }
    | { kind: 'circle'; id: SketchCircleNode['id'] }
  > = []
  const queuedKeys = new Set<string>()

  const enqueueLine = (id: SketchLineNode['id']) => {
    const key = `line:${id}`
    if (queuedKeys.has(key)) {
      return
    }
    queuedKeys.add(key)
    queue.push({ kind: 'line', id })
  }

  const enqueueCircle = (id: SketchCircleNode['id']) => {
    const key = `circle:${id}`
    if (queuedKeys.has(key)) {
      return
    }
    queuedKeys.add(key)
    queue.push({ kind: 'circle', id })
  }

  for (const lineId of args.changedLineIds ?? []) {
    enqueueLine(lineId)
  }
  for (const circleId of args.changedCircleIds ?? []) {
    enqueueCircle(circleId)
  }

  let iterationCount = 0
  const maxIterations = Math.max(1, nextLineById.size * 8)

  while (queue.length > 0) {
    if (iterationCount > maxIterations) {
      return { ok: false, reason: '附着关系传播过于复杂，当前无法稳定求解。' }
    }
    iterationCount += 1

    const item = queue.shift()
    if (!item) {
      continue
    }
    queuedKeys.delete(`${item.kind}:${item.id}`)

    if (item.kind === 'line') {
      const sourceLine = nextLineById.get(item.id)
      if (sourceLine) {
        const selfPatchResult = buildCoincidentPatch({
          line: sourceLine,
          linesById: nextLineById,
          circlesById,
        })
        if (!selfPatchResult.ok) {
          return selfPatchResult
        }
        if (selfPatchResult.patch) {
          nextLineById.set(sourceLine.id, {
            ...sourceLine,
            ...selfPatchResult.patch,
          })
          setLineUpdate(updatesById, sourceLine.id, selfPatchResult.patch)
        }
      }
    }

    for (const line of nextLineById.values()) {
      if (item.kind === 'line' && line.id === item.id) {
        continue
      }

      const patchResult = buildCoincidentPatch({
        line,
        linesById: nextLineById,
        circlesById,
        shouldResolveReference: (reference) =>
          item.kind === 'line'
            ? doesSketchCoincidentReferenceTargetLine(reference, item.id)
            : doesSketchCoincidentReferenceTargetCircle(reference, item.id),
      })
      if (!patchResult.ok) {
        return patchResult
      }
      if (!patchResult.patch) {
        continue
      }

      nextLineById.set(line.id, {
        ...line,
        ...patchResult.patch,
      })
      setLineUpdate(updatesById, line.id, patchResult.patch)
      enqueueLine(line.id)
    }
  }

  return {
    ok: true,
    updates: [...updatesById.entries()].map(([id, data]) => ({
      id,
      data,
    })),
  }
}

export function buildRemoveSketchLineCoincidentReferencesPlan(args: {
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  deletedLineIds?: Iterable<SketchLineNode['id']>
  deletedCircleIds?: Iterable<SketchCircleNode['id']>
}) {
  const deletedLineIds = new Set(args.deletedLineIds ?? [])
  const deletedCircleIds = new Set(args.deletedCircleIds ?? [])
  const updates: SketchLineEditUpdate[] = []

  for (const line of args.linesById.values()) {
    if (deletedLineIds.has(line.id)) {
      continue
    }

    const nextCoincident = { ...(line.coincident ?? {}) }
    let changed = false

    for (const endpoint of ['start', 'end'] as const) {
      const reference = nextCoincident[endpoint]
      if (!reference) {
        continue
      }

      let shouldRemove = false
      if (isSketchCoincidentCirclePointReference(reference)) {
        shouldRemove = deletedCircleIds.has(reference.circleId)
      } else if (
        isSketchCoincidentEndpointReference(reference) ||
        isSketchCoincidentLinePointReference(reference)
      ) {
        shouldRemove = deletedLineIds.has(reference.lineId)
      }
      if (!shouldRemove) {
        continue
      }

      delete nextCoincident[endpoint]
      changed = true
    }

    if (changed) {
      updates.push({
        id: line.id,
        data: {
          coincident: nextCoincident,
        },
      })
    }
  }

  return updates
}
