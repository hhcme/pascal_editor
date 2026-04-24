'use client'

import {
  getLibraryMaterialIdFromRef,
  getMaterialsForTarget,
  MATERIAL_CATALOG_CATEGORY_OPTIONS,
  MATERIAL_CATALOG_COLOR_OPTIONS,
  MATERIAL_CATALOG_FINISH_OPTIONS,
  MATERIAL_CATALOG_SOURCE_OPTIONS,
  toLibraryMaterialRef,
  type MaterialCatalogCategory,
  type MaterialCatalogColorFamily,
  type MaterialCatalogFinish,
  type MaterialCatalogItem,
  type MaterialCatalogSource,
  type MaterialProperties,
  type MaterialSchema,
  type MaterialTarget,
} from '@pascal-app/core'
import { Clock, Search, Star, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

type FilterValue<T extends string> = T | 'all'
type CategoryFilter = FilterValue<MaterialCatalogCategory>
type ColorFilter = FilterValue<MaterialCatalogColorFamily>
type FinishFilter = FilterValue<MaterialCatalogFinish>
type ProviderFilter = FilterValue<'ambientcg' | 'poly-haven' | 'legacy' | 'procedural'>
type KindFilter = FilterValue<'texture' | 'procedural'>
type CollectionFilter = 'all' | 'favorites' | 'recent'

type MaterialProvider = Exclude<ProviderFilter, 'all'>
type MaterialKind = Exclude<KindFilter, 'all'>

const DEFAULT_MATERIAL_PROPERTIES: MaterialProperties = {
  color: '#ffffff',
  roughness: 0.5,
  metalness: 0,
  opacity: 1,
  transparent: false,
  side: 'front',
}

const CATEGORY_LABELS = new Map(
  MATERIAL_CATALOG_CATEGORY_OPTIONS.map((option) => [option.id, option.label]),
)
const COLOR_LABELS = new Map(
  MATERIAL_CATALOG_COLOR_OPTIONS.map((option) => [option.id, option.label]),
)
const FINISH_LABELS = new Map(
  MATERIAL_CATALOG_FINISH_OPTIONS.map((option) => [option.id, option.label]),
)

const MATERIAL_FAVORITES_STORAGE_KEY = 'pascal.materialPicker.favoriteMaterialIds'
const MATERIAL_RECENT_STORAGE_KEY = 'pascal.materialPicker.recentMaterialIds'
const MAX_RECENT_MATERIALS = 18
const MATERIAL_CARD_MIN_WIDTH = 88
const MATERIAL_CARD_HEIGHT = 122
const MATERIAL_GRID_GAP = 8
const MATERIAL_GRID_MAX_HEIGHT = 520
const MATERIAL_GRID_OVERSCAN_ROWS = 3

const PROVIDER_OPTIONS: Array<{ id: ProviderFilter; label: string; shortLabel: string }> = [
  { id: 'all', label: 'All sources', shortLabel: 'All' },
  { id: 'poly-haven', label: 'Poly Haven', shortLabel: 'PH' },
  { id: 'ambientcg', label: 'ambientCG', shortLabel: 'aCG' },
  { id: 'procedural', label: 'Parametric', shortLabel: 'Param' },
  { id: 'legacy', label: 'Legacy', shortLabel: 'Old' },
]
const PROVIDER_FALLBACK = PROVIDER_OPTIONS[0] ?? {
  id: 'all' as const,
  label: 'All sources',
  shortLabel: 'All',
}

const KIND_OPTIONS: Array<{ id: KindFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'texture', label: 'PBR' },
  { id: 'procedural', label: 'Param' },
]

const COLLECTION_OPTIONS: Array<{ id: CollectionFilter; label: string }> = [
  { id: 'all', label: 'Library' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'recent', label: 'Recent' },
]

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

function getMaterialKind(item: MaterialCatalogItem): MaterialKind {
  return Object.keys(item.preset.maps).length > 0 ? 'texture' : 'procedural'
}

