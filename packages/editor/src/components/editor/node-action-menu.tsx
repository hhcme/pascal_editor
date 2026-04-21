'use client'

import { Icon } from '@iconify/react'
import { Copy, Move, Spline, Trash2 } from 'lucide-react'
import type { MouseEventHandler, PointerEventHandler, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type NodeActionMenuExtraAction = {
  id: string
  label: string
  icon: ReactNode
  onClick: MouseEventHandler<HTMLButtonElement>
  active?: boolean
}

type NodeActionMenuProps = {
  onAddHole?: MouseEventHandler<HTMLButtonElement>
  onDelete?: MouseEventHandler<HTMLButtonElement>
  onDuplicate?: MouseEventHandler<HTMLButtonElement>
  onMove?: MouseEventHandler<HTMLButtonElement>
  onCurve?: MouseEventHandler<HTMLButtonElement>
  extraActions?: NodeActionMenuExtraAction[]
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerEnter?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
}

export function NodeActionMenu({
  onAddHole,
  onDelete,
  onDuplicate,
  onMove,
  onCurve,
  extraActions,
  onPointerDown,
  onPointerUp,
  onPointerEnter,
  onPointerLeave,
}: NodeActionMenuProps) {
  const buttonClass =
    'tooltip-trigger flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground'

  return (
    <div
      className="editor-floorplan-feedback pointer-events-auto flex items-center gap-1 rounded-lg p-1"
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
    >
      {onMove && (
        <button
          aria-label="Move"
          className={buttonClass}
          onClick={onMove}
          title="Move"
          type="button"
        >
          <Move className="h-4 w-4" />
        </button>
      )}
      {onCurve && (
        <button
          aria-label="Curve"
          className={buttonClass}
          onClick={onCurve}
          title="Curve"
          type="button"
        >
          <Spline className="h-4 w-4" />
        </button>
      )}
      {extraActions?.map((action) => (
        <button
          aria-label={action.label}
          className={cn(buttonClass, action.active && 'bg-primary/10 text-primary hover:bg-primary/15')}
          key={action.id}
          onClick={action.onClick}
          title={action.label}
          type="button"
        >
          {action.icon}
        </button>
      ))}
      {onDuplicate && (
        <button
          aria-label="Duplicate"
          className={buttonClass}
          onClick={onDuplicate}
          title="Duplicate"
          type="button"
        >
          <Copy className="h-4 w-4" />
        </button>
      )}
      {onAddHole && (
        <button
          aria-label="Cut Out"
          className={buttonClass}
          onClick={onAddHole}
          title="Cut Out"
          type="button"
        >
          <Icon height={16} icon="carbon:cut-out" width={16} />
        </button>
      )}
      {onDelete && (
        <button
          aria-label="Delete"
          className={cn(buttonClass, 'hover:bg-destructive/10 hover:text-destructive')}
          onClick={onDelete}
          title="Delete"
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
