'use client'

import type {
  SketchCircleNode,
  SketchDimensionLineReference,
  SketchDimensionNode,
  SketchDimensionPointReference,
  SketchDimensionReference,
  SketchLineNode,
} from '@pascal-app/core'
import type { WallPlanPoint } from '../wall/wall-drafting'

const SKETCH_DISTANCE_DIMENSION_EPSILON = 1e-6
const SKETCH_DISTANCE_DIMENSION_PARALLEL_EPSILON = 1e-4
const MIN_SKETCH_LINE_LENGTH = 1e-4

function getSketchLineChordLength(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return Math.hypot(line.end[0] - line.start[0], line.end[1] - line.start[1])
}

function isDistanceDimensionLineLongEnough(start: WallPlanPoint, end: WallPlanPoint) {
  return Math.hypot(end[0] - start[0], end[1] - start[1]) > MIN_SKETCH_LINE_LENGTH
}

function getMaxSketchLineCurveOffset(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return getSketchLineChordLength(line) / 2
}

function getSketchLineStraightSnapOffset(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return Math.min(0.03, Math.max(0.005, getSketchLineChordLength(line) * 0.005))
}

function normalizeDistanceDimensionCurveOffset(
  line: Pick<SketchLineNode, 'start' | 'end'>,
  offset: number,
) {
  const maxOffset = getMaxSketchLineCurveOffset(line)
  if (!Number.isFinite(maxOffset) || maxOffset < SKETCH_DISTANCE_DIMENSION_EPSILON) {
    return 0
  }

  const clamped = Math.max(-maxOffset, Math.min(maxOffset, offset))
  return Math.abs(clamped) <= getSketchLineStraightSnapOffset(line) ? 0 : clamped
}

export type SketchDistanceMeasurement =
  | {
      relation: 'point-point'
      startPoint: WallPlanPoint
      endPoint: WallPlanPoint
      value: number
    }
  | {
      relation: 'point-line'
      startPoint: WallPlanPoint
      endPoint: WallPlanPoint
      value: number
    }
  | {
      relation: 'line-line'
      startPoint: WallPlanPoint
      endPoint: WallPlanPoint
      value: number
    }

export type SketchDistanceMeasurementResult =
  | {
      ok: true
      measurement: SketchDistanceMeasurement
    }
  | {
      ok: false
      reason:
        | 'missing-reference'
        | 'degenerate-line'
        | 'line-line-not-parallel'
        | 'zero-distance'
    }

export type SketchDistanceDimensionLineEditUpdate = {
  id: SketchLineNode['id']
  data: Partial<SketchLineNode>
}

export type SketchDistanceDimensionValueEditResult =
  | {
      ok: true
      kind: 'line'
      updates: SketchDistanceDimensionLineEditUpdate[]
    }
  | {
      ok: true
      kind: 'circle-center'
      circleId: SketchCircleNode['id']
      center: WallPlanPoint
    }
  | {
      ok: false
      reason: string
    }

export type SketchDistanceDimensionEntityRole = 'reference' | 'anchor' | 'driven'

function subtractPoints(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

function addPoints(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] + b[0], a[1] + b[1]]
}

function scalePoint(point: WallPlanPoint, scale: number): WallPlanPoint {
  return [point[0] * scale, point[1] * scale]
}

function dotPoints(a: WallPlanPoint, b: WallPlanPoint) {
  return a[0] * b[0] + a[1] * b[1]
}

function crossPoints(a: WallPlanPoint, b: WallPlanPoint) {
  return a[0] * b[1] - a[1] * b[0]
}

function buildLineGeometryDimensionData(
  line: Pick<SketchLineNode, 'dimensions'>,
  start: WallPlanPoint,
  end: WallPlanPoint,
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
      const normalized = Math.atan2(end[1] - start[1], end[0] - start[0]) % (Math.PI * 2)
      next.angle = normalized < 0 ? normalized + Math.PI * 2 : normalized
      next.angleMode = angleMode
    }
  }

  return next
}

function getLineDirection(line: Pick<SketchLineNode, 'start' | 'end'>) {
  const vector = subtractPoints(line.end, line.start)
  const length = Math.hypot(vector[0], vector[1])
  if (length <= SKETCH_DISTANCE_DIMENSION_EPSILON) {
    return null
  }

  return scalePoint(vector, 1 / length)
}

function getLineMidpoint(line: Pick<SketchLineNode, 'start' | 'end'>): WallPlanPoint {
  return [(line.start[0] + line.end[0]) / 2, (line.start[1] + line.end[1]) / 2]
}

