'use client'

import type { AnyNode, BaseNode, BuildingNode, LevelNode, ZoneNode } from '@pascal-app/core'
import type { Object3D } from 'three'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  clampSunMinutesOfDay,
  clampSunProgress,
  DEFAULT_SUN_STUDY_STATE,
  getDefaultSunStudyDate,
  getNearestSunTimeOfDay,
  getSunProgressForTimeOfDay,
  resolveSunMinutesOfDay,
  resolveSunProgress,
  resolveSunStudyDate,
  resolveSunStudyState,
  type SunStudyMode,
  type SunStudyState,
  type SunTimeOfDay,
} from '../lib/sun-study'
import {
  clampWeatherIntensity,
  clampWeatherParticleSize,
  clampWeatherWindSpeed,
  DEFAULT_WEATHER_STATE,
  normalizeWeatherWindDirection,
  resolveWeatherOption,
  resolveWeatherState,
  type WeatherMode,
  type WeatherState,
} from '../lib/weather'

type SelectionPath = {
  buildingId: BuildingNode['id'] | null
  levelId: LevelNode['id'] | null
  zoneId: ZoneNode['id'] | null
  selectedIds: BaseNode['id'][] // For items/assets (multi-select)
}

type Outliner = {
  selectedObjects: Object3D[]
  hoveredObjects: Object3D[]
}

type ProjectViewerPreferences = {
  showScans?: boolean
  showGuides?: boolean
  showGrid?: boolean
  sunStudy?: SunStudyState
}

export type CharacterMotion = 'idle' | 'walk' | 'run' | 'crouch' | 'jump'

export type CharacterPersonState = {
  id: string
  name: string
  enabled: boolean
  motion: CharacterMotion
  speed: number
  showBones: boolean
  position: [number, number, number]
  color: string
}

export type CharacterActorState = {
  enabled: boolean
  motion: CharacterMotion
  speed: number
  showBones: boolean
  position: [number, number, number]
  count: number
  people: CharacterPersonState[]
  selectedPersonId: string
}

export type SectionPlaneAxis = 'x' | 'y' | 'z'

export type SectionPlaneState = {
  enabled: boolean
  axis: SectionPlaneAxis
  position: number
  inverted: boolean
}

const DEFAULT_SECTION_PLANE_STATE: SectionPlaneState = {
  enabled: false,
  axis: 'y',
  position: 1.5,
  inverted: false,
}

const DEFAULT_CHARACTER_ACTOR_STATE: CharacterActorState = {
  enabled: false,
  motion: 'idle',
  speed: 1,
  showBones: true,
  position: [0, 0, 0],
  count: 1,
  people: [
    {
      id: 'character-1',
      name: '角色 1',
      enabled: true,
      motion: 'idle',
      speed: 1,
      showBones: true,
      position: [0, 0, 0],
      color: '#4c6fff',
    },
  ],
  selectedPersonId: 'character-1',
}

export type ExportSceneRequest =
  | 'glb'
  | 'stl'
  | 'obj'
  | {
      format?: 'glb' | 'stl' | 'obj'
      filename?: string
      directoryPath?: string
    }

type ViewerState = {
  selection: SelectionPath
  previewSelectedIds: BaseNode['id'][]
  setPreviewSelectedIds: (ids: BaseNode['id'][]) => void
  hoverHighlightMode: 'default' | 'delete'
  setHoverHighlightMode: (mode: 'default' | 'delete') => void
  hoveredId: AnyNode['id'] | ZoneNode['id'] | null
  setHoveredId: (id: AnyNode['id'] | ZoneNode['id'] | null) => void
  placementHoveredIds: AnyNode['id'][]
  setPlacementHoveredIds: (ids: AnyNode['id'][]) => void

  cameraMode: 'perspective' | 'orthographic'
  setCameraMode: (mode: 'perspective' | 'orthographic') => void

  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void

  unit: 'metric' | 'imperial'
  setUnit: (unit: 'metric' | 'imperial') => void

  levelMode: 'stacked' | 'exploded' | 'solo' | 'manual'
  setLevelMode: (mode: 'stacked' | 'exploded' | 'solo' | 'manual') => void

  wallMode: 'up' | 'cutaway' | 'down'
  setWallMode: (mode: 'up' | 'cutaway' | 'down') => void

  sectionPlane: SectionPlaneState
  setSectionPlane: (updates: Partial<SectionPlaneState>) => void
  resetSectionPlane: () => void

  showScans: boolean
  setShowScans: (show: boolean) => void

  showGuides: boolean
  setShowGuides: (show: boolean) => void

  showGrid: boolean
  setShowGrid: (show: boolean) => void

  showCompass: boolean
  setShowCompass: (show: boolean) => void

  sunStudy: SunStudyState
  setSunStudy: (updates: Partial<SunStudyState>) => void
  setSunStudyEnabled: (enabled: boolean) => void
  setSunStudyMode: (mode: SunStudyMode) => void
  setSunTimeOfDay: (timeOfDay: SunTimeOfDay) => void
  setSunProgress: (progress: number) => void
  setSunStudyDate: (date: string) => void
  setSunMinutesOfDay: (minutesOfDay: number) => void

  weather: WeatherState
  setWeatherMode: (mode: WeatherMode) => void
  setWeatherIntensity: (intensity: number) => void
  setWeatherParticleSize: (size: number) => void
  setWeatherWindDirection: (directionDeg: number) => void
  setWeatherWindSpeed: (speed: number) => void
  setWeatherSoundEnabled: (enabled: boolean) => void

  characterActor: CharacterActorState
  setCharacterActor: (updates: Partial<CharacterActorState>) => void

  projectId: string | null
  setProjectId: (id: string | null) => void
  projectPreferences: Record<string, ProjectViewerPreferences>

  // Smart selection update
  setSelection: (updates: Partial<SelectionPath>) => void
  resetSelection: () => void

  outliner: Outliner // No setter as we will manipulate directly the arrays

  // Export functionality
  exportScene: ((request?: ExportSceneRequest) => Promise<string | null>) | null
  setExportScene: (fn: ((request?: ExportSceneRequest) => Promise<string | null>) | null) => void

  debugColors: boolean
  setDebugColors: (enabled: boolean) => void

  walkthroughMode: boolean
  setWalkthroughMode: (mode: boolean) => void

  cameraDragging: boolean
  setCameraDragging: (dragging: boolean) => void
}

