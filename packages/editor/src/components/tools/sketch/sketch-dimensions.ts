import { getSketchCirclePathLength, type SketchCircleNode, type SketchLineNode } from '@pascal-app/core'

export type SketchDimensionMode = 'driven' | 'reference'
export type SketchCircleDimensionDisplay = 'radius' | 'diameter' | 'arc-length'

type SketchPlanPoint = [number, number]
const FULL_CIRCLE_RADIANS = Math.PI * 2

function getLineLength(start: SketchPlanPoint, end: SketchPlanPoint) {
  return Math.hypot(end[0] - start[0], end[1] - start[1])
}

function normalizeAngle(angle: number) {
  const normalized = angle % FULL_CIRCLE_RADIANS
  return normalized < 0 ? normalized + FULL_CIRCLE_RADIANS : normalized
}

function getLineAngleRadians(start: SketchPlanPoint, end: SketchPlanPoint) {
  return normalizeAngle(Math.atan2(end[1] - start[1], end[0] - start[0]))
}

export function hasSketchLineLengthDimension(
  line: Pick<SketchLineNode, 'dimensions'>,
): boolean {
  return line.dimensions?.length !== undefined
}

export function hasSketchLineAngleDimension(
  line: Pick<SketchLineNode, 'dimensions'>,
): boolean {
  return line.dimensions?.angle !== undefined
}

export function hasSketchCircleRadiusDimension(
  circle: Pick<SketchCircleNode, 'dimensions'>,
): boolean {
  return circle.dimensions?.radius !== undefined
}

export function hasSketchCircleArcLengthDimension(
  circle: Pick<SketchCircleNode, 'dimensions'>,
): boolean {
  return circle.dimensions?.arcLength !== undefined
}

export function hasSketchCircleAnyDimension(
  circle: Pick<SketchCircleNode, 'dimensions'>,
): boolean {
  return hasSketchCircleRadiusDimension(circle) || hasSketchCircleArcLengthDimension(circle)
}

export function getSketchLineLengthDimensionMode(
  line: Pick<SketchLineNode, 'dimensions'>,
): SketchDimensionMode | null {
  if (!hasSketchLineLengthDimension(line)) {
    return null
  }

  return line.dimensions?.lengthMode ?? 'driven'
}

export function getSketchLineAngleDimensionMode(
  line: Pick<SketchLineNode, 'dimensions'>,
): SketchDimensionMode | null {
  if (!hasSketchLineAngleDimension(line)) {
    return null
  }

  return line.dimensions?.angleMode ?? 'driven'
}

export function getSketchCircleRadiusDimensionMode(
  circle: Pick<SketchCircleNode, 'dimensions'>,
): SketchDimensionMode | null {
  if (!hasSketchCircleRadiusDimension(circle)) {
    return null
  }

  return circle.dimensions?.radiusMode ?? 'driven'
}

export function getSketchCircleArcLengthDimensionMode(
  circle: Pick<SketchCircleNode, 'dimensions'>,
): SketchDimensionMode | null {
  if (!hasSketchCircleArcLengthDimension(circle)) {
    return null
  }

  return circle.dimensions?.arcLengthMode ?? 'driven'
}

export function getSketchCircleDimensionDisplay(
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>,
): SketchCircleDimensionDisplay {
  if (circle.kind === 'arc') {
    return circle.dimensions?.radiusDisplay === 'arc-length' ? 'arc-length' : 'radius'
  }

  return circle.dimensions?.radiusDisplay === 'diameter' ? 'diameter' : 'radius'
}

export function getSketchCircleDisplayedDimensionMode(
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>,
): SketchDimensionMode | null {
  return getSketchCircleDimensionDisplay(circle) === 'arc-length'
    ? getSketchCircleArcLengthDimensionMode(circle)
    : getSketchCircleRadiusDimensionMode(circle)
}

export function isSketchLineLengthDriven(
  line: Pick<SketchLineNode, 'dimensions'>,
): boolean {
  return getSketchLineLengthDimensionMode(line) === 'driven'
}

export function isSketchLineAngleDriven(
  line: Pick<SketchLineNode, 'dimensions'>,
): boolean {
  return getSketchLineAngleDimensionMode(line) === 'driven'
}

