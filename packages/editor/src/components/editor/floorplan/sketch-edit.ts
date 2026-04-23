'use client'

import {
  type AnyNode,
  type AnyNodeId,
  getSketchLineChordFrame,
  getSketchLineMidpointHandlePoint,
  normalizeSketchLineCurveOffset,
  type SketchLineEndpointReference,
  type SketchLineNode,
  useScene,
} from '@pascal-app/core'
import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import {
  findSketchEndpointSnapTarget,
  getCoincidentSketchEndpointRefs,
  type SketchEndpointSnapTarget,
} from '../../tools/sketch/sketch-coincident'
import {
  getSketchLineLength2D,
  isSketchLineLongEnough,
  type SketchPlanPoint,
} from '../../tools/sketch/sketch-geometry'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'

export type SketchLineEditMode = 'start' | 'end' | 'line' | 'curve'

export type SketchLineEditUpdate = {
  lineId: SketchLineNode['id']
  start: SketchPlanPoint
  end: SketchPlanPoint
  curveOffset?: number
}

export type SketchLineEditDraft = {
  lineId: SketchLineNode['id']
  start: SketchPlanPoint
  end: SketchPlanPoint
  curveOffset: number
  mode: SketchLineEditMode
  lineUpdates?: SketchLineEditUpdate[]
  snapTarget?: SketchEndpointSnapTarget | null
}

type SketchLineDragState = {
  pointerId: number
  line: SketchLineNode
  mode: SketchLineEditMode
  anchorPoint: SketchPlanPoint
  draft: SketchLineEditDraft
}

type UseFloorplanSketchEditArgs = {
  canEdit: boolean
  sketchLines: SketchLineNode[]
  getPlanPointFromClientPoint: (clientX: number, clientY: number) => WallPlanPoint | null
  setCursorPoint: Dispatch<SetStateAction<WallPlanPoint | null>>
  setSelection: (selection: any) => void
  showWallEditFeedback: (message: string) => void
}

function snapSketchEditPoint(point: WallPlanPoint): SketchPlanPoint {
  return [Math.round(point[0] * 2) / 2, Math.round(point[1] * 2) / 2]
}

function pointsEqual(a: SketchPlanPoint, b: SketchPlanPoint) {
  return a[0] === b[0] && a[1] === b[1]
}

function pointApproximatelyEqual(a: SketchPlanPoint, b: SketchPlanPoint) {
  return Math.abs(a[0] - b[0]) <= 1e-6 && Math.abs(a[1] - b[1]) <= 1e-6
}

function hasRelation(line: SketchLineNode, relation: 'horizontal' | 'vertical' | 'fixed') {
  return (line.relations ?? []).includes(relation)
}

function getEndpointReference(
  line: SketchLineNode,
  endpoint: Extract<SketchLineEditMode, 'start' | 'end'>,
): SketchLineEndpointReference {
  return { lineId: line.id, endpoint }
}

function buildPropagatedLineUpdates(
  lines: SketchLineNode[],
  dragState: SketchLineDragState,
  draft: Pick<SketchLineEditDraft, 'start' | 'end' | 'curveOffset'>,
): SketchLineEditUpdate[] {
  const lineById = new Map(lines.map((line) => [line.id, line] as const))
  const updateById = new Map<SketchLineNode['id'], SketchLineEditUpdate>()

  const getUpdate = (line: SketchLineNode) => {
    const existing = updateById.get(line.id)
    if (existing) {
      return existing
    }

    const update: SketchLineEditUpdate = {
      lineId: line.id,
      start: [line.start[0], line.start[1]],
      end: [line.end[0], line.end[1]],
      curveOffset: line.curveOffset ?? 0,
    }
    updateById.set(line.id, update)
    return update
  }

  if (dragState.mode === 'curve') {
    return [
      {
        lineId: dragState.line.id,
        start: draft.start,
        end: draft.end,
        curveOffset: draft.curveOffset,
      },
    ]
  }

  const moveEndpointGroup = (seed: SketchLineEndpointReference, point: SketchPlanPoint) => {
    for (const reference of getCoincidentSketchEndpointRefs(lines, seed)) {
      const line = lineById.get(reference.lineId as SketchLineNode['id'])
      if (!line) {
        continue
      }

      const update = getUpdate(line)
      if (reference.endpoint === 'start') {
        update.start = point
      } else {
        update.end = point
      }
    }
  }

  if (dragState.mode === 'line') {
    moveEndpointGroup(getEndpointReference(dragState.line, 'start'), draft.start)
    moveEndpointGroup(getEndpointReference(dragState.line, 'end'), draft.end)
  } else {
    moveEndpointGroup(getEndpointReference(dragState.line, dragState.mode), draft[dragState.mode])
  }

  return [...updateById.values()]
}

