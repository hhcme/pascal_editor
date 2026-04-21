import {
  type AnyNode,
  type AnyNodeId,
  type DoorNode,
  getEffectiveWallSurfaceMaterial,
  getScaledDimensions,
  getWallSurfaceMaterialSignature,
  type ItemNode,
  useScene,
  type WallNode,
  WallNode as WallSchema,
  type WindowNode,
} from '@pascal-app/core'
import {
  snapScalarToGrid,
  WALL_GRID_STEP,
  WALL_JOIN_SNAP_RADIUS,
  WALL_MIN_LENGTH,
  type WallPlanPoint,
} from './wall-drafting'

export type WallEditOperation = 'trim-extend' | 'split' | 'merge' | 'offset' | 'fillet'

export type WallTrimCandidate = {
  wallId: WallNode['id']
  keepStart: WallPlanPoint
  keepEnd: WallPlanPoint
  removedStart: WallPlanPoint
  removedEnd: WallPlanPoint
}

export type WallOffsetPreview = {
  wallId: WallNode['id']
  start: WallPlanPoint
  end: WallPlanPoint
  distance: number
}

export type WallFilletPreview = {
  wallIds: [WallNode['id'], WallNode['id']]
  radius: number
  points: WallPlanPoint[]
}

export type WallEditPlan = {
  created?: Array<{ node: WallNode; parentId?: AnyNodeId }>
  updated?: Array<{ id: AnyNodeId; data: Partial<AnyNode> }>
  deleted?: AnyNodeId[]
  selectIds?: AnyNodeId[]
  dirtyIds?: AnyNodeId[]
}

export type WallEditResult =
  | {
      ok: true
      plan: WallEditPlan
      message?: string
      preview?: WallOffsetPreview | WallFilletPreview | WallTrimCandidate
    }
  | {
      ok: false
      reason: string
    }

type WallEndpoint = 'start' | 'end'
type WallAttachmentUpdate = { id: AnyNodeId; data: Partial<AnyNode>; targetWallId: WallNode['id'] }
type WallParamRange = { min: number; max: number }

const EPSILON = 1e-6
const ATTACHMENT_TOLERANCE = 1e-4
const DEFAULT_OFFSET_DISTANCE = WALL_GRID_STEP
const DEFAULT_FILLET_RADIUS = 0.5
const FILLET_SEGMENT_TARGET_LENGTH = 0.35
const MAX_FILLET_SEGMENTS = 12

function add(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] + b[0], a[1] + b[1]]
}

function subtract(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

function scale(point: WallPlanPoint, scalar: number): WallPlanPoint {
  return [point[0] * scalar, point[1] * scalar]
}

function dot(a: WallPlanPoint, b: WallPlanPoint): number {
  return a[0] * b[0] + a[1] * b[1]
}

function cross(a: WallPlanPoint, b: WallPlanPoint): number {
  return a[0] * b[1] - a[1] * b[0]
}

function distance(a: WallPlanPoint, b: WallPlanPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function pointsEqual(a: WallPlanPoint, b: WallPlanPoint, tolerance = EPSILON): boolean {
  return distance(a, b) <= tolerance
}

function wallLength(wall: Pick<WallNode, 'start' | 'end'>): number {
  return distance(wall.start, wall.end)
}

function getWallDirection(wall: Pick<WallNode, 'start' | 'end'>): WallPlanPoint | null {
  const length = wallLength(wall)
  if (length <= EPSILON) {
    return null
  }

  return [(wall.end[0] - wall.start[0]) / length, (wall.end[1] - wall.start[1]) / length]
}

function getWallNormal(wall: Pick<WallNode, 'start' | 'end'>): WallPlanPoint | null {
  const direction = getWallDirection(wall)
  return direction ? [-direction[1], direction[0]] : null
}

function pointAtWallParam(wall: Pick<WallNode, 'start' | 'end'>, t: number): WallPlanPoint {
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * t,
    wall.start[1] + (wall.end[1] - wall.start[1]) * t,
  ]
}

function getWallParamForPoint(wall: Pick<WallNode, 'start' | 'end'>, point: WallPlanPoint): number {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= EPSILON) {
    return 0
  }

  return ((point[0] - wall.start[0]) * dx + (point[1] - wall.start[1]) * dz) / lengthSquared
}

function getLineIntersection(
  a: Pick<WallNode, 'start' | 'end'>,
  b: Pick<WallNode, 'start' | 'end'>,
): { point: WallPlanPoint; tA: number; tB: number } | null {
  const r = subtract(a.end, a.start)
  const s = subtract(b.end, b.start)
  const denominator = cross(r, s)
  if (Math.abs(denominator) <= EPSILON) {
    return null
  }

  const offset = subtract(b.start, a.start)
  const tA = cross(offset, s) / denominator
  const tB = cross(offset, r) / denominator
  return { point: add(a.start, scale(r, tA)), tA, tB }
}

function normalizeAngleDelta(angle: number): number {
  let nextAngle = angle
  while (nextAngle <= -Math.PI) {
    nextAngle += Math.PI * 2
  }
  while (nextAngle > Math.PI) {
    nextAngle -= Math.PI * 2
  }
  return nextAngle
}

function isEditableStraightWall(wall: WallNode): boolean {
  return Math.abs(wall.curveOffset ?? 0) <= EPSILON && wallLength(wall) > WALL_MIN_LENGTH
}

function uniqueSortedParams(values: number[]): number[] {
  return values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)
    .reduce<number[]>((result, value) => {
      const previous = result[result.length - 1]
      if (previous === undefined || Math.abs(previous - value) > 1e-5) {
        result.push(value)
      }
      return result
    }, [])
}

