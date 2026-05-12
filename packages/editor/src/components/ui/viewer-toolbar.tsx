'use client'

import { emitter, type SiteNode, useScene } from '@pascal-app/core'
import {
  formatSunMinutesOfDay,
  getDefaultSunStudyDate,
  getBrowserTimeZone,
  getSolarPositionForLocation,
  getZonedSolarClockTime,
  resolveSiteSolarLocation,
  resolveSunMinutesOfDay,
  resolveSunStudyDate,
  SUN_TIME_OPTIONS,
  WEATHER_OPTIONS,
  withSiteSolarLocation,
  type ResolvedSiteSolarLocation,
  type CharacterActorState,
  type CharacterKind,
  type CharacterMotion,
  type CharacterPersonState,
  type SunTimeOfDay,
  type WeatherMode,
  useViewer,
} from '@pascal-app/viewer'
import {
  ArrowLeftRight,
  ArrowUpDown,
  Box,
  BrickWall,
  Building2,
  Camera,
  ChevronsLeft,
  ChevronsRight,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Columns3,
  Dog,
  DraftingCompass,
  Eye,
  Footprints,
  Grid3X3,
  Layers,
  Layers3,
  LocateFixed,
  Moon,
  Minus,
  Plus,
  Ruler,
  Square,
  Accessibility,
  Baby,
  Clock3,
  SunMedium,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useMemo, useState, type ComponentType } from 'react'
import { cn } from '../../lib/utils'
import useEditor from '../../store/use-editor'
import type { MeasurementMode, ViewMode } from '../../store/use-editor'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './primitives/dropdown-menu'
import { Input } from './primitives/input'
import { Slider } from './primitives/slider'
import { useSidebarStore } from './primitives/sidebar'
import { Switch } from './primitives/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip'

// ── Shared styles ───────────────────────────────────────────────────────────

/** Compact glass rail for canvas HUD controls. */
const TOOLBAR_CONTAINER = 'editor-toolbar-group'

/** Ghost button inside a HUD rail. */
const TOOLBAR_BTN =
  'editor-icon-button flex min-h-9 min-w-9 items-center justify-center px-2 text-muted-foreground transition-colors'

// ── View mode segmented control ─────────────────────────────────────────────

const VIEW_MODES: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    id: '3d',
    label: '3D',
    icon: <Building2 aria-hidden="true" className="h-3.5 w-3.5 stroke-[2]" />,
  },
  {
    id: '2d',
    label: '2D',
    icon: <Square aria-hidden="true" className="h-3.5 w-3.5 stroke-[2]" />,
  },
  {
    id: 'split',
    label: 'Split',
    icon: <Columns3 aria-hidden="true" className="h-3.5 w-3.5 stroke-[2]" />,
  },
  {
    id: 'tri-view',
    label: '三视图',
    icon: <Grid3X3 aria-hidden="true" className="h-3.5 w-3.5 stroke-[2]" />,
  },
]

