import {
  type FeatureBody,
  type FeatureNode,
  getDraftSteps,
  getEdgeTreatmentSteps,
  getCombineSteps,
  getExtrudeCutSteps,
  getHoleSteps,
  getLoftSteps,
  getMaterialPresetByRef,
  getMirrorSteps,
  getPatternSteps,
  getRenderableFeatureStep,
  getShellSteps,
  getSweepSteps,
  useRegistry,
} from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh, Vector3Tuple } from 'three'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useNodeEvents } from '../../../hooks/use-node-events'
import {
  applyMaterialPresetToMaterials,
  createMaterial,
  DEFAULT_SLAB_MATERIAL,
} from '../../../lib/materials'

function getProfileCenter(points: Array<[number, number]>): [number, number] {
  if (points.length === 0) return [0, 0]
  let x = 0
  let z = 0
  for (const point of points) {
    x += point[0]
    z += point[1]
  }
  return [x / points.length, z / points.length]
}

function scaleProfilePoints(points: Array<[number, number]>, scale: number) {
  const center = getProfileCenter(points)
  return points.map(
    ([x, z]) => [center[0] + (x - center[0]) * scale, center[1] + (z - center[1]) * scale] as [
      number,
      number,
    ],
  )
}

function translateProfilePoints(
  points: Array<[number, number]>,
  translation: [number, number, number] | undefined,
) {
  if (!translation) return points
  return points.map(([x, z]) => [x + translation[0], z + translation[2]] as [number, number])
}

function getBodyProfilePoints(node: FeatureNode, body: FeatureBody | undefined) {
  return translateProfilePoints(body?.profile?.points ?? node.profile.points, body?.transform?.translation)
}

function getProfileBounds(points: Array<[number, number]>) {
  if (points.length === 0) return null
  return points.reduce(
    (bounds, [x, z]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minZ: Math.min(bounds.minZ, z),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  )
}

function createRectangleProfileFromBounds(bounds: {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}) {
  if (bounds.maxX - bounds.minX <= 1e-6 || bounds.maxZ - bounds.minZ <= 1e-6) return []
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
  ] as Array<[number, number]>
}

function intersectProfileBounds(
  first: Array<[number, number]>,
  second: Array<[number, number]>,
) {
  const firstBounds = getProfileBounds(first)
  const secondBounds = getProfileBounds(second)
  if (!(firstBounds && secondBounds)) return []
  return createRectangleProfileFromBounds({
    minX: Math.max(firstBounds.minX, secondBounds.minX),
    maxX: Math.min(firstBounds.maxX, secondBounds.maxX),
    minZ: Math.max(firstBounds.minZ, secondBounds.minZ),
    maxZ: Math.min(firstBounds.maxZ, secondBounds.maxZ),
  })
}

function createShapeFromProfile(
  points: Array<[number, number]>,
  holes: Array<Array<[number, number]>> = [],
) {
  if (points.length < 3) return null

  const shape = new THREE.Shape()
  shape.moveTo(points[0]![0], -points[0]![1])

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!
    shape.lineTo(point[0], -point[1])
  }
  shape.closePath()

  for (const holePoints of holes) {
    if (holePoints.length < 3) continue
    const hole = new THREE.Path()
    hole.moveTo(holePoints[0]![0], -holePoints[0]![1])
    for (let index = 1; index < holePoints.length; index += 1) {
      const point = holePoints[index]!
      hole.lineTo(point[0], -point[1])
    }
    hole.closePath()
    shape.holes.push(hole)
  }

  return shape
}

function extrudeShape(shape: THREE.Shape, depth: number, bevelSize = 0, bevelSegments = 1) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelSize > 0,
    bevelSegments,
    bevelSize,
    bevelThickness: bevelSize,
  })
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()

  const uv = geometry.getAttribute('uv')
  if (uv) {
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(Array.from(uv.array), 2))
  }

  return geometry
}

