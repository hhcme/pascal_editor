import type {
  SketchCircleNode,
  SketchLineNode,
  SketchLineRelation,
} from '@pascal-app/core'
import type { SketchLineEditUpdate } from './sketch-geometry'
import { buildSetSketchLineEndpointTangentToCirclePlan } from './sketch-geometry'
import { buildSketchLineGeometryDimensionData } from './sketch-dimensions'

type SketchLineTangentPropagationResult =
  | {
      ok: true
      updates: SketchLineEditUpdate[]
    }
  | {
      ok: false
      reason: string
    }

type SketchLineTangentPatchResult =
  | {
      ok: true
      patch: Partial<SketchLineNode>
    }
  | {
      ok: false
      reason: string
    }

const EPSILON = 1e-6

function arePointsCoincident(first: [number, number], second: [number, number]) {
  return Math.abs(first[0] - second[0]) <= EPSILON && Math.abs(first[1] - second[1]) <= EPSILON
}

function clearCoincidentEndpoint(
  line: SketchLineNode,
  endpoint: 'start' | 'end',
): SketchLineNode['coincident'] {
  const coincident = { ...(line.coincident ?? {}) }
  delete coincident[endpoint]
  return coincident
}

export function getSketchLineTangentRelations(
  relations: SketchLineRelation[] | undefined,
): SketchLineRelation[] {
  return (relations ?? []).filter(
    (relation) => relation !== 'fixed' && relation !== 'horizontal' && relation !== 'vertical',
  )
}

export function clearSketchLineTangentIfGeometryChanges(
  line: SketchLineNode,
  patch: Partial<SketchLineNode>,
): Partial<SketchLineNode> {
  if (patch.tangent !== undefined || !line.tangent) {
    return patch
  }

  const touchesGeometry =
    Object.prototype.hasOwnProperty.call(patch, 'start') ||
    Object.prototype.hasOwnProperty.call(patch, 'end') ||
    Object.prototype.hasOwnProperty.call(patch, 'curveOffset')

  return touchesGeometry ? { ...patch, tangent: undefined } : patch
}

export function buildSetSketchLineTangentConstraintPatch(args: {
  line: SketchLineNode
  circle: SketchCircleNode
}): SketchLineTangentPatchResult {
  const { line, circle } = args
  const result = buildSetSketchLineEndpointTangentToCirclePlan({
    line,
    circle,
    endpoint:
      line.tangent?.circleId === circle.id
        ? line.tangent.endpoint
        : (buildPreferredTangentEndpoint(line, circle) ?? 'end'),
  })
  if (!result.ok) {
    return result
  }

  const start = result.endpoint === 'start' ? result.point : line.start
  const end = result.endpoint === 'end' ? result.point : line.end
  const patch: Partial<SketchLineNode> = {
    coincident: clearCoincidentEndpoint(line, result.endpoint),
    dimensions: buildSketchLineGeometryDimensionData({
      line,
      start,
      end,
    }),
    relations: getSketchLineTangentRelations(line.relations),
    tangent: {
      circleId: circle.id,
      endpoint: result.endpoint,
    },
  }
  patch[result.endpoint] = result.point

  return {
    ok: true as const,
    patch,
  }
}

function buildPreferredTangentEndpoint(line: SketchLineNode, circle: SketchCircleNode) {
  const startResult = buildSetSketchLineEndpointTangentToCirclePlan({
    line,
    circle,
    endpoint: 'start',
  })
  const endResult = buildSetSketchLineEndpointTangentToCirclePlan({
    line,
    circle,
    endpoint: 'end',
  })

  if (startResult.ok && endResult.ok) {
    const startMovement = Math.hypot(
      startResult.point[0] - line.start[0],
      startResult.point[1] - line.start[1],
    )
    const endMovement = Math.hypot(
      endResult.point[0] - line.end[0],
      endResult.point[1] - line.end[1],
    )
    return startMovement <= endMovement ? 'start' : 'end'
  }

  if (startResult.ok) {
    return 'start'
  }

  if (endResult.ok) {
    return 'end'
  }

  return null
}

export function buildPropagateSketchLineTangentsFromCircles(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  changedCircleIds: Iterable<SketchCircleNode['id']>
}): SketchLineTangentPropagationResult {
  const { circlesById, linesById, changedCircleIds } = args
  const changedCircleIdSet = new Set(changedCircleIds)
  const updates: SketchLineEditUpdate[] = []

  for (const line of linesById.values()) {
    if (!(line.tangent && changedCircleIdSet.has(line.tangent.circleId))) {
      continue
    }

    const circle = circlesById.get(line.tangent.circleId)
    if (!circle) {
      updates.push({
        id: line.id,
        data: {
          tangent: undefined,
        },
      })
      continue
    }

    const tangentResult = buildSetSketchLineEndpointTangentToCirclePlan({
      line,
      circle,
      endpoint: line.tangent.endpoint,
      ignoreFixed: true,
    })
    if (!tangentResult.ok) {
      return { ok: false, reason: '目标圆更新后，关联草图线无法继续保持相切。' }
    }

    const currentPoint = line.tangent.endpoint === 'start' ? line.start : line.end
    if (arePointsCoincident(currentPoint, tangentResult.point)) {
      continue
    }

    if ((line.relations ?? []).includes('fixed')) {
      return { ok: false, reason: '存在固定的相切草图线，无法随圆更新。' }
    }

    const start = line.tangent.endpoint === 'start' ? tangentResult.point : line.start
    const end = line.tangent.endpoint === 'end' ? tangentResult.point : line.end
    updates.push({
      id: line.id,
      data: (() => {
        const patch: Partial<SketchLineNode> = {
          coincident: clearCoincidentEndpoint(line, line.tangent.endpoint),
          dimensions: buildSketchLineGeometryDimensionData({
            line,
            start,
            end,
          }),
          relations: getSketchLineTangentRelations(line.relations),
          tangent: line.tangent,
        }
        patch[line.tangent.endpoint] = tangentResult.point
        return patch
      })(),
    })
  }

  return { ok: true, updates }
}

export function buildRemoveSketchLineTangentReferencesPlan(args: {
  deletedCircleIds: Iterable<SketchCircleNode['id']>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
}) {
  const { deletedCircleIds, linesById } = args
  const deletedCircleIdSet = new Set(deletedCircleIds)
  const updates: SketchLineEditUpdate[] = []

  for (const line of linesById.values()) {
    if (!(line.tangent && deletedCircleIdSet.has(line.tangent.circleId))) {
      continue
    }

    updates.push({
      id: line.id,
      data: {
        tangent: undefined,
      },
    })
  }

  return updates
}
