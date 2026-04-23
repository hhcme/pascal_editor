import { describe, expect, mock, test } from 'bun:test'

const wallDraftingPath = new URL('../src/components/tools/wall/wall-drafting.ts', import.meta.url)
  .pathname

mock.module(wallDraftingPath, () => {
  const gridStep = 0.5
  const snapScalarToGrid = (value: number, step = gridStep) => Math.round(value / step) * step

  return {
    WALL_GRID_STEP: gridStep,
    WALL_JOIN_SNAP_RADIUS: 0.35,
    WALL_MIN_LENGTH: 0.01,
    getWallAngleSnapStep: () => Math.PI / 4,
    getWallGridStep: () => gridStep,
    snapScalarToGrid,
    snapPointTo45Degrees: (
      start: [number, number],
      cursor: [number, number],
      step = gridStep,
      angleStep = Math.PI / 4,
    ) => {
      const dx = cursor[0] - start[0]
      const dz = cursor[1] - start[1]
      const angle = Math.atan2(dz, dx)
      const snappedAngle = Math.round(angle / angleStep) * angleStep
      const distance = Math.hypot(dx, dz)
      return [
        snapScalarToGrid(start[0] + Math.cos(snappedAngle) * distance, step),
        snapScalarToGrid(start[1] + Math.sin(snappedAngle) * distance, step),
      ]
    },
    snapPointToGrid: (point: [number, number], step = gridStep) =>
      [snapScalarToGrid(point[0], step), snapScalarToGrid(point[1], step)] as [number, number],
  }
})

const { resolveWallSketchSnap } = await import('../src/components/tools/wall/wall-sketch')

function expectPoint(point: [number, number], expected: [number, number]) {
  expect(point[0]).toBeCloseTo(expected[0], 6)
  expect(point[1]).toBeCloseTo(expected[1], 6)
}

describe('wall sketch snapping', () => {
  test('snaps to supplemental sketch endpoints', () => {
    const result = resolveWallSketchSnap({
      point: [3.18, 2.13],
      walls: [],
      enableInference: false,
      snapPoints: [{ kind: 'sketch-endpoint', point: [3.25, 2] }],
    })

    expect(result.target?.kind).toBe('sketch-endpoint')
    expectPoint(result.point, [3.25, 2])
  })

  test('preserves supplemental sketch endpoint source metadata', () => {
    const result = resolveWallSketchSnap({
      point: [1.05, 0],
      walls: [],
      enableInference: false,
      snapPoints: [
        {
          kind: 'sketch-endpoint',
          point: [1, 0],
          sourceId: 'sketch_line_source',
          sourceEndpoint: 'end',
        },
      ],
    })

    expect(result.target?.sourceId).toBe('sketch_line_source')
    expect(result.target?.sourceEndpoint).toBe('end')
  })

  test('uses supplemental sketch endpoints for alignment inference', () => {
    const result = resolveWallSketchSnap({
      point: [2.1, 4.8],
      walls: [],
      anchor: [0, 0],
      snapPoints: [{ kind: 'sketch-endpoint', point: [2.25, 1] }],
    })

    expect(result.target?.kind).toBe('alignment')
    expectPoint(result.point, [2.25, 5])
    expect(result.guideLines.some((guide) => guide.kind === 'alignment')).toBe(true)
  })
})
