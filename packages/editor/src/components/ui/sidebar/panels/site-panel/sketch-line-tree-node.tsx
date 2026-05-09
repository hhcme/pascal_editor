'use client'

import { type AnyNodeId, type SketchLineNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Construction, PencilLine } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { InlineRenameInput } from './inline-rename-input'
import { focusTreeNode, handleTreeSelection, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

interface SketchLineTreeNodeProps {
  nodeId: AnyNodeId
  depth: number
  isLast?: boolean
}

export const SketchLineTreeNode = memo(function SketchLineTreeNode({
  nodeId,
  depth,
  isLast,
}: SketchLineTreeNodeProps) {
  const [isEditing, setIsEditing] = useState(false)
  const node = useScene((s) => s.nodes[nodeId] as SketchLineNode | undefined)
  const isVisible = node?.visible !== false
  const isSelected = useViewer((state) => state.selection.selectedIds.includes(nodeId))
  const isHovered = useViewer((state) => state.hoveredId === nodeId)
  const setSelection = useViewer((state) => state.setSelection)
  const setHoveredId = useViewer((state) => state.setHoveredId)

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      handleTreeSelection(event, nodeId, useViewer.getState().selection.selectedIds, setSelection)
    },
    [nodeId, setSelection],
  )

  const handleDoubleClick = useCallback(() => focusTreeNode(nodeId), [nodeId])
  const handleMouseEnter = useCallback(() => setHoveredId(nodeId), [nodeId, setHoveredId])
  const handleMouseLeave = useCallback(() => setHoveredId(null), [setHoveredId])
  const handleStartEditing = useCallback(() => setIsEditing(true), [])
  const handleStopEditing = useCallback(() => setIsEditing(false), [])

  if (!node) {
    return null
  }
  const Icon = node.construction ? Construction : PencilLine

  return (
    <TreeNodeWrapper
      actions={<TreeNodeActions nodeId={nodeId} />}
      depth={depth}
      expanded={false}
      hasChildren={false}
      icon={<Icon aria-hidden="true" className="h-3.5 w-3.5 stroke-[1.9]" />}
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      isVisible={isVisible}
      label={
        <InlineRenameInput
          defaultName={node.construction ? '参考线' : '草图线'}
          isEditing={isEditing}
          nodeId={nodeId}
          onStartEditing={handleStartEditing}
          onStopEditing={handleStopEditing}
        />
      }
      nodeId={nodeId}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onToggle={() => undefined}
    />
  )
})
