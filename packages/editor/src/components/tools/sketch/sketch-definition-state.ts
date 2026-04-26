import type { SketchCircleNode, SketchDimensionNode, SketchLineNode } from '@pascal-app/core'
import {
  isSketchCircleArcLengthDriven,
  isSketchCircleRadiusDriven,
  isSketchLineAngleDriven,
  isSketchLineLengthDriven,
} from './sketch-dimensions'
import {
  getSketchDistanceDimensionCircleRole,
  getSketchDistanceDimensionLineRole,
} from './sketch-distance-dimensions'

export type SketchDefinitionStatus = 'under-defined' | 'fully-defined' | 'over-defined'

export type SketchDefinitionState = {
  status: SketchDefinitionStatus
  label: '欠定义' | '完全定义' | '过定义'
  constrainedBy: string[]
  reasons: string[]
  score: number
  target: number
}

const EPSILON = 1e-6
const FULL_CIRCLE_RADIANS = Math.PI * 2

function hasLineRelation(line: SketchLineNode, relation: 'horizontal' | 'vertical' | 'fixed') {
  return (line.relations ?? []).includes(relation)
}

function hasCircleRelation(circle: SketchCircleNode, relation: 'fixed') {
  return (circle.relations ?? []).includes(relation)
}

function getLineLength(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return Math.hypot(line.end[0] - line.start[0], line.end[1] - line.start[1])
}

function normalizeAngle(angle: number) {
  const normalized = angle % FULL_CIRCLE_RADIANS
  return normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
}

function getLineAngle(line: Pick<SketchLineNode, 'start' | 'end'>) {
  return normalizeAngle(Math.atan2(line.end[1] - line.start[1], line.end[0] - line.start[0]))
}

function toDefinitionLabel(status: SketchDefinitionStatus) {
  if (status === 'fully-defined') {
    return '完全定义' as const
  }
  if (status === 'over-defined') {
    return '过定义' as const
  }
  return '欠定义' as const
}

export function getSketchDefinitionStatusBadgeLabel(status: SketchDefinitionStatus) {
  if (status === 'fully-defined') {
    return '全'
  }
  if (status === 'over-defined') {
    return '过'
  }
  return '欠'
}

