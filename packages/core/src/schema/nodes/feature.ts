import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'
import { SketchCircleNode } from './sketch-circle'
import { SketchLineNode } from './sketch-line'

export const FeatureKind = z.enum([
  'extrude',
  'revolve',
  'extrude-cut',
  'revolve-cut',
  'hole',
  'fillet',
  'chamfer',
  'shell',
  'draft',
  'sweep',
  'loft',
  'mirror',
  'linear-pattern',
  'circular-pattern',
  'combine',
])
export const FeatureOperation = z.enum(['add', 'subtract', 'intersect', 'reference'])
export const FeatureDirection = z.enum(['up'])
export const FeatureStepStatus = z.enum(['ok', 'warning', 'failed', 'suppressed'])
export const FeatureReferenceStatus = z.enum(['resolved', 'missing', 'stale', 'unsupported'])
export const FeatureHoleEndCondition = z.enum(['through-all', 'blind'])
export const FeatureHoleKind = z.enum(['simple', 'counterbore', 'countersink'])

const FeatureReference = z.object({
  id: z.string(),
  role: z.string(),
  status: FeatureReferenceStatus.default('resolved'),
  message: z.string().optional(),
})

export const FeatureRebuildState = z.object({
  status: FeatureStepStatus.default('ok'),
  message: z.string().optional(),
  rebuiltAt: z.string().optional(),
  sourceHash: z.string().optional(),
})

export const FeatureProfileHole = z.object({
  kind: z.literal('sketch-profile'),
  lineIds: z.array(SketchLineNode.shape.id).default([]),
  circleIds: z.array(SketchCircleNode.shape.id).default([]),
  points: z.array(z.tuple([z.number(), z.number()])).min(3),
})

export const FeatureProfile = FeatureProfileHole.extend({
  holes: z.array(FeatureProfileHole).default([]),
})

export const FeatureSketchPlane = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('feature-top'),
    targetNodeId: z.string(),
    elevation: z.number(),
  }),
  z.object({
    kind: z.literal('feature-face'),
    targetNodeId: z.string(),
    space: z.enum(['target-local', 'scene']).optional(),
    origin: z.tuple([z.number(), z.number(), z.number()]),
    uAxis: z.tuple([z.number(), z.number(), z.number()]),
    vAxis: z.tuple([z.number(), z.number(), z.number()]),
    normal: z.tuple([z.number(), z.number(), z.number()]),
    label: z.string().optional(),
  }),
])

export const FeatureCut = z.object({
  id: objectId('feature_cut'),
  profile: FeatureProfile,
})

const FeatureStepBase = z.object({
  id: objectId('feature_step'),
  name: z.string().optional(),
  suppressed: z.boolean().default(false),
  references: z.array(FeatureReference).default([]),
  rebuild: FeatureRebuildState.default({ status: 'ok' }),
})

export const FeatureExtrudeStep = FeatureStepBase.extend({
  kind: z.literal('extrude'),
  operation: z.literal('add').default('add'),
  profile: FeatureProfile,
  depth: z.number().positive().default(2.8),
  baseElevation: z.number().default(0),
})

export const FeatureRevolveStep = FeatureStepBase.extend({
  kind: z.literal('revolve'),
  operation: z.literal('add').default('add'),
  profile: FeatureProfile,
  baseElevation: z.number().default(0),
  revolveAxisX: z.number().optional(),
  revolveAxisLineId: SketchLineNode.shape.id.optional(),
  revolveAngle: z
    .number()
    .positive()
    .default(Math.PI * 2),
})

export const FeatureExtrudeCutStep = FeatureStepBase.extend({
  kind: z.literal('extrude-cut'),
  operation: z.literal('subtract').default('subtract'),
  profile: FeatureProfile,
  sketchPlane: FeatureSketchPlane.optional(),
  targetIds: z.array(z.string()).default([]),
  depth: z.number().positive().optional(),
  throughAll: z.boolean().default(true),
})

export const FeatureRevolveCutStep = FeatureStepBase.extend({
  kind: z.literal('revolve-cut'),
  operation: z.literal('subtract').default('subtract'),
  profile: FeatureProfile,
  targetIds: z.array(z.string()).default([]),
  revolveAxisX: z.number().optional(),
  revolveAxisLineId: SketchLineNode.shape.id.optional(),
  revolveAngle: z
    .number()
    .positive()
    .default(Math.PI * 2),
})

