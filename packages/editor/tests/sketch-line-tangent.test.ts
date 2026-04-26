import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  buildPropagateSketchLineTangentsFromCircles,
  buildRemoveSketchLineTangentReferencesPlan,
  buildSetSketchLineTangentConstraintPatch,
  clearSketchLineTangentIfGeometryChanges,
} from '../src/components/tools/sketch/sketch-line-tangent'

function makeSketchLine(
  start: [number, number],
  end: [number, number],
  extra: Record<string, unknown> = {},
) {
  return SketchLineNodeSchema.parse({
    name: 'Sketch Line',
    start,
    end,
    ...extra,
  })
}

function makeSketchCircle(
  center: [number, number],
  radius: number,
  extra: Record<string, unknown> = {},
) {
  return SketchCircleNodeSchema.parse({
    name: 'Sketch Circle',
    center,
    radius,
    ...extra,
  })
}

describe('sketch line tangent constraints', () => {
  test('stores a tangent reference on the moved endpoint and clears conflicting line state', () => {
    const circle = makeSketchCircle([4, 2], 1, { id: 'sketch_circle_tangent_a' })
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_tangent_a',
      relations: ['horizontal'],
      dimensions: { length: 4 },
      coincident: {
        end: { lineId: 'sketch_line_anchor', endpoint: 'start' },
      },
    })

    const result = buildSetSketchLineTangentConstraintPatch({
      line,
      circle,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.patch.tangent).toEqual({
      circleId: circle.id,
      endpoint: 'end',
    })
    expect(result.patch.relations).toEqual([])
    expect(result.patch.dimensions).toEqual({})
    expect(result.patch.coincident).toEqual({})
    expect(result.patch.end?.[1]).toBeLessThan(circle.center[1])
  })

  test('propagates tangent line endpoint when the driving circle changes', () => {
    const circle = makeSketchCircle([4, 2], 1, { id: 'sketch_circle_tangent_b' })
    const baseLine = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_tangent_b',
    })
    const tangentResult = buildSetSketchLineTangentConstraintPatch({
      line: baseLine,
      circle,
    })
    if (!tangentResult.ok) {
      throw new Error(tangentResult.reason)
    }

    const line = {
      ...baseLine,
      ...tangentResult.patch,
    }
    const resizedCircle = {
      ...circle,
      radius: 1.5,
      dimensions: { radius: 1.5 },
    }

    const propagation = buildPropagateSketchLineTangentsFromCircles({
      circlesById: new Map([[resizedCircle.id, resizedCircle]]),
      linesById: new Map([[line.id, line]]),
      changedCircleIds: [resizedCircle.id],
    })

    expect(propagation.ok).toBe(true)
    if (!propagation.ok) {
      return
    }

    expect(propagation.updates).toHaveLength(1)
    expect(propagation.updates[0]!.data.tangent).toEqual(line.tangent)
    expect(propagation.updates[0]!.data.end).not.toEqual(line.end)
  })

  test('blocks circle updates when a fixed tangent line would need to move', () => {
    const circle = makeSketchCircle([4, 2], 1, { id: 'sketch_circle_tangent_c' })
    const line = makeSketchLine([0, 0], [4.8, 1.4], {
      id: 'sketch_line_tangent_c',
      relations: ['fixed'],
      tangent: {
        circleId: circle.id,
        endpoint: 'end',
      },
    })
    const movedCircle = {
      ...circle,
      center: [5, 2] as [number, number],
    }

    const propagation = buildPropagateSketchLineTangentsFromCircles({
      circlesById: new Map([[movedCircle.id, movedCircle]]),
      linesById: new Map([[line.id, line]]),
      changedCircleIds: [movedCircle.id],
    })

    expect(propagation.ok).toBe(false)
    if (propagation.ok) {
      return
    }
    expect(propagation.reason).toContain('固定')
  })

  test('clears tangent references when line geometry is edited or target circles are deleted', () => {
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_tangent_d',
      tangent: {
        circleId: 'sketch_circle_tangent_d',
        endpoint: 'end',
      },
    })

    expect(clearSketchLineTangentIfGeometryChanges(line, { end: [5, 0] }).tangent).toBeUndefined()

    const cleanup = buildRemoveSketchLineTangentReferencesPlan({
      deletedCircleIds: ['sketch_circle_tangent_d'],
      linesById: new Map([[line.id, line]]),
    })

    expect(cleanup).toHaveLength(1)
    expect(cleanup[0]!.data.tangent).toBeUndefined()
  })
})
