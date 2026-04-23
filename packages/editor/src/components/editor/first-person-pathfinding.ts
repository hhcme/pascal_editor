export type PathPoint = {
  x: number
  z: number
}

export type PathDoorOpening = {
  leftT: number
  rightT: number
}

export type PathWallSegment = {
  sx: number
  sz: number
  ex: number
  ez: number
  openings: PathDoorOpening[]
}

export type PlanWalkPathOptions = {
  start: PathPoint
  end: PathPoint
  walls: readonly PathWallSegment[]
  boundsPoints?: readonly PathPoint[]
  gridStep?: number
  clearance?: number
  maxNodes?: number
}

type GridNode = {
  f: number
  g: number
  h: number
  key: string
  parent: string | null
  x: number
  z: number
}

const DEFAULT_GRID_STEP = 0.45
const DEFAULT_CLEARANCE = 0.34
const DEFAULT_MAX_NODES = 8000
const BOUNDS_PADDING = 1.6
const EPSILON = 1e-9

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function pointKey(col: number, row: number) {
  return `${col},${row}`
}

function parsePointKey(key: string) {
  const [col, row] = key.split(',').map(Number)
  return { col: col ?? 0, row: row ?? 0 }
}

function isWallOpening(wall: PathWallSegment, t: number) {
  return wall.openings.some((opening) => t >= opening.leftT && t <= opening.rightT)
}

function pointToSegmentDistanceT(point: PathPoint, wall: PathWallSegment) {
  const dx = wall.ex - wall.sx
  const dz = wall.ez - wall.sz
  const lengthSq = dx * dx + dz * dz

  if (lengthSq < EPSILON) {
    return { distance: Math.hypot(point.x - wall.sx, point.z - wall.sz), t: 0 }
  }

  const t = clamp01(((point.x - wall.sx) * dx + (point.z - wall.sz) * dz) / lengthSq)
  const closestX = wall.sx + dx * t
  const closestZ = wall.sz + dz * t

  return { distance: Math.hypot(point.x - closestX, point.z - closestZ), t }
}

function wallIntersectionT(from: PathPoint, to: PathPoint, wall: PathWallSegment) {
  const rx = to.x - from.x
  const rz = to.z - from.z
  const sx = wall.ex - wall.sx
  const sz = wall.ez - wall.sz
  const denominator = rx * sz - rz * sx

  if (Math.abs(denominator) < EPSILON) return null

  const qpx = wall.sx - from.x
  const qpz = wall.sz - from.z
  const moveT = (qpx * sz - qpz * sx) / denominator
  const wallT = (qpx * rz - qpz * rx) / denominator

  if (moveT < 0 || moveT > 1 || wallT < 0 || wallT > 1) return null
  return wallT
}

function isPointBlocked(point: PathPoint, walls: readonly PathWallSegment[], clearance: number) {
  for (const wall of walls) {
    const nearest = pointToSegmentDistanceT(point, wall)
    if (nearest.distance < clearance && !isWallOpening(wall, nearest.t)) {
      return true
    }
  }

  return false
}

function isSegmentBlocked(
  from: PathPoint,
  to: PathPoint,
  walls: readonly PathWallSegment[],
  clearance: number,
) {
  for (const wall of walls) {
    const intersectionT = wallIntersectionT(from, to, wall)
    if (intersectionT !== null && !isWallOpening(wall, intersectionT)) {
      return true
    }
  }

  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  const sampleCount = Math.max(1, Math.ceil(distance / Math.max(clearance * 0.75, 0.12)))

  for (let index = 1; index <= sampleCount; index += 1) {
    const t = index / sampleCount
    const point = {
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
    }
    if (isPointBlocked(point, walls, clearance)) {
      return true
    }
  }

  return false
}

