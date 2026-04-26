'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type FenceNode,
  type LevelNode,
  resolveLevelId,
  type SiteNode,
  sceneRegistry,
  useScene,
  type WallNode,
} from '@pascal-app/core'
import { useViewer, ZONE_LAYER } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { type ThreeEvent, useThree } from '@react-three/fiber'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  Box,
  Check,
  Copy,
  DraftingCompass,
  Eye,
  EyeOff,
  FileDown,
  Grid3X3,
  ImageDown,
  Lock,
  Ruler,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  type Camera,
  type Intersection,
  type Object3D,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { EDITOR_LAYER } from './../../lib/constants'
import { exportFilters, saveBlobExport } from '../../lib/export'
import {
  type AngleSummary,
  type ClearanceSummary,
  formatLength,
  type GridGuide,
  type GridSummary,
  getAngleComparisonSummaryForSelection,
  getAngleSummaryForNode,
  getClearanceSummaryForNode,
  getGridMeasurementGuidesForSelection,
  getGridMeasurementSummaryForSelection,
  getMeasurementSummaryForNode,
  getNodeMeasurementSelectionTarget,
  getPathMeasurementSummaryForSelection,
  getPerimeterGuidesForNode,
  getPerimeterSummaryForNode,
  type MeasurementFormatOptions,
  type MeasurementPrecision,
  type MeasurementSummary,
  type MeasurementUnit,
  type PathMeasurementSummary,
  type PerimeterGuide,
  type PerimeterSummary,
} from '../../lib/measurement'
import { cn } from '../../lib/utils'
import useEditor, { type MeasurementMode } from '../../store/use-editor'
import {
  type DistanceMeasurementRecord,
  type DistanceMode,
  type NodePinnedMeasurementRecord,
  type PinnedMeasurementRecord,
  useMeasurementModeStore,
  type Vec3,
} from '../../store/use-measurement-mode'
import { PanelWrapper } from '../ui/panels/panel-wrapper'

const BAR_THICKNESS = 0.012
const POINT_RADIUS = 0.06
const LABEL_LIFT = 0.18
const BAR_AXIS = new Vector3(0, 1, 0)
const pointer = new Vector2()
const raycaster = new Raycaster()
const groundPlane = new Plane(new Vector3(0, 1, 0), 0)
const groundHit = new Vector3()
const snapBounds = new Box3()
const snapCenter = new Vector3()
const snapNormal = new Vector3()
const snapCameraPosition = new Vector3()
let sceneNodeIdCache = new WeakMap<Object3D, string>()
let sceneNodeIdCacheSize = -1
let measurementRaycastRootsCache: Object3D[] = []
let measurementRaycastRootsCacheSize = -1

const DISTANCE_MODE_LABELS: Record<DistanceMode, string> = {
  free: '自由距离',
  horizontal: '水平距离',
  vertical: '垂直距离',
  path: '路径测距',
}

const DISTANCE_MODE_DESCRIPTIONS: Record<DistanceMode, string> = {
  free: '自由测距，保留真实 3D 长度，适合量斜向和任意空间距离。',
  horizontal: '水平测距，自动锁定起点高度，只看平面距离，适合量开间、进深和庭院边长。',
  vertical: '垂直测距，自动锁定起点平面位置，只看高差，适合量层高、台阶和构件高度。',
  path: '路径测距，先多选连续墙体或围栏，再按中心线累计长度。',
}

const MEASUREMENT_SITE_METADATA_KEY = 'measurementAnnotationsV1'

type PersistedMeasurementSnapshot = {
  version: 1
  distanceRecords: DistanceMeasurementRecord[]
  pinnedRecords: PinnedMeasurementRecord[]
}

type MeasurementExportRow = {
  scope: 'current' | 'saved'
  category: string
  label: string
  value: string
  details: string
  approximate: boolean
}

type MeasurementHistoryEntry = {
  id: string
  createdAt: number
  mode: MeasurementMode
  label: string
  value: string
  details: string
  nodeId?: string
  nodeIds?: string[]
}

type MeasurementLabelEntry = {
  position: Vec3
  primary: string
  secondary?: string
  color: string
  opacity?: number
}

type DistanceSnapCandidate = {
  point: Vector3
  label: string
  distance: number
  weight: number
}

type DistancePickResult = {
  point: Vec3
  snapLabel: string | null
}

type DistancePointerSample = {
  clientX: number
  clientY: number
}

const MEASUREMENT_PRECISION_OPTIONS: MeasurementPrecision[] = [0, 1, 2]

const MEASUREMENT_MODE_LABELS: Record<MeasurementMode, string> = {
  distance: '距离',
  area: '面积',
  volume: '体积',
  clearance: '净空',
  angle: '角度',
  perimeter: '周长',
  grid: '轴网',
}

const MEASUREMENT_HISTORY_LIMIT = 8

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

function getLevelYOffset(levelId: AnyNodeId | null | undefined) {
  if (!levelId) return 0
  return sceneRegistry.nodes.get(levelId)?.position.y ?? 0
}

function toVec3(vector: Vector3): Vec3 {
  return [vector.x, vector.y, vector.z]
}

function getSegmentStats(start: Vec3, end: Vec3) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const dz = end[2] - start[2]

  return {
    dx,
    dy,
    dz,
    length: Math.hypot(dx, dy, dz),
  }
}

function projectDistancePoint(mode: DistanceMode, start: Vec3, point: Vec3): Vec3 {
  if (mode === 'horizontal') {
    return [point[0], start[1], point[2]]
  }

  if (mode === 'vertical') {
    return [start[0], point[1], start[2]]
  }

  return point
}

function getDistanceSecondary(
  mode: DistanceMode,
  stats: ReturnType<typeof getSegmentStats>,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
) {
  if (mode === 'horizontal') {
    return `ΔX ${formatLength(Math.abs(stats.dx), unit, formatOptions)} · ΔZ ${formatLength(Math.abs(stats.dz), unit, formatOptions)}`
  }

  if (mode === 'vertical') {
    return `ΔY ${formatLength(Math.abs(stats.dy), unit, formatOptions)}`
  }

  return `ΔX ${formatLength(Math.abs(stats.dx), unit, formatOptions)} · ΔY ${formatLength(Math.abs(stats.dy), unit, formatOptions)} · ΔZ ${formatLength(Math.abs(stats.dz), unit, formatOptions)}`
}

function getDistanceSnapSummary(startLabel: string | null, endLabel: string | null) {
  if (startLabel && endLabel) return `${startLabel} → ${endLabel}`
  return startLabel ?? endLabel
}

function rebuildMeasurementRaycastRoots() {
  const roots = Array.from(new Set(sceneRegistry.nodes.values()))
  const registered = new Set(roots)

  measurementRaycastRootsCache = roots.filter((object) => {
    let current = object.parent
    while (current) {
      if (registered.has(current)) return false
      current = current.parent
    }

    return true
  })
  measurementRaycastRootsCacheSize = sceneRegistry.nodes.size
}

function getMeasurementRaycastRoots(scene: Object3D) {
  if (measurementRaycastRootsCacheSize !== sceneRegistry.nodes.size) {
    rebuildMeasurementRaycastRoots()
  }

  return measurementRaycastRootsCache.length > 0 ? measurementRaycastRootsCache : scene.children
}

function rebuildSceneNodeIdCache() {
  sceneNodeIdCache = new WeakMap<Object3D, string>()
  for (const [nodeId, object] of sceneRegistry.nodes) {
    sceneNodeIdCache.set(object, nodeId)
  }
  sceneNodeIdCacheSize = sceneRegistry.nodes.size
}

function resolveSceneNodeIdFromObject(object: Object3D) {
  if (sceneNodeIdCacheSize !== sceneRegistry.nodes.size) {
    rebuildSceneNodeIdCache()
  }

  let current: Object3D | null = object
  while (current) {
    const nodeId = sceneNodeIdCache.get(current)
    if (nodeId) return nodeId
    current = current.parent
  }

  rebuildSceneNodeIdCache()

  current = object
  while (current) {
    const nodeId = sceneNodeIdCache.get(current)
    if (nodeId) return nodeId
    current = current.parent
  }

  return null
}

function projectPlanPointToWorld(
  planObject: Object3D,
  point: readonly [number, number],
  referenceWorldPoint: Vector3,
) {
  const localPoint = planObject.worldToLocal(referenceWorldPoint.clone())
  localPoint.set(point[0], localPoint.y, point[1])
  return planObject.localToWorld(localPoint)
}

function appendDistanceSnapCandidate(
  candidates: DistanceSnapCandidate[],
  worldPoint: Vector3,
  label: string,
  hitPoint: Vector3,
  weight: number,
) {
  candidates.push({
    point: worldPoint.clone(),
    label,
    distance: worldPoint.distanceTo(hitPoint),
    weight,
  })
}

function projectPointOntoSegment2D(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): [number, number] {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 1e-6) return [start[0], start[1]]

  const t = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared),
  )
  return [start[0] + dx * t, start[1] + dz * t]
}

function calculatePlanCentroid(points: ReadonlyArray<readonly [number, number]>) {
  if (points.length === 0) return null
  if (points.length === 1) return [points[0]![0], points[0]![1]] as [number, number]

  let twiceArea = 0
  let centerX = 0
  let centerZ = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!(current && next)) continue

    const cross = current[0] * next[1] - next[0] * current[1]
    twiceArea += cross
    centerX += (current[0] + next[0]) * cross
    centerZ += (current[1] + next[1]) * cross
  }

  if (Math.abs(twiceArea) <= 1e-6) {
    const average = points.reduce(
      (acc, point) => ({
        x: acc.x + point[0],
        z: acc.z + point[1],
      }),
      { x: 0, z: 0 },
    )
    return [average.x / points.length, average.z / points.length] as [number, number]
  }

  return [centerX / (3 * twiceArea), centerZ / (3 * twiceArea)] as [number, number]
}

function appendLinearNodeSnapCandidates(
  candidates: DistanceSnapCandidate[],
  node: WallNode | FenceNode,
  hitPoint: Vector3,
) {
  const object = sceneRegistry.nodes.get(node.id)
  const planObject = object?.parent ?? object
  if (!planObject) return

  const isWall = node.type === 'wall'
  const endpointLabel = isWall ? '墙端点' : '围栏端点'
  const midpointLabel = isWall ? '墙中点' : '围栏中点'
  const centerlineLabel = isWall ? '墙中心线' : '围栏中心线'
  const localHit = planObject.worldToLocal(hitPoint.clone())

  appendDistanceSnapCandidate(
    candidates,
    planObject.localToWorld(new Vector3(node.start[0], localHit.y, node.start[1])),
    endpointLabel,
    hitPoint,
    0.72,
  )
  appendDistanceSnapCandidate(
    candidates,
    planObject.localToWorld(new Vector3(node.end[0], localHit.y, node.end[1])),
    endpointLabel,
    hitPoint,
    0.72,
  )
  appendDistanceSnapCandidate(
    candidates,
    planObject.localToWorld(
      new Vector3((node.start[0] + node.end[0]) / 2, localHit.y, (node.start[1] + node.end[1]) / 2),
    ),
    midpointLabel,
    hitPoint,
    0.88,
  )

  const isCurvedWall = isWall && Math.abs((node as WallNode).curveOffset ?? 0) > 0.0001
  if (isCurvedWall) return

  const projected = projectPointOntoSegment2D([localHit.x, localHit.z], node.start, node.end)
  appendDistanceSnapCandidate(
    candidates,
    planObject.localToWorld(new Vector3(projected[0], localHit.y, projected[1])),
    centerlineLabel,
    hitPoint,
    1,
  )
}

function appendPolygonSnapCandidates(
  candidates: DistanceSnapCandidate[],
  planObject: Object3D,
  points: ReadonlyArray<readonly [number, number]>,
  hitPoint: Vector3,
  labels: {
    vertex: string
    midpoint: string
    center: string
  },
) {
  if (points.length === 0) return

  for (const point of points) {
    appendDistanceSnapCandidate(
      candidates,
      projectPlanPointToWorld(planObject, point, hitPoint),
      labels.vertex,
      hitPoint,
      0.72,
    )
  }

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!(current && next)) continue

    appendDistanceSnapCandidate(
      candidates,
      projectPlanPointToWorld(
        planObject,
        [(current[0] + next[0]) / 2, (current[1] + next[1]) / 2],
        hitPoint,
      ),
      labels.midpoint,
      hitPoint,
      0.88,
    )
  }

  const centroid = calculatePlanCentroid(points)
  if (!centroid) return

  appendDistanceSnapCandidate(
    candidates,
    projectPlanPointToWorld(planObject, centroid, hitPoint),
    labels.center,
    hitPoint,
    1.14,
  )
}

function getIntersectionWorldNormal(intersection: Intersection<Object3D>) {
  if (!intersection.face) return null
  return snapNormal
    .copy(intersection.face.normal)
    .transformDirection(intersection.object.matrixWorld)
    .normalize()
}

function appendBoundsFaceCenterSnapCandidate(
  candidates: DistanceSnapCandidate[],
  object: Object3D,
  hitPoint: Vector3,
  worldNormal: Vector3 | null,
) {
  snapBounds.setFromObject(object)
  if (snapBounds.isEmpty()) return

  const center = snapBounds.getCenter(snapCenter.clone())
  if (!worldNormal) {
    appendDistanceSnapCandidate(candidates, center, '对象中心', hitPoint, 1.14)
    return
  }

  const absX = Math.abs(worldNormal.x)
  const absY = Math.abs(worldNormal.y)
  const absZ = Math.abs(worldNormal.z)
  const faceCenter = center.clone()
  let label = '面中心'

  if (absY >= absX && absY >= absZ) {
    faceCenter.y = worldNormal.y >= 0 ? snapBounds.max.y : snapBounds.min.y
    label = worldNormal.y >= 0 ? '上表面中心' : '底面中心'
  } else if (absX >= absZ) {
    faceCenter.x = worldNormal.x >= 0 ? snapBounds.max.x : snapBounds.min.x
    label = '侧面中心'
  } else {
    faceCenter.z = worldNormal.z >= 0 ? snapBounds.max.z : snapBounds.min.z
    label = '侧面中心'
  }

  appendDistanceSnapCandidate(candidates, faceCenter, label, hitPoint, 1.08)
}

function getNodeDistanceSnapCandidates(
  node: AnyNode,
  object: Object3D,
  intersection: Intersection<Object3D>,
) {
  const candidates: DistanceSnapCandidate[] = []
  const worldNormal = getIntersectionWorldNormal(intersection)
  const isMostlyHorizontalFace = !worldNormal || Math.abs(worldNormal.y) >= 0.55

  switch (node.type) {
    case 'wall':
    case 'fence':
      appendLinearNodeSnapCandidates(candidates, node, intersection.point)
      return candidates
    case 'site':
      if (isMostlyHorizontalFace) {
        appendPolygonSnapCandidates(
          candidates,
          object,
          node.polygon?.points ?? [],
          intersection.point,
          {
            vertex: '场地顶点',
            midpoint: '地界中点',
            center: '场地中心',
          },
        )
        return candidates
      }
      break
    case 'zone':
      if (isMostlyHorizontalFace) {
        appendPolygonSnapCandidates(candidates, object, node.polygon, intersection.point, {
          vertex: '轮廓顶点',
          midpoint: '边中点',
          center: '面中心',
        })
        return candidates
      }
      break
    case 'slab':
    case 'ceiling':
      if (isMostlyHorizontalFace) {
        appendPolygonSnapCandidates(candidates, object, node.polygon, intersection.point, {
          vertex: node.type === 'slab' ? '楼板顶点' : '吊顶顶点',
          midpoint: node.type === 'slab' ? '楼板边中点' : '吊顶边中点',
          center: node.type === 'slab' ? '楼板中心' : '吊顶中心',
        })
        return candidates
      }
      break
    default:
      break
  }

  appendBoundsFaceCenterSnapCandidate(candidates, object, intersection.point, worldNormal)
  return candidates
}

function getDistanceSnapThreshold(camera: Camera, point: Vector3) {
  camera.getWorldPosition(snapCameraPosition)
  const distance = snapCameraPosition.distanceTo(point)
  return Math.min(0.8, Math.max(0.12, distance * 0.02))
}

