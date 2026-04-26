import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const SketchDimensionMode = z.enum(['driven', 'reference'])
export const SketchDimensionKind = z.enum(['distance'])
export const SketchDimensionLineEndpoint = z.enum(['start', 'end'])

export const SketchDimensionLineEndpointReference = z.object({
  kind: z.literal('line-endpoint'),
  lineId: z.templateLiteral(['sketch_line_', z.string()]),
  endpoint: SketchDimensionLineEndpoint,
})

export const SketchDimensionCircleCenterReference = z.object({
  kind: z.literal('circle-center'),
  circleId: z.templateLiteral(['sketch_circle_', z.string()]),
})

export const SketchDimensionLineReference = z.object({
  kind: z.literal('line'),
  lineId: z.templateLiteral(['sketch_line_', z.string()]),
})

export const SketchDimensionPointReference = z.union([
  SketchDimensionLineEndpointReference,
  SketchDimensionCircleCenterReference,
])
export const SketchDimensionReference = z.union([
  SketchDimensionPointReference,
  SketchDimensionLineReference,
])

export const SketchDimensionNode = BaseNode.extend({
  id: objectId('sketch_dimension'),
  type: nodeType('sketch-dimension'),
  kind: SketchDimensionKind.default('distance'),
  mode: SketchDimensionMode.default('reference'),
  start: SketchDimensionReference,
  end: SketchDimensionReference,
  offset: z.number().default(0.42),
}).describe(
  dedent`
  Sketch dimension node - used to persist cross-entity sketch measurements on a level
  - kind: currently supports distance dimensions between point or line references
  - mode: reference shows a measured value without driving geometry; driven is reserved for future solver-backed dimensions
  - start/end: references to sketch line endpoints, sketch circle centers, or whole sketch lines
  - offset: signed display offset in level units for the rendered dimension line
  `,
)

export type SketchDimensionCircleCenterReference = z.infer<
  typeof SketchDimensionCircleCenterReference
>
export type SketchDimensionKind = z.infer<typeof SketchDimensionKind>
export type SketchDimensionLineEndpoint = z.infer<typeof SketchDimensionLineEndpoint>
export type SketchDimensionLineEndpointReference = z.infer<
  typeof SketchDimensionLineEndpointReference
>
export type SketchDimensionLineReference = z.infer<typeof SketchDimensionLineReference>
export type SketchDimensionMode = z.infer<typeof SketchDimensionMode>
export type SketchDimensionNode = z.infer<typeof SketchDimensionNode>
export type SketchDimensionReference = z.infer<typeof SketchDimensionReference>
export type SketchDimensionPointReference = z.infer<typeof SketchDimensionPointReference>
