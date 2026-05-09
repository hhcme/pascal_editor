'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type ProceduralTowerNode,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useCallback } from 'react'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { Switch } from '../primitives/switch'
import { PanelWrapper } from './panel-wrapper'

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1.5">
      <span className="text-foreground text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function ProceduralTowerPanel() {
  const selectedId = useViewer((s) => s.selection.selectedIds[0])
  const selectedCount = useViewer((s) => s.selection.selectedIds.length)
  const setSelection = useViewer((s) => s.setSelection)
  const updateNode = useScene((s) => s.updateNode)
  const node = useScene((s) =>
    selectedId
      ? (s.nodes[selectedId as AnyNode['id']] as ProceduralTowerNode | undefined)
      : undefined,
  )

  const handleUpdate = useCallback(
    (updates: Partial<ProceduralTowerNode>) => {
      if (!selectedId) return
      updateNode(selectedId as AnyNode['id'], updates)
      useScene.getState().dirtyNodes.add(selectedId as AnyNodeId)
    },
    [selectedId, updateNode],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  if (!(node && node.type === 'procedural-tower' && selectedId && selectedCount === 1)) return null

  return (
    <PanelWrapper
      icon="/icons/building.png"
      onClose={handleClose}
      title={node.name || 'Procedural Tower'}
      width={340}
    >
      <PanelSection title="Height">
        <SliderControl
          label="Main Body"
          max={120}
          min={5}
          onChange={(value) => handleUpdate({ mainBodyHeight: value })}
          precision={1}
          step={0.5}
          unit="m"
          value={node.mainBodyHeight}
        />
        <SliderControl
          label="Antenna"
          max={60}
          min={0}
          onChange={(value) => handleUpdate({ antennaHeight: value })}
          precision={1}
          step={0.5}
          unit="m"
          value={node.antennaHeight}
        />
        <SliderControl
          label="Waist Elevation"
          max={Math.max(6, node.mainBodyHeight - 1)}
          min={1}
          onChange={(value) =>
            handleUpdate({
              waistY: Math.min(Math.max(1, value), Math.max(1, node.mainBodyHeight - 0.5)),
            })
          }
          precision={1}
          step={0.5}
          unit="m"
          value={Math.min(node.waistY, Math.max(1, node.mainBodyHeight - 0.5))}
        />
      </PanelSection>

      <PanelSection title="Shape">
        <SliderControl
          label="Base X"
          max={30}
          min={1}
          onChange={(value) => handleUpdate({ baseRadius: [value, node.baseRadius[1]] })}
          precision={1}
          step={0.1}
          unit="m"
          value={node.baseRadius[0]}
        />
        <SliderControl
          label="Base Z"
          max={30}
          min={1}
          onChange={(value) => handleUpdate({ baseRadius: [node.baseRadius[0], value] })}
          precision={1}
          step={0.1}
          unit="m"
          value={node.baseRadius[1]}
        />
        <SliderControl
          label="Waist X"
          max={30}
          min={0.5}
          onChange={(value) => handleUpdate({ waistRadius: [value, node.waistRadius[1]] })}
          precision={1}
          step={0.1}
          unit="m"
          value={node.waistRadius[0]}
        />
        <SliderControl
          label="Top X"
          max={30}
          min={1}
          onChange={(value) => handleUpdate({ topRadius: [value, node.topRadius[1]] })}
          precision={1}
          step={0.1}
          unit="m"
          value={node.topRadius[0]}
        />
        <SliderControl
          label="Twist"
          max={180}
          min={-180}
          onChange={(value) => handleUpdate({ twist: degreesToRadians(value) })}
          precision={0}
          step={5}
          unit="°"
          value={radiansToDegrees(node.twist)}
        />
      </PanelSection>

      <PanelSection title="Steel Frame">
        <SliderControl
          label="Columns"
          max={64}
          min={3}
          onChange={(value) => handleUpdate({ columnCount: Math.round(value) })}
          precision={0}
          step={1}
          value={node.columnCount}
        />
        <SliderControl
          label="Ring Count"
          max={64}
          min={0}
          onChange={(value) => handleUpdate({ ringCount: Math.round(value) })}
          precision={0}
          step={1}
          value={node.ringCount}
        />
        <SliderControl
          label="Column Radius"
          max={0.5}
          min={0.02}
          onChange={(value) => handleUpdate({ columnRadius: value })}
          precision={3}
          step={0.01}
          unit="m"
          value={node.columnRadius}
        />
        <SliderControl
          label="Ring Radius"
          max={0.3}
          min={0.01}
          onChange={(value) => handleUpdate({ ringRadius: value })}
          precision={3}
          step={0.005}
          unit="m"
          value={node.ringRadius}
        />
      </PanelSection>

      <PanelSection title="Visibility">
        <ToggleRow
          checked={node.showFacade}
          label="Facade"
          onChange={(checked) => handleUpdate({ showFacade: checked })}
        />
        <ToggleRow
          checked={node.showSteelFrame}
          label="Steel Frame"
          onChange={(checked) => handleUpdate({ showSteelFrame: checked })}
        />
        <ToggleRow
          checked={node.showRings}
          label="Ring Beams"
          onChange={(checked) => handleUpdate({ showRings: checked })}
        />
        <ToggleRow
          checked={node.showAntenna}
          label="Antenna"
          onChange={(checked) => handleUpdate({ showAntenna: checked })}
        />
      </PanelSection>
    </PanelWrapper>
  )
}
