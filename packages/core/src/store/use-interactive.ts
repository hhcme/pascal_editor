'use client'

import { create } from 'zustand'
import type { Interactive } from '../schema/nodes/item'
import type { AnyNodeId } from '../schema/types'

// Runtime value for each control (matches discriminated union kinds)
export type ControlValue = boolean | number

export type ItemInteractiveState = {
  // Indexed by control position in asset.interactive.controls[]
  controlValues: ControlValue[]
}

type InteractiveStore = {
  items: Record<AnyNodeId, ItemInteractiveState>

  /** Initialize a node's interactive state from its asset definition (idempotent) */
  initItem: (itemId: AnyNodeId, interactive: Interactive, initialValues?: ControlValue[]) => void

  /** Set a single control value */
  setControlValue: (itemId: AnyNodeId, index: number, value: ControlValue) => void

  /** Remove a node's state (e.g. on unmount) */
  removeItem: (itemId: AnyNodeId) => void
}

const defaultControlValue = (interactive: Interactive, index: number): ControlValue => {
  const control = interactive.controls[index]
  if (!control) return false
  switch (control.kind) {
    case 'toggle':
      return control.default ?? false
    case 'slider':
      return control.default ?? control.min
    case 'temperature':
      return control.default ?? control.min
  }
}

const normalizeControlValue = (
  interactive: Interactive,
  index: number,
  value: ControlValue | undefined,
): ControlValue => {
  const control = interactive.controls[index]
  if (!control) return false
  if (control.kind === 'toggle') {
    return typeof value === 'boolean' ? value : defaultControlValue(interactive, index)
  }
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : defaultControlValue(interactive, index)
}

export const useInteractive = create<InteractiveStore>((set, get) => ({
  items: {},

  initItem: (itemId, interactive, initialValues) => {
    const { controls } = interactive
    if (controls.length === 0) return

    // Don't overwrite existing state (idempotent)
    if (get().items[itemId]) return

    set((state) => ({
      items: {
        ...state.items,
        [itemId]: {
          controlValues: controls.map((_, i) =>
            normalizeControlValue(interactive, i, initialValues?.[i]),
          ),
        },
      },
    }))
  },

  setControlValue: (itemId, index, value) => {
    set((state) => {
      const item = state.items[itemId]
      if (!item) return state
      const next = [...item.controlValues]
      next[index] = value
      return { items: { ...state.items, [itemId]: { controlValues: next } } }
    })
  },

  removeItem: (itemId) => {
    set((state) => {
      const { [itemId]: _, ...rest } = state.items
      return { items: rest }
    })
  },
}))
