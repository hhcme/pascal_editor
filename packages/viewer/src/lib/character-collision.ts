import { getScaledDimensions, type ItemNode } from '@pascal-app/core'

export type CharacterDoorOpening = {
  leftT: number
  rightT: number
}

export type CharacterCollisionSegment = {
  ex: number
  ez: number
  id?: string
  length: number
  openings: CharacterDoorOpening[]
  sx: number
  sz: number
}

export type CharacterCollisionObstacle = {
  halfDepth: number
  halfWidth: number
  id?: string
  rotation: number
  x: number
  z: number
}

export type CharacterWaterArea = {
  id?: string
  polygon: Array<[number, number]>
  surfaceY: number
}

export type CharacterCollisionMap = {
  obstacles: CharacterCollisionObstacle[]
  waterAreas: CharacterWaterArea[]
  walls: CharacterCollisionSegment[]
}

type SceneNodeLike = {
  asset?: ItemNode['asset']
  end?: [number, number]
  elevation?: number
  height?: number
  id: string
  material?: {
    color?: string
    opacity?: number
    roughness?: number
    metalness?: number
  }
  materialPreset?: string
  metadata?: Record<string, unknown>
  name?: string
  parentId?: string | null
  position?: [number, number, number]
  polygon?: Array<[number, number]>
  rotation?: [number, number, number]
  scale?: [number, number, number]
  start?: [number, number]
  thickness?: number
  type: string
  visible?: boolean
  wallId?: string
  width?: number
}

const CHARACTER_COLLISION_RADIUS = 0.3
const DOOR_OPENING_PADDING = 0.16
const MIN_WALL_LENGTH = 0.001
const MIN_OBSTACLE_SIZE = 0.12
const WATER_NAME_PATTERN =
  /水面|水体|水域|水景|水池|池塘|泳池|游泳池|喷泉|河道|河面|湖面|湖泊|海面|溪流|渠道|water|river|lake|sea|ocean|pond|pool|canal/i

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function wallLength(wall: SceneNodeLike) {
  if (!(wall.start && wall.end)) return 0
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

function isTransientNode(node: SceneNodeLike) {
  return node.metadata?.isTransient === true
}

function normalizeColor(value: string | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isBlueWaterLikeColor(color: string) {
  if (!color.startsWith('#')) return false
  const hex = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false

  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return blue > 130 && green > 110 && blue > red + 24
}

function isWaterNode(node: SceneNodeLike) {
  if (node.type !== 'slab' || node.visible === false || !node.polygon?.length) return false

  const metadata = node.metadata ?? {}
  if (metadata.water === true || metadata.isWater === true || metadata.role === 'water') return true

  const name = typeof node.name === 'string' ? node.name : typeof metadata.name === 'string' ? metadata.name : ''
  const label = [
    name,
    typeof metadata.role === 'string' ? metadata.role : '',
    typeof metadata.detailKey === 'string' ? metadata.detailKey : '',
    typeof node.materialPreset === 'string' ? node.materialPreset : '',
  ].join(' ')
  if (WATER_NAME_PATTERN.test(label)) return true

  const color = normalizeColor(node.material?.color)
  const opacity = typeof node.material?.opacity === 'number' ? node.material.opacity : 1
  return opacity < 0.65 && isBlueWaterLikeColor(color)
}

function pointInPolygon(x: number, z: number, polygon: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i]
    const previous = polygon[j]
    if (!(current && previous)) continue
    const xi = current[0]
    const zi = current[1]
    const xj = previous[0]
    const zj = previous[1]
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export function getCharacterWaterAreaAt(
  x: number,
  z: number,
  collision: CharacterCollisionMap,
): CharacterWaterArea | null {
  return collision.waterAreas.find((area) => pointInPolygon(x, z, area.polygon)) ?? null
}

function isWallOpening(wall: CharacterCollisionSegment, t: number) {
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
  wall: CharacterCollisionSegment,
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

function toObstacleLocal(
  x: number,
  z: number,
  obstacle: CharacterCollisionObstacle,
) {
  const dx = x - obstacle.x
  const dz = z - obstacle.z
  const cos = Math.cos(-obstacle.rotation)
  const sin = Math.sin(-obstacle.rotation)

  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  }
}

function isPointInsideObstacle(
  x: number,
  z: number,
  obstacle: CharacterCollisionObstacle,
  clearance: number,
) {
  const local = toObstacleLocal(x, z, obstacle)
  return (
    Math.abs(local.x) <= obstacle.halfWidth + clearance &&
    Math.abs(local.z) <= obstacle.halfDepth + clearance
  )
}

function segmentIntersectsExpandedObstacle(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  obstacle: CharacterCollisionObstacle,
  clearance: number,
) {
  const from = toObstacleLocal(fromX, fromZ, obstacle)
  const to = toObstacleLocal(toX, toZ, obstacle)
  const minX = -obstacle.halfWidth - clearance
  const maxX = obstacle.halfWidth + clearance
  const minZ = -obstacle.halfDepth - clearance
  const maxZ = obstacle.halfDepth + clearance
  const dx = to.x - from.x
  const dz = to.z - from.z
  let tMin = 0
  let tMax = 1

  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > tMax) return false
      if (r > tMin) tMin = r
      return true
    }
    if (r < tMin) return false
    if (r < tMax) tMax = r
    return true
  }

  return (
    clip(-dx, from.x - minX) &&
    clip(dx, maxX - from.x) &&
    clip(-dz, from.z - minZ) &&
    clip(dz, maxZ - from.z)
  )
}