function ViewModeControl() {
  const viewMode = useEditor((s) => s.viewMode)
  const setViewMode = useEditor((s) => s.setViewMode)
  const setCameraMode = useViewer((s) => s.setCameraMode)

  return (
    <div className={TOOLBAR_CONTAINER}>
      {VIEW_MODES.map((mode) => {
        const isActive = viewMode === mode.id
        return (
          <button
            className={cn(
              'flex min-h-9 items-center justify-center gap-1.5 px-3 font-semibold text-xs transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            key={mode.id}
            onClick={() => {
              setViewMode(mode.id)
              if (mode.id === 'tri-view') {
                setCameraMode('perspective')
              }
            }}
            type="button"
          >
            {mode.icon}
            <span>{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Collapse sidebar button ─────────────────────────────────────────────────

function CollapseSidebarButton() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const setIsCollapsed = useSidebarStore((s) => s.setIsCollapsed)

  const toggle = useCallback(() => {
    setIsCollapsed(!isCollapsed)
  }, [isCollapsed, setIsCollapsed])

  return (
    <div className={TOOLBAR_CONTAINER}>
      <button
        className={TOOLBAR_BTN}
        onClick={toggle}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
      >
        {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Right toolbar buttons ───────────────────────────────────────────────────

function WalkthroughButton() {
  const isFirstPersonMode = useEditor((s) => s.isFirstPersonMode)
  const setFirstPersonMode = useEditor((s) => s.setFirstPersonMode)

  const toggle = () => {
    setFirstPersonMode(!isFirstPersonMode)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            isFirstPersonMode && 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20',
          )}
          onClick={toggle}
          type="button"
        >
          <Footprints className="h-4 w-4 stroke-[2]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Walkthrough</TooltipContent>
    </Tooltip>
  )
}

function ViewpointCameraButton() {
  const isPlacementMode = useEditor((s) => s.isViewpointPlacementMode)
  const setViewpointPlacementMode = useEditor((s) => s.setViewpointPlacementMode)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            isPlacementMode && 'bg-primary/10 text-primary hover:bg-primary/15',
          )}
          onClick={() => setViewpointPlacementMode(!isPlacementMode)}
          type="button"
        >
          <Camera className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">取景相机</TooltipContent>
    </Tooltip>
  )
}

const measurementModeLabels: Record<MeasurementMode, string> = {
  distance: '距离',
  area: '面积',
  volume: '体积',
  clearance: '净空',
  bounds: '包围盒',
  angle: '角度',
  perimeter: '周长',
  grid: '轴网',
}

const measurementModeIcons: Record<MeasurementMode, ComponentType<{ className?: string }>> = {
  distance: Ruler,
  area: Square,
  volume: Box,
  clearance: ArrowUpDown,
  bounds: Box,
  angle: DraftingCompass,
  perimeter: ArrowLeftRight,
  grid: Grid3X3,
}

const characterMotionLabels = {
  idle: '站立',
  walk: '走',
  run: '跑',
  jump: '跳',
  sit: '坐',
  crouch: '蹲',
  lie: '躺',
  chat: '闲聊',
  swim: '游泳',
  drown: '挣扎求救',
  dead: '漂浮',
} as const

const MAX_CHARACTER_COUNT = 200
const DEFAULT_BULK_CHARACTER_COUNT = 20
const BULK_CHARACTER_COLORS = ['#4c6fff', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6']
const WATER_NAME_PATTERN = /水|河|江|湖|海|溪|池|渠|泳池|water|river|lake|sea|ocean|pond|pool|canal/i

const characterKindLabels: Record<CharacterKind, string> = {
  adult: '成人',
  dog: '小狗',
  child: '小孩',
  elder: '老人',
  wheelchair: '轮椅',
}

const characterKindIcons: Record<CharacterKind, ComponentType<{ className?: string }>> = {
  adult: UserRound,
  dog: Dog,
  child: Baby,
  elder: UserRound,
  wheelchair: Accessibility,
}

const characterKindOrder: CharacterKind[] = ['adult', 'dog', 'child', 'elder', 'wheelchair']

type CharacterPlacementSelection = {
  buildingId: string | null
  levelId: string | null
  zoneId: string | null
}

type SceneNodeLike = {
  id: string
  type: string
  parentId?: string | null
  children?: string[]
  position?: [number, number, number]
  polygon?: Array<[number, number]> | { points?: Array<[number, number]> }
  name?: string
  material?: { id?: string; name?: string; tags?: string[] }
  materialId?: string
  metadata?: Record<string, unknown>
}

function getNodePolygon(node: SceneNodeLike | null | undefined): Array<[number, number]> {
  if (!node) return []
  if (Array.isArray(node.polygon)) return node.polygon
  if (node.polygon && 'points' in node.polygon && Array.isArray(node.polygon.points)) {
    return node.polygon.points
  }
  return []
}

function getPolygonCentroid(polygon: Array<[number, number]>): [number, number] {
  if (polygon.length === 0) return [0, 0]
  if (polygon.length < 3) {
    const sum = polygon.reduce<[number, number]>(
      (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
      [0, 0],
    )
    return [sum[0] / polygon.length, sum[1] / polygon.length]
  }

  let signedArea = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x0, z0] = polygon[i]!
    const [x1, z1] = polygon[(i + 1) % polygon.length]!
    const cross = x0 * z1 - x1 * z0
    signedArea += cross
    cx += (x0 + x1) * cross
    cz += (z0 + z1) * cross
  }

  signedArea /= 2
  if (Math.abs(signedArea) < 0.0001) {
    return getPolygonCentroid(polygon.slice(0, 2))
  }

  const factor = 1 / (6 * signedArea)
  return [cx * factor, cz * factor]
}

function getPolygonBounds(polygon: Array<[number, number]>) {
  return polygon.reduce(
    (bounds, [x, z]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minZ: Math.min(bounds.minZ, z),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  )
}

function pointInPolygon(x: number, z: number, polygon: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!
    const [xj, zj] = polygon[j]!
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function isWaterNode(node: SceneNodeLike) {
  const metadata = node.metadata ?? {}
  if (metadata.water === true || metadata.isWater === true || metadata.role === 'water') return true

  const materialTags = Array.isArray(node.material?.tags) ? node.material.tags.join(' ') : ''
  const text = [
    node.name,
    node.materialId,
    node.material?.id,
    node.material?.name,
    materialTags,
  ]
    .filter(Boolean)
    .join(' ')

  return WATER_NAME_PATTERN.test(text)
}

function findParentNode(
  nodes: Record<string, SceneNodeLike>,
  childId: string,
): SceneNodeLike | null {
  const explicitParentId = nodes[childId]?.parentId
  if (explicitParentId && nodes[explicitParentId]) return nodes[explicitParentId]!

  return (
    Object.values(nodes).find((node) => Array.isArray(node.children) && node.children.includes(childId)) ??
    null
  )
}

function findBuildingForNode(
  nodes: Record<string, SceneNodeLike>,
  nodeId: string,
): SceneNodeLike | null {
  let current: SceneNodeLike | null = nodes[nodeId] ?? null
  const visited = new Set<string>()

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.type === 'building') return current
    current = findParentNode(nodes, current.id)
  }

  return null
}

function isDescendantOfBuilding(
  nodes: Record<string, SceneNodeLike>,
  node: SceneNodeLike,
  buildingId: string | null,
) {
  if (!buildingId) return true
  return findBuildingForNode(nodes, node.id)?.id === buildingId
}

function resolveCharacterPlacement(
  rawNodes: Record<string, unknown>,
  selection: CharacterPlacementSelection,
): [number, number, number] {
  const nodes = rawNodes as Record<string, SceneNodeLike>
  const selectedZone =
    selection.zoneId && nodes[selection.zoneId]?.type === 'zone' ? nodes[selection.zoneId] : null

  const candidateZones = selectedZone
    ? [selectedZone]
    : Object.values(nodes).filter(
        (node) =>
          node.type === 'zone' &&
          getNodePolygon(node).length > 0 &&
          isDescendantOfBuilding(nodes, node, selection.buildingId),
      )

  if (candidateZones.length > 0) {
    const points = candidateZones.flatMap((zone) => getNodePolygon(zone))
    const [x, z] =
      selectedZone && getNodePolygon(selectedZone).length > 0
        ? getPolygonCentroid(getNodePolygon(selectedZone))
        : getPolygonCentroid(points)
    const building = selectedZone
      ? findBuildingForNode(nodes, selectedZone.id)
      : selection.buildingId
        ? nodes[selection.buildingId]
        : null
    const buildingPosition = building?.position ?? [0, 0, 0]
    return [x + buildingPosition[0], buildingPosition[1] ?? 0, z + buildingPosition[2]]
  }

  const building =
    selection.buildingId && nodes[selection.buildingId]?.type === 'building'
      ? nodes[selection.buildingId]
      : Object.values(nodes).find((node) => node.type === 'building')

  return building?.position ?? [0, 0, 0]
}

function getRandomCharacterGroundPositions(
  rawNodes: Record<string, unknown>,
  selection: CharacterPlacementSelection,
  count: number,
): Array<[number, number, number]> {
  const nodes = rawNodes as Record<string, SceneNodeLike>
  const site =
    Object.values(nodes).find((node) => node.type === 'site' && getNodePolygon(node).length >= 3) ??
    null
  const selectedZone =
    selection.zoneId && nodes[selection.zoneId]?.type === 'zone' ? nodes[selection.zoneId] : null
  const selectedZonePolygon = getNodePolygon(selectedZone)
  const selectedBuilding =
    selection.buildingId && nodes[selection.buildingId]?.type === 'building'
      ? nodes[selection.buildingId]
      : null

  const basePolygon =
    selectedZonePolygon.length >= 3 ? selectedZonePolygon : site ? getNodePolygon(site) : []
  if (basePolygon.length < 3) {
    const fallback = resolveCharacterPlacement(rawNodes, selection)
    return Array.from({ length: count }, (_, index) => {
      const angle = index * 2.399963
      const radius = 0.8 + Math.sqrt(index) * 0.55
      return [fallback[0] + Math.cos(angle) * radius, fallback[1], fallback[2] + Math.sin(angle) * radius]
    })
  }

  const polygonOffset =
    selectedZonePolygon.length >= 3
      ? selectedBuilding?.position ?? [0, 0, 0]
      : ([0, 0, 0] as [number, number, number])
  const y = polygonOffset[1] ?? 0
  const bounds = getPolygonBounds(basePolygon)
  const waterPolygons = Object.values(nodes)
    .filter((node) => node.type === 'zone' && isWaterNode(node))
    .map((node) => {
      const building = findBuildingForNode(nodes, node.id)
      const offset = building?.position ?? [0, 0, 0]
      return getNodePolygon(node).map(([x, z]) => [x + offset[0], z + offset[2]] as [number, number])
    })
    .filter((polygon) => polygon.length >= 3)
  const worldBasePolygon = basePolygon.map(
    ([x, z]) => [x + polygonOffset[0], z + polygonOffset[2]] as [number, number],
  )
  const worldBounds = getPolygonBounds(worldBasePolygon)
  const positions: Array<[number, number, number]> = []
  const maxAttempts = Math.max(200, count * 80)

  for (let attempt = 0; attempt < maxAttempts && positions.length < count; attempt++) {
    const x = worldBounds.minX + Math.random() * (worldBounds.maxX - worldBounds.minX)
    const z = worldBounds.minZ + Math.random() * (worldBounds.maxZ - worldBounds.minZ)

    if (!pointInPolygon(x, z, worldBasePolygon)) continue
    if (waterPolygons.some((polygon) => pointInPolygon(x, z, polygon))) continue

    positions.push([x, y, z])
  }

  while (positions.length < count) {
    const index = positions.length
    const centerX = (bounds.minX + bounds.maxX) / 2 + polygonOffset[0]
    const centerZ = (bounds.minZ + bounds.maxZ) / 2 + polygonOffset[2]
    const x = centerX + (Math.random() - 0.5) * Math.max(1, bounds.maxX - bounds.minX)
    const z = centerZ + (Math.random() - 0.5) * Math.max(1, bounds.maxZ - bounds.minZ)
    positions.push([x, y, z])
  }

  return positions
}

function createBulkCharacterPerson(
  index: number,
  position: [number, number, number],
  kind: CharacterKind,
): CharacterPersonState {
  return {
    id: `character-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    name: `角色 ${index + 1}`,
    kind,
    enabled: true,
    motion: 'idle',
    roam: true,
    speed: 1,
    showBones: kind !== 'dog',
    position,
    color: BULK_CHARACTER_COLORS[index % BULK_CHARACTER_COLORS.length] ?? '#4c6fff',
  }
}

function createFallbackCharacterPerson(actor: CharacterActorState): CharacterPersonState {
  return {
    id: actor.selectedPersonId || 'character-1',
    name: '角色 1',
    kind: 'adult',
    enabled: true,
    motion: actor.motion,
    roam: false,
    speed: actor.speed,
    showBones: actor.showBones,
    position: actor.position,
    color: '#4c6fff',
  }
}

function getCharacterPeople(actor: CharacterActorState) {
  return actor.people?.length > 0 ? actor.people : [createFallbackCharacterPerson(actor)]
}

function getSelectedCharacter(actor: CharacterActorState) {
  const people = getCharacterPeople(actor)
  return people.find((person) => person.id === actor.selectedPersonId) ?? people[0]
}

function getSelectedCharacterIndex(actor: CharacterActorState) {
  const people = getCharacterPeople(actor)
  const index = people.findIndex((person) => person.id === actor.selectedPersonId)
  return index >= 0 ? index : 0
}

function MeasurementControl() {
  const measurementMode = useEditor((s) => s.measurementMode)
  const setMeasurementMode = useEditor((s) => s.setMeasurementMode)
  const isFirstPersonMode = useEditor((s) => s.isFirstPersonMode)

  if (isFirstPersonMode) return null

  const ActiveIcon = measurementMode ? measurementModeIcons[measurementMode] : Ruler

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                TOOLBAR_BTN,
                'w-auto gap-1.5 px-2.5',
                measurementMode && 'bg-primary/10 text-primary',
              )}
              type="button"
            >
              <ActiveIcon className="h-4 w-4" />
              <span className="font-medium text-xs">
                {measurementMode ? measurementModeLabels[measurementMode] : '测量'}
              </span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {measurementMode ? `3D 测量: ${measurementModeLabels[measurementMode]}` : '3D 测量'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" className="w-40" side="bottom">
        <DropdownMenuLabel>3D 测量</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => setMeasurementMode(value as MeasurementMode)}
          value={measurementMode ?? ''}
        >
          {Object.entries(measurementModeLabels).map(([mode, label]) => {
            const Icon = measurementModeIcons[mode as MeasurementMode]
            return (
              <DropdownMenuRadioItem key={mode} value={mode}>
                <span className="mr-2 flex h-4 w-4 items-center justify-center">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        {measurementMode ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setMeasurementMode(null)}>关闭测量</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CharacterActorControl() {
  const nodes = useScene((state) => state.nodes)
  const selection = useViewer((s) => s.selection)
  const characterActor = useViewer((s) => s.characterActor)
  const [bulkCountInput, setBulkCountInput] = useState(String(DEFAULT_BULK_CHARACTER_COUNT))
  const selectedPerson = getSelectedCharacter(characterActor)
  const selectedIndex = getSelectedCharacterIndex(characterActor)
  const people = getCharacterPeople(characterActor)
  const selectedMotion = selectedPerson?.motion ?? characterActor.motion
  const selectedKind = selectedPerson?.kind ?? characterActor.pendingPlacementKind ?? 'adult'
  const pendingPlacementKind = characterActor.pendingPlacementKind
  const visibleCount = characterActor.enabled ? people.length : 0
  const canPenetrate = characterActor.canPenetrate
  const SelectedKindIcon = characterKindIcons[selectedKind] ?? UserRound

  const updateCharacterActor = useCallback((updates: Partial<CharacterActorState>) => {
    useViewer.getState().setCharacterActor(updates)
  }, [])

  const requestCharacterPlacement = useCallback(
    (kind: CharacterKind) => {
      updateCharacterActor({
        pendingPlacementKind: kind,
      })
    },
    [updateCharacterActor],
  )

  const generateBulkCharacters = useCallback(() => {
    const requestedCount = Math.max(
      1,
      Math.min(MAX_CHARACTER_COUNT, Math.round(Number(bulkCountInput) || DEFAULT_BULK_CHARACTER_COUNT)),
    )
    setBulkCountInput(String(requestedCount))
    const positions = getRandomCharacterGroundPositions(nodes, selection, requestedCount)
    const people = positions.map((position, index) => createBulkCharacterPerson(index, position, 'adult'))

    updateCharacterActor({
      count: people.length,
      enabled: true,
      people,
      pendingPlacementKind: null,
      position: people[0]?.position ?? resolveCharacterPlacement(nodes, selection),
      selectedPersonId: people[0]?.id ?? characterActor.selectedPersonId,
    })
  }, [bulkCountInput, characterActor.selectedPersonId, nodes, selection, updateCharacterActor])

  const cycleMotion = useCallback(() => {
    if (!characterActor.enabled) {
      requestCharacterPlacement(selectedKind)
      return
    }

    const motionOrder = Object.keys(characterMotionLabels) as CharacterMotion[]
    const selected = getSelectedCharacter(characterActor)
    const currentMotion = selected?.motion ?? characterActor.motion
    const currentIndex = motionOrder.indexOf(currentMotion)
    const nextMotion = characterActor.enabled
      ? motionOrder[(currentIndex + 1) % motionOrder.length]
      : 'idle'

    updateCharacterActor({
      enabled: true,
      motion: nextMotion ?? 'idle',
      position: characterActor.enabled
        ? (selected?.position ?? characterActor.position)
        : resolveCharacterPlacement(nodes, selection),
    })
  }, [characterActor, nodes, requestCharacterPlacement, selectedKind, selection, updateCharacterActor])

  const changeCount = useCallback(
    (offset: number) => {
      if (offset > 0) {
        requestCharacterPlacement(selectedKind)
        return
      }

      const nextCount = Math.max(
        1,
        Math.min(MAX_CHARACTER_COUNT, (characterActor.count || people.length || 1) + offset),
      )
      updateCharacterActor({
        count: nextCount,
        enabled: true,
        position: selectedPerson?.position ?? resolveCharacterPlacement(nodes, selection),
      })
    },
    [
      characterActor.count,
      nodes,
      people.length,
      requestCharacterPlacement,
      selectedKind,
      selectedPerson?.position,
      selection,
      updateCharacterActor,
    ],
  )

  const cycleSelectedPerson = useCallback(() => {
    const currentPeople = getCharacterPeople(characterActor)
    const nextIndex = (getSelectedCharacterIndex(characterActor) + 1) % currentPeople.length
    const nextPerson = currentPeople[nextIndex] ?? currentPeople[0]
    if (!nextPerson) return

    updateCharacterActor({
      enabled: true,
      selectedPersonId: nextPerson.id,
    })
  }, [characterActor, updateCharacterActor])

  const placeSelectedPerson = useCallback(() => {
    if (!characterActor.enabled) {
      requestCharacterPlacement(selectedKind)
      return
    }

    const placement = resolveCharacterPlacement(nodes, selection)
    const currentPeople = getCharacterPeople(characterActor)
    const selected = getSelectedCharacter(characterActor)
    const selectedId = selected?.id ?? currentPeople[0]?.id
    if (!selectedId) return

    updateCharacterActor({
      enabled: true,
      people: currentPeople.map((person) =>
        person.id === selectedId
          ? {
              ...person,
              enabled: true,
              position: placement,
            }
          : person,
      ),
      position: placement,
      selectedPersonId: selectedId,
    })
  }, [characterActor, nodes, requestCharacterPlacement, selectedKind, selection, updateCharacterActor])

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="角色动作"
                className={cn(
                  TOOLBAR_BTN,
                  'w-auto gap-1.5 px-2.5',
                  (characterActor.enabled || pendingPlacementKind) && 'bg-primary/10 text-primary',
                )}
                onDoubleClick={cycleMotion}
                title={characterActor.enabled ? '双击切换选中角色动作' : '选择并放入角色'}
                type="button"
              >
                <SelectedKindIcon className="h-4 w-4" />
                <span className="font-medium text-xs">
                  {pendingPlacementKind
                    ? `点击放置${characterKindLabels[pendingPlacementKind]}`
                    : characterActor.enabled
                      ? characterMotionLabels[selectedMotion]
                      : '角色'}
                </span>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {pendingPlacementKind ? '在画布中点击一个位置放置角色' : '选择要添加的角色'}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="center" className="w-40" side="bottom">
          <DropdownMenuLabel>添加角色</DropdownMenuLabel>
          {characterKindOrder.map((kind) => {
            const Icon = characterKindIcons[kind] ?? UserRound
            return (
              <DropdownMenuItem key={kind} onSelect={() => requestCharacterPlacement(kind)}>
                <span className="mr-2 flex h-4 w-4 items-center justify-center">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {characterKindLabels[kind]}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <div
            className="space-y-2 px-2 py-1.5"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                generateBulkCharacters()
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="font-medium text-muted-foreground text-xs">批量生成成人</div>
            <div className="flex items-center gap-1.5">
              <Input
                aria-label="批量生成人数"
                className="h-7 px-2 text-xs"
                inputMode="numeric"
                max={MAX_CHARACTER_COUNT}
                min={1}
                onChange={(event) => setBulkCountInput(event.currentTarget.value)}
                type="number"
                value={bulkCountInput}
              />
              <button
                className="h-7 shrink-0 rounded border border-border bg-background px-2 font-medium text-xs hover:bg-accent"
                onClick={generateBulkCharacters}
                type="button"
              >
                生成
              </button>
            </div>
          </div>
          {characterActor.enabled ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={canPenetrate}
                onCheckedChange={(checked) =>
                  updateCharacterActor({ canPenetrate: checked === true })
                }
              >
                允许穿透物体
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem onSelect={cycleMotion}>
                切换动作：{characterMotionLabels[selectedMotion]}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={canPenetrate ? '关闭角色穿透' : '开启角色穿透'}
            className={cn(
              TOOLBAR_BTN,
              canPenetrate && 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/20',
            )}
            onPointerDown={() => updateCharacterActor({ canPenetrate: !canPenetrate })}
            title={canPenetrate ? '角色可穿透墙体和物体' : '角色会避开墙体、车、围栏等物体'}
            type="button"
          >
            <BrickWall className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {canPenetrate ? '可穿透：开' : '实体碰撞：开'}
        </TooltipContent>
      </Tooltip>
      <button
        aria-label="减少人数"
        className={TOOLBAR_BTN}
        disabled={visibleCount <= 1}
        onPointerDown={() => changeCount(-1)}
        title="减少角色人数"
        type="button"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="增加人数"
        className={cn(TOOLBAR_BTN, 'w-auto gap-1.5 px-2.5')}
        disabled={visibleCount >= MAX_CHARACTER_COUNT}
        onPointerDown={() => changeCount(1)}
        title="添加一个角色，点击画布后放置"
        type="button"
      >
        <UsersRound className="h-4 w-4" />
        <span className="font-medium text-xs">{visibleCount}</span>
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="选择角色"
        className={cn(TOOLBAR_BTN, 'w-auto px-2.5')}
        onPointerDown={cycleSelectedPerson}
        title="切换要控制的角色"
        type="button"
      >
        <span className="font-medium text-xs">
          {visibleCount > 0 ? `${selectedIndex + 1}/${visibleCount}` : '0/0'}
        </span>
      </button>
      <button
        aria-label="移动角色到选中位置"
        className={TOOLBAR_BTN}
        onPointerDown={placeSelectedPerson}
        title="把选中角色移动到当前建筑/房间中心"
        type="button"
      >
        <LocateFixed className="h-4 w-4" />
      </button>
    </div>
  )
}

function UnitToggle() {
  const unit = useViewer((s) => s.unit)
  const setUnit = useViewer((s) => s.setUnit)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(TOOLBAR_BTN, 'w-auto gap-1.5 px-2.5')}
          onClick={() => setUnit(unit === 'metric' ? 'imperial' : 'metric')}
          type="button"
        >
          <Ruler className="h-4 w-4 stroke-[2]" />
          <span className="font-semibold text-[10px]">{unit === 'metric' ? 'm' : 'ft'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {unit === 'metric' ? 'Metric (m)' : 'Imperial (ft)'}
      </TooltipContent>
    </Tooltip>
  )
}

function ThemeToggle() {
  const theme = useViewer((s) => s.theme)
  const setTheme = useViewer((s) => s.setTheme)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={TOOLBAR_BTN}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          type="button"
        >
          {theme === 'dark' ? (
            <Moon className="h-4 w-4 stroke-[2]" />
          ) : (
            <SunMedium className="h-4 w-4 stroke-[2]" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{theme === 'dark' ? 'Dark' : 'Light'}</TooltipContent>
    </Tooltip>
  )
}

const QUICK_SUN_DATES = [
  { dateKey: 'spring-equinox', label: '春分', month: 3, day: 20 },
  { dateKey: 'june-solstice', label: '夏至', month: 6, day: 21 },
  { dateKey: 'autumn-equinox', label: '秋分', month: 9, day: 22 },
  { dateKey: 'december-solstice', label: '冬至', month: 12, day: 21 },
] as const

const DEFAULT_SOLAR_LOCATION: ResolvedSiteSolarLocation = {
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  elevationMeters: 4,
}

function formatDatePart(value: number) {
  return value.toString().padStart(2, '0')
}

function getSunStudyYear(date: string | null | undefined) {
  const match = /^(\d{4})-/.exec(date ?? '')
  return match ? Number.parseInt(match[1] ?? '', 10) : new Date().getFullYear()
}

function getQuickSunStudyDate(
  key: (typeof QUICK_SUN_DATES)[number]['dateKey'],
  currentDate: string | null | undefined,
) {
  const option = QUICK_SUN_DATES.find((entry) => entry.dateKey === key)
  if (!option) return getDefaultSunStudyDate()

  const year = getSunStudyYear(currentDate)
  return `${year}-${formatDatePart(option.month)}-${formatDatePart(option.day)}`
}

function parseTimeInputValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null

  const hours = Number.parseInt(match[1] ?? '', 10)
  const minutes = Number.parseInt(match[2] ?? '', 10)
  if (!(Number.isInteger(hours) && Number.isInteger(minutes))) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return hours * 60 + minutes
}

function OrientationSunControl() {
  const siteNode = useScene((state) => {
    const rootId = state.rootNodeIds[0]
    const node = rootId ? state.nodes[rootId] : null
    if (node?.type === 'site') return node as SiteNode

    const fallbackSite = Object.values(state.nodes).find(
      (candidate): candidate is SiteNode => candidate.type === 'site',
    )

    return fallbackSite ?? null
  })
  const updateNode = useScene((state) => state.updateNode)
  const showCompass = useViewer((s) => s.showCompass)
  const setShowCompass = useViewer((s) => s.setShowCompass)
  const sunStudy = useViewer((s) => s.sunStudy)
  const setSunStudyEnabled = useViewer((s) => s.setSunStudyEnabled)
  const setSunStudyMode = useViewer((s) => s.setSunStudyMode)
  const setSunTimeOfDay = useViewer((s) => s.setSunTimeOfDay)
  const setSunStudyDate = useViewer((s) => s.setSunStudyDate)
  const setSunMinutesOfDay = useViewer((s) => s.setSunMinutesOfDay)
  const setSunStudy = useViewer((s) => s.setSunStudy)
  const setSunFollowClock = useViewer((s) => s.setSunFollowClock)
  const setSunTimeFlowMode = useViewer((s) => s.setSunTimeFlowMode)
  const setPhase = useEditor((s) => s.setPhase)
  const isActive = showCompass || sunStudy.enabled
  const solarLocation = resolveSiteSolarLocation(siteNode)
  const hasSolarLocation = solarLocation !== null
  const solarTimeZone = solarLocation?.timezone ?? null
  const isRealSun = sunStudy.mode === 'real'
  const timeFlowMode = sunStudy.timeFlowMode ?? (sunStudy.followClock ? 'clock' : 'manual')
  const isFollowingClock = timeFlowMode === 'clock' && isRealSun && hasSolarLocation
  const isDayCyclePlaying = timeFlowMode === 'day-cycle' && isRealSun && hasSolarLocation
  const resolvedDate = resolveSunStudyDate(sunStudy.date) ?? getDefaultSunStudyDate()
  const resolvedMinutesOfDay = resolveSunMinutesOfDay(sunStudy.minutesOfDay)
  const realSunSummary = useMemo(() => {
    if (!(solarLocation && isRealSun)) return null

    return getSolarPositionForLocation(solarLocation, resolvedDate, resolvedMinutesOfDay)
  }, [isRealSun, resolvedDate, resolvedMinutesOfDay, solarLocation])

  const openSiteSolarSettings = useCallback(() => {
    setPhase('site')
    emitter.emit('site:open-solar-settings' as any, undefined)
  }, [setPhase])

  const ensureSolarLocation = useCallback(() => {
    if (solarLocation) return solarLocation
    if (!siteNode) {
      openSiteSolarSettings()
      return null
    }

    const fallbackLocation = {
      ...DEFAULT_SOLAR_LOCATION,
      timezone: getBrowserTimeZone() || DEFAULT_SOLAR_LOCATION.timezone,
    }

    updateNode(siteNode.id, {
      metadata: withSiteSolarLocation(siteNode, fallbackLocation),
    })

    return fallbackLocation
  }, [openSiteSolarSettings, siteNode, solarLocation, updateNode])

  const syncSunToClock = useCallback(
    (followClock = true, timezoneOverride?: string) => {
      const timeZone = timezoneOverride ?? solarTimeZone
      if (!timeZone) return

      const clockTime = getZonedSolarClockTime(timeZone)
      if (!clockTime) return

      setSunStudy({
        enabled: true,
        mode: 'real',
        date: clockTime.date,
        minutesOfDay: clockTime.minutesOfDay,
        followClock,
        timeFlowMode: followClock ? 'clock' : 'manual',
      })
    },
    [setSunStudy, solarTimeZone],
  )

  const handleRealSunCheckedChange = useCallback(
    (checked: boolean) => {
      if (checked !== true) {
        setSunStudyMode('preset')
        return
      }

      const nextLocation = ensureSolarLocation()
      if (!nextLocation) return

      setSunStudyEnabled(true)
      setSunStudyMode('real')
    },
    [ensureSolarLocation, setSunStudyEnabled, setSunStudyMode],
  )

  const handleFollowClockCheckedChange = useCallback(
    (checked: boolean) => {
      if (checked !== true) {
        setSunFollowClock(false)
        return
      }

      const nextLocation = ensureSolarLocation()
      if (!nextLocation) return

      syncSunToClock(true, nextLocation.timezone)
    },
    [ensureSolarLocation, setSunFollowClock, syncSunToClock],
  )

  const handleDayCycleCheckedChange = useCallback(
    (checked: boolean) => {
      if (checked !== true) {
        setSunTimeFlowMode('manual')
        return
      }

      const nextLocation = ensureSolarLocation()
      if (!nextLocation) return

      setSunStudy({
        enabled: true,
        mode: 'real',
        date: resolvedDate,
        minutesOfDay: resolvedMinutesOfDay,
        followClock: false,
        timeFlowMode: 'day-cycle',
      })
    },
    [
      hasSolarLocation,
      openSiteSolarSettings,
      resolvedDate,
      resolvedMinutesOfDay,
      setSunStudy,
      setSunTimeFlowMode,
    ],
  )

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(TOOLBAR_BTN, isActive && 'bg-primary/10 text-primary')}
              type="button"
            >
              {sunStudy.enabled ? <SunMedium className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">方位与日照</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" className="w-80" side="bottom">
        <DropdownMenuCheckboxItem
          checked={showCompass}
          onCheckedChange={(checked) => setShowCompass(checked === true)}
        >
          方位标识
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={sunStudy.enabled}
          onCheckedChange={(checked) => setSunStudyEnabled(checked === true)}
        >
          日照阴影
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <div
          className="space-y-3 px-2 py-2"
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className={cn(
              'flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 transition-colors',
              !hasSolarLocation &&
                !isRealSun &&
                'cursor-pointer ring-1 ring-amber-300/45 hover:bg-accent/55',
            )}
            onClick={!hasSolarLocation && !isRealSun ? openSiteSolarSettings : undefined}
          >
            <div className="min-w-0">
              <div className="font-medium text-xs text-foreground">真实太阳</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {hasSolarLocation
                  ? solarLocation?.timezone
                  : '点击后前往“场地规则 > 位置与日照”填写经纬度和时区。'}
              </div>
            </div>
            <Switch
              checked={isRealSun}
              onCheckedChange={handleRealSunCheckedChange}
            />
          </div>

          {!hasSolarLocation ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1">
                真实太阳需要先填写场地纬度、经度和有效时区。
              </span>
              <button
                className="shrink-0 rounded-md border border-border/60 px-2 py-1 text-foreground transition-colors hover:bg-accent/55"
                onClick={openSiteSolarSettings}
                type="button"
              >
                去设置
              </button>
            </div>
          ) : null}

          {hasSolarLocation ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="font-medium text-xs text-foreground">实时流逝</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {isFollowingClock ? '跟随当前时间' : '按场地时区同步当前时间'}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-accent/55"
                    onClick={() => syncSunToClock(false)}
                    type="button"
                  >
                    同步当前
                  </button>
                  <Switch
                    checked={isFollowingClock}
                    onCheckedChange={handleFollowClockCheckedChange}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="font-medium text-xs text-foreground">24小时快进</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    1分钟循环走完当前日期的全天太阳路径
                  </div>
                </div>
                <Switch
                  checked={isDayCyclePlaying}
                  onCheckedChange={handleDayCycleCheckedChange}
                />
              </div>
            </>
          ) : null}

          {isRealSun ? (
            hasSolarLocation ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">日期</span>
                    <Input
                      className="h-8 text-xs"
                      onChange={(event) => setSunStudyDate(event.target.value)}
                      type="date"
                      value={resolvedDate}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">时间</span>
                    <Input
                      className="h-8 text-xs"
                      onChange={(event) => {
                        const minutesOfDay = parseTimeInputValue(event.target.value)
                        if (minutesOfDay !== null) setSunMinutesOfDay(minutesOfDay)
                      }}
                      type="time"
                      value={formatSunMinutesOfDay(resolvedMinutesOfDay)}
                    />
                  </label>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-muted-foreground text-xs">
                    <span>日内时间</span>
                    <span>{formatSunMinutesOfDay(resolvedMinutesOfDay)}</span>
                  </div>
                  <Slider
                    max={23 * 60 + 59}
                    min={0}
                    onValueChange={(value) =>
                      setSunMinutesOfDay(value[0] ?? resolvedMinutesOfDay)
                    }
                    step={1}
                    value={[resolvedMinutesOfDay]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {QUICK_SUN_DATES.map((option) => {
                    const nextDate = getQuickSunStudyDate(option.dateKey, resolvedDate)
                    const isSelected = resolvedDate === nextDate

                    return (
                      <button
                        className={cn(
                          'rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors',
                          isSelected
                            ? 'border-primary/35 bg-primary/10 text-primary'
                            : 'border-border/55 bg-card text-muted-foreground hover:bg-accent/55 hover:text-foreground',
                        )}
                        key={option.dateKey}
                        onClick={() => setSunStudyDate(nextDate)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {realSunSummary ? (
                  <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                    方位角 {realSunSummary.azimuthDeg.toFixed(1)}°
                    {' · '}
                    高度角 {realSunSummary.elevationDeg.toFixed(1)}°
                    {realSunSummary.isAboveHorizon ? '' : ' · 地平线下'}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
                <span className="min-w-0 flex-1">
                  真实太阳需要先填写场地纬度、经度和有效时区。
                </span>
                <button
                  className="shrink-0 rounded-md border border-border/60 px-2 py-1 text-foreground transition-colors hover:bg-accent/55"
                  onClick={openSiteSolarSettings}
                  type="button"
                >
                  去设置
                </button>
              </div>
            )
          ) : (
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">太阳位置</div>
              <div className="grid grid-cols-2 gap-1">
                {SUN_TIME_OPTIONS.map((option) => {
                  const isSelected = sunStudy.timeOfDay === option.id

                  return (
                    <button
                      className={cn(
                        'rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                        isSelected
                          ? 'border-primary/35 bg-primary/10 text-primary'
                          : 'border-border/55 bg-card text-muted-foreground hover:bg-accent/55 hover:text-foreground',
                      )}
                      key={option.id}
                      onClick={() => setSunTimeOfDay(option.id as SunTimeOfDay)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WeatherIcon({ mode }: { mode: WeatherMode }) {
  switch (mode) {
    case 'rain':
      return <CloudRain className="h-4 w-4" />
    case 'snow':
      return <CloudSnow className="h-4 w-4" />
    case 'thunder':
      return <CloudLightning className="h-4 w-4" />
    case 'clear':
      return <CloudSun className="h-4 w-4" />
  }
}

const weatherModeLabels: Record<WeatherMode, string> = {
  clear: '晴天',
  rain: '雨天',
  snow: '下雪',
  thunder: '雷雨',
}

function WeatherControl() {
  const weather = useViewer((s) => s.weather)
  const setWeatherMode = useViewer((s) => s.setWeatherMode)
  const setWeatherIntensity = useViewer((s) => s.setWeatherIntensity)
  const setWeatherParticleSize = useViewer((s) => s.setWeatherParticleSize)
  const setWeatherWindDirection = useViewer((s) => s.setWeatherWindDirection)
  const setWeatherWindSpeed = useViewer((s) => s.setWeatherWindSpeed)
  const setWeatherSoundEnabled = useViewer((s) => s.setWeatherSoundEnabled)
  const mode = weather?.mode ?? 'clear'
  const intensity = weather?.intensity ?? 0
  const particleSize = weather?.particleSize ?? 0.5
  const windDirectionDeg = weather?.windDirectionDeg ?? 112
  const windSpeed = weather?.windSpeed ?? 0.34
  const soundEnabled = weather?.soundEnabled ?? false
  const isActive = mode !== 'clear'

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`天气：${weatherModeLabels[mode]}`}
              className={cn(TOOLBAR_BTN, isActive && 'bg-primary/10 text-primary')}
              title="天气"
              type="button"
            >
              <WeatherIcon mode={mode} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">天气</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" className="w-64" side="bottom">
        <DropdownMenuLabel>天气</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => setWeatherMode(value as WeatherMode)}
          value={mode}
        >
          {WEATHER_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              <span className="mr-2 flex h-4 w-4 items-center justify-center">
                <WeatherIcon mode={option.id} />
              </span>
              {weatherModeLabels[option.id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <div
          className="space-y-3 px-2 py-2"
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>强度</span>
              <span>{Math.round(intensity * 100)}%</span>
            </div>
            <Slider
              disabled={mode === 'clear'}
              max={1}
              min={0}
              onValueChange={(value) => setWeatherIntensity(value[0] ?? intensity)}
              step={0.01}
              value={[intensity]}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>粒子大小</span>
              <span>{Math.round(particleSize * 100)}%</span>
            </div>
            <Slider
              disabled={mode === 'clear'}
              max={1}
              min={0}
              onValueChange={(value) => setWeatherParticleSize(value[0] ?? particleSize)}
              step={0.01}
              value={[particleSize]}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>风速</span>
              <span>{Math.round(windSpeed * 100)}%</span>
            </div>
            <Slider
              disabled={mode === 'clear'}
              max={1}
              min={0}
              onValueChange={(value) => setWeatherWindSpeed(value[0] ?? windSpeed)}
              step={0.01}
              value={[windSpeed]}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>风向</span>
              <span>{Math.round(windDirectionDeg)}°</span>
            </div>
            <Slider
              disabled={mode === 'clear'}
              max={359}
              min={0}
              onValueChange={(value) => setWeatherWindDirection(value[0] ?? windDirectionDeg)}
              step={1}
              value={[windDirectionDeg]}
            />
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span>声音</span>
            </div>
            <Switch
              checked={soundEnabled}
              disabled={mode === 'clear'}
              onCheckedChange={(checked) => setWeatherSoundEnabled(checked === true)}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Level mode toggle ───────────────────────────────────────────────────────

const levelModeOrder = ['stacked', 'exploded', 'solo'] as const
const levelModeLabels: Record<string, string> = {
  manual: 'Stack',
  stacked: 'Stack',
  exploded: 'Exploded',
  solo: 'Solo',
}
function LevelModeToggle() {
  const levelMode = useViewer((s) => s.levelMode)
  const setLevelMode = useViewer((s) => s.setLevelMode)

  const cycle = () => {
    if (levelMode === 'manual') {
      setLevelMode('stacked')
      return
    }
    const idx = levelModeOrder.indexOf(levelMode as (typeof levelModeOrder)[number])
    const next = levelModeOrder[(idx + 1) % levelModeOrder.length]
    if (next) setLevelMode(next)
  }

  const isDefault = levelMode === 'stacked' || levelMode === 'manual'
  const LevelIcon = levelMode === 'exploded' ? Layers3 : Layers

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            'w-auto gap-1.5 px-2.5',
            !isDefault && 'bg-primary/10 text-primary',
          )}
          onClick={cycle}
          type="button"
        >
          <LevelIcon className="h-4 w-4 stroke-[2]" />
          <span className="font-medium text-xs">{levelModeLabels[levelMode] ?? 'Stack'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Levels: {levelMode === 'manual' ? 'Manual' : levelModeLabels[levelMode]}
      </TooltipContent>
    </Tooltip>
  )
}

// ── Wall mode toggle ────────────────────────────────────────────────────────

const wallModeOrder = ['cutaway', 'up', 'down'] as const
const wallModeConfig: Record<string, { label: string }> = {
  up: { label: 'Full height' },
  cutaway: { label: 'Cutaway' },
  down: { label: 'Low' },
}

function WallModeToggle() {
  const wallMode = useViewer((s) => s.wallMode)
  const setWallMode = useViewer((s) => s.setWallMode)

  const cycle = () => {
    const idx = wallModeOrder.indexOf(wallMode as (typeof wallModeOrder)[number])
    const next = wallModeOrder[(idx + 1) % wallModeOrder.length]
    if (next) setWallMode(next)
  }

  const config = wallModeConfig[wallMode] ?? wallModeConfig.cutaway!

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            'w-auto gap-1.5 px-2.5',
            wallMode !== 'cutaway'
              ? 'bg-primary/10 text-primary'
              : 'opacity-70 grayscale hover:opacity-100 hover:grayscale-0',
          )}
          onClick={cycle}
          type="button"
        >
          <BrickWall aria-hidden="true" className="h-4 w-4 stroke-[2]" />
          <span className="font-medium text-xs">{config.label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Walls: {config.label}</TooltipContent>
    </Tooltip>
  )
}

const sectionAxisLabels = {
  x: 'X',
  y: 'Y',
  z: 'Z',
} as const

function SectionPlaneControl() {
  const sectionPlane = useViewer((s) => s.sectionPlane)
  const setSectionPlane = useViewer((s) => s.setSectionPlane)
  const resetSectionPlane = useViewer((s) => s.resetSectionPlane)

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                TOOLBAR_BTN,
                'w-auto gap-1.5 px-2.5',
                sectionPlane.enabled && 'bg-primary/10 text-primary',
              )}
              type="button"
            >
              <Box className="h-4 w-4" />
              <span className="font-medium text-xs">剖切</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {sectionPlane.enabled ? `剖切 ${sectionAxisLabels[sectionPlane.axis]}` : '剖切'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" className="w-56" side="bottom">
        <DropdownMenuLabel>单平面剖切</DropdownMenuLabel>
        <div className="space-y-3 px-2 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-xs">启用</span>
            <Switch
              checked={sectionPlane.enabled}
              onCheckedChange={(checked) => setSectionPlane({ enabled: checked })}
            />
          </div>
          <div className="space-y-1.5">
            <div className="text-muted-foreground text-xs">轴向</div>
            <div className="grid grid-cols-3 gap-1">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <button
                  className={cn(
                    'h-7 rounded-md border border-border/70 font-semibold text-xs transition-colors hover:bg-accent',
                    sectionPlane.axis === axis && 'border-primary/40 bg-primary/10 text-primary',
                  )}
                  key={axis}
                  onClick={() => setSectionPlane({ axis })}
                  type="button"
                >
                  {sectionAxisLabels[axis]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">位置</span>
              <span className="font-mono">{sectionPlane.position.toFixed(1)} m</span>
            </div>
            <Slider
              max={20}
              min={-20}
              onValueChange={(value) => setSectionPlane({ position: value[0] ?? 0 })}
              step={0.1}
              value={[sectionPlane.position]}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-xs">反向</span>
            <Switch
              checked={sectionPlane.inverted}
              onCheckedChange={(checked) => setSectionPlane({ inverted: checked })}
            />
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => resetSectionPlane()}>重置剖切</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Camera mode toggle ──────────────────────────────────────────────────────

function CameraModeToggle() {
  const cameraMode = useViewer((s) => s.cameraMode)
  const setCameraMode = useViewer((s) => s.setCameraMode)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            cameraMode === 'orthographic' && 'bg-primary/10 text-primary',
          )}
          onClick={() =>
            setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective')
          }
          type="button"
        >
          <Camera className="h-4 w-4 stroke-[2]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {cameraMode === 'perspective' ? 'Perspective' : 'Orthographic'}
      </TooltipContent>
    </Tooltip>
  )
}

function PreviewButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="editor-icon-button flex min-h-9 items-center gap-1.5 px-3 font-semibold text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => useEditor.getState().setPreviewMode(true)}
          type="button"
        >
          <Eye className="h-4 w-4 stroke-[2]" />
          <span>Preview</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Preview mode</TooltipContent>
    </Tooltip>
  )
}

// ── Composed toolbar sections ───────────────────────────────────────────────

export function ViewerToolbarLeft() {
  return (
    <>
      <CollapseSidebarButton />
      <ViewModeControl />
    </>
  )
}

export function ViewerToolbarRight() {
  return (
    <div className={TOOLBAR_CONTAINER}>
      <LevelModeToggle />
      <WallModeToggle />
      <CharacterActorControl />
      <SectionPlaneControl />
      <div className="my-2 w-px bg-border/70" />
      <UnitToggle />
      <ThemeToggle />
      <OrientationSunControl />
      <WeatherControl />
      <CameraModeToggle />
      <MeasurementControl />
      <ViewpointCameraButton />
      <div className="my-2 w-px bg-border/70" />
      <WalkthroughButton />
      <PreviewButton />
    </div>
  )
}
