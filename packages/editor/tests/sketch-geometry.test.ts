import { describe, expect, test } from 'bun:test'
import { getSketchCircleArcSweep, getSketchCirclePointAt } from '../../core/src/systems/sketch/sketch-circle-curve'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import {
  buildSketchLineFilletArc,
  buildSetSketchLineTangentToCirclePlan,
  buildTrimExtendSketchArcToCirclePlan,
  buildTrimExtendSketchArcToLinePlan,
  buildTrimExtendSketchLineToCirclePlan,
  buildOrientSketchLinePlan,
  buildSetSketchLineAnglePlan,
  buildSetSketchLineLengthPlan,
  buildSketchRectangleSegments,
  detectClosedSketchProfiles,
  getSketchLineLength2D,
  getSketchLinePathLength2D,
  getSketchProfileUnsupportedReason,
  isSketchLineLongEnough,
} from '../src/components/tools/sketch/sketch-geometry'

type TestSketchLineNode = {
  id: `sketch_line_${string}`
  type: 'sketch-line'
  start: [number, number]
  end: [number, number]
  curveOffset?: number
  construction: boolean
  relations: Array<'horizontal' | 'vertical' | 'fixed'>
  dimensions: {
    length?: number
    lengthMode?: 'driven' | 'reference'
    angle?: number
    angleMode?: 'driven' | 'reference'
  }
}

function makeSketchLine(
  start: [number, number],
  end: [number, number],
  extra: Partial<TestSketchLineNode> = {},
) {
  return {
    object: 'node',
    id: 'sketch_line_test',
    type: 'sketch-line',
    parentId: null,
    visible: true,
    metadata: {},
    start,
    end,
    construction: false,
    relations: [],
    dimensions: {},
    ...extra,
  } as TestSketchLineNode
}

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

function expectPoint(point: [number, number], expected: [number, number]) {
  expect(point[0]).toBeCloseTo(expected[0], 6)
  expect(point[1]).toBeCloseTo(expected[1], 6)
}

