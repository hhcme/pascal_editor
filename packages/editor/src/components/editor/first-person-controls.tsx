'use client'

import {
  type AnyNodeId,
  type DoorNode,
  type StairNode,
  type StairSegmentNode,
  sceneRegistry,
  spatialGridManager,
  useScene,
  type WallNode,
  type ZoneNode,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Euler, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { cn } from '../../lib/utils'
import useEditor, {
  type FirstPersonEyeHeightPreset,
  type FirstPersonNavigationMode,
  type FirstPersonSpeedPreset,
} from '../../store/use-editor'
import { type PathPoint, planWalkPath } from './first-person-pathfinding'

const EYE_HEIGHT_CONFIG: Record<FirstPersonEyeHeightPreset, { label: string; height: number }> = {
  adult: { label: 'Adult', height: 1.65 },
  child: { label: 'Child', height: 1.2 },
}

const SPEED_PRESETS: {
  id: FirstPersonSpeedPreset
  key: string
  label: string
  speed: number
}[] = [
  { id: 'inspect', key: '1', label: 'Inspect', speed: 1.4 },
  { id: 'walk', key: '2', label: 'Walk', speed: 2.7 },
  { id: 'quick', key: '3', label: 'Quick', speed: 5 },
  { id: 'fly', key: '4', label: 'Fly', speed: 9 },
]

const SPEED_CONFIG = Object.fromEntries(
  SPEED_PRESETS.map((preset) => [preset.id, preset]),
) as Record<FirstPersonSpeedPreset, (typeof SPEED_PRESETS)[number]>
const SPEED_ORDER = SPEED_PRESETS.map((preset) => preset.id)

// Sprint/slow modifiers mirror common realtime visualization tools.
const SPRINT_MULTIPLIER = 2
const SLOW_MULTIPLIER = 0.35
const VERTICAL_SPEED = 3
const MOUSE_SENSITIVITY = 0.002
const MIN_FLY_HEIGHT = 0.25
const WALL_COLLISION_RADIUS = 0.32
const DOOR_OPENING_PADDING = 0.16
const MIN_WALL_LENGTH = 0.001
const STAIR_SURFACE_PADDING = 0.18
const TWO_PI = Math.PI * 2
const MINIMAP_WIDTH = 208
const MINIMAP_HEIGHT = 140
const MINIMAP_PADDING = 14
const BOOKMARK_STORAGE_PREFIX = 'pascal:first-person-bookmarks'
const BOOKMARK_LIMIT = 16
const TOUR_SPEED = 2.25
const TOUR_WAYPOINT_DWELL = 1.25
const TOUR_ARRIVAL_DISTANCE = 0.16
const GAMEPAD_DEADZONE = 0.16
const GAMEPAD_LOOK_SPEED = 1.8
const LOOK_STATUS_EVENT = 'editor:first-person-look-status'
const POSE_EVENT = 'editor:first-person-pose'
const JUMP_TO_POSE_EVENT = 'editor:first-person-jump-pose'
const JUMP_TO_ZONE_EVENT = 'editor:first-person-jump-zone'
const TOUR_START_EVENT = 'editor:first-person-tour-start'
const TOUR_STOP_EVENT = 'editor:first-person-tour-stop'
const TOUR_STATUS_EVENT = 'editor:first-person-tour-status'
const VIRTUAL_MOVE_EVENT = 'editor:first-person-virtual-move'

const MOVEMENT_KEY_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
])

const SPEED_KEY_TO_PRESET: Record<string, FirstPersonSpeedPreset> = {
  Digit1: 'inspect',
  Digit2: 'walk',
  Digit3: 'quick',
  Digit4: 'fly',
}

const _forward = new Vector3()
const _right = new Vector3()
const _moveVector = new Vector3()
const _euler = new Euler(0, 0, 0, 'YXZ')
const _lookDirection = new Vector3()
const _groundPlane = new Plane(new Vector3(0, 1, 0), 0)
const _pointer = new Vector2()
const _teleportTarget = new Vector3()
const _raycaster = new Raycaster()

type FirstPersonSettingsSnapshot = {
  navigationMode: FirstPersonNavigationMode
  speedPreset: FirstPersonSpeedPreset
  eyeHeight: number
}

type DoorOpening = {
  leftT: number
  rightT: number
}

type WallCollisionSegment = {
  id: string
  sx: number
  sz: number
  ex: number
  ez: number
  length: number
  openings: DoorOpening[]
}

type LinearStairWalkSegment = {
  id: string
  kind: 'linear'
  originX: number
  originZ: number
  baseY: number
  rotation: number
  width: number
  length: number
  height: number
  segmentType: 'stair' | 'landing'
}

type ArcStairWalkSegment = {
  id: string
  kind: 'arc'
  centerX: number
  centerZ: number
  baseY: number
  rotation: number
  innerRadius: number
  outerRadius: number
  startAngle: number
  sweepAngle: number
  totalRise: number
  landingStartAngle: number | null
  landingSweepAngle: number
}

type StairWalkSegment = LinearStairWalkSegment | ArcStairWalkSegment

type StairWalkSurface = {
  id: string
  segments: StairWalkSegment[]
}

type FirstPersonNavigationData = {
  activeLevelId: AnyNodeId | null
  stairs: StairWalkSurface[]
  walls: WallCollisionSegment[]
  zones: ZoneNode[]
}

type FirstPersonPose = {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  mode: FirstPersonNavigationMode
  eyeHeight: number
  tourDwell?: boolean
}

type FirstPersonBookmark = FirstPersonPose & {
  id: string
  name: string
}

type FirstPersonTourStatus = {
  active: boolean
  index: number
  total: number
}

type TourState = {
  active: boolean
  route: FirstPersonPose[]
  index: number
  dwell: number
}

type VirtualMove = {
  x: number
  z: number
}

type SegmentTransform = {
  position: [number, number, number]
  rotation: number
}

type SceneNodeMap = ReturnType<typeof useScene.getState>['nodes']

type PlanBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function hasAnyKey(keys: Set<string>, codes: string[]) {
  return codes.some((code) => keys.has(code))
}

function getNextSpeedPreset(current: FirstPersonSpeedPreset, delta: 1 | -1) {
  const index = SPEED_ORDER.indexOf(current)
  const nextIndex = Math.max(0, Math.min(SPEED_ORDER.length - 1, index + delta))
  return SPEED_ORDER[nextIndex] ?? current
}

function exitPointerLockSafely(target?: Element) {
  if (typeof document.exitPointerLock !== 'function') return
  if (target ? document.pointerLockElement !== target : !document.pointerLockElement) return

  try {
    document.exitPointerLock()
  } catch {
    // Ignore teardown races when the document already released pointer lock.
  }
}

function isTransientNode(node: { metadata?: unknown }) {
  const metadata = node.metadata

  return (
    metadata !== null &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).isTransient === true
  )
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function wallLength(wall: WallNode) {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

function rotateXZ(x: number, z: number, angle: number): [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos + z * sin, -x * sin + z * cos]
}

function normalizeAngle(angle: number) {
  let normalized = angle
  while (normalized <= -Math.PI) normalized += TWO_PI
  while (normalized > Math.PI) normalized -= TWO_PI
  return normalized
}

function getAngleSweepProgress(angle: number, startAngle: number, sweepAngle: number) {
  if (Math.abs(sweepAngle) < 1e-6) return null

  let delta = normalizeAngle(angle - startAngle)
  if (sweepAngle > 0 && delta < 0) delta += TWO_PI
  if (sweepAngle < 0 && delta > 0) delta -= TWO_PI

  if (Math.abs(sweepAngle) < TWO_PI - 1e-4) {
    if (sweepAngle > 0 && (delta < -0.08 || delta > sweepAngle + 0.08)) return null
    if (sweepAngle < 0 && (delta > 0.08 || delta < sweepAngle - 0.08)) return null
  }

  return clamp01(delta / sweepAngle)
}

function lerpAngle(from: number, to: number, alpha: number) {
  return from + normalizeAngle(to - from) * alpha
}

function yawToPoint(fromX: number, fromZ: number, toX: number, toZ: number) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ))
}

function applyDeadzone(value: number) {
  const magnitude = Math.abs(value)
  if (magnitude < GAMEPAD_DEADZONE) return 0
  return Math.sign(value) * ((magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE))
}

function computeSegmentTransforms(segments: StairSegmentNode[]): SegmentTransform[] {
  const transforms: SegmentTransform[] = []
  let currentX = 0
  let currentY = 0
  let currentZ = 0
  let currentRotation = 0

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!

    if (index > 0) {
      const previous = segments[index - 1]!
      let attachX = 0
      let attachZ = previous.length
      let rotationChange = 0

      if (segment.attachmentSide === 'left') {
        attachX = previous.width / 2
        attachZ = previous.length / 2
        rotationChange = Math.PI / 2
      } else if (segment.attachmentSide === 'right') {
        attachX = -previous.width / 2
        attachZ = previous.length / 2
        rotationChange = -Math.PI / 2
      }

      const [worldAttachX, worldAttachZ] = rotateXZ(attachX, attachZ, currentRotation)
      currentX += worldAttachX
      currentY += previous.height
      currentZ += worldAttachZ
      currentRotation += rotationChange
    }

    transforms.push({
      position: [currentX, currentY, currentZ],
      rotation: currentRotation,
    })
  }

  return transforms
}

