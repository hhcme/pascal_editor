type Dimensions = {
  height: number
  width: number
}

type Range = {
  end: number
  start: number
}

export type RasterWallGeometryCandidate = {
  axis: 'horizontal' | 'vertical'
  band: Range
  id: string
  maxCollinearGap?: number
  openingSampleBand?: Range
  parallelEvidenceSupported?: boolean
  segment: Range
}

export type RectangularPerimeterResult<T extends RasterWallGeometryCandidate> = {
  perimeterWallIds: Set<string>
  walls: T[]
}

/**
 * Splits a broad projection band around its strongest dense cores. A real wall can otherwise be
 * merged with an adjacent lift/furniture block, making its cross-band solidity look too low.
 */
export function refineWideDenseBands(
  values: number[],
  bands: Range[],
  baseThreshold: number,
  minimumBandThickness: number,
): Range[] {
  const minimumWideBandThickness = Math.max(12, minimumBandThickness * 4)

  return bands.flatMap((band) => {
    if (getRangeLength(band) < minimumWideBandThickness) {
      return [{ ...band }]
    }

    let maximumDensity = 0
    for (let index = band.start; index <= band.end; index += 1) {
      maximumDensity = Math.max(maximumDensity, values[index] ?? 0)
    }

    const strongCoreThreshold = Math.max(baseThreshold, maximumDensity * 0.55)
    const cores: Range[] = []
    let coreStart = -1

    for (let index = band.start; index <= band.end + 1; index += 1) {
      if (index <= band.end && (values[index] ?? 0) >= strongCoreThreshold) {
        if (coreStart < 0) {
          coreStart = index
        }
        continue
      }

      if (coreStart >= 0 && index - coreStart >= minimumBandThickness) {
        cores.push({ start: coreStart, end: index - 1 })
      }
      coreStart = -1
    }

    return cores.length > 0 ? cores : [{ ...band }]
  })
}

export type DoorSwingEvidence = {
  arcCoverage: number
  hasSignal: boolean
  leafCoverage: number
  strictSignal: boolean
}

const DOOR_SWING_LEAF_START_RATIO = 0.18
const DOOR_SWING_LEAF_END_RATIO = 1.05
const DOOR_SWING_LEAF_MIN_COVERAGE = 0.62
const DOOR_SWING_STRONG_LEAF_COVERAGE = 0.82
const DOOR_SWING_ARC_MIN_COVERAGE = 0.2
const DOOR_SWING_STRICT_ARC_MIN_COVERAGE = 0.55
const DOOR_SWING_MAX_CLUTTER_RATIO = 0.18
const DOOR_SWING_SAMPLE_RADIUS_PX = 2

function getRangeLength(range: Range) {
  return range.end - range.start + 1
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

function getRangeOverlapLength(left: Range, right: Range) {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start) + 1)
}

function mergeRanges(left: Range, right: Range): Range {
  return {
    start: Math.min(left.start, right.start),
    end: Math.max(left.end, right.end),
  }
}

function hasMaskPixelNearPoint(
  mask: Uint8ClampedArray,
  dimensions: Dimensions,
  x: number,
  y: number,
  radius = DOOR_SWING_SAMPLE_RADIUS_PX,
) {
  const centerX = Math.round(x)
  const centerY = Math.round(y)

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    const sampleY = centerY + offsetY
    if (sampleY < 0 || sampleY >= dimensions.height) {
      continue
    }

    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const sampleX = centerX + offsetX
      if (
        sampleX >= 0 &&
        sampleX < dimensions.width &&
        mask[sampleY * dimensions.width + sampleX] === 1
      ) {
        return true
      }
    }
  }

  return false
}

