'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type AssetInput,
  BuildingNode,
  CeilingNode,
  DoorNode,
  FenceNode,
  ItemNode,
  LevelNode,
  type MaterialSchema,
  RoofNode,
  RoofSegmentNode,
  resolveLevelId,
  SlabNode,
  StairNode,
  StairSegmentNode,
  pointInPolygon,
  useScene,
  WallNode,
  WindowNode,
  ZoneNode,
} from '@pascal-app/core'
import {
  type AiAnalysisIssueCode,
  type AiDaylightTag,
  type AiHouseholdBrief,
  createAiAnalysisIssue,
  createAiAnalysisSnapshot,
  getGridMeasurementSummaryForSelection,
  getSavedGridMeasurementGroups,
  getSiteSetbackRules,
  type SiteSetbackRules,
  useEditor,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import {
  createProgramDrivenRoomLayout,
  type ProgramDrivenVerticalAnchor,
} from './ai-building-room-layout'
import {
  type AiConstraintEvaluation,
  type AiFengShuiAdvisory,
  evaluateAiLayoutConstraints,
} from './ai-scoring'

export type AiBuildingLanguage = 'zh-CN' | 'en'
export type AiBuildingType = 'villa' | 'residential' | 'apartment' | 'shop' | 'office' | 'hotel'
export type AiBuildingStyle = 'modern' | 'newChinese' | 'minimal'
export type AiBuildingVariant = 'balanced' | 'courtyard' | 'daylight'

export type AiBuildingRequestedSpace = {
  key: string
  label?: string
  count: number
}

export type AiBuildingFormState = {
  buildingType: AiBuildingType
  style: AiBuildingStyle
  variant: AiBuildingVariant
  floors: number
  width: number
  depth: number
  prompt: string
  requestedSpaces?: AiBuildingRequestedSpace[]
}

export type AiBuildingMassingIntent = {
  asymmetry: boolean
  cantilever: boolean
  setbacks: boolean
  roofTerrace: boolean
  courtyard: boolean
  grandEntrance: boolean
  largeGlazing: boolean
}

type AiBuildingFeatureIntent = {
  roof: boolean
  ceiling: boolean
  stairs: boolean
  courtyard: boolean
  pool: boolean
  fencedGarden: boolean
  garage: boolean
  landscape: boolean
  furnish: boolean
  kitchen: boolean
  bathroom: boolean
  bedroom: boolean
  living: boolean
  terrace: boolean
}

export type AiBuildingBrief = {
  id: string
  title: string
  briefText: string
  designIntent: string
  massing: AiBuildingMassingIntent
  mustHave: string[]
  avoid: string[]
  floorProgram: string[]
  normalizedForm: AiBuildingFormState
}

type Point2D = [number, number]
type Point3D = [number, number, number]
type PlanRoomPrivacyClass =
  | 'public'
  | 'semi-private'
  | 'private'
  | 'service'
  | 'outdoor'
  | 'unknown'

type AiBuildingAssetId =
  | 'bathroom-sink'
  | 'bathtub'
  | 'bedside-table'
  | 'closet'
  | 'coffee-table'
  | 'dining-chair'
  | 'dining-table'
  | 'double-bed'
  | 'fridge'
  | 'kitchen-counter'
  | 'lounge-chair'
  | 'palm'
  | 'parking-spot'
  | 'patio-umbrella'
  | 'shower-square'
  | 'sofa'
  | 'stove'
  | 'sunbed'
  | 'television'
  | 'tesla'
  | 'toilet'
  | 'tree'
  | 'tv-stand'

type AiBuildingRoomPlan = {
  key: string
  name: string
  programKey?: string
  color: string
  polygon: Point2D[]
}

type AiBuildingWallAxis = 'width' | 'depth'
type AiBuildingOpeningStrategy = 'grid-bay' | 'centered' | 'even'
type AiBuildingOpeningFacade = 'primary' | 'secondary' | 'interior'

type AiBuildingWallPlan = {
  key: string
  name: string
  start: Point2D
  end: Point2D
  role: 'outer' | 'inner'
  exteriorMaterial?: MaterialSchema
  interiorMaterial?: MaterialSchema
}

type AiBuildingOpeningPlan = {
  kind: 'door' | 'window'
  wallKey: string
  name: string
  localX: number
  centerY: number
  width: number
  height: number
  wallAxis?: AiBuildingWallAxis | null
  strategy?: AiBuildingOpeningStrategy
  facade?: AiBuildingOpeningFacade
}

type AiBuildingCeilingPlan = {
  key: string
  name: string
  polygon: Point2D[]
  height: number
  material?: MaterialSchema
}

type AiBuildingDetailSlabPlan = {
  key: string
  name: string
  polygon: Point2D[]
  elevation: number
  material?: MaterialSchema
}

type AiBuildingFencePlan = {
  key: string
  start: Point2D
  end: Point2D
  height: number
  color: string
  style: 'slat' | 'rail' | 'privacy'
}

type AiBuildingItemPlan = {
  key: string
  assetId: AiBuildingAssetId
  position: Point3D
  rotation?: Point3D
  scale?: Point3D
  level?: number
  roomKey?: string
  roomName?: string
  programKey?: string
}

type AiBuildingRoofPlan = {
  key: string
  roofType: 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat'
  position: Point3D
  width: number
  depth: number
  roofHeight: number
  material?: MaterialSchema
  wallMaterial?: MaterialSchema
}

type AiBuildingStairLayoutType = 'straight' | 'l-shaped' | 'u-shaped' | 'compact-switchback'
type AiBuildingStairSegmentAttachment = 'front' | 'left' | 'right'
type AiBuildingStairKnowledgeType =
  | AiBuildingStairLayoutType
  | 'winder'
  | 'curved'
  | 'spiral'
  | 'bifurcated'
type AiBuildingStairDesignKnowledge = {
  type: AiBuildingStairKnowledgeType
  labelZh: string
  labelEn: string
  suitableFor: string[]
  constraints: string[]
  modelSupport: 'segment-plan' | 'future-geometry'
}
type AiBuildingStairSegmentPlan = {
  segmentType: 'stair' | 'landing'
  width: number
  length: number
  height: number
  stepCount: number
  attachmentSide: AiBuildingStairSegmentAttachment
}

type AiBuildingStairPlan = {
  key: string
  roomKey: string
  layoutType: AiBuildingStairLayoutType
  position: Point3D
  rotation: number
  width: number
  runLength: number
  totalRise: number
  stepCount: number
  segments: AiBuildingStairSegmentPlan[]
}

export type AiBuildingFloorPlan = {
  level: number
  label: string
  rooms: AiBuildingRoomPlan[]
  walls: AiBuildingWallPlan[]
  openings: AiBuildingOpeningPlan[]
  slabPolygon: Point2D[]
  slabMaterial?: MaterialSchema
  ceilings: AiBuildingCeilingPlan[]
  detailSlabs: AiBuildingDetailSlabPlan[]
  fences: AiBuildingFencePlan[]
  items: AiBuildingItemPlan[]
  roofs: AiBuildingRoofPlan[]
  stairs: AiBuildingStairPlan[]
  wallHeight: number
}

export type AiBuildingPlan = {
  id: string
  summary: string
  footprint: {
    width: number
    depth: number
  }
  floors: AiBuildingFloorPlan[]
  analysis: AiBuildingPlanAnalysis
}

export type AiBuildingRoomRef = {
  level: number
  roomKey: string
  roomName: string
}

export type AiBuildingDiagnosticFocusRef =
  | {
      type: 'item'
      key: string
    }
  | {
      type: 'wall'
      key: string
    }
  | {
      type: 'opening'
      key: string
      openingKind: 'door' | 'window'
    }

export type AiBuildingRoomDiagnostic = AiBuildingRoomRef & {
  score: number
  status: 'good' | 'warn' | 'bad'
  optimized: boolean
  minBoundaryClearance: number | null
  focusRefs: AiBuildingDiagnosticFocusRef[]
  warnings: string[]
  highlights: string[]
}

type AiBuildingStairWalkabilityResult = {
  level: number
  roomKey: string
  roomName: string
  score: number
  width: number
  minTreadDepth: number
  maxRiserHeight: number
  maxPitchDegrees: number
  comfortFormulaMin: number
  startLandingDepth: number
  endLandingDepth: number
  startAccessClass: ReturnType<typeof getRoomAccessClass>
  endAccessClass: ReturnType<typeof getRoomAccessClass> | null
  startRouteBlocked: boolean
  endRouteBlocked: boolean
  stairWallBlocked: boolean
  startRouteWallBlocked: boolean
  endRouteWallBlocked: boolean
  startRouteSupported: boolean
  endRouteSupported: boolean
  entryRouteConnected: boolean
  upperRouteConnected: boolean
  verticalRouteIssue: boolean
  reachableUpperRoomRefs: AiBuildingRoomRef[]
  endArrivalRoomRef: AiBuildingRoomRef | null
  geometryIssue: boolean
  wallCollisionIssue: boolean
  arrivalIssue: boolean
}

type AiBuildingFloorRouteGraph = {
  floor: AiBuildingFloorPlan
  roomByKey: Map<string, AiBuildingRoomPlan>
  adjacency: Map<string, Set<string>>
  entryRoomKeys: Set<string>
  primaryRouteRoomKeys: Set<string>
  usableDestinationRoomKeys: Set<string>
}

type AiBuildingVerticalCorePlan = {
  coreId: string
  coreType: 'stairs'
  anchorsByLevel: Map<number, ProgramDrivenVerticalAnchor>
}

type AiBuildingConstructabilityIssue = {
  code:
    | 'MISSING_STAIR_ROOM'
    | 'MISSING_STAIR_TRANSITION'
    | 'STAIR_OUTSIDE_STAIR_ROOM'
    | 'STAIR_SOLID_WALL_CONFLICT'
    | 'ROOM_DOOR_MISSING'
    | 'ROOM_ENCLOSURE_INCOMPLETE'
    | 'ROOM_UNREACHABLE'
  level: number
  roomKey?: string
  roomName?: string
  message: string
}

export type AiBuildingConstructabilityValidation = {
  passed: boolean
  issues: AiBuildingConstructabilityIssue[]
  message: string | null
}

export type AiBuildingRuleViolationSummary = {
  code: AiAnalysisIssueCode
  severity: 'error' | 'warning'
  message: string
  roomRefs: AiBuildingRoomRef[]
}

export type AiBuildingRepairSummary = {
  key: string
  status: 'resolved' | 'active' | 'watch'
  title: string
  reason: string
  appliedActions: string[]
  nextActions: string[]
  roomRefs: AiBuildingRoomRef[]
}

export type AiBuildingOptimizationStep = {
  variantKey: string
  roomRefs: AiBuildingRoomRef[]
}

type AiBuildingOptimizationRoomProfile = AiBuildingRoomRef & {
  roomId: string
  placementMode: AiBuildingPlacementMode
  density: AiBuildingFurnishingDensity
  issueCodes: AiAnalysisIssueCode[]
}

export type AiBuildingPlanAnalysis = {
  scores: {
    overall: number
    openingAlignment: number
    circulation: number
  }
  selection: {
    candidateCount: number
    openingBias: AiBuildingOpeningBias
    furnishingBias: AiBuildingFurnishingBias
  }
  openingStrategy: {
    gridDirected: boolean
    alignedOpenings: number
    eligibleOpenings: number
    largeGlazingOpenings: number
  }
  circulation: {
    totalItems: number
    averageClearance: number | null
    congestedRooms: string[]
    congestedRoomRefs: AiBuildingRoomRef[]
  }
  optimization: {
    variantKey: string
    passCount: number
    steps: AiBuildingOptimizationStep[]
    roomRefs: AiBuildingRoomRef[]
  } | null
  rules: AiBuildingRuleGuidance | null
  repairSummaries: AiBuildingRepairSummary[]
  roomDiagnostics: AiBuildingRoomDiagnostic[]
  highlights: string[]
  warnings: string[]
}

export type AiBuildingRuleGuidance = {
  activeProfileIds: string[]
  passed: boolean
  hardFailureCount: number
  hardFailureCodes: AiAnalysisIssueCode[]
  warningCount: number
  warningCodes: AiAnalysisIssueCode[]
  totalScore: number
  maxScore: number
  hardFailures: string[]
  warnings: string[]
  violationSummaries: AiBuildingRuleViolationSummary[]
  fengShuiAdvisories: AiFengShuiAdvisory[]
  repairSummaries: AiBuildingRepairSummary[]
}

export type SceneContext = {
  buildingId: string | null
  levelCount: number
  siteWidth: number | null
  siteDepth: number | null
  constraints: {
    setbackRules: SiteSetbackRules
    buildableWidth: number | null
    buildableDepth: number | null
    buildableArea: number | null
  }
  analysis: {
    gridGroups: AiBuildingGridAnalysis[]
    primaryGrid: AiBuildingGridAnalysis | null
  }
}

export type AiBuildingGridAnalysis = {
  id: string
  createdAt: number
  nodeIds: string[]
  targetLabel: string
  axisCount: number
  bayCount: number
  totalSpan: number | null
  averageSpacing: number | null
  gridAngle: number | null
  baySpans: number[]
  approximate: boolean
}

export type AiBuildingBriefRequest = {
  form: AiBuildingFormState
  language: AiBuildingLanguage
  sceneContext: SceneContext
}

export type AiBuildingBriefResponse = {
  provider: 'codex-debug'
  brief: AiBuildingBrief
}

export type AiBuildingPlanRequest = {
  brief: AiBuildingBrief
  language: AiBuildingLanguage
  sceneContext: SceneContext
}

export type AiBuildingPlanResponse = {
  provider: 'codex-debug'
  plan: AiBuildingPlan
  analysisSummary: AiBuildingPlanSummary
  brief: AiBuildingBrief
  normalizedForm: AiBuildingFormState
}

export type AiBuildingApiResponse = AiBuildingPlanResponse

export type AiBuildingPlanSummary = {
  candidateCount: number
  strategy: {
    openingBias: AiBuildingOpeningBias
    openingBiasLabel: string
    furnishingBias: AiBuildingFurnishingBias
    furnishingBiasLabel: string
  }
  scores: {
    overall: number
    openingAlignment: number
    circulation: number
  }
  rules: AiBuildingRuleGuidance | null
  repairSummaries: AiBuildingRepairSummary[]
  roomDiagnostics: AiBuildingRoomDiagnostic[]
  highlights: string[]
  warnings: string[]
}

const AI_BUILDING_SOURCE = 'ai-building:v1'
const AI_BUILDING_RULE_PROFILE_IDS = [
  'CN_GB55038_2025_BASE',
  'UK_NDSS_REFERENCE',
  'ABCB_LIVABLE_REFERENCE',
] as const
export const MIN_DIMENSION = 6
export const MAX_DIMENSION = 28
const WALL_THICKNESS = 0.2

function roundSceneMetric(value: number | null) {
  if (!(typeof value === 'number' && Number.isFinite(value))) return null
  return Math.round(value * 10) / 10
}

function getBuildableSpan(
  siteSpan: number | null,
  leadingInset: number | undefined,
  trailingInset: number | undefined,
) {
  if (!(typeof siteSpan === 'number' && Number.isFinite(siteSpan))) return null
  return roundSceneMetric(Math.max(0, siteSpan - (leadingInset ?? 0) - (trailingInset ?? 0)))
}

function hasSetbackRules(rules: SiteSetbackRules) {
  return Object.values(rules).some((value) => typeof value === 'number' && value > 0)
}

function getGridAnalysisFromSelection(
  id: string,
  createdAt: number,
  nodeIds: string[],
  nodes: Record<AnyNodeId, AnyNode>,
) {
  const summary = getGridMeasurementSummaryForSelection(nodeIds, nodes, 'metric')
  if (!summary) return null

  const metricsById = new Map(summary.metrics.map((metric) => [metric.id, metric.value]))
  const baySpans = summary.metrics
    .filter((metric) => metric.id.startsWith('bay:'))
    .map((metric) => metric.value)

  return {
    id,
    createdAt,
    nodeIds,
    targetLabel: summary.targetLabel,
    axisCount: metricsById.get('axis-count') ?? nodeIds.length,
    bayCount: metricsById.get('bay-count') ?? baySpans.length,
    totalSpan: metricsById.get('total-span') ?? null,
    averageSpacing: metricsById.get('average-spacing') ?? null,
    gridAngle: metricsById.get('grid-angle') ?? null,
    baySpans,
    approximate: summary.approximate,
  } satisfies AiBuildingGridAnalysis
}

function getPrimaryGridAnalysis(gridGroups: AiBuildingGridAnalysis[]) {
  if (gridGroups.length === 0) return null

  return [...gridGroups].sort((left, right) => {
    if (right.createdAt !== left.createdAt) return right.createdAt - left.createdAt
    if (right.axisCount !== left.axisCount) return right.axisCount - left.axisCount
    return (right.totalSpan ?? 0) - (left.totalSpan ?? 0)
  })[0]!
}

function getSceneGridModule(sceneContext: SceneContext) {
  const spacing = sceneContext.analysis.primaryGrid?.averageSpacing
  if (!(typeof spacing === 'number' && Number.isFinite(spacing) && spacing >= 2 && spacing <= 12)) {
    return null
  }

  return spacing
}

function snapDimensionToModule(value: number, module: number | null, min: number, max: number) {
  const clamped = clampNumber(value, min, max)
  if (!(typeof module === 'number' && Number.isFinite(module) && module > 0.01)) {
    return Math.round(clamped * 10) / 10
  }

  const baseMultiple = Math.max(1, Math.round(clamped / module))
  const candidates = Array.from({ length: 5 }, (_, offset) => baseMultiple + offset - 2)
    .filter((multiple) => multiple > 0)
    .map((multiple) => Math.round(multiple * module * 10) / 10)
    .filter((candidate) => candidate >= min - 1e-6 && candidate <= max + 1e-6)

  if (candidates.length === 0) {
    return Math.round(clamped * 10) / 10
  }

  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - clamped) < Math.abs(best - clamped) ? candidate : best,
  )
}

export function snapDimensionToSceneGrid(value: number, sceneContext: SceneContext, max: number) {
  return snapDimensionToModule(value, getSceneGridModule(sceneContext), MIN_DIMENSION, max)
}

export function getSceneFootprintLimits(sceneContext: SceneContext, buildingType?: AiBuildingType) {
  const siteWidth = sceneContext.siteWidth ?? 30
  const siteDepth = sceneContext.siteDepth ?? 30
  const buildableWidth = sceneContext.constraints.buildableWidth
  const buildableDepth = sceneContext.constraints.buildableDepth
  const hasBuildableEnvelope =
    typeof buildableWidth === 'number' || typeof buildableDepth === 'number'
  const maxWidth = clampNumber(
    buildableWidth ?? Math.max(MIN_DIMENSION, siteWidth - 2),
    MIN_DIMENSION,
    MAX_DIMENSION,
  )
  const maxDepth = clampNumber(
    buildableDepth ?? Math.max(MIN_DIMENSION, siteDepth - 2),
    MIN_DIMENSION,
    MAX_DIMENSION,
  )
  const villaWidthInset = hasBuildableEnvelope ? 2 : 8
  const villaDepthInset = hasBuildableEnvelope ? 2 : 8
  const villaMaxWidth = clampNumber(
    (buildableWidth ?? siteWidth) - villaWidthInset,
    MIN_DIMENSION,
    maxWidth,
  )
  const villaMaxDepth = clampNumber(
    (buildableDepth ?? siteDepth) - villaDepthInset,
    MIN_DIMENSION,
    maxDepth,
  )
  const effectiveBuildingType = buildingType ?? 'residential'
  const preferredMaxWidth = effectiveBuildingType === 'villa' ? villaMaxWidth : maxWidth
  const preferredMaxDepth = effectiveBuildingType === 'villa' ? villaMaxDepth : maxDepth
  const gridModule = getSceneGridModule(sceneContext)

  return {
    siteWidth,
    siteDepth,
    buildableWidth,
    buildableDepth,
    buildableArea: sceneContext.constraints.buildableArea,
    setbackRules: sceneContext.constraints.setbackRules,
    hasSetbackRules: hasSetbackRules(sceneContext.constraints.setbackRules),
    primaryGrid: sceneContext.analysis.primaryGrid,
    gridModule,
    maxWidth,
    maxDepth,
    preferredMaxWidth,
    preferredMaxDepth,
    suggestedWidth: snapDimensionToModule(
      Math.round((preferredMaxWidth - 4) * 10) / 10,
      gridModule,
      MIN_DIMENSION,
      MAX_DIMENSION,
    ),
    suggestedDepth: snapDimensionToModule(
      Math.round((preferredMaxDepth - 6) * 10) / 10,
      gridModule,
      MIN_DIMENSION,
      MAX_DIMENSION,
    ),
  }
}

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
type AiBuildingItemSurface = 'floor' | 'countertop' | 'elevated'
type AiBuildingPlacementRole = 'wall' | 'corner' | 'center' | 'flex'
type AiBuildingPairAlignment = 'parallel' | 'opposite'
type AiBuildingCompanionSide = 'left' | 'right' | 'front' | 'back'
type AiBuildingPlacementMode = 'balanced' | 'perimeter' | 'entry-clear'

const ACCESS_ENTRY_BLOCK_THRESHOLD = 0.022
const ACCESS_CORRIDOR_BLOCK_THRESHOLD = 0.055
const ACCESS_DOOR_SWING_BLOCK_THRESHOLD = 0.022
const STAIR_PLACEMENT_MARGIN = 0.22
const MIN_STAIR_TREAD_DEPTH = 0.2
const TARGET_STAIR_TREAD_DEPTH = 0.235
const TARGET_STAIR_RISER_HEIGHT = 0.175
const MAX_STAIR_RISER_HEIGHT = 0.19
const STAIR_LANDING_CLEAR_DEPTH = 0.96
const STAIR_LANDING_CLEAR_SIDE_MARGIN = 0.22
const STAIR_TOP_LANDING_DEPTH = 0.96
const MIN_TURNING_STAIR_FLIGHT_STEPS = 5
const STAIR_WALL_CLEARANCE = WALL_THICKNESS / 2 + 0.04
const STAIR_WALL_CUT_CLEARANCE = WALL_THICKNESS / 2 + 0.08
const MIN_WALKABLE_STAIR_WIDTH = 0.9
const MIN_WALKABLE_STAIR_TREAD_DEPTH = 0.22
const MAX_WALKABLE_STAIR_RISER_HEIGHT = 0.18
const MAX_WALKABLE_STAIR_PITCH_DEGREES = 37
const STAIR_COMFORT_FORMULA_TARGET = 0.62
const STAIR_COMFORT_FORMULA_MIN = 0.58
const STAIR_COMFORT_FORMULA_MAX = 0.65
const MIN_WALKABLE_STAIR_LANDING_DEPTH = 0.9
const STAIR_ROUTE_PROBE_DEPTH = 0.78
const STAIR_ROUTE_DISCONNECTED_PENALTY = 30
const STAIR_PRIVATE_ACCESS_PENALTY = 28
const STAIR_SERVICE_ACCESS_PENALTY = 16
const STAIR_DESIGN_KNOWLEDGE: AiBuildingStairDesignKnowledge[] = [
  {
    type: 'straight',
    labelZh: '直跑楼梯',
    labelEn: 'Straight stair',
    suitableFor: ['线性门厅', '狭长核心筒', '展示型住宅'],
    constraints: ['需要最长连续进深', '上下口必须保留平台净空'],
    modelSupport: 'segment-plan',
  },
  {
    type: 'l-shaped',
    labelZh: 'L 型/四分之一转楼梯',
    labelEn: 'L-shaped quarter-turn stair',
    suitableFor: ['靠墙角布置', '紧凑住宅', '入口缓冲'],
    constraints: ['转角平台不得侵占门洞', '两段梯跑都要满足踏步比例'],
    modelSupport: 'segment-plan',
  },
  {
    type: 'u-shaped',
    labelZh: 'U 型/半回转楼梯',
    labelEn: 'U-shaped switchback stair',
    suitableFor: ['楼梯间', '办公/公寓核心', '较紧凑的多层住宅'],
    constraints: ['需要稳定的折返平台', '到达方向必须接入公共动线'],
    modelSupport: 'segment-plan',
  },
  {
    type: 'compact-switchback',
    labelZh: '紧凑折返楼梯',
    labelEn: 'Compact switchback stair',
    suitableFor: ['小面宽别墅', '改造项目', '极限户型'],
    constraints: ['只在直跑或标准转角放不下时采用', '不得降低最小踏面和踢面安全阈值'],
    modelSupport: 'segment-plan',
  },
  {
    type: 'winder',
    labelZh: '扇形踏步楼梯',
    labelEn: 'Winder stair',
    suitableFor: ['历史建筑', '极紧凑转角', '次要楼梯'],
    constraints: ['踏步宽度变化大', '主楼梯需谨慎使用并受规范限制'],
    modelSupport: 'future-geometry',
  },
  {
    type: 'curved',
    labelZh: '弧形楼梯',
    labelEn: 'Curved stair',
    suitableFor: ['大堂', '展示空间', '高端住宅'],
    constraints: ['占地和结构复杂度高', '需要弧形踏步与栏杆几何验收'],
    modelSupport: 'future-geometry',
  },
  {
    type: 'spiral',
    labelZh: '螺旋楼梯',
    labelEn: 'Spiral stair',
    suitableFor: ['阁楼', '屋顶露台', '次要垂直交通'],
    constraints: ['紧凑但通行舒适性较弱', '通常不应替代主要疏散楼梯'],
    modelSupport: 'future-geometry',
  },
  {
    type: 'bifurcated',
    labelZh: '双分式楼梯',
    labelEn: 'Bifurcated stair',
    suitableFor: ['酒店大堂', '会所', '礼仪性入口'],
    constraints: ['占地大', '需要双向到达和大空间结构配合'],
    modelSupport: 'future-geometry',
  },
]
type AiBuildingPlacementAnchor = {
  anchorX: AiBuildingAxisAnchor
  anchorZ: AiBuildingAxisAnchor
}
type AiBuildingRoomAccessPoint = {
  key: string
  kind: 'entry' | 'interior'
  wallKey: string
  position: Point2D
  direction: Point2D
  width: number
}
type AiBuildingRectBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}
type AiBuildingDoorSwingSide = 'left' | 'right'
type AiBuildingUseZoneSpec = {
  side: AiBuildingCompanionSide
  depth: number
  span?: number
}
type AiBuildingItemPlacementProfile = {
  role: AiBuildingPlacementRole
  minGap: number
  reserveCenter?: boolean
  maxBackClearance?: number
  pairWith?: AiBuildingAssetId[]
  pairDistance?: [number, number]
  pairAlignment?: AiBuildingPairAlignment
}

const ITEM_ASSETS = {
  'bathroom-sink': asset('bathroom-sink', 'bathroom', 'Bathroom Sink', [0.7, 0.8, 0.45], {
    offset: [0.11, 0, 0.02],
  }),
  bathtub: asset('bathtub', 'bathroom', 'Bathtub', [1.6, 0.7, 0.8], {
    offset: [0, 0, 0.01],
  }),
  'bedside-table': asset('bedside-table', 'furniture', 'Bedside Table', [0.5, 0.5, 0.5], {
    offset: [0, 0, -0.01],
  }),
  closet: asset('closet', 'furniture', 'Closet', [2, 2.5, 1], {
    offset: [0, 0, -0.01],
  }),
  'coffee-table': asset('coffee-table', 'furniture', 'Coffee Table', [1.1, 0.45, 0.65]),
  'dining-chair': asset('dining-chair', 'furniture', 'Dining Chair', [0.5, 1, 0.5]),
  'dining-table': asset('dining-table', 'furniture', 'Dining Table', [1.9, 0.8, 1], {
    offset: [0, 0, -0.01],
  }),
  'double-bed': asset('double-bed', 'furniture', 'Double Bed', [1.9, 0.7, 2.1], {
    offset: [0, 0, -0.03],
  }),
  fridge: asset('fridge', 'kitchen', 'Fridge', [0.85, 1.9, 0.78], {
    offset: [0, 0, -0.04],
  }),
  'kitchen-counter': asset('kitchen-counter', 'kitchen', 'Kitchen Counter', [2.1, 0.92, 0.75]),
  'lounge-chair': asset('lounge-chair', 'furniture', 'Lounge Chair', [0.8, 0.85, 0.8], {
    offset: [0, 0, 0.09],
  }),
  palm: asset('palm', 'outdoor', 'Palm', [1, 4.5, 1], {
    offset: [0, 0, 0.02],
    scale: [0.37, 0.37, 0.37],
  }),
  'parking-spot': asset('parking-spot', 'outdoor', 'Parking Spot', [5, 1, 2.5], {
    offset: [0, 0, 0.01],
    scale: [0.9, 1, 0.78],
  }),
  'patio-umbrella': asset('patio-umbrella', 'outdoor', 'Patio Umbrella', [0.5, 3.7, 0.5]),
  'shower-square': asset('shower-square', 'bathroom', 'Squared Shower', [0.85, 2.1, 0.85], {
    offset: [0.41, 0, -0.42],
  }),
  sofa: asset('sofa', 'furniture', 'Sofa', [2.2, 0.9, 1], {
    offset: [0, 0, 0.04],
  }),
  stove: asset('stove', 'kitchen', 'Stove', [1, 1, 1], {
    offset: [0, 0, -0.05],
  }),
  sunbed: asset('sunbed', 'outdoor', 'Sunbed', [2.1, 0.5, 0.8], {
    offset: [0, 0.04, 0],
  }),
  television: asset('television', 'appliance', 'Television', [1.25, 0.8, 0.08]),
  tesla: asset('tesla', 'outdoor', 'Tesla', [2, 1.7, 5]),
  toilet: asset('toilet', 'bathroom', 'Toilet', [0.45, 0.8, 0.7], {
    offset: [0, 0, -0.23],
  }),
  tree: asset('tree', 'outdoor', 'Tree', [1, 5, 1], {
    offset: [-0.02, 0.17, -0.04],
    scale: [0.65, 0.65, 0.65],
  }),
  'tv-stand': asset('tv-stand', 'furniture', 'TV Stand', [1.3, 0.55, 0.38], {
    offset: [0, 0.21, 0],
  }),
} satisfies Record<AiBuildingAssetId, AssetInput>

const ITEM_SURFACE_BY_ASSET_ID: Partial<Record<AiBuildingAssetId, AiBuildingItemSurface>> = {
  stove: 'countertop',
  television: 'elevated',
}
const ITEM_PLACEMENT_PROFILES: Partial<Record<AiBuildingAssetId, AiBuildingItemPlacementProfile>> =
  {
    'bathroom-sink': {
      role: 'wall',
      minGap: 0.48,
      maxBackClearance: 0.08,
      reserveCenter: true,
    },
    bathtub: {
      role: 'wall',
      minGap: 0.56,
      maxBackClearance: 0.08,
      reserveCenter: true,
    },
    'bedside-table': {
      role: 'flex',
      minGap: 0.12,
      pairWith: ['double-bed'],
      pairDistance: [0.12, 0.95],
    },
    closet: {
      role: 'corner',
      minGap: 0.58,
      reserveCenter: true,
    },
    'coffee-table': {
      role: 'center',
      minGap: 0.28,
      pairWith: ['sofa'],
      pairDistance: [0.4, 1.4],
    },
    'dining-chair': {
      role: 'flex',
      minGap: 0.08,
      pairWith: ['dining-table'],
      pairDistance: [0.18, 1],
    },
    'dining-table': {
      role: 'center',
      minGap: 0.68,
    },
    'double-bed': {
      role: 'wall',
      minGap: 0.54,
      reserveCenter: true,
    },
    fridge: {
      role: 'corner',
      minGap: 0.52,
      reserveCenter: true,
      pairWith: ['kitchen-counter'],
      pairDistance: [0.55, 2.4],
      pairAlignment: 'parallel',
    },
    'kitchen-counter': {
      role: 'wall',
      minGap: 0.72,
      reserveCenter: true,
      pairWith: ['fridge'],
      pairDistance: [0.55, 2.4],
      pairAlignment: 'parallel',
    },
    'lounge-chair': {
      role: 'flex',
      minGap: 0.42,
    },
    'parking-spot': {
      role: 'center',
      minGap: 0.82,
    },
    'shower-square': {
      role: 'corner',
      minGap: 0.4,
      maxBackClearance: 0.08,
      reserveCenter: true,
    },
    sofa: {
      role: 'wall',
      minGap: 0.64,
      reserveCenter: true,
    },
    stove: {
      role: 'flex',
      minGap: 0.08,
      pairWith: ['kitchen-counter'],
      pairDistance: [0.04, 0.52],
    },
    sunbed: {
      role: 'flex',
      minGap: 0.44,
    },
    television: {
      role: 'flex',
      minGap: 0.08,
      pairWith: ['tv-stand'],
      pairDistance: [0.04, 0.42],
      pairAlignment: 'parallel',
    },
    tesla: {
      role: 'center',
      minGap: 0.82,
    },
    toilet: {
      role: 'wall',
      minGap: 0.46,
      maxBackClearance: 0.08,
      reserveCenter: true,
    },
    tree: {
      role: 'corner',
      minGap: 0.34,
    },
    'tv-stand': {
      role: 'wall',
      minGap: 0.54,
      reserveCenter: true,
      pairWith: ['sofa'],
      pairDistance: [1.8, 4.8],
      pairAlignment: 'opposite',
    },
  }
const ITEM_USE_ZONE_SPECS: Partial<Record<AiBuildingAssetId, AiBuildingUseZoneSpec[]>> = {
  'bathroom-sink': [{ side: 'front', depth: 0.68, span: 0.88 }],
  bathtub: [{ side: 'front', depth: 0.6, span: 1.45 }],
  closet: [{ side: 'front', depth: 0.78, span: 1.5 }],
  'dining-chair': [{ side: 'back', depth: 0.72, span: 0.68 }],
  'dining-table': [
    { side: 'left', depth: 0.62, span: 1.18 },
    { side: 'right', depth: 0.62, span: 1.18 },
    { side: 'front', depth: 0.58, span: 1.55 },
    { side: 'back', depth: 0.58, span: 1.55 },
  ],
  'double-bed': [
    { side: 'left', depth: 0.62, span: 1.9 },
    { side: 'right', depth: 0.62, span: 1.9 },
    { side: 'front', depth: 0.76, span: 1.72 },
  ],
  fridge: [{ side: 'front', depth: 0.86, span: 0.96 }],
  'kitchen-counter': [{ side: 'front', depth: 0.88, span: 1.9 }],
  'lounge-chair': [{ side: 'front', depth: 0.56, span: 0.86 }],
  'shower-square': [{ side: 'front', depth: 0.58, span: 0.9 }],
  sofa: [{ side: 'front', depth: 0.72, span: 1.9 }],
  stove: [{ side: 'front', depth: 0.76, span: 0.9 }],
  sunbed: [{ side: 'front', depth: 0.74, span: 1.52 }],
  tesla: [
    { side: 'left', depth: 0.74, span: 3.4 },
    { side: 'right', depth: 0.74, span: 3.4 },
    { side: 'front', depth: 0.86, span: 1.9 },
  ],
  toilet: [{ side: 'front', depth: 0.72, span: 0.84 }],
}
export const AI_BUILDING_TYPE_OPTIONS: AiBuildingType[] = [
  'villa',
  'residential',
  'apartment',
  'shop',
  'office',
  'hotel',
]

export const COPY = {
  'zh-CN': {
    title: 'AI建房',
    projectContext: '当前场地',
    buildableContext: '可建范围',
    setbackContext: '退距',
    gridContext: '主轴网',
    gridGuidance: '主轴网会继续约束房间分跨、门窗开洞、楼梯朝向和家具摆位。',
    analysis: '方案评估',
    selectedStrategy: '已选策略',
    openingBiasLabels: {
      balanced: '均衡开洞',
      'primary-facade': '主立面强化',
    },
    furnishingBiasLabels: {
      layered: '分层家具',
      'circulation-first': '通行优先',
    },
    overallScore: '综合评分',
    openingAlignment: '开洞对齐',
    circulationScore: '通行余量',
    alignedOpenings: '对齐开洞',
    averageClearance: '平均余量',
    highlights: '优势',
    warnings: '提示',
    repairSummaries: '修复说明',
    repairSummariesEmpty: '当前没有需要单独说明的修复动作。',
    repairWhy: '触发原因',
    repairApplied: '已执行动作',
    repairNext: '继续建议',
    repairRelatedRooms: '关联房间',
    repairStatusLabels: {
      resolved: '已处理',
      active: '未解决',
      watch: '继续观察',
    },
    fengShui: '风水解释',
    fengShuiEmpty: '当前未识别到需要单独说明的风水重点问题。',
    fengShuiWhy: '命中依据',
    fengShuiTraditional: '传统看法',
    fengShuiModern: '人居原因',
    fengShuiFix: '优先改法',
    fengShuiRelatedRooms: '关联房间',
    fengShuiIssueLabels: {
      ENTRY_NO_BUFFER: '入户缺少玄关缓冲',
      ROOM_DOOR_MISSING: '房间缺少可用门洞',
      ROOM_ENCLOSURE_INCOMPLETE: '房间围护墙不完整',
      STAIR_REQUIRED_BETWEEN_FLOORS: '楼层之间缺少楼梯',
      STAIR_WALKABILITY_BROKEN: '楼梯踏步或上下楼出口不合理',
      STAIR_WALL_COLLISION: '楼梯或行走路径穿过实体墙',
      STAIR_ROUTE_DISCONNECTED: '楼梯没有接成连续跨楼层动线',
      TOILET_EXPOSED_TO_PUBLIC_VIEW: '卫生间暴露在入户或公共视线',
      PRIVATE_ROOM_TRAVERSED: '到达私密房间需要穿越其他空间',
      PUBLIC_PRIVATE_REVERSED: '优先朝向没有留给客厅或主卧',
      NO_DAYLIT_HABITABLE_ROOM: '可居住房间缺少有效采光',
      KITCHEN_WORKFLOW_BROKEN: '厨房取备烹动线被拉长或阻断',
      CORRIDOR_AREA_WASTE: '走廊面积占比偏高',
      SINGLE_SIDED_DEEP_LAYOUT: '单面采光且进深过大',
      STORAGE_MISSING: '关键收纳空间不足',
    },
    fengShuiEvidenceLabels: {
      A_ENVIRONMENT_OVERLAP: '环境重合',
      B_TRADITIONAL_STRONG: '传统共识',
      C_SYMBOLIC_OPTIONAL: '可选象征',
    },
    fengShuiSeverityLabels: {
      high: '高优先',
      medium: '中优先',
      low: '低优先',
    },
    fengShuiRepairHintLabels: {
      add_built_in_cabinet: '补充内置收纳柜',
      add_corridor: '补一段过渡走道',
      add_entry_buffer: '增加入户玄关缓冲',
      add_opening: '为主要房间补充开窗或开口',
      borrow_light: '利用借光改善走道或内区',
      clear_main_paths: '先清理主通道堆物',
      compress_corridor: '压缩低效走廊面积',
      expand_service_zone: '扩大服务收纳区',
      improve_internal_air_path: '优化室内空气路径',
      increase_prep_surface: '增加备餐台面',
      insert_partition: '加隔断避免一眼看穿',
      insert_transition_zone: '加入过渡前室或缓冲带',
      introduce_courtyard: '引入天井或内院通风',
      merge_with_adjacent_room: '把走廊并入相邻空间',
      move_bathroom_door: '调整卫生间门的位置',
      optimize_window_pairing: '优化对向或邻向开窗组合',
      reallocate_daylight_rooms: '把更好采光面留给主要房间',
      rebuild_zone_order: '重排公私空间顺序',
      reduce_depth: '减小进深提升通风',
      reduce_layout_depth: '减小整体进深',
      reorder_kitchen_modules: '重排冰箱备餐烹饪顺序',
      repair_damaged_fixtures: '先修复破损设施',
      reroute_access: '改走更清晰的到达路径',
      reweight_frontage_allocation: '重新分配外立面采光面',
      rotate_entry_path: '调整入户动线方向',
      separate_sink_and_stove_conflict: '拉开水槽和灶台冲突',
      swap_room_positions: '对调关键房间位置',
    },
    roomDiagnostics: '房间诊断',
    roomDiagnosticsEmpty: '当前主要房间未发现需要单独提示的问题。',
    optimizedRoom: '已重排',
    focusedRoom: (roomName: string) => `已定位到 ${roomName}`,
    roomFocusUnavailable: '当前方案还未应用到场景，先点击“应用到当前项目”再定位房间。',
    noWarnings: '当前未发现明显拥挤问题',
    type: '建筑类型',
    style: '建筑风格',
    floors: '层数',
    width: '宽',
    depth: '深',
    prompt: '描述',
    brief: '设计 Brief',
    plan: '方案',
    apply: '应用到当前项目',
    regenerate: '生成方案',
    generateBrief: '生成提示词',
    generatePlan: '生成方案',
    applied: (wallCount: number, floorCount: number) =>
      `已生成 ${floorCount} 层、${wallCount} 面墙体`,
    noBuilding: '未找到建筑，已创建默认建筑',
    replaceHint: '再次应用会替换上一次 AI 生成内容，手工内容会保留。',
    siteFallback: '未读取到场地尺寸，使用 30m x 30m 默认场地。',
    meters: 'm',
    rooms: '房间',
    openings: '门窗',
    walls: '墙体',
    details: '细节',
    floorsUnit: '层',
    setbackRuleLabels: {
      front: '前',
      back: '后',
      left: '左',
      right: '右',
    },
    variants: {
      balanced: '均衡',
      courtyard: '庭院',
      daylight: '采光',
    },
    buildingTypes: {
      villa: '别墅',
      residential: '住宅',
      apartment: '公寓',
      shop: '商铺',
      office: '办公',
      hotel: '酒店',
    },
    styles: {
      modern: '现代',
      newChinese: '新中式',
      minimal: '极简',
    },
    defaultPrompt: '三层现代住宅，一层客餐厨，二层卧室，顶层露台，南向采光。',
    provider: 'Codex 调试 API',
    generating: '正在调用 Codex 调试 API...',
    generatingBrief: '正在生成设计 Brief...',
    generatingPlan: '正在生成建筑方案...',
    briefPlaceholder: '先生成提示词，再在这里微调设计 Brief。',
    briefGenerated: '已生成可编辑设计 Brief',
    briefRequired: '请先生成或确认设计 Brief',
    generated: '已返回调试 AI 方案',
    planRequired: '请先生成方案',
    generateFailed: '调试 AI 方案生成失败',
  },
  en: {
    title: 'AI Build',
    projectContext: 'Site',
    buildableContext: 'Buildable',
    setbackContext: 'Setbacks',
    gridContext: 'Primary Grid',
    gridGuidance:
      'The primary grid will keep guiding room bays, openings, stair direction, and furniture layout.',
    analysis: 'Plan Analysis',
    selectedStrategy: 'Selected Strategy',
    openingBiasLabels: {
      balanced: 'Balanced Openings',
      'primary-facade': 'Primary Facade',
    },
    furnishingBiasLabels: {
      layered: 'Layered Furnishing',
      'circulation-first': 'Circulation First',
    },
    overallScore: 'Overall',
    openingAlignment: 'Opening Alignment',
    circulationScore: 'Circulation',
    alignedOpenings: 'Aligned Openings',
    averageClearance: 'Avg Clearance',
    highlights: 'Highlights',
    warnings: 'Warnings',
    repairSummaries: 'Fix Summary',
    repairSummariesEmpty: 'No extra fix narrative is needed right now.',
    repairWhy: 'Why It Triggered',
    repairApplied: 'Applied',
    repairNext: 'Next',
    repairRelatedRooms: 'Related Rooms',
    repairStatusLabels: {
      resolved: 'Resolved',
      active: 'Active',
      watch: 'Watch',
    },
    fengShui: 'Feng Shui Advisories',
    fengShuiEmpty: 'No explainable feng shui focus items were detected right now.',
    fengShuiWhy: 'Why It Triggered',
    fengShuiTraditional: 'Traditional View',
    fengShuiModern: 'Modern Reason',
    fengShuiFix: 'Priority Fix',
    fengShuiRelatedRooms: 'Linked Rooms',
    fengShuiIssueLabels: {
      ENTRY_NO_BUFFER: 'The entry lacks a foyer buffer',
      ROOM_DOOR_MISSING: 'A room has no usable door',
      ROOM_ENCLOSURE_INCOMPLETE: 'A room is not fully enclosed by walls',
      STAIR_REQUIRED_BETWEEN_FLOORS: 'A floor transition is missing a stair',
      STAIR_WALKABILITY_BROKEN: 'The stair geometry or arrival sequence is unrealistic',
      STAIR_WALL_COLLISION: 'The stair or walking route crosses a solid wall',
      STAIR_ROUTE_DISCONNECTED: 'The stair is disconnected from the cross-floor route',
      TOILET_EXPOSED_TO_PUBLIC_VIEW: 'A bathroom is exposed to entry or public sightlines',
      PRIVATE_ROOM_TRAVERSED: 'Private rooms require passing through other spaces',
      PUBLIC_PRIVATE_REVERSED: 'Prime frontage is not reserved for the living room or main bedroom',
      NO_DAYLIT_HABITABLE_ROOM: 'A habitable room lacks effective daylight',
      KITCHEN_WORKFLOW_BROKEN: 'The kitchen storage-prep-cook flow is broken',
      CORRIDOR_AREA_WASTE: 'Corridor area is oversized for the floor',
      SINGLE_SIDED_DEEP_LAYOUT: 'The plan is too deep for a single-sided daylight path',
      STORAGE_MISSING: 'Key storage support is missing',
    },
    fengShuiEvidenceLabels: {
      A_ENVIRONMENT_OVERLAP: 'Environment Overlap',
      B_TRADITIONAL_STRONG: 'Traditional Consensus',
      C_SYMBOLIC_OPTIONAL: 'Optional Symbolic',
    },
    fengShuiSeverityLabels: {
      high: 'High Priority',
      medium: 'Medium Priority',
      low: 'Low Priority',
    },
    fengShuiRepairHintLabels: {
      add_built_in_cabinet: 'Add built-in storage',
      add_corridor: 'Add a transition corridor',
      add_entry_buffer: 'Create an entry buffer',
      add_opening: 'Add an opening to the main room',
      borrow_light: 'Borrow light from adjacent space',
      clear_main_paths: 'Clear the main circulation path',
      compress_corridor: 'Reduce oversized corridor area',
      expand_service_zone: 'Expand the service zone',
      improve_internal_air_path: 'Improve the interior air path',
      increase_prep_surface: 'Increase prep counter space',
      insert_partition: 'Add a visual partition',
      insert_transition_zone: 'Insert a transition zone',
      introduce_courtyard: 'Introduce a courtyard or light well',
      merge_with_adjacent_room: 'Merge corridor area into an adjacent room',
      move_bathroom_door: 'Relocate the bathroom door',
      optimize_window_pairing: 'Optimize paired window openings',
      reallocate_daylight_rooms: 'Give better daylight frontage to key rooms',
      rebuild_zone_order: 'Rebuild the public-private zone order',
      reduce_depth: 'Reduce room depth for ventilation',
      reduce_layout_depth: 'Reduce overall layout depth',
      reorder_kitchen_modules: 'Reorder the kitchen workflow',
      repair_damaged_fixtures: 'Repair damaged fixtures',
      reroute_access: 'Reroute the access path',
      reweight_frontage_allocation: 'Rebalance frontage allocation',
      rotate_entry_path: 'Rotate the entry path',
      separate_sink_and_stove_conflict: 'Separate sink and stove conflict',
      swap_room_positions: 'Swap key room positions',
    },
    roomDiagnostics: 'Room Diagnostics',
    roomDiagnosticsEmpty: 'No room-level issues need extra attention right now.',
    optimizedRoom: 'Reflowed',
    focusedRoom: (roomName: string) => `Focused ${roomName}`,
    roomFocusUnavailable:
      'This plan has not been applied to the scene yet. Apply it before locating a room.',
    noWarnings: 'No obvious congestion risks detected.',
    type: 'Building Type',
    style: 'Style',
    floors: 'Floors',
    width: 'Width',
    depth: 'Depth',
    prompt: 'Prompt',
    brief: 'Design Brief',
    plan: 'Plan',
    apply: 'Apply to Project',
    regenerate: 'Generate Plan',
    generateBrief: 'Generate Brief',
    generatePlan: 'Generate Plan',
    applied: (wallCount: number, floorCount: number) =>
      `Generated ${floorCount} floors and ${wallCount} walls`,
    noBuilding: 'No building found. A default building was created.',
    replaceHint: 'Applying again replaces the previous AI-generated structure only.',
    siteFallback: 'No site dimensions found. Using the default 30m x 30m site.',
    meters: 'm',
    rooms: 'Rooms',
    openings: 'Openings',
    walls: 'Walls',
    details: 'Details',
    floorsUnit: 'floors',
    setbackRuleLabels: {
      front: 'Front',
      back: 'Back',
      left: 'Left',
      right: 'Right',
    },
    variants: {
      balanced: 'Balanced',
      courtyard: 'Courtyard',
      daylight: 'Daylight',
    },
    buildingTypes: {
      villa: 'Villa',
      residential: 'Residential',
      apartment: 'Apartment',
      shop: 'Retail',
      office: 'Office',
      hotel: 'Hotel',
    },
    styles: {
      modern: 'Modern',
      newChinese: 'New Chinese',
      minimal: 'Minimal',
    },
    defaultPrompt:
      'Three-floor modern residence with living and dining on level one, bedrooms above, and a roof terrace.',
    provider: 'Codex Debug API',
    generating: 'Calling Codex Debug API...',
    generatingBrief: 'Generating design brief...',
    generatingPlan: 'Generating building plan...',
    briefPlaceholder: 'Generate a prompt first, then refine the design brief here.',
    briefGenerated: 'Editable design brief generated',
    briefRequired: 'Generate or confirm the design brief first',
    generated: 'Debug AI plan returned',
    planRequired: 'Generate a plan first',
    generateFailed: 'Debug AI plan failed',
  },
} satisfies Record<
  AiBuildingLanguage,
  {
    title: string
    projectContext: string
    buildableContext: string
    setbackContext: string
    gridContext: string
    gridGuidance: string
    analysis: string
    selectedStrategy: string
    openingBiasLabels: Record<AiBuildingOpeningBias, string>
    furnishingBiasLabels: Record<AiBuildingFurnishingBias, string>
    overallScore: string
    openingAlignment: string
    circulationScore: string
    alignedOpenings: string
    averageClearance: string
    highlights: string
    warnings: string
    repairSummaries: string
    repairSummariesEmpty: string
    repairWhy: string
    repairApplied: string
    repairNext: string
    repairRelatedRooms: string
    repairStatusLabels: Record<AiBuildingRepairSummary['status'], string>
    fengShui: string
    fengShuiEmpty: string
    fengShuiWhy: string
    fengShuiTraditional: string
    fengShuiModern: string
    fengShuiFix: string
    fengShuiRelatedRooms: string
    fengShuiIssueLabels: Partial<Record<AiAnalysisIssueCode, string>>
    fengShuiEvidenceLabels: Record<AiFengShuiAdvisory['evidenceLevel'], string>
    fengShuiSeverityLabels: Record<AiFengShuiAdvisory['severity'], string>
    fengShuiRepairHintLabels: Record<string, string>
    roomDiagnostics: string
    roomDiagnosticsEmpty: string
    optimizedRoom: string
    focusedRoom: (roomName: string) => string
    roomFocusUnavailable: string
    noWarnings: string
    type: string
    style: string
    floors: string
    width: string
    depth: string
    prompt: string
    brief: string
    plan: string
    apply: string
    regenerate: string
    generateBrief: string
    generatePlan: string
    applied: (wallCount: number, floorCount: number) => string
    noBuilding: string
    replaceHint: string
    siteFallback: string
    meters: string
    rooms: string
    openings: string
    walls: string
    details: string
    floorsUnit: string
    setbackRuleLabels: Record<'front' | 'back' | 'left' | 'right', string>
    variants: Record<AiBuildingVariant, string>
    buildingTypes: Record<AiBuildingType, string>
    styles: Record<AiBuildingStyle, string>
    defaultPrompt: string
    provider: string
    generating: string
    generatingBrief: string
    generatingPlan: string
    briefPlaceholder: string
    briefGenerated: string
    briefRequired: string
    generated: string
    planRequired: string
    generateFailed: string
  }
>

export type AiBuildingCopy = (typeof COPY)[AiBuildingLanguage]

export function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function parseNumberInput(value: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseFloat(value)
  return clampNumber(Number.isFinite(parsed) ? parsed : fallback, min, max)
}

export function getAiBuildingPlanSummary(
  plan: AiBuildingPlan,
  language: AiBuildingLanguage,
): AiBuildingPlanSummary {
  const copy = COPY[language]
  return {
    candidateCount: plan.analysis.selection.candidateCount,
    strategy: {
      openingBias: plan.analysis.selection.openingBias,
      openingBiasLabel: copy.openingBiasLabels[plan.analysis.selection.openingBias],
      furnishingBias: plan.analysis.selection.furnishingBias,
      furnishingBiasLabel: copy.furnishingBiasLabels[plan.analysis.selection.furnishingBias],
    },
    scores: {
      overall: plan.analysis.scores.overall,
      openingAlignment: plan.analysis.scores.openingAlignment,
      circulation: plan.analysis.scores.circulation,
    },
    rules: plan.analysis.rules,
    repairSummaries: plan.analysis.repairSummaries.slice(0, 3),
    roomDiagnostics: plan.analysis.roomDiagnostics.slice(0, 4),
    highlights: plan.analysis.highlights.slice(0, 4),
    warnings: plan.analysis.warnings.slice(0, 4),
  }
}

function dedupeAiBuildingText(entries: string[]) {
  return Array.from(new Set(entries.filter(Boolean)))
}

function formatAiBuildingRepairHintLabel(language: AiBuildingLanguage, hint: string) {
  const repairHintLabels = COPY[language].fengShuiRepairHintLabels as Record<string, string>
  const label = repairHintLabels[hint]
  return label ?? hint.replaceAll('_', ' ')
}

function getOptimizationVariantLabel(
  variantKey: string | null | undefined,
  language: AiBuildingLanguage,
) {
  if (variantKey === 'multi-pass-rule-targeted') {
    return language === 'zh-CN' ? '多轮定向重排' : 'Multi-pass targeted reflow'
  }
  if (variantKey === 'rule-targeted') {
    return language === 'zh-CN' ? '规则定向重排' : 'Rule-targeted reflow'
  }
  if (variantKey === 'rule-targeted-compact') {
    return language === 'zh-CN' ? '规则定向紧凑重排' : 'Rule-targeted compact reflow'
  }
  if (variantKey === 'compact-entry-clear') {
    return language === 'zh-CN' ? '入口净空重排' : 'Entry-clear reflow'
  }
  if (variantKey === 'compact-perimeter') {
    return language === 'zh-CN' ? '贴边重排' : 'Perimeter reflow'
  }
  if (variantKey === 'default-entry-clear') {
    return language === 'zh-CN' ? '缓冲优先重排' : 'Buffer-first reflow'
  }
  return language === 'zh-CN' ? '紧凑重排' : 'Compact reflow'
}

function getOptimizationRepairActions(
  language: AiBuildingLanguage,
  variantKey: string | null | undefined,
) {
  const actions =
    variantKey === 'multi-pass-rule-targeted'
      ? [
          language === 'zh-CN'
            ? '已根据剩余规则问题连续执行多轮局部重排。'
            : 'Ran multiple local reflow passes against the remaining rule issues.',
          language === 'zh-CN'
            ? '每轮都会根据上轮残留问题重新选择目标房间和摆放策略。'
            : 'Each pass reselects target rooms and placement strategies from the remaining issues.',
        ]
      : variantKey === 'rule-targeted'
        ? [
            language === 'zh-CN'
              ? '已把规则违例转成房间级重排指令。'
              : 'Translated rule violations into room-level reflow instructions.',
            language === 'zh-CN'
              ? '不同房间会按问题类型分别采用通行优先或贴边策略。'
              : 'Rooms now switch between entry-clear and perimeter strategies by issue type.',
          ]
        : variantKey === 'rule-targeted-compact'
          ? [
              language === 'zh-CN'
                ? '已按规则定向重排，并对冲突更强的房间启用紧凑密度。'
                : 'Applied rule-targeted reflow with compact density for higher-conflict rooms.',
              language === 'zh-CN'
                ? '关键厨房、卧室和卫生间会优先恢复可用活动面。'
                : 'Key kitchens, bedrooms, and bathrooms now prioritize recovering usable activity space.',
            ]
          : variantKey === 'compact-entry-clear'
            ? [
                language === 'zh-CN'
                  ? '已优先清理入口净空和前场视线。'
                  : 'Prioritized entry clearance and front-of-house sightlines.',
                language === 'zh-CN'
                  ? '已压缩拥挤房间里的家具占地。'
                  : 'Compressed furniture footprints inside tighter rooms.',
              ]
            : variantKey === 'compact-perimeter'
              ? [
                  language === 'zh-CN'
                    ? '已把次要占位尽量贴边，让主活动带更完整。'
                    : 'Pushed secondary objects to the perimeter to free the main activity band.',
                ]
              : variantKey === 'default-entry-clear'
                ? [
                    language === 'zh-CN'
                      ? '已用更保守的密度优先保住玄关和门口缓冲。'
                      : 'Used a less dense arrangement to preserve the foyer and door buffer.',
                  ]
                : [
                    language === 'zh-CN'
                      ? '已做一轮紧凑化重排，优先清理基础活动面。'
                      : 'Ran a compact reflow to recover baseline activity space.',
                  ]

  return dedupeAiBuildingText(actions).slice(0, 3)
}

function getOptimizationAppliedActions(
  language: AiBuildingLanguage,
  optimization: AiBuildingPlanAnalysis['optimization'],
) {
  if (!optimization) return [] as string[]
  const variantKeys =
    optimization.steps.length > 0
      ? optimization.steps.map((step) => step.variantKey)
      : [optimization.variantKey]

  return dedupeAiBuildingText(
    variantKeys.flatMap((variantKey) => getOptimizationRepairActions(language, variantKey)),
  ).slice(0, 4)
}

function getRuleViolationRoomRefs(
  snapshot: ReturnType<typeof createAiAnalysisSnapshot>,
  targetId: string | null,
) {
  if (!targetId) return [] as AiBuildingRoomRef[]

  return snapshot.levels.flatMap((level) =>
    level.rooms
      .filter((room) => room.nodeId === targetId)
      .map((room) => ({
        level: level.level,
        roomKey: room.nodeId,
        roomName: room.name,
      })),
  )
}

function getAppliedRepairActionsForIssueCode(
  language: AiBuildingLanguage,
  code: AiAnalysisIssueCode,
  variantKey: string | null | undefined,
) {
  const actions = [...getOptimizationRepairActions(language, variantKey)]

  if (code === 'ENTRY_NO_BUFFER') {
    actions.push(
      language === 'zh-CN'
        ? '已启用玄关缓冲、门位禁区和入口直视规避规则。'
        : 'Enabled foyer buffer, door no-go zones, and entry sightline avoidance rules.',
    )
  } else if (code === 'ROOM_DOOR_MISSING') {
    actions.push(
      language === 'zh-CN'
        ? '已在门窗生成阶段补偿缺门房间，优先把房间接到楼梯间、门厅或公共空间。'
        : 'Door generation now backfills rooms without a usable door, preferring stairs, entry, and public rooms.',
    )
  } else if (code === 'ROOM_ENCLOSURE_INCOMPLETE') {
    actions.push(
      language === 'zh-CN'
        ? '已把房间四边围护覆盖率纳入硬性规则，防止房间边界被楼梯或开洞破坏。'
        : 'Room-side wall coverage is now checked as a hard rule so stair cuts or openings cannot erase room boundaries.',
    )
  } else if (code === 'STAIR_REQUIRED_BETWEEN_FLOORS') {
    actions.push(
      language === 'zh-CN'
        ? '已把多层建筑的楼梯间列为受保护房间，并要求每个楼层转换都有楼梯。'
        : 'Multi-floor buildings now protect stair rooms and require a stair for every floor transition.',
    )
  } else if (code === 'STAIR_WALKABILITY_BROKEN') {
    actions.push(
      language === 'zh-CN'
        ? '已把楼梯踏步比例、坡度和上下楼出口动线接入候选筛选。'
        : 'Stair pitch, tread comfort, and landing sequence now influence candidate ranking.',
    )
  } else if (code === 'STAIR_WALL_COLLISION') {
    actions.push(
      language === 'zh-CN'
        ? '已把楼梯本体、起步通行带和到达通行带的实体墙碰撞接入硬约束。'
        : 'Solid-wall collision checks now apply to the stair body, lower route, and upper arrival route.',
    )
  } else if (code === 'STAIR_ROUTE_DISCONNECTED') {
    actions.push(
      language === 'zh-CN'
        ? '已用房间-门-楼梯图检查入口到楼梯、楼梯到上层空间的连续路径。'
        : 'A room-door-stair graph now checks the route from entry to stair and from stair to upper rooms.',
    )
  } else if (code === 'TOILET_EXPOSED_TO_PUBLIC_VIEW') {
    actions.push(
      language === 'zh-CN'
        ? '已启用卫生间门位避视线和前场退后规则。'
        : 'Enabled bathroom door privacy placement and front-zone retreat rules.',
    )
  } else if (code === 'PUBLIC_PRIVATE_REVERSED' || code === 'PRIVATE_ROOM_TRAVERSED') {
    actions.push(
      language === 'zh-CN'
        ? '已启用公私分区优先、局部对调和房间顺序修复。'
        : 'Enabled public-private zoning priority, local swaps, and room-order repairs.',
    )
  } else if (code === 'NO_DAYLIT_HABITABLE_ROOM' || code === 'SINGLE_SIDED_DEEP_LAYOUT') {
    actions.push(
      language === 'zh-CN'
        ? '已启用主要房间采光优先和前场采光面分配规则。'
        : 'Enabled daylight-first frontage allocation for key habitable rooms.',
    )
  } else if (code === 'KITCHEN_WORKFLOW_BROKEN') {
    actions.push(
      language === 'zh-CN'
        ? '已启用厨房工作流检查和模块顺序约束。'
        : 'Enabled kitchen workflow checks and module-order constraints.',
    )
  } else if (
    code === 'ACCESSIBLE_ENTRY_REQUIRED' ||
    code === 'ELEVATOR_REQUIRED' ||
    code === 'AGING_PATH_UNSAFE'
  ) {
    actions.push(
      language === 'zh-CN'
        ? '已把无障碍和生命周期规则接入候选筛选。'
        : 'Accessibility and lifecycle rules now influence candidate ranking.',
    )
  }

  if (actions.length === 0) {
    actions.push(
      language === 'zh-CN'
        ? '已把这类问题纳入规则闸门和候选排序。'
        : 'This issue is now part of the rule gate and candidate ranking.',
    )
  }

  return dedupeAiBuildingText(actions).slice(0, 3)
}

function getNextRepairActionsForIssueCode(language: AiBuildingLanguage, code: AiAnalysisIssueCode) {
  const hintMap: Partial<Record<AiAnalysisIssueCode, string[]>> = {
    ACCESSIBLE_ENTRY_REQUIRED: ['insert_transition_zone'],
    AGING_PATH_UNSAFE: ['reroute_access', 'clear_main_paths'],
    ENTRY_NO_BUFFER: ['add_entry_buffer', 'insert_transition_zone', 'rotate_entry_path'],
    ELEVATOR_REQUIRED: ['rebuild_zone_order'],
    ROOM_DOOR_MISSING: ['add_opening', 'reroute_access', 'rebuild_zone_order'],
    ROOM_ENCLOSURE_INCOMPLETE: ['rebuild_zone_order', 'reroute_access', 'swap_room_positions'],
    STAIR_REQUIRED_BETWEEN_FLOORS: ['rebuild_zone_order', 'add_corridor', 'reroute_access'],
    STAIR_WALKABILITY_BROKEN: ['reroute_access', 'rebuild_zone_order', 'swap_room_positions'],
    STAIR_WALL_COLLISION: ['reroute_access', 'move_bathroom_door', 'rebuild_zone_order'],
    STAIR_ROUTE_DISCONNECTED: ['reroute_access', 'add_corridor', 'rebuild_zone_order'],
    KITCHEN_WORKFLOW_BROKEN: [
      'reorder_kitchen_modules',
      'increase_prep_surface',
      'separate_sink_and_stove_conflict',
    ],
    NO_DAYLIT_HABITABLE_ROOM: ['reallocate_daylight_rooms', 'add_opening', 'swap_room_positions'],
    PRIVATE_ROOM_TRAVERSED: ['add_corridor', 'reroute_access', 'rebuild_zone_order'],
    PUBLIC_PRIVATE_REVERSED: [
      'rebuild_zone_order',
      'swap_room_positions',
      'reweight_frontage_allocation',
    ],
    SINGLE_SIDED_DEEP_LAYOUT: [
      'reduce_layout_depth',
      'optimize_window_pairing',
      'introduce_courtyard',
    ],
    TOILET_EXPOSED_TO_PUBLIC_VIEW: [
      'move_bathroom_door',
      'insert_transition_zone',
      'swap_room_positions',
    ],
  }

  return (hintMap[code] ?? [])
    .map((hint) => formatAiBuildingRepairHintLabel(language, hint))
    .slice(0, 3)
}

function getRepairSummaryTitle(
  language: AiBuildingLanguage,
  violation: AiBuildingRuleViolationSummary,
) {
  const labelMap: Partial<Record<AiAnalysisIssueCode, string>> =
    language === 'zh-CN'
      ? {
          ACCESSIBLE_ENTRY_REQUIRED: '入户无障碍不足',
          AGING_PATH_UNSAFE: '适老夜间动线不稳',
          ENTRY_NO_BUFFER: '玄关缓冲不足',
          ELEVATOR_REQUIRED: '垂直交通不满足需求',
          ROOM_DOOR_MISSING: '房间缺少可用门洞',
          ROOM_ENCLOSURE_INCOMPLETE: '房间围护墙不完整',
          STAIR_REQUIRED_BETWEEN_FLOORS: '楼层之间缺少楼梯',
          STAIR_WALKABILITY_BROKEN: '楼梯踏步或落位不合理',
          STAIR_WALL_COLLISION: '楼梯穿墙或撞墙',
          STAIR_ROUTE_DISCONNECTED: '楼梯跨层动线断开',
          KITCHEN_WORKFLOW_BROKEN: '厨房工作流不顺',
          NO_DAYLIT_HABITABLE_ROOM: '主要房间采光不足',
          PRIVATE_ROOM_TRAVERSED: '私密房间被穿越',
          PUBLIC_PRIVATE_REVERSED: '公私分区倒挂',
          SINGLE_SIDED_DEEP_LAYOUT: '单面采光进深过深',
          TOILET_EXPOSED_TO_PUBLIC_VIEW: '卫生间暴露在主视线',
        }
      : {
          ACCESSIBLE_ENTRY_REQUIRED: 'Accessible entry is still weak',
          AGING_PATH_UNSAFE: 'Aging-friendly route is still unsafe',
          ENTRY_NO_BUFFER: 'Entry buffer is still weak',
          ELEVATOR_REQUIRED: 'Vertical access still falls short',
          ROOM_DOOR_MISSING: 'A room still lacks a usable door',
          ROOM_ENCLOSURE_INCOMPLETE: 'A room boundary is still incomplete',
          STAIR_REQUIRED_BETWEEN_FLOORS: 'A required floor-to-floor stair is still missing',
          STAIR_WALKABILITY_BROKEN: 'Stair walkability is still weak',
          STAIR_WALL_COLLISION: 'The stair still crosses a solid wall',
          STAIR_ROUTE_DISCONNECTED: 'The stair route is still disconnected',
          KITCHEN_WORKFLOW_BROKEN: 'Kitchen workflow still feels broken',
          NO_DAYLIT_HABITABLE_ROOM: 'Key habitable daylight is still weak',
          PRIVATE_ROOM_TRAVERSED: 'A private room is still traversed',
          PUBLIC_PRIVATE_REVERSED: 'Public-private zoning is still reversed',
          SINGLE_SIDED_DEEP_LAYOUT: 'Single-sided depth is still too deep',
          TOILET_EXPOSED_TO_PUBLIC_VIEW: 'Bathroom exposure is still too direct',
        }

  return labelMap[violation.code] ?? violation.message
}

function createRuleRepairSummaries(
  ruleGuidance: AiBuildingRuleGuidance | null,
  language: AiBuildingLanguage,
  optimization: AiBuildingPlanAnalysis['optimization'],
  roomDiagnostics: AiBuildingRoomDiagnostic[],
) {
  if (!ruleGuidance) return [] as AiBuildingRepairSummary[]

  const summaries: AiBuildingRepairSummary[] = []
  const optimizedDiagnostics = roomDiagnostics.filter((diagnostic) => diagnostic.optimized)

  if (optimization?.roomRefs.length) {
    const roomNames = optimization.roomRefs
      .slice(0, 2)
      .map((roomRef) => roomRef.roomName)
      .join(language === 'zh-CN' ? '、' : ' / ')
    const remainingWarnings = dedupeAiBuildingText(
      optimizedDiagnostics.flatMap((diagnostic) => diagnostic.warnings),
    ).slice(0, 2)

    summaries.push({
      key: 'system-optimization',
      status: remainingWarnings.length > 0 ? 'watch' : 'resolved',
      title:
        language === 'zh-CN'
          ? `${getOptimizationVariantLabel(optimization.variantKey, language)}已执行`
          : `${getOptimizationVariantLabel(optimization.variantKey, language)} applied`,
      reason:
        optimization.passCount > 1
          ? language === 'zh-CN'
            ? `系统因为 ${roomNames || '关键房间'} 仍有净空、视线或占位冲突，连续执行了 ${optimization.passCount} 轮局部修复。`
            : `The system ran ${optimization.passCount} local repair passes because ${roomNames || 'key rooms'} still showed clearance, visibility, or footprint conflicts.`
          : language === 'zh-CN'
            ? `系统因为 ${roomNames || '关键房间'} 存在净空、视线或占位冲突，执行了局部修复。`
            : `The system applied a local repair because ${roomNames || 'key rooms'} still showed clearance, visibility, or footprint conflicts.`,
      appliedActions: getOptimizationAppliedActions(language, optimization),
      nextActions: remainingWarnings,
      roomRefs: optimization.roomRefs.slice(0, 4),
    })
  }

  const coveredCodes = new Set<AiAnalysisIssueCode>()
  for (const advisory of ruleGuidance.fengShuiAdvisories.slice(0, 3)) {
    for (const code of advisory.relatedIssueCodes) coveredCodes.add(code)
    const status = advisory.relatedIssueCodes.some((code) =>
      ruleGuidance.hardFailureCodes.includes(code),
    )
      ? 'active'
      : 'watch'
    const appliedActions = advisory.relatedIssueCodes.flatMap((code) =>
      getAppliedRepairActionsForIssueCode(language, code, optimization?.variantKey ?? null),
    )
    const nextActions = advisory.repairHints
      .map((hint) => formatAiBuildingRepairHintLabel(language, hint))
      .filter((hint) => !appliedActions.includes(hint))
      .slice(0, 3)

    summaries.push({
      key: advisory.code,
      status,
      title: advisory.userFacingLabels.modern,
      reason: advisory.modernRationale,
      appliedActions: dedupeAiBuildingText(appliedActions).slice(0, 3),
      nextActions,
      roomRefs: advisory.roomRefs.slice(0, 4).map((roomRef) => ({
        level: roomRef.level,
        roomKey: roomRef.roomKey,
        roomName: roomRef.roomName,
      })),
    })
  }

  for (const violation of ruleGuidance.violationSummaries) {
    if (coveredCodes.has(violation.code)) continue

    summaries.push({
      key: `violation:${violation.code}:${violation.message}`,
      status: violation.severity === 'error' ? 'active' : 'watch',
      title: getRepairSummaryTitle(language, violation),
      reason: violation.message,
      appliedActions: getAppliedRepairActionsForIssueCode(
        language,
        violation.code,
        optimization?.variantKey ?? null,
      ),
      nextActions: getNextRepairActionsForIssueCode(language, violation.code),
      roomRefs: violation.roomRefs.slice(0, 4),
    })

    if (summaries.length >= 4) break
  }

  return summaries.slice(0, 4)
}

function asset(
  id: AiBuildingAssetId,
  category: string,
  name: string,
  dimensions: Point3D,
  options: Partial<Pick<AssetInput, 'offset' | 'rotation' | 'scale' | 'tags'>> = {},
): AssetInput {
  return {
    id,
    category,
    name,
    thumbnail: `/items/${id}/thumbnail.webp`,
    src: `/items/${id}/model.glb`,
    dimensions,
    ...options,
  }
}

function material(
  color: string,
  roughness = 0.75,
  metalness = 0,
  opacity = 1,
  side: 'front' | 'back' | 'double' = opacity < 1 ? 'double' : 'front',
): MaterialSchema {
  return {
    preset: 'custom',
    properties: {
      color,
      roughness,
      metalness,
      opacity,
      transparent: opacity < 1,
      side,
    },
  }
}

function waitForDebugApiLatency() {
  return new Promise((resolve) => window.setTimeout(resolve, 280))
}

function inferBuildingTypeFromPrompt(prompt: string, fallback: AiBuildingType): AiBuildingType {
  const normalizedPrompt = prompt.toLowerCase()
  if (/别墅|villa|house/.test(normalizedPrompt)) return 'villa'
  if (/公寓|apartment|flat/.test(normalizedPrompt)) return 'apartment'
  if (/酒店|hotel|民宿|guesthouse/.test(normalizedPrompt)) return 'hotel'
  if (/商铺|门店|零售|shop|store|retail/.test(normalizedPrompt)) return 'shop'
  if (/办公|office|工作室|studio/.test(normalizedPrompt)) return 'office'
  if (/住宅|residential|home/.test(normalizedPrompt)) return 'residential'
  return fallback
}

function normalizeAiBuildingFormForDebugApi(
  form: AiBuildingFormState,
  sceneContext: SceneContext,
): AiBuildingFormState {
  const buildingType = inferBuildingTypeFromPrompt(form.prompt, form.buildingType)
  const footprintLimits = getSceneFootprintLimits(sceneContext, buildingType)
  const villaDefaults =
    buildingType === 'villa'
      ? {
          floors: Math.min(form.floors, 4),
          width: Math.min(form.width, footprintLimits.preferredMaxWidth),
          depth: Math.min(form.depth, footprintLimits.preferredMaxDepth),
          variant: form.variant === 'balanced' ? 'courtyard' : form.variant,
        }
      : {}

  return {
    ...form,
    ...villaDefaults,
    buildingType,
    floors: Math.round(clampNumber(villaDefaults.floors ?? form.floors, 1, 8)),
    width: snapDimensionToSceneGrid(
      villaDefaults.width ?? form.width,
      sceneContext,
      footprintLimits.maxWidth,
    ),
    depth: snapDimensionToSceneGrid(
      villaDefaults.depth ?? form.depth,
      sceneContext,
      footprintLimits.maxDepth,
    ),
  }
}

function inferMassingIntent(form: AiBuildingFormState): AiBuildingMassingIntent {
  const prompt = form.prompt.toLowerCase()
  return {
    asymmetry: /个性|异形|错落|不规则|雕塑|asym|sculptural|unique/.test(prompt),
    cantilever: /悬挑|挑檐|漂浮|cantilever|floating/.test(prompt),
    setbacks: /退台|错层|露台层|setback|stepped/.test(prompt),
    roofTerrace: /露台|屋顶|天台|terrace|roof/.test(prompt) || form.buildingType === 'villa',
    courtyard: form.variant === 'courtyard' || /庭院|院子|花园|courtyard|garden/.test(prompt),
    grandEntrance: /大门|门面|入口|门廊|前厅|grand|entrance|facade/.test(prompt),
    largeGlazing:
      form.variant === 'daylight' || /采光|落地窗|玻璃|幕墙|daylight|glazing|window/.test(prompt),
  }
}

function inferFeatureIntent(form: AiBuildingFormState): AiBuildingFeatureIntent {
  const prompt = form.prompt.toLowerCase()
  const isVilla = form.buildingType === 'villa'
  const isResidentialLike =
    isVilla || form.buildingType === 'residential' || form.buildingType === 'apartment'
  const asksComplete =
    /完整|丰富|详细|精装|软装|家具|陈设|室内|interior|furnish|furniture|complete|detailed/.test(
      prompt,
    )
  const wantsCourtyard =
    form.variant === 'courtyard' ||
    /庭院|院子|花园|景观|合院|courtyard|garden|landscape/.test(prompt)
  const wantsTerrace = /露台|阳台|屋顶|天台|terrace|balcony|roof\s*deck/.test(prompt)
  const wantsPool = /泳池|游泳池|水景|pool|swimming/.test(prompt)
  const wantsGarage = /车库|车位|停车|garage|parking|carport/.test(prompt)
  const wantsFence = /围栏|围墙|院墙|围合|fence|enclosed|wall enclosure/.test(prompt)
  const wantsStair = form.floors > 1

  return {
    roof: !/不要屋顶|无屋顶|no roof/.test(prompt),
    ceiling: !/不要吊顶|不要顶面|无吊顶|open ceiling|no ceiling/.test(prompt),
    stairs: wantsStair,
    courtyard: wantsCourtyard,
    pool: wantsPool,
    fencedGarden: wantsFence || (wantsCourtyard && /围合|私家庭院|enclosed|private/.test(prompt)),
    garage: wantsGarage,
    landscape: wantsCourtyard || /绿化|树|棕榈|植物|草坪|landscape|tree|plant|lawn/.test(prompt),
    furnish:
      isResidentialLike ||
      form.buildingType === 'hotel' ||
      asksComplete ||
      /卧室|客厅|餐厅|厨房|卫生间|浴室|套房|bedroom|living|dining|kitchen|bath/.test(prompt),
    kitchen: isResidentialLike || /厨房|餐厨|中厨|西厨|吧台|kitchen|pantry|island/.test(prompt),
    bathroom:
      isResidentialLike ||
      form.buildingType === 'hotel' ||
      /卫生间|卫浴|浴室|套卫|bath|restroom|toilet|powder/.test(prompt),
    bedroom: isResidentialLike || /卧室|主卧|套房|客房|bedroom|suite|guest room/.test(prompt),
    living: isResidentialLike || /客厅|起居|会客|family|living|lounge|great room/.test(prompt),
    terrace: wantsTerrace,
  }
}

function getBriefTitle(form: AiBuildingFormState, language: AiBuildingLanguage) {
  const copy = COPY[language]
  return language === 'zh-CN'
    ? `${copy.styles[form.style]}${copy.buildingTypes[form.buildingType]}设计提示词`
    : `${copy.styles[form.style]} ${copy.buildingTypes[form.buildingType]} design brief`
}

function getMassingNotes(massing: AiBuildingMassingIntent, language: AiBuildingLanguage) {
  const zhNotes = [
    massing.asymmetry ? '体块错落、有识别度' : null,
    massing.cantilever ? '可加入悬挑体块' : null,
    massing.setbacks ? '立面可做退台处理' : null,
    massing.roofTerrace ? '预留屋顶/顶层露台' : null,
    massing.courtyard ? '组织庭院或花园界面' : null,
    massing.grandEntrance ? '强化大门面与入口仪式感' : null,
    massing.largeGlazing ? '南向采光和大开窗优先' : null,
  ].filter((note): note is string => Boolean(note))

  const enNotes = [
    massing.asymmetry ? 'distinct asymmetric massing' : null,
    massing.cantilever ? 'optional cantilevered volume' : null,
    massing.setbacks ? 'stepped setbacks on the facade' : null,
    massing.roofTerrace ? 'roof or upper-level terrace' : null,
    massing.courtyard ? 'courtyard or garden edge' : null,
    massing.grandEntrance ? 'strong entrance and facade presence' : null,
    massing.largeGlazing ? 'south-facing daylight and large glazing' : null,
  ].filter((note): note is string => Boolean(note))

  return language === 'zh-CN' ? zhNotes : enNotes
}

function getFloorProgram(form: AiBuildingFormState, language: AiBuildingLanguage) {
  return Array.from({ length: form.floors }, (_, floorIndex) => {
    const label = language === 'zh-CN' ? `${floorIndex + 1}层` : `Level ${floorIndex + 1}`
    return `${label}: ${getRoomNames(form, floorIndex, language).join(' / ')}`
  })
}

function getBriefMustHave(
  form: AiBuildingFormState,
  massing: AiBuildingMassingIntent,
  language: AiBuildingLanguage,
) {
  const copy = COPY[language]
  const notes = getMassingNotes(massing, language)
  const base =
    language === 'zh-CN'
      ? [
          `${form.floors}层`,
          `控制在 ${form.width}m x ${form.depth}m 内`,
          `${copy.styles[form.style]}风格`,
          `${copy.variants[form.variant]}布局倾向`,
        ]
      : [
          `${form.floors} floors`,
          `within ${form.width}m x ${form.depth}m`,
          `${copy.styles[form.style]} style`,
          `${copy.variants[form.variant]} layout tendency`,
        ]

  const userPrompt = form.prompt.trim()
  if (userPrompt) {
    base.push(language === 'zh-CN' ? `用户原始要求：${userPrompt}` : `User request: ${userPrompt}`)
  }

  return [...base, ...notes]
}

function getBriefAvoid(language: AiBuildingLanguage) {
  return language === 'zh-CN'
    ? ['不要超出当前场地边界', '不要生成过密的小房间', '保持清晰交通核和主要入口']
    : [
        'Do not exceed the current site boundary',
        'Avoid overly dense tiny rooms',
        'Keep a clear core and main entry',
      ]
}

function getBriefSiteConstraints(
  sceneContext: SceneContext,
  buildingType: AiBuildingType,
  language: AiBuildingLanguage,
) {
  const copy = COPY[language]
  const footprintLimits = getSceneFootprintLimits(sceneContext, buildingType)
  const formatMeters = (value: number) =>
    Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
  const constraints: string[] = []

  if (typeof sceneContext.siteWidth === 'number' && typeof sceneContext.siteDepth === 'number') {
    constraints.push(
      language === 'zh-CN'
        ? `场地约 ${formatMeters(sceneContext.siteWidth)}m x ${formatMeters(sceneContext.siteDepth)}m`
        : `Site about ${formatMeters(sceneContext.siteWidth)}m x ${formatMeters(sceneContext.siteDepth)}m`,
    )
  }

  if (
    typeof footprintLimits.buildableWidth === 'number' &&
    typeof footprintLimits.buildableDepth === 'number'
  ) {
    constraints.push(
      language === 'zh-CN'
        ? `有效可建范围约 ${formatMeters(footprintLimits.buildableWidth)}m x ${formatMeters(footprintLimits.buildableDepth)}m`
        : `Buildable envelope about ${formatMeters(footprintLimits.buildableWidth)}m x ${formatMeters(footprintLimits.buildableDepth)}m`,
    )
  }

  if (footprintLimits.hasSetbackRules) {
    const setbackSummary = Object.entries(footprintLimits.setbackRules)
      .filter(
        (entry): entry is [keyof typeof copy.setbackRuleLabels, number] =>
          typeof entry[1] === 'number',
      )
      .map(([key, value]) => `${copy.setbackRuleLabels[key]} ${formatMeters(value)}m`)
      .join(language === 'zh-CN' ? ' / ' : ', ')

    if (setbackSummary) {
      constraints.push(
        language === 'zh-CN' ? `退距规则：${setbackSummary}` : `Setback rules: ${setbackSummary}`,
      )
    }
  }

  const grid = footprintLimits.primaryGrid
  if (grid && typeof grid.averageSpacing === 'number') {
    const gridBits = [
      language === 'zh-CN' ? `${grid.axisCount} 轴` : `${grid.axisCount} axes`,
      language === 'zh-CN'
        ? `平均轴距 ${formatMeters(grid.averageSpacing)}m`
        : `avg spacing ${formatMeters(grid.averageSpacing)}m`,
    ]

    if (typeof grid.totalSpan === 'number') {
      gridBits.push(
        language === 'zh-CN'
          ? `总跨度 ${formatMeters(grid.totalSpan)}m`
          : `total span ${formatMeters(grid.totalSpan)}m`,
      )
    }

    constraints.push(
      language === 'zh-CN'
        ? `${copy.gridContext}：${gridBits.join(' / ')}`
        : `${copy.gridContext}: ${gridBits.join(', ')}`,
    )
    constraints.push(copy.gridGuidance)
  }

  return constraints
}

function buildBriefText({
  avoid,
  floorProgram,
  form,
  massing,
  mustHave,
  siteConstraints,
  title,
  language,
}: {
  avoid: string[]
  floorProgram: string[]
  form: AiBuildingFormState
  massing: AiBuildingMassingIntent
  mustHave: string[]
  siteConstraints: string[]
  title: string
  language: AiBuildingLanguage
}) {
  const copy = COPY[language]
  const massingNotes = getMassingNotes(massing, language)
  const designIntent =
    language === 'zh-CN'
      ? `生成一个${copy.styles[form.style]}${copy.buildingTypes[form.buildingType]}，占地约 ${form.width}m x ${form.depth}m，共 ${form.floors} 层。重点是${massingNotes.length ? massingNotes.join('、') : copy.variants[form.variant]}。`
      : `Generate a ${copy.styles[form.style]} ${copy.buildingTypes[form.buildingType]}, about ${form.width}m x ${form.depth}m, with ${form.floors} floors. Focus on ${massingNotes.length ? massingNotes.join(', ') : copy.variants[form.variant]}.`

  const labels =
    language === 'zh-CN'
      ? {
          intent: '设计目标',
          constraints: '场地约束',
          program: '楼层功能',
          mustHave: '必须满足',
          avoid: '避免',
        }
      : {
          intent: 'Design Intent',
          constraints: 'Site Constraints',
          program: 'Floor Program',
          mustHave: 'Must Have',
          avoid: 'Avoid',
        }

  return [
    title,
    '',
    `${labels.intent}: ${designIntent}`,
    '',
    ...(siteConstraints.length
      ? [labels.constraints, ...siteConstraints.map((item) => `- ${item}`), '']
      : []),
    labels.program,
    ...floorProgram.map((item) => `- ${item}`),
    '',
    labels.mustHave,
    ...mustHave.map((item) => `- ${item}`),
    '',
    labels.avoid,
    ...avoid.map((item) => `- ${item}`),
  ].join('\n')
}

function createAiBuildingBrief(
  normalizedForm: AiBuildingFormState,
  language: AiBuildingLanguage,
  sceneContext: SceneContext,
): AiBuildingBrief {
  const massing = inferMassingIntent(normalizedForm)
  const floorProgram = getFloorProgram(normalizedForm, language)
  const mustHave = getBriefMustHave(normalizedForm, massing, language)
  const avoid = getBriefAvoid(language)
  const siteConstraints = getBriefSiteConstraints(
    sceneContext,
    normalizedForm.buildingType,
    language,
  )
  const title = getBriefTitle(normalizedForm, language)
  const briefText = buildBriefText({
    avoid,
    floorProgram,
    form: normalizedForm,
    massing,
    mustHave,
    siteConstraints,
    title,
    language,
  })
  const designIntent = briefText.split('\n').find((line) => line.includes(':')) ?? title

  return {
    id: `brief-${normalizedForm.buildingType}-${normalizedForm.style}-${normalizedForm.variant}-${normalizedForm.floors}-${normalizedForm.width}-${normalizedForm.depth}`,
    title,
    briefText,
    designIntent,
    massing,
    mustHave,
    avoid,
    floorProgram,
    normalizedForm,
  }
}

export async function requestAiBuildingBrief({
  form,
  language,
  sceneContext,
}: AiBuildingBriefRequest): Promise<AiBuildingBriefResponse> {
  await waitForDebugApiLatency()

  const normalizedForm = normalizeAiBuildingFormForDebugApi(form, sceneContext)
  return {
    provider: 'codex-debug',
    brief: createAiBuildingBrief(normalizedForm, language, sceneContext),
  }
}

export async function requestAiBuildingPlan({
  brief,
  language,
  sceneContext,
}: AiBuildingPlanRequest): Promise<AiBuildingPlanResponse> {
  await waitForDebugApiLatency()

  const originalPrompt = brief.normalizedForm.prompt
  const normalizedForm = normalizeAiBuildingFormForDebugApi(
    {
      ...brief.normalizedForm,
      prompt: brief.briefText,
    },
    sceneContext,
  )
  const visibleForm = {
    ...normalizedForm,
    prompt: originalPrompt,
  }
  const planForm = {
    ...normalizedForm,
    prompt: brief.briefText,
  }
  const planBrief = {
    ...brief,
    briefText: brief.briefText,
    normalizedForm: visibleForm,
  }
  const plan = createPlan(planForm, language, sceneContext)

  return {
    provider: 'codex-debug',
    plan,
    analysisSummary: getAiBuildingPlanSummary(plan, language),
    brief: planBrief,
    normalizedForm: visibleForm,
  }
}

function getMetadata(node: AnyNode | undefined): Record<string, unknown> {
  const metadata = node?.metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

function isAiBuildingNode(node: AnyNode | undefined) {
  return getMetadata(node).source === AI_BUILDING_SOURCE
}

function resolveChildNode(child: unknown, nodes: Record<AnyNodeId, AnyNode>): AnyNode | null {
  if (typeof child === 'string') {
    return nodes[child as AnyNodeId] ?? null
  }
  return child && typeof child === 'object' && 'type' in child ? (child as AnyNode) : null
}

function getBuildingLevels(building: AnyNode | null, nodes: Record<AnyNodeId, AnyNode>) {
  if (!building || building.type !== 'building') return []
  return building.children
    .map((childId) => nodes[childId as AnyNodeId])
    .filter((node): node is LevelNode => node?.type === 'level')
    .sort((left, right) => left.level - right.level)
}

export function getSceneContext(
  nodes: Record<AnyNodeId, AnyNode>,
  rootNodeIds: AnyNodeId[],
  selectedBuildingId: string | null,
): SceneContext {
  const selectedBuilding =
    selectedBuildingId && nodes[selectedBuildingId as AnyNodeId]?.type === 'building'
      ? nodes[selectedBuildingId as AnyNodeId]
      : null

  const site = rootNodeIds.map((rootId) => nodes[rootId]).find((node) => node?.type === 'site') as
    | (AnyNode & { polygon?: { points?: Point2D[] }; children?: unknown[] })
    | undefined

  const firstBuilding =
    selectedBuilding ??
    site?.children
      ?.map((child) => resolveChildNode(child, nodes))
      .find((node) => node?.type === 'building') ??
    Object.values(nodes).find((node) => node.type === 'building') ??
    null

  const sitePoints = site?.polygon?.points ?? []
  const xs = sitePoints.map((point) => point[0])
  const zs = sitePoints.map((point) => point[1])
  const siteWidth = roundSceneMetric(xs.length ? Math.max(...xs) - Math.min(...xs) : null)
  const siteDepth = roundSceneMetric(zs.length ? Math.max(...zs) - Math.min(...zs) : null)
  const setbackRules = getSiteSetbackRules(site ?? null)
  const buildableWidth = getBuildableSpan(siteWidth, setbackRules.left, setbackRules.right)
  const buildableDepth = getBuildableSpan(siteDepth, setbackRules.front, setbackRules.back)
  const buildableArea =
    typeof buildableWidth === 'number' && typeof buildableDepth === 'number'
      ? roundSceneMetric(buildableWidth * buildableDepth)
      : null
  const gridGroups = getSavedGridMeasurementGroups(site ?? null)
    .map((group) => getGridAnalysisFromSelection(group.id, group.createdAt, group.nodeIds, nodes))
    .filter((group): group is AiBuildingGridAnalysis => Boolean(group))
  const primaryGrid = getPrimaryGridAnalysis(gridGroups)

  return {
    buildingId: firstBuilding?.type === 'building' ? firstBuilding.id : null,
    levelCount: getBuildingLevels(firstBuilding, nodes).length,
    siteWidth,
    siteDepth,
    constraints: {
      setbackRules,
      buildableWidth,
      buildableDepth,
      buildableArea,
    },
    analysis: {
      gridGroups,
      primaryGrid,
    },
  }
}

const MIN_ROOM_SLOTS_PER_FLOOR = 4
const MAX_ROOM_SLOTS_PER_FLOOR = 12
const MIN_ROOM_SPAN = 2.25

const REQUESTED_SPACE_LABELS: Record<string, { zh: string; en: string }> = {
  courtyard: { zh: '庭院', en: 'Courtyard' },
  living_room: { zh: '客厅', en: 'Living Room' },
  dining_room: { zh: '餐厅', en: 'Dining Room' },
  kitchen: { zh: '厨房', en: 'Kitchen' },
  bedroom: { zh: '卧室', en: 'Bedroom' },
  primary_bedroom: { zh: '主卧', en: 'Primary Bedroom' },
  bathroom: { zh: '卫生间', en: 'Bathroom' },
  study: { zh: '书房', en: 'Study' },
  balcony: { zh: '阳台', en: 'Balcony' },
  open_office: { zh: '开放办公', en: 'Open Office' },
  meeting_room: { zh: '会议室', en: 'Meeting Room' },
  reception: { zh: '前台', en: 'Reception' },
  pantry: { zh: '茶水间', en: 'Pantry' },
  archive: { zh: '档案室', en: 'Archive' },
  retail_area: { zh: '营业区', en: 'Retail Area' },
  display_area: { zh: '展示区', en: 'Display Area' },
  cashier: { zh: '收银区', en: 'Cashier' },
  storage: { zh: '仓储', en: 'Storage' },
  production: { zh: '生产区', en: 'Production Area' },
  equipment_room: { zh: '设备间', en: 'Mechanical Room' },
  entry: { zh: '入口', en: 'Entry' },
  corridor: { zh: '走廊', en: 'Corridor' },
  stairs: { zh: '楼梯', en: 'Stairs' },
  elevator: { zh: '电梯', en: 'Elevator' },
  garage: { zh: '车库', en: 'Garage' },
}

const REQUESTED_SPACE_PRIORITY: Record<string, number> = {
  entry: 0,
  reception: 1,
  courtyard: 2,
  living_room: 2,
  retail_area: 2,
  display_area: 3,
  production: 3,
  open_office: 3,
  kitchen: 4,
  dining_room: 5,
  meeting_room: 6,
  primary_bedroom: 7,
  bedroom: 8,
  bathroom: 9,
  pantry: 10,
  cashier: 11,
  study: 12,
  storage: 13,
  archive: 14,
  equipment_room: 15,
  garage: 16,
  stairs: 17,
  elevator: 18,
  balcony: 19,
  corridor: 20,
}

const GROUND_FLOOR_SPACE_KEYS = new Set([
  'entry',
  'reception',
  'courtyard',
  'living_room',
  'dining_room',
  'kitchen',
  'retail_area',
  'display_area',
  'cashier',
  'production',
  'open_office',
  'garage',
  'storage',
  'equipment_room',
  'stairs',
  'elevator',
  'corridor',
])

const UPPER_FLOOR_SPACE_KEYS = new Set(['primary_bedroom', 'bedroom', 'study'])
const TOP_FLOOR_SPACE_KEYS = new Set(['balcony'])

type RequestedRoomCandidate = {
  key: string
  name: string
  sourceIndex: number
  instanceIndex: number
  priority: number
}

type RoomProgram = {
  key: string
  name: string
  source: 'requested' | 'default'
}

type NormalizedRequestedSpace = AiBuildingRequestedSpace & {
  sourceIndex: number
}

function normalizeRequestedSpaceKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, '_')
}

function getRequestedSpaceLabel(space: AiBuildingRequestedSpace, language: AiBuildingLanguage) {
  const key = normalizeRequestedSpaceKey(space.key)
  const catalogLabel = REQUESTED_SPACE_LABELS[key]
  if (catalogLabel) return language === 'en' ? catalogLabel.en : catalogLabel.zh

  const customLabel = typeof space.label === 'string' ? space.label.trim() : ''
  return customLabel || key.replace(/_/g, ' ')
}

function getNormalizedRequestedSpaces(form: AiBuildingFormState): NormalizedRequestedSpace[] {
  const spaces: NormalizedRequestedSpace[] = []

  for (const [sourceIndex, space] of (form.requestedSpaces ?? []).entries()) {
    const key = normalizeRequestedSpaceKey(space.key)
    const count = Math.round(clampNumber(Number(space.count), 0, 20))
    if (!key || count <= 0) continue
    spaces.push({
      key,
      label: space.label,
      count,
      sourceIndex,
    })
  }

  return spaces
}

function getRequestedRoomCandidates(
  form: AiBuildingFormState,
  language: AiBuildingLanguage,
): RequestedRoomCandidate[] {
  return getNormalizedRequestedSpaces(form)
    .flatMap((space) =>
      Array.from({ length: space.count }, (_, instanceIndex) => {
        const baseName = getRequestedSpaceLabel(space, language)
        return {
          key: space.key,
          name:
            space.count > 1
              ? language === 'zh-CN'
                ? `${baseName}${instanceIndex + 1}`
                : `${baseName} ${instanceIndex + 1}`
              : baseName,
          sourceIndex: space.sourceIndex,
          instanceIndex,
          priority: REQUESTED_SPACE_PRIORITY[space.key] ?? 100,
        }
      }),
    )
    .sort(
      (a, b) =>
        a.instanceIndex - b.instanceIndex ||
        a.priority - b.priority ||
        a.sourceIndex - b.sourceIndex,
    )
}

function getPreferredFloorIndexes(spaceKey: string, form: AiBuildingFormState) {
  const floorCount = Math.max(1, Math.round(form.floors))
  const floorIndexes = Array.from({ length: floorCount }, (_, index) => index)
  if (floorCount === 1) return floorIndexes

  const upperFloorIndexes = floorIndexes.slice(1)
  const isResidentialLike =
    form.buildingType === 'villa' ||
    form.buildingType === 'residential' ||
    form.buildingType === 'apartment' ||
    form.buildingType === 'hotel'

  if (TOP_FLOOR_SPACE_KEYS.has(spaceKey)) {
    const topFloorIndex = floorCount - 1
    return [topFloorIndex, ...floorIndexes.filter((index) => index !== topFloorIndex)]
  }

  if (UPPER_FLOOR_SPACE_KEYS.has(spaceKey) || (spaceKey === 'bathroom' && isResidentialLike)) {
    return [...upperFloorIndexes, 0]
  }

  if (GROUND_FLOOR_SPACE_KEYS.has(spaceKey)) {
    return [0, ...upperFloorIndexes]
  }

  return floorIndexes
}

function getRoomGridCapacity(form: AiBuildingFormState) {
  const maxColumns = Math.max(1, Math.floor(form.width / MIN_ROOM_SPAN))
  const maxRows = Math.max(1, Math.floor(form.depth / MIN_ROOM_SPAN))
  return Math.max(
    MIN_ROOM_SLOTS_PER_FLOOR,
    Math.min(MAX_ROOM_SLOTS_PER_FLOOR, maxColumns * maxRows),
  )
}

function getRequestedRoomProgramsByFloor(form: AiBuildingFormState, language: AiBuildingLanguage) {
  const candidates = getRequestedRoomCandidates(form, language)
  const floorCount = Math.max(1, Math.round(form.floors))
  const floorIndexes = Array.from({ length: floorCount }, (_, index) => index)
  const roomLimit = getRoomGridCapacity(form)
  const roomsByFloor = floorIndexes.map(() => [] as RoomProgram[])

  for (const candidate of candidates) {
    const preferredFloorIndex =
      getPreferredFloorIndexes(candidate.key, form).find(
        (index) => (roomsByFloor[index]?.length ?? roomLimit) < roomLimit,
      ) ?? floorIndexes.find((index) => (roomsByFloor[index]?.length ?? roomLimit) < roomLimit)

    const floorRooms =
      preferredFloorIndex === undefined ? undefined : roomsByFloor[preferredFloorIndex]
    if (!floorRooms) continue
    floorRooms.push({
      key: candidate.key,
      name: candidate.name,
      source: 'requested',
    })
  }

  return roomsByFloor
}

function normalizeRoomNameForCompare(name: string) {
  return name.toLowerCase().replace(/\s+/g, '')
}

function inferRoomProgramKey(name: string) {
  const normalized = normalizeRoomNameForCompare(name)

  if (/楼梯|stair/.test(normalized)) return 'stairs'
  if (/电梯|elevator|lift/.test(normalized)) return 'elevator'
  if (/车库|garage/.test(normalized)) return 'garage'
  if (/卫|浴|bath|restroom|toilet|powder/.test(normalized)) return 'bathroom'
  if (/主卧|主套|primary|suite/.test(normalized)) return 'primary_bedroom'
  if (/卧|客房|bedroom|guestroom/.test(normalized)) return 'bedroom'
  if (/pantry|备餐|茶水间|水吧|吧台/.test(normalized)) return 'pantry'
  if (/厨房|厨|kitchen/.test(normalized)) return 'kitchen'
  if (/餐厅|餐区|餐室|dining|cafe/.test(normalized)) return 'dining_room'
  if (/客厅|起居|家庭厅|会客|living|lounge|family/.test(normalized)) return 'living_room'
  if (/书房|studio|study|focus/.test(normalized)) return 'study'
  if (/庭院|院子|花园|courtyard|garden/.test(normalized)) return 'courtyard'
  if (/露台|阳台|terrace|balcony/.test(normalized)) return 'balcony'
  if (/开放办公|团队办公|office|workspace|work/.test(normalized)) return 'open_office'
  if (/会议|meeting/.test(normalized)) return 'meeting_room'
  if (/前台|门厅|大堂|lobby|entry|reception/.test(normalized)) return 'entry'
  if (/展示|陈列|营业|showroom|display|retail/.test(normalized)) return 'display_area'
  if (/收银|cashier/.test(normalized)) return 'cashier'
  if (/库|仓储|storage|archive/.test(normalized)) return 'storage'
  if (/生产|production/.test(normalized)) return 'production'
  if (/设备|服务|后勤|service|mechanical/.test(normalized)) return 'equipment_room'

  return 'room'
}

function hasOverlappingRoomProgram(programs: RoomProgram[], fallbackProgram: RoomProgram) {
  const normalizedFallback = normalizeRoomNameForCompare(fallbackProgram.name)
  return programs.some((program) => {
    if (program.key === fallbackProgram.key) return true

    const normalizedName = normalizeRoomNameForCompare(program.name)
    return (
      normalizedName === normalizedFallback ||
      normalizedName.includes(normalizedFallback) ||
      normalizedFallback.includes(normalizedName)
    )
  })
}

function mergeRequestedAndDefaultRoomPrograms(
  requestedPrograms: RoomProgram[],
  defaultPrograms: RoomProgram[],
  roomLimit: number,
) {
  const targetRoomCount = Math.min(
    roomLimit,
    Math.max(MIN_ROOM_SLOTS_PER_FLOOR, requestedPrograms.length, defaultPrograms.length),
  )
  const programs = requestedPrograms.slice(0, roomLimit)

  for (const fallbackProgram of defaultPrograms) {
    if (programs.length >= targetRoomCount) break
    if (!hasOverlappingRoomProgram(programs, fallbackProgram)) {
      programs.push(fallbackProgram)
    }
  }

  for (const fallbackProgram of defaultPrograms) {
    if (programs.length >= targetRoomCount) break
    programs.push(fallbackProgram)
  }

  return programs.slice(0, targetRoomCount)
}

function getDefaultRoomNames(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
) {
  const prompt = form.prompt.toLowerCase()
  const wantsGarage = /车库|garage/.test(prompt)
  const wantsTerrace = /露台|terrace|roof/.test(prompt)
  const wantsCourtyard = form.variant === 'courtyard' || /庭院|院子|courtyard/.test(prompt)
  const isTopFloor = floorIndex === form.floors - 1

  if (language === 'en') {
    if (form.buildingType === 'villa') {
      if (isTopFloor && wantsTerrace) {
        return ['Suite', 'Studio', 'Roof Terrace', 'Stair']
      }
      return floorIndex === 0
        ? [wantsGarage ? 'Garage' : 'Living', 'Dining Kitchen', 'Garden Room', 'Stair']
        : ['Primary Suite', 'Bedroom', 'Stair', 'Bathroom', 'Family Lounge']
    }
    if (form.buildingType === 'apartment') {
      return floorIndex === 0
        ? ['Lobby', 'Apartment A', 'Apartment B', 'Stair']
        : ['Apartment A', 'Apartment B', 'Shared Lounge', 'Services']
    }
    if (form.buildingType === 'shop') {
      return floorIndex === 0
        ? ['Showroom', 'Cashier', 'Storage', 'Restroom']
        : ['Display', 'Office', 'Pantry', 'Stair']
    }
    if (form.buildingType === 'office') {
      return floorIndex === 0
        ? ['Lobby', 'Open Office', 'Meeting', 'Pantry']
        : ['Team Office', 'Focus Room', 'Meeting', 'Restroom']
    }
    if (form.buildingType === 'hotel') {
      return floorIndex === 0
        ? ['Lobby', 'Cafe', 'Service', 'Restroom']
        : ['Guest Room', 'Guest Room', 'Lounge', 'Services']
    }

    if (isTopFloor && wantsTerrace) {
      return ['Bedroom', 'Studio', 'Roof Terrace', 'Stair']
    }
    if (floorIndex === 0) {
      return [
        wantsGarage ? 'Garage' : 'Living',
        'Dining Kitchen',
        wantsCourtyard ? 'Courtyard' : 'Guest Room',
        'Stair',
      ]
    }
    return ['Primary Bedroom', 'Bedroom', 'Stair', 'Restroom', 'Family Room']
  }

  if (form.buildingType === 'villa') {
    if (isTopFloor && wantsTerrace) {
      return ['套房', '书房', '屋顶露台', '楼梯间']
    }
    return floorIndex === 0
      ? [wantsGarage ? '车库' : '客厅', '餐厨', '花园房', '楼梯间']
      : ['主套房', '卧室', '楼梯间', '卫浴', '家庭厅']
  }
  if (form.buildingType === 'apartment') {
    return floorIndex === 0
      ? ['门厅', '公寓 A', '公寓 B', '楼梯间']
      : ['公寓 A', '公寓 B', '共享厅', '设备间']
  }
  if (form.buildingType === 'shop') {
    return floorIndex === 0
      ? ['展示区', '收银区', '库房', '卫生间']
      : ['陈列区', '办公室', '茶水间', '楼梯间']
  }
  if (form.buildingType === 'office') {
    return floorIndex === 0
      ? ['门厅', '开放办公', '会议室', '茶水间']
      : ['团队办公', '专注室', '会议室', '卫生间']
  }
  if (form.buildingType === 'hotel') {
    return floorIndex === 0
      ? ['大堂', '咖啡区', '后勤', '卫生间']
      : ['客房', '客房', '休息厅', '服务间']
  }

  if (isTopFloor && wantsTerrace) {
    return ['卧室', '书房', '露台', '楼梯间']
  }
  if (floorIndex === 0) {
    return [wantsGarage ? '车库' : '客厅', '餐厨', wantsCourtyard ? '庭院' : '客房', '楼梯间']
  }
  return ['主卧', '次卧', '楼梯间', '卫生间', '家庭厅']
}

function getDefaultRoomPrograms(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
): RoomProgram[] {
  return getDefaultRoomNames(form, floorIndex, language).map((name) => ({
    key: inferRoomProgramKey(name),
    name,
    source: 'default',
  }))
}

function getRoomPrograms(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
) {
  const defaultPrograms = getDefaultRoomPrograms(form, floorIndex, language)
  const requestedPrograms = getRequestedRoomProgramsByFloor(form, language)[floorIndex] ?? []

  const mergedPrograms = mergeRequestedAndDefaultRoomPrograms(
    requestedPrograms,
    defaultPrograms,
    getRoomGridCapacity(form),
  )

  return ensureRequiredRoomPrograms(
    mergedPrograms,
    form,
    floorIndex,
    language,
    getRoomGridCapacity(form),
  )
}

function isResidentialLikeBuildingType(buildingType: AiBuildingType) {
  return buildingType === 'villa' || buildingType === 'residential' || buildingType === 'apartment'
}

function getRequiredResidentialRoomPrograms(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
) {
  if (!isResidentialLikeBuildingType(form.buildingType)) return [] as RoomProgram[]

  if (floorIndex === 0) {
    const requiredPrograms: RoomProgram[] = [
      {
        key: 'entry',
        name: language === 'zh-CN' ? '门厅' : 'Entry',
        source: 'default',
      },
      {
        key: 'living_room',
        name: language === 'zh-CN' ? '客厅' : 'Living Room',
        source: 'default',
      },
      {
        key: 'kitchen',
        name: language === 'zh-CN' ? '厨房' : 'Kitchen',
        source: 'default',
      },
      {
        key: 'bathroom',
        name: language === 'zh-CN' ? '卫生间' : 'Bathroom',
        source: 'default',
      },
    ]

    if (getRoomGridCapacity(form) >= 5) {
      requiredPrograms.splice(2, 0, {
        key: 'dining_room',
        name: language === 'zh-CN' ? '餐厅' : 'Dining Room',
        source: 'default',
      })
    }

    return requiredPrograms
  }

  return [
    {
      key: 'primary_bedroom',
      name: language === 'zh-CN' ? '主卧' : 'Primary Bedroom',
      source: 'default',
    },
    {
      key: 'bathroom',
      name: language === 'zh-CN' ? '卫生间' : 'Bathroom',
      source: 'default',
    },
  ] satisfies RoomProgram[]
}

function getRequiredVerticalRoomPrograms(
  form: AiBuildingFormState,
  _floorIndex: number,
  language: AiBuildingLanguage,
) {
  if (form.floors <= 1) return [] as RoomProgram[]

  return [
    {
      key: 'stairs',
      name: language === 'zh-CN' ? '楼梯间' : 'Stair',
      source: 'default',
    },
  ] satisfies RoomProgram[]
}

function getRequiredRoomPrograms(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
) {
  const requiredPrograms: RoomProgram[] = []
  for (const requiredProgram of [
    ...getRequiredVerticalRoomPrograms(form, floorIndex, language),
    ...getRequiredResidentialRoomPrograms(form, floorIndex, language),
  ]) {
    if (!hasOverlappingRoomProgram(requiredPrograms, requiredProgram)) {
      requiredPrograms.push(requiredProgram)
    }
  }

  return requiredPrograms
}

function ensureRequiredRoomPrograms(
  programs: RoomProgram[],
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
  roomLimit: number,
) {
  const requiredPrograms = getRequiredRoomPrograms(form, floorIndex, language)
  if (requiredPrograms.length === 0) return programs

  const nextPrograms: RoomProgram[] = []
  for (const requiredProgram of requiredPrograms) {
    if (!hasOverlappingRoomProgram(nextPrograms, requiredProgram)) {
      nextPrograms.push(requiredProgram)
    }
  }

  for (const program of programs) {
    if (!hasOverlappingRoomProgram(nextPrograms, program)) {
      nextPrograms.push(program)
    }
  }

  if (nextPrograms.length <= roomLimit) return nextPrograms

  const protectedPrograms = new Set(requiredPrograms.map((program) => program.key))
  const trimmedPrograms = [...nextPrograms]
  for (
    let index = trimmedPrograms.length - 1;
    index >= 0 && trimmedPrograms.length > roomLimit;
    index -= 1
  ) {
    const program = trimmedPrograms[index]
    if (!program) continue
    if (protectedPrograms.has(program.key)) continue
    trimmedPrograms.splice(index, 1)
  }

  return trimmedPrograms.slice(0, roomLimit)
}

function getRoomNames(form: AiBuildingFormState, floorIndex: number, language: AiBuildingLanguage) {
  return getRoomPrograms(form, floorIndex, language).map((program) => program.name)
}

function rect(minX: number, minZ: number, maxX: number, maxZ: number): Point2D[] {
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
    normalizeRequestedSpaceKey(value)
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'room'
  )
}

type AiBuildingGridLayoutHint = {
  axis: 'width' | 'depth'
  spans: number[]
}

type AiBuildingLayoutPlan = {
  rooms: AiBuildingRoomPlan[]
  walls: AiBuildingWallPlan[]
  courtyardPolygon?: Point2D[] | null
}

function createEvenBreakpoints(min: number, max: number, count: number) {
  return Array.from({ length: count + 1 }, (_, index) => min + ((max - min) * index) / count)
}

function getSceneGridLayoutHint(
  sceneContext?: SceneContext | null,
): AiBuildingGridLayoutHint | null {
  const grid = sceneContext?.analysis.primaryGrid
  if (!grid || !(typeof grid.gridAngle === 'number' && Number.isFinite(grid.gridAngle))) {
    return null
  }

  const spans = grid.baySpans.filter((span) => Number.isFinite(span) && span > 0.05)
  if (spans.length === 0) return null

  const angle = (grid.gridAngle * Math.PI) / 180
  const normalX = -Math.sin(angle)
  const normalZ = Math.cos(angle)

  return {
    axis: Math.abs(normalX) >= Math.abs(normalZ) ? 'width' : 'depth',
    spans,
  }
}

function fitGridSpansToCount(spans: number[], count: number) {
  if (count <= 0 || spans.length === 0) return []
  let result = spans.slice()

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

function createGridBreakpoints(
  min: number,
  max: number,
  count: number,
  spans: number[],
  minSegment: number,
) {
  if (count <= 0) return null

  const fittedSpans = fitGridSpansToCount(spans, count)
  const total = fittedSpans.reduce((sum, value) => sum + value, 0)
  const range = max - min

  if (fittedSpans.length !== count || !(total > 0) || !(range >= minSegment * count - 1e-6)) {
    return null
  }

  const breakpoints = [min]
  let accumulated = 0

  for (let index = 0; index < count - 1; index += 1) {
    accumulated += fittedSpans[index]!
    const raw = min + (range * accumulated) / total
    const minEdge = breakpoints[breakpoints.length - 1]! + minSegment
    const remainingSegments = count - index - 1
    const maxEdge = max - remainingSegments * minSegment
    breakpoints.push(clampNumber(raw, minEdge, maxEdge))
  }

  breakpoints.push(max)
  return breakpoints
}

function getScaledSpanCenters(length: number, spans: number[]) {
  const total = spans.reduce((sum, value) => sum + value, 0)
  if (!(total > 0) || !(length > 0)) return []

  let walked = 0
  return spans.map((span) => {
    const center = (walked + span / 2) / total
    walked += span
    return length * center
  })
}

function selectDistributedValues(values: number[], count: number) {
  if (count <= 0 || values.length === 0) return []
  if (count >= values.length) return values.slice()

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * values.length) / count)
    const end = Math.floor(((index + 1) * values.length) / count)
    const bucket = values.slice(start, Math.max(start + 1, end))
    return bucket[Math.floor(bucket.length / 2)] ?? values[start] ?? values[values.length - 1]!
  })
}

function getOpeningPositions(
  length: number,
  count: number,
  wallAxis: AiBuildingGridLayoutHint['axis'] | null,
  layoutHint?: AiBuildingGridLayoutHint | null,
) {
  if (count <= 0) return []

  if (wallAxis && layoutHint?.axis === wallAxis) {
    const spans = layoutHint.spans.filter((span) => Number.isFinite(span) && span > 0.05)
    if (spans.length > 0) {
      if (spans.length >= count) {
        const actualCenters = getScaledSpanCenters(length, spans)
        const selected = selectDistributedValues(actualCenters, count)
        if (selected.length === count) return selected
      }

      const fittedSpans = fitGridSpansToCount(spans, count)
      const fittedCenters = getScaledSpanCenters(length, fittedSpans)
      if (fittedCenters.length === count) return fittedCenters
    }
  }

  return createWallPositions(length, count)
}

function getCentralOpeningPosition(
  length: number,
  wallAxis: AiBuildingGridLayoutHint['axis'] | null,
  layoutHint?: AiBuildingGridLayoutHint | null,
) {
  return getOpeningPositions(length, 1, wallAxis, layoutHint)[0] ?? length / 2
}

function createColumnBreakpoints(
  minX: number,
  maxX: number,
  count: number,
  form: AiBuildingFormState,
  layoutHint?: AiBuildingGridLayoutHint | null,
) {
  if (layoutHint?.axis === 'width') {
    const gridBreakpoints = createGridBreakpoints(
      minX,
      maxX,
      count,
      layoutHint.spans,
      MIN_ROOM_SPAN,
    )
    if (gridBreakpoints) return gridBreakpoints
  }

  if (count === 2 && form.variant === 'courtyard') {
    const splitX = clampNumber(-form.width * 0.12, minX + MIN_ROOM_SPAN, maxX - MIN_ROOM_SPAN)
    return [minX, splitX, maxX]
  }

  return createEvenBreakpoints(minX, maxX, count)
}

function createRowBreakpoints(
  minZ: number,
  maxZ: number,
  count: number,
  form: AiBuildingFormState,
  layoutHint?: AiBuildingGridLayoutHint | null,
) {
  if (layoutHint?.axis === 'depth') {
    const gridBreakpoints = createGridBreakpoints(
      minZ,
      maxZ,
      count,
      layoutHint.spans,
      MIN_ROOM_SPAN,
    )
    if (gridBreakpoints) return gridBreakpoints
  }

  if (count === 2 && form.variant === 'daylight') {
    const splitZ = clampNumber(form.depth * 0.08, minZ + MIN_ROOM_SPAN, maxZ - MIN_ROOM_SPAN)
    return [minZ, splitZ, maxZ]
  }

  return createEvenBreakpoints(minZ, maxZ, count)
}

function getRoomRowCounts(roomCount: number, form: AiBuildingFormState) {
  const maxColumns = Math.max(1, Math.floor(form.width / MIN_ROOM_SPAN))
  const maxRows = Math.max(1, Math.floor(form.depth / MIN_ROOM_SPAN))
  const boundedRoomCount = Math.max(1, Math.min(roomCount, getRoomGridCapacity(form)))
  const minRowsForColumns = Math.ceil(boundedRoomCount / maxColumns)
  const aspectRows = Math.round(
    Math.sqrt((boundedRoomCount * form.depth) / Math.max(form.width, MIN_ROOM_SPAN)),
  )
  const rowCount = Math.min(boundedRoomCount, maxRows, Math.max(1, minRowsForColumns, aspectRows))
  const baseCount = Math.floor(boundedRoomCount / rowCount)
  const remainder = boundedRoomCount % rowCount

  return Array.from(
    { length: rowCount },
    (_, index) => baseCount + (index >= rowCount - remainder ? 1 : 0),
  ).filter((count) => count > 0)
}

function createInteriorWall(
  key: string,
  name: string,
  start: Point2D,
  end: Point2D,
): AiBuildingWallPlan {
  return {
    key,
    name,
    start,
    end,
    role: 'inner',
  }
}

function isResidentialCourtyardLayout(form: AiBuildingFormState, floorIndex: number) {
  const residentialLike =
    form.buildingType === 'villa' ||
    form.buildingType === 'residential' ||
    form.buildingType === 'apartment' ||
    form.buildingType === 'hotel'

  return residentialLike && floorIndex === 0 && form.variant === 'courtyard'
}

function fillRoomProgramsToTargetCount(
  requestedPrograms: RoomProgram[],
  fallbackPrograms: RoomProgram[],
  targetCount: number,
) {
  const programs = requestedPrograms.slice(0, targetCount)

  for (const fallbackProgram of fallbackPrograms) {
    if (programs.length >= targetCount) break
    if (!hasOverlappingRoomProgram(programs, fallbackProgram)) {
      programs.push(fallbackProgram)
    }
  }

  for (const fallbackProgram of fallbackPrograms) {
    if (programs.length >= targetCount) break
    programs.push(fallbackProgram)
  }

  return programs.slice(0, targetCount)
}

function getCourtyardFallbackRoomPrograms(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
): RoomProgram[] {
  if (language === 'en') {
    if (form.buildingType === 'hotel') {
      return [
        'Entry Hall',
        'Tea Lounge',
        'Guest Room',
        'Guest Room',
        'Dining Room',
        'Pantry',
        'Study',
        'Bathroom',
      ].map((name) => ({
        key: inferRoomProgramKey(name),
        name,
        source: 'default' as const,
      }))
    }

    if (form.buildingType === 'apartment') {
      return [
        'Entry Hall',
        'Living Room',
        'Dining Room',
        'Kitchen',
        'Primary Bedroom',
        'Bedroom',
        'Study',
        'Bathroom',
      ].map((name) => ({
        key: inferRoomProgramKey(name),
        name,
        source: 'default' as const,
      }))
    }

    if (floorIndex > 0) {
      return ['Family Lounge', 'Bedroom', 'Primary Bedroom', 'Study', 'Bathroom', 'Storage'].map(
        (name) => ({
          key: inferRoomProgramKey(name),
          name,
          source: 'default' as const,
        }),
      )
    }

    return [
      'Entry Hall',
      'Living Room',
      'Tea Room',
      'Dining Room',
      'Kitchen',
      'Guest Bedroom',
      'Study',
      'Bathroom',
    ].map((name) => ({
      key: inferRoomProgramKey(name),
      name,
      source: 'default' as const,
    }))
  }

  if (form.buildingType === 'hotel') {
    return ['门厅', '茶叙厅', '客房', '客房', '餐厅', '备餐间', '书房', '卫浴'].map((name) => ({
      key: inferRoomProgramKey(name),
      name,
      source: 'default' as const,
    }))
  }

  if (form.buildingType === 'apartment') {
    return ['门厅', '客厅', '餐厅', '厨房', '主卧', '次卧', '书房', '卫生间'].map((name) => ({
      key: inferRoomProgramKey(name),
      name,
      source: 'default' as const,
    }))
  }

  if (floorIndex > 0) {
    return ['家庭厅', '卧室', '主卧', '书房', '卫浴', '储藏间'].map((name) => ({
      key: inferRoomProgramKey(name),
      name,
      source: 'default' as const,
    }))
  }

  return ['门厅', '客厅', '茶室', '餐厅', '厨房', '客房', '书房', '卫生间'].map((name) => ({
    key: inferRoomProgramKey(name),
    name,
    source: 'default' as const,
  }))
}

function getCourtyardRoomPrograms(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
) {
  const requestedPrograms = getRequestedRoomProgramsByFloor(form, language)[floorIndex] ?? []
  const fallbackPrograms = getCourtyardFallbackRoomPrograms(form, floorIndex, language)
  return fillRoomProgramsToTargetCount(requestedPrograms, fallbackPrograms, 8)
}

function createCourtyardBandEdges(
  min: number,
  max: number,
  leadingBand: number,
  trailingBand: number,
  minCenterSpan: number,
) {
  const total = max - min
  if (total < leadingBand + trailingBand + minCenterSpan) return null

  let safeLeading = leadingBand
  let safeTrailing = trailingBand
  const availableBands = total - minCenterSpan

  if (safeLeading + safeTrailing > availableBands) {
    const scale = availableBands / (safeLeading + safeTrailing)
    safeLeading *= scale
    safeTrailing *= scale
  }

  return [min, min + safeLeading, max - safeTrailing, max] as const
}

function getPreferredCourtyardWidthEdges(
  minX: number,
  maxX: number,
  layoutHint?: AiBuildingGridLayoutHint | null,
) {
  const totalWidth = maxX - minX
  const minCourtWidth = Math.max(3.8, Math.min(totalWidth * 0.34, 6.8))
  if (totalWidth < MIN_ROOM_SPAN * 2 + minCourtWidth) return null

  if (layoutHint?.axis === 'width') {
    const gridEdges = createGridBreakpoints(minX, maxX, 3, layoutHint.spans, MIN_ROOM_SPAN)
    if (gridEdges && gridEdges[2]! - gridEdges[1]! >= minCourtWidth) {
      return [gridEdges[0]!, gridEdges[1]!, gridEdges[2]!, gridEdges[3]!] as const
    }
  }

  const sideBand = clampNumber(totalWidth * 0.22, MIN_ROOM_SPAN, totalWidth * 0.3)
  return createCourtyardBandEdges(minX, maxX, sideBand, sideBand, minCourtWidth)
}

function getPreferredCourtyardDepthEdges(
  minZ: number,
  maxZ: number,
  layoutHint?: AiBuildingGridLayoutHint | null,
) {
  const totalDepth = maxZ - minZ
  const minCourtDepth = Math.max(3.4, Math.min(totalDepth * 0.32, 6.2))
  if (totalDepth < MIN_ROOM_SPAN + 2.2 + minCourtDepth) return null

  if (layoutHint?.axis === 'depth') {
    const gridEdges = createGridBreakpoints(minZ, maxZ, 3, layoutHint.spans, MIN_ROOM_SPAN)
    if (gridEdges && gridEdges[2]! - gridEdges[1]! >= minCourtDepth) {
      return [gridEdges[0]!, gridEdges[1]!, gridEdges[2]!, gridEdges[3]!] as const
    }
  }

  const southBand = clampNumber(totalDepth * 0.2, 2.2, totalDepth * 0.28)
  const northBand = clampNumber(totalDepth * 0.26, MIN_ROOM_SPAN, totalDepth * 0.34)
  return createCourtyardBandEdges(minZ, maxZ, southBand, northBand, minCourtDepth)
}

function takePreferredRoomProgram(
  remainingPrograms: RoomProgram[],
  preferredKeys: readonly string[],
) {
  const preferredIndex = remainingPrograms.findIndex((program) =>
    preferredKeys.includes(program.key),
  )
  if (preferredIndex >= 0) {
    return remainingPrograms.splice(preferredIndex, 1)[0] ?? null
  }

  return remainingPrograms.shift() ?? null
}

function createCourtyardRoomLayout(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  layoutHint?: AiBuildingGridLayoutHint | null,
): AiBuildingLayoutPlan | null {
  const widthEdges = getPreferredCourtyardWidthEdges(minX, maxX, layoutHint)
  const depthEdges = getPreferredCourtyardDepthEdges(minZ, maxZ, layoutHint)
  if (!widthEdges || !depthEdges) return null

  const [, courtyardMinX, courtyardMaxX] = widthEdges
  const [, courtyardMinZ, courtyardMaxZ] = depthEdges
  const courtyardWidth = courtyardMaxX - courtyardMinX
  const courtyardDepth = courtyardMaxZ - courtyardMinZ
  if (courtyardWidth < 3.4 || courtyardDepth < 3.2) return null

  const partitionName = language === 'zh-CN' ? 'AI 围院隔墙' : 'AI Courtyard Partition'
  const courtyardPrograms = getCourtyardRoomPrograms(form, floorIndex, language)
  const remainingPrograms = [...courtyardPrograms]
  const sideSplitZ = courtyardMinZ + courtyardDepth / 2
  const slotDefinitions = [
    {
      key: 'south',
      polygon: rect(minX, minZ, maxX, courtyardMinZ),
      preferredKeys: ['entry', 'reception', 'corridor', 'garage', 'storage', 'stairs'],
    },
    {
      key: 'west_south',
      polygon: rect(minX, courtyardMinZ, courtyardMinX, sideSplitZ),
      preferredKeys: ['kitchen', 'dining_room', 'pantry', 'bathroom', 'storage'],
    },
    {
      key: 'west_north',
      polygon: rect(minX, sideSplitZ, courtyardMinX, courtyardMaxZ),
      preferredKeys: ['study', 'bedroom', 'meeting_room', 'bathroom'],
    },
    {
      key: 'north_west',
      polygon: rect(minX, courtyardMaxZ, courtyardMinX, maxZ),
      preferredKeys: ['primary_bedroom', 'bedroom', 'study', 'meeting_room'],
    },
    {
      key: 'north_center',
      polygon: rect(courtyardMinX, courtyardMaxZ, courtyardMaxX, maxZ),
      preferredKeys: ['living_room', 'reception', 'open_office', 'display_area'],
    },
    {
      key: 'north_east',
      polygon: rect(courtyardMaxX, courtyardMaxZ, maxX, maxZ),
      preferredKeys: ['primary_bedroom', 'bedroom', 'study', 'meeting_room'],
    },
    {
      key: 'east_north',
      polygon: rect(courtyardMaxX, sideSplitZ, maxX, courtyardMaxZ),
      preferredKeys: ['bedroom', 'study', 'meeting_room', 'bathroom'],
    },
    {
      key: 'east_south',
      polygon: rect(courtyardMaxX, courtyardMinZ, maxX, sideSplitZ),
      preferredKeys: ['dining_room', 'kitchen', 'pantry', 'bathroom', 'cashier'],
    },
  ] as const

  const rooms: AiBuildingRoomPlan[] = slotDefinitions.map((slot, index) => {
    const program =
      takePreferredRoomProgram(remainingPrograms, slot.preferredKeys) ?? courtyardPrograms[index]

    return {
      key: `${safeRoomKeyPart(program?.key ?? slot.key)}-${slot.key}`,
      name: program?.name ?? (language === 'zh-CN' ? '房间' : 'Room'),
      programKey: program?.key ?? 'room',
      color: getRoomColor(index),
      polygon: slot.polygon,
    }
  })

  rooms.push({
    key: 'courtyard-core',
    name: language === 'zh-CN' ? '庭院' : 'Courtyard',
    programKey: 'courtyard',
    color: '#9ccc65',
    polygon: rect(courtyardMinX, courtyardMinZ, courtyardMaxX, courtyardMaxZ),
  })

  const walls = [
    createInteriorWall(
      'courtyard_south_edge',
      partitionName,
      [courtyardMinX, courtyardMinZ],
      [courtyardMaxX, courtyardMinZ],
    ),
    createInteriorWall(
      'courtyard_west_edge',
      partitionName,
      [courtyardMinX, courtyardMinZ],
      [courtyardMinX, courtyardMaxZ],
    ),
    createInteriorWall(
      'courtyard_east_edge',
      partitionName,
      [courtyardMaxX, courtyardMinZ],
      [courtyardMaxX, courtyardMaxZ],
    ),
    createInteriorWall(
      'courtyard_north_edge',
      partitionName,
      [courtyardMinX, courtyardMaxZ],
      [courtyardMaxX, courtyardMaxZ],
    ),
    createInteriorWall(
      'west_wing_split',
      partitionName,
      [minX, sideSplitZ],
      [courtyardMinX, sideSplitZ],
    ),
    createInteriorWall(
      'east_wing_split',
      partitionName,
      [courtyardMaxX, sideSplitZ],
      [maxX, sideSplitZ],
    ),
    createInteriorWall(
      'north_west_split',
      partitionName,
      [courtyardMinX, courtyardMaxZ],
      [courtyardMinX, maxZ],
    ),
    createInteriorWall(
      'north_east_split',
      partitionName,
      [courtyardMaxX, courtyardMaxZ],
      [courtyardMaxX, maxZ],
    ),
  ]

  return {
    rooms,
    walls,
    courtyardPolygon: rect(courtyardMinX, courtyardMinZ, courtyardMaxX, courtyardMaxZ),
  }
}

function createLegacyRoomLayout(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  layoutHint?: AiBuildingGridLayoutHint | null,
) {
  if (isResidentialCourtyardLayout(form, floorIndex)) {
    const courtyardLayout = createCourtyardRoomLayout(
      form,
      floorIndex,
      language,
      minX,
      maxX,
      minZ,
      maxZ,
      layoutHint,
    )
    if (courtyardLayout) return courtyardLayout
  }

  const roomPrograms = getRoomPrograms(form, floorIndex, language)
  const rowCounts = getRoomRowCounts(roomPrograms.length, form)
  const rowEdges = createRowBreakpoints(minZ, maxZ, rowCounts.length, form, layoutHint)
  const partitionName = language === 'zh-CN' ? 'AI 隔墙' : 'AI Partition'
  const rooms: AiBuildingRoomPlan[] = []
  const walls: AiBuildingWallPlan[] = []
  let roomIndex = 0

  for (let rowIndex = 0; rowIndex < rowCounts.length; rowIndex += 1) {
    const rowMinZ = rowEdges[rowIndex] ?? minZ
    const rowMaxZ = rowEdges[rowIndex + 1] ?? maxZ
    const columnCount = rowCounts[rowIndex] ?? 1
    const columnEdges = createColumnBreakpoints(minX, maxX, columnCount, form, layoutHint)

    if (rowIndex > 0) {
      walls.push(
        createInteriorWall(
          `divider-row-${rowIndex}`,
          partitionName,
          [minX, rowMinZ],
          [maxX, rowMinZ],
        ),
      )
    }

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const columnMinX = columnEdges[columnIndex] ?? minX
      const columnMaxX = columnEdges[columnIndex + 1] ?? maxX
      const program = roomPrograms[roomIndex] ?? {
        key: 'room',
        name: language === 'zh-CN' ? '房间' : 'Room',
        source: 'default' as const,
      }

      if (columnIndex > 0) {
        walls.push(
          createInteriorWall(
            `divider-row-${rowIndex}-col-${columnIndex}`,
            partitionName,
            [columnMinX, rowMinZ],
            [columnMinX, rowMaxZ],
          ),
        )
      }

      rooms.push({
        key: `${safeRoomKeyPart(program.key)}-${roomIndex + 1}`,
        name: program.name,
        programKey: program.key,
        color: getRoomColor(roomIndex),
        polygon: rect(columnMinX, rowMinZ, columnMaxX, rowMaxZ),
      })
      roomIndex += 1
    }
  }

  return { rooms, walls, courtyardPolygon: null }
}

function createRoomLayout(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  layoutHint?: AiBuildingGridLayoutHint | null,
  previousFloorAnchors?: ProgramDrivenVerticalAnchor[],
  plannedAnchors?: ProgramDrivenVerticalAnchor[],
) {
  if (!isResidentialCourtyardLayout(form, floorIndex)) {
    const programDrivenLayout = createProgramDrivenRoomLayout({
      buildingType: form.buildingType,
      variant: form.variant,
      width: form.width,
      depth: form.depth,
      floorIndex,
      language,
      minX,
      maxX,
      minZ,
      maxZ,
      roomPrograms: getRoomPrograms(form, floorIndex, language).map((program) => ({
        key: program.key,
        name: program.name,
      })),
      layoutHint: layoutHint
        ? {
            axis: layoutHint.axis,
            spans: layoutHint.spans,
          }
        : null,
      previousFloorAnchors,
      plannedAnchors,
    })

    if (programDrivenLayout) {
      return programDrivenLayout
    }
  }

  return createLegacyRoomLayout(form, floorIndex, language, minX, maxX, minZ, maxZ, layoutHint)
}

function createWallPositions(length: number, count: number) {
  return Array.from({ length: count }, (_, index) => (length * (index + 1)) / (count + 1))
}

type AiBuildingInteriorDoorCandidate = {
  wall: AiBuildingWallPlan
  rooms: [AiBuildingRoomPlan, AiBuildingRoomPlan]
  localX: number
  overlapLength: number
  rangeStart: number
  rangeEnd: number
  priority: number
}

type AiBuildingOpeningProfile = {
  entryDoorWidth: number
  entryDoorHeight: number
  interiorDoorWidth: number
  interiorDoorHeight: number
  primaryWindowWidth: number
  primaryWindowHeight: number
  primaryWindowCenterY: number
  secondaryWindowWidth: number
  secondaryWindowHeight: number
  secondaryWindowCenterY: number
}

type AiBuildingOpeningBias = 'balanced' | 'primary-facade'
type AiBuildingFurnishingBias = 'layered' | 'circulation-first'
type AiBuildingGenerationOptions = {
  openingBias?: AiBuildingOpeningBias
  furnishingBias?: AiBuildingFurnishingBias
}

type AiBuildingPlanCandidate = ReturnType<typeof createPlanCandidate>

function getRoomAccessClass(programKey?: string) {
  if (
    programKey === 'entry' ||
    programKey === 'stairs' ||
    programKey === 'elevator' ||
    programKey === 'courtyard'
  ) {
    return 'circulation'
  }

  if (
    programKey === 'living_room' ||
    programKey === 'dining_room' ||
    programKey === 'open_office' ||
    programKey === 'meeting_room' ||
    programKey === 'display_area'
  ) {
    return 'public'
  }

  if (
    programKey === 'kitchen' ||
    programKey === 'pantry' ||
    programKey === 'bathroom' ||
    programKey === 'garage' ||
    programKey === 'storage' ||
    programKey === 'equipment_room' ||
    programKey === 'production' ||
    programKey === 'cashier'
  ) {
    return 'service'
  }

  if (programKey === 'bedroom' || programKey === 'primary_bedroom' || programKey === 'study') {
    return 'private'
  }

  if (programKey === 'balcony') return 'outdoor'
  return 'other'
}

function isPrivateAccessClass(accessClass: ReturnType<typeof getRoomAccessClass>) {
  return accessClass === 'private'
}

function isBathroomProgram(programKey?: string) {
  return programKey === 'bathroom'
}

function isLivingOrDiningProgram(programKey?: string) {
  return programKey === 'living_room' || programKey === 'dining_room'
}

function isKitchenLikeProgram(programKey?: string) {
  return programKey === 'kitchen' || programKey === 'pantry'
}

function isEntryLikeProgram(programKey?: string) {
  return programKey === 'entry' || programKey === 'reception'
}

function isPrivateRoomAccessory(programKey?: string) {
  return programKey === 'bathroom' || programKey === 'balcony'
}

function isForbiddenInteriorDoorPair(leftRoom: AiBuildingRoomPlan, rightRoom: AiBuildingRoomPlan) {
  const leftClass = getRoomAccessClass(leftRoom.programKey)
  const rightClass = getRoomAccessClass(rightRoom.programKey)

  if (isPrivateAccessClass(leftClass) && isPrivateAccessClass(rightClass)) return true

  if (
    (isBathroomProgram(leftRoom.programKey) && isLivingOrDiningProgram(rightRoom.programKey)) ||
    (isBathroomProgram(rightRoom.programKey) && isLivingOrDiningProgram(leftRoom.programKey))
  ) {
    return true
  }

  if (
    (isKitchenLikeProgram(leftRoom.programKey) &&
      (isPrivateAccessClass(rightClass) || isBathroomProgram(rightRoom.programKey))) ||
    (isKitchenLikeProgram(rightRoom.programKey) &&
      (isPrivateAccessClass(leftClass) || isBathroomProgram(leftRoom.programKey)))
  ) {
    return true
  }

  return false
}

function getWallLocalXFromPoint(wall: AiBuildingWallPlan, point: Point2D) {
  return Math.hypot(point[0] - wall.start[0], point[1] - wall.start[1])
}

function getRoomContactRangeOnWall(room: AiBuildingRoomPlan, wall: AiBuildingWallPlan) {
  const roomMetrics = getRoomMetrics(room)
  const epsilon = 0.08

  if (Math.abs(wall.start[1] - wall.end[1]) < epsilon) {
    const wallZ = wall.start[1]
    const overlapStart = Math.max(roomMetrics.minX, Math.min(wall.start[0], wall.end[0]))
    const overlapEnd = Math.min(roomMetrics.maxX, Math.max(wall.start[0], wall.end[0]))
    if (overlapEnd - overlapStart < 0.2) return null
    if (Math.abs(roomMetrics.minZ - wallZ) <= epsilon) {
      return { side: 'south' as const, rangeStart: overlapStart, rangeEnd: overlapEnd }
    }
    if (Math.abs(roomMetrics.maxZ - wallZ) <= epsilon) {
      return { side: 'north' as const, rangeStart: overlapStart, rangeEnd: overlapEnd }
    }
    return null
  }

  if (Math.abs(wall.start[0] - wall.end[0]) < epsilon) {
    const wallX = wall.start[0]
    const overlapStart = Math.max(roomMetrics.minZ, Math.min(wall.start[1], wall.end[1]))
    const overlapEnd = Math.min(roomMetrics.maxZ, Math.max(wall.start[1], wall.end[1]))
    if (overlapEnd - overlapStart < 0.2) return null
    if (Math.abs(roomMetrics.minX - wallX) <= epsilon) {
      return { side: 'west' as const, rangeStart: overlapStart, rangeEnd: overlapEnd }
    }
    if (Math.abs(roomMetrics.maxX - wallX) <= epsilon) {
      return { side: 'east' as const, rangeStart: overlapStart, rangeEnd: overlapEnd }
    }
  }

  return null
}

function getInteriorDoorPriority(
  leftRoom: AiBuildingRoomPlan,
  rightRoom: AiBuildingRoomPlan,
  overlapLength: number,
) {
  const leftClass = getRoomAccessClass(leftRoom.programKey)
  const rightClass = getRoomAccessClass(rightRoom.programKey)
  const classes = new Set([leftClass, rightClass])
  let score = overlapLength * 6

  if (classes.has('circulation')) score += 92
  else if (classes.has('public') && classes.has('private')) score += 74
  else if (classes.has('public') && classes.has('service')) score += 70
  else if (classes.has('public')) score += 58
  else if (classes.has('service') && classes.has('private')) score += 20
  else if (classes.has('service')) score -= 8
  else if (classes.has('private')) score -= 22

  if (
    (isKitchenLikeProgram(leftRoom.programKey) &&
      (rightClass === 'public' || rightClass === 'circulation')) ||
    (isKitchenLikeProgram(rightRoom.programKey) &&
      (leftClass === 'public' || leftClass === 'circulation'))
  ) {
    score += 28
  }

  if (
    (isKitchenLikeProgram(leftRoom.programKey) && rightClass === 'service') ||
    (isKitchenLikeProgram(rightRoom.programKey) && leftClass === 'service')
  ) {
    score -= 12
  }

  if (leftRoom.programKey === 'bathroom' || rightRoom.programKey === 'bathroom') {
    const otherRoom = leftRoom.programKey === 'bathroom' ? rightRoom : leftRoom
    const otherClass = getRoomAccessClass(otherRoom.programKey)
    if (otherClass === 'circulation') score += 38
    else if (isPrivateAccessClass(otherClass)) score += 16
    else if (isEntryLikeProgram(otherRoom.programKey)) score -= 48
    else if (otherClass === 'public') score -= 28
    else score -= 6
  }
  if (leftRoom.programKey === 'garage' || rightRoom.programKey === 'garage') {
    score += classes.has('circulation') || classes.has('public') ? 16 : -14
  }
  if (leftRoom.programKey === 'courtyard' || rightRoom.programKey === 'courtyard') {
    score += 22
  }
  if (leftRoom.programKey === 'balcony' || rightRoom.programKey === 'balcony') {
    score -= 36
  }

  return score
}

function getInteriorDoorCandidates(
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  interiorDoorWidth: number,
  allowForbiddenPairs = false,
) {
  const minOverlapLength = Math.max(interiorDoorWidth + 0.36, 1.2)

  return walls
    .filter((wall) => wall.role === 'inner')
    .flatMap((wall) => {
      const contacts = rooms
        .map((room) => {
          const contact = getRoomContactRangeOnWall(room, wall)
          return contact ? { room, contact } : null
        })
        .filter(
          (
            entry,
          ): entry is {
            room: AiBuildingRoomPlan
            contact: NonNullable<ReturnType<typeof getRoomContactRangeOnWall>>
          } => Boolean(entry),
        )

      if (contacts.length < 2) return []

      const isHorizontal = Math.abs(wall.start[1] - wall.end[1]) < 0.08
      const leadingContacts = contacts.filter(({ contact }) =>
        isHorizontal ? contact.side === 'south' : contact.side === 'west',
      )
      const trailingContacts = contacts.filter(({ contact }) =>
        isHorizontal ? contact.side === 'north' : contact.side === 'east',
      )

      return leadingContacts.flatMap((leading) =>
        trailingContacts.flatMap((trailing) => {
          if (leading.room.key === trailing.room.key) return []
          if (!allowForbiddenPairs && isForbiddenInteriorDoorPair(leading.room, trailing.room)) {
            return []
          }
          const overlapStart = Math.max(leading.contact.rangeStart, trailing.contact.rangeStart)
          const overlapEnd = Math.min(leading.contact.rangeEnd, trailing.contact.rangeEnd)
          const overlapLength = overlapEnd - overlapStart
          if (overlapLength < minOverlapLength) return []

          const midpoint = (overlapStart + overlapEnd) / 2
          const localX = getWallLocalXFromPoint(
            wall,
            isHorizontal ? [midpoint, wall.start[1]] : [wall.start[0], midpoint],
          )

          return [
            {
              wall,
              rooms: [leading.room, trailing.room] as [AiBuildingRoomPlan, AiBuildingRoomPlan],
              localX,
              overlapLength,
              rangeStart: overlapStart,
              rangeEnd: overlapEnd,
              priority: getInteriorDoorPriority(leading.room, trailing.room, overlapLength),
            } satisfies AiBuildingInteriorDoorCandidate,
          ]
        }),
      )
    })
}

function getInteriorDoorRootRoom(rooms: AiBuildingRoomPlan[]) {
  return (
    rooms.find((room) => room.programKey === 'entry') ??
    rooms.find((room) => getRoomAccessClass(room.programKey) === 'circulation') ??
    rooms.find((room) => getRoomAccessClass(room.programKey) === 'public') ??
    rooms[0] ??
    null
  )
}

function selectInteriorDoorCandidates(
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  interiorDoorWidth: number,
) {
  const candidates = getInteriorDoorCandidates(rooms, walls, interiorDoorWidth)
  const rootRoom = getInteriorDoorRootRoom(rooms)
  if (!rootRoom || candidates.length === 0) return []

  const connected = new Set<string>([rootRoom.key])
  const selected: AiBuildingInteriorDoorCandidate[] = []
  const remaining = [...candidates]
  const roomDoorCounts = new Map<string, number>()

  while (connected.size < rooms.length && remaining.length > 0) {
    let bestIndex = -1
    let bestScore = Number.NEGATIVE_INFINITY

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]
      if (!candidate) continue
      const [leftRoom, rightRoom] = candidate.rooms
      const leftConnected = connected.has(leftRoom.key)
      const rightConnected = connected.has(rightRoom.key)
      if (leftConnected === rightConnected) continue

      const nextRoom = leftConnected ? rightRoom : leftRoom
      const connectedRoom = leftConnected ? leftRoom : rightRoom
      const nextClass = getRoomAccessClass(nextRoom.programKey)
      const connectedClass = getRoomAccessClass(connectedRoom.programKey)
      const connectedDoorCount = roomDoorCounts.get(connectedRoom.key) ?? 0
      const nextDoorCount = roomDoorCounts.get(nextRoom.key) ?? 0

      if (isPrivateAccessClass(connectedClass) && !isPrivateRoomAccessory(nextRoom.programKey)) {
        continue
      }

      if (isPrivateAccessClass(connectedClass) && connectedDoorCount >= 2) continue
      if (isPrivateAccessClass(nextClass) && nextDoorCount >= 1) continue

      if (isBathroomProgram(connectedRoom.programKey)) continue

      if (
        isKitchenLikeProgram(nextRoom.programKey) &&
        !(connectedClass === 'public' || connectedClass === 'circulation')
      ) {
        continue
      }

      if (
        isKitchenLikeProgram(connectedRoom.programKey) &&
        !(nextClass === 'public' || nextClass === 'circulation')
      ) {
        continue
      }

      let score = candidate.priority
      score -= nextDoorCount * 18
      score -= connectedDoorCount * 10
      if (nextClass === 'private') score += 8
      if (nextClass === 'service') score += 3
      if (isPrivateRoomAccessory(nextRoom.programKey) && isPrivateAccessClass(connectedClass)) {
        score += 14
      }
      if (isBathroomProgram(nextRoom.programKey) || isBathroomProgram(connectedRoom.programKey)) {
        const bathroomCompanion = isBathroomProgram(nextRoom.programKey) ? connectedRoom : nextRoom
        const companionClass = getRoomAccessClass(bathroomCompanion.programKey)
        if (companionClass === 'circulation') score += 26
        else if (isPrivateAccessClass(companionClass)) score += 12
        else if (isEntryLikeProgram(bathroomCompanion.programKey)) score -= 72
        else if (companionClass === 'public') score -= 36
      }

      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    }

    if (bestIndex < 0) break

    const candidate = remaining.splice(bestIndex, 1)[0]
    if (!candidate) continue
    selected.push(candidate)
    for (const room of candidate.rooms) {
      connected.add(room.key)
      roomDoorCounts.set(room.key, (roomDoorCounts.get(room.key) ?? 0) + 1)
    }
  }

  return selected
}

function shouldRequireRoomDoor(room: AiBuildingRoomPlan) {
  return room.programKey !== 'courtyard'
}

function getRoomDoorCountsByKey(
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  openings: AiBuildingOpeningPlan[],
) {
  const doorCounts = new Map(rooms.map((room) => [room.key, 0]))

  for (const opening of openings) {
    if (opening.kind !== 'door') continue
    for (const room of rooms) {
      if (doesRoomUseOpening(room, walls, opening)) {
        doorCounts.set(room.key, (doorCounts.get(room.key) ?? 0) + 1)
      }
    }
  }

  return doorCounts
}

function isInteriorDoorOpeningDuplicate(
  openings: AiBuildingOpeningPlan[],
  candidate: AiBuildingInteriorDoorCandidate,
  localX: number,
  doorWidth: number,
) {
  return openings.some(
    (opening) =>
      opening.kind === 'door' &&
      opening.wallKey === candidate.wall.key &&
      Math.abs(opening.localX - localX) < Math.max(0.12, doorWidth * 0.42),
  )
}

function getInteriorDoorCandidateLocalRange(candidate: AiBuildingInteriorDoorCandidate) {
  const halfOverlap = candidate.overlapLength / 2
  return {
    start: candidate.localX - halfOverlap,
    end: candidate.localX + halfOverlap,
  }
}

function getInteriorDoorCandidateLocalXBounds(
  candidate: AiBuildingInteriorDoorCandidate,
  doorWidth: number,
) {
  const localRange = getInteriorDoorCandidateLocalRange(candidate)
  return getDoorLocalXBounds(localRange.start, localRange.end, doorWidth)
}

function clampInteriorDoorLocalXToCandidate(
  localX: number,
  candidate: AiBuildingInteriorDoorCandidate,
  doorWidth: number,
) {
  const bounds = getInteriorDoorCandidateLocalXBounds(candidate, doorWidth)
  return clampNumber(localX, bounds.min, bounds.max)
}

function scoreRequiredRoomDoorCandidate(
  candidate: AiBuildingInteriorDoorCandidate,
  missingRoom: AiBuildingRoomPlan,
  doorCounts: Map<string, number>,
) {
  const companionRoom = candidate.rooms.find((room) => room.key !== missingRoom.key) ?? null
  const companionClass = companionRoom ? getRoomAccessClass(companionRoom.programKey) : 'other'
  let score = candidate.priority

  if (missingRoom.programKey === 'stairs') score += 52
  if (companionRoom && (doorCounts.get(companionRoom.key) ?? 0) > 0) score += 46
  if (companionClass === 'circulation') score += 34
  else if (companionClass === 'public') score += 24
  else if (companionClass === 'service') score += 6
  else if (companionClass === 'private') score -= 18

  if (isBathroomProgram(missingRoom.programKey) && companionClass === 'public') score -= 22
  if (isKitchenLikeProgram(missingRoom.programKey) && companionClass === 'public') score += 10

  return score
}

function ensureRequiredRoomDoorOpenings(
  openings: AiBuildingOpeningPlan[],
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  profile: AiBuildingOpeningProfile,
  entryDoorLocalX: number | null,
  doorName: string,
) {
  const nextOpenings = [...openings]
  const candidates = getInteriorDoorCandidates(rooms, walls, profile.interiorDoorWidth)
  const maxAddedDoors = rooms.filter(shouldRequireRoomDoor).length

  for (let addedDoorCount = 0; addedDoorCount < maxAddedDoors; addedDoorCount += 1) {
    const doorCounts = getRoomDoorCountsByKey(rooms, walls, nextOpenings)
    const missingRooms = rooms.filter(
      (room) => shouldRequireRoomDoor(room) && (doorCounts.get(room.key) ?? 0) === 0,
    )
    if (missingRooms.length === 0) break

    let best:
      | {
          candidate: AiBuildingInteriorDoorCandidate
          localX: number
          score: number
        }
      | null = null

    for (const missingRoom of missingRooms) {
      for (const candidate of candidates) {
        if (!candidate.rooms.some((room) => room.key === missingRoom.key)) continue
        const localX = getPreferredInteriorDoorLocalX(
          candidate,
          profile.interiorDoorWidth,
          entryDoorLocalX,
        )
        if (
          isInteriorDoorOpeningDuplicate(nextOpenings, candidate, localX, profile.interiorDoorWidth)
        ) {
          continue
        }

        const score = scoreRequiredRoomDoorCandidate(candidate, missingRoom, doorCounts)
        if (!best || score > best.score) {
          best = {
            candidate,
            localX,
            score,
          }
        }
      }
    }

    if (!best) break

    nextOpenings.push({
      kind: 'door',
      wallKey: best.candidate.wall.key,
      name: doorName,
      localX: best.localX,
      centerY: 1.05,
      width: profile.interiorDoorWidth,
      height: profile.interiorDoorHeight,
      wallAxis: getWallAxisFromKey(best.candidate.wall.key),
      strategy: 'centered',
      facade: 'interior',
    })
  }

  return nextOpenings
}

function getWallLocalXNearPoint(wall: AiBuildingWallPlan, point: Point2D) {
  const projectedPoint: Point2D =
    Math.abs(wall.start[1] - wall.end[1]) < 0.08
      ? [point[0], wall.start[1]]
      : [wall.start[0], point[1]]
  return clampNumber(getWallLocalXFromPoint(wall, projectedPoint), 0, getWallLength(wall))
}

function ensureStairArrivalDoorOpenings(
  openings: AiBuildingOpeningPlan[],
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  previousFloorStairs: AiBuildingStairPlan[],
  profile: AiBuildingOpeningProfile,
  doorName: string,
) {
  if (previousFloorStairs.length === 0) return openings

  const nextOpenings = [...openings]
  const stairRooms = rooms.filter((room) => room.programKey === 'stairs')
  if (stairRooms.length === 0) return nextOpenings

  for (const stair of previousFloorStairs) {
    const routeRects = getStairRouteRects(stair)
    const arrivalPoint = routeRects.endLandingCenter

    for (const wall of walls.filter((entry) => entry.role === 'inner')) {
      const crossing = getWallBlockedIntervalForRect(wall, routeRects.endRouteRect)
      if (!crossing) continue

      const preferredLocalX = getWallLocalXNearPoint(wall, arrivalPoint)
      const localX = clampDoorLocalXToBounds(
        preferredLocalX,
        crossing.start,
        crossing.end,
        profile.interiorDoorWidth,
      )
      const candidateOpening: AiBuildingOpeningPlan = {
        kind: 'door',
        wallKey: wall.key,
        name: doorName,
        localX,
        centerY: 1.05,
        width: profile.interiorDoorWidth,
        height: profile.interiorDoorHeight,
        wallAxis: getWallAxisFromKey(wall.key),
        strategy: 'centered',
        facade: 'interior',
      }
      const connectedRooms = rooms.filter((room) =>
        doesRoomUseOpening(room, walls, candidateOpening),
      )
      if (!connectedRooms.some((room) => room.programKey === 'stairs')) continue
      if (connectedRooms.length < 2) continue
      if (
        nextOpenings.some(
          (opening) =>
            opening.kind === 'door' &&
            opening.wallKey === wall.key &&
            Math.abs(opening.localX - localX) < Math.max(0.12, profile.interiorDoorWidth * 0.42),
        )
      ) {
        continue
      }

      nextOpenings.push(candidateOpening)
      break
    }
  }

  return nextOpenings
}

function getOpeningReachabilitySources(
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  openings: AiBuildingOpeningPlan[],
) {
  const sourceKeys = new Set<string>()

  for (const room of rooms) {
    if (room.programKey === 'entry' || room.programKey === 'reception' || room.programKey === 'stairs') {
      sourceKeys.add(room.key)
    }
  }

  for (const opening of openings) {
    if (opening.kind !== 'door' || opening.facade === 'interior') continue
    for (const room of rooms) {
      if (doesRoomUseOpening(room, walls, opening)) {
        sourceKeys.add(room.key)
      }
    }
  }

  return sourceKeys
}

function getReachableRoomKeysFromOpenings(
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  openings: AiBuildingOpeningPlan[],
  sourceKeys: Set<string>,
) {
  const adjacency = new Map(rooms.map((room) => [room.key, new Set<string>()]))
  for (const opening of openings) {
    if (opening.kind !== 'door') continue
    const connectedRooms = rooms.filter((room) => doesRoomUseOpening(room, walls, opening))
    for (let index = 0; index < connectedRooms.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < connectedRooms.length; nextIndex += 1) {
        const leftRoom = connectedRooms[index]
        const rightRoom = connectedRooms[nextIndex]
        if (!leftRoom || !rightRoom || leftRoom.key === rightRoom.key) continue
        adjacency.get(leftRoom.key)?.add(rightRoom.key)
        adjacency.get(rightRoom.key)?.add(leftRoom.key)
      }
    }
  }

  const reachable = new Set<string>()
  const queue: string[] = []
  for (const sourceKey of sourceKeys) {
    if (!adjacency.has(sourceKey)) continue
    reachable.add(sourceKey)
    queue.push(sourceKey)
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const roomKey = queue[cursor]
    if (!roomKey) continue
    for (const nextKey of adjacency.get(roomKey) ?? []) {
      if (reachable.has(nextKey)) continue
      reachable.add(nextKey)
      queue.push(nextKey)
    }
  }

  return reachable
}

function ensureRouteReachabilityDoorOpenings(
  openings: AiBuildingOpeningPlan[],
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  profile: AiBuildingOpeningProfile,
  entryDoorLocalX: number | null,
  doorName: string,
) {
  const strictCandidates = getInteriorDoorCandidates(rooms, walls, profile.interiorDoorWidth)
  const permissiveCandidates = getInteriorDoorCandidates(
    rooms,
    walls,
    profile.interiorDoorWidth,
    true,
  )
  if (strictCandidates.length === 0 && permissiveCandidates.length === 0) return openings

  const nextOpenings = [...openings]
  const maxAddedDoors = rooms.filter(shouldRequireRoomDoor).length

  for (let addedDoorCount = 0; addedDoorCount < maxAddedDoors; addedDoorCount += 1) {
    const sourceKeys = getOpeningReachabilitySources(rooms, walls, nextOpenings)
    const reachableKeys = getReachableRoomKeysFromOpenings(rooms, walls, nextOpenings, sourceKeys)
    const unreachableRooms = rooms.filter(
      (room) => shouldRequireRoomDoor(room) && !reachableKeys.has(room.key),
    )
    if (unreachableRooms.length === 0) break

    let best:
      | {
          candidate: AiBuildingInteriorDoorCandidate
          localX: number
          score: number
        }
      | null = null

    for (const candidateSet of [strictCandidates, permissiveCandidates]) {
      for (const candidate of candidateSet) {
        const [leftRoom, rightRoom] = candidate.rooms
        const leftReachable = reachableKeys.has(leftRoom.key)
        const rightReachable = reachableKeys.has(rightRoom.key)
        if (leftReachable === rightReachable) continue

        const localX = getPreferredInteriorDoorLocalX(
          candidate,
          profile.interiorDoorWidth,
          entryDoorLocalX,
        )
        if (
          isInteriorDoorOpeningDuplicate(nextOpenings, candidate, localX, profile.interiorDoorWidth)
        ) {
          continue
        }

        const missingRoom = leftReachable ? rightRoom : leftRoom
        const doorCounts = getRoomDoorCountsByKey(rooms, walls, nextOpenings)
        const privacyPenalty = isForbiddenInteriorDoorPair(leftRoom, rightRoom) ? 240 : 0
        const score =
          scoreRequiredRoomDoorCandidate(candidate, missingRoom, doorCounts) +
          (missingRoom.programKey === 'stairs' ? 60 : 0) -
          privacyPenalty
        if (!best || score > best.score) {
          best = {
            candidate,
            localX,
            score,
          }
        }
      }
      if (best) break
    }

    if (!best) break

    nextOpenings.push({
      kind: 'door',
      wallKey: best.candidate.wall.key,
      name: doorName,
      localX: best.localX,
      centerY: 1.05,
      width: profile.interiorDoorWidth,
      height: profile.interiorDoorHeight,
      wallAxis: getWallAxisFromKey(best.candidate.wall.key),
      strategy: 'centered',
      facade: 'interior',
    })
  }

  return nextOpenings
}

function getExteriorWallExpectedSide(wallKey: string) {
  if (wallKey === 'south') return 'south'
  if (wallKey === 'north') return 'north'
  if (wallKey === 'west') return 'west'
  if (wallKey === 'east') return 'east'
  return null
}

function getWallLocalRange(wall: AiBuildingWallPlan, rangeStart: number, rangeEnd: number) {
  const startPoint =
    Math.abs(wall.start[1] - wall.end[1]) < 0.08
      ? ([rangeStart, wall.start[1]] as Point2D)
      : ([wall.start[0], rangeStart] as Point2D)
  const endPoint =
    Math.abs(wall.start[1] - wall.end[1]) < 0.08
      ? ([rangeEnd, wall.start[1]] as Point2D)
      : ([wall.start[0], rangeEnd] as Point2D)
  const localStart = getWallLocalXFromPoint(wall, startPoint)
  const localEnd = getWallLocalXFromPoint(wall, endPoint)
  return {
    start: Math.min(localStart, localEnd),
    end: Math.max(localStart, localEnd),
  }
}

function getDoorLocalXBounds(rangeStart: number, rangeEnd: number, doorWidth: number) {
  const inset = Math.max(0.06, doorWidth * 0.55)
  const min = rangeStart + inset
  const max = rangeEnd - inset
  if (max <= min) {
    return {
      min: Math.min(rangeStart, rangeEnd),
      max: Math.max(rangeStart, rangeEnd),
    }
  }

  return {
    min,
    max,
  }
}

function clampDoorLocalXToBounds(
  localX: number,
  rangeStart: number,
  rangeEnd: number,
  doorWidth: number,
) {
  const bounds = getDoorLocalXBounds(rangeStart, rangeEnd, doorWidth)
  return clampNumber(localX, bounds.min, bounds.max)
}

function getPreferredEntryDoorLocalX(
  form: AiBuildingFormState,
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  doorWidth: number,
  layoutHint?: AiBuildingGridLayoutHint | null,
) {
  const southWall = walls.find((wall) => wall.key === 'south')
  if (!southWall) {
    return getCentralOpeningPosition(form.width, 'width', layoutHint)
  }

  const prioritizedPrograms = ['entry', 'reception', 'living_room', 'dining_room']
  for (const programKey of prioritizedPrograms) {
    const bestContact = rooms
      .filter((room) => room.programKey === programKey)
      .map((room) => {
        const contact = getRoomContactRangeOnWall(room, southWall)
        if (!contact || contact.side !== 'south') return null
        return {
          room,
          localRange: getWallLocalRange(southWall, contact.rangeStart, contact.rangeEnd),
        }
      })
      .filter(
        (
          entry,
        ): entry is {
          room: AiBuildingRoomPlan
          localRange: ReturnType<typeof getWallLocalRange>
        } => Boolean(entry),
      )
      .sort(
        (left, right) =>
          right.localRange.end -
          right.localRange.start -
          (left.localRange.end - left.localRange.start),
      )[0]

    if (!bestContact) continue

    const preferredLocalX = (bestContact.localRange.start + bestContact.localRange.end) / 2
    return getSnappedDoorLocalX(
      southWall,
      bestContact.localRange.start,
      bestContact.localRange.end,
      doorWidth,
      getWallAxisFromKey(southWall.key),
      layoutHint,
      preferredLocalX,
    )
  }

  return getCentralOpeningPosition(form.width, 'width', layoutHint)
}

function getSnappedDoorLocalX(
  wall: AiBuildingWallPlan,
  rangeStart: number,
  rangeEnd: number,
  doorWidth: number,
  wallAxis: AiBuildingWallAxis | null,
  layoutHint: AiBuildingGridLayoutHint | null | undefined,
  preferredLocalX: number,
) {
  const bounds = getDoorLocalXBounds(rangeStart, rangeEnd, doorWidth)
  const preferred = clampNumber(preferredLocalX, bounds.min, bounds.max)
  const snappedCandidates = getOpeningPositions(
    getWallLength(wall),
    5,
    wallAxis,
    layoutHint,
  ).filter((value) => value >= bounds.min && value <= bounds.max)
  if (snappedCandidates.length === 0) return preferred

  return snappedCandidates.reduce((best, value) =>
    Math.abs(value - preferred) < Math.abs(best - preferred) ? value : best,
  )
}

function getRoomFrontBufferDepth(room: AiBuildingRoomPlan) {
  const bounds = getRoomBounds(room)
  const depth = Math.max(0, bounds.maxZ - bounds.minZ)
  const minDepth = Math.min(0.72, depth * 0.28)
  const maxDepth = Math.max(minDepth, Math.min(1.35, Math.max(0.12, depth - 0.24)))
  return clampNumber(depth * 0.42, minDepth, maxDepth)
}

function getDoorPlacementLocalXs(bounds: { min: number; max: number }, midpoint: number) {
  const span = Math.max(0, bounds.max - bounds.min)
  const sampleCount = span > 0.9 ? 9 : span > 0.45 ? 7 : 5
  const evenlyDistributed = Array.from({ length: sampleCount }, (_, index) =>
    clampNumber(bounds.min + (span * index) / Math.max(1, sampleCount - 1), bounds.min, bounds.max),
  )

  return [
    bounds.min,
    bounds.max,
    midpoint,
    clampNumber(bounds.min + span * 0.25, bounds.min, bounds.max),
    clampNumber(bounds.min + span * 0.5, bounds.min, bounds.max),
    clampNumber(bounds.min + span * (2 / 3), bounds.min, bounds.max),
    clampNumber(bounds.min + span * 0.75, bounds.min, bounds.max),
    ...evenlyDistributed,
  ].filter(
    (value, index, array) => array.findIndex((entry) => Math.abs(entry - value) < 0.02) === index,
  )
}

function isEntryBufferDoorCandidate(candidate: AiBuildingInteriorDoorCandidate) {
  return (
    candidate.rooms.some((room) => isEntryLikeProgram(room.programKey)) &&
    candidate.rooms.some((room) => {
      if (isEntryLikeProgram(room.programKey)) return false
      const accessClass = getRoomAccessClass(room.programKey)
      return accessClass === 'public' || accessClass === 'circulation'
    })
  )
}

function getBathroomDoorPrivacyReferenceRoom(candidate: AiBuildingInteriorDoorCandidate) {
  const bathroomRoom = candidate.rooms.find((room) => isBathroomProgram(room.programKey)) ?? null
  const companionRoom = bathroomRoom
    ? (candidate.rooms.find((room) => room.key !== bathroomRoom.key) ?? null)
    : null
  if (!bathroomRoom || !companionRoom) return null

  const companionClass = getRoomAccessClass(companionRoom.programKey)
  if (
    companionClass === 'circulation' ||
    companionClass === 'public' ||
    isEntryLikeProgram(companionRoom.programKey)
  ) {
    return companionRoom
  }

  return null
}

function isInteriorDoorLocalXForbidden(
  candidate: AiBuildingInteriorDoorCandidate,
  localX: number,
  doorWidth: number,
  entryDoorLocalX: number | null,
) {
  const wallAxis = getWallAxisFromKey(candidate.wall.key)
  const needsEntryBuffer = isEntryBufferDoorCandidate(candidate)
  const bathroomPrivacyReferenceRoom = getBathroomDoorPrivacyReferenceRoom(candidate)

  if (wallAxis === 'width' && entryDoorLocalX != null) {
    const alignmentBand = Math.max(0.72, doorWidth * 1.15)
    if (
      (needsEntryBuffer || bathroomPrivacyReferenceRoom) &&
      Math.abs(localX - entryDoorLocalX) < alignmentBand
    ) {
      return true
    }
  }

  if (wallAxis !== 'depth') return false

  const point = getWallPointAtLocalX(candidate.wall, localX)

  if (needsEntryBuffer) {
    const entryRoom = candidate.rooms.find((room) => isEntryLikeProgram(room.programKey)) ?? null
    if (entryRoom) {
      const entryBounds = getRoomBounds(entryRoom)
      const frontLimit = entryBounds.minZ + getRoomFrontBufferDepth(entryRoom)
      if (point[1] < frontLimit) {
        return true
      }
    }
  }

  if (bathroomPrivacyReferenceRoom) {
    const referenceBounds = getRoomBounds(bathroomPrivacyReferenceRoom)
    const frontLimit = referenceBounds.minZ + getRoomFrontBufferDepth(bathroomPrivacyReferenceRoom)
    if (point[1] < frontLimit) {
      return true
    }
  }

  return false
}

function getPreferredInteriorDoorLocalX(
  candidate: AiBuildingInteriorDoorCandidate,
  doorWidth: number,
  entryDoorLocalX: number | null,
) {
  const bounds = getInteriorDoorCandidateLocalXBounds(candidate, doorWidth)
  const midpoint = clampNumber(candidate.localX, bounds.min, bounds.max)
  const candidateLocalXs = getDoorPlacementLocalXs(bounds, midpoint)
  const candidates = candidateLocalXs.filter(
    (localX) => !isInteriorDoorLocalXForbidden(candidate, localX, doorWidth, entryDoorLocalX),
  )
  const scoredCandidates = candidates.length > 0 ? candidates : candidateLocalXs

  const bathroomRoom = candidate.rooms.find((room) => isBathroomProgram(room.programKey)) ?? null
  const companionRoom = bathroomRoom
    ? (candidate.rooms.find((room) => room.key !== bathroomRoom.key) ?? null)
    : null
  const wallAxis = getWallAxisFromKey(candidate.wall.key)

  let bestLocalX = midpoint
  let bestScore = Number.NEGATIVE_INFINITY

  for (const localX of scoredCandidates) {
    const point = getWallPointAtLocalX(candidate.wall, localX)
    let score = -Math.abs(localX - midpoint) * 2

    if (bathroomRoom) {
      if (wallAxis === 'width' && entryDoorLocalX != null) {
        score += Math.abs(localX - entryDoorLocalX) * 24
      }
      score += point[1] * 18

      if (companionRoom) {
        const companionClass = getRoomAccessClass(companionRoom.programKey)
        if (companionClass === 'circulation') score += 12
        else if (isPrivateAccessClass(companionClass)) score += 6
        else if (isEntryLikeProgram(companionRoom.programKey)) score -= 18
        else if (companionClass === 'public') score -= 10
      }
    } else if (
      candidate.rooms.some((room) => isEntryLikeProgram(room.programKey)) &&
      candidate.rooms.some(
        (room) =>
          getRoomAccessClass(room.programKey) === 'public' ||
          getRoomAccessClass(room.programKey) === 'circulation',
      )
    ) {
      if (wallAxis === 'width' && entryDoorLocalX != null) {
        score -= Math.abs(localX - entryDoorLocalX) * 20
      }
      score += -point[1] * 14
    }

    if (score > bestScore) {
      bestScore = score
      bestLocalX = localX
    }
  }

  return clampInteriorDoorLocalXToCandidate(bestLocalX, candidate, doorWidth)
}

function splitLocalRangeByBlockedIntervals(
  rangeStart: number,
  rangeEnd: number,
  blockedIntervals: Array<{ start: number; end: number }>,
) {
  let segments = [{ start: rangeStart, end: rangeEnd }]

  for (const blocked of blockedIntervals) {
    segments = segments.flatMap((segment) => {
      const overlapStart = Math.max(segment.start, blocked.start)
      const overlapEnd = Math.min(segment.end, blocked.end)
      if (overlapEnd <= overlapStart) return [segment]

      const nextSegments: Array<{ start: number; end: number }> = []
      if (overlapStart - segment.start > 0.08) {
        nextSegments.push({ start: segment.start, end: overlapStart })
      }
      if (segment.end - overlapEnd > 0.08) {
        nextSegments.push({ start: overlapEnd, end: segment.end })
      }
      return nextSegments
    })
  }

  return segments
}

function expandRectBounds(rect: AiBuildingRectBounds, margin: number): AiBuildingRectBounds {
  return {
    minX: rect.minX - margin,
    maxX: rect.maxX + margin,
    minZ: rect.minZ - margin,
    maxZ: rect.maxZ + margin,
  }
}

function getWallBlockedIntervalForRect(
  wall: AiBuildingWallPlan,
  rect: AiBuildingRectBounds,
): { start: number; end: number } | null {
  const expandedRect = expandRectBounds(rect, STAIR_WALL_CUT_CLEARANCE)
  const isHorizontal = Math.abs(wall.start[1] - wall.end[1]) < 0.08
  const isVertical = Math.abs(wall.start[0] - wall.end[0]) < 0.08

  if (!isHorizontal && !isVertical) return null

  if (isHorizontal) {
    const wallZ = wall.start[1]
    if (wallZ < expandedRect.minZ || wallZ > expandedRect.maxZ) return null
    const overlapStart = Math.max(Math.min(wall.start[0], wall.end[0]), expandedRect.minX)
    const overlapEnd = Math.min(Math.max(wall.start[0], wall.end[0]), expandedRect.maxX)
    if (overlapEnd - overlapStart <= 0.001) return null
    return getWallLocalRange(wall, overlapStart, overlapEnd)
  }

  const wallX = wall.start[0]
  if (wallX < expandedRect.minX || wallX > expandedRect.maxX) return null
  const overlapStart = Math.max(Math.min(wall.start[1], wall.end[1]), expandedRect.minZ)
  const overlapEnd = Math.min(Math.max(wall.start[1], wall.end[1]), expandedRect.maxZ)
  if (overlapEnd - overlapStart <= 0.001) return null
  return getWallLocalRange(wall, overlapStart, overlapEnd)
}

function getWallIntersectionIntervalForRect(
  wall: AiBuildingWallPlan,
  rect: AiBuildingRectBounds,
  margin = 0.02,
): { start: number; end: number } | null {
  const isHorizontal = Math.abs(wall.start[1] - wall.end[1]) < 0.08
  const isVertical = Math.abs(wall.start[0] - wall.end[0]) < 0.08

  if (!isHorizontal && !isVertical) return null

  if (isHorizontal) {
    const wallZ = wall.start[1]
    if (wallZ < rect.minZ - margin || wallZ > rect.maxZ + margin) return null
    const overlapStart = Math.max(Math.min(wall.start[0], wall.end[0]), rect.minX - margin)
    const overlapEnd = Math.min(Math.max(wall.start[0], wall.end[0]), rect.maxX + margin)
    if (overlapEnd - overlapStart <= 0.035) return null
    return getWallLocalRange(wall, overlapStart, overlapEnd)
  }

  const wallX = wall.start[0]
  if (wallX < rect.minX - margin || wallX > rect.maxX + margin) return null
  const overlapStart = Math.max(Math.min(wall.start[1], wall.end[1]), rect.minZ - margin)
  const overlapEnd = Math.min(Math.max(wall.start[1], wall.end[1]), rect.maxZ + margin)
  if (overlapEnd - overlapStart <= 0.035) return null
  return getWallLocalRange(wall, overlapStart, overlapEnd)
}

function getDoorClearIntervalsForWall(
  wall: AiBuildingWallPlan,
  openings: AiBuildingOpeningPlan[],
) {
  const wallLength = getWallLength(wall)
  return openings
    .filter((opening) => opening.kind === 'door' && opening.wallKey === wall.key)
    .map((opening) => ({
      start: clampNumber(opening.localX - opening.width / 2 - 0.08, 0, wallLength),
      end: clampNumber(opening.localX + opening.width / 2 + 0.08, 0, wallLength),
    }))
    .filter((interval) => interval.end - interval.start > 0.08)
    .sort((left, right) => left.start - right.start)
}

function doesRectCrossSolidWall(
  rect: AiBuildingRectBounds,
  walls: AiBuildingWallPlan[],
  openings: AiBuildingOpeningPlan[] = [],
) {
  return walls.some((wall) => {
    const crossingInterval = getWallIntersectionIntervalForRect(wall, rect)
    if (!crossingInterval) return false
    const solidIntervals = splitLocalRangeByBlockedIntervals(
      crossingInterval.start,
      crossingInterval.end,
      getDoorClearIntervalsForWall(wall, openings),
    )
    return solidIntervals.some((interval) => interval.end - interval.start > 0.12)
  })
}

function getStairRouteRects(
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments' | 'width'>,
) {
  const routeProbeDepth = Math.max(STAIR_ROUTE_PROBE_DEPTH, stairPlan.width * 0.7)
  const routeProbeWidth = Math.max(MIN_WALKABLE_STAIR_WIDTH, stairPlan.width * 0.82)
  const startLandingCenter = getPlannedStairLandingCenter(stairPlan, 'start')
  const endLandingCenter = getPlannedStairLandingCenter(stairPlan, 'end')
  const startRouteVector = getPlannedStairLandingRouteVector(stairPlan, 'start')
  const endRouteVector = getPlannedStairLandingRouteVector(stairPlan, 'end')
  const startRouteProbePoint: Point2D = [
    startLandingCenter[0] + startRouteVector[0] * routeProbeDepth,
    startLandingCenter[1] + startRouteVector[1] * routeProbeDepth,
  ]
  const endRouteProbePoint: Point2D = [
    endLandingCenter[0] + endRouteVector[0] * routeProbeDepth,
    endLandingCenter[1] + endRouteVector[1] * routeProbeDepth,
  ]

  return {
    startLandingCenter,
    endLandingCenter,
    startRouteProbePoint,
    endRouteProbePoint,
    startRouteRect: createCorridorRectBetweenPoints(
      startLandingCenter,
      startRouteProbePoint,
      routeProbeWidth,
    ),
    endRouteRect: createCorridorRectBetweenPoints(
      endLandingCenter,
      endRouteProbePoint,
      routeProbeWidth,
    ),
  }
}

function getStairSolidWallConflicts(
  stairPlan: AiBuildingStairPlan,
  floorWalls: AiBuildingWallPlan[],
  floorOpenings: AiBuildingOpeningPlan[] = [],
  upperFloorWalls: AiBuildingWallPlan[] = [],
  upperFloorOpenings: AiBuildingOpeningPlan[] = [],
) {
  const routeRects = getStairRouteRects(stairPlan)
  const endLandingRect = getPlannedStairLandingRectBounds(stairPlan, 'end')
  const bodyRects = [
    getPlannedStairFootprintRectBounds(stairPlan),
    getPlannedStairLandingRectBounds(stairPlan, 'start'),
  ]
  const stairWallBlocked = bodyRects.some((rect) =>
    doesRectCrossSolidWall(rect, floorWalls, floorOpenings),
  )
  const startRouteWallBlocked = doesRectCrossSolidWall(
    routeRects.startRouteRect,
    floorWalls,
    floorOpenings,
  )
  const endLandingWallBlocked =
    upperFloorWalls.length > 0
      ? doesRectCrossSolidWall(endLandingRect, upperFloorWalls, upperFloorOpenings)
      : doesRectCrossSolidWall(endLandingRect, floorWalls, floorOpenings)
  const endRouteWallBlocked =
    upperFloorWalls.length > 0
      ? endLandingWallBlocked ||
        doesRectCrossSolidWall(routeRects.endRouteRect, upperFloorWalls, upperFloorOpenings)
      : endLandingWallBlocked ||
        doesRectCrossSolidWall(routeRects.endRouteRect, floorWalls, floorOpenings)

  return {
    ...routeRects,
    stairWallBlocked,
    startRouteWallBlocked,
    endRouteWallBlocked,
    hasConflict: stairWallBlocked || startRouteWallBlocked || endRouteWallBlocked,
  }
}

function getStairWallClearRects(
  floorStairs: AiBuildingStairPlan[],
) {
  return floorStairs.map((stair) => getPlannedStairFootprintRectBounds(stair))
}

function clipInteriorWallsForRects(
  walls: AiBuildingWallPlan[],
  blockedRects: AiBuildingRectBounds[],
) {
  if (blockedRects.length === 0) return walls

  return walls.flatMap((wall) => {
    if (wall.role !== 'inner') return [wall]

    const blockedIntervals = blockedRects
      .map((rect) => getWallBlockedIntervalForRect(wall, rect))
      .filter((interval): interval is { start: number; end: number } => Boolean(interval))
      .sort((left, right) => left.start - right.start)
    if (blockedIntervals.length === 0) return [wall]

    const wallLength = getWallLength(wall)
    if (wallLength <= 0.001) return []

    const remainingSegments = splitLocalRangeByBlockedIntervals(0, wallLength, blockedIntervals)
    if (
      remainingSegments.length === 1 &&
      Math.abs(remainingSegments[0]!.start) <= 0.001 &&
      Math.abs(remainingSegments[0]!.end - wallLength) <= 0.001
    ) {
      return [wall]
    }

    return remainingSegments.map((segment, index) => ({
      ...wall,
      key: `${wall.key}_stair_clear_${index + 1}`,
      start: getWallPointAtLocalX(wall, segment.start),
      end: getWallPointAtLocalX(wall, segment.end),
    }))
  })
}

function isRoomEligibleForExteriorWindow(programKey?: string) {
  return !(
    programKey === 'garage' ||
    programKey === 'storage' ||
    programKey === 'equipment_room' ||
    programKey === 'stairs' ||
    programKey === 'elevator' ||
    programKey === 'courtyard' ||
    programKey === 'balcony'
  )
}

function getSegmentWindowCount(segmentLength: number, windowWidth: number) {
  if (segmentLength >= windowWidth * 2 + 1.2) return 2
  return 1
}

function getSegmentWindowPositions(segmentStart: number, segmentEnd: number, windowWidth: number) {
  const segmentLength = segmentEnd - segmentStart
  const count = getSegmentWindowCount(segmentLength, windowWidth)
  return Array.from(
    { length: count },
    (_, index) => segmentStart + (segmentLength * (index + 1)) / (count + 1),
  )
}

function getWallAxisFromKey(wallKey: string): AiBuildingWallAxis | null {
  if (wallKey === 'south' || wallKey === 'north') return 'width'
  if (wallKey === 'east' || wallKey === 'west') return 'depth'
  return null
}

function getOpeningProfile(
  form: AiBuildingFormState,
  floorIndex: number,
): AiBuildingOpeningProfile {
  const massing = inferMassingIntent(form)
  const wantsLargeGlazing = massing.largeGlazing || form.style === 'minimal'
  const isUpperFloor = floorIndex > 0

  if (form.style === 'newChinese') {
    return {
      entryDoorWidth: 0.96,
      entryDoorHeight: 2.15,
      interiorDoorWidth: 0.86,
      interiorDoorHeight: 2.05,
      primaryWindowWidth: wantsLargeGlazing ? 1.45 : 1.2,
      primaryWindowHeight: isUpperFloor ? 1.35 : 1.45,
      primaryWindowCenterY: isUpperFloor ? 1.55 : 1.45,
      secondaryWindowWidth: 1.0,
      secondaryWindowHeight: isUpperFloor ? 1.2 : 1.25,
      secondaryWindowCenterY: isUpperFloor ? 1.55 : 1.45,
    }
  }

  if (wantsLargeGlazing) {
    return {
      entryDoorWidth: 1.02,
      entryDoorHeight: 2.2,
      interiorDoorWidth: 0.9,
      interiorDoorHeight: 2.08,
      primaryWindowWidth: 1.75,
      primaryWindowHeight: isUpperFloor ? 1.45 : 1.65,
      primaryWindowCenterY: isUpperFloor ? 1.55 : 1.35,
      secondaryWindowWidth: 1.2,
      secondaryWindowHeight: isUpperFloor ? 1.2 : 1.15,
      secondaryWindowCenterY: isUpperFloor ? 1.55 : 1.45,
    }
  }

  return {
    entryDoorWidth: 0.9,
    entryDoorHeight: 2.1,
    interiorDoorWidth: 0.85,
    interiorDoorHeight: 2.05,
    primaryWindowWidth: 1.35,
    primaryWindowHeight: isUpperFloor ? 1.15 : 1.2,
    primaryWindowCenterY: 1.45,
    secondaryWindowWidth: 1.15,
    secondaryWindowHeight: isUpperFloor ? 1.05 : 1.1,
    secondaryWindowCenterY: 1.45,
  }
}

function getBiasedOpeningCount(
  length: number,
  baseCount: number,
  wallAxis: AiBuildingWallAxis,
  layoutHint: AiBuildingGridLayoutHint | null | undefined,
  openingBias: AiBuildingOpeningBias,
) {
  if (openingBias !== 'primary-facade' || !layoutHint?.axis) return baseCount

  if (layoutHint.axis === wallAxis) {
    return Math.min(
      Math.max(baseCount + 1, Math.floor(length / 4)),
      Math.max(baseCount + 1, Math.floor(length / 3.25)),
    )
  }

  return Math.max(1, baseCount - 1)
}

function getBiasedWindowWidth(
  width: number,
  wallAxis: AiBuildingWallAxis,
  layoutHint: AiBuildingGridLayoutHint | null | undefined,
  openingBias: AiBuildingOpeningBias,
) {
  if (openingBias !== 'primary-facade' || !layoutHint?.axis) return width
  if (layoutHint.axis === wallAxis) return clampNumber(width * 1.12, 0.9, 2.2)
  return clampNumber(width * 0.92, 0.9, 2.2)
}

function createPlanOpenings(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  intent: AiBuildingFeatureIntent,
  layoutHint?: AiBuildingGridLayoutHint | null,
  openingBias: AiBuildingOpeningBias = 'balanced',
  previousFloorStairs: AiBuildingStairPlan[] = [],
): AiBuildingOpeningPlan[] {
  const openings: AiBuildingOpeningPlan[] = []
  const profile = getOpeningProfile(form, floorIndex)
  const doorName = language === 'zh-CN' ? '室内门' : 'Interior Door'
  const entryDoorLocalX =
    floorIndex === 0
      ? getPreferredEntryDoorLocalX(form, rooms, walls, profile.entryDoorWidth, layoutHint)
      : null
  const windowLabels =
    language === 'zh-CN'
      ? { south: '南窗', north: '北窗', side: '侧窗' }
      : { south: 'South Window', north: 'North Window', side: 'Side Window' }

  if (floorIndex === 0) {
    const wallAxis = getWallAxisFromKey('south')
    const isPrimaryFacade = wallAxis === layoutHint?.axis
    openings.push({
      kind: 'door',
      wallKey: 'south',
      name: language === 'zh-CN' ? '入户门' : 'Entry Door',
      localX: entryDoorLocalX ?? getCentralOpeningPosition(form.width, 'width', layoutHint),
      centerY: 1.05,
      width: profile.entryDoorWidth,
      height: profile.entryDoorHeight,
      wallAxis,
      strategy: isPrimaryFacade ? 'grid-bay' : 'centered',
      facade: isPrimaryFacade ? 'primary' : 'secondary',
    })
  }

  for (const candidate of selectInteriorDoorCandidates(rooms, walls, profile.interiorDoorWidth)) {
    openings.push({
      kind: 'door',
      wallKey: candidate.wall.key,
      name: doorName,
      localX: getPreferredInteriorDoorLocalX(candidate, profile.interiorDoorWidth, entryDoorLocalX),
      centerY: 1.05,
      width: profile.interiorDoorWidth,
      height: profile.interiorDoorHeight,
      wallAxis: getWallAxisFromKey(candidate.wall.key),
      strategy: 'centered',
      facade: 'interior',
    })
  }

  const doorOpenings = ensureRequiredRoomDoorOpenings(
    openings,
    rooms,
    walls,
    profile,
    entryDoorLocalX,
    doorName,
  )
  const stairArrivalDoorOpenings = ensureStairArrivalDoorOpenings(
    doorOpenings,
    rooms,
    walls,
    previousFloorStairs,
    profile,
    doorName,
  )
  const routeReachableDoorOpenings = ensureRouteReachabilityDoorOpenings(
    stairArrivalDoorOpenings,
    rooms,
    walls,
    profile,
    entryDoorLocalX,
    doorName,
  )
  openings.splice(0, openings.length, ...routeReachableDoorOpenings)

  const blockedWindowRangesByWall = new Map<string, Array<{ start: number; end: number }>>()
  for (const door of openings.filter((entry) => entry.kind === 'door')) {
    const ranges = blockedWindowRangesByWall.get(door.wallKey) ?? []
    ranges.push({
      start: door.localX - door.width * 0.9,
      end: door.localX + door.width * 0.9,
    })
    blockedWindowRangesByWall.set(door.wallKey, ranges)
  }

  for (const wall of walls.filter((entry) => entry.role === 'outer')) {
    const expectedSide = getExteriorWallExpectedSide(wall.key)
    const wallAxis = getWallAxisFromKey(wall.key)
    if (!expectedSide || !wallAxis) continue

    const facade = layoutHint?.axis === wallAxis ? 'primary' : 'secondary'
    const strategy = layoutHint?.axis === wallAxis ? 'grid-bay' : 'even'
    const baseWindowWidth = getBiasedWindowWidth(
      facade === 'primary' ? profile.primaryWindowWidth : profile.secondaryWindowWidth,
      wallAxis,
      layoutHint,
      openingBias,
    )
    const windowHeight =
      facade === 'primary' ? profile.primaryWindowHeight : profile.secondaryWindowHeight
    const windowCenterY =
      facade === 'primary' ? profile.primaryWindowCenterY : profile.secondaryWindowCenterY
    const blockedRanges = blockedWindowRangesByWall.get(wall.key) ?? []

    const contacts = rooms
      .map((room) => {
        const contact = getRoomContactRangeOnWall(room, wall)
        if (!contact || contact.side !== expectedSide) return null
        return { room, contact }
      })
      .filter(
        (
          entry,
        ): entry is {
          room: AiBuildingRoomPlan
          contact: NonNullable<ReturnType<typeof getRoomContactRangeOnWall>>
        } => Boolean(entry),
      )

    for (const { room, contact } of contacts) {
      if (!isRoomEligibleForExteriorWindow(room.programKey)) continue

      const localRange = getWallLocalRange(wall, contact.rangeStart, contact.rangeEnd)
      const usableSegments = splitLocalRangeByBlockedIntervals(
        localRange.start,
        localRange.end,
        blockedRanges,
      )

      for (const segment of usableSegments) {
        const segmentLength = segment.end - segment.start
        if (segmentLength < 1.15) continue

        const preferredWidth =
          room.programKey === 'living_room' && facade === 'primary'
            ? Math.max(baseWindowWidth, profile.primaryWindowWidth)
            : baseWindowWidth
        const windowWidth = clampNumber(preferredWidth, 0.72, Math.max(0.72, segmentLength - 0.28))
        if (segmentLength < windowWidth + 0.16) continue

        const label =
          wall.key === 'south'
            ? windowLabels.south
            : wall.key === 'north'
              ? windowLabels.north
              : wall.key === 'east' && room.programKey === 'living_room' && intent.terrace
                ? language === 'zh-CN'
                  ? '景观窗'
                  : 'Picture Window'
                : windowLabels.side

        for (const localX of getSegmentWindowPositions(segment.start, segment.end, windowWidth)) {
          openings.push({
            kind: 'window',
            wallKey: wall.key,
            name: label,
            localX,
            centerY: windowCenterY,
            width: windowWidth,
            height: windowHeight,
            wallAxis,
            strategy,
            facade,
          })
        }
      }
    }
  }

  return openings
}

function getRoomBounds(room: AiBuildingRoomPlan) {
  const xs = room.polygon.map((point) => point[0])
  const zs = room.polygon.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function roomPoint(room: AiBuildingRoomPlan, xRatio: number, zRatio: number): Point3D {
  const bounds = getRoomBounds(room)
  return [
    bounds.minX + (bounds.maxX - bounds.minX) * xRatio,
    0,
    bounds.minZ + (bounds.maxZ - bounds.minZ) * zRatio,
  ]
}

function roomPointByLayout(
  room: AiBuildingRoomPlan,
  layoutHint: AiBuildingGridLayoutHint | null | undefined,
  xRatio: number,
  zRatio: number,
) {
  return layoutHint?.axis === 'depth'
    ? roomPoint(room, zRatio, xRatio)
    : roomPoint(room, xRatio, zRatio)
}

function getRectClearanceWithinBounds(
  rect: AiBuildingRectBounds,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
) {
  return Math.min(
    rect.minX - bounds.minX,
    bounds.maxX - rect.maxX,
    rect.minZ - bounds.minZ,
    bounds.maxZ - rect.maxZ,
  )
}

function getPlacementRangeFromOffsets(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  offsets: AiBuildingRectBounds,
  margin: number,
) {
  const minPositionX = bounds.minX + margin - offsets.minX
  const maxPositionX = bounds.maxX - margin - offsets.maxX
  const minPositionZ = bounds.minZ + margin - offsets.minZ
  const maxPositionZ = bounds.maxZ - margin - offsets.maxZ

  if (minPositionX > maxPositionX || minPositionZ > maxPositionZ) return null

  return {
    minX: minPositionX,
    maxX: maxPositionX,
    minZ: minPositionZ,
    maxZ: maxPositionZ,
    offsets,
  }
}

function getCombinedRectBounds(...rects: AiBuildingRectBounds[]): AiBuildingRectBounds {
  return {
    minX: Math.min(...rects.map((rect) => rect.minX)),
    maxX: Math.max(...rects.map((rect) => rect.maxX)),
    minZ: Math.min(...rects.map((rect) => rect.minZ)),
    maxZ: Math.max(...rects.map((rect) => rect.maxZ)),
  }
}

type AiBuildingStairSegmentTransform = {
  position: Point3D
  rotation: number
}

type AiBuildingPlannedStairSegmentLayout = {
  segment: AiBuildingStairSegmentPlan
  transform: AiBuildingStairSegmentTransform
  topElevation: number
}

function computePlannedStairSegmentTransforms(
  segments: AiBuildingStairSegmentPlan[],
): AiBuildingStairSegmentTransform[] {
  const transforms: AiBuildingStairSegmentTransform[] = []
  let currentX = 0
  let currentY = 0
  let currentZ = 0
  let currentRot = 0

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (!segment) continue

    if (index === 0) {
      transforms.push({
        position: [currentX, currentY, currentZ],
        rotation: currentRot,
      })
      continue
    }

    const previous = segments[index - 1]
    if (!previous) continue

    let attachX = 0
    let attachZ = 0
    let rotationDelta = 0

    switch (segment.attachmentSide) {
      case 'front':
        attachX = 0
        attachZ = previous.length
        break
      case 'left':
        attachX = previous.width / 2
        attachZ = previous.length / 2
        rotationDelta = Math.PI / 2
        break
      case 'right':
        attachX = -previous.width / 2
        attachZ = previous.length / 2
        rotationDelta = -Math.PI / 2
        break
    }

    const [deltaX, deltaZ] = rotateLocalPoint([attachX, attachZ], currentRot)
    currentX += deltaX
    currentY += previous.height
    currentZ += deltaZ
    currentRot += rotationDelta

    transforms.push({
      position: [currentX, currentY, currentZ],
      rotation: currentRot,
    })
  }

  return transforms
}

function getPlannedStairSegmentLayouts(
  stairPlan: Pick<AiBuildingStairPlan, 'segments'>,
): AiBuildingPlannedStairSegmentLayout[] {
  const transforms = computePlannedStairSegmentTransforms(stairPlan.segments)
  return stairPlan.segments.map((segment, index) => {
    const transform = transforms[index] ?? { position: [0, 0, 0] as Point3D, rotation: 0 }
    return {
      segment,
      transform,
      topElevation: transform.position[1] + segment.height,
    }
  })
}

function getPlannedStairSegmentPolygon(
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments'>,
  layout: AiBuildingPlannedStairSegmentLayout,
  startAlong = 0,
  endAlong = layout.segment.length,
  extraWidth = 0,
) {
  const halfWidth = layout.segment.width / 2 + extraWidth / 2
  const localPolygon: Point2D[] = [
    [-halfWidth, startAlong],
    [halfWidth, startAlong],
    [halfWidth, endAlong],
    [-halfWidth, endAlong],
  ]

  return localPolygon.map((point) => {
    const rotatedSegmentPoint = rotateLocalPoint(point, layout.transform.rotation)
    const groupPoint: Point2D = [
      layout.transform.position[0] + rotatedSegmentPoint[0],
      layout.transform.position[2] + rotatedSegmentPoint[1],
    ]
    const rotatedGroupPoint = rotateLocalPoint(groupPoint, stairPlan.rotation)
    return [
      stairPlan.position[0] + rotatedGroupPoint[0],
      stairPlan.position[2] + rotatedGroupPoint[1],
    ] satisfies Point2D
  })
}

function getPlannedStairSegmentRectBounds(
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments'>,
  layout: AiBuildingPlannedStairSegmentLayout,
  startAlong = 0,
  endAlong = layout.segment.length,
  extraWidth = 0,
) {
  return getPolygonBounds(
    getPlannedStairSegmentPolygon(stairPlan, layout, startAlong, endAlong, extraWidth),
  )
}

function getPlannedStairFootprintRectBounds(
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments'>,
) {
  const layouts = getPlannedStairSegmentLayouts(stairPlan)
  if (layouts.length === 0) {
    return {
      minX: stairPlan.position[0],
      maxX: stairPlan.position[0],
      minZ: stairPlan.position[2],
      maxZ: stairPlan.position[2],
    }
  }

  return getCombinedRectBounds(
    ...layouts.map((layout) => getPlannedStairSegmentRectBounds(stairPlan, layout)),
  )
}

function getPlannedStairLandingRectBounds(
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments'>,
  side: 'start' | 'end',
  depth = STAIR_LANDING_CLEAR_DEPTH,
) {
  const layouts = getPlannedStairSegmentLayouts(stairPlan)
  if (layouts.length === 0) {
    return getPlannedStairFootprintRectBounds(stairPlan)
  }

  const terminalLayout = side === 'start' ? layouts[0] : layouts[layouts.length - 1]
  if (terminalLayout?.segment.segmentType === 'landing') {
    return getPlannedStairSegmentRectBounds(
      stairPlan,
      terminalLayout,
      0,
      terminalLayout.segment.length,
      STAIR_LANDING_CLEAR_SIDE_MARGIN * 2,
    )
  }

  const stairLayouts = layouts.filter((layout) => layout.segment.segmentType === 'stair')
  const stairLayout = side === 'start' ? stairLayouts[0] : stairLayouts[stairLayouts.length - 1]
  if (!stairLayout) {
    return getPlannedStairFootprintRectBounds(stairPlan)
  }

  return getPlannedStairSegmentRectBounds(
    stairPlan,
    stairLayout,
    side === 'start' ? -depth : stairLayout.segment.length,
    side === 'start' ? 0 : stairLayout.segment.length + depth,
    STAIR_LANDING_CLEAR_SIDE_MARGIN * 2,
  )
}

function getPlannedStairProtectedRectBounds(
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments'>,
) {
  return getCombinedRectBounds(
    getPlannedStairFootprintRectBounds(stairPlan),
    getPlannedStairLandingRectBounds(stairPlan, 'start'),
    getPlannedStairLandingRectBounds(stairPlan, 'end'),
  )
}

function getPlannedStairStackAnchorRectBounds(
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments'>,
) {
  return getCombinedRectBounds(
    getPlannedStairFootprintRectBounds(stairPlan),
    getPlannedStairLandingRectBounds(stairPlan, 'end'),
  )
}

function getPlannedStairProtectedPlacementRange(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments'>,
) {
  const offsets = getPlannedStairProtectedRectBounds({
    ...stairPlan,
    position: [0, 0, 0],
  })
  return getPlacementRangeFromOffsets(bounds, offsets, STAIR_WALL_CLEARANCE)
}

function getPlannedStairLandingCenter(
  stairPlan: Pick<AiBuildingStairPlan, 'position' | 'rotation' | 'segments'>,
  side: 'start' | 'end',
) {
  return getRectCenter(getPlannedStairLandingRectBounds(stairPlan, side))
}

function getPlannedStairPositionFromLandingCenter(
  landingCenter: Point2D,
  stairPlan: Pick<AiBuildingStairPlan, 'rotation' | 'segments'>,
  side: 'start' | 'end',
): Point3D {
  const centerOffset = getPlannedStairLandingCenter(
    {
      ...stairPlan,
      position: [0, 0, 0],
    },
    side,
  )
  return [landingCenter[0] - centerOffset[0], 0, landingCenter[1] - centerOffset[1]]
}

function findRoomContainingPoint(rooms: AiBuildingRoomPlan[], point: Point2D) {
  return (
    rooms.find(
      (room) => room.polygon.length >= 3 && pointInPolygon(point[0], point[1], room.polygon),
    ) ??
    rooms.find((room) => {
      const bounds = getRoomMetrics(room)
      return (
        point[0] >= bounds.minX - 0.02 &&
        point[0] <= bounds.maxX + 0.02 &&
        point[1] >= bounds.minZ - 0.02 &&
        point[1] <= bounds.maxZ + 0.02
      )
    }) ??
    null
  )
}

function getPlannedStairLandingRouteVector(
  stairPlan: Pick<AiBuildingStairPlan, 'rotation' | 'segments'>,
  side: 'start' | 'end',
) {
  const stairLayouts = getPlannedStairSegmentLayouts(stairPlan).filter(
    (layout) => layout.segment.segmentType === 'stair',
  )
  const terminalLayout = side === 'start' ? stairLayouts[0] : stairLayouts[stairLayouts.length - 1]
  const worldRotation = stairPlan.rotation + (terminalLayout?.transform.rotation ?? 0)
  return normalizePoint2D(getLocalSideVector(worldRotation, side === 'start' ? 'back' : 'front'))
}

function getStairAccessClassPenalty(accessClass: ReturnType<typeof getRoomAccessClass> | null) {
  if (accessClass === 'private') return STAIR_PRIVATE_ACCESS_PENALTY
  if (accessClass === 'service') return STAIR_SERVICE_ACCESS_PENALTY
  if (!accessClass) return 22
  return 0
}

function isPrimaryRouteAccessClass(accessClass: ReturnType<typeof getRoomAccessClass>) {
  return accessClass === 'circulation' || accessClass === 'public' || accessClass === 'other'
}

function isUsableRouteDestinationClass(accessClass: ReturnType<typeof getRoomAccessClass>) {
  return accessClass === 'circulation' || accessClass === 'public' || accessClass === 'private'
}

function createFloorRouteGraph(floor: AiBuildingFloorPlan): AiBuildingFloorRouteGraph {
  const roomByKey = new Map(floor.rooms.map((room) => [room.key, room]))
  const adjacency = new Map(floor.rooms.map((room) => [room.key, new Set<string>()]))
  const connectRooms = (leftKey: string, rightKey: string) => {
    if (leftKey === rightKey) return
    adjacency.get(leftKey)?.add(rightKey)
    adjacency.get(rightKey)?.add(leftKey)
  }

  for (const opening of floor.openings) {
    if (opening.kind !== 'door' || opening.facade !== 'interior') continue
    const connectedRooms = floor.rooms.filter((room) =>
      doesRoomUseOpening(room, floor.walls, opening),
    )
    for (let index = 0; index < connectedRooms.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < connectedRooms.length; nextIndex += 1) {
        const leftRoom = connectedRooms[index]
        const rightRoom = connectedRooms[nextIndex]
        if (!leftRoom || !rightRoom) continue
        connectRooms(leftRoom.key, rightRoom.key)
      }
    }
  }

  const entryRoomKeys = new Set<string>()
  for (const opening of floor.openings) {
    if (opening.kind !== 'door' || opening.facade === 'interior') continue
    for (const room of floor.rooms) {
      if (doesRoomUseOpening(room, floor.walls, opening)) entryRoomKeys.add(room.key)
    }
  }
  for (const room of floor.rooms) {
    if (room.programKey === 'entry' || room.programKey === 'reception') {
      entryRoomKeys.add(room.key)
    }
  }

  const primaryRouteRoomKeys = new Set(
    floor.rooms
      .filter((room) => isPrimaryRouteAccessClass(getRoomAccessClass(room.programKey)))
      .map((room) => room.key),
  )
  const usableDestinationRoomKeys = new Set(
    floor.rooms
      .filter((room) => isUsableRouteDestinationClass(getRoomAccessClass(room.programKey)))
      .map((room) => room.key),
  )

  return {
    floor,
    roomByKey,
    adjacency,
    entryRoomKeys,
    primaryRouteRoomKeys,
    usableDestinationRoomKeys,
  }
}

function getReachableRoomKeysOnPrimaryRoute(
  graph: AiBuildingFloorRouteGraph,
  sourceKeys: Set<string>,
) {
  const reachable = new Set<string>()
  const queue: string[] = []

  for (const sourceKey of sourceKeys) {
    if (!graph.roomByKey.has(sourceKey)) continue
    reachable.add(sourceKey)
    queue.push(sourceKey)
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const roomKey = queue[cursor]
    if (!roomKey) continue

    for (const nextKey of graph.adjacency.get(roomKey) ?? []) {
      if (reachable.has(nextKey)) continue
      reachable.add(nextKey)
      if (graph.primaryRouteRoomKeys.has(nextKey) || sourceKeys.has(nextKey)) {
        queue.push(nextKey)
      }
    }
  }

  return reachable
}

function annotateStairVerticalRoutes(
  floors: AiBuildingFloorPlan[],
  results: AiBuildingStairWalkabilityResult[],
) {
  const graphByLevel = new Map(floors.map((floor) => [floor.level, createFloorRouteGraph(floor)]))
  const minLevel = floors.reduce((minimum, floor) => Math.min(minimum, floor.level), floors[0]?.level ?? 0)
  const arrivalSourcesByLevel = new Map<number, Set<string>>()

  return [...results]
    .sort((left, right) => left.level - right.level)
    .map((result) => {
      const graph = graphByLevel.get(result.level)
      const upperGraph = graphByLevel.get(result.level + 1)
      const sourceKeys =
        result.level === minLevel
          ? (graph?.entryRoomKeys ?? new Set<string>())
          : (arrivalSourcesByLevel.get(result.level) ?? new Set<string>())
      const entryReachable = graph
        ? getReachableRoomKeysOnPrimaryRoute(graph, sourceKeys)
        : new Set<string>()
      const entryRouteConnected = Boolean(graph?.roomByKey.has(result.roomKey)) && entryReachable.has(result.roomKey)
      const upperSourceKeys =
        result.endArrivalRoomRef && upperGraph?.roomByKey.has(result.endArrivalRoomRef.roomKey)
          ? new Set([result.endArrivalRoomRef.roomKey])
          : new Set<string>()
      const upperReachable = upperGraph
        ? getReachableRoomKeysOnPrimaryRoute(upperGraph, upperSourceKeys)
        : new Set<string>()
      const reachableUpperRoomRefs =
        upperGraph && result.endArrivalRoomRef
          ? [...upperGraph.usableDestinationRoomKeys]
              .filter((roomKey) => upperReachable.has(roomKey))
              .map((roomKey) => upperGraph.roomByKey.get(roomKey))
              .filter((room): room is AiBuildingRoomPlan => Boolean(room))
              .map((room) => ({
                level: upperGraph.floor.level,
                roomKey: room.key,
                roomName: room.name,
              }))
          : []
      const upperRouteConnected =
        !upperGraph ||
        (upperSourceKeys.size > 0 &&
          ((result.endAccessClass ? isPrimaryRouteAccessClass(result.endAccessClass) : false) ||
            reachableUpperRoomRefs.length > 0))
      const verticalRouteIssue = !entryRouteConnected || !upperRouteConnected
      const score = Math.round(
        clampNumber(
          result.score -
            (entryRouteConnected ? 0 : STAIR_ROUTE_DISCONNECTED_PENALTY) -
            (upperRouteConnected ? 0 : STAIR_ROUTE_DISCONNECTED_PENALTY),
          0,
          100,
        ),
      )

      if (result.endArrivalRoomRef && upperRouteConnected) {
        const sources = arrivalSourcesByLevel.get(result.endArrivalRoomRef.level) ?? new Set<string>()
        sources.add(result.endArrivalRoomRef.roomKey)
        arrivalSourcesByLevel.set(result.endArrivalRoomRef.level, sources)
      }

      return {
        ...result,
        score,
        entryRouteConnected,
        upperRouteConnected,
        verticalRouteIssue,
        reachableUpperRoomRefs,
      }
    })
}

function analyzeStairWalkability(
  floor: AiBuildingFloorPlan,
  stairPlan: AiBuildingStairPlan,
  upperFloor: AiBuildingFloorPlan | null,
): AiBuildingStairWalkabilityResult {
  const stairLayouts = getPlannedStairSegmentLayouts(stairPlan).filter(
    (layout) => layout.segment.segmentType === 'stair',
  )
  const stairMetrics = stairLayouts.map((layout) => {
    const steps = Math.max(1, layout.segment.stepCount)
    const treadDepth = layout.segment.length / steps
    const riserHeight = layout.segment.height / steps
    return {
      treadDepth,
      riserHeight,
      pitchDegrees: (Math.atan2(layout.segment.height, Math.max(layout.segment.length, 0.01)) * 180) / Math.PI,
      comfortFormula: riserHeight * 2 + treadDepth,
    }
  })
  const minTreadDepth =
    stairMetrics.reduce((minimum, metric) => Math.min(minimum, metric.treadDepth), Number.POSITIVE_INFINITY) ??
    MIN_STAIR_TREAD_DEPTH
  const maxRiserHeight =
    stairMetrics.reduce((maximum, metric) => Math.max(maximum, metric.riserHeight), 0) ?? 0
  const maxPitchDegrees =
    stairMetrics.reduce((maximum, metric) => Math.max(maximum, metric.pitchDegrees), 0) ?? 0
  const comfortFormulaMin =
    stairMetrics.reduce(
      (minimum, metric) => Math.min(minimum, metric.comfortFormula),
      Number.POSITIVE_INFINITY,
    ) ?? STAIR_COMFORT_FORMULA_TARGET

  const startLandingDepth = STAIR_LANDING_CLEAR_DEPTH
  const endLandingDepth =
    [...stairPlan.segments]
      .reverse()
      .find((segment) => segment.segmentType === 'landing')?.length ?? STAIR_TOP_LANDING_DEPTH
  const wallConflicts = getStairSolidWallConflicts(
    stairPlan,
    floor.walls,
    floor.openings,
    upperFloor?.walls ?? [],
    upperFloor?.openings ?? [],
  )
  const startLandingRect = getPlannedStairLandingRectBounds(stairPlan, 'start')
  const endLandingRect = getPlannedStairLandingRectBounds(stairPlan, 'end')
  const currentRoom =
    floor.rooms.find((room) => room.key === stairPlan.roomKey) ??
    findRoomContainingPoint(floor.rooms, wallConflicts.startRouteProbePoint) ??
    findRoomContainingPoint(floor.rooms, wallConflicts.startLandingCenter) ??
    null
  const startAccessPoints = currentRoom
    ? getRoomAccessPoints(currentRoom, floor.walls, floor.openings)
    : []
  const startAccessSummary = currentRoom
    ? summarizeRectAccessConflicts(
        currentRoom,
        getCombinedRectBounds(startLandingRect, wallConflicts.startRouteRect),
        startAccessPoints,
        'entry-clear',
      )
    : {
        totalEntryOverlap: 0,
        totalCorridorOverlap: 0,
        totalDoorSwingOverlap: 0,
        blockedEntryCount: 0,
        blockedDoorSwingCount: 0,
        hardConflict: false,
      }
  const startAccessClass = currentRoom ? getRoomAccessClass(currentRoom.programKey) : 'other'
  const startRouteSupported = currentRoom
    ? Boolean(
        pointInPolygon(
          wallConflicts.startRouteProbePoint[0],
          wallConflicts.startRouteProbePoint[1],
          currentRoom.polygon,
        ),
      )
    : true

  const endArrivalRoom =
    upperFloor &&
    (findRoomContainingPoint(upperFloor.rooms, wallConflicts.endRouteProbePoint) ??
      findRoomContainingPoint(upperFloor.rooms, wallConflicts.endLandingCenter))
  const endAccessPoints =
    upperFloor && endArrivalRoom
      ? getRoomAccessPoints(endArrivalRoom, upperFloor.walls, upperFloor.openings)
      : []
  const endAccessSummary =
    upperFloor && endArrivalRoom
      ? summarizeRectAccessConflicts(
          endArrivalRoom,
          getCombinedRectBounds(endLandingRect, wallConflicts.endRouteRect),
          endAccessPoints,
          'entry-clear',
        )
      : {
          totalEntryOverlap: 0,
          totalCorridorOverlap: 0,
          totalDoorSwingOverlap: 0,
          blockedEntryCount: 0,
          blockedDoorSwingCount: 0,
          hardConflict: false,
        }
  const endAccessClass = endArrivalRoom ? getRoomAccessClass(endArrivalRoom.programKey) : null
  const endRouteSupported =
    upperFloor && endArrivalRoom
      ? Boolean(
          pointInPolygon(
            wallConflicts.endRouteProbePoint[0],
            wallConflicts.endRouteProbePoint[1],
            endArrivalRoom.polygon,
          ),
        )
      : true

  let score = 100

  if (stairPlan.width < MIN_WALKABLE_STAIR_WIDTH) score -= 18
  else if (stairPlan.width < 1.0) score -= 8

  if (minTreadDepth < MIN_WALKABLE_STAIR_TREAD_DEPTH) score -= 32
  else if (minTreadDepth < TARGET_STAIR_TREAD_DEPTH) score -= 10

  if (maxRiserHeight > MAX_STAIR_RISER_HEIGHT) score -= 34
  else if (maxRiserHeight > MAX_WALKABLE_STAIR_RISER_HEIGHT) score -= 12

  if (maxPitchDegrees > MAX_WALKABLE_STAIR_PITCH_DEGREES + 1) score -= 28
  else if (maxPitchDegrees > MAX_WALKABLE_STAIR_PITCH_DEGREES) score -= 10

  if (
    comfortFormulaMin < STAIR_COMFORT_FORMULA_MIN ||
    comfortFormulaMin > STAIR_COMFORT_FORMULA_MAX
  ) {
    score -= 22
  } else if (Math.abs(comfortFormulaMin - STAIR_COMFORT_FORMULA_TARGET) > 0.025) {
    score -= 8
  }

  if (startLandingDepth < MIN_WALKABLE_STAIR_LANDING_DEPTH) score -= 10
  if (endLandingDepth < MIN_WALKABLE_STAIR_LANDING_DEPTH) score -= 10

  score -= getStairAccessClassPenalty(startAccessClass)
  if (upperFloor) {
    score -= endArrivalRoom ? getStairAccessClassPenalty(endAccessClass) : 26
  }

  if (!startRouteSupported) score -= 22
  if (upperFloor && !endRouteSupported) score -= 28
  if (startAccessSummary.hardConflict) score -= 18
  if (upperFloor && endAccessSummary.hardConflict) score -= 24
  if (wallConflicts.stairWallBlocked) score -= 38
  if (wallConflicts.startRouteWallBlocked) score -= 34
  if (wallConflicts.endRouteWallBlocked) score -= 34

  const geometryIssue =
    stairPlan.width < MIN_WALKABLE_STAIR_WIDTH ||
    minTreadDepth < MIN_WALKABLE_STAIR_TREAD_DEPTH ||
    maxRiserHeight > MAX_WALKABLE_STAIR_RISER_HEIGHT ||
    maxPitchDegrees > MAX_WALKABLE_STAIR_PITCH_DEGREES ||
    comfortFormulaMin < STAIR_COMFORT_FORMULA_MIN ||
    comfortFormulaMin > STAIR_COMFORT_FORMULA_MAX ||
    startLandingDepth < MIN_WALKABLE_STAIR_LANDING_DEPTH ||
    endLandingDepth < MIN_WALKABLE_STAIR_LANDING_DEPTH
  const wallCollisionIssue = wallConflicts.hasConflict
  const arrivalIssue =
    startAccessClass === 'private' ||
    startAccessClass === 'service' ||
    !startRouteSupported ||
    startAccessSummary.hardConflict ||
    (upperFloor
      ? !endArrivalRoom ||
        endAccessClass === 'private' ||
        endAccessClass === 'service' ||
        !endRouteSupported ||
        endAccessSummary.hardConflict
      : false)

  return {
    level: floor.level,
    roomKey: currentRoom?.key ?? stairPlan.roomKey,
    roomName: currentRoom?.name ?? (floor.label ? `${floor.label} stair` : 'Stair'),
    score: Math.round(clampNumber(score, 0, 100)),
    width: stairPlan.width,
    minTreadDepth,
    maxRiserHeight,
    maxPitchDegrees,
    comfortFormulaMin,
    startLandingDepth,
    endLandingDepth,
    startAccessClass,
    endAccessClass,
    startRouteBlocked: startAccessSummary.hardConflict,
    endRouteBlocked: upperFloor ? endAccessSummary.hardConflict : false,
    stairWallBlocked: wallConflicts.stairWallBlocked,
    startRouteWallBlocked: wallConflicts.startRouteWallBlocked,
    endRouteWallBlocked: wallConflicts.endRouteWallBlocked,
    startRouteSupported,
    endRouteSupported,
    entryRouteConnected: true,
    upperRouteConnected: true,
    verticalRouteIssue: false,
    reachableUpperRoomRefs: [],
    endArrivalRoomRef:
      upperFloor && endArrivalRoom
        ? {
            level: upperFloor.level,
            roomKey: endArrivalRoom.key,
            roomName: endArrivalRoom.name,
          }
        : null,
    geometryIssue,
    wallCollisionIssue,
    arrivalIssue,
  }
}

function scorePlacedStairCandidateWalkability(
  stairPlan: AiBuildingStairPlan,
  room: AiBuildingRoomPlan | null,
  accessPoints: AiBuildingRoomAccessPoint[],
  walls: AiBuildingWallPlan[] = [],
  openings: AiBuildingOpeningPlan[] = [],
) {
  const stairSegments = stairPlan.segments.filter(
    (segment) => segment.segmentType === 'stair' && segment.stepCount > 0,
  )
  const minTreadDepth =
    stairSegments.length > 0
      ? stairSegments.reduce(
          (minimum, segment) => Math.min(minimum, segment.length / Math.max(segment.stepCount, 1)),
          Number.POSITIVE_INFINITY,
        )
      : TARGET_STAIR_TREAD_DEPTH
  const maxRiserHeight =
    stairSegments.length > 0
      ? stairSegments.reduce(
          (maximum, segment) => Math.max(maximum, segment.height / Math.max(segment.stepCount, 1)),
          0,
        )
      : TARGET_STAIR_RISER_HEIGHT
  const maxPitchDegrees =
    stairSegments.length > 0
      ? stairSegments.reduce(
          (maximum, segment) =>
            Math.max(
              maximum,
              (Math.atan2(segment.height, Math.max(segment.length, 0.01)) * 180) / Math.PI,
            ),
          0,
        )
      : 0
  const comfortFormulaMin =
    stairSegments.length > 0
      ? stairSegments.reduce((minimum, segment) => {
          const stepCount = Math.max(segment.stepCount, 1)
          const treadDepth = segment.length / stepCount
          const riserHeight = segment.height / stepCount
          return Math.min(minimum, riserHeight * 2 + treadDepth)
        }, Number.POSITIVE_INFINITY)
      : STAIR_COMFORT_FORMULA_TARGET
  const wallConflicts = getStairSolidWallConflicts(stairPlan, walls, openings)
  const startLandingRect = getPlannedStairLandingRectBounds(stairPlan, 'start')
  const startAccessSummary = room
    ? summarizeRectAccessConflicts(
        room,
        getCombinedRectBounds(startLandingRect, wallConflicts.startRouteRect),
        accessPoints,
        'entry-clear',
      )
    : {
        totalEntryOverlap: 0,
        totalCorridorOverlap: 0,
        totalDoorSwingOverlap: 0,
        blockedEntryCount: 0,
        blockedDoorSwingCount: 0,
        hardConflict: false,
      }
  const routeSupported = room
    ? Boolean(
        pointInPolygon(
          wallConflicts.startRouteProbePoint[0],
          wallConflicts.startRouteProbePoint[1],
          room.polygon,
        ),
      )
    : true
  const accessClass = room ? getRoomAccessClass(room.programKey) : 'other'
  let score = 100

  if (stairPlan.width < MIN_WALKABLE_STAIR_WIDTH) score -= 18
  else if (stairPlan.width < 1.0) score -= 8

  if (minTreadDepth < MIN_WALKABLE_STAIR_TREAD_DEPTH) score -= 32
  else if (minTreadDepth < TARGET_STAIR_TREAD_DEPTH) score -= 10

  if (maxRiserHeight > MAX_STAIR_RISER_HEIGHT) score -= 34
  else if (maxRiserHeight > MAX_WALKABLE_STAIR_RISER_HEIGHT) score -= 12

  if (maxPitchDegrees > MAX_WALKABLE_STAIR_PITCH_DEGREES + 1) score -= 28
  else if (maxPitchDegrees > MAX_WALKABLE_STAIR_PITCH_DEGREES) score -= 10

  if (
    comfortFormulaMin < STAIR_COMFORT_FORMULA_MIN ||
    comfortFormulaMin > STAIR_COMFORT_FORMULA_MAX
  ) {
    score -= 22
  } else if (Math.abs(comfortFormulaMin - STAIR_COMFORT_FORMULA_TARGET) > 0.025) {
    score -= 8
  }

  score -= getStairAccessClassPenalty(accessClass)
  if (!routeSupported) score -= 22
  if (startAccessSummary.hardConflict) score -= 18
  if (wallConflicts.stairWallBlocked) score -= 38
  if (wallConflicts.startRouteWallBlocked) score -= 34

  const geometryIssue =
    stairPlan.width < MIN_WALKABLE_STAIR_WIDTH ||
    minTreadDepth < MIN_WALKABLE_STAIR_TREAD_DEPTH ||
    maxRiserHeight > MAX_WALKABLE_STAIR_RISER_HEIGHT ||
    maxPitchDegrees > MAX_WALKABLE_STAIR_PITCH_DEGREES ||
    comfortFormulaMin < STAIR_COMFORT_FORMULA_MIN ||
    comfortFormulaMin > STAIR_COMFORT_FORMULA_MAX
  const wallCollisionIssue = wallConflicts.stairWallBlocked || wallConflicts.startRouteWallBlocked
  const hardFailure =
    geometryIssue || wallCollisionIssue || !routeSupported || startAccessSummary.hardConflict

  return {
    score: Math.round(clampNumber(score, 0, 100)),
    minTreadDepth,
    maxRiserHeight,
    maxPitchDegrees,
    comfortFormulaMin,
    geometryIssue,
    wallCollisionIssue,
    hardFailure,
    routeSupported,
    accessClass,
    accessSummary: startAccessSummary,
  }
}

function addBlockedRectToOverlappingRooms(
  blockedRectsByRoomKey: Map<string, AiBuildingRectBounds[]>,
  rooms: AiBuildingRoomPlan[],
  rect: AiBuildingRectBounds,
) {
  for (const room of rooms) {
    const roomBounds = getRoomMetrics(room)
    if (getRectOverlapArea(roomBounds, rect) <= 0.001) continue
    blockedRectsByRoomKey.get(room.key)?.push(rect)
  }
}

function getStairBlockedRectsByRoomKey(
  rooms: AiBuildingRoomPlan[],
  floorStairs: AiBuildingStairPlan[],
  previousFloorStairs: AiBuildingStairPlan[] = [],
) {
  const blockedRectsByRoomKey = new Map(
    rooms.map((room) => [room.key, [] as AiBuildingRectBounds[]]),
  )

  for (const stair of floorStairs) {
    addBlockedRectToOverlappingRooms(
      blockedRectsByRoomKey,
      rooms,
      getPlannedStairFootprintRectBounds(stair),
    )
    addBlockedRectToOverlappingRooms(
      blockedRectsByRoomKey,
      rooms,
      getPlannedStairLandingRectBounds(stair, 'start'),
    )
  }

  for (const stair of previousFloorStairs) {
    addBlockedRectToOverlappingRooms(
      blockedRectsByRoomKey,
      rooms,
      getPlannedStairFootprintRectBounds(stair),
    )
    addBlockedRectToOverlappingRooms(
      blockedRectsByRoomKey,
      rooms,
      getPlannedStairLandingRectBounds(stair, 'end'),
    )
  }

  return blockedRectsByRoomKey
}

function resolveStraightStairGeometry(totalRise: number, availableRun: number) {
  const minSteps = Math.max(12, Math.ceil(totalRise / MAX_STAIR_RISER_HEIGHT))
  const maxStepsByRun = Math.floor((availableRun + 1e-6) / MIN_STAIR_TREAD_DEPTH)
  if (maxStepsByRun < minSteps) return null

  const stepCount = Math.round(
    clampNumber(Math.round(totalRise / TARGET_STAIR_RISER_HEIGHT), minSteps, maxStepsByRun),
  )
  const minRunLength = stepCount * MIN_STAIR_TREAD_DEPTH
  if (availableRun < minRunLength) return null

  return {
    stepCount,
    runLength: clampNumber(stepCount * TARGET_STAIR_TREAD_DEPTH, minRunLength, availableRun),
  }
}

type AiBuildingLShapedStairGeometry = {
  firstRise: number
  firstRunLength: number
  firstStepCount: number
  secondRise: number
  secondRunLength: number
  secondStepCount: number
  totalStepCount: number
}

type AiBuildingMultiFlightStairGeometry = {
  runs: number[]
  rises: number[]
  stepCounts: number[]
  totalStepCount: number
}

function resolveLShapedStepSplit(
  totalStepCount: number,
  targetFirstStepCount: number,
  maxFirstStepCount: number,
  maxSecondStepCount: number,
) {
  let firstStepCount = Math.round(
    clampNumber(targetFirstStepCount, MIN_TURNING_STAIR_FLIGHT_STEPS, maxFirstStepCount),
  )
  let secondStepCount = totalStepCount - firstStepCount

  if (secondStepCount < MIN_TURNING_STAIR_FLIGHT_STEPS) {
    firstStepCount = totalStepCount - MIN_TURNING_STAIR_FLIGHT_STEPS
    secondStepCount = MIN_TURNING_STAIR_FLIGHT_STEPS
  }

  if (secondStepCount > maxSecondStepCount) {
    secondStepCount = maxSecondStepCount
    firstStepCount = totalStepCount - secondStepCount
  }

  if (
    firstStepCount < MIN_TURNING_STAIR_FLIGHT_STEPS ||
    firstStepCount > maxFirstStepCount ||
    secondStepCount < MIN_TURNING_STAIR_FLIGHT_STEPS ||
    secondStepCount > maxSecondStepCount
  ) {
    return null
  }

  return { firstStepCount, secondStepCount }
}

function resolveLShapedStairGeometries(
  totalRise: number,
  primaryAvailableRun: number,
  secondaryAvailableRun: number,
) {
  const maxFirstStepCount = Math.floor((primaryAvailableRun + 1e-6) / MIN_STAIR_TREAD_DEPTH)
  const maxSecondStepCount = Math.floor((secondaryAvailableRun + 1e-6) / MIN_STAIR_TREAD_DEPTH)
  const minTotalStepCount = Math.max(12, Math.ceil(totalRise / MAX_STAIR_RISER_HEIGHT))
  if (
    maxFirstStepCount < MIN_TURNING_STAIR_FLIGHT_STEPS ||
    maxSecondStepCount < MIN_TURNING_STAIR_FLIGHT_STEPS ||
    maxFirstStepCount + maxSecondStepCount < minTotalStepCount
  ) {
    return [] as AiBuildingLShapedStairGeometry[]
  }

  const totalStepCount = Math.round(
    clampNumber(
      Math.round(totalRise / TARGET_STAIR_RISER_HEIGHT),
      minTotalStepCount,
      maxFirstStepCount + maxSecondStepCount,
    ),
  )
  const proportionalTarget =
    totalStepCount * (primaryAvailableRun / Math.max(primaryAvailableRun + secondaryAvailableRun, 0.001))
  const stepTargets = [
    Math.round(totalStepCount / 2),
    Math.round(proportionalTarget),
    Math.floor(totalStepCount / 2),
    Math.ceil(totalStepCount / 2),
  ]
  const geometries: AiBuildingLShapedStairGeometry[] = []
  const seen = new Set<string>()
  const riserHeight = totalRise / totalStepCount

  for (const stepTarget of stepTargets) {
    const stepSplit = resolveLShapedStepSplit(
      totalStepCount,
      stepTarget,
      maxFirstStepCount,
      maxSecondStepCount,
    )
    if (!stepSplit) continue

    const key = `${stepSplit.firstStepCount}:${stepSplit.secondStepCount}`
    if (seen.has(key)) continue
    seen.add(key)

    const firstMinRun = stepSplit.firstStepCount * MIN_STAIR_TREAD_DEPTH
    const secondMinRun = stepSplit.secondStepCount * MIN_STAIR_TREAD_DEPTH
    if (primaryAvailableRun < firstMinRun || secondaryAvailableRun < secondMinRun) continue

    geometries.push({
      firstRise: riserHeight * stepSplit.firstStepCount,
      firstRunLength: clampNumber(
        stepSplit.firstStepCount * TARGET_STAIR_TREAD_DEPTH,
        firstMinRun,
        primaryAvailableRun,
      ),
      firstStepCount: stepSplit.firstStepCount,
      secondRise: riserHeight * stepSplit.secondStepCount,
      secondRunLength: clampNumber(
        stepSplit.secondStepCount * TARGET_STAIR_TREAD_DEPTH,
        secondMinRun,
        secondaryAvailableRun,
      ),
      secondStepCount: stepSplit.secondStepCount,
      totalStepCount,
    })
  }

  return geometries
}

function resolveMultiFlightStepCounts(
  totalStepCount: number,
  availableRuns: number[],
  compactness: 'standard' | 'compact' = 'standard',
) {
  const maxStepCounts = availableRuns.map((run) =>
    Math.floor((run + 1e-6) / MIN_STAIR_TREAD_DEPTH),
  )
  const minStepsPerFlight =
    compactness === 'compact'
      ? Math.max(3, MIN_TURNING_STAIR_FLIGHT_STEPS - 1)
      : MIN_TURNING_STAIR_FLIGHT_STEPS
  if (
    maxStepCounts.some((count) => count < minStepsPerFlight) ||
    maxStepCounts.reduce((sum, count) => sum + count, 0) < totalStepCount
  ) {
    return null
  }

  const availableTotal = availableRuns.reduce((sum, run) => sum + Math.max(run, 0), 0)
  const counts = availableRuns.map((run, index) =>
    Math.round(
      clampNumber(
        totalStepCount * (Math.max(run, 0) / Math.max(availableTotal, 0.001)),
        minStepsPerFlight,
        maxStepCounts[index] ?? minStepsPerFlight,
      ),
    ),
  )

  let delta = totalStepCount - counts.reduce((sum, count) => sum + count, 0)
  while (delta !== 0) {
    const direction = Math.sign(delta)
    const candidateIndex = counts.findIndex((count, index) =>
      direction > 0
        ? count < (maxStepCounts[index] ?? count)
        : count > minStepsPerFlight,
    )
    if (candidateIndex < 0) return null
    counts[candidateIndex] = (counts[candidateIndex] ?? minStepsPerFlight) + direction
    delta -= direction
  }

  return counts
}

function resolveMultiTurnStairGeometries(
  totalRise: number,
  availableRuns: number[],
  compactness: 'standard' | 'compact' = 'standard',
) {
  const minStepsPerFlight =
    compactness === 'compact'
      ? Math.max(3, MIN_TURNING_STAIR_FLIGHT_STEPS - 1)
      : MIN_TURNING_STAIR_FLIGHT_STEPS
  const minTotalStepCount = Math.max(
    minStepsPerFlight * availableRuns.length,
    Math.ceil(totalRise / MAX_STAIR_RISER_HEIGHT),
  )
  const maxTotalStepCount = availableRuns.reduce(
    (sum, run) => sum + Math.floor((run + 1e-6) / MIN_STAIR_TREAD_DEPTH),
    0,
  )
  if (maxTotalStepCount < minTotalStepCount) return [] as AiBuildingMultiFlightStairGeometry[]

  const targetStepCounts = [
    Math.round(totalRise / TARGET_STAIR_RISER_HEIGHT),
    minTotalStepCount,
    Math.floor((minTotalStepCount + maxTotalStepCount) / 2),
  ]
  const geometries: AiBuildingMultiFlightStairGeometry[] = []
  const seen = new Set<string>()

  for (const targetStepCount of targetStepCounts) {
    const totalStepCount = Math.round(
      clampNumber(targetStepCount, minTotalStepCount, maxTotalStepCount),
    )
    const stepCounts = resolveMultiFlightStepCounts(totalStepCount, availableRuns, compactness)
    if (!stepCounts) continue

    const key = stepCounts.join(':')
    if (seen.has(key)) continue
    seen.add(key)

    const riserHeight = totalRise / totalStepCount
    const runs = stepCounts.map((stepCount, index) => {
      const minRun = stepCount * MIN_STAIR_TREAD_DEPTH
      return clampNumber(
        stepCount * TARGET_STAIR_TREAD_DEPTH,
        minRun,
        availableRuns[index] ?? minRun,
      )
    })

    geometries.push({
      runs,
      rises: stepCounts.map((stepCount) => stepCount * riserHeight),
      stepCounts,
      totalStepCount,
    })
  }

  return geometries
}

function createStraightStairPlan(
  stairWidth: number,
  rotation: number,
  totalRise: number,
  geometry: ReturnType<typeof resolveStraightStairGeometry>,
): AiBuildingStairPlan | null {
  if (!geometry) return null

  return {
    key: 'core_stair_straight',
    roomKey: '',
    layoutType: 'straight',
    position: [0, 0, 0],
    rotation,
    width: stairWidth,
    runLength: geometry.runLength,
    totalRise,
    stepCount: geometry.stepCount,
    segments: [
      {
        segmentType: 'stair',
        width: stairWidth,
        length: geometry.runLength,
        height: totalRise,
        stepCount: geometry.stepCount,
        attachmentSide: 'front',
      },
      {
        segmentType: 'landing',
        width: stairWidth,
        length: STAIR_TOP_LANDING_DEPTH,
        height: 0,
        stepCount: 0,
        attachmentSide: 'front',
      },
    ],
  }
}

function createLShapedStairPlans(
  stairWidth: number,
  rotation: number,
  totalRise: number,
  primaryAvailableRun: number,
  secondaryAvailableRun: number,
) {
  return resolveLShapedStairGeometries(
    totalRise,
    primaryAvailableRun,
    secondaryAvailableRun,
  ).flatMap((geometry) =>
    (['left', 'right'] as const).map((turnSide) => ({
      key: `core_stair_l_${turnSide}`,
      roomKey: '',
      layoutType: 'l-shaped' as const,
      position: [0, 0, 0] as Point3D,
      rotation,
      width: stairWidth,
      runLength: Math.max(geometry.firstRunLength, geometry.secondRunLength),
      totalRise,
      stepCount: geometry.totalStepCount,
      segments: [
        {
          segmentType: 'stair' as const,
          width: stairWidth,
          length: geometry.firstRunLength,
          height: geometry.firstRise,
          stepCount: geometry.firstStepCount,
          attachmentSide: 'front' as const,
        },
        {
          segmentType: 'landing' as const,
          width: stairWidth,
          length: stairWidth,
          height: 0,
          stepCount: 0,
          attachmentSide: 'front' as const,
        },
        {
          segmentType: 'stair' as const,
          width: stairWidth,
          length: geometry.secondRunLength,
          height: geometry.secondRise,
          stepCount: geometry.secondStepCount,
          attachmentSide: turnSide,
        },
        {
          segmentType: 'landing' as const,
          width: stairWidth,
          length: STAIR_TOP_LANDING_DEPTH,
          height: 0,
          stepCount: 0,
          attachmentSide: 'front' as const,
        },
      ],
    })),
  )
}

function createMultiTurnStairPlan(
  key: string,
  layoutType: Extract<AiBuildingStairLayoutType, 'u-shaped' | 'compact-switchback'>,
  stairWidth: number,
  rotation: number,
  totalRise: number,
  geometry: AiBuildingMultiFlightStairGeometry,
  turnSides: Array<'left' | 'right'>,
): AiBuildingStairPlan {
  const segments: AiBuildingStairSegmentPlan[] = []

  for (let index = 0; index < geometry.runs.length; index += 1) {
    segments.push({
      segmentType: 'stair',
      width: stairWidth,
      length: geometry.runs[index] ?? MIN_STAIR_TREAD_DEPTH,
      height: geometry.rises[index] ?? 0,
      stepCount: geometry.stepCounts[index] ?? 1,
      attachmentSide: index === 0 ? 'front' : (turnSides[index - 1] ?? 'left'),
    })
    segments.push({
      segmentType: 'landing',
      width: stairWidth,
      length: index === geometry.runs.length - 1 ? STAIR_TOP_LANDING_DEPTH : stairWidth,
      height: 0,
      stepCount: 0,
      attachmentSide: 'front',
    })
  }

  return {
    key,
    roomKey: '',
    layoutType,
    position: [0, 0, 0],
    rotation,
    width: stairWidth,
    runLength: Math.max(...geometry.runs),
    totalRise,
    stepCount: geometry.totalStepCount,
    segments,
  }
}

function createMultiTurnStairPlans(
  stairWidth: number,
  rotation: number,
  totalRise: number,
  primaryAvailableRun: number,
  secondaryAvailableRun: number,
) {
  const uRuns = [primaryAvailableRun, secondaryAvailableRun, primaryAvailableRun]
  const compactRuns = [
    primaryAvailableRun * 0.72,
    secondaryAvailableRun,
    primaryAvailableRun * 0.72,
  ]

  return [
    ...resolveMultiTurnStairGeometries(totalRise, uRuns, 'standard').flatMap((geometry) =>
      (['left', 'right'] as const).map((turnSide) =>
        createMultiTurnStairPlan(
          `core_stair_u_${turnSide}`,
          'u-shaped',
          stairWidth,
          rotation,
          totalRise,
          geometry,
          [turnSide, turnSide],
        ),
      ),
    ),
    ...resolveMultiTurnStairGeometries(totalRise, compactRuns, 'compact').flatMap((geometry) =>
      (['left', 'right'] as const).map((turnSide) =>
        createMultiTurnStairPlan(
          `core_stair_compact_switchback_${turnSide}`,
          'compact-switchback',
          stairWidth,
          rotation,
          totalRise,
          geometry,
          [turnSide, turnSide],
        ),
      ),
    ),
  ]
}

function createStairPlanCandidates(
  bounds: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
    width: number
    depth: number
  },
  stairWidth: number,
  totalRise: number,
  rotation: number,
) {
  const alongDepth = Math.abs(Math.cos(rotation)) >= Math.abs(Math.sin(rotation))
  const primaryAvailableRun =
    (alongDepth ? bounds.depth : bounds.width) - STAIR_PLACEMENT_MARGIN * 2
  const secondaryAvailableRun =
    (alongDepth ? bounds.width : bounds.depth) - STAIR_PLACEMENT_MARGIN * 2

  const plans: AiBuildingStairPlan[] = []
  const straightPlan = createStraightStairPlan(
    stairWidth,
    rotation,
    totalRise,
    resolveStraightStairGeometry(totalRise, primaryAvailableRun),
  )
  if (straightPlan) {
    plans.push(straightPlan)
  }

  plans.push(
    ...createLShapedStairPlans(
      stairWidth,
      rotation,
      totalRise,
      primaryAvailableRun,
      secondaryAvailableRun,
    ),
  )

  plans.push(
    ...createMultiTurnStairPlans(
      stairWidth,
      rotation,
      totalRise,
      primaryAvailableRun,
      secondaryAvailableRun,
    ),
  )

  return plans
}

function getStairRoomPriority(room: AiBuildingRoomPlan) {
  switch (room.programKey) {
    case 'stairs':
    case 'elevator':
      return 110
    case 'entry':
    case 'corridor':
      return 92
    case 'study':
    case 'storage':
    case 'open_office':
      return 58
    case 'garage':
      return 44
    case 'living_room':
      return 32
    case 'kitchen':
    case 'dining_room':
      return 26
    case 'bedroom':
    case 'primary_bedroom':
      return 12
    case 'bathroom':
      return -28
    case 'courtyard':
    case 'balcony':
      return -120
    default:
      return 20
  }
}

function getStairLayoutDesignBias(
  layoutType: AiBuildingStairLayoutType,
  bounds: { width: number; depth: number },
) {
  const minSpan = Math.min(bounds.width, bounds.depth)

  switch (layoutType) {
    case 'u-shaped':
      return minSpan >= 3.2 ? 14 : 6
    case 'l-shaped':
      return 10
    case 'compact-switchback':
      return minSpan <= 4.2 ? 8 : -2
    case 'straight':
      return minSpan >= 5 ? 4 : 0
  }
}

function getPreferredStairRooms(rooms: AiBuildingRoomPlan[]) {
  const sortRooms = (candidates: AiBuildingRoomPlan[]) =>
    [...candidates].sort((left, right) => {
      const priorityDifference = getStairRoomPriority(right) - getStairRoomPriority(left)
      if (priorityDifference !== 0) return priorityDifference
      return getRoomMetrics(right).maxSpan - getRoomMetrics(left).maxSpan
    })

  const publicCandidates = rooms.filter((room) => {
    if (getStairRoomPriority(room) <= -100) return false
    const accessClass = getRoomAccessClass(room.programKey)
    return accessClass === 'circulation' || accessClass === 'public'
  })
  if (publicCandidates.length > 0) return sortRooms(publicCandidates)

  const nonPrivateCandidates = rooms.filter((room) => {
    if (getStairRoomPriority(room) <= -100) return false
    return !isPrivateAccessClass(getRoomAccessClass(room.programKey))
  })
  if (nonPrivateCandidates.length > 0) return sortRooms(nonPrivateCandidates)

  return sortRooms(rooms.filter((room) => getStairRoomPriority(room) > -100))
}

function getRotationDistance(left: number, right: number) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)))
}

function getStackAlignedStairRooms(
  rooms: AiBuildingRoomPlan[],
  previousFloorStair: AiBuildingStairPlan | null,
) {
  if (!previousFloorStair) return rooms
  const anchorRect = getPlannedStairStackAnchorRectBounds(previousFloorStair)
  const overlappingRooms = rooms.filter(
    (room) => getRectOverlapArea(getRoomMetrics(room), anchorRect) > 0.08,
  )
  return overlappingRooms.length > 0 ? overlappingRooms : rooms
}

function getVerticalCoreAlignedRooms(
  rooms: AiBuildingRoomPlan[],
  anchor: ProgramDrivenVerticalAnchor | null | undefined,
) {
  if (!anchor) return [] as AiBuildingRoomPlan[]
  const anchorRect = {
    minX: anchor.minX,
    maxX: anchor.maxX,
    minZ: anchor.minZ,
    maxZ: anchor.maxZ,
  }

  return rooms
    .filter((room) => getRectOverlapArea(getRoomMetrics(room), anchorRect) > 0.08)
    .sort((left, right) => {
      const priorityDifference = getStairRoomPriority(right) - getStairRoomPriority(left)
      if (priorityDifference !== 0) return priorityDifference
      return getRectOverlapArea(getRoomMetrics(right), anchorRect) -
        getRectOverlapArea(getRoomMetrics(left), anchorRect)
    })
}

function mergeUniqueRoomsByKey(...roomGroups: AiBuildingRoomPlan[][]) {
  const seen = new Set<string>()
  const rooms: AiBuildingRoomPlan[] = []

  for (const room of roomGroups.flat()) {
    if (seen.has(room.key)) continue
    seen.add(room.key)
    rooms.push(room)
  }

  return rooms
}

function getStairRotationCandidates(room: AiBuildingRoomPlan, preferredRotation?: number | null) {
  const metrics = getRoomMetrics(room)
  const baseRotations =
    metrics.depth >= metrics.width
      ? [0, Math.PI, Math.PI / 2, -Math.PI / 2]
      : [Math.PI / 2, -Math.PI / 2, 0, Math.PI]

  if (!Number.isFinite(preferredRotation)) return baseRotations

  return [
    preferredRotation!,
    ...baseRotations.filter((rotation) => getRotationDistance(rotation, preferredRotation!) > 0.01),
  ]
}

function dedupeStairAnchorPoints(points: Point3D[]) {
  const seen = new Set<string>()
  return points.filter((point) => {
    const key = `${point[0].toFixed(2)}:${point[2].toFixed(2)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getStairAnchorCandidatePoints(
  room: AiBuildingRoomPlan,
  layoutHint: AiBuildingGridLayoutHint | null | undefined,
) {
  const ratios: Array<[number, number]> = [
    [0.5, 0.42],
    [0.5, 0.5],
    [0.35, 0.35],
    [0.65, 0.35],
    [0.35, 0.65],
    [0.65, 0.65],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
  ]

  return dedupeStairAnchorPoints(
    ratios.map(([xRatio, zRatio]) => roomPointByLayout(room, layoutHint, xRatio, zRatio)),
  )
}

function getVerticalCoreAnchorPoint(anchor: ProgramDrivenVerticalAnchor | null | undefined) {
  if (!anchor) return null
  return [anchor.centerX, 0, anchor.centerZ] as Point3D
}

function createFloorStairPlans(
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
  openings: AiBuildingOpeningPlan[],
  roomAccessPointsByKey: Map<string, AiBuildingRoomAccessPoint[]>,
  totalRise: number,
  layoutHint: AiBuildingGridLayoutHint | null | undefined,
  floorBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  previousFloorStairs: AiBuildingStairPlan[] = [],
  verticalCoreAnchor?: ProgramDrivenVerticalAnchor | null,
) {
  const stairWidth = 1.12
  const previousFloorStair = previousFloorStairs[0] ?? null
  const stackedLandingCenter = previousFloorStair
    ? getPlannedStairLandingCenter(previousFloorStair, 'end')
    : null
  const stackedAnchorRect = previousFloorStair
    ? getPlannedStairStackAnchorRectBounds(previousFloorStair)
    : null
  let best: {
    roomKey: string
    plan: AiBuildingStairPlan
    score: number
  } | null = null

  const preferredRooms = getStackAlignedStairRooms(
    getPreferredStairRooms(rooms),
    previousFloorStair,
  )
  const candidateRooms = mergeUniqueRoomsByKey(
    getVerticalCoreAlignedRooms(rooms, verticalCoreAnchor),
    preferredRooms,
  )
  const fallbackRoom: AiBuildingRoomPlan = {
    key: '__floor_envelope__',
    name: 'Floor Envelope',
    color: '#dbeafe',
    polygon: rect(floorBounds.minX, floorBounds.minZ, floorBounds.maxX, floorBounds.maxZ),
  }
  const allCandidateRooms = candidateRooms.length > 0 ? candidateRooms : [fallbackRoom]

  for (const room of allCandidateRooms) {
    const isFallbackRoom = room.key === fallbackRoom.key
    const bounds = getRoomMetrics(room)
    const roomCenter = getRoomCenter(room)
    const accessPoints = isFallbackRoom ? [] : roomAccessPointsByKey.get(room.key) ?? []
    const anchorPoints = getStairAnchorCandidatePoints(room, layoutHint)

    for (const rotation of getStairRotationCandidates(room, previousFloorStair?.rotation)) {
      for (const stairCandidate of createStairPlanCandidates(bounds, stairWidth, totalRise, rotation)) {
        const placementRange = getPlannedStairProtectedPlacementRange(bounds, stairCandidate)
        if (!placementRange) continue

        const stackedPosition = stackedLandingCenter
          ? getPlannedStairPositionFromLandingCenter(stackedLandingCenter, stairCandidate, 'start')
          : null
        const verticalCoreAnchorPoint = getVerticalCoreAnchorPoint(verticalCoreAnchor)
        const rawPositions = dedupeStairAnchorPoints([
          ...(stackedPosition ? [stackedPosition] : []),
          ...(verticalCoreAnchorPoint ? [verticalCoreAnchorPoint] : []),
          ...anchorPoints,
        ])

        for (const rawPosition of rawPositions) {
          const position: Point3D = [
            clampNumber(rawPosition[0], placementRange.minX, placementRange.maxX),
            0,
            clampNumber(rawPosition[2], placementRange.minZ, placementRange.maxZ),
          ]
          const placedPlan: AiBuildingStairPlan = {
            ...stairCandidate,
            key: isFallbackRoom ? `${stairCandidate.key}_fallback` : stairCandidate.key,
            roomKey: room.key,
            position,
          }
          const footprintRect = getPlannedStairFootprintRectBounds(placedPlan)
          const startLandingRect = getPlannedStairLandingRectBounds(placedPlan, 'start')
          const endLandingRect = getPlannedStairLandingRectBounds(placedPlan, 'end')
          const protectedRect = getPlannedStairProtectedRectBounds(placedPlan)
          const protectedClearance = getRectClearanceWithinBounds(protectedRect, bounds)
          if (protectedClearance < STAIR_WALL_CLEARANCE - 0.01) continue

          const accessSummary = isFallbackRoom
            ? {
                hardConflict: false,
                totalEntryOverlap: 0,
                totalCorridorOverlap: 0,
                totalDoorSwingOverlap: 0,
              }
            : summarizeRectAccessConflicts(
                room,
                getCombinedRectBounds(footprintRect, startLandingRect),
                accessPoints,
                'entry-clear',
              )
          if (accessSummary.hardConflict) continue

          const footprintCenter: Point2D = [
            (footprintRect.minX + footprintRect.maxX) / 2,
            (footprintRect.minZ + footprintRect.maxZ) / 2,
          ]
          const centerDistance = getPointDistance(roomCenter, footprintCenter)
          const slackX = Math.min(protectedRect.minX - bounds.minX, bounds.maxX - protectedRect.maxX)
          const slackZ = Math.min(protectedRect.minZ - bounds.minZ, bounds.maxZ - protectedRect.maxZ)
          const arrivalClearance = getRectClearanceWithinBounds(endLandingRect, bounds)
          const stackShiftDistance = stackedPosition
            ? getPointDistance([position[0], position[2]], [stackedPosition[0], stackedPosition[2]])
            : 0
          const stackRotationDistance = previousFloorStair
            ? getRotationDistance(rotation, previousFloorStair.rotation)
            : 0
          const stackAnchorOverlap = stackedAnchorRect
            ? getRectOverlapArea(protectedRect, stackedAnchorRect)
            : 0
          const candidateWalls = clipInteriorWallsForRects(walls, [protectedRect])
          const walkability = scorePlacedStairCandidateWalkability(
            placedPlan,
            isFallbackRoom ? null : room,
            accessPoints,
            candidateWalls,
            openings,
          )
          if (walkability.hardFailure) continue
          const layoutBias = getStairLayoutDesignBias(placedPlan.layoutType, bounds)
          const score =
            (isFallbackRoom ? 0 : getStairRoomPriority(room)) +
            layoutBias +
            (walkability.score - 78) * 1.6 +
            Math.min(slackX, slackZ) * 18 -
            centerDistance * 7 -
            stackShiftDistance * 38 -
            stackRotationDistance * 16 +
            stackAnchorOverlap * 42 -
            Math.max(0, STAIR_WALL_CLEARANCE - protectedClearance) * 180 -
            Math.max(0, 0.12 - arrivalClearance) * 120 -
            accessSummary.totalEntryOverlap * 240 -
            accessSummary.totalCorridorOverlap * 120 -
            accessSummary.totalDoorSwingOverlap * 180

          if (!best || score > best.score) {
            best = {
              roomKey: room.key,
              score,
              plan: placedPlan,
            }
          }
        }
      }
    }
  }

  return best ? [best.plan] : []
}

function itemPlan(
  key: string,
  assetId: AiBuildingAssetId,
  position: Point3D,
  options: Pick<AiBuildingItemPlan, 'rotation' | 'scale'> = {},
): AiBuildingItemPlan {
  return {
    key,
    assetId,
    position,
    ...options,
  }
}

type AiBuildingAxisAnchor = 'start' | 'center' | 'end' | number

type AiBuildingPlacedItemPlan = {
  plan: AiBuildingItemPlan
  scale: Point3D
  rotationY: number
}

function multiplyPoint3D(left: Point3D, right: Point3D): Point3D {
  return [left[0] * right[0], left[1] * right[1], left[2] * right[2]]
}

function getAssetScale(assetId: AiBuildingAssetId) {
  const assetScale = ITEM_ASSETS[assetId].scale
  return Array.isArray(assetScale) && assetScale.length === 3
    ? ([assetScale[0] ?? 1, assetScale[1] ?? 1, assetScale[2] ?? 1] as Point3D)
    : ([1, 1, 1] as Point3D)
}

function getEffectiveItemScale(assetId: AiBuildingAssetId, scale: Point3D = [1, 1, 1]) {
  return multiplyPoint3D(getAssetScale(assetId), scale)
}

function getScaledAssetDimensions(assetId: AiBuildingAssetId, scale: Point3D = [1, 1, 1]) {
  const assetInput = ITEM_ASSETS[assetId]
  const dimensions = (assetInput.dimensions ?? [1, 1, 1]) as Point3D
  return multiplyPoint3D(dimensions, getEffectiveItemScale(assetId, scale))
}

function getRotatedFootprintSpan(
  assetId: AiBuildingAssetId,
  scale: Point3D = [1, 1, 1],
  rotationY = 0,
) {
  const [baseWidth, , baseDepth] = getScaledAssetDimensions(assetId, scale)
  const cos = Math.abs(Math.cos(rotationY))
  const sin = Math.abs(Math.sin(rotationY))
  return {
    width: baseWidth * cos + baseDepth * sin,
    depth: baseWidth * sin + baseDepth * cos,
  }
}

function getRoomMetrics(room: AiBuildingRoomPlan) {
  const bounds = getRoomBounds(room)
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  return {
    ...bounds,
    width,
    depth,
    area: Math.max(0.1, width * depth),
    minSpan: Math.min(width, depth),
    maxSpan: Math.max(width, depth),
  }
}

function fitScaleToRoom(
  room: AiBuildingRoomPlan,
  assetId: AiBuildingAssetId,
  rotationY: number,
  scale: Point3D = [1, 1, 1],
  fitWidthRatio = 0.64,
  fitDepthRatio = 0.64,
) {
  const metrics = getRoomMetrics(room)
  const footprint = getRotatedFootprintSpan(assetId, scale, rotationY)
  const maxWidth = Math.max(0.5, metrics.width * fitWidthRatio)
  const maxDepth = Math.max(0.5, metrics.depth * fitDepthRatio)
  const shrinkRatio = Math.min(
    1,
    maxWidth / Math.max(footprint.width, 0.01),
    maxDepth / Math.max(footprint.depth, 0.01),
  )

  if (shrinkRatio >= 0.995) return scale

  return [scale[0] * shrinkRatio, scale[1] * shrinkRatio, scale[2] * shrinkRatio] satisfies Point3D
}

function resolveAxisAnchor(
  min: number,
  max: number,
  span: number,
  anchor: AiBuildingAxisAnchor,
  margin: number,
) {
  const safeMin = min + span / 2 + margin
  const safeMax = max - span / 2 - margin
  if (!(safeMin <= safeMax)) return (min + max) / 2

  if (anchor === 'start') return safeMin
  if (anchor === 'end') return safeMax
  if (anchor === 'center') return (safeMin + safeMax) / 2
  return safeMin + clampNumber(anchor, 0, 1) * (safeMax - safeMin)
}

function clampItemPositionToRoom(
  room: AiBuildingRoomPlan,
  assetId: AiBuildingAssetId,
  position: Point3D,
  rotationY = 0,
  scale: Point3D = [1, 1, 1],
  marginX = 0.18,
  marginZ = 0.18,
) {
  const metrics = getRoomMetrics(room)
  const footprint = getRotatedFootprintSpan(assetId, scale, rotationY)
  const minX = metrics.minX + footprint.width / 2 + marginX
  const maxX = metrics.maxX - footprint.width / 2 - marginX
  const minZ = metrics.minZ + footprint.depth / 2 + marginZ
  const maxZ = metrics.maxZ - footprint.depth / 2 - marginZ

  return [
    minX <= maxX ? clampNumber(position[0], minX, maxX) : (metrics.minX + metrics.maxX) / 2,
    position[1],
    minZ <= maxZ ? clampNumber(position[2], minZ, maxZ) : (metrics.minZ + metrics.maxZ) / 2,
  ] satisfies Point3D
}

function placeAnchoredItem(
  room: AiBuildingRoomPlan,
  key: string,
  assetId: AiBuildingAssetId,
  options: {
    anchorX?: AiBuildingAxisAnchor
    anchorZ?: AiBuildingAxisAnchor
    rotationY?: number
    scale?: Point3D
    y?: number
    marginX?: number
    marginZ?: number
    fitWidthRatio?: number
    fitDepthRatio?: number
  } = {},
): AiBuildingPlacedItemPlan {
  const rotationY = options.rotationY ?? 0
  const fittedScale = fitScaleToRoom(
    room,
    assetId,
    rotationY,
    options.scale,
    options.fitWidthRatio,
    options.fitDepthRatio,
  )
  const metrics = getRoomMetrics(room)
  const footprint = getRotatedFootprintSpan(assetId, fittedScale, rotationY)
  const position: Point3D = [
    resolveAxisAnchor(
      metrics.minX,
      metrics.maxX,
      footprint.width,
      options.anchorX ?? 'center',
      options.marginX ?? 0.2,
    ),
    options.y ?? 0,
    resolveAxisAnchor(
      metrics.minZ,
      metrics.maxZ,
      footprint.depth,
      options.anchorZ ?? 'center',
      options.marginZ ?? 0.2,
    ),
  ]

  return {
    plan: itemPlan(key, assetId, position, {
      rotation: [0, rotationY, 0],
      scale: fittedScale,
    }),
    scale: fittedScale,
    rotationY,
  }
}

function getItemSurface(assetId: AiBuildingAssetId): AiBuildingItemSurface {
  return ITEM_SURFACE_BY_ASSET_ID[assetId] ?? 'floor'
}

function getPlacementProfile(
  assetId: AiBuildingAssetId,
  overrides: Partial<AiBuildingItemPlacementProfile> = {},
): AiBuildingItemPlacementProfile {
  return {
    role: 'flex',
    minGap: 0.36,
    ...ITEM_PLACEMENT_PROFILES[assetId],
    ...overrides,
  }
}

function getRoomCenter(room: AiBuildingRoomPlan): Point2D {
  const metrics = getRoomMetrics(room)
  return [(metrics.minX + metrics.maxX) / 2, (metrics.minZ + metrics.maxZ) / 2]
}

function getFootprintCenter(footprint: ReturnType<typeof getItemFootprint>): Point2D {
  return [(footprint.minX + footprint.maxX) / 2, (footprint.minZ + footprint.maxZ) / 2]
}

function getPointDistance(left: Point2D, right: Point2D) {
  return Math.hypot(left[0] - right[0], left[1] - right[1])
}

function getNormalizedAngleDifference(left: number, right: number) {
  const difference = Math.atan2(Math.sin(left - right), Math.cos(left - right))
  return Math.abs(difference)
}

function getFootprintGap(
  left: ReturnType<typeof getItemFootprint>,
  right: ReturnType<typeof getItemFootprint>,
) {
  const gapX = Math.max(0, left.minX - right.maxX, right.minX - left.maxX)
  const gapZ = Math.max(0, left.minZ - right.maxZ, right.minZ - left.maxZ)
  return Math.hypot(gapX, gapZ)
}

function getFootprintBoundaryClearances(
  room: AiBuildingRoomPlan,
  footprint: ReturnType<typeof getItemFootprint>,
) {
  const metrics = getRoomMetrics(room)
  const values = [
    footprint.minX - metrics.minX,
    metrics.maxX - footprint.maxX,
    footprint.minZ - metrics.minZ,
    metrics.maxZ - footprint.maxZ,
  ].sort((left, right) => left - right)

  return {
    nearest: values[0] ?? 0,
    secondary: values[1] ?? 0,
    cornerReach: (values[0] ?? 0) + (values[1] ?? 0),
  }
}

function getRoomCenterBand(room: AiBuildingRoomPlan, ratio = 0.3) {
  const metrics = getRoomMetrics(room)
  const center = getRoomCenter(room)
  const width = Math.max(0.9, metrics.width * ratio)
  const depth = Math.max(0.9, metrics.depth * ratio)
  return {
    minX: center[0] - width / 2,
    maxX: center[0] + width / 2,
    minZ: center[1] - depth / 2,
    maxZ: center[1] + depth / 2,
  }
}

function getRectOverlapArea(left: AiBuildingRectBounds, right: AiBuildingRectBounds) {
  const overlapWidth = Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX)
  const overlapDepth = Math.min(left.maxZ, right.maxZ) - Math.max(left.minZ, right.minZ)
  if (!(overlapWidth > 0 && overlapDepth > 0)) return 0
  return overlapWidth * overlapDepth
}

function getRectGap(left: AiBuildingRectBounds, right: AiBuildingRectBounds) {
  const gapX = Math.max(0, left.minX - right.maxX, right.minX - left.maxX)
  const gapZ = Math.max(0, left.minZ - right.maxZ, right.minZ - left.maxZ)
  return Math.hypot(gapX, gapZ)
}

function getRectCenter(rectBounds: AiBuildingRectBounds): Point2D {
  return [(rectBounds.minX + rectBounds.maxX) / 2, (rectBounds.minZ + rectBounds.maxZ) / 2]
}

function rotateLocalPoint(point: Point2D, rotationY: number): Point2D {
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos]
}

function getLocalPointFromWorldVector(point: Point2D, rotationY: number): Point2D {
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  return [point[0] * cos + point[1] * sin, -point[0] * sin + point[1] * cos]
}

function normalizePoint2D(point: Point2D): Point2D {
  const length = Math.hypot(point[0], point[1])
  if (length <= 1e-6) return [0, 0]
  return [point[0] / length, point[1] / length]
}

function createCorridorRectBetweenPoints(
  start: Point2D,
  end: Point2D,
  width: number,
): AiBuildingRectBounds {
  const halfWidth = width / 2
  if (Math.abs(start[0] - end[0]) >= Math.abs(start[1] - end[1])) {
    return {
      minX: Math.min(start[0], end[0]),
      maxX: Math.max(start[0], end[0]),
      minZ: Math.min(start[1], end[1]) - halfWidth,
      maxZ: Math.max(start[1], end[1]) + halfWidth,
    }
  }

  return {
    minX: Math.min(start[0], end[0]) - halfWidth,
    maxX: Math.max(start[0], end[0]) + halfWidth,
    minZ: Math.min(start[1], end[1]),
    maxZ: Math.max(start[1], end[1]),
  }
}

function getFootprintRectOverlapArea(
  footprint: ReturnType<typeof getItemFootprint>,
  rectBounds: AiBuildingRectBounds,
) {
  return getRectOverlapArea(footprint, rectBounds)
}

function getWallPointAtLocalX(wall: AiBuildingWallPlan, localX: number): Point2D {
  const length = getWallLength(wall)
  if (length <= 0.001) return wall.start
  const ratio = clampNumber(localX / length, 0, 1)
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * ratio,
    wall.start[1] + (wall.end[1] - wall.start[1]) * ratio,
  ]
}

function getRoomAccessDirectionForWall(
  room: AiBuildingRoomPlan,
  wall: AiBuildingWallPlan,
  wallPoint: Point2D,
) {
  const metrics = getRoomMetrics(room)
  const epsilon = 0.12
  const wallMinX = Math.min(wall.start[0], wall.end[0]) - epsilon
  const wallMaxX = Math.max(wall.start[0], wall.end[0]) + epsilon
  const wallMinZ = Math.min(wall.start[1], wall.end[1]) - epsilon
  const wallMaxZ = Math.max(wall.start[1], wall.end[1]) + epsilon

  if (
    wallPoint[0] < wallMinX ||
    wallPoint[0] > wallMaxX ||
    wallPoint[1] < wallMinZ ||
    wallPoint[1] > wallMaxZ
  ) {
    return null
  }

  if (Math.abs(wall.start[1] - wall.end[1]) < 0.001) {
    if (Math.abs(metrics.minZ - wall.start[1]) <= epsilon) return [0, 1] as Point2D
    if (Math.abs(metrics.maxZ - wall.start[1]) <= epsilon) return [0, -1] as Point2D
    return null
  }

  if (Math.abs(metrics.minX - wall.start[0]) <= epsilon) return [1, 0] as Point2D
  if (Math.abs(metrics.maxX - wall.start[0]) <= epsilon) return [-1, 0] as Point2D
  return null
}

function getAccessEntryZone(
  room: AiBuildingRoomPlan,
  accessPoint: AiBuildingRoomAccessPoint,
): AiBuildingRectBounds {
  const metrics = getRoomMetrics(room)
  const length = Math.min(1.25, Math.max(0.78, metrics.minSpan * 0.34))
  const halfWidth = Math.max(0.46, accessPoint.width * 0.72)

  if (Math.abs(accessPoint.direction[0]) > 0) {
    const endX = accessPoint.position[0] + accessPoint.direction[0] * length
    return {
      minX: Math.min(accessPoint.position[0], endX),
      maxX: Math.max(accessPoint.position[0], endX),
      minZ: accessPoint.position[1] - halfWidth,
      maxZ: accessPoint.position[1] + halfWidth,
    }
  }

  const endZ = accessPoint.position[1] + accessPoint.direction[1] * length
  return {
    minX: accessPoint.position[0] - halfWidth,
    maxX: accessPoint.position[0] + halfWidth,
    minZ: Math.min(accessPoint.position[1], endZ),
    maxZ: Math.max(accessPoint.position[1], endZ),
  }
}

function getAccessCorridorZone(
  room: AiBuildingRoomPlan,
  accessPoint: AiBuildingRoomAccessPoint,
): AiBuildingRectBounds | null {
  const centerBand = getRoomCenterBand(room)
  const corridorWidth = Math.max(0.62, accessPoint.width + 0.18)

  if (Math.abs(accessPoint.direction[0]) > 0) {
    const targetX = accessPoint.direction[0] > 0 ? centerBand.minX : centerBand.maxX
    if (Math.abs(targetX - accessPoint.position[0]) < 0.18) return null
    return {
      minX: Math.min(accessPoint.position[0], targetX),
      maxX: Math.max(accessPoint.position[0], targetX),
      minZ: accessPoint.position[1] - corridorWidth / 2,
      maxZ: accessPoint.position[1] + corridorWidth / 2,
    }
  }

  const targetZ = accessPoint.direction[1] > 0 ? centerBand.minZ : centerBand.maxZ
  if (Math.abs(targetZ - accessPoint.position[1]) < 0.18) return null
  return {
    minX: accessPoint.position[0] - corridorWidth / 2,
    maxX: accessPoint.position[0] + corridorWidth / 2,
    minZ: Math.min(accessPoint.position[1], targetZ),
    maxZ: Math.max(accessPoint.position[1], targetZ),
  }
}

function getDoorSwingZone(
  accessPoint: AiBuildingRoomAccessPoint,
  side: AiBuildingDoorSwingSide = 'left',
): AiBuildingRectBounds {
  const depth = Math.max(0.78, accessPoint.width * 0.9)
  const perpendicular =
    side === 'left'
      ? ([-accessPoint.direction[1], accessPoint.direction[0]] as Point2D)
      : ([accessPoint.direction[1], -accessPoint.direction[0]] as Point2D)
  const reach = Math.max(0.4, accessPoint.width * 0.58)
  const points: Point2D[] = [
    accessPoint.position,
    [
      accessPoint.position[0] + accessPoint.direction[0] * depth,
      accessPoint.position[1] + accessPoint.direction[1] * depth,
    ],
    [
      accessPoint.position[0] + perpendicular[0] * reach,
      accessPoint.position[1] + perpendicular[1] * reach,
    ],
    [
      accessPoint.position[0] + accessPoint.direction[0] * depth + perpendicular[0] * reach,
      accessPoint.position[1] + accessPoint.direction[1] * depth + perpendicular[1] * reach,
    ],
  ]

  return getPolygonBounds(points)
}

function getDoorSwingZones(accessPoint: AiBuildingRoomAccessPoint) {
  return [
    getDoorSwingZone(accessPoint, 'left'),
    getDoorSwingZone(accessPoint, 'right'),
  ] satisfies AiBuildingRectBounds[]
}

function summarizeRectAccessConflicts(
  room: AiBuildingRoomPlan,
  rect: AiBuildingRectBounds,
  accessPoints: AiBuildingRoomAccessPoint[],
  mode: AiBuildingPlacementMode,
) {
  if (accessPoints.length === 0) {
    return {
      totalEntryOverlap: 0,
      totalCorridorOverlap: 0,
      totalDoorSwingOverlap: 0,
      blockedEntryCount: 0,
      blockedDoorSwingCount: 0,
      hardConflict: false,
    }
  }

  const entryThreshold =
    mode === 'entry-clear' ? ACCESS_ENTRY_BLOCK_THRESHOLD * 0.8 : ACCESS_ENTRY_BLOCK_THRESHOLD
  const corridorThreshold =
    mode === 'entry-clear'
      ? ACCESS_CORRIDOR_BLOCK_THRESHOLD * 0.82
      : ACCESS_CORRIDOR_BLOCK_THRESHOLD
  const doorSwingThreshold =
    mode === 'entry-clear'
      ? ACCESS_DOOR_SWING_BLOCK_THRESHOLD * 0.8
      : ACCESS_DOOR_SWING_BLOCK_THRESHOLD
  let totalEntryOverlap = 0
  let totalCorridorOverlap = 0
  let totalDoorSwingOverlap = 0
  let blockedEntryCount = 0
  let blockedDoorSwingCount = 0

  for (const accessPoint of accessPoints) {
    const entryOverlap = getRectOverlapArea(rect, getAccessEntryZone(room, accessPoint))
    const corridorZone = getAccessCorridorZone(room, accessPoint)
    const corridorOverlap = corridorZone ? getRectOverlapArea(rect, corridorZone) : 0
    const doorSwingOverlaps = getDoorSwingZones(accessPoint).map((zone) =>
      getRectOverlapArea(rect, zone),
    )

    totalEntryOverlap += entryOverlap
    totalCorridorOverlap += corridorOverlap
    totalDoorSwingOverlap += doorSwingOverlaps.reduce((sum, overlap) => sum + overlap, 0)

    if (entryOverlap > entryThreshold || corridorOverlap > corridorThreshold) {
      blockedEntryCount += 1
    }

    if (doorSwingOverlaps.every((overlap) => overlap > doorSwingThreshold)) {
      blockedDoorSwingCount += 1
    }
  }

  return {
    totalEntryOverlap,
    totalCorridorOverlap,
    totalDoorSwingOverlap,
    blockedEntryCount,
    blockedDoorSwingCount,
    hardConflict: blockedEntryCount > 0 || blockedDoorSwingCount > 0,
  }
}

function summarizeFloorPlacementAccessConflicts(
  room: AiBuildingRoomPlan,
  footprint: ReturnType<typeof getItemFootprint>,
  accessPoints: AiBuildingRoomAccessPoint[],
  mode: AiBuildingPlacementMode,
) {
  return summarizeRectAccessConflicts(
    room,
    {
      minX: footprint.minX,
      maxX: footprint.maxX,
      minZ: footprint.minZ,
      maxZ: footprint.maxZ,
    },
    accessPoints,
    mode,
  )
}

function summarizeBlockedRectConflicts(
  footprint: ReturnType<typeof getItemFootprint>,
  blockedRects: AiBuildingRectBounds[],
) {
  let totalBlockedOverlap = 0
  let blockedZoneCount = 0

  for (const rect of blockedRects) {
    const overlap = getFootprintRectOverlapArea(footprint, rect)
    totalBlockedOverlap += overlap
    if (overlap > 0.001) {
      blockedZoneCount += 1
    }
  }

  return {
    totalBlockedOverlap,
    blockedZoneCount,
    hardConflict: blockedZoneCount > 0,
  }
}

function getRoomAccessPoints(
  room: AiBuildingRoomPlan,
  walls: AiBuildingWallPlan[],
  openings: AiBuildingOpeningPlan[],
) {
  const wallByKey = new Map(walls.map((wall) => [wall.key, wall]))
  const accessPoints = openings
    .filter((opening) => opening.kind === 'door')
    .map((opening) => {
      const wall = wallByKey.get(opening.wallKey)
      if (!wall) return null
      const position = getWallPointAtLocalX(wall, opening.localX)
      const direction = getRoomAccessDirectionForWall(room, wall, position)
      if (!direction) return null
      return {
        key: `${opening.wallKey}:${opening.localX.toFixed(2)}`,
        kind: opening.facade === 'interior' ? 'interior' : 'entry',
        wallKey: opening.wallKey,
        position,
        direction,
        width: opening.width,
      } satisfies AiBuildingRoomAccessPoint
    })
    .filter((point): point is AiBuildingRoomAccessPoint => Boolean(point))

  const seen = new Set<string>()
  return accessPoints.filter((point) => {
    const dedupeKey = `${point.position[0].toFixed(2)}:${point.position[1].toFixed(2)}:${point.direction[0]}:${point.direction[1]}`
    if (seen.has(dedupeKey)) return false
    seen.add(dedupeKey)
    return true
  })
}

function getFootprintSpan(footprint: ReturnType<typeof getItemFootprint>) {
  return {
    width: footprint.maxX - footprint.minX,
    depth: footprint.maxZ - footprint.minZ,
  }
}

function createUseZoneFromFootprint(
  footprint: ReturnType<typeof getItemFootprint>,
  rotationY: number,
  spec: AiBuildingUseZoneSpec,
): AiBuildingRectBounds {
  const center = getFootprintCenter(footprint)
  const footprintSpan = getFootprintSpan(footprint)
  const direction = getLocalSideVector(rotationY, spec.side)
  const span = spec.span ?? (Math.abs(direction[0]) > 0 ? footprintSpan.depth : footprintSpan.width)

  if (Math.abs(direction[0]) > 0) {
    const edgeX = direction[0] > 0 ? footprint.maxX : footprint.minX
    const endX = edgeX + direction[0] * spec.depth
    return {
      minX: Math.min(edgeX, endX),
      maxX: Math.max(edgeX, endX),
      minZ: center[1] - span / 2,
      maxZ: center[1] + span / 2,
    }
  }

  const edgeZ = direction[1] > 0 ? footprint.maxZ : footprint.minZ
  const endZ = edgeZ + direction[1] * spec.depth
  return {
    minX: center[0] - span / 2,
    maxX: center[0] + span / 2,
    minZ: Math.min(edgeZ, endZ),
    maxZ: Math.max(edgeZ, endZ),
  }
}

function getSideBoundaryClearance(
  room: AiBuildingRoomPlan,
  footprint: ReturnType<typeof getItemFootprint>,
  rotationY: number,
  side: AiBuildingCompanionSide,
) {
  const metrics = getRoomMetrics(room)
  const direction = getLocalSideVector(rotationY, side)
  if (Math.abs(direction[0]) > Math.abs(direction[1])) {
    return direction[0] > 0 ? metrics.maxX - footprint.maxX : footprint.minX - metrics.minX
  }

  return direction[1] > 0 ? metrics.maxZ - footprint.maxZ : footprint.minZ - metrics.minZ
}

function getItemUseZones(
  item: AiBuildingItemPlan,
  room?: AiBuildingRoomPlan,
  options: { includeElevated?: boolean } = {},
) {
  const specs = ITEM_USE_ZONE_SPECS[item.assetId]
  if (!specs || specs.length === 0) return []

  const footprint = getItemFootprint(item)
  if (footprint.surface !== 'floor' && !options.includeElevated) return []
  const rotationY = item.rotation?.[1] ?? 0
  return specs
    .filter((spec) => {
      if (!room || item.assetId !== 'double-bed') return true
      if (spec.side !== 'left' && spec.side !== 'right') return true
      return getSideBoundaryClearance(room, footprint, rotationY, spec.side) >= 0.18
    })
    .map((spec) => createUseZoneFromFootprint(footprint, rotationY, spec))
}

function areItemsPlacementCompanions(left: AiBuildingAssetId, right: AiBuildingAssetId) {
  const leftProfile = getPlacementProfile(left)
  const rightProfile = getPlacementProfile(right)
  return (
    leftProfile.pairWith?.includes(right) === true || rightProfile.pairWith?.includes(left) === true
  )
}

function dedupePlacementAnchors(anchors: AiBuildingPlacementAnchor[]) {
  const seen = new Set<string>()
  return anchors.filter((anchor) => {
    const key = `${anchor.anchorX}:${anchor.anchorZ}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getPlacementAnchorsForRole(role: AiBuildingPlacementRole): AiBuildingPlacementAnchor[] {
  const wallAnchors: AiBuildingPlacementAnchor[] = [
    { anchorX: 'center', anchorZ: 'start' },
    { anchorX: 'center', anchorZ: 'end' },
    { anchorX: 'start', anchorZ: 'center' },
    { anchorX: 'end', anchorZ: 'center' },
    { anchorX: 0.28, anchorZ: 'start' },
    { anchorX: 0.72, anchorZ: 'start' },
    { anchorX: 0.28, anchorZ: 'end' },
    { anchorX: 0.72, anchorZ: 'end' },
  ]
  const cornerAnchors: AiBuildingPlacementAnchor[] = [
    { anchorX: 'start', anchorZ: 'start' },
    { anchorX: 'start', anchorZ: 'end' },
    { anchorX: 'end', anchorZ: 'start' },
    { anchorX: 'end', anchorZ: 'end' },
    { anchorX: 0.2, anchorZ: 0.2 },
    { anchorX: 0.2, anchorZ: 0.8 },
    { anchorX: 0.8, anchorZ: 0.2 },
    { anchorX: 0.8, anchorZ: 0.8 },
  ]
  const centerAnchors: AiBuildingPlacementAnchor[] = [
    { anchorX: 'center', anchorZ: 'center' },
    { anchorX: 0.38, anchorZ: 'center' },
    { anchorX: 0.62, anchorZ: 'center' },
    { anchorX: 'center', anchorZ: 0.38 },
    { anchorX: 'center', anchorZ: 0.62 },
  ]

  if (role === 'wall') return dedupePlacementAnchors(wallAnchors)
  if (role === 'corner') return dedupePlacementAnchors([...cornerAnchors, ...wallAnchors])
  if (role === 'center') return dedupePlacementAnchors(centerAnchors)
  return dedupePlacementAnchors([...centerAnchors, ...wallAnchors, ...cornerAnchors])
}

function getRotationCandidatesForAnchor(anchor: AiBuildingPlacementAnchor, wideRoom: boolean) {
  const onXWall = anchor.anchorX === 'start' || anchor.anchorX === 'end'
  const onZWall = anchor.anchorZ === 'start' || anchor.anchorZ === 'end'

  if (onZWall && !onXWall) return [0, Math.PI]
  if (onXWall && !onZWall) return [Math.PI / 2, -Math.PI / 2]
  if (!onXWall && !onZWall) {
    return wideRoom
      ? [0, Math.PI / 2, Math.PI, -Math.PI / 2]
      : [Math.PI / 2, 0, -Math.PI / 2, Math.PI]
  }
  return [0, Math.PI / 2, Math.PI, -Math.PI / 2]
}

function getWallAlignedRotationsForAnchor(anchor: AiBuildingPlacementAnchor, wideRoom: boolean) {
  const onSouthWall = anchor.anchorZ === 'start'
  const onNorthWall = anchor.anchorZ === 'end'
  const onWestWall = anchor.anchorX === 'start'
  const onEastWall = anchor.anchorX === 'end'

  if (onSouthWall && !onWestWall && !onEastWall) return [0]
  if (onNorthWall && !onWestWall && !onEastWall) return [Math.PI]
  if (onWestWall && !onSouthWall && !onNorthWall) return [-Math.PI / 2]
  if (onEastWall && !onSouthWall && !onNorthWall) return [Math.PI / 2]

  if (onSouthWall && onWestWall) return [0, -Math.PI / 2]
  if (onSouthWall && onEastWall) return [0, Math.PI / 2]
  if (onNorthWall && onWestWall) return [Math.PI, -Math.PI / 2]
  if (onNorthWall && onEastWall) return [Math.PI, Math.PI / 2]

  return getRotationCandidatesForAnchor(anchor, wideRoom)
}

function placePositionedItem(
  room: AiBuildingRoomPlan,
  key: string,
  assetId: AiBuildingAssetId,
  position: Point3D,
  options: {
    rotationY?: number
    scale?: Point3D
    y?: number
    marginX?: number
    marginZ?: number
    fitWidthRatio?: number
    fitDepthRatio?: number
  } = {},
): AiBuildingPlacedItemPlan {
  const rotationY = options.rotationY ?? 0
  const fittedScale = fitScaleToRoom(
    room,
    assetId,
    rotationY,
    options.scale,
    options.fitWidthRatio,
    options.fitDepthRatio,
  )
  const clampedPosition = clampItemPositionToRoom(
    room,
    assetId,
    [position[0], options.y ?? position[1] ?? 0, position[2]],
    rotationY,
    fittedScale,
    options.marginX,
    options.marginZ,
  )

  return {
    plan: itemPlan(key, assetId, clampedPosition, {
      rotation: [0, rotationY, 0],
      scale: fittedScale,
    }),
    scale: fittedScale,
    rotationY,
  }
}

function scorePlacementCandidate(
  room: AiBuildingRoomPlan,
  candidate: AiBuildingPlacedItemPlan,
  placedItems: AiBuildingItemPlan[],
  accessPoints: AiBuildingRoomAccessPoint[],
  blockedRects: AiBuildingRectBounds[],
  mode: AiBuildingPlacementMode,
  sceneContext?: SceneContext | null,
  overrides: Partial<AiBuildingItemPlacementProfile> = {},
) {
  const footprint = getItemFootprint(candidate.plan)
  const useZones = getItemUseZones(candidate.plan)
  const profile = getPlacementProfile(candidate.plan.assetId, overrides)
  const clearanceTarget = Math.max(
    getTargetCirculationClearance(sceneContext),
    profile.minGap * 0.75,
  )
  const boundary = getFootprintBoundaryClearances(room, footprint)
  const roomMetrics = getRoomMetrics(room)
  const roomCenter = getRoomCenter(room)
  const centerBand = getRoomCenterBand(room)
  const accessConflictSummary =
    footprint.surface === 'floor'
      ? summarizeFloorPlacementAccessConflicts(room, footprint, accessPoints, mode)
      : null
  const blockedRectSummary =
    footprint.surface === 'floor' ? summarizeBlockedRectConflicts(footprint, blockedRects) : null
  let score = 100

  if (footprint.surface === 'floor') {
    if (boundary.nearest < -0.02) score -= 180
    else if (boundary.nearest < clearanceTarget * 0.28) score -= 22
    else if (boundary.nearest < clearanceTarget * 0.5) score -= 10
  }

  if (profile.role === 'wall') {
    score += clampNumber((0.62 - boundary.nearest) / 0.62, 0, 1) * 18
  } else if (profile.role === 'corner') {
    score += clampNumber((1.15 - boundary.cornerReach) / 1.15, 0, 1) * 22
  } else if (profile.role === 'center') {
    const centerDistance = getPointDistance(getFootprintCenter(footprint), roomCenter)
    score += clampNumber(1 - centerDistance / Math.max(roomMetrics.minSpan * 0.34, 0.8), 0, 1) * 24
    score += clampNumber((boundary.nearest - clearanceTarget * 0.4) / 0.45, 0, 1) * 6
  } else {
    const centerDistance = getPointDistance(getFootprintCenter(footprint), roomCenter)
    score += clampNumber(1 - centerDistance / Math.max(roomMetrics.maxSpan * 0.45, 1), 0, 1) * 8
  }

  if (typeof profile.maxBackClearance === 'number' && footprint.surface === 'floor') {
    const backClearance = getSideBoundaryClearance(room, footprint, candidate.rotationY, 'back')
    if (backClearance > profile.maxBackClearance) {
      score -= (backClearance - profile.maxBackClearance) * 220
    } else {
      score +=
        clampNumber(
          (profile.maxBackClearance - backClearance) / Math.max(profile.maxBackClearance, 0.01),
          0,
          1,
        ) * 18
    }
  }

  if (profile.reserveCenter && footprint.surface === 'floor') {
    score -= getFootprintRectOverlapArea(footprint, centerBand) * 24
  }

  if (accessConflictSummary) {
    const entryWeight = mode === 'entry-clear' ? 130 : 96
    const corridorWeight = mode === 'entry-clear' ? 54 : 34
    const doorWeight = mode === 'entry-clear' ? 84 : 56
    score -= accessConflictSummary.totalEntryOverlap * entryWeight
    score -= accessConflictSummary.totalCorridorOverlap * corridorWeight
    score -= accessConflictSummary.totalDoorSwingOverlap * doorWeight * 0.62
    score -= accessConflictSummary.blockedEntryCount * (mode === 'entry-clear' ? 170 : 132)
    score -= accessConflictSummary.blockedDoorSwingCount * (mode === 'entry-clear' ? 156 : 124)

    if (
      accessConflictSummary.blockedEntryCount === 0 &&
      accessConflictSummary.blockedDoorSwingCount === 0 &&
      accessConflictSummary.totalEntryOverlap < 0.005 &&
      accessConflictSummary.totalCorridorOverlap < 0.02 &&
      accessConflictSummary.totalDoorSwingOverlap < 0.01
    ) {
      score += mode === 'entry-clear' ? 4 : 2
    }
  }

  if (blockedRectSummary) {
    score -= blockedRectSummary.totalBlockedOverlap * 420
    score -= blockedRectSummary.blockedZoneCount * 220
  }

  if (mode === 'perimeter' && footprint.surface === 'floor') {
    score += clampNumber((0.72 - boundary.nearest) / 0.72, 0, 1) * 8
    score -= getFootprintRectOverlapArea(footprint, centerBand) * 14
  } else if (mode === 'entry-clear' && footprint.surface === 'floor') {
    score -= getFootprintRectOverlapArea(footprint, centerBand) * 12
    score += clampNumber((boundary.nearest - clearanceTarget * 0.45) / 0.35, 0, 1) * 6
  }

  const pairTargets =
    profile.pairWith && profile.pairWith.length > 0
      ? placedItems.filter((item) => profile.pairWith?.includes(item.assetId))
      : []

  for (const placedItem of placedItems) {
    const placedFootprint = getItemFootprint(placedItem)
    const placedUseZones = getItemUseZones(placedItem)
    const pairedNeighbor = areItemsPlacementCompanions(candidate.plan.assetId, placedItem.assetId)

    if (
      footprint.surface === 'floor' &&
      placedFootprint.surface === 'floor' &&
      verticalRangesOverlap(footprint, placedFootprint)
    ) {
      const overlap = getFootprintOverlapArea(footprint, placedFootprint)
      if (overlap > 0.001) score -= 220 + overlap * 320
    }

    const gap = getFootprintGap(footprint, placedFootprint)
    const otherProfile = getPlacementProfile(placedItem.assetId)
    const desiredGap = pairedNeighbor
      ? Math.max(Math.min(profile.minGap, otherProfile.minGap), 0.08)
      : Math.max(profile.minGap, otherProfile.minGap, clearanceTarget * 0.7)
    if (gap < desiredGap) score -= (desiredGap - gap) * 64

    if (!pairedNeighbor && footprint.surface === 'floor' && placedFootprint.surface === 'floor') {
      const blockedPlacedUse = placedUseZones.reduce(
        (sum, zone) => sum + getFootprintRectOverlapArea(footprint, zone),
        0,
      )
      const blockedCandidateUse = useZones.reduce(
        (sum, zone) => sum + getFootprintRectOverlapArea(placedFootprint, zone),
        0,
      )
      score -= blockedPlacedUse * 82
      score -= blockedCandidateUse * 82
    }
  }

  if (pairTargets.length > 0) {
    const [minDistance, maxDistance] = profile.pairDistance ?? [0.3, 2.2]
    const pairDistances = pairTargets.map((item) =>
      getPointDistance(
        [candidate.plan.position[0], candidate.plan.position[2]],
        [item.position[0], item.position[2]],
      ),
    )
    const closestDistance = Math.min(...pairDistances)
    if (closestDistance >= minDistance && closestDistance <= maxDistance) {
      score += 18
    } else {
      const distancePenalty =
        closestDistance < minDistance
          ? minDistance - closestDistance
          : closestDistance - maxDistance
      score -= distancePenalty * 28
    }

    if (profile.pairAlignment) {
      const candidateYaw = candidate.plan.rotation?.[1] ?? 0
      const bestAlignment = pairTargets.reduce((best, item) => {
        const yaw = item.rotation?.[1] ?? 0
        const difference = getNormalizedAngleDifference(candidateYaw, yaw)
        return Math.min(best, difference)
      }, Number.POSITIVE_INFINITY)

      if (profile.pairAlignment === 'parallel') {
        const aligned = Math.min(bestAlignment, Math.abs(Math.PI - bestAlignment))
        score += clampNumber(1 - aligned / 0.45, 0, 1) * 10
      } else {
        score += clampNumber(1 - Math.abs(Math.PI - bestAlignment) / 0.45, 0, 1) * 10
      }
    }
  }

  return score
}

function placeSolvedItem(
  room: AiBuildingRoomPlan,
  key: string,
  assetId: AiBuildingAssetId,
  placedItems: AiBuildingItemPlan[],
  accessPoints: AiBuildingRoomAccessPoint[],
  blockedRects: AiBuildingRectBounds[],
  mode: AiBuildingPlacementMode,
  sceneContext: SceneContext | null | undefined,
  options: {
    anchors?: AiBuildingPlacementAnchor[]
    rotations?: number[]
    rotationResolver?: (anchor: AiBuildingPlacementAnchor, wideRoom: boolean) => number[]
    scale?: Point3D
    y?: number
    marginX?: number
    marginZ?: number
    fitWidthRatio?: number
    fitDepthRatio?: number
    profile?: Partial<AiBuildingItemPlacementProfile>
  } = {},
) {
  const profile = getPlacementProfile(assetId, options.profile)
  const metrics = getRoomMetrics(room)
  const wideRoom = metrics.width >= metrics.depth
  const anchors = options.anchors ?? getPlacementAnchorsForRole(profile.role)
  let best: { placed: AiBuildingPlacedItemPlan; score: number } | null = null

  for (const anchor of anchors) {
    const rotations =
      options.rotations ??
      options.rotationResolver?.(anchor, wideRoom) ??
      getRotationCandidatesForAnchor(anchor, wideRoom)
    for (const rotationY of rotations) {
      const candidate = placeAnchoredItem(room, key, assetId, {
        anchorX: anchor.anchorX,
        anchorZ: anchor.anchorZ,
        rotationY,
        scale: options.scale,
        y: options.y,
        marginX: options.marginX,
        marginZ: options.marginZ,
        fitWidthRatio: options.fitWidthRatio,
        fitDepthRatio: options.fitDepthRatio,
      })
      const accessConflictSummary = summarizeFloorPlacementAccessConflicts(
        room,
        getItemFootprint(candidate.plan),
        accessPoints,
        mode,
      )
      const blockedRectSummary = summarizeBlockedRectConflicts(
        getItemFootprint(candidate.plan),
        blockedRects,
      )
      if (accessConflictSummary.hardConflict || blockedRectSummary.hardConflict) continue
      const score = scorePlacementCandidate(
        room,
        candidate,
        placedItems,
        accessPoints,
        blockedRects,
        mode,
        sceneContext,
        profile,
      )
      if (!best || score > best.score) {
        best = {
          placed: candidate,
          score,
        }
      }
    }
  }

  return best?.placed ?? null
}

function getLocalSideVector(rotationY: number, side: AiBuildingCompanionSide): Point2D {
  const base =
    side === 'left'
      ? ([-1, 0] as Point2D)
      : side === 'right'
        ? ([1, 0] as Point2D)
        : side === 'front'
          ? ([0, 1] as Point2D)
          : ([0, -1] as Point2D)
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  const rotated: Point2D = [base[0] * cos - base[1] * sin, base[0] * sin + base[1] * cos]
  return [
    Math.abs(rotated[0]) < 1e-6 ? 0 : rotated[0],
    Math.abs(rotated[1]) < 1e-6 ? 0 : rotated[1],
  ]
}

function placeCompanionItemNearTarget(
  room: AiBuildingRoomPlan,
  key: string,
  assetId: AiBuildingAssetId,
  target: AiBuildingItemPlan,
  placedItems: AiBuildingItemPlan[],
  accessPoints: AiBuildingRoomAccessPoint[],
  blockedRects: AiBuildingRectBounds[],
  mode: AiBuildingPlacementMode,
  sceneContext: SceneContext | null | undefined,
  options: {
    sides?: AiBuildingCompanionSide[]
    gap?: number
    faceTarget?: boolean
    scale?: Point3D
    marginX?: number
    marginZ?: number
    fitWidthRatio?: number
    fitDepthRatio?: number
    profile?: Partial<AiBuildingItemPlacementProfile>
  } = {},
) {
  const targetFootprint = getItemFootprint(target)
  const targetCenter = getFootprintCenter(targetFootprint)
  const targetRotation = target.rotation?.[1] ?? 0
  const sides = options.sides ?? ['left', 'right', 'front', 'back']
  const profile = getPlacementProfile(assetId, options.profile)
  let best: { placed: AiBuildingPlacedItemPlan; score: number } | null = null

  for (const side of sides) {
    const direction = getLocalSideVector(targetRotation, side)
    const facingDirection = options.faceTarget
      ? ([-direction[0], -direction[1]] as Point2D)
      : direction
    const rotationY =
      Math.abs(facingDirection[0]) > Math.abs(facingDirection[1])
        ? facingDirection[0] >= 0
          ? Math.PI / 2
          : -Math.PI / 2
        : facingDirection[1] >= 0
          ? 0
          : Math.PI
    const candidate = placePositionedItem(
      room,
      key,
      assetId,
      [
        targetCenter[0] +
          direction[0] *
            ((Math.abs(direction[0]) > 0
              ? (targetFootprint.maxX - targetFootprint.minX) / 2
              : (targetFootprint.maxZ - targetFootprint.minZ) / 2) +
              getRotatedFootprintSpan(assetId, options.scale, rotationY)[
                Math.abs(direction[0]) > 0 ? 'width' : 'depth'
              ] /
                2 +
              (options.gap ?? 0.22)),
        0,
        targetCenter[1] +
          direction[1] *
            ((Math.abs(direction[0]) > 0
              ? (targetFootprint.maxX - targetFootprint.minX) / 2
              : (targetFootprint.maxZ - targetFootprint.minZ) / 2) +
              getRotatedFootprintSpan(assetId, options.scale, rotationY)[
                Math.abs(direction[0]) > 0 ? 'width' : 'depth'
              ] /
                2 +
              (options.gap ?? 0.22)),
      ],
      {
        rotationY,
        scale: options.scale,
        marginX: options.marginX,
        marginZ: options.marginZ,
        fitWidthRatio: options.fitWidthRatio,
        fitDepthRatio: options.fitDepthRatio,
      },
    )
    const accessConflictSummary = summarizeFloorPlacementAccessConflicts(
      room,
      getItemFootprint(candidate.plan),
      accessPoints,
      mode,
    )
    const blockedRectSummary = summarizeBlockedRectConflicts(
      getItemFootprint(candidate.plan),
      blockedRects,
    )
    if (accessConflictSummary.hardConflict || blockedRectSummary.hardConflict) continue
    const score = scorePlacementCandidate(
      room,
      candidate,
      placedItems,
      accessPoints,
      blockedRects,
      mode,
      sceneContext,
      {
        ...profile,
        pairWith: [target.assetId],
      },
    )
    if (!best || score > best.score) {
      best = {
        placed: candidate,
        score,
      }
    }
  }

  return best?.placed ?? null
}

function scoreLivingPairCandidate(
  room: AiBuildingRoomPlan,
  sofa: AiBuildingPlacedItemPlan,
  tvStand: AiBuildingPlacedItemPlan,
  accessPoints: AiBuildingRoomAccessPoint[],
  blockedRects: AiBuildingRectBounds[],
  mode: AiBuildingPlacementMode,
  sceneContext?: SceneContext | null,
) {
  const sofaScore = scorePlacementCandidate(
    room,
    sofa,
    [],
    accessPoints,
    blockedRects,
    mode,
    sceneContext,
  )
  const tvScore = scorePlacementCandidate(
    room,
    tvStand,
    [sofa.plan],
    accessPoints,
    blockedRects,
    mode,
    sceneContext,
  )
  const sofaPoint: Point2D = [sofa.plan.position[0], sofa.plan.position[2]]
  const tvPoint: Point2D = [tvStand.plan.position[0], tvStand.plan.position[2]]
  const toTv = normalizePoint2D([tvPoint[0] - sofaPoint[0], tvPoint[1] - sofaPoint[1]])
  const toSofa = normalizePoint2D([sofaPoint[0] - tvPoint[0], sofaPoint[1] - tvPoint[1]])
  const sofaForward = normalizePoint2D(getLocalSideVector(sofa.rotationY, 'front'))
  const tvForward = normalizePoint2D(getLocalSideVector(tvStand.rotationY, 'front'))
  const sofaFacing = sofaForward[0] * toTv[0] + sofaForward[1] * toTv[1]
  const tvFacing = tvForward[0] * toSofa[0] + tvForward[1] * toSofa[1]
  const viewDistance = getPointDistance(sofaPoint, tvPoint)
  const sightBand = createCorridorRectBetweenPoints(sofaPoint, tvPoint, 0.92)

  let score = sofaScore + tvScore

  if (viewDistance > 4.4) score -= (viewDistance - 4.4) * 52
  else if (viewDistance > 3.9) score -= (viewDistance - 3.9) * 28
  else if (viewDistance < 1.9) score -= (1.9 - viewDistance) * 96
  else if (viewDistance < 2.2) score -= (2.2 - viewDistance) * 28

  if (sofaFacing < 0.92) score -= (0.92 - sofaFacing) * 140
  else score += clampNumber((sofaFacing - 0.92) / 0.08, 0, 1) * 18

  if (tvFacing < 0.92) score -= (0.92 - tvFacing) * 120
  else score += clampNumber((tvFacing - 0.92) / 0.08, 0, 1) * 14

  for (const accessPoint of accessPoints) {
    const entryZone = getAccessEntryZone(room, accessPoint)
    const corridorZone = getAccessCorridorZone(room, accessPoint)
    score -= getRectOverlapArea(sightBand, entryZone) * 48
    if (corridorZone) score -= getRectOverlapArea(sightBand, corridorZone) * 28
  }

  return score
}

function createLivingRoomPair(
  room: AiBuildingRoomPlan,
  prefix: string,
  accessPoints: AiBuildingRoomAccessPoint[],
  blockedRects: AiBuildingRectBounds[],
  mode: AiBuildingPlacementMode,
  sceneContext?: SceneContext | null,
  tightRoom = false,
) {
  const sofaScale = tightRoom ? ([0.66, 0.78, 0.66] as Point3D) : ([0.78, 0.85, 0.78] as Point3D)
  const tvScale = [0.76, 0.82, 0.76] as Point3D
  const pairAnchors = [
    {
      sofa: {
        anchorX: 'center' as AiBuildingAxisAnchor,
        anchorZ: 'start' as AiBuildingAxisAnchor,
        rotationY: 0,
      },
      tvStand: {
        anchorX: 'center' as AiBuildingAxisAnchor,
        anchorZ: 'end' as AiBuildingAxisAnchor,
        rotationY: Math.PI,
      },
    },
    {
      sofa: {
        anchorX: 'center' as AiBuildingAxisAnchor,
        anchorZ: 'end' as AiBuildingAxisAnchor,
        rotationY: Math.PI,
      },
      tvStand: {
        anchorX: 'center' as AiBuildingAxisAnchor,
        anchorZ: 'start' as AiBuildingAxisAnchor,
        rotationY: 0,
      },
    },
    {
      sofa: {
        anchorX: 'start' as AiBuildingAxisAnchor,
        anchorZ: 'center' as AiBuildingAxisAnchor,
        rotationY: -Math.PI / 2,
      },
      tvStand: {
        anchorX: 'end' as AiBuildingAxisAnchor,
        anchorZ: 'center' as AiBuildingAxisAnchor,
        rotationY: Math.PI / 2,
      },
    },
    {
      sofa: {
        anchorX: 'end' as AiBuildingAxisAnchor,
        anchorZ: 'center' as AiBuildingAxisAnchor,
        rotationY: Math.PI / 2,
      },
      tvStand: {
        anchorX: 'start' as AiBuildingAxisAnchor,
        anchorZ: 'center' as AiBuildingAxisAnchor,
        rotationY: -Math.PI / 2,
      },
    },
    {
      sofa: {
        anchorX: 0.32 as AiBuildingAxisAnchor,
        anchorZ: 'start' as AiBuildingAxisAnchor,
        rotationY: 0,
      },
      tvStand: {
        anchorX: 0.68 as AiBuildingAxisAnchor,
        anchorZ: 'end' as AiBuildingAxisAnchor,
        rotationY: Math.PI,
      },
    },
    {
      sofa: {
        anchorX: 0.68 as AiBuildingAxisAnchor,
        anchorZ: 'start' as AiBuildingAxisAnchor,
        rotationY: 0,
      },
      tvStand: {
        anchorX: 0.32 as AiBuildingAxisAnchor,
        anchorZ: 'end' as AiBuildingAxisAnchor,
        rotationY: Math.PI,
      },
    },
  ]

  let best: {
    sofa: AiBuildingPlacedItemPlan
    tvStand: AiBuildingPlacedItemPlan
    score: number
  } | null = null

  for (const pair of pairAnchors) {
    const sofa = placeAnchoredItem(room, `${prefix}_sofa`, 'sofa', {
      ...pair.sofa,
      scale: sofaScale,
      fitWidthRatio: 0.68,
      fitDepthRatio: 0.68,
      marginX: 0.16,
      marginZ: 0.18,
    })
    const tvStand = placeAnchoredItem(room, `${prefix}_tv_stand`, 'tv-stand', {
      ...pair.tvStand,
      scale: tvScale,
      fitWidthRatio: 0.48,
      fitDepthRatio: 0.48,
      marginX: 0.16,
      marginZ: 0.16,
    })
    if (
      summarizeFloorPlacementAccessConflicts(room, getItemFootprint(sofa.plan), accessPoints, mode)
        .hardConflict ||
      summarizeBlockedRectConflicts(getItemFootprint(sofa.plan), blockedRects).hardConflict ||
      summarizeFloorPlacementAccessConflicts(
        room,
        getItemFootprint(tvStand.plan),
        accessPoints,
        mode,
      ).hardConflict ||
      summarizeBlockedRectConflicts(getItemFootprint(tvStand.plan), blockedRects).hardConflict
    ) {
      continue
    }
    const score = scoreLivingPairCandidate(
      room,
      sofa,
      tvStand,
      accessPoints,
      blockedRects,
      mode,
      sceneContext,
    )

    if (!best || score > best.score) {
      best = { sofa, tvStand, score }
    }
  }

  return best
}

function hasRoomMeaning(room: AiBuildingRoomPlan, pattern: RegExp) {
  return pattern.test(room.name.toLowerCase())
}

type AiBuildingFurnishingDensity = 'default' | 'compact'

function createRoomItemPlans(
  form: AiBuildingFormState,
  intent: AiBuildingFeatureIntent,
  floorIndex: number,
  room: AiBuildingRoomPlan,
  layoutHint?: AiBuildingGridLayoutHint | null,
  sceneContext?: SceneContext | null,
  accessPoints: AiBuildingRoomAccessPoint[] = [],
  blockedRects: AiBuildingRectBounds[] = [],
  placementMode: AiBuildingPlacementMode = 'balanced',
  density: AiBuildingFurnishingDensity = 'default',
): AiBuildingItemPlan[] {
  if (!intent.furnish) return []

  const items: AiBuildingItemPlan[] = []
  const commitItem = (placed: AiBuildingPlacedItemPlan | null | undefined) => {
    if (!placed) return null
    items.push(placed.plan)
    return placed.plan
  }
  const commitElevatedItem = (
    key: string,
    assetId: AiBuildingAssetId,
    target: AiBuildingItemPlan,
    options: {
      scale?: Point3D
      y: number
      localOffset?: Point2D
      fitWidthRatio?: number
      fitDepthRatio?: number
      marginX?: number
      marginZ?: number
    },
  ) =>
    commitItem(
      (() => {
        const rotationY = target.rotation?.[1] ?? 0
        const offset: Point2D = options.localOffset
          ? rotateLocalPoint(options.localOffset, rotationY)
          : [0, 0]
        return placePositionedItem(
          room,
          key,
          assetId,
          [target.position[0] + offset[0], target.position[1], target.position[2] + offset[1]],
          {
            rotationY,
            scale: options.scale,
            y: options.y,
            fitWidthRatio: options.fitWidthRatio,
            fitDepthRatio: options.fitDepthRatio,
            marginX: options.marginX,
            marginZ: options.marginZ,
          },
        )
      })(),
    )
  const solveRoomItem = (
    key: string,
    assetId: AiBuildingAssetId,
    options: Parameters<typeof placeSolvedItem>[8] = {},
  ) =>
    placeSolvedItem(
      room,
      key,
      assetId,
      items,
      accessPoints,
      blockedRects,
      placementMode,
      sceneContext,
      options,
    )
  const placeRoomCompanionItem = (
    key: string,
    assetId: AiBuildingAssetId,
    target: AiBuildingItemPlan,
    options: Parameters<typeof placeCompanionItemNearTarget>[9] = {},
  ) =>
    placeCompanionItemNearTarget(
      room,
      key,
      assetId,
      target,
      items,
      accessPoints,
      blockedRects,
      placementMode,
      sceneContext,
      options,
    )
  const prefix = `${floorIndex}_${room.key}`
  const prompt = form.prompt.toLowerCase()
  const roomName = room.name.toLowerCase()
  const programKey = room.programKey ?? ''
  const metrics = getRoomMetrics(room)
  const compact = density === 'compact'
  const tightRoom = compact || metrics.area < 11 || metrics.minSpan < 2.8
  const isBedroom =
    programKey === 'bedroom' ||
    programKey === 'primary_bedroom' ||
    hasRoomMeaning(room, /卧|套房|客房|bedroom|suite|guest/)
  const isLiving =
    programKey === 'living_room' ||
    hasRoomMeaning(room, /客厅|起居|家庭厅|会客|living|lounge|great/)
  const isKitchen =
    programKey === 'kitchen' ||
    programKey === 'dining_room' ||
    programKey === 'pantry' ||
    hasRoomMeaning(room, /餐|厨|dining|kitchen|pantry|cafe/)
  const isBath =
    programKey === 'bathroom' || hasRoomMeaning(room, /卫|浴|卫生间|bath|restroom|toilet|powder/)
  const isTerrace =
    programKey === 'balcony' ||
    programKey === 'courtyard' ||
    hasRoomMeaning(room, /露台|阳台|庭院|terrace|balcony|courtyard|garden/)
  const isGarage = programKey === 'garage' || hasRoomMeaning(room, /车库|garage/)
  const isStair =
    programKey === 'stairs' || programKey === 'elevator' || hasRoomMeaning(room, /楼梯|stair/)
  const isDiningFocused = /餐|dining|cafe/.test(roomName)
  const isPantryFocused = /pantry|备餐|吧台|储藏/.test(roomName)
  const isKitchenFocused =
    /厨|kitchen|中厨|西厨|island/.test(roomName) || (programKey === 'kitchen' && !isDiningFocused)
  const isPrimary = programKey === 'primary_bedroom' || /主卧|主套|primary|suite|spa/.test(roomName)

  if (isStair) return items

  if (isBedroom && intent.bedroom) {
    const bed = commitItem(
      solveRoomItem(`${prefix}_bed`, 'double-bed', {
        scale: tightRoom ? [0.76, 0.8, 0.76] : [0.86, 0.86, 0.86],
        fitWidthRatio: 0.7,
        fitDepthRatio: 0.7,
        marginX: 0.18,
        marginZ: 0.26,
      }),
    )

    if (metrics.area >= 10.5 && metrics.minSpan >= 2.75) {
      commitItem(
        solveRoomItem(`${prefix}_closet`, 'closet', {
          scale: tightRoom ? [0.54, 0.78, 0.54] : [0.66, 0.84, 0.66],
          fitWidthRatio: 0.46,
          fitDepthRatio: 0.46,
          marginX: 0.16,
          marginZ: 0.16,
        }),
      )
    }

    if (bed && !tightRoom && metrics.area >= 13.5) {
      commitItem(
        placeRoomCompanionItem(`${prefix}_bedside`, 'bedside-table', bed, {
          sides: ['left', 'right'],
          gap: 0.08,
          fitWidthRatio: 0.24,
          fitDepthRatio: 0.24,
          marginX: 0.16,
          marginZ: 0.16,
        }),
      )
    }
  }

  if (isLiving && intent.living) {
    const livingPair = createLivingRoomPair(
      room,
      prefix,
      accessPoints,
      blockedRects,
      placementMode,
      sceneContext,
      tightRoom,
    )
    const sofa = livingPair
      ? commitItem(livingPair.sofa)
      : commitItem(
          solveRoomItem(`${prefix}_sofa`, 'sofa', {
            scale: tightRoom ? [0.66, 0.78, 0.66] : [0.78, 0.85, 0.78],
            fitWidthRatio: 0.68,
            fitDepthRatio: 0.68,
            marginX: 0.16,
            marginZ: 0.18,
          }),
        )
    const tvStand = livingPair
      ? commitItem(livingPair.tvStand)
      : commitItem(
          solveRoomItem(`${prefix}_tv_stand`, 'tv-stand', {
            scale: [0.76, 0.82, 0.76],
            fitWidthRatio: 0.48,
            fitDepthRatio: 0.48,
            marginX: 0.16,
            marginZ: 0.16,
          }),
        )

    if (tvStand) {
      const tvStandHeight = getScaledAssetDimensions('tv-stand', tvStand.scale)[1]
      commitElevatedItem(`${prefix}_tv`, 'television', tvStand, {
        scale: tightRoom ? [0.54, 0.54, 0.54] : [0.62, 0.62, 0.62],
        y: tvStandHeight + 0.16,
        fitWidthRatio: 0.42,
        fitDepthRatio: 0.3,
        marginX: 0.16,
        marginZ: 0.16,
      })
    }

    if (sofa && !tightRoom && metrics.area >= 14) {
      commitItem(
        placeRoomCompanionItem(`${prefix}_coffee`, 'coffee-table', sofa, {
          sides: ['front', 'back'],
          gap: 0.32,
          scale: [0.68, 0.8, 0.62],
          fitWidthRatio: 0.34,
          fitDepthRatio: 0.34,
          profile: {
            role: 'center',
            pairWith: ['sofa'],
            pairDistance: [0.38, 1.7],
          },
        }) ??
          solveRoomItem(`${prefix}_coffee`, 'coffee-table', {
            scale: [0.68, 0.8, 0.62],
            fitWidthRatio: 0.34,
            fitDepthRatio: 0.34,
          }),
      )
    }
  }

  if (isKitchen && intent.kitchen) {
    const compactKitchen = tightRoom || metrics.area < 12
    const shouldPlaceDining = isDiningFocused || (!isPantryFocused && metrics.area >= 12.5)
    const shouldPlaceKitchenCore = isKitchenFocused || isPantryFocused || !isDiningFocused

    if (shouldPlaceDining) {
      const diningTable = commitItem(
        solveRoomItem(`${prefix}_dining_table`, 'dining-table', {
          scale: compactKitchen ? [0.6, 0.78, 0.6] : [0.72, 0.82, 0.72],
          fitWidthRatio: 0.38,
          fitDepthRatio: 0.38,
        }),
      )

      if (diningTable) {
        commitItem(
          placeRoomCompanionItem(`${prefix}_dining_chair_a`, 'dining-chair', diningTable, {
            sides: ['left', 'right', 'front', 'back'],
            gap: 0.08,
            faceTarget: true,
            fitWidthRatio: 0.18,
            fitDepthRatio: 0.18,
          }),
        )
      }

      if (diningTable && !compactKitchen && metrics.area >= 14) {
        commitItem(
          placeRoomCompanionItem(`${prefix}_dining_chair_b`, 'dining-chair', diningTable, {
            sides: ['front', 'back', 'left', 'right'],
            gap: 0.08,
            faceTarget: true,
            fitWidthRatio: 0.18,
            fitDepthRatio: 0.18,
          }) ??
            solveRoomItem(`${prefix}_dining_chair_b`, 'dining-chair', {
              fitWidthRatio: 0.18,
              fitDepthRatio: 0.18,
            }),
        )
      }
    }

    if (shouldPlaceKitchenCore) {
      const counter = commitItem(
        solveRoomItem(`${prefix}_counter`, 'kitchen-counter', {
          scale: compactKitchen ? [0.74, 0.88, 0.74] : [0.82, 0.9, 0.82],
          fitWidthRatio: 0.34,
          fitDepthRatio: 0.34,
        }),
      )

      if (metrics.area >= 8.5) {
        commitItem(
          solveRoomItem(`${prefix}_fridge`, 'fridge', {
            scale: compactKitchen ? [0.64, 0.8, 0.64] : [0.72, 0.82, 0.72],
            fitWidthRatio: 0.22,
            fitDepthRatio: 0.22,
          }),
        )
      }

      if ((!isDiningFocused || metrics.area >= 13) && counter) {
        const counterHeight = getScaledAssetDimensions('kitchen-counter', counter.scale)[1]
        const counterRotation = counter.rotation?.[1] ?? 0
        const fridge = items.find((item) => item.assetId === 'fridge')
        let stoveOffsetX = 0.26

        if (fridge) {
          const fridgeLocal = getLocalPointFromWorldVector(
            [fridge.position[0] - counter.position[0], fridge.position[2] - counter.position[2]],
            counterRotation,
          )
          stoveOffsetX = fridgeLocal[0] >= 0 ? -0.26 : 0.26
        }

        commitElevatedItem(`${prefix}_stove`, 'stove', counter, {
          scale: compactKitchen ? [0.6, 0.72, 0.6] : [0.68, 0.76, 0.68],
          y: counterHeight + 0.02,
          localOffset: [stoveOffsetX, 0],
          fitWidthRatio: 0.18,
          fitDepthRatio: 0.18,
          marginX: 0.1,
          marginZ: 0.1,
        })
      }
    }
  }

  if (isBath && intent.bathroom) {
    const compactBath = compact || metrics.area < 4.5 || metrics.minSpan < 2.1
    const canFitShower = metrics.area >= 4.2 && metrics.minSpan >= 1.9

    commitItem(
      solveRoomItem(`${prefix}_sink`, 'bathroom-sink', {
        anchors: getPlacementAnchorsForRole('wall'),
        rotationResolver: getWallAlignedRotationsForAnchor,
        scale: compactBath ? [0.44, 0.68, 0.44] : [0.5, 0.72, 0.5],
        fitWidthRatio: 0.22,
        fitDepthRatio: 0.22,
        marginX: 0.04,
        marginZ: 0.04,
      }),
    )
    commitItem(
      solveRoomItem(`${prefix}_toilet`, 'toilet', {
        anchors: getPlacementAnchorsForRole('wall'),
        rotationResolver: getWallAlignedRotationsForAnchor,
        scale: compactBath ? [0.62, 0.68, 0.62] : [0.7, 0.7, 0.7],
        fitWidthRatio: 0.18,
        fitDepthRatio: 0.18,
        marginX: 0.04,
        marginZ: 0.04,
      }),
    )

    if (canFitShower) {
      commitItem(
        solveRoomItem(`${prefix}_shower`, 'shower-square', {
          anchors: getPlacementAnchorsForRole('corner'),
          rotationResolver: getWallAlignedRotationsForAnchor,
          scale: compactBath ? [0.5, 0.66, 0.5] : [0.6, 0.72, 0.6],
          fitWidthRatio: 0.24,
          fitDepthRatio: 0.24,
          marginX: 0.03,
          marginZ: 0.03,
        }),
      )
    }

    if (
      !compactBath &&
      metrics.area >= 6.2 &&
      (/浴缸|泡池|bathtub|spa/.test(prompt) || isPrimary)
    ) {
      commitItem(
        solveRoomItem(`${prefix}_bathtub`, 'bathtub', {
          anchors: getPlacementAnchorsForRole('wall'),
          rotationResolver: getWallAlignedRotationsForAnchor,
          scale: [0.55, 0.7, 0.55],
          fitWidthRatio: 0.28,
          fitDepthRatio: 0.28,
          marginX: 0.04,
          marginZ: 0.04,
        }),
      )
    }
  }

  if (isTerrace && intent.terrace) {
    commitItem(
      solveRoomItem(`${prefix}_lounge_a`, 'lounge-chair', {
        scale: [0.72, 0.72, 0.72],
        fitWidthRatio: 0.26,
        fitDepthRatio: 0.26,
      }),
    )

    if (!tightRoom && metrics.area >= 8) {
      commitItem(
        solveRoomItem(`${prefix}_lounge_b`, 'lounge-chair', {
          scale: [0.72, 0.72, 0.72],
          fitWidthRatio: 0.26,
          fitDepthRatio: 0.26,
        }),
      )
    }
  }

  if (isGarage && intent.garage) {
    commitItem(
      solveRoomItem(`${prefix}_car`, 'tesla', {
        scale: [0.48, 0.48, 0.48],
        fitWidthRatio: 0.72,
        fitDepthRatio: 0.72,
        marginX: 0.2,
        marginZ: 0.2,
      }),
    )
  }

  return items.map((item) => ({
    ...item,
    level: floorIndex,
    roomKey: room.key,
    roomName: room.name,
    programKey: room.programKey,
  }))
}

function createCourtyardCeilingPlans(
  rooms: AiBuildingRoomPlan[],
  wallHeight: number,
  materialSpec: MaterialSchema,
) {
  return rooms
    .filter((room) => room.programKey !== 'courtyard')
    .map((room) => ({
      key: `ceiling-${room.key}`,
      name: `AI Ceiling ${room.name}`,
      polygon: room.polygon,
      height: wallHeight,
      material: materialSpec,
    }))
}

function createCourtyardRoofPlans(
  form: AiBuildingFormState,
  courtyardPolygon: Point2D[],
  wallHeight: number,
  roofMaterial: MaterialSchema,
  roofWallMaterial: MaterialSchema,
  roofType: AiBuildingRoofPlan['roofType'],
) {
  const courtyardBounds = getPolygonBounds(courtyardPolygon)
  const halfWidth = form.width / 2
  const halfDepth = form.depth / 2
  const minX = -halfWidth
  const maxX = halfWidth
  const minZ = -halfDepth
  const maxZ = halfDepth
  const ringRoofType = roofType === 'flat' ? 'flat' : 'hip'

  const segments = [
    {
      key: 'courtyard_south_roof',
      bounds: rect(minX, minZ, maxX, courtyardBounds.minZ),
    },
    {
      key: 'courtyard_west_roof',
      bounds: rect(minX, courtyardBounds.minZ, courtyardBounds.minX, courtyardBounds.maxZ),
    },
    {
      key: 'courtyard_east_roof',
      bounds: rect(courtyardBounds.maxX, courtyardBounds.minZ, maxX, courtyardBounds.maxZ),
    },
    {
      key: 'courtyard_north_roof',
      bounds: rect(minX, courtyardBounds.maxZ, maxX, maxZ),
    },
  ]

  const roofs: AiBuildingRoofPlan[] = []

  for (const segment of segments) {
    const bounds = getPolygonBounds(segment.bounds)
    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    if (width < 1 || depth < 1) continue

    roofs.push({
      key: segment.key,
      roofType: ringRoofType,
      position: [
        (bounds.minX + bounds.maxX) / 2,
        wallHeight + 0.08,
        (bounds.minZ + bounds.maxZ) / 2,
      ] as Point3D,
      width: width + 0.45,
      depth: depth + 0.45,
      roofHeight: ringRoofType === 'flat' ? 0.28 : 1.05,
      material: roofMaterial,
      wallMaterial: roofWallMaterial,
    })
  }

  return roofs
}

function createOutdoorDetails(
  form: AiBuildingFormState,
  intent: AiBuildingFeatureIntent,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): Pick<AiBuildingFloorPlan, 'detailSlabs' | 'fences' | 'items'> {
  const detailSlabs: AiBuildingDetailSlabPlan[] = []
  const fences: AiBuildingFencePlan[] = []
  const items: AiBuildingItemPlan[] = []
  const siteMinX = minX - 3
  const siteMaxX = maxX + 3
  const siteMinZ = minZ - 3
  const siteMaxZ = maxZ + 3
  const entryGap = Math.min(2.8, Math.max(1.8, form.width * 0.12))

  detailSlabs.push({
    key: 'entry_walk',
    name: 'Entry Walk',
    polygon: rect(-entryGap / 2, siteMinZ + 0.2, entryGap / 2, minZ + 0.35),
    elevation: 0.045,
    material: material('#c8ccd0', 0.82),
  })

  if (intent.garage) {
    detailSlabs.push({
      key: 'driveway',
      name: 'Driveway',
      polygon: rect(maxX - 4.2, siteMinZ + 0.35, maxX - 0.4, minZ + 2.5),
      elevation: 0.045,
      material: material('#bfc5ca', 0.84),
    })
    items.push(
      itemPlan('driveway_parking', 'parking-spot', [maxX - 2.3, 0, siteMinZ + 2.9], {
        scale: [0.9, 1, 0.75],
      }),
    )
  }

  if (intent.courtyard || intent.terrace) {
    detailSlabs.push({
      key: 'rear_terrace',
      name: 'Garden Terrace',
      polygon: rect(minX + 1.2, maxZ - 0.15, maxX - 1.2, siteMaxZ - 1.2),
      elevation: 0.055,
      material: material('#b98958', 0.68),
    })
  }

  if (intent.pool) {
    const poolX1 = maxX + 0.65
    const poolX2 = siteMaxX - 0.55
    const poolZ1 = minZ + Math.max(2.1, form.depth * 0.28)
    const poolZ2 = Math.min(maxZ - 1.2, poolZ1 + Math.max(3.2, form.depth * 0.22))
    const hasEastPoolSpace = poolX2 - poolX1 >= 2.1 && poolZ2 - poolZ1 >= 2.4
    const waterPolygon = hasEastPoolSpace
      ? rect(poolX1, poolZ1, poolX2, poolZ2)
      : rect(maxX - 5.2, maxZ + 0.8, maxX - 1.0, siteMaxZ - 0.8)
    const deckPolygon = hasEastPoolSpace
      ? rect(poolX1 - 0.6, poolZ1 - 0.6, poolX2 + 0.45, poolZ2 + 0.6)
      : rect(maxX - 5.8, maxZ + 0.35, maxX - 0.35, siteMaxZ - 0.35)

    detailSlabs.push(
      {
        key: 'pool_deck',
        name: 'Pool Deck',
        polygon: deckPolygon,
        elevation: 0.052,
        material: material('#d7d1c5', 0.85),
      },
      {
        key: 'pool',
        name: 'Pool',
        polygon: waterPolygon,
        elevation: 0.04,
        material: material('#58b9d4', 0.2, 0, 0.78),
      },
    )

    const poolBounds = getPolygonBounds(waterPolygon)
    items.push(
      itemPlan('pool_sunbed_a', 'sunbed', [poolBounds.maxX + 0.55, 0, poolBounds.minZ + 0.9], {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.75, 0.75, 0.75],
      }),
      itemPlan('pool_sunbed_b', 'sunbed', [poolBounds.maxX + 0.55, 0, poolBounds.maxZ - 0.9], {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.75, 0.75, 0.75],
      }),
      itemPlan(
        'pool_umbrella',
        'patio-umbrella',
        [poolBounds.minX - 0.55, 0, poolBounds.maxZ - 0.65],
        {
          scale: [0.95, 0.95, 0.95],
        },
      ),
    )
  }

  if (intent.landscape) {
    items.push(
      itemPlan('garden_tree', 'tree', [siteMinX + 1.2, 0, siteMaxZ - 1.2]),
      itemPlan('front_palm_left', 'palm', [minX + 1.6, 0, minZ - 1.2], {
        scale: [0.65, 0.65, 0.65],
      }),
      itemPlan('front_palm_right', 'palm', [maxX - 1.6, 0, minZ - 1.2], {
        scale: [0.65, 0.65, 0.65],
      }),
    )
  }

  if (intent.fencedGarden) {
    const fenceStyle = form.style === 'minimal' ? 'rail' : 'slat'
    const fenceColor = form.style === 'newChinese' ? '#2f3437' : '#3f454a'
    fences.push(
      {
        key: 'front_left',
        start: [siteMinX, siteMinZ],
        end: [-entryGap / 2 - 0.4, siteMinZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
      {
        key: 'front_right',
        start: [entryGap / 2 + 0.4, siteMinZ],
        end: [siteMaxX, siteMinZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
      {
        key: 'left',
        start: [siteMinX, siteMinZ],
        end: [siteMinX, siteMaxZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
      {
        key: 'back',
        start: [siteMinX, siteMaxZ],
        end: [siteMaxX, siteMaxZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
      {
        key: 'right',
        start: [siteMaxX, siteMaxZ],
        end: [siteMaxX, siteMinZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
    )
  }

  return { detailSlabs, fences, items }
}

function getPolygonBounds(points: Point2D[]) {
  const xs = points.map((point) => point[0])
  const zs = points.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function getStyleMaterials(form: AiBuildingFormState) {
  if (form.style === 'newChinese') {
    return {
      exteriorWall: material('#e8ddcc', 0.82),
      interiorWall: material('#f7f0e3', 0.86),
      slab: material('#d9cfbd', 0.84),
      ceiling: material('#f7f0e3', 0.9),
      roof: material('#4b5563', 0.72),
      roofWall: material('#f7f0e3', 0.86),
    }
  }

  if (form.style === 'minimal') {
    return {
      exteriorWall: material('#f8fafc', 0.8),
      interiorWall: material('#ffffff', 0.88),
      slab: material('#d7dce0', 0.82),
      ceiling: material('#f8fafc', 0.9),
      roof: material('#c8ccd0', 0.78),
      roofWall: material('#f8fafc', 0.86),
    }
  }

  return {
    exteriorWall: material('#f4f0e8', 0.86),
    interiorWall: material('#f8fafc', 0.78),
    slab: material('#d7d1c5', 0.85),
    ceiling: material('#f7f7f2', 0.9),
    roof: material('#5b6470', 0.72),
    roofWall: material('#f4f0e8', 0.86),
  }
}

function getRoofType(
  form: AiBuildingFormState,
  intent: AiBuildingFeatureIntent,
): AiBuildingRoofPlan['roofType'] {
  if (intent.terrace || form.style === 'minimal') return 'flat'
  if (form.style === 'newChinese') return 'hip'
  if (/坡屋顶|山墙|gable|pitched/.test(form.prompt.toLowerCase())) return 'gable'
  if (/单坡|shed/.test(form.prompt.toLowerCase())) return 'shed'
  return form.buildingType === 'shop' || form.buildingType === 'office' ? 'flat' : 'hip'
}

function getProgramDrivenVerticalAnchors(
  floorPlan: AiBuildingFloorPlan | null | undefined,
): ProgramDrivenVerticalAnchor[] {
  if (!floorPlan) return []

  const roomAnchors = floorPlan.rooms
    .filter((room) => room.programKey !== 'stairs')
    .map((room) => {
      const metrics = getRoomMetrics(room)
      return {
        key: room.programKey ?? 'room',
        centerX: (metrics.minX + metrics.maxX) / 2,
        centerZ: (metrics.minZ + metrics.maxZ) / 2,
        minX: metrics.minX,
        maxX: metrics.maxX,
        minZ: metrics.minZ,
        maxZ: metrics.maxZ,
      }
    })
  const stairAnchors = floorPlan.stairs.map((stair) => {
    const anchorRect = getPlannedStairStackAnchorRectBounds(stair)

    return {
      key: 'stairs',
      centerX: (anchorRect.minX + anchorRect.maxX) / 2,
      centerZ: (anchorRect.minZ + anchorRect.maxZ) / 2,
      minX: anchorRect.minX,
      maxX: anchorRect.maxX,
      minZ: anchorRect.minZ,
      maxZ: anchorRect.maxZ,
    }
  })

  return [...roomAnchors, ...stairAnchors]
}

function createVerticalAnchorFromRect(
  key: string,
  rect: AiBuildingRectBounds,
): ProgramDrivenVerticalAnchor {
  return {
    key,
    centerX: (rect.minX + rect.maxX) / 2,
    centerZ: (rect.minZ + rect.maxZ) / 2,
    minX: rect.minX,
    maxX: rect.maxX,
    minZ: rect.minZ,
    maxZ: rect.maxZ,
  }
}

function getPlannedStairCoreAnchor(
  totalRise: number,
  layoutHint: AiBuildingGridLayoutHint | null | undefined,
  floorBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  previousFloorStairs: AiBuildingStairPlan[] = [],
): ProgramDrivenVerticalAnchor | null {
  const stairWidth = 1.12
  const previousFloorStair = previousFloorStairs[0] ?? null
  const stackedLandingCenter = previousFloorStair
    ? getPlannedStairLandingCenter(previousFloorStair, 'end')
    : null
  const stackedAnchorRect = previousFloorStair
    ? getPlannedStairStackAnchorRectBounds(previousFloorStair)
    : null
  const floorEnvelope: AiBuildingRoomPlan = {
    key: '__planned_stair_core__',
    name: 'Planned Stair Core',
    programKey: 'stairs',
    color: '#dbeafe',
    polygon: rect(floorBounds.minX, floorBounds.minZ, floorBounds.maxX, floorBounds.maxZ),
  }
  const bounds = getRoomMetrics(floorEnvelope)
  const roomCenter = getRoomCenter(floorEnvelope)
  const anchorPoint = roomPointByLayout(floorEnvelope, layoutHint, 0.5, 0.42)
  let best: { score: number; rect: AiBuildingRectBounds } | null = null

  for (const rotation of getStairRotationCandidates(floorEnvelope, previousFloorStair?.rotation)) {
    for (const stairCandidate of createStairPlanCandidates(bounds, stairWidth, totalRise, rotation)) {
      const placementRange = getPlannedStairProtectedPlacementRange(bounds, stairCandidate)
      if (!placementRange) continue

      const stackedPosition = stackedLandingCenter
        ? getPlannedStairPositionFromLandingCenter(stackedLandingCenter, stairCandidate, 'start')
        : null
      const position: Point3D = [
        clampNumber(
          stackedPosition?.[0] ?? anchorPoint[0],
          placementRange.minX,
          placementRange.maxX,
        ),
        0,
        clampNumber(
          stackedPosition?.[2] ?? anchorPoint[2],
          placementRange.minZ,
          placementRange.maxZ,
        ),
      ]
      const placedPlan: AiBuildingStairPlan = {
        ...stairCandidate,
        roomKey: floorEnvelope.key,
        position,
      }
      const footprintRect = getPlannedStairFootprintRectBounds(placedPlan)
      const endLandingRect = getPlannedStairLandingRectBounds(placedPlan, 'end')
      const protectedRect = getPlannedStairProtectedRectBounds(placedPlan)
      const protectedClearance = getRectClearanceWithinBounds(protectedRect, bounds)
      if (protectedClearance < STAIR_WALL_CLEARANCE - 0.01) continue

      const footprintCenter: Point2D = [
        (footprintRect.minX + footprintRect.maxX) / 2,
        (footprintRect.minZ + footprintRect.maxZ) / 2,
      ]
      const centerDistance = getPointDistance(roomCenter, footprintCenter)
      const slackX = Math.min(protectedRect.minX - bounds.minX, bounds.maxX - protectedRect.maxX)
      const slackZ = Math.min(protectedRect.minZ - bounds.minZ, bounds.maxZ - protectedRect.maxZ)
      const arrivalClearance = getRectClearanceWithinBounds(endLandingRect, bounds)
      const stackShiftDistance = stackedPosition
        ? getPointDistance([position[0], position[2]], [stackedPosition[0], stackedPosition[2]])
        : 0
      const stackRotationDistance = previousFloorStair
        ? getRotationDistance(rotation, previousFloorStair.rotation)
        : 0
      const stackAnchorOverlap = stackedAnchorRect
        ? getRectOverlapArea(protectedRect, stackedAnchorRect)
        : 0
      const walkability = scorePlacedStairCandidateWalkability(placedPlan, floorEnvelope, [])
      if (walkability.hardFailure) continue
      const layoutBias = getStairLayoutDesignBias(placedPlan.layoutType, bounds)
      const score =
        layoutBias +
        (walkability.score - 78) * 1.4 +
        Math.min(slackX, slackZ) * 18 -
        centerDistance * 7 -
        stackShiftDistance * 38 -
        stackRotationDistance * 16 +
        stackAnchorOverlap * 42 -
        Math.max(0, STAIR_WALL_CLEARANCE - protectedClearance) * 180 -
        Math.max(0, 0.12 - arrivalClearance) * 120

      if (!best || score > best.score) {
        best = {
          score,
          rect: protectedRect,
        }
      }
    }
  }

  return best ? createVerticalAnchorFromRect('stairs', best.rect) : null
}

function createVerticalCorePlan(
  form: AiBuildingFormState,
  layoutHint: AiBuildingGridLayoutHint | null | undefined,
  floorBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): AiBuildingVerticalCorePlan | null {
  if (form.floors <= 1) return null

  const firstFloorRise = 3
  const stairAnchor = getPlannedStairCoreAnchor(firstFloorRise, layoutHint, floorBounds)
  if (!stairAnchor) return null

  return {
    coreId: 'primary-stair-core',
    coreType: 'stairs',
    anchorsByLevel: new Map(
      Array.from({ length: form.floors }, (_, level) => [
        level,
        {
          ...stairAnchor,
          key: 'stairs',
        },
      ]),
    ),
  }
}

function createFloorPlan(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
  sceneContext?: SceneContext | null,
  options: AiBuildingGenerationOptions = {},
  previousFloorPlan?: AiBuildingFloorPlan | null,
  verticalCorePlan?: AiBuildingVerticalCorePlan | null,
): AiBuildingFloorPlan {
  const halfWidth = form.width / 2
  const halfDepth = form.depth / 2
  const minX = -halfWidth
  const maxX = halfWidth
  const minZ = -halfDepth
  const maxZ = halfDepth
  const layoutHint = getSceneGridLayoutHint(sceneContext)
  const wallHeight = floorIndex === 0 ? 3 : 2.8
  const intent = inferFeatureIntent(form)
  const previousFloorAnchors = getProgramDrivenVerticalAnchors(previousFloorPlan)
  const verticalCoreAnchor = verticalCorePlan?.anchorsByLevel.get(floorIndex) ?? null
  const plannedAnchors: ProgramDrivenVerticalAnchor[] = []

  if (verticalCoreAnchor) {
    plannedAnchors.push(verticalCoreAnchor)
  } else if (intent.stairs && floorIndex < form.floors - 1) {
    const plannedStairCoreAnchor = getPlannedStairCoreAnchor(
      wallHeight,
      layoutHint,
      { minX, maxX, minZ, maxZ },
      previousFloorPlan?.stairs ?? [],
    )
    if (plannedStairCoreAnchor) {
      plannedAnchors.push(plannedStairCoreAnchor)
    }
  }

  const layout = createRoomLayout(
    form,
    floorIndex,
    language,
    minX,
    maxX,
    minZ,
    maxZ,
    layoutHint,
    previousFloorAnchors,
    plannedAnchors,
  )
  const materials = getStyleMaterials(form)

  let walls: AiBuildingWallPlan[] = [
    {
      key: 'south',
      name: language === 'zh-CN' ? '南外墙' : 'South Wall',
      start: [minX, minZ],
      end: [maxX, minZ],
      role: 'outer',
    },
    {
      key: 'east',
      name: language === 'zh-CN' ? '东外墙' : 'East Wall',
      start: [maxX, minZ],
      end: [maxX, maxZ],
      role: 'outer',
    },
    {
      key: 'north',
      name: language === 'zh-CN' ? '北外墙' : 'North Wall',
      start: [maxX, maxZ],
      end: [minX, maxZ],
      role: 'outer',
    },
    {
      key: 'west',
      name: language === 'zh-CN' ? '西外墙' : 'West Wall',
      start: [minX, maxZ],
      end: [minX, minZ],
      role: 'outer',
    },
    ...layout.walls,
  ]
  const rooms = layout.rooms
  walls = ensureRoomEnclosureWalls(rooms, walls)

  for (const wall of walls) {
    wall.interiorMaterial = materials.interiorWall
    wall.exteriorMaterial = wall.role === 'outer' ? materials.exteriorWall : materials.interiorWall
  }

  const baseWalls = walls
  let openings = createPlanOpenings(
    form,
    floorIndex,
    language,
    rooms,
    walls,
    intent,
    layoutHint,
    options.openingBias ?? 'balanced',
    previousFloorPlan?.stairs ?? [],
  )

  const slabPolygon = rect(minX, minZ, maxX, maxZ)
  const isTopFloor = floorIndex === form.floors - 1
  const hasCourtyardVoid = Boolean(layout.courtyardPolygon?.length)
  const outdoorDetails =
    floorIndex === 0
      ? createOutdoorDetails(form, intent, minX, maxX, minZ, maxZ)
      : { detailSlabs: [], fences: [], items: [] }
  const terraceSlabs =
    intent.terrace || intent.courtyard
      ? rooms
          .filter((room) => hasRoomMeaning(room, /露台|阳台|庭院|terrace|balcony|courtyard|garden/))
          .map((room) => ({
            key: `${room.key}_finish`,
            name: `${room.name} Finish`,
            polygon: room.polygon,
            elevation: room.programKey === 'courtyard' ? 0.04 : 0.065,
            material:
              room.programKey === 'courtyard'
                ? material('#d2c6ae', 0.82)
                : material('#b98958', 0.68),
          }))
      : []
  const ceilings = intent.ceiling
    ? hasCourtyardVoid
      ? createCourtyardCeilingPlans(rooms, wallHeight, materials.ceiling)
      : [
          {
            key: 'ceiling',
            name: floorIndex === 0 ? 'AI Ceiling' : `AI Ceiling ${floorIndex + 1}`,
            polygon: slabPolygon,
            height: wallHeight,
            material: materials.ceiling,
          },
        ]
    : []
  let roomAccessPointsByKey = new Map(
    rooms.map((room) => [room.key, getRoomAccessPoints(room, walls, openings)]),
  )
  const roofType = getRoofType(form, intent)
  const roofs =
    isTopFloor && intent.roof
      ? hasCourtyardVoid
        ? createCourtyardRoofPlans(
            form,
            layout.courtyardPolygon ?? [],
            wallHeight,
            materials.roof,
            materials.roofWall,
            roofType,
          )
        : [
            {
              key: 'main_roof',
              roofType,
              position: [0, wallHeight + 0.08, 0] as Point3D,
              width: form.width + 1.2,
              depth: form.depth + 1.2,
              roofHeight: roofType === 'flat' ? 0.28 : 1.25,
              material: materials.roof,
              wallMaterial: materials.roofWall,
            },
          ]
      : []
  let stairs =
    intent.stairs && floorIndex < form.floors - 1
      ? createFloorStairPlans(
          rooms,
          baseWalls,
          openings,
          roomAccessPointsByKey,
          wallHeight,
          layoutHint,
          { minX, maxX, minZ, maxZ },
          previousFloorPlan?.stairs ?? [],
          verticalCoreAnchor,
        )
      : []
  const stairWallClearRects = getStairWallClearRects(stairs)
  walls = clipInteriorWallsForRects(baseWalls, stairWallClearRects)
  openings = createPlanOpenings(
    form,
    floorIndex,
    language,
    rooms,
    walls,
    intent,
    layoutHint,
    options.openingBias ?? 'balanced',
    previousFloorPlan?.stairs ?? [],
  )

  if (
    intent.stairs &&
    floorIndex < form.floors - 1 &&
    (stairs.length === 0 ||
      stairs.some((stair) => getStairSolidWallConflicts(stair, walls, openings).hasConflict))
  ) {
    const retryOpenings = createPlanOpenings(
      form,
      floorIndex,
      language,
      rooms,
      baseWalls,
      intent,
      layoutHint,
      options.openingBias ?? 'balanced',
      previousFloorPlan?.stairs ?? [],
    )
    const retryAccessPointsByKey = new Map(
      rooms.map((room) => [room.key, getRoomAccessPoints(room, baseWalls, retryOpenings)]),
    )
    const retryStairs = createFloorStairPlans(
      rooms,
      baseWalls,
      retryOpenings,
      retryAccessPointsByKey,
      wallHeight,
      layoutHint,
      { minX, maxX, minZ, maxZ },
      previousFloorPlan?.stairs ?? [],
      verticalCoreAnchor,
    )

    if (retryStairs.length > 0) {
      const retryWalls = clipInteriorWallsForRects(
        baseWalls,
        getStairWallClearRects(retryStairs),
      )
      const retryFinalOpenings = createPlanOpenings(
        form,
        floorIndex,
        language,
        rooms,
        retryWalls,
        intent,
        layoutHint,
        options.openingBias ?? 'balanced',
        previousFloorPlan?.stairs ?? [],
      )
      const retryHasWallConflict = retryStairs.some((stair) =>
        getStairSolidWallConflicts(stair, retryWalls, retryFinalOpenings).hasConflict,
      )

      if (!retryHasWallConflict) {
        stairs = retryStairs
        walls = retryWalls
        openings = retryFinalOpenings
      }
    }
  }

  roomAccessPointsByKey = new Map(
    rooms.map((room) => [room.key, getRoomAccessPoints(room, walls, openings)]),
  )
  const stairBlockedRectsByRoomKey = getStairBlockedRectsByRoomKey(
    rooms,
    stairs,
    previousFloorPlan?.stairs ?? [],
  )
  const defaultDensity = options.furnishingBias === 'circulation-first' ? 'compact' : 'default'
  const defaultPlacementMode: AiBuildingPlacementMode =
    options.furnishingBias === 'circulation-first' ? 'entry-clear' : 'balanced'
  const roomItems = rooms.flatMap((room) =>
    createRoomItemPlans(
      form,
      intent,
      floorIndex,
      room,
      layoutHint,
      sceneContext,
      roomAccessPointsByKey.get(room.key) ?? [],
      stairBlockedRectsByRoomKey.get(room.key) ?? [],
      defaultPlacementMode,
      defaultDensity,
    ),
  )

  return {
    level: floorIndex,
    label: language === 'zh-CN' ? `第 ${floorIndex + 1} 层` : `Level ${floorIndex + 1}`,
    rooms,
    walls,
    openings,
    slabPolygon,
    slabMaterial: materials.slab,
    ceilings,
    detailSlabs: [...outdoorDetails.detailSlabs, ...terraceSlabs],
    fences: outdoorDetails.fences,
    items: [...roomItems, ...outdoorDetails.items],
    roofs,
    stairs,
    wallHeight,
  }
}

function getRoomArea(room: AiBuildingRoomPlan) {
  return getRoomMetrics(room).area
}

function getItemFootprint(item: AiBuildingItemPlan) {
  const assetInput = ITEM_ASSETS[item.assetId]
  const offset = (assetInput.offset ?? [0, 0, 0]) as Point3D
  const [baseWidth, height, baseDepth] = getScaledAssetDimensions(item.assetId, item.scale)
  const yaw = item.rotation?.[1] ?? 0
  const cos = Math.abs(Math.cos(yaw))
  const sin = Math.abs(Math.sin(yaw))
  const width = baseWidth * cos + baseDepth * sin
  const depth = baseWidth * sin + baseDepth * cos

  return {
    assetId: item.assetId,
    surface: getItemSurface(item.assetId),
    positionY: item.position[1],
    height,
    minX: item.position[0] + offset[0] - width / 2,
    maxX: item.position[0] + offset[0] + width / 2,
    minZ: item.position[2] + offset[2] - depth / 2,
    maxZ: item.position[2] + offset[2] + depth / 2,
    area: width * depth,
  }
}

function getFootprintOverlapArea(
  left: ReturnType<typeof getItemFootprint>,
  right: ReturnType<typeof getItemFootprint>,
) {
  const overlapWidth = Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX)
  const overlapDepth = Math.min(left.maxZ, right.maxZ) - Math.max(left.minZ, right.minZ)
  if (!(overlapWidth > 0 && overlapDepth > 0)) return 0
  return overlapWidth * overlapDepth
}

function verticalRangesOverlap(
  left: ReturnType<typeof getItemFootprint>,
  right: ReturnType<typeof getItemFootprint>,
) {
  const overlap =
    Math.min(left.positionY + left.height, right.positionY + right.height) -
    Math.max(left.positionY, right.positionY)
  return overlap > 0.06
}

function getTargetCirculationClearance(sceneContext?: SceneContext | null) {
  const gridModule = sceneContext ? getSceneGridModule(sceneContext) : null
  return clampNumber((gridModule ?? 4.6) * 0.12, 0.45, 0.78)
}

function analyzeRoomCirculation(
  room: AiBuildingRoomPlan,
  items: AiBuildingItemPlan[],
  targetClearance: number,
  accessPoints: AiBuildingRoomAccessPoint[] = [],
  blockedRects: AiBuildingRectBounds[] = [],
) {
  if (items.length === 0) return null

  const bounds = getRoomMetrics(room)
  const level = items[0]?.level ?? 0
  const footprints = items.map((item) => getItemFootprint(item))
  const footprintEntries = items.map((item, index) => ({
    item,
    footprint: footprints[index]!,
  }))
  const floorEntries = footprintEntries.filter((entry) => entry.footprint.surface === 'floor')
  const floorFootprints = floorEntries.map((entry) => entry.footprint)
  const doorSwingZonePairs = accessPoints.map((accessPoint) => getDoorSwingZones(accessPoint))
  const minBoundaryClearance =
    floorFootprints.length === 0
      ? null
      : floorFootprints.reduce((minimum, footprint) => {
          const clearance = Math.min(
            footprint.minX - bounds.minX,
            bounds.maxX - footprint.maxX,
            footprint.minZ - bounds.minZ,
            bounds.maxZ - footprint.maxZ,
          )
          return Math.min(minimum, clearance)
        }, Number.POSITIVE_INFINITY)
  const boundaryViolationEntries = floorEntries.filter(({ footprint }) => {
    const clearance = Math.min(
      footprint.minX - bounds.minX,
      bounds.maxX - footprint.maxX,
      footprint.minZ - bounds.minZ,
      bounds.maxZ - footprint.maxZ,
    )
    return clearance < -0.02
  })
  const unsupportedEntries = footprintEntries.filter(
    ({ footprint }) => footprint.surface === 'countertop' && footprint.positionY < 0.45,
  )
  const blockedFixedZoneEntries = floorEntries.filter(({ footprint }) =>
    blockedRects.some((rect) => getFootprintRectOverlapArea(footprint, rect) > 0.03),
  )
  const boundaryViolationCount = boundaryViolationEntries.length
  const unsupportedCount = unsupportedEntries.length
  const blockedFixedZoneCount = blockedFixedZoneEntries.length

  let overlapCount = 0
  let blockedAccessCount = 0
  let blockedDoorSwingCount = 0
  let useConflictCount = 0
  const overlapItemKeys = new Set<string>()
  const blockedAccessItemKeys = new Set<string>()
  const blockedDoorSwingItemKeys = new Set<string>()
  const blockedDoorWallKeys = new Set<string>()
  const useConflictItemKeys = new Set<string>()
  const blockedFixedZoneItemKeys = new Set<string>()

  for (const entry of blockedFixedZoneEntries) {
    blockedFixedZoneItemKeys.add(entry.item.key)
  }

  for (let index = 0; index < floorEntries.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < floorEntries.length; nextIndex += 1) {
      const leftEntry = floorEntries[index]
      const rightEntry = floorEntries[nextIndex]
      if (!leftEntry || !rightEntry) continue
      if (
        verticalRangesOverlap(leftEntry.footprint, rightEntry.footprint) &&
        getFootprintOverlapArea(leftEntry.footprint, rightEntry.footprint) > 0.06
      ) {
        overlapCount += 1
        overlapItemKeys.add(leftEntry.item.key)
        overlapItemKeys.add(rightEntry.item.key)
      }
    }
  }

  for (const accessPoint of accessPoints) {
    const entryZone = getAccessEntryZone(room, accessPoint)
    const corridorZone = getAccessCorridorZone(room, accessPoint)
    const doorSwingZones = getDoorSwingZones(accessPoint)
    const blockingAccessEntries = floorEntries.filter(({ footprint }) => {
      const entryOverlap = getFootprintRectOverlapArea(footprint, entryZone)
      const corridorOverlap = corridorZone
        ? getFootprintRectOverlapArea(footprint, corridorZone)
        : 0
      return entryOverlap > 0.035 || corridorOverlap > 0.08
    })
    if (blockingAccessEntries.length > 0) {
      blockedAccessCount += 1
      blockedDoorWallKeys.add(accessPoint.wallKey)
      for (const entry of blockingAccessEntries) blockedAccessItemKeys.add(entry.item.key)
    }

    const blockingDoorEntries = floorEntries.filter(({ footprint }) =>
      doorSwingZones.some((zone) => getFootprintRectOverlapArea(footprint, zone) > 0.03),
    )
    const blockedDoorSwing = doorSwingZones.every((zone) =>
      blockingDoorEntries.some(
        ({ footprint }) => getFootprintRectOverlapArea(footprint, zone) > 0.03,
      ),
    )
    if (blockedDoorSwing) {
      blockedDoorSwingCount += 1
      blockedDoorWallKeys.add(accessPoint.wallKey)
      for (const entry of blockingDoorEntries) blockedDoorSwingItemKeys.add(entry.item.key)
    }
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const footprint = footprints[index]
    if (!item || !footprint || footprint.surface !== 'floor') continue

    const useZones = getItemUseZones(item)
    if (useZones.length === 0) continue

    const hasBlockedUseZone = useZones.some((zone) => {
      const blockedByFurniture = floorEntries.some(
        ({ item: otherItem, footprint: otherFootprint }) => {
          if (otherFootprint === footprint) return false
          if (!otherItem) return false
          if (areItemsPlacementCompanions(item.assetId, otherItem.assetId)) return false
          const overlaps = getFootprintRectOverlapArea(otherFootprint, zone) > 0.05
          if (overlaps) useConflictItemKeys.add(otherItem.key)
          return overlaps
        },
      )
      const blockedByDoorSwing = doorSwingZonePairs.some((doorZones) =>
        doorZones.every((doorZone) => getRectOverlapArea(doorZone, zone) > 0.04),
      )
      return blockedByFurniture || blockedByDoorSwing
    })

    if (hasBlockedUseZone) {
      useConflictCount += 1
      useConflictItemKeys.add(item.key)
    }
  }

  const roomArea = getRoomArea(room)
  const occupiedArea = floorFootprints.reduce((sum, footprint) => sum + footprint.area, 0)
  const coverage = occupiedArea / roomArea
  let score = 100

  if (coverage > 0.42) score -= 26
  else if (coverage > 0.34) score -= 14
  else if (coverage > 0.28) score -= 6

  if (typeof minBoundaryClearance === 'number') {
    if (minBoundaryClearance < targetClearance * 0.7) score -= 34
    else if (minBoundaryClearance < targetClearance) score -= 18
    else if (minBoundaryClearance < targetClearance + 0.08) score -= 10
  }

  score -= overlapCount * 16
  score -= boundaryViolationCount * 18
  score -= unsupportedCount * 14
  score -= blockedFixedZoneCount * 24
  score -= blockedAccessCount * 18
  score -= blockedDoorSwingCount * 14
  score -= useConflictCount * 12

  return {
    level,
    roomName: room.name,
    roomKey: room.key,
    score: Math.round(clampNumber(score, 0, 100)),
    minBoundaryClearance: Number.isFinite(minBoundaryClearance) ? minBoundaryClearance : null,
    focusRefs: dedupeDiagnosticFocusRefs([
      ...Array.from(overlapItemKeys).map(
        (key) => ({ type: 'item', key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      ...boundaryViolationEntries.map(
        ({ item }) => ({ type: 'item', key: item.key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      ...unsupportedEntries.map(
        ({ item }) => ({ type: 'item', key: item.key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      ...Array.from(blockedFixedZoneItemKeys).map(
        (key) => ({ type: 'item', key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      ...Array.from(blockedAccessItemKeys).map(
        (key) => ({ type: 'item', key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      ...Array.from(blockedDoorSwingItemKeys).map(
        (key) => ({ type: 'item', key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      ...Array.from(blockedDoorWallKeys).map(
        (key) =>
          ({
            type: 'opening',
            key,
            openingKind: 'door',
          }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      ...Array.from(useConflictItemKeys).map(
        (key) => ({ type: 'item', key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
    ]),
    overlapCount,
    boundaryViolationCount,
    unsupportedCount,
    blockedFixedZoneCount,
    blockedAccessCount,
    blockedDoorSwingCount,
    useConflictCount,
    coverage,
  }
}

function analyzeKitchenWorkflow(
  level: number,
  room: AiBuildingRoomPlan,
  items: AiBuildingItemPlan[],
) {
  const counters = items.filter((item) => item.assetId === 'kitchen-counter')
  const fridges = items.filter((item) => item.assetId === 'fridge')
  const stoves = items.filter((item) => item.assetId === 'stove')
  if (counters.length === 0 || fridges.length === 0) return null

  const floorItems = items.filter((item) => getItemFootprint(item).surface === 'floor')
  let best: {
    score: number
    workflowGap: number
    cookGap: number | null
    blocked: boolean
    focusRefs: AiBuildingDiagnosticFocusRef[]
  } | null = null

  for (const counter of counters) {
    const counterZone = getItemUseZones(counter, room)[0]
    if (!counterZone) continue

    for (const fridge of fridges) {
      const fridgeZone = getItemUseZones(fridge, room)[0]
      if (!fridgeZone) continue
      const nearestStove = stoves
        .flatMap((item) =>
          getItemUseZones(item, room, { includeElevated: true }).map((zone) => ({
            item,
            zone,
          })),
        )
        .sort(
          (left, right) => getRectGap(left.zone, counterZone) - getRectGap(right.zone, counterZone),
        )[0]
      const stoveZone = nearestStove?.zone

      const corridor = createCorridorRectBetweenPoints(
        getRectCenter(counterZone),
        getRectCenter(fridgeZone),
        0.72,
      )
      const cookCorridor = stoveZone
        ? createCorridorRectBetweenPoints(
            getRectCenter(counterZone),
            getRectCenter(stoveZone),
            0.66,
          )
        : null
      const blockingItems = floorItems.filter((item) => {
        if (item.key === counter.key || item.key === fridge.key) return false
        const footprint = getItemFootprint(item)
        return (
          getFootprintRectOverlapArea(footprint, corridor) > 0.08 ||
          (cookCorridor ? getFootprintRectOverlapArea(footprint, cookCorridor) > 0.06 : false)
        )
      })
      const blocked = blockingItems.length > 0
      const workflowGap = getRectGap(counterZone, fridgeZone)
      const cookGap = stoveZone ? getRectGap(counterZone, stoveZone) : null
      const centerDistance = getPointDistance(
        [counter.position[0], counter.position[2]],
        [fridge.position[0], fridge.position[2]],
      )
      const angleDiff = getNormalizedAngleDifference(
        counter.rotation?.[1] ?? 0,
        fridge.rotation?.[1] ?? 0,
      )

      let score = 100
      if (workflowGap > 0.95) score -= 28
      else if (workflowGap > 0.55) score -= 12

      if (centerDistance > 2.8) score -= 18
      else if (centerDistance > 2.3) score -= 10
      else if (centerDistance < 0.55) score -= 18

      const parallelError = Math.min(angleDiff, Math.abs(Math.PI - angleDiff))
      if (parallelError > 0.55) score -= 10
      if (typeof cookGap === 'number') {
        if (cookGap > 0.95) score -= 22
        else if (cookGap > 0.62) score -= 10
        else if (cookGap < 0.16) score -= 10
      }
      if (blocked) score -= 26

      if (!best || score > best.score) {
        best = {
          score: Math.round(clampNumber(score, 0, 100)),
          workflowGap,
          cookGap,
          blocked,
          focusRefs: dedupeDiagnosticFocusRefs([
            { type: 'item', key: counter.key },
            { type: 'item', key: fridge.key },
            ...(nearestStove ? [{ type: 'item', key: nearestStove.item.key } as const] : []),
            ...blockingItems.map((item) => ({ type: 'item', key: item.key }) as const),
          ]),
        }
      }
    }
  }

  if (!best) return null
  return {
    level,
    roomName: room.name,
    roomKey: room.key,
    ...best,
  }
}

function analyzeBathroomZoning(
  level: number,
  room: AiBuildingRoomPlan,
  items: AiBuildingItemPlan[],
  accessPoints: AiBuildingRoomAccessPoint[],
) {
  const wetFixtures = items.filter(
    (item) => item.assetId === 'shower-square' || item.assetId === 'bathtub',
  )
  const dryFixtures = items.filter(
    (item) => item.assetId === 'bathroom-sink' || item.assetId === 'toilet',
  )
  if (wetFixtures.length === 0 || dryFixtures.length === 0) return null

  const accessPoint = accessPoints.find((point) => point.kind === 'entry') ?? accessPoints[0]
  if (!accessPoint) return null

  const accessCenter = accessPoint.position
  const wetCenters = wetFixtures.map((item) => [item.position[0], item.position[2]] as Point2D)
  const dryCenters = dryFixtures.map((item) => [item.position[0], item.position[2]] as Point2D)
  const wetAverageDistance =
    wetCenters.reduce((sum, point) => sum + getPointDistance(point, accessCenter), 0) /
    wetCenters.length
  const dryAverageDistance =
    dryCenters.reduce((sum, point) => sum + getPointDistance(point, accessCenter), 0) /
    dryCenters.length
  const wetDelta = wetAverageDistance - dryAverageDistance
  const wetZones = wetFixtures.flatMap((item) => getItemUseZones(item, room))
  const dryZones = dryFixtures.flatMap((item) => getItemUseZones(item, room))
  const entryZone = getAccessEntryZone(room, accessPoint)
  const corridorZone = getAccessCorridorZone(room, accessPoint)
  const wetEntryOverlap = wetZones.reduce(
    (sum, zone) =>
      sum +
      getRectOverlapArea(zone, entryZone) +
      (corridorZone ? getRectOverlapArea(zone, corridorZone) : 0),
    0,
  )
  const minWetDryGap = wetZones.reduce((minimum, wetZone) => {
    const nearestDry = dryZones.reduce(
      (dryMinimum, dryZone) => Math.min(dryMinimum, getRectGap(wetZone, dryZone)),
      Number.POSITIVE_INFINITY,
    )
    return Math.min(minimum, nearestDry)
  }, Number.POSITIVE_INFINITY)

  let score = 100
  if (wetDelta < 0.1) score -= 28
  else if (wetDelta < 0.35) score -= 12
  if (wetEntryOverlap > 0.18) score -= 22
  else if (wetEntryOverlap > 0.05) score -= 10
  if (Number.isFinite(minWetDryGap)) {
    if (minWetDryGap < 0.08) score -= 20
    else if (minWetDryGap < 0.2) score -= 8
  }

  return {
    level,
    roomName: room.name,
    roomKey: room.key,
    score: Math.round(clampNumber(score, 0, 100)),
    focusRefs: dedupeDiagnosticFocusRefs([
      ...wetFixtures.map(
        (item) => ({ type: 'item', key: item.key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      ...dryFixtures.map(
        (item) => ({ type: 'item', key: item.key }) satisfies AiBuildingDiagnosticFocusRef,
      ),
      {
        type: 'opening',
        key: accessPoint.wallKey,
        openingKind: 'door',
      } satisfies AiBuildingDiagnosticFocusRef,
    ]),
    wetDelta,
    wetEntryOverlap,
  }
}

function analyzeLivingView(level: number, room: AiBuildingRoomPlan, items: AiBuildingItemPlan[]) {
  const sofas = items.filter((item) => item.assetId === 'sofa')
  const displays = items.filter(
    (item) => item.assetId === 'television' || item.assetId === 'tv-stand',
  )
  if (sofas.length === 0 || displays.length === 0) return null

  const floorItems = items.filter((item) => getItemFootprint(item).surface === 'floor')
  let best: {
    score: number
    viewDistance: number
    blocked: boolean
    focusRefs: AiBuildingDiagnosticFocusRef[]
  } | null = null

  for (const sofa of sofas) {
    for (const display of displays) {
      const sofaPoint: Point2D = [sofa.position[0], sofa.position[2]]
      const displayPoint: Point2D = [display.position[0], display.position[2]]
      const toDisplay = normalizePoint2D([
        displayPoint[0] - sofaPoint[0],
        displayPoint[1] - sofaPoint[1],
      ])
      const toSofa = normalizePoint2D([
        sofaPoint[0] - displayPoint[0],
        sofaPoint[1] - displayPoint[1],
      ])
      const sofaForward = normalizePoint2D(getLocalSideVector(sofa.rotation?.[1] ?? 0, 'front'))
      const displayForward = normalizePoint2D(
        getLocalSideVector(display.rotation?.[1] ?? 0, 'front'),
      )
      const sofaFacing = sofaForward[0] * toDisplay[0] + sofaForward[1] * toDisplay[1]
      const displayFacing = displayForward[0] * toSofa[0] + displayForward[1] * toSofa[1]
      const viewDistance = getPointDistance(sofaPoint, displayPoint)
      const sightBand = createCorridorRectBetweenPoints(sofaPoint, displayPoint, 0.92)
      const blockingItems = floorItems.filter((item) => {
        if (
          item.key === sofa.key ||
          item.key === display.key ||
          item.assetId === 'coffee-table' ||
          item.assetId === 'tv-stand'
        ) {
          return false
        }
        return getFootprintRectOverlapArea(getItemFootprint(item), sightBand) > 0.08
      })
      const blocked = blockingItems.length > 0

      let score = 100
      if (viewDistance > 4.6) score -= 26
      else if (viewDistance > 4.1) score -= 12
      else if (viewDistance < 1.6) score -= 24
      else if (viewDistance < 1.9) score -= 10
      if (sofaFacing < 0.76) score -= 24
      else if (sofaFacing < 0.9) score -= 10
      if (display.assetId === 'television' && displayFacing < 0.76) score -= 18
      else if (display.assetId === 'television' && displayFacing < 0.9) score -= 8
      if (blocked) score -= 18

      if (!best || score > best.score) {
        best = {
          score: Math.round(clampNumber(score, 0, 100)),
          viewDistance,
          blocked,
          focusRefs: dedupeDiagnosticFocusRefs([
            { type: 'item', key: sofa.key },
            { type: 'item', key: display.key },
            ...blockingItems.map((item) => ({ type: 'item', key: item.key }) as const),
          ]),
        }
      }
    }
  }

  if (!best) return null
  return {
    level,
    roomName: room.name,
    roomKey: room.key,
    ...best,
  }
}

function getRoomRefKey(level: number, roomKey: string) {
  return `${level}:${roomKey}`
}

function getRoomDiagnosticStatus(
  score: number,
  warningCount: number,
): AiBuildingRoomDiagnostic['status'] {
  if (score < 66 || warningCount >= 3) return 'bad'
  if (score < 82 || warningCount > 0) return 'warn'
  return 'good'
}

function dedupeTextEntries(entries: string[]) {
  return Array.from(new Set(entries.filter(Boolean)))
}

function dedupeDiagnosticFocusRefs(entries: AiBuildingDiagnosticFocusRef[]) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key =
      entry.type === 'opening'
        ? `${entry.type}:${entry.key}:${entry.openingKind}`
        : `${entry.type}:${entry.key}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function applyOptimizationMetadataToAnalysis(
  analysis: AiBuildingPlanAnalysis,
  optimization: AiBuildingPlanAnalysis['optimization'],
  language: AiBuildingLanguage,
): AiBuildingPlanAnalysis {
  const roomDiagnostics =
    !optimization || optimization.roomRefs.length === 0
      ? analysis.roomDiagnostics.map((diagnostic) => ({
          ...diagnostic,
          optimized: false,
        }))
      : (() => {
          const optimizedRoomIds = new Set(
            optimization.roomRefs.map((roomRef) => getRoomRefKey(roomRef.level, roomRef.roomKey)),
          )

          return analysis.roomDiagnostics.map((diagnostic) => ({
            ...diagnostic,
            optimized: optimizedRoomIds.has(getRoomRefKey(diagnostic.level, diagnostic.roomKey)),
          }))
        })()
  const rules = analysis.rules
    ? {
        ...analysis.rules,
        repairSummaries: createRuleRepairSummaries(
          analysis.rules,
          language,
          optimization,
          roomDiagnostics,
        ),
      }
    : null

  if (!optimization || optimization.roomRefs.length === 0) {
    return {
      ...analysis,
      optimization: null,
      rules,
      repairSummaries: rules?.repairSummaries ?? [],
      roomDiagnostics,
    }
  }

  return {
    ...analysis,
    optimization,
    rules,
    repairSummaries: rules?.repairSummaries ?? [],
    roomDiagnostics,
  }
}

function createPlanAnalysis(
  floors: AiBuildingFloorPlan[],
  form: AiBuildingFormState,
  language: AiBuildingLanguage,
  sceneContext?: SceneContext | null,
): AiBuildingPlanAnalysis {
  const layoutHint = getSceneGridLayoutHint(sceneContext)
  const massing = inferMassingIntent(form)
  const exteriorOpenings = floors.flatMap((floor) =>
    floor.openings.filter((opening) => opening.facade !== 'interior'),
  )
  const eligibleOpenings = exteriorOpenings.filter(
    (opening) => opening.wallAxis && opening.wallAxis === layoutHint?.axis,
  )
  const alignedOpenings = eligibleOpenings.filter((opening) => opening.strategy === 'grid-bay')
  const largeGlazingOpenings = exteriorOpenings.filter(
    (opening) => opening.kind === 'window' && opening.facade === 'primary' && opening.width >= 1.45,
  )
  const courtyardRoom =
    floors[0]?.rooms
      .filter((room) => room.programKey === 'courtyard')
      .sort((left, right) => getRoomArea(right) - getRoomArea(left))[0] ?? null
  const courtyardAreaRatio =
    courtyardRoom && form.width > 0 && form.depth > 0
      ? getRoomArea(courtyardRoom) / (form.width * form.depth)
      : null

  let openingAlignmentScore = layoutHint ? 78 : 72
  if (eligibleOpenings.length > 0) {
    openingAlignmentScore = Math.round(60 + (alignedOpenings.length / eligibleOpenings.length) * 40)
  }
  if (massing.largeGlazing && largeGlazingOpenings.length === 0) {
    openingAlignmentScore -= 8
  }
  openingAlignmentScore = Math.round(clampNumber(openingAlignmentScore, 0, 100))

  const targetClearance = getTargetCirculationClearance(sceneContext)
  const circulationResults = floors.flatMap((floor) =>
    (() => {
      const stairBlockedRectsByRoomKey = getStairBlockedRectsByRoomKey(
        floor.rooms,
        floor.stairs,
        floors[floor.level - 1]?.stairs ?? [],
      )
      return floor.rooms.map((room) => {
        const accessPoints = getRoomAccessPoints(room, floor.walls, floor.openings)
        return analyzeRoomCirculation(
          room,
          floor.items.filter((item) => item.roomKey === room.key),
          targetClearance,
          accessPoints,
          stairBlockedRectsByRoomKey.get(room.key) ?? [],
        )
      })
    })().filter((result): result is NonNullable<ReturnType<typeof analyzeRoomCirculation>> =>
      Boolean(result),
    ),
  )
  const kitchenWorkflowResults = floors.flatMap((floor) =>
    floor.rooms
      .map((room) =>
        analyzeKitchenWorkflow(
          floor.level,
          room,
          floor.items.filter((item) => item.roomKey === room.key),
        ),
      )
      .filter((result): result is NonNullable<ReturnType<typeof analyzeKitchenWorkflow>> =>
        Boolean(result),
      ),
  )
  const bathroomZoningResults = floors.flatMap((floor) =>
    floor.rooms
      .map((room) => {
        const roomItems = floor.items.filter((item) => item.roomKey === room.key)
        return analyzeBathroomZoning(
          floor.level,
          room,
          roomItems,
          getRoomAccessPoints(room, floor.walls, floor.openings),
        )
      })
      .filter((result): result is NonNullable<ReturnType<typeof analyzeBathroomZoning>> =>
        Boolean(result),
      ),
  )
  const livingViewResults = floors.flatMap((floor) =>
    floor.rooms
      .map((room) =>
        analyzeLivingView(
          floor.level,
          room,
          floor.items.filter((item) => item.roomKey === room.key),
        ),
      )
      .filter((result): result is NonNullable<ReturnType<typeof analyzeLivingView>> =>
        Boolean(result),
      ),
  )
  const localStairWalkabilityResults = floors.flatMap((floor) => {
    const upperFloor = floors.find((entry) => entry.level === floor.level + 1) ?? null
    return floor.stairs.map((stair) => analyzeStairWalkability(floor, stair, upperFloor))
  })
  const stairWalkabilityResults = annotateStairVerticalRoutes(floors, localStairWalkabilityResults)

  const averageClearance =
    circulationResults.length > 0
      ? circulationResults.reduce((sum, result) => sum + (result.minBoundaryClearance ?? 0), 0) /
        circulationResults.length
      : null
  const congestedResults = circulationResults.filter(
    (result) =>
      result.score < 72 ||
      (typeof result.minBoundaryClearance === 'number' &&
        result.minBoundaryClearance < targetClearance) ||
      result.overlapCount > 0 ||
      result.boundaryViolationCount > 0 ||
      result.unsupportedCount > 0 ||
      result.blockedFixedZoneCount > 0 ||
      result.blockedAccessCount > 0 ||
      result.blockedDoorSwingCount > 0 ||
      result.useConflictCount > 0,
  )
  const congestedRooms = congestedResults.map((result) => result.roomName)
  const congestedRoomRefs = congestedResults.map((result) => ({
    level: result.level,
    roomKey: result.roomKey,
    roomName: result.roomName,
  }))
  const roomCirculationScore =
    circulationResults.length > 0
      ? Math.round(
          circulationResults.reduce((sum, result) => sum + result.score, 0) /
            circulationResults.length,
        )
      : 88
  const stairWalkabilityScore =
    stairWalkabilityResults.length > 0
      ? Math.round(
          stairWalkabilityResults.reduce((sum, result) => sum + result.score, 0) /
            stairWalkabilityResults.length,
        )
      : null
  const circulationScore =
    typeof stairWalkabilityScore === 'number'
      ? Math.round(roomCirculationScore * 0.72 + stairWalkabilityScore * 0.28)
      : roomCirculationScore
  const kitchenWorkflowScore =
    kitchenWorkflowResults.length > 0
      ? Math.round(
          kitchenWorkflowResults.reduce((sum, result) => sum + result.score, 0) /
            kitchenWorkflowResults.length,
        )
      : null
  const bathroomZoningScore =
    bathroomZoningResults.length > 0
      ? Math.round(
          bathroomZoningResults.reduce((sum, result) => sum + result.score, 0) /
            bathroomZoningResults.length,
        )
      : null
  const livingViewScore =
    livingViewResults.length > 0
      ? Math.round(
          livingViewResults.reduce((sum, result) => sum + result.score, 0) /
            livingViewResults.length,
        )
      : null
  const circulationByRoom = new Map(
    circulationResults.map((result) => [getRoomRefKey(result.level, result.roomKey), result]),
  )
  const kitchenByRoom = new Map(
    kitchenWorkflowResults.map((result) => [getRoomRefKey(result.level, result.roomKey), result]),
  )
  const bathroomByRoom = new Map(
    bathroomZoningResults.map((result) => [getRoomRefKey(result.level, result.roomKey), result]),
  )
  const livingByRoom = new Map(
    livingViewResults.map((result) => [getRoomRefKey(result.level, result.roomKey), result]),
  )
  const roomDiagnostics = floors
    .flatMap((floor) =>
      floor.rooms.map((room) => {
        const roomRefKey = getRoomRefKey(floor.level, room.key)
        const circulation = circulationByRoom.get(roomRefKey)
        const kitchen = kitchenByRoom.get(roomRefKey)
        const bathroom = bathroomByRoom.get(roomRefKey)
        const living = livingByRoom.get(roomRefKey)
        const stairDepartureResults = stairWalkabilityResults.filter(
          (result) => result.level === floor.level && result.roomKey === room.key,
        )
        const stairArrivalResults = stairWalkabilityResults.filter(
          (result) =>
            result.endArrivalRoomRef?.level === floor.level &&
            result.endArrivalRoomRef.roomKey === room.key,
        )
        const warnings: string[] = []
        const highlights: string[] = []
        const scoreParts = [
          circulation?.score,
          kitchen?.score,
          bathroom?.score,
          living?.score,
          ...stairDepartureResults.map((result) => result.score),
          ...stairArrivalResults.map((result) => result.score),
        ].filter((value): value is number => typeof value === 'number')

        if (circulation) {
          if (
            typeof circulation.minBoundaryClearance === 'number' &&
            circulation.minBoundaryClearance < targetClearance
          ) {
            warnings.push(
              language === 'zh-CN'
                ? `净距约 ${circulation.minBoundaryClearance.toFixed(1)}m，低于当前建议。`
                : `Clearance is about ${circulation.minBoundaryClearance.toFixed(1)}m, below the current target.`,
            )
          } else if (
            typeof circulation.minBoundaryClearance === 'number' &&
            circulation.minBoundaryClearance >= targetClearance + 0.12
          ) {
            highlights.push(
              language === 'zh-CN'
                ? `净距约 ${circulation.minBoundaryClearance.toFixed(1)}m，日常通行更从容。`
                : `Clearance stays around ${circulation.minBoundaryClearance.toFixed(1)}m for easier movement.`,
            )
          }

          if (circulation.overlapCount > 0) {
            warnings.push(
              language === 'zh-CN'
                ? '家具之间仍有挤占。'
                : 'Furniture still overlaps or crowds together.',
            )
          }
          if (circulation.boundaryViolationCount > 0) {
            warnings.push(
              language === 'zh-CN'
                ? '有家具贴墙或越界。'
                : 'Some furniture still presses against the room edge.',
            )
          }
          if (circulation.blockedAccessCount > 0) {
            warnings.push(
              language === 'zh-CN'
                ? '门口或主通行带被占用。'
                : 'The doorway or main access band is blocked.',
            )
          }
          if (circulation.blockedFixedZoneCount > 0) {
            warnings.push(
              language === 'zh-CN'
                ? '楼梯口或楼板开洞缓冲区被家具占了。'
                : 'Furniture is encroaching on the stair landing or slab opening buffer.',
            )
          }
          if (circulation.blockedDoorSwingCount > 0) {
            warnings.push(
              language === 'zh-CN'
                ? '门扇开启范围不够完整。'
                : 'The door swing still lacks a clear opening arc.',
            )
          }
          if (circulation.useConflictCount > 0) {
            warnings.push(
              language === 'zh-CN'
                ? '下床、站立或就座空间被占用。'
                : 'Bedside, standing, or seating space is still obstructed.',
            )
          }
          if (circulation.unsupportedCount > 0) {
            warnings.push(
              language === 'zh-CN'
                ? '部分设备缺少可靠支撑面。'
                : 'Some fixtures still lack proper support surfaces.',
            )
          }
        }

        if (kitchen) {
          if (kitchen.score >= 82) {
            highlights.push(
              language === 'zh-CN'
                ? '取、备、烹之间的操作带更连贯。'
                : 'The kitchen workflow from storage to prep to cooking feels continuous.',
            )
          } else if (kitchen.score < 72) {
            warnings.push(
              language === 'zh-CN'
                ? '冰箱、备餐和灶位之间的顺序还不够顺手。'
                : 'The fridge, prep zone, and cooktop sequence still feels awkward.',
            )
          }
        }

        if (bathroom) {
          if (bathroom.score >= 82) {
            highlights.push(
              language === 'zh-CN'
                ? '干湿分区和入口关系比较清晰。'
                : 'Wet and dry zones stay clearer relative to the entry.',
            )
          } else if (bathroom.score < 72) {
            warnings.push(
              language === 'zh-CN'
                ? '湿区离入口偏近，干湿分区不够清晰。'
                : 'The wet zone still sits too close to the entry and blurs the dry zone.',
            )
          }
        }

        if (living) {
          if (living.score >= 84) {
            highlights.push(
              language === 'zh-CN'
                ? '沙发与屏幕的观看距离和朝向更自然。'
                : 'The sofa and screen keep a more natural viewing relationship.',
            )
          } else if (living.score < 74) {
            warnings.push(
              language === 'zh-CN'
                ? '沙发朝向、距离或视线带还可以继续优化。'
                : 'Sofa orientation, distance, or sightline to the screen can still improve.',
            )
          }
        }

        for (const stairResult of stairDepartureResults) {
          if (stairResult.geometryIssue) {
            warnings.push(
              language === 'zh-CN'
                ? `楼梯踏步约 ${stairResult.minTreadDepth.toFixed(2)}m / ${stairResult.maxRiserHeight.toFixed(2)}m，坡度约 ${stairResult.maxPitchDegrees.toFixed(0)}°，走感还不够自然。`
                : `The stair still feels awkward to walk, with about ${stairResult.minTreadDepth.toFixed(2)}m tread, ${stairResult.maxRiserHeight.toFixed(2)}m riser, and a ${stairResult.maxPitchDegrees.toFixed(0)} degree pitch.`,
            )
          } else if (stairResult.arrivalIssue) {
            warnings.push(
              language === 'zh-CN'
                ? '楼梯的起落口和周边流线还不够顺，容易撞到门位或直接落进不合适的房间。'
                : 'The stair landing still collides with door zones or arrives in an awkward room sequence.',
            )
          } else if (stairResult.wallCollisionIssue) {
            warnings.push(
              language === 'zh-CN'
                ? '楼梯本体或起步通行带被实体墙挡住，人在真实空间里无法通过。'
                : 'The stair body or lower walking route crosses a solid wall, so it is physically blocked.',
            )
          } else if (stairResult.verticalRouteIssue) {
            warnings.push(
              language === 'zh-CN'
                ? '楼梯没有接上连续的人行动线，入口、楼梯和上层到达区之间还有断点。'
                : 'The stair is not connected into a continuous human route from entry to the upper arrival zone.',
            )
          } else if (stairResult.score >= 84) {
            highlights.push(
              language === 'zh-CN'
                ? '楼梯踏步比例和落脚方向更接近日常使用习惯。'
                : 'The stair now keeps a more natural step rhythm and landing direction.',
            )
          }
        }

        for (const stairResult of stairArrivalResults) {
          if (stairResult.arrivalIssue) {
            warnings.push(
              language === 'zh-CN'
                ? '上楼到达区还不够顺，楼梯出口和房间用途的关系需要继续调整。'
                : 'The upstairs arrival sequence still needs work so the stair does not spill into an awkward destination room.',
            )
          } else if (stairResult.wallCollisionIssue) {
            warnings.push(
              language === 'zh-CN'
                ? '上楼到达通行带被实体墙挡住，不能按真实人行动线通过。'
                : 'The upper arrival walking route is blocked by a solid wall.',
            )
          } else if (stairResult.verticalRouteIssue) {
            warnings.push(
              language === 'zh-CN'
                ? '上楼后没有形成连续公共动线，容易变成“楼梯到这儿就断了”。'
                : 'The upstairs route still breaks after the stair arrival instead of continuing into usable rooms.',
            )
          } else if (stairResult.score >= 84) {
            highlights.push(
              language === 'zh-CN'
                ? '上楼到达区比较顺，出口不会直接打断主要使用空间。'
                : 'The upstairs arrival zone now lands more cleanly without interrupting the main usable space.',
            )
          }
        }

        const score =
          scoreParts.length > 0
            ? Math.round(scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length)
            : 88

        return {
          level: floor.level,
          roomKey: room.key,
          roomName: room.name,
          score,
          status: getRoomDiagnosticStatus(score, warnings.length),
          optimized: false,
          minBoundaryClearance: circulation?.minBoundaryClearance ?? null,
          focusRefs: dedupeDiagnosticFocusRefs([
            ...(circulation?.focusRefs ?? []),
            ...(kitchen?.focusRefs ?? []),
            ...(bathroom?.focusRefs ?? []),
            ...(living?.focusRefs ?? []),
          ]),
          warnings: dedupeTextEntries(warnings),
          highlights: dedupeTextEntries(highlights),
        } satisfies AiBuildingRoomDiagnostic
      }),
    )
    .sort((left, right) => {
      const severity = { bad: 0, warn: 1, good: 2 } satisfies Record<
        AiBuildingRoomDiagnostic['status'],
        number
      >
      if (severity[left.status] !== severity[right.status]) {
        return severity[left.status] - severity[right.status]
      }
      if (left.score !== right.score) return left.score - right.score
      return left.level - right.level
    })
  let courtyardAdjustment = 0
  let kitchenAdjustment = 0
  let bathroomAdjustment = 0
  let livingAdjustment = 0
  const highlights: string[] = []
  const warnings: string[] = []
  const stairIssueResults = stairWalkabilityResults.filter(
    (result) =>
      result.score < 80 ||
      result.geometryIssue ||
      result.wallCollisionIssue ||
      result.arrivalIssue ||
      result.verticalRouteIssue,
  )
  const stairGeometryIssueResults = stairIssueResults.filter((result) => result.geometryIssue)
  const stairWallIssueResults = stairIssueResults.filter((result) => result.wallCollisionIssue)
  const stairArrivalIssueResults = stairIssueResults.filter((result) => result.arrivalIssue)
  const stairRouteIssueResults = stairIssueResults.filter((result) => result.verticalRouteIssue)

  if (massing.courtyard) {
    if (!courtyardRoom || courtyardAreaRatio === null) {
      courtyardAdjustment -= 12
      warnings.push(
        language === 'zh-CN'
          ? '当前方案缺少可识别的中心庭院，未完全响应庭院型需求。'
          : 'The current plan does not form a clear central courtyard despite the courtyard request.',
      )
    } else if (courtyardAreaRatio >= 0.12 && courtyardAreaRatio <= 0.34) {
      courtyardAdjustment += 6
      highlights.push(
        language === 'zh-CN'
          ? `中心庭院占首层约 ${(courtyardAreaRatio * 100).toFixed(0)}%，比例适合采光与围合。`
          : `The central courtyard covers about ${(courtyardAreaRatio * 100).toFixed(0)}% of level one, keeping a usable balance of light and enclosure.`,
      )
    } else {
      courtyardAdjustment -= 5
      warnings.push(
        language === 'zh-CN'
          ? `中心庭院占首层约 ${(courtyardAreaRatio * 100).toFixed(0)}%，比例还可以继续优化。`
          : `The central courtyard is about ${(courtyardAreaRatio * 100).toFixed(0)}% of level one, so its proportion could be tuned further.`,
      )
    }
  }

  if (typeof kitchenWorkflowScore === 'number') {
    if (kitchenWorkflowScore >= 82) kitchenAdjustment += 4
    else if (kitchenWorkflowScore < 62) kitchenAdjustment -= 6
    else if (kitchenWorkflowScore < 72) kitchenAdjustment -= 3
  }

  if (typeof bathroomZoningScore === 'number') {
    if (bathroomZoningScore >= 82) bathroomAdjustment += 4
    else if (bathroomZoningScore < 62) bathroomAdjustment -= 6
    else if (bathroomZoningScore < 72) bathroomAdjustment -= 3
  }

  if (typeof livingViewScore === 'number') {
    if (livingViewScore >= 84) livingAdjustment += 4
    else if (livingViewScore < 64) livingAdjustment -= 6
    else if (livingViewScore < 74) livingAdjustment -= 3
  }

  const overall = Math.round(
    clampNumber(
      openingAlignmentScore * 0.45 +
        circulationScore * 0.55 +
        courtyardAdjustment +
        kitchenAdjustment +
        bathroomAdjustment +
        livingAdjustment,
      0,
      100,
    ),
  )

  if (alignedOpenings.length > 0) {
    highlights.push(
      language === 'zh-CN'
        ? `有 ${alignedOpenings.length} 处外部开洞按主轴网分跨对齐。`
        : `${alignedOpenings.length} exterior openings align to the primary grid bays.`,
    )
  }

  if (largeGlazingOpenings.length > 0) {
    highlights.push(
      language === 'zh-CN'
        ? `主立面保留了 ${largeGlazingOpenings.length} 处大开窗。`
        : `${largeGlazingOpenings.length} larger openings are kept on the primary facade.`,
    )
  }

  if (typeof averageClearance === 'number' && averageClearance >= 0.7) {
    highlights.push(
      language === 'zh-CN'
        ? `主要房间平均通行余量约 ${averageClearance.toFixed(1)}m。`
        : `Average clearance stays around ${averageClearance.toFixed(1)}m across key rooms.`,
    )
  }

  if (typeof kitchenWorkflowScore === 'number') {
    if (kitchenWorkflowScore >= 82) {
      highlights.push(
        language === 'zh-CN'
          ? '厨房主要设备之间保留了连续操作带。'
          : 'Kitchen equipment keeps a continuous working band.',
      )
    } else {
      warnings.push(
        language === 'zh-CN'
          ? '部分厨房的冰箱与操作台距离或通路仍不够顺手。'
          : 'Some kitchens still have awkward spacing or blocked travel between the fridge and work counter.',
      )
    }
  }

  if (typeof bathroomZoningScore === 'number') {
    if (bathroomZoningScore >= 82) {
      highlights.push(
        language === 'zh-CN'
          ? '卫生间干湿区和入口关系比较顺手。'
          : 'Bathroom wet and dry zones stay organized relative to the entry.',
      )
    } else {
      warnings.push(
        language === 'zh-CN'
          ? '部分卫生间的干湿分区还不够清晰，湿区离入口偏近。'
          : 'Some bathrooms still blur the wet and dry zones too close to the entry.',
      )
    }
  }

  if (typeof livingViewScore === 'number') {
    if (livingViewScore >= 84) {
      highlights.push(
        language === 'zh-CN'
          ? '客厅沙发和电视保持了更自然的观看距离与朝向。'
          : 'The living room keeps a more natural viewing distance and orientation to the screen.',
      )
    } else {
      warnings.push(
        language === 'zh-CN'
          ? '部分客厅的沙发朝向或电视观看距离还可以继续优化。'
          : 'Some living rooms still need better sofa orientation or viewing distance to the screen.',
      )
    }
  }

  if (typeof stairWalkabilityScore === 'number') {
    if (stairWalkabilityScore >= 84) {
      highlights.push(
        language === 'zh-CN'
          ? '楼梯踏步比例、坡度和上下楼出口更接近日常使用常识。'
          : 'The stair step rhythm, pitch, and upper/lower landings now track a more realistic walking route.',
      )
    } else {
      warnings.push(
        language === 'zh-CN'
          ? `楼梯通行舒适度均分约 ${stairWalkabilityScore}，还需要继续压低陡度并理顺上下楼出口。`
          : `Stair walkability averages about ${stairWalkabilityScore}, so the pitch and arrival sequence still need work.`,
      )
    }
  }

  if (sceneContext?.analysis.primaryGrid?.averageSpacing && typeof averageClearance === 'number') {
    const message =
      averageClearance >= targetClearance
        ? language === 'zh-CN'
          ? `已按测量轴网推导的约 ${targetClearance.toFixed(1)}m 净距控制主要家具摆位。`
          : `Furniture spacing tracks the measured grid with an inferred clearance target of about ${targetClearance.toFixed(1)}m.`
        : language === 'zh-CN'
          ? `当前平均净距约 ${averageClearance.toFixed(1)}m，低于测量轴网建议的 ${targetClearance.toFixed(1)}m。`
          : `Average clearance is about ${averageClearance.toFixed(1)}m, below the ${targetClearance.toFixed(1)}m target inferred from the measured grid.`

    if (averageClearance >= targetClearance) highlights.push(message)
    else warnings.push(message)
  }

  if (
    layoutHint &&
    eligibleOpenings.length > 0 &&
    alignedOpenings.length < eligibleOpenings.length
  ) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${eligibleOpenings.length - alignedOpenings.length} 处开洞未完全贴合主轴网分跨。`
        : `${eligibleOpenings.length - alignedOpenings.length} openings still fall outside the preferred grid bays.`,
    )
  }

  if (congestedRooms.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `通行偏紧的房间：${congestedRooms.slice(0, 3).join(' / ')}。`
        : `Rooms with tighter circulation: ${congestedRooms.slice(0, 3).join(' / ')}.`,
    )
  }

  const boundaryIssueRooms = congestedResults
    .filter((result) => result.boundaryViolationCount > 0)
    .map((result) => result.roomName)
  if (boundaryIssueRooms.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${boundaryIssueRooms.slice(0, 2).join(' / ')} 的家具贴墙或越界，需要继续压缩。`
        : `Furniture still presses against or crosses the room edge in ${boundaryIssueRooms.slice(0, 2).join(' / ')}.`,
    )
  }

  const overlapIssueRooms = congestedResults
    .filter((result) => result.overlapCount > 0)
    .map((result) => result.roomName)
  if (overlapIssueRooms.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${overlapIssueRooms.slice(0, 2).join(' / ')} 存在家具互相挤占，需要继续重排。`
        : `Furniture still crowds into each other in ${overlapIssueRooms.slice(0, 2).join(' / ')}.`,
    )
  }

  const lowClearanceRooms = congestedResults
    .filter(
      (result) =>
        typeof result.minBoundaryClearance === 'number' &&
        result.minBoundaryClearance < targetClearance,
    )
    .map((result) => result.roomName)
  if (lowClearanceRooms.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${lowClearanceRooms.slice(0, 2).join(' / ')} 的使用净距低于当前测量建议。`
        : `Usable clearance still falls below the measured target in ${lowClearanceRooms.slice(0, 2).join(' / ')}.`,
    )
  }

  const blockedAccessRooms = congestedResults
    .filter((result) => result.blockedAccessCount > 0)
    .map((result) => result.roomName)
  if (blockedAccessRooms.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${blockedAccessRooms.slice(0, 2).join(' / ')} 的门口或主通行带被家具占用。`
        : `Furniture still blocks the doorway or main access band in ${blockedAccessRooms.slice(0, 2).join(' / ')}.`,
    )
  }

  const blockedDoorRooms = congestedResults
    .filter((result) => result.blockedDoorSwingCount > 0)
    .map((result) => result.roomName)
  if (blockedDoorRooms.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${blockedDoorRooms.slice(0, 2).join(' / ')} 的门扇开启范围被家具占用。`
        : `Furniture still occupies the door swing envelope in ${blockedDoorRooms.slice(0, 2).join(' / ')}.`,
    )
  }

  const blockedUseRooms = congestedResults
    .filter((result) => result.useConflictCount > 0)
    .map((result) => result.roomName)
  if (blockedUseRooms.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${blockedUseRooms.slice(0, 2).join(' / ')} 的下床、站立或就座空间被占用。`
        : `Everyday use envelopes are still blocked in ${blockedUseRooms.slice(0, 2).join(' / ')}.`,
    )
  }

  if (stairGeometryIssueResults.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${stairGeometryIssueResults.slice(0, 2).map((result) => result.roomName).join(' / ')} 的楼梯踏步比例或坡度偏硬。`
        : `Stairs in ${stairGeometryIssueResults.slice(0, 2).map((result) => result.roomName).join(' / ')} still feel too steep or short-stepped.`,
    )
  }

  if (stairWallIssueResults.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${stairWallIssueResults.slice(0, 2).map((result) => result.roomName).join(' / ')} 的楼梯或通行带穿过实体墙。`
        : `Stairs in ${stairWallIssueResults.slice(0, 2).map((result) => result.roomName).join(' / ')} still cross a solid wall.`,
    )
  }

  if (stairArrivalIssueResults.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${stairArrivalIssueResults
            .slice(0, 2)
            .map((result) => result.endArrivalRoomRef?.roomName ?? result.roomName)
            .join(' / ')} 的上下楼出口关系不顺。`
        : `The stair arrival sequence still lands awkwardly in ${stairArrivalIssueResults
            .slice(0, 2)
            .map((result) => result.endArrivalRoomRef?.roomName ?? result.roomName)
            .join(' / ')}.`,
    )
  }

  if (stairRouteIssueResults.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `仍有 ${stairRouteIssueResults.slice(0, 2).map((result) => result.roomName).join(' / ')} 的楼梯没有接成连续跨楼层动线。`
        : `Stairs in ${stairRouteIssueResults.slice(0, 2).map((result) => result.roomName).join(' / ')} are not connected into a continuous cross-floor route.`,
    )
  }

  const unsupportedRooms = congestedResults
    .filter((result) => result.unsupportedCount > 0)
    .map((result) => result.roomName)
  if (unsupportedRooms.length > 0) {
    warnings.push(
      language === 'zh-CN'
        ? `部分厨房设备没有可靠台面支撑：${unsupportedRooms.slice(0, 2).join(' / ')}。`
        : `Some kitchen fixtures still lack countertop support in ${unsupportedRooms.slice(0, 2).join(' / ')}.`,
    )
  }

  const ruleGuidance = createPlanRuleGuidance(
    floors,
    form,
    sceneContext,
    targetClearance,
    circulationResults,
    kitchenWorkflowResults,
    bathroomZoningResults,
    stairWalkabilityResults,
  )
  const rules = ruleGuidance
    ? {
        ...ruleGuidance,
        repairSummaries: createRuleRepairSummaries(ruleGuidance, language, null, roomDiagnostics),
      }
    : null

  if (rules) {
    const guidanceMessage =
      language === 'zh-CN'
        ? rules.passed
          ? `人居规则闸门通过，当前综合得分 ${rules.totalScore}/${rules.maxScore}。`
          : `人居规则闸门拦截 ${rules.hardFailureCount} 项硬问题，当前综合得分 ${rules.totalScore}/${rules.maxScore}。`
        : rules.passed
          ? `Residential rule gate passed at ${rules.totalScore}/${rules.maxScore}.`
          : `Residential rule gate found ${rules.hardFailureCount} hard issues at ${rules.totalScore}/${rules.maxScore}.`
    const fengShuiSummaryMessage = createFengShuiAdvisorySummaryMessage(rules, language)

    if (rules.passed) highlights.unshift(guidanceMessage)
    else warnings.unshift(guidanceMessage)

    if (fengShuiSummaryMessage && !warnings.includes(fengShuiSummaryMessage)) {
      warnings.push(fengShuiSummaryMessage)
    }
  }

  return {
    scores: {
      overall,
      openingAlignment: openingAlignmentScore,
      circulation: circulationScore,
    },
    selection: {
      candidateCount: 1,
      openingBias: 'balanced',
      furnishingBias: 'layered',
    },
    openingStrategy: {
      gridDirected: Boolean(layoutHint),
      alignedOpenings: alignedOpenings.length,
      eligibleOpenings: eligibleOpenings.length,
      largeGlazingOpenings: largeGlazingOpenings.length,
    },
    circulation: {
      totalItems: floors.reduce((sum, floor) => sum + floor.items.length, 0),
      averageClearance,
      congestedRooms,
      congestedRoomRefs,
    },
    optimization: null,
    rules,
    repairSummaries: rules?.repairSummaries ?? [],
    roomDiagnostics,
    highlights,
    warnings,
  }
}

function isBedroomLikeProgram(programKey?: string) {
  return programKey === 'bedroom' || programKey === 'primary_bedroom'
}

function isRoomItemOptimizationRelevant(room: AiBuildingRoomPlan) {
  return !(
    isEntryLikeProgram(room.programKey) ||
    room.programKey === 'corridor' ||
    room.programKey === 'stairs' ||
    room.programKey === 'elevator' ||
    room.programKey === 'balcony' ||
    room.programKey === 'courtyard'
  )
}

function getPrimaryFloorLevel(floors: AiBuildingFloorPlan[]) {
  return floors.reduce((minimum, floor) => Math.min(minimum, floor.level), floors[0]?.level ?? 0)
}

function findPlanRoomByRef(
  floors: AiBuildingFloorPlan[],
  roomRef: AiBuildingRoomRef,
): {
  level: number
  room: AiBuildingRoomPlan
} | null {
  const floor = floors.find((entry) => entry.level === roomRef.level)
  const room = floor?.rooms.find((entry) => entry.key === roomRef.roomKey)
  if (!floor || !room) return null
  return {
    level: floor.level,
    room,
  }
}

function createPlanRoomRef(level: number, room: AiBuildingRoomPlan): AiBuildingRoomRef {
  return {
    level,
    roomKey: room.key,
    roomName: room.name,
  }
}

function isRoomReflowEligibleIssueCode(code: AiAnalysisIssueCode) {
  return (
    code === 'ACCESSIBLE_ENTRY_REQUIRED' ||
    code === 'AGING_PATH_UNSAFE' ||
    code === 'ENTRY_NO_BUFFER' ||
    code === 'TOILET_EXPOSED_TO_PUBLIC_VIEW' ||
    code === 'DOOR_SWING_COLLISION' ||
    code === 'BEDROOM_FURNITURE_IMPOSSIBLE' ||
    code === 'KITCHEN_WORKFLOW_BROKEN' ||
    code === 'DINING_PULL_OUT_BLOCKED' ||
    code === 'STORAGE_MISSING' ||
    code === 'LAUNDRY_DRYING_CONFLICT' ||
    code === 'WORKFLOW_SUPPORT_MISSING' ||
    code === 'ITEM_CLEARANCE_BELOW_MIN' ||
    code === 'CIRCULATION_WIDTH_BELOW_MIN' ||
    code === 'ITEM_PLACEMENT_INVALID'
  )
}

function getCongestedRoomOptimizationPreference(room: AiBuildingRoomPlan) {
  if (
    isKitchenLikeProgram(room.programKey) ||
    isBathroomProgram(room.programKey) ||
    isBedroomLikeProgram(room.programKey)
  ) {
    return {
      placementMode: 'perimeter' as const,
      density: 'compact' as const,
    }
  }

  return {
    placementMode: 'entry-clear' as const,
    density: 'compact' as const,
  }
}

function getIssueDrivenRoomOptimizationPreference(
  room: AiBuildingRoomPlan,
  code: AiAnalysisIssueCode,
) {
  if (
    code === 'ENTRY_NO_BUFFER' ||
    code === 'ACCESSIBLE_ENTRY_REQUIRED' ||
    code === 'AGING_PATH_UNSAFE'
  ) {
    return {
      placementMode: isBathroomProgram(room.programKey)
        ? ('perimeter' as const)
        : ('entry-clear' as const),
      density: 'compact' as const,
    }
  }

  if (code === 'TOILET_EXPOSED_TO_PUBLIC_VIEW') {
    return {
      placementMode: isBathroomProgram(room.programKey)
        ? ('perimeter' as const)
        : ('entry-clear' as const),
      density: 'compact' as const,
    }
  }

  if (
    code === 'KITCHEN_WORKFLOW_BROKEN' ||
    code === 'DINING_PULL_OUT_BLOCKED' ||
    code === 'WORKFLOW_SUPPORT_MISSING' ||
    code === 'STORAGE_MISSING' ||
    code === 'LAUNDRY_DRYING_CONFLICT'
  ) {
    return {
      placementMode: isLivingOrDiningProgram(room.programKey)
        ? ('entry-clear' as const)
        : ('perimeter' as const),
      density: 'compact' as const,
    }
  }

  if (code === 'BEDROOM_FURNITURE_IMPOSSIBLE') {
    return {
      placementMode: 'perimeter' as const,
      density: 'compact' as const,
    }
  }

  if (
    code === 'DOOR_SWING_COLLISION' ||
    code === 'ITEM_CLEARANCE_BELOW_MIN' ||
    code === 'CIRCULATION_WIDTH_BELOW_MIN' ||
    code === 'ITEM_PLACEMENT_INVALID'
  ) {
    return {
      placementMode:
        isKitchenLikeProgram(room.programKey) ||
        isBathroomProgram(room.programKey) ||
        isBedroomLikeProgram(room.programKey)
          ? ('perimeter' as const)
          : ('entry-clear' as const),
      density: 'compact' as const,
    }
  }

  return {
    placementMode: 'balanced' as const,
    density: 'default' as const,
  }
}

function getPlacementModePreferenceScore(
  programKey: string | undefined,
  mode: AiBuildingPlacementMode,
) {
  if (mode === 'balanced') return 0

  const prefersPerimeter =
    isKitchenLikeProgram(programKey) ||
    isBathroomProgram(programKey) ||
    isBedroomLikeProgram(programKey)

  if (mode === 'perimeter') return prefersPerimeter ? 3 : 1
  return prefersPerimeter ? 2 : 3
}

function mergeOptimizationPlacementMode(
  programKey: string | undefined,
  currentMode: AiBuildingPlacementMode,
  nextMode: AiBuildingPlacementMode,
) {
  return getPlacementModePreferenceScore(programKey, nextMode) >
    getPlacementModePreferenceScore(programKey, currentMode)
    ? nextMode
    : currentMode
}

function expandIssueOptimizationRooms(
  floors: AiBuildingFloorPlan[],
  roomRefs: AiBuildingRoomRef[],
  code: AiAnalysisIssueCode,
) {
  const directRooms = roomRefs
    .map((roomRef) => findPlanRoomByRef(floors, roomRef))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  const levelFilter =
    directRooms.length > 0 ? new Set(directRooms.map((entry) => entry.level)) : null
  const fallbackPrimaryLevel = getPrimaryFloorLevel(floors)

  const matchingRooms = (predicate: (room: AiBuildingRoomPlan, level: number) => boolean) =>
    floors.flatMap((floor) => {
      if (levelFilter && !levelFilter.has(floor.level)) return []
      if (!levelFilter && floor.level !== fallbackPrimaryLevel && code === 'AGING_PATH_UNSAFE') {
        return []
      }

      return floor.rooms
        .filter((room) => isRoomItemOptimizationRelevant(room) && predicate(room, floor.level))
        .map((room) => ({
          level: floor.level,
          room,
        }))
    })

  const relatedRooms = [...directRooms]
  const appendRooms = (entries: Array<{ level: number; room: AiBuildingRoomPlan }>) => {
    relatedRooms.push(...entries)
  }

  if (code === 'ENTRY_NO_BUFFER' || code === 'ACCESSIBLE_ENTRY_REQUIRED') {
    appendRooms(
      matchingRooms(
        (room) => isLivingOrDiningProgram(room.programKey) || isKitchenLikeProgram(room.programKey),
      ),
    )
  } else if (code === 'TOILET_EXPOSED_TO_PUBLIC_VIEW') {
    appendRooms(
      matchingRooms(
        (room) => isBathroomProgram(room.programKey) || isLivingOrDiningProgram(room.programKey),
      ),
    )
  } else if (code === 'AGING_PATH_UNSAFE') {
    appendRooms(
      matchingRooms(
        (room) =>
          isBathroomProgram(room.programKey) ||
          isLivingOrDiningProgram(room.programKey) ||
          isBedroomLikeProgram(room.programKey),
      ),
    )
  } else if (
    code === 'KITCHEN_WORKFLOW_BROKEN' ||
    code === 'DINING_PULL_OUT_BLOCKED' ||
    code === 'WORKFLOW_SUPPORT_MISSING' ||
    code === 'STORAGE_MISSING' ||
    code === 'LAUNDRY_DRYING_CONFLICT'
  ) {
    appendRooms(
      matchingRooms(
        (room) => isKitchenLikeProgram(room.programKey) || isLivingOrDiningProgram(room.programKey),
      ),
    )
  } else if (code === 'BEDROOM_FURNITURE_IMPOSSIBLE') {
    appendRooms(matchingRooms((room) => isBedroomLikeProgram(room.programKey)))
  }

  const seen = new Set<string>()
  return relatedRooms.filter((entry) => {
    if (!isRoomItemOptimizationRelevant(entry.room)) return false
    const key = getRoomRefKey(entry.level, entry.room.key)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function upsertOptimizationRoomProfile(
  profiles: Map<string, AiBuildingOptimizationRoomProfile>,
  level: number,
  room: AiBuildingRoomPlan,
  placementMode: AiBuildingPlacementMode,
  density: AiBuildingFurnishingDensity,
  issueCode: AiAnalysisIssueCode | null,
) {
  const roomId = getRoomRefKey(level, room.key)
  const existing = profiles.get(roomId)
  const roomRef = createPlanRoomRef(level, room)

  if (!existing) {
    profiles.set(roomId, {
      ...roomRef,
      roomId,
      placementMode,
      density,
      issueCodes: issueCode ? [issueCode] : [],
    })
    return
  }

  existing.placementMode = mergeOptimizationPlacementMode(
    room.programKey,
    existing.placementMode,
    placementMode,
  )
  existing.density = existing.density === 'compact' || density === 'compact' ? 'compact' : 'default'
  if (issueCode && !existing.issueCodes.includes(issueCode)) {
    existing.issueCodes.push(issueCode)
  }
}

function getPlanOptimizationProfiles(
  floors: AiBuildingFloorPlan[],
  analysis: AiBuildingPlanAnalysis,
) {
  const profiles = new Map<string, AiBuildingOptimizationRoomProfile>()

  for (const roomRef of analysis.circulation.congestedRoomRefs) {
    const roomEntry = findPlanRoomByRef(floors, roomRef)
    if (!roomEntry || !isRoomItemOptimizationRelevant(roomEntry.room)) continue
    const preference = getCongestedRoomOptimizationPreference(roomEntry.room)
    upsertOptimizationRoomProfile(
      profiles,
      roomEntry.level,
      roomEntry.room,
      preference.placementMode,
      preference.density,
      null,
    )
  }

  let hasRuleDrivenTargets = false
  const addIssueProfiles = (code: AiAnalysisIssueCode, roomRefs: AiBuildingRoomRef[]) => {
    if (!isRoomReflowEligibleIssueCode(code)) return

    const relatedRooms = expandIssueOptimizationRooms(floors, roomRefs, code)
    if (relatedRooms.length === 0) return
    hasRuleDrivenTargets = true

    for (const roomEntry of relatedRooms) {
      const preference = getIssueDrivenRoomOptimizationPreference(roomEntry.room, code)
      upsertOptimizationRoomProfile(
        profiles,
        roomEntry.level,
        roomEntry.room,
        preference.placementMode,
        preference.density,
        code,
      )
    }
  }

  if (analysis.rules) {
    for (const violation of analysis.rules.violationSummaries) {
      addIssueProfiles(violation.code, violation.roomRefs)
    }

    for (const advisory of analysis.rules.fengShuiAdvisories) {
      const issueCodes = Array.from(
        new Set(advisory.relatedIssueCodes.filter((code) => isRoomReflowEligibleIssueCode(code))),
      )
      for (const code of issueCodes) {
        addIssueProfiles(code, advisory.roomRefs)
      }
    }
  }

  const roomProfiles = [...profiles.values()].sort((left, right) => {
    if (right.issueCodes.length !== left.issueCodes.length) {
      return right.issueCodes.length - left.issueCodes.length
    }
    if (left.density !== right.density) {
      return left.density === 'compact' ? -1 : 1
    }
    return left.level - right.level
  })

  return {
    profiles,
    roomRefs: roomProfiles.map(
      ({
        roomId: _roomId,
        placementMode: _placementMode,
        density: _density,
        issueCodes: _issueCodes,
        ...roomRef
      }) => roomRef,
    ),
    hasRuleDrivenTargets,
  }
}

function optimizeFloorsForAnalysis(
  floors: AiBuildingFloorPlan[],
  analysis: AiBuildingPlanAnalysis,
  form: AiBuildingFormState,
  language: AiBuildingLanguage,
  sceneContext?: SceneContext | null,
) {
  const maxPasses = 3
  let currentFloors = floors
  let currentAnalysis = analysis
  const optimizationSteps: AiBuildingOptimizationStep[] = []
  const optimizedRoomRefs = new Map<string, AiBuildingRoomRef>()

  for (let passIndex = 0; passIndex < maxPasses; passIndex += 1) {
    const optimizationProfiles = getPlanOptimizationProfiles(currentFloors, currentAnalysis)
    if (optimizationProfiles.roomRefs.length === 0) break

    const layoutHint = getSceneGridLayoutHint(sceneContext)
    const intent = inferFeatureIntent(form)
    const targetRoomIds = new Set(
      optimizationProfiles.roomRefs.map((entry) => getRoomRefKey(entry.level, entry.roomKey)),
    )
    const furnishingVariants: Array<{
      key: string
      density: AiBuildingFurnishingDensity
      placementMode: AiBuildingPlacementMode
      forceCompactProfiles?: boolean
    }> = [
      ...(optimizationProfiles.hasRuleDrivenTargets
        ? [
            {
              key: 'rule-targeted',
              density: 'default' as const,
              placementMode: 'balanced' as const,
            },
            {
              key: 'rule-targeted-compact',
              density: 'compact' as const,
              placementMode: 'balanced' as const,
              forceCompactProfiles: true,
            },
          ]
        : []),
      { key: 'compact-balanced', density: 'compact', placementMode: 'balanced' },
      { key: 'compact-entry-clear', density: 'compact', placementMode: 'entry-clear' },
      { key: 'compact-perimeter', density: 'compact', placementMode: 'perimeter' },
      { key: 'default-entry-clear', density: 'default', placementMode: 'entry-clear' },
    ]

    let bestFloors = currentFloors
    let bestAnalysis = currentAnalysis
    let bestVariant: string | null = null

    for (const variant of furnishingVariants) {
      const nextFloors = currentFloors.map((floor) => {
        const outdoorItems = floor.items.filter((item) => !item.roomKey)
        const preservedRoomItems = floor.items.filter(
          (item) => item.roomKey && !targetRoomIds.has(`${floor.level}:${item.roomKey}`),
        )
        const roomAccessPointsByKey = new Map(
          floor.rooms.map((room) => [
            room.key,
            getRoomAccessPoints(room, floor.walls, floor.openings),
          ]),
        )
        const stairBlockedRectsByRoomKey = getStairBlockedRectsByRoomKey(
          floor.rooms,
          floor.stairs,
          currentFloors[floor.level - 1]?.stairs ?? [],
        )
        const replacedRoomItems = floor.rooms.flatMap((room) => {
          const roomId = getRoomRefKey(floor.level, room.key)
          if (!targetRoomIds.has(roomId)) return []
          const roomProfile = optimizationProfiles.profiles.get(roomId)
          const placementMode = roomProfile?.placementMode ?? variant.placementMode
          const density =
            variant.forceCompactProfiles || variant.density === 'compact'
              ? 'compact'
              : (roomProfile?.density ?? variant.density)

          return createRoomItemPlans(
            form,
            intent,
            floor.level,
            room,
            layoutHint,
            sceneContext,
            roomAccessPointsByKey.get(room.key) ?? [],
            stairBlockedRectsByRoomKey.get(room.key) ?? [],
            placementMode,
            density,
          )
        })

        return {
          ...floor,
          items: [...preservedRoomItems, ...replacedRoomItems, ...outdoorItems],
        }
      })

      const nextAnalysis = createPlanAnalysis(nextFloors, form, language, sceneContext)
      if (isPlanAnalysisBetter(nextAnalysis, bestAnalysis)) {
        bestFloors = nextFloors
        bestAnalysis = nextAnalysis
        bestVariant = variant.key
      }
    }

    if (!bestVariant) break

    optimizationSteps.push({
      variantKey: bestVariant,
      roomRefs: optimizationProfiles.roomRefs,
    })
    for (const roomRef of optimizationProfiles.roomRefs) {
      optimizedRoomRefs.set(getRoomRefKey(roomRef.level, roomRef.roomKey), roomRef)
    }
    currentFloors = bestFloors
    currentAnalysis = bestAnalysis
  }

  if (optimizationSteps.length === 0) {
    return {
      floors,
      optimizedRoomCount: 0,
      selectedVariant: null,
      passCount: 0,
      steps: [] as AiBuildingOptimizationStep[],
      roomRefs: [] as AiBuildingRoomRef[],
      analysis: null,
    }
  }
  const roomRefs = [...optimizedRoomRefs.values()]
  const passCount = optimizationSteps.length
  const selectedVariant =
    passCount > 1 ? 'multi-pass-rule-targeted' : (optimizationSteps[0]?.variantKey ?? null)

  return {
    floors: currentFloors,
    optimizedRoomCount: roomRefs.length,
    selectedVariant,
    passCount,
    steps: optimizationSteps,
    roomRefs,
    analysis: currentAnalysis,
  }
}

function isPlanAnalysisBetter(
  nextAnalysis: AiBuildingPlanAnalysis,
  currentAnalysis: AiBuildingPlanAnalysis,
) {
  if (nextAnalysis.rules && currentAnalysis.rules) {
    if (nextAnalysis.rules.hardFailureCount !== currentAnalysis.rules.hardFailureCount) {
      return nextAnalysis.rules.hardFailureCount < currentAnalysis.rules.hardFailureCount
    }

    if (nextAnalysis.rules.totalScore !== currentAnalysis.rules.totalScore) {
      return nextAnalysis.rules.totalScore > currentAnalysis.rules.totalScore
    }

    if (nextAnalysis.rules.warningCount !== currentAnalysis.rules.warningCount) {
      return nextAnalysis.rules.warningCount < currentAnalysis.rules.warningCount
    }
  }

  if (nextAnalysis.scores.overall !== currentAnalysis.scores.overall) {
    return nextAnalysis.scores.overall > currentAnalysis.scores.overall
  }

  if (nextAnalysis.scores.openingAlignment !== currentAnalysis.scores.openingAlignment) {
    return nextAnalysis.scores.openingAlignment > currentAnalysis.scores.openingAlignment
  }

  if (
    nextAnalysis.circulation.congestedRoomRefs.length !==
    currentAnalysis.circulation.congestedRoomRefs.length
  ) {
    return (
      nextAnalysis.circulation.congestedRoomRefs.length <
      currentAnalysis.circulation.congestedRoomRefs.length
    )
  }

  return nextAnalysis.scores.circulation > currentAnalysis.scores.circulation
}

function countMissingRequiredStairTransitions(
  floors: AiBuildingFloorPlan[],
  form: AiBuildingFormState,
) {
  if (form.floors <= 1) return 0

  let missingCount = 0
  for (let floorIndex = 0; floorIndex < floors.length; floorIndex += 1) {
    const floor = floors[floorIndex]
    if (!floor) continue
    if (!floor.rooms.some((room) => room.programKey === 'stairs')) missingCount += 1
    if (floorIndex < floors.length - 1 && floor.stairs.length === 0) missingCount += 1
  }

  return missingCount
}

function getConstructabilityIssuePenalty(issue: AiBuildingConstructabilityIssue) {
  switch (issue.code) {
    case 'MISSING_STAIR_ROOM':
    case 'MISSING_STAIR_TRANSITION':
      return 1000
    case 'STAIR_OUTSIDE_STAIR_ROOM':
      return 940
    case 'STAIR_SOLID_WALL_CONFLICT':
      return 900
    case 'ROOM_ENCLOSURE_INCOMPLETE':
      return 360
    case 'ROOM_DOOR_MISSING':
      return 320
    case 'ROOM_UNREACHABLE':
      return 260
  }
}

function getConstructabilityPenalty(validation: AiBuildingConstructabilityValidation) {
  return validation.issues.reduce(
    (sum, issue) => sum + getConstructabilityIssuePenalty(issue),
    validation.issues.length * 10,
  )
}

function getPlanFormArea(form: Pick<AiBuildingFormState, 'width' | 'depth'>) {
  return form.width * form.depth
}

function getCandidateExpansionPenalty(
  candidate: AiBuildingPlanCandidate,
  targetForm: AiBuildingFormState,
) {
  const targetArea = Math.max(1, getPlanFormArea(targetForm))
  const areaDeltaRatio = Math.max(0, getPlanFormArea(candidate.form) - targetArea) / targetArea
  const widthDelta = Math.max(0, candidate.form.width - targetForm.width)
  const depthDelta = Math.max(0, candidate.form.depth - targetForm.depth)
  return areaDeltaRatio * 100 + widthDelta + depthDelta
}

function isPlanCandidateBetter(
  nextCandidate: AiBuildingPlanCandidate,
  currentCandidate: AiBuildingPlanCandidate,
  form: AiBuildingFormState,
) {
  if (nextCandidate.constructability.passed !== currentCandidate.constructability.passed) {
    return nextCandidate.constructability.passed
  }

  const nextConstructabilityPenalty = getConstructabilityPenalty(nextCandidate.constructability)
  const currentConstructabilityPenalty = getConstructabilityPenalty(
    currentCandidate.constructability,
  )
  if (nextConstructabilityPenalty !== currentConstructabilityPenalty) {
    return nextConstructabilityPenalty < currentConstructabilityPenalty
  }

  const nextMissingStairs = countMissingRequiredStairTransitions(nextCandidate.floors, form)
  const currentMissingStairs = countMissingRequiredStairTransitions(currentCandidate.floors, form)
  if (nextMissingStairs !== currentMissingStairs) {
    return nextMissingStairs < currentMissingStairs
  }

  const nextExpansionPenalty = getCandidateExpansionPenalty(nextCandidate, form)
  const currentExpansionPenalty = getCandidateExpansionPenalty(currentCandidate, form)
  if (Math.abs(nextExpansionPenalty - currentExpansionPenalty) > 0.001) {
    return nextExpansionPenalty < currentExpansionPenalty
  }

  return isPlanAnalysisBetter(nextCandidate.analysis, currentCandidate.analysis)
}

function createPlanCandidate(
  form: AiBuildingFormState,
  language: AiBuildingLanguage,
  sceneContext: SceneContext | null | undefined,
  options: AiBuildingGenerationOptions,
) {
  const halfWidth = form.width / 2
  const halfDepth = form.depth / 2
  const layoutHint = getSceneGridLayoutHint(sceneContext)
  const verticalCorePlan = createVerticalCorePlan(form, layoutHint, {
    minX: -halfWidth,
    maxX: halfWidth,
    minZ: -halfDepth,
    maxZ: halfDepth,
  })
  const baseFloors: AiBuildingFloorPlan[] = []
  for (let index = 0; index < form.floors; index += 1) {
    baseFloors.push(
      createFloorPlan(
        form,
        index,
        language,
        sceneContext,
        options,
        baseFloors.at(-1) ?? null,
        verticalCorePlan,
      ),
    )
  }
  const baseAnalysis = createPlanAnalysis(baseFloors, form, language, sceneContext)
  const optimized = optimizeFloorsForAnalysis(
    baseFloors,
    baseAnalysis,
    form,
    language,
    sceneContext,
  )
  let floors = baseFloors
  let analysis = baseAnalysis

  if (optimized.optimizedRoomCount > 0 && optimized.analysis) {
    const variantLabel = getOptimizationVariantLabel(
      optimized.selectedVariant ?? 'compact-balanced',
      language,
    )

    floors = optimized.floors
    analysis = applyOptimizationMetadataToAnalysis(
      optimized.analysis,
      {
        variantKey: optimized.selectedVariant ?? 'compact-balanced',
        passCount: optimized.passCount,
        steps: optimized.steps,
        roomRefs: optimized.roomRefs,
      },
      language,
    )
    analysis = {
      ...analysis,
      highlights: [
        language === 'zh-CN'
          ? optimized.passCount > 1
            ? `已对 ${optimized.optimizedRoomCount} 个重点房间连续执行 ${optimized.passCount} 轮定向重排。`
            : `已对 ${optimized.optimizedRoomCount} 个重点房间执行${variantLabel}。`
          : optimized.passCount > 1
            ? `Applied ${optimized.passCount} targeted reflow passes to ${optimized.optimizedRoomCount} target rooms.`
            : `Applied ${variantLabel} to ${optimized.optimizedRoomCount} target rooms.`,
        ...analysis.highlights,
      ],
    }
  }

  const key = `${options.openingBias ?? 'balanced'}:${options.furnishingBias ?? 'layered'}:${form.width}:${form.depth}`
  const constructability = validateAiBuildingPlanConstructability({
    id: key,
    summary: key,
    footprint: {
      width: form.width,
      depth: form.depth,
    },
    floors,
    analysis,
  })

  return {
    key,
    form,
    options: {
      openingBias: options.openingBias ?? 'balanced',
      furnishingBias: options.furnishingBias ?? 'layered',
    },
    floors,
    analysis,
    constructability,
  }
}

function normalizePlanFormForScene(
  form: AiBuildingFormState,
  sceneContext: SceneContext | null | undefined,
  footprintLimits: ReturnType<typeof getSceneFootprintLimits> | null,
) {
  return {
    ...form,
    floors: Math.round(clampNumber(form.floors, 1, 8)),
    width: sceneContext
      ? snapDimensionToSceneGrid(
          form.width,
          sceneContext,
          footprintLimits?.maxWidth ?? MAX_DIMENSION,
        )
      : clampNumber(form.width, MIN_DIMENSION, MAX_DIMENSION),
    depth: sceneContext
      ? snapDimensionToSceneGrid(
          form.depth,
          sceneContext,
          footprintLimits?.maxDepth ?? MAX_DIMENSION,
        )
      : clampNumber(form.depth, MIN_DIMENSION, MAX_DIMENSION),
  }
}

function createConstructabilityRepairForms(
  form: AiBuildingFormState,
  sceneContext: SceneContext | null | undefined,
  footprintLimits: ReturnType<typeof getSceneFootprintLimits> | null,
) {
  const forms: AiBuildingFormState[] = []
  const seen = new Set<string>()
  const maxWidth = footprintLimits?.maxWidth ?? MAX_DIMENSION
  const maxDepth = footprintLimits?.maxDepth ?? MAX_DIMENSION
  const addForm = (width: number, depth: number) => {
    const nextForm = normalizePlanFormForScene(
      {
        ...form,
        width,
        depth,
      },
      sceneContext,
      footprintLimits,
    )
    const key = `${nextForm.floors}:${nextForm.width}:${nextForm.depth}`
    if (seen.has(key)) return
    seen.add(key)
    forms.push(nextForm)
  }

  addForm(form.width, form.depth)

  for (const scale of [1.08, 1.16, 1.24, 1.36, 1.5, 1.7, 2]) {
    addForm(Math.min(maxWidth, form.width * scale), Math.min(maxDepth, form.depth * scale))
  }

  return forms
}

function createConstructabilityCandidateOptions(
  sceneContext: SceneContext | null | undefined,
): AiBuildingGenerationOptions[] {
  const options: AiBuildingGenerationOptions[] = [
    { openingBias: 'balanced', furnishingBias: 'layered' },
    { openingBias: 'balanced', furnishingBias: 'circulation-first' },
    { openingBias: 'primary-facade', furnishingBias: 'circulation-first' },
  ]

  if (getSceneGridLayoutHint(sceneContext)) {
    options.push({ openingBias: 'primary-facade', furnishingBias: 'layered' })
  }

  return options
}

export function createPlan(
  form: AiBuildingFormState,
  language: AiBuildingLanguage,
  sceneContext?: SceneContext | null,
): AiBuildingPlan {
  const footprintLimits = sceneContext
    ? getSceneFootprintLimits(sceneContext, form.buildingType)
    : null
  const normalizedForm = normalizePlanFormForScene(form, sceneContext, footprintLimits)
  const candidateOptions = createConstructabilityCandidateOptions(sceneContext)
  const candidates: AiBuildingPlanCandidate[] = []
  const baseCandidates = candidateOptions.map((options) =>
    createPlanCandidate(normalizedForm, language, sceneContext, options),
  )
  candidates.push(...baseCandidates)

  if (!baseCandidates.some((candidate) => candidate.constructability.passed)) {
    const repairForms = createConstructabilityRepairForms(
      normalizedForm,
      sceneContext,
      footprintLimits,
    ).slice(1)
    for (const repairForm of repairForms) {
      for (const options of candidateOptions) {
        candidates.push(createPlanCandidate(repairForm, language, sceneContext, options))
        if (candidates.some((candidate) => candidate.constructability.passed)) break
      }
      if (candidates.some((candidate) => candidate.constructability.passed)) break
    }
  }

  const selectedCandidate = candidates.reduce((best, candidate) =>
    isPlanCandidateBetter(candidate, best, normalizedForm) ? candidate : best,
  )
  const selectedForm = selectedCandidate.form
  const floors = selectedCandidate.floors
  const autoExpanded =
    Math.abs(selectedForm.width - normalizedForm.width) > 0.001 ||
    Math.abs(selectedForm.depth - normalizedForm.depth) > 0.001
  const constructabilitySelectionMessage = selectedCandidate.constructability.passed
    ? language === 'zh-CN'
      ? '已通过可建造性硬验收：楼梯、墙体、门洞和连续动线均可落地。'
      : 'Constructability gate passed: stairs, walls, doors, and continuous circulation are usable.'
    : language === 'zh-CN'
      ? `已尝试 ${candidates.length} 个自动修复候选，但仍有 ${selectedCandidate.constructability.issues.length} 项可建造性问题。`
      : `Tried ${candidates.length} automatic repair candidates, but ${selectedCandidate.constructability.issues.length} constructability issue(s) remain.`
  const footprintRepairMessage =
    autoExpanded && language === 'zh-CN'
      ? `为满足楼梯/门厅/动线硬约束，已自动将轮廓从 ${normalizedForm.width}m x ${normalizedForm.depth}m 调整为 ${selectedForm.width}m x ${selectedForm.depth}m。`
      : autoExpanded
        ? `Adjusted footprint from ${normalizedForm.width}m x ${normalizedForm.depth}m to ${selectedForm.width}m x ${selectedForm.depth}m to satisfy stair, entry, and circulation constraints.`
        : null
  const analysis =
    candidates.length > 1
      ? {
          ...selectedCandidate.analysis,
          selection: {
            ...selectedCandidate.analysis.selection,
            candidateCount: candidates.length,
            openingBias: selectedCandidate.options.openingBias,
            furnishingBias: selectedCandidate.options.furnishingBias,
          },
          highlights: [
            language === 'zh-CN'
              ? `已从 ${candidates.length} 个候选中择优，采用${selectedCandidate.options.openingBias === 'primary-facade' ? '主立面强化' : '均衡'}开洞 + ${selectedCandidate.options.furnishingBias === 'circulation-first' ? '通行优先' : '分层家具'}策略，并优先满足人居规则闸门。`
              : `Selected the ${selectedCandidate.options.openingBias === 'primary-facade' ? 'primary-facade' : 'balanced'} opening + ${selectedCandidate.options.furnishingBias === 'circulation-first' ? 'circulation-first' : 'layered'} furnishing strategy from ${candidates.length} candidates with residential rule guidance.`,
            ...(selectedCandidate.constructability.passed ? [constructabilitySelectionMessage] : []),
            ...(footprintRepairMessage ? [footprintRepairMessage] : []),
            ...selectedCandidate.analysis.highlights,
          ],
          warnings: [
            ...(!selectedCandidate.constructability.passed ? [constructabilitySelectionMessage] : []),
            ...selectedCandidate.analysis.warnings,
          ],
        }
      : {
          ...selectedCandidate.analysis,
          selection: {
            ...selectedCandidate.analysis.selection,
            candidateCount: 1,
            openingBias: selectedCandidate.options.openingBias,
            furnishingBias: selectedCandidate.options.furnishingBias,
          },
        }

  const summary =
    language === 'zh-CN'
      ? `${COPY[language].buildingTypes[form.buildingType]} · ${selectedForm.floors} 层 · ${selectedForm.width}m x ${selectedForm.depth}m`
      : `${COPY[language].buildingTypes[form.buildingType]} · ${selectedForm.floors} floors · ${selectedForm.width}m x ${selectedForm.depth}m`

  return {
    id: `${selectedForm.buildingType}-${selectedForm.style}-${selectedForm.variant}-${selectedForm.floors}-${selectedForm.width}-${selectedForm.depth}`,
    summary,
    footprint: {
      width: selectedForm.width,
      depth: selectedForm.depth,
    },
    floors,
    analysis,
  }
}

function shouldUseResidentialRuleGuidance(buildingType: AiBuildingType) {
  return buildingType === 'villa' || buildingType === 'residential' || buildingType === 'apartment'
}

function createPlanRuleGuidance(
  floors: AiBuildingFloorPlan[],
  form: AiBuildingFormState,
  sceneContext: SceneContext | null | undefined,
  targetClearance: number,
  circulationResults: Array<NonNullable<ReturnType<typeof analyzeRoomCirculation>>>,
  kitchenWorkflowResults: Array<NonNullable<ReturnType<typeof analyzeKitchenWorkflow>>>,
  bathroomZoningResults: Array<NonNullable<ReturnType<typeof analyzeBathroomZoning>>>,
  stairWalkabilityResults: AiBuildingStairWalkabilityResult[],
): AiBuildingRuleGuidance | null {
  if (!shouldUseResidentialRuleGuidance(form.buildingType)) return null

  const snapshot = createPlanRuleSnapshot(
    floors,
    form,
    sceneContext,
    targetClearance,
    circulationResults,
    kitchenWorkflowResults,
    bathroomZoningResults,
    stairWalkabilityResults,
  )
  const evaluation = evaluateAiLayoutConstraints({
    snapshot,
    activeProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
  })

  return summarizeConstraintEvaluation(snapshot, evaluation)
}

function summarizeConstraintEvaluation(
  snapshot: ReturnType<typeof createAiAnalysisSnapshot>,
  evaluation: AiConstraintEvaluation,
): AiBuildingRuleGuidance {
  const violationSummaries = [
    ...evaluation.hardFailures.map((violation) => ({
      code: violation.code,
      severity: 'error' as const,
      message: violation.message,
      roomRefs: getRuleViolationRoomRefs(snapshot, violation.targetId),
    })),
    ...evaluation.warnings.map((violation) => ({
      code: violation.code,
      severity: 'warning' as const,
      message: violation.message,
      roomRefs: getRuleViolationRoomRefs(snapshot, violation.targetId),
    })),
  ].slice(0, 6)

  return {
    activeProfileIds: evaluation.activeProfileIds,
    passed: evaluation.passed,
    hardFailureCount: evaluation.hardFailures.length,
    hardFailureCodes: evaluation.hardFailures.map((violation) => violation.code),
    warningCount: evaluation.warnings.length,
    warningCodes: evaluation.warnings.map((violation) => violation.code),
    totalScore: evaluation.totalScore,
    maxScore: evaluation.maxScore,
    hardFailures: evaluation.hardFailures.slice(0, 3).map((violation) => violation.message),
    warnings: evaluation.warnings.slice(0, 3).map((violation) => violation.message),
    violationSummaries,
    fengShuiAdvisories: evaluation.fengShuiAdvisories.slice(0, 4),
    repairSummaries: [],
  }
}

function createFengShuiAdvisorySummaryMessage(
  ruleGuidance: AiBuildingRuleGuidance,
  language: AiBuildingLanguage,
) {
  if (ruleGuidance.fengShuiAdvisories.length === 0) return null

  if (language === 'zh-CN') {
    const labels = ruleGuidance.fengShuiAdvisories
      .slice(0, 3)
      .map((advisory) => advisory.userFacingLabels.traditional)
      .join('、')

    return `风水解释层识别 ${ruleGuidance.fengShuiAdvisories.length} 条重点问题：${labels}。`
  }

  return `Feng shui advisory layer flagged ${ruleGuidance.fengShuiAdvisories.length} explainable spatial issue(s).`
}

function createPlanRuleSnapshot(
  floors: AiBuildingFloorPlan[],
  form: AiBuildingFormState,
  sceneContext: SceneContext | null | undefined,
  targetClearance: number,
  circulationResults: Array<NonNullable<ReturnType<typeof analyzeRoomCirculation>>>,
  kitchenWorkflowResults: Array<NonNullable<ReturnType<typeof analyzeKitchenWorkflow>>>,
  bathroomZoningResults: Array<NonNullable<ReturnType<typeof analyzeBathroomZoning>>>,
  stairWalkabilityResults: AiBuildingStairWalkabilityResult[],
) {
  const buildingId = sceneContext?.buildingId ?? `ai-plan-${form.buildingType}`
  const activeProfileIds = [...AI_BUILDING_RULE_PROFILE_IDS]

  return createAiAnalysisSnapshot({
    source: 'ai-plan-preview',
    unit: 'metric',
    buildingId,
    activeProfileIds,
    householdBrief: inferPlanHouseholdBrief(form, floors),
    site: createPlanRuleSiteSnapshot(sceneContext),
    building: {
      nodeId: buildingId,
      footprintArea: roundSceneMetric(form.width * form.depth),
      perimeter: roundSceneMetric((form.width + form.depth) * 2),
      faceWidth: roundSceneMetric(form.width),
      depth: roundSceneMetric(form.depth),
      height: roundSceneMetric(floors.reduce((sum, floor) => sum + floor.wallHeight, 0)),
      setbacks: {
        front: sceneContext?.constraints.setbackRules.front ?? null,
        back: sceneContext?.constraints.setbackRules.back ?? null,
        left: sceneContext?.constraints.setbackRules.left ?? null,
        right: sceneContext?.constraints.setbackRules.right ?? null,
      },
    },
    levels: floors.map((floor) =>
      createPlanRuleLevelSnapshot(floor, targetClearance, circulationResults),
    ),
    issues: createPlanRuleIssues(
      floors,
      form,
      targetClearance,
      circulationResults,
      kitchenWorkflowResults,
      bathroomZoningResults,
      stairWalkabilityResults,
    ),
  })
}

function createPlanRuleSiteSnapshot(sceneContext: SceneContext | null | undefined) {
  if (
    !(typeof sceneContext?.siteWidth === 'number' && Number.isFinite(sceneContext.siteWidth)) ||
    !(typeof sceneContext?.siteDepth === 'number' && Number.isFinite(sceneContext.siteDepth))
  ) {
    return null
  }

  return {
    nodeId: 'site',
    area: roundSceneMetric(sceneContext.siteWidth * sceneContext.siteDepth),
    perimeter: roundSceneMetric((sceneContext.siteWidth + sceneContext.siteDepth) * 2),
    faceWidth: roundSceneMetric(sceneContext.siteWidth),
    depth: roundSceneMetric(sceneContext.siteDepth),
    slopePercent: null,
    orientationDegrees: null,
    polygon: rect(0, 0, sceneContext.siteWidth, sceneContext.siteDepth),
    buildableRange: {
      frontSetbackMin: sceneContext.constraints.setbackRules.front ?? null,
      backSetbackMin: sceneContext.constraints.setbackRules.back ?? null,
      leftSetbackMin: sceneContext.constraints.setbackRules.left ?? null,
      rightSetbackMin: sceneContext.constraints.setbackRules.right ?? null,
    },
  }
}

function createPlanRuleLevelSnapshot(
  floor: AiBuildingFloorPlan,
  targetClearance: number,
  circulationResults: Array<NonNullable<ReturnType<typeof analyzeRoomCirculation>>>,
) {
  const floorBounds = getPolygonBounds(floor.slabPolygon)
  const roomAdjacency = createRoomAdjacencyMap(floor.rooms)
  const levelId = `level-${floor.level}`
  const openingEntries = floor.openings.map((opening, index) => ({
    opening,
    id: `${levelId}:opening:${index + 1}`,
  }))
  const minimumDoorWidthMm = getMinimumDoorWidthMm(floor.openings)
  const levelCirculation = circulationResults.filter((result) => result.level === floor.level)
  const minMeasuredWidth =
    levelCirculation
      .map((result) => result.minBoundaryClearance)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .sort((left, right) => left - right)[0] ?? targetClearance

  return {
    nodeId: levelId,
    level: floor.level,
    area: roundSceneMetric(getPolygonArea(floor.slabPolygon)),
    clearHeight: roundSceneMetric(floor.wallHeight),
    rooms: floor.rooms.map((room) =>
      createPlanRuleRoomSnapshot(room, floor, floorBounds, openingEntries, roomAdjacency),
    ),
    openings: openingEntries.map(({ opening, id }) => ({
      nodeId: id,
      kind: opening.kind,
      levelId,
      hostNodeId: opening.wallKey,
      width: roundSceneMetric(opening.width),
      height: roundSceneMetric(opening.height),
      sillHeight: roundSceneMetric(Math.max(0, opening.centerY - opening.height / 2)),
      topClearance: roundSceneMetric(
        Math.max(0, floor.wallHeight - (opening.centerY + opening.height / 2)),
      ),
    })),
    items: floor.items.map((item) => createPlanRuleItemSnapshot(item, floor.rooms)),
    circulation: {
      minPathWidth: minMeasuredWidth,
      blockedSegments: [],
    },
    operations: createPlanRuleOperationsSnapshot(floor, targetClearance),
    accessibility: {
      hasStepFreeEntry: floor.level === 0 ? true : null,
      hasStepFreePathToPrimaryRoom:
        floor.level === 0
          ? floor.rooms.some(
              (room) => room.programKey === 'living_room' || room.programKey === 'primary_bedroom',
            )
          : null,
      hasStepFreePathToBathroom:
        floor.level === 0 ? floor.rooms.some((room) => room.programKey === 'bathroom') : null,
      minimumDoorClearWidth: minimumDoorWidthMm,
      turningRadius: floor.rooms.some(
        (room) => room.programKey === 'bathroom' && getRoomMetrics(room).minSpan >= 1.6,
      )
        ? 1500
        : null,
      bathroomGrabBarReady: floor.rooms.some(
        (room) => room.programKey === 'bathroom' && getRoomMetrics(room).minSpan >= 1.6,
      ),
      nightPathObstacleCount:
        floor.level === 0
          ? levelCirculation.reduce(
              (sum, result) => sum + result.blockedAccessCount + result.blockedDoorSwingCount,
              0,
            )
          : null,
    },
  }
}

function createPlanRuleRoomSnapshot(
  room: AiBuildingRoomPlan,
  floor: AiBuildingFloorPlan,
  floorBounds: ReturnType<typeof getPolygonBounds>,
  openingEntries: Array<{ opening: AiBuildingOpeningPlan; id: string }>,
  roomAdjacency: Map<string, string[]>,
) {
  const roomMetrics = getRoomMetrics(room)

  return {
    nodeId: room.key,
    programKey: room.programKey ?? null,
    name: room.name,
    area: roundSceneMetric(roomMetrics.area),
    faceWidth: roundSceneMetric(roomMetrics.width),
    depth: roundSceneMetric(roomMetrics.depth),
    clearHeight: roundSceneMetric(floor.wallHeight),
    aspectRatio: roundSceneMetric(roomMetrics.maxSpan / Math.max(roomMetrics.minSpan, 0.01)),
    polygon: room.polygon,
    openings: openingEntries
      .filter(({ opening }) => doesRoomUseOpening(room, floor.walls, opening))
      .map(({ id }) => id),
    items: floor.items.filter((item) => item.roomKey === room.key).map((item) => item.key),
    adjacency: roomAdjacency.get(room.key) ?? [],
    privacyClass: getPlanRoomPrivacyClass(room.programKey),
    daylightTags: createPlanRoomDaylightTags(room, floor, floorBounds),
  }
}

function createPlanRoomDaylightTags(
  room: AiBuildingRoomPlan,
  floor: AiBuildingFloorPlan,
  floorBounds: ReturnType<typeof getPolygonBounds>,
): AiDaylightTag[] {
  const tags: AiDaylightTag[] = []
  const contacts = floor.walls
    .filter((wall) => wall.role === 'outer')
    .map((wall) => ({ wall, contact: getRoomContactRangeOnWall(room, wall) }))
    .filter(
      (
        entry,
      ): entry is {
        wall: AiBuildingWallPlan
        contact: NonNullable<ReturnType<typeof getRoomContactRangeOnWall>>
      } => Boolean(entry.contact),
    )
  const windowContacts = contacts.filter(({ wall, contact }) =>
    floor.openings.some((opening) => {
      if (opening.kind !== 'window' || opening.wallKey !== wall.key) return false
      const localRange = getWallLocalRange(wall, contact.rangeStart, contact.rangeEnd)
      return (
        opening.localX >= localRange.start - opening.width / 2 &&
        opening.localX <= localRange.end + opening.width / 2
      )
    }),
  )
  const primaryWindowContacts = windowContacts.filter(({ wall }) =>
    floor.openings.some(
      (opening) =>
        opening.kind === 'window' && opening.wallKey === wall.key && opening.facade === 'primary',
    ),
  )
  const exteriorSides = new Set(contacts.map(({ contact }) => contact.side))

  if (primaryWindowContacts.length > 0) {
    const firstPrimary = primaryWindowContacts[0]
    tags.push({
      key: 'primary-daylight',
      status: 'preferred',
      orientationDegrees: getWallOrientationDegrees(firstPrimary?.wall.key ?? null),
    })
    tags.push({
      key: 'best-frontage',
      status: 'present',
      orientationDegrees: getWallOrientationDegrees(firstPrimary?.wall.key ?? null),
    })
  } else if (windowContacts.length > 0) {
    const firstWindow = windowContacts[0]
    tags.push({
      key: 'secondary-daylight',
      status: 'present',
      orientationDegrees: getWallOrientationDegrees(firstWindow?.wall.key ?? null),
    })
  } else if (contacts.length > 0) {
    tags.push({
      key: 'borrowed-light',
      status: 'present',
      orientationDegrees: null,
      note: 'Room reaches the exterior edge but has no dedicated window opening yet.',
    })
  } else {
    tags.push({
      key: 'no-direct-daylight',
      status: 'missing',
      orientationDegrees: null,
    })
  }

  if (exteriorSides.size >= 2) {
    tags.push({
      key: 'dual-aspect',
      status: 'present',
      orientationDegrees: null,
    })
  } else if (exteriorSides.size === 1) {
    tags.push({
      key: 'single-aspect',
      status: 'present',
      orientationDegrees: null,
    })
  }

  if (
    (exteriorSides.has('south') && exteriorSides.has('north')) ||
    (exteriorSides.has('east') && exteriorSides.has('west'))
  ) {
    tags.push({
      key: 'cross-ventilation',
      status: 'present',
      orientationDegrees: null,
    })
  }

  if (getPlanRoomPrivacyClass(room.programKey) === 'service') {
    const roomBounds = getRoomBounds(room)
    const touchesPrimaryEnvelope =
      Math.abs(roomBounds.minZ - floorBounds.minZ) <= 0.08 ||
      Math.abs(roomBounds.maxZ - floorBounds.maxZ) <= 0.08
    if (touchesPrimaryEnvelope) {
      tags.push({
        key: 'service-frontage',
        status: 'present',
        orientationDegrees: null,
      })
    }
  }

  return tags
}

function createPlanRuleItemSnapshot(item: AiBuildingItemPlan, rooms: AiBuildingRoomPlan[]) {
  const asset = ITEM_ASSETS[item.assetId]
  const scale = item.scale ?? [1, 1, 1]
  const dimensions = asset?.dimensions ?? [0, 0, 0]
  const room = rooms.find((entry) => entry.key === item.roomKey)
  const roomBounds = room ? getRoomBounds(room) : null

  return {
    nodeId: item.key,
    assetId: item.assetId,
    category: asset?.category ?? null,
    levelId: `level-${item.level ?? 0}`,
    roomId: item.roomKey ?? null,
    attachType: 'floor' as const,
    bbox: {
      width: roundSceneMetric(dimensions[0] * scale[0]) ?? 0,
      height: roundSceneMetric(dimensions[1] * scale[1]) ?? 0,
      depth: roundSceneMetric(dimensions[2] * scale[2]) ?? 0,
    },
    clearance: {
      front: roomBounds ? roundSceneMetric(roomBounds.maxZ - item.position[2]) : null,
      back: roomBounds ? roundSceneMetric(item.position[2] - roomBounds.minZ) : null,
      left: roomBounds ? roundSceneMetric(item.position[0] - roomBounds.minX) : null,
      right: roomBounds ? roundSceneMetric(roomBounds.maxX - item.position[0]) : null,
      top: null,
      nearestHorizontal: null,
      floorOffset: roundSceneMetric(item.position[1]),
    },
    placement: {
      valid: true,
      wallAligned: null,
    },
  }
}

function createPlanRuleOperationsSnapshot(floor: AiBuildingFloorPlan, targetClearance: number) {
  const activities: Array<{
    key: string
    label: string
    roomId: string | null
    supportLevel: 'supported' | 'partial' | 'missing'
    connectedRoomIds: string[]
    notes: string[]
  }> = []

  const kitchenRoom = floor.rooms.find((room) => room.programKey === 'kitchen') ?? null
  const diningRoom = floor.rooms.find((room) => room.programKey === 'dining_room') ?? null
  const storageRoom =
    floor.rooms.find(
      (room) =>
        room.programKey === 'storage' ||
        room.programKey === 'pantry' ||
        room.programKey === 'archive',
    ) ?? null

  if (kitchenRoom) {
    activities.push({
      key: 'cook',
      label: 'Cooking',
      roomId: kitchenRoom.key,
      supportLevel: 'supported',
      connectedRoomIds: diningRoom ? [diningRoom.key] : [],
      notes: [`Target clearance reference ${targetClearance.toFixed(2)}m.`],
    })
  }

  if (storageRoom) {
    activities.push({
      key: 'store',
      label: 'Storage',
      roomId: storageRoom.key,
      supportLevel: 'supported',
      connectedRoomIds: [],
      notes: [],
    })
  }

  return {
    activities,
    strengths: activities
      .filter((activity) => activity.supportLevel === 'supported')
      .map((activity) => activity.key),
    missing: activities.length === 0 ? ['core_operations_not_tagged'] : [],
  }
}

type AiBuildingRoomSide = 'south' | 'north' | 'west' | 'east'

function hasUsableDoorForRoom(room: AiBuildingRoomPlan, floor: AiBuildingFloorPlan) {
  return floor.openings.some(
    (opening) => opening.kind === 'door' && doesRoomUseOpening(room, floor.walls, opening),
  )
}

function getRoomEnclosureSummary(room: AiBuildingRoomPlan, walls: AiBuildingWallPlan[]) {
  const metrics = getRoomMetrics(room)
  const sideLengths: Record<AiBuildingRoomSide, number> = {
    south: Math.max(0, metrics.width),
    north: Math.max(0, metrics.width),
    west: Math.max(0, metrics.depth),
    east: Math.max(0, metrics.depth),
  }
  const coveredLengths: Record<AiBuildingRoomSide, number> = {
    south: 0,
    north: 0,
    west: 0,
    east: 0,
  }

  for (const wall of walls) {
    const contact = getRoomContactRangeOnWall(room, wall)
    if (!contact) continue
    coveredLengths[contact.side] += Math.max(0, contact.rangeEnd - contact.rangeStart)
  }

  const sides: AiBuildingRoomSide[] = ['south', 'north', 'west', 'east']
  const totalExpected = sides.reduce((sum, side) => sum + sideLengths[side], 0)
  const totalCovered = sides.reduce(
    (sum, side) => sum + Math.min(sideLengths[side], coveredLengths[side]),
    0,
  )
  const missingSides = sides.filter((side) => {
    const expectedLength = sideLengths[side]
    if (expectedLength <= 0.2) return false
    return coveredLengths[side] / expectedLength < 0.74
  })

  return {
    coverageRatio: totalExpected > 0 ? totalCovered / totalExpected : 1,
    coveredSideCount: sides.length - missingSides.length,
    missingSides,
  }
}

function isRoomEnclosureIncomplete(room: AiBuildingRoomPlan, floor: AiBuildingFloorPlan) {
  if (!shouldRequireRoomDoor(room)) return false

  const enclosure = getRoomEnclosureSummary(room, floor.walls)
  return enclosure.coveredSideCount < 4 || enclosure.coverageRatio < 0.86
}

function getWallSegmentSignature(start: Point2D, end: Point2D) {
  const points = [start, end]
    .map((point) => `${roundSceneMetric(point[0])},${roundSceneMetric(point[1])}`)
    .sort()
  return points.join('|')
}

function createRoomEnclosureWall(
  room: AiBuildingRoomPlan,
  side: AiBuildingRoomSide,
): AiBuildingWallPlan {
  const metrics = getRoomMetrics(room)
  const sideLabel = side.charAt(0).toUpperCase() + side.slice(1)

  if (side === 'south') {
    return {
      key: `room-${room.key}-enclosure-south`,
      name: `${room.name} ${sideLabel} Enclosure`,
      start: [metrics.minX, metrics.minZ],
      end: [metrics.maxX, metrics.minZ],
      role: 'inner',
    }
  }

  if (side === 'north') {
    return {
      key: `room-${room.key}-enclosure-north`,
      name: `${room.name} ${sideLabel} Enclosure`,
      start: [metrics.maxX, metrics.maxZ],
      end: [metrics.minX, metrics.maxZ],
      role: 'inner',
    }
  }

  if (side === 'west') {
    return {
      key: `room-${room.key}-enclosure-west`,
      name: `${room.name} ${sideLabel} Enclosure`,
      start: [metrics.minX, metrics.maxZ],
      end: [metrics.minX, metrics.minZ],
      role: 'inner',
    }
  }

  return {
    key: `room-${room.key}-enclosure-east`,
    name: `${room.name} ${sideLabel} Enclosure`,
    start: [metrics.maxX, metrics.minZ],
    end: [metrics.maxX, metrics.maxZ],
    role: 'inner',
  }
}

function ensureRoomEnclosureWalls(
  rooms: AiBuildingRoomPlan[],
  walls: AiBuildingWallPlan[],
) {
  const nextWalls = [...walls]
  const wallSignatures = new Set(
    nextWalls.map((wall) => getWallSegmentSignature(wall.start, wall.end)),
  )

  for (const room of rooms) {
    if (!shouldRequireRoomDoor(room)) continue

    const enclosure = getRoomEnclosureSummary(room, nextWalls)
    for (const side of enclosure.missingSides) {
      const wall = createRoomEnclosureWall(room, side)
      const metrics = getRoomMetrics(room)
      const sideLength = side === 'south' || side === 'north' ? metrics.width : metrics.depth
      if (sideLength <= 0.2) continue

      const signature = getWallSegmentSignature(wall.start, wall.end)
      if (wallSignatures.has(signature)) continue
      wallSignatures.add(signature)
      nextWalls.push(wall)
    }
  }

  return nextWalls
}

function createPlanRuleIssues(
  floors: AiBuildingFloorPlan[],
  form: AiBuildingFormState,
  targetClearance: number,
  circulationResults: Array<NonNullable<ReturnType<typeof analyzeRoomCirculation>>>,
  kitchenWorkflowResults: Array<NonNullable<ReturnType<typeof analyzeKitchenWorkflow>>>,
  bathroomZoningResults: Array<NonNullable<ReturnType<typeof analyzeBathroomZoning>>>,
  stairWalkabilityResults: AiBuildingStairWalkabilityResult[],
) {
  const issues = circulationResults.flatMap((result) =>
    createPlanRuleCirculationIssues(result, floors, targetClearance),
  )

  if (form.floors > 1) {
    for (let floorIndex = 0; floorIndex < floors.length - 1; floorIndex += 1) {
      const floor = floors[floorIndex]
      if (!floor || floor.stairs.length > 0) continue
      const stairRoom = floor.rooms.find((room) => room.programKey === 'stairs') ?? null
      issues.push(
        createAiAnalysisIssue({
          code: 'STAIR_REQUIRED_BETWEEN_FLOORS',
          targetId: stairRoom?.key,
          metricValue: floor.level,
          message: `${floor.label} has no stair connecting to the next floor.`,
          sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
        }),
      )
    }
  }

  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (!shouldRequireRoomDoor(room)) continue

      if (!hasUsableDoorForRoom(room, floor)) {
        issues.push(
          createAiAnalysisIssue({
            code: 'ROOM_DOOR_MISSING',
            targetId: room.key,
            message: `${room.name} has no usable door opening; people cannot enter it in the physical model.`,
            sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
          }),
        )
      }

      if (isRoomEnclosureIncomplete(room, floor)) {
        const enclosure = getRoomEnclosureSummary(room, floor.walls)
        const missingSideLabel =
          enclosure.missingSides.length > 0 ? enclosure.missingSides.join(', ') : 'one or more'
        issues.push(
          createAiAnalysisIssue({
            code: 'ROOM_ENCLOSURE_INCOMPLETE',
            targetId: room.key,
            metricValue: roundSceneMetric(enclosure.coverageRatio),
            message: `${room.name} is not fully enclosed by walls on ${missingSideLabel} side(s).`,
            sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
          }),
        )
      }
    }
  }

  for (const result of kitchenWorkflowResults) {
    if (result.score >= 82 && !result.blocked) continue
    issues.push(
      createAiAnalysisIssue({
        code: 'KITCHEN_WORKFLOW_BROKEN',
        targetId: result.roomKey,
        metricValue: result.score,
        message: `${result.roomName} kitchen workflow is too stretched or blocked for daily use.`,
        sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
      }),
    )
  }

  for (const result of bathroomZoningResults) {
    if (result.score >= 78 && result.wetEntryOverlap <= 0.05) continue
    issues.push(
      createAiAnalysisIssue({
        code: 'TOILET_EXPOSED_TO_PUBLIC_VIEW',
        targetId: result.roomKey,
        metricValue: result.wetEntryOverlap,
        message: `${result.roomName} exposes wet fixtures too close to the entry zone.`,
        sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
      }),
    )
  }

  for (const result of stairWalkabilityResults) {
    if (
      !result.geometryIssue &&
      !result.wallCollisionIssue &&
      !result.arrivalIssue &&
      !result.verticalRouteIssue
    ) {
      continue
    }
    const geometryMessage =
      result.geometryIssue
        ? `Stair in ${result.roomName} is too steep or compressed for a natural walking rhythm.`
        : null
    const arrivalMessage =
      result.arrivalIssue && result.endArrivalRoomRef
        ? `Stair from ${result.roomName} lands too directly into ${result.endArrivalRoomRef.roomName}.`
        : result.arrivalIssue
          ? `Stair in ${result.roomName} still has an awkward landing or arrival sequence.`
          : null
    if (geometryMessage || arrivalMessage) {
      issues.push(
        createAiAnalysisIssue({
          code: 'STAIR_WALKABILITY_BROKEN',
          targetId: result.roomKey,
          metricValue: result.score,
          message: [geometryMessage, arrivalMessage].filter(Boolean).join(' '),
          sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
        }),
      )
    }
    if (result.wallCollisionIssue) {
      const wallCollisionParts = [
        result.stairWallBlocked ? 'stair body' : null,
        result.startRouteWallBlocked ? 'lower walking route' : null,
        result.endRouteWallBlocked ? 'upper arrival route' : null,
      ].filter(Boolean)
      issues.push(
        createAiAnalysisIssue({
          code: 'STAIR_WALL_COLLISION',
          targetId: result.roomKey,
          metricValue: result.score,
          message: `${result.roomName} stair is physically blocked by a solid wall at ${wallCollisionParts.join(' / ')}.`,
          sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
        }),
      )
    }
    if (result.verticalRouteIssue) {
      issues.push(
        createAiAnalysisIssue({
          code: 'STAIR_ROUTE_DISCONNECTED',
          targetId: result.roomKey,
          metricValue: result.score,
          message: `${result.roomName} stair is not connected to a continuous entry-to-upper-floor route.`,
          sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
        }),
      )
    }
  }

  const entryBufferCheck = floors[0] ? evaluateEntryBuffer(floors[0]) : null
  if (shouldUseResidentialRuleGuidance(form.buildingType) && !entryBufferCheck?.passed) {
    issues.push(
      createAiAnalysisIssue({
        code: 'ENTRY_NO_BUFFER',
        targetId: entryBufferCheck?.entryRoomKey ?? undefined,
        message:
          entryBufferCheck?.reason === 'missing-entry'
            ? 'The current plan does not reserve a dedicated entry buffer or foyer.'
            : 'The entry opens too directly into the main circulation path and lacks a foyer buffer.',
        sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
      }),
    )
  }

  return issues
}

function evaluateEntryBuffer(floor: AiBuildingFloorPlan) {
  const entryRoom = floor.rooms.find((room) => room.programKey === 'entry') ?? null
  if (!entryRoom) {
    return {
      passed: false,
      reason: 'missing-entry' as const,
      entryRoomKey: null,
    }
  }

  const accessPoints = getRoomAccessPoints(entryRoom, floor.walls, floor.openings)
  const entryAccessPoint = accessPoints.find((point) => point.kind === 'entry') ?? null
  if (!entryAccessPoint) {
    return {
      passed: false,
      reason: 'missing-entry-door' as const,
      entryRoomKey: entryRoom.key,
    }
  }

  const interiorPoints = accessPoints.filter((point) => point.kind === 'interior')
  if (interiorPoints.length === 0) {
    return {
      passed: true,
      reason: 'buffered' as const,
      entryRoomKey: entryRoom.key,
    }
  }

  const entryBounds = getRoomBounds(entryRoom)
  const alignmentBand = Math.max(0.72, entryAccessPoint.width * 1.15)
  const frontLimit = entryBounds.minZ + getRoomFrontBufferDepth(entryRoom)
  const breachesBuffer = interiorPoints.some((point) => {
    if (Math.abs(point.direction[0]) > 0) {
      return point.position[1] < frontLimit
    }

    return (
      Math.abs(point.position[0] - entryAccessPoint.position[0]) < alignmentBand ||
      point.position[1] < frontLimit
    )
  })

  return {
    passed: !breachesBuffer,
    reason: breachesBuffer ? ('direct-view' as const) : ('buffered' as const),
    entryRoomKey: entryRoom.key,
  }
}

function createPlanRuleCirculationIssues(
  result: NonNullable<ReturnType<typeof analyzeRoomCirculation>>,
  floors: AiBuildingFloorPlan[],
  targetClearance: number,
) {
  const issues = []
  const floor = floors.find((entry) => entry.level === result.level) ?? null
  const room = floor?.rooms.find((entry) => entry.key === result.roomKey) ?? null
  const roomProgram = room?.programKey ?? null
  const roomArea = room ? getRoomArea(room) : null
  const floorArea = floor ? getPolygonArea(floor.slabPolygon) : null

  if (
    typeof result.minBoundaryClearance === 'number' &&
    result.minBoundaryClearance < targetClearance
  ) {
    issues.push(
      createAiAnalysisIssue({
        code: 'CIRCULATION_WIDTH_BELOW_MIN',
        targetId: result.roomKey,
        metricValue: result.minBoundaryClearance,
        message: `${result.roomName} clearance drops below the ${targetClearance.toFixed(2)}m target.`,
        sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
      }),
    )
  }

  if (result.blockedDoorSwingCount > 0) {
    issues.push(
      createAiAnalysisIssue({
        code: 'DOOR_SWING_COLLISION',
        targetId: result.roomKey,
        metricValue: result.blockedDoorSwingCount,
        message: `${result.roomName} still has furniture blocking the door swing zone.`,
        sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
      }),
    )
  }

  if (
    (roomProgram === 'bedroom' || roomProgram === 'primary_bedroom') &&
    (result.overlapCount > 0 || result.boundaryViolationCount > 0 || result.useConflictCount > 0)
  ) {
    issues.push(
      createAiAnalysisIssue({
        code: 'BEDROOM_FURNITURE_IMPOSSIBLE',
        targetId: result.roomKey,
        metricValue: result.score,
        message: `${result.roomName} cannot fit sleeping furniture and circulation together yet.`,
        sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
      }),
    )
  }

  if (
    roomProgram === 'dining_room' &&
    (result.blockedAccessCount > 0 ||
      result.useConflictCount > 0 ||
      (typeof result.minBoundaryClearance === 'number' && result.minBoundaryClearance < 0.72))
  ) {
    issues.push(
      createAiAnalysisIssue({
        code: 'DINING_PULL_OUT_BLOCKED',
        targetId: result.roomKey,
        metricValue: result.minBoundaryClearance,
        message: `${result.roomName} does not leave enough pull-out room around the dining zone.`,
        sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
      }),
    )
  }

  if (
    roomProgram === 'corridor' &&
    roomArea != null &&
    floorArea != null &&
    floorArea > 0 &&
    roomArea / floorArea > 0.16
  ) {
    issues.push(
      createAiAnalysisIssue({
        code: 'CORRIDOR_AREA_WASTE',
        targetId: result.roomKey,
        metricValue: roomArea / floorArea,
        message: `${result.roomName} consumes too much area relative to the full level.`,
        sourceProfileIds: [...AI_BUILDING_RULE_PROFILE_IDS],
      }),
    )
  }

  return issues
}

function inferPlanHouseholdBrief(
  form: AiBuildingFormState,
  floors: AiBuildingFloorPlan[],
): AiHouseholdBrief {
  const prompt = normalizeAiBuildingText(form.prompt)
  const bedroomCount = floors
    .flatMap((floor) => floor.rooms)
    .filter((room) => room.programKey === 'bedroom' || room.programKey === 'primary_bedroom').length
  const hasStudy = floors
    .flatMap((floor) => floor.rooms)
    .some((room) => room.programKey === 'study' || room.programKey === 'open_office')
  const hasStorage = floors
    .flatMap((floor) => floor.rooms)
    .some((room) => room.programKey === 'storage' || room.programKey === 'pantry')

  return {
    householdType: form.buildingType,
    occupantCount: bedroomCount > 0 ? Math.max(1, Math.min(8, bedroomCount * 2)) : null,
    occupants: [],
    elderLiving: includesAnyKeyword(prompt, ['elder', 'senior', '老人', '父母', '长辈']),
    childLiving:
      bedroomCount >= 2 || includesAnyKeyword(prompt, ['child', 'kid', '儿童', '小孩', '宝宝']),
    workFromHome:
      hasStudy || includesAnyKeyword(prompt, ['home office', 'study', '书房', '办公', '在家办公']),
    petLiving: includesAnyKeyword(prompt, ['pet', 'dog', 'cat', '宠物', '猫', '狗']),
    cookingIntensity:
      form.buildingType === 'villa' ||
      form.buildingType === 'residential' ||
      form.buildingType === 'apartment'
        ? includesAnyKeyword(prompt, ['heavy cooking', '中厨', '爱做饭', '烹饪'])
          ? 'high'
          : 'medium'
        : null,
    storagePriority:
      hasStorage || includesAnyKeyword(prompt, ['storage', 'closet', '收纳', '储物'])
        ? 'high'
        : 'medium',
    guestFrequency: includesAnyKeyword(prompt, ['guest', 'visitor', '客人', '会客'])
      ? 'frequent'
      : 'occasional',
    caregivingNeed: includesAnyKeyword(prompt, ['care', 'nurse', '照护', '护理']),
    rentalFlexibility: includesAnyKeyword(prompt, ['rental', 'lease', '出租']),
    notes: [],
  }
}

function includesAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizeAiBuildingText(keyword)))
}

function createRoomAdjacencyMap(rooms: AiBuildingRoomPlan[]) {
  const adjacency = new Map<string, string[]>(rooms.map((room) => [room.key, []]))
  const epsilon = 0.08

  for (let index = 0; index < rooms.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < rooms.length; nextIndex += 1) {
      const left = rooms[index]
      const right = rooms[nextIndex]
      if (!left || !right) continue
      const leftBounds = getRoomBounds(left)
      const rightBounds = getRoomBounds(right)
      const overlapX =
        Math.min(leftBounds.maxX, rightBounds.maxX) - Math.max(leftBounds.minX, rightBounds.minX)
      const overlapZ =
        Math.min(leftBounds.maxZ, rightBounds.maxZ) - Math.max(leftBounds.minZ, rightBounds.minZ)
      const touchesVertically =
        (Math.abs(leftBounds.maxX - rightBounds.minX) <= epsilon ||
          Math.abs(rightBounds.maxX - leftBounds.minX) <= epsilon) &&
        overlapZ > 0.2
      const touchesHorizontally =
        (Math.abs(leftBounds.maxZ - rightBounds.minZ) <= epsilon ||
          Math.abs(rightBounds.maxZ - leftBounds.minZ) <= epsilon) &&
        overlapX > 0.2

      if (!touchesVertically && !touchesHorizontally) continue
      adjacency.set(left.key, [...(adjacency.get(left.key) ?? []), right.key])
      adjacency.set(right.key, [...(adjacency.get(right.key) ?? []), left.key])
    }
  }

  return adjacency
}

function getPlanRoomPrivacyClass(programKey?: string | null): PlanRoomPrivacyClass {
  if (programKey === 'balcony' || programKey === 'courtyard') return 'outdoor'
  if (
    programKey === 'living_room' ||
    programKey === 'dining_room' ||
    programKey === 'reception' ||
    programKey === 'display_area' ||
    programKey === 'retail_area'
  ) {
    return 'public'
  }
  if (programKey === 'bedroom' || programKey === 'primary_bedroom' || programKey === 'study') {
    return 'private'
  }
  if (programKey === 'entry') return 'semi-private'
  if (
    programKey === 'bathroom' ||
    programKey === 'kitchen' ||
    programKey === 'corridor' ||
    programKey === 'stairs' ||
    programKey === 'elevator' ||
    programKey === 'pantry' ||
    programKey === 'storage' ||
    programKey === 'archive' ||
    programKey === 'equipment_room' ||
    programKey === 'garage'
  ) {
    return 'service'
  }
  return 'unknown'
}

function doesRoomUseOpening(
  room: AiBuildingRoomPlan,
  walls: AiBuildingWallPlan[],
  opening: AiBuildingOpeningPlan,
) {
  const wall = walls.find((entry) => entry.key === opening.wallKey)
  if (!wall) return false
  const contact = getRoomContactRangeOnWall(room, wall)
  if (!contact) return false
  const localRange = getWallLocalRange(wall, contact.rangeStart, contact.rangeEnd)
  return (
    opening.localX >= localRange.start - opening.width / 2 &&
    opening.localX <= localRange.end + opening.width / 2
  )
}

function getWallOrientationDegrees(wallKey: string | null) {
  if (wallKey === 'north') return 0
  if (wallKey === 'east') return 90
  if (wallKey === 'south') return 180
  if (wallKey === 'west') return 270
  return null
}

function getMinimumDoorWidthMm(openings: AiBuildingOpeningPlan[]) {
  const widths = openings
    .filter((opening) => opening.kind === 'door')
    .map((opening) => opening.width * 1000)
    .filter((width) => Number.isFinite(width))
  if (widths.length === 0) return null
  return Math.min(...widths)
}

function getPolygonArea(points: Point2D[]) {
  if (points.length < 3) return 0
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!current || !next) continue
    area += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(area) / 2
}

function normalizeAiBuildingText(value: string) {
  return value.trim().toLowerCase()
}

function getWallLength(wall: AiBuildingWallPlan) {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

function findTargetBuilding(nodes: Record<AnyNodeId, AnyNode>, context: SceneContext) {
  if (context.buildingId) {
    const node = nodes[context.buildingId as AnyNodeId]
    if (node?.type === 'building') return node
  }

  return Object.values(nodes).find((node) => node.type === 'building') ?? null
}

function createDefaultBuilding() {
  const scene = useScene.getState()
  let site = scene.rootNodeIds
    .map((rootId) => scene.nodes[rootId])
    .find((node) => node?.type === 'site')

  if (!site) {
    scene.clearScene()
    const nextScene = useScene.getState()
    site = nextScene.rootNodeIds
      .map((rootId) => nextScene.nodes[rootId])
      .find((node) => node?.type === 'site')
  }

  if (!site) return null

  const level = LevelNode.parse({ level: 0 })
  const building = BuildingNode.parse({ children: [] })
  useScene.getState().createNodes([
    { node: building, parentId: site.id as AnyNodeId },
    { node: level, parentId: building.id as AnyNodeId },
  ])
  return building
}

function ensureTargetLevels(building: AnyNode, floorCount: number) {
  const scene = useScene.getState()
  const levels = getBuildingLevels(building, scene.nodes)
  const byLevelNumber = new Map(levels.map((level) => [level.level, level]))
  const createOps: { node: LevelNode; parentId: AnyNodeId }[] = []

  for (let levelIndex = 0; levelIndex < floorCount; levelIndex += 1) {
    if (byLevelNumber.has(levelIndex)) continue

    const level = LevelNode.parse({
      level: levelIndex,
      name: `Level ${levelIndex}`,
    })
    byLevelNumber.set(levelIndex, level)
    createOps.push({ node: level, parentId: building.id as AnyNodeId })
  }

  if (createOps.length) {
    scene.createNodes(createOps)
  }

  return Array.from({ length: floorCount }, (_, index) => byLevelNumber.get(index)).filter(
    (level): level is LevelNode => Boolean(level),
  )
}

function removePreviousAiBuildingNodes(building: AnyNode) {
  const scene = useScene.getState()
  const buildingLevels = new Set(getBuildingLevels(building, scene.nodes).map((level) => level.id))
  const generatedIds = Object.values(scene.nodes)
    .filter((node) => {
      if (!isAiBuildingNode(node)) return false
      const levelId = resolveLevelId(node, scene.nodes)
      return levelId ? buildingLevels.has(levelId as LevelNode['id']) : false
    })
    .map((node) => node.id as AnyNodeId)

  if (generatedIds.length) {
    scene.deleteNodes(generatedIds)
  }
}

function getDoorReachabilityAdjacency(floor: AiBuildingFloorPlan) {
  const adjacency = new Map(floor.rooms.map((room) => [room.key, new Set<string>()]))

  for (const opening of floor.openings) {
    if (opening.kind !== 'door') continue
    const connectedRooms = floor.rooms.filter((room) =>
      doesRoomUseOpening(room, floor.walls, opening),
    )
    for (let index = 0; index < connectedRooms.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < connectedRooms.length; nextIndex += 1) {
        const leftRoom = connectedRooms[index]
        const rightRoom = connectedRooms[nextIndex]
        if (!leftRoom || !rightRoom || leftRoom.key === rightRoom.key) continue
        adjacency.get(leftRoom.key)?.add(rightRoom.key)
        adjacency.get(rightRoom.key)?.add(leftRoom.key)
      }
    }
  }

  return adjacency
}

function getEntryReachabilitySources(floor: AiBuildingFloorPlan) {
  const sourceKeys = new Set<string>()
  for (const opening of floor.openings) {
    if (opening.kind !== 'door' || opening.facade === 'interior') continue
    for (const room of floor.rooms) {
      if (doesRoomUseOpening(room, floor.walls, opening)) {
        sourceKeys.add(room.key)
      }
    }
  }

  for (const room of floor.rooms) {
    if (room.programKey === 'entry' || room.programKey === 'reception') {
      sourceKeys.add(room.key)
    }
  }

  return sourceKeys
}

function getUpperFloorReachabilitySources(
  floors: AiBuildingFloorPlan[],
  floorIndex: number,
  floor: AiBuildingFloorPlan,
) {
  const sourceKeys = new Set<string>()
  for (const room of floor.rooms) {
    if (room.programKey === 'stairs') {
      sourceKeys.add(room.key)
    }
  }

  const previousFloor = floors[floorIndex - 1]
  for (const stair of previousFloor?.stairs ?? []) {
    const arrivalPoint = getPlannedStairLandingCenter(stair, 'end')
    const arrivalRoom = findRoomContainingPoint(floor.rooms, arrivalPoint)
    if (arrivalRoom) {
      sourceKeys.add(arrivalRoom.key)
    }
  }

  return sourceKeys
}

function getReachableRoomKeys(
  floor: AiBuildingFloorPlan,
  sourceKeys: Set<string>,
) {
  const adjacency = getDoorReachabilityAdjacency(floor)
  const reachable = new Set<string>()
  const queue: string[] = []

  for (const sourceKey of sourceKeys) {
    if (!adjacency.has(sourceKey)) continue
    reachable.add(sourceKey)
    queue.push(sourceKey)
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const roomKey = queue[cursor]
    if (!roomKey) continue
    for (const nextKey of adjacency.get(roomKey) ?? []) {
      if (reachable.has(nextKey)) continue
      reachable.add(nextKey)
      queue.push(nextKey)
    }
  }

  return reachable
}

function createConstructabilityValidationMessage(
  issues: AiBuildingConstructabilityIssue[],
) {
  if (issues.length === 0) return null

  const firstIssues = issues.slice(0, 3).map((issue) => issue.message)
  const suffix = issues.length > firstIssues.length ? ` 等 ${issues.length} 项问题` : ''
  return `方案未通过可建造性硬验收：${firstIssues.join('；')}${suffix}。`
}

export function validateAiBuildingPlanConstructability(
  plan: AiBuildingPlan,
): AiBuildingConstructabilityValidation {
  const issues: AiBuildingConstructabilityIssue[] = []

  if (plan.floors.length > 1) {
    for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
      const floor = plan.floors[floorIndex]
      if (!floor) continue

      if (!floor.rooms.some((room) => room.programKey === 'stairs')) {
        issues.push({
          code: 'MISSING_STAIR_ROOM',
          level: floor.level,
          message: `${floor.label} 缺少楼梯间或楼梯到达空间`,
        })
      }

      if (floorIndex < plan.floors.length - 1 && floor.stairs.length === 0) {
        issues.push({
          code: 'MISSING_STAIR_TRANSITION',
          level: floor.level,
          message: `${floor.label} 没有连接到上一层的楼梯`,
        })
      }

      const upperFloor = plan.floors[floorIndex + 1] ?? null
      for (const stair of floor.stairs) {
        const room = floor.rooms.find((entry) => entry.key === stair.roomKey) ?? null
        if (room?.programKey !== 'stairs') {
          issues.push({
            code: 'STAIR_OUTSIDE_STAIR_ROOM',
            level: floor.level,
            roomKey: room?.key,
            roomName: room?.name,
            message: `${floor.label} 的楼梯没有落在楼梯间内`,
          })
        }

        const wallConflicts = getStairSolidWallConflicts(
          stair,
          floor.walls,
          floor.openings,
          upperFloor?.walls ?? [],
          upperFloor?.openings ?? [],
        )
        if (!wallConflicts.hasConflict) continue
        issues.push({
          code: 'STAIR_SOLID_WALL_CONFLICT',
          level: floor.level,
          roomKey: room?.key,
          roomName: room?.name,
          message: `${floor.label} 的楼梯或上下楼路径穿过实体墙`,
        })
      }
    }
  }

  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex += 1) {
    const floor = plan.floors[floorIndex]
    if (!floor) continue

    for (const room of floor.rooms) {
      if (!shouldRequireRoomDoor(room)) continue

      if (!hasUsableDoorForRoom(room, floor)) {
        issues.push({
          code: 'ROOM_DOOR_MISSING',
          level: floor.level,
          roomKey: room.key,
          roomName: room.name,
          message: `${floor.label} ${room.name} 缺少可用门洞`,
        })
      }

      if (isRoomEnclosureIncomplete(room, floor)) {
        issues.push({
          code: 'ROOM_ENCLOSURE_INCOMPLETE',
          level: floor.level,
          roomKey: room.key,
          roomName: room.name,
          message: `${floor.label} ${room.name} 没有形成完整围护墙`,
        })
      }
    }

    const sourceKeys =
      floorIndex === 0
        ? getEntryReachabilitySources(floor)
        : getUpperFloorReachabilitySources(plan.floors, floorIndex, floor)
    const reachableRoomKeys = getReachableRoomKeys(floor, sourceKeys)

    for (const room of floor.rooms) {
      if (!shouldRequireRoomDoor(room)) continue
      if (reachableRoomKeys.has(room.key)) continue
      issues.push({
        code: 'ROOM_UNREACHABLE',
        level: floor.level,
        roomKey: room.key,
        roomName: room.name,
        message: `${floor.label} ${room.name} 不在连续可通行动线上`,
      })
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    message: createConstructabilityValidationMessage(issues),
  }
}

export function applyPlanToScene(plan: AiBuildingPlan, context: SceneContext) {
  const constructability = validateAiBuildingPlanConstructability(plan)
  if (!constructability.passed) {
    return {
      wallCount: 0,
      floorCount: plan.floors.length,
      createdDefaultBuilding: false,
      blocked: true,
      message: constructability.message ?? '方案未通过可建造性硬验收。',
      constructability,
    }
  }

  let scene = useScene.getState()
  let targetBuilding = findTargetBuilding(scene.nodes, context)
  let createdDefaultBuilding = false

  if (!targetBuilding) {
    targetBuilding = createDefaultBuilding()
    createdDefaultBuilding = Boolean(targetBuilding)
  }

  if (!targetBuilding) {
    return {
      wallCount: 0,
      floorCount: 0,
      createdDefaultBuilding,
      blocked: false,
      message: null,
      constructability,
    }
  }

  removePreviousAiBuildingNodes(targetBuilding)
  scene = useScene.getState()
  const refreshedTargetBuilding = scene.nodes[targetBuilding.id as AnyNodeId]
  const buildingForApply =
    refreshedTargetBuilding?.type === 'building' ? refreshedTargetBuilding : targetBuilding
  const targetLevels = ensureTargetLevels(buildingForApply, plan.floors.length)
  const operations: { node: AnyNode; parentId: AnyNodeId }[] = []
  const selectedIds: AnyNodeId[] = []

  for (const floorPlan of plan.floors) {
    const level = targetLevels[floorPlan.level]
    if (!level) continue

    const wallIdsByKey = new Map<string, WallNode>()
    const metadataBase = {
      source: AI_BUILDING_SOURCE,
      planId: plan.id,
      level: floorPlan.level,
    }

    const slab = SlabNode.parse({
      name: floorPlan.level === 0 ? 'AI Slab' : `AI Slab ${floorPlan.level + 1}`,
      polygon: floorPlan.slabPolygon,
      material: floorPlan.slabMaterial,
      autoFromWalls: true,
      metadata: { ...metadataBase, role: 'slab' },
    })
    operations.push({ node: slab, parentId: level.id as AnyNodeId })

    for (const wallPlan of floorPlan.walls) {
      const wall = WallNode.parse({
        name: wallPlan.name,
        start: wallPlan.start,
        end: wallPlan.end,
        thickness: WALL_THICKNESS,
        height: floorPlan.wallHeight,
        interiorMaterial: wallPlan.interiorMaterial,
        exteriorMaterial: wallPlan.exteriorMaterial,
        metadata: { ...metadataBase, role: wallPlan.role, wallKey: wallPlan.key },
      })
      wallIdsByKey.set(wallPlan.key, wall)
      selectedIds.push(wall.id as AnyNodeId)
      operations.push({ node: wall, parentId: level.id as AnyNodeId })
    }

    for (const room of floorPlan.rooms) {
      const zone = ZoneNode.parse({
        name: room.name,
        polygon: room.polygon,
        color: room.color,
        metadata: { ...metadataBase, role: 'room', roomKey: room.key },
      })
      operations.push({ node: zone, parentId: level.id as AnyNodeId })
    }

    for (const ceilingPlan of floorPlan.ceilings) {
      const ceiling = CeilingNode.parse({
        name: ceilingPlan.name,
        polygon: ceilingPlan.polygon,
        height: ceilingPlan.height,
        material: ceilingPlan.material,
        metadata: { ...metadataBase, role: 'ceiling', detailKey: ceilingPlan.key },
      })
      operations.push({ node: ceiling, parentId: level.id as AnyNodeId })
    }

    for (const detailSlabPlan of floorPlan.detailSlabs) {
      const detailSlab = SlabNode.parse({
        name: detailSlabPlan.name,
        polygon: detailSlabPlan.polygon,
        elevation: detailSlabPlan.elevation,
        material: detailSlabPlan.material,
        metadata: { ...metadataBase, role: 'detail-slab', detailKey: detailSlabPlan.key },
      })
      operations.push({ node: detailSlab, parentId: level.id as AnyNodeId })
    }

    for (const fencePlan of floorPlan.fences) {
      const fence = FenceNode.parse({
        name: `AI Fence ${fencePlan.key}`,
        start: fencePlan.start,
        end: fencePlan.end,
        height: fencePlan.height,
        color: fencePlan.color,
        style: fencePlan.style,
        material: material(fencePlan.color, 0.65),
        metadata: { ...metadataBase, role: 'fence', detailKey: fencePlan.key },
      })
      operations.push({ node: fence, parentId: level.id as AnyNodeId })
    }

    for (const item of floorPlan.items) {
      const assetInput = ITEM_ASSETS[item.assetId]
      const itemNode = ItemNode.parse({
        name: assetInput.name,
        position: item.position,
        rotation: item.rotation ?? [0, 0, 0],
        scale: item.scale ?? [1, 1, 1],
        asset: assetInput,
        metadata: { ...metadataBase, role: 'item', detailKey: item.key, assetId: item.assetId },
      })
      operations.push({ node: itemNode, parentId: level.id as AnyNodeId })
    }

    for (const roofPlan of floorPlan.roofs) {
      const roof = RoofNode.parse({
        name: 'AI Roof',
        position: roofPlan.position,
        topMaterial: roofPlan.material,
        edgeMaterial: roofPlan.material,
        wallMaterial: roofPlan.wallMaterial,
        metadata: { ...metadataBase, role: 'roof', detailKey: roofPlan.key },
      })
      const roofSegment = RoofSegmentNode.parse({
        name: 'AI Roof Segment',
        roofType: roofPlan.roofType,
        width: roofPlan.width,
        depth: roofPlan.depth,
        roofHeight: roofPlan.roofHeight,
        wallHeight: roofPlan.roofType === 'flat' ? 0.24 : 0.45,
        wallThickness: 0.14,
        deckThickness: 0.12,
        overhang: 0.42,
        shingleThickness: 0.04,
        metadata: { ...metadataBase, role: 'roof-segment', detailKey: roofPlan.key },
      })
      operations.push(
        { node: roof, parentId: level.id as AnyNodeId },
        { node: roofSegment, parentId: roof.id as AnyNodeId },
      )
    }

    for (const stairPlan of floorPlan.stairs) {
      const nextLevel = targetLevels[floorPlan.level + 1]
      const stairSegments = stairPlan.segments.map((segment, index) =>
        StairSegmentNode.parse({
          name:
            segment.segmentType === 'landing'
              ? `AI Stair Landing ${index + 1}`
              : `AI Stair Flight ${index + 1}`,
          segmentType: segment.segmentType,
          width: segment.width,
          length: segment.length,
          height: segment.height,
          stepCount: segment.stepCount,
          attachmentSide: segment.attachmentSide,
          fillToFloor: false,
          thickness: 0.24,
          metadata: {
            ...metadataBase,
            role: 'stair-segment',
            detailKey: `${stairPlan.key}_${index + 1}`,
          },
        }),
      )
      const stair = StairNode.parse({
        name: 'AI Stair',
        position: stairPlan.position,
        rotation: stairPlan.rotation,
        stairType: 'straight',
        fromLevelId: level.id,
        toLevelId: nextLevel?.id ?? level.id,
        slabOpeningMode: nextLevel ? 'destination' : 'none',
        openingOffset: nextLevel ? 0.1 : 0,
        width: stairPlan.width,
        totalRise: stairPlan.totalRise,
        stepCount: stairPlan.stepCount,
        thickness: 0.24,
        fillToFloor: false,
        railingMode: 'both',
        railingHeight: 0.92,
        children: stairSegments.map((segment) => segment.id),
        metadata: { ...metadataBase, role: 'stair', detailKey: stairPlan.key },
      })
      operations.push({ node: stair, parentId: level.id as AnyNodeId })
      operations.push(
        ...stairSegments.map((segment) => ({
          node: segment,
          parentId: stair.id as AnyNodeId,
        })),
      )
    }

    for (const opening of floorPlan.openings) {
      const wall = wallIdsByKey.get(opening.wallKey)
      if (!wall) continue
      const wallLength = getWallLength({
        key: opening.wallKey,
        name: '',
        start: wall.start,
        end: wall.end,
        role: 'outer',
      })
      const localX = clampNumber(opening.localX, opening.width / 2, wallLength - opening.width / 2)
      const metadata = { ...metadataBase, role: opening.kind, wallKey: opening.wallKey }

      if (opening.kind === 'door') {
        const door = DoorNode.parse({
          name: opening.name,
          position: [localX, opening.height / 2, 0],
          width: opening.width,
          height: opening.height,
          wallId: wall.id,
          parentId: wall.id,
          metadata,
        })
        operations.push({ node: door, parentId: wall.id as AnyNodeId })
      } else {
        const windowNode = WindowNode.parse({
          name: opening.name,
          position: [localX, opening.centerY, 0],
          width: opening.width,
          height: opening.height,
          wallId: wall.id,
          parentId: wall.id,
          metadata,
        })
        operations.push({ node: windowNode, parentId: wall.id as AnyNodeId })
      }
    }
  }

  if (operations.length) {
    useScene.getState().createNodes(operations)
  }

  const firstLevel = targetLevels[0]
  useViewer.getState().setSelection({
    buildingId: buildingForApply.id as never,
    levelId: firstLevel?.id as never,
    selectedIds: selectedIds.slice(0, 4),
    zoneId: null,
  })
  const editor = useEditor.getState()
  editor.setPhase('structure')
  editor.setStructureLayer('elements')
  editor.setMode('select')
  editor.setViewMode('3d')

  return {
    wallCount: plan.floors.reduce((total, floor) => total + floor.walls.length, 0),
    floorCount: plan.floors.length,
    createdDefaultBuilding,
    blocked: false,
    message: null,
    constructability,
  }
}
