'use client'

import {
  type AnyNodeId,
  DoorNode,
  type GuideNode,
  loadAssetUrl,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import type {
  GuideDetectionCandidates,
  GuideDetectionOpeningCandidate,
  GuideDetectionWallCandidate,
} from '../store/use-delivery'

type WallNodeId = Extract<AnyNodeId, `wall_${string}`>

const GUIDE_BASE_WIDTH = 10
const DARK_THRESHOLD = 170
const MAX_DARK_THRESHOLD = 224
const MIN_WALL_LENGTH_PX = 18
const MIN_WALL_THICKNESS_PX = 3
const MIN_GAP_LENGTH_PX = 8
const WALL_DENSITY_THRESHOLD = 0.14
const WALL_SOLIDITY_THRESHOLD = 0.58
const WALL_SEGMENT_GAP_TOLERANCE_PX = 128
const THIN_LINE_WALL_DENSITY_THRESHOLD = 0.045
const THIN_LINE_WALL_SOLIDITY_THRESHOLD = 0.52
const THIN_LINE_WALL_SEGMENT_GAP_TOLERANCE_PX = 96
const THIN_LINE_DILATION_RADIUS_PX = 1
const THIN_LINE_FALLBACK_MIN_WALL_COUNT = 4
const STRUCTURAL_INK_NEIGHBORHOOD_RADIUS_PX = 2
const STRUCTURAL_INK_MIN_DARK_PIXELS = 9
const FRAME_EDGE_MARGIN_RATIO = 0.08
const FRAME_SPAN_RATIO = 0.88
const FRAME_TOUCH_MARGIN_RATIO = 0.04
const FRAME_MAX_THICKNESS_PX = 6
const REDUNDANT_WALL_BAND_OVERLAP_RATIO = 0.7
const REDUNDANT_WALL_SEGMENT_OVERLAP_RATIO = 0.82
const DOMINANT_THICK_WALL_MIN_PX = 6
const DECORATIVE_THIN_WALL_RATIO = 0.45
const STRUCTURE_BOUNDS_DENSITY_RATIO = 0.018
const STRUCTURE_BOUNDS_GAP_TOLERANCE_PX = 56
const STRUCTURE_BOUNDS_MARGIN_RATIO = 0.018
const STRUCTURE_BOUNDS_MIN_SPAN_RATIO = 0.16
const WALL_CONNECTION_GAP_TOLERANCE_PX = 8
const WALL_CONNECTION_CENTER_TOLERANCE_PX = 8
const MIN_OPENING_EDGE_BUFFER_PX = 8
const MIN_OPENING_FLANK_SUPPORT_PX = 10
const OPENING_SUPPORT_RATIO = 0.46
const MIN_OPENING_WIDTH_METERS = 0.42
const MAX_OPENING_WIDTH_METERS = 3.6
const FRAMED_OPENING_SIGNAL_RATIO = 0.2
const VOID_OPENING_SIGNAL_RATIO = 0.35
const MIN_FRAMED_OPENING_STRUCTURAL_RATIO = 0.08
const MIN_FRAMED_OPENING_RAW_RATIO = 0.18
const MIN_VOID_OPENING_STRUCTURAL_RATIO = 0.24
const OPENING_SIGNAL_GAP_TOLERANCE_PX = 4
const DOOR_SWING_MIN_WIDTH_METERS = 0.48
const DOOR_SWING_MAX_WIDTH_METERS = 1.35
const DOOR_SWING_SIGNAL_DENSITY = 0.004

type GuideDimensions = {
  height: number
  width: number
}

type GuideDetectionPixelRegion = {
  height: number
  width: number
  x: number
  y: number
}

type Range = {
  end: number
  start: number
}

export type RasterWallCandidate = {
  axis: 'horizontal' | 'vertical'
  band: Range
  id: string
  segment: Range
}

type StructuralWallMasks = {
  combined: Uint8ClampedArray
  horizontal: Uint8ClampedArray
  vertical: Uint8ClampedArray
}

type StructuralBounds = {
  x: Range
  y: Range
}

type OpeningSignalCandidate = {
  mode: 'framed' | 'void'
  range: Range
}

type WallSamplingOptions = {
  boundsMode: 'ink' | 'primary'
  densityThreshold: number
  idPrefix: string
  minBandThickness: number
  minSegmentCoverageRatio: number
  minSegmentLength: number
  segmentGapTolerance: number
  solidityThreshold: number
}

export type GuideDetectionImageData = {
  data: Uint8ClampedArray
  height: number
  width: number
}

export type GuideDetectionDebugSnapshot = {
  candidates: GuideDetectionCandidates
  darkThreshold: number
  detectionMode: 'structural' | 'thin-line'
  guideDimensions: GuideDimensions
  masks: {
    rawDark: Uint8ClampedArray
    structuralCombined: Uint8ClampedArray
    structuralHorizontal: Uint8ClampedArray
    structuralVertical: Uint8ClampedArray
  }
  rasterWalls: RasterWallCandidate[]
  sampleDimensions: GuideDimensions
  sampleOffset: { x: number; y: number }
  structureBounds: StructuralBounds
}

const structuralWallSamplingOptions: WallSamplingOptions = {
  boundsMode: 'primary',
  densityThreshold: WALL_DENSITY_THRESHOLD,
  idPrefix: 'wall',
  minBandThickness: MIN_WALL_THICKNESS_PX,
  minSegmentCoverageRatio: 0.58,
  minSegmentLength: MIN_WALL_LENGTH_PX,
  segmentGapTolerance: WALL_SEGMENT_GAP_TOLERANCE_PX,
  solidityThreshold: WALL_SOLIDITY_THRESHOLD,
}

const thinLineWallSamplingOptions: WallSamplingOptions = {
  boundsMode: 'ink',
  densityThreshold: THIN_LINE_WALL_DENSITY_THRESHOLD,
  idPrefix: 'thin-wall',
  minBandThickness: MIN_WALL_THICKNESS_PX,
  minSegmentCoverageRatio: 0.42,
  minSegmentLength: MIN_WALL_LENGTH_PX,
  segmentGapTolerance: THIN_LINE_WALL_SEGMENT_GAP_TOLERANCE_PX,
  solidityThreshold: THIN_LINE_WALL_SOLIDITY_THRESHOLD,
}

function getRangeLength(range: Range) {
  return range.end - range.start + 1
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getRangeOverlapLength(left: Range, right: Range) {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start) + 1)
}

function getRangeCenter(range: Range) {
  return (range.start + range.end) / 2
}

function getRangeGap(left: Range, right: Range) {
  if (left.end < right.start) {
    return right.start - left.end - 1
  }

  if (right.end < left.start) {
    return left.start - right.end - 1
  }

  return 0
}

function mergeRanges(left: Range, right: Range): Range {
  return {
    start: Math.min(left.start, right.start),
    end: Math.max(left.end, right.end),
  }
}

function groupDenseRanges(values: number[], threshold: number, minLength: number) {
  const ranges: Range[] = []
  let start = -1

  for (let index = 0; index < values.length; index += 1) {
    if (values[index]! >= threshold) {
      if (start < 0) {
        start = index
      }
      continue
    }

    if (start >= 0 && index - start >= minLength) {
      ranges.push({ start, end: index - 1 })
    }
    start = -1
  }

  if (start >= 0 && values.length - start >= minLength) {
    ranges.push({ start, end: values.length - 1 })
  }

  return ranges
}