function getLevelYOffset(levelId: AnyNodeId | null | undefined) {
  if (!levelId) return 0
  return sceneRegistry.nodes.get(levelId)?.position.y ?? 0
}

function getStairSlabElevation(
  levelId: AnyNodeId | null,
  stair: StairNode,
  segments: StairSegmentNode[],
  transforms: SegmentTransform[],
) {
  if (!levelId) return 0

  let maxElevation = Number.NEGATIVE_INFINITY

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!
    const transform = transforms[index]!
    const [centerX, centerZ] = rotateXZ(0, segment.length / 2, transform.rotation)
    const [worldCenterX, worldCenterZ] = rotateXZ(
      transform.position[0] + centerX,
      transform.position[2] + centerZ,
      stair.rotation,
    )
    const elevation = spatialGridManager.getSlabElevationForItem(
      levelId,
      [
        stair.position[0] + worldCenterX,
        stair.position[1] + transform.position[1],
        stair.position[2] + worldCenterZ,
      ],
      [segment.width, Math.max(segment.height, segment.thickness, 0.01), segment.length],
      [0, stair.rotation + transform.rotation, 0],
    )
    maxElevation = Math.max(maxElevation, elevation)
  }

  return maxElevation === Number.NEGATIVE_INFINITY ? 0 : maxElevation
}

function buildStraightStairWalkSurface(
  nodes: SceneNodeMap,
  activeLevelId: AnyNodeId | null,
  stair: StairNode,
): StairWalkSurface | null {
  const segments = (stair.children ?? [])
    .map((childId) => nodes[childId as AnyNodeId] as StairSegmentNode | undefined)
    .filter((node): node is StairSegmentNode => node?.type === 'stair-segment')

  if (segments.length === 0) return null

  const transforms = computeSegmentTransforms(segments)
  const stairSlabElevation = getStairSlabElevation(activeLevelId, stair, segments, transforms)
  const walkSegments = segments.map((segment, index) => {
    const transform = transforms[index]!
    const [originOffsetX, originOffsetZ] = rotateXZ(
      transform.position[0],
      transform.position[2],
      stair.rotation,
    )

    return {
      id: segment.id,
      kind: 'linear' as const,
      originX: stair.position[0] + originOffsetX,
      originZ: stair.position[2] + originOffsetZ,
      baseY: stair.position[1] + stairSlabElevation + transform.position[1],
      rotation: stair.rotation + transform.rotation,
      width: segment.width,
      length: segment.length,
      height: segment.height,
      segmentType: segment.segmentType,
    }
  })

  return { id: stair.id, segments: walkSegments }
}

function buildArcStairWalkSurface(activeLevelId: AnyNodeId | null, stair: StairNode) {
  const isSpiral = stair.stairType === 'spiral'
  const innerRadius = Math.max(isSpiral ? 0.05 : 0.2, stair.innerRadius ?? 0.9)
  const outerRadius = innerRadius + Math.max(stair.width ?? 1, 0.4)
  const sweepAngle = stair.sweepAngle ?? (isSpiral ? TWO_PI : Math.PI / 2)
  const totalRise = Math.max(stair.totalRise ?? 2.5, 0.1)
  const slabElevation = activeLevelId
    ? spatialGridManager.getSlabElevationAt(activeLevelId, stair.position[0], stair.position[2])
    : 0
  const landingDepth = Math.max(
    0.3,
    stair.topLandingDepth ?? Math.max((stair.width ?? 1) * 0.9, 0.8),
  )
  const landingSweep =
    isSpiral && (stair.topLandingMode ?? 'none') === 'integrated'
      ? Math.min(
          Math.PI * 0.75,
          landingDepth / Math.max(innerRadius + (stair.width ?? 1) / 2, 0.1),
        ) * Math.sign(sweepAngle || 1)
      : 0

  return {
    id: stair.id,
    segments: [
      {
        id: stair.id,
        kind: 'arc' as const,
        centerX: stair.position[0],
        centerZ: stair.position[2],
        baseY: stair.position[1] + slabElevation,
        rotation: stair.rotation,
        innerRadius,
        outerRadius,
        startAngle: -sweepAngle / 2,
        sweepAngle,
        totalRise,
        landingStartAngle: landingSweep === 0 ? null : sweepAngle / 2,
        landingSweepAngle: landingSweep,
      },
    ],
  } satisfies StairWalkSurface
}

function buildStairWalkSurface(
  nodes: SceneNodeMap,
  activeLevelId: AnyNodeId | null,
  stair: StairNode,
): StairWalkSurface | null {
  if (stair.stairType === 'straight') {
    return buildStraightStairWalkSurface(nodes, activeLevelId, stair)
  }

  if (stair.stairType === 'curved' || stair.stairType === 'spiral') {
    return buildArcStairWalkSurface(activeLevelId, stair)
  }

  return null
}

function buildFirstPersonNavigationData(
  nodes: SceneNodeMap,
  activeLevelId: AnyNodeId | null | undefined,
): FirstPersonNavigationData {
  const doorsByWallId = new Map<string, DoorNode[]>()
  const stairs: StairWalkSurface[] = []
  const zones: ZoneNode[] = []
  const levelId = activeLevelId ?? null

  for (const node of Object.values(nodes)) {
    if (!node) continue

    if (node.type === 'zone' && (!levelId || node.parentId === levelId)) {
      zones.push(node as ZoneNode)
      continue
    }

    if (node.type === 'stair' && (!levelId || node.parentId === levelId)) {
      const surface = buildStairWalkSurface(nodes, levelId, node as StairNode)
      if (surface) stairs.push(surface)
      continue
    }

    if (node.type !== 'door' || isTransientNode(node)) continue
    const door = node as DoorNode
    const wallId = door.wallId ?? door.parentId
    if (!wallId) continue

    const existing = doorsByWallId.get(wallId) ?? []
    existing.push(door)
    doorsByWallId.set(wallId, existing)
  }

  const walls: WallCollisionSegment[] = []

  for (const node of Object.values(nodes)) {
    if (!node || node.type !== 'wall') continue
    const wall = node as WallNode
    if (levelId && wall.parentId !== levelId) continue

    const length = wallLength(wall)
    if (length < MIN_WALL_LENGTH) continue

    const openings = (doorsByWallId.get(wall.id) ?? []).map((door) => ({
      leftT: clamp01((door.position[0] - door.width / 2 - DOOR_OPENING_PADDING) / length),
      rightT: clamp01((door.position[0] + door.width / 2 + DOOR_OPENING_PADDING) / length),
    }))

    walls.push({
      id: wall.id,
      sx: wall.start[0],
      sz: wall.start[1],
      ex: wall.end[0],
      ez: wall.end[1],
      length,
      openings,
    })
  }

  zones.sort((a, b) => a.name.localeCompare(b.name))

  return { activeLevelId: levelId, stairs, walls, zones }
}

function useFirstPersonNavigationData() {
  const nodes = useScene((state) => state.nodes)
  const activeLevelId = useViewer((state) => state.selection.levelId)

  return useMemo(() => buildFirstPersonNavigationData(nodes, activeLevelId), [activeLevelId, nodes])
}

function isWallOpening(wall: WallCollisionSegment, t: number) {
  return wall.openings.some((opening) => t >= opening.leftT && t <= opening.rightT)
}

function pointToSegmentDistanceT(
  px: number,
  pz: number,
  sx: number,
  sz: number,
  ex: number,
  ez: number,
) {
  const dx = ex - sx
  const dz = ez - sz
  const lengthSq = dx * dx + dz * dz

  if (lengthSq < 1e-9) {
    return { distance: Math.hypot(px - sx, pz - sz), t: 0 }
  }

  const t = clamp01(((px - sx) * dx + (pz - sz) * dz) / lengthSq)
  const closestX = sx + dx * t
  const closestZ = sz + dz * t
  return { distance: Math.hypot(px - closestX, pz - closestZ), t }
}

function wallIntersectionT(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  wall: WallCollisionSegment,
) {
  const rx = bx - ax
  const rz = bz - az
  const sx = wall.ex - wall.sx
  const sz = wall.ez - wall.sz
  const denominator = rx * sz - rz * sx

  if (Math.abs(denominator) < 1e-9) return null

  const qpx = wall.sx - ax
  const qpz = wall.sz - az
  const moveT = (qpx * sz - qpz * sx) / denominator
  const wallT = (qpx * rz - qpz * rx) / denominator

  if (moveT < 0 || moveT > 1 || wallT < 0 || wallT > 1) return null
  return wallT
}

