'use client'

import { Icon } from '@iconify/react'
import type { ReactNode } from 'react'
import { memo, useMemo, useState } from 'react'
import { useEditorLanguage } from '../../../hooks/use-editor-language'
import { cn } from '../../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/primitives/popover'
import type { NodeActionMenuExtraAction } from '../node-action-menu'
import type { SketchContextTool } from './floorplan-sketch-menus'

type SketchDraftKind = 'line' | 'rectangle' | 'circle' | 'arc' | null

type FloorplanSketchCommandBarProps = {
  activeTool: SketchContextTool | null
  draftKind: SketchDraftKind
  canCommitDraft: boolean
  sketchPlane: {
    kind: 'feature-top'
    elevation: number
  } | null
  lineSelectionCount: number
  circleSelectionCount: number
  sketchLineActions: NodeActionMenuExtraAction[]
  sketchCircleActions: NodeActionMenuExtraAction[]
  onActivateTool: (tool: SketchContextTool) => void
  onCommitDraft: () => void
  onCancelDraft: () => void
  onExitSketch: () => void
}

type CommandBarCopy = {
  title: string
  draw: string
  quickActions: string
  constraints: string
  edit: string
  generate: string
  exitSketch: string
  cancelDraft: string
  completeSketch: string
  moreActions: string
  topFacePlane: (elevation: number) => string
  readyStatus: string
  activeToolStatus: (toolLabel: string) => string
  draftStatus: (draftLabel: string) => string
  lineSelectionStatus: (count: number) => string
  circleSelectionStatus: (count: number) => string
  mixedSelectionStatus: (lineCount: number, circleCount: number) => string
  commitLine: string
  commitRectangle: string
  commitCircle: string
  commitArc: string
}

const COPY: Record<'zh-CN' | 'en', CommandBarCopy> = {
  'zh-CN': {
    title: '草图模式',
    draw: '绘制',
    quickActions: '常用',
    constraints: '约束',
    edit: '编辑',
    generate: '生成',
    exitSketch: '退出草图',
    cancelDraft: '取消草稿',
    completeSketch: '完成草图',
    moreActions: '更多',
    topFacePlane: (elevation) => `顶面 · ${elevation.toFixed(2)} m`,
    readyStatus: '选择工具或开始绘制',
    activeToolStatus: (toolLabel) => `当前工具：${toolLabel}`,
    draftStatus: (draftLabel) => `正在绘制${draftLabel}`,
    lineSelectionStatus: (count) => `已选中 ${count} 条草图线`,
    circleSelectionStatus: (count) => `已选中 ${count} 个圆`,
    mixedSelectionStatus: (lineCount, circleCount) =>
      `已选中 ${lineCount} 条草图线和 ${circleCount} 个圆`,
    commitLine: '完成线段',
    commitRectangle: '完成矩形',
    commitCircle: '完成圆',
    commitArc: '完成圆弧',
  },
  en: {
    title: 'Sketch Mode',
    draw: 'Draw',
    quickActions: 'Quick',
    constraints: 'Constraints',
    edit: 'Edit',
    generate: 'Generate',
    exitSketch: 'Exit Sketch',
    cancelDraft: 'Cancel Draft',
    completeSketch: 'Finish Sketch',
    moreActions: 'More',
    topFacePlane: (elevation) => `Top face · ${elevation.toFixed(2)} m`,
    readyStatus: 'Choose a tool or start sketching',
    activeToolStatus: (toolLabel) => `Current tool: ${toolLabel}`,
    draftStatus: (draftLabel) => `Drawing ${draftLabel}`,
    lineSelectionStatus: (count) => `${count} sketch line${count === 1 ? '' : 's'} selected`,
    circleSelectionStatus: (count) => `${count} circle${count === 1 ? '' : 's'} selected`,
    mixedSelectionStatus: (lineCount, circleCount) =>
      `${lineCount} line${lineCount === 1 ? '' : 's'} and ${circleCount} circle${circleCount === 1 ? '' : 's'} selected`,
    commitLine: 'Finish Line',
    commitRectangle: 'Finish Rectangle',
    commitCircle: 'Finish Circle',
    commitArc: 'Finish Arc',
  },
}

type SketchToolButtonConfig = {
  id: SketchContextTool
  iconSrc: string
  labels: Record<'zh-CN' | 'en', string>
}