function updateProjectPreferences(
  projectPreferences: Record<string, ProjectViewerPreferences>,
  projectId: string | null,
  updates: Partial<ProjectViewerPreferences>,
) {
  if (!projectId) return projectPreferences

  return {
    ...projectPreferences,
    [projectId]: {
      ...(projectPreferences[projectId] || {}),
      ...updates,
    },
  }
}

function finalizeSunStudyState(sunStudy: Partial<SunStudyState> | SunStudyState | null | undefined) {
  const normalized = resolveSunStudyState(sunStudy)

  if (normalized.mode !== 'real') return normalized

  return {
    ...normalized,
    date: normalized.date ?? getDefaultSunStudyDate(),
    minutesOfDay: resolveSunMinutesOfDay(normalized.minutesOfDay),
  }
}

function withProjectSunStudy(
  state: Pick<ViewerState, 'projectId' | 'projectPreferences'>,
  sunStudy: SunStudyState,
) {
  return {
    sunStudy,
    projectPreferences: updateProjectPreferences(state.projectPreferences, state.projectId, {
      sunStudy,
    }),
  }
}

const CHARACTER_COLORS = ['#4c6fff', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6']

function createCharacterPerson(index: number, position: [number, number, number]): CharacterPersonState {
  return {
    id: `character-${index + 1}`,
    name: `角色 ${index + 1}`,
    enabled: true,
    motion: 'idle',
    speed: 1,
    showBones: true,
    position: [position[0] + index * 0.55, position[1], position[2]],
    color: CHARACTER_COLORS[index % CHARACTER_COLORS.length] ?? '#4c6fff',
  }
}

function normalizeCharacterActorState(
  current: CharacterActorState,
  updates: Partial<CharacterActorState>,
): CharacterActorState {
  const selectedPersonId = updates.selectedPersonId ?? current.selectedPersonId
  const requestedCount = Math.max(1, Math.min(24, Math.round(updates.count ?? current.count ?? 1)))
  const basePosition = updates.position ?? current.position ?? [0, 0, 0]
  let people = [...(updates.people ?? current.people ?? [])]

  if (people.length === 0) {
    people = [createCharacterPerson(0, basePosition)]
  }

  while (people.length < requestedCount) {
    people.push(createCharacterPerson(people.length, basePosition))
  }
  people = people.slice(0, requestedCount)

  const resolvedSelectedId = people.some((person) => person.id === selectedPersonId)
    ? selectedPersonId
    : people[0]?.id ?? 'character-1'

  const selectedUpdates: Partial<CharacterPersonState> = {}
  if (updates.enabled !== undefined) selectedUpdates.enabled = updates.enabled
  if (updates.motion !== undefined) selectedUpdates.motion = updates.motion
  if (updates.speed !== undefined) selectedUpdates.speed = updates.speed
  if (updates.showBones !== undefined) selectedUpdates.showBones = updates.showBones
  if (updates.position !== undefined) selectedUpdates.position = updates.position

  people = people.map((person) =>
    person.id === resolvedSelectedId
      ? {
          ...person,
          ...selectedUpdates,
        }
      : person,
  )

  const selectedPerson = people.find((person) => person.id === resolvedSelectedId) ?? people[0]!

  return {
    ...current,
    ...updates,
    count: requestedCount,
    enabled: updates.enabled ?? current.enabled,
    motion: selectedPerson.motion,
    speed: selectedPerson.speed,
    showBones: selectedPerson.showBones,
    position: selectedPerson.position,
    people,
    selectedPersonId: resolvedSelectedId,
  }
}

const useViewer = create<ViewerState>()(
  persist(
    (set) => ({
      selection: { buildingId: null, levelId: null, zoneId: null, selectedIds: [] },
      previewSelectedIds: [],
      setPreviewSelectedIds: (ids) => set({ previewSelectedIds: ids }),
      hoverHighlightMode: 'default',
      setHoverHighlightMode: (mode) => set({ hoverHighlightMode: mode }),
      hoveredId: null,
      setHoveredId: (id) => set({ hoveredId: id }),
      placementHoveredIds: [],
      setPlacementHoveredIds: (ids) => set({ placementHoveredIds: ids }),

      cameraMode: 'perspective',
      setCameraMode: (mode) => set({ cameraMode: mode }),

      theme: 'light',
      setTheme: (theme) => set({ theme }),

      unit: 'metric',
      setUnit: (unit) => set({ unit }),

      levelMode: 'stacked',
      setLevelMode: (mode) => set({ levelMode: mode }),

      wallMode: 'up',
      setWallMode: (mode) => set({ wallMode: mode }),

      sectionPlane: DEFAULT_SECTION_PLANE_STATE,
      setSectionPlane: (updates) =>
        set((state) => ({
          sectionPlane: {
            ...state.sectionPlane,
            ...updates,
          },
        })),
      resetSectionPlane: () => set({ sectionPlane: DEFAULT_SECTION_PLANE_STATE }),

      showScans: true,
      setShowScans: (show) =>
        set((state) => {
          const projectPreferences = updateProjectPreferences(
            state.projectPreferences,
            state.projectId,
            { showScans: show },
          )
          return { showScans: show, projectPreferences }
        }),

      showGuides: true,
      setShowGuides: (show) =>
        set((state) => {
          const projectPreferences = updateProjectPreferences(
            state.projectPreferences,
            state.projectId,
            { showGuides: show },
          )
          return { showGuides: show, projectPreferences }
        }),

      showGrid: true,
      setShowGrid: (show) =>
        set((state) => {
          const projectPreferences = updateProjectPreferences(
            state.projectPreferences,
            state.projectId,
            { showGrid: show },
          )
          return { showGrid: show, projectPreferences }
        }),

      showCompass: true,
      setShowCompass: (show) => set({ showCompass: show }),

      sunStudy: DEFAULT_SUN_STUDY_STATE,
      setSunStudy: (updates) =>
        set((state) =>
          withProjectSunStudy(
            state,
            finalizeSunStudyState({
              ...state.sunStudy,
              ...updates,
              progress: resolveSunProgress(
                updates.timeOfDay ?? state.sunStudy.timeOfDay,
                updates.progress ?? state.sunStudy.progress,
              ),
            }),
          ),
        ),
      setSunStudyEnabled: (enabled) =>
        set((state) =>
          withProjectSunStudy(
            state,
            finalizeSunStudyState({
              ...state.sunStudy,
              enabled,
              progress: resolveSunProgress(state.sunStudy.timeOfDay, state.sunStudy.progress),
            }),
          ),
        ),
      setSunStudyMode: (mode) =>
        set((state) =>
          withProjectSunStudy(
            state,
            finalizeSunStudyState({
              ...state.sunStudy,
              enabled: true,
              mode,
              date:
                mode === 'real'
                  ? resolveSunStudyDate(state.sunStudy.date) ?? getDefaultSunStudyDate()
                  : state.sunStudy.date,
              minutesOfDay: resolveSunMinutesOfDay(state.sunStudy.minutesOfDay),
            }),
          ),
        ),
      setSunTimeOfDay: (timeOfDay) =>
        set((state) =>
          withProjectSunStudy(
            state,
            finalizeSunStudyState({
              ...state.sunStudy,
              enabled: true,
              mode: 'preset',
              timeOfDay,
              progress: getSunProgressForTimeOfDay(timeOfDay),
            }),
          ),
        ),
      setSunProgress: (progress) =>
        set((state) => {
          const sunProgress = clampSunProgress(progress)

          return withProjectSunStudy(state, finalizeSunStudyState({
            ...state.sunStudy,
            enabled: true,
            mode: 'preset',
            progress: sunProgress,
            timeOfDay: getNearestSunTimeOfDay(sunProgress),
          }))
        }),
      setSunStudyDate: (date) =>
        set((state) =>
          withProjectSunStudy(
            state,
            finalizeSunStudyState({
              ...state.sunStudy,
              enabled: true,
              mode: 'real',
              date: resolveSunStudyDate(date) ?? getDefaultSunStudyDate(),
            }),
          ),
        ),
      setSunMinutesOfDay: (minutesOfDay) =>
        set((state) =>
          withProjectSunStudy(
            state,
            finalizeSunStudyState({
              ...state.sunStudy,
              enabled: true,
              mode: 'real',
              date: resolveSunStudyDate(state.sunStudy.date) ?? getDefaultSunStudyDate(),
              minutesOfDay: clampSunMinutesOfDay(minutesOfDay),
            }),
          ),
        ),

      weather: DEFAULT_WEATHER_STATE,
      setWeatherMode: (mode) =>
        set((state) => {
          const option = resolveWeatherOption(mode)
          const weather = resolveWeatherState(state.weather)

          return {
            weather: {
              ...weather,
              mode: option.id,
              intensity: option.id === 'clear' ? 0 : option.intensity,
            },
          }
        }),
      setWeatherIntensity: (intensity) =>
        set((state) => ({
          weather: {
            ...resolveWeatherState(state.weather),
            intensity: clampWeatherIntensity(intensity),
          },
        })),
      setWeatherParticleSize: (size) =>
        set((state) => ({
          weather: {
            ...resolveWeatherState(state.weather),
            particleSize: clampWeatherParticleSize(size),
          },
        })),
      setWeatherWindDirection: (directionDeg) =>
        set((state) => ({
          weather: {
            ...resolveWeatherState(state.weather),
            windDirectionDeg: normalizeWeatherWindDirection(directionDeg),
          },
        })),
      setWeatherWindSpeed: (speed) =>
        set((state) => ({
          weather: {
            ...resolveWeatherState(state.weather),
            windSpeed: clampWeatherWindSpeed(speed),
          },
        })),
      setWeatherSoundEnabled: (enabled) =>
        set((state) => ({
          weather: {
            ...resolveWeatherState(state.weather),
            soundEnabled: enabled,
          },
        })),

      characterActor: DEFAULT_CHARACTER_ACTOR_STATE,
      setCharacterActor: (updates) =>
        set((state) => ({
          characterActor: normalizeCharacterActorState(state.characterActor, updates),
        })),

      projectId: null,
      setProjectId: (id) =>
        set((state) => {
          if (!id) return { projectId: id }
          const prefs = state.projectPreferences?.[id] || {}
          return {
            projectId: id,
            showScans: prefs.showScans ?? true,
            showGuides: prefs.showGuides ?? true,
            showGrid: prefs.showGrid ?? true,
            sunStudy: finalizeSunStudyState(prefs.sunStudy ?? DEFAULT_SUN_STUDY_STATE),
          }
        }),
      projectPreferences: {},

      setSelection: (updates) =>
        set((state) => {
          const newSelection = { ...state.selection, ...updates }

          // Hierarchy Guard: If we change a high-level parent, reset the children unless explicitly provided
          if (updates.buildingId !== undefined) {
            if (updates.levelId === undefined) newSelection.levelId = null
            if (updates.zoneId === undefined) newSelection.zoneId = null
            if (updates.selectedIds === undefined) newSelection.selectedIds = []
          }
          if (updates.levelId !== undefined) {
            if (updates.zoneId === undefined) newSelection.zoneId = null
            if (updates.selectedIds === undefined) newSelection.selectedIds = []
          }
          if (updates.zoneId !== undefined) {
            if (updates.selectedIds === undefined) newSelection.selectedIds = []
          }

          return { selection: newSelection, previewSelectedIds: [] }
        }),

      resetSelection: () =>
        set({
          selection: {
            buildingId: null,
            levelId: null,
            zoneId: null,
            selectedIds: [],
          },
          previewSelectedIds: [],
        }),

      outliner: { selectedObjects: [], hoveredObjects: [] },

      exportScene: null,
      setExportScene: (fn) => set({ exportScene: fn }),

      debugColors: false,
      setDebugColors: (enabled) => set({ debugColors: enabled }),

      walkthroughMode: false,
      setWalkthroughMode: (mode) => set({ walkthroughMode: mode }),

      cameraDragging: false,
      setCameraDragging: (dragging) => set({ cameraDragging: dragging }),
    }),
    {
      name: 'viewer-preferences',
      partialize: (state) => ({
        cameraMode: state.cameraMode,
        theme: state.theme,
        unit: state.unit,
        levelMode: state.levelMode,
        wallMode: state.wallMode,
        sectionPlane: state.sectionPlane,
        projectPreferences: state.projectPreferences,
        showCompass: state.showCompass,
        sunStudy: state.sunStudy,
        weather: state.weather,
        characterActor: state.characterActor,
      }),
    },
  ),
)

export default useViewer
