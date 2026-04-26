type Point2D = [number, number]

type AiBuildingLanguage = 'zh-CN' | 'en'
type AiBuildingType = 'villa' | 'residential' | 'apartment' | 'shop' | 'office' | 'hotel'
type AiBuildingVariant = 'balanced' | 'courtyard' | 'daylight'

import { getProgramLayoutRule, type ProgramDrivenRoomRule } from './ai-building-room-rules'

export type ProgramDrivenRoomProgram = {
  key: string
  name: string
}

export type ProgramDrivenGridLayoutHint = {
  axis: 'width' | 'depth'
  spans: number[]
}

export type ProgramDrivenRoomPlan = {
  key: string
  name: string
  programKey?: string
  color: string
  polygon: Point2D[]
}

export type ProgramDrivenWallPlan = {
  key: string
  name: string
  start: Point2D
  end: Point2D
  role: 'inner'
}

export type ProgramDrivenLayoutPlan = {
  rooms: ProgramDrivenRoomPlan[]
  walls: ProgramDrivenWallPlan[]
  courtyardPolygon: Point2D[] | null
}

export type ProgramDrivenVerticalAnchor = {
  key: string
  centerX: number
  centerZ: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

type ProgramDrivenLayoutRequest = {
  buildingType: AiBuildingType
  variant: AiBuildingVariant
  width: number
  depth: number
  floorIndex: number
  language: AiBuildingLanguage
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  roomPrograms: ProgramDrivenRoomProgram[]
  layoutHint?: ProgramDrivenGridLayoutHint | null
  previousFloorAnchors?: ProgramDrivenVerticalAnchor[]
  plannedAnchors?: ProgramDrivenVerticalAnchor[]
}

type AccessClass = 'circulation' | 'public' | 'service' | 'private' | 'outdoor' | 'other'

type ProgramPlacement = ProgramDrivenRoomProgram & {
  sourceIndex: number
  accessClass: AccessClass
  areaWeight: number
  order: number
  targetArea: number
  rule: ProgramDrivenRoomRule
}

type GridCell = {
  row: number
  col: number
}

type GridShape = {
  rows: number
  cols: number
}

type GridRect = {
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

type ProgramDrivenLayoutCandidate = {
  owners: number[][]
  roomRects: Map<number, GridRect>
  programs: ProgramPlacement[]
  rowEdges: number[]
  colEdges: number[]
  score: number
}

type ProgramDrivenLayoutAnalysis = {
  roomRects: Map<number, GridRect>
  rowEdges: number[]
  colEdges: number[]
  score: number
}

type ResidentialLayoutAmenity = {
  entryBuffer: {
    score: number
    entryProgramId: number
    directViewNeighborIds: Set<number>
  } | null
  bathroomPrivacy: Map<
    number,
    {
      score: number
      directEntryView: boolean
      publicExposure: boolean
      frontExposure: boolean
    }
  >
}

type StripTransferSide = 'left' | 'right' | 'top' | 'bottom'

type StripTransferMove = {
  kind: 'transfer'
  donorId: number
  recipientId: number
  side: StripTransferSide
  stripCells: GridCell[]
}

type StripShiftMove = {
  kind: 'shift'
  ownerId: number
  direction: StripTransferSide
  incomingDonorId: number
  outgoingRecipientId: number
  incomingCells: GridCell[]
  outgoingCells: GridCell[]
}

type SwapMove = {
  kind: 'swap'
  leftId: number
  rightId: number
  leftCells: GridCell[]
  rightCells: GridCell[]
}

type LayoutRepairMove = StripTransferMove | StripShiftMove | SwapMove

const MIN_ROOM_SPAN = 2.25
const TARGET_AREA_GROWTH_THRESHOLD = 1
const HARD_VERTICAL_STACK_CONTAINMENT_TOLERANCE = 0.02

const ROOM_COLORS = [
  '#0ea5e9',
  '#22c55e',
  '#f97316',
  '#a855f7',
  '#eab308',
  '#14b8a6',
  '#ef4444',
  '#6366f1',
  '#84cc16',
  '#ec4899',
  '#06b6d4',
  '#f59e0b',
]

export function createProgramDrivenRoomLayout(
  request: ProgramDrivenLayoutRequest,
): ProgramDrivenLayoutPlan | null {
  const roomPrograms = getAugmentedRoomPrograms(request)
  if (roomPrograms.length === 0) return null
  const effectiveRequest: ProgramDrivenLayoutRequest = {
    ...request,
    roomPrograms,
    layoutHint: request.layoutHint ?? getGeneratedLayoutHint(request, roomPrograms),
  }

  const width = effectiveRequest.maxX - effectiveRequest.minX
  const depth = effectiveRequest.maxZ - effectiveRequest.minZ
  const basePrograms = roomPrograms.map((program, sourceIndex) => {
    const rule = getProgramLayoutRule(effectiveRequest.buildingType, program.key)
    return {
      ...program,
      sourceIndex,
      accessClass: getRoomAccessClass(program.key),
      rule,
      areaWeight: rule.areaWeight,
      order: rule.order,
    }
  })
  const targetAreas = getProgramTargetAreas(basePrograms, width * depth)
  const programs = basePrograms.map((program) => ({
    ...program,
    targetArea: (() => {
      const baseTargetArea = Math.min(
        targetAreas.get(program.sourceIndex) ?? program.rule.preferredMinArea,
        getProgramTargetAreaCap(program),
      )
      const stackAnchor = getPrimaryExactAnchor(program.key, effectiveRequest)
      if (!stackAnchor || !requiresExactVerticalStack(program.key)) return baseTargetArea
      const anchorArea = Math.max(
        (stackAnchor.maxX - stackAnchor.minX) * (stackAnchor.maxZ - stackAnchor.minZ),
        program.rule.hardMinArea,
      )
      const areaLimit =
        program.key === 'stairs' || program.key === 'elevator'
          ? 1.08
          : program.key === 'bathroom'
            ? 1.12
            : 1.15
      return Math.min(baseTargetArea, anchorArea * areaLimit)
    })(),
  }))
  const maxCols = Math.max(1, Math.floor(width / MIN_ROOM_SPAN))
  const maxRows = Math.max(1, Math.floor(depth / MIN_ROOM_SPAN))
  const gridCandidates = getGridShapeCandidates(
    programs,
    width,
    depth,
    maxCols,
    maxRows,
    effectiveRequest.layoutHint,
    effectiveRequest,
  )
  if (gridCandidates.length === 0) return null
  const placementVariants = getPlacementVariants(programs, effectiveRequest)
  let bestCoreBandCandidate: ProgramDrivenLayoutCandidate | null = null
  let bestGenericCandidate: ProgramDrivenLayoutCandidate | null = null

  for (const grid of gridCandidates) {
    const coreBandCandidate = buildCoreBandLayoutCandidate(programs, grid, effectiveRequest)
    if (
      coreBandCandidate &&
      (!bestCoreBandCandidate || coreBandCandidate.score > bestCoreBandCandidate.score)
    ) {
      bestCoreBandCandidate = coreBandCandidate
    }

    for (const variant of placementVariants) {
      const candidate = buildProgramDrivenLayoutCandidate(variant, programs, grid, effectiveRequest)
      if (!candidate) continue
      if (!bestGenericCandidate || candidate.score > bestGenericCandidate.score) {
        bestGenericCandidate = candidate
      }
    }
  }

  const bestCandidate = getPreferredLayoutCandidate(
    bestCoreBandCandidate,
    bestGenericCandidate,
    effectiveRequest,
  )
  if (!bestCandidate) return null

  const partitionName =
    effectiveRequest.language === 'zh-CN' ? 'AI 分区隔墙' : 'AI Zoning Partition'

  const rooms: ProgramDrivenRoomPlan[] = []
  for (const program of programs) {
    const rect = bestCandidate.roomRects.get(program.sourceIndex)
    if (!rect) return null

    rooms.push({
      key: `${safeRoomKeyPart(program.key)}-${program.sourceIndex + 1}`,
      name: program.name,
      programKey: program.key,
      color: getRoomColor(program.sourceIndex),
      polygon: rectanglePolygon(
        bestCandidate.colEdges[rect.minCol]!,
        bestCandidate.rowEdges[rect.minRow]!,
        bestCandidate.colEdges[rect.maxCol + 1]!,
        bestCandidate.rowEdges[rect.maxRow + 1]!,
      ),
    })
  }

  return {
    rooms,
    walls: createPartitionWalls(
      bestCandidate.owners,
      bestCandidate.colEdges,
      bestCandidate.rowEdges,
      partitionName,
    ),
    courtyardPolygon: null,
  }
}

function buildProgramDrivenLayoutCandidate(
  orderedPrograms: ProgramPlacement[],
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const owners = Array.from({ length: grid.rows }, () =>
    Array.from({ length: grid.cols }, () => -1),
  )
  const roomCells = new Map<number, GridCell[]>(
    programs.map((program) => [program.sourceIndex, []]),
  )

  for (const program of orderedPrograms) {
    const bestCell = getBestCellForProgram(program, owners, roomCells, programs, grid, request)
    if (!bestCell) return null
    owners[bestCell.row]![bestCell.col] = program.sourceIndex
    roomCells.get(program.sourceIndex)?.push(bestCell)
  }

  if (!mergeEmptyCells(owners, roomCells, programs, grid, request)) {
    return null
  }

  const analysis = repairLayoutCandidate(owners, roomCells, programs, grid, request)
  if (!analysis) return null
  if (
    hasHardVerticalStackViolations(
      programs,
      analysis.roomRects,
      analysis.rowEdges,
      analysis.colEdges,
      request,
    )
  ) {
    return null
  }
  return {
    owners,
    roomRects: analysis.roomRects,
    programs,
    rowEdges: analysis.rowEdges,
    colEdges: analysis.colEdges,
    score: analysis.score,
  } satisfies ProgramDrivenLayoutCandidate
}

function buildCoreBandLayoutCandidate(
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  if (!shouldUseCoreBandStrategy(programs, grid, request)) return null

  const owners = Array.from({ length: grid.rows }, () =>
    Array.from({ length: grid.cols }, () => -1),
  )
  const roomCells = new Map<number, GridCell[]>(
    programs.map((program) => [program.sourceIndex, []]),
  )
  const seededIds = new Set<number>()

  if (!seedCoreBandRooms(owners, roomCells, programs, grid, request, seededIds)) {
    return null
  }

  const remainingPrograms = [...programs]
    .filter((program) => !seededIds.has(program.sourceIndex))
    .sort((left, right) => {
      const leftPriority = getCorridorBandPriority(left, request, programs)
      const rightPriority = getCorridorBandPriority(right, request, programs)
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      if (left.targetArea !== right.targetArea) return right.targetArea - left.targetArea
      return left.sourceIndex - right.sourceIndex
    })

  for (const program of remainingPrograms) {
    const bestCell = getBestCellForProgram(program, owners, roomCells, programs, grid, request)
    if (!bestCell) return null
    owners[bestCell.row]![bestCell.col] = program.sourceIndex
    roomCells.get(program.sourceIndex)?.push(bestCell)
  }

  if (!mergeEmptyCells(owners, roomCells, programs, grid, request)) {
    return null
  }

  const analysis = analyzeLayoutState(programs, roomCells, grid, request)
  if (!analysis) return null
  if (
    hasHardVerticalStackViolations(
      programs,
      analysis.roomRects,
      analysis.rowEdges,
      analysis.colEdges,
      request,
    )
  ) {
    return null
  }

  return {
    owners,
    roomRects: analysis.roomRects,
    programs,
    rowEdges: analysis.rowEdges,
    colEdges: analysis.colEdges,
    score: analysis.score,
  } satisfies ProgramDrivenLayoutCandidate
}

function getPreferredLayoutCandidate(
  coreBandCandidate: ProgramDrivenLayoutCandidate | null,
  genericCandidate: ProgramDrivenLayoutCandidate | null,
  request: ProgramDrivenLayoutRequest,
) {
  if (!coreBandCandidate) return genericCandidate
  if (!genericCandidate) return coreBandCandidate

  if (request.buildingType === 'office') {
    return genericCandidate.score > coreBandCandidate.score + 18
      ? genericCandidate
      : coreBandCandidate
  }

  return coreBandCandidate.score >= genericCandidate.score ? coreBandCandidate : genericCandidate
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function shouldUseCoreBandStrategy(
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const hasCorridor = programs.some((program) => program.key === 'corridor')
  return hasCorridor && request.buildingType === 'office' && grid.rows >= 4 && grid.cols >= 5
}

function seedCoreBandRooms(
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
  seededIds: Set<number>,
) {
  if (request.buildingType !== 'office') return false

  const corridorProgram = findProgramByKeys(programs, ['corridor'])
  const receptionProgram = findProgramByKeys(programs, ['entry', 'reception'])
  const openOfficeProgram = findProgramByKeys(programs, ['open_office'])
  const meetingProgram = findProgramByKeys(programs, ['meeting_room'])
  if (!corridorProgram || !openOfficeProgram) return false

  const serviceStackPrograms = [
    findProgramByKeys(programs, ['bathroom']),
    findProgramByKeys(programs, ['pantry']),
    findProgramByKeys(programs, ['archive']),
    findProgramByKeys(programs, ['cashier']),
    findProgramByKeys(programs, ['storage']),
  ].filter((program): program is ProgramPlacement => Boolean(program))

  if (serviceStackPrograms.length === 0 || serviceStackPrograms.length > grid.rows - 1) return false

  const serviceStartRow = 1
  const serviceEndRow = grid.rows - 1
  const serviceCol = 0
  const meetingCol = meetingProgram ? grid.cols - 1 : null
  const receptionStartCol = 0
  const usesExpandedFrontBand = grid.cols >= 6
  const receptionWidth = receptionProgram
    ? usesExpandedFrontBand
      ? 1
      : Math.min(2, grid.cols - 3)
    : 0
  const receptionEndCol = receptionProgram
    ? receptionStartCol + receptionWidth - 1
    : receptionStartCol - 1
  const corridorStartCol = receptionProgram ? receptionEndCol + 1 : receptionStartCol
  const corridorWidth = Math.max(
    1,
    Math.min(
      usesExpandedFrontBand ? 1 : 2,
      (meetingCol === null ? grid.cols : meetingCol) - corridorStartCol,
    ),
  )
  const corridorEndCol = corridorStartCol + corridorWidth - 1
  const openOfficeMinCol = serviceCol + 1
  const openOfficeMaxCol = meetingCol === null ? grid.cols - 1 : meetingCol - 1
  if (openOfficeMaxCol < openOfficeMinCol) return false
  if (corridorEndCol >= (meetingCol ?? grid.cols)) return false

  if (receptionProgram) {
    assignSeedRect(
      owners,
      roomCells,
      receptionProgram.sourceIndex,
      0,
      0,
      receptionStartCol,
      receptionEndCol,
    )
    seededIds.add(receptionProgram.sourceIndex)
  }

  assignSeedRect(
    owners,
    roomCells,
    corridorProgram.sourceIndex,
    0,
    0,
    corridorStartCol,
    corridorEndCol,
  )
  seededIds.add(corridorProgram.sourceIndex)

  for (let index = 0; index < serviceStackPrograms.length; index += 1) {
    const program = serviceStackPrograms[index]!
    const startRow = serviceStartRow + index
    const endRow = index === serviceStackPrograms.length - 1 ? serviceEndRow : startRow
    assignSeedRect(owners, roomCells, program.sourceIndex, startRow, endRow, serviceCol, serviceCol)
    seededIds.add(program.sourceIndex)
  }

  if (meetingProgram && meetingCol !== null) {
    assignSeedRect(
      owners,
      roomCells,
      meetingProgram.sourceIndex,
      0,
      serviceEndRow,
      meetingCol,
      meetingCol,
    )
    seededIds.add(meetingProgram.sourceIndex)
  }

  assignSeedRect(
    owners,
    roomCells,
    openOfficeProgram.sourceIndex,
    serviceStartRow,
    serviceEndRow,
    openOfficeMinCol,
    openOfficeMaxCol,
  )
  seededIds.add(openOfficeProgram.sourceIndex)

  return true
}

function assignSeedCell(
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  ownerId: number,
  cell: GridCell,
) {
  owners[cell.row]![cell.col] = ownerId
  roomCells.get(ownerId)?.push(cell)
}

function assignSeedRect(
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  ownerId: number,
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
) {
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      assignSeedCell(owners, roomCells, ownerId, { row, col })
    }
  }
}

function rectanglePolygon(minX: number, minZ: number, maxX: number, maxZ: number): Point2D[] {
  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ]
}