function getBounds(
  start: PathPoint,
  end: PathPoint,
  walls: readonly PathWallSegment[],
  extraPoints: readonly PathPoint[],
) {
  let minX = Math.min(start.x, end.x)
  let maxX = Math.max(start.x, end.x)
  let minZ = Math.min(start.z, end.z)
  let maxZ = Math.max(start.z, end.z)

  for (const wall of walls) {
    minX = Math.min(minX, wall.sx, wall.ex)
    maxX = Math.max(maxX, wall.sx, wall.ex)
    minZ = Math.min(minZ, wall.sz, wall.ez)
    maxZ = Math.max(maxZ, wall.sz, wall.ez)
  }

  for (const point of extraPoints) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }

  return {
    minX: minX - BOUNDS_PADDING,
    maxX: maxX + BOUNDS_PADDING,
    minZ: minZ - BOUNDS_PADDING,
    maxZ: maxZ + BOUNDS_PADDING,
  }
}

function smoothPath(
  path: PathPoint[],
  walls: readonly PathWallSegment[],
  clearance: number,
): PathPoint[] {
  if (path.length <= 2) return path

  const smoothed: PathPoint[] = [path[0]!]
  let currentIndex = 0

  while (currentIndex < path.length - 1) {
    let nextIndex = path.length - 1
    while (
      nextIndex > currentIndex + 1 &&
      isSegmentBlocked(path[currentIndex]!, path[nextIndex]!, walls, clearance)
    ) {
      nextIndex -= 1
    }

    smoothed.push(path[nextIndex]!)
    currentIndex = nextIndex
  }

  return smoothed
}

class MinHeap {
  private items: GridNode[] = []

  get size() {
    return this.items.length
  }

  push(node: GridNode) {
    this.items.push(node)
    this.bubbleUp(this.items.length - 1)
  }

  pop() {
    const first = this.items[0]
    const last = this.items.pop()
    if (!first || !last) return first ?? null
    if (this.items.length > 0) {
      this.items[0] = last
      this.sinkDown(0)
    }
    return first
  }

  private bubbleUp(index: number) {
    let currentIndex = index
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2)
      const current = this.items[currentIndex]!
      const parent = this.items[parentIndex]!
      if (current.f >= parent.f) break
      this.items[currentIndex] = parent
      this.items[parentIndex] = current
      currentIndex = parentIndex
    }
  }

  private sinkDown(index: number) {
    let currentIndex = index

    while (true) {
      const leftIndex = currentIndex * 2 + 1
      const rightIndex = leftIndex + 1
      let smallestIndex = currentIndex

      if (this.items[leftIndex] && this.items[leftIndex]!.f < this.items[smallestIndex]!.f) {
        smallestIndex = leftIndex
      }
      if (this.items[rightIndex] && this.items[rightIndex]!.f < this.items[smallestIndex]!.f) {
        smallestIndex = rightIndex
      }
      if (smallestIndex === currentIndex) break

      const current = this.items[currentIndex]!
      this.items[currentIndex] = this.items[smallestIndex]!
      this.items[smallestIndex] = current
      currentIndex = smallestIndex
    }
  }
}

