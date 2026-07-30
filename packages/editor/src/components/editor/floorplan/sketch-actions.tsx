'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type CeilingNode,
  createExtrudeCutStepFromProfile,
  createFeatureDefinitionFromLegacyNode,
  FeatureCut as FeatureCutSchema,
  type FeatureNode,
  FeatureNode as FeatureNodeSchema,
  normalizeWallCurveOffset,
  pointInPolygon,
  type SketchCircleNode,
  SketchCircleNode as SketchCircleNodeSchema,
  type SketchDimensionNode,
  type SketchLineNode,
  SketchLineNode as SketchLineNodeSchema,
  type SlabNode,
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
import useEditor, { type SketchPlane } from '../../../store/use-editor'
import {
  isSketchCircleConstraintActive,
  type SketchCircleEditResult,
} from '../../tools/sketch/sketch-circle-constraints'
import type { SketchCircleCreateSpec } from '../../tools/sketch/sketch-circle-transforms'
import { getSketchEndpointReferenceFromSnapTarget } from '../../tools/sketch/sketch-coincident'
import {
  buildSketchRectangleSegments,
  detectClosedSketchProfiles,
  getSketchProfileUnsupportedReason,
  isSketchLineLongEnough,
  type SketchLineEditResult,
  type SketchProfile,
} from '../../tools/sketch/sketch-geometry'
import { isSketchLineConstraintActive } from '../../tools/sketch/sketch-line-constraints'
import { buildResolvedSketchLineUpdateSet } from '../../tools/sketch/sketch-line-resolution'
import { buildPropagateSketchLineTangentsFromCircles } from '../../tools/sketch/sketch-line-tangent'
import { createWallOnCurrentLevel, type WallPlanPoint } from '../../tools/wall/wall-drafting'
import type { WallSketchSnapTarget } from '../../tools/wall/wall-sketch'
import type { NodeActionMenuExtraAction } from '../node-action-menu'
import {
  addLocalCoincidentReferences,
  applyExternalRectangleConnection,
  buildSketchLineCoincident,
  type FloorplanSketchLineEntry,
  getAngleFromCenter,
  getPointDistance,
  SKETCH_EPSILON,
  type SketchCircleOperation,
  type SketchLineCreateConnections,
  type SketchLineCreateSegment,
  type SketchLineOperation,
  type UnitSystem,
} from './sketch-action-helpers'
import {
  buildSketchCircleActionMenuExtraActions,
  buildSketchLineActionMenuExtraActions,
} from './sketch-action-menu'
import { useFloorplanSketchCircleActions } from './sketch-circle-actions'
import { useFloorplanSketchDimensionActions } from './sketch-dimension-actions'
import { useFloorplanSketchLineActions } from './sketch-line-actions'
import type {
  SketchArcDraft,
  SketchCircleDraft,
  SketchDimensionInputState,
  SketchDistanceDimensionDraft,
  SketchLineDraft,
  SketchRectangleDraft,
} from './sketch-state'

export type { FloorplanSketchLineEntry } from './sketch-action-helpers'

const DEFAULT_SKETCH_OFFSET_DISTANCE = 0.5
const DEFAULT_SKETCH_LINEAR_PATTERN_SPACING = 1
const DEFAULT_SKETCH_LINEAR_PATTERN_COUNT = 3
const DEFAULT_SKETCH_CORNER_DISTANCE = 0.5
const DEFAULT_SKETCH_EXTRUDE_DEPTH = 2.8
const DEFAULT_FACE_SKETCH_EXTRUDE_DEPTH = 0.2
const DEFAULT_SKETCH_REVOLVE_ANGLE = Math.PI * 2

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getActiveSketchPlaneMetadata(): Record<string, unknown> {
  const plane = useEditor.getState().sketchPlane
  if (!plane) {
    return {}
  }

  return {
    sketchPlane: plane,
  }
}

