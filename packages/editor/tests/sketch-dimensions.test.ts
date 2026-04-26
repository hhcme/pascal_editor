import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  clearSketchCircleRadiusDimensionData,
  clearSketchLineAngleDimensionData,
  getSketchCircleDisplayedDimensionLabel,
  getSketchCircleDisplayedDimensionValue,
  buildSketchCircleGeometryDimensionData,
  buildSketchLineGeometryDimensionData,
  getSketchLineDisplayedAngleDegrees,
} from '../src/components/tools/sketch/sketch-dimensions'

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

describe('sketch dimensions', () => {
  test('preserves reference line dimensions and clears driven ones on geometry-forced edits', () => {
    const referenceLine = makeSketchLine([0, 0], [3, 0], {
      dimensions: { length: 3, lengthMode: 'reference' },
    })
    const drivenLine = makeSketchLine([0, 0], [3, 0], {
      dimensions: { length: 3, lengthMode: 'driven' },
    })

    expect(
      buildSketchLineGeometryDimensionData({
        line: referenceLine,
        end: [4, 0],
      }),
    ).toEqual({
      length: 4,
      lengthMode: 'reference',
    })
    expect(
      buildSketchLineGeometryDimensionData({
        line: drivenLine,
        end: [4, 0],
      }),
    ).toEqual({})
  })

  test('preserves reference circle dimensions and clears driven ones on radius-forced edits', () => {
    const referenceCircle = makeSketchCircle([0, 0], 2, {
      dimensions: { radius: 2, radiusMode: 'reference' },
    })
    const drivenCircle = makeSketchCircle([0, 0], 2, {
      dimensions: { radius: 2, radiusMode: 'driven' },
    })

    expect(
      buildSketchCircleGeometryDimensionData({
        circle: referenceCircle,
        radius: 3,
      }),
    ).toEqual({
      radius: 3,
      radiusMode: 'reference',
      radiusDisplay: 'radius',
    })
    expect(
      buildSketchCircleGeometryDimensionData({
        circle: drivenCircle,
        radius: 3,
      }),
    ).toEqual({})
  })

  test('supports full-circle diameter display and preserves it when removing the dimension value', () => {
    const circle = makeSketchCircle([0, 0], 2, {
      kind: 'circle',
      dimensions: { radius: 2, radiusMode: 'reference', radiusDisplay: 'diameter' },
    })

    expect(getSketchCircleDisplayedDimensionLabel(circle)).toBe('直径')
    expect(getSketchCircleDisplayedDimensionValue({ circle })).toBe(4)
    expect(clearSketchCircleRadiusDimensionData(circle)).toEqual({
      radiusDisplay: 'diameter',
    })
  })

  test('preserves reference angle dimensions and clears driven ones on geometry-forced edits', () => {
    const referenceLine = makeSketchLine([0, 0], [0, 3], {
      dimensions: { angle: Math.PI / 2, angleMode: 'reference' },
    })
    const drivenLine = makeSketchLine([0, 0], [0, 3], {
      dimensions: { angle: Math.PI / 2, angleMode: 'driven' },
    })

    expect(
      buildSketchLineGeometryDimensionData({
        line: referenceLine,
        end: [3, 0],
      }),
    ).toEqual({
      angle: 0,
      angleMode: 'reference',
    })
    expect(
      buildSketchLineGeometryDimensionData({
        line: drivenLine,
        end: [3, 0],
      }),
    ).toEqual({})
    expect(clearSketchLineAngleDimensionData(referenceLine)).toEqual({})
    expect(getSketchLineDisplayedAngleDegrees(referenceLine)).toBe(90)
  })
})
