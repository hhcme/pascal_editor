'use client'

import {
  type AnyNode,
  type AnyNodeId,
  getClampedSketchLineCurveOffset,
  getMaxSketchLineCurveOffset,
  normalizeSketchLineCurveOffset,
  type SketchLineNode,
  type SketchLineRelation,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Lock, Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import {
  buildOrientSketchLinePlan,
  buildSetSketchLineLengthPlan,
  getSketchLineLength2D,
  getSketchLinePathLength2D,
  type SketchLineEditResult,
  type SketchPlanPoint,
} from '../../tools/sketch/sketch-geometry'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { InspectorStat, InspectorSummary } from '../controls/inspector-summary'
import { MetricControl } from '../controls/metric-control'
import { PanelSection } from '../controls/panel-section'
import { ToggleControl } from '../controls/toggle-control'
import { PanelWrapper } from './panel-wrapper'

function hasRelation(node: SketchLineNode, relation: SketchLineRelation) {
  return (node.relations ?? []).includes(relation)
}

function getEndpointPatch(
  node: SketchLineNode,
  endpoint: 'start' | 'end',
  axis: 0 | 1,
  value: number,
): Pick<SketchLineNode, 'start' | 'end'> {
  const start: SketchPlanPoint = [...node.start]
  const end: SketchPlanPoint = [...node.end]
  const target = endpoint === 'start' ? start : end
  target[axis] = value

  if (hasRelation(node, 'horizontal')) {
    const z = target[1]
    start[1] = z
    end[1] = z
  } else if (hasRelation(node, 'vertical')) {
    const x = target[0]
    start[0] = x
    end[0] = x
  }

  return { start, end }
}

function formatRelations(node: SketchLineNode) {
  const relations = node.relations ?? []
  if (relations.length === 0) return '自由'
  return relations
    .map((relation) => {
      if (relation === 'horizontal') return '水平'
      if (relation === 'vertical') return '垂直'
      return '固定'
    })
    .join(', ')
}

export function SketchLinePanel() {
  const selectedId = useViewer((state) => state.selection.selectedIds[0])
  const selectedCount = useViewer((state) => state.selection.selectedIds.length)
  const setSelection = useViewer((state) => state.setSelection)
  const updateNode = useScene((state) => state.updateNode)
  const updateNodes = useScene((state) => state.updateNodes)
  const deleteNode = useScene((state) => state.deleteNode)

  const node = useScene((state) =>
    selectedId ? (state.nodes[selectedId as AnyNode['id']] as SketchLineNode | undefined) : undefined,
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleUpdate = useCallback(
    (updates: Partial<SketchLineNode>) => {
      if (!(selectedId && node) || hasRelation(node, 'fixed')) return
      updateNode(selectedId as AnyNode['id'], updates as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(selectedId as AnyNodeId)
    },
    [node, selectedId, updateNode],
  )

  const runEditResult = useCallback(
    (result: SketchLineEditResult) => {
      if (!result.ok) return
      updateNodes(
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
    },
    [setSelection, updateNodes],
  )

  const handleLengthChange = useCallback(
    (length: number) => {
      if (!node) return
      runEditResult(buildSetSketchLineLengthPlan({ line: node, length }))
    },
    [node, runEditResult],
  )

  const handleOrientationChange = useCallback(
    (orientation: 'horizontal' | 'vertical', checked: boolean) => {
      if (!node) return

      if (checked) {
        runEditResult(buildOrientSketchLinePlan({ line: node, orientation }))
        return
      }

      const relations = (node.relations ?? []).filter((relation) => relation !== orientation)
      updateNode(node.id as AnyNodeId, { relations } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, runEditResult, updateNode],
  )

  const handleFixedChange = useCallback(
    (checked: boolean) => {
      if (!node) return
      const relations = new Set(node.relations ?? [])
      if (checked) {
        relations.add('fixed')
      } else {
        relations.delete('fixed')
      }
      updateNode(node.id as AnyNodeId, { relations: [...relations] } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, updateNode],
  )

  const handleConstructionChange = useCallback(
    (checked: boolean) => {
      if (!node) return
      updateNode(node.id as AnyNodeId, { construction: checked } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, updateNode],
  )

  const handleDelete = useCallback(() => {
    if (!node) return
    sfxEmitter.emit('sfx:item-delete')
    deleteNode(node.id as AnyNodeId)
    setSelection({ selectedIds: [] })
  }, [deleteNode, node, setSelection])

  if (!(node && node.type === 'sketch-line' && selectedId && selectedCount === 1)) {
    return null
  }

  const chordLength = getSketchLineLength2D(node)
  const length = getSketchLinePathLength2D(node)
  const curveOffset = getClampedSketchLineCurveOffset(node)
  const maxCurveOffset = getMaxSketchLineCurveOffset(node)
  const isFixed = hasRelation(node, 'fixed')
  const icon = node.construction ? '/icons/sketch-construction-line.svg' : '/icons/sketch-line.svg'

  return (
    <PanelWrapper icon={icon} onClose={handleClose} title={node.name || '草图线'} width={340}>
      <InspectorSummary>
        <InspectorStat label="长度" value={`${length.toFixed(2)} m`} />
        <InspectorStat label="弯曲" value={`${curveOffset.toFixed(2)} m`} />
        <InspectorStat label="模式" value={node.construction ? '参考线' : '轮廓'} />
        <InspectorStat label="关系" value={formatRelations(node)} />
        <InspectorStat label="状态" value={isFixed ? '已固定' : '可编辑'} />
      </InspectorSummary>

      <PanelSection title="几何">
        <MetricControl
          label="长度"
          max={200}
          min={0.01}
          onChange={handleLengthChange}
          precision={2}
          step={0.01}
          unit="m"
          value={node.dimensions?.length ?? chordLength}
        />
        <MetricControl
          label="弯曲"
          max={Math.max(0.01, maxCurveOffset)}
          min={-Math.max(0.01, maxCurveOffset)}
          onChange={(value) =>
            handleUpdate({ curveOffset: normalizeSketchLineCurveOffset(node, value) })
          }
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(curveOffset * 100) / 100}
        />
        <MetricControl
          label="起点 X"
          onChange={(value) => handleUpdate(getEndpointPatch(node, 'start', 0, value))}
          precision={2}
          step={0.01}
          unit="m"
          value={node.start[0]}
        />
        <MetricControl
          label="起点 Z"
          onChange={(value) => handleUpdate(getEndpointPatch(node, 'start', 1, value))}
          precision={2}
          step={0.01}
          unit="m"
          value={node.start[1]}
        />
        <MetricControl
          label="终点 X"
          onChange={(value) => handleUpdate(getEndpointPatch(node, 'end', 0, value))}
          precision={2}
          step={0.01}
          unit="m"
          value={node.end[0]}
        />
        <MetricControl
          label="终点 Z"
          onChange={(value) => handleUpdate(getEndpointPatch(node, 'end', 1, value))}
          precision={2}
          step={0.01}
          unit="m"
          value={node.end[1]}
        />
        {isFixed && (
          <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
            草图线已固定，关闭固定后才能修改几何。
          </div>
        )}
      </PanelSection>

      <PanelSection title="关系">
        <ToggleControl
          checked={hasRelation(node, 'horizontal')}
          label="水平"
          onChange={(checked) => handleOrientationChange('horizontal', checked)}
        />
        <ToggleControl
          checked={hasRelation(node, 'vertical')}
          label="垂直"
          onChange={(checked) => handleOrientationChange('vertical', checked)}
        />
        <ToggleControl checked={isFixed} label="固定" onChange={handleFixedChange} />
        <ToggleControl
          checked={node.construction}
          label="参考线"
          onChange={handleConstructionChange}
        />
      </PanelSection>

      <PanelSection title="操作">
        <ActionGroup>
          <ActionButton
            icon={<AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />}
            label="水平"
            onClick={() => handleOrientationChange('horizontal', true)}
          />
          <ActionButton
            icon={<AlignVerticalJustifyCenter className="h-3.5 w-3.5" />}
            label="垂直"
            onClick={() => handleOrientationChange('vertical', true)}
          />
        </ActionGroup>
        <ActionGroup>
          <ActionButton
            icon={<Lock className="h-3.5 w-3.5" />}
            label={isFixed ? '解除固定' : '固定'}
            onClick={() => handleFixedChange(!isFixed)}
          />
          <ActionButton
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="删除"
            onClick={handleDelete}
            tone="danger"
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