function projectPointOntoInfiniteSketchLine(
  point: WallPlanPoint,
  line: Pick<SketchLineNode, 'start' | 'end'>,
) {
  const direction = getLineDirection(line)
  if (!direction) {
    return null
  }

  const startToPoint = subtractPoints(point, line.start)
  const distanceAlongLine = dotPoints(startToPoint, direction)
  return addPoints(line.start, scalePoint(direction, distanceAlongLine))
}

function isPointReference(
  reference: SketchDimensionReference,
): reference is SketchDimensionPointReference {
  return reference.kind !== 'line'
}

export function isSketchDimensionLineReference(
  reference: SketchDimensionReference,
): reference is SketchDimensionLineReference {
  return reference.kind === 'line'
}

export function areSketchDimensionReferencesEqual(
  first: SketchDimensionReference,
  second: SketchDimensionReference,
) {
  if (first.kind === 'line') {
    return second.kind === 'line' && first.lineId === second.lineId
  }

  if (second.kind === 'line') {
    return false
  }

  if (first.kind === 'line-endpoint') {
    return (
      second.kind === 'line-endpoint' &&
      first.lineId === second.lineId &&
      first.endpoint === second.endpoint
    )
  }

  return second.kind === 'circle-center' && first.circleId === second.circleId
}

export function areSketchDimensionPointReferencesEqual(
  first: SketchDimensionPointReference,
  second: SketchDimensionPointReference,
) {
  return areSketchDimensionReferencesEqual(first, second)
}

export function resolveSketchDimensionPointReference(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  reference: SketchDimensionPointReference
}): WallPlanPoint | null {
  const { circlesById, linesById, reference } = args

  if (reference.kind === 'line-endpoint') {
    const line = linesById.get(reference.lineId)
    if (!line) {
      return null
    }

    return reference.endpoint === 'start' ? line.start : line.end
  }

  const circle = circlesById.get(reference.circleId)
  return circle ? circle.center : null
}

export function resolveSketchDimensionLineReference(args: {
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  reference: SketchDimensionLineReference
}): SketchLineNode | null {
  return args.linesById.get(args.reference.lineId) ?? null
}

export function getSketchDistanceMeasurementFailureReason(
  reason:
    | 'missing-reference'
    | 'degenerate-line'
    | 'line-line-not-parallel'
    | 'zero-distance',
) {
  switch (reason) {
    case 'missing-reference':
      return '引用的草图几何已不存在。'
    case 'degenerate-line':
      return '引用的草图线过短，无法计算有效距离。'
    case 'line-line-not-parallel':
      return '当前线到线距离仅支持平行草图线。'
    case 'zero-distance':
      return '两个参考重合，当前尺寸没有有效长度。'
  }
}

export function getSketchDistanceMeasurementRelationLabel(
  relation: SketchDistanceMeasurement['relation'],
) {
  switch (relation) {
    case 'point-point':
      return '点-点'
    case 'point-line':
      return '点-线'
    case 'line-line':
      return '线-线'
  }
}

function doesSketchDimensionReferenceLineId(
  reference: SketchDimensionReference,
  lineId: SketchLineNode['id'],
) {
  return (
    (reference.kind === 'line' || reference.kind === 'line-endpoint') &&
    reference.lineId === lineId
  )
}

function doesSketchDimensionReferenceCircleId(
  reference: SketchDimensionReference,
  circleId: SketchCircleNode['id'],
) {
  return reference.kind === 'circle-center' && reference.circleId === circleId
}

export function getSketchDistanceDimensionLineRole(args: {
  dimension: Pick<SketchDimensionNode, 'mode' | 'start' | 'end'>
  lineId: SketchLineNode['id']
}): SketchDistanceDimensionEntityRole | null {
  const { dimension, lineId } = args
  const referencesStart = doesSketchDimensionReferenceLineId(dimension.start, lineId)
  const referencesEnd = doesSketchDimensionReferenceLineId(dimension.end, lineId)
  if (!(referencesStart || referencesEnd)) {
    return null
  }

  if (dimension.mode !== 'driven') {
    return 'reference'
  }
  if (referencesEnd) {
    return 'driven'
  }
  return referencesStart ? 'anchor' : null
}

export function getSketchDistanceDimensionCircleRole(args: {
  circleId: SketchCircleNode['id']
  dimension: Pick<SketchDimensionNode, 'mode' | 'start' | 'end'>
}): SketchDistanceDimensionEntityRole | null {
  const { circleId, dimension } = args
  const referencesStart = doesSketchDimensionReferenceCircleId(dimension.start, circleId)
  const referencesEnd = doesSketchDimensionReferenceCircleId(dimension.end, circleId)
  if (!(referencesStart || referencesEnd)) {
    return null
  }

  if (dimension.mode !== 'driven') {
    return 'reference'
  }
  if (referencesEnd) {
    return 'driven'
  }
  return referencesStart ? 'anchor' : null
}

