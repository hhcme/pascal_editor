'use client'

import {
  getSketchLineMidpointHandlePoint,
  sampleSketchCircleCenterline,
  sampleSketchLineCenterline,
  type Point2D,
  type SketchCircleNode,
  type SketchLineNode,
} from '@pascal-app/core'
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  getSketchLineLength2D,
  getSketchLinePathLength2D,
  type SketchProfile,
} from '../../tools/sketch/sketch-geometry'
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
const FLOORPLAN_SKETCH_RELATION_BADGE_OFFSET = 0.24
const FLOORPLAN_SKETCH_RELATION_BADGE_WIDTH = 0.28
const FLOORPLAN_SKETCH_RELATION_BADGE_HEIGHT = 0.2
const FLOORPLAN_SKETCH_RELATION_BADGE_GAP = 0.06
const FLOORPLAN_SKETCH_RELATION_BADGE_FONT_SIZE = 0.105
const FLOORPLAN_SKETCH_RELATION_BADGE_STROKE_WIDTH = 0.025
const FLOORPLAN_SKETCH_COINCIDENT_HANDLE_RADIUS = 0.09
const FLOORPLAN_SKETCH_COINCIDENT_HANDLE_INNER_RADIUS = 0.032
const FLOORPLAN_SKETCH_COINCIDENT_HANDLE_STROKE_WIDTH = 0.035
const FLOORPLAN_SKETCH_EDIT_HANDLE_RADIUS = 0.13
const FLOORPLAN_SKETCH_EDIT_HANDLE_STROKE_WIDTH = 0.045

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

function pointsCoincident(a: WallPlanPoint, b: WallPlanPoint) {
  return Math.abs(a[0] - b[0]) <= 1e-4 && Math.abs(a[1] - b[1]) <= 1e-4
}

function getSketchEndpointPoint(line: SketchLineNode, endpoint: 'start' | 'end') {
  return endpoint === 'start' ? line.start : line.end
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
      if (linked?.lineId === line.id && linked.endpoint === endpoint) {
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

  if (relations.includes('horizontal')) {
    badges.push({ id: 'horizontal', label: 'H' })
  }
  if (relations.includes('vertical')) {
    badges.push({ id: 'vertical', label: 'V' })
  }
  if (relations.includes('fixed')) {
    badges.push({ id: 'fixed', label: 'F' })
  }
  if (line.construction) {
    badges.push({ id: 'reference', label: 'R' })
  }

  return badges
}

export const FloorplanSketchLayer = memo(function FloorplanSketchLayer({
  canSelectSketchLines,
  highlightedIdSet,
  hoveredSketchLineId,
  isDeleteMode,
  onSketchLineClick,
  onSketchLineDimensionClick,
  onSketchLineDimensionDoubleClick,
  onSketchLineHoverChange,
  palette,
  selectedIdSet,
  sketchLines,
  unit,
}: {
  canSelectSketchLines: boolean
  highlightedIdSet: ReadonlySet<string>
  hoveredSketchLineId: SketchLineNode['id'] | null
  isDeleteMode: boolean
  onSketchLineClick: (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => void
  onSketchLineDimensionClick: (line: SketchLineNode, event: ReactMouseEvent<SVGElement>) => void
  onSketchLineDimensionDoubleClick: (
    line: SketchLineNode,
    event: ReactMouseEvent<SVGElement>,
  ) => void
  onSketchLineHoverChange: (lineId: SketchLineNode['id'] | null) => void
  palette: FloorplanSketchPalette
  selectedIdSet: ReadonlySet<string>
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
        const showDimension =
          chordLength > 1e-6 &&
          (!line.construction || Boolean(line.dimensions?.length) || isSelected || isHighlighted)
        const start = toSvgPlanPoint(line.start)
        const end = toSvgPlanPoint(line.end)
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
        const stroke = isDeleteHovered
          ? palette.deleteStroke
          : isSelected || isHighlighted
            ? palette.selectedStroke
            : line.construction
              ? palette.measurementStroke
              : palette.draftStroke
        const baseOpacity = line.construction ? 0.58 : 0.86
        const shouldShowSketchRelations = isSelected || isHighlighted || isHovered
        const relationBadges = shouldShowSketchRelations ? getSketchRelationBadges(line) : []
        const relationBadgeTotalWidth =
          relationBadges.length * FLOORPLAN_SKETCH_RELATION_BADGE_WIDTH +
          Math.max(0, relationBadges.length - 1) * FLOORPLAN_SKETCH_RELATION_BADGE_GAP
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
                  {formatMeasurement(line.dimensions?.length ?? length, unit)}
                </text>
              </g>
            )}
            {relationBadges.map((badge, index) => {
              const x =
                relationBadgeAnchor.x -
                relationBadgeTotalWidth / 2 +
                index *
                  (FLOORPLAN_SKETCH_RELATION_BADGE_WIDTH + FLOORPLAN_SKETCH_RELATION_BADGE_GAP)
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
                    width={FLOORPLAN_SKETCH_RELATION_BADGE_WIDTH}
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
                    x={x + FLOORPLAN_SKETCH_RELATION_BADGE_WIDTH / 2}
                    y={relationBadgeAnchor.y}
                  >
                    {badge.label}
                  </text>
                </g>
              )
            })}
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
  canSelectSketchCircles,
  highlightedIdSet,
  hoveredSketchCircleId,
  isDeleteMode,
  onSketchCircleClick,
  onSketchCircleHoverChange,
  palette,
  selectedIdSet,
  sketchCircles,
}: {
  canSelectSketchCircles: boolean
  highlightedIdSet: ReadonlySet<string>
  hoveredSketchCircleId: SketchCircleNode['id'] | null
  isDeleteMode: boolean
  onSketchCircleClick: (circle: SketchCircleNode, event: ReactMouseEvent<SVGElement>) => void
  onSketchCircleHoverChange: (circleId: SketchCircleNode['id'] | null) => void
  palette: FloorplanSketchPalette
  selectedIdSet: ReadonlySet<string>
  sketchCircles: SketchCircleNode[]
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
        const center = toSvgPlanPoint(circle.center)

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
            {(isSelected || isHighlighted || isHovered) && (
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
            )}
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
              fill={isEditingThisLine && editDraft?.mode === 'curve' ? palette.selectedStroke : palette.surface}
              onPointerDown={(event) => onSketchLineEditPointerDown(line, 'curve', event)}
              pointerEvents="all"
              r={FLOORPLAN_SKETCH_EDIT_HANDLE_RADIUS * 0.92}
              stroke={isEditingThisLine && editDraft?.mode === 'curve' ? palette.surface : palette.selectedStroke}
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
