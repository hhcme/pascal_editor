'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../../../store/use-editor'
import { CeilingPanel } from './ceiling-panel'
import { DoorPanel } from './door-panel'
import { FeaturePanel } from './feature-panel'
import { FencePanel } from './fence-panel'
import { ItemPanel } from './item-panel'
import { ProceduralTowerPanel } from './procedural-tower-panel'
import { ReferencePanel } from './reference-panel'
import { RoofPanel } from './roof-panel'
import { RoofSegmentPanel } from './roof-segment-panel'
import { SketchCirclePanel } from './sketch-circle-panel'
import { SketchDimensionPanel } from './sketch-dimension-panel'
import { SketchLinePanel } from './sketch-line-panel'
import { SlabPanel } from './slab-panel'
import { StairPanel } from './stair-panel'
import { StairSegmentPanel } from './stair-segment-panel'
import { TerrainPanel } from './terrain-panel'
import { WallPanel } from './wall-panel'
import { WindowPanel } from './window-panel'

type InspectorPanelType =
  | 'reference'
  | 'item'
  | 'procedural-tower'
  | 'roof'
  | 'roof-segment'
  | 'stair'
  | 'stair-segment'
  | 'terrain'
  | 'slab'
  | 'sketch-circle'
  | 'sketch-dimension'
  | 'sketch-line'
  | 'ceiling'
  | 'feature'
  | 'wall'
  | 'fence'
  | 'door'
  | 'window'

function isInspectorPanelType(nodeType: string | null): nodeType is InspectorPanelType {
  switch (nodeType) {
    case 'item':
    case 'procedural-tower':
    case 'roof':
    case 'roof-segment':
    case 'stair':
    case 'stair-segment':
    case 'terrain':
    case 'slab':
    case 'sketch-circle':
    case 'sketch-dimension':
    case 'sketch-line':
    case 'ceiling':
    case 'feature':
    case 'wall':
    case 'fence':
    case 'door':
    case 'window':
      return true
    default:
      return false
  }
}

export function useInspectorPanelType(): InspectorPanelType | null {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const selectedReferenceId = useEditor((s) => s.selectedReferenceId)
  const revolveAxisPick = useEditor((s) => s.revolveAxisPick)
  // Only subscribe to the *type* of the single-selected node — string primitive
  // so we don't re-render on unrelated scene mutations.
  const selectedNodeType = useScene((s) => {
    if (selectedIds.length !== 1) return null
    const id = selectedIds[0]
    return id ? (s.nodes[id as AnyNodeId]?.type ?? null) : null
  })
  const pickedFeatureExists = useScene((s) => {
    if (!revolveAxisPick) return false
    return s.nodes[revolveAxisPick.featureId]?.type === 'feature'
  })

  if (selectedReferenceId) return 'reference'
  if (pickedFeatureExists) return 'feature'
  if (isInspectorPanelType(selectedNodeType)) return selectedNodeType
  return null
}

export function PanelManager() {
  const panelType = useInspectorPanelType()

  // Show appropriate panel based on selected node type
  if (panelType) {
    switch (panelType) {
      case 'reference':
        return <ReferencePanel />
      case 'item':
        return <ItemPanel />
      case 'procedural-tower':
        return <ProceduralTowerPanel />
      case 'roof':
        return <RoofPanel />
      case 'roof-segment':
        return <RoofSegmentPanel />
      case 'stair':
        return <StairPanel />
      case 'stair-segment':
        return <StairSegmentPanel />
      case 'terrain':
        return <TerrainPanel />
      case 'slab':
        return <SlabPanel />
      case 'sketch-circle':
        return <SketchCirclePanel />
      case 'sketch-dimension':
        return <SketchDimensionPanel />
      case 'sketch-line':
        return <SketchLinePanel />
      case 'ceiling':
        return <CeilingPanel />
      case 'feature':
        return <FeaturePanel />
      case 'wall':
        return <WallPanel />
      case 'fence':
        return <FencePanel />
      case 'door':
        return <DoorPanel />
      case 'window':
        return <WindowPanel />
    }
  }

  return null
}
