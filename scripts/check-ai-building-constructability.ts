import { mock } from 'bun:test'

type Point2D = [number, number]

function pointInPolygon(x: number, z: number, polygon: Point2D[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i]?.[0] ?? 0
    const zi = polygon[i]?.[1] ?? 0
    const xj = polygon[j]?.[0] ?? 0
    const zj = polygon[j]?.[1] ?? 0
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function parseNode(input: Record<string, unknown>) {
  return {
    id: `${typeof input.name === 'string' ? input.name : 'node'}-${Math.random()
      .toString(36)
      .slice(2)}`,
    ...input,
  }
}

mock.module('@pascal-app/core', () => ({
  BuildingNode: { parse: parseNode },
  CeilingNode: { parse: parseNode },
  DoorNode: { parse: parseNode },
  FenceNode: { parse: parseNode },
  ItemNode: { parse: parseNode },
  LevelNode: { parse: parseNode },
  RoofNode: { parse: parseNode },
  RoofSegmentNode: { parse: parseNode },
  SlabNode: { parse: parseNode },
  StairNode: { parse: parseNode },
  StairSegmentNode: { parse: parseNode },
  WallNode: { parse: parseNode },
  WindowNode: { parse: parseNode },
  ZoneNode: { parse: parseNode },
  pointInPolygon,
  resolveLevelId: () => null,
  useScene: {
    getState: () => ({
      clearScene: () => {},
      createNodes: () => {},
      deleteNodes: () => {},
      nodes: {},
      rootNodeIds: [],
    }),
  },
}))

mock.module('@pascal-app/editor', () => ({
  createAiAnalysisIssue: (input: Record<string, unknown>) => input,
  createAiAnalysisSnapshot: (input: Record<string, unknown>) => input,
  getAiAnalysisIssueDefinition: (code: string) => ({
    code,
    scope: 'room',
    severity:
      (code.includes('MISSING') && code !== 'BASIC_FURNITURE_MISSING') ||
      code.includes('REQUIRED') ||
      code.includes('COLLISION') ||
      code.includes('BROKEN') ||
      code.includes('INCOMPLETE')
        ? 'error'
        : 'warning',
    summary: code,
  }),
  getGridMeasurementSummaryForSelection: () => null,
  getSavedGridMeasurementGroups: () => [],
  getSiteSetbackRules: () => ({
    front: null,
    back: null,
    left: null,
    right: null,
  }),
  useEditor: {
    getState: () => ({
      setMode: () => {},
      setPhase: () => {},
      setStructureLayer: () => {},
      setViewMode: () => {},
    }),
  },
}))

mock.module('@pascal-app/viewer', () => ({
  useViewer: {
    getState: () => ({
      setSelection: () => {},
    }),
  },
}))

const { createPlan, validateAiBuildingPlanConstructability } = await import(
  '../apps/editor/lib/ai-building'
)
const { getAiBuildingPlanSummary, validateAiBuildingPlanHabitability } = await import(
  '../apps/editor/lib/ai-building'
)
type AiBuildingFormState = import('../apps/editor/lib/ai-building').AiBuildingFormState

type AcceptanceCase = {
  expectAutoRepair?: boolean
  name: string
  form: AiBuildingFormState
}

const cases: AcceptanceCase[] = [
  {
    name: '5-floor residential apartment',
    form: {
      buildingType: 'residential',
      style: 'modern',
      variant: 'balanced',
      floors: 5,
      width: 18,
      depth: 22,
      prompt: '五层住宅，矩形轮廓，包含客厅、餐厅、厨房、卧室、卫生间，每层都需要可通行楼梯。',
      requestedSpaces: [
        { key: 'living_room', label: '客厅', count: 1 },
        { key: 'dining_room', label: '餐厅', count: 1 },
        { key: 'kitchen', label: '厨房', count: 1 },
        { key: 'bedroom', label: '卧室', count: 2 },
        { key: 'bathroom', label: '卫生间', count: 1 },
      ],
    },
  },
  {
    name: '3-floor villa',
    form: {
      buildingType: 'villa',
      style: 'newChinese',
      variant: 'daylight',
      floors: 3,
      width: 16,
      depth: 18,
      prompt: '三层别墅，楼梯必须连续可走，房间需要墙和门。',
      requestedSpaces: [
        { key: 'living_room', label: '客厅', count: 1 },
        { key: 'dining_room', label: '餐厅', count: 1 },
        { key: 'kitchen', label: '厨房', count: 1 },
        { key: 'bedroom', label: '卧室', count: 3 },
        { key: 'bathroom', label: '卫生间', count: 2 },
      ],
    },
  },
  {
    name: '4-floor office',
    form: {
      buildingType: 'office',
      style: 'minimal',
      variant: 'balanced',
      floors: 4,
      width: 20,
      depth: 20,
      prompt: '四层办公楼，入口、接待、办公区、会议室和卫生间都要通过楼梯核心连续到达。',
      requestedSpaces: [
        { key: 'office', label: '办公区', count: 2 },
        { key: 'meeting', label: '会议室', count: 1 },
        { key: 'bathroom', label: '卫生间', count: 1 },
      ],
    },
  },
  {
    expectAutoRepair: true,
    name: 'compact villa auto repair',
    form: {
      buildingType: 'villa',
      style: 'modern',
      variant: 'balanced',
      floors: 3,
      width: 8,
      depth: 10,
      prompt: '极小三层别墅，仍需自动修到楼梯、墙、门和动线可用。',
      requestedSpaces: [
        { key: 'living_room', label: '客厅', count: 1 },
        { key: 'dining_room', label: '餐厅', count: 1 },
        { key: 'kitchen', label: '厨房', count: 1 },
        { key: 'bedroom', label: '卧室', count: 4 },
        { key: 'bathroom', label: '卫生间', count: 3 },
      ],
    },
  },
]

const failures: string[] = []

for (const testCase of cases) {
  const plan = createPlan(testCase.form, 'zh-CN', null)
  const validation = validateAiBuildingPlanConstructability(plan)
  const habitability = validateAiBuildingPlanHabitability(plan, 'zh-CN')
  const summary = getAiBuildingPlanSummary(plan, 'zh-CN')

  if (!validation.passed) {
    failures.push(
      `${testCase.name}: ${validation.message ?? 'constructability validation failed'}`,
    )
  }

  if (!habitability.passed) {
    failures.push(`${testCase.name}: ${habitability.message ?? 'habitability validation failed'}`)
  }

  if (
    testCase.expectAutoRepair &&
    plan.footprint.width <= testCase.form.width &&
    plan.footprint.depth <= testCase.form.depth
  ) {
    failures.push(`${testCase.name}: expected automatic footprint repair but plan was not expanded`)
  }

  for (let levelIndex = 0; levelIndex < plan.floors.length; levelIndex += 1) {
    const floor = plan.floors[levelIndex]
    if (!floor) continue

    const stairRoomCount = floor.rooms.filter((room) => room.programKey === 'stairs').length
    if (stairRoomCount === 0) {
      failures.push(`${testCase.name}: ${floor.label} has no stair room`)
    }

    if (levelIndex < plan.floors.length - 1 && floor.stairs.length === 0) {
      failures.push(`${testCase.name}: ${floor.label} has no stair to next floor`)
    }
  }

  console.log(
    [
      `[pass-check] ${testCase.name}`,
      `${plan.floors.length} floors`,
      `${summary.scores.overall} score`,
      validation.passed ? 'constructable' : 'blocked',
      habitability.passed ? 'habitable-furnished' : 'under-furnished',
    ].join(' | '),
  )
}

if (failures.length > 0) {
  console.error('\nAI building constructability acceptance failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('\nAI building constructability acceptance passed.')
