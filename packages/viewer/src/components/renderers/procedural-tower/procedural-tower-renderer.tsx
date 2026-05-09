import { type ProceduralTowerNode, useRegistry } from '@pascal-app/core'
import { useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  Quaternion,
  Vector3,
  type Material,
} from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'
import {
  createMaterial,
  DEFAULT_STAIR_MATERIAL,
  DEFAULT_WINDOW_MATERIAL,
} from '../../../lib/materials'

const UP = new Vector3(0, 1, 0)

type TowerSection = {
  y: number
  radiusX: number
  radiusZ: number
  rotation: number
}

type BeamSpec = {
  key: string
  start: Vector3
  end: Vector3
  radius: number
  material: Material
  radialSegments: number
}

function interpolate(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function sectionAt(node: ProceduralTowerNode, y: number): TowerSection {
  const waistY = Math.min(Math.max(node.waistY, 0.01), node.mainBodyHeight - 0.01)
  const nextY = clamp(y, 0, node.mainBodyHeight)

  if (nextY <= waistY) {
    const t = smoothstep(nextY / waistY)
    return {
      y: nextY,
      radiusX: interpolate(node.baseRadius[0], node.waistRadius[0], t),
      radiusZ: interpolate(node.baseRadius[1], node.waistRadius[1], t),
      rotation: interpolate(0, node.twist * 0.47, t),
    }
  }

  const t = smoothstep((nextY - waistY) / Math.max(0.01, node.mainBodyHeight - waistY))
  return {
    y: nextY,
    radiusX: interpolate(node.waistRadius[0], node.topRadius[0], t),
    radiusZ: interpolate(node.waistRadius[1], node.topRadius[1], t),
    rotation: interpolate(node.twist * 0.47, node.twist, t),
  }
}

function sectionPoint(section: TowerSection, index: number, segments: number) {
  const theta = section.rotation + (Math.PI * 2 * index) / segments
  return new Vector3(Math.cos(theta) * section.radiusX, section.y, Math.sin(theta) * section.radiusZ)
}

function framePoint(section: TowerSection, index: number, segments: number, offset: number) {
  const theta = section.rotation + (Math.PI * 2 * index) / segments
  return new Vector3(
    Math.cos(theta) * (section.radiusX + offset),
    section.y,
    Math.sin(theta) * (section.radiusZ + offset),
  )
}

function sectionScale(section: TowerSection, offset: number): [number, number, number] {
  return [Math.max(0.01, section.radiusX + offset), 1, Math.max(0.01, section.radiusZ + offset)]
}

function buildFacadeGeometry(node: ProceduralTowerNode) {
  const segments = node.radialSegments
  const sectionCount = Math.max(8, Math.min(28, Math.round(node.ringCount * 0.7)))
  const sections = Array.from({ length: sectionCount + 1 }, (_, index) =>
    sectionAt(node, (node.mainBodyHeight * index) / sectionCount),
  )
  const vertices: number[] = []
  const indices: number[] = []

  for (const section of sections) {
    for (let index = 0; index < segments; index += 1) {
      const point = sectionPoint(section, index, segments)
      vertices.push(point.x, point.y, point.z)
    }
  }

  for (let sectionIndex = 0; sectionIndex < sections.length - 1; sectionIndex += 1) {
    const current = sectionIndex * segments
    const next = (sectionIndex + 1) * segments
    for (let index = 0; index < segments; index += 1) {
      const a = current + index
      const b = current + ((index + 1) % segments)
      const c = next + ((index + 1) % segments)
      const d = next + index
      indices.push(a, d, b, b, d, c)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function getBeamTransform(start: Vector3, end: Vector3) {
  const direction = end.clone().sub(start)
  const length = direction.length()
  const position = start.clone().add(end).multiplyScalar(0.5)
  const rotation =
    length > 0.0001
      ? new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(UP, direction.normalize()))
      : new Euler()
  return { length, position, rotation }
}

function buildBeamSpecs(
  node: ProceduralTowerNode,
  steelMaterial: Material,
  ringMaterial: Material,
  antennaMaterial: Material,
): BeamSpec[] {
  const specs: BeamSpec[] = []
  const base = sectionAt(node, 0)
  const lower = sectionAt(node, node.waistY * 0.48)
  const waist = sectionAt(node, node.waistY)
  const upper = sectionAt(node, node.waistY + (node.mainBodyHeight - node.waistY) * 0.48)
  const top = sectionAt(node, node.mainBodyHeight)
  const count = node.columnCount
  const frameOffset = Math.max(node.columnRadius * 2.2, 0.18)

  if (node.showSteelFrame) {
    for (let index = 0; index < count; index += 1) {
      specs.push({
        key: `outer-${index}`,
        start: framePoint(base, index, count, frameOffset),
        end: framePoint(top, index + Math.round(count / 3), count, frameOffset),
        radius: node.columnRadius,
        material: steelMaterial,
        radialSegments: 16,
      })
      specs.push({
        key: `lower-brace-${index}`,
        start: framePoint(base, index + Math.round(count / 12), count, frameOffset),
        end: framePoint(waist, index + Math.round(count / 4), count, frameOffset),
        radius: node.braceRadius,
        material: steelMaterial,
        radialSegments: 10,
      })
      specs.push({
        key: `upper-brace-${index}`,
        start: framePoint(waist, index + Math.round(count / 4), count, frameOffset),
        end: framePoint(top, index + Math.round((count * 7) / 12), count, frameOffset),
        radius: node.braceRadius,
        material: steelMaterial,
        radialSegments: 10,
      })
      specs.push({
        key: `waist-cross-${index}`,
        start: framePoint(lower, index + Math.round(count / 8), count, frameOffset),
        end: framePoint(upper, index + Math.round((count * 5) / 8), count, frameOffset),
        radius: node.braceRadius * 0.78,
        material: steelMaterial,
        radialSegments: 8,
      })
    }

    const latticeBands = Math.min(18, Math.max(8, Math.round(node.ringCount / 2)))
    const latticeRadius = Math.max(node.braceRadius * 0.42, 0.018)
    for (let band = 0; band < latticeBands; band += 1) {
      const startSection = sectionAt(node, (node.mainBodyHeight * band) / latticeBands)
      const endSection = sectionAt(node, (node.mainBodyHeight * (band + 1)) / latticeBands)
      for (let index = 0; index < count; index += 1) {
        specs.push({
          key: `diamond-a-${band}-${index}`,
          start: framePoint(startSection, index, count, frameOffset),
          end: framePoint(endSection, index + 1, count, frameOffset),
          radius: latticeRadius,
          material: steelMaterial,
          radialSegments: 6,
        })
        specs.push({
          key: `diamond-b-${band}-${index}`,
          start: framePoint(startSection, index + 1, count, frameOffset),
          end: framePoint(endSection, index, count, frameOffset),
          radius: latticeRadius,
          material: steelMaterial,
          radialSegments: 6,
        })
      }
    }
  }

  if (node.showRings && node.ringCount > 0) {
    for (let ring = 0; ring <= node.ringCount; ring += 1) {
      const y = (node.mainBodyHeight * ring) / Math.max(1, node.ringCount)
      const section = sectionAt(node, y)
      for (let index = 0; index < count; index += 1) {
        specs.push({
          key: `ring-${ring}-${index}`,
          start: framePoint(section, index, count, frameOffset),
          end: framePoint(section, index + 1, count, frameOffset),
          radius: node.ringRadius,
          material: ringMaterial,
          radialSegments: 10,
        })
      }
    }
  }

  if (node.showAntenna && node.antennaHeight > 0) {
    specs.push({
      key: 'antenna',
      start: new Vector3(0, node.mainBodyHeight, 0),
      end: new Vector3(0, node.mainBodyHeight + node.antennaHeight, 0),
      radius: node.antennaRadius,
      material: antennaMaterial,
      radialSegments: 16,
    })
  }

  return specs
}

function makeTransparentRenderMaterial(material: Material) {
  const next = material.clone()
  next.transparent = true
  next.opacity = Math.min(next.opacity, 0.28)
  next.depthWrite = false
  return next
}

function makeDeckRenderMaterial(material: Material) {
  const next = material.clone()
  next.transparent = true
  next.opacity = Math.max(0.36, Math.min(next.opacity, 0.52))
  next.depthWrite = false
  return next
}

export const ProceduralTowerRenderer = ({ node }: { node: ProceduralTowerNode }) => {
  const ref = useRef<Group>(null!)
  const handlers = useNodeEvents(node, 'procedural-tower')
  const facadeGeometry = useMemo(() => buildFacadeGeometry(node), [
    node.baseRadius,
    node.waistRadius,
    node.topRadius,
    node.waistY,
    node.mainBodyHeight,
    node.twist,
    node.radialSegments,
  ])
  const facadeMaterial = useMemo(
    () =>
      makeTransparentRenderMaterial(
        node.facadeMaterial ? createMaterial(node.facadeMaterial) : DEFAULT_WINDOW_MATERIAL,
      ),
    [node.facadeMaterial, node.facadeMaterial?.preset, node.facadeMaterial?.properties, node.facadeMaterial?.texture],
  )
  const steelMaterial = useMemo(
    () => (node.steelMaterial ? createMaterial(node.steelMaterial) : DEFAULT_STAIR_MATERIAL),
    [node.steelMaterial, node.steelMaterial?.preset, node.steelMaterial?.properties, node.steelMaterial?.texture],
  )
  const ringMaterial = useMemo(
    () => (node.ringMaterial ? createMaterial(node.ringMaterial) : steelMaterial),
    [node.ringMaterial, node.ringMaterial?.preset, node.ringMaterial?.properties, node.ringMaterial?.texture, steelMaterial],
  )
  const antennaMaterial = useMemo(
    () => (node.antennaMaterial ? createMaterial(node.antennaMaterial) : steelMaterial),
    [node.antennaMaterial, node.antennaMaterial?.preset, node.antennaMaterial?.properties, node.antennaMaterial?.texture, steelMaterial],
  )
  const deckMaterial = useMemo(() => makeDeckRenderMaterial(facadeMaterial), [facadeMaterial])
  const beams = useMemo(
    () => buildBeamSpecs(node, steelMaterial, ringMaterial, antennaMaterial),
    [
      node,
      steelMaterial,
      ringMaterial,
      antennaMaterial,
    ],
  )
  const landmarkSections = useMemo(
    () => ({
      base: sectionAt(node, 0),
      lowerDeck: sectionAt(node, node.waistY * 0.18),
      waist: sectionAt(node, node.waistY),
      midDeck: sectionAt(node, interpolate(node.waistY, node.mainBodyHeight, 0.48)),
      top: sectionAt(node, node.mainBodyHeight),
    }),
    [node.baseRadius, node.waistRadius, node.topRadius, node.waistY, node.mainBodyHeight, node.twist],
  )

  useRegistry(node.id, 'procedural-tower', ref)

  return (
    <group
      position={node.position}
      ref={ref}
      visible={node.visible}
      {...handlers}
    >
      {node.showFacade ? (
        <mesh castShadow geometry={facadeGeometry} material={facadeMaterial} receiveShadow />
      ) : null}
      <mesh
        castShadow
        material={ringMaterial}
        position-y={0.28}
        receiveShadow
        scale={sectionScale(landmarkSections.base, 1.25)}
      >
        <cylinderGeometry args={[1, 1, 0.56, 96]} />
      </mesh>
      <mesh
        castShadow
        material={deckMaterial}
        position-y={landmarkSections.lowerDeck.y}
        receiveShadow
        scale={sectionScale(landmarkSections.lowerDeck, 0.55)}
      >
        <cylinderGeometry args={[1, 1, 0.22, 96]} />
      </mesh>
      <mesh
        castShadow
        material={deckMaterial}
        position-y={landmarkSections.midDeck.y}
        receiveShadow
        scale={sectionScale(landmarkSections.midDeck, 0.65)}
      >
        <cylinderGeometry args={[1, 1, 0.34, 96]} />
      </mesh>
      <mesh
        castShadow
        material={deckMaterial}
        position-y={node.mainBodyHeight - 0.36}
        receiveShadow
        scale={sectionScale(landmarkSections.top, 1.05)}
      >
        <cylinderGeometry args={[1, 1, 0.72, 96]} />
      </mesh>
      {node.showAntenna && node.antennaHeight > 0 ? (
        <mesh
          castShadow
          material={antennaMaterial}
          position-y={node.mainBodyHeight + 1.25}
          receiveShadow
        >
          <cylinderGeometry
            args={[
              Math.max(node.antennaRadius * 1.6, 0.16),
              Math.max(Math.min(landmarkSections.top.radiusZ, landmarkSections.top.radiusX) * 0.2, 0.42),
              2.5,
              48,
            ]}
          />
        </mesh>
      ) : null}
      {beams.map((beam) => {
        const { length, position, rotation } = getBeamTransform(beam.start, beam.end)
        if (length <= 0.0001) return null
        return (
          <mesh
            castShadow
            key={beam.key}
            material={beam.material}
            position={position}
            receiveShadow
            rotation={rotation}
          >
            <cylinderGeometry args={[beam.radius, beam.radius, length, beam.radialSegments]} />
          </mesh>
        )
      })}
    </group>
  )
}
