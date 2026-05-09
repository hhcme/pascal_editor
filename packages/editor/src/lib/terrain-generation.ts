import { type SiteNode, TerrainNode, type TerrainNode as TerrainNodeType } from '@pascal-app/core'

export type TerrainPreset = 'flat' | 'gentle-slope' | 'soft-hill'

type TerrainMesh = Pick<TerrainNodeType, 'boundary' | 'vertices' | 'triangles'>

const DEFAULT_BOUNDARY: Array<[number, number]> = [
  [-8, -6],
  [8, -6],
  [8, 6],
  [-8, 6],
]

const TERRAIN_GRASS: TerrainNodeType['material'] = {
  preset: 'custom',
  properties: {
    color: '#78935a',
    roughness: 0.92,
    metalness: 0,
    opacity: 1,
    transparent: false,
    side: 'front',
  },
}

function getBoundaryBounds(boundary: Array<[number, number]>) {
  return boundary.reduce(
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

export function getSiteTerrainBoundary(site: SiteNode | null | undefined): Array<[number, number]> {
  const points = site?.polygon?.points
  return points && points.length >= 3 ? points : DEFAULT_BOUNDARY
}

export function createTerrainMesh(
  boundary: Array<[number, number]>,
  preset: TerrainPreset,
): TerrainMesh {
  const safeBoundary = boundary.length >= 3 ? boundary : DEFAULT_BOUNDARY
  const bounds = getBoundaryBounds(safeBoundary)
  const cols = 7
  const rows = 7
  const width = Math.max(bounds.maxX - bounds.minX, 1)
  const depth = Math.max(bounds.maxZ - bounds.minZ, 1)
  const vertices: TerrainNodeType['vertices'] = []
  const triangles: TerrainNodeType['triangles'] = []

  for (let row = 0; row < rows; row++) {
    const v = row / (rows - 1)
    const z = bounds.minZ + depth * v

    for (let col = 0; col < cols; col++) {
      const u = col / (cols - 1)
      const x = bounds.minX + width * u
      const dx = u - 0.5
      const dz = v - 0.5
      const hill = Math.exp(-(dx * dx + dz * dz) * 7)
      const ripple = Math.sin(u * Math.PI * 2) * Math.cos(v * Math.PI * 2) * 0.08
      const y =
        preset === 'flat'
          ? 0
          : preset === 'gentle-slope'
            ? (v - 0.5) * 1.4 + ripple
            : hill * 1.5 + (v - 0.5) * 0.45 + ripple - 0.15

      vertices.push([Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))])
    }
  }

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      triangles.push([a, c, b], [b, c, d])
    }
  }

  return {
    boundary: safeBoundary,
    vertices,
    triangles,
  }
}

export function createGeneratedTerrainNode(site: SiteNode, preset: TerrainPreset): TerrainNodeType {
  return TerrainNode.parse({
    parentId: site.id,
    name:
      preset === 'flat'
        ? 'Flat Site Terrain'
        : preset === 'gentle-slope'
          ? 'Gentle Slope Terrain'
          : 'Soft Hill Terrain',
    ...createTerrainMesh(getSiteTerrainBoundary(site), preset),
    material: TERRAIN_GRASS,
  })
}
