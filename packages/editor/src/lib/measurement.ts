'use client'

import {
  type AnyNode,
  type BuildingNode,
  type CeilingNode,
  DEFAULT_WALL_HEIGHT,
  type DoorNode,
  type FenceNode,
  getScaledDimensions,
  getSketchLineChordLength,
  getWallCurveFrameAt,
  getWallCurveLength,
  getWallThickness,
  type ItemNode,
  isCurvedWall,
  type LevelNode,
  pointInPolygon,
  type RoofNode,
  type RoofSegmentNode,
  type SiteNode,
  type SketchLineNode,
  type SlabNode,
  type StairNode,
  type StairSegmentNode,
  sampleSketchLineCenterline,
  sampleWallCenterline,
  sceneRegistry,
  type WallNode,
  type WindowNode,
  type ZoneNode,
} from '@pascal-app/core'
import { Box3, type Object3D, Quaternion, Raycaster, Vector3 } from 'three'
import { getNearestOrientation, getSiteOrientationDegrees } from './orientation'
import { getSiteSetbackRules } from './site-measurement-rules'

export type MeasurementUnit = 'metric' | 'imperial'
export type MeasurementPrecision = 0 | 1 | 2
export type MeasurementFormatOptions = {
  precision?: MeasurementPrecision
}
export type MeasurementSummaryKind = 'area' | 'volume'

export type MeasurementSummary = {
  kind: MeasurementSummaryKind
  nodeId: string
  targetLabel: string
  primaryLabel: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
  anchor: [number, number, number]
  metrics: MeasurementMetric[]
}

export type MeasurementMetric = {
  id: string
  label: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
}

export type MeasurementSelectionTarget = {
  reason: 'multi' | 'empty' | null
  node: AnyNode | null
}

export type ClearanceMetric = {
  id: string
  label: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
}

export type ClearanceSummary = {
  nodeId: string
  targetLabel: string
  primaryLabel: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
  anchor: [number, number, number]
  metrics: ClearanceMetric[]
}

export type BoundsMetric = {
  id:
    | 'width'
    | 'height'
    | 'depth'
    | 'diagonal'
    | 'center-x'
    | 'center-y'
    | 'center-z'
  label: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
}

export type BoundsSummary = {
  nodeId: string
  targetLabel: string
  primaryLabel: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
  anchor: [number, number, number]
  bounds: ObjectBounds
  metrics: BoundsMetric[]
}

export type AngleMetric = {
  id:
    | 'pitch-angle'
    | 'slope-percent'
    | 'slope-direction'
    | 'plan-rotation'
    | 'line-angle'
    | 'sweep-angle'
    | 'step-angle'
    | 'included-angle'
    | 'outer-angle'
    | 'line-angle-a'
    | 'line-angle-b'
  label: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
}

export type AngleSummary = {
  nodeId: string
  targetLabel: string
  primaryLabel: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
  anchor: [number, number, number]
  metrics: AngleMetric[]
}

export type PathMeasurementSummary = {
  nodeIds: string[]
  targetLabel: string
  primaryLabel: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
  anchor: [number, number, number]
  points: Array<[number, number, number]>
  segmentCount: number
}

export type GridMetric = {
  id: 'axis-count' | 'bay-count' | 'total-span' | 'average-spacing' | 'grid-angle' | `bay:${number}`
  label: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
}

export type GridSummary = {
  nodeIds: string[]
  targetLabel: string
  primaryLabel: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
  anchor: [number, number, number]
  metrics: GridMetric[]
}

export type GridGuide = {
  id: 'total-span' | `bay:${number}`
  label: string
  value: number
  formattedValue: string
  start: [number, number, number]
  end: [number, number, number]
  kind: 'total' | 'bay'
  approximate: boolean
}

export type PerimeterMetric = {
  id:
    | 'perimeter'
    | 'span'
    | 'depth'
    | `span-bay:${number}`
    | `depth-bay:${number}`
    | 'front-setback'
    | 'back-setback'
    | 'left-setback'
    | 'right-setback'
    | 'opening-span'
    | 'opening-depth'
    | 'thickness'
    | 'run-length'
  label: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
  rule?: {
    target: number
    formattedTarget: string
    delta: number
    formattedDelta: string
    status: 'pass' | 'fail'
  }
}

export type PerimeterSummary = {
  nodeId: string
  targetLabel: string
  primaryLabel: string
  value: number
  formattedValue: string
  description: string
  approximate: boolean
  anchor: [number, number, number]
  metrics: PerimeterMetric[]
}

export type PerimeterGuide = {
  id: Extract<
    PerimeterMetric['id'],
    'span' | 'depth' | 'front-setback' | 'back-setback' | 'left-setback' | 'right-setback'
  >
  label: string
  value: number
  formattedValue: string
  start: [number, number, number]
  end: [number, number, number]
  kind: 'dimension' | 'setback'
  referenceStart?: [number, number, number]
  referenceEnd?: [number, number, number]
  referenceLabel?: string
  approximate: boolean
}

type MeasurementValueResult = {
  value: number
  label: string
  description: string
  approximate?: boolean
  metrics?: MeasurementMetric[]
}

export type ObjectBounds = {
  center: [number, number, number]
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
}

type PlanPoint = [number, number]

type FootprintResult = {
  points: PlanPoint[]
  approximate: boolean
}

type PlanRange = {
  min: number
  max: number
}

type LineLikeMeasurement = {
  id: string
  type: 'wall' | 'fence' | 'sketch-line'
  label: string
  y: number
  start: PlanPoint
  end: PlanPoint
  startTangent: PlanPoint
  endTangent: PlanPoint
  pathPoints: PlanPoint[]
  approximate: boolean
}

type SiteAwareFootprintContext = {
  site: SiteNode
  footprint: FootprintResult
  frontAxis: PlanPoint
  rightAxis: PlanPoint
  footprintFrontRange: PlanRange
  footprintRightRange: PlanRange
  siteFrontRange: PlanRange
  siteRightRange: PlanRange
}

const tempBox = new Box3()
const tempCenter = new Vector3()
const tempMax = new Vector3()
const tempMin = new Vector3()
const tempQuaternion = new Quaternion()
const tempSize = new Vector3()
const clearanceRaycaster = new Raycaster()
const clearanceOrigin = new Vector3()
const directionUp = new Vector3(0, 1, 0)

const CLEARANCE_EPSILON = 0.005
const CLEARANCE_MAX_DISTANCE = 200
const PLAN_POINT_EPSILON = 0.0001

function trimNumber(value: number, digits = 2) {
  return Number.parseFloat(value.toFixed(digits))
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI
}

function normalizeDegrees360(value: number) {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function normalizeDegrees180(value: number) {
  const normalized = normalizeDegrees360(value)
  return normalized >= 180 ? normalized - 180 : normalized
}

function getPlanVertexKey([x, z]: PlanPoint, precision = 10000) {
  return `${Math.round(x * precision)}:${Math.round(z * precision)}`
}

function isFinitePlanPoint(point: unknown): point is PlanPoint {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    typeof point[0] === 'number' &&
    Number.isFinite(point[0]) &&
    typeof point[1] === 'number' &&
    Number.isFinite(point[1])
  )
}

function getFinitePlanPoints(points: PlanPoint[]) {
  return points
    .filter((point): point is PlanPoint => isFinitePlanPoint(point))
    .map(([x, z]) => [x, z] as PlanPoint)
}

function arePlanPointsEqual(a: PlanPoint, b: PlanPoint, epsilon = PLAN_POINT_EPSILON) {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon
}

function getPlanSegmentOrientation(a: PlanPoint, b: PlanPoint, c: PlanPoint) {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  if (Math.abs(value) <= PLAN_POINT_EPSILON) return 0
  return value > 0 ? 1 : -1
}

function isPlanPointOnSegment(a: PlanPoint, point: PlanPoint, b: PlanPoint) {
  return (
    point[0] <= Math.max(a[0], b[0]) + PLAN_POINT_EPSILON &&
    point[0] >= Math.min(a[0], b[0]) - PLAN_POINT_EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + PLAN_POINT_EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - PLAN_POINT_EPSILON
  )
}

function doPlanSegmentsIntersect(
  aStart: PlanPoint,
  aEnd: PlanPoint,
  bStart: PlanPoint,
  bEnd: PlanPoint,
) {
  const o1 = getPlanSegmentOrientation(aStart, aEnd, bStart)
  const o2 = getPlanSegmentOrientation(aStart, aEnd, bEnd)
  const o3 = getPlanSegmentOrientation(bStart, bEnd, aStart)
  const o4 = getPlanSegmentOrientation(bStart, bEnd, aEnd)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && isPlanPointOnSegment(aStart, bStart, aEnd)) return true
  if (o2 === 0 && isPlanPointOnSegment(aStart, bEnd, aEnd)) return true
  if (o3 === 0 && isPlanPointOnSegment(bStart, aStart, bEnd)) return true
  if (o4 === 0 && isPlanPointOnSegment(bStart, aEnd, bEnd)) return true

  return false
}

function hasPolygonSelfIntersection(points: PlanPoint[]) {
  if (points.length < 4) return false

  for (let index = 0; index < points.length; index += 1) {
    const aStart = points[index]
    const aEnd = points[(index + 1) % points.length]
    if (!(aStart && aEnd)) continue

    for (let compareIndex = index + 1; compareIndex < points.length; compareIndex += 1) {
      const bStart = points[compareIndex]
      const bEnd = points[(compareIndex + 1) % points.length]
      if (!(bStart && bEnd)) continue

      const sharesVertex =
        index === compareIndex ||
        (index + 1) % points.length === compareIndex ||
        index === (compareIndex + 1) % points.length
      const wrapsSameEdge = index === 0 && compareIndex === points.length - 1

      if (sharesVertex || wrapsSameEdge) continue

      if (doPlanSegmentsIntersect(aStart, aEnd, bStart, bEnd)) {
        return true
      }
    }
  }

  return false
}

function normalizePlanPolygon(points: PlanPoint[]) {
  const finitePoints = getFinitePlanPoints(points)
  if (finitePoints.length < 3) return []

  const normalized: PlanPoint[] = []

  for (const point of finitePoints) {
    const next: PlanPoint = [point[0], point[1]]
    if (normalized.length === 0 || !arePlanPointsEqual(normalized[normalized.length - 1]!, next)) {
      normalized.push(next)
    }
  }

  if (
    normalized.length > 1 &&
    arePlanPointsEqual(normalized[0]!, normalized[normalized.length - 1]!)
  ) {
    normalized.pop()
  }

  const uniqueCount = new Set(normalized.map((point) => getPlanVertexKey(point))).size
  if (normalized.length < 3 || uniqueCount < 3) return []
  if (hasPolygonSelfIntersection(normalized)) return []

  return normalized
}

function getPlanPointBounds(points: PlanPoint[]) {
  const finitePoints = getFinitePlanPoints(points)
  if (finitePoints.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const [x, z] of finitePoints) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }

  if (![minX, maxX, minZ, maxZ].every((value) => Number.isFinite(value))) return null

  return { minX, maxX, minZ, maxZ }
}

function resolveMeasurementPrecision(
  value: number,
  defaultPrecision: number,
  formatOptions?: MeasurementFormatOptions,
) {
  return typeof formatOptions?.precision === 'number'
    ? formatOptions.precision
    : value >= 100
      ? Math.min(defaultPrecision, 1)
      : defaultPrecision
}

export function formatLength(
  value: number,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
) {
  if (unit === 'imperial') {
    if (typeof formatOptions?.precision === 'number') {
      return `${trimNumber(value * 3.280_84, formatOptions.precision)} ft`
    }

    const feet = value * 3.280_84
    const wholeFeet = Math.floor(feet)
    const inches = Math.round((feet - wholeFeet) * 12)
    if (inches === 12) return `${wholeFeet + 1}'0"`
    return `${wholeFeet}'${inches}"`
  }

  return `${trimNumber(value, resolveMeasurementPrecision(value, 2, formatOptions))} m`
}

export function formatArea(
  value: number,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
) {
  if (unit === 'imperial') {
    return `${trimNumber(value * 10.763_9, resolveMeasurementPrecision(value, 2, formatOptions))} ft²`
  }

  return `${trimNumber(value, resolveMeasurementPrecision(value, 2, formatOptions))} m²`
}

export function formatVolume(
  value: number,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
) {
  if (unit === 'imperial') {
    return `${trimNumber(value * 35.314_7, resolveMeasurementPrecision(value, 2, formatOptions))} ft³`
  }

  return `${trimNumber(value, resolveMeasurementPrecision(value, 2, formatOptions))} m³`
}

export function formatAngle(value: number, formatOptions?: MeasurementFormatOptions) {
  return `${trimNumber(value, resolveMeasurementPrecision(value, 1, formatOptions))}°`
}

export function formatPercent(value: number, formatOptions?: MeasurementFormatOptions) {
  return `${trimNumber(value, resolveMeasurementPrecision(value, 1, formatOptions))}%`
}

export function calculatePolygonArea(polygon: Array<[number, number]>) {
  const normalizedPolygon = normalizePlanPolygon(polygon)
  if (normalizedPolygon.length < 3) return 0

  let area = 0

  for (let index = 0; index < normalizedPolygon.length; index += 1) {
    const current = normalizedPolygon[index]
    const next = normalizedPolygon[(index + 1) % normalizedPolygon.length]

    if (!(current && next)) continue

    area += current[0] * next[1]
    area -= next[0] * current[1]
  }

  return Math.abs(area) / 2
}

export function calculatePolygonPerimeter(polygon: Array<[number, number]>) {
  const normalizedPolygon = normalizePlanPolygon(polygon)
  if (normalizedPolygon.length < 2) return 0

  let perimeter = 0

  for (let index = 0; index < normalizedPolygon.length; index += 1) {
    const current = normalizedPolygon[index]
    const next = normalizedPolygon[(index + 1) % normalizedPolygon.length]

    if (!(current && next)) continue

    perimeter += Math.hypot(next[0] - current[0], next[1] - current[1])
  }

  return perimeter
}

function getPlanDirectionVector(degrees: number): PlanPoint {
  const radians = (normalizeDegrees360(degrees) * Math.PI) / 180
  return [Math.sin(radians), -Math.cos(radians)]
}

function getSetbackReferenceLabel(
  guideId: Extract<
    PerimeterMetric['id'],
    'front-setback' | 'back-setback' | 'left-setback' | 'right-setback'
  >,
  orientationDegrees: number,
) {
  const referenceDegrees =
    guideId === 'front-setback'
      ? orientationDegrees
      : guideId === 'back-setback'
        ? orientationDegrees + 180
        : guideId === 'left-setback'
          ? orientationDegrees + 270
          : orientationDegrees + 90

  return `${getNearestOrientation(referenceDegrees).label}侧地界`
}

function getProjectedRange(points: PlanPoint[], axis: PlanPoint) {
  const finitePoints = getFinitePlanPoints(points)
  if (finitePoints.length === 0) return null

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const [x, z] of finitePoints) {
    const projection = x * axis[0] + z * axis[1]
    min = Math.min(min, projection)
    max = Math.max(max, projection)
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min, max }
}

const BAY_SPLIT_MIN_LENGTH = 0.3
const BAY_SPLIT_MAX_SEGMENTS = 8

function getProjectedCoordinates(points: PlanPoint[], axis: PlanPoint, precision = 1000) {
  const unique = new Map<number, number>()

  for (const [x, z] of getFinitePlanPoints(points)) {
    const projection = x * axis[0] + z * axis[1]
    const key = Math.round(projection * precision)
    if (!unique.has(key)) {
      unique.set(key, projection)
    }
  }

  return Array.from(unique.values()).sort((a, b) => a - b)
}

function getProjectedBaySegments(points: PlanPoint[], axis: PlanPoint) {
  const coordinates = getProjectedCoordinates(points, axis)
  if (coordinates.length < 3) return []

  const segments: number[] = []

  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const current = coordinates[index]
    if (!(typeof previous === 'number' && typeof current === 'number')) continue

    const length = current - previous
    if (length > BAY_SPLIT_MIN_LENGTH) {
      segments.push(length)
    }
  }

  if (segments.length <= 1 || segments.length > BAY_SPLIT_MAX_SEGMENTS) {
    return []
  }

  return segments
}

function createPerimeterBayMetrics(
  kind: 'span' | 'depth',
  segments: number[],
  unit: MeasurementUnit,
  description: string,
  approximate = false,
  formatOptions?: MeasurementFormatOptions,
) {
  return segments.map((segment, index) =>
    createPerimeterMetric(
      `${kind}-bay:${index + 1}`,
      `${kind === 'span' ? '面宽' : '进深'}分跨 ${index + 1}`,
      segment,
      unit,
      `${description}，第 ${index + 1} 跨`,
      approximate,
      formatOptions,
    ),
  )
}

function getClampedProjectedSpan(primary: PlanRange, site: PlanRange) {
  const overlapMin = Math.max(primary.min, site.min)
  const overlapMax = Math.min(primary.max, site.max)
  if (overlapMax - overlapMin > 0.0001) {
    return { min: overlapMin, max: overlapMax }
  }

  return { min: site.min, max: site.max }
}

function getLocalPlanPoints(nodeId: string, points: PlanPoint[], y = 0): PlanPoint[] {
  const object = sceneRegistry.nodes.get(nodeId)
  if (!object) return points

  return points.map(([x, z]) => {
    const world = object.localToWorld(new Vector3(x, y, z))
    return [world.x, world.z]
  })
}

function toPlanWorldPoint(
  frontProjection: number,
  rightProjection: number,
  frontAxis: PlanPoint,
  rightAxis: PlanPoint,
  y: number,
): [number, number, number] {
  return [
    frontAxis[0] * frontProjection + rightAxis[0] * rightProjection,
    y,
    frontAxis[1] * frontProjection + rightAxis[1] * rightProjection,
  ]
}

export function calculatePolygonAreaWithHoles(
  polygon: Array<[number, number]>,
  holes: Array<Array<[number, number]>> = [],
) {
  const normalizedPolygon = normalizePlanPolygon(polygon)
  if (normalizedPolygon.length < 3) return 0

  let area = calculatePolygonArea(normalizedPolygon)

  for (const hole of holes) {
    const normalizedHole = normalizePlanPolygon(hole)
    if (normalizedHole.length < 3) continue
    area -= calculatePolygonArea(normalizedHole)
  }

  return Math.max(0, area)
}

function calculatePolygonCentroid(polygon: Array<[number, number]>) {
  const normalizedPolygon = normalizePlanPolygon(polygon)
  if (normalizedPolygon.length === 0) return null

  let twiceArea = 0
  let centerX = 0
  let centerZ = 0

  for (let index = 0; index < normalizedPolygon.length; index += 1) {
    const current = normalizedPolygon[index]
    const next = normalizedPolygon[(index + 1) % normalizedPolygon.length]

    if (!(current && next)) continue

    const cross = current[0] * next[1] - next[0] * current[1]
    twiceArea += cross
    centerX += (current[0] + next[0]) * cross
    centerZ += (current[1] + next[1]) * cross
  }

  if (Math.abs(twiceArea) < 1e-6) {
    const total = normalizedPolygon.reduce(
      (acc, point) => ({ x: acc.x + point[0], z: acc.z + point[1] }),
      {
        x: 0,
        z: 0,
      },
    )

    return {
      x: total.x / normalizedPolygon.length,
      z: total.z / normalizedPolygon.length,
    }
  }

  return {
    x: centerX / (3 * twiceArea),
    z: centerZ / (3 * twiceArea),
  }
}

function getObjectBounds(nodeId: string): ObjectBounds | null {
  const object = sceneRegistry.nodes.get(nodeId)
  if (!object) return null

  tempBox.setFromObject(object)
  if (tempBox.isEmpty()) return null

  tempBox.getCenter(tempCenter)
  tempMin.copy(tempBox.min)
  tempMax.copy(tempBox.max)
  tempBox.getSize(tempSize)

  return {
    center: [tempCenter.x, tempCenter.y, tempCenter.z],
    min: [tempMin.x, tempMin.y, tempMin.z],
    max: [tempMax.x, tempMax.y, tempMax.z],
    size: [tempSize.x, tempSize.y, tempSize.z],
  }
}