export function isCharacterMovementBlocked(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  collision: CharacterCollisionMap,
  clearance = CHARACTER_COLLISION_RADIUS,
) {
  if (Math.hypot(toX - fromX, toZ - fromZ) < 1e-6) return false

  for (const wall of collision.walls) {
    const intersectionT = wallIntersectionT(fromX, fromZ, toX, toZ, wall)
    if (intersectionT !== null && !isWallOpening(wall, intersectionT)) {
      return true
    }

    const next = pointToSegmentDistanceT(toX, toZ, wall.sx, wall.sz, wall.ex, wall.ez)
    const previous = pointToSegmentDistanceT(fromX, fromZ, wall.sx, wall.sz, wall.ex, wall.ez)
    if (
      next.distance < clearance &&
      !isWallOpening(wall, next.t) &&
      (previous.distance >= clearance || next.distance < previous.distance - 0.01)
    ) {
      return true
    }
  }

  for (const obstacle of collision.obstacles) {
    if (isPointInsideObstacle(toX, toZ, obstacle, clearance)) {
      return true
    }

    if (segmentIntersectsExpandedObstacle(fromX, fromZ, toX, toZ, obstacle, clearance)) {
      return true
    }
  }

  return false
}

export function resolveCharacterWalkPosition(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  collision: CharacterCollisionMap,
  canPenetrate = false,
) {
  if (canPenetrate || !isCharacterMovementBlocked(fromX, fromZ, toX, toZ, collision)) {
    return { x: toX, z: toZ }
  }

  if (!isCharacterMovementBlocked(fromX, fromZ, toX, fromZ, collision)) {
    return { x: toX, z: fromZ }
  }

  if (!isCharacterMovementBlocked(fromX, fromZ, fromX, toZ, collision)) {
    return { x: fromX, z: toZ }
  }

  return { x: fromX, z: fromZ }
}

function maybeAddItemObstacle(obstacles: CharacterCollisionObstacle[], node: SceneNodeLike) {
  if (node.type !== 'item' || node.visible === false || !node.asset) return
  if (node.asset.attachTo === 'wall' || node.asset.attachTo === 'wall-side' || node.asset.attachTo === 'ceiling') {
    return
  }

  const item = node as ItemNode
  const [width, height, depth] = getScaledDimensions(item)
  if (height < 0.18) return

  const halfWidth = Math.max(width / 2, MIN_OBSTACLE_SIZE)
  const halfDepth = Math.max(depth / 2, MIN_OBSTACLE_SIZE)
  obstacles.push({
    id: node.id,
    x: node.position?.[0] ?? 0,
    z: node.position?.[2] ?? 0,
    rotation: node.rotation?.[1] ?? 0,
    halfWidth,
    halfDepth,
  })
}

function maybeAddFenceObstacle(
  walls: CharacterCollisionSegment[],
  obstacles: CharacterCollisionObstacle[],
  node: SceneNodeLike,
) {
  if (node.type !== 'fence' || node.visible === false || !(node.start && node.end)) return
  const length = wallLength(node)
  if (length < MIN_WALL_LENGTH) return

  walls.push({
    id: node.id,
    sx: node.start[0],
    sz: node.start[1],
    ex: node.end[0],
    ez: node.end[1],
    length,
    openings: [],
  })

  const centerX = (node.start[0] + node.end[0]) / 2
  const centerZ = (node.start[1] + node.end[1]) / 2
  obstacles.push({
    id: node.id,
    x: centerX,
    z: centerZ,
    rotation: Math.atan2(node.end[1] - node.start[1], node.end[0] - node.start[0]),
    halfWidth: length / 2,
    halfDepth: Math.max((node.thickness ?? 0.08) / 2, MIN_OBSTACLE_SIZE),
  })
}

export function buildCharacterCollisionMap(
  rawNodes: Record<string, unknown>,
  activeLevelId?: string | null,
): CharacterCollisionMap {
  const nodes = rawNodes as Record<string, SceneNodeLike>
  const doorsByWallId = new Map<string, SceneNodeLike[]>()

  for (const node of Object.values(nodes)) {
    if (node?.type !== 'door' || node.visible === false || isTransientNode(node)) continue
    const wallId = node.wallId ?? node.parentId
    if (!wallId) continue
    const doors = doorsByWallId.get(wallId) ?? []
    doors.push(node)
    doorsByWallId.set(wallId, doors)
  }

  const walls: CharacterCollisionSegment[] = []
  const obstacles: CharacterCollisionObstacle[] = []
  const waterAreas: CharacterWaterArea[] = []

  for (const node of Object.values(nodes)) {
    if (!node || node.visible === false || isTransientNode(node)) continue
    if (activeLevelId && node.parentId !== activeLevelId) continue

    if (node.type === 'wall') {
      const length = wallLength(node)
      if (!(node.start && node.end) || length < MIN_WALL_LENGTH) continue

      const openings = (doorsByWallId.get(node.id) ?? []).map((door) => {
        const doorX = door.position?.[0] ?? 0
        const doorWidth = door.width ?? 0.9
        return {
          leftT: clamp01((doorX - doorWidth / 2 - DOOR_OPENING_PADDING) / length),
          rightT: clamp01((doorX + doorWidth / 2 + DOOR_OPENING_PADDING) / length),
        }
      })

      walls.push({
        id: node.id,
        sx: node.start[0],
        sz: node.start[1],
        ex: node.end[0],
        ez: node.end[1],
        length,
        openings,
      })
      continue
    }

    if (isWaterNode(node)) {
      const position = node.position ?? [0, 0, 0]
      waterAreas.push({
        id: node.id,
        polygon: node.polygon!.map(([x, z]) => [x + position[0], z + position[2]]),
        surfaceY: position[1] + Math.max(node.elevation ?? 0, 0),
      })
      continue
    }

    maybeAddFenceObstacle(walls, obstacles, node)
    maybeAddItemObstacle(obstacles, node)
  }

  return { obstacles, walls, waterAreas }
}
