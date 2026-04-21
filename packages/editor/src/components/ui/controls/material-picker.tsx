'use client'

import {
  getMaterialsForTarget,
  toLibraryMaterialRef,
  type MaterialSchema,
  type MaterialTarget,
} from '@pascal-app/core'
import { useEffect, useState } from 'react'
import { cn } from '../../../lib/utils'

type MaterialPickerProps = {
  nodeType?: MaterialTarget
  value?: MaterialSchema
  selectedMaterialPreset?: string
  onChange?: (material: MaterialSchema) => void
  onSelectMaterialPreset?: (materialPreset: string) => void
  hideSideControl?: boolean
  disabled?: boolean
}

export function MaterialPicker({
  nodeType,
  value,
  selectedMaterialPreset,
  onChange,
  onSelectMaterialPreset,
  hideSideControl = false,
  disabled = false,
}: MaterialPickerProps) {
  const [showCustom, setShowCustom] = useState<boolean>(!!value?.properties)
  const catalogItems = nodeType ? getMaterialsForTarget(nodeType) : []

  useEffect(() => {
    setShowCustom(!!value?.properties && !selectedMaterialPreset)
  }, [selectedMaterialPreset, value?.properties])

  const currentProps = value?.properties || {
    color: '#ffffff',
    roughness: 0.5,
    metalness: 0,
    opacity: 1,
    transparent: false,
    side: 'front' as const,
  }
  const selectedCatalogId =
    selectedMaterialPreset ?? (value?.id ? toLibraryMaterialRef(value.id) : undefined)

  const handleCatalogSelect = (materialId: string) => {
    if (disabled) return
    setShowCustom(false)
    onSelectMaterialPreset?.(toLibraryMaterialRef(materialId))
  }

  const handleCustomOpen = () => {
    if (disabled) return
    setShowCustom(true)
    onChange?.({
      preset: 'custom',
      properties: {
        color: value?.properties?.color || '#ffffff',
        roughness: value?.properties?.roughness ?? 0.5,
        metalness: value?.properties?.metalness ?? 0,
        opacity: value?.properties?.opacity ?? 1,
        transparent: value?.properties?.transparent ?? false,
        side: value?.properties?.side ?? 'front',
      },
    })
  }

  const handlePropertyChange = (
    prop: keyof typeof currentProps,
    val: (typeof currentProps)[keyof typeof currentProps],
  ) => {
    if (disabled) return
    onChange?.({
      preset: 'custom',
      properties: {
        ...currentProps,
        [prop]: val,
      },
    })
  }

  return (
    <div className={cn('space-y-3', disabled && 'pointer-events-none opacity-50')}>
      {(catalogItems.length > 0 || onChange) && (
        <div className="space-y-2">
          {catalogItems.length > 0 ? (
            <div className="font-semibold text-[11px] text-muted-foreground">Library</div>
          ) : null}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2">
            {catalogItems.map((item) => (
              <button
                aria-pressed={selectedCatalogId === toLibraryMaterialRef(item.id)}
                className={cn(
                  'h-12 min-w-12 overflow-hidden rounded-md border bg-card transition-all',
                  'hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  selectedCatalogId === toLibraryMaterialRef(item.id)
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border/70',
                )}
                key={item.id}
                onClick={() => handleCatalogSelect(item.id)}
                title={item.label}
                type="button"
              >
                {item.previewThumbnailUrl ? (
                  <img
                    alt={item.label}
                    className="h-full w-full object-cover"
                    src={item.previewThumbnailUrl}
                  />
                ) : item.previewColor ? (
                  <div className="h-full w-full" style={{ backgroundColor: item.previewColor }} />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </button>
            ))}
            {onChange ? (
              <button
                aria-pressed={showCustom}
                className={cn(
                  'flex h-12 min-w-12 items-center justify-center rounded-md border px-1 text-[11px] font-semibold transition-all',
                  'hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  showCustom
                    ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                    : 'border-border/70 bg-card text-muted-foreground',
                )}
                onClick={handleCustomOpen}
                title="Custom"
                type="button"
              >
                Custom
              </button>
            ) : null}
          </div>
        </div>
      )}

      {showCustom && onChange && (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
          <div className="flex items-center gap-2">
            <label className="w-16 text-muted-foreground text-xs">Color</label>
            <input
              className="h-7 w-12 cursor-pointer rounded-md border border-border bg-background p-0.5"
              onChange={(e) => handlePropertyChange('color', e.target.value)}
              type="color"
              value={currentProps.color}
            />
            <input
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-foreground text-xs outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/25"
              onChange={(e) => handlePropertyChange('color', e.target.value)}
              type="text"
              value={currentProps.color}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="w-16 text-muted-foreground text-xs">Roughness</label>
            <input
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
              max={1}
              min={0}
              onChange={(e) => handlePropertyChange('roughness', Number.parseFloat(e.target.value))}
              step={0.01}
              type="range"
              value={currentProps.roughness}
            />
            <span className="w-9 text-right font-mono text-muted-foreground text-xs tabular-nums">
              {currentProps.roughness.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="w-16 text-muted-foreground text-xs">Metalness</label>
            <input
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
              max={1}
              min={0}
              onChange={(e) => handlePropertyChange('metalness', Number.parseFloat(e.target.value))}
              step={0.01}
              type="range"
              value={currentProps.metalness}
            />
            <span className="w-9 text-right font-mono text-muted-foreground text-xs tabular-nums">
              {currentProps.metalness.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="w-16 text-muted-foreground text-xs">Opacity</label>
            <input
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
              max={1}
              min={0}
              onChange={(e) => {
                const opacity = Number.parseFloat(e.target.value)
                handlePropertyChange('opacity', opacity)
                if (opacity < 1 && !currentProps.transparent) {
                  handlePropertyChange('transparent', true)
                }
              }}
              step={0.01}
              type="range"
              value={currentProps.opacity}
            />
            <span className="w-9 text-right font-mono text-muted-foreground text-xs tabular-nums">
              {currentProps.opacity.toFixed(2)}
            </span>
          </div>

          {!hideSideControl && (
            <div className="flex items-center gap-2">
              <label className="w-16 text-muted-foreground text-xs">Side</label>
              <select
                className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-foreground text-xs outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/25"
                onChange={(e) =>
                  handlePropertyChange('side', e.target.value as 'front' | 'back' | 'double')
                }
                value={currentProps.side}
              >
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="double">Double</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
