'use client'

import {
  getSketchCircleArcSweep,
  getSketchLineMidpointHandlePoint,
  sampleSketchCircleCenterline,
  sampleSketchLineCenterline,
  type Point2D,
  type SketchCircleNode,
  type SketchDimensionNode,
  type SketchDimensionReference,
  type SketchLineNode,
} from '@pascal-app/core'
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  areSketchDimensionReferencesEqual,
  resolveSketchDistanceMeasurement,
} from '../../tools/sketch/sketch-distance-dimensions'
import {
  getSketchLineLength2D,
  getSketchLinePathLength2D,
  type SketchProfile,
} from '../../tools/sketch/sketch-geometry'
import {
  getSketchCircleDimensionDisplay,
  getSketchCircleDisplayedDimensionMode,
  getSketchCircleDisplayedDimensionPrefix,
  getSketchCircleDisplayedDimensionValue,
  hasSketchCircleAnyDimension,
  getSketchLineAngleDimensionMode,
  getSketchLineDisplayedAngleDegrees,
  getSketchLineDisplayedAngleRadians,
  getSketchLineLengthDimensionMode,
} from '../../tools/sketch/sketch-dimensions'
import {
  getSketchCircleDefinitionState,
  getSketchDefinitionStatusBadgeLabel,
  getSketchLineDefinitionState,
} from '../../tools/sketch/sketch-definition-state'
import { isSketchCoincidentEndpointReference } from '../../tools/sketch/sketch-coincident'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import type { SketchLineEditDraft, SketchLineEditMode } from './sketch-edit'

const EDITOR_CURSOR = "url('/cursor.svg') 4 2, default"
const FLOORPLAN_HOVER_TRANSITION = 'opacity 180ms cubic-bezier(0.2, 0, 0, 1)'
const FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH = 18
const FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE = 0.15
const FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH = 0.05
const FLOORPLAN_SKETCH_LINE_STROKE_WIDTH = 1.4
const FLOORPLAN_SKETCH_LINE_SELECTED_STROKE_WIDTH = 2.2
const FLOORPLAN_SKETCH_CONSTRUCTION_LINE_STROKE_WIDTH = 1.1
const FLOORPLAN_SKETCH_CONSTRUCTION_LINE_SELECTED_STROKE_WIDTH = 1.8
const FLOORPLAN_SKETCH_LINE_HIT_STROKE_WIDTH = 16
const FLOORPLAN_SKETCH_DIMENSION_OFFSET = 0.34
const FLOORPLAN_SKETCH_DIMENSION_EXTENSION_OVERSHOOT = 0.08
const FLOORPLAN_SKETCH_DIMENSION_LABEL_GAP = 0.56
const FLOORPLAN_SKETCH_DIMENSION_LABEL_LINE_PADDING = 0.14
const FLOORPLAN_SKETCH_DIMENSION_LINE_WIDTH = 1.1
const FLOORPLAN_SKETCH_DIMENSION_LINE_OUTLINE_WIDTH = 2.6
const FLOORPLAN_SKETCH_DIMENSION_HIT_STROKE_WIDTH = 18
const FLOORPLAN_SKETCH_ANGLE_DIMENSION_MIN_RADIUS = 0.28
const FLOORPLAN_SKETCH_ANGLE_DIMENSION_MAX_RADIUS = 0.6
const FLOORPLAN_SKETCH_ANGLE_DIMENSION_LABEL_OFFSET = 0.14
const FLOORPLAN_SKETCH_RELATION_BADGE_OFFSET = 0.24
const FLOORPLAN_SKETCH_RELATION_BADGE_WIDTH = 0.28
const FLOORPLAN_SKETCH_RELATION_BADGE_HEIGHT = 0.2
const FLOORPLAN_SKETCH_RELATION_BADGE_GAP = 0.06
const FLOORPLAN_SKETCH_RELATION_BADGE_FONT_SIZE = 0.105
const FLOORPLAN_SKETCH_RELATION_BADGE_STROKE_WIDTH = 0.025
const FLOORPLAN_SKETCH_COINCIDENT_HANDLE_RADIUS = 0.09
const FLOORPLAN_SKETCH_COINCIDENT_HANDLE_INNER_RADIUS = 0.032
const FLOORPLAN_SKETCH_COINCIDENT_HANDLE_STROKE_WIDTH = 0.035
const FLOORPLAN_SKETCH_DIMENSION_ANCHOR_RADIUS = 0.11
const FLOORPLAN_SKETCH_DIMENSION_ANCHOR_HIT_RADIUS = 0.2
const FLOORPLAN_SKETCH_DIMENSION_ANCHOR_STROKE_WIDTH = 0.04
const FLOORPLAN_SKETCH_EDIT_HANDLE_RADIUS = 0.13
const FLOORPLAN_SKETCH_EDIT_HANDLE_STROKE_WIDTH = 0.045
const FULL_CIRCLE_RADIANS = Math.PI * 2

type UnitSystem = 'metric' | 'imperial'

type FloorplanSketchPalette = {
  surface: string
  selectedFill: string
  selectedStroke: string
  deleteStroke: string
  draftStroke: string
  measurementStroke: string
}

function toPoint2D(point: WallPlanPoint): Point2D {
  return { x: point[0], y: point[1] }
}

function toSvgX(value: number): number {
  return -value
}

function toSvgY(value: number): number {
  return -value
}

function toSvgPoint(point: Point2D) {
  return {
    x: toSvgX(point.x),
    y: toSvgY(point.y),
  }
}

function toSvgPlanPoint(point: WallPlanPoint) {
  return {
    x: toSvgX(point[0]),
    y: toSvgY(point[1]),
  }
}

function formatPolygonPoints(points: Point2D[]): string {
  return points
    .map((point) => {
      const svgPoint = toSvgPoint(point)
      return `${svgPoint.x},${svgPoint.y}`
    })
    .join(' ')
}