function getRoomColor(index: number) {
  return ROOM_COLORS[index % ROOM_COLORS.length] ?? ROOM_COLORS[0]!
}

function safeRoomKeyPart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'room'
  )
}

function getAugmentedRoomPrograms(request: ProgramDrivenLayoutRequest) {
  const roomPrograms = [...request.roomPrograms]
  if (roomPrograms.some((program) => program.key === 'corridor')) return roomPrograms

  const generatedCirculation = getGeneratedCorridorProgram(request, roomPrograms)
  if (!generatedCirculation) return roomPrograms

  return [...roomPrograms, generatedCirculation]
}

function getGeneratedCorridorProgram(
  request: ProgramDrivenLayoutRequest,
  roomPrograms: ProgramDrivenRoomProgram[],
): ProgramDrivenRoomProgram | null {
  const roomCount = roomPrograms.length
  const privateCount = roomPrograms.filter(
    (program) =>
      program.key === 'bedroom' || program.key === 'primary_bedroom' || program.key === 'study',
  ).length
  const serviceCount = roomPrograms.filter((program) =>
    ['bathroom', 'kitchen', 'pantry', 'archive', 'storage', 'cashier'].includes(program.key),
  ).length
  const hasCore = roomPrograms.some(
    (program) =>
      program.key === 'stairs' || program.key === 'elevator' || program.key === 'bathroom',
  )
  const hasEntry = roomPrograms.some(
    (program) => program.key === 'entry' || program.key === 'reception',
  )
  const shouldInsert =
    (request.buildingType === 'office' &&
      roomCount >= 5 &&
      roomPrograms.some(
        (program) => program.key === 'open_office' || program.key === 'meeting_room',
      )) ||
    (request.buildingType === 'hotel' && roomCount >= 5) ||
    ((request.buildingType === 'residential' ||
      request.buildingType === 'villa' ||
      request.buildingType === 'apartment') &&
      hasCore &&
      !hasEntry &&
      request.floorIndex > 0 &&
      privateCount >= 2 &&
      serviceCount >= 1)

  if (!shouldInsert) return null

  return {
    key: 'corridor',
    name: request.language === 'zh-CN' ? '走廊' : 'Corridor',
  }
}

function getGeneratedLayoutHint(
  request: ProgramDrivenLayoutRequest,
  roomPrograms: ProgramDrivenRoomProgram[],
): ProgramDrivenGridLayoutHint | null {
  const insertedCorridor =
    !request.roomPrograms.some((program) => program.key === 'corridor') &&
    roomPrograms.some((program) => program.key === 'corridor')

  if (!insertedCorridor) return null

  if (request.buildingType === 'office' || request.buildingType === 'hotel') {
    return {
      axis: 'depth',
      spans: [1.05, 1.2, 2.9, 3.2],
    }
  }

  if (
    request.floorIndex > 0 &&
    roomPrograms.some((program) => program.key === 'stairs') &&
    roomPrograms.some((program) => program.key === 'bathroom')
  ) {
    return {
      axis: 'depth',
      spans: [1.05, 1.2, 3.1, 3.1],
    }
  }

  return null
}

function getRoomAccessClass(programKey?: string): AccessClass {
  if (
    programKey === 'entry' ||
    programKey === 'stairs' ||
    programKey === 'elevator' ||
    programKey === 'corridor' ||
    programKey === 'courtyard'
  ) {
    return 'circulation'
  }

  if (
    programKey === 'living_room' ||
    programKey === 'dining_room' ||
    programKey === 'open_office' ||
    programKey === 'meeting_room' ||
    programKey === 'display_area' ||
    programKey === 'retail_area' ||
    programKey === 'reception'
  ) {
    return 'public'
  }

  if (
    programKey === 'kitchen' ||
    programKey === 'bathroom' ||
    programKey === 'garage' ||
    programKey === 'storage' ||
    programKey === 'archive' ||
    programKey === 'equipment_room' ||
    programKey === 'production' ||
    programKey === 'cashier' ||
    programKey === 'pantry'
  ) {
    return 'service'
  }

  if (programKey === 'bedroom' || programKey === 'primary_bedroom' || programKey === 'study') {
    return 'private'
  }

  if (programKey === 'balcony') return 'outdoor'
  return 'other'
}

function getPlacementVariants(programs: ProgramPlacement[], request: ProgramDrivenLayoutRequest) {
  const residentialAmenityVariants = shouldUseResidentialAmenityPlacement(request)
    ? [
        [...programs].sort((left, right) => {
          const leftPriority = getResidentialBufferPlacementPriority(left, request)
          const rightPriority = getResidentialBufferPlacementPriority(right, request)
          if (leftPriority !== rightPriority) return leftPriority - rightPriority
          if (left.targetArea !== right.targetArea) return right.targetArea - left.targetArea
          return left.sourceIndex - right.sourceIndex
        }),
        [...programs].sort((left, right) => {
          const leftPriority = getResidentialPrivacyPlacementPriority(left, request)
          const rightPriority = getResidentialPrivacyPlacementPriority(right, request)
          if (leftPriority !== rightPriority) return leftPriority - rightPriority
          if (left.order !== right.order) return left.order - right.order
          return left.sourceIndex - right.sourceIndex
        }),
      ]
    : []

  const variants = [
    ...residentialAmenityVariants,
    [...programs].sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order
      if (left.areaWeight !== right.areaWeight) return right.areaWeight - left.areaWeight
      return left.sourceIndex - right.sourceIndex
    }),
    [...programs].sort((left, right) => {
      const leftPriority = getEntrySpinePriority(left, request)
      const rightPriority = getEntrySpinePriority(right, request)
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      if (left.areaWeight !== right.areaWeight) return right.areaWeight - left.areaWeight
      return left.sourceIndex - right.sourceIndex
    }),
    [...programs].sort((left, right) => {
      const leftPriority = getStackPriority(left, request)
      const rightPriority = getStackPriority(right, request)
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      if (left.order !== right.order) return left.order - right.order
      if (left.areaWeight !== right.areaWeight) return right.areaWeight - left.areaWeight
      return left.sourceIndex - right.sourceIndex
    }),
    [...programs].sort((left, right) => {
      const leftPriority = getCorridorBandPriority(left, request, programs)
      const rightPriority = getCorridorBandPriority(right, request, programs)
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      if (left.targetArea !== right.targetArea) return left.targetArea - right.targetArea
      return left.sourceIndex - right.sourceIndex
    }),
    [...programs].sort((left, right) => {
      const leftPriority = getCompactPlacementPriority(left, request)
      const rightPriority = getCompactPlacementPriority(right, request)
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      if (left.targetArea !== right.targetArea) return right.targetArea - left.targetArea
      return left.sourceIndex - right.sourceIndex
    }),
    [...programs].sort((left, right) => {
      if (hasStackAnchor(left, request, true) !== hasStackAnchor(right, request, true)) {
        return hasStackAnchor(left, request, true) ? -1 : 1
      }
      if (left.targetArea !== right.targetArea) return right.targetArea - left.targetArea
      if (left.order !== right.order) return left.order - right.order
      return left.sourceIndex - right.sourceIndex
    }),
  ]

  const seen = new Set<string>()
  return variants.filter((variant) => {
    const key = variant.map((program) => program.sourceIndex).join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function shouldUseResidentialAmenityPlacement(request: ProgramDrivenLayoutRequest) {
  return isResidentialLikeBuildingType(request.buildingType) && request.floorIndex === 0
}

function isResidentialAmenityBufferProgram(program: ProgramPlacement) {
  return (
    program.key === 'living_room' ||
    program.key === 'dining_room' ||
    program.key === 'corridor' ||
    program.key === 'stairs' ||
    program.key === 'elevator' ||
    program.key === 'reception'
  )
}

function getResidentialBufferPlacementPriority(
  program: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
) {
  if (!shouldUseResidentialAmenityPlacement(request)) {
    return getEntrySpinePriority(program, request)
  }

  if (program.key === 'entry' || program.key === 'reception') return 0
  if (program.key === 'corridor' || program.key === 'stairs' || program.key === 'elevator')
    return 1
  if (program.key === 'living_room' || program.key === 'dining_room') return 2
  if (program.key === 'kitchen' || program.key === 'pantry') return 3
  if (program.accessClass === 'public') return 4
  if (program.accessClass === 'private') return 5
  if (program.key === 'bathroom') return 7
  if (program.accessClass === 'service') return 6
  return 8
}

function getResidentialPrivacyPlacementPriority(
  program: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
) {
  if (!shouldUseResidentialAmenityPlacement(request)) {
    return getCompactPlacementPriority(program, request)
  }

  if (program.key === 'entry' || program.key === 'reception') return 0
  if (program.key === 'living_room' || program.key === 'dining_room') return 1
  if (program.key === 'corridor' || program.key === 'stairs' || program.key === 'elevator')
    return 2
  if (program.key === 'kitchen' || program.key === 'pantry') return 3
  if (program.accessClass === 'private') return 4
  if (program.accessClass === 'service' && program.key !== 'bathroom') return 5
  if (program.key === 'bathroom') return 6
  return 7
}

function getEntrySpinePriority(program: ProgramPlacement, request: ProgramDrivenLayoutRequest) {
  if (program.key === 'entry' || program.key === 'reception') return 0
  if (program.key === 'corridor' || program.key === 'stairs' || program.key === 'elevator') return 1
  if (
    program.key === 'living_room' ||
    program.key === 'open_office' ||
    program.key === 'display_area' ||
    program.key === 'retail_area'
  ) {
    return 2
  }
  if (program.key === 'dining_room' || program.key === 'meeting_room') return 3
  if (program.key === 'kitchen' || program.key === 'pantry' || program.key === 'cashier') return 4
  if (request.floorIndex === 0 && program.accessClass === 'private') return 7
  if (program.accessClass === 'service') return 5
  if (program.accessClass === 'private') return 6
  return 8
}

function getStackPriority(program: ProgramPlacement, request: ProgramDrivenLayoutRequest) {
  if (request.floorIndex > 0) {
    if (hasStackAnchor(program, request, true)) return 0
    if (hasStackAnchor(program, request, false)) return 1
    if (program.key === 'stairs' || program.key === 'corridor' || program.key === 'elevator')
      return 2
  }
  return getEntrySpinePriority(program, request) + 3
}

function getCompactPlacementPriority(
  program: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
) {
  if (request.floorIndex > 0 && hasStackAnchor(program, request, true)) return 0
  if (program.key === 'entry' || program.key === 'reception') return 1
  if (
    program.key === 'living_room' ||
    program.key === 'open_office' ||
    program.key === 'display_area' ||
    program.key === 'retail_area'
  ) {
    return 2
  }
  if (
    program.key === 'meeting_room' ||
    program.key === 'dining_room' ||
    program.key === 'primary_bedroom' ||
    program.key === 'bedroom' ||
    program.key === 'study'
  ) {
    return 3
  }
  if (program.key === 'stairs' || program.key === 'corridor' || program.key === 'elevator') return 4
  return 5
}

function getCorridorBandPriority(
  program: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
  programs: ProgramPlacement[],
) {
  const hasCorridor = programs.some((candidate) => candidate.key === 'corridor')
  if (!hasCorridor) return getCompactPlacementPriority(program, request) + 4

  if (request.buildingType === 'office' || request.buildingType === 'hotel') {
    if (program.key === 'corridor') return 0
    if (
      program.key === 'bathroom' ||
      program.key === 'archive' ||
      program.key === 'pantry' ||
      program.key === 'cashier' ||
      program.key === 'stairs' ||
      program.key === 'elevator'
    ) {
      return 1
    }
    if (program.key === 'entry' || program.key === 'reception') return 2
    if (program.key === 'meeting_room') return 3
    if (
      program.key === 'open_office' ||
      program.key === 'display_area' ||
      program.key === 'retail_area'
    ) {
      return 4
    }
    return 5
  }

  if (request.floorIndex > 0) {
    if (program.key === 'corridor' || program.key === 'stairs' || program.key === 'bathroom')
      return 0
    if (program.key === 'elevator') return 1
    if (program.key === 'study' || program.key === 'bedroom' || program.key === 'primary_bedroom')
      return 2
  }

  return getCompactPlacementPriority(program, request) + 2
}

function getGridShapeCandidates(
  programs: ProgramPlacement[],
  width: number,
  depth: number,
  maxCols: number,
  maxRows: number,
  layoutHint?: ProgramDrivenGridLayoutHint | null,
  request?: ProgramDrivenLayoutRequest,
) {
  const roomCount = programs.length
  const hasCorridorProgram = programs.some((program) => program.key === 'corridor')
  const usesResidentialAmenityGrid = Boolean(request && shouldUseResidentialAmenityPlacement(request))
  const usesOfficeCoreBand =
    request?.buildingType === 'office' && hasCorridorProgram && layoutHint?.axis === 'depth'
  const usesUpperStackGrid =
    Boolean(request?.floorIndex && request.floorIndex > 0) &&
    layoutHint?.axis === 'depth' &&
    programs.filter((program) => hasStackAnchor(program, request!, true)).length >= 2
  const aspect = width / Math.max(depth, 0.01)
  const totalArea = width * depth
  const totalHardMinArea = programs.reduce((sum, program) => sum + program.rule.hardMinArea, 0)
  const sizeSpread =
    programs.reduce((largest, program) => Math.max(largest, program.rule.preferredMinArea), 0) /
    Math.max(
      programs.reduce(
        (smallest, program) => Math.min(smallest, program.rule.preferredMinArea),
        Number.POSITIVE_INFINITY,
      ),
      0.1,
    )
  const preferredWaste =
    roomCount >= 5
      ? (sizeSpread > 4.5 ? 2 : sizeSpread > 2.8 ? 1 : 0) +
        (hasCorridorProgram ? 1 : 0) +
        (usesOfficeCoreBand ? 2 : 0) +
        (usesUpperStackGrid ? 1 : 0) +
        (usesResidentialAmenityGrid ? 1 : 0)
      : 0
  const maxWaste =
    (roomCount >= 7 ? 5 : 4) +
    (hasCorridorProgram ? 4 : 0) +
    (usesOfficeCoreBand ? 4 : 0) +
    (usesUpperStackGrid ? 2 : 0) +
    (usesResidentialAmenityGrid && roomCount >= 5 ? 1 : 0)
  const representativeSpan =
    [...programs]
      .sort((left, right) => right.rule.minSpan - left.rule.minSpan)
      .slice(0, Math.min(3, programs.length))
      .reduce((sum, program) => sum + program.rule.minSpan, 0) /
    Math.max(Math.min(3, programs.length), 1)
  const candidates: Array<{ grid: GridShape; score: number }> = []

  const maxCandidateCols = Math.min(maxCols, usesOfficeCoreBand ? 6 : 5)

  for (let rows = 1; rows <= Math.min(maxRows, 5); rows += 1) {
    for (let cols = 1; cols <= maxCandidateCols; cols += 1) {
      const cells = rows * cols
      if (cells < roomCount) continue
      if (hasCorridorProgram && layoutHint?.axis === 'depth' && roomCount >= 6 && rows < 3) continue

      const shapeAspect = cols / Math.max(rows, 1)
      const waste = cells - roomCount
      if (waste > maxWaste) continue
      const avgCellWidth = width / cols
      const avgCellDepth = depth / rows
      const pressure = totalHardMinArea / Math.max(totalArea, 0.1)
      const wastePenalty =
        waste < preferredWaste
          ? (preferredWaste - waste) * 1.15
          : waste * (pressure > 0.78 ? 1.25 : pressure > 0.62 ? 0.98 : 0.76) -
            Math.min(waste, preferredWaste) * 0.4
      const centerBonus = cols % 2 === 1 ? 0.45 : 0
      const depthBonus = rows >= 2 ? 0.18 : 0
      const coreBandBonus =
        hasCorridorProgram && layoutHint?.axis === 'depth'
          ? rows >= 4
            ? 0.6
            : rows >= 3
              ? 0.28
              : 0
          : 0
      const officeBandBonus = usesOfficeCoreBand && cols >= 6 ? 0.52 : 0
      const upperStackBonus = usesUpperStackGrid && cols >= 4 ? 0.44 : 0
      const upperStackPenalty = usesUpperStackGrid && cols < 4 ? 0.38 : 0
      const residentialAmenityGridScore = getResidentialAmenityGridScore(
        programs,
        { rows, cols },
        roomCount,
        waste,
        request,
      )
      const gridAxisBonus =
        layoutHint?.axis === 'width' ? cols * 0.06 : layoutHint?.axis === 'depth' ? rows * 0.06 : 0
      const score =
        wastePenalty +
        Math.abs(shapeAspect - aspect) +
        (cols < 3 && roomCount >= 5 && maxCols >= 3 ? 0.6 : 0) +
        (rows < 2 && roomCount >= 4 && maxRows >= 2 ? 0.35 : 0) -
        centerBonus -
        depthBonus -
        coreBandBonus -
        officeBandBonus -
        upperStackBonus +
        upperStackPenalty -
        residentialAmenityGridScore -
        gridAxisBonus +
        (avgCellWidth < representativeSpan * 0.72 ? 0.55 : 0) +
        (avgCellDepth < representativeSpan * 0.72 ? 0.55 : 0)

      candidates.push({ grid: { rows, cols }, score })
    }
  }

  return candidates
    .sort((left, right) => left.score - right.score)
    .slice(0, hasCorridorProgram ? 14 : 10)
    .map((candidate) => candidate.grid)
}

function getResidentialAmenityGridScore(
  programs: ProgramPlacement[],
  grid: GridShape,
  roomCount: number,
  waste: number,
  request?: ProgramDrivenLayoutRequest,
) {
  if (!request || !shouldUseResidentialAmenityPlacement(request)) return 0

  const hasEntryProgram = programs.some(
    (program) => program.key === 'entry' || program.key === 'reception',
  )
  const hasBathroomProgram = programs.some((program) => program.key === 'bathroom')
  const hasPrivateProgram = programs.some((program) => program.accessClass === 'private')
  const hasBufferProgram = programs.some(
    (program) =>
      isResidentialAmenityBufferProgram(program) &&
      program.key !== 'entry' &&
      program.key !== 'reception',
  )
  let score = 0

  if (roomCount >= 4) {
    if (grid.rows === 1) score += 1.6
    else if (grid.rows === 2) score += hasEntryProgram && (hasBathroomProgram || hasPrivateProgram) ? 1.05 : 0.6
    else score -= 0.55
  }

  if (roomCount >= 5) {
    if (grid.cols < 3) score += 0.92
    else score -= 0.32
    if (grid.cols % 2 === 1) score -= 0.2
  }

  if (hasEntryProgram && hasBufferProgram) {
    if (grid.rows >= 3 && grid.cols >= 3) score -= 0.45
    else if (grid.rows <= 2) score += 0.68
  }

  if (hasBathroomProgram) {
    if (grid.rows >= 3) score -= 0.24
    if (grid.rows <= 2 && grid.cols <= 3) score += 0.5
  }

  if (hasPrivateProgram) {
    if (grid.rows >= 3) score -= 0.2
    else if (grid.rows === 2) score += 0.3
  }

  if (hasEntryProgram && hasBathroomProgram && hasPrivateProgram && grid.rows >= 3 && grid.cols >= 3) {
    score -= 0.34
  }

  if (grid.cols - grid.rows >= 3 && grid.rows <= 2) {
    score += 0.38
  }

  if (waste >= 1 && grid.rows >= 3 && grid.cols >= 3 && roomCount >= 5) {
    score -= Math.min(waste, 2) * 0.12
  }

  return score
}

function getBestCellForProgram(
  program: ProgramPlacement,
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  let best: { row: number; col: number; score: number } | null = null

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (owners[row]?.[col] !== -1) continue
      const score = scoreCellForProgram(
        program,
        { row, col },
        owners,
        roomCells,
        programs,
        grid,
        request,
      )
      if (!best || score > best.score) {
        best = { row, col, score }
      }
    }
  }

  return best ? { row: best.row, col: best.col } : null
}

