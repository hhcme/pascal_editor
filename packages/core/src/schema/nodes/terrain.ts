import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'

const TerrainVertex = z.tuple([z.number(), z.number(), z.number()])
const TerrainTriangle = z.tuple([z.number(), z.number(), z.number()])

export const TerrainNode = BaseNode.extend({
  id: objectId('terrain'),
  type: nodeType('terrain'),
  boundary: z.array(z.tuple([z.number(), z.number()])).optional(),
  vertices: z.array(TerrainVertex).default([]),
  triangles: z.array(TerrainTriangle).default([]),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
}).describe(
  dedent`
  Terrain node - used to represent uneven site ground as a triangulated mesh.
  - boundary: optional [x, z] outline for planning and hit tests
  - vertices: [x, y, z] terrain vertices in meters
  - triangles: vertex index triples defining terrain faces
  `,
)

export type TerrainNode = z.infer<typeof TerrainNode>
