import {
  type AnyNode,
  type FeatureBody,
  type FeatureNode,
  type FeatureProfile,
  type FeatureProfileHole,
  getCombineSteps,
  getDraftSteps,
  getEdgeTreatmentSteps,
  getExtrudeCutSteps,
  getFeatureFaceCutSteps,
  getHoleSteps,
  getLoftSteps,
  getMaterialPresetByRef,
  getMirrorSteps,
  getPatternSteps,
  getRenderableFeatureStep,
  getShellSteps,
  getSweepSteps,
  type SketchCircleNode,
  type SketchLineNode,
  sampleSketchCircleCenterline,
  sampleSketchLineCenterline,
  useRegistry,
  useScene,
} from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh, Vector3Tuple } from 'three'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
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
    ([x, z]) =>
      [center[0] + (x - center[0]) * scale, center[1] + (z - center[1]) * scale] as [
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

function isNumberTuple3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function isNumberTuple2(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function getFeatureFacePlaneSpace(value: unknown): FeatureFaceSketchPlane['space'] {
  return value === 'scene' || value === 'target-local' ? value : undefined
}

type FeatureFaceSketchPlane = {
  kind: 'feature-face'
  targetNodeId?: string
  space?: 'target-local' | 'scene'
  origin: [number, number, number]
  uAxis: [number, number, number]
  vAxis: [number, number, number]
  normal: [number, number, number]
}

type FeatureFaceCut = {
  id: string
  profile: {
    points: Array<[number, number]>
  }
  sketchPlane: FeatureFaceSketchPlane
}

function getFeatureSketchPlane(metadata: unknown) {
  if (!(typeof metadata === 'object' && metadata !== null && 'sketchPlane' in metadata)) {
    return null
  }

  const rawPlane = (metadata as Record<string, unknown>).sketchPlane
  if (!(typeof rawPlane === 'object' && rawPlane !== null)) {
    return null
  }

  const plane = rawPlane as Record<string, unknown>
  if (
    plane.kind === 'feature-face' &&
    isNumberTuple3(plane.origin) &&
    isNumberTuple3(plane.uAxis) &&
    isNumberTuple3(plane.vAxis) &&
    isNumberTuple3(plane.normal)
  ) {
    return {
      kind: 'feature-face' as const,
      targetNodeId: typeof plane.targetNodeId === 'string' ? plane.targetNodeId : undefined,
      space: getFeatureFacePlaneSpace(plane.space),
      origin: plane.origin,
      uAxis: plane.uAxis,
      vAxis: plane.vAxis,
      normal: plane.normal,
    }
  }

  return null
}

function getMetadataFeatureFaceCuts(metadata: unknown): FeatureFaceCut[] {
  if (!(typeof metadata === 'object' && metadata !== null && 'featureFaceCuts' in metadata)) {
    return []
  }

  const rawCuts = (metadata as Record<string, unknown>).featureFaceCuts
  if (!Array.isArray(rawCuts)) {
    return []
  }

  return rawCuts.flatMap((rawCut) => {
    if (!(typeof rawCut === 'object' && rawCut !== null)) {
      return []
    }

    const cut = rawCut as Record<string, unknown>
    const profile =
      typeof cut.profile === 'object' && cut.profile !== null
        ? (cut.profile as Record<string, unknown>)
        : null
    const points = Array.isArray(profile?.points) ? profile.points.filter(isNumberTuple2) : []
    const sketchPlane = getFeatureSketchPlane({ sketchPlane: cut.sketchPlane })

    if (typeof cut.id !== 'string' || points.length < 3 || sketchPlane?.kind !== 'feature-face') {
      return []
    }

    return [
      {
        id: cut.id,
        profile: { points },
        sketchPlane,
      },
    ]
  })
}

type SceneNodes = Record<string, AnyNode | undefined>

function pointsClose(a: [number, number], b: [number, number], tolerance = 1e-4) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance
}

function appendProfilePoints(target: Array<[number, number]>, points: Array<[number, number]>) {
  for (const point of points) {
    const previous = target.at(-1)
    if (previous && pointsClose(previous, point)) continue
    target.push(point)
  }
}

function getSketchLineSamplePoints(line: SketchLineNode, reversed: boolean) {
  const points = sampleSketchLineCenterline(line, Math.abs(line.curveOffset ?? 0) > 1e-5 ? 24 : 1)
    .map((point) => [point.x, point.y] as [number, number])
    .filter((point, index, samples) => index === 0 || !pointsClose(samples[index - 1]!, point))

  return reversed ? points.reverse() : points
}

type ProfileSourceEdge = {
  id: SketchLineNode['id'] | SketchCircleNode['id']
  a: [number, number]
  b: [number, number]
  points: Array<[number, number]>
}

function getSketchCircleSamplePoints(circle: SketchCircleNode, reversed: boolean) {
  const points = sampleSketchCircleCenterline(circle, 64)
    .map((point) => [point.x, point.y] as [number, number])
    .filter((point, index, samples) => index === 0 || !pointsClose(samples[index - 1]!, point))

  if (points.length > 1 && pointsClose(points[0]!, points.at(-1)!)) {
    points.pop()
  }

  return reversed ? points.reverse() : points
}

function rebuildProfileFromSourceCircle(
  profile: FeatureProfile | FeatureProfileHole,
  nodes: SceneNodes,
): FeatureProfile | FeatureProfileHole {
  if (profile.circleIds.length !== 1 || profile.lineIds.length > 0) return profile

  const node = nodes[profile.circleIds[0]!]
  if (
    node?.type !== 'sketch-circle' ||
    node.visible === false ||
    node.construction ||
    node.kind !== 'circle' ||
    !(Number.isFinite(node.radius) && node.radius > 1e-6)
  ) {
    return profile
  }

  const points = sampleSketchCircleCenterline(node as SketchCircleNode, 64).map(
    (point) => [point.x, point.y] as [number, number],
  )
  if (points.length > 1 && pointsClose(points[0]!, points.at(-1)!)) {
    points.pop()
  }

  return points.length >= 3 ? { ...profile, points } : profile
}

function rebuildProfileFromSourceSketch(
  profile: FeatureProfile,
  nodes: SceneNodes,
): FeatureProfile {
  const circleProfile = rebuildProfileFromSourceCircle(profile, nodes)
  if (circleProfile !== profile) {
    return {
      ...circleProfile,
      holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
    }
  }

  const sourceEdges: ProfileSourceEdge[] = []
  for (const lineId of profile.lineIds) {
    const node = nodes[lineId]
    if (node?.type !== 'sketch-line' || node.construction) {
      return {
        ...profile,
        holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
      }
    }
    sourceEdges.push({
      id: node.id,
      a: node.start,
      b: node.end,
      points: getSketchLineSamplePoints(node, false),
    })
  }

  for (const circleId of profile.circleIds) {
    const node = nodes[circleId]
    if (node?.type !== 'sketch-circle' || node.construction || node.kind !== 'arc') {
      return {
        ...profile,
        holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
      }
    }
    const points = getSketchCircleSamplePoints(node, false)
    const start = points[0]
    const end = points.at(-1)
    if (!(start && end)) {
      return {
        ...profile,
        holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
      }
    }
    sourceEdges.push({
      id: node.id,
      a: start,
      b: end,
      points,
    })
  }

  if (sourceEdges.length < 2) {
    return {
      ...profile,
      holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
    }
  }

  const firstEdge = sourceEdges[0]!
  const orderedEdges: Array<{ edge: ProfileSourceEdge; reversed: boolean }> = [
    { edge: firstEdge, reversed: false },
  ]
  const unusedIds = new Set<ProfileSourceEdge['id']>(sourceEdges.slice(1).map((edge) => edge.id))
  const edgeById = new Map(sourceEdges.map((edge) => [edge.id, edge] as const))
  const startPoint = firstEdge.a
  let currentPoint = firstEdge.b

  while (unusedIds.size > 0) {
    let matchedId: ProfileSourceEdge['id'] | null = null
    let matchedEdge: ProfileSourceEdge | null = null
    let reversed = false

    for (const edgeId of unusedIds) {
      const candidate = edgeById.get(edgeId)
      if (!candidate) continue

      if (pointsClose(candidate.a, currentPoint)) {
        matchedId = edgeId
        matchedEdge = candidate
        reversed = false
        break
      }

      if (pointsClose(candidate.b, currentPoint)) {
        matchedId = edgeId
        matchedEdge = candidate
        reversed = true
        break
      }
    }

    if (!(matchedId && matchedEdge)) {
      return {
        ...profile,
        holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
      }
    }

    orderedEdges.push({ edge: matchedEdge, reversed })
    unusedIds.delete(matchedId)
    currentPoint = reversed ? matchedEdge.a : matchedEdge.b
  }

  if (!pointsClose(currentPoint, startPoint)) {
    return {
      ...profile,
      holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
    }
  }

  const points: Array<[number, number]> = []
  for (const { edge, reversed } of orderedEdges) {
    appendProfilePoints(points, reversed ? [...edge.points].reverse() : edge.points)
  }

  if (points.length > 1 && pointsClose(points[0]!, points.at(-1)!)) {
    points.pop()
  }

  return points.length >= 3
    ? {
        ...profile,
        points,
        holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
      }
    : {
        ...profile,
        holes: profile.holes.map((hole) => rebuildProfileHoleFromSourceSketch(hole, nodes)),
      }
}

function rebuildProfileHoleFromSourceSketch(
  profile: FeatureProfileHole,
  nodes: SceneNodes,
): FeatureProfileHole {
  const rebuilt = rebuildProfileFromSourceCircle(profile, nodes)
  if (rebuilt !== profile) {
    return rebuilt
  }

  const featureProfile: FeatureProfile = { ...profile, holes: [] }
  const rebuiltFeatureProfile = rebuildProfileFromSourceSketch(featureProfile, nodes)
  return {
    kind: 'sketch-profile',
    lineIds: rebuiltFeatureProfile.lineIds,
    circleIds: rebuiltFeatureProfile.circleIds,
    points: rebuiltFeatureProfile.points,
  }
}

function getFeatureFaceCuts(node: FeatureNode, nodes: SceneNodes): FeatureFaceCut[] {
  const cutById = new Map<string, FeatureFaceCut>()

  for (const metadataCut of getMetadataFeatureFaceCuts(node.metadata)) {
    cutById.set(metadataCut.id, metadataCut)
  }

  for (const step of getFeatureFaceCutSteps(node)) {
    const sketchPlane = getFeatureSketchPlane({ sketchPlane: step.sketchPlane })
    if (sketchPlane?.kind !== 'feature-face') {
      continue
    }

    cutById.set(step.id, {
      id: step.id,
      profile: { points: rebuildProfileFromSourceSketch(step.profile, nodes).points },
      sketchPlane,
    })
  }

  return [...cutById.values()]
}

type FeaturePlaneTransform = {
  position: [number, number, number]
  quaternion: THREE.Quaternion
}

function composeTransformMatrix(transform: FeaturePlaneTransform) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    transform.quaternion,
    new THREE.Vector3(1, 1, 1),
  )
}

