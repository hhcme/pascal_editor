import { describe, expect, test } from 'bun:test'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  buildPropagateSketchLineConstraintsFromLines,
  buildRemoveSketchLineConstraintReferencesPlan,
  buildToggleSketchLineConstraintPlan,
  isSketchLineConstraintActive,
} from '../src/components/tools/sketch/sketch-line-constraints'

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

function getLength(line: Pick<ReturnType<typeof makeSketchLine>, 'start' | 'end'>) {
  return Math.hypot(line.end[0] - line.start[0], line.end[1] - line.start[1])
}

function getDirection(line: Pick<ReturnType<typeof makeSketchLine>, 'start' | 'end'>) {
  const length = getLength(line)
  return [(line.end[0] - line.start[0]) / length, (line.end[1] - line.start[1]) / length] as const
}

function dot(first: readonly [number, number], second: readonly [number, number]) {
  return first[0] * second[0] + first[1] * second[1]
}

function cross(first: readonly [number, number], second: readonly [number, number]) {
  return first[0] * second[1] - first[1] * second[0]
}

describe('sketch line constraints', () => {
  test('toggles equal-length constraints and aligns target line length', () => {
    const first = makeSketchLine([0, 0], [4, 0], { id: 'sketch_line_constraint_first' })
    const second = makeSketchLine([0, 2], [1, 2], { id: 'sketch_line_constraint_second' })
    const linesById = new Map([
      [first.id, first],
      [second.id, second],
    ] as const)

    expect(
      isSketchLineConstraintActive({
        lines: [first, second],
        linesById,
        kind: 'equal-length',
      }),
    ).toBe(false)

    const result = buildToggleSketchLineConstraintPlan({
      lines: [first, second],
      linesById,
      kind: 'equal-length',
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    const firstUpdate = result.updates.find((update) => update.id === first.id)
    const secondUpdate = result.updates.find((update) => update.id === second.id)

    expect(firstUpdate?.data.constraints).toEqual([
      { kind: 'equal-length', targetId: second.id },
    ])
    expect(secondUpdate?.data.constraints).toEqual([
      { kind: 'equal-length', targetId: first.id },
    ])
    expect(getLength({ start: secondUpdate?.data.start ?? second.start, end: secondUpdate?.data.end ?? second.end })).toBeCloseTo(4, 6)
  })

  test('propagates parallel constraints while preserving target length', () => {
    const first = makeSketchLine([0, 0], [4, 4], {
      id: 'sketch_line_constraint_parallel_first',
      constraints: [{ kind: 'parallel', targetId: 'sketch_line_constraint_parallel_second' }],
    })
    const second = makeSketchLine([4, 1], [4, 4], {
      id: 'sketch_line_constraint_parallel_second',
      constraints: [{ kind: 'parallel', targetId: first.id }],
    })
    const movedFirst = {
      ...first,
      end: [5, 0] as [number, number],
    }

    const propagation = buildPropagateSketchLineConstraintsFromLines({
      linesById: new Map([
        [movedFirst.id, movedFirst],
        [second.id, second],
      ] as const),
      changedLineIds: [movedFirst.id],
    })

    expect(propagation.ok).toBe(true)
    if (!propagation.ok) {
      return
    }

    const secondUpdate = propagation.updates.find((update) => update.id === second.id)
    expect(secondUpdate).toBeDefined()
    const nextSecond = {
      ...second,
      ...secondUpdate?.data,
    }
    expect(getLength(nextSecond)).toBeCloseTo(getLength(second), 6)
    expect(cross(getDirection(movedFirst), getDirection(nextSecond))).toBeCloseTo(0, 6)
  })

  test('propagates perpendicular constraints from a coincident start anchor', () => {
    const first = makeSketchLine([0, 0], [0, 4], {
      id: 'sketch_line_constraint_perp_first',
      constraints: [{ kind: 'perpendicular', targetId: 'sketch_line_constraint_perp_second' }],
    })
    const second = makeSketchLine([10, 0], [13, 0], {
      id: 'sketch_line_constraint_perp_second',
      coincident: {
        start: { lineId: 'sketch_line_anchor', endpoint: 'end' },
      },
      constraints: [{ kind: 'perpendicular', targetId: first.id }],
    })
    const movedFirst = {
      ...first,
      end: [4, 4] as [number, number],
    }

    const propagation = buildPropagateSketchLineConstraintsFromLines({
      linesById: new Map([
        [movedFirst.id, movedFirst],
        [second.id, second],
      ] as const),
      changedLineIds: [movedFirst.id],
    })

    expect(propagation.ok).toBe(true)
    if (!propagation.ok) {
      return
    }

    const secondUpdate = propagation.updates.find((update) => update.id === second.id)
    expect(secondUpdate?.data.start).toEqual(second.start)
    const nextSecond = {
      ...second,
      ...secondUpdate?.data,
    }
    expect(dot(getDirection(movedFirst), getDirection(nextSecond))).toBeCloseTo(0, 6)
  })

  test('aligns lines onto the same infinite line for collinear constraints', () => {
    const first = makeSketchLine([0, 0], [6, 0], { id: 'sketch_line_constraint_collinear_first' })
    const second = makeSketchLine([1, 3], [3, 5], { id: 'sketch_line_constraint_collinear_second' })
    const linesById = new Map([
      [first.id, first],
      [second.id, second],
    ] as const)

    const result = buildToggleSketchLineConstraintPlan({
      lines: [first, second],
      linesById,
      kind: 'collinear',
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    const secondUpdate = result.updates.find((update) => update.id === second.id)
    const nextSecond = {
      ...second,
      ...secondUpdate?.data,
    }
    expect(cross(getDirection(first), getDirection(nextSecond))).toBeCloseTo(0, 6)
    expect(nextSecond.start[1]).toBeCloseTo(0, 6)
    expect(nextSecond.end[1]).toBeCloseTo(0, 6)
  })

  test('blocks propagation when a fixed constrained line would need to move', () => {
    const first = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_constraint_fixed_first',
      constraints: [{ kind: 'parallel', targetId: 'sketch_line_constraint_fixed_second' }],
    })
    const second = makeSketchLine([1, 1], [1, 4], {
      id: 'sketch_line_constraint_fixed_second',
      relations: ['fixed'],
      constraints: [{ kind: 'parallel', targetId: first.id }],
    })
    const movedFirst = {
      ...first,
      end: [2, 4] as [number, number],
    }

    const propagation = buildPropagateSketchLineConstraintsFromLines({
      linesById: new Map([
        [movedFirst.id, movedFirst],
        [second.id, second],
      ] as const),
      changedLineIds: [movedFirst.id],
    })

    expect(propagation.ok).toBe(false)
    if (propagation.ok) {
      return
    }
    expect(propagation.reason).toContain('固定')
  })

  test('rejects perpendicular when the same pair already has a parallel constraint', () => {
    const first = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_constraint_conflict_first',
      constraints: [{ kind: 'parallel', targetId: 'sketch_line_constraint_conflict_second' }],
    })
    const second = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_constraint_conflict_second',
      constraints: [{ kind: 'parallel', targetId: first.id }],
    })

    const result = buildToggleSketchLineConstraintPlan({
      lines: [first, second],
      linesById: new Map([
        [first.id, first],
        [second.id, second],
      ] as const),
      kind: 'perpendicular',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.reason).toContain('平行约束')
    expect(result.reason).toContain('垂直约束')
  })

  test('rejects collinear when the same pair already has a perpendicular constraint', () => {
    const first = makeSketchLine([0, 0], [0, 4], {
      id: 'sketch_line_constraint_conflict_collinear_first',
      constraints: [{ kind: 'perpendicular', targetId: 'sketch_line_constraint_conflict_collinear_second' }],
    })
    const second = makeSketchLine([2, 0], [6, 0], {
      id: 'sketch_line_constraint_conflict_collinear_second',
      constraints: [{ kind: 'perpendicular', targetId: first.id }],
    })

    const result = buildToggleSketchLineConstraintPlan({
      lines: [first, second],
      linesById: new Map([
        [first.id, first],
        [second.id, second],
      ] as const),
      kind: 'collinear',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.reason).toContain('垂直约束')
    expect(result.reason).toContain('共线约束')
  })

  test('removes deleted line references from surviving constraints', () => {
    const first = makeSketchLine([0, 0], [2, 0], {
      id: 'sketch_line_constraint_cleanup_first',
      constraints: [{ kind: 'parallel', targetId: 'sketch_line_constraint_cleanup_second' }],
    })
    const second = makeSketchLine([0, 2], [2, 2], {
      id: 'sketch_line_constraint_cleanup_second',
      constraints: [{ kind: 'parallel', targetId: first.id }],
    })
    const third = makeSketchLine([0, 4], [2, 4], {
      id: 'sketch_line_constraint_cleanup_third',
      constraints: [{ kind: 'collinear', targetId: second.id }],
    })

    const updates = buildRemoveSketchLineConstraintReferencesPlan({
      linesById: new Map([
        [first.id, first],
        [second.id, second],
        [third.id, third],
      ] as const),
      deletedIds: [second.id],
    })

    expect(updates).toEqual([
      {
        id: first.id,
        data: { constraints: [] },
      },
      {
        id: third.id,
        data: { constraints: [] },
      },
    ])
  })
})
