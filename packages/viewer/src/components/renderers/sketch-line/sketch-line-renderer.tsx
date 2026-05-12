import {
  getSketchLineChordLength,
  type SketchLineNode,
  sampleSketchLineCenterline,
  useRegistry,
} from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, type Group, Matrix4, Quaternion, Vector3 } from 'three'
import { color, float } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { useNodeEvents } from '../../../hooks/use-node-events'
import useViewer from '../../../store/use-viewer'

const SKETCH_LINE_Y_OFFSET = 0.08
const SKETCH_LINE_WIDTH = 0.14
const SKETCH_LINE_SELECTED_WIDTH = 0.22
const SKETCH_CONSTRUCTION_LINE_WIDTH = 0.1
const SKETCH_CONSTRUCTION_LINE_SELECTED_WIDTH = 0.18
const SKETCH_LINE_HIT_WIDTH = 0.4
const SKETCH_LINE_HIT_HEIGHT = 0.28
const SKETCH_LINE_DASH_LENGTH = 0.36
const SKETCH_LINE_DASH_GAP = 0.18
const SKETCH_LINE_COLOR = '#0f766e'
const SKETCH_CONSTRUCTION_LINE_COLOR = '#64748b'
const SKETCH_LINE_SELECTED_COLOR = '#14b8a6'
const SKETCH_CONSTRUCTION_LINE_SELECTED_COLOR = '#38bdf8'

type SketchLineSegment = {
  center: [number, number]
  length: number
  angle: number
}

function createSketchLineSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
): SketchLineSegment | null {
  const dx = end.x - start.x
  const dz = end.y - start.y
  const length = Math.hypot(dx, dz)
  if (length <= 1e-6) {
    return null
  }

  return {
    center: [(start.x + end.x) / 2, (start.y + end.y) / 2],
    length,
    angle: Math.atan2(dz, dx),
  }
}

function interpolatePoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
) {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  }
}

function buildSketchLineSegments(node: SketchLineNode, construction: boolean): SketchLineSegment[] {
  const centerline = sampleSketchLineCenterline(node, 36)
  if (!construction) {
    return centerline.flatMap((point, index) => {
      const nextPoint = centerline[index + 1]
      if (!nextPoint) {
        return []
      }
      const segment = createSketchLineSegment(point, nextPoint)
      return segment ? [segment] : []
    })
  }

  const segments: SketchLineSegment[] = []
  const patternLength = SKETCH_LINE_DASH_LENGTH + SKETCH_LINE_DASH_GAP
  let patternCursor = 0

  for (let index = 0; index < centerline.length - 1; index += 1) {
    const start = centerline[index]!
    const end = centerline[index + 1]!
    const sourceLength = Math.hypot(end.x - start.x, end.y - start.y)
    if (sourceLength <= 1e-6) {
      continue
    }

    let consumed = 0
    while (consumed < sourceLength) {
      const phase = patternCursor % patternLength
      const isDash = phase < SKETCH_LINE_DASH_LENGTH
      const remainingPatternLength = isDash
        ? SKETCH_LINE_DASH_LENGTH - phase
        : patternLength - phase
      const step = Math.min(sourceLength - consumed, remainingPatternLength)

      if (isDash && step > 1e-6) {
        const segmentStart = interpolatePoint(start, end, consumed / sourceLength)
        const segmentEnd = interpolatePoint(start, end, (consumed + step) / sourceLength)
        const segment = createSketchLineSegment(segmentStart, segmentEnd)
        if (segment) {
          segments.push(segment)
        }
      }

      consumed += step
      patternCursor += step
    }
  }

  return segments
}

function createSketchMaterial(colorValue: string, opacity: number) {
  const material = new MeshBasicNodeMaterial({
    colorNode: color(new Color(colorValue)),
    depthTest: false,
    depthWrite: false,
    opacityNode: float(opacity),
    side: DoubleSide,
    transparent: true,
  })
  material.toneMapped = false
  return material
}

function createHitMaterial() {
  const material = createSketchMaterial('#ffffff', 0)
  material.colorWrite = false
  return material
}

type RenderSketchPlane = {
  origin: [number, number, number]
  xAxis: [number, number, number]
  yAxis: [number, number, number]
  zAxis: [number, number, number]
}

function isNumberTuple3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function getSketchPlaneElevation(node: SketchLineNode): number {
  const metadata = node.metadata
  if (!(typeof metadata === 'object' && metadata !== null && 'sketchPlane' in metadata)) {
    return 0
  }

  const sketchPlane = (metadata as Record<string, unknown>).sketchPlane
  if (!(typeof sketchPlane === 'object' && sketchPlane !== null && 'elevation' in sketchPlane)) {
    return 0
  }

  const elevation = (sketchPlane as Record<string, unknown>).elevation
  return typeof elevation === 'number' && Number.isFinite(elevation) ? elevation : 0
}