function scoreCellForProgram(
  program: ProgramPlacement,
  cell: GridCell,
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const rowRatio = grid.rows <= 1 ? 0.5 : cell.row / (grid.rows - 1)
  const colRatio = grid.cols <= 1 ? 0.5 : cell.col / (grid.cols - 1)
  const southness = 1 - rowRatio
  const northness = rowRatio
  const centerness = 1 - Math.min(1, Math.abs(colRatio - 0.5) * 2)
  const sideness = 1 - centerness
  const assignedCount = owners.flat().filter((owner) => owner >= 0).length
  const entryCell = findPlacedCellByKeys(programs, roomCells, ['entry', 'reception'])
  const publicCell = findPlacedCellByKeys(programs, roomCells, [
    'living_room',
    'open_office',
    'display_area',
  ])
  const hardPenalty = getHardConstraintPenalty(
    program,
    cell,
    entryCell,
    programs,
    grid,
    request,
    centerness,
    southness,
    northness,
    colRatio,
    rowRatio,
  )
  let score = program.areaWeight * 6

  score += getBasePositionScore(program, southness, northness, centerness, sideness, request)
  score += hardPenalty
  score += getResidentialPlacementAmenityScore(
    program,
    cell,
    entryCell,
    owners,
    programs,
    grid,
    request,
  )
  score += getVerticalAlignmentScore(program, cell, grid, request, colRatio, rowRatio)

  if (assignedCount > 0) {
    const occupiedNeighbors = getOrthogonalNeighbors(cell, grid)
      .map((neighbor) => owners[neighbor.row]?.[neighbor.col] ?? -1)
      .filter((owner) => owner >= 0)

    if (occupiedNeighbors.length === 0) {
      score -= program.accessClass === 'private' ? 4 : 6
    }

    for (const owner of occupiedNeighbors) {
      const neighborProgram = programs.find((candidate) => candidate.sourceIndex === owner)
      if (!neighborProgram) continue
      score += getPairAdjacencyScore(program, neighborProgram)
    }
  }

  if (entryCell) {
    const distanceToEntry = getGridDistance(cell, entryCell)
    score += getEntryDistanceScore(program, distanceToEntry, grid)
  }

  if (publicCell) {
    const distanceToPublic = getGridDistance(cell, publicCell)
    score += getPublicDistanceScore(program, distanceToPublic, grid)
  }

  if (centerness > 0.8 && (program.key === 'bathroom' || program.key === 'garage')) {
    score -= 10
  }

  return score
}

function getHardConstraintPenalty(
  program: ProgramPlacement,
  cell: GridCell,
  entryCell: GridCell | null,
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
  centerness: number,
  southness: number,
  northness: number,
  colRatio: number,
  rowRatio: number,
) {
  let penalty = 0
  const hasEntry = programs.some(
    (candidate) => candidate.key === 'entry' || candidate.key === 'reception',
  )
  const hasGroundPublic = programs.some(
    (candidate) =>
      candidate.accessClass === 'public' ||
      candidate.key === 'corridor' ||
      candidate.key === 'stairs' ||
      candidate.key === 'elevator',
  )

  if ((program.key === 'entry' || program.key === 'reception') && cell.row !== 0) {
    penalty -= 160
  }

  if (
    request.floorIndex === 0 &&
    hasGroundPublic &&
    program.accessClass === 'private' &&
    cell.row === 0
  ) {
    penalty -= 95
  }

  if (hasEntry && program.key === 'bathroom' && cell.row === 0 && centerness > 0.45) {
    penalty -= 90
  }

  if (shouldUseResidentialAmenityPlacement(request) && entryCell) {
    const onEntryAxis = isCellOnResidentialEntryViewAxis(cell, entryCell, grid)
    const nearEntryFront = onEntryAxis && cell.row <= entryCell.row + 1

    if (program.key === 'bathroom' && nearEntryFront) {
      penalty -= 130
    }

    if (program.accessClass === 'private' && nearEntryFront) {
      penalty -= 84
    }

    if (
      program.accessClass === 'service' &&
      program.key !== 'bathroom' &&
      program.key !== 'kitchen' &&
      program.key !== 'pantry' &&
      nearEntryFront
    ) {
      penalty -= 48
    }
  }

  if (
    (program.key === 'garage' || program.key === 'production') &&
    (northness > 0.66 || (rowRatio > 0.4 && colRatio > 0.3 && colRatio < 0.7))
  ) {
    penalty -= 80
  }

  if (
    (program.key === 'stairs' || program.key === 'corridor' || program.key === 'elevator') &&
    southness < 0.2 &&
    request.floorIndex === 0
  ) {
    penalty -= 35
  }

  if (
    request.floorIndex > 0 &&
    requiresExactVerticalStack(program.key) &&
    hasStackAnchor(program, request, true)
  ) {
    const alignmentDistance = getBestAnchorDistance(program, request, colRatio, rowRatio, true)
    if (alignmentDistance > 0.58) penalty -= 170
    else if (alignmentDistance > 0.34) penalty -= 72
    else penalty += 18
  }

  return penalty
}

function isCellOnResidentialEntryViewAxis(cell: GridCell, entryCell: GridCell, grid: GridShape) {
  const band = grid.cols >= 5 ? 1 : 0
  return Math.abs(cell.col - entryCell.col) <= band
}

function getResidentialPlacementAmenityScore(
  program: ProgramPlacement,
  cell: GridCell,
  entryCell: GridCell | null,
  owners: number[][],
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  if (!shouldUseResidentialAmenityPlacement(request)) return 0

  let score = 0
  const occupiedNeighborPrograms = getOrthogonalNeighbors(cell, grid)
    .map((neighbor) => owners[neighbor.row]?.[neighbor.col] ?? -1)
    .filter((owner) => owner >= 0)
    .map((owner) => programs.find((candidate) => candidate.sourceIndex === owner) ?? null)
    .filter((programEntry): programEntry is ProgramPlacement => Boolean(programEntry))

  if (!entryCell) {
    if (
      (program.key === 'entry' || program.key === 'reception') &&
      grid.rows >= 3 &&
      cell.row === 0 &&
      cell.col > 0 &&
      cell.col < grid.cols - 1
    ) {
      score += 8
    }

    return score
  }

  const distanceToEntry = getGridDistance(cell, entryCell)
  const onEntryAxis = isCellOnResidentialEntryViewAxis(cell, entryCell, grid)
  const directlyBehindEntry = cell.row === entryCell.row + 1 && onEntryAxis
  const nearEntryFront = onEntryAxis && cell.row <= entryCell.row + 1
  const hasEntryNeighbor = occupiedNeighborPrograms.some(
    (neighborProgram) => neighborProgram.key === 'entry' || neighborProgram.key === 'reception',
  )
  const hasProtectedNeighbor = occupiedNeighborPrograms.some(
    (neighborProgram) =>
      neighborProgram.key === 'corridor' ||
      neighborProgram.key === 'stairs' ||
      neighborProgram.key === 'elevator' ||
      neighborProgram.accessClass === 'private',
  )

  if (isResidentialAmenityBufferProgram(program)) {
    if (directlyBehindEntry) score += 24
    else if (onEntryAxis && cell.row === entryCell.row + 2) score += 12
    if (distanceToEntry <= 2) score += 8
    if (hasEntryNeighbor) score += 10
  }

  if (program.key === 'kitchen' || program.key === 'pantry') {
    if (distanceToEntry <= 2) score += 6
    if (directlyBehindEntry) score -= 8
  }

  if (program.key === 'bathroom') {
    if (nearEntryFront) score -= 120
    else if (onEntryAxis && cell.row <= entryCell.row + 2) score -= 56
    if (distanceToEntry <= 1) score -= 40
    if (hasProtectedNeighbor) score += 8
  } else if (program.accessClass === 'private') {
    if (nearEntryFront) score -= 54
    else if (distanceToEntry <= 1) score -= 18
  } else if (
    program.accessClass === 'service' &&
    program.key !== 'kitchen' &&
    program.key !== 'pantry'
  ) {
    if (nearEntryFront) score -= 26
  }

  return score
}

