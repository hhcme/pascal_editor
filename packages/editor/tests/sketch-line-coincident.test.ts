import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  buildPropagateSketchLineCoincidentReferences,
  buildRemoveSketchLineCoincidentReferencesPlan,
} from '../src/components/tools/sketch/sketch-line-coincident'

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

describe('sketch line coincident propagation', () => {
  test('propagates line-point attachments when the target line moves', () => {
    const target = makeSketchLine([0, 2], [6, 2], {
      id: 'sketch_line_coincident_target',
    })
    const source = makeSketchLine([2, 0], [4, 0], {
      id: 'sketch_line_coincident_source',
      coincident: {
        start: {
          kind: 'line-point',
          lineId: target.id,
          t: 0.5,
        },
      },
    })

    const result = buildPropagateSketchLineCoincidentReferences({
      linesById: new Map([
        [target.id, target],
        [source.id, source],
      ]),
      circlesById: new Map(),
      changedLineIds: [target.id],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.updates).toEqual([
      {
        id: source.id,
        data: {
          dimensions: {},
          start: [3, 2],
          end: [4, 0],
        },
      },
    ])
  })

  test('propagates circle-point attachments when the target circle changes', () => {
    const circle = makeSketchCircle([4, 1], 2, {
      id: 'sketch_circle_coincident_target',
    })
    const source = makeSketchLine([5, 1], [7, 1], {
      id: 'sketch_line_coincident_circle_source',
      coincident: {
        start: {
          kind: 'circle-point',
          circleId: circle.id,
          angle: Math.PI / 2,
        },
      },
    })
    const updatedCircle = {
      ...circle,
      radius: 3,
    }

    const result = buildPropagateSketchLineCoincidentReferences({
      linesById: new Map([[source.id, source]]),
      circlesById: new Map([[circle.id, updatedCircle]]),
      changedCircleIds: [circle.id],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.updates).toEqual([
      {
        id: source.id,
        data: {
          dimensions: {},
          start: [4, 4],
          end: [7, 1],
        },
      },
    ])
  })

  test('re-enforces a line attachment when the source line is moved away', () => {
    const target = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_coincident_self_target',
    })
    const source = makeSketchLine([5, 2], [7, 2], {
      id: 'sketch_line_coincident_self_source',
      coincident: {
        start: {
          kind: 'line-point',
          lineId: target.id,
          t: 0.25,
        },
      },
    })

    const result = buildPropagateSketchLineCoincidentReferences({
      linesById: new Map([
        [target.id, target],
        [source.id, source],
      ]),
      circlesById: new Map(),
      changedLineIds: [source.id],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.updates).toEqual([
      {
        id: source.id,
        data: {
          dimensions: {},
          start: [1, 0],
          end: [7, 2],
        },
      },
    ])
  })

  test('updates reference angle dimensions and clears driven angle dimensions during propagation', () => {
    const target = makeSketchLine([0, 2], [6, 2], {
      id: 'sketch_line_coincident_angle_target',
    })
    const referenceSource = makeSketchLine([2, 0], [4, 0], {
      id: 'sketch_line_coincident_angle_reference',
      coincident: {
        start: {
          kind: 'line-point',
          lineId: target.id,
          t: 0.5,
        },
      },
      dimensions: {
        angle: 0,
        angleMode: 'reference',
      },
    })
    const drivenSource = makeSketchLine([2, -2], [4, -2], {
      id: 'sketch_line_coincident_angle_driven',
      coincident: {
        start: {
          kind: 'line-point',
          lineId: target.id,
          t: 0.5,
        },
      },
      dimensions: {
        angle: 0,
        angleMode: 'driven',
      },
    })

    const result = buildPropagateSketchLineCoincidentReferences({
      linesById: new Map([
        [target.id, target],
        [referenceSource.id, referenceSource],
        [drivenSource.id, drivenSource],
      ]),
      circlesById: new Map(),
      changedLineIds: [target.id],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const referenceUpdate = result.updates.find((update) => update.id === referenceSource.id)
    const drivenUpdate = result.updates.find((update) => update.id === drivenSource.id)

    expect(referenceUpdate?.data.start).toEqual([3, 2])
    expect(referenceUpdate?.data.dimensions?.angleMode).toBe('reference')
    expect(referenceUpdate?.data.dimensions?.angle).toBeCloseTo(
      Math.atan2(-2, 1) + Math.PI * 2,
      6,
    )
    expect(drivenUpdate?.data.dimensions).toEqual({})
  })

  test('cleans coincident references to deleted lines and circles', () => {
    const lineTarget = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_coincident_delete_target',
    })
    const circleTarget = makeSketchCircle([4, 2], 1, {
      id: 'sketch_circle_coincident_delete_target',
    })
    const source = makeSketchLine([0, 2], [2, 2], {
      id: 'sketch_line_coincident_delete_source',
      coincident: {
        start: {
          kind: 'line-point',
          lineId: lineTarget.id,
          t: 0.5,
        },
        end: {
          kind: 'circle-point',
          circleId: circleTarget.id,
          angle: 0,
        },
      },
    })

    expect(
      buildRemoveSketchLineCoincidentReferencesPlan({
        linesById: new Map([
          [lineTarget.id, lineTarget],
          [source.id, source],
        ]),
        deletedLineIds: [lineTarget.id],
        deletedCircleIds: [circleTarget.id],
      }),
    ).toEqual([
      {
        id: source.id,
        data: {
          coincident: {},
        },
      },
    ])
  })
})