function createExtrudeGeometry(node: FeatureNode) {
  const step = getRenderableFeatureStep(node)
  if (step?.kind !== 'extrude') return new THREE.BufferGeometry()

  const points = step.profile.points
  if (points.length < 3) return new THREE.BufferGeometry()

  const draft = getDraftSteps(node).at(-1)
  if (draft) {
    const taper = Math.max(
      0.2,
      Math.min(1.8, 1 - Math.tan((draft.angle * Math.PI) / 180) * 0.12),
    )
    return createProfileLoftGeometry([points, scaleProfilePoints(points, taper)], [0, step.depth])
  }

  const shape = new THREE.Shape()
  shape.moveTo(points[0]![0], -points[0]![1])

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!
    shape.lineTo(point[0], -point[1])
  }

  shape.closePath()

  const cutSteps = node.definition ? getExtrudeCutSteps(node) : []
  const legacyCuts = node.definition ? [] : (node.cuts ?? [])
  const cuts = [
    ...legacyCuts.map((cut) => cut.profile),
    ...cutSteps.map((cut) => cut.profile),
  ]

  for (const cut of cuts) {
    const cutPoints = cut.points
    if (cutPoints.length < 3) continue

    const hole = new THREE.Path()
    hole.moveTo(cutPoints[0]![0], -cutPoints[0]![1])
    for (let index = 1; index < cutPoints.length; index += 1) {
      const point = cutPoints[index]!
      hole.lineTo(point[0], -point[1])
    }
    hole.closePath()
    shape.holes.push(hole)
  }

  for (const holeStep of getHoleSteps(node)) {
    if (holeStep.endCondition !== 'through-all' && typeof holeStep.depth === 'number') {
      continue
    }

    const radius = holeStep.diameter / 2
    if (!(Number.isFinite(radius) && radius > 0)) continue

    const hole = new THREE.Path()
    hole.absarc(holeStep.center[0], -holeStep.center[1], radius, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }

  const shell = getShellSteps(node).at(-1)
  if (shell) {
    const insetScale = Math.max(0.15, Math.min(0.9, 1 - shell.thickness * 0.35))
    const shellPoints = scaleProfilePoints(points, insetScale)
    const hole = new THREE.Path()
    hole.moveTo(shellPoints[0]![0], -shellPoints[0]![1])
    for (let index = 1; index < shellPoints.length; index += 1) {
      const point = shellPoints[index]!
      hole.lineTo(point[0], -point[1])
    }
    hole.closePath()
    shape.holes.push(hole)
  }

  const edgeTreatment = getEdgeTreatmentSteps(node).at(-1)
  const bevelSize =
    edgeTreatment?.kind === 'fillet' ? edgeTreatment.radius : edgeTreatment?.distance

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: step.depth,
    bevelEnabled: Boolean(bevelSize && bevelSize > 0),
    bevelSegments: edgeTreatment?.kind === 'fillet' ? 5 : 1,
    bevelSize: bevelSize ?? 0,
    bevelThickness: bevelSize ?? 0,
  })
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()

  const uv = geometry.getAttribute('uv')
  if (uv) {
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(Array.from(uv.array), 2))
  }

  return geometry
}

function createRevolveGeometry(node: FeatureNode) {
  const step = getRenderableFeatureStep(node)
  if (step?.kind !== 'revolve') return new THREE.BufferGeometry()

  const profilePoints = step.profile.points
  if (profilePoints.length < 2) return new THREE.BufferGeometry()

  const axisX =
    typeof step.revolveAxisX === 'number' && Number.isFinite(step.revolveAxisX)
      ? step.revolveAxisX
      : profilePoints.reduce((minX, [x]) => Math.min(minX, x), Number.POSITIVE_INFINITY)
  if (!Number.isFinite(axisX)) return new THREE.BufferGeometry()

  const closedProfilePoints = [...profilePoints, profilePoints[0]!]
  const sectionPoints = closedProfilePoints
    .map(([x, z]) => new THREE.Vector2(Math.abs(x - axisX), -z))
    .filter((point, index, points) => {
      const previous = points[index - 1]
      return !previous || previous.distanceToSquared(point) > 1e-8
    })

  if (sectionPoints.length < 2) return new THREE.BufferGeometry()

  const geometry = new THREE.LatheGeometry(sectionPoints, 48, 0, step.revolveAngle ?? Math.PI * 2)
  geometry.translate(axisX, 0, 0)
  geometry.computeVertexNormals()

  const uv = geometry.getAttribute('uv')
  if (uv) {
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(Array.from(uv.array), 2))
  }

  return geometry
}

