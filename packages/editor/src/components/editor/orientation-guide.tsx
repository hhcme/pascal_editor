'use client'

import { type SiteNode, sceneRegistry, useScene } from '@pascal-app/core'
import {
  formatSunMinutesOfDay,
  getDefaultSunStudyDate,
  getSolarPathForLocation,
  getSolarPositionForLocation,
  getSunPathPosition,
  getSunPositionFromAngles,
  getSunPositionForProgress,
  resolveSiteSolarLocation,
  resolveSunMinutesOfDay,
  resolveSunProgress,
  resolveSunStudyDate,
  type ResolvedSiteSolarLocation,
  useViewer,
} from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BufferGeometry,
  type Camera,
  Float32BufferAttribute,
  type Object3D,
  type Ray,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { EDITOR_LAYER } from '../../lib/constants'
import {
  degreesToRadians,
  getSiteOrientationDegrees,
  normalizeDegrees,
} from '../../lib/orientation'
import useEditor from '../../store/use-editor'

type SiteBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  centerX: number
  centerZ: number
  radius: number
}

const CARDINALS = [
  { key: 'north', label: 'N', caption: '北' },
  { key: 'east', label: 'E', caption: '东' },
  { key: 'south', label: 'S', caption: '南' },
  { key: 'west', label: 'W', caption: '西' },
] as const

const SUN_DRAG_SAMPLE_COUNT = 144
const COMPASS_OFFSET_RATIO = 0.36
const COMPASS_MIN_OFFSET = 6
const COMPASS_LINE_INNER_OFFSET_RATIO = 0.2
const COMPASS_LINE_OUTER_OFFSET_RATIO = 0.64
const COMPASS_MARKER_SAMPLE_RADIUS_PX = 16
const COMPASS_OCCLUSION_MARGIN = 0.08
const COMPASS_OCCLUDER_TYPES = [
  'ceiling',
  'door',
  'fence',
  'item',
  'roof',
  'slab',
  'stair',
  'wall',
  'window',
] as const satisfies Array<keyof typeof sceneRegistry.byType>
const COMPASS_OCCLUSION_SAMPLES = [
  [0, 0],
  [-COMPASS_MARKER_SAMPLE_RADIUS_PX, -COMPASS_MARKER_SAMPLE_RADIUS_PX],
  [COMPASS_MARKER_SAMPLE_RADIUS_PX, -COMPASS_MARKER_SAMPLE_RADIUS_PX],
  [-COMPASS_MARKER_SAMPLE_RADIUS_PX, COMPASS_MARKER_SAMPLE_RADIUS_PX],
  [COMPASS_MARKER_SAMPLE_RADIUS_PX, COMPASS_MARKER_SAMPLE_RADIUS_PX],
] as const
const sunDragPoint = new Vector3()
const htmlPosition = new Vector3()

type RealSunPathPoint = {
  isAboveHorizon: boolean
  minutesOfDay: number
  position: [number, number, number]
}

type HtmlCalculatePosition = (
  el: Object3D,
  camera: Camera,
  size: { width: number; height: number },
) => number[]

function rotateLocalOffset(
  position: [number, number, number],
  orientationDegrees: number,
): [number, number, number] {
  const rotation = degreesToRadians(orientationDegrees)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const [x, y, z] = position

  return [x * cos + z * sin, y, -x * sin + z * cos]
}

function getClosestSunPathProgress(
  ray: Ray,
  bounds: SiteBounds,
  radius: number,
  orientationDegrees: number,
) {
  let closestProgress = 0
  let closestDistance = Number.POSITIVE_INFINITY

  for (let step = 0; step <= SUN_DRAG_SAMPLE_COUNT; step++) {
    const progress = step / SUN_DRAG_SAMPLE_COUNT
    const [x, y, z] = rotateLocalOffset(getSunPathPosition(progress, radius), orientationDegrees)

    sunDragPoint.set(bounds.centerX + x, y, bounds.centerZ + z)

    const distance = ray.distanceSqToPoint(sunDragPoint)
    if (distance < closestDistance) {
      closestDistance = distance
      closestProgress = progress
    }
  }

  return closestProgress
}

function getSiteBounds(points: Array<[number, number]>): SiteBounds | null {
  if (points.length < 2) return null

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const [x, z] of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null

  const width = maxX - minX
  const depth = maxZ - minZ
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX,
    centerZ,
    radius: Math.max(width, depth, 20) / 2,
  }
}

