import type { SketchCircleNode, SketchLineNode } from '@pascal-app/core'
import {
  isSketchCoincidentCirclePointReference,
  isSketchCoincidentEndpointReference,
  isSketchCoincidentLinePointReference,
} from './sketch-coincident'

const EPSILON = 1e-6

export type SketchDiagnosticIssue = {
  kind:
    | 'dangling-line-constraint'
    | 'unsupported-curved-line-constraint'
    | 'dangling-tangent'
    | 'unsupported-curved-tangent'
    | 'dangling-coincident'
    | 'unsupported-coincident'
    | 'dangling-circle-constraint'
  message: string
}

export type SketchDiagnosticSummary = {
  totalIssues: number
  affectedLineIds: SketchLineNode['id'][]
  affectedCircleIds: SketchCircleNode['id'][]
  lineIssueCount: number
  circleIssueCount: number
}

function isStraightLine(line: Pick<SketchLineNode, 'curveOffset'>) {
  return Math.abs(line.curveOffset ?? 0) <= EPSILON
}

export function getSketchLineDiagnosticIssues(args: {
  line: SketchLineNode
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): SketchDiagnosticIssue[] {
  const { line, linesById, circlesById } = args
  const issues: SketchDiagnosticIssue[] = []

  for (const constraint of line.constraints ?? []) {
    const target = linesById.get(constraint.targetId)
    if (!target) {
      issues.push({
        kind: 'dangling-line-constraint',
        message: `${constraint.kind} 约束引用的草图线已不存在。`,
      })
      continue
    }

    if (!(isStraightLine(line) && isStraightLine(target))) {
      issues.push({
        kind: 'unsupported-curved-line-constraint',
        message: `${constraint.kind} 约束当前只支持直线草图。`,
      })
    }
  }

  for (const endpoint of ['start', 'end'] as const) {
    const reference = line.coincident?.[endpoint]
    if (isSketchCoincidentEndpointReference(reference) && !linesById.has(reference.lineId)) {
      issues.push({
        kind: 'dangling-coincident',
        message: `${endpoint === 'start' ? '起点' : '终点'}连接引用的草图线已不存在。`,
      })
      continue
    }

    if (isSketchCoincidentLinePointReference(reference) && !linesById.has(reference.lineId)) {
      issues.push({
        kind: 'dangling-coincident',
        message: `${endpoint === 'start' ? '起点' : '终点'}连接引用的草图线已不存在。`,
      })
      continue
    }

    if (
      isSketchCoincidentCirclePointReference(reference) &&
      !circlesById.has(reference.circleId)
    ) {
      issues.push({
        kind: 'dangling-coincident',
        message: `${endpoint === 'start' ? '起点' : '终点'}连接引用的圆或圆弧已不存在。`,
      })
      continue
    }

    if (isSketchCoincidentLinePointReference(reference)) {
      const targetLine = linesById.get(reference.lineId)
      if (targetLine && !isStraightLine(targetLine)) {
        issues.push({
          kind: 'unsupported-coincident',
          message: '当前点在线上关系只支持直线草图目标。',
        })
      }
    }
  }

  if (line.tangent && !circlesById.has(line.tangent.circleId)) {
    issues.push({
      kind: 'dangling-tangent',
      message: '相切目标圆或圆弧已不存在。',
    })
  } else if (line.tangent && !isStraightLine(line)) {
    issues.push({
      kind: 'unsupported-curved-tangent',
      message: '当前相切约束只支持直线草图。',
    })
  }

  return issues
}

export function buildCleanSketchLineDiagnosticPatch(args: {
  line: SketchLineNode
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): Partial<SketchLineNode> | null {
  const { line, linesById, circlesById } = args
  const patch: Partial<SketchLineNode> = {}
  let changed = false

  const nextConstraints = (line.constraints ?? []).filter((constraint) => {
    const target = linesById.get(constraint.targetId)
    return Boolean(target && isStraightLine(line) && isStraightLine(target))
  })
  if (nextConstraints.length !== (line.constraints ?? []).length) {
    patch.constraints = nextConstraints
    changed = true
  }

  const nextCoincident = { ...(line.coincident ?? {}) }
  let coincidentChanged = false
  for (const endpoint of ['start', 'end'] as const) {
    const reference = nextCoincident[endpoint]
    const danglingEndpointReference =
      isSketchCoincidentEndpointReference(reference) && !linesById.has(reference.lineId)
    const danglingLinePointReference =
      isSketchCoincidentLinePointReference(reference) && !linesById.has(reference.lineId)
    const danglingCircleReference =
      isSketchCoincidentCirclePointReference(reference) &&
      !circlesById.has(reference.circleId)
    const unsupportedLinePointReference = (() => {
      if (!isSketchCoincidentLinePointReference(reference)) {
        return false
      }

      const targetLine = linesById.get(reference.lineId)
      return Boolean(targetLine && !isStraightLine(targetLine))
    })()

    if (
      danglingEndpointReference ||
      danglingLinePointReference ||
      danglingCircleReference ||
      unsupportedLinePointReference
    ) {
      delete nextCoincident[endpoint]
      coincidentChanged = true
    }
  }
  if (coincidentChanged) {
    patch.coincident = nextCoincident
    changed = true
  }

  const tangent = line.tangent
  const tangentInvalid =
    tangent ? !circlesById.has(tangent.circleId) || !isStraightLine(line) : false
  if (tangentInvalid) {
    patch.tangent = undefined
    changed = true
  }

  return changed ? patch : null
}

export function getSketchCircleDiagnosticIssues(args: {
  circle: SketchCircleNode
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): SketchDiagnosticIssue[] {
  const { circle, circlesById } = args
  const issues: SketchDiagnosticIssue[] = []

  for (const constraint of circle.constraints ?? []) {
    if (!circlesById.has(constraint.targetId)) {
      issues.push({
        kind: 'dangling-circle-constraint',
        message: `${constraint.kind} 约束引用的圆或圆弧已不存在。`,
      })
    }
  }

  return issues
}

export function buildCleanSketchCircleDiagnosticPatch(args: {
  circle: SketchCircleNode
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): Partial<SketchCircleNode> | null {
  const { circle, circlesById } = args
  const nextConstraints = (circle.constraints ?? []).filter((constraint) =>
    circlesById.has(constraint.targetId),
  )

  if (nextConstraints.length === (circle.constraints ?? []).length) {
    return null
  }

  return {
    constraints: nextConstraints,
  }
}

export function getSketchDiagnosticSummary(args: {
  lines: SketchLineNode[]
  circles: SketchCircleNode[]
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): SketchDiagnosticSummary {
  const { lines, circles, linesById, circlesById } = args
  const affectedLineIds: SketchLineNode['id'][] = []
  const affectedCircleIds: SketchCircleNode['id'][] = []
  let lineIssueCount = 0
  let circleIssueCount = 0

  for (const line of lines) {
    const issues = getSketchLineDiagnosticIssues({
      line,
      linesById,
      circlesById,
    })
    if (issues.length > 0) {
      affectedLineIds.push(line.id)
      lineIssueCount += issues.length
    }
  }

  for (const circle of circles) {
    const issues = getSketchCircleDiagnosticIssues({
      circle,
      circlesById,
    })
    if (issues.length > 0) {
      affectedCircleIds.push(circle.id)
      circleIssueCount += issues.length
    }
  }

  return {
    totalIssues: lineIssueCount + circleIssueCount,
    affectedLineIds,
    affectedCircleIds,
    lineIssueCount,
    circleIssueCount,
  }
}

export function buildCleanSketchDiagnosticUpdates(args: {
  lines: SketchLineNode[]
  circles: SketchCircleNode[]
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): Array<
  | { id: SketchLineNode['id']; data: Partial<SketchLineNode> }
  | { id: SketchCircleNode['id']; data: Partial<SketchCircleNode> }
> {
  const { lines, circles, linesById, circlesById } = args
  const updates: Array<
    | { id: SketchLineNode['id']; data: Partial<SketchLineNode> }
    | { id: SketchCircleNode['id']; data: Partial<SketchCircleNode> }
  > = []

  for (const line of lines) {
    const patch = buildCleanSketchLineDiagnosticPatch({
      line,
      linesById,
      circlesById,
    })
    if (patch) {
      updates.push({
        id: line.id,
        data: patch,
      })
    }
  }

  for (const circle of circles) {
    const patch = buildCleanSketchCircleDiagnosticPatch({
      circle,
      circlesById,
    })
    if (patch) {
      updates.push({
        id: circle.id,
        data: patch,
      })
    }
  }

  return updates
}