export function getSketchLineDefinitionState(
  line: SketchLineNode,
  args?: {
    sketchDimensions?: SketchDimensionNode[]
  },
): SketchDefinitionState {
  const sketchDimensions = args?.sketchDimensions ?? []
  const constrainedBy: string[] = []
  const reasons: string[] = []
  const constraintKinds = new Set((line.constraints ?? []).map((constraint) => constraint.kind))
  const conflicts: string[] = []
  const lineLength = getLineLength(line)
  const target = Math.abs(line.curveOffset ?? 0) > EPSILON ? 5 : 4
  const drivenDistanceDimensions = sketchDimensions.filter(
    (dimension) =>
      dimension.mode === 'driven' &&
      getSketchDistanceDimensionLineRole({
        dimension,
        lineId: line.id,
      }) === 'driven',
  )

  if (
    hasLineRelation(line, 'horizontal') &&
    hasLineRelation(line, 'vertical') &&
    lineLength > EPSILON
  ) {
    conflicts.push('同时设置了水平和垂直关系')
  }
  if (isSketchLineAngleDriven(line)) {
    const angle = line.dimensions?.angle ?? getLineAngle(line)
    if (hasLineRelation(line, 'horizontal') && Math.abs(Math.sin(angle)) > EPSILON) {
      conflicts.push('水平关系与角度尺寸冲突')
    }
    if (hasLineRelation(line, 'vertical') && Math.abs(Math.cos(angle)) > EPSILON) {
      conflicts.push('垂直关系与角度尺寸冲突')
    }
  }

  const targetKindMap = new Map<string, Set<string>>()
  for (const constraint of line.constraints ?? []) {
    const kinds = targetKindMap.get(constraint.targetId) ?? new Set<string>()
    kinds.add(constraint.kind)
    targetKindMap.set(constraint.targetId, kinds)
  }
  for (const kinds of targetKindMap.values()) {
    if (kinds.has('parallel') && kinds.has('perpendicular')) {
      conflicts.push('同一目标同时存在平行和垂直约束')
    }
    if (kinds.has('collinear') && kinds.has('perpendicular')) {
      conflicts.push('同一目标同时存在共线和垂直约束')
    }
  }

  if (drivenDistanceDimensions.length > 0 && hasLineRelation(line, 'fixed')) {
    conflicts.push('固定关系与距离尺寸冲突')
  }
  for (const dimension of drivenDistanceDimensions) {
    if (dimension.end.kind !== 'line-endpoint' || dimension.end.lineId !== line.id) {
      continue
    }
    if (line.coincident?.[dimension.end.endpoint]) {
      conflicts.push(`${dimension.end.endpoint === 'start' ? '起点' : '终点'}重合与距离尺寸冲突`)
    }
  }

  if (hasLineRelation(line, 'fixed')) {
    constrainedBy.push('固定')
    return {
      status: conflicts.length > 0 ? 'over-defined' : 'fully-defined',
      label: toDefinitionLabel(conflicts.length > 0 ? 'over-defined' : 'fully-defined'),
      constrainedBy,
      reasons: conflicts,
      score: target,
      target,
    }
  }

  let rawScore = 0

  if (line.coincident?.start) {
    constrainedBy.push('起点连接')
    rawScore += 2
  }
  if (line.coincident?.end) {
    constrainedBy.push('终点连接')
    rawScore += 2
  }
  if (hasLineRelation(line, 'horizontal')) {
    constrainedBy.push('水平')
    rawScore += 1
  }
  if (hasLineRelation(line, 'vertical')) {
    constrainedBy.push('垂直')
    rawScore += 1
  }
  if (isSketchLineLengthDriven(line)) {
    constrainedBy.push('长度尺寸')
    rawScore += 1
  }
  if (isSketchLineAngleDriven(line)) {
    constrainedBy.push('角度尺寸')
    rawScore += 1
  }
  if (drivenDistanceDimensions.length > 0) {
    constrainedBy.push(drivenDistanceDimensions.length > 1 ? `距离尺寸 ${drivenDistanceDimensions.length}` : '距离尺寸')
    rawScore += 1
  }
  if (line.tangent) {
    constrainedBy.push('相切')
    rawScore += 1
  }
  if (constraintKinds.has('equal-length')) {
    constrainedBy.push('等长')
    rawScore += 1
  }
  if (constraintKinds.has('parallel')) {
    constrainedBy.push('平行')
    rawScore += 1
  }
  if (constraintKinds.has('perpendicular')) {
    constrainedBy.push('垂直约束')
    rawScore += 1
  }
  if (constraintKinds.has('collinear')) {
    constrainedBy.push('共线')
    rawScore += 2
  }

  if (!line.coincident?.start || !line.coincident?.end) {
    reasons.push('端点位置未完全锁定')
  }
  if (
    !hasLineRelation(line, 'horizontal') &&
    !hasLineRelation(line, 'vertical') &&
    !isSketchLineAngleDriven(line) &&
    !constraintKinds.has('parallel') &&
    !constraintKinds.has('perpendicular') &&
    !constraintKinds.has('collinear')
  ) {
    reasons.push('方向未锁定')
  }
  if (!isSketchLineLengthDriven(line) && !constraintKinds.has('equal-length')) {
    reasons.push('长度未锁定')
  }
  if (target > 4) {
    reasons.push('弯曲量未锁定')
  }

  const status: SketchDefinitionStatus =
    conflicts.length > 0 ? 'over-defined' : rawScore >= target ? 'fully-defined' : 'under-defined'
  const score = Math.min(rawScore, target)

  return {
    status,
    label: toDefinitionLabel(status),
    constrainedBy,
    reasons: status === 'over-defined' ? conflicts : status === 'under-defined' ? reasons : [],
    score,
    target,
  }
}

