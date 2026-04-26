'use client'

import type {
  AnyNode,
  AnyNodeId,
  SketchCircleNode,
  SketchDimensionNode,
  SketchLineNode,
} from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useCallback,
} from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import {
  buildRemoveSketchCircleConstraintReferencesPlan,
  buildToggleSketchCircleConstraintPlan,
  isSketchCircleConstraintActive,
  type SketchCircleEditResult,
} from '../../tools/sketch/sketch-circle-constraints'
import { buildRemoveSketchLineCoincidentReferencesPlan } from '../../tools/sketch/sketch-line-coincident'
import { collectSketchDistanceDimensionIdsReferencingEntities } from '../../tools/sketch/sketch-distance-dimensions'
import {
  getSketchCirclePatternDirection,
  getSketchCircleSelectionCenterX,
  mirrorSketchCircleAcrossVerticalAxis as mirrorSketchCircleSpecAcrossVerticalAxis,
  offsetSketchCircle,
  translateSketchCircle,
  type SketchCircleCreateSpec,
} from '../../tools/sketch/sketch-circle-transforms'
import { buildRemoveSketchLineTangentReferencesPlan } from '../../tools/sketch/sketch-line-tangent'
import {
  buildTrimExtendSketchArcToCirclePlan,
  buildTrimExtendSketchArcToLinePlan,
} from '../../tools/sketch/sketch-geometry'
import {
  scalePoint,
  type SketchCircleOperation,
  type SketchLineOperation,
} from './sketch-action-helpers'

const DEFAULT_SKETCH_OFFSET_DISTANCE = 0.5
const DEFAULT_SKETCH_LINEAR_PATTERN_SPACING = 1
const DEFAULT_SKETCH_LINEAR_PATTERN_COUNT = 3

type UseFloorplanSketchCircleActionsArgs = {
  selectedSketchCircleEntry: SketchCircleNode | null
  selectedSketchCircleList: SketchCircleNode[]
  sketchDimensions: SketchDimensionNode[]
  sketchCircleById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  showWallEditFeedback: (message: string) => void
  setSelection: (selection: any) => void
  setSketchLineEditOperation: Dispatch<SetStateAction<SketchLineOperation | null>>
  setSketchCircleEditOperation: Dispatch<SetStateAction<SketchCircleOperation | null>>
  sketchCircleEditOperation: SketchCircleOperation | null
  openSketchDimensionInput: (target: SketchLineNode | SketchCircleNode) => void
  runSketchCircleEditResult: (result: SketchCircleEditResult) => boolean
  createSketchCirclesOnCurrentLevel: (
    circles: SketchCircleCreateSpec[],
    namePrefix?: string,
  ) => Array<AnyNodeId | string>
  deleteNode: (id: AnyNodeId) => void
}

