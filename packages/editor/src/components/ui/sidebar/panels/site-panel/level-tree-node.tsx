import { type AnyNode, type AnyNodeId, type LevelNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Box, ChevronRight, Cuboid, Layers, PencilRuler } from 'lucide-react'
import { memo, type ReactNode, useCallback, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '../../../../../lib/utils'
import { InlineRenameInput } from './inline-rename-input'
import { focusTreeNode, TreeNode, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

interface LevelTreeNodeProps {
  nodeId: AnyNodeId
  depth: number
  isLast?: boolean
}

type LevelChildGroup = {
  id: 'sketch' | 'features' | 'components'
  label: string
  icon: ReactNode
  children: AnyNodeId[]
}

function getLevelChildGroupId(node: AnyNode | undefined): LevelChildGroup['id'] {
  if (!node) return 'components'

  if (
    node.type === 'sketch-line' ||
    node.type === 'sketch-circle' ||
    node.type === 'sketch-dimension'
  ) {
    return 'sketch'
  }

  if (node.type === 'feature') {
    return 'features'
  }

  return 'components'
}

const LEVEL_CHILD_GROUP_META: Record<
  LevelChildGroup['id'],
  Pick<LevelChildGroup, 'id' | 'label' | 'icon'>
> = {
  sketch: {
    id: 'sketch',
    label: '草图',
    icon: <PencilRuler className="h-3.5 w-3.5" />,
  },
  features: {
    id: 'features',
    label: '特征',
    icon: <Cuboid className="h-3.5 w-3.5" />,
  },
  components: {
    id: 'components',
    label: '构件',
    icon: <Box className="h-3.5 w-3.5" />,
  },
}

const LEVEL_CHILD_GROUP_ORDER: LevelChildGroup['id'][] = ['sketch', 'features', 'components']

const LevelChildGroupNode = memo(function LevelChildGroupNode({
  depth,
  group,
  isLast,
}: {
  depth: number
  group: LevelChildGroup
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div>
      <div
        className={cn(
          'group/row relative flex h-8 cursor-pointer select-none items-center border-border/50 border-r border-r-transparent border-b text-muted-foreground text-xs transition-colors hover:bg-accent/30 hover:text-foreground',
        )}
        onClick={() => setExpanded((prev) => !prev)}
        style={{ paddingLeft: depth * 12 + 12, paddingRight: 12 }}
      >
        <div
          className={cn(
            'pointer-events-none absolute w-px bg-border/50',
            isLast ? 'top-0 bottom-1/2' : 'top-0 bottom-0',
          )}
          style={{ left: (depth - 1) * 12 + 20 }}
        />
        <div
          className="pointer-events-none absolute top-1/2 h-px bg-border/50"
          style={{ left: (depth - 1) * 12 + 20, width: 4 }}
        />
        {expanded ? (
          <div
            className="pointer-events-none absolute top-1/2 bottom-0 w-px bg-border/50"
            style={{ left: depth * 12 + 20 }}
          />
        ) : null}
        <button
          className="z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-inherit text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          type="button"
        >
          <ChevronRight
            className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')}
          />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-70">
            {group.icon}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{group.label}</span>
          <span className="shrink-0 text-[10px] opacity-70">{group.children.length}</span>
        </div>
      </div>
      {expanded
        ? group.children.map((childId, index) => (
            <TreeNode
              depth={depth + 1}
              isLast={index === group.children.length - 1}
              key={childId}
              nodeId={childId}
            />
          ))
        : null}
    </div>
  )
})

export const LevelTreeNode = memo(function LevelTreeNode({
  nodeId,
  depth,
  isLast,
}: LevelTreeNodeProps) {
  const levelId = nodeId as LevelNode['id']
  const [expanded, setExpanded] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const isVisible = useScene((s) => s.nodes[nodeId]?.visible !== false)
  const children = useScene(
    useShallow((s) => (s.nodes[nodeId] as LevelNode | undefined)?.children ?? []),
  )
  const childGroups = useScene(
    useShallow((s) => {
      const groups = new Map<LevelChildGroup['id'], AnyNodeId[]>()

      for (const childId of (s.nodes[nodeId] as LevelNode | undefined)?.children ?? []) {
        const groupId = getLevelChildGroupId(s.nodes[childId])
        groups.set(groupId, [...(groups.get(groupId) ?? []), childId])
      }

      return LEVEL_CHILD_GROUP_ORDER.flatMap((groupId) => {
        const groupChildren = groups.get(groupId) ?? []
        if (groupChildren.length === 0) return []
        const meta = LEVEL_CHILD_GROUP_META[groupId]
        return [{ ...meta, children: groupChildren }]
      })
    }),
  )
  const level = useScene((s) => (s.nodes[nodeId] as LevelNode | undefined)?.level ?? 0)
  const isSelected = useViewer((state) => state.selection.levelId === levelId)
  const isHovered = useViewer((state) => state.hoveredId === nodeId)
  const setSelection = useViewer((state) => state.setSelection)

  const handleClick = useCallback(() => setSelection({ levelId }), [levelId, setSelection])
  const handleDoubleClick = useCallback(() => focusTreeNode(nodeId), [nodeId])
  const handleToggle = useCallback(() => setExpanded((prev) => !prev), [])
  const handleStartEditing = useCallback(() => setIsEditing(true), [])
  const handleStopEditing = useCallback(() => setIsEditing(false), [])

  const defaultName = `Level ${level}`

  return (
    <TreeNodeWrapper
      actions={<TreeNodeActions nodeId={nodeId} />}
      depth={depth}
      expanded={expanded}
      hasChildren={children.length > 0}
      icon={<Layers className="h-3.5 w-3.5" />}
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      isVisible={isVisible}
      label={
        <InlineRenameInput
          defaultName={defaultName}
          isEditing={isEditing}
          nodeId={nodeId}
          onStartEditing={handleStartEditing}
          onStopEditing={handleStopEditing}
        />
      }
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onToggle={handleToggle}
    >
      {childGroups.map((group, index) => (
        <LevelChildGroupNode
          depth={depth + 1}
          group={group}
          isLast={index === childGroups.length - 1}
          key={group.id}
        />
      ))}
    </TreeNodeWrapper>
  )
})