export function groupDenseRangesWithGapTolerance(
  values: number[],
  threshold: number,
  minLength: number,
  maxGapLength: number,
) {
  const ranges: Range[] = []
  let start = -1
  let gapStart = -1

  for (let index = 0; index < values.length; index += 1) {
    if (values[index]! >= threshold) {
      if (start < 0) {
        start = index
      }
      gapStart = -1
      continue
    }

    if (start < 0) {
      continue
    }

    if (gapStart < 0) {
      gapStart = index
      continue
    }

    if (index - gapStart + 1 > maxGapLength) {
      const end = gapStart - 1
      if (end - start + 1 >= minLength) {
        ranges.push({ start, end })
      }
      start = -1
      gapStart = -1
    }
  }

  if (start >= 0) {
    const end = gapStart >= 0 ? gapStart - 1 : values.length - 1
    if (end - start + 1 >= minLength) {
      ranges.push({ start, end })
    }
  }

  return ranges
}

export function getAdaptiveDarkThreshold(brightness: Uint8ClampedArray) {
  const histogram = new Uint32Array(256)

  for (const value of brightness) {
    histogram[value] = (histogram[value] ?? 0) + 1
  }

  const targetRank = Math.max(0, Math.floor(brightness.length * 0.16) - 1)
  let cumulative = 0
  let percentileValue = 255

  for (let value = 0; value < histogram.length; value += 1) {
    cumulative += histogram[value]!
    if (cumulative > targetRank) {
      percentileValue = value
      break
    }
  }

  return clamp(percentileValue + 8, DARK_THRESHOLD, MAX_DARK_THRESHOLD)
}

function getGuidePlanSize(guide: GuideNode, dimensions: GuideDimensions) {
  const planWidth = GUIDE_BASE_WIDTH * guide.scale
  const planHeight = planWidth / (dimensions.width / dimensions.height)
  return { planWidth, planHeight }
}

function imagePointToWorldPlan(
  guide: GuideNode,
  dimensions: GuideDimensions,
  pixelX: number,
  pixelY: number,
): [number, number] {
  const { planWidth, planHeight } = getGuidePlanSize(guide, dimensions)
  const localX = (pixelX / dimensions.width - 0.5) * planWidth
  const localY = (pixelY / dimensions.height - 0.5) * planHeight
  const rotation = -guide.rotation[1]
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const rotatedX = localX * cos - localY * sin
  const rotatedY = localX * sin + localY * cos

  return [guide.position[0] - rotatedX, guide.position[2] - rotatedY]
}

function pxToPlanLength(
  guide: GuideNode,
  dimensions: GuideDimensions,
  px: number,
  axis: 'x' | 'y',
) {
  const { planWidth, planHeight } = getGuidePlanSize(guide, dimensions)
  return axis === 'x' ? (px / dimensions.width) * planWidth : (px / dimensions.height) * planHeight
}

function buildBrightnessMap(imageData: GuideDetectionImageData) {
  const { data, width, height } = imageData
  const brightness = new Uint8ClampedArray(width * height)

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    const alpha = (data[offset + 3] ?? 255) / 255
    const r = (data[offset] ?? 255) * alpha + 255 * (1 - alpha)
    const g = (data[offset + 1] ?? 255) * alpha + 255 * (1 - alpha)
    const b = (data[offset + 2] ?? 255) * alpha + 255 * (1 - alpha)
    brightness[index] = Math.round(r * 0.299 + g * 0.587 + b * 0.114)
  }

  return brightness
}

function buildBinaryDarkMask(
  brightness: Uint8ClampedArray,
  dimensions: GuideDimensions,
  darkThreshold: number,
) {
  const darkMask = new Uint8ClampedArray(dimensions.width * dimensions.height)

  for (let index = 0; index < darkMask.length; index += 1) {
    darkMask[index] = brightness[index]! <= darkThreshold ? 1 : 0
  }

  return darkMask
}

function buildLinearRunMask(
  darkMask: Uint8ClampedArray,
  dimensions: GuideDimensions,
  axis: 'horizontal' | 'vertical',
  minRunLength = MIN_WALL_THICKNESS_PX,
) {
  const runMask = new Uint8ClampedArray(dimensions.width * dimensions.height)

  if (axis === 'horizontal') {
    for (let y = 0; y < dimensions.height; y += 1) {
      let runStart = -1

      for (let x = 0; x <= dimensions.width; x += 1) {
        const isDark = x < dimensions.width && darkMask[y * dimensions.width + x] === 1
        if (isDark) {
          if (runStart < 0) {
            runStart = x
          }
          continue
        }

        if (runStart >= 0 && x - runStart >= minRunLength) {
          for (let runX = runStart; runX < x; runX += 1) {
            runMask[y * dimensions.width + runX] = 1
          }
        }

        runStart = -1
      }
    }

    return runMask
  }

  for (let x = 0; x < dimensions.width; x += 1) {
    let runStart = -1

    for (let y = 0; y <= dimensions.height; y += 1) {
      const isDark = y < dimensions.height && darkMask[y * dimensions.width + x] === 1
      if (isDark) {
        if (runStart < 0) {
          runStart = y
        }
        continue
      }

      if (runStart >= 0 && y - runStart >= minRunLength) {
        for (let runY = runStart; runY < y; runY += 1) {
          runMask[runY * dimensions.width + x] = 1
        }
      }

      runStart = -1
    }
  }

  return runMask
}

function dilatePerpendicularToLineAxis(
  mask: Uint8ClampedArray,
  dimensions: GuideDimensions,
  axis: 'horizontal' | 'vertical',
  radius: number,
) {
  const dilated = new Uint8ClampedArray(dimensions.width * dimensions.height)

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      if (mask[y * dimensions.width + x] !== 1) {
        continue
      }

      if (axis === 'horizontal') {
        for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
          const targetY = y + offsetY
          if (targetY >= 0 && targetY < dimensions.height) {
            dilated[targetY * dimensions.width + x] = 1
          }
        }
        continue
      }

      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const targetX = x + offsetX
        if (targetX >= 0 && targetX < dimensions.width) {
          dilated[y * dimensions.width + targetX] = 1
        }
      }
    }
  }

  return dilated
}

function combineMasks(left: Uint8ClampedArray, right: Uint8ClampedArray) {
  const combined = new Uint8ClampedArray(left.length)

  for (let index = 0; index < combined.length; index += 1) {
    combined[index] = left[index] === 1 || right[index] === 1 ? 1 : 0
  }

  return combined
}

function buildIntegralMask(mask: Uint8ClampedArray, dimensions: GuideDimensions) {
  const stride = dimensions.width + 1
  const integral = new Uint32Array(stride * (dimensions.height + 1))

  for (let y = 0; y < dimensions.height; y += 1) {
    let rowSum = 0
    for (let x = 0; x < dimensions.width; x += 1) {
      rowSum += mask[y * dimensions.width + x] ?? 0
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)]! + rowSum
    }
  }

  return integral
}

function getIntegralMaskRectSum(
  integral: Uint32Array,
  dimensions: GuideDimensions,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  const stride = dimensions.width + 1
  const x1 = clamp(minX, 0, dimensions.width)
  const y1 = clamp(minY, 0, dimensions.height)
  const x2 = clamp(maxX, 0, dimensions.width)
  const y2 = clamp(maxY, 0, dimensions.height)

  return (
    integral[y2 * stride + x2]! -
    integral[y1 * stride + x2]! -
    integral[y2 * stride + x1]! +
    integral[y1 * stride + x1]!
  )
}

