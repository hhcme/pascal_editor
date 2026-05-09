import { type LoftNode, useRegistry } from '@pascal-app/core'
import { useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Vector3, type Mesh } from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'
import {
  createMaterial,
  createMaterialFromPresetRef,
  DEFAULT_WINDOW_MATERIAL,
} from '../../../lib/materials'

function sectionPoint(section: LoftNode['sections'][number], index: number, segments: number) {
  const theta = section.rotation + (Math.PI * 2 * index) / segments
  return new Vector3(
    section.center[0] + Math.cos(theta) * section.radiusX,
    section.y,
    section.center[1] + Math.sin(theta) * section.radiusZ,
  )
}

function buildLoftGeometry(node: LoftNode) {
  const segments = node.radialSegments
  const sections = [...node.sections].sort((a, b) => a.y - b.y)
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

  if (node.capStart) {
    const centerIndex = vertices.length / 3
    const section = sections[0]!
    vertices.push(section.center[0], section.y, section.center[1])
    for (let index = 0; index < segments; index += 1) {
      indices.push(centerIndex, (index + 1) % segments, index)
    }
  }

  if (node.capEnd) {
    const centerIndex = vertices.length / 3
    const section = sections[sections.length - 1]!
    const offset = (sections.length - 1) * segments
    vertices.push(section.center[0], section.y, section.center[1])
    for (let index = 0; index < segments; index += 1) {
      indices.push(centerIndex, offset + index, offset + ((index + 1) % segments))
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

export const LoftRenderer = ({ node }: { node: LoftNode }) => {
  const ref = useRef<Mesh>(null!)
  const handlers = useNodeEvents(node, 'loft')
  const geometry = useMemo(() => buildLoftGeometry(node), [
    node.sections,
    node.radialSegments,
    node.capStart,
    node.capEnd,
  ])
  const material = useMemo(() => {
    const presetMaterial = createMaterialFromPresetRef(node.materialPreset)
    if (presetMaterial) return presetMaterial
    if (node.material) return createMaterial(node.material)
    return DEFAULT_WINDOW_MATERIAL
  }, [
    node.materialPreset,
    node.material,
    node.material?.preset,
    node.material?.properties,
    node.material?.texture,
  ])

  useRegistry(node.id, 'loft', ref)

  return (
    <mesh
      castShadow
      geometry={geometry}
      material={material}
      receiveShadow
      ref={ref}
      visible={node.visible}
      {...handlers}
    />
  )
}