type ToolbarActionLabelOverride = Partial<Record<'zh-CN' | 'en', string>>

type ToolbarGroup = {
  id: string
  label: string
  actions: NodeActionMenuExtraAction[]
  maxVisibleActions?: number
}

const SKETCH_TOOL_BUTTONS: SketchToolButtonConfig[] = [
  {
    id: 'sketch-line',
    iconSrc: '/icons/sketch-line.svg',
    labels: { 'zh-CN': '草图线', en: 'Line' },
  },
  {
    id: 'sketch-rectangle',
    iconSrc: '/icons/sketch-rectangle.svg',
    labels: { 'zh-CN': '矩形', en: 'Rectangle' },
  },
  {
    id: 'sketch-circle',
    iconSrc: '/icons/sketch-circle.svg',
    labels: { 'zh-CN': '圆', en: 'Circle' },
  },
  {
    id: 'sketch-arc',
    iconSrc: '/icons/sketch-arc.svg',
    labels: { 'zh-CN': '圆弧', en: 'Arc' },
  },
  {
    id: 'sketch-construction-line',
    iconSrc: '/icons/sketch-construction-line.svg',
    labels: { 'zh-CN': '参考线', en: 'Construction' },
  },
  {
    id: 'smart-dimension',
    iconSrc: '/icons/smart-dimension.svg',
    labels: { 'zh-CN': '尺寸', en: 'Dimension' },
  },
]

const LINE_QUICK_ACTION_IDS = [
  'sketch-line-set-length',
  'sketch-line-horizontal',
  'sketch-line-vertical',
  'sketch-line-fixed',
  'sketch-line-construction',
] as const

const LINE_MULTI_CONSTRAINT_ACTION_IDS = [
  'sketch-line-equal-length',
  'sketch-line-parallel',
  'sketch-line-perpendicular',
  'sketch-line-collinear',
] as const

const LINE_EDIT_ACTION_IDS = [
  'sketch-line-trim-extend',
  'sketch-line-split',
  'sketch-line-offset',
  'sketch-line-tangent',
  'sketch-line-fillet',
  'sketch-line-chamfer',
  'sketch-line-mirror',
  'sketch-line-linear-pattern',
] as const

const CIRCLE_QUICK_ACTION_IDS = [
  'sketch-circle-set-radius',
  'sketch-circle-fixed',
  'sketch-circle-construction',
] as const

const CIRCLE_CONSTRAINT_ACTION_IDS = [
  'sketch-circle-concentric',
  'sketch-circle-equal-radius',
  'sketch-circle-tangent',
] as const

const CIRCLE_EDIT_ACTION_IDS = [
  'sketch-circle-trim-extend',
  'sketch-circle-offset',
  'sketch-circle-mirror',
  'sketch-circle-linear-pattern',
] as const

const LINE_PROFILE_GENERATE_ACTION_IDS = [
  'sketch-profile-extrude',
  'sketch-profile-revolve',
  'sketch-profile-cut',
  'sketch-profile-walls',
  'sketch-profile-slab',
  'sketch-profile-zone',
] as const

const LINE_GENERATE_ACTION_IDS = ['sketch-line-create-wall'] as const

const TOOLBAR_ACTION_LABELS: Record<string, ToolbarActionLabelOverride> = {
  'sketch-line-set-length': { 'zh-CN': '尺寸', en: 'Size' },
  'sketch-circle-set-radius': { 'zh-CN': '尺寸', en: 'Size' },
  'sketch-line-construction': { 'zh-CN': '参考', en: 'Const' },
  'sketch-circle-construction': { 'zh-CN': '参考', en: 'Const' },
  'sketch-line-trim-extend': { 'zh-CN': '修剪', en: 'Trim' },
  'sketch-circle-trim-extend': { 'zh-CN': '修剪', en: 'Trim' },
  'sketch-line-create-wall': { 'zh-CN': '墙体', en: 'Wall' },
  'sketch-profile-extrude': { 'zh-CN': '拉伸', en: 'Extrude' },
  'sketch-profile-revolve': { 'zh-CN': '旋转', en: 'Revolve' },
  'sketch-profile-cut': { 'zh-CN': '切割', en: 'Cut' },
  'sketch-profile-walls': { 'zh-CN': '墙体', en: 'Wall' },
  'sketch-profile-slab': { 'zh-CN': '楼板', en: 'Slab' },
  'sketch-profile-zone': { 'zh-CN': '区域', en: 'Zone' },
  'sketch-line-perpendicular': { 'zh-CN': '垂直', en: 'Perp' },
  'sketch-line-linear-pattern': { 'zh-CN': '阵列', en: 'Pattern' },
  'sketch-circle-linear-pattern': { 'zh-CN': '阵列', en: 'Pattern' },
}

