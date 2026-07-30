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
import { hasStrongColorBoundaryAcrossRasterWall } from './guide-detection-color'
import {
  alignPerimeterRasterWallsToBroadLocalEvidence,
  closeRectangularRasterWallPerimeter,
  filterRasterWallThicknessOutliers,
  filterShortDanglingRasterWalls,
  filterShortParallelShadowRasterWalls,
  getDoorSwingEvidence,
  mergeAdjacentParallelRasterWalls,
  mergeCollinearRasterWallCandidates,
  refineWideDenseBands,
} from './guide-detection-geometry'

export { hasStrongColorBoundaryAcrossRasterWall } from './guide-detection-color'
export type {
  DoorSwingEvidence,
  RasterWallGeometryCandidate,
  RectangularPerimeterResult,
} from './guide-detection-geometry'
export {
  alignPerimeterRasterWallsToBroadLocalEvidence,
  closeRectangularRasterWallPerimeter,
  filterRasterWallThicknessOutliers,
  filterShortDanglingRasterWalls,
  filterShortParallelShadowRasterWalls,
  getDoorSwingEvidence,
  mergeAdjacentParallelRasterWalls,
  mergeCollinearRasterWallCandidates,
  refineWideDenseBands,
} from './guide-detection-geometry'

type WallNodeId = Extract<AnyNodeId, `wall_${string}`>

const GUIDE_BASE_WIDTH = 10
const DARK_THRESHOLD = 170
const MAX_DARK_THRESHOLD = 224
const ADAPTIVE_DARK_PERCENTILE = 0.04
const DEFAULT_DARK_PERCENTILE = 0.16
const COLOR_FILL_CHANNEL_SPREAD = 18
const COLOR_FILL_MIN_BRIGHTNESS = 96
const COLOR_FILL_RATIO_THRESHOLD = 0.06
const MIN_WALL_LENGTH_PX = 18
const MIN_WALL_THICKNESS_PX = 3
const MIN_GAP_LENGTH_PX = 8
const WALL_DENSITY_THRESHOLD = 0.14
const COLOR_FILL_WALL_DENSITY_THRESHOLD = 0.11
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
const COLLINEAR_WALL_MAX_GAP_RATIO = 0.16
const DOMINANT_THICK_WALL_MIN_PX = 6
const DECORATIVE_THIN_WALL_RATIO = 0.45
const COLOR_FILL_DECORATIVE_THIN_WALL_RATIO = 0.65
const STRUCTURE_BOUNDS_DENSITY_RATIO = 0.018
const STRUCTURE_BOUNDS_GAP_TOLERANCE_PX = 56
const STRUCTURE_BOUNDS_MARGIN_RATIO = 0.018
const STRUCTURE_BOUNDS_MIN_SPAN_RATIO = 0.16
const WALL_CONNECTION_GAP_TOLERANCE_PX = 8
const WALL_CONNECTION_CENTER_TOLERANCE_PX = 8
const SECONDARY_WALL_COMPONENT_MIN_SCORE_RATIO = 0.18
const SECONDARY_SINGLE_WALL_COMPONENT_MIN_SCORE_RATIO = 0.35
const SECONDARY_WALL_COMPONENT_MIN_MEMBER_COUNT = 2
const SUPPLEMENTAL_WALL_MIN_LENGTH_RATIO = 0.08
const SUPPLEMENTAL_WALL_CONNECTION_TOLERANCE_PX = 12
const SUPPLEMENTAL_WALL_COLLINEAR_GAP_PX = 24
const SUPPLEMENTAL_PARALLEL_GAP_PX = 12
const SUPPLEMENTAL_PARALLEL_MAX_THICKNESS_PX = 8
const MIN_WALL_ENDPOINT_SUPPORT_PX = 4
const WALL_ENDPOINT_GAP_TOLERANCE_PX = 2
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
const COLOR_PLAN_DOOR_SWING_MAX_WIDTH_METERS = 1.6
const MAX_INTERIOR_UNSUPPORTED_SPAN_METERS = 1.75
const MIN_SPLIT_WALL_LENGTH_METERS = 0.8
const UNSUPPORTED_WALL_SIGNAL_GAP_TOLERANCE_PX = 6
const UNSUPPORTED_WALL_MIN_RATIO = 0.72
const SUPPLEMENTAL_SPAN_MIN_STRUCTURAL_DENSITY = 0.5
const OCCLUDED_BRIDGE_MAX_GAP_RATIO = 0.09
const OCCLUDED_BRIDGE_MIN_STRUCTURAL_DENSITY = 0.18

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
  boundaryAnchored?: boolean
  id: string
  maxCollinearGap?: number
  occludedSpans?: Range[]
  openingSampleBand?: Range
  parallelEvidenceSupported?: boolean
  perimeterConnector?: boolean
  segment: Range
}

export type StructuralWallMasks = {
  combined: Uint8ClampedArray
  horizontal: Uint8ClampedArray
  vertical: Uint8ClampedArray
}

type StructuralBounds = {
  x: Range
  y: Range
}

export type OpeningSignalCandidate = {
  mode: 'framed' | 'void'
  range: Range
}

export type EvaluatedOpeningSignalCandidate = OpeningSignalCandidate & {
  hasDoorSwing: boolean
}

type WallSamplingOptions = {
  boundsMode: 'ink' | 'primary'
  densityThreshold: number
  decorativeThinWallRatio: number
  idPrefix: string
  minBandThickness: number
  minSegmentCoverageRatio: number
  minSegmentLength: number
  refineWideBands?: boolean
  segmentGapTolerance: number
  solidityThreshold: number
  trimIsolatedEndpoints?: boolean
}

export type GuideDetectionImageData = {
  data: Uint8ClampedArray
  height: number
  width: number
}

export type GuideDetectionDebugSnapshot = {
  candidates: GuideDetectionCandidates
  darkThreshold: number
  detectionMode: 'hybrid' | 'structural' | 'thin-line'
  guideDimensions: GuideDimensions
  masks: {
    rawDark: Uint8ClampedArray
    structuralCombined: Uint8ClampedArray
    structuralHorizontal: Uint8ClampedArray
    structuralVertical: Uint8ClampedArray
  }
  rasterWalls: RasterWallCandidate[]
  rasterWallStages: {
    deduped: RasterWallCandidate[]
    merged: RasterWallCandidate[]
    sampled: RasterWallCandidate[]
    thicknessFiltered: RasterWallCandidate[]
  }
  sampleDimensions: GuideDimensions
  sampleOffset: { x: number; y: number }
  splitWallIds: string[]
  structureBounds: StructuralBounds
  supplementalRasterWalls: RasterWallCandidate[]
  supplementedWallIds: string[]
}

const structuralWallSamplingOptions: WallSamplingOptions = {
  boundsMode: 'primary',
  densityThreshold: WALL_DENSITY_THRESHOLD,
  decorativeThinWallRatio: DECORATIVE_THIN_WALL_RATIO,
  idPrefix: 'wall',
  minBandThickness: MIN_WALL_THICKNESS_PX,
  minSegmentCoverageRatio: 0.58,
  minSegmentLength: MIN_WALL_LENGTH_PX,
  segmentGapTolerance: WALL_SEGMENT_GAP_TOLERANCE_PX,
  solidityThreshold: WALL_SOLIDITY_THRESHOLD,
}

const colorFillStructuralWallSamplingOptions: WallSamplingOptions = {
  ...structuralWallSamplingOptions,
  densityThreshold: COLOR_FILL_WALL_DENSITY_THRESHOLD,
  decorativeThinWallRatio: COLOR_FILL_DECORATIVE_THIN_WALL_RATIO,
  refineWideBands: true,
  trimIsolatedEndpoints: true,
}