function cloneWall(
  source: WallNode,
  start: WallPlanPoint,
  end: WallPlanPoint,
  name?: string,
): WallNode {
  const { id: _id, parentId: _parentId, children: _children, ...rest } = source
  return WallSchema.parse({
    ...rest,
    name: name ?? source.name,
    curveOffset: undefined,
    start,
    end,
    children: [],
  })
}

function getEndpointAtPoint(wall: WallNode, point: WallPlanPoint): WallEndpoint | null {
  if (pointsEqual(wall.start, point)) {
    return 'start'
  }
  if (pointsEqual(wall.end, point)) {
    return 'end'
  }
  return null
}

function getSharedEndpoint(a: WallNode, b: WallNode): WallPlanPoint | null {
  for (const pointA of [a.start, a.end] as const) {
    for (const pointB of [b.start, b.end] as const) {
      if (pointsEqual(pointA, pointB)) {
        return pointA
      }
    }
  }
  return null
}

function getOtherEndpoint(wall: WallNode, endpoint: WallEndpoint): WallPlanPoint {
  return endpoint === 'start' ? wall.end : wall.start
}

function areWallStylesCompatible(a: WallNode, b: WallNode): boolean {
  const aInterior = getWallSurfaceMaterialSignature(getEffectiveWallSurfaceMaterial(a, 'interior'))
  const bInterior = getWallSurfaceMaterialSignature(getEffectiveWallSurfaceMaterial(b, 'interior'))
  const aExterior = getWallSurfaceMaterialSignature(getEffectiveWallSurfaceMaterial(a, 'exterior'))
  const bExterior = getWallSurfaceMaterialSignature(getEffectiveWallSurfaceMaterial(b, 'exterior'))

  return (
    (a.parentId ?? null) === (b.parentId ?? null) &&
    Math.abs((a.thickness ?? 0.2) - (b.thickness ?? 0.2)) <= EPSILON &&
    Math.abs((a.height ?? 2.5) - (b.height ?? 2.5)) <= EPSILON &&
    aInterior === bInterior &&
    aExterior === bExterior &&
    a.frontSide === b.frontSide &&
    a.backSide === b.backSide &&
    a.visible === b.visible
  )
}

function areWallsCollinearAcrossPoint(a: WallNode, b: WallNode, sharedPoint: WallPlanPoint) {
  const aEndpoint = getEndpointAtPoint(a, sharedPoint)
  const bEndpoint = getEndpointAtPoint(b, sharedPoint)
  if (!(aEndpoint && bEndpoint)) {
    return false
  }

  const aVector = subtract(getOtherEndpoint(a, aEndpoint), sharedPoint)
  const bVector = subtract(getOtherEndpoint(b, bEndpoint), sharedPoint)
  const aLength = Math.hypot(aVector[0], aVector[1])
  const bLength = Math.hypot(bVector[0], bVector[1])
  if (aLength <= EPSILON || bLength <= EPSILON) {
    return false
  }

  const normalizedCross = cross(aVector, bVector) / (aLength * bLength)
  const normalizedDot = dot(aVector, bVector) / (aLength * bLength)
  return Math.abs(normalizedCross) <= 1e-4 && normalizedDot < -0.999
}

function getWallAttachmentSpan(node: AnyNode): { min: number; max: number; center: number } | null {
  if (node.type === 'door') {
    const door = node as DoorNode
    return {
      min: door.position[0] - door.width / 2,
      max: door.position[0] + door.width / 2,
      center: door.position[0],
    }
  }

  if (node.type === 'window') {
    const windowNode = node as WindowNode
    return {
      min: windowNode.position[0] - windowNode.width / 2,
      max: windowNode.position[0] + windowNode.width / 2,
      center: windowNode.position[0],
    }
  }

  if (node.type === 'item') {
    const item = node as ItemNode
    if (item.asset.attachTo !== 'wall' && item.asset.attachTo !== 'wall-side') {
      return null
    }

    const [width] = getScaledDimensions(item)
    return {
      min: item.position[0] - width / 2,
      max: item.position[0] + width / 2,
      center: item.position[0],
    }
  }

  return null
}

function remapAttachmentToWall(
  node: AnyNode,
  nextWallId: WallNode['id'],
  nextLocalX: number,
  nextWallLength: number,
): Partial<AnyNode> | null {
  const clampedX = Math.max(0, Math.min(nextWallLength, nextLocalX))

  if (node.type === 'door' || node.type === 'window' || node.type === 'item') {
    const currentPosition = 'position' in node ? node.position : null
    if (!currentPosition) {
      return null
    }

    const nextPosition = [clampedX, currentPosition[1], currentPosition[2]] as typeof currentPosition
    return {
      parentId: nextWallId,
      wallId: nextWallId,
      position: nextPosition,
      ...('wallT' in node ? { wallT: nextWallLength > EPSILON ? clampedX / nextWallLength : 0 } : {}),
    } as Partial<AnyNode>
  }

  return null
}

function buildAttachmentUpdatesForEndpointChange(args: {
  wall: WallNode
  nextWallId?: WallNode['id']
  nextStart: WallPlanPoint
  nextEnd: WallPlanPoint
  keptRange: WallParamRange
  nodes: Record<AnyNodeId, AnyNode>
}): WallAttachmentUpdate[] | null {
  const { wall, nextWallId = wall.id, nextStart, nextEnd, keptRange, nodes } = args
  const direction = getWallDirection(wall)
  const nextLength = distance(nextStart, nextEnd)
  if (!direction || nextLength <= WALL_MIN_LENGTH) {
    return null
  }

  const nextStartOffset = dot(subtract(nextStart, wall.start), direction)
  const updates: WallAttachmentUpdate[] = []

  for (const childId of wall.children ?? []) {
    const childNode = nodes[childId as AnyNodeId]
    if (!childNode) {
      continue
    }

    const span = getWallAttachmentSpan(childNode)
    if (!span) {
      return null
    }

    if (
      span.min < keptRange.min - ATTACHMENT_TOLERANCE ||
      span.max > keptRange.max + ATTACHMENT_TOLERANCE
    ) {
      return null
    }

    const nextUpdate = remapAttachmentToWall(
      childNode,
      nextWallId,
      span.center - nextStartOffset,
      nextLength,
    )
    if (!nextUpdate) {
      return null
    }

    updates.push({ id: childNode.id as AnyNodeId, data: nextUpdate, targetWallId: nextWallId })
  }

  return updates
}