function getDirectionVector(degrees: number) {
  const radians = (normalizeDegrees(degrees) * Math.PI) / 180
  return {
    x: Math.sin(radians),
    z: -Math.cos(radians),
  }
}

function collectCompassOccluders() {
  const objects: Object3D[] = []
  const seen = new Set<Object3D>()

  for (const type of COMPASS_OCCLUDER_TYPES) {
    for (const id of sceneRegistry.byType[type]) {
      const object = sceneRegistry.nodes.get(id)
      if (!(object?.visible && !seen.has(object))) continue

      seen.add(object)
      objects.push(object)
    }
  }

  return objects
}

function isVisibleOcclusionHit(object: Object3D) {
  let current: Object3D | null = object

  while (current) {
    if (!current.visible || current.userData.__raycastDisabled === true) return false
    current = current.parent
  }

  return true
}

function isCompassMarkerOccluded({
  camera,
  markerWorldPosition,
  markerClipPosition,
  raycaster,
  sampleClipPosition,
  sampleNdc,
  size,
  targetWorldPosition,
}: {
  camera: Camera
  markerWorldPosition: Vector3
  markerClipPosition: Vector3
  raycaster: Raycaster
  sampleClipPosition: Vector3
  sampleNdc: Vector2
  size: { width: number; height: number }
  targetWorldPosition: Vector3
}) {
  const occluders = collectCompassOccluders()
  if (!(occluders.length && size.width > 0 && size.height > 0)) return false

  markerClipPosition.copy(markerWorldPosition).project(camera)
  if (markerClipPosition.z < -1 || markerClipPosition.z > 1) return false

  for (const [offsetX, offsetY] of COMPASS_OCCLUSION_SAMPLES) {
    sampleClipPosition.set(
      markerClipPosition.x + (offsetX / size.width) * 2,
      markerClipPosition.y - (offsetY / size.height) * 2,
      markerClipPosition.z,
    )
    targetWorldPosition.copy(sampleClipPosition).unproject(camera)

    const targetDistance = camera.position.distanceTo(targetWorldPosition)
    sampleNdc.set(sampleClipPosition.x, sampleClipPosition.y)
    raycaster.setFromCamera(sampleNdc, camera)

    const hits = raycaster.intersectObjects(occluders, true)
    const hasBlockingHit = hits.some(
      (hit) =>
        hit.distance < targetDistance - COMPASS_OCCLUSION_MARGIN &&
        isVisibleOcclusionHit(hit.object),
    )

    if (hasBlockingHit) return true
  }

  return false
}

function calculateTriViewPerspectiveHtmlPosition(
  el: Object3D,
  camera: Camera,
  size: { width: number; height: number },
) {
  const width = Math.floor(size.width)
  const height = Math.floor(size.height)
  if (width < 4 || height < 4) return [0, 0]

  const leftWidth = Math.floor(width / 2)
  const rightWidth = width - leftWidth
  const bottomHeight = Math.floor(height / 2)
  const topHeight = height - bottomHeight

  htmlPosition.setFromMatrixPosition(el.matrixWorld)
  htmlPosition.project(camera)

  return [
    leftWidth + (htmlPosition.x * 0.5 + 0.5) * rightWidth,
    (-htmlPosition.y * 0.5 + 0.5) * topHeight,
  ]
}

function createCardinalLineGeometry(
  bounds: SiteBounds,
  offset: number,
  orientationDegrees: number,
) {
  const y = 0.14
  const innerDistance = bounds.radius + offset * COMPASS_LINE_INNER_OFFSET_RATIO
  const outerDistance = bounds.radius + offset * COMPASS_LINE_OUTER_OFFSET_RATIO
  const positions: number[] = []

  for (const degrees of [0, 90, 180, 270]) {
    const direction = getDirectionVector(orientationDegrees + degrees)
    positions.push(
      bounds.centerX + direction.x * innerDistance,
      y,
      bounds.centerZ + direction.z * innerDistance,
      bounds.centerX + direction.x * outerDistance,
      y,
      bounds.centerZ + direction.z * outerDistance,
    )
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function createSunPathGeometry(radius: number, orientationDegrees: number) {
  const points: Array<[number, number, number]> = []
  const steps = 36

  for (let i = 0; i <= steps; i++) {
    points.push(rotateLocalOffset(getSunPathPosition(i / steps, radius), orientationDegrees))
  }

  return createPathGeometry(points)
}

function createPathGeometry(points: Array<[number, number, number]>) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3))
  return geometry
}

