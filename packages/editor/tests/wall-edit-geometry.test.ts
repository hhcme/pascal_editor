import { beforeAll, describe, expect, mock, test } from 'bun:test'

type WallPlanPoint = [number, number]

type TestWallNode = {
  id: `wall_${string}`
  type: 'wall'
  name?: string
  parentId: string | null
  children: string[]
  start: WallPlanPoint
  end: WallPlanPoint
  thickness?: number
  height?: number
  curveOffset?: number
  frontSide: 'interior' | 'exterior' | 'unknown'
  backSide: 'interior' | 'exterior' | 'unknown'
  visible?: boolean
}

type GeometryModule = typeof import('../src/components/tools/wall/wall-edit-geometry')

let geometry: GeometryModule
let wallIdCounter = 0
const wallDraftingPath = new URL('../src/components/tools/wall/wall-drafting.ts', import.meta.url)
  .pathname

function parseWall(input: Partial<TestWallNode> & { start: WallPlanPoint; end: WallPlanPoint }) {
  wallIdCounter += 1
  return {
    object: 'node',
    id: input.id ?? (`wall_test_${wallIdCounter}` as const),
    type: 'wall',
    parentId: input.parentId ?? null,
    visible: input.visible ?? true,
    children: input.children ?? [],
    frontSide: input.frontSide ?? 'unknown',
    backSide: input.backSide ?? 'unknown',
    ...input,
  }
}

mock.module('@pascal-app/core', () => ({
  WallNode: { parse: parseWall },
  getEffectiveWallSurfaceMaterial: () => ({}),
  getScaledDimensions: () => [1, 1, 1],
  getWallSurfaceMaterialSignature: (value: unknown) => JSON.stringify(value ?? {}),
  useScene: {
    getState: () => ({
      readOnly: false,
      nodes: {},
      rootNodeIds: [],
      collections: {},
      markDirty: () => {},
    }),
    setState: () => {},
  },
}))

mock.module('@pascal-app/viewer', () => ({
  useViewer: {
    getState: () => ({ selection: { levelId: null } }),
  },
}))

const gridStep = 0.5

mock.module(wallDraftingPath, () => ({
  snapScalarToGrid: (value: number, step = gridStep) => Math.round(value / step) * step,
  WALL_GRID_STEP: gridStep,
  WALL_JOIN_SNAP_RADIUS: 0.35,
  WALL_MIN_LENGTH: 0.01,
}))

function makeWall(start: WallPlanPoint, end: WallPlanPoint, name = 'Wall'): TestWallNode {
  return parseWall({ name, start, end }) as TestWallNode
}

function expectPoint(point: WallPlanPoint, expected: WallPlanPoint) {
  expect(point[0]).toBeCloseTo(expected[0], 6)
  expect(point[1]).toBeCloseTo(expected[1], 6)
}

beforeAll(async () => {
  geometry = await import('../src/components/tools/wall/wall-edit-geometry')
})

