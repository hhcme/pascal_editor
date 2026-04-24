'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  type LevelNode,
  sceneRegistry,
  spatialGridManager,
  type SlabNode,
  useScene,
  type WallNode,
  type ZoneNode,
} from '@pascal-app/core'
import { useViewer, ZONE_LAYER } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { Camera, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Euler, Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three'
import { EDITOR_LAYER } from '../../lib/constants'
import { cn } from '../../lib/utils'
import useEditor, { type ViewpointEntryTarget } from '../../store/use-editor'

const EYE_HEIGHT = 1.65
const PICKER_MAP_WIDTH = 236
const PICKER_MAP_HEIGHT = 164
const PICKER_MAP_PADDING = 14

const pointer = new Vector2()
const raycaster = new Raycaster()
const groundPlane = new Plane(new Vector3(0, 1, 0), 0)
const groundHit = new Vector3()
const lookDirection = new Vector3()
const cameraEuler = new Euler(0, 0, 0, 'YXZ')

type PlanPoint = {
  x: number
  y: number
}

type PlanBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type ViewpointPlanData = {
  level: LevelNode | null
  levels: LevelNode[]
  buildingId: string | null
  buildingRotation: number
  slabs: SlabNode[]
  walls: WallNode[]
  zones: ZoneNode[]
  bounds: PlanBounds | null
}

function isVisibleInHierarchy(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function isTransformControlObject(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    const candidate = current as Object3D & {
      isTransformControls?: boolean
      isTransformControlsGizmo?: boolean
    }
    if (
      candidate.isTransformControls ||
      candidate.isTransformControlsGizmo ||
      current.type === 'TransformControlsGizmo'
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function rotatePlanPoint(point: PlanPoint, angle: number): PlanPoint {
  if (angle === 0) return point
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

function toPlanPoint(x: number, z: number, buildingRotation: number): PlanPoint {
  return rotatePlanPoint({ x: -x, y: -z }, buildingRotation)
}

function fromPlanPoint(point: PlanPoint, buildingRotation: number) {
  const local = rotatePlanPoint(point, -buildingRotation)
  return { x: -local.x, z: -local.y }
}

function getPlanBounds(points: PlanPoint[]): PlanBounds | null {
  if (points.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  if (maxX - minX < 1) {
    minX -= 0.5
    maxX += 0.5
  }

  if (maxY - minY < 1) {
    minY -= 0.5
    maxY += 0.5
  }

  return { minX, maxX, minY, maxY }
}

function polygonCentroid(points: [number, number][]) {
  if (points.length === 0) return null

  let twiceArea = 0
  let cx = 0
  let cz = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    const cross = current[0] * next[1] - next[0] * current[1]
    twiceArea += cross
    cx += (current[0] + next[0]) * cross
    cz += (current[1] + next[1]) * cross
  }

  if (Math.abs(twiceArea) < 1e-6) {
    const sum = points.reduce((acc, point) => ({ x: acc.x + point[0], z: acc.z + point[1] }), {
      x: 0,
      z: 0,
    })
    return { x: sum.x / points.length, z: sum.z / points.length }
  }

  return { x: cx / (3 * twiceArea), z: cz / (3 * twiceArea) }
}

function pointInPolygon(x: number, z: number, polygon: [number, number][]) {
  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]!
    const previousPoint = polygon[previous]!
    const intersects =
      currentPoint[1] > z !== previousPoint[1] > z &&
      x <
        ((previousPoint[0] - currentPoint[0]) * (z - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0]

    if (intersects) inside = !inside
  }

  return inside
}

function getLevelYOffset(levelId: AnyNodeId | null | undefined) {
  if (!levelId) return 0
  return sceneRegistry.nodes.get(levelId)?.position.y ?? 0
}

function getViewpointCameraY(levelId: AnyNodeId | null, x: number, z: number) {
  if (!levelId) return EYE_HEIGHT
  return (
    getLevelYOffset(levelId) + spatialGridManager.getSlabElevationAt(levelId, x, z) + EYE_HEIGHT
  )
}

function getCurrentYawFromCamera(camera: { getWorldDirection: (target: Vector3) => Vector3 }) {
  camera.getWorldDirection(lookDirection)
  lookDirection.y = 0

  if (lookDirection.lengthSq() < 1e-6) return 0

  lookDirection.normalize()
  return Math.atan2(-lookDirection.x, -lookDirection.z)
}

function collectLevelNodes<T extends AnyNode>(
  nodes: Record<string, AnyNode>,
  level: LevelNode | null,
  type: T['type'],
) {
  if (!level) return [] as T[]

  return level.children
    .map((childId) => nodes[childId])
    .filter((node): node is T => node?.type === type)
}

function buildPlanData(
  nodes: Record<string, AnyNode>,
  rootNodeIds: string[],
  selectedLevelId: string | null,
  selectedBuildingId: string | null,
): ViewpointPlanData {
  const selectedLevel = selectedLevelId ? nodes[selectedLevelId] : null
  const level = selectedLevel?.type === 'level' ? (selectedLevel as LevelNode) : null
  let buildingId =
    level?.parentId ??
    selectedBuildingId ??
    Object.values(nodes).find((node) => node?.type === 'building')?.id ??
    null

  if (!buildingId) {
    const site = rootNodeIds.map((nodeId) => nodes[nodeId]).find((node) => node?.type === 'site')
    const firstBuildingId =
      site && 'children' in site && Array.isArray(site.children) ? site.children[0] : null
    buildingId = typeof firstBuildingId === 'string' ? firstBuildingId : null
  }

  const buildingNode = buildingId ? nodes[buildingId] : null
  const building = buildingNode?.type === 'building' ? (buildingNode as BuildingNode) : null
  const levels = (building?.children ?? [])
    .map((childId) => nodes[childId])
    .filter((node): node is LevelNode => node?.type === 'level')
    .sort((a, b) => a.level - b.level)
  const activeLevel = level ?? levels[0] ?? null
  const slabs = collectLevelNodes<SlabNode>(nodes, activeLevel, 'slab')
  const walls = collectLevelNodes<WallNode>(nodes, activeLevel, 'wall')
  const zones = collectLevelNodes<ZoneNode>(nodes, activeLevel, 'zone')
  const buildingRotation = building?.rotation[1] ?? 0
  const points: PlanPoint[] = []
  const addPoint = (x: number, z: number) => {
    points.push(toPlanPoint(x, z, buildingRotation))
  }

  for (const slab of slabs) {
    for (const [x, z] of slab.polygon) addPoint(x, z)
  }
  for (const wall of walls) {
    addPoint(wall.start[0], wall.start[1])
    addPoint(wall.end[0], wall.end[1])
  }
  for (const zone of zones) {
    for (const [x, z] of zone.polygon) addPoint(x, z)
  }

  return {
    level: activeLevel,
    levels,
    buildingId: building?.id ?? buildingId,
    buildingRotation,
    slabs,
    walls,
    zones,
    bounds: getPlanBounds(points),
  }
}

function findNearestStandingPoint(target: { x: number; z: number }, zones: ZoneNode[]) {
  const containingZone = zones.find((zone) => pointInPolygon(target.x, target.z, zone.polygon))
  if (containingZone) return target

  let nearest: { x: number; z: number; distance: number } | null = null

  for (const zone of zones) {
    const centroid = polygonCentroid(zone.polygon)
    if (!centroid) continue

    const distance = Math.hypot(centroid.x - target.x, centroid.z - target.z)
    if (!nearest || distance < nearest.distance) {
      nearest = { ...centroid, distance }
    }
  }

  return nearest ? { x: nearest.x, z: nearest.z } : target
}

export function ViewpointPlacementController() {
  const isPlacementMode = useEditor((s) => s.isViewpointPlacementMode)
  const pendingTarget = useEditor((s) => s.viewpointEntryTarget)
  const activeLevelId = useViewer((s) => s.selection.levelId)
  const { camera, gl, scene } = useThree()
  const activeRef = useRef(isPlacementMode)
  const levelIdRef = useRef(activeLevelId)

  useEffect(() => {
    activeRef.current = isPlacementMode
    gl.domElement.style.cursor = isPlacementMode ? 'crosshair' : ''

    return () => {
      if (activeRef.current) {
        gl.domElement.style.cursor = ''
      }
    }
  }, [gl, isPlacementMode])

  useEffect(() => {
    levelIdRef.current = activeLevelId
  }, [activeLevelId])

  const enterViewpoint = useCallback(
    (target: Pick<ViewpointEntryTarget, 'x' | 'z' | 'yaw'>) => {
      const levelId = levelIdRef.current
      const yaw = target.yaw ?? getCurrentYawFromCamera(camera)

      camera.position.set(target.x, getViewpointCameraY(levelId, target.x, target.z), target.z)
      cameraEuler.set(0, yaw, 0, 'YXZ')
      camera.quaternion.setFromEuler(cameraEuler)
      camera.updateMatrixWorld()

      useEditor.getState().completeViewpointPlacement()
    },
    [camera],
  )

  useEffect(() => {
    if (!pendingTarget) return
    enterViewpoint(pendingTarget)
  }, [enterViewpoint, pendingTarget])

  useEffect(() => {
    raycaster.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(ZONE_LAYER)

    const pickFromCanvas = (event: PointerEvent) => {
      if (!activeRef.current || event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      const rect = gl.domElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)

      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find(
          (intersection) =>
            isVisibleInHierarchy(intersection.object) &&
            !isTransformControlObject(intersection.object),
        )

      if (hit) {
        enterViewpoint({ x: hit.point.x, z: hit.point.z })
        return
      }

      groundPlane.constant = -getLevelYOffset(levelIdRef.current)
      if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
        enterViewpoint({ x: groundHit.x, z: groundHit.z })
      }
    }

    gl.domElement.addEventListener('pointerdown', pickFromCanvas, true)
    return () => {
      gl.domElement.removeEventListener('pointerdown', pickFromCanvas, true)
    }
  }, [camera, enterViewpoint, gl, scene])

  return null
}

export function ViewpointPlacementOverlay() {
  const isPlacementMode = useEditor((s) => s.isViewpointPlacementMode)
  const requestViewpointEntry = useEditor((s) => s.requestViewpointEntry)
  const cancelPlacement = useEditor((s) => s.setViewpointPlacementMode)
  const selection = useViewer((s) => s.selection)
  const setSelection = useViewer((s) => s.setSelection)
  const sceneNodes = useScene((s) => s.nodes as Record<string, AnyNode>)
  const rootNodeIds = useScene((s) => s.rootNodeIds)
  const planData = useMemo(
    () =>
      buildPlanData(
        sceneNodes,
        rootNodeIds,
        selection.levelId,
        selection.buildingId as string | null,
      ),
    [rootNodeIds, sceneNodes, selection.buildingId, selection.levelId],
  )

  useEffect(() => {
    if (!isPlacementMode) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cancelPlacement(false)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [cancelPlacement, isPlacementMode])

  if (!isPlacementMode) return null

  return (
    <div className="pointer-events-none absolute top-16 left-4 z-30 w-[268px] text-foreground">
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-border/70 bg-background/95 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 border-border/60 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Camera className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-xs">取景点</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {planData.level?.name ??
                  (planData.level ? `Level ${planData.level.level}` : '当前楼层')}
              </div>
            </div>
          </div>
          <button
            aria-label="关闭取景点选择"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => cancelPlacement(false)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {planData.levels.length > 1 ? (
          <div className="flex gap-1 overflow-x-auto border-border/60 border-b px-2 py-2">
            {planData.levels.map((level) => {
              const active = level.id === planData.level?.id
              const label = level.name?.trim() || `L${level.level}`

              return (
                <button
                  className={cn(
                    'h-7 shrink-0 rounded-md px-2 font-medium text-[11px] transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  key={level.id}
                  onClick={() =>
                    setSelection({
                      buildingId: planData.buildingId as BuildingNode['id'] | null,
                      levelId: level.id as LevelNode['id'],
                      zoneId: null,
                      selectedIds: [],
                    })
                  }
                  title={label}
                  type="button"
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : null}

        <ViewpointMiniFloorplan
          planData={planData}
          onPick={(target) => requestViewpointEntry(target)}
        />
      </div>
    </div>
  )
}

function ViewpointMiniFloorplan({
  planData,
  onPick,
}: {
  planData: ViewpointPlanData
  onPick: (target: ViewpointEntryTarget) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const bounds = planData.bounds

  const projection = useMemo(() => {
    if (!bounds) return null

    const worldWidth = bounds.maxX - bounds.minX
    const worldHeight = bounds.maxY - bounds.minY
    const scale = Math.min(
      (PICKER_MAP_WIDTH - PICKER_MAP_PADDING * 2) / worldWidth,
      (PICKER_MAP_HEIGHT - PICKER_MAP_PADDING * 2) / worldHeight,
    )
    const offsetX = (PICKER_MAP_WIDTH - worldWidth * scale) / 2
    const offsetY = (PICKER_MAP_HEIGHT - worldHeight * scale) / 2

    return {
      project: (x: number, z: number) => {
        const point = toPlanPoint(x, z, planData.buildingRotation)

        return {
          x: offsetX + (point.x - bounds.minX) * scale,
          y: offsetY + (point.y - bounds.minY) * scale,
        }
      },
      unproject: (x: number, y: number) => {
        const point = {
          x: (x - offsetX) / scale + bounds.minX,
          y: (y - offsetY) / scale + bounds.minY,
        }
        return fromPlanPoint(point, planData.buildingRotation)
      },
    }
  }, [bounds, planData.buildingRotation])

  const handlePick = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!projection || !svgRef.current) return

      const rect = svgRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const svgX = ((event.clientX - rect.left) / rect.width) * PICKER_MAP_WIDTH
      const svgY = ((event.clientY - rect.top) / rect.height) * PICKER_MAP_HEIGHT
      const target = findNearestStandingPoint(projection.unproject(svgX, svgY), planData.zones)

      onPick({ ...target, source: 'floorplan' })
    },
    [onPick, planData.zones, projection],
  )

  if (!(bounds && projection)) {
    return (
      <div className="mx-3 my-3 flex h-[164px] items-center justify-center rounded-md bg-muted/50 text-[11px] text-muted-foreground">
        暂无平面图数据
      </div>
    )
  }

  return (
    <svg
      aria-label="取景点平面图"
      className="mx-3 my-3 block cursor-crosshair rounded-md border border-border/70 bg-muted/30"
      height={PICKER_MAP_HEIGHT}
      onPointerDown={handlePick}
      ref={svgRef}
      role="application"
      viewBox={`0 0 ${PICKER_MAP_WIDTH} ${PICKER_MAP_HEIGHT}`}
      width={PICKER_MAP_WIDTH}
    >
      {planData.slabs.map((slab) => {
        if (slab.polygon.length < 3) return null
        const points = slab.polygon
          .map(([x, z]) => {
            const point = projection.project(x, z)
            return `${point.x},${point.y}`
          })
          .join(' ')

        return (
          <polygon
            fill="hsl(var(--muted-foreground) / 0.12)"
            key={slab.id}
            points={points}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        )
      })}

      {planData.zones.map((zone) => {
        if (zone.polygon.length < 3) return null
        const points = zone.polygon
          .map(([x, z]) => {
            const point = projection.project(x, z)
            return `${point.x},${point.y}`
          })
          .join(' ')
        const centroid = polygonCentroid(zone.polygon)
        const labelPoint = centroid ? projection.project(centroid.x, centroid.z) : null

        return (
          <g key={zone.id}>
            <title>{zone.name}</title>
            <polygon
              fill={zone.color}
              fillOpacity={0.18}
              points={points}
              stroke={zone.color}
              strokeOpacity={0.72}
              strokeWidth={1.3}
            />
            {labelPoint ? (
              <text
                fill="hsl(var(--foreground))"
                fontSize={7}
                fontWeight={700}
                paintOrder="stroke"
                pointerEvents="none"
                stroke="hsl(var(--background) / 0.9)"
                strokeLinejoin="round"
                strokeWidth={2.2}
                textAnchor="middle"
                x={labelPoint.x}
                y={labelPoint.y + 2.2}
              >
                {zone.name}
              </text>
            ) : null}
          </g>
        )
      })}

      {planData.walls.map((wall) => {
        const start = projection.project(wall.start[0], wall.start[1])
        const end = projection.project(wall.end[0], wall.end[1])

        return (
          <line
            key={wall.id}
            stroke="hsl(var(--foreground) / 0.58)"
            strokeLinecap="round"
            strokeWidth={2}
            x1={start.x}
            x2={end.x}
            y1={start.y}
            y2={end.y}
          />
        )
      })}
    </svg>
  )
}