function pickDistanceMeasurementPoint(
  sample: DistancePointerSample,
  camera: Camera,
  domElement: HTMLCanvasElement,
  scene: Object3D,
  activeLevelId: AnyNodeId | null | undefined,
): DistancePickResult | null {
  if (useViewer.getState().cameraDragging) return null

  const rect = domElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  pointer.set(
    ((sample.clientX - rect.left) / rect.width) * 2 - 1,
    -((sample.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)

  const hit = raycaster
    .intersectObjects(getMeasurementRaycastRoots(scene), true)
    .find(
      (intersection) =>
        isVisibleInHierarchy(intersection.object) && !isTransformControlObject(intersection.object),
    )

  if (hit) {
    const nodeId = resolveSceneNodeIdFromObject(hit.object)
    if (nodeId) {
      const node = useScene.getState().nodes[nodeId as AnyNodeId]
      const object = sceneRegistry.nodes.get(nodeId)
      if (node && object) {
        const candidates = getNodeDistanceSnapCandidates(node, object, hit)
        const threshold = getDistanceSnapThreshold(camera, hit.point)
        const bestCandidate = candidates
          .filter((candidate) => candidate.distance <= threshold)
          .sort((left, right) => left.distance * left.weight - right.distance * right.weight)[0]

        if (bestCandidate) {
          return {
            point: toVec3(bestCandidate.point),
            snapLabel: bestCandidate.label,
          }
        }
      }
    }

    return {
      point: [hit.point.x, hit.point.y, hit.point.z],
      snapLabel: null,
    }
  }

  groundPlane.constant = -getLevelYOffset(activeLevelId)
  if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
    return { point: toVec3(groundHit), snapLabel: '楼层基准面' }
  }

  return null
}

function getMeasurementSegment(start: Vec3, end: Vec3) {
  const startVector = new Vector3(...start)
  const endVector = new Vector3(...end)
  const direction = endVector.clone().sub(startVector)
  const length = direction.length()

  if (!Number.isFinite(length) || length < 0.0001) return null

  return {
    length,
    position: startVector.clone().add(endVector).multiplyScalar(0.5),
    quaternion: new Quaternion().setFromUnitVectors(BAR_AXIS, direction.normalize()),
  }
}

function getGuideLabelLifts<T extends { id: string; start: Vec3; end: Vec3 }>(guides: T[]) {
  const placements: Array<{ x: number; z: number; level: number }> = []
  const lifts: Record<string, number> = {}

  for (const guide of guides) {
    const x = (guide.start[0] + guide.end[0]) / 2
    const z = (guide.start[2] + guide.end[2]) / 2
    let level = 0

    for (const placement of placements) {
      if (Math.hypot(placement.x - x, placement.z - z) < 2.8) {
        level = Math.max(level, placement.level + 1)
      }
    }

    placements.push({ x, z, level })
    lifts[guide.id] = LABEL_LIFT + level * 0.16
  }

  return lifts
}

function getPerimeterGuideLabelLifts(guides: PerimeterGuide[]) {
  return getGuideLabelLifts(guides) as Partial<Record<PerimeterGuide['id'], number>>
}

function getGridGuideLabelLifts(guides: GridGuide[]) {
  return getGuideLabelLifts(guides) as Partial<Record<GridGuide['id'], number>>
}

function getPathRecordSecondary(segmentCount: number, approximate: boolean) {
  return `路径测距 · ${segmentCount} 段${approximate ? ' · 近似值' : ''}`
}

function useMeasurementFormatOptions() {
  const precision = useMeasurementModeStore((state) => state.precision)
  return useMemo<MeasurementFormatOptions>(() => ({ precision }), [precision])
}

function getTimestampFromMeasurementId(id: string) {
  const match = id.match(/:(\d{10,})/)
  return match ? Number.parseInt(match[1]!, 10) : 0
}

function normalizeRecordTimestamp(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  return fallback
}

function resolveBuildingIdForLevel(levelId: string, nodes: Record<string, AnyNode>) {
  const level = nodes[levelId]
  if (!level || level.type !== 'level' || !level.parentId) return null

  const parent = nodes[level.parentId]
  return parent?.type === 'building' ? parent.id : null
}

function recallMeasurementNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  mode: MeasurementMode,
) {
  const editor = useEditor.getState()
  const viewer = useViewer.getState()

  editor.setMeasurementMode(mode)
  if (node.type === 'site') {
    editor.setPhase('site')
    viewer.resetSelection()
    return
  }

  if (node.type === 'item') {
    editor.setPhase('furnish')
  } else {
    editor.setPhase('structure')
  }

  if (node.type === 'building') {
    viewer.setSelection({ buildingId: node.id })
    return
  }

  if (node.type === 'level') {
    viewer.setSelection({
      buildingId: resolveBuildingIdForLevel(node.id, nodes),
      levelId: node.id,
    })
    return
  }

  const nodeLevelId = resolveLevelId(node, nodes)
  const buildingId =
    nodeLevelId && nodeLevelId !== 'default' ? resolveBuildingIdForLevel(nodeLevelId, nodes) : null
  const normalizedLevelId =
    nodeLevelId && nodeLevelId !== 'default' ? (nodeLevelId as LevelNode['id']) : null

  if (node.type === 'zone') {
    viewer.setSelection({
      buildingId,
      levelId: normalizedLevelId,
      zoneId: node.id,
    })
    return
  }

  viewer.setSelection({
    buildingId,
    levelId: normalizedLevelId,
    selectedIds: [node.id],
  })
}

function recallMeasurementGroup(
  nodeIds: string[],
  nodes: Record<string, AnyNode>,
  mode: Extract<MeasurementMode, 'grid'>,
) {
  if (nodeIds.length === 0) return

  const editor = useEditor.getState()
  const viewer = useViewer.getState()
  const firstNode = nodes[nodeIds[0]!]
  if (!firstNode) return

  editor.setMeasurementMode(mode)
  editor.setMode('select')
  editor.setPhase('structure')

  const nodeLevelId = resolveLevelId(firstNode, nodes)
  const buildingId =
    nodeLevelId && nodeLevelId !== 'default' ? resolveBuildingIdForLevel(nodeLevelId, nodes) : null
  const normalizedLevelId =
    nodeLevelId && nodeLevelId !== 'default' ? (nodeLevelId as LevelNode['id']) : null

  viewer.setSelection({
    buildingId,
    levelId: normalizedLevelId,
    selectedIds: nodeIds.filter((nodeId) => Boolean(nodes[nodeId])) as AnyNodeId[],
  })
}