function getChildIdsForWall(updates: WallAttachmentUpdate[], wallId: WallNode['id']): WallNode['children'] {
  return updates
    .filter((update) => update.targetWallId === wallId)
    .map((update) => update.id) as WallNode['children']
}

function mergePlanChanges(...plans: WallEditPlan[]): WallEditPlan {
  return {
    created: plans.flatMap((plan) => plan.created ?? []),
    updated: plans.flatMap((plan) => plan.updated ?? []),
    deleted: plans.flatMap((plan) => plan.deleted ?? []),
    selectIds: plans.flatMap((plan) => plan.selectIds ?? []),
    dirtyIds: plans.flatMap((plan) => plan.dirtyIds ?? []),
  }
}

function buildEndpointChangePlan(args: {
  wall: WallNode
  nextStart: WallPlanPoint
  nextEnd: WallPlanPoint
  keptRange: WallParamRange
  nodes: Record<AnyNodeId, AnyNode>
}): WallEditResult {
  const { wall, nextStart, nextEnd, keptRange, nodes } = args
  const attachmentUpdates = buildAttachmentUpdatesForEndpointChange({
    wall,
    nextStart,
    nextEnd,
    keptRange,
    nodes,
  })

  if (!attachmentUpdates) {
    return { ok: false, reason: 'Wall openings or attached items block this edit.' }
  }

  return {
    ok: true,
    plan: {
      updated: [
        {
          id: wall.id as AnyNodeId,
          data: {
            start: nextStart,
            end: nextEnd,
            children: getChildIdsForWall(attachmentUpdates, wall.id),
          } as Partial<AnyNode>,
        },
        ...attachmentUpdates.map(({ id, data }) => ({ id, data })),
      ],
      selectIds: [wall.id as AnyNodeId],
      dirtyIds: [wall.id as AnyNodeId],
    },
  }
}

export function buildSplitWallPlan(args: {
  wall: WallNode
  splitPoint: WallPlanPoint
  nodes: Record<AnyNodeId, AnyNode>
}): WallEditResult {
  const { wall, splitPoint, nodes } = args
  if (!isEditableStraightWall(wall)) {
    return { ok: false, reason: 'Curved walls cannot be split in this tool.' }
  }

  const splitParam = getWallParamForPoint(wall, splitPoint)
  if (splitParam <= EPSILON || splitParam >= 1 - EPSILON) {
    return { ok: false, reason: 'Pick a point inside the wall segment.' }
  }

  const resolvedSplitPoint = pointAtWallParam(wall, splitParam)
  const firstLength = distance(wall.start, resolvedSplitPoint)
  const secondLength = distance(resolvedSplitPoint, wall.end)
  if (firstLength <= WALL_MIN_LENGTH || secondLength <= WALL_MIN_LENGTH) {
    return { ok: false, reason: 'The split would create a wall segment that is too short.' }
  }

  const secondWall = cloneWall(wall, resolvedSplitPoint, wall.end, wall.name)
  const splitDistance = wallLength(wall) * splitParam
  const firstUpdates: WallAttachmentUpdate[] = []
  const secondUpdates: WallAttachmentUpdate[] = []

  for (const childId of wall.children ?? []) {
    const childNode = nodes[childId as AnyNodeId]
    if (!childNode) {
      continue
    }

    const span = getWallAttachmentSpan(childNode)
    if (!span) {
      return { ok: false, reason: 'An attached child cannot be moved to the split wall.' }
    }

    if (span.max <= splitDistance + ATTACHMENT_TOLERANCE) {
      const update = remapAttachmentToWall(childNode, wall.id, span.center, firstLength)
      if (!update) {
        return { ok: false, reason: 'An attached child cannot be moved to the split wall.' }
      }
      firstUpdates.push({ id: childNode.id as AnyNodeId, data: update, targetWallId: wall.id })
      continue
    }

    if (span.min >= splitDistance - ATTACHMENT_TOLERANCE) {
      const update = remapAttachmentToWall(
        childNode,
        secondWall.id,
        span.center - splitDistance,
        secondLength,
      )
      if (!update) {
        return { ok: false, reason: 'An attached child cannot be moved to the split wall.' }
      }
      secondUpdates.push({
        id: childNode.id as AnyNodeId,
        data: update,
        targetWallId: secondWall.id,
      })
      continue
    }

    return { ok: false, reason: 'A door, window, or wall item crosses the split point.' }
  }

  const attachmentUpdates = [...firstUpdates, ...secondUpdates]

  return {
    ok: true,
    plan: {
      created: [{ node: secondWall, parentId: wall.parentId as AnyNodeId | undefined }],
      updated: [
        {
          id: wall.id as AnyNodeId,
          data: {
            end: resolvedSplitPoint,
            children: getChildIdsForWall(attachmentUpdates, wall.id),
          } as Partial<AnyNode>,
        },
        ...attachmentUpdates.map(({ id, data }) => ({ id, data })),
      ],
      selectIds: [wall.id as AnyNodeId, secondWall.id as AnyNodeId],
      dirtyIds: [wall.id as AnyNodeId, secondWall.id as AnyNodeId],
    },
  }
}

