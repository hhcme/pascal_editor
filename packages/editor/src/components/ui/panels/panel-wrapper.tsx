'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { ChevronLeft, RotateCcw, X } from 'lucide-react'
import Image from 'next/image'
import { cn } from '../../../lib/utils'

type PanelSurfaceMode = 'floating' | 'docked'

const PanelSurfaceModeContext = createContext<PanelSurfaceMode>('floating')

export function PanelSurfaceProvider({
  children,
  mode,
}: {
  children: ReactNode
  mode: PanelSurfaceMode
}) {
  return (
    <PanelSurfaceModeContext.Provider value={mode}>
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
  const panelSurfaceMode = useContext(PanelSurfaceModeContext)
  const isDocked = panelSurfaceMode === 'docked'

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