export function useFloorplanSketchCircleActions({
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
}: UseFloorplanSketchCircleActionsArgs) {
  const getSelectedSketchActionCircles = useCallback(() => {
    if (selectedSketchCircleList.length > 0) {
      return selectedSketchCircleList
    }

    return selectedSketchCircleEntry ? [selectedSketchCircleEntry] : []
  }, [selectedSketchCircleEntry, selectedSketchCircleList])

  const handleSketchCircleTrimExtendToLine = useCallback(
    (targetLine: SketchLineNode) => {
      const circle = selectedSketchCircleEntry ?? selectedSketchCircleList[0]
      if (!circle) {
        showWallEditFeedback('请先选择一个草图圆弧，再点击草图线进行修剪或延伸。')
        return true
      }

      if (circle.kind !== 'arc') {
        showWallEditFeedback('当前仅支持草图圆弧修剪或延伸。')
        return true
      }

      if (circle.relations?.includes('fixed')) {
        showWallEditFeedback('该草图圆弧已固定，请先解除固定再编辑。')
        return true
      }

      const result = buildTrimExtendSketchArcToLinePlan({
        circle,
        line: targetLine,
      })
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return true
      }

      runSketchCircleEditResult({
        ok: true,
        updates: [
          {
            id: circle.id,
            data: {
              startAngle: result.startAngle,
              endAngle: result.endAngle,
            },
          },
        ],
        selectIds: [circle.id],
      })
      setSketchCircleEditOperation(null)
      showWallEditFeedback('草图圆弧已修剪或延伸。')
      return true
    },
    [
      runSketchCircleEditResult,
      selectedSketchCircleEntry,
      selectedSketchCircleList,
      setSketchCircleEditOperation,
      showWallEditFeedback,
    ],
  )

  const handleSketchCircleTrimExtendToCircle = useCallback(
    (targetCircle: SketchCircleNode) => {
      const circle = selectedSketchCircleEntry ?? selectedSketchCircleList[0]
      if (!circle) {
        showWallEditFeedback('请先选择一个草图圆弧，再点击圆或圆弧进行修剪或延伸。')
        return true
      }

      if (circle.id === targetCircle.id) {
        showWallEditFeedback('请点击另一个草图圆或圆弧作为目标。')
        return true
      }

      if (circle.kind !== 'arc') {
        showWallEditFeedback('当前仅支持草图圆弧修剪或延伸。')
        return true
      }

      if (circle.relations?.includes('fixed')) {
        showWallEditFeedback('该草图圆弧已固定，请先解除固定再编辑。')
        return true
      }

      const result = buildTrimExtendSketchArcToCirclePlan({
        circle,
        targetCircle,
      })
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return true
      }

      runSketchCircleEditResult({
        ok: true,
        updates: [
          {
            id: circle.id,
            data: {
              startAngle: result.startAngle,
              endAngle: result.endAngle,
            },
          },
        ],
        selectIds: [circle.id],
      })
      setSketchCircleEditOperation(null)
      showWallEditFeedback('草图圆弧已修剪或延伸。')
      return true
    },
    [
      runSketchCircleEditResult,
      selectedSketchCircleEntry,
      selectedSketchCircleList,
      setSketchCircleEditOperation,
      showWallEditFeedback,
    ],
  )

  const handleSelectedSketchCircleSetRadius = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const circles = getSelectedSketchActionCircles()
      if (circles.length !== 1) {
        showWallEditFeedback('请选择一个草图圆或圆弧来标注半径。')
        return
      }

      const [circle] = circles
      if (!circle) {
        return
      }

      openSketchDimensionInput(circle)
    },
    [getSelectedSketchActionCircles, openSketchDimensionInput, showWallEditFeedback],
  )

  const handleSelectedSketchCircleToggleFixed = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const circles = getSelectedSketchActionCircles()
      if (circles.length === 0) {
        showWallEditFeedback('请选择草图圆或圆弧。')
        return
      }

      const shouldFix = !circles.every((circle) => circle.relations?.includes('fixed'))
      const updates = circles.map((circle) => {
        const relations = new Set(circle.relations ?? [])
        if (shouldFix) {
          relations.add('fixed')
        } else {
          relations.delete('fixed')
        }

        return {
          id: circle.id as AnyNodeId,
          data: { relations: [...relations] } as Partial<AnyNode>,
        }
      })

      useScene.getState().updateNodes(updates)
      for (const circle of circles) {
        useScene.getState().dirtyNodes.add(circle.id as AnyNodeId)
      }
      setSelection({ selectedIds: circles.map((circle) => circle.id) })
      sfxEmitter.emit('sfx:structure-build')
    },
    [getSelectedSketchActionCircles, setSelection, showWallEditFeedback],
  )

  const handleSelectedSketchCircleToggleConstruction = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const circles = getSelectedSketchActionCircles()
      if (circles.length === 0) {
        showWallEditFeedback('请选择草图圆或圆弧。')
        return
      }

      const shouldBeConstruction = !circles.every((circle) => circle.construction)
      const updates = circles.map((circle) => ({
        id: circle.id as AnyNodeId,
        data: { construction: shouldBeConstruction } as Partial<AnyNode>,
      }))

      useScene.getState().updateNodes(updates)
      for (const circle of circles) {
        useScene.getState().dirtyNodes.add(circle.id as AnyNodeId)
      }
      setSelection({ selectedIds: circles.map((circle) => circle.id) })
      sfxEmitter.emit('sfx:structure-build')
    },
    [getSelectedSketchActionCircles, setSelection, showWallEditFeedback],
  )

  const handleSelectedSketchCirclesToggleConstraint = useCallback(
    (
      kind: 'concentric' | 'equal-radius' | 'tangent',
      event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      event.stopPropagation()

      const circles = getSelectedSketchActionCircles()
      const wasActive = isSketchCircleConstraintActive({
        circles,
        circlesById: sketchCircleById,
        kind,
      })
      const applied = runSketchCircleEditResult(
        buildToggleSketchCircleConstraintPlan({
          circles,
          circlesById: sketchCircleById,
          kind,
        }),
      )
      if (!applied) {
        return
      }

      const constraintLabel =
        kind === 'concentric' ? '同心' : kind === 'equal-radius' ? '等半径' : '相切'
      showWallEditFeedback(`已${wasActive ? '移除' : '添加'}草图${constraintLabel}约束。`)
    },
    [
      getSelectedSketchActionCircles,
      runSketchCircleEditResult,
      showWallEditFeedback,
      sketchCircleById,
    ],
  )

  const handleSelectedSketchCircleDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const circles = getSelectedSketchActionCircles()
      if (circles.length === 0) {
        return
      }

      const cleanupUpdates = buildRemoveSketchCircleConstraintReferencesPlan({
        circlesById: sketchCircleById,
        deletedIds: circles.map((circle) => circle.id),
      })
      const tangentCleanupUpdates = buildRemoveSketchLineTangentReferencesPlan({
        deletedCircleIds: circles.map((circle) => circle.id),
        linesById: sketchLineById,
      })
      const coincidentCleanupUpdates = buildRemoveSketchLineCoincidentReferencesPlan({
        linesById: sketchLineById,
        deletedCircleIds: circles.map((circle) => circle.id),
      })
      const distanceDimensionIds = collectSketchDistanceDimensionIdsReferencingEntities({
        dimensions: sketchDimensions,
        deletedCircleIds: circles.map((circle) => circle.id),
      })
      if (
        cleanupUpdates.length > 0 ||
        tangentCleanupUpdates.length > 0 ||
        coincidentCleanupUpdates.length > 0
      ) {
        useScene.getState().updateNodes([
          ...cleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
          ...tangentCleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
          ...coincidentCleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
        ])
        for (const update of [
          ...cleanupUpdates,
          ...tangentCleanupUpdates,
          ...coincidentCleanupUpdates,
        ]) {
          useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
        }
      }

      sfxEmitter.emit('sfx:item-delete')
      for (const dimensionId of distanceDimensionIds) {
        deleteNode(dimensionId as AnyNodeId)
      }
      for (const circle of circles) {
        deleteNode(circle.id as AnyNodeId)
      }
      setSelection({ selectedIds: [] })
    },
    [
      deleteNode,
      getSelectedSketchActionCircles,
      setSelection,
      sketchCircleById,
      sketchDimensions,
      sketchLineById,
    ],
  )

  const handleSelectedSketchCircleOffset = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const circles = getSelectedSketchActionCircles()
      if (circles.length === 0) {
        showWallEditFeedback('请选择要偏移的草图圆或圆弧。')
        return
      }

      const offsetCircles = circles
        .map((circle) => offsetSketchCircle(circle, DEFAULT_SKETCH_OFFSET_DISTANCE))
        .filter((circle): circle is SketchCircleCreateSpec => Boolean(circle))

      if (offsetCircles.length === 0) {
        showWallEditFeedback('选中的草图圆无法偏移。')
        return
      }

      createSketchCirclesOnCurrentLevel(offsetCircles, '草图偏移')
      showWallEditFeedback('已创建草图圆偏移。')
    },
    [createSketchCirclesOnCurrentLevel, getSelectedSketchActionCircles, showWallEditFeedback],
  )

  const handleSelectedSketchCircleMirror = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const circles = getSelectedSketchActionCircles()
      if (circles.length === 0) {
        showWallEditFeedback('请选择要镜像的草图圆或圆弧。')
        return
      }

      const axisX = getSketchCircleSelectionCenterX(circles)
      createSketchCirclesOnCurrentLevel(
        circles.map((circle) => mirrorSketchCircleSpecAcrossVerticalAxis(circle, axisX)),
        '草图镜像',
      )
      showWallEditFeedback('已沿选区中心线创建草图镜像。')
    },
    [createSketchCirclesOnCurrentLevel, getSelectedSketchActionCircles, showWallEditFeedback],
  )

  const handleSelectedSketchCircleLinearPattern = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const circles = getSelectedSketchActionCircles()
      if (circles.length === 0) {
        showWallEditFeedback('请选择草图圆或圆弧来创建阵列。')
        return
      }

      const direction = getSketchCirclePatternDirection(circles)
      const patternCircles: SketchCircleCreateSpec[] = []
      for (let copyIndex = 1; copyIndex < DEFAULT_SKETCH_LINEAR_PATTERN_COUNT; copyIndex += 1) {
        const offset = scalePoint(direction, DEFAULT_SKETCH_LINEAR_PATTERN_SPACING * copyIndex)
        for (const circle of circles) {
          patternCircles.push(translateSketchCircle(circle, offset))
        }
      }

      createSketchCirclesOnCurrentLevel(patternCircles, '草图阵列')
      showWallEditFeedback('已创建草图圆线性阵列。')
    },
    [createSketchCirclesOnCurrentLevel, getSelectedSketchActionCircles, showWallEditFeedback],
  )

  const handleSelectedSketchCircleTrimExtend = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const circle = selectedSketchCircleEntry ?? selectedSketchCircleList[0]
      if (!circle) {
        showWallEditFeedback('请选择一个草图圆弧进行修剪或延伸。')
        return
      }

      if (circle.kind !== 'arc') {
        showWallEditFeedback('当前仅支持草图圆弧修剪或延伸。')
        return
      }

      if (circle.relations?.includes('fixed')) {
        showWallEditFeedback('该草图圆弧已固定，请先解除固定再编辑。')
        return
      }

      const nextOperation = sketchCircleEditOperation === 'trim-extend' ? null : 'trim-extend'
      setSketchCircleEditOperation(nextOperation)
      setSketchLineEditOperation(null)
      showWallEditFeedback(
        nextOperation ? '请点击草图线、圆或圆弧作为修剪或延伸目标。' : '已取消草图圆弧修剪或延伸。',
      )
    },
    [
      selectedSketchCircleEntry,
      selectedSketchCircleList,
      setSketchCircleEditOperation,
      setSketchLineEditOperation,
      showWallEditFeedback,
      sketchCircleEditOperation,
    ],
  )

  return {
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
  }
}
