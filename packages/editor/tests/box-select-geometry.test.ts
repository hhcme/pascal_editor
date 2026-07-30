import { describe, expect, mock, test } from 'bun:test'
import { SketchCircleNode } from '../../core/src/schema/nodes/sketch-circle'
import { SketchLineNode } from '../../core/src/schema/nodes/sketch-line'
import {
  isSketchCircleArc,
  sampleSketchCircleCenterline,
} from '../../core/src/systems/sketch/sketch-circle-curve'
import { sampleSketchLineCenterline } from '../../core/src/systems/sketch/sketch-line-curve'

mock.module('@pascal-app/core', () => ({
  isSketchCircleArc,
  sampleSketchCircleCenterline,
  sampleSketchLineCenterline,
}))

import type { BoxSelectBounds } from '../src/components/tools/select/box-select-geometry'

const { sketchNodeIntersectsBounds } = await import(
  '../src/components/tools/select/box-select-geometry'
)

const bounds: BoxSelectBounds = {
  minX: -0.5,
  maxX: 0.5,
  minZ: -0.5,
  maxZ: 0.5,
}

describe('3D canvas sketch box selection', () => {
  test('selects a straight sketch line that crosses the box with both endpoints outside', () => {
    const line = SketchLineNode.parse({
      name: 'Crossing line',
      start: [-2, 0],
      end: [2, 0],
    })

    expect(sketchNodeIntersectsBounds(line, bounds)).toBe(true)
  })

  test('selects a curved sketch line by its arc instead of only its chord', () => {
    const line = SketchLineNode.parse({
      name: 'Curved line',
      start: [-2, 2],
      end: [2, 2],
      curveOffset: 2,
    })

    expect(sketchNodeIntersectsBounds(line, bounds)).toBe(true)
  })

  test('selects a full circle that surrounds the box', () => {
    const circle = SketchCircleNode.parse({
      name: 'Surrounding circle',
      center: [0, 0],
      radius: 2,
    })

    expect(sketchNodeIntersectsBounds(circle, bounds)).toBe(true)
  })

  test('does not close an arc with an imaginary chord for hit testing', () => {
    const arc = SketchCircleNode.parse({
      name: 'Upper arc',
      kind: 'arc',
      center: [0, 0],
      radius: 2,
      startAngle: 0,
      endAngle: Math.PI,
    })

    expect(sketchNodeIntersectsBounds(arc, bounds)).toBe(false)
  })

  test('excludes hidden sketch geometry', () => {
    const line = SketchLineNode.parse({
      name: 'Hidden line',
      start: [-2, 0],
      end: [2, 0],
      visible: false,
    })

    expect(sketchNodeIntersectsBounds(line, bounds)).toBe(false)
  })
})