function getRenderSketchPlane(node: SketchLineNode): RenderSketchPlane {
  const metadata = node.metadata
  if (typeof metadata === 'object' && metadata !== null && 'sketchPlane' in metadata) {
    const sketchPlane = (metadata as Record<string, unknown>).sketchPlane
    if (typeof sketchPlane === 'object' && sketchPlane !== null) {
      const plane = sketchPlane as Record<string, unknown>
      if (
        plane.kind === 'feature-face' &&
        isNumberTuple3(plane.origin) &&
        isNumberTuple3(plane.uAxis) &&
        isNumberTuple3(plane.vAxis) &&
        isNumberTuple3(plane.normal)
      ) {
        const origin = plane.origin
        const uAxis = plane.uAxis
        const vAxis = plane.vAxis
        const normal = plane.normal
        const offsetOrigin = origin.map(
          (value, index) => value + normal[index]! * SKETCH_LINE_Y_OFFSET,
        ) as [number, number, number]
        return {
          origin: offsetOrigin,
          xAxis: uAxis,
          yAxis: normal,
          zAxis: vAxis,
        }
      }
    }
  }

  return {
    origin: [0, getSketchPlaneElevation(node) + SKETCH_LINE_Y_OFFSET, 0],
    xAxis: [1, 0, 0],
    yAxis: [0, 1, 0],
    zAxis: [0, 0, 1],
  }
}

function useSketchPlaneTransform(node: SketchLineNode) {
  return useMemo(() => {
    const plane = getRenderSketchPlane(node)
    const matrix = new Matrix4().makeBasis(
      new Vector3(...plane.xAxis),
      new Vector3(...plane.yAxis),
      new Vector3(...plane.zAxis),
    )
    const position = new Vector3(...plane.origin)
    const quaternion = new Quaternion().setFromRotationMatrix(matrix)
    return {
      position: position.toArray() as [number, number, number],
      quaternion,
    }
  }, [node])
}

export const SketchLineRenderer = ({ node }: { node: SketchLineNode }) => {
  const ref = useRef<Group>(null!)
  const handlers = useNodeEvents(node, 'sketch-line')
  const isSelected = useViewer((state) => state.selection.selectedIds.includes(node.id))
  const isHovered = useViewer((state) => state.hoveredId === node.id)

  useRegistry(node.id, 'sketch-line', ref)

  const chordLength = getSketchLineChordLength(node)
  const segments = useMemo(() => buildSketchLineSegments(node, node.construction), [node])
  const hitSegments = useMemo(() => buildSketchLineSegments(node, false), [node])

  const isEmphasized = isSelected || isHovered
  const lineColor = node.construction
    ? isEmphasized
      ? SKETCH_CONSTRUCTION_LINE_SELECTED_COLOR
      : SKETCH_CONSTRUCTION_LINE_COLOR
    : isEmphasized
      ? SKETCH_LINE_SELECTED_COLOR
      : SKETCH_LINE_COLOR
  const lineOpacity = isEmphasized ? 0.98 : node.construction ? 0.76 : 0.9
  const lineWidth = node.construction
    ? isEmphasized
      ? SKETCH_CONSTRUCTION_LINE_SELECTED_WIDTH
      : SKETCH_CONSTRUCTION_LINE_WIDTH
    : isEmphasized
      ? SKETCH_LINE_SELECTED_WIDTH
      : SKETCH_LINE_WIDTH

  const material = useMemo(
    () => createSketchMaterial(lineColor, lineOpacity),
    [lineColor, lineOpacity],
  )
  const hitMaterial = useMemo(() => createHitMaterial(), [])

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  useEffect(() => {
    return () => {
      hitMaterial.dispose()
    }
  }, [hitMaterial])

  const canRenderLine = node.visible !== false && chordLength >= 1e-6
  const planeTransform = useSketchPlaneTransform(node)

  return (
    <group
      position={planeTransform.position}
      quaternion={planeTransform.quaternion}
      ref={ref}
      renderOrder={60}
      visible={canRenderLine}
      {...handlers}
    >
      {canRenderLine && (
        <>
          {hitSegments.map((segment, index) => (
            <group
              key={`${node.id}:hit:${index}`}
              position={[segment.center[0], 0, segment.center[1]]}
              rotation={[0, -segment.angle, 0]}
            >
              <mesh material={hitMaterial} name="collision-mesh" renderOrder={60}>
                <boxGeometry
                  args={[segment.length, SKETCH_LINE_HIT_HEIGHT, SKETCH_LINE_HIT_WIDTH]}
                />
              </mesh>
            </group>
          ))}
          {segments.map((segment, index) => (
            <group
              key={`${node.id}:line:${index}`}
              position={[segment.center[0], 0, segment.center[1]]}
              rotation={[0, -segment.angle, 0]}
            >
              <mesh
                frustumCulled={false}
                material={material}
                renderOrder={61}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[segment.length, lineWidth]} />
              </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  )
}