function getBoundsFootprint(nodeId: string): FootprintResult {
  const bounds = getObjectBounds(nodeId)
  if (!bounds) return { points: [], approximate: true }

  return {
    points: [
      [bounds.min[0], bounds.min[2]],
      [bounds.min[0], bounds.max[2]],
      [bounds.max[0], bounds.min[2]],
      [bounds.max[0], bounds.max[2]],
    ],
    approximate: true,
  }
}

function mergeFootprintResults(results: FootprintResult[]): FootprintResult {
  return results.reduce<FootprintResult>(
    (acc, result) => ({
      points: [...acc.points, ...result.points],
      approximate: acc.approximate || result.approximate,
    }),
    { points: [], approximate: false },
  )
}

function getSiteNodeForMeasurement(node: AnyNode, nodes: Record<string, AnyNode>): SiteNode | null {
  let current: AnyNode | null = node

  while (current) {
    if (current.type === 'site') return current as SiteNode
    current = current.parentId ? (nodes[current.parentId] ?? null) : null
  }

  return (
    Object.values(nodes).find((candidate): candidate is SiteNode => candidate.type === 'site') ??
    null
  )
}

function getSiteAwareFootprintContext(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  footprint: FootprintResult,
): SiteAwareFootprintContext | null {
  const site = getSiteNodeForMeasurement(node, nodes)
  const sitePoints = normalizePlanPolygon(site?.polygon?.points ?? [])
  if (!(site && footprint.points.length > 1 && sitePoints.length > 2)) return null

  const orientationDegrees = getSiteOrientationDegrees(site)
  const frontAxis = getPlanDirectionVector(orientationDegrees)
  const rightAxis = getPlanDirectionVector(orientationDegrees + 90)
  const footprintFrontRange = getProjectedRange(footprint.points, frontAxis)
  const footprintRightRange = getProjectedRange(footprint.points, rightAxis)
  const siteFrontRange = getProjectedRange(sitePoints, frontAxis)
  const siteRightRange = getProjectedRange(sitePoints, rightAxis)

  if (!(footprintFrontRange && footprintRightRange && siteFrontRange && siteRightRange)) {
    return null
  }

  return {
    site,
    footprint,
    frontAxis,
    rightAxis,
    footprintFrontRange,
    footprintRightRange,
    siteFrontRange,
    siteRightRange,
  }
}

function getNodeFootprintResult(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  visited = new Set<string>(),
): FootprintResult {
  if (visited.has(node.id)) {
    return { points: [], approximate: true }
  }

  const nextVisited = new Set(visited)
  nextVisited.add(node.id)

  if (node.type === 'site') {
    const polygon = normalizePlanPolygon((node as SiteNode).polygon?.points ?? [])
    if (polygon.length > 2) {
      return {
        points: polygon,
        approximate: false,
      }
    }

    return getBoundsFootprint(node.id)
  }

  if (node.type === 'zone') {
    const polygon = normalizePlanPolygon(getLocalPlanPoints(node.id, (node as ZoneNode).polygon))
    if (polygon.length > 2) {
      return {
        points: polygon,
        approximate: false,
      }
    }

    return getBoundsFootprint(node.id)
  }

  if (node.type === 'slab') {
    const polygon = normalizePlanPolygon(getLocalPlanPoints(node.id, (node as SlabNode).polygon))
    if (polygon.length > 2) {
      return {
        points: polygon,
        approximate: false,
      }
    }

    return getBoundsFootprint(node.id)
  }

  if (node.type === 'ceiling') {
    const polygon = normalizePlanPolygon(getLocalPlanPoints(node.id, (node as CeilingNode).polygon))
    if (polygon.length > 2) {
      return {
        points: polygon,
        approximate: false,
      }
    }

    return getBoundsFootprint(node.id)
  }

  if (node.type === 'roof-segment') {
    const roof = node as RoofSegmentNode
    const halfSpan = (roof.width + roof.overhang * 2) / 2
    const halfDepth = (roof.depth + roof.overhang * 2) / 2

    return {
      points: normalizePlanPolygon(
        getLocalPlanPoints(node.id, [
          [-halfSpan, -halfDepth],
          [-halfSpan, halfDepth],
          [halfSpan, -halfDepth],
          [halfSpan, halfDepth],
        ]),
      ),
      approximate: false,
    }
  }

  if (node.type === 'item') {
    const [width, , depth] = getScaledDimensions(node as ItemNode)
    const halfWidth = width / 2
    const halfDepth = depth / 2

    return {
      points: getLocalPlanPoints(node.id, [
        [-halfWidth, -halfDepth],
        [-halfWidth, halfDepth],
        [halfWidth, -halfDepth],
        [halfWidth, halfDepth],
      ]),
      approximate: true,
    }
  }

  if (node.type === 'door') {
    const door = node as DoorNode
    const halfWidth = door.width / 2
    const halfDepth = door.frameDepth / 2

    return {
      points: getLocalPlanPoints(node.id, [
        [-halfWidth, -halfDepth],
        [-halfWidth, halfDepth],
        [halfWidth, -halfDepth],
        [halfWidth, halfDepth],
      ]),
      approximate: true,
    }
  }

  if (node.type === 'window') {
    const windowNode = node as WindowNode
    const halfWidth = windowNode.width / 2
    const halfDepth = windowNode.frameDepth / 2

    return {
      points: getLocalPlanPoints(node.id, [
        [-halfWidth, -halfDepth],
        [-halfWidth, halfDepth],
        [halfWidth, -halfDepth],
        [halfWidth, halfDepth],
      ]),
      approximate: true,
    }
  }

  if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
    const childResults = node.children
      .map((childId) => nodes[childId])
      .filter((child): child is AnyNode => Boolean(child))
      .map((child) => getNodeFootprintResult(child, nodes, nextVisited))
      .filter((result) => result.points.length > 0)

    if (childResults.length > 0) {
      return mergeFootprintResults(childResults)
    }
  }

  return getBoundsFootprint(node.id)
}

function getNodeLevelOffset(node: AnyNode, nodes: Record<string, AnyNode>) {
  let parentId = node.parentId

  while (parentId) {
    const parent = nodes[parentId]
    if (!parent) return 0
    if (parent.type === 'level') {
      return sceneRegistry.nodes.get(parent.id)?.position.y ?? 0
    }

    parentId = parent.parentId
  }

  return 0
}

function getFallbackAnchor(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): [number, number, number] {
  const bounds = getObjectBounds(node.id)
  if (bounds) {
    return [bounds.center[0], bounds.center[1] + 0.18, bounds.center[2]]
  }

  if ('polygon' in node && Array.isArray(node.polygon)) {
    const centroid = calculatePolygonCentroid(node.polygon)
    if (centroid) {
      return [centroid.x, getNodeLevelOffset(node, nodes) + 0.2, centroid.z]
    }
  }

  if ('position' in node && Array.isArray(node.position)) {
    return [node.position[0], node.position[1] + 0.2, node.position[2]]
  }

  return [0, 0.2, 0]
}

function getMeasurementTargetLabel(node: AnyNode) {
  if ('name' in node && typeof node.name === 'string' && node.name.trim()) {
    return node.name
  }

  switch (node.type) {
    case 'site':
      return '场地'
    case 'building':
      return '建筑'
    case 'level':
      return `楼层 ${(node as LevelNode).level}`
    case 'zone':
      return '区域'
    case 'wall':
      return '墙体'
    case 'fence':
      return '围栏'
    case 'sketch-line':
      return (node as SketchLineNode).construction ? '草图轴线' : '草图线'
    case 'slab':
      return '楼板'
    case 'ceiling':
      return '吊顶'
    case 'roof':
      return '屋顶'
    case 'roof-segment':
      return '屋顶分段'
    case 'stair':
      return '楼梯'
    case 'stair-segment':
      return '楼梯分段'
    case 'item':
      return (node as ItemNode).asset.name || '构件'
    case 'door':
      return '门'
    case 'window':
      return '窗'
    default:
      return node.type
  }
}

function zoneBounds(polygon: Array<[number, number]>) {
  const normalizedPolygon = normalizePlanPolygon(polygon)
  if (normalizedPolygon.length < 3) return null

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of normalizedPolygon) {
    if (!point) continue
    minX = Math.min(minX, point[0])
    maxX = Math.max(maxX, point[0])
    minZ = Math.min(minZ, point[1])
    maxZ = Math.max(maxZ, point[1])
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
    return null
  }

  return { minX, maxX, minZ, maxZ }
}

function boundsOverlapArea(
  first: ReturnType<typeof zoneBounds>,
  second: ReturnType<typeof zoneBounds>,
) {
  if (!(first && second)) return 0

  const overlapX = Math.max(
    0,
    Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX),
  )
  const overlapZ = Math.max(
    0,
    Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ),
  )
  return overlapX * overlapZ
}

function inferZoneHeight(zone: ZoneNode, nodes: Record<string, AnyNode>) {
  const levelNode = zone.parentId ? nodes[zone.parentId] : null
  if (levelNode?.type !== 'level') {
    return {
      height: DEFAULT_WALL_HEIGHT,
      approximate: true,
      description: '按默认墙高估算的区域净高',
    }
  }

  const zonePolygonBounds = zoneBounds(zone.polygon)
  const ceilingHeights = levelNode.children
    .map((childId) => nodes[childId])
    .filter((node): node is CeilingNode => node?.type === 'ceiling')
    .filter((ceiling) => boundsOverlapArea(zonePolygonBounds, zoneBounds(ceiling.polygon)) > 0.01)
    .map((ceiling) => ceiling.height)
    .filter((height): height is number => Number.isFinite(height) && height > 0)

  if (ceilingHeights.length > 0) {
    return {
      height: Math.min(...ceilingHeights),
      approximate: true,
      description: '按区域上方吊顶高度估算的净高',
    }
  }

  const wallHeights = levelNode.children
    .map((childId) => nodes[childId])
    .filter((node): node is WallNode => node?.type === 'wall')
    .filter((wall) => {
      const startInside = pointInPolygon(wall.start[0], wall.start[1], zone.polygon)
      const endInside = pointInPolygon(wall.end[0], wall.end[1], zone.polygon)
      return startInside || endInside
    })
    .map((wall) => wall.height ?? DEFAULT_WALL_HEIGHT)

  if (wallHeights.length > 0) {
    return {
      height: wallHeights.reduce((sum, height) => sum + height, 0) / wallHeights.length,
      approximate: true,
      description: '按区域周边墙高估算的净高',
    }
  }

  return {
    height: DEFAULT_WALL_HEIGHT,
    approximate: true,
    description: '按默认墙高估算的区域净高',
  }
}

function inferLevelHeight(level: LevelNode, nodes: Record<string, AnyNode>) {
  const ceilingHeights = level.children
    .map((childId) => nodes[childId])
    .filter((node): node is CeilingNode => node?.type === 'ceiling')
    .map((ceiling) => ceiling.height)
    .filter((height): height is number => Number.isFinite(height) && height > 0)

  if (ceilingHeights.length > 0) {
    return {
      height: Math.min(...ceilingHeights),
      approximate: true,
      description: '按本层最低吊顶高度估算的净高',
    }
  }

  const wallHeights = level.children
    .map((childId) => nodes[childId])
    .filter((node): node is WallNode => node?.type === 'wall')
    .map((wall) => wall.height ?? DEFAULT_WALL_HEIGHT)

  if (wallHeights.length > 0) {
    return {
      height: wallHeights.reduce((sum, height) => sum + height, 0) / wallHeights.length,
      approximate: true,
      description: '按本层墙高估算的净高',
    }
  }

  return {
    height: DEFAULT_WALL_HEIGHT,
    approximate: true,
    description: '按默认墙高估算的净高',
  }
}

type RoofHeightProfile = {
  eaveMin: number
  eaveMax: number
  ridgeMax: number
  approximate: boolean
  segmentCount: number
}

type RoofParapetProfile = {
  parapetMax: number
  approximate: boolean
  segmentCount: number
}

function getNodeWorldY(nodeId: string) {
  return sceneRegistry.nodes.get(nodeId)?.position.y ?? 0
}

function getSortedLevelsForBuilding(building: BuildingNode, nodes: Record<string, AnyNode>) {
  return building.children
    .map((childId) => nodes[childId])
    .filter((child): child is LevelNode => child?.type === 'level')
    .sort((first, second) => {
      const yDelta = getNodeWorldY(first.id) - getNodeWorldY(second.id)
      if (Math.abs(yDelta) > 0.0001) return yDelta
      return first.level - second.level
    })
}

function collectRoofSegments(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  visited = new Set<string>(),
): RoofSegmentNode[] {
  if (visited.has(node.id)) return []

  const nextVisited = new Set(visited)
  nextVisited.add(node.id)

  if (node.type === 'roof-segment') {
    return [node as RoofSegmentNode]
  }

  if (!('children' in node) || !Array.isArray(node.children)) {
    return []
  }

  return node.children.flatMap((childId) => {
    const child = typeof childId === 'string' ? nodes[childId] : null
    return child ? collectRoofSegments(child, nodes, nextVisited) : []
  })
}

function getRoofHeightProfile(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): RoofHeightProfile | null {
  const segments = collectRoofSegments(node, nodes)
  if (segments.length === 0) return null

  let eaveMin = Number.POSITIVE_INFINITY
  let eaveMax = Number.NEGATIVE_INFINITY
  let ridgeMax = Number.NEGATIVE_INFINITY
  let approximate = false

  for (const segment of segments) {
    const baseY = getNodeWorldY(segment.id)
    const eaveHeight = baseY + Math.max(0, segment.wallHeight)
    const ridgeHeight =
      baseY +
      Math.max(0, segment.wallHeight + (segment.roofType === 'flat' ? 0 : segment.roofHeight))

    if (!Number.isFinite(baseY)) {
      approximate = true
      continue
    }

    eaveMin = Math.min(eaveMin, eaveHeight)
    eaveMax = Math.max(eaveMax, eaveHeight)
    ridgeMax = Math.max(ridgeMax, ridgeHeight)

    if (!sceneRegistry.nodes.get(segment.id)) {
      approximate = true
    }
  }

  if (!Number.isFinite(eaveMax) || !Number.isFinite(ridgeMax)) {
    return null
  }

  return {
    eaveMin,
    eaveMax,
    ridgeMax,
    approximate,
    segmentCount: segments.length,
  }
}

function getRoofParapetProfile(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): RoofParapetProfile | null {
  const segments = collectRoofSegments(node, nodes).filter(
    (segment) => segment.roofType === 'flat' && segment.wallHeight > 0.0001,
  )
  if (segments.length === 0) return null

  let parapetMax = Number.NEGATIVE_INFINITY
  let approximate = false

  for (const segment of segments) {
    parapetMax = Math.max(parapetMax, Math.max(0, segment.wallHeight))

    if (!sceneRegistry.nodes.get(segment.id)) {
      approximate = true
    }
  }

  if (!Number.isFinite(parapetMax)) return null

  return {
    parapetMax,
    approximate,
    segmentCount: segments.length,
  }
}

function getBuildingBaseY(building: BuildingNode, nodes: Record<string, AnyNode>) {
  const levels = getSortedLevelsForBuilding(building, nodes)
  if (levels.length > 0) {
    return getNodeWorldY(levels[0]!.id)
  }

  return getObjectBounds(building.id)?.min[1] ?? getNodeWorldY(building.id)
}

function inferStoryHeight(level: LevelNode, nodes: Record<string, AnyNode>) {
  const currentY = getNodeWorldY(level.id)
  const building = level.parentId ? nodes[level.parentId] : null

  if (building?.type === 'building') {
    const levels = getSortedLevelsForBuilding(building as BuildingNode, nodes)
    const currentIndex = levels.findIndex((entry) => entry.id === level.id)
    const nextLevel = currentIndex >= 0 ? levels[currentIndex + 1] : undefined
    if (nextLevel) {
      const height = getNodeWorldY(nextLevel.id) - currentY
      if (height > 0.0001) {
        return {
          height,
          approximate: false,
          description: '按本层与上一层基准面高差得到的层高',
        }
      }
    }
  }

  const roofProfile = getRoofHeightProfile(level, nodes)
  if (roofProfile) {
    const height = roofProfile.eaveMax - currentY
    if (height > 0.0001) {
      return {
        height,
        approximate: roofProfile.approximate,
        description: '按本层屋顶檐口高度估算的顶层层高',
      }
    }
  }

  const inferred = inferLevelHeight(level, nodes)
  return {
    height: inferred.height,
    approximate: true,
    description: '缺少相邻楼层基准面时，按本层净高近似层高',
  }
}

function buildPlanHeadroomSamplePoints(points: PlanPoint[], y: number) {
  const bounds = zoneBounds(points)
  if (!bounds) return []

  const insetX = Math.min((bounds.maxX - bounds.minX) * 0.18, 0.45)
  const insetZ = Math.min((bounds.maxZ - bounds.minZ) * 0.18, 0.45)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const centroid = calculatePolygonCentroid(points)
  const candidates: PlanPoint[] = [
    centroid ? [centroid.x, centroid.z] : [centerX, centerZ],
    [centerX, centerZ],
    [bounds.minX + insetX, bounds.minZ + insetZ],
    [bounds.minX + insetX, bounds.maxZ - insetZ],
    [bounds.maxX - insetX, bounds.minZ + insetZ],
    [bounds.maxX - insetX, bounds.maxZ - insetZ],
  ]

  const unique = new Map<string, PlanPoint>()
  for (const point of candidates) {
    unique.set(getPlanPointKey(point, 100), point)
  }

  return Array.from(unique.values()).map((point) => new Vector3(point[0], y, point[1]))
}

function measureHeadroomFromFootprint(
  points: PlanPoint[],
  originY: number,
  excludedRoot: Object3D | null,
) {
  if (points.length === 0) return null

  const roots = getMeasurementRaycastRoots()
  const origins = buildPlanHeadroomSamplePoints(points, originY)
  if (origins.length === 0) return null

  return measureDirectionalClearance(roots, origins, directionUp, excludedRoot)
}

function isVisibleInHierarchy(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible || current.userData.__raycastDisabled === true) return false
    current = current.parent
  }
  return true
}

function isTransformControlObject(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    const candidate = current as Object3D & {
      isTransformControls?: boolean
      isTransformControlsGizmo?: boolean
    }

    if (
      candidate.isTransformControls ||
      candidate.isTransformControlsGizmo ||
      current.type === 'TransformControlsGizmo'
    ) {
      return true
    }

    current = current.parent
  }

  return false
}

function isSameOrDescendant(object: Object3D, target: Object3D | null) {
  if (!target) return false

  let current: Object3D | null = object
  while (current) {
    if (current === target) return true
    current = current.parent
  }

  return false
}

function getMeasurementRaycastRoots() {
  const roots = Array.from(new Set(sceneRegistry.nodes.values()))
  const registered = new Set(roots)

  return roots.filter((object) => {
    let current = object.parent
    while (current) {
      if (registered.has(current)) return false
      current = current.parent
    }

    return true
  })
}

function measureDirectionalClearance(
  roots: Object3D[],
  origins: Vector3[],
  direction: Vector3,
  excludedRoot: Object3D | null,
) {
  let minimum: number | null = null

  for (const origin of origins) {
    clearanceOrigin.copy(origin).addScaledVector(direction, CLEARANCE_EPSILON)
    clearanceRaycaster.far = CLEARANCE_MAX_DISTANCE
    clearanceRaycaster.set(clearanceOrigin, direction)

    const hit = clearanceRaycaster
      .intersectObjects(roots, true)
      .find(
        (intersection) =>
          intersection.distance >= 0 &&
          isVisibleInHierarchy(intersection.object) &&
          !isTransformControlObject(intersection.object) &&
          !isSameOrDescendant(intersection.object, excludedRoot),
      )

    if (hit) {
      const distance = Math.max(0, hit.distance)
      minimum = minimum === null ? distance : Math.min(minimum, distance)
    }
  }

  return minimum
}

function buildVerticalSamplePoints(bounds: ObjectBounds, surface: 'top' | 'bottom') {
  const y = surface === 'top' ? bounds.max[1] : bounds.min[1]
  const insetX = Math.min(bounds.size[0] * 0.2, 0.08)
  const insetZ = Math.min(bounds.size[2] * 0.2, 0.08)

  return [
    new Vector3(bounds.center[0], y, bounds.center[2]),
    new Vector3(bounds.min[0] + insetX, y, bounds.min[2] + insetZ),
    new Vector3(bounds.min[0] + insetX, y, bounds.max[2] - insetZ),
    new Vector3(bounds.max[0] - insetX, y, bounds.min[2] + insetZ),
    new Vector3(bounds.max[0] - insetX, y, bounds.max[2] - insetZ),
  ]
}