function isNumberTuple3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function getSketchPlaneFromNode(
  node: { metadata?: unknown } | null | undefined,
): SketchPlane | null {
  if (!isRecord(node?.metadata)) {
    return null
  }

  const rawPlane = node.metadata.sketchPlane
  if (!isRecord(rawPlane)) {
    return null
  }

  if (rawPlane.kind === 'feature-top') {
    if (
      typeof rawPlane.targetNodeId !== 'string' ||
      !(typeof rawPlane.elevation === 'number' && Number.isFinite(rawPlane.elevation))
    ) {
      return null
    }

    return {
      kind: 'feature-top',
      targetNodeId: rawPlane.targetNodeId as AnyNodeId,
      elevation: rawPlane.elevation,
    }
  }

  if (rawPlane.kind !== 'feature-face') {
    return null
  }

  if (
    typeof rawPlane.targetNodeId !== 'string' ||
    !isNumberTuple3(rawPlane.origin) ||
    !isNumberTuple3(rawPlane.uAxis) ||
    !isNumberTuple3(rawPlane.vAxis) ||
    !isNumberTuple3(rawPlane.normal)
  ) {
    return null
  }

  return {
    kind: 'feature-face',
    targetNodeId: rawPlane.targetNodeId as AnyNodeId,
    space:
      rawPlane.space === 'scene' || rawPlane.space === 'target-local' ? rawPlane.space : undefined,
    origin: rawPlane.origin,
    uAxis: rawPlane.uAxis,
    vAxis: rawPlane.vAxis,
    normal: rawPlane.normal,
    label: typeof rawPlane.label === 'string' ? rawPlane.label : undefined,
  }
}

function getSketchPlaneFromProfile(
  profile: SketchProfile,
  nodes: Readonly<Record<string, AnyNode>>,
): SketchPlane | null {
  for (const lineId of profile.lineIds) {
    const plane = getSketchPlaneFromNode(nodes[lineId])
    if (plane) {
      return plane
    }
  }

  for (const circleId of profile.circleIds ?? []) {
    const plane = getSketchPlaneFromNode(nodes[circleId])
    if (plane) {
      return plane
    }
  }

  return null
}

function getSketchPlaneBaseElevation(plane: SketchPlane | null) {
  return plane?.kind === 'feature-top' ? plane.elevation : 0
}

function buildFeatureProfileFromSketchProfile(profile: SketchProfile) {
  return {
    kind: 'sketch-profile' as const,
    lineIds: profile.lineIds,
    circleIds: profile.circleIds ?? [],
    points: profile.points,
    holes: (profile.holes ?? []).map((hole) => ({
      kind: 'sketch-profile' as const,
      lineIds: hole.lineIds,
      circleIds: hole.circleIds ?? [],
      points: hole.points,
    })),
  }
}

function polygonArea(points: Array<[number, number]>) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!(current && next)) continue
    area += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(area) / 2
}

function getProfileMinX(points: Array<[number, number]>) {
  return points.reduce((minX, [x]) => Math.min(minX, x), Number.POSITIVE_INFINITY)
}

function isVerticalConstructionAxisLine(line: SketchLineNode) {
  const dx = Math.abs(line.end[0] - line.start[0])
  const dy = Math.abs(line.end[1] - line.start[1])
  return Boolean(line.construction && dy > SKETCH_EPSILON && dx <= 1e-4)
}

function getSelectedRevolveAxisLine(
  selectedLines: SketchLineNode[],
  profile: SketchProfile,
): SketchLineNode | null {
  const profileLineIds = new Set(profile.lineIds)
  return (
    selectedLines.find(
      (line) => !profileLineIds.has(line.id) && isVerticalConstructionAxisLine(line),
    ) ?? null
  )
}

function polygonContainsPolygon(outer: Array<[number, number]>, inner: Array<[number, number]>) {
  return inner.length >= 3 && inner.every(([x, z]) => pointInPolygon(x, z, outer))
}

function haveSameLineIds(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length) return false
  const secondIds = new Set(second)
  return first.every((id) => secondIds.has(id))
}

function isCutProfileInsideSurface(
  profilePoints: Array<[number, number]>,
  surface: Pick<SlabNode | CeilingNode, 'polygon' | 'holes'>,
) {
  if (!polygonContainsPolygon(surface.polygon, profilePoints)) return false
  return !(surface.holes ?? []).some((hole) => polygonContainsPolygon(hole, profilePoints))
}