function isMovementBlocked(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  walls: WallCollisionSegment[],
) {
  if (Math.hypot(toX - fromX, toZ - fromZ) < 1e-6) return false

  for (const wall of walls) {
    const intersectionT = wallIntersectionT(fromX, fromZ, toX, toZ, wall)
    if (intersectionT !== null && !isWallOpening(wall, intersectionT)) {
      return true
    }

    const next = pointToSegmentDistanceT(toX, toZ, wall.sx, wall.sz, wall.ex, wall.ez)
    const previous = pointToSegmentDistanceT(fromX, fromZ, wall.sx, wall.sz, wall.ex, wall.ez)
    if (
      next.distance < WALL_COLLISION_RADIUS &&
      !isWallOpening(wall, next.t) &&
      (previous.distance >= WALL_COLLISION_RADIUS || next.distance < previous.distance - 0.01)
    ) {
      return true
    }
  }

  return false
}

function resolveWalkPosition(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  walls: WallCollisionSegment[],
) {
  if (!isMovementBlocked(fromX, fromZ, toX, toZ, walls)) {
    return { x: toX, z: toZ }
  }

  if (!isMovementBlocked(fromX, fromZ, toX, fromZ, walls)) {
    return { x: toX, z: fromZ }
  }

  if (!isMovementBlocked(fromX, fromZ, fromX, toZ, walls)) {
    return { x: fromX, z: toZ }
  }

  return { x: fromX, z: fromZ }
}

function polygonCentroid(points: [number, number][]) {
  if (points.length === 0) return null

  let twiceArea = 0
  let cx = 0
  let cz = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    const cross = current[0] * next[1] - next[0] * current[1]
    twiceArea += cross
    cx += (current[0] + next[0]) * cross
    cz += (current[1] + next[1]) * cross
  }

  if (Math.abs(twiceArea) < 1e-6) {
    const sum = points.reduce((acc, point) => ({ x: acc.x + point[0], z: acc.z + point[1] }), {
      x: 0,
      z: 0,
    })
    return { x: sum.x / points.length, z: sum.z / points.length }
  }

  return { x: cx / (3 * twiceArea), z: cz / (3 * twiceArea) }
}

function pointInPolygon(x: number, z: number, polygon: [number, number][]) {
  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]!
    const previousPoint = polygon[previous]!
    const intersects =
      currentPoint[1] > z !== previousPoint[1] > z &&
      x <
        ((previousPoint[0] - currentPoint[0]) * (z - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0]

    if (intersects) inside = !inside
  }

  return inside
}

function findContainingZone(zones: ZoneNode[], pose: FirstPersonPose | null) {
  if (!pose) return null
  return zones.find((zone) => pointInPolygon(pose.x, pose.z, zone.polygon)) ?? null
}

function getStairSegmentSurfaceY(segment: StairWalkSegment, x: number, z: number) {
  if (segment.kind === 'arc') {
    const [localX, localZ] = rotateXZ(x - segment.centerX, z - segment.centerZ, -segment.rotation)
    const radius = Math.hypot(localX, localZ)
    if (
      radius < segment.innerRadius - STAIR_SURFACE_PADDING ||
      radius > segment.outerRadius + STAIR_SURFACE_PADDING
    ) {
      return null
    }

    const angle = Math.atan2(localZ, localX)
    if (segment.landingStartAngle !== null) {
      const landingProgress = getAngleSweepProgress(
        angle,
        segment.landingStartAngle,
        segment.landingSweepAngle,
      )
      if (landingProgress !== null) {
        return segment.baseY + segment.totalRise
      }
    }

    const progress = getAngleSweepProgress(angle, segment.startAngle, segment.sweepAngle)
    if (progress === null) return null
    return segment.baseY + segment.totalRise * progress
  }

  const [localX, localZ] = rotateXZ(x - segment.originX, z - segment.originZ, -segment.rotation)
  const halfWidth = segment.width / 2 + STAIR_SURFACE_PADDING

  if (
    localX < -halfWidth ||
    localX > halfWidth ||
    localZ < -STAIR_SURFACE_PADDING ||
    localZ > segment.length + STAIR_SURFACE_PADDING
  ) {
    return null
  }

  if (segment.segmentType === 'landing') {
    return segment.baseY
  }

  const progress = clamp01(localZ / Math.max(segment.length, MIN_WALL_LENGTH))
  return segment.baseY + segment.height * progress
}

function getStairSurfaceY(stairs: StairWalkSurface[], x: number, z: number) {
  let surfaceY = Number.NEGATIVE_INFINITY

  for (const stair of stairs) {
    for (const segment of stair.segments) {
      const segmentSurfaceY = getStairSegmentSurfaceY(segment, x, z)
      if (segmentSurfaceY !== null) {
        surfaceY = Math.max(surfaceY, segmentSurfaceY)
      }
    }
  }

  return surfaceY === Number.NEGATIVE_INFINITY ? null : surfaceY
}

function getWalkSurfaceY(navigationData: FirstPersonNavigationData, x: number, z: number) {
  const levelY = getLevelYOffset(navigationData.activeLevelId)
  const slabY = navigationData.activeLevelId
    ? spatialGridManager.getSlabElevationAt(navigationData.activeLevelId, x, z)
    : 0
  const stairY = getStairSurfaceY(navigationData.stairs, x, z)

  return levelY + Math.max(slabY, stairY ?? 0)
}

function getWalkCameraY(
  navigationData: FirstPersonNavigationData,
  x: number,
  z: number,
  eyeHeight: number,
) {
  return getWalkSurfaceY(navigationData, x, z) + eyeHeight
}

function getFlyMinY(navigationData: FirstPersonNavigationData, x: number, z: number) {
  return getWalkSurfaceY(navigationData, x, z) + MIN_FLY_HEIGHT
}

function getNavigationBounds(
  walls: WallCollisionSegment[],
  zones: ZoneNode[],
  pose: FirstPersonPose | null,
): PlanBounds | null {
  const points: [number, number][] = []

  for (const wall of walls) {
    points.push([wall.sx, wall.sz], [wall.ex, wall.ez])
  }

  for (const zone of zones) {
    points.push(...zone.polygon)
  }

  if (pose) points.push([pose.x, pose.z])
  if (points.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point[0])
    maxX = Math.max(maxX, point[0])
    minZ = Math.min(minZ, point[1])
    maxZ = Math.max(maxZ, point[1])
  }

  if (maxX - minX < 1) {
    minX -= 0.5
    maxX += 0.5
  }

  if (maxZ - minZ < 1) {
    minZ -= 0.5
    maxZ += 0.5
  }

  return { minX, maxX, minZ, maxZ }
}

function getNavigationBoundsPoints(navigationData: FirstPersonNavigationData) {
  const points: PathPoint[] = []

  for (const wall of navigationData.walls) {
    points.push({ x: wall.sx, z: wall.sz }, { x: wall.ex, z: wall.ez })
  }

  for (const zone of navigationData.zones) {
    for (const [x, z] of zone.polygon) {
      points.push({ x, z })
    }
  }

  return points
}

function buildPlannedTourRoute(
  start: FirstPersonPose,
  targets: FirstPersonPose[],
  navigationData: FirstPersonNavigationData,
) {
  const route: FirstPersonPose[] = []
  const boundsPoints = getNavigationBoundsPoints(navigationData)
  let cursor: PathPoint = { x: start.x, z: start.z }

  for (const target of targets) {
    const end = { x: target.x, z: target.z }
    const path = planWalkPath({
      start: cursor,
      end,
      walls: navigationData.walls,
      boundsPoints,
      clearance: WALL_COLLISION_RADIUS,
    })

    if (!path || path.length < 2) continue

    for (let index = 1; index < path.length; index += 1) {
      const point = path[index]!
      const nextPoint = path[index + 1]
      const isDestination = index === path.length - 1

      route.push({
        x: point.x,
        y: 0,
        z: point.z,
        yaw:
          isDestination || !nextPoint
            ? target.yaw
            : yawToPoint(point.x, point.z, nextPoint.x, nextPoint.z),
        pitch: isDestination ? target.pitch : 0,
        mode: 'walk',
        eyeHeight: target.eyeHeight,
        tourDwell: isDestination,
      })
    }

    cursor = end
  }

  return route
}

function dispatchJumpToPose(pose: FirstPersonPose) {
  window.dispatchEvent(new CustomEvent<FirstPersonPose>(JUMP_TO_POSE_EVENT, { detail: pose }))
}

function dispatchJumpToZone(zoneId: string) {
  window.dispatchEvent(
    new CustomEvent<{ zoneId: string }>(JUMP_TO_ZONE_EVENT, { detail: { zoneId } }),
  )
}

function dispatchTourStatus(status: FirstPersonTourStatus) {
  window.dispatchEvent(
    new CustomEvent<FirstPersonTourStatus>(TOUR_STATUS_EVENT, { detail: status }),
  )
}

function dispatchStartTour(route: FirstPersonPose[]) {
  window.dispatchEvent(
    new CustomEvent<{ route: FirstPersonPose[] }>(TOUR_START_EVENT, { detail: { route } }),
  )
}

function dispatchStopTour() {
  window.dispatchEvent(new CustomEvent(TOUR_STOP_EVENT))
}

