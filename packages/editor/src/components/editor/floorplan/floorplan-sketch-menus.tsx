'use client'

import { Icon } from '@iconify/react'
import type { SketchCircleNode, SketchLineNode } from '@pascal-app/core'
import { memo, type MouseEvent as ReactMouseEvent, useMemo } from 'react'
import useEditor from '../../../store/use-editor'
import { NodeActionMenu, type NodeActionMenuExtraAction } from '../node-action-menu'
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '../../ui/primitives/context-menu'

type SvgPoint = {
  x: number
  y: number
}

type FloorplanActionMenuHandler = (event: ReactMouseEvent<HTMLButtonElement>) => void

type FloorplanActionMenuEntry = {
  position: SvgPoint | null
  onDelete: FloorplanActionMenuHandler
  onMove?: FloorplanActionMenuHandler
  onDuplicate?: FloorplanActionMenuHandler
  extraActions?: NodeActionMenuExtraAction[]
}

type FloorplanActionMenuLayerProps = {
  item: FloorplanActionMenuEntry
  wall: FloorplanActionMenuEntry
  slab: FloorplanActionMenuEntry
  ceiling: FloorplanActionMenuEntry
  opening: FloorplanActionMenuEntry
  stair: FloorplanActionMenuEntry
  sketchLine: FloorplanActionMenuEntry
  sketchCircle: FloorplanActionMenuEntry
  offsetY: number
}

export const FloorplanActionMenuLayer = memo(function FloorplanActionMenuLayer({
  item,
  wall,
  slab,
  ceiling,
  opening,
  stair,
  sketchLine,
  sketchCircle,
  offsetY,
}: FloorplanActionMenuLayerProps) {
  const isFloorplanHovered = useEditor((state) => state.isFloorplanHovered)
  const movingNode = useEditor((state) => state.movingNode)
  const curvingWall = useEditor((state) => state.curvingWall)

  if (!isFloorplanHovered || movingNode || curvingWall) {
    return null
  }

  const entries: FloorplanActionMenuEntry[] = [
    item,
    wall,
    slab,
    ceiling,
    opening,
    stair,
    sketchLine,
    sketchCircle,
  ]

  return (
    <>
      {entries.map((entry, index) =>
        entry.position ? (
          <div
            className="absolute z-30"
            key={index}
            style={{
              left: entry.position.x,
              top: entry.position.y,
              transform: `translate(-50%, calc(-100% - ${offsetY}px))`,
            }}
          >
            <NodeActionMenu
              onDelete={entry.onDelete}
              onDuplicate={entry.onDuplicate}
              extraActions={entry.extraActions}
              onMove={entry.onMove}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            />
          </div>
        ) : null,
      )}
    </>
  )
})

export type FloorplanSketchContextTarget =
  | { kind: 'sketch-line'; lineId: SketchLineNode['id'] }
  | { kind: 'sketch-circle'; circleId: SketchCircleNode['id'] }
  | {
      kind: 'sketch-endpoint'
      lineId: SketchLineNode['id']
      endpoint: 'start' | 'end'
      hasCoincident: boolean
    }
  | { kind: 'sketch-drawing'; draft: 'line' | 'rectangle' | 'circle' | 'arc'; canCommit: boolean }
  | { kind: 'sketch-canvas'; hasSketchLines: boolean }

export type SketchContextTool =
  | 'sketch-line'
  | 'sketch-rectangle'
  | 'sketch-circle'
  | 'sketch-arc'
  | 'sketch-construction-line'
  | 'smart-dimension'

function invokeFloorplanAction(action: NodeActionMenuExtraAction | undefined) {
  if (!action?.onClick || action.disabled) {
    return
  }

  action.onClick({
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  } as ReactMouseEvent<HTMLButtonElement>)
}

