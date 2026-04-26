'use client'

import type { AssetInput } from '@pascal-app/core'
import { resolveCdnUrl } from '@pascal-app/viewer'
import { ImageIcon, Search, Sparkles, Wand2 } from 'lucide-react'
import NextImage from 'next/image'
import { type ReactNode, useMemo, useState } from 'react'
import { Button } from '../../../primitives/button'
import { Input } from '../../../primitives/input'
import { cn } from '../../../../../lib/utils'
import useEditor, { type CatalogCategory } from '../../../../../store/use-editor'
import { CATALOG_ITEMS } from '../../../item-catalog/catalog-items'

export type FurnishPanelAiTab = 'create' | 'model' | 'render'

export type FurnishPanelProps = {
  language?: 'zh-CN' | 'en'
  onOpenAiWorkspace?: (tab: FurnishPanelAiTab) => void
}

type FurnishSidebarCategory = Exclude<CatalogCategory, 'window' | 'door'>

type CategoryMeta = {
  aliases: string[]
  iconSrc: string
  labels: {
    en: string
    zh: string
  }
}

const CATEGORY_ORDER: FurnishSidebarCategory[] = [
  'furniture',
  'kitchen',
  'bathroom',
  'lighting',
  'plants',
  'people',
  'animals',
  'appliance',
  'outdoor',
]

const CATEGORY_META: Record<FurnishSidebarCategory, CategoryMeta> = {
  furniture: {
    aliases: ['sofa', 'chair', 'table', 'bed', 'cabinet', 'desk', '沙发', '椅子', '桌子', '床'],
    iconSrc: '/icons/couch.png',
    labels: { zh: '家具', en: 'Furniture' },
  },
  people: {
    aliases: ['human', 'character', 'person', '人物', '人'],
    iconSrc: '/icons/people.svg',
    labels: { zh: '人物', en: 'People' },
  },
  plants: {
    aliases: ['greenery', 'tree', 'flower', '植物', '绿植', '树'],
    iconSrc: '/icons/plants.svg',
    labels: { zh: '植物', en: 'Plants' },
  },
  animals: {
    aliases: ['pet', 'animal', 'cat', 'dog', '宠物', '动物', '猫', '狗'],
    iconSrc: '/icons/animal.svg',
    labels: { zh: '动物', en: 'Animals' },
  },
  lighting: {
    aliases: ['light', 'lamp', 'ceiling light', '灯', '灯具', '照明'],
    iconSrc: '/icons/environment.png',
    labels: { zh: '灯光', en: 'Lighting' },
  },
  appliance: {
    aliases: ['device', 'home appliance', 'electrical', '家电', '电器'],
    iconSrc: '/icons/appliance.png',
    labels: { zh: '家电', en: 'Appliance' },
  },
  kitchen: {
    aliases: ['cook', 'kitchenware', 'counter', '厨房', '厨具', '橱柜'],
    iconSrc: '/icons/kitchen.png',
    labels: { zh: '厨房', en: 'Kitchen' },
  },
  bathroom: {
    aliases: ['bathtub', 'toilet', 'sink', '卫生间', '浴室', '洗手台'],
    iconSrc: '/icons/bathroom.png',
    labels: { zh: '卫浴', en: 'Bathroom' },
  },
  outdoor: {
    aliases: ['garden', 'patio', 'tree', 'outdoor', '户外', '庭院', '花园'],
    iconSrc: '/icons/tree.png',
    labels: { zh: '户外', en: 'Outdoor' },
  },
}

