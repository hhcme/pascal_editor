import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { SketchDimensionMode } from './sketch-dimension'

export const SketchLineRelation = z.enum(['horizontal', 'vertical', 'fixed'])
export const SketchLineEndpoint = z.enum(['start', 'end'])
export const SketchLineConstraintKind = z.enum([
  'equal-length',
  'parallel',
  'perpendicular',
  'collinear',
])

export const SketchLineEndpointReference = z.object({
  lineId: z.templateLiteral(['sketch_line_', z.string()]),
  endpoint: SketchLineEndpoint,
})

export const SketchLinePointReference = z.object({
  kind: z.literal('line-point'),
  lineId: z.templateLiteral(['sketch_line_', z.string()]),
  t: z.number(),
})

export const SketchCirclePointReference = z.object({
  kind: z.literal('circle-point'),
  circleId: z.templateLiteral(['sketch_circle_', z.string()]),
  angle: z.number(),
})

export const SketchLineCoincidentReference = z.union([
  SketchLineEndpointReference,
  SketchLinePointReference,
  SketchCirclePointReference,
])

export const SketchLineTangent = z.object({
  circleId: z.templateLiteral(['sketch_circle_', z.string()]),
  endpoint: SketchLineEndpoint,
})

export const SketchLineConstraint = z.object({
  kind: SketchLineConstraintKind,
  targetId: z.templateLiteral(['sketch_line_', z.string()]),
})

export const SketchLineDimensions = z
  .object({
    length: z.number().positive().optional(),
    lengthMode: SketchDimensionMode.optional(),
    angle: z.number().optional(),
    angleMode: SketchDimensionMode.optional(),
  })
  .default({})

export const SketchLineCoincident = z
  .object({
    start: SketchLineCoincidentReference.optional(),
    end: SketchLineCoincidentReference.optional(),
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
  constraints: z.array(SketchLineConstraint).default([]),
  dimensions: SketchLineDimensions,
  coincident: SketchLineCoincident,
  tangent: SketchLineTangent.optional(),
}).describe(
  dedent`
  Sketch line node - used to represent lightweight 2D sketch geometry on a level
  - start/end: line endpoints in level coordinate system
  - curveOffset: midpoint sagitta offset used to bend the sketch line into an arc
  - construction: whether the line is reference-only sketch geometry
  - relations: lightweight persisted relations for V0 sketch editing
  - constraints: lightweight persisted line-to-line constraint references
  - dimensions.length: optional persisted line length in meters
  - dimensions.lengthMode: driven locks the line length, reference keeps a visible measurement only
  - dimensions.angle: optional persisted line angle in radians, measured from the positive X axis
  - dimensions.angleMode: driven locks the line angle, reference keeps a visible measurement only
  - coincident: optional endpoint attachment refs to endpoints, line interiors, or circles/arcs
  - tangent: optional lightweight line-to-circle tangency reference
  `,
)

export type SketchCirclePointReference = z.infer<typeof SketchCirclePointReference>
export type SketchLineConstraint = z.infer<typeof SketchLineConstraint>
export type SketchLineConstraintKind = z.infer<typeof SketchLineConstraintKind>
export type SketchLineCoincidentReference = z.infer<typeof SketchLineCoincidentReference>
export type SketchLineNode = z.infer<typeof SketchLineNode>
export type SketchLineCoincident = z.infer<typeof SketchLineCoincident>
export type SketchLineEndpoint = z.infer<typeof SketchLineEndpoint>
export type SketchLineEndpointReference = z.infer<typeof SketchLineEndpointReference>
export type SketchLinePointReference = z.infer<typeof SketchLinePointReference>
export type SketchLineRelation = z.infer<typeof SketchLineRelation>
export type SketchLineTangent = z.infer<typeof SketchLineTangent>