function getBasePositionScore(
  program: ProgramPlacement,
  southness: number,
  northness: number,
  centerness: number,
  sideness: number,
  request: ProgramDrivenLayoutRequest,
) {
  let score = 0

  if (program.key === 'entry' || program.key === 'reception' || program.key === 'cashier') {
    score += southness * 20 + centerness * 12 + northness * 2
  } else if (
    program.key === 'living_room' ||
    program.key === 'open_office' ||
    program.key === 'display_area' ||
    program.key === 'retail_area'
  ) {
    score += southness * 8 + northness * 10 + centerness * 16 + sideness * 2
  } else if (program.key === 'dining_room' || program.key === 'meeting_room') {
    score += southness * 10 + northness * 6 + centerness * 10 + sideness * 4
  } else if (program.key === 'kitchen' || program.key === 'pantry') {
    score += southness * 10 + northness * 3 + centerness * 4 + sideness * 14
  } else if (
    program.key === 'primary_bedroom' ||
    program.key === 'bedroom' ||
    program.key === 'study'
  ) {
    score += southness * -4 + northness * 18 + centerness * 2 + sideness * 10
  } else if (program.key === 'bathroom') {
    score += southness * 6 + northness * 7 + centerness * -2 + sideness * 14
  } else if (
    program.key === 'garage' ||
    program.key === 'storage' ||
    program.key === 'archive' ||
    program.key === 'equipment_room' ||
    program.key === 'production'
  ) {
    score += southness * 14 + northness * -2 + centerness * -8 + sideness * 16
  } else if (program.key === 'stairs' || program.key === 'corridor' || program.key === 'elevator') {
    score += southness * 12 + northness * 6 + centerness * 8 + sideness * 4
  } else if (program.key === 'balcony' || program.key === 'courtyard') {
    score += southness * -2 + northness * 16 + centerness * 10 + sideness * 2
  } else {
    score += southness * 4 + northness * 4 + centerness * 6 + sideness * 4
  }

  if (request.variant === 'daylight') {
    if (
      program.key === 'living_room' ||
      program.key === 'dining_room' ||
      program.key === 'study' ||
      program.key === 'open_office'
    ) {
      score += northness * 8 + centerness * 3
    }
  }

  if (request.buildingType === 'shop') {
    if (program.key === 'display_area' || program.key === 'retail_area') {
      score += southness * 8 + centerness * 8
    }
    if (program.key === 'storage' || program.key === 'cashier') {
      score += southness * 6 + sideness * 8
    }
  }

  if (request.buildingType === 'office') {
    if (program.key === 'open_office') score += centerness * 8 + northness * 4
    if (program.key === 'meeting_room') score += centerness * 6 + sideness * 4
  }

  return score
}

function getEntryDistanceScore(program: ProgramPlacement, distance: number, grid: GridShape) {
  const maxDistance = grid.rows + grid.cols

  if (program.key === 'bedroom' || program.key === 'primary_bedroom' || program.key === 'study') {
    return clampNumber(distance / Math.max(maxDistance, 1), 0, 1) * 12
  }

  if (
    program.key === 'living_room' ||
    program.key === 'dining_room' ||
    program.key === 'kitchen' ||
    program.key === 'stairs' ||
    program.key === 'corridor' ||
    program.key === 'open_office' ||
    program.key === 'display_area' ||
    program.key === 'retail_area'
  ) {
    return clampNumber(1 - distance / Math.max(maxDistance, 1), 0, 1) * 10
  }

  if (program.key === 'bathroom') {
    return clampNumber(1 - distance / Math.max(maxDistance, 1), 0, 1) * 5
  }

  return 0
}

function getPublicDistanceScore(program: ProgramPlacement, distance: number, grid: GridShape) {
  const maxDistance = grid.rows + grid.cols

  if (program.key === 'kitchen' || program.key === 'dining_room' || program.key === 'pantry') {
    return clampNumber(1 - distance / Math.max(maxDistance, 1), 0, 1) * 8
  }

  if (program.key === 'bathroom') {
    return clampNumber(1 - distance / Math.max(maxDistance, 1), 0, 1) * 3
  }

  if (program.key === 'bedroom' || program.key === 'primary_bedroom' || program.key === 'study') {
    return clampNumber(distance / Math.max(maxDistance, 1), 0, 1) * 5
  }

  return 0
}

function getVerticalAlignmentScore(
  program: ProgramPlacement,
  cell: GridCell,
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
  colRatio: number,
  rowRatio: number,
) {
  const exactDistance = getBestAnchorDistance(program, request, colRatio, rowRatio, true)
  const groupDistance = getBestAnchorDistance(program, request, colRatio, rowRatio, false)
  let score = 0

  if (Number.isFinite(exactDistance)) {
    score +=
      clampNumber(1 - exactDistance / 0.68, 0, 1) *
      (requiresExactVerticalStack(program.key) ? 42 : 18)
  } else if (Number.isFinite(groupDistance)) {
    score += clampNumber(1 - groupDistance / 0.85, 0, 1) * 12
  }

  if (
    request.floorIndex > 0 &&
    requiresExactVerticalStack(program.key) &&
    !Number.isFinite(exactDistance) &&
    hasStackAnchor(program, request, false)
  ) {
    score += clampNumber(1 - groupDistance / 0.95, 0, 1) * 8
  }

  if (
    request.floorIndex > 0 &&
    (program.key === 'family_room' || program.key === 'study') &&
    cell.row === grid.rows - 1
  ) {
    score += 3
  }

  return score
}

function getBestAnchorDistance(
  program: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
  colRatio: number,
  rowRatio: number,
  exactOnly: boolean,
) {
  const anchors = getMatchingVerticalAnchors(program, request, exactOnly)
  if (anchors.length === 0) return Number.POSITIVE_INFINITY

  return anchors.reduce((best, anchor) => {
    const anchorColRatio = getAxisRatio(anchor.centerX, request.minX, request.maxX)
    const anchorRowRatio = getAxisRatio(anchor.centerZ, request.minZ, request.maxZ)
    return Math.min(best, Math.abs(anchorColRatio - colRatio) + Math.abs(anchorRowRatio - rowRatio))
  }, Number.POSITIVE_INFINITY)
}