function createProfileLoftGeometry(profiles: Array<Array<[number, number]>>, yOffsets: number[]) {
  const pointCount = profiles[0]?.length ?? 0
  if (profiles.length < 2 || pointCount < 3) return new THREE.BufferGeometry()
  if (profiles.some((profile) => profile.length !== pointCount)) return new THREE.BufferGeometry()

  const positions: number[] = []
  const indices: number[] = []

  for (let layerIndex = 0; layerIndex < profiles.length; layerIndex += 1) {
    const profile = profiles[layerIndex]!
    const y = yOffsets[layerIndex] ?? layerIndex
    for (const [x, z] of profile) {
      positions.push(x, y, z)
    }
  }

  for (let layerIndex = 0; layerIndex < profiles.length - 1; layerIndex += 1) {
    const currentOffset = layerIndex * pointCount
    const nextOffset = (layerIndex + 1) * pointCount
    for (let index = 0; index < pointCount; index += 1) {
      const nextIndex = (index + 1) % pointCount
      const a = currentOffset + index
      const b = currentOffset + nextIndex
      const c = nextOffset + nextIndex
      const d = nextOffset + index
      indices.push(a, b, c, a, c, d)
    }
  }

  const lastLayerOffset = (profiles.length - 1) * pointCount
  for (let index = 1; index < pointCount - 1; index += 1) {
    indices.push(0, index + 1, index)
    indices.push(lastLayerOffset, lastLayerOffset + index, lastLayerOffset + index + 1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createSweepGeometry(node: FeatureNode) {
  const sweep = getSweepSteps(node).at(-1)
  if (!sweep) return new THREE.BufferGeometry()

  const path =
    sweep.pathPoints.length >= 2
      ? sweep.pathPoints
      : [
          [0, 0, 0] as [number, number, number],
          [3, 0, 0] as [number, number, number],
        ]
  const profiles = path.map(([offsetX = 0, _offsetY = 0, offsetZ = 0]) =>
    sweep.profile.points.map(([x, z]) => [x + offsetX, z + offsetZ] as [number, number]),
  )
  const yOffsets = path.map(([, y = 0]) => y)
  return createProfileLoftGeometry(profiles, yOffsets)
}

function createLoftGeometry(node: FeatureNode) {
  const loft = getLoftSteps(node).at(-1)
  if (!loft) return new THREE.BufferGeometry()

  return createProfileLoftGeometry(
    loft.profiles.map((profile) => profile.points),
    loft.profiles.map((_, index) => index * Math.max(0.4, node.depth / 2)),
  )
}

function createCombinedBodyGeometry(node: FeatureNode) {
  const definition = node.definition
  const combineSteps = getCombineSteps(node)
  if (!(definition && combineSteps.length > 0)) return null

  const bodyById = new Map<string, FeatureBody>(definition.bodies.map((body) => [body.id, body]))
  const targetBody = bodyById.get(combineSteps[0]?.targetBodyId ?? '') ?? definition.bodies[0]
  let targetProfile = getBodyProfilePoints(node, targetBody)
  const renderableStep = getRenderableFeatureStep(node)
  const depth =
    targetBody?.depth ?? (renderableStep?.kind === 'extrude' ? renderableStep.depth : node.depth)
  const addProfiles: Array<Array<[number, number]>> = []
  const subtractProfiles: Array<Array<[number, number]>> = []

  for (const step of combineSteps) {
    const toolProfiles = step.toolBodyIds
      .map((bodyId) => bodyById.get(bodyId))
      .filter((body): body is FeatureBody => Boolean(body?.visible !== false))
      .map((body) => getBodyProfilePoints(node, body))

    if (step.operation === 'add') {
      addProfiles.push(...toolProfiles)
      continue
    }

    if (step.operation === 'subtract') {
      subtractProfiles.push(...toolProfiles)
      if (step.keepTools) addProfiles.push(...toolProfiles)
      continue
    }

    const intersection = toolProfiles.reduce(
      (current, toolProfile) => intersectProfileBounds(current, toolProfile),
      targetProfile,
    )
    targetProfile = intersection
    if (step.keepTools) addProfiles.push(...toolProfiles)
  }

  const geometries: THREE.BufferGeometry[] = []
  const targetShape = createShapeFromProfile(targetProfile, subtractProfiles)
  if (targetShape) {
    geometries.push(extrudeShape(targetShape, depth))
  }

  for (const profile of addProfiles) {
    const shape = createShapeFromProfile(profile)
    if (shape) {
      geometries.push(extrudeShape(shape, depth))
    }
  }

  if (geometries.length === 0) return new THREE.BufferGeometry()
  if (geometries.length === 1) return geometries[0]!

  const merged = mergeGeometries(geometries, false) ?? new THREE.BufferGeometry()
  for (const geometry of geometries) {
    geometry.dispose()
  }
  merged.computeVertexNormals()
  return merged
}

function createFeatureGeometry(node: FeatureNode) {
  const combined = createCombinedBodyGeometry(node)
  if (combined) return combined

  if (getLoftSteps(node).length > 0) {
    return createLoftGeometry(node)
  }

  if (getSweepSteps(node).length > 0) {
    return createSweepGeometry(node)
  }

  const step = getRenderableFeatureStep(node)
  if (step?.kind === 'revolve') {
    return createRevolveGeometry(node)
  }

  return createExtrudeGeometry(node)
}

type FeatureInstanceTransform = {
  key: string
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple
}

function createFeatureInstanceTransforms(node: FeatureNode): FeatureInstanceTransform[] {
  const base: FeatureInstanceTransform[] = [
    { key: 'base', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  ]

  for (const mirror of getMirrorSteps(node)) {
    const plane = node.definition?.referenceGeometry.find(
      (reference) => reference.kind === 'plane' && reference.id === mirror.mirrorPlaneId,
    )
    const planeX = plane?.kind === 'plane' ? plane.origin[0] + plane.offset : 0
    base.push({
      key: mirror.id,
      position: [planeX * 2, 0, 0],
      rotation: [0, 0, 0],
      scale: [-1, 1, 1],
    })
  }

  for (const pattern of getPatternSteps(node)) {
    const count = Math.max(1, pattern.count)
    const skipped = new Set(pattern.skippedInstances)

    for (let index = 1; index < count; index += 1) {
      if (skipped.has(index)) continue

      if (pattern.kind === 'linear-pattern') {
        base.push({
          key: `${pattern.id}-${index}`,
          position: [index * (pattern.spacing ?? 1), 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        })
      } else {
        base.push({
          key: `${pattern.id}-${index}`,
          position: [0, 0, 0],
          rotation: [0, ((pattern.angle ?? Math.PI * 2) / count) * index, 0],
          scale: [1, 1, 1],
        })
      }
    }
  }

  return base
}

export const FeatureRenderer = ({ node }: { node: FeatureNode }) => {
  const ref = useRef<Mesh>(null!)

  useRegistry(node.id, 'feature', ref)

  const handlers = useNodeEvents(node, 'feature')

  const geometry = useMemo(() => createFeatureGeometry(node), [node])
  const instances = useMemo(() => createFeatureInstanceTransforms(node), [node])

  const material = useMemo(() => {
    const preset = getMaterialPresetByRef(node.materialPreset)
    const featureMaterial = preset
      ? new THREE.MeshStandardMaterial()
      : node.material
        ? createMaterial(node.material).clone()
        : DEFAULT_SLAB_MATERIAL.clone()

    if (preset) {
      applyMaterialPresetToMaterials(featureMaterial, preset)
    }

    featureMaterial.transparent = false
    featureMaterial.opacity = 1
    featureMaterial.side = THREE.DoubleSide
    featureMaterial.depthWrite = true
    featureMaterial.needsUpdate = true

    return featureMaterial
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

  const baseElevation = getRenderableFeatureStep(node)?.baseElevation ?? node.baseElevation

  return (
    <group position={[0, baseElevation, 0]} visible={node.visible}>
      {instances.map((instance, index) => (
        <mesh
          castShadow
          geometry={geometry}
          key={instance.key}
          material={material}
          position={instance.position}
          receiveShadow
          ref={index === 0 ? ref : undefined}
          rotation={instance.rotation}
          scale={instance.scale}
          {...handlers}
        />
      ))}
    </group>
  )
}
