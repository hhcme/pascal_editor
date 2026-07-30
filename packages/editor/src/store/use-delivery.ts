'use client'

import type { AnyNodeId, GuideNode } from '@pascal-app/core'
import { create } from 'zustand'

type WallNodeId = Extract<AnyNodeId, `wall_${string}`>

export type DeliveryOverlayOptions = {
  showPerimeterGuides: boolean
  showRoomArea: boolean
  showRoomName: boolean
  showWallLength: boolean
}

export type GuideCalibrationDraft = {
  guideId: GuideNode['id']
  points: Array<[number, number]>
}

export type GuideDetectionWallCandidate = {
  id: string
  end: [number, number]
  start: [number, number]
  thickness: number
}

export type GuideDetectionOpeningCandidate = {
  center: [number, number]
  height: number
  id: string
  kind: 'door' | 'window'
  wallCandidateId: string
  width: number
  yOffset: number
}

export type GuideDetectionCandidates = {
  appliedWallIds?: Record<string, WallNodeId>
  generatedAt: number
  guideId: GuideNode['id']
  selectedOpeningIds?: string[]
  selectedWallIds?: string[]
  openings: GuideDetectionOpeningCandidate[]
  walls: GuideDetectionWallCandidate[]
}

const DEFAULT_OVERLAYS: DeliveryOverlayOptions = {
  showRoomName: true,
  showRoomArea: false,
  showWallLength: true,
  showPerimeterGuides: true,
}

type DeliveryState = {
  calibrationDraft: GuideCalibrationDraft | null
  calibrationPromptGuideId: GuideNode['id'] | null
  detectionRegionDraftGuideId: GuideNode['id'] | null
  lockPromptGuideId: GuideNode['id'] | null
  detectionCandidates: GuideDetectionCandidates | null
  hoveredDetectionCandidateId: string | null
  overlays: DeliveryOverlayOptions
  clearCalibrationDraft: () => void
  clearCalibrationPrompt: () => void
  clearDetectionRegionDraft: () => void
  clearLockPrompt: () => void
  clearDetectionCandidates: () => void
  pushCalibrationPoint: (guideId: GuideNode['id'], point: [number, number]) => void
  requestCalibrationPrompt: (guideId: GuideNode['id']) => void
  requestLockPrompt: (guideId: GuideNode['id']) => void
  setDetectionCandidates: (candidates: GuideDetectionCandidates | null) => void
  setDetectionOpeningKind: (openingId: string, kind: GuideDetectionOpeningCandidate['kind']) => void
  setDetectionOpeningSelected: (openingId: string, selected: boolean) => void
  setDetectionWallSelected: (wallId: string, selected: boolean) => void
  setHoveredDetectionCandidateId: (candidateId: string | null) => void
  setAllDetectionCandidatesSelected: (selected: boolean) => void
  setOverlays: (overlays: Partial<DeliveryOverlayOptions>) => void
  startDetectionRegionDraft: (guideId: GuideNode['id']) => void
  startCalibrationDraft: (guideId: GuideNode['id']) => void
}

function normalizeDetectionCandidates(
  detectionCandidates: GuideDetectionCandidates | null,
): GuideDetectionCandidates | null {
  if (!detectionCandidates) {
    return null
  }

  return {
    ...detectionCandidates,
    selectedWallIds:
      detectionCandidates.selectedWallIds ?? detectionCandidates.walls.map((wall) => wall.id),
    selectedOpeningIds:
      detectionCandidates.selectedOpeningIds ??
      detectionCandidates.openings.map((opening) => opening.id),
  }
}