function buildSketchLineEditDraft(
  dragState: SketchLineDragState,
  point: SketchPlanPoint,
  lines: SketchLineNode[],
  snapTarget: SketchEndpointSnapTarget | null = null,
): SketchLineEditDraft {
  const { line, mode, anchorPoint } = dragState
  let start: SketchPlanPoint = [...line.start]
  let end: SketchPlanPoint = [...line.end]
  let curveOffset = line.curveOffset ?? 0

  if (mode === 'line') {
    const deltaX = point[0] - anchorPoint[0]
    const deltaZ = point[1] - anchorPoint[1]
    start = [line.start[0] + deltaX, line.start[1] + deltaZ]
    end = [line.end[0] + deltaX, line.end[1] + deltaZ]
  } else if (mode === 'curve') {
    const chord = getSketchLineChordFrame(line)
    const rawCurveOffset = -(
      (point[0] - chord.midpoint.x) * chord.normal.x +
      (point[1] - chord.midpoint.y) * chord.normal.y
    )
    curveOffset = normalizeSketchLineCurveOffset(line, rawCurveOffset)
  } else if (mode === 'start') {
    start = hasRelation(line, 'horizontal')
      ? [point[0], line.end[1]]
      : hasRelation(line, 'vertical')
        ? [line.end[0], point[1]]
        : point
  } else {
    end = hasRelation(line, 'horizontal')
      ? [point[0], line.start[1]]
      : hasRelation(line, 'vertical')
        ? [line.start[0], point[1]]
        : point
  }

  const draft = {
    lineId: line.id,
    start,
    end,
    curveOffset,
    mode,
  }

  return {
    ...draft,
    lineUpdates: buildPropagatedLineUpdates(lines, dragState, draft),
    snapTarget,
  }
}

function relationArrayEqual(a: SketchLineNode['relations'], b: SketchLineNode['relations']) {
  return a.length === b.length && a.every((relation, index) => relation === b[index])
}

function getRelationsForCoordinateUpdate(
  line: SketchLineNode,
  update: SketchLineEditUpdate,
): SketchLineNode['relations'] {
  return (line.relations ?? []).filter((relation) => {
    if (relation === 'horizontal') {
      return pointApproximatelyEqual([0, update.start[1]], [0, update.end[1]])
    }

    if (relation === 'vertical') {
      return pointApproximatelyEqual([update.start[0], 0], [update.end[0], 0])
    }

    return true
  })
}

function getLineCoordinateCommitPatch(
  line: SketchLineNode,
  update: SketchLineEditUpdate,
): Partial<SketchLineNode> {
  const patch: Partial<SketchLineNode> = {
    start: update.start,
    end: update.end,
  }
  const curveOffset = normalizeSketchLineCurveOffset(
    { ...line, start: update.start, end: update.end },
    update.curveOffset ?? line.curveOffset ?? 0,
  )

  if (line.dimensions?.length) {
    patch.dimensions = {
      ...line.dimensions,
      length: getSketchLineLength2D(update),
    }
  }

  if (Math.abs((line.curveOffset ?? 0) - curveOffset) > 1e-6) {
    patch.curveOffset = curveOffset
  }

  const nextRelations = getRelationsForCoordinateUpdate(line, update)
  if (!relationArrayEqual(line.relations ?? [], nextRelations)) {
    patch.relations = nextRelations
  }

  return patch
}

function lineMatchesUpdate(line: SketchLineNode, update: SketchLineEditUpdate) {
  const curveOffset = normalizeSketchLineCurveOffset(
    { ...line, start: update.start, end: update.end },
    update.curveOffset ?? line.curveOffset ?? 0,
  )
  return (
    pointsEqual(line.start, update.start) &&
    pointsEqual(line.end, update.end) &&
    Math.abs((line.curveOffset ?? 0) - curveOffset) <= 1e-6
  )
}