const thinLineWallSamplingOptions: WallSamplingOptions = {
  boundsMode: 'ink',
  densityThreshold: THIN_LINE_WALL_DENSITY_THRESHOLD,
  decorativeThinWallRatio: DECORATIVE_THIN_WALL_RATIO,
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

export function groupCoveredRangesWithGapTolerance(
  values: number[],
  threshold: number,
  minLength: number,
  maxGapLength: number,
  minCoverageRatio: number,
  trimIsolatedEndpoints = false,
) {
  const broadRanges = groupDenseRangesWithGapTolerance(values, threshold, minLength, maxGapLength)
  const strictGapLength = Math.max(4, Math.min(24, Math.round(maxGapLength * 0.2)))

  return broadRanges.flatMap((untrimmedRange) => {
    const supportedLength = values
      .slice(untrimmedRange.start, untrimmedRange.end + 1)
      .filter((value) => value >= threshold).length
    if (supportedLength / getRangeLength(untrimmedRange) < minCoverageRatio) {
      return groupDenseRangesWithGapTolerance(
        values.slice(untrimmedRange.start, untrimmedRange.end + 1),
        threshold,
        minLength,
        strictGapLength,
      )
        .map((strictRange) => ({
          start: untrimmedRange.start + strictRange.start,
          end: untrimmedRange.start + strictRange.end,
        }))
        .filter((strictRange) => {
          const strictSupportedLength = values
            .slice(strictRange.start, strictRange.end + 1)
            .filter((value) => value >= threshold).length
          return strictSupportedLength / getRangeLength(strictRange) >= minCoverageRatio
        })
    }

    if (!trimIsolatedEndpoints) {
      return [untrimmedRange]
    }

    const endpointSupportRanges = groupDenseRangesWithGapTolerance(
      values.slice(untrimmedRange.start, untrimmedRange.end + 1),
      threshold,
      MIN_WALL_ENDPOINT_SUPPORT_PX,
      WALL_ENDPOINT_GAP_TOLERANCE_PX,
    )
    const range =
      endpointSupportRanges.length > 0
        ? {
            start: untrimmedRange.start + endpointSupportRanges[0]!.start,
            end:
              untrimmedRange.start + endpointSupportRanges[endpointSupportRanges.length - 1]!.end,
          }
        : untrimmedRange

    if (getRangeLength(range) < minLength) {
      return []
    }

    return [range]
  })
}

export function getAdaptiveDarkThreshold(
  brightness: Uint8ClampedArray,
  percentile = DEFAULT_DARK_PERCENTILE,
) {
  const histogram = new Uint32Array(256)

  for (const value of brightness) {
    histogram[value] = (histogram[value] ?? 0) + 1
  }

  // Colored room fills can occupy a large part of a rendered plan. Callers use
  // a smaller percentile for those images so fills do not merge into wall bands.
  const targetRank = Math.max(0, Math.floor(brightness.length * percentile) - 1)
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

  return [guide.position[0] + rotatedX, guide.position[2] + rotatedY]
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

function getColoredFillRatio(imageData: GuideDetectionImageData) {
  let coloredPixels = 0
  const pixelCount = imageData.width * imageData.height

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    const alpha = (imageData.data[offset + 3] ?? 255) / 255
    const r = (imageData.data[offset] ?? 255) * alpha + 255 * (1 - alpha)
    const g = (imageData.data[offset + 1] ?? 255) * alpha + 255 * (1 - alpha)
    const b = (imageData.data[offset + 2] ?? 255) * alpha + 255 * (1 - alpha)
    const maxChannel = Math.max(r, g, b)
    const minChannel = Math.min(r, g, b)
    const brightness = r * 0.299 + g * 0.587 + b * 0.114

    if (
      maxChannel - minChannel >= COLOR_FILL_CHANNEL_SPREAD &&
      brightness >= COLOR_FILL_MIN_BRIGHTNESS
    ) {
      coloredPixels += 1
    }
  }

  return coloredPixels / Math.max(pixelCount, 1)
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

function combineStructuralWallMasks(
  primary: StructuralWallMasks,
  supplemental: StructuralWallMasks,
): StructuralWallMasks {
  return {
    combined: combineMasks(primary.combined, supplemental.combined),
    horizontal: combineMasks(primary.horizontal, supplemental.horizontal),
    vertical: combineMasks(primary.vertical, supplemental.vertical),
  }
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

  const densityThreshold = Math.max(
    dimensions.width * options.densityThreshold,
    options.minSegmentLength,
  )
  const sampledBands = groupDenseRanges(rowCounts, densityThreshold, options.minBandThickness)
  const bands = sampledBands

  return bands.flatMap((band, bandIndex) => {
    const columnCounts = Array.from({ length: dimensions.width }, (_, x) => {
      let count = 0
      for (let y = band.start; y <= band.end; y += 1) {
        if (horizontalMask[y * dimensions.width + x] === 1) count += 1
      }
      return count
    })

    const segments = groupCoveredRangesWithGapTolerance(
      columnCounts,
      Math.max((band.end - band.start + 1) * options.solidityThreshold, 1),
      options.minSegmentLength,
      options.segmentGapTolerance,
      options.minSegmentCoverageRatio,
      options.trimIsolatedEndpoints,
    )

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

  const densityThreshold = Math.max(
    dimensions.height * options.densityThreshold,
    options.minSegmentLength,
  )
  const sampledBands = groupDenseRanges(columnCounts, densityThreshold, options.minBandThickness)
  const bands = options.refineWideBands
    ? refineWideDenseBands(columnCounts, sampledBands, densityThreshold, options.minBandThickness)
    : sampledBands

  return bands.flatMap((band, bandIndex) => {
    const isRefinedBand = sampledBands.some(
      (sampledBand) =>
        sampledBand.start <= band.start &&
        sampledBand.end >= band.end &&
        getRangeLength(sampledBand) > getRangeLength(band),
    )
    const rowCounts = Array.from({ length: dimensions.height }, (_, y) => {
      let count = 0
      for (let x = band.start; x <= band.end; x += 1) {
        if (verticalMask[y * dimensions.width + x] === 1) count += 1
      }
      return count
    })

    const segments = groupCoveredRangesWithGapTolerance(
      rowCounts,
      Math.max((band.end - band.start + 1) * options.solidityThreshold, 1),
      options.minSegmentLength,
      isRefinedBand ? Math.min(options.segmentGapTolerance, 16) : options.segmentGapTolerance,
      options.minSegmentCoverageRatio,
      options.trimIsolatedEndpoints,
    )

    return segments.map((segment, segmentIndex) => ({
      id: `${options.idPrefix}-v-${bandIndex}-${segmentIndex}`,
      axis: 'vertical' as const,
      band,
      ...(isRefinedBand ? { maxCollinearGap: 16 } : {}),
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

export function filterDisconnectedRasterWalls(
  rasterCandidates: RasterWallCandidate[],
  retainSecondaryComponents = true,
) {
  if (rasterCandidates.length <= 1) {
    return rasterCandidates
  }

  const visited = new Set<number>()
  const components: Array<{ indexes: number[]; score: number }> = []

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

    components.push({ indexes: component, score: componentScore })
  }

  const bestScore = Math.max(...components.map((component) => component.score))
  const keepIndexes = new Set<number>()

  for (const component of components) {
    const isPrimaryComponent = component.score === bestScore
    const isSupportedSecondaryComponent =
      component.indexes.length >= SECONDARY_WALL_COMPONENT_MIN_MEMBER_COUNT &&
      component.score >= bestScore * SECONDARY_WALL_COMPONENT_MIN_SCORE_RATIO
    const isStrongSingleWallComponent =
      component.indexes.length === 1 &&
      component.score >= bestScore * SECONDARY_SINGLE_WALL_COMPONENT_MIN_SCORE_RATIO
    const hasBoundaryAnchoredWall = component.indexes.some(
      (index) => rasterCandidates[index]?.boundaryAnchored,
    )

    if (
      isPrimaryComponent ||
      (retainSecondaryComponents &&
        (isSupportedSecondaryComponent || isStrongSingleWallComponent || hasBoundaryAnchoredWall))
    ) {
      for (const index of component.indexes) {
        keepIndexes.add(index)
      }
    }
  }

  return rasterCandidates.filter((_, index) => keepIndexes.has(index))
}

function isNearRangeEndpoint(value: number, range: Range, tolerance: number) {
  return Math.abs(value - range.start) <= tolerance || Math.abs(value - range.end) <= tolerance
}

function findCollinearSupplementTarget(
  candidate: RasterWallCandidate,
  walls: RasterWallCandidate[],
) {
  return walls
    .filter((wall) => {
      if (wall.axis !== candidate.axis) {
        return false
      }

      const bandTolerance = Math.max(
        6,
        Math.round((getRangeLength(wall.band) + getRangeLength(candidate.band)) / 2),
      )
      return (
        Math.abs(getRangeCenter(wall.band) - getRangeCenter(candidate.band)) <= bandTolerance &&
        getRangeGap(wall.segment, candidate.segment) <= SUPPLEMENTAL_WALL_COLLINEAR_GAP_PX
      )
    })
    .sort(
      (left, right) =>
        Math.abs(getRangeCenter(left.band) - getRangeCenter(candidate.band)) -
        Math.abs(getRangeCenter(right.band) - getRangeCenter(candidate.band)),
    )[0]
}

function getSupplementalOrthogonalConnections(
  candidate: RasterWallCandidate,
  walls: RasterWallCandidate[],
  connectionTolerance: number,
) {
  const candidateCenter = getRangeCenter(candidate.band)

  return walls
    .filter((wall) => wall.axis !== candidate.axis)
    .map((wall) => {
      const wallCenter = getRangeCenter(wall.band)
      const candidateEndpoint =
        Math.abs(wallCenter - candidate.segment.start) <= connectionTolerance
          ? 'start'
          : Math.abs(wallCenter - candidate.segment.end) <= connectionTolerance
            ? 'end'
            : null
      if (
        !candidateEndpoint ||
        candidateCenter < wall.segment.start - connectionTolerance ||
        candidateCenter > wall.segment.end + connectionTolerance
      ) {
        return null
      }

      return {
        candidateEndpoint,
        terminatesWall: isNearRangeEndpoint(candidateCenter, wall.segment, connectionTolerance),
      }
    })
    .filter(
      (connection): connection is { candidateEndpoint: 'end' | 'start'; terminatesWall: boolean } =>
        !!connection,
    )
}

function getRasterSpanStructuralDensity(
  candidate: RasterWallCandidate,
  segment: Range,
  axisMask: Uint8ClampedArray,
  dimensions: GuideDimensions,
) {
  let supportedPixels = 0
  let sampledPixels = 0
  for (let along = segment.start; along <= segment.end; along += 1) {
    for (let across = candidate.band.start; across <= candidate.band.end; across += 1) {
      const x = candidate.axis === 'horizontal' ? along : across
      const y = candidate.axis === 'horizontal' ? across : along
      if (x < 0 || x >= dimensions.width || y < 0 || y >= dimensions.height) {
        continue
      }
      sampledPixels += 1
      supportedPixels += axisMask[y * dimensions.width + x] === 1 ? 1 : 0
    }
  }
  return supportedPixels / Math.max(sampledPixels, 1)
}

export function bridgeRasterWallsAcrossAnchoredOcclusions(
  primaryWalls: RasterWallCandidate[],
  structuralMasks: Pick<StructuralWallMasks, 'horizontal' | 'vertical'>,
  dimensions: GuideDimensions,
  protectedIds = new Set<string>(),
) {
  const walls = primaryWalls.map((wall) => ({
    ...wall,
    band: { ...wall.band },
    occludedSpans: wall.occludedSpans?.map((span) => ({ ...span })),
    openingSampleBand: wall.openingSampleBand ? { ...wall.openingSampleBand } : undefined,
    segment: { ...wall.segment },
  }))
  const removedIds = new Set<string>()
  const bridgedWallIds = new Set<string>()
  const maximumGapByAxis = {
    horizontal: Math.max(MIN_WALL_LENGTH_PX, dimensions.width * OCCLUDED_BRIDGE_MAX_GAP_RATIO),
    vertical: Math.max(MIN_WALL_LENGTH_PX, dimensions.height * OCCLUDED_BRIDGE_MAX_GAP_RATIO),
  }
  const connectionTolerance = Math.max(
    SUPPLEMENTAL_WALL_CONNECTION_TOLERANCE_PX,
    Math.round(Math.min(dimensions.width, dimensions.height) * 0.015),
  )

  const getAnchor = (candidate: RasterWallCandidate, along: number) =>
    walls.find((wall) => {
      if (removedIds.has(wall.id) || wall.axis === candidate.axis) {
        return false
      }
      const wallCenter = getRangeCenter(wall.band)
      const candidateCenter = getRangeCenter(candidate.band)
      return (
        Math.abs(wallCenter - along) <= connectionTolerance &&
        candidateCenter >= wall.segment.start - connectionTolerance &&
        candidateCenter <= wall.segment.end + connectionTolerance
      )
    })

  for (const candidate of walls) {
    if (
      removedIds.has(candidate.id) ||
      protectedIds.has(candidate.id) ||
      candidate.maxCollinearGap === undefined
    ) {
      continue
    }

    const target = walls
      .filter((wall) => {
        if (
          wall === candidate ||
          removedIds.has(wall.id) ||
          protectedIds.has(wall.id) ||
          wall.axis !== candidate.axis ||
          wall.maxCollinearGap === undefined ||
          wall.segment.start <= candidate.segment.end
        ) {
          return false
        }
        const bandTolerance = Math.max(
          6,
          Math.round((getRangeLength(candidate.band) + getRangeLength(wall.band)) / 2),
        )
        return (
          Math.abs(getRangeCenter(candidate.band) - getRangeCenter(wall.band)) <= bandTolerance &&
          getRangeGap(candidate.segment, wall.segment) <= maximumGapByAxis[candidate.axis]
        )
      })
      .sort((left, right) => left.segment.start - right.segment.start)[0]
    if (!target) {
      continue
    }

    const startAnchor = getAnchor(candidate, candidate.segment.end)
    const endAnchor = getAnchor(target, target.segment.start)
    if (!startAnchor || !endAnchor || startAnchor.id === endAnchor.id) {
      continue
    }

    const gapSegment = {
      start: candidate.segment.end + 1,
      end: target.segment.start - 1,
    }
    const axisMask =
      candidate.axis === 'horizontal' ? structuralMasks.horizontal : structuralMasks.vertical
    if (
      getRasterSpanStructuralDensity(candidate, gapSegment, axisMask, dimensions) <
      OCCLUDED_BRIDGE_MIN_STRUCTURAL_DENSITY
    ) {
      continue
    }

    candidate.band =
      getRangeLength(candidate.band) <= getRangeLength(target.band)
        ? { ...candidate.band }
        : { ...target.band }
    candidate.occludedSpans = [
      ...(candidate.occludedSpans ?? []),
      gapSegment,
      ...(target.occludedSpans ?? []),
    ]
    candidate.segment = mergeRanges(candidate.segment, target.segment)
    removedIds.add(target.id)
    bridgedWallIds.add(candidate.id)
  }

  return {
    bridgedWallIds,
    walls: walls.filter((wall) => !removedIds.has(wall.id)),
  }
}

export function supplementRasterWallCandidates(
  primaryWalls: RasterWallCandidate[],
  supplementalWalls: RasterWallCandidate[],
  dimensions: GuideDimensions,
  structuralMasks?: Pick<StructuralWallMasks, 'horizontal' | 'vertical'>,
) {
  const walls = primaryWalls.map((wall) => ({
    ...wall,
    band: { ...wall.band },
    segment: { ...wall.segment },
  }))
  const supplementedWallIds = new Set<string>()
  const minimumLength = Math.max(
    MIN_WALL_LENGTH_PX,
    Math.round(Math.min(dimensions.width, dimensions.height) * SUPPLEMENTAL_WALL_MIN_LENGTH_RATIO),
  )
  const connectionTolerance = Math.max(
    SUPPLEMENTAL_WALL_CONNECTION_TOLERANCE_PX,
    Math.round(Math.min(dimensions.width, dimensions.height) * 0.015),
  )
  let pending = mergeParallelThinRasterWallCandidates(supplementalWalls)
    .filter((wall) => getRangeLength(wall.segment) >= minimumLength)
    .map((wall) => ({
      ...wall,
      band: { ...wall.band },
      segment: { ...wall.segment },
    }))

  for (let pass = 0; pass < 3 && pending.length > 0; pass += 1) {
    const remaining: RasterWallCandidate[] = []
    let changed = false

    for (const candidate of pending) {
      const collinearTarget = findCollinearSupplementTarget(candidate, walls)
      if (collinearTarget) {
        const connections = getSupplementalOrthogonalConnections(
          candidate,
          walls,
          connectionTolerance,
        )
        const extendsStart = candidate.segment.start < collinearTarget.segment.start
        const extendsEnd = candidate.segment.end > collinearTarget.segment.end
        const extendsSupportedStart =
          extendsStart && connections.some((connection) => connection.candidateEndpoint === 'start')
        const extendsSupportedEnd =
          extendsEnd && connections.some((connection) => connection.candidateEndpoint === 'end')

        if (extendsSupportedStart || extendsSupportedEnd) {
          collinearTarget.segment = {
            start: extendsSupportedStart ? candidate.segment.start : collinearTarget.segment.start,
            end: extendsSupportedEnd ? candidate.segment.end : collinearTarget.segment.end,
          }
          supplementedWallIds.add(collinearTarget.id)
          changed = true
        }
        continue
      }

      const connections = getSupplementalOrthogonalConnections(
        candidate,
        walls,
        connectionTolerance,
      )
      const connectedEndpoints = new Set(
        connections.map((connection) => connection.candidateEndpoint),
      )
      if (
        connectedEndpoints.size === 2 &&
        connections.some((connection) => connection.terminatesWall)
      ) {
        walls.push(candidate)
        supplementedWallIds.add(candidate.id)
        changed = true
        continue
      }

      if (connectedEndpoints.size === 2 && structuralMasks) {
        const candidateCenter = getRangeCenter(candidate.band)
        const anchorCenters = walls
          .filter((wall) => {
            if (wall.axis === candidate.axis) {
              return false
            }

            const wallCenter = getRangeCenter(wall.band)
            return (
              wallCenter >= candidate.segment.start - connectionTolerance &&
              wallCenter <= candidate.segment.end + connectionTolerance &&
              candidateCenter >= wall.segment.start - connectionTolerance &&
              candidateCenter <= wall.segment.end + connectionTolerance
            )
          })
          .map((wall) => getRangeCenter(wall.band))
          .sort((left, right) => left - right)
          .filter((center, index, centers) => index === 0 || center - centers[index - 1]! > 2)
        const axisMask =
          candidate.axis === 'horizontal' ? structuralMasks.horizontal : structuralMasks.vertical
        const denseSpans = anchorCenters.slice(0, -1).flatMap((start, index) => {
          const end = anchorCenters[index + 1]!
          const segment = {
            start: Math.max(candidate.segment.start, Math.round(start)),
            end: Math.min(candidate.segment.end, Math.round(end)),
          }
          if (getRangeLength(segment) < minimumLength) {
            return []
          }

          if (
            getRasterSpanStructuralDensity(candidate, segment, axisMask, dimensions) <
            SUPPLEMENTAL_SPAN_MIN_STRUCTURAL_DENSITY
          ) {
            return []
          }

          return [
            {
              ...candidate,
              id: `${candidate.id}:anchored:${index + 1}`,
              segment,
            },
          ]
        })

        if (denseSpans.length > 0) {
          walls.push(...denseSpans)
          for (const wall of denseSpans) {
            supplementedWallIds.add(wall.id)
          }
          changed = true
          continue
        }
      }

      remaining.push(candidate)
    }

    pending = remaining
    if (!changed) {
      break
    }
  }

  return {
    supplementedWallIds,
    walls: dedupeRasterWallCandidates(walls),
  }
}

export function mergeParallelThinRasterWallCandidates(
  candidates: RasterWallCandidate[],
): RasterWallCandidate[] {
  const merged: RasterWallCandidate[] = []

  for (const candidate of [...candidates].sort((left, right) => {
    if (left.axis !== right.axis) {
      return left.axis.localeCompare(right.axis)
    }
    return left.band.start - right.band.start
  })) {
    const target = merged.find((existing) => {
      if (
        existing.axis !== candidate.axis ||
        getRangeLength(existing.band) > SUPPLEMENTAL_PARALLEL_MAX_THICKNESS_PX ||
        getRangeLength(candidate.band) > SUPPLEMENTAL_PARALLEL_MAX_THICKNESS_PX ||
        getRangeGap(existing.band, candidate.band) > SUPPLEMENTAL_PARALLEL_GAP_PX
      ) {
        return false
      }

      const overlap = getRangeOverlapLength(existing.segment, candidate.segment)
      const minimumSpan = Math.min(
        getRangeLength(existing.segment),
        getRangeLength(candidate.segment),
      )
      return overlap / Math.max(minimumSpan, 1) >= 0.82
    })

    if (target) {
      target.band = mergeRanges(target.band, candidate.band)
      target.segment = mergeRanges(target.segment, candidate.segment)
      continue
    }

    merged.push({
      ...candidate,
      band: { ...candidate.band },
      segment: { ...candidate.segment },
    })
  }

  return merged
}

export function extendRasterWallCandidatesWithThinLineSupport(
  primaryWalls: RasterWallCandidate[],
  thinLineMasks: StructuralWallMasks,
  dimensions: GuideDimensions,
  structureBounds: StructuralBounds,
) {
  const walls = primaryWalls.map((wall) => ({
    ...wall,
    band: { ...wall.band },
    segment: { ...wall.segment },
  }))
  const supplementedWallIds = new Set<string>()
  const minimumExistingWallLength = Math.max(
    MIN_WALL_LENGTH_PX,
    Math.round(Math.min(dimensions.width, dimensions.height) * SUPPLEMENTAL_WALL_MIN_LENGTH_RATIO),
  )

  for (const wall of walls) {
    if (getRangeLength(wall.segment) < minimumExistingWallLength) {
      continue
    }

    const bandCenter = getRangeCenter(wall.band)
    const bounds = wall.axis === 'horizontal' ? structureBounds.y : structureBounds.x
    const crossAxisLength = wall.axis === 'horizontal' ? dimensions.height : dimensions.width
    const edgeTolerance = Math.max(24, Math.round(crossAxisLength * 0.04))
    if (
      Math.abs(bandCenter - bounds.start) > edgeTolerance &&
      Math.abs(bandCenter - bounds.end) > edgeTolerance
    ) {
      continue
    }

    const axisLength = wall.axis === 'horizontal' ? dimensions.width : dimensions.height
    const axisMask = wall.axis === 'horizontal' ? thinLineMasks.horizontal : thinLineMasks.vertical
    const supportValues = Array.from({ length: axisLength }, (_, axisIndex) => {
      let support = 0
      for (let bandIndex = wall.band.start; bandIndex <= wall.band.end; bandIndex += 1) {
        const x = wall.axis === 'horizontal' ? axisIndex : bandIndex
        const y = wall.axis === 'horizontal' ? bandIndex : axisIndex
        if (axisMask[y * dimensions.width + x] === 1) {
          support += 1
        }
      }
      return support
    })
    const supportThreshold = Math.min(2, Math.max(1, getRangeLength(wall.band)))
    const supportedRanges = groupCoveredRangesWithGapTolerance(
      supportValues,
      supportThreshold,
      MIN_WALL_LENGTH_PX,
      32,
      0.42,
    )

    for (const supportedRange of supportedRanges) {
      if (getRangeGap(wall.segment, supportedRange) > SUPPLEMENTAL_WALL_COLLINEAR_GAP_PX) {
        continue
      }

      const mergedSegment = mergeRanges(wall.segment, supportedRange)
      if (mergedSegment.start !== wall.segment.start || mergedSegment.end !== wall.segment.end) {
        wall.segment = mergedSegment
        supplementedWallIds.add(wall.id)
      }
    }
  }

  return { supplementedWallIds, walls }
}

export function filterDecorativeThinRasterWalls(
  rasterCandidates: RasterWallCandidate[],
  decorativeThinWallRatio = DECORATIVE_THIN_WALL_RATIO,
  dimensions?: GuideDimensions,
) {
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
    Math.round(dominantThickness * decorativeThinWallRatio),
  )

  const minimumBoundaryThickness = Math.max(
    MIN_WALL_THICKNESS_PX,
    Math.ceil(dominantThickness * 0.58),
  )

  return rasterCandidates.flatMap((candidate) => {
    const thickness = getRangeLength(candidate.band)
    if (thickness >= minAcceptedThickness) {
      return [candidate]
    }
    if (!dimensions || thickness < minimumBoundaryThickness) {
      return []
    }

    const axisLength = candidate.axis === 'horizontal' ? dimensions.width : dimensions.height
    if (getRangeLength(candidate.segment) < axisLength * 0.18) {
      return []
    }

    const perpendicularCenters = rasterCandidates
      .filter(
        (wall) => wall.axis !== candidate.axis && getRangeLength(wall.band) >= minAcceptedThickness,
      )
      .map((wall) => getRangeCenter(wall.band))
    if (perpendicularCenters.length < 2) {
      return []
    }

    const boundaryStart = Math.min(...perpendicularCenters)
    const boundaryEnd = Math.max(...perpendicularCenters)
    const boundaryTolerance = Math.max(18, axisLength * 0.025)
    const isBoundaryAnchored =
      isNearRangeEndpoint(boundaryStart, candidate.segment, boundaryTolerance) ||
      isNearRangeEndpoint(boundaryEnd, candidate.segment, boundaryTolerance)

    return isBoundaryAnchored ? [{ ...candidate, boundaryAnchored: true }] : []
  })
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
      ? filterDecorativeThinRasterWalls(
          sampledCandidates,
          options.decorativeThinWallRatio,
          sampleDimensions,
        )
      : sampledCandidates
  const mergedCandidates = mergeCollinearRasterWallCandidates(thicknessFilteredCandidates, {
    horizontal: Math.max(
      options.segmentGapTolerance,
      Math.round(sampleDimensions.width * COLLINEAR_WALL_MAX_GAP_RATIO),
    ),
    vertical: Math.max(
      options.segmentGapTolerance,
      Math.round(sampleDimensions.height * COLLINEAR_WALL_MAX_GAP_RATIO),
    ),
  })
  const dedupedCandidates = dedupeRasterWallCandidates(mergedCandidates)
  const rasterWalls = filterDisconnectedRasterWalls(dedupedCandidates, true)

  return {
    rasterWalls,
    rasterWallStages: {
      deduped: dedupedCandidates,
      merged: mergedCandidates,
      sampled: sampledCandidates,
      thicknessFiltered: thicknessFilteredCandidates,
    },
    structureBounds,
  }
}

export function refineWideSteppedHorizontalPerimeter(
  perimeter: {
    perimeterWallIds: Set<string>
    walls: RasterWallCandidate[]
  },
  horizontalMask: Uint8ClampedArray,
  dimensions: GuideDimensions,
) {
  const walls = perimeter.walls.map((wall) => ({
    ...wall,
    band: { ...wall.band },
    segment: { ...wall.segment },
  }))
  const perimeterWallIds = new Set(perimeter.perimeterWallIds)
  const rowCounts = Array.from({ length: dimensions.height }, (_, y) => {
    let count = 0
    for (let x = 0; x < dimensions.width; x += 1) {
      count += horizontalMask[y * dimensions.width + x] === 1 ? 1 : 0
    }
    return count
  })
  const minimumWideBandThickness = Math.max(30, dimensions.height * 0.025)
  const segmentGapTolerance = Math.min(
    WALL_SEGMENT_GAP_TOLERANCE_PX,
    Math.max(16, Math.round(dimensions.width * 0.12)),
  )

  for (const wall of [...walls]) {
    if (
      wall.axis !== 'horizontal' ||
      !perimeterWallIds.has(wall.id) ||
      getRangeLength(wall.band) < minimumWideBandThickness
    ) {
      continue
    }

    const cores = refineWideDenseBands(
      rowCounts,
      [wall.band],
      Math.max(dimensions.width * COLOR_FILL_WALL_DENSITY_THRESHOLD, MIN_WALL_LENGTH_PX),
      MIN_WALL_THICKNESS_PX,
    )
    if (cores.length !== 2) {
      continue
    }

    const coreRuns = cores.map((core) => {
      const columnCounts = Array.from({ length: dimensions.width }, (_, x) => {
        let count = 0
        for (let y = core.start; y <= core.end; y += 1) {
          count += horizontalMask[y * dimensions.width + x] === 1 ? 1 : 0
        }
        return count
      })
      const segments = groupCoveredRangesWithGapTolerance(
        columnCounts,
        Math.max(getRangeLength(core) * WALL_SOLIDITY_THRESHOLD, 1),
        MIN_WALL_LENGTH_PX,
        segmentGapTolerance,
        0.42,
        true,
      ).filter((segment) => segment.end >= wall.segment.start && segment.start <= wall.segment.end)
      return { core, segments }
    })
    const endpointTolerance = Math.max(18, dimensions.width * 0.025)
    const endpointEvidenceDepth = Math.max(endpointTolerance * 2, dimensions.width * 0.06)
    const getEndpointEvidenceScore = (segments: Range[]) =>
      segments.reduce((score, segment) => {
        const leftSupport = Math.max(
          0,
          Math.min(segment.end, wall.segment.start + endpointEvidenceDepth) -
            Math.max(segment.start, wall.segment.start) +
            1,
        )
        const rightSupport = Math.max(
          0,
          Math.min(segment.end, wall.segment.end) -
            Math.max(segment.start, wall.segment.end - endpointEvidenceDepth) +
            1,
        )
        return score + leftSupport + rightSupport
      }, 0)
    const outer = [...coreRuns]
      .filter(
        ({ segments }) =>
          segments.some((segment) => segment.start <= wall.segment.start + endpointTolerance) &&
          segments.some((segment) => segment.end >= wall.segment.end - endpointTolerance),
      )
      .sort(
        (left, right) =>
          getEndpointEvidenceScore(right.segments) - getEndpointEvidenceScore(left.segments),
      )[0]
    const offset = coreRuns.find((candidate) => candidate !== outer)
    if (!outer || !offset || outer.segments.length < 2 || offset.segments.length === 0) {
      continue
    }

    const sortedOuterSegments = [...outer.segments].sort((left, right) => left.start - right.start)
    const outerStart = sortedOuterSegments[0]!
    const outerEnd = sortedOuterSegments[sortedOuterSegments.length - 1]!
    const offsetSegment = [...offset.segments]
      .filter(
        (segment) =>
          segment.start > outerStart.start + endpointTolerance &&
          segment.end < outerEnd.end - endpointTolerance,
      )
      .sort((left, right) => getRangeLength(right) - getRangeLength(left))[0]
    if (!offsetSegment) {
      continue
    }

    const outerLeft = [...sortedOuterSegments]
      .filter(
        (segment) => segment.start <= offsetSegment.start && segment.end >= offsetSegment.start,
      )
      .sort((left, right) => right.end - left.end)[0]
    const outerRight = [...sortedOuterSegments]
      .filter((segment) => segment.start <= offsetSegment.end && segment.end >= offsetSegment.end)
      .sort((left, right) => left.start - right.start)[0]
    if (!outerLeft || !outerRight || outerLeft === outerRight) {
      continue
    }

    const leftConnectorBand = {
      start: Math.max(outerLeft.start, offsetSegment.start),
      end: Math.min(outerLeft.end, offsetSegment.end),
    }
    const rightConnectorBand = {
      start: Math.max(outerRight.start, offsetSegment.start),
      end: Math.min(outerRight.end, offsetSegment.end),
    }
    if (
      getRangeLength(leftConnectorBand) < MIN_WALL_THICKNESS_PX ||
      getRangeLength(rightConnectorBand) < MIN_WALL_THICKNESS_PX
    ) {
      continue
    }

    const replacementWalls: RasterWallCandidate[] = [
      {
        ...wall,
        band: { ...outer.core },
        segment: { start: wall.segment.start, end: outerLeft.end },
      },
      {
        ...wall,
        band: { ...outer.core },
        id: `${wall.id}:step:right`,
        segment: { start: outerRight.start, end: wall.segment.end },
      },
      {
        ...wall,
        band: { ...offset.core },
        id: `${wall.id}:step:offset`,
        segment: { ...offsetSegment },
      },
      {
        axis: 'vertical',
        band: leftConnectorBand,
        id: `${wall.id}:step:left-connector`,
        perimeterConnector: true,
        segment: {
          start: Math.round(Math.min(getRangeCenter(outer.core), getRangeCenter(offset.core))),
          end: Math.round(Math.max(getRangeCenter(outer.core), getRangeCenter(offset.core))),
        },
      },
      {
        axis: 'vertical',
        band: rightConnectorBand,
        id: `${wall.id}:step:right-connector`,
        perimeterConnector: true,
        segment: {
          start: Math.round(Math.min(getRangeCenter(outer.core), getRangeCenter(offset.core))),
          end: Math.round(Math.max(getRangeCenter(outer.core), getRangeCenter(offset.core))),
        },
      },
    ]
    const wallIndex = walls.findIndex((candidate) => candidate.id === wall.id)
    walls.splice(wallIndex, 1, ...replacementWalls)
    for (const replacement of replacementWalls) {
      perimeterWallIds.add(replacement.id)
    }
  }

  return { perimeterWallIds, walls }
}

function buildWallCandidates(
  guide: GuideNode,
  guideDimensions: GuideDimensions,
  rasterCandidates: RasterWallCandidate[],
  sampleOffset: { x: number; y: number },
): GuideDetectionWallCandidate[] {
  return rasterCandidates
    .filter(
      (candidate) =>
        candidate.perimeterConnector ||
        pxToPlanLength(
          guide,
          guideDimensions,
          getRangeLength(candidate.segment),
          candidate.axis === 'horizontal' ? 'x' : 'y',
        ) >= 0.8,
    )
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

export function splitRasterWallsAtLongUnsupportedSpans(
  candidates: RasterWallCandidate[],
  masks: Pick<StructuralWallMasks, 'horizontal' | 'vertical'>,
  dimensions: GuideDimensions,
  maximumUnsupportedSpanByAxis: { horizontal: number; vertical: number },
  minimumRetainedLengthByAxis: { horizontal: number; vertical: number },
  protectedIds = new Set<string>(),
  shouldPreserveUnsupportedRange?: (candidate: RasterWallCandidate, range: Range) => boolean,
) {
  const splitWallIds = new Set<string>()
  const walls = candidates.flatMap((candidate) => {
    if (protectedIds.has(candidate.id)) {
      return [
        {
          ...candidate,
          band: { ...candidate.band },
          segment: { ...candidate.segment },
        },
      ]
    }

    const axisMask = candidate.axis === 'horizontal' ? masks.horizontal : masks.vertical
    const supportValues = Array.from({ length: getRangeLength(candidate.segment) }, (_, offset) => {
      const axisIndex = candidate.segment.start + offset
      let support = 0
      for (let bandIndex = candidate.band.start; bandIndex <= candidate.band.end; bandIndex += 1) {
        const x = candidate.axis === 'horizontal' ? axisIndex : bandIndex
        const y = candidate.axis === 'horizontal' ? bandIndex : axisIndex
        if (
          x >= 0 &&
          x < dimensions.width &&
          y >= 0 &&
          y < dimensions.height &&
          axisMask[y * dimensions.width + x] === 1
        ) {
          support += 1
        }
      }
      return support
    })
    const supportTarget = getSampleSupportTarget(supportValues, getRangeLength(candidate.band))
    const lowSupportThreshold = Math.max(
      1,
      Math.floor(supportTarget * (1 - VOID_OPENING_SIGNAL_RATIO)),
    )
    const lowSupportSignal = supportValues.map((value) => (value <= lowSupportThreshold ? 1 : 0))
    const maximumUnsupportedSpan = maximumUnsupportedSpanByAxis[candidate.axis]
    const unsupportedRanges = groupDenseRangesWithGapTolerance(
      lowSupportSignal,
      1,
      maximumUnsupportedSpan + 1,
      UNSUPPORTED_WALL_SIGNAL_GAP_TOLERANCE_PX,
    )
      .filter((range) => {
        const unsupportedCount = lowSupportSignal
          .slice(range.start, range.end + 1)
          .reduce<number>((sum, value) => sum + value, 0)
        return unsupportedCount / Math.max(getRangeLength(range), 1) >= UNSUPPORTED_WALL_MIN_RATIO
      })
      .map((range) => ({
        start: candidate.segment.start + range.start,
        end: candidate.segment.start + range.end,
      }))
      .filter((range) => !shouldPreserveUnsupportedRange?.(candidate, range))

    if (unsupportedRanges.length === 0) {
      return [
        {
          ...candidate,
          band: { ...candidate.band },
          segment: { ...candidate.segment },
        },
      ]
    }

    const retainedRanges: Range[] = []
    let retainedStart = candidate.segment.start
    for (const unsupportedRange of unsupportedRanges) {
      if (unsupportedRange.start > retainedStart) {
        retainedRanges.push({ start: retainedStart, end: unsupportedRange.start - 1 })
      }
      retainedStart = Math.max(retainedStart, unsupportedRange.end + 1)
    }
    if (retainedStart <= candidate.segment.end) {
      retainedRanges.push({ start: retainedStart, end: candidate.segment.end })
    }

    const minimumRetainedLength = minimumRetainedLengthByAxis[candidate.axis]
    const retainedWalls = retainedRanges
      .filter((range) => getRangeLength(range) >= minimumRetainedLength)
      .map((segment, index) => ({
        ...candidate,
        id: `${candidate.id}:part:${index + 1}`,
        band: { ...candidate.band },
        segment,
      }))

    splitWallIds.add(candidate.id)
    return retainedWalls
  })

  return { splitWallIds, walls }
}

export function buildOpeningSignalCandidates(
  structuralSamples: number[],
  rawDarkSamples: number[],
  wallThicknessPx: number,
  rawSupportTargetPx = wallThicknessPx,
  keepModesSeparate = true,
) {
  const missingStructural = structuralSamples.map((value) => Math.max(0, wallThicknessPx - value))
  const missingRaw = rawDarkSamples.map((value) => Math.max(0, rawSupportTargetPx - value))
  const mergeSameModeRanges = (
    ranges: Range[],
    mode: OpeningSignalCandidate['mode'],
  ): OpeningSignalCandidate[] => {
    const sortedRanges = ranges.sort((left, right) => left.start - right.start)
    if (sortedRanges.length === 0) {
      return []
    }

    const merged: OpeningSignalCandidate[] = [{ mode, range: { ...sortedRanges[0]! } }]
    for (const range of sortedRanges.slice(1)) {
      const previous = merged[merged.length - 1]!
      if (getRangeGap(previous.range, range) <= OPENING_SIGNAL_GAP_TOLERANCE_PX) {
        previous.range = mergeRanges(previous.range, range)
        continue
      }

      merged.push({ mode, range: { ...range } })
    }
    return merged
  }

  const voidRanges = groupDenseRanges(
    missingStructural,
    Math.max(wallThicknessPx * VOID_OPENING_SIGNAL_RATIO, 1),
    MIN_GAP_LENGTH_PX,
  )
  const framedRanges = groupDenseRanges(
    missingRaw,
    Math.max(rawSupportTargetPx * FRAMED_OPENING_SIGNAL_RATIO, 1),
    MIN_GAP_LENGTH_PX,
  )

  const separatedRanges = [
    ...mergeSameModeRanges(voidRanges, 'void'),
    ...mergeSameModeRanges(framedRanges, 'framed'),
  ].sort((left, right) => left.range.start - right.range.start)

  if (keepModesSeparate || separatedRanges.length <= 1) {
    return separatedRanges
  }

  const merged: OpeningSignalCandidate[] = [
    { ...separatedRanges[0]!, range: { ...separatedRanges[0]!.range } },
  ]
  for (const candidate of separatedRanges.slice(1)) {
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

export function resolveOverlappingOpeningSignals<Candidate extends EvaluatedOpeningSignalCandidate>(
  candidates: Candidate[],
): Candidate[] {
  return candidates.filter((candidate) => {
    const overlappingOtherMode = candidates.filter(
      (other) =>
        other !== candidate &&
        other.mode !== candidate.mode &&
        getRangeGap(other.range, candidate.range) <= OPENING_SIGNAL_GAP_TOLERANCE_PX,
    )
    if (overlappingOtherMode.length === 0) {
      return true
    }

    if (candidate.mode === 'void') {
      return (
        candidate.hasDoorSwing ||
        overlappingOtherMode.some(
          (other) => getRangeLength(other.range) <= getRangeLength(candidate.range) * 1.25,
        )
      )
    }

    return !overlappingOtherMode.some(
      (other) =>
        other.hasDoorSwing || getRangeLength(candidate.range) <= getRangeLength(other.range) * 1.25,
    )
  })
}

function hasDoorSwingSignal(
  rawDarkMask: Uint8ClampedArray,
  sampleDimensions: GuideDimensions,
  wall: RasterWallCandidate,
  gap: Range,
  width: number,
  maxWidthMeters = DOOR_SWING_MAX_WIDTH_METERS,
  requireArcEvidence = false,
) {
  if (width < DOOR_SWING_MIN_WIDTH_METERS || width > maxWidthMeters) {
    return false
  }

  const interiorRoomSide =
    wall.axis === 'horizontal'
      ? getRangeCenter(wall.band) < sampleDimensions.height / 2
        ? 1
        : -1
      : getRangeCenter(wall.band) < sampleDimensions.width / 2
        ? 1
        : -1
  const evidence = getDoorSwingEvidence(
    rawDarkMask,
    sampleDimensions,
    wall,
    gap,
    requireArcEvidence ? [interiorRoomSide] : undefined,
  )
  return requireArcEvidence ? evidence.strictSignal : evidence.hasSignal
}

export function getOpeningKind(
  mode: OpeningSignalCandidate['mode'],
  width: number,
  hasDoorSwing = false,
  preferWindowWithoutDoorSwing = false,
) {
  if (hasDoorSwing) {
    return 'door' as const
  }

  if (preferWindowWithoutDoorSwing) {
    return 'window' as const
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
  allowAdaptiveEdgeFlanks = false,
) {
  if (
    gap.start < 0 ||
    gap.end >= structuralSamples.length ||
    gap.end - gap.start + 1 < MIN_GAP_LENGTH_PX
  ) {
    return false
  }

  const availableLeftFlank = gap.start
  const availableRightFlank = structuralSamples.length - 1 - gap.end
  const edgeBuffer = Math.max(
    MIN_OPENING_EDGE_BUFFER_PX,
    Math.min(18, Math.round(structuralSamples.length * 0.08)),
  )
  if (
    !allowAdaptiveEdgeFlanks &&
    (gap.start < edgeBuffer || gap.end > structuralSamples.length - 1 - edgeBuffer)
  ) {
    return false
  }

  if (
    availableLeftFlank < MIN_OPENING_FLANK_SUPPORT_PX ||
    availableRightFlank < MIN_OPENING_FLANK_SUPPORT_PX
  ) {
    return false
  }

  const preferredFlankSupport = Math.max(
    MIN_OPENING_FLANK_SUPPORT_PX,
    Math.min(18, Math.round(structuralSamples.length * 0.1)),
  )
  const flankSupport = allowAdaptiveEdgeFlanks
    ? Math.min(preferredFlankSupport, availableLeftFlank, availableRightFlank)
    : preferredFlankSupport
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
  useColoredPlanOpeningSemantics = false,
  useExteriorOpeningSemantics = false,
): GuideDetectionOpeningCandidate[] {
  const samplingBand = wall.openingSampleBand ?? wall.band
  const structuralSamples: number[] =
    wall.axis === 'horizontal'
      ? Array.from({ length: wall.segment.end - wall.segment.start + 1 }, (_, offset) => {
          const x = wall.segment.start + offset
          let dark = 0
          for (let y = samplingBand.start; y <= samplingBand.end; y += 1) {
            if (wallMask[y * sampleDimensions.width + x] === 1) dark += 1
          }
          return dark
        })
      : Array.from({ length: wall.segment.end - wall.segment.start + 1 }, (_, offset) => {
          const y = wall.segment.start + offset
          let dark = 0
          for (let x = samplingBand.start; x <= samplingBand.end; x += 1) {
            if (wallMask[y * sampleDimensions.width + x] === 1) dark += 1
          }
          return dark
        })

  const rawDarkSamples: number[] =
    wall.axis === 'horizontal'
      ? Array.from({ length: wall.segment.end - wall.segment.start + 1 }, (_, offset) => {
          const x = wall.segment.start + offset
          let dark = 0
          for (let y = samplingBand.start; y <= samplingBand.end; y += 1) {
            if (rawDarkMask[y * sampleDimensions.width + x] === 1) dark += 1
          }
          return dark
        })
      : Array.from({ length: wall.segment.end - wall.segment.start + 1 }, (_, offset) => {
          const y = wall.segment.start + offset
          let dark = 0
          for (let x = samplingBand.start; x <= samplingBand.end; x += 1) {
            if (rawDarkMask[y * sampleDimensions.width + x] === 1) dark += 1
          }
          return dark
        })

  const wallThicknessPx = getRangeLength(samplingBand)
  const structuralSupportTargetPx = getSampleSupportTarget(structuralSamples, wallThicknessPx)
  const rawSupportTargetPx = getSampleSupportTarget(rawDarkSamples, wallThicknessPx)

  const evaluatedSignals = buildOpeningSignalCandidates(
    structuralSamples,
    rawDarkSamples,
    structuralSupportTargetPx,
    rawSupportTargetPx,
    useColoredPlanOpeningSemantics,
  ).flatMap(({ mode, range }, index) => {
    const absoluteRange = {
      start: wall.segment.start + range.start,
      end: wall.segment.start + range.end,
    }
    if (
      wall.occludedSpans?.some(
        (span) =>
          getRangeOverlapLength(span, absoluteRange) / Math.max(getRangeLength(span), 1) >= 0.6,
      )
    ) {
      return []
    }

    if (
      !isGapLikelyOpening(
        structuralSamples,
        rawDarkSamples,
        range,
        structuralSupportTargetPx,
        mode,
        rawSupportTargetPx,
        useColoredPlanOpeningSemantics,
      )
    ) {
      return []
    }

    const gapLengthPx = range.end - range.start + 1
    const width = pxToPlanLength(
      guide,
      guideDimensions,
      gapLengthPx,
      wall.axis === 'horizontal' ? 'x' : 'y',
    )
    if (width < MIN_OPENING_WIDTH_METERS || width > MAX_OPENING_WIDTH_METERS) {
      return []
    }

    return [
      {
        hasDoorSwing: hasDoorSwingSignal(
          rawDarkMask,
          sampleDimensions,
          wall,
          range,
          width,
          useColoredPlanOpeningSemantics
            ? COLOR_PLAN_DOOR_SWING_MAX_WIDTH_METERS
            : DOOR_SWING_MAX_WIDTH_METERS,
          useExteriorOpeningSemantics,
        ),
        index,
        mode,
        range,
        width,
      },
    ]
  })

  return resolveOverlappingOpeningSignals(evaluatedSignals).map(
    ({ hasDoorSwing, index, mode, range, width }) => {
      const kind = getOpeningKind(mode, width, hasDoorSwing, useExteriorOpeningSemantics)

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
    },
  )
}

function buildOpeningCandidates(
  structuralMasks: StructuralWallMasks,
  rawDarkMask: Uint8ClampedArray,
  sampleDimensions: GuideDimensions,
  guide: GuideNode,
  guideDimensions: GuideDimensions,
  rasterWalls: RasterWallCandidate[],
  sampleOffset: { x: number; y: number },
  supplementalMasks: StructuralWallMasks | null = null,
  supplementedWallIds = new Set<string>(),
  useColoredPlanOpeningSemantics = false,
  exteriorWallIds = new Set<string>(),
) {
  return rasterWalls.flatMap((wall) => {
    const wallMasks = supplementedWallIds.has(wall.id)
      ? (supplementalMasks ?? structuralMasks)
      : structuralMasks
    return sampleOpeningsForWall(
      wall.axis === 'horizontal' ? wallMasks.horizontal : wallMasks.vertical,
      rawDarkMask,
      sampleDimensions,
      guide,
      guideDimensions,
      sampleOffset,
      wall,
      useColoredPlanOpeningSemantics,
      exteriorWallIds.has(wall.id),
    )
  })
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
  // Keep browser detection aligned with the offline debug runner, which uses
  // deterministic nearest-neighbour resizing for reproducible candidates.
  context.imageSmoothingEnabled = false
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
  const coloredFillRatio = getColoredFillRatio(imageData)
  const isColoredPlan = coloredFillRatio >= COLOR_FILL_RATIO_THRESHOLD
  const darkThreshold = getAdaptiveDarkThreshold(
    brightness,
    isColoredPlan ? ADAPTIVE_DARK_PERCENTILE : DEFAULT_DARK_PERCENTILE,
  )
  const rawDarkMask = buildBinaryDarkMask(brightness, sampleDimensions, darkThreshold)
  const structuralMasks = buildStructuralWallMasks(brightness, sampleDimensions, darkThreshold)
  const structuralResult = sampleRasterWallCandidates(
    structuralMasks,
    sampleDimensions,
    guideDimensions,
    sampleOffset,
    isColoredPlan ? colorFillStructuralWallSamplingOptions : structuralWallSamplingOptions,
  )
  const thinLineMasks = buildThinLineWallMasks(brightness, sampleDimensions, darkThreshold)
  const thinLineResult = sampleRasterWallCandidates(
    thinLineMasks,
    sampleDimensions,
    guideDimensions,
    sampleOffset,
    thinLineWallSamplingOptions,
  )
  let detectionMode: GuideDetectionDebugSnapshot['detectionMode'] = 'structural'
  let selectedMasks = structuralMasks
  let openingMasks = structuralMasks
  let supplementedWallIds = new Set<string>()
  let splitWallIds = new Set<string>()
  let exteriorWallIds = new Set<string>()
  let structureBounds = structuralResult.structureBounds
  let rasterWalls = structuralResult.rasterWalls
  let rasterWallStages = structuralResult.rasterWallStages

  if (rasterWalls.length < THIN_LINE_FALLBACK_MIN_WALL_COUNT) {
    if (thinLineResult.rasterWalls.length > rasterWalls.length) {
      detectionMode = 'thin-line'
      selectedMasks = thinLineMasks
      openingMasks = thinLineMasks
      structureBounds = thinLineResult.structureBounds
      rasterWalls = thinLineResult.rasterWalls
      rasterWallStages = thinLineResult.rasterWallStages
    }
  } else if (isColoredPlan) {
    const rectangularPerimeter = closeRectangularRasterWallPerimeter(
      rasterWalls,
      structuralResult.rasterWallStages.deduped,
      sampleDimensions,
    )
    const perimeter = refineWideSteppedHorizontalPerimeter(
      rectangularPerimeter,
      structuralMasks.horizontal,
      sampleDimensions,
    )
    exteriorWallIds = perimeter.perimeterWallIds
    const perimeterAlignedWalls = alignPerimeterRasterWallsToBroadLocalEvidence(
      perimeter.walls,
      thinLineResult.rasterWallStages.deduped,
      perimeter.perimeterWallIds,
    )
    const thicknessFilteredWalls = filterRasterWallThicknessOutliers(
      perimeterAlignedWalls,
      sampleDimensions,
      perimeter.perimeterWallIds,
    )
    const parallelMergedWalls = mergeAdjacentParallelRasterWalls(
      thicknessFilteredWalls,
      8,
      perimeter.perimeterWallIds,
    )
    const bridged = bridgeRasterWallsAcrossAnchoredOcclusions(
      parallelMergedWalls,
      structuralMasks,
      sampleDimensions,
      perimeter.perimeterWallIds,
    )
    const extended = extendRasterWallCandidatesWithThinLineSupport(
      bridged.walls,
      thinLineMasks,
      sampleDimensions,
      structuralResult.structureBounds,
    )
    const supplemented = supplementRasterWallCandidates(
      extended.walls,
      thinLineResult.rasterWallStages.deduped,
      sampleDimensions,
      structuralMasks,
    )
    const shadowFilteredWalls = filterShortParallelShadowRasterWalls(
      supplemented.walls,
      sampleDimensions,
      perimeter.perimeterWallIds,
    )
    const { planHeight, planWidth } = getGuidePlanSize(guide, guideDimensions)
    const splitProtectedIds = new Set([
      ...perimeter.perimeterWallIds,
      ...parallelMergedWalls
        .filter((wall) => wall.parallelEvidenceSupported)
        .map((wall) => wall.id),
      ...bridged.bridgedWallIds,
      ...extended.supplementedWallIds,
      ...supplemented.supplementedWallIds,
    ])
    const split = splitRasterWallsAtLongUnsupportedSpans(
      shadowFilteredWalls,
      structuralMasks,
      sampleDimensions,
      {
        horizontal: Math.max(
          MIN_WALL_LENGTH_PX,
          Math.round((MAX_INTERIOR_UNSUPPORTED_SPAN_METERS / planWidth) * guideDimensions.width),
        ),
        vertical: Math.max(
          MIN_WALL_LENGTH_PX,
          Math.round((MAX_INTERIOR_UNSUPPORTED_SPAN_METERS / planHeight) * guideDimensions.height),
        ),
      },
      {
        horizontal: Math.max(
          MIN_WALL_LENGTH_PX,
          Math.round((MIN_SPLIT_WALL_LENGTH_METERS / planWidth) * guideDimensions.width),
        ),
        vertical: Math.max(
          MIN_WALL_LENGTH_PX,
          Math.round((MIN_SPLIT_WALL_LENGTH_METERS / planHeight) * guideDimensions.height),
        ),
      },
      splitProtectedIds,
      (candidate, unsupportedRange) =>
        hasStrongColorBoundaryAcrossRasterWall(imageData, candidate, unsupportedRange),
    )
    splitWallIds = split.splitWallIds
    rasterWalls = filterShortDanglingRasterWalls(
      split.walls,
      sampleDimensions,
      perimeter.perimeterWallIds,
    )
    const survivingWallIds = new Set(rasterWalls.map((wall) => wall.id))
    supplementedWallIds = new Set(
      [...extended.supplementedWallIds, ...supplemented.supplementedWallIds].filter((id) =>
        survivingWallIds.has(id),
      ),
    )
    if (supplementedWallIds.size > 0) {
      detectionMode = 'hybrid'
      openingMasks = combineStructuralWallMasks(structuralMasks, thinLineMasks)
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
    openingMasks,
    supplementedWallIds,
    isColoredPlan,
    exteriorWallIds,
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
    rasterWallStages,
    sampleDimensions,
    sampleOffset,
    splitWallIds: [...splitWallIds],
    structureBounds,
    supplementalRasterWalls: thinLineResult.rasterWallStages.deduped,
    supplementedWallIds: [...supplementedWallIds],
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

export function applyDetectedGuideModel(
  levelId: AnyNodeId,
  candidates: GuideDetectionCandidates,
  createNode: CreateNode,
) {
  const selectedCandidates = getSelectedGuideDetectionCandidates(candidates)
  const selectedWallIds = new Set(selectedCandidates.walls.map((wall) => wall.id))
  const appliedWallEntries = Object.entries(candidates.appliedWallIds ?? {}).filter(
    ([candidateId]) => selectedWallIds.has(candidateId),
  ) as Array<[string, WallNodeId]>
  const wallIdMap = new Map<string, WallNodeId>(appliedWallEntries)
  const missingWalls = selectedCandidates.walls.filter((wall) => !wallIdMap.has(wall.id))

  if (missingWalls.length > 0) {
    const createdWallIds = applyDetectedWalls(
      levelId,
      {
        ...selectedCandidates,
        selectedWallIds: missingWalls.map((wall) => wall.id),
        walls: missingWalls,
      },
      createNode,
    )
    for (const [candidateId, wallId] of createdWallIds) {
      wallIdMap.set(candidateId, wallId)
    }
  }

  const openingCount = applyDetectedOpenings(
    selectedCandidates,
    wallIdMap,
    createNode,
    selectedCandidates.walls,
  )

  return {
    openingCount,
    wallCount: wallIdMap.size,
    wallIdMap,
  }
}