function buildDirectionalSamplePoints(bounds: ObjectBounds, direction: Vector3) {
  const halfHeightInset = Math.min(bounds.size[1] * 0.25, 0.22)
  const supportX =
    Math.abs(direction.x) < 1e-6
      ? bounds.center[0]
      : bounds.center[0] + Math.sign(direction.x) * (bounds.size[0] / 2)
  const supportZ =
    Math.abs(direction.z) < 1e-6
      ? bounds.center[2]
      : bounds.center[2] + Math.sign(direction.z) * (bounds.size[2] / 2)

  return [
    new Vector3(supportX, bounds.center[1], supportZ),
    new Vector3(supportX, bounds.min[1] + halfHeightInset, supportZ),
    new Vector3(supportX, bounds.max[1] - halfHeightInset, supportZ),
  ]
}

function getObjectHorizontalAxes(object: Object3D) {
  object.getWorldQuaternion(tempQuaternion)

  const forward = new Vector3(0, 0, 1).applyQuaternion(tempQuaternion).setY(0)
  const right = new Vector3(1, 0, 0).applyQuaternion(tempQuaternion).setY(0)

  if (forward.lengthSq() < 1e-6) {
    forward.set(0, 0, 1)
  } else {
    forward.normalize()
  }

  if (right.lengthSq() < 1e-6) {
    right.set(1, 0, 0)
  } else {
    right.normalize()
  }

  return {
    forward,
    back: forward.clone().multiplyScalar(-1),
    right,
    left: right.clone().multiplyScalar(-1),
  }
}

function createClearanceMetric(
  id: ClearanceMetric['id'],
  label: string,
  value: number,
  unit: MeasurementUnit,
  description: string,
  approximate = false,
  formatOptions?: MeasurementFormatOptions,
): ClearanceMetric {
  return {
    id,
    label,
    value,
    formattedValue: formatLength(value, unit, formatOptions),
    description,
    approximate,
  }
}

function createBoundsMetric(
  id: BoundsMetric['id'],
  label: string,
  value: number,
  unit: MeasurementUnit,
  description: string,
  approximate = false,
  formatOptions?: MeasurementFormatOptions,
): BoundsMetric {
  return {
    id,
    label,
    value,
    formattedValue: formatLength(value, unit, formatOptions),
    description,
    approximate,
  }
}

function createMeasurementMetric(
  kind: MeasurementSummaryKind,
  id: string,
  label: string,
  value: number,
  unit: MeasurementUnit,
  description: string,
  approximate = false,
  formatOptions?: MeasurementFormatOptions,
): MeasurementMetric {
  return {
    id,
    label,
    value,
    formattedValue:
      kind === 'area'
        ? formatArea(value, unit, formatOptions)
        : formatVolume(value, unit, formatOptions),
    description,
    approximate,
  }
}

function createAngleMetric(
  id: AngleMetric['id'],
  label: string,
  value: number,
  description: string,
  approximate = false,
  kind: 'angle' | 'percent' | 'text' = 'angle',
  formattedValue?: string,
  formatOptions?: MeasurementFormatOptions,
): AngleMetric {
  return {
    id,
    label,
    value,
    formattedValue:
      kind === 'text'
        ? (formattedValue ?? '')
        : kind === 'percent'
          ? formatPercent(value, formatOptions)
          : formatAngle(value, formatOptions),
    description,
    approximate,
  }
}

function createGridMetric(
  id: GridMetric['id'],
  label: string,
  value: number,
  description: string,
  approximate = false,
  kind: 'length' | 'angle' | 'count' = 'length',
  unit?: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): GridMetric {
  return {
    id,
    label,
    value,
    formattedValue:
      kind === 'angle'
        ? formatAngle(value, formatOptions)
        : kind === 'count'
          ? `${trimNumber(value, 0)} ${label === '跨数' ? '跨' : '条'}`
          : formatLength(value, unit ?? 'metric', formatOptions),
    description,
    approximate,
  }
}

function formatDirectionLabel(degrees: number, formatOptions?: MeasurementFormatOptions) {
  const normalized = normalizeDegrees360(degrees)
  const precision = typeof formatOptions?.precision === 'number' ? formatOptions.precision : 1
  return `${getNearestOrientation(normalized).label} (${trimNumber(normalized, precision)}°)`
}

function createDirectionMetric(
  id: AngleMetric['id'],
  label: string,
  directions: number[],
  description: string,
  approximate = false,
  formatOptions?: MeasurementFormatOptions,
) {
  const normalized = directions.map((value) => normalizeDegrees360(value))
  const precision = typeof formatOptions?.precision === 'number' ? formatOptions.precision : 1
  const uniqueDirections = Array.from(
    new Set(normalized.map((value) => trimNumber(value, precision))),
  ).sort((a, b) => a - b)

  return createAngleMetric(
    id,
    label,
    uniqueDirections[0] ?? 0,
    description,
    approximate,
    'text',
    uniqueDirections.map((value) => formatDirectionLabel(value, formatOptions)).join(' / '),
    formatOptions,
  )
}

function getRoofSlopeDirections(node: RoofSegmentNode): number[] {
  const rotation = normalizeDegrees360(radiansToDegrees(node.rotation))

  if (node.roofType === 'flat') return []

  if (node.roofType === 'shed') {
    return [normalizeDegrees360(rotation + 180)]
  }

  if (node.roofType === 'gable' || node.roofType === 'gambrel') {
    return [normalizeDegrees360(rotation), normalizeDegrees360(rotation + 180)]
  }

  if (node.roofType === 'hip' || node.roofType === 'mansard') {
    return [
      normalizeDegrees360(rotation),
      normalizeDegrees360(rotation + 90),
      normalizeDegrees360(rotation + 180),
      normalizeDegrees360(rotation + 270),
    ]
  }

  if (node.roofType === 'dutch') {
    const primaryAxis = node.width >= node.depth ? rotation : rotation + 90
    return [
      normalizeDegrees360(primaryAxis),
      normalizeDegrees360(primaryAxis + 90),
      normalizeDegrees360(primaryAxis + 180),
      normalizeDegrees360(primaryAxis + 270),
    ]
  }

  return []
}

function createPerimeterMetric(
  id: PerimeterMetric['id'],
  label: string,
  value: number,
  unit: MeasurementUnit,
  description: string,
  approximate = false,
  formatOptions?: MeasurementFormatOptions,
  rule?: PerimeterMetric['rule'],
): PerimeterMetric {
  return {
    id,
    label,
    value,
    formattedValue: formatLength(value, unit, formatOptions),
    description,
    approximate,
    rule,
  }
}

function getRectanglePerimeter(width: number, depth: number) {
  return Math.max(0, width) * 2 + Math.max(0, depth) * 2
}

function createPlanEnvelopeMetrics({
  span,
  depth,
  unit,
  formatOptions,
  spanBreakdown = [],
  depthBreakdown = [],
  spanBreakdownDescription,
  depthBreakdownDescription,
  perimeterValue = getRectanglePerimeter(span, depth),
  perimeterLabel = '周长',
  spanLabel = '开间',
  depthLabel = '进深',
  perimeterDescription,
  spanDescription,
  depthDescription,
  approximate = false,
}: {
  span: number
  depth: number
  unit: MeasurementUnit
  formatOptions?: MeasurementFormatOptions
  spanBreakdown?: number[]
  depthBreakdown?: number[]
  spanBreakdownDescription?: string
  depthBreakdownDescription?: string
  perimeterValue?: number
  perimeterLabel?: string
  spanLabel?: string
  depthLabel?: string
  perimeterDescription: string
  spanDescription: string
  depthDescription: string
  approximate?: boolean
}) {
  const safeSpan = Math.max(0, span)
  const safeDepth = Math.max(0, depth)
  const metrics: PerimeterMetric[] = []

  if (perimeterValue > 0.0001) {
    metrics.push(
      createPerimeterMetric(
        'perimeter',
        perimeterLabel,
        perimeterValue,
        unit,
        perimeterDescription,
        approximate,
        formatOptions,
      ),
    )
  }

  if (safeSpan > 0.0001) {
    metrics.push(
      createPerimeterMetric(
        'span',
        spanLabel,
        safeSpan,
        unit,
        spanDescription,
        approximate,
        formatOptions,
      ),
    )
  }

  if (safeDepth > 0.0001) {
    metrics.push(
      createPerimeterMetric(
        'depth',
        depthLabel,
        safeDepth,
        unit,
        depthDescription,
        approximate,
        formatOptions,
      ),
    )
  }

  if (spanBreakdown.length > 1) {
    metrics.push(
      ...createPerimeterBayMetrics(
        'span',
        spanBreakdown,
        unit,
        spanBreakdownDescription ?? '按平面边界拐点拆分得到的面宽分跨',
        approximate,
        formatOptions,
      ),
    )
  }

  if (depthBreakdown.length > 1) {
    metrics.push(
      ...createPerimeterBayMetrics(
        'depth',
        depthBreakdown,
        unit,
        depthBreakdownDescription ?? '按平面边界拐点拆分得到的进深分跨',
        approximate,
        formatOptions,
      ),
    )
  }

  return metrics
}

function createBoundsFallbackPerimeterMetrics({
  node,
  nodes,
  unit,
  formatOptions,
  perimeterLabel = '占地周长',
  perimeterDescription,
  spanDescription,
  depthDescription,
}: {
  node: AnyNode
  nodes: Record<string, AnyNode>
  unit: MeasurementUnit
  formatOptions?: MeasurementFormatOptions
  perimeterLabel?: string
  perimeterDescription: string
  spanDescription: string
  depthDescription: string
}) {
  const fallbackFootprint = getNodeFootprintResult(node, nodes)
  const bounds = getObjectBounds(node.id)
  const footprintBounds = getPlanPointBounds(fallbackFootprint.points)
  const span = bounds
    ? bounds.size[0]
    : footprintBounds
      ? footprintBounds.maxX - footprintBounds.minX
      : 0
  const depth = bounds
    ? bounds.size[2]
    : footprintBounds
      ? footprintBounds.maxZ - footprintBounds.minZ
      : 0

  if (span <= 0.0001 || depth <= 0.0001) return []

  return createPlanEnvelopeMetrics({
    span,
    depth,
    unit,
    formatOptions,
    spanBreakdown: getProjectedBaySegments(fallbackFootprint.points, [1, 0]),
    depthBreakdown: getProjectedBaySegments(fallbackFootprint.points, [0, 1]),
    perimeterLabel,
    perimeterDescription,
    spanDescription,
    depthDescription,
    spanBreakdownDescription: '按对象轮廓拐点在平面 X 方向拆分得到的面宽分跨',
    depthBreakdownDescription: '按对象轮廓拐点在平面 Z 方向拆分得到的进深分跨',
    approximate: true,
  })
}

function createSiteAwareFootprintMetrics({
  node,
  nodes,
  unit,
  formatOptions,
  footprint,
  perimeterLabel = '周长',
  perimeterValue,
  perimeterDescription,
  includeSetbacks = true,
  approximate = false,
}: {
  node: AnyNode
  nodes: Record<string, AnyNode>
  unit: MeasurementUnit
  formatOptions?: MeasurementFormatOptions
  footprint: FootprintResult
  perimeterLabel?: string
  perimeterValue?: number
  perimeterDescription: string
  includeSetbacks?: boolean
  approximate?: boolean
}) {
  const context = getSiteAwareFootprintContext(node, nodes, footprint)
  if (!context) return null
  const {
    footprintFrontRange,
    footprintRightRange,
    frontAxis,
    rightAxis,
    site,
    siteFrontRange,
    siteRightRange,
  } = context

  const faceWidth = footprintRightRange.max - footprintRightRange.min
  const orientedDepth = footprintFrontRange.max - footprintFrontRange.min
  const spanBreakdown = getProjectedBaySegments(footprint.points, rightAxis)
  const depthBreakdown = getProjectedBaySegments(footprint.points, frontAxis)
  const metrics: PerimeterMetric[] = []
  const isApproximate = footprint.approximate || approximate
  const setbackRules = getSiteSetbackRules(site)

  const resolvedPerimeterValue = perimeterValue ?? getRectanglePerimeter(faceWidth, orientedDepth)
  if (resolvedPerimeterValue > 0.0001) {
    metrics.push(
      createPerimeterMetric(
        'perimeter',
        perimeterLabel,
        resolvedPerimeterValue,
        unit,
        perimeterDescription,
        isApproximate,
        formatOptions,
      ),
    )
  }

  if (faceWidth > 0.0001) {
    metrics.push(
      createPerimeterMetric(
        'span',
        '面宽',
        faceWidth,
        unit,
        `${getMeasurementTargetLabel(node)}沿场地横向轴线投影得到的面宽`,
        isApproximate,
        formatOptions,
      ),
    )
  }

  if (orientedDepth > 0.0001) {
    metrics.push(
      createPerimeterMetric(
        'depth',
        '进深',
        orientedDepth,
        unit,
        `${getMeasurementTargetLabel(node)}沿场地纵向轴线投影得到的进深`,
        isApproximate,
        formatOptions,
      ),
    )
  }

  if (spanBreakdown.length > 1) {
    metrics.push(
      ...createPerimeterBayMetrics(
        'span',
        spanBreakdown,
        unit,
        `${getMeasurementTargetLabel(node)}按轮廓拐点在场地横向轴线投影拆分得到的面宽分跨`,
        isApproximate,
        formatOptions,
      ),
    )
  }

  if (depthBreakdown.length > 1) {
    metrics.push(
      ...createPerimeterBayMetrics(
        'depth',
        depthBreakdown,
        unit,
        `${getMeasurementTargetLabel(node)}按轮廓拐点在场地纵向轴线投影拆分得到的进深分跨`,
        isApproximate,
        formatOptions,
      ),
    )
  }

  if (includeSetbacks && node.type !== 'site') {
    const setbackDescription = '按场地朝向轴线投影得到，负值表示对象已超出场地边界'
    const setbacks: Array<{
      id: Extract<
        PerimeterMetric['id'],
        'front-setback' | 'back-setback' | 'left-setback' | 'right-setback'
      >
      label: string
      value: number
    }> = [
      {
        id: 'front-setback',
        label: '前退距',
        value: siteFrontRange.max - footprintFrontRange.max,
      },
      {
        id: 'back-setback',
        label: '后退距',
        value: footprintFrontRange.min - siteFrontRange.min,
      },
      {
        id: 'left-setback',
        label: '左退距',
        value: footprintRightRange.min - siteRightRange.min,
      },
      {
        id: 'right-setback',
        label: '右退距',
        value: siteRightRange.max - footprintRightRange.max,
      },
    ]

    for (const setback of setbacks) {
      const ruleTarget =
        setback.id === 'front-setback'
          ? setbackRules.front
          : setback.id === 'back-setback'
            ? setbackRules.back
            : setback.id === 'left-setback'
              ? setbackRules.left
              : setbackRules.right
      const hasRule = typeof ruleTarget === 'number' && Number.isFinite(ruleTarget)

      if (!hasRule && Math.abs(setback.value) <= 0.0001) continue

      const delta = hasRule ? setback.value - ruleTarget : null
      const rule =
        hasRule && delta !== null
          ? {
              target: ruleTarget,
              formattedTarget: formatLength(ruleTarget, unit, formatOptions),
              delta,
              formattedDelta: formatLength(Math.abs(delta), unit, formatOptions),
              status: delta >= -0.0001 ? ('pass' as const) : ('fail' as const),
            }
          : undefined

      metrics.push(
        createPerimeterMetric(
          setback.id,
          setback.label,
          setback.value,
          unit,
          hasRule
            ? `${setbackDescription}；当前规则要求不小于 ${formatLength(ruleTarget!, unit, formatOptions)}`
            : setbackDescription,
          isApproximate,
          formatOptions,
          rule,
        ),
      )
    }
  }

  return metrics
}

function getObjectPlanRotationDegrees(node: AnyNode) {
  if (!('rotation' in node)) return null

  const { rotation } = node as AnyNode & {
    rotation?: number | [number, number, number]
  }

  if (typeof rotation === 'number') {
    return normalizeDegrees360(radiansToDegrees(rotation))
  }

  if (Array.isArray(rotation) && typeof rotation[1] === 'number') {
    return normalizeDegrees360(radiansToDegrees(rotation[1]))
  }

  return null
}

function getLinePlanAngle(start: [number, number], end: [number, number]) {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]

  if (Math.hypot(dx, dz) < 1e-6) return null
  return normalizeDegrees180(radiansToDegrees(Math.atan2(dz, dx)))
}

function normalizePlanVector(vector: PlanPoint): PlanPoint | null {
  const length = Math.hypot(vector[0], vector[1])
  if (length < 1e-6) return null
  return [vector[0] / length, vector[1] / length]
}

function reversePlanVector(vector: PlanPoint): PlanPoint {
  return [-vector[0], -vector[1]]
}

function toWorldPlanPoint(point: PlanPoint, y: number): [number, number, number] {
  return [point[0], y, point[1]]
}

function getPlanPointDistance(a: PlanPoint, b: PlanPoint) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function getPlanPointKey(point: PlanPoint, precision = 1000) {
  return `${Math.round(point[0] * precision)},${Math.round(point[1] * precision)}`
}

function getMidpointPlan(a: PlanPoint, b: PlanPoint): PlanPoint {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

function getLineIntersection(
  firstStart: PlanPoint,
  firstEnd: PlanPoint,
  secondStart: PlanPoint,
  secondEnd: PlanPoint,
): PlanPoint | null {
  const x1 = firstStart[0]
  const y1 = firstStart[1]
  const x2 = firstEnd[0]
  const y2 = firstEnd[1]
  const x3 = secondStart[0]
  const y3 = secondStart[1]
  const x4 = secondEnd[0]
  const y4 = secondEnd[1]

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denominator) < 1e-6) return null

  const determinantA = x1 * y2 - y1 * x2
  const determinantB = x3 * y4 - y3 * x4

  return [
    (determinantA * (x3 - x4) - (x1 - x2) * determinantB) / denominator,
    (determinantA * (y3 - y4) - (y1 - y2) * determinantB) / denominator,
  ]
}

function getLineLikeMeasurement(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  options?: { includeSketchLines?: boolean },
): LineLikeMeasurement | null {
  const y = getNodeLevelOffset(node, nodes) + 0.08

  if (node.type === 'wall') {
    const wall = node as WallNode
    const pathPoints = sampleWallCenterline(wall).map((point) => [point.x, point.y] as PlanPoint)
    if (pathPoints.length < 2) return null

    const startFrame = getWallCurveFrameAt(wall, 0)
    const endFrame = getWallCurveFrameAt(wall, 1)
    const fallbackDirection = normalizePlanVector([
      wall.end[0] - wall.start[0],
      wall.end[1] - wall.start[1],
    ])

    return {
      id: wall.id,
      type: 'wall',
      label: getMeasurementTargetLabel(wall),
      y,
      start: [wall.start[0], wall.start[1]],
      end: [wall.end[0], wall.end[1]],
      startTangent: normalizePlanVector([startFrame.tangent.x, startFrame.tangent.y]) ??
        fallbackDirection ?? [1, 0],
      endTangent: normalizePlanVector([endFrame.tangent.x, endFrame.tangent.y]) ??
        fallbackDirection ?? [1, 0],
      pathPoints,
      approximate: isCurvedWall(wall),
    }
  }

  if (node.type === 'fence') {
    const fence = node as FenceNode
    const direction = normalizePlanVector([
      fence.end[0] - fence.start[0],
      fence.end[1] - fence.start[1],
    ])
    if (!direction) return null

    return {
      id: fence.id,
      type: 'fence',
      label: getMeasurementTargetLabel(fence),
      y,
      start: [fence.start[0], fence.start[1]],
      end: [fence.end[0], fence.end[1]],
      startTangent: direction,
      endTangent: direction,
      pathPoints: [
        [fence.start[0], fence.start[1]],
        [fence.end[0], fence.end[1]],
      ],
      approximate: false,
    }
  }

  if (options?.includeSketchLines && node.type === 'sketch-line') {
    const line = node as SketchLineNode
    if (getSketchLineChordLength(line) < 1e-6) return null

    const pathPoints = sampleSketchLineCenterline(line, 36).map(
      (point) => [point.x, point.y] as PlanPoint,
    )
    if (pathPoints.length < 2) return null

    const startDirection = normalizePlanVector([
      pathPoints[1]![0] - pathPoints[0]![0],
      pathPoints[1]![1] - pathPoints[0]![1],
    ])
    const endDirection = normalizePlanVector([
      pathPoints[pathPoints.length - 1]![0] - pathPoints[pathPoints.length - 2]![0],
      pathPoints[pathPoints.length - 1]![1] - pathPoints[pathPoints.length - 2]![1],
    ])
    const chordDirection = normalizePlanVector([
      line.end[0] - line.start[0],
      line.end[1] - line.start[1],
    ])

    return {
      id: line.id,
      type: 'sketch-line',
      label: getMeasurementTargetLabel(line),
      y,
      start: [line.start[0], line.start[1]],
      end: [line.end[0], line.end[1]],
      startTangent: startDirection ?? chordDirection ?? [1, 0],
      endTangent: endDirection ?? chordDirection ?? [1, 0],
      pathPoints,
      approximate: typeof line.curveOffset === 'number' && Math.abs(line.curveOffset) > 0.0001,
    }
  }

  return null
}

