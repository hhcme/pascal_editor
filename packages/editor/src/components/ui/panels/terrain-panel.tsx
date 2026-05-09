'use client'

import { type AnyNode, type TerrainNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Mountain, RotateCcw } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { createTerrainMesh, type TerrainPreset } from '../../../lib/terrain-generation'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { InspectorStat, InspectorSummary } from '../controls/inspector-summary'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

function getTerrainStats(node: TerrainNode) {
  if (node.vertices.length === 0) {
    return {
      minY: 0,
      maxY: 0,
      range: 0,
      averageY: 0,
      width: 0,
      depth: 0,
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let totalY = 0

  for (const [x, y, z] of node.vertices) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
    totalY += y
  }

  return {
    minY,
    maxY,
    range: maxY - minY,
    averageY: totalY / node.vertices.length,
    width: maxX - minX,
    depth: maxZ - minZ,
  }
}

export function TerrainPanel() {
  const selectedId = useViewer((s) => s.selection.selectedIds[0])
  const setSelection = useViewer((s) => s.setSelection)
  const updateNode = useScene((s) => s.updateNode)
  const node = useScene((s) =>
    selectedId ? (s.nodes[selectedId as AnyNode['id']] as TerrainNode | undefined) : undefined,
  )

  const stats = useMemo(() => (node ? getTerrainStats(node) : null), [node])

  const handleUpdate = useCallback(
    (updates: Partial<TerrainNode>) => {
      if (!selectedId) return
      updateNode(selectedId as AnyNode['id'], updates)
    },
    [selectedId, updateNode],
  )

  const handleElevationOffsetChange = useCallback(
    (nextAverageY: number) => {
      if (!(node && stats)) return
      const delta = nextAverageY - stats.averageY
      handleUpdate({
        vertices: node.vertices.map(([x, y, z]) => [
          x,
          Number((y + delta).toFixed(3)),
          z,
        ]),
      })
    },
    [handleUpdate, node, stats],
  )

  const handleReliefScaleChange = useCallback(
    (nextRange: number) => {
      if (!(node && stats)) return
      const currentRange = Math.max(stats.range, 0.001)
      const scale = nextRange / currentRange
      handleUpdate({
        vertices: node.vertices.map(([x, y, z]) => [
          x,
          Number((stats.averageY + (y - stats.averageY) * scale).toFixed(3)),
          z,
        ]),
      })
    },
    [handleUpdate, node, stats],
  )

  const handleRegenerate = useCallback(
    (preset: TerrainPreset) => {
      if (!node) return
      handleUpdate(createTerrainMesh(node.boundary ?? [], preset))
    },
    [handleUpdate, node],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  if (!(node && node.type === 'terrain' && selectedId && stats)) return null

  return (
    <PanelWrapper
      icon={<Mountain className="h-4 w-4" />}
      onClose={handleClose}
      title={node.name || 'Terrain'}
      width={340}
    >
      <InspectorSummary>
        <InspectorStat label="Relief" value={`${stats.range.toFixed(2)} m`} />
        <InspectorStat label="Vertices" value={node.vertices.length} />
        <InspectorStat label="Faces" value={node.triangles.length} />
        <InspectorStat label="Footprint" value={`${stats.width.toFixed(1)} x ${stats.depth.toFixed(1)} m`} />
      </InspectorSummary>

      <PanelSection title="Elevation">
        <SliderControl
          label="Average"
          max={3}
          min={-3}
          onChange={handleElevationOffsetChange}
          precision={2}
          step={0.05}
          unit="m"
          value={Number(stats.averageY.toFixed(2))}
        />
        <SliderControl
          label="Relief"
          max={4}
          min={0}
          onChange={handleReliefScaleChange}
          precision={2}
          step={0.05}
          unit="m"
          value={Number(stats.range.toFixed(2))}
        />
      </PanelSection>

      <PanelSection title="Generate">
        <ActionGroup className="px-1 pb-1">
          <ActionButton label="Slope" onClick={() => handleRegenerate('gentle-slope')} />
          <ActionButton label="Hill" onClick={() => handleRegenerate('soft-hill')} />
        </ActionGroup>
        <div className="px-1 pb-1">
          <ActionButton
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            label="Flatten"
            onClick={() => handleRegenerate('flat')}
          />
        </div>
      </PanelSection>
    </PanelWrapper>
  )
}
