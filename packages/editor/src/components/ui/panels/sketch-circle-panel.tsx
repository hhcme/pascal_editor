'use client'

import {
  type AnyNode,
  type AnyNodeId,
  getSketchCirclePathLength,
  type SketchCircleNode,
  type SketchCircleRelation,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Lock, Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { InspectorStat, InspectorSummary } from '../controls/inspector-summary'
import { MetricControl } from '../controls/metric-control'
import { PanelSection } from '../controls/panel-section'
import { ToggleControl } from '../controls/toggle-control'
import { PanelWrapper } from './panel-wrapper'

function hasRelation(node: SketchCircleNode, relation: SketchCircleRelation) {
  return (node.relations ?? []).includes(relation)
}

export function SketchCirclePanel() {
  const selectedId = useViewer((state) => state.selection.selectedIds[0])
  const selectedCount = useViewer((state) => state.selection.selectedIds.length)
  const setSelection = useViewer((state) => state.setSelection)
  const updateNode = useScene((state) => state.updateNode)
  const deleteNode = useScene((state) => state.deleteNode)
  const node = useScene((state) =>
    selectedId
      ? (state.nodes[selectedId as AnyNode['id']] as SketchCircleNode | undefined)
      : undefined,
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleUpdate = useCallback(
    (updates: Partial<SketchCircleNode>) => {
      if (!(selectedId && node) || hasRelation(node, 'fixed')) return
      updateNode(selectedId as AnyNode['id'], updates as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(selectedId as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, selectedId, updateNode],
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

  if (!(node && node.type === 'sketch-circle' && selectedId && selectedCount === 1)) {
    return null
  }

  const isFixed = hasRelation(node, 'fixed')
  const icon = node.kind === 'arc' ? '/icons/sketch-arc.svg' : '/icons/sketch-circle.svg'
  const title = node.name || (node.kind === 'arc' ? '草图圆弧' : '草图圆')

  return (
    <PanelWrapper icon={icon} onClose={handleClose} title={title} width={340}>
      <InspectorSummary>
        <InspectorStat label="类型" value={node.kind === 'arc' ? '圆弧' : '圆'} />
        <InspectorStat label="半径" value={`${node.radius.toFixed(2)} m`} />
        <InspectorStat label="长度" value={`${getSketchCirclePathLength(node).toFixed(2)} m`} />
        <InspectorStat label="模式" value={node.construction ? '参考线' : '轮廓'} />
        <InspectorStat label="状态" value={isFixed ? '已固定' : '可编辑'} />
      </InspectorSummary>

      <PanelSection title="几何">
        <MetricControl
          label="半径"
          max={200}
          min={0.01}
          onChange={(radius) => handleUpdate({ radius, dimensions: { ...node.dimensions, radius } })}
          precision={2}
          step={0.01}
          unit="m"
          value={node.dimensions?.radius ?? node.radius}
        />
        <MetricControl
          label="中心 X"
          onChange={(value) => handleUpdate({ center: [value, node.center[1]] })}
          precision={2}
          step={0.01}
          unit="m"
          value={node.center[0]}
        />
        <MetricControl
          label="中心 Z"
          onChange={(value) => handleUpdate({ center: [node.center[0], value] })}
          precision={2}
          step={0.01}
          unit="m"
          value={node.center[1]}
        />
        {isFixed && (
          <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
            草图圆已固定，关闭固定后才能修改几何。
          </div>
        )}
      </PanelSection>

      <PanelSection title="关系">
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
