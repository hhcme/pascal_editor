import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import {
  buildRemoveSketchCircleConstraintReferencesPlan,
  buildSetSketchCircleCenterPlan,
  buildSetSketchCircleRadiusPlan,
  buildToggleSketchCircleConstraintPlan,
  isSketchCircleConstraintActive,
} from '../src/components/tools/sketch/sketch-circle-constraints'

function makeSketchCircle(
  center: [number, number],
  radius: number,
  extra: Record<string, unknown> = {},
) {
  return SketchCircleNodeSchema.parse({
    name: 'Circle',
    center,
    radius,
    ...extra,
  })
}

describe('sketch circle constraints', () => {
  test('propagates radius across equal-radius chains', () => {
    const first = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_first',
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_second' }],
    })
    const second = makeSketchCircle([4, 0], 2, {
      id: 'sketch_circle_second',
      constraints: [
        { kind: 'equal-radius', targetId: 'sketch_circle_first' },
        { kind: 'equal-radius', targetId: 'sketch_circle_third' },
      ],
    })
    const third = makeSketchCircle([8, 0], 2, {
      id: 'sketch_circle_third',
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_second' }],
    })
    const circlesById = new Map([
      [first.id, first],
      [second.id, second],
      [third.id, third],
    ] as const)

    const result = buildSetSketchCircleRadiusPlan({
      circle: second,
      circlesById,
      radius: 3.5,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.updates).toHaveLength(3)
    expect(result.updates.every((update) => update.data.radius === 3.5)).toBe(true)
    expect(result.updates.every((update) => update.data.dimensions?.radius === 3.5)).toBe(true)
    expect(result.updates.every((update) => update.data.dimensions?.radiusMode === 'driven')).toBe(
      true,
    )
  })

  test('blocks radius propagation when a fixed constrained circle would move', () => {
    const first = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_first',
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_second' }],
    })
    const second = makeSketchCircle([4, 0], 4, {
      id: 'sketch_circle_second',
      relations: ['fixed'],
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_first' }],
    })
    const circlesById = new Map([
      [first.id, first],
      [second.id, second],
    ] as const)

    const result = buildSetSketchCircleRadiusPlan({
      circle: first,
      circlesById,
      radius: 5,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.reason).toContain('固定圆')
  })

  test('propagates center changes across concentric circles', () => {
    const first = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_first',
      constraints: [{ kind: 'concentric', targetId: 'sketch_circle_second' }],
    })
    const second = makeSketchCircle([1, 1], 4, {
      id: 'sketch_circle_second',
      constraints: [{ kind: 'concentric', targetId: 'sketch_circle_first' }],
    })
    const circlesById = new Map([
      [first.id, first],
      [second.id, second],
    ] as const)

    const result = buildSetSketchCircleCenterPlan({
      circle: first,
      circlesById,
      center: [3, -2],
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.updates).toHaveLength(2)
    expect(result.updates[0]?.data.center).toEqual([3, -2])
    expect(result.updates[1]?.data.center).toEqual([3, -2])
  })

  test('toggles equal-radius constraints on selected circles and aligns geometry', () => {
    const first = makeSketchCircle([0, 0], 2, { id: 'sketch_circle_first' })
    const second = makeSketchCircle([4, 0], 5, { id: 'sketch_circle_second' })
    const circlesById = new Map([
      [first.id, first],
      [second.id, second],
    ] as const)

    expect(
      isSketchCircleConstraintActive({
        circles: [first, second],
        circlesById,
        kind: 'equal-radius',
      }),
    ).toBe(false)

    const result = buildToggleSketchCircleConstraintPlan({
      circles: [first, second],
      circlesById,
      kind: 'equal-radius',
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    const firstUpdate = result.updates.find((update) => update.id === first.id)
    const secondUpdate = result.updates.find((update) => update.id === second.id)

    expect(firstUpdate?.data.constraints).toEqual([{ kind: 'equal-radius', targetId: second.id }])
    expect(secondUpdate?.data.constraints).toEqual([{ kind: 'equal-radius', targetId: first.id }])
    expect(secondUpdate?.data.radius).toBe(2)
    expect(secondUpdate?.data.dimensions?.radius).toBe(2)
    expect(secondUpdate?.data.dimensions?.radiusMode).toBe('driven')
  })

  test('toggles tangent constraints on selected circles and aligns the peer center', () => {
    const first = makeSketchCircle([0, 0], 2, { id: 'sketch_circle_tangent_first' })
    const second = makeSketchCircle([10, 0], 3, { id: 'sketch_circle_tangent_second' })
    const circlesById = new Map([
      [first.id, first],
      [second.id, second],
    ] as const)

    const result = buildToggleSketchCircleConstraintPlan({
      circles: [first, second],
      circlesById,
      kind: 'tangent',
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    const firstUpdate = result.updates.find((update) => update.id === first.id)
    const secondUpdate = result.updates.find((update) => update.id === second.id)

    expect(firstUpdate?.data.constraints).toEqual([
      { kind: 'tangent', targetId: second.id, tangentMode: 'external' },
    ])
    expect(secondUpdate?.data.constraints).toEqual([
      { kind: 'tangent', targetId: first.id, tangentMode: 'external' },
    ])
    expect(secondUpdate?.data.center).toEqual([5, 0])
  })

  test('propagates tangent peer position when the anchor radius changes', () => {
    const first = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_tangent_radius_first',
      constraints: [
        {
          kind: 'tangent',
          targetId: 'sketch_circle_tangent_radius_second',
          tangentMode: 'external',
        },
      ],
    })
    const second = makeSketchCircle([5, 0], 3, {
      id: 'sketch_circle_tangent_radius_second',
      constraints: [
        {
          kind: 'tangent',
          targetId: 'sketch_circle_tangent_radius_first',
          tangentMode: 'external',
        },
      ],
    })
    const circlesById = new Map([
      [first.id, first],
      [second.id, second],
    ] as const)

    const result = buildSetSketchCircleRadiusPlan({
      circle: first,
      circlesById,
      radius: 4,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.updates.find((update) => update.id === first.id)?.data.radius).toBe(4)
    expect(result.updates.find((update) => update.id === second.id)?.data.center).toEqual([7, 0])
  })

  test('preserves reference radius dimensions while equal-radius propagation updates geometry', () => {
    const first = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_reference_first',
      dimensions: { radius: 2, radiusMode: 'reference' },
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_reference_second' }],
    })
    const second = makeSketchCircle([4, 0], 2, {
      id: 'sketch_circle_reference_second',
      dimensions: { radius: 2, radiusMode: 'reference' },
      constraints: [{ kind: 'equal-radius', targetId: first.id }],
    })
    const circlesById = new Map([
      [first.id, first],
      [second.id, second],
    ] as const)

    const result = buildSetSketchCircleRadiusPlan({
      circle: first,
      circlesById,
      radius: 3,
      dimensionMode: 'reference',
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(
      result.updates.every((update) => update.data.dimensions?.radiusMode === 'reference'),
    ).toBe(true)
  })

  test('preserves full-circle diameter display while editing the driven radius', () => {
    const circle = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_diameter_display',
      kind: 'circle',
      dimensions: { radius: 2, radiusMode: 'driven', radiusDisplay: 'diameter' },
    })
    const circlesById = new Map([[circle.id, circle]] as const)

    const result = buildSetSketchCircleRadiusPlan({
      circle,
      circlesById,
      radius: 3,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.updates[0]?.data.dimensions).toEqual({
      radius: 3,
      radiusMode: 'driven',
      radiusDisplay: 'diameter',
    })
  })

  test('removes deleted circle references from surviving constraints', () => {
    const first = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_first',
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_second' }],
    })
    const second = makeSketchCircle([4, 0], 2, {
      id: 'sketch_circle_second',
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_first' }],
    })
    const third = makeSketchCircle([8, 0], 2, {
      id: 'sketch_circle_third',
      constraints: [{ kind: 'concentric', targetId: 'sketch_circle_second' }],
    })
    const circlesById = new Map([
      [first.id, first],
      [second.id, second],
      [third.id, third],
    ] as const)

    const updates = buildRemoveSketchCircleConstraintReferencesPlan({
      circlesById,
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