function getMaterialProvider(item: MaterialCatalogItem): MaterialProvider {
  if (item.id.startsWith('polyhaven-')) return 'poly-haven'
  if (item.id.startsWith('ambientcg-')) return 'ambientcg'
  return getMaterialKind(item) === 'texture' ? 'legacy' : 'procedural'
}

function getProviderOption(provider: MaterialProvider) {
  return PROVIDER_OPTIONS.find((option) => option.id === provider) ?? PROVIDER_FALLBACK
}

function getProviderClassName(provider: MaterialProvider): string {
  switch (provider) {
    case 'poly-haven':
      return 'bg-emerald-600 text-white'
    case 'ambientcg':
      return 'bg-sky-600 text-white'
    case 'legacy':
      return 'bg-amber-600 text-white'
    case 'procedural':
      return 'bg-slate-700 text-white'
  }
}

function formatMaterialNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function getMaterialSearchText(item: MaterialCatalogItem): string {
  const provider = getMaterialProvider(item)
  const providerOption = getProviderOption(provider)
  const kind = getMaterialKind(item)

  return [
    item.label,
    item.description,
    item.category,
    CATEGORY_LABELS.get(item.category),
    item.colorFamily,
    COLOR_LABELS.get(item.colorFamily),
    item.finish,
    FINISH_LABELS.get(item.finish),
    item.tags.join(' '),
    provider,
    providerOption.label,
    providerOption.shortLabel,
    kind,
    kind === 'texture' ? 'pbr texture 1k cc0' : 'parametric procedural',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function getSourceCount(items: MaterialCatalogItem[], source: MaterialCatalogSource): number {
  return items.filter((item) => item.source === source).length
}

function readStoredMaterialIds(key: string): string[] {
  if (typeof window === 'undefined') return []

  try {
    const value = window.localStorage.getItem(key)
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeStoredMaterialIds(key: string, ids: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(ids))
}

function getMaterialSortScore(
  item: MaterialCatalogItem,
  selectedCatalogId: string | undefined,
  favoriteIds: string[],
  recentIds: string[],
): number {
  let score = 0

  if (selectedCatalogId === toLibraryMaterialRef(item.id)) score += 10_000
  if (favoriteIds.includes(item.id)) score += 2_000

  const recentIndex = recentIds.indexOf(item.id)
  if (recentIndex !== -1) score += 1_200 - recentIndex * 20

  if (getMaterialKind(item) === 'texture') score += 500

  const provider = getMaterialProvider(item)
  if (provider === 'poly-haven') score += 80
  if (provider === 'ambientcg') score += 70
  if (provider === 'legacy') score += 20

  return score
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
  const [source, setSource] = useState<MaterialCatalogSource>('public')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [colorFamily, setColorFamily] = useState<ColorFilter>('all')
  const [finish, setFinish] = useState<FinishFilter>('all')
  const [provider, setProvider] = useState<ProviderFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [collection, setCollection] = useState<CollectionFilter>('all')
  const [query, setQuery] = useState('')
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [gridScrollTop, setGridScrollTop] = useState(0)
  const [gridWidth, setGridWidth] = useState(0)
  const gridViewportRef = useRef<HTMLDivElement>(null)

  const catalogItems = useMemo(() => (nodeType ? getMaterialsForTarget(nodeType) : []), [nodeType])

  const selectedCatalogId =
    selectedMaterialPreset ?? (value?.id ? toLibraryMaterialRef(value.id) : undefined)
  const selectedMaterialId = getLibraryMaterialIdFromRef(selectedCatalogId)

  const availableCategoryOptions = useMemo(() => {
    const ids = new Set(
      catalogItems.filter((item) => item.source === source).map((item) => item.category),
    )
    return MATERIAL_CATALOG_CATEGORY_OPTIONS.filter((option) => ids.has(option.id))
  }, [catalogItems, source])

  const availableColorOptions = useMemo(() => {
    const ids = new Set(
      catalogItems.filter((item) => item.source === source).map((item) => item.colorFamily),
    )
    return MATERIAL_CATALOG_COLOR_OPTIONS.filter((option) => ids.has(option.id))
  }, [catalogItems, source])

  const availableFinishOptions = useMemo(() => {
    const ids = new Set(
      catalogItems.filter((item) => item.source === source).map((item) => item.finish),
    )
    return MATERIAL_CATALOG_FINISH_OPTIONS.filter((option) => ids.has(option.id))
  }, [catalogItems, source])

  const filteredCatalogItems = useMemo(() => {
    const normalizedQuery = normalizeSearch(query)

    return catalogItems
      .filter((item) => {
        if (item.source !== source) return false
        if (category !== 'all' && item.category !== category) return false
        if (colorFamily !== 'all' && item.colorFamily !== colorFamily) return false
        if (finish !== 'all' && item.finish !== finish) return false
        if (provider !== 'all' && getMaterialProvider(item) !== provider) return false
        if (kind !== 'all' && getMaterialKind(item) !== kind) return false
        if (collection === 'favorites' && !favoriteIds.includes(item.id)) return false
        if (collection === 'recent' && !recentIds.includes(item.id)) return false
        if (normalizedQuery && !getMaterialSearchText(item).includes(normalizedQuery)) return false
        return true
      })
      .sort((left, right) => {
        const scoreDelta =
          getMaterialSortScore(right, selectedCatalogId, favoriteIds, recentIds) -
          getMaterialSortScore(left, selectedCatalogId, favoriteIds, recentIds)
        if (scoreDelta !== 0) return scoreDelta
        return left.label.localeCompare(right.label)
      })
  }, [
    catalogItems,
    category,
    collection,
    colorFamily,
    favoriteIds,
    finish,
    kind,
    provider,
    query,
    recentIds,
    selectedCatalogId,
    source,
  ])

  const providerCounts = useMemo(() => {
    const counts = new Map<ProviderFilter, number>([['all', catalogItems.length]])
    for (const item of catalogItems) {
      const itemProvider = getMaterialProvider(item)
      counts.set(itemProvider, (counts.get(itemProvider) ?? 0) + 1)
    }
    return counts
  }, [catalogItems])

  const kindCounts = useMemo(() => {
    const counts = new Map<KindFilter, number>([['all', catalogItems.length]])
    for (const item of catalogItems) {
      const itemKind = getMaterialKind(item)
      counts.set(itemKind, (counts.get(itemKind) ?? 0) + 1)
    }
    return counts
  }, [catalogItems])

  const textureCount = kindCounts.get('texture') ?? 0
  const selectedCatalogItem = useMemo(
    () => catalogItems.find((item) => item.id === selectedMaterialId),
    [catalogItems, selectedMaterialId],
  )

  const gridColumnCount = Math.max(
    1,
    Math.floor((gridWidth + MATERIAL_GRID_GAP) / (MATERIAL_CARD_MIN_WIDTH + MATERIAL_GRID_GAP)),
  )
  const gridRowStride = MATERIAL_CARD_HEIGHT + MATERIAL_GRID_GAP
  const gridRowCount = Math.ceil(filteredCatalogItems.length / gridColumnCount)
  const gridContentHeight = Math.max(
    0,
    gridRowCount * MATERIAL_CARD_HEIGHT + Math.max(0, gridRowCount - 1) * MATERIAL_GRID_GAP,
  )
  const gridViewportHeight = Math.min(MATERIAL_GRID_MAX_HEIGHT, gridContentHeight)
  const visibleStartRow = Math.max(
    0,
    Math.floor(gridScrollTop / gridRowStride) - MATERIAL_GRID_OVERSCAN_ROWS,
  )
  const visibleRowCount =
    gridViewportHeight > 0
      ? Math.ceil(gridViewportHeight / gridRowStride) + MATERIAL_GRID_OVERSCAN_ROWS * 2
      : 0
  const visibleEndRow = Math.min(gridRowCount, visibleStartRow + visibleRowCount)
  const visibleStartIndex = visibleStartRow * gridColumnCount
  const visibleEndIndex = Math.min(filteredCatalogItems.length, visibleEndRow * gridColumnCount)
  const visibleCatalogItems = filteredCatalogItems.slice(visibleStartIndex, visibleEndIndex)
  const visibleGridTop = visibleStartRow * gridRowStride

  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    (category !== 'all' ? 1 : 0) +
    (colorFamily !== 'all' ? 1 : 0) +
    (finish !== 'all' ? 1 : 0) +
    (provider !== 'all' ? 1 : 0) +
    (kind !== 'all' ? 1 : 0) +
    (collection !== 'all' ? 1 : 0)

  useEffect(() => {
    setShowCustom(!!value?.properties && !selectedMaterialPreset)
  }, [selectedMaterialPreset, value?.properties])

  useEffect(() => {
    setFavoriteIds(readStoredMaterialIds(MATERIAL_FAVORITES_STORAGE_KEY))
    setRecentIds(readStoredMaterialIds(MATERIAL_RECENT_STORAGE_KEY))
  }, [])

  useEffect(() => {
    const viewport = gridViewportRef.current
    if (!viewport) return

    const updateWidth = () => setGridWidth(viewport.clientWidth)
    updateWidth()

    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(viewport)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    setGridScrollTop(0)
    if (gridViewportRef.current) {
      gridViewportRef.current.scrollTop = 0
    }
  }, [category, collection, colorFamily, finish, kind, provider, query, source])

  useEffect(() => {
    if (catalogItems.length === 0) return
    if (getSourceCount(catalogItems, source) === 0) {
      setSource('public')
    }
  }, [catalogItems, source])

  useEffect(() => {
    if (category === 'all') return
    if (!availableCategoryOptions.some((option) => option.id === category)) {
      setCategory('all')
    }
  }, [availableCategoryOptions, category])

  useEffect(() => {
    if (colorFamily === 'all') return
    if (!availableColorOptions.some((option) => option.id === colorFamily)) {
      setColorFamily('all')
    }
  }, [availableColorOptions, colorFamily])

  useEffect(() => {
    if (finish === 'all') return
    if (!availableFinishOptions.some((option) => option.id === finish)) {
      setFinish('all')
    }
  }, [availableFinishOptions, finish])

  const currentProps: MaterialProperties = value?.properties || DEFAULT_MATERIAL_PROPERTIES

  const handleCatalogSelect = (materialId: string) => {
    if (disabled) return
    setShowCustom(false)
    setRecentIds((currentIds) => {
      const nextIds = [materialId, ...currentIds.filter((id) => id !== materialId)].slice(
        0,
        MAX_RECENT_MATERIALS,
      )
      writeStoredMaterialIds(MATERIAL_RECENT_STORAGE_KEY, nextIds)
      return nextIds
    })
    onSelectMaterialPreset?.(toLibraryMaterialRef(materialId))
  }

  const handleFavoriteToggle = (materialId: string) => {
    if (disabled) return
    setFavoriteIds((currentIds) => {
      const nextIds = currentIds.includes(materialId)
        ? currentIds.filter((id) => id !== materialId)
        : [materialId, ...currentIds]
      writeStoredMaterialIds(MATERIAL_FAVORITES_STORAGE_KEY, nextIds)
      return nextIds
    })
  }

  const handleCustomOpen = () => {
    if (disabled) return
    setShowCustom(true)
    onChange?.({
      preset: 'custom',
      properties: {
        color: value?.properties?.color || DEFAULT_MATERIAL_PROPERTIES.color,
        roughness: value?.properties?.roughness ?? DEFAULT_MATERIAL_PROPERTIES.roughness,
        metalness: value?.properties?.metalness ?? DEFAULT_MATERIAL_PROPERTIES.metalness,
        opacity: value?.properties?.opacity ?? DEFAULT_MATERIAL_PROPERTIES.opacity,
        transparent: value?.properties?.transparent ?? DEFAULT_MATERIAL_PROPERTIES.transparent,
        side: value?.properties?.side ?? DEFAULT_MATERIAL_PROPERTIES.side,
      },
    })
  }

  const handlePropertyPatch = (patch: Partial<MaterialProperties>) => {
    if (disabled) return
    onChange?.({
      preset: 'custom',
      properties: {
        ...currentProps,
        ...patch,
      },
    })
  }

  const handlePropertyChange = <K extends keyof MaterialProperties>(
    prop: K,
    val: MaterialProperties[K],
  ) => {
    handlePropertyPatch({ [prop]: val } as Partial<MaterialProperties>)
  }

  const handleClearFilters = () => {
    setQuery('')
    setCategory('all')
    setColorFamily('all')
    setFinish('all')
    setProvider('all')
    setKind('all')
    setCollection('all')
  }

  return (
    <div className={cn('space-y-3', disabled && 'pointer-events-none opacity-50')}>
      {(catalogItems.length > 0 || onChange) && (
        <div className="space-y-2">
          {catalogItems.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-[11px] text-muted-foreground">Library</div>
                <div className="flex h-7 shrink-0 rounded-md bg-muted/60 p-0.5">
                  {MATERIAL_CATALOG_SOURCE_OPTIONS.map((option) => {
                    const count = getSourceCount(catalogItems, option.id)
                    const isActive = source === option.id

                    return (
                      <button
                        aria-pressed={isActive}
                        className={cn(
                          'h-6 rounded px-2 text-[10px] font-semibold transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          isActive
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                          count === 0 && 'cursor-not-allowed opacity-45 hover:text-muted-foreground',
                        )}
                        disabled={disabled || count === 0}
                        key={option.id}
                        onClick={() => setSource(option.id)}
                        title={`${option.label} (${count})`}
                        type="button"
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1">
                <span className="font-medium text-[10px] text-muted-foreground">
                  {filteredCatalogItems.length} / {catalogItems.length}
                </span>
                <span className="text-[10px] text-muted-foreground">{textureCount} PBR</span>
              </div>

              <div className="relative">
                <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  aria-label="Search materials"
                  className="h-8 w-full rounded-md border border-border bg-background pr-8 pl-7 text-foreground text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary/25"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search material, source, finish"
                  type="search"
                  value={query}
                />
                {query ? (
                  <button
                    aria-label="Clear search"
                    className="-translate-y-1/2 absolute top-1/2 right-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    onClick={() => setQuery('')}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1">
                {COLLECTION_OPTIONS.map((option) => {
                  const isActive = collection === option.id
                  const count =
                    option.id === 'favorites'
                      ? favoriteIds.length
                      : option.id === 'recent'
                        ? recentIds.length
                        : catalogItems.length

                  return (
                    <button
                      aria-pressed={isActive}
                      className={cn(
                        'h-7 rounded-md border px-2 text-[10px] font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/70 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        count === 0 && 'cursor-not-allowed opacity-45 hover:text-muted-foreground',
                      )}
                      disabled={disabled || count === 0}
                      key={option.id}
                      onClick={() => setCollection(option.id)}
                      type="button"
                    >
                      {option.id === 'favorites' ? (
                        <Star className="mr-1 inline h-3 w-3 align-[-2px]" />
                      ) : option.id === 'recent' ? (
                        <Clock className="mr-1 inline h-3 w-3 align-[-2px]" />
                      ) : null}
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap gap-1">
                {PROVIDER_OPTIONS.map((option) => {
                  const count = providerCounts.get(option.id) ?? 0
                  const isActive = provider === option.id

                  return (
                    <button
                      aria-pressed={isActive}
                      className={cn(
                        'h-7 rounded-md border px-2 text-[10px] font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/70 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        count === 0 && 'cursor-not-allowed opacity-45 hover:text-muted-foreground',
                      )}
                      disabled={disabled || count === 0}
                      key={option.id}
                      onClick={() => setProvider(option.id)}
                      title={`${option.label} (${count})`}
                      type="button"
                    >
                      {option.shortLabel}
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-1">
                {KIND_OPTIONS.map((option) => {
                  const count = kindCounts.get(option.id) ?? 0
                  const isActive = kind === option.id

                  return (
                    <button
                      aria-pressed={isActive}
                      className={cn(
                        'h-7 flex-1 rounded-md border px-2 text-[10px] font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/70 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        count === 0 && 'cursor-not-allowed opacity-45 hover:text-muted-foreground',
                      )}
                      disabled={disabled || count === 0}
                      key={option.id}
                      onClick={() => setKind(option.id)}
                      title={`${option.label} (${count})`}
                      type="button"
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <select
                  aria-label="Material category"
                  className="h-7 min-w-0 rounded-md border border-border bg-background px-1.5 text-foreground text-xs outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/25"
                  onChange={(event) => setCategory(event.target.value as CategoryFilter)}
                  value={category}
                >
                  <option value="all">All types</option>
                  {availableCategoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Material color"
                  className="h-7 min-w-0 rounded-md border border-border bg-background px-1.5 text-foreground text-xs outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/25"
                  onChange={(event) => setColorFamily(event.target.value as ColorFilter)}
                  value={colorFamily}
                >
                  <option value="all">All colors</option>
                  {availableColorOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Material finish"
                  className="h-7 min-w-0 rounded-md border border-border bg-background px-1.5 text-foreground text-xs outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/25"
                  onChange={(event) => setFinish(event.target.value as FinishFilter)}
                  value={finish}
                >
                  <option value="all">All finish</option>
                  {availableFinishOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {activeFilterCount > 0 ? (
                <button
                  className="h-6 rounded text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={handleClearFilters}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
            </>
          ) : null}

          {filteredCatalogItems.length > 0 ? (
            <div
              className="overflow-y-auto pr-1"
              onScroll={(event) => setGridScrollTop(event.currentTarget.scrollTop)}
              ref={gridViewportRef}
              style={{
                height: gridViewportHeight || undefined,
                maxHeight: MATERIAL_GRID_MAX_HEIGHT,
              }}
            >
              <div className="relative" style={{ height: gridContentHeight || undefined }}>
                <div
                  className="absolute right-0 left-0 grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${gridColumnCount}, minmax(0, 1fr))`,
                    top: visibleGridTop,
                  }}
                >
                  {visibleCatalogItems.map((item) => {
                    const isSelected = selectedCatalogId === toLibraryMaterialRef(item.id)
                    const itemProvider = getMaterialProvider(item)
                    const itemProviderOption = getProviderOption(itemProvider)
                    const itemKind = getMaterialKind(item)
                    const isFavorite = favoriteIds.includes(item.id)

                    return (
                      <div className="relative min-w-0" key={item.id}>
                        <button
                          aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
                          aria-pressed={isFavorite}
                          className={cn(
                            'absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] shadow-sm backdrop-blur',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                            isFavorite
                              ? 'border-amber-300 bg-amber-100 text-amber-700'
                              : 'border-white/70 bg-background/70 text-muted-foreground hover:text-foreground',
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleFavoriteToggle(item.id)
                          }}
                          title={isFavorite ? 'Remove favorite' : 'Add favorite'}
                          type="button"
                        >
                          <Star
                            className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')}
                            strokeWidth={2}
                          />
                        </button>

                        <button
                          aria-pressed={isSelected}
                          className={cn(
                            'h-[122px] w-full min-w-0 overflow-hidden rounded-md border bg-card text-left transition-all',
                            'hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                            isSelected
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-border/70',
                          )}
                          onClick={() => handleCatalogSelect(item.id)}
                          title={
                            item.description ? `${item.label}: ${item.description}` : item.label
                          }
                          type="button"
                        >
                          <span className="relative block h-16 w-full overflow-hidden bg-muted">
                            {item.previewThumbnailUrl ? (
                              <img
                                alt={item.label}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                src={item.previewThumbnailUrl}
                              />
                            ) : item.previewColor ? (
                              <span
                                className="block h-full w-full"
                                style={{ backgroundColor: item.previewColor }}
                              />
                            ) : (
                              <span className="block h-full w-full bg-muted" />
                            )}
                            <span
                              className={cn(
                                'absolute top-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold leading-none',
                                getProviderClassName(itemProvider),
                              )}
                            >
                              {itemProviderOption.shortLabel}
                            </span>
                          </span>
                          <span className="flex h-[58px] min-w-0 flex-col gap-1 px-1.5 py-1.5">
                            <span
                              className="overflow-hidden font-medium text-[11px] text-foreground leading-tight"
                              style={{
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: 2,
                              }}
                            >
                              {item.label}
                            </span>
                            <span className="mt-auto flex min-w-0 items-center gap-1">
                              <span className="truncate text-[10px] text-muted-foreground">
                                {CATEGORY_LABELS.get(item.category) ?? item.category}
                              </span>
                              <span className="ml-auto rounded bg-muted px-1 py-0.5 font-semibold text-[9px] text-muted-foreground leading-none">
                                {itemKind === 'texture' ? 'PBR' : 'Param'}
                              </span>
                            </span>
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : catalogItems.length > 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-[11px] text-muted-foreground">
              No materials match
            </div>
          ) : (
            null
          )}

          {onChange ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
              <button
                aria-pressed={showCustom}
                className={cn(
                  'flex h-[122px] min-w-0 flex-col items-center justify-center rounded-md border px-1 text-center transition-all',
                  'hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  showCustom
                    ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                    : 'border-border/70 bg-card text-muted-foreground',
                )}
                onClick={handleCustomOpen}
                title="Custom"
                type="button"
              >
                <span className="text-[11px] font-semibold">Custom</span>
                <span className="mt-1 text-[10px]">Color</span>
              </button>
            </div>
          ) : (
            null
          )}
        </div>
      )}

      {selectedCatalogItem ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold text-[11px] text-foreground">
                {selectedCatalogItem.label}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {getProviderOption(getMaterialProvider(selectedCatalogItem)).label}
              </div>
            </div>
            <span className="rounded bg-background px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground">
              {getMaterialKind(selectedCatalogItem) === 'texture'
                ? 'PBR defaults'
                : 'Param defaults'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="rounded bg-background px-2 py-1">
              <span className="text-muted-foreground">Repeat</span>
              <span className="ml-1 font-mono text-foreground">
                {formatMaterialNumber(selectedCatalogItem.preset.mapProperties.repeatX)}x
                {formatMaterialNumber(selectedCatalogItem.preset.mapProperties.repeatY)}
              </span>
            </div>
            <div className="rounded bg-background px-2 py-1">
              <span className="text-muted-foreground">Rotate</span>
              <span className="ml-1 font-mono text-foreground">
                {formatMaterialNumber(selectedCatalogItem.preset.mapProperties.rotation)}
              </span>
            </div>
            <div className="rounded bg-background px-2 py-1">
              <span className="text-muted-foreground">Normal</span>
              <span className="ml-1 font-mono text-foreground">
                {formatMaterialNumber(selectedCatalogItem.preset.mapProperties.normalScaleX)}
              </span>
            </div>
            <div className="rounded bg-background px-2 py-1">
              <span className="text-muted-foreground">Displace</span>
              <span className="ml-1 font-mono text-foreground">
                {formatMaterialNumber(
                  selectedCatalogItem.preset.mapProperties.displacementScale,
                )}
              </span>
            </div>
            <div className="rounded bg-background px-2 py-1">
              <span className="text-muted-foreground">Rough</span>
              <span className="ml-1 font-mono text-foreground">
                {formatMaterialNumber(selectedCatalogItem.preset.mapProperties.roughness)}
              </span>
            </div>
            <div className="rounded bg-background px-2 py-1">
              <span className="text-muted-foreground">Maps</span>
              <span className="ml-1 font-mono text-foreground">
                {Object.keys(selectedCatalogItem.preset.maps).length}
              </span>
            </div>
          </div>
        </div>
      ) : null}

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
              onChange={(e) =>
                handlePropertyChange('roughness', Number.parseFloat(e.target.value))
              }
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
              onChange={(e) =>
                handlePropertyChange('metalness', Number.parseFloat(e.target.value))
              }
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
                handlePropertyPatch({
                  opacity,
                  transparent: opacity < 1 ? true : currentProps.transparent,
                })
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