function dispatchVirtualMove(move: VirtualMove) {
  window.dispatchEvent(new CustomEvent<VirtualMove>(VIRTUAL_MOVE_EVENT, { detail: move }))
}

function getBookmarkStorageKey(buildingId: string | null, levelId: string | null) {
  return `${BOOKMARK_STORAGE_PREFIX}:${buildingId ?? 'scene'}:${levelId ?? 'all'}`
}

function normalizeStoredBookmark(value: unknown): FirstPersonBookmark | null {
  if (!value || typeof value !== 'object') return null
  const bookmark = value as Partial<FirstPersonBookmark>

  if (
    typeof bookmark.id !== 'string' ||
    typeof bookmark.name !== 'string' ||
    !Number.isFinite(bookmark.x) ||
    !Number.isFinite(bookmark.y) ||
    !Number.isFinite(bookmark.z)
  ) {
    return null
  }

  return {
    id: bookmark.id,
    name: bookmark.name,
    x: Number(bookmark.x),
    y: Number(bookmark.y),
    z: Number(bookmark.z),
    yaw: Number.isFinite(bookmark.yaw) ? Number(bookmark.yaw) : 0,
    pitch: Number.isFinite(bookmark.pitch) ? Number(bookmark.pitch) : 0,
    mode: bookmark.mode === 'fly' ? 'fly' : 'walk',
    eyeHeight: Number.isFinite(bookmark.eyeHeight) ? Number(bookmark.eyeHeight) : 1.65,
  }
}

function normalizeTourPose(value: unknown): FirstPersonPose | null {
  if (!value || typeof value !== 'object') return null
  const pose = value as Partial<FirstPersonPose>

  if (!Number.isFinite(pose.x) || !Number.isFinite(pose.z)) {
    return null
  }

  return {
    x: Number(pose.x),
    y: Number.isFinite(pose.y) ? Number(pose.y) : 0,
    z: Number(pose.z),
    yaw: Number.isFinite(pose.yaw) ? Number(pose.yaw) : 0,
    pitch: Number.isFinite(pose.pitch) ? Number(pose.pitch) : 0,
    mode: pose.mode === 'fly' ? 'fly' : 'walk',
    eyeHeight: Number.isFinite(pose.eyeHeight) ? Number(pose.eyeHeight) : 1.65,
  }
}

function loadStoredBookmarks(storageKey: string): FirstPersonBookmark[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeStoredBookmark)
      .filter((bookmark): bookmark is FirstPersonBookmark => bookmark !== null)
      .slice(0, BOOKMARK_LIMIT)
  } catch {
    return []
  }
}

function saveStoredBookmarks(storageKey: string, bookmarks: FirstPersonBookmark[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(bookmarks.slice(0, BOOKMARK_LIMIT)))
  } catch {
    // Ignore localStorage quota/privacy failures; bookmarks remain available in memory.
  }
}

