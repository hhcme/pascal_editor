import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'

export const LoftSection = z.object({
  center: z.tuple([z.number(), z.number()]).default([0, 0]),
  y: z.number(),
  radiusX: z.number().positive(),
  radiusZ: z.number().positive(),
  rotation: z.number().default(0),
})

export const LoftNode = BaseNode.extend({
  id: objectId('loft'),
  type: nodeType('loft'),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
  sections: z.array(LoftSection).min(2),
  radialSegments: z.number().int().min(8).max(128).default(48),
  capStart: z.boolean().default(true),
  capEnd: z.boolean().default(true),
}).describe(
  dedent`
  Loft node - used to represent a continuous shell generated from 2D sections
  - sections: ordered elliptical sections in level coordinates
  - y: vertical elevation for each section
  - radiusX/radiusZ/rotation: ellipse shape and twist at that elevation
  - radialSegments: tessellation around each section
  - capStart/capEnd: whether to close the bottom/top of the shell
  `,
)

export type LoftNode = z.infer<typeof LoftNode>
export type LoftSection = z.infer<typeof LoftSection>