function formatHistoryTimestamp(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '较早'
  return new Intl.DateTimeFormat(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function normalizeDistanceRecord(value: unknown): DistanceMeasurementRecord | null {
  if (!(typeof value === 'object' && value !== null)) return null

  const candidate = value as Record<string, unknown>
  const id =
    typeof candidate.id === 'string'
      ? candidate.id
      : candidate.mode === 'path'
        ? `distance:path:${Date.now()}`
        : `distance:${Date.now()}`
  const createdAt = normalizeRecordTimestamp(candidate.createdAt, getTimestampFromMeasurementId(id))

  if (candidate.mode === 'path') {
    if (
      !Array.isArray(candidate.points) ||
      !candidate.points.every((point) => isVec3(point)) ||
      typeof candidate.length !== 'number' ||
      !Number.isFinite(candidate.length) ||
      !isVec3(candidate.anchor) ||
      typeof candidate.segmentCount !== 'number' ||
      !Number.isFinite(candidate.segmentCount)
    ) {
      return null
    }

    return {
      id,
      createdAt,
      mode: 'path',
      points: candidate.points as Vec3[],
      length: candidate.length,
      anchor: candidate.anchor,
      segmentCount: candidate.segmentCount,
      approximate: candidate.approximate === true,
    }
  }

  if (
    (candidate.mode === 'free' ||
      candidate.mode === 'horizontal' ||
      candidate.mode === 'vertical' ||
      candidate.mode === 'path') &&
    isVec3(candidate.start) &&
    isVec3(candidate.end)
  ) {
    return {
      id,
      createdAt,
      mode: candidate.mode,
      start: candidate.start,
      end: candidate.end,
    }
  }

  return null
}

function normalizePinnedRecord(value: unknown): PinnedMeasurementRecord | null {
  if (!(typeof value === 'object' && value !== null)) return null

  const candidate = value as Record<string, unknown>
  const kind = candidate.kind

  if (
    kind === 'grid' &&
    Array.isArray(candidate.nodeIds) &&
    candidate.nodeIds.every((entry) => typeof entry === 'string')
  ) {
    const normalizedIds = Array.from(new Set(candidate.nodeIds as string[])).sort()
    if (normalizedIds.length < 2) return null

    const id = typeof candidate.id === 'string' ? candidate.id : `grid:${normalizedIds.join('|')}`
    return {
      id,
      createdAt: normalizeRecordTimestamp(candidate.createdAt, getTimestampFromMeasurementId(id)),
      kind: 'grid',
      nodeIds: normalizedIds,
    }
  }

  if (
    (kind === 'area' ||
      kind === 'volume' ||
      kind === 'clearance' ||
      kind === 'angle' ||
      kind === 'perimeter') &&
    typeof candidate.nodeId === 'string'
  ) {
    const id =
      typeof candidate.id === 'string' ? candidate.id : `${kind}:${candidate.nodeId as string}`
    return {
      id,
      createdAt: normalizeRecordTimestamp(candidate.createdAt, getTimestampFromMeasurementId(id)),
      kind,
      nodeId: candidate.nodeId,
    }
  }

  return null
}

function readPersistedMeasurementSnapshot(
  site: Pick<SiteNode, 'metadata'> | null | undefined,
): PersistedMeasurementSnapshot {
  const metadata =
    typeof site?.metadata === 'object' && site.metadata !== null && !Array.isArray(site.metadata)
      ? (site.metadata as Record<string, unknown>)
      : {}
  const raw = metadata[MEASUREMENT_SITE_METADATA_KEY]

  if (!(typeof raw === 'object' && raw !== null)) {
    return { version: 1, distanceRecords: [], pinnedRecords: [] }
  }

  const candidate = raw as Record<string, unknown>
  const distanceRecords = Array.isArray(candidate.distanceRecords)
    ? candidate.distanceRecords
        .map((record) => normalizeDistanceRecord(record))
        .filter((record): record is DistanceMeasurementRecord => record !== null)
    : []
  const pinnedRecords = Array.isArray(candidate.pinnedRecords)
    ? candidate.pinnedRecords
        .map((record) => normalizePinnedRecord(record))
        .filter((record): record is PinnedMeasurementRecord => record !== null)
    : []

  return {
    version: 1,
    distanceRecords,
    pinnedRecords,
  }
}

function buildPersistedMeasurementSnapshot(
  distanceRecords: DistanceMeasurementRecord[],
  pinnedRecords: PinnedMeasurementRecord[],
): PersistedMeasurementSnapshot {
  return {
    version: 1,
    distanceRecords,
    pinnedRecords,
  }
}

function getMeasurementSnapshotKey(snapshot: PersistedMeasurementSnapshot) {
  return JSON.stringify(snapshot)
}

function createExportFilename(prefix: string, extension: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${prefix}_${stamp}.${extension}`
}

function escapeCsvField(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function buildMeasurementCsv(rows: MeasurementExportRow[]) {
  const header = ['scope', 'category', 'label', 'value', 'details', 'approximate']
  const lines = rows.map((row) =>
    [row.scope, row.category, row.label, row.value, row.details, row.approximate ? 'yes' : 'no']
      .map((value) => escapeCsvField(value))
      .join(','),
  )

  return [header.join(','), ...lines].join('\n')
}

function projectLabelToCanvas(
  position: Vec3,
  camera: Parameters<Vector3['project']>[0],
  width: number,
  height: number,
) {
  const projected = new Vector3(...position).project(camera)
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z > 1) {
    return null
  }

  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
  }
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function drawMeasurementLabelOnCanvas(
  context: CanvasRenderingContext2D,
  label: MeasurementLabelEntry,
  x: number,
  y: number,
) {
  const primaryFont = 13
  const secondaryFont = 10
  const paddingX = 10
  const paddingY = 6
  const lineGap = label.secondary ? 4 : 0

  context.font = `700 ${primaryFont}px ui-monospace, SFMono-Regular, Menlo, monospace`
  const primaryWidth = context.measureText(label.primary).width
  let width = primaryWidth

  if (label.secondary) {
    context.font = `${secondaryFont}px ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif`
    width = Math.max(width, context.measureText(label.secondary).width)
  }

  const boxWidth = width + paddingX * 2
  const boxHeight = paddingY * 2 + primaryFont + (label.secondary ? lineGap + secondaryFont : 0)
  const left = x - boxWidth / 2
  const top = y - boxHeight / 2

  context.save()
  context.globalAlpha = label.opacity ?? 1
  drawRoundedRect(context, left, top, boxWidth, boxHeight, 10)
  context.fillStyle = 'rgba(255,255,255,0.86)'
  context.fill()
  context.strokeStyle = 'rgba(15,23,42,0.14)'
  context.lineWidth = 1
  context.stroke()

  context.font = `700 ${primaryFont}px ui-monospace, SFMono-Regular, Menlo, monospace`
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.fillStyle = label.color
  context.fillText(label.primary, x, top + paddingY)

  if (label.secondary) {
    context.font = `${secondaryFont}px ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif`
    context.fillStyle = 'rgba(71,85,105,0.92)'
    context.fillText(label.secondary, x, top + paddingY + primaryFont + lineGap)
  }

  context.restore()
}

function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!copiedKey) return

    const timer = window.setTimeout(() => setCopiedKey(null), 1600)
    return () => window.clearTimeout(timer)
  }, [copiedKey])

  const copyText = async (key: string, text: string) => {
    if (!(typeof navigator !== 'undefined' && navigator.clipboard?.writeText)) return
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
  }

  return { copiedKey, copyText }
}

function CopyButton({
  copied,
  disabled,
  onClick,
  size = 'default',
}: {
  copied: boolean
  disabled?: boolean
  onClick: () => void
  size?: 'default' | 'icon'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/70 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
        size === 'icon' ? 'h-7 w-7 shrink-0' : 'px-3 py-1.5',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {size === 'default' ? (copied ? '已复制' : '复制结果') : null}
    </button>
  )
}

function formatMetricSummaryText(
  metrics: Array<{
    label: string
    formattedValue: string
    rule?: {
      formattedTarget: string
      formattedDelta: string
      status: 'pass' | 'fail'
    }
  }>,
) {
  return metrics
    .map((metric) => {
      if (!metric.rule) return `${metric.label} ${metric.formattedValue}`

      const deltaLabel = metric.rule.status === 'fail' ? '差' : '余量'
      return `${metric.label} ${metric.formattedValue} (目标 ≥ ${metric.rule.formattedTarget}，${deltaLabel} ${metric.rule.formattedDelta})`
    })
    .join(' / ')
}

function formatSelectionSummaryText(summary: MeasurementSummary) {
  return `${summary.targetLabel} / ${summary.primaryLabel} ${summary.formattedValue} / ${formatMetricSummaryText(summary.metrics)}${summary.approximate ? ' / 近似值' : ''}`
}

function formatMetricSummaryCardText(summary: ClearanceSummary | AngleSummary | PerimeterSummary) {
  return `${summary.targetLabel} / ${summary.primaryLabel} ${summary.formattedValue} / ${formatMetricSummaryText(summary.metrics)}${summary.approximate ? ' / 近似值' : ''}`
}

function formatGridSummaryText(summary: GridSummary) {
  return `${summary.targetLabel} / ${summary.primaryLabel} ${summary.formattedValue} / ${formatMetricSummaryText(summary.metrics)}${summary.approximate ? ' / 近似值' : ''}`
}

function formatPathSummaryText(summary: PathMeasurementSummary) {
  return `${summary.targetLabel} / ${summary.primaryLabel} ${summary.formattedValue} / ${summary.segmentCount} 段${summary.approximate ? ' / 近似值' : ''}`
}

function formatDistanceRecordText(
  record: DistanceMeasurementRecord,
  unit: MeasurementUnit,
  formatOptions?: MeasurementFormatOptions,
) {
  if ('points' in record) {
    return `路径测距 / ${formatLength(record.length, unit, formatOptions)} / ${record.segmentCount} 段${record.approximate ? ' / 近似值' : ''}`
  }

  const stats = getSegmentStats(record.start, record.end)
  return `${DISTANCE_MODE_LABELS[record.mode]} / ${formatLength(stats.length, unit, formatOptions)} / ${getDistanceSecondary(record.mode, stats, unit, formatOptions)}`
}

function MeasurementBar({
  start,
  end,
  color,
  opacity = 0.96,
  thickness = BAR_THICKNESS,
}: {
  start: Vec3
  end: Vec3
  color: string
  opacity?: number
  thickness?: number
}) {
  const segment = useMemo(() => getMeasurementSegment(start, end), [end, start])

  if (!segment) return null

  return (
    <mesh
      position={[segment.position.x, segment.position.y, segment.position.z]}
      quaternion={segment.quaternion}
      raycast={() => {}}
      renderOrder={1000}
    >
      <boxGeometry args={[thickness, segment.length, thickness]} />
      <meshBasicMaterial
        color={color}
        depthTest={false}
        depthWrite={false}
        opacity={opacity}
        toneMapped={false}
        transparent
      />
    </mesh>
  )
}

function MeasurementHitArea({
  start,
  end,
  onPointerDown,
}: {
  start: Vec3
  end: Vec3
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void
}) {
  const segment = useMemo(() => getMeasurementSegment(start, end), [end, start])

  if (!segment) return null

  return (
    <mesh
      onPointerDown={onPointerDown}
      position={[segment.position.x, segment.position.y, segment.position.z]}
      quaternion={segment.quaternion}
      renderOrder={1001}
    >
      <boxGeometry args={[0.18, segment.length, 0.18]} />
      <meshBasicMaterial
        depthTest={false}
        depthWrite={false}
        opacity={0}
        toneMapped={false}
        transparent
      />
    </mesh>
  )
}

function MeasurementPoint({
  position,
  color,
  opacity = 1,
}: {
  position: Vec3
  color: string
  opacity?: number
}) {
  return (
    <mesh position={position} raycast={() => {}} renderOrder={1000}>
      <sphereGeometry args={[POINT_RADIUS, 16, 16]} />
      <meshBasicMaterial
        color={color}
        depthTest={false}
        depthWrite={false}
        opacity={opacity}
        toneMapped={false}
        transparent={opacity < 0.999}
      />
    </mesh>
  )
}

function MeasurementLabel({
  position,
  primary,
  secondary,
  color,
  shadowColor,
  opacity = 1,
}: {
  position: Vec3
  primary: string
  secondary?: string
  color: string
  shadowColor: string
  opacity?: number
}) {
  return (
    <Html
      center
      position={position}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
      zIndexRange={[30, 0]}
    >
      <div
        className="rounded-lg bg-background/80 px-2.5 py-1.5 text-center shadow-lg backdrop-blur-sm"
        style={{ opacity }}
      >
        <div
          className="whitespace-nowrap font-bold font-mono text-[13px]"
          style={{
            color,
            textShadow: `0 0 4px ${shadowColor}`,
          }}
        >
          {primary}
        </div>
        {secondary ? (
          <div className="mt-0.5 text-[10px] text-muted-foreground">{secondary}</div>
        ) : null}
      </div>
    </Html>
  )
}

function LinearMeasurementGuide({
  start,
  end,
  referenceStart,
  referenceEnd,
  referenceLabel,
  label,
  value,
  color,
  shadowColor,
  active = true,
  locked = false,
  labelLift = LABEL_LIFT,
  onToggleLock,
}: {
  start: Vec3
  end: Vec3
  referenceStart?: Vec3
  referenceEnd?: Vec3
  referenceLabel?: string
  label: string
  value: string
  color: string
  shadowColor: string
  active?: boolean
  locked?: boolean
  labelLift?: number
  onToggleLock?: () => void
}) {
  const labelPosition: Vec3 = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2 + labelLift,
    (start[2] + end[2]) / 2,
  ]
  const secondaryLabel = `${label}${referenceLabel ? ` · ${referenceLabel}` : ''}${locked ? ' · 已锁定' : ''}`

  return (
    <group>
      {onToggleLock ? (
        <MeasurementHitArea
          end={end}
          onPointerDown={(event) => {
            event.stopPropagation()
            onToggleLock()
          }}
          start={start}
        />
      ) : null}
      {referenceStart && referenceEnd ? (
        <MeasurementBar
          color={color}
          end={referenceEnd}
          opacity={locked ? 0.48 : active ? 0.34 : 0.12}
          start={referenceStart}
          thickness={BAR_THICKNESS * 1.5}
        />
      ) : null}
      <MeasurementBar
        color={color}
        end={end}
        opacity={locked ? 1 : active ? 0.88 : 0.2}
        start={start}
        thickness={locked ? BAR_THICKNESS * 1.35 : BAR_THICKNESS}
      />
      <MeasurementPoint color={color} opacity={locked ? 1 : active ? 1 : 0.24} position={start} />
      <MeasurementPoint color={color} opacity={locked ? 1 : active ? 1 : 0.24} position={end} />
      <MeasurementLabel
        color={color}
        opacity={locked ? 1 : active ? 1 : 0.32}
        position={labelPosition}
        primary={value}
        secondary={secondaryLabel}
        shadowColor={shadowColor}
      />
    </group>
  )
}

function useMeasurementSceneData() {
  const measurementMode = useEditor((state) => state.measurementMode)
  const selection = useViewer((state) => state.selection)
  const unit = useViewer((state) => state.unit)
  const theme = useViewer((state) => state.theme)
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const distanceRecords = useMeasurementModeStore((state) => state.distanceRecords)
  const pinnedRecords = useMeasurementModeStore((state) => state.pinnedRecords)
  const draftStart = useMeasurementModeStore((state) => state.draftStart)
  const draftStartSnapLabel = useMeasurementModeStore((state) => state.draftStartSnapLabel)
  const previewPoint = useMeasurementModeStore((state) => state.previewPoint)
  const previewSnapLabel = useMeasurementModeStore((state) => state.previewSnapLabel)
  const distanceMode = useMeasurementModeStore((state) => state.distanceMode)
  const precision = useMeasurementModeStore((state) => state.precision)
  const hoveredPerimeterGuideId = useMeasurementModeStore((state) => state.hoveredPerimeterGuideId)
  const lockedPerimeterGuideId = useMeasurementModeStore((state) => state.lockedPerimeterGuideId)
  const perimeterVisibility = useMeasurementModeStore((state) => state.perimeterVisibility)
  const toggleLockedPerimeterGuideId = useMeasurementModeStore(
    (state) => state.toggleLockedPerimeterGuideId,
  )

  const color = theme === 'dark' ? '#f8fafc' : '#111827'
  const shadowColor = theme === 'dark' ? '#0f172a' : '#ffffff'
  const previewColor = '#2563eb'
  const formatOptions = useMemo<MeasurementFormatOptions>(() => ({ precision }), [precision])
  const currentPathSummary = useMemo(() => {
    if (measurementMode !== 'distance' || distanceMode !== 'path') return null
    return getPathMeasurementSummaryForSelection(selection.selectedIds, nodes, unit, formatOptions)
  }, [distanceMode, formatOptions, measurementMode, nodes, selection.selectedIds, unit])
  const currentAngleComparisonSummary = useMemo(() => {
    if (measurementMode !== 'angle') return null
    return getAngleComparisonSummaryForSelection(selection.selectedIds, nodes, formatOptions)
  }, [formatOptions, measurementMode, nodes, selection.selectedIds])
  const currentGridSummary = useMemo(() => {
    if (measurementMode !== 'grid') return null
    return getGridMeasurementSummaryForSelection(selection.selectedIds, nodes, unit, formatOptions)
  }, [formatOptions, measurementMode, nodes, selection.selectedIds, unit])
  const currentGridGuides = useMemo(() => {
    if (measurementMode !== 'grid') return []
    return getGridMeasurementGuidesForSelection(selection.selectedIds, nodes, unit, formatOptions)
  }, [formatOptions, measurementMode, nodes, selection.selectedIds, unit])
  const normalizedCurrentGridIds = useMemo(
    () => Array.from(new Set(selection.selectedIds)).sort(),
    [selection.selectedIds],
  )
  const currentPerimeterTarget = useMemo(
    () => getNodeMeasurementSelectionTarget(nodes, selection),
    [nodes, selection],
  )
  const currentPerimeterSummary = useMemo(() => {
    if (measurementMode !== 'perimeter' || !currentPerimeterTarget.node) return null
    return getPerimeterSummaryForNode(currentPerimeterTarget.node, nodes, unit, formatOptions)
  }, [currentPerimeterTarget.node, formatOptions, measurementMode, nodes, unit])
  const currentPerimeterGuides = useMemo(() => {
    if (measurementMode !== 'perimeter' || !currentPerimeterTarget.node) return []
    return getPerimeterGuidesForNode(currentPerimeterTarget.node, nodes, unit, formatOptions)
  }, [currentPerimeterTarget.node, formatOptions, measurementMode, nodes, unit])
  const visiblePerimeterGuides = useMemo(
    () =>
      currentPerimeterGuides.filter((guide) => {
        if (guide.id === 'span') return perimeterVisibility.span
        if (guide.id === 'depth') return perimeterVisibility.depth
        return perimeterVisibility.setbacks
      }),
    [currentPerimeterGuides, perimeterVisibility],
  )
  const activePerimeterGuideId = lockedPerimeterGuideId ?? hoveredPerimeterGuideId
  const perimeterGuideLabelLifts = useMemo(
    () => getPerimeterGuideLabelLifts(visiblePerimeterGuides),
    [visiblePerimeterGuides],
  )
  const gridGuideLabelLifts = useMemo(
    () => getGridGuideLabelLifts(currentGridGuides),
    [currentGridGuides],
  )
  const isCurrentPerimeterPinned = useMemo(
    () =>
      currentPerimeterTarget.node
        ? pinnedRecords.some(
            (record) =>
              record.kind === 'perimeter' &&
              'nodeId' in record &&
              record.nodeId === currentPerimeterTarget.node?.id,
          )
        : false,
    [currentPerimeterTarget.node, pinnedRecords],
  )
  const isCurrentGridPinned = useMemo(
    () =>
      normalizedCurrentGridIds.length >= 2 &&
      pinnedRecords.some(
        (record) =>
          record.kind === 'grid' &&
          record.nodeIds.length === normalizedCurrentGridIds.length &&
          record.nodeIds.every((nodeId, index) => nodeId === normalizedCurrentGridIds[index]),
      ),
    [normalizedCurrentGridIds, pinnedRecords],
  )

  const pinnedSummaries = useMemo(
    () =>
      pinnedRecords.flatMap((record) => {
        if (
          record.kind === 'clearance' ||
          record.kind === 'angle' ||
          record.kind === 'perimeter' ||
          record.kind === 'grid'
        )
          return []

        const node = nodes[record.nodeId]
        if (!node) return []

        const summary = getMeasurementSummaryForNode(node, record.kind, nodes, unit, formatOptions)
        if (!summary) return []

        return [{ record, summary }]
      }),
    [formatOptions, nodes, pinnedRecords, unit],
  )

  const pinnedClearanceSummaries = useMemo(
    () =>
      pinnedRecords.flatMap((record) => {
        if (record.kind !== 'clearance') return []

        const node = nodes[record.nodeId]
        if (!node) return []

        const summary = getClearanceSummaryForNode(node, nodes, unit, formatOptions)
        if (!summary) return []

        return [{ record, summary }]
      }),
    [formatOptions, nodes, pinnedRecords, unit],
  )

  const pinnedAngleSummaries = useMemo(
    () =>
      pinnedRecords.flatMap((record) => {
        if (record.kind !== 'angle') return []

        const node = nodes[record.nodeId]
        if (!node) return []

        const summary = getAngleSummaryForNode(node, nodes, formatOptions)
        if (!summary) return []

        return [{ record, summary }]
      }),
    [formatOptions, nodes, pinnedRecords],
  )

  const pinnedPerimeterSummaries = useMemo(
    () =>
      pinnedRecords.flatMap((record) => {
        if (record.kind !== 'perimeter') return []

        const node = nodes[record.nodeId]
        if (!node) return []

        const summary = getPerimeterSummaryForNode(node, nodes, unit, formatOptions)
        if (!summary) return []

        return [{ record, summary }]
      }),
    [formatOptions, nodes, pinnedRecords, unit],
  )
  const pinnedGridSummaries = useMemo(
    () =>
      pinnedRecords.flatMap((record) => {
        if (record.kind !== 'grid') return []

        const summary = getGridMeasurementSummaryForSelection(
          record.nodeIds,
          nodes,
          unit,
          formatOptions,
        )
        if (!summary) return []

        const guides = getGridMeasurementGuidesForSelection(
          record.nodeIds,
          nodes,
          unit,
          formatOptions,
        )
        return [
          {
            record,
            summary,
            guides,
            guideLabelLifts: getGridGuideLabelLifts(guides),
          },
        ]
      }),
    [formatOptions, nodes, pinnedRecords, unit],
  )

  return {
    measurementMode,
    unit,
    precision,
    formatOptions,
    color,
    shadowColor,
    previewColor,
    distanceMode,
    distanceRecords,
    pinnedRecords,
    draftStart,
    draftStartSnapLabel,
    previewPoint,
    previewSnapLabel,
    lockedPerimeterGuideId,
    perimeterVisibility,
    currentPathSummary,
    currentAngleComparisonSummary,
    currentGridSummary,
    currentGridGuides,
    currentPerimeterSummary,
    visiblePerimeterGuides,
    activePerimeterGuideId,
    perimeterGuideLabelLifts,
    gridGuideLabelLifts,
    isCurrentGridPinned,
    isCurrentPerimeterPinned,
    pinnedSummaries,
    pinnedClearanceSummaries,
    pinnedAngleSummaries,
    pinnedPerimeterSummaries,
    pinnedGridSummaries,
  }
}

function buildMeasurementExportRows(sceneData: ReturnType<typeof useMeasurementSceneData>) {
  const rows: MeasurementExportRow[] = []

  for (const record of sceneData.distanceRecords) {
    if ('points' in record) {
      rows.push({
        scope: 'saved',
        category: 'distance',
        label: '路径测距',
        value: formatLength(record.length, sceneData.unit, sceneData.formatOptions),
        details: getPathRecordSecondary(record.segmentCount, record.approximate),
        approximate: record.approximate,
      })
      continue
    }

    const stats = getSegmentStats(record.start, record.end)
    rows.push({
      scope: 'saved',
      category: 'distance',
      label: DISTANCE_MODE_LABELS[record.mode],
      value: formatLength(stats.length, sceneData.unit, sceneData.formatOptions),
      details: getDistanceSecondary(record.mode, stats, sceneData.unit, sceneData.formatOptions),
      approximate: false,
    })
  }

  for (const { summary } of sceneData.pinnedSummaries) {
    rows.push({
      scope: 'saved',
      category: summary.kind,
      label: `${summary.targetLabel} · ${summary.primaryLabel}`,
      value: summary.formattedValue,
      details: formatMetricSummaryText(summary.metrics),
      approximate: summary.approximate,
    })
  }

  for (const { summary } of sceneData.pinnedClearanceSummaries) {
    rows.push({
      scope: 'saved',
      category: 'clearance',
      label: `${summary.targetLabel} · ${summary.primaryLabel}`,
      value: summary.formattedValue,
      details: formatMetricSummaryText(summary.metrics),
      approximate: summary.approximate,
    })
  }

  for (const { summary } of sceneData.pinnedAngleSummaries) {
    rows.push({
      scope: 'saved',
      category: 'angle',
      label: `${summary.targetLabel} · ${summary.primaryLabel}`,
      value: summary.formattedValue,
      details: formatMetricSummaryText(summary.metrics),
      approximate: summary.approximate,
    })
  }

  for (const { summary } of sceneData.pinnedPerimeterSummaries) {
    rows.push({
      scope: 'saved',
      category: 'perimeter',
      label: `${summary.targetLabel} · ${summary.primaryLabel}`,
      value: summary.formattedValue,
      details: formatMetricSummaryText(summary.metrics),
      approximate: summary.approximate,
    })
  }

  for (const { summary } of sceneData.pinnedGridSummaries) {
    rows.push({
      scope: 'saved',
      category: 'grid',
      label: `${summary.targetLabel} · ${summary.primaryLabel}`,
      value: summary.formattedValue,
      details: formatMetricSummaryText(summary.metrics),
      approximate: summary.approximate,
    })
  }

  if (sceneData.currentPathSummary) {
    rows.push({
      scope: 'current',
      category: 'distance',
      label: sceneData.currentPathSummary.targetLabel,
      value: sceneData.currentPathSummary.formattedValue,
      details: sceneData.currentPathSummary.description,
      approximate: sceneData.currentPathSummary.approximate,
    })
  }

  if (sceneData.measurementMode === 'distance' && sceneData.draftStart && sceneData.previewPoint) {
    const stats = getSegmentStats(sceneData.draftStart, sceneData.previewPoint)
    const snapSummary = getDistanceSnapSummary(
      sceneData.draftStartSnapLabel,
      sceneData.previewSnapLabel,
    )
    rows.push({
      scope: 'current',
      category: 'distance',
      label: DISTANCE_MODE_LABELS[sceneData.distanceMode],
      value: formatLength(stats.length, sceneData.unit, sceneData.formatOptions),
      details: `${getDistanceSecondary(sceneData.distanceMode, stats, sceneData.unit, sceneData.formatOptions)}${snapSummary ? ` · ${snapSummary}` : ''}`,
      approximate: false,
    })
  }

  if (sceneData.currentAngleComparisonSummary) {
    rows.push({
      scope: 'current',
      category: 'angle',
      label: sceneData.currentAngleComparisonSummary.targetLabel,
      value: sceneData.currentAngleComparisonSummary.formattedValue,
      details: formatMetricSummaryText(sceneData.currentAngleComparisonSummary.metrics),
      approximate: sceneData.currentAngleComparisonSummary.approximate,
    })
  }

  if (sceneData.currentGridSummary && !sceneData.isCurrentGridPinned) {
    rows.push({
      scope: 'current',
      category: 'grid',
      label: `${sceneData.currentGridSummary.targetLabel} · ${sceneData.currentGridSummary.primaryLabel}`,
      value: sceneData.currentGridSummary.formattedValue,
      details: formatMetricSummaryText(sceneData.currentGridSummary.metrics),
      approximate: sceneData.currentGridSummary.approximate,
    })
  }

  if (sceneData.currentPerimeterSummary && !sceneData.isCurrentPerimeterPinned) {
    rows.push({
      scope: 'current',
      category: 'perimeter',
      label: `${sceneData.currentPerimeterSummary.targetLabel} · ${sceneData.currentPerimeterSummary.primaryLabel}`,
      value: sceneData.currentPerimeterSummary.formattedValue,
      details: formatMetricSummaryText(sceneData.currentPerimeterSummary.metrics),
      approximate: sceneData.currentPerimeterSummary.approximate,
    })
  }

  return rows
}

function buildMeasurementLabelEntries(sceneData: ReturnType<typeof useMeasurementSceneData>) {
  const labels: MeasurementLabelEntry[] = []

  for (const record of sceneData.distanceRecords) {
    if ('points' in record) {
      labels.push({
        position: record.anchor,
        primary: formatLength(record.length, sceneData.unit, sceneData.formatOptions),
        secondary: getPathRecordSecondary(record.segmentCount, record.approximate),
        color: sceneData.color,
      })
      continue
    }

    const stats = getSegmentStats(record.start, record.end)
    labels.push({
      position: [
        (record.start[0] + record.end[0]) / 2,
        (record.start[1] + record.end[1]) / 2 + LABEL_LIFT,
        (record.start[2] + record.end[2]) / 2,
      ],
      primary: formatLength(stats.length, sceneData.unit, sceneData.formatOptions),
      secondary: `${DISTANCE_MODE_LABELS[record.mode]} · ${getDistanceSecondary(record.mode, stats, sceneData.unit, sceneData.formatOptions)}`,
      color: sceneData.color,
    })
  }

  if (sceneData.measurementMode === 'distance' && sceneData.currentPathSummary) {
    labels.push({
      position: sceneData.currentPathSummary.anchor,
      primary: sceneData.currentPathSummary.formattedValue,
      secondary: getPathRecordSecondary(
        sceneData.currentPathSummary.segmentCount,
        sceneData.currentPathSummary.approximate,
      ),
      color: sceneData.previewColor,
      opacity: 0.9,
    })
  }

  if (sceneData.measurementMode === 'distance' && sceneData.draftStart && sceneData.previewPoint) {
    const stats = getSegmentStats(sceneData.draftStart, sceneData.previewPoint)
    const snapSummary = getDistanceSnapSummary(
      sceneData.draftStartSnapLabel,
      sceneData.previewSnapLabel,
    )
    labels.push({
      position: [
        (sceneData.draftStart[0] + sceneData.previewPoint[0]) / 2,
        (sceneData.draftStart[1] + sceneData.previewPoint[1]) / 2 + LABEL_LIFT,
        (sceneData.draftStart[2] + sceneData.previewPoint[2]) / 2,
      ],
      primary: formatLength(stats.length, sceneData.unit, sceneData.formatOptions),
      secondary: `${DISTANCE_MODE_LABELS[sceneData.distanceMode]} · ${getDistanceSecondary(sceneData.distanceMode, stats, sceneData.unit, sceneData.formatOptions)}${snapSummary ? ` · ${snapSummary}` : ''}`,
      color: sceneData.previewColor,
      opacity: 0.9,
    })
  }

  for (const { summary } of sceneData.pinnedSummaries) {
    labels.push({
      position: summary.anchor,
      primary: summary.formattedValue,
      secondary: `${summary.targetLabel} · ${summary.primaryLabel}`,
      color: summary.kind === 'volume' ? '#b45309' : '#0f766e',
      opacity: 0.72,
    })
  }

  for (const { summary } of sceneData.pinnedClearanceSummaries) {
    labels.push({
      position: summary.anchor,
      primary: summary.formattedValue,
      secondary: `${summary.targetLabel} · ${summary.primaryLabel}`,
      color: '#2563eb',
      opacity: 0.72,
    })
  }

  for (const { summary } of sceneData.pinnedAngleSummaries) {
    labels.push({
      position: summary.anchor,
      primary: summary.formattedValue,
      secondary: `${summary.targetLabel} · ${summary.primaryLabel}`,
      color: '#b91c1c',
      opacity: 0.72,
    })
  }

  if (sceneData.measurementMode === 'angle' && sceneData.currentAngleComparisonSummary) {
    labels.push({
      position: sceneData.currentAngleComparisonSummary.anchor,
      primary: sceneData.currentAngleComparisonSummary.formattedValue,
      secondary: `${sceneData.currentAngleComparisonSummary.targetLabel} · ${sceneData.currentAngleComparisonSummary.primaryLabel}`,
      color: '#b91c1c',
    })
  }

  if (
    sceneData.measurementMode === 'grid' &&
    sceneData.currentGridSummary &&
    !sceneData.isCurrentGridPinned
  ) {
    labels.push({
      position: sceneData.currentGridSummary.anchor,
      primary: sceneData.currentGridSummary.formattedValue,
      secondary: `${sceneData.currentGridSummary.targetLabel} · ${sceneData.currentGridSummary.primaryLabel}`,
      color: '#0f766e',
    })
  }

  for (const { summary, guides, guideLabelLifts } of sceneData.pinnedGridSummaries) {
    labels.push({
      position: summary.anchor,
      primary: summary.formattedValue,
      secondary: `${summary.targetLabel} · ${summary.primaryLabel}`,
      color: '#0f766e',
      opacity: 0.72,
    })

    for (const guide of guides) {
      labels.push({
        position: [
          (guide.start[0] + guide.end[0]) / 2,
          (guide.start[1] + guide.end[1]) / 2 + (guideLabelLifts[guide.id] ?? LABEL_LIFT),
          (guide.start[2] + guide.end[2]) / 2,
        ],
        primary: guide.formattedValue,
        secondary: `${guide.label}${guide.approximate ? ' · 近似值' : ''}`,
        color: guide.kind === 'total' ? '#c2410c' : '#0f766e',
        opacity: 0.64,
      })
    }
  }

  if (sceneData.measurementMode === 'grid' && !sceneData.isCurrentGridPinned) {
    for (const guide of sceneData.currentGridGuides) {
      labels.push({
        position: [
          (guide.start[0] + guide.end[0]) / 2,
          (guide.start[1] + guide.end[1]) / 2 +
            (sceneData.gridGuideLabelLifts[guide.id] ?? LABEL_LIFT),
          (guide.start[2] + guide.end[2]) / 2,
        ],
        primary: guide.formattedValue,
        secondary: `${guide.label}${guide.approximate ? ' · 近似值' : ''}`,
        color: guide.kind === 'total' ? '#c2410c' : '#0f766e',
      })
    }
  }

  for (const { summary } of sceneData.pinnedPerimeterSummaries) {
    labels.push({
      position: summary.anchor,
      primary: summary.formattedValue,
      secondary: `${summary.targetLabel} · ${summary.primaryLabel}`,
      color: '#7c2d12',
      opacity: 0.68,
    })
  }

  if (
    sceneData.measurementMode === 'perimeter' &&
    sceneData.currentPerimeterSummary &&
    !sceneData.isCurrentPerimeterPinned
  ) {
    labels.push({
      position: sceneData.currentPerimeterSummary.anchor,
      primary: sceneData.currentPerimeterSummary.formattedValue,
      secondary: `${sceneData.currentPerimeterSummary.targetLabel} · ${sceneData.currentPerimeterSummary.primaryLabel}`,
      color: '#9a3412',
    })
  }

  if (sceneData.measurementMode === 'perimeter') {
    for (const guide of sceneData.visiblePerimeterGuides) {
      const guideColor =
        guide.id === 'span'
          ? '#c2410c'
          : guide.id === 'depth'
            ? '#0f766e'
            : guide.id === 'front-setback'
              ? '#ea580c'
              : guide.id === 'back-setback'
                ? '#0284c7'
                : guide.id === 'left-setback'
                  ? '#7c3aed'
                  : '#16a34a'
      const active = sceneData.activePerimeterGuideId
        ? sceneData.activePerimeterGuideId === guide.id
        : true
      const secondary = `${guide.label}${guide.referenceLabel ? ` · ${guide.referenceLabel}` : ''}`

      labels.push({
        position: [
          (guide.start[0] + guide.end[0]) / 2,
          (guide.start[1] + guide.end[1]) / 2 +
            (sceneData.perimeterGuideLabelLifts[guide.id] ?? LABEL_LIFT),
          (guide.start[2] + guide.end[2]) / 2,
        ],
        primary: guide.formattedValue,
        secondary,
        color: guideColor,
        opacity: active ? 1 : 0.32,
      })
    }
  }

  return labels
}

function MeasurementScene() {
  const sceneData = useMeasurementSceneData()
  const toggleLockedPerimeterGuideId = useMeasurementModeStore(
    (state) => state.toggleLockedPerimeterGuideId,
  )
  const currentPathSummary = sceneData.currentPathSummary

  if (!sceneData.measurementMode) return null

  return (
    <group>
      {sceneData.distanceRecords.map((record) => {
        if ('points' in record) {
          return (
            <group key={record.id}>
              {record.points.slice(1).map((point, index) => (
                <MeasurementBar
                  color={sceneData.color}
                  end={point}
                  key={`${record.id}:${index}`}
                  start={record.points[index]!}
                />
              ))}
              <MeasurementPoint color={sceneData.color} position={record.points[0]!} />
              <MeasurementPoint
                color={sceneData.color}
                position={record.points[record.points.length - 1]!}
              />
              <MeasurementLabel
                color={sceneData.color}
                position={record.anchor}
                primary={formatLength(record.length, sceneData.unit, sceneData.formatOptions)}
                secondary={getPathRecordSecondary(record.segmentCount, record.approximate)}
                shadowColor={sceneData.shadowColor}
              />
            </group>
          )
        }

        const stats = getSegmentStats(record.start, record.end)
        const labelPosition: Vec3 = [
          (record.start[0] + record.end[0]) / 2,
          (record.start[1] + record.end[1]) / 2 + LABEL_LIFT,
          (record.start[2] + record.end[2]) / 2,
        ]

        return (
          <group key={record.id}>
            <MeasurementBar color={sceneData.color} end={record.end} start={record.start} />
            <MeasurementPoint color={sceneData.color} position={record.start} />
            <MeasurementPoint color={sceneData.color} position={record.end} />
            <MeasurementLabel
              color={sceneData.color}
              position={labelPosition}
              primary={formatLength(stats.length, sceneData.unit, sceneData.formatOptions)}
              secondary={`${DISTANCE_MODE_LABELS[record.mode]} · ${getDistanceSecondary(record.mode, stats, sceneData.unit, sceneData.formatOptions)}`}
              shadowColor={sceneData.shadowColor}
            />
          </group>
        )
      })}

      {(() => {
        if (
          sceneData.measurementMode !== 'distance' ||
          sceneData.distanceMode !== 'path' ||
          !currentPathSummary
        ) {
          return null
        }

        return (
          <group>
            {currentPathSummary.points.slice(1).map((point, index) => (
              <MeasurementBar
                color={sceneData.previewColor}
                end={point}
                key={`current-path:${index}`}
                opacity={0.78}
                start={currentPathSummary.points[index]!}
              />
            ))}
            <MeasurementPoint
              color={sceneData.previewColor}
              position={currentPathSummary.points[0]!}
            />
            <MeasurementPoint
              color={sceneData.previewColor}
              position={currentPathSummary.points[currentPathSummary.points.length - 1]!}
            />
            <MeasurementLabel
              color={sceneData.previewColor}
              position={currentPathSummary.anchor}
              primary={currentPathSummary.formattedValue}
              secondary={getPathRecordSecondary(
                currentPathSummary.segmentCount,
                currentPathSummary.approximate,
              )}
              shadowColor={sceneData.shadowColor}
            />
          </group>
        )
      })()}

      {sceneData.draftStart && sceneData.previewPoint ? (
        <group>
          <MeasurementBar
            color={sceneData.previewColor}
            end={sceneData.previewPoint}
            opacity={0.7}
            start={sceneData.draftStart}
          />
          <MeasurementPoint color={sceneData.previewColor} position={sceneData.draftStart} />
          <MeasurementPoint color={sceneData.previewColor} position={sceneData.previewPoint} />
          <MeasurementLabel
            color={sceneData.previewColor}
            position={[
              (sceneData.draftStart[0] + sceneData.previewPoint[0]) / 2,
              (sceneData.draftStart[1] + sceneData.previewPoint[1]) / 2 + LABEL_LIFT,
              (sceneData.draftStart[2] + sceneData.previewPoint[2]) / 2,
            ]}
            primary={formatLength(
              getSegmentStats(sceneData.draftStart, sceneData.previewPoint).length,
              sceneData.unit,
              sceneData.formatOptions,
            )}
            secondary={`${DISTANCE_MODE_LABELS[sceneData.distanceMode]} · ${getDistanceSecondary(sceneData.distanceMode, getSegmentStats(sceneData.draftStart, sceneData.previewPoint), sceneData.unit, sceneData.formatOptions)}`}
            shadowColor={sceneData.shadowColor}
          />
        </group>
      ) : null}

      {sceneData.pinnedSummaries.map(({ record, summary }) => (
        <MeasurementLabel
          color={record.kind === 'volume' ? '#b45309' : '#0f766e'}
          key={record.id}
          opacity={0.72}
          position={summary.anchor}
          primary={summary.formattedValue}
          secondary={`${summary.targetLabel} · ${summary.primaryLabel}`}
          shadowColor={sceneData.shadowColor}
        />
      ))}

      {sceneData.pinnedClearanceSummaries.map(({ record, summary }) => (
        <MeasurementLabel
          color="#2563eb"
          key={record.id}
          opacity={0.72}
          position={summary.anchor}
          primary={summary.formattedValue}
          secondary={`${summary.targetLabel} · ${summary.primaryLabel}`}
          shadowColor={sceneData.shadowColor}
        />
      ))}

      {sceneData.pinnedAngleSummaries.map(({ record, summary }) => (
        <MeasurementLabel
          color="#b91c1c"
          key={record.id}
          opacity={0.72}
          position={summary.anchor}
          primary={summary.formattedValue}
          secondary={`${summary.targetLabel} · ${summary.primaryLabel}`}
          shadowColor={sceneData.shadowColor}
        />
      ))}

      {sceneData.measurementMode === 'angle' && sceneData.currentAngleComparisonSummary ? (
        <MeasurementLabel
          color="#b91c1c"
          position={sceneData.currentAngleComparisonSummary.anchor}
          primary={sceneData.currentAngleComparisonSummary.formattedValue}
          secondary={`${sceneData.currentAngleComparisonSummary.targetLabel} · ${sceneData.currentAngleComparisonSummary.primaryLabel}`}
          shadowColor={sceneData.shadowColor}
        />
      ) : null}

      {sceneData.measurementMode === 'grid' &&
      sceneData.currentGridSummary &&
      !sceneData.isCurrentGridPinned ? (
        <MeasurementLabel
          color="#0f766e"
          position={sceneData.currentGridSummary.anchor}
          primary={sceneData.currentGridSummary.formattedValue}
          secondary={`${sceneData.currentGridSummary.targetLabel} · ${sceneData.currentGridSummary.primaryLabel}`}
          shadowColor={sceneData.shadowColor}
        />
      ) : null}

      {sceneData.pinnedGridSummaries.map(({ record, summary, guides, guideLabelLifts }) => (
        <group key={record.id}>
          <MeasurementLabel
            color="#0f766e"
            opacity={0.72}
            position={summary.anchor}
            primary={summary.formattedValue}
            secondary={`${summary.targetLabel} · ${summary.primaryLabel}`}
            shadowColor={sceneData.shadowColor}
          />
          {guides.map((guide) => (
            <LinearMeasurementGuide
              color={guide.kind === 'total' ? '#c2410c' : '#0f766e'}
              end={guide.end}
              key={`${record.id}:${guide.id}`}
              label={`${guide.label}${guide.approximate ? ' · 近似值' : ''}`}
              labelLift={guideLabelLifts[guide.id] ?? LABEL_LIFT}
              shadowColor={sceneData.shadowColor}
              start={guide.start}
              value={guide.formattedValue}
            />
          ))}
        </group>
      ))}

      {sceneData.measurementMode === 'grid' && !sceneData.isCurrentGridPinned
        ? sceneData.currentGridGuides.map((guide) => (
            <LinearMeasurementGuide
              color={guide.kind === 'total' ? '#c2410c' : '#0f766e'}
              end={guide.end}
              key={guide.id}
              label={`${guide.label}${guide.approximate ? ' · 近似值' : ''}`}
              labelLift={sceneData.gridGuideLabelLifts[guide.id] ?? LABEL_LIFT}
              shadowColor={sceneData.shadowColor}
              start={guide.start}
              value={guide.formattedValue}
            />
          ))
        : null}

      {sceneData.pinnedPerimeterSummaries.map(({ record, summary }) => (
        <MeasurementLabel
          color="#7c2d12"
          key={record.id}
          opacity={0.68}
          position={summary.anchor}
          primary={summary.formattedValue}
          secondary={`${summary.targetLabel} · ${summary.primaryLabel}`}
          shadowColor={sceneData.shadowColor}
        />
      ))}

      {sceneData.measurementMode === 'perimeter' &&
      sceneData.currentPerimeterSummary &&
      !sceneData.isCurrentPerimeterPinned ? (
        <MeasurementLabel
          color="#9a3412"
          position={sceneData.currentPerimeterSummary.anchor}
          primary={sceneData.currentPerimeterSummary.formattedValue}
          secondary={`${sceneData.currentPerimeterSummary.targetLabel} · ${sceneData.currentPerimeterSummary.primaryLabel}`}
          shadowColor={sceneData.shadowColor}
        />
      ) : null}

      {sceneData.measurementMode === 'perimeter'
        ? sceneData.visiblePerimeterGuides.map((guide) => {
            const guideColor =
              guide.id === 'span'
                ? '#c2410c'
                : guide.id === 'depth'
                  ? '#0f766e'
                  : guide.id === 'front-setback'
                    ? '#ea580c'
                    : guide.id === 'back-setback'
                      ? '#0284c7'
                      : guide.id === 'left-setback'
                        ? '#7c3aed'
                        : '#16a34a'
            const active = sceneData.activePerimeterGuideId
              ? sceneData.activePerimeterGuideId === guide.id
              : true
            const locked = sceneData.lockedPerimeterGuideId === guide.id

            return (
              <LinearMeasurementGuide
                active={active}
                color={guideColor}
                end={guide.end}
                key={guide.id}
                label={`${guide.label}${guide.approximate ? ' · 近似值' : ''}`}
                labelLift={sceneData.perimeterGuideLabelLifts[guide.id] ?? LABEL_LIFT}
                locked={locked}
                onToggleLock={() => toggleLockedPerimeterGuideId(guide.id)}
                referenceLabel={guide.referenceLabel}
                referenceEnd={
                  sceneData.perimeterVisibility.baselines ? guide.referenceEnd : undefined
                }
                referenceStart={
                  sceneData.perimeterVisibility.baselines ? guide.referenceStart : undefined
                }
                shadowColor={sceneData.shadowColor}
                start={guide.start}
                value={guide.formattedValue}
              />
            )
          })
        : null}
    </group>
  )
}

function MeasurementPersistenceManager() {
  const rootNodeIds = useScene((state) => state.rootNodeIds as string[])
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const updateNode = useScene((state) => state.updateNode)
  const distanceRecords = useMeasurementModeStore((state) => state.distanceRecords)
  const pinnedRecords = useMeasurementModeStore((state) => state.pinnedRecords)
  const replaceStoredMeasurements = useMeasurementModeStore(
    (state) => state.replaceStoredMeasurements,
  )
  const activeSiteId = rootNodeIds[0] ?? null
  const activeSite =
    activeSiteId && nodes[activeSiteId]?.type === 'site' ? (nodes[activeSiteId] as SiteNode) : null
  const siteSnapshot = useMemo(() => readPersistedMeasurementSnapshot(activeSite), [activeSite])
  const siteSnapshotKey = useMemo(() => getMeasurementSnapshotKey(siteSnapshot), [siteSnapshot])
  const storeSnapshot = useMemo(
    () => buildPersistedMeasurementSnapshot(distanceRecords, pinnedRecords),
    [distanceRecords, pinnedRecords],
  )
  const storeSnapshotKey = useMemo(() => getMeasurementSnapshotKey(storeSnapshot), [storeSnapshot])
  const initializedRef = useRef(false)
  const activeSiteIdRef = useRef<string | null>(null)
  const lastSeenSiteSnapshotKeyRef = useRef('')

  useEffect(() => {
    if (activeSiteIdRef.current === activeSiteId) return
    activeSiteIdRef.current = activeSiteId
    initializedRef.current = false
    lastSeenSiteSnapshotKeyRef.current = ''
  }, [activeSiteId])

  useEffect(() => {
    if (!activeSite) return

    if (!initializedRef.current) {
      if (siteSnapshotKey !== storeSnapshotKey) {
        replaceStoredMeasurements(siteSnapshot.distanceRecords, siteSnapshot.pinnedRecords)
      }
      initializedRef.current = true
      lastSeenSiteSnapshotKeyRef.current = siteSnapshotKey
      return
    }

    if (
      siteSnapshotKey !== lastSeenSiteSnapshotKeyRef.current &&
      siteSnapshotKey !== storeSnapshotKey
    ) {
      replaceStoredMeasurements(siteSnapshot.distanceRecords, siteSnapshot.pinnedRecords)
    }

    lastSeenSiteSnapshotKeyRef.current = siteSnapshotKey
  }, [
    activeSite,
    replaceStoredMeasurements,
    siteSnapshot.distanceRecords,
    siteSnapshot.pinnedRecords,
    siteSnapshotKey,
    storeSnapshotKey,
  ])

  useEffect(() => {
    if (!activeSite || !initializedRef.current) return
    if (storeSnapshotKey === siteSnapshotKey) return

    const nextMetadata =
      typeof activeSite.metadata === 'object' &&
      activeSite.metadata !== null &&
      !Array.isArray(activeSite.metadata)
        ? { ...(activeSite.metadata as Record<string, unknown>) }
        : {}

    nextMetadata[MEASUREMENT_SITE_METADATA_KEY] = storeSnapshot
    updateNode(activeSite.id, { metadata: nextMetadata } as Partial<AnyNode>)
    lastSeenSiteSnapshotKeyRef.current = storeSnapshotKey
  }, [activeSite, siteSnapshotKey, storeSnapshot, storeSnapshotKey, updateNode])

  return null
}

function MeasurementScreenshotExportBridge() {
  const sceneData = useMeasurementSceneData()
  const screenshotExportNonce = useMeasurementModeStore((state) => state.screenshotExportNonce)
  const { camera, gl } = useThree()
  const handledNonceRef = useRef(0)

  useEffect(() => {
    if (screenshotExportNonce === 0 || handledNonceRef.current === screenshotExportNonce) return
    handledNonceRef.current = screenshotExportNonce

    const canvas = gl.domElement
    const labels = buildMeasurementLabelEntries(sceneData)
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height
    const context = exportCanvas.getContext('2d')
    if (!context) return

    context.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height)

    for (const label of labels) {
      const projected = projectLabelToCanvas(
        label.position,
        camera,
        exportCanvas.width,
        exportCanvas.height,
      )
      if (!projected) continue
      drawMeasurementLabelOnCanvas(context, label, projected.x, projected.y)
    }

    exportCanvas.toBlob((blob) => {
      if (!blob) return
      void saveBlobExport(
        blob,
        createExportFilename('measurement_screenshot', 'png'),
        exportFilters.png,
      )
    }, 'image/png')
  }, [camera, gl, sceneData, screenshotExportNonce])

  return null
}

export function MeasurementModeController() {
  const measurementMode = useEditor((state) => state.measurementMode)
  const activeLevelId = useViewer((state) => state.selection.levelId)
  const distanceMode = useMeasurementModeStore((state) => state.distanceMode)
  const { camera, gl, scene } = useThree()
  const setDraftStart = useMeasurementModeStore((state) => state.setDraftStart)
  const setPreviewPoint = useMeasurementModeStore((state) => state.setPreviewPoint)
  const addDistanceRecord = useMeasurementModeStore((state) => state.addDistanceRecord)
  const clearDraft = useMeasurementModeStore((state) => state.clearDraft)
  const distanceModeRef = useRef<DistanceMode>(useMeasurementModeStore.getState().distanceMode)
  const draftStartRef = useRef<Vec3 | null>(useMeasurementModeStore.getState().draftStart)
  const activeRef = useRef(measurementMode === 'distance')
  const levelIdRef = useRef(activeLevelId)
  const pendingMoveSampleRef = useRef<DistancePointerSample | null>(null)
  const pointerMoveFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const unsubscribe = useMeasurementModeStore.subscribe((state) => {
      draftStartRef.current = state.draftStart
      distanceModeRef.current = state.distanceMode
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    activeRef.current = measurementMode === 'distance' && distanceMode !== 'path'

    if (!activeRef.current) {
      clearDraft()
    }

    gl.domElement.style.cursor = activeRef.current ? 'crosshair' : ''

    return () => {
      if (activeRef.current) {
        gl.domElement.style.cursor = ''
      }
    }
  }, [clearDraft, distanceMode, gl, measurementMode])

  useEffect(() => {
    levelIdRef.current = activeLevelId
  }, [activeLevelId])

  useEffect(() => {
    raycaster.layers.set(0)
    raycaster.layers.enable(ZONE_LAYER)
    raycaster.layers.disable(EDITOR_LAYER)

    const flushPointerMove = () => {
      pointerMoveFrameRef.current = null

      if (!activeRef.current) return

      const sample = pendingMoveSampleRef.current
      pendingMoveSampleRef.current = null
      if (!sample) return

      const pickResult = pickDistanceMeasurementPoint(
        sample,
        camera,
        gl.domElement,
        scene,
        levelIdRef.current,
      )
      const draftStart = draftStartRef.current
      setPreviewPoint(
        pickResult && draftStart
          ? projectDistancePoint(distanceModeRef.current, draftStart, pickResult.point)
          : (pickResult?.point ?? null),
        pickResult?.snapLabel ?? null,
      )
    }

    const schedulePointerMove = () => {
      if (pointerMoveFrameRef.current !== null) return
      pointerMoveFrameRef.current = window.requestAnimationFrame(flushPointerMove)
    }

    const clearPendingPointerMove = () => {
      pendingMoveSampleRef.current = null
      if (pointerMoveFrameRef.current === null) return
      window.cancelAnimationFrame(pointerMoveFrameRef.current)
      pointerMoveFrameRef.current = null
    }

    const swallowClick = (event: MouseEvent) => {
      if (!activeRef.current) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const swallowPointerUp = (event: PointerEvent) => {
      if (!activeRef.current) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!activeRef.current) return
      pendingMoveSampleRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      }
      schedulePointerMove()
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!activeRef.current || event.button !== 0) return
      clearPendingPointerMove()

      const pickResult = pickDistanceMeasurementPoint(
        {
          clientX: event.clientX,
          clientY: event.clientY,
        },
        camera,
        gl.domElement,
        scene,
        levelIdRef.current,
      )
      if (!pickResult) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      const draftStart = draftStartRef.current
      if (draftStart) {
        addDistanceRecord(
          distanceModeRef.current,
          draftStart,
          projectDistancePoint(distanceModeRef.current, draftStart, pickResult.point),
        )
      } else {
        setDraftStart(pickResult.point, pickResult.snapLabel)
        setPreviewPoint(pickResult.point, pickResult.snapLabel)
      }
    }

    gl.domElement.addEventListener('pointermove', handlePointerMove, true)
    gl.domElement.addEventListener('pointerdown', handlePointerDown, true)
    gl.domElement.addEventListener('pointerup', swallowPointerUp, true)
    gl.domElement.addEventListener('click', swallowClick, true)

    return () => {
      clearPendingPointerMove()
      gl.domElement.removeEventListener('pointermove', handlePointerMove, true)
      gl.domElement.removeEventListener('pointerdown', handlePointerDown, true)
      gl.domElement.removeEventListener('pointerup', swallowPointerUp, true)
      gl.domElement.removeEventListener('click', swallowClick, true)
    }
  }, [addDistanceRecord, camera, gl, scene, setDraftStart, setPreviewPoint])

  return (
    <>
      <MeasurementPersistenceManager />
      <MeasurementScreenshotExportBridge />
      <MeasurementScene />
    </>
  )
}

function MeasurementModeTabs({
  activeMode,
  onChange,
}: {
  activeMode: MeasurementMode
  onChange: (mode: MeasurementMode) => void
}) {
  const tabs: Array<{ id: MeasurementMode; label: string; icon: typeof Ruler }> = [
    { id: 'distance', label: '距离', icon: Ruler },
    { id: 'area', label: '面积', icon: Square },
    { id: 'volume', label: '体积', icon: Box },
    { id: 'clearance', label: '净空', icon: ArrowUpDown },
    { id: 'angle', label: '角度', icon: DraftingCompass },
    { id: 'perimeter', label: '周长', icon: ArrowLeftRight },
    { id: 'grid', label: '轴网', icon: Grid3X3 },
  ]

  return (
    <div className="grid grid-cols-7 gap-1 rounded-xl bg-muted/60 p-1">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = activeMode === tab.id

        return (
          <button
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-lg font-medium text-xs transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function DistanceRecordList() {
  const selection = useViewer((state) => state.selection)
  const unit = useViewer((state) => state.unit)
  const precision = useMeasurementModeStore((state) => state.precision)
  const distanceMode = useMeasurementModeStore((state) => state.distanceMode)
  const distanceRecords = useMeasurementModeStore((state) => state.distanceRecords)
  const draftStart = useMeasurementModeStore((state) => state.draftStart)
  const draftStartSnapLabel = useMeasurementModeStore((state) => state.draftStartSnapLabel)
  const previewPoint = useMeasurementModeStore((state) => state.previewPoint)
  const previewSnapLabel = useMeasurementModeStore((state) => state.previewSnapLabel)
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const setDistanceMode = useMeasurementModeStore((state) => state.setDistanceMode)
  const addPathRecord = useMeasurementModeStore((state) => state.addPathRecord)
  const clearDraft = useMeasurementModeStore((state) => state.clearDraft)
  const clearDistanceRecords = useMeasurementModeStore((state) => state.clearDistanceRecords)
  const removeDistanceRecord = useMeasurementModeStore((state) => state.removeDistanceRecord)
  const { copiedKey, copyText } = useCopyFeedback()
  const formatOptions = useMemo<MeasurementFormatOptions>(() => ({ precision }), [precision])

  const draftStats = draftStart && previewPoint ? getSegmentStats(draftStart, previewPoint) : null
  const currentPathSummary = useMemo(
    () =>
      distanceMode === 'path'
        ? getPathMeasurementSummaryForSelection(selection.selectedIds, nodes, unit, formatOptions)
        : null,
    [distanceMode, formatOptions, nodes, selection.selectedIds, unit],
  )
  const draftSnapSummary = useMemo(() => {
    if (distanceMode === 'path') return null
    if (draftStart) {
      return getDistanceSnapSummary(draftStartSnapLabel, previewSnapLabel)
    }
    return previewSnapLabel ? `当前吸附 · ${previewSnapLabel}` : null
  }, [distanceMode, draftStart, draftStartSnapLabel, previewSnapLabel])

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
        <div className="mb-3 grid grid-cols-4 gap-2">
          {(Object.entries(DISTANCE_MODE_LABELS) as Array<[DistanceMode, string]>).map(
            ([mode, label]) => (
              <button
                className={cn(
                  'rounded-lg border px-2.5 py-2 text-left transition-colors',
                  distanceMode === mode
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border/70 bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                key={mode}
                onClick={() => setDistanceMode(mode)}
                type="button"
              >
                <div className="font-medium text-[11px]">{label}</div>
              </button>
            ),
          )}
        </div>
        <div className="font-medium text-sm">
          {distanceMode === 'path'
            ? currentPathSummary
              ? '当前已识别连续路径'
              : '先多选连续墙体或围栏'
            : draftStart
              ? '点击第二个点完成测距'
              : '点击第一个点开始测距'}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {DISTANCE_MODE_DESCRIPTIONS[distanceMode]}
        </div>
        {distanceMode !== 'path' ? (
          <div className="mt-2 text-[11px] text-muted-foreground">
            支持吸附到端点、中点、面中心、墙中心线和楼层基准面。
          </div>
        ) : null}

        {distanceMode === 'path' && currentPathSummary ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-background/80 px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground">
                {currentPathSummary.primaryLabel}
              </div>
              <div className="mt-1 font-semibold">{currentPathSummary.formattedValue}</div>
            </div>
            <div className="rounded-lg bg-background/80 px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground">路径说明</div>
              <div className="mt-1 text-[11px]">
                {currentPathSummary.targetLabel} · {currentPathSummary.segmentCount} 段
                {currentPathSummary.approximate ? ' · 近似值' : ''}
              </div>
            </div>
            <div className="col-span-2 rounded-lg bg-background/80 px-2.5 py-2 text-[11px] text-muted-foreground">
              {currentPathSummary.description}
            </div>
          </div>
        ) : null}

        {distanceMode === 'path' && !currentPathSummary ? (
          <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-3 text-[11px] text-muted-foreground">
            当前只支持沿连续墙体或围栏累计长度。请在 3D 中多选一条连续链路，分叉路径暂不支持。
          </div>
        ) : null}

        {distanceMode !== 'path' && draftStats ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-background/80 px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground">
                {DISTANCE_MODE_LABELS[distanceMode]}
              </div>
              <div className="mt-1 font-semibold">
                {formatLength(draftStats.length, unit, formatOptions)}
              </div>
            </div>
            <div className="rounded-lg bg-background/80 px-2.5 py-2">
              <div className="text-[10px] text-muted-foreground">空间分量</div>
              <div className="mt-1 text-[11px]">
                {getDistanceSecondary(distanceMode, draftStats, unit, formatOptions)}
              </div>
            </div>
            {draftSnapSummary ? (
              <div className="col-span-2 rounded-lg bg-background/80 px-2.5 py-2">
                <div className="text-[10px] text-muted-foreground">吸附点</div>
                <div className="mt-1 text-[11px]">{draftSnapSummary}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {distanceMode !== 'path' && !draftStats && draftSnapSummary ? (
          <div className="mt-3 rounded-lg bg-background/80 px-2.5 py-2 text-[11px]">
            <div className="text-[10px] text-muted-foreground">当前吸附</div>
            <div className="mt-1">{draftSnapSummary}</div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <CopyButton
          copied={copiedKey === 'distance:current'}
          disabled={distanceMode === 'path' ? !currentPathSummary : !draftStats}
          onClick={() => {
            if (distanceMode === 'path') {
              if (currentPathSummary) {
                void copyText('distance:current', formatPathSummaryText(currentPathSummary))
              }
              return
            }

            if (draftStats && draftStart && previewPoint) {
              const snapSummary = getDistanceSnapSummary(draftStartSnapLabel, previewSnapLabel)
              void copyText(
                'distance:current',
                `${DISTANCE_MODE_LABELS[distanceMode]} / ${formatLength(draftStats.length, unit, formatOptions)} / ${getDistanceSecondary(distanceMode, draftStats, unit, formatOptions)}${snapSummary ? ` / ${snapSummary}` : ''}`,
              )
            }
          }}
        />
        {distanceMode === 'path' ? (
          <button
            className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!currentPathSummary}
            onClick={() => {
              if (currentPathSummary) {
                addPathRecord(currentPathSummary)
              }
            }}
            type="button"
          >
            记录路径
          </button>
        ) : null}
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent"
          disabled={distanceMode === 'path' ? true : !draftStart}
          onClick={clearDraft}
          type="button"
        >
          清除草稿
        </button>
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent"
          disabled={distanceRecords.length === 0}
          onClick={clearDistanceRecords}
          type="button"
        >
          清空距离
        </button>
      </div>

      <div className="space-y-2">
        {distanceRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-muted-foreground text-xs">
            还没有距离记录
          </div>
        ) : (
          distanceRecords
            .slice()
            .reverse()
            .map((record) => {
              if ('points' in record) {
                return (
                  <div
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2.5"
                    key={record.id}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-sm">
                          {formatLength(record.length, unit, formatOptions)}
                        </div>
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                          路径测距
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {getPathRecordSecondary(record.segmentCount, record.approximate)}
                      </div>
                    </div>
                    <button
                      aria-label="复制路径记录"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() =>
                        void copyText(
                          record.id,
                          formatDistanceRecordText(record, unit, formatOptions),
                        )
                      }
                      type="button"
                    >
                      {copiedKey === record.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      aria-label="删除路径记录"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => removeDistanceRecord(record.id)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )
              }

              const stats = getSegmentStats(record.start, record.end)

              return (
                <div
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2.5"
                  key={record.id}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-sm">
                        {formatLength(stats.length, unit, formatOptions)}
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                        {DISTANCE_MODE_LABELS[record.mode]}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {getDistanceSecondary(record.mode, stats, unit, formatOptions)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label="复制距离记录"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() =>
                        void copyText(
                          record.id,
                          formatDistanceRecordText(record, unit, formatOptions),
                        )
                      }
                      type="button"
                    >
                      {copiedKey === record.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      aria-label="删除距离记录"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => removeDistanceRecord(record.id)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })
        )}
      </div>
    </div>
  )
}

function SelectionMeasurementPanel({
  mode,
}: {
  mode: Extract<MeasurementMode, 'area' | 'volume'>
}) {
  const selection = useViewer((state) => state.selection)
  const unit = useViewer((state) => state.unit)
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const formatOptions = useMeasurementFormatOptions()
  const pinnedRecords = useMeasurementModeStore((state) => state.pinnedRecords)
  const pinMeasurement = useMeasurementModeStore((state) => state.pinMeasurement)
  const removePinnedMeasurement = useMeasurementModeStore((state) => state.removePinnedMeasurement)
  const clearPinnedMeasurements = useMeasurementModeStore((state) => state.clearPinnedMeasurements)
  const { copiedKey, copyText } = useCopyFeedback()

  const target = useMemo(
    () => getNodeMeasurementSelectionTarget(nodes, selection),
    [nodes, selection],
  )
  const currentSummary = useMemo(() => {
    if (!target.node) return null
    return getMeasurementSummaryForNode(target.node, mode, nodes, unit, formatOptions)
  }, [formatOptions, mode, nodes, target.node, unit])

  const modeRecords = useMemo(
    () =>
      pinnedRecords
        .filter(
          (record): record is NodePinnedMeasurementRecord =>
            'nodeId' in record && record.kind === mode,
        )
        .flatMap((record) => {
          const node = nodes[record.nodeId]
          if (!node) return []

          const summary = getMeasurementSummaryForNode(node, mode, nodes, unit, formatOptions)
          if (!summary) return []

          return [{ record, summary }]
        }),
    [formatOptions, mode, nodes, pinnedRecords, unit],
  )

  const canRecordCurrent = Boolean(target.node && currentSummary)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
        {target.reason === 'multi' ? (
          <>
            <div className="font-medium text-sm">暂不支持多选测量</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              先只选中一个对象、楼层、区域或建筑，再查看{mode === 'area' ? '面积' : '体积'}。
            </div>
          </>
        ) : currentSummary ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {currentSummary.targetLabel} · {currentSummary.primaryLabel}
                </div>
                <div className="mt-1 font-semibold text-lg">{currentSummary.formattedValue}</div>
              </div>
              {currentSummary.approximate ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-1 font-medium text-[10px] text-amber-700">
                  近似值
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {currentSummary.description}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {currentSummary.metrics.map((metric) => (
                <div
                  className="rounded-lg bg-background/80 px-2.5 py-2"
                  key={`${currentSummary.nodeId}:${metric.id}`}
                >
                  <div className="text-[10px] text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 font-semibold text-sm">{metric.formattedValue}</div>
                </div>
              ))}
            </div>
          </>
        ) : target.node ? (
          <>
            <div className="font-medium text-sm">
              当前对象暂不支持{mode === 'area' ? '面积' : '体积'}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              试试选择墙体、楼板、吊顶、区域、门窗或一个完整构件。
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-sm">
              先选中一个对象再看{mode === 'area' ? '面积' : '体积'}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              可以直接在 3D 里点选，也可以从左侧树中选择楼层、区域或构件。
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <CopyButton
          copied={copiedKey === `${mode}:current`}
          disabled={!currentSummary}
          onClick={() => {
            if (currentSummary) {
              void copyText(`${mode}:current`, formatSelectionSummaryText(currentSummary))
            }
          }}
        />
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canRecordCurrent || !currentSummary}
          onClick={() => {
            if (currentSummary) {
              pinMeasurement(mode, currentSummary.nodeId)
            }
          }}
          type="button"
        >
          记录当前
        </button>
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={modeRecords.length === 0}
          onClick={() => clearPinnedMeasurements(mode)}
          type="button"
        >
          清空{mode === 'area' ? '面积' : '体积'}
        </button>
      </div>

      <div className="space-y-2">
        {modeRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-muted-foreground text-xs">
            还没有{mode === 'area' ? '面积' : '体积'}记录
          </div>
        ) : (
          modeRecords
            .slice()
            .reverse()
            .map(({ record, summary }) => (
              <div
                className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2.5"
                key={record.id}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{summary.formattedValue}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {summary.targetLabel} · {summary.primaryLabel} · {summary.description}
                    {summary.approximate ? ' · 近似值' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="复制测量记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => void copyText(record.id, formatSelectionSummaryText(summary))}
                    type="button"
                  >
                    {copiedKey === record.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    aria-label="删除测量记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => removePinnedMeasurement(record.id)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}

function ClearanceMeasurementPanel() {
  const selection = useViewer((state) => state.selection)
  const unit = useViewer((state) => state.unit)
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const formatOptions = useMeasurementFormatOptions()
  const pinnedRecords = useMeasurementModeStore((state) => state.pinnedRecords)
  const pinMeasurement = useMeasurementModeStore((state) => state.pinMeasurement)
  const removePinnedMeasurement = useMeasurementModeStore((state) => state.removePinnedMeasurement)
  const clearPinnedMeasurements = useMeasurementModeStore((state) => state.clearPinnedMeasurements)
  const { copiedKey, copyText } = useCopyFeedback()

  const target = useMemo(
    () => getNodeMeasurementSelectionTarget(nodes, selection),
    [nodes, selection],
  )
  const currentSummary = useMemo(() => {
    if (!target.node) return null
    return getClearanceSummaryForNode(target.node, nodes, unit, formatOptions)
  }, [formatOptions, nodes, target.node, unit])

  const clearanceRecords = useMemo(
    () =>
      pinnedRecords
        .filter(
          (record): record is NodePinnedMeasurementRecord =>
            'nodeId' in record && record.kind === 'clearance',
        )
        .flatMap((record) => {
          const node = nodes[record.nodeId]
          if (!node) return []

          const summary = getClearanceSummaryForNode(node, nodes, unit, formatOptions)
          if (!summary) return []

          return [{ record, summary }]
        }),
    [formatOptions, nodes, pinnedRecords, unit],
  )

  const canRecordCurrent = Boolean(target.node && currentSummary)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
        {target.reason === 'multi' ? (
          <>
            <div className="font-medium text-sm">暂不支持多选净空</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              先只选中一个对象、楼层、建筑、房间、门窗或家具，再查看层高链、梁下净高、离地和四向净距。
            </div>
          </>
        ) : currentSummary ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {currentSummary.targetLabel} · {currentSummary.primaryLabel}
                </div>
                <div className="mt-1 font-semibold text-lg">{currentSummary.formattedValue}</div>
              </div>
              {currentSummary.approximate ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-1 font-medium text-[10px] text-amber-700">
                  近似值
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {currentSummary.description}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {currentSummary.metrics.map((metric) => (
                <div
                  className="rounded-lg bg-background/80 px-2.5 py-2"
                  key={`${currentSummary.nodeId}:${metric.id}`}
                >
                  <div className="text-[10px] text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 font-semibold text-sm">{metric.formattedValue}</div>
                </div>
              ))}
            </div>
          </>
        ) : target.node ? (
          <>
            <div className="font-medium text-sm">当前对象暂不支持净空分析</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              试试选择建筑、楼层、屋顶、房间区域、门、窗或一个家具构件。
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-sm">先选中一个对象再看净空</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              建筑会显示总高、层高链和最高女儿墙高，楼层/房间会显示净高和梁下净高，平屋顶会显示女儿墙高，门窗会显示净宽/净高和顶部余量，家具会显示顶部净空、离地高度和前后左右净距。
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <CopyButton
          copied={copiedKey === 'clearance:current'}
          disabled={!currentSummary}
          onClick={() => {
            if (currentSummary) {
              void copyText('clearance:current', formatMetricSummaryCardText(currentSummary))
            }
          }}
        />
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canRecordCurrent || !currentSummary}
          onClick={() => {
            if (currentSummary) {
              pinMeasurement('clearance', currentSummary.nodeId)
            }
          }}
          type="button"
        >
          记录当前
        </button>
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={clearanceRecords.length === 0}
          onClick={() => clearPinnedMeasurements('clearance')}
          type="button"
        >
          清空净空
        </button>
      </div>

      <div className="space-y-2">
        {clearanceRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-muted-foreground text-xs">
            还没有净空记录
          </div>
        ) : (
          clearanceRecords
            .slice()
            .reverse()
            .map(({ record, summary }) => (
              <div
                className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2.5"
                key={record.id}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{summary.formattedValue}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {summary.targetLabel} · {summary.primaryLabel} · {summary.description}
                    {summary.approximate ? ' · 近似值' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="复制净空记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => void copyText(record.id, formatMetricSummaryCardText(summary))}
                    type="button"
                  >
                    {copiedKey === record.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    aria-label="删除净空记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => removePinnedMeasurement(record.id)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}

function AngleMeasurementPanel() {
  const selection = useViewer((state) => state.selection)
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const formatOptions = useMeasurementFormatOptions()
  const pinnedRecords = useMeasurementModeStore((state) => state.pinnedRecords)
  const pinMeasurement = useMeasurementModeStore((state) => state.pinMeasurement)
  const removePinnedMeasurement = useMeasurementModeStore((state) => state.removePinnedMeasurement)
  const clearPinnedMeasurements = useMeasurementModeStore((state) => state.clearPinnedMeasurements)
  const { copiedKey, copyText } = useCopyFeedback()

  const target = useMemo(
    () => getNodeMeasurementSelectionTarget(nodes, selection),
    [nodes, selection],
  )
  const currentSummary = useMemo(() => {
    if (!target.node) return null
    return getAngleSummaryForNode(target.node, nodes, formatOptions)
  }, [formatOptions, nodes, target.node])
  const comparisonSummary = useMemo(
    () => getAngleComparisonSummaryForSelection(selection.selectedIds, nodes, formatOptions),
    [formatOptions, nodes, selection.selectedIds],
  )

  const angleRecords = useMemo(
    () =>
      pinnedRecords
        .filter(
          (record): record is NodePinnedMeasurementRecord =>
            'nodeId' in record && record.kind === 'angle',
        )
        .flatMap((record) => {
          const node = nodes[record.nodeId]
          if (!node) return []

          const summary = getAngleSummaryForNode(node, nodes, formatOptions)
          if (!summary) return []

          return [{ record, summary }]
        }),
    [formatOptions, nodes, pinnedRecords],
  )

  const canRecordCurrent = Boolean(
    target.node && currentSummary && selection.selectedIds.length <= 1,
  )

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
        {target.reason === 'multi' ? (
          comparisonSummary ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    {comparisonSummary.targetLabel} · {comparisonSummary.primaryLabel}
                  </div>
                  <div className="mt-1 font-semibold text-lg">
                    {comparisonSummary.formattedValue}
                  </div>
                </div>
                {comparisonSummary.approximate ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-1 font-medium text-[10px] text-amber-700">
                    近似值
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {comparisonSummary.description}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {comparisonSummary.metrics.map((metric) => (
                  <div
                    className="rounded-lg bg-background/80 px-2.5 py-2"
                    key={`${comparisonSummary.nodeId}:${metric.id}`}
                  >
                    <div className="text-[10px] text-muted-foreground">{metric.label}</div>
                    <div className="mt-1 font-semibold text-sm">{metric.formattedValue}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium text-sm">多选时只支持两条线性对象夹角</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                先只选中两个墙体或围栏，再查看它们的夹角和外角。
              </div>
            </>
          )
        ) : currentSummary ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {currentSummary.targetLabel} · {currentSummary.primaryLabel}
                </div>
                <div className="mt-1 font-semibold text-lg">{currentSummary.formattedValue}</div>
              </div>
              {currentSummary.approximate ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-1 font-medium text-[10px] text-amber-700">
                  近似值
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {currentSummary.description}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {currentSummary.metrics.map((metric) => (
                <div
                  className="rounded-lg bg-background/80 px-2.5 py-2"
                  key={`${currentSummary.nodeId}:${metric.id}`}
                >
                  <div className="text-[10px] text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 font-semibold text-sm">{metric.formattedValue}</div>
                </div>
              ))}
            </div>
          </>
        ) : target.node ? (
          <>
            <div className="font-medium text-sm">当前对象暂不支持角度分析</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              试试选择屋顶、楼梯、墙体、围栏，或者一个带旋转的构件。
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-sm">先选中一个对象再看角度</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              屋顶会显示坡度角、坡度和坡向，楼梯会显示倾角和扫掠角，墙体会显示墙线角度。
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <CopyButton
          copied={copiedKey === 'angle:current'}
          disabled={!(comparisonSummary || currentSummary)}
          onClick={() => {
            if (comparisonSummary) {
              void copyText('angle:current', formatMetricSummaryCardText(comparisonSummary))
              return
            }
            if (currentSummary) {
              void copyText('angle:current', formatMetricSummaryCardText(currentSummary))
            }
          }}
        />
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canRecordCurrent || !currentSummary}
          onClick={() => {
            if (currentSummary) {
              pinMeasurement('angle', currentSummary.nodeId)
            }
          }}
          type="button"
        >
          记录当前
        </button>
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={angleRecords.length === 0}
          onClick={() => clearPinnedMeasurements('angle')}
          type="button"
        >
          清空角度
        </button>
      </div>

      <div className="space-y-2">
        {angleRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-muted-foreground text-xs">
            还没有角度记录
          </div>
        ) : (
          angleRecords
            .slice()
            .reverse()
            .map(({ record, summary }) => (
              <div
                className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2.5"
                key={record.id}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{summary.formattedValue}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {summary.targetLabel} · {summary.primaryLabel} · {summary.description}
                    {summary.approximate ? ' · 近似值' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="复制角度记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => void copyText(record.id, formatMetricSummaryCardText(summary))}
                    type="button"
                  >
                    {copiedKey === record.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    aria-label="删除角度记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => removePinnedMeasurement(record.id)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}

function GridMeasurementPanel() {
  const selection = useViewer((state) => state.selection)
  const unit = useViewer((state) => state.unit)
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const formatOptions = useMeasurementFormatOptions()
  const pinnedRecords = useMeasurementModeStore((state) => state.pinnedRecords)
  const pinGridMeasurement = useMeasurementModeStore((state) => state.pinGridMeasurement)
  const removePinnedMeasurement = useMeasurementModeStore((state) => state.removePinnedMeasurement)
  const clearPinnedMeasurements = useMeasurementModeStore((state) => state.clearPinnedMeasurements)
  const currentSummary = useMemo(
    () => getGridMeasurementSummaryForSelection(selection.selectedIds, nodes, unit, formatOptions),
    [formatOptions, nodes, selection.selectedIds, unit],
  )
  const { copiedKey, copyText } = useCopyFeedback()
  const selectionCount = selection.selectedIds.length
  const normalizedSelectionIds = useMemo(
    () => Array.from(new Set(selection.selectedIds)).sort(),
    [selection.selectedIds],
  )
  const gridRecords = useMemo(
    () =>
      pinnedRecords
        .filter((record) => record.kind === 'grid')
        .flatMap((record) => {
          const summary = getGridMeasurementSummaryForSelection(
            record.nodeIds,
            nodes,
            unit,
            formatOptions,
          )
          if (!summary) return []
          return [{ record, summary }]
        }),
    [formatOptions, nodes, pinnedRecords, unit],
  )
  const isCurrentPinned = useMemo(
    () =>
      normalizedSelectionIds.length >= 2 &&
      gridRecords.some(
        ({ record }) =>
          record.nodeIds.length === normalizedSelectionIds.length &&
          record.nodeIds.every((nodeId, index) => nodeId === normalizedSelectionIds[index]),
      ),
    [gridRecords, normalizedSelectionIds],
  )

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
        {currentSummary ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {currentSummary.targetLabel} · {currentSummary.primaryLabel}
                </div>
                <div className="mt-1 font-semibold text-lg">{currentSummary.formattedValue}</div>
              </div>
              {currentSummary.approximate ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-1 font-medium text-[10px] text-amber-700">
                  近似值
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {currentSummary.description}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {currentSummary.metrics.map((metric) => (
                <div
                  className="rounded-lg bg-background/80 px-2.5 py-2"
                  key={`${currentSummary.nodeIds.join(':')}:${metric.id}`}
                >
                  <div className="text-[10px] text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 font-semibold text-sm">{metric.formattedValue}</div>
                </div>
              ))}
            </div>
          </>
        ) : selectionCount === 0 ? (
          <>
            <div className="font-medium text-sm">先多选轴线再看轴网</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              目前支持多选两条以上近似平行的墙体、围栏或草图线，直接给出轴距、总跨度、各跨距和轴线角度。
            </div>
          </>
        ) : selectionCount === 1 ? (
          <>
            <div className="font-medium text-sm">至少需要两条线性对象</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              再选一条墙体、围栏或草图线，就能量两条轴线之间的轴距；选三条及以上还能看到总跨度和分跨。
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-sm">当前选择还不能组成有效轴网</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              请确保选择的是两条以上彼此分开的近似平行线；重合线、夹角过大的对象或非线性对象暂不参与轴网测量。
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <CopyButton
          copied={copiedKey === 'grid:current'}
          disabled={!currentSummary}
          onClick={() => {
            if (currentSummary) {
              void copyText('grid:current', formatGridSummaryText(currentSummary))
            }
          }}
        />
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!currentSummary || isCurrentPinned}
          onClick={() => {
            if (currentSummary) {
              pinGridMeasurement(currentSummary.nodeIds)
            }
          }}
          type="button"
        >
          记录当前
        </button>
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={gridRecords.length === 0}
          onClick={() => clearPinnedMeasurements('grid')}
          type="button"
        >
          清空轴网
        </button>
      </div>

      <div className="space-y-2">
        {gridRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-muted-foreground text-xs">
            还没有轴网记录
          </div>
        ) : (
          gridRecords
            .slice()
            .reverse()
            .map(({ record, summary }) => (
              <div
                className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2.5"
                key={record.id}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{summary.formattedValue}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {summary.targetLabel} · {summary.primaryLabel} · {summary.description}
                    {summary.approximate ? ' · 近似值' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="复制轴网记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => void copyText(record.id, formatGridSummaryText(summary))}
                    type="button"
                  >
                    {copiedKey === record.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    aria-label="删除轴网记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => removePinnedMeasurement(record.id)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
        )}
      </div>

      <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-3 py-3 text-[11px] text-muted-foreground">
        轴网记录现在会跟随场景一起持久化，并参与导出、截图和历史回看；真正的柱网节点语义后面再继续往上接。
      </div>
    </div>
  )
}

function PerimeterMeasurementPanel() {
  const selection = useViewer((state) => state.selection)
  const unit = useViewer((state) => state.unit)
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const formatOptions = useMeasurementFormatOptions()
  const pinnedRecords = useMeasurementModeStore((state) => state.pinnedRecords)
  const hoveredPerimeterGuideId = useMeasurementModeStore((state) => state.hoveredPerimeterGuideId)
  const lockedPerimeterGuideId = useMeasurementModeStore((state) => state.lockedPerimeterGuideId)
  const perimeterVisibility = useMeasurementModeStore((state) => state.perimeterVisibility)
  const pinMeasurement = useMeasurementModeStore((state) => state.pinMeasurement)
  const removePinnedMeasurement = useMeasurementModeStore((state) => state.removePinnedMeasurement)
  const clearPinnedMeasurements = useMeasurementModeStore((state) => state.clearPinnedMeasurements)
  const setHoveredPerimeterGuideId = useMeasurementModeStore(
    (state) => state.setHoveredPerimeterGuideId,
  )
  const toggleLockedPerimeterGuideId = useMeasurementModeStore(
    (state) => state.toggleLockedPerimeterGuideId,
  )
  const setPerimeterVisibility = useMeasurementModeStore((state) => state.setPerimeterVisibility)
  const { copiedKey, copyText } = useCopyFeedback()

  const target = useMemo(
    () => getNodeMeasurementSelectionTarget(nodes, selection),
    [nodes, selection],
  )
  const currentSummary = useMemo(() => {
    if (!target.node) return null
    return getPerimeterSummaryForNode(target.node, nodes, unit, formatOptions)
  }, [formatOptions, nodes, target.node, unit])
  const currentGuides = useMemo(() => {
    if (!target.node) return []
    return getPerimeterGuidesForNode(target.node, nodes, unit, formatOptions)
  }, [formatOptions, nodes, target.node, unit])
  const guideMeta = useMemo(
    () => new Map(currentGuides.map((guide) => [guide.id, guide])),
    [currentGuides],
  )
  const activePerimeterGuideId = lockedPerimeterGuideId ?? hoveredPerimeterGuideId

  const perimeterRecords = useMemo(
    () =>
      pinnedRecords
        .filter(
          (record): record is NodePinnedMeasurementRecord =>
            'nodeId' in record && record.kind === 'perimeter',
        )
        .flatMap((record) => {
          const node = nodes[record.nodeId]
          if (!node) return []

          const summary = getPerimeterSummaryForNode(node, nodes, unit, formatOptions)
          if (!summary) return []

          return [{ record, summary }]
        }),
    [formatOptions, nodes, pinnedRecords, unit],
  )

  const canRecordCurrent = Boolean(target.node && currentSummary)
  const setbackBoundaryWarnings = useMemo(
    () =>
      currentSummary?.metrics.filter(
        (metric) => metric.id.endsWith('setback') && metric.value < -0.0001,
      ) ?? [],
    [currentSummary],
  )
  const setbackRuleWarnings = useMemo(
    () =>
      currentSummary?.metrics.filter(
        (metric) => metric.id.endsWith('setback') && metric.rule?.status === 'fail',
      ) ?? [],
    [currentSummary],
  )
  const visibilityOptions: Array<{
    key: 'span' | 'depth' | 'setbacks' | 'baselines'
    label: string
  }> = [
    { key: 'span', label: '面宽' },
    { key: 'depth', label: '进深' },
    { key: 'setbacks', label: '退距' },
    { key: 'baselines', label: '基准边' },
  ]

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
        {target.reason === 'multi' ? (
          <>
            <div className="font-medium text-sm">暂不支持多选周长分析</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              先只选中一个对象，再查看周长、面宽、进深或退距。
            </div>
          </>
        ) : currentSummary ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {currentSummary.targetLabel} · {currentSummary.primaryLabel}
                </div>
                <div className="mt-1 font-semibold text-lg">{currentSummary.formattedValue}</div>
              </div>
              {currentSummary.approximate ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-1 font-medium text-[10px] text-amber-700">
                  近似值
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {currentSummary.description}
              {currentSummary.metrics.some((metric) => metric.id.endsWith('setback'))
                ? ' · 已在 3D 场景里显示前后左右退距辅助线，并高亮对应场地基准边；悬停可聚焦，点击卡片或辅助线可锁定'
                : ''}
              {currentSummary.metrics.some(
                (metric) => metric.id.startsWith('span-bay:') || metric.id.startsWith('depth-bay:'),
              )
                ? ' · 已按轮廓拐点拆出面宽/进深分跨'
                : ''}
            </div>

            {lockedPerimeterGuideId ? (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary">
                <Lock className="h-3.5 w-3.5" />
                已锁定 {guideMeta.get(lockedPerimeterGuideId)?.label ?? '当前辅助线'}
                ，再次点击可取消。
              </div>
            ) : null}

            {setbackBoundaryWarnings.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  超界告警
                </div>
                <div className="mt-1">
                  {setbackBoundaryWarnings
                    .map((metric) => `${metric.label} ${metric.formattedValue}`)
                    .join(' · ')}{' '}
                  已超出场地边界
                </div>
              </div>
            ) : null}

            {setbackRuleWarnings.length > 0 ? (
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  目标退距告警
                </div>
                <div className="mt-1">
                  {setbackRuleWarnings
                    .map((metric) => {
                      if (!metric.rule) return `${metric.label} ${metric.formattedValue}`
                      return `${metric.label} ${metric.formattedValue}，要求 ≥ ${metric.rule.formattedTarget}，差 ${metric.rule.formattedDelta}`
                    })
                    .join(' · ')}
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
              {visibilityOptions.map((option) => {
                const visible = perimeterVisibility[option.key]
                const Icon = visible ? Eye : EyeOff

                return (
                  <button
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors',
                      visible
                        ? 'border-border/70 bg-background/90 text-foreground'
                        : 'border-border/50 bg-background/40 text-muted-foreground',
                    )}
                    key={option.key}
                    onClick={() => setPerimeterVisibility(option.key, !visible)}
                    type="button"
                  >
                    <span className="font-medium text-[11px]">{option.label}</span>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {currentSummary.metrics.map((metric) => (
                <div
                  className={cn(
                    'rounded-lg bg-background/80 px-2.5 py-2 transition-colors',
                    (metric.id === 'span' ||
                      metric.id === 'depth' ||
                      metric.id.endsWith('setback')) &&
                      'cursor-pointer',
                    (metric.id.startsWith('span-bay:') || metric.id.startsWith('depth-bay:')) &&
                      'border border-border/50 bg-muted/20',
                    metric.rule?.status === 'fail' && 'border border-rose-500/30 bg-rose-500/5',
                    metric.rule?.status === 'pass' &&
                      'border border-emerald-500/20 bg-emerald-500/5',
                    activePerimeterGuideId === metric.id && 'ring-1 ring-primary/60 bg-primary/5',
                    metric.id === lockedPerimeterGuideId && 'border border-primary/30',
                  )}
                  key={`${currentSummary.nodeId}:${metric.id}`}
                  onClick={() => {
                    if (
                      metric.id === 'span' ||
                      metric.id === 'depth' ||
                      metric.id.endsWith('setback')
                    ) {
                      toggleLockedPerimeterGuideId(metric.id as PerimeterGuide['id'])
                    }
                  }}
                  onMouseEnter={() => {
                    if (
                      metric.id === 'span' ||
                      metric.id === 'depth' ||
                      metric.id.endsWith('setback')
                    ) {
                      setHoveredPerimeterGuideId(metric.id as PerimeterGuide['id'])
                    }
                  }}
                  onMouseLeave={() => setHoveredPerimeterGuideId(null)}
                >
                  <div className="text-[10px] text-muted-foreground">{metric.label}</div>
                  {guideMeta.get(metric.id as PerimeterGuide['id'])?.referenceLabel ? (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {guideMeta.get(metric.id as PerimeterGuide['id'])?.referenceLabel}
                    </div>
                  ) : null}
                  {metric.rule ? (
                    <div
                      className={cn(
                        'mt-0.5 text-[10px]',
                        metric.rule.status === 'fail' ? 'text-rose-700' : 'text-emerald-700',
                      )}
                    >
                      目标 ≥ {metric.rule.formattedTarget} ·
                      {metric.rule.status === 'fail' ? ' 差 ' : ' 余量 '}
                      {metric.rule.formattedDelta}
                    </div>
                  ) : null}
                  <div className="mt-1 font-semibold text-sm">{metric.formattedValue}</div>
                </div>
              ))}
            </div>
          </>
        ) : target.node ? (
          <>
            <div className="font-medium text-sm">当前对象暂不支持周长分析</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              试试选择场地、建筑、楼层、区域、屋顶、墙体、围栏、门窗或一个家具构件。
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-sm">先选中一个对象再看周长</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              建筑、楼层、区域和屋顶会按场地朝向显示面宽、进深、分跨和前后左右退距，门窗会显示洞口开间和安装进深。
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <CopyButton
          copied={copiedKey === 'perimeter:current'}
          disabled={!currentSummary}
          onClick={() => {
            if (currentSummary) {
              void copyText('perimeter:current', formatMetricSummaryCardText(currentSummary))
            }
          }}
        />
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canRecordCurrent || !currentSummary}
          onClick={() => {
            if (currentSummary) {
              pinMeasurement('perimeter', currentSummary.nodeId)
            }
          }}
          type="button"
        >
          记录当前
        </button>
        <button
          className="rounded-lg border border-border/70 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={perimeterRecords.length === 0}
          onClick={() => clearPinnedMeasurements('perimeter')}
          type="button"
        >
          清空周长
        </button>
      </div>

      <div className="space-y-2">
        {perimeterRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-muted-foreground text-xs">
            还没有周长记录
          </div>
        ) : (
          perimeterRecords
            .slice()
            .reverse()
            .map(({ record, summary }) => (
              <div
                className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/90 px-3 py-2.5"
                key={record.id}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{summary.formattedValue}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {summary.targetLabel} · {summary.primaryLabel} · {summary.description}
                    {summary.approximate ? ' · 近似值' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="复制周长记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => void copyText(record.id, formatMetricSummaryCardText(summary))}
                    type="button"
                  >
                    {copiedKey === record.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    aria-label="删除周长记录"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => removePinnedMeasurement(record.id)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}

function MeasurementHistoryPanel() {
  const measurementMode = useEditor((state) => state.measurementMode)
  const setMeasurementMode = useEditor((state) => state.setMeasurementMode)
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const unit = useViewer((state) => state.unit)
  const formatOptions = useMeasurementFormatOptions()
  const distanceRecords = useMeasurementModeStore((state) => state.distanceRecords)
  const pinnedRecords = useMeasurementModeStore((state) => state.pinnedRecords)
  const setDistanceMode = useMeasurementModeStore((state) => state.setDistanceMode)
  const [recalledId, setRecalledId] = useState<string | null>(null)

  const historyEntries = useMemo<MeasurementHistoryEntry[]>(() => {
    const entries: MeasurementHistoryEntry[] = []

    for (const record of distanceRecords) {
      if ('points' in record) {
        entries.push({
          id: record.id,
          createdAt: record.createdAt,
          mode: 'distance',
          label: DISTANCE_MODE_LABELS[record.mode],
          value: formatLength(record.length, unit, formatOptions),
          details: getPathRecordSecondary(record.segmentCount, record.approximate),
        })
        continue
      }

      const stats = getSegmentStats(record.start, record.end)
      entries.push({
        id: record.id,
        createdAt: record.createdAt,
        mode: 'distance',
        label: DISTANCE_MODE_LABELS[record.mode],
        value: formatLength(stats.length, unit, formatOptions),
        details: getDistanceSecondary(record.mode, stats, unit, formatOptions),
      })
    }

    for (const record of pinnedRecords) {
      if (record.kind === 'grid') {
        const summary = getGridMeasurementSummaryForSelection(
          record.nodeIds,
          nodes,
          unit,
          formatOptions,
        )
        if (!summary) continue

        entries.push({
          id: record.id,
          createdAt: record.createdAt,
          mode: 'grid',
          label: summary.targetLabel,
          value: summary.formattedValue,
          details: `轴网 · ${summary.primaryLabel}${summary.approximate ? ' · 近似值' : ''}`,
          nodeIds: summary.nodeIds,
        })
        continue
      }

      const node = nodes[record.nodeId]
      if (!node) continue

      if (record.kind === 'area' || record.kind === 'volume') {
        const summary = getMeasurementSummaryForNode(node, record.kind, nodes, unit, formatOptions)
        if (!summary) continue

        entries.push({
          id: record.id,
          createdAt: record.createdAt,
          mode: record.kind,
          label: summary.targetLabel,
          value: summary.formattedValue,
          details: `${MEASUREMENT_MODE_LABELS[record.kind]} · ${summary.primaryLabel}${summary.approximate ? ' · 近似值' : ''}`,
          nodeId: summary.nodeId,
        })
        continue
      }

      if (record.kind === 'clearance') {
        const summary = getClearanceSummaryForNode(node, nodes, unit, formatOptions)
        if (!summary) continue

        entries.push({
          id: record.id,
          createdAt: record.createdAt,
          mode: 'clearance',
          label: summary.targetLabel,
          value: summary.formattedValue,
          details: `净空 · ${summary.primaryLabel}${summary.approximate ? ' · 近似值' : ''}`,
          nodeId: summary.nodeId,
        })
        continue
      }

      if (record.kind === 'angle') {
        const summary = getAngleSummaryForNode(node, nodes, formatOptions)
        if (!summary) continue

        entries.push({
          id: record.id,
          createdAt: record.createdAt,
          mode: 'angle',
          label: summary.targetLabel,
          value: summary.formattedValue,
          details: `角度 · ${summary.primaryLabel}${summary.approximate ? ' · 近似值' : ''}`,
          nodeId: summary.nodeId,
        })
        continue
      }

      if (record.kind === 'perimeter') {
        const summary = getPerimeterSummaryForNode(node, nodes, unit, formatOptions)
        if (!summary) continue

        entries.push({
          id: record.id,
          createdAt: record.createdAt,
          mode: 'perimeter',
          label: summary.targetLabel,
          value: summary.formattedValue,
          details: `周长 · ${summary.primaryLabel}${summary.approximate ? ' · 近似值' : ''}`,
          nodeId: summary.nodeId,
        })
      }
    }

    return entries
      .slice()
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MEASUREMENT_HISTORY_LIMIT)
  }, [distanceRecords, formatOptions, nodes, pinnedRecords, unit])

  if (historyEntries.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
        <div className="font-medium text-sm">最近测量</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          记录一次距离或固定一个测量结果后，这里会保留最近条目，方便快速回看。
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-sm">最近测量</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            保留最近 {Math.min(historyEntries.length, MEASUREMENT_HISTORY_LIMIT)}{' '}
            条，点击可切回对应模式并回看对象
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {historyEntries.map((entry) => (
          <button
            className={cn(
              'w-full rounded-xl border border-border/70 bg-background/90 px-3 py-2.5 text-left transition-colors hover:bg-accent/50',
              recalledId === entry.id && 'border-primary/40 bg-primary/5',
              measurementMode === entry.mode && 'shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)]',
            )}
            key={entry.id}
            onClick={() => {
              setRecalledId(entry.id)
              if (entry.mode === 'distance') {
                setMeasurementMode('distance')
                const record = distanceRecords.find((candidate) => candidate.id === entry.id)
                if (record) {
                  setDistanceMode(record.mode)
                }
                return
              }

              if (entry.mode === 'grid' && entry.nodeIds && entry.nodeIds.length > 1) {
                recallMeasurementGroup(entry.nodeIds, nodes, 'grid')
                return
              }

              const node = entry.nodeId ? nodes[entry.nodeId] : null
              if (node) {
                recallMeasurementNode(node, nodes, entry.mode)
              }
            }}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                    {MEASUREMENT_MODE_LABELS[entry.mode]}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {formatHistoryTimestamp(entry.createdAt)}
                  </span>
                </div>
                <div className="mt-1 truncate font-semibold text-sm">{entry.value}</div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {entry.label} · {entry.details}
                </div>
              </div>
              <div className="shrink-0 text-[11px] text-primary">回看</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function MeasurementModeOverlay() {
  const measurementMode = useEditor((state) => state.measurementMode)
  const setMeasurementMode = useEditor((state) => state.setMeasurementMode)

  if (!measurementMode) return null

  const ActiveIcon =
    measurementMode === 'distance'
      ? Ruler
      : measurementMode === 'area'
        ? Square
        : measurementMode === 'volume'
          ? Box
          : measurementMode === 'clearance'
            ? ArrowUpDown
            : measurementMode === 'angle'
              ? DraftingCompass
              : measurementMode === 'perimeter'
                ? ArrowLeftRight
                : Grid3X3

  return (
    <div className="pointer-events-none absolute top-16 right-4 z-30 w-[420px] text-foreground">
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 border-border/60 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ActiveIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-sm">3D 测量</div>
              <div className="truncate text-[11px] text-muted-foreground">
                距离、面积、体积、净空、角度、周长和轴网都放到同一套分析模式里
              </div>
            </div>
          </div>
          <button
            aria-label="关闭测量模式"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setMeasurementMode(null)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <MeasurementModePanelBody measurementMode={measurementMode} />
      </div>
    </div>
  )
}

export function MeasurementModeDockedPanel() {
  const measurementMode = useEditor((state) => state.measurementMode)
  const setMeasurementMode = useEditor((state) => state.setMeasurementMode)

  if (!measurementMode) return null

  return (
    <PanelWrapper onClose={() => setMeasurementMode(null)} title="3D 测量">
      <MeasurementModePanelBody measurementMode={measurementMode} />
    </PanelWrapper>
  )
}

function MeasurementModePanelBody({ measurementMode }: { measurementMode: MeasurementMode }) {
  const setMeasurementMode = useEditor((state) => state.setMeasurementMode)
  const sceneData = useMeasurementSceneData()
  const setPrecision = useMeasurementModeStore((state) => state.setPrecision)
  const hasAnyRecords = useMeasurementModeStore(
    (state) => state.distanceRecords.length + state.pinnedRecords.length > 0,
  )
  const clearDistanceRecords = useMeasurementModeStore((state) => state.clearDistanceRecords)
  const clearPinnedMeasurements = useMeasurementModeStore((state) => state.clearPinnedMeasurements)
  const clearDraft = useMeasurementModeStore((state) => state.clearDraft)
  const setHoveredPerimeterGuideId = useMeasurementModeStore(
    (state) => state.setHoveredPerimeterGuideId,
  )
  const setLockedPerimeterGuideId = useMeasurementModeStore(
    (state) => state.setLockedPerimeterGuideId,
  )
  const requestScreenshotExport = useMeasurementModeStore((state) => state.requestScreenshotExport)
  const exportRows = useMemo(() => buildMeasurementExportRows(sceneData), [sceneData])

  useEffect(() => {
    if (measurementMode !== 'perimeter') {
      setHoveredPerimeterGuideId(null)
      setLockedPerimeterGuideId(null)
    }
  }, [measurementMode, setHoveredPerimeterGuideId, setLockedPerimeterGuideId])

  return (
    <div className="space-y-4 px-4 py-4">
      <MeasurementModeTabs activeMode={measurementMode} onChange={setMeasurementMode} />

      <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-sm">显示精度</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              单位跟随顶部工具栏，当前为{sceneData.unit === 'metric' ? '米' : '英尺'}
            </div>
          </div>
          <div className="inline-flex rounded-lg border border-border/70 bg-background/90 p-1">
            {MEASUREMENT_PRECISION_OPTIONS.map((precision) => (
              <button
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium text-[11px] transition-colors',
                  sceneData.precision === precision
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                key={precision}
                onClick={() => setPrecision(precision)}
                type="button"
              >
                {precision} 位
              </button>
            ))}
          </div>
        </div>
      </div>

      {measurementMode === 'distance' ? (
        <DistanceRecordList />
      ) : measurementMode === 'area' ? (
        <SelectionMeasurementPanel mode="area" />
      ) : measurementMode === 'volume' ? (
        <SelectionMeasurementPanel mode="volume" />
      ) : measurementMode === 'clearance' ? (
        <ClearanceMeasurementPanel />
      ) : measurementMode === 'angle' ? (
        <AngleMeasurementPanel />
      ) : measurementMode === 'grid' ? (
        <GridMeasurementPanel />
      ) : (
        <PerimeterMeasurementPanel />
      )}

      <MeasurementHistoryPanel />

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={exportRows.length === 0}
          onClick={() => {
            const csv = buildMeasurementCsv(exportRows)
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
            void saveBlobExport(
              blob,
              createExportFilename('measurement_report', 'csv'),
              exportFilters.csv,
            )
          }}
          type="button"
        >
          <FileDown className="h-3.5 w-3.5" />
          导出 CSV
        </button>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={exportRows.length === 0}
          onClick={() => {
            const payload = {
              generatedAt: new Date().toISOString(),
              measurementMode,
              unit: sceneData.unit,
              precision: sceneData.precision,
              rows: exportRows,
              persisted: buildPersistedMeasurementSnapshot(
                sceneData.distanceRecords,
                sceneData.pinnedRecords,
              ),
            }
            const blob = new Blob([JSON.stringify(payload, null, 2)], {
              type: 'application/json',
            })
            void saveBlobExport(
              blob,
              createExportFilename('measurement_report', 'json'),
              exportFilters.json,
            )
          }}
          type="button"
        >
          <FileDown className="h-3.5 w-3.5" />
          导出 JSON
        </button>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => requestScreenshotExport()}
          type="button"
        >
          <ImageDown className="h-3.5 w-3.5" />
          导出截图
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground">
        已记录的距离和测量标注会随当前场景一起持久化，重新打开后仍可继续查看和导出。
      </div>

      <div className="flex items-center justify-between border-border/60 border-t pt-3">
        <div className="text-[11px] text-muted-foreground">
          {measurementMode === 'distance'
            ? 'Esc 关闭模式，1-7 切测量模式，F/H/V/P 切自由/水平/垂直/路径测距'
            : measurementMode === 'clearance'
              ? 'Esc 关闭模式，1-7 切测量模式，选中对象后查看层高链、梁下净高、女儿墙高、离地和四向净距'
              : measurementMode === 'angle'
                ? 'Esc 关闭模式，1-7 切测量模式，单选看对象角度/坡向，多选两个墙体或围栏可看夹角'
                : measurementMode === 'grid'
                  ? 'Esc 关闭模式，1-7 切测量模式，多选两条以上近似平行的墙体、围栏或草图线可看轴距、总跨度和分跨'
                  : measurementMode === 'perimeter'
                    ? 'Esc 关闭模式，1-7 切测量模式，选中对象后查看周长、面宽、进深和退距，并在场景中显示辅助线与基准边'
                    : 'Esc 关闭模式，1-7 切测量模式，选中对象后可记录和复制当前结果'}
        </div>
        <button
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasAnyRecords}
          onClick={() => {
            clearDraft()
            clearDistanceRecords()
            clearPinnedMeasurements()
            setHoveredPerimeterGuideId(null)
            setLockedPerimeterGuideId(null)
          }}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
          全清
        </button>
      </div>
    </div>
  )
}