function buildStructuralWallMasks(
  brightness: Uint8ClampedArray,
  dimensions: GuideDimensions,
  darkThreshold: number,
): StructuralWallMasks {
  const darkMask = buildBinaryDarkMask(brightness, dimensions, darkThreshold)
  const integral = buildIntegralMask(darkMask, dimensions)
  const horizontalRunMask = buildLinearRunMask(darkMask, dimensions, 'horizontal')
  const verticalRunMask = buildLinearRunMask(darkMask, dimensions, 'vertical')
  const horizontal = new Uint8ClampedArray(dimensions.width * dimensions.height)
  const vertical = new Uint8ClampedArray(dimensions.width * dimensions.height)
  const combined = new Uint8ClampedArray(dimensions.width * dimensions.height)

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const index = y * dimensions.width + x
      if (darkMask[index] !== 1) {
        continue
      }

      const darkPixelCount = getIntegralMaskRectSum(
        integral,
        dimensions,
        x - STRUCTURAL_INK_NEIGHBORHOOD_RADIUS_PX,
        y - STRUCTURAL_INK_NEIGHBORHOOD_RADIUS_PX,
        x + STRUCTURAL_INK_NEIGHBORHOOD_RADIUS_PX + 1,
        y + STRUCTURAL_INK_NEIGHBORHOOD_RADIUS_PX + 1,
      )

      if (darkPixelCount < STRUCTURAL_INK_MIN_DARK_PIXELS) {
        continue
      }

      if (verticalRunMask[index] === 1) {
        horizontal[index] = 1
        combined[index] = 1
      }

      if (horizontalRunMask[index] === 1) {
        vertical[index] = 1
        combined[index] = 1
      }
    }
  }

  return {
    combined,
    horizontal,
    vertical,
  }
}

function buildThinLineWallMasks(
  brightness: Uint8ClampedArray,
  dimensions: GuideDimensions,
  darkThreshold: number,
): StructuralWallMasks {
  const darkMask = buildBinaryDarkMask(brightness, dimensions, darkThreshold)
  const minRunLength = Math.max(
    MIN_WALL_LENGTH_PX,
    Math.round(Math.min(dimensions.width, dimensions.height) * 0.018),
  )
  const horizontalCenterlineMask = buildLinearRunMask(
    darkMask,
    dimensions,
    'horizontal',
    minRunLength,
  )
  const verticalCenterlineMask = buildLinearRunMask(darkMask, dimensions, 'vertical', minRunLength)
  const horizontal = dilatePerpendicularToLineAxis(
    horizontalCenterlineMask,
    dimensions,
    'horizontal',
    THIN_LINE_DILATION_RADIUS_PX,
  )
  const vertical = dilatePerpendicularToLineAxis(
    verticalCenterlineMask,
    dimensions,
    'vertical',
    THIN_LINE_DILATION_RADIUS_PX,
  )

  return {
    combined: combineMasks(horizontal, vertical),
    horizontal,
    vertical,
  }
}

export function buildStructuralWallMask(
  brightness: Uint8ClampedArray,
  dimensions: GuideDimensions,
  darkThreshold: number,
) {
  return buildStructuralWallMasks(brightness, dimensions, darkThreshold).combined
}

function sampleHorizontalWalls(
  horizontalMask: Uint8ClampedArray,
  dimensions: GuideDimensions,
  options: WallSamplingOptions = structuralWallSamplingOptions,
): RasterWallCandidate[] {
  const rowCounts = Array.from({ length: dimensions.height }, (_, y) => {
    let count = 0
    for (let x = 0; x < dimensions.width; x += 1) {
      if (horizontalMask[y * dimensions.width + x] === 1) count += 1
    }
    return count
  })

  const bands = groupDenseRanges(
    rowCounts,
    Math.max(dimensions.width * options.densityThreshold, options.minSegmentLength),
    options.minBandThickness,
  )

  return bands.flatMap((band, bandIndex) => {
    const columnCounts = Array.from({ length: dimensions.width }, (_, x) => {
      let count = 0
      for (let y = band.start; y <= band.end; y += 1) {
        if (horizontalMask[y * dimensions.width + x] === 1) count += 1
      }
      return count
    })

    const segments = groupDenseRangesWithGapTolerance(
      columnCounts,
      Math.max((band.end - band.start + 1) * options.solidityThreshold, 1),
      options.minSegmentLength,
      options.segmentGapTolerance,
    ).filter((segment) => {
      const supportThreshold = Math.max((band.end - band.start + 1) * options.solidityThreshold, 1)
      const supportedLength = columnCounts
        .slice(segment.start, segment.end + 1)
        .filter((count) => count >= supportThreshold).length
      return supportedLength / getRangeLength(segment) >= options.minSegmentCoverageRatio
    })

    return segments.map((segment, segmentIndex) => ({
      id: `${options.idPrefix}-h-${bandIndex}-${segmentIndex}`,
      axis: 'horizontal' as const,
      band,
      segment,
    }))
  })
}

function sampleVerticalWalls(
  verticalMask: Uint8ClampedArray,
  dimensions: GuideDimensions,
  options: WallSamplingOptions = structuralWallSamplingOptions,
): RasterWallCandidate[] {
  const columnCounts = Array.from({ length: dimensions.width }, (_, x) => {
    let count = 0
    for (let y = 0; y < dimensions.height; y += 1) {
      if (verticalMask[y * dimensions.width + x] === 1) count += 1
    }
    return count
  })

  const bands = groupDenseRanges(
    columnCounts,
    Math.max(dimensions.height * options.densityThreshold, options.minSegmentLength),
    options.minBandThickness,
  )

  return bands.flatMap((band, bandIndex) => {
    const rowCounts = Array.from({ length: dimensions.height }, (_, y) => {
      let count = 0
      for (let x = band.start; x <= band.end; x += 1) {
        if (verticalMask[y * dimensions.width + x] === 1) count += 1
      }
      return count
    })

    const segments = groupDenseRangesWithGapTolerance(
      rowCounts,
      Math.max((band.end - band.start + 1) * options.solidityThreshold, 1),
      options.minSegmentLength,
      options.segmentGapTolerance,
    ).filter((segment) => {
      const supportThreshold = Math.max((band.end - band.start + 1) * options.solidityThreshold, 1)
      const supportedLength = rowCounts
        .slice(segment.start, segment.end + 1)
        .filter((count) => count >= supportThreshold).length
      return supportedLength / getRangeLength(segment) >= options.minSegmentCoverageRatio
    })

    return segments.map((segment, segmentIndex) => ({
      id: `${options.idPrefix}-v-${bandIndex}-${segmentIndex}`,
      axis: 'vertical' as const,
      band,
      segment,
    }))
  })
}