export const FeatureHoleStep = FeatureStepBase.extend({
  kind: z.literal('hole'),
  operation: z.literal('subtract').default('subtract'),
  targetIds: z.array(z.string()).default([]),
  center: z.tuple([z.number(), z.number()]),
  diameter: z.number().positive().default(0.2),
  depth: z.number().positive().optional(),
  endCondition: FeatureHoleEndCondition.default('through-all'),
  holeKind: FeatureHoleKind.default('simple'),
  counterboreDiameter: z.number().positive().optional(),
  counterboreDepth: z.number().positive().optional(),
  countersinkDiameter: z.number().positive().optional(),
  countersinkAngle: z.number().positive().optional(),
})

export const FeatureEdgeTreatmentStep = FeatureStepBase.extend({
  kind: z.enum(['fillet', 'chamfer']),
  operation: z.literal('add').default('add'),
  targetIds: z.array(z.string()).default([]),
  edgeIds: z.array(z.string()).default([]),
  radius: z.number().positive().optional(),
  distance: z.number().positive().optional(),
  angle: z.number().positive().optional(),
})

export const FeatureShellStep = FeatureStepBase.extend({
  kind: z.literal('shell'),
  operation: z.literal('add').default('add'),
  targetIds: z.array(z.string()).default([]),
  openFaceIds: z.array(z.string()).default([]),
  thickness: z.number().positive().default(0.1),
  direction: z.enum(['inside', 'outside']).default('inside'),
})

export const FeatureDraftStep = FeatureStepBase.extend({
  kind: z.literal('draft'),
  operation: z.literal('add').default('add'),
  targetIds: z.array(z.string()).default([]),
  faceIds: z.array(z.string()).default([]),
  neutralPlaneId: z.string().optional(),
  angle: z.number().default(3),
})

export const FeatureSweepStep = FeatureStepBase.extend({
  kind: z.literal('sweep'),
  operation: FeatureOperation.default('add'),
  profile: FeatureProfile,
  pathLineIds: z.array(SketchLineNode.shape.id).default([]),
  pathPoints: z.array(z.tuple([z.number(), z.number(), z.number()])).default([]),
  twistMode: z.enum(['keep-normal', 'minimize-twist']).default('keep-normal'),
})

export const FeatureLoftStep = FeatureStepBase.extend({
  kind: z.literal('loft'),
  operation: FeatureOperation.default('add'),
  profiles: z.array(FeatureProfile).min(2),
  guideLineIds: z.array(SketchLineNode.shape.id).default([]),
})

export const FeatureMirrorStep = FeatureStepBase.extend({
  kind: z.literal('mirror'),
  operation: z.literal('add').default('add'),
  sourceStepIds: z.array(z.string()).default([]),
  mirrorPlaneId: z.string().optional(),
})

export const FeaturePatternStep = FeatureStepBase.extend({
  kind: z.enum(['linear-pattern', 'circular-pattern']),
  operation: z.literal('add').default('add'),
  sourceStepIds: z.array(z.string()).default([]),
  count: z.number().int().min(1).default(2),
  spacing: z.number().positive().optional(),
  angle: z.number().optional(),
  skippedInstances: z.array(z.number().int().min(0)).default([]),
})

export const FeatureCombineStep = FeatureStepBase.extend({
  kind: z.literal('combine'),
  operation: z.enum(['add', 'subtract', 'intersect']).default('add'),
  targetBodyId: z.string(),
  toolBodyIds: z.array(z.string()).min(1),
  keepTools: z.boolean().default(false),
})

export const FeatureStep = z.discriminatedUnion('kind', [
  FeatureExtrudeStep,
  FeatureRevolveStep,
  FeatureExtrudeCutStep,
  FeatureRevolveCutStep,
  FeatureHoleStep,
  FeatureEdgeTreatmentStep,
  FeatureShellStep,
  FeatureDraftStep,
  FeatureSweepStep,
  FeatureLoftStep,
  FeatureMirrorStep,
  FeaturePatternStep,
  FeatureCombineStep,
])

export const FeatureBody = z.object({
  id: objectId('feature_body'),
  name: z.string().optional(),
  sourceStepIds: z.array(z.string()).default([]),
  profile: FeatureProfile.optional(),
  depth: z.number().positive().optional(),
  baseElevation: z.number().optional(),
  transform: z
    .object({
      translation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    })
    .optional(),
  visible: z.boolean().default(true),
})

export const FeatureReferenceGeometry = z.discriminatedUnion('kind', [
  z.object({
    id: objectId('feature_ref'),
    kind: z.literal('plane'),
    name: z.string().optional(),
    origin: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    normal: z.tuple([z.number(), z.number(), z.number()]).default([0, 1, 0]),
    offset: z.number().default(0),
  }),
  z.object({
    id: objectId('feature_ref'),
    kind: z.literal('axis'),
    name: z.string().optional(),
    origin: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    direction: z.tuple([z.number(), z.number(), z.number()]).default([0, 1, 0]),
  }),
  z.object({
    id: objectId('feature_ref'),
    kind: z.literal('point'),
    name: z.string().optional(),
    position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  }),
])

