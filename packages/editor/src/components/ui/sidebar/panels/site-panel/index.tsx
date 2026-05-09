import {
  type AnyNode,
  type AnyNodeId,
  type AssetInput,
  type BuildingNode,
  emitter,
  generateId,
  type GuideNode,
  ItemNode,
  LevelNode,
  type ScanNode,
  type SiteNode,
  type TerrainNode,
  useScene,
  type ZoneNode,
} from '@pascal-app/core'
import {
  getBrowserTimeZone,
  getSiteSolarLocation,
  isValidTimeZone,
  resolveSiteSolarLocation,
  useViewer,
  withSiteSolarLocation,
} from '@pascal-app/viewer'
import {
  ArrowLeftRight,
  Box,
  BrickWall,
  Building2,
  Camera,
  ChevronDown,
  Compass,
  Eye,
  EyeOff,
  FileImage,
  Layers,
  Loader2,
  MapPinned,
  MoreHorizontal,
  Mountain,
  Pencil,
  Pentagon,
  Plus,
  Shapes,
  Sofa,
  SunMedium,
  Trees,
  Trash2,
  X,
} from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { memo, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MetricControl } from './../../../../../components/ui/controls/metric-control'
import { ColorDot } from './../../../../../components/ui/primitives/color-dot'
import { Input } from './../../../../../components/ui/primitives/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './../../../../../components/ui/primitives/popover'
import { deleteLevelWithFallbackSelection } from './../../../../../lib/level-selection'
import {
  createGeneratedTerrainNode,
  createTerrainMesh,
  type TerrainPreset,
} from './../../../../../lib/terrain-generation'
import { cn } from './../../../../../lib/utils'
import {
  isZoneLabelHidden,
  withZoneLabelHidden,
} from './../../../../../lib/zone-label-visibility'
import {
  degreesToRadians,
  getCircularDegreeDistance,
  getOrientationText,
  getSiteOrientationDegrees,
  ORIENTATION_OPTIONS,
  ORIENTATION_STEPS,
  radiansToDegrees,
  withSiteOrientationDegrees,
} from '../../../../../lib/orientation'
import {
  getSiteSetbackRules,
  type SiteSetbackRuleKey,
  withSiteSetbackRule,
} from '../../../../../lib/site-measurement-rules'
import useEditor from './../../../../../store/use-editor'
import { useUploadStore } from '../../../../../store/use-upload'
import { CATALOG_ITEMS } from '../../../item-catalog/catalog-items'
import { InlineRenameInput } from './inline-rename-input'
import { focusTreeNode, TreeNode } from './tree-node'
import { TreeNodeDragProvider } from './tree-node-drag'

// ============================================================================
// PROPERTY LINE SECTION
// ============================================================================

function calculatePerimeter(points: Array<[number, number]>): number {
  if (points.length < 2) return 0
  let perimeter = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i]!
    const [x2, z2] = points[(i + 1) % points.length]!
    perimeter += Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
  }
  return perimeter
}

function calculatePolygonArea(polygon: Array<[number, number]>): number {
  if (polygon.length < 3) return 0
  let area = 0
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const [currentX, currentY] = polygon[i]!
    const [nextX, nextY] = polygon[j]!
    area += currentX * nextY
    area -= nextX * currentY
  }
  return Math.abs(area) / 2
}

function getPolygonBounds(points: Array<[number, number]>) {
  const fallback = {
    minX: -15,
    maxX: 15,
    minZ: -15,
    maxZ: 15,
    width: 30,
    depth: 30,
  }

  if (points.length === 0) return fallback

  const xs = points.map(([x]) => x)
  const zs = points.map(([, z]) => z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(maxX - minX, 1),
    depth: Math.max(maxZ - minZ, 1),
  }
}

function getCatalogAsset(assetId: string): AssetInput | null {
  return CATALOG_ITEMS.find((item) => item.id === assetId) ?? null
}

function useSiteNode(): SiteNode | null {
  const siteId = useScene((state) => {
    for (const id of state.rootNodeIds) {
      if (state.nodes[id]?.type === 'site') return id
    }
    return null
  })
  return useScene((state) =>
    siteId ? ((state.nodes[siteId] as SiteNode | undefined) ?? null) : null,
  )
}

