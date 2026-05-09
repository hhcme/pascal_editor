import { type BeamNode, useRegistry } from '@pascal-app/core'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { Euler, Quaternion, Vector3 } from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'
import {
  createMaterial,
  createMaterialFromPresetRef,
  DEFAULT_STAIR_MATERIAL,
} from '../../../lib/materials'

const UP = new Vector3(0, 1, 0)

function getBeamTransform(node: BeamNode) {
  const start = new Vector3(...node.start)
  const end = new Vector3(...node.end)
  const direction = end.clone().sub(start)
  const length = direction.length()
  const midpoint = start.clone().add(end).multiplyScalar(0.5)

  if (length <= 0.0001) {
    return {
      length: 0,
      position: midpoint,
      rotation: new Euler(),
    }
  }

  const quaternion = new Quaternion().setFromUnitVectors(UP, direction.normalize())
  return {
    length,
    position: midpoint,
    rotation: new Euler().setFromQuaternion(quaternion),
  }
}

export const BeamRenderer = ({ node }: { node: BeamNode }) => {
  const ref = useRef<Mesh>(null!)
  const handlers = useNodeEvents(node, 'beam')
  const { length, position, rotation } = useMemo(
    () => getBeamTransform(node),
    [node.start, node.end],
  )
  const material = useMemo(() => {
    const presetMaterial = createMaterialFromPresetRef(node.materialPreset)
    if (presetMaterial) return presetMaterial
    if (node.material) return createMaterial(node.material)
    return DEFAULT_STAIR_MATERIAL
  }, [
    node.materialPreset,
    node.material,
    node.material?.preset,
    node.material?.properties,
    node.material?.texture,
  ])

  useRegistry(node.id, 'beam', ref)

  if (length <= 0.0001) return null

  const diameter = node.radius * 2

  return (
    <mesh
      castShadow
      material={material}
      position={position}
      receiveShadow
      ref={ref}
      rotation={rotation}
      visible={node.visible}
      {...handlers}
    >
      {node.profile === 'square' ? (
        <boxGeometry args={[diameter, length, diameter]} />
      ) : (
        <cylinderGeometry args={[node.radius, node.radius, length, node.radialSegments]} />
      )}
    </mesh>
  )
}
