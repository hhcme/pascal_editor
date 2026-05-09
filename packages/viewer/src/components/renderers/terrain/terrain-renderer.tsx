import { getMaterialPresetByRef, type TerrainNode, useRegistry } from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import * as THREE from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'
import {
  applyMaterialPresetToMaterials,
  createMaterial,
  DEFAULT_SLAB_MATERIAL,
} from '../../../lib/materials'

function createTerrainGeometry(
  vertices: TerrainNode['vertices'],
  triangles: TerrainNode['triangles'],
) {
  const geometry = new THREE.BufferGeometry()
  const positions: number[] = []
  const uvs: number[] = []

  if (vertices.length === 0 || triangles.length === 0) return geometry

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const [x, y, z] of vertices) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
    positions.push(x, y, z)
  }

  const width = Math.max(maxX - minX, 0.001)
  const depth = Math.max(maxZ - minZ, 0.001)
  uvs.push(...vertices.flatMap(([x, , z]) => [(x - minX) / width, (z - minZ) / depth]))

  const maxIndex = vertices.length - 1
  const safeIndices = triangles.flatMap((triangle) =>
    triangle.every((index) => Number.isInteger(index) && index >= 0 && index <= maxIndex)
      ? triangle
      : [],
  )

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(safeIndices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return geometry
}

export const TerrainRenderer = ({ node }: { node: TerrainNode }) => {
  const ref = useRef<Mesh>(null!)
  const events = useNodeEvents(node, 'terrain')

  useRegistry(node.id, 'terrain', ref)

  const geometry = useMemo(
    () => createTerrainGeometry(node.vertices, node.triangles),
    [node.vertices, node.triangles],
  )

  const material = useMemo(() => {
    const preset = getMaterialPresetByRef(node.materialPreset)
    const terrainMaterial = preset
      ? new THREE.MeshStandardMaterial()
      : node.material
        ? createMaterial(node.material).clone()
        : DEFAULT_SLAB_MATERIAL.clone()

    if (preset) {
      applyMaterialPresetToMaterials(terrainMaterial, preset)
    }

    terrainMaterial.side = THREE.DoubleSide
    terrainMaterial.depthWrite = true
    terrainMaterial.needsUpdate = true

    return terrainMaterial
  }, [
    node.material,
    node.material?.preset,
    node.material?.properties,
    node.material?.texture,
    node.materialPreset,
  ])

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  if (!node.visible) return null

  return (
    <mesh castShadow geometry={geometry} material={material} receiveShadow ref={ref} {...events} />
  )
}