function getClosestRealSunMinutes(
  ray: Ray,
  bounds: SiteBounds,
  samples: RealSunPathPoint[],
) {
  if (samples.length === 0) return null

  let closestMinutes = samples[0]?.minutesOfDay ?? null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const sample of samples) {
    const [x, y, z] = sample.position
    sunDragPoint.set(bounds.centerX + x, y, bounds.centerZ + z)

    const distance = ray.distanceSqToPoint(sunDragPoint)
    if (distance < closestDistance) {
      closestDistance = distance
      closestMinutes = sample.minutesOfDay
    }
  }

  return closestMinutes
}

function getCardinalPosition(
  bounds: SiteBounds,
  key: (typeof CARDINALS)[number]['key'],
  offset: number,
  orientationDegrees: number,
): [number, number, number] {
  const y = 0.34
  const directionDegrees = key === 'north' ? 0 : key === 'east' ? 90 : key === 'south' ? 180 : 270
  const direction = getDirectionVector(orientationDegrees + directionDegrees)
  const distance = bounds.radius + offset

  return [bounds.centerX + direction.x * distance, y, bounds.centerZ + direction.z * distance]
}

function CardinalMarker({
  label,
  caption,
  position,
  isDark,
  calculatePosition,
}: {
  label: string
  caption: string
  position: [number, number, number]
  isDark: boolean
  calculatePosition?: HtmlCalculatePosition
}) {
  const [isOccluded, setIsOccluded] = useState(false)
  const isOccludedRef = useRef(false)
  const raycaster = useMemo(() => new Raycaster(), [])
  const markerWorldPosition = useMemo(() => new Vector3(), [])
  const markerClipPosition = useMemo(() => new Vector3(), [])
  const sampleClipPosition = useMemo(() => new Vector3(), [])
  const sampleNdc = useMemo(() => new Vector2(), [])
  const targetWorldPosition = useMemo(() => new Vector3(), [])

  useFrame(({ camera, size }) => {
    markerWorldPosition.set(position[0], position[1], position[2])

    const nextIsOccluded = isCompassMarkerOccluded({
      camera,
      markerWorldPosition,
      markerClipPosition,
      raycaster,
      sampleClipPosition,
      sampleNdc,
      size,
      targetWorldPosition,
    })

    if (nextIsOccluded === isOccludedRef.current) return

    isOccludedRef.current = nextIsOccluded
    setIsOccluded(nextIsOccluded)
  })

  return (
    <Html
      calculatePosition={calculatePosition}
      center
      position={position}
      zIndexRange={[20, 0]}
      style={{
        opacity: isOccluded ? 0 : 1,
        pointerEvents: 'none',
        transition: 'opacity 120ms ease',
        userSelect: 'none',
      }}
    >
      <div
        className="flex h-7 w-7 flex-col items-center justify-center rounded-full border font-medium shadow-sm backdrop-blur-sm"
        style={{
          background: isDark ? 'rgb(15 23 42 / 0.56)' : 'rgb(255 255 255 / 0.62)',
          borderColor: isDark ? 'rgb(226 232 240 / 0.14)' : 'rgb(51 65 85 / 0.1)',
          color: isDark ? '#e2e8f0' : '#475569',
          opacity: 0.74,
        }}
      >
        <span className="font-mono text-[11px] leading-none">{label}</span>
        <span className="mt-0.5 text-[8px] leading-none opacity-60">{caption}</span>
      </div>
    </Html>
  )
}