export const FirstPersonControls = () => {
  const { camera, gl } = useThree()
  const navigationData = useFirstPersonNavigationData()
  const navigationMode = useEditor((s) => s.firstPersonNavigationMode)
  const setNavigationMode = useEditor((s) => s.setFirstPersonNavigationMode)
  const speedPreset = useEditor((s) => s.firstPersonSpeedPreset)
  const setSpeedPreset = useEditor((s) => s.setFirstPersonSpeedPreset)
  const eyeHeightPreset = useEditor((s) => s.firstPersonEyeHeightPreset)

  const keysRef = useRef<Set<string>>(new Set())
  const virtualMoveRef = useRef<VirtualMove>({ x: 0, z: 0 })
  const navigationDataRef = useRef(navigationData)
  const wallsRef = useRef(navigationData.walls)
  const zonesRef = useRef(navigationData.zones)
  const tourRef = useRef<TourState>({ active: false, route: [], index: 0, dwell: 0 })
  const yawRef = useRef(0)
  const pitchRef = useRef(0)
  const isLookingRef = useRef(false)
  const lookPointerIdRef = useRef<number | null>(null)
  const initializedRef = useRef(false)
  const poseElapsedRef = useRef(0)
  const settingsRef = useRef<FirstPersonSettingsSnapshot>({
    navigationMode,
    speedPreset,
    eyeHeight: EYE_HEIGHT_CONFIG[eyeHeightPreset].height,
  })

  const eyeHeight = EYE_HEIGHT_CONFIG[eyeHeightPreset].height

  useEffect(() => {
    settingsRef.current = { navigationMode, speedPreset, eyeHeight }
  }, [navigationMode, speedPreset, eyeHeight])

  useEffect(() => {
    navigationDataRef.current = navigationData
    wallsRef.current = navigationData.walls
    zonesRef.current = navigationData.zones
  }, [navigationData])

  useEffect(() => {
    if (navigationMode === 'walk') {
      camera.position.y = getWalkCameraY(
        navigationDataRef.current,
        camera.position.x,
        camera.position.z,
        eyeHeight,
      )
    }
  }, [camera, eyeHeight, navigationMode])

  // Initialize camera for first-person view from the current 3D view direction.
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    camera.getWorldDirection(_lookDirection)
    _lookDirection.y = 0
    if (_lookDirection.lengthSq() > 0) {
      _lookDirection.normalize()
      yawRef.current = Math.atan2(-_lookDirection.x, -_lookDirection.z)
    }
    pitchRef.current = 0
    camera.position.y = getWalkCameraY(
      navigationDataRef.current,
      camera.position.x,
      camera.position.z,
      eyeHeight,
    )
  }, [camera, eyeHeight])

  const setMouseLookActive = useCallback((active: boolean) => {
    isLookingRef.current = active
    window.dispatchEvent(
      new CustomEvent(LOOK_STATUS_EVENT, { detail: { active, engaged: active } }),
    )
  }, [])

  const startTourRoute = useCallback(
    (routeTargets: FirstPersonPose[]) => {
      const targets = routeTargets
        .map(normalizeTourPose)
        .filter((pose): pose is FirstPersonPose => pose !== null)
      if (targets.length === 0) return false

      const { eyeHeight: currentEyeHeight } = settingsRef.current
      const startPose: FirstPersonPose = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        yaw: yawRef.current,
        pitch: pitchRef.current,
        mode: settingsRef.current.navigationMode,
        eyeHeight: currentEyeHeight,
      }
      const plannedRoute = buildPlannedTourRoute(startPose, targets, navigationDataRef.current)

      if (plannedRoute.length === 0) {
        tourRef.current = { active: false, route: [], index: 0, dwell: 0 }
        dispatchTourStatus({ active: false, index: 0, total: 0 })
        return false
      }

      settingsRef.current = { ...settingsRef.current, navigationMode: 'walk' }
      setNavigationMode('walk')
      tourRef.current = { active: true, route: plannedRoute, index: 0, dwell: 0 }
      dispatchTourStatus({ active: true, index: 0, total: plannedRoute.length })
      return true
    },
    [camera, setNavigationMode],
  )

  const teleportToCanvasPoint = useCallback(
    (event: MouseEvent) => {
      const canvas = gl.domElement
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      _pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      _raycaster.setFromCamera(_pointer, camera)

      const navigation = navigationDataRef.current
      _groundPlane.constant = -getWalkSurfaceY(navigation, camera.position.x, camera.position.z)

      if (!_raycaster.ray.intersectPlane(_groundPlane, _teleportTarget)) return

      const { navigationMode: currentMode, eyeHeight: currentEyeHeight } = settingsRef.current
      const clickedTarget = { x: _teleportTarget.x, z: _teleportTarget.z }
      if (
        startTourRoute([
          {
            x: clickedTarget.x,
            y: 0,
            z: clickedTarget.z,
            yaw: yawRef.current,
            pitch: pitchRef.current,
            mode: 'walk',
            eyeHeight: currentEyeHeight,
          },
        ])
      ) {
        return
      }

      const target =
        currentMode === 'walk'
          ? resolveWalkPosition(
              camera.position.x,
              camera.position.z,
              clickedTarget.x,
              clickedTarget.z,
              wallsRef.current,
            )
          : clickedTarget

      camera.position.x = target.x
      camera.position.z = target.z
      camera.position.y =
        currentMode === 'walk'
          ? getWalkCameraY(navigation, target.x, target.z, currentEyeHeight)
          : Math.max(camera.position.y, getFlyMinY(navigation, target.x, target.z))
    },
    [camera, gl, startTourRoute],
  )

  useEffect(() => {
    const handleJumpToPose = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return
      const detail = event.detail as Partial<FirstPersonPose>
      if (!Number.isFinite(detail.x) || !Number.isFinite(detail.z)) return

      const nextX = Number(detail.x)
      const nextZ = Number(detail.z)

      startTourRoute([
        {
          x: nextX,
          y: Number.isFinite(detail.y) ? Number(detail.y) : 0,
          z: nextZ,
          yaw: Number.isFinite(detail.yaw) ? Number(detail.yaw) : yawRef.current,
          pitch: Number.isFinite(detail.pitch) ? Number(detail.pitch) : pitchRef.current,
          mode: detail.mode === 'fly' ? 'fly' : 'walk',
          eyeHeight: Number.isFinite(detail.eyeHeight)
            ? Number(detail.eyeHeight)
            : settingsRef.current.eyeHeight,
        },
      ])
    }

    const handleJumpToZone = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return
      const detail = event.detail as { zoneId?: unknown }
      if (typeof detail.zoneId !== 'string') return

      const zone = zonesRef.current.find((candidate) => candidate.id === detail.zoneId)
      if (!zone) return

      const centroid = polygonCentroid(zone.polygon)
      if (!centroid) return

      startTourRoute([
        {
          x: centroid.x,
          y: 0,
          z: centroid.z,
          yaw: yawRef.current,
          pitch: pitchRef.current,
          mode: 'walk',
          eyeHeight: settingsRef.current.eyeHeight,
        },
      ])
    }

    window.addEventListener(JUMP_TO_POSE_EVENT, handleJumpToPose)
    window.addEventListener(JUMP_TO_ZONE_EVENT, handleJumpToZone)

    return () => {
      window.removeEventListener(JUMP_TO_POSE_EVENT, handleJumpToPose)
      window.removeEventListener(JUMP_TO_ZONE_EVENT, handleJumpToZone)
    }
  }, [startTourRoute])

  useEffect(() => {
    const stopTour = () => {
      tourRef.current = { active: false, route: [], index: 0, dwell: 0 }
      dispatchTourStatus({ active: false, index: 0, total: 0 })
    }

    const handleTourStart = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return
      const detail = event.detail as { route?: unknown }
      if (!Array.isArray(detail.route)) return

      const route = detail.route
        .map(normalizeTourPose)
        .filter((pose): pose is FirstPersonPose => pose !== null)
      if (route.length === 0) return

      startTourRoute(route)
    }

    const handleVirtualMove = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return
      const detail = event.detail as Partial<VirtualMove>
      virtualMoveRef.current = {
        x: Number.isFinite(detail.x) ? Math.max(-1, Math.min(1, Number(detail.x))) : 0,
        z: Number.isFinite(detail.z) ? Math.max(-1, Math.min(1, Number(detail.z))) : 0,
      }
    }

    window.addEventListener(TOUR_START_EVENT, handleTourStart)
    window.addEventListener(TOUR_STOP_EVENT, stopTour)
    window.addEventListener(VIRTUAL_MOVE_EVENT, handleVirtualMove)

    return () => {
      window.removeEventListener(TOUR_START_EVENT, handleTourStart)
      window.removeEventListener(TOUR_STOP_EVENT, stopTour)
      window.removeEventListener(VIRTUAL_MOVE_EVENT, handleVirtualMove)
      stopTour()
      virtualMoveRef.current = { x: 0, z: 0 }
    }
  }, [startTourRoute])

  // Pointer lock and event handlers
  useEffect(() => {
    const canvas = gl.domElement

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return
      event.preventDefault()
      event.stopPropagation()
      lookPointerIdRef.current = event.pointerId
      setMouseLookActive(true)

      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture can fail if the browser already released this pointer.
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (lookPointerIdRef.current !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      lookPointerIdRef.current = null
      setMouseLookActive(false)

      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        // Ignore release races during teardown or window focus changes.
      }
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (lookPointerIdRef.current !== event.pointerId) return
      lookPointerIdRef.current = null
      setMouseLookActive(false)
    }

    const handleCanvasDoubleClick = (event: MouseEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      teleportToCanvasPoint(event)
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!isLookingRef.current || lookPointerIdRef.current !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()

      yawRef.current -= event.movementX * MOUSE_SENSITIVITY
      pitchRef.current -= event.movementY * MOUSE_SENSITIVITY
      pitchRef.current = Math.max(
        -Math.PI / 2 + 0.05,
        Math.min(Math.PI / 2 - 0.05, pitchRef.current),
      )
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const direction = event.deltaY < 0 ? 1 : -1
      setSpeedPreset(getNextSpeedPreset(settingsRef.current.speedPreset, direction))
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return

      const code = event.code

      if (code === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        exitPointerLockSafely(canvas)
        useEditor.getState().setFirstPersonMode(false)
        return
      }

      const speedPresetFromKey = SPEED_KEY_TO_PRESET[code]
      if (speedPresetFromKey) {
        event.preventDefault()
        event.stopPropagation()
        setSpeedPreset(speedPresetFromKey)
        return
      }

      if (code === 'KeyM') {
        event.preventDefault()
        event.stopPropagation()
        setNavigationMode(settingsRef.current.navigationMode === 'walk' ? 'fly' : 'walk')
        return
      }

      if (MOVEMENT_KEY_CODES.has(code)) {
        event.preventDefault()
        event.stopPropagation()
        keysRef.current.add(code)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code)
    }

    const clearKeys = () => {
      keysRef.current.clear()
    }

    canvas.addEventListener('pointerdown', handlePointerDown, true)
    canvas.addEventListener('pointerup', handlePointerUp, true)
    canvas.addEventListener('pointercancel', handlePointerCancel, true)
    canvas.addEventListener('pointermove', handlePointerMove, true)
    canvas.addEventListener('dblclick', handleCanvasDoubleClick)
    canvas.addEventListener('contextmenu', handleContextMenu)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', clearKeys)

    return () => {
      lookPointerIdRef.current = null
      setMouseLookActive(false)
      canvas.removeEventListener('pointerdown', handlePointerDown, true)
      canvas.removeEventListener('pointerup', handlePointerUp, true)
      canvas.removeEventListener('pointercancel', handlePointerCancel, true)
      canvas.removeEventListener('pointermove', handlePointerMove, true)
      canvas.removeEventListener('dblclick', handleCanvasDoubleClick)
      canvas.removeEventListener('contextmenu', handleContextMenu)
      canvas.removeEventListener('wheel', handleWheel)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', clearKeys)
      exitPointerLockSafely(canvas)
      clearKeys()
    }
  }, [gl, setMouseLookActive, setNavigationMode, setSpeedPreset, teleportToCanvasPoint])

  // Per-frame movement and camera rotation
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const keys = keysRef.current
    const {
      navigationMode: currentMode,
      speedPreset: currentSpeedPreset,
      eyeHeight: currentEyeHeight,
    } = settingsRef.current
    const navigation = navigationDataRef.current

    const isSprinting = hasAnyKey(keys, ['ShiftLeft', 'ShiftRight'])
    const isSlowing = hasAnyKey(keys, ['AltLeft', 'AltRight'])
    const baseSpeed = SPEED_CONFIG[currentSpeedPreset].speed
    const speed =
      baseSpeed * (isSprinting ? SPRINT_MULTIPLIER : 1) * (isSlowing ? SLOW_MULTIPLIER : 1)

    _forward.set(-Math.sin(yawRef.current), 0, -Math.cos(yawRef.current))
    _right.set(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current))
    _moveVector.set(0, 0, 0)

    if (hasAnyKey(keys, ['KeyW', 'ArrowUp'])) _moveVector.add(_forward)
    if (hasAnyKey(keys, ['KeyS', 'ArrowDown'])) _moveVector.sub(_forward)
    if (hasAnyKey(keys, ['KeyA', 'ArrowLeft'])) _moveVector.sub(_right)
    if (hasAnyKey(keys, ['KeyD', 'ArrowRight'])) _moveVector.add(_right)

    const virtualMove = virtualMoveRef.current
    if (Math.abs(virtualMove.z) > 0.02) _moveVector.addScaledVector(_forward, virtualMove.z)
    if (Math.abs(virtualMove.x) > 0.02) _moveVector.addScaledVector(_right, virtualMove.x)

    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const gamepad = Array.from(navigator.getGamepads()).find((pad) => pad?.connected)
      if (gamepad) {
        const leftX = applyDeadzone(gamepad.axes[0] ?? 0)
        const leftY = applyDeadzone(gamepad.axes[1] ?? 0)
        const rightX = applyDeadzone(gamepad.axes[2] ?? 0)
        const rightY = applyDeadzone(gamepad.axes[3] ?? 0)

        if (leftY !== 0) _moveVector.addScaledVector(_forward, -leftY)
        if (leftX !== 0) _moveVector.addScaledVector(_right, leftX)

        if (rightX !== 0 || rightY !== 0) {
          yawRef.current -= rightX * GAMEPAD_LOOK_SPEED * dt
          pitchRef.current -= rightY * GAMEPAD_LOOK_SPEED * dt
          pitchRef.current = Math.max(
            -Math.PI / 2 + 0.05,
            Math.min(Math.PI / 2 - 0.05, pitchRef.current),
          )
        }

        if (currentMode === 'fly') {
          const lift = (gamepad.buttons[7]?.value ?? 0) - (gamepad.buttons[6]?.value ?? 0)
          if (Math.abs(lift) > 0.02) {
            camera.position.y += lift * VERTICAL_SPEED * dt
          }
        }
      }
    }

    const tour = tourRef.current
    if (tour.active) {
      const target = tour.route[tour.index]
      if (!target) {
        tourRef.current = { active: false, route: [], index: 0, dwell: 0 }
        dispatchTourStatus({ active: false, index: 0, total: 0 })
      } else {
        const distance = Math.hypot(target.x - camera.position.x, target.z - camera.position.z)
        const arrivalDistance =
          target.tourDwell === false ? Math.max(TOUR_ARRIVAL_DISTANCE, 0.28) : TOUR_ARRIVAL_DISTANCE

        if (distance > arrivalDistance) {
          const step = Math.min(distance, TOUR_SPEED * dt)
          camera.position.x += ((target.x - camera.position.x) / distance) * step
          camera.position.z += ((target.z - camera.position.z) / distance) * step

          const desiredYaw =
            distance > 0.6
              ? yawToPoint(camera.position.x, camera.position.z, target.x, target.z)
              : target.yaw
          yawRef.current = lerpAngle(yawRef.current, desiredYaw, Math.min(1, dt * 3.4))
          pitchRef.current += (target.pitch - pitchRef.current) * Math.min(1, dt * 2.8)
        } else {
          const dwellDuration = target.tourDwell === false ? 0 : TOUR_WAYPOINT_DWELL
          tour.dwell += dt
          yawRef.current = lerpAngle(yawRef.current, target.yaw, Math.min(1, dt * 3.4))
          pitchRef.current += (target.pitch - pitchRef.current) * Math.min(1, dt * 2.8)

          if (tour.dwell >= dwellDuration) {
            if (tour.index >= tour.route.length - 1) {
              tourRef.current = { active: false, route: [], index: 0, dwell: 0 }
              dispatchTourStatus({ active: false, index: 0, total: 0 })
            } else {
              tour.index += 1
              tour.dwell = 0
              dispatchTourStatus({
                active: true,
                index: tour.index,
                total: tour.route.length,
              })
            }
          }
        }
      }
    } else if (_moveVector.lengthSq() > 0) {
      _moveVector.normalize().multiplyScalar(speed * dt)

      if (currentMode === 'walk') {
        const next = resolveWalkPosition(
          camera.position.x,
          camera.position.z,
          camera.position.x + _moveVector.x,
          camera.position.z + _moveVector.z,
          wallsRef.current,
        )
        camera.position.x = next.x
        camera.position.z = next.z
      } else {
        camera.position.add(_moveVector)
      }
    }

    if (currentMode === 'fly') {
      if (keys.has('KeyQ')) camera.position.y += VERTICAL_SPEED * dt
      if (keys.has('KeyE')) camera.position.y -= VERTICAL_SPEED * dt
      const minY = getFlyMinY(navigation, camera.position.x, camera.position.z)
      if (camera.position.y < minY) camera.position.y = minY
    } else {
      const targetY = getWalkCameraY(
        navigation,
        camera.position.x,
        camera.position.z,
        currentEyeHeight,
      )
      camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 14)
    }

    _euler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(_euler)

    poseElapsedRef.current += dt
    if (poseElapsedRef.current >= 0.08) {
      poseElapsedRef.current = 0
      window.dispatchEvent(
        new CustomEvent<FirstPersonPose>(POSE_EVENT, {
          detail: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            yaw: yawRef.current,
            pitch: pitchRef.current,
            mode: currentMode,
            eyeHeight: currentEyeHeight,
          },
        }),
      )
    }
  })

  return null
}