export function getGuideDetectionPixelRegion(
  guide: Pick<GuideNode, 'detectionRegion'>,
  dimensions: GuideDimensions,
): GuideDetectionPixelRegion {
  const region = guide.detectionRegion
  if (!region) {
    return {
      x: 0,
      y: 0,
      width: dimensions.width,
      height: dimensions.height,
    }
  }

  const startX = Math.round(clamp(region.x, 0, 1) * dimensions.width)
  const startY = Math.round(clamp(region.y, 0, 1) * dimensions.height)
  const endX = Math.round(clamp(region.x + region.width, 0, 1) * dimensions.width)
  const endY = Math.round(clamp(region.y + region.height, 0, 1) * dimensions.height)

  return {
    x: clamp(startX, 0, Math.max(0, dimensions.width - 1)),
    y: clamp(startY, 0, Math.max(0, dimensions.height - 1)),
    width: Math.max(1, endX - startX),
    height: Math.max(1, endY - startY),
  }
}

function isLikelyFrameWallCandidate(
  candidate: RasterWallCandidate,
  guideDimensions: GuideDimensions,
  sampleOffset: { x: number; y: number },
): boolean {
  const thickness = getRangeLength(candidate.band)
  if (thickness > FRAME_MAX_THICKNESS_PX) {
    return false
  }

  if (candidate.axis === 'horizontal') {
    const bandCenter = sampleOffset.y + (candidate.band.start + candidate.band.end) / 2
    const nearPageEdge =
      bandCenter <= guideDimensions.height * FRAME_EDGE_MARGIN_RATIO ||
      bandCenter >= guideDimensions.height - 1 - guideDimensions.height * FRAME_EDGE_MARGIN_RATIO
    const segmentStart = sampleOffset.x + candidate.segment.start
    const segmentEnd = sampleOffset.x + candidate.segment.end
    const spansPage = getRangeLength(candidate.segment) >= guideDimensions.width * FRAME_SPAN_RATIO
    const touchesBothSides =
      segmentStart <= guideDimensions.width * FRAME_TOUCH_MARGIN_RATIO &&
      segmentEnd >= guideDimensions.width - 1 - guideDimensions.width * FRAME_TOUCH_MARGIN_RATIO

    return nearPageEdge && spansPage && touchesBothSides
  }

  const bandCenter = sampleOffset.x + (candidate.band.start + candidate.band.end) / 2
  const nearPageEdge =
    bandCenter <= guideDimensions.width * FRAME_EDGE_MARGIN_RATIO ||
    bandCenter >= guideDimensions.width - 1 - guideDimensions.width * FRAME_EDGE_MARGIN_RATIO
  const segmentStart = sampleOffset.y + candidate.segment.start
  const segmentEnd = sampleOffset.y + candidate.segment.end
  const spansPage = getRangeLength(candidate.segment) >= guideDimensions.height * FRAME_SPAN_RATIO
  const touchesBothSides =
    segmentStart <= guideDimensions.height * FRAME_TOUCH_MARGIN_RATIO &&
    segmentEnd >= guideDimensions.height - 1 - guideDimensions.height * FRAME_TOUCH_MARGIN_RATIO

  return nearPageEdge && spansPage && touchesBothSides
}

export function filterFrameLikeWallCandidates(
  rasterCandidates: RasterWallCandidate[],
  guideDimensions: GuideDimensions,
  sampleOffset = { x: 0, y: 0 },
) {
  return rasterCandidates.filter(
    (candidate) => !isLikelyFrameWallCandidate(candidate, guideDimensions, sampleOffset),
  )
}

export function dedupeRasterWallCandidates(rasterCandidates: RasterWallCandidate[]) {
  const sorted = [...rasterCandidates].sort((left, right) => {
    const lengthDelta = getRangeLength(right.segment) - getRangeLength(left.segment)
    if (lengthDelta !== 0) {
      return lengthDelta
    }

    const thicknessDelta = getRangeLength(right.band) - getRangeLength(left.band)
    if (thicknessDelta !== 0) {
      return thicknessDelta
    }

    if (left.axis !== right.axis) {
      return left.axis.localeCompare(right.axis)
    }

    return left.id.localeCompare(right.id)
  })

  const deduped: RasterWallCandidate[] = []

  for (const candidate of sorted) {
    const isCovered = deduped.some((existing) => {
      if (existing.axis !== candidate.axis) {
        return false
      }

      const bandOverlap = getRangeOverlapLength(existing.band, candidate.band)
      const segmentOverlap = getRangeOverlapLength(existing.segment, candidate.segment)
      const minBandLength = Math.min(getRangeLength(existing.band), getRangeLength(candidate.band))
      const minSegmentLength = Math.min(
        getRangeLength(existing.segment),
        getRangeLength(candidate.segment),
      )

      return (
        bandOverlap / Math.max(minBandLength, 1) >= REDUNDANT_WALL_BAND_OVERLAP_RATIO &&
        segmentOverlap / Math.max(minSegmentLength, 1) >= REDUNDANT_WALL_SEGMENT_OVERLAP_RATIO
      )
    })

    if (!isCovered) {
      deduped.push(candidate)
    }
  }

  return deduped.sort((left, right) => {
    if (left.axis !== right.axis) {
      return left.axis.localeCompare(right.axis)
    }

    const leftBandCenter = (left.band.start + left.band.end) / 2
    const rightBandCenter = (right.band.start + right.band.end) / 2
    if (leftBandCenter !== rightBandCenter) {
      return leftBandCenter - rightBandCenter
    }

    return left.segment.start - right.segment.start
  })
}

function getRasterWallCandidateScore(candidate: RasterWallCandidate) {
  return getRangeLength(candidate.segment) * Math.max(getRangeLength(candidate.band), 1)
}

function areRasterWallsConnected(left: RasterWallCandidate, right: RasterWallCandidate) {
  if (left.axis === right.axis) {
    const bandDistance = Math.abs(getRangeCenter(left.band) - getRangeCenter(right.band))
    if (bandDistance > WALL_CONNECTION_CENTER_TOLERANCE_PX) {
      return false
    }

    return getRangeGap(left.segment, right.segment) <= WALL_CONNECTION_GAP_TOLERANCE_PX
  }

  const horizontal = left.axis === 'horizontal' ? left : right
  const vertical = left.axis === 'vertical' ? left : right
  const horizontalCenter = getRangeCenter(horizontal.band)
  const verticalCenter = getRangeCenter(vertical.band)

  return (
    verticalCenter >= horizontal.segment.start - WALL_CONNECTION_GAP_TOLERANCE_PX &&
    verticalCenter <= horizontal.segment.end + WALL_CONNECTION_GAP_TOLERANCE_PX &&
    horizontalCenter >= vertical.segment.start - WALL_CONNECTION_GAP_TOLERANCE_PX &&
    horizontalCenter <= vertical.segment.end + WALL_CONNECTION_GAP_TOLERANCE_PX
  )
}

export function filterDisconnectedRasterWalls(rasterCandidates: RasterWallCandidate[]) {
  if (rasterCandidates.length <= 1) {
    return rasterCandidates
  }

  const visited = new Set<number>()
  let bestComponent: number[] = []
  let bestScore = -1

  for (let startIndex = 0; startIndex < rasterCandidates.length; startIndex += 1) {
    if (visited.has(startIndex)) {
      continue
    }

    const queue = [startIndex]
    const component: number[] = []
    visited.add(startIndex)

    while (queue.length > 0) {
      const currentIndex = queue.shift()!
      component.push(currentIndex)

      for (let candidateIndex = 0; candidateIndex < rasterCandidates.length; candidateIndex += 1) {
        if (visited.has(candidateIndex)) {
          continue
        }

        if (
          areRasterWallsConnected(
            rasterCandidates[currentIndex]!,
            rasterCandidates[candidateIndex]!,
          )
        ) {
          visited.add(candidateIndex)
          queue.push(candidateIndex)
        }
      }
    }

    const componentScore = component.reduce(
      (sum, index) => sum + getRasterWallCandidateScore(rasterCandidates[index]!),
      0,
    )

    if (componentScore > bestScore) {
      bestScore = componentScore
      bestComponent = component
    }
  }

  const keepIndexes = new Set(bestComponent)
  return rasterCandidates.filter((_, index) => keepIndexes.has(index))
}

