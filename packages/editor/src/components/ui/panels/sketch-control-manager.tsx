'use client'

import { Filter, ListX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { SketchControlItemCategory } from '../../tools/sketch/sketch-control-items'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { SketchControlList } from './sketch-control-list'

const CATEGORY_ORDER: SketchControlItemCategory[] = [
  'relation',
  'dimension',
  'constraint',
  'connection',
]

const CATEGORY_LABELS: Record<SketchControlItemCategory, string> = {
  relation: '关系',
  dimension: '尺寸',
  constraint: '约束',
  connection: '连接',
}

type SketchControlManagerItem = {
  id: string
  label: string
  detail?: string
}

type SketchControlFilter = 'all' | SketchControlItemCategory

export function SketchControlManager<T extends SketchControlManagerItem>({
  emptyLabel,
  getCategory,
  items,
  onRemoveItem,
  onRemoveItems,
}: {
  emptyLabel: string
  getCategory: (item: T) => SketchControlItemCategory
  items: readonly T[]
  onRemoveItem: (item: T) => void
  onRemoveItems: (items: T[]) => void
}) {
  const [filter, setFilter] = useState<SketchControlFilter>('all')

  const countsByCategory = useMemo(() => {
    const counts = new Map<SketchControlItemCategory, number>()
    for (const item of items) {
      const category = getCategory(item)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return counts
  }, [getCategory, items])

  const availableCategories = useMemo(
    () => CATEGORY_ORDER.filter((category) => (countsByCategory.get(category) ?? 0) > 0),
    [countsByCategory],
  )

  useEffect(() => {
    if (filter !== 'all' && !availableCategories.includes(filter)) {
      setFilter('all')
    }
  }, [availableCategories, filter])

  const visibleItems = useMemo(
    () => items.filter((item) => filter === 'all' || getCategory(item) === filter),
    [filter, getCategory, items],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            <span>控制项筛选</span>
          </span>
          <span className="font-medium text-foreground">{`${visibleItems.length}/${items.length}`}</span>
        </div>
        {availableCategories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] transition-colors ${
                filter === 'all'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/55 bg-background text-muted-foreground hover:bg-accent/55 hover:text-foreground'
              }`}
              onClick={() => setFilter('all')}
              type="button"
            >
              {`全部 ${items.length}`}
            </button>
            {availableCategories.map((category) => (
              <button
                className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] transition-colors ${
                  filter === category
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/55 bg-background text-muted-foreground hover:bg-accent/55 hover:text-foreground'
                }`}
                key={category}
                onClick={() => setFilter(category)}
                type="button"
              >
                {`${CATEGORY_LABELS[category]} ${countsByCategory.get(category) ?? 0}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <ActionGroup>
          <ActionButton
            icon={<ListX className="h-3.5 w-3.5" />}
            label={filter === 'all' ? '移除全部控制项' : '移除当前筛选'}
            onClick={() => onRemoveItems([...visibleItems])}
            tone="danger"
          />
        </ActionGroup>
      )}

      <SketchControlList
        emptyLabel={items.length === 0 ? emptyLabel : '当前筛选下没有控制项。'}
        items={visibleItems}
        onRemoveItem={onRemoveItem}
      />
    </div>
  )
}