const PANEL_COPY = {
  'zh-CN': {
    aiCreate: 'AI 建房',
    aiModel: 'AI 造物',
    aiRender: 'AI 效果图',
    browseHint: '选择分类或搜索素材，点击卡片后即可进入放置状态。',
    categoryCount: '类',
    emptyCategory: '当前分类还没有素材',
    emptySearch: '没有找到匹配的素材',
    resultCount: '个结果',
    resultsTitle: '搜索结果',
    searchPlaceholder: '搜索家具、植物、灯具、厨房...',
    title: '布置',
  },
  en: {
    aiCreate: 'AI Create',
    aiModel: 'AI Model',
    aiRender: 'AI Render',
    browseHint: 'Pick a category or search assets, then click a card to start placing it.',
    categoryCount: 'categories',
    emptyCategory: 'No assets in this category yet',
    emptySearch: 'No matching assets found',
    resultCount: 'results',
    resultsTitle: 'Search Results',
    searchPlaceholder: 'Search furniture, plants, lights, kitchen...',
    title: 'Furnish',
  },
} satisfies Record<'zh-CN' | 'en', Record<string, string>>

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function getSearchText(item: AssetInput) {
  const category = CATEGORY_META[item.category as FurnishSidebarCategory]
  return normalizeSearchText(
    [
      item.id,
      item.name,
      category?.labels.zh,
      category?.labels.en,
      ...(category?.aliases ?? []),
      ...(item.tags ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function getAttachmentBadge(asset: AssetInput) {
  if (asset.attachTo === 'wall' || asset.attachTo === 'wall-side') {
    return { alt: 'Wall attachment', iconSrc: '/icons/wall.png' }
  }

  if (asset.attachTo === 'ceiling') {
    return { alt: 'Ceiling attachment', iconSrc: '/icons/ceiling.png' }
  }

  return null
}

export function FurnishPanel({
  language = 'zh-CN',
  onOpenAiWorkspace,
}: FurnishPanelProps) {
  const copy = PANEL_COPY[language]
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const selectedItem = useEditor((state) => state.selectedItem)
  const setActiveSidebarPanel = useEditor((state) => state.setActiveSidebarPanel)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)
  const setMode = useEditor((state) => state.setMode)
  const setPhase = useEditor((state) => state.setPhase)
  const setSelectedItem = useEditor((state) => state.setSelectedItem)
  const setTool = useEditor((state) => state.setTool)
  const [search, setSearch] = useState('')

  const visibleCategories = useMemo(
    () =>
      CATEGORY_ORDER.filter((category) =>
        CATALOG_ITEMS.some((item) => item.category === category),
      ),
    [],
  )

  const activeCategory: FurnishSidebarCategory =
    catalogCategory && catalogCategory in CATEGORY_META
      ? (catalogCategory as FurnishSidebarCategory)
      : (visibleCategories[0] ?? 'furniture')
  const normalizedSearch = normalizeSearchText(search)

  const categoryItems = useMemo(
    () => CATALOG_ITEMS.filter((item) => item.category === activeCategory),
    [activeCategory],
  )

  const filteredItems = useMemo(() => {
    if (!normalizedSearch) return categoryItems

    return CATALOG_ITEMS.filter((item) => {
      if (!CATEGORY_META[item.category as FurnishSidebarCategory]) return false
      return getSearchText(item).includes(normalizedSearch)
    })
  }, [categoryItems, normalizedSearch])

  const handleActivateFurnishMode = (category: FurnishSidebarCategory) => {
    setActiveSidebarPanel('furnish')

    if (phase !== 'furnish') {
      setPhase('furnish')
    }

    if (mode !== 'build') {
      setMode('build')
    }

    if (tool !== 'item') {
      setTool('item')
    }

    if (catalogCategory !== category) {
      setCatalogCategory(category)
    }
  }

  const handleSelectCategory = (category: FurnishSidebarCategory) => {
    setSearch('')
    handleActivateFurnishMode(category)
  }

  const handleSelectItem = (item: AssetInput) => {
    const category = item.category as FurnishSidebarCategory
    handleActivateFurnishMode(category)
    setSelectedItem(item)
    setSearch('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="border-border/50 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm">{copy.title}</div>
            <p className="mt-1 text-muted-foreground text-xs leading-5">{copy.browseHint}</p>
          </div>
          <div className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary text-xs">
            {visibleCategories.length} {copy.categoryCount}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <QuickActionButton
            icon={<Wand2 className="h-4 w-4" />}
            label={copy.aiModel}
            onClick={() => onOpenAiWorkspace?.('model')}
          />
          <QuickActionButton
            icon={<Sparkles className="h-4 w-4" />}
            label={copy.aiCreate}
            onClick={() => onOpenAiWorkspace?.('create')}
          />
          <QuickActionButton
            className="sm:col-span-2"
            icon={<ImageIcon className="h-4 w-4" />}
            label={copy.aiRender}
            onClick={() => onOpenAiWorkspace?.('render')}
          />
        </div>

        <div className="relative mt-3">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={copy.searchPlaceholder}
            value={search}
          />
        </div>
      </div>

      <div className="border-border/50 border-b px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {visibleCategories.map((category) => {
            const meta = CATEGORY_META[category]
            const isActive = !normalizedSearch && activeCategory === category
            const itemCount = CATALOG_ITEMS.filter((item) => item.category === category).length

            return (
              <button
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                  isActive
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/60 bg-background/65 text-foreground hover:border-primary/20 hover:bg-accent',
                )}
                key={category}
                onClick={() => handleSelectCategory(category)}
                type="button"
              >
                <NextImage
                  alt={meta.labels.en}
                  className="h-5 w-5 object-contain"
                  height={20}
                  src={meta.iconSrc}
                  width={20}
                />
                <span className="font-medium text-xs">{meta.labels[language === 'en' ? 'en' : 'zh']}</span>
                <span className="text-[11px] text-muted-foreground">{itemCount}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0 font-medium text-sm">
            {normalizedSearch
              ? copy.resultsTitle
              : CATEGORY_META[activeCategory]?.labels[language === 'en' ? 'en' : 'zh']}
          </div>
          <div className="text-muted-foreground text-xs">
            {filteredItems.length} {copy.resultCount}
          </div>
        </div>

        {filteredItems.length > 0 ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))' }}
          >
            {filteredItems.map((item) => (
              <CatalogCard
                isSelected={selectedItem?.src === item.src}
                item={item}
                key={item.id}
                language={language}
                onClick={() => handleSelectItem(item)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/25 px-4 text-center text-muted-foreground text-sm">
            {normalizedSearch ? copy.emptySearch : copy.emptyCategory}
          </div>
        )}
      </div>
    </div>
  )
}

function QuickActionButton({
  className,
  icon,
  label,
  onClick,
}: {
  className?: string
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button
      className={cn(
        'h-10 justify-start gap-2 rounded-lg border-border/70 bg-background/75 px-3 text-sm shadow-none hover:border-primary/20 hover:bg-accent',
        className,
      )}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      {icon}
      {label}
    </Button>
  )
}

function CatalogCard({
  isSelected,
  item,
  language,
  onClick,
}: {
  isSelected: boolean
  item: AssetInput
  language: 'zh-CN' | 'en'
  onClick: () => void
}) {
  const categoryMeta = CATEGORY_META[item.category as FurnishSidebarCategory]
  const attachmentBadge = getAttachmentBadge(item)

  return (
    <button
      className={cn(
        'group cursor-pointer rounded-xl border border-border/60 bg-background/80 p-2 text-left transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm',
        isSelected && 'border-primary/35 bg-primary/5 shadow-sm ring-1 ring-primary/20',
      )}
      onClick={onClick}
      type="button"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted/50">
        <NextImage
          alt={item.name}
          className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          fill
          loading="eager"
          sizes="180px"
          src={resolveCdnUrl(item.thumbnail) || ''}
        />
        {attachmentBadge ? (
          <div className="absolute right-2 bottom-2 flex h-5 w-5 items-center justify-center rounded-md border border-border/60 bg-background/90 shadow-sm">
            <NextImage
              alt={attachmentBadge.alt}
              className="h-4 w-4"
              height={16}
              src={attachmentBadge.iconSrc}
              width={16}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">{item.name}</div>
          <div className="mt-1 truncate text-muted-foreground text-xs">
            {categoryMeta?.labels[language === 'en' ? 'en' : 'zh']}
          </div>
        </div>
        {isSelected ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-[11px]">
            {language === 'en' ? 'Selected' : '已选'}
          </span>
        ) : null}
      </div>
    </button>
  )
}
