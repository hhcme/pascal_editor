'use client'

import { Unlink2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

type SketchControlListItem = {
  id: string
  label: string
  detail?: string
}

export function SketchControlList<T extends SketchControlListItem>({
  emptyLabel,
  items,
  onRemoveItem,
}: {
  emptyLabel: string
  items: readonly T[]
  onRemoveItem: (item: T) => void
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/55">
      {items.map((item, index) => (
        <div
          className={cn(
            'flex items-start justify-between gap-3 bg-card/55 px-3 py-2.5',
            index > 0 && 'border-border/45 border-t',
          )}
          key={item.id}
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[12px] text-foreground">{item.label}</div>
            {item.detail && <div className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</div>}
          </div>
          <button
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/55 bg-background px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground"
            onClick={() => onRemoveItem(item)}
            type="button"
          >
            <Unlink2 className="h-3.5 w-3.5" />
            <span>移除</span>
          </button>
        </div>
      ))}
    </div>
  )
}
