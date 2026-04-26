'use client'

import type {
  AnyNode,
  AnyNodeId,
  SketchCircleNode,
  SketchDimensionNode,
  SketchLineEndpointReference,
  SketchLineNode,
} from '@pascal-app/core'
import {
  SketchCircleNode as SketchCircleNodeSchema,
  SketchLineNode as SketchLineNodeSchema,
  useScene,
} from '@pascal-app/core'
import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useCallback,
} from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import {
  buildRemoveSketchLineConstraintReferencesPlan,
  buildToggleSketchLineConstraintPlan,
  isSketchLineConstraintActive,
} from '../../tools/sketch/sketch-line-constraints'
import { buildResolvedSketchLineUpdateSet } from '../../tools/sketch/sketch-line-resolution'
import { buildRemoveSketchLineCoincidentReferencesPlan } from '../../tools/sketch/sketch-line-coincident'
import { collectSketchDistanceDimensionIdsReferencingEntities } from '../../tools/sketch/sketch-distance-dimensions'
import { buildSketchLineGeometryDimensionData } from '../../tools/sketch/sketch-dimensions'
import {
  buildSetSketchLineTangentConstraintPatch,
  clearSketchLineTangentIfGeometryChanges,
} from '../../tools/sketch/sketch-line-tangent'
import {
  buildSketchLineFilletArc,
  buildOrientSketchLinePlan,
  buildTrimExtendSketchLineToCirclePlan,
  isSketchLineLongEnough,
  type SketchLineEditResult,
} from '../../tools/sketch/sketch-geometry'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import {
  getCornerTrimPoint,
  getNearestSketchEndpoint,
  getSelectionCenterX,
  getSketchLineDirection,
  getSketchLineEndpointReferenceAtPoint,
  getSketchLineEndpointUpdate,
  getSketchLineIntersection,
  getSketchLineNormal,
  getSketchLineSplitRelations,
  mirrorSketchPointAcrossVerticalAxis,
  projectPointOntoSketchLine,
  retargetSketchLineCoincidentReference,
  scalePoint,
  translateSketchLineSegment,
  type FloorplanSketchLineEntry,
  type SketchCircleOperation,
  type SketchLineCreateSegment,
  type SketchLineOperation,
} from './sketch-action-helpers'

const DEFAULT_SKETCH_OFFSET_DISTANCE = 0.5
const DEFAULT_SKETCH_LINEAR_PATTERN_SPACING = 1
const DEFAULT_SKETCH_LINEAR_PATTERN_COUNT = 3
const DEFAULT_SKETCH_CORNER_DISTANCE = 0.5

type UseFloorplanSketchLineActionsArgs = {
  levelId: string | null
  selectedSketchLineEntry: FloorplanSketchLineEntry | null
  selectedSketchLineList: SketchLineNode[]
  sketchDimensions: SketchDimensionNode[]
  sketchLineById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  showWallEditFeedback: (message: string) => void
  setSelection: (selection: any) => void
  setSketchLineEditOperation: Dispatch<SetStateAction<SketchLineOperation | null>>
  setSketchCircleEditOperation: Dispatch<SetStateAction<SketchCircleOperation | null>>
  sketchLineEditOperation: SketchLineOperation | null
  sketchCircleEditOperation: SketchCircleOperation | null
  openSketchDimensionInput: (target: SketchLineNode | SketchCircleNode) => void
  runSketchLineEditResult: (result: SketchLineEditResult) => boolean
  createSketchLinesOnCurrentLevel: (
    segments: SketchLineCreateSegment[],
    namePrefix?: string,
  ) => Array<AnyNodeId | string>
  sketchCircleById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  updateNode: (id: AnyNodeId, data: Partial<AnyNode>) => void
  deleteNode: (id: AnyNodeId) => void
  onCircleTrimExtendToLine: (line: SketchLineNode) => boolean
}

