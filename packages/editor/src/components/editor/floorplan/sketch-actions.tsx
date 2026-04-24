'use client'

import { Icon } from '@iconify/react'
import {
  type AnyNode,
  type AnyNodeId,
  type Point2D,
  type SketchCircleNode,
  SketchCircleNode as SketchCircleNodeSchema,
  type SketchLineEndpointReference,
  type SketchLineNode,
  SketchLineNode as SketchLineNodeSchema,
  normalizeWallCurveOffset,
  useScene,
} from '@pascal-app/core'
import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import {
  areSketchEndpointReferencesEqual,
  areSketchPointsCoincident,
  getSketchEndpointReferenceFromSnapTarget,
  getSketchLineEndpointPoint,
} from '../../tools/sketch/sketch-coincident'
import {
  buildOrientSketchLinePlan,
  buildSetSketchLineLengthPlan,
  buildSketchRectangleSegments,
  detectClosedSketchProfiles,
  getSketchLineLength2D,
  getSketchProfileUnsupportedReason,
  isSketchLineLongEnough,
  type SketchLineEditResult,
  type SketchProfile,
} from '../../tools/sketch/sketch-geometry'
import { createWallOnCurrentLevel, type WallPlanPoint } from '../../tools/wall/wall-drafting'
import type { WallSketchSnapTarget } from '../../tools/wall/wall-sketch'
import type { NodeActionMenuExtraAction } from '../node-action-menu'
import type {
  SketchArcDraft,
  SketchCircleDraft,
  SketchDimensionInputState,
  SketchLineDraft,
  SketchRectangleDraft,
} from './sketch-state'

type UnitSystem = 'metric' | 'imperial'
type SketchLineOperation = 'split' | 'trim-extend'

const DEFAULT_SKETCH_OFFSET_DISTANCE = 0.5
const DEFAULT_SKETCH_LINEAR_PATTERN_SPACING = 1
const DEFAULT_SKETCH_LINEAR_PATTERN_COUNT = 3
const DEFAULT_SKETCH_CORNER_DISTANCE = 0.5
const SKETCH_EPSILON = 1e-6

type SketchLineCreateConnections = {
  startConnection?: SketchLineEndpointReference
  endConnection?: SketchLineEndpointReference
}

type SketchLineCreateSegment = {
  start: WallPlanPoint
  end: WallPlanPoint
  construction?: boolean
  relations?: SketchLineNode['relations']
  coincident?: SketchLineNode['coincident']
}

export type FloorplanSketchLineEntry = {
  line: SketchLineNode
  polygon: Point2D[]
}

type UseFloorplanSketchActionsArgs = {
  levelId: string | null
  tool: string | null | undefined
  unit: UnitSystem
  sketchLineDraft: SketchLineDraft | null
  sketchRectangleDraft: SketchRectangleDraft | null
  sketchCircleDraft: SketchCircleDraft | null
  sketchArcDraft: SketchArcDraft | null
  sketchDimensionInput: SketchDimensionInputState | null
  setSketchLineDraft: Dispatch<SetStateAction<SketchLineDraft | null>>
  setSketchRectangleDraft: Dispatch<SetStateAction<SketchRectangleDraft | null>>
  setSketchCircleDraft: Dispatch<SetStateAction<SketchCircleDraft | null>>
  setSketchArcDraft: Dispatch<SetStateAction<SketchArcDraft | null>>
  setSketchDimensionInput: Dispatch<SetStateAction<SketchDimensionInputState | null>>
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  selectedSketchLineEntry: FloorplanSketchLineEntry | null
  selectedSketchLineList: SketchLineNode[]
  selectedSketchProfile: SketchProfile | null
  sketchProfiles: SketchProfile[]
  setSelection: (selection: any) => void
  setCursorPoint: Dispatch<SetStateAction<WallPlanPoint | null>>
  setWallSketchSnapResult: (result: null) => void
  showWallEditFeedback: (message: string) => void
  createSlabOnCurrentLevel: (points: WallPlanPoint[]) => AnyNodeId | string | null | undefined
  createZoneOnCurrentLevel: (points: WallPlanPoint[]) => AnyNodeId | string | null | undefined
  updateNode: (id: AnyNodeId, data: Partial<AnyNode>) => void
  deleteNode: (id: AnyNodeId) => void
}

function formatLengthInputValue(valueMeters: number, unit: UnitSystem) {
  const value = unit === 'imperial' ? valueMeters * 3.280_84 : valueMeters
  return String(Number.parseFloat(value.toFixed(2)))
}

function parseSketchLengthInput(value: string, unit: UnitSystem): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return unit === 'imperial' ? parsed / 3.280_84 : parsed
}

function addPoint(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] + b[0], a[1] + b[1]]
}

function subtractPoint(a: WallPlanPoint, b: WallPlanPoint): WallPlanPoint {
  return [a[0] - b[0], a[1] - b[1]]
}

function scalePoint(point: WallPlanPoint, scalar: number): WallPlanPoint {
  return [point[0] * scalar, point[1] * scalar]
}

function crossPoint(a: WallPlanPoint, b: WallPlanPoint): number {
  return a[0] * b[1] - a[1] * b[0]
}

