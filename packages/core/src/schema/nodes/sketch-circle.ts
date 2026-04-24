import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const SketchCircleKind = z.enum(['circle', 'arc'])
export const SketchCircleRelation = z.enum(['fixed'])

export const SketchCircleDimensions = z
  .object({
    radius: z.number().positive().optional(),
  })
  .default({})

export const SketchCircleNode = BaseNode.extend({
  id: objectId('sketch_circle'),
  type: nodeType('sketch-circle'),
  kind: SketchCircleKind.default('circle'),
  center: z.tuple([z.number(), z.number()]),
  radius: z.number().positive(),
  startAngle: z.number().default(0),
  endAngle: z.number().default(Math.PI * 2),
  construction: z.boolean().default(false),
  relations: z.array(SketchCircleRelation).default([]),
  dimensions: SketchCircleDimensions,
}).describe(
  dedent`
  Sketch circle node - used to represent true 2D circular sketch geometry on a level
  - kind: circle for a full circle, arc for a bounded circular arc
  - center/radius: circle definition in level coordinate system
  - startAngle/endAngle: arc bounds in radians, measured counter-clockwise in level coordinates
  - construction: whether the circle/arc is reference-only sketch geometry
  - relations: lightweight persisted relations for V0 sketch editing
  - dimensions.radius: optional driven radius in meters
  `,
)

export type SketchCircleDimensions = z.infer<typeof SketchCircleDimensions>
export type SketchCircleKind = z.infer<typeof SketchCircleKind>
export type SketchCircleNode = z.infer<typeof SketchCircleNode>
export type SketchCircleRelation = z.infer<typeof SketchCircleRelation>