function filterDecorativeThinRasterWalls(rasterCandidates: RasterWallCandidate[]) {
  const thickBands = rasterCandidates
    .map((candidate) => getRangeLength(candidate.band))
    .filter((thickness) => thickness >= DOMINANT_THICK_WALL_MIN_PX)
    .sort((left, right) => left - right)

  if (thickBands.length < Math.max(4, Math.ceil(rasterCandidates.length * 0.25))) {
    return rasterCandidates
  }

  const dominantThickness = thickBands[Math.floor(thickBands.length * 0.5)]!
  const minAcceptedThickness = Math.max(
    MIN_WALL_THICKNESS_PX,
    Math.round(dominantThickness * DECORATIVE_THIN_WALL_RATIO),
  )

  return rasterCandidates.filter(
    (candidate) => getRangeLength(candidate.band) >= minAcceptedThickness,
  )
}

function sumRange(values: number[], range: Range) {
  let sum = 0
  for (let index = range.start; index <= range.end; index += 1) {
    sum += values[index] ?? 0
  }
  return sum
}

function findPrimaryStructureRange(values: number[], axisLength: number) {
  const threshold = Math.max(4, Math.round(axisLength * STRUCTURE_BOUNDS_DENSITY_RATIO))
  const minSpan = Math.max(
    MIN_WALL_LENGTH_PX,
    Math.round(axisLength * STRUCTURE_BOUNDS_MIN_SPAN_RATIO),
  )
  const gapTolerance = Math.min(
    STRUCTURE_BOUNDS_GAP_TOLERANCE_PX,
    Math.max(8, Math.round(axisLength * 0.06)),
  )
  const ranges = groupDenseRangesWithGapTolerance(values, threshold, minSpan, gapTolerance)

  if (ranges.length === 0) {
    return { start: 0, end: Math.max(0, values.length - 1) }
  }

  const strongestRange = ranges.reduce((best, current) => {
    const bestScore = sumRange(values, best) * getRangeLength(best)
    const currentScore = sumRange(values, current) * getRangeLength(current)
    return currentScore > bestScore ? current : best
  })

  const margin = Math.max(12, Math.round(axisLength * STRUCTURE_BOUNDS_MARGIN_RATIO))
  return {
    start: clamp(strongestRange.start - margin, 0, Math.max(0, values.length - 1)),
    end: clamp(strongestRange.end + margin, 0, Math.max(0, values.length - 1)),
  }
}

export function getStructuralBounds(
  structuralMask: Uint8ClampedArray,
  dimensions: GuideDimensions,
): StructuralBounds {
  const rowCounts = Array.from({ length: dimensions.height }, (_, y) => {
    let count = 0
    for (let x = 0; x < dimensions.width; x += 1) {
      if (structuralMask[y * dimensions.width + x] === 1) {
        count += 1
      }
    }
    return count
  })

  const columnCounts = Array.from({ length: dimensions.width }, (_, x) => {
    let count = 0
    for (let y = 0; y < dimensions.height; y += 1) {
      if (structuralMask[y * dimensions.width + x] === 1) {
        count += 1
      }
    }
    return count
  })

  return {
    x: findPrimaryStructureRange(columnCounts, dimensions.height),
    y: findPrimaryStructureRange(rowCounts, dimensions.width),
  }
}

function getInkBounds(mask: Uint8ClampedArray, dimensions: GuideDimensions): StructuralBounds {
  let minX = dimensions.width
  let minY = dimensions.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      if (mask[y * dimensions.width + x] !== 1) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      x: { start: 0, end: Math.max(0, dimensions.width - 1) },
      y: { start: 0, end: Math.max(0, dimensions.height - 1) },
    }
  }

  const margin = Math.max(12, Math.round(Math.min(dimensions.width, dimensions.height) * 0.012))
  return {
    x: {
      start: clamp(minX - margin, 0, Math.max(0, dimensions.width - 1)),
      end: clamp(maxX + margin, 0, Math.max(0, dimensions.width - 1)),
    },
    y: {
      start: clamp(minY - margin, 0, Math.max(0, dimensions.height - 1)),
      end: clamp(maxY + margin, 0, Math.max(0, dimensions.height - 1)),
    },
  }
}

export function trimRasterWallCandidatesToStructureBounds(
  rasterCandidates: RasterWallCandidate[],
  structureBounds: StructuralBounds,
) {
  return rasterCandidates
    .map((candidate) => {
      if (candidate.axis === 'horizontal') {
        const bandCenter = getRangeCenter(candidate.band)
        if (bandCenter < structureBounds.y.start || bandCenter > structureBounds.y.end) {
          return null
        }

        const trimmedSegment = {
          start: Math.max(candidate.segment.start, structureBounds.x.start),
          end: Math.min(candidate.segment.end, structureBounds.x.end),
        }

        if (getRangeLength(trimmedSegment) < MIN_WALL_LENGTH_PX) {
          return null
        }

        return {
          ...candidate,
          segment: trimmedSegment,
        }
      }

      const bandCenter = getRangeCenter(candidate.band)
      if (bandCenter < structureBounds.x.start || bandCenter > structureBounds.x.end) {
        return null
      }

      const trimmedSegment = {
        start: Math.max(candidate.segment.start, structureBounds.y.start),
        end: Math.min(candidate.segment.end, structureBounds.y.end),
      }

      if (getRangeLength(trimmedSegment) < MIN_WALL_LENGTH_PX) {
        return null
      }

      return {
        ...candidate,
        segment: trimmedSegment,
      }
    })
    .filter((candidate): candidate is RasterWallCandidate => !!candidate)
}

function sampleRasterWallCandidates(
  masks: StructuralWallMasks,
  sampleDimensions: GuideDimensions,
  guideDimensions: GuideDimensions,
  sampleOffset: { x: number; y: number },
  options: WallSamplingOptions,
) {
  const structureBounds =
    options.boundsMode === 'ink'
      ? getInkBounds(masks.combined, sampleDimensions)
      : getStructuralBounds(masks.combined, sampleDimensions)
  const sampledCandidates = trimRasterWallCandidatesToStructureBounds(
    filterFrameLikeWallCandidates(
      [
        ...sampleHorizontalWalls(masks.horizontal, sampleDimensions, options),
        ...sampleVerticalWalls(masks.vertical, sampleDimensions, options),
      ],
      guideDimensions,
      sampleOffset,
    ),
    structureBounds,
  )
  const thicknessFilteredCandidates =
    options.boundsMode === 'primary'
      ? filterDecorativeThinRasterWalls(sampledCandidates)
      : sampledCandidates
  const rasterWalls = filterDisconnectedRasterWalls(
    dedupeRasterWallCandidates(thicknessFilteredCandidates),
  )

  return {
    rasterWalls,
    structureBounds,
  }
}

