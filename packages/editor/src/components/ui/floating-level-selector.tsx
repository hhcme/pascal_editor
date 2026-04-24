'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  LevelNode,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Eye, EyeOff, Layers, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { deleteLevelWithFallbackSelection } from '../../lib/level-selection'
import { cn } from '../../lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './primitives/dialog'
import { Popover, PopoverContent, PopoverTrigger } from './primitives/popover'

function getLevelDisplayLabel(level: LevelNode) {
  return level.name || `Level ${level.level}`
}

// ── Inline rename input for a level row ─────────────────────────────────────

function LevelInlineRename({
  level,
  isEditing,
  onStopEditing,
}: {
  level: LevelNode
  isEditing: boolean
  onStopEditing: () => void
}) {
  const updateNode = useScene((s) => s.updateNode)
  const defaultName = `Level ${level.level}`
  const [value, setValue] = useState(level.name || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      setValue(level.name || '')
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [isEditing, level.name])

  const handleSave = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed !== level.name) {
      updateNode(level.id, { name: trimmed || undefined })
    }
    onStopEditing()
  }, [value, level.id, level.name, updateNode, onStopEditing])

  if (!isEditing) return null

  return (
    <input
      className="m-0 h-full w-full min-w-0 rounded-md bg-transparent px-2.5 py-1.5 font-medium text-foreground text-xs outline-none ring-1 ring-primary/50"
      onBlur={handleSave}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleSave()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onStopEditing()
        }
      }}
      placeholder={defaultName}
      ref={inputRef}
      type="text"
      value={value}
    />
  )
}

// ── Level row with three-dot menu ───────────────────────────────────────────