function useMouseLookStatus() {
  const [status, setStatus] = useState({ active: false, engaged: false })

  useEffect(() => {
    const handleLookStatus = (event: Event) => {
      const detail =
        event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail === 'object' &&
        'active' in event.detail
          ? (event.detail as { active?: unknown; engaged?: unknown })
          : {}

      setStatus((prev) => ({
        active: detail.active === true,
        engaged: prev.engaged || detail.engaged === true,
      }))
    }

    window.addEventListener(LOOK_STATUS_EVENT, handleLookStatus)
    return () => {
      window.removeEventListener(LOOK_STATUS_EVENT, handleLookStatus)
    }
  }, [])

  return status
}

function useFirstPersonPose() {
  const [pose, setPose] = useState<FirstPersonPose | null>(null)

  useEffect(() => {
    const handlePose = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return
      const detail = event.detail as Partial<FirstPersonPose>
      if (!Number.isFinite(detail.x) || !Number.isFinite(detail.z)) return

      setPose({
        x: Number(detail.x),
        y: Number.isFinite(detail.y) ? Number(detail.y) : 0,
        z: Number(detail.z),
        yaw: Number.isFinite(detail.yaw) ? Number(detail.yaw) : 0,
        pitch: Number.isFinite(detail.pitch) ? Number(detail.pitch) : 0,
        mode: detail.mode === 'fly' ? 'fly' : 'walk',
        eyeHeight: Number.isFinite(detail.eyeHeight) ? Number(detail.eyeHeight) : 1.65,
      })
    }

    window.addEventListener(POSE_EVENT, handlePose)
    return () => {
      window.removeEventListener(POSE_EVENT, handlePose)
    }
  }, [])

  return pose
}

function buildZoneTourRoute(
  zones: ZoneNode[],
  pose: FirstPersonPose | null,
  mode: FirstPersonNavigationMode,
  eyeHeight: number,
) {
  const centers = zones
    .map((zone) => polygonCentroid(zone.polygon))
    .filter((center): center is { x: number; z: number } => center !== null)

  return centers.map((center, index): FirstPersonPose => {
    const next = centers[index + 1] ?? centers[index - 1] ?? null
    return {
      x: center.x,
      y: 0,
      z: center.z,
      yaw: next ? yawToPoint(center.x, center.z, next.x, next.z) : (pose?.yaw ?? 0),
      pitch: 0,
      mode,
      eyeHeight,
    }
  })
}

function useFirstPersonTourStatus() {
  const [status, setStatus] = useState<FirstPersonTourStatus>({
    active: false,
    index: 0,
    total: 0,
  })

  useEffect(() => {
    const handleTourStatus = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return
      const detail = event.detail as Partial<FirstPersonTourStatus>
      setStatus({
        active: detail.active === true,
        index: Number.isFinite(detail.index) ? Number(detail.index) : 0,
        total: Number.isFinite(detail.total) ? Number(detail.total) : 0,
      })
    }

    window.addEventListener(TOUR_STATUS_EVENT, handleTourStatus)
    return () => {
      window.removeEventListener(TOUR_STATUS_EVENT, handleTourStatus)
    }
  }, [])

  return status
}

/**
 * Overlay UI for first-person mode: crosshair, controls hint, exit button.
 * Rendered as a regular DOM overlay (not inside the Canvas).
 */
