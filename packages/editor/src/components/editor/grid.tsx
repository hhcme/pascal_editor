'use client'

import { emitter, type GridEvent, sceneRegistry } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MathUtils, type Mesh, Vector2 } from 'three'
import { color, float, fract, fwidth, mix, positionLocal, uniform } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { useGridEvents } from '../../hooks/use-grid-events'
import { EDITOR_LAYER } from '../../lib/constants'

const GRID_SURFACE_OFFSET = 0.025
const GRID_RENDER_ORDER = 5
const FINE_GRID_CAMERA_FADE_START = 24
const FINE_GRID_CAMERA_FADE_END = 48
const SECTION_GRID_CAMERA_FADE_START = 56
const SECTION_GRID_CAMERA_FADE_END = 88
const AXIS_LINE_WIDTH = 0.045
const AXIS_RENDER_ORDER = GRID_RENDER_ORDER + 1

export const Grid = ({
  cellSize = 0.5,
  cellThickness = 0.5,
  cellColor = '#d7dce5',
  sectionSize = 1,
  sectionThickness = 1,
  sectionColor = '#aeb7c5',
  fadeDistance = 100,
  fadeStrength = 1,
  revealRadius = 10,
}: {
  cellSize?: number
  cellThickness?: number
  cellColor?: string
  sectionSize?: number
  sectionThickness?: number
  sectionColor?: string
  fadeDistance?: number
  fadeStrength?: number
  revealRadius?: number
}) => {
  const theme = useViewer((state) => state.theme)

  const effectiveCellColor = theme === 'dark' ? '#d7dce5' : cellColor
  const effectiveSectionColor = theme === 'dark' ? '#aeb7c5' : sectionColor

  const cursorPositionRef = useRef(new Vector2(0, 0))
  const cameraGridPositionRef = useRef(new Vector2(0, 0))

  const material = useMemo(() => {
    // Use xy since plane geometry is in XY space (before rotation)
    const pos = positionLocal.xy

    // Cursor position uniform
    const cursorPos = uniform(cursorPositionRef.current)
    const cameraGridPos = uniform(cameraGridPositionRef.current)

    // Grid line function using fwidth for anti-aliasing
    // Returns 1 on grid lines, 0 elsewhere
    const getGrid = (size: number, thickness: number) => {
      const r = pos.div(size)
      const fw = fwidth(r)
      // Distance to nearest grid line for each axis
      const grid = fract(r.sub(0.5)).sub(0.5).abs()
      // Anti-aliased step: divide by fwidth and clamp
      const lineX = float(1).sub(
        grid.x
          .div(fw.x)
          .add(1 - thickness)
          .min(1),
      )
      const lineY = float(1).sub(
        grid.y
          .div(fw.y)
          .add(1 - thickness)
          .min(1),
      )
      // Combine both axes - max gives us lines in both directions
      return lineX.max(lineY)
    }

    const g1 = getGrid(cellSize, cellThickness)
    const g2 = getGrid(sectionSize, sectionThickness)

    // Distance fade from center
    const dist = pos.length()
    const fade = float(1).sub(dist.div(fadeDistance).min(1)).pow(fadeStrength)

    const cameraDist = pos.sub(cameraGridPos).length()
    const fineGridCameraFade = float(1)
      .sub(
        cameraDist
          .sub(FINE_GRID_CAMERA_FADE_START)
          .div(FINE_GRID_CAMERA_FADE_END - FINE_GRID_CAMERA_FADE_START)
          .clamp(0, 1),
      )
      .smoothstep(0, 1)
    const sectionGridCameraFade = float(1)
      .sub(
        cameraDist
          .sub(SECTION_GRID_CAMERA_FADE_START)
          .div(SECTION_GRID_CAMERA_FADE_END - SECTION_GRID_CAMERA_FADE_START)
          .clamp(0, 1),
      )
      .smoothstep(0, 1)

    // Cursor reveal effect - distance from cursor
    const cursorDist = pos.sub(cursorPos).length()
    const cursorFade = float(1).sub(cursorDist.div(revealRadius).clamp(0, 1)).smoothstep(0, 1)

    // Mix colors based on section grid
    const gridColor = mix(
      color(effectiveCellColor),
      color(effectiveSectionColor),
      float(sectionThickness).mul(g2).min(1),
    )

    // Fade fine cells out before section lines so distant perspective does not shimmer.
    const cellAlpha = g1.mul(fineGridCameraFade).mul(0.75)
    const sectionAlpha = g2.mul(sectionGridCameraFade)
    const finalAlpha = cellAlpha.add(sectionAlpha).mul(fade).mul(cursorFade.max(0.08)).min(1)

    return new MeshBasicNodeMaterial({
      transparent: true,
      colorNode: gridColor,
      opacityNode: finalAlpha,
      depthWrite: false,
    })
  }, [
    cellSize,
    cellThickness,
    effectiveCellColor,
    sectionSize,
    sectionThickness,
    effectiveSectionColor,
    fadeDistance,
    fadeStrength,
    revealRadius,
  ])

  const gridRef = useRef<Mesh>(null!)
  const [gridY, setGridY] = useState(0)

  // Use custom raycasting for grid events (independent of mesh events)
  useGridEvents(gridY)

  // Update cursor position from grid:move events
  useEffect(() => {
    const onGridMove = (event: GridEvent) => {
      cursorPositionRef.current.set(event.position[0], -event.position[2])
    }

    emitter.on('grid:move', onGridMove)
    return () => {
      emitter.off('grid:move', onGridMove)
    }
  }, [])

  useFrame(({ camera }, delta) => {
    cameraGridPositionRef.current.set(camera.position.x, -camera.position.z)

    const currentLevelId = useViewer.getState().selection.levelId
    let targetY = 0
    if (currentLevelId) {
      const levelMesh = sceneRegistry.nodes.get(currentLevelId)
      if (levelMesh) {
        targetY = levelMesh.position.y
      }
    }
    const newY = MathUtils.lerp(
      gridRef.current.position.y,
      targetY + GRID_SURFACE_OFFSET,
      12 * delta,
    )
    gridRef.current.position.y = newY
    setGridY(newY)
  })

  const showGrid = useViewer((state) => state.showGrid)

  return (
    <mesh
      layers={EDITOR_LAYER}
      material={material}
      ref={gridRef}
      renderOrder={GRID_RENDER_ORDER}
      rotation-x={-Math.PI / 2}
      visible={showGrid}
    >
      <planeGeometry args={[fadeDistance * 2, fadeDistance * 2]} />
      <mesh layers={EDITOR_LAYER} position-z={0.002} renderOrder={AXIS_RENDER_ORDER}>
        <planeGeometry args={[fadeDistance * 2, AXIS_LINE_WIDTH]} />
        <meshBasicMaterial
          color={theme === 'dark' ? '#ff7a7a' : '#d93025'}
          depthWrite={false}
          transparent
        />
      </mesh>
      <mesh layers={EDITOR_LAYER} position-z={0.003} renderOrder={AXIS_RENDER_ORDER}>
        <planeGeometry args={[AXIS_LINE_WIDTH, fadeDistance * 2]} />
        <meshBasicMaterial
          color={theme === 'dark' ? '#69a7ff' : '#1a73e8'}
          depthWrite={false}
          transparent
        />
      </mesh>
      <mesh layers={EDITOR_LAYER} position-z={0.004} renderOrder={AXIS_RENDER_ORDER}>
        <circleGeometry args={[0.16, 32]} />
        <meshBasicMaterial
          color={theme === 'dark' ? '#f8fafc' : '#111827'}
          depthWrite={false}
          transparent
        />
      </mesh>
    </mesh>
  )
}