export function isSketchCircleRadiusDriven(
  circle: Pick<SketchCircleNode, 'dimensions'>,
): boolean {
  return getSketchCircleRadiusDimensionMode(circle) === 'driven'
}

export function isSketchCircleArcLengthDriven(
  circle: Pick<SketchCircleNode, 'dimensions'>,
): boolean {
  return getSketchCircleArcLengthDimensionMode(circle) === 'driven'
}

export function isSketchCircleDisplayedDimensionDriven(
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>,
): boolean {
  return getSketchCircleDisplayedDimensionMode(circle) === 'driven'
}

export function buildSketchLineLengthDimensionData(args: {
  line: Pick<SketchLineNode, 'dimensions'>
  length: number
  mode: SketchDimensionMode
}): SketchLineNode['dimensions'] {
  const { line, length, mode } = args
  return {
    ...(line.dimensions ?? {}),
    length,
    lengthMode: mode,
  }
}

export function buildSketchLineAngleDimensionData(args: {
  line: Pick<SketchLineNode, 'dimensions'>
  angle: number
  mode: SketchDimensionMode
}): SketchLineNode['dimensions'] {
  const { line, angle, mode } = args
  return {
    ...(line.dimensions ?? {}),
    angle: normalizeAngle(angle),
    angleMode: mode,
  }
}

export function buildSketchCircleRadiusDimensionData(args: {
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>
  radius: number
  mode: SketchDimensionMode
  display?: SketchCircleDimensionDisplay
}): SketchCircleNode['dimensions'] {
  const { circle, radius, mode } = args
  const next = { ...(circle.dimensions ?? {}) }
  delete next.arcLength
  delete next.arcLengthMode
  return {
    ...next,
    radius,
    radiusMode: mode,
    radiusDisplay:
      args.display ??
      (circle.kind === 'circle' && getSketchCircleDimensionDisplay(circle) === 'diameter'
        ? 'diameter'
        : 'radius'),
  }
}

export function buildSketchCircleArcLengthDimensionData(args: {
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>
  arcLength: number
  mode: SketchDimensionMode
}): SketchCircleNode['dimensions'] {
  const { circle, arcLength, mode } = args
  const next = { ...(circle.dimensions ?? {}) }
  delete next.radius
  delete next.radiusMode
  return {
    ...next,
    arcLength,
    arcLengthMode: mode,
    radiusDisplay: circle.kind === 'arc' ? 'arc-length' : getSketchCircleDimensionDisplay(circle),
  }
}

export function clearSketchLineLengthDimensionData(
  line: Pick<SketchLineNode, 'dimensions'>,
): SketchLineNode['dimensions'] {
  const next = { ...(line.dimensions ?? {}) }
  delete next.length
  delete next.lengthMode
  return next
}

export function clearSketchLineAngleDimensionData(
  line: Pick<SketchLineNode, 'dimensions'>,
): SketchLineNode['dimensions'] {
  const next = { ...(line.dimensions ?? {}) }
  delete next.angle
  delete next.angleMode
  return next
}

export function clearSketchCircleRadiusDimensionData(
  circle: Pick<SketchCircleNode, 'dimensions'>,
): SketchCircleNode['dimensions'] {
  const next = { ...(circle.dimensions ?? {}) }
  delete next.radius
  delete next.radiusMode
  delete next.arcLength
  delete next.arcLengthMode
  return next
}

export function clearSketchCircleDisplayedDimensionData(
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>,
): SketchCircleNode['dimensions'] {
  if (getSketchCircleDimensionDisplay(circle) === 'arc-length') {
    const next = { ...(circle.dimensions ?? {}) }
    delete next.arcLength
    delete next.arcLengthMode
    return next
  }

  const next = { ...(circle.dimensions ?? {}) }
  delete next.radius
  delete next.radiusMode
  return next
}

export function getSketchCircleDisplayedDimensionValue(args: {
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions' | 'radius' | 'startAngle' | 'endAngle' | 'center'>
  radius?: number
  startAngle?: number
  endAngle?: number
}): number {
  const { circle } = args
  const display = getSketchCircleDimensionDisplay(circle)
  const radius = args.radius ?? circle.radius
  const startAngle = args.startAngle ?? circle.startAngle
  const endAngle = args.endAngle ?? circle.endAngle

  if (display === 'arc-length') {
    return circle.dimensions?.arcLength ?? getSketchCirclePathLength({ ...circle, radius, startAngle, endAngle })
  }

  const measuredRadius = circle.dimensions?.radius ?? radius
  return display === 'diameter' ? measuredRadius * 2 : measuredRadius
}