export function useFloorplanSketchLineActions({
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
  onCircleTrimExtendToLine,
}: UseFloorplanSketchLineActionsArgs) {
  const getSelectedSketchActionLines = useCallback(() => {
    if (selectedSketchLineList.length > 0) {
      return selectedSketchLineList
    }

    return selectedSketchLineEntry?.line ? [selectedSketchLineEntry.line] : []
  }, [selectedSketchLineEntry, selectedSketchLineList])

  const applySketchLineNodeUpdates = useCallback(
    (updates: Array<{ id: AnyNodeId; data: Partial<AnyNode> }>, selectIds: AnyNodeId[]) => {
      if (updates.length === 0) {
        return true
      }

      const lineUpdates = updates
        .map((update) => {
          const line = sketchLineById.get(update.id as SketchLineNode['id'])
          if (!line) {
            return null
          }

          return {
            id: update.id as SketchLineNode['id'],
            data: update.data as Partial<SketchLineNode>,
          }
        })
        .filter((update): update is { id: SketchLineNode['id']; data: Partial<SketchLineNode> } =>
          Boolean(update),
        )

      const resolvedUpdates = buildResolvedSketchLineUpdateSet({
        linesById: sketchLineById,
        circlesById: sketchCircleById,
        initialUpdates: lineUpdates,
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
        useScene.getState().dirtyNodes.add(update.id)
      }
      setSelection({ selectedIds: selectIds })
      setSketchLineEditOperation(null)
      setSketchCircleEditOperation(null)
      sfxEmitter.emit('sfx:structure-build')
      return true
    },
    [
      setSelection,
      setSketchCircleEditOperation,
      setSketchLineEditOperation,
      showWallEditFeedback,
      sketchCircleById,
      sketchLineById,
    ],
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
      const applied = applySketchLineNodeUpdates(
        [
          {
            id: primaryLine.id as AnyNodeId,
            data: getSketchLineEndpointUpdate(primaryLine, endpoint, intersection, connection) as Partial<AnyNode>,
          },
        ],
        [primaryLine.id as AnyNodeId],
      )
      if (applied) {
        showWallEditFeedback('草图线已修剪或延伸。')
      }
      return true
    },
    [
      applySketchLineNodeUpdates,
      selectedSketchLineEntry,
      selectedSketchLineList,
      showWallEditFeedback,
    ],
  )

  const handleSketchLineTrimExtendToCircle = useCallback(
    (targetCircle: SketchCircleNode) => {
      const primaryLine = selectedSketchLineEntry?.line ?? selectedSketchLineList[0]
      if (!primaryLine) {
        showWallEditFeedback('请先选择一条草图线，再点击圆或圆弧进行修剪或延伸。')
        return true
      }

      const result = buildTrimExtendSketchLineToCirclePlan({
        line: primaryLine,
        circle: targetCircle,
      })
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return true
      }

      const applied = applySketchLineNodeUpdates(
        [
          {
            id: primaryLine.id as AnyNodeId,
            data: getSketchLineEndpointUpdate(primaryLine, result.endpoint, result.point) as Partial<AnyNode>,
          },
        ],
        [primaryLine.id as AnyNodeId],
      )
      if (applied) {
        showWallEditFeedback('草图线已修剪或延伸到圆弧。')
      }
      return true
    },
    [
      applySketchLineNodeUpdates,
      selectedSketchLineEntry,
      selectedSketchLineList,
      showWallEditFeedback,
    ],
  )

  const handleSketchLineTangentToCircle = useCallback(
    (targetCircle: SketchCircleNode) => {
      const primaryLine = selectedSketchLineEntry?.line ?? selectedSketchLineList[0]
      if (!primaryLine) {
        showWallEditFeedback('请先选择一条草图线，再点击圆或圆弧设为相切。')
        return true
      }

      const result = buildSetSketchLineTangentConstraintPatch({
        line: primaryLine,
        circle: targetCircle,
      })
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return true
      }

      const applied = applySketchLineNodeUpdates(
        [
          {
            id: primaryLine.id as AnyNodeId,
            data: result.patch as Partial<AnyNode>,
          },
        ],
        [primaryLine.id as AnyNodeId],
      )
      if (applied) {
        showWallEditFeedback('草图线已设为与圆/圆弧相切。')
      }
      return true
    },
    [
      applySketchLineNodeUpdates,
      selectedSketchLineEntry,
      selectedSketchLineList,
      showWallEditFeedback,
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
          data: clearSketchLineTangentIfGeometryChanges(line, {
            end: splitPoint,
            relations,
            dimensions: buildSketchLineGeometryDimensionData({
              line,
              end: splitPoint,
            }),
            coincident: {
              ...(line.coincident ?? {}),
              end: { lineId: newLine.id, endpoint: 'start' },
            },
          }) as Partial<AnyNode>,
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
    [levelId, setSelection, setSketchLineEditOperation, showWallEditFeedback],
  )

  const handleSketchLineOperationClick = useCallback(
    (line: SketchLineNode, point: WallPlanPoint) => {
      if (sketchCircleEditOperation === 'trim-extend') {
        return onCircleTrimExtendToLine(line)
      }

      if (sketchLineEditOperation === 'split') {
        return handleSketchLineSplitAtPoint(line, point)
      }

      if (sketchLineEditOperation === 'trim-extend') {
        return handleSketchLineTrimExtendToLine(line)
      }

      if (sketchLineEditOperation === 'tangent') {
        showWallEditFeedback('请点击圆或圆弧作为相切目标。')
        return true
      }

      return false
    },
    [
      handleSketchLineSplitAtPoint,
      handleSketchLineTrimExtendToLine,
      onCircleTrimExtendToLine,
      sketchCircleEditOperation,
      showWallEditFeedback,
      sketchLineEditOperation,
    ],
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
      setSketchCircleEditOperation(null)
      showWallEditFeedback(
        nextOperation
          ? '请点击另一条草图线、圆或圆弧作为修剪或延伸目标。'
          : '已取消草图修剪或延伸。',
      )
    },
    [
      selectedSketchLineEntry,
      selectedSketchLineList,
      setSketchCircleEditOperation,
      setSketchLineEditOperation,
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
      setSketchCircleEditOperation(null)
      showWallEditFeedback(nextOperation ? '请点击草图线上的分割位置。' : '已取消草图分割。')
    },
    [
      selectedSketchLineEntry,
      setSketchCircleEditOperation,
      setSketchLineEditOperation,
      showWallEditFeedback,
      sketchLineEditOperation,
    ],
  )

  const handleSelectedSketchLineTangent = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const line = selectedSketchLineEntry?.line ?? selectedSketchLineList[0]
      if (!line) {
        showWallEditFeedback('请选择一条草图线设为相切。')
        return
      }

      if (line.relations?.includes('fixed')) {
        showWallEditFeedback('该草图线已固定，请先解除固定再编辑。')
        return
      }

      const nextOperation = sketchLineEditOperation === 'tangent' ? null : 'tangent'
      setSketchLineEditOperation(nextOperation)
      setSketchCircleEditOperation(null)
      showWallEditFeedback(nextOperation ? '请点击圆或圆弧作为相切目标。' : '已取消草图相切。')
    },
    [
      selectedSketchLineEntry,
      selectedSketchLineList,
      setSketchCircleEditOperation,
      setSketchLineEditOperation,
      showWallEditFeedback,
      sketchLineEditOperation,
    ],
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
      setSketchCircleEditOperation(null)
      showWallEditFeedback('已创建草图偏移。')
    },
    [
      createSketchLinesOnCurrentLevel,
      getSelectedSketchActionLines,
      setSketchCircleEditOperation,
      setSketchLineEditOperation,
      showWallEditFeedback,
    ],
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
      setSketchCircleEditOperation(null)
      showWallEditFeedback('已沿选区中心线创建草图镜像。')
    },
    [
      createSketchLinesOnCurrentLevel,
      getSelectedSketchActionLines,
      setSketchCircleEditOperation,
      setSketchLineEditOperation,
      showWallEditFeedback,
    ],
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
      setSketchCircleEditOperation(null)
      showWallEditFeedback('已创建草图线性阵列。')
    },
    [
      createSketchLinesOnCurrentLevel,
      getSelectedSketchActionLines,
      selectedSketchLineEntry,
      setSketchCircleEditOperation,
      setSketchLineEditOperation,
      showWallEditFeedback,
    ],
  )

  const handleSelectedSketchLineConstraintToggle = useCallback(
    (
      kind: 'equal-length' | 'parallel' | 'perpendicular' | 'collinear',
      event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      event.stopPropagation()
      const lines = getSelectedSketchActionLines()
      if (lines.length < 2) {
        showWallEditFeedback('请选择两条或更多草图线来设置约束。')
        return
      }
      const wasActive = isSketchLineConstraintActive({
        lines,
        linesById: sketchLineById,
        kind,
      })

      const result = buildToggleSketchLineConstraintPlan({
        lines,
        linesById: sketchLineById,
        kind,
      })
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return
      }

      const applied = applySketchLineNodeUpdates(
        result.updates.map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        })),
        (result.selectIds ?? lines.map((line) => line.id)) as AnyNodeId[],
      )
      if (!applied) {
        return
      }

      const label =
        kind === 'equal-length'
          ? '等长'
          : kind === 'parallel'
            ? '平行'
            : kind === 'perpendicular'
            ? '垂直'
            : '共线'
      showWallEditFeedback(`已${wasActive ? '移除' : '添加'}草图线${label}约束。`)
    },
    [applySketchLineNodeUpdates, getSelectedSketchActionLines, showWallEditFeedback, sketchLineById],
  )

  const handleSelectedSketchLinesEqualLength = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      handleSelectedSketchLineConstraintToggle('equal-length', event)
    },
    [handleSelectedSketchLineConstraintToggle],
  )

  const handleSelectedSketchLineParallel = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      handleSelectedSketchLineConstraintToggle('parallel', event)
    },
    [handleSelectedSketchLineConstraintToggle],
  )

  const handleSelectedSketchLinePerpendicular = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      handleSelectedSketchLineConstraintToggle('perpendicular', event)
    },
    [handleSelectedSketchLineConstraintToggle],
  )

  const handleSelectedSketchLineCollinear = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      handleSelectedSketchLineConstraintToggle('collinear', event)
    },
    [handleSelectedSketchLineConstraintToggle],
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

      if (kind === 'Fillet') {
        const filletArc = buildSketchLineFilletArc({
          firstLine,
          secondLine,
          trimDistance: DEFAULT_SKETCH_CORNER_DISTANCE,
        })
        if (!filletArc.ok) {
          showWallEditFeedback(filletArc.reason)
          return
        }

        const scene = useScene.getState()
        const filletNode = SketchCircleNodeSchema.parse({
          name: '草图圆角',
          kind: 'arc',
          center: filletArc.center,
          radius: filletArc.radius,
          startAngle: filletArc.startAngle,
          endAngle: filletArc.endAngle,
          construction: firstLine.construction && secondLine.construction,
          dimensions: {
            radius: filletArc.radius,
          },
        })
        const updates: Array<{ id: AnyNodeId; data: Partial<AnyNode> }> = [
          {
            id: firstLine.id as AnyNodeId,
            data: clearSketchLineTangentIfGeometryChanges(
              firstLine,
              getSketchLineEndpointUpdate(
                firstLine,
                filletArc.firstEndpoint,
                filletArc.firstTrimPoint,
              ),
            ) as Partial<AnyNode>,
          },
          {
            id: secondLine.id as AnyNodeId,
            data: clearSketchLineTangentIfGeometryChanges(
              secondLine,
              getSketchLineEndpointUpdate(
                secondLine,
                filletArc.secondEndpoint,
                filletArc.secondTrimPoint,
              ),
            ) as Partial<AnyNode>,
          },
        ]

        scene.createNode(filletNode, levelId as AnyNodeId)
        scene.updateNodes(updates)
        for (const update of updates) {
          scene.dirtyNodes.add(update.id)
        }
        scene.dirtyNodes.add(filletNode.id as AnyNodeId)
        setSelection({ selectedIds: [firstLine.id, secondLine.id, filletNode.id] })
        setSketchLineEditOperation(null)
        sfxEmitter.emit('sfx:structure-build')
        showWallEditFeedback('已创建草图圆角。')
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
          data: clearSketchLineTangentIfGeometryChanges(
            firstLine,
            getSketchLineEndpointUpdate(firstLine, firstEndpoint, firstPoint, {
              lineId: connector.id,
              endpoint: 'start',
            }),
          ) as Partial<AnyNode>,
        },
        {
          id: secondLine.id as AnyNodeId,
          data: clearSketchLineTangentIfGeometryChanges(
            secondLine,
            getSketchLineEndpointUpdate(secondLine, secondEndpoint, secondPoint, {
              lineId: connector.id,
              endpoint: 'end',
            }),
          ) as Partial<AnyNode>,
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
      showWallEditFeedback('已创建草图倒角。')
    },
    [getSelectedSketchActionLines, levelId, setSelection, setSketchLineEditOperation, showWallEditFeedback],
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

      const constraintCleanupUpdates = buildRemoveSketchLineConstraintReferencesPlan({
        linesById: sketchLineById,
        deletedIds: lines.map((line) => line.id),
      })
      const coincidentCleanupUpdates = buildRemoveSketchLineCoincidentReferencesPlan({
        linesById: sketchLineById,
        deletedLineIds: lines.map((line) => line.id),
      })
      const distanceDimensionIds = collectSketchDistanceDimensionIdsReferencingEntities({
        dimensions: sketchDimensions,
        deletedLineIds: lines.map((line) => line.id),
      })
      if (constraintCleanupUpdates.length > 0 || coincidentCleanupUpdates.length > 0) {
        useScene.getState().updateNodes(
          [
            ...constraintCleanupUpdates.map((update) => ({
              id: update.id as AnyNodeId,
              data: update.data as Partial<AnyNode>,
            })),
            ...coincidentCleanupUpdates.map((update) => ({
              id: update.id as AnyNodeId,
              data: update.data as Partial<AnyNode>,
            })),
          ],
        )
        for (const update of [...constraintCleanupUpdates, ...coincidentCleanupUpdates]) {
          useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
        }
      }

      sfxEmitter.emit('sfx:item-delete')
      for (const dimensionId of distanceDimensionIds) {
        deleteNode(dimensionId as AnyNodeId)
      }
      for (const line of lines) {
        deleteNode(line.id as AnyNodeId)
      }
      setSelection({ selectedIds: [] })
    },
    [
      deleteNode,
      selectedSketchLineEntry,
      selectedSketchLineList,
      setSelection,
      sketchDimensions,
      sketchLineById,
    ],
  )

  return {
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
  }
}
