import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'

const RadiusPair = z.tuple([z.number().positive(), z.number().positive()])

export const ProceduralTowerNode = BaseNode.extend({
  id: objectId('procedural_tower'),
  type: nodeType('procedural-tower'),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  mainBodyHeight: z.number().positive().default(45),
  antennaHeight: z.number().nonnegative().default(15),
  waistY: z.number().positive().default(24),
  baseRadius: RadiusPair.default([10.5, 7.4]),
  waistRadius: RadiusPair.default([5.4, 3.8]),
  topRadius: RadiusPair.default([8.8, 6.2]),
  twist: z.number().default(Math.PI / 2),
  columnCount: z.number().int().min(3).max(96).default(24),
  ringCount: z.number().int().min(0).max(96).default(24),
  radialSegments: z.number().int().min(8).max(128).default(64),
  columnRadius: z.number().positive().default(0.12),
  braceRadius: z.number().positive().default(0.055),
  ringRadius: z.number().positive().default(0.06),
  antennaRadius: z.number().positive().default(0.16),
  showFacade: z.boolean().default(true),
  showSteelFrame: z.boolean().default(true),
  showRings: z.boolean().default(true),
  showAntenna: z.boolean().default(true),
  facadeMaterial: MaterialSchema.optional(),
  steelMaterial: MaterialSchema.optional(),
  ringMaterial: MaterialSchema.optional(),
  antennaMaterial: MaterialSchema.optional(),
}).describe(
  dedent`
  Procedural tower node - parameterized landmark tower generator
  - position: tower origin in level coordinates
  - mainBodyHeight/antennaHeight: tower body and antenna heights
  - baseRadius/waistRadius/topRadius: elliptical section radii
  - waistY/twist: waist elevation and total body twist
  - columnCount/ringCount: generated steel frame density
  - showFacade/showSteelFrame/showRings/showAntenna: visibility switches for generated parts
  `,
)

export type ProceduralTowerNode = z.infer<typeof ProceduralTowerNode>