function SunPath({
  bounds,
  isDark,
  orientationDegrees,
  solarLocation,
}: {
  bounds: SiteBounds
  isDark: boolean
  orientationDegrees: number
  solarLocation: ResolvedSiteSolarLocation | null
}) {
  const sunStudy = useViewer((state) => state.sunStudy)
  const setSunProgress = useViewer((state) => state.setSunProgress)
  const setSunMinutesOfDay = useViewer((state) => state.setSunMinutesOfDay)
  const radius = Math.max(bounds.radius * 1.75, 22)
  const isRealSun = sunStudy.mode === 'real' && solarLocation
  const realSunDate = resolveSunStudyDate(sunStudy.date) ?? getDefaultSunStudyDate()
  const realSunSamples = useMemo(() => {
    if (!(sunStudy.mode === 'real' && solarLocation)) return []

    return getSolarPathForLocation(solarLocation, realSunDate, 5)
      .filter((sample) => sample.elevationDeg > 0)
      .map(
        (sample): RealSunPathPoint => ({
          isAboveHorizon: sample.isAboveHorizon,
          minutesOfDay: sample.minutesOfDay,
          position: rotateLocalOffset(
            getSunPositionFromAngles(sample.azimuthDeg, Math.max(sample.elevationDeg, 0), radius),
            orientationDegrees,
          ),
        }),
      )
  }, [orientationDegrees, radius, realSunDate, solarLocation, sunStudy.mode])
  const pathGeometry = useMemo(() => {
    if (isRealSun) {
      const points = realSunSamples.map((sample) => sample.position)
      return points.length >= 2 ? createPathGeometry(points) : null
    }

    return createSunPathGeometry(radius, orientationDegrees)
  }, [isRealSun, orientationDegrees, radius, realSunSamples])
  const sunProgress = resolveSunProgress(sunStudy.timeOfDay, sunStudy.progress)
  const realSunState = useMemo(() => {
    if (!(sunStudy.mode === 'real' && solarLocation)) return null

    const solarPosition = getSolarPositionForLocation(
      solarLocation,
      realSunDate,
      resolveSunMinutesOfDay(sunStudy.minutesOfDay),
    )

    if (!solarPosition) return null

    return {
      isAboveHorizon: solarPosition.isAboveHorizon,
      position: rotateLocalOffset(
        getSunPositionFromAngles(solarPosition.azimuthDeg, Math.max(solarPosition.elevationDeg, 0), radius),
        orientationDegrees,
      ),
    }
  }, [orientationDegrees, radius, realSunDate, solarLocation, sunStudy.minutesOfDay, sunStudy.mode])
  const sunPosition =
    realSunState?.position ??
    rotateLocalOffset(getSunPositionForProgress(sunProgress, radius), orientationDegrees)
  const isSunAboveHorizon = realSunState?.isAboveHorizon ?? true
  const sunLabel =
    isRealSun && solarLocation
      ? `${formatSunMinutesOfDay(resolveSunMinutesOfDay(sunStudy.minutesOfDay))}${isSunAboveHorizon ? '' : ' · 夜间'}`
      : '太阳'
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const setCursor = useCallback((cursor: string) => {
    document.body.style.cursor = cursor
  }, [])

  const updateSunProgressFromPointer = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (isRealSun) {
        const minutesOfDay = getClosestRealSunMinutes(event.ray, bounds, realSunSamples)
        if (minutesOfDay !== null) {
          setSunMinutesOfDay(minutesOfDay)
        }
        return
      }

      setSunProgress(getClosestSunPathProgress(event.ray, bounds, radius, orientationDegrees))
    },
    [bounds, isRealSun, orientationDegrees, radius, realSunSamples, setSunMinutesOfDay, setSunProgress],
  )

  const handleSunPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      const target = event.target as Element
      target.setPointerCapture?.(event.pointerId)
      draggingRef.current = true
      setIsDragging(true)
      setCursor('grabbing')
      useViewer.getState().setCameraDragging(true)
      updateSunProgressFromPointer(event)
    },
    [setCursor, updateSunProgressFromPointer],
  )

  const handleSunPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!draggingRef.current) return

      event.stopPropagation()
      updateSunProgressFromPointer(event)
    },
    [updateSunProgressFromPointer],
  )

  const handleSunPointerEnd = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      const target = event.target as Element
      target.releasePointerCapture?.(event.pointerId)
      draggingRef.current = false
      setIsDragging(false)
      setCursor('')
      useViewer.getState().setCameraDragging(false)
    },
    [setCursor],
  )

  const handleSunPointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      if (!draggingRef.current) setCursor('grab')
    },
    [setCursor],
  )

  const handleSunPointerOut = useCallback(() => {
    if (!draggingRef.current) setCursor('')
  }, [setCursor])

  useEffect(
    () => () => {
      if (draggingRef.current) useViewer.getState().setCameraDragging(false)
      document.body.style.cursor = ''
    },
    [],
  )

  return (
    <group layers={EDITOR_LAYER} position={[bounds.centerX, 0, bounds.centerZ]}>
      {pathGeometry ? (
        /* @ts-ignore */
        <line geometry={pathGeometry} layers={EDITOR_LAYER} renderOrder={8}>
          <lineBasicMaterial color={isDark ? '#fbbf24' : '#d97706'} opacity={0.72} transparent />
        </line>
      ) : null}
      <mesh
        layers={EDITOR_LAYER}
        onPointerCancel={handleSunPointerEnd}
        onPointerDown={handleSunPointerDown}
        onPointerMove={handleSunPointerMove}
        onPointerOut={handleSunPointerOut}
        onPointerOver={handleSunPointerOver}
        onPointerUp={handleSunPointerEnd}
        position={sunPosition}
        renderOrder={10}
      >
        <sphereGeometry args={[1.25, 16, 12]} />
        <meshBasicMaterial color="#f59e0b" depthWrite={false} opacity={0} transparent />
      </mesh>
      <mesh
        layers={EDITOR_LAYER}
        position={sunPosition}
        renderOrder={9}
        scale={isDragging ? 1.16 : 1}
      >
        <sphereGeometry args={[0.55, 24, 16]} />
        <meshBasicMaterial
          color={isSunAboveHorizon ? '#f59e0b' : '#94a3b8'}
          opacity={isSunAboveHorizon ? 1 : 0.7}
          toneMapped={false}
          transparent={!isSunAboveHorizon}
        />
      </mesh>
      <Html center position={sunPosition} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div
          className="mt-12 whitespace-nowrap rounded-full border px-2 py-1 font-medium text-[10px] shadow-lg backdrop-blur-md"
          style={{
            background: isDark ? 'rgb(15 23 42 / 0.78)' : 'rgb(255 251 235 / 0.9)',
            borderColor: isDark ? 'rgb(251 191 36 / 0.32)' : 'rgb(217 119 6 / 0.22)',
            color: isDark ? '#fde68a' : '#92400e',
          }}
        >
          {sunLabel}
        </div>
      </Html>
    </group>
  )
}