export const FeatureDefinition = z.object({
  version: z.literal(1).default(1),
  autoRebuild: z.boolean().default(false),
  steps: z.array(FeatureStep).default([]),
  bodies: z.array(FeatureBody).default([]),
  referenceGeometry: z.array(FeatureReferenceGeometry).default([]),
  rebuild: FeatureRebuildState.default({ status: 'ok' }),
})

export const FeatureNode = BaseNode.extend({
  id: objectId('feature'),
  type: nodeType('feature'),
  kind: FeatureKind.default('extrude'),
  operation: FeatureOperation.default('add'),
  direction: FeatureDirection.default('up'),
  profile: FeatureProfile,
  depth: z.number().positive().default(2.8),
  baseElevation: z.number().default(0),
  cuts: z.array(FeatureCut).default([]),
  revolveAxisX: z.number().optional(),
  revolveAxisLineId: SketchLineNode.shape.id.optional(),
  revolveAngle: z
    .number()
    .positive()
    .default(Math.PI * 2),
  definition: FeatureDefinition.optional(),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
}).describe(
  dedent`
  Feature node - used to represent lightweight parametric building features.
  - kind: legacy primary kind plus planned SolidWorks-style feature classes
  - operation: add/subtract/intersect/reference intent, V0 renders add features as standalone bodies
  - profile: source sketch profile snapshot plus source sketch line ids
  - cuts: through-cut profile snapshots applied as holes for V0 extrude geometry
  - depth: vertical extrusion distance in meters
  - baseElevation: local level elevation where the extrusion starts
  - revolveAxisX: local X position of the vertical revolve axis
  - revolveAxisLineId: optional source construction sketch line for the revolve axis
  - revolveAngle: revolve sweep in radians, V0 creates full 360 degree revolve features
  - definition: V1 feature timeline with rebuild state, source references, bodies, and reference geometry
  - material/materialPreset: optional feature finish
  `,
)

export type FeatureBody = z.infer<typeof FeatureBody>
export type FeatureDirection = z.infer<typeof FeatureDirection>
export type FeatureCut = z.infer<typeof FeatureCut>
export type FeatureDefinition = z.infer<typeof FeatureDefinition>
export type FeatureCombineStep = z.infer<typeof FeatureCombineStep>
export type FeatureDraftStep = z.infer<typeof FeatureDraftStep>
export type FeatureEdgeTreatmentStep = z.infer<typeof FeatureEdgeTreatmentStep>
export type FeatureExtrudeCutStep = z.infer<typeof FeatureExtrudeCutStep>
export type FeatureExtrudeStep = z.infer<typeof FeatureExtrudeStep>
export type FeatureHoleEndCondition = z.infer<typeof FeatureHoleEndCondition>
export type FeatureHoleKind = z.infer<typeof FeatureHoleKind>
export type FeatureHoleStep = z.infer<typeof FeatureHoleStep>
export type FeatureKind = z.infer<typeof FeatureKind>
export type FeatureLoftStep = z.infer<typeof FeatureLoftStep>
export type FeatureMirrorStep = z.infer<typeof FeatureMirrorStep>
export type FeatureNode = z.infer<typeof FeatureNode>
export type FeatureOperation = z.infer<typeof FeatureOperation>
export type FeaturePatternStep = z.infer<typeof FeaturePatternStep>
export type FeatureProfile = z.infer<typeof FeatureProfile>
export type FeatureProfileHole = z.infer<typeof FeatureProfileHole>
export type FeatureRebuildState = z.infer<typeof FeatureRebuildState>
export type FeatureReferenceGeometry = z.infer<typeof FeatureReferenceGeometry>
export type FeatureReferenceStatus = z.infer<typeof FeatureReferenceStatus>
export type FeatureRevolveCutStep = z.infer<typeof FeatureRevolveCutStep>
export type FeatureRevolveStep = z.infer<typeof FeatureRevolveStep>
export type FeatureShellStep = z.infer<typeof FeatureShellStep>
export type FeatureSketchPlane = z.infer<typeof FeatureSketchPlane>
export type FeatureStep = z.infer<typeof FeatureStep>
export type FeatureStepStatus = z.infer<typeof FeatureStepStatus>
export type FeatureSweepStep = z.infer<typeof FeatureSweepStep>