function getAllVerticalAnchors(request: ProgramDrivenLayoutRequest) {
  const anchors = [...(request.previousFloorAnchors ?? []), ...(request.plannedAnchors ?? [])]
  const seen = new Set<string>()

  return anchors.filter((anchor) => {
    const key = [
      anchor.key,
      anchor.minX.toFixed(3),
      anchor.maxX.toFixed(3),
      anchor.minZ.toFixed(3),
      anchor.maxZ.toFixed(3),
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mergeVerticalAnchors(
  programKey: string,
  anchors: ProgramDrivenVerticalAnchor[],
): ProgramDrivenVerticalAnchor | null {
  if (anchors.length === 0) return null

  const minX = Math.min(...anchors.map((anchor) => anchor.minX))
  const maxX = Math.max(...anchors.map((anchor) => anchor.maxX))
  const minZ = Math.min(...anchors.map((anchor) => anchor.minZ))
  const maxZ = Math.max(...anchors.map((anchor) => anchor.maxZ))

  return {
    key: programKey,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    minX,
    maxX,
    minZ,
    maxZ,
  }
}

function getPrimaryExactAnchor(
  programKey: string | undefined,
  request: ProgramDrivenLayoutRequest,
) {
  if (!programKey) return null

  const exactAnchors = getAllVerticalAnchors(request).filter((anchor) => anchor.key === programKey)
  return mergeVerticalAnchors(programKey, exactAnchors)
}

function hasStackAnchor(
  program: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
  exactOnly: boolean,
) {
  return getMatchingVerticalAnchors(program, request, exactOnly).length > 0
}

function getMatchingVerticalAnchors(
  program: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
  exactOnly: boolean,
) {
  const exactAnchor = getPrimaryExactAnchor(program.key, request)
  if (exactAnchor || exactOnly) return exactAnchor ? [exactAnchor] : []

  const group = getVerticalStackGroup(program.key)
  if (!group) return []
  return getAllVerticalAnchors(request).filter(
    (anchor) => getVerticalStackGroup(anchor.key) === group,
  )
}

function getVerticalStackGroup(programKey?: string) {
  if (!programKey) return null
  if (programKey === 'bathroom' || programKey === 'kitchen' || programKey === 'pantry') return 'wet'
  if (
    programKey === 'stairs' ||
    programKey === 'elevator' ||
    programKey === 'corridor' ||
    programKey === 'storage' ||
    programKey === 'equipment_room'
  ) {
    return 'core'
  }
  return null
}

function requiresExactVerticalStack(programKey?: string) {
  return (
    programKey === 'bathroom' ||
    programKey === 'stairs' ||
    programKey === 'elevator' ||
    programKey === 'corridor'
  )
}

function requiresContainedVerticalStack(programKey?: string) {
  return programKey === 'stairs' || programKey === 'elevator'
}

function getAxisRatio(value: number, min: number, max: number) {
  return clampNumber((value - min) / Math.max(max - min, 0.001), 0, 1)
}

function getPairAdjacencyScore(left: ProgramPlacement, right: ProgramPlacement) {
  if (left.key === right.key) return 1

  if (left.rule.preferNear.includes(right.key) || right.rule.preferNear.includes(left.key)) {
    return 10
  }

  if (left.rule.avoidNear.includes(right.key) || right.rule.avoidNear.includes(left.key)) {
    return -12
  }

  const leftClass = left.accessClass
  const rightClass = right.accessClass

  if (leftClass === 'public' && rightClass === 'public') return 4
  if (leftClass === 'service' && rightClass === 'service') return 3
  if (leftClass === 'private' && rightClass === 'private') return 2
  if (leftClass === 'circulation' || rightClass === 'circulation') return 5

  return 0
}

function scoreCompletedLayout(
  programs: ProgramPlacement[],
  roomRects: Map<number, GridRect>,
  rowEdges: number[],
  colEdges: number[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const adjacency = buildRoomAdjacency(programs, roomRects)
  const residentialAmenity = getResidentialLayoutAmenity(programs, roomRects, adjacency, grid, request)
  const entryProgram = findProgramByKeys(programs, ['entry', 'reception'])
  const corridorProgram = findProgramByKeys(programs, ['corridor'])
  const publicPrograms = programs.filter(
    (program) =>
      program.accessClass === 'public' ||
      program.key === 'corridor' ||
      program.key === 'stairs' ||
      program.key === 'elevator',
  )
  const entryRoot =
    entryProgram ??
    publicPrograms.find(
      (program) => program.key === 'living_room' || program.key === 'open_office',
    ) ??
    publicPrograms[0] ??
    programs[0] ??
    null
  if (!entryRoot) return Number.NEGATIVE_INFINITY

  const distances = getGraphDistances(entryRoot.sourceIndex, adjacency)
  let score = 100

  for (const program of programs) {
    const distance = distances.get(program.sourceIndex)
    if (distance === undefined) {
      score -= 260
      continue
    }

    if (request.floorIndex === 0 && program.accessClass === 'private') {
      if (distance <= 1) score -= 24
      else if (distance === 2) score += 6
      else if (distance >= 4) score -= 6
    }

    if (program.key === 'bathroom' && distance === 0) score -= 30
    if ((program.key === 'stairs' || program.key === 'corridor') && distance <= 1) score += 8
    if (program.key === 'living_room' && distance <= 1) score += 12
    if (program.key === 'kitchen' && distance <= 2) score += 8
  }

  const entryNeighbors = adjacency.get(entryRoot.sourceIndex) ?? new Set<number>()
  if (entryProgram && publicPrograms.length > 0) {
    const hasPublicBuffer = Array.from(entryNeighbors).some((owner) => {
      const program = programs.find((candidate) => candidate.sourceIndex === owner)
      return program
        ? program.accessClass === 'public' ||
            program.key === 'corridor' ||
            program.key === 'stairs' ||
            program.key === 'elevator'
        : false
    })
    if (hasPublicBuffer) score += 18
    else score -= 42

    const privateFrontNeighbors = Array.from(entryNeighbors).filter((owner) => {
      const program = programs.find((candidate) => candidate.sourceIndex === owner)
      return program?.accessClass === 'private'
    })
    score -= privateFrontNeighbors.length * 12
  }

  if (corridorProgram) {
    const corridorRect = roomRects.get(corridorProgram.sourceIndex)
    if (corridorRect) {
      score += getCorridorBandScore(corridorRect, grid, request)
    }

    for (const program of programs) {
      if (program.key === 'corridor') continue
      const touchesCorridor = roomHasAdjacentProgram(adjacency, program, programs, ['corridor'])

      if (
        program.key === 'bathroom' ||
        program.key === 'pantry' ||
        program.key === 'archive' ||
        program.key === 'stairs' ||
        program.key === 'elevator'
      ) {
        score += touchesCorridor ? 10 : -18
      }

      if (program.key === 'meeting_room') {
        score += touchesCorridor ? 8 : -12
      }

      if (program.key === 'open_office' || program.key === 'living_room') {
        score += touchesCorridor ? 5 : -8
      }

      if (
        program.accessClass === 'service' &&
        !touchesCorridor &&
        roomHasAdjacentProgram(adjacency, program, programs, [
          'open_office',
          'living_room',
          'display_area',
          'retail_area',
        ])
      ) {
        score -= 10
      }
    }
  }

  for (const program of programs) {
    if (program.key === 'kitchen') {
      const hasDiningLink = roomHasAdjacentProgram(adjacency, program, programs, [
        'dining_room',
        'living_room',
        'pantry',
      ])
      score += hasDiningLink ? 10 : -18
    }

    if (program.key === 'primary_bedroom') {
      const hasSuiteSupport = roomHasAdjacentProgram(adjacency, program, programs, [
        'bathroom',
        'study',
        'balcony',
      ])
      score += hasSuiteSupport ? 8 : -8
    }

    if (program.key === 'bathroom') {
      const buffered = roomHasAdjacentProgram(adjacency, program, programs, [
        'bedroom',
        'primary_bedroom',
        'study',
        'corridor',
      ])
      score += buffered ? 6 : -12
    }
  }

  for (const program of programs) {
    const rect = roomRects.get(program.sourceIndex)
    if (!rect) continue
    score += getFrontZonePenalty(program, rect, grid)
    score += getCompletedLayoutStackScore(program, rect, rowEdges, colEdges, grid, request)
    score += getGeometryConstraintScore(program, rect, rowEdges, colEdges)
  }

  if (residentialAmenity?.entryBuffer) {
    score += residentialAmenity.entryBuffer.score
  }
  for (const issue of residentialAmenity?.bathroomPrivacy.values() ?? []) {
    score += issue.score
  }

  return score
}

function getGeometryConstraintScore(
  program: ProgramPlacement,
  rect: GridRect,
  rowEdges: number[],
  colEdges: number[],
) {
  const width = Math.max(0.1, colEdges[rect.maxCol + 1]! - colEdges[rect.minCol]!)
  const depth = Math.max(0.1, rowEdges[rect.maxRow + 1]! - rowEdges[rect.minRow]!)
  const area = width * depth
  const minSpan = Math.min(width, depth)
  const maxSpan = Math.max(width, depth)
  const aspectRatio = maxSpan / Math.max(minSpan, 0.01)
  const { preferredMinArea, hardMinArea, maxAspectRatio, minSpan: preferredMinSpan } = program.rule
  const targetArea = Math.max(hardMinArea, program.targetArea)
  const areaTolerance = Math.max(
    1.35,
    targetArea *
      (program.accessClass === 'public'
        ? 0.28
        : program.accessClass === 'circulation'
          ? 0.24
          : 0.2),
  )
  let score = 0

  if (area < hardMinArea) {
    score -= 170 * (1 + (hardMinArea - area) / Math.max(hardMinArea, 0.1))
  } else if (area < preferredMinArea) {
    score -= 42 * ((preferredMinArea - area) / Math.max(preferredMinArea, 0.1))
  }

  const areaDelta = Math.abs(area - targetArea)
  if (areaDelta <= areaTolerance) {
    score += clampNumber(1 - areaDelta / Math.max(areaTolerance, 0.1), 0, 1) * 12
  } else {
    const oversizeWeight =
      program.accessClass === 'service' ||
      program.key === 'entry' ||
      program.key === 'bathroom' ||
      program.key === 'cashier'
        ? 88
        : 56
    const areaPenalty =
      ((areaDelta - areaTolerance) / Math.max(targetArea, 0.1)) *
      (area > targetArea ? oversizeWeight : 44)
    score -= areaPenalty
  }

  if (minSpan < preferredMinSpan) {
    score -= 54 * ((preferredMinSpan - minSpan) / Math.max(preferredMinSpan, 0.1))
  }

  if (aspectRatio > maxAspectRatio) {
    const aspectOverflow = (aspectRatio - maxAspectRatio) / Math.max(maxAspectRatio, 0.1)
    score -= 78 * aspectOverflow * (1 + aspectOverflow)
  } else {
    score += clampNumber((maxAspectRatio - aspectRatio) / Math.max(maxAspectRatio, 0.1), 0, 0.4) * 4
  }

  return score
}

function buildRoomAdjacency(programs: ProgramPlacement[], roomRects: Map<number, GridRect>) {
  const adjacency = new Map<number, Set<number>>(
    programs.map((program) => [program.sourceIndex, new Set<number>()]),
  )

  for (let index = 0; index < programs.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < programs.length; nextIndex += 1) {
      const left = programs[index]
      const right = programs[nextIndex]
      if (!left || !right) continue
      const leftRect = roomRects.get(left.sourceIndex)
      const rightRect = roomRects.get(right.sourceIndex)
      if (!leftRect || !rightRect || !rectsTouch(leftRect, rightRect)) continue
      adjacency.get(left.sourceIndex)?.add(right.sourceIndex)
      adjacency.get(right.sourceIndex)?.add(left.sourceIndex)
    }
  }

  return adjacency
}

function rectsTouch(left: GridRect, right: GridRect) {
  const sharesVerticalEdge =
    (left.maxCol + 1 === right.minCol || right.maxCol + 1 === left.minCol) &&
    Math.min(left.maxRow, right.maxRow) >= Math.max(left.minRow, right.minRow)
  const sharesHorizontalEdge =
    (left.maxRow + 1 === right.minRow || right.maxRow + 1 === left.minRow) &&
    Math.min(left.maxCol, right.maxCol) >= Math.max(left.minCol, right.minCol)
  return sharesVerticalEdge || sharesHorizontalEdge
}

function getGraphDistances(startId: number, adjacency: Map<number, Set<number>>) {
  const distances = new Map<number, number>([[startId, 0]])
  const queue = [startId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) continue
    const currentDistance = distances.get(current) ?? 0
    for (const neighbor of adjacency.get(current) ?? []) {
      if (distances.has(neighbor)) continue
      distances.set(neighbor, currentDistance + 1)
      queue.push(neighbor)
    }
  }

  return distances
}

function findProgramByKeys(programs: ProgramPlacement[], keys: string[]) {
  for (const key of keys) {
    const match = programs.find((program) => program.key === key)
    if (match) return match
  }
  return null
}

function roomHasAdjacentProgram(
  adjacency: Map<number, Set<number>>,
  program: ProgramPlacement,
  programs: ProgramPlacement[],
  keys: string[],
) {
  const neighborIds = adjacency.get(program.sourceIndex) ?? new Set<number>()
  return Array.from(neighborIds).some((owner) => {
    const neighbor = programs.find((candidate) => candidate.sourceIndex === owner)
    return neighbor ? keys.includes(neighbor.key) : false
  })
}

function isResidentialLikeBuildingType(buildingType: AiBuildingType) {
  return buildingType === 'villa' || buildingType === 'residential' || buildingType === 'apartment'
}

function isResidentialEntryBufferProgram(program: ProgramPlacement) {
  return (
    program.key === 'living_room' ||
    program.key === 'dining_room' ||
    program.key === 'corridor' ||
    program.key === 'stairs' ||
    program.key === 'elevator' ||
    program.key === 'reception'
  )
}

function isResidentialPublicExposureProgram(program: ProgramPlacement) {
  return (
    program.key === 'living_room' ||
    program.key === 'dining_room' ||
    program.key === 'reception' ||
    program.key === 'corridor' ||
    program.key === 'stairs' ||
    program.key === 'elevator'
  )
}

function getRectWidthSpan(rect: GridRect) {
  return rect.maxCol - rect.minCol + 1
}

function getRectDepthSpan(rect: GridRect) {
  return rect.maxRow - rect.minRow + 1
}

function getRectCenterRatio(rect: GridRect, grid: GridShape) {
  if (grid.cols <= 1) return 0.5
  return (rect.minCol + rect.maxCol) / 2 / (grid.cols - 1)
}

function getRectColumnOverlapRatio(left: GridRect, right: GridRect) {
  const overlap =
    Math.max(0, Math.min(left.maxCol, right.maxCol) - Math.max(left.minCol, right.minCol) + 1)
  const referenceSpan = Math.max(1, Math.min(getRectWidthSpan(left), getRectWidthSpan(right)))
  return overlap / referenceSpan
}

function getResidentialLayoutAmenity(
  programs: ProgramPlacement[],
  roomRects: Map<number, GridRect>,
  adjacency: Map<number, Set<number>>,
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
): ResidentialLayoutAmenity | null {
  if (!isResidentialLikeBuildingType(request.buildingType) || request.floorIndex !== 0) {
    return null
  }

  const entryProgram = findProgramByKeys(programs, ['entry', 'reception'])
  const entryRect = entryProgram ? roomRects.get(entryProgram.sourceIndex) ?? null : null
  const bathroomIssues = new Map<
    number,
    {
      score: number
      directEntryView: boolean
      publicExposure: boolean
      frontExposure: boolean
    }
  >()

  let entryBuffer:
    | {
        score: number
        entryProgramId: number
        directViewNeighborIds: Set<number>
      }
    | null = null

  if (entryProgram && entryRect) {
    const neighborIds = Array.from(adjacency.get(entryProgram.sourceIndex) ?? new Set<number>())
    const directViewNeighborIds = new Set(
      neighborIds.filter((neighborId) => {
        const neighborRect = roomRects.get(neighborId)
        if (!neighborRect) return false
        return (
          neighborRect.minRow === entryRect.maxRow + 1 &&
          getRectColumnOverlapRatio(entryRect, neighborRect) >= 0.5
        )
      }),
    )
    const hasPublicBuffer = neighborIds.some((neighborId) => {
      const neighbor = programs.find((candidate) => candidate.sourceIndex === neighborId)
      return neighbor ? isResidentialEntryBufferProgram(neighbor) : false
    })
    const entryDepthSpan = getRectDepthSpan(entryRect)
    const entryWidthSpan = getRectWidthSpan(entryRect)
    let score = 0

    if (entryRect.minRow === 0) score += 10
    else score -= 48

    if (hasPublicBuffer) score += 18
    else score -= 34

    if (entryDepthSpan >= 2) score += 8
    else if (grid.rows >= 3 && entryWidthSpan >= Math.max(2, Math.floor(grid.cols / 2))) score -= 10

    if (
      neighborIds.some(
        (neighborId) =>
          programs.find((candidate) => candidate.sourceIndex === neighborId)?.key === 'bathroom',
      )
    ) {
      score -= 26
    }

    for (const neighborId of directViewNeighborIds) {
      const neighbor = programs.find((candidate) => candidate.sourceIndex === neighborId)
      if (!neighbor) continue

      if (neighbor.key === 'bathroom') score -= entryDepthSpan >= 2 ? 38 : 68
      else if (neighbor.accessClass === 'private') score -= entryDepthSpan >= 2 ? 18 : 34
      else if (neighbor.accessClass === 'service') score -= entryDepthSpan >= 2 ? 12 : 22
      else if (isResidentialEntryBufferProgram(neighbor)) score += entryDepthSpan >= 2 ? 10 : -6
    }

    entryBuffer = {
      score,
      entryProgramId: entryProgram.sourceIndex,
      directViewNeighborIds,
    }
  }

  for (const bathroomProgram of programs.filter((program) => program.key === 'bathroom')) {
    const rect = roomRects.get(bathroomProgram.sourceIndex)
    if (!rect) continue

    const neighborIds = Array.from(adjacency.get(bathroomProgram.sourceIndex) ?? new Set<number>())
    const frontExposure = rect.minRow === 0
    const centerRatio = getRectCenterRatio(rect, grid)
    const directEntryView = entryRect
      ? rect.minRow === entryRect.maxRow + 1 && getRectColumnOverlapRatio(rect, entryRect) >= 0.5
      : false
    const publicExposure = neighborIds.some((neighborId) => {
      const neighbor = programs.find((candidate) => candidate.sourceIndex === neighborId)
      return neighbor
        ? neighbor.key === 'entry' ||
            neighbor.key === 'reception' ||
            neighbor.key === 'living_room' ||
            neighbor.key === 'dining_room'
        : false
    })
    const hasProtectedAdjacency = neighborIds.some((neighborId) => {
      const neighbor = programs.find((candidate) => candidate.sourceIndex === neighborId)
      return neighbor
        ? neighbor.key === 'corridor' ||
            neighbor.key === 'stairs' ||
            neighbor.key === 'elevator' ||
            neighbor.key === 'bedroom' ||
            neighbor.key === 'primary_bedroom' ||
            neighbor.key === 'study'
        : false
    })
    let score = 0

    if (frontExposure) {
      score -= centerRatio > 0.25 && centerRatio < 0.75 ? 24 : 10
    }
    if (
      neighborIds.some(
        (neighborId) => programs.find((candidate) => candidate.sourceIndex === neighborId)?.key === 'entry',
      )
    ) {
      score -= 34
    }
    if (
      neighborIds.some((neighborId) => {
        const neighbor = programs.find((candidate) => candidate.sourceIndex === neighborId)
        return neighbor ? isResidentialPublicExposureProgram(neighbor) : false
      })
    ) {
      score -= 18
    }
    if (directEntryView) score -= entryRect && getRectDepthSpan(entryRect) >= 2 ? 24 : 42
    if (hasProtectedAdjacency) score += 10
    else if (publicExposure || frontExposure) score -= 12

    bathroomIssues.set(bathroomProgram.sourceIndex, {
      score,
      directEntryView,
      publicExposure,
      frontExposure,
    })
  }

  return {
    entryBuffer,
    bathroomPrivacy: bathroomIssues,
  }
}

function getFrontZonePenalty(program: ProgramPlacement, rect: GridRect, grid: GridShape) {
  const centerCol = (rect.minCol + rect.maxCol) / 2
  const centerRatio = grid.cols <= 1 ? 0.5 : centerCol / (grid.cols - 1)
  const frontTouch = rect.minRow === 0
  let score = 0

  if (frontTouch && centerRatio > 0.25 && centerRatio < 0.75) {
    if (program.key === 'bathroom') score -= 18
    if (program.key === 'garage' || program.key === 'production') score -= 22
    if (program.accessClass === 'private') score -= 14
    if (program.key === 'entry' || program.key === 'reception') score += 18
  }

  if (frontTouch && (program.key === 'stairs' || program.key === 'corridor')) {
    score += 6
  }

  return score
}

function getCorridorBandScore(
  rect: GridRect,
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const widthSpan = rect.maxCol - rect.minCol + 1
  const depthSpan = rect.maxRow - rect.minRow + 1
  const frontTouch = rect.minRow === 0
  const backTouch = rect.maxRow === grid.rows - 1
  let score = 0

  if (request.buildingType === 'office' || request.buildingType === 'hotel') {
    if (frontTouch && depthSpan === 1) score += 16
    if (widthSpan >= Math.max(2, Math.floor(grid.cols / 2))) score += 8
    if (depthSpan > 1 && widthSpan === 1) score -= 18
  }

  if (request.floorIndex > 0) {
    if ((frontTouch || backTouch) && depthSpan === 1) score += 12
    if (depthSpan > 1 && widthSpan === 1) score -= 12
  }

  return score
}

function getCompletedLayoutStackScore(
  program: ProgramPlacement,
  rect: GridRect,
  rowEdges: number[],
  colEdges: number[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const colRatio = grid.cols <= 1 ? 0.5 : (rect.minCol + rect.maxCol) / 2 / (grid.cols - 1)
  const rowRatio = grid.rows <= 1 ? 0.5 : (rect.minRow + rect.maxRow) / 2 / (grid.rows - 1)
  const exactAnchor = getBestMatchingVerticalAnchor(program, request, colRatio, rowRatio, true)
  const groupAnchor = getBestMatchingVerticalAnchor(program, request, colRatio, rowRatio, false)
  const roomBounds = getRoomBounds(rect, rowEdges, colEdges)
  let score = 0

  if (exactAnchor) {
    const exactDistance = getAnchorDistanceForBounds(roomBounds, request, exactAnchor)
    const overlapRatio = getAnchorOverlapRatio(roomBounds, exactAnchor)
    const containmentClearance = getAnchorContainmentClearance(roomBounds, exactAnchor)
    const roomArea = Math.max(
      (roomBounds.maxX - roomBounds.minX) * (roomBounds.maxZ - roomBounds.minZ),
      0.1,
    )
    const anchorArea = Math.max(
      (exactAnchor.maxX - exactAnchor.minX) * (exactAnchor.maxZ - exactAnchor.minZ),
      0.1,
    )
    const areaRatio = roomArea / anchorArea
    score +=
      clampNumber(1 - exactDistance / 0.6, 0, 1) *
      (requiresExactVerticalStack(program.key) ? 28 : 14)
    score += overlapRatio * (requiresExactVerticalStack(program.key) ? 34 : 12)
    if (requiresExactVerticalStack(program.key) && exactDistance > 0.55) score -= 150
    else if (requiresExactVerticalStack(program.key) && exactDistance > 0.34) score -= 58
    if (requiresExactVerticalStack(program.key) && overlapRatio < 0.32) score -= 110
    else if (requiresExactVerticalStack(program.key) && overlapRatio < 0.55) score -= 38
    if (requiresContainedVerticalStack(program.key)) {
      if (containmentClearance < -HARD_VERTICAL_STACK_CONTAINMENT_TOLERANCE) {
        score -= 260
      } else {
        score +=
          clampNumber(
            (containmentClearance + HARD_VERTICAL_STACK_CONTAINMENT_TOLERANCE) / 0.2,
            0,
            1,
          ) * 18
      }
    }
    if (requiresExactVerticalStack(program.key) && areaRatio > 1.28) {
      score -= 88 * ((areaRatio - 1.28) / 0.28)
    } else if (requiresExactVerticalStack(program.key)) {
      score += clampNumber(1 - Math.abs(areaRatio - 1) / 0.18, 0, 1) * 10
    }
  } else if (groupAnchor) {
    const groupDistance = getAnchorDistanceForBounds(roomBounds, request, groupAnchor)
    const overlapRatio = getAnchorOverlapRatio(roomBounds, groupAnchor)
    score += clampNumber(1 - groupDistance / 0.8, 0, 1) * 9
    score += overlapRatio * 6
  }

  return score
}

function findPlacedCellByKeys(
  programs: ProgramPlacement[],
  roomCells: Map<number, GridCell[]>,
  keys: string[],
) {
  for (const key of keys) {
    const program = programs.find((candidate) => candidate.key === key)
    const cell = program ? roomCells.get(program.sourceIndex)?.[0] : null
    if (cell) return cell
  }
  return null
}

function getOrthogonalNeighbors(cell: GridCell, grid: GridShape) {
  return [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 },
  ].filter(
    (neighbor) =>
      neighbor.row >= 0 &&
      neighbor.row < grid.rows &&
      neighbor.col >= 0 &&
      neighbor.col < grid.cols,
  )
}

function getGridDistance(left: GridCell, right: GridCell) {
  return Math.abs(left.row - right.row) + Math.abs(left.col - right.col)
}

function mergeEmptyCells(
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  let guard = grid.rows * grid.cols * 4

  while (hasEmptyCells(owners) && guard > 0) {
    guard -= 1
    let best: { owner: number; row: number; col: number; score: number } | null = null

    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        if (owners[row]?.[col] !== -1) continue

        const neighborOwners = Array.from(
          new Set(
            getOrthogonalNeighbors({ row, col }, grid)
              .map((neighbor) => owners[neighbor.row]?.[neighbor.col] ?? -1)
              .filter((owner) => owner >= 0),
          ),
        )

        for (const owner of neighborOwners) {
          const cells = roomCells.get(owner) ?? []
          if (!canExpandRoomRectangle(cells, { row, col })) continue

          const program = programs.find((candidate) => candidate.sourceIndex === owner)
          if (!program) continue

          let score = scoreCellForProgram(
            program,
            { row, col },
            owners,
            roomCells,
            programs,
            grid,
            request,
          )
          score += countAdjacentOwner(owners, { row, col }, owner, grid) * 7
          score += program.areaWeight * 5
          score -= cells.length * 3
          score += getCellAllocationFitScore(program, cells.length, grid, request)

          if (!best || score > best.score) {
            best = { owner, row, col, score }
          }
        }
      }
    }

    if (!best) return false

    owners[best.row]![best.col] = best.owner
    roomCells.get(best.owner)?.push({ row: best.row, col: best.col })
  }

  return !hasEmptyCells(owners)
}

function hasEmptyCells(owners: number[][]) {
  return owners.some((row) => row.some((owner) => owner === -1))
}

function countAdjacentOwner(owners: number[][], cell: GridCell, owner: number, grid: GridShape) {
  return getOrthogonalNeighbors(cell, grid).filter(
    (neighbor) => (owners[neighbor.row]?.[neighbor.col] ?? -1) === owner,
  ).length
}

function canExpandRoomRectangle(existingCells: GridCell[], candidate: GridCell) {
  const rect = getRectForCells([...existingCells, candidate])
  return Boolean(rect)
}

function getRectForCells(cells: GridCell[]) {
  if (cells.length === 0) return null

  const rows = cells.map((cell) => cell.row)
  const cols = cells.map((cell) => cell.col)
  const minRow = Math.min(...rows)
  const maxRow = Math.max(...rows)
  const minCol = Math.min(...cols)
  const maxCol = Math.max(...cols)

  if ((maxRow - minRow + 1) * (maxCol - minCol + 1) !== cells.length) {
    return null
  }

  const cellSet = new Set(cells.map((cell) => `${cell.row}:${cell.col}`))
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      if (!cellSet.has(`${row}:${col}`)) return null
    }
  }

  return { minRow, maxRow, minCol, maxCol } satisfies GridRect
}