export const useDeliveryStore = create<DeliveryState>()((set) => ({
  overlays: DEFAULT_OVERLAYS,
  calibrationDraft: null,
  calibrationPromptGuideId: null,
  detectionRegionDraftGuideId: null,
  lockPromptGuideId: null,
  detectionCandidates: null,
  hoveredDetectionCandidateId: null,
  setOverlays: (overlays) =>
    set((state) => ({
      overlays: {
        ...state.overlays,
        ...overlays,
      },
    })),
  startCalibrationDraft: (guideId) =>
    set({
      calibrationPromptGuideId: null,
      detectionRegionDraftGuideId: null,
      lockPromptGuideId: null,
      calibrationDraft: {
        guideId,
        points: [],
      },
    }),
  startDetectionRegionDraft: (guideId) =>
    set({
      calibrationDraft: null,
      detectionRegionDraftGuideId: guideId,
    }),
  pushCalibrationPoint: (guideId, point) =>
    set((state) => {
      if (state.calibrationDraft?.guideId !== guideId) {
        return {
          calibrationDraft: {
            guideId,
            points: [point],
          },
        }
      }

      return {
        calibrationDraft: {
          guideId,
          points: [...state.calibrationDraft.points.slice(-1), point],
        },
      }
    }),
  clearCalibrationDraft: () => set({ calibrationDraft: null }),
  requestCalibrationPrompt: (guideId) => set({ calibrationPromptGuideId: guideId }),
  clearCalibrationPrompt: () => set({ calibrationPromptGuideId: null }),
  clearDetectionRegionDraft: () => set({ detectionRegionDraftGuideId: null }),
  requestLockPrompt: (guideId) =>
    set({
      calibrationPromptGuideId: null,
      lockPromptGuideId: guideId,
    }),
  clearLockPrompt: () => set({ lockPromptGuideId: null }),
  setDetectionCandidates: (detectionCandidates) =>
    set({
      detectionCandidates: normalizeDetectionCandidates(detectionCandidates),
      hoveredDetectionCandidateId: null,
    }),
  setDetectionWallSelected: (wallId, selected) =>
    set((state) => {
      if (!state.detectionCandidates) {
        return state
      }

      const selectedWallIds = new Set(
        state.detectionCandidates.selectedWallIds ??
          state.detectionCandidates.walls.map((wall) => wall.id),
      )
      if (selected) {
        selectedWallIds.add(wallId)
      } else {
        selectedWallIds.delete(wallId)
      }

      const selectedOpeningIds = new Set(
        state.detectionCandidates.selectedOpeningIds ??
          state.detectionCandidates.openings.map((opening) => opening.id),
      )
      if (!selected) {
        for (const opening of state.detectionCandidates.openings) {
          if (opening.wallCandidateId === wallId) {
            selectedOpeningIds.delete(opening.id)
          }
        }
      }

      return {
        detectionCandidates: {
          ...state.detectionCandidates,
          selectedWallIds: [...selectedWallIds],
          selectedOpeningIds: [...selectedOpeningIds],
        },
      }
    }),
  setDetectionOpeningSelected: (openingId, selected) =>
    set((state) => {
      if (!state.detectionCandidates) {
        return state
      }

      const selectedOpeningIds = new Set(
        state.detectionCandidates.selectedOpeningIds ??
          state.detectionCandidates.openings.map((opening) => opening.id),
      )
      const opening = state.detectionCandidates.openings.find((entry) => entry.id === openingId)
      const selectedWallIds = new Set(
        state.detectionCandidates.selectedWallIds ??
          state.detectionCandidates.walls.map((wall) => wall.id),
      )

      if (selected) {
        selectedOpeningIds.add(openingId)
        if (opening) {
          selectedWallIds.add(opening.wallCandidateId)
        }
      } else {
        selectedOpeningIds.delete(openingId)
      }

      return {
        detectionCandidates: {
          ...state.detectionCandidates,
          selectedWallIds: [...selectedWallIds],
          selectedOpeningIds: [...selectedOpeningIds],
        },
      }
    }),
  setDetectionOpeningKind: (openingId, kind) =>
    set((state) => {
      if (!state.detectionCandidates) {
        return state
      }

      return {
        detectionCandidates: {
          ...state.detectionCandidates,
          openings: state.detectionCandidates.openings.map((opening) =>
            opening.id === openingId
              ? {
                  ...opening,
                  kind,
                  height: kind === 'door' ? 2.1 : 1.5,
                  yOffset: kind === 'door' ? 1.05 : 1.45,
                }
              : opening,
          ),
        },
      }
    }),
  setAllDetectionCandidatesSelected: (selected) =>
    set((state) => {
      if (!state.detectionCandidates) {
        return state
      }

      return {
        detectionCandidates: {
          ...state.detectionCandidates,
          selectedWallIds: selected ? state.detectionCandidates.walls.map((wall) => wall.id) : [],
          selectedOpeningIds: selected
            ? state.detectionCandidates.openings.map((opening) => opening.id)
            : [],
        },
      }
    }),
  setHoveredDetectionCandidateId: (hoveredDetectionCandidateId) =>
    set({ hoveredDetectionCandidateId }),
  clearDetectionCandidates: () =>
    set({ detectionCandidates: null, hoveredDetectionCandidateId: null }),
}))
