import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import { SketchDimensionNode as SketchDimensionNodeSchema } from '../../core/src/schema/nodes/sketch-dimension'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  areSketchDimensionReferencesEqual,
  buildSetSketchDistanceDimensionValuePlan,
  collectSketchDistanceDimensionIdsReferencingEntities,
  findSketchDistanceDimensionIdByReferences,
  getSketchDistanceDimensionValue,
  resolveSketchDimensionPointReference,
  resolveSketchDistanceMeasurement,
} from '../src/components/tools/sketch/sketch-distance-dimensions'

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

function makeSketchDistanceDimension(
  start: {
    kind: 'line-endpoint'
    lineId: `sketch_line_${string}`
    endpoint: 'start' | 'end'
  } | {
    kind: 'circle-center'
    circleId: `sketch_circle_${string}`
  } | {
    kind: 'line'
    lineId: `sketch_line_${string}`
  },
  end: {
    kind: 'line-endpoint'
    lineId: `sketch_line_${string}`
    endpoint: 'start' | 'end'
  } | {
    kind: 'circle-center'
    circleId: `sketch_circle_${string}`
  } | {
    kind: 'line'
    lineId: `sketch_line_${string}`
  },
  extra: Record<string, unknown> = {},
) {
  return SketchDimensionNodeSchema.parse({
    name: 'Sketch Distance',
    start,
    end,
    ...extra,
  })
}

