type ImageDataLike = {
  data: Uint8ClampedArray
  height: number
  width: number
}

type Range = {
  end: number
  start: number
}

type RasterWallLike = {
  axis: 'horizontal' | 'vertical'
  band: Range
}

type RgbMean = [number, number, number]

const MIN_ROOM_FILL_BRIGHTNESS = 100
const MAX_ROOM_FILL_BRIGHTNESS = 248
const MAX_ROOM_FILL_CHANNEL_SPREAD = 90
const MIN_COLOR_BOUNDARY_DISTANCE = 18
const MIN_AVERAGE_COLOR_BOUNDARY_DISTANCE = 26

function getRangeLength(range: Range) {
  return range.end - range.start + 1
}

function getRangeCenter(range: Range) {
  return (range.start + range.end) / 2
}

function getRoomFillMean(
  imageData: ImageDataLike,
  wall: RasterWallLike,
  segment: Range,
  perpendicularOffset: number,
  side: -1 | 1,
): RgbMean | null {
  const segmentLength = getRangeLength(segment)
  const trim = Math.min(8, Math.floor(segmentLength * 0.08))
  const start = segment.start + trim
  const end = segment.end - trim
  const wallCenter = getRangeCenter(wall.band)
  const sums: RgbMean = [0, 0, 0]
  let sampleCount = 0

  for (let along = start; along <= end; along += 1) {
    const x = Math.round(
      wall.axis === 'horizontal' ? along : wallCenter + perpendicularOffset * side,
    )
    const y = Math.round(
      wall.axis === 'horizontal' ? wallCenter + perpendicularOffset * side : along,
    )
    if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
      continue
    }

    const pixelIndex = (y * imageData.width + x) * 4
    const red = imageData.data[pixelIndex] ?? 255
    const green = imageData.data[pixelIndex + 1] ?? 255
    const blue = imageData.data[pixelIndex + 2] ?? 255
    const brightness = (red + green + blue) / 3
    const channelSpread = Math.max(red, green, blue) - Math.min(red, green, blue)
    if (
      brightness < MIN_ROOM_FILL_BRIGHTNESS ||
      brightness > MAX_ROOM_FILL_BRIGHTNESS ||
      channelSpread > MAX_ROOM_FILL_CHANNEL_SPREAD
    ) {
      continue
    }

    sums[0] += red
    sums[1] += green
    sums[2] += blue
    sampleCount += 1
  }

  if (sampleCount < Math.max(8, (end - start + 1) * 0.25)) {
    return null
  }

  return sums.map((sum) => sum / sampleCount) as RgbMean
}

function getColorDistance(left: RgbMean, right: RgbMean) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
}

/**
 * Detects a room-fill discontinuity hidden behind furniture or door-frame ink. Two distances are
 * sampled outside the wall band so a single cabinet edge or annotation line cannot preserve an
 * otherwise unsupported wall.
 */
export function hasStrongColorBoundaryAcrossRasterWall(
  imageData: ImageDataLike,
  wall: RasterWallLike,
  segment: Range,
) {
  const halfThickness = Math.ceil(getRangeLength(wall.band) / 2)
  const distances = [halfThickness + 4, halfThickness + 12]
  const colorDistances = distances.map((distance) => {
    const negativeSide = getRoomFillMean(imageData, wall, segment, distance, -1)
    const positiveSide = getRoomFillMean(imageData, wall, segment, distance, 1)
    return negativeSide && positiveSide ? getColorDistance(negativeSide, positiveSide) : 0
  })

  return (
    colorDistances.every((distance) => distance >= MIN_COLOR_BOUNDARY_DISTANCE) &&
    colorDistances.reduce((sum, distance) => sum + distance, 0) / colorDistances.length >=
      MIN_AVERAGE_COLOR_BOUNDARY_DISTANCE
  )
}