function buildWallCandidates(
  guide: GuideNode,
  guideDimensions: GuideDimensions,
  rasterCandidates: RasterWallCandidate[],
  sampleOffset: { x: number; y: number },
): GuideDetectionWallCandidate[] {
  return rasterCandidates
    .map((candidate) => {
      if (candidate.axis === 'horizontal') {
        const centerY = sampleOffset.y + (candidate.band.start + candidate.band.end) / 2
        return {
          id: candidate.id,
          start: imagePointToWorldPlan(
            guide,
            guideDimensions,
            sampleOffset.x + candidate.segment.start,
            centerY,
          ),
          end: imagePointToWorldPlan(
            guide,
            guideDimensions,
            sampleOffset.x + candidate.segment.end,
            centerY,
          ),
          thickness: Math.max(
            0.08,
            pxToPlanLength(
              guide,
              guideDimensions,
              candidate.band.end - candidate.band.start + 1,
              'y',
            ),
          ),
        }
      }

      const centerX = sampleOffset.x + (candidate.band.start + candidate.band.end) / 2
      return {
        id: candidate.id,
        start: imagePointToWorldPlan(
          guide,
          guideDimensions,
          centerX,
          sampleOffset.y + candidate.segment.start,
        ),
        end: imagePointToWorldPlan(
          guide,
          guideDimensions,
          centerX,
          sampleOffset.y + candidate.segment.end,
        ),
        thickness: Math.max(
          0.08,
          pxToPlanLength(
            guide,
            guideDimensions,
            candidate.band.end - candidate.band.start + 1,
            'x',
          ),
        ),
      }
    })
    .filter((candidate) => {
      const length = Math.hypot(
        candidate.end[0] - candidate.start[0],
        candidate.end[1] - candidate.start[1],
      )
      return length >= 0.8
    })
}

function getRangeMean(values: number[], start: number, end: number) {
  if (end < start) {
    return 0
  }

  let sum = 0
  for (let index = start; index <= end; index += 1) {
    sum += values[index] ?? 0
  }

  return sum / (end - start + 1)
}

function getSampleSupportTarget(samples: number[], fallback: number) {
  const positiveSamples = samples.filter((value) => value > 0).sort((left, right) => left - right)
  if (positiveSamples.length === 0) {
    return Math.max(1, fallback)
  }

  const percentileIndex = clamp(
    Math.floor(positiveSamples.length * 0.75),
    0,
    positiveSamples.length - 1,
  )
  return Math.max(1, positiveSamples[percentileIndex] ?? fallback)
}

function buildOpeningSignalCandidates(
  structuralSamples: number[],
  rawDarkSamples: number[],
  wallThicknessPx: number,
  rawSupportTargetPx = wallThicknessPx,
) {
  const missingStructural = structuralSamples.map((value) => Math.max(0, wallThicknessPx - value))
  const missingRaw = rawDarkSamples.map((value) => Math.max(0, rawSupportTargetPx - value))
  const ranges: OpeningSignalCandidate[] = [
    ...groupDenseRanges(
      missingStructural,
      Math.max(wallThicknessPx * VOID_OPENING_SIGNAL_RATIO, 1),
      MIN_GAP_LENGTH_PX,
    ).map((range) => ({
      range,
      mode: 'void' as const,
    })),
    ...groupDenseRanges(
      missingRaw,
      Math.max(rawSupportTargetPx * FRAMED_OPENING_SIGNAL_RATIO, 1),
      MIN_GAP_LENGTH_PX,
    ).map((range) => ({
      range,
      mode: 'framed' as const,
    })),
  ].sort((left, right) => left.range.start - right.range.start)

  if (ranges.length <= 1) {
    return ranges
  }

  const merged: OpeningSignalCandidate[] = [ranges[0]!]

  for (const candidate of ranges.slice(1)) {
    const previous = merged[merged.length - 1]!
    if (getRangeGap(previous.range, candidate.range) <= OPENING_SIGNAL_GAP_TOLERANCE_PX) {
      previous.range = mergeRanges(previous.range, candidate.range)
      previous.mode = previous.mode === 'void' || candidate.mode === 'void' ? 'void' : 'framed'
      continue
    }

    merged.push({ ...candidate, range: { ...candidate.range } })
  }

  return merged
}

function countMaskPixelsInRect(
  mask: Uint8ClampedArray,
  dimensions: GuideDimensions,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  const startX = clamp(Math.floor(minX), 0, dimensions.width - 1)
  const startY = clamp(Math.floor(minY), 0, dimensions.height - 1)
  const endX = clamp(Math.ceil(maxX), 0, dimensions.width - 1)
  const endY = clamp(Math.ceil(maxY), 0, dimensions.height - 1)

  if (endX < startX || endY < startY) {
    return { area: 0, count: 0 }
  }

  let count = 0
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if (mask[y * dimensions.width + x] === 1) {
        count += 1
      }
    }
  }

  return {
    area: (endX - startX + 1) * (endY - startY + 1),
    count,
  }
}

function hasDoorSwingSignal(
  rawDarkMask: Uint8ClampedArray,
  sampleDimensions: GuideDimensions,
  wall: RasterWallCandidate,
  gap: Range,
  width: number,
) {
  if (width < DOOR_SWING_MIN_WIDTH_METERS || width > DOOR_SWING_MAX_WIDTH_METERS) {
    return false
  }

  const gapLength = getRangeLength(gap)
  const padding = Math.max(4, Math.round(gapLength * 0.18))
  const scanDepth = clamp(Math.round(gapLength * 1.25), 18, 110)
  const minSignalPixels = Math.max(10, Math.round(gapLength * 0.28))

  const sideRects =
    wall.axis === 'horizontal'
      ? [
          {
            minX: wall.segment.start + gap.start - padding,
            maxX: wall.segment.start + gap.end + padding,
            minY: wall.band.start - scanDepth,
            maxY: wall.band.start - 3,
          },
          {
            minX: wall.segment.start + gap.start - padding,
            maxX: wall.segment.start + gap.end + padding,
            minY: wall.band.end + 3,
            maxY: wall.band.end + scanDepth,
          },
        ]
      : [
          {
            minX: wall.band.start - scanDepth,
            maxX: wall.band.start - 3,
            minY: wall.segment.start + gap.start - padding,
            maxY: wall.segment.start + gap.end + padding,
          },
          {
            minX: wall.band.end + 3,
            maxX: wall.band.end + scanDepth,
            minY: wall.segment.start + gap.start - padding,
            maxY: wall.segment.start + gap.end + padding,
          },
        ]

  return sideRects.some((rect) => {
    const signal = countMaskPixelsInRect(
      rawDarkMask,
      sampleDimensions,
      rect.minX,
      rect.minY,
      rect.maxX,
      rect.maxY,
    )

    return (
      signal.count >= minSignalPixels &&
      signal.count / Math.max(signal.area, 1) >= DOOR_SWING_SIGNAL_DENSITY
    )
  })
}

function getOpeningKind(mode: OpeningSignalCandidate['mode'], width: number, hasDoorSwing = false) {
  if (hasDoorSwing) {
    return 'door' as const
  }

  if (mode === 'framed') {
    return 'window' as const
  }

  if (width >= 0.78 && width <= 1.6) {
    return 'door' as const
  }

  return 'window' as const
}