function getPointDistance(a: WallPlanPoint, b: WallPlanPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function getAngleFromCenter(center: WallPlanPoint, point: WallPlanPoint): number {
  return Math.atan2(point[1] - center[1], point[0] - center[0])
}

function getUnitVector(start: WallPlanPoint, end: WallPlanPoint): WallPlanPoint | null {
  const length = getPointDistance(start, end)
  if (length <= SKETCH_EPSILON) {
    return null
  }

  return [(end[0] - start[0]) / length, (end[1] - start[1]) / length]
}

function getSketchLineDirection(line: SketchLineNode): WallPlanPoint | null {
  return getUnitVector(line.start, line.end)
}

function getSketchLineNormal(line: SketchLineNode): WallPlanPoint | null {
  const direction = getSketchLineDirection(line)
  return direction ? [-direction[1], direction[0]] : null
}

function translateSketchLineSegment(
  line: SketchLineNode,
  offset: WallPlanPoint,
): SketchLineCreateSegment {
  return {
    start: addPoint(line.start, offset),
    end: addPoint(line.end, offset),
    construction: line.construction,
    relations: getSketchLineSplitRelations(line),
  }
}

function buildSketchLineCoincident(
  connections: SketchLineCreateConnections,
): SketchLineNode['coincident'] | undefined {
  if (!(connections.startConnection || connections.endConnection)) {
    return undefined
  }

  return {
    ...(connections.startConnection ? { start: connections.startConnection } : {}),
    ...(connections.endConnection ? { end: connections.endConnection } : {}),
  }
}

function getSketchLineMidpoint(line: SketchLineNode): WallPlanPoint {
  return [(line.start[0] + line.end[0]) / 2, (line.start[1] + line.end[1]) / 2]
}

function projectPointOntoSketchLine(line: SketchLineNode, point: WallPlanPoint): WallPlanPoint {
  const dx = line.end[0] - line.start[0]
  const dz = line.end[1] - line.start[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 1e-9) {
    return getSketchLineMidpoint(line)
  }

  const t = ((point[0] - line.start[0]) * dx + (point[1] - line.start[1]) * dz) / lengthSquared
  const clampedT = Math.min(1, Math.max(0, t))
  return [line.start[0] + dx * clampedT, line.start[1] + dz * clampedT]
}

function getSketchLineIntersection(
  first: SketchLineNode,
  second: SketchLineNode,
): WallPlanPoint | null {
  const r = subtractPoint(first.end, first.start)
  const s = subtractPoint(second.end, second.start)
  const denominator = crossPoint(r, s)
  if (Math.abs(denominator) <= SKETCH_EPSILON) {
    return null
  }

  const offset = subtractPoint(second.start, first.start)
  const t = crossPoint(offset, s) / denominator
  return addPoint(first.start, scalePoint(r, t))
}

function getSketchLineSplitRelations(line: SketchLineNode): SketchLineNode['relations'] {
  return (line.relations ?? []).filter((relation) => relation !== 'fixed')
}

function getNearestSketchEndpoint(line: SketchLineNode, point: WallPlanPoint): 'start' | 'end' {
  return getPointDistance(line.start, point) <= getPointDistance(line.end, point) ? 'start' : 'end'
}

function getOppositeSketchEndpoint(endpoint: 'start' | 'end'): 'start' | 'end' {
  return endpoint === 'start' ? 'end' : 'start'
}

function setSketchLineCoincidentEndpoint(
  line: SketchLineNode,
  endpoint: 'start' | 'end',
  reference?: SketchLineEndpointReference,
): SketchLineNode['coincident'] {
  const coincident = { ...(line.coincident ?? {}) }
  if (reference) {
    coincident[endpoint] = reference
  } else {
    delete coincident[endpoint]
  }
  return coincident
}

function getSketchLineEndpointReferenceAtPoint(
  line: SketchLineNode,
  point: WallPlanPoint,
): SketchLineEndpointReference | undefined {
  if (areSketchPointsCoincident(line.start, point)) {
    return { lineId: line.id, endpoint: 'start' }
  }

  if (areSketchPointsCoincident(line.end, point)) {
    return { lineId: line.id, endpoint: 'end' }
  }

  return undefined
}

function getSketchLineEndpointUpdate(
  line: SketchLineNode,
  endpoint: 'start' | 'end',
  point: WallPlanPoint,
  connection?: SketchLineEndpointReference,
): Partial<SketchLineNode> {
  return {
    [endpoint]: point,
    dimensions: {},
    coincident: setSketchLineCoincidentEndpoint(line, endpoint, connection),
  }
}

function mirrorSketchPointAcrossVerticalAxis(point: WallPlanPoint, axisX: number): WallPlanPoint {
  return [2 * axisX - point[0], point[1]]
}

function getSelectionCenterX(lines: SketchLineNode[]): number {
  const points = lines.flatMap((line) => [line.start, line.end])
  return points.reduce((sum, point) => sum + point[0], 0) / Math.max(1, points.length)
}

function getCornerTrimPoint(
  line: SketchLineNode,
  intersection: WallPlanPoint,
  endpoint: 'start' | 'end',
  distance: number,
): WallPlanPoint | null {
  const farEndpoint = getOppositeSketchEndpoint(endpoint)
  const farPoint = getSketchLineEndpointPoint(line, farEndpoint)
  const direction = getUnitVector(intersection, farPoint)
  if (!direction) {
    return null
  }

  const maxDistance = getPointDistance(intersection, farPoint) * 0.45
  const resolvedDistance = Math.min(distance, maxDistance)
  if (resolvedDistance <= SKETCH_EPSILON) {
    return null
  }

  return addPoint(intersection, scalePoint(direction, resolvedDistance))
}

function endpointReferencesEqual(
  a: SketchLineEndpointReference | undefined,
  b: SketchLineEndpointReference,
) {
  return Boolean(a && areSketchEndpointReferencesEqual(a, b))
}

function retargetSketchLineCoincidentReference(
  coincident: SketchLineNode['coincident'],
  from: SketchLineEndpointReference,
  to: SketchLineEndpointReference,
): SketchLineNode['coincident'] | null {
  let changed = false
  const nextCoincident: SketchLineNode['coincident'] = { ...(coincident ?? {}) }

  for (const endpoint of ['start', 'end'] as const) {
    if (endpointReferencesEqual(nextCoincident[endpoint], from)) {
      nextCoincident[endpoint] = to
      changed = true
    }
  }

  return changed ? nextCoincident : null
}

function applyConnectionToSegmentEndpoint(
  segment: SketchLineCreateSegment,
  endpoint: 'start' | 'end',
  connection: SketchLineEndpointReference,
): SketchLineCreateSegment {
  return {
    ...segment,
    coincident: {
      ...(segment.coincident ?? {}),
      [endpoint]: connection,
    },
  }
}

function applyExternalRectangleConnection(
  segments: SketchLineCreateSegment[],
  point: WallPlanPoint,
  connection: SketchLineEndpointReference | undefined,
): SketchLineCreateSegment[] {
  if (!connection) {
    return segments
  }

  return segments.map((segment) => {
    let nextSegment = segment
    if (areSketchPointsCoincident(segment.start, point)) {
      nextSegment = applyConnectionToSegmentEndpoint(nextSegment, 'start', connection)
    }
    if (areSketchPointsCoincident(segment.end, point)) {
      nextSegment = applyConnectionToSegmentEndpoint(nextSegment, 'end', connection)
    }
    return nextSegment
  })
}

function addLocalCoincidentReferences(createdLines: SketchLineNode[]): SketchLineNode[] {
  const endpointGroups: Array<
    Array<{ line: SketchLineNode; endpoint: 'start' | 'end'; point: WallPlanPoint }>
  > = []

  for (const line of createdLines) {
    for (const endpoint of ['start', 'end'] as const) {
      const point = getSketchLineEndpointPoint(line, endpoint)
      const group = endpointGroups.find((candidateGroup) =>
        areSketchPointsCoincident(candidateGroup[0]?.point ?? point, point),
      )

      if (group) {
        group.push({ line, endpoint, point })
      } else {
        endpointGroups.push([{ line, endpoint, point }])
      }
    }
  }

  const nextLineById = new Map(createdLines.map((line) => [line.id, line] as const))

  for (const group of endpointGroups) {
    if (group.length < 2) {
      continue
    }

    const externalReference = group
      .map(({ line, endpoint }) => line.coincident?.[endpoint])
      .find((reference): reference is SketchLineEndpointReference => Boolean(reference))
    const anchor =
      externalReference ?? ({ lineId: group[0]!.line.id, endpoint: group[0]!.endpoint } as const)

    for (const { line, endpoint } of group) {
      const currentLine = nextLineById.get(line.id)
      if (!currentLine || areSketchEndpointReferencesEqual({ lineId: line.id, endpoint }, anchor)) {
        continue
      }

      nextLineById.set(line.id, {
        ...currentLine,
        coincident: {
          ...(currentLine.coincident ?? {}),
          [endpoint]: anchor,
        },
      })
    }
  }

  return createdLines.map((line) => nextLineById.get(line.id) ?? line)
}

export function useFloorplanSketchActions({
  levelId,
  tool,
  unit,
  sketchLineDraft,
  sketchRectangleDraft,
  sketchCircleDraft,
  sketchArcDraft,
  sketchDimensionInput,
  setSketchLineDraft,
  setSketchRectangleDraft,
  setSketchCircleDraft,
  setSketchArcDraft,
  setSketchDimensionInput,
  sketchLineById,
  selectedSketchLineEntry,
  selectedSketchLineList,
  selectedSketchProfile,
  sketchProfiles,
  setSelection,
  setCursorPoint,
  setWallSketchSnapResult,
  showWallEditFeedback,
  createSlabOnCurrentLevel,
  createZoneOnCurrentLevel,
  updateNode,
  deleteNode,
}: UseFloorplanSketchActionsArgs) {
  const [sketchLineEditOperation, setSketchLineEditOperation] =
    useState<SketchLineOperation | null>(null)

  const markNodeCreatedFromSketch = useCallback(
    (
      nodeId: AnyNodeId | string | null | undefined,
      lineIds: SketchLineNode['id'][],
      kind: 'line' | 'profile',
    ) => {
      if (!nodeId) {
        return
      }

      const node = useScene.getState().nodes[nodeId as AnyNodeId]
      const metadata =
        node && typeof node.metadata === 'object' && node.metadata !== null
          ? (node.metadata as Record<string, unknown>)
          : {}

      updateNode(
        nodeId as AnyNodeId,
        {
          metadata: {
            ...metadata,
            sketchSource: {
              kind,
              lineIds,
            },
          },
        } as Partial<AnyNode>,
      )
      useScene.getState().dirtyNodes.add(nodeId as AnyNodeId)
    },
    [updateNode],
  )

  const createSketchLineOnCurrentLevel = useCallback(
    (
      start: WallPlanPoint,
      end: WallPlanPoint,
      construction: boolean,
      connections: SketchLineCreateConnections = {},
    ) => {
      if (!levelId || !isSketchLineLongEnough(start, end)) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const sketchLineCount = Object.values(nodes).filter(
        (node) => node.type === 'sketch-line',
      ).length
      const sketchLine = SketchLineNodeSchema.parse({
        name: `${construction ? '参考线' : '草图线'} ${sketchLineCount + 1}`,
        start,
        end,
        construction,
        coincident: buildSketchLineCoincident(connections),
      })

      createNode(sketchLine, levelId as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [sketchLine.id] })
      return sketchLine.id
    },
    [levelId, setSelection],
  )

  const createSketchLinesOnCurrentLevel = useCallback(
    (segments: SketchLineCreateSegment[], namePrefix = '草图线') => {
      if (!levelId) {
        return []
      }

      const validSegments = segments.filter((segment) =>
        isSketchLineLongEnough(segment.start, segment.end),
      )
      if (validSegments.length === 0) {
        return []
      }

      const { createNodes, nodes } = useScene.getState()
      const sketchLineCount = Object.values(nodes).filter(
        (node) => node.type === 'sketch-line',
      ).length
      const createdLines = addLocalCoincidentReferences(
        validSegments.map((segment, index) =>
          SketchLineNodeSchema.parse({
            name: `${namePrefix} ${sketchLineCount + index + 1}`,
            start: segment.start,
            end: segment.end,
            construction: segment.construction ?? false,
            relations: segment.relations ?? [],
            coincident: segment.coincident,
          }),
        ),
      )

      createNodes(createdLines.map((line) => ({ node: line, parentId: levelId as AnyNodeId })))
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: createdLines.map((line) => line.id) })
      return createdLines.map((line) => line.id)
    },
    [levelId, setSelection],
  )

  const createSketchCircleOnCurrentLevel = useCallback(
    ({
      center,
      endAngle = Math.PI * 2,
      kind,
      radius,
      startAngle = 0,
    }: {
      center: WallPlanPoint
      endAngle?: number
      kind: SketchCircleNode['kind']
      radius: number
      startAngle?: number
    }) => {
      if (!levelId || !(Number.isFinite(radius) && radius > SKETCH_EPSILON)) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const sketchCircleCount = Object.values(nodes).filter(
        (node) => node.type === 'sketch-circle',
      ).length
      const sketchCircle = SketchCircleNodeSchema.parse({
        name: `${kind === 'arc' ? '草图圆弧' : '草图圆'} ${sketchCircleCount + 1}`,
        kind,
        center,
        radius,
        startAngle,
        endAngle,
        dimensions: { radius },
      })

      createNode(sketchCircle, levelId as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [sketchCircle.id] })
      return sketchCircle.id
    },
    [levelId, setSelection],
  )

  const runSketchLineEditResult = useCallback(
    (result: SketchLineEditResult) => {
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return false
      }

      useScene.getState().updateNodes(
        result.updates.map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        })),
      )
      for (const update of result.updates) {
        useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
      }
      setSelection({ selectedIds: result.selectIds ?? result.updates.map((update) => update.id) })
      sfxEmitter.emit('sfx:structure-build')
      setSketchDimensionInput(null)
      return true
    },
    [setSelection, setSketchDimensionInput, showWallEditFeedback],
  )

  const createWallsFromSelectedSketchProfile = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!selectedSketchProfile) {
        showWallEditFeedback('请选择闭合轮廓中的一条草图边。')
        return
      }

      const createdWallIds: AnyNodeId[] = []
      const points = selectedSketchProfile.points
      for (let index = 0; index < points.length; index += 1) {
        const start = points[index]
        const end = points[(index + 1) % points.length]
        if (!(start && end)) {
          continue
        }

        const wall = createWallOnCurrentLevel(start, end)
        if (wall) {
          markNodeCreatedFromSketch(wall.id as AnyNodeId, selectedSketchProfile.lineIds, 'profile')
          createdWallIds.push(wall.id as AnyNodeId)
        }
      }

      if (createdWallIds.length === 0) {
        showWallEditFeedback('未能从该草图轮廓生成墙体。')
        return
      }

      setSelection({ selectedIds: createdWallIds })
    },
    [markNodeCreatedFromSketch, selectedSketchProfile, setSelection, showWallEditFeedback],
  )

  const createWallFromSelectedSketchLine = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line
      if (!line) {
        showWallEditFeedback('请选择一条草图线来生成墙体。')
        return
      }

      const wall = createWallOnCurrentLevel(line.start, line.end)
      if (!wall) {
        showWallEditFeedback('未能从该草图线生成墙体。')
        return
      }

      const curveOffset = normalizeWallCurveOffset(wall, line.curveOffset ?? 0)
      if (curveOffset !== 0) {
        updateNode(wall.id as AnyNodeId, { curveOffset } as Partial<AnyNode>)
        useScene.getState().dirtyNodes.add(wall.id as AnyNodeId)
      }
      markNodeCreatedFromSketch(wall.id as AnyNodeId, [line.id], 'line')
      setSelection({ selectedIds: [wall.id] })
    },
    [
      markNodeCreatedFromSketch,
      selectedSketchLineEntry,
      setSelection,
      showWallEditFeedback,
      updateNode,
    ],
  )

  const createZoneFromSelectedSketchProfile = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!selectedSketchProfile) {
        showWallEditFeedback('请选择闭合轮廓中的一条草图边。')
        return
      }

      const unsupportedReason = getSketchProfileUnsupportedReason(
        selectedSketchProfile,
        sketchProfiles,
      )
      if (unsupportedReason) {
        showWallEditFeedback(unsupportedReason)
        return
      }

      const zoneId = createZoneOnCurrentLevel(selectedSketchProfile.points)
      markNodeCreatedFromSketch(zoneId, selectedSketchProfile.lineIds, 'profile')
    },
    [
      createZoneOnCurrentLevel,
      markNodeCreatedFromSketch,
      selectedSketchProfile,
      showWallEditFeedback,
      sketchProfiles,
    ],
  )

  const createSlabFromSelectedSketchProfile = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!selectedSketchProfile) {
        showWallEditFeedback('请选择闭合轮廓中的一条草图边。')
        return
      }

      const unsupportedReason = getSketchProfileUnsupportedReason(
        selectedSketchProfile,
        sketchProfiles,
      )
      if (unsupportedReason) {
        showWallEditFeedback(unsupportedReason)
        return
      }

      const slabId = createSlabOnCurrentLevel(selectedSketchProfile.points)
      markNodeCreatedFromSketch(slabId, selectedSketchProfile.lineIds, 'profile')
    },
    [
      createSlabOnCurrentLevel,
      markNodeCreatedFromSketch,
      selectedSketchProfile,
      showWallEditFeedback,
      sketchProfiles,
    ],
  )

  const handleSketchLinePlacementPoint = useCallback(
    (point: WallPlanPoint, snapTarget?: WallSketchSnapTarget | null) => {
      const construction = tool === 'sketch-construction-line'
      const connection = getSketchEndpointReferenceFromSnapTarget(snapTarget)

      if (!sketchLineDraft) {
        setSketchLineDraft({
          start: point,
          end: point,
          construction,
          startConnection: connection,
        })
        setCursorPoint(point)
        return
      }

      if (!isSketchLineLongEnough(sketchLineDraft.start, point)) {
        return
      }

      const createdId = createSketchLineOnCurrentLevel(
        sketchLineDraft.start,
        point,
        sketchLineDraft.construction,
        {
          startConnection: sketchLineDraft.startConnection,
          endConnection: connection,
        },
      )
      if (!createdId) {
        return
      }

      const nextSketchLines = Object.values(useScene.getState().nodes).filter(
        (node): node is SketchLineNode => node?.type === 'sketch-line',
      )
      const closedProfile = detectClosedSketchProfiles(nextSketchLines).find((profile) =>
        profile.lineIds.includes(createdId),
      )
      if (closedProfile) {
        showWallEditFeedback(
          '已生成闭合草图轮廓。请选择一条边，可转换为墙体、楼板或区域。',
        )
      }

      setSketchLineDraft({
        start: point,
        end: point,
        construction,
        startConnection: { lineId: createdId, endpoint: 'end' },
      })
      setCursorPoint(point)
      setWallSketchSnapResult(null)
    },
    [
      createSketchLineOnCurrentLevel,
      setCursorPoint,
      setSketchLineDraft,
      setWallSketchSnapResult,
      showWallEditFeedback,
      sketchLineDraft,
      tool,
    ],
  )

  const handleSketchRectanglePlacementPoint = useCallback(
    (point: WallPlanPoint, snapTarget?: WallSketchSnapTarget | null) => {
      const connection = getSketchEndpointReferenceFromSnapTarget(snapTarget)

      if (!sketchRectangleDraft) {
        setSketchRectangleDraft({ start: point, end: point, startConnection: connection })
        setCursorPoint(point)
        return
      }

      const segments = applyExternalRectangleConnection(
        applyExternalRectangleConnection(
          buildSketchRectangleSegments(sketchRectangleDraft.start, point),
          sketchRectangleDraft.start,
          sketchRectangleDraft.startConnection,
        ),
        point,
        connection,
      )
      if (segments.length === 0) {
        return
      }

      createSketchLinesOnCurrentLevel(segments, '草图矩形')
      setSketchRectangleDraft(null)
      setCursorPoint(point)
      setWallSketchSnapResult(null)
      showWallEditFeedback(
        '已生成闭合草图轮廓。请选择一条边，可转换为墙体、楼板或区域。',
      )
    },
    [
      createSketchLinesOnCurrentLevel,
      setCursorPoint,
      setSketchRectangleDraft,
      setWallSketchSnapResult,
      showWallEditFeedback,
      sketchRectangleDraft,
    ],
  )

  const handleSketchCirclePlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      if (!sketchCircleDraft) {
        setSketchCircleDraft({ center: point, edge: point })
        setCursorPoint(point)
        return
      }

      const radius = getPointDistance(sketchCircleDraft.center, point)
      const createdId = createSketchCircleOnCurrentLevel({
        center: sketchCircleDraft.center,
        kind: 'circle',
        radius,
      })
      if (!createdId) {
        return
      }

      setSketchCircleDraft(null)
      setCursorPoint(point)
      setWallSketchSnapResult(null)
      showWallEditFeedback('已生成草图圆。')
    },
    [
      createSketchCircleOnCurrentLevel,
      setCursorPoint,
      setSketchCircleDraft,
      setWallSketchSnapResult,
      showWallEditFeedback,
      sketchCircleDraft,
    ],
  )

  const handleSketchArcPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      if (!sketchArcDraft) {
        setSketchArcDraft({ center: point, end: point })
        setCursorPoint(point)
        return
      }

      if (!sketchArcDraft.start) {
        if (getPointDistance(sketchArcDraft.center, point) <= SKETCH_EPSILON) {
          return
        }

        setSketchArcDraft({ ...sketchArcDraft, start: point, end: point })
        setCursorPoint(point)
        return
      }

      const radius = getPointDistance(sketchArcDraft.center, sketchArcDraft.start)
      if (getPointDistance(sketchArcDraft.start, point) <= SKETCH_EPSILON) {
        return
      }

      const createdId = createSketchCircleOnCurrentLevel({
        center: sketchArcDraft.center,
        kind: 'arc',
        radius,
        startAngle: getAngleFromCenter(sketchArcDraft.center, sketchArcDraft.start),
        endAngle: getAngleFromCenter(sketchArcDraft.center, point),
      })
      if (!createdId) {
        return
      }

      setSketchArcDraft(null)
      setCursorPoint(point)
      setWallSketchSnapResult(null)
      showWallEditFeedback('已生成草图圆弧。')
    },
    [
      createSketchCircleOnCurrentLevel,
      setCursorPoint,
      setSketchArcDraft,
      setWallSketchSnapResult,
      showWallEditFeedback,
      sketchArcDraft,
    ],
  )

  const openSketchDimensionInput = useCallback(
    (line: SketchLineNode, position?: SketchDimensionInputState['position']) => {
      setSketchDimensionInput({
        lineId: line.id,
        value: formatLengthInputValue(line.dimensions?.length ?? getSketchLineLength2D(line), unit),
        position,
      })
      setSelection({ selectedIds: [line.id] })
    },
    [setSelection, setSketchDimensionInput, unit],
  )

  const handleSketchDimensionInputCancel = useCallback(() => {
    setSketchDimensionInput(null)
  }, [setSketchDimensionInput])

  const handleSketchDimensionInputChange = useCallback(
    (value: string) => {
      setSketchDimensionInput((current) => (current ? { ...current, value } : current))
    },
    [setSketchDimensionInput],
  )

  const handleSketchDimensionInputSubmit = useCallback(
    (value: string) => {
      const current = sketchDimensionInput
      if (!current) {
        return
      }

      const line = sketchLineById.get(current.lineId)
      const length = parseSketchLengthInput(value, unit)
      if (!(line && length !== null)) {
        showWallEditFeedback('请输入有效的草图长度。')
        return
      }

      runSketchLineEditResult(buildSetSketchLineLengthPlan({ line, length }))
    },
    [runSketchLineEditResult, showWallEditFeedback, sketchDimensionInput, sketchLineById, unit],
  )

  const handleSelectedSketchLineSetLength = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line
      if (!line) {
        showWallEditFeedback('请选择一条草图线来标注尺寸。')
        return
      }

      openSketchDimensionInput(line)
    },
    [openSketchDimensionInput, selectedSketchLineEntry, showWallEditFeedback],
  )

  const getSelectedSketchActionLines = useCallback(() => {
    if (selectedSketchLineList.length > 0) {
      return selectedSketchLineList
    }

    return selectedSketchLineEntry?.line ? [selectedSketchLineEntry.line] : []
  }, [selectedSketchLineEntry, selectedSketchLineList])

  const applySketchLineNodeUpdates = useCallback(
    (updates: Array<{ id: AnyNodeId; data: Partial<AnyNode> }>, selectIds: AnyNodeId[]) => {
      if (updates.length === 0) {
        return
      }

      useScene.getState().updateNodes(updates)
      for (const update of updates) {
        useScene.getState().dirtyNodes.add(update.id)
      }
      setSelection({ selectedIds: selectIds })
      setSketchLineEditOperation(null)
      sfxEmitter.emit('sfx:structure-build')
    },
    [setSelection],
  )

  const handleSelectedSketchLineHorizontal = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line
      if (!line) {
        showWallEditFeedback('请选择一条草图线设为水平。')
        return
      }

      runSketchLineEditResult(buildOrientSketchLinePlan({ line, orientation: 'horizontal' }))
    },
    [runSketchLineEditResult, selectedSketchLineEntry, showWallEditFeedback],
  )

  const handleSketchLineTrimExtendToLine = useCallback(
    (targetLine: SketchLineNode) => {
      const primaryLine = selectedSketchLineEntry?.line ?? selectedSketchLineList[0]
      if (!primaryLine) {
        showWallEditFeedback('请先选择一条草图线，再点击另一条线进行修剪或延伸。')
        return true
      }

      if (primaryLine.id === targetLine.id) {
        showWallEditFeedback('请点击另一条草图线作为修剪或延伸目标。')
        return true
      }

      if (primaryLine.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再编辑。')
        return true
      }

      const intersection = getSketchLineIntersection(primaryLine, targetLine)
      if (!intersection) {
        showWallEditFeedback('平行草图线不能互相修剪或延伸。')
        return true
      }

      const endpoint = getNearestSketchEndpoint(primaryLine, intersection)
      const start = endpoint === 'start' ? intersection : primaryLine.start
      const end = endpoint === 'end' ? intersection : primaryLine.end
      if (!isSketchLineLongEnough(start, end)) {
        showWallEditFeedback('修剪或延伸后的线段太短。')
        return true
      }

      const connection = getSketchLineEndpointReferenceAtPoint(targetLine, intersection)
      updateNode(
        primaryLine.id as AnyNodeId,
        getSketchLineEndpointUpdate(
          primaryLine,
          endpoint,
          intersection,
          connection,
        ) as Partial<AnyNode>,
      )
      useScene.getState().dirtyNodes.add(primaryLine.id as AnyNodeId)
      setSelection({ selectedIds: [primaryLine.id] })
      setSketchLineEditOperation(null)
      sfxEmitter.emit('sfx:structure-build')
      showWallEditFeedback('草图线已修剪或延伸。')
      return true
    },
    [
      selectedSketchLineEntry,
      selectedSketchLineList,
      setSelection,
      showWallEditFeedback,
      updateNode,
    ],
  )

  const handleSketchLineSplitAtPoint = useCallback(
    (line: SketchLineNode, point: WallPlanPoint) => {
      if (!levelId) {
        return false
      }

      if (line.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再分割。')
        return true
      }

      const splitPoint = projectPointOntoSketchLine(line, point)
      if (
        !isSketchLineLongEnough(line.start, splitPoint) ||
        !isSketchLineLongEnough(splitPoint, line.end)
      ) {
        showWallEditFeedback('选中的草图线太短，无法分割。')
        return true
      }

      const relations = getSketchLineSplitRelations(line)
      const scene = useScene.getState()
      const newLine = SketchLineNodeSchema.parse({
        name: `${line.name ?? '草图线'} 分割`,
        start: splitPoint,
        end: line.end,
        construction: line.construction,
        relations,
        coincident: {
          start: { lineId: line.id, endpoint: 'end' },
          ...(line.coincident?.end ? { end: line.coincident.end } : {}),
        },
      })

      const oldEndReference: SketchLineEndpointReference = { lineId: line.id, endpoint: 'end' }
      const newEndReference: SketchLineEndpointReference = {
        lineId: newLine.id,
        endpoint: 'end',
      }
      const updates: Array<{ id: AnyNodeId; data: Partial<AnyNode> }> = [
        {
          id: line.id as AnyNodeId,
          data: {
            end: splitPoint,
            relations,
            dimensions: {},
            coincident: {
              ...(line.coincident ?? {}),
              end: { lineId: newLine.id, endpoint: 'start' },
            },
          } as Partial<AnyNode>,
        },
      ]

      for (const node of Object.values(scene.nodes)) {
        if (!(node?.type === 'sketch-line') || node.id === line.id) {
          continue
        }

        const coincident = retargetSketchLineCoincidentReference(
          node.coincident,
          oldEndReference,
          newEndReference,
        )
        if (!coincident) {
          continue
        }

        updates.push({
          id: node.id as AnyNodeId,
          data: { coincident } as Partial<AnyNode>,
        })
      }

      scene.createNode(newLine, levelId as AnyNodeId)
      scene.updateNodes(updates)
      for (const update of updates) {
        scene.dirtyNodes.add(update.id)
      }
      scene.dirtyNodes.add(newLine.id as AnyNodeId)
      setSelection({ selectedIds: [line.id, newLine.id] })
      sfxEmitter.emit('sfx:structure-build')
      setSketchLineEditOperation(null)
      showWallEditFeedback('草图线已分割。')
      return true
    },
    [levelId, setSelection, showWallEditFeedback],
  )

  const handleSketchLineOperationClick = useCallback(
    (line: SketchLineNode, point: WallPlanPoint) => {
      if (sketchLineEditOperation === 'split') {
        return handleSketchLineSplitAtPoint(line, point)
      }

      if (sketchLineEditOperation === 'trim-extend') {
        return handleSketchLineTrimExtendToLine(line)
      }

      return false
    },
    [handleSketchLineSplitAtPoint, handleSketchLineTrimExtendToLine, sketchLineEditOperation],
  )

  const handleSelectedSketchLineTrimExtend = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line ?? selectedSketchLineList[0]
      if (!line) {
        showWallEditFeedback('请选择一条草图线进行修剪或延伸。')
        return
      }

      if (line.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再编辑。')
        return
      }

      const nextOperation = sketchLineEditOperation === 'trim-extend' ? null : 'trim-extend'
      setSketchLineEditOperation(nextOperation)
      showWallEditFeedback(
        nextOperation
          ? '请点击另一条草图线作为修剪或延伸目标。'
          : '已取消草图修剪或延伸。',
      )
    },
    [
      selectedSketchLineEntry,
      selectedSketchLineList,
      showWallEditFeedback,
      sketchLineEditOperation,
    ],
  )

  const handleSelectedSketchLineSplit = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line
      if (!line) {
        showWallEditFeedback('请选择一条草图线进行分割。')
        return
      }

      if (line.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再分割。')
        return
      }

      const nextOperation = sketchLineEditOperation === 'split' ? null : 'split'
      setSketchLineEditOperation(nextOperation)
      showWallEditFeedback(
        nextOperation ? '请点击草图线上的分割位置。' : '已取消草图分割。',
      )
    },
    [selectedSketchLineEntry, showWallEditFeedback, sketchLineEditOperation],
  )

  const handleSelectedSketchLineOffset = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const lines = getSelectedSketchActionLines()
      if (lines.length === 0) {
        showWallEditFeedback('请选择要偏移的草图线。')
        return
      }

      const segments = lines.flatMap((line) => {
        const normal = getSketchLineNormal(line)
        return normal
          ? [translateSketchLineSegment(line, scalePoint(normal, DEFAULT_SKETCH_OFFSET_DISTANCE))]
          : []
      })
      if (segments.length === 0) {
        showWallEditFeedback('选中的草图线无法偏移。')
        return
      }

      createSketchLinesOnCurrentLevel(segments, '草图偏移')
      setSketchLineEditOperation(null)
      showWallEditFeedback('已创建草图偏移。')
    },
    [createSketchLinesOnCurrentLevel, getSelectedSketchActionLines, showWallEditFeedback],
  )

  const handleSelectedSketchLineMirror = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const lines = getSelectedSketchActionLines()
      if (lines.length === 0) {
        showWallEditFeedback('请选择要镜像的草图线。')
        return
      }

      const axisX = getSelectionCenterX(lines)
      createSketchLinesOnCurrentLevel(
        lines.map((line) => ({
          start: mirrorSketchPointAcrossVerticalAxis(line.start, axisX),
          end: mirrorSketchPointAcrossVerticalAxis(line.end, axisX),
          construction: line.construction,
          relations: getSketchLineSplitRelations(line),
        })),
        '草图镜像',
      )
      setSketchLineEditOperation(null)
      showWallEditFeedback('已沿选区中心线创建草图镜像。')
    },
    [createSketchLinesOnCurrentLevel, getSelectedSketchActionLines, showWallEditFeedback],
  )

  const handleSelectedSketchLineLinearPattern = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const lines = getSelectedSketchActionLines()
      const referenceLine = selectedSketchLineEntry?.line ?? lines[0]
      const direction = referenceLine ? getSketchLineDirection(referenceLine) : null
      if (!(referenceLine && direction)) {
        showWallEditFeedback('请选择一条草图线来创建阵列。')
        return
      }

      const segments: SketchLineCreateSegment[] = []
      for (let copyIndex = 1; copyIndex < DEFAULT_SKETCH_LINEAR_PATTERN_COUNT; copyIndex += 1) {
        const offset = scalePoint(direction, DEFAULT_SKETCH_LINEAR_PATTERN_SPACING * copyIndex)
        for (const line of lines) {
          segments.push(translateSketchLineSegment(line, offset))
        }
      }

      createSketchLinesOnCurrentLevel(segments, '草图阵列')
      setSketchLineEditOperation(null)
      showWallEditFeedback('已创建草图线性阵列。')
    },
    [
      createSketchLinesOnCurrentLevel,
      getSelectedSketchActionLines,
      selectedSketchLineEntry,
      showWallEditFeedback,
    ],
  )

  const handleSelectedSketchLinesEqualLength = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const lines = getSelectedSketchActionLines()
      const [referenceLine, ...targetLines] = lines
      if (!(referenceLine && targetLines.length > 0)) {
        showWallEditFeedback('请选择两条或更多草图线设为等长。')
        return
      }

      const length = getSketchLineLength2D(referenceLine)
      const updates: Array<{ id: AnyNodeId; data: Partial<AnyNode> }> = []
      for (const line of targetLines) {
        const result = buildSetSketchLineLengthPlan({ line, length })
        if (!result.ok) {
          showWallEditFeedback(result.reason)
          return
        }

        updates.push(
          ...result.updates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
        )
      }

      applySketchLineNodeUpdates(
        updates,
        lines.map((line) => line.id as AnyNodeId),
      )
      showWallEditFeedback('草图线已设为等长。')
    },
    [applySketchLineNodeUpdates, getSelectedSketchActionLines, showWallEditFeedback],
  )

  const handleSelectedSketchLineCornerConnector = useCallback(
    (kind: 'Chamfer' | 'Fillet') => {
      const actionLabel = kind === 'Fillet' ? '圆角' : '倒角'
      const [firstLine, secondLine] = getSelectedSketchActionLines()
      if (!(firstLine && secondLine)) {
        showWallEditFeedback(`请选择两条草图线进行${actionLabel}。`)
        return
      }

      if (firstLine.relations?.includes('fixed') || secondLine.relations?.includes('fixed')) {
        showWallEditFeedback('存在已固定草图线，请先解除固定再编辑转角。')
        return
      }

      if (!levelId) {
        return
      }

      const intersection = getSketchLineIntersection(firstLine, secondLine)
      if (!intersection) {
        showWallEditFeedback(`平行草图线无法进行${actionLabel}。`)
        return
      }

      const firstEndpoint = getNearestSketchEndpoint(firstLine, intersection)
      const secondEndpoint = getNearestSketchEndpoint(secondLine, intersection)
      const firstPoint = getCornerTrimPoint(
        firstLine,
        intersection,
        firstEndpoint,
        DEFAULT_SKETCH_CORNER_DISTANCE,
      )
      const secondPoint = getCornerTrimPoint(
        secondLine,
        intersection,
        secondEndpoint,
        DEFAULT_SKETCH_CORNER_DISTANCE,
      )
      if (!(firstPoint && secondPoint && isSketchLineLongEnough(firstPoint, secondPoint))) {
        showWallEditFeedback(`选中的转角太短，无法${actionLabel}。`)
        return
      }

      const scene = useScene.getState()
      const connector = SketchLineNodeSchema.parse({
        name: `草图${actionLabel}`,
        start: firstPoint,
        end: secondPoint,
        construction: firstLine.construction && secondLine.construction,
        coincident: {
          start: { lineId: firstLine.id, endpoint: firstEndpoint },
          end: { lineId: secondLine.id, endpoint: secondEndpoint },
        },
      })

      const updates: Array<{ id: AnyNodeId; data: Partial<AnyNode> }> = [
        {
          id: firstLine.id as AnyNodeId,
          data: getSketchLineEndpointUpdate(firstLine, firstEndpoint, firstPoint, {
            lineId: connector.id,
            endpoint: 'start',
          }) as Partial<AnyNode>,
        },
        {
          id: secondLine.id as AnyNodeId,
          data: getSketchLineEndpointUpdate(secondLine, secondEndpoint, secondPoint, {
            lineId: connector.id,
            endpoint: 'end',
          }) as Partial<AnyNode>,
        },
      ]

      scene.createNode(connector, levelId as AnyNodeId)
      scene.updateNodes(updates)
      for (const update of updates) {
        scene.dirtyNodes.add(update.id)
      }
      scene.dirtyNodes.add(connector.id as AnyNodeId)
      setSelection({ selectedIds: [firstLine.id, secondLine.id, connector.id] })
      setSketchLineEditOperation(null)
      sfxEmitter.emit('sfx:structure-build')
      showWallEditFeedback(
        kind === 'Fillet'
          ? '已创建草图圆角；在支持草图圆弧前，暂以连接线表示。'
          : '已创建草图倒角。',
      )
    },
    [getSelectedSketchActionLines, levelId, setSelection, showWallEditFeedback],
  )

  const handleSelectedSketchLineFillet = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      handleSelectedSketchLineCornerConnector('Fillet')
    },
    [handleSelectedSketchLineCornerConnector],
  )

  const handleSelectedSketchLineChamfer = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      handleSelectedSketchLineCornerConnector('Chamfer')
    },
    [handleSelectedSketchLineCornerConnector],
  )

  const handleSelectedSketchLineVertical = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line
      if (!line) {
        showWallEditFeedback('请选择一条草图线设为垂直。')
        return
      }

      runSketchLineEditResult(buildOrientSketchLinePlan({ line, orientation: 'vertical' }))
    },
    [runSketchLineEditResult, selectedSketchLineEntry, showWallEditFeedback],
  )

  const handleSelectedSketchLineToggleFixed = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line
      if (!line) {
        showWallEditFeedback('请选择一条草图线进行固定。')
        return
      }

      const relations = new Set(line.relations ?? [])
      if (relations.has('fixed')) {
        relations.delete('fixed')
      } else {
        relations.add('fixed')
      }

      updateNode(line.id as AnyNodeId, { relations: [...relations] } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(line.id as AnyNodeId)
      setSelection({ selectedIds: [line.id] })
      sfxEmitter.emit('sfx:structure-build')
    },
    [selectedSketchLineEntry, setSelection, showWallEditFeedback, updateNode],
  )

  const handleSelectedSketchLineToggleConstruction = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line
      if (!line) {
        showWallEditFeedback('请选择一条草图线切换参考线模式。')
        return
      }

      updateNode(line.id as AnyNodeId, { construction: !line.construction } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(line.id as AnyNodeId)
      setSelection({ selectedIds: [line.id] })
      sfxEmitter.emit('sfx:structure-build')
    },
    [selectedSketchLineEntry, setSelection, showWallEditFeedback, updateNode],
  )

  const handleSelectedSketchLineDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const lines =
        selectedSketchLineList.length > 0
          ? selectedSketchLineList
          : selectedSketchLineEntry?.line
            ? [selectedSketchLineEntry.line]
            : []
      if (lines.length === 0) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      for (const line of lines) {
        deleteNode(line.id as AnyNodeId)
      }
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedSketchLineEntry, selectedSketchLineList, setSelection],
  )

  const sketchLineActionMenuExtraActions = useMemo<NodeActionMenuExtraAction[]>(() => {
    const isFixed = Boolean(selectedSketchLineEntry?.line.relations?.includes('fixed'))
    const isConstruction = Boolean(selectedSketchLineEntry?.line.construction)

    const actions: NodeActionMenuExtraAction[] = [
      {
        id: 'sketch-line-create-wall',
        label: '生成墙体',
        icon: <Icon height={16} icon="mdi:walls" width={16} />,
        onClick: createWallFromSelectedSketchLine,
      },
      {
        id: 'sketch-line-set-length',
        label: '智能尺寸',
        icon: <Icon height={16} icon="mdi:ruler-square" width={16} />,
        onClick: handleSelectedSketchLineSetLength,
      },
      {
        id: 'sketch-line-horizontal',
        label: '水平',
        icon: <Icon height={16} icon="mdi:format-horizontal-align-center" width={16} />,
        onClick: handleSelectedSketchLineHorizontal,
        active: selectedSketchLineEntry?.line.relations?.includes('horizontal'),
      },
      {
        id: 'sketch-line-vertical',
        label: '垂直',
        icon: <Icon height={16} icon="mdi:format-vertical-align-center" width={16} />,
        onClick: handleSelectedSketchLineVertical,
        active: selectedSketchLineEntry?.line.relations?.includes('vertical'),
      },
      {
        id: 'sketch-line-fixed',
        label: '固定',
        icon: <Icon height={16} icon="mdi:lock-outline" width={16} />,
        onClick: handleSelectedSketchLineToggleFixed,
        active: isFixed,
      },
      {
        id: 'sketch-line-construction',
        label: '参考线',
        icon: <Icon height={16} icon="mdi:vector-line" width={16} />,
        onClick: handleSelectedSketchLineToggleConstruction,
        active: isConstruction,
      },
      {
        id: 'sketch-line-trim-extend',
        label: '修剪/延伸',
        icon: <Icon height={16} icon="mdi:vector-line" width={16} />,
        onClick: handleSelectedSketchLineTrimExtend,
        active: sketchLineEditOperation === 'trim-extend',
      },
      {
        id: 'sketch-line-split',
        label: '分割',
        icon: <Icon height={16} icon="mdi:call-split" width={16} />,
        onClick: handleSelectedSketchLineSplit,
        active: sketchLineEditOperation === 'split',
      },
      {
        id: 'sketch-line-offset',
        label: '偏移',
        icon: <Icon height={16} icon="mdi:arrow-expand-horizontal" width={16} />,
        onClick: handleSelectedSketchLineOffset,
      },
      {
        id: 'sketch-line-equal-length',
        label: '等长',
        icon: <Icon height={16} icon="mdi:equal" width={16} />,
        onClick: handleSelectedSketchLinesEqualLength,
      },
      {
        id: 'sketch-line-fillet',
        label: '圆角',
        icon: <Icon height={16} icon="mdi:vector-radius" width={16} />,
        onClick: handleSelectedSketchLineFillet,
      },
      {
        id: 'sketch-line-mirror',
        label: '镜像',
        icon: <Icon height={16} icon="mdi:mirror" width={16} />,
        onClick: handleSelectedSketchLineMirror,
      },
      {
        id: 'sketch-line-linear-pattern',
        label: '线性阵列',
        icon: <Icon height={16} icon="mdi:grid" width={16} />,
        onClick: handleSelectedSketchLineLinearPattern,
      },
      {
        id: 'sketch-line-chamfer',
        label: '倒角',
        icon: <Icon height={16} icon="mdi:vector-polyline-edit" width={16} />,
        onClick: handleSelectedSketchLineChamfer,
      },
    ]

    if (selectedSketchProfile) {
      actions.push(
        {
          id: 'sketch-profile-walls',
          label: '生成墙体',
          icon: <Icon height={16} icon="mdi:walls" width={16} />,
          onClick: createWallsFromSelectedSketchProfile,
        },
        {
          id: 'sketch-profile-slab',
          label: '生成楼板',
          icon: <Icon height={16} icon="mdi:layers-plus" width={16} />,
          onClick: createSlabFromSelectedSketchProfile,
        },
        {
          id: 'sketch-profile-zone',
          label: '生成区域',
          icon: <Icon height={16} icon="mdi:shape-square-plus" width={16} />,
          onClick: createZoneFromSelectedSketchProfile,
        },
      )
    }

    return actions
  }, [
    createWallFromSelectedSketchLine,
    createSlabFromSelectedSketchProfile,
    createWallsFromSelectedSketchProfile,
    createZoneFromSelectedSketchProfile,
    handleSelectedSketchLineChamfer,
    handleSelectedSketchLineFillet,
    handleSelectedSketchLineHorizontal,
    handleSelectedSketchLineLinearPattern,
    handleSelectedSketchLineMirror,
    handleSelectedSketchLineOffset,
    handleSelectedSketchLineSetLength,
    handleSelectedSketchLineSplit,
    handleSelectedSketchLineTrimExtend,
    handleSelectedSketchLineToggleConstruction,
    handleSelectedSketchLineToggleFixed,
    handleSelectedSketchLineVertical,
    handleSelectedSketchLinesEqualLength,
    selectedSketchLineEntry,
    selectedSketchProfile,
    sketchLineEditOperation,
  ])

  return {
    createSketchLineOnCurrentLevel,
    createSketchLinesOnCurrentLevel,
    createSketchCircleOnCurrentLevel,
    runSketchLineEditResult,
    handleSketchLinePlacementPoint,
    handleSketchRectanglePlacementPoint,
    handleSketchCirclePlacementPoint,
    handleSketchArcPlacementPoint,
    handleSketchLineSplitAtPoint,
    handleSketchLineOperationClick,
    sketchLineEditOperation,
    openSketchDimensionInput,
    handleSketchDimensionInputCancel,
    handleSketchDimensionInputChange,
    handleSketchDimensionInputSubmit,
    handleSelectedSketchLineDelete,
    sketchLineActionMenuExtraActions,
  }
}
