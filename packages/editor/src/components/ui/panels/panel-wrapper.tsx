'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { ChevronLeft, Pin, PinOff, RotateCcw, X } from 'lucide-react'
import Image from 'next/image'
import { cn } from '../../../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip'

type PanelSurfaceMode = 'floating' | 'docked'

type PanelSurfaceContextValue = {
  mode: PanelSurfaceMode
  isPinned?: boolean
  onPinnedChange?: (pinned: boolean) => void
}

const PanelSurfaceModeContext = createContext<PanelSurfaceContextValue>({ mode: 'floating' })

export function PanelSurfaceProvider({
  children,
  isPinned,
  mode,
  onPinnedChange,
}: {
  children: ReactNode
  isPinned?: boolean
  mode: PanelSurfaceMode
  onPinnedChange?: (pinned: boolean) => void
}) {
  return (
    <PanelSurfaceModeContext.Provider value={{ mode, isPinned, onPinnedChange }}>
      {children}
    </PanelSurfaceModeContext.Provider>
  )
}

interface PanelWrapperProps {
  title: string
  icon?: string
  onClose?: () => void
  onReset?: () => void
  onBack?: () => void
  children: ReactNode
  className?: string
  width?: number | string
}

export function PanelWrapper({
  title,
  icon,
  onClose,
  onReset,
  onBack,
  children,
  className,
  width = 340,
}: PanelWrapperProps) {
  const { mode: panelSurfaceMode, isPinned = false, onPinnedChange } =
    useContext(PanelSurfaceModeContext)
  const isDocked = panelSurfaceMode === 'docked'
  const canPinPanel = isDocked && onPinnedChange
  const pinLabel = isPinned ? 'Unpin inspector' : 'Pin inspector'

  return (
    <div
      className={cn(
        isDocked
          ? 'editor-docked-panel pointer-events-auto relative flex h-full min-h-0 w-full flex-col overflow-hidden dark:text-foreground'
          : 'editor-floating-panel pointer-events-auto fixed top-[68px] right-4 z-50 flex max-h-[calc(100dvh-92px)] max-w-[calc(100dvw-32px)] flex-col overflow-hidden rounded-lg bg-sidebar/95 dark:text-foreground',
        className,
      )}
      style={isDocked ? undefined : { width }}
    >
      {/* Header */}
      <div className="editor-panel-header flex min-h-11 items-center justify-between border-border/50 border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onBack}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {icon && (
            <Image alt="" className="shrink-0 object-contain" height={16} src={icon} width={16} />
          )}
          <h2 className="truncate font-semibold text-foreground text-sm">{title}</h2>
        </div>

        <div className="flex items-center gap-1">
          {canPinPanel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={pinLabel}
                  aria-pressed={isPinned}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    isPinned && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                  )}
                  onClick={() => onPinnedChange?.(!isPinned)}
                  type="button"
                >
                  {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{pinLabel}</TooltipContent>
            </Tooltip>
          )}
          {onReset && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onReset}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {onClose && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="subtle-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