function repairLayoutCandidate(
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  let currentAnalysis = analyzeLayoutState(programs, roomCells, grid, request)
  if (!currentAnalysis) return null

  const maxRepairs = Math.min(8, grid.rows * grid.cols)
  for (let attempt = 0; attempt < maxRepairs; attempt += 1) {
    let bestMove:
      | (LayoutRepairMove & { delta: number; analysis: ProgramDrivenLayoutAnalysis })
      | null = null

    for (const program of getRepairPriorityPrograms(programs, currentAnalysis, grid, request)) {
      const rect = currentAnalysis.roomRects.get(program.sourceIndex)
      if (!rect) continue

      for (const move of getRoomRepairMoves(program, rect, owners, roomCells, programs, grid, request)) {
        const nextOwners = cloneOwners(owners)
        const nextRoomCells = cloneRoomCells(roomCells)
        applyLayoutRepairMove(nextOwners, nextRoomCells, move)
        const nextAnalysis = analyzeLayoutState(programs, nextRoomCells, grid, request)
        if (!nextAnalysis) continue

        const delta: number = nextAnalysis.score - currentAnalysis.score
        if (!bestMove || delta > bestMove.delta) {
          bestMove = {
            ...move,
            delta,
            analysis: nextAnalysis,
          }
        }
      }
    }

    if (!bestMove || bestMove.delta < 3) break

    applyLayoutRepairMove(owners, roomCells, bestMove)
    currentAnalysis = bestMove.analysis
  }

  return currentAnalysis
}

function analyzeLayoutState(
  programs: ProgramPlacement[],
  roomCells: Map<number, GridCell[]>,
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const roomRects = new Map<number, GridRect>()
  for (const program of programs) {
    const rect = getRectForCells(roomCells.get(program.sourceIndex) ?? [])
    if (!rect) return null
    roomRects.set(program.sourceIndex, rect)
  }

  const rowWeights = getAxisWeights(programs, roomRects, grid.rows, 'row', request.layoutHint)
  const colWeights = getAxisWeights(programs, roomRects, grid.cols, 'col', request.layoutHint)
  const rowEdges = createWeightedBreakpoints(request.minZ, request.maxZ, rowWeights)
  const colEdges = createWeightedBreakpoints(request.minX, request.maxX, colWeights)
  const score = scoreCompletedLayout(programs, roomRects, rowEdges, colEdges, grid, request)

  return {
    roomRects,
    rowEdges,
    colEdges,
    score,
  } satisfies ProgramDrivenLayoutAnalysis
}

function getRepairPriorityPrograms(
  programs: ProgramPlacement[],
  analysis: ProgramDrivenLayoutAnalysis,
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const adjacency = buildRoomAdjacency(programs, analysis.roomRects)
  const residentialAmenity = getResidentialLayoutAmenity(
    programs,
    analysis.roomRects,
    adjacency,
    grid,
    request,
  )

  return [...programs].sort((left, right) => {
    const leftPriority = getProgramRepairPriority(
      left,
      analysis,
      grid,
      request,
      residentialAmenity,
    )
    const rightPriority = getProgramRepairPriority(
      right,
      analysis,
      grid,
      request,
      residentialAmenity,
    )
    if (leftPriority !== rightPriority) return rightPriority - leftPriority
    return left.sourceIndex - right.sourceIndex
  })
}

function getProgramRepairPriority(
  program: ProgramPlacement,
  analysis: ProgramDrivenLayoutAnalysis,
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
  residentialAmenity?: ResidentialLayoutAmenity | null,
) {
  const rect = analysis.roomRects.get(program.sourceIndex)
  if (!rect) return 0

  const widthCells = rect.maxCol - rect.minCol + 1
  const depthCells = rect.maxRow - rect.minRow + 1
  const spanCells = Math.min(widthCells, depthCells)
  const aspectCells = Math.max(widthCells, depthCells) / Math.max(spanCells, 1)
  const targetCellCount =
    (program.targetArea /
      Math.max((request.maxX - request.minX) * (request.maxZ - request.minZ), 0.1)) *
    grid.rows *
    grid.cols
  const currentCellCount = widthCells * depthCells
  let priority = Math.abs(currentCellCount - targetCellCount)

  if (aspectCells > program.rule.maxAspectRatio) {
    priority += (aspectCells - program.rule.maxAspectRatio) * 8
  }

  if (
    request.floorIndex > 0 &&
    requiresExactVerticalStack(program.key) &&
    getCompletedLayoutStackScore(
      program,
      rect,
      analysis.rowEdges,
      analysis.colEdges,
      grid,
      request,
    ) < 0
  ) {
    priority += 18
  }

  if (
    request.buildingType === 'office' &&
    (program.key === 'meeting_room' || program.key === 'reception') &&
    widthCells >= grid.cols - 1
  ) {
    priority += 12
  }

  if (
    (program.key === 'bathroom' || program.key === 'pantry' || program.key === 'archive') &&
    aspectCells > Math.max(2.6, program.rule.maxAspectRatio)
  ) {
    priority += 10
  }

  if (
    residentialAmenity?.entryBuffer &&
    residentialAmenity.entryBuffer.score < 0 &&
    (program.sourceIndex === residentialAmenity.entryBuffer.entryProgramId ||
      residentialAmenity.entryBuffer.directViewNeighborIds.has(program.sourceIndex))
  ) {
    priority += program.sourceIndex === residentialAmenity.entryBuffer.entryProgramId ? 24 : 14
  }

  const bathroomIssue = residentialAmenity?.bathroomPrivacy.get(program.sourceIndex)
  if (bathroomIssue && bathroomIssue.score < 0) {
    priority += bathroomIssue.directEntryView ? 26 : bathroomIssue.publicExposure ? 18 : 12
  }

  return priority
}

function getRoomRepairMoves(
  donor: ProgramPlacement,
  rect: GridRect,
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const moves: LayoutRepairMove[] = []
  const transferMoves = [
    getStripTransferMove(donor.sourceIndex, rect, owners, roomCells, grid, 'left'),
    getStripTransferMove(donor.sourceIndex, rect, owners, roomCells, grid, 'right'),
    getStripTransferMove(donor.sourceIndex, rect, owners, roomCells, grid, 'top'),
    getStripTransferMove(donor.sourceIndex, rect, owners, roomCells, grid, 'bottom'),
  ]

  for (const move of transferMoves) {
    if (move) moves.push(move)
  }

  for (const move of getResidentialSwapRepairMoves(donor, rect, roomCells, programs, grid, request)) {
    moves.push(move)
  }

  if (request.floorIndex > 0 && requiresExactVerticalStack(donor.key)) {
    const shiftMoves = [
      getStripShiftMove(donor.sourceIndex, rect, owners, roomCells, grid, 'left'),
      getStripShiftMove(donor.sourceIndex, rect, owners, roomCells, grid, 'right'),
      getStripShiftMove(donor.sourceIndex, rect, owners, roomCells, grid, 'top'),
      getStripShiftMove(donor.sourceIndex, rect, owners, roomCells, grid, 'bottom'),
    ]

    for (const move of shiftMoves) {
      if (move) moves.push(move)
    }
  }

  return moves
}

function getRectCellCount(rect: GridRect) {
  return (rect.maxRow - rect.minRow + 1) * (rect.maxCol - rect.minCol + 1)
}

function getRectCenterRow(rect: GridRect) {
  return (rect.minRow + rect.maxRow) / 2
}

