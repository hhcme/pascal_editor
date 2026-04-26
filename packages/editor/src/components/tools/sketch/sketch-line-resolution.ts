import type { SketchCircleNode, SketchLineNode } from '@pascal-app/core'
import { buildPropagateSketchLineCoincidentReferences } from './sketch-line-coincident'
import { buildPropagateSketchLineConstraintsFromLines } from './sketch-line-constraints'
import { clearSketchLineTangentIfGeometryChanges } from './sketch-line-tangent'

export type SketchLineResolutionUpdate = {
  id: SketchLineNode['id']
  data: Partial<SketchLineNode>
}

export type SketchLineResolutionResult =
  | {
      ok: true
      updates: SketchLineResolutionUpdate[]
    }
  | {
      ok: false
      reason: string
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

export function buildResolvedSketchLineUpdateSet(args: {
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  initialUpdates?: SketchLineResolutionUpdate[]
  changedCircleIds?: Iterable<SketchCircleNode['id']>
}): SketchLineResolutionResult {
  const nextLineById = new Map(args.linesById)
  const updatesById = new Map<SketchLineNode['id'], Partial<SketchLineNode>>()

  const applyUpdates = (updates: SketchLineResolutionUpdate[]) => {
    const changedIds: SketchLineNode['id'][] = []

    for (const update of updates) {
      const line = nextLineById.get(update.id)
      if (!line) {
        continue
      }

      const sanitizedData = clearSketchLineTangentIfGeometryChanges(line, update.data)
      nextLineById.set(update.id, {
        ...line,
        ...sanitizedData,
      })
      setLineUpdate(updatesById, update.id, sanitizedData)
      changedIds.push(update.id)
    }

    return changedIds
  }

  let pendingLineIds = new Set(applyUpdates(args.initialUpdates ?? []))
  let pendingCircleIds = new Set(args.changedCircleIds ?? [])
  const maxIterations = Math.max(1, nextLineById.size * 8)

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const constraintPropagation =
      pendingLineIds.size > 0
        ? buildPropagateSketchLineConstraintsFromLines({
            linesById: nextLineById,
            changedLineIds: pendingLineIds,
          })
        : { ok: true as const, updates: [] }
    if (!constraintPropagation.ok) {
      return constraintPropagation
    }

    const constraintChangedIds = applyUpdates(constraintPropagation.updates)
    const coincidentSourceLineIds = new Set([...pendingLineIds, ...constraintChangedIds])
    const coincidentPropagation =
      coincidentSourceLineIds.size > 0 || pendingCircleIds.size > 0
        ? buildPropagateSketchLineCoincidentReferences({
            linesById: nextLineById,
            circlesById: args.circlesById,
            changedLineIds: coincidentSourceLineIds,
            changedCircleIds: pendingCircleIds,
          })
        : { ok: true as const, updates: [] }
    if (!coincidentPropagation.ok) {
      return coincidentPropagation
    }

    const coincidentChangedIds = applyUpdates(coincidentPropagation.updates)
    if (constraintChangedIds.length === 0 && coincidentChangedIds.length === 0) {
      return {
        ok: true,
        updates: [...updatesById.entries()].map(([id, data]) => ({
          id,
          data,
        })),
      }
    }

    pendingLineIds = new Set([...constraintChangedIds, ...coincidentChangedIds])
    pendingCircleIds = new Set()
  }

  return { ok: false, reason: '草图约束传播过于复杂，当前无法稳定求解。' }
}

