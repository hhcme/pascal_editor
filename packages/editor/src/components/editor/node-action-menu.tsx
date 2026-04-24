'use client'

import { Eye, EyeOff, Layers, Redo2, Undo2 } from 'lucide-react'
import type { MouseEventHandler, PointerEventHandler, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type NodeActionMenuExtraAction = {
  id: string
  label: string
  icon: ReactNode
  onClick?: MouseEventHandler<HTMLButtonElement>
  active?: boolean
  disabled?: boolean
  disabledReason?: string
}

type NodeActionMenuProps = {
  onAddHole?: MouseEventHandler<HTMLButtonElement>
  onDelete?: MouseEventHandler<HTMLButtonElement>
  onDuplicate?: MouseEventHandler<HTMLButtonElement>
  onHide?: MouseEventHandler<HTMLButtonElement>
  onMove?: MouseEventHandler<HTMLButtonElement>
  onCurve?: MouseEventHandler<HTMLButtonElement>
  onRedo?: MouseEventHandler<HTMLButtonElement>
  onShowAll?: MouseEventHandler<HTMLButtonElement>
  onToggleTransparency?: MouseEventHandler<HTMLButtonElement>
  onUndo?: MouseEventHandler<HTMLButtonElement>
  canRedo?: boolean
  canShowAll?: boolean
  canUndo?: boolean
  isTransparent?: boolean
  extraActions?: NodeActionMenuExtraAction[]
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerEnter?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
}

function MenuIcon({ src, alt }: { src: string; alt: string }) {
  return <img alt={alt} className="h-4 w-4 shrink-0 object-contain" src={src} />
}

function ActionMenuButton({
  active,
  children,
  disabled,
  icon,
  label,
  onClick,
  title,
  variant = 'default',
}: {
  active?: boolean
  children?: ReactNode
  disabled?: boolean
  icon: ReactNode
  label: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  title?: string
  variant?: 'default' | 'destructive'
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        'tooltip-trigger flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-muted-foreground transition-colors',
        'hover:bg-accent/55 hover:text-foreground',
        active && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
        disabled &&
          'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
        variant === 'destructive' && 'hover:bg-destructive/10 hover:text-destructive',
      )}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-sm">{children ?? label}</span>
    </button>
  )
}

export function NodeActionMenu({
  onAddHole,
  onDelete,
  onDuplicate,
  onHide,
  onMove,
  onCurve,
  onRedo,
  onShowAll,
  onToggleTransparency,
  onUndo,
  canRedo = false,
  canShowAll = false,
  canUndo = false,
  isTransparent = false,
  extraActions,
  onPointerDown,
  onPointerUp,
  onPointerEnter,
  onPointerLeave,
}: NodeActionMenuProps) {
  return (
    <div
      className="editor-floorplan-feedback pointer-events-auto flex min-w-40 max-w-52 flex-col gap-0.5 rounded-md p-1"
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
    >
      {(onUndo || onRedo) && (
        <>
          {onUndo && (
            <ActionMenuButton
              disabled={!canUndo}
              icon={<Undo2 className="h-4 w-4" />}
              label="Undo"
              onClick={onUndo}
              title={canUndo ? 'Undo' : 'Nothing to undo'}
            >
              Undo
            </ActionMenuButton>
          )}
          {onRedo && (
            <ActionMenuButton
              disabled={!canRedo}
              icon={<Redo2 className="h-4 w-4" />}
              label="Redo"
              onClick={onRedo}
              title={canRedo ? 'Redo' : 'Nothing to redo'}
            >
              Redo
            </ActionMenuButton>
          )}
          <div className="my-1 h-px bg-border/70" />
        </>
      )}
      {onMove && (
        <ActionMenuButton
          icon={<MenuIcon alt="" src="/icons/action-move.svg" />}
          label="Move"
          onClick={onMove}
        >
          Move
        </ActionMenuButton>
      )}
      {onHide && (
        <ActionMenuButton icon={<EyeOff className="h-4 w-4" />} label="Hide" onClick={onHide}>
          Hide
        </ActionMenuButton>
      )}
      {onShowAll && (
        <ActionMenuButton
          disabled={!canShowAll}
          icon={<Eye className="h-4 w-4" />}
          label="Show all"
          onClick={onShowAll}
          title={canShowAll ? 'Show all hidden nodes' : 'Nothing hidden'}
        >
          Show all
        </ActionMenuButton>
      )}
      {onToggleTransparency && (
        <ActionMenuButton
          active={isTransparent}
          icon={<Layers className="h-4 w-4" />}
          label={isTransparent ? 'Opaque' : 'Transparent'}
          onClick={onToggleTransparency}
        >
          {isTransparent ? 'Opaque' : 'Transparent'}
        </ActionMenuButton>
      )}
      {onCurve && (
        <ActionMenuButton
          icon={<MenuIcon alt="" src="/icons/action-curve.svg" />}
          label="Curve"
          onClick={onCurve}
        >
          Curve
        </ActionMenuButton>
      )}
      {extraActions?.map((action) => (
        <ActionMenuButton
          active={action.active}
          disabled={action.disabled}
          icon={action.icon}
          key={action.id}
          label={action.label}
          onClick={action.onClick}
          title={action.disabled ? (action.disabledReason ?? action.label) : action.label}
        >
          {action.label}
        </ActionMenuButton>
      ))}
      {onDuplicate && (
        <ActionMenuButton
          icon={<MenuIcon alt="" src="/icons/action-duplicate.svg" />}
          label="Duplicate"
          onClick={onDuplicate}
        >
          Duplicate
        </ActionMenuButton>
      )}
      {onAddHole && (
        <ActionMenuButton
          icon={<MenuIcon alt="" src="/icons/action-cut-out.svg" />}
          label="Cut Out"
          onClick={onAddHole}
        >
          Cut Out
        </ActionMenuButton>
      )}
      {onDelete && (
        <ActionMenuButton
          icon={<MenuIcon alt="" src="/icons/delete.svg" />}
          label="Delete"
          onClick={onDelete}
          variant="destructive"
        >
          Delete
        </ActionMenuButton>
      )}
    </div>
  )
}