export function isGapLikelyOpening(
  structuralSamples: number[],
  rawDarkSamples: number[],
  gap: Range,
  wallThicknessPx: number,
  mode: OpeningSignalCandidate['mode'],
  rawSupportTargetPx = wallThicknessPx,
) {
  const edgeBuffer = Math.max(
    MIN_OPENING_EDGE_BUFFER_PX,
    Math.min(18, Math.round(structuralSamples.length * 0.08)),
  )
  if (
    gap.start < edgeBuffer ||
    gap.end > structuralSamples.length - 1 - edgeBuffer ||
    gap.end - gap.start + 1 < MIN_GAP_LENGTH_PX
  ) {
    return false
  }

  const flankSupport = Math.max(
    MIN_OPENING_FLANK_SUPPORT_PX,
    Math.min(18, Math.round(structuralSamples.length * 0.1)),
  )
  const leftStart = gap.start - flankSupport
  const leftEnd = gap.start - 1
  const rightStart = gap.end + 1
  const rightEnd = gap.end + flankSupport

  if (leftStart < 0 || rightEnd >= structuralSamples.length) {
    return false
  }

  const supportThreshold = Math.max(1, wallThicknessPx * OPENING_SUPPORT_RATIO)
  const leftMean = getRangeMean(structuralSamples, leftStart, leftEnd)
  const rightMean = getRangeMean(structuralSamples, rightStart, rightEnd)

  if (!(leftMean >= supportThreshold && rightMean >= supportThreshold)) {
    return false
  }

  const centerStructuralMean = getRangeMean(structuralSamples, gap.start, gap.end)
  const centerRawMean = getRangeMean(rawDarkSamples, gap.start, gap.end)
  const structuralMissingRatio =
    Math.max(0, wallThicknessPx - centerStructuralMean) / wallThicknessPx
  const rawMissingRatio = Math.max(0, rawSupportTargetPx - centerRawMean) / rawSupportTargetPx

  if (mode === 'void') {
    return structuralMissingRatio >= MIN_VOID_OPENING_STRUCTURAL_RATIO
  }

  return (
    structuralMissingRatio >= MIN_FRAMED_OPENING_STRUCTURAL_RATIO &&
    rawMissingRatio >= MIN_FRAMED_OPENING_RAW_RATIO
  )
}

function sampleOpeningsForWall(
  wallMask: Uint8ClampedArray,
  rawDarkMask: Uint8ClampedArray,
  sampleDimensions: GuideDimensions,
  guide: GuideNode,
  guideDimensions: GuideDimensions,
  sampleOffset: { x: number; y: number },
  wall: RasterWallCandidate,
): GuideDetectionOpeningCandidate[] {
  const structuralSamples: number[] =
    wall.axis === 'horizontal'
      ? Array.from({ length: wall.segment.end - wall.segment.start + 1 }, (_, offset) => {
          const x = wall.segment.start + offset
          let dark = 0
          for (let y = wall.band.start; y <= wall.band.end; y += 1) {
            if (wallMask[y * sampleDimensions.width + x] === 1) dark += 1
          }
          return dark
        })
      : Array.from({ length: wall.segment.end - wall.segment.start + 1 }, (_, offset) => {
          const y = wall.segment.start + offset
          let dark = 0
          for (let x = wall.band.start; x <= wall.band.end; x += 1) {
            if (wallMask[y * sampleDimensions.width + x] === 1) dark += 1
          }
          return dark
        })

  const rawDarkSamples: number[] =
    wall.axis === 'horizontal'
      ? Array.from({ length: wall.segment.end - wall.segment.start + 1 }, (_, offset) => {
          const x = wall.segment.start + offset
          let dark = 0
          for (let y = wall.band.start; y <= wall.band.end; y += 1) {
            if (rawDarkMask[y * sampleDimensions.width + x] === 1) dark += 1
          }
          return dark
        })
      : Array.from({ length: wall.segment.end - wall.segment.start + 1 }, (_, offset) => {
          const y = wall.segment.start + offset
          let dark = 0
          for (let x = wall.band.start; x <= wall.band.end; x += 1) {
            if (rawDarkMask[y * sampleDimensions.width + x] === 1) dark += 1
          }
          return dark
        })

  const wallThicknessPx = wall.band.end - wall.band.start + 1
  const rawSupportTargetPx = getSampleSupportTarget(rawDarkSamples, wallThicknessPx)

  return buildOpeningSignalCandidates(
    structuralSamples,
    rawDarkSamples,
    wallThicknessPx,
    rawSupportTargetPx,
  )
    .map(({ mode, range }, index) => {
      if (
        !isGapLikelyOpening(
          structuralSamples,
          rawDarkSamples,
          range,
          wallThicknessPx,
          mode,
          rawSupportTargetPx,
        )
      ) {
        return null
      }

      const gapLengthPx = range.end - range.start + 1
      const width = pxToPlanLength(
        guide,
        guideDimensions,
        gapLengthPx,
        wall.axis === 'horizontal' ? 'x' : 'y',
      )
      if (width < MIN_OPENING_WIDTH_METERS || width > MAX_OPENING_WIDTH_METERS) {
        return null
      }

      const kind = getOpeningKind(
        mode,
        width,
        hasDoorSwingSignal(rawDarkMask, sampleDimensions, wall, range, width),
      )

      if (wall.axis === 'horizontal') {
        const centerX = sampleOffset.x + wall.segment.start + (range.start + range.end) / 2
        const centerY = sampleOffset.y + (wall.band.start + wall.band.end) / 2
        return {
          id: `${wall.id}:opening:${index}`,
          wallCandidateId: wall.id,
          kind,
          center: imagePointToWorldPlan(guide, guideDimensions, centerX, centerY),
          width,
          height: kind === 'door' ? 2.1 : 1.5,
          yOffset: kind === 'door' ? 1.05 : 1.45,
        } satisfies GuideDetectionOpeningCandidate
      }

      const centerX = sampleOffset.x + (wall.band.start + wall.band.end) / 2
      const centerY = sampleOffset.y + wall.segment.start + (range.start + range.end) / 2
      return {
        id: `${wall.id}:opening:${index}`,
        wallCandidateId: wall.id,
        kind,
        center: imagePointToWorldPlan(guide, guideDimensions, centerX, centerY),
        width,
        height: kind === 'door' ? 2.1 : 1.5,
        yOffset: kind === 'door' ? 1.05 : 1.45,
      } satisfies GuideDetectionOpeningCandidate
    })
    .filter((candidate): candidate is GuideDetectionOpeningCandidate => !!candidate)
}

function buildOpeningCandidates(
  structuralMasks: StructuralWallMasks,
  rawDarkMask: Uint8ClampedArray,
  sampleDimensions: GuideDimensions,
  guide: GuideNode,
  guideDimensions: GuideDimensions,
  rasterWalls: RasterWallCandidate[],
  sampleOffset: { x: number; y: number },
) {
  return rasterWalls.flatMap((wall) =>
    sampleOpeningsForWall(
      wall.axis === 'horizontal' ? structuralMasks.horizontal : structuralMasks.vertical,
      rawDarkMask,
      sampleDimensions,
      guide,
      guideDimensions,
      sampleOffset,
      wall,
    ),
  )
}