function getDoorSwingRoomClutterRatio(
  mask: Uint8ClampedArray,
  dimensions: Dimensions,
  wall: RasterWallGeometryCandidate,
  gap: Range,
  roomSide: -1 | 1,
) {
  const wallCenter = getRangeCenter(wall.band)
  const gapStart = wall.segment.start + gap.start
  const gapEnd = wall.segment.start + gap.end
  const gapLength = getRangeLength(gap)
  let darkPixels = 0
  let samples = 0

  for (let alongWall = gapStart; alongWall <= gapEnd; alongWall += 1) {
    for (let distance = 4; distance <= gapLength; distance += 1) {
      const x = Math.round(
        wall.axis === 'horizontal' ? alongWall : wallCenter + roomSide * distance,
      )
      const y = Math.round(
        wall.axis === 'horizontal' ? wallCenter + roomSide * distance : alongWall,
      )
      if (x < 0 || x >= dimensions.width || y < 0 || y >= dimensions.height) {
        continue
      }

      if (mask[y * dimensions.width + x] === 1) {
        darkPixels += 1
      }
      samples += 1
    }
  }

  return darkPixels / Math.max(samples, 1)
}

export function getDoorSwingEvidence(
  rawDarkMask: Uint8ClampedArray,
  sampleDimensions: Dimensions,
  wall: RasterWallGeometryCandidate,
  gap: Range,
  roomSides: readonly (-1 | 1)[] = [-1, 1],
): DoorSwingEvidence {
  const gapLength = getRangeLength(gap)
  const wallCenter = getRangeCenter(wall.band)
  let bestLeafCoverage = 0
  let bestArcCoverage = 0
  let strictSignal = false

  for (const hingeSide of [-1, 1] as const) {
    for (const roomSide of roomSides) {
      const hingeAlongWall = wall.segment.start + (hingeSide < 0 ? gap.start : gap.end)
      const hingeX = wall.axis === 'horizontal' ? hingeAlongWall : wallCenter
      const hingeY = wall.axis === 'horizontal' ? wallCenter : hingeAlongWall
      const leafStart = Math.max(4, Math.round(gapLength * DOOR_SWING_LEAF_START_RATIO))
      const leafEnd = Math.max(leafStart, Math.round(gapLength * DOOR_SWING_LEAF_END_RATIO))
      let leafHits = 0
      let leafSamples = 0

      for (let distance = leafStart; distance <= leafEnd; distance += 1) {
        const x = wall.axis === 'horizontal' ? hingeX : hingeX + roomSide * distance
        const y = wall.axis === 'horizontal' ? hingeY + roomSide * distance : hingeY
        if (hasMaskPixelNearPoint(rawDarkMask, sampleDimensions, x, y)) {
          leafHits += 1
        }
        leafSamples += 1
      }

      let arcHits = 0
      let arcSamples = 0
      for (let angleDegrees = 12; angleDegrees <= 82; angleDegrees += 5) {
        const angle = (angleDegrees * Math.PI) / 180
        const tangentDistance = -hingeSide * Math.cos(angle) * gapLength
        const normalDistance = roomSide * Math.sin(angle) * gapLength
        const x = wall.axis === 'horizontal' ? hingeX + tangentDistance : hingeX + normalDistance
        const y = wall.axis === 'horizontal' ? hingeY + normalDistance : hingeY + tangentDistance

        if (hasMaskPixelNearPoint(rawDarkMask, sampleDimensions, x, y, 3)) {
          arcHits += 1
        }
        arcSamples += 1
      }

      bestLeafCoverage = Math.max(bestLeafCoverage, leafHits / Math.max(leafSamples, 1))
      bestArcCoverage = Math.max(bestArcCoverage, arcHits / Math.max(arcSamples, 1))
      const leafCoverage = leafHits / Math.max(leafSamples, 1)
      const arcCoverage = arcHits / Math.max(arcSamples, 1)
      if (
        leafCoverage >= DOOR_SWING_STRONG_LEAF_COVERAGE &&
        arcCoverage >= DOOR_SWING_STRICT_ARC_MIN_COVERAGE &&
        getDoorSwingRoomClutterRatio(rawDarkMask, sampleDimensions, wall, gap, roomSide) <=
          DOOR_SWING_MAX_CLUTTER_RATIO
      ) {
        strictSignal = true
      }
    }
  }

  const hasSignal =
    bestLeafCoverage >= DOOR_SWING_STRONG_LEAF_COVERAGE ||
    (bestLeafCoverage >= DOOR_SWING_LEAF_MIN_COVERAGE &&
      bestArcCoverage >= DOOR_SWING_ARC_MIN_COVERAGE)

  return {
    arcCoverage: bestArcCoverage,
    hasSignal,
    leafCoverage: bestLeafCoverage,
    strictSignal,
  }
}