export function resolveSketchDistanceMeasurement(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  dimension: Pick<SketchDimensionNode, 'start' | 'end'>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
}): SketchDistanceMeasurementResult {
  const { circlesById, dimension, linesById } = args
  const startReference = dimension.start
  const endReference = dimension.end

  if (isPointReference(startReference) && isPointReference(endReference)) {
    const startPoint = resolveSketchDimensionPointReference({
      circlesById,
      linesById,
      reference: startReference,
    })
    const endPoint = resolveSketchDimensionPointReference({
      circlesById,
      linesById,
      reference: endReference,
    })

    if (!(startPoint && endPoint)) {
      return { ok: false, reason: 'missing-reference' }
    }

    const value = Math.hypot(endPoint[0] - startPoint[0], endPoint[1] - startPoint[1])
    if (value <= SKETCH_DISTANCE_DIMENSION_EPSILON) {
      return { ok: false, reason: 'zero-distance' }
    }

    return {
      ok: true,
      measurement: {
        relation: 'point-point',
        startPoint,
        endPoint,
        value,
      },
    }
  }

  if (isPointReference(startReference) && isSketchDimensionLineReference(endReference)) {
    const point = resolveSketchDimensionPointReference({
      circlesById,
      linesById,
      reference: startReference,
    })
    const line = resolveSketchDimensionLineReference({
      linesById,
      reference: endReference,
    })

    if (!(point && line)) {
      return { ok: false, reason: 'missing-reference' }
    }

    const projectedPoint = projectPointOntoInfiniteSketchLine(point, line)
    if (!projectedPoint) {
      return { ok: false, reason: 'degenerate-line' }
    }

    const value = Math.hypot(projectedPoint[0] - point[0], projectedPoint[1] - point[1])
    if (value <= SKETCH_DISTANCE_DIMENSION_EPSILON) {
      return { ok: false, reason: 'zero-distance' }
    }

    return {
      ok: true,
      measurement: {
        relation: 'point-line',
        startPoint: point,
        endPoint: projectedPoint,
        value,
      },
    }
  }

  if (isSketchDimensionLineReference(startReference) && isPointReference(endReference)) {
    const line = resolveSketchDimensionLineReference({
      linesById,
      reference: startReference,
    })
    const point = resolveSketchDimensionPointReference({
      circlesById,
      linesById,
      reference: endReference,
    })

    if (!(point && line)) {
      return { ok: false, reason: 'missing-reference' }
    }

    const projectedPoint = projectPointOntoInfiniteSketchLine(point, line)
    if (!projectedPoint) {
      return { ok: false, reason: 'degenerate-line' }
    }

    const value = Math.hypot(projectedPoint[0] - point[0], projectedPoint[1] - point[1])
    if (value <= SKETCH_DISTANCE_DIMENSION_EPSILON) {
      return { ok: false, reason: 'zero-distance' }
    }

    return {
      ok: true,
      measurement: {
        relation: 'point-line',
        startPoint: projectedPoint,
        endPoint: point,
        value,
      },
    }
  }

  if (
    !isSketchDimensionLineReference(startReference) ||
    !isSketchDimensionLineReference(endReference)
  ) {
    return { ok: false, reason: 'missing-reference' }
  }

  const startLine = resolveSketchDimensionLineReference({
    linesById,
    reference: startReference,
  })
  const endLine = resolveSketchDimensionLineReference({
    linesById,
    reference: endReference,
  })

  if (!(startLine && endLine)) {
    return { ok: false, reason: 'missing-reference' }
  }

  const startDirection = getLineDirection(startLine)
  const endDirection = getLineDirection(endLine)
  if (!(startDirection && endDirection)) {
    return { ok: false, reason: 'degenerate-line' }
  }

  if (Math.abs(crossPoints(startDirection, endDirection)) > SKETCH_DISTANCE_DIMENSION_PARALLEL_EPSILON) {
    return { ok: false, reason: 'line-line-not-parallel' }
  }

  const startPoint = getLineMidpoint(startLine)
  const endPoint = projectPointOntoInfiniteSketchLine(startPoint, endLine)
  if (!endPoint) {
    return { ok: false, reason: 'degenerate-line' }
  }

  const value = Math.hypot(endPoint[0] - startPoint[0], endPoint[1] - startPoint[1])
  if (value <= SKETCH_DISTANCE_DIMENSION_EPSILON) {
    return { ok: false, reason: 'zero-distance' }
  }

  return {
    ok: true,
    measurement: {
      relation: 'line-line',
      startPoint,
      endPoint,
      value,
    },
  }
}