function getFeatureBaseTransform(
  node: FeatureNode,
  nodes: SceneNodes,
  visited = new Set<string>(),
): FeaturePlaneTransform {
  if (visited.has(node.id)) {
    return { position: [0, node.baseElevation, 0], quaternion: new THREE.Quaternion() }
  }
  visited.add(node.id)

  const sketchPlane = getFeatureSketchPlane(node.metadata)
  if (sketchPlane?.kind === 'feature-face') {
    return getFeatureFacePlaneTransform(sketchPlane, nodes, visited)
  }

  const baseElevation = getRenderableFeatureStep(node)?.baseElevation ?? node.baseElevation
  return { position: [0, baseElevation, 0], quaternion: new THREE.Quaternion() }
}

function getFeatureFacePlaneTransform(
  sketchPlane: FeatureFaceSketchPlane,
  nodes: SceneNodes,
  visited = new Set<string>(),
): FeaturePlaneTransform {
  const planeMatrix = new THREE.Matrix4()
    .makeBasis(
      new THREE.Vector3(...sketchPlane.uAxis),
      new THREE.Vector3(...sketchPlane.normal),
      new THREE.Vector3(...sketchPlane.vAxis),
    )
    .setPosition(new THREE.Vector3(...sketchPlane.origin))

  const targetNode = sketchPlane.targetNodeId ? nodes[sketchPlane.targetNodeId] : null
  if (sketchPlane.space !== 'scene' && targetNode?.type === 'feature') {
    const targetTransform = getFeatureBaseTransform(targetNode, nodes, visited)
    planeMatrix.premultiply(composeTransformMatrix(targetTransform))
  }

  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  planeMatrix.decompose(position, quaternion, scale)

  return {
    position: position.toArray() as [number, number, number],
    quaternion,
  }
}

