#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const EDITOR_ROOT = path.resolve(__dirname, '../..')
const ITEMS_ROOT = path.join(EDITOR_ROOT, 'apps/editor/public/items')
const THREE = require(path.join(EDITOR_ROOT, 'apps/editor/node_modules/three/build/three.cjs'))

const DEFAULT_SIZE = 512
const DEFAULT_CAMERA = [1.4, 0.95, 1.35]
const DEFAULT_LIGHT = new THREE.Vector3(-0.35, 0.8, 0.45).normalize()

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const sharp = loadSharp()
  const targets = resolveTargets(options)

  if (targets.length === 0) {
    console.log('No item thumbnails to render.')
    return
  }

  for (const itemId of targets) {
    const itemDir = path.join(ITEMS_ROOT, itemId)
    const modelPath = path.join(itemDir, 'model.glb')
    const outputPath = path.join(itemDir, 'thumbnail.webp')

    if (!fs.existsSync(modelPath)) {
      console.warn(`${itemId}: skipped, missing model.glb`)
      continue
    }

    if (fs.existsSync(outputPath) && !options.force) {
      console.warn(`${itemId}: skipped, thumbnail.webp already exists`)
      continue
    }

    const mesh = loadGlbMesh(modelPath)
    if (mesh.triangles.length === 0) {
      console.warn(`${itemId}: skipped, no readable mesh triangles`)
      continue
    }

    const svg = renderMeshSvg(mesh, {
      itemId,
      size: options.size,
      camera: options.camera,
    })

    await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(outputPath)
    console.log(`${itemId}: wrote ${path.relative(EDITOR_ROOT, outputPath)}`)
  }
}

function parseArgs(args) {
  const options = {
    force: false,
    missing: false,
    size: DEFAULT_SIZE,
    camera: DEFAULT_CAMERA,
    itemIds: [],
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--force') {
      options.force = true
      continue
    }
    if (arg === '--missing') {
      options.missing = true
      continue
    }
    if (arg === '--size') {
      options.size = Number(args[index + 1])
      index += 1
      continue
    }
    if (arg === '--camera') {
      options.camera = args[index + 1].split(',').map(Number)
      index += 1
      continue
    }
    options.itemIds.push(arg)
  }

  if (!Number.isFinite(options.size) || options.size < 128 || options.size > 2048) {
    throw new Error('--size must be a number between 128 and 2048')
  }

  if (options.camera.length !== 3 || options.camera.some((value) => !Number.isFinite(value))) {
    throw new Error('--camera must be three comma-separated numbers, for example 1.4,0.95,1.35')
  }

  return options
}

