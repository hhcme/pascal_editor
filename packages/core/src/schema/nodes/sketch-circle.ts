import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { SketchDimensionMode } from './sketch-dimension'

export const SketchCircleKind = z.enum(['circle', 'arc'])
export const SketchCircleRelation = z.enum(['fixed'])
export const SketchCircleTangentMode = z.enum(['external', 'internal'])
export const SketchCircleConstraintKind = z.enum(['concentric', 'equal-radius', 'tangent'])
export const SketchCircleConstraint = z.object({
  kind: SketchCircleConstraintKind,
  targetId: objectId('sketch_circle'),
  tangentMode: SketchCircleTangentMode.optional(),
})

export const SketchCircleDimensions = z
  .object({
    radius: z.number().positive().optional(),
    radiusMode: SketchDimensionMode.optional(),
    arcLength: z.number().positive().optional(),
    arcLengthMode: SketchDimensionMode.optional(),
    radiusDisplay: z.enum(['radius', 'diameter', 'arc-length']).optional(),
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
  constraints: z.array(SketchCircleConstraint).default([]),
  dimensions: SketchCircleDimensions,
}).describe(
  dedent`
  Sketch circle node - used to represent true 2D circular sketch geometry on a level
  - kind: circle for a full circle, arc for a bounded circular arc
  - center/radius: circle definition in level coordinate system
  - startAngle/endAngle: arc bounds in radians, measured counter-clockwise in level coordinates
  - construction: whether the circle/arc is reference-only sketch geometry
  - relations: lightweight persisted relations for V0 sketch editing
  - constraints: lightweight persisted circle-to-circle constraint references
  - constraints.tangentMode: stores whether a tangent pair is external or internal
  - dimensions.radius: optional persisted radius in meters
  - dimensions.radiusMode: driven locks the radius, reference keeps a visible measurement only
  - dimensions.arcLength: optional persisted arc length in meters for sketch arcs
  - dimensions.arcLengthMode: driven locks the arc sweep via arc length, reference keeps a visible measurement only
  - dimensions.radiusDisplay: persists the active displayed dimension metric: radius/diameter for circles, radius/arc-length for arcs
  `,
)

export type SketchCircleConstraint = z.infer<typeof SketchCircleConstraint>
export type SketchCircleConstraintKind = z.infer<typeof SketchCircleConstraintKind>
export type SketchCircleDimensions = z.infer<typeof SketchCircleDimensions>
export type SketchCircleKind = z.infer<typeof SketchCircleKind>
export type SketchCircleNode = z.infer<typeof SketchCircleNode>
export type SketchCircleRelation = z.infer<typeof SketchCircleRelation>
export type SketchCircleTangentMode = z.infer<typeof SketchCircleTangentMode>