type FloorplanSketchContextMenuContentProps = {
  target: FloorplanSketchContextTarget | null
  sketchLineActions: NodeActionMenuExtraAction[]
  sketchCircleActions: NodeActionMenuExtraAction[]
  selectedSketchLineCount: number
  selectedSketchCircleCount: number
  onActivateTool: (tool: SketchContextTool) => void
  onCancelSketchDraft: () => void
  onClearEndpointCoincident: (
    target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>,
  ) => void
  onCommitSketchDraft: () => void
  onConnectEndpoint: (
    target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>,
  ) => void
  onConnectEndpointToCircle: (
    target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>,
  ) => void
  onConnectEndpointToLine: (
    target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>,
  ) => void
  onConnectEndpointToMidpoint: (
    target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>,
  ) => void
  onContinueFromEndpoint: (
    target: Extract<FloorplanSketchContextTarget, { kind: 'sketch-endpoint' }>,
  ) => void
  onDeleteSketchLines: () => void
  onDeleteSketchCircles: () => void
  onEndSketchDraft: () => void
  onSelectAllSketchLines: () => void
  onZoomToFit: () => void
}

export const FloorplanSketchContextMenuContent = memo(function FloorplanSketchContextMenuContent({
  target,
  sketchLineActions,
  sketchCircleActions,
  selectedSketchLineCount,
  selectedSketchCircleCount,
  onActivateTool,
  onCancelSketchDraft,
  onClearEndpointCoincident,
  onCommitSketchDraft,
  onConnectEndpoint,
  onConnectEndpointToCircle,
  onConnectEndpointToLine,
  onConnectEndpointToMidpoint,
  onContinueFromEndpoint,
  onDeleteSketchLines,
  onDeleteSketchCircles,
  onEndSketchDraft,
  onSelectAllSketchLines,
  onZoomToFit,
}: FloorplanSketchContextMenuContentProps) {
  const sketchLineActionById = useMemo(
    () => new Map(sketchLineActions.map((action) => [action.id, action] as const)),
    [sketchLineActions],
  )
  const sketchCircleActionById = useMemo(
    () => new Map(sketchCircleActions.map((action) => [action.id, action] as const)),
    [sketchCircleActions],
  )

  if (!target) {
    return null
  }

  const renderActionItem = (
    actionById: ReadonlyMap<string, NodeActionMenuExtraAction>,
    actionId: string,
    options: { label?: string; disabled?: boolean; checkable?: boolean } = {},
  ) => {
    const action = actionById.get(actionId)
    if (!action) {
      return null
    }

    const disabled = options.disabled || action.disabled
    const label = options.label ?? action.label

    if (options.checkable) {
      return (
        <ContextMenuCheckboxItem
          checked={Boolean(action.active)}
          disabled={disabled}
          key={actionId}
          onSelect={() => invokeFloorplanAction(action)}
        >
          {action.icon}
          <span>{label}</span>
        </ContextMenuCheckboxItem>
      )
    }

    return (
      <ContextMenuItem
        disabled={disabled}
        key={actionId}
        onSelect={() => invokeFloorplanAction(action)}
      >
        {action.icon}
        <span>{label}</span>
        {action.active && (
          <Icon className="ml-auto text-primary" height={15} icon="mdi:check" width={15} />
        )}
      </ContextMenuItem>
    )
  }

  if (target.kind === 'sketch-drawing') {
    const draftLabel =
      target.draft === 'rectangle'
        ? '完成矩形'
        : target.draft === 'circle'
          ? '完成圆'
          : target.draft === 'arc'
            ? '完成圆弧'
            : '完成当前线段'

    return (
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>草图绘制</ContextMenuLabel>
        <ContextMenuItem disabled={!target.canCommit} onSelect={onCommitSketchDraft}>
          <Icon height={16} icon="mdi:check" width={16} />
          <span>{draftLabel}</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCancelSketchDraft}>
          <Icon height={16} icon="mdi:close" width={16} />
          <span>取消当前操作</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onEndSketchDraft}>
          <Icon height={16} icon="mdi:keyboard-return" width={16} />
          <span>结束绘制</span>
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  if (target.kind === 'sketch-endpoint') {
    const fixedAction = sketchLineActionById.get('sketch-line-fixed')
    return (
      <ContextMenuContent className="w-60">
        <ContextMenuLabel>草图端点</ContextMenuLabel>
        <ContextMenuItem onSelect={() => onContinueFromEndpoint(target)}>
          <Icon height={16} icon="mdi:vector-line" width={16} />
          <span>从此点继续绘制</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onConnectEndpoint(target)}>
          <Icon height={16} icon="mdi:vector-combine" width={16} />
          <span>连接到最近端点</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onConnectEndpointToMidpoint(target)}>
          <Icon height={16} icon="mdi:format-align-center" width={16} />
          <span>附着到最近中点</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onConnectEndpointToLine(target)}>
          <Icon height={16} icon="mdi:vector-polyline-plus" width={16} />
          <span>附着到最近直线</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onConnectEndpointToCircle(target)}>
          <Icon height={16} icon="mdi:circle-slice-8" width={16} />
          <span>附着到最近圆弧</span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!target.hasCoincident}
          onSelect={() => onClearEndpointCoincident(target)}
        >
          <Icon height={16} icon="mdi:link-off" width={16} />
          <span>取消重合关系</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        {renderActionItem(sketchLineActionById, 'sketch-line-set-length')}
        {renderActionItem(sketchLineActionById, 'sketch-line-fixed', {
          label: fixedAction?.active ? '解除固定' : '固定',
          checkable: true,
        })}
        <ContextMenuSeparator />
        {renderActionItem(sketchLineActionById, 'sketch-line-create-wall')}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDeleteSketchLines}>
          <img alt="" className="h-4 w-4 shrink-0 object-contain" src="/icons/delete.svg" />
          <span>删除草图线</span>
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  if (target.kind === 'sketch-line') {
    const fixedAction = sketchLineActionById.get('sketch-line-fixed')
    const constructionAction = sketchLineActionById.get('sketch-line-construction')
    const hasMultiSelection = selectedSketchLineCount > 1

    return (
      <ContextMenuContent className="w-60">
        <ContextMenuLabel>
          {hasMultiSelection ? `${selectedSketchLineCount} 条草图线` : '草图线'}
        </ContextMenuLabel>
        {renderActionItem(sketchLineActionById, 'sketch-line-set-length', {
          disabled: hasMultiSelection,
        })}
        {renderActionItem(sketchLineActionById, 'sketch-line-horizontal', {
          disabled: hasMultiSelection,
          checkable: true,
        })}
        {renderActionItem(sketchLineActionById, 'sketch-line-vertical', {
          disabled: hasMultiSelection,
          checkable: true,
        })}
        {renderActionItem(sketchLineActionById, 'sketch-line-fixed', {
          label: fixedAction?.active ? '解除固定' : '固定',
          disabled: hasMultiSelection,
          checkable: true,
        })}
        {renderActionItem(sketchLineActionById, 'sketch-line-construction', {
          label: constructionAction?.active ? '切换为轮廓线' : '切换为参考线',
          disabled: hasMultiSelection,
          checkable: true,
        })}
        <ContextMenuSeparator />
        {renderActionItem(sketchLineActionById, 'sketch-line-tangent', {
          disabled: hasMultiSelection,
        })}
        {renderActionItem(sketchLineActionById, 'sketch-line-trim-extend', {
          disabled: hasMultiSelection,
        })}
        {renderActionItem(sketchLineActionById, 'sketch-line-split', {
          disabled: hasMultiSelection,
        })}
        {renderActionItem(sketchLineActionById, 'sketch-line-offset')}
        {renderActionItem(sketchLineActionById, 'sketch-line-fillet', {
          disabled: selectedSketchLineCount < 2,
        })}
        {renderActionItem(sketchLineActionById, 'sketch-line-chamfer', {
          disabled: selectedSketchLineCount < 2,
        })}
        {hasMultiSelection && (
          <>
            {renderActionItem(sketchLineActionById, 'sketch-line-equal-length', {
              checkable: true,
            })}
            {renderActionItem(sketchLineActionById, 'sketch-line-parallel', {
              checkable: true,
            })}
            {renderActionItem(sketchLineActionById, 'sketch-line-perpendicular', {
              checkable: true,
            })}
            {renderActionItem(sketchLineActionById, 'sketch-line-collinear', {
              checkable: true,
            })}
            {renderActionItem(sketchLineActionById, 'sketch-line-mirror')}
            {renderActionItem(sketchLineActionById, 'sketch-line-linear-pattern')}
          </>
        )}
        <ContextMenuSeparator />
        {sketchLineActionById.has('sketch-profile-walls') ? (
          <>
            {renderActionItem(sketchLineActionById, 'sketch-profile-walls')}
            {renderActionItem(sketchLineActionById, 'sketch-profile-slab')}
            {renderActionItem(sketchLineActionById, 'sketch-profile-zone')}
          </>
        ) : (
          renderActionItem(sketchLineActionById, 'sketch-line-create-wall')
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDeleteSketchLines}>
          <img alt="" className="h-4 w-4 shrink-0 object-contain" src="/icons/delete.svg" />
          <span>删除</span>
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  if (target.kind === 'sketch-circle') {
    const fixedAction = sketchCircleActionById.get('sketch-circle-fixed')
    const constructionAction = sketchCircleActionById.get('sketch-circle-construction')
    const concentricAction = sketchCircleActionById.get('sketch-circle-concentric')
    const equalRadiusAction = sketchCircleActionById.get('sketch-circle-equal-radius')
    const tangentAction = sketchCircleActionById.get('sketch-circle-tangent')
    const hasMultiSelection = selectedSketchCircleCount > 1

    return (
      <ContextMenuContent className="w-60">
        <ContextMenuLabel>
          {hasMultiSelection ? `${selectedSketchCircleCount} 个草图圆` : '草图圆/圆弧'}
        </ContextMenuLabel>
        {renderActionItem(sketchCircleActionById, 'sketch-circle-set-radius', {
          disabled: hasMultiSelection,
        })}
        {renderActionItem(sketchCircleActionById, 'sketch-circle-fixed', {
          label: fixedAction?.active ? '解除固定' : '固定',
          checkable: true,
        })}
        {renderActionItem(sketchCircleActionById, 'sketch-circle-construction', {
          label: constructionAction?.active ? '切换为轮廓线' : '切换为参考线',
          checkable: true,
        })}
        <ContextMenuSeparator />
        {renderActionItem(sketchCircleActionById, 'sketch-circle-concentric', {
          label: concentricAction?.active ? '取消同心' : '设为同心',
          checkable: true,
          disabled: selectedSketchCircleCount < 2,
        })}
        {renderActionItem(sketchCircleActionById, 'sketch-circle-equal-radius', {
          label: equalRadiusAction?.active ? '取消等半径' : '设为等半径',
          checkable: true,
          disabled: selectedSketchCircleCount < 2,
        })}
        {renderActionItem(sketchCircleActionById, 'sketch-circle-tangent', {
          label: tangentAction?.active ? '取消相切' : '设为相切',
          checkable: true,
          disabled: selectedSketchCircleCount !== 2,
        })}
        <ContextMenuSeparator />
        {renderActionItem(sketchCircleActionById, 'sketch-circle-trim-extend')}
        {renderActionItem(sketchCircleActionById, 'sketch-circle-offset')}
        {renderActionItem(sketchCircleActionById, 'sketch-circle-mirror')}
        {renderActionItem(sketchCircleActionById, 'sketch-circle-linear-pattern')}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDeleteSketchCircles}>
          <img alt="" className="h-4 w-4 shrink-0 object-contain" src="/icons/delete.svg" />
          <span>删除</span>
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  return (
    <ContextMenuContent className="w-56">
      <ContextMenuLabel>草图</ContextMenuLabel>
      <ContextMenuItem onSelect={() => onActivateTool('sketch-line')}>
        <Icon height={16} icon="mdi:vector-line" width={16} />
        <span>草图线</span>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onActivateTool('sketch-rectangle')}>
        <Icon height={16} icon="mdi:rectangle-outline" width={16} />
        <span>矩形</span>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onActivateTool('sketch-circle')}>
        <Icon height={16} icon="mdi:circle-outline" width={16} />
        <span>圆</span>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onActivateTool('sketch-arc')}>
        <Icon height={16} icon="mdi:vector-arc" width={16} />
        <span>圆弧</span>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onActivateTool('sketch-construction-line')}>
        <Icon height={16} icon="mdi:dots-horizontal-circle-outline" width={16} />
        <span>参考线</span>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onActivateTool('smart-dimension')}>
        <Icon height={16} icon="mdi:ruler-square" width={16} />
        <span>智能尺寸</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!target.hasSketchLines} onSelect={onSelectAllSketchLines}>
        <Icon height={16} icon="mdi:select-all" width={16} />
        <span>全选草图线</span>
      </ContextMenuItem>
      <ContextMenuItem onSelect={onZoomToFit}>
        <Icon height={16} icon="mdi:magnify-scan" width={16} />
        <span>缩放到全部草图</span>
      </ContextMenuItem>
    </ContextMenuContent>
  )
})