function getTrimIntersections(wall: WallNode, walls: WallNode[]) {
  return uniqueSortedParams([
    0,
    ...walls.flatMap((boundary) => {
      if (boundary.id === wall.id || !isEditableStraightWall(boundary)) {
        return []
      }

      const intersection = getLineIntersection(wall, boundary)
      if (!intersection) {
        return []
      }

      if (
        intersection.tA <= EPSILON ||
        intersection.tA >= 1 - EPSILON ||
        intersection.tB < -EPSILON ||
        intersection.tB > 1 + EPSILON
      ) {
        return []
      }

      return [intersection.tA]
    }),
    1,
  ])
}

function findTrimInterval(params: number[], clickParam: number): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < params.length - 1; index += 1) {
    const start = params[index]!
    const end = params[index + 1]!
    if (end - start <= EPSILON) {
      continue
    }

    if (clickParam >= start - EPSILON && clickParam <= end + EPSILON) {
      return { start, end }
    }

    const midpoint = (start + end) / 2
    const distanceToInterval = Math.abs(clickParam - midpoint)
    if (distanceToInterval < bestDistance) {
      bestDistance = distanceToInterval
      best = { start, end }
    }
  }

  return best
}

function buildMiddleTrimPlan(args: {
  wall: WallNode
  removeStartParam: number
  removeEndParam: number
  nodes: Record<AnyNodeId, AnyNode>
}): WallEditResult {
  const { wall, removeStartParam, removeEndParam, nodes } = args
  const removeStart = pointAtWallParam(wall, removeStartParam)
  const removeEnd = pointAtWallParam(wall, removeEndParam)
  const secondWall = cloneWall(wall, removeEnd, wall.end, wall.name)
  const wallTotalLength = wallLength(wall)
  const removeStartDistance = wallTotalLength * removeStartParam
  const removeEndDistance = wallTotalLength * removeEndParam
  const firstLength = distance(wall.start, removeStart)
  const secondLength = distance(removeEnd, wall.end)
  const firstUpdates: WallAttachmentUpdate[] = []
  const secondUpdates: WallAttachmentUpdate[] = []

  for (const childId of wall.children ?? []) {
    const childNode = nodes[childId as AnyNodeId]
    if (!childNode) {
      continue
    }

    const span = getWallAttachmentSpan(childNode)
    if (!span) {
      return { ok: false, reason: 'An attached child cannot be moved away from the trimmed segment.' }
    }

    if (span.max <= removeStartDistance + ATTACHMENT_TOLERANCE) {
      const update = remapAttachmentToWall(childNode, wall.id, span.center, firstLength)
      if (!update) {
        return { ok: false, reason: 'An attached child cannot be moved away from the trimmed segment.' }
      }
      firstUpdates.push({ id: childNode.id as AnyNodeId, data: update, targetWallId: wall.id })
      continue
    }

    if (span.min >= removeEndDistance - ATTACHMENT_TOLERANCE) {
      const update = remapAttachmentToWall(
        childNode,
        secondWall.id,
        span.center - removeEndDistance,
        secondLength,
      )
      if (!update) {
        return { ok: false, reason: 'An attached child cannot be moved away from the trimmed segment.' }
      }
      secondUpdates.push({
        id: childNode.id as AnyNodeId,
        data: update,
        targetWallId: secondWall.id,
      })
      continue
    }

    return { ok: false, reason: 'A door, window, or wall item lies on the trimmed segment.' }
  }

  const attachmentUpdates = [...firstUpdates, ...secondUpdates]

  return {
    ok: true,
    plan: {
      created: [{ node: secondWall, parentId: wall.parentId as AnyNodeId | undefined }],
      updated: [
        {
          id: wall.id as AnyNodeId,
          data: {
            end: removeStart,
            children: getChildIdsForWall(attachmentUpdates, wall.id),
          } as Partial<AnyNode>,
        },
        ...attachmentUpdates.map(({ id, data }) => ({ id, data })),
      ],
      selectIds: [wall.id as AnyNodeId, secondWall.id as AnyNodeId],
      dirtyIds: [wall.id as AnyNodeId, secondWall.id as AnyNodeId],
    },
    preview: {
      wallId: wall.id,
      keepStart: wall.start,
      keepEnd: removeStart,
      removedStart: removeStart,
      removedEnd: removeEnd,
    },
  }
}

function buildTrimWallPlan(args: {
  wall: WallNode
  walls: WallNode[]
  clickPoint: WallPlanPoint
  nodes: Record<AnyNodeId, AnyNode>
}): WallEditResult {
  const { wall, walls, clickPoint, nodes } = args
  const intersections = getTrimIntersections(wall, walls)
  if (intersections.length <= 2) {
    return { ok: false, reason: 'No wall boundary crosses this wall.' }
  }

  const clickParam = Math.max(0, Math.min(1, getWallParamForPoint(wall, clickPoint)))
  const interval = findTrimInterval(intersections, clickParam)
  if (!interval || (interval.start <= EPSILON && interval.end >= 1 - EPSILON)) {
    return { ok: false, reason: 'No trimmable wall segment was found.' }
  }

  if (interval.start <= EPSILON) {
    const nextStart = pointAtWallParam(wall, interval.end)
    return buildEndpointChangePlan({
      wall,
      nextStart,
      nextEnd: wall.end,
      keptRange: { min: wallLength(wall) * interval.end, max: wallLength(wall) },
      nodes,
    })
  }

  if (interval.end >= 1 - EPSILON) {
    const nextEnd = pointAtWallParam(wall, interval.start)
    return buildEndpointChangePlan({
      wall,
      nextStart: wall.start,
      nextEnd,
      keptRange: { min: 0, max: wallLength(wall) * interval.start },
      nodes,
    })
  }

  return buildMiddleTrimPlan({
    wall,
    removeStartParam: interval.start,
    removeEndParam: interval.end,
    nodes,
  })
}

