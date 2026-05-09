import z from 'zod'
import { BeamNode } from './nodes/beam'
import { BuildingNode } from './nodes/building'
import { CeilingNode } from './nodes/ceiling'
import { DoorNode } from './nodes/door'
import { FeatureNode } from './nodes/feature'
import { FenceNode } from './nodes/fence'
import { GuideNode } from './nodes/guide'
import { ItemNode } from './nodes/item'
import { LevelNode } from './nodes/level'
import { LoftNode } from './nodes/loft'
import { ProceduralTowerNode } from './nodes/procedural-tower'
import { RoofNode } from './nodes/roof'
import { RoofSegmentNode } from './nodes/roof-segment'
import { ScanNode } from './nodes/scan'
import { SiteNode } from './nodes/site'
import { SketchCircleNode } from './nodes/sketch-circle'
import { SketchDimensionNode } from './nodes/sketch-dimension'
import { SketchLineNode } from './nodes/sketch-line'
import { SlabNode } from './nodes/slab'
import { StairNode } from './nodes/stair'
import { StairSegmentNode } from './nodes/stair-segment'
import { TerrainNode } from './nodes/terrain'
import { WallNode } from './nodes/wall'
import { WindowNode } from './nodes/window'
import { ZoneNode } from './nodes/zone'

export const AnyNode = z.discriminatedUnion('type', [
  SiteNode,
  BuildingNode,
  LevelNode,
  BeamNode,
  LoftNode,
  ProceduralTowerNode,
  FeatureNode,
  WallNode,
  FenceNode,
  ItemNode,
  ZoneNode,
  SlabNode,
  CeilingNode,
  RoofNode,
  RoofSegmentNode,
  StairNode,
  StairSegmentNode,
  TerrainNode,
  ScanNode,
  GuideNode,
  SketchDimensionNode,
  SketchCircleNode,
  SketchLineNode,
  WindowNode,
  DoorNode,
])

export type AnyNode = z.infer<typeof AnyNode>
export type AnyNodeType = AnyNode['type']
export type AnyNodeId = AnyNode['id']