export function planWalkPath(options: PlanWalkPathOptions): PathPoint[] | null {
  const clearance = options.clearance ?? DEFAULT_CLEARANCE
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES

  if (options.walls.length === 0) {
    return [options.start, options.end]
  }

  if (!isSegmentBlocked(options.start, options.end, options.walls, clearance)) {
    return [options.start, options.end]
  }

  const bounds = getBounds(options.start, options.end, options.walls, options.boundsPoints ?? [])
  const width = Math.max(bounds.maxX - bounds.minX, 1)
  const depth = Math.max(bounds.maxZ - bounds.minZ, 1)
  const requestedStep = options.gridStep ?? DEFAULT_GRID_STEP
  const estimatedNodes = Math.ceil(width / requestedStep) * Math.ceil(depth / requestedStep)
  const gridStep =
    estimatedNodes > maxNodes ? requestedStep * Math.sqrt(estimatedNodes / maxNodes) : requestedStep
  const cols = Math.ceil(width / gridStep) + 1
  const rows = Math.ceil(depth / gridStep) + 1

  const pointToCell = (point: PathPoint) => ({
    col: Math.max(0, Math.min(cols - 1, Math.round((point.x - bounds.minX) / gridStep))),
    row: Math.max(0, Math.min(rows - 1, Math.round((point.z - bounds.minZ) / gridStep))),
  })
  const cellToPoint = (col: number, row: number): PathPoint => ({
    x: bounds.minX + col * gridStep,
    z: bounds.minZ + row * gridStep,
  })
  const blockedCache = new Map<string, boolean>()
  const isCellBlocked = (col: number, row: number) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return true
    const key = pointKey(col, row)
    const cached = blockedCache.get(key)
    if (cached !== undefined) return cached
    const blocked = isPointBlocked(cellToPoint(col, row), options.walls, clearance)
    blockedCache.set(key, blocked)
    return blocked
  }
  const nearestFreeCell = (point: PathPoint) => {
    const origin = pointToCell(point)
    for (let radius = 0; radius <= Math.max(cols, rows); radius += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        for (let dr = -radius; dr <= radius; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue
          const col = origin.col + dc
          const row = origin.row + dr
          if (!isCellBlocked(col, row)) return { col, row }
        }
      }
    }
    return null
  }

  const startCell = nearestFreeCell(options.start)
  const endCell = nearestFreeCell(options.end)
  if (!startCell || !endCell) return null

  const startKey = pointKey(startCell.col, startCell.row)
  const endKey = pointKey(endCell.col, endCell.row)
  const open = new MinHeap()
  const visited = new Set<string>()
  const best = new Map<string, GridNode>()
  const endPoint = cellToPoint(endCell.col, endCell.row)
  const heuristic = (point: PathPoint) => Math.hypot(endPoint.x - point.x, endPoint.z - point.z)
  const startPoint = cellToPoint(startCell.col, startCell.row)
  const startNode: GridNode = {
    f: heuristic(startPoint),
    g: 0,
    h: heuristic(startPoint),
    key: startKey,
    parent: null,
    x: startPoint.x,
    z: startPoint.z,
  }

  open.push(startNode)
  best.set(startKey, startNode)

  const neighbors = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ] as const

  while (open.size > 0) {
    const current = open.pop()
    if (!current) break
    if (visited.has(current.key)) continue
    visited.add(current.key)

    if (current.key === endKey) {
      const points: PathPoint[] = []
      let cursor: GridNode | undefined = current
      while (cursor) {
        points.push({ x: cursor.x, z: cursor.z })
        cursor = cursor.parent ? best.get(cursor.parent) : undefined
      }
      points.reverse()
      points[0] = options.start
      points[points.length - 1] = options.end
      return smoothPath(points, options.walls, clearance)
    }

    const { col, row } = parsePointKey(current.key)
    for (const [dc, dr] of neighbors) {
      const nextCol = col + dc
      const nextRow = row + dr
      if (isCellBlocked(nextCol, nextRow)) continue

      if (dc !== 0 && dr !== 0) {
        if (isCellBlocked(col + dc, row) && isCellBlocked(col, row + dr)) continue
      }

      const nextPoint = cellToPoint(nextCol, nextRow)
      if (isSegmentBlocked({ x: current.x, z: current.z }, nextPoint, options.walls, clearance)) {
        continue
      }

      const nextKey = pointKey(nextCol, nextRow)
      if (visited.has(nextKey)) continue

      const cost = Math.hypot(dc, dr) * gridStep
      const nextG = current.g + cost
      const previous = best.get(nextKey)
      if (previous && previous.g <= nextG) continue

      const h = heuristic(nextPoint)
      const node: GridNode = {
        f: nextG + h,
        g: nextG,
        h,
        key: nextKey,
        parent: current.key,
        x: nextPoint.x,
        z: nextPoint.z,
      }
      best.set(nextKey, node)
      open.push(node)
    }
  }

  return null
}
