'use client'

import type {
  AnyNodeId,
  SketchCircleNode,
  SketchDimensionNode,
  SketchDimensionReference,
  SketchLineNode,
} from '@pascal-app/core'
import { SketchDimensionNode as SketchDimensionNodeSchema, useScene } from '@pascal-app/core'
import { type Dispatch, type SetStateAction, useCallback } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import {
  buildSetSketchCircleArcLengthPlan,
  buildSetSketchCircleCenterPlan,
  buildSetSketchCircleRadiusPlan,
  type SketchCircleEditResult,
} from '../../tools/sketch/sketch-circle-constraints'
import {
  getSketchCircleDimensionDisplay,
  getSketchCircleDisplayedDimensionMode,
  getSketchCircleDisplayedDimensionValue,
  getSketchLineAngleDimensionMode,
  getSketchLineDisplayedAngleDegrees,
  getSketchLineLengthDimensionMode,
} from '../../tools/sketch/sketch-dimensions'
import {
  areSketchDimensionReferencesEqual,
  buildSetSketchDistanceDimensionValuePlan,
  findSketchDistanceDimensionIdByReferences,
  getSketchDistanceMeasurementFailureReason,
  resolveSketchDistanceMeasurement,
} from '../../tools/sketch/sketch-distance-dimensions'
import {
  buildSetSketchLineAnglePlan,
  buildSetSketchLineLengthPlan,
  getSketchLineLength2D,
  type SketchLineEditResult,
} from '../../tools/sketch/sketch-geometry'
import {
  formatAngleInputValue,
  formatLengthInputValue,
  parseSketchAngleInput,
  parseSketchLengthInput,
  type UnitSystem,
} from './sketch-action-helpers'
import type { SketchDimensionInputState, SketchDistanceDimensionDraft } from './sketch-state'

function getActiveSketchPlaneMetadata(): Record<string, unknown> {
  const plane = useEditor.getState().sketchPlane
  if (!plane) {
    return {}
  }

  return {
    sketchPlane: {
      kind: plane.kind,
      targetNodeId: plane.targetNodeId,
      elevation: plane.elevation,
    },
  }
}

type UseFloorplanSketchDimensionActionsArgs = {
  levelId: string | null
  unit: UnitSystem
  sketchDimensionInput: SketchDimensionInputState | null
  sketchDistanceDimensionDraft: SketchDistanceDimensionDraft | null
  setSelection: (selection: { selectedIds: AnyNodeId[] | string[] }) => void
  setSketchDimensionInput: Dispatch<SetStateAction<SketchDimensionInputState | null>>
  setSketchDistanceDimensionDraft: Dispatch<SetStateAction<SketchDistanceDimensionDraft | null>>
  sketchDimensions: SketchDimensionNode[]
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  sketchCircleById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  showWallEditFeedback: (message: string) => void
  runSketchLineEditResult: (result: SketchLineEditResult) => boolean
  runSketchCircleEditResult: (result: SketchCircleEditResult) => boolean
  deleteNode: (id: AnyNodeId) => void
}

