import { mock } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

type Point2D = [number, number]

type QaCase = {
  name: string
  form: import('../apps/editor/lib/ai-building').AiBuildingFormState
}

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

const {
  createPlan,
  getAiBuildingPlanSummary,
  validateAiBuildingPlanConstructability,
  validateAiBuildingPlanHabitability,
} = await import('../apps/editor/lib/ai-building')

type AiBuildingPlan = ReturnType<typeof createPlan>
type AiBuildingFloorPlan = AiBuildingPlan['floors'][number]
type AiBuildingStairPlan = AiBuildingFloorPlan['stairs'][number]
type AiBuildingStairSegmentPlan = AiBuildingStairPlan['segments'][number]

const CASES: QaCase[] = [
  {
    name: 'current-5f-residential-400sqm',
    form: {
      buildingType: 'residential',
      style: 'modern',
      variant: 'balanced',
      floors: 5,
      width: 18,
      depth: 22,
      prompt: '5 层住宅，约 400m²，矩形轮廓，包含客厅、厨房、卧室 x2、卫生间。',
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
    name: 'current-4f-residential-400sqm',
    form: {
      buildingType: 'residential',
      style: 'modern',
      variant: 'balanced',
      floors: 4,
      width: 11.2,
      depth: 8.9,
      prompt: '4 层住宅，约 400m²，矩形轮廓，包含客厅、厨房、卧室 x2、卫生间。',
      requestedSpaces: [
        { key: 'living_room', label: '客厅', count: 1 },
        { key: 'kitchen', label: '厨房', count: 1 },
        { key: 'bedroom', label: '卧室', count: 2 },
        { key: 'bathroom', label: '卫生间', count: 1 },
      ],
    },
  },
  {
    name: 'villa-3f',
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
    name: 'office-4f',
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
]

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function polygonBounds(points: Point2D[]) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point[0]),
      maxX: Math.max(bounds.maxX, point[0]),
      minZ: Math.min(bounds.minZ, point[1]),
      maxZ: Math.max(bounds.maxZ, point[1]),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  )
}

function planBounds(plan: AiBuildingPlan) {
  const allPoints = plan.floors.flatMap((floor) => floor.slabPolygon)
  const bounds = polygonBounds(allPoints)
  return {
    minX: bounds.minX - 1,
    maxX: bounds.maxX + 1,
    minZ: bounds.minZ - 1,
    maxZ: bounds.maxZ + 1,
  }
}

function polygonCentroid(points: Point2D[]) {
  if (points.length === 0) return [0, 0] as Point2D
  const sum = points.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]] as Point2D,
    [0, 0] as Point2D,
  )
  return [sum[0] / points.length, sum[1] / points.length] as Point2D
}

function rotateXZ(x: number, z: number, angle: number): Point2D {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos + z * sin, -x * sin + z * cos]
}

function transformPoint(local: Point2D, position: Point2D, rotation: number): Point2D {
  const rotated = rotateXZ(local[0], local[1], rotation)
  return [position[0] + rotated[0], position[1] + rotated[1]]
}

function computeSegmentTransforms(segments: AiBuildingStairSegmentPlan[]) {
  const transforms: Array<{ position: Point2D; rotation: number }> = []
  let currentPosition: Point2D = [0, 0]
  let currentRotation = 0

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (!segment) continue

    if (index > 0) {
      const previous = segments[index - 1]
      if (!previous) continue

      let localAttach: Point2D = [0, previous.length]
      let rotationDelta = 0
      if (segment.attachmentSide === 'left') {
        localAttach = [previous.width / 2, previous.length / 2]
        rotationDelta = Math.PI / 2
      } else if (segment.attachmentSide === 'right') {
        localAttach = [-previous.width / 2, previous.length / 2]
        rotationDelta = -Math.PI / 2
      }

      currentPosition = transformPoint(localAttach, currentPosition, currentRotation)
      currentRotation += rotationDelta
    }

    transforms.push({ position: currentPosition, rotation: currentRotation })
  }

  return transforms
}

function getStairSegmentPolygons(stair: AiBuildingStairPlan) {
  const transforms = computeSegmentTransforms(stair.segments)

  return stair.segments.map((segment, index) => {
    const transform = transforms[index] ?? { position: [0, 0] as Point2D, rotation: 0 }
    const corners: Point2D[] = [
      [-segment.width / 2, 0],
      [segment.width / 2, 0],
      [segment.width / 2, segment.length],
      [-segment.width / 2, segment.length],
    ]

    return {
      segment,
      polygon: corners.map((corner) => {
        const segmentPoint = transformPoint(corner, transform.position, transform.rotation)
        return transformPoint(segmentPoint, [stair.position[0], stair.position[2]], stair.rotation)
      }),
    }
  })
}