describe('sketch distance dimensions', () => {
  test('resolves line endpoints and circle centers into points', () => {
    const line = makeSketchLine([1, 2], [4, 6], {
      id: 'sketch_line_dimension_resolve',
    })
    const circle = makeSketchCircle([8, 3], 2, {
      id: 'sketch_circle_dimension_resolve',
    })
    const linesById = new Map([[line.id, line]])
    const circlesById = new Map([[circle.id, circle]])

    expect(
      resolveSketchDimensionPointReference({
        circlesById,
        linesById,
        reference: {
          kind: 'line-endpoint',
          lineId: line.id,
          endpoint: 'end',
        },
      }),
    ).toEqual([4, 6])
    expect(
      resolveSketchDimensionPointReference({
        circlesById,
        linesById,
        reference: {
          kind: 'circle-center',
          circleId: circle.id,
        },
      }),
    ).toEqual([8, 3])
  })

  test('measures point-to-point distance across mixed sketch references', () => {
    const line = makeSketchLine([0, 0], [3, 4], {
      id: 'sketch_line_dimension_measure',
    })
    const circle = makeSketchCircle([6, 8], 1, {
      id: 'sketch_circle_dimension_measure',
    })
    const dimension = makeSketchDistanceDimension(
      {
        kind: 'line-endpoint',
        lineId: line.id,
        endpoint: 'end',
      },
      {
        kind: 'circle-center',
        circleId: circle.id,
      },
    )

    expect(
      getSketchDistanceDimensionValue({
        circlesById: new Map([[circle.id, circle]]),
        dimension,
        linesById: new Map([[line.id, line]]),
      }),
    ).toBe(5)
  })

  test('finds duplicate dimensions regardless of anchor order', () => {
    const dimension = makeSketchDistanceDimension(
      {
        kind: 'line-endpoint',
        lineId: 'sketch_line_dimension_duplicate_a',
        endpoint: 'start',
      },
      {
        kind: 'circle-center',
        circleId: 'sketch_circle_dimension_duplicate_b',
      },
      {
        id: 'sketch_dimension_duplicate',
      },
    )

    expect(
      findSketchDistanceDimensionIdByReferences({
        dimensions: [dimension],
        first: {
          kind: 'circle-center',
          circleId: 'sketch_circle_dimension_duplicate_b',
        },
        second: {
          kind: 'line-endpoint',
          lineId: 'sketch_line_dimension_duplicate_a',
          endpoint: 'start',
        },
      }),
    ).toBe(dimension.id)

    expect(
      areSketchDimensionReferencesEqual(
        {
          kind: 'line-endpoint',
          lineId: 'sketch_line_dimension_duplicate_a',
          endpoint: 'start',
        },
        {
          kind: 'line-endpoint',
          lineId: 'sketch_line_dimension_duplicate_a',
          endpoint: 'start',
        },
      ),
    ).toBe(true)
  })

  test('measures point-to-line distance from a point reference to a line reference', () => {
    const pointLine = makeSketchLine([3, 4], [5, 4], {
      id: 'sketch_line_dimension_point_anchor',
    })
    const targetLine = makeSketchLine([0, 0], [10, 0], {
      id: 'sketch_line_dimension_point_target',
    })
    const result = resolveSketchDistanceMeasurement({
      circlesById: new Map(),
      dimension: makeSketchDistanceDimension(
        {
          kind: 'line-endpoint',
          lineId: pointLine.id,
          endpoint: 'start',
        },
        {
          kind: 'line',
          lineId: targetLine.id,
        },
      ),
      linesById: new Map([
        [pointLine.id, pointLine],
        [targetLine.id, targetLine],
      ]),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.measurement.relation).toBe('point-line')
    expect(result.measurement.startPoint).toEqual([3, 4])
    expect(result.measurement.endPoint).toEqual([3, 0])
    expect(result.measurement.value).toBe(4)
  })

  test('measures line-to-line distance between parallel lines', () => {
    const firstLine = makeSketchLine([0, 0], [8, 0], {
      id: 'sketch_line_dimension_parallel_a',
    })
    const secondLine = makeSketchLine([0, 3], [8, 3], {
      id: 'sketch_line_dimension_parallel_b',
    })
    const result = resolveSketchDistanceMeasurement({
      circlesById: new Map(),
      dimension: makeSketchDistanceDimension(
        {
          kind: 'line',
          lineId: firstLine.id,
        },
        {
          kind: 'line',
          lineId: secondLine.id,
        },
      ),
      linesById: new Map([
        [firstLine.id, firstLine],
        [secondLine.id, secondLine],
      ]),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.measurement.relation).toBe('line-line')
    expect(result.measurement.startPoint).toEqual([4, 0])
    expect(result.measurement.endPoint).toEqual([4, 3])
    expect(result.measurement.value).toBe(3)
  })

  test('rejects line-to-line distance between non-parallel lines', () => {
    const firstLine = makeSketchLine([0, 0], [8, 0], {
      id: 'sketch_line_dimension_not_parallel_a',
    })
    const secondLine = makeSketchLine([0, 0], [4, 4], {
      id: 'sketch_line_dimension_not_parallel_b',
    })
    const result = resolveSketchDistanceMeasurement({
      circlesById: new Map(),
      dimension: makeSketchDistanceDimension(
        {
          kind: 'line',
          lineId: firstLine.id,
        },
        {
          kind: 'line',
          lineId: secondLine.id,
        },
      ),
      linesById: new Map([
        [firstLine.id, firstLine],
        [secondLine.id, secondLine],
      ]),
    })

    expect(result).toEqual({
      ok: false,
      reason: 'line-line-not-parallel',
    })
  })

  test('collects dimensions that reference deleted sketch entities', () => {
    const lineDimension = makeSketchDistanceDimension(
      {
        kind: 'line-endpoint',
        lineId: 'sketch_line_dimension_delete_a',
        endpoint: 'end',
      },
      {
        kind: 'line-endpoint',
        lineId: 'sketch_line_dimension_delete_b',
        endpoint: 'start',
      },
      {
        id: 'sketch_dimension_delete_line',
      },
    )
    const circleDimension = makeSketchDistanceDimension(
      {
        kind: 'circle-center',
        circleId: 'sketch_circle_dimension_delete_a',
      },
      {
        kind: 'line-endpoint',
        lineId: 'sketch_line_dimension_delete_c',
        endpoint: 'start',
      },
      {
        id: 'sketch_dimension_delete_circle',
      },
    )
    const lineReferenceDimension = makeSketchDistanceDimension(
      {
        kind: 'line',
        lineId: 'sketch_line_dimension_delete_line_ref',
      },
      {
        kind: 'circle-center',
        circleId: 'sketch_circle_dimension_delete_b',
      },
      {
        id: 'sketch_dimension_delete_line_reference',
      },
    )

    expect(
      collectSketchDistanceDimensionIdsReferencingEntities({
        dimensions: [lineDimension, circleDimension, lineReferenceDimension],
        deletedLineIds: ['sketch_line_dimension_delete_b'],
      }),
    ).toEqual(['sketch_dimension_delete_line'])
    expect(
      collectSketchDistanceDimensionIdsReferencingEntities({
        dimensions: [lineDimension, circleDimension, lineReferenceDimension],
        deletedCircleIds: ['sketch_circle_dimension_delete_a'],
      }),
    ).toEqual(['sketch_dimension_delete_circle'])
    expect(
      collectSketchDistanceDimensionIdsReferencingEntities({
        dimensions: [lineDimension, circleDimension, lineReferenceDimension],
        deletedLineIds: ['sketch_line_dimension_delete_line_ref'],
      }),
    ).toEqual(['sketch_dimension_delete_line_reference'])
  })

  test('builds a point-to-point driven plan by moving the end endpoint', () => {
    const anchorLine = makeSketchLine([0, 0], [1, 0], {
      id: 'sketch_line_dimension_drive_point_anchor',
    })
    const movedLine = makeSketchLine([2, 0], [6, 0], {
      id: 'sketch_line_dimension_drive_point_target',
    })

    const result = buildSetSketchDistanceDimensionValuePlan({
      circlesById: new Map(),
      dimension: makeSketchDistanceDimension(
        {
          kind: 'line-endpoint',
          lineId: anchorLine.id,
          endpoint: 'start',
        },
        {
          kind: 'line-endpoint',
          lineId: movedLine.id,
          endpoint: 'start',
        },
      ),
      linesById: new Map([
        [anchorLine.id, anchorLine],
        [movedLine.id, movedLine],
      ]),
      value: 4,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.kind !== 'line') {
      return
    }

    expect(result.updates).toEqual([
      {
        id: movedLine.id,
        data: {
          start: [4, 0],
          end: [6, 0],
          dimensions: {},
        },
      },
    ])
  })

  test('builds a point-to-point driven plan by moving the end circle center', () => {
    const anchorLine = makeSketchLine([0, 0], [1, 0], {
      id: 'sketch_line_dimension_drive_circle_anchor',
    })
    const circle = makeSketchCircle([3, 4], 1, {
      id: 'sketch_circle_dimension_drive_circle_target',
    })

    const result = buildSetSketchDistanceDimensionValuePlan({
      circlesById: new Map([[circle.id, circle]]),
      dimension: makeSketchDistanceDimension(
        {
          kind: 'line-endpoint',
          lineId: anchorLine.id,
          endpoint: 'start',
        },
        {
          kind: 'circle-center',
          circleId: circle.id,
        },
      ),
      linesById: new Map([[anchorLine.id, anchorLine]]),
      value: 10,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.kind !== 'circle-center') {
      return
    }

    expect(result.circleId).toBe(circle.id)
    expect(result.center[0]).toBeCloseTo(6)
    expect(result.center[1]).toBeCloseTo(8)
  })

  test('builds a point-to-line driven plan by translating the end line', () => {
    const pointLine = makeSketchLine([0, 4], [1, 4], {
      id: 'sketch_line_dimension_drive_point_line_point',
    })
    const targetLine = makeSketchLine([0, 0], [10, 0], {
      id: 'sketch_line_dimension_drive_point_line_target',
    })

    const result = buildSetSketchDistanceDimensionValuePlan({
      circlesById: new Map(),
      dimension: makeSketchDistanceDimension(
        {
          kind: 'line-endpoint',
          lineId: pointLine.id,
          endpoint: 'start',
        },
        {
          kind: 'line',
          lineId: targetLine.id,
        },
      ),
      linesById: new Map([
        [pointLine.id, pointLine],
        [targetLine.id, targetLine],
      ]),
      value: 2,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.kind !== 'line') {
      return
    }

    expect(result.updates).toEqual([
      {
        id: targetLine.id,
        data: {
          start: [0, 2],
          end: [10, 2],
          dimensions: {},
        },
      },
    ])
  })

  test('builds a line-to-line driven plan by translating the end line', () => {
    const firstLine = makeSketchLine([0, 0], [8, 0], {
      id: 'sketch_line_dimension_drive_line_line_a',
    })
    const secondLine = makeSketchLine([0, 3], [8, 3], {
      id: 'sketch_line_dimension_drive_line_line_b',
    })

    const result = buildSetSketchDistanceDimensionValuePlan({
      circlesById: new Map(),
      dimension: makeSketchDistanceDimension(
        {
          kind: 'line',
          lineId: firstLine.id,
        },
        {
          kind: 'line',
          lineId: secondLine.id,
        },
      ),
      linesById: new Map([
        [firstLine.id, firstLine],
        [secondLine.id, secondLine],
      ]),
      value: 1,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.kind !== 'line') {
      return
    }

    expect(result.updates).toEqual([
      {
        id: secondLine.id,
        data: {
          start: [0, 1],
          end: [8, 1],
          dimensions: {},
        },
      },
    ])
  })

  test('rejects driving a coincident line endpoint directly', () => {
    const anchorLine = makeSketchLine([0, 0], [1, 0], {
      id: 'sketch_line_dimension_drive_reject_anchor',
    })
    const movedLine = makeSketchLine([2, 0], [6, 0], {
      coincident: {
        start: {
          lineId: anchorLine.id,
          endpoint: 'end',
        },
      },
      id: 'sketch_line_dimension_drive_reject_target',
    })

    expect(
      buildSetSketchDistanceDimensionValuePlan({
        circlesById: new Map(),
        dimension: makeSketchDistanceDimension(
          {
            kind: 'line-endpoint',
            lineId: anchorLine.id,
            endpoint: 'start',
          },
          {
            kind: 'line-endpoint',
            lineId: movedLine.id,
            endpoint: 'start',
          },
        ),
        linesById: new Map([
          [anchorLine.id, anchorLine],
          [movedLine.id, movedLine],
        ]),
        value: 4,
      }),
    ).toEqual({
      ok: false,
      reason: '受重合约束控制的草图端点暂不支持由距离尺寸驱动。',
    })
  })
})