export function useFloorplanSketchDimensionActions({
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
}: UseFloorplanSketchDimensionActionsArgs) {
  const openSketchDimensionInput = useCallback(
    (
      target: SketchLineNode | SketchCircleNode,
      position?: SketchDimensionInputState['position'],
      lineMetric: 'length' | 'angle' = 'length',
    ) => {
      setSketchDistanceDimensionDraft(null)

      if (target.type === 'sketch-line') {
        setSketchDimensionInput({
          target: { kind: 'line', id: target.id, metric: lineMetric },
          value:
            lineMetric === 'angle'
              ? formatAngleInputValue(getSketchLineDisplayedAngleDegrees(target))
              : formatLengthInputValue(
                  target.dimensions?.length ?? getSketchLineLength2D(target),
                  unit,
                ),
          position,
        })
      } else {
        const metric = getSketchCircleDimensionDisplay(target)
        setSketchDimensionInput({
          target: { kind: 'circle', id: target.id, metric },
          value: formatLengthInputValue(
            getSketchCircleDisplayedDimensionValue({ circle: target }),
            unit,
          ),
          position,
        })
      }
      setSelection({ selectedIds: [target.id] })
    },
    [setSelection, setSketchDimensionInput, setSketchDistanceDimensionDraft, unit],
  )

  const openSketchDistanceDimensionInput = useCallback(
    (target: SketchDimensionNode, position?: SketchDimensionInputState['position']) => {
      setSketchDistanceDimensionDraft(null)

      const measurementResult = resolveSketchDistanceMeasurement({
        circlesById: sketchCircleById,
        dimension: target,
        linesById: sketchLineById,
      })
      if (!measurementResult.ok) {
        showWallEditFeedback(getSketchDistanceMeasurementFailureReason(measurementResult.reason))
        return
      }

      setSketchDimensionInput({
        target: { kind: 'distance', id: target.id, metric: 'distance' },
        value: formatLengthInputValue(measurementResult.measurement.value, unit),
        position,
      })
      setSelection({ selectedIds: [target.id] })
    },
    [
      setSelection,
      setSketchDimensionInput,
      setSketchDistanceDimensionDraft,
      showWallEditFeedback,
      sketchCircleById,
      sketchLineById,
      unit,
    ],
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

  const handleSketchDistanceDimensionReferencePick = useCallback(
    (reference: SketchDimensionReference) => {
      setSketchDimensionInput(null)

      if (!levelId) {
        showWallEditFeedback('请先进入楼层后再创建草图距离尺寸。')
        return
      }

      if (!sketchDistanceDimensionDraft) {
        setSketchDistanceDimensionDraft({ start: reference })
        showWallEditFeedback('已选择第一个参考，请选择第二个参考创建距离尺寸。')
        return
      }

      if (areSketchDimensionReferencesEqual(sketchDistanceDimensionDraft.start, reference)) {
        showWallEditFeedback('请选择另一个参考来创建距离尺寸。')
        return
      }

      const duplicateId = findSketchDistanceDimensionIdByReferences({
        dimensions: sketchDimensions,
        first: sketchDistanceDimensionDraft.start,
        second: reference,
      })
      if (duplicateId) {
        setSketchDistanceDimensionDraft(null)
        showWallEditFeedback('这两个参考之间已经存在距离尺寸。')
        return
      }

      const measurementResult = resolveSketchDistanceMeasurement({
        circlesById: sketchCircleById,
        dimension: {
          start: sketchDistanceDimensionDraft.start,
          end: reference,
        },
        linesById: sketchLineById,
      })

      if (!measurementResult.ok) {
        const reason =
          measurementResult.reason === 'missing-reference'
            ? '未找到要标注的草图几何。'
            : measurementResult.reason === 'degenerate-line'
              ? '所选草图线长度过短，无法创建距离尺寸。'
              : measurementResult.reason === 'line-line-not-parallel'
                ? '线到线距离目前仅支持平行草图线。'
                : '两个参考重合，无法创建距离尺寸。'

        showWallEditFeedback(reason)
        return
      }

      const { createNode, nodes } = useScene.getState()
      const sketchDimensionCount = Object.values(nodes).filter(
        (node) => node.type === 'sketch-dimension',
      ).length
      const sketchDimension = SketchDimensionNodeSchema.parse({
        name: `草图距离 ${sketchDimensionCount + 1}`,
        start: sketchDistanceDimensionDraft.start,
        end: reference,
        metadata: getActiveSketchPlaneMetadata(),
      })

      createNode(sketchDimension, levelId as AnyNodeId)
      setSketchDistanceDimensionDraft(null)
      sfxEmitter.emit('sfx:structure-build')
      showWallEditFeedback('已创建参考距离尺寸。')
    },
    [
      levelId,
      setSketchDimensionInput,
      setSketchDistanceDimensionDraft,
      showWallEditFeedback,
      sketchCircleById,
      sketchDimensions,
      sketchDistanceDimensionDraft,
      sketchLineById,
    ],
  )

  const handleSketchDistanceDimensionDelete = useCallback(
    (dimensionId: SketchDimensionNode['id']) => {
      setSketchDistanceDimensionDraft(null)
      setSketchDimensionInput(null)
      deleteNode(dimensionId as AnyNodeId)
      sfxEmitter.emit('sfx:item-delete')
    },
    [deleteNode, setSketchDimensionInput, setSketchDistanceDimensionDraft],
  )

  const handleSketchDimensionInputSubmit = useCallback(
    (value: string) => {
      const current = sketchDimensionInput
      if (!current) {
        return
      }

      if (current.target.kind === 'distance') {
        const length = parseSketchLengthInput(value, unit)
        if (length === null) {
          showWallEditFeedback('请输入有效的草图距离。')
          return
        }

        const dimension = sketchDimensions.find((candidate) => candidate.id === current.target.id)
        if (!dimension) {
          showWallEditFeedback('未找到要标注的草图距离尺寸。')
          return
        }

        if (dimension.mode === 'reference') {
          showWallEditFeedback('参考尺寸仅用于标注，请先切换为驱动尺寸。')
          return
        }

        const result = buildSetSketchDistanceDimensionValuePlan({
          circlesById: sketchCircleById,
          dimension,
          linesById: sketchLineById,
          value: length,
        })
        if (!result.ok) {
          showWallEditFeedback(result.reason)
          return
        }

        if (result.kind === 'line') {
          runSketchLineEditResult({
            ok: true,
            updates: result.updates,
            selectIds: [dimension.id as AnyNodeId],
          })
          return
        }

        const circle = sketchCircleById.get(result.circleId)
        if (!circle) {
          showWallEditFeedback('未找到要驱动的草图圆或圆弧。')
          return
        }

        const circleResult = buildSetSketchCircleCenterPlan({
          circle,
          circlesById: sketchCircleById,
          center: result.center,
        })
        runSketchCircleEditResult(
          circleResult.ok
            ? {
                ...circleResult,
                selectIds: [dimension.id as AnyNodeId],
              }
            : circleResult,
        )
        return
      }

      if (current.target.kind === 'line') {
        const line = sketchLineById.get(current.target.id)
        if (!line) {
          showWallEditFeedback('未找到要标注的草图线。')
          return
        }
        if (current.target.metric === 'angle') {
          const angleDegrees = parseSketchAngleInput(value)
          if (angleDegrees === null) {
            showWallEditFeedback('请输入有效的草图角度。')
            return
          }

          const mode = getSketchLineAngleDimensionMode(line)
          if (mode === 'reference') {
            showWallEditFeedback('参考尺寸仅用于标注，请先切换为驱动尺寸。')
            return
          }

          runSketchLineEditResult(
            buildSetSketchLineAnglePlan({
              line,
              angle: (angleDegrees * Math.PI) / 180,
              dimensionMode: mode ?? 'driven',
            }),
          )
          return
        }

        const length = parseSketchLengthInput(value, unit)
        if (length === null) {
          showWallEditFeedback('请输入有效的草图长度。')
          return
        }

        const mode = getSketchLineLengthDimensionMode(line)
        if (mode === 'reference') {
          showWallEditFeedback('参考尺寸仅用于标注，请先切换为驱动尺寸。')
          return
        }

        runSketchLineEditResult(
          buildSetSketchLineLengthPlan({
            line,
            length,
            dimensionMode: mode ?? 'driven',
          }),
        )
        return
      }

      const length = parseSketchLengthInput(value, unit)
      if (length === null) {
        showWallEditFeedback(
          current.target.metric === 'diameter'
            ? '请输入有效的草图直径。'
            : current.target.metric === 'arc-length'
              ? '请输入有效的草图弧长。'
              : '请输入有效的草图半径。',
        )
        return
      }

      const circle = sketchCircleById.get(current.target.id)
      if (!circle) {
        showWallEditFeedback('未找到要标注的草图圆。')
        return
      }
      const mode = getSketchCircleDisplayedDimensionMode(circle)
      if (mode === 'reference') {
        showWallEditFeedback('参考尺寸仅用于标注，请先切换为驱动尺寸。')
        return
      }

      if (current.target.metric === 'arc-length') {
        runSketchCircleEditResult(
          buildSetSketchCircleArcLengthPlan({
            circle,
            circlesById: sketchCircleById,
            arcLength: length,
            dimensionMode: mode ?? 'driven',
          }),
        )
        return
      }

      runSketchCircleEditResult(
        buildSetSketchCircleRadiusPlan({
          circle,
          circlesById: sketchCircleById,
          dimensionMode: mode ?? 'driven',
          radius: current.target.metric === 'diameter' ? length / 2 : length,
        }),
      )
    },
    [
      runSketchCircleEditResult,
      runSketchLineEditResult,
      showWallEditFeedback,
      sketchCircleById,
      sketchDimensionInput,
      sketchDimensions,
      sketchLineById,
      unit,
    ],
  )

  return {
    openSketchDimensionInput,
    openSketchDistanceDimensionInput,
    handleSketchDimensionInputCancel,
    handleSketchDimensionInputChange,
    handleSketchDimensionInputSubmit,
    handleSketchDistanceDimensionReferencePick,
    handleSketchDistanceDimensionDelete,
  }
}