function renderFloorSvg(floor: AiBuildingFloorPlan, plan: AiBuildingPlan) {
  const bounds = planBounds(plan)
  const width = 1400
  const height = 1000
  const worldWidth = bounds.maxX - bounds.minX
  const worldDepth = bounds.maxZ - bounds.minZ
  const scale = Math.min((width - 96) / worldWidth, (height - 112) / worldDepth)
  const offsetX = (width - worldWidth * scale) / 2
  const offsetY = (height - worldDepth * scale) / 2 + 24

  const sx = (x: number) => offsetX + (x - bounds.minX) * scale
  const sy = (z: number) => offsetY + (z - bounds.minZ) * scale
  const points = (polygon: Point2D[]) =>
    polygon.map((point) => `${sx(point[0]).toFixed(1)},${sy(point[1]).toFixed(1)}`).join(' ')

  const wallKeyToWall = new Map(floor.walls.map((wall) => [wall.key, wall]))
  const openingMarks = floor.openings
    .map((opening) => {
      const wall = wallKeyToWall.get(opening.wallKey)
      if (!wall) return ''
      const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
      if (length <= 0.001) return ''
      const ratio = opening.localX / length
      const x = wall.start[0] + (wall.end[0] - wall.start[0]) * ratio
      const z = wall.start[1] + (wall.end[1] - wall.start[1]) * ratio
      const color = opening.kind === 'door' ? '#22c55e' : '#38bdf8'
      return `<circle cx="${sx(x).toFixed(1)}" cy="${sy(z).toFixed(1)}" r="7" fill="${color}" stroke="#0f172a" stroke-width="1" />`
    })
    .join('\n')

  const rooms = floor.rooms
    .map((room) => {
      const center = polygonCentroid(room.polygon)
      return `
        <polygon points="${points(room.polygon)}" fill="${room.color}" fill-opacity="0.32" stroke="#cbd5e1" stroke-width="1" />
        <text x="${sx(center[0]).toFixed(1)}" y="${sy(center[1]).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="20" font-weight="700" fill="#0f172a">${escapeHtml(room.name)}</text>
      `
    })
    .join('\n')

  const walls = floor.walls
    .map((wall) => {
      const stroke = wall.role === 'outer' ? '#475569' : '#64748b'
      const strokeWidth = wall.role === 'outer' ? 10 : 7
      return `<line x1="${sx(wall.start[0]).toFixed(1)}" y1="${sy(wall.start[1]).toFixed(1)}" x2="${sx(wall.end[0]).toFixed(1)}" y2="${sy(wall.end[1]).toFixed(1)}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" />`
    })
    .join('\n')

  const stairs = floor.stairs
    .flatMap((stair) =>
      getStairSegmentPolygons(stair).map(({ segment, polygon }, index) => {
        const center = polygonCentroid(polygon)
        const fill = segment.segmentType === 'landing' ? '#fbbf24' : '#2563eb'
        return `
          <polygon points="${points(polygon)}" fill="${fill}" fill-opacity="0.62" stroke="#1e293b" stroke-width="2" />
          ${
            index === 0
              ? `<text x="${sx(center[0]).toFixed(1)}" y="${sy(center[1]).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="16" font-weight="700" fill="#172554">${escapeHtml(stair.layoutType)}</text>`
              : ''
          }
        `
      }),
    )
    .join('\n')

  const items = floor.items
    .filter((item) => item.roomKey)
    .map((item) => {
      const x = sx(item.position[0]).toFixed(1)
      const y = sy(item.position[2]).toFixed(1)
      return `<rect x="${Number(x) - 6}" y="${Number(y) - 6}" width="12" height="12" rx="2" fill="#111827" fill-opacity="0.45"><title>${escapeHtml(item.assetId)}</title></rect>`
    })
    .join('\n')

  const stairSummary = floor.stairs
    .map((stair) => `${stair.layoutType} / ${stair.stepCount} steps`)
    .join('；') || '无楼梯'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f8fafc" />
  <g opacity="0.45">
    ${Array.from({ length: 32 }, (_, index) => `<line x1="${index * 50}" y1="0" x2="${index * 50}" y2="${height}" stroke="#e2e8f0" />`).join('\n')}
    ${Array.from({ length: 24 }, (_, index) => `<line x1="0" y1="${index * 50}" x2="${width}" y2="${index * 50}" stroke="#e2e8f0" />`).join('\n')}
  </g>
  <text x="48" y="48" font-size="28" font-weight="800" fill="#0f172a">${escapeHtml(floor.label)} · ${escapeHtml(stairSummary)}</text>
  <text x="48" y="82" font-size="16" fill="#475569">blue=stair flight, yellow=landing, green=door, cyan=window</text>
  <polygon points="${points(floor.slabPolygon)}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="3" />
  ${rooms}
  ${walls}
  ${openingMarks}
  ${stairs}
  ${items}
</svg>`
}

function summarizeFloor(floor: AiBuildingFloorPlan, floorIndex: number, totalFloors: number) {
  const stairRooms = floor.rooms.filter((room) => room.programKey === 'stairs')
  const problems: string[] = []
  if (floorIndex < totalFloors - 1 && floor.stairs.length === 0) {
    problems.push('missing stair to next floor')
  }
  if (stairRooms.length === 0) {
    problems.push('missing stair room')
  }
  if (floor.stairs.some((stair) => !stairRooms.some((room) => room.key === stair.roomKey))) {
    problems.push('stair not bound to stair room')
  }

  return {
    level: floor.level,
    label: floor.label,
    rooms: floor.rooms.map((room) => ({
      key: room.key,
      name: room.name,
      programKey: room.programKey ?? null,
    })),
    stairRooms: stairRooms.map((room) => room.key),
    stairs: floor.stairs.map((stair) => ({
      key: stair.key,
      roomKey: stair.roomKey,
      layoutType: stair.layoutType,
      stepCount: stair.stepCount,
      position: stair.position,
      segmentCount: stair.segments.length,
    })),
    problems,
  }
}

function selectCases() {
  const requested = process.argv
    .find((arg) => arg.startsWith('--case='))
    ?.replace('--case=', '')
    .trim()
  if (!requested || requested === 'all') return CASES
  return CASES.filter((entry) => entry.name === requested)
}

const outputRootArg = process.argv
  .find((arg) => arg.startsWith('--out='))
  ?.replace('--out=', '')
  .trim()
const outputRoot = resolve(outputRootArg || join('..', 'docs', 'agent-runs', 'ai-building-floor-qa'))
await mkdir(outputRoot, { recursive: true })

const selectedCases = selectCases()
if (selectedCases.length === 0) {
  throw new Error('No matching QA case. Use --case=all or one of: ' + CASES.map((entry) => entry.name).join(', '))
}

const report: Array<{
  caseName: string
  outputDir: string
  constructability: ReturnType<typeof validateAiBuildingPlanConstructability>
  habitability: ReturnType<typeof validateAiBuildingPlanHabitability>
  summary: ReturnType<typeof getAiBuildingPlanSummary>
  floors: ReturnType<typeof summarizeFloor>[]
}> = []

for (const testCase of selectedCases) {
  const caseDir = join(outputRoot, testCase.name)
  await mkdir(caseDir, { recursive: true })

  const plan = createPlan(testCase.form, 'zh-CN', null)
  const constructability = validateAiBuildingPlanConstructability(plan, 'zh-CN')
  const habitability = validateAiBuildingPlanHabitability(plan, 'zh-CN')
  const summary = getAiBuildingPlanSummary(plan, 'zh-CN')

  const floors = plan.floors.map((floor, index) => summarizeFloor(floor, index, plan.floors.length))
  for (const floor of plan.floors) {
    await writeFile(
      join(caseDir, `floor-${String(floor.level).padStart(2, '0')}.svg`),
      renderFloorSvg(floor, plan),
      'utf8',
    )
  }

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(testCase.name)} AI building QA</title>
  <style>
    body { margin: 0; padding: 24px; background: #eef2f7; color: #0f172a; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .meta { margin-bottom: 24px; color: #475569; }
    .floor { margin-bottom: 28px; padding: 16px; background: white; border: 1px solid #cbd5e1; border-radius: 8px; }
    img { width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(testCase.name)}</h1>
  <div class="meta">constructability=${constructability.passed ? 'passed' : 'failed'} · habitability=${habitability.passed ? 'passed' : 'failed'} · ${escapeHtml(summary.headline)}</div>
  ${plan.floors
    .map(
      (floor) => `
        <section class="floor">
          <h2>${escapeHtml(floor.label)}</h2>
          <img src="./floor-${String(floor.level).padStart(2, '0')}.svg" />
        </section>
      `,
    )
    .join('\n')}
</body>
</html>`
  await writeFile(join(caseDir, 'index.html'), html, 'utf8')

  report.push({
    caseName: testCase.name,
    outputDir: caseDir,
    constructability,
    habitability,
    summary,
    floors,
  })
}

await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2), 'utf8')

for (const result of report) {
  console.log(
    [
      `[qa] ${result.caseName}`,
      `constructability=${result.constructability.passed ? 'pass' : 'fail'}`,
      `habitability=${result.habitability.passed ? 'pass' : 'fail'}`,
      `output=${result.outputDir}`,
    ].join(' | '),
  )
  for (const floor of result.floors) {
    console.log(
      `  - ${floor.label}: stairs=${floor.stairs
        .map((stair) => `${stair.layoutType}@${stair.roomKey}`)
        .join(', ') || 'none'}${floor.problems.length ? ` | problems=${floor.problems.join(', ')}` : ''}`,
    )
  }
}
