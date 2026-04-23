'use client'

import {
  type AnyNode,
  type Control,
  type ControlValue,
  getScaledDimensions,
  type Interactive,
  ItemNode,
  useInteractive,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Copy, Link, Link2Off, Move, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { cn } from '../../../lib/utils'
import useEditor from '../../../store/use-editor'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { InspectorStat, InspectorSummary } from '../controls/inspector-summary'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { ToggleControl } from '../controls/toggle-control'
import { CollectionsPopover } from './collections/collections-popover'
import { PanelWrapper } from './panel-wrapper'

function hasLightEffect(interactive: Interactive | undefined): boolean {
  return Boolean(interactive?.effects.some((effect) => effect.kind === 'light'))
}

function getDefaultControlValue(control: Control): ControlValue {
  if (control.kind === 'toggle') return control.default ?? false
  if (control.kind === 'slider') return control.default ?? control.min
  return control.default ?? control.min
}

function normalizeControlValue(control: Control, value: ControlValue | undefined): ControlValue {
  if (control.kind === 'toggle') {
    return typeof value === 'boolean' ? value : getDefaultControlValue(control)
  }
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : getDefaultControlValue(control)
}

function resolveControlLabel(control: Control): string {
  if (control.label) return control.label
  return control.kind === 'toggle' ? 'Power' : 'Value'
}

function getNormalizedControlValues(
  interactive: Interactive,
  values: ControlValue[] | undefined,
): ControlValue[] {
  return interactive.controls.map((control, index) =>
    normalizeControlValue(control, values?.[index]),
  )
}

export function ItemPanel() {
  const selectedId = useViewer((s) => s.selection.selectedIds[0])
  const setSelection = useViewer((s) => s.setSelection)
  const updateNode = useScene((s) => s.updateNode)
  const deleteNode = useScene((s) => s.deleteNode)
  const setMovingNode = useEditor((s) => s.setMovingNode)

  const node = useScene((s) =>
    selectedId ? (s.nodes[selectedId as AnyNode['id']] as ItemNode | undefined) : undefined,
  )
  const interactive = node?.asset.interactive
  const isLightItem = hasLightEffect(interactive)
  const controlValues = useInteractive((state) =>
    selectedId ? state.items[selectedId as AnyNode['id']]?.controlValues : undefined,
  )

  const [uniformScale, setUniformScale] = useState(true)

  useEffect(() => {
    if (!(selectedId && interactive)) return
    useInteractive
      .getState()
      .initItem(selectedId as AnyNode['id'], interactive, node?.interactiveValues)
  }, [interactive, node?.interactiveValues, selectedId])

  const handleUpdate = useCallback(
    (updates: Partial<ItemNode>) => {
      if (!(selectedId && node)) return
      updateNode(selectedId as AnyNode['id'], updates)

      if (node.asset.attachTo === 'wall' && node.parentId) {
        requestAnimationFrame(() => {
          useScene.getState().dirtyNodes.add(node.parentId as AnyNode['id'])
        })
      }
    },
    [selectedId, node, updateNode],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleMove = useCallback(() => {
    if (node) {
      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(node)
      setSelection({ selectedIds: [] })
    }
  }, [node, setMovingNode, setSelection])

  const handleDuplicate = useCallback(() => {
    if (!node) return
    sfxEmitter.emit('sfx:item-pick')
    const proto = ItemNode.parse({
      position: [...node.position] as [number, number, number],
      rotation: [...node.rotation] as [number, number, number],
      name: node.name,
      asset: node.asset,
      parentId: node.parentId,
      side: node.side,
      interactiveValues: node.interactiveValues,
      metadata: { isNew: true },
    })
    setMovingNode(proto)
    setSelection({ selectedIds: [] })
  }, [node, setMovingNode, setSelection])

  const handleInteractiveChange = useCallback(
    (index: number, value: ControlValue) => {
      if (!(selectedId && node?.asset.interactive)) return
      const currentValues = getNormalizedControlValues(
        node.asset.interactive,
        controlValues ?? node.interactiveValues,
      )
      const control = node.asset.interactive.controls[index]
      if (!control) return

      const nextValues = [...currentValues]
      nextValues[index] = normalizeControlValue(control, value)

      useInteractive
        .getState()
        .initItem(selectedId as AnyNode['id'], node.asset.interactive, currentValues)
      useInteractive
        .getState()
        .setControlValue(selectedId as AnyNode['id'], index, nextValues[index])
      updateNode(selectedId as AnyNode['id'], { interactiveValues: nextValues })
    },
    [controlValues, node, selectedId, updateNode],
  )

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    sfxEmitter.emit('sfx:item-delete')
    deleteNode(selectedId as AnyNode['id'])
    setSelection({ selectedIds: [] })
  }, [selectedId, deleteNode, setSelection])

  if (!(node && node.type === 'item' && selectedId)) return null
  const [itemWidth, itemHeight, itemDepth] = getScaledDimensions(node)

  return (
    <PanelWrapper
      icon={node.asset.thumbnail || '/icons/furniture.png'}
      onClose={handleClose}
      title={node.name || node.asset.name}
      width={340}
    >
      <InspectorSummary>
        <InspectorStat label="Width" value={`${itemWidth.toFixed(2)} m`} />
        <InspectorStat label="Height" value={`${itemHeight.toFixed(2)} m`} />
        <InspectorStat label="Depth" value={`${itemDepth.toFixed(2)} m`} />
        <InspectorStat label="Attach" value={node.asset.attachTo ?? 'free'} />
      </InspectorSummary>

      {isLightItem && interactive && (
        <PanelSection title="Light">
          {interactive.controls.map((control, index) => {
            const value = normalizeControlValue(
              control,
              controlValues?.[index] ?? node.interactiveValues?.[index],
            )

            if (control.kind === 'toggle') {
              return (
                <ToggleControl
                  checked={Boolean(value)}
                  key={index}
                  label={resolveControlLabel(control)}
                  onChange={(checked) => handleInteractiveChange(index, checked)}
                />
              )
            }

            const step = control.kind === 'slider' ? control.step : 1
            const precision = step < 1 ? 2 : 0

            return (
              <SliderControl
                key={index}
                label={resolveControlLabel(control)}
                max={control.max}
                min={control.min}
                onChange={(nextValue) => handleInteractiveChange(index, nextValue)}
                precision={precision}
                step={step}
                unit={control.unit}
                value={typeof value === 'number' ? value : Number(getDefaultControlValue(control))}
              />
            )
          })}
        </PanelSection>
      )}

      <PanelSection title="Position">
        <SliderControl
          label={
            <>
              X<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={node.position[0] + 2}
          min={node.position[0] - 2}
          onChange={(value) =>
            handleUpdate({ position: [value, node.position[1], node.position[2]] })
          }
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.position[0] * 100) / 100}
        />
        <SliderControl
          label={
            <>
              Y<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={node.position[1] + 2}
          min={node.position[1] - 2}
          onChange={(value) =>
            handleUpdate({ position: [node.position[0], value, node.position[2]] })
          }
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.position[1] * 100) / 100}
        />
        <SliderControl
          label={
            <>
              Z<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={node.position[2] + 2}
          min={node.position[2] - 2}
          onChange={(value) =>
            handleUpdate({ position: [node.position[0], node.position[1], value] })
          }
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.position[2] * 100) / 100}
        />
      </PanelSection>

      <PanelSection title="Rotation">
        <SliderControl
          label={
            <>
              Y<sub className="ml-[1px] text-[11px] opacity-70">rot</sub>
            </>
          }
          max={Math.round((node.rotation[1] * 180) / Math.PI) + 45}
          min={Math.round((node.rotation[1] * 180) / Math.PI) - 45}
          onChange={(degrees) => {
            const radians = (degrees * Math.PI) / 180
            handleUpdate({ rotation: [node.rotation[0], radians, node.rotation[2]] })
          }}
          precision={0}
          step={1}
          unit="°"
          value={Math.round((node.rotation[1] * 180) / Math.PI)}
        />
        <div className="flex gap-1.5 px-1 pt-2 pb-1">
          <ActionButton
            label="-45°"
            onClick={() => {
              sfxEmitter.emit('sfx:item-rotate')
              const currentDegrees = (node.rotation[1] * 180) / Math.PI
              const radians = ((currentDegrees - 45) * Math.PI) / 180
              handleUpdate({ rotation: [node.rotation[0], radians, node.rotation[2]] })
            }}
          />
          <ActionButton
            label="+45°"
            onClick={() => {
              sfxEmitter.emit('sfx:item-rotate')
              const currentDegrees = (node.rotation[1] * 180) / Math.PI
              const radians = ((currentDegrees + 45) * Math.PI) / 180
              handleUpdate({ rotation: [node.rotation[0], radians, node.rotation[2]] })
            }}
          />
        </div>
      </PanelSection>

      <PanelSection title="Scale">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="font-semibold text-[11px] text-muted-foreground">
            Uniform Scale
          </span>
          <button
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground',
              uniformScale ? 'bg-accent' : 'bg-background hover:bg-accent/70',
            )}
            onClick={() => setUniformScale((v) => !v)}
            type="button"
          >
            {uniformScale ? <Link className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
          </button>
        </div>

        {uniformScale ? (
          <SliderControl
            label={
              <>
                XYZ<sub className="ml-[1px] text-[11px] opacity-70">scale</sub>
              </>
            }
            max={10}
            min={0.01}
            onChange={(value) => {
              const v = Math.max(0.01, value)
              handleUpdate({ scale: [v, v, v] })
            }}
            precision={2}
            step={0.1}
            value={Math.round(node.scale[0] * 100) / 100}
          />
        ) : (
          <>
            <SliderControl
              label={
                <>
                  X<sub className="ml-[1px] text-[11px] opacity-70">scale</sub>
                </>
              }
              max={10}
              min={0.01}
              onChange={(value) =>
                handleUpdate({ scale: [Math.max(0.01, value), node.scale[1], node.scale[2]] })
              }
              precision={2}
              step={0.1}
              value={Math.round(node.scale[0] * 100) / 100}
            />
            <SliderControl
              label={
                <>
                  Y<sub className="ml-[1px] text-[11px] opacity-70">scale</sub>
                </>
              }
              max={10}
              min={0.01}
              onChange={(value) =>
                handleUpdate({ scale: [node.scale[0], Math.max(0.01, value), node.scale[2]] })
              }
              precision={2}
              step={0.1}
              value={Math.round(node.scale[1] * 100) / 100}
            />
            <SliderControl
              label={
                <>
                  Z<sub className="ml-[1px] text-[11px] opacity-70">scale</sub>
                </>
              }
              max={10}
              min={0.01}
              onChange={(value) =>
                handleUpdate({ scale: [node.scale[0], node.scale[1], Math.max(0.01, value)] })
              }
              precision={2}
              step={0.1}
              value={Math.round(node.scale[2] * 100) / 100}
            />
          </>
        )}
      </PanelSection>

      <PanelSection title="Info">
        <div className="flex items-center justify-between px-2 py-1 text-muted-foreground text-sm">
          <span>Dimensions</span>
          <span className="font-mono text-foreground">
            {Math.round(itemWidth * 100) / 100}×{Math.round(itemHeight * 100) / 100}×
            {Math.round(itemDepth * 100) / 100}
          </span>
        </div>
      </PanelSection>

      <PanelSection title="Collections">
        <ActionGroup>
          <CollectionsPopover
            collectionIds={node.collectionIds}
            nodeId={selectedId as AnyNode['id']}
          >
            <ActionButton label="Manage collections…" />
          </CollectionsPopover>
        </ActionGroup>
      </PanelSection>

      <PanelSection title="Actions">
        <ActionGroup>
          <ActionButton icon={<Move className="h-3.5 w-3.5" />} label="Move" onClick={handleMove} />
          <ActionButton
            icon={<Copy className="h-3.5 w-3.5" />}
            label="Duplicate"
            onClick={handleDuplicate}
          />
          <ActionButton
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Delete"
            onClick={handleDelete}
            tone="danger"
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