function buildExtendWallPlan(args: {
  wall: WallNode
  walls: WallNode[]
  endpoint: WallEndpoint
  nodes: Record<AnyNodeId, AnyNode>
}): WallEditResult {
  const { wall, walls, endpoint, nodes } = args
  let bestParam = endpoint === 'start' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  let bestPoint: WallPlanPoint | null = null

  for (const boundary of walls) {
    if (boundary.id === wall.id || !isEditableStraightWall(boundary)) {
      continue
    }

    const intersection = getLineIntersection(wall, boundary)
    if (!intersection) {
      continue
    }

    if (intersection.tB < -EPSILON || intersection.tB > 1 + EPSILON) {
      continue
    }

    if (endpoint === 'start') {
      if (intersection.tA < -EPSILON && intersection.tA > bestParam) {
        bestParam = intersection.tA
        bestPoint = intersection.point
      }
    } else if (intersection.tA > 1 + EPSILON && intersection.tA < bestParam) {
      bestParam = intersection.tA
      bestPoint = intersection.point
    }
  }

  if (!bestPoint) {
    return { ok: false, reason: 'No nearby crossing wall can extend this endpoint.' }
  }

  const totalLength = wallLength(wall)
  return buildEndpointChangePlan({
    wall,
    nextStart: endpoint === 'start' ? bestPoint : wall.start,
    nextEnd: endpoint === 'end' ? bestPoint : wall.end,
    keptRange: { min: 0, max: totalLength },
    nodes,
  })
}

export function buildTrimExtendWallPlan(args: {
  wall: WallNode
  walls: WallNode[]
  clickPoint: WallPlanPoint
  nodes: Record<AnyNodeId, AnyNode>
  endpointThreshold?: number
}): WallEditResult {
  const { wall, walls, clickPoint, nodes, endpointThreshold = WALL_JOIN_SNAP_RADIUS } = args
  if (!isEditableStraightWall(wall)) {
    return { ok: false, reason: 'Curved walls cannot be trimmed or extended in this tool.' }
  }

  const distanceToStart = distance(clickPoint, wall.start)
  const distanceToEnd = distance(clickPoint, wall.end)
  if (Math.min(distanceToStart, distanceToEnd) <= endpointThreshold) {
    return buildExtendWallPlan({
      wall,
      walls,
      endpoint: distanceToStart <= distanceToEnd ? 'start' : 'end',
      nodes,
    })
  }

  return buildTrimWallPlan({ wall, walls, clickPoint, nodes })
}

export function buildMergeWallsPlan(args: {
  primary: WallNode
  secondary: WallNode
  nodes: Record<AnyNodeId, AnyNode>
}): WallEditResult {
  const { primary, secondary, nodes } = args
  if (!(isEditableStraightWall(primary) && isEditableStraightWall(secondary))) {
    return { ok: false, reason: 'Only straight walls can be merged.' }
  }

  const sharedPoint = getSharedEndpoint(primary, secondary)
  if (!sharedPoint) {
    return { ok: false, reason: 'Walls must share an endpoint before they can merge.' }
  }

  if (!areWallStylesCompatible(primary, secondary)) {
    return { ok: false, reason: 'Walls must share thickness, height, material, and level.' }
  }

  if (!areWallsCollinearAcrossPoint(primary, secondary, sharedPoint)) {
    return { ok: false, reason: 'Walls must be collinear to merge.' }
  }

  const primaryEndpoint = getEndpointAtPoint(primary, sharedPoint)
  const secondaryEndpoint = getEndpointAtPoint(secondary, sharedPoint)
  if (!(primaryEndpoint && secondaryEndpoint)) {
    return { ok: false, reason: 'Walls must share an endpoint before they can merge.' }
  }

  const mergedStart =
    primaryEndpoint === 'start' ? getOtherEndpoint(secondary, secondaryEndpoint) : primary.start
  const mergedEnd =
    primaryEndpoint === 'end' ? getOtherEndpoint(secondary, secondaryEndpoint) : primary.end
  const mergedLength = distance(mergedStart, mergedEnd)
  if (mergedLength <= WALL_MIN_LENGTH) {
    return { ok: false, reason: 'The merged wall would be too short.' }
  }

  const mergedDirection: WallPlanPoint = [
    (mergedEnd[0] - mergedStart[0]) / mergedLength,
    (mergedEnd[1] - mergedStart[1]) / mergedLength,
  ]
  const attachmentUpdates: WallAttachmentUpdate[] = []

  for (const sourceWall of [primary, secondary]) {
    const sourceLength = wallLength(sourceWall)
    for (const childId of sourceWall.children ?? []) {
      const childNode = nodes[childId as AnyNodeId]
      if (!childNode) {
        continue
      }
      const span = getWallAttachmentSpan(childNode)
      if (!span) {
        return { ok: false, reason: 'An attached child cannot be moved to the merged wall.' }
      }

      const sourceDirection = getWallDirection(sourceWall)
      if (!sourceDirection || sourceLength <= EPSILON) {
        return { ok: false, reason: 'An attached child cannot be moved to the merged wall.' }
      }

      const worldCenter = add(sourceWall.start, scale(sourceDirection, span.center))
      const nextLocalX = dot(subtract(worldCenter, mergedStart), mergedDirection)
      const update = remapAttachmentToWall(childNode, primary.id, nextLocalX, mergedLength)
      if (!update) {
        return { ok: false, reason: 'An attached child cannot be moved to the merged wall.' }
      }

      attachmentUpdates.push({
        id: childNode.id as AnyNodeId,
        data: update,
        targetWallId: primary.id,
      })
    }
  }

  return {
    ok: true,
    plan: {
      updated: [
        {
          id: primary.id as AnyNodeId,
          data: {
            start: mergedStart,
            end: mergedEnd,
            children: getChildIdsForWall(attachmentUpdates, primary.id),
          } as Partial<AnyNode>,
        },
        ...attachmentUpdates.map(({ id, data }) => ({ id, data })),
      ],
      deleted: [secondary.id as AnyNodeId],
      selectIds: [primary.id as AnyNodeId],
      dirtyIds: [primary.id as AnyNodeId],
    },
  }
}