export const FirstPersonOverlay = ({ onExit }: { onExit: () => void }) => {
  const navigationData = useFirstPersonNavigationData()
  const buildingId = useViewer((s) => s.selection.buildingId)
  const activeLevelId = useViewer((s) => s.selection.levelId)
  const navigationMode = useEditor((s) => s.firstPersonNavigationMode)
  const setNavigationMode = useEditor((s) => s.setFirstPersonNavigationMode)
  const speedPreset = useEditor((s) => s.firstPersonSpeedPreset)
  const setSpeedPreset = useEditor((s) => s.setFirstPersonSpeedPreset)
  const eyeHeightPreset = useEditor((s) => s.firstPersonEyeHeightPreset)
  const setEyeHeightPreset = useEditor((s) => s.setFirstPersonEyeHeightPreset)
  const lookStatus = useMouseLookStatus()
  const pose = useFirstPersonPose()
  const tourStatus = useFirstPersonTourStatus()
  const bookmarkStorageKey = useMemo(
    () => getBookmarkStorageKey(buildingId, activeLevelId),
    [activeLevelId, buildingId],
  )
  const [bookmarkState, setBookmarkState] = useState(() => ({
    bookmarks: loadStoredBookmarks(bookmarkStorageKey),
    storageKey: bookmarkStorageKey,
  }))
  const [presentationMode, setPresentationMode] = useState(false)

  const eyeHeight = EYE_HEIGHT_CONFIG[eyeHeightPreset]
  const speedLabel = SPEED_CONFIG[speedPreset].label
  const modeLabel = navigationMode === 'walk' ? 'Walk mode' : 'Fly mode'
  const bookmarks = bookmarkState.storageKey === bookmarkStorageKey ? bookmarkState.bookmarks : []
  const zoneTourRoute = useMemo(
    () => buildZoneTourRoute(navigationData.zones, pose, navigationMode, eyeHeight.height),
    [eyeHeight.height, navigationData.zones, navigationMode, pose],
  )
  const tourRoute = bookmarks.length > 0 ? bookmarks : zoneTourRoute
  const currentZone = useMemo(
    () => findContainingZone(navigationData.zones, pose),
    [navigationData.zones, pose],
  )

  useEffect(() => {
    setBookmarkState({
      bookmarks: loadStoredBookmarks(bookmarkStorageKey),
      storageKey: bookmarkStorageKey,
    })
  }, [bookmarkStorageKey])

  useEffect(() => {
    if (bookmarkState.storageKey !== bookmarkStorageKey) return
    saveStoredBookmarks(bookmarkStorageKey, bookmarkState.bookmarks)
  }, [bookmarkState, bookmarkStorageKey])

  const handleExit = useCallback(() => {
    exitPointerLockSafely()
    onExit()
  }, [onExit])

  const toggleNavigationMode = useCallback(() => {
    setNavigationMode(navigationMode === 'walk' ? 'fly' : 'walk')
  }, [navigationMode, setNavigationMode])

  const toggleEyeHeight = useCallback(() => {
    setEyeHeightPreset(eyeHeightPreset === 'adult' ? 'child' : 'adult')
  }, [eyeHeightPreset, setEyeHeightPreset])

  const updateBookmarks = useCallback(
    (updater: (current: FirstPersonBookmark[]) => FirstPersonBookmark[]) => {
      setBookmarkState((currentState) => {
        const current =
          currentState.storageKey === bookmarkStorageKey
            ? currentState.bookmarks
            : loadStoredBookmarks(bookmarkStorageKey)
        const next = updater(current).slice(-BOOKMARK_LIMIT)

        return { bookmarks: next, storageKey: bookmarkStorageKey }
      })
    },
    [bookmarkStorageKey],
  )

  const saveBookmark = useCallback(() => {
    if (!pose) return

    updateBookmarks((current) => [
      ...current,
      {
        ...pose,
        id: `${Date.now()}-${current.length}`,
        name: currentZone?.name ?? `View ${current.length + 1}`,
      },
    ])
  }, [currentZone?.name, pose, updateBookmarks])

  const deleteBookmark = useCallback(
    (bookmarkId: string) => {
      updateBookmarks((current) => current.filter((bookmark) => bookmark.id !== bookmarkId))
    },
    [updateBookmarks],
  )

  const startTour = useCallback(() => {
    if (tourRoute.length === 0) return
    dispatchStartTour(tourRoute)
  }, [tourRoute])

  const stopTour = useCallback(() => {
    dispatchStopTour()
  }, [])

  const activeSpeedDescription = useMemo(
    () => `Speed ${SPEED_CONFIG[speedPreset].key}: ${speedLabel}`,
    [speedLabel, speedPreset],
  )

  return (
    <>
      {!presentationMode ? (
        lookStatus.engaged ? (
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
            <div className="relative h-6 w-6">
              <div
                className={cn(
                  'absolute top-1/2 left-0 h-px w-full -translate-y-1/2 shadow-[0_0_6px_rgba(0,0,0,0.45)] transition-colors',
                  lookStatus.active ? 'bg-white/80' : 'bg-white/55',
                )}
              />
              <div
                className={cn(
                  'absolute top-0 left-1/2 h-full w-px -translate-x-1/2 shadow-[0_0_6px_rgba(0,0,0,0.45)] transition-colors',
                  lookStatus.active ? 'bg-white/80' : 'bg-white/55',
                )}
              />
            </div>
          </div>
        ) : (
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-4">
            <div className="max-w-[360px] rounded-lg border border-white/15 bg-slate-950/75 px-4 py-3 text-center text-white shadow-xl backdrop-blur-md">
              <div className="font-semibold text-sm">Drag canvas to look around</div>
              <div className="mt-1 text-white/70 text-xs">Double-click floor to move there</div>
            </div>
          </div>
        )
      ) : (
        <PresentationControls
          onExitPresentation={() => setPresentationMode(false)}
          onStopTour={stopTour}
          tourStatus={tourStatus}
        />
      )}

      {!presentationMode ? (
        <div className="fixed top-4 left-4 z-50 pointer-events-none">
          <div className="rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white shadow-lg backdrop-blur-md">
            <div className="font-semibold text-xs">Street View</div>
            <div className="mt-0.5 text-[11px] text-white/70">{modeLabel}</div>
          </div>
        </div>
      ) : null}

      <div className="fixed top-4 right-4 z-50">
        <button
          className="pointer-events-auto flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-slate-950/75 px-3 font-medium text-sm text-white shadow-lg backdrop-blur-md transition-colors hover:bg-slate-900"
          onClick={handleExit}
          type="button"
        >
          <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/75">
            ESC
          </kbd>
          Exit Street View
        </button>
      </div>

      {!presentationMode ? (
        <FirstPersonNavigationPanel
          bookmarks={bookmarks}
          currentZone={currentZone}
          navigationData={navigationData}
          onDeleteBookmark={deleteBookmark}
          onSaveBookmark={saveBookmark}
          onSelectBookmark={dispatchJumpToPose}
          onSelectZone={dispatchJumpToZone}
          onStartTour={startTour}
          onStopTour={stopTour}
          onTogglePresentation={() => setPresentationMode(true)}
          pose={pose}
          tourRouteLength={tourRoute.length}
          tourStatus={tourStatus}
        />
      ) : null}

      {!presentationMode ? <TouchMovePad /> : null}

      {!presentationMode ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 w-[min(92vw,820px)] -translate-x-1/2">
          <div className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white shadow-xl backdrop-blur-md">
            <HudHint label="Move" keys={['W', 'A', 'S', 'D']} />
            <HudHint label="Look" keys={['Drag']} />
            {navigationMode === 'fly' ? <HudHint label="Height" keys={['Q', 'E']} /> : null}
            <HudHint label="Faster" keys={['Shift']} />
            <HudHint label="Slower" keys={['Alt']} />
            <HudHint label="Speed" keys={['Wheel']} />
            <HudHint label="Gamepad" keys={['L', 'R']} />

            <div className="mx-1 h-6 w-px bg-white/15" />

            <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.07] p-0.5">
              {SPEED_PRESETS.map((preset) => {
                const active = preset.id === speedPreset
                return (
                  <button
                    aria-label={`Speed ${preset.key}: ${preset.label}`}
                    className={cn(
                      'flex h-7 min-w-7 items-center justify-center rounded px-2 font-semibold text-[11px] transition-colors',
                      active
                        ? 'bg-white text-slate-950'
                        : 'text-white/70 hover:bg-white/[0.12] hover:text-white',
                    )}
                    key={preset.id}
                    onClick={() => setSpeedPreset(preset.id)}
                    title={`Speed ${preset.key}: ${preset.label}`}
                    type="button"
                  >
                    {preset.key}
                  </button>
                )
              })}
            </div>

            <button
              aria-label={modeLabel}
              className="pointer-events-auto h-8 rounded-md border border-white/[0.12] bg-white/[0.08] px-3 font-medium text-[11px] text-white transition-colors hover:bg-white/[0.14]"
              onClick={toggleNavigationMode}
              title="Press M to switch walk/fly"
              type="button"
            >
              {navigationMode === 'walk' ? 'Walk' : 'Fly'}
            </button>

            <button
              aria-label={`Eye height: ${eyeHeight.label}`}
              className="pointer-events-auto h-8 rounded-md border border-white/[0.12] bg-white/[0.08] px-3 font-medium text-[11px] text-white transition-colors hover:bg-white/[0.14]"
              onClick={toggleEyeHeight}
              type="button"
            >
              {eyeHeight.label} {eyeHeight.height.toFixed(2)}m
            </button>

            <span className="sr-only" aria-live="polite">
              {activeSpeedDescription}
            </span>
          </div>
        </div>
      ) : null}
    </>
  )
}

function PresentationControls({
  onExitPresentation,
  onStopTour,
  tourStatus,
}: {
  onExitPresentation: () => void
  onStopTour: () => void
  tourStatus: FirstPersonTourStatus
}) {
  return (
    <div className="fixed right-4 bottom-5 z-50 flex items-center gap-2">
      {tourStatus.active ? (
        <button
          className="h-8 rounded-md border border-white/15 bg-slate-950/65 px-3 font-medium text-[11px] text-white shadow-lg backdrop-blur-md transition-colors hover:bg-slate-900"
          onClick={onStopTour}
          type="button"
        >
          Stop tour
        </button>
      ) : null}
      <button
        className="h-8 rounded-md border border-white/15 bg-slate-950/65 px-3 font-medium text-[11px] text-white shadow-lg backdrop-blur-md transition-colors hover:bg-slate-900"
        onClick={onExitPresentation}
        type="button"
      >
        Exit presentation
      </button>
    </div>
  )
}

