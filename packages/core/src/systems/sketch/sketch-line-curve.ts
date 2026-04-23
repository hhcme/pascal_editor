import type { SketchLineNode } from '../../schema'
import type { Point2D } from '../wall/wall-mitering'

const CURVE_EPSILON = 1e-6
const DEFAULT_SAMPLE_SEGMENTS = 24

type SketchLineCurveLike = Pick<SketchLineNode, 'start' | 'end' | 'curveOffset'>

type CurveFrame = {
  point: Point2D
  tangent: Point2D
  normal: Point2D
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function distance(a: Point2D, b: Point2D) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function getSketchLineStartPoint(line: SketchLineCurveLike): Point2D {
  return { x: line.start[0], y: line.start[1] }
}

export function getSketchLineEndPoint(line: SketchLineCurveLike): Point2D {
  return { x: line.end[0], y: line.end[1] }
}

export function getSketchLineChordLength(line: SketchLineCurveLike) {
  return distance(getSketchLineStartPoint(line), getSketchLineEndPoint(line))
}

export function getMaxSketchLineCurveOffset(line: SketchLineCurveLike) {
  return getSketchLineChordLength(line) / 2
}

export function getSketchLineStraightSnapOffset(line: SketchLineCurveLike) {
  return Math.min(0.03, Math.max(0.005, getSketchLineChordLength(line) * 0.005))
}

function clampCurveOffset(line: SketchLineCurveLike, offset: number) {
  const maxOffset = getMaxSketchLineCurveOffset(line)
  if (!Number.isFinite(maxOffset) || maxOffset < CURVE_EPSILON) {
    return 0
  }

  return Math.max(-maxOffset, Math.min(maxOffset, offset))
}

export function normalizeSketchLineCurveOffset(line: SketchLineCurveLike, offset: number) {
  const clamped = clampCurveOffset(line, offset)
  return Math.abs(clamped) <= getSketchLineStraightSnapOffset(line) ? 0 : clamped
}

export function getClampedSketchLineCurveOffset(line: SketchLineCurveLike) {
  const value = line.curveOffset ?? 0
  const normalized = normalizeSketchLineCurveOffset(line, value)
  return Math.abs(normalized) > CURVE_EPSILON ? normalized : 0
}

export function isCurvedSketchLine(line: SketchLineCurveLike) {
  return Math.abs(getClampedSketchLineCurveOffset(line)) > CURVE_EPSILON
}

export function getSketchLineChordFrame(line: SketchLineCurveLike) {
  const start = getSketchLineStartPoint(line)
  const end = getSketchLineEndPoint(line)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)

  if (length < CURVE_EPSILON) {
    return {
      start,
      end,
      midpoint: start,
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      length: 0,
    }
  }

  return {
    start,
    end,
    midpoint: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    },
    tangent: { x: dx / length, y: dy / length },
    normal: { x: -dy / length, y: dx / length },
    length,
  }
}

function getSketchLineArcData(line: SketchLineCurveLike) {
  const chord = getSketchLineChordFrame(line)
  const sagitta = getClampedSketchLineCurveOffset(line)

  if (Math.abs(sagitta) <= CURVE_EPSILON || chord.length < CURVE_EPSILON) {
    return null
  }

  const absSagitta = Math.abs(sagitta)
  const radius = chord.length * chord.length / (8 * absSagitta) + absSagitta / 2
  const centerOffset = radius - absSagitta
  const direction = Math.sign(sagitta) || 1
  const center = {
    x: chord.midpoint.x + chord.normal.x * centerOffset * direction,
    y: chord.midpoint.y + chord.normal.y * centerOffset * direction,
  }
  const startAngle = Math.atan2(chord.start.y - center.y, chord.start.x - center.x)
  const endAngle = Math.atan2(chord.end.y - center.y, chord.end.x - center.x)

  let delta = endAngle - startAngle
  if (direction > 0) {
    while (delta <= 0) delta += Math.PI * 2
  } else {
    while (delta >= 0) delta -= Math.PI * 2
  }

  return { center, radius, startAngle, delta, direction }
}

export function getSketchLineCurveFrameAt(line: SketchLineCurveLike, t: number): CurveFrame {
  const chord = getSketchLineChordFrame(line)
  if (!isCurvedSketchLine(line) || chord.length < CURVE_EPSILON) {
    return {
      point: {
        x: lerp(chord.start.x, chord.end.x, clamp01(t)),
        y: lerp(chord.start.y, chord.end.y, clamp01(t)),
      },
      tangent: chord.tangent,
      normal: chord.normal,
    }
  }

  const arc = getSketchLineArcData(line)
  if (!arc) {
    return {
      point: chord.midpoint,
      tangent: chord.tangent,
      normal: chord.normal,
    }
  }

  const angle = arc.startAngle + arc.delta * clamp01(t)
  const point = {
    x: arc.center.x + Math.cos(angle) * arc.radius,
    y: arc.center.y + Math.sin(angle) * arc.radius,
  }
  const tangent =
    arc.direction > 0
      ? { x: -Math.sin(angle), y: Math.cos(angle) }
      : { x: Math.sin(angle), y: -Math.cos(angle) }

  return {
    point,
    tangent,
    normal: {
      x: -tangent.y,
      y: tangent.x,
    },
  }
}

export function getSketchLineMidpointHandlePoint(line: SketchLineCurveLike) {
  return getSketchLineCurveFrameAt(line, 0.5).point
}

export function sampleSketchLineCenterline(
  line: SketchLineCurveLike,
  segments = DEFAULT_SAMPLE_SEGMENTS,
) {
  const count = Math.max(1, segments)
  return Array.from({ length: count + 1 }, (_, index) =>
    getSketchLineCurveFrameAt(line, index / count).point,
  )
}

export function getSketchLineCurveLength(
  line: SketchLineCurveLike,
  segments = DEFAULT_SAMPLE_SEGMENTS,
) {
  const points = sampleSketchLineCenterline(line, segments)
  let totalLength = 0

  for (let index = 1; index < points.length; index += 1) {
    totalLength += distance(points[index - 1]!, points[index]!)
  }

  return totalLength
}
