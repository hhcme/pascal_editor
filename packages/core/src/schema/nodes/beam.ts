import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'

export const BeamProfile = z.enum(['round', 'square'])

export const BeamNode = BaseNode.extend({
  id: objectId('beam'),
  type: nodeType('beam'),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
  start: z.tuple([z.number(), z.number(), z.number()]),
  end: z.tuple([z.number(), z.number(), z.number()]),
  radius: z.number().positive().default(0.08),
  profile: BeamProfile.default('round'),
  radialSegments: z.number().int().min(3).max(32).default(12),
}).describe(
  dedent`
  Beam node - used to represent a linear structural member in level coordinates
  - start/end: 3D endpoints in level coordinate system
  - radius: round tube radius, or half-width for square members
  - profile: round uses cylinder geometry; square uses box geometry
  - material/materialPreset: optional finish for steel, concrete, timber, or custom members
  `,
)

export type BeamNode = z.infer<typeof BeamNode>
export type BeamProfile = z.infer<typeof BeamProfile>