function TouchMovePad() {
  const pointerIdRef = useRef<number | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const clearMove = useCallback(() => {
    pointerIdRef.current = null
    setKnob({ x: 0, y: 0 })
    dispatchVirtualMove({ x: 0, z: 0 })
  }, [])

  const updateMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const radius = Math.min(rect.width, rect.height) / 2
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const rawX = event.clientX - centerX
    const rawY = event.clientY - centerY
    const distance = Math.hypot(rawX, rawY)
    const scale = distance > radius ? radius / distance : 1
    const knobX = rawX * scale
    const knobY = rawY * scale

    setKnob({ x: knobX, y: knobY })
    dispatchVirtualMove({
      x: knobX / radius,
      z: -knobY / radius,
    })
  }, [])

  return (
    <div
      aria-label="Touch move"
      className="pointer-events-auto fixed bottom-24 left-5 z-50 h-24 w-24 rounded-full border border-white/15 bg-slate-950/35 shadow-xl backdrop-blur-md touch-none lg:hidden"
      onPointerCancel={clearMove}
      onPointerDown={(event) => {
        pointerIdRef.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        updateMove(event)
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) return
        updateMove(event)
      }}
      onPointerUp={(event) => {
        if (pointerIdRef.current !== event.pointerId) return
        clearMove()
      }}
      role="application"
    >
      <div
        className="absolute top-1/2 left-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/70 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  )
}

function FirstPersonNavigationPanel({
  bookmarks,
  currentZone,
  navigationData,
  onDeleteBookmark,
  onSaveBookmark,
  onSelectBookmark,
  onSelectZone,
  onStartTour,
  onStopTour,
  onTogglePresentation,
  pose,
  tourRouteLength,
  tourStatus,
}: {
  bookmarks: FirstPersonBookmark[]
  currentZone: ZoneNode | null
  navigationData: FirstPersonNavigationData
  onDeleteBookmark: (bookmarkId: string) => void
  onSaveBookmark: () => void
  onSelectBookmark: (pose: FirstPersonPose) => void
  onSelectZone: (zoneId: string) => void
  onStartTour: () => void
  onStopTour: () => void
  onTogglePresentation: () => void
  pose: FirstPersonPose | null
  tourRouteLength: number
  tourStatus: FirstPersonTourStatus
}) {
  const visibleZones = navigationData.zones.slice(0, 7)

  return (
    <div className="pointer-events-none fixed top-16 right-4 z-40 hidden w-64 text-white lg:block">
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-white/15 bg-slate-950/75 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div>
            <div className="font-semibold text-xs">Map</div>
            <div className="mt-0.5 text-[10px] text-white/50">Floor follow on</div>
          </div>
          <button
            className="h-7 rounded-md border border-white/[0.12] bg-white/[0.08] px-2 font-medium text-[11px] text-white transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!pose}
            onClick={onSaveBookmark}
            type="button"
          >
            Save view
          </button>
        </div>

        <div className="flex items-center gap-1 px-3 pb-3">
          <button
            className="h-7 flex-1 rounded-md border border-white/[0.12] bg-white/[0.08] px-2 font-medium text-[11px] text-white transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={tourRouteLength === 0}
            onClick={tourStatus.active ? onStopTour : onStartTour}
            type="button"
          >
            {tourStatus.active ? 'Stop tour' : 'Start tour'}
          </button>
          <button
            className="h-7 rounded-md border border-white/[0.12] bg-white/[0.08] px-2 font-medium text-[11px] text-white transition-colors hover:bg-white/[0.14]"
            onClick={onTogglePresentation}
            type="button"
          >
            Present
          </button>
        </div>

        <FirstPersonMiniMap
          currentZone={currentZone}
          navigationData={navigationData}
          onSelectZone={onSelectZone}
          pose={pose}
        />

        <div className="border-white/10 border-t px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-[11px] text-white/80">Rooms</div>
            <div className="truncate text-[10px] text-white/45">
              {currentZone?.name ?? 'Current view'}
            </div>
          </div>

          <div className="mt-2 flex max-h-28 flex-col gap-1 overflow-auto pr-1">
            {visibleZones.length > 0 ? (
              visibleZones.map((zone) => {
                const active = zone.id === currentZone?.id
                return (
                  <button
                    className={cn(
                      'flex h-7 items-center gap-2 rounded-md px-2 text-left text-[11px] transition-colors',
                      active
                        ? 'bg-white text-slate-950'
                        : 'bg-white/[0.07] text-white/75 hover:bg-white/[0.13] hover:text-white',
                    )}
                    key={zone.id}
                    onClick={() => onSelectZone(zone.id)}
                    title={`Go to ${zone.name}`}
                    type="button"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: zone.color }}
                    />
                    <span className="truncate">{zone.name}</span>
                  </button>
                )
              })
            ) : (
              <div className="rounded-md bg-white/[0.06] px-2 py-2 text-[11px] text-white/45">
                No rooms
              </div>
            )}
          </div>
        </div>

        <div className="border-white/10 border-t px-3 py-2">
          <div className="font-semibold text-[11px] text-white/80">Saved views</div>
          <div className="mt-2 flex max-h-24 flex-col gap-1 overflow-auto pr-1">
            {bookmarks.length > 0 ? (
              bookmarks.map((bookmark, index) => (
                <div
                  className="flex h-7 items-center rounded-md bg-white/[0.07] text-[11px] text-white/75 transition-colors hover:bg-white/[0.13] hover:text-white"
                  key={bookmark.id}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center justify-between px-2 text-left"
                    onClick={() => onSelectBookmark(bookmark)}
                    type="button"
                  >
                    <span className="truncate">{bookmark.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-white/40">{index + 1}</span>
                  </button>
                  <button
                    aria-label="Remove"
                    className="h-7 w-7 shrink-0 text-white/35 transition-colors hover:text-white/80"
                    onClick={() => onDeleteBookmark(bookmark.id)}
                    title="Remove"
                    type="button"
                  >
                    x
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-md bg-white/[0.06] px-2 py-2 text-[11px] text-white/45">
                No saved views
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FirstPersonMiniMap({
  currentZone,
  navigationData,
  onSelectZone,
  pose,
}: {
  currentZone: ZoneNode | null
  navigationData: FirstPersonNavigationData
  onSelectZone: (zoneId: string) => void
  pose: FirstPersonPose | null
}) {
  const bounds = useMemo(
    () => getNavigationBounds(navigationData.walls, navigationData.zones, pose),
    [navigationData.walls, navigationData.zones, pose],
  )

  if (!bounds) {
    return (
      <div className="mx-3 mb-3 flex h-[140px] items-center justify-center rounded-md bg-white/[0.06] text-[11px] text-white/45">
        No map data
      </div>
    )
  }

  const worldWidth = bounds.maxX - bounds.minX
  const worldDepth = bounds.maxZ - bounds.minZ
  const scale = Math.min(
    (MINIMAP_WIDTH - MINIMAP_PADDING * 2) / worldWidth,
    (MINIMAP_HEIGHT - MINIMAP_PADDING * 2) / worldDepth,
  )
  const offsetX = (MINIMAP_WIDTH - worldWidth * scale) / 2
  const offsetY = (MINIMAP_HEIGHT - worldDepth * scale) / 2
  const project = (x: number, z: number) => ({
    x: offsetX + (x - bounds.minX) * scale,
    y: MINIMAP_HEIGHT - offsetY - (z - bounds.minZ) * scale,
  })
  const cameraPoint = pose ? project(pose.x, pose.z) : null
  const cameraForward = pose
    ? project(pose.x - Math.sin(pose.yaw) * 0.85, pose.z - Math.cos(pose.yaw) * 0.85)
    : null

  return (
    <svg
      aria-label="Map"
      className="mx-3 mb-3 block rounded-md border border-white/10 bg-white/[0.06]"
      height={MINIMAP_HEIGHT}
      role="img"
      viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
      width={MINIMAP_WIDTH}
    >
      {navigationData.zones.map((zone) => {
        const active = zone.id === currentZone?.id
        const points = zone.polygon.map(([x, z]) => {
          const point = project(x, z)
          return `${point.x},${point.y}`
        })

        return (
          <polygon
            fill={zone.color}
            fillOpacity={active ? 0.38 : 0.18}
            key={zone.id}
            onClick={() => onSelectZone(zone.id)}
            points={points.join(' ')}
            stroke={active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.28)'}
            strokeWidth={active ? 1.8 : 1}
            style={{ cursor: 'pointer' }}
          />
        )
      })}

      {navigationData.walls.map((wall) => {
        const start = project(wall.sx, wall.sz)
        const end = project(wall.ex, wall.ez)
        return (
          <line
            key={wall.id}
            stroke="rgba(255,255,255,0.5)"
            strokeLinecap="round"
            strokeWidth={1.5}
            x1={start.x}
            x2={end.x}
            y1={start.y}
            y2={end.y}
          />
        )
      })}

      {cameraPoint && cameraForward ? (
        <>
          <line
            stroke="white"
            strokeLinecap="round"
            strokeWidth={2}
            x1={cameraPoint.x}
            x2={cameraForward.x}
            y1={cameraPoint.y}
            y2={cameraForward.y}
          />
          <circle
            cx={cameraPoint.x}
            cy={cameraPoint.y}
            fill="#0f172a"
            r={4}
            stroke="white"
            strokeWidth={2}
          />
        </>
      ) : null}
    </svg>
  )
}

function HudHint({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-medium text-[10px] text-white/50">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((key) => (
          <kbd
            className="flex h-5 min-w-5 items-center justify-center rounded border border-white/15 bg-white/10 px-1 font-mono text-[10px] text-white/75 leading-none"
            key={key}
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}