function hasLineRelation(
  line: Pick<SketchLineNode, 'relations'>,
  relation: 'fixed' | 'horizontal' | 'vertical',
) {
  return (line.relations ?? []).includes(relation)
}

function buildMovedLineEndpointPatch(args: {
  line: SketchLineNode
  endpoint: 'start' | 'end'
  point: WallPlanPoint
}): SketchDistanceDimensionValueEditResult {
  const { line, endpoint, point } = args
  if (hasLineRelation(line, 'fixed')) {
    return { ok: false, reason: '固定的草图线无法由距离尺寸驱动。' }
  }

  if (line.coincident?.[endpoint]) {
    return { ok: false, reason: '受重合约束控制的草图端点暂不支持由距离尺寸驱动。' }
  }

  const anchor = endpoint === 'start' ? line.end : line.start
  const constrainedPoint: WallPlanPoint = hasLineRelation(line, 'horizontal')
    ? [point[0], anchor[1]]
    : hasLineRelation(line, 'vertical')
      ? [anchor[0], point[1]]
      : point
  const start = endpoint === 'start' ? constrainedPoint : line.start
  const end = endpoint === 'end' ? constrainedPoint : line.end

  if (!isDistanceDimensionLineLongEnough(start, end)) {
    return { ok: false, reason: '目标距离会让草图线过短，当前无法应用。' }
  }

  const curveOffset = normalizeDistanceDimensionCurveOffset(
    { ...line, start, end },
    line.curveOffset ?? 0,
  )
  const patch: Partial<SketchLineNode> = {
    start,
    end,
    dimensions: buildLineGeometryDimensionData(line, start, end),
  }

  if (Math.abs((line.curveOffset ?? 0) - curveOffset) > SKETCH_DISTANCE_DIMENSION_EPSILON) {
    patch.curveOffset = curveOffset
  }

  return {
    ok: true,
    kind: 'line',
    updates: [
      {
        id: line.id,
        data: patch,
      },
    ],
  }
}

function buildTranslatedLinePatch(args: {
  line: SketchLineNode
  offset: WallPlanPoint
}): SketchDistanceDimensionValueEditResult {
  const { line, offset } = args
  if (hasLineRelation(line, 'fixed')) {
    return { ok: false, reason: '固定的草图线无法由距离尺寸驱动。' }
  }

  if (Math.hypot(offset[0], offset[1]) <= SKETCH_DISTANCE_DIMENSION_EPSILON) {
    return {
      ok: true,
      kind: 'line',
      updates: [],
    }
  }

  const start = addPoints(line.start, offset)
  const end = addPoints(line.end, offset)

  return {
    ok: true,
    kind: 'line',
    updates: [
      {
        id: line.id,
        data: {
          start,
          end,
          dimensions: buildLineGeometryDimensionData(line, start, end),
        },
      },
    ],
  }
}

function buildMovedPointReferencePlan(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  point: WallPlanPoint
  reference: SketchDimensionPointReference
}): SketchDistanceDimensionValueEditResult {
  const { circlesById, linesById, point, reference } = args

  if (reference.kind === 'circle-center') {
    if (!circlesById.get(reference.circleId)) {
      return { ok: false, reason: '引用的草图圆或圆弧已不存在。' }
    }

    return {
      ok: true,
      kind: 'circle-center',
      circleId: reference.circleId,
      center: point,
    }
  }

  const line = linesById.get(reference.lineId)
  if (!line) {
    return { ok: false, reason: '引用的草图线已不存在。' }
  }

  return buildMovedLineEndpointPatch({
    line,
    endpoint: reference.endpoint,
    point,
  })
}

