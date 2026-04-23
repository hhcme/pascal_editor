import { describe, expect, test } from 'bun:test'
import {
  buildOrientSketchLinePlan,
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
  dimensions: { length?: number }
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