function isResidentialSwapPairCandidate(
  donor: ProgramPlacement,
  recipient: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
) {
  if (!shouldUseResidentialAmenityPlacement(request)) return false
  if (donor.sourceIndex === recipient.sourceIndex) return false

  if (donor.key === 'bathroom') {
    return [
      'corridor',
      'stairs',
      'elevator',
      'storage',
      'archive',
      'pantry',
      'kitchen',
    ].includes(recipient.key)
  }

  if (donor.key === 'entry' || donor.key === 'reception') {
    return (
      recipient.key === 'living_room' ||
      recipient.key === 'dining_room' ||
      recipient.key === 'corridor' ||
      recipient.key === 'stairs'
    )
  }

  if (donor.accessClass === 'private') {
    return (
      recipient.key === 'living_room' ||
      recipient.key === 'dining_room' ||
      recipient.key === 'corridor' ||
      recipient.key === 'stairs' ||
      recipient.key === 'elevator' ||
      recipient.key === 'reception'
    )
  }

  return false
}

function getResidentialSwapRepairBenefit(
  donor: ProgramPlacement,
  donorRect: GridRect,
  recipient: ProgramPlacement,
  recipientRect: GridRect,
  grid: GridShape,
) {
  const donorFront = donorRect.minRow === 0
  const recipientFront = recipientRect.minRow === 0
  const donorCenterRatio = getRectCenterRatio(donorRect, grid)
  const recipientCenterRatio = getRectCenterRatio(recipientRect, grid)
  const donorCenterRow = getRectCenterRow(donorRect)
  const recipientCenterRow = getRectCenterRow(recipientRect)
  const cellCountRatio =
    Math.max(getRectCellCount(donorRect), getRectCellCount(recipientRect)) /
    Math.max(1, Math.min(getRectCellCount(donorRect), getRectCellCount(recipientRect)))
  let score = 0

  if (donor.key === 'bathroom') {
    score += (recipientCenterRow - donorCenterRow) * 18
    if (donorFront && !recipientFront) score += 12
    if (donorCenterRatio > 0.25 && donorCenterRatio < 0.75) score += 8
    if (!(recipientCenterRatio > 0.25 && recipientCenterRatio < 0.75)) score += 5
    if (recipient.key === 'corridor' || recipient.key === 'stairs' || recipient.key === 'elevator') {
      score += 10
    } else if (
      recipient.key === 'storage' ||
      recipient.key === 'archive' ||
      recipient.key === 'pantry'
    ) {
      score += 7
    } else if (recipient.key === 'kitchen') {
      score += 4
    }
  } else if (donor.key === 'entry' || donor.key === 'reception') {
    score += (donorCenterRow - recipientCenterRow) * 20
    if (!donorFront && recipientFront) score += 16
    if (recipient.key === 'living_room' || recipient.key === 'dining_room') score += 6
    if (recipient.key === 'corridor' || recipient.key === 'stairs') score += 4
  } else if (donor.accessClass === 'private') {
    score += (recipientCenterRow - donorCenterRow) * 14
    if (donorFront && !recipientFront) score += 10
    if (donorCenterRatio > 0.25 && donorCenterRatio < 0.75) score += 6
    if (recipient.key === 'corridor' || recipient.key === 'stairs' || recipient.key === 'elevator') {
      score += 7
    } else if (recipient.key === 'living_room' || recipient.key === 'dining_room') {
      score += 5
    }
  }

  if (cellCountRatio > 2.6) score -= 22
  else if (cellCountRatio > 1.8) score -= 8

  return score
}

function getResidentialSwapRepairMoves(
  donor: ProgramPlacement,
  rect: GridRect,
  roomCells: Map<number, GridCell[]>,
  programs: ProgramPlacement[],
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
): SwapMove[] {
  if (!shouldUseResidentialAmenityPlacement(request)) return []

  const donorCells = roomCells.get(donor.sourceIndex) ?? []
  if (donorCells.length === 0) return []

  return programs
    .filter((recipient) => isResidentialSwapPairCandidate(donor, recipient, request))
    .flatMap((recipient) => {
      const recipientCells = roomCells.get(recipient.sourceIndex) ?? []
      const recipientRect = getRectForCells(recipientCells)
      if (!recipientRect || recipientCells.length === 0) return []

      const benefit = getResidentialSwapRepairBenefit(donor, rect, recipient, recipientRect, grid)
      if (benefit <= 0) return []

      return [
        {
          kind: 'swap',
          leftId: donor.sourceIndex,
          rightId: recipient.sourceIndex,
          leftCells: donorCells.map((cell) => ({ ...cell })),
          rightCells: recipientCells.map((cell) => ({ ...cell })),
        } satisfies SwapMove,
      ]
    })
    .sort((left, right) => {
      const leftRecipient = programs.find((program) => program.sourceIndex === left.rightId) ?? null
      const rightRecipient = programs.find((program) => program.sourceIndex === right.rightId) ?? null
      const leftRect = getRectForCells(left.rightCells)
      const rightRect = getRectForCells(right.rightCells)
      if (!leftRecipient || !rightRecipient || !leftRect || !rightRect) return 0

      return (
        getResidentialSwapRepairBenefit(donor, rect, rightRecipient, rightRect, grid) -
        getResidentialSwapRepairBenefit(donor, rect, leftRecipient, leftRect, grid)
      )
    })
    .slice(0, 4)
}

function getStripTransferMove(
  donorId: number,
  rect: GridRect,
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  grid: GridShape,
  side: StripTransferSide,
): StripTransferMove | null {
  const stripCells = getStripCells(rect, side)
  if (stripCells.length === 0) return null

  const donorCells = roomCells.get(donorId) ?? []
  const remainingCells = donorCells.filter(
    (cell) =>
      !stripCells.some((stripCell) => stripCell.row === cell.row && stripCell.col === cell.col),
  )
  if (!getRectForCells(remainingCells)) return null

  const recipientIds = new Set<number>()
  for (const cell of stripCells) {
    const neighbor = getOutsideNeighbor(cell, side)
    if (
      neighbor.row < 0 ||
      neighbor.row >= grid.rows ||
      neighbor.col < 0 ||
      neighbor.col >= grid.cols
    ) {
      return null
    }
    const recipientId = owners[neighbor.row]?.[neighbor.col] ?? -1
    if (recipientId < 0 || recipientId === donorId) return null
    recipientIds.add(recipientId)
  }

  if (recipientIds.size !== 1) return null
  const recipientId = Array.from(recipientIds)[0]!
  const expandedRecipient = [...(roomCells.get(recipientId) ?? []), ...stripCells]
  if (!getRectForCells(expandedRecipient)) return null

  return {
    kind: 'transfer',
    donorId,
    recipientId,
    side,
    stripCells,
  }
}

function getStripShiftMove(
  ownerId: number,
  rect: GridRect,
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  grid: GridShape,
  direction: StripTransferSide,
): StripShiftMove | null {
  const incomingCells = getIncomingStripCells(rect, direction)
  const outgoingCells = getStripCells(rect, getOppositeSide(direction))
  if (incomingCells.length === 0 || outgoingCells.length === 0) return null

  const incomingDonorIds = new Set<number>()
  for (const cell of incomingCells) {
    if (cell.row < 0 || cell.row >= grid.rows || cell.col < 0 || cell.col >= grid.cols) {
      return null
    }
    const owner = owners[cell.row]?.[cell.col] ?? -1
    if (owner < 0 || owner === ownerId) return null
    incomingDonorIds.add(owner)
  }
  if (incomingDonorIds.size !== 1) return null

  const outgoingRecipientIds = new Set<number>()
  for (const cell of outgoingCells) {
    const neighbor = getOutsideNeighbor(cell, getOppositeSide(direction))
    if (
      neighbor.row < 0 ||
      neighbor.row >= grid.rows ||
      neighbor.col < 0 ||
      neighbor.col >= grid.cols
    ) {
      return null
    }
    const owner = owners[neighbor.row]?.[neighbor.col] ?? -1
    if (owner < 0 || owner === ownerId) return null
    outgoingRecipientIds.add(owner)
  }
  if (outgoingRecipientIds.size !== 1) return null

  const incomingDonorId = Array.from(incomingDonorIds)[0]!
  const outgoingRecipientId = Array.from(outgoingRecipientIds)[0]!
  const ownerCells = roomCells.get(ownerId) ?? []
  const incomingDonorCells = roomCells.get(incomingDonorId) ?? []
  const outgoingRecipientCells = roomCells.get(outgoingRecipientId) ?? []
  const outgoingKey = new Set(outgoingCells.map((cell) => `${cell.row}:${cell.col}`))
  const incomingKey = new Set(incomingCells.map((cell) => `${cell.row}:${cell.col}`))

  if (
    !getRectForCells(
      ownerCells
        .filter((cell) => !outgoingKey.has(`${cell.row}:${cell.col}`))
        .concat(incomingCells),
    )
  ) {
    return null
  }

  if (
    !getRectForCells(
      incomingDonorCells.filter((cell) => !incomingKey.has(`${cell.row}:${cell.col}`)),
    )
  ) {
    return null
  }

  if (
    incomingDonorId === outgoingRecipientId
      ? !getRectForCells(
          incomingDonorCells
            .filter((cell) => !incomingKey.has(`${cell.row}:${cell.col}`))
            .concat(outgoingCells),
        )
      : !getRectForCells([...outgoingRecipientCells, ...outgoingCells])
  ) {
    return null
  }

  return {
    kind: 'shift',
    ownerId,
    direction,
    incomingDonorId,
    outgoingRecipientId,
    incomingCells,
    outgoingCells,
  }
}

function getStripCells(rect: GridRect, side: StripTransferSide) {
  if (side === 'left') {
    return Array.from({ length: rect.maxRow - rect.minRow + 1 }, (_, index) => ({
      row: rect.minRow + index,
      col: rect.minCol,
    }))
  }

  if (side === 'right') {
    return Array.from({ length: rect.maxRow - rect.minRow + 1 }, (_, index) => ({
      row: rect.minRow + index,
      col: rect.maxCol,
    }))
  }

  if (side === 'top') {
    return Array.from({ length: rect.maxCol - rect.minCol + 1 }, (_, index) => ({
      row: rect.minRow,
      col: rect.minCol + index,
    }))
  }

  return Array.from({ length: rect.maxCol - rect.minCol + 1 }, (_, index) => ({
    row: rect.maxRow,
    col: rect.minCol + index,
  }))
}

function getOutsideNeighbor(cell: GridCell, side: StripTransferSide) {
  if (side === 'left') return { row: cell.row, col: cell.col - 1 }
  if (side === 'right') return { row: cell.row, col: cell.col + 1 }
  if (side === 'top') return { row: cell.row - 1, col: cell.col }
  return { row: cell.row + 1, col: cell.col }
}

function getIncomingStripCells(rect: GridRect, side: StripTransferSide) {
  if (side === 'left') {
    return Array.from({ length: rect.maxRow - rect.minRow + 1 }, (_, index) => ({
      row: rect.minRow + index,
      col: rect.minCol - 1,
    }))
  }

  if (side === 'right') {
    return Array.from({ length: rect.maxRow - rect.minRow + 1 }, (_, index) => ({
      row: rect.minRow + index,
      col: rect.maxCol + 1,
    }))
  }

  if (side === 'top') {
    return Array.from({ length: rect.maxCol - rect.minCol + 1 }, (_, index) => ({
      row: rect.minRow - 1,
      col: rect.minCol + index,
    }))
  }

  return Array.from({ length: rect.maxCol - rect.minCol + 1 }, (_, index) => ({
    row: rect.maxRow + 1,
    col: rect.minCol + index,
  }))
}

function getOppositeSide(side: StripTransferSide): StripTransferSide {
  if (side === 'left') return 'right'
  if (side === 'right') return 'left'
  if (side === 'top') return 'bottom'
  return 'top'
}

function cloneOwners(owners: number[][]) {
  return owners.map((row) => [...row])
}

function cloneRoomCells(roomCells: Map<number, GridCell[]>) {
  return new Map(
    Array.from(roomCells.entries()).map(([owner, cells]) => [
      owner,
      cells.map((cell) => ({ ...cell })),
    ]),
  )
}

function applyLayoutRepairMove(
  owners: number[][],
  roomCells: Map<number, GridCell[]>,
  move: LayoutRepairMove,
) {
  if (move.kind === 'swap') {
    roomCells.set(
      move.leftId,
      move.rightCells.map((cell) => ({ ...cell })),
    )
    roomCells.set(
      move.rightId,
      move.leftCells.map((cell) => ({ ...cell })),
    )

    for (const cell of move.rightCells) {
      owners[cell.row]![cell.col] = move.leftId
    }

    for (const cell of move.leftCells) {
      owners[cell.row]![cell.col] = move.rightId
    }
    return
  }

  if (move.kind === 'transfer') {
    const stripKey = new Set(move.stripCells.map((cell) => `${cell.row}:${cell.col}`))
    const donorCells = (roomCells.get(move.donorId) ?? []).filter(
      (cell) => !stripKey.has(`${cell.row}:${cell.col}`),
    )
    const recipientCells = [...(roomCells.get(move.recipientId) ?? []), ...move.stripCells]

    roomCells.set(move.donorId, donorCells)
    roomCells.set(
      move.recipientId,
      recipientCells.map((cell) => ({ ...cell })),
    )

    for (const cell of move.stripCells) {
      owners[cell.row]![cell.col] = move.recipientId
    }
    return
  }

  const incomingKey = new Set(move.incomingCells.map((cell) => `${cell.row}:${cell.col}`))
  const outgoingKey = new Set(move.outgoingCells.map((cell) => `${cell.row}:${cell.col}`))
  const ownerCells = (roomCells.get(move.ownerId) ?? [])
    .filter((cell) => !outgoingKey.has(`${cell.row}:${cell.col}`))
    .concat(move.incomingCells)
  const incomingDonorCells = (roomCells.get(move.incomingDonorId) ?? []).filter(
    (cell) => !incomingKey.has(`${cell.row}:${cell.col}`),
  )
  const outgoingRecipientCells =
    move.incomingDonorId === move.outgoingRecipientId
      ? incomingDonorCells.concat(move.outgoingCells)
      : [...(roomCells.get(move.outgoingRecipientId) ?? []), ...move.outgoingCells]

  roomCells.set(
    move.ownerId,
    ownerCells.map((cell) => ({ ...cell })),
  )
  roomCells.set(move.incomingDonorId, incomingDonorCells)
  roomCells.set(
    move.outgoingRecipientId,
    outgoingRecipientCells.map((cell) => ({ ...cell })),
  )

  for (const cell of move.incomingCells) {
    owners[cell.row]![cell.col] = move.ownerId
  }

  for (const cell of move.outgoingCells) {
    owners[cell.row]![cell.col] = move.outgoingRecipientId
  }
}