async function loadGuideImageData(guide: GuideNode) {
  const url = await loadAssetUrl(guide.url)
  if (!url) {
    throw new Error('Failed to resolve the guide image for tracing')
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new globalThis.Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('Failed to load the guide image for tracing'))
    element.src = url
  })

  const width = Math.min(1600, image.naturalWidth || image.width)
  const height = Math.max(
    1,
    Math.round(
      (width / (image.naturalWidth || image.width)) * (image.naturalHeight || image.height),
    ),
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to create guide detection canvas context')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const guideDimensions = { width, height }
  const detectionRegion = getGuideDetectionPixelRegion(guide, guideDimensions)

  return {
    guideDimensions,
    sampleOffset: {
      x: detectionRegion.x,
      y: detectionRegion.y,
    },
    imageData: context.getImageData(
      detectionRegion.x,
      detectionRegion.y,
      detectionRegion.width,
      detectionRegion.height,
    ),
  }
}

export function buildGuideDetectionDebugSnapshot(
  guide: GuideNode,
  imageData: GuideDetectionImageData,
  guideDimensions: GuideDimensions = { width: imageData.width, height: imageData.height },
  sampleOffset = { x: 0, y: 0 },
): GuideDetectionDebugSnapshot {
  const sampleDimensions = { width: imageData.width, height: imageData.height }
  const brightness = buildBrightnessMap(imageData)
  const darkThreshold = getAdaptiveDarkThreshold(brightness)
  const rawDarkMask = buildBinaryDarkMask(brightness, sampleDimensions, darkThreshold)
  const structuralMasks = buildStructuralWallMasks(brightness, sampleDimensions, darkThreshold)
  const structuralResult = sampleRasterWallCandidates(
    structuralMasks,
    sampleDimensions,
    guideDimensions,
    sampleOffset,
    structuralWallSamplingOptions,
  )
  let detectionMode: GuideDetectionDebugSnapshot['detectionMode'] = 'structural'
  let selectedMasks = structuralMasks
  let structureBounds = structuralResult.structureBounds
  let rasterWalls = structuralResult.rasterWalls

  if (rasterWalls.length < THIN_LINE_FALLBACK_MIN_WALL_COUNT) {
    const thinLineMasks = buildThinLineWallMasks(brightness, sampleDimensions, darkThreshold)
    const thinLineResult = sampleRasterWallCandidates(
      thinLineMasks,
      sampleDimensions,
      guideDimensions,
      sampleOffset,
      thinLineWallSamplingOptions,
    )

    if (thinLineResult.rasterWalls.length > rasterWalls.length) {
      detectionMode = 'thin-line'
      selectedMasks = thinLineMasks
      structureBounds = thinLineResult.structureBounds
      rasterWalls = thinLineResult.rasterWalls
    }
  }

  const walls = buildWallCandidates(guide, guideDimensions, rasterWalls, sampleOffset)
  const openings = buildOpeningCandidates(
    selectedMasks,
    rawDarkMask,
    sampleDimensions,
    guide,
    guideDimensions,
    rasterWalls,
    sampleOffset,
  )
  const candidates = {
    guideId: guide.id,
    generatedAt: Date.now(),
    walls,
    openings,
  }

  return {
    candidates,
    darkThreshold,
    detectionMode,
    guideDimensions,
    masks: {
      rawDark: rawDarkMask,
      structuralCombined: selectedMasks.combined,
      structuralHorizontal: selectedMasks.horizontal,
      structuralVertical: selectedMasks.vertical,
    },
    rasterWalls,
    sampleDimensions,
    sampleOffset,
    structureBounds,
  }
}

export function detectGuideCandidatesFromImageData(
  guide: GuideNode,
  imageData: GuideDetectionImageData,
  guideDimensions?: GuideDimensions,
  sampleOffset?: { x: number; y: number },
) {
  return buildGuideDetectionDebugSnapshot(guide, imageData, guideDimensions, sampleOffset)
    .candidates
}

export async function detectGuideCandidates(guide: GuideNode): Promise<GuideDetectionCandidates> {
  const { guideDimensions, imageData, sampleOffset } = await loadGuideImageData(guide)
  return detectGuideCandidatesFromImageData(guide, imageData, guideDimensions, sampleOffset)
}

type CreateNode = (node: DoorNode | WindowNode | WallNode, parentId?: AnyNodeId) => void

export function getSelectedGuideDetectionCandidates(candidates: GuideDetectionCandidates) {
  const selectedWallIds = new Set(
    candidates.selectedWallIds ?? candidates.walls.map((wall) => wall.id),
  )
  const selectedOpeningIds = new Set(
    candidates.selectedOpeningIds ?? candidates.openings.map((opening) => opening.id),
  )

  return {
    ...candidates,
    walls: candidates.walls.filter((wall) => selectedWallIds.has(wall.id)),
    openings: candidates.openings.filter(
      (opening) =>
        selectedOpeningIds.has(opening.id) && selectedWallIds.has(opening.wallCandidateId),
    ),
  }
}

export function applyDetectedWalls(
  levelId: AnyNodeId,
  candidates: GuideDetectionCandidates,
  createNode: CreateNode,
) {
  const wallIdMap = new Map<string, WallNodeId>()
  const selectedCandidates = getSelectedGuideDetectionCandidates(candidates)

  for (const candidate of selectedCandidates.walls) {
    const wall = WallNode.parse({
      parentId: levelId,
      start: candidate.start,
      end: candidate.end,
      thickness: Math.min(Math.max(candidate.thickness, 0.08), 0.28),
      height: 2.8,
      metadata: {
        blueprintDetection: true,
        sourceGuideId: candidates.guideId,
      },
    })

    createNode(wall, levelId)
    wallIdMap.set(candidate.id, wall.id)
  }

  return wallIdMap
}

export function applyDetectedOpenings(
  candidates: GuideDetectionCandidates,
  wallIdMap: Map<string, WallNodeId>,
  createNode: CreateNode,
  wallCandidates: GuideDetectionWallCandidate[],
) {
  let createdCount = 0
  const selectedCandidates = getSelectedGuideDetectionCandidates(candidates)
  const selectedWallCandidates =
    selectedCandidates.walls.length > 0 ? selectedCandidates.walls : wallCandidates

  for (const candidate of selectedCandidates.openings) {
    const wallId = wallIdMap.get(candidate.wallCandidateId)
    const wall = selectedWallCandidates.find((entry) => entry.id === candidate.wallCandidateId)
    if (!(wallId && wall)) continue

    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const wallLength = Math.hypot(dx, dz)
    if (wallLength <= 1e-6) continue

    const projection =
      ((candidate.center[0] - wall.start[0]) * dx + (candidate.center[1] - wall.start[1]) * dz) /
      wallLength

    if (candidate.kind === 'door') {
      createNode(
        DoorNode.parse({
          parentId: wallId,
          wallId,
          position: [Math.max(0.15, Math.min(wallLength - 0.15, projection)), candidate.yOffset, 0],
          width: candidate.width,
          height: candidate.height,
          metadata: {
            blueprintDetection: true,
            sourceGuideId: candidates.guideId,
          },
        }),
        wallId,
      )
    } else {
      createNode(
        WindowNode.parse({
          parentId: wallId,
          wallId,
          position: [Math.max(0.15, Math.min(wallLength - 0.15, projection)), candidate.yOffset, 0],
          width: candidate.width,
          height: candidate.height,
          metadata: {
            blueprintDetection: true,
            sourceGuideId: candidates.guideId,
          },
        }),
        wallId,
      )
    }

    createdCount += 1
  }

  return createdCount
}