export function getWallOffsetPreview(args: {
  wall: WallNode
  point?: WallPlanPoint | null
  distance?: number
  snapStep?: number
}): WallOffsetPreview | null {
  const { wall, point, snapStep = WALL_GRID_STEP } = args
  const normal = getWallNormal(wall)
  if (!(normal && isEditableStraightWall(wall))) {
    return null
  }

  let offsetDistance = args.distance ?? DEFAULT_OFFSET_DISTANCE
  if (point) {
    const projectedPoint = pointAtWallParam(wall, getWallParamForPoint(wall, point))
    const signedDistance = dot(subtract(point, projectedPoint), normal)
    const sign = signedDistance < 0 ? -1 : 1
    const magnitude = Math.max(snapStep, snapScalarToGrid(Math.abs(signedDistance), snapStep))
    offsetDistance = sign * magnitude
  }

  const offset = scale(normal, offsetDistance)
  return {
    wallId: wall.id,
    start: add(wall.start, offset),
    end: add(wall.end, offset),
    distance: offsetDistance,
  }
}

export function buildOffsetWallPlan(args: {
  wall: WallNode
  preview: WallOffsetPreview
}): WallEditResult {
  const { wall, preview } = args
  if (!isEditableStraightWall(wall)) {
    return { ok: false, reason: 'Curved walls cannot be offset in this tool.' }
  }

  if (distance(preview.start, preview.end) <= WALL_MIN_LENGTH) {
    return { ok: false, reason: 'The offset wall would be too short.' }
  }

  const offsetWall = cloneWall(
    wall,
    preview.start,
    preview.end,
    wall.name ? `${wall.name} Offset` : 'Offset wall',
  )

  return {
    ok: true,
    plan: {
      created: [{ node: offsetWall, parentId: wall.parentId as AnyNodeId | undefined }],
      selectIds: [offsetWall.id as AnyNodeId],
      dirtyIds: [offsetWall.id as AnyNodeId],
    },
    preview,
  }
}

function getFilletGeometry(
  primary: WallNode,
  secondary: WallNode,
  requestedRadius = DEFAULT_FILLET_RADIUS,
): WallEditResult & {
  sharedPoint?: WallPlanPoint
  primaryEndpoint?: WallEndpoint
  secondaryEndpoint?: WallEndpoint
  primaryTangent?: WallPlanPoint
  secondaryTangent?: WallPlanPoint
  radius?: number
  arcPoints?: WallPlanPoint[]
} {
  const sharedPoint = getSharedEndpoint(primary, secondary)
  if (!sharedPoint) {
    return { ok: false, reason: 'Walls must share an endpoint for fillet v1.' }
  }

  const primaryEndpoint = getEndpointAtPoint(primary, sharedPoint)
  const secondaryEndpoint = getEndpointAtPoint(secondary, sharedPoint)
  if (!(primaryEndpoint && secondaryEndpoint)) {
    return { ok: false, reason: 'Walls must share an endpoint for fillet v1.' }
  }

  if (!areWallStylesCompatible(primary, secondary)) {
    return { ok: false, reason: 'Walls must share thickness, height, material, and level.' }
  }

  if (!(isEditableStraightWall(primary) && isEditableStraightWall(secondary))) {
    return { ok: false, reason: 'Only straight walls can be filleted in this tool.' }
  }

  const primaryFar = getOtherEndpoint(primary, primaryEndpoint)
  const secondaryFar = getOtherEndpoint(secondary, secondaryEndpoint)
  const primaryLength = distance(sharedPoint, primaryFar)
  const secondaryLength = distance(sharedPoint, secondaryFar)
  if (primaryLength <= WALL_MIN_LENGTH || secondaryLength <= WALL_MIN_LENGTH) {
    return { ok: false, reason: 'One of the wall legs is too short for a fillet.' }
  }

  const primaryDir = scale(subtract(primaryFar, sharedPoint), 1 / primaryLength)
  const secondaryDir = scale(subtract(secondaryFar, sharedPoint), 1 / secondaryLength)
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(primaryDir, secondaryDir))))
  if (angle <= 0.05 || Math.abs(Math.PI - angle) <= 0.05) {
    return { ok: false, reason: 'Walls need a clear corner angle for a fillet.' }
  }

  const maxTangent = Math.min(primaryLength, secondaryLength) - WALL_MIN_LENGTH
  const maxRadius = maxTangent * Math.tan(angle / 2)
  const radius = Math.min(Math.max(requestedRadius, 0.05), maxRadius)
  if (!(radius > 0.01 && Number.isFinite(radius))) {
    return { ok: false, reason: 'The fillet radius is too large for these walls.' }
  }

  const tangentDistance = radius / Math.tan(angle / 2)
  const primaryTangent = add(sharedPoint, scale(primaryDir, tangentDistance))
  const secondaryTangent = add(sharedPoint, scale(secondaryDir, tangentDistance))
  const bisector = add(primaryDir, secondaryDir)
  const bisectorLength = Math.hypot(bisector[0], bisector[1])
  if (bisectorLength <= EPSILON) {
    return { ok: false, reason: 'Walls need a clear corner angle for a fillet.' }
  }

  const centerDistance = radius / Math.sin(angle / 2)
  const center = add(sharedPoint, scale(bisector, centerDistance / bisectorLength))
  const startAngle = Math.atan2(primaryTangent[1] - center[1], primaryTangent[0] - center[0])
  const endAngle = Math.atan2(secondaryTangent[1] - center[1], secondaryTangent[0] - center[0])
  const delta = normalizeAngleDelta(endAngle - startAngle)
  const segmentCount = Math.min(
    MAX_FILLET_SEGMENTS,
    Math.max(3, Math.ceil((Math.abs(delta) * radius) / FILLET_SEGMENT_TARGET_LENGTH)),
  )
  const arcPoints: WallPlanPoint[] = []
  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount
    const angleAtPoint = startAngle + delta * t
    arcPoints.push([
      center[0] + Math.cos(angleAtPoint) * radius,
      center[1] + Math.sin(angleAtPoint) * radius,
    ])
  }

  return {
    ok: true,
    plan: {},
    sharedPoint,
    primaryEndpoint,
    secondaryEndpoint,
    primaryTangent,
    secondaryTangent,
    radius,
    arcPoints,
    preview: {
      wallIds: [primary.id, secondary.id],
      radius,
      points: arcPoints,
    },
  }
}