function TreeEmptyState({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="px-3 py-3">
      <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-4 text-center text-muted-foreground text-xs">
        <span>{title}</span>
        {actionLabel && onAction ? (
          <button
            className="ml-1 cursor-pointer font-medium text-primary hover:underline"
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

const PropertyLineSection = memo(function PropertyLineSection() {
  const siteNode = useSiteNode()
  const updateNode = useScene((state) => state.updateNode)
  const mode = useEditor((state) => state.mode)
  const setMode = useEditor((state) => state.setMode)

  if (!siteNode) return null

  const points = siteNode.polygon?.points ?? []
  const area = calculatePolygonArea(points)
  const perimeter = calculatePerimeter(points)
  const isEditing = mode === 'edit'

  const handleToggleEdit = () => {
    setMode(isEditing ? 'select' : 'edit')
  }

  const handlePointChange = (index: number, axis: 0 | 1, value: number) => {
    const newPoints = [...points.map((p) => [...p] as [number, number])]
    newPoints[index]![axis] = value
    updateNode(siteNode.id, {
      polygon: { type: 'polygon' as const, points: newPoints },
    })
  }

  const handleAddPoint = () => {
    const lastPoint = points[points.length - 1]
    const firstPoint = points[0]
    if (!(lastPoint && firstPoint)) return

    const newPoint: [number, number] = [
      (lastPoint[0] + firstPoint[0]) / 2,
      (lastPoint[1] + firstPoint[1]) / 2,
    ]
    const newPoints = [...points, newPoint]
    updateNode(siteNode.id, {
      polygon: { type: 'polygon' as const, points: newPoints },
    })
  }

  const handleDeletePoint = (index: number) => {
    if (points.length <= 3) return
    const newPoints = points.filter((_, i) => i !== index)
    updateNode(siteNode.id, {
      polygon: { type: 'polygon' as const, points: newPoints },
    })
  }

  return (
    <div className="relative border-border/50 border-b">
      {/* Vertical tree line */}
      <div className="absolute top-0 bottom-0 left-[21px] w-px bg-border/50" />

      {/* Header */}
      <div className="relative flex items-center justify-between py-2 pr-3 pl-10">
        {/* Horizontal branch line */}
        <div className="absolute top-1/2 left-[21px] h-px w-4 bg-border/50" />

        <div className="flex items-center gap-2">
          <Pentagon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Property Line</span>
        </div>
        <button
          className={cn(
            'flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors',
            isEditing
              ? 'bg-orange-500/20 text-orange-400'
              : 'text-muted-foreground hover:bg-accent',
          )}
          onClick={handleToggleEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Measurements */}
      <div className="relative flex gap-3 pr-3 pb-2 pl-10">
        <div className="text-muted-foreground text-xs">
          Area: <span className="text-foreground">{area.toFixed(1)} m²</span>
        </div>
        <div className="text-muted-foreground text-xs">
          Perimeter: <span className="text-foreground">{perimeter.toFixed(1)} m</span>
        </div>
      </div>

      {/* Vertex list (shown when editing) */}
      {isEditing && (
        <div className="relative pr-3 pb-2 pl-10">
          <div className="flex flex-col gap-1">
            {points.map((point, index) => (
              <div className="flex items-center gap-1.5 text-xs" key={index}>
                <span className="w-4 shrink-0 text-right text-muted-foreground">{index + 1}</span>
                <label className="shrink-0 text-muted-foreground">X</label>
                <input
                  className="w-16 rounded border border-border/50 bg-accent/50 px-1.5 py-0.5 text-foreground text-xs focus:border-primary focus:outline-none"
                  onChange={(e) =>
                    handlePointChange(index, 0, Number.parseFloat(e.target.value) || 0)
                  }
                  step={0.5}
                  type="number"
                  value={point[0]}
                />
                <label className="shrink-0 text-muted-foreground">Z</label>
                <input
                  className="w-16 rounded border border-border/50 bg-accent/50 px-1.5 py-0.5 text-foreground text-xs focus:border-primary focus:outline-none"
                  onChange={(e) =>
                    handlePointChange(index, 1, Number.parseFloat(e.target.value) || 0)
                  }
                  step={0.5}
                  type="number"
                  value={point[1]}
                />
                <button
                  className={cn(
                    'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded',
                    points.length > 3
                      ? 'text-muted-foreground hover:bg-red-500/20 hover:text-red-400'
                      : 'cursor-not-allowed text-muted-foreground/30',
                  )}
                  disabled={points.length <= 3}
                  onClick={() => handleDeletePoint(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            className="mt-1.5 flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent/50 hover:text-foreground"
            onClick={handleAddPoint}
          >
            <Plus className="h-3 w-3" />
            Add point
          </button>
        </div>
      )}
    </div>
  )
})

const SiteTerrainSection = memo(function SiteTerrainSection() {
  const siteNode = useSiteNode()
  const nodes = useScene((state) => state.nodes)
  const createNode = useScene((state) => state.createNode)
  const updateNode = useScene((state) => state.updateNode)
  const setSelection = useViewer((state) => state.setSelection)

  if (!siteNode) return null

  const terrains = siteNode.children
    .map((child) => {
      const id = typeof child === 'string' ? child : child.id
      return nodes[id as AnyNodeId] as TerrainNode | undefined
    })
    .filter((node): node is TerrainNode => node?.type === 'terrain')

  const handleGenerate = (preset: TerrainPreset) => {
    const existingTerrain = terrains[0]

    if (existingTerrain) {
      updateNode(existingTerrain.id, {
        name:
          preset === 'flat'
            ? 'Flat Site Terrain'
            : preset === 'gentle-slope'
              ? 'Gentle Slope Terrain'
              : 'Soft Hill Terrain',
        ...createTerrainMesh(existingTerrain.boundary ?? siteNode.polygon?.points ?? [], preset),
      })
      setSelection({ selectedIds: [existingTerrain.id] })
      return
    }

    const terrain = createGeneratedTerrainNode(siteNode, preset)
    createNode(terrain, siteNode.id)
    setSelection({ selectedIds: [terrain.id] })
  }

  return (
    <div className="border-border/50 border-b bg-sidebar">
      <div className="flex h-8 items-center justify-between border-border/50 border-b bg-muted/40 px-3">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
          <Mountain className="h-3.5 w-3.5" />
          <span>Terrain</span>
        </div>
        {terrains.length > 0 ? (
          <button
            className="flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-muted-foreground text-xs transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={() => setSelection({ selectedIds: [terrains[0]!.id] })}
            type="button"
          >
            Select
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
        <button
          className="flex h-7 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-card px-2 font-medium text-foreground text-xs transition-colors hover:bg-accent/55"
          onClick={() => handleGenerate('gentle-slope')}
          type="button"
        >
          Slope
        </button>
        <button
          className="flex h-7 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-card px-2 font-medium text-foreground text-xs transition-colors hover:bg-accent/55"
          onClick={() => handleGenerate('soft-hill')}
          type="button"
        >
          Hill
        </button>
        <button
          className="flex h-7 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-card px-2 font-medium text-foreground text-xs transition-colors hover:bg-accent/55"
          onClick={() => handleGenerate('flat')}
          type="button"
        >
          Flat
        </button>
      </div>
    </div>
  )
})

type LandscapePreset = 'garden' | 'mountain'

type LandscapePlacement = {
  assetId: string
  name: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

const GENERATED_LANDSCAPE_METADATA_KEY = 'siteLandscapeGenerated'

function isGeneratedLandscapeNode(node: AnyNode | undefined): node is AnyNode {
  if (node?.type !== 'item') return false
  const metadata = node.metadata
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>)[GENERATED_LANDSCAPE_METADATA_KEY] === true
  )
}

function createLandscapePlacements(
  siteNode: SiteNode,
  preset: LandscapePreset,
): LandscapePlacement[] {
  const bounds = getPolygonBounds(siteNode.polygon?.points ?? [])
  const insetX = Math.min(Math.max(bounds.width * 0.1, 1.4), 3)
  const insetZ = Math.min(Math.max(bounds.depth * 0.1, 1.4), 3)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const leftX = bounds.minX + insetX
  const rightX = bounds.maxX - insetX
  const frontZ = bounds.minZ + insetZ
  const backZ = bounds.maxZ - insetZ

  if (preset === 'mountain') {
    return [
      {
        assetId: 'fir-tree',
        name: 'Back Hill Fir',
        position: [leftX, 0, backZ],
        scale: [1.2, 1.2, 1.2],
      },
      {
        assetId: 'cypress-tree',
        name: 'Back Hill Cypress',
        position: [centerX - bounds.width * 0.18, 0, backZ - 0.7],
        scale: [1.15, 1.15, 1.15],
      },
      {
        assetId: 'shade-tree',
        name: 'Back Hill Shade Tree',
        position: [centerX + bounds.width * 0.14, 0, backZ - 1],
        scale: [1.05, 1.05, 1.05],
      },
      {
        assetId: 'fir-tree',
        name: 'Back Hill Fir',
        position: [rightX, 0, backZ - 0.4],
        scale: [1.35, 1.35, 1.35],
      },
      {
        assetId: 'round-shrub',
        name: 'Hill Shrub',
        position: [leftX + bounds.width * 0.18, 0, centerZ + bounds.depth * 0.18],
      },
      {
        assetId: 'grass-clump',
        name: 'Hill Grass',
        position: [rightX - bounds.width * 0.15, 0, centerZ + bounds.depth * 0.2],
      },
    ]
  }

  return [
    {
      assetId: 'shade-tree',
      name: 'Garden Shade Tree',
      position: [leftX, 0, backZ],
    },
    {
      assetId: 'small-ornamental-tree',
      name: 'Ornamental Tree',
      position: [rightX, 0, backZ - bounds.depth * 0.12],
    },
    {
      assetId: 'flowering-bush',
      name: 'Flowering Bush',
      position: [leftX + bounds.width * 0.18, 0, frontZ],
    },
    {
      assetId: 'round-shrub',
      name: 'Round Shrub',
      position: [rightX - bounds.width * 0.14, 0, frontZ + bounds.depth * 0.08],
    },
    {
      assetId: 'rectangular-flower-bed',
      name: 'Flower Bed',
      position: [centerX, 0, frontZ],
    },
    {
      assetId: 'hedge-row',
      name: 'Hedge Row',
      position: [leftX, 0, centerZ],
      rotation: [0, Math.PI / 2, 0],
    },
    {
      assetId: 'hedge-row',
      name: 'Hedge Row',
      position: [rightX, 0, centerZ],
      rotation: [0, Math.PI / 2, 0],
    },
    {
      assetId: 'entry-planter-pair',
      name: 'Entry Planters',
      position: [centerX, 0, frontZ + bounds.depth * 0.16],
    },
  ]
}

const SiteLandscapeSection = memo(function SiteLandscapeSection() {
  const siteNode = useSiteNode()
  const nodes = useScene((state) => state.nodes)
  const createNode = useScene((state) => state.createNode)
  const updateNode = useScene((state) => state.updateNode)
  const deleteNodes = useScene((state) => state.deleteNodes)
  const setSelection = useViewer((state) => state.setSelection)

  if (!siteNode) return null

  const siteChildren = siteNode.children
    .map((child) => {
      const id = typeof child === 'string' ? child : child.id
      return nodes[id as AnyNodeId]
    })
    .filter(Boolean)

  const generatedLandscapeIds = siteChildren
    .filter(isGeneratedLandscapeNode)
    .map((node) => node.id as AnyNodeId)

  const terrains = siteChildren.filter((node): node is TerrainNode => node?.type === 'terrain')

  const clearGeneratedLandscape = () => {
    if (generatedLandscapeIds.length > 0) {
      deleteNodes(generatedLandscapeIds)
    }
  }

  const ensureMountainTerrain = () => {
    const existingTerrain = terrains[0]
    const mesh = createTerrainMesh(
      existingTerrain?.boundary ?? siteNode.polygon?.points ?? [],
      'soft-hill',
    )

    if (existingTerrain) {
      updateNode(existingTerrain.id, {
        name: 'Mountain View Terrain',
        ...mesh,
      })
      return existingTerrain.id
    }

    const terrain = createGeneratedTerrainNode(siteNode, 'soft-hill')
    createNode(
      {
        ...terrain,
        name: 'Mountain View Terrain',
      },
      siteNode.id,
    )
    return terrain.id
  }

  const handleGenerate = (preset: LandscapePreset) => {
    clearGeneratedLandscape()

    const selectedIds: AnyNodeId[] = []
    if (preset === 'mountain') {
      selectedIds.push(ensureMountainTerrain())
    }

    for (const placement of createLandscapePlacements(siteNode, preset)) {
      const asset = getCatalogAsset(placement.assetId)
      if (!asset) continue

      const node = ItemNode.parse({
        id: generateId('item'),
        type: 'item',
        name: placement.name,
        position: placement.position,
        rotation: placement.rotation ?? [0, 0, 0],
        scale: placement.scale ?? [1, 1, 1],
        children: [],
        parentId: siteNode.id,
        asset,
        metadata: {
          [GENERATED_LANDSCAPE_METADATA_KEY]: true,
          siteLandscapePreset: preset,
        },
      })

      createNode(node, siteNode.id)
      selectedIds.push(node.id)
    }

    if (selectedIds.length > 0) {
      setSelection({ selectedIds })
    }
  }

  return (
    <div className="border-border/50 border-b bg-sidebar">
      <div className="flex h-8 items-center justify-between border-border/50 border-b bg-muted/40 px-3">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
          <Trees className="h-3.5 w-3.5" />
          <span>Landscape</span>
        </div>
        {generatedLandscapeIds.length > 0 ? (
          <button
            className="flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-muted-foreground text-xs transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={clearGeneratedLandscape}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-3 py-2">
        <button
          className="flex h-7 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-card px-2 font-medium text-foreground text-xs transition-colors hover:bg-accent/55"
          onClick={() => handleGenerate('garden')}
          type="button"
        >
          庭院
        </button>
        <button
          className="flex h-7 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-card px-2 font-medium text-foreground text-xs transition-colors hover:bg-accent/55"
          onClick={() => handleGenerate('mountain')}
          type="button"
        >
          山景
        </button>
      </div>
    </div>
  )
})

// ============================================================================
// SITE PHASE VIEW - Property line + building buttons
// ============================================================================

const CameraPopover = memo(function CameraPopover({
  nodeId,
  hasCamera,
  open,
  onOpenChange,
  buttonClassName,
}: {
  nodeId: AnyNodeId
  hasCamera: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  buttonClassName?: string
}) {
  const updateNode = useScene((state) => state.updateNode)
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'relative flex h-6 w-6 cursor-pointer items-center justify-center rounded',
            buttonClassName,
          )}
          onClick={(e) => e.stopPropagation()}
          title="Camera snapshot"
        >
          <Camera className="h-3.5 w-3.5" />
          {hasCamera && (
            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-1"
        onClick={(e) => e.stopPropagation()}
        side="right"
      >
        <div className="flex flex-col gap-0.5">
          {hasCamera && (
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation()
                emitter.emit('camera-controls:view', { nodeId })
                onOpenChange(false)
              }}
            >
              <Camera className="h-3.5 w-3.5" />
              View snapshot
            </button>
          )}
          <button
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation()
              emitter.emit('camera-controls:capture', { nodeId })
              onOpenChange(false)
            }}
          >
            <Camera className="h-3.5 w-3.5" />
            {hasCamera ? 'Update snapshot' : 'Take snapshot'}
          </button>
          {hasCamera && (
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation()
                updateNode(nodeId, { camera: undefined })
                onOpenChange(false)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear snapshot
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})

const ReferenceItem = memo(function ReferenceItem({
  refNode,
  isLastRow,
  setSelectedReferenceId,
  handleDelete,
}: {
  refNode: ScanNode | GuideNode
  isLastRow: boolean
  setSelectedReferenceId: (id: string) => void
  handleDelete: (id: string, e: React.MouseEvent) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const handleSelect = () => {
    setSelectedReferenceId(refNode.id)
  }

  const handleDoubleClick = () => {
    focusTreeNode(refNode.id as AnyNodeId)
  }

  return (
    <div
      className="group/ref relative flex h-8 cursor-pointer select-none items-center border-border/50 border-b pr-2 text-xs transition-colors hover:bg-accent/30"
      onClick={handleSelect}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className={cn(
          'pointer-events-none absolute z-10 w-px bg-border/50',
          isLastRow ? 'top-0 bottom-1/2' : 'top-0 bottom-0',
        )}
        style={{ left: 45 }}
      />
      <div
        className="pointer-events-none absolute top-1/2 z-10 h-px bg-border/50"
        style={{ left: 45, width: 8 }}
      />

      <div className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 py-0 pl-[60px] text-muted-foreground group-hover/ref:text-foreground">
        {refNode.type === 'scan' ? (
          <Box aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />
        ) : (
          <FileImage aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />
        )}
        <InlineRenameInput
          defaultName={refNode.type === 'scan' ? '3D Scan' : 'Guide Image'}
          isEditing={isEditing}
          nodeId={refNode.id}
          onStartEditing={() => setIsEditing(true)}
          onStopEditing={() => setIsEditing(false)}
        />
      </div>

      <button
        className="z-20 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-black/5 hover:text-foreground group-hover/ref:opacity-100 dark:hover:bg-white/10"
        onClick={(e) => handleDelete(refNode.id, e)}
        title="Delete"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
})

const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB

interface LevelReferencesProps {
  levelId: string
  isLastLevel?: boolean
  projectId?: string
  onUploadAsset?: (projectId: string, levelId: string, file: File, type: 'scan' | 'guide') => void
  onDeleteAsset?: (projectId: string, url: string) => void
}

function isDeletableAssetUrl(projectId: string, url: string): boolean {
  return (
    url.startsWith(`/__findtop__/projects/${encodeURIComponent(projectId)}/assets/`) ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  )
}

const LevelReferences = memo(function LevelReferences({
  levelId,
  isLastLevel,
  projectId,
  onUploadAsset,
  onDeleteAsset,
}: LevelReferencesProps) {
  const deleteNode = useScene((s) => s.deleteNode)
  const references = useScene(
    useShallow((s) =>
      Object.values(s.nodes).filter(
        (node): node is ScanNode | GuideNode =>
          (node.type === 'scan' || node.type === 'guide') && node.parentId === levelId,
      ),
    ),
  )
  const setSelectedReferenceId = useEditor((s) => s.setSelectedReferenceId)
  const uploadState = useUploadStore((s) => s.uploads[levelId])
  const clearUpload = useUploadStore((s) => s.clearUpload)

  const uploading =
    uploadState?.status === 'preparing' ||
    uploadState?.status === 'uploading' ||
    uploadState?.status === 'confirming'
  const uploadingType = uploadState?.assetType ?? null
  const uploadError = uploadState?.error ?? null
  const progress = uploadState?.progress ?? 0

  const scanInputRef = useRef<HTMLInputElement>(null)

  const handleAddAsset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!projectId) {
      useUploadStore.getState().startUpload(levelId, 'scan', file.name)
      useUploadStore.getState().setError(levelId, 'No active project. Please open a project first.')
      return
    }

    if (!onUploadAsset) {
      useUploadStore.getState().startUpload(levelId, 'scan', file.name)
      useUploadStore
        .getState()
        .setError(levelId, 'Uploads are unavailable in this environment.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      useUploadStore.getState().startUpload(levelId, 'scan', file.name)
      useUploadStore
        .getState()
        .setError(
          levelId,
          `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum size is 200 MB.`,
        )
      return
    }

    // Auto-detect type based on file extension/mime type
    const isScan =
      file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')
    const isImage = file.type.startsWith('image/')
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

    if (!(isScan || isImage || isPdf)) {
      useUploadStore.getState().startUpload(levelId, 'scan', file.name)
      useUploadStore
        .getState()
        .setError(levelId, 'Invalid file type. Please upload a .glb/.gltf scan, an image, or a PDF.')
      return
    }

    const type = isScan ? 'scan' : 'guide'

    clearUpload(levelId)
    onUploadAsset?.(projectId, levelId, file, type)
  }

  const handleDelete = async (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const refNode = useScene.getState().nodes[nodeId as AnyNodeId] as
      | ScanNode
      | GuideNode
      | undefined

    if (
      projectId &&
      refNode?.url &&
      isDeletableAssetUrl(projectId, refNode.url)
    ) {
      onDeleteAsset?.(projectId, refNode.url)
    }
    deleteNode(nodeId as AnyNodeId)
  }

  const rows = [
    { type: 'upload' as const },
    ...references.map((ref) => ({ type: 'ref' as const, data: ref })),
  ]

  return (
    <div className="relative flex flex-col">
      {!isLastLevel && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-border/50"
          style={{ left: 21 }}
        />
      )}

      {rows.map((row, i) => {
        const isLastRow = i === rows.length - 1

        if (row.type === 'upload') {
          return (
            <div className="group/ref relative border-border/50 border-b" key="upload">
              <div
                className={cn(
                  'pointer-events-none absolute z-10 w-px bg-border/50',
                  isLastRow ? 'top-0 bottom-1/2' : 'top-0 bottom-0',
                )}
                style={{ left: 45 }}
              />
              <div
                className="pointer-events-none absolute top-1/2 z-10 h-px bg-border/50"
                style={{ left: 45, width: 8 }}
              />

              <button
                className="flex h-8 w-full cursor-pointer select-none items-center gap-2 py-0 pr-2 pl-[60px] text-left text-muted-foreground text-xs transition-colors hover:bg-accent/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                disabled={uploading}
                onClick={() => scanInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {uploading ? `Uploading ${uploadingType}... ${progress}%` : 'Upload scan/floorplan'}
              </button>

              <input
                accept=".glb,.gltf,.pdf,image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAddAsset}
                ref={scanInputRef}
                type="file"
              />
            </div>
          )
        }

        const ref = row.data as ScanNode | GuideNode
        return (
          <ReferenceItem
            handleDelete={handleDelete}
            isLastRow={isLastRow}
            key={ref.id}
            refNode={ref}
            setSelectedReferenceId={setSelectedReferenceId}
          />
        )
      })}

      {uploadError && (
        <div className="relative flex min-h-8 select-none items-center border-border/50 border-b bg-destructive/5 py-1 pr-2 pl-[60px] text-[10px] text-destructive">
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-border/50"
            style={{ left: 45 }}
          />
          {uploadError}
        </div>
      )}
    </div>
  )
})

const LevelItem = memo(function LevelItem({
  level,
  selectedLevelId,
  setSelection,
  updateNode,
  isLast,
  projectId,
  onUploadAsset,
  onDeleteAsset,
}: {
  level: LevelNode
  selectedLevelId: string | null
  setSelection: (selection: any) => void
  updateNode: (id: AnyNodeId, updates: Partial<AnyNode>) => void
  isLast?: boolean
  projectId?: string
  onUploadAsset?: (projectId: string, levelId: string, file: File, type: 'scan' | 'guide') => void
  onDeleteAsset?: (projectId: string, url: string) => void
}) {
  const [cameraPopoverOpen, setCameraPopoverOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)
  const isSelected = selectedLevelId === level.id
  const canDeleteLevel = level.level !== 0
  const [isExpanded, setIsExpanded] = useState(isSelected)

  useEffect(() => {
    setIsExpanded(isSelected)
  }, [isSelected])

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isSelected])

  const handleSelect = () => {
    setSelection({ levelId: level.id })
  }

  const handleDoubleClick = () => {
    focusTreeNode(level.id)
  }

  return (
    <div className="relative flex flex-col">
      <div
        className={cn(
          'group/level relative flex h-8 cursor-pointer select-none items-center border-border/50 border-b pr-2 transition-all duration-200',
          isSelected
            ? 'bg-primary/10 text-foreground'
            : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
        )}
        onClick={handleSelect}
        onDoubleClick={handleDoubleClick}
        ref={itemRef}
      >
        {/* Vertical tree line */}
        <div
          className={cn(
            'pointer-events-none absolute left-[21px] z-10 w-px bg-border/50',
            isLast && !isExpanded ? 'top-0 bottom-1/2' : 'top-0 bottom-0',
          )}
        />
        {/* Horizontal branch line */}
        <div className="pointer-events-none absolute top-1/2 left-[21px] z-10 h-px w-[11px] bg-border/50" />
        <div
          className={cn(
            'pointer-events-none absolute top-[10px] left-[32px] z-10 h-[12px] w-4 transition-colors duration-200',
            isSelected ? 'bg-primary/10' : 'bg-background group-hover/level:bg-accent/30',
          )}
        />
        {/* Line down to children */}
        {isExpanded && (
          <div className="pointer-events-none absolute top-[16px] bottom-0 left-[45px] z-10 w-px bg-border/50" />
        )}

        <div className="relative z-20 flex h-8 items-center pr-1 pl-[28px]">
          <button
            className="z-20 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center bg-inherit"
            onClick={(e) => {
              e.stopPropagation()
              if (isSelected) {
                setIsExpanded(!isExpanded)
              } else {
                setSelection({ levelId: level.id })
              }
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 -rotate-90 text-muted-foreground" />
            )}
          </button>
        </div>

        <div className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 py-0 pl-0.5 text-sm">
          <Layers
            aria-hidden="true"
            className={cn(
              'h-4 w-4 shrink-0 stroke-[1.9] transition-colors duration-200',
              isSelected ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <InlineRenameInput
            defaultName={`Level ${level.level}`}
            isEditing={isEditing}
            nodeId={level.id}
            onStartEditing={() => setIsEditing(true)}
            onStopEditing={() => setIsEditing(false)}
          />
        </div>
        {/* Camera snapshot button */}
        <Popover onOpenChange={setCameraPopoverOpen} open={cameraPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'relative mr-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-colors group-hover/level:opacity-100',
                selectedLevelId === level.id
                  ? 'hover:bg-black/5 dark:hover:bg-white/10'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              onClick={(e) => e.stopPropagation()}
              title="Camera snapshot"
            >
              <Camera className="h-3.5 w-3.5" />
              {level.camera && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto p-1"
            onClick={(e) => e.stopPropagation()}
            side="right"
          >
            <div className="flex flex-col gap-0.5">
              {level.camera && (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    emitter.emit('camera-controls:view', { nodeId: level.id })
                    setCameraPopoverOpen(false)
                  }}
                >
                  <Camera className="h-3.5 w-3.5" />
                  View snapshot
                </button>
              )}
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation()
                  emitter.emit('camera-controls:capture', { nodeId: level.id })
                  setCameraPopoverOpen(false)
                }}
              >
                <Camera className="h-3.5 w-3.5" />
                {level.camera ? 'Update snapshot' : 'Take snapshot'}
              </button>
              {level.camera && (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    updateNode(level.id, { camera: undefined })
                    setCameraPopoverOpen(false)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear snapshot
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'mr-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-colors group-hover/level:opacity-100',
                selectedLevelId === level.id
                  ? 'hover:bg-black/5 dark:hover:bg-white/10'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-40 p-1" side="right">
            <button
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors enabled:cursor-pointer enabled:hover:bg-accent enabled:hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canDeleteLevel}
              onClick={() => deleteLevelWithFallbackSelection(level.id)}
              title={canDeleteLevel ? 'Delete level' : 'The ground level cannot be deleted'}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </PopoverContent>
        </Popover>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          >
            <LevelReferences
              isLastLevel={isLast}
              levelId={level.id}
              onDeleteAsset={onDeleteAsset}
              onUploadAsset={onUploadAsset}
              projectId={projectId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

const LevelsSection = memo(function LevelsSection({
  projectId,
  onUploadAsset,
  onDeleteAsset,
}: {
  projectId?: string
  onUploadAsset?: (projectId: string, levelId: string, file: File, type: 'scan' | 'guide') => void
  onDeleteAsset?: (projectId: string, url: string) => void
} = {}) {
  const createNode = useScene((state) => state.createNode)
  const updateNode = useScene((state) => state.updateNode)
  const selectedBuildingId = useViewer((state) => state.selection.buildingId)
  const selectedLevelId = useViewer((state) => state.selection.levelId)
  const setSelection = useViewer((state) => state.setSelection)

  const building = useScene((s) =>
    selectedBuildingId ? ((s.nodes[selectedBuildingId] as BuildingNode | undefined) ?? null) : null,
  )
  const levels = useScene(
    useShallow((s) => {
      if (!selectedBuildingId) return []
      const bldg = s.nodes[selectedBuildingId] as BuildingNode | undefined
      if (!bldg) return []
      return bldg.children
        .map((id) => s.nodes[id])
        .filter((node): node is LevelNode => node?.type === 'level')
    }),
  )

  if (!building) return null

  const handleAddLevel = () => {
    const newLevel = LevelNode.parse({
      level: levels.length,
      children: [],
      parentId: building.id,
    })
    createNode(newLevel, building.id)
    setSelection({ levelId: newLevel.id })
  }

  return (
    <div className="relative flex flex-col">
      {/* Level buttons */}
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          className="relative flex h-8 cursor-pointer select-none items-center gap-2 border-border/50 border-b py-0 pl-0 text-muted-foreground text-sm transition-all duration-200 hover:bg-accent/30 hover:text-foreground"
          onClick={handleAddLevel}
        >
          {/* Vertical tree line */}
          <div className="pointer-events-none absolute top-0 bottom-0 left-[21px] w-px bg-border/50" />
          {/* Horizontal branch line */}
          <div className="pointer-events-none absolute top-1/2 left-[21px] z-10 h-px w-[11px] bg-border/50" />

          <div className="relative z-10 flex items-center pr-1 pl-[38px]">
            <Plus className="h-3.5 w-3.5" />
          </div>
          <span className="truncate">Add level</span>
        </button>
        {levels.length === 0 && (
          <div className="relative flex h-9 select-none items-center border-border/50 border-b py-0 pr-2 pl-[38px] text-muted-foreground text-xs">
            {/* Vertical tree line */}
            <div className="pointer-events-none absolute top-0 bottom-1/2 left-[21px] w-px bg-border/50" />
            {/* Horizontal branch line */}
            <div className="pointer-events-none absolute top-1/2 left-[21px] h-px w-[11px] bg-border/50" />
            <span className="rounded-md border border-dashed border-border/70 bg-muted/30 px-2 py-1">
              No levels yet
            </span>
          </div>
        )}
        {[...levels].reverse().map((level, index) => (
          <LevelItem
            isLast={index === levels.length - 1}
            key={level.id}
            level={level}
            onDeleteAsset={onDeleteAsset}
            onUploadAsset={onUploadAsset}
            projectId={projectId}
            selectedLevelId={selectedLevelId}
            setSelection={setSelection}
            updateNode={updateNode}
          />
        ))}
      </div>
    </div>
  )
})

const OrientationToggleButton = memo(function OrientationToggleButton({
  isOpen,
  onClick,
  title,
}: {
  isOpen: boolean
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  title: string
}) {
  return (
    <button
      aria-pressed={isOpen}
      className={cn(
        'flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        isOpen && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
      )}
      onClick={onClick}
      onDoubleClick={(event) => event.stopPropagation()}
      title={title}
      type="button"
    >
      <Compass className="h-3.5 w-3.5" />
    </button>
  )
})

const OrientationSettingsSection = memo(function OrientationSettingsSection({
  title,
  currentDegrees,
  onChange,
}: {
  title: string
  currentDegrees: number
  onChange: (degrees: number) => void
}) {
  const orientationText = getOrientationText(currentDegrees)

  const handleStepChange = (deltaDegrees: number) => {
    onChange(currentDegrees + deltaDegrees)
  }

  return (
    <div className="relative border-border/50 border-b px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Compass className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium text-xs">{title}</span>
        </div>
        <span className="font-mono text-foreground text-xs tabular-nums">
          {currentDegrees.toFixed(1)}°
        </span>
      </div>
      <div className="mb-2 truncate text-muted-foreground text-xs">{orientationText}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {ORIENTATION_OPTIONS.map((option) => {
          const isActive = getCircularDegreeDistance(currentDegrees, option.degrees) < 0.05

          return (
            <button
              className={cn(
                'flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md border text-xs transition-colors',
                isActive
                  ? 'border-primary/35 bg-primary/10 text-primary'
                  : 'border-border/55 bg-card text-muted-foreground hover:bg-accent/55 hover:text-foreground',
              )}
              key={option.shortLabel}
              onClick={() => onChange(option.degrees)}
              title={`${option.label} ${option.degrees}°`}
              type="button"
            >
              <span className="font-mono font-semibold">{option.shortLabel}</span>
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {ORIENTATION_STEPS.map((step) => (
          <button
            className="flex h-7 cursor-pointer items-center justify-center rounded-md border border-border/55 bg-card font-mono text-muted-foreground text-xs tabular-nums transition-colors hover:bg-accent/55 hover:text-foreground"
            key={step}
            onClick={() => handleStepChange(step)}
            title={`${step > 0 ? '+' : ''}${step}°`}
            type="button"
          >
            {step > 0 ? '+' : ''}
            {step}°
          </button>
        ))}
      </div>
      <MetricControl
        className="mt-2 h-9"
        label="角度"
        max={359.9}
        min={0}
        onChange={onChange}
        precision={1}
        step={1}
        unit="°"
        value={currentDegrees}
      />
    </div>
  )
})

const SiteOrientationSection = memo(function SiteOrientationSection({ site }: { site: SiteNode }) {
  const updateNode = useScene((state) => state.updateNode)
  const currentDegrees = getSiteOrientationDegrees(site)

  const handleOrientationChange = (degrees: number) => {
    updateNode(site.id, {
      metadata: withSiteOrientationDegrees(site, degrees),
    })
  }

  return (
    <OrientationSettingsSection
      currentDegrees={currentDegrees}
      onChange={handleOrientationChange}
      title="场地朝向"
    />
  )
})

function formatOptionalNumber(value: number | undefined, precision: number) {
  if (typeof value !== 'number') return ''

  return value
    .toFixed(precision)
    .replace(/\.?0+$/, '')
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const SiteSolarLocationSection = memo(function SiteSolarLocationSection({ site }: { site: SiteNode }) {
  const updateNode = useScene((state) => state.updateNode)
  const solarLocation = getSiteSolarLocation(site)
  const resolvedSolarLocation = resolveSiteSolarLocation(site)
  const browserTimeZone = getBrowserTimeZone()

  const [latitudeInput, setLatitudeInput] = useState(formatOptionalNumber(solarLocation.latitude, 6))
  const [longitudeInput, setLongitudeInput] = useState(
    formatOptionalNumber(solarLocation.longitude, 6),
  )
  const [timezoneInput, setTimezoneInput] = useState(solarLocation.timezone ?? '')
  const [elevationInput, setElevationInput] = useState(
    formatOptionalNumber(solarLocation.elevationMeters, 2),
  )

  useEffect(() => {
    setLatitudeInput(formatOptionalNumber(solarLocation.latitude, 6))
  }, [solarLocation.latitude])

  useEffect(() => {
    setLongitudeInput(formatOptionalNumber(solarLocation.longitude, 6))
  }, [solarLocation.longitude])

  useEffect(() => {
    setTimezoneInput(solarLocation.timezone ?? '')
  }, [solarLocation.timezone])

  useEffect(() => {
    setElevationInput(formatOptionalNumber(solarLocation.elevationMeters, 2))
  }, [solarLocation.elevationMeters])

  const parsedLatitude = parseOptionalNumber(latitudeInput)
  const parsedLongitude = parseOptionalNumber(longitudeInput)
  const parsedElevation = parseOptionalNumber(elevationInput)
  const trimmedTimezone = timezoneInput.trim()

  const latitudeError =
    parsedLatitude === null || (typeof parsedLatitude === 'number' && (parsedLatitude < -90 || parsedLatitude > 90))
  const longitudeError =
    parsedLongitude === null ||
    (typeof parsedLongitude === 'number' && (parsedLongitude < -180 || parsedLongitude > 180))
  const elevationError = parsedElevation === null
  const timezoneError = trimmedTimezone.length > 0 && !isValidTimeZone(trimmedTimezone)

  const handleNumberCommit = (
    key: 'latitude' | 'longitude' | 'elevationMeters',
    rawValue: string,
    isInvalid: boolean,
  ) => {
    if (isInvalid) return

    const parsedValue = parseOptionalNumber(rawValue)
    updateNode(site.id, {
      metadata: withSiteSolarLocation(site, {
        [key]: typeof parsedValue === 'number' ? parsedValue : undefined,
      }),
    })
  }

  const handleTimezoneCommit = () => {
    if (timezoneError) return

    updateNode(site.id, {
      metadata: withSiteSolarLocation(site, {
        timezone: trimmedTimezone || undefined,
      }),
    })
  }

  const handleFieldKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    onCommit: () => void,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onCommit()
      event.currentTarget.blur()
    }
  }

  return (
    <div className="relative border-border/50 border-b px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <SunMedium className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium text-xs">位置与日照</span>
        </div>
        <button
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground"
          onClick={() => {
            setTimezoneInput(browserTimeZone)
            updateNode(site.id, {
              metadata: withSiteSolarLocation(site, { timezone: browserTimeZone }),
            })
          }}
          type="button"
        >
          当前时区
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">纬度</span>
          <Input
            aria-invalid={latitudeError}
            className="h-8 text-xs"
            inputMode="decimal"
            onBlur={() => handleNumberCommit('latitude', latitudeInput, latitudeError)}
            onChange={(event) => setLatitudeInput(event.target.value)}
            onKeyDown={(event) =>
              handleFieldKeyDown(event, () =>
                handleNumberCommit('latitude', latitudeInput, latitudeError),
              )
            }
            placeholder="31.2304"
            type="text"
            value={latitudeInput}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">经度</span>
          <Input
            aria-invalid={longitudeError}
            className="h-8 text-xs"
            inputMode="decimal"
            onBlur={() => handleNumberCommit('longitude', longitudeInput, longitudeError)}
            onChange={(event) => setLongitudeInput(event.target.value)}
            onKeyDown={(event) =>
              handleFieldKeyDown(event, () =>
                handleNumberCommit('longitude', longitudeInput, longitudeError),
              )
            }
            placeholder="121.4737"
            type="text"
            value={longitudeInput}
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_96px] gap-2">
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">时区</span>
          <Input
            aria-invalid={timezoneError}
            className="h-8 text-xs"
            onBlur={handleTimezoneCommit}
            onChange={(event) => setTimezoneInput(event.target.value)}
            onKeyDown={(event) => handleFieldKeyDown(event, handleTimezoneCommit)}
            placeholder={browserTimeZone}
            type="text"
            value={timezoneInput}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">海拔(m)</span>
          <Input
            aria-invalid={elevationError}
            className="h-8 text-xs"
            inputMode="decimal"
            onBlur={() => handleNumberCommit('elevationMeters', elevationInput, elevationError)}
            onChange={(event) => setElevationInput(event.target.value)}
            onKeyDown={(event) =>
              handleFieldKeyDown(event, () =>
                handleNumberCommit('elevationMeters', elevationInput, elevationError),
              )
            }
            placeholder="4"
            type="text"
            value={elevationInput}
          />
        </label>
      </div>
      <div className="mt-2 space-y-1 text-[11px]">
        {latitudeError ? <div className="text-destructive">纬度必须在 -90 到 90 之间。</div> : null}
        {longitudeError ? <div className="text-destructive">经度必须在 -180 到 180 之间。</div> : null}
        {timezoneError ? <div className="text-destructive">时区必须是有效的 IANA 时区，例如 `Asia/Shanghai`。</div> : null}
        {resolvedSolarLocation ? (
          <div className="text-muted-foreground">
            真实日照已可用：{resolvedSolarLocation.latitude.toFixed(4)}°,{' '}
            {resolvedSolarLocation.longitude.toFixed(4)}° · {resolvedSolarLocation.timezone}
          </div>
        ) : (
          <div className="text-muted-foreground">真实日照需要纬度、经度和有效时区。</div>
        )}
      </div>
    </div>
  )
})

const SITE_SETBACK_FIELDS: Array<{
  key: SiteSetbackRuleKey
  label: string
}> = [
  { key: 'front', label: '前退距' },
  { key: 'back', label: '后退距' },
  { key: 'left', label: '左退距' },
  { key: 'right', label: '右退距' },
]

const SiteSetbackRuleSection = memo(function SiteSetbackRuleSection({ site }: { site: SiteNode }) {
  const updateNode = useScene((state) => state.updateNode)
  const rules = getSiteSetbackRules(site)

  const handleRuleChange = (key: SiteSetbackRuleKey, value: number) => {
    updateNode(site.id, {
      metadata: withSiteSetbackRule(site, key, value),
    })
  }

  return (
    <div className="relative border-border/50 border-b px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium text-xs">目标退距规则</span>
        </div>
        <span className="text-[10px] text-muted-foreground">0 表示不启用</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SITE_SETBACK_FIELDS.map((field) => (
          <MetricControl
            className="h-9"
            key={field.key}
            label={field.label}
            min={0}
            onChange={(value) => handleRuleChange(field.key, value)}
            precision={2}
            step={0.1}
            unit="m"
            value={rules[field.key] ?? 0}
          />
        ))}
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        3D 测量的周长模式会按场地朝向检查前后左右退距，低于目标值时直接给出规则告警。
      </div>
    </div>
  )
})

const BuildingOrientationSection = memo(function BuildingOrientationSection({
  building,
}: {
  building: BuildingNode
}) {
  const updateNode = useScene((state) => state.updateNode)
  const currentDegrees = radiansToDegrees(building.rotation[1] ?? 0)

  const handleOrientationChange = (degrees: number) => {
    updateNode(building.id, {
      rotation: [
        building.rotation[0] ?? 0,
        degreesToRadians(degrees),
        building.rotation[2] ?? 0,
      ],
    })
  }

  return (
    <OrientationSettingsSection
      currentDegrees={currentDegrees}
      onChange={handleOrientationChange}
      title="建筑朝向"
    />
  )
})

const LayerToggle = memo(function LayerToggle() {
  const structureLayer = useEditor((state) => state.structureLayer)
  const setStructureLayer = useEditor((state) => state.setStructureLayer)
  const phase = useEditor((state) => state.phase)
  const setPhase = useEditor((state) => state.setPhase)

  const activeTab =
    phase === 'structure' && structureLayer === 'elements'
      ? 'structure'
      : phase === 'furnish'
        ? 'furnish'
        : phase === 'structure' && structureLayer === 'zones'
          ? 'zones'
          : 'none'

  return (
    <div className="relative flex items-center gap-1 border-border/50 border-b bg-muted/70 p-1.5">
      <button
        className={cn(
          'relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-md py-2 font-semibold text-[10px] transition-all duration-200',
          activeTab === 'structure'
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-background/80 hover:text-foreground',
        )}
        onClick={() => {
          setPhase('structure')
          setStructureLayer('elements')
        }}
      >
        {activeTab === 'structure' && (
          <motion.div
            className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-primary/20"
            layoutId="layerToggleActiveBg"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <BrickWall
            aria-hidden="true"
            className={cn(
              'mb-1 h-5 w-5 stroke-[1.9] transition-colors',
              activeTab === 'structure' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          Structure
        </div>
        <div className="absolute right-1.5 bottom-1 z-10 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
          <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
            B
          </span>
        </div>
      </button>

      <button
        className={cn(
          'relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-md py-2 font-semibold text-[10px] transition-all duration-200',
          activeTab === 'furnish'
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-background/80 hover:text-foreground',
        )}
        onClick={() => {
          setPhase('furnish')
        }}
      >
        {activeTab === 'furnish' && (
          <motion.div
            className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-primary/20"
            layoutId="layerToggleActiveBg"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <Sofa
            aria-hidden="true"
            className={cn(
              'mb-1 h-5 w-5 stroke-[1.9] transition-colors',
              activeTab === 'furnish' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          Furnish
        </div>
        <div className="absolute right-1.5 bottom-1 z-10 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
          <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
            F
          </span>
        </div>
      </button>

      <button
        className={cn(
          'relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-md py-2 font-semibold text-[10px] transition-all duration-200',
          activeTab === 'zones'
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-background/80 hover:text-foreground',
        )}
        onClick={() => {
          setPhase('structure')
          setStructureLayer('zones')
        }}
      >
        {activeTab === 'zones' && (
          <motion.div
            className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-primary/20"
            layoutId="layerToggleActiveBg"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <Shapes
            aria-hidden="true"
            className={cn(
              'mb-1 h-5 w-5 stroke-[1.9] transition-colors',
              activeTab === 'zones' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          Zones
        </div>
        <div className="absolute right-1.5 bottom-1 z-10 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
          <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
            Z
          </span>
        </div>
      </button>
    </div>
  )
})

const ZoneItem = memo(function ZoneItem({ zone, isLast }: { zone: ZoneNode; isLast?: boolean }) {
  const [isEditing, setIsEditing] = useState(false)
  const [cameraPopoverOpen, setCameraPopoverOpen] = useState(false)
  const deleteNode = useScene((state) => state.deleteNode)
  const updateNode = useScene((state) => state.updateNode)
  const selectedZoneId = useViewer((state) => state.selection.zoneId)
  const hoveredId = useViewer((state) => state.hoveredId)
  const setSelection = useViewer((state) => state.setSelection)
  const setHoveredId = useViewer((state) => state.setHoveredId)
  const setPhase = useEditor((state) => state.setPhase)
  const setMode = useEditor((state) => state.setMode)

  const isSelected = selectedZoneId === zone.id
  const isHovered = hoveredId === zone.id
  const isLabelHidden = isZoneLabelHidden(zone)

  const itemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isSelected])

  const area = calculatePolygonArea(zone.polygon).toFixed(1)
  const defaultName = `Zone (${area}m²)`

  const handleClick = () => {
    setSelection({ zoneId: zone.id })
    setPhase('structure')
    setMode('select')
  }

  const handleDoubleClick = () => {
    focusTreeNode(zone.id)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteNode(zone.id)
    if (isSelected) {
      setSelection({ zoneId: null })
    }
  }

  const handleColorChange = (color: string) => {
    updateNode(zone.id, { color })
  }

  const handleToggleLabel = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNode(zone.id, {
      metadata: withZoneLabelHidden(zone, !isLabelHidden),
    })
  }

  return (
    <div
      className={cn(
        'group/row relative flex h-8 cursor-pointer select-none items-center border-border/50 border-b px-3 text-sm transition-all duration-200',
        isSelected
          ? 'bg-primary/10 text-foreground'
          : isHovered
            ? 'bg-accent/30 text-foreground'
            : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHoveredId(zone.id)}
      onMouseLeave={() => setHoveredId(null)}
      ref={itemRef}
    >
      {/* Vertical tree line */}
      <div
        className={cn(
          'pointer-events-none absolute w-px bg-border/50',
          isLast ? 'top-0 bottom-1/2' : 'top-0 bottom-0',
        )}
        style={{ left: 8 }}
      />
      {/* Horizontal branch line */}
      <div
        className="pointer-events-none absolute top-1/2 h-px bg-border/50"
        style={{ left: 8, width: 4 }}
      />

      <span className={cn('mr-2', !isSelected && 'opacity-40')}>
        <ColorDot color={zone.color} onChange={handleColorChange} />
      </span>
      <div className="min-w-0 flex-1 pr-1">
        <div className={cn(isLabelHidden && 'text-muted-foreground line-through')}>
          <InlineRenameInput
            defaultName={defaultName}
            isEditing={isEditing}
            nodeId={zone.id}
            onStartEditing={() => setIsEditing(true)}
            onStopEditing={() => setIsEditing(false)}
          />
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          aria-label={isLabelHidden ? 'Show label' : 'Hide label'}
          className={cn(
            'flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-black/5 hover:text-foreground group-hover/row:opacity-100 dark:hover:bg-white/10',
            isLabelHidden && 'opacity-100',
          )}
          onClick={handleToggleLabel}
          title={isLabelHidden ? 'Show label' : 'Hide label'}
          type="button"
        >
          {isLabelHidden ? (
            <EyeOff className="h-3 w-3 opacity-50" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </button>
        {/* Camera snapshot button */}
        <Popover onOpenChange={setCameraPopoverOpen} open={cameraPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-black/5 hover:text-foreground group-hover/row:opacity-100 dark:hover:bg-white/10"
              onClick={(e) => e.stopPropagation()}
              title="Camera snapshot"
            >
              <Camera className="h-3 w-3" />
              {zone.camera && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto p-1"
            onClick={(e) => e.stopPropagation()}
            side="right"
          >
            <div className="flex flex-col gap-0.5">
              {zone.camera && (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    emitter.emit('camera-controls:view', { nodeId: zone.id })
                    setCameraPopoverOpen(false)
                  }}
                >
                  <Camera className="h-3.5 w-3.5" />
                  View snapshot
                </button>
              )}
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation()
                  emitter.emit('camera-controls:capture', { nodeId: zone.id })
                  setCameraPopoverOpen(false)
                }}
              >
                <Camera className="h-3.5 w-3.5" />
                {zone.camera ? 'Update snapshot' : 'Take snapshot'}
              </button>
              {zone.camera && (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    updateNode(zone.id, { camera: undefined })
                    setCameraPopoverOpen(false)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear snapshot
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <button
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-black/5 hover:text-foreground group-hover/row:opacity-100 dark:hover:bg-white/10"
          onClick={handleDelete}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
})

const MultiSelectionBadge = memo(function MultiSelectionBadge() {
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const setSelection = useViewer((state) => state.setSelection)

  if (selectedIds.length <= 1) return null

  return (
    <div className="pointer-events-none sticky top-4 z-50 flex h-0 w-full justify-center overflow-visible">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary px-0.5 py-4 pl-2 font-medium text-primary-foreground text-xs shadow-black/10 shadow-lg backdrop-blur-md">
        <span>{selectedIds.length} objects selected</span>
        <button
          className="cursor-pointer rounded-full p-1.5 transition-colors hover:bg-primary-foreground/20"
          onClick={() => setSelection({ selectedIds: [] })}
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
})

const ContentSection = memo(function ContentSection() {
  const selectedLevelId = useViewer((state) => state.selection.levelId)
  const structureLayer = useEditor((state) => state.structureLayer)
  const phase = useEditor((state) => state.phase)
  const setPhase = useEditor((state) => state.setPhase)
  const setMode = useEditor((state) => state.setMode)
  const setTool = useEditor((state) => state.setTool)
  const updateNodes = useScene((state) => state.updateNodes)

  const level = useScene((s) =>
    selectedLevelId ? ((s.nodes[selectedLevelId] as LevelNode | undefined) ?? null) : null,
  )
  const levelZones = useScene(
    useShallow((s) => {
      if (!selectedLevelId) return []
      return Object.values(s.nodes).filter(
        (node): node is ZoneNode => node.type === 'zone' && node.parentId === selectedLevelId,
      )
    }),
  )
  const elementChildren = useScene(
    useShallow((s) => {
      if (!selectedLevelId) return []
      const lvl = s.nodes[selectedLevelId] as LevelNode | undefined
      if (!lvl) return []
      return lvl.children.filter((childId) => s.nodes[childId]?.type !== 'zone')
    }),
  )

  if (!level) {
    return <TreeEmptyState title="Select a level" />
  }

  if (structureLayer === 'zones') {
    const handleAddZone = () => {
      setPhase('structure')
      setMode('build')
      setTool('zone')
    }

    const areAllZoneLabelsHidden =
      levelZones.length > 0 && levelZones.every((zone) => isZoneLabelHidden(zone))

    const handleToggleAllZoneLabels = () => {
      const nextHidden = !areAllZoneLabelsHidden
      updateNodes(
        levelZones.map((zone) => ({
          id: zone.id,
          data: {
            metadata: withZoneLabelHidden(zone, nextHidden),
          },
        })),
      )
    }

    if (levelZones.length === 0) {
      return <TreeEmptyState actionLabel="Add one" onAction={handleAddZone} title="No zones" />
    }

    return (
      <div className="flex flex-col">
        <div className="flex h-8 items-center justify-end border-border/50 border-b bg-muted/40 px-2">
          <button
            aria-label={areAllZoneLabelsHidden ? 'Show all labels' : 'Hide all labels'}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={handleToggleAllZoneLabels}
            title={areAllZoneLabelsHidden ? 'Show all labels' : 'Hide all labels'}
            type="button"
          >
            {areAllZoneLabelsHidden ? (
              <EyeOff className="h-3 w-3 opacity-50" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
          </button>
        </div>
        {levelZones.map((zone, index) => (
          <ZoneItem isLast={index === levelZones.length - 1} key={zone.id} zone={zone} />
        ))}
      </div>
    )
  }

  if (elementChildren.length === 0) {
    return <TreeEmptyState title="No elements" />
  }
  return (
    <TreeNodeDragProvider>
      <div className="flex flex-col">
        {elementChildren.map((childId, index) => (
          <TreeNode
            depth={0}
            isLast={index === elementChildren.length - 1}
            key={childId}
            nodeId={childId}
          />
        ))}
      </div>
    </TreeNodeDragProvider>
  )
})

const BuildingItem = memo(function BuildingItem({
  building,
  isBuildingActive,
  buildingCameraOpen,
  setBuildingCameraOpen,
  buildingOrientationOpenId,
  setBuildingOrientationOpenId,
  projectId,
  onUploadAsset,
  onDeleteAsset,
}: {
  building: BuildingNode
  isBuildingActive: boolean
  buildingCameraOpen: string | null
  setBuildingCameraOpen: (id: string | null) => void
  buildingOrientationOpenId: string | null
  setBuildingOrientationOpenId: (id: string | null) => void
  projectId?: string
  onUploadAsset?: (projectId: string, levelId: string, file: File, type: 'scan' | 'guide') => void
  onDeleteAsset?: (projectId: string, url: string) => void
}) {
  const setSelection = useViewer((state) => state.setSelection)
  const phase = useEditor((state) => state.phase)
  const setPhase = useEditor((state) => state.setPhase)
  const updateNode = useScene((state) => state.updateNode)
  const itemRef = useRef<HTMLDivElement>(null)
  const isOrientationOpen = buildingOrientationOpenId === building.id
  const isOrientationVisible = isBuildingActive && isOrientationOpen

  useEffect(() => {
    if (isBuildingActive && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isBuildingActive])

  const handleSelect = () => {
    setSelection({ buildingId: building.id })
    if (phase === 'site') {
      setPhase('structure')
    }
  }

  const handleDoubleClick = () => {
    focusTreeNode(building.id)
  }

  const handleOrientationToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setSelection({ buildingId: building.id })
    if (phase === 'site') {
      setPhase('structure')
    }
    setBuildingOrientationOpenId(isOrientationVisible ? null : building.id)
  }

  return (
    <div
      className={cn('flex shrink-0 flex-col overflow-hidden', isBuildingActive && 'min-h-0 flex-1')}
    >
      <div
        className={cn(
          'group/building flex h-11 shrink-0 cursor-pointer items-center border-border/50 border-b pr-2 transition-all duration-200',
          isBuildingActive
            ? 'bg-primary/10 text-foreground'
            : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
        )}
        onClick={handleSelect}
        onDoubleClick={handleDoubleClick}
        ref={itemRef}
      >
        <div className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-3.5">
          <Building2
            aria-hidden="true"
            className={cn(
              'h-5 w-5 shrink-0 stroke-[1.9] transition-colors',
              isBuildingActive ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <span className="truncate font-semibold text-sm">{building.name || 'Building'}</span>
          <OrientationToggleButton
            isOpen={isOrientationVisible}
            onClick={handleOrientationToggle}
            title="建筑朝向"
          />
        </div>
        <Popover
          onOpenChange={(open) => setBuildingCameraOpen(open ? building.id : null)}
          open={buildingCameraOpen === building.id}
        >
          <PopoverTrigger asChild>
            <button
              className={cn(
                'relative mr-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-colors group-hover/building:opacity-100',
                isBuildingActive
                  ? 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              onClick={(e) => e.stopPropagation()}
              title="Camera snapshot"
            >
              <Camera className="h-4 w-4" />
              {building.camera && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto p-1"
            onClick={(e) => e.stopPropagation()}
            side="right"
          >
            <div className="flex flex-col gap-0.5">
              {building.camera && (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    emitter.emit('camera-controls:view', { nodeId: building.id })
                    setBuildingCameraOpen(null)
                  }}
                >
                  <Camera className="h-3.5 w-3.5" />
                  View snapshot
                </button>
              )}
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation()
                  emitter.emit('camera-controls:capture', { nodeId: building.id })
                  setBuildingCameraOpen(null)
                }}
              >
                <Camera className="h-3.5 w-3.5" />
                {building.camera ? 'Update snapshot' : 'Take snapshot'}
              </button>
              {building.camera && (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    updateNode(building.id, { camera: undefined })
                    setBuildingCameraOpen(null)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear snapshot
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Tools and content for the active building */}
      <AnimatePresence initial={false}>
        {isBuildingActive && (
          <motion.div
            animate={{ opacity: 1, flex: '1 1 0%' }}
            className="flex w-full flex-col overflow-hidden"
            exit={{ opacity: 0, flex: '0 0 0px' }}
            initial={{ opacity: 0, flex: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          >
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <div className="flex shrink-0 flex-col">
                <AnimatePresence initial={false}>
                  {isOrientationVisible && (
                    <motion.div
                      animate={{ height: 'auto', opacity: 1 }}
                      className="overflow-hidden"
                      exit={{ height: 0, opacity: 0 }}
                      initial={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                    >
                      <BuildingOrientationSection building={building} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <LevelsSection
                  onDeleteAsset={onDeleteAsset}
                  onUploadAsset={onUploadAsset}
                  projectId={projectId}
                />
                <LayerToggle />
              </div>
              <div className="subtle-scrollbar relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <MultiSelectionBadge />
                <ContentSection />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

export interface SitePanelProps {
  projectId?: string
  onUploadAsset?: (projectId: string, levelId: string, file: File, type: 'scan' | 'guide') => void
  onDeleteAsset?: (projectId: string, url: string) => void
}

export function SitePanel({ projectId, onUploadAsset, onDeleteAsset }: SitePanelProps = {}) {
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const selectedBuildingId = useViewer((state) => state.selection.buildingId)
  const phase = useEditor((state) => state.phase)
  const setPhase = useEditor((state) => state.setPhase)

  const [siteCameraOpen, setSiteCameraOpen] = useState(false)
  const [buildingCameraOpen, setBuildingCameraOpen] = useState<string | null>(null)
  const [siteOrientationOpen, setSiteOrientationOpen] = useState(false)
  const [buildingOrientationOpenId, setBuildingOrientationOpenId] = useState<string | null>(null)

  useEffect(() => {
    const handleOpenSolarSettings = () => {
      setPhase('site')
      setSiteOrientationOpen(true)
    }

    emitter.on('site:open-solar-settings' as any, handleOpenSolarSettings as any)
    return () => {
      emitter.off('site:open-solar-settings' as any, handleOpenSolarSettings as any)
    }
  }, [setPhase])

  const siteNode = useScene((s) =>
    rootNodeIds[0] ? ((s.nodes[rootNodeIds[0]] as SiteNode | undefined) ?? null) : null,
  )
  const buildings = useScene(
    useShallow((s) => {
      if (!siteNode) return []
      return siteNode.children
        .map((child) => {
          const id = typeof child === 'string' ? child : child.id
          return s.nodes[id] as BuildingNode | undefined
        })
        .filter((node): node is BuildingNode => node?.type === 'building')
    }),
  )
  const isSiteOrientationVisible = phase === 'site' && siteOrientationOpen

  return (
    <LayoutGroup>
      <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
        {/* Site Header */}
        {siteNode && (
          <motion.div
            className={cn(
              'flex shrink-0 cursor-pointer items-center justify-between border-border/50 border-b px-3.5 py-3.5 transition-colors',
              phase === 'site'
                ? 'bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
            )}
            layout="position"
            onClick={() => setPhase('site')}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <MapPinned
                aria-hidden="true"
                className={cn(
                  'h-5 w-5 shrink-0 stroke-[1.9] transition-colors',
                  phase === 'site' ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <span className="truncate font-semibold text-sm">{siteNode.name || 'Site'}</span>
              <OrientationToggleButton
                isOpen={isSiteOrientationVisible}
                onClick={(event) => {
                  event.stopPropagation()
                  setPhase('site')
                  setSiteOrientationOpen((open) => (phase === 'site' ? !open : true))
                }}
                title="场地规则"
              />
            </div>
            <CameraPopover
              buttonClassName={cn(
                'transition-colors',
                phase === 'site' ? 'hover:bg-black/5 dark:hover:bg-white/10' : 'hover:bg-accent',
              )}
              hasCamera={!!siteNode.camera}
              nodeId={siteNode.id as AnyNodeId}
              onOpenChange={setSiteCameraOpen}
              open={siteCameraOpen}
            />
          </motion.div>
        )}

        <motion.div
          className={cn('flex min-h-0 flex-1 flex-col', phase === 'site' && 'overflow-y-auto')}
          layout
        >
          {/* When phase is site, show property line immediately under site header */}
          <AnimatePresence initial={false}>
            {phase === 'site' && (
              <motion.div
                animate={{ height: 'auto', opacity: 1 }}
                className="shrink-0 overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                layout="position"
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              >
                <AnimatePresence initial={false}>
                  {isSiteOrientationVisible && siteNode && (
                    <motion.div
                      animate={{ height: 'auto', opacity: 1 }}
                      className="overflow-hidden"
                      exit={{ height: 0, opacity: 0 }}
                      initial={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                    >
                      <SiteOrientationSection site={siteNode} />
                      <SiteSolarLocationSection site={siteNode} />
                      <SiteSetbackRuleSection site={siteNode} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <PropertyLineSection />
                <SiteTerrainSection />
                <SiteLandscapeSection />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buildings List */}
          {buildings.length === 0 ? (
            <motion.div layout="position">
              <TreeEmptyState title="No buildings yet" />
            </motion.div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {buildings.map((building) => {
                const isBuildingActive =
                  (phase === 'structure' || phase === 'furnish') &&
                  selectedBuildingId === building.id

                return (
                  <BuildingItem
                    building={building}
                    buildingCameraOpen={buildingCameraOpen}
                    buildingOrientationOpenId={buildingOrientationOpenId}
                    isBuildingActive={isBuildingActive}
                    key={building.id}
                    onDeleteAsset={onDeleteAsset}
                    onUploadAsset={onUploadAsset}
                    projectId={projectId}
                    setBuildingCameraOpen={setBuildingCameraOpen}
                    setBuildingOrientationOpenId={setBuildingOrientationOpenId}
                  />
                )
              })}
            </div>
          )}
        </motion.div>
      </div>
    </LayoutGroup>
  )
}
