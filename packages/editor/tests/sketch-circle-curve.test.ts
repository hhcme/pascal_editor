import { describe, expect, test } from 'bun:test'
import {
  getSketchCircleArcSweep,
  getSketchCircleBounds,
  getSketchCirclePathLength,
  getSketchCirclePointAt,
  isSketchCircleArc,
  sampleSketchCircleCenterline,
} from '../../core/src/systems/sketch/sketch-circle-curve'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'

function expectPoint(point: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(point.x).toBeCloseTo(expected.x, 6)
  expect(point.y).toBeCloseTo(expected.y, 6)
}

describe('sketch circle geometry', () => {
  test('parses full circles with defaults', () => {
    const circle = SketchCircleNodeSchema.parse({
      name: 'Circle',
      center: [2, 3],
      radius: 4,
    })

    expect(circle.type).toBe('sketch-circle')
    expect(circle.kind).toBe('circle')
    expect(circle.construction).toBe(false)
    expect(circle.relations).toEqual([])
    expect(circle.constraints).toEqual([])
    expect(circle.dimensions).toEqual({})
    expect(isSketchCircleArc(circle)).toBe(false)
  })

  test('samples a full circle as a closed centerline', () => {
    const circle = SketchCircleNodeSchema.parse({
      name: 'Circle',
      center: [0, 0],
      radius: 2,
    })
    const points = sampleSketchCircleCenterline(circle, 16)

    expect(points.length).toBeGreaterThan(8)
    expectPoint(points[0]!, { x: 2, y: 0 })
    expectPoint(points[points.length - 1]!, points[0]!)
    expect(getSketchCirclePathLength(circle)).toBeCloseTo(Math.PI * 4, 6)
    expect(getSketchCircleBounds(circle)).toEqual({
      minX: -2,
      minY: -2,
      maxX: 2,
      maxY: 2,
    })
  })

  test('measures and samples bounded arcs', () => {
    const arc = SketchCircleNodeSchema.parse({
      name: 'Arc',
      kind: 'arc',
      center: [1, 1],
      radius: 3,
      startAngle: 0,
      endAngle: Math.PI / 2,
      dimensions: { radius: 3 },
    })

    expect(isSketchCircleArc(arc)).toBe(true)
    expect(getSketchCircleArcSweep(arc)).toBeCloseTo(Math.PI / 2, 6)
    expect(getSketchCirclePathLength(arc)).toBeCloseTo((Math.PI / 2) * 3, 6)
    expectPoint(getSketchCirclePointAt(arc, 0), { x: 4, y: 1 })
    expectPoint(getSketchCirclePointAt(arc, 1), { x: 1, y: 4 })
    expect(getSketchCircleBounds(arc)).toEqual({
      minX: 1,
      minY: 1,
      maxX: 4,
      maxY: 4,
    })
  })

  test('handles arcs that cross the zero angle', () => {
    const arc = SketchCircleNodeSchema.parse({
      name: 'Wrapped Arc',
      kind: 'arc',
      center: [0, 0],
      radius: 1,
      startAngle: (Math.PI * 3) / 2,
      endAngle: Math.PI / 2,
    })

    expect(getSketchCircleArcSweep(arc)).toBeCloseTo(Math.PI, 6)
    expectPoint(getSketchCirclePointAt(arc, 0), { x: 0, y: -1 })
    expectPoint(getSketchCirclePointAt(arc, 0.5), { x: 1, y: 0 })
    expectPoint(getSketchCirclePointAt(arc, 1), { x: 0, y: 1 })
    expect(getSketchCircleBounds(arc)).toEqual({
      minX: 0,
      minY: -1,
      maxX: 1,
      maxY: 1,
    })
  })
})