export function OrientationGuide() {
  const showCompass = useViewer((state) => state.showCompass)
  const sunEnabled = useViewer((state) => state.sunStudy.enabled)
  const theme = useViewer((state) => state.theme)
  const viewMode = useEditor((state) => state.viewMode)
  const siteNode = useScene((state) => {
    const rootId = state.rootNodeIds[0]
    const node = rootId ? state.nodes[rootId] : null
    return node?.type === 'site' ? (node as SiteNode) : null
  })
  const sitePoints = siteNode?.polygon.points ?? null
  const orientationDegrees = getSiteOrientationDegrees(siteNode)
  const solarLocation = resolveSiteSolarLocation(siteNode)

  const bounds = useMemo(() => getSiteBounds(sitePoints ?? []), [sitePoints])
  const offset = bounds ? Math.max(bounds.radius * COMPASS_OFFSET_RATIO, COMPASS_MIN_OFFSET) : 3
  const lineGeometry = useMemo(
    () => (bounds ? createCardinalLineGeometry(bounds, offset, orientationDegrees) : null),
    [bounds, offset, orientationDegrees],
  )
  const markerCalculatePosition =
    viewMode === 'tri-view' ? calculateTriViewPerspectiveHtmlPosition : undefined
  const isDark = theme === 'dark'

  if (!(bounds && lineGeometry && (showCompass || sunEnabled))) return null

  return (
    <group layers={EDITOR_LAYER}>
      {showCompass ? (
        <>
          {/* @ts-ignore */}
          <lineSegments geometry={lineGeometry} layers={EDITOR_LAYER} renderOrder={7}>
            <lineBasicMaterial color={isDark ? '#93c5fd' : '#2563eb'} opacity={0.16} transparent />
          </lineSegments>
          {CARDINALS.map((cardinal) => (
            <CardinalMarker
              caption={cardinal.caption}
              calculatePosition={markerCalculatePosition}
              isDark={isDark}
              key={cardinal.key}
              label={cardinal.label}
              position={getCardinalPosition(bounds, cardinal.key, offset, orientationDegrees)}
            />
          ))}
        </>
      ) : null}
      {sunEnabled ? (
        <SunPath
          bounds={bounds}
          isDark={isDark}
          orientationDegrees={orientationDegrees}
          solarLocation={solarLocation}
        />
      ) : null}
    </group>
  )
}