function useFeaturePlaneTransform(node: FeatureNode, baseElevation: number, nodes: SceneNodes) {
  return useMemo(() => {
    const sketchPlane = getFeatureSketchPlane(node.metadata)
    if (sketchPlane?.kind === 'feature-face') {
      return getFeatureFacePlaneTransform(sketchPlane, nodes)
    }

    return {
      position: [0, baseElevation, 0] as [number, number, number],
      quaternion: new THREE.Quaternion(),
    }
  }, [baseElevation, node.metadata, nodes])
}

function getBodyProfilePoints(node: FeatureNode, body: FeatureBody | undefined) {
  return translateProfilePoints(
    body?.profile?.points ?? node.profile.points,
    body?.transform?.translation,
  )
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

function intersectProfileBounds(first: Array<[number, number]>, second: Array<[number, number]>) {
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

function createExtrudeGeometry(node: FeatureNode, nodes: SceneNodes) {
  const step = getRenderableFeatureStep(node)
  if (step?.kind !== 'extrude') return new THREE.BufferGeometry()

  const profile = rebuildProfileFromSourceSketch(step.profile, nodes)
  const points = profile.points
  if (points.length < 3) return new THREE.BufferGeometry()

  const draft = getDraftSteps(node).at(-1)
  if (draft) {
    const taper = Math.max(0.2, Math.min(1.8, 1 - Math.tan((draft.angle * Math.PI) / 180) * 0.12))
    return createProfileLoftGeometry([points, scaleProfilePoints(points, taper)], [0, step.depth])
  }

  const shape = createShapeFromProfile(
    points,
    profile.holes.map((hole) => hole.points),
  )
  if (!shape) return new THREE.BufferGeometry()

  const cutSteps = node.definition ? getExtrudeCutSteps(node) : []
  const legacyCuts = node.definition ? [] : (node.cuts ?? [])
  const cuts = [
    ...legacyCuts.map((cut) => cut.profile),
    ...cutSteps.map((cut) => rebuildProfileFromSourceSketch(cut.profile, nodes)),
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

const faceCutEvaluator = new Evaluator()

function getFeatureFaceCutSpan(node: FeatureNode, nodes: SceneNodes) {
  const step = getRenderableFeatureStep(node)
  const profilePoints = step
    ? rebuildProfileFromSourceSketch(step.profile, nodes).points
    : node.profile.points
  const bounds = getProfileBounds(profilePoints)
  const width = bounds ? bounds.maxX - bounds.minX : 0
  const length = bounds ? bounds.maxZ - bounds.minZ : 0
  const depth = step?.kind === 'extrude' ? step.depth : node.depth
  return Math.max(1, width, length, depth) + 0.5
}

function createFeatureFaceCutGeometry(cut: FeatureFaceCut, span: number) {
  const pointCount = cut.profile.points.length
  if (pointCount < 3) return new THREE.BufferGeometry()

  const origin = new THREE.Vector3(...cut.sketchPlane.origin)
  const uAxis = new THREE.Vector3(...cut.sketchPlane.uAxis).normalize()
  const vAxis = new THREE.Vector3(...cut.sketchPlane.vAxis).normalize()
  const normal = new THREE.Vector3(...cut.sketchPlane.normal).normalize()
  const positions: number[] = []
  const indices: number[] = []

  for (const normalOffset of [-span, span]) {
    for (const [u, v] of cut.profile.points) {
      const point = origin
        .clone()
        .addScaledVector(uAxis, u)
        .addScaledVector(vAxis, v)
        .addScaledVector(normal, normalOffset)
      positions.push(point.x, point.y, point.z)
    }
  }

  const capPoints = cut.profile.points.map(([u, v]) => new THREE.Vector2(u, v))
  const capTriangles = THREE.ShapeUtils.triangulateShape(capPoints, [])
  for (const triangle of capTriangles) {
    indices.push(triangle[2]!, triangle[1]!, triangle[0]!)
    indices.push(pointCount + triangle[0]!, pointCount + triangle[1]!, pointCount + triangle[2]!)
  }

  for (let index = 0; index < pointCount; index += 1) {
    const nextIndex = (index + 1) % pointCount
    const frontA = index
    const frontB = nextIndex
    const backA = pointCount + index
    const backB = pointCount + nextIndex
    indices.push(frontA, frontB, backB, frontA, backB, backA)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function resolveFeatureFaceCutForTarget(
  cut: FeatureFaceCut,
  targetNode: FeatureNode,
  nodes: SceneNodes,
): FeatureFaceCut {
  if (cut.sketchPlane.space !== 'scene') {
    return cut
  }

  const targetTransform = getFeatureBaseTransform(targetNode, nodes)
  const inverseTargetMatrix = composeTransformMatrix(targetTransform).invert()
  const origin = new THREE.Vector3(...cut.sketchPlane.origin).applyMatrix4(inverseTargetMatrix)
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(inverseTargetMatrix)
  const uAxis = new THREE.Vector3(...cut.sketchPlane.uAxis)
    .applyNormalMatrix(normalMatrix)
    .normalize()
  const vAxis = new THREE.Vector3(...cut.sketchPlane.vAxis)
    .applyNormalMatrix(normalMatrix)
    .normalize()
  const normal = new THREE.Vector3(...cut.sketchPlane.normal)
    .applyNormalMatrix(normalMatrix)
    .normalize()

  return {
    ...cut,
    sketchPlane: {
      ...cut.sketchPlane,
      space: 'target-local',
      origin: origin.toArray() as [number, number, number],
      uAxis: uAxis.toArray() as [number, number, number],
      vAxis: vAxis.toArray() as [number, number, number],
      normal: normal.toArray() as [number, number, number],
    },
  }
}

function applyFeatureFaceCuts(
  geometry: THREE.BufferGeometry,
  node: FeatureNode,
  nodes: SceneNodes,
) {
  const faceCuts = getFeatureFaceCuts(node, nodes)
  if (faceCuts.length === 0) {
    return geometry
  }

  let currentBrush = new Brush(geometry)
  currentBrush.updateMatrixWorld()
  let ownsCurrentGeometry = false

  try {
    const cutSpan = getFeatureFaceCutSpan(node, nodes)
    for (const faceCut of faceCuts) {
      const cutGeometry = createFeatureFaceCutGeometry(
        resolveFeatureFaceCutForTarget(faceCut, node, nodes),
        cutSpan,
      )
      const cutBrush = new Brush(cutGeometry)
      cutBrush.updateMatrixWorld()
      const nextBrush = faceCutEvaluator.evaluate(currentBrush, cutBrush, SUBTRACTION) as Brush
      cutGeometry.dispose()
      if (ownsCurrentGeometry) {
        currentBrush.geometry.dispose()
      }
      currentBrush = nextBrush
      ownsCurrentGeometry = true
    }
  } catch {
    if (ownsCurrentGeometry) {
      currentBrush.geometry.dispose()
    }
    return geometry
  }

  geometry.dispose()
  currentBrush.geometry.computeVertexNormals()
  return currentBrush.geometry
}

function createRevolveGeometry(node: FeatureNode, nodes: SceneNodes) {
  const step = getRenderableFeatureStep(node)
  if (step?.kind !== 'revolve') return new THREE.BufferGeometry()

  const profilePoints = rebuildProfileFromSourceSketch(step.profile, nodes).points
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
      : [[0, 0, 0] as [number, number, number], [3, 0, 0] as [number, number, number]]
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

function createFeatureGeometry(node: FeatureNode, nodes: SceneNodes) {
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
    return createRevolveGeometry(node, nodes)
  }

  return applyFeatureFaceCuts(createExtrudeGeometry(node, nodes), node, nodes)
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
  const sceneNodes = useScene((state) => state.nodes as SceneNodes)

  useRegistry(node.id, 'feature', ref)

  const handlers = useNodeEvents(node, 'feature')

  const geometry = useMemo(() => createFeatureGeometry(node, sceneNodes), [node, sceneNodes])
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
  const planeTransform = useFeaturePlaneTransform(node, baseElevation, sceneNodes)

  return (
    <group
      position={planeTransform.position}
      quaternion={planeTransform.quaternion}
      visible={node.visible}
    >
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