export function useFloorplanSketchEdit({
  canEdit,
  sketchLines,
  getPlanPointFromClientPoint,
  setCursorPoint,
  setSelection,
  showWallEditFeedback,
}: UseFloorplanSketchEditArgs) {
  const [sketchLineEditDraft, setSketchLineEditDraft] = useState<SketchLineEditDraft | null>(null)
  const dragStateRef = useRef<SketchLineDragState | null>(null)
  const draftRef = useRef<SketchLineEditDraft | null>(null)

  const clearSketchLineEdit = useCallback(() => {
    dragStateRef.current = null
    draftRef.current = null
    setSketchLineEditDraft(null)
  }, [])

  const handleSketchLineEditPointerDown = useCallback(
    (line: SketchLineNode, mode: SketchLineEditMode, event: ReactPointerEvent<SVGElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (!canEdit) {
        return
      }

      if (hasRelation(line, 'fixed')) {
        showWallEditFeedback('已固定的草图几何不能拖动。')
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      const curveHandle = getSketchLineMidpointHandlePoint(line)
      const anchorPoint =
        mode === 'start'
          ? line.start
          : mode === 'end'
            ? line.end
            : mode === 'curve'
              ? ([curveHandle.x, curveHandle.y] as SketchPlanPoint)
              : (planPoint ?? line.start)
      const draft: SketchLineEditDraft = {
        lineId: line.id,
        start: line.start,
        end: line.end,
        curveOffset: line.curveOffset ?? 0,
        mode,
        lineUpdates: [
          {
            lineId: line.id,
            start: line.start,
            end: line.end,
            curveOffset: line.curveOffset ?? 0,
          },
        ],
        snapTarget: null,
      }

      dragStateRef.current = {
        pointerId: event.pointerId,
        line,
        mode,
        anchorPoint,
        draft,
      }
      draftRef.current = draft
      setSelection({ selectedIds: [line.id] })
      setSketchLineEditDraft(draft)
      setCursorPoint(anchorPoint)
    },
    [canEdit, getPlanPointFromClientPoint, setCursorPoint, setSelection, showWallEditFeedback],
  )

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const basePoint = event.shiftKey ? planPoint : snapSketchEditPoint(planPoint)
      let nextDraft = buildSketchLineEditDraft(dragState, basePoint, sketchLines)
      const curveHandle = getSketchLineMidpointHandlePoint(nextDraft)
      let cursorPoint: SketchPlanPoint =
        dragState.mode === 'line'
          ? basePoint
          : dragState.mode === 'curve'
            ? [curveHandle.x, curveHandle.y]
            : nextDraft[dragState.mode]

      if (!event.shiftKey && (dragState.mode === 'start' || dragState.mode === 'end')) {
        const seed = getEndpointReference(dragState.line, dragState.mode)
        const ignoredEndpoints = getCoincidentSketchEndpointRefs(sketchLines, seed)
        const endpointSnapTarget = findSketchEndpointSnapTarget({
          point: nextDraft[dragState.mode],
          lines: sketchLines,
          ignoreEndpoints: ignoredEndpoints,
        })

        if (endpointSnapTarget) {
          const snappedDraft = buildSketchLineEditDraft(
            dragState,
            endpointSnapTarget.point,
            sketchLines,
            endpointSnapTarget,
          )
          if (pointApproximatelyEqual(snappedDraft[dragState.mode], endpointSnapTarget.point)) {
            nextDraft = snappedDraft
            cursorPoint = endpointSnapTarget.point
          }
        }
      }

      const previousDraft = dragState.draft

      if (
        pointsEqual(previousDraft.start, nextDraft.start) &&
        pointsEqual(previousDraft.end, nextDraft.end) &&
        previousDraft.curveOffset === nextDraft.curveOffset
      ) {
        return
      }

      dragState.draft = nextDraft
      draftRef.current = nextDraft
      setCursorPoint(cursorPoint)
      setSketchLineEditDraft(nextDraft)
      sfxEmitter.emit('sfx:grid-snap')
    }

    const commitSketchLineEdit = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = draftRef.current ?? dragState.draft
      const lineById = new Map(sketchLines.map((line) => [line.id, line] as const))
      const lineUpdates = draft.lineUpdates ?? [
        {
          lineId: dragState.line.id,
          start: draft.start,
          end: draft.end,
          curveOffset: draft.curveOffset,
        },
      ]
      const changedUpdates = lineUpdates.filter((update) => {
        const line = lineById.get(update.lineId)
        return line && !lineMatchesUpdate(line, update)
      })

      if (changedUpdates.length > 0) {
        if (changedUpdates.some((update) => !isSketchLineLongEnough(update.start, update.end))) {
          showWallEditFeedback('选中的草图线太短，无法编辑。')
        } else if (
          changedUpdates.some((update) => {
            const line = lineById.get(update.lineId)
            return Boolean(line && hasRelation(line, 'fixed'))
          })
        ) {
          showWallEditFeedback('已固定的草图几何不能拖动。')
        } else {
          const scene = useScene.getState()
          const nodeUpdates = changedUpdates
            .map((update) => {
              const line = lineById.get(update.lineId)
              if (!line) {
                return null
              }

              const patch = getLineCoordinateCommitPatch(line, update)
              if (
                (draft.mode === 'start' || draft.mode === 'end') &&
                update.lineId === dragState.line.id &&
                draft.snapTarget?.reference
              ) {
                patch.coincident = {
                  ...(line.coincident ?? {}),
                  [draft.mode]: draft.snapTarget.reference,
                }
              }

              return {
                id: update.lineId as AnyNodeId,
                data: patch as Partial<AnyNode>,
              }
            })
            .filter((update): update is { id: AnyNodeId; data: Partial<AnyNode> } =>
              Boolean(update),
            )

          scene.updateNodes(nodeUpdates)
          for (const update of nodeUpdates) {
            scene.dirtyNodes.add(update.id)
          }
          sfxEmitter.emit('sfx:structure-build')
        }
      }

      clearSketchLineEdit()
      setCursorPoint(null)
    }

    const cancelSketchLineEdit = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      clearSketchLineEdit()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitSketchLineEdit)
    window.addEventListener('pointercancel', cancelSketchLineEdit)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitSketchLineEdit)
      window.removeEventListener('pointercancel', cancelSketchLineEdit)
    }
  }, [
    clearSketchLineEdit,
    getPlanPointFromClientPoint,
    sketchLines,
    setCursorPoint,
    showWallEditFeedback,
  ])

  return {
    sketchLineEditDraft,
    clearSketchLineEdit,
    handleSketchLineEditPointerDown,
  }
}