function getComparisonVector(line: LineLikeMeasurement, side: 'start' | 'end'): PlanPoint | null {
  if (side === 'start') {
    return normalizePlanVector(line.startTangent)
  }

  return normalizePlanVector(reversePlanVector(line.endTangent))
}

function getSelectedLineLikeMeasurements(
  selectedIds: string[],
  nodes: Record<string, AnyNode>,
  options?: { includeSketchLines?: boolean },
): LineLikeMeasurement[] | null {
  if (selectedIds.length === 0) return null

  const lines = selectedIds
    .map((id) => nodes[id])
    .filter((node): node is AnyNode => Boolean(node))
    .map((node) => getLineLikeMeasurement(node, nodes, options))
    .filter((line): line is LineLikeMeasurement => Boolean(line))

  return lines.length === selectedIds.length ? lines : null
}

function getPolylineLength(points: PlanPoint[]) {
  let total = 0

  for (let index = 1; index < points.length; index += 1) {
    total += getPlanPointDistance(points[index - 1]!, points[index]!)
  }

  return total
}

function getPolylineMidpoint(points: PlanPoint[]): PlanPoint | null {
  if (points.length === 0) return null
  if (points.length === 1) return points[0] ?? null

  const totalLength = getPolylineLength(points)
  if (totalLength <= 1e-6) return points[Math.floor(points.length / 2)] ?? null

  const halfway = totalLength / 2
  let walked = 0

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!
    const end = points[index]!
    const segmentLength = getPlanPointDistance(start, end)
    if (walked + segmentLength >= halfway) {
      const t = (halfway - walked) / Math.max(segmentLength, 1e-6)
      return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]
    }

    walked += segmentLength
  }

  return points[points.length - 1] ?? null
}

const GRID_PARALLEL_TOLERANCE_DEGREES = 6
const GRID_MIN_SPACING = 0.05
const GRID_TOTAL_GUIDE_OFFSET = -0.9

type GridProjection = {
  line: LineLikeMeasurement
  midpoint: PlanPoint
  along: number
  offset: number
}

function dotPlanPoint(point: PlanPoint, axis: PlanPoint) {
  return point[0] * axis[0] + point[1] * axis[1]
}

function getPerpendicularPlanVector(vector: PlanPoint): PlanPoint {
  return [-vector[1], vector[0]]
}

function getStableGridNormal(direction: PlanPoint) {
  const normal = getPerpendicularPlanVector(direction)
  const dominantX = Math.abs(normal[0]) >= Math.abs(normal[1])

  if ((dominantX && normal[0] < 0) || (!dominantX && normal[1] < 0)) {
    return reversePlanVector(normal)
  }

  return normal
}

function getGridMeasurementTargetLabel(
  lines: LineLikeMeasurement[],
  nodes: Record<string, AnyNode>,
) {
  const suffix = `(${lines.length} 条)`

  if (lines.every((line) => line.type === 'wall')) {
    return `墙轴组 ${suffix}`
  }

  if (lines.every((line) => line.type === 'fence')) {
    return `围栏轴组 ${suffix}`
  }

  if (lines.every((line) => line.type === 'sketch-line')) {
    const allConstruction = lines.every((line) => {
      const node = nodes[line.id]
      return node?.type === 'sketch-line' && node.construction
    })
    return `${allConstruction ? '草图轴线组' : '草图线组'} ${suffix}`
  }

  return `轴网组 ${suffix}`
}

function getGridMeasurementDirection(lines: LineLikeMeasurement[]) {
  const first = normalizePlanVector([
    lines[0]!.end[0] - lines[0]!.start[0],
    lines[0]!.end[1] - lines[0]!.start[1],
  ])
  if (!first) return null

  const toleranceDot = Math.cos((GRID_PARALLEL_TOLERANCE_DEGREES * Math.PI) / 180)
  let sumX = 0
  let sumZ = 0

  for (const line of lines) {
    const direction = normalizePlanVector([
      line.end[0] - line.start[0],
      line.end[1] - line.start[1],
    ])
    if (!direction) return null

    const dot = direction[0] * first[0] + direction[1] * first[1]
    if (Math.abs(dot) < toleranceDot) {
      return null
    }

    const oriented = dot < 0 ? reversePlanVector(direction) : direction
    sumX += oriented[0]
    sumZ += oriented[1]
  }

  return normalizePlanVector([sumX, sumZ]) ?? first
}

function getGridProjectionData(lines: LineLikeMeasurement[], direction: PlanPoint) {
  const normal = getStableGridNormal(direction)

  return lines
    .map((line) => {
      const midpoint = getPolylineMidpoint(line.pathPoints) ?? getMidpointPlan(line.start, line.end)
      return {
        line,
        midpoint,
        along: dotPlanPoint(midpoint, direction),
        offset: dotPlanPoint(midpoint, normal),
      } satisfies GridProjection
    })
    .sort((left, right) => left.offset - right.offset)
}

function buildGridMeasurementResult(
  selectedIds: string[],
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
) {
  if (selectedIds.length < 2) return null

  const lines = getSelectedLineLikeMeasurements(selectedIds, nodes, { includeSketchLines: true })
  if (!lines || lines.length < 2) return null

  const direction = getGridMeasurementDirection(lines)
  if (!direction) return null

  const projections = getGridProjectionData(lines, direction)
  if (projections.length < 2) return null

  const spacings: number[] = []
  for (let index = 1; index < projections.length; index += 1) {
    const spacing = projections[index]!.offset - projections[index - 1]!.offset
    if (spacing < GRID_MIN_SPACING) {
      return null
    }
    spacings.push(spacing)
  }

  if (spacings.length === 0) return null

  const normal = getStableGridNormal(direction)
  const approximate = projections.some((projection) => projection.line.approximate)
  const averageAlong =
    projections.reduce((sum, projection) => sum + projection.along, 0) / projections.length
  const averageY =
    projections.reduce((sum, projection) => sum + projection.line.y, 0) / projections.length
  const totalSpan = projections[projections.length - 1]!.offset - projections[0]!.offset
  const averageSpacing = spacings.reduce((sum, spacing) => sum + spacing, 0) / spacings.length
  const gridAngle =
    getLinePlanAngle([0, 0], [direction[0], direction[1]]) ??
    normalizeDegrees180(radiansToDegrees(Math.atan2(direction[1], direction[0])))
  const targetLabel = getGridMeasurementTargetLabel(lines, nodes)
  const description =
    projections.length === 2
      ? '按所选线性对象中心线的法向投影计算两条轴线之间的垂直距离'
      : '按所选近似平行中心线沿法向排序后，计算相邻轴距与总跨度'

  const metrics: GridMetric[] = [
    createGridMetric(
      'axis-count',
      '轴线数',
      projections.length,
      '当前参与轴网测量的线性对象数量',
      approximate,
      'count',
      unit,
      formatOptions,
    ),
    createGridMetric(
      'bay-count',
      '跨数',
      spacings.length,
      '相邻轴线之间形成的柱距/轴距数量',
      approximate,
      'count',
      unit,
      formatOptions,
    ),
  ]

  if (projections.length > 2) {
    metrics.push(
      createGridMetric(
        'total-span',
        '总跨度',
        totalSpan,
        '首末轴线之间的总轴网跨度',
        approximate,
        'length',
        unit,
        formatOptions,
      ),
    )
  }

  metrics.push(
    createGridMetric(
      'average-spacing',
      '平均轴距',
      averageSpacing,
      '相邻轴线间距的平均值',
      approximate,
      'length',
      unit,
      formatOptions,
    ),
    createGridMetric(
      'grid-angle',
      '轴线角度',
      gridAngle,
      '轴线组相对世界 +X 轴的平面角',
      approximate,
      'angle',
      unit,
      formatOptions,
    ),
  )

  spacings.forEach((spacing, index) => {
    metrics.push(
      createGridMetric(
        `bay:${index + 1}`,
        `轴距 ${index + 1}`,
        spacing,
        `第 ${index + 1} 组相邻轴线之间的法向距离`,
        approximate,
        'length',
        unit,
        formatOptions,
      ),
    )
  })

  const primaryLabel = projections.length === 2 ? '轴距' : '总跨度'
  const primaryValue = projections.length === 2 ? spacings[0]! : totalSpan
  const anchor = toPlanWorldPoint(
    averageAlong,
    (projections[0]!.offset + projections[projections.length - 1]!.offset) / 2,
    direction,
    normal,
    averageY + 0.18,
  )

  const guides: GridGuide[] = spacings.map((spacing, index) => {
    const previous = projections[index]!
    const current = projections[index + 1]!
    const guideY = (previous.line.y + current.line.y) / 2
    return {
      id: `bay:${index + 1}`,
      label: `轴距 ${index + 1}`,
      value: spacing,
      formattedValue: formatLength(spacing, unit, formatOptions),
      start: toPlanWorldPoint(averageAlong, previous.offset, direction, normal, guideY),
      end: toPlanWorldPoint(averageAlong, current.offset, direction, normal, guideY),
      kind: 'bay',
      approximate,
    }
  })

  if (projections.length > 2) {
    guides.push({
      id: 'total-span',
      label: '总跨度',
      value: totalSpan,
      formattedValue: formatLength(totalSpan, unit, formatOptions),
      start: toPlanWorldPoint(
        averageAlong + GRID_TOTAL_GUIDE_OFFSET,
        projections[0]!.offset,
        direction,
        normal,
        averageY,
      ),
      end: toPlanWorldPoint(
        averageAlong + GRID_TOTAL_GUIDE_OFFSET,
        projections[projections.length - 1]!.offset,
        direction,
        normal,
        averageY,
      ),
      kind: 'total',
      approximate,
    })
  }

  return {
    summary: {
      nodeIds: projections.map((projection) => projection.line.id),
      targetLabel,
      primaryLabel,
      value: primaryValue,
      formattedValue: formatLength(primaryValue, unit, formatOptions),
      description,
      approximate,
      anchor,
      metrics,
    } satisfies GridSummary,
    guides,
  }
}

function getRoofPitch(run: number, rise: number) {
  const safeRun = Math.max(run, 0.0001)
  const angle = radiansToDegrees(Math.atan2(rise, safeRun))
  const percent = (rise / safeRun) * 100

  return { angle, percent }
}

function getRoofSegmentPitch(node: RoofSegmentNode) {
  const activeRh = node.roofType === 'flat' ? 0 : node.roofHeight

  let run = Math.min(node.width, node.depth) / 2
  let rise = activeRh

  if (node.roofType === 'shed') {
    run = node.depth
  }
  if (node.roofType === 'gable') {
    run = node.depth / 2
  }
  if (node.roofType === 'gambrel') {
    run = node.depth / 4
    rise = activeRh * 0.6
  }
  if (node.roofType === 'mansard') {
    run = Math.min(node.width, node.depth) * 0.15
    rise = activeRh * 0.7
  }
  if (node.roofType === 'dutch') {
    run = Math.min(node.width, node.depth) * 0.25
    rise = activeRh * 0.5
  }

  return getRoofPitch(run, rise)
}

function getStraightStairPitch(height: number, run: number) {
  const safeRun = Math.max(run, 0.0001)
  return {
    angle: radiansToDegrees(Math.atan2(height, safeRun)),
    percent: (height / safeRun) * 100,
  }
}

function getAngleMetricsForNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  formatOptions?: MeasurementFormatOptions,
): AngleMetric[] {
  if (node.type === 'wall') {
    const angle = getLinePlanAngle((node as WallNode).start, (node as WallNode).end)
    if (angle === null) return []

    return [
      createAngleMetric(
        'line-angle',
        '墙线角度',
        angle,
        '墙体中心线相对世界 +X 轴的平面角',
        false,
        'angle',
        undefined,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'fence') {
    const angle = getLinePlanAngle((node as FenceNode).start, (node as FenceNode).end)
    if (angle === null) return []

    return [
      createAngleMetric(
        'line-angle',
        '围栏角度',
        angle,
        '围栏中心线相对世界 +X 轴的平面角',
        false,
        'angle',
        undefined,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'roof-segment') {
    const roof = node as RoofSegmentNode
    const pitch = getRoofSegmentPitch(roof)
    const rotation = normalizeDegrees360(radiansToDegrees(roof.rotation))
    const slopeDirections = getRoofSlopeDirections(roof)

    return [
      createAngleMetric(
        'pitch-angle',
        '坡度角',
        pitch.angle,
        `${roof.roofType} 屋顶分段的坡度角`,
        false,
        'angle',
        undefined,
        formatOptions,
      ),
      createAngleMetric(
        'slope-percent',
        '坡度',
        pitch.percent,
        '屋顶 rise / run 换算的坡度',
        false,
        'percent',
        undefined,
        formatOptions,
      ),
      ...(slopeDirections.length > 0
        ? [
            createDirectionMetric(
              'slope-direction',
              slopeDirections.length > 1 ? '坡向' : '单坡坡向',
              slopeDirections,
              slopeDirections.length > 1
                ? '屋面下落方向；多坡屋顶会显示多个主要坡向'
                : '屋面由高侧向低侧的下落方向',
              false,
              formatOptions,
            ),
          ]
        : []),
      createAngleMetric(
        'plan-rotation',
        '平面旋转',
        rotation,
        '屋顶分段绕 Y 轴的平面旋转角',
        false,
        'angle',
        undefined,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'roof') {
    const roof = node as RoofNode
    const segments = roof.children
      .map((childId) => nodes[childId])
      .filter((child): child is RoofSegmentNode => child?.type === 'roof-segment')

    if (segments.length === 0) {
      const rotation = normalizeDegrees360(radiansToDegrees(roof.rotation))
      return [
        createAngleMetric(
          'plan-rotation',
          '平面旋转',
          rotation,
          '屋顶组绕 Y 轴的平面旋转角',
          false,
          'angle',
          undefined,
          formatOptions,
        ),
      ]
    }

    const averagePitchAngle =
      segments.reduce((sum, segment) => sum + getRoofSegmentPitch(segment).angle, 0) /
      segments.length
    const averageSlopePercent =
      segments.reduce((sum, segment) => sum + getRoofSegmentPitch(segment).percent, 0) /
      segments.length
    const rotation = normalizeDegrees360(radiansToDegrees(roof.rotation))
    const slopeDirections = Array.from(
      new Set(
        segments
          .flatMap((segment) => getRoofSlopeDirections(segment))
          .map((value) => trimNumber(value, 1)),
      ),
    ).sort((a, b) => a - b)

    return [
      createAngleMetric(
        'pitch-angle',
        '平均坡度角',
        averagePitchAngle,
        `按 ${segments.length} 个屋顶分段平均的坡度角`,
        segments.length > 1,
        'angle',
        undefined,
        formatOptions,
      ),
      createAngleMetric(
        'slope-percent',
        '平均坡度',
        averageSlopePercent,
        '按所有屋顶分段平均的坡度',
        segments.length > 1,
        'percent',
        undefined,
        formatOptions,
      ),
      ...(slopeDirections.length > 0
        ? [
            createDirectionMetric(
              'slope-direction',
              slopeDirections.length > 1 ? '主要坡向' : '坡向',
              slopeDirections,
              segments.length > 1
                ? `按 ${segments.length} 个屋顶分段汇总的主要坡向`
                : '屋面由高侧向低侧的下落方向',
              segments.length > 1,
              formatOptions,
            ),
          ]
        : []),
      createAngleMetric(
        'plan-rotation',
        '平面旋转',
        rotation,
        '屋顶组绕 Y 轴的平面旋转角',
        false,
        'angle',
        undefined,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'stair-segment') {
    const segment = node as StairSegmentNode
    const rotation = normalizeDegrees360(radiansToDegrees(segment.rotation))

    if (segment.segmentType === 'landing') {
      return [
        createAngleMetric(
          'plan-rotation',
          '平台旋转',
          rotation,
          '平台绕 Y 轴的平面旋转角',
          false,
          'angle',
          undefined,
          formatOptions,
        ),
      ]
    }

    const pitch = getStraightStairPitch(segment.height, segment.length)
    return [
      createAngleMetric(
        'pitch-angle',
        '倾角',
        pitch.angle,
        '楼梯分段 rise / run 的倾角',
        false,
        'angle',
        undefined,
        formatOptions,
      ),
      createAngleMetric(
        'slope-percent',
        '坡度',
        pitch.percent,
        '楼梯分段 rise / run 的坡度',
        false,
        'percent',
        undefined,
        formatOptions,
      ),
      createAngleMetric(
        'plan-rotation',
        '平面旋转',
        rotation,
        '楼梯分段绕 Y 轴的平面旋转角',
        false,
        'angle',
        undefined,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'stair') {
    const stair = node as StairNode
    const rotation = normalizeDegrees360(radiansToDegrees(stair.rotation))
    const metrics: AngleMetric[] = []

    if (stair.stairType === 'straight') {
      const segments = stair.children
        .map((childId) => nodes[childId])
        .filter((child): child is StairSegmentNode => child?.type === 'stair-segment')
        .filter((segment) => segment.segmentType === 'stair')

      if (segments.length > 0) {
        const totalRun = segments.reduce((sum, segment) => sum + segment.length, 0)
        const totalRise = segments.reduce((sum, segment) => sum + segment.height, 0)
        const pitch = getStraightStairPitch(totalRise, totalRun)

        metrics.push(
          createAngleMetric(
            'pitch-angle',
            '整体倾角',
            pitch.angle,
            '按所有楼梯分段总 rise / run 计算的倾角',
            segments.length > 1,
            'angle',
            undefined,
            formatOptions,
          ),
          createAngleMetric(
            'slope-percent',
            '整体坡度',
            pitch.percent,
            '按所有楼梯分段总 rise / run 计算的坡度',
            segments.length > 1,
            'percent',
            undefined,
            formatOptions,
          ),
        )
      }
    } else {
      const centerlineRadius = Math.max(stair.innerRadius + stair.width / 2, 0.01)
      const arcRun = centerlineRadius * Math.abs(stair.sweepAngle)
      const pitch = getStraightStairPitch(stair.totalRise, arcRun)

      metrics.push(
        createAngleMetric(
          'pitch-angle',
          '中心线倾角',
          pitch.angle,
          '按曲线楼梯中心线总 rise / run 估算的倾角',
          true,
          'angle',
          undefined,
          formatOptions,
        ),
        createAngleMetric(
          'slope-percent',
          '中心线坡度',
          pitch.percent,
          '按曲线楼梯中心线总 rise / run 估算的坡度',
          true,
          'percent',
          undefined,
          formatOptions,
        ),
        createAngleMetric(
          'sweep-angle',
          '扫掠角',
          Math.abs(radiansToDegrees(stair.sweepAngle)),
          '曲线楼梯在平面上的扫掠角',
          false,
          'angle',
          undefined,
          formatOptions,
        ),
      )
    }

    metrics.push(
      createAngleMetric(
        'plan-rotation',
        '平面旋转',
        rotation,
        '楼梯绕 Y 轴的平面旋转角',
        false,
        'angle',
        undefined,
        formatOptions,
      ),
    )

    if (stair.stepCount > 0 && stair.stairType !== 'straight') {
      metrics.push(
        createAngleMetric(
          'step-angle',
          '单步转角',
          Math.abs(radiansToDegrees(stair.sweepAngle / stair.stepCount)),
          '曲线楼梯平均每一步的转角',
          true,
          'angle',
          undefined,
          formatOptions,
        ),
      )
    }

    return metrics
  }

  const rotation = getObjectPlanRotationDegrees(node)
  if (rotation !== null) {
    return [
      createAngleMetric(
        'plan-rotation',
        '平面旋转',
        rotation,
        '对象绕 Y 轴的平面旋转角',
        false,
        'angle',
        undefined,
        formatOptions,
      ),
    ]
  }

  return []
}

function getPrimaryAngleMetric(node: AnyNode, metrics: AngleMetric[]) {
  if (metrics.length === 0) return null

  if (node.type === 'roof' || node.type === 'roof-segment') {
    return metrics.find((metric) => metric.id === 'pitch-angle') ?? metrics[0]
  }

  if (node.type === 'stair' || node.type === 'stair-segment') {
    return (
      metrics.find((metric) => metric.id === 'pitch-angle') ??
      metrics.find((metric) => metric.id === 'sweep-angle') ??
      metrics[0]
    )
  }

  if (node.type === 'wall' || node.type === 'fence') {
    return metrics.find((metric) => metric.id === 'line-angle') ?? metrics[0]
  }

  return metrics.find((metric) => metric.id === 'plan-rotation') ?? metrics[0]
}

function getPerimeterMetricsForNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): PerimeterMetric[] {
  if (node.type === 'site') {
    const footprint = getNodeFootprintResult(node, nodes)
    const metrics = createSiteAwareFootprintMetrics({
      node,
      nodes,
      unit,
      formatOptions,
      footprint,
      perimeterLabel: '场地周长',
      perimeterValue: calculatePolygonPerimeter((node as SiteNode).polygon?.points ?? []),
      perimeterDescription: '场地边界周长',
      includeSetbacks: false,
    })

    if (metrics) return metrics
  }

  if (node.type === 'wall') {
    const wall = node as WallNode
    return [
      createPerimeterMetric(
        'run-length',
        '墙长',
        getWallCurveLength(wall),
        unit,
        '墙体中心线长度',
        false,
        formatOptions,
      ),
      createPerimeterMetric(
        'thickness',
        '墙厚',
        getWallThickness(wall),
        unit,
        '墙体厚度',
        false,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'fence') {
    const fence = node as FenceNode
    const length = Math.hypot(fence.end[0] - fence.start[0], fence.end[1] - fence.start[1])

    return [
      createPerimeterMetric(
        'run-length',
        '围栏长度',
        length,
        unit,
        '围栏中心线长度',
        false,
        formatOptions,
      ),
      createPerimeterMetric(
        'thickness',
        '围栏厚度',
        fence.thickness,
        unit,
        '围栏厚度',
        false,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'door') {
    const door = node as DoorNode
    return [
      createPerimeterMetric(
        'opening-span',
        '洞口开间',
        door.width,
        unit,
        '门洞净宽',
        false,
        formatOptions,
      ),
      createPerimeterMetric(
        'opening-depth',
        '安装进深',
        door.frameDepth,
        unit,
        '门框安装进深',
        false,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'window') {
    const windowNode = node as WindowNode
    return [
      createPerimeterMetric(
        'opening-span',
        '洞口开间',
        windowNode.width,
        unit,
        '窗洞净宽',
        false,
        formatOptions,
      ),
      createPerimeterMetric(
        'opening-depth',
        '安装进深',
        windowNode.frameDepth,
        unit,
        '窗框安装进深',
        false,
        formatOptions,
      ),
    ]
  }

  if (node.type === 'zone') {
    const zone = node as ZoneNode
    const footprint = getNodeFootprintResult(node, nodes)
    const siteAwareMetrics = createSiteAwareFootprintMetrics({
      node,
      nodes,
      unit,
      formatOptions,
      footprint,
      perimeterValue: calculatePolygonPerimeter(zone.polygon),
      perimeterDescription: '区域边界周长',
    })

    if (siteAwareMetrics) return siteAwareMetrics

    const bounds = zoneBounds(zone.polygon)
    if (!bounds) {
      return createBoundsFallbackPerimeterMetrics({
        node,
        nodes,
        unit,
        formatOptions,
        perimeterLabel: '周长',
        perimeterDescription: '按区域占地包围盒估算的周长',
        spanDescription: '区域占地在平面 X 方向的开间',
        depthDescription: '区域占地在平面 Z 方向的进深',
      })
    }

    return createPlanEnvelopeMetrics({
      span: bounds.maxX - bounds.minX,
      depth: bounds.maxZ - bounds.minZ,
      unit,
      formatOptions,
      spanBreakdown: getProjectedBaySegments(zone.polygon, [1, 0]),
      depthBreakdown: getProjectedBaySegments(zone.polygon, [0, 1]),
      perimeterValue: calculatePolygonPerimeter(zone.polygon),
      perimeterDescription: '区域边界周长',
      spanDescription: '区域在平面 X 方向的开间',
      depthDescription: '区域在平面 Z 方向的进深',
      spanBreakdownDescription: '按区域边界拐点在平面 X 方向拆分得到的面宽分跨',
      depthBreakdownDescription: '按区域边界拐点在平面 Z 方向拆分得到的进深分跨',
    })
  }

  if (node.type === 'slab') {
    const slab = node as SlabNode
    const footprint = getNodeFootprintResult(node, nodes)
    const siteAwareMetrics = createSiteAwareFootprintMetrics({
      node,
      nodes,
      unit,
      formatOptions,
      footprint,
      perimeterValue: calculatePolygonPerimeter(slab.polygon),
      perimeterDescription: '楼板外轮廓周长',
    })

    if (siteAwareMetrics) return siteAwareMetrics

    const bounds = zoneBounds(slab.polygon)
    if (!bounds) {
      return createBoundsFallbackPerimeterMetrics({
        node,
        nodes,
        unit,
        formatOptions,
        perimeterDescription: '按楼板占地包围盒估算的周长',
        spanDescription: '楼板占地在平面 X 方向的开间',
        depthDescription: '楼板占地在平面 Z 方向的进深',
      })
    }

    return createPlanEnvelopeMetrics({
      span: bounds.maxX - bounds.minX,
      depth: bounds.maxZ - bounds.minZ,
      unit,
      formatOptions,
      spanBreakdown: getProjectedBaySegments(slab.polygon, [1, 0]),
      depthBreakdown: getProjectedBaySegments(slab.polygon, [0, 1]),
      perimeterValue: calculatePolygonPerimeter(slab.polygon),
      perimeterDescription: '楼板外轮廓周长',
      spanDescription: '楼板在平面 X 方向的开间',
      depthDescription: '楼板在平面 Z 方向的进深',
      spanBreakdownDescription: '按楼板轮廓拐点在平面 X 方向拆分得到的面宽分跨',
      depthBreakdownDescription: '按楼板轮廓拐点在平面 Z 方向拆分得到的进深分跨',
    })
  }

  if (node.type === 'ceiling') {
    const ceiling = node as CeilingNode
    const footprint = getNodeFootprintResult(node, nodes)
    const siteAwareMetrics = createSiteAwareFootprintMetrics({
      node,
      nodes,
      unit,
      formatOptions,
      footprint,
      perimeterValue: calculatePolygonPerimeter(ceiling.polygon),
      perimeterDescription: '吊顶外轮廓周长',
    })

    if (siteAwareMetrics) return siteAwareMetrics

    const bounds = zoneBounds(ceiling.polygon)
    if (!bounds) {
      return createBoundsFallbackPerimeterMetrics({
        node,
        nodes,
        unit,
        formatOptions,
        perimeterDescription: '按吊顶占地包围盒估算的周长',
        spanDescription: '吊顶占地在平面 X 方向的开间',
        depthDescription: '吊顶占地在平面 Z 方向的进深',
      })
    }

    return createPlanEnvelopeMetrics({
      span: bounds.maxX - bounds.minX,
      depth: bounds.maxZ - bounds.minZ,
      unit,
      formatOptions,
      spanBreakdown: getProjectedBaySegments(ceiling.polygon, [1, 0]),
      depthBreakdown: getProjectedBaySegments(ceiling.polygon, [0, 1]),
      perimeterValue: calculatePolygonPerimeter(ceiling.polygon),
      perimeterDescription: '吊顶外轮廓周长',
      spanDescription: '吊顶在平面 X 方向的开间',
      depthDescription: '吊顶在平面 Z 方向的进深',
      spanBreakdownDescription: '按吊顶轮廓拐点在平面 X 方向拆分得到的面宽分跨',
      depthBreakdownDescription: '按吊顶轮廓拐点在平面 Z 方向拆分得到的进深分跨',
    })
  }

  if (node.type === 'roof-segment') {
    const roof = node as RoofSegmentNode
    const footprint = getNodeFootprintResult(node, nodes)
    const siteAwareMetrics = createSiteAwareFootprintMetrics({
      node,
      nodes,
      unit,
      formatOptions,
      footprint,
      perimeterLabel: '檐口周长',
      perimeterValue: getRectanglePerimeter(
        roof.width + roof.overhang * 2,
        roof.depth + roof.overhang * 2,
      ),
      perimeterDescription: '按檐口外包尺寸计算的屋面周长',
    })

    if (siteAwareMetrics) return siteAwareMetrics

    const span = roof.width + roof.overhang * 2
    const depth = roof.depth + roof.overhang * 2

    return createPlanEnvelopeMetrics({
      span,
      depth,
      unit,
      formatOptions,
      perimeterLabel: '檐口周长',
      perimeterDescription: '按檐口外包尺寸计算的屋面周长',
      spanDescription: '包含檐口外挑后的屋面开间',
      depthDescription: '包含檐口外挑后的屋面进深',
    })
  }

  if (node.type === 'item') {
    const [width, , depth] = getScaledDimensions(node as ItemNode)
    const footprint = getNodeFootprintResult(node, nodes)
    const siteAwareMetrics = createSiteAwareFootprintMetrics({
      node,
      nodes,
      unit,
      formatOptions,
      footprint,
      perimeterLabel: '占地周长',
      perimeterValue: getRectanglePerimeter(width, depth),
      perimeterDescription: '按构件标称占地尺寸估算的周长',
      includeSetbacks: false,
      approximate: true,
    })

    if (siteAwareMetrics) return siteAwareMetrics

    return createPlanEnvelopeMetrics({
      span: width,
      depth,
      unit,
      formatOptions,
      perimeterLabel: '占地周长',
      perimeterDescription: '按构件标称占地尺寸估算的周长',
      spanDescription: '构件在本地坐标中的占地开间',
      depthDescription: '构件在本地坐标中的占地进深',
      approximate: true,
    })
  }

  if (node.type === 'stair') {
    const stair = node as StairNode
    const footprint = getNodeFootprintResult(node, nodes)

    if (stair.stairType === 'straight') {
      const segments = stair.children
        .map((childId) => nodes[childId])
        .filter((child): child is StairSegmentNode => child?.type === 'stair-segment')
        .filter((segment) => segment.segmentType === 'stair')

      const totalRun = segments.reduce((sum, segment) => sum + segment.length, 0)
      if (totalRun > 0.0001) {
        const siteAwareMetrics = createSiteAwareFootprintMetrics({
          node,
          nodes,
          unit,
          formatOptions,
          footprint,
          perimeterLabel: '占地周长',
          perimeterDescription: '按楼梯占地外包尺寸计算的周长',
          approximate: true,
        })

        if (siteAwareMetrics) {
          return [
            createPerimeterMetric(
              'run-length',
              '梯段总长',
              totalRun,
              unit,
              '按所有直跑梯段长度累加得到',
              segments.length > 1 || footprint.approximate,
              formatOptions,
            ),
            ...siteAwareMetrics,
          ]
        }

        return [
          createPerimeterMetric(
            'run-length',
            '梯段总长',
            totalRun,
            unit,
            '按所有直跑梯段长度累加得到',
            segments.length > 1,
            formatOptions,
          ),
          ...createPlanEnvelopeMetrics({
            span: stair.width,
            depth: totalRun,
            unit,
            formatOptions,
            perimeterLabel: '占地周长',
            perimeterDescription: '按楼梯宽度与总梯段长度估算的占地周长',
            spanDescription: '楼梯横向开间',
            depthDescription: '楼梯沿行进方向的总进深',
            approximate: true,
          }),
        ]
      }
    }

    const siteAwareMetrics = createSiteAwareFootprintMetrics({
      node,
      nodes,
      unit,
      formatOptions,
      footprint,
      perimeterLabel: '占地周长',
      perimeterDescription: '按楼梯占地外包尺寸计算的周长',
      approximate: true,
    })

    if (siteAwareMetrics) return siteAwareMetrics
  }

  if (node.type === 'building' || node.type === 'level' || node.type === 'roof') {
    const footprint = getNodeFootprintResult(node, nodes)
    const siteAwareMetrics = createSiteAwareFootprintMetrics({
      node,
      nodes,
      unit,
      formatOptions,
      footprint,
      perimeterLabel: node.type === 'roof' ? '外包周长' : '外包周长',
      perimeterDescription:
        node.type === 'building'
          ? '按建筑占地外包尺寸计算的周长'
          : node.type === 'level'
            ? '按楼层占地外包尺寸计算的周长'
            : '按屋顶占地外包尺寸计算的周长',
      approximate: true,
    })

    if (siteAwareMetrics) return siteAwareMetrics
  }

  const perimeterDescription =
    node.type === 'building'
      ? '按建筑占地包围盒估算的周长'
      : node.type === 'level'
        ? '按当前楼层占地包围盒估算的周长'
        : node.type === 'roof'
          ? '按屋顶外包占地估算的周长'
          : node.type === 'stair'
            ? '按楼梯占地包围盒估算的周长'
            : '按对象占地包围盒估算的周长'
  const spanDescription =
    node.type === 'building'
      ? '建筑占地在平面 X 方向的开间'
      : node.type === 'level'
        ? '楼层占地在平面 X 方向的开间'
        : node.type === 'roof'
          ? '屋顶占地在平面 X 方向的开间'
          : '对象占地在平面 X 方向的开间'
  const depthDescription =
    node.type === 'building'
      ? '建筑占地在平面 Z 方向的进深'
      : node.type === 'level'
        ? '楼层占地在平面 Z 方向的进深'
        : node.type === 'roof'
          ? '屋顶占地在平面 Z 方向的进深'
          : '对象占地在平面 Z 方向的进深'
  return createBoundsFallbackPerimeterMetrics({
    node,
    nodes,
    unit,
    formatOptions,
    perimeterLabel: node.type === 'building' || node.type === 'level' ? '外包周长' : '占地周长',
    perimeterDescription,
    spanDescription,
    depthDescription,
  })
}

function getPrimaryPerimeterMetric(node: AnyNode, metrics: PerimeterMetric[]) {
  if (metrics.length === 0) return null

  if (node.type === 'wall' || node.type === 'fence' || node.type === 'stair') {
    return metrics.find((metric) => metric.id === 'run-length') ?? metrics[0]
  }

  if (node.type === 'door' || node.type === 'window') {
    return metrics.find((metric) => metric.id === 'opening-span') ?? metrics[0]
  }

  return metrics.find((metric) => metric.id === 'perimeter') ?? metrics[0]
}

export function getPerimeterGuidesForNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): PerimeterGuide[] {
  if (node.type === 'site') return []

  const footprint = getNodeFootprintResult(node, nodes)
  const context = getSiteAwareFootprintContext(node, nodes, footprint)
  if (!context) return []

  const {
    footprintFrontRange,
    footprintRightRange,
    frontAxis,
    rightAxis,
    site,
    siteFrontRange,
    siteRightRange,
  } = context
  const approximate = footprint.approximate
  const orientationDegrees = getSiteOrientationDegrees(site)
  const y = getNodeLevelOffset(node, nodes) + 0.08
  const frontCenter = (footprintFrontRange.min + footprintFrontRange.max) / 2
  const rightCenter = (footprintRightRange.min + footprintRightRange.max) / 2
  const clampedRightSpan = getClampedProjectedSpan(footprintRightRange, siteRightRange)
  const clampedFrontSpan = getClampedProjectedSpan(footprintFrontRange, siteFrontRange)

  const guides: PerimeterGuide[] = [
    {
      id: 'span',
      label: '面宽',
      value: footprintRightRange.max - footprintRightRange.min,
      formattedValue: formatLength(
        footprintRightRange.max - footprintRightRange.min,
        unit,
        formatOptions,
      ),
      start: toPlanWorldPoint(frontCenter, footprintRightRange.min, frontAxis, rightAxis, y),
      end: toPlanWorldPoint(frontCenter, footprintRightRange.max, frontAxis, rightAxis, y),
      kind: 'dimension',
      approximate,
    },
    {
      id: 'depth',
      label: '进深',
      value: footprintFrontRange.max - footprintFrontRange.min,
      formattedValue: formatLength(
        footprintFrontRange.max - footprintFrontRange.min,
        unit,
        formatOptions,
      ),
      start: toPlanWorldPoint(footprintFrontRange.min, rightCenter, frontAxis, rightAxis, y),
      end: toPlanWorldPoint(footprintFrontRange.max, rightCenter, frontAxis, rightAxis, y),
      kind: 'dimension',
      approximate,
    },
    {
      id: 'front-setback',
      label: '前退距',
      value: siteFrontRange.max - footprintFrontRange.max,
      formattedValue: formatLength(
        siteFrontRange.max - footprintFrontRange.max,
        unit,
        formatOptions,
      ),
      start: toPlanWorldPoint(footprintFrontRange.max, rightCenter, frontAxis, rightAxis, y),
      end: toPlanWorldPoint(siteFrontRange.max, rightCenter, frontAxis, rightAxis, y),
      kind: 'setback',
      referenceStart: toPlanWorldPoint(
        siteFrontRange.max,
        clampedRightSpan.min,
        frontAxis,
        rightAxis,
        y,
      ),
      referenceEnd: toPlanWorldPoint(
        siteFrontRange.max,
        clampedRightSpan.max,
        frontAxis,
        rightAxis,
        y,
      ),
      referenceLabel: getSetbackReferenceLabel('front-setback', orientationDegrees),
      approximate,
    },
    {
      id: 'back-setback',
      label: '后退距',
      value: footprintFrontRange.min - siteFrontRange.min,
      formattedValue: formatLength(
        footprintFrontRange.min - siteFrontRange.min,
        unit,
        formatOptions,
      ),
      start: toPlanWorldPoint(siteFrontRange.min, rightCenter, frontAxis, rightAxis, y),
      end: toPlanWorldPoint(footprintFrontRange.min, rightCenter, frontAxis, rightAxis, y),
      kind: 'setback',
      referenceStart: toPlanWorldPoint(
        siteFrontRange.min,
        clampedRightSpan.min,
        frontAxis,
        rightAxis,
        y,
      ),
      referenceEnd: toPlanWorldPoint(
        siteFrontRange.min,
        clampedRightSpan.max,
        frontAxis,
        rightAxis,
        y,
      ),
      referenceLabel: getSetbackReferenceLabel('back-setback', orientationDegrees),
      approximate,
    },
    {
      id: 'left-setback',
      label: '左退距',
      value: footprintRightRange.min - siteRightRange.min,
      formattedValue: formatLength(
        footprintRightRange.min - siteRightRange.min,
        unit,
        formatOptions,
      ),
      start: toPlanWorldPoint(frontCenter, siteRightRange.min, frontAxis, rightAxis, y),
      end: toPlanWorldPoint(frontCenter, footprintRightRange.min, frontAxis, rightAxis, y),
      kind: 'setback',
      referenceStart: toPlanWorldPoint(
        clampedFrontSpan.min,
        siteRightRange.min,
        frontAxis,
        rightAxis,
        y,
      ),
      referenceEnd: toPlanWorldPoint(
        clampedFrontSpan.max,
        siteRightRange.min,
        frontAxis,
        rightAxis,
        y,
      ),
      referenceLabel: getSetbackReferenceLabel('left-setback', orientationDegrees),
      approximate,
    },
    {
      id: 'right-setback',
      label: '右退距',
      value: siteRightRange.max - footprintRightRange.max,
      formattedValue: formatLength(
        siteRightRange.max - footprintRightRange.max,
        unit,
        formatOptions,
      ),
      start: toPlanWorldPoint(frontCenter, footprintRightRange.max, frontAxis, rightAxis, y),
      end: toPlanWorldPoint(frontCenter, siteRightRange.max, frontAxis, rightAxis, y),
      kind: 'setback',
      referenceStart: toPlanWorldPoint(
        clampedFrontSpan.min,
        siteRightRange.max,
        frontAxis,
        rightAxis,
        y,
      ),
      referenceEnd: toPlanWorldPoint(
        clampedFrontSpan.max,
        siteRightRange.max,
        frontAxis,
        rightAxis,
        y,
      ),
      referenceLabel: getSetbackReferenceLabel('right-setback', orientationDegrees),
      approximate,
    },
  ]

  return guides.filter((guide) => Math.abs(guide.value) > 0.0001)
}

function getRoofProjectionArea(node: RoofSegmentNode) {
  return (node.width + node.overhang * 2) * (node.depth + node.overhang * 2)
}

function getRoofSurfaceArea(node: RoofSegmentNode) {
  const projectionArea = getRoofProjectionArea(node)
  if (projectionArea <= 0.0001) return 0
  if (node.roofType === 'flat') return projectionArea

  const pitch = getRoofSegmentPitch(node)
  const slopeFactor = 1 / Math.max(Math.cos((pitch.angle * Math.PI) / 180), 0.1)
  return projectionArea * slopeFactor
}

function getRoofGroupProjectionArea(node: RoofNode, nodes: Record<string, AnyNode>) {
  return node.children
    .map((childId) => nodes[childId])
    .filter((child): child is RoofSegmentNode => child?.type === 'roof-segment')
    .reduce((sum, child) => sum + getRoofProjectionArea(child), 0)
}

function getRoofGroupSurfaceArea(node: RoofNode, nodes: Record<string, AnyNode>) {
  return node.children
    .map((childId) => nodes[childId])
    .filter((child): child is RoofSegmentNode => child?.type === 'roof-segment')
    .reduce((sum, child) => sum + getRoofSurfaceArea(child), 0)
}

function getSurfaceHoleArea(holes: Array<Array<[number, number]>> = []) {
  return holes.reduce((sum, hole) => sum + calculatePolygonArea(hole), 0)
}

function getWallOpeningArea(wall: WallNode, nodes: Record<string, AnyNode>) {
  return (wall.children ?? [])
    .map((childId) => nodes[childId])
    .reduce((sum, child) => {
      if (child?.type === 'door') {
        return sum + child.width * child.height
      }
      if (child?.type === 'window') {
        return sum + child.width * child.height
      }
      return sum
    }, 0)
}

function getApproxEnvelopePlanArea(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): MeasurementValueResult | null {
  const footprint = getNodeFootprintResult(node, nodes)
  const siteAware = getSiteAwareFootprintContext(node, nodes, footprint)
  if (siteAware) {
    const width = siteAware.footprintRightRange.max - siteAware.footprintRightRange.min
    const depth = siteAware.footprintFrontRange.max - siteAware.footprintFrontRange.min

    if (width > 0.0001 && depth > 0.0001) {
      return {
        value: width * depth,
        label: '占地投影面积',
        description: '按场地朝向外包投影估算的占地面积',
        approximate: true,
        metrics: [],
      }
    }
  }

  const footprintBounds = getPlanPointBounds(footprint.points)
  if (footprintBounds) {
    const value =
      Math.max(0, footprintBounds.maxX - footprintBounds.minX) *
      Math.max(0, footprintBounds.maxZ - footprintBounds.minZ)
    if (value > 0.0001) {
      return {
        value,
        label: '占地投影面积',
        description: '按轮廓外包范围估算的占地面积',
        approximate: true,
        metrics: [],
      }
    }
  }

  const bounds = getObjectBounds(node.id)
  if (!bounds) return null

  return {
    value: bounds.size[0] * bounds.size[2],
    label: '占地投影面积',
    description: '按包围盒占地估算的占地面积',
    approximate: true,
    metrics: [],
  }
}

function getBuildingTotalHeightValue(building: BuildingNode, nodes: Record<string, AnyNode>) {
  const baseY = getBuildingBaseY(building, nodes)
  const bounds = getObjectBounds(building.id)
  const roofProfile = getRoofHeightProfile(building, nodes)
  const topY = Math.max(bounds?.max[1] ?? baseY, roofProfile?.ridgeMax ?? baseY)
  const height = topY - baseY

  if (!(Number.isFinite(height) && height > 0.0001)) return null

  return {
    value: height,
    approximate: bounds === null || roofProfile?.approximate === true,
    description: '按建筑总高链估算的包络高度',
  }
}

function getLevelFloorAreaValue(level: LevelNode, nodes: Record<string, AnyNode>) {
  let slabArea = 0
  let slabApproximate = false

  for (const slab of level.children
    .map((childId) => nodes[childId])
    .filter((node): node is SlabNode => node?.type === 'slab')) {
    const netArea = calculatePolygonAreaWithHoles(slab.polygon, slab.holes)
    if (netArea > 0.0001) {
      slabArea += netArea
      continue
    }

    const bounds = getObjectBounds(slab.id)
    if (bounds) {
      slabArea += bounds.size[0] * bounds.size[2]
      slabApproximate = true
    }
  }

  if (slabArea > 0.0001) {
    return {
      value: slabArea,
      approximate: slabApproximate,
      description: '优先按本层楼板净面积汇总',
      sourceLabel: '楼板净面积合计',
    }
  }

  const zoneArea = level.children
    .map((childId) => nodes[childId])
    .filter((node): node is ZoneNode => node?.type === 'zone')
    .reduce((sum, zone) => sum + calculatePolygonArea(zone.polygon), 0)

  if (zoneArea > 0.0001) {
    return {
      value: zoneArea,
      approximate: false,
      description: '缺少楼板时，按本层区域套内面积汇总',
      sourceLabel: '区域套内面积合计',
    }
  }

  return null
}

function getAreaValue(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): MeasurementValueResult | null {
  if (node.type === 'wall') {
    const wall = node as WallNode
    const grossArea = getWallCurveLength(wall) * (wall.height ?? DEFAULT_WALL_HEIGHT)
    const openingArea = Math.min(grossArea, getWallOpeningArea(wall, nodes))
    const netArea = Math.max(0, grossArea - openingArea)
    const doubleFaceArea = netArea * 2
    const primaryValue = netArea > 0.0001 ? netArea : grossArea
    const metrics = [
      createMeasurementMetric(
        'area',
        'wall-single-face-gross-area',
        '单侧毛面积',
        grossArea,
        unit,
        '墙体单侧立面展开面积，未扣除门窗洞口',
        false,
        formatOptions,
      ),
    ]

    if (openingArea > 0.0001) {
      metrics.push(
        createMeasurementMetric(
          'area',
          'wall-opening-area-deduction',
          '洞口扣减面积',
          openingArea,
          unit,
          '按挂在该墙体上的门窗洞口面积汇总',
          false,
          formatOptions,
        ),
      )
    }

    metrics.push(
      createMeasurementMetric(
        'area',
        'wall-single-face-net-area',
        '单侧净面积',
        primaryValue,
        unit,
        openingArea > 0.0001 ? '墙体单侧立面净面积，已扣除门窗洞口' : '墙体单侧立面面积',
        false,
        formatOptions,
      ),
    )

    if (doubleFaceArea > 0.0001) {
      metrics.push(
        createMeasurementMetric(
          'area',
          'wall-double-face-net-area',
          '双侧展开面积',
          doubleFaceArea,
          unit,
          '墙体内外两侧展开净面积合计',
          false,
          formatOptions,
        ),
      )
    }

    return {
      value: primaryValue,
      label: '单侧净面积',
      description: openingArea > 0.0001 ? '墙体单侧立面净面积，已扣除门窗洞口' : '墙体单侧立面面积',
      metrics,
    }
  }

  if (node.type === 'fence') {
    const fence = node as FenceNode
    const value =
      Math.hypot(fence.end[0] - fence.start[0], fence.end[1] - fence.start[1]) * fence.height
    return {
      value,
      label: '单侧立面面积',
      description: '围栏单侧立面面积',
      metrics: [
        createMeasurementMetric(
          'area',
          'fence-face-area',
          '单侧立面面积',
          value,
          unit,
          '围栏单侧立面面积',
          false,
          formatOptions,
        ),
      ],
    }
  }

  if (node.type === 'slab') {
    const slab = node as SlabNode
    const grossArea = calculatePolygonArea(slab.polygon)
    const holeArea = getSurfaceHoleArea(slab.holes)
    const area = calculatePolygonAreaWithHoles(slab.polygon, slab.holes)
    if (grossArea > 0.0001 || area > 0.0001) {
      const primaryValue = area > 0.0001 ? area : grossArea
      const metrics = [
        createMeasurementMetric(
          'area',
          'slab-gross-area',
          '毛投影面积',
          Math.max(grossArea, primaryValue),
          unit,
          '按楼板外轮廓计算的投影面积',
          false,
          formatOptions,
        ),
      ]

      if (holeArea > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'area',
            'slab-hole-deduction',
            '洞口扣减面积',
            holeArea,
            unit,
            '按楼板 holes 汇总的扣洞面积',
            false,
            formatOptions,
          ),
        )
      }

      metrics.push(
        createMeasurementMetric(
          'area',
          'slab-net-area',
          '净投影面积',
          primaryValue,
          unit,
          holeArea > 0.0001 ? '楼板净投影面积，已扣除洞口' : '楼板投影面积',
          false,
          formatOptions,
        ),
      )

      return {
        value: primaryValue,
        label: '净投影面积',
        description: holeArea > 0.0001 ? '楼板净投影面积，已扣除洞口' : '楼板投影面积',
        metrics,
      }
    }

    const bounds = getObjectBounds(node.id)
    if (bounds) {
      const value = bounds.size[0] * bounds.size[2]
      return {
        value,
        label: '占地面积',
        description: '楼板包围盒占地面积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'area',
            'slab-bounds-area',
            '占地面积',
            value,
            unit,
            '楼板轮廓不可用时，按包围盒占地估算',
            true,
            formatOptions,
          ),
        ],
      }
    }

    return null
  }

  if (node.type === 'ceiling') {
    const ceiling = node as CeilingNode
    const grossArea = calculatePolygonArea(ceiling.polygon)
    const holeArea = getSurfaceHoleArea(ceiling.holes)
    const area = calculatePolygonAreaWithHoles(ceiling.polygon, ceiling.holes)
    if (grossArea > 0.0001 || area > 0.0001) {
      const primaryValue = area > 0.0001 ? area : grossArea
      const metrics = [
        createMeasurementMetric(
          'area',
          'ceiling-gross-area',
          '毛投影面积',
          Math.max(grossArea, primaryValue),
          unit,
          '按吊顶外轮廓计算的投影面积',
          false,
          formatOptions,
        ),
      ]

      if (holeArea > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'area',
            'ceiling-hole-deduction',
            '洞口扣减面积',
            holeArea,
            unit,
            '按吊顶 holes 汇总的扣洞面积',
            false,
            formatOptions,
          ),
        )
      }

      metrics.push(
        createMeasurementMetric(
          'area',
          'ceiling-net-area',
          '净投影面积',
          primaryValue,
          unit,
          holeArea > 0.0001 ? '吊顶净投影面积，已扣除洞口' : '吊顶投影面积',
          false,
          formatOptions,
        ),
      )

      return {
        value: primaryValue,
        label: '净投影面积',
        description: holeArea > 0.0001 ? '吊顶净投影面积，已扣除洞口' : '吊顶投影面积',
        metrics,
      }
    }

    const bounds = getObjectBounds(node.id)
    if (bounds) {
      const value = bounds.size[0] * bounds.size[2]
      return {
        value,
        label: '占地面积',
        description: '吊顶包围盒占地面积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'area',
            'ceiling-bounds-area',
            '占地面积',
            value,
            unit,
            '吊顶轮廓不可用时，按包围盒占地估算',
            true,
            formatOptions,
          ),
        ],
      }
    }

    return null
  }

  if (node.type === 'zone') {
    const area = calculatePolygonArea((node as ZoneNode).polygon)
    if (area > 0.0001) {
      return {
        value: area,
        label: '套内面积',
        description: '按区域闭合边界计算的套内面积',
        metrics: [
          createMeasurementMetric(
            'area',
            'zone-net-area',
            '套内面积',
            area,
            unit,
            '按区域闭合边界计算的套内面积',
            false,
            formatOptions,
          ),
        ],
      }
    }

    const bounds = getObjectBounds(node.id)
    if (bounds) {
      const value = bounds.size[0] * bounds.size[2]
      return {
        value,
        label: '占地面积',
        description: '区域包围盒占地面积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'area',
            'zone-bounds-area',
            '占地面积',
            value,
            unit,
            '区域边界不可用时，按包围盒占地估算',
            true,
            formatOptions,
          ),
        ],
      }
    }

    return null
  }

  if (node.type === 'door') {
    const door = node as DoorNode
    const value = door.width * door.height
    return {
      value,
      label: '洞口面积',
      description: '门洞面积',
      metrics: [
        createMeasurementMetric(
          'area',
          'door-opening-area',
          '洞口面积',
          value,
          unit,
          '门洞外接矩形面积',
          false,
          formatOptions,
        ),
      ],
    }
  }

  if (node.type === 'window') {
    const windowNode = node as WindowNode
    const value = windowNode.width * windowNode.height
    return {
      value,
      label: '洞口面积',
      description: '窗洞面积',
      metrics: [
        createMeasurementMetric(
          'area',
          'window-opening-area',
          '洞口面积',
          value,
          unit,
          '窗洞外接矩形面积',
          false,
          formatOptions,
        ),
      ],
    }
  }

  if (node.type === 'roof-segment') {
    const projectionArea = getRoofProjectionArea(node as RoofSegmentNode)
    const surfaceArea = getRoofSurfaceArea(node as RoofSegmentNode)
    return {
      value: projectionArea,
      label: '投影面积',
      description: '屋顶分段的水平投影面积',
      approximate: true,
      metrics: [
        createMeasurementMetric(
          'area',
          'roof-segment-projection-area',
          '投影面积',
          projectionArea,
          unit,
          '屋顶分段的水平投影面积',
          true,
          formatOptions,
        ),
        createMeasurementMetric(
          'area',
          'roof-segment-surface-area',
          '斜面展开面积',
          surfaceArea,
          unit,
          '按坡度将屋顶投影面积换算得到的斜面展开面积',
          true,
          formatOptions,
        ),
      ],
    }
  }

  if (node.type === 'roof') {
    const totalArea = getRoofGroupProjectionArea(node as RoofNode, nodes)
    const totalSurfaceArea = getRoofGroupSurfaceArea(node as RoofNode, nodes)
    if (totalArea > 0.0001) {
      return {
        value: totalArea,
        label: '投影面积合计',
        description: '屋顶各分段投影面积合计',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'area',
            'roof-projection-area',
            '投影面积合计',
            totalArea,
            unit,
            '屋顶各分段投影面积合计',
            true,
            formatOptions,
          ),
          createMeasurementMetric(
            'area',
            'roof-surface-area',
            '斜面展开面积合计',
            totalSurfaceArea,
            unit,
            '屋顶各分段斜面展开面积合计',
            true,
            formatOptions,
          ),
        ],
      }
    }
  }

  if (node.type === 'level') {
    const levelArea = getLevelFloorAreaValue(node as LevelNode, nodes)
    const envelopeArea = getApproxEnvelopePlanArea(node, nodes)
    const roofProjectionArea = collectRoofSegments(node, nodes).reduce(
      (sum, segment) => sum + getRoofProjectionArea(segment),
      0,
    )
    const primary = levelArea ?? envelopeArea

    if (primary?.value && primary.value > 0.0001) {
      const metrics: MeasurementMetric[] = []

      if (levelArea?.value && levelArea.value > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'area',
            'level-floor-area',
            levelArea.sourceLabel,
            levelArea.value,
            unit,
            levelArea.description,
            levelArea.approximate,
            formatOptions,
          ),
        )
      }

      if (envelopeArea?.value && envelopeArea.value > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'area',
            'level-envelope-area',
            '占地投影面积',
            envelopeArea.value,
            unit,
            envelopeArea.description,
            envelopeArea.approximate === true,
            formatOptions,
          ),
        )
      }

      if (roofProjectionArea > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'area',
            'level-roof-projection-area',
            '屋顶投影面积',
            roofProjectionArea,
            unit,
            '本层关联屋顶分段的投影面积合计',
            true,
            formatOptions,
          ),
        )
      }

      return {
        value: primary.value,
        label: levelArea ? '楼层净面积' : '占地投影面积',
        description: levelArea
          ? '优先按本层楼板净面积汇总，缺少楼板时回退到区域套内面积或占地包络'
          : primary.description,
        approximate: primary.approximate === true,
        metrics,
      }
    }
  }

  if (node.type === 'building') {
    const building = node as BuildingNode
    const totalFloorArea = getSortedLevelsForBuilding(building, nodes).reduce(
      (acc, level) => {
        const areaValue = getLevelFloorAreaValue(level, nodes)
        if (!(areaValue && areaValue.value > 0.0001)) return acc

        return {
          value: acc.value + areaValue.value,
          approximate: acc.approximate || areaValue.approximate,
        }
      },
      { value: 0, approximate: false },
    )
    const envelopeArea = getApproxEnvelopePlanArea(building, nodes)
    const roofProjectionArea = collectRoofSegments(building, nodes).reduce(
      (sum, segment) => sum + getRoofProjectionArea(segment),
      0,
    )
    const primary =
      totalFloorArea.value > 0.0001
        ? {
            value: totalFloorArea.value,
            approximate: totalFloorArea.approximate,
            description: '按各层楼板净面积汇总得到的总楼地面面积',
          }
        : envelopeArea

    if (primary?.value && primary.value > 0.0001) {
      const metrics: MeasurementMetric[] = []

      if (totalFloorArea.value > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'area',
            'building-floor-area',
            '总楼地面面积',
            totalFloorArea.value,
            unit,
            '按各层楼板净面积汇总得到的总楼地面面积',
            totalFloorArea.approximate,
            formatOptions,
          ),
        )
      }

      if (envelopeArea?.value && envelopeArea.value > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'area',
            'building-footprint-area',
            '占地投影面积',
            envelopeArea.value,
            unit,
            envelopeArea.description,
            envelopeArea.approximate === true,
            formatOptions,
          ),
        )
      }

      if (roofProjectionArea > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'area',
            'building-roof-projection-area',
            '屋顶投影面积',
            roofProjectionArea,
            unit,
            '建筑关联屋顶分段的投影面积合计',
            true,
            formatOptions,
          ),
        )
      }

      return {
        value: primary.value,
        label: totalFloorArea.value > 0.0001 ? '总楼地面面积' : '占地投影面积',
        description:
          totalFloorArea.value > 0.0001
            ? '优先按各层楼板净面积汇总，缺少楼板时回退占地投影面积'
            : primary.description,
        approximate: primary.approximate === true,
        metrics,
      }
    }
  }

  const bounds = getObjectBounds(node.id)
  if (!bounds) return null

  const value = bounds.size[0] * bounds.size[2]
  return {
    value,
    label: '占地面积',
    description: '包围盒占地面积',
    approximate: true,
    metrics: [
      createMeasurementMetric(
        'area',
        'bounds-area',
        '占地面积',
        value,
        unit,
        '按包围盒占地估算',
        true,
        formatOptions,
      ),
    ],
  }
}

