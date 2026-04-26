import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import {
  getSketchCirclePatternDirection,
  getSketchCircleSelectionCenterX,
  mirrorSketchCircleAcrossVerticalAxis,
  offsetSketchCircle,
  translateSketchCircle,
} from '../src/components/tools/sketch/sketch-circle-transforms'

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

describe('sketch circle transforms', () => {
  test('mirrors arc circles across a vertical axis while preserving the reflected span', () => {
    const arc = makeSketchCircle([2, 1], 3, {
      id: 'sketch_circle_arc',
      kind: 'arc',
      startAngle: 0,
      endAngle: Math.PI / 2,
      relations: ['fixed'],
    })

    const mirrored = mirrorSketchCircleAcrossVerticalAxis(arc, 5)

    expect(mirrored.center).toEqual([8, 1])
    expect(mirrored.kind).toBe('arc')
    expect(mirrored.radius).toBe(3)
    expect(mirrored.startAngle).toBeCloseTo(Math.PI / 2, 6)
    expect(mirrored.endAngle).toBeCloseTo(Math.PI, 6)
    expect(mirrored.relations).toEqual([])
  })

  test('translates circles for array copies without changing arc definition', () => {
    const circle = makeSketchCircle([1, 2], 4, {
      id: 'sketch_circle_translate',
      kind: 'arc',
      startAngle: Math.PI / 4,
      endAngle: Math.PI,
    })

    const translated = translateSketchCircle(circle, [3, -1])

    expect(translated.center).toEqual([4, 1])
    expect(translated.startAngle).toBeCloseTo(Math.PI / 4, 6)
    expect(translated.endAngle).toBeCloseTo(Math.PI, 6)
  })

  test('derives mirror center and pattern direction from circle selection', () => {
    const first = makeSketchCircle([0, 0], 1, { id: 'sketch_circle_first' })
    const second = makeSketchCircle([3, 4], 2, { id: 'sketch_circle_second' })

    expect(getSketchCircleSelectionCenterX([first, second])).toBe(1.5)
    expect(getSketchCirclePatternDirection([first, second])[0]).toBeCloseTo(0.6, 6)
    expect(getSketchCirclePatternDirection([first, second])[1]).toBeCloseTo(0.8, 6)
  })

  test('offsets circles and arcs by increasing radius while preserving arc span', () => {
    const arc = makeSketchCircle([2, 3], 2, {
      id: 'sketch_circle_offset_arc',
      kind: 'arc',
      startAngle: Math.PI / 6,
      endAngle: Math.PI,
      relations: ['fixed'],
    })

    const offset = offsetSketchCircle(arc, 0.5)

    expect(offset).not.toBeNull()
    expect(offset?.center).toEqual([2, 3])
    expect(offset?.radius).toBe(2.5)
    expect(offset?.startAngle).toBeCloseTo(Math.PI / 6, 6)
    expect(offset?.endAngle).toBeCloseTo(Math.PI, 6)
    expect(offset?.relations).toEqual([])
  })

  test('rejects offset circles that would collapse to zero radius', () => {
    const circle = makeSketchCircle([0, 0], 0.2, { id: 'sketch_circle_offset_small' })

    expect(offsetSketchCircle(circle, -0.2)).toBeNull()
  })
})
