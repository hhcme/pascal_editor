export type { EditorProps } from './components/editor'
export { default as Editor } from './components/editor'
export { useCommandPalette } from './components/ui/command-palette'
export { SliderControl } from './components/ui/controls/slider-control'
export { FloatingLevelSelector } from './components/ui/floating-level-selector'
export { CATALOG_ITEMS } from './components/ui/item-catalog/catalog-items'
export { useSidebarStore } from './components/ui/primitives/sidebar'
export { Slider } from './components/ui/primitives/slider'
export { SceneLoader } from './components/ui/scene-loader'
export type { ExtraPanel } from './components/ui/sidebar/icon-rail'
export {
  type ProjectVisibility,
  SettingsPanel,
  type SettingsPanelProps,
} from './components/ui/sidebar/panels/settings-panel'
export {
  FurnishPanel,
  type FurnishPanelAiTab,
  type FurnishPanelProps,
} from './components/ui/sidebar/panels/furnish-panel'
export type { SitePanelProps } from './components/ui/sidebar/panels/site-panel'
export type { SidebarTab } from './components/ui/sidebar/tab-bar'
export { ViewerToolbarLeft, ViewerToolbarRight } from './components/ui/viewer-toolbar'
export type { PresetsAdapter, PresetsTab } from './contexts/presets-context'
export { PresetsProvider } from './contexts/presets-context'
export type { SaveStatus } from './hooks/use-auto-save'
export {
  type GridSummary,
  getGridMeasurementSummaryForSelection,
  type MeasurementUnit,
} from './lib/measurement'
export {
  getSavedGridMeasurementGroups,
  type SavedGridMeasurementGroup,
} from './lib/measurement-persistence'
export type { SceneGraph } from './lib/scene'
export { applySceneGraphToEditor } from './lib/scene'
export type {
  AiAccessibilitySnapshot,
  AiAnalysisIssue,
  AiAnalysisSnapshot,
  AiBuildingSnapshot,
  AiCirculationSnapshot,
  AiDaylightTag,
  AiHouseholdBrief,
  AiHouseholdOccupant,
  AiItemSnapshot,
  AiLevelSnapshot,
  AiOpeningSnapshot,
  AiOperationActivity,
  AiOperationsSnapshot,
  AiRoomSnapshot,
  AiSiteSnapshot,
  CreateAiAnalysisSnapshotInput,
} from './lib/ai-analysis/snapshot-types'
export {
  createAiAnalysisIssue,
  createAiAnalysisSnapshot,
  appendAiAnalysisIssues,
} from './lib/ai-analysis/snapshot-builder'
export type {
  MetricValueMap,
  NodeMeasurementFacts,
} from './lib/ai-analysis/measurement-adapter'
export {
  buildNodeMeasurementFacts,
  getMeasurementMetricValue,
  getMeasurementValueByKind,
  getMetricValue,
  indexMetricValueMap,
} from './lib/ai-analysis/measurement-adapter'
export type {
  AiAnalysisIssueCategory,
  AiAnalysisIssueCode,
  AiAnalysisIssueCodeDefinition,
  AiAnalysisIssueScope,
  AiAnalysisIssueSeverity,
} from './lib/ai-analysis/issue-codes'
export {
  AI_ANALYSIS_CONSTRAINT_CODES,
  AI_ANALYSIS_ISSUE_CODES,
  AI_ANALYSIS_ISSUE_CODE_DEFINITIONS,
  AI_ANALYSIS_NEGATIVE_PATTERN_CODES,
  getAiAnalysisIssueDefinition,
  isAiAnalysisIssueCode,
} from './lib/ai-analysis/issue-codes'
export { triggerSFX } from './lib/sfx-bus'
export {
  getSiteSetbackRules,
  type SiteSetbackRuleKey,
  type SiteSetbackRules,
  withSiteSetbackRule,
} from './lib/site-measurement-rules'
export { default as useAudio } from './store/use-audio'
export { type CommandAction, useCommandRegistry } from './store/use-command-registry'
export type {
  FloorplanSelectionTool,
  MeasurementMode,
  SplitOrientation,
  ViewMode,
} from './store/use-editor'
export { default as useEditor } from './store/use-editor'
export {
  type PaletteView,
  type PaletteViewProps,
  usePaletteViewRegistry,
} from './store/use-palette-view-registry'
export { useUploadStore } from './store/use-upload'