export function buildSetSketchDistanceDimensionValuePlan(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  dimension: Pick<SketchDimensionNode, 'start' | 'end'>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  value: number
}): SketchDistanceDimensionValueEditResult {
  const { circlesById, dimension, linesById, value } = args
  if (!Number.isFinite(value) || value <= SKETCH_DISTANCE_DIMENSION_EPSILON) {
    return { ok: false, reason: '请输入有效的距离尺寸。' }
  }

  const measurementResult = resolveSketchDistanceMeasurement({
    circlesById,
    dimension,
    linesById,
  })
  if (!measurementResult.ok) {
    return { ok: false, reason: getSketchDistanceMeasurementFailureReason(measurementResult.reason) }
  }

  const { measurement } = measurementResult
  const currentDirection = subtractPoints(measurement.endPoint, measurement.startPoint)
  const currentLength = Math.hypot(currentDirection[0], currentDirection[1])
  if (currentLength <= SKETCH_DISTANCE_DIMENSION_EPSILON) {
    return { ok: false, reason: '当前尺寸方向不明确，无法驱动几何。' }
  }

  const direction = scalePoint(currentDirection, 1 / currentLength)

  if (measurement.relation === 'point-point') {
    if (!isPointReference(dimension.end)) {
      return { ok: false, reason: '当前点到点尺寸缺少可移动参考。' }
    }

    return buildMovedPointReferencePlan({
      circlesById,
      linesById,
      point: addPoints(measurement.startPoint, scalePoint(direction, value)),
      reference: dimension.end,
    })
  }

  if (measurement.relation === 'point-line') {
    if (isSketchDimensionLineReference(dimension.end)) {
      const line = linesById.get(dimension.end.lineId)
      if (!line) {
        return { ok: false, reason: '引用的草图线已不存在。' }
      }

      return buildTranslatedLinePatch({
        line,
        offset: scalePoint(direction, value - measurement.value),
      })
    }

    if (!isPointReference(dimension.end)) {
      return { ok: false, reason: '当前点到线尺寸缺少可移动参考。' }
    }

    return buildMovedPointReferencePlan({
      circlesById,
      linesById,
      point: addPoints(measurement.startPoint, scalePoint(direction, value)),
      reference: dimension.end,
    })
  }

  if (!isSketchDimensionLineReference(dimension.end)) {
    return { ok: false, reason: '当前线到线尺寸缺少可移动参考。' }
  }

  const line = linesById.get(dimension.end.lineId)
  if (!line) {
    return { ok: false, reason: '引用的草图线已不存在。' }
  }

  return buildTranslatedLinePatch({
    line,
    offset: scalePoint(direction, value - measurement.value),
  })
}

export function getSketchDistanceDimensionValue(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  dimension: Pick<SketchDimensionNode, 'start' | 'end'>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
}) {
  const result = resolveSketchDistanceMeasurement(args)
  return result.ok ? result.measurement.value : null
}

export function isSketchDistanceDimensionDegenerate(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  dimension: Pick<SketchDimensionNode, 'start' | 'end'>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
}) {
  const result = resolveSketchDistanceMeasurement(args)
  return !result.ok || result.measurement.value <= SKETCH_DISTANCE_DIMENSION_EPSILON
}

export function findSketchDistanceDimensionIdByReferences(args: {
  dimensions: Array<
    Pick<SketchDimensionNode, 'id' | 'kind' | 'start' | 'end'> & {
      id: SketchDimensionNode['id']
    }
  >
  first: SketchDimensionReference
  second: SketchDimensionReference
}) {
  const { dimensions, first, second } = args

  for (const dimension of dimensions) {
    if (dimension.kind !== 'distance') {
      continue
    }

    const matchesSameOrder =
      areSketchDimensionReferencesEqual(dimension.start, first) &&
      areSketchDimensionReferencesEqual(dimension.end, second)
    const matchesReversedOrder =
      areSketchDimensionReferencesEqual(dimension.start, second) &&
      areSketchDimensionReferencesEqual(dimension.end, first)

    if (matchesSameOrder || matchesReversedOrder) {
      return dimension.id
    }
  }

  return null
}

export function collectSketchDistanceDimensionIdsReferencingEntities(args: {
  deletedCircleIds?: SketchCircleNode['id'][]
  deletedLineIds?: SketchLineNode['id'][]
  dimensions: Array<Pick<SketchDimensionNode, 'id' | 'start' | 'end'>>
}) {
  const deletedLineIds = new Set(args.deletedLineIds ?? [])
  const deletedCircleIds = new Set(args.deletedCircleIds ?? [])

  if (deletedLineIds.size === 0 && deletedCircleIds.size === 0) {
    return [] as SketchDimensionNode['id'][]
  }

  return args.dimensions.flatMap((dimension) => {
    const referencesDeletedEntity = [dimension.start, dimension.end].some((reference) => {
      if (reference.kind === 'line' || reference.kind === 'line-endpoint') {
        return deletedLineIds.has(reference.lineId)
      }

      return deletedCircleIds.has(reference.circleId)
    })

    return referencesDeletedEntity ? [dimension.id] : []
  })
}