function getAxisWeights(
  programs: ProgramPlacement[],
  roomRects: Map<number, GridRect>,
  count: number,
  axis: 'row' | 'col',
  layoutHint?: ProgramDrivenGridLayoutHint | null,
) {
  const weights = Array.from({ length: count }, () => 0)
  const useCoreBandAggregation =
    layoutHint?.axis === 'depth' &&
    programs.some((program) => program.key === 'corridor') &&
    programs.some(
      (program) =>
        program.key === 'open_office' ||
        program.key === 'meeting_room' ||
        program.key === 'reception',
    )

  for (const program of programs) {
    const rect = roomRects.get(program.sourceIndex)
    if (!rect) continue

    const start = axis === 'row' ? rect.minRow : rect.minCol
    const end = axis === 'row' ? rect.maxRow : rect.maxCol
    const span = end - start + 1
    const contribution = Math.max(0.45, program.targetArea / Math.max(span, 1))

    for (let index = start; index <= end; index += 1) {
      if (useCoreBandAggregation) {
        weights[index] = Math.max(weights[index] ?? 0, contribution)
      } else {
        weights[index] = (weights[index] ?? 0) + contribution
      }
    }
  }

  const fittedSpans = fitLayoutHintSpansToAxis(layoutHint, axis, count)
  if (fittedSpans.length === count) {
    const averageWeight = weights.reduce((sum, weight) => sum + weight, 0) / Math.max(count, 1)
    const totalHintWeight = fittedSpans.reduce((sum, weight) => sum + weight, 0)

    for (let index = 0; index < count; index += 1) {
      const hintWeight =
        ((fittedSpans[index] ?? 0) / Math.max(totalHintWeight, 0.001)) * averageWeight * count
      weights[index] = (weights[index] ?? 0) * 0.72 + hintWeight * 0.28
    }
  }

  return weights.map((weight) => Math.max(weight, 0.55))
}

function fitLayoutHintSpansToAxis(
  layoutHint: ProgramDrivenGridLayoutHint | null | undefined,
  axis: 'row' | 'col',
  count: number,
) {
  const expectedAxis = axis === 'row' ? 'depth' : 'width'
  if (!layoutHint || layoutHint.axis !== expectedAxis || layoutHint.spans.length === 0) return []

  let result = layoutHint.spans.slice()

  while (result.length < count) {
    let splitIndex = 0

    for (let index = 1; index < result.length; index += 1) {
      if (result[index]! > result[splitIndex]!) {
        splitIndex = index
      }
    }

    const value = result[splitIndex]!
    result.splice(splitIndex, 1, value / 2, value / 2)
  }

  if (result.length === count) return result

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * result.length) / count)
    const end = Math.floor(((index + 1) * result.length) / count)
    return result.slice(start, Math.max(start + 1, end)).reduce((sum, value) => sum + value, 0)
  })
}

function createWeightedBreakpoints(min: number, max: number, weights: number[]) {
  if (weights.length === 0) return [min, max]
  if (weights.length === 1) return [min, max]

  const range = max - min
  const total = weights.reduce((sum, value) => sum + value, 0)
  const minSegment =
    range / weights.length >= MIN_ROOM_SPAN ? MIN_ROOM_SPAN : range / weights.length
  const breakpoints = [min]
  let walked = 0

  for (let index = 0; index < weights.length - 1; index += 1) {
    walked += weights[index]!
    const raw = min + (range * walked) / Math.max(total, 0.001)
    const minEdge = breakpoints[breakpoints.length - 1]! + minSegment
    const remainingSegments = weights.length - index - 1
    const maxEdge = max - remainingSegments * minSegment
    breakpoints.push(clampNumber(raw, minEdge, maxEdge))
  }

  breakpoints.push(max)
  return breakpoints
}

function createPartitionWalls(
  owners: number[][],
  colEdges: number[],
  rowEdges: number[],
  partitionName: string,
) {
  const walls: ProgramDrivenWallPlan[] = []

  for (let col = 0; col < colEdges.length - 2; col += 1) {
    let startRow = -1
    let previousPair = ''

    for (let row = 0; row < owners.length; row += 1) {
      const leftOwner = owners[row]?.[col] ?? -1
      const rightOwner = owners[row]?.[col + 1] ?? -1
      const pairKey = leftOwner !== rightOwner ? `${leftOwner}:${rightOwner}` : ''

      if (pairKey && pairKey === previousPair) continue

      if (startRow >= 0 && previousPair) {
        walls.push({
          key: `zone-v-${col}-${startRow}`,
          name: partitionName,
          start: [colEdges[col + 1]!, rowEdges[startRow]!],
          end: [colEdges[col + 1]!, rowEdges[row]!],
          role: 'inner',
        })
      }

      startRow = pairKey ? row : -1
      previousPair = pairKey
    }

    if (startRow >= 0 && previousPair) {
      walls.push({
        key: `zone-v-${col}-${startRow}-end`,
        name: partitionName,
        start: [colEdges[col + 1]!, rowEdges[startRow]!],
        end: [colEdges[col + 1]!, rowEdges[owners.length]!],
        role: 'inner',
      })
    }
  }

  for (let row = 0; row < rowEdges.length - 2; row += 1) {
    let startCol = -1
    let previousPair = ''

    for (let col = 0; col < owners[row]!.length; col += 1) {
      const lowerOwner = owners[row]?.[col] ?? -1
      const upperOwner = owners[row + 1]?.[col] ?? -1
      const pairKey = lowerOwner !== upperOwner ? `${lowerOwner}:${upperOwner}` : ''

      if (pairKey && pairKey === previousPair) continue

      if (startCol >= 0 && previousPair) {
        walls.push({
          key: `zone-h-${row}-${startCol}`,
          name: partitionName,
          start: [colEdges[startCol]!, rowEdges[row + 1]!],
          end: [colEdges[col]!, rowEdges[row + 1]!],
          role: 'inner',
        })
      }

      startCol = pairKey ? col : -1
      previousPair = pairKey
    }

    if (startCol >= 0 && previousPair) {
      walls.push({
        key: `zone-h-${row}-${startCol}-end`,
        name: partitionName,
        start: [colEdges[startCol]!, rowEdges[row + 1]!],
        end: [colEdges[owners[row]!.length]!, rowEdges[row + 1]!],
        role: 'inner',
      })
    }
  }

  return walls.filter((wall) => {
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    return length >= 0.2
  })
}

function getProgramTargetAreas(
  programs: Array<Omit<ProgramPlacement, 'targetArea'>>,
  totalArea: number,
) {
  const totalHardMinArea = programs.reduce((sum, program) => sum + program.rule.hardMinArea, 0)
  const totalPreferredArea = programs.reduce(
    (sum, program) => sum + program.rule.preferredMinArea,
    0,
  )

  if (totalArea <= totalHardMinArea) {
    const scale = totalArea / Math.max(totalHardMinArea, 0.1)
    return new Map(
      programs.map((program) => [
        program.sourceIndex,
        Math.max(program.rule.hardMinArea * scale, 0.1),
      ]),
    )
  }

  if (totalArea <= totalPreferredArea) {
    const compression = totalPreferredArea - totalArea
    const totalFlexArea = programs.reduce(
      (sum, program) => sum + Math.max(program.rule.preferredMinArea - program.rule.hardMinArea, 0),
      0,
    )

    return new Map(
      programs.map((program) => {
        const flex = Math.max(program.rule.preferredMinArea - program.rule.hardMinArea, 0)
        const shrink =
          totalFlexArea > 0
            ? compression * (flex / totalFlexArea)
            : compression / Math.max(programs.length, 1)
        return [
          program.sourceIndex,
          Math.max(program.rule.hardMinArea, program.rule.preferredMinArea - shrink),
        ]
      }),
    )
  }

  const extraArea = totalArea - totalPreferredArea
  const totalGrowthWeight = programs.reduce(
    (sum, program) => sum + Math.max(program.areaWeight - TARGET_AREA_GROWTH_THRESHOLD, 0),
    0,
  )
  const fallbackGrowthWeight = programs.reduce((sum, program) => sum + program.areaWeight, 0)

  return new Map(
    programs.map((program) => {
      const growthWeight =
        totalGrowthWeight > 0
          ? Math.max(program.areaWeight - TARGET_AREA_GROWTH_THRESHOLD, 0)
          : program.areaWeight
      const growthShare =
        growthWeight /
        Math.max(totalGrowthWeight > 0 ? totalGrowthWeight : fallbackGrowthWeight, 0.1)
      return [program.sourceIndex, program.rule.preferredMinArea + extraArea * growthShare]
    }),
  )
}

function getProgramTargetAreaCap(program: Omit<ProgramPlacement, 'targetArea'>) {
  const preferred = program.rule.preferredMinArea

  if (program.key === 'bathroom' || program.key === 'cashier') {
    return preferred * 1.45
  }

  if (program.key === 'stairs' || program.key === 'elevator' || program.key === 'corridor') {
    return preferred * 1.55
  }

  if (
    program.key === 'entry' ||
    program.key === 'pantry' ||
    program.key === 'archive' ||
    program.key === 'storage'
  ) {
    return preferred * 1.7
  }

  if (
    program.key === 'meeting_room' ||
    program.key === 'dining_room' ||
    program.key === 'bedroom' ||
    program.key === 'study'
  ) {
    return preferred * 2.1
  }

  if (program.key === 'primary_bedroom') {
    return preferred * 2.4
  }

  if (
    program.key === 'living_room' ||
    program.key === 'open_office' ||
    program.key === 'display_area' ||
    program.key === 'retail_area'
  ) {
    return preferred * 2.9
  }

  return preferred * 2
}

function getCellAllocationFitScore(
  program: ProgramPlacement,
  currentCellCount: number,
  grid: GridShape,
  request: ProgramDrivenLayoutRequest,
) {
  const totalArea = (request.maxX - request.minX) * (request.maxZ - request.minZ)
  const idealCellCount = Math.max(
    1,
    (program.targetArea / Math.max(totalArea, 0.1)) * grid.rows * grid.cols,
  )
  const currentError = Math.abs(currentCellCount - idealCellCount)
  const expandedError = Math.abs(currentCellCount + 1 - idealCellCount)
  const currentOverflow = Math.max(0, currentCellCount - idealCellCount)
  const expandedOverflow = Math.max(0, currentCellCount + 1 - idealCellCount)
  return (
    (currentError - expandedError) * 34 -
    (expandedOverflow * expandedOverflow - currentOverflow * currentOverflow) * 52
  )
}

function getBestMatchingVerticalAnchor(
  program: ProgramPlacement,
  request: ProgramDrivenLayoutRequest,
  colRatio: number,
  rowRatio: number,
  exactOnly: boolean,
) {
  const anchors = getMatchingVerticalAnchors(program, request, exactOnly)
  if (anchors.length === 0) return null

  return (
    anchors.reduce<{ anchor: ProgramDrivenVerticalAnchor; distance: number } | null>(
      (best, anchor) => {
        const anchorColRatio = getAxisRatio(anchor.centerX, request.minX, request.maxX)
        const anchorRowRatio = getAxisRatio(anchor.centerZ, request.minZ, request.maxZ)
        const distance = Math.abs(anchorColRatio - colRatio) + Math.abs(anchorRowRatio - rowRatio)
        if (!best || distance < best.distance) {
          return { anchor, distance }
        }
        return best
      },
      null,
    )?.anchor ?? null
  )
}

function getRoomBounds(rect: GridRect, rowEdges: number[], colEdges: number[]) {
  return {
    minX: colEdges[rect.minCol]!,
    maxX: colEdges[rect.maxCol + 1]!,
    minZ: rowEdges[rect.minRow]!,
    maxZ: rowEdges[rect.maxRow + 1]!,
  }
}

function getAnchorDistanceForBounds(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  request: ProgramDrivenLayoutRequest,
  anchor: ProgramDrivenVerticalAnchor,
) {
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const centerColRatio = getAxisRatio(centerX, request.minX, request.maxX)
  const centerRowRatio = getAxisRatio(centerZ, request.minZ, request.maxZ)
  const anchorColRatio = getAxisRatio(anchor.centerX, request.minX, request.maxX)
  const anchorRowRatio = getAxisRatio(anchor.centerZ, request.minZ, request.maxZ)
  return Math.abs(centerColRatio - anchorColRatio) + Math.abs(centerRowRatio - anchorRowRatio)
}

function getAnchorOverlapRatio(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  anchor: ProgramDrivenVerticalAnchor,
) {
  const overlapWidth = Math.max(
    0,
    Math.min(bounds.maxX, anchor.maxX) - Math.max(bounds.minX, anchor.minX),
  )
  const overlapDepth = Math.max(
    0,
    Math.min(bounds.maxZ, anchor.maxZ) - Math.max(bounds.minZ, anchor.minZ),
  )
  const overlapArea = overlapWidth * overlapDepth
  const boundsArea = Math.max((bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ), 0.01)
  const anchorArea = Math.max((anchor.maxX - anchor.minX) * (anchor.maxZ - anchor.minZ), 0.01)
  return overlapArea / Math.max(boundsArea, anchorArea)
}

function getAnchorContainmentClearance(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  anchor: ProgramDrivenVerticalAnchor,
) {
  return Math.min(
    anchor.minX - bounds.minX,
    bounds.maxX - anchor.maxX,
    anchor.minZ - bounds.minZ,
    bounds.maxZ - anchor.maxZ,
  )
}

function hasHardVerticalStackViolations(
  programs: ProgramPlacement[],
  roomRects: Map<number, GridRect>,
  rowEdges: number[],
  colEdges: number[],
  request: ProgramDrivenLayoutRequest,
) {
  for (const program of programs) {
    if (!requiresContainedVerticalStack(program.key)) continue
    const rect = roomRects.get(program.sourceIndex)
    if (!rect) return true

    const roomBounds = getRoomBounds(rect, rowEdges, colEdges)
    const exactAnchor = getPrimaryExactAnchor(program.key, request)
    if (!exactAnchor) continue

    if (
      getAnchorContainmentClearance(roomBounds, exactAnchor) <
      -HARD_VERTICAL_STACK_CONTAINMENT_TOLERANCE
    ) {
      return true
    }
  }

  return false
}
