import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const SketchLineRelation = z.enum(['horizontal', 'vertical', 'fixed'])
export const SketchLineEndpoint = z.enum(['start', 'end'])

export const SketchLineEndpointReference = z.object({
  lineId: z.templateLiteral(['sketch_line_', z.string()]),
  endpoint: SketchLineEndpoint,
})

export const SketchLineDimensions = z
  .object({
    length: z.number().positive().optional(),
  })
  .default({})

export const SketchLineCoincident = z
  .object({
    start: SketchLineEndpointReference.optional(),
    end: SketchLineEndpointReference.optional(),
  })
  .default({})

export const SketchLineNode = BaseNode.extend({
  id: objectId('sketch_line'),
  type: nodeType('sketch-line'),
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
  curveOffset: z.number().optional(),
  construction: z.boolean().default(false),
  relations: z.array(SketchLineRelation).default([]),
  dimensions: SketchLineDimensions,
  coincident: SketchLineCoincident,
}).describe(
  dedent`
  Sketch line node - used to represent lightweight 2D sketch geometry on a level
  - start/end: line endpoints in level coordinate system
  - curveOffset: midpoint sagitta offset used to bend the sketch line into an arc
  - construction: whether the line is reference-only sketch geometry
  - relations: lightweight persisted relations for V0 sketch editing
  - dimensions.length: optional driven line length in meters
  - coincident: optional endpoint-to-endpoint links for lightweight sketch connectivity
  `,
)

export type SketchLineNode = z.infer<typeof SketchLineNode>
export type SketchLineCoincident = z.infer<typeof SketchLineCoincident>
export type SketchLineEndpoint = z.infer<typeof SketchLineEndpoint>
export type SketchLineEndpointReference = z.infer<typeof SketchLineEndpointReference>
export type SketchLineRelation = z.infer<typeof SketchLineRelation>