function getVolumeValue(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): MeasurementValueResult | null {
  if (node.type === 'wall') {
    const wall = node as WallNode
    const length = getWallCurveLength(wall)
    const height = wall.height ?? DEFAULT_WALL_HEIGHT
    const thickness = getWallThickness(wall)
    const grossVolume = length * height * thickness
    const openingVolume = Math.min(grossVolume, getWallOpeningArea(wall, nodes) * thickness)
    const netVolume = Math.max(0, grossVolume - openingVolume)
    const primaryValue = netVolume > 0.0001 ? netVolume : grossVolume
    const metrics = [
      createMeasurementMetric(
        'volume',
        'wall-gross-volume',
        '毛实体体积',
        grossVolume,
        unit,
        '按墙长 × 墙高 × 墙厚得到',
        false,
        formatOptions,
      ),
    ]

    if (openingVolume > 0.0001) {
      metrics.push(
        createMeasurementMetric(
          'volume',
          'wall-opening-deduction-volume',
          '洞口扣减体积',
          openingVolume,
          unit,
          '按门窗洞口面积 × 墙厚估算的扣减体积',
          false,
          formatOptions,
        ),
      )
    }

    metrics.push(
      createMeasurementMetric(
        'volume',
        'wall-net-volume',
        '净实体体积',
        primaryValue,
        unit,
        openingVolume > 0.0001 ? '墙体净实体体积，已扣除门窗洞口' : '墙体实体体积',
        false,
        formatOptions,
      ),
    )

    return {
      value: primaryValue,
      label: '净实体体积',
      description: openingVolume > 0.0001 ? '墙体净实体体积，已扣除门窗洞口' : '墙体实体体积',
      metrics,
    }
  }

  if (node.type === 'fence') {
    const fence = node as FenceNode
    const value =
      Math.hypot(fence.end[0] - fence.start[0], fence.end[1] - fence.start[1]) *
      fence.height *
      fence.thickness
    return {
      value,
      label: '实体体积',
      description: '围栏体积',
      metrics: [
        createMeasurementMetric(
          'volume',
          'fence-volume',
          '实体体积',
          value,
          unit,
          '按围栏长度 × 高度 × 厚度估算',
          false,
          formatOptions,
        ),
      ],
    }
  }

  if (node.type === 'slab') {
    const slab = node as SlabNode
    const grossArea = calculatePolygonArea(slab.polygon)
    const holeArea = getSurfaceHoleArea(slab.holes)
    const area = calculatePolygonAreaWithHoles(slab.polygon, slab.holes)
    const thickness = getObjectBounds(node.id)?.size[1] ?? 0

    if ((grossArea > 0.0001 || area > 0.0001) && thickness > 0.001) {
      const grossVolume = Math.max(grossArea, area) * thickness
      const holeVolume = holeArea * thickness
      const netVolume = area > 0.0001 ? area * thickness : grossVolume
      return {
        value: netVolume,
        label: '净实体体积',
        description: holeArea > 0.0001 ? '楼板净实体体积，已扣除洞口' : '楼板实体体积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'volume',
            'slab-gross-volume',
            '毛实体体积',
            grossVolume,
            unit,
            `按楼板毛投影面积 × 厚度 ${formatLength(thickness, unit, formatOptions)} 得到`,
            true,
            formatOptions,
          ),
          ...(holeVolume > 0.0001
            ? [
                createMeasurementMetric(
                  'volume',
                  'slab-hole-deduction-volume',
                  '洞口扣减体积',
                  holeVolume,
                  unit,
                  `按楼板洞口面积 × 厚度 ${formatLength(thickness, unit, formatOptions)} 得到`,
                  true,
                  formatOptions,
                ),
              ]
            : []),
          createMeasurementMetric(
            'volume',
            'slab-net-volume',
            '净实体体积',
            netVolume,
            unit,
            holeArea > 0.0001
              ? `按楼板净投影面积 × 厚度 ${formatLength(thickness, unit, formatOptions)} 得到`
              : `按楼板投影面积 × 厚度 ${formatLength(thickness, unit, formatOptions)} 得到`,
            true,
            formatOptions,
          ),
        ],
      }
    }

    const bounds = getObjectBounds(node.id)
    if (bounds) {
      const value = bounds.size[0] * bounds.size[1] * bounds.size[2]
      return {
        value,
        label: '包络体积',
        description: '楼板包围盒体积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'volume',
            'slab-bounds-volume',
            '包络体积',
            value,
            unit,
            '楼板轮廓不可用时，按包围盒体积估算',
            true,
            formatOptions,
          ),
        ],
      }
    }
  }

  if (node.type === 'ceiling') {
    const ceiling = node as CeilingNode
    const grossArea = calculatePolygonArea(ceiling.polygon)
    const holeArea = getSurfaceHoleArea(ceiling.holes)
    const area = calculatePolygonAreaWithHoles(ceiling.polygon, ceiling.holes)
    const thickness = getObjectBounds(node.id)?.size[1] ?? 0

    if ((grossArea > 0.0001 || area > 0.0001) && thickness > 0.001) {
      const grossVolume = Math.max(grossArea, area) * thickness
      const holeVolume = holeArea * thickness
      const netVolume = area > 0.0001 ? area * thickness : grossVolume
      return {
        value: netVolume,
        label: '净实体体积',
        description: holeArea > 0.0001 ? '吊顶净实体体积，已扣除洞口' : '吊顶实体体积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'volume',
            'ceiling-gross-volume',
            '毛实体体积',
            grossVolume,
            unit,
            `按吊顶毛投影面积 × 厚度 ${formatLength(thickness, unit, formatOptions)} 得到`,
            true,
            formatOptions,
          ),
          ...(holeVolume > 0.0001
            ? [
                createMeasurementMetric(
                  'volume',
                  'ceiling-hole-deduction-volume',
                  '洞口扣减体积',
                  holeVolume,
                  unit,
                  `按吊顶洞口面积 × 厚度 ${formatLength(thickness, unit, formatOptions)} 得到`,
                  true,
                  formatOptions,
                ),
              ]
            : []),
          createMeasurementMetric(
            'volume',
            'ceiling-net-volume',
            '净实体体积',
            netVolume,
            unit,
            holeArea > 0.0001
              ? `按吊顶净投影面积 × 厚度 ${formatLength(thickness, unit, formatOptions)} 得到`
              : `按吊顶投影面积 × 厚度 ${formatLength(thickness, unit, formatOptions)} 得到`,
            true,
            formatOptions,
          ),
        ],
      }
    }

    const bounds = getObjectBounds(node.id)
    if (bounds) {
      const value = bounds.size[0] * bounds.size[1] * bounds.size[2]
      return {
        value,
        label: '包络体积',
        description: '吊顶包围盒体积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'volume',
            'ceiling-bounds-volume',
            '包络体积',
            value,
            unit,
            '吊顶轮廓不可用时，按包围盒体积估算',
            true,
            formatOptions,
          ),
        ],
      }
    }
  }

  if (node.type === 'zone') {
    const zone = node as ZoneNode
    const area = calculatePolygonArea(zone.polygon)
    const { height, approximate } = inferZoneHeight(zone, nodes)

    if (area > 0.0001 && height > 0.0001) {
      const value = area * height
      const metrics = [
        createMeasurementMetric(
          'volume',
          'zone-net-volume',
          '房间净体积',
          value,
          unit,
          `按套内面积 ${formatArea(area, unit, formatOptions)} × 净高 ${formatLength(height, unit, formatOptions)} 得到`,
          approximate,
          formatOptions,
        ),
      ]

      const bounds = getObjectBounds(node.id)
      const boundsVolume = bounds ? bounds.size[0] * bounds.size[1] * bounds.size[2] : 0
      if (boundsVolume > 0.0001) {
        metrics.push(
          createMeasurementMetric(
            'volume',
            'zone-envelope-volume',
            '空间包络体积',
            boundsVolume,
            unit,
            '按房间包围盒体积估算',
            true,
            formatOptions,
          ),
        )
      }

      return {
        value,
        label: '房间净体积',
        description: '按套内面积与净高估算的房间净体积',
        approximate,
        metrics,
      }
    }

    if (area <= 0.0001) {
      const bounds = getObjectBounds(node.id)
      if (bounds) {
        const value = bounds.size[0] * bounds.size[1] * bounds.size[2]
        return {
          value,
          label: '空间包络体积',
          description: '空间包围盒体积',
          approximate: true,
          metrics: [
            createMeasurementMetric(
              'volume',
              'zone-bounds-volume',
              '空间包络体积',
              value,
              unit,
              '区域边界不可用时，按包围盒体积估算',
              true,
              formatOptions,
            ),
          ],
        }
      }
    }
  }

  if (node.type === 'door') {
    const door = node as DoorNode
    const value = door.width * door.height * door.frameDepth
    return {
      value,
      label: '包络体积',
      description: '门体包络体积',
      approximate: true,
      metrics: [
        createMeasurementMetric(
          'volume',
          'door-envelope-volume',
          '包络体积',
          value,
          unit,
          '按门宽 × 高 × 安装进深估算',
          true,
          formatOptions,
        ),
      ],
    }
  }

  if (node.type === 'window') {
    const windowNode = node as WindowNode
    const value = windowNode.width * windowNode.height * windowNode.frameDepth
    return {
      value,
      label: '包络体积',
      description: '窗体包络体积',
      approximate: true,
      metrics: [
        createMeasurementMetric(
          'volume',
          'window-envelope-volume',
          '包络体积',
          value,
          unit,
          '按窗宽 × 高 × 安装进深估算',
          true,
          formatOptions,
        ),
      ],
    }
  }

  if (node.type === 'level') {
    const envelopeArea = getApproxEnvelopePlanArea(node, nodes)
    const story = inferStoryHeight(node as LevelNode, nodes)
    if (envelopeArea?.value && story.height > 0.0001) {
      const value = envelopeArea.value * story.height
      return {
        value,
        label: '楼层包络体积',
        description: '按楼层占地投影面积与层高估算的楼层包络体积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'volume',
            'level-envelope-volume',
            '楼层包络体积',
            value,
            unit,
            `按占地投影面积 ${formatArea(envelopeArea.value, unit, formatOptions)} × 层高 ${formatLength(story.height, unit, formatOptions)} 得到`,
            true,
            formatOptions,
          ),
        ],
      }
    }
  }

  if (node.type === 'building') {
    const envelopeArea = getApproxEnvelopePlanArea(node, nodes)
    const totalHeight = getBuildingTotalHeightValue(node as BuildingNode, nodes)
    if (envelopeArea?.value && totalHeight?.value) {
      const value = envelopeArea.value * totalHeight.value
      return {
        value,
        label: '建筑包络体积',
        description: '按建筑占地投影面积与总高估算的建筑包络体积',
        approximate: true,
        metrics: [
          createMeasurementMetric(
            'volume',
            'building-envelope-volume',
            '建筑包络体积',
            value,
            unit,
            `按占地投影面积 ${formatArea(envelopeArea.value, unit, formatOptions)} × 建筑总高 ${formatLength(totalHeight.value, unit, formatOptions)} 得到`,
            true,
            formatOptions,
          ),
        ],
      }
    }
  }

  if (node.type === 'item') {
    const [width, height, depth] = getScaledDimensions(node as ItemNode)
    const value = width * height * depth

    return {
      value,
      label: '实体体积',
      description: '构件体积',
      approximate: true,
      metrics: [
        createMeasurementMetric(
          'volume',
          'item-volume',
          '实体体积',
          value,
          unit,
          '按构件标称宽高深估算',
          true,
          formatOptions,
        ),
      ],
    }
  }

  const bounds = getObjectBounds(node.id)
  if (!bounds) return null

  const value = bounds.size[0] * bounds.size[1] * bounds.size[2]
  return {
    value,
    label:
      node.type === 'building'
        ? '建筑包络体积'
        : node.type === 'level'
          ? '楼层包络体积'
          : '包络体积',
    description:
      node.type === 'building'
        ? '建筑包围盒体积'
        : node.type === 'level'
          ? '楼层包围盒体积'
          : '包围盒体积',
    approximate: true,
    metrics: [
      createMeasurementMetric(
        'volume',
        'bounds-volume',
        node.type === 'building'
          ? '建筑包络体积'
          : node.type === 'level'
            ? '楼层包络体积'
            : '包络体积',
        value,
        unit,
        '按包围盒体积估算',
        true,
        formatOptions,
      ),
    ],
  }
}