function resolveTargets(options) {
  if (options.itemIds.length > 0) return options.itemIds

  const itemIds = fs
    .readdirSync(ITEMS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((itemId) => fs.existsSync(path.join(ITEMS_ROOT, itemId, 'model.glb')))
    .filter((itemId) => options.force || !fs.existsSync(path.join(ITEMS_ROOT, itemId, 'thumbnail.webp')))
    .sort()

  return options.missing || options.force ? itemIds : []
}

function loadSharp() {
  try {
    return require('sharp')
  } catch {}

  const fallbackPath = path.join(EDITOR_ROOT, 'node_modules/.bun/sharp@0.34.5/node_modules/sharp/lib/index.js')
  if (fs.existsSync(fallbackPath)) return require(fallbackPath)

  throw new Error('Missing sharp. Run bun install or add sharp before rendering thumbnails.')
}

function loadGlbMesh(modelPath) {
  const glb = parseGlb(modelPath)
  const rootNodes = glb.json.scenes?.[glb.json.scene ?? 0]?.nodes ?? glb.json.nodes?.map((_, index) => index) ?? []
  const triangles = []
  const bounds = new THREE.Box3()

  const visit = (nodeIndex, parentMatrix) => {
    const node = glb.json.nodes[nodeIndex]
    const worldMatrix = parentMatrix.clone().multiply(getNodeMatrix(node))

    if (node.mesh !== undefined) {
      const mesh = glb.json.meshes[node.mesh]
      for (const primitive of mesh.primitives ?? []) {
        if (primitive.extensions?.KHR_draco_mesh_compression) continue
        triangles.push(...readPrimitiveTriangles(glb, primitive, worldMatrix, bounds))
      }
    }

    for (const childIndex of node.children ?? []) visit(childIndex, worldMatrix)
  }

  for (const nodeIndex of rootNodes) visit(nodeIndex, new THREE.Matrix4())

  return { triangles, bounds }
}

function parseGlb(modelPath) {
  const buffer = fs.readFileSync(modelPath)
  if (buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${modelPath} is not a binary glTF file`)
  }

  let offset = 12
  let json = null
  let bin = null

  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.toString('utf8', offset + 4, offset + 8)
    const chunk = buffer.subarray(offset + 8, offset + 8 + chunkLength)

    if (chunkType === 'JSON') json = JSON.parse(new TextDecoder().decode(chunk))
    if (chunkType === 'BIN\0') bin = chunk

    offset += 8 + chunkLength
  }

  if (!json) throw new Error(`${modelPath} is missing its JSON chunk`)
  if (!bin) throw new Error(`${modelPath} is missing its BIN chunk`)

  return { json, bin }
}

function getNodeMatrix(node) {
  const matrix = new THREE.Matrix4()
  if (node.matrix) return matrix.fromArray(node.matrix)

  const translation = new THREE.Vector3(...(node.translation ?? [0, 0, 0]))
  const rotation = new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1]))
  const scale = new THREE.Vector3(...(node.scale ?? [1, 1, 1]))
  return matrix.compose(translation, rotation, scale)
}

function readPrimitiveTriangles(glb, primitive, worldMatrix, bounds) {
  const positionAccessorIndex = primitive.attributes?.POSITION
  if (positionAccessorIndex === undefined) return []

  const positions = readAccessor(glb, positionAccessorIndex)
  const normals =
    primitive.attributes?.NORMAL !== undefined ? readAccessor(glb, primitive.attributes.NORMAL) : null
  const indices = primitive.indices !== undefined ? readAccessor(glb, primitive.indices) : null
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix)
  const material = getMaterialColor(glb.json, primitive.material)
  const triangles = []

  const vertexCount = indices ? indices.length : positions.length
  for (let i = 0; i < vertexCount; i += 3) {
    const aIndex = indices ? indices[i] : i
    const bIndex = indices ? indices[i + 1] : i + 1
    const cIndex = indices ? indices[i + 2] : i + 2

    const a = vectorFromTuple(positions[aIndex]).applyMatrix4(worldMatrix)
    const b = vectorFromTuple(positions[bIndex]).applyMatrix4(worldMatrix)
    const c = vectorFromTuple(positions[cIndex]).applyMatrix4(worldMatrix)
    bounds.expandByPoint(a)
    bounds.expandByPoint(b)
    bounds.expandByPoint(c)

    let normal
    if (normals?.[aIndex] && normals?.[bIndex] && normals?.[cIndex]) {
      normal = vectorFromTuple(normals[aIndex])
        .add(vectorFromTuple(normals[bIndex]))
        .add(vectorFromTuple(normals[cIndex]))
        .normalize()
        .applyMatrix3(normalMatrix)
        .normalize()
    } else {
      normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
    }

    triangles.push({ points: [a, b, c], normal, material })
  }

  return triangles
}

function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex]
  const bufferView = glb.json.bufferViews[accessor.bufferView]
  const componentSize = getComponentSize(accessor.componentType)
  const componentCount = getTypeComponentCount(accessor.type)
  const byteStride = bufferView.byteStride ?? componentSize * componentCount
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const values = []

  for (let index = 0; index < accessor.count; index += 1) {
    const valueOffset = baseOffset + index * byteStride
    if (componentCount === 1) {
      values.push(readComponent(glb.bin, valueOffset, accessor.componentType))
      continue
    }

    const tuple = []
    for (let component = 0; component < componentCount; component += 1) {
      tuple.push(
        readComponent(glb.bin, valueOffset + component * componentSize, accessor.componentType),
      )
    }
    values.push(tuple)
  }

  return values
}

function getComponentSize(componentType) {
  switch (componentType) {
    case 5120:
    case 5121:
      return 1
    case 5122:
    case 5123:
      return 2
    case 5125:
    case 5126:
      return 4
    default:
      throw new Error(`Unsupported glTF component type: ${componentType}`)
  }
}

function readComponent(buffer, offset, componentType) {
  switch (componentType) {
    case 5120:
      return buffer.readInt8(offset)
    case 5121:
      return buffer.readUInt8(offset)
    case 5122:
      return buffer.readInt16LE(offset)
    case 5123:
      return buffer.readUInt16LE(offset)
    case 5125:
      return buffer.readUInt32LE(offset)
    case 5126:
      return buffer.readFloatLE(offset)
    default:
      throw new Error(`Unsupported glTF component type: ${componentType}`)
  }
}

function getTypeComponentCount(type) {
  switch (type) {
    case 'SCALAR':
      return 1
    case 'VEC2':
      return 2
    case 'VEC3':
      return 3
    case 'VEC4':
      return 4
    default:
      throw new Error(`Unsupported glTF accessor type: ${type}`)
  }
}

function vectorFromTuple(tuple) {
  return new THREE.Vector3(tuple[0], tuple[1], tuple[2])
}

function getMaterialColor(json, materialIndex) {
  const factor =
    materialIndex !== undefined
      ? json.materials?.[materialIndex]?.pbrMetallicRoughness?.baseColorFactor
      : null

  if (!factor) return [224, 228, 235]
  return factor.slice(0, 3).map((value) => Math.round(clamp(value, 0, 1) * 255))
}

function renderMeshSvg(mesh, options) {
  const { size, itemId } = options
  const center = new THREE.Vector3()
  const boxSize = new THREE.Vector3()
  mesh.bounds.getCenter(center)
  mesh.bounds.getSize(boxSize)

  const radius = Math.max(boxSize.length() / 2, 0.1)
  const cameraDirection = new THREE.Vector3(...options.camera).normalize()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, radius * 20)
  camera.position.copy(center).add(cameraDirection.multiplyScalar(radius * 4))
  camera.lookAt(center)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()

  const projected = mesh.triangles
    .map((triangle) => projectTriangle(triangle, camera, size))
    .filter(Boolean)
    .sort((a, b) => a.depth - b.depth)

  const polygons = projected
    .map((triangle) => {
      const color = shadeColor(triangle.material, triangle.shade)
      const points = triangle.points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ')
      return `<polygon points="${points}" fill="${color}" stroke="rgba(255,255,255,0.18)" stroke-width="0.6"/>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(itemId)}">
  <rect width="${size}" height="${size}" rx="0" fill="#050505"/>
  <ellipse cx="${size / 2}" cy="${size * 0.78}" rx="${size * 0.28}" ry="${size * 0.06}" fill="rgba(255,255,255,0.10)"/>
  ${polygons}
</svg>`
}

function projectTriangle(triangle, camera, size) {
  const cameraSpace = triangle.points.map((point) => point.clone().applyMatrix4(camera.matrixWorldInverse))
  const points = triangle.points.map((point) => point.clone().project(camera))
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null

  const screenPoints = points.map(
    (point) =>
      new THREE.Vector2((point.x * 0.5 + 0.5) * size, (-point.y * 0.5 + 0.5) * size),
  )

  const area =
    (screenPoints[1].x - screenPoints[0].x) * (screenPoints[2].y - screenPoints[0].y) -
    (screenPoints[1].y - screenPoints[0].y) * (screenPoints[2].x - screenPoints[0].x)

  if (Math.abs(area) < 0.05) return null

  const viewNormal = triangle.normal.clone().transformDirection(camera.matrixWorldInverse)
  const lightShade = Math.max(0, triangle.normal.dot(DEFAULT_LIGHT))
  const facingShade = Math.max(0.2, Math.abs(viewNormal.z))
  const shade = 0.42 + lightShade * 0.38 + facingShade * 0.2
  const depth = cameraSpace.reduce((total, point) => total + point.z, 0) / cameraSpace.length

  return { points: screenPoints, depth, shade, material: triangle.material }
}

function shadeColor(material, shade) {
  const [r, g, b] = material.map((value) => Math.round(clamp(value * shade, 0, 255)))
  return `rgb(${r},${g},${b})`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value) {
  return Math.round(value * 100) / 100
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case '"':
        return '&quot;'
      case "'":
        return '&apos;'
      default:
        return char
    }
  })
}