export function getSketchCircleDefinitionState(args: {
  circle: SketchCircleNode
  sketchLines?: SketchLineNode[]
  sketchDimensions?: SketchDimensionNode[]
}): SketchDefinitionState {
  const { circle, sketchLines = [], sketchDimensions = [] } = args
  const constrainedBy: string[] = []
  const reasons: string[] = []
  const conflicts: string[] = []
  const target = circle.kind === 'arc' ? 4 : 3
  const drivenDistanceDimensions = sketchDimensions.filter(
    (dimension) =>
      dimension.mode === 'driven' &&
      getSketchDistanceDimensionCircleRole({
        circleId: circle.id,
        dimension,
      }) === 'driven',
  )
  const constraintKindsByTarget = new Map<string, Set<string>>()

  for (const constraint of circle.constraints ?? []) {
    const kinds = constraintKindsByTarget.get(constraint.targetId) ?? new Set<string>()
    kinds.add(
      constraint.kind === 'tangent' && constraint.tangentMode === 'internal'
        ? 'tangent-internal'
        : constraint.kind,
    )
    constraintKindsByTarget.set(constraint.targetId, kinds)
  }

  for (const kinds of constraintKindsByTarget.values()) {
    if (kinds.has('concentric') && (kinds.has('tangent') || kinds.has('tangent-internal'))) {
      conflicts.push('同一目标同时存在同心和相切约束')
    }
    if (kinds.has('equal-radius') && kinds.has('tangent-internal')) {
      conflicts.push('同一目标同时存在等半径和内切约束')
    }
  }

  if (drivenDistanceDimensions.length > 0 && hasCircleRelation(circle, 'fixed')) {
    conflicts.push('固定关系与距离尺寸冲突')
  }

  if (hasCircleRelation(circle, 'fixed')) {
    return {
      status: conflicts.length > 0 ? 'over-defined' : 'fully-defined',
      label: toDefinitionLabel(conflicts.length > 0 ? 'over-defined' : 'fully-defined'),
      constrainedBy: ['固定'],
      reasons: conflicts,
      score: target,
      target,
    }
  }

  const concentricCount = (circle.constraints ?? []).filter(
    (constraint) => constraint.kind === 'concentric',
  ).length
  const equalRadiusCount = (circle.constraints ?? []).filter(
    (constraint) => constraint.kind === 'equal-radius',
  ).length
  const tangentConstraintCount = (circle.constraints ?? []).filter(
    (constraint) => constraint.kind === 'tangent',
  ).length
  const tangentLineCount = sketchLines.filter((line) => line.tangent?.circleId === circle.id).length
  const tangentCount = tangentConstraintCount + tangentLineCount

  let rawScore = 0
  if (concentricCount > 0) {
    constrainedBy.push(`同心 ${concentricCount}`)
    rawScore += 2
  }
  if (isSketchCircleRadiusDriven(circle)) {
    constrainedBy.push('半径尺寸')
    rawScore += 1
  } else if (equalRadiusCount > 0) {
    constrainedBy.push(`等半径 ${equalRadiusCount}`)
    rawScore += 1
  }
  if (circle.kind === 'arc' && isSketchCircleArcLengthDriven(circle)) {
    constrainedBy.push('弧长尺寸')
    rawScore += 1
  }
  if (drivenDistanceDimensions.length > 0) {
    constrainedBy.push(drivenDistanceDimensions.length > 1 ? `距离尺寸 ${drivenDistanceDimensions.length}` : '距离尺寸')
    rawScore += 1
  }
  if (tangentCount > 0) {
    constrainedBy.push(`相切 ${tangentCount}`)
    rawScore += Math.min(2, tangentCount)
  }

  if (concentricCount === 0 && tangentCount < 2) {
    reasons.push('圆心未完全锁定')
  }
  if (!isSketchCircleRadiusDriven(circle) && equalRadiusCount === 0) {
    reasons.push('半径未锁定')
  }
  if (circle.kind === 'arc' && !isSketchCircleArcLengthDriven(circle)) {
    reasons.push('弧长未锁定')
  }

  const status: SketchDefinitionStatus =
    conflicts.length > 0 ? 'over-defined' : rawScore >= target ? 'fully-defined' : 'under-defined'
  return {
    status,
    label: toDefinitionLabel(status),
    constrainedBy,
    reasons: status === 'over-defined' ? conflicts : status === 'under-defined' ? reasons : [],
    score: Math.min(rawScore, target),
    target,
  }
}