function formatSvgPath(points: Point2D[]): string {
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

function getSketchLineSvgPath(line: SketchLineNode) {
  return formatSvgPath(sampleSketchLineCenterline(line))
}

function getSketchCircleDimensionAnchorPoint(circle: SketchCircleNode): WallPlanPoint {
  const angle =
    circle.kind === 'arc' ? circle.startAngle + getSketchCircleArcSweep(circle) / 2 : -Math.PI / 4

  return [
    circle.center[0] + Math.cos(angle) * circle.radius,
    circle.center[1] + Math.sin(angle) * circle.radius,
  ]
}

function formatMeasurement(value: number, unit: UnitSystem) {
  if (unit === 'imperial') {
    const feet = value * 3.280_84
    const wholeFeet = Math.floor(feet)
    const inches = Math.round((feet - wholeFeet) * 12)
    if (inches === 12) return `${wholeFeet + 1}'0"`
    return `${wholeFeet}'${inches}"`
  }
  return `${Number.parseFloat(value.toFixed(2))}m`
}

function formatAngleMeasurement(valueDegrees: number) {
  return `${Number.parseFloat(valueDegrees.toFixed(1))}°`
}

function normalizeAngleRadians(angle: number) {
  const normalized = angle % FULL_CIRCLE_RADIANS
  return normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
}

function SketchDimensionLine({
  opacity,
  outlineOpacity,
  palette,
  segment,
}: {
  opacity: number
  outlineOpacity: number
  palette: FloorplanSketchPalette
  segment: { x1: number; y1: number; x2: number; y2: number }
}) {
  return (
    <>
      <line
        pointerEvents="none"
        shapeRendering="geometricPrecision"
        stroke={palette.surface}
        strokeLinecap="round"
        strokeOpacity={outlineOpacity}
        strokeWidth={FLOORPLAN_SKETCH_DIMENSION_LINE_OUTLINE_WIDTH}
        vectorEffect="non-scaling-stroke"
        x1={segment.x1}
        x2={segment.x2}
        y1={segment.y1}
        y2={segment.y2}
      />
      <line
        pointerEvents="none"
        shapeRendering="geometricPrecision"
        stroke={palette.measurementStroke}
        strokeLinecap="round"
        strokeOpacity={opacity}
        strokeWidth={FLOORPLAN_SKETCH_DIMENSION_LINE_WIDTH}
        vectorEffect="non-scaling-stroke"
        x1={segment.x1}
        x2={segment.x2}
        y1={segment.y1}
        y2={segment.y2}
      />
    </>
  )
}

function SketchDimensionPath({
  d,
  opacity,
  outlineOpacity,
  palette,
}: {
  d: string
  opacity: number
  outlineOpacity: number
  palette: FloorplanSketchPalette
}) {
  return (
    <>
      <path
        d={d}
        fill="none"
        pointerEvents="none"
        shapeRendering="geometricPrecision"
        stroke={palette.surface}
        strokeLinecap="round"
        strokeOpacity={outlineOpacity}
        strokeWidth={FLOORPLAN_SKETCH_DIMENSION_LINE_OUTLINE_WIDTH}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        pointerEvents="none"
        shapeRendering="geometricPrecision"
        stroke={palette.measurementStroke}
        strokeLinecap="round"
        strokeOpacity={opacity}
        strokeWidth={FLOORPLAN_SKETCH_DIMENSION_LINE_WIDTH}
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
}

function SketchDimensionHitLine({
  segment,
}: {
  segment: { x1: number; y1: number; x2: number; y2: number }
}) {
  return (
    <line
      pointerEvents="stroke"
      stroke="transparent"
      strokeLinecap="round"
      strokeWidth={FLOORPLAN_SKETCH_DIMENSION_HIT_STROKE_WIDTH}
      vectorEffect="non-scaling-stroke"
      x1={segment.x1}
      x2={segment.x2}
      y1={segment.y1}
      y2={segment.y2}
    />
  )
}

function SketchDimensionHitPath({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      pointerEvents="stroke"
      stroke="transparent"
      strokeLinecap="round"
      strokeWidth={FLOORPLAN_SKETCH_DIMENSION_HIT_STROKE_WIDTH}
      vectorEffect="non-scaling-stroke"
    />
  )
}

function SketchDimensionAnchorHandle({
  active,
  onClick,
  point,
  palette,
}: {
  active: boolean
  onClick?: (event: ReactMouseEvent<SVGCircleElement>) => void
  point: { x: number; y: number }
  palette: FloorplanSketchPalette
}) {
  return (
    <>
      <circle
        cx={point.x}
        cy={point.y}
        fill={active ? palette.selectedStroke : palette.surface}
        fillOpacity={active ? 0.92 : 0.9}
        pointerEvents="none"
        r={FLOORPLAN_SKETCH_DIMENSION_ANCHOR_RADIUS}
        stroke={active ? palette.surface : palette.selectedStroke}
        strokeOpacity={0.88}
        strokeWidth={FLOORPLAN_SKETCH_DIMENSION_ANCHOR_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
      />
      {onClick ? (
        <circle
          cx={point.x}
          cy={point.y}
          fill="transparent"
          onClick={onClick}
          pointerEvents="all"
          r={FLOORPLAN_SKETCH_DIMENSION_ANCHOR_HIT_RADIUS}
          style={{ cursor: EDITOR_CURSOR }}
        />
      ) : null}
    </>
  )
}

function pointsCoincident(a: WallPlanPoint, b: WallPlanPoint) {
  return Math.abs(a[0] - b[0]) <= 1e-4 && Math.abs(a[1] - b[1]) <= 1e-4
}

function getSketchEndpointPoint(line: SketchLineNode, endpoint: 'start' | 'end') {
  return endpoint === 'start' ? line.start : line.end
}

function getSketchDimensionLineEndpointReference(
  line: SketchLineNode,
  endpoint: 'start' | 'end',
): SketchDimensionReference {
  return {
    kind: 'line-endpoint',
    lineId: line.id,
    endpoint,
  }
}

function getSketchDimensionLineReference(line: SketchLineNode): SketchDimensionReference {
  return {
    kind: 'line',
    lineId: line.id,
  }
}

function getSketchDimensionCircleCenterReference(
  circle: SketchCircleNode,
): SketchDimensionReference {
  return {
    kind: 'circle-center',
    circleId: circle.id,
  }
}

function isActiveSketchDimensionAnchor(
  activeReference: SketchDimensionReference | null | undefined,
  reference: SketchDimensionReference,
) {
  return Boolean(activeReference && areSketchDimensionReferencesEqual(activeReference, reference))
}

function hasCoincidentEndpoint(
  line: SketchLineNode,
  endpoint: 'start' | 'end',
  sketchLines: SketchLineNode[],
) {
  if (line.coincident?.[endpoint]) {
    return true
  }

  const point = getSketchEndpointPoint(line, endpoint)
  return sketchLines.some((candidate) => {
    for (const candidateEndpoint of ['start', 'end'] as const) {
      if (candidate.id === line.id && candidateEndpoint === endpoint) {
        continue
      }

      const linked = candidate.coincident?.[candidateEndpoint]
      if (
        isSketchCoincidentEndpointReference(linked) &&
        linked.lineId === line.id &&
        linked.endpoint === endpoint
      ) {
        return true
      }

      if (pointsCoincident(point, getSketchEndpointPoint(candidate, candidateEndpoint))) {
        return true
      }
    }

    return false
  })
}

function getSketchRelationBadges(line: SketchLineNode) {
  const badges: Array<{ id: string; label: string }> = []
  const relations = line.relations ?? []
  const constraints = line.constraints ?? []
  const definitionState = getSketchLineDefinitionState(line)

  badges.push({
    id: `definition:${definitionState.status}`,
    label: getSketchDefinitionStatusBadgeLabel(definitionState.status),
  })

  if (relations.includes('horizontal')) {
    badges.push({ id: 'horizontal', label: 'H' })
  }
  if (relations.includes('vertical')) {
    badges.push({ id: 'vertical', label: 'V' })
  }
  if (relations.includes('fixed')) {
    badges.push({ id: 'fixed', label: 'F' })
  }
  if (line.tangent) {
    badges.push({ id: 'tangent', label: 'T' })
  }
  if (constraints.some((constraint) => constraint.kind === 'equal-length')) {
    badges.push({ id: 'equal-length', label: '=' })
  }
  if (constraints.some((constraint) => constraint.kind === 'parallel')) {
    badges.push({ id: 'parallel', label: '||' })
  }
  if (constraints.some((constraint) => constraint.kind === 'perpendicular')) {
    badges.push({ id: 'perpendicular', label: '90' })
  }
  if (constraints.some((constraint) => constraint.kind === 'collinear')) {
    badges.push({ id: 'collinear', label: 'CL' })
  }
  if (line.construction) {
    badges.push({ id: 'reference', label: 'R' })
  }

  return badges
}

function getSketchRelationBadgeWidth(label: string) {
  return Math.max(FLOORPLAN_SKETCH_RELATION_BADGE_WIDTH, 0.12 + label.length * 0.095)
}

function getSketchCircleRelationBadges(circle: SketchCircleNode, sketchLines: SketchLineNode[]) {
  const badges: Array<{ id: string; label: string }> = []
  const relations = circle.relations ?? []
  const constraints = circle.constraints ?? []
  const definitionState = getSketchCircleDefinitionState({ circle, sketchLines })

  badges.push({
    id: `definition:${definitionState.status}`,
    label: getSketchDefinitionStatusBadgeLabel(definitionState.status),
  })

  if (relations.includes('fixed')) {
    badges.push({ id: 'fixed', label: 'F' })
  }
  if (constraints.some((constraint) => constraint.kind === 'concentric')) {
    badges.push({ id: 'concentric', label: 'C' })
  }
  if (constraints.some((constraint) => constraint.kind === 'equal-radius')) {
    badges.push({ id: 'equal-radius', label: 'E' })
  }
  if (constraints.some((constraint) => constraint.kind === 'tangent')) {
    badges.push({ id: 'tangent', label: 'T' })
  }
  if (circle.construction) {
    badges.push({ id: 'reference', label: 'R' })
  }

  return badges
}

function getSketchAngleDimensionArcPath(origin: WallPlanPoint, radius: number, angle: number) {
  const sweep = normalizeAngleRadians(angle)
  const segmentCount = Math.max(2, Math.ceil(Math.max(sweep, 1e-4) / (Math.PI / 18)))
  const points: Point2D[] = []

  for (let index = 0; index <= segmentCount; index += 1) {
    const currentAngle = (sweep * index) / segmentCount
    points.push(
      toPoint2D([
        origin[0] + Math.cos(currentAngle) * radius,
        origin[1] + Math.sin(currentAngle) * radius,
      ]),
    )
  }

  return formatSvgPath(points)
}

export const FloorplanSketchLayer = memo(function FloorplanSketchLayer({
  activeDimensionAnchor,
  alwaysShowSketchRelations,
  canSelectSketchLines,
  highlightedIdSet,
  hoveredSketchLineId,
  isDeleteMode,
  onSketchLineEndpointDimensionClick,
  onSketchLineReferenceDimensionClick,
  onSketchLineAngleDimensionClick,
  onSketchLineAngleDimensionDoubleClick,
  onSketchLineClick,
  onSketchLineDimensionClick,
  onSketchLineDimensionDoubleClick,
  onSketchLineHoverChange,
  palette,
  selectedIdSet,
  showDimensionAnchors,
  sketchLines,
  unit,
}: {
  activeDimensionAnchor?: SketchDimensionReference | null
  alwaysShowSketchRelations: boolean
  canSelectSketchLines: boolean
  highlightedIdSet: ReadonlySet<string>
  hoveredSketchLineId: SketchLineNode['id'] | null
  isDeleteMode: boolean
  onSketchLineEndpointDimensionClick?: (
    line: SketchLineNode,
    endpoint: 'start' | 'end',
    event: ReactMouseEvent<SVGCircleElement>,
  ) => void
  onSketchLineReferenceDimensionClick?: (
    line: SketchLineNode,
    event: ReactMouseEvent<SVGCircleElement>,
  ) => void
  onSketchLineAngleDimensionClick: (
    line: SketchLineNode,
    event: ReactMouseEvent<SVGElement>,
  ) => void
  onSketchLineAngleDimensionDoubleClick: (
    line: SketchLineNode,
    event: ReactMouseEvent<SVGElement>,
  ) => void
  onSketchLineClick: (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => void
  onSketchLineDimensionClick: (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => void
  onSketchLineDimensionDoubleClick: (
    line: SketchLineNode,
    event: ReactMouseEvent<SVGElement>,
  ) => void
  onSketchLineHoverChange: (lineId: SketchLineNode['id'] | null) => void
  palette: FloorplanSketchPalette
  selectedIdSet: ReadonlySet<string>
  showDimensionAnchors?: boolean
  sketchLines: SketchLineNode[]
  unit: UnitSystem
}) {
  if (sketchLines.length === 0) {
    return null
  }

  return (
    <>
      {sketchLines.map((line) => {
        const isSelected = selectedIdSet.has(line.id)
        const isHighlighted = highlightedIdSet.has(line.id)
        const isHovered = canSelectSketchLines && hoveredSketchLineId === line.id
        const isDeleteHovered = isDeleteMode && isHovered
        const chordLength = getSketchLineLength2D(line)
        const length = getSketchLinePathLength2D(line)
        const linePath = getSketchLineSvgPath(line)
        const dimensionMode = getSketchLineLengthDimensionMode(line)
        const angleDimensionMode = getSketchLineAngleDimensionMode(line)
        const angleRadians = getSketchLineDisplayedAngleRadians(line)
        const angleDegrees = getSketchLineDisplayedAngleDegrees(line)
        const showDimension =
          chordLength > 1e-6 &&
          (!line.construction || Boolean(line.dimensions?.length) || isSelected || isHighlighted)
        const showAngleDimension =
          chordLength > 1e-6 &&
          (line.dimensions?.angle !== undefined || isSelected || isHighlighted)
        const start = toSvgPlanPoint(line.start)
        const end = toSvgPlanPoint(line.end)
        const lineReferenceAnchor = toSvgPoint(getSketchLineMidpointHandlePoint(line))
        const planDx = line.end[0] - line.start[0]
        const planDy = line.end[1] - line.start[1]
        const normal =
          chordLength > 1e-6
            ? ([-planDy / chordLength, planDx / chordLength] as WallPlanPoint)
            : ([0, -1] as WallPlanPoint)
        const labelPlanPoint: WallPlanPoint = [
          (line.start[0] + line.end[0]) / 2 + normal[0] * FLOORPLAN_SKETCH_DIMENSION_OFFSET,
          (line.start[1] + line.end[1]) / 2 + normal[1] * FLOORPLAN_SKETCH_DIMENSION_OFFSET,
        ]
        const dimensionStart = toSvgPlanPoint([
          line.start[0] + normal[0] * FLOORPLAN_SKETCH_DIMENSION_OFFSET,
          line.start[1] + normal[1] * FLOORPLAN_SKETCH_DIMENSION_OFFSET,
        ])
        const dimensionEnd = toSvgPlanPoint([
          line.end[0] + normal[0] * FLOORPLAN_SKETCH_DIMENSION_OFFSET,
          line.end[1] + normal[1] * FLOORPLAN_SKETCH_DIMENSION_OFFSET,
        ])
        const extensionStartEnd = toSvgPlanPoint([
          line.start[0] +
            normal[0] *
              (FLOORPLAN_SKETCH_DIMENSION_OFFSET + FLOORPLAN_SKETCH_DIMENSION_EXTENSION_OVERSHOOT),
          line.start[1] +
            normal[1] *
              (FLOORPLAN_SKETCH_DIMENSION_OFFSET + FLOORPLAN_SKETCH_DIMENSION_EXTENSION_OVERSHOOT),
        ])
        const extensionEndEnd = toSvgPlanPoint([
          line.end[0] +
            normal[0] *
              (FLOORPLAN_SKETCH_DIMENSION_OFFSET + FLOORPLAN_SKETCH_DIMENSION_EXTENSION_OVERSHOOT),
          line.end[1] +
            normal[1] *
              (FLOORPLAN_SKETCH_DIMENSION_OFFSET + FLOORPLAN_SKETCH_DIMENSION_EXTENSION_OVERSHOOT),
        ])
        const extensionStart = {
          x1: start.x,
          y1: start.y,
          x2: extensionStartEnd.x,
          y2: extensionStartEnd.y,
        }
        const extensionEnd = {
          x1: end.x,
          y1: end.y,
          x2: extensionEndEnd.x,
          y2: extensionEndEnd.y,
        }
        const relationBadgePlanPoint: WallPlanPoint = [
          (line.start[0] + line.end[0]) / 2 - normal[0] * FLOORPLAN_SKETCH_RELATION_BADGE_OFFSET,
          (line.start[1] + line.end[1]) / 2 - normal[1] * FLOORPLAN_SKETCH_RELATION_BADGE_OFFSET,
        ]
        const label = toSvgPlanPoint(labelPlanPoint)
        const relationBadgeAnchor = toSvgPlanPoint(relationBadgePlanPoint)
        const svgDx = dimensionEnd.x - dimensionStart.x
        const svgDy = dimensionEnd.y - dimensionStart.y
        const svgLength = Math.hypot(svgDx, svgDy)
        let labelAngle = (Math.atan2(svgDy, svgDx) * 180) / Math.PI
        if (labelAngle > 90) {
          labelAngle -= 180
        } else if (labelAngle <= -90) {
          labelAngle += 180
        }
        const dirSvgX = svgLength > 1e-6 ? svgDx / svgLength : 1
        const dirSvgY = svgLength > 1e-6 ? svgDy / svgLength : 0
        const labelGapHalf = Math.min(
          FLOORPLAN_SKETCH_DIMENSION_LABEL_GAP / 2,
          Math.max(0, svgLength / 2 - FLOORPLAN_SKETCH_DIMENSION_LABEL_LINE_PADDING),
        )
        const dimensionLineStart = {
          x1: dimensionStart.x,
          y1: dimensionStart.y,
          x2: label.x - dirSvgX * labelGapHalf,
          y2: label.y - dirSvgY * labelGapHalf,
        }
        const dimensionLineEnd = {
          x1: label.x + dirSvgX * labelGapHalf,
          y1: label.y + dirSvgY * labelGapHalf,
          x2: dimensionEnd.x,
          y2: dimensionEnd.y,
        }
        const dimensionOpacity =
          line.dimensions?.length || isSelected || isHighlighted || isHovered ? 0.82 : 0.34
        const dimensionOutlineOpacity =
          line.dimensions?.length || isSelected || isHighlighted || isHovered ? 0.92 : 0.38
        const angleDimensionRadius = Math.min(
          FLOORPLAN_SKETCH_ANGLE_DIMENSION_MAX_RADIUS,
          Math.max(FLOORPLAN_SKETCH_ANGLE_DIMENSION_MIN_RADIUS, chordLength * 0.22),
        )
        const angleArcPath = getSketchAngleDimensionArcPath(line.start, angleDimensionRadius, angleRadians)
        const angleBasePoint = toSvgPlanPoint([
          line.start[0] + angleDimensionRadius,
          line.start[1],
        ])
        const angleCurrentPoint = toSvgPlanPoint([
          line.start[0] + Math.cos(angleRadians) * angleDimensionRadius,
          line.start[1] + Math.sin(angleRadians) * angleDimensionRadius,
        ])
        const angleMidRadians = angleRadians / 2
        const angleLabelPoint = toSvgPlanPoint([
          line.start[0] +
            Math.cos(angleMidRadians) *
              (angleDimensionRadius + FLOORPLAN_SKETCH_ANGLE_DIMENSION_LABEL_OFFSET),
          line.start[1] +
            Math.sin(angleMidRadians) *
              (angleDimensionRadius + FLOORPLAN_SKETCH_ANGLE_DIMENSION_LABEL_OFFSET),
        ])
        const angleBaseSegment = {
          x1: start.x,
          y1: start.y,
          x2: angleBasePoint.x,
          y2: angleBasePoint.y,
        }
        const angleCurrentSegment = {
          x1: start.x,
          y1: start.y,
          x2: angleCurrentPoint.x,
          y2: angleCurrentPoint.y,
        }
        const angleDimensionOpacity =
          line.dimensions?.angle !== undefined || isSelected || isHighlighted || isHovered
            ? 0.82
            : 0.34
        const angleDimensionOutlineOpacity =
          line.dimensions?.angle !== undefined || isSelected || isHighlighted || isHovered
            ? 0.92
            : 0.38
        const stroke = isDeleteHovered
          ? palette.deleteStroke
          : isSelected || isHighlighted
            ? palette.selectedStroke
            : line.construction
              ? palette.measurementStroke
              : palette.draftStroke
        const baseOpacity = line.construction ? 0.58 : 0.86
        const shouldShowSketchRelations =
          alwaysShowSketchRelations || isSelected || isHighlighted || isHovered
        const relationBadges = shouldShowSketchRelations ? getSketchRelationBadges(line) : []
        const relationBadgeTotalWidth = relationBadges.reduce(
          (total, badge, index) =>
            total +
            getSketchRelationBadgeWidth(badge.label) +
            (index > 0 ? FLOORPLAN_SKETCH_RELATION_BADGE_GAP : 0),
          0,
        )
        const hasStartCoincident =
          shouldShowSketchRelations && hasCoincidentEndpoint(line, 'start', sketchLines)
        const hasEndCoincident =
          shouldShowSketchRelations && hasCoincidentEndpoint(line, 'end', sketchLines)

        return (
          <g
            key={line.id}
            onPointerEnter={
              canSelectSketchLines ? () => onSketchLineHoverChange(line.id) : undefined
            }
            onPointerLeave={canSelectSketchLines ? () => onSketchLineHoverChange(null) : undefined}
          >
            <path
              d={linePath}
              fill="none"
              pointerEvents="none"
              stroke={stroke}
              strokeLinecap="round"
              strokeOpacity={isHovered || isSelected || isHighlighted ? 0.2 : 0}
              strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
              style={{ transition: FLOORPLAN_HOVER_TRANSITION }}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={linePath}
              fill="none"
              pointerEvents="none"
              stroke={stroke}
              strokeDasharray={line.construction ? '0.16 0.1' : undefined}
              strokeLinecap="round"
              strokeOpacity={isDeleteHovered ? 0.92 : baseOpacity}
              strokeWidth={
                line.construction
                  ? isSelected || isHighlighted
                    ? FLOORPLAN_SKETCH_CONSTRUCTION_LINE_SELECTED_STROKE_WIDTH
                    : FLOORPLAN_SKETCH_CONSTRUCTION_LINE_STROKE_WIDTH
                  : isSelected || isHighlighted
                    ? FLOORPLAN_SKETCH_LINE_SELECTED_STROKE_WIDTH
                    : FLOORPLAN_SKETCH_LINE_STROKE_WIDTH
              }
              vectorEffect="non-scaling-stroke"
            />
            {canSelectSketchLines && (
              <path
                d={linePath}
                fill="none"
                onClick={(event) => {
                  event.stopPropagation()
                  onSketchLineClick(line, event)
                }}
                pointerEvents="stroke"
                stroke="transparent"
                strokeLinecap="round"
                strokeWidth={FLOORPLAN_SKETCH_LINE_HIT_STROKE_WIDTH}
                style={{ cursor: EDITOR_CURSOR }}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {showDimension && (
              <g
                className="sketch-dimension"
                onClick={
                  canSelectSketchLines
                    ? (event) => {
                        event.stopPropagation()
                        onSketchLineDimensionClick(line, event)
                      }
                    : undefined
                }
                onDoubleClick={
                  canSelectSketchLines
                    ? (event) => {
                        event.stopPropagation()
                        onSketchLineDimensionDoubleClick(line, event)
                      }
                    : undefined
                }
                style={
                  canSelectSketchLines
                    ? { cursor: EDITOR_CURSOR, userSelect: 'none' }
                    : { userSelect: 'none' }
                }
              >
                <SketchDimensionLine
                  opacity={dimensionOpacity}
                  outlineOpacity={dimensionOutlineOpacity}
                  palette={palette}
                  segment={extensionStart}
                />
                <SketchDimensionLine
                  opacity={dimensionOpacity}
                  outlineOpacity={dimensionOutlineOpacity}
                  palette={palette}
                  segment={dimensionLineStart}
                />
                <SketchDimensionLine
                  opacity={dimensionOpacity}
                  outlineOpacity={dimensionOutlineOpacity}
                  palette={palette}
                  segment={dimensionLineEnd}
                />
                <SketchDimensionLine
                  opacity={dimensionOpacity}
                  outlineOpacity={dimensionOutlineOpacity}
                  palette={palette}
                  segment={extensionEnd}
                />
                {canSelectSketchLines && (
                  <>
                    <SketchDimensionHitLine segment={extensionStart} />
                    <SketchDimensionHitLine segment={dimensionLineStart} />
                    <SketchDimensionHitLine segment={dimensionLineEnd} />
                    <SketchDimensionHitLine segment={extensionEnd} />
                  </>
                )}
                <text
                  dominantBaseline="central"
                  fill={palette.measurementStroke}
                  fillOpacity={dimensionOpacity}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
                  fontWeight="600"
                  paintOrder="stroke"
                  pointerEvents={canSelectSketchLines ? 'all' : 'none'}
                  stroke={palette.surface}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={dimensionOutlineOpacity}
                  strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
                  textAnchor="middle"
                  transform={`rotate(${labelAngle} ${label.x} ${label.y}) translate(0, -0.04)`}
                  x={label.x}
                  y={label.y}
                >
                  {(() => {
                    const text = formatMeasurement(line.dimensions?.length ?? length, unit)
                    return dimensionMode === 'reference' ? `(${text})` : text
                  })()}
                </text>
              </g>
            )}
            {showAngleDimension && (
              <g
                className="sketch-angle-dimension"
                onClick={
                  canSelectSketchLines
                    ? (event) => {
                        event.stopPropagation()
                        onSketchLineAngleDimensionClick(line, event)
                      }
                    : undefined
                }
                onDoubleClick={
                  canSelectSketchLines
                    ? (event) => {
                        event.stopPropagation()
                        onSketchLineAngleDimensionDoubleClick(line, event)
                      }
                    : undefined
                }
                style={
                  canSelectSketchLines
                    ? { cursor: EDITOR_CURSOR, userSelect: 'none' }
                    : { userSelect: 'none' }
                }
              >
                <SketchDimensionLine
                  opacity={angleDimensionOpacity}
                  outlineOpacity={angleDimensionOutlineOpacity}
                  palette={palette}
                  segment={angleBaseSegment}
                />
                <SketchDimensionLine
                  opacity={angleDimensionOpacity}
                  outlineOpacity={angleDimensionOutlineOpacity}
                  palette={palette}
                  segment={angleCurrentSegment}
                />
                <SketchDimensionPath
                  d={angleArcPath}
                  opacity={angleDimensionOpacity}
                  outlineOpacity={angleDimensionOutlineOpacity}
                  palette={palette}
                />
                {canSelectSketchLines && (
                  <>
                    <SketchDimensionHitLine segment={angleBaseSegment} />
                    <SketchDimensionHitLine segment={angleCurrentSegment} />
                    <SketchDimensionHitPath d={angleArcPath} />
                  </>
                )}
                <text
                  dominantBaseline="central"
                  fill={palette.measurementStroke}
                  fillOpacity={angleDimensionOpacity}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
                  fontWeight="600"
                  paintOrder="stroke"
                  pointerEvents={canSelectSketchLines ? 'all' : 'none'}
                  stroke={palette.surface}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={angleDimensionOutlineOpacity}
                  strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
                  textAnchor="middle"
                  x={angleLabelPoint.x}
                  y={angleLabelPoint.y}
                >
                  {(() => {
                    const text = formatAngleMeasurement(angleDegrees)
                    return angleDimensionMode === 'reference' ? `(${text})` : text
                  })()}
                </text>
              </g>
            )}
            {relationBadges.map((badge, index) => {
              const width = getSketchRelationBadgeWidth(badge.label)
              const previousWidth = relationBadges
                .slice(0, index)
                .reduce(
                  (total, current) =>
                    total +
                    getSketchRelationBadgeWidth(current.label) +
                    FLOORPLAN_SKETCH_RELATION_BADGE_GAP,
                  0,
                )
              const x = relationBadgeAnchor.x - relationBadgeTotalWidth / 2 + previousWidth
              const y = relationBadgeAnchor.y - FLOORPLAN_SKETCH_RELATION_BADGE_HEIGHT / 2

              return (
                <g key={`${line.id}:relation:${badge.id}`} pointerEvents="none">
                  <rect
                    fill={palette.surface}
                    fillOpacity={0.92}
                    height={FLOORPLAN_SKETCH_RELATION_BADGE_HEIGHT}
                    rx={0.035}
                    stroke={palette.selectedStroke}
                    strokeOpacity={0.72}
                    strokeWidth={FLOORPLAN_SKETCH_RELATION_BADGE_STROKE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                    width={width}
                    x={x}
                    y={y}
                  />
                  <text
                    dominantBaseline="central"
                    fill={palette.selectedStroke}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                    fontSize={FLOORPLAN_SKETCH_RELATION_BADGE_FONT_SIZE}
                    fontWeight="700"
                    textAnchor="middle"
                    x={x + width / 2}
                    y={relationBadgeAnchor.y}
                  >
                    {badge.label}
                  </text>
                </g>
              )
            })}
            {showDimensionAnchors ? (
              <SketchDimensionAnchorHandle
                active={isActiveSketchDimensionAnchor(
                  activeDimensionAnchor,
                  getSketchDimensionLineReference(line),
                )}
                onClick={
                  canSelectSketchLines && onSketchLineReferenceDimensionClick
                    ? (event) => {
                        event.stopPropagation()
                        onSketchLineReferenceDimensionClick(line, event)
                      }
                    : undefined
                }
                palette={palette}
                point={lineReferenceAnchor}
              />
            ) : null}
            {showDimensionAnchors
              ? (['start', 'end'] as const).map((endpoint) => {
                  const reference = getSketchDimensionLineEndpointReference(line, endpoint)
                  const point = endpoint === 'start' ? start : end

                  return (
                    <SketchDimensionAnchorHandle
                      active={isActiveSketchDimensionAnchor(activeDimensionAnchor, reference)}
                      key={`${line.id}:dimension-anchor:${endpoint}`}
                      onClick={
                        canSelectSketchLines && onSketchLineEndpointDimensionClick
                          ? (event) => {
                              event.stopPropagation()
                              onSketchLineEndpointDimensionClick(line, endpoint, event)
                            }
                          : undefined
                      }
                      palette={palette}
                      point={point}
                    />
                  )
                })
              : null}
            {[
              { id: 'start', point: start, visible: hasStartCoincident },
              { id: 'end', point: end, visible: hasEndCoincident },
            ].map((marker) =>
              marker.visible ? (
                <g key={`${line.id}:coincident:${marker.id}`} pointerEvents="none">
                  <circle
                    cx={marker.point.x}
                    cy={marker.point.y}
                    fill={palette.surface}
                    fillOpacity={0.94}
                    r={FLOORPLAN_SKETCH_COINCIDENT_HANDLE_RADIUS}
                    stroke={palette.selectedStroke}
                    strokeOpacity={0.86}
                    strokeWidth={FLOORPLAN_SKETCH_COINCIDENT_HANDLE_STROKE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={marker.point.x}
                    cy={marker.point.y}
                    fill={palette.selectedStroke}
                    fillOpacity={0.92}
                    r={FLOORPLAN_SKETCH_COINCIDENT_HANDLE_INNER_RADIUS}
                  />
                </g>
              ) : null,
            )}
          </g>
        )
      })}
    </>
  )
})

export const FloorplanSketchCircleLayer = memo(function FloorplanSketchCircleLayer({
  activeDimensionAnchor,
  alwaysShowSketchRelations,
  canSelectSketchCircles,
  highlightedIdSet,
  hoveredSketchCircleId,
  isDeleteMode,
  onSketchCircleClick,
  onSketchCircleCenterDimensionClick,
  onSketchCircleDimensionClick,
  onSketchCircleDimensionDoubleClick,
  onSketchCircleHoverChange,
  palette,
  selectedIdSet,
  showDimensionAnchors,
  sketchCircles,
  sketchLines,
  unit,
}: {
  activeDimensionAnchor?: SketchDimensionReference | null
  alwaysShowSketchRelations: boolean
  canSelectSketchCircles: boolean
  highlightedIdSet: ReadonlySet<string>
  hoveredSketchCircleId: SketchCircleNode['id'] | null
  isDeleteMode: boolean
  onSketchCircleClick: (circle: SketchCircleNode, event: ReactMouseEvent<SVGElement>) => void
  onSketchCircleCenterDimensionClick?: (
    circle: SketchCircleNode,
    event: ReactMouseEvent<SVGCircleElement>,
  ) => void
  onSketchCircleDimensionClick: (
    circle: SketchCircleNode,
    event: ReactMouseEvent<SVGElement>,
  ) => void
  onSketchCircleDimensionDoubleClick: (
    circle: SketchCircleNode,
    event: ReactMouseEvent<SVGElement>,
  ) => void
  onSketchCircleHoverChange: (circleId: SketchCircleNode['id'] | null) => void
  palette: FloorplanSketchPalette
  selectedIdSet: ReadonlySet<string>
  showDimensionAnchors?: boolean
  sketchCircles: SketchCircleNode[]
  sketchLines: SketchLineNode[]
  unit: UnitSystem
}) {
  if (sketchCircles.length === 0) {
    return null
  }

  return (
    <>
      {sketchCircles.map((circle) => {
        const isSelected = selectedIdSet.has(circle.id)
        const isHighlighted = highlightedIdSet.has(circle.id)
        const isHovered = canSelectSketchCircles && hoveredSketchCircleId === circle.id
        const isDeleteHovered = isDeleteMode && isHovered
        const path = formatSvgPath(sampleSketchCircleCenterline(circle))
        const stroke = isDeleteHovered
          ? palette.deleteStroke
          : isSelected || isHighlighted
            ? palette.selectedStroke
            : circle.construction
              ? palette.measurementStroke
              : palette.draftStroke
        const baseOpacity = circle.construction ? 0.58 : 0.86
        const strokeWidth = circle.construction
          ? isSelected || isHighlighted
            ? FLOORPLAN_SKETCH_CONSTRUCTION_LINE_SELECTED_STROKE_WIDTH
            : FLOORPLAN_SKETCH_CONSTRUCTION_LINE_STROKE_WIDTH
          : isSelected || isHighlighted
            ? FLOORPLAN_SKETCH_LINE_SELECTED_STROKE_WIDTH
            : FLOORPLAN_SKETCH_LINE_STROKE_WIDTH
        const dimensionMode = getSketchCircleDisplayedDimensionMode(circle)
        const dimensionDisplay = getSketchCircleDimensionDisplay(circle)
        const center = toSvgPlanPoint(circle.center)
        const showDimension =
          circle.radius > 1e-6 &&
          (!circle.construction ||
            hasSketchCircleAnyDimension(circle) ||
            isSelected ||
            isHighlighted)
        const dimensionAnchorPlanPoint = getSketchCircleDimensionAnchorPoint(circle)
        const dimensionAnchor = toSvgPlanPoint(dimensionAnchorPlanPoint)
        const planDx = dimensionAnchorPlanPoint[0] - circle.center[0]
        const planDy = dimensionAnchorPlanPoint[1] - circle.center[1]
        const planLength = Math.hypot(planDx, planDy)
        const radialDirection =
          planLength > 1e-6
            ? ([planDx / planLength, planDy / planLength] as WallPlanPoint)
            : ([1, 0] as WallPlanPoint)
        const labelDistance = dimensionDisplay === 'diameter' ? 0 : circle.radius * 0.58
        const labelPlanPoint: WallPlanPoint = [
          circle.center[0] + radialDirection[0] * labelDistance,
          circle.center[1] + radialDirection[1] * labelDistance,
        ]
        const label = toSvgPlanPoint(labelPlanPoint)
        const oppositePoint: WallPlanPoint = [
          circle.center[0] - radialDirection[0] * circle.radius,
          circle.center[1] - radialDirection[1] * circle.radius,
        ]
        const oppositeAnchor = toSvgPlanPoint(oppositePoint)
        const dimensionLineOrigin = dimensionDisplay === 'diameter' ? oppositeAnchor : center
        const svgDx = dimensionAnchor.x - dimensionLineOrigin.x
        const svgDy = dimensionAnchor.y - dimensionLineOrigin.y
        const svgLength = Math.hypot(svgDx, svgDy)
        const dirSvgX = svgLength > 1e-6 ? svgDx / svgLength : 1
        const dirSvgY = svgLength > 1e-6 ? svgDy / svgLength : 0
        const labelGapHalf = Math.min(
          FLOORPLAN_SKETCH_DIMENSION_LABEL_GAP / 2,
          Math.max(0, svgLength / 2 - FLOORPLAN_SKETCH_DIMENSION_LABEL_LINE_PADDING),
        )
        const relationBadgePlanPoint: WallPlanPoint = [
          circle.center[0] -
            radialDirection[0] * (circle.radius + FLOORPLAN_SKETCH_RELATION_BADGE_OFFSET),
          circle.center[1] -
            radialDirection[1] * (circle.radius + FLOORPLAN_SKETCH_RELATION_BADGE_OFFSET),
        ]
        const relationBadgeAnchor = toSvgPlanPoint(relationBadgePlanPoint)
        const dimensionLineStart = {
          x1: dimensionLineOrigin.x,
          y1: dimensionLineOrigin.y,
          x2: label.x - dirSvgX * labelGapHalf,
          y2: label.y - dirSvgY * labelGapHalf,
        }
        const dimensionLineEnd = {
          x1: label.x + dirSvgX * labelGapHalf,
          y1: label.y + dirSvgY * labelGapHalf,
          x2: dimensionAnchor.x,
          y2: dimensionAnchor.y,
        }
        const dimensionOpacity =
          hasSketchCircleAnyDimension(circle) || isSelected || isHighlighted || isHovered
            ? 0.82
            : 0.34
        const dimensionOutlineOpacity =
          hasSketchCircleAnyDimension(circle) || isSelected || isHighlighted || isHovered
            ? 0.92
            : 0.38
        const shouldShowSketchRelations =
          alwaysShowSketchRelations || isSelected || isHighlighted || isHovered
        const relationBadges = shouldShowSketchRelations
          ? getSketchCircleRelationBadges(circle, sketchLines)
          : []
        const relationBadgeTotalWidth = relationBadges.reduce(
          (total, badge, index) =>
            total +
            getSketchRelationBadgeWidth(badge.label) +
            (index > 0 ? FLOORPLAN_SKETCH_RELATION_BADGE_GAP : 0),
          0,
        )

        return (
          <g
            key={circle.id}
            onPointerEnter={
              canSelectSketchCircles ? () => onSketchCircleHoverChange(circle.id) : undefined
            }
            onPointerLeave={
              canSelectSketchCircles ? () => onSketchCircleHoverChange(null) : undefined
            }
          >
            <path
              d={path}
              fill="none"
              pointerEvents="none"
              stroke={stroke}
              strokeLinecap="round"
              strokeOpacity={isHovered || isSelected || isHighlighted ? 0.2 : 0}
              strokeWidth={FLOORPLAN_WALL_HOVER_GLOW_STROKE_WIDTH}
              style={{ transition: FLOORPLAN_HOVER_TRANSITION }}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={path}
              fill="none"
              pointerEvents="none"
              stroke={stroke}
              strokeDasharray={circle.construction ? '0.16 0.1' : undefined}
              strokeLinecap="round"
              strokeOpacity={isDeleteHovered ? 0.92 : baseOpacity}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
            {showDimension && (
              <g
                className="sketch-dimension"
                onClick={
                  canSelectSketchCircles
                    ? (event) => {
                        event.stopPropagation()
                        onSketchCircleDimensionClick(circle, event)
                      }
                    : undefined
                }
                onDoubleClick={
                  canSelectSketchCircles
                    ? (event) => {
                        event.stopPropagation()
                        onSketchCircleDimensionDoubleClick(circle, event)
                      }
                    : undefined
                }
                style={
                  canSelectSketchCircles
                    ? { cursor: EDITOR_CURSOR, userSelect: 'none' }
                    : { userSelect: 'none' }
                }
              >
                <SketchDimensionLine
                  opacity={dimensionOpacity}
                  outlineOpacity={dimensionOutlineOpacity}
                  palette={palette}
                  segment={dimensionLineStart}
                />
                <SketchDimensionLine
                  opacity={dimensionOpacity}
                  outlineOpacity={dimensionOutlineOpacity}
                  palette={palette}
                  segment={dimensionLineEnd}
                />
                {canSelectSketchCircles && (
                  <>
                    <SketchDimensionHitLine segment={dimensionLineStart} />
                    <SketchDimensionHitLine segment={dimensionLineEnd} />
                  </>
                )}
                <text
                  dominantBaseline="central"
                  fill={palette.measurementStroke}
                  fillOpacity={dimensionOpacity}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
                  fontWeight="600"
                  paintOrder="stroke"
                  pointerEvents={canSelectSketchCircles ? 'all' : 'none'}
                  stroke={palette.surface}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={dimensionOutlineOpacity}
                  strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
                  textAnchor="middle"
                  x={label.x}
                  y={label.y - 0.04}
                >
                  {(() => {
                    const text = `${getSketchCircleDisplayedDimensionPrefix(circle)} ${formatMeasurement(
                      getSketchCircleDisplayedDimensionValue({ circle }),
                      unit,
                    )}`
                    return dimensionMode === 'reference' ? `(${text})` : text
                  })()}
                </text>
              </g>
            )}
            {showDimensionAnchors ? (
              <SketchDimensionAnchorHandle
                active={isActiveSketchDimensionAnchor(
                  activeDimensionAnchor,
                  getSketchDimensionCircleCenterReference(circle),
                )}
                onClick={
                  canSelectSketchCircles && onSketchCircleCenterDimensionClick
                    ? (event) => {
                        event.stopPropagation()
                        onSketchCircleCenterDimensionClick(circle, event)
                      }
                    : undefined
                }
                palette={palette}
                point={center}
              />
            ) : shouldShowSketchRelations ? (
              <circle
                cx={center.x}
                cy={center.y}
                fill={palette.surface}
                fillOpacity={0.94}
                pointerEvents="none"
                r={FLOORPLAN_SKETCH_COINCIDENT_HANDLE_RADIUS * 0.78}
                stroke={palette.selectedStroke}
                strokeOpacity={0.72}
                strokeWidth={FLOORPLAN_SKETCH_COINCIDENT_HANDLE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {relationBadges.map((badge, index) => {
              const width = getSketchRelationBadgeWidth(badge.label)
              const previousWidth = relationBadges
                .slice(0, index)
                .reduce(
                  (total, current) =>
                    total +
                    getSketchRelationBadgeWidth(current.label) +
                    FLOORPLAN_SKETCH_RELATION_BADGE_GAP,
                  0,
                )
              const x = relationBadgeAnchor.x - relationBadgeTotalWidth / 2 + previousWidth
              const y = relationBadgeAnchor.y - FLOORPLAN_SKETCH_RELATION_BADGE_HEIGHT / 2

              return (
                <g key={`${circle.id}:relation:${badge.id}`} pointerEvents="none">
                  <rect
                    fill={palette.surface}
                    fillOpacity={0.92}
                    height={FLOORPLAN_SKETCH_RELATION_BADGE_HEIGHT}
                    rx={0.035}
                    stroke={palette.selectedStroke}
                    strokeOpacity={0.72}
                    strokeWidth={FLOORPLAN_SKETCH_RELATION_BADGE_STROKE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                    width={width}
                    x={x}
                    y={y}
                  />
                  <text
                    dominantBaseline="central"
                    fill={palette.selectedStroke}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                    fontSize={FLOORPLAN_SKETCH_RELATION_BADGE_FONT_SIZE}
                    fontWeight="700"
                    textAnchor="middle"
                    x={x + width / 2}
                    y={relationBadgeAnchor.y}
                  >
                    {badge.label}
                  </text>
                </g>
              )
            })}
            {canSelectSketchCircles && (
              <path
                d={path}
                fill="none"
                onClick={(event) => {
                  event.stopPropagation()
                  onSketchCircleClick(circle, event)
                }}
                pointerEvents="stroke"
                stroke="transparent"
                strokeLinecap="round"
                strokeWidth={FLOORPLAN_SKETCH_LINE_HIT_STROKE_WIDTH}
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

export const FloorplanSketchDistanceDimensionLayer = memo(function FloorplanSketchDistanceDimensionLayer({
  dimensions,
  isDeleteMode,
  onSketchDistanceDimensionClick,
  onSketchDistanceDimensionDoubleClick,
  palette,
  selectedIdSet,
  sketchCircles,
  sketchLines,
  unit,
}: {
  dimensions: SketchDimensionNode[]
  isDeleteMode: boolean
  onSketchDistanceDimensionClick?: (
    dimension: SketchDimensionNode,
    event: ReactMouseEvent<SVGGElement>,
  ) => void
  onSketchDistanceDimensionDoubleClick?: (
    dimension: SketchDimensionNode,
    event: ReactMouseEvent<SVGGElement>,
  ) => void
  palette: FloorplanSketchPalette
  selectedIdSet: ReadonlySet<string>
  sketchCircles: SketchCircleNode[]
  sketchLines: SketchLineNode[]
  unit: UnitSystem
}) {
  if (dimensions.length === 0) {
    return null
  }

  const linesById = new Map(sketchLines.map((line) => [line.id, line] as const))
  const circlesById = new Map(sketchCircles.map((circle) => [circle.id, circle] as const))

  return (
    <>
      {dimensions.map((dimension) => {
        const measurementResult = resolveSketchDistanceMeasurement({
          circlesById,
          dimension,
          linesById,
        })
        if (!measurementResult.ok) {
          return null
        }

        const { startPoint, endPoint, value: length } = measurementResult.measurement

        const start = toSvgPlanPoint(startPoint)
        const end = toSvgPlanPoint(endPoint)
        const planDx = endPoint[0] - startPoint[0]
        const planDy = endPoint[1] - startPoint[1]
        const normal = ([-planDy / length, planDx / length] as WallPlanPoint)
        const offset = dimension.offset ?? 0.42
        const extensionOffset =
          offset +
          (offset >= 0 ? 1 : -1) * FLOORPLAN_SKETCH_DIMENSION_EXTENSION_OVERSHOOT
        const labelPlanPoint: WallPlanPoint = [
          (startPoint[0] + endPoint[0]) / 2 + normal[0] * offset,
          (startPoint[1] + endPoint[1]) / 2 + normal[1] * offset,
        ]
        const dimensionStart = toSvgPlanPoint([
          startPoint[0] + normal[0] * offset,
          startPoint[1] + normal[1] * offset,
        ])
        const dimensionEnd = toSvgPlanPoint([
          endPoint[0] + normal[0] * offset,
          endPoint[1] + normal[1] * offset,
        ])
        const extensionStartEnd = toSvgPlanPoint([
          startPoint[0] + normal[0] * extensionOffset,
          startPoint[1] + normal[1] * extensionOffset,
        ])
        const extensionEndEnd = toSvgPlanPoint([
          endPoint[0] + normal[0] * extensionOffset,
          endPoint[1] + normal[1] * extensionOffset,
        ])
        const extensionStart = {
          x1: start.x,
          y1: start.y,
          x2: extensionStartEnd.x,
          y2: extensionStartEnd.y,
        }
        const extensionEnd = {
          x1: end.x,
          y1: end.y,
          x2: extensionEndEnd.x,
          y2: extensionEndEnd.y,
        }
        const label = toSvgPlanPoint(labelPlanPoint)
        const svgDx = dimensionEnd.x - dimensionStart.x
        const svgDy = dimensionEnd.y - dimensionStart.y
        const svgLength = Math.hypot(svgDx, svgDy)
        const dirSvgX = svgLength > 1e-6 ? svgDx / svgLength : 1
        const dirSvgY = svgLength > 1e-6 ? svgDy / svgLength : 0
        let labelAngle = (Math.atan2(svgDy, svgDx) * 180) / Math.PI
        if (labelAngle > 90) {
          labelAngle -= 180
        } else if (labelAngle <= -90) {
          labelAngle += 180
        }
        const labelGapHalf = Math.min(
          FLOORPLAN_SKETCH_DIMENSION_LABEL_GAP / 2,
          Math.max(0, svgLength / 2 - FLOORPLAN_SKETCH_DIMENSION_LABEL_LINE_PADDING),
        )
        const dimensionLineStart = {
          x1: dimensionStart.x,
          y1: dimensionStart.y,
          x2: label.x - dirSvgX * labelGapHalf,
          y2: label.y - dirSvgY * labelGapHalf,
        }
        const dimensionLineEnd = {
          x1: label.x + dirSvgX * labelGapHalf,
          y1: label.y + dirSvgY * labelGapHalf,
          x2: dimensionEnd.x,
          y2: dimensionEnd.y,
        }
        const isSelected = selectedIdSet.has(dimension.id)
        const canSelectDimensions = Boolean(
          onSketchDistanceDimensionClick || onSketchDistanceDimensionDoubleClick,
        )
        const strokePalette = isDeleteMode
          ? { ...palette, measurementStroke: palette.deleteStroke }
          : isSelected
            ? { ...palette, measurementStroke: palette.selectedStroke }
            : palette
        const dimensionOpacity = isSelected ? 0.96 : 0.82
        const dimensionOutlineOpacity = isSelected ? 0.98 : 0.92

        return (
          <g
            className="sketch-distance-dimension"
            key={dimension.id}
            onClick={
              canSelectDimensions
                ? (event) => {
                    event.stopPropagation()
                    onSketchDistanceDimensionClick?.(dimension, event)
                  }
                : undefined
            }
            onDoubleClick={
              canSelectDimensions
                ? (event) => {
                    event.stopPropagation()
                    onSketchDistanceDimensionDoubleClick?.(dimension, event)
                  }
                : undefined
            }
            style={
              canSelectDimensions
                ? { cursor: EDITOR_CURSOR, userSelect: 'none' }
                : { userSelect: 'none' }
            }
          >
            <SketchDimensionLine
              opacity={dimensionOpacity}
              outlineOpacity={dimensionOutlineOpacity}
              palette={strokePalette}
              segment={extensionStart}
            />
            <SketchDimensionLine
              opacity={dimensionOpacity}
              outlineOpacity={dimensionOutlineOpacity}
              palette={strokePalette}
              segment={dimensionLineStart}
            />
            <SketchDimensionLine
              opacity={dimensionOpacity}
              outlineOpacity={dimensionOutlineOpacity}
              palette={strokePalette}
              segment={dimensionLineEnd}
            />
            <SketchDimensionLine
              opacity={dimensionOpacity}
              outlineOpacity={dimensionOutlineOpacity}
              palette={strokePalette}
              segment={extensionEnd}
            />
            {canSelectDimensions ? (
              <>
                <SketchDimensionHitLine segment={extensionStart} />
                <SketchDimensionHitLine segment={dimensionLineStart} />
                <SketchDimensionHitLine segment={dimensionLineEnd} />
                <SketchDimensionHitLine segment={extensionEnd} />
              </>
            ) : null}
            <text
              dominantBaseline="central"
              fill={strokePalette.measurementStroke}
              fillOpacity={dimensionOpacity}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
              fontSize={FLOORPLAN_MEASUREMENT_LABEL_FONT_SIZE}
              fontWeight="600"
              paintOrder="stroke"
              pointerEvents={canSelectDimensions ? 'all' : 'none'}
              stroke={palette.surface}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={dimensionOutlineOpacity}
              strokeWidth={FLOORPLAN_MEASUREMENT_LABEL_STROKE_WIDTH}
              textAnchor="middle"
              transform={`rotate(${labelAngle} ${label.x} ${label.y}) translate(0, -0.04)`}
              x={label.x}
              y={label.y}
            >
              {dimension.mode === 'reference'
                ? `(${formatMeasurement(length, unit)})`
                : formatMeasurement(length, unit)}
            </text>
          </g>
        )
      })}
    </>
  )
})

export const FloorplanSketchProfileLayer = memo(function FloorplanSketchProfileLayer({
  highlightedIdSet,
  profiles,
  selectedProfile,
  palette,
}: {
  highlightedIdSet: ReadonlySet<string>
  profiles: SketchProfile[]
  selectedProfile: SketchProfile | null
  palette: FloorplanSketchPalette
}) {
  if (profiles.length === 0) {
    return null
  }

  return (
    <>
      {profiles.map((profile) => {
        const isSelected =
          selectedProfile?.lineIds.length === profile.lineIds.length &&
          selectedProfile.lineIds.every((lineId) => profile.lineIds.includes(lineId))
        const isHighlighted =
          isSelected || profile.lineIds.some((lineId) => highlightedIdSet.has(lineId))
        if (!isHighlighted) {
          return null
        }

        return (
          <polygon
            fill={palette.selectedFill}
            fillOpacity={isSelected ? 0.16 : 0.08}
            key={`sketch-profile:${profile.lineIds.join(':')}`}
            pointerEvents="none"
            points={formatPolygonPoints(profile.points.map(toPoint2D))}
            stroke={palette.selectedStroke}
            strokeDasharray="0.18 0.1"
            strokeOpacity={isSelected ? 0.74 : 0.42}
            strokeWidth="0.055"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </>
  )
})

export const FloorplanSketchEditLayer = memo(function FloorplanSketchEditLayer({
  canEditSketchLines,
  editDraft,
  onSketchLineEditPointerDown,
  palette,
  selectedSketchLines,
}: {
  canEditSketchLines: boolean
  editDraft: SketchLineEditDraft | null
  onSketchLineEditPointerDown: (
    line: SketchLineNode,
    mode: SketchLineEditMode,
    event: ReactPointerEvent<SVGElement>,
  ) => void
  palette: FloorplanSketchPalette
  selectedSketchLines: SketchLineNode[]
}) {
  if (!(canEditSketchLines && selectedSketchLines.length > 0)) {
    return null
  }

  return (
    <>
      {selectedSketchLines.map((line) => {
        if (line.visible === false || getSketchLineLength2D(line) <= 1e-6) {
          return null
        }

        const start = toSvgPlanPoint(line.start)
        const end = toSvgPlanPoint(line.end)
        const linePath = getSketchLineSvgPath(line)
        const midpointHandlePoint = getSketchLineMidpointHandlePoint(line)
        const midpoint = toSvgPoint(midpointHandlePoint)
        const isFixed = (line.relations ?? []).includes('fixed')
        const cursor = isFixed ? 'not-allowed' : 'move'
        const isEditingThisLine = editDraft?.lineId === line.id

        return (
          <g key={`sketch-edit:${line.id}`}>
            <path
              d={linePath}
              fill="none"
              onPointerDown={(event) => onSketchLineEditPointerDown(line, 'line', event)}
              pointerEvents="stroke"
              stroke="transparent"
              strokeLinecap="round"
              strokeWidth={FLOORPLAN_SKETCH_LINE_HIT_STROKE_WIDTH}
              style={{ cursor }}
              vectorEffect="non-scaling-stroke"
            />
            {(['start', 'end'] as const).map((mode) => {
              const point = mode === 'start' ? start : end
              const isActive = isEditingThisLine && editDraft?.mode === mode
              return (
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill={isActive ? palette.selectedStroke : palette.surface}
                  key={`${line.id}:${mode}`}
                  onPointerDown={(event) => onSketchLineEditPointerDown(line, mode, event)}
                  pointerEvents="all"
                  r={FLOORPLAN_SKETCH_EDIT_HANDLE_RADIUS}
                  stroke={isActive ? palette.surface : palette.selectedStroke}
                  strokeOpacity={isFixed ? 0.48 : 0.94}
                  strokeWidth={FLOORPLAN_SKETCH_EDIT_HANDLE_STROKE_WIDTH}
                  style={{ cursor: isFixed ? 'not-allowed' : EDITOR_CURSOR }}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            <circle
              cx={midpoint.x}
              cy={midpoint.y}
              fill={
                isEditingThisLine && editDraft?.mode === 'curve'
                  ? palette.selectedStroke
                  : palette.surface
              }
              onPointerDown={(event) => onSketchLineEditPointerDown(line, 'curve', event)}
              pointerEvents="all"
              r={FLOORPLAN_SKETCH_EDIT_HANDLE_RADIUS * 0.92}
              stroke={
                isEditingThisLine && editDraft?.mode === 'curve'
                  ? palette.surface
                  : palette.selectedStroke
              }
              strokeOpacity={isFixed ? 0.48 : 0.94}
              strokeWidth={FLOORPLAN_SKETCH_EDIT_HANDLE_STROKE_WIDTH}
              style={{ cursor: isFixed ? 'not-allowed' : EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </>
  )
})