function isCutProfileInsideFeature(profile: SketchProfile, feature: FeatureNode) {
  if (feature.kind !== 'extrude' || feature.operation !== 'add') return false
  if (polygonArea(profile.points) >= polygonArea(feature.profile.points) - 1e-6) return false
  if (haveSameLineIds(profile.lineIds, feature.profile.lineIds)) return false
  if (!polygonContainsPolygon(feature.profile.points, profile.points)) return false

  return !feature.cuts.some((cut) => haveSameLineIds(profile.lineIds, cut.profile.lineIds))
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
  sketchDistanceDimensionDraft: SketchDistanceDimensionDraft | null
  setSketchLineDraft: Dispatch<SetStateAction<SketchLineDraft | null>>
  setSketchRectangleDraft: Dispatch<SetStateAction<SketchRectangleDraft | null>>
  setSketchCircleDraft: Dispatch<SetStateAction<SketchCircleDraft | null>>
  setSketchArcDraft: Dispatch<SetStateAction<SketchArcDraft | null>>
  setSketchDimensionInput: Dispatch<SetStateAction<SketchDimensionInputState | null>>
  setSketchDistanceDimensionDraft: Dispatch<SetStateAction<SketchDistanceDimensionDraft | null>>
  sketchDimensions: SketchDimensionNode[]
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  sketchCircleById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  selectedSketchLineEntry: FloorplanSketchLineEntry | null
  selectedSketchLineList: SketchLineNode[]
  selectedSketchCircleEntry: SketchCircleNode | null
  selectedSketchCircleList: SketchCircleNode[]
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

export function useFloorplanSketchActions({
  levelId,
  tool,
  unit,
  sketchLineDraft,
  sketchRectangleDraft,
  sketchCircleDraft,
  sketchArcDraft,
  sketchDimensionInput,
  sketchDistanceDimensionDraft,
  setSketchLineDraft,
  setSketchRectangleDraft,
  setSketchCircleDraft,
  setSketchArcDraft,
  setSketchDimensionInput,
  setSketchDistanceDimensionDraft,
  sketchDimensions,
  sketchLineById,
  sketchCircleById,
  selectedSketchLineEntry,
  selectedSketchLineList,
  selectedSketchCircleEntry,
  selectedSketchCircleList,
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
  const [sketchCircleEditOperation, setSketchCircleEditOperation] =
    useState<SketchCircleOperation | null>(null)

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
        metadata: getActiveSketchPlaneMetadata(),
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
            metadata: getActiveSketchPlaneMetadata(),
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
        metadata: getActiveSketchPlaneMetadata(),
      })

      createNode(sketchCircle, levelId as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [sketchCircle.id] })
      return sketchCircle.id
    },
    [levelId, setSelection],
  )

  const createSketchCirclesOnCurrentLevel = useCallback(
    (circles: SketchCircleCreateSpec[], namePrefix = '草图圆') => {
      if (!levelId) {
        return []
      }

      const validCircles = circles.filter(
        (circle) => Number.isFinite(circle.radius) && circle.radius > SKETCH_EPSILON,
      )
      if (validCircles.length === 0) {
        return []
      }

      const { createNodes, nodes } = useScene.getState()
      const sketchCircleCount = Object.values(nodes).filter(
        (node) => node.type === 'sketch-circle',
      ).length
      const createdCircles = validCircles.map((circle, index) =>
        SketchCircleNodeSchema.parse({
          name: `${namePrefix} ${sketchCircleCount + index + 1}`,
          center: circle.center,
          kind: circle.kind,
          radius: circle.radius,
          startAngle: circle.startAngle,
          endAngle: circle.endAngle,
          construction: circle.construction,
          relations: circle.relations,
          dimensions: { radius: circle.radius },
          metadata: getActiveSketchPlaneMetadata(),
        }),
      )

      createNodes(
        createdCircles.map((circle) => ({
          node: circle,
          parentId: levelId as AnyNodeId,
        })),
      )
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: createdCircles.map((circle) => circle.id) })
      return createdCircles.map((circle) => circle.id)
    },
    [levelId, setSelection],
  )

  const runSketchLineEditResult = useCallback(
    (result: SketchLineEditResult) => {
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return false
      }

      const resolvedUpdates = buildResolvedSketchLineUpdateSet({
        linesById: sketchLineById,
        circlesById: sketchCircleById,
        initialUpdates: result.updates.map((update) => ({
          id: update.id,
          data: update.data,
        })),
      })
      if (!resolvedUpdates.ok) {
        showWallEditFeedback(resolvedUpdates.reason)
        return false
      }

      const allUpdates = resolvedUpdates.updates.map((update) => ({
        id: update.id as AnyNodeId,
        data: update.data as Partial<AnyNode>,
      }))
      useScene.getState().updateNodes(allUpdates)
      for (const update of allUpdates) {
        useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
      }
      setSelection({ selectedIds: result.selectIds ?? allUpdates.map((update) => update.id) })
      sfxEmitter.emit('sfx:structure-build')
      setSketchDimensionInput(null)
      return true
    },
    [setSelection, setSketchDimensionInput, showWallEditFeedback, sketchCircleById, sketchLineById],
  )

  const runSketchCircleEditResult = useCallback(
    (result: SketchCircleEditResult) => {
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return false
      }

      const nextCircleById = new Map(sketchCircleById)
      for (const update of result.updates) {
        const circle = nextCircleById.get(update.id)
        if (!circle) {
          continue
        }
        nextCircleById.set(update.id, { ...circle, ...update.data })
      }

      const tangentPropagation = buildPropagateSketchLineTangentsFromCircles({
        circlesById: nextCircleById,
        linesById: sketchLineById,
        changedCircleIds: result.updates.map((update) => update.id),
      })
      if (!tangentPropagation.ok) {
        showWallEditFeedback(tangentPropagation.reason)
        return false
      }

      const resolvedLineUpdates = buildResolvedSketchLineUpdateSet({
        linesById: sketchLineById,
        circlesById: nextCircleById,
        initialUpdates: tangentPropagation.updates.map((update) => ({
          id: update.id,
          data: update.data,
        })),
        changedCircleIds: result.updates.map((update) => update.id),
      })
      if (!resolvedLineUpdates.ok) {
        showWallEditFeedback(resolvedLineUpdates.reason)
        return false
      }

      const allUpdates = [
        ...result.updates.map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        })),
        ...resolvedLineUpdates.updates.map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        })),
      ]

      if (allUpdates.length > 0) {
        useScene.getState().updateNodes(allUpdates)
        for (const update of allUpdates) {
          useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
        }
        sfxEmitter.emit('sfx:structure-build')
      }

      if (result.selectIds) {
        setSelection({ selectedIds: result.selectIds })
      }
      setSketchDimensionInput(null)
      return true
    },
    [setSelection, setSketchDimensionInput, showWallEditFeedback, sketchCircleById, sketchLineById],
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
        { allowHoles: true },
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

  const createExtrudeFromSelectedSketchProfile = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!levelId) {
        showWallEditFeedback('请先选择楼层。')
        return
      }
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

      const { createNode, nodes } = useScene.getState()
      const sketchPlane = getSketchPlaneFromProfile(selectedSketchProfile, nodes)
      const extrudeDepth =
        sketchPlane?.kind === 'feature-face'
          ? DEFAULT_FACE_SKETCH_EXTRUDE_DEPTH
          : DEFAULT_SKETCH_EXTRUDE_DEPTH
      const featureCount = Object.values(nodes).filter((node) => node.type === 'feature').length
      const feature = FeatureNodeSchema.parse({
        name: `拉伸 ${featureCount + 1}`,
        kind: 'extrude',
        operation: 'add',
        profile: buildFeatureProfileFromSketchProfile(selectedSketchProfile),
        depth: extrudeDepth,
        baseElevation: getSketchPlaneBaseElevation(sketchPlane),
        metadata: {
          sketchSource: {
            kind: 'profile',
            lineIds: selectedSketchProfile.lineIds,
            circleIds: selectedSketchProfile.circleIds ?? [],
          },
          ...(sketchPlane
            ? {
                sketchPlane,
                sourceFeatureId: sketchPlane.targetNodeId,
              }
            : {}),
        },
      })

      createNode(
        {
          ...feature,
          definition: createFeatureDefinitionFromLegacyNode(feature),
        },
        levelId as AnyNodeId,
      )
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [feature.id] })
    },
    [levelId, selectedSketchProfile, setSelection, showWallEditFeedback, sketchProfiles],
  )

  const createRevolveFromSelectedSketchProfile = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!levelId) {
        showWallEditFeedback('请先选择楼层。')
        return
      }
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

      const { createNode, nodes } = useScene.getState()
      const sketchPlane = getSketchPlaneFromProfile(selectedSketchProfile, nodes)
      if (sketchPlane?.kind === 'feature-face') {
        showWallEditFeedback('实体面草图暂不支持旋转，请使用拉伸生成凸台。')
        return
      }
      const featureCount = Object.values(nodes).filter((node) => node.type === 'feature').length
      const axisLine = getSelectedRevolveAxisLine(selectedSketchLineList, selectedSketchProfile)
      const profileAxisX = getProfileMinX(selectedSketchProfile.points)
      const revolveAxisX = axisLine ? axisLine.start[0] : profileAxisX
      const feature = FeatureNodeSchema.parse({
        name: `旋转 ${featureCount + 1}`,
        kind: 'revolve',
        operation: 'add',
        profile: {
          kind: 'sketch-profile',
          lineIds: selectedSketchProfile.lineIds,
          circleIds: selectedSketchProfile.circleIds ?? [],
          points: selectedSketchProfile.points,
        },
        depth: DEFAULT_SKETCH_EXTRUDE_DEPTH,
        baseElevation: getSketchPlaneBaseElevation(sketchPlane),
        revolveAxisX: Number.isFinite(revolveAxisX) ? revolveAxisX : 0,
        revolveAxisLineId: axisLine?.id,
        revolveAngle: DEFAULT_SKETCH_REVOLVE_ANGLE,
        metadata: {
          sketchSource: {
            kind: 'profile',
            lineIds: selectedSketchProfile.lineIds,
            circleIds: selectedSketchProfile.circleIds ?? [],
          },
          ...(sketchPlane
            ? {
                sketchPlane,
                sourceFeatureId: sketchPlane.targetNodeId,
              }
            : {}),
        },
      })

      createNode(
        {
          ...feature,
          definition: createFeatureDefinitionFromLegacyNode(feature),
        },
        levelId as AnyNodeId,
      )
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [feature.id] })
    },
    [
      levelId,
      selectedSketchLineList,
      selectedSketchProfile,
      setSelection,
      showWallEditFeedback,
      sketchProfiles,
    ],
  )

  const cutFromSelectedSketchProfile = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!levelId) {
        showWallEditFeedback('请先选择楼层。')
        return
      }
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

      const { nodes, updateNodes } = useScene.getState()
      const profilePoints = selectedSketchProfile.points.map(([x, z]) => [x, z] as [number, number])
      const sketchPlane = getSketchPlaneFromProfile(selectedSketchProfile, nodes)
      if (sketchPlane?.kind === 'feature-face') {
        const targetNode = nodes[sketchPlane.targetNodeId]
        if (!(targetNode?.type === 'feature' && targetNode.parentId === levelId)) {
          showWallEditFeedback('未找到这个实体面对应的拉伸体。')
          return
        }

        const cut = FeatureCutSchema.parse({
          profile: {
            kind: 'sketch-profile',
            lineIds: selectedSketchProfile.lineIds,
            circleIds: selectedSketchProfile.circleIds ?? [],
            points: profilePoints,
          },
        })
        const definition =
          targetNode.definition ?? createFeatureDefinitionFromLegacyNode(targetNode)
        const faceCutCount = definition.steps.filter(
          (step) => step.kind === 'extrude-cut' && step.sketchPlane?.kind === 'feature-face',
        ).length
        const faceCutStep = createExtrudeCutStepFromProfile(cut.profile, faceCutCount, {
          sketchPlane,
          targetIds: [targetNode.id],
        })
        updateNodes([
          {
            id: targetNode.id as AnyNodeId,
            data: {
              definition: {
                ...definition,
                steps: [...definition.steps, faceCutStep],
                rebuild: {
                  status: 'warning',
                  message: '侧面切除步骤已添加，等待重建。',
                },
              },
            } as Partial<AnyNode>,
          },
        ])
        useScene.getState().dirtyNodes.add(targetNode.id as AnyNodeId)
        sfxEmitter.emit('sfx:structure-build')
        setSelection({ selectedIds: [targetNode.id] })
        return
      }
      const updates: Array<{ id: AnyNodeId; data: Partial<AnyNode> }> = []
      const targetIds: AnyNodeId[] = []

      for (const node of Object.values(nodes)) {
        if (node.parentId !== levelId) continue

        if (sketchPlane && node.id !== sketchPlane.targetNodeId) continue

        if (
          !sketchPlane &&
          node.type === 'slab' &&
          isCutProfileInsideSurface(profilePoints, node)
        ) {
          const currentHoles = node.holes ?? []
          const currentMetadata = currentHoles.map(
            (_, index) => node.holeMetadata?.[index] ?? { source: 'manual' as const },
          )
          updates.push({
            id: node.id as AnyNodeId,
            data: {
              holes: [...currentHoles, profilePoints],
              holeMetadata: [...currentMetadata, { source: 'manual' }],
            } as Partial<AnyNode>,
          })
          targetIds.push(node.id as AnyNodeId)
        }

        if (
          !sketchPlane &&
          node.type === 'ceiling' &&
          isCutProfileInsideSurface(profilePoints, node)
        ) {
          const currentHoles = node.holes ?? []
          const currentMetadata = currentHoles.map(
            (_, index) => node.holeMetadata?.[index] ?? { source: 'manual' as const },
          )
          updates.push({
            id: node.id as AnyNodeId,
            data: {
              holes: [...currentHoles, profilePoints],
              holeMetadata: [...currentMetadata, { source: 'manual' }],
            } as Partial<AnyNode>,
          })
          targetIds.push(node.id as AnyNodeId)
        }

        if (node.type === 'feature' && isCutProfileInsideFeature(selectedSketchProfile, node)) {
          const cut = FeatureCutSchema.parse({
            profile: {
              kind: 'sketch-profile',
              lineIds: selectedSketchProfile.lineIds,
              circleIds: selectedSketchProfile.circleIds ?? [],
              points: profilePoints,
            },
          })
          const definition = node.definition
            ? {
                ...node.definition,
                steps: [
                  ...node.definition.steps,
                  createExtrudeCutStepFromProfile(cut.profile, node.cuts.length),
                ],
                rebuild: { status: 'warning' as const, message: '切割步骤已添加，等待重建。' },
              }
            : undefined
          updates.push({
            id: node.id as AnyNodeId,
            data: {
              cuts: [...node.cuts, cut],
              ...(definition ? { definition } : {}),
            } as Partial<AnyNode>,
          })
          targetIds.push(node.id as AnyNodeId)
        }
      }

      if (updates.length === 0) {
        showWallEditFeedback('未找到可切割的楼板、吊顶或拉伸体。请确认切割轮廓位于目标内部。')
        return
      }

      updateNodes(updates)
      for (const update of updates) {
        useScene.getState().dirtyNodes.add(update.id)
      }
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: targetIds })
    },
    [levelId, selectedSketchProfile, setSelection, showWallEditFeedback, sketchProfiles],
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
        showWallEditFeedback('已生成闭合草图轮廓。请选择一条边，可转换为墙体、楼板或区域。')
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
      showWallEditFeedback('已生成闭合草图轮廓。请选择一条边，可转换为墙体、楼板或区域。')
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

  const {
    openSketchDimensionInput,
    openSketchDistanceDimensionInput,
    handleSketchDimensionInputCancel,
    handleSketchDimensionInputChange,
    handleSketchDimensionInputSubmit,
    handleSketchDistanceDimensionReferencePick,
    handleSketchDistanceDimensionDelete,
  } = useFloorplanSketchDimensionActions({
    levelId,
    unit,
    sketchDimensionInput,
    sketchDistanceDimensionDraft,
    setSelection,
    setSketchDimensionInput,
    setSketchDistanceDimensionDraft,
    sketchDimensions,
    sketchLineById,
    sketchCircleById,
    showWallEditFeedback,
    runSketchLineEditResult,
    runSketchCircleEditResult,
    deleteNode,
  })

  const {
    handleSketchCircleTrimExtendToLine,
    handleSketchCircleTrimExtendToCircle,
    handleSelectedSketchCircleSetRadius,
    handleSelectedSketchCircleToggleFixed,
    handleSelectedSketchCircleToggleConstruction,
    handleSelectedSketchCirclesToggleConstraint,
    handleSelectedSketchCircleDelete,
    handleSelectedSketchCircleOffset,
    handleSelectedSketchCircleMirror,
    handleSelectedSketchCircleLinearPattern,
    handleSelectedSketchCircleTrimExtend,
  } = useFloorplanSketchCircleActions({
    selectedSketchCircleEntry,
    selectedSketchCircleList,
    sketchDimensions,
    sketchCircleById,
    sketchLineById,
    showWallEditFeedback,
    setSelection,
    setSketchLineEditOperation,
    setSketchCircleEditOperation,
    sketchCircleEditOperation,
    openSketchDimensionInput,
    runSketchCircleEditResult,
    createSketchCirclesOnCurrentLevel,
    deleteNode,
  })

  const {
    handleSelectedSketchLineSetLength,
    handleSelectedSketchLineHorizontal,
    handleSketchLineTrimExtendToCircle,
    handleSketchLineTangentToCircle,
    handleSketchLineSplitAtPoint,
    handleSketchLineOperationClick,
    handleSelectedSketchLineTrimExtend,
    handleSelectedSketchLineSplit,
    handleSelectedSketchLineTangent,
    handleSelectedSketchLineOffset,
    handleSelectedSketchLineMirror,
    handleSelectedSketchLineLinearPattern,
    handleSelectedSketchLinesEqualLength,
    handleSelectedSketchLineParallel,
    handleSelectedSketchLinePerpendicular,
    handleSelectedSketchLineCollinear,
    handleSelectedSketchLineFillet,
    handleSelectedSketchLineChamfer,
    handleSelectedSketchLineVertical,
    handleSelectedSketchLineToggleFixed,
    handleSelectedSketchLineToggleConstruction,
    handleSelectedSketchLineDelete,
  } = useFloorplanSketchLineActions({
    levelId,
    selectedSketchLineEntry,
    selectedSketchLineList,
    sketchDimensions,
    sketchLineById,
    showWallEditFeedback,
    setSelection,
    setSketchLineEditOperation,
    setSketchCircleEditOperation,
    sketchLineEditOperation,
    sketchCircleEditOperation,
    openSketchDimensionInput,
    runSketchLineEditResult,
    createSketchLinesOnCurrentLevel,
    sketchCircleById,
    updateNode,
    deleteNode,
    onCircleTrimExtendToLine: handleSketchCircleTrimExtendToLine,
  })

  const handleSketchCircleOperationClick = useCallback(
    (circle: SketchCircleNode) => {
      if (sketchCircleEditOperation === 'trim-extend') {
        return handleSketchCircleTrimExtendToCircle(circle)
      }

      if (sketchLineEditOperation === 'trim-extend') {
        return handleSketchLineTrimExtendToCircle(circle)
      }

      if (sketchLineEditOperation === 'tangent') {
        return handleSketchLineTangentToCircle(circle)
      }

      return false
    },
    [
      handleSketchCircleTrimExtendToCircle,
      handleSketchLineTangentToCircle,
      handleSketchLineTrimExtendToCircle,
      sketchCircleEditOperation,
      sketchLineEditOperation,
    ],
  )

  const selectedSketchActionLines = useMemo(
    () =>
      selectedSketchLineList.length > 0
        ? selectedSketchLineList
        : selectedSketchLineEntry?.line
          ? [selectedSketchLineEntry.line]
          : [],
    [selectedSketchLineEntry, selectedSketchLineList],
  )

  const isEqualLengthActive = useMemo(
    () =>
      isSketchLineConstraintActive({
        lines: selectedSketchActionLines,
        linesById: sketchLineById,
        kind: 'equal-length',
      }),
    [selectedSketchActionLines, sketchLineById],
  )

  const isParallelActive = useMemo(
    () =>
      isSketchLineConstraintActive({
        lines: selectedSketchActionLines,
        linesById: sketchLineById,
        kind: 'parallel',
      }),
    [selectedSketchActionLines, sketchLineById],
  )

  const isPerpendicularActive = useMemo(
    () =>
      isSketchLineConstraintActive({
        lines: selectedSketchActionLines,
        linesById: sketchLineById,
        kind: 'perpendicular',
      }),
    [selectedSketchActionLines, sketchLineById],
  )

  const isCollinearActive = useMemo(
    () =>
      isSketchLineConstraintActive({
        lines: selectedSketchActionLines,
        linesById: sketchLineById,
        kind: 'collinear',
      }),
    [selectedSketchActionLines, sketchLineById],
  )

  const sketchLineActionMenuExtraActions = useMemo<NodeActionMenuExtraAction[]>(() => {
    return buildSketchLineActionMenuExtraActions({
      selectedSketchLine: selectedSketchLineEntry?.line ?? null,
      selectedSketchLineCount: selectedSketchActionLines.length,
      hasSelectedSketchProfile: Boolean(selectedSketchProfile),
      sketchLineEditOperation,
      isEqualLengthActive,
      isParallelActive,
      isPerpendicularActive,
      isCollinearActive,
      onCreateWall: createWallFromSelectedSketchLine,
      onSetLength: handleSelectedSketchLineSetLength,
      onHorizontal: handleSelectedSketchLineHorizontal,
      onVertical: handleSelectedSketchLineVertical,
      onToggleFixed: handleSelectedSketchLineToggleFixed,
      onToggleConstruction: handleSelectedSketchLineToggleConstruction,
      onParallel: handleSelectedSketchLineParallel,
      onPerpendicular: handleSelectedSketchLinePerpendicular,
      onCollinear: handleSelectedSketchLineCollinear,
      onTangent: handleSelectedSketchLineTangent,
      onTrimExtend: handleSelectedSketchLineTrimExtend,
      onSplit: handleSelectedSketchLineSplit,
      onOffset: handleSelectedSketchLineOffset,
      onEqualLength: handleSelectedSketchLinesEqualLength,
      onFillet: handleSelectedSketchLineFillet,
      onMirror: handleSelectedSketchLineMirror,
      onLinearPattern: handleSelectedSketchLineLinearPattern,
      onChamfer: handleSelectedSketchLineChamfer,
      onCreateProfileWalls: createWallsFromSelectedSketchProfile,
      onCreateProfileSlab: createSlabFromSelectedSketchProfile,
      onCreateProfileZone: createZoneFromSelectedSketchProfile,
      onCreateProfileExtrude: createExtrudeFromSelectedSketchProfile,
      onCreateProfileRevolve: createRevolveFromSelectedSketchProfile,
      onCutProfile: cutFromSelectedSketchProfile,
    })
  }, [
    createExtrudeFromSelectedSketchProfile,
    createRevolveFromSelectedSketchProfile,
    createWallFromSelectedSketchLine,
    createSlabFromSelectedSketchProfile,
    createWallsFromSelectedSketchProfile,
    createZoneFromSelectedSketchProfile,
    cutFromSelectedSketchProfile,
    handleSelectedSketchLineChamfer,
    handleSelectedSketchLineCollinear,
    handleSelectedSketchLineFillet,
    handleSelectedSketchLineHorizontal,
    handleSelectedSketchLineLinearPattern,
    handleSelectedSketchLineMirror,
    handleSelectedSketchLineOffset,
    handleSelectedSketchLineParallel,
    handleSelectedSketchLinePerpendicular,
    handleSelectedSketchLineSetLength,
    handleSelectedSketchLineSplit,
    handleSelectedSketchLineTangent,
    handleSelectedSketchLineTrimExtend,
    handleSelectedSketchLineToggleConstruction,
    handleSelectedSketchLineToggleFixed,
    handleSelectedSketchLineVertical,
    handleSelectedSketchLinesEqualLength,
    isCollinearActive,
    isEqualLengthActive,
    isParallelActive,
    isPerpendicularActive,
    selectedSketchLineEntry,
    selectedSketchActionLines.length,
    selectedSketchActionLines,
    selectedSketchProfile,
    sketchLineEditOperation,
  ])

  const sketchCircleActionMenuExtraActions = useMemo<NodeActionMenuExtraAction[]>(() => {
    const circles =
      selectedSketchCircleList.length > 0
        ? selectedSketchCircleList
        : selectedSketchCircleEntry
          ? [selectedSketchCircleEntry]
          : []
    const isConcentricActive =
      circles.length > 1 &&
      isSketchCircleConstraintActive({
        circles,
        circlesById: sketchCircleById,
        kind: 'concentric',
      })
    const isEqualRadiusActive =
      circles.length > 1 &&
      isSketchCircleConstraintActive({
        circles,
        circlesById: sketchCircleById,
        kind: 'equal-radius',
      })
    const isTangentActive =
      circles.length === 2 &&
      isSketchCircleConstraintActive({
        circles,
        circlesById: sketchCircleById,
        kind: 'tangent',
      })

    return buildSketchCircleActionMenuExtraActions({
      circles,
      isConcentricActive,
      isEqualRadiusActive,
      isTangentActive,
      sketchCircleEditOperation,
      onSetRadius: handleSelectedSketchCircleSetRadius,
      onToggleFixed: handleSelectedSketchCircleToggleFixed,
      onToggleConstruction: handleSelectedSketchCircleToggleConstruction,
      onToggleConcentric: (event) =>
        handleSelectedSketchCirclesToggleConstraint('concentric', event),
      onToggleEqualRadius: (event) =>
        handleSelectedSketchCirclesToggleConstraint('equal-radius', event),
      onToggleTangent: (event) => handleSelectedSketchCirclesToggleConstraint('tangent', event),
      onTrimExtend: handleSelectedSketchCircleTrimExtend,
      onOffset: handleSelectedSketchCircleOffset,
      onMirror: handleSelectedSketchCircleMirror,
      onLinearPattern: handleSelectedSketchCircleLinearPattern,
      onCreateProfileExtrude: createExtrudeFromSelectedSketchProfile,
      onCutProfile: cutFromSelectedSketchProfile,
    })
  }, [
    createExtrudeFromSelectedSketchProfile,
    cutFromSelectedSketchProfile,
    handleSelectedSketchCircleLinearPattern,
    handleSelectedSketchCircleMirror,
    handleSelectedSketchCircleOffset,
    handleSelectedSketchCircleSetRadius,
    handleSelectedSketchCircleTrimExtend,
    handleSelectedSketchCircleToggleConstruction,
    handleSelectedSketchCircleToggleFixed,
    handleSelectedSketchCirclesToggleConstraint,
    selectedSketchCircleEntry,
    selectedSketchCircleList,
    sketchCircleEditOperation,
    sketchCircleById,
  ])

  const resetSketchOperations = useCallback(() => {
    setSketchLineEditOperation(null)
    setSketchCircleEditOperation(null)
  }, [])

  return {
    createSketchLineOnCurrentLevel,
    createSketchLinesOnCurrentLevel,
    createSketchCircleOnCurrentLevel,
    createSketchCirclesOnCurrentLevel,
    runSketchLineEditResult,
    handleSketchLinePlacementPoint,
    handleSketchRectanglePlacementPoint,
    handleSketchCirclePlacementPoint,
    handleSketchArcPlacementPoint,
    handleSketchLineSplitAtPoint,
    handleSketchLineOperationClick,
    handleSketchCircleOperationClick,
    sketchLineEditOperation,
    sketchCircleEditOperation,
    openSketchDimensionInput,
    openSketchDistanceDimensionInput,
    handleSketchDimensionInputCancel,
    handleSketchDimensionInputChange,
    handleSketchDimensionInputSubmit,
    handleSketchDistanceDimensionReferencePick,
    handleSketchDistanceDimensionDelete,
    handleSelectedSketchLineDelete,
    handleSelectedSketchCircleDelete,
    sketchLineActionMenuExtraActions,
    sketchCircleActionMenuExtraActions,
    resetSketchOperations,
  }
}
