'use client'

import { Icon } from '@iconify/react'
import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  type CeilingNode,
  CeilingNode as CeilingNodeSchema,
  calculateLevelMiters,
  DoorNode,
  emitter,
  type FeatureNode,
  type FenceNode,
  type GridEvent,
  type GuideNode,
  getScaledDimensions,
  getWallChordFrame,
  getWallCurveLength,
  getWallMidpointHandlePoint,
  getWallPlanFootprint,
  type ItemNode,
  ItemNode as ItemNodeSchema,
  isCurvedWall,
  type LevelNode,
  loadAssetUrl,
  normalizeWallCurveOffset,
  type Point2D,
  type SiteNode,
  type SketchCircleNode,
  type SketchDimensionNode,
  type SketchLineNode,
  SlabNode,
  type StairNode,
  StairNode as StairNodeSchema,
  type StairSegmentNode,
  StairSegmentNode as StairSegmentNodeSchema,
  sampleSketchCircleCenterline,
  useLiveTransforms,
  useScene,
  type WallNode,
  WindowNode,
  ZoneNode as ZoneNodeSchema,
  type ZoneNode as ZoneNodeType,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Command } from 'lucide-react'
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { type EditorLanguage, useEditorLanguage } from '../../hooks/use-editor-language'
import { markToolCancelConsumed } from '../../hooks/use-keyboard'
import { getGuideCalibrationDisplayPoints } from '../../lib/guide-calibration'
import { getPerimeterGuidesForNode, type PerimeterGuide } from '../../lib/measurement'
import { sfxEmitter } from '../../lib/sfx-bus'
import { cn } from '../../lib/utils'
import { isZoneLabelHidden } from '../../lib/zone-label-visibility'
import { type GuideDetectionCandidates, useDeliveryStore } from '../../store/use-delivery'
import useEditor, {
  type FloorplanSelectionTool,
  isSketchStructureTool,
  type SketchPlane,
} from '../../store/use-editor'
import {
  createFenceOnCurrentLevel,
  type FencePlanPoint,
  snapFenceDraftPoint,
} from '../tools/fence/fence-drafting'
import { snapToHalf } from '../tools/item/placement-math'
import { buildRemoveSketchCircleConstraintReferencesPlan } from '../tools/sketch/sketch-circle-constraints'
import { collectSketchDistanceDimensionIdsReferencingEntities } from '../tools/sketch/sketch-distance-dimensions'
import { detectClosedSketchProfiles, isSketchLineLongEnough } from '../tools/sketch/sketch-geometry'
import { buildRemoveSketchLineConstraintReferencesPlan } from '../tools/sketch/sketch-line-constraints'
import { buildRemoveSketchLineTangentReferencesPlan } from '../tools/sketch/sketch-line-tangent'
import {
  DEFAULT_STAIR_ATTACHMENT_SIDE,
  DEFAULT_STAIR_FILL_TO_FLOOR,
  DEFAULT_STAIR_HEIGHT,
  DEFAULT_STAIR_LENGTH,
  DEFAULT_STAIR_STEP_COUNT,
  DEFAULT_STAIR_THICKNESS,
  DEFAULT_STAIR_WIDTH,
} from '../tools/stair/stair-defaults'
import {
  createWallOnCurrentLevel,
  isWallLongEnough,
  snapWallDraftPoint,
  WALL_GRID_STEP,
  type WallPlanPoint,
} from '../tools/wall/wall-drafting'
import {
  applyWallEditResult,
  buildChamferWallsPlan,
  buildEqualLengthWallsPlan,
  buildFilletWallsPlan,
  buildLinearPatternWallsPlan,
  buildMergeWallsPlan,
  buildMirrorWallsPlan,
  buildOffsetWallPlan,
  buildOrientWallPlan,
  buildSetWallLengthPlan,
  buildSplitWallPlan,
  buildTrimExtendWallPlan,
  detectClosedWallLoops,
  getDefaultWallChamferDistance,
  getDefaultWallEditRadius,
  getDefaultWallLinearPatternCount,
  getDefaultWallLinearPatternSpacing,
  getDefaultWallOffsetDistance,
  getWallFilletPreview,
  getWallLength2D,
  getWallOffsetPreview,
  getWallPointAtDistance,
  getWallPreviewSegmentsFromResult,
  type WallEditOperation,
  type WallEditPreviewSegment,
  type WallEditResult,
  type WallFilletPreview,
  type WallOffsetPreview,
} from '../tools/wall/wall-edit-geometry'
import {
  getPointAtWallSketchLength,
  getWallSketchDirection,
  parseWallSketchLengthInput,
  resolveWallSketchSnap,
  type WallSketchInputState,
  type WallSketchSnapPoint,
  type WallSketchSnapResult,
} from '../tools/wall/wall-sketch'
import { furnishTools } from '../ui/action-menu/furnish-tools'
import { tools as structureTools } from '../ui/action-menu/structure-tools'
import { Button } from '../ui/primitives/button'
import { PALETTE_COLORS } from '../ui/primitives/color-dot'
import { ContextMenu, ContextMenuTrigger } from '../ui/primitives/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/primitives/dialog'
import { Input } from '../ui/primitives/input'
import {
  getDistanceToWallSegment,
  toPoint2D,
  toWallPlanPoint,
} from './floorplan/floorplan-geometry'
import {
  type FloorplanSketchCircleEntry,
  getSketchContextHitAtPoint as resolveSketchContextHitAtPoint,
} from './floorplan/floorplan-sketch-context'
import { useFloorplanSketchContextActions } from './floorplan/floorplan-sketch-context-actions'
import {
  FloorplanActionMenuLayer,
  FloorplanSketchContextMenuContent,
  type FloorplanSketchContextTarget,
  type SketchContextTool,
} from './floorplan/floorplan-sketch-menus'
import {
  type FloorplanSketchLineEntry,
  useFloorplanSketchActions,
} from './floorplan/sketch-actions'
import { FloorplanSketchCommandBar, type SketchPlaneRecord } from './floorplan/sketch-command-bar'
import { useFloorplanSketchEdit } from './floorplan/sketch-edit'
import {
  FloorplanSketchCircleLayer,
  FloorplanSketchDistanceDimensionLayer,
  FloorplanSketchEditLayer,
  FloorplanSketchLayer,
  FloorplanSketchProfileLayer,
} from './floorplan/sketch-layer'
import { useFloorplanSketchState } from './floorplan/sketch-state'
import type { NodeActionMenuExtraAction } from './node-action-menu'

const FALLBACK_VIEW_SIZE = 12
const FLOORPLAN_PADDING = 2
const MIN_VIEWPORT_WIDTH_RATIO = 0.08
const MAX_VIEWPORT_WIDTH_RATIO = 40
const PANEL_MIN_WIDTH = 420
const PANEL_MIN_HEIGHT = 320
const PANEL_DEFAULT_WIDTH = 560
const PANEL_DEFAULT_HEIGHT = 360
const PANEL_MARGIN = 16
const PANEL_DEFAULT_BOTTOM_OFFSET = 96
const MIN_GRID_SCREEN_SPACING = 12
const GRID_COORDINATE_PRECISION = 6
const MAJOR_GRID_STEP = WALL_GRID_STEP * 2
const FLOORPLAN_WALL_THICKNESS_SCALE = 1.18
const FLOORPLAN_MIN_VISIBLE_WALL_THICKNESS = 0.13
const FLOORPLAN_MAX_EXTRA_THICKNESS = 0.035
const FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY = 'pascal-editor-floorplan-panel-layout'
const EMPTY_WALL_MITER_DATA = calculateLevelMiters([])
const EDITOR_CURSOR = "url('/cursor.svg') 4 2, default"
const FLOORPLAN_CURSOR_INDICATOR_LINE_HEIGHT = 18
const FLOORPLAN_CURSOR_BADGE_OFFSET_X = 14
const FLOORPLAN_CURSOR_BADGE_OFFSET_Y = 14
const FLOORPLAN_CURSOR_MARKER_CORE_SCREEN_RADIUS = 3.5
const FLOORPLAN_CURSOR_MARKER_GLOW_SCREEN_RADIUS = 10
const FLOORPLAN_MARQUEE_OUTLINE_WIDTH = 0.055
const FLOORPLAN_MARQUEE_GLOW_WIDTH = 0.14
const FLOORPLAN_HOVER_TRANSITION = 'opacity 180ms cubic-bezier(0.2, 0, 0, 1)'
const FLOORPLAN_WALL_HIT_STROKE_WIDTH = 18
const FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH = 18
const FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH = 8
const FLOORPLAN_OPENING_HIT_STROKE_WIDTH = 16
const FLOORPLAN_OPENING_STROKE_WIDTH = 0.05
const FLOORPLAN_OPENING_DETAIL_STROKE_WIDTH = 0.02
const FLOORPLAN_OPENING_DASHED_STROKE_WIDTH = 0.02
const FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH = 18
const FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH = 16
const FLOORPLAN_ENDPOINT_HOVER_RING_STROKE_WIDTH = 7
const FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX = 4
const FLOORPLAN_MEASUREMENT_OFFSET = 0.46
const FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT = 0.08
const FLOORPLAN_MEASUREMENT_LINE_WIDTH = 1.2
const FLOORPLAN_MEASUREMENT_LINE_OUTLINE_WIDTH = 2.8
const FLOORPLAN_MEASUREMENT_LINE_OPACITY = 0.72
const FLOORPLAN_MEASUREMENT_LINE_OUTLINE_OPACITY = 0.9
const FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE = 0.15
const FLOORPLAN_MEASUREMENT_LABEL_OPACITY = 0.82
const FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH = 0.05
const FLOORPLAN_MEASUREMENT_LABEL_GAP = 0.56
const FLOORPLAN_MEASUREMENT_LABEL_LINE_PADDING = 0.14
const FLOORPLAN_WALL_SKETCH_LABEL_FONT_SIZE = 0.15
const FLOORPLAN_WALL_SKETCH_LABEL_PADDING_X = 0.16
const FLOORPLAN_WALL_SKETCH_LABEL_PADDING_Y = 0.08
const FLOORPLAN_WALL_SKETCH_TARGET_RADIUS = 0.11
const FLOORPLAN_SKETCH_LINE_SELECTED_STROKE_WIDTH = 2.2
const FLOORPLAN_SKETCH_CONSTRUCTION_LINE_SELECTED_STROKE_WIDTH = 1.8
const FLOORPLAN_WALL_EDIT_FEEDBACK_TIMEOUT_MS = 1800
const FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING = 60
const FLOORPLAN_ACTION_MENU_MIN_ANCHOR_Y = 56
const FLOORPLAN_ACTION_MENU_OFFSET_Y = 10
const FLOORPLAN_DEFAULT_WINDOW_LOCAL_Y = 1.5

// Match the guide plane footprint used in the 3D renderer so the 2D overlay aligns.
const FLOORPLAN_GUIDE_BASE_WIDTH = 10
const FLOORPLAN_GUIDE_MIN_SCALE = 0.01
const FLOORPLAN_GUIDE_HANDLE_SIZE = 0.22
const FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS = 0.3
const FLOORPLAN_GUIDE_SELECTION_STROKE_WIDTH = 0.05
const FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET = 72
const FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X = 92
const FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y = 48
const FLOORPLAN_GUIDE_ROTATION_SNAP_DEGREES = 45
const FLOORPLAN_GUIDE_ROTATION_FINE_SNAP_DEGREES = 1
const FLOORPLAN_SITE_COLOR = 'var(--editor-floorplan-site)'
const FLOORPLAN_NODE_FOOTPRINT_STROKE_WIDTH = FLOORPLAN_OPENING_STROKE_WIDTH / 2
const FLOORPLAN_NODE_FOOTPRINT_CROSS_STROKE_WIDTH = FLOORPLAN_NODE_FOOTPRINT_STROKE_WIDTH * 0.7
const FLOORPLAN_STAIR_OUTLINE_BAND_THICKNESS = FLOORPLAN_OPENING_STROKE_WIDTH
const FLOORPLAN_STAIR_OUTLINE_MAX_FRACTION = 0.18
const FLOORPLAN_STAIR_TREAD_BAND_THICKNESS = FLOORPLAN_OPENING_STROKE_WIDTH * 0.82
const FLOORPLAN_STAIR_TREAD_MIN_THICKNESS = FLOORPLAN_OPENING_DETAIL_STROKE_WIDTH * 1.5
const FLOORPLAN_STAIR_ARROW_BAND_THICKNESS = FLOORPLAN_STAIR_TREAD_BAND_THICKNESS
const FLOORPLAN_STAIR_ARROW_HEAD_MIN_SIZE = 0.14
const FLOORPLAN_STAIR_ARROW_HEAD_MAX_SIZE = 0.24
type FloorplanViewport = {
  centerX: number
  centerY: number
  width: number
}

type SvgPoint = {
  x: number
  y: number
}

type PanState = {
  pointerId: number
  clientX: number
  clientY: number
}

type GestureLikeEvent = Event & {
  clientX?: number
  clientY?: number
  scale?: number
}

type PanelRect = {
  x: number
  y: number
  width: number
  height: number
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

type PanelInteractionState = {
  pointerId: number
  startClientX: number
  startClientY: number
  initialRect: PanelRect
  type: 'drag' | 'resize'
  direction?: ResizeDirection
}

type ViewportBounds = {
  width: number
  height: number
}

type OpeningNode = WindowNode | DoorNode

type WallEndpoint = 'start' | 'end'

type FloorplanCursorIndicator =
  | {
      kind: 'asset'
      iconSrc: string
    }
  | {
      kind: 'icon'
      icon: string
    }

type PersistedPanelLayout = {
  rect: PanelRect
  viewport: ViewportBounds
}

type FloorplanSelectionBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type FloorplanMarqueeState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startPlanPoint: WallPlanPoint
  currentPlanPoint: WallPlanPoint
}

type WallEndpointDragState = {
  pointerId: number
  wallId: WallNode['id']
  endpoint: WallEndpoint
  fixedPoint: WallPlanPoint
  currentPoint: WallPlanPoint
}

type WallCurveDragState = {
  pointerId: number
  wallId: WallNode['id']
  currentCurveOffset: number
}

const GUIDE_CORNERS = ['nw', 'ne', 'se', 'sw'] as const

type GuideCorner = (typeof GUIDE_CORNERS)[number]

type GuideInteractionMode = 'resize' | 'rotate' | 'translate'

type GuideTransformDraft = {
  guideId: GuideNode['id']
  position: WallPlanPoint
  scale: number
  rotation: number
}

type GuideDetectionRegionDraft = {
  guideId: GuideNode['id']
  start: WallPlanPoint
  end: WallPlanPoint
}

type GuideDetectionRegionInteractionState = {
  pointerId: number
  guideId: GuideNode['id']
  dimensions: GuideImageDimensions
  start: WallPlanPoint
  current: WallPlanPoint
}

type GuideHandleHintAnchor = {
  x: number
  y: number
  directionX: number
  directionY: number
}

type GuideInteractionState = {
  pointerId: number
  guideId: GuideNode['id']
  corner: GuideCorner
  mode: GuideInteractionMode
  aspectRatio: number
  centerSvg: SvgPoint
  oppositeCornerSvg: SvgPoint | null
  pointerOffsetSvg: WallPlanPoint
  rotationSvg: number
  cornerBaseAngle: number
  scale: number
}

type WallEndpointDraft = {
  wallId: WallNode['id']
  endpoint: WallEndpoint
  start: WallPlanPoint
  end: WallPlanPoint
}

type WallCurveDraft = {
  wallId: WallNode['id']
  curveOffset: number
}

type WallEditFeedback = {
  id: number
  message: string
}

type WallEditNumericInputState = {
  operation: Extract<
    WallEditOperation,
    'split' | 'offset' | 'fillet' | 'linear-pattern' | 'chamfer' | 'set-length'
  >
  value: string
  wallId?: WallNode['id']
  wallIds?: WallNode['id'][]
  referenceWallId?: WallNode['id']
}

type FloorplanNumericInputState = {
  label?: string
  unitLabel: string
  value: string
}

type SlabBoundaryDraft = {
  slabId: SlabNode['id']
  polygon: WallPlanPoint[]
}

type SlabVertexDragState = {
  pointerId: number
  slabId: SlabNode['id']
  vertexIndex: number
}

type CeilingBoundaryDraft = {
  ceilingId: CeilingNode['id']
  holes: WallPlanPoint[][]
  polygon: WallPlanPoint[]
}

type CeilingVertexDragState = {
  pointerId: number
  ceilingId: CeilingNode['id']
  vertexIndex: number
}

type FenceDraftState = {
  start: FencePlanPoint
  end: FencePlanPoint
}

type SiteBoundaryDraft = {
  siteId: SiteNode['id']
  polygon: WallPlanPoint[]
}

type SiteVertexDragState = {
  pointerId: number
  siteId: SiteNode['id']
  vertexIndex: number
}

type ZoneBoundaryDraft = {
  zoneId: ZoneNodeType['id']
  polygon: WallPlanPoint[]
}

type ZoneVertexDragState = {
  pointerId: number
  zoneId: ZoneNodeType['id']
  vertexIndex: number
}

type WallPolygonEntry = {
  wall: WallNode
  polygon: Point2D[]
  points: string
}

type OpeningPolygonEntry = {
  opening: OpeningNode
  polygon: Point2D[]
  points: string
}

type SlabPolygonEntry = {
  slab: SlabNode
  polygon: Point2D[]
  holes: Point2D[][]
  path: string
}

type CeilingPolygonEntry = {
  ceiling: CeilingNode
  polygon: Point2D[]
  holes: Point2D[][]
  path: string
}

type FencePolygonEntry = {
  fence: FenceNode
  polygon: Point2D[]
  points: string
}

type SitePolygonEntry = {
  site: SiteNode
  polygon: Point2D[]
  points: string
}

type ZonePolygonEntry = {
  zone: ZoneNodeType
  polygon: Point2D[]
  points: string
}

type FloorplanNodeTransform = {
  position: Point2D
  rotation: number
}

type FloorplanLineSegment = {
  start: Point2D
  end: Point2D
}

type FloorplanPolygonEntry = {
  points: string
  polygon: Point2D[]
}

type FloorplanItemEntry = {
  item: ItemNode
  points: string
  polygon: Point2D[]
}

type FloorplanStairSegmentEntry = {
  centerLine: FloorplanLineSegment | null
  innerPoints: string
  innerPolygon: Point2D[]
  segment: StairSegmentNode
  points: string
  polygon: Point2D[]
  treadBars: FloorplanPolygonEntry[]
  treadThickness: number
}

type FloorplanStairArrowEntry = {
  head: Point2D[]
  polyline: Point2D[]
}

type FloorplanStairEntry = {
  arrow: FloorplanStairArrowEntry | null
  stair: StairNode
  segments: FloorplanStairSegmentEntry[]
}

type FloorplanPalette = {
  surface: string
  minorGrid: string
  majorGrid: string
  minorGridOpacity: number
  majorGridOpacity: number
  slabFill: string
  slabStroke: string
  selectedSlabFill: string
  ceilingFill: string
  ceilingStroke: string
  selectedCeilingFill: string
  fenceFill: string
  fenceStroke: string
  fenceHoverStroke: string
  wallFill: string
  wallStroke: string
  wallHoverStroke: string
  deleteFill: string
  deleteStroke: string
  deleteWallFill: string
  deleteWallHoverStroke: string
  selectedFill: string
  selectedStroke: string
  draftFill: string
  draftStroke: string
  cursor: string
  editCursor: string
  anchor: string
  openingFill: string
  openingStroke: string
  measurementStroke: string
  endpointHandleFill: string
  endpointHandleStroke: string
  endpointHandleHoverStroke: string
  endpointHandleActiveFill: string
  endpointHandleActiveStroke: string
}

const resizeCursorByDirection: Record<ResizeDirection, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
}

const resizeHandleConfigurations: Array<{
  direction: ResizeDirection
  className: string
}> = [
  {
    direction: 'n',
    className: 'absolute top-0 left-4 right-4 z-20 h-2 cursor-ns-resize',
  },
  {
    direction: 's',
    className: 'absolute right-4 bottom-0 left-4 z-20 h-2 cursor-ns-resize',
  },
  {
    direction: 'e',
    className: 'absolute top-4 right-0 bottom-4 z-20 w-2 cursor-ew-resize',
  },
  {
    direction: 'w',
    className: 'absolute top-4 bottom-4 left-0 z-20 w-2 cursor-ew-resize',
  },
  {
    direction: 'ne',
    className: 'absolute top-0 right-0 z-20 h-4 w-4 cursor-nesw-resize',
  },
  {
    direction: 'nw',
    className: 'absolute top-0 left-0 z-20 h-4 w-4 cursor-nwse-resize',
  },
  {
    direction: 'se',
    className: 'absolute right-0 bottom-0 z-20 h-4 w-4 cursor-nwse-resize',
  },
  {
    direction: 'sw',
    className: 'absolute bottom-0 left-0 z-20 h-4 w-4 cursor-nesw-resize',
  },
]

const guideCornerSigns: Record<GuideCorner, { x: -1 | 1; y: -1 | 1 }> = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
}

const oppositeGuideCorner: Record<GuideCorner, GuideCorner> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getSelectionModifierKeys(event?: { metaKey?: boolean; ctrlKey?: boolean }) {
  return {
    meta: Boolean(event?.metaKey),
    ctrl: Boolean(event?.ctrlKey),
  }
}

function toSvgX(value: number): number {
  return -value
}

function toSvgY(value: number): number {
  return -value
}

function toSvgPoint(point: Point2D): SvgPoint {
  return {
    x: toSvgX(point.x),
    y: toSvgY(point.y),
  }
}

function toSvgPlanPoint(point: WallPlanPoint): SvgPoint {
  return {
    x: toSvgX(point[0]),
    y: toSvgY(point[1]),
  }
}

function toPlanPointFromSvgPoint(svgPoint: SvgPoint): WallPlanPoint {
  return [toSvgX(svgPoint.x), toSvgY(svgPoint.y)]
}

function getSnappedFloorplanPoint(point: WallPlanPoint): WallPlanPoint {
  return [snapToHalf(point[0]), snapToHalf(point[1])]
}

function isNumberTuple3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function getSketchPlaneSignature(plane: SketchPlane | null | undefined): string | null {
  if (!plane) {
    return null
  }

  if (plane.kind === 'feature-top') {
    return `feature-top:${plane.targetNodeId}:${plane.elevation}`
  }

  const normal = plane.normal
  const origin = plane.origin
  const planeOffset = normal[0] * origin[0] + normal[1] * origin[1] + normal[2] * origin[2]
  const formatPlaneNumber = (value: number) => (Math.round(value * 10000) / 10000).toString()

  return [
    'feature-face',
    plane.targetNodeId,
    plane.space ?? 'target-local',
    ...normal.map(formatPlaneNumber),
    formatPlaneNumber(planeOffset),
  ].join(':')
}

function getSketchPlaneFromMetadata(metadata: unknown): SketchPlane | null {
  if (!(typeof metadata === 'object' && metadata !== null && 'sketchPlane' in metadata)) {
    return null
  }

  const rawPlane = (metadata as Record<string, unknown>).sketchPlane
  if (!(typeof rawPlane === 'object' && rawPlane !== null)) {
    return null
  }

  const plane = rawPlane as Record<string, unknown>
  if (
    plane.kind === 'feature-top' &&
    typeof plane.targetNodeId === 'string' &&
    typeof plane.elevation === 'number' &&
    Number.isFinite(plane.elevation)
  ) {
    return {
      kind: 'feature-top',
      targetNodeId: plane.targetNodeId as AnyNodeId,
      elevation: plane.elevation,
    }
  }

  if (
    plane.kind === 'feature-face' &&
    typeof plane.targetNodeId === 'string' &&
    isNumberTuple3(plane.origin) &&
    isNumberTuple3(plane.uAxis) &&
    isNumberTuple3(plane.vAxis) &&
    isNumberTuple3(plane.normal)
  ) {
    return {
      kind: 'feature-face',
      targetNodeId: plane.targetNodeId as AnyNodeId,
      space: plane.space === 'scene' || plane.space === 'target-local' ? plane.space : undefined,
      origin: plane.origin,
      uAxis: plane.uAxis,
      vAxis: plane.vAxis,
      normal: plane.normal,
      label: typeof plane.label === 'string' ? plane.label : undefined,
    }
  }

  return null
}

function getSketchPlaneRecordLabel(plane: SketchPlane, index: number): string {
  if (plane.kind === 'feature-top') {
    return `顶面草图 ${index + 1}`
  }

  return `${plane.label ?? '实体面'}草图 ${index + 1}`
}

function doesSketchNodeMatchActivePlane(
  node: { metadata?: unknown },
  activePlane: SketchPlane | null,
) {
  const nodePlaneSignature = getSketchPlaneSignature(getSketchPlaneFromMetadata(node.metadata))
  const activePlaneSignature = getSketchPlaneSignature(activePlane)

  return nodePlaneSignature === activePlaneSignature
}

function doesSketchDimensionReferenceMatchActivePlane(
  reference: SketchDimensionNode['start'],
  visibleLineIds: ReadonlySet<string>,
  visibleCircleIds: ReadonlySet<string>,
) {
  if (reference.kind === 'circle-center') {
    return visibleCircleIds.has(reference.circleId)
  }

  return visibleLineIds.has(reference.lineId)
}

function getFeatureFaceSketchOutline(
  plane: SketchPlane | null,
  nodes: Readonly<Record<string, AnyNode>>,
): Point2D[] {
  if (plane?.kind !== 'feature-face') {
    return []
  }

  const targetNode = nodes[plane.targetNodeId]
  if (targetNode?.type !== 'feature') {
    return []
  }

  const feature = targetNode as FeatureNode
  const points = feature.profile.points
  if (points.length < 2) {
    return []
  }

  const origin = plane.origin
  const uAxis = plane.uAxis
  const projectToU = ([x, z]: [number, number]) =>
    (x - origin[0]) * uAxis[0] + (0 - origin[1]) * uAxis[1] + (z - origin[2]) * uAxis[2]

  let minU = Number.POSITIVE_INFINITY
  let maxU = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const u = projectToU(point)
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
  }

  const depth = Math.max(feature.depth, 0.1)
  if (!(Number.isFinite(minU) && Number.isFinite(maxU) && maxU - minU > 1e-6)) {
    return []
  }

  return [
    { x: minU, y: 0 },
    { x: maxU, y: 0 },
    { x: maxU, y: depth },
    { x: minU, y: depth },
  ]
}

function rotateVector([x, y]: WallPlanPoint, angle: number): WallPlanPoint {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos - y * sin, x * sin + y * cos]
}

function addVectorToSvgPoint(point: SvgPoint, [dx, dy]: WallPlanPoint): SvgPoint {
  return {
    x: point.x + dx,
    y: point.y + dy,
  }
}

function subtractSvgPoints(point: SvgPoint, origin: SvgPoint): WallPlanPoint {
  return [point.x - origin.x, point.y - origin.y]
}

function flipGuideImageLocalPoint([x, y]: WallPlanPoint): WallPlanPoint {
  return [-x, -y]
}

function getGuideDisplayBoundsFromImageBounds(bounds: {
  height: number
  width: number
  x: number
  y: number
}) {
  return {
    x: -(bounds.x + bounds.width),
    y: -(bounds.y + bounds.height),
    width: bounds.width,
    height: bounds.height,
  }
}

function midpointBetweenSvgPoints(start: SvgPoint, end: SvgPoint): SvgPoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
}

function getGuideWidth(scale: number) {
  return FLOORPLAN_GUIDE_BASE_WIDTH * scale
}

function getGuideHeight(width: number, aspectRatio: number) {
  return width / aspectRatio
}

function getGuideCenterSvgPoint(guide: GuideNode): SvgPoint {
  return {
    x: toSvgX(guide.position[0]),
    y: toSvgY(guide.position[2]),
  }
}

function getGuideLocalPointFromSvgPoint(
  guide: GuideNode,
  dimensions: GuideImageDimensions,
  svgPoint: SvgPoint,
): WallPlanPoint | null {
  const aspectRatio = dimensions.width / dimensions.height
  if (!(aspectRatio > 0)) return null

  const width = getGuideWidth(guide.scale)
  const height = getGuideHeight(width, aspectRatio)
  const centerSvg = getGuideCenterSvgPoint(guide)
  const displayLocalPoint = rotateVector(subtractSvgPoints(svgPoint, centerSvg), guide.rotation[1])

  if (Math.abs(displayLocalPoint[0]) > width / 2 || Math.abs(displayLocalPoint[1]) > height / 2) {
    return null
  }

  return flipGuideImageLocalPoint(displayLocalPoint)
}

function getGuideClampedLocalPointFromSvgPoint(
  guide: GuideNode,
  dimensions: GuideImageDimensions,
  svgPoint: SvgPoint,
): WallPlanPoint | null {
  const aspectRatio = dimensions.width / dimensions.height
  if (!(aspectRatio > 0)) return null

  const width = getGuideWidth(guide.scale)
  const height = getGuideHeight(width, aspectRatio)
  const centerSvg = getGuideCenterSvgPoint(guide)
  const displayLocalPoint = rotateVector(subtractSvgPoints(svgPoint, centerSvg), guide.rotation[1])

  return flipGuideImageLocalPoint([
    clamp(displayLocalPoint[0], -width / 2, width / 2),
    clamp(displayLocalPoint[1], -height / 2, height / 2),
  ])
}

function getGuideDetectionRegionFromLocalBounds(
  guide: GuideNode,
  dimensions: GuideImageDimensions,
  start: WallPlanPoint,
  end: WallPlanPoint,
): GuideNode['detectionRegion'] | null {
  const aspectRatio = dimensions.width / dimensions.height
  if (!(aspectRatio > 0)) {
    return null
  }

  const width = getGuideWidth(guide.scale)
  const height = getGuideHeight(width, aspectRatio)
  const minX = clamp(Math.min(start[0], end[0]), -width / 2, width / 2)
  const maxX = clamp(Math.max(start[0], end[0]), -width / 2, width / 2)
  const minY = clamp(Math.min(start[1], end[1]), -height / 2, height / 2)
  const maxY = clamp(Math.max(start[1], end[1]), -height / 2, height / 2)
  const normalizedRegion = {
    x: (minX + width / 2) / width,
    y: (minY + height / 2) / height,
    width: (maxX - minX) / width,
    height: (maxY - minY) / height,
  } satisfies NonNullable<GuideNode['detectionRegion']>

  if (
    normalizedRegion.width < MIN_GUIDE_DETECTION_REGION_RATIO ||
    normalizedRegion.height < MIN_GUIDE_DETECTION_REGION_RATIO
  ) {
    return null
  }

  return normalizedRegion
}

function getGuideDetectionRegionLocalBounds(
  guide: GuideNode,
  dimensions: GuideImageDimensions,
  region: GuideNode['detectionRegion'],
) {
  if (!region) {
    return null
  }

  const aspectRatio = dimensions.width / dimensions.height
  if (!(aspectRatio > 0)) {
    return null
  }

  const width = getGuideWidth(guide.scale)
  const height = getGuideHeight(width, aspectRatio)

  return {
    x: -width / 2 + region.x * width,
    y: -height / 2 + region.y * height,
    width: region.width * width,
    height: region.height * height,
  }
}

function getGuideCornerLocalOffset(
  width: number,
  height: number,
  corner: GuideCorner,
): WallPlanPoint {
  const signs = guideCornerSigns[corner]
  return [(width / 2) * signs.x, (height / 2) * signs.y]
}

function getGuideCornerSvgPoint(
  centerSvg: SvgPoint,
  width: number,
  height: number,
  rotationSvg: number,
  corner: GuideCorner,
): SvgPoint {
  return addVectorToSvgPoint(
    centerSvg,
    rotateVector(getGuideCornerLocalOffset(width, height, corner), rotationSvg),
  )
}

function snapAngleToIncrement(angle: number, incrementDegrees: number) {
  const incrementRadians = (incrementDegrees * Math.PI) / 180
  return Math.round(angle / incrementRadians) * incrementRadians
}

function toPositiveAngleDegrees(angle: number) {
  const angleDegrees = (angle * 180) / Math.PI
  return ((angleDegrees % 180) + 180) % 180
}

function getResizeCursorForAngle(angle: number) {
  const normalizedDegrees = toPositiveAngleDegrees(angle)

  if (normalizedDegrees < 22.5 || normalizedDegrees >= 157.5) {
    return 'ew-resize'
  }

  if (normalizedDegrees < 67.5) {
    return 'nwse-resize'
  }

  if (normalizedDegrees < 112.5) {
    return 'ns-resize'
  }

  return 'nesw-resize'
}

function getGuideResizeCursor(corner: GuideCorner, rotationSvg: number) {
  const signs = guideCornerSigns[corner]
  return getResizeCursorForAngle(Math.atan2(signs.y, signs.x) + rotationSvg)
}

function buildCursorUrl(svgMarkup: string, hotspotX: number, hotspotY: number, fallback: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svgMarkup)}") ${hotspotX} ${hotspotY}, ${fallback}`
}

function getGuideRotateCursor(isDarkMode: boolean) {
  const strokeColor = isDarkMode ? '#ffffff' : '#09090b'
  const outlineColor = isDarkMode ? '#0a0e1b' : '#ffffff'
  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M7 15.75a6 6 0 1 0 1.9-8.28" stroke="${outlineColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 5.5v4.5h4.5" stroke="${outlineColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 15.75a6 6 0 1 0 1.9-8.28" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 5.5v4.5h4.5" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `.trim()

  return buildCursorUrl(svgMarkup, 12, 12, 'pointer')
}

function buildGuideTranslateDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
): GuideTransformDraft {
  const centerSvg = addVectorToSvgPoint(pointerSvg, [
    -interaction.pointerOffsetSvg[0],
    -interaction.pointerOffsetSvg[1],
  ])

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(centerSvg),
    scale: interaction.scale,
    rotation: normalizeAngle(-interaction.rotationSvg),
  }
}

function normalizeAngle(angle: number) {
  let nextAngle = angle

  while (nextAngle <= -Math.PI) {
    nextAngle += Math.PI * 2
  }

  while (nextAngle > Math.PI) {
    nextAngle -= Math.PI * 2
  }

  return nextAngle
}

function areGuideTransformDraftsEqual(
  previousDraft: GuideTransformDraft | null,
  nextDraft: GuideTransformDraft | null,
  epsilon = 1e-6,
) {
  if (previousDraft === nextDraft) {
    return true
  }

  if (!(previousDraft && nextDraft)) {
    return false
  }

  return (
    previousDraft.guideId === nextDraft.guideId &&
    Math.abs(previousDraft.position[0] - nextDraft.position[0]) <= epsilon &&
    Math.abs(previousDraft.position[1] - nextDraft.position[1]) <= epsilon &&
    Math.abs(previousDraft.scale - nextDraft.scale) <= epsilon &&
    Math.abs(previousDraft.rotation - nextDraft.rotation) <= epsilon
  )
}

function doesGuideMatchDraft(guide: GuideNode, draft: GuideTransformDraft, epsilon = 1e-6) {
  return (
    Math.abs(guide.position[0] - draft.position[0]) <= epsilon &&
    Math.abs(guide.position[2] - draft.position[1]) <= epsilon &&
    Math.abs(guide.scale - draft.scale) <= epsilon &&
    Math.abs(normalizeAngle(guide.rotation[1] - draft.rotation)) <= epsilon
  )
}

function buildGuideResizeDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
): GuideTransformDraft {
  const signs = guideCornerSigns[interaction.corner]
  const minWidth = FLOORPLAN_GUIDE_BASE_WIDTH * FLOORPLAN_GUIDE_MIN_SCALE
  const diagonal = [signs.x * interaction.aspectRatio, signs.y] as WallPlanPoint
  const oppositeCornerSvg = interaction.oppositeCornerSvg ?? interaction.centerSvg
  const relativePointer = rotateVector(
    subtractSvgPoints(pointerSvg, oppositeCornerSvg),
    -interaction.rotationSvg,
  )
  const projectedHeight =
    (relativePointer[0] * diagonal[0] + relativePointer[1] * diagonal[1]) /
    (interaction.aspectRatio ** 2 + 1)
  const width = Math.max(minWidth, projectedHeight * interaction.aspectRatio)
  const height = getGuideHeight(width, interaction.aspectRatio)
  const draggedCornerSvg = addVectorToSvgPoint(
    oppositeCornerSvg,
    rotateVector([signs.x * width, signs.y * height], interaction.rotationSvg),
  )
  const centerSvg = midpointBetweenSvgPoints(oppositeCornerSvg, draggedCornerSvg)

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(centerSvg),
    scale: width / FLOORPLAN_GUIDE_BASE_WIDTH,
    rotation: normalizeAngle(-interaction.rotationSvg),
  }
}

function buildGuideRotationDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
  useFineIncrement: boolean,
): GuideTransformDraft {
  const pointerVector = subtractSvgPoints(pointerSvg, interaction.centerSvg)

  if (pointerVector[0] ** 2 + pointerVector[1] ** 2 <= 1e-6) {
    return {
      guideId: interaction.guideId,
      position: toPlanPointFromSvgPoint(interaction.centerSvg),
      scale: interaction.scale,
      rotation: normalizeAngle(-interaction.rotationSvg),
    }
  }

  const rawRotationSvg =
    Math.atan2(pointerVector[1], pointerVector[0]) - interaction.cornerBaseAngle
  const snappedRotationSvg = snapAngleToIncrement(
    rawRotationSvg,
    useFineIncrement
      ? FLOORPLAN_GUIDE_ROTATION_FINE_SNAP_DEGREES
      : FLOORPLAN_GUIDE_ROTATION_SNAP_DEGREES,
  )

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(interaction.centerSvg),
    scale: interaction.scale,
    rotation: normalizeAngle(-snappedRotationSvg),
  }
}

function toSvgSelectionBounds(bounds: FloorplanSelectionBounds) {
  return {
    x: toSvgX(bounds.maxX),
    y: toSvgY(bounds.maxY),
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  }
}

function getFloorplanSelectionBounds(
  start: WallPlanPoint,
  end: WallPlanPoint,
): FloorplanSelectionBounds {
  return {
    minX: Math.min(start[0], end[0]),
    maxX: Math.max(start[0], end[0]),
    minY: Math.min(start[1], end[1]),
    maxY: Math.max(start[1], end[1]),
  }
}

function isPointInsideSelectionBounds(point: Point2D, bounds: FloorplanSelectionBounds) {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  )
}

function isPointInsidePolygon(point: Point2D, polygon: Point2D[]) {
  let isInside = false

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = polygon[currentIndex]
    const previous = polygon[previousIndex]

    if (!(current && previous)) {
      continue
    }

    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x

    if (intersects) {
      isInside = !isInside
    }
  }

  return isInside
}

function getLineOrientation(start: Point2D, end: Point2D, point: Point2D) {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
}

function isPointOnSegment(point: Point2D, start: Point2D, end: Point2D) {
  const epsilon = 1e-9

  return (
    Math.abs(getLineOrientation(start, end, point)) <= epsilon &&
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  )
}

function doSegmentsIntersect(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
) {
  const orientation1 = getLineOrientation(firstStart, firstEnd, secondStart)
  const orientation2 = getLineOrientation(firstStart, firstEnd, secondEnd)
  const orientation3 = getLineOrientation(secondStart, secondEnd, firstStart)
  const orientation4 = getLineOrientation(secondStart, secondEnd, firstEnd)

  const hasProperIntersection =
    ((orientation1 > 0 && orientation2 < 0) || (orientation1 < 0 && orientation2 > 0)) &&
    ((orientation3 > 0 && orientation4 < 0) || (orientation3 < 0 && orientation4 > 0))

  if (hasProperIntersection) {
    return true
  }

  return (
    isPointOnSegment(secondStart, firstStart, firstEnd) ||
    isPointOnSegment(secondEnd, firstStart, firstEnd) ||
    isPointOnSegment(firstStart, secondStart, secondEnd) ||
    isPointOnSegment(firstEnd, secondStart, secondEnd)
  )
}

function doesPolygonIntersectSelectionBounds(polygon: Point2D[], bounds: FloorplanSelectionBounds) {
  if (polygon.length === 0) {
    return false
  }

  if (polygon.some((point) => isPointInsideSelectionBounds(point, bounds))) {
    return true
  }

  const boundsCorners: [Point2D, Point2D, Point2D, Point2D] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ]

  if (boundsCorners.some((corner) => isPointInsidePolygon(corner, polygon))) {
    return true
  }

  const boundsEdges = [
    [boundsCorners[0], boundsCorners[1]],
    [boundsCorners[1], boundsCorners[2]],
    [boundsCorners[2], boundsCorners[3]],
    [boundsCorners[3], boundsCorners[0]],
  ] as const

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]

    if (!(start && end)) {
      continue
    }

    for (const [edgeStart, edgeEnd] of boundsEdges) {
      if (doSegmentsIntersect(start, end, edgeStart, edgeEnd)) {
        return true
      }
    }
  }

  return false
}

function getViewportBounds(): ViewportBounds {
  if (typeof window === 'undefined') {
    return {
      width: PANEL_DEFAULT_WIDTH + PANEL_MARGIN * 2,
      height: PANEL_DEFAULT_HEIGHT + PANEL_MARGIN * 2,
    }
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function getPanelSizeLimits(bounds: ViewportBounds) {
  const maxWidth = Math.max(1, bounds.width - PANEL_MARGIN * 2)
  const maxHeight = Math.max(1, bounds.height - PANEL_MARGIN * 2)

  return {
    maxHeight,
    maxWidth,
    minHeight: Math.min(PANEL_MIN_HEIGHT, maxHeight),
    minWidth: Math.min(PANEL_MIN_WIDTH, maxWidth),
  }
}

function constrainPanelRect(rect: PanelRect, bounds: ViewportBounds): PanelRect {
  const { minWidth, maxWidth, minHeight, maxHeight } = getPanelSizeLimits(bounds)
  const width = clamp(rect.width, minWidth, maxWidth)
  const height = clamp(rect.height, minHeight, maxHeight)
  const x = clamp(rect.x, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.width - PANEL_MARGIN - width))
  const y = clamp(
    rect.y,
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, bounds.height - PANEL_MARGIN - height),
  )

  return { x, y, width, height }
}

function getPanelPositionRatios(rect: PanelRect, bounds: ViewportBounds) {
  const availableX = Math.max(bounds.width - rect.width - PANEL_MARGIN * 2, 0)
  const availableY = Math.max(bounds.height - rect.height - PANEL_MARGIN * 2, 0)

  return {
    xRatio: availableX > 0 ? (rect.x - PANEL_MARGIN) / availableX : 0.5,
    yRatio: availableY > 0 ? (rect.y - PANEL_MARGIN) / availableY : 0.5,
  }
}

function adaptPanelRectToBounds(
  rect: PanelRect,
  previousBounds: ViewportBounds,
  nextBounds: ViewportBounds,
): PanelRect {
  const normalizedRect = constrainPanelRect(rect, previousBounds)
  const { xRatio, yRatio } = getPanelPositionRatios(normalizedRect, previousBounds)
  const { minWidth, maxWidth, minHeight, maxHeight } = getPanelSizeLimits(nextBounds)
  const width = clamp(normalizedRect.width, minWidth, maxWidth)
  const height = clamp(normalizedRect.height, minHeight, maxHeight)
  const availableX = Math.max(nextBounds.width - width - PANEL_MARGIN * 2, 0)
  const availableY = Math.max(nextBounds.height - height - PANEL_MARGIN * 2, 0)

  return constrainPanelRect(
    {
      x: PANEL_MARGIN + availableX * xRatio,
      y: PANEL_MARGIN + availableY * yRatio,
      width,
      height,
    },
    nextBounds,
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidPanelRect(value: unknown): value is PanelRect {
  return (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNumber((value as PanelRect).x) &&
    isFiniteNumber((value as PanelRect).y) &&
    isFiniteNumber((value as PanelRect).width) &&
    isFiniteNumber((value as PanelRect).height)
  )
}

function isValidViewportBounds(value: unknown): value is ViewportBounds {
  return (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNumber((value as ViewportBounds).width) &&
    isFiniteNumber((value as ViewportBounds).height)
  )
}

function readPersistedPanelLayout(currentBounds: ViewportBounds): PanelRect | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawLayout = window.localStorage.getItem(FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY)
    if (!rawLayout) {
      return null
    }

    const parsedLayout = JSON.parse(rawLayout) as Partial<PersistedPanelLayout>
    if (!(isValidPanelRect(parsedLayout.rect) && isValidViewportBounds(parsedLayout.viewport))) {
      return null
    }

    return adaptPanelRectToBounds(parsedLayout.rect, parsedLayout.viewport, currentBounds)
  } catch {
    return null
  }
}

function writePersistedPanelLayout(layout: PersistedPanelLayout) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

function getInitialPanelRect(bounds: ViewportBounds): PanelRect {
  return constrainPanelRect(
    {
      x: bounds.width - PANEL_DEFAULT_WIDTH - PANEL_MARGIN,
      y: bounds.height - PANEL_DEFAULT_HEIGHT - PANEL_DEFAULT_BOTTOM_OFFSET,
      width: PANEL_DEFAULT_WIDTH,
      height: PANEL_DEFAULT_HEIGHT,
    },
    bounds,
  )
}

function movePanelRect(
  initialRect: PanelRect,
  dx: number,
  dy: number,
  bounds: ViewportBounds,
): PanelRect {
  return constrainPanelRect(
    {
      ...initialRect,
      x: initialRect.x + dx,
      y: initialRect.y + dy,
    },
    bounds,
  )
}

function resizePanelRect(
  initialRect: PanelRect,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  bounds: ViewportBounds,
): PanelRect {
  const right = initialRect.x + initialRect.width
  const bottom = initialRect.y + initialRect.height

  let x = initialRect.x
  let y = initialRect.y
  let width = initialRect.width
  let height = initialRect.height

  if (direction.includes('e')) width = initialRect.width + dx
  if (direction.includes('s')) height = initialRect.height + dy
  if (direction.includes('w')) width = initialRect.width - dx
  if (direction.includes('n')) height = initialRect.height - dy

  const maxWidth = Math.max(PANEL_MIN_WIDTH, bounds.width - PANEL_MARGIN * 2)
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, bounds.height - PANEL_MARGIN * 2)
  width = clamp(width, PANEL_MIN_WIDTH, maxWidth)
  height = clamp(height, PANEL_MIN_HEIGHT, maxHeight)

  if (direction.includes('w')) {
    x = right - width
  }
  if (direction.includes('n')) {
    y = bottom - height
  }

  x = clamp(x, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.width - PANEL_MARGIN - width))
  y = clamp(y, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.height - PANEL_MARGIN - height))

  if (direction.includes('w')) {
    width = right - x
  } else {
    width = Math.min(width, bounds.width - PANEL_MARGIN - x)
  }

  if (direction.includes('n')) {
    height = bottom - y
  } else {
    height = Math.min(height, bounds.height - PANEL_MARGIN - y)
  }

  return constrainPanelRect({ x, y, width, height }, bounds)
}

function formatPolygonPoints(points: Point2D[]): string {
  return points
    .map((point) => {
      const svgPoint = toSvgPoint(point)
      return `${svgPoint.x},${svgPoint.y}`
    })
    .join(' ')
}

function formatPolylinePath(points: Point2D[]): string {
  const [firstPoint, ...restPoints] = points
  if (!firstPoint) {
    return ''
  }

  const firstSvgPoint = toSvgPoint(firstPoint)
  return [
    `M ${firstSvgPoint.x} ${firstSvgPoint.y}`,
    ...restPoints.map((point) => {
      const svgPoint = toSvgPoint(point)
      return `L ${svgPoint.x} ${svgPoint.y}`
    }),
  ].join(' ')
}

function formatPolygonPath(points: Point2D[], holes: Point2D[][] = []): string {
  const formatSubpath = (subpathPoints: Point2D[]) => {
    const [firstPoint, ...restPoints] = subpathPoints
    if (!firstPoint) {
      return null
    }

    const firstSvgPoint = toSvgPoint(firstPoint)

    return [
      `M ${firstSvgPoint.x} ${firstSvgPoint.y}`,
      ...restPoints.map((point) => {
        const svgPoint = toSvgPoint(point)
        return `L ${svgPoint.x} ${svgPoint.y}`
      }),
      'Z',
    ].join(' ')
  }

  return [points, ...holes].map(formatSubpath).filter(Boolean).join(' ')
}

function toFloorplanPolygon(points: Array<[number, number]>): Point2D[] {
  return points.map(([x, y]) => ({ x, y }))
}

function rotatePlanVector(x: number, y: number, rotation: number): [number, number] {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return [x * cos + y * sin, -x * sin + y * cos]
}

function getPolygonBounds(points: Point2D[]) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function getFloorplanActionMenuPosition(
  points: Point2D[],
  viewBox: { minX: number; minY: number; width: number; height: number },
  surfaceSize: { width: number; height: number },
) {
  if (points.length === 0) {
    return null
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    const svgPoint = toSvgPoint(point)
    minX = Math.min(minX, svgPoint.x)
    maxX = Math.max(maxX, svgPoint.x)
    minY = Math.min(minY, svgPoint.y)
    maxY = Math.max(maxY, svgPoint.y)
  }

  if (
    !(
      Number.isFinite(minX) &&
      Number.isFinite(maxX) &&
      Number.isFinite(minY) &&
      Number.isFinite(maxY)
    )
  ) {
    return null
  }

  if (
    maxX < viewBox.minX ||
    minX > viewBox.minX + viewBox.width ||
    maxY < viewBox.minY ||
    minY > viewBox.minY + viewBox.height
  ) {
    return null
  }

  const anchorX = (((minX + maxX) / 2 - viewBox.minX) / viewBox.width) * surfaceSize.width
  const anchorY = ((minY - viewBox.minY) / viewBox.height) * surfaceSize.height

  return {
    x: Math.min(
      Math.max(anchorX, FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING),
      surfaceSize.width - FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING,
    ),
    y: Math.max(anchorY, FLOORPLAN_ACTION_MENU_MIN_ANCHOR_Y),
  }
}

function getRotatedRectanglePolygon(
  center: Point2D,
  width: number,
  depth: number,
  rotation: number,
): Point2D[] {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const corners: Array<[number, number]> = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ]

  return corners.map(([localX, localY]) => {
    const [offsetX, offsetY] = rotatePlanVector(localX, localY, rotation)
    return {
      x: center.x + offsetX,
      y: center.y + offsetY,
    }
  })
}

function interpolatePlanPoint(start: Point2D, end: Point2D, t: number): Point2D {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  }
}

function getPlanPointDistance(start: Point2D, end: Point2D): number {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

function movePlanPointTowards(start: Point2D, end: Point2D, distance: number): Point2D {
  const totalDistance = getPlanPointDistance(start, end)
  if (totalDistance <= Number.EPSILON || distance <= 0) {
    return start
  }

  return interpolatePlanPoint(start, end, Math.min(1, distance / totalDistance))
}

function getFloorplanStairSegmentCenterLine(polygon: Point2D[]): FloorplanLineSegment | null {
  if (polygon.length < 4) {
    return null
  }

  const [backLeft, backRight, frontRight, frontLeft] = polygon

  return {
    start: interpolatePlanPoint(backLeft!, backRight!, 0.5),
    end: interpolatePlanPoint(frontLeft!, frontRight!, 0.5),
  }
}

function getFloorplanStairInnerPolygon(polygon: Point2D[]): Point2D[] {
  if (polygon.length < 4) {
    return polygon
  }

  const [backLeft, backRight, frontRight, frontLeft] = polygon
  const outerWidth = getPlanPointDistance(backLeft!, backRight!)
  const outerLength = getPlanPointDistance(backLeft!, frontLeft!)
  const widthInset = Math.min(
    FLOORPLAN_STAIR_OUTLINE_BAND_THICKNESS,
    outerWidth * FLOORPLAN_STAIR_OUTLINE_MAX_FRACTION,
  )
  const lengthInset = Math.min(
    FLOORPLAN_STAIR_OUTLINE_BAND_THICKNESS,
    outerLength * FLOORPLAN_STAIR_OUTLINE_MAX_FRACTION,
  )

  const insetBackLeft = movePlanPointTowards(backLeft!, frontLeft!, lengthInset)
  const insetBackRight = movePlanPointTowards(backRight!, frontRight!, lengthInset)
  const insetFrontLeft = movePlanPointTowards(frontLeft!, backLeft!, lengthInset)
  const insetFrontRight = movePlanPointTowards(frontRight!, backRight!, lengthInset)

  const innerPolygon = [
    movePlanPointTowards(insetBackLeft, insetBackRight, widthInset),
    movePlanPointTowards(insetBackRight, insetBackLeft, widthInset),
    movePlanPointTowards(insetFrontRight, insetFrontLeft, widthInset),
    movePlanPointTowards(insetFrontLeft, insetFrontRight, widthInset),
  ]

  const innerWidth = getPlanPointDistance(innerPolygon[0]!, innerPolygon[1]!)
  const innerLength = getPlanPointDistance(innerPolygon[0]!, innerPolygon[3]!)

  return innerWidth > 0.06 && innerLength > 0.06 ? innerPolygon : polygon
}

function getFloorplanStairTreadLines(
  segment: StairSegmentNode,
  innerPolygon: Point2D[],
): FloorplanLineSegment[] {
  if (segment.segmentType !== 'stair' || segment.stepCount <= 1 || innerPolygon.length < 4) {
    return []
  }

  const [backLeft, backRight, frontRight, frontLeft] = innerPolygon
  const treadLines: FloorplanLineSegment[] = []

  for (let stepIndex = 1; stepIndex < segment.stepCount; stepIndex += 1) {
    const t = stepIndex / segment.stepCount
    treadLines.push({
      start: interpolatePlanPoint(backLeft!, frontLeft!, t),
      end: interpolatePlanPoint(backRight!, frontRight!, t),
    })
  }

  return treadLines
}

function getThickPlanLinePolygon(line: FloorplanLineSegment, thickness: number): Point2D[] {
  const dx = line.end.x - line.start.x
  const dy = line.end.y - line.start.y
  const length = Math.hypot(dx, dy)

  if (length <= Number.EPSILON || thickness <= 0) {
    return [line.start, line.end, line.end, line.start]
  }

  const halfThickness = thickness / 2
  const normalX = (-dy / length) * halfThickness
  const normalY = (dx / length) * halfThickness

  return [
    { x: line.start.x + normalX, y: line.start.y + normalY },
    { x: line.end.x + normalX, y: line.end.y + normalY },
    { x: line.end.x - normalX, y: line.end.y - normalY },
    { x: line.start.x - normalX, y: line.start.y - normalY },
  ]
}

function getPolylineBandPolygons(points: Point2D[], thickness: number): FloorplanPolygonEntry[] {
  if (points.length < 2 || thickness <= 0) {
    return []
  }

  const polygons: FloorplanPolygonEntry[] = []

  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    const start = points[pointIndex - 1]!
    const end = points[pointIndex]!

    if (getPlanPointDistance(start, end) <= Number.EPSILON) {
      continue
    }

    const polygon = getThickPlanLinePolygon({ start, end }, thickness)
    polygons.push({
      points: formatPolygonPoints(polygon),
      polygon,
    })
  }

  return polygons
}

function getFloorplanStairTreadThickness(segment: StairSegmentNode, innerPolygon: Point2D[]) {
  if (segment.segmentType !== 'stair' || segment.stepCount <= 1 || innerPolygon.length < 4) {
    return 0
  }

  const innerWidth = getPlanPointDistance(innerPolygon[0]!, innerPolygon[1]!)
  const innerLength = getPlanPointDistance(innerPolygon[0]!, innerPolygon[3]!)
  const treadRun = innerLength / Math.max(segment.stepCount, 1)
  return clamp(
    Math.min(FLOORPLAN_STAIR_TREAD_BAND_THICKNESS, innerWidth * 0.12, treadRun * 0.44),
    FLOORPLAN_STAIR_TREAD_MIN_THICKNESS,
    FLOORPLAN_STAIR_TREAD_BAND_THICKNESS,
  )
}

function getFloorplanStairTreadBars(
  segment: StairSegmentNode,
  innerPolygon: Point2D[],
  treadThickness = getFloorplanStairTreadThickness(segment, innerPolygon),
): FloorplanPolygonEntry[] {
  const treadLines = getFloorplanStairTreadLines(segment, innerPolygon)
  if (treadLines.length === 0 || treadThickness <= 0) {
    return []
  }

  return treadLines.map((line) => {
    const polygon = getThickPlanLinePolygon(line, treadThickness)
    return {
      points: formatPolygonPoints(polygon),
      polygon,
    }
  })
}

type FloorplanStairArrowSide = 'back' | 'front' | 'left' | 'right'

function getFloorplanStairSegmentCenterPoint(segment: FloorplanStairSegmentEntry): Point2D | null {
  if (segment.centerLine) {
    return interpolatePlanPoint(segment.centerLine.start, segment.centerLine.end, 0.5)
  }

  if (segment.polygon.length < 4) {
    return null
  }

  const [backLeft, backRight, frontRight, frontLeft] = segment.polygon

  return {
    x: (backLeft!.x + backRight!.x + frontRight!.x + frontLeft!.x) / 4,
    y: (backLeft!.y + backRight!.y + frontRight!.y + frontLeft!.y) / 4,
  }
}

function getFloorplanStairSegmentSidePoint(
  segment: FloorplanStairSegmentEntry,
  side: FloorplanStairArrowSide,
): Point2D | null {
  if (segment.polygon.length < 4) {
    return null
  }

  const [backLeft, backRight, frontRight, frontLeft] = segment.polygon

  switch (side) {
    case 'back':
      return interpolatePlanPoint(backLeft!, backRight!, 0.5)
    case 'front':
      return interpolatePlanPoint(frontLeft!, frontRight!, 0.5)
    case 'left':
      return interpolatePlanPoint(backLeft!, frontLeft!, 0.5)
    case 'right':
      return interpolatePlanPoint(backRight!, frontRight!, 0.5)
  }
}

function getFloorplanStairExitSide(
  nextSegment: StairSegmentNode | undefined,
): FloorplanStairArrowSide {
  if (!nextSegment) {
    return 'front'
  }

  // `attachmentSide` describes the next segment's turn direction. The floorplan transform
  // attaches `left` turns to the previous segment's positive local X edge and `right` turns
  // to the negative local X edge, so the arrow needs to mirror that convention here.
  if (nextSegment.attachmentSide === 'left') {
    return 'right'
  }
  if (nextSegment.attachmentSide === 'right') {
    return 'left'
  }

  return 'front'
}

function appendUniquePlanPoint(points: Point2D[], point: Point2D | null) {
  if (!point) {
    return
  }

  const lastPoint = points[points.length - 1]
  if (lastPoint && getPlanPointDistance(lastPoint, point) <= 0.001) {
    return
  }

  points.push(point)
}

function buildFloorplanStairArrow(
  segments: FloorplanStairSegmentEntry[],
): FloorplanStairArrowEntry | null {
  const rawPoints: Point2D[] = []

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex]!
    const nextSegment = segments[segmentIndex + 1]?.segment
    const entryPoint = getFloorplanStairSegmentSidePoint(segment, 'back')
    const exitPoint = getFloorplanStairSegmentSidePoint(
      segment,
      getFloorplanStairExitSide(nextSegment),
    )

    if (!(entryPoint && exitPoint)) {
      continue
    }

    appendUniquePlanPoint(rawPoints, entryPoint)

    const isStraightSegment = getPlanPointDistance(entryPoint, exitPoint) <= 0.001
    if (isStraightSegment) {
      continue
    }

    const exitSide = getFloorplanStairExitSide(nextSegment)
    if (exitSide === 'front') {
      appendUniquePlanPoint(rawPoints, exitPoint)
      continue
    }

    appendUniquePlanPoint(rawPoints, getFloorplanStairSegmentCenterPoint(segment))
    appendUniquePlanPoint(rawPoints, exitPoint)
  }

  if (rawPoints.length < 2) {
    return null
  }

  const firstPoint = rawPoints[0]!
  const secondPoint = rawPoints[1]!
  const beforeLastPoint = rawPoints[rawPoints.length - 2]!
  const lastPoint = rawPoints[rawPoints.length - 1]!
  const firstLength = getPlanPointDistance(firstPoint, secondPoint)
  const lastLength = getPlanPointDistance(beforeLastPoint, lastPoint)

  if (firstLength <= Number.EPSILON || lastLength <= Number.EPSILON) {
    return null
  }

  const polyline = [
    movePlanPointTowards(firstPoint, secondPoint, Math.min(0.24, firstLength * 0.18)),
    ...rawPoints.slice(1, -1),
    movePlanPointTowards(lastPoint, beforeLastPoint, Math.min(0.3, lastLength * 0.22)),
  ]
  const arrowTailPoint = polyline[polyline.length - 2]
  const arrowTip = polyline[polyline.length - 1]

  if (!(arrowTailPoint && arrowTip)) {
    return null
  }

  const arrowBodyLength = getPlanPointDistance(arrowTailPoint, arrowTip)
  if (arrowBodyLength <= Number.EPSILON) {
    return null
  }

  const arrowHeadLength = clamp(
    arrowBodyLength * 0.72,
    FLOORPLAN_STAIR_ARROW_HEAD_MIN_SIZE,
    FLOORPLAN_STAIR_ARROW_HEAD_MAX_SIZE,
  )
  const arrowHeadBase = movePlanPointTowards(arrowTip, arrowTailPoint, arrowHeadLength)
  const directionX = arrowTip.x - arrowHeadBase.x
  const directionY = arrowTip.y - arrowHeadBase.y
  const directionLength = Math.hypot(directionX, directionY)

  if (directionLength <= Number.EPSILON) {
    return null
  }

  const normalX = -directionY / directionLength
  const normalY = directionX / directionLength
  const arrowHeadHalfWidth = arrowHeadLength * 0.34

  return {
    head: [
      arrowTip,
      {
        x: arrowHeadBase.x + normalX * arrowHeadHalfWidth,
        y: arrowHeadBase.y + normalY * arrowHeadHalfWidth,
      },
      {
        x: arrowHeadBase.x - normalX * arrowHeadHalfWidth,
        y: arrowHeadBase.y - normalY * arrowHeadHalfWidth,
      },
    ],
    polyline,
  }
}

function collectLevelDescendants(levelNode: LevelNode, nodes: Record<string, AnyNode>): AnyNode[] {
  const descendants: AnyNode[] = []
  const stack = [...levelNode.children].reverse() as AnyNodeId[]

  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId) {
      continue
    }

    const node = nodes[nodeId]
    if (!node) {
      continue
    }

    descendants.push(node)

    if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index] as AnyNodeId)
      }
    }
  }

  return descendants
}

function getItemFloorplanTransform(
  item: ItemNode,
  nodeById: ReadonlyMap<string, AnyNode>,
  cache: Map<string, FloorplanNodeTransform | null>,
): FloorplanNodeTransform | null {
  const cached = cache.get(item.id)
  if (cached !== undefined) {
    return cached
  }

  const localRotation = item.rotation[1] ?? 0
  let result: FloorplanNodeTransform | null = null
  const itemMetadata =
    typeof item.metadata === 'object' && item.metadata !== null && !Array.isArray(item.metadata)
      ? (item.metadata as Record<string, unknown>)
      : null

  if (itemMetadata?.isTransient === true) {
    const live = useLiveTransforms.getState().get(item.id)
    if (live) {
      result = {
        position: {
          x: live.position[0],
          y: live.position[2],
        },
        rotation: live.rotation,
      }

      cache.set(item.id, result)
      return result
    }
  }

  if (item.parentId) {
    const parentNode = nodeById.get(item.parentId as AnyNodeId)

    if (parentNode?.type === 'wall') {
      const wallRotation = -Math.atan2(
        parentNode.end[1] - parentNode.start[1],
        parentNode.end[0] - parentNode.start[0],
      )
      const wallLocalZ =
        item.asset.attachTo === 'wall-side'
          ? ((parentNode.thickness ?? 0.1) / 2) * (item.side === 'back' ? -1 : 1)
          : item.position[2]
      const [offsetX, offsetY] = rotatePlanVector(item.position[0], wallLocalZ, wallRotation)

      result = {
        position: {
          x: parentNode.start[0] + offsetX,
          y: parentNode.start[1] + offsetY,
        },
        rotation: wallRotation + localRotation,
      }
    } else if (parentNode?.type === 'item') {
      const parentTransform = getItemFloorplanTransform(parentNode, nodeById, cache)
      if (parentTransform) {
        const [offsetX, offsetY] = rotatePlanVector(
          item.position[0],
          item.position[2],
          parentTransform.rotation,
        )
        result = {
          position: {
            x: parentTransform.position.x + offsetX,
            y: parentTransform.position.y + offsetY,
          },
          rotation: parentTransform.rotation + localRotation,
        }
      }
    } else {
      result = {
        position: { x: item.position[0], y: item.position[2] },
        rotation: localRotation,
      }
    }
  } else {
    result = {
      position: { x: item.position[0], y: item.position[2] },
      rotation: localRotation,
    }
  }

  cache.set(item.id, result)
  return result
}

type StairSegmentTransform = {
  position: [number, number, number]
  rotation: number
}

function computeFloorplanStairSegmentTransforms(
  segments: StairSegmentNode[],
): StairSegmentTransform[] {
  const transforms: StairSegmentTransform[] = []
  let currentX = 0
  let currentY = 0
  let currentZ = 0
  let currentRotation = 0

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!

    if (index === 0) {
      transforms.push({
        position: [currentX, currentY, currentZ],
        rotation: currentRotation,
      })
      continue
    }

    const previousSegment = segments[index - 1]!
    let attachX = 0
    let attachY = previousSegment.height
    let attachZ = previousSegment.length
    let rotationDelta = 0

    if (segment.attachmentSide === 'left') {
      attachX = previousSegment.width / 2
      attachZ = previousSegment.length / 2
      rotationDelta = Math.PI / 2
    } else if (segment.attachmentSide === 'right') {
      attachX = -previousSegment.width / 2
      attachZ = previousSegment.length / 2
      rotationDelta = -Math.PI / 2
    }

    const [rotatedAttachX, rotatedAttachZ] = rotatePlanVector(attachX, attachZ, currentRotation)
    currentX += rotatedAttachX
    currentY += attachY
    currentZ += rotatedAttachZ
    currentRotation += rotationDelta

    transforms.push({
      position: [currentX, currentY, currentZ],
      rotation: currentRotation,
    })
  }

  return transforms
}

function getFloorplanStairSegmentPolygon(
  stair: StairNode,
  segment: StairSegmentNode,
  transform: StairSegmentTransform,
): Point2D[] {
  const halfWidth = segment.width / 2
  const localCorners: Array<[number, number]> = [
    [-halfWidth, 0],
    [halfWidth, 0],
    [halfWidth, segment.length],
    [-halfWidth, segment.length],
  ]

  return localCorners.map(([localX, localY]) => {
    const [segmentX, segmentY] = rotatePlanVector(localX, localY, transform.rotation)
    const groupX = transform.position[0] + segmentX
    const groupY = transform.position[2] + segmentY
    const [worldOffsetX, worldOffsetY] = rotatePlanVector(groupX, groupY, stair.rotation)

    return {
      x: stair.position[0] + worldOffsetX,
      y: stair.position[2] + worldOffsetY,
    }
  })
}

function buildFloorplanStairEntry(
  stair: StairNode,
  segments: StairSegmentNode[],
): FloorplanStairEntry | null {
  if (segments.length === 0) {
    return null
  }

  const transforms = computeFloorplanStairSegmentTransforms(segments)
  const segmentEntries = segments.map((segment, index) => {
    const polygon = getFloorplanStairSegmentPolygon(stair, segment, transforms[index]!)
    const centerLine = getFloorplanStairSegmentCenterLine(polygon)
    const innerPolygon = getFloorplanStairInnerPolygon(polygon)
    const treadThickness = getFloorplanStairTreadThickness(segment, innerPolygon)

    return {
      centerLine,
      innerPoints: formatPolygonPoints(innerPolygon),
      innerPolygon,
      segment,
      points: formatPolygonPoints(polygon),
      polygon,
      treadBars: getFloorplanStairTreadBars(segment, innerPolygon, treadThickness),
      treadThickness,
    }
  })

  return {
    arrow: buildFloorplanStairArrow(segmentEntries),
    stair,
    segments: segmentEntries,
  }
}

function isPointInsidePolygonWithHoles(
  point: Point2D,
  polygon: Point2D[],
  holes: Point2D[][] = [],
) {
  return (
    isPointInsidePolygon(point, polygon) && !holes.some((hole) => isPointInsidePolygon(point, hole))
  )
}

function isPointNearPlanPoint(a: WallPlanPoint, b: WallPlanPoint, threshold = 0.25) {
  return Math.abs(a[0] - b[0]) < threshold && Math.abs(a[1] - b[1]) < threshold
}

function calculatePolygonSnapPoint(
  lastPoint: WallPlanPoint,
  currentPoint: WallPlanPoint,
): WallPlanPoint {
  const [x1, y1] = lastPoint
  const [x, y] = currentPoint
  const dx = x - x1
  const dy = y - y1
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const horizontalDist = absDy
  const verticalDist = absDx
  const diagonalDist = Math.abs(absDx - absDy)
  const minDist = Math.min(horizontalDist, verticalDist, diagonalDist)

  if (minDist === diagonalDist) {
    const diagonalLength = Math.min(absDx, absDy)
    return [x1 + Math.sign(dx) * diagonalLength, y1 + Math.sign(dy) * diagonalLength]
  }

  if (minDist === horizontalDist) {
    return [x, y1]
  }

  return [x1, y]
}

function snapPolygonDraftPoint({
  point,
  start,
  angleSnap,
}: {
  point: WallPlanPoint
  start?: WallPlanPoint
  angleSnap: boolean
}): WallPlanPoint {
  const snappedPoint: WallPlanPoint = [snapToHalf(point[0]), snapToHalf(point[1])]

  if (!(start && angleSnap)) {
    return snappedPoint
  }

  return calculatePolygonSnapPoint(start, snappedPoint)
}

function pointMatchesWallPlanPoint(
  point: Point2D | undefined,
  planPoint: WallPlanPoint,
  epsilon = 1e-6,
): boolean {
  if (!point) {
    return false
  }

  return Math.abs(point.x - planPoint[0]) <= epsilon && Math.abs(point.y - planPoint[1]) <= epsilon
}

function getWallHoverSidePaths(polygon: Point2D[], wall: WallNode): [string, string] | null {
  if (polygon.length < 4) {
    return null
  }

  const startRight = polygon[0]
  const endRight = polygon[1]
  const hasEndCenterPoint = pointMatchesWallPlanPoint(polygon[2], wall.end)
  const endLeft = polygon[hasEndCenterPoint ? 3 : 2]
  const lastPoint = polygon[polygon.length - 1]
  const hasStartCenterPoint = pointMatchesWallPlanPoint(lastPoint, wall.start)
  const startLeft = polygon[hasStartCenterPoint ? polygon.length - 2 : polygon.length - 1]

  if (!(startRight && endRight && endLeft && startLeft)) {
    return null
  }

  const svgStartRight = toSvgPoint(startRight)
  const svgEndRight = toSvgPoint(endRight)
  const svgStartLeft = toSvgPoint(startLeft)
  const svgEndLeft = toSvgPoint(endLeft)

  return [
    `M ${svgStartRight.x} ${svgStartRight.y} L ${svgEndRight.x} ${svgEndRight.y}`,
    `M ${svgStartLeft.x} ${svgStartLeft.y} L ${svgEndLeft.x} ${svgEndLeft.y}`,
  ]
}

function buildDraftWall(levelId: string, start: WallPlanPoint, end: WallPlanPoint): WallNode {
  return {
    object: 'node',
    id: 'wall_draft' as WallNode['id'],
    type: 'wall',
    name: 'Draft wall',
    parentId: levelId,
    visible: true,
    metadata: {},
    children: [],
    start,
    end,
    frontSide: 'unknown',
    backSide: 'unknown',
  }
}

function pointsEqual(a: WallPlanPoint, b: WallPlanPoint): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

function haveSameIds(currentIds: string[], nextIds: string[]): boolean {
  return (
    currentIds.length === nextIds.length &&
    currentIds.every((currentId, index) => currentId === nextIds[index])
  )
}

function polygonsEqual(a: WallPlanPoint[], b: Array<[number, number]>): boolean {
  return (
    a.length === b.length &&
    a.every((point, index) => {
      const otherPoint = b[index]
      if (!otherPoint) {
        return false
      }

      return pointsEqual(point, otherPoint)
    })
  )
}

function buildWallEndpointDraft(
  wallId: WallNode['id'],
  endpoint: WallEndpoint,
  fixedPoint: WallPlanPoint,
  movingPoint: WallPlanPoint,
): WallEndpointDraft {
  return {
    wallId,
    endpoint,
    start: endpoint === 'start' ? movingPoint : fixedPoint,
    end: endpoint === 'end' ? movingPoint : fixedPoint,
  }
}

function buildWallWithUpdatedEndpoints(
  wall: WallNode,
  start: WallPlanPoint,
  end: WallPlanPoint,
): WallNode {
  return {
    ...wall,
    start,
    end,
  }
}

function getFloorplanWallThickness(wall: WallNode): number {
  const baseThickness = wall.thickness ?? 0.1
  const scaledThickness = baseThickness * FLOORPLAN_WALL_THICKNESS_SCALE

  return Math.min(
    baseThickness + FLOORPLAN_MAX_EXTRA_THICKNESS,
    Math.max(baseThickness, scaledThickness, FLOORPLAN_MIN_VISIBLE_WALL_THICKNESS),
  )
}

function getFloorplanWall(wall: WallNode): WallNode {
  return {
    ...wall,
    // Slightly exaggerate thin walls so the 2D blueprint reads clearly without drifting far from BIM.
    thickness: getFloorplanWallThickness(wall),
  }
}

function getFloorplanFenceThickness(fence: FenceNode): number {
  return Math.max(fence.thickness ?? 0.08, 0.08)
}

type WallMeasurementOverlay = {
  wallId: WallNode['id']
  dimensionLineEnd: { x1: number; y1: number; x2: number; y2: number }
  dimensionLineStart: { x1: number; y1: number; x2: number; y2: number }
  extensionStart: { x1: number; y1: number; x2: number; y2: number }
  extensionEnd: { x1: number; y1: number; x2: number; y2: number }
  label: string
  labelX: number
  labelY: number
  labelAngleDeg: number
  isSelected?: boolean
}

function formatMeasurement(value: number, unit: 'metric' | 'imperial') {
  if (unit === 'imperial') {
    const feet = value * 3.280_84
    const wholeFeet = Math.floor(feet)
    const inches = Math.round((feet - wholeFeet) * 12)
    if (inches === 12) return `${wholeFeet + 1}'0"`
    return `${wholeFeet}'${inches}"`
  }
  return `${Number.parseFloat(value.toFixed(2))}m`
}

function formatLengthInputValue(valueMeters: number, unit: 'metric' | 'imperial') {
  const value = unit === 'imperial' ? valueMeters * 3.280_84 : valueMeters
  return String(Number.parseFloat(value.toFixed(2)))
}

function parseFloorplanLengthInput(
  value: string,
  unit: 'metric' | 'imperial',
  options?: { allowSigned?: boolean },
): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }

  if (options?.allowSigned) {
    if (Math.abs(parsed) <= 1e-6) {
      return null
    }
    return unit === 'imperial' ? parsed / 3.280_84 : parsed
  }

  if (parsed <= 0) {
    return null
  }

  return unit === 'imperial' ? parsed / 3.280_84 : parsed
}

function parseLinearPatternInput(value: string, unit: 'metric' | 'imperial') {
  const parts = value
    .trim()
    .split(/[,\sxX*×]+/)
    .filter(Boolean)
  const spacing = parseFloorplanLengthInput(parts[0] ?? '', unit, { allowSigned: true })
  const count = Number.parseInt(parts[1] ?? String(getDefaultWallLinearPatternCount()), 10)

  if (!(spacing !== null && Number.isFinite(count))) {
    return null
  }

  return { spacing, count }
}

function getNumericInputLabel(operation: WallEditNumericInputState['operation']) {
  if (operation === 'split') {
    return 'Split'
  }

  if (operation === 'offset') {
    return 'Offset'
  }

  if (operation === 'set-length') {
    return 'Length'
  }

  if (operation === 'linear-pattern') {
    return 'Pattern'
  }

  if (operation === 'chamfer') {
    return 'Chamfer'
  }

  return 'Radius'
}

function formatAngleLabel(start: WallPlanPoint, end: WallPlanPoint) {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const angle = Math.atan2(dz, dx)
  const degrees = ((angle * 180) / Math.PI + 360) % 360
  return `${Number.parseFloat(degrees.toFixed(1))} deg`
}

type FloorplanWallSketchFeedbackLayerProps = {
  draftStart: WallPlanPoint | null
  draftEnd: WallPlanPoint | null
  snapResult: WallSketchSnapResult | null
  palette: FloorplanPalette
  unit: 'metric' | 'imperial'
}

const FloorplanWallSketchFeedbackLayer = memo(function FloorplanWallSketchFeedbackLayer({
  draftStart,
  draftEnd,
  snapResult,
  palette,
  unit,
}: FloorplanWallSketchFeedbackLayerProps) {
  if (!draftStart) {
    return null
  }

  const previewEnd = draftEnd ?? snapResult?.point ?? null
  const previewLength = previewEnd
    ? Math.hypot(previewEnd[0] - draftStart[0], previewEnd[1] - draftStart[1])
    : 0
  const hasPreview = previewEnd !== null && isWallLongEnough(draftStart, previewEnd)
  const label =
    hasPreview && previewEnd
      ? `${formatMeasurement(previewLength, unit)}  ${formatAngleLabel(draftStart, previewEnd)}`
      : null
  const labelX = hasPreview && previewEnd ? (toSvgX(draftStart[0]) + toSvgX(previewEnd[0])) / 2 : 0
  const labelY = hasPreview && previewEnd ? (toSvgY(draftStart[1]) + toSvgY(previewEnd[1])) / 2 : 0
  const labelWidth = label
    ? Math.max(0.9, label.length * FLOORPLAN_WALL_SKETCH_LABEL_FONT_SIZE * 0.58)
    : 0
  const labelHeight =
    FLOORPLAN_WALL_SKETCH_LABEL_FONT_SIZE + FLOORPLAN_WALL_SKETCH_LABEL_PADDING_Y * 2

  return (
    <g className="wall-sketch-feedback" pointerEvents="none">
      {snapResult?.guideLines.map((guide, index) => (
        <line
          key={`wall-sketch-guide-${index}`}
          stroke={palette.draftStroke}
          strokeDasharray={guide.kind === 'alignment' ? '0.08 0.1' : '0.2 0.14'}
          strokeLinecap="round"
          strokeOpacity={guide.kind === 'alignment' ? 0.36 : 0.5}
          strokeWidth={guide.kind === 'alignment' ? '0.04' : '0.05'}
          vectorEffect="non-scaling-stroke"
          x1={toSvgX(guide.start[0])}
          x2={toSvgX(guide.end[0])}
          y1={toSvgY(guide.start[1])}
          y2={toSvgY(guide.end[1])}
        />
      ))}

      <circle
        cx={toSvgX(draftStart[0])}
        cy={toSvgY(draftStart[1])}
        fill={palette.anchor}
        fillOpacity={0.95}
        r={FLOORPLAN_WALL_SKETCH_TARGET_RADIUS}
        stroke={palette.surface}
        strokeOpacity={0.9}
        strokeWidth="0.04"
        vectorEffect="non-scaling-stroke"
      />

      {snapResult?.target && (
        <circle
          cx={toSvgX(snapResult.target.point[0])}
          cy={toSvgY(snapResult.target.point[1])}
          fill="none"
          r={FLOORPLAN_WALL_SKETCH_TARGET_RADIUS * 1.45}
          stroke={palette.draftStroke}
          strokeOpacity={0.9}
          strokeWidth="0.05"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {label && hasPreview && (
        <g transform={`translate(${labelX} ${labelY})`}>
          <rect
            fill={palette.surface}
            fillOpacity={0.92}
            height={labelHeight}
            rx={0.08}
            stroke={palette.draftStroke}
            strokeOpacity={0.35}
            strokeWidth="0.02"
            vectorEffect="non-scaling-stroke"
            width={labelWidth + FLOORPLAN_WALL_SKETCH_LABEL_PADDING_X * 2}
            x={-(labelWidth / 2 + FLOORPLAN_WALL_SKETCH_LABEL_PADDING_X)}
            y={-(labelHeight + 0.14)}
          />
          <text
            dominantBaseline="middle"
            fill={palette.measurementStroke}
            fontSize={FLOORPLAN_WALL_SKETCH_LABEL_FONT_SIZE}
            fontWeight={700}
            textAnchor="middle"
            x={0}
            y={-(labelHeight / 2 + 0.14)}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  )
})

function getPolygonAreaAndCentroid(polygon: Point2D[]) {
  let cx = 0
  let cy = 0
  let area = 0

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p1 = polygon[j]!
    const p2 = polygon[i]!
    const f = p1.x * p2.y - p2.x * p1.y
    cx += (p1.x + p2.x) * f
    cy += (p1.y + p2.y) * f
    area += f
  }

  area /= 2

  if (Math.abs(area) < 1e-9) {
    return { area: 0, centroid: polygon[0] ?? { x: 0, y: 0 } }
  }

  cx /= 6 * area
  cy /= 6 * area

  return { area: Math.abs(area), centroid: { x: cx, y: cy } }
}

function getSlabArea(polygon: Point2D[], holes: Point2D[][]) {
  const outer = getPolygonAreaAndCentroid(polygon)
  let totalArea = outer.area
  for (const hole of holes) {
    totalArea -= getPolygonAreaAndCentroid(hole).area
  }
  return { area: Math.max(0, totalArea), centroid: outer.centroid }
}

function formatArea(areaSqM: number, unit: 'metric' | 'imperial') {
  if (unit === 'imperial') {
    const areaSqFt = areaSqM * 10.763_910_4
    return (
      <>
        {Math.round(areaSqFt).toLocaleString()} ft
        <tspan baselineShift="super" fontSize="0.75em">
          2
        </tspan>
      </>
    )
  }
  return (
    <>
      {Number.parseFloat(areaSqM.toFixed(1))} m
      <tspan baselineShift="super" fontSize="0.75em">
        2
      </tspan>
    </>
  )
}

function FloorplanMeasurementLine({
  palette,
  segment,
  isSelected,
}: {
  palette: FloorplanPalette
  segment: { x1: number; y1: number; x2: number; y2: number }
  isSelected?: boolean
}) {
  const lineOpacity = isSelected
    ? FLOORPLAN_MEASUREMENT_LINE_OPACITY
    : FLOORPLAN_MEASUREMENT_LINE_OPACITY * 0.4
  const outlineOpacity = isSelected
    ? FLOORPLAN_MEASUREMENT_LINE_OUTLINE_OPACITY
    : FLOORPLAN_MEASUREMENT_LINE_OUTLINE_OPACITY * 0.4

  return (
    <>
      <line
        shapeRendering="geometricPrecision"
        stroke={palette.surface}
        strokeLinecap="round"
        strokeOpacity={outlineOpacity}
        strokeWidth={FLOORPLAN_MEASUREMENT_LINE_OUTLINE_WIDTH}
        vectorEffect="non-scaling-stroke"
        x1={segment.x1}
        x2={segment.x2}
        y1={segment.y1}
        y2={segment.y2}
      />
      <line
        shapeRendering="geometricPrecision"
        stroke={palette.measurementStroke}
        strokeLinecap="round"
        strokeOpacity={lineOpacity}
        strokeWidth={FLOORPLAN_MEASUREMENT_LINE_WIDTH}
        vectorEffect="non-scaling-stroke"
        x1={segment.x1}
        x2={segment.x2}
        y1={segment.y1}
        y2={segment.y2}
      />
    </>
  )
}

const FloorplanPerimeterGuideLayer = memo(function FloorplanPerimeterGuideLayer({
  guides,
  palette,
}: {
  guides: PerimeterGuide[]
  palette: FloorplanPalette
}) {
  if (!guides.length) return null

  return (
    <>
      {guides.map((guide) => {
        const startX = toSvgX(guide.start[0])
        const startY = toSvgY(guide.start[2])
        const endX = toSvgX(guide.end[0])
        const endY = toSvgY(guide.end[2])
        const labelX = (startX + endX) / 2
        const labelY = (startY + endY) / 2 - 0.08
        const angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI
        const labelAngleDeg = angle > 90 ? angle - 180 : angle <= -90 ? angle + 180 : angle
        const referenceStartX = guide.referenceStart ? toSvgX(guide.referenceStart[0]) : null
        const referenceStartY = guide.referenceStart ? toSvgY(guide.referenceStart[2]) : null
        const referenceEndX = guide.referenceEnd ? toSvgX(guide.referenceEnd[0]) : null
        const referenceEndY = guide.referenceEnd ? toSvgY(guide.referenceEnd[2]) : null

        return (
          <g data-delivery-role="perimeter-guides" key={guide.id} pointerEvents="none">
            {referenceStartX !== null &&
            referenceStartY !== null &&
            referenceEndX !== null &&
            referenceEndY !== null ? (
              <line
                stroke={palette.measurementStroke}
                strokeDasharray="0.12 0.1"
                strokeOpacity={0.28}
                strokeWidth="0.03"
                vectorEffect="non-scaling-stroke"
                x1={referenceStartX}
                x2={referenceEndX}
                y1={referenceStartY}
                y2={referenceEndY}
              />
            ) : null}
            <line
              stroke={palette.measurementStroke}
              strokeDasharray={guide.kind === 'setback' ? '0.14 0.08' : undefined}
              strokeOpacity={guide.kind === 'setback' ? 0.72 : 0.9}
              strokeWidth="0.04"
              vectorEffect="non-scaling-stroke"
              x1={startX}
              x2={endX}
              y1={startY}
              y2={endY}
            />
            <text
              dominantBaseline="central"
              fill={palette.measurementStroke}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
              fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE * 0.92}
              fontWeight="600"
              paintOrder="stroke"
              stroke={palette.surface}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
              textAnchor="middle"
              transform={`rotate(${labelAngleDeg} ${labelX} ${labelY})`}
              x={labelX}
              y={labelY}
            >
              {guide.label} {guide.formattedValue}
            </text>
          </g>
        )
      })}
    </>
  )
})

function getWallMeasurementOverlay(
  wall: WallNode,
  centerX: number,
  centerZ: number,
  unit: 'metric' | 'imperial',
): WallMeasurementOverlay | null {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = getWallCurveLength(wall)

  if (length < 0.1) {
    return null
  }

  const nx = -dz / length
  const nz = dx / length
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2
  const cx = midX - centerX
  const cz = midZ - centerZ
  const dot = cx * nx + cz * nz
  const outX = dot >= 0 ? nx : -nx
  const outZ = dot >= 0 ? nz : -nz
  const label = formatMeasurement(length, unit)
  const dimensionLine = {
    x1: toSvgX(wall.start[0] + outX * FLOORPLAN_MEASUREMENT_OFFSET),
    y1: toSvgY(wall.start[1] + outZ * FLOORPLAN_MEASUREMENT_OFFSET),
    x2: toSvgX(wall.end[0] + outX * FLOORPLAN_MEASUREMENT_OFFSET),
    y2: toSvgY(wall.end[1] + outZ * FLOORPLAN_MEASUREMENT_OFFSET),
  }

  const extensionStart = {
    x1: toSvgX(wall.start[0]),
    y1: toSvgY(wall.start[1]),
    x2: toSvgX(
      wall.start[0] +
        outX * (FLOORPLAN_MEASUREMENT_OFFSET + FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT),
    ),
    y2: toSvgY(
      wall.start[1] +
        outZ * (FLOORPLAN_MEASUREMENT_OFFSET + FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT),
    ),
  }

  const extensionEnd = {
    x1: toSvgX(wall.end[0]),
    y1: toSvgY(wall.end[1]),
    x2: toSvgX(
      wall.end[0] +
        outX * (FLOORPLAN_MEASUREMENT_OFFSET + FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT),
    ),
    y2: toSvgY(
      wall.end[1] +
        outZ * (FLOORPLAN_MEASUREMENT_OFFSET + FLOORPLAN_MEASUREMENT_EXTENSION_OVERSHOOT),
    ),
  }

  const svgDx = dimensionLine.x2 - dimensionLine.x1
  const svgDy = dimensionLine.y2 - dimensionLine.y1
  const svgLength = Math.hypot(svgDx, svgDy)
  let labelAngleDeg = (Math.atan2(svgDy, svgDx) * 180) / Math.PI

  if (labelAngleDeg > 90) {
    labelAngleDeg -= 180
  } else if (labelAngleDeg <= -90) {
    labelAngleDeg += 180
  }

  if (svgLength < 1e-6) {
    return null
  }

  const dirSvgX = svgDx / svgLength
  const dirSvgY = svgDy / svgLength
  const labelGapHalf = Math.min(
    FLOORPLAN_MEASUREMENT_LABEL_GAP / 2,
    Math.max(0, svgLength / 2 - FLOORPLAN_MEASUREMENT_LABEL_LINE_PADDING),
  )
  const labelX = (dimensionLine.x1 + dimensionLine.x2) / 2
  const labelY = (dimensionLine.y1 + dimensionLine.y2) / 2
  const dimensionLineStart = {
    x1: dimensionLine.x1,
    y1: dimensionLine.y1,
    x2: labelX - dirSvgX * labelGapHalf,
    y2: labelY - dirSvgY * labelGapHalf,
  }
  const dimensionLineEnd = {
    x1: labelX + dirSvgX * labelGapHalf,
    y1: labelY + dirSvgY * labelGapHalf,
    x2: dimensionLine.x2,
    y2: dimensionLine.y2,
  }

  return {
    wallId: wall.id,
    dimensionLineEnd,
    dimensionLineStart,
    extensionStart,
    extensionEnd,
    label,
    labelX,
    labelY,
    labelAngleDeg,
  }
}

function getOpeningFootprint(wall: WallNode, node: WindowNode | DoorNode): Point2D[] {
  const [x1, z1] = wall.start
  const [x2, z2] = wall.end

  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.sqrt(dx * dx + dz * dz)

  if (length < 1e-9) {
    return []
  }

  const dirX = dx / length
  const dirZ = dz / length

  const perpX = -dirZ
  const perpZ = dirX

  const distance = node.position[0]
  const width = node.width
  const depth = wall.thickness ?? 0.1

  const cx = x1 + dirX * distance
  const cz = z1 + dirZ * distance

  const halfWidth = width / 2
  const halfDepth = depth / 2

  return [
    {
      x: cx - dirX * halfWidth + perpX * halfDepth,
      y: cz - dirZ * halfWidth + perpZ * halfDepth,
    },
    {
      x: cx + dirX * halfWidth + perpX * halfDepth,
      y: cz + dirZ * halfWidth + perpZ * halfDepth,
    },
    {
      x: cx + dirX * halfWidth - perpX * halfDepth,
      y: cz + dirZ * halfWidth - perpZ * halfDepth,
    },
    {
      x: cx - dirX * halfWidth - perpX * halfDepth,
      y: cz - dirZ * halfWidth - perpZ * halfDepth,
    },
  ]
}

function getOpeningCenterLine(polygon: Point2D[]) {
  if (polygon.length < 4) {
    return null
  }

  const [p1, p2, p3, p4] = polygon

  return {
    start: {
      x: (p1!.x + p4!.x) / 2,
      y: (p1!.y + p4!.y) / 2,
    },
    end: {
      x: (p2!.x + p3!.x) / 2,
      y: (p2!.y + p3!.y) / 2,
    },
  }
}

function normalizeGridCoordinate(value: number): number {
  return Number(value.toFixed(GRID_COORDINATE_PRECISION))
}

function isGridAligned(value: number, step: number): boolean {
  if (!(Number.isFinite(step) && step > 0)) {
    return false
  }

  const normalizedValue = normalizeGridCoordinate(value / step)
  return Math.abs(normalizedValue - Math.round(normalizedValue)) < 1e-4
}

// Keep visible grid spacing above a minimum pixel size so zooming stays evenly distributed.
function getVisibleGridSteps(
  viewportWidth: number,
  surfaceWidth: number,
): {
  minorStep: number
  majorStep: number
} {
  const pixelsPerUnit = surfaceWidth / Math.max(viewportWidth, Number.EPSILON)
  let minorStep = WALL_GRID_STEP

  while (minorStep * pixelsPerUnit < MIN_GRID_SCREEN_SPACING) {
    minorStep *= 2
  }

  return {
    minorStep,
    majorStep: Math.max(MAJOR_GRID_STEP, minorStep * 2),
  }
}

function buildGridPath(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  step: number,
  options?: {
    excludeStep?: number
  },
): string {
  if (!(Number.isFinite(step) && step > 0)) {
    return ''
  }

  const commands: string[] = []
  const startXIndex = Math.floor(minX / step)
  const endXIndex = Math.ceil(maxX / step)
  const startYIndex = Math.floor(minY / step)
  const endYIndex = Math.ceil(maxY / step)
  const gridMinX = normalizeGridCoordinate(minX)
  const gridMaxX = normalizeGridCoordinate(maxX)
  const gridMinY = normalizeGridCoordinate(minY)
  const gridMaxY = normalizeGridCoordinate(maxY)

  for (let index = startXIndex; index <= endXIndex; index += 1) {
    const x = index * step
    if (options?.excludeStep && isGridAligned(x, options.excludeStep)) {
      continue
    }

    const gridX = normalizeGridCoordinate(x)
    commands.push(`M ${gridX} ${gridMinY} L ${gridX} ${gridMaxY}`)
  }

  for (let index = startYIndex; index <= endYIndex; index += 1) {
    const y = index * step
    if (options?.excludeStep && isGridAligned(y, options.excludeStep)) {
      continue
    }

    const gridY = normalizeGridCoordinate(y)
    commands.push(`M ${gridMinX} ${gridY} L ${gridMaxX} ${gridY}`)
  }

  return commands.join(' ')
}

function findClosestWallPoint(
  point: WallPlanPoint,
  walls: WallNode[],
  options?: {
    maxDistance?: number
    canUseWall?: (wall: WallNode) => boolean
  },
): {
  wall: WallNode
  point: WallPlanPoint
  t: number
  normal: [number, number, number]
} | null {
  const maxDistance = options?.maxDistance ?? 0.5
  const canUseWall = options?.canUseWall

  let best: {
    wall: WallNode
    point: WallPlanPoint
    t: number
    normal: [number, number, number]
  } | null = null
  let bestDistSq = maxDistance * maxDistance

  for (const wall of walls) {
    if (canUseWall && !canUseWall(wall)) {
      continue
    }

    const [x1, z1] = wall.start
    const [x2, z2] = wall.end
    const dx = x2 - x1
    const dz = z2 - z1
    const lengthSq = dx * dx + dz * dz
    if (lengthSq < 1e-9) continue

    let t = ((point[0] - x1) * dx + (point[1] - z1) * dz) / lengthSq
    t = Math.max(0, Math.min(1, t))

    const px = x1 + t * dx
    const pz = z1 + t * dz

    const distSq = (point[0] - px) ** 2 + (point[1] - pz) ** 2
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      // Provide an arbitrary front-facing normal so the tool knows it's a valid wall side
      best = { wall, point: [px, pz], t, normal: [0, 0, 1] }
    }
  }

  return best
}

type GuideImageDimensions = {
  width: number
  height: number
}

function useResolvedAssetUrl(url: string) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!url) {
      setResolvedUrl(null)
      return
    }

    let cancelled = false
    setResolvedUrl(null)

    loadAssetUrl(url).then((nextUrl) => {
      if (!cancelled) {
        setResolvedUrl(nextUrl)
      }
    })

    return () => {
      cancelled = true
    }
  }, [url])

  return resolvedUrl
}

function useGuideImageDimensions(url: string | null) {
  const [dimensions, setDimensions] = useState<GuideImageDimensions | null>(null)

  useEffect(() => {
    if (!url) {
      setDimensions(null)
      return
    }

    let cancelled = false
    const image = new globalThis.Image()

    image.onload = () => {
      if (cancelled) {
        return
      }

      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height

      if (!(width > 0 && height > 0)) {
        setDimensions(null)
        return
      }

      setDimensions({ width, height })
    }

    image.onerror = () => {
      if (!cancelled) {
        setDimensions(null)
      }
    }

    image.src = url

    return () => {
      cancelled = true
    }
  }, [url])

  return dimensions
}

function FloorplanGuideImage({
  guide,
  isInteractive,
  isCalibrationActive,
  isDetectionRegionActive,
  isSelected,
  activeInteractionMode,
  onGuideCalibrationPoint,
  onGuideDetectionRegionStart,
  onGuideSelect,
  onGuideTranslateStart,
}: {
  guide: GuideNode
  isInteractive: boolean
  isCalibrationActive: boolean
  isDetectionRegionActive: boolean
  isSelected: boolean
  activeInteractionMode: GuideInteractionMode | null
  onGuideCalibrationPoint: (
    guide: GuideNode,
    dimensions: GuideImageDimensions,
    event: ReactPointerEvent<SVGRectElement>,
  ) => void
  onGuideDetectionRegionStart: (
    guide: GuideNode,
    dimensions: GuideImageDimensions,
    event: ReactPointerEvent<SVGRectElement>,
  ) => void
  onGuideSelect: (guideId: GuideNode['id']) => void
  onGuideTranslateStart: (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => void
}) {
  const resolvedUrl = useResolvedAssetUrl(guide.url)
  const dimensions = useGuideImageDimensions(resolvedUrl)

  if (!(guide.opacity > 0 && guide.scale > 0 && resolvedUrl && dimensions)) {
    return null
  }

  const aspectRatio = dimensions.width / dimensions.height
  const planWidth = getGuideWidth(guide.scale)
  const planHeight = getGuideHeight(planWidth, aspectRatio)
  const centerX = toSvgX(guide.position[0])
  const centerY = toSvgY(guide.position[2])
  const rotationDeg = (-guide.rotation[1] * 180) / Math.PI

  return (
    <g
      opacity={clamp(guide.opacity / 100, 0, 1)}
      transform={`translate(${centerX} ${centerY}) rotate(${rotationDeg})`}
    >
      {isInteractive ? (
        <rect
          fill="transparent"
          height={planHeight}
          onClick={(event) => {
            event.stopPropagation()
            onGuideSelect(guide.id)
          }}
          onPointerDown={(event) => {
            if (event.button === 0) {
              event.stopPropagation()
              if (isCalibrationActive) {
                onGuideCalibrationPoint(guide, dimensions, event)
                return
              }
              if (isDetectionRegionActive) {
                onGuideDetectionRegionStart(guide, dimensions, event)
                return
              }
              if (isSelected) {
                onGuideTranslateStart(guide, event)
              }
            }
          }}
          pointerEvents="all"
          style={{
            cursor: isCalibrationActive
              ? 'crosshair'
              : isDetectionRegionActive
                ? 'crosshair'
                : isSelected && activeInteractionMode === 'translate'
                  ? 'grabbing'
                  : isSelected && !guide.locked
                    ? 'grab'
                    : 'pointer',
          }}
          width={planWidth}
          x={-planWidth / 2}
          y={-planHeight / 2}
        />
      ) : null}
      <image
        height={planHeight}
        href={resolvedUrl}
        pointerEvents="none"
        preserveAspectRatio="none"
        transform="rotate(180)"
        width={planWidth}
        x={-planWidth / 2}
        y={-planHeight / 2}
      />
    </g>
  )
}

const FloorplanGridLayer = memo(function FloorplanGridLayer({
  majorGridPath,
  minorGridPath,
  palette,
  showGrid,
}: {
  majorGridPath: string
  minorGridPath: string
  palette: FloorplanPalette
  showGrid: boolean
}) {
  if (!showGrid) {
    return null
  }

  return (
    <>
      <path
        d={minorGridPath}
        fill="none"
        opacity={palette.minorGridOpacity}
        shapeRendering="crispEdges"
        stroke={palette.minorGrid}
        strokeWidth="0.02"
        vectorEffect="non-scaling-stroke"
      />

      <path
        d={majorGridPath}
        fill="none"
        opacity={palette.majorGridOpacity}
        shapeRendering="crispEdges"
        stroke={palette.majorGrid}
        strokeWidth="0.04"
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
})

const FloorplanGuideLayer = memo(function FloorplanGuideLayer({
  guides,
  isInteractive,
  calibrationGuideId,
  detectionRegionGuideId,
  selectedGuideId,
  activeGuideInteractionGuideId,
  activeGuideInteractionMode,
  onGuideCalibrationPoint,
  onGuideDetectionRegionStart,
  onGuideSelect,
  onGuideTranslateStart,
}: {
  guides: GuideNode[]
  isInteractive: boolean
  calibrationGuideId: GuideNode['id'] | null
  detectionRegionGuideId: GuideNode['id'] | null
  selectedGuideId: GuideNode['id'] | null
  activeGuideInteractionGuideId: GuideNode['id'] | null
  activeGuideInteractionMode: GuideInteractionMode | null
  onGuideCalibrationPoint: (
    guide: GuideNode,
    dimensions: GuideImageDimensions,
    event: ReactPointerEvent<SVGRectElement>,
  ) => void
  onGuideDetectionRegionStart: (
    guide: GuideNode,
    dimensions: GuideImageDimensions,
    event: ReactPointerEvent<SVGRectElement>,
  ) => void
  onGuideSelect: (guideId: GuideNode['id']) => void
  onGuideTranslateStart: (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => void
}) {
  if (!guides.length) {
    return null
  }

  const orderedGuides =
    selectedGuideId && guides.some((guide) => guide.id === selectedGuideId)
      ? [
          ...guides.filter((guide) => guide.id !== selectedGuideId),
          guides.find((guide) => guide.id === selectedGuideId)!,
        ]
      : guides

  return (
    <>
      {orderedGuides.map((guide) => (
        <FloorplanGuideImage
          activeInteractionMode={
            activeGuideInteractionGuideId === guide.id ? activeGuideInteractionMode : null
          }
          guide={guide}
          isCalibrationActive={calibrationGuideId === guide.id}
          isDetectionRegionActive={detectionRegionGuideId === guide.id}
          isInteractive={isInteractive}
          isSelected={selectedGuideId === guide.id}
          key={guide.id}
          onGuideCalibrationPoint={onGuideCalibrationPoint}
          onGuideDetectionRegionStart={onGuideDetectionRegionStart}
          onGuideSelect={onGuideSelect}
          onGuideTranslateStart={onGuideTranslateStart}
        />
      ))}
    </>
  )
})

function FloorplanGuideSelectionOverlay({
  guide,
  isDarkMode,
  rotationModifierPressed,
  showHandles,
  onCornerHoverChange,
  onCornerPointerDown,
}: {
  guide: GuideNode | null
  isDarkMode: boolean
  rotationModifierPressed: boolean
  showHandles: boolean
  onCornerHoverChange: (corner: GuideCorner | null) => void
  onCornerPointerDown: (
    guide: GuideNode,
    dimensions: GuideImageDimensions,
    corner: GuideCorner,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
}) {
  const resolvedUrl = useResolvedAssetUrl(guide?.url ?? '')
  const dimensions = useGuideImageDimensions(resolvedUrl)

  if (!(guide && guide.opacity > 0 && guide.scale > 0 && resolvedUrl && dimensions)) {
    return null
  }

  const aspectRatio = dimensions.width / dimensions.height
  const planWidth = getGuideWidth(guide.scale)
  const planHeight = getGuideHeight(planWidth, aspectRatio)
  const centerX = toSvgX(guide.position[0])
  const centerY = toSvgY(guide.position[2])
  const rotationDeg = (-guide.rotation[1] * 180) / Math.PI
  const selectionStroke = 'var(--editor-floorplan-selected-stroke)'
  const handleFill = 'var(--editor-floorplan-handle-fill)'
  const handleStroke = 'var(--editor-floorplan-handle-stroke)'

  return (
    <g transform={`translate(${centerX} ${centerY}) rotate(${rotationDeg})`}>
      <rect
        fill="none"
        height={planHeight}
        pointerEvents="none"
        stroke={selectionStroke}
        strokeDasharray="none"
        strokeLinejoin="round"
        strokeWidth={FLOORPLAN_GUIDE_SELECTION_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        width={planWidth}
        x={-planWidth / 2}
        y={-planHeight / 2}
      />

      {showHandles
        ? GUIDE_CORNERS.map((corner) => {
            const [x, y] = getGuideCornerLocalOffset(planWidth, planHeight, corner)

            return (
              <g key={corner}>
                <rect
                  fill={handleFill}
                  height={FLOORPLAN_GUIDE_HANDLE_SIZE}
                  pointerEvents="none"
                  rx={FLOORPLAN_GUIDE_HANDLE_SIZE * 0.22}
                  ry={FLOORPLAN_GUIDE_HANDLE_SIZE * 0.22}
                  stroke={handleStroke}
                  strokeWidth="0.04"
                  vectorEffect="non-scaling-stroke"
                  width={FLOORPLAN_GUIDE_HANDLE_SIZE}
                  x={x - FLOORPLAN_GUIDE_HANDLE_SIZE / 2}
                  y={y - FLOORPLAN_GUIDE_HANDLE_SIZE / 2}
                />
                <circle
                  cx={x}
                  cy={y}
                  fill="transparent"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onPointerDown={(event) => onCornerPointerDown(guide, dimensions, corner, event)}
                  onPointerEnter={() => onCornerHoverChange(corner)}
                  onPointerLeave={() => onCornerHoverChange(null)}
                  pointerEvents="all"
                  r={FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS}
                  stroke="transparent"
                  strokeWidth={FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS * 2}
                  style={{
                    cursor: rotationModifierPressed
                      ? getGuideRotateCursor(isDarkMode)
                      : getGuideResizeCursor(corner, -guide.rotation[1]),
                  }}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })
        : null}
    </g>
  )
}

function FloorplanGuideHandleHint({
  anchor,
  isDarkMode,
  isMacPlatform,
  rotationModifierPressed,
}: {
  anchor: GuideHandleHintAnchor | null
  isDarkMode: boolean
  isMacPlatform: boolean
  rotationModifierPressed: boolean
}) {
  if (!anchor) {
    return null
  }

  const primaryToneClass = isDarkMode
    ? 'text-foreground drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.5)]'
    : 'text-foreground drop-shadow-[0_1px_1.5px_rgba(255,255,255,0.8)]'

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute z-20 select-none', primaryToneClass)}
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: `translate(calc(-50% + ${anchor.directionX * 12}px), calc(-50% + ${anchor.directionY * 12}px))`,
      }}
    >
      <div className="flex flex-col gap-0.5">
        <div
          className={cn(
            'flex items-center gap-1.5 transition-opacity duration-150',
            rotationModifierPressed ? 'opacity-40' : 'opacity-100',
          )}
        >
          <span className="font-medium text-[11px] lowercase leading-none">resize</span>
          <img
            alt=""
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 object-contain"
            src="/icons/mouse-left.svg"
          />
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 transition-opacity duration-150',
            rotationModifierPressed ? 'opacity-100' : 'opacity-40',
          )}
        >
          <span className="font-medium text-[11px] lowercase leading-none">rotate</span>
          {isMacPlatform ? (
            <Command aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          ) : (
            <span className="font-mono text-[10px] uppercase leading-none">ctrl</span>
          )}
          <img
            alt=""
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 object-contain"
            src="/icons/mouse-left.svg"
          />
        </div>
      </div>
    </div>
  )
}

function FloorplanGuideCalibrationOverlay({
  guide,
  points,
}: {
  guide: GuideNode | null
  points: Array<[number, number]>
}) {
  const resolvedUrl = useResolvedAssetUrl(guide?.url ?? '')
  const dimensions = useGuideImageDimensions(resolvedUrl)

  if (!(guide && dimensions && points.length > 0)) {
    return null
  }

  const aspectRatio = dimensions.width / dimensions.height
  const planWidth = getGuideWidth(guide.scale)
  const planHeight = getGuideHeight(planWidth, aspectRatio)
  const centerX = toSvgX(guide.position[0])
  const centerY = toSvgY(guide.position[2])
  const rotationDeg = (-guide.rotation[1] * 180) / Math.PI
  const displayPoints = points.map(flipGuideImageLocalPoint)
  const labelPoint = displayPoints[displayPoints.length - 1]!
  const label =
    guide.calibration && points.length >= 2
      ? `${guide.calibration.distance.toFixed(2)} m`
      : '校准点'

  return (
    <g
      data-delivery-role="guide-calibration"
      transform={`translate(${centerX} ${centerY}) rotate(${rotationDeg})`}
    >
      <rect
        fill="none"
        height={planHeight}
        pointerEvents="none"
        stroke="rgba(37, 99, 235, 0.2)"
        strokeWidth="0.02"
        width={planWidth}
        x={-planWidth / 2}
        y={-planHeight / 2}
      />
      {points.length >= 2 ? (
        <line
          pointerEvents="none"
          stroke="#2563eb"
          strokeDasharray="0.12 0.08"
          strokeWidth="0.04"
          vectorEffect="non-scaling-stroke"
          x1={displayPoints[0]?.[0]}
          x2={displayPoints[1]?.[0]}
          y1={displayPoints[0]?.[1]}
          y2={displayPoints[1]?.[1]}
        />
      ) : null}
      {displayPoints.map((point, index) => (
        <circle
          cx={point[0]}
          cy={point[1]}
          fill={index === points.length - 1 ? '#2563eb' : '#93c5fd'}
          key={`${point[0]}:${point[1]}:${index}`}
          pointerEvents="none"
          r={FLOORPLAN_GUIDE_HANDLE_SIZE * 0.34}
          stroke="#eff6ff"
          strokeWidth="0.03"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <text
        dominantBaseline="central"
        fill="#1d4ed8"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE * 0.8}
        fontWeight="700"
        paintOrder="stroke"
        pointerEvents="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
        textAnchor="middle"
        x={labelPoint[0]}
        y={labelPoint[1] - FLOORPLAN_GUIDE_HANDLE_SIZE * 0.9}
      >
        {label}
      </text>
    </g>
  )
}

function FloorplanGuideDetectionRegionOverlay({
  activeLabel,
  guide,
  draft,
  label,
}: {
  activeLabel: string
  guide: GuideNode | null
  draft: GuideDetectionRegionDraft | null
  label: string
}) {
  const resolvedUrl = useResolvedAssetUrl(guide?.url ?? '')
  const dimensions = useGuideImageDimensions(resolvedUrl)

  if (!(guide && dimensions)) {
    return null
  }

  const localBounds =
    draft?.guideId === guide.id
      ? getGuideDetectionRegionLocalBounds(
          guide,
          dimensions,
          getGuideDetectionRegionFromLocalBounds(guide, dimensions, draft.start, draft.end) ??
            undefined,
        )
      : getGuideDetectionRegionLocalBounds(guide, dimensions, guide.detectionRegion)

  if (!localBounds) {
    return null
  }

  const centerX = toSvgX(guide.position[0])
  const centerY = toSvgY(guide.position[2])
  const rotationDeg = (-guide.rotation[1] * 180) / Math.PI
  const isDraft = draft?.guideId === guide.id
  const displayBounds = getGuideDisplayBoundsFromImageBounds(localBounds)

  return (
    <g
      data-delivery-role="guide-detection-region"
      transform={`translate(${centerX} ${centerY}) rotate(${rotationDeg})`}
    >
      <rect
        fill={isDraft ? 'rgba(37, 99, 235, 0.08)' : 'rgba(14, 165, 233, 0.06)'}
        height={displayBounds.height}
        pointerEvents="none"
        stroke={isDraft ? '#2563eb' : '#0284c7'}
        strokeDasharray={isDraft ? '0.14 0.08' : '0.1 0.06'}
        strokeWidth="0.04"
        vectorEffect="non-scaling-stroke"
        width={displayBounds.width}
        x={displayBounds.x}
        y={displayBounds.y}
      />
      <text
        dominantBaseline="hanging"
        fill={isDraft ? '#1d4ed8' : '#0369a1'}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE * 0.72}
        fontWeight="700"
        paintOrder="stroke"
        pointerEvents="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
        textAnchor="start"
        x={displayBounds.x}
        y={displayBounds.y - FLOORPLAN_GUIDE_HANDLE_SIZE * 0.8}
      >
        {isDraft ? activeLabel : label}
      </text>
    </g>
  )
}

const FloorplanGuideDetectionOverlay = memo(function FloorplanGuideDetectionOverlay({
  candidates,
}: {
  candidates: GuideDetectionCandidates
}) {
  const setDetectionWallSelected = useDeliveryStore((state) => state.setDetectionWallSelected)
  const setDetectionOpeningSelected = useDeliveryStore((state) => state.setDetectionOpeningSelected)
  const hoveredDetectionCandidateId = useDeliveryStore((state) => state.hoveredDetectionCandidateId)
  const setHoveredDetectionCandidateId = useDeliveryStore(
    (state) => state.setHoveredDetectionCandidateId,
  )
  const wallById = new Map(candidates.walls.map((wall) => [wall.id, wall] as const))
  const selectedWallIds = new Set(
    candidates.selectedWallIds ?? candidates.walls.map((wall) => wall.id),
  )
  const selectedOpeningIds = new Set(
    candidates.selectedOpeningIds ?? candidates.openings.map((opening) => opening.id),
  )

  return (
    <g data-delivery-role="guide-detection">
      {candidates.walls.map((wall, wallIndex) => {
        const isApplied = Boolean(candidates.appliedWallIds?.[wall.id])
        const isSelected = selectedWallIds.has(wall.id)
        const isHovered =
          hoveredDetectionCandidateId === wall.id ||
          candidates.openings.some(
            (opening) =>
              opening.id === hoveredDetectionCandidateId && opening.wallCandidateId === wall.id,
          )
        const strokeColor = isApplied ? '#16a34a' : '#f97316'
        const deltaX = wall.end[0] - wall.start[0]
        const deltaY = wall.end[1] - wall.start[1]
        const wallLength = Math.hypot(deltaX, deltaY)
        const labelOffset = 0.22
        const labelCenter = {
          x: toSvgX(
            (wall.start[0] + wall.end[0]) / 2 -
              (wallLength > 0 ? (deltaY / wallLength) * labelOffset : 0),
          ),
          y: toSvgY(
            (wall.start[1] + wall.end[1]) / 2 +
              (wallLength > 0 ? (deltaX / wallLength) * labelOffset : 0),
          ),
        }

        return (
          <g key={wall.id}>
            <line
              opacity={isHovered ? 0.48 : isSelected ? 0.3 : 0.1}
              pointerEvents="none"
              stroke={strokeColor}
              strokeWidth={isHovered ? '10' : '8'}
              vectorEffect="non-scaling-stroke"
              x1={toSvgX(wall.start[0])}
              x2={toSvgX(wall.end[0])}
              y1={toSvgY(wall.start[1])}
              y2={toSvgY(wall.end[1])}
            />
            <line
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setDetectionWallSelected(wall.id, !isSelected)
              }}
              onPointerEnter={() => setHoveredDetectionCandidateId(wall.id)}
              onPointerLeave={() => setHoveredDetectionCandidateId(null)}
              opacity={isHovered ? 1 : isSelected ? 1 : 0.32}
              pointerEvents="stroke"
              stroke={strokeColor}
              strokeDasharray={isApplied || isSelected ? undefined : '10 7'}
              strokeLinecap="round"
              strokeWidth={isHovered ? '4' : '3'}
              style={{ cursor: 'pointer' }}
              vectorEffect="non-scaling-stroke"
              x1={toSvgX(wall.start[0])}
              x2={toSvgX(wall.end[0])}
              y1={toSvgY(wall.start[1])}
              y2={toSvgY(wall.end[1])}
            />
            <circle
              cx={labelCenter.x}
              cy={labelCenter.y}
              fill={strokeColor}
              opacity={isHovered ? 1 : isSelected ? 0.96 : 0.5}
              pointerEvents="none"
              r={isHovered ? '0.19' : '0.16'}
              stroke="#ffffff"
              strokeWidth="0.035"
              vectorEffect="non-scaling-stroke"
            />
            <text
              dominantBaseline="central"
              fill="#ffffff"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="0.14"
              fontWeight="800"
              pointerEvents="none"
              textAnchor="middle"
              x={labelCenter.x}
              y={labelCenter.y}
            >
              {wallIndex + 1}
            </text>
          </g>
        )
      })}

      {candidates.openings.map((opening) => {
        const wall = wallById.get(opening.wallCandidateId)
        if (!wall) return null

        const isWallSelected = selectedWallIds.has(opening.wallCandidateId)
        const isSelected = isWallSelected && selectedOpeningIds.has(opening.id)
        const isHovered = hoveredDetectionCandidateId === opening.id
        const angle = Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0])
        const polygon = getRotatedRectanglePolygon(
          { x: opening.center[0], y: opening.center[1] },
          opening.width,
          0.2,
          angle,
        )
        const center = {
          x: toSvgX(opening.center[0]),
          y: toSvgY(opening.center[1]),
        }
        const label = opening.kind === 'door' ? 'D' : 'W'
        const fillColor =
          opening.kind === 'door' ? 'rgba(34, 197, 94, 0.22)' : 'rgba(59, 130, 246, 0.22)'
        const strokeColor = opening.kind === 'door' ? '#16a34a' : '#2563eb'

        return (
          <g
            key={opening.id}
            opacity={isHovered ? 1 : isSelected ? 1 : 0.28}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (isWallSelected) {
                setDetectionOpeningSelected(opening.id, !isSelected)
              }
            }}
            onPointerEnter={() => setHoveredDetectionCandidateId(opening.id)}
            onPointerLeave={() => setHoveredDetectionCandidateId(null)}
            pointerEvents={isWallSelected ? 'all' : 'none'}
            style={{ cursor: isWallSelected ? 'pointer' : 'default' }}
          >
            <polygon
              fill={fillColor}
              points={formatPolygonPoints(polygon)}
              stroke={strokeColor}
              strokeDasharray={isSelected ? undefined : '0.08 0.06'}
              strokeWidth={isHovered ? '0.08' : '0.05'}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={center.x}
              cy={center.y}
              fill={strokeColor}
              opacity={isHovered ? 1 : isSelected ? 0.92 : 0.45}
              r={isHovered ? '0.14' : '0.11'}
              stroke="#ffffff"
              strokeWidth="0.025"
              vectorEffect="non-scaling-stroke"
            />
            <text
              dominantBaseline="central"
              fill="#ffffff"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="0.12"
              fontWeight="800"
              pointerEvents="none"
              textAnchor="middle"
              x={center.x}
              y={center.y}
            >
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
})

const FloorplanGeometryLayer = memo(function FloorplanGeometryLayer({
  canFocusGeometry,
  canSelectGeometry,
  canSelectSlabs,
  highlightedIdSet,
  hoveredSlabId,
  hoveredOpeningId,
  hoveredWallId,
  isDeleteMode,
  onSlabDoubleClick,
  onSlabHoverChange,
  onSlabSelect,
  onOpeningDoubleClick,
  onOpeningHoverChange,
  onOpeningPointerDown,
  onOpeningSelect,
  onWallClick,
  onWallDoubleClick,
  onWallHoverChange,
  openingsPolygons,
  palette,
  selectedIdSet,
  showWallLengths,
  slabPolygons,
  wallPolygons,
  unit,
}: {
  canFocusGeometry: boolean
  canSelectSlabs: boolean
  canSelectGeometry: boolean
  highlightedIdSet: ReadonlySet<string>
  hoveredSlabId: SlabNode['id'] | null
  hoveredOpeningId: OpeningNode['id'] | null
  isDeleteMode: boolean
  onSlabDoubleClick: (slab: SlabNode) => void
  onSlabHoverChange: (slabId: SlabNode['id'] | null) => void
  onSlabSelect: (slabId: SlabNode['id'], event: ReactMouseEvent<SVGElement>) => void
  onOpeningDoubleClick: (opening: OpeningNode) => void
  onOpeningHoverChange: (openingId: OpeningNode['id'] | null) => void
  onOpeningPointerDown: (openingId: OpeningNode['id'], event: ReactPointerEvent<SVGElement>) => void
  onOpeningSelect: (openingId: OpeningNode['id'], event: ReactMouseEvent<SVGElement>) => void
  hoveredWallId: WallNode['id'] | null
  onWallClick: (wall: WallNode, event: ReactMouseEvent<SVGElement>) => void
  onWallDoubleClick: (wall: WallNode, event: ReactMouseEvent<SVGElement>) => void
  onWallHoverChange: (wallId: WallNode['id'] | null) => void
  openingsPolygons: OpeningPolygonEntry[]
  palette: FloorplanPalette
  selectedIdSet: ReadonlySet<string>
  showWallLengths: boolean
  slabPolygons: SlabPolygonEntry[]
  wallPolygons: WallPolygonEntry[]
  unit: 'metric' | 'imperial'
}) {
  let minX = Number.POSITIVE_INFINITY,
    maxX = Number.NEGATIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY
  for (const { wall } of wallPolygons) {
    minX = Math.min(minX, wall.start[0], wall.end[0])
    maxX = Math.max(maxX, wall.start[0], wall.end[0])
    minZ = Math.min(minZ, wall.start[1], wall.end[1])
    maxZ = Math.max(maxZ, wall.start[1], wall.end[1])
  }
  const centerX = minX === Number.POSITIVE_INFINITY ? 0 : (minX + maxX) / 2
  const centerZ = minZ === Number.POSITIVE_INFINITY ? 0 : (minZ + maxZ) / 2
  const wallMeasurements = wallPolygons.flatMap(({ wall }) => {
    const measurement = getWallMeasurementOverlay(wall, centerX, centerZ, unit)
    if (measurement) {
      measurement.isSelected = selectedIdSet.has(wall.id)
    }
    return measurement ? [measurement] : []
  })

  return (
    <>
      {slabPolygons.map(({ slab, polygon, holes, path }) => {
        const isSelected = selectedIdSet.has(slab.id)
        const isHighlighted = highlightedIdSet.has(slab.id)
        const isDeleteHovered = isDeleteMode && hoveredSlabId === slab.id
        let slabLabel = null

        if (isSelected) {
          const { area, centroid } = getSlabArea(polygon, holes)
          if (area > 0) {
            slabLabel = (
              <text
                dominantBaseline="central"
                fill={palette.measurementStroke}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
                fontWeight="600"
                paintOrder="stroke"
                pointerEvents="none"
                stroke={palette.surface}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
                style={{ userSelect: 'none' }}
                textAnchor="middle"
                x={toSvgX(centroid.x)}
                y={toSvgY(centroid.y)}
              >
                {formatArea(area, unit)}
              </text>
            )
          }
        }

        return (
          <g key={slab.id}>
            <path
              clipRule="evenodd"
              d={path}
              fill={
                isDeleteHovered
                  ? palette.deleteFill
                  : isHighlighted
                    ? palette.selectedSlabFill
                    : palette.slabFill
              }
              fillRule="evenodd"
              onClick={
                canSelectSlabs
                  ? (event) => {
                      event.stopPropagation()
                      onSlabSelect(slab.id, event)
                    }
                  : undefined
              }
              onDoubleClick={
                canFocusGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onSlabDoubleClick(slab)
                    }
                  : undefined
              }
              onPointerEnter={canSelectSlabs ? () => onSlabHoverChange(slab.id) : undefined}
              onPointerLeave={canSelectSlabs ? () => onSlabHoverChange(null) : undefined}
              pointerEvents={canSelectSlabs ? undefined : 'none'}
              stroke={
                isDeleteHovered
                  ? palette.deleteStroke
                  : isHighlighted
                    ? palette.selectedStroke
                    : palette.slabStroke
              }
              strokeOpacity={isDeleteHovered || isHighlighted ? 0.92 : 0.84}
              strokeWidth="0.05"
              style={canSelectSlabs ? { cursor: EDITOR_CURSOR } : undefined}
              vectorEffect="non-scaling-stroke"
            />
            {slabLabel}
          </g>
        )
      })}

      {wallPolygons.map(({ wall, polygon, points }) => {
        const isSelected = selectedIdSet.has(wall.id)
        const isHighlighted = highlightedIdSet.has(wall.id)
        const isHovered = canSelectGeometry && hoveredWallId === wall.id
        const isDeleteHovered = isDeleteMode && isHovered
        const hoverStroke = isDeleteHovered
          ? palette.deleteWallHoverStroke
          : isHighlighted
            ? palette.selectedStroke
            : palette.wallHoverStroke
        const hoverGlowOpacity = isDeleteHovered ? 0.14 : isHighlighted ? 0.22 : 0.16
        const hoverRingOpacity = isDeleteHovered ? 0.38 : isHighlighted ? 0.6 : 0.48
        const hoverSidePaths = getWallHoverSidePaths(polygon, wall)

        return (
          <g
            key={wall.id}
            onPointerEnter={canSelectGeometry ? () => onWallHoverChange(wall.id) : undefined}
            onPointerLeave={canSelectGeometry ? () => onWallHoverChange(null) : undefined}
          >
            {hoverSidePaths?.map((pathData, index) => (
              <path
                d={pathData}
                fill="none"
                key={`glow-${index}`}
                pointerEvents="none"
                stroke={hoverStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={hoverGlowOpacity}
                strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
                style={{
                  opacity: isHovered ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hoverSidePaths?.map((pathData, index) => (
              <path
                d={pathData}
                fill="none"
                key={`ring-${index}`}
                pointerEvents="none"
                stroke={hoverStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={hoverRingOpacity}
                strokeWidth={FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH}
                style={{
                  opacity: isHovered ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {canSelectGeometry && (
              <line
                onClick={(event) => {
                  event.stopPropagation()
                  onWallClick(wall, event)
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  onWallDoubleClick(wall, event)
                }}
                pointerEvents="stroke"
                stroke="transparent"
                strokeLinecap="round"
                strokeWidth={FLOORPLAN_WALL_HIT_STROKE_WIDTH}
                style={{ cursor: EDITOR_CURSOR }}
                vectorEffect="non-scaling-stroke"
                x1={toSvgX(wall.start[0])}
                x2={toSvgX(wall.end[0])}
                y1={toSvgY(wall.start[1])}
                y2={toSvgY(wall.end[1])}
              />
            )}
            <polygon
              fill={
                isDeleteHovered
                  ? palette.deleteWallFill
                  : isHighlighted
                    ? palette.selectedFill
                    : palette.wallFill
              }
              onClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onWallClick(wall, event)
                    }
                  : undefined
              }
              onDoubleClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onWallDoubleClick(wall, event)
                    }
                  : undefined
              }
              points={points}
              stroke={
                isDeleteHovered ? palette.deleteStroke : isHighlighted ? 'none' : palette.wallStroke
              }
              strokeOpacity={1}
              strokeWidth="0.06"
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}

      {openingsPolygons.map(({ opening, polygon, points }) => {
        const isSelected = selectedIdSet.has(opening.id)
        const isSelectionHighlighted = highlightedIdSet.has(opening.id)
        const isHovered = canSelectGeometry && hoveredOpeningId === opening.id
        const isDeleteHovered = isDeleteMode && isHovered
        const isHighlighted = isHovered || isSelectionHighlighted
        const highlightStroke = isDeleteHovered
          ? palette.deleteStroke
          : isSelectionHighlighted
            ? palette.selectedStroke
            : palette.wallHoverStroke
        const detailStroke = isDeleteHovered
          ? palette.deleteStroke
          : isSelectionHighlighted
            ? palette.surface
            : palette.openingStroke
        const centerLine = getOpeningCenterLine(polygon)

        if (opening.type === 'window') {
          if (polygon.length < 4) return null
          if (!centerLine) return null
          const windowLineStartX = toSvgX(centerLine.start.x)
          const windowLineStartY = toSvgY(centerLine.start.y)
          const windowLineEndX = toSvgX(centerLine.end.x)
          const windowLineEndY = toSvgY(centerLine.end.y)

          return (
            <g
              key={opening.id}
              onClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onOpeningSelect(opening.id, event)
                    }
                  : undefined
              }
              onDoubleClick={
                canFocusGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onOpeningDoubleClick(opening)
                    }
                  : undefined
              }
              onPointerDown={
                canFocusGeometry && isSelected
                  ? (event) => {
                      if (event.button === 0) {
                        onOpeningPointerDown(opening.id, event)
                      }
                    }
                  : undefined
              }
              onPointerEnter={
                canSelectGeometry
                  ? () => {
                      onWallHoverChange(null)
                      onOpeningHoverChange(opening.id)
                    }
                  : undefined
              }
              onPointerLeave={canSelectGeometry ? () => onOpeningHoverChange(null) : undefined}
              style={{ cursor: EDITOR_CURSOR }}
            >
              {canSelectGeometry && (
                <line
                  pointerEvents="stroke"
                  stroke="transparent"
                  strokeLinecap="round"
                  strokeWidth={FLOORPLAN_OPENING_HIT_STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                  x1={windowLineStartX}
                  x2={windowLineEndX}
                  y1={windowLineStartY}
                  y2={windowLineEndY}
                />
              )}
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isDeleteHovered || isSelectionHighlighted ? 0.22 : 0.16}
                strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
                style={{
                  opacity: isHighlighted ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isDeleteHovered || isSelectionHighlighted ? 0.6 : 0.48}
                strokeWidth={FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH}
                style={{
                  opacity: isHighlighted ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill={palette.openingFill}
                points={points}
                stroke={
                  isDeleteHovered
                    ? palette.deleteStroke
                    : isSelectionHighlighted
                      ? palette.selectedStroke
                      : palette.openingStroke
                }
                strokeOpacity={1}
                strokeWidth={FLOORPLAN_OPENING_STROKE_WIDTH}
              />
              <line
                stroke={
                  isDeleteHovered
                    ? palette.deleteStroke
                    : isSelectionHighlighted
                      ? palette.selectedStroke
                      : detailStroke
                }
                strokeWidth={FLOORPLAN_OPENING_DETAIL_STROKE_WIDTH}
                x1={windowLineStartX}
                x2={windowLineEndX}
                y1={windowLineStartY}
                y2={windowLineEndY}
              />
            </g>
          )
        }

        if (opening.type === 'door') {
          if (polygon.length < 4) return null
          if (!centerLine) return null
          const [p1, p2, p3, p4] = polygon
          const svgP1 = toSvgPoint(p1!)
          const svgP2 = toSvgPoint(p2!)
          const svgP3 = toSvgPoint(p3!)
          const svgP4 = toSvgPoint(p4!)
          const cx = (svgP1.x + svgP2.x + svgP3.x + svgP4.x) / 4
          const cy = (svgP1.y + svgP2.y + svgP3.y + svgP4.y) / 4

          const dirX = svgP2.x - svgP1.x
          const dirY = svgP2.y - svgP1.y
          const len = Math.sqrt(dirX * dirX + dirY * dirY)
          const nx = dirX / len
          const ny = dirY / len

          const px = -ny
          const py = nx

          const hingesSide = opening.hingesSide ?? 'left'
          const swingDirection = opening.swingDirection ?? 'inward'
          const width = opening.width
          const sweepFlag =
            hingesSide === 'left'
              ? swingDirection === 'inward'
                ? 0
                : 1
              : swingDirection === 'inward'
                ? 1
                : 0

          const hx = cx - nx * (width / 2) * (hingesSide === 'left' ? 1 : -1)
          const hy = cy - ny * (width / 2) * (hingesSide === 'left' ? 1 : -1)

          const ox = hx + px * width * (swingDirection === 'inward' ? 1 : -1)
          const oy = hy + py * width * (swingDirection === 'inward' ? 1 : -1)

          const ox2 = cx + nx * (width / 2) * (hingesSide === 'left' ? 1 : -1)
          const oy2 = cy + ny * (width / 2) * (hingesSide === 'left' ? 1 : -1)

          return (
            <g
              key={opening.id}
              onClick={
                canSelectGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onOpeningSelect(opening.id, event)
                    }
                  : undefined
              }
              onDoubleClick={
                canFocusGeometry
                  ? (event) => {
                      event.stopPropagation()
                      onOpeningDoubleClick(opening)
                    }
                  : undefined
              }
              onPointerDown={
                canFocusGeometry && isSelected
                  ? (event) => {
                      if (event.button === 0) {
                        onOpeningPointerDown(opening.id, event)
                      }
                    }
                  : undefined
              }
              onPointerEnter={
                canSelectGeometry
                  ? () => {
                      onWallHoverChange(null)
                      onOpeningHoverChange(opening.id)
                    }
                  : undefined
              }
              onPointerLeave={canSelectGeometry ? () => onOpeningHoverChange(null) : undefined}
              style={{ cursor: EDITOR_CURSOR }}
            >
              {canSelectGeometry && (
                <line
                  pointerEvents="stroke"
                  stroke="transparent"
                  strokeLinecap="round"
                  strokeWidth={FLOORPLAN_OPENING_HIT_STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                  x1={toSvgX(centerLine.start.x)}
                  x2={toSvgX(centerLine.end.x)}
                  y1={toSvgY(centerLine.start.y)}
                  y2={toSvgY(centerLine.end.y)}
                />
              )}
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isDeleteHovered || isSelectionHighlighted ? 0.22 : 0.16}
                strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
                style={{
                  opacity: isHighlighted ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isDeleteHovered || isSelectionHighlighted ? 0.6 : 0.48}
                strokeWidth={FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH}
                style={{
                  opacity: isHighlighted ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill={palette.openingFill}
                points={points}
                stroke={
                  isDeleteHovered
                    ? palette.deleteStroke
                    : isSelectionHighlighted
                      ? palette.selectedStroke
                      : palette.openingStroke
                }
                strokeOpacity={1}
                strokeWidth={FLOORPLAN_OPENING_STROKE_WIDTH}
              />
              <line
                stroke={
                  isDeleteHovered
                    ? palette.deleteStroke
                    : isSelectionHighlighted
                      ? palette.selectedStroke
                      : detailStroke
                }
                strokeWidth={FLOORPLAN_OPENING_DETAIL_STROKE_WIDTH}
                x1={hx}
                x2={ox}
                y1={hy}
                y2={oy}
              />
              <path
                d={`M ${ox} ${oy} A ${width} ${width} 0 0 ${sweepFlag} ${ox2} ${oy2}`}
                fill="none"
                stroke={
                  isDeleteHovered
                    ? palette.deleteStroke
                    : isSelectionHighlighted
                      ? palette.selectedStroke
                      : detailStroke
                }
                strokeDasharray="0.1 0.1"
                strokeWidth={FLOORPLAN_OPENING_DASHED_STROKE_WIDTH}
              />
            </g>
          )
        }

        return null
      })}

      {showWallLengths
        ? wallMeasurements.map((measurement) => (
            <g
              className="wall-dimension"
              data-delivery-role="wall-length"
              key={`measurement-${measurement.wallId}`}
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              <FloorplanMeasurementLine
                isSelected={measurement.isSelected}
                palette={palette}
                segment={measurement.extensionStart}
              />
              <FloorplanMeasurementLine
                isSelected={measurement.isSelected}
                palette={palette}
                segment={measurement.dimensionLineStart}
              />
              <FloorplanMeasurementLine
                isSelected={measurement.isSelected}
                palette={palette}
                segment={measurement.dimensionLineEnd}
              />
              <FloorplanMeasurementLine
                isSelected={measurement.isSelected}
                palette={palette}
                segment={measurement.extensionEnd}
              />
              <text
                dominantBaseline="central"
                fill={palette.measurementStroke}
                fillOpacity={
                  measurement.isSelected
                    ? FLOORPLAN_MEASUREMENT_LABEL_OPACITY
                    : FLOORPLAN_MEASUREMENT_LABEL_OPACITY * 0.4
                }
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
                fontWeight="600"
                paintOrder="stroke"
                stroke={palette.surface}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={measurement.isSelected ? 1 : 0.4}
                strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
                textAnchor="middle"
                transform={`rotate(${measurement.labelAngleDeg} ${measurement.labelX} ${measurement.labelY}) translate(0, -0.04)`}
                x={measurement.labelX}
                y={measurement.labelY}
              >
                {measurement.label}
              </text>
            </g>
          ))
        : null}
    </>
  )
})

const FloorplanNodeLayer = memo(function FloorplanNodeLayer({
  canFocusItems,
  canFocusStairs,
  canSelectItems,
  canSelectStairs,
  highlightedIdSet,
  hoveredItemId,
  hoveredStairId,
  isDeleteMode,
  isFurnishContextActive,
  itemEntries,
  onItemDoubleClick,
  onItemHoverChange,
  onItemHoverEnter,
  onItemPointerDown,
  onItemSelect,
  onStairDoubleClick,
  onStairHoverChange,
  onStairHoverEnter,
  onStairSelect,
  palette,
  selectedIdSet,
  stairEntries,
}: {
  canFocusItems: boolean
  canFocusStairs: boolean
  canSelectItems: boolean
  canSelectStairs: boolean
  highlightedIdSet: ReadonlySet<string>
  hoveredItemId: ItemNode['id'] | null
  hoveredStairId: StairNode['id'] | null
  isDeleteMode: boolean
  isFurnishContextActive: boolean
  itemEntries: FloorplanItemEntry[]
  onItemDoubleClick: (item: ItemNode, event: ReactMouseEvent<SVGElement>) => void
  onItemHoverChange: (itemId: ItemNode['id'] | null) => void
  onItemHoverEnter: (itemId: ItemNode['id']) => void
  onItemPointerDown: (itemId: ItemNode['id'], event: ReactPointerEvent<SVGElement>) => void
  onItemSelect: (itemId: ItemNode['id'], event: ReactMouseEvent<SVGElement>) => void
  onStairDoubleClick: (stair: StairNode, event: ReactMouseEvent<SVGElement>) => void
  onStairHoverChange: (stairId: StairNode['id'] | null) => void
  onStairHoverEnter: (stairId: StairNode['id']) => void
  onStairSelect: (stairId: StairNode['id'], event: ReactMouseEvent<SVGElement>) => void
  palette: FloorplanPalette
  selectedIdSet: ReadonlySet<string>
  stairEntries: FloorplanStairEntry[]
}) {
  if (itemEntries.length === 0 && stairEntries.length === 0) {
    return null
  }

  const stairNodes = stairEntries.map(({ arrow, stair, segments }) => {
    const stairSelected = selectedIdSet.has(stair.id)
    const stairHighlighted = highlightedIdSet.has(stair.id)
    const segmentSelected = segments.some(({ segment }) => selectedIdSet.has(segment.id))
    const segmentHighlighted = segments.some(({ segment }) => highlightedIdSet.has(segment.id))
    const isHovered = hoveredStairId === stair.id
    const isDeleteHovered = isDeleteMode && isHovered
    const isSelectionActive =
      stairSelected || stairHighlighted || segmentSelected || segmentHighlighted
    const showHighlight = isHovered || isDeleteHovered || isSelectionActive
    const outlineStroke = isDeleteHovered
      ? palette.deleteStroke
      : isSelectionActive
        ? palette.selectedStroke
        : palette.openingStroke
    const highlightStroke = isDeleteHovered
      ? palette.deleteStroke
      : isSelectionActive
        ? palette.selectedStroke
        : palette.wallHoverStroke
    const overlayFill = isDeleteHovered
      ? palette.deleteFill
      : isSelectionActive
        ? palette.selectedFill
        : null
    const arrowThickness = segments.reduce(
      (maxThickness, segmentEntry) => Math.max(maxThickness, segmentEntry.treadThickness),
      FLOORPLAN_STAIR_ARROW_BAND_THICKNESS,
    )
    const arrowBodyBands = arrow ? getPolylineBandPolygons(arrow.polyline, arrowThickness) : []

    return (
      <g
        key={stair.id}
        onClick={
          canSelectStairs
            ? (event) => {
                event.stopPropagation()
                onStairSelect(stair.id, event)
              }
            : undefined
        }
        onDoubleClick={
          canFocusStairs
            ? (event) => {
                event.stopPropagation()
                onStairDoubleClick(stair, event)
              }
            : undefined
        }
        onPointerEnter={canSelectStairs ? () => onStairHoverEnter(stair.id) : undefined}
        onPointerLeave={canSelectStairs ? () => onStairHoverChange(null) : undefined}
        pointerEvents={canSelectStairs ? undefined : 'none'}
        style={canSelectStairs ? { cursor: EDITOR_CURSOR } : undefined}
      >
        <title>{stair.name || 'Staircase'}</title>
        {segments.map(({ innerPoints, points, segment, treadBars }) => {
          return (
            <g key={segment.id}>
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isDeleteHovered || isSelectionActive ? 0.22 : 0.16}
                strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
                style={{
                  opacity: showHighlight ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                fill="none"
                pointerEvents="none"
                points={points}
                stroke={highlightStroke}
                strokeLinejoin="round"
                strokeOpacity={isDeleteHovered || isSelectionActive ? 0.6 : 0.48}
                strokeWidth={FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH}
                style={{
                  opacity: showHighlight ? 1 : 0,
                  transition: FLOORPLAN_HOVER_TRANSITION,
                }}
                vectorEffect="non-scaling-stroke"
              />
              <polygon fill={outlineStroke} points={points} />
              <polygon
                fill={palette.openingFill}
                fillOpacity={1}
                pointerEvents="none"
                points={innerPoints}
              />
              {overlayFill && innerPoints && (
                <polygon
                  fill={overlayFill}
                  fillOpacity={isDeleteHovered ? 0.14 : 0.08}
                  pointerEvents="none"
                  points={innerPoints}
                />
              )}
              {treadBars.map((treadBar, treadIndex) => (
                <polygon
                  fill={outlineStroke}
                  key={`${segment.id}:tread:${treadIndex}`}
                  pointerEvents="none"
                  points={segment.segmentType === 'landing' ? '' : treadBar.points}
                />
              ))}
            </g>
          )
        })}
        {arrow && (
          <>
            {arrowBodyBands.map((band, bandIndex) => (
              <polygon
                fill={outlineStroke}
                key={`${stair.id}:arrow-body:${bandIndex}`}
                pointerEvents="none"
                points={band.points}
              />
            ))}
            <line
              key={`${stair.id}:arrow-head:left`}
              pointerEvents="none"
              stroke={outlineStroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={arrowThickness}
              x1={toSvgX(arrow.head[0]!.x)}
              x2={toSvgX(arrow.head[1]!.x)}
              y1={toSvgY(arrow.head[0]!.y)}
              y2={toSvgY(arrow.head[1]!.y)}
            />
            <line
              key={`${stair.id}:arrow-head:right`}
              pointerEvents="none"
              stroke={outlineStroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={arrowThickness}
              x1={toSvgX(arrow.head[0]!.x)}
              x2={toSvgX(arrow.head[2]!.x)}
              y1={toSvgY(arrow.head[0]!.y)}
              y2={toSvgY(arrow.head[2]!.y)}
            />
          </>
        )}
      </g>
    )
  })

  const itemNodes = itemEntries.map(({ item, points, polygon }) => {
    const isSelected = selectedIdSet.has(item.id)
    const isHighlighted = highlightedIdSet.has(item.id)
    const isHovered = hoveredItemId === item.id
    const isDeleteHovered = isDeleteMode && isHovered
    const isSelectionActive = isSelected || isHighlighted
    const showHighlight = isDeleteHovered || isSelectionActive || isHovered
    const stroke = isDeleteHovered
      ? palette.deleteStroke
      : isSelectionActive
        ? palette.selectedStroke
        : palette.openingStroke
    const highlightStroke = isDeleteHovered
      ? palette.deleteStroke
      : isSelectionActive
        ? palette.selectedStroke
        : palette.wallHoverStroke
    const fill = isDeleteHovered
      ? palette.deleteFill
      : isSelectionActive
        ? palette.selectedFill
        : palette.openingFill
    const crossStrokeOpacity = isDeleteHovered
      ? 0.76
      : isSelectionActive
        ? 0.72
        : isHovered
          ? 0.58
          : 0.52
    const diagonalAStart = polygon[0]
    const diagonalAEnd = polygon[2]
    const diagonalBStart = polygon[1]
    const diagonalBEnd = polygon[3]

    return (
      <g
        key={item.id}
        onClick={
          canSelectItems
            ? (event) => {
                event.stopPropagation()
                onItemSelect(item.id, event)
              }
            : undefined
        }
        onDoubleClick={
          canFocusItems
            ? (event) => {
                event.stopPropagation()
                onItemDoubleClick(item, event)
              }
            : undefined
        }
        onPointerDown={
          canFocusItems && isSelected
            ? (event) => {
                if (event.button === 0) {
                  onItemPointerDown(item.id, event)
                }
              }
            : undefined
        }
        onPointerEnter={canSelectItems ? () => onItemHoverEnter(item.id) : undefined}
        onPointerLeave={canSelectItems ? () => onItemHoverChange(null) : undefined}
        pointerEvents={canSelectItems ? undefined : 'none'}
        style={canSelectItems ? { cursor: EDITOR_CURSOR } : undefined}
      >
        <title>{item.name || item.asset.name}</title>
        <polygon
          fill="none"
          pointerEvents="none"
          points={points}
          stroke={highlightStroke}
          strokeLinejoin="round"
          strokeOpacity={isDeleteHovered || isSelectionActive ? 0.22 : 0.16}
          strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
          style={{
            opacity: showHighlight ? 1 : 0,
            transition: FLOORPLAN_HOVER_TRANSITION,
          }}
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          fill="none"
          pointerEvents="none"
          points={points}
          stroke={highlightStroke}
          strokeLinejoin="round"
          strokeOpacity={isDeleteHovered || isSelectionActive ? 0.6 : 0.48}
          strokeWidth={FLOORPLAN_WALL_HOVER_RING_STROKE_WIDTH}
          style={{
            opacity: showHighlight ? 1 : 0,
            transition: FLOORPLAN_HOVER_TRANSITION,
          }}
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          fill={fill}
          fillOpacity={
            isDeleteHovered
              ? 0.16
              : isSelectionActive
                ? 0.1
                : isHovered
                  ? isFurnishContextActive
                    ? 0.045
                    : 0.03
                  : isFurnishContextActive
                    ? 0.03
                    : 0.015
          }
          points={points}
          stroke={stroke}
          strokeLinejoin="round"
          strokeOpacity={1}
          strokeWidth={FLOORPLAN_NODE_FOOTPRINT_STROKE_WIDTH}
        />
        {diagonalAStart && diagonalAEnd && (
          <line
            pointerEvents="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeOpacity={crossStrokeOpacity}
            strokeWidth={FLOORPLAN_NODE_FOOTPRINT_CROSS_STROKE_WIDTH}
            x1={toSvgX(diagonalAStart.x)}
            x2={toSvgX(diagonalAEnd.x)}
            y1={toSvgY(diagonalAStart.y)}
            y2={toSvgY(diagonalAEnd.y)}
          />
        )}
        {diagonalBStart && diagonalBEnd && (
          <line
            pointerEvents="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeOpacity={crossStrokeOpacity}
            strokeWidth={FLOORPLAN_NODE_FOOTPRINT_CROSS_STROKE_WIDTH}
            x1={toSvgX(diagonalBStart.x)}
            x2={toSvgX(diagonalBEnd.x)}
            y1={toSvgY(diagonalBStart.y)}
            y2={toSvgY(diagonalBEnd.y)}
          />
        )}
      </g>
    )
  })

  return (
    <>{isFurnishContextActive ? [...stairNodes, ...itemNodes] : [...itemNodes, ...stairNodes]}</>
  )
})

const FloorplanSiteLayer = memo(function FloorplanSiteLayer({
  isEditing,
  sitePolygon,
}: {
  isEditing: boolean
  sitePolygon: SitePolygonEntry | null
}) {
  if (!sitePolygon) {
    return null
  }

  return (
    <polygon
      fill={FLOORPLAN_SITE_COLOR}
      fillOpacity={isEditing ? 0.12 : 0.08}
      pointerEvents="none"
      points={sitePolygon.points}
      stroke={FLOORPLAN_SITE_COLOR}
      strokeDasharray={isEditing ? '0.16 0.1' : undefined}
      strokeLinejoin="round"
      strokeOpacity={isEditing ? 0.92 : 0.72}
      strokeWidth={isEditing ? '0.08' : '0.06'}
      vectorEffect="non-scaling-stroke"
    />
  )
})

const FloorplanZoneLayer = memo(function FloorplanZoneLayer({
  canSelectZones,
  hoveredZoneId,
  isDeleteMode,
  onZoneHoverChange,
  onZoneSelect,
  palette,
  selectedZoneId,
  zonePolygons,
}: {
  canSelectZones: boolean
  hoveredZoneId: ZoneNodeType['id'] | null
  isDeleteMode: boolean
  onZoneHoverChange: (zoneId: ZoneNodeType['id'] | null) => void
  onZoneSelect: (zoneId: ZoneNodeType['id'], event: ReactMouseEvent<SVGElement>) => void
  palette: FloorplanPalette
  selectedZoneId: ZoneNodeType['id'] | null
  zonePolygons: ZonePolygonEntry[]
}) {
  return (
    <>
      {zonePolygons.map(({ zone, points }) => {
        const isSelected = selectedZoneId === zone.id
        const isHovered = hoveredZoneId === zone.id
        const isDeleteHovered = isDeleteMode && isHovered

        return (
          <g key={zone.id}>
            <polygon
              fill={isDeleteHovered ? palette.deleteFill : zone.color}
              fillOpacity={isDeleteHovered ? 0.22 : isSelected ? 0.28 : 0.16}
              pointerEvents="none"
              points={points}
              stroke={
                isDeleteHovered
                  ? palette.deleteStroke
                  : isSelected
                    ? palette.selectedStroke
                    : zone.color
              }
              strokeLinejoin="round"
              strokeOpacity={isDeleteHovered || isSelected ? 0.96 : 0.72}
              strokeWidth={isDeleteHovered || isSelected ? '0.08' : '0.05'}
              vectorEffect="non-scaling-stroke"
            />
            {canSelectZones && (
              <polygon
                fill="none"
                onClick={(event) => {
                  event.stopPropagation()
                  onZoneSelect(zone.id, event)
                }}
                onPointerEnter={() => onZoneHoverChange(zone.id)}
                onPointerLeave={() => onZoneHoverChange(null)}
                pointerEvents="stroke"
                points={points}
                stroke="transparent"
                strokeLinejoin="round"
                strokeWidth={FLOORPLAN_WALL_HIT_STROKE_WIDTH}
                style={{ cursor: EDITOR_CURSOR }}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        )
      })}
    </>
  )
})

const FLOORPLAN_ZONE_LABEL_FONT_SIZE = 0.2

/** Compute polygon centroid using the shoelace formula */
const polygonCentroid = (polygon: Point2D[]): { x: number; y: number } => {
  let signedArea = 0
  let cx = 0
  let cy = 0

  for (let i = 0; i < polygon.length; i++) {
    const p0 = polygon[i]!
    const p1 = polygon[(i + 1) % polygon.length]!
    const cross = p0.x * p1.y - p1.x * p0.y
    signedArea += cross
    cx += (p0.x + p1.x) * cross
    cy += (p0.y + p1.y) * cross
  }

  signedArea /= 2
  const factor = 1 / (6 * signedArea)
  return { x: cx * factor, y: cy * factor }
}

function FloorplanZoneLabelInput({
  centroid,
  svgRef,
  viewBox,
  zone,
  onDone,
}: {
  centroid: { x: number; y: number }
  svgRef: React.RefObject<SVGSVGElement | null>
  viewBox: { minX: number; minY: number; width: number; height: number }
  zone: ZoneNodeType
  onDone: () => void
}) {
  const updateNode = useScene((s) => s.updateNode)
  const [value, setValue] = useState(zone.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  const save = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== zone.name) {
      updateNode(zone.id, { name: trimmed })
    }
    onDone()
  }, [value, zone.id, zone.name, updateNode, onDone])

  // Convert SVG coordinates to screen pixel position
  const svgEl = svgRef.current
  if (!svgEl) return null
  const rect = svgEl.getBoundingClientRect()
  const screenX = ((centroid.x - viewBox.minX) / viewBox.width) * rect.width + rect.left
  const screenY = ((centroid.y - viewBox.minY) / viewBox.height) * rect.height + rect.top

  return createPortal(
    <input
      onBlur={save}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          save()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onDone()
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      ref={inputRef}
      style={{
        position: 'fixed',
        left: screenX,
        top: screenY,
        transform: 'translate(-50%, -50%)',
        border: 'none',
        borderBottom: `1px solid ${zone.color}`,
        background: 'transparent',
        color: 'white',
        textShadow: `-1px -1px 0 ${zone.color}, 1px -1px 0 ${zone.color}, -1px 1px 0 ${zone.color}, 1px 1px 0 ${zone.color}`,
        outline: 'none',
        textAlign: 'center',
        fontSize: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2px 4px',
        margin: 0,
        zIndex: 100,
        width: `${Math.max((value || zone.name || '').length + 2, 6)}ch`,
      }}
      type="text"
      value={value}
    />,
    document.body,
  )
}

// Pencil icon as an SVG path (Lucide pencil simplified), rendered relative to the label
const PENCIL_ICON_SIZE = FLOORPLAN_ZONE_LABEL_FONT_SIZE * 0.6

function FloorplanZoneLabel({
  centroid,
  onHoverChange,
  onLabelClick,
  zone,
}: {
  centroid: { x: number; y: number }
  onHoverChange: (zoneId: ZoneNodeType['id'] | null) => void
  onLabelClick: (zoneId: ZoneNodeType['id'], event: ReactMouseEvent<SVGElement>) => void
  zone: ZoneNodeType
}) {
  const [hovered, setHovered] = useState(false)
  const textRef = useRef<SVGTextElement>(null)
  const [textWidth, setTextWidth] = useState(0)
  const mode = useEditor((s) => s.mode)
  const deleteNode = useScene((s) => s.deleteNode)
  const setSelection = useViewer((s) => s.setSelection)

  useEffect(() => {
    if (textRef.current) {
      setTextWidth(textRef.current.getComputedTextLength())
    }
  }, [zone.name])

  const isDeleteMode = mode === 'delete'

  return (
    <g
      cursor="pointer"
      onClick={(e) => {
        e.stopPropagation()
        if (isDeleteMode) {
          sfxEmitter.emit('sfx:structure-delete')
          deleteNode(zone.id as AnyNodeId)
          setSelection({ zoneId: null })
          return
        }
        onLabelClick(zone.id, e)
      }}
      onPointerEnter={() => {
        setHovered(true)
        onHoverChange(zone.id)
      }}
      onPointerLeave={() => {
        setHovered(false)
        onHoverChange(null)
      }}
      pointerEvents="auto"
      style={{ userSelect: 'none' }}
    >
      <text
        data-delivery-role="room-name"
        dominantBaseline="central"
        fill={
          isDeleteMode && hovered
            ? 'var(--destructive)'
            : 'var(--editor-floorplan-label-foreground)'
        }
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize={FLOORPLAN_ZONE_LABEL_FONT_SIZE}
        fontWeight="500"
        paintOrder="stroke"
        ref={textRef}
        stroke={isDeleteMode && hovered ? 'var(--destructive)' : zone.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={FLOORPLAN_ZONE_LABEL_FONT_SIZE * 0.35}
        textAnchor="middle"
        x={centroid.x}
        y={centroid.y}
      >
        {zone.name}
      </text>
      {/* Pencil icon — visible on hover */}
      {hovered && textWidth > 0 && (
        <g
          transform={`translate(${centroid.x + textWidth / 2 + PENCIL_ICON_SIZE * 0.5}, ${centroid.y - PENCIL_ICON_SIZE / 2})`}
        >
          <g transform={`scale(${PENCIL_ICON_SIZE / 24})`}>
            <path
              d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
              fill="none"
              paintOrder="stroke"
              stroke={zone.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
            />
            <path
              d="m15 5 4 4"
              fill="none"
              stroke={zone.color}
              strokeLinecap="round"
              strokeWidth={3}
            />
          </g>
        </g>
      )}
    </g>
  )
}

const FloorplanZoneLabelLayer = memo(function FloorplanZoneLabelLayer({
  onLabelHoverChange,
  onZoneLabelClick,
  selectedZoneId,
  svgRef,
  viewBox,
  zonePolygons,
}: {
  onLabelHoverChange: (zoneId: ZoneNodeType['id'] | null) => void
  onZoneLabelClick: (zoneId: ZoneNodeType['id'], event: ReactMouseEvent<SVGElement>) => void
  selectedZoneId: ZoneNodeType['id'] | null
  svgRef: React.RefObject<SVGSVGElement | null>
  viewBox: { minX: number; minY: number; width: number; height: number }
  zonePolygons: ZonePolygonEntry[]
}) {
  const [editingZoneId, setEditingZoneId] = useState<ZoneNodeType['id'] | null>(null)

  // Listen for edit-label events (from 2D label click or external triggers)
  useEffect(() => {
    const handler = (event: { zoneId: string }) => {
      setEditingZoneId(event.zoneId as ZoneNodeType['id'])
    }
    emitter.on('zone:edit-label' as any, handler as any)
    return () => {
      emitter.off('zone:edit-label' as any, handler as any)
    }
  }, [])

  // Clear editing when selection changes away
  useEffect(() => {
    if (editingZoneId && selectedZoneId !== editingZoneId) {
      setEditingZoneId(null)
    }
  }, [selectedZoneId, editingZoneId])

  return (
    <>
      {zonePolygons.map(({ zone, polygon }) => {
        if (polygon.length < 3) return null
        if (isZoneLabelHidden(zone)) return null

        const rawCentroid = polygonCentroid(polygon)
        const centroid = toSvgPoint(rawCentroid)
        const isEditing = editingZoneId === zone.id

        if (isEditing) {
          return (
            <FloorplanZoneLabelInput
              centroid={centroid}
              key={zone.id}
              onDone={() => setEditingZoneId(null)}
              svgRef={svgRef}
              viewBox={viewBox}
              zone={zone}
            />
          )
        }

        return (
          <FloorplanZoneLabel
            centroid={centroid}
            key={zone.id}
            onHoverChange={onLabelHoverChange}
            onLabelClick={onZoneLabelClick}
            zone={zone}
          />
        )
      })}
    </>
  )
})

const FloorplanZoneAreaLabelLayer = memo(function FloorplanZoneAreaLabelLayer({
  unit,
  zonePolygons,
}: {
  unit: 'metric' | 'imperial'
  zonePolygons: ZonePolygonEntry[]
}) {
  return (
    <>
      {zonePolygons.map(({ zone, polygon }) => {
        if (polygon.length < 3 || isZoneLabelHidden(zone)) return null

        const { area, centroid } = getPolygonAreaAndCentroid(polygon)
        if (area <= 0) return null

        return (
          <text
            data-delivery-role="room-area"
            dominantBaseline="central"
            fill="var(--editor-floorplan-label-foreground)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            fontSize={FLOORPLAN_ZONE_LABEL_FONT_SIZE * 0.74}
            fontWeight="600"
            key={`${zone.id}:area`}
            paintOrder="stroke"
            pointerEvents="none"
            stroke={zone.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={FLOORPLAN_ZONE_LABEL_FONT_SIZE * 0.22}
            style={{ userSelect: 'none' }}
            textAnchor="middle"
            x={toSvgX(centroid.x)}
            y={toSvgY(centroid.y) + FLOORPLAN_ZONE_LABEL_FONT_SIZE * 1.2}
          >
            {formatArea(area, unit)}
          </text>
        )
      })}
    </>
  )
})

const FloorplanWallEndpointLayer = memo(function FloorplanWallEndpointLayer({
  endpointHandles,
  hoveredEndpointId,
  onWallEndpointPointerDown,
  onEndpointHoverChange,
  palette,
}: {
  endpointHandles: Array<{
    wall: WallNode
    endpoint: WallEndpoint
    point: WallPlanPoint
    isSelected: boolean
    isActive: boolean
  }>
  onWallEndpointPointerDown: (
    wall: WallNode,
    endpoint: WallEndpoint,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  hoveredEndpointId: string | null
  onEndpointHoverChange: (endpointId: string | null) => void
  palette: FloorplanPalette
}) {
  return (
    <>
      {endpointHandles.map(({ wall, endpoint, point, isSelected, isActive }) => {
        const endpointId = `${wall.id}:${endpoint}`
        const isHovered = hoveredEndpointId === endpointId
        const stroke =
          isSelected || isActive ? palette.endpointHandleActiveStroke : palette.endpointHandleStroke
        const hoverStroke =
          isSelected || isActive
            ? palette.endpointHandleActiveStroke
            : palette.endpointHandleHoverStroke
        const outerRadius = isActive ? 0.18 : isSelected ? 0.16 : 0.14
        const svgPoint = toSvgPlanPoint(point)

        return (
          <g
            key={endpointId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onEndpointHoverChange(endpointId)}
            onPointerLeave={() => onEndpointHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={outerRadius}
              stroke={hoverStroke}
              strokeOpacity={isActive ? 0.24 : 0.16}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={outerRadius}
              stroke={hoverStroke}
              strokeOpacity={isActive ? 0.72 : 0.52}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_RING_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={isActive ? palette.endpointHandleActiveFill : palette.endpointHandleFill}
              fillOpacity={0.96}
              pointerEvents="none"
              r={outerRadius}
              stroke={stroke}
              strokeWidth="0.05"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={stroke}
              pointerEvents="none"
              r={isActive ? 0.08 : 0.06}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onPointerDown={(event) => onWallEndpointPointerDown(wall, endpoint, event)}
              pointerEvents="all"
              r={outerRadius}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </>
  )
})

const FloorplanWallCurveHandleLayer = memo(function FloorplanWallCurveHandleLayer({
  curveHandles,
  hoveredHandleId,
  onHandleHoverChange,
  onWallCurvePointerDown,
  palette,
}: {
  curveHandles: Array<{
    wall: WallNode
    point: WallPlanPoint
    isActive: boolean
  }>
  hoveredHandleId: string | null
  onHandleHoverChange: (handleId: string | null) => void
  onWallCurvePointerDown: (wall: WallNode, event: ReactPointerEvent<SVGCircleElement>) => void
  palette: FloorplanPalette
}) {
  return (
    <>
      {curveHandles.map(({ wall, point, isActive }) => {
        const handleId = `curve:${wall.id}`
        const isHovered = hoveredHandleId === handleId
        const stroke = isActive ? palette.endpointHandleActiveStroke : palette.endpointHandleStroke
        const hoverStroke = isActive
          ? palette.endpointHandleActiveStroke
          : palette.endpointHandleHoverStroke
        const svgPoint = toSvgPlanPoint(point)
        const radius = isActive ? 0.16 : 0.14

        return (
          <g
            key={handleId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onHandleHoverChange(handleId)}
            onPointerLeave={() => onHandleHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={radius}
              stroke={hoverStroke}
              strokeOpacity={isActive ? 0.24 : 0.16}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={isActive ? palette.endpointHandleActiveFill : palette.endpointHandleFill}
              fillOpacity={0.96}
              pointerEvents="none"
              r={radius}
              stroke={stroke}
              strokeWidth="0.05"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={stroke}
              pointerEvents="none"
              r={0.045}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onPointerDown={(event) => onWallCurvePointerDown(wall, event)}
              pointerEvents="all"
              r={radius}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </>
  )
})

const FloorplanPolygonHandleLayer = memo(function FloorplanPolygonHandleLayer({
  hoveredHandleId,
  midpointHandles,
  onHandleHoverChange,
  onMidpointPointerDown,
  onVertexDoubleClick,
  onVertexPointerDown,
  palette,
  vertexHandles,
}: {
  vertexHandles: Array<{
    nodeId: string
    vertexIndex: number
    point: WallPlanPoint
    isActive: boolean
  }>
  midpointHandles: Array<{
    nodeId: string
    edgeIndex: number
    point: WallPlanPoint
  }>
  hoveredHandleId: string | null
  onHandleHoverChange: (handleId: string | null) => void
  onVertexPointerDown: (
    nodeId: string,
    vertexIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  onVertexDoubleClick: (
    nodeId: string,
    vertexIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  onMidpointPointerDown: (
    nodeId: string,
    edgeIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  palette: FloorplanPalette
}) {
  return (
    <>
      {vertexHandles.map(({ nodeId, vertexIndex, point, isActive }) => {
        const handleId = `${nodeId}:vertex:${vertexIndex}`
        const isHovered = hoveredHandleId === handleId
        const stroke = isActive ? palette.endpointHandleActiveStroke : palette.endpointHandleStroke
        const outerRadius = isActive ? 0.15 : 0.13
        const svgPoint = toSvgPlanPoint(point)

        return (
          <g
            key={handleId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onHandleHoverChange(handleId)}
            onPointerLeave={() => onHandleHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={outerRadius}
              stroke={stroke}
              strokeOpacity={0.18}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={isActive ? palette.endpointHandleActiveFill : palette.endpointHandleFill}
              fillOpacity={0.96}
              pointerEvents="none"
              r={outerRadius}
              stroke={stroke}
              strokeWidth="0.045"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={stroke}
              pointerEvents="none"
              r={isActive ? 0.058 : 0.05}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onVertexDoubleClick(nodeId, vertexIndex, event as any)
              }}
              onPointerDown={(event) => {
                onVertexPointerDown(nodeId, vertexIndex, event)
              }}
              pointerEvents="all"
              r={outerRadius}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}

      {midpointHandles.map(({ nodeId, edgeIndex, point }) => {
        const handleId = `${nodeId}:midpoint:${edgeIndex}`
        const isHovered = hoveredHandleId === handleId
        const stroke = isHovered ? palette.endpointHandleHoverStroke : palette.endpointHandleStroke
        const radius = isHovered ? 0.092 : 0.08
        const svgPoint = toSvgPlanPoint(point)

        return (
          <g
            key={handleId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onHandleHoverChange(handleId)}
            onPointerLeave={() => onHandleHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={radius + 0.03}
              stroke={stroke}
              strokeOpacity={0.16}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_RING_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={palette.surface}
              fillOpacity={0.94}
              pointerEvents="none"
              r={radius}
              stroke={stroke}
              strokeOpacity={0.9}
              strokeWidth="0.035"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={stroke}
              fillOpacity={0.82}
              pointerEvents="none"
              r="0.028"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onPointerDown={(event) => onMidpointPointerDown(nodeId, edgeIndex, event)}
              pointerEvents="all"
              r={radius}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </>
  )
})

type FloorplanSiteKeyHandlerProps = {
  onRestoreGroundLevel: () => void
}

const FloorplanSiteKeyHandler = memo(function FloorplanSiteKeyHandler({
  onRestoreGroundLevel,
}: FloorplanSiteKeyHandlerProps) {
  const isFloorplanHovered = useEditor((state) => state.isFloorplanHovered)
  const phase = useEditor((state) => state.phase)
  const setFloorplanSelectionTool = useEditor((state) => state.setFloorplanSelectionTool)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)

      if (
        isEditableTarget ||
        !isFloorplanHovered ||
        phase !== 'site' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== 'v'
      ) {
        return
      }

      setFloorplanSelectionTool('click')
      onRestoreGroundLevel()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isFloorplanHovered, onRestoreGroundLevel, phase, setFloorplanSelectionTool])

  return null
})

type FloorplanDuplicateHotkeyProps = {
  hasDuplicatable: boolean
  onDuplicateSelected: () => void
}

const FloorplanDuplicateHotkey = memo(function FloorplanDuplicateHotkey({
  hasDuplicatable,
  onDuplicateSelected,
}: FloorplanDuplicateHotkeyProps) {
  const isFloorplanHovered = useEditor((state) => state.isFloorplanHovered)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'c') {
        return
      }

      if (!(isFloorplanHovered && hasDuplicatable)) {
        return
      }

      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)

      if (isEditableTarget) {
        return
      }

      event.preventDefault()
      onDuplicateSelected()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [hasDuplicatable, isFloorplanHovered, onDuplicateSelected])

  return null
})

type FloorplanCursorIndicatorOverlayProps = {
  cursorPosition: SvgPoint | null
  cursorAnchorPosition: SvgPoint | null
  floorplanSelectionTool: FloorplanSelectionTool
  movingOpeningType: 'door' | 'window' | null
  isPanning: boolean
  cursorColor: string
}

const FloorplanCursorIndicatorOverlay = memo(function FloorplanCursorIndicatorOverlay({
  cursorPosition,
  cursorAnchorPosition,
  floorplanSelectionTool,
  movingOpeningType,
  isPanning,
  cursorColor,
}: FloorplanCursorIndicatorOverlayProps) {
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const structureLayer = useEditor((state) => state.structureLayer)
  const catalogCategory = useEditor((state) => state.catalogCategory)

  const activeFloorplanToolConfig = useMemo(() => {
    if (movingOpeningType) {
      return structureTools.find((entry) => entry.id === movingOpeningType) ?? null
    }

    if (mode !== 'build' || !tool) {
      return null
    }

    if (tool === 'item' && catalogCategory) {
      return furnishTools.find((entry) => entry.catalogCategory === catalogCategory) ?? null
    }

    return structureTools.find((entry) => entry.id === tool) ?? null
  }, [catalogCategory, mode, movingOpeningType, tool])

  const indicator = useMemo<FloorplanCursorIndicator | null>(() => {
    if (activeFloorplanToolConfig) {
      return { kind: 'asset', iconSrc: activeFloorplanToolConfig.iconSrc }
    }

    if (mode === 'select' && floorplanSelectionTool === 'marquee' && structureLayer !== 'zones') {
      return { kind: 'asset', iconSrc: '/icons/box-select.svg' }
    }

    if (mode === 'delete') {
      return { kind: 'asset', iconSrc: '/icons/delete.svg' }
    }

    return null
  }, [activeFloorplanToolConfig, floorplanSelectionTool, mode, structureLayer])

  const position = mode === 'delete' ? cursorPosition : cursorAnchorPosition

  if (!(indicator && position) || isPanning) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-20"
      style={{ left: position.x, top: position.y }}
    >
      {mode === 'delete' ? (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/95 shadow-[0_8px_16px_-4px_rgba(15,23,42,0.16),0_4px_8px_-4px_rgba(15,23,42,0.12)]"
          style={{
            boxShadow: `0 8px 16px -4px rgba(0,0,0,0.3), 0 4px 8px -4px rgba(0,0,0,0.2), 0 0 18px ${cursorColor}22`,
            transform: `translate(${FLOORPLAN_CURSOR_BADGE_OFFSET_X}px, ${FLOORPLAN_CURSOR_BADGE_OFFSET_Y}px)`,
          }}
        >
          {indicator.kind === 'asset' ? (
            <img
              alt=""
              aria-hidden="true"
              className="h-5 w-5 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
              src={indicator.iconSrc}
            />
          ) : (
            <Icon
              aria-hidden="true"
              className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
              color={cursorColor}
              height={18}
              icon={indicator.icon}
              width={18}
            />
          )}
        </div>
      ) : (
        <>
          <div
            className="absolute top-0 left-1/2 w-px -translate-x-1/2 -translate-y-full"
            style={{
              backgroundColor: cursorColor,
              boxShadow: `0 0 12px ${cursorColor}55`,
              height: FLOORPLAN_CURSOR_INDICATOR_LINE_HEIGHT,
            }}
          />
          <div
            className="absolute top-0 left-1/2 flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/95 shadow-[0_8px_16px_-4px_rgba(15,23,42,0.16),0_4px_8px_-4px_rgba(15,23,42,0.12)]"
            style={{
              transform: `translate(-50%, calc(-100% - ${FLOORPLAN_CURSOR_INDICATOR_LINE_HEIGHT}px))`,
            }}
          >
            {indicator.kind === 'asset' ? (
              <img
                alt=""
                aria-hidden="true"
                className="h-5 w-5 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                src={indicator.iconSrc}
              />
            ) : (
              <Icon
                aria-hidden="true"
                className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                color="white"
                height={18}
                icon={indicator.icon}
                width={18}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
})

type FloorplanWallLengthInputOverlayProps = {
  input: FloorplanNumericInputState | null
  position: SvgPoint | null
  onCancel: () => void
  onChange: (value: string) => void
  onSubmit: (value: string) => void
}

type GuideCalibrationDialogState = {
  guideId: GuideNode['id']
  guideScale: number
  measuredDistance: number
  points: [WallPlanPoint, WallPlanPoint]
}

const MIN_GUIDE_DETECTION_REGION_RATIO = 0.01

const FLOORPLAN_GUIDE_CALIBRATION_COPY = {
  'zh-CN': {
    apply: '应用校准',
    cancel: '取消',
    description: '已选取两个校准点，请输入它们之间的实际距离（米）。',
    distanceLabel: '实际距离（米）',
    invalidDistance: '请输入有效的米制距离。',
    title: '校准距离',
  },
  en: {
    apply: 'Apply calibration',
    cancel: 'Cancel',
    description: 'Two calibration points are set. Enter the real-world distance in meters.',
    distanceLabel: 'Actual distance (m)',
    invalidDistance: 'Enter a valid distance in meters.',
    title: 'Calibrate Distance',
  },
} satisfies Record<
  EditorLanguage,
  {
    apply: string
    cancel: string
    description: string
    distanceLabel: string
    invalidDistance: string
    title: string
  }
>

const FLOORPLAN_GUIDE_DETECTION_REGION_COPY = {
  'zh-CN': {
    activeLabel: '框选识别范围',
    label: '识别范围',
  },
  en: {
    activeLabel: 'Boxing Detection Area',
    label: 'Detection Region',
  },
} satisfies Record<
  EditorLanguage,
  {
    activeLabel: string
    label: string
  }
>

const FloorplanWallLengthInputOverlay = memo(function FloorplanWallLengthInputOverlay({
  input,
  position,
  onCancel,
  onChange,
  onSubmit,
}: FloorplanWallLengthInputOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (input) {
      requestAnimationFrame(() => {
        const element = inputRef.current
        element?.focus()
        element?.setSelectionRange(element.value.length, element.value.length)
      })
    }
  }, [input])

  if (!(input && position)) {
    return null
  }

  return (
    <form
      className="editor-floorplan-feedback pointer-events-auto absolute z-30 flex h-9 items-center gap-1 rounded-md px-2"
      onPointerDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(input.value)
      }}
      style={{
        left: position.x + FLOORPLAN_CURSOR_BADGE_OFFSET_X,
        top: position.y + FLOORPLAN_CURSOR_BADGE_OFFSET_Y,
      }}
    >
      {input.label && (
        <span className="select-none font-medium text-muted-foreground text-xs">{input.label}</span>
      )}
      <input
        ref={inputRef}
        className="h-6 w-20 bg-transparent text-right font-medium font-mono text-foreground text-sm outline-none"
        inputMode="decimal"
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        type="text"
        value={input.value}
      />
      <span className="select-none font-medium text-muted-foreground text-xs">
        {input.unitLabel}
      </span>
    </form>
  )
})

const FloorplanGuideCalibrationDialog = memo(function FloorplanGuideCalibrationDialog({
  copy,
  errorMessage,
  inputValue,
  open,
  onChange,
  onOpenChange,
  onSubmit,
}: {
  copy: (typeof FLOORPLAN_GUIDE_CALIBRATION_COPY)[EditorLanguage]
  errorMessage: string | null
  inputValue: string
  open: boolean
  onChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(event) => event.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="floorplan-guide-calibration-distance">
              {copy.distanceLabel}
            </label>
            <Input
              aria-invalid={errorMessage ? true : undefined}
              autoFocus
              id="floorplan-guide-calibration-distance"
              inputMode="decimal"
              onChange={(event) => onChange(event.currentTarget.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="1.00"
              ref={inputRef}
              step="0.01"
              type="number"
              value={inputValue}
            />
            {errorMessage ? (
              <p className="text-destructive text-xs" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              {copy.cancel}
            </Button>
            <Button type="submit">{copy.apply}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})

export function FloorplanPanel() {
  const viewportHostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panStateRef = useRef<PanState | null>(null)
  const guideInteractionRef = useRef<GuideInteractionState | null>(null)
  const guideDetectionRegionInteractionRef = useRef<GuideDetectionRegionInteractionState | null>(
    null,
  )
  const guideTransformDraftRef = useRef<GuideTransformDraft | null>(null)
  const wallEndpointDragRef = useRef<WallEndpointDragState | null>(null)
  const wallCurveDragRef = useRef<WallCurveDragState | null>(null)
  const siteBoundaryDraftRef = useRef<SiteBoundaryDraft | null>(null)
  const slabBoundaryDraftRef = useRef<SlabBoundaryDraft | null>(null)
  const ceilingBoundaryDraftRef = useRef<CeilingBoundaryDraft | null>(null)
  const zoneBoundaryDraftRef = useRef<ZoneBoundaryDraft | null>(null)
  const gestureScaleRef = useRef(1)
  const panelInteractionRef = useRef<PanelInteractionState | null>(null)
  const panelBoundsRef = useRef<ViewportBounds | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasUserAdjustedViewportRef = useRef(false)
  const previousLevelIdRef = useRef<string | null>(null)
  const previousSketchPlaneSignatureRef = useRef<string | null>(null)
  const floorplanMarqueeSnapPointRef = useRef<WallPlanPoint | null>(null)
  const levelId = useViewer((state) => state.selection.levelId)
  const buildingId = useViewer((state) => state.selection.buildingId)
  const selectedZoneId = useViewer((state) => state.selection.zoneId)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const previewSelectedIds = useViewer((state) => state.previewSelectedIds)
  const setSelection = useViewer((state) => state.setSelection)
  const setPreviewSelectedIds = useViewer((state) => state.setPreviewSelectedIds)
  const theme = useViewer((state) => state.theme)
  const unit = useViewer((state) => state.unit)
  const language = useEditorLanguage()
  const showGrid = useViewer((state) => state.showGrid)
  const showGuides = useViewer((state) => state.showGuides)
  const setShowGuides = useViewer((state) => state.setShowGuides)
  const deliveryOverlays = useDeliveryStore((state) => state.overlays)
  const calibrationDraft = useDeliveryStore((state) => state.calibrationDraft)
  const detectionRegionDraftGuideId = useDeliveryStore((state) => state.detectionRegionDraftGuideId)
  const pushCalibrationPoint = useDeliveryStore((state) => state.pushCalibrationPoint)
  const clearCalibrationDraft = useDeliveryStore((state) => state.clearCalibrationDraft)
  const clearDetectionRegionDraft = useDeliveryStore((state) => state.clearDetectionRegionDraft)
  const requestLockPrompt = useDeliveryStore((state) => state.requestLockPrompt)
  const detectionCandidates = useDeliveryStore((state) => state.detectionCandidates)
  const clearDetectionCandidates = useDeliveryStore((state) => state.clearDetectionCandidates)
  const selectedItem = useEditor((state) => state.selectedItem)

  const setFloorplanHovered = useEditor((state) => state.setFloorplanHovered)
  const selectedReferenceId = useEditor((state) => state.selectedReferenceId)
  const setSelectedReferenceId = useEditor((state) => state.setSelectedReferenceId)
  const setMode = useEditor((state) => state.setMode)
  const movingNode = useEditor((state) => state.movingNode)
  const curvingWall = useEditor((state) => state.curvingWall)
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const setPhase = useEditor((state) => state.setPhase)
  const setMovingNode = useEditor((state) => state.setMovingNode)
  const structureLayer = useEditor((state) => state.structureLayer)
  const setStructureLayer = useEditor((state) => state.setStructureLayer)
  const setTool = useEditor((state) => state.setTool)
  const tool = useEditor((state) => state.tool)
  const wallEditOperation = useEditor((state) => state.wallEditOperation)
  const setWallEditOperation = useEditor((state) => state.setWallEditOperation)
  const showSketchRelations = useEditor((state) => state.showSketchRelations)
  const setSketchPlane = useEditor((state) => state.setSketchPlane)
  const sketchPlane = useEditor((state) => state.sketchPlane)
  const deleteNode = useScene((state) => state.deleteNode)
  const updateNode = useScene((state) => state.updateNode)
  const levelNode = useScene((state) =>
    levelId ? (state.nodes[levelId] as LevelNode | undefined) : undefined,
  )
  const sceneNodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const currentBuildingId =
    levelNode?.type === 'level' && levelNode.parentId
      ? (levelNode.parentId as BuildingNode['id'])
      : (buildingId as BuildingNode['id'] | null)
  const currentBuildingNode = useScene((state) =>
    currentBuildingId ? (state.nodes[currentBuildingId] as BuildingNode | undefined) : undefined,
  )
  const buildingRotationY = useScene((state) => {
    if (!currentBuildingId) return 0
    const node = state.nodes[currentBuildingId]
    return node?.type === 'building' ? (node.rotation[1] ?? 0) : 0
  })
  const buildingRotationDeg = (buildingRotationY * 180) / Math.PI
  const site = useScene((state) => {
    for (const rootNodeId of state.rootNodeIds) {
      const node = state.nodes[rootNodeId]
      if (node?.type === 'site') {
        return node as SiteNode
      }
    }

    return null
  })
  const floorplanLevels = useScene(
    useShallow((state) => {
      if (!currentBuildingId) {
        return [] as LevelNode[]
      }

      const buildingNode = state.nodes[currentBuildingId]
      if (!buildingNode || buildingNode.type !== 'building') {
        return [] as LevelNode[]
      }

      return buildingNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is LevelNode => node?.type === 'level')
        .sort((a, b) => a.level - b.level)
    }),
  )
  const walls = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as WallNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as WallNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is WallNode => node?.type === 'wall')
    }),
  )
  const openings = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as OpeningNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as OpeningNode[]
      }

      const nextWalls = nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is WallNode => node?.type === 'wall')

      return nextWalls.flatMap((wall) =>
        wall.children
          .map((childId) => state.nodes[childId])
          .filter((node): node is OpeningNode => node?.type === 'window' || node?.type === 'door'),
      )
    }),
  )
  const slabs = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as SlabNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as SlabNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is SlabNode => node?.type === 'slab')
    }),
  )
  const ceilings = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as CeilingNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as CeilingNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is CeilingNode => node?.type === 'ceiling')
    }),
  )
  const fences = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as FenceNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as FenceNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is FenceNode => node?.type === 'fence')
    }),
  )
  const levelGuides = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as GuideNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as GuideNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is GuideNode => node?.type === 'guide')
    }),
  )
  const sketchLines = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as SketchLineNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as SketchLineNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is SketchLineNode => node?.type === 'sketch-line')
    }),
  )
  const sketchCircles = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as SketchCircleNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as SketchCircleNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is SketchCircleNode => node?.type === 'sketch-circle')
    }),
  )
  const sketchDimensions = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as SketchDimensionNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as SketchDimensionNode[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is SketchDimensionNode => node?.type === 'sketch-dimension')
    }),
  )
  const isFeatureSketchActive =
    sketchPlane?.kind === 'feature-top' || sketchPlane?.kind === 'feature-face'
  const isFeatureFaceSketchActive = sketchPlane?.kind === 'feature-face'
  const activeSketchPlaneSignature = useMemo(
    () => getSketchPlaneSignature(sketchPlane),
    [sketchPlane],
  )
  const sketchPlaneRecords = useMemo<SketchPlaneRecord[]>(() => {
    const recordBySignature = new Map<
      string,
      {
        count: number
        sketchPlane: SketchPlane
      }
    >()

    for (const node of [...sketchLines, ...sketchCircles]) {
      const nodeSketchPlane = getSketchPlaneFromMetadata(node.metadata)
      if (!nodeSketchPlane) {
        continue
      }

      const signature = getSketchPlaneSignature(nodeSketchPlane)
      if (!signature) {
        continue
      }

      const existingRecord = recordBySignature.get(signature)
      if (existingRecord) {
        existingRecord.count += 1
      } else {
        recordBySignature.set(signature, {
          count: 1,
          sketchPlane: nodeSketchPlane,
        })
      }
    }

    return [...recordBySignature.entries()].map(([signature, record], index) => ({
      id: signature,
      label: getSketchPlaneRecordLabel(record.sketchPlane, index),
      count: record.count,
      sketchPlane: record.sketchPlane,
      active: signature === activeSketchPlaneSignature,
    }))
  }, [activeSketchPlaneSignature, sketchCircles, sketchLines])
  const activeSketchLines = useMemo(
    () => sketchLines.filter((line) => doesSketchNodeMatchActivePlane(line, sketchPlane)),
    [sketchLines, sketchPlane],
  )
  const activeSketchCircles = useMemo(
    () => sketchCircles.filter((circle) => doesSketchNodeMatchActivePlane(circle, sketchPlane)),
    [sketchCircles, sketchPlane],
  )
  const activeSketchLineIdSet = useMemo(
    () => new Set(activeSketchLines.map((line) => line.id)),
    [activeSketchLines],
  )
  const activeSketchCircleIdSet = useMemo(
    () => new Set(activeSketchCircles.map((circle) => circle.id)),
    [activeSketchCircles],
  )
  const activeSketchDimensions = useMemo(() => {
    return sketchDimensions.filter(
      (dimension) =>
        doesSketchDimensionReferenceMatchActivePlane(
          dimension.start,
          activeSketchLineIdSet,
          activeSketchCircleIdSet,
        ) &&
        doesSketchDimensionReferenceMatchActivePlane(
          dimension.end,
          activeSketchLineIdSet,
          activeSketchCircleIdSet,
        ),
    )
  }, [activeSketchCircleIdSet, activeSketchLineIdSet, sketchDimensions])
  const zones = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as ZoneNodeType[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as ZoneNodeType[]
      }

      return nextLevelNode.children
        .map((childId) => state.nodes[childId])
        .filter((node): node is ZoneNodeType => node?.type === 'zone')
    }),
  )
  const levelDescendantNodes = useScene(
    useShallow((state) => {
      if (!levelId) {
        return [] as AnyNode[]
      }

      const nextLevelNode = state.nodes[levelId]
      if (!nextLevelNode || nextLevelNode.type !== 'level') {
        return [] as AnyNode[]
      }

      return collectLevelDescendants(nextLevelNode, state.nodes as Record<string, AnyNode>)
    }),
  )

  const [draftStart, setDraftStart] = useState<WallPlanPoint | null>(null)
  const [draftEnd, setDraftEnd] = useState<WallPlanPoint | null>(null)
  const [wallSketchSnapResult, setWallSketchSnapResult] = useState<WallSketchSnapResult | null>(
    null,
  )
  const [sketchWorkbenchTab, setSketchWorkbenchTab] = useState<'sketch' | 'features'>('sketch')
  const [wallLengthInput, setWallLengthInput] = useState<WallSketchInputState | null>(null)
  const [sketchContextMenuTarget, setSketchContextMenuTarget] =
    useState<FloorplanSketchContextTarget | null>(null)
  const {
    sketchLineDraft,
    setSketchLineDraft,
    sketchRectangleDraft,
    setSketchRectangleDraft,
    sketchCircleDraft,
    setSketchCircleDraft,
    sketchArcDraft,
    setSketchArcDraft,
    sketchDimensionInput,
    setSketchDimensionInput,
    sketchDistanceDimensionDraft,
    setSketchDistanceDimensionDraft,
    clearSketchLinePlacementDraft,
    sketchRectangleDraftSegments,
  } = useFloorplanSketchState()
  const [slabDraftPoints, setSlabDraftPoints] = useState<WallPlanPoint[]>([])
  const [ceilingDraftPoints, setCeilingDraftPoints] = useState<WallPlanPoint[]>([])
  const [zoneDraftPoints, setZoneDraftPoints] = useState<WallPlanPoint[]>([])
  const [fenceDraft, setFenceDraft] = useState<FenceDraftState | null>(null)
  const [siteBoundaryDraft, setSiteBoundaryDraft] = useState<SiteBoundaryDraft | null>(null)
  const [siteVertexDragState, setSiteVertexDragState] = useState<SiteVertexDragState | null>(null)
  const [slabBoundaryDraft, setSlabBoundaryDraft] = useState<SlabBoundaryDraft | null>(null)
  const [slabVertexDragState, setSlabVertexDragState] = useState<SlabVertexDragState | null>(null)
  const [ceilingBoundaryDraft, setCeilingBoundaryDraft] = useState<CeilingBoundaryDraft | null>(
    null,
  )
  const [ceilingVertexDragState, setCeilingVertexDragState] =
    useState<CeilingVertexDragState | null>(null)
  const [zoneBoundaryDraft, setZoneBoundaryDraft] = useState<ZoneBoundaryDraft | null>(null)
  const [zoneVertexDragState, setZoneVertexDragState] = useState<ZoneVertexDragState | null>(null)
  const [guideTransformDraft, setGuideTransformDraft] = useState<GuideTransformDraft | null>(null)
  const [cursorPoint, setCursorPoint] = useState<WallPlanPoint | null>(null)
  const [floorplanCursorPosition, setFloorplanCursorPosition] = useState<SvgPoint | null>(null)
  const [wallEndpointDraft, setWallEndpointDraft] = useState<WallEndpointDraft | null>(null)
  const [wallCurveDraft, setWallCurveDraft] = useState<WallCurveDraft | null>(null)
  const [wallOffsetPreview, setWallOffsetPreview] = useState<WallOffsetPreview | null>(null)
  const [wallEditNumericInput, setWallEditNumericInput] =
    useState<WallEditNumericInputState | null>(null)
  const [wallEditFeedback, setWallEditFeedback] = useState<WallEditFeedback | null>(null)
  const [guideCalibrationDialog, setGuideCalibrationDialog] =
    useState<GuideCalibrationDialogState | null>(null)
  const [guideDetectionRegionDraft, setGuideDetectionRegionDraft] =
    useState<GuideDetectionRegionDraft | null>(null)
  const [guideCalibrationInput, setGuideCalibrationInput] = useState('')
  const [guideCalibrationError, setGuideCalibrationError] = useState<string | null>(null)
  const [hoveredOpeningId, setHoveredOpeningId] = useState<OpeningNode['id'] | null>(null)
  const [hoveredWallId, setHoveredWallId] = useState<WallNode['id'] | null>(null)
  const [hoveredSketchLineId, setHoveredSketchLineId] = useState<SketchLineNode['id'] | null>(null)
  const [hoveredSketchCircleId, setHoveredSketchCircleId] = useState<SketchCircleNode['id'] | null>(
    null,
  )
  const [hoveredSlabId, setHoveredSlabId] = useState<SlabNode['id'] | null>(null)
  const [hoveredCeilingId, setHoveredCeilingId] = useState<CeilingNode['id'] | null>(null)
  const [hoveredFenceId, setHoveredFenceId] = useState<FenceNode['id'] | null>(null)
  const [hoveredItemId, setHoveredItemId] = useState<ItemNode['id'] | null>(null)
  const [hoveredStairId, setHoveredStairId] = useState<StairNode['id'] | null>(null)
  const [hoveredZoneId, setHoveredZoneId] = useState<ZoneNodeType['id'] | null>(null)
  const [hoveredEndpointId, setHoveredEndpointId] = useState<string | null>(null)
  const [hoveredWallCurveHandleId, setHoveredWallCurveHandleId] = useState<string | null>(null)
  const [hoveredSiteHandleId, setHoveredSiteHandleId] = useState<string | null>(null)
  const [hoveredSlabHandleId, setHoveredSlabHandleId] = useState<string | null>(null)
  const [hoveredCeilingHandleId, setHoveredCeilingHandleId] = useState<string | null>(null)
  const [hoveredZoneHandleId, setHoveredZoneHandleId] = useState<string | null>(null)
  const [hoveredGuideCorner, setHoveredGuideCorner] = useState<GuideCorner | null>(null)
  const floorplanSelectionTool = useEditor((s) => s.floorplanSelectionTool)
  const setFloorplanSelectionTool = useEditor((s) => s.setFloorplanSelectionTool)
  const [floorplanMarqueeState, setFloorplanMarqueeState] = useState<FloorplanMarqueeState | null>(
    null,
  )
  const [shiftPressed, setShiftPressed] = useState(false)
  const [rotationModifierPressed, setRotationModifierPressed] = useState(false)
  const [movingFloorplanNodeRevision, setMovingFloorplanNodeRevision] = useState(0)
  const [stairBuildPreviewPoint, setStairBuildPreviewPoint] = useState<WallPlanPoint | null>(null)
  const [stairBuildPreviewRotation, setStairBuildPreviewRotation] = useState(0)
  const [isPanning, setIsPanning] = useState(false)
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const [isMacPlatform, setIsMacPlatform] = useState(true)
  const [activeResizeDirection, setActiveResizeDirection] = useState<ResizeDirection | null>(null)
  const [panelRect, setPanelRect] = useState<PanelRect>({
    x: PANEL_MARGIN,
    y: PANEL_MARGIN,
    width: PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_HEIGHT,
  })
  const guideCalibrationCopy = FLOORPLAN_GUIDE_CALIBRATION_COPY[language]
  const guideDetectionRegionCopy = FLOORPLAN_GUIDE_DETECTION_REGION_COPY[language]

  const [isPanelReady, setIsPanelReady] = useState(false)
  const [surfaceSize, setSurfaceSize] = useState({ width: 1, height: 1 })
  const [viewport, setViewport] = useState<FloorplanViewport | null>(null)

  useEffect(() => {
    if (structureLayer === 'zones' && floorplanSelectionTool === 'marquee') {
      setFloorplanSelectionTool('click')
    }
  }, [floorplanSelectionTool, structureLayer])

  useEffect(() => {
    setIsMacPlatform(navigator.platform.toUpperCase().includes('MAC'))
  }, [])

  const sitePolygonEntry = useMemo(() => {
    const polygonPoints = site?.polygon?.points
    if (!(site && polygonPoints)) {
      return null
    }

    const polygon = toFloorplanPolygon(polygonPoints)
    if (polygon.length < 3) {
      return null
    }

    return {
      site,
      polygon,
      points: formatPolygonPoints(polygon),
    }
  }, [site])
  const displaySitePolygon = useMemo(() => {
    if (!sitePolygonEntry) {
      return null
    }

    if (!(siteBoundaryDraft && siteBoundaryDraft.siteId === sitePolygonEntry.site.id)) {
      return sitePolygonEntry
    }

    const polygon = siteBoundaryDraft.polygon.map(toPoint2D)

    return {
      ...sitePolygonEntry,
      polygon,
      points: formatPolygonPoints(polygon),
    }
  }, [siteBoundaryDraft, sitePolygonEntry])
  const movingOpeningType =
    movingNode?.type === 'door' || movingNode?.type === 'window' ? movingNode.type : null

  const visibleGuides = useMemo<GuideNode[]>(() => {
    if (!showGuides) {
      return []
    }

    return levelGuides.filter((guide) => guide.visible !== false)
  }, [levelGuides, showGuides])
  const guideById = useMemo(
    () => new Map(levelGuides.map((guide) => [guide.id, guide] as const)),
    [levelGuides],
  )
  const displayGuides = useMemo<GuideNode[]>(() => {
    if (!guideTransformDraft) {
      return visibleGuides
    }

    return visibleGuides.map((guide) =>
      guide.id === guideTransformDraft.guideId
        ? {
            ...guide,
            position: [
              guideTransformDraft.position[0],
              guide.position[1],
              guideTransformDraft.position[1],
            ] as [number, number, number],
            rotation: [guide.rotation[0], guideTransformDraft.rotation, guide.rotation[2]] as [
              number,
              number,
              number,
            ],
            scale: guideTransformDraft.scale,
          }
        : guide,
    )
  }, [guideTransformDraft, visibleGuides])
  const selectedGuideId =
    selectedReferenceId && guideById.has(selectedReferenceId as GuideNode['id'])
      ? (selectedReferenceId as GuideNode['id'])
      : null
  const selectedGuide = useMemo(
    () => displayGuides.find((guide) => guide.id === selectedGuideId) ?? null,
    [displayGuides, selectedGuideId],
  )
  const selectedGuideResolvedUrl = useResolvedAssetUrl(selectedGuide?.url ?? '')
  const selectedGuideDimensions = useGuideImageDimensions(selectedGuideResolvedUrl)
  const selectedGuideCalibrationPoints = useMemo(() => {
    if (!selectedGuide) return [] as Array<[number, number]>
    if (calibrationDraft?.guideId === selectedGuide.id) {
      return calibrationDraft.points
    }
    return getGuideCalibrationDisplayPoints(selectedGuide.calibration)
  }, [calibrationDraft, selectedGuide])
  useEffect(() => {
    if (!calibrationDraft) {
      return
    }

    setMode('select')
    setTool(null)
    setFloorplanSelectionTool('click')
    setFloorplanMarqueeState(null)
    setWallEditNumericInput(null)
    setGuideDetectionRegionDraft(null)
    guideDetectionRegionInteractionRef.current = null
    clearDetectionRegionDraft()
  }, [calibrationDraft, clearDetectionRegionDraft, setFloorplanSelectionTool, setMode, setTool])
  useEffect(() => {
    if (calibrationDraft && calibrationDraft.guideId !== selectedGuideId) {
      clearCalibrationDraft()
    }
  }, [calibrationDraft, clearCalibrationDraft, selectedGuideId])
  useEffect(() => {
    if (detectionRegionDraftGuideId && detectionRegionDraftGuideId !== selectedGuideId) {
      clearDetectionRegionDraft()
      setGuideDetectionRegionDraft(null)
      guideDetectionRegionInteractionRef.current = null
    }
  }, [clearDetectionRegionDraft, detectionRegionDraftGuideId, selectedGuideId])
  useEffect(() => {
    if (guideCalibrationDialog && calibrationDraft?.guideId !== guideCalibrationDialog.guideId) {
      setGuideCalibrationDialog(null)
      setGuideCalibrationInput('')
      setGuideCalibrationError(null)
    }
  }, [calibrationDraft, guideCalibrationDialog])
  const activeGuideInteractionGuideId = guideTransformDraft
    ? (guideInteractionRef.current?.guideId ?? null)
    : null
  const activeGuideInteractionMode = guideTransformDraft
    ? (guideInteractionRef.current?.mode ?? null)
    : null
  const floorplanWalls = useMemo(() => walls.map(getFloorplanWall), [walls])
  const wallMiterData = useMemo(() => calculateLevelMiters(floorplanWalls), [floorplanWalls])
  const wallById = useMemo(() => new Map(walls.map((wall) => [wall.id, wall] as const)), [walls])
  const sketchLineById = useMemo(
    () => new Map(activeSketchLines.map((line) => [line.id, line] as const)),
    [activeSketchLines],
  )
  const sketchCircleById = useMemo(
    () => new Map(activeSketchCircles.map((circle) => [circle.id, circle] as const)),
    [activeSketchCircles],
  )
  const sketchLineEntries = useMemo<FloorplanSketchLineEntry[]>(
    () =>
      activeSketchLines
        .filter((line) => line.visible !== false && isSketchLineLongEnough(line.start, line.end))
        .map((line) => ({
          line,
          polygon: [toPoint2D(line.start), toPoint2D(line.end)],
        })),
    [activeSketchLines],
  )
  const sketchCircleEntries = useMemo<FloorplanSketchCircleEntry[]>(
    () =>
      activeSketchCircles
        .filter((circle) => circle.visible !== false && circle.radius > 1e-6)
        .map((circle) => ({
          circle,
          centerline: sampleSketchCircleCenterline(circle),
        })),
    [activeSketchCircles],
  )
  const sketchEndpointSnapPoints = useMemo<WallSketchSnapPoint[]>(
    () =>
      sketchLineEntries.flatMap(({ line }) => [
        {
          kind: 'sketch-endpoint',
          point: line.start,
          sourcePoint: line.start,
          sourceId: line.id,
          sourceEndpoint: 'start',
        },
        {
          kind: 'sketch-endpoint',
          point: line.end,
          sourcePoint: line.end,
          sourceId: line.id,
          sourceEndpoint: 'end',
        },
      ]),
    [sketchLineEntries],
  )
  const sketchProfiles = useMemo(
    () => detectClosedSketchProfiles(activeSketchLines, activeSketchCircles),
    [activeSketchCircles, activeSketchLines],
  )
  const selectedWallList = useMemo(
    () =>
      selectedIds
        .map((id) => wallById.get(id as WallNode['id']))
        .filter((wall): wall is WallNode => Boolean(wall)),
    [selectedIds, wallById],
  )
  const selectedSketchLineList = useMemo(
    () =>
      selectedIds
        .map((id) => sketchLineById.get(id as SketchLineNode['id']))
        .filter((line): line is SketchLineNode => Boolean(line)),
    [selectedIds, sketchLineById],
  )
  const selectedSketchCircleList = useMemo(
    () =>
      selectedIds
        .map((id) => sketchCircleById.get(id as SketchCircleNode['id']))
        .filter((circle): circle is SketchCircleNode => Boolean(circle)),
    [selectedIds, sketchCircleById],
  )
  const closedWallLoops = useMemo(() => detectClosedWallLoops(walls), [walls])
  const selectedClosedWallLoop = useMemo(() => {
    if (selectedWallList.length === 0) {
      return null
    }

    const selectedWallIds = new Set(selectedWallList.map((wall) => wall.id))
    return (
      closedWallLoops.find((loop) =>
        [...selectedWallIds].every((wallId) => loop.wallIds.includes(wallId)),
      ) ?? null
    )
  }, [closedWallLoops, selectedWallList])
  const selectedSketchProfile = useMemo(() => {
    if (selectedSketchLineList.length > 0) {
      const selectedLineIds = new Set(selectedSketchLineList.map((line) => line.id))
      return (
        sketchProfiles.find((profile) =>
          [...selectedLineIds].every((lineId) => profile.lineIds.includes(lineId)),
        ) ?? null
      )
    }

    if (selectedSketchCircleList.length === 1) {
      const selectedCircle = selectedSketchCircleList[0]!
      return (
        sketchProfiles.find((profile) => profile.circleIds?.includes(selectedCircle.id)) ?? null
      )
    }

    return null
  }, [selectedSketchCircleList, selectedSketchLineList, sketchProfiles])
  const floorplanWallById = useMemo(
    () => new Map(floorplanWalls.map((wall) => [wall.id, wall] as const)),
    [floorplanWalls],
  )
  const displayWallById = useMemo(() => {
    if (!(wallEndpointDraft || wallCurveDraft)) {
      return wallById
    }

    const nextWallById = new Map(wallById)

    if (wallEndpointDraft) {
      const wall = nextWallById.get(wallEndpointDraft.wallId)
      if (wall) {
        nextWallById.set(
          wall.id,
          buildWallWithUpdatedEndpoints(wall, wallEndpointDraft.start, wallEndpointDraft.end),
        )
      }
    }

    if (wallCurveDraft) {
      const wall = nextWallById.get(wallCurveDraft.wallId)
      if (wall) {
        nextWallById.set(wall.id, { ...wall, curveOffset: wallCurveDraft.curveOffset })
      }
    }

    return nextWallById
  }, [wallById, wallCurveDraft, wallEndpointDraft])
  const displayFloorplanWallById = useMemo(() => {
    if (!(wallEndpointDraft || wallCurveDraft)) {
      return floorplanWallById
    }

    const previewWallId = wallEndpointDraft?.wallId ?? wallCurveDraft?.wallId
    if (!previewWallId) {
      return floorplanWallById
    }

    const previewWall = displayWallById.get(previewWallId)
    if (!previewWall) {
      return floorplanWallById
    }

    const nextFloorplanWallById = new Map(floorplanWallById)
    nextFloorplanWallById.set(previewWall.id, getFloorplanWall(previewWall))
    return nextFloorplanWallById
  }, [displayWallById, floorplanWallById, wallCurveDraft, wallEndpointDraft])
  const wallPolygons = useMemo(
    () =>
      walls.map((wall) => {
        const floorplanWall = floorplanWallById.get(wall.id) ?? getFloorplanWall(wall)
        const polygon = getWallPlanFootprint(floorplanWall, wallMiterData)
        return {
          points: formatPolygonPoints(polygon),
          wall,
          polygon,
        }
      }),
    [floorplanWallById, wallMiterData, walls],
  )
  const displayWallPolygons = useMemo(() => {
    if (!(wallEndpointDraft || wallCurveDraft)) {
      return wallPolygons
    }

    const previewWallId = wallEndpointDraft?.wallId ?? wallCurveDraft?.wallId
    if (!previewWallId) {
      return wallPolygons
    }

    const previewWall = displayWallById.get(previewWallId)
    if (!previewWall) {
      return wallPolygons
    }

    const previewPolygon = getWallPlanFootprint(
      getFloorplanWall(previewWall),
      EMPTY_WALL_MITER_DATA,
    )

    return wallPolygons.map((entry) =>
      entry.wall.id === previewWall.id
        ? {
            wall: previewWall,
            polygon: previewPolygon,
            points: formatPolygonPoints(previewPolygon),
          }
        : entry,
    )
  }, [displayWallById, wallCurveDraft, wallEndpointDraft, wallPolygons])

  const openingsPolygons = useMemo(
    () =>
      openings.flatMap((opening) => {
        const wall = displayFloorplanWallById.get(opening.parentId as WallNode['id'])
        if (!wall) return []
        const polygon = getOpeningFootprint(wall, opening)
        return [
          {
            opening,
            points: formatPolygonPoints(polygon),
            polygon,
          },
        ]
      }),
    [displayFloorplanWallById, openings],
  )
  const slabPolygons = useMemo(
    () =>
      slabs.flatMap((slab) => {
        const polygon = toFloorplanPolygon(slab.polygon)
        if (polygon.length < 3) {
          return []
        }

        const holes = (slab.holes ?? [])
          .map((hole) => toFloorplanPolygon(hole))
          .filter((hole) => hole.length >= 3)

        return [
          {
            slab,
            polygon,
            holes,
            path: formatPolygonPath(polygon, holes),
          },
        ]
      }),
    [slabs],
  )
  const displaySlabPolygons = useMemo(() => {
    if (!slabBoundaryDraft) {
      return slabPolygons
    }

    return slabPolygons.map((entry) =>
      entry.slab.id === slabBoundaryDraft.slabId
        ? {
            ...entry,
            polygon: slabBoundaryDraft.polygon.map(toPoint2D),
            path: formatPolygonPath(slabBoundaryDraft.polygon.map(toPoint2D), entry.holes),
          }
        : entry,
    )
  }, [slabBoundaryDraft, slabPolygons])
  const ceilingPolygons = useMemo(
    () =>
      ceilings.flatMap((ceiling) => {
        const polygon = toFloorplanPolygon(ceiling.polygon)
        if (polygon.length < 3) {
          return []
        }

        const holes = (ceiling.holes ?? [])
          .map((hole) => toFloorplanPolygon(hole))
          .filter((hole) => hole.length >= 3)

        return [
          {
            ceiling,
            polygon,
            holes,
            path: formatPolygonPath(polygon, holes),
          },
        ]
      }),
    [ceilings],
  )
  const displayCeilingPolygons = useMemo(() => {
    if (!ceilingBoundaryDraft) {
      return ceilingPolygons
    }

    return ceilingPolygons.map((entry) =>
      entry.ceiling.id === ceilingBoundaryDraft.ceilingId
        ? {
            ...entry,
            holes: ceilingBoundaryDraft.holes.map((hole) => hole.map(toPoint2D)),
            polygon: ceilingBoundaryDraft.polygon.map(toPoint2D),
            path: formatPolygonPath(
              ceilingBoundaryDraft.polygon.map(toPoint2D),
              ceilingBoundaryDraft.holes.map((hole) => hole.map(toPoint2D)),
            ),
          }
        : entry,
    )
  }, [ceilingBoundaryDraft, ceilingPolygons])
  const fencePolygons = useMemo<FencePolygonEntry[]>(
    () =>
      fences.flatMap((fence) => {
        const line = {
          start: toPoint2D(fence.start),
          end: toPoint2D(fence.end),
        }
        if (getPlanPointDistance(line.start, line.end) <= Number.EPSILON) {
          return []
        }

        const polygon = getThickPlanLinePolygon(line, getFloorplanFenceThickness(fence))
        return [
          {
            fence,
            polygon,
            points: formatPolygonPoints(polygon),
          },
        ]
      }),
    [fences],
  )
  const zonePolygons = useMemo(
    () =>
      zones.flatMap((zone) => {
        const polygon = toFloorplanPolygon(zone.polygon)
        if (polygon.length < 3) {
          return []
        }

        return [
          {
            zone,
            polygon,
            points: formatPolygonPoints(polygon),
          },
        ]
      }),
    [zones],
  )
  const displayZonePolygons = useMemo(() => {
    if (!zoneBoundaryDraft) {
      return zonePolygons
    }

    return zonePolygons.map((entry) =>
      entry.zone.id === zoneBoundaryDraft.zoneId
        ? {
            ...entry,
            polygon: zoneBoundaryDraft.polygon.map(toPoint2D),
            points: formatPolygonPoints(zoneBoundaryDraft.polygon.map(toPoint2D)),
          }
        : entry,
    )
  }, [zoneBoundaryDraft, zonePolygons])
  const deliveryPerimeterGuides = useMemo(() => {
    if (currentBuildingNode?.type !== 'building') {
      return [] as PerimeterGuide[]
    }

    return getPerimeterGuidesForNode(currentBuildingNode, sceneNodes, unit)
  }, [currentBuildingNode, sceneNodes, unit])
  const levelDescendantNodeById = useMemo(
    () => new Map(levelDescendantNodes.map((node) => [node.id, node] as const)),
    [levelDescendantNodes],
  )
  const floorplanItems = useMemo(
    () =>
      levelDescendantNodes.filter(
        (node): node is ItemNode =>
          node.type === 'item' &&
          node.visible !== false &&
          node.asset.category !== 'door' &&
          node.asset.category !== 'window',
      ),
    [levelDescendantNodes],
  )
  const floorplanStairs = useMemo(
    () =>
      levelDescendantNodes.filter(
        (node): node is StairNode => node.type === 'stair' && node.visible !== false,
      ),
    [levelDescendantNodes],
  )
  const floorplanItemEntries = useMemo(() => {
    const transformCache = new Map<string, FloorplanNodeTransform | null>()

    return floorplanItems.flatMap((item) => {
      const transform = getItemFloorplanTransform(item, levelDescendantNodeById, transformCache)
      if (!transform) {
        return []
      }

      const [width, , depth] = getScaledDimensions(item)
      const polygon = getRotatedRectanglePolygon(
        transform.position,
        width,
        depth,
        transform.rotation,
      )

      return [
        {
          item,
          points: formatPolygonPoints(polygon),
          polygon,
        },
      ]
    })
  }, [cursorPoint, floorplanItems, levelDescendantNodeById, movingFloorplanNodeRevision])
  const floorplanStairEntries = useMemo(
    () =>
      floorplanStairs.flatMap((stair) => {
        const displayStair =
          movingNode?.type === 'stair' && movingNode.id === stair.id
            ? (() => {
                const live = useLiveTransforms.getState().get(stair.id)
                const liveX = cursorPoint?.[0] ?? live?.position[0] ?? stair.position[0]
                const liveZ = cursorPoint?.[1] ?? live?.position[2] ?? stair.position[2]
                const liveRotation = live?.rotation ?? stair.rotation

                return {
                  ...stair,
                  position: [liveX, stair.position[1], liveZ] as StairNode['position'],
                  rotation: liveRotation,
                }
              })()
            : stair
        const segments = (displayStair.children ?? [])
          .map((childId) => levelDescendantNodeById.get(childId as AnyNodeId))
          .filter(
            (node): node is StairSegmentNode =>
              node?.type === 'stair-segment' && node.visible !== false,
          )
        const entry = buildFloorplanStairEntry(displayStair, segments)
        return entry ? [entry] : []
      }),
    [
      cursorPoint,
      floorplanStairs,
      levelDescendantNodeById,
      movingFloorplanNodeRevision,
      movingNode,
    ],
  )
  const selectedOpeningEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return openingsPolygons.find(({ opening }) => opening.id === selectedIds[0]) ?? null
  }, [openingsPolygons, selectedIds])
  const selectedItemEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return floorplanItemEntries.find(({ item }) => item.id === selectedIds[0]) ?? null
  }, [floorplanItemEntries, selectedIds])
  const selectedWallEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return displayWallPolygons.find(({ wall }) => wall.id === selectedIds[0]) ?? null
  }, [displayWallPolygons, selectedIds])
  const selectedSketchLineEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return sketchLineEntries.find(({ line }) => line.id === selectedIds[0]) ?? null
  }, [selectedIds, sketchLineEntries])
  const selectedSketchCircleEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return sketchCircleEntries.find(({ circle }) => circle.id === selectedIds[0]) ?? null
  }, [selectedIds, sketchCircleEntries])
  const selectedWallPair = useMemo(() => {
    if (selectedIds.length !== 2) {
      return null
    }

    const [firstId, secondId] = selectedIds
    const first = firstId ? wallById.get(firstId as WallNode['id']) : null
    const second = secondId ? wallById.get(secondId as WallNode['id']) : null
    return first && second ? ([first, second] as const) : null
  }, [selectedIds, wallById])
  const selectedStairEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return floorplanStairEntries.find(({ stair }) => stair.id === selectedIds[0]) ?? null
  }, [floorplanStairEntries, selectedIds])
  const slabById = useMemo(() => new Map(slabs.map((slab) => [slab.id, slab] as const)), [slabs])
  const ceilingById = useMemo(
    () => new Map(ceilings.map((ceiling) => [ceiling.id, ceiling] as const)),
    [ceilings],
  )
  const fenceById = useMemo(
    () => new Map(fences.map((fence) => [fence.id, fence] as const)),
    [fences],
  )
  const zoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone] as const)), [zones])
  const selectedSlabEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return displaySlabPolygons.find(({ slab }) => slab.id === selectedIds[0]) ?? null
  }, [displaySlabPolygons, selectedIds])
  const selectedCeilingEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return displayCeilingPolygons.find(({ ceiling }) => ceiling.id === selectedIds[0]) ?? null
  }, [displayCeilingPolygons, selectedIds])
  const selectedFenceEntry = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null
    }

    return fencePolygons.find(({ fence }) => fence.id === selectedIds[0]) ?? null
  }, [fencePolygons, selectedIds])
  const selectedZoneEntry = useMemo(() => {
    if (!selectedZoneId) {
      return null
    }

    return displayZonePolygons.find(({ zone }) => zone.id === selectedZoneId) ?? null
  }, [displayZonePolygons, selectedZoneId])
  const wallFilletPreview = useMemo<WallFilletPreview | null>(() => {
    if (!(wallEditOperation === 'fillet' && selectedWallEntry && hoveredWallId)) {
      return null
    }

    const hoveredWall = wallById.get(hoveredWallId)
    if (!hoveredWall || hoveredWall.id === selectedWallEntry.wall.id) {
      return null
    }

    return getWallFilletPreview({
      primary: selectedWallEntry.wall,
      secondary: hoveredWall,
    })
  }, [hoveredWallId, selectedWallEntry, wallById, wallEditOperation])

  const faceSketchOutline = useMemo(
    () => getFeatureFaceSketchOutline(sketchPlane, sceneNodes),
    [sceneNodes, sketchPlane],
  )
  const faceSketchOutlinePoints = useMemo(
    () => (faceSketchOutline.length >= 3 ? formatPolygonPoints(faceSketchOutline) : null),
    [faceSketchOutline],
  )
  const sketchSnapWalls = isFeatureSketchActive ? [] : walls
  const sketchContextWallPolygons = isFeatureSketchActive ? [] : displayWallPolygons
  const sketchContextSlabPolygons = isFeatureSketchActive ? [] : displaySlabPolygons
  const sketchContextCeilingPolygons = isFeatureSketchActive ? [] : displayCeilingPolygons
  const sketchContextFencePolygons = isFeatureSketchActive ? [] : fencePolygons
  const sketchContextOpeningPolygons = isFeatureSketchActive ? [] : openingsPolygons
  const sketchContextItemEntries = isFeatureSketchActive ? [] : floorplanItemEntries
  const sketchContextStairEntries = isFeatureSketchActive ? [] : floorplanStairEntries
  const sketchContextZonePolygons = isFeatureSketchActive ? [] : displayZonePolygons

  const isSiteEditActive = !isFeatureSketchActive && phase === 'site'
  const isWallBuildActive = phase === 'structure' && mode === 'build' && tool === 'wall'
  const isSketchLineBuildActive =
    phase === 'structure' &&
    mode === 'build' &&
    (tool === 'sketch-line' || tool === 'sketch-construction-line')
  const isSketchRectangleBuildActive =
    phase === 'structure' && mode === 'build' && tool === 'sketch-rectangle'
  const isSketchCircleBuildActive =
    phase === 'structure' && mode === 'build' && tool === 'sketch-circle'
  const isSketchArcBuildActive = phase === 'structure' && mode === 'build' && tool === 'sketch-arc'
  const isSketchDimensionActive =
    phase === 'structure' && mode === 'build' && tool === 'smart-dimension'
  const isSlabBuildActive = phase === 'structure' && mode === 'build' && tool === 'slab'
  const isCeilingBuildActive = phase === 'structure' && mode === 'build' && tool === 'ceiling'
  const isFenceBuildActive = phase === 'structure' && mode === 'build' && tool === 'fence'
  const isZoneBuildActive = phase === 'structure' && mode === 'build' && tool === 'zone'
  const isDoorBuildActive = phase === 'structure' && mode === 'build' && tool === 'door'
  const isWindowBuildActive = phase === 'structure' && mode === 'build' && tool === 'window'
  const isPolygonBuildActive = isSlabBuildActive || isCeilingBuildActive || isZoneBuildActive
  const isOpeningBuildActive = isDoorBuildActive || isWindowBuildActive
  const isOpeningMoveActive = movingOpeningType !== null
  const isOpeningPlacementActive = isOpeningBuildActive || isOpeningMoveActive
  const isStairBuildActive = phase === 'structure' && mode === 'build' && tool === 'stair'
  const activeSketchDraftKind = sketchLineDraft
    ? 'line'
    : sketchRectangleDraft
      ? 'rectangle'
      : sketchCircleDraft
        ? 'circle'
        : sketchArcDraft
          ? 'arc'
          : null
  const canCommitSketchDraft = useMemo(() => {
    if (sketchLineDraft) {
      return isSketchLineLongEnough(sketchLineDraft.start, sketchLineDraft.end)
    }

    if (sketchRectangleDraft) {
      return isSketchLineLongEnough(sketchRectangleDraft.start, sketchRectangleDraft.end)
    }

    if (sketchCircleDraft) {
      return (
        Math.hypot(
          sketchCircleDraft.edge[0] - sketchCircleDraft.center[0],
          sketchCircleDraft.edge[1] - sketchCircleDraft.center[1],
        ) > 1e-6
      )
    }

    if (sketchArcDraft?.start) {
      return (
        Math.hypot(
          sketchArcDraft.end[0] - sketchArcDraft.center[0],
          sketchArcDraft.end[1] - sketchArcDraft.center[1],
        ) > 1e-6 &&
        Math.hypot(
          sketchArcDraft.end[0] - sketchArcDraft.start[0],
          sketchArcDraft.end[1] - sketchArcDraft.start[1],
        ) > 1e-6
      )
    }

    return false
  }, [sketchArcDraft, sketchCircleDraft, sketchLineDraft, sketchRectangleDraft])
  const isStairMoveActive = movingNode?.type === 'stair'
  const isSlabMoveActive = movingNode?.type === 'slab'
  const isCeilingMoveActive = movingNode?.type === 'ceiling'
  const isFenceMoveActive = movingNode?.type === 'fence'
  const isWallMoveActive = movingNode?.type === 'wall'
  const isWallCurveActive = curvingWall?.type === 'wall'

  useEffect(() => {
    if (!isSketchDimensionActive) {
      setSketchDistanceDimensionDraft(null)
    }
  }, [isSketchDimensionActive, setSketchDistanceDimensionDraft])
  const isItemPlacementPreviewActive =
    (mode === 'build' && tool === 'item') || movingNode?.type === 'item'
  const isFloorItemBuildActive = mode === 'build' && tool === 'item' && !selectedItem?.attachTo
  const isFloorItemMoveActive = movingNode?.type === 'item' && !movingNode.asset.attachTo
  const isFloorplanGridInteractionActive =
    isStairBuildActive ||
    isStairMoveActive ||
    isSlabMoveActive ||
    isCeilingMoveActive ||
    isFenceMoveActive ||
    isWallMoveActive ||
    isWallCurveActive ||
    isFloorItemBuildActive ||
    isFloorItemMoveActive
  const floorplanPreviewStairSegment = useMemo(
    () =>
      StairSegmentNodeSchema.parse({
        id: 'sseg_floorplan_preview',
        segmentType: 'stair',
        width: DEFAULT_STAIR_WIDTH,
        length: DEFAULT_STAIR_LENGTH,
        height: DEFAULT_STAIR_HEIGHT,
        stepCount: DEFAULT_STAIR_STEP_COUNT,
        attachmentSide: DEFAULT_STAIR_ATTACHMENT_SIDE,
        fillToFloor: DEFAULT_STAIR_FILL_TO_FLOOR,
        thickness: DEFAULT_STAIR_THICKNESS,
        position: [0, 0, 0],
        metadata: { isTransient: true, isFloorplanPreview: true },
      }),
    [],
  )
  const floorplanPreviewStairEntry = useMemo(() => {
    if (!(isStairBuildActive && stairBuildPreviewPoint)) {
      return null
    }

    const previewStair = StairNodeSchema.parse({
      id: 'stair_floorplan_preview',
      name: 'Staircase preview',
      position: [stairBuildPreviewPoint[0], 0, stairBuildPreviewPoint[1]],
      rotation: stairBuildPreviewRotation,
      children: [floorplanPreviewStairSegment.id],
      metadata: { isTransient: true, isFloorplanPreview: true },
    })

    return buildFloorplanStairEntry(previewStair, [floorplanPreviewStairSegment])
  }, [
    floorplanPreviewStairSegment,
    isStairBuildActive,
    stairBuildPreviewPoint,
    stairBuildPreviewRotation,
  ])
  const renderedFloorplanStairEntries = useMemo(
    () =>
      floorplanPreviewStairEntry
        ? [...floorplanStairEntries, floorplanPreviewStairEntry]
        : floorplanStairEntries,
    [floorplanPreviewStairEntry, floorplanStairEntries],
  )
  const floorplanOpeningLocalY = useMemo(() => {
    if (movingNode?.type === 'door' || movingNode?.type === 'window') {
      return snapToHalf(movingNode.position[1])
    }

    if (isWindowBuildActive) {
      // Floorplan is top-down, so new windows need an explicit wall-local height.
      return snapToHalf(FLOORPLAN_DEFAULT_WINDOW_LOCAL_Y)
    }

    return 0
  }, [isWindowBuildActive, movingNode])
  const isMarqueeSelectionToolActive =
    mode === 'select' &&
    floorplanSelectionTool === 'marquee' &&
    !movingNode &&
    structureLayer !== 'zones'
  const isDeleteMode = mode === 'delete' && !movingNode
  const canSelectElementFloorplanGeometry =
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    structureLayer !== 'zones' &&
    !isFeatureSketchActive
  const canInteractElementFloorplanGeometry =
    !isFeatureSketchActive && (isDeleteMode || canSelectElementFloorplanGeometry)
  const canSelectActiveSketchGeometry =
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    phase === 'structure' &&
    structureLayer !== 'zones'
  const canInteractFloorplanSketchLines =
    isDeleteMode ||
    canSelectElementFloorplanGeometry ||
    canSelectActiveSketchGeometry ||
    isSketchDimensionActive
  const canInteractFloorplanSketchCircles =
    isDeleteMode ||
    canSelectElementFloorplanGeometry ||
    canSelectActiveSketchGeometry ||
    isSketchDimensionActive
  const canInteractFloorplanSlabs =
    !isFeatureSketchActive && (isDeleteMode || canSelectElementFloorplanGeometry)
  const canInteractFloorplanCeilings =
    !isFeatureSketchActive && (isDeleteMode || canSelectElementFloorplanGeometry)
  const canInteractFloorplanFences =
    !isFeatureSketchActive && (isDeleteMode || canSelectElementFloorplanGeometry)
  const canInteractWithGuides =
    !isFeatureSketchActive && showGuides && canSelectElementFloorplanGeometry
  const canSelectFloorplanZones =
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    structureLayer === 'zones' &&
    !isFeatureSketchActive
  const canInteractFloorplanZones = isDeleteMode || canSelectFloorplanZones
  const isFloorplanStructureContextActive = phase === 'structure' && structureLayer !== 'zones'
  const isFloorplanFurnishContextActive = phase === 'furnish'
  const isFloorplanItemContextActive =
    isFloorplanFurnishContextActive || isFloorplanStructureContextActive
  const canSelectFloorplanStairs =
    !isFeatureSketchActive &&
    ((mode === 'select' &&
      floorplanSelectionTool === 'click' &&
      !movingNode &&
      isFloorplanStructureContextActive) ||
      isDeleteMode)
  const canSelectFloorplanItems =
    !isFeatureSketchActive &&
    ((mode === 'select' &&
      floorplanSelectionTool === 'click' &&
      !movingNode &&
      isFloorplanItemContextActive) ||
      isDeleteMode)
  const canFocusFloorplanStairs =
    !isFeatureSketchActive &&
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    isFloorplanStructureContextActive
  const canFocusFloorplanItems =
    !isFeatureSketchActive &&
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    isFloorplanItemContextActive
  const visibleSitePolygon = phase === 'site' ? displaySitePolygon : null
  const shouldShowSiteBoundaryHandles = isSiteEditActive && visibleSitePolygon !== null
  const shouldShowPersistentWallEndpointHandles =
    !isFeatureSketchActive && mode === 'select' && !movingNode
  const shouldShowSlabBoundaryHandles =
    !isFeatureSketchActive &&
    mode === 'select' &&
    !movingNode &&
    floorplanSelectionTool === 'click' &&
    selectedSlabEntry !== null
  const shouldShowCeilingBoundaryHandles =
    !isFeatureSketchActive &&
    mode === 'select' &&
    !movingNode &&
    floorplanSelectionTool === 'click' &&
    selectedCeilingEntry !== null
  const shouldShowZoneBoundaryHandles =
    !isFeatureSketchActive && canSelectFloorplanZones && selectedZoneEntry !== null
  const showZonePolygons = true // Zone polygons always visible (labels always clickable)
  const visibleZonePolygons = displayZonePolygons
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const highlightedFloorplanIdSet = useMemo(
    () => new Set([...selectedIds, ...previewSelectedIds]),
    [previewSelectedIds, selectedIds],
  )
  const activeMarqueeBounds = useMemo(() => {
    if (!floorplanMarqueeState) {
      return null
    }

    return getFloorplanSelectionBounds(
      floorplanMarqueeState.startPlanPoint,
      floorplanMarqueeState.currentPlanPoint,
    )
  }, [floorplanMarqueeState])
  const visibleMarqueeBounds = useMemo(() => {
    if (!(floorplanMarqueeState && activeMarqueeBounds)) {
      return null
    }

    const dragDistance = Math.hypot(
      floorplanMarqueeState.currentPlanPoint[0] - floorplanMarqueeState.startPlanPoint[0],
      floorplanMarqueeState.currentPlanPoint[1] - floorplanMarqueeState.startPlanPoint[1],
    )

    return dragDistance > 0 ? activeMarqueeBounds : null
  }, [activeMarqueeBounds, floorplanMarqueeState])
  const visibleSvgMarqueeBounds = useMemo(() => {
    if (!visibleMarqueeBounds) {
      return null
    }

    return toSvgSelectionBounds(visibleMarqueeBounds)
  }, [visibleMarqueeBounds])
  const wallEndpointHandles = useMemo(() => {
    if (isOpeningPlacementActive || movingNode) {
      return []
    }

    return displayWallPolygons.flatMap(({ wall }) => {
      const isSelected = selectedIdSet.has(wall.id)
      const isVisible =
        shouldShowPersistentWallEndpointHandles ||
        isWallBuildActive ||
        isSelected ||
        wallEndpointDraft?.wallId === wall.id
      if (!isVisible) {
        return []
      }

      return (['start', 'end'] as const).map((endpoint) => ({
        wall,
        endpoint,
        point: endpoint === 'start' ? wall.start : wall.end,
        isSelected,
        isActive: wallEndpointDraft?.wallId === wall.id && wallEndpointDraft.endpoint === endpoint,
      }))
    })
  }, [
    displayWallPolygons,
    isOpeningPlacementActive,
    isWallBuildActive,
    movingNode,
    selectedIdSet,
    shouldShowPersistentWallEndpointHandles,
    wallEndpointDraft,
  ])
  const wallCurveHandles = useMemo(() => {
    if (
      isOpeningPlacementActive ||
      movingNode ||
      mode !== 'select' ||
      floorplanSelectionTool !== 'click' ||
      !selectedWallEntry
    ) {
      return []
    }

    const hasWallChildrenBlockingCurve = (selectedWallEntry.wall.children ?? []).some((childId) => {
      const childNode = levelDescendantNodeById.get(childId as AnyNodeId)
      if (!childNode) {
        return false
      }

      if (childNode.type === 'door' || childNode.type === 'window') {
        return true
      }

      if (childNode.type === 'item') {
        const attachTo = childNode.asset?.attachTo
        return attachTo === 'wall' || attachTo === 'wall-side'
      }

      return false
    })
    if (hasWallChildrenBlockingCurve) {
      return []
    }

    const centerPoint = getWallMidpointHandlePoint(selectedWallEntry.wall)

    return [
      {
        wall: selectedWallEntry.wall,
        point: [centerPoint.x, centerPoint.y] as WallPlanPoint,
        isActive: wallCurveDraft?.wallId === selectedWallEntry.wall.id,
      },
    ]
  }, [
    floorplanSelectionTool,
    isOpeningPlacementActive,
    mode,
    movingNode,
    levelDescendantNodeById,
    selectedWallEntry,
    wallCurveDraft,
  ])
  const slabVertexHandles = useMemo(() => {
    if (!shouldShowSlabBoundaryHandles) {
      return []
    }

    return selectedSlabEntry.polygon.map((point, vertexIndex) => ({
      nodeId: selectedSlabEntry.slab.id,
      vertexIndex,
      point: toWallPlanPoint(point),
      isActive:
        slabVertexDragState?.slabId === selectedSlabEntry.slab.id &&
        slabVertexDragState.vertexIndex === vertexIndex,
    }))
  }, [selectedSlabEntry, shouldShowSlabBoundaryHandles, slabVertexDragState])
  const slabMidpointHandles = useMemo(() => {
    if (!(shouldShowSlabBoundaryHandles && !slabVertexDragState)) {
      return []
    }

    return selectedSlabEntry.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length]
      return {
        nodeId: selectedSlabEntry.slab.id,
        edgeIndex,
        point: [
          (point.x + (nextPoint?.x ?? point.x)) / 2,
          (point.y + (nextPoint?.y ?? point.y)) / 2,
        ] as WallPlanPoint,
      }
    })
  }, [selectedSlabEntry, shouldShowSlabBoundaryHandles, slabVertexDragState])
  const ceilingVertexHandles = useMemo(() => {
    if (!shouldShowCeilingBoundaryHandles) {
      return []
    }

    return selectedCeilingEntry.polygon.map((point, vertexIndex) => ({
      nodeId: selectedCeilingEntry.ceiling.id,
      vertexIndex,
      point: toWallPlanPoint(point),
      isActive:
        ceilingVertexDragState?.ceilingId === selectedCeilingEntry.ceiling.id &&
        ceilingVertexDragState.vertexIndex === vertexIndex,
    }))
  }, [ceilingVertexDragState, selectedCeilingEntry, shouldShowCeilingBoundaryHandles])
  const ceilingMidpointHandles = useMemo(() => {
    if (!(shouldShowCeilingBoundaryHandles && !ceilingVertexDragState)) {
      return []
    }

    return selectedCeilingEntry.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length]
      return {
        nodeId: selectedCeilingEntry.ceiling.id,
        edgeIndex,
        point: [
          (point.x + (nextPoint?.x ?? point.x)) / 2,
          (point.y + (nextPoint?.y ?? point.y)) / 2,
        ] as WallPlanPoint,
      }
    })
  }, [ceilingVertexDragState, selectedCeilingEntry, shouldShowCeilingBoundaryHandles])
  const siteVertexHandles = useMemo(() => {
    if (!(shouldShowSiteBoundaryHandles && visibleSitePolygon)) {
      return []
    }

    return visibleSitePolygon.polygon.map((point, vertexIndex) => ({
      nodeId: visibleSitePolygon.site.id,
      vertexIndex,
      point: toWallPlanPoint(point),
      isActive:
        siteVertexDragState?.siteId === visibleSitePolygon.site.id &&
        siteVertexDragState.vertexIndex === vertexIndex,
    }))
  }, [shouldShowSiteBoundaryHandles, siteVertexDragState, visibleSitePolygon])
  const siteMidpointHandles = useMemo(() => {
    if (!(shouldShowSiteBoundaryHandles && visibleSitePolygon && !siteVertexDragState)) {
      return []
    }

    return visibleSitePolygon.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length]
      return {
        nodeId: visibleSitePolygon.site.id,
        edgeIndex,
        point: [
          (point.x + (nextPoint?.x ?? point.x)) / 2,
          (point.y + (nextPoint?.y ?? point.y)) / 2,
        ] as WallPlanPoint,
      }
    })
  }, [shouldShowSiteBoundaryHandles, siteVertexDragState, visibleSitePolygon])
  const zoneVertexHandles = useMemo(() => {
    if (!shouldShowZoneBoundaryHandles) {
      return []
    }

    return selectedZoneEntry.polygon.map((point, vertexIndex) => ({
      nodeId: selectedZoneEntry.zone.id,
      vertexIndex,
      point: toWallPlanPoint(point),
      isActive:
        zoneVertexDragState?.zoneId === selectedZoneEntry.zone.id &&
        zoneVertexDragState.vertexIndex === vertexIndex,
    }))
  }, [selectedZoneEntry, shouldShowZoneBoundaryHandles, zoneVertexDragState])
  const zoneMidpointHandles = useMemo(() => {
    if (!(shouldShowZoneBoundaryHandles && !zoneVertexDragState)) {
      return []
    }

    return selectedZoneEntry.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length]
      return {
        nodeId: selectedZoneEntry.zone.id,
        edgeIndex,
        point: [
          (point.x + (nextPoint?.x ?? point.x)) / 2,
          (point.y + (nextPoint?.y ?? point.y)) / 2,
        ] as WallPlanPoint,
      }
    })
  }, [selectedZoneEntry, shouldShowZoneBoundaryHandles, zoneVertexDragState])

  const draftPolygon = useMemo(() => {
    if (!(levelId && draftStart && draftEnd && isWallLongEnough(draftStart, draftEnd))) {
      return null
    }

    const draftWall = getFloorplanWall(buildDraftWall(levelId, draftStart, draftEnd))
    // Keep the live draft preview cheap; full level-wide mitering here runs on every mouse move.
    return getWallPlanFootprint(draftWall, EMPTY_WALL_MITER_DATA)
  }, [draftEnd, draftStart, levelId])
  const draftPolygonPoints = useMemo(
    () => (draftPolygon ? formatPolygonPoints(draftPolygon) : null),
    [draftPolygon],
  )
  const fenceDraftPolygonPoints = useMemo(() => {
    if (!fenceDraft) {
      return null
    }

    const polygon = getThickPlanLinePolygon(
      {
        start: toPoint2D(fenceDraft.start),
        end: toPoint2D(fenceDraft.end),
      },
      0.08,
    )
    return formatPolygonPoints(polygon)
  }, [fenceDraft])
  const wallOffsetPreviewPolygon = useMemo(() => {
    if (!(levelId && wallOffsetPreview)) {
      return null
    }

    const previewWall = getFloorplanWall(
      buildDraftWall(levelId, wallOffsetPreview.start, wallOffsetPreview.end),
    )
    return getWallPlanFootprint(previewWall, EMPTY_WALL_MITER_DATA)
  }, [levelId, wallOffsetPreview])
  const wallOffsetPreviewPoints = useMemo(
    () => (wallOffsetPreviewPolygon ? formatPolygonPoints(wallOffsetPreviewPolygon) : null),
    [wallOffsetPreviewPolygon],
  )
  const wallFilletPreviewPoints = useMemo(
    () =>
      wallFilletPreview?.points
        ? formatPolygonPoints(wallFilletPreview.points.map(toPoint2D))
        : null,
    [wallFilletPreview],
  )
  const wallEditPreviewSegments = useMemo<WallEditPreviewSegment[]>(() => {
    if (!(wallEditOperation && cursorPoint)) {
      return []
    }

    const nodes = useScene.getState().nodes
    const hoveredWall = hoveredWallId ? wallById.get(hoveredWallId) : null

    if ((wallEditOperation === 'trim-extend' || wallEditOperation === 'split') && hoveredWall) {
      const result =
        wallEditOperation === 'trim-extend'
          ? buildTrimExtendWallPlan({
              wall: hoveredWall,
              walls,
              clickPoint: cursorPoint,
              nodes,
            })
          : buildSplitWallPlan({ wall: hoveredWall, splitPoint: cursorPoint, nodes })

      const validSegments = getWallPreviewSegmentsFromResult(result, nodes)
      return result.ok && validSegments.length > 0
        ? validSegments
        : [
            {
              id: `invalid:${hoveredWall.id}`,
              start: hoveredWall.start,
              end: hoveredWall.end,
              isValid: false,
            },
          ]
    }

    if (
      (wallEditOperation === 'merge' || wallEditOperation === 'fillet') &&
      selectedWallEntry &&
      hoveredWall
    ) {
      if (hoveredWall.id === selectedWallEntry.wall.id) {
        return []
      }

      const result =
        wallEditOperation === 'merge'
          ? buildMergeWallsPlan({
              primary: selectedWallEntry.wall,
              secondary: hoveredWall,
              nodes,
            })
          : buildFilletWallsPlan({
              primary: selectedWallEntry.wall,
              secondary: hoveredWall,
              nodes,
            })

      const validSegments = getWallPreviewSegmentsFromResult(result, nodes)
      return result.ok && validSegments.length > 0
        ? validSegments
        : [
            {
              id: `invalid:${hoveredWall.id}`,
              start: hoveredWall.start,
              end: hoveredWall.end,
              isValid: false,
            },
          ]
    }

    if (wallEditOperation === 'chamfer' && selectedWallEntry && hoveredWall) {
      if (hoveredWall.id === selectedWallEntry.wall.id) {
        return []
      }

      const result = buildChamferWallsPlan({
        primary: selectedWallEntry.wall,
        secondary: hoveredWall,
        nodes,
      })
      const validSegments = getWallPreviewSegmentsFromResult(result, nodes)
      return result.ok && validSegments.length > 0
        ? validSegments
        : [
            {
              id: `invalid:${hoveredWall.id}`,
              start: hoveredWall.start,
              end: hoveredWall.end,
              isValid: false,
            },
          ]
    }

    if (wallEditOperation === 'mirror' && hoveredWall && selectedWallList.length > 0) {
      const selectedWallIds = new Set(selectedWallList.map((wall) => wall.id))
      if (selectedWallIds.has(hoveredWall.id)) {
        return []
      }

      const result = buildMirrorWallsPlan({
        walls: selectedWallList,
        axisStart: hoveredWall.start,
        axisEnd: hoveredWall.end,
      })
      return getWallPreviewSegmentsFromResult(result, nodes)
    }

    if (wallEditOperation === 'linear-pattern' && hoveredWall && selectedWallList.length > 0) {
      const direction: WallPlanPoint = [
        hoveredWall.end[0] - hoveredWall.start[0],
        hoveredWall.end[1] - hoveredWall.start[1],
      ]
      const result = buildLinearPatternWallsPlan({
        walls: selectedWallList,
        direction,
      })
      return getWallPreviewSegmentsFromResult(result, nodes)
    }

    return []
  }, [
    cursorPoint,
    hoveredWallId,
    selectedWallEntry,
    selectedWallList,
    wallById,
    wallEditOperation,
    walls,
  ])
  const activePolygonDraftPoints = useMemo(() => {
    if (isZoneBuildActive) {
      return zoneDraftPoints
    }

    if (isCeilingBuildActive) {
      return ceilingDraftPoints
    }

    if (isSlabBuildActive) {
      return slabDraftPoints
    }

    return [] as WallPlanPoint[]
  }, [
    ceilingDraftPoints,
    isCeilingBuildActive,
    isSlabBuildActive,
    isZoneBuildActive,
    slabDraftPoints,
    zoneDraftPoints,
  ])
  const polygonDraftPolylinePoints = useMemo(() => {
    if (!(isPolygonBuildActive && cursorPoint && activePolygonDraftPoints.length > 0)) {
      return null
    }

    return formatPolygonPoints([...activePolygonDraftPoints.map(toPoint2D), toPoint2D(cursorPoint)])
  }, [activePolygonDraftPoints, cursorPoint, isPolygonBuildActive])
  const polygonDraftPolygonPoints = useMemo(() => {
    if (!(isPolygonBuildActive && cursorPoint && activePolygonDraftPoints.length >= 2)) {
      return null
    }

    return formatPolygonPoints([...activePolygonDraftPoints.map(toPoint2D), toPoint2D(cursorPoint)])
  }, [activePolygonDraftPoints, cursorPoint, isPolygonBuildActive])
  const polygonDraftClosingSegment = useMemo(() => {
    if (!(isPolygonBuildActive && cursorPoint && activePolygonDraftPoints.length >= 2)) {
      return null
    }

    const firstPoint = activePolygonDraftPoints[0]
    if (!firstPoint) {
      return null
    }

    return {
      x1: toSvgX(cursorPoint[0]),
      y1: toSvgY(cursorPoint[1]),
      x2: toSvgX(firstPoint[0]),
      y2: toSvgY(firstPoint[1]),
    }
  }, [activePolygonDraftPoints, cursorPoint, isPolygonBuildActive])
  const sketchCircleDraftCenterline = useMemo(() => {
    if (!sketchCircleDraft) {
      return [] as Point2D[]
    }

    const radius = Math.hypot(
      sketchCircleDraft.edge[0] - sketchCircleDraft.center[0],
      sketchCircleDraft.edge[1] - sketchCircleDraft.center[1],
    )
    if (radius <= 1e-6) {
      return [] as Point2D[]
    }

    return sampleSketchCircleCenterline({
      center: sketchCircleDraft.center,
      endAngle: Math.PI * 2,
      kind: 'circle',
      radius,
      startAngle: 0,
    })
  }, [sketchCircleDraft])
  const sketchCircleDraftPath = useMemo(
    () =>
      sketchCircleDraftCenterline.length > 0
        ? formatPolylinePath(sketchCircleDraftCenterline)
        : null,
    [sketchCircleDraftCenterline],
  )
  const sketchArcDraftCenterline = useMemo(() => {
    if (!sketchArcDraft) {
      return [] as Point2D[]
    }

    if (!sketchArcDraft.start) {
      return [toPoint2D(sketchArcDraft.center), toPoint2D(sketchArcDraft.end)]
    }

    const radius = Math.hypot(
      sketchArcDraft.start[0] - sketchArcDraft.center[0],
      sketchArcDraft.start[1] - sketchArcDraft.center[1],
    )
    if (radius <= 1e-6) {
      return [] as Point2D[]
    }

    return sampleSketchCircleCenterline({
      center: sketchArcDraft.center,
      endAngle: Math.atan2(
        sketchArcDraft.end[1] - sketchArcDraft.center[1],
        sketchArcDraft.end[0] - sketchArcDraft.center[0],
      ),
      kind: 'arc',
      radius,
      startAngle: Math.atan2(
        sketchArcDraft.start[1] - sketchArcDraft.center[1],
        sketchArcDraft.start[0] - sketchArcDraft.center[0],
      ),
    })
  }, [sketchArcDraft])
  const sketchArcDraftPath = useMemo(
    () =>
      sketchArcDraft?.start && sketchArcDraftCenterline.length > 0
        ? formatPolylinePath(sketchArcDraftCenterline)
        : null,
    [sketchArcDraft?.start, sketchArcDraftCenterline],
  )

  const svgAspectRatio = surfaceSize.width / surfaceSize.height || 1

  const fittedViewport = useMemo(() => {
    const sketchPoints = [
      ...faceSketchOutline,
      ...sketchLineEntries.flatMap((entry) => entry.polygon),
      ...sketchCircleEntries.flatMap((entry) => entry.centerline),
      ...sketchProfiles.flatMap((profile) => profile.points.map(toPoint2D)),
      ...(sketchLineDraft
        ? [toPoint2D(sketchLineDraft.start), toPoint2D(sketchLineDraft.end)]
        : []),
      ...(sketchRectangleDraft
        ? [toPoint2D(sketchRectangleDraft.start), toPoint2D(sketchRectangleDraft.end)]
        : []),
      ...sketchCircleDraftCenterline,
      ...sketchArcDraftCenterline,
    ]
    const allPoints = isFeatureSketchActive
      ? sketchPoints
      : [
          ...(visibleSitePolygon ? visibleSitePolygon.polygon : []),
          ...displaySlabPolygons.flatMap((entry) => entry.polygon),
          ...displayCeilingPolygons.flatMap((entry) => entry.polygon),
          ...fencePolygons.flatMap((entry) => entry.polygon),
          ...floorplanItemEntries.flatMap((entry) => entry.polygon),
          ...floorplanStairEntries.flatMap((entry) =>
            entry.segments.flatMap((segmentEntry) => segmentEntry.polygon),
          ),
          ...sketchPoints,
          ...visibleZonePolygons.flatMap((entry) => entry.polygon),
          ...wallPolygons.flatMap((entry) => entry.polygon),
        ]

    if (allPoints.length === 0) {
      return {
        centerX: 0,
        centerY: 0,
        width: Math.max(FALLBACK_VIEW_SIZE, FALLBACK_VIEW_SIZE * svgAspectRatio),
      }
    }

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const point of allPoints) {
      const svgPoint = toSvgPoint(point)
      minX = Math.min(minX, svgPoint.x)
      maxX = Math.max(maxX, svgPoint.x)
      minY = Math.min(minY, svgPoint.y)
      maxY = Math.max(maxY, svgPoint.y)
    }

    const rawWidth = maxX - minX
    const rawHeight = maxY - minY
    const paddedWidth = rawWidth + FLOORPLAN_PADDING * 2
    const paddedHeight = rawHeight + FLOORPLAN_PADDING * 2
    const width = Math.max(FALLBACK_VIEW_SIZE, paddedWidth, paddedHeight * svgAspectRatio)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    return {
      centerX,
      centerY,
      width,
    }
  }, [
    displayCeilingPolygons,
    displaySlabPolygons,
    faceSketchOutline,
    fencePolygons,
    floorplanItemEntries,
    floorplanStairEntries,
    isFeatureSketchActive,
    svgAspectRatio,
    sketchArcDraftCenterline,
    sketchCircleDraftCenterline,
    sketchCircleEntries,
    sketchLineDraft,
    sketchLineEntries,
    sketchProfiles,
    sketchRectangleDraft,
    visibleSitePolygon,
    visibleZonePolygons,
    wallPolygons,
  ])

  useEffect(() => {
    const host = viewportHostRef.current
    if (!host) {
      return
    }

    const updateSize = () => {
      const rect = host.getBoundingClientRect()
      setSurfaceSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(host)
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Track actual container position and size for SVG coordinate transforms
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setPanelRect({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      })
      setIsPanelReady(true)
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    const levelChanged = previousLevelIdRef.current !== (levelId ?? null)
    const sketchPlaneChanged =
      previousSketchPlaneSignatureRef.current !== activeSketchPlaneSignature

    if (levelChanged || sketchPlaneChanged) {
      previousLevelIdRef.current = levelId ?? null
      previousSketchPlaneSignatureRef.current = activeSketchPlaneSignature
      hasUserAdjustedViewportRef.current = false
      setViewport(fittedViewport)
      return
    }

    if (!hasUserAdjustedViewportRef.current) {
      setViewport(fittedViewport)
    }
  }, [activeSketchPlaneSignature, fittedViewport, levelId])

  const viewBox = useMemo(() => {
    const currentViewport = viewport ?? fittedViewport
    const width = currentViewport.width
    const height = width / svgAspectRatio

    return {
      minX: currentViewport.centerX - width / 2,
      minY: currentViewport.centerY - height / 2,
      width,
      height,
    }
  }, [fittedViewport, svgAspectRatio, viewport])
  const floorplanWorldUnitsPerPixel = useMemo(() => {
    const widthUnitsPerPixel = viewBox.width / Math.max(surfaceSize.width, 1)
    const heightUnitsPerPixel = viewBox.height / Math.max(surfaceSize.height, 1)

    return (widthUnitsPerPixel + heightUnitsPerPixel) / 2
  }, [surfaceSize.height, surfaceSize.width, viewBox.height, viewBox.width])
  const floorplanWallHitTolerance = useMemo(
    () => floorplanWorldUnitsPerPixel * (FLOORPLAN_WALL_HIT_STROKE_WIDTH / 2),
    [floorplanWorldUnitsPerPixel],
  )
  const floorplanOpeningHitTolerance = useMemo(
    () => floorplanWorldUnitsPerPixel * (FLOORPLAN_OPENING_HIT_STROKE_WIDTH / 2),
    [floorplanWorldUnitsPerPixel],
  )
  const floorplanCursorMarkerRadius = useMemo(
    () => ({
      core: floorplanWorldUnitsPerPixel * FLOORPLAN_CURSOR_MARKER_CORE_SCREEN_RADIUS,
      glow: floorplanWorldUnitsPerPixel * FLOORPLAN_CURSOR_MARKER_GLOW_SCREEN_RADIUS,
    }),
    [floorplanWorldUnitsPerPixel],
  )
  const selectedOpeningActionMenuPosition = useMemo(
    () =>
      selectedOpeningEntry
        ? getFloorplanActionMenuPosition(selectedOpeningEntry.polygon, viewBox, surfaceSize)
        : null,
    [selectedOpeningEntry, surfaceSize, viewBox],
  )
  const selectedItemActionMenuPosition = useMemo(
    () =>
      selectedItemEntry
        ? getFloorplanActionMenuPosition(selectedItemEntry.polygon, viewBox, surfaceSize)
        : null,
    [selectedItemEntry, surfaceSize, viewBox],
  )
  const selectedSlabActionMenuPosition = useMemo(
    () =>
      selectedSlabEntry
        ? getFloorplanActionMenuPosition(selectedSlabEntry.polygon, viewBox, surfaceSize)
        : null,
    [selectedSlabEntry, surfaceSize, viewBox],
  )
  const selectedCeilingActionMenuPosition = useMemo(
    () =>
      selectedCeilingEntry
        ? getFloorplanActionMenuPosition(selectedCeilingEntry.polygon, viewBox, surfaceSize)
        : null,
    [selectedCeilingEntry, surfaceSize, viewBox],
  )
  const selectedFenceActionMenuPosition = useMemo(
    () =>
      selectedFenceEntry
        ? getFloorplanActionMenuPosition(selectedFenceEntry.polygon, viewBox, surfaceSize)
        : null,
    [selectedFenceEntry, surfaceSize, viewBox],
  )
  const selectedWallActionMenuPosition = useMemo(
    () =>
      selectedWallEntry
        ? getFloorplanActionMenuPosition(selectedWallEntry.polygon, viewBox, surfaceSize)
        : null,
    [selectedWallEntry, surfaceSize, viewBox],
  )
  const selectedSketchLineActionMenuPosition = useMemo(() => {
    if (selectedSketchLineEntry) {
      return getFloorplanActionMenuPosition(selectedSketchLineEntry.polygon, viewBox, surfaceSize)
    }

    if (selectedSketchLineList.length > 0) {
      return getFloorplanActionMenuPosition(
        selectedSketchLineList.flatMap((line) => [toPoint2D(line.start), toPoint2D(line.end)]),
        viewBox,
        surfaceSize,
      )
    }

    return null
  }, [selectedSketchLineEntry, selectedSketchLineList, surfaceSize, viewBox])
  const selectedSketchCircleActionMenuPosition = useMemo(() => {
    if (selectedSketchLineActionMenuPosition) {
      return null
    }

    if (selectedSketchCircleEntry) {
      return getFloorplanActionMenuPosition(
        selectedSketchCircleEntry.centerline,
        viewBox,
        surfaceSize,
      )
    }

    if (selectedSketchCircleList.length > 0) {
      return getFloorplanActionMenuPosition(
        selectedSketchCircleList.flatMap(
          (circle) =>
            sketchCircleEntries.find((entry) => entry.circle.id === circle.id)?.centerline ?? [],
        ),
        viewBox,
        surfaceSize,
      )
    }

    return null
  }, [
    selectedSketchCircleEntry,
    selectedSketchCircleList,
    selectedSketchLineActionMenuPosition,
    sketchCircleEntries,
    surfaceSize,
    viewBox,
  ])
  const selectedStairActionMenuPosition = useMemo(
    () =>
      selectedStairEntry
        ? getFloorplanActionMenuPosition(
            selectedStairEntry.segments.flatMap((segmentEntry) => segmentEntry.polygon),
            viewBox,
            surfaceSize,
          )
        : null,
    [selectedStairEntry, surfaceSize, viewBox],
  )
  const floorplanCursorAnchorPosition = useMemo(() => {
    if (
      cursorPoint &&
      surfaceSize.width > 0 &&
      surfaceSize.height > 0 &&
      viewBox.width > 0 &&
      viewBox.height > 0
    ) {
      const svgPoint = toSvgPlanPoint(cursorPoint)

      if (
        svgPoint.x >= viewBox.minX &&
        svgPoint.x <= viewBox.minX + viewBox.width &&
        svgPoint.y >= viewBox.minY &&
        svgPoint.y <= viewBox.minY + viewBox.height
      ) {
        return {
          x: ((svgPoint.x - viewBox.minX) / viewBox.width) * surfaceSize.width,
          y: ((svgPoint.y - viewBox.minY) / viewBox.height) * surfaceSize.height,
        }
      }
    }

    return floorplanCursorPosition
  }, [cursorPoint, floorplanCursorPosition, surfaceSize.height, surfaceSize.width, viewBox])

  useEffect(() => {
    setHoveredGuideCorner(null)
  }, [selectedGuide?.id])

  useEffect(() => {
    if (!wallEditFeedback) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setWallEditFeedback((current) => (current?.id === wallEditFeedback.id ? null : current))
    }, FLOORPLAN_WALL_EDIT_FEEDBACK_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [wallEditFeedback])

  useEffect(() => {
    if (!(selectedGuide && showGuides && canInteractWithGuides)) {
      setHoveredGuideCorner(null)
    }
  }, [canInteractWithGuides, selectedGuide, showGuides])

  const guideHandleHintAnchor = useMemo<GuideHandleHintAnchor | null>(() => {
    if (
      !(
        hoveredGuideCorner &&
        selectedGuide &&
        selectedGuideDimensions &&
        surfaceSize.width > 0 &&
        surfaceSize.height > 0 &&
        viewBox.width > 0 &&
        viewBox.height > 0
      )
    ) {
      return null
    }

    const aspectRatio = selectedGuideDimensions.width / selectedGuideDimensions.height
    if (!(aspectRatio > 0)) {
      return null
    }

    const planWidth = getGuideWidth(selectedGuide.scale)
    const planHeight = getGuideHeight(planWidth, aspectRatio)
    const centerSvg = getGuideCenterSvgPoint(selectedGuide)
    const handleSvg = getGuideCornerSvgPoint(
      centerSvg,
      planWidth,
      planHeight,
      -selectedGuide.rotation[1],
      hoveredGuideCorner,
    )

    if (
      handleSvg.x < viewBox.minX ||
      handleSvg.x > viewBox.minX + viewBox.width ||
      handleSvg.y < viewBox.minY ||
      handleSvg.y > viewBox.minY + viewBox.height
    ) {
      return null
    }

    const centerX = ((centerSvg.x - viewBox.minX) / viewBox.width) * surfaceSize.width
    const centerY = ((centerSvg.y - viewBox.minY) / viewBox.height) * surfaceSize.height
    const handleX = ((handleSvg.x - viewBox.minX) / viewBox.width) * surfaceSize.width
    const handleY = ((handleSvg.y - viewBox.minY) / viewBox.height) * surfaceSize.height

    let directionX = handleX - centerX
    let directionY = handleY - centerY
    const directionLength = Math.hypot(directionX, directionY)

    if (directionLength > 0.001) {
      directionX /= directionLength
      directionY /= directionLength
    } else {
      directionX = 1
      directionY = 0
    }

    const minX = Math.min(FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X, surfaceSize.width / 2)
    const maxX = Math.max(surfaceSize.width - FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X, minX)
    const minY = Math.min(FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y, surfaceSize.height / 2)
    const maxY = Math.max(surfaceSize.height - FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y, minY)

    return {
      x: clamp(handleX + directionX * FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET, minX, maxX),
      y: clamp(handleY + directionY * FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET, minY, maxY),
      directionX,
      directionY,
    }
  }, [
    hoveredGuideCorner,
    selectedGuide,
    selectedGuideDimensions,
    surfaceSize.height,
    surfaceSize.width,
    viewBox,
  ])

  const minViewportWidth = fittedViewport.width * MIN_VIEWPORT_WIDTH_RATIO
  const maxViewportWidth = fittedViewport.width * MAX_VIEWPORT_WIDTH_RATIO

  const palette = useMemo(
    () =>
      theme === 'dark'
        ? {
            surface: 'var(--editor-floorplan-surface)',
            minorGrid: 'var(--editor-floorplan-grid-minor)',
            majorGrid: 'var(--editor-floorplan-grid-major)',
            minorGridOpacity: 0.7,
            majorGridOpacity: 0.9,
            slabFill: 'var(--editor-floorplan-slab-fill)',
            slabStroke: 'var(--editor-floorplan-slab-stroke)',
            selectedSlabFill: 'var(--editor-floorplan-selected-slab-fill)',
            ceilingFill: 'var(--editor-floorplan-slab-fill)',
            ceilingStroke: 'var(--editor-floorplan-measurement)',
            selectedCeilingFill: 'var(--editor-floorplan-selected-slab-fill)',
            fenceFill: 'var(--editor-floorplan-wall-fill)',
            fenceStroke: 'var(--editor-floorplan-wall-hover)',
            fenceHoverStroke: 'var(--editor-floorplan-draft-stroke)',
            wallFill: 'var(--editor-floorplan-wall-fill)',
            wallStroke: 'var(--editor-floorplan-wall-stroke)',
            wallHoverStroke: 'var(--editor-floorplan-wall-hover)',
            deleteFill: 'var(--destructive)',
            deleteStroke: 'var(--destructive)',
            deleteWallFill: 'var(--destructive)',
            deleteWallHoverStroke: 'var(--destructive)',
            selectedFill: 'var(--editor-floorplan-selected-fill)',
            selectedStroke: 'var(--editor-floorplan-selected-stroke)',
            draftFill: 'var(--editor-floorplan-draft-fill)',
            draftStroke: 'var(--editor-floorplan-draft-stroke)',
            measurementStroke: 'var(--editor-floorplan-measurement)',
            cursor: 'var(--editor-control-active)',
            editCursor: 'var(--editor-floorplan-selected-stroke)',
            anchor: 'var(--editor-floorplan-draft-stroke)',
            openingFill: 'var(--editor-floorplan-surface)',
            openingStroke: 'var(--editor-floorplan-wall-fill)',
            endpointHandleFill: 'var(--editor-floorplan-handle-fill)',
            endpointHandleStroke: 'var(--editor-floorplan-handle-stroke)',
            endpointHandleHoverStroke: 'var(--editor-floorplan-handle-hover)',
            endpointHandleActiveFill: 'var(--editor-floorplan-selected-fill)',
            endpointHandleActiveStroke: 'var(--editor-floorplan-selected-stroke)',
          }
        : {
            surface: 'var(--editor-floorplan-surface)',
            minorGrid: 'var(--editor-floorplan-grid-minor)',
            majorGrid: 'var(--editor-floorplan-grid-major)',
            minorGridOpacity: 0.7,
            majorGridOpacity: 0.9,
            slabFill: 'var(--editor-floorplan-slab-fill)',
            slabStroke: 'var(--editor-floorplan-slab-stroke)',
            selectedSlabFill: 'var(--editor-floorplan-selected-slab-fill)',
            ceilingFill: 'var(--editor-floorplan-slab-fill)',
            ceilingStroke: 'var(--editor-floorplan-measurement)',
            selectedCeilingFill: 'var(--editor-floorplan-selected-slab-fill)',
            fenceFill: 'var(--editor-floorplan-wall-fill)',
            fenceStroke: 'var(--editor-floorplan-wall-hover)',
            fenceHoverStroke: 'var(--editor-floorplan-draft-stroke)',
            wallFill: 'var(--editor-floorplan-wall-fill)',
            wallStroke: 'var(--editor-floorplan-wall-stroke)',
            wallHoverStroke: 'var(--editor-floorplan-wall-hover)',
            deleteFill: 'var(--destructive)',
            deleteStroke: 'var(--destructive)',
            deleteWallFill: 'var(--destructive)',
            deleteWallHoverStroke: 'var(--destructive)',
            selectedFill: 'var(--editor-floorplan-selected-fill)',
            selectedStroke: 'var(--editor-floorplan-selected-stroke)',
            draftFill: 'var(--editor-floorplan-draft-fill)',
            draftStroke: 'var(--editor-floorplan-draft-stroke)',
            measurementStroke: 'var(--editor-floorplan-measurement)',
            cursor: 'var(--editor-control-active)',
            editCursor: 'var(--editor-floorplan-selected-stroke)',
            anchor: 'var(--editor-floorplan-draft-stroke)',
            openingFill: 'var(--editor-floorplan-surface)',
            openingStroke: 'var(--editor-floorplan-wall-fill)',
            endpointHandleFill: 'var(--editor-floorplan-handle-fill)',
            endpointHandleStroke: 'var(--editor-floorplan-handle-stroke)',
            endpointHandleHoverStroke: 'var(--editor-floorplan-handle-hover)',
            endpointHandleActiveFill: 'var(--editor-floorplan-selected-fill)',
            endpointHandleActiveStroke: 'var(--editor-floorplan-selected-stroke)',
          },
    [theme],
  )
  const gridSteps = useMemo(
    () => getVisibleGridSteps(viewBox.width, surfaceSize.width),
    [surfaceSize.width, viewBox.width],
  )

  const minorGridPath = useMemo(
    () =>
      buildGridPath(
        viewBox.minX,
        viewBox.minX + viewBox.width,
        viewBox.minY,
        viewBox.minY + viewBox.height,
        gridSteps.minorStep,
        {
          excludeStep: gridSteps.majorStep,
        },
      ),
    [gridSteps.majorStep, gridSteps.minorStep, viewBox],
  )
  const majorGridPath = useMemo(
    () =>
      buildGridPath(
        viewBox.minX,
        viewBox.minX + viewBox.width,
        viewBox.minY,
        viewBox.minY + viewBox.height,
        gridSteps.majorStep,
      ),
    [gridSteps.majorStep, viewBox],
  )

  const getSvgPointFromClientPoint = useCallback(
    (clientX: number, clientY: number): SvgPoint | null => {
      const svg = svgRef.current
      const ctm = svg?.getScreenCTM()
      if (!(svg && ctm)) {
        return null
      }

      const screenPoint = svg.createSVGPoint()
      screenPoint.x = clientX
      screenPoint.y = clientY
      const transformedPoint = screenPoint.matrixTransform(ctm.inverse())

      return { x: transformedPoint.x, y: transformedPoint.y }
    },
    [],
  )

  const getPlanPointFromClientPoint = useCallback(
    (clientX: number, clientY: number): WallPlanPoint | null => {
      const svgPoint = getSvgPointFromClientPoint(clientX, clientY)
      if (!svgPoint) {
        return null
      }

      if (buildingRotationY !== 0) {
        const [unrotX, unrotY] = rotatePlanVector(svgPoint.x, svgPoint.y, buildingRotationY)
        return toPlanPointFromSvgPoint({ x: unrotX, y: unrotY })
      }

      return toPlanPointFromSvgPoint(svgPoint)
    },
    [getSvgPointFromClientPoint, buildingRotationY],
  )
  const getFloorplanOverlayPositionFromClientPoint = useCallback(
    (clientX: number, clientY: number): SvgPoint | null => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) {
        return null
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      }
    },
    [],
  )
  useEffect(() => {
    siteBoundaryDraftRef.current = siteBoundaryDraft
  }, [siteBoundaryDraft])

  useEffect(() => {
    slabBoundaryDraftRef.current = slabBoundaryDraft
  }, [slabBoundaryDraft])

  useEffect(() => {
    ceilingBoundaryDraftRef.current = ceilingBoundaryDraft
  }, [ceilingBoundaryDraft])

  useEffect(() => {
    zoneBoundaryDraftRef.current = zoneBoundaryDraft
  }, [zoneBoundaryDraft])

  useEffect(() => {
    guideTransformDraftRef.current = guideTransformDraft
  }, [guideTransformDraft])

  const updateViewport = useCallback((nextViewport: FloorplanViewport) => {
    hasUserAdjustedViewportRef.current = true
    setViewport(nextViewport)
  }, [])

  const clearGuideInteraction = useCallback(() => {
    guideInteractionRef.current = null
    guideTransformDraftRef.current = null
    setGuideTransformDraft(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const clearGuideDetectionRegionInteraction = useCallback(() => {
    guideDetectionRegionInteractionRef.current = null
    setGuideDetectionRegionDraft(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const finishPanelInteraction = useCallback(() => {
    panelInteractionRef.current = null
    setIsDraggingPanel(false)
    setActiveResizeDirection(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const beginPanelInteraction = useCallback((interaction: PanelInteractionState) => {
    panelInteractionRef.current = interaction
    if (interaction.type === 'drag') {
      setIsDraggingPanel(true)
      setActiveResizeDirection(null)
      document.body.style.cursor = 'grabbing'
    } else if (interaction.direction) {
      setIsDraggingPanel(false)
      setActiveResizeDirection(interaction.direction)
      document.body.style.cursor = resizeCursorByDirection[interaction.direction]
    }

    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = panelInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      event.preventDefault()

      const dx = event.clientX - interaction.startClientX
      const dy = event.clientY - interaction.startClientY
      const bounds = getViewportBounds()

      const nextRect =
        interaction.type === 'drag'
          ? movePanelRect(interaction.initialRect, dx, dy, bounds)
          : resizePanelRect(interaction.initialRect, interaction.direction ?? 'se', dx, dy, bounds)

      setPanelRect(nextRect)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const interaction = panelInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      finishPanelInteraction()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [finishPanelInteraction])

  useEffect(() => {
    return () => {
      finishPanelInteraction()
    }
  }, [finishPanelInteraction])

  useEffect(() => {
    const interaction = guideInteractionRef.current
    if (interaction && !guideById.has(interaction.guideId)) {
      clearGuideInteraction()
    }
  }, [clearGuideInteraction, guideById])

  useEffect(() => {
    const interaction = guideDetectionRegionInteractionRef.current
    if (interaction && !guideById.has(interaction.guideId)) {
      clearGuideDetectionRegionInteraction()
    }
  }, [clearGuideDetectionRegionInteraction, guideById])

  useEffect(() => {
    if (!canInteractWithGuides) {
      clearGuideInteraction()
      clearGuideDetectionRegionInteraction()
    }
  }, [canInteractWithGuides, clearGuideDetectionRegionInteraction, clearGuideInteraction])

  useEffect(() => {
    return () => {
      clearGuideInteraction()
    }
  }, [clearGuideInteraction])

  useEffect(() => {
    if (!detectionRegionDraftGuideId) {
      clearGuideDetectionRegionInteraction()
    }
  }, [clearGuideDetectionRegionInteraction, detectionRegionDraftGuideId])

  useEffect(() => {
    return () => {
      clearGuideDetectionRegionInteraction()
    }
  }, [clearGuideDetectionRegionInteraction])

  const handlePanelDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.closest('[data-floorplan-panel-control="true"]')) {
        return
      }

      event.preventDefault()

      beginPanelInteraction({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialRect: panelRect,
        type: 'drag',
      })
    },
    [beginPanelInteraction, panelRect],
  )

  const handleResizeStart = useCallback(
    (direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      beginPanelInteraction({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialRect: panelRect,
        type: 'resize',
        direction,
      })
    },
    [beginPanelInteraction, panelRect],
  )

  const zoomViewportAtClientPoint = useCallback(
    (clientX: number, clientY: number, widthFactor: number) => {
      if (!Number.isFinite(widthFactor) || widthFactor <= 0) {
        return
      }

      const svgPoint = getSvgPointFromClientPoint(clientX, clientY)
      if (!svgPoint) {
        return
      }

      const currentViewport = viewport ?? fittedViewport
      const currentViewBox = viewBox
      const nextWidth = Math.min(
        maxViewportWidth,
        Math.max(minViewportWidth, currentViewport.width * widthFactor),
      )
      const nextHeight = nextWidth / svgAspectRatio
      const normalizedX = (svgPoint.x - currentViewBox.minX) / currentViewBox.width
      const normalizedY = (svgPoint.y - currentViewBox.minY) / currentViewBox.height
      const nextMinX = svgPoint.x - normalizedX * nextWidth
      const nextMinY = svgPoint.y - normalizedY * nextHeight

      updateViewport({
        centerX: nextMinX + nextWidth / 2,
        centerY: nextMinY + nextHeight / 2,
        width: nextWidth,
      })
    },
    [
      fittedViewport,
      getSvgPointFromClientPoint,
      maxViewportWidth,
      minViewportWidth,
      svgAspectRatio,
      updateViewport,
      viewBox,
      viewport,
    ],
  )

  const clearWallPlacementDraft = useCallback(() => {
    setDraftStart(null)
    setDraftEnd(null)
    setWallSketchSnapResult(null)
    setWallLengthInput(null)
  }, [])
  const clearSlabPlacementDraft = useCallback(() => {
    setSlabDraftPoints([])
  }, [])
  const clearCeilingPlacementDraft = useCallback(() => {
    setCeilingDraftPoints([])
  }, [])
  const clearFencePlacementDraft = useCallback(() => {
    setFenceDraft(null)
  }, [])
  const clearZonePlacementDraft = useCallback(() => {
    setZoneDraftPoints([])
  }, [])

  const clearWallEndpointDrag = useCallback(() => {
    wallEndpointDragRef.current = null
    setWallEndpointDraft(null)
    setHoveredEndpointId(null)
  }, [])
  const clearWallCurveDrag = useCallback(() => {
    wallCurveDragRef.current = null
    setWallCurveDraft(null)
    setHoveredWallCurveHandleId(null)
  }, [])
  const clearWallEditPreview = useCallback(() => {
    setWallOffsetPreview(null)
    setWallEditNumericInput(null)
  }, [])
  const clearSiteBoundaryInteraction = useCallback(() => {
    setSiteVertexDragState(null)
    setSiteBoundaryDraft(null)
    setHoveredSiteHandleId(null)
  }, [])
  const clearSlabBoundaryInteraction = useCallback(() => {
    setSlabVertexDragState(null)
    setSlabBoundaryDraft(null)
    setHoveredSlabHandleId(null)
  }, [])
  const clearCeilingBoundaryInteraction = useCallback(() => {
    setCeilingVertexDragState(null)
    setCeilingBoundaryDraft(null)
    setHoveredCeilingHandleId(null)
  }, [])
  const clearZoneBoundaryInteraction = useCallback(() => {
    setZoneVertexDragState(null)
    setZoneBoundaryDraft(null)
    setHoveredZoneHandleId(null)
  }, [])

  const clearDraft = useCallback(() => {
    clearWallPlacementDraft()
    clearSketchLinePlacementDraft()
    clearSlabPlacementDraft()
    clearCeilingPlacementDraft()
    clearFencePlacementDraft()
    clearZonePlacementDraft()
    clearWallEndpointDrag()
    clearWallCurveDrag()
    clearWallEditPreview()
    clearSiteBoundaryInteraction()
    clearSlabBoundaryInteraction()
    clearCeilingBoundaryInteraction()
    clearZoneBoundaryInteraction()
    setCursorPoint(null)
  }, [
    clearWallCurveDrag,
    clearWallEditPreview,
    clearCeilingBoundaryInteraction,
    clearCeilingPlacementDraft,
    clearFencePlacementDraft,
    clearSiteBoundaryInteraction,
    clearSlabBoundaryInteraction,
    clearSlabPlacementDraft,
    clearZoneBoundaryInteraction,
    clearWallEndpointDrag,
    clearWallPlacementDraft,
    clearSketchLinePlacementDraft,
    clearZonePlacementDraft,
  ])

  useEffect(() => {
    if (
      isWallBuildActive ||
      isSketchLineBuildActive ||
      isSketchRectangleBuildActive ||
      isSketchCircleBuildActive ||
      isSketchArcBuildActive ||
      isSketchDimensionActive ||
      isPolygonBuildActive ||
      isFenceBuildActive
    ) {
      return
    }

    clearDraft()
  }, [
    clearDraft,
    isFenceBuildActive,
    isPolygonBuildActive,
    isSketchArcBuildActive,
    isSketchCircleBuildActive,
    isSketchDimensionActive,
    isSketchLineBuildActive,
    isSketchRectangleBuildActive,
    isWallBuildActive,
  ])

  useEffect(() => {
    const handleCancel = () => {
      if (
        (isWallBuildActive && (draftStart || wallLengthInput)) ||
        (isSketchLineBuildActive && (sketchLineDraft || sketchDimensionInput)) ||
        (isSketchRectangleBuildActive && sketchRectangleDraft) ||
        (isSketchCircleBuildActive && sketchCircleDraft) ||
        (isSketchArcBuildActive && sketchArcDraft) ||
        (isSketchDimensionActive && sketchDimensionInput) ||
        (isPolygonBuildActive && activePolygonDraftPoints.length > 0) ||
        (isFenceBuildActive && fenceDraft) ||
        wallEditOperation
      ) {
        markToolCancelConsumed()
      }

      setWallEditOperation(null)
      clearDraft()
    }

    emitter.on('tool:cancel', handleCancel)
    return () => {
      emitter.off('tool:cancel', handleCancel)
    }
  }, [
    activePolygonDraftPoints.length,
    clearDraft,
    draftStart,
    fenceDraft,
    isFenceBuildActive,
    isPolygonBuildActive,
    isSketchArcBuildActive,
    isSketchCircleBuildActive,
    isSketchDimensionActive,
    isSketchLineBuildActive,
    isSketchRectangleBuildActive,
    isWallBuildActive,
    sketchArcDraft,
    sketchCircleDraft,
    sketchDimensionInput,
    sketchLineDraft,
    sketchRectangleDraft,
    setWallEditOperation,
    wallEditOperation,
    wallLengthInput,
  ])

  const commitWallPreviewAndEndSketch = useCallback(() => {
    if (!(draftStart && draftEnd && isWallLongEnough(draftStart, draftEnd))) {
      return false
    }

    createWallOnCurrentLevel(draftStart, draftEnd)
    clearDraft()
    return true
  }, [clearDraft, draftEnd, draftStart])

  const commitWallLengthInput = useCallback(
    (value: string) => {
      const length = parseWallSketchLengthInput(value, unit)
      const direction = getWallSketchDirection(draftStart, draftEnd)

      if (!(draftStart && direction && length)) {
        return false
      }

      const end = getPointAtWallSketchLength(draftStart, direction, length)
      if (!isWallLongEnough(draftStart, end)) {
        return false
      }

      createWallOnCurrentLevel(draftStart, end)
      clearDraft()
      return true
    },
    [clearDraft, draftEnd, draftStart, unit],
  )

  useEffect(() => {
    const handleWallSketchKeyDown = (event: KeyboardEvent) => {
      if (!isWallBuildActive || wallLengthInput) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return
      }

      if (event.key === 'Enter') {
        if (commitWallPreviewAndEndSketch()) {
          event.preventDefault()
        }
        return
      }

      if (!draftStart || !getWallSketchDirection(draftStart, draftEnd)) {
        return
      }

      if (/^[0-9.]$/.test(event.key)) {
        event.preventDefault()
        setWallLengthInput({
          value: event.key === '.' ? '0.' : event.key,
        })
      }
    }

    window.addEventListener('keydown', handleWallSketchKeyDown)
    return () => window.removeEventListener('keydown', handleWallSketchKeyDown)
  }, [commitWallPreviewAndEndSketch, draftEnd, draftStart, isWallBuildActive, wallLengthInput])

  const handleWallLengthInputSubmit = useCallback(
    (value: string) => {
      if (!commitWallLengthInput(value)) {
        setWallLengthInput(null)
      }
    },
    [commitWallLengthInput],
  )

  const createSlabOnCurrentLevel = useCallback(
    (points: WallPlanPoint[]) => {
      if (!levelId) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const slabCount = Object.values(nodes).filter((node) => node.type === 'slab').length
      const slab = SlabNode.parse({
        name: `Slab ${slabCount + 1}`,
        polygon: points.map(([x, z]) => [x, z] as [number, number]),
      })

      createNode(slab, levelId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [slab.id] })
      return slab.id
    },
    [levelId, setSelection],
  )
  const createCeilingOnCurrentLevel = useCallback(
    (points: WallPlanPoint[]) => {
      if (!levelId) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const ceilingCount = Object.values(nodes).filter((node) => node.type === 'ceiling').length
      const ceiling = CeilingNodeSchema.parse({
        name: `Ceiling ${ceilingCount + 1}`,
        polygon: points.map(([x, z]) => [x, z] as [number, number]),
      })

      createNode(ceiling, levelId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [ceiling.id] })
      return ceiling.id
    },
    [levelId, setSelection],
  )
  const createZoneOnCurrentLevel = useCallback(
    (points: WallPlanPoint[]) => {
      if (!levelId) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const zoneCount = Object.values(nodes).filter((node) => node.type === 'zone').length
      const zone = ZoneNodeSchema.parse({
        color: PALETTE_COLORS[zoneCount % PALETTE_COLORS.length],
        name: `Zone ${zoneCount + 1}`,
        polygon: points.map(([x, z]) => [x, z] as [number, number]),
      })

      createNode(zone, levelId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ zoneId: zone.id })
      return zone.id
    },
    [levelId, setSelection],
  )
  const showWallEditFeedback = useCallback((message: string) => {
    setWallEditFeedback({ id: Date.now(), message })
  }, [])

  const { sketchLineEditDraft, clearSketchLineEdit, handleSketchLineEditPointerDown } =
    useFloorplanSketchEdit({
      canEdit: canSelectActiveSketchGeometry && !isSketchDimensionActive,
      sketchLines: activeSketchLines,
      sketchCircles: activeSketchCircles,
      getPlanPointFromClientPoint,
      setCursorPoint,
      setSelection,
      showWallEditFeedback,
    })

  const displaySketchLines = useMemo(() => {
    if (!sketchLineEditDraft) {
      return activeSketchLines
    }

    const draftUpdateByLineId = new Map(
      (sketchLineEditDraft.lineUpdates ?? []).map((update) => [update.lineId, update] as const),
    )

    return activeSketchLines.map((line) => {
      const draftUpdate = draftUpdateByLineId.get(line.id)
      if (draftUpdate) {
        return {
          ...line,
          start: draftUpdate.start,
          end: draftUpdate.end,
          curveOffset: draftUpdate.curveOffset ?? line.curveOffset,
        }
      }

      return line.id === sketchLineEditDraft.lineId
        ? {
            ...line,
            start: sketchLineEditDraft.start,
            end: sketchLineEditDraft.end,
            curveOffset: sketchLineEditDraft.curveOffset,
          }
        : line
    })
  }, [activeSketchLines, sketchLineEditDraft])
  const displaySketchCircles = useMemo(
    () => sketchCircleEntries.map((entry) => entry.circle),
    [sketchCircleEntries],
  )
  const displaySketchDimensions = useMemo(
    () => activeSketchDimensions.filter((dimension) => dimension.visible !== false),
    [activeSketchDimensions],
  )

  const displaySelectedSketchLineList = useMemo(() => {
    if (!sketchLineEditDraft) {
      return selectedSketchLineList
    }

    const displayLineById = new Map(displaySketchLines.map((line) => [line.id, line] as const))
    return selectedIds
      .map((id) => displayLineById.get(id as SketchLineNode['id']))
      .filter((line): line is SketchLineNode => Boolean(line))
  }, [displaySketchLines, selectedIds, selectedSketchLineList, sketchLineEditDraft])

  useEffect(() => {
    clearSketchLineEdit()
  }, [clearSketchLineEdit, levelId])

  const {
    handleSketchLinePlacementPoint,
    handleSketchRectanglePlacementPoint,
    handleSketchCirclePlacementPoint,
    handleSketchArcPlacementPoint,
    handleSketchLineOperationClick,
    handleSketchCircleOperationClick,
    sketchLineEditOperation,
    sketchCircleEditOperation,
    openSketchDimensionInput,
    openSketchDistanceDimensionInput,
    handleSketchDimensionInputCancel,
    handleSketchDimensionInputChange,
    handleSketchDimensionInputSubmit,
    handleSketchDistanceDimensionReferencePick,
    handleSketchDistanceDimensionDelete,
    handleSelectedSketchLineDelete,
    handleSelectedSketchCircleDelete,
    sketchLineActionMenuExtraActions,
    sketchCircleActionMenuExtraActions,
    resetSketchOperations,
  } = useFloorplanSketchActions({
    levelId,
    tool,
    unit,
    sketchLineDraft,
    sketchRectangleDraft,
    sketchCircleDraft,
    sketchArcDraft,
    sketchDimensionInput,
    sketchDistanceDimensionDraft,
    setSketchLineDraft,
    setSketchRectangleDraft,
    setSketchCircleDraft,
    setSketchArcDraft,
    setSketchDimensionInput,
    setSketchDistanceDimensionDraft,
    sketchDimensions: displaySketchDimensions,
    sketchLineById,
    sketchCircleById,
    selectedSketchLineEntry,
    selectedSketchLineList,
    selectedSketchCircleEntry: selectedSketchCircleEntry?.circle ?? null,
    selectedSketchCircleList,
    selectedSketchProfile,
    sketchProfiles,
    setSelection,
    setCursorPoint,
    setWallSketchSnapResult,
    showWallEditFeedback,
    createSlabOnCurrentLevel,
    createZoneOnCurrentLevel,
    updateNode,
    deleteNode,
  })

  const createZoneFromSelectedWallLoop = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!selectedClosedWallLoop) {
        showWallEditFeedback('Select a wall that belongs to a closed loop.')
        return
      }

      createZoneOnCurrentLevel(selectedClosedWallLoop.points)
    },
    [createZoneOnCurrentLevel, selectedClosedWallLoop, showWallEditFeedback],
  )

  const createSlabFromSelectedWallLoop = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!selectedClosedWallLoop) {
        showWallEditFeedback('Select a wall that belongs to a closed loop.')
        return
      }

      createSlabOnCurrentLevel(selectedClosedWallLoop.points)
    },
    [createSlabOnCurrentLevel, selectedClosedWallLoop, showWallEditFeedback],
  )

  const finishWallEditOperation = useCallback(() => {
    setWallEditOperation(null)
    setWallOffsetPreview(null)
    setWallEditNumericInput(null)
  }, [setWallEditOperation])

  const runWallEditResult = useCallback(
    (result: WallEditResult) => {
      if (!result.ok) {
        showWallEditFeedback(result.reason)
        return false
      }

      if (!applyWallEditResult(result)) {
        showWallEditFeedback('Wall edit could not be applied.')
        return false
      }

      const nextSelectedIds = result.plan.selectIds ?? []
      setSelection({ selectedIds: nextSelectedIds })
      setSelectedReferenceId(null)
      sfxEmitter.emit('sfx:structure-build')
      finishWallEditOperation()
      return true
    },
    [finishWallEditOperation, setSelectedReferenceId, setSelection, showWallEditFeedback],
  )

  const activateWallEditOperation = useCallback(
    (operation: WallEditOperation) => {
      setPhase('structure')
      setStructureLayer('elements')
      setMode('select')
      setTool(null)
      clearWallPlacementDraft()
      clearWallEndpointDrag()
      clearWallCurveDrag()
      setWallEditNumericInput(null)

      const nextOperation = wallEditOperation === operation ? null : operation
      setWallEditOperation(nextOperation)
      const offsetPreview =
        nextOperation === 'offset' && selectedWallEntry
          ? getWallOffsetPreview({ wall: selectedWallEntry.wall })
          : null
      setWallOffsetPreview(offsetPreview)

      if (nextOperation === 'offset' && selectedWallEntry) {
        setWallEditNumericInput({
          operation: 'offset',
          wallId: selectedWallEntry.wall.id,
          value: formatLengthInputValue(
            offsetPreview?.distance ?? getDefaultWallOffsetDistance(),
            unit,
          ),
        })
      }

      if (nextOperation === 'set-length' && selectedWallEntry) {
        setWallEditNumericInput({
          operation: 'set-length',
          wallId: selectedWallEntry.wall.id,
          value: formatLengthInputValue(getWallLength2D(selectedWallEntry.wall), unit),
        })
      }

      if (nextOperation === 'linear-pattern' && selectedWallList.length > 0) {
        setWallEditNumericInput({
          operation: 'linear-pattern',
          wallIds: selectedWallList.map((wall) => wall.id),
          value: `${formatLengthInputValue(getDefaultWallLinearPatternSpacing(), unit)},${getDefaultWallLinearPatternCount()}`,
        })
      }

      if (nextOperation === 'chamfer' && selectedWallPair) {
        setWallEditNumericInput({
          operation: 'chamfer',
          wallIds: [selectedWallPair[0].id, selectedWallPair[1].id],
          value: formatLengthInputValue(getDefaultWallChamferDistance(), unit),
        })
      }

      if (!nextOperation) {
        return
      }

      const hints: Record<WallEditOperation, string> = {
        'trim-extend': 'Click a wall segment to trim, or an endpoint to extend.',
        split: 'Click a wall where it should break.',
        merge: 'Click a collinear wall that shares this endpoint.',
        offset: 'Move the pointer to choose side and distance, then click.',
        fillet: 'Click another wall that shares this corner.',
        mirror: 'Select walls, then click another wall to use as the mirror axis.',
        'linear-pattern': 'Enter spacing and count, or click a wall to use its direction.',
        chamfer: 'Click another wall that shares this corner, then enter a chamfer distance.',
        'set-length': 'Enter the wall length to drive this segment.',
      }
      showWallEditFeedback(hints[nextOperation])
    },
    [
      clearWallCurveDrag,
      clearWallEndpointDrag,
      clearWallPlacementDraft,
      selectedWallEntry,
      selectedWallList,
      selectedWallPair,
      setMode,
      setPhase,
      setStructureLayer,
      setTool,
      setWallEditOperation,
      showWallEditFeedback,
      unit,
      wallEditOperation,
    ],
  )

  const getSelectedWallPair = useCallback(() => {
    if (selectedWallPair) {
      return selectedWallPair
    }

    const [firstId, secondId] = useViewer.getState().selection.selectedIds
    const nodes = useScene.getState().nodes
    const first = firstId ? nodes[firstId as AnyNodeId] : null
    const second = secondId ? nodes[secondId as AnyNodeId] : null
    return first?.type === 'wall' && second?.type === 'wall' ? ([first, second] as const) : null
  }, [selectedWallPair])

  const handleWallEditForWallClick = useCallback(
    (wall: WallNode, planPoint: WallPlanPoint) => {
      const operation = wallEditOperation
      if (!operation) {
        return false
      }

      const nodes = useScene.getState().nodes

      if (operation === 'trim-extend') {
        return runWallEditResult(
          buildTrimExtendWallPlan({
            wall,
            walls,
            clickPoint: planPoint,
            nodes,
          }),
        )
      }

      if (operation === 'split') {
        return runWallEditResult(buildSplitWallPlan({ wall, splitPoint: planPoint, nodes }))
      }

      if (operation === 'set-length') {
        setWallEditNumericInput({
          operation: 'set-length',
          wallId: wall.id,
          value: formatLengthInputValue(getWallLength2D(wall), unit),
        })
        showWallEditFeedback('Enter the wall length.')
        return true
      }

      if (operation === 'offset') {
        const offsetSource = selectedWallEntry?.wall ?? wall
        const preview = getWallOffsetPreview({ wall: offsetSource, point: planPoint })
        if (!preview) {
          showWallEditFeedback('Only straight walls can be offset.')
          return true
        }
        return runWallEditResult(buildOffsetWallPlan({ wall: offsetSource, preview }))
      }

      if (operation === 'mirror') {
        if (selectedWallList.length === 0) {
          setSelectedReferenceId(null)
          setSelection({ selectedIds: [wall.id] })
          showWallEditFeedback(
            'Select the wall to mirror, then click a different wall as the axis.',
          )
          return true
        }

        if (selectedWallList.some((selectedWall) => selectedWall.id === wall.id)) {
          showWallEditFeedback('Click a different wall to use as the mirror axis.')
          return true
        }

        return runWallEditResult(
          buildMirrorWallsPlan({
            walls: selectedWallList,
            axisStart: wall.start,
            axisEnd: wall.end,
          }),
        )
      }

      if (operation === 'linear-pattern') {
        if (selectedWallList.length === 0) {
          setSelectedReferenceId(null)
          setSelection({ selectedIds: [wall.id] })
          showWallEditFeedback('Select walls to pattern, then enter spacing and count.')
          return true
        }

        setWallEditNumericInput({
          operation: 'linear-pattern',
          wallIds: selectedWallList.map((selectedWall) => selectedWall.id),
          referenceWallId: wall.id,
          value: `${formatLengthInputValue(getDefaultWallLinearPatternSpacing(), unit)},${getDefaultWallLinearPatternCount()}`,
        })
        showWallEditFeedback('Enter spacing and count, for example 1,3.')
        return true
      }

      const primary = selectedWallEntry?.wall
      if (!primary) {
        setSelectedReferenceId(null)
        setSelection({ selectedIds: [wall.id] })
        showWallEditFeedback(
          operation === 'merge'
            ? 'Select the first wall, then click the wall to merge.'
            : operation === 'chamfer'
              ? 'Select the first wall, then click the wall to chamfer.'
              : 'Select the first wall, then click the wall to fillet.',
        )
        return true
      }

      if (primary.id === wall.id) {
        showWallEditFeedback('Click a second wall for this edit.')
        return true
      }

      if (operation === 'merge') {
        return runWallEditResult(buildMergeWallsPlan({ primary, secondary: wall, nodes }))
      }

      if (operation === 'fillet') {
        return runWallEditResult(buildFilletWallsPlan({ primary, secondary: wall, nodes }))
      }

      if (operation === 'chamfer') {
        setWallEditNumericInput({
          operation: 'chamfer',
          wallIds: [primary.id, wall.id],
          value: formatLengthInputValue(getDefaultWallChamferDistance(), unit),
        })
        showWallEditFeedback('Enter a chamfer distance, or press Enter for the default.')
        return true
      }

      return false
    },
    [
      runWallEditResult,
      selectedWallEntry,
      selectedWallList,
      setSelectedReferenceId,
      setSelection,
      setWallEditNumericInput,
      showWallEditFeedback,
      unit,
      wallEditOperation,
      walls,
    ],
  )

  const commitWallOffsetAtPoint = useCallback(
    (planPoint: WallPlanPoint) => {
      const wall = selectedWallEntry?.wall
      if (!(wallEditOperation === 'offset' && wall)) {
        return false
      }

      const preview = getWallOffsetPreview({ wall, point: planPoint }) ?? wallOffsetPreview
      if (!preview) {
        showWallEditFeedback('Only straight walls can be offset.')
        return true
      }

      return runWallEditResult(buildOffsetWallPlan({ wall, preview }))
    },
    [
      runWallEditResult,
      selectedWallEntry,
      showWallEditFeedback,
      wallEditOperation,
      wallOffsetPreview,
    ],
  )

  const handleWallEditNumericInputCancel = useCallback(() => {
    finishWallEditOperation()
  }, [finishWallEditOperation])

  const handleWallEditNumericInputChange = useCallback(
    (value: string) => {
      setWallEditNumericInput((current) => (current ? { ...current, value } : current))

      const current = wallEditNumericInput
      if (current?.operation !== 'offset' || !current.wallId) {
        return
      }

      const wall = wallById.get(current.wallId)
      const distance = parseFloorplanLengthInput(value, unit, { allowSigned: true })
      if (!(wall && distance !== null)) {
        return
      }

      setWallOffsetPreview(getWallOffsetPreview({ wall, distance }))
    },
    [unit, wallById, wallEditNumericInput],
  )

  const handleWallEditNumericInputSubmit = useCallback(
    (value: string) => {
      const current = wallEditNumericInput
      if (!current) {
        return
      }

      const nodes = useScene.getState().nodes

      if (current.operation === 'split') {
        const wall = current.wallId ? wallById.get(current.wallId) : selectedWallEntry?.wall
        const distanceFromStart = parseFloorplanLengthInput(value, unit)
        if (!(wall && distanceFromStart !== null)) {
          showWallEditFeedback('Enter a valid split distance.')
          return
        }

        const splitPoint = getWallPointAtDistance(wall, distanceFromStart)
        if (!splitPoint) {
          showWallEditFeedback('Split distance must be inside the wall length.')
          return
        }

        runWallEditResult(buildSplitWallPlan({ wall, splitPoint, nodes }))
        return
      }

      if (current.operation === 'offset') {
        const wall = current.wallId ? wallById.get(current.wallId) : selectedWallEntry?.wall
        const distance = parseFloorplanLengthInput(value, unit, { allowSigned: true })
        if (!(wall && distance !== null)) {
          showWallEditFeedback('Enter a valid offset distance.')
          return
        }

        const preview = getWallOffsetPreview({ wall, distance })
        if (!preview) {
          showWallEditFeedback('Only straight walls can be offset.')
          return
        }

        runWallEditResult(buildOffsetWallPlan({ wall, preview }))
        return
      }

      if (current.operation === 'set-length') {
        const wall = current.wallId ? wallById.get(current.wallId) : selectedWallEntry?.wall
        const length = parseFloorplanLengthInput(value, unit)
        if (!(wall && length !== null)) {
          showWallEditFeedback('Enter a valid wall length.')
          return
        }

        runWallEditResult(buildSetWallLengthPlan({ wall, length, nodes }))
        return
      }

      if (current.operation === 'linear-pattern') {
        const parsed = parseLinearPatternInput(value, unit)
        const patternWalls = (current.wallIds ?? selectedWallList.map((wall) => wall.id))
          .map((wallId) => wallById.get(wallId))
          .filter((wall): wall is WallNode => Boolean(wall))
        const referenceWall =
          (current.referenceWallId ? wallById.get(current.referenceWallId) : null) ??
          patternWalls[0]
        if (!(parsed && patternWalls.length > 0 && referenceWall)) {
          showWallEditFeedback('Enter spacing and count, for example 1,3.')
          return
        }

        runWallEditResult(
          buildLinearPatternWallsPlan({
            walls: patternWalls,
            direction: [
              referenceWall.end[0] - referenceWall.start[0],
              referenceWall.end[1] - referenceWall.start[1],
            ],
            spacing: parsed.spacing,
            count: parsed.count,
          }),
        )
        return
      }

      const wallIds = current.wallIds
      if (current.operation === 'chamfer') {
        const distance = parseFloorplanLengthInput(value, unit)
        if (!(wallIds && wallIds.length >= 2 && distance !== null)) {
          showWallEditFeedback('Enter a valid chamfer distance.')
          return
        }

        const primary = wallById.get(wallIds[0]!)
        const secondary = wallById.get(wallIds[1]!)
        if (!(primary && secondary)) {
          showWallEditFeedback('Select two walls to chamfer.')
          return
        }

        runWallEditResult(buildChamferWallsPlan({ primary, secondary, nodes, distance }))
        return
      }

      const radius = parseFloorplanLengthInput(value, unit)
      if (!(wallIds && wallIds.length >= 2 && radius !== null)) {
        showWallEditFeedback('Enter a valid fillet radius.')
        return
      }

      const primary = wallById.get(wallIds[0]!)
      const secondary = wallById.get(wallIds[1]!)
      if (!(primary && secondary)) {
        showWallEditFeedback('Select two walls to fillet.')
        return
      }

      runWallEditResult(buildFilletWallsPlan({ primary, secondary, nodes, radius }))
    },
    [
      runWallEditResult,
      selectedWallEntry,
      selectedWallList,
      showWallEditFeedback,
      unit,
      wallById,
      wallEditNumericInput,
    ],
  )

  const handleSelectedWallTrimExtend = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      activateWallEditOperation('trim-extend')
    },
    [activateWallEditOperation],
  )

  const handleSelectedWallSplit = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const wall = selectedWallEntry?.wall
      if (!wall) {
        activateWallEditOperation('split')
        return
      }

      setWallEditOperation('split')
      setWallOffsetPreview(null)
      setWallEditNumericInput({
        operation: 'split',
        wallId: wall.id,
        value: formatLengthInputValue(getWallLength2D(wall) / 2, unit),
      })
      showWallEditFeedback('Enter distance from wall start, or click the wall to split.')
    },
    [
      activateWallEditOperation,
      setWallEditOperation,
      selectedWallEntry,
      showWallEditFeedback,
      unit,
    ],
  )

  const handleSelectedWallMerge = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const pair = getSelectedWallPair()
      if (!pair) {
        activateWallEditOperation('merge')
        return
      }

      runWallEditResult(
        buildMergeWallsPlan({
          primary: pair[0],
          secondary: pair[1],
          nodes: useScene.getState().nodes,
        }),
      )
    },
    [activateWallEditOperation, getSelectedWallPair, runWallEditResult],
  )

  const handleSelectedWallOffset = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!selectedWallEntry) {
        showWallEditFeedback('Select one wall to offset.')
        return
      }
      activateWallEditOperation('offset')
    },
    [activateWallEditOperation, selectedWallEntry, showWallEditFeedback],
  )

  const handleSelectedWallSetLength = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const wall = selectedWallEntry?.wall
      if (!wall) {
        activateWallEditOperation('set-length')
        return
      }

      setWallEditOperation('set-length')
      setWallOffsetPreview(null)
      setWallEditNumericInput({
        operation: 'set-length',
        wallId: wall.id,
        value: formatLengthInputValue(getWallLength2D(wall), unit),
      })
      showWallEditFeedback('Enter the wall length.')
    },
    [
      activateWallEditOperation,
      selectedWallEntry,
      setWallEditOperation,
      showWallEditFeedback,
      unit,
    ],
  )

  const handleSelectedWallHorizontal = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const wall = selectedWallEntry?.wall
      if (!wall) {
        showWallEditFeedback('Select one wall to make horizontal.')
        return
      }

      runWallEditResult(
        buildOrientWallPlan({
          wall,
          orientation: 'horizontal',
          nodes: useScene.getState().nodes,
        }),
      )
    },
    [runWallEditResult, selectedWallEntry, showWallEditFeedback],
  )

  const handleSelectedWallVertical = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const wall = selectedWallEntry?.wall
      if (!wall) {
        showWallEditFeedback('Select one wall to make vertical.')
        return
      }

      runWallEditResult(
        buildOrientWallPlan({
          wall,
          orientation: 'vertical',
          nodes: useScene.getState().nodes,
        }),
      )
    },
    [runWallEditResult, selectedWallEntry, showWallEditFeedback],
  )

  const handleSelectedWallsEqualLength = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (selectedWallList.length < 2) {
        showWallEditFeedback('Select at least two walls to equalize length.')
        return
      }

      const [source, ...targets] = selectedWallList
      if (!source) {
        showWallEditFeedback('Select at least two walls to equalize length.')
        return
      }

      runWallEditResult(
        buildEqualLengthWallsPlan({
          source,
          targets,
          nodes: useScene.getState().nodes,
        }),
      )
    },
    [runWallEditResult, selectedWallList, showWallEditFeedback],
  )

  const handleSelectedWallMirror = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (selectedWallList.length === 0) {
        showWallEditFeedback('Select at least one wall to mirror.')
        return
      }

      activateWallEditOperation('mirror')
    },
    [activateWallEditOperation, selectedWallList.length, showWallEditFeedback],
  )

  const handleSelectedWallLinearPattern = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (selectedWallList.length === 0) {
        showWallEditFeedback('Select at least one wall to pattern.')
        return
      }

      activateWallEditOperation('linear-pattern')
    },
    [activateWallEditOperation, selectedWallList.length, showWallEditFeedback],
  )

  const handleSelectedWallFillet = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const pair = getSelectedWallPair()
      if (!pair) {
        activateWallEditOperation('fillet')
        return
      }

      setWallEditOperation('fillet')
      setWallOffsetPreview(null)
      setWallEditNumericInput({
        operation: 'fillet',
        wallIds: [pair[0].id, pair[1].id],
        value: formatLengthInputValue(getDefaultWallEditRadius(), unit),
      })
      showWallEditFeedback('Enter a fillet radius, or press Enter for the default.')
    },
    [
      activateWallEditOperation,
      getSelectedWallPair,
      setWallEditOperation,
      showWallEditFeedback,
      unit,
    ],
  )

  const handleSelectedWallChamfer = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const pair = getSelectedWallPair()
      if (!pair) {
        activateWallEditOperation('chamfer')
        return
      }

      setWallEditOperation('chamfer')
      setWallOffsetPreview(null)
      setWallEditNumericInput({
        operation: 'chamfer',
        wallIds: [pair[0].id, pair[1].id],
        value: formatLengthInputValue(getDefaultWallChamferDistance(), unit),
      })
      showWallEditFeedback('Enter a chamfer distance, or press Enter for the default.')
    },
    [
      activateWallEditOperation,
      getSelectedWallPair,
      setWallEditOperation,
      showWallEditFeedback,
      unit,
    ],
  )

  useEffect(() => {
    if (wallEditOperation !== 'offset') {
      setWallOffsetPreview(null)
    }
  }, [wallEditOperation])

  useEffect(() => {
    if (!(wallEditOperation === 'set-length' && selectedWallEntry && !wallEditNumericInput)) {
      return
    }

    setWallEditNumericInput({
      operation: 'set-length',
      wallId: selectedWallEntry.wall.id,
      value: formatLengthInputValue(getWallLength2D(selectedWallEntry.wall), unit),
    })
  }, [selectedWallEntry, unit, wallEditNumericInput, wallEditOperation])

  useEffect(() => {
    if (!wallEditOperation) {
      return
    }

    if (phase !== 'structure' || structureLayer === 'zones' || mode !== 'select') {
      finishWallEditOperation()
    }
  }, [finishWallEditOperation, mode, phase, structureLayer, wallEditOperation])

  useEffect(() => {
    if (!isStairBuildActive) {
      setStairBuildPreviewPoint(null)
      setStairBuildPreviewRotation(0)
      return
    }

    const handleGridMove = (event: GridEvent) => {
      setStairBuildPreviewPoint(getSnappedFloorplanPoint([event.position[0], event.position[2]]))
    }

    emitter.on('grid:move', handleGridMove)

    return () => {
      emitter.off('grid:move', handleGridMove)
    }
  }, [isStairBuildActive])

  useEffect(() => {
    if (!isItemPlacementPreviewActive) {
      return
    }

    const refreshFloorplanItemPreview = () => {
      setMovingFloorplanNodeRevision((current) => current + 1)
    }

    emitter.on('grid:move', refreshFloorplanItemPreview)
    emitter.on('wall:enter', refreshFloorplanItemPreview as any)
    emitter.on('wall:move', refreshFloorplanItemPreview as any)
    emitter.on('wall:leave', refreshFloorplanItemPreview as any)
    emitter.on('ceiling:enter', refreshFloorplanItemPreview as any)
    emitter.on('ceiling:move', refreshFloorplanItemPreview as any)
    emitter.on('ceiling:leave', refreshFloorplanItemPreview as any)
    emitter.on('item:enter', refreshFloorplanItemPreview as any)
    emitter.on('item:move', refreshFloorplanItemPreview as any)
    emitter.on('item:leave', refreshFloorplanItemPreview as any)

    return () => {
      emitter.off('grid:move', refreshFloorplanItemPreview)
      emitter.off('wall:enter', refreshFloorplanItemPreview as any)
      emitter.off('wall:move', refreshFloorplanItemPreview as any)
      emitter.off('wall:leave', refreshFloorplanItemPreview as any)
      emitter.off('ceiling:enter', refreshFloorplanItemPreview as any)
      emitter.off('ceiling:move', refreshFloorplanItemPreview as any)
      emitter.off('ceiling:leave', refreshFloorplanItemPreview as any)
      emitter.off('item:enter', refreshFloorplanItemPreview as any)
      emitter.off('item:move', refreshFloorplanItemPreview as any)
      emitter.off('item:leave', refreshFloorplanItemPreview as any)
    }
  }, [isItemPlacementPreviewActive])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)

      if (isEditableTarget) {
        return
      }

      if (event.key === 'Shift') {
        setShiftPressed(true)
      }

      if (isStairBuildActive && (event.key === 'r' || event.key === 'R')) {
        setStairBuildPreviewRotation((current) => current + Math.PI / 4)
      } else if (isStairBuildActive && (event.key === 't' || event.key === 'T')) {
        setStairBuildPreviewRotation((current) => current - Math.PI / 4)
      }

      if (
        (movingNode?.type === 'stair' || movingNode?.type === 'item') &&
        (event.key === 'r' || event.key === 'R' || event.key === 't' || event.key === 'T')
      ) {
        setMovingFloorplanNodeRevision((current) => current + 1)
      }

      setRotationModifierPressed(
        event.key === 'Meta' || event.key === 'Control' || event.metaKey || event.ctrlKey,
      )
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftPressed(false)
      }

      setRotationModifierPressed(event.metaKey || event.ctrlKey)
    }
    const handleBlur = () => {
      setShiftPressed(false)
      setRotationModifierPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isStairBuildActive, movingNode])

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      const detectionRegionInteraction = guideDetectionRegionInteractionRef.current
      if (detectionRegionInteraction && event.pointerId === detectionRegionInteraction.pointerId) {
        event.preventDefault()

        const guide = guideById.get(detectionRegionInteraction.guideId)
        if (!guide) {
          return
        }

        const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
        if (!svgPoint) {
          return
        }

        const nextLocalPoint = getGuideClampedLocalPointFromSvgPoint(
          guide,
          detectionRegionInteraction.dimensions,
          svgPoint,
        )
        if (!nextLocalPoint) {
          return
        }

        if (pointsEqual(detectionRegionInteraction.current, nextLocalPoint)) {
          return
        }

        detectionRegionInteraction.current = nextLocalPoint
        setGuideDetectionRegionDraft({
          guideId: guide.id,
          start: detectionRegionInteraction.start,
          end: nextLocalPoint,
        })
        return
      }

      const guideInteraction = guideInteractionRef.current
      if (guideInteraction && event.pointerId === guideInteraction.pointerId) {
        event.preventDefault()

        const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
        if (!svgPoint) {
          return
        }

        const nextDraft =
          guideInteraction.mode === 'rotate'
            ? buildGuideRotationDraft(guideInteraction, svgPoint, shiftPressed)
            : guideInteraction.mode === 'translate'
              ? buildGuideTranslateDraft(guideInteraction, svgPoint)
              : buildGuideResizeDraft(guideInteraction, svgPoint)

        if (areGuideTransformDraftsEqual(guideTransformDraftRef.current, nextDraft)) {
          return
        }

        guideTransformDraftRef.current = nextDraft
        setGuideTransformDraft(nextDraft)
        return
      }

      const dragState = wallEndpointDragRef.current
      if (dragState && event.pointerId === dragState.pointerId) {
        event.preventDefault()

        const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
        if (!planPoint) {
          return
        }

        const snappedPoint = snapWallDraftPoint({
          point: planPoint,
          walls,
          start: dragState.fixedPoint,
          angleSnap: !shiftPressed,
          ignoreWallIds: [dragState.wallId],
        })

        if (pointsEqual(dragState.currentPoint, snappedPoint)) {
          return
        }

        dragState.currentPoint = snappedPoint
        setCursorPoint(snappedPoint)
        setWallEndpointDraft((previousDraft) => {
          const nextDraft = buildWallEndpointDraft(
            dragState.wallId,
            dragState.endpoint,
            dragState.fixedPoint,
            snappedPoint,
          )

          if (
            !(
              previousDraft &&
              pointsEqual(previousDraft.start, nextDraft.start) &&
              pointsEqual(previousDraft.end, nextDraft.end)
            )
          ) {
            sfxEmitter.emit('sfx:grid-snap')
          }

          return nextDraft
        })
        return
      }

      const curveDragState = wallCurveDragRef.current
      if (!curveDragState || event.pointerId !== curveDragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      const wall = wallById.get(curveDragState.wallId)
      if (!(planPoint && wall)) {
        return
      }

      const chord = getWallChordFrame(wall)
      const snappedPoint: WallPlanPoint = shiftPressed
        ? planPoint
        : [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      const rawCurveOffset = -(
        (snappedPoint[0] - chord.midpoint.x) * chord.normal.x +
        (snappedPoint[1] - chord.midpoint.y) * chord.normal.y
      )
      const nextCurveOffset = normalizeWallCurveOffset(
        wall,
        shiftPressed ? rawCurveOffset : snapToHalf(rawCurveOffset),
      )

      if (curveDragState.currentCurveOffset === nextCurveOffset) {
        return
      }

      curveDragState.currentCurveOffset = nextCurveOffset
      setWallCurveDraft({ wallId: wall.id, curveOffset: nextCurveOffset })
      setCursorPoint(snappedPoint)
      sfxEmitter.emit('sfx:grid-snap')
    }

    const commitGuideInteraction = (event: PointerEvent) => {
      const detectionRegionInteraction = guideDetectionRegionInteractionRef.current
      if (detectionRegionInteraction && event.pointerId === detectionRegionInteraction.pointerId) {
        event.preventDefault()

        const guide = guideById.get(detectionRegionInteraction.guideId)
        if (guide) {
          const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
          const endLocalPoint =
            svgPoint &&
            getGuideClampedLocalPointFromSvgPoint(
              guide,
              detectionRegionInteraction.dimensions,
              svgPoint,
            )
          const nextRegion = getGuideDetectionRegionFromLocalBounds(
            guide,
            detectionRegionInteraction.dimensions,
            detectionRegionInteraction.start,
            endLocalPoint ?? detectionRegionInteraction.current,
          )

          if (nextRegion) {
            updateNode(guide.id, { detectionRegion: nextRegion })
            clearDetectionCandidates()
          }
        }

        clearDetectionRegionDraft()
        clearGuideDetectionRegionInteraction()
        return
      }

      const interaction = guideInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      event.preventDefault()

      const guide = guideById.get(interaction.guideId)
      if (!guide) {
        clearGuideInteraction()
        return
      }

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      const nextDraft = svgPoint
        ? interaction.mode === 'rotate'
          ? buildGuideRotationDraft(interaction, svgPoint, shiftPressed)
          : interaction.mode === 'translate'
            ? buildGuideTranslateDraft(interaction, svgPoint)
            : buildGuideResizeDraft(interaction, svgPoint)
        : guideTransformDraftRef.current

      if (nextDraft && !doesGuideMatchDraft(guide, nextDraft)) {
        updateNode(guide.id, {
          position: [nextDraft.position[0], guide.position[1], nextDraft.position[1]] as [
            number,
            number,
            number,
          ],
          rotation: [guide.rotation[0], nextDraft.rotation, guide.rotation[2]] as [
            number,
            number,
            number,
          ],
          scale: nextDraft.scale,
        })
      }

      clearGuideInteraction()
    }

    const cancelGuideInteraction = (event: PointerEvent) => {
      const detectionRegionInteraction = guideDetectionRegionInteractionRef.current
      if (detectionRegionInteraction && event.pointerId === detectionRegionInteraction.pointerId) {
        clearDetectionRegionDraft()
        clearGuideDetectionRegionInteraction()
        return
      }

      const interaction = guideInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      clearGuideInteraction()
    }

    const commitWallEndpointDrag = (event: PointerEvent) => {
      const dragState = wallEndpointDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      const wall = wallById.get(dragState.wallId)
      if (wall) {
        const nextDraft = buildWallEndpointDraft(
          dragState.wallId,
          dragState.endpoint,
          dragState.fixedPoint,
          dragState.currentPoint,
        )
        const hasChanged = !(
          pointsEqual(nextDraft.start, wall.start) && pointsEqual(nextDraft.end, wall.end)
        )

        if (hasChanged && isWallLongEnough(nextDraft.start, nextDraft.end)) {
          updateNode(wall.id, {
            start: nextDraft.start,
            end: nextDraft.end,
          })
          sfxEmitter.emit('sfx:structure-build')
        }
      }

      clearWallEndpointDrag()
      setCursorPoint(null)
    }

    const commitWallCurveDrag = (event: PointerEvent) => {
      const dragState = wallCurveDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      const wall = wallById.get(dragState.wallId)
      if (wall) {
        const nextCurveOffset = normalizeWallCurveOffset(wall, dragState.currentCurveOffset)
        const currentCurveOffset = normalizeWallCurveOffset(wall, wall.curveOffset ?? 0)
        if (nextCurveOffset !== currentCurveOffset) {
          updateNode(wall.id, { curveOffset: nextCurveOffset })
          sfxEmitter.emit('sfx:structure-build')
        }
      }

      clearWallCurveDrag()
      setCursorPoint(null)
    }

    const cancelWallEndpointDrag = (event: PointerEvent) => {
      const dragState = wallEndpointDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      clearWallEndpointDrag()
      setCursorPoint(null)
    }

    const cancelWallCurveDrag = (event: PointerEvent) => {
      const dragState = wallCurveDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      clearWallCurveDrag()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitGuideInteraction)
    window.addEventListener('pointercancel', cancelGuideInteraction)
    window.addEventListener('pointerup', commitWallEndpointDrag)
    window.addEventListener('pointercancel', cancelWallEndpointDrag)
    window.addEventListener('pointerup', commitWallCurveDrag)
    window.addEventListener('pointercancel', cancelWallCurveDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitGuideInteraction)
      window.removeEventListener('pointercancel', cancelGuideInteraction)
      window.removeEventListener('pointerup', commitWallEndpointDrag)
      window.removeEventListener('pointercancel', cancelWallEndpointDrag)
      window.removeEventListener('pointerup', commitWallCurveDrag)
      window.removeEventListener('pointercancel', cancelWallCurveDrag)
    }
  }, [
    clearDetectionCandidates,
    clearDetectionRegionDraft,
    clearGuideDetectionRegionInteraction,
    clearWallCurveDrag,
    clearGuideInteraction,
    clearWallEndpointDrag,
    getSvgPointFromClientPoint,
    guideById,
    getPlanPointFromClientPoint,
    shiftPressed,
    updateNode,
    wallById,
    walls,
  ])

  useEffect(() => {
    clearWallEndpointDrag()
    clearWallCurveDrag()
  }, [clearWallCurveDrag, clearWallEndpointDrag, levelId])

  useEffect(() => {
    if (shouldShowSiteBoundaryHandles) {
      return
    }

    clearSiteBoundaryInteraction()
  }, [clearSiteBoundaryInteraction, shouldShowSiteBoundaryHandles])

  useEffect(() => {
    if (shouldShowSlabBoundaryHandles) {
      return
    }

    clearSlabBoundaryInteraction()
  }, [clearSlabBoundaryInteraction, shouldShowSlabBoundaryHandles])

  useEffect(() => {
    if (shouldShowCeilingBoundaryHandles) {
      return
    }

    clearCeilingBoundaryInteraction()
  }, [clearCeilingBoundaryInteraction, shouldShowCeilingBoundaryHandles])

  useEffect(() => {
    if (shouldShowZoneBoundaryHandles) {
      return
    }

    clearZoneBoundaryInteraction()
  }, [clearZoneBoundaryInteraction, shouldShowZoneBoundaryHandles])

  useEffect(() => {
    const dragState = siteVertexDragState
    if (!dragState) {
      return
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      setCursorPoint(snappedPoint)

      setSiteBoundaryDraft((currentDraft) => {
        if (!currentDraft || currentDraft.siteId !== dragState.siteId) {
          return currentDraft
        }

        const currentPoint = currentDraft.polygon[dragState.vertexIndex]
        if (currentPoint && pointsEqual(currentPoint, snappedPoint)) {
          return currentDraft
        }

        sfxEmitter.emit('sfx:grid-snap')

        const nextPolygon = [...currentDraft.polygon]
        nextPolygon[dragState.vertexIndex] = snappedPoint

        return {
          ...currentDraft,
          polygon: nextPolygon,
        }
      })
    }

    const commitSiteVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = siteBoundaryDraftRef.current
      if (
        draft &&
        site &&
        draft.siteId === site.id &&
        !polygonsEqual(draft.polygon, site.polygon?.points ?? [])
      ) {
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        updateNode(draft.siteId, {
          polygon: {
            type: 'polygon',
            points: draft.polygon,
          },
        })
        sfxEmitter.emit('sfx:structure-build')
      }

      clearSiteBoundaryInteraction()
      setCursorPoint(null)
    }

    const cancelSiteVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      clearSiteBoundaryInteraction()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitSiteVertexDrag)
    window.addEventListener('pointercancel', cancelSiteVertexDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitSiteVertexDrag)
      window.removeEventListener('pointercancel', cancelSiteVertexDrag)
    }
  }, [
    clearSiteBoundaryInteraction,
    getPlanPointFromClientPoint,
    site,
    siteVertexDragState,
    updateNode,
  ])

  useEffect(() => {
    const dragState = slabVertexDragState
    if (!dragState) {
      return
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      setCursorPoint(snappedPoint)

      setSlabBoundaryDraft((currentDraft) => {
        if (!currentDraft || currentDraft.slabId !== dragState.slabId) {
          return currentDraft
        }

        const currentPoint = currentDraft.polygon[dragState.vertexIndex]
        if (currentPoint && pointsEqual(currentPoint, snappedPoint)) {
          return currentDraft
        }

        sfxEmitter.emit('sfx:grid-snap')

        const nextPolygon = [...currentDraft.polygon]
        nextPolygon[dragState.vertexIndex] = snappedPoint

        return {
          ...currentDraft,
          polygon: nextPolygon,
        }
      })
    }

    const commitSlabVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = slabBoundaryDraftRef.current
      const slab = slabById.get(dragState.slabId)
      if (draft && slab && !polygonsEqual(draft.polygon, slab.polygon)) {
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        updateNode(draft.slabId, {
          polygon: draft.polygon,
        })
        sfxEmitter.emit('sfx:structure-build')
      }

      clearSlabBoundaryInteraction()
      setCursorPoint(null)
    }

    const cancelSlabVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      clearSlabBoundaryInteraction()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitSlabVertexDrag)
    window.addEventListener('pointercancel', cancelSlabVertexDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitSlabVertexDrag)
      window.removeEventListener('pointercancel', cancelSlabVertexDrag)
    }
  }, [
    clearSlabBoundaryInteraction,
    getPlanPointFromClientPoint,
    slabById,
    slabVertexDragState,
    updateNode,
  ])

  useEffect(() => {
    const dragState = ceilingVertexDragState
    if (!dragState) {
      return
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      setCursorPoint(snappedPoint)

      setCeilingBoundaryDraft((currentDraft) => {
        if (!currentDraft || currentDraft.ceilingId !== dragState.ceilingId) {
          return currentDraft
        }

        const currentPoint = currentDraft.polygon[dragState.vertexIndex]
        if (currentPoint && pointsEqual(currentPoint, snappedPoint)) {
          return currentDraft
        }

        sfxEmitter.emit('sfx:grid-snap')

        const nextPolygon = [...currentDraft.polygon]
        nextPolygon[dragState.vertexIndex] = snappedPoint

        return {
          ...currentDraft,
          polygon: nextPolygon,
        }
      })
    }

    const commitCeilingVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = ceilingBoundaryDraftRef.current
      const ceiling = ceilingById.get(dragState.ceilingId)
      if (draft && ceiling && !polygonsEqual(draft.polygon, ceiling.polygon)) {
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        updateNode(draft.ceilingId, {
          holes: draft.holes,
          polygon: draft.polygon,
        })
        sfxEmitter.emit('sfx:structure-build')
      }

      clearCeilingBoundaryInteraction()
      setCursorPoint(null)
    }

    const cancelCeilingVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      clearCeilingBoundaryInteraction()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitCeilingVertexDrag)
    window.addEventListener('pointercancel', cancelCeilingVertexDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitCeilingVertexDrag)
      window.removeEventListener('pointercancel', cancelCeilingVertexDrag)
    }
  }, [
    ceilingById,
    ceilingVertexDragState,
    clearCeilingBoundaryInteraction,
    getPlanPointFromClientPoint,
    updateNode,
  ])

  useEffect(() => {
    const dragState = zoneVertexDragState
    if (!dragState) {
      return
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      setCursorPoint(snappedPoint)

      setZoneBoundaryDraft((currentDraft) => {
        if (!currentDraft || currentDraft.zoneId !== dragState.zoneId) {
          return currentDraft
        }

        const currentPoint = currentDraft.polygon[dragState.vertexIndex]
        if (currentPoint && pointsEqual(currentPoint, snappedPoint)) {
          return currentDraft
        }

        sfxEmitter.emit('sfx:grid-snap')

        const nextPolygon = [...currentDraft.polygon]
        nextPolygon[dragState.vertexIndex] = snappedPoint

        return {
          ...currentDraft,
          polygon: nextPolygon,
        }
      })
    }

    const commitZoneVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = zoneBoundaryDraftRef.current
      const zone = zoneById.get(dragState.zoneId)
      if (draft && zone && !polygonsEqual(draft.polygon, zone.polygon)) {
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        updateNode(draft.zoneId, {
          polygon: draft.polygon,
        })
        sfxEmitter.emit('sfx:structure-build')
      }

      clearZoneBoundaryInteraction()
      setCursorPoint(null)
    }

    const cancelZoneVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      clearZoneBoundaryInteraction()
      setCursorPoint(null)
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitZoneVertexDrag)
    window.addEventListener('pointercancel', cancelZoneVertexDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitZoneVertexDrag)
      window.removeEventListener('pointercancel', cancelZoneVertexDrag)
    }
  }, [
    clearZoneBoundaryInteraction,
    getPlanPointFromClientPoint,
    updateNode,
    zoneById,
    zoneVertexDragState,
  ])

  useEffect(() => {
    return () => {
      setFloorplanHovered(false)
    }
  }, [setFloorplanHovered])

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 1) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    panStateRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    setIsPanning(true)

    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const endPanning = useCallback((event?: ReactPointerEvent<SVGSVGElement>) => {
    if (event && panStateRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    panStateRef.current = null
    setIsPanning(false)
  }, [])

  const hoveredWallIdRef = useRef<string | null>(null)
  const emitFloorplanWallLeave = useCallback((wallId: string | null) => {
    if (!wallId) {
      return
    }

    const wallNode = useScene.getState().nodes[wallId as AnyNodeId]
    if (!wallNode || wallNode.type !== 'wall') {
      return
    }

    emitter.emit('wall:leave', {
      node: wallNode,
      position: [0, 0, 0],
      localPosition: [0, 0, 0],
      stopPropagation: () => {},
    } as any)
  }, [])
  const emitFloorplanGridEvent = useCallback(
    (
      eventType: 'move' | 'click',
      planPoint: WallPlanPoint,
      nativeEvent: ReactMouseEvent<SVGSVGElement> | ReactPointerEvent<SVGSVGElement>,
    ) => {
      const snappedPoint = getSnappedFloorplanPoint(planPoint)
      const worldY =
        movingNode?.type === 'stair' || movingNode?.type === 'item' ? movingNode.position[1] : 0

      emitter.emit(`grid:${eventType}` as any, {
        nativeEvent: nativeEvent.nativeEvent as any,
        position: [snappedPoint[0], worldY, snappedPoint[1]],
        localPosition: [snappedPoint[0], worldY, snappedPoint[1]],
      })

      return snappedPoint
    },
    [movingNode],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (panStateRef.current?.pointerId === event.pointerId) {
        const deltaX = event.clientX - panStateRef.current.clientX
        const deltaY = event.clientY - panStateRef.current.clientY
        const worldPerPixelX = viewBox.width / surfaceSize.width
        const worldPerPixelY = viewBox.height / surfaceSize.height

        updateViewport({
          centerX: (viewport ?? fittedViewport).centerX - deltaX * worldPerPixelX,
          centerY: (viewport ?? fittedViewport).centerY - deltaY * worldPerPixelY,
          width: (viewport ?? fittedViewport).width,
        })

        panStateRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        }
        setCursorPoint(null)
        return
      }

      if (guideInteractionRef.current?.pointerId === event.pointerId) {
        return
      }

      if (wallEndpointDragRef.current?.pointerId === event.pointerId) {
        return
      }

      if (sketchLineEditDraft) {
        return
      }

      if (slabVertexDragState?.pointerId === event.pointerId) {
        return
      }

      if (siteVertexDragState?.pointerId === event.pointerId) {
        return
      }

      if (zoneVertexDragState?.pointerId === event.pointerId) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      if (wallEditOperation === 'offset' && selectedWallEntry) {
        const preview = getWallOffsetPreview({
          wall: selectedWallEntry.wall,
          point: planPoint,
        })
        setWallOffsetPreview(preview)
        setCursorPoint(planPoint)
        return
      }

      if (isFloorplanGridInteractionActive) {
        const snappedPoint = emitFloorplanGridEvent('move', planPoint, event)
        setCursorPoint((previousPoint) =>
          previousPoint && pointsEqual(previousPoint, snappedPoint) ? previousPoint : snappedPoint,
        )
        return
      }

      if (isPolygonBuildActive) {
        const snappedPoint = snapPolygonDraftPoint({
          point: planPoint,
          start: activePolygonDraftPoints[activePolygonDraftPoints.length - 1],
          angleSnap: activePolygonDraftPoints.length > 0 && !shiftPressed,
        })

        setCursorPoint((previousPoint) => {
          const hasChanged = !(previousPoint && pointsEqual(previousPoint, snappedPoint))
          if (hasChanged && activePolygonDraftPoints.length > 0) {
            sfxEmitter.emit('sfx:grid-snap')
          }
          return snappedPoint
        })
        return
      }

      if (isFenceBuildActive) {
        const snappedPoint = snapFenceDraftPoint({
          point: planPoint,
          walls,
          fences,
          start: fenceDraft?.start,
          angleSnap: Boolean(fenceDraft) && !shiftPressed,
        })

        setCursorPoint((previousPoint) => {
          const hasChanged = !(previousPoint && pointsEqual(previousPoint, snappedPoint))
          if (hasChanged && fenceDraft) {
            sfxEmitter.emit('sfx:grid-snap')
          }
          return snappedPoint
        })

        if (fenceDraft) {
          setFenceDraft((currentDraft) =>
            currentDraft ? { ...currentDraft, end: snappedPoint } : currentDraft,
          )
        }
        return
      }

      if (isOpeningPlacementActive) {
        const closest = findClosestWallPoint(planPoint, walls, {
          canUseWall: (wall) => !isCurvedWall(wall),
        })
        if (closest) {
          const dx = closest.wall.end[0] - closest.wall.start[0]
          const dz = closest.wall.end[1] - closest.wall.start[1]
          const length = Math.sqrt(dx * dx + dz * dz)
          const distance = closest.t * length

          const wallEvent = {
            node: closest.wall,
            point: { x: closest.point[0], y: 0, z: closest.point[1] },
            localPosition: [distance, floorplanOpeningLocalY, 0] as [number, number, number],
            normal: closest.normal,
            stopPropagation: () => {},
          }

          if (hoveredWallIdRef.current !== closest.wall.id) {
            if (hoveredWallIdRef.current) {
              emitFloorplanWallLeave(hoveredWallIdRef.current)
            }
            hoveredWallIdRef.current = closest.wall.id
            emitter.emit('wall:enter', wallEvent as any)
          } else {
            emitter.emit('wall:move', wallEvent as any)
          }
        } else if (hoveredWallIdRef.current) {
          emitFloorplanWallLeave(hoveredWallIdRef.current)
          hoveredWallIdRef.current = null
        }
        return
      }

      if (isMarqueeSelectionToolActive) {
        setCursorPoint((previousPoint) => {
          const snappedPoint = getSnappedFloorplanPoint(planPoint)
          return previousPoint && pointsEqual(previousPoint, snappedPoint)
            ? previousPoint
            : snappedPoint
        })
        return
      }

      if (isSketchLineBuildActive) {
        const snapResult = resolveWallSketchSnap({
          point: planPoint,
          walls: sketchSnapWalls,
          anchor: sketchLineDraft?.start,
          enableInference: Boolean(sketchLineDraft) && !shiftPressed,
          snapPoints: sketchEndpointSnapPoints,
        })
        const snappedPoint = snapResult.point

        setCursorPoint(snappedPoint)
        setWallSketchSnapResult(snapResult)

        if (!sketchLineDraft) {
          return
        }

        setSketchLineDraft((currentDraft) => {
          if (!currentDraft) {
            return currentDraft
          }

          if (!pointsEqual(currentDraft.end, snappedPoint)) {
            sfxEmitter.emit('sfx:grid-snap')
          }

          return { ...currentDraft, end: snappedPoint }
        })
        return
      }

      if (isSketchRectangleBuildActive) {
        const snapResult = resolveWallSketchSnap({
          point: planPoint,
          walls: sketchSnapWalls,
          enableInference: false,
          snapPoints: sketchEndpointSnapPoints,
        })
        const snappedPoint = snapResult.point
        setCursorPoint(snappedPoint)
        setWallSketchSnapResult(snapResult)

        if (!sketchRectangleDraft) {
          return
        }

        setSketchRectangleDraft((currentDraft) => {
          if (!currentDraft) {
            return currentDraft
          }

          if (!pointsEqual(currentDraft.end, snappedPoint)) {
            sfxEmitter.emit('sfx:grid-snap')
          }

          return { ...currentDraft, end: snappedPoint }
        })
        return
      }

      if (isSketchCircleBuildActive || isSketchArcBuildActive) {
        const snapResult = resolveWallSketchSnap({
          point: planPoint,
          walls: sketchSnapWalls,
          enableInference: false,
          snapPoints: sketchEndpointSnapPoints,
        })
        const snappedPoint = snapResult.point
        setCursorPoint(snappedPoint)
        setWallSketchSnapResult(snapResult)

        if (isSketchCircleBuildActive) {
          setSketchCircleDraft((currentDraft) => {
            if (!currentDraft) {
              return currentDraft
            }

            if (!pointsEqual(currentDraft.edge, snappedPoint)) {
              sfxEmitter.emit('sfx:grid-snap')
            }

            return { ...currentDraft, edge: snappedPoint }
          })
        } else {
          setSketchArcDraft((currentDraft) => {
            if (!currentDraft) {
              return currentDraft
            }

            if (!pointsEqual(currentDraft.end, snappedPoint)) {
              sfxEmitter.emit('sfx:grid-snap')
            }

            return { ...currentDraft, end: snappedPoint }
          })
        }
        return
      }

      if (isSketchDimensionActive) {
        setCursorPoint(getSnappedFloorplanPoint(planPoint))
        return
      }

      if (!isWallBuildActive) {
        setCursorPoint(null)
        setWallSketchSnapResult(null)
        return
      }

      if (wallLengthInput) {
        return
      }

      const snapResult = resolveWallSketchSnap({
        point: planPoint,
        walls,
        anchor: draftStart ?? undefined,
        enableInference: Boolean(draftStart) && !shiftPressed,
        snapPoints: sketchEndpointSnapPoints,
      })
      const snappedPoint = snapResult.point

      setCursorPoint(snappedPoint)
      setWallSketchSnapResult(snapResult)

      if (!draftStart) {
        return
      }

      setDraftEnd((previousEnd) => {
        if (
          !previousEnd ||
          previousEnd[0] !== snappedPoint[0] ||
          previousEnd[1] !== snappedPoint[1]
        ) {
          sfxEmitter.emit('sfx:grid-snap')
        }

        return snappedPoint
      })
    },
    [
      draftStart,
      emitFloorplanWallLeave,
      emitFloorplanGridEvent,
      floorplanOpeningLocalY,
      fences,
      fenceDraft,
      fittedViewport,
      getPlanPointFromClientPoint,
      activePolygonDraftPoints,
      isFloorplanGridInteractionActive,
      isFenceBuildActive,
      isMarqueeSelectionToolActive,
      isOpeningPlacementActive,
      isPolygonBuildActive,
      isSketchArcBuildActive,
      isSketchCircleBuildActive,
      isSketchDimensionActive,
      isSketchLineBuildActive,
      isSketchRectangleBuildActive,
      isWallBuildActive,
      selectedWallEntry,
      siteVertexDragState,
      slabVertexDragState,
      shiftPressed,
      sketchEndpointSnapPoints,
      sketchSnapWalls,
      sketchLineEditDraft,
      sketchLineDraft,
      sketchRectangleDraft,
      setSketchLineDraft,
      setSketchRectangleDraft,
      setSketchArcDraft,
      setSketchCircleDraft,
      surfaceSize.height,
      surfaceSize.width,
      updateViewport,
      viewBox.height,
      viewBox.width,
      viewport,
      walls,
      wallEditOperation,
      wallLengthInput,
      zoneVertexDragState,
    ],
  )

  const handleSlabPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      const lastPoint = slabDraftPoints[slabDraftPoints.length - 1]
      if (lastPoint && pointsEqual(lastPoint, point)) {
        return
      }

      const firstPoint = slabDraftPoints[0]
      if (firstPoint && slabDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint)) {
        createSlabOnCurrentLevel(slabDraftPoints)
        clearDraft()
        return
      }

      setSlabDraftPoints((currentPoints) => [...currentPoints, point])
      setCursorPoint(point)
    },
    [clearDraft, createSlabOnCurrentLevel, slabDraftPoints],
  )
  const handleSlabPlacementConfirm = useCallback(
    (point?: WallPlanPoint) => {
      const firstPoint = slabDraftPoints[0]
      const lastPoint = slabDraftPoints[slabDraftPoints.length - 1]

      let nextPoints = slabDraftPoints
      if (point) {
        const isClosingExistingPolygon = Boolean(
          firstPoint && slabDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint),
        )
        const isDuplicatePoint = Boolean(lastPoint && pointsEqual(lastPoint, point))

        if (!(isClosingExistingPolygon || isDuplicatePoint)) {
          nextPoints = [...slabDraftPoints, point]
        }
      }

      if (nextPoints.length < 3) {
        return
      }

      createSlabOnCurrentLevel(nextPoints)
      clearDraft()
    },
    [clearDraft, createSlabOnCurrentLevel, slabDraftPoints],
  )
  const handleCeilingPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      const lastPoint = ceilingDraftPoints[ceilingDraftPoints.length - 1]
      if (lastPoint && pointsEqual(lastPoint, point)) {
        return
      }

      const firstPoint = ceilingDraftPoints[0]
      if (firstPoint && ceilingDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint)) {
        createCeilingOnCurrentLevel(ceilingDraftPoints)
        clearDraft()
        return
      }

      setCeilingDraftPoints((currentPoints) => [...currentPoints, point])
      setCursorPoint(point)
    },
    [ceilingDraftPoints, clearDraft, createCeilingOnCurrentLevel],
  )
  const handleCeilingPlacementConfirm = useCallback(
    (point?: WallPlanPoint) => {
      const firstPoint = ceilingDraftPoints[0]
      const lastPoint = ceilingDraftPoints[ceilingDraftPoints.length - 1]

      let nextPoints = ceilingDraftPoints
      if (point) {
        const isClosingExistingPolygon = Boolean(
          firstPoint && ceilingDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint),
        )
        const isDuplicatePoint = Boolean(lastPoint && pointsEqual(lastPoint, point))

        if (!(isClosingExistingPolygon || isDuplicatePoint)) {
          nextPoints = [...ceilingDraftPoints, point]
        }
      }

      if (nextPoints.length < 3) {
        return
      }

      createCeilingOnCurrentLevel(nextPoints)
      clearDraft()
    },
    [ceilingDraftPoints, clearDraft, createCeilingOnCurrentLevel],
  )
  const handleZonePlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      const lastPoint = zoneDraftPoints[zoneDraftPoints.length - 1]
      if (lastPoint && pointsEqual(lastPoint, point)) {
        return
      }

      const firstPoint = zoneDraftPoints[0]
      if (firstPoint && zoneDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint)) {
        createZoneOnCurrentLevel(zoneDraftPoints)
        clearDraft()
        return
      }

      setZoneDraftPoints((currentPoints) => [...currentPoints, point])
      setCursorPoint(point)
    },
    [clearDraft, createZoneOnCurrentLevel, zoneDraftPoints],
  )
  const handleZonePlacementConfirm = useCallback(
    (point?: WallPlanPoint) => {
      const firstPoint = zoneDraftPoints[0]
      const lastPoint = zoneDraftPoints[zoneDraftPoints.length - 1]

      let nextPoints = zoneDraftPoints
      if (point) {
        const isClosingExistingPolygon = Boolean(
          firstPoint && zoneDraftPoints.length >= 3 && isPointNearPlanPoint(point, firstPoint),
        )
        const isDuplicatePoint = Boolean(lastPoint && pointsEqual(lastPoint, point))

        if (!(isClosingExistingPolygon || isDuplicatePoint)) {
          nextPoints = [...zoneDraftPoints, point]
        }
      }

      if (nextPoints.length < 3) {
        return
      }

      createZoneOnCurrentLevel(nextPoints)
      clearDraft()
    },
    [clearDraft, createZoneOnCurrentLevel, zoneDraftPoints],
  )

  const handleFencePlacementPoint = useCallback(
    (point: FencePlanPoint) => {
      if (!fenceDraft) {
        setFenceDraft({ start: point, end: point })
        setCursorPoint(point)
        return
      }

      if (!isWallLongEnough(fenceDraft.start, point)) {
        return
      }

      const fence = createFenceOnCurrentLevel(fenceDraft.start, point)
      if (!fence) {
        return
      }

      setFenceDraft({ start: point, end: point })
      setCursorPoint(point)
    },
    [fenceDraft],
  )

  const handleWallPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      if (!draftStart) {
        setDraftStart(point)
        setDraftEnd(point)
        setCursorPoint(point)
        return
      }

      if (!isWallLongEnough(draftStart, point)) {
        return
      }

      const wall = createWallOnCurrentLevel(draftStart, point)
      if (wall && levelId) {
        const nextWalls = Object.values(useScene.getState().nodes).filter(
          (node): node is WallNode => node?.type === 'wall' && node.parentId === levelId,
        )
        const closedLoop = detectClosedWallLoops(nextWalls).find((loop) =>
          loop.wallIds.includes(wall.id),
        )
        if (closedLoop) {
          showWallEditFeedback(
            'Closed loop detected. Select a wall in it to create a zone or slab.',
          )
        }
      }
      setDraftStart(point)
      setDraftEnd(point)
      setCursorPoint(point)
      setWallSketchSnapResult(null)
      setWallLengthInput(null)
    },
    [draftStart, levelId, showWallEditFeedback],
  )

  const handleBackgroundClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (isPolygonBuildActive && event.detail >= 2) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      if (wallEditOperation === 'offset' && commitWallOffsetAtPoint(planPoint)) {
        return
      }

      if (isFenceBuildActive) {
        const snappedPoint = snapFenceDraftPoint({
          point: planPoint,
          walls,
          fences,
          start: fenceDraft?.start,
          angleSnap: Boolean(fenceDraft) && !shiftPressed,
        })
        handleFencePlacementPoint(snappedPoint)
        return
      }

      if (isOpeningPlacementActive) {
        const closest = findClosestWallPoint(planPoint, walls, {
          canUseWall: (wall) => !isCurvedWall(wall),
        })
        if (closest) {
          const dx = closest.wall.end[0] - closest.wall.start[0]
          const dz = closest.wall.end[1] - closest.wall.start[1]
          const length = Math.sqrt(dx * dx + dz * dz)
          const distance = closest.t * length

          emitter.emit('wall:click', {
            node: closest.wall,
            point: { x: closest.point[0], y: 0, z: closest.point[1] },
            localPosition: [distance, floorplanOpeningLocalY, 0],
            normal: closest.normal,
            stopPropagation: () => {},
          } as any)
        }
        return
      }

      if (isFloorplanGridInteractionActive) {
        const snappedPoint = emitFloorplanGridEvent('click', planPoint, event)
        setCursorPoint(snappedPoint)
        return
      }

      if (isPolygonBuildActive) {
        const snappedPoint = snapPolygonDraftPoint({
          point: planPoint,
          start: activePolygonDraftPoints[activePolygonDraftPoints.length - 1],
          angleSnap: activePolygonDraftPoints.length > 0 && !shiftPressed,
        })

        if (isZoneBuildActive) {
          handleZonePlacementPoint(snappedPoint)
        } else if (isCeilingBuildActive) {
          handleCeilingPlacementPoint(snappedPoint)
        } else {
          handleSlabPlacementPoint(snappedPoint)
        }
        return
      }

      if (isSketchLineBuildActive) {
        const snapResult = resolveWallSketchSnap({
          point: planPoint,
          walls: sketchSnapWalls,
          anchor: sketchLineDraft?.start,
          enableInference: Boolean(sketchLineDraft) && !shiftPressed,
          snapPoints: sketchEndpointSnapPoints,
        })
        setWallSketchSnapResult(snapResult)
        handleSketchLinePlacementPoint(snapResult.point, snapResult.target)
        return
      }

      if (isSketchRectangleBuildActive) {
        const snapResult = resolveWallSketchSnap({
          point: planPoint,
          walls: sketchSnapWalls,
          enableInference: false,
          snapPoints: sketchEndpointSnapPoints,
        })
        setWallSketchSnapResult(snapResult)
        handleSketchRectanglePlacementPoint(snapResult.point, snapResult.target)
        return
      }

      if (isSketchCircleBuildActive || isSketchArcBuildActive) {
        const snapResult = resolveWallSketchSnap({
          point: planPoint,
          walls: sketchSnapWalls,
          enableInference: false,
          snapPoints: sketchEndpointSnapPoints,
        })
        setWallSketchSnapResult(snapResult)
        if (isSketchCircleBuildActive) {
          handleSketchCirclePlacementPoint(snapResult.point)
        } else {
          handleSketchArcPlacementPoint(snapResult.point)
        }
        return
      }

      if (isSketchDimensionActive) {
        setSelectedReferenceId(null)
        setSelection({ selectedIds: [] })
        return
      }

      if (canSelectFloorplanZones) {
        const zoneHit = visibleZonePolygons.find(({ polygon }) =>
          isPointInsidePolygon(toPoint2D(planPoint), polygon),
        )
        if (zoneHit) {
          setSelectedReferenceId(null)
          setSelection({ zoneId: zoneHit.zone.id })
          return
        }
      }

      if (!isWallBuildActive) {
        if (structureLayer === 'zones') {
          setSelectedReferenceId(null)
          setSelection({ zoneId: null })
          // Return to structure select (same as 3D grid click)
          useEditor.getState().setStructureLayer('elements')
          useEditor.getState().setMode('select')
        } else {
          setSelectedReferenceId(null)
          setSelection({ selectedIds: [] })
        }
        return
      }

      const snapResult = resolveWallSketchSnap({
        point: planPoint,
        walls,
        anchor: draftStart ?? undefined,
        enableInference: Boolean(draftStart) && !shiftPressed,
        snapPoints: sketchEndpointSnapPoints,
      })
      const snappedPoint = snapResult.point

      setWallSketchSnapResult(snapResult)
      handleWallPlacementPoint(snappedPoint)
    },
    [
      commitWallOffsetAtPoint,
      draftStart,
      emitFloorplanGridEvent,
      fences,
      fenceDraft,
      floorplanOpeningLocalY,
      getPlanPointFromClientPoint,
      activePolygonDraftPoints,
      handleCeilingPlacementPoint,
      handleFencePlacementPoint,
      canSelectFloorplanZones,
      handleSlabPlacementPoint,
      handleSketchLinePlacementPoint,
      handleSketchRectanglePlacementPoint,
      handleSketchArcPlacementPoint,
      handleSketchCirclePlacementPoint,
      handleZonePlacementPoint,
      handleWallPlacementPoint,
      isCeilingBuildActive,
      isFenceBuildActive,
      isFloorplanGridInteractionActive,
      isOpeningPlacementActive,
      isPolygonBuildActive,
      isSketchArcBuildActive,
      isSketchCircleBuildActive,
      isSketchDimensionActive,
      isSketchLineBuildActive,
      isSketchRectangleBuildActive,
      isWallBuildActive,
      isWindowBuildActive,
      isZoneBuildActive,
      movingOpeningType,
      setSelectedReferenceId,
      setSelection,
      shiftPressed,
      sketchEndpointSnapPoints,
      sketchLineDraft,
      sketchSnapWalls,
      structureLayer,
      visibleZonePolygons,
      walls,
      wallEditOperation,
    ],
  )
  const handleBackgroundDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (!isPolygonBuildActive) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint = snapPolygonDraftPoint({
        point: planPoint,
        start: activePolygonDraftPoints[activePolygonDraftPoints.length - 1],
        angleSnap: activePolygonDraftPoints.length > 0 && !shiftPressed,
      })

      if (isZoneBuildActive) {
        handleZonePlacementConfirm(snappedPoint)
      } else if (isCeilingBuildActive) {
        handleCeilingPlacementConfirm(snappedPoint)
      } else {
        handleSlabPlacementConfirm(snappedPoint)
      }
    },
    [
      activePolygonDraftPoints,
      getPlanPointFromClientPoint,
      handleCeilingPlacementConfirm,
      handleSlabPlacementConfirm,
      handleZonePlacementConfirm,
      isCeilingBuildActive,
      isPolygonBuildActive,
      isZoneBuildActive,
      shiftPressed,
    ],
  )

  const commitFloorplanSelection = useCallback(
    (nextSelectedIds: string[]) => {
      if (!(levelId && levelNode) || levelNode.type !== 'level') {
        setSelectedReferenceId(null)
        setSelection({ selectedIds: nextSelectedIds })
        return
      }

      const { selection } = useViewer.getState()
      const nodes = useScene.getState().nodes
      const updates: Parameters<typeof setSelection>[0] = {
        selectedIds: nextSelectedIds,
      }

      if (levelId !== selection.levelId) {
        updates.levelId = levelId
      }

      const parentNode = levelNode.parentId ? nodes[levelNode.parentId as AnyNodeId] : null
      if (parentNode?.type === 'building' && parentNode.id !== selection.buildingId) {
        updates.buildingId = parentNode.id
      }

      setSelectedReferenceId(null)
      setSelection(updates)
    },
    [levelId, levelNode, setSelectedReferenceId, setSelection],
  )

  const addFloorplanSelection = useCallback(
    (nextSelectedIds: string[], modifierKeys?: { meta: boolean; ctrl: boolean }) => {
      const shouldAppend = Boolean(modifierKeys?.meta || modifierKeys?.ctrl)

      if (shouldAppend) {
        if (nextSelectedIds.length === 0) {
          return
        }

        const currentSelectedIds = useViewer.getState().selection.selectedIds
        commitFloorplanSelection(Array.from(new Set([...currentSelectedIds, ...nextSelectedIds])))
        return
      }

      commitFloorplanSelection(nextSelectedIds)
    },
    [commitFloorplanSelection],
  )

  const toggleFloorplanSelection = useCallback(
    (nodeId: string, modifierKeys?: { meta: boolean; ctrl: boolean }) => {
      const shouldToggle = Boolean(modifierKeys?.meta || modifierKeys?.ctrl)

      if (shouldToggle) {
        const currentSelectedIds = useViewer.getState().selection.selectedIds
        commitFloorplanSelection(
          currentSelectedIds.includes(nodeId)
            ? currentSelectedIds.filter((selectedId) => selectedId !== nodeId)
            : [...currentSelectedIds, nodeId],
        )
        return
      }

      commitFloorplanSelection([nodeId])
    },
    [commitFloorplanSelection],
  )

  const getFloorplanHitIdAtPoint = useCallback(
    (planPoint: WallPlanPoint) => {
      const point = toPoint2D(planPoint)

      const getItemHitId = () => {
        if (!isFloorplanItemContextActive) {
          return null
        }

        const itemHit = sketchContextItemEntries.find(({ polygon }) =>
          isPointInsidePolygon(point, polygon),
        )
        return itemHit?.item.id ?? null
      }

      if (phase === 'structure') {
        const openingHit = sketchContextOpeningPolygons.find(({ polygon }) => {
          if (isPointInsidePolygon(point, polygon)) {
            return true
          }

          const centerLine = getOpeningCenterLine(polygon)
          if (!centerLine) {
            return false
          }

          return (
            getDistanceToWallSegment(
              point,
              [centerLine.start.x, centerLine.start.y],
              [centerLine.end.x, centerLine.end.y],
            ) <= floorplanOpeningHitTolerance
          )
        })
        if (openingHit) {
          return openingHit.opening.id
        }

        const stairHit = sketchContextStairEntries.find(({ segments }) =>
          segments.some(({ polygon }) => isPointInsidePolygon(point, polygon)),
        )
        if (stairHit) {
          return stairHit.stair.id
        }

        const sketchLineHit = sketchLineEntries.find(
          ({ line }) =>
            getDistanceToWallSegment(point, line.start, line.end) <= floorplanWallHitTolerance,
        )
        if (sketchLineHit) {
          return sketchLineHit.line.id
        }

        const wallHit = sketchContextWallPolygons.find(
          ({ wall, polygon }) =>
            isPointInsidePolygon(point, polygon) ||
            getDistanceToWallSegment(point, wall.start, wall.end) <= floorplanWallHitTolerance,
        )
        if (wallHit) {
          return wallHit.wall.id
        }

        const slabHit = sketchContextSlabPolygons.find(({ polygon, holes }) =>
          isPointInsidePolygonWithHoles(point, polygon, holes),
        )
        if (slabHit) {
          return slabHit.slab.id
        }

        const ceilingHit = sketchContextCeilingPolygons.find(({ polygon, holes }) =>
          isPointInsidePolygonWithHoles(point, polygon, holes),
        )
        if (ceilingHit) {
          return ceilingHit.ceiling.id
        }

        const fenceHit = sketchContextFencePolygons.find(
          ({ fence, polygon }) =>
            isPointInsidePolygon(point, polygon) ||
            getDistanceToWallSegment(point, fence.start, fence.end) <= floorplanWallHitTolerance,
        )
        if (fenceHit) {
          return fenceHit.fence.id
        }
      }

      return getItemHitId()
    },
    [
      sketchContextCeilingPolygons,
      sketchContextFencePolygons,
      sketchContextItemEntries,
      sketchContextOpeningPolygons,
      sketchContextSlabPolygons,
      sketchContextStairEntries,
      sketchContextWallPolygons,
      floorplanOpeningHitTolerance,
      floorplanWallHitTolerance,
      phase,
      sketchLineEntries,
      isFloorplanItemContextActive,
    ],
  )

  const getSketchContextHitAtPoint = useCallback(
    (planPoint: WallPlanPoint) => {
      return resolveSketchContextHitAtPoint({
        planPoint,
        sketchLineEntries,
        sketchCircleEntries,
        floorplanWallHitTolerance,
        floorplanWorldUnitsPerPixel,
        endpointHitStrokeWidth: FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH,
      })
    },
    [
      floorplanWallHitTolerance,
      floorplanWorldUnitsPerPixel,
      sketchCircleEntries,
      sketchLineEntries,
    ],
  )

  const {
    activateSketchContextTool,
    cancelSketchContextDraft,
    endSketchContextDraft,
    commitSketchContextDraft,
    continueSketchFromEndpoint,
    connectSketchEndpointToNearest,
    connectSketchEndpointToNearestCircle,
    connectSketchEndpointToNearestLine,
    connectSketchEndpointToNearestMidpoint,
    clearSketchEndpointCoincident,
    deleteSketchContextSelection,
    deleteSketchCircleContextSelection,
    selectAllSketchLines,
    zoomFloorplanToFit,
  } = useFloorplanSketchContextActions({
    clearDraft,
    clearSketchLinePlacementDraft,
    setCursorPoint,
    setWallSketchSnapResult,
    setMode,
    setTool,
    setPhase,
    setStructureLayer,
    sketchLineDraft,
    sketchRectangleDraft,
    sketchCircleDraft,
    sketchArcDraft,
    wallSketchSnapTarget: wallSketchSnapResult?.target ?? null,
    handleSketchLinePlacementPoint,
    handleSketchRectanglePlacementPoint,
    handleSketchCirclePlacementPoint,
    handleSketchArcPlacementPoint,
    sketchLineById,
    sketchLineEntries,
    sketchCircleEntries,
    floorplanWorldUnitsPerPixel,
    setSelection,
    setSketchLineDraft,
    showWallEditFeedback,
    updateNode,
    handleSelectedSketchLineDelete,
    handleSelectedSketchCircleDelete,
    commitFloorplanSelection,
    fittedViewport,
    setViewport,
    hasUserAdjustedViewportRef,
  })

  const handleActivateSketchToolbarTool = useCallback(
    (nextTool: SketchContextTool) => {
      resetSketchOperations()
      setSketchWorkbenchTab('sketch')
      activateSketchContextTool(nextTool)
    },
    [activateSketchContextTool, resetSketchOperations],
  )

  const handleCancelSketchToolbarDraft = useCallback(() => {
    cancelSketchContextDraft()
    resetSketchOperations()
  }, [cancelSketchContextDraft, resetSketchOperations])

  const handleExitSketchWorkbench = useCallback(() => {
    resetSketchOperations()
    clearDraft()
    setWallSketchSnapResult(null)
    setSketchWorkbenchTab('features')
    setMode('build')
    setTool(null)
  }, [clearDraft, resetSketchOperations, setMode, setTool, setWallSketchSnapResult])

  const handleSelectSketchPlaneRecord = useCallback(
    (record: SketchPlaneRecord) => {
      resetSketchOperations()
      clearDraft()
      setWallSketchSnapResult(null)
      setSketchPlane(record.sketchPlane)
      setSketchWorkbenchTab('sketch')
      setPhase('structure')
      setStructureLayer('elements')
      setMode('build')
      setTool('sketch-line')
    },
    [
      clearDraft,
      resetSketchOperations,
      setMode,
      setPhase,
      setSketchPlane,
      setStructureLayer,
      setTool,
      setWallSketchSnapResult,
    ],
  )

  const isSketchWorkbenchActive = useMemo(
    () =>
      phase === 'structure' &&
      structureLayer === 'elements' &&
      (isSketchStructureTool(tool) ||
        Boolean(sketchPlane) ||
        selectedSketchLineList.length > 0 ||
        selectedSketchCircleList.length > 0 ||
        activeSketchDraftKind !== null ||
        Boolean(sketchLineEditOperation) ||
        Boolean(sketchCircleEditOperation)),
    [
      activeSketchDraftKind,
      phase,
      selectedSketchCircleList.length,
      selectedSketchLineList.length,
      sketchCircleEditOperation,
      sketchPlane,
      sketchLineEditOperation,
      structureLayer,
      tool,
    ],
  )

  const handleFloorplanContextMenuCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!levelNode || levelNode.type !== 'level') {
        setSketchContextMenuTarget(null)
        return
      }

      if (sketchLineDraft || sketchRectangleDraft || sketchCircleDraft || sketchArcDraft) {
        const canCommit = Boolean(
          (sketchLineDraft && isSketchLineLongEnough(sketchLineDraft.start, sketchLineDraft.end)) ||
            (sketchRectangleDraft &&
              isSketchLineLongEnough(sketchRectangleDraft.start, sketchRectangleDraft.end)) ||
            (sketchCircleDraft &&
              Math.hypot(
                sketchCircleDraft.edge[0] - sketchCircleDraft.center[0],
                sketchCircleDraft.edge[1] - sketchCircleDraft.center[1],
              ) > 1e-6) ||
            (sketchArcDraft?.start &&
              Math.hypot(
                sketchArcDraft.end[0] - sketchArcDraft.center[0],
                sketchArcDraft.end[1] - sketchArcDraft.center[1],
              ) > 1e-6 &&
              Math.hypot(
                sketchArcDraft.end[0] - sketchArcDraft.start[0],
                sketchArcDraft.end[1] - sketchArcDraft.start[1],
              ) > 1e-6),
        )
        const draft = sketchRectangleDraft
          ? 'rectangle'
          : sketchCircleDraft
            ? 'circle'
            : sketchArcDraft
              ? 'arc'
              : 'line'
        setSketchContextMenuTarget({
          kind: 'sketch-drawing',
          draft,
          canCommit,
        })
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      const hit =
        planPoint && (canInteractFloorplanSketchLines || canInteractFloorplanSketchCircles)
          ? getSketchContextHitAtPoint(planPoint)
          : null

      if (
        hit &&
        (hit.kind === 'sketch-line' ||
          hit.kind === 'sketch-endpoint' ||
          hit.kind === 'sketch-circle')
      ) {
        const shouldKeepMultiSelection =
          (hit.kind === 'sketch-line' &&
            selectedSketchLineList.length > 1 &&
            selectedIdSet.has(hit.lineId)) ||
          (hit.kind === 'sketch-circle' &&
            selectedSketchCircleList.length > 1 &&
            selectedIdSet.has(hit.circleId))

        if (!shouldKeepMultiSelection) {
          flushSync(() => {
            commitFloorplanSelection([hit.kind === 'sketch-circle' ? hit.circleId : hit.lineId])
          })
        }

        setSketchContextMenuTarget(hit)
        return
      }

      if (phase === 'structure' && structureLayer !== 'zones') {
        setSketchContextMenuTarget({
          kind: 'sketch-canvas',
          hasSketchLines: sketchLineEntries.length + sketchCircleEntries.length > 0,
        })
        return
      }

      setSketchContextMenuTarget(null)
    },
    [
      canInteractFloorplanSketchCircles,
      canInteractFloorplanSketchLines,
      commitFloorplanSelection,
      getPlanPointFromClientPoint,
      getSketchContextHitAtPoint,
      levelNode,
      phase,
      selectedIdSet,
      selectedSketchCircleList.length,
      selectedSketchLineList.length,
      sketchArcDraft,
      sketchCircleDraft,
      sketchCircleEntries.length,
      sketchLineDraft,
      sketchLineEntries.length,
      sketchRectangleDraft,
      structureLayer,
    ],
  )

  const getFloorplanSelectionIdsInBounds = useCallback(
    (bounds: FloorplanSelectionBounds) => {
      const itemIds = isFloorplanItemContextActive
        ? sketchContextItemEntries
            .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
            .map(({ item }) => item.id)
        : []

      if (phase !== 'structure') {
        return itemIds
      }

      const wallIds = sketchContextWallPolygons
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ wall }) => wall.id)
      const openingIds = sketchContextOpeningPolygons
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ opening }) => opening.id)
      const slabIds = sketchContextSlabPolygons
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ slab }) => slab.id)
      const ceilingIds = sketchContextCeilingPolygons
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ ceiling }) => ceiling.id)
      const fenceIds = sketchContextFencePolygons
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ fence }) => fence.id)
      const sketchLineIds = sketchLineEntries
        .filter(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds))
        .map(({ line }) => line.id)
      const sketchCircleIds = sketchCircleEntries
        .filter(({ centerline }) => doesPolygonIntersectSelectionBounds(centerline, bounds))
        .map(({ circle }) => circle.id)
      const stairIds = sketchContextStairEntries
        .filter(({ segments }) =>
          segments.some(({ polygon }) => doesPolygonIntersectSelectionBounds(polygon, bounds)),
        )
        .map(({ stair }) => stair.id)

      return Array.from(
        new Set([
          ...itemIds,
          ...wallIds,
          ...openingIds,
          ...slabIds,
          ...ceilingIds,
          ...fenceIds,
          ...sketchLineIds,
          ...sketchCircleIds,
          ...stairIds,
        ]),
      )
    },
    [
      isFloorplanItemContextActive,
      phase,
      sketchContextCeilingPolygons,
      sketchContextFencePolygons,
      sketchContextItemEntries,
      sketchContextOpeningPolygons,
      sketchContextSlabPolygons,
      sketchContextStairEntries,
      sketchContextWallPolygons,
      sketchCircleEntries,
      sketchLineEntries,
    ],
  )

  const syncPreviewSelectedIds = useCallback(
    (nextSelectedIds: string[]) => {
      const currentPreviewSelectedIds = useViewer.getState().previewSelectedIds
      if (haveSameIds(currentPreviewSelectedIds, nextSelectedIds)) {
        return
      }

      setPreviewSelectedIds(nextSelectedIds)
    },
    [setPreviewSelectedIds],
  )

  const syncDeleteHoveredId = useCallback(
    (nodeId: string | null) => {
      if (!isDeleteMode) {
        return
      }

      useViewer.getState().setHoveredId(nodeId as AnyNodeId | null)
    },
    [isDeleteMode],
  )

  const handleWallHoverChange = useCallback(
    (wallId: WallNode['id'] | null) => {
      setHoveredWallId(wallId)
      syncDeleteHoveredId(wallId)
    },
    [syncDeleteHoveredId],
  )

  const handleSketchLineHoverChange = useCallback(
    (lineId: SketchLineNode['id'] | null) => {
      setHoveredSketchLineId(lineId)
      syncDeleteHoveredId(lineId)
    },
    [syncDeleteHoveredId],
  )

  const handleSketchCircleHoverChange = useCallback(
    (circleId: SketchCircleNode['id'] | null) => {
      setHoveredSketchCircleId(circleId)
      syncDeleteHoveredId(circleId)
    },
    [syncDeleteHoveredId],
  )

  const handleOpeningHoverChange = useCallback(
    (openingId: OpeningNode['id'] | null) => {
      setHoveredOpeningId(openingId)
      syncDeleteHoveredId(openingId)
    },
    [syncDeleteHoveredId],
  )

  const handleSlabHoverChange = useCallback(
    (slabId: SlabNode['id'] | null) => {
      setHoveredSlabId(slabId)
      syncDeleteHoveredId(slabId)
    },
    [syncDeleteHoveredId],
  )

  const handleCeilingHoverChange = useCallback(
    (ceilingId: CeilingNode['id'] | null) => {
      setHoveredCeilingId(ceilingId)
      syncDeleteHoveredId(ceilingId)
    },
    [syncDeleteHoveredId],
  )

  const handleFenceHoverChange = useCallback(
    (fenceId: FenceNode['id'] | null) => {
      setHoveredFenceId(fenceId)
      syncDeleteHoveredId(fenceId)
    },
    [syncDeleteHoveredId],
  )

  const handleItemHoverChange = useCallback(
    (itemId: ItemNode['id'] | null) => {
      setHoveredItemId(itemId)
      syncDeleteHoveredId(itemId)
    },
    [syncDeleteHoveredId],
  )

  const handleStairHoverChange = useCallback(
    (stairId: StairNode['id'] | null) => {
      setHoveredStairId(stairId)
      syncDeleteHoveredId(stairId)
    },
    [syncDeleteHoveredId],
  )

  const handleZoneHoverChange = useCallback(
    (zoneId: ZoneNodeType['id'] | null) => {
      setHoveredZoneId(zoneId)
      syncDeleteHoveredId(zoneId)
    },
    [syncDeleteHoveredId],
  )
  const handleFloorplanItemHoverEnter = useCallback(
    (itemId: ItemNode['id']) => {
      handleOpeningHoverChange(null)
      handleWallHoverChange(null)
      handleSketchLineHoverChange(null)
      handleSlabHoverChange(null)
      handleCeilingHoverChange(null)
      handleFenceHoverChange(null)
      handleStairHoverChange(null)
      handleZoneHoverChange(null)
      handleItemHoverChange(itemId)
    },
    [
      handleItemHoverChange,
      handleCeilingHoverChange,
      handleFenceHoverChange,
      handleOpeningHoverChange,
      handleSketchLineHoverChange,
      handleSlabHoverChange,
      handleStairHoverChange,
      handleWallHoverChange,
      handleZoneHoverChange,
    ],
  )
  const handleFloorplanStairHoverEnter = useCallback(
    (stairId: StairNode['id']) => {
      handleItemHoverChange(null)
      handleOpeningHoverChange(null)
      handleSlabHoverChange(null)
      handleCeilingHoverChange(null)
      handleFenceHoverChange(null)
      handleWallHoverChange(null)
      handleSketchLineHoverChange(null)
      handleZoneHoverChange(null)
      handleStairHoverChange(stairId)
    },
    [
      handleItemHoverChange,
      handleCeilingHoverChange,
      handleFenceHoverChange,
      handleOpeningHoverChange,
      handleSketchLineHoverChange,
      handleSlabHoverChange,
      handleStairHoverChange,
      handleWallHoverChange,
      handleZoneHoverChange,
    ],
  )

  const handleWallSelect = useCallback(
    (wall: WallNode) => {
      commitFloorplanSelection([wall.id])
    },
    [commitFloorplanSelection],
  )

  const handleSketchLineClick = useCallback(
    (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => {
      if (sketchLineEditOperation || sketchCircleEditOperation) {
        event.preventDefault()
        event.stopPropagation()
        const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
        if (!planPoint) {
          showWallEditFeedback('请点击草图线完成当前草图编辑。')
          return
        }

        handleSketchLineOperationClick(line, planPoint)
        return
      }

      if (isDeleteMode) {
        event.preventDefault()
        event.stopPropagation()
        const constraintCleanupUpdates = buildRemoveSketchLineConstraintReferencesPlan({
          linesById: sketchLineById,
          deletedIds: [line.id],
        })
        const distanceDimensionIds = collectSketchDistanceDimensionIdsReferencingEntities({
          dimensions: displaySketchDimensions,
          deletedLineIds: [line.id],
        })
        if (constraintCleanupUpdates.length > 0) {
          useScene.getState().updateNodes(
            constraintCleanupUpdates.map((update) => ({
              id: update.id as AnyNodeId,
              data: update.data as Partial<AnyNode>,
            })),
          )
          for (const update of constraintCleanupUpdates) {
            useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
          }
        }
        sfxEmitter.emit('sfx:item-delete')
        for (const dimensionId of distanceDimensionIds) {
          deleteNode(dimensionId as AnyNodeId)
        }
        deleteNode(line.id as AnyNodeId)
        setSelection({ selectedIds: [] })
        return
      }

      if (isSketchDimensionActive) {
        openSketchDimensionInput(
          line,
          getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
        )
        event.preventDefault()
        return
      }

      toggleFloorplanSelection(line.id, getSelectionModifierKeys(event))
    },
    [
      deleteNode,
      getFloorplanOverlayPositionFromClientPoint,
      getPlanPointFromClientPoint,
      handleSketchLineOperationClick,
      isDeleteMode,
      isSketchDimensionActive,
      openSketchDimensionInput,
      setSelection,
      showWallEditFeedback,
      displaySketchDimensions,
      sketchLineById,
      sketchCircleEditOperation,
      sketchLineEditOperation,
      toggleFloorplanSelection,
    ],
  )

  const cleanupAndDeleteSketchCircles = useCallback(
    (circleIds: SketchCircleNode['id'][]) => {
      const cleanupUpdates = buildRemoveSketchCircleConstraintReferencesPlan({
        circlesById: sketchCircleById,
        deletedIds: circleIds,
      })
      const tangentCleanupUpdates = buildRemoveSketchLineTangentReferencesPlan({
        deletedCircleIds: circleIds,
        linesById: sketchLineById,
      })
      const distanceDimensionIds = collectSketchDistanceDimensionIdsReferencingEntities({
        dimensions: displaySketchDimensions,
        deletedCircleIds: circleIds,
      })
      if (cleanupUpdates.length > 0 || tangentCleanupUpdates.length > 0) {
        useScene.getState().updateNodes([
          ...cleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
          ...tangentCleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
        ])
        for (const update of [...cleanupUpdates, ...tangentCleanupUpdates]) {
          useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
        }
      }

      sfxEmitter.emit('sfx:item-delete')
      for (const dimensionId of distanceDimensionIds) {
        deleteNode(dimensionId as AnyNodeId)
      }
      for (const circleId of circleIds) {
        deleteNode(circleId as AnyNodeId)
      }
      setSelection({ selectedIds: [] })
    },
    [deleteNode, displaySketchDimensions, setSelection, sketchCircleById, sketchLineById],
  )

  const handleSketchCircleClick = useCallback(
    (circle: SketchCircleNode, event: ReactMouseEvent<SVGElement>) => {
      if (
        sketchCircleEditOperation === 'trim-extend' ||
        sketchLineEditOperation === 'trim-extend' ||
        sketchLineEditOperation === 'tangent'
      ) {
        event.preventDefault()
        event.stopPropagation()
        handleSketchCircleOperationClick(circle)
        return
      }

      if (isDeleteMode) {
        event.preventDefault()
        event.stopPropagation()
        cleanupAndDeleteSketchCircles([circle.id])
        return
      }

      if (isSketchDimensionActive) {
        openSketchDimensionInput(
          circle,
          getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
        )
        event.preventDefault()
        return
      }

      toggleFloorplanSelection(circle.id, getSelectionModifierKeys(event))
    },
    [
      cleanupAndDeleteSketchCircles,
      getFloorplanOverlayPositionFromClientPoint,
      handleSketchCircleOperationClick,
      isDeleteMode,
      isSketchDimensionActive,
      openSketchDimensionInput,
      sketchCircleEditOperation,
      sketchLineEditOperation,
      toggleFloorplanSelection,
    ],
  )

  const handleSketchLineDimensionClick = useCallback(
    (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (isSketchDimensionActive) {
        openSketchDimensionInput(
          line,
          getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
        )
        return
      }

      toggleFloorplanSelection(line.id, getSelectionModifierKeys(event))
    },
    [
      getFloorplanOverlayPositionFromClientPoint,
      isSketchDimensionActive,
      openSketchDimensionInput,
      toggleFloorplanSelection,
    ],
  )

  const handleSketchLineDimensionDoubleClick = useCallback(
    (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => {
      event.preventDefault()
      event.stopPropagation()
      openSketchDimensionInput(
        line,
        getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
      )
    },
    [getFloorplanOverlayPositionFromClientPoint, openSketchDimensionInput],
  )

  const handleSketchLineAngleDimensionClick = useCallback(
    (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (isSketchDimensionActive) {
        openSketchDimensionInput(
          line,
          getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
          'angle',
        )
        return
      }

      toggleFloorplanSelection(line.id, getSelectionModifierKeys(event))
    },
    [
      getFloorplanOverlayPositionFromClientPoint,
      isSketchDimensionActive,
      openSketchDimensionInput,
      toggleFloorplanSelection,
    ],
  )

  const handleSketchLineAngleDimensionDoubleClick = useCallback(
    (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => {
      event.preventDefault()
      event.stopPropagation()
      openSketchDimensionInput(
        line,
        getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
        'angle',
      )
    },
    [getFloorplanOverlayPositionFromClientPoint, openSketchDimensionInput],
  )

  const handleSketchCircleDimensionClick = useCallback(
    (circle: SketchCircleNode, event: ReactMouseEvent<SVGElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (isSketchDimensionActive) {
        openSketchDimensionInput(
          circle,
          getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
        )
        return
      }

      toggleFloorplanSelection(circle.id, getSelectionModifierKeys(event))
    },
    [
      getFloorplanOverlayPositionFromClientPoint,
      isSketchDimensionActive,
      openSketchDimensionInput,
      toggleFloorplanSelection,
    ],
  )

  const handleSketchCircleDimensionDoubleClick = useCallback(
    (circle: SketchCircleNode, event: ReactMouseEvent<SVGElement>) => {
      event.preventDefault()
      event.stopPropagation()
      openSketchDimensionInput(
        circle,
        getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
      )
    },
    [getFloorplanOverlayPositionFromClientPoint, openSketchDimensionInput],
  )

  const handleSketchLineEndpointDimensionClick = useCallback(
    (line: SketchLineNode, endpoint: 'start' | 'end', event: ReactMouseEvent<SVGCircleElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (!isSketchDimensionActive) {
        toggleFloorplanSelection(line.id, getSelectionModifierKeys(event))
        return
      }

      handleSketchDistanceDimensionReferencePick({
        kind: 'line-endpoint',
        lineId: line.id,
        endpoint,
      })
    },
    [handleSketchDistanceDimensionReferencePick, isSketchDimensionActive, toggleFloorplanSelection],
  )

  const handleSketchLineReferenceDimensionClick = useCallback(
    (line: SketchLineNode, event: ReactMouseEvent<SVGCircleElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (!isSketchDimensionActive) {
        toggleFloorplanSelection(line.id, getSelectionModifierKeys(event))
        return
      }

      handleSketchDistanceDimensionReferencePick({
        kind: 'line',
        lineId: line.id,
      })
    },
    [handleSketchDistanceDimensionReferencePick, isSketchDimensionActive, toggleFloorplanSelection],
  )

  const handleSketchCircleCenterDimensionClick = useCallback(
    (circle: SketchCircleNode, event: ReactMouseEvent<SVGCircleElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (!isSketchDimensionActive) {
        toggleFloorplanSelection(circle.id, getSelectionModifierKeys(event))
        return
      }

      handleSketchDistanceDimensionReferencePick({
        kind: 'circle-center',
        circleId: circle.id,
      })
    },
    [handleSketchDistanceDimensionReferencePick, isSketchDimensionActive, toggleFloorplanSelection],
  )

  const handleSketchDistanceDimensionClick = useCallback(
    (dimension: SketchDimensionNode, event: ReactMouseEvent<SVGGElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (isDeleteMode) {
        handleSketchDistanceDimensionDelete(dimension.id)
        return
      }

      if (isSketchDimensionActive) {
        openSketchDistanceDimensionInput(
          dimension,
          getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
        )
        return
      }

      toggleFloorplanSelection(dimension.id, getSelectionModifierKeys(event))
    },
    [
      getFloorplanOverlayPositionFromClientPoint,
      handleSketchDistanceDimensionDelete,
      isDeleteMode,
      isSketchDimensionActive,
      openSketchDistanceDimensionInput,
      toggleFloorplanSelection,
    ],
  )

  const handleSketchDistanceDimensionDoubleClick = useCallback(
    (dimension: SketchDimensionNode, event: ReactMouseEvent<SVGGElement>) => {
      event.preventDefault()
      event.stopPropagation()
      openSketchDistanceDimensionInput(
        dimension,
        getFloorplanOverlayPositionFromClientPoint(event.clientX, event.clientY) ?? undefined,
      )
    },
    [getFloorplanOverlayPositionFromClientPoint, openSketchDistanceDimensionInput],
  )

  const handleWallClick = useCallback(
    (wall: WallNode, event: ReactMouseEvent<SVGElement>) => {
      if (wallEditOperation) {
        const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
        if (planPoint && handleWallEditForWallClick(wall, planPoint)) {
          event.stopPropagation()
          event.preventDefault()
          return
        }
      }

      const centerX = (wall.start[0] + wall.end[0]) / 2
      const centerZ = (wall.start[1] + wall.end[1]) / 2
      const halfLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) / 2
      const localY = isOpeningPlacementActive ? floorplanOpeningLocalY : 0

      setSelectedReferenceId(null)
      emitter.emit('wall:click', {
        node: wall,
        position: [centerX, 0, centerZ],
        localPosition: [halfLength, localY, 0],
        stopPropagation: () => event.stopPropagation(),
        nativeEvent: event.nativeEvent as any,
      } as any)
    },
    [
      floorplanOpeningLocalY,
      getPlanPointFromClientPoint,
      handleWallEditForWallClick,
      isOpeningPlacementActive,
      setSelectedReferenceId,
      wallEditOperation,
    ],
  )

  const handleWallDoubleClick = useCallback(
    (wall: WallNode, event: ReactMouseEvent<SVGElement>) => {
      const centerX = (wall.start[0] + wall.end[0]) / 2
      const centerZ = (wall.start[1] + wall.end[1]) / 2
      const halfLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) / 2

      emitter.emit('wall:double-click', {
        node: wall,
        position: [centerX, 0, centerZ],
        localPosition: [halfLength, 0, 0],
        stopPropagation: () => event.stopPropagation(),
        nativeEvent: event.nativeEvent as any,
      } as any)
      emitter.emit('camera-controls:focus', { nodeId: wall.id })
    },
    [],
  )
  const emitFloorplanNodeClick = useCallback(
    (
      nodeId:
        | ItemNode['id']
        | OpeningNode['id']
        | SlabNode['id']
        | CeilingNode['id']
        | FenceNode['id']
        | StairNode['id']
        | ZoneNodeType['id'],
      eventType: 'click' | 'double-click',
      event: ReactMouseEvent<SVGElement>,
    ) => {
      const node = useScene.getState().nodes[nodeId as AnyNodeId]
      if (
        !(
          node &&
          (node.type === 'slab' ||
            node.type === 'ceiling' ||
            node.type === 'fence' ||
            node.type === 'door' ||
            node.type === 'window' ||
            node.type === 'item' ||
            node.type === 'stair' ||
            node.type === 'zone')
        )
      ) {
        return
      }

      setSelectedReferenceId(null)
      emitter.emit(
        `${node.type}:${eventType}` as any,
        {
          localPosition: [0, 0, 0],
          nativeEvent: event.nativeEvent as any,
          node,
          position: [0, 0, 0],
          stopPropagation: () => event.stopPropagation(),
        } as any,
      )
    },
    [setSelectedReferenceId],
  )
  const handleGuideSelect = useCallback(
    (guideId: GuideNode['id']) => {
      setSelectedReferenceId(guideId)
      setSelection({ selectedIds: [], zoneId: null })
    },
    [setSelectedReferenceId, setSelection],
  )
  const closeGuideCalibrationDialog = useCallback(() => {
    setGuideCalibrationDialog(null)
    setGuideCalibrationInput('')
    setGuideCalibrationError(null)
  }, [])
  const handleGuideCalibrationDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeGuideCalibrationDialog()
      }
    },
    [closeGuideCalibrationDialog],
  )
  const handleGuideCalibrationInputChange = useCallback((value: string) => {
    setGuideCalibrationInput(value)
    setGuideCalibrationError(null)
  }, [])
  const handleGuideCalibrationDialogSubmit = useCallback(() => {
    if (!guideCalibrationDialog) {
      return
    }

    const distance = Number.parseFloat(guideCalibrationInput.trim())
    if (!Number.isFinite(distance) || distance <= 0) {
      setGuideCalibrationError(guideCalibrationCopy.invalidDistance)
      return
    }

    updateNode(guideCalibrationDialog.guideId, {
      scale:
        guideCalibrationDialog.guideScale * (distance / guideCalibrationDialog.measuredDistance),
      calibration: {
        kind: 'two-point',
        distance,
        measuredDistance: guideCalibrationDialog.measuredDistance,
        points: guideCalibrationDialog.points,
        unit: 'm',
      },
    })
    clearCalibrationDraft()
    requestLockPrompt(guideCalibrationDialog.guideId)
    closeGuideCalibrationDialog()
  }, [
    clearCalibrationDraft,
    closeGuideCalibrationDialog,
    guideCalibrationCopy.invalidDistance,
    guideCalibrationDialog,
    guideCalibrationInput,
    requestLockPrompt,
    updateNode,
  ])
  const handleGuideCalibrationPoint = useCallback(
    (
      guide: GuideNode,
      dimensions: GuideImageDimensions,
      event: ReactPointerEvent<SVGRectElement>,
    ) => {
      if (event.button !== 0 || calibrationDraft?.guideId !== guide.id) {
        return
      }

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      if (!svgPoint) return

      const localPoint = getGuideLocalPointFromSvgPoint(guide, dimensions, svgPoint)
      if (!localPoint) return

      const currentPoints = calibrationDraft.points
      const nextPoints =
        currentPoints.length === 0
          ? [localPoint]
          : [currentPoints[currentPoints.length - 1]!, localPoint]
      pushCalibrationPoint(guide.id, localPoint)

      if (nextPoints.length < 2) {
        return
      }

      const measuredDistance = Math.hypot(
        nextPoints[1]![0] - nextPoints[0]![0],
        nextPoints[1]![1] - nextPoints[0]![1],
      )
      if (measuredDistance <= 1e-6) {
        return
      }

      setGuideCalibrationDialog({
        guideId: guide.id,
        guideScale: guide.scale,
        measuredDistance,
        points: [nextPoints[0]!, nextPoints[1]!],
      })
      setGuideCalibrationInput(
        guide.calibration?.distance ? guide.calibration.distance.toFixed(2) : '1',
      )
      setGuideCalibrationError(null)
    },
    [calibrationDraft, getSvgPointFromClientPoint, pushCalibrationPoint],
  )
  const handleGuideDetectionRegionStart = useCallback(
    (
      guide: GuideNode,
      dimensions: GuideImageDimensions,
      event: ReactPointerEvent<SVGRectElement>,
    ) => {
      if (
        event.button !== 0 ||
        !canInteractWithGuides ||
        detectionRegionDraftGuideId !== guide.id ||
        !guide.locked
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      if (!svgPoint) {
        return
      }

      const localPoint = getGuideLocalPointFromSvgPoint(guide, dimensions, svgPoint)
      if (!localPoint) {
        return
      }

      guideDetectionRegionInteractionRef.current = {
        pointerId: event.pointerId,
        guideId: guide.id,
        dimensions,
        start: localPoint,
        current: localPoint,
      }
      setGuideDetectionRegionDraft({
        guideId: guide.id,
        start: localPoint,
        end: localPoint,
      })
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'crosshair'
    },
    [canInteractWithGuides, detectionRegionDraftGuideId, getSvgPointFromClientPoint],
  )
  const handleGuideCornerPointerDown = useCallback(
    (
      guide: GuideNode,
      dimensions: GuideImageDimensions,
      corner: GuideCorner,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0 || !canInteractWithGuides || guide.locked) {
        return
      }

      const aspectRatio = dimensions.width / dimensions.height
      if (!(aspectRatio > 0)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      setHoveredGuideCorner(null)
      handleGuideSelect(guide.id)

      const centerSvg = getGuideCenterSvgPoint(guide)
      const rotationSvg = -guide.rotation[1]
      const width = getGuideWidth(guide.scale)
      const height = getGuideHeight(width, aspectRatio)
      const [cornerOffsetX, cornerOffsetY] = getGuideCornerLocalOffset(width, height, corner)
      const shouldRotate = event.ctrlKey || event.metaKey

      guideInteractionRef.current = {
        pointerId: event.pointerId,
        guideId: guide.id,
        corner,
        mode: shouldRotate ? 'rotate' : 'resize',
        aspectRatio,
        centerSvg,
        oppositeCornerSvg: shouldRotate
          ? null
          : getGuideCornerSvgPoint(
              centerSvg,
              width,
              height,
              rotationSvg,
              oppositeGuideCorner[corner],
            ),
        pointerOffsetSvg: [0, 0],
        rotationSvg,
        cornerBaseAngle: Math.atan2(cornerOffsetY, cornerOffsetX),
        scale: guide.scale,
      }

      document.body.style.userSelect = 'none'
      document.body.style.cursor = shouldRotate
        ? getGuideRotateCursor(theme === 'dark')
        : getGuideResizeCursor(corner, rotationSvg)

      const nextDraft: GuideTransformDraft = {
        guideId: guide.id,
        position: [guide.position[0], guide.position[2]],
        scale: guide.scale,
        rotation: guide.rotation[1],
      }

      guideTransformDraftRef.current = nextDraft
      setGuideTransformDraft(nextDraft)
    },
    [canInteractWithGuides, handleGuideSelect, theme],
  )
  const handleGuideTranslateStart = useCallback(
    (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => {
      if (
        event.button !== 0 ||
        !canInteractWithGuides ||
        selectedGuideId !== guide.id ||
        guide.locked
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      if (!svgPoint) {
        return
      }

      const centerSvg = getGuideCenterSvgPoint(guide)

      guideInteractionRef.current = {
        pointerId: event.pointerId,
        guideId: guide.id,
        corner: 'nw',
        mode: 'translate',
        aspectRatio: 1,
        centerSvg,
        oppositeCornerSvg: null,
        pointerOffsetSvg: subtractSvgPoints(svgPoint, centerSvg),
        rotationSvg: -guide.rotation[1],
        cornerBaseAngle: 0,
        scale: guide.scale,
      }

      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'

      const nextDraft: GuideTransformDraft = {
        guideId: guide.id,
        position: [guide.position[0], guide.position[2]],
        scale: guide.scale,
        rotation: guide.rotation[1],
      }

      guideTransformDraftRef.current = nextDraft
      setGuideTransformDraft(nextDraft)
    },
    [canInteractWithGuides, getSvgPointFromClientPoint, selectedGuideId],
  )

  const handleOpeningSelect = useCallback(
    (openingId: OpeningNode['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(openingId, 'click', event)
    },
    [emitFloorplanNodeClick],
  )
  const handleOpeningPointerDown = useCallback(
    (openingId: OpeningNode['id'], event: ReactPointerEvent<SVGElement>) => {
      if (event.button !== 0) {
        return
      }

      const opening = selectedOpeningEntry?.opening
      if (!opening || opening.id !== openingId) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      // Suppress the click event that follows this pointer interaction so it
      // doesn't re-select or interfere with placement.
      const suppressClick = (clickEvent: MouseEvent) => {
        clickEvent.stopImmediatePropagation()
        clickEvent.preventDefault()
        window.removeEventListener('click', suppressClick, true)
      }
      window.addEventListener('click', suppressClick, true)
      requestAnimationFrame(() => {
        window.removeEventListener('click', suppressClick, true)
      })

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(opening)
      setSelection({ selectedIds: [] })
    },
    [selectedOpeningEntry, setMovingNode, setSelection],
  )
  const handleSlabSelect = useCallback(
    (slabId: SlabNode['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(slabId, 'click', event)
    },
    [emitFloorplanNodeClick],
  )
  const handleCeilingSelect = useCallback(
    (ceilingId: CeilingNode['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(ceilingId, 'click', event)
    },
    [emitFloorplanNodeClick],
  )
  const handleFenceSelect = useCallback(
    (fenceId: FenceNode['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(fenceId, 'click', event)
    },
    [emitFloorplanNodeClick],
  )
  const handleZoneSelect = useCallback(
    (zoneId: ZoneNodeType['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(zoneId, 'click', event)
    },
    [emitFloorplanNodeClick],
  )
  const handleItemSelect = useCallback(
    (itemId: ItemNode['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(itemId, 'click', event)
    },
    [emitFloorplanNodeClick],
  )
  const handleStairSelect = useCallback(
    (stairId: StairNode['id'], event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(stairId, 'click', event)
    },
    [emitFloorplanNodeClick],
  )
  const handleZoneLabelClick = useCallback(
    (zoneId: ZoneNodeType['id'], _event: ReactMouseEvent<SVGElement>) => {
      const currentZoneId = useViewer.getState().selection.zoneId
      if (currentZoneId === zoneId) {
        // Already selected → enter text editing (second click)
        emitter.emit('zone:edit-label' as any, { zoneId })
        return
      }
      // Not selected → select zone + switch to zone mode
      useEditor.getState().setPhase('structure')
      useEditor.getState().setStructureLayer('zones')
      useEditor.getState().setMode('select')
      setSelection({ zoneId })
    },
    [setSelection],
  )
  const handleSlabDoubleClick = useCallback((slab: SlabNode) => {
    emitter.emit('camera-controls:focus', { nodeId: slab.id })
  }, [])
  const handleCeilingDoubleClick = useCallback((ceiling: CeilingNode) => {
    emitter.emit('camera-controls:focus', { nodeId: ceiling.id })
  }, [])
  const handleFenceDoubleClick = useCallback((fence: FenceNode) => {
    emitter.emit('camera-controls:focus', { nodeId: fence.id })
  }, [])
  const handleOpeningDoubleClick = useCallback((opening: OpeningNode) => {
    emitter.emit('camera-controls:focus', { nodeId: opening.id })
  }, [])
  const handleItemDoubleClick = useCallback(
    (item: ItemNode, event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(item.id, 'double-click', event)
      emitter.emit('camera-controls:focus', { nodeId: item.id })
    },
    [emitFloorplanNodeClick],
  )
  const handleItemPointerDown = useCallback(
    (itemId: ItemNode['id'], event: ReactPointerEvent<SVGElement>) => {
      if (event.button !== 0) {
        return
      }

      const item = selectedItemEntry?.item
      if (!item || item.id !== itemId) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      // Suppress the click event that follows this pointer interaction so it
      // doesn't re-select or interfere with placement.
      const suppressClick = (clickEvent: MouseEvent) => {
        clickEvent.stopImmediatePropagation()
        clickEvent.preventDefault()
        window.removeEventListener('click', suppressClick, true)
      }
      window.addEventListener('click', suppressClick, true)
      requestAnimationFrame(() => {
        window.removeEventListener('click', suppressClick, true)
      })

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(item)
      setSelection({ selectedIds: [] })
    },
    [selectedItemEntry, setMovingNode, setSelection],
  )
  const handleSelectedItemMove = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const item = selectedItemEntry?.item
      if (!item) {
        return
      }

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(item)
      setSelection({ selectedIds: [] })
    },
    [selectedItemEntry, setMovingNode, setSelection],
  )
  const duplicateSelectedItem = useCallback(() => {
    const item = selectedItemEntry?.item
    if (!item) {
      return
    }

    sfxEmitter.emit('sfx:item-pick')

    const cloned = structuredClone(item) as Record<string, unknown>
    delete cloned.id
    cloned.metadata = {
      ...(typeof cloned.metadata === 'object' && cloned.metadata !== null ? cloned.metadata : {}),
      isNew: true,
    }
    cloned.children = []

    try {
      const duplicate = ItemNodeSchema.parse(cloned)
      setMovingNode(duplicate)
      setSelection({ selectedIds: [] })
    } catch (error) {
      console.error('Failed to duplicate item', error)
    }
  }, [selectedItemEntry, setMovingNode, setSelection])
  const handleSelectedItemDuplicate = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      duplicateSelectedItem()
    },
    [duplicateSelectedItem],
  )
  const handleSelectedItemDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const item = selectedItemEntry?.item
      if (!item) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      deleteNode(item.id as AnyNodeId)
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedItemEntry, setSelection],
  )
  const handleSelectedWallMove = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const wall = selectedWallEntry?.wall
      if (!wall) {
        return
      }

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(wall)
      setSelection({ selectedIds: [] })
    },
    [selectedWallEntry, setMovingNode, setSelection],
  )
  const handleSelectedWallDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const wall = selectedWallEntry?.wall
      if (!wall) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      deleteNode(wall.id as AnyNodeId)
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedWallEntry, setSelection],
  )
  const handleSelectedSlabMove = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const slab = selectedSlabEntry?.slab
      if (!slab) {
        return
      }

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(slab)
      setSelection({ selectedIds: [] })
    },
    [selectedSlabEntry, setMovingNode, setSelection],
  )
  const handleSelectedSlabDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const slab = selectedSlabEntry?.slab
      if (!slab) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      deleteNode(slab.id as AnyNodeId)
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedSlabEntry, setSelection],
  )
  const handleSelectedCeilingMove = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const ceiling = selectedCeilingEntry?.ceiling
      if (!ceiling) {
        return
      }

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(ceiling)
      setSelection({ selectedIds: [] })
    },
    [selectedCeilingEntry, setMovingNode, setSelection],
  )
  const handleSelectedCeilingDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const ceiling = selectedCeilingEntry?.ceiling
      if (!ceiling) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      deleteNode(ceiling.id as AnyNodeId)
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedCeilingEntry, setSelection],
  )
  const handleSelectedFenceMove = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const fence = selectedFenceEntry?.fence
      if (!fence) {
        return
      }

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(fence)
      setSelection({ selectedIds: [] })
    },
    [selectedFenceEntry, setMovingNode, setSelection],
  )
  const handleSelectedFenceDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const fence = selectedFenceEntry?.fence
      if (!fence) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      deleteNode(fence.id as AnyNodeId)
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedFenceEntry, setSelection],
  )
  const handleStairDoubleClick = useCallback(
    (stair: StairNode, event: ReactMouseEvent<SVGElement>) => {
      emitFloorplanNodeClick(stair.id, 'double-click', event)
      emitter.emit('camera-controls:focus', { nodeId: stair.id })
    },
    [emitFloorplanNodeClick],
  )
  const handleSelectedOpeningMove = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const opening = selectedOpeningEntry?.opening
      if (!opening) {
        return
      }

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(opening)
      setSelection({ selectedIds: [] })
    },
    [selectedOpeningEntry, setMovingNode, setSelection],
  )
  const duplicateSelectedOpening = useCallback(() => {
    const opening = selectedOpeningEntry?.opening
    if (!opening?.parentId) {
      return
    }

    sfxEmitter.emit('sfx:item-pick')
    useScene.temporal.getState().pause()

    const cloned = structuredClone(opening) as Record<string, unknown>
    delete cloned.id
    cloned.metadata = {
      ...(typeof cloned.metadata === 'object' && cloned.metadata !== null ? cloned.metadata : {}),
      isNew: true,
    }

    const duplicate = opening.type === 'door' ? DoorNode.parse(cloned) : WindowNode.parse(cloned)

    useScene.getState().createNode(duplicate, opening.parentId as AnyNodeId)
    setMovingNode(duplicate)
    setSelection({ selectedIds: [] })
  }, [selectedOpeningEntry, setMovingNode, setSelection])
  const handleSelectedOpeningDuplicate = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      duplicateSelectedOpening()
    },
    [duplicateSelectedOpening],
  )
  const handleSelectedOpeningDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const opening = selectedOpeningEntry?.opening
      if (!opening) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      deleteNode(opening.id as AnyNodeId)
      if (opening.parentId) {
        useScene.getState().dirtyNodes.add(opening.parentId as AnyNodeId)
      }
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedOpeningEntry, setSelection],
  )
  const handleSelectedStairMove = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const stair = selectedStairEntry?.stair
      if (!stair) {
        return
      }

      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(stair)
      setSelection({ selectedIds: [] })
    },
    [selectedStairEntry, setMovingNode, setSelection],
  )
  const duplicateSelectedStair = useCallback(() => {
    const stair = selectedStairEntry?.stair
    if (!stair?.parentId) {
      return
    }

    sfxEmitter.emit('sfx:item-pick')
    useScene.temporal.getState().pause()

    const cloned = structuredClone(stair) as Record<string, unknown>
    delete cloned.id
    cloned.metadata = {
      ...(typeof cloned.metadata === 'object' && cloned.metadata !== null ? cloned.metadata : {}),
    }
    delete (cloned.metadata as Record<string, unknown>).isNew

    const nextPosition =
      Array.isArray(cloned.position) && cloned.position.length >= 3
        ? [
            Number(cloned.position[0]) + 1,
            Number(cloned.position[1]),
            Number(cloned.position[2]) + 1,
          ]
        : [stair.position[0] + 1, stair.position[1], stair.position[2] + 1]

    cloned.position = nextPosition

    try {
      const duplicate = StairNodeSchema.parse(cloned)
      const nodesState = useScene.getState().nodes
      const createOps: { node: AnyNode; parentId?: AnyNodeId }[] = [
        { node: duplicate, parentId: stair.parentId as AnyNodeId },
      ]

      for (const childId of stair.children ?? []) {
        const childNode = nodesState[childId]
        if (childNode?.type !== 'stair-segment') {
          continue
        }

        const childClone = structuredClone(childNode) as Record<string, unknown>
        delete childClone.id
        childClone.metadata = {
          ...(typeof childClone.metadata === 'object' && childClone.metadata !== null
            ? childClone.metadata
            : {}),
        }
        delete (childClone.metadata as Record<string, unknown>).isNew

        const childDuplicate = StairSegmentNodeSchema.parse(childClone)
        createOps.push({ node: childDuplicate, parentId: duplicate.id as AnyNodeId })
      }

      useScene.getState().createNodes(createOps)

      setSelection({ selectedIds: [duplicate.id as AnyNodeId] })
    } catch (error) {
      console.error('Failed to duplicate stair', error)
    }
  }, [selectedStairEntry, setSelection])
  const handleSelectedStairDuplicate = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      duplicateSelectedStair()
    },
    [duplicateSelectedStair],
  )
  const handleSelectedStairDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()

      const stair = selectedStairEntry?.stair
      if (!stair) {
        return
      }

      sfxEmitter.emit('sfx:item-delete')
      deleteNode(stair.id as AnyNodeId)
      if (stair.parentId) {
        useScene.getState().dirtyNodes.add(stair.parentId as AnyNodeId)
      }
      setSelection({ selectedIds: [] })
    },
    [deleteNode, selectedStairEntry, setSelection],
  )

  const handleWallEndpointPointerDown = useCallback(
    (wall: WallNode, endpoint: WallEndpoint, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredEndpointId(null)

      const movingPoint = endpoint === 'start' ? wall.start : wall.end

      if (isWallBuildActive) {
        handleWallPlacementPoint(movingPoint)
        return
      }

      if (mode !== 'select') {
        return
      }

      clearWallPlacementDraft()
      handleWallSelect(wall)

      const fixedPoint = endpoint === 'start' ? wall.end : wall.start

      wallEndpointDragRef.current = {
        pointerId: event.pointerId,
        wallId: wall.id,
        endpoint,
        fixedPoint,
        currentPoint: movingPoint,
      }

      setWallEndpointDraft(buildWallEndpointDraft(wall.id, endpoint, fixedPoint, movingPoint))
      setCursorPoint(movingPoint)
    },
    [clearWallPlacementDraft, handleWallPlacementPoint, handleWallSelect, isWallBuildActive, mode],
  )
  const handleWallCurvePointerDown = useCallback(
    (wall: WallNode, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredWallCurveHandleId(null)

      if (isWallBuildActive || mode !== 'select') {
        return
      }

      clearWallPlacementDraft()
      handleWallSelect(wall)
      clearWallEndpointDrag()

      const currentCurveOffset = normalizeWallCurveOffset(wall, wall.curveOffset ?? 0)
      wallCurveDragRef.current = {
        pointerId: event.pointerId,
        wallId: wall.id,
        currentCurveOffset,
      }
      setWallCurveDraft({
        wallId: wall.id,
        curveOffset: currentCurveOffset,
      })
      const center = getWallMidpointHandlePoint(wall)
      setCursorPoint([center.x, center.y])
    },
    [clearWallEndpointDrag, clearWallPlacementDraft, handleWallSelect, isWallBuildActive, mode],
  )
  const handleSlabVertexPointerDown = useCallback(
    (slabId: SlabNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSlabHandleId(null)

      const slabEntry = displaySlabPolygons.find(({ slab }) => slab.id === slabId)
      const vertexPoint = slabEntry?.polygon[vertexIndex]
      if (!(slabEntry && vertexPoint)) {
        return
      }

      setSlabBoundaryDraft({
        slabId,
        polygon: slabEntry.polygon.map(toWallPlanPoint),
      })
      setSlabVertexDragState({
        pointerId: event.pointerId,
        slabId,
        vertexIndex,
      })
      setCursorPoint(toWallPlanPoint(vertexPoint))
    },
    [displaySlabPolygons],
  )
  const handleSlabVertexDoubleClick = useCallback(
    (slabId: SlabNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const slab = slabById.get(slabId)
      if (!(slab && slab.polygon.length > 3)) {
        return
      }

      slabBoundaryDraftRef.current = null
      clearSlabBoundaryInteraction()

      updateNode(slabId, {
        polygon: slab.polygon.filter((_, index) => index !== vertexIndex),
      })
    },
    [clearSlabBoundaryInteraction, slabById, updateNode],
  )
  const handleSlabMidpointPointerDown = useCallback(
    (slabId: SlabNode['id'], edgeIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSlabHandleId(null)

      const slabEntry = displaySlabPolygons.find(({ slab }) => slab.id === slabId)
      if (!slabEntry) {
        return
      }

      const basePolygon = slabEntry.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
      ]
      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setSlabBoundaryDraft({
        slabId,
        polygon: nextPolygon,
      })
      setSlabVertexDragState({
        pointerId: event.pointerId,
        slabId,
        vertexIndex: insertIndex,
      })
      setCursorPoint(insertedPoint)
    },
    [displaySlabPolygons],
  )
  const handleCeilingVertexPointerDown = useCallback(
    (
      ceilingId: CeilingNode['id'],
      vertexIndex: number,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredCeilingHandleId(null)

      const ceilingEntry = displayCeilingPolygons.find(({ ceiling }) => ceiling.id === ceilingId)
      const vertexPoint = ceilingEntry?.polygon[vertexIndex]
      if (!(ceilingEntry && vertexPoint)) {
        return
      }

      setCeilingBoundaryDraft({
        ceilingId,
        holes: ceilingEntry.holes.map((hole) => hole.map(toWallPlanPoint)),
        polygon: ceilingEntry.polygon.map(toWallPlanPoint),
      })
      setCeilingVertexDragState({
        pointerId: event.pointerId,
        ceilingId,
        vertexIndex,
      })
      setCursorPoint(toWallPlanPoint(vertexPoint))
    },
    [displayCeilingPolygons],
  )
  const handleCeilingVertexDoubleClick = useCallback(
    (
      ceilingId: CeilingNode['id'],
      vertexIndex: number,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const ceiling = ceilingById.get(ceilingId)
      if (!(ceiling && ceiling.polygon.length > 3)) {
        return
      }

      ceilingBoundaryDraftRef.current = null
      clearCeilingBoundaryInteraction()

      updateNode(ceilingId, {
        polygon: ceiling.polygon.filter((_, index) => index !== vertexIndex),
      })
    },
    [ceilingById, clearCeilingBoundaryInteraction, updateNode],
  )
  const handleCeilingMidpointPointerDown = useCallback(
    (
      ceilingId: CeilingNode['id'],
      edgeIndex: number,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredCeilingHandleId(null)

      const ceilingEntry = displayCeilingPolygons.find(({ ceiling }) => ceiling.id === ceilingId)
      if (!ceilingEntry) {
        return
      }

      const basePolygon = ceilingEntry.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
      ]
      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setCeilingBoundaryDraft({
        ceilingId,
        holes: ceilingEntry.holes.map((hole) => hole.map(toWallPlanPoint)),
        polygon: nextPolygon,
      })
      setCeilingVertexDragState({
        pointerId: event.pointerId,
        ceilingId,
        vertexIndex: insertIndex,
      })
      setCursorPoint(insertedPoint)
    },
    [displayCeilingPolygons],
  )
  const handleSiteVertexPointerDown = useCallback(
    (siteId: SiteNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSiteHandleId(null)

      if (!(displaySitePolygon && displaySitePolygon.site.id === siteId)) {
        return
      }

      const vertexPoint = displaySitePolygon.polygon[vertexIndex]
      if (!vertexPoint) {
        return
      }

      setSiteBoundaryDraft({
        siteId,
        polygon: displaySitePolygon.polygon.map(toWallPlanPoint),
      })
      setSiteVertexDragState({
        pointerId: event.pointerId,
        siteId,
        vertexIndex,
      })
      setCursorPoint(toWallPlanPoint(vertexPoint))
    },
    [displaySitePolygon],
  )
  const handleSiteVertexDoubleClick = useCallback(
    (siteId: SiteNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (!(site && site.id === siteId && (site.polygon?.points?.length ?? 0) > 3)) {
        return
      }

      siteBoundaryDraftRef.current = null
      clearSiteBoundaryInteraction()

      updateNode(siteId, {
        polygon: {
          type: 'polygon',
          points: site.polygon.points.filter((_, index) => index !== vertexIndex),
        },
      })
    },
    [clearSiteBoundaryInteraction, site, updateNode],
  )
  const handleSiteMidpointPointerDown = useCallback(
    (siteId: SiteNode['id'], edgeIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSiteHandleId(null)

      if (!(displaySitePolygon && displaySitePolygon.site.id === siteId)) {
        return
      }

      const basePolygon = displaySitePolygon.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
      ]
      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setSiteBoundaryDraft({
        siteId,
        polygon: nextPolygon,
      })
      setSiteVertexDragState({
        pointerId: event.pointerId,
        siteId,
        vertexIndex: insertIndex,
      })
      setCursorPoint(insertedPoint)
    },
    [displaySitePolygon],
  )
  const handleZoneVertexPointerDown = useCallback(
    (
      zoneId: ZoneNodeType['id'],
      vertexIndex: number,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredZoneHandleId(null)

      const zoneEntry = displayZonePolygons.find(({ zone }) => zone.id === zoneId)
      const vertexPoint = zoneEntry?.polygon[vertexIndex]
      if (!(zoneEntry && vertexPoint)) {
        return
      }

      setZoneBoundaryDraft({
        zoneId,
        polygon: zoneEntry.polygon.map(toWallPlanPoint),
      })
      setZoneVertexDragState({
        pointerId: event.pointerId,
        zoneId,
        vertexIndex,
      })
      setCursorPoint(toWallPlanPoint(vertexPoint))
    },
    [displayZonePolygons],
  )
  const handleZoneVertexDoubleClick = useCallback(
    (
      zoneId: ZoneNodeType['id'],
      vertexIndex: number,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const zone = zoneById.get(zoneId)
      if (!(zone && zone.polygon.length > 3)) {
        return
      }

      zoneBoundaryDraftRef.current = null
      clearZoneBoundaryInteraction()

      updateNode(zoneId, {
        polygon: zone.polygon.filter((_, index) => index !== vertexIndex),
      })
    },
    [clearZoneBoundaryInteraction, updateNode, zoneById],
  )
  const handleZoneMidpointPointerDown = useCallback(
    (zoneId: ZoneNodeType['id'], edgeIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredZoneHandleId(null)

      const zoneEntry = displayZonePolygons.find(({ zone }) => zone.id === zoneId)
      if (!zoneEntry) {
        return
      }

      const basePolygon = zoneEntry.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
      ]
      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setZoneBoundaryDraft({
        zoneId,
        polygon: nextPolygon,
      })
      setZoneVertexDragState({
        pointerId: event.pointerId,
        zoneId,
        vertexIndex: insertIndex,
      })
      setCursorPoint(insertedPoint)
    },
    [displayZonePolygons],
  )

  const handlePointerLeave = useCallback(() => {
    if (
      !(
        panStateRef.current ||
        wallEndpointDragRef.current ||
        sketchLineEditDraft ||
        siteVertexDragState ||
        slabVertexDragState ||
        zoneVertexDragState
      )
    ) {
      setCursorPoint(null)
    }
    handleOpeningHoverChange(null)
    handleItemHoverChange(null)
    handleWallHoverChange(null)
    handleSketchLineHoverChange(null)
    handleSlabHoverChange(null)
    handleCeilingHoverChange(null)
    handleFenceHoverChange(null)
    handleStairHoverChange(null)
    handleZoneHoverChange(null)
    setHoveredEndpointId(null)
    setHoveredSiteHandleId(null)
    setHoveredSlabHandleId(null)
    setHoveredZoneHandleId(null)
    if (hoveredWallIdRef.current) {
      emitFloorplanWallLeave(hoveredWallIdRef.current)
      hoveredWallIdRef.current = null
    }
  }, [
    emitFloorplanWallLeave,
    handleItemHoverChange,
    handleCeilingHoverChange,
    handleFenceHoverChange,
    handleOpeningHoverChange,
    handleSlabHoverChange,
    handleSketchLineHoverChange,
    handleStairHoverChange,
    handleWallHoverChange,
    handleZoneHoverChange,
    sketchLineEditDraft,
    siteVertexDragState,
    slabVertexDragState,
    zoneVertexDragState,
  ])

  // Lightweight flag that mirrors the conditions under which
  // FloorplanCursorIndicatorOverlay renders — used to gate cursor-position
  // tracking. Derived locally here (rather than duplicating the overlay's full
  // useMemos) so this handler doesn't need to know about catalogCategory.
  const hasFloorplanCursorIndicator =
    Boolean(movingOpeningType) ||
    (mode === 'build' && tool !== null) ||
    (mode === 'select' && floorplanSelectionTool === 'marquee' && structureLayer !== 'zones') ||
    mode === 'delete'

  const handleSvgPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (
        hasFloorplanCursorIndicator &&
        !panStateRef.current &&
        !guideInteractionRef.current &&
        !wallEndpointDragRef.current &&
        !sketchLineEditDraft &&
        !siteVertexDragState &&
        !slabVertexDragState &&
        !zoneVertexDragState
      ) {
        const rect = event.currentTarget.getBoundingClientRect()
        const nextPosition = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }
        setFloorplanCursorPosition((currentPosition) =>
          currentPosition &&
          currentPosition.x === nextPosition.x &&
          currentPosition.y === nextPosition.y
            ? currentPosition
            : nextPosition,
        )
      } else {
        setFloorplanCursorPosition((currentPosition) =>
          currentPosition === null ? currentPosition : null,
        )
      }

      handlePointerMove(event)
    },
    [
      handlePointerMove,
      hasFloorplanCursorIndicator,
      sketchLineEditDraft,
      siteVertexDragState,
      slabVertexDragState,
      zoneVertexDragState,
    ],
  )

  const handleSvgPointerLeave = useCallback(() => {
    setFloorplanCursorPosition(null)
    setHoveredGuideCorner(null)
    handlePointerLeave()
  }, [handlePointerLeave])

  const handleMarqueePointerDown = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      if (event.button !== 0) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }
      const snappedPoint = getSnappedFloorplanPoint(planPoint)

      event.preventDefault()
      event.stopPropagation()
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect) {
        setFloorplanCursorPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      }
      setCursorPoint(snappedPoint)
      handleItemHoverChange(null)
      handleOpeningHoverChange(null)
      handleWallHoverChange(null)
      handleSketchLineHoverChange(null)
      handleSlabHoverChange(null)
      handleStairHoverChange(null)
      handleZoneHoverChange(null)
      setHoveredEndpointId(null)
      floorplanMarqueeSnapPointRef.current = snappedPoint
      syncPreviewSelectedIds([])
      setFloorplanMarqueeState({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPlanPoint: snappedPoint,
        currentPlanPoint: snappedPoint,
      })

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [
      getPlanPointFromClientPoint,
      handleItemHoverChange,
      handleOpeningHoverChange,
      handleSlabHoverChange,
      handleSketchLineHoverChange,
      handleStairHoverChange,
      handleWallHoverChange,
      handleZoneHoverChange,
      syncPreviewSelectedIds,
    ],
  )

  const handleMarqueePointerMove = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect) {
        setFloorplanCursorPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      }

      if (floorplanMarqueeState?.pointerId !== event.pointerId) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }
      const snappedPoint = getSnappedFloorplanPoint(planPoint)

      event.preventDefault()
      event.stopPropagation()
      setCursorPoint(snappedPoint)

      const dragDistance = Math.hypot(
        event.clientX - floorplanMarqueeState.startClientX,
        event.clientY - floorplanMarqueeState.startClientY,
      )

      if (
        dragDistance >= FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX &&
        floorplanMarqueeSnapPointRef.current &&
        !pointsEqual(floorplanMarqueeSnapPointRef.current, snappedPoint)
      ) {
        sfxEmitter.emit('sfx:grid-snap')
      }
      floorplanMarqueeSnapPointRef.current = snappedPoint

      if (dragDistance >= FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX) {
        const bounds = getFloorplanSelectionBounds(
          floorplanMarqueeState.startPlanPoint,
          snappedPoint,
        )
        syncPreviewSelectedIds(getFloorplanSelectionIdsInBounds(bounds))
      } else {
        syncPreviewSelectedIds([])
      }

      setFloorplanMarqueeState((currentState) => {
        if (!currentState || currentState.pointerId !== event.pointerId) {
          return currentState
        }

        return {
          ...currentState,
          currentPlanPoint: snappedPoint,
        }
      })
    },
    [
      floorplanMarqueeState,
      getFloorplanSelectionIdsInBounds,
      getPlanPointFromClientPoint,
      syncPreviewSelectedIds,
    ],
  )

  const handleMarqueePointerUp = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      const marqueeState = floorplanMarqueeState
      if (!marqueeState || marqueeState.pointerId !== event.pointerId) {
        return
      }

      const rawEndPlanPoint =
        getPlanPointFromClientPoint(event.clientX, event.clientY) ?? marqueeState.currentPlanPoint
      const endPlanPoint = getSnappedFloorplanPoint(rawEndPlanPoint)
      const modifierKeys = getSelectionModifierKeys(event)
      const dragDistance = Math.hypot(
        event.clientX - marqueeState.startClientX,
        event.clientY - marqueeState.startClientY,
      )

      event.preventDefault()
      event.stopPropagation()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      if (dragDistance >= FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX) {
        const bounds = getFloorplanSelectionBounds(marqueeState.startPlanPoint, endPlanPoint)
        const nextSelectedIds = getFloorplanSelectionIdsInBounds(bounds)
        addFloorplanSelection(nextSelectedIds, modifierKeys)
      } else {
        const hitId = getFloorplanHitIdAtPoint(rawEndPlanPoint)

        if (hitId) {
          toggleFloorplanSelection(hitId, modifierKeys)
        } else if (!(modifierKeys.meta || modifierKeys.ctrl)) {
          commitFloorplanSelection([])
        }
      }

      syncPreviewSelectedIds([])
      setFloorplanMarqueeState(null)
      floorplanMarqueeSnapPointRef.current = null
    },
    [
      addFloorplanSelection,
      commitFloorplanSelection,
      floorplanMarqueeState,
      getFloorplanHitIdAtPoint,
      getFloorplanSelectionIdsInBounds,
      getPlanPointFromClientPoint,
      syncPreviewSelectedIds,
      toggleFloorplanSelection,
    ],
  )

  const handleMarqueePointerCancel = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      if (floorplanMarqueeState?.pointerId !== event.pointerId) {
        return
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      setFloorplanMarqueeState(null)
      setFloorplanCursorPosition(null)
      floorplanMarqueeSnapPointRef.current = null
      syncPreviewSelectedIds([])
      setCursorPoint(null)
    },
    [floorplanMarqueeState?.pointerId, syncPreviewSelectedIds],
  )

  useEffect(() => {
    if (!isMarqueeSelectionToolActive) {
      setFloorplanMarqueeState(null)
      floorplanMarqueeSnapPointRef.current = null
      syncPreviewSelectedIds([])
      if (mode === 'select') {
        setCursorPoint(null)
      }
      return
    }

    setFloorplanCursorPosition(null)
    handleOpeningHoverChange(null)
    handleWallHoverChange(null)
    handleSketchLineHoverChange(null)
    handleSlabHoverChange(null)
    handleCeilingHoverChange(null)
    handleFenceHoverChange(null)
    handleZoneHoverChange(null)
    setHoveredEndpointId(null)
  }, [
    handleCeilingHoverChange,
    handleFenceHoverChange,
    handleOpeningHoverChange,
    handleSlabHoverChange,
    handleSketchLineHoverChange,
    handleWallHoverChange,
    handleZoneHoverChange,
    isMarqueeSelectionToolActive,
    mode,
    syncPreviewSelectedIds,
  ])

  useEffect(() => {
    if (mode !== 'delete') {
      useViewer.getState().setHoveredId(null)
    }
  }, [mode])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    const getFallbackClientPoint = () => {
      const rect = svg.getBoundingClientRect()
      return {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const widthFactor = Math.exp(event.deltaY * (event.ctrlKey ? 0.003 : 0.0015))
      zoomViewportAtClientPoint(event.clientX, event.clientY, widthFactor)
    }

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as GestureLikeEvent
      gestureScaleRef.current = gestureEvent.scale ?? 1
      event.preventDefault()
      event.stopPropagation()
    }

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as GestureLikeEvent
      const nextScale = gestureEvent.scale ?? 1
      const previousScale = gestureScaleRef.current || 1
      const widthFactor = previousScale / nextScale
      const fallbackClientPoint = getFallbackClientPoint()

      zoomViewportAtClientPoint(
        gestureEvent.clientX ?? fallbackClientPoint.clientX,
        gestureEvent.clientY ?? fallbackClientPoint.clientY,
        widthFactor,
      )

      gestureScaleRef.current = nextScale
      event.preventDefault()
      event.stopPropagation()
    }

    const handleGestureEnd = (event: Event) => {
      gestureScaleRef.current = 1
      event.preventDefault()
      event.stopPropagation()
    }

    svg.addEventListener('wheel', handleNativeWheel, { passive: false })
    svg.addEventListener('gesturestart', handleGestureStart, {
      passive: false,
    })
    svg.addEventListener('gesturechange', handleGestureChange, {
      passive: false,
    })
    svg.addEventListener('gestureend', handleGestureEnd, { passive: false })

    return () => {
      svg.removeEventListener('wheel', handleNativeWheel)
      svg.removeEventListener('gesturestart', handleGestureStart)
      svg.removeEventListener('gesturechange', handleGestureChange)
      svg.removeEventListener('gestureend', handleGestureEnd)
    }
  }, [zoomViewportAtClientPoint])

  const restoreGroundLevelStructureSelection = useCallback(() => {
    const sceneNodes = useScene.getState().nodes
    const nextBuildingId =
      currentBuildingId ??
      site?.children
        .map((child) => (typeof child === 'string' ? sceneNodes[child as AnyNodeId] : child))
        .find((node): node is BuildingNode => node?.type === 'building')?.id ??
      null

    const nextGroundLevelId =
      nextBuildingId && nextBuildingId === currentBuildingId
        ? (floorplanLevels.find((level) => level.level === 0)?.id ??
          floorplanLevels[0]?.id ??
          (levelNode?.type === 'level' ? levelNode.id : null))
        : (() => {
            if (!nextBuildingId) {
              return null
            }

            const buildingNode = sceneNodes[nextBuildingId]
            if (!buildingNode || buildingNode.type !== 'building') {
              return null
            }

            const buildingLevels = buildingNode.children
              .map((child) => (typeof child === 'string' ? sceneNodes[child as AnyNodeId] : child))
              .filter((node): node is LevelNode => node?.type === 'level')
              .sort((a, b) => a.level - b.level)

            return (
              buildingLevels.find((level) => level.level === 0)?.id ?? buildingLevels[0]?.id ?? null
            )
          })()

    setPhase('structure')
    setStructureLayer('elements')
    setMode('select')

    const nextSelection: Parameters<typeof setSelection>[0] = {
      selectedIds: [],
      zoneId: null,
    }

    if (nextBuildingId) {
      nextSelection.buildingId = nextBuildingId
    }

    if (nextGroundLevelId) {
      nextSelection.levelId = nextGroundLevelId
    }

    setSelection(nextSelection)
  }, [
    currentBuildingId,
    floorplanLevels,
    levelNode,
    setMode,
    setPhase,
    setSelection,
    setStructureLayer,
    site,
  ])
  const hasDuplicatableFloorplanSelection = Boolean(
    selectedItemEntry || selectedOpeningEntry || selectedStairEntry,
  )
  const handleDuplicateFloorplanSelection = useCallback(() => {
    if (selectedOpeningEntry) {
      duplicateSelectedOpening()
      return
    }
    if (selectedItemEntry) {
      duplicateSelectedItem()
      return
    }
    if (selectedStairEntry) {
      duplicateSelectedStair()
    }
  }, [
    duplicateSelectedItem,
    duplicateSelectedOpening,
    duplicateSelectedStair,
    selectedItemEntry,
    selectedOpeningEntry,
    selectedStairEntry,
  ])
  const wallActionMenuExtraActions = useMemo<NodeActionMenuExtraAction[]>(() => {
    const actions: NodeActionMenuExtraAction[] = [
      {
        id: 'wall-trim-extend',
        label: 'Trim / Extend',
        icon: <Icon height={16} icon="mdi:vector-line" width={16} />,
        onClick: handleSelectedWallTrimExtend,
        active: wallEditOperation === 'trim-extend',
      },
      {
        id: 'wall-split',
        label: 'Split',
        icon: <Icon height={16} icon="mdi:call-split" width={16} />,
        onClick: handleSelectedWallSplit,
        active: wallEditOperation === 'split',
      },
      {
        id: 'wall-merge',
        label: 'Merge',
        icon: <Icon height={16} icon="mdi:call-merge" width={16} />,
        onClick: handleSelectedWallMerge,
        active: wallEditOperation === 'merge',
      },
      {
        id: 'wall-offset',
        label: 'Offset',
        icon: <Icon height={16} icon="mdi:arrow-expand-horizontal" width={16} />,
        onClick: handleSelectedWallOffset,
        active: wallEditOperation === 'offset',
      },
      {
        id: 'wall-set-length',
        label: 'Set Length',
        icon: <Icon height={16} icon="mdi:ruler-square" width={16} />,
        onClick: handleSelectedWallSetLength,
        active: wallEditOperation === 'set-length',
      },
      {
        id: 'wall-horizontal',
        label: 'Horizontal',
        icon: <Icon height={16} icon="mdi:format-horizontal-align-center" width={16} />,
        onClick: handleSelectedWallHorizontal,
      },
      {
        id: 'wall-vertical',
        label: 'Vertical',
        icon: <Icon height={16} icon="mdi:format-vertical-align-center" width={16} />,
        onClick: handleSelectedWallVertical,
      },
      {
        id: 'wall-equal-length',
        label: 'Equal Length',
        icon: <Icon height={16} icon="mdi:equal" width={16} />,
        onClick: handleSelectedWallsEqualLength,
      },
      {
        id: 'wall-fillet',
        label: 'Fillet',
        icon: <Icon height={16} icon="mdi:vector-radius" width={16} />,
        onClick: handleSelectedWallFillet,
        active: wallEditOperation === 'fillet',
      },
      {
        id: 'wall-mirror',
        label: 'Mirror',
        icon: <Icon height={16} icon="mdi:mirror" width={16} />,
        onClick: handleSelectedWallMirror,
        active: wallEditOperation === 'mirror',
      },
      {
        id: 'wall-linear-pattern',
        label: 'Linear Pattern',
        icon: <Icon height={16} icon="mdi:grid" width={16} />,
        onClick: handleSelectedWallLinearPattern,
        active: wallEditOperation === 'linear-pattern',
      },
      {
        id: 'wall-chamfer',
        label: 'Chamfer',
        icon: <Icon height={16} icon="mdi:vector-polyline-edit" width={16} />,
        onClick: handleSelectedWallChamfer,
        active: wallEditOperation === 'chamfer',
      },
    ]

    if (selectedClosedWallLoop) {
      actions.push(
        {
          id: 'wall-loop-zone',
          label: 'Create Zone',
          icon: <Icon height={16} icon="mdi:shape-square-plus" width={16} />,
          onClick: createZoneFromSelectedWallLoop,
        },
        {
          id: 'wall-loop-slab',
          label: 'Create Slab',
          icon: <Icon height={16} icon="mdi:layers-plus" width={16} />,
          onClick: createSlabFromSelectedWallLoop,
        },
      )
    }

    return actions
  }, [
    createSlabFromSelectedWallLoop,
    createZoneFromSelectedWallLoop,
    handleSelectedWallChamfer,
    handleSelectedWallFillet,
    handleSelectedWallHorizontal,
    handleSelectedWallLinearPattern,
    handleSelectedWallMerge,
    handleSelectedWallMirror,
    handleSelectedWallOffset,
    handleSelectedWallSetLength,
    handleSelectedWallSplit,
    handleSelectedWallTrimExtend,
    handleSelectedWallVertical,
    handleSelectedWallsEqualLength,
    selectedClosedWallLoop,
    wallEditOperation,
  ])
  const activeDraftAnchorPoint =
    draftStart ??
    sketchLineDraft?.start ??
    sketchRectangleDraft?.start ??
    sketchCircleDraft?.center ??
    sketchArcDraft?.center ??
    activePolygonDraftPoints[0] ??
    null
  const floorplanCursorColor =
    mode === 'delete'
      ? palette.deleteStroke
      : wallEndpointDraft || wallEditOperation || sketchLineEditOperation || isSketchDimensionActive
        ? palette.editCursor
        : activeDraftAnchorPoint
          ? palette.draftStroke
          : palette.cursor
  return (
    <div
      className="editor-floorplan-panel pointer-events-auto flex h-full w-full flex-col overflow-hidden"
      onPointerEnter={() => setFloorplanHovered(true)}
      onPointerLeave={() => {
        setFloorplanHovered(false)
        setFloorplanCursorPosition(null)
      }}
      ref={containerRef}
    >
      <FloorplanSiteKeyHandler onRestoreGroundLevel={restoreGroundLevelStructureSelection} />
      <FloorplanDuplicateHotkey
        hasDuplicatable={hasDuplicatableFloorplanSelection}
        onDuplicateSelected={handleDuplicateFloorplanSelection}
      />
      <ContextMenu
        modal={false}
        onOpenChange={(open) => {
          if (!open) {
            setSketchContextMenuTarget(null)
          }
        }}
      >
        <ContextMenuTrigger asChild>
          <div
            className="relative min-h-0 flex-1"
            onContextMenuCapture={handleFloorplanContextMenuCapture}
            ref={viewportHostRef}
          >
            <FloorplanCursorIndicatorOverlay
              cursorAnchorPosition={floorplanCursorAnchorPosition}
              cursorColor={floorplanCursorColor}
              cursorPosition={floorplanCursorPosition}
              floorplanSelectionTool={floorplanSelectionTool}
              isPanning={isPanning}
              movingOpeningType={movingOpeningType}
            />
            <FloorplanGuideCalibrationDialog
              copy={guideCalibrationCopy}
              errorMessage={guideCalibrationError}
              inputValue={guideCalibrationInput}
              onChange={handleGuideCalibrationInputChange}
              onOpenChange={handleGuideCalibrationDialogOpenChange}
              onSubmit={handleGuideCalibrationDialogSubmit}
              open={!!guideCalibrationDialog}
            />
            <FloorplanWallLengthInputOverlay
              input={
                wallLengthInput
                  ? {
                      value: wallLengthInput.value,
                      unitLabel: unit === 'imperial' ? 'ft' : 'm',
                    }
                  : null
              }
              onCancel={() => setWallLengthInput(null)}
              onChange={(value) => setWallLengthInput({ value })}
              onSubmit={handleWallLengthInputSubmit}
              position={floorplanCursorPosition}
            />
            <FloorplanWallLengthInputOverlay
              input={
                wallEditNumericInput
                  ? {
                      label: getNumericInputLabel(wallEditNumericInput.operation),
                      unitLabel:
                        wallEditNumericInput.operation === 'linear-pattern'
                          ? `${unit === 'imperial' ? 'ft' : 'm'}, #`
                          : unit === 'imperial'
                            ? 'ft'
                            : 'm',
                      value: wallEditNumericInput.value,
                    }
                  : null
              }
              onCancel={handleWallEditNumericInputCancel}
              onChange={handleWallEditNumericInputChange}
              onSubmit={handleWallEditNumericInputSubmit}
              position={
                floorplanCursorPosition ??
                selectedWallActionMenuPosition ??
                floorplanCursorAnchorPosition ?? { x: 16, y: 16 }
              }
            />
            <FloorplanWallLengthInputOverlay
              input={
                sketchDimensionInput
                  ? {
                      label:
                        sketchDimensionInput.target.kind === 'line'
                          ? sketchDimensionInput.target.metric === 'angle'
                            ? '智能角度'
                            : '智能尺寸'
                          : sketchDimensionInput.target.kind === 'distance'
                            ? '草图距离'
                            : '智能尺寸',
                      unitLabel:
                        sketchDimensionInput.target.kind === 'line' &&
                        sketchDimensionInput.target.metric === 'angle'
                          ? '°'
                          : unit === 'imperial'
                            ? 'ft'
                            : 'm',
                      value: sketchDimensionInput.value,
                    }
                  : null
              }
              onCancel={handleSketchDimensionInputCancel}
              onChange={handleSketchDimensionInputChange}
              onSubmit={handleSketchDimensionInputSubmit}
              position={
                sketchDimensionInput?.position ??
                floorplanCursorPosition ??
                selectedSketchLineActionMenuPosition ??
                floorplanCursorAnchorPosition ?? { x: 16, y: 16 }
              }
            />
            {wallEditFeedback && (
              <div className="editor-floorplan-feedback pointer-events-none absolute bottom-28 left-1/2 z-30 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md px-3 py-2 text-center font-medium text-foreground text-xs">
                {wallEditFeedback.message}
              </div>
            )}
            {isSketchWorkbenchActive && (
              <FloorplanSketchCommandBar
                activeTool={isSketchStructureTool(tool) ? tool : null}
                activeTab={sketchWorkbenchTab}
                canCommitDraft={canCommitSketchDraft}
                circleSelectionCount={selectedSketchCircleList.length}
                draftKind={activeSketchDraftKind}
                lineSelectionCount={selectedSketchLineList.length}
                onActivateTool={handleActivateSketchToolbarTool}
                onCancelDraft={handleCancelSketchToolbarDraft}
                onChangeTab={setSketchWorkbenchTab}
                onCommitDraft={commitSketchContextDraft}
                onExitSketch={handleExitSketchWorkbench}
                onSelectSketchPlaneRecord={handleSelectSketchPlaneRecord}
                sketchPlane={sketchPlane}
                sketchPlaneRecords={sketchPlaneRecords}
                sketchCircleActions={sketchCircleActionMenuExtraActions}
                sketchLineActions={sketchLineActionMenuExtraActions}
              />
            )}
            {showGuides && canInteractWithGuides && selectedGuide && (
              <FloorplanGuideHandleHint
                anchor={guideHandleHintAnchor}
                isDarkMode={theme === 'dark'}
                isMacPlatform={isMacPlatform}
                rotationModifierPressed={rotationModifierPressed}
              />
            )}
            <FloorplanActionMenuLayer
              ceiling={{
                position: selectedCeilingActionMenuPosition,
                onDelete: handleSelectedCeilingDelete,
                onMove: handleSelectedCeilingMove,
              }}
              offsetY={FLOORPLAN_ACTION_MENU_OFFSET_Y}
              item={{
                position: selectedItemActionMenuPosition,
                onDelete: handleSelectedItemDelete,
                onDuplicate: handleSelectedItemDuplicate,
                onMove: handleSelectedItemMove,
              }}
              opening={{
                position: selectedOpeningActionMenuPosition,
                onDelete: handleSelectedOpeningDelete,
                onDuplicate: handleSelectedOpeningDuplicate,
                onMove: handleSelectedOpeningMove,
              }}
              slab={{
                position: selectedSlabActionMenuPosition,
                onDelete: handleSelectedSlabDelete,
                onMove: handleSelectedSlabMove,
              }}
              sketchCircle={{
                position: isSketchWorkbenchActive ? null : selectedSketchCircleActionMenuPosition,
                onDelete: handleSelectedSketchCircleDelete,
                extraActions: sketchCircleActionMenuExtraActions,
              }}
              sketchLine={{
                position: isSketchWorkbenchActive ? null : selectedSketchLineActionMenuPosition,
                onDelete: handleSelectedSketchLineDelete,
                extraActions: sketchLineActionMenuExtraActions,
              }}
              stair={{
                position: selectedStairActionMenuPosition,
                onDelete: handleSelectedStairDelete,
                onDuplicate: handleSelectedStairDuplicate,
                onMove: handleSelectedStairMove,
              }}
              wall={{
                position: selectedWallActionMenuPosition,
                onDelete: handleSelectedWallDelete,
                extraActions: wallActionMenuExtraActions,
                onMove: handleSelectedWallMove,
              }}
            />

            {!levelNode || levelNode.type !== 'level' ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
                Switch to a building level to view and edit the floorplan.
              </div>
            ) : (
              <svg
                className="h-full w-full touch-none"
                data-editor-floorplan-thumbnail="true"
                onClick={isMarqueeSelectionToolActive ? undefined : handleBackgroundClick}
                onDoubleClick={
                  isMarqueeSelectionToolActive ? undefined : handleBackgroundDoubleClick
                }
                onPointerCancel={endPanning}
                onPointerDown={handlePointerDown}
                onPointerLeave={handleSvgPointerLeave}
                onPointerMove={handleSvgPointerMove}
                onPointerUp={endPanning}
                ref={svgRef}
                style={{ cursor: EDITOR_CURSOR }}
                viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
              >
                <rect
                  fill={palette.surface}
                  height={viewBox.height}
                  width={viewBox.width}
                  x={viewBox.minX}
                  y={viewBox.minY}
                />

                <g
                  transform={
                    !isFeatureFaceSketchActive && buildingRotationDeg !== 0
                      ? `rotate(${buildingRotationDeg})`
                      : undefined
                  }
                >
                  <FloorplanGridLayer
                    majorGridPath={majorGridPath}
                    minorGridPath={minorGridPath}
                    palette={palette}
                    showGrid={showGrid}
                  />

                  {faceSketchOutlinePoints && (
                    <polygon
                      fill={palette.selectedFill}
                      fillOpacity={0.08}
                      points={faceSketchOutlinePoints}
                      pointerEvents="none"
                      stroke={palette.selectedStroke}
                      strokeDasharray="0.18 0.1"
                      strokeLinejoin="round"
                      strokeOpacity={0.75}
                      strokeWidth="0.055"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  <FloorplanGuideLayer
                    activeGuideInteractionGuideId={activeGuideInteractionGuideId}
                    activeGuideInteractionMode={activeGuideInteractionMode}
                    calibrationGuideId={calibrationDraft?.guideId ?? null}
                    detectionRegionGuideId={detectionRegionDraftGuideId}
                    guides={isFeatureSketchActive ? [] : displayGuides}
                    isInteractive={canInteractWithGuides}
                    onGuideCalibrationPoint={handleGuideCalibrationPoint}
                    onGuideDetectionRegionStart={handleGuideDetectionRegionStart}
                    onGuideSelect={handleGuideSelect}
                    onGuideTranslateStart={handleGuideTranslateStart}
                    selectedGuideId={selectedGuideId}
                  />

                  {detectionCandidates ? (
                    <FloorplanGuideDetectionOverlay candidates={detectionCandidates} />
                  ) : null}

                  <FloorplanSiteLayer
                    isEditing={isSiteEditActive}
                    sitePolygon={visibleSitePolygon}
                  />

                  {!isFeatureSketchActive && deliveryOverlays.showPerimeterGuides && (
                    <FloorplanPerimeterGuideLayer
                      guides={deliveryPerimeterGuides}
                      palette={palette}
                    />
                  )}

                  <FloorplanGeometryLayer
                    canFocusGeometry={canSelectElementFloorplanGeometry}
                    canSelectGeometry={canInteractElementFloorplanGeometry}
                    canSelectSlabs={canInteractFloorplanSlabs}
                    highlightedIdSet={highlightedFloorplanIdSet}
                    hoveredOpeningId={hoveredOpeningId}
                    hoveredSlabId={hoveredSlabId}
                    hoveredWallId={hoveredWallId}
                    isDeleteMode={isDeleteMode}
                    onOpeningDoubleClick={handleOpeningDoubleClick}
                    onOpeningHoverChange={handleOpeningHoverChange}
                    onOpeningPointerDown={handleOpeningPointerDown}
                    onOpeningSelect={handleOpeningSelect}
                    onSlabDoubleClick={handleSlabDoubleClick}
                    onSlabHoverChange={handleSlabHoverChange}
                    onSlabSelect={handleSlabSelect}
                    onWallClick={handleWallClick}
                    onWallDoubleClick={handleWallDoubleClick}
                    onWallHoverChange={handleWallHoverChange}
                    openingsPolygons={sketchContextOpeningPolygons}
                    palette={palette}
                    selectedIdSet={selectedIdSet}
                    showWallLengths={deliveryOverlays.showWallLength}
                    slabPolygons={sketchContextSlabPolygons}
                    unit={unit}
                    wallPolygons={sketchContextWallPolygons}
                  />

                  <FloorplanSketchProfileLayer
                    highlightedIdSet={highlightedFloorplanIdSet}
                    palette={palette}
                    profiles={sketchProfiles}
                    selectedProfile={selectedSketchProfile}
                  />

                  <FloorplanSketchLayer
                    activeDimensionAnchor={sketchDistanceDimensionDraft?.start ?? null}
                    alwaysShowSketchRelations={showSketchRelations}
                    canSelectSketchLines={canInteractFloorplanSketchLines}
                    highlightedIdSet={highlightedFloorplanIdSet}
                    hoveredSketchLineId={hoveredSketchLineId}
                    isDeleteMode={isDeleteMode}
                    onSketchLineEndpointDimensionClick={handleSketchLineEndpointDimensionClick}
                    onSketchLineReferenceDimensionClick={handleSketchLineReferenceDimensionClick}
                    onSketchLineAngleDimensionClick={handleSketchLineAngleDimensionClick}
                    onSketchLineAngleDimensionDoubleClick={
                      handleSketchLineAngleDimensionDoubleClick
                    }
                    onSketchLineClick={handleSketchLineClick}
                    onSketchLineDimensionClick={handleSketchLineDimensionClick}
                    onSketchLineDimensionDoubleClick={handleSketchLineDimensionDoubleClick}
                    onSketchLineHoverChange={handleSketchLineHoverChange}
                    palette={palette}
                    selectedIdSet={selectedIdSet}
                    showDimensionAnchors={isSketchDimensionActive}
                    sketchLines={displaySketchLines}
                    unit={unit}
                  />

                  <FloorplanSketchCircleLayer
                    activeDimensionAnchor={sketchDistanceDimensionDraft?.start ?? null}
                    alwaysShowSketchRelations={showSketchRelations}
                    canSelectSketchCircles={canInteractFloorplanSketchCircles}
                    highlightedIdSet={highlightedFloorplanIdSet}
                    hoveredSketchCircleId={hoveredSketchCircleId}
                    isDeleteMode={isDeleteMode}
                    onSketchCircleClick={handleSketchCircleClick}
                    onSketchCircleCenterDimensionClick={handleSketchCircleCenterDimensionClick}
                    onSketchCircleDimensionClick={handleSketchCircleDimensionClick}
                    onSketchCircleDimensionDoubleClick={handleSketchCircleDimensionDoubleClick}
                    onSketchCircleHoverChange={handleSketchCircleHoverChange}
                    palette={palette}
                    selectedIdSet={selectedIdSet}
                    showDimensionAnchors={isSketchDimensionActive}
                    sketchCircles={displaySketchCircles}
                    sketchLines={displaySketchLines}
                    unit={unit}
                  />

                  <FloorplanSketchDistanceDimensionLayer
                    dimensions={displaySketchDimensions}
                    isDeleteMode={isDeleteMode}
                    onSketchDistanceDimensionClick={handleSketchDistanceDimensionClick}
                    onSketchDistanceDimensionDoubleClick={handleSketchDistanceDimensionDoubleClick}
                    palette={palette}
                    selectedIdSet={selectedIdSet}
                    sketchCircles={displaySketchCircles}
                    sketchLines={displaySketchLines}
                    unit={unit}
                  />

                  <FloorplanSketchEditLayer
                    canEditSketchLines={
                      canSelectActiveSketchGeometry && !isSketchDimensionActive && !isDeleteMode
                    }
                    editDraft={sketchLineEditDraft}
                    onSketchLineEditPointerDown={handleSketchLineEditPointerDown}
                    palette={palette}
                    selectedSketchLines={displaySelectedSketchLineList}
                  />

                  <FloorplanZoneLayer
                    canSelectZones={canInteractFloorplanZones}
                    hoveredZoneId={hoveredZoneId}
                    isDeleteMode={isDeleteMode}
                    onZoneHoverChange={handleZoneHoverChange}
                    onZoneSelect={handleZoneSelect}
                    palette={palette}
                    selectedZoneId={selectedZoneId}
                    zonePolygons={sketchContextZonePolygons}
                  />

                  <FloorplanNodeLayer
                    canFocusItems={canFocusFloorplanItems}
                    canFocusStairs={canFocusFloorplanStairs}
                    canSelectItems={canSelectFloorplanItems}
                    canSelectStairs={canSelectFloorplanStairs}
                    highlightedIdSet={highlightedFloorplanIdSet}
                    hoveredItemId={hoveredItemId}
                    hoveredStairId={hoveredStairId}
                    isDeleteMode={isDeleteMode}
                    isFurnishContextActive={isFloorplanFurnishContextActive}
                    itemEntries={sketchContextItemEntries}
                    onItemDoubleClick={handleItemDoubleClick}
                    onItemHoverChange={handleItemHoverChange}
                    onItemHoverEnter={handleFloorplanItemHoverEnter}
                    onItemPointerDown={handleItemPointerDown}
                    onItemSelect={handleItemSelect}
                    onStairDoubleClick={handleStairDoubleClick}
                    onStairHoverChange={handleStairHoverChange}
                    onStairHoverEnter={handleFloorplanStairHoverEnter}
                    onStairSelect={handleStairSelect}
                    palette={palette}
                    selectedIdSet={selectedIdSet}
                    stairEntries={
                      isFeatureSketchActive
                        ? sketchContextStairEntries
                        : renderedFloorplanStairEntries
                    }
                  />

                  {deliveryOverlays.showRoomArea && (
                    <FloorplanZoneAreaLabelLayer
                      unit={unit}
                      zonePolygons={sketchContextZonePolygons}
                    />
                  )}

                  {deliveryOverlays.showRoomName && (
                    <FloorplanZoneLabelLayer
                      onLabelHoverChange={handleZoneHoverChange}
                      onZoneLabelClick={handleZoneLabelClick}
                      selectedZoneId={selectedZoneId}
                      svgRef={svgRef}
                      viewBox={viewBox}
                      zonePolygons={displayZonePolygons}
                    />
                  )}

                  <FloorplanPolygonHandleLayer
                    hoveredHandleId={hoveredSiteHandleId}
                    midpointHandles={siteMidpointHandles}
                    onHandleHoverChange={setHoveredSiteHandleId}
                    onMidpointPointerDown={(nodeId, edgeIndex, event) =>
                      handleSiteMidpointPointerDown(nodeId as SiteNode['id'], edgeIndex, event)
                    }
                    onVertexDoubleClick={(nodeId, vertexIndex, event) =>
                      handleSiteVertexDoubleClick(nodeId as SiteNode['id'], vertexIndex, event)
                    }
                    onVertexPointerDown={(nodeId, vertexIndex, event) =>
                      handleSiteVertexPointerDown(nodeId as SiteNode['id'], vertexIndex, event)
                    }
                    palette={palette}
                    vertexHandles={siteVertexHandles}
                  />

                  {isMarqueeSelectionToolActive && (
                    <rect
                      fill="transparent"
                      height={viewBox.height}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onPointerCancel={handleMarqueePointerCancel}
                      onPointerDown={handleMarqueePointerDown}
                      onPointerMove={handleMarqueePointerMove}
                      onPointerUp={handleMarqueePointerUp}
                      style={{ cursor: EDITOR_CURSOR }}
                      width={viewBox.width}
                      x={viewBox.minX}
                      y={viewBox.minY}
                    />
                  )}

                  {visibleSvgMarqueeBounds && (
                    <>
                      <rect
                        fill={palette.cursor}
                        fillOpacity={0.12}
                        height={visibleSvgMarqueeBounds.height}
                        pointerEvents="none"
                        stroke={palette.cursor}
                        strokeOpacity={0.26}
                        strokeWidth={FLOORPLAN_MARQUEE_GLOW_WIDTH}
                        vectorEffect="non-scaling-stroke"
                        width={visibleSvgMarqueeBounds.width}
                        x={visibleSvgMarqueeBounds.x}
                        y={visibleSvgMarqueeBounds.y}
                      />
                      <rect
                        fill="none"
                        height={visibleSvgMarqueeBounds.height}
                        pointerEvents="none"
                        stroke={palette.cursor}
                        strokeOpacity={0.96}
                        strokeWidth={FLOORPLAN_MARQUEE_OUTLINE_WIDTH}
                        vectorEffect="non-scaling-stroke"
                        width={visibleSvgMarqueeBounds.width}
                        x={visibleSvgMarqueeBounds.x}
                        y={visibleSvgMarqueeBounds.y}
                      />
                    </>
                  )}

                  {draftPolygon && (
                    <polygon
                      fill={palette.draftFill}
                      fillOpacity={0.35}
                      points={draftPolygonPoints ?? undefined}
                      stroke={palette.draftStroke}
                      strokeDasharray="0.24 0.12"
                      strokeWidth="0.07"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  {wallOffsetPreviewPoints && (
                    <polygon
                      fill={palette.draftFill}
                      fillOpacity={0.18}
                      points={wallOffsetPreviewPoints}
                      stroke={palette.draftStroke}
                      strokeDasharray="0.2 0.12"
                      strokeWidth="0.06"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  {wallFilletPreviewPoints && (
                    <polyline
                      fill="none"
                      points={wallFilletPreviewPoints}
                      stroke={palette.draftStroke}
                      strokeDasharray="0.12 0.08"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="0.08"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  {wallEditPreviewSegments.map((segment) => (
                    <line
                      key={segment.id}
                      pointerEvents="none"
                      stroke={segment.isValid ? palette.draftStroke : palette.deleteStroke}
                      strokeDasharray={segment.isValid ? '0.18 0.1' : '0.08 0.08'}
                      strokeLinecap="round"
                      strokeOpacity={segment.isValid ? 0.85 : 0.72}
                      strokeWidth={segment.isValid ? '0.08' : '0.07'}
                      vectorEffect="non-scaling-stroke"
                      x1={toSvgX(segment.start[0])}
                      x2={toSvgX(segment.end[0])}
                      y1={toSvgY(segment.start[1])}
                      y2={toSvgY(segment.end[1])}
                    />
                  ))}

                  {sketchLineDraft &&
                    isSketchLineLongEnough(sketchLineDraft.start, sketchLineDraft.end) && (
                      <line
                        pointerEvents="none"
                        stroke={
                          sketchLineDraft.construction
                            ? palette.measurementStroke
                            : palette.draftStroke
                        }
                        strokeDasharray={sketchLineDraft.construction ? '0.16 0.1' : '0.18 0.1'}
                        strokeLinecap="round"
                        strokeOpacity={0.82}
                        strokeWidth={
                          sketchLineDraft.construction
                            ? FLOORPLAN_SKETCH_CONSTRUCTION_LINE_SELECTED_STROKE_WIDTH
                            : FLOORPLAN_SKETCH_LINE_SELECTED_STROKE_WIDTH
                        }
                        vectorEffect="non-scaling-stroke"
                        x1={toSvgX(sketchLineDraft.start[0])}
                        x2={toSvgX(sketchLineDraft.end[0])}
                        y1={toSvgY(sketchLineDraft.start[1])}
                        y2={toSvgY(sketchLineDraft.end[1])}
                      />
                    )}

                  {sketchRectangleDraftSegments.map((segment, index) => (
                    <line
                      key={`sketch-rectangle-draft:${index}`}
                      pointerEvents="none"
                      stroke={palette.draftStroke}
                      strokeDasharray="0.18 0.1"
                      strokeLinecap="round"
                      strokeOpacity={0.82}
                      strokeWidth={FLOORPLAN_SKETCH_LINE_SELECTED_STROKE_WIDTH}
                      vectorEffect="non-scaling-stroke"
                      x1={toSvgX(segment.start[0])}
                      x2={toSvgX(segment.end[0])}
                      y1={toSvgY(segment.start[1])}
                      y2={toSvgY(segment.end[1])}
                    />
                  ))}

                  {sketchCircleDraftPath && (
                    <path
                      d={sketchCircleDraftPath}
                      fill="none"
                      pointerEvents="none"
                      stroke={palette.draftStroke}
                      strokeDasharray="0.18 0.1"
                      strokeLinecap="round"
                      strokeOpacity={0.82}
                      strokeWidth={FLOORPLAN_SKETCH_LINE_SELECTED_STROKE_WIDTH}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  {sketchArcDraft && !sketchArcDraft.start && (
                    <line
                      pointerEvents="none"
                      stroke={palette.measurementStroke}
                      strokeDasharray="0.16 0.1"
                      strokeLinecap="round"
                      strokeOpacity={0.72}
                      strokeWidth={FLOORPLAN_SKETCH_CONSTRUCTION_LINE_SELECTED_STROKE_WIDTH}
                      vectorEffect="non-scaling-stroke"
                      x1={toSvgX(sketchArcDraft.center[0])}
                      x2={toSvgX(sketchArcDraft.end[0])}
                      y1={toSvgY(sketchArcDraft.center[1])}
                      y2={toSvgY(sketchArcDraft.end[1])}
                    />
                  )}

                  {sketchArcDraftPath && (
                    <path
                      d={sketchArcDraftPath}
                      fill="none"
                      pointerEvents="none"
                      stroke={palette.draftStroke}
                      strokeDasharray="0.18 0.1"
                      strokeLinecap="round"
                      strokeOpacity={0.82}
                      strokeWidth={FLOORPLAN_SKETCH_LINE_SELECTED_STROKE_WIDTH}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  <FloorplanWallSketchFeedbackLayer
                    draftEnd={
                      draftEnd ??
                      sketchLineDraft?.end ??
                      sketchRectangleDraft?.end ??
                      sketchCircleDraft?.edge ??
                      sketchArcDraft?.end ??
                      null
                    }
                    draftStart={
                      draftStart ??
                      sketchLineDraft?.start ??
                      sketchRectangleDraft?.start ??
                      sketchCircleDraft?.center ??
                      sketchArcDraft?.center ??
                      null
                    }
                    palette={palette}
                    snapResult={wallSketchSnapResult}
                    unit={unit}
                  />

                  {polygonDraftPolygonPoints && (
                    <polygon
                      fill={palette.draftFill}
                      fillOpacity={0.2}
                      points={polygonDraftPolygonPoints}
                      stroke="none"
                    />
                  )}

                  {polygonDraftPolylinePoints && (
                    <polyline
                      fill="none"
                      points={polygonDraftPolylinePoints}
                      stroke={palette.draftStroke}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="0.08"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  {polygonDraftClosingSegment && (
                    <line
                      stroke={palette.draftStroke}
                      strokeDasharray="0.16 0.1"
                      strokeLinecap="round"
                      strokeOpacity={0.75}
                      strokeWidth="0.05"
                      vectorEffect="non-scaling-stroke"
                      x1={polygonDraftClosingSegment.x1}
                      x2={polygonDraftClosingSegment.x2}
                      y1={polygonDraftClosingSegment.y1}
                      y2={polygonDraftClosingSegment.y2}
                    />
                  )}

                  {activePolygonDraftPoints.map((point, index) => (
                    <circle
                      cx={toSvgX(point[0])}
                      cy={toSvgY(point[1])}
                      fill={index === 0 ? palette.anchor : palette.draftStroke}
                      fillOpacity={0.95}
                      key={`polygon-draft-${index}`}
                      pointerEvents="none"
                      r={index === 0 ? 0.12 : 0.1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}

                  <FloorplanWallEndpointLayer
                    endpointHandles={wallEndpointHandles}
                    hoveredEndpointId={hoveredEndpointId}
                    onEndpointHoverChange={setHoveredEndpointId}
                    onWallEndpointPointerDown={handleWallEndpointPointerDown}
                    palette={palette}
                  />

                  <FloorplanWallCurveHandleLayer
                    curveHandles={wallCurveHandles}
                    hoveredHandleId={hoveredWallCurveHandleId}
                    onHandleHoverChange={setHoveredWallCurveHandleId}
                    onWallCurvePointerDown={handleWallCurvePointerDown}
                    palette={palette}
                  />

                  <FloorplanPolygonHandleLayer
                    hoveredHandleId={hoveredSlabHandleId}
                    midpointHandles={slabMidpointHandles}
                    onHandleHoverChange={setHoveredSlabHandleId}
                    onMidpointPointerDown={(nodeId, edgeIndex, event) =>
                      handleSlabMidpointPointerDown(nodeId as SlabNode['id'], edgeIndex, event)
                    }
                    onVertexDoubleClick={(nodeId, vertexIndex, event) =>
                      handleSlabVertexDoubleClick(nodeId as SlabNode['id'], vertexIndex, event)
                    }
                    onVertexPointerDown={(nodeId, vertexIndex, event) =>
                      handleSlabVertexPointerDown(nodeId as SlabNode['id'], vertexIndex, event)
                    }
                    palette={palette}
                    vertexHandles={slabVertexHandles}
                  />

                  <FloorplanPolygonHandleLayer
                    hoveredHandleId={hoveredZoneHandleId}
                    midpointHandles={zoneMidpointHandles}
                    onHandleHoverChange={setHoveredZoneHandleId}
                    onMidpointPointerDown={(nodeId, edgeIndex, event) =>
                      handleZoneMidpointPointerDown(nodeId as ZoneNodeType['id'], edgeIndex, event)
                    }
                    onVertexDoubleClick={(nodeId, vertexIndex, event) =>
                      handleZoneVertexDoubleClick(nodeId as ZoneNodeType['id'], vertexIndex, event)
                    }
                    onVertexPointerDown={(nodeId, vertexIndex, event) =>
                      handleZoneVertexPointerDown(nodeId as ZoneNodeType['id'], vertexIndex, event)
                    }
                    palette={palette}
                    vertexHandles={zoneVertexHandles}
                  />

                  {selectedGuide && showGuides && (
                    <>
                      <FloorplanGuideDetectionRegionOverlay
                        activeLabel={guideDetectionRegionCopy.activeLabel}
                        draft={guideDetectionRegionDraft}
                        guide={selectedGuide}
                        label={guideDetectionRegionCopy.label}
                      />
                      <FloorplanGuideCalibrationOverlay
                        guide={selectedGuide}
                        points={selectedGuideCalibrationPoints}
                      />
                      <FloorplanGuideSelectionOverlay
                        guide={selectedGuide}
                        isDarkMode={theme === 'dark'}
                        onCornerHoverChange={setHoveredGuideCorner}
                        onCornerPointerDown={handleGuideCornerPointerDown}
                        rotationModifierPressed={rotationModifierPressed}
                        showHandles={canInteractWithGuides && !selectedGuide.locked}
                      />
                    </>
                  )}

                  {cursorPoint && (
                    <g>
                      <circle
                        cx={toSvgX(cursorPoint[0])}
                        cy={toSvgY(cursorPoint[1])}
                        fill={floorplanCursorColor}
                        fillOpacity={0.16}
                        r={floorplanCursorMarkerRadius.glow}
                      />
                      <circle
                        cx={toSvgX(cursorPoint[0])}
                        cy={toSvgY(cursorPoint[1])}
                        fill={floorplanCursorColor}
                        fillOpacity={0.82}
                        r={floorplanCursorMarkerRadius.core}
                      />
                    </g>
                  )}

                  {activeDraftAnchorPoint && (
                    <circle
                      cx={toSvgX(activeDraftAnchorPoint[0])}
                      cy={toSvgY(activeDraftAnchorPoint[1])}
                      fill={palette.anchor}
                      fillOpacity={0.95}
                      r="0.14"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              </svg>
            )}
          </div>
        </ContextMenuTrigger>
        <FloorplanSketchContextMenuContent
          onActivateTool={activateSketchContextTool}
          onCancelSketchDraft={cancelSketchContextDraft}
          onClearEndpointCoincident={clearSketchEndpointCoincident}
          onCommitSketchDraft={commitSketchContextDraft}
          onConnectEndpoint={connectSketchEndpointToNearest}
          onConnectEndpointToCircle={connectSketchEndpointToNearestCircle}
          onConnectEndpointToLine={connectSketchEndpointToNearestLine}
          onConnectEndpointToMidpoint={connectSketchEndpointToNearestMidpoint}
          onContinueFromEndpoint={continueSketchFromEndpoint}
          onDeleteSketchCircles={deleteSketchCircleContextSelection}
          onDeleteSketchLines={deleteSketchContextSelection}
          onEndSketchDraft={endSketchContextDraft}
          onSelectAllSketchLines={selectAllSketchLines}
          onZoomToFit={zoomFloorplanToFit}
          selectedSketchCircleCount={selectedSketchCircleList.length}
          selectedSketchLineCount={selectedSketchLineList.length}
          sketchCircleActions={sketchCircleActionMenuExtraActions}
          sketchLineActions={sketchLineActionMenuExtraActions}
          target={sketchContextMenuTarget}
        />
      </ContextMenu>
    </div>
  )
}