export function getMeasurementSummaryForNode(
  node: AnyNode,
  kind: MeasurementSummaryKind,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): MeasurementSummary | null {
  const valueResult =
    kind === 'area'
      ? getAreaValue(node, nodes, unit, formatOptions)
      : getVolumeValue(node, nodes, unit, formatOptions)

  if (!(valueResult && Number.isFinite(valueResult.value) && valueResult.value > 0.0001)) {
    return null
  }

  const metrics = valueResult.metrics?.filter(
    (metric) => Number.isFinite(metric.value) && metric.value > 0.0001,
  ) ?? [
    createMeasurementMetric(
      kind,
      `${kind}-primary`,
      valueResult.label,
      valueResult.value,
      unit,
      valueResult.description,
      valueResult.approximate === true,
      formatOptions,
    ),
  ]

  return {
    kind,
    nodeId: node.id,
    targetLabel: getMeasurementTargetLabel(node),
    primaryLabel: valueResult.label,
    value: valueResult.value,
    formattedValue:
      kind === 'area'
        ? formatArea(valueResult.value, unit, formatOptions)
        : formatVolume(valueResult.value, unit, formatOptions),
    description: valueResult.description,
    approximate: valueResult.approximate === true,
    anchor: getFallbackAnchor(node, nodes),
    metrics,
  }
}

function getClearanceMetricsForNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): ClearanceMetric[] {
  if (node.type === 'building') {
    const building = node as BuildingNode
    const baseY = getBuildingBaseY(building, nodes)
    const bounds = getObjectBounds(building.id)
    const roofProfile = getRoofHeightProfile(building, nodes)
    const parapetProfile = getRoofParapetProfile(building, nodes)
    const metrics: ClearanceMetric[] = []
    const topY = Math.max(bounds?.max[1] ?? baseY, roofProfile?.ridgeMax ?? baseY)
    const totalHeight = topY - baseY

    if (totalHeight > 0.0001) {
      metrics.push(
        createClearanceMetric(
          'total-height',
          '建筑总高',
          totalHeight,
          unit,
          '按建筑首层地坪到最高构件顶部的高度链得到',
          bounds === null || roofProfile?.approximate === true,
          formatOptions,
        ),
      )
    }

    for (const level of getSortedLevelsForBuilding(building, nodes)) {
      const story = inferStoryHeight(level, nodes)
      if (story.height > 0.0001) {
        metrics.push(
          createClearanceMetric(
            `story-height:${level.id}`,
            `${getMeasurementTargetLabel(level)}层高`,
            story.height,
            unit,
            story.description,
            story.approximate,
            formatOptions,
          ),
        )
      }
    }

    if (roofProfile) {
      metrics.push(
        createClearanceMetric(
          'eave-height',
          '最高檐口高',
          roofProfile.eaveMax - baseY,
          unit,
          '按建筑首层地坪到最高檐口的高度链得到',
          roofProfile.approximate,
          formatOptions,
        ),
        createClearanceMetric(
          'ridge-height',
          '最高屋脊高',
          roofProfile.ridgeMax - baseY,
          unit,
          '按建筑首层地坪到最高屋脊的高度链得到',
          roofProfile.approximate,
          formatOptions,
        ),
      )
    }

    if (parapetProfile) {
      metrics.push(
        createClearanceMetric(
          'parapet-height',
          '最高女儿墙高',
          parapetProfile.parapetMax,
          unit,
          '按平屋顶分段的 wallHeight 作为女儿墙/上翻墙高度估算',
          parapetProfile.approximate,
          formatOptions,
        ),
      )
    }

    return metrics
  }

  if (node.type === 'zone') {
    const zone = node as ZoneNode
    const inferred = inferZoneHeight(zone, nodes)
    const metrics = [
      createClearanceMetric(
        'clear-height',
        '净高',
        inferred.height,
        unit,
        inferred.description,
        inferred.approximate,
        formatOptions,
      ),
    ]

    const footprint = getNodeFootprintResult(node, nodes)
    const beamClearance = measureHeadroomFromFootprint(
      footprint.points,
      getNodeLevelOffset(node, nodes) + 0.02,
      sceneRegistry.nodes.get(node.id) ?? null,
    )
    if (
      beamClearance !== null &&
      beamClearance > 0.0001 &&
      beamClearance < inferred.height - 0.05
    ) {
      metrics.push(
        createClearanceMetric(
          'beam-clear-height',
          '梁下净高',
          beamClearance,
          unit,
          '按区域地面向上采样得到的最近下挂构件净高；当前会把梁、吊灯等下挂物统一视作障碍物',
          true,
          formatOptions,
        ),
      )
    }

    return metrics
  }

  if (node.type === 'level') {
    const level = node as LevelNode
    const inferred = inferLevelHeight(level, nodes)
    const story = inferStoryHeight(level, nodes)
    const parapetProfile = getRoofParapetProfile(level, nodes)
    const metrics = [
      createClearanceMetric(
        'story-height',
        '层高',
        story.height,
        unit,
        story.description,
        story.approximate,
        formatOptions,
      ),
      createClearanceMetric(
        'clear-height',
        '净高',
        inferred.height,
        unit,
        inferred.description,
        inferred.approximate,
        formatOptions,
      ),
    ]

    const footprint = getNodeFootprintResult(node, nodes)
    const beamClearance = measureHeadroomFromFootprint(
      footprint.points,
      getNodeWorldY(level.id) + 0.02,
      null,
    )
    if (
      beamClearance !== null &&
      beamClearance > 0.0001 &&
      beamClearance < inferred.height - 0.05
    ) {
      metrics.push(
        createClearanceMetric(
          'beam-clear-height',
          '梁下净高',
          beamClearance,
          unit,
          '按楼层地坪向上采样得到的最近下挂构件净高；当前会把梁、吊灯等下挂物统一视作障碍物',
          true,
          formatOptions,
        ),
      )
    }

    const roofProfile = getRoofHeightProfile(level, nodes)
    if (roofProfile) {
      const levelBaseY = getNodeWorldY(level.id)
      metrics.push(
        createClearanceMetric(
          'eave-height',
          '檐口高',
          roofProfile.eaveMax - levelBaseY,
          unit,
          '按本层地坪到最高檐口的高度链得到',
          roofProfile.approximate,
          formatOptions,
        ),
        createClearanceMetric(
          'ridge-height',
          '屋脊高',
          roofProfile.ridgeMax - levelBaseY,
          unit,
          '按本层地坪到最高屋脊的高度链得到',
          roofProfile.approximate,
          formatOptions,
        ),
      )
    }

    if (parapetProfile) {
      metrics.push(
        createClearanceMetric(
          'parapet-height',
          '最高女儿墙高',
          parapetProfile.parapetMax,
          unit,
          '按本层平屋顶分段的 wallHeight 作为女儿墙/上翻墙高度估算',
          parapetProfile.approximate,
          formatOptions,
        ),
      )
    }

    return metrics
  }

  if (node.type === 'roof-segment') {
    const roofSegment = node as RoofSegmentNode
    const levelOffset = getNodeLevelOffset(node, nodes)
    const baseY = getNodeWorldY(roofSegment.id)
    const eaveHeight = baseY - levelOffset + Math.max(0, roofSegment.wallHeight)
    const ridgeHeight =
      baseY -
      levelOffset +
      Math.max(
        0,
        roofSegment.wallHeight + (roofSegment.roofType === 'flat' ? 0 : roofSegment.roofHeight),
      )

    const metrics = [
      createClearanceMetric(
        'eave-height',
        '檐口高',
        eaveHeight,
        unit,
        '按所在楼层地坪到屋顶分段檐口的高度链得到',
        false,
        formatOptions,
      ),
      createClearanceMetric(
        'ridge-height',
        '屋脊高',
        ridgeHeight,
        unit,
        '按所在楼层地坪到屋顶分段最高点的高度链得到',
        false,
        formatOptions,
      ),
    ]

    if (roofSegment.roofType === 'flat' && roofSegment.wallHeight > 0.0001) {
      metrics.push(
        createClearanceMetric(
          'parapet-height',
          '女儿墙高',
          roofSegment.wallHeight,
          unit,
          '按平屋顶分段的 wallHeight 作为女儿墙/上翻墙高度估算',
          false,
          formatOptions,
        ),
      )
    }

    return metrics
  }

  if (node.type === 'roof') {
    const roofProfile = getRoofHeightProfile(node, nodes)
    const parapetProfile = getRoofParapetProfile(node, nodes)
    if (!roofProfile && !parapetProfile) return []

    const levelOffset = getNodeLevelOffset(node, nodes)
    const metrics: ClearanceMetric[] = []

    if (roofProfile) {
      metrics.push(
        createClearanceMetric(
          'eave-height',
          '最高檐口高',
          roofProfile.eaveMax - levelOffset,
          unit,
          '按所在楼层地坪到屋顶组最高檐口的高度链得到',
          roofProfile.approximate,
          formatOptions,
        ),
        createClearanceMetric(
          'ridge-height',
          '最高屋脊高',
          roofProfile.ridgeMax - levelOffset,
          unit,
          '按所在楼层地坪到屋顶组最高屋脊的高度链得到',
          roofProfile.approximate,
          formatOptions,
        ),
      )
    }

    if (parapetProfile) {
      metrics.push(
        createClearanceMetric(
          'parapet-height',
          '最高女儿墙高',
          parapetProfile.parapetMax,
          unit,
          '按平屋顶分段的 wallHeight 作为女儿墙/上翻墙高度估算',
          parapetProfile.approximate,
          formatOptions,
        ),
      )
    }

    return metrics
  }

  if (node.type === 'door') {
    const door = node as DoorNode
    const metrics = [
      createClearanceMetric(
        'clear-width',
        '门净宽',
        door.width,
        unit,
        '门洞净宽',
        false,
        formatOptions,
      ),
      createClearanceMetric(
        'clear-height',
        '门净高',
        door.height,
        unit,
        '门洞净高',
        false,
        formatOptions,
      ),
    ]

    const bounds = getObjectBounds(node.id)
    const object = sceneRegistry.nodes.get(node.id) ?? null
    const roots = getMeasurementRaycastRoots()
    if (bounds) {
      const topClearance = measureDirectionalClearance(
        roots,
        buildVerticalSamplePoints(bounds, 'top'),
        directionUp,
        object,
      )
      if (topClearance !== null) {
        metrics.push(
          createClearanceMetric(
            'top-clearance',
            '顶部净空',
            topClearance,
            unit,
            '门顶到上方最近构件的净空',
            true,
            formatOptions,
          ),
        )
      }
    }

    return metrics
  }

  if (node.type === 'window') {
    const windowNode = node as WindowNode
    const metrics = [
      createClearanceMetric(
        'sill-height',
        '窗台高',
        windowNode.position[1] - windowNode.height / 2,
        unit,
        '窗台离地高度',
        false,
        formatOptions,
      ),
      createClearanceMetric(
        'clear-height',
        '窗净高',
        windowNode.height,
        unit,
        '窗洞净高',
        false,
        formatOptions,
      ),
    ]

    const bounds = getObjectBounds(node.id)
    const object = sceneRegistry.nodes.get(node.id) ?? null
    const roots = getMeasurementRaycastRoots()
    if (bounds) {
      const topClearance = measureDirectionalClearance(
        roots,
        buildVerticalSamplePoints(bounds, 'top'),
        directionUp,
        object,
      )
      if (topClearance !== null) {
        metrics.push(
          createClearanceMetric(
            'top-clearance',
            '顶部净空',
            topClearance,
            unit,
            '窗顶到上方最近构件的净空',
            true,
            formatOptions,
          ),
        )
      }
    }

    return metrics
  }

  if (node.type !== 'item') {
    return []
  }

  const bounds = getObjectBounds(node.id)
  const object = sceneRegistry.nodes.get(node.id) ?? null
  if (!(bounds && object)) return []

  const levelOffset = getNodeLevelOffset(node, nodes)
  const roots = getMeasurementRaycastRoots()
  const metrics: ClearanceMetric[] = []

  const topClearance = measureDirectionalClearance(
    roots,
    buildVerticalSamplePoints(bounds, 'top'),
    directionUp,
    object,
  )
  if (topClearance !== null) {
    metrics.push(
      createClearanceMetric(
        'top-clearance',
        '顶部净空',
        topClearance,
        unit,
        '构件顶部到上方最近构件的净空',
        true,
        formatOptions,
      ),
    )
  }

  const floorOffset = Math.max(0, bounds.min[1] - levelOffset)
  metrics.push(
    createClearanceMetric(
      'floor-offset',
      '离地高度',
      floorOffset,
      unit,
      '构件底部离楼地面的高度',
      false,
      formatOptions,
    ),
  )

  const axes = getObjectHorizontalAxes(object)
  const directionalMetrics = [
    {
      id: 'front-clearance' as const,
      label: '前向净距',
      direction: axes.forward,
      description: '按构件朝向前方采样得到的净距',
    },
    {
      id: 'back-clearance' as const,
      label: '后向净距',
      direction: axes.back,
      description: '按构件朝向后方采样得到的净距',
    },
    {
      id: 'left-clearance' as const,
      label: '左向净距',
      direction: axes.left,
      description: '按构件左侧方向采样得到的净距',
    },
    {
      id: 'right-clearance' as const,
      label: '右向净距',
      direction: axes.right,
      description: '按构件右侧方向采样得到的净距',
    },
  ]

  const horizontalDistances = directionalMetrics.flatMap((metric) => {
    const distance = measureDirectionalClearance(
      roots,
      buildDirectionalSamplePoints(bounds, metric.direction),
      metric.direction,
      object,
    )

    if (distance === null || !Number.isFinite(distance)) return []

    metrics.push(
      createClearanceMetric(
        metric.id,
        metric.label,
        distance,
        unit,
        metric.description,
        true,
        formatOptions,
      ),
    )

    return [distance]
  })

  if (horizontalDistances.length > 0) {
    metrics.push(
      createClearanceMetric(
        'horizontal-clearance',
        '最近水平净距',
        Math.min(...horizontalDistances),
        unit,
        '按四个水平主方向采样得到的最近净距',
        true,
        formatOptions,
      ),
    )
  }

  return metrics
}