export function getWallFilletPreview(args: {
  primary: WallNode
  secondary: WallNode
  radius?: number
}): WallFilletPreview | null {
  const geometry = getFilletGeometry(args.primary, args.secondary, args.radius)
  return geometry.ok && 'arcPoints' in geometry && geometry.arcPoints
    ? {
        wallIds: [args.primary.id, args.secondary.id],
        radius: geometry.radius ?? DEFAULT_FILLET_RADIUS,
        points: geometry.arcPoints,
      }
    : null
}

export function buildFilletWallsPlan(args: {
  primary: WallNode
  secondary: WallNode
  nodes: Record<AnyNodeId, AnyNode>
  radius?: number
}): WallEditResult {
  const { primary, secondary, nodes, radius = DEFAULT_FILLET_RADIUS } = args
  const geometry = getFilletGeometry(primary, secondary, radius)
  if (
    !(
      geometry.ok &&
      geometry.sharedPoint &&
      geometry.primaryEndpoint &&
      geometry.secondaryEndpoint &&
      geometry.primaryTangent &&
      geometry.secondaryTangent &&
      geometry.arcPoints
    )
  ) {
    return geometry.ok ? { ok: false, reason: 'The fillet could not be built.' } : geometry
  }

  const primaryNextStart =
    geometry.primaryEndpoint === 'start' ? geometry.primaryTangent : primary.start
  const primaryNextEnd = geometry.primaryEndpoint === 'end' ? geometry.primaryTangent : primary.end
  const secondaryNextStart =
    geometry.secondaryEndpoint === 'start' ? geometry.secondaryTangent : secondary.start
  const secondaryNextEnd =
    geometry.secondaryEndpoint === 'end' ? geometry.secondaryTangent : secondary.end

  const primaryLength = wallLength(primary)
  const secondaryLength = wallLength(secondary)
  const primaryTangentDistance = distance(geometry.sharedPoint, geometry.primaryTangent)
  const secondaryTangentDistance = distance(geometry.sharedPoint, geometry.secondaryTangent)
  const primaryKeptRange =
    geometry.primaryEndpoint === 'start'
      ? { min: primaryTangentDistance, max: primaryLength }
      : { min: 0, max: primaryLength - primaryTangentDistance }
  const secondaryKeptRange =
    geometry.secondaryEndpoint === 'start'
      ? { min: secondaryTangentDistance, max: secondaryLength }
      : { min: 0, max: secondaryLength - secondaryTangentDistance }

  const primaryAttachments = buildAttachmentUpdatesForEndpointChange({
    wall: primary,
    nextStart: primaryNextStart,
    nextEnd: primaryNextEnd,
    keptRange: primaryKeptRange,
    nodes,
  })
  const secondaryAttachments = buildAttachmentUpdatesForEndpointChange({
    wall: secondary,
    nextStart: secondaryNextStart,
    nextEnd: secondaryNextEnd,
    keptRange: secondaryKeptRange,
    nodes,
  })
  if (!(primaryAttachments && secondaryAttachments)) {
    return { ok: false, reason: 'A door, window, or wall item lies inside the fillet corner.' }
  }

  const arcWalls = geometry.arcPoints.slice(0, -1).flatMap((point, index) => {
    const nextPoint = geometry.arcPoints?.[index + 1]
    if (!nextPoint || distance(point, nextPoint) <= WALL_MIN_LENGTH) {
      return []
    }
    return [cloneWall(primary, point, nextPoint, primary.name ? `${primary.name} Fillet` : 'Fillet wall')]
  })

  const attachmentUpdates = [...primaryAttachments, ...secondaryAttachments]

  return {
    ok: true,
    plan: {
      created: arcWalls.map((node) => ({
        node,
        parentId: primary.parentId as AnyNodeId | undefined,
      })),
      updated: [
        {
          id: primary.id as AnyNodeId,
          data: {
            start: primaryNextStart,
            end: primaryNextEnd,
            children: getChildIdsForWall(attachmentUpdates, primary.id),
          } as Partial<AnyNode>,
        },
        {
          id: secondary.id as AnyNodeId,
          data: {
            start: secondaryNextStart,
            end: secondaryNextEnd,
            children: getChildIdsForWall(attachmentUpdates, secondary.id),
          } as Partial<AnyNode>,
        },
        ...attachmentUpdates.map(({ id, data }) => ({ id, data })),
      ],
      selectIds: arcWalls.map((wall) => wall.id as AnyNodeId),
      dirtyIds: [primary.id as AnyNodeId, secondary.id as AnyNodeId, ...arcWalls.map((wall) => wall.id as AnyNodeId)],
    },
    preview: geometry.preview,
  }
}