describe('sketch geometry', () => {
  test('builds a rectangle from two corners with horizontal and vertical relations', () => {
    const segments = buildSketchRectangleSegments([4, 3], [1, 1])

    expect(segments).toHaveLength(4)
    expectPoint(segments[0]!.start, [1, 1])
    expectPoint(segments[0]!.end, [4, 1])
    expect(segments[0]!.relations).toContain('horizontal')
    expect(segments[1]!.relations).toContain('vertical')
  })

  test('detects closed sketch profiles and ignores construction geometry', () => {
    const rectangle = [
      makeSketchLine([0, 0], [4, 0], { id: 'sketch_line_a' }),
      makeSketchLine([4, 0], [4, 3], { id: 'sketch_line_b' }),
      makeSketchLine([4, 3], [0, 3], { id: 'sketch_line_c' }),
      makeSketchLine([0, 3], [0, 0], { id: 'sketch_line_d' }),
      makeSketchLine([0, 0], [4, 3], {
        id: 'sketch_line_construction',
        construction: true,
      }),
    ]
    const open = rectangle.slice(0, 3)
    const bowtie = [
      makeSketchLine([0, 0], [2, 2], { id: 'sketch_line_e' }),
      makeSketchLine([2, 2], [0, 2], { id: 'sketch_line_f' }),
      makeSketchLine([0, 2], [2, 0], { id: 'sketch_line_g' }),
      makeSketchLine([2, 0], [0, 0], { id: 'sketch_line_h' }),
    ]

    const profiles = detectClosedSketchProfiles(rectangle as any)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]!.points).toHaveLength(4)
    expect(profiles[0]!.lineIds).not.toContain('sketch_line_construction')
    expect(detectClosedSketchProfiles(open as any)).toHaveLength(0)
    expect(detectClosedSketchProfiles(bowtie as any)).toHaveLength(0)
  })

  test('sets a line length as a driven dimension', () => {
    const line = makeSketchLine([1, 1], [4, 1])
    const result = buildSetSketchLineLengthPlan({ line: line as any, length: 5 })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.updates).toHaveLength(1)
    expectPoint(result.updates[0]!.data.end!, [6, 1])
    expect(result.updates[0]!.data.dimensions?.length).toBe(5)
    expect(result.updates[0]!.data.dimensions?.lengthMode).toBe('driven')
  })

  test('can persist a reference length dimension when requested explicitly', () => {
    const line = makeSketchLine([0, 0], [3, 0], {
      dimensions: { length: 3, lengthMode: 'reference' },
    })
    const result = buildSetSketchLineLengthPlan({
      line: line as any,
      length: 4,
      dimensionMode: 'reference',
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.updates[0]!.data.dimensions?.length).toBe(4)
    expect(result.updates[0]!.data.dimensions?.lengthMode).toBe('reference')
  })

  test('preserves horizontal and vertical relations when setting length', () => {
    const horizontal = makeSketchLine([2, 2], [0, 2], { relations: ['horizontal'] })
    const vertical = makeSketchLine([2, 2], [2, 0], { relations: ['vertical'] })

    const horizontalResult = buildSetSketchLineLengthPlan({
      line: horizontal as any,
      length: 3,
    })
    const verticalResult = buildSetSketchLineLengthPlan({
      line: vertical as any,
      length: 4,
    })

    if (!horizontalResult.ok) {
      throw new Error(horizontalResult.reason)
    }
    if (!verticalResult.ok) {
      throw new Error(verticalResult.reason)
    }

    expectPoint(horizontalResult.updates[0]!.data.end!, [-1, 2])
    expectPoint(verticalResult.updates[0]!.data.end!, [2, -2])
  })

  test('applies horizontal and vertical relations while preserving length', () => {
    const line = makeSketchLine([0, 0], [3, 4])
    const horizontal = buildOrientSketchLinePlan({
      line: line as any,
      orientation: 'horizontal',
    })
    const vertical = buildOrientSketchLinePlan({
      line: line as any,
      orientation: 'vertical',
    })

    if (!horizontal.ok) {
      throw new Error(horizontal.reason)
    }
    if (!vertical.ok) {
      throw new Error(vertical.reason)
    }

    expectPoint(horizontal.updates[0]!.data.end!, [5, 0])
    expect(horizontal.updates[0]!.data.relations).toContain('horizontal')
    expect(vertical.updates[0]!.data.end!, [0, 5])
    expect(vertical.updates[0]!.data.relations).toContain('vertical')
  })

  test('sets a line angle as a driven dimension and keeps the line length', () => {
    const line = makeSketchLine([0, 0], [4, 0])
    const result = buildSetSketchLineAnglePlan({
      line: line as any,
      angle: Math.PI / 2,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expectPoint(result.updates[0]!.data.end!, [0, 4])
    expect(result.updates[0]!.data.dimensions?.angle).toBeCloseTo(Math.PI / 2, 6)
    expect(result.updates[0]!.data.dimensions?.angleMode).toBe('driven')
    expect(result.updates[0]!.data.relations).toContain('vertical')
  })

  test('can persist a reference angle dimension when requested explicitly', () => {
    const line = makeSketchLine([0, 0], [4, 0], {
      dimensions: { angle: 0, angleMode: 'reference' },
    })
    const result = buildSetSketchLineAnglePlan({
      line: line as any,
      angle: Math.PI / 4,
      dimensionMode: 'reference',
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.updates[0]!.data.dimensions?.angle).toBeCloseTo(Math.PI / 4, 6)
    expect(result.updates[0]!.data.dimensions?.angleMode).toBe('reference')
  })

  test('builds a true fillet arc between two sketch lines', () => {
    const firstLine = makeSketchLine([0, 0], [4, 0], { id: 'sketch_line_corner_a' })
    const secondLine = makeSketchLine([0, 0], [0, 4], { id: 'sketch_line_corner_b' })
    const result = buildSketchLineFilletArc({
      firstLine: firstLine as any,
      secondLine: secondLine as any,
      trimDistance: 1,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.firstEndpoint).toBe('start')
    expect(result.secondEndpoint).toBe('start')
    expectPoint(result.firstTrimPoint, [1, 0])
    expectPoint(result.secondTrimPoint, [0, 1])
    expectPoint(result.center, [1, 1])
    expect(result.radius).toBeCloseTo(1, 6)

    const arc = SketchCircleNodeSchema.parse({
      name: 'Fillet Arc',
      kind: 'arc',
      center: result.center,
      radius: result.radius,
      startAngle: result.startAngle,
      endAngle: result.endAngle,
    })

    expect(getSketchCircleArcSweep(arc)).toBeCloseTo(Math.PI / 2, 6)
    const arcStart = getSketchCirclePointAt(arc, 0)
    const arcEnd = getSketchCirclePointAt(arc, 1)
    const matchesForward =
      Math.abs(arcStart.x - result.firstTrimPoint[0]) < 1e-6 &&
      Math.abs(arcStart.y - result.firstTrimPoint[1]) < 1e-6 &&
      Math.abs(arcEnd.x - result.secondTrimPoint[0]) < 1e-6 &&
      Math.abs(arcEnd.y - result.secondTrimPoint[1]) < 1e-6
    const matchesReverse =
      Math.abs(arcStart.x - result.secondTrimPoint[0]) < 1e-6 &&
      Math.abs(arcStart.y - result.secondTrimPoint[1]) < 1e-6 &&
      Math.abs(arcEnd.x - result.firstTrimPoint[0]) < 1e-6 &&
      Math.abs(arcEnd.y - result.firstTrimPoint[1]) < 1e-6

    expect(matchesForward || matchesReverse).toBe(true)
  })

  test('trims or extends a sketch line to the nearest circle intersection', () => {
    const line = makeSketchLine([0, 0], [10, 0], { id: 'sketch_line_trim_circle' })
    const circle = makeSketchCircle([8, 0], 1, { id: 'sketch_circle_trim_circle' })
    const result = buildTrimExtendSketchLineToCirclePlan({
      line: line as any,
      circle: circle as any,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.endpoint).toBe('end')
    expectPoint(result.point, [9, 0])
  })

  test('filters trim/extend intersections against arc bounds', () => {
    const line = makeSketchLine([0, 0], [10, 0], { id: 'sketch_line_trim_arc' })
    const arc = makeSketchCircle([5, 0], 1, {
      id: 'sketch_circle_trim_arc',
      kind: 'arc',
      startAngle: Math.PI / 2,
      endAngle: (Math.PI * 3) / 2,
    })
    const result = buildTrimExtendSketchLineToCirclePlan({
      line: line as any,
      circle: arc as any,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.endpoint).toBe('start')
    expectPoint(result.point, [4, 0])
  })

  test('sets a sketch line tangent to a circle by moving the nearest endpoint', () => {
    const line = makeSketchLine([0, 0], [4, 0], { id: 'sketch_line_tangent_circle' })
    const circle = makeSketchCircle([4, 2], 1, { id: 'sketch_circle_tangent_circle' })
    const result = buildSetSketchLineTangentToCirclePlan({
      line: line as any,
      circle: circle as any,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.endpoint).toBe('end')
    expect(Math.hypot(result.point[0] - circle.center[0], result.point[1] - circle.center[1])).toBeCloseTo(
      circle.radius,
      6,
    )
    const tangentVector = [result.point[0] - circle.center[0], result.point[1] - circle.center[1]]
    const lineVector = [line.start[0] - result.point[0], line.start[1] - result.point[1]]
    expect(tangentVector[0] * lineVector[0] + tangentVector[1] * lineVector[1]).toBeCloseTo(0, 6)
    expect(result.point[1]).toBeLessThan(circle.center[1])
  })

  test('filters tangent candidates against arc bounds', () => {
    const line = makeSketchLine([0, 0], [4, 0], { id: 'sketch_line_tangent_arc' })
    const arc = makeSketchCircle([4, 2], 1, {
      id: 'sketch_circle_tangent_arc',
      kind: 'arc',
      startAngle: Math.PI / 2,
      endAngle: Math.PI,
    })
    const result = buildSetSketchLineTangentToCirclePlan({
      line: line as any,
      circle: arc as any,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.endpoint).toBe('end')
    expect(result.point[1]).toBeGreaterThan(arc.center[1])
    expect(result.point[0]).toBeLessThan(arc.center[0])
  })

  test('rejects curved sketch lines for tangent edits', () => {
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_tangent_curved',
      curveOffset: 0.5,
    })
    const circle = makeSketchCircle([4, 2], 1, { id: 'sketch_circle_tangent_curved' })

    expect(buildSetSketchLineTangentToCirclePlan({ line: line as any, circle: circle as any }).ok).toBe(
      false,
    )
  })

  test('trims or extends a sketch arc to a sketch line', () => {
    const arc = makeSketchCircle([0, 0], 5, {
      id: 'sketch_circle_arc_trim_line',
      kind: 'arc',
      startAngle: 0,
      endAngle: Math.PI / 2,
    })
    const line = makeSketchLine([-10, 4], [10, 4], { id: 'sketch_line_arc_trim_line' })
    const result = buildTrimExtendSketchArcToLinePlan({
      circle: arc as any,
      line: line as any,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.startAngle).toBeCloseTo(0, 6)
    expect(result.endAngle).toBeCloseTo(Math.atan2(4, 3), 6)
  })

  test('filters arc trim/extend intersections against target arc bounds', () => {
    const arc = makeSketchCircle([0, 0], 5, {
      id: 'sketch_circle_arc_trim_arc',
      kind: 'arc',
      startAngle: 0,
      endAngle: Math.PI / 2,
    })
    const targetArc = makeSketchCircle([4, 0], 3, {
      id: 'sketch_circle_target_arc',
      kind: 'arc',
      startAngle: Math.PI,
      endAngle: (Math.PI * 3) / 2,
    })
    const result = buildTrimExtendSketchArcToCirclePlan({
      circle: arc as any,
      targetCircle: targetArc as any,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.endAngle).toBeCloseTo(Math.PI / 2, 6)
    expect(result.startAngle).toBeGreaterThan(5)
  })

  test('rejects full circles for arc trim/extend edits', () => {
    const circle = makeSketchCircle([0, 0], 5, { id: 'sketch_circle_full_trim' })
    const line = makeSketchLine([-10, 4], [10, 4], { id: 'sketch_line_full_trim' })

    expect(buildTrimExtendSketchArcToLinePlan({ circle: circle as any, line: line as any }).ok).toBe(
      false,
    )
  })

  test('rejects fixed or zero-length sketch lines for driven edits', () => {
    const fixed = makeSketchLine([0, 0], [1, 0], { relations: ['fixed'] })
    const tiny = makeSketchLine([0, 0], [0, 0])

    expect(buildSetSketchLineLengthPlan({ line: fixed as any, length: 2 }).ok).toBe(false)
    expect(buildSetSketchLineLengthPlan({ line: tiny as any, length: 2 }).ok).toBe(false)
    expect(isSketchLineLongEnough([0, 0], [0, 0])).toBe(false)
    expect(getSketchLineLength2D(makeSketchLine([0, 0], [3, 4]) as any)).toBe(5)
  })

  test('measures curved sketch lines without changing chord length', () => {
    const curved = makeSketchLine([0, 0], [4, 0], { curveOffset: 1 })

    expect(getSketchLineLength2D(curved as any)).toBe(4)
    expect(getSketchLinePathLength2D(curved as any)).toBeGreaterThan(4)
  })

  test('flags nested sketch profiles as unsupported for filled profile conversion', () => {
    const outer = [
      makeSketchLine([0, 0], [6, 0], { id: 'sketch_line_outer_a' }),
      makeSketchLine([6, 0], [6, 6], { id: 'sketch_line_outer_b' }),
      makeSketchLine([6, 6], [0, 6], { id: 'sketch_line_outer_c' }),
      makeSketchLine([0, 6], [0, 0], { id: 'sketch_line_outer_d' }),
    ]
    const inner = [
      makeSketchLine([2, 2], [4, 2], { id: 'sketch_line_inner_a' }),
      makeSketchLine([4, 2], [4, 4], { id: 'sketch_line_inner_b' }),
      makeSketchLine([4, 4], [2, 4], { id: 'sketch_line_inner_c' }),
      makeSketchLine([2, 4], [2, 2], { id: 'sketch_line_inner_d' }),
    ]

    const profiles = detectClosedSketchProfiles([...outer, ...inner] as any)
    const outerProfile = profiles.find((profile) => profile.lineIds.includes('sketch_line_outer_a'))
    const innerProfile = profiles.find((profile) => profile.lineIds.includes('sketch_line_inner_a'))

    expect(outerProfile).toBeDefined()
    expect(innerProfile).toBeDefined()
    expect(getSketchProfileUnsupportedReason(outerProfile!, profiles)).toContain('带洞')
    expect(getSketchProfileUnsupportedReason(innerProfile!, profiles)).toBeNull()
  })
})
