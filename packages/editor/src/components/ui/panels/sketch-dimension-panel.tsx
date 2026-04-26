'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type SketchCircleNode,
  type SketchDimensionNode,
  type SketchLineNode,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { AlertTriangle, Ruler, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { cn } from '../../../lib/utils'
import { buildSetSketchCircleCenterPlan } from '../../tools/sketch/sketch-circle-constraints'
import { buildPropagateSketchLineTangentsFromCircles } from '../../tools/sketch/sketch-line-tangent'
import { buildResolvedSketchLineUpdateSet } from '../../tools/sketch/sketch-line-resolution'
import {
  buildSetSketchDistanceDimensionValuePlan,
  getSketchDistanceMeasurementFailureReason,
  resolveSketchDistanceMeasurement,
} from '../../tools/sketch/sketch-distance-dimensions'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { InspectorStat, InspectorSummary } from '../controls/inspector-summary'
import { MetricControl } from '../controls/metric-control'
import { PanelSection } from '../controls/panel-section'
import { SegmentedControl } from '../controls/segmented-control'
import { ToggleControl } from '../controls/toggle-control'
import { PanelWrapper } from './panel-wrapper'

function formatDistanceValue(value: number, unit: 'metric' | 'imperial') {
  const displayValue = unit === 'imperial' ? value * 3.280_84 : value
  return `${Number.parseFloat(displayValue.toFixed(2))} ${unit === 'imperial' ? 'ft' : 'm'}`
}

function getDistanceRelationLabel(relation: 'point-point' | 'point-line' | 'line-line') {
  switch (relation) {
    case 'point-point':
      return '点-点'
    case 'point-line':
      return '点-线'
    case 'line-line':
      return '线-线'
  }
}

function getReferenceLabel(args: {
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  reference: SketchDimensionNode['start']
}) {
  const { circlesById, linesById, reference } = args

  if (reference.kind === 'line') {
    const line = linesById.get(reference.lineId)
    return `${line?.name ?? '草图线'}（整线）`
  }

  if (reference.kind === 'line-endpoint') {
    const line = linesById.get(reference.lineId)
    return `${line?.name ?? '草图线'}（${reference.endpoint === 'start' ? '起点' : '终点'}）`
  }

  const circle = circlesById.get(reference.circleId)
  return `${circle?.name ?? '草图圆/圆弧'}（圆心）`
}

export function SketchDimensionPanel() {
  const selectedId = useViewer((state) => state.selection.selectedIds[0])
  const selectedCount = useViewer((state) => state.selection.selectedIds.length)
  const setSelection = useViewer((state) => state.setSelection)
  const unit = useViewer((state) => state.unit)
  const nodes = useScene((state) => state.nodes)
  const updateNode = useScene((state) => state.updateNode)
  const deleteNode = useScene((state) => state.deleteNode)
  const node = useScene((state) =>
    selectedId
      ? (state.nodes[selectedId as AnyNode['id']] as SketchDimensionNode | undefined)
      : undefined,
  )

  const sketchLineById = useMemo(
    () =>
      new Map(
        Object.values(nodes)
          .filter((candidate): candidate is SketchLineNode => candidate.type === 'sketch-line')
          .map((line) => [line.id, line] as const),
      ),
    [nodes],
  )
  const sketchCircleById = useMemo(
    () =>
      new Map(
        Object.values(nodes)
          .filter((candidate): candidate is SketchCircleNode => candidate.type === 'sketch-circle')
          .map((circle) => [circle.id, circle] as const),
      ),
    [nodes],
  )
  const [editFeedback, setEditFeedback] = useState<string | null>(null)

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleDelete = useCallback(() => {
    if (!node) {
      return
    }

    setSelection({ selectedIds: [] })
    deleteNode(node.id as AnyNodeId)
    sfxEmitter.emit('sfx:item-delete')
  }, [deleteNode, node, setSelection])

  if (!(node && node.type === 'sketch-dimension' && selectedId && selectedCount === 1)) {
    return null
  }

  const measurementResult = resolveSketchDistanceMeasurement({
    circlesById: sketchCircleById,
    dimension: node,
    linesById: sketchLineById,
  })

  const referenceStartLabel = getReferenceLabel({
    circlesById: sketchCircleById,
    linesById: sketchLineById,
    reference: node.start,
  })
  const referenceEndLabel = getReferenceLabel({
    circlesById: sketchCircleById,
    linesById: sketchLineById,
    reference: node.end,
  })
  const relationLabel = measurementResult.ok
    ? getDistanceRelationLabel(measurementResult.measurement.relation)
    : '无效尺寸'
  const distanceLabel = measurementResult.ok
    ? formatDistanceValue(measurementResult.measurement.value, unit)
    : '无法计算'
  const measurementNotice = measurementResult.ok
    ? node.mode === 'driven'
      ? '驱动模式下会固定 start 参考，并推动 end 参考几何到目标距离。'
      : '参考模式只做标注，不会驱动几何。'
    : getSketchDistanceMeasurementFailureReason(measurementResult.reason)
  const noticeClassName = cn(
    'rounded-md border px-3 py-2 text-[11px]',
    measurementResult.ok && !editFeedback
      ? 'border-border/55 bg-muted/35 text-muted-foreground'
      : 'border-destructive/30 bg-destructive/5 text-destructive',
  )

  const applyLineUpdates = useCallback(
    (updates: Array<{ id: SketchLineNode['id']; data: Partial<SketchLineNode> }>) => {
      const resolvedUpdates = buildResolvedSketchLineUpdateSet({
        linesById: sketchLineById,
        circlesById: sketchCircleById,
        initialUpdates: updates,
      })
      if (!resolvedUpdates.ok) {
        setEditFeedback(resolvedUpdates.reason)
        return
      }

      const allUpdates = resolvedUpdates.updates.map((update) => ({
        id: update.id as AnyNodeId,
        data: update.data as Partial<AnyNode>,
      }))
      if (allUpdates.length > 0) {
        useScene.getState().updateNodes(allUpdates)
        for (const update of allUpdates) {
          useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
        }
        sfxEmitter.emit('sfx:structure-build')
      }
      setSelection({ selectedIds: [node.id] })
      setEditFeedback(null)
    },
    [node.id, setSelection, sketchCircleById, sketchLineById],
  )

  const applyCircleResult = useCallback(
    (
      result:
        | {
            ok: true
            updates: Array<{ id: SketchCircleNode['id']; data: Partial<SketchCircleNode> }>
          }
        | {
            ok: false
            reason: string
          },
    ) => {
      if (!result.ok) {
        setEditFeedback(result.reason)
        return
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
        setEditFeedback(tangentPropagation.reason)
        return
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
        setEditFeedback(resolvedLineUpdates.reason)
        return
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
      setSelection({ selectedIds: [node.id] })
      setEditFeedback(null)
    },
    [node.id, setSelection, sketchCircleById, sketchLineById],
  )

  const handleModeChange = useCallback(
    (mode: 'reference' | 'driven') => {
      updateNode(node.id as AnyNodeId, { mode })
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
      setEditFeedback(null)
    },
    [node.id, updateNode],
  )

  const handleDistanceChange = useCallback(
    (value: number) => {
      if (node.mode !== 'driven') {
        setEditFeedback('请先切换为驱动尺寸，再修改距离值。')
        return
      }

      const result = buildSetSketchDistanceDimensionValuePlan({
        circlesById: sketchCircleById,
        dimension: node,
        linesById: sketchLineById,
        value,
      })
      if (!result.ok) {
        setEditFeedback(result.reason)
        return
      }

      if (result.kind === 'line') {
        applyLineUpdates(result.updates)
        return
      }

      const circle = sketchCircleById.get(result.circleId)
      if (!circle) {
        setEditFeedback('引用的草图圆或圆弧已不存在。')
        return
      }

      applyCircleResult(
        buildSetSketchCircleCenterPlan({
          circle,
          circlesById: sketchCircleById,
          center: result.center,
        }),
      )
    },
    [applyCircleResult, applyLineUpdates, node, sketchCircleById, sketchLineById],
  )

  return (
    <PanelWrapper onClose={handleClose} title={node.name || '草图距离尺寸'} width={340}>
      <InspectorSummary>
        <InspectorStat label="类型" value={relationLabel} />
        <InspectorStat label="模式" value={node.mode === 'driven' ? '驱动' : '参考'} />
        <InspectorStat label="距离" value={distanceLabel} />
        <InspectorStat label="显示" value={node.visible === false ? '已隐藏' : '显示中'} />
      </InspectorSummary>

      <PanelSection title="参考">
        <div className="rounded-md border border-border/55 bg-card px-3 py-2">
          <div className="text-[11px] text-muted-foreground">
            起点参考
            {node.mode === 'driven' ? '（锚点）' : ''}
          </div>
          <div className="mt-0.5 truncate font-medium text-sm">{referenceStartLabel}</div>
        </div>
        <div className="rounded-md border border-border/55 bg-card px-3 py-2">
          <div className="text-[11px] text-muted-foreground">
            终点参考
            {node.mode === 'driven' ? '（被驱动）' : ''}
          </div>
          <div className="mt-0.5 truncate font-medium text-sm">{referenceEndLabel}</div>
        </div>
      </PanelSection>

      <PanelSection title="尺寸">
        <SegmentedControl
          onChange={handleModeChange}
          options={[
            { label: '参考', value: 'reference' },
            { label: '驱动', value: 'driven' },
          ]}
          value={node.mode}
        />
        {measurementResult.ok ? (
          <MetricControl
            label="距离"
            max={1000}
            min={0.01}
            onChange={handleDistanceChange}
            precision={2}
            step={0.05}
            unit="m"
            value={measurementResult.measurement.value}
          />
        ) : null}
      </PanelSection>

      <PanelSection title="显示">
        <ToggleControl
          checked={node.visible !== false}
          label="显示距离尺寸"
          onChange={(checked) => {
            updateNode(node.id as AnyNodeId, { visible: checked })
          }}
        />
        <MetricControl
          label="偏移"
          max={10}
          min={-10}
          onChange={(value) => {
            updateNode(node.id as AnyNodeId, { offset: value })
          }}
          precision={2}
          step={0.05}
          unit="m"
          value={node.offset ?? 0.42}
        />
      </PanelSection>

      <PanelSection title="状态">
        <div className={noticeClassName}>
          <div className="flex items-center gap-1.5 font-medium text-[11px]">
            {measurementResult.ok && !editFeedback ? (
              <Ruler className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {measurementResult.ok && !editFeedback ? '当前尺寸可用。' : '当前尺寸需要处理。'}
          </div>
          <div className="mt-1 leading-5">{editFeedback ?? measurementNotice}</div>
        </div>
      </PanelSection>

      <PanelSection title="操作">
        <ActionGroup>
          <ActionButton
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="删除尺寸"
            onClick={handleDelete}
            tone="danger"
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
