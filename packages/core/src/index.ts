export type {
  BeamEvent,
  BuildingEvent,
  CameraControlEvent,
  CeilingEvent,
  DoorEvent,
  EventSuffix,
  FeatureEvent,
  FenceEvent,
  GridEvent,
  ItemEvent,
  LevelEvent,
  LoftEvent,
  NodeEvent,
  ProceduralTowerEvent,
  RoofEvent,
  RoofSegmentEvent,
  SiteEvent,
  SketchLineEvent,
  SlabEvent,
  StairEvent,
  StairSegmentEvent,
  TerrainEvent,
  WallEvent,
  WindowEvent,
  ZoneEvent,
} from './events/bus'
export { emitter, eventSuffixes } from './events/bus'
export {
  sceneRegistry,
  useRegistry,
} from './hooks/scene-registry/scene-registry'
export { pointInPolygon, spatialGridManager } from './hooks/spatial-grid/spatial-grid-manager'
export {
  initSpatialGridSync,
  resolveLevelId,
} from './hooks/spatial-grid/spatial-grid-sync'
export { useSpatialQuery } from './hooks/spatial-grid/use-spatial-query'
export { loadAssetUrl, saveAsset } from './lib/asset-storage'
export {
  detectSpacesForLevel,
  initSpaceDetectionSync,
  type Space,
  wallTouchesOthers,
} from './lib/space-detection'
export { baseMaterial, glassMaterial } from './materials'
export {
  getCatalogMaterialById,
  getLibraryMaterialIdFromRef,
  getMaterialPresetByRef,
  getMaterialsForTarget,
  LIBRARY_MATERIAL_REF_PREFIX,
  MATERIAL_CATALOG,
  MATERIAL_CATALOG_CATEGORY_OPTIONS,
  MATERIAL_CATALOG_COLOR_OPTIONS,
  MATERIAL_CATALOG_FINISH_OPTIONS,
  MATERIAL_CATALOG_SOURCE_OPTIONS,
  type MaterialCatalogCategory,
  type MaterialCatalogColorFamily,
  type MaterialCatalogFinish,
  type MaterialCatalogItem,
  type MaterialCatalogOption,
  type MaterialCatalogPreviewShape,
  type MaterialCatalogSource,
  toLibraryMaterialRef,
} from './material-library'
export * from './schema'
export {
  type ControlValue,
  type ItemInteractiveState,
  useInteractive,
} from './store/use-interactive'
export { default as useLiveTransforms, type LiveTransform } from './store/use-live-transforms'
export { FenceSystem } from './systems/fence/fence-system'
export { clearSceneHistory, default as useScene } from './store/use-scene'
export { CeilingSystem } from './systems/ceiling/ceiling-system'
export { DoorSystem } from './systems/door/door-system'
export {
  createCircularPatternStep,
  createDefaultChamferStep,
  createDefaultDraftStep,
  createDefaultFilletStep,
  createDefaultLoftStep,
  createDefaultShellStep,
  createDefaultSweepStep,
  createDefaultFeatureBody,
  createDerivedFeatureBody,
  createCombineStep,
  createFeatureDefinitionFromLegacyNode,
  createExtrudeCutStepFromProfile,
  createHoleStep,
  createLinearPatternStep,
  createMirrorStep,
  createReferenceAxis,
  createReferencePlane,
  createReferencePoint,
  deleteFeatureBody,
  diagnoseFeatureDefinition,
  ensureDefaultFeatureBody,
  moveFeatureStep,
  rebuildFeatureDefinition,
  getExtrudeCutSteps,
  getDraftSteps,
  getCombineSteps,
  getEdgeTreatmentSteps,
  getFeatureDefinition,
  getFeatureProfileCenter,
  getFeatureTimelineSteps,
  getHoleSteps,
  getLoftSteps,
  getMirrorSteps,
  getPatternSteps,
  getRenderableFeatureStep,
  getShellSteps,
  getSweepSteps,
  setFeatureBodyVisible,
  setPatternInstanceSkipped,
  updateCombineStepBodies,
  updateFeatureBodyTranslationX,
  type RenderableFeatureStep,
  type FeatureRebuildOptions,
} from './systems/feature/feature-definition'
export { ItemSystem } from './systems/item/item-system'
export { RoofSystem } from './systems/roof/roof-system'
export { SlabSystem } from './systems/slab/slab-system'
export { StairSystem } from './systems/stair/stair-system'
export {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  getWallPlanFootprint,
  getWallThickness,
} from './systems/wall/wall-footprint'
export {
  getClampedWallCurveOffset,
  getMaxWallCurveOffset,
  getWallChordFrame,
  getWallCurveFrameAt,
  getWallCurveLength,
  getWallMidpointHandlePoint,
  getWallStraightSnapOffset,
  getWallSurfacePolygon,
  isCurvedWall,
  normalizeWallCurveOffset,
  sampleWallCenterline,
} from './systems/wall/wall-curve'
export {
  calculateLevelMiters,
  getWallMiterBoundaryPoints,
  type Point2D,
  type WallMiterBoundaryPoints,
  pointToKey,
  type WallMiterData,
} from './systems/wall/wall-mitering'
export {
  getSketchCircleArcSweep,
  getSketchCircleBounds,
  getSketchCirclePathLength,
  getSketchCirclePointAt,
  isSketchCircleArc,
  isSketchCircleRadiusValid,
  sampleSketchCircleCenterline,
  type SketchCircleBounds,
} from './systems/sketch/sketch-circle-curve'
export {
  getClampedSketchLineCurveOffset,
  getMaxSketchLineCurveOffset,
  getSketchLineChordFrame,
  getSketchLineChordLength,
  getSketchLineCurveFrameAt,
  getSketchLineCurveLength,
  getSketchLineMidpointHandlePoint,
  getSketchLineStraightSnapOffset,
  isCurvedSketchLine,
  normalizeSketchLineCurveOffset,
  sampleSketchLineCenterline,
} from './systems/sketch/sketch-line-curve'
export { WallSystem } from './systems/wall/wall-system'
export { WindowSystem } from './systems/window/window-system'
export type { SceneGraph } from './utils/clone-scene-graph'
export { cloneLevelSubtree, cloneSceneGraph, forkSceneGraph } from './utils/clone-scene-graph'
export { isObject } from './utils/types'