type AnyContainerNode = AnyNode & { children: string[] }

function removeChildFromParent(
  nextNodes: Record<AnyNodeId, AnyNode>,
  parentId: AnyNodeId | null | undefined,
  childId: AnyNodeId,
) {
  if (!(parentId && nextNodes[parentId])) {
    return
  }

  const parent = nextNodes[parentId] as AnyContainerNode
  if (!Array.isArray(parent.children)) {
    return
  }

  nextNodes[parent.id as AnyNodeId] = {
    ...parent,
    children: parent.children.filter((id) => id !== childId),
  } as AnyNode
}

function addChildToParent(
  nextNodes: Record<AnyNodeId, AnyNode>,
  parentId: AnyNodeId | null | undefined,
  childId: AnyNodeId,
) {
  if (!(parentId && nextNodes[parentId])) {
    return
  }

  const parent = nextNodes[parentId] as AnyContainerNode
  if (!Array.isArray(parent.children)) {
    return
  }

  nextNodes[parent.id as AnyNodeId] = {
    ...parent,
    children: Array.from(new Set([...parent.children, childId])),
  } as AnyNode
}

function collectDeletedIds(
  nextNodes: Record<AnyNodeId, AnyNode>,
  seedIds: AnyNodeId[],
): Set<AnyNodeId> {
  const ids = new Set<AnyNodeId>()
  const collect = (id: AnyNodeId) => {
    if (ids.has(id)) {
      return
    }

    ids.add(id)
    const node = nextNodes[id]
    if (node && 'children' in node && Array.isArray(node.children)) {
      for (const childId of node.children as AnyNodeId[]) {
        collect(childId)
      }
    }
  }

  for (const id of seedIds) {
    collect(id)
  }

  return ids
}

export function applyWallEditPlan(plan: WallEditPlan): boolean {
  const created = plan.created ?? []
  const updated = plan.updated ?? []
  const deleted = plan.deleted ?? []
  if (created.length === 0 && updated.length === 0 && deleted.length === 0) {
    return false
  }

  const scene = useScene.getState()
  if (scene.readOnly) {
    return false
  }

  const dirtyIds = new Set<AnyNodeId>(plan.dirtyIds ?? [])

  useScene.setState((state) => {
    const nextNodes = { ...state.nodes }
    let nextRootIds = [...state.rootNodeIds]
    const nextCollections = { ...state.collections }

    for (const { node, parentId } of created) {
      const resolvedParentId = parentId ?? (node.parentId as AnyNodeId | null) ?? null
      const newNode = {
        ...node,
        parentId: resolvedParentId,
      } as AnyNode

      nextNodes[newNode.id] = newNode
      dirtyIds.add(newNode.id)
      if (resolvedParentId) {
        addChildToParent(nextNodes, resolvedParentId, newNode.id)
        dirtyIds.add(resolvedParentId)
      } else if (!nextRootIds.includes(newNode.id)) {
        nextRootIds.push(newNode.id)
      }
    }

    for (const { id, data } of updated) {
      const currentNode = nextNodes[id]
      if (!currentNode) {
        continue
      }

      if (data.parentId !== undefined && data.parentId !== currentNode.parentId) {
        removeChildFromParent(nextNodes, currentNode.parentId as AnyNodeId | null, id)
        addChildToParent(nextNodes, data.parentId as AnyNodeId | null, id)
        if (currentNode.parentId) {
          dirtyIds.add(currentNode.parentId as AnyNodeId)
        }
        if (data.parentId) {
          dirtyIds.add(data.parentId as AnyNodeId)
        }
      }

      nextNodes[id] = { ...nextNodes[id], ...data } as AnyNode
      dirtyIds.add(id)
    }

    const allDeletedIds = collectDeletedIds(nextNodes, deleted)
    for (const id of allDeletedIds) {
      const node = nextNodes[id]
      if (!node) {
        continue
      }

      const parentId = node.parentId as AnyNodeId | null
      removeChildFromParent(nextNodes, parentId, id)
      if (parentId) {
        dirtyIds.add(parentId)
      }

      nextRootIds = nextRootIds.filter((rootId) => rootId !== id)

      if ('collectionIds' in node && Array.isArray(node.collectionIds)) {
        for (const collectionId of node.collectionIds) {
          const collection = nextCollections[collectionId]
          if (collection) {
            nextCollections[collectionId] = {
              ...collection,
              nodeIds: collection.nodeIds.filter((nodeId) => nodeId !== id),
            }
          }
        }
      }

      delete nextNodes[id]
    }

    return {
      nodes: nextNodes,
      rootNodeIds: nextRootIds,
      collections: nextCollections,
    }
  })

  for (const id of dirtyIds) {
    useScene.getState().markDirty(id)
  }

  return true
}

export function applyWallEditResult(result: WallEditResult): boolean {
  return result.ok ? applyWallEditPlan(result.plan) : false
}

export function getDefaultWallEditRadius() {
  return DEFAULT_FILLET_RADIUS
}

export function getDefaultWallOffsetDistance() {
  return DEFAULT_OFFSET_DISTANCE
}

export function combineWallEditPlans(...plans: WallEditPlan[]): WallEditPlan {
  return mergePlanChanges(...plans)
}