describe('wall edit geometry', () => {
  test('chamfers two compatible straight walls sharing a corner', () => {
    const primary = makeWall([0, 0], [4, 0], 'Primary')
    const secondary = makeWall([0, 0], [0, 4], 'Secondary')

    const result = geometry.buildChamferWallsPlan({
      primary,
      secondary,
      nodes: {},
      distance: 1,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    const primaryUpdate = result.plan.updated?.find((update) => update.id === primary.id)
    const secondaryUpdate = result.plan.updated?.find((update) => update.id === secondary.id)
    const chamferWall = result.plan.created?.[0]?.node

    expect(primaryUpdate).toBeDefined()
    expect(secondaryUpdate).toBeDefined()
    expect(chamferWall).toBeDefined()
    expectPoint((primaryUpdate?.data as Partial<TestWallNode>).start!, [1, 0])
    expectPoint((secondaryUpdate?.data as Partial<TestWallNode>).start!, [0, 1])
    expectPoint(chamferWall!.start, [1, 0])
    expectPoint(chamferWall!.end, [0, 1])
  })

  test('rejects a chamfer distance that is too large', () => {
    const primary = makeWall([0, 0], [1, 0])
    const secondary = makeWall([0, 0], [0, 1])

    const result = geometry.buildChamferWallsPlan({
      primary,
      secondary,
      nodes: {},
      distance: 2,
    })

    expect(result.ok).toBe(false)
  })

  test('mirrors wall copies while preserving length', () => {
    const wall = makeWall([1, 0], [2, 0])
    const result = geometry.buildMirrorWallsPlan({
      walls: [wall],
      axisStart: [0, -1],
      axisEnd: [0, 1],
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    const mirrored = result.plan.created?.[0]?.node
    expect(mirrored).toBeDefined()
    expectPoint(mirrored!.start, [-1, 0])
    expectPoint(mirrored!.end, [-2, 0])
    expect(
      Math.hypot(mirrored!.end[0] - mirrored!.start[0], mirrored!.end[1] - mirrored!.start[1]),
    ).toBeCloseTo(1)
  })

  test('creates linear wall pattern instances by spacing and count', () => {
    const wall = makeWall([0, 0], [1, 0])
    const result = geometry.buildLinearPatternWallsPlan({
      walls: [wall],
      direction: [0, 1],
      spacing: 2,
      count: 3,
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    expect(result.plan.created).toHaveLength(2)
    expectPoint(result.plan.created![0]!.node.start, [0, 2])
    expectPoint(result.plan.created![1]!.node.start, [0, 4])
  })

  test('sets wall length as a driving dimension', () => {
    const wall = makeWall([1, 1], [4, 1])
    const result = geometry.buildSetWallLengthPlan({
      wall,
      length: 5,
      nodes: {},
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    const update = result.plan.updated?.find((entry) => entry.id === wall.id)
    expect(update).toBeDefined()
    expectPoint((update?.data as Partial<TestWallNode>).start!, [1, 1])
    expectPoint((update?.data as Partial<TestWallNode>).end!, [6, 1])
  })

  test('applies horizontal and vertical wall relations while preserving length', () => {
    const wall = makeWall([1, 1], [4, 5])
    const horizontal = geometry.buildOrientWallPlan({
      wall,
      orientation: 'horizontal',
      nodes: {},
    })
    const vertical = geometry.buildOrientWallPlan({
      wall,
      orientation: 'vertical',
      nodes: {},
    })

    if (!horizontal.ok) {
      throw new Error(horizontal.reason)
    }
    if (!vertical.ok) {
      throw new Error(vertical.reason)
    }

    const horizontalEnd = (horizontal.plan.updated?.[0]?.data as Partial<TestWallNode>).end!
    const verticalEnd = (vertical.plan.updated?.[0]?.data as Partial<TestWallNode>).end!
    expectPoint(horizontalEnd, [6, 1])
    expectPoint(verticalEnd, [1, 6])
  })

  test('equalizes selected wall lengths from the first wall', () => {
    const source = makeWall([0, 0], [3, 0])
    const target = makeWall([1, 1], [1, 2])
    const result = geometry.buildEqualLengthWallsPlan({
      source,
      targets: [target],
      nodes: {},
    })

    if (!result.ok) {
      throw new Error(result.reason)
    }

    const update = result.plan.updated?.find((entry) => entry.id === target.id)
    expect(update).toBeDefined()
    expectPoint((update?.data as Partial<TestWallNode>).end!, [1, 4])
  })

  test('detects simple closed wall loops and rejects open or self-intersecting loops', () => {
    const rectangle = [
      makeWall([0, 0], [4, 0]),
      makeWall([4, 0], [4, 3]),
      makeWall([4, 3], [0, 3]),
      makeWall([0, 3], [0, 0]),
    ]
    const open = rectangle.slice(0, 3)
    const bowtie = [
      makeWall([0, 0], [2, 2]),
      makeWall([2, 2], [0, 2]),
      makeWall([0, 2], [2, 0]),
      makeWall([2, 0], [0, 0]),
    ]

    const loops = geometry.detectClosedWallLoops(rectangle)
    expect(loops).toHaveLength(1)
    expect(loops[0]!.points).toHaveLength(4)
    expect(geometry.detectClosedWallLoops(open)).toHaveLength(0)
    expect(geometry.detectClosedWallLoops(bowtie)).toHaveLength(0)
  })
})