export function mergeCollinearRasterWallCandidates<T extends RasterWallGeometryCandidate>(
  rasterCandidates: T[],
  maxGapByAxis: { horizontal: number; vertical: number },
): T[] {
  const sorted = [...rasterCandidates].sort((left, right) => {
    if (left.axis !== right.axis) {
      return left.axis.localeCompare(right.axis)
    }

    const bandStartDelta = left.band.start - right.band.start
    if (bandStartDelta !== 0) {
      return bandStartDelta
    }

    const bandEndDelta = left.band.end - right.band.end
    if (bandEndDelta !== 0) {
      return bandEndDelta
    }

    return left.segment.start - right.segment.start
  })
  const merged: T[] = []

  for (const candidate of sorted) {
    const previous = merged[merged.length - 1]
    const isSameWallBand =
      previous?.axis === candidate.axis &&
      previous.band.start === candidate.band.start &&
      previous.band.end === candidate.band.end
    const axisMaxGap =
      candidate.axis === 'horizontal' ? maxGapByAxis.horizontal : maxGapByAxis.vertical
    const maxGap = Math.min(
      axisMaxGap,
      previous?.maxCollinearGap ?? axisMaxGap,
      candidate.maxCollinearGap ?? axisMaxGap,
    )

    if (previous && isSameWallBand && getRangeGap(previous.segment, candidate.segment) <= maxGap) {
      previous.segment = mergeRanges(previous.segment, candidate.segment)
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

/** Combines the two dense edge bands of one filled wall without joining nearby room partitions. */
export function mergeAdjacentParallelRasterWalls<T extends RasterWallGeometryCandidate>(
  candidates: T[],
  maximumBandGap = 8,
  protectedIds = new Set<string>(),
): T[] {
  const merged: T[] = []
  const maximumClusterThickness = new Map<string, number>()
  const sorted = [...candidates].sort((left, right) => {
    const lengthDelta = getRangeLength(right.segment) - getRangeLength(left.segment)
    if (lengthDelta !== 0) {
      return lengthDelta
    }
    if (left.axis !== right.axis) {
      return left.axis.localeCompare(right.axis)
    }
    return left.band.start - right.band.start
  })

  for (const candidate of sorted) {
    const target = merged.find((existing) => {
      if (
        existing.axis !== candidate.axis ||
        getRangeGap(existing.band, candidate.band) > maximumBandGap
      ) {
        return false
      }

      if (protectedIds.has(existing.id) !== protectedIds.has(candidate.id)) {
        return false
      }

      const mergedBand = mergeRanges(existing.band, candidate.band)
      const clusterThicknessLimit = Math.max(
        maximumClusterThickness.get(existing.id) ??
          getRangeLength(existing.band) * 2 + maximumBandGap,
        getRangeLength(candidate.band) * 2 + maximumBandGap,
      )
      if (getRangeLength(mergedBand) > clusterThicknessLimit) {
        return false
      }

      const overlap = Math.max(
        0,
        Math.min(existing.segment.end, candidate.segment.end) -
          Math.max(existing.segment.start, candidate.segment.start) +
          1,
      )
      const minimumLength = Math.min(
        getRangeLength(existing.segment),
        getRangeLength(candidate.segment),
      )
      const maximumLength = Math.max(
        getRangeLength(existing.segment),
        getRangeLength(candidate.segment),
      )
      return (
        overlap / Math.max(minimumLength, 1) >= 0.82 &&
        minimumLength / Math.max(maximumLength, 1) >= 0.72
      )
    })

    if (!target) {
      merged.push(cloneRasterWall(candidate))
      maximumClusterThickness.set(candidate.id, getRangeLength(candidate.band) * 2 + maximumBandGap)
      continue
    }

    maximumClusterThickness.set(
      target.id,
      Math.max(
        maximumClusterThickness.get(target.id) ?? 0,
        getRangeLength(candidate.band) * 2 + maximumBandGap,
      ),
    )
    const targetThickness = getRangeLength(target.band)
    const candidateThickness = getRangeLength(candidate.band)
    const combinedBand = mergeRanges(target.openingSampleBand ?? target.band, candidate.band)
    const thicknessRatio =
      Math.max(targetThickness, candidateThickness) /
      Math.max(Math.min(targetThickness, candidateThickness), 1)
    if (thicknessRatio >= 1.6) {
      target.openingSampleBand = combinedBand
      target.parallelEvidenceSupported = true
    }
    target.band =
      thicknessRatio >= 1.6
        ? {
            ...(targetThickness >= candidateThickness ? target.band : candidate.band),
          }
        : mergeRanges(target.band, candidate.band)
    target.segment = mergeRanges(target.segment, candidate.segment)
  }

  return merged.sort((left, right) => {
    if (left.axis !== right.axis) {
      return left.axis.localeCompare(right.axis)
    }
    return getRangeCenter(left.band) - getRangeCenter(right.band)
  })
}

/**
 * Re-centers a protected perimeter wall on a broader, local facade ink band. The broad evidence
 * must cover only part of the perimeter run so full-width drawing frames and dimension lines do
 * not pull the wall away from its structural core.
 */
export function alignPerimeterRasterWallsToBroadLocalEvidence<
  T extends RasterWallGeometryCandidate,
>(candidates: T[], evidenceWalls: RasterWallGeometryCandidate[], protectedIds: Set<string>): T[] {
  return candidates.map((candidate) => {
    const cloned = cloneRasterWall(candidate)
    if (!protectedIds.has(candidate.id)) {
      return cloned
    }

    const candidateThickness = getRangeLength(candidate.band)
    const candidateLength = getRangeLength(candidate.segment)
    const evidence = evidenceWalls
      .filter((wall) => {
        if (wall.axis !== candidate.axis) {
          return false
        }

        const evidenceThickness = getRangeLength(wall.band)
        const thicknessRatio = evidenceThickness / Math.max(candidateThickness, 1)
        const bandOverlap = getRangeOverlapLength(candidate.band, wall.band)
        const segmentOverlap = getRangeOverlapLength(candidate.segment, wall.segment)
        const localizedCoverage = segmentOverlap / Math.max(candidateLength, 1)

        return (
          thicknessRatio >= 1.8 &&
          thicknessRatio <= 3.2 &&
          bandOverlap / Math.max(candidateThickness, 1) >= 0.75 &&
          segmentOverlap / Math.max(getRangeLength(wall.segment), 1) >= 0.8 &&
          localizedCoverage >= 0.22 &&
          localizedCoverage <= 0.65 &&
          Math.abs(getRangeCenter(wall.band) - getRangeCenter(candidate.band)) <= candidateThickness
        )
      })
      .sort(
        (left, right) =>
          getRangeOverlapLength(candidate.segment, right.segment) -
          getRangeOverlapLength(candidate.segment, left.segment),
      )[0]

    if (!evidence) {
      return cloned
    }

    const offset =
      Math.round(getRangeCenter(evidence.band)) - Math.round(getRangeCenter(candidate.band))
    if (Math.abs(offset) < 2) {
      return cloned
    }

    return {
      ...cloned,
      band: {
        start: candidate.band.start + offset,
        end: candidate.band.end + offset,
      },
      openingSampleBand: cloned.openingSampleBand ?? { ...candidate.band },
    }
  })
}

type WallBandGroup<T extends RasterWallGeometryCandidate> = {
  axis: T['axis']
  band: Range
  candidates: T[]
  center: number
}

function cloneRasterWall<T extends RasterWallGeometryCandidate>(candidate: T): T {
  return {
    ...candidate,
    band: { ...candidate.band },
    openingSampleBand: candidate.openingSampleBand ? { ...candidate.openingSampleBand } : undefined,
    segment: { ...candidate.segment },
  }
}

function groupRasterWallsByBand<T extends RasterWallGeometryCandidate>(
  candidates: T[],
  axis: T['axis'],
) {
  const groups = new Map<string, WallBandGroup<T>>()

  for (const candidate of candidates) {
    if (candidate.axis !== axis) {
      continue
    }

    const key = `${candidate.band.start}:${candidate.band.end}`
    const existing = groups.get(key)
    if (existing) {
      existing.candidates.push(candidate)
      continue
    }

    groups.set(key, {
      axis,
      band: { ...candidate.band },
      candidates: [candidate],
      center: getRangeCenter(candidate.band),
    })
  }

  return [...groups.values()].sort((left, right) => left.center - right.center)
}

function isCornerSupported<T extends RasterWallGeometryCandidate>(
  horizontal: WallBandGroup<T>,
  vertical: WallBandGroup<T>,
) {
  const tolerance = Math.max(
    8,
    Math.round((getRangeLength(horizontal.band) + getRangeLength(vertical.band)) / 2),
  )

  return (
    horizontal.candidates.some(
      (candidate) =>
        vertical.center >= candidate.segment.start - tolerance &&
        vertical.center <= candidate.segment.end + tolerance,
    ) &&
    vertical.candidates.some(
      (candidate) =>
        horizontal.center >= candidate.segment.start - tolerance &&
        horizontal.center <= candidate.segment.end + tolerance,
    )
  )
}

function getLongestWallInBand<T extends RasterWallGeometryCandidate>(group: WallBandGroup<T>) {
  return group.candidates.reduce((longest, candidate) =>
    getRangeLength(candidate.segment) > getRangeLength(longest.segment) ? candidate : longest,
  )
}

function isSameWallBand<T extends RasterWallGeometryCandidate>(
  candidate: T,
  group: WallBandGroup<T>,
) {
  return (
    candidate.axis === group.axis &&
    candidate.band.start === group.band.start &&
    candidate.band.end === group.band.end
  )
}

function getSupportedExteriorOffsetRun<T extends RasterWallGeometryCandidate>(
  perimeterGroup: WallBandGroup<T>,
  primaryWalls: T[],
  evidenceWalls: T[],
  segmentBounds: Range,
  outwardDirection: -1 | 1,
  dimensions: Dimensions,
) {
  const perimeterSpan = getRangeLength(segmentBounds)
  const crossAxisSize = perimeterGroup.axis === 'horizontal' ? dimensions.height : dimensions.width
  const maximumOffset = Math.max(16, crossAxisSize * 0.08)
  const minimumInset = Math.max(8, perimeterSpan * 0.035)

  return evidenceWalls
    .filter((candidate) => {
      if (candidate.axis !== perimeterGroup.axis) {
        return false
      }

      const candidateCenter = getRangeCenter(candidate.band)
      const offset = (candidateCenter - perimeterGroup.center) * outwardDirection
      const minimumOffset = Math.max(
        10,
        ((getRangeLength(candidate.band) + getRangeLength(perimeterGroup.band)) / 2) * 0.9,
      )
      if (
        offset < minimumOffset ||
        offset > maximumOffset ||
        getRangeGap(candidate.band, perimeterGroup.band) < 2
      ) {
        return false
      }

      const lengthRatio = getRangeLength(candidate.segment) / Math.max(perimeterSpan, 1)
      if (
        lengthRatio < 0.12 ||
        lengthRatio > 0.72 ||
        candidate.segment.start < segmentBounds.start + minimumInset ||
        candidate.segment.end > segmentBounds.end - minimumInset
      ) {
        return false
      }

      return [candidate.segment.start, candidate.segment.end].every((endpoint) =>
        evidenceWalls.some((orthogonal) => {
          if (orthogonal.axis === candidate.axis) {
            return false
          }

          const connectorSurvives = primaryWalls.some(
            (primary) =>
              primary.id === orthogonal.id ||
              (primary.axis === orthogonal.axis &&
                getRangeGap(primary.band, orthogonal.band) === 0 &&
                getRangeGap(primary.segment, orthogonal.segment) === 0),
          )
          if (!connectorSurvives) {
            return false
          }

          const orthogonalCenter = getRangeCenter(orthogonal.band)
          const tolerance = Math.max(
            8,
            Math.round((getRangeLength(candidate.band) + getRangeLength(orthogonal.band)) / 2),
          )
          return (
            Math.abs(orthogonalCenter - endpoint) <= tolerance &&
            orthogonal.segment.start <=
              Math.min(candidateCenter, perimeterGroup.center) + tolerance &&
            orthogonal.segment.end >= Math.max(candidateCenter, perimeterGroup.center) - tolerance
          )
        }),
      )
    })
    .sort((left, right) => getRangeLength(right.segment) - getRangeLength(left.segment))[0]
}

/**
 * Restores a rectangular exterior wall when every corner is supported by at least one sampled
 * wall fragment. This bridges long window/door runs without turning an arbitrary bounding box into
 * a wall: L-shaped or incomplete plans fail the four-corner requirement and remain unchanged.
 */
export function closeRectangularRasterWallPerimeter<T extends RasterWallGeometryCandidate>(
  primaryWalls: T[],
  evidenceWalls: T[],
  dimensions: Dimensions,
): RectangularPerimeterResult<T> {
  const horizontalGroups = groupRasterWallsByBand(evidenceWalls, 'horizontal')
  const verticalGroups = groupRasterWallsByBand(evidenceWalls, 'vertical')
  const minimumWidth = dimensions.width * 0.32
  const minimumHeight = dimensions.height * 0.32
  let best:
    | {
        area: number
        bottom: WallBandGroup<T>
        left: WallBandGroup<T>
        right: WallBandGroup<T>
        top: WallBandGroup<T>
      }
    | undefined

  for (let topIndex = 0; topIndex < horizontalGroups.length; topIndex += 1) {
    const top = horizontalGroups[topIndex]!
    for (const bottom of horizontalGroups.slice(topIndex + 1)) {
      const height = bottom.center - top.center
      if (height < minimumHeight) {
        continue
      }

      for (let leftIndex = 0; leftIndex < verticalGroups.length; leftIndex += 1) {
        const left = verticalGroups[leftIndex]!
        for (const right of verticalGroups.slice(leftIndex + 1)) {
          const width = right.center - left.center
          if (width < minimumWidth) {
            continue
          }

          if (
            !isCornerSupported(top, left) ||
            !isCornerSupported(top, right) ||
            !isCornerSupported(bottom, left) ||
            !isCornerSupported(bottom, right)
          ) {
            continue
          }

          const area = width * height
          if (!best || area > best.area) {
            best = { area, bottom, left, right, top }
          }
        }
      }
    }
  }

  if (!best) {
    return {
      perimeterWallIds: new Set(),
      walls: primaryWalls.map(cloneRasterWall),
    }
  }

  const perimeterGroups = [best.top, best.bottom, best.left, best.right]
  const perimeterSpecs = [
    {
      group: best.top,
      offset: getSupportedExteriorOffsetRun(
        best.top,
        primaryWalls,
        evidenceWalls,
        { start: Math.round(best.left.center), end: Math.round(best.right.center) },
        -1,
        dimensions,
      ),
    },
    {
      group: best.bottom,
      offset: getSupportedExteriorOffsetRun(
        best.bottom,
        primaryWalls,
        evidenceWalls,
        { start: Math.round(best.left.center), end: Math.round(best.right.center) },
        1,
        dimensions,
      ),
    },
    {
      group: best.left,
      offset: getSupportedExteriorOffsetRun(
        best.left,
        primaryWalls,
        evidenceWalls,
        { start: Math.round(best.top.center), end: Math.round(best.bottom.center) },
        -1,
        dimensions,
      ),
    },
    {
      group: best.right,
      offset: getSupportedExteriorOffsetRun(
        best.right,
        primaryWalls,
        evidenceWalls,
        { start: Math.round(best.top.center), end: Math.round(best.bottom.center) },
        1,
        dimensions,
      ),
    },
  ]
  const perimeterWalls = perimeterSpecs.flatMap(({ group, offset }) => {
    const representative = cloneRasterWall(getLongestWallInBand(group))
    const closedSegment =
      group.axis === 'horizontal'
        ? { start: Math.round(best.left.center), end: Math.round(best.right.center) }
        : { start: Math.round(best.top.center), end: Math.round(best.bottom.center) }

    if (!offset) {
      representative.segment = closedSegment
      return [representative]
    }

    const splitSegments = [
      { start: closedSegment.start, end: offset.segment.start },
      { start: offset.segment.end, end: closedSegment.end },
    ].filter((segment) => getRangeLength(segment) >= 2)

    return splitSegments.map((segment, index) => ({
      ...cloneRasterWall(representative),
      id: index === 0 ? representative.id : `${representative.id}:perimeter:${index}`,
      segment,
    }))
  })
  const walls = primaryWalls
    .filter((candidate) => !perimeterGroups.some((group) => isSameWallBand(candidate, group)))
    .map(cloneRasterWall)
  for (const { offset } of perimeterSpecs) {
    if (offset && !walls.some((wall) => wall.id === offset.id)) {
      walls.push(cloneRasterWall(offset))
    }
  }
  walls.push(...perimeterWalls)
  walls.sort((left, right) => {
    if (left.axis !== right.axis) {
      return left.axis.localeCompare(right.axis)
    }
    return getRangeCenter(left.band) - getRangeCenter(right.band)
  })

  return {
    perimeterWallIds: new Set([
      ...perimeterWalls.map((wall) => wall.id),
      ...perimeterSpecs.flatMap(({ offset }) => (offset ? [offset.id] : [])),
    ]),
    walls,
  }
}

function getMedian(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
}

/** Removes broad furniture/rug bands while preserving explicitly recovered perimeter walls. */
export function filterRasterWallThicknessOutliers<T extends RasterWallGeometryCandidate>(
  candidates: T[],
  dimensions: Dimensions,
  protectedIds = new Set<string>(),
): T[] {
  const minimumReferenceLength = Math.min(dimensions.width, dimensions.height) * 0.06
  const referenceThicknesses = candidates
    .filter((candidate) => getRangeLength(candidate.segment) >= minimumReferenceLength)
    .map((candidate) => getRangeLength(candidate.band))

  if (referenceThicknesses.length < 6) {
    return candidates.map(cloneRasterWall)
  }

  const medianThickness = getMedian(referenceThicknesses)
  const maximumThickness = Math.max(medianThickness * 1.65, medianThickness + 12)

  return candidates
    .filter(
      (candidate) =>
        protectedIds.has(candidate.id) || getRangeLength(candidate.band) <= maximumThickness,
    )
    .map(cloneRasterWall)
}

function getOrthogonalConnections<T extends RasterWallGeometryCandidate>(
  candidate: T,
  candidates: T[],
) {
  const center = getRangeCenter(candidate.band)

  return candidates
    .filter((other) => other !== candidate && other.axis !== candidate.axis)
    .flatMap((other) => {
      const otherCenter = getRangeCenter(other.band)
      const tolerance = Math.max(
        8,
        Math.round((getRangeLength(candidate.band) + getRangeLength(other.band)) / 2),
      )
      if (
        otherCenter < candidate.segment.start - tolerance ||
        otherCenter > candidate.segment.end + tolerance ||
        center < other.segment.start - tolerance ||
        center > other.segment.end + tolerance
      ) {
        return []
      }

      const endpointTolerance = tolerance + Math.round(getRangeLength(other.band) / 2)
      return [
        {
          atEndpoint:
            Math.abs(otherCenter - candidate.segment.start) <= endpointTolerance ||
            Math.abs(otherCenter - candidate.segment.end) <= endpointTolerance,
          wall: other,
        },
      ]
    })
}

/**
 * Drops short furniture strokes that touch only one wall, plus medium strokes that merely cross a
 * single wall without terminating at it. Supported room partitions and perimeter walls are kept.
 */
export function filterShortDanglingRasterWalls<T extends RasterWallGeometryCandidate>(
  candidates: T[],
  dimensions: Dimensions,
  protectedIds = new Set<string>(),
): T[] {
  const axisReference = Math.min(dimensions.width, dimensions.height)
  const shortLength = Math.max(18, axisReference * 0.085)
  const supportedLength = Math.max(shortLength, axisReference * 0.15)

  return candidates
    .filter((candidate) => {
      if (protectedIds.has(candidate.id)) {
        return true
      }

      const length = getRangeLength(candidate.segment)
      if (length >= supportedLength) {
        return true
      }

      const connections = getOrthogonalConnections(candidate, candidates)
      const endpointConnections = connections.filter((connection) => connection.atEndpoint)

      if (length < shortLength) {
        return connections.length >= 2
      }

      return connections.length >= 2 || endpointConnections.length >= 1
    })
    .map(cloneRasterWall)
}

/**
 * Removes a short, one-ended parallel stroke that shadows a much longer wall nearby. Colored
 * furniture and lift symbols often form this pattern after their top and side edges enter the
 * structural mask, while real narrow room partitions normally terminate at walls on both ends.
 */
export function filterShortParallelShadowRasterWalls<T extends RasterWallGeometryCandidate>(
  candidates: T[],
  dimensions: Dimensions,
  protectedIds = new Set<string>(),
): T[] {
  const axisReference = Math.min(dimensions.width, dimensions.height)
  const maximumShadowLength = Math.max(24, axisReference * 0.15)

  return candidates
    .filter((candidate) => {
      if (
        protectedIds.has(candidate.id) ||
        getRangeLength(candidate.segment) > maximumShadowLength
      ) {
        return true
      }

      const endpointConnections = getOrthogonalConnections(candidate, candidates).filter(
        (connection) => connection.atEndpoint,
      )
      if (endpointConnections.length >= 2) {
        return true
      }

      const bandAxisLength = candidate.axis === 'horizontal' ? dimensions.height : dimensions.width
      const maximumBandGap = Math.max(18, bandAxisLength * 0.025)
      const candidateLength = getRangeLength(candidate.segment)
      const candidateThickness = getRangeLength(candidate.band)
      const hasDominantParallelWall = candidates.some((other) => {
        if (other === candidate || other.axis !== candidate.axis) {
          return false
        }

        const otherLength = getRangeLength(other.segment)
        const otherThickness = getRangeLength(other.band)
        const thicknessRatio =
          Math.max(candidateThickness, otherThickness) /
          Math.max(Math.min(candidateThickness, otherThickness), 1)
        const overlap = getRangeOverlapLength(candidate.segment, other.segment)
        return (
          otherLength >= candidateLength * 2.5 &&
          getRangeGap(candidate.band, other.band) <= maximumBandGap &&
          thicknessRatio <= 1.8 &&
          overlap / Math.max(candidateLength, 1) >= 0.7
        )
      })

      return !hasDominantParallelWall
    })
    .map(cloneRasterWall)
}