function LevelRow({
  level,
  isSelected,
  isVisible,
  hasHiddenLevels,
  onSelect,
  onShowAll,
  onShowOnly,
  onRequestDelete,
  onToggleVisibility,
}: {
  level: LevelNode
  isSelected: boolean
  isVisible: boolean
  hasHiddenLevels: boolean
  onSelect: () => void
  onShowAll: () => void
  onShowOnly: () => void
  onRequestDelete: () => void
  onToggleVisibility: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const visibilityLabel = isVisible ? 'Hide level' : 'Show level'

  const handleMenuAction = useCallback((action: () => void) => {
    action()
    setIsMenuOpen(false)
  }, [])

  return (
    <div className="group/level">
      {isEditing ? (
        <LevelInlineRename
          isEditing={isEditing}
          level={level}
          onStopEditing={() => setIsEditing(false)}
        />
      ) : (
        <div
          className={cn(
            'flex items-center rounded-md transition-colors',
            !isVisible && 'opacity-60',
            isSelected
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground/70 hover:bg-accent hover:text-foreground',
          )}
        >
          <button
            className="flex min-w-0 flex-1 items-center justify-start px-2.5 py-1.5 font-medium text-xs"
            onClick={onSelect}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
            title={getLevelDisplayLabel(level)}
            type="button"
          >
            <span className="truncate">{getLevelDisplayLabel(level)}</span>
          </button>

          <button
            aria-label={visibilityLabel}
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground/40 transition-colors hover:text-foreground',
              !isVisible && 'text-muted-foreground opacity-100',
            )}
            onClick={(e) => {
              e.stopPropagation()
              onToggleVisibility()
            }}
            title={visibilityLabel}
            type="button"
          >
            {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>

          {/* Vertical three-dot menu — inside the pill */}
          <Popover onOpenChange={setIsMenuOpen} open={isMenuOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground/40 opacity-0 transition-all hover:text-foreground group-hover/level:opacity-100"
                onClick={(e) => e.stopPropagation()}
                title="Level actions"
                type="button"
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-36 p-1" side="right" sideOffset={8}>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMenuAction(onToggleVisibility)
                }}
                type="button"
              >
                {isVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {visibilityLabel}
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMenuAction(onShowOnly)
                }}
                type="button"
              >
                <Eye className="h-3 w-3" />
                Hide other levels
              </button>
              {hasHiddenLevels && (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction(onShowAll)
                  }}
                  type="button"
                >
                  <Layers className="h-3 w-3" />
                  Show all levels
                </button>
              )}
              <div className="my-1 h-px bg-border/70" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMenuAction(onRequestDelete)
                }}
                type="button"
              >
                <Trash2 className="h-3 w-3" />
                Delete level
              </button>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function FloatingLevelSelector() {
  const selectedBuildingId = useViewer((s) => s.selection.buildingId)
  const levelId = useViewer((s) => s.selection.levelId)
  const setSelection = useViewer((s) => s.setSelection)
  const createNode = useScene((s) => s.createNode)
  const updateNode = useScene((s) => s.updateNode)
  const updateNodes = useScene((s) => s.updateNodes)

  const [deletingLevel, setDeletingLevel] = useState<LevelNode | null>(null)

  const resolvedBuildingId = useScene((state) => {
    if (selectedBuildingId) return selectedBuildingId
    const first = Object.values(state.nodes).find((n) => n?.type === 'building') as
      | BuildingNode
      | undefined
    return first?.id ?? null
  })

  const levels = useScene(
    useShallow((state) => {
      if (!resolvedBuildingId) return [] as LevelNode[]
      const building = state.nodes[resolvedBuildingId]
      if (!building || building.type !== 'building') return [] as LevelNode[]
      return (building as BuildingNode).children
        .map((id) => state.nodes[id])
        .filter((node): node is LevelNode => node?.type === 'level')
        .sort((a, b) => a.level - b.level)
    }),
  )

  const handleAddAbove = useCallback(() => {
    if (!resolvedBuildingId) return
    const maxLevel = levels.length > 0 ? Math.max(...levels.map((l) => l.level)) : -1
    const newLevel = LevelNode.parse({
      level: maxLevel + 1,
      children: [],
      parentId: resolvedBuildingId,
    })
    createNode(newLevel, resolvedBuildingId)
    setSelection({ buildingId: resolvedBuildingId, levelId: newLevel.id })
  }, [resolvedBuildingId, levels, createNode, setSelection])

  const handleAddBelow = useCallback(() => {
    if (!resolvedBuildingId) return
    const minLevel = levels.length > 0 ? Math.min(...levels.map((l) => l.level)) : 1
    const newLevel = LevelNode.parse({
      level: minLevel - 1,
      children: [],
      parentId: resolvedBuildingId,
    })
    createNode(newLevel, resolvedBuildingId)
    setSelection({ buildingId: resolvedBuildingId, levelId: newLevel.id })
  }, [resolvedBuildingId, levels, createNode, setSelection])

  const handleInsertBetween = useCallback(
    (lowerIndex: number) => {
      if (!resolvedBuildingId) return
      const lower = levels[lowerIndex]
      if (!lower) return

      const newLevelNumber = lower.level + 1
      const toShift = levels.filter((l) => l.level >= newLevelNumber)
      if (toShift.length > 0) {
        updateNodes(
          toShift.map((l) => ({
            id: l.id as AnyNodeId,
            data: { level: l.level + 1 } as Partial<AnyNode>,
          })),
        )
      }

      const newLevel = LevelNode.parse({
        level: newLevelNumber,
        children: [],
        parentId: resolvedBuildingId,
      })
      createNode(newLevel, resolvedBuildingId)
      setSelection({ buildingId: resolvedBuildingId, levelId: newLevel.id })
    },
    [resolvedBuildingId, levels, createNode, updateNodes, setSelection],
  )

  const handleConfirmDelete = useCallback(() => {
    if (!deletingLevel) return
    deleteLevelWithFallbackSelection(deletingLevel.id)
    setDeletingLevel(null)
  }, [deletingLevel])

  const handleToggleVisibility = useCallback(
    (level: LevelNode) => {
      updateNode(level.id, { visible: level.visible === false })
    },
    [updateNode],
  )

  const handleShowOnly = useCallback(
    (level: LevelNode) => {
      updateNodes(
        levels.map((entry) => ({
          id: entry.id as AnyNodeId,
          data: { visible: entry.id === level.id } as Partial<AnyNode>,
        })),
      )
      setSelection(
        resolvedBuildingId
          ? { buildingId: resolvedBuildingId, levelId: level.id }
          : { levelId: level.id },
      )
    },
    [levels, resolvedBuildingId, setSelection, updateNodes],
  )

  const handleShowAll = useCallback(() => {
    updateNodes(
      levels
        .filter((level) => level.visible === false)
        .map((level) => ({
          id: level.id as AnyNodeId,
          data: { visible: true } as Partial<AnyNode>,
        })),
    )
  }, [levels, updateNodes])

  if (levels.length === 0) return null

  const reversedLevels = [...levels].reverse()
  const hasHiddenLevels = levels.some((level) => level.visible === false)

  const addButtonClass =
    'absolute left-1/2 z-10 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground/60 shadow-md transition-colors hover:bg-accent hover:text-foreground'

  return (
    <>
      <div className="pointer-events-auto absolute top-14 left-3 z-20">
        <div className="relative">
          {/* Floating + at top edge */}
          <button
            className={cn(addButtonClass, 'top-0 -translate-y-1/2')}
            onClick={handleAddAbove}
            title="Add level above"
            type="button"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>

          {/* Floating + at bottom edge */}
          <button
            className={cn(addButtonClass, 'bottom-0 translate-y-1/2')}
            onClick={handleAddBelow}
            title="Add level below"
            type="button"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>

          {/* Level list */}
          <div className="editor-floating-panel flex flex-col gap-0.5 rounded-lg p-1">
            {reversedLevels.map((level, i) => {
              const isSelected = level.id === levelId
              const sortedIndex = levels.indexOf(level)
              const showGapBelow = i < reversedLevels.length - 1

              return (
                <div className="relative" key={level.id}>
                  <LevelRow
                    hasHiddenLevels={hasHiddenLevels}
                    isSelected={isSelected}
                    isVisible={level.visible !== false}
                    level={level}
                    onShowAll={handleShowAll}
                    onShowOnly={() => handleShowOnly(level)}
                    onRequestDelete={() => setDeletingLevel(level)}
                    onSelect={() =>
                      setSelection(
                        resolvedBuildingId
                          ? { buildingId: resolvedBuildingId, levelId: level.id }
                          : { levelId: level.id },
                      )
                    }
                    onToggleVisibility={() => handleToggleVisibility(level)}
                  />

                  {showGapBelow && (
                    <button
                      className={cn(addButtonClass, 'bottom-0 translate-y-1/2')}
                      onClick={() => handleInsertBetween(sortedIndex - 1)}
                      title="Insert level here"
                      type="button"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog onOpenChange={(open) => !open && setDeletingLevel(null)} open={!!deletingLevel}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete level</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deletingLevel ? getLevelDisplayLabel(deletingLevel) : ''}</strong>? All
              walls, floors, and objects on this level will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
              onClick={() => setDeletingLevel(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700"
              onClick={handleConfirmDelete}
              type="button"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