function HeaderButton({
  children,
  disabled = false,
  onClick,
  primary = false,
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  primary?: boolean
}) {
  return (
    <button
      className={cn(
        'inline-flex h-8 shrink-0 items-center rounded-md px-3 font-medium text-xs transition-colors',
        primary
          ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        disabled &&
          'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function RibbonButton({
  active = false,
  disabled = false,
  icon,
  label,
  onClick,
  title,
}: {
  active?: boolean
  disabled?: boolean
  icon?: ReactNode
  label: string
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      className={cn(
        'flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-center transition-colors',
        active
          ? 'bg-primary/12 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        disabled &&
          'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
      )}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {icon ? <span className="flex h-4 w-4 items-center justify-center">{icon}</span> : null}
      <span className="max-w-full truncate text-[10px] leading-none">{label}</span>
    </button>
  )
}

function ToolRibbonButton({
  active,
  iconSrc,
  label,
  onClick,
}: {
  active: boolean
  iconSrc: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-center transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <img alt="" className="h-4 w-4 shrink-0 object-contain" src={iconSrc} />
      <span className="max-w-full truncate text-[10px] leading-none">{label}</span>
    </button>
  )
}

function resolveDraftCommitLabel(copy: CommandBarCopy, kind: SketchDraftKind) {
  switch (kind) {
    case 'rectangle':
      return copy.commitRectangle
    case 'circle':
      return copy.commitCircle
    case 'arc':
      return copy.commitArc
    case 'line':
    default:
      return copy.commitLine
  }
}

function getToolLabel(tool: SketchContextTool, language: 'zh-CN' | 'en') {
  return SKETCH_TOOL_BUTTONS.find((button) => button.id === tool)?.labels[language] ?? tool
}

function getDraftLabel(kind: SketchDraftKind, language: 'zh-CN' | 'en') {
  switch (kind) {
    case 'rectangle':
      return language === 'zh-CN' ? '矩形' : 'rectangle'
    case 'circle':
      return language === 'zh-CN' ? '圆' : 'circle'
    case 'arc':
      return language === 'zh-CN' ? '圆弧' : 'arc'
    case 'line':
      return language === 'zh-CN' ? '线段' : 'line'
    default:
      return null
  }
}

function resolveWorkbenchStatus({
  activeTool,
  circleSelectionCount,
  copy,
  draftKind,
  language,
  lineSelectionCount,
}: {
  activeTool: SketchContextTool | null
  circleSelectionCount: number
  copy: CommandBarCopy
  draftKind: SketchDraftKind
  language: 'zh-CN' | 'en'
  lineSelectionCount: number
}) {
  if (draftKind) {
    const draftLabel = getDraftLabel(draftKind, language)
    return draftLabel ? copy.draftStatus(draftLabel) : copy.readyStatus
  }

  if (lineSelectionCount > 0 && circleSelectionCount > 0) {
    return copy.mixedSelectionStatus(lineSelectionCount, circleSelectionCount)
  }

  if (lineSelectionCount > 0) {
    return copy.lineSelectionStatus(lineSelectionCount)
  }

  if (circleSelectionCount > 0) {
    return copy.circleSelectionStatus(circleSelectionCount)
  }

  if (activeTool) {
    return copy.activeToolStatus(getToolLabel(activeTool, language))
  }

  return copy.readyStatus
}

function pickActions(
  actionById: ReadonlyMap<string, NodeActionMenuExtraAction>,
  ids: readonly string[],
  language: 'zh-CN' | 'en',
) {
  return ids
    .map((id) => {
      const action = actionById.get(id)
      if (!action) {
        return null
      }

      const labelOverride = TOOLBAR_ACTION_LABELS[id]?.[language]
      return labelOverride ? { ...action, label: labelOverride } : action
    })
    .filter((action): action is NodeActionMenuExtraAction => Boolean(action))
}

function invokeAction(action: NodeActionMenuExtraAction) {
  action.onClick?.({
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  } as never)
}

function hasVisibleActions(actions: NodeActionMenuExtraAction[]) {
  return actions.some((action) => action.active || !action.disabled)
}

function OverflowRibbonButton({
  actions,
  copy,
}: {
  actions: NodeActionMenuExtraAction[]
  copy: CommandBarCopy
}) {
  const [open, setOpen] = useState(false)

  if (actions.length === 0) {
    return null
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <RibbonButton
          icon={<Icon height={16} icon="mdi:dots-horizontal" width={16} />}
          label={copy.moreActions}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5" side="bottom" sideOffset={8}>
        <div className="flex flex-col gap-1">
          {actions.map((action) => (
            <button
              className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                action.active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                action.disabled &&
                  'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
              )}
              disabled={action.disabled}
              key={action.id}
              onClick={() => {
                invokeAction(action)
                setOpen(false)
              }}
              type="button"
            >
              {action.icon ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {action.icon}
                </span>
              ) : null}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RibbonGroup({
  actions,
  copy,
  label,
  maxVisibleActions,
}: {
  actions: NodeActionMenuExtraAction[]
  copy: CommandBarCopy
  label: string
  maxVisibleActions?: number
}) {
  if (!hasVisibleActions(actions)) {
    return null
  }

  const visibleActions = actions.slice(0, maxVisibleActions ?? actions.length)
  const overflowActions = actions.slice(maxVisibleActions ?? actions.length)

  return (
    <div className="relative flex shrink-0 flex-col items-center gap-1.5 pr-3 last:pr-0 after:absolute after:top-1 after:right-0 after:bottom-4 after:w-px after:bg-border/60 last:after:hidden">
      <div className="flex items-start gap-1">
        {visibleActions.map((action) => (
          <RibbonButton
            active={action.active}
            disabled={action.disabled}
            icon={action.icon}
            key={action.id}
            label={action.label}
            onClick={action.onClick ? () => invokeAction(action) : undefined}
          />
        ))}
        <OverflowRibbonButton actions={overflowActions} copy={copy} />
      </div>
      <span className="text-[10px] text-muted-foreground leading-none">{label}</span>
    </div>
  )
}

export const FloorplanSketchCommandBar = memo(function FloorplanSketchCommandBar({
  activeTool,
  draftKind,
  canCommitDraft,
  sketchPlane,
  lineSelectionCount,
  circleSelectionCount,
  sketchLineActions,
  sketchCircleActions,
  onActivateTool,
  onCommitDraft,
  onCancelDraft,
  onExitSketch,
}: FloorplanSketchCommandBarProps) {
  const language = useEditorLanguage()
  const copy = COPY[language]
  const statusLabel = resolveWorkbenchStatus({
    activeTool,
    circleSelectionCount,
    copy,
    draftKind,
    language,
    lineSelectionCount,
  })

  const sketchLineActionById = useMemo(
    () => new Map(sketchLineActions.map((action) => [action.id, action] as const)),
    [sketchLineActions],
  )
  const sketchCircleActionById = useMemo(
    () => new Map(sketchCircleActions.map((action) => [action.id, action] as const)),
    [sketchCircleActions],
  )

  const showLineContext = lineSelectionCount > 0 && circleSelectionCount === 0
  const showCircleContext = circleSelectionCount > 0 && lineSelectionCount === 0

  const lineContextGroups = useMemo<ToolbarGroup[]>(() => {
    if (!showLineContext) {
      return []
    }

    const generateIds = sketchLineActionById.has('sketch-profile-walls')
      ? LINE_PROFILE_GENERATE_ACTION_IDS
      : LINE_GENERATE_ACTION_IDS

    return [
      {
        id: 'line-quick',
        label: copy.quickActions,
        actions: pickActions(sketchLineActionById, LINE_QUICK_ACTION_IDS, language),
      },
      {
        id: 'line-constraints',
        label: copy.constraints,
        actions:
          lineSelectionCount > 1
            ? pickActions(sketchLineActionById, LINE_MULTI_CONSTRAINT_ACTION_IDS, language)
            : [],
      },
      {
        id: 'line-edit',
        label: copy.edit,
        actions: pickActions(sketchLineActionById, LINE_EDIT_ACTION_IDS, language),
        maxVisibleActions: 4,
      },
      {
        id: 'line-generate',
        label: copy.generate,
        actions: pickActions(sketchLineActionById, generateIds, language),
      },
    ]
  }, [
    copy.constraints,
    copy.edit,
    copy.generate,
    copy.quickActions,
    language,
    lineSelectionCount,
    showLineContext,
    sketchLineActionById,
  ])

  const circleContextGroups = useMemo<ToolbarGroup[]>(() => {
    if (!showCircleContext) {
      return []
    }

    return [
      {
        id: 'circle-quick',
        label: copy.quickActions,
        actions: pickActions(sketchCircleActionById, CIRCLE_QUICK_ACTION_IDS, language),
      },
      {
        id: 'circle-constraints',
        label: copy.constraints,
        actions: pickActions(sketchCircleActionById, CIRCLE_CONSTRAINT_ACTION_IDS, language),
      },
      {
        id: 'circle-edit',
        label: copy.edit,
        actions: pickActions(sketchCircleActionById, CIRCLE_EDIT_ACTION_IDS, language),
        maxVisibleActions: 2,
      },
    ]
  }, [
    copy.constraints,
    copy.edit,
    copy.quickActions,
    language,
    showCircleContext,
    sketchCircleActionById,
  ])

  const activeContextGroups = showLineContext ? lineContextGroups : circleContextGroups

  return (
    <div className="pointer-events-none absolute top-4 right-4 left-4 z-30">
      <div className="pointer-events-auto md:ml-24 xl:ml-28">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-sidebar/94 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)] backdrop-blur-md">
          <div className="flex flex-col gap-2 border-border/60 border-b px-4 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex flex-wrap items-center gap-2 text-xs">
              <span className="shrink-0 font-semibold text-primary">{copy.title}</span>
              {activeTool ? (
                <>
                  <span className="text-border">/</span>
                  <span className="shrink-0 rounded bg-accent px-2 py-0.5 font-medium text-foreground text-[11px]">
                    {getToolLabel(activeTool, language)}
                  </span>
                </>
              ) : null}
              {sketchPlane?.kind === 'feature-top' ? (
                <>
                  <span className="text-border">/</span>
                  <span className="shrink-0 rounded border border-primary/20 bg-primary/10 px-2 py-0.5 font-medium text-[11px] text-primary">
                    {copy.topFacePlane(sketchPlane.elevation)}
                  </span>
                </>
              ) : null}
              <span className="text-border">/</span>
              <span className="min-w-0 truncate text-muted-foreground">{statusLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {draftKind ? (
                <>
                  <HeaderButton disabled={!canCommitDraft} onClick={onCommitDraft} primary>
                    {resolveDraftCommitLabel(copy, draftKind)}
                  </HeaderButton>
                  <HeaderButton onClick={onCancelDraft}>{copy.cancelDraft}</HeaderButton>
                  <HeaderButton onClick={onExitSketch}>{copy.exitSketch}</HeaderButton>
                </>
              ) : (
                <HeaderButton onClick={onExitSketch} primary>
                  {copy.completeSketch}
                </HeaderButton>
              )}
            </div>
          </div>

          <div className="border-border/60 border-t px-4 py-2">
            <div className="flex flex-wrap items-start gap-3">
              <div className="relative flex shrink-0 flex-col items-center gap-1.5 pr-3 after:absolute after:top-1 after:right-0 after:bottom-4 after:w-px after:bg-border/60">
                <div className="flex items-start gap-1">
                  {SKETCH_TOOL_BUTTONS.map((tool) => (
                    <ToolRibbonButton
                      active={activeTool === tool.id}
                      iconSrc={tool.iconSrc}
                      key={tool.id}
                      label={tool.labels[language]}
                      onClick={() => onActivateTool(tool.id)}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground leading-none">{copy.draw}</span>
              </div>

              {activeContextGroups.map((group) => (
                <RibbonGroup
                  actions={group.actions}
                  copy={copy}
                  key={group.id}
                  label={group.label}
                  maxVisibleActions={group.maxVisibleActions}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
