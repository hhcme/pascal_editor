'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  MeasurementPrecision,
  PathMeasurementSummary,
  PerimeterGuide,
} from '../lib/measurement'

export type Vec3 = [number, number, number]

export type DistanceMode = 'free' | 'horizontal' | 'vertical' | 'path'

export type SegmentDistanceMeasurementRecord = {
  id: string
  createdAt: number
  mode: DistanceMode
  start: Vec3
  end: Vec3
}

export type PathDistanceMeasurementRecord = {
  id: string
  createdAt: number
  mode: 'path'
  points: Vec3[]
  length: number
  anchor: Vec3
  segmentCount: number
  approximate: boolean
}

export type DistanceMeasurementRecord =
  | SegmentDistanceMeasurementRecord
  | PathDistanceMeasurementRecord

export type NodePinnedMeasurementRecord = {
  id: string
  createdAt: number
  kind: 'area' | 'volume' | 'clearance' | 'bounds' | 'angle' | 'perimeter'
  nodeId: string
}

export type GridPinnedMeasurementRecord = {
  id: string
  createdAt: number
  kind: 'grid'
  nodeIds: string[]
}

export type PinnedMeasurementRecord = NodePinnedMeasurementRecord | GridPinnedMeasurementRecord

type MeasurementModeState = {
  draftStart: Vec3 | null
  draftStartSnapLabel: string | null
  previewPoint: Vec3 | null
  previewSnapLabel: string | null
  distanceMode: DistanceMode
  precision: MeasurementPrecision
  distanceRecords: DistanceMeasurementRecord[]
  pinnedRecords: PinnedMeasurementRecord[]
  screenshotExportNonce: number
  hoveredPerimeterGuideId: PerimeterGuide['id'] | null
  lockedPerimeterGuideId: PerimeterGuide['id'] | null
  perimeterVisibility: {
    span: boolean
    depth: boolean
    setbacks: boolean
    baselines: boolean
  }
  setDistanceMode: (mode: DistanceMode) => void
  setDraftStart: (point: Vec3 | null, snapLabel?: string | null) => void
  setPreviewPoint: (point: Vec3 | null, snapLabel?: string | null) => void
  addDistanceRecord: (mode: DistanceMode, start: Vec3, end: Vec3) => void
  addPathRecord: (summary: PathMeasurementSummary) => void
  clearDraft: () => void
  removeDistanceRecord: (id: string) => void
  clearDistanceRecords: () => void
  replaceStoredMeasurements: (
    distanceRecords: DistanceMeasurementRecord[],
    pinnedRecords: PinnedMeasurementRecord[],
  ) => void
  requestScreenshotExport: () => void
  setHoveredPerimeterGuideId: (id: PerimeterGuide['id'] | null) => void
  setLockedPerimeterGuideId: (id: PerimeterGuide['id'] | null) => void
  toggleLockedPerimeterGuideId: (id: PerimeterGuide['id']) => void
  setPerimeterVisibility: (key: 'span' | 'depth' | 'setbacks' | 'baselines', value: boolean) => void
  setPrecision: (precision: MeasurementPrecision) => void
  pinMeasurement: (
    kind: 'area' | 'volume' | 'clearance' | 'bounds' | 'angle' | 'perimeter',
    nodeId: string,
  ) => void
  pinGridMeasurement: (nodeIds: string[]) => void
  removePinnedMeasurement: (id: string) => void
  clearPinnedMeasurements: (
    kind?: 'area' | 'volume' | 'clearance' | 'bounds' | 'angle' | 'perimeter' | 'grid',
  ) => void
}