function getPrimaryClearanceMetric(node: AnyNode, metrics: ClearanceMetric[]) {
  if (metrics.length === 0) return null

  if (node.type === 'building') {
    return (
      metrics.find((metric) => metric.id === 'total-height') ??
      metrics.find((metric) => metric.id === 'ridge-height') ??
      metrics[0]
    )
  }

  if (node.type === 'level') {
    return (
      metrics.find((metric) => metric.id === 'story-height') ??
      metrics.find((metric) => metric.id === 'beam-clear-height') ??
      metrics.find((metric) => metric.id === 'clear-height') ??
      metrics[0]
    )
  }

  if (node.type === 'zone') {
    return (
      metrics.find((metric) => metric.id === 'beam-clear-height') ??
      metrics.find((metric) => metric.id === 'clear-height') ??
      metrics[0]
    )
  }

  if (node.type === 'roof' || node.type === 'roof-segment') {
    return (
      metrics.find((metric) => metric.id === 'parapet-height') ??
      metrics.find((metric) => metric.id === 'ridge-height') ??
      metrics.find((metric) => metric.id === 'eave-height') ??
      metrics[0]
    )
  }

  if (node.type === 'door') {
    return (
      metrics.find((metric) => metric.id === 'clear-height') ??
      metrics.find((metric) => metric.id === 'top-clearance') ??
      metrics[0]
    )
  }

  if (node.type === 'window') {
    return (
      metrics.find((metric) => metric.id === 'sill-height') ??
      metrics.find((metric) => metric.id === 'top-clearance') ??
      metrics[0]
    )
  }

  return (
    metrics.find((metric) => metric.id === 'top-clearance') ??
    metrics.find((metric) => metric.id === 'horizontal-clearance') ??
    metrics.find((metric) => metric.id === 'floor-offset') ??
    metrics[0]
  )
}

export function getClearanceSummaryForNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): ClearanceSummary | null {
  const metrics = getClearanceMetricsForNode(node, nodes, unit, formatOptions).filter(
    (metric) => Number.isFinite(metric.value) && metric.value >= 0,
  )

  if (metrics.length === 0) return null

  const primary = getPrimaryClearanceMetric(node, metrics)
  if (!primary) return null

  return {
    nodeId: node.id,
    targetLabel: getMeasurementTargetLabel(node),
    primaryLabel: primary.label,
    value: primary.value,
    formattedValue: primary.formattedValue,
    description: primary.description,
    approximate: primary.approximate,
    anchor: getFallbackAnchor(node, nodes),
    metrics,
  }
}

export function getBoundsSummaryForNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): BoundsSummary | null {
  const bounds = getObjectBounds(node.id)
  if (!bounds) return null

  const [width, height, depth] = bounds.size
  const diagonal = Math.hypot(width, height, depth)
  if (!Number.isFinite(diagonal) || diagonal <= 0.0001) return null

  const approximate = node.type === 'item' || node.type === 'door' || node.type === 'window'
  const metrics: BoundsMetric[] = [
    createBoundsMetric(
      'width',
      '宽度 X',
      width,
      unit,
      '按当前世界坐标包围盒 X 方向跨度得到',
      approximate,
      formatOptions,
    ),
    createBoundsMetric(
      'depth',
      '深度 Z',
      depth,
      unit,
      '按当前世界坐标包围盒 Z 方向跨度得到',
      approximate,
      formatOptions,
    ),
    createBoundsMetric(
      'height',
      '高度 Y',
      height,
      unit,
      '按当前世界坐标包围盒 Y 方向跨度得到',
      approximate,
      formatOptions,
    ),
    createBoundsMetric(
      'diagonal',
      '空间对角线',
      diagonal,
      unit,
      '按包围盒宽、深、高计算得到的三维对角线',
      approximate,
      formatOptions,
    ),
    createBoundsMetric(
      'center-x',
      '中心 X',
      bounds.center[0],
      unit,
      '当前世界坐标包围盒中心点 X 坐标',
      true,
      formatOptions,
    ),
    createBoundsMetric(
      'center-y',
      '中心 Y',
      bounds.center[1],
      unit,
      '当前世界坐标包围盒中心点 Y 坐标',
      true,
      formatOptions,
    ),
    createBoundsMetric(
      'center-z',
      '中心 Z',
      bounds.center[2],
      unit,
      '当前世界坐标包围盒中心点 Z 坐标',
      true,
      formatOptions,
    ),
  ].filter((metric) => Number.isFinite(metric.value))

  return {
    nodeId: node.id,
    targetLabel: getMeasurementTargetLabel(node),
    primaryLabel: '包围盒尺寸',
    value: diagonal,
    formattedValue: `${formatLength(width, unit, formatOptions)} × ${formatLength(depth, unit, formatOptions)} × ${formatLength(height, unit, formatOptions)}`,
    description: '按当前渲染对象的世界轴对齐包围盒计算，适合快速核对构件占用尺寸',
    approximate,
    anchor: getFallbackAnchor(node, nodes),
    bounds,
    metrics,
  }
}

export function getPerimeterSummaryForNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): PerimeterSummary | null {
  const metrics = getPerimeterMetricsForNode(node, nodes, unit, formatOptions).filter(
    (metric) =>
      Number.isFinite(metric.value) && (Math.abs(metric.value) > 0.0001 || Boolean(metric.rule)),
  )

  if (metrics.length === 0) return null

  const primary = getPrimaryPerimeterMetric(node, metrics)
  if (!primary) return null

  return {
    nodeId: node.id,
    targetLabel: getMeasurementTargetLabel(node),
    primaryLabel: primary.label,
    value: primary.value,
    formattedValue: primary.formattedValue,
    description: primary.description,
    approximate: primary.approximate,
    anchor: getFallbackAnchor(node, nodes),
    metrics,
  }
}

export function getAngleSummaryForNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  formatOptions?: MeasurementFormatOptions,
): AngleSummary | null {
  const metrics = getAngleMetricsForNode(node, nodes, formatOptions).filter(
    (metric) => Number.isFinite(metric.value) && metric.formattedValue.length > 0,
  )

  if (metrics.length === 0) return null

  const primary = getPrimaryAngleMetric(node, metrics)
  if (!primary) return null

  return {
    nodeId: node.id,
    targetLabel: getMeasurementTargetLabel(node),
    primaryLabel: primary.label,
    value: primary.value,
    formattedValue: primary.formattedValue,
    description: primary.description,
    approximate: primary.approximate,
    anchor: getFallbackAnchor(node, nodes),
    metrics,
  }
}

export function getAngleComparisonSummaryForSelection(
  selectedIds: string[],
  nodes: Record<string, AnyNode>,
  formatOptions?: MeasurementFormatOptions,
): AngleSummary | null {
  if (selectedIds.length !== 2) return null

  const lines = getSelectedLineLikeMeasurements(selectedIds, nodes)
  if (!lines || lines.length !== 2) return null

  const [first, second] = lines
  if (!(first && second)) return null

  const sharedEndpoint =
    getPlanPointDistance(first.start, second.start) <= 0.05
      ? {
          point: getMidpointPlan(first.start, second.start),
          firstSide: 'start' as const,
          secondSide: 'start' as const,
        }
      : getPlanPointDistance(first.start, second.end) <= 0.05
        ? {
            point: getMidpointPlan(first.start, second.end),
            firstSide: 'start' as const,
            secondSide: 'end' as const,
          }
        : getPlanPointDistance(first.end, second.start) <= 0.05
          ? {
              point: getMidpointPlan(first.end, second.start),
              firstSide: 'end' as const,
              secondSide: 'start' as const,
            }
          : getPlanPointDistance(first.end, second.end) <= 0.05
            ? {
                point: getMidpointPlan(first.end, second.end),
                firstSide: 'end' as const,
                secondSide: 'end' as const,
              }
            : null

  const firstVector = sharedEndpoint
    ? getComparisonVector(first, sharedEndpoint.firstSide)
    : normalizePlanVector([first.end[0] - first.start[0], first.end[1] - first.start[1]])
  const secondVector = sharedEndpoint
    ? getComparisonVector(second, sharedEndpoint.secondSide)
    : normalizePlanVector([second.end[0] - second.start[0], second.end[1] - second.start[1]])

  if (!(firstVector && secondVector)) return null

  const dot = Math.max(
    -1,
    Math.min(1, firstVector[0] * secondVector[0] + firstVector[1] * secondVector[1]),
  )
  const includedAngle = radiansToDegrees(Math.acos(dot))
  const outerAngle = Math.max(0, 180 - includedAngle)
  const approximate = first.approximate || second.approximate
  const firstPlanAngle = getLinePlanAngle(first.start, first.end)
  const secondPlanAngle = getLinePlanAngle(second.start, second.end)
  const anchorPlan =
    sharedEndpoint?.point ??
    getLineIntersection(first.start, first.end, second.start, second.end) ??
    getMidpointPlan(
      getMidpointPlan(first.start, first.end),
      getMidpointPlan(second.start, second.end),
    )
  const anchorY = (first.y + second.y) / 2 + 0.18
  const description = sharedEndpoint
    ? '按两条中心线在连接点处的出射方向计算夹角'
    : '按两条中心线方向向量计算夹角；对象未共点时按延长线求交或取中点显示'

  const metrics: AngleMetric[] = [
    createAngleMetric(
      'included-angle',
      '夹角',
      includedAngle,
      description,
      approximate,
      'angle',
      undefined,
      formatOptions,
    ),
    createAngleMetric(
      'outer-angle',
      '外角',
      outerAngle,
      '两条中心线的补角',
      approximate,
      'angle',
      undefined,
      formatOptions,
    ),
  ]

  if (firstPlanAngle !== null) {
    metrics.push(
      createAngleMetric(
        'line-angle-a',
        `${first.label}角度`,
        firstPlanAngle,
        `${first.label}中心线相对世界 +X 轴的平面角`,
        first.approximate,
        'angle',
        undefined,
        formatOptions,
      ),
    )
  }

  if (secondPlanAngle !== null) {
    metrics.push(
      createAngleMetric(
        'line-angle-b',
        `${second.label}角度`,
        secondPlanAngle,
        `${second.label}中心线相对世界 +X 轴的平面角`,
        second.approximate,
        'angle',
        undefined,
        formatOptions,
      ),
    )
  }

  return {
    nodeId: `${first.id}:${second.id}`,
    targetLabel: `${first.label} ↔ ${second.label}`,
    primaryLabel: '夹角',
    value: includedAngle,
    formattedValue: formatAngle(includedAngle, formatOptions),
    description,
    approximate,
    anchor: [anchorPlan[0], anchorY, anchorPlan[1]],
    metrics,
  }
}

export function getPathMeasurementSummaryForSelection(
  selectedIds: string[],
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): PathMeasurementSummary | null {
  const lines = getSelectedLineLikeMeasurements(selectedIds, nodes)
  if (!lines || lines.length === 0) return null

  const adjacency = new Map<string, Array<{ lineIndex: number; side: 'start' | 'end' }>>()
  const lineByIndex = new Map<number, LineLikeMeasurement>()

  for (const [index, line] of lines.entries()) {
    lineByIndex.set(index, line)
    const startKey = getPlanPointKey(line.start)
    const endKey = getPlanPointKey(line.end)

    adjacency.set(startKey, [
      ...(adjacency.get(startKey) ?? []),
      { lineIndex: index, side: 'start' },
    ])
    adjacency.set(endKey, [...(adjacency.get(endKey) ?? []), { lineIndex: index, side: 'end' }])
  }

  const oddKeys = Array.from(adjacency.entries())
    .filter(([, entries]) => entries.length % 2 === 1)
    .map(([key]) => key)
  const hasBranch = Array.from(adjacency.values()).some((entries) => entries.length > 2)

  if (hasBranch || !(oddKeys.length === 0 || oddKeys.length === 2)) {
    return null
  }

  let currentKey = oddKeys[0] ?? getPlanPointKey(lines[0]!.start)
  const usedLineIndexes = new Set<number>()
  const orderedPoints: PlanPoint[] = []

  while (usedLineIndexes.size < lines.length) {
    const candidates =
      adjacency.get(currentKey)?.filter((entry) => !usedLineIndexes.has(entry.lineIndex)) ?? []
    const next = candidates[0]
    if (!next) return null

    const line = lineByIndex.get(next.lineIndex)
    if (!line) return null

    const startKey = getPlanPointKey(line.start)
    const endKey = getPlanPointKey(line.end)
    const orientedPoints = next.side === 'start' ? line.pathPoints : [...line.pathPoints].reverse()

    if (orderedPoints.length === 0) {
      orderedPoints.push(...orientedPoints)
    } else {
      orderedPoints.push(...orientedPoints.slice(1))
    }

    usedLineIndexes.add(next.lineIndex)
    currentKey = next.side === 'start' ? endKey : startKey
  }

  if (orderedPoints.length < 2) return null

  const midpoint = getPolylineMidpoint(orderedPoints)
  if (!midpoint) return null

  const allWalls = lines.every((line) => line.type === 'wall')
  const allFences = lines.every((line) => line.type === 'fence')
  const approximate = lines.some((line) => line.approximate)
  const totalLength = getPolylineLength(orderedPoints)
  const averageY = lines.reduce((sum, line) => sum + line.y, 0) / Math.max(lines.length, 1)
  const closed =
    getPlanPointDistance(orderedPoints[0]!, orderedPoints[orderedPoints.length - 1]!) <= 0.05

  return {
    nodeIds: lines.map((line) => line.id),
    targetLabel: allWalls ? '沿墙路径' : allFences ? '沿围栏路径' : `组合路径 (${lines.length} 段)`,
    primaryLabel: '累计长度',
    value: totalLength,
    formattedValue: formatLength(totalLength, unit, formatOptions),
    description: `按 ${lines.length} 段${closed ? '闭合' : '连续'}中心线累计得到的路径长度`,
    approximate,
    anchor: [midpoint[0], averageY + 0.18, midpoint[1]],
    points: orderedPoints.map((point) => toWorldPlanPoint(point, averageY)),
    segmentCount: lines.length,
  }
}

export function getGridMeasurementSummaryForSelection(
  selectedIds: string[],
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): GridSummary | null {
  return buildGridMeasurementResult(selectedIds, nodes, unit, formatOptions)?.summary ?? null
}

export function getGridMeasurementGuidesForSelection(
  selectedIds: string[],
  nodes: Record<string, AnyNode>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
): GridGuide[] {
  return buildGridMeasurementResult(selectedIds, nodes, unit, formatOptions)?.guides ?? []
}

export function getNodeMeasurementSelectionTarget(
  nodes: Record<string, AnyNode>,
  selection: {
    buildingId: BuildingNode['id'] | null
    levelId: LevelNode['id'] | null
    zoneId: ZoneNode['id'] | null
    selectedIds: string[]
  },
): MeasurementSelectionTarget {
  if (selection.selectedIds.length > 1) {
    return { reason: 'multi' as const, node: null }
  }

  if (selection.selectedIds.length === 1) {
    const selectedId = selection.selectedIds[0]
    const node = selectedId ? nodes[selectedId] : null
    return { reason: null, node: node ?? null }
  }

  if (selection.zoneId) {
    return { reason: null, node: nodes[selection.zoneId] ?? null }
  }

  if (selection.levelId) {
    return { reason: null, node: nodes[selection.levelId] ?? null }
  }

  if (selection.buildingId) {
    return { reason: null, node: nodes[selection.buildingId] ?? null }
  }

  return { reason: 'empty' as const, node: null }
}
