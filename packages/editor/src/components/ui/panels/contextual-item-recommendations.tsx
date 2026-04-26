'use client'

import type { AssetInput } from '@pascal-app/core'
import { resolveCdnUrl } from '@pascal-app/viewer'
import Image from 'next/image'
import { Sparkles } from 'lucide-react'
import useEditor, { type CatalogCategory } from '../../../store/use-editor'
import { cn } from '../../../lib/utils'
import { getCatalogItemById } from '../item-catalog/catalog-items'

export type ContextualItemRecommendation = {
  itemId: string
  category: CatalogCategory
  description: string
}

function getPlacementLabel(item: AssetInput): string {
  if (item.attachTo === 'wall' || item.attachTo === 'wall-side') return 'Wall'
  if (item.attachTo === 'ceiling') return 'Ceiling'
  if (item.attachTo === 'countertop') return 'Countertop'
  return 'Floor'
}

export function ContextualItemRecommendations({
  description,
  recommendations,
}: {
  description: string
  recommendations: ContextualItemRecommendation[]
}) {
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const selectedItem = useEditor((state) => state.selectedItem)
  const setPhase = useEditor((state) => state.setPhase)
  const setMode = useEditor((state) => state.setMode)
  const setTool = useEditor((state) => state.setTool)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)
  const setSelectedItem = useEditor((state) => state.setSelectedItem)

  const resolvedRecommendations = recommendations
    .map((entry) => {
      const item = getCatalogItemById(entry.itemId)
      if (!item) return null
      return { ...entry, item }
    })
    .filter((entry): entry is ContextualItemRecommendation & { item: AssetInput } => entry !== null)

  return (
    <div className="space-y-3 px-1 pb-1">
      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        {description}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {resolvedRecommendations.map(({ category, description: itemDescription, item }) => {
          const isActive =
            phase === 'furnish' &&
            mode === 'build' &&
            tool === 'item' &&
            catalogCategory === category &&
            selectedItem?.id === item.id

          return (
            <button
              className={cn(
                'flex min-h-[168px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-colors hover:bg-accent/40',
                isActive && 'border-primary/50 bg-primary/5 ring-1 ring-primary/20',
              )}
              key={item.id}
              onClick={() => {
                setPhase('furnish')
                setMode('build')
                setTool('item')
                setCatalogCategory(category)
                setSelectedItem(item)
              }}
              type="button"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
                <Image
                  alt={item.name}
                  className="object-cover"
                  fill
                  sizes="(max-width: 768px) 50vw, 180px"
                  src={resolveCdnUrl(item.thumbnail) || ''}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="line-clamp-1 font-medium text-sm text-foreground">{item.name}</div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {getPlacementLabel(item)}
                  </span>
                </div>
                <div className="line-clamp-2 text-[11px] text-muted-foreground">
                  {itemDescription}
                </div>
                <div className="mt-auto flex items-center gap-1.5 text-[11px] text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {isActive ? 'Ready to place' : 'Use this pairing'}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