export const useMeasurementModeStore = create<MeasurementModeState>()(
  persist(
    (set) => ({
      draftStart: null,
      draftStartSnapLabel: null,
      previewPoint: null,
      previewSnapLabel: null,
      distanceMode: 'free',
      precision: 2,
      distanceRecords: [],
      pinnedRecords: [],
      screenshotExportNonce: 0,
      hoveredPerimeterGuideId: null,
      lockedPerimeterGuideId: null,
      perimeterVisibility: {
        span: true,
        depth: true,
        setbacks: true,
        baselines: true,
      },
      setDistanceMode: (mode) => set({ distanceMode: mode }),
      setDraftStart: (point, snapLabel = null) =>
        set({ draftStart: point, draftStartSnapLabel: snapLabel }),
      setPreviewPoint: (point, snapLabel = null) =>
        set({ previewPoint: point, previewSnapLabel: snapLabel }),
      addDistanceRecord: (mode, start, end) =>
        set((state) => {
          const createdAt = Date.now()
          return {
            draftStart: null,
            draftStartSnapLabel: null,
            previewPoint: end,
            previewSnapLabel: null,
            distanceRecords: [
              ...state.distanceRecords,
              {
                id: `distance:${createdAt}:${Math.random().toString(36).slice(2, 8)}`,
                createdAt,
                mode,
                start,
                end,
              },
            ],
          }
        }),
      addPathRecord: (summary) =>
        set((state) => {
          const createdAt = Date.now()
          return {
            distanceRecords: [
              ...state.distanceRecords,
              {
                id: `distance:path:${createdAt}:${Math.random().toString(36).slice(2, 8)}`,
                createdAt,
                mode: 'path',
                points: summary.points,
                length: summary.value,
                anchor: summary.anchor,
                segmentCount: summary.segmentCount,
                approximate: summary.approximate,
              },
            ],
          }
        }),
      clearDraft: () =>
        set({
          draftStart: null,
          draftStartSnapLabel: null,
          previewPoint: null,
          previewSnapLabel: null,
        }),
      removeDistanceRecord: (id) =>
        set((state) => ({
          distanceRecords: state.distanceRecords.filter((record) => record.id !== id),
        })),
      clearDistanceRecords: () => set({ distanceRecords: [] }),
      replaceStoredMeasurements: (distanceRecords, pinnedRecords) =>
        set({
          draftStart: null,
          draftStartSnapLabel: null,
          previewPoint: null,
          previewSnapLabel: null,
          distanceRecords,
          pinnedRecords,
        }),
      requestScreenshotExport: () =>
        set((state) => ({
          screenshotExportNonce: state.screenshotExportNonce + 1,
        })),
      setHoveredPerimeterGuideId: (id) => set({ hoveredPerimeterGuideId: id }),
      setLockedPerimeterGuideId: (id) => set({ lockedPerimeterGuideId: id }),
      toggleLockedPerimeterGuideId: (id) =>
        set((state) => ({
          lockedPerimeterGuideId: state.lockedPerimeterGuideId === id ? null : id,
        })),
      setPerimeterVisibility: (key, value) =>
        set((state) => ({
          perimeterVisibility: {
            ...state.perimeterVisibility,
            [key]: value,
          },
        })),
      setPrecision: (precision) => set({ precision }),
      pinMeasurement: (kind, nodeId) =>
        set((state) => {
          const existing = state.pinnedRecords.find(
            (record) => record.kind === kind && 'nodeId' in record && record.nodeId === nodeId,
          )
          if (existing) return state

          return {
            pinnedRecords: [
              ...state.pinnedRecords,
              {
                id: `${kind}:${nodeId}`,
                createdAt: Date.now(),
                kind,
                nodeId,
              },
            ],
          }
        }),
      pinGridMeasurement: (nodeIds) =>
        set((state) => {
          const normalizedIds = Array.from(new Set(nodeIds)).sort()
          if (normalizedIds.length < 2) return state

          const id = `grid:${normalizedIds.join('|')}`
          const existing = state.pinnedRecords.find(
            (record) =>
              record.kind === 'grid' &&
              record.nodeIds.length === normalizedIds.length &&
              record.nodeIds.every((nodeId, index) => nodeId === normalizedIds[index]),
          )
          if (existing) return state

          return {
            pinnedRecords: [
              ...state.pinnedRecords,
              {
                id,
                createdAt: Date.now(),
                kind: 'grid',
                nodeIds: normalizedIds,
              },
            ],
          }
        }),
      removePinnedMeasurement: (id) =>
        set((state) => ({
          pinnedRecords: state.pinnedRecords.filter((record) => record.id !== id),
        })),
      clearPinnedMeasurements: (kind) =>
        set((state) => ({
          pinnedRecords: kind ? state.pinnedRecords.filter((record) => record.kind !== kind) : [],
        })),
    }),
    {
      name: 'pascal-measurement-mode-settings',
      partialize: (state) => ({
        distanceMode: state.distanceMode,
        perimeterVisibility: state.perimeterVisibility,
        precision: state.precision,
      }),
    },
  ),
)

export function setMeasurementDistanceMode(mode: DistanceMode) {
  useMeasurementModeStore.getState().setDistanceMode(mode)
}