export function getSketchCircleDisplayedDimensionLabel(
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>,
): '半径' | '直径' | '弧长' {
  const display = getSketchCircleDimensionDisplay(circle)
  if (display === 'diameter') {
    return '直径'
  }
  if (display === 'arc-length') {
    return '弧长'
  }
  return '半径'
}

export function getSketchCircleDisplayedDimensionPrefix(
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>,
): 'R' | 'D' | 'L' {
  const display = getSketchCircleDimensionDisplay(circle)
  if (display === 'diameter') {
    return 'D'
  }
  if (display === 'arc-length') {
    return 'L'
  }
  return 'R'
}

export function toSketchCircleRadiusFromDisplayedValue(args: {
  circle: Pick<SketchCircleNode, 'kind' | 'dimensions'>
  value: number
}): number {
  return getSketchCircleDimensionDisplay(args.circle) === 'diameter' ? args.value / 2 : args.value
}

export function getSketchLineDisplayedAngleRadians(
  line: Pick<SketchLineNode, 'start' | 'end' | 'dimensions'>,
): number {
  return line.dimensions?.angle ?? getLineAngleRadians(line.start, line.end)
}

export function getSketchLineDisplayedAngleDegrees(
  line: Pick<SketchLineNode, 'start' | 'end' | 'dimensions'>,
): number {
  return (getSketchLineDisplayedAngleRadians(line) * 180) / Math.PI
}

export function buildSketchLineGeometryDimensionData(args: {
  line: Pick<SketchLineNode, 'start' | 'end' | 'dimensions'>
  start?: SketchPlanPoint
  end?: SketchPlanPoint
  preserveDriven?: boolean
}): SketchLineNode['dimensions'] | undefined {
  const { line, preserveDriven = false } = args
  const start = args.start ?? line.start
  const end = args.end ?? line.end
  const lengthMode = getSketchLineLengthDimensionMode(line)
  const angleMode = getSketchLineAngleDimensionMode(line)

  if (!(lengthMode || angleMode)) {
    return line.dimensions
  }

  const next = { ...(line.dimensions ?? {}) }
  if (lengthMode) {
    if (lengthMode === 'driven' && !preserveDriven) {
      delete next.length
      delete next.lengthMode
    } else {
      next.length = getLineLength(start, end)
      next.lengthMode = lengthMode
    }
  }

  if (angleMode) {
    if (angleMode === 'driven' && !preserveDriven) {
      delete next.angle
      delete next.angleMode
    } else {
      next.angle = getLineAngleRadians(start, end)
      next.angleMode = angleMode
    }
  }

  return next
}

export function buildSketchCircleGeometryDimensionData(args: {
  circle: Pick<
    SketchCircleNode,
    'center' | 'dimensions' | 'endAngle' | 'kind' | 'radius' | 'startAngle'
  >
  radius?: number
  startAngle?: number
  endAngle?: number
  preserveDriven?: boolean
}): SketchCircleNode['dimensions'] | undefined {
  const { circle, preserveDriven = false } = args
  const display = getSketchCircleDimensionDisplay(circle)

  if (display === 'arc-length') {
    const mode = getSketchCircleArcLengthDimensionMode(circle)
    if (!mode) {
      return circle.dimensions
    }

    if (mode === 'driven' && !preserveDriven) {
      return clearSketchCircleDisplayedDimensionData(circle)
    }

    return buildSketchCircleArcLengthDimensionData({
      circle,
      arcLength: getSketchCircleDisplayedDimensionValue({
        circle: {
          ...circle,
          radius: args.radius ?? circle.radius,
          startAngle: args.startAngle ?? circle.startAngle,
          endAngle: args.endAngle ?? circle.endAngle,
        },
      }),
      mode,
    })
  }

  const mode = getSketchCircleRadiusDimensionMode(circle)
  if (!mode) {
    return circle.dimensions
  }

  if (mode === 'driven' && !preserveDriven) {
    return clearSketchCircleDisplayedDimensionData(circle)
  }

  return buildSketchCircleRadiusDimensionData({
    circle,
    radius: args.radius ?? circle.radius,
    mode,
    display,
  })
}
