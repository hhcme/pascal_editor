'use client'

import type { SiteNode } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import {
  getSunPathPosition,
  getSunPositionForProgress,
  resolveSunProgress,
  useViewer,
} from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, Float32BufferAttribute, type Ray, Vector3 } from 'three'
import { EDITOR_LAYER } from '../../lib/constants'

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
const sunDragPoint = new Vector3()

function getClosestSunPathProgress(ray: Ray, bounds: SiteBounds, radius: number) {
  let closestProgress = 0
  let closestDistance = Number.POSITIVE_INFINITY

  for (let step = 0; step <= SUN_DRAG_SAMPLE_COUNT; step++) {
    const progress = step / SUN_DRAG_SAMPLE_COUNT
    const [x, y, z] = getSunPathPosition(progress, radius)

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

function createCardinalLineGeometry(bounds: SiteBounds, offset: number) {
  const y = 0.14
  const span = bounds.radius * 0.42
  const positions = [
    bounds.centerX,
    y,
    bounds.centerZ - span,
    bounds.centerX,
    y,
    bounds.minZ - offset * 0.44,
    bounds.centerX + span,
    y,
    bounds.centerZ,
    bounds.maxX + offset * 0.44,
    y,
    bounds.centerZ,
    bounds.centerX,
    y,
    bounds.centerZ + span,
    bounds.centerX,
    y,
    bounds.maxZ + offset * 0.44,
    bounds.centerX - span,
    y,
    bounds.centerZ,
    bounds.minX - offset * 0.44,
    y,
    bounds.centerZ,
  ]

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function createSunPathGeometry(radius: number) {
  const positions: number[] = []
  const steps = 36

  for (let i = 0; i <= steps; i++) {
    positions.push(...getSunPathPosition(i / steps, radius))
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function getCardinalPosition(
  bounds: SiteBounds,
  key: (typeof CARDINALS)[number]['key'],
  offset: number,
): [number, number, number] {
  const y = 0.34

  switch (key) {
    case 'north':
      return [bounds.centerX, y, bounds.minZ - offset]
    case 'east':
      return [bounds.maxX + offset, y, bounds.centerZ]
    case 'south':
      return [bounds.centerX, y, bounds.maxZ + offset]
    case 'west':
      return [bounds.minX - offset, y, bounds.centerZ]
  }
}

function CardinalMarker({
  label,
  caption,
  position,
  isDark,
}: {
  label: string
  caption: string
  position: [number, number, number]
  isDark: boolean
}) {
  return (
    <Html center position={position} style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <div
        className="flex h-9 w-9 flex-col items-center justify-center rounded-full border font-semibold shadow-lg backdrop-blur-md"
        style={{
          background: isDark ? 'rgb(15 23 42 / 0.82)' : 'rgb(255 255 255 / 0.88)',
          borderColor: isDark ? 'rgb(226 232 240 / 0.24)' : 'rgb(51 65 85 / 0.16)',
          color: isDark ? '#f8fafc' : '#0f172a',
        }}
      >
        <span className="font-mono text-[13px] leading-none">{label}</span>
        <span className="mt-0.5 text-[9px] leading-none opacity-70">{caption}</span>
      </div>
    </Html>
  )
}

function SunPath({ bounds, isDark }: { bounds: SiteBounds; isDark: boolean }) {
  const sunStudy = useViewer((state) => state.sunStudy)
  const setSunProgress = useViewer((state) => state.setSunProgress)
  const radius = Math.max(bounds.radius * 1.75, 22)
  const pathGeometry = useMemo(() => createSunPathGeometry(radius), [radius])
  const sunProgress = resolveSunProgress(sunStudy.timeOfDay, sunStudy.progress)
  const sunPosition = getSunPositionForProgress(sunProgress, radius)
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const setCursor = useCallback((cursor: string) => {
    document.body.style.cursor = cursor
  }, [])

  const updateSunProgressFromPointer = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      setSunProgress(getClosestSunPathProgress(event.ray, bounds, radius))
    },
    [bounds, radius, setSunProgress],
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
      {/* @ts-ignore */}
      <line geometry={pathGeometry} layers={EDITOR_LAYER} renderOrder={8}>
        <lineBasicMaterial color={isDark ? '#fbbf24' : '#d97706'} opacity={0.72} transparent />
      </line>
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
        <meshBasicMaterial color="#f59e0b" toneMapped={false} />
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
          太阳
        </div>
      </Html>
    </group>
  )
}

export function OrientationGuide() {
  const showCompass = useViewer((state) => state.showCompass)
  const sunEnabled = useViewer((state) => state.sunStudy.enabled)
  const theme = useViewer((state) => state.theme)
  const sitePoints = useScene((state) => {
    const rootId = state.rootNodeIds[0]
    const node = rootId ? state.nodes[rootId] : null
    return node?.type === 'site' ? (node as SiteNode).polygon.points : null
  })

  const bounds = useMemo(() => getSiteBounds(sitePoints ?? []), [sitePoints])
  const offset = bounds ? Math.max(bounds.radius * 0.16, 3) : 3
  const lineGeometry = useMemo(
    () => (bounds ? createCardinalLineGeometry(bounds, offset) : null),
    [bounds, offset],
  )
  const isDark = theme === 'dark'

  if (!(bounds && lineGeometry && (showCompass || sunEnabled))) return null

  return (
    <group layers={EDITOR_LAYER}>
      {showCompass ? (
        <>
          {/* @ts-ignore */}
          <lineSegments geometry={lineGeometry} layers={EDITOR_LAYER} renderOrder={7}>
            <lineBasicMaterial color={isDark ? '#93c5fd' : '#2563eb'} opacity={0.38} transparent />
          </lineSegments>
          {CARDINALS.map((cardinal) => (
            <CardinalMarker
              caption={cardinal.caption}
              isDark={isDark}
              key={cardinal.key}
              label={cardinal.label}
              position={getCardinalPosition(bounds, cardinal.key, offset)}
            />
          ))}
        </>
      ) : null}
      {sunEnabled ? <SunPath bounds={bounds} isDark={isDark} /> : null}
    </group>
  )
}
