import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { BeamNode } from './beam'
import { CeilingNode } from './ceiling'
import { FeatureNode } from './feature'
import { FenceNode } from './fence'
import { GuideNode } from './guide'
import { LoftNode } from './loft'
import { ProceduralTowerNode } from './procedural-tower'
import { RoofNode } from './roof'
import { ScanNode } from './scan'
import { SketchCircleNode } from './sketch-circle'
import { SketchDimensionNode } from './sketch-dimension'
import { SketchLineNode } from './sketch-line'
import { SlabNode } from './slab'
import { StairNode } from './stair'
import { WallNode } from './wall'
import { ZoneNode } from './zone'

export const LevelNode = BaseNode.extend({
  id: objectId('level'),
  type: nodeType('level'),
  children: z
    .array(
      z.union([
        BeamNode.shape.id,
        LoftNode.shape.id,
        ProceduralTowerNode.shape.id,
        WallNode.shape.id,
        FenceNode.shape.id,
        FeatureNode.shape.id,
        ZoneNode.shape.id,
        SlabNode.shape.id,
        CeilingNode.shape.id,
        RoofNode.shape.id,
        StairNode.shape.id,
        ScanNode.shape.id,
        GuideNode.shape.id,
        SketchDimensionNode.shape.id,
        SketchCircleNode.shape.id,
        SketchLineNode.shape.id,
      ]),
    )
    .default([]),
  // Specific props
  level: z.number().default(0),
}).describe(
  dedent`
  Level node - used to represent a level in the building
  - children: array of floor, wall, ceiling, roof, item nodes
  - level: level number
  `,
)

export type LevelNode = z.infer<typeof LevelNode>
