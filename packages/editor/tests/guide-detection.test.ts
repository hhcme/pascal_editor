import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'

type AnyNodeId = string

const guideDetectionPath = new URL('../src/lib/guide-detection.ts', import.meta.url).pathname
let nextWallId = 0
let nextDoorId = 0
let nextWindowId = 0

mock.module('@pascal-app/core', () => ({
  DoorNode: {
    parse: (input: Record<string, unknown>) => ({
      id: `door_${++nextDoorId}`,
      type: 'door',
      ...input,
    }),
  },
  WallNode: {
    parse: (input: Record<string, unknown>) => ({
      id: `wall_${++nextWallId}`,
      type: 'wall',
      ...input,
    }),
  },
  WindowNode: {
    parse: (input: Record<string, unknown>) => ({
      id: `window_${++nextWindowId}`,
      type: 'window',
      ...input,
    }),
  },
  loadAssetUrl: async () => null,
}))

let applyDetectedOpenings: typeof import('../src/lib/guide-detection').applyDetectedOpenings
let applyDetectedGuideModel: typeof import('../src/lib/guide-detection').applyDetectedGuideModel
let applyDetectedWalls: typeof import('../src/lib/guide-detection').applyDetectedWalls
let buildOpeningSignalCandidates: typeof import('../src/lib/guide-detection').buildOpeningSignalCandidates
let buildGuideDetectionDebugSnapshot: typeof import('../src/lib/guide-detection').buildGuideDetectionDebugSnapshot
let buildStructuralWallMask: typeof import('../src/lib/guide-detection').buildStructuralWallMask
let bridgeRasterWallsAcrossAnchoredOcclusions: typeof import('../src/lib/guide-detection').bridgeRasterWallsAcrossAnchoredOcclusions
let closeRectangularRasterWallPerimeter: typeof import('../src/lib/guide-detection').closeRectangularRasterWallPerimeter
let dedupeRasterWallCandidates: typeof import('../src/lib/guide-detection').dedupeRasterWallCandidates
let detectGuideCandidatesFromImageData: typeof import('../src/lib/guide-detection').detectGuideCandidatesFromImageData
let extendRasterWallCandidatesWithThinLineSupport: typeof import('../src/lib/guide-detection').extendRasterWallCandidatesWithThinLineSupport
let filterDisconnectedRasterWalls: typeof import('../src/lib/guide-detection').filterDisconnectedRasterWalls
let filterDecorativeThinRasterWalls: typeof import('../src/lib/guide-detection').filterDecorativeThinRasterWalls
let filterFrameLikeWallCandidates: typeof import('../src/lib/guide-detection').filterFrameLikeWallCandidates
let filterRasterWallThicknessOutliers: typeof import('../src/lib/guide-detection').filterRasterWallThicknessOutliers
let filterShortDanglingRasterWalls: typeof import('../src/lib/guide-detection').filterShortDanglingRasterWalls
let filterShortParallelShadowRasterWalls: typeof import('../src/lib/guide-detection').filterShortParallelShadowRasterWalls
let alignPerimeterRasterWallsToBroadLocalEvidence: typeof import('../src/lib/guide-detection').alignPerimeterRasterWallsToBroadLocalEvidence
let getGuideDetectionPixelRegion: typeof import('../src/lib/guide-detection').getGuideDetectionPixelRegion
let getAdaptiveDarkThreshold: typeof import('../src/lib/guide-detection').getAdaptiveDarkThreshold
let getDoorSwingEvidence: typeof import('../src/lib/guide-detection').getDoorSwingEvidence
let getOpeningKind: typeof import('../src/lib/guide-detection').getOpeningKind
let getSelectedGuideDetectionCandidates: typeof import('../src/lib/guide-detection').getSelectedGuideDetectionCandidates
let getStructuralBounds: typeof import('../src/lib/guide-detection').getStructuralBounds
let groupCoveredRangesWithGapTolerance: typeof import('../src/lib/guide-detection').groupCoveredRangesWithGapTolerance
let groupDenseRangesWithGapTolerance: typeof import('../src/lib/guide-detection').groupDenseRangesWithGapTolerance
let hasStrongColorBoundaryAcrossRasterWall: typeof import('../src/lib/guide-detection').hasStrongColorBoundaryAcrossRasterWall
let isGapLikelyOpening: typeof import('../src/lib/guide-detection').isGapLikelyOpening
let mergeAdjacentParallelRasterWalls: typeof import('../src/lib/guide-detection').mergeAdjacentParallelRasterWalls
let mergeParallelThinRasterWallCandidates: typeof import('../src/lib/guide-detection').mergeParallelThinRasterWallCandidates
let mergeCollinearRasterWallCandidates: typeof import('../src/lib/guide-detection').mergeCollinearRasterWallCandidates
let refineWideDenseBands: typeof import('../src/lib/guide-detection').refineWideDenseBands
let refineWideSteppedHorizontalPerimeter: typeof import('../src/lib/guide-detection').refineWideSteppedHorizontalPerimeter
let resolveOverlappingOpeningSignals: typeof import('../src/lib/guide-detection').resolveOverlappingOpeningSignals
let splitRasterWallsAtLongUnsupportedSpans: typeof import('../src/lib/guide-detection').splitRasterWallsAtLongUnsupportedSpans
let supplementRasterWallCandidates: typeof import('../src/lib/guide-detection').supplementRasterWallCandidates
let trimRasterWallCandidatesToStructureBounds: typeof import('../src/lib/guide-detection').trimRasterWallCandidatesToStructureBounds

beforeAll(async () => {
  ;({
    alignPerimeterRasterWallsToBroadLocalEvidence,
    applyDetectedGuideModel,
    applyDetectedOpenings,
    applyDetectedWalls,
    buildGuideDetectionDebugSnapshot,
    buildOpeningSignalCandidates,
    buildStructuralWallMask,
    bridgeRasterWallsAcrossAnchoredOcclusions,
    closeRectangularRasterWallPerimeter,
    dedupeRasterWallCandidates,
    detectGuideCandidatesFromImageData,
    extendRasterWallCandidatesWithThinLineSupport,
    filterDisconnectedRasterWalls,
    filterDecorativeThinRasterWalls,
    filterFrameLikeWallCandidates,
    filterRasterWallThicknessOutliers,
    filterShortDanglingRasterWalls,
    filterShortParallelShadowRasterWalls,
    getAdaptiveDarkThreshold,
    getDoorSwingEvidence,
    getGuideDetectionPixelRegion,
    getOpeningKind,
    getSelectedGuideDetectionCandidates,
    getStructuralBounds,
    groupCoveredRangesWithGapTolerance,
    groupDenseRangesWithGapTolerance,
    hasStrongColorBoundaryAcrossRasterWall,
    isGapLikelyOpening,
    mergeAdjacentParallelRasterWalls,
    mergeParallelThinRasterWallCandidates,
    mergeCollinearRasterWallCandidates,
    refineWideDenseBands,
    refineWideSteppedHorizontalPerimeter,
    resolveOverlappingOpeningSignals,
    splitRasterWallsAtLongUnsupportedSpans,
    supplementRasterWallCandidates,
    trimRasterWallCandidatesToStructureBounds,
  } = await import(guideDetectionPath))
})

beforeEach(() => {
  nextWallId = 0
  nextDoorId = 0
  nextWindowId = 0
})

function makeWhiteImageData(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    data[offset] = 255
    data[offset + 1] = 255
    data[offset + 2] = 255
    data[offset + 3] = 255
  }

  return { data, width, height }
}

function setDarkPixel(imageData: ReturnType<typeof makeWhiteImageData>, x: number, y: number) {
  const offset = (y * imageData.width + x) * 4
  imageData.data[offset] = 0
  imageData.data[offset + 1] = 0
  imageData.data[offset + 2] = 0
  imageData.data[offset + 3] = 255
}

describe('guide detection application', () => {
  test('suppresses thin annotation lines while keeping thick wall pixels in the structural mask', () => {
    const width = 15
    const height = 15
    const brightness = new Uint8ClampedArray(width * height).fill(250)

    for (let x = 1; x < 11; x += 1) {
      brightness[1 * width + x] = 200
    }

    for (let y = 7; y < 14; y += 1) {
      for (let x = 8; x < 12; x += 1) {
        brightness[y * width + x] = 190
      }
    }

    const structuralMask = buildStructuralWallMask(brightness, { width, height }, 220)
    const thinLinePixels = Array.from(
      { length: 10 },
      (_, index) => structuralMask[1 * width + index + 1] ?? 0,
    )
    const thickWallPixels = Array.from(
      { length: 7 },
      (_, index) => structuralMask[(index + 7) * width + 9] ?? 0,
    )

    expect(thinLinePixels.every((value) => value === 0)).toBe(true)
    expect(thickWallPixels.some((value) => value === 1)).toBe(true)
  })

  test('raises the darkness threshold on bright blueprint crops so light gray walls can still be sampled', () => {
    const brightness = new Uint8ClampedArray([
      ...new Array(80).fill(248),
      ...new Array(10).fill(222),
      ...new Array(10).fill(168),
    ])

    expect(getAdaptiveDarkThreshold(brightness)).toBeGreaterThan(170)
  })

  test('does not classify large pastel room fills as structural wall ink', () => {
    const imageData = makeWhiteImageData(180, 120)

    for (let y = 15; y <= 104; y += 1) {
      for (let x = 20; x <= 159; x += 1) {
        const offset = (y * imageData.width + x) * 4
        imageData.data[offset] = 220
        imageData.data[offset + 1] = 205
        imageData.data[offset + 2] = 195
      }
    }

    const drawWallRect = (minX: number, minY: number, maxX: number, maxY: number) => {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          setDarkPixel(imageData, x, y)
        }
      }
    }

    drawWallRect(20, 15, 159, 19)
    drawWallRect(20, 100, 159, 104)
    drawWallRect(20, 15, 24, 104)
    drawWallRect(155, 15, 159, 104)
    drawWallRect(88, 15, 92, 104)
    drawWallRect(20, 58, 159, 62)

    const guide = {
      id: 'pastel-room-fill-guide',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      type: 'guide',
    } as never
    const snapshot = buildGuideDetectionDebugSnapshot(guide, imageData)

    expect(snapshot.darkThreshold).toBeLessThan(200)
    expect(snapshot.candidates.walls.length).toBeGreaterThanOrEqual(6)
    expect(snapshot.candidates.walls.every((wall) => wall.thickness < 0.5)).toBe(true)
  })

  test('falls back to a thin-line vector mode when the imported plan has one-pixel wall strokes', () => {
    const imageData = makeWhiteImageData(80, 60)

    for (let x = 20; x <= 60; x += 1) {
      setDarkPixel(imageData, x, 16)
      setDarkPixel(imageData, x, 44)
    }

    for (let y = 16; y <= 44; y += 1) {
      setDarkPixel(imageData, 20, y)
      setDarkPixel(imageData, 60, y)
    }

    const guide = {
      id: 'thin-line-guide',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      type: 'guide',
    } as never
    const snapshot = buildGuideDetectionDebugSnapshot(guide, imageData)
    const candidates = detectGuideCandidatesFromImageData(guide, imageData)

    expect(snapshot.detectionMode).toBe('thin-line')
    expect(candidates.walls).toHaveLength(4)
  })

  test('keeps strong disconnected thin-line wall groups for vector floorplan masks', () => {
    const imageData = makeWhiteImageData(180, 100)

    for (let x = 20; x <= 80; x += 1) {
      setDarkPixel(imageData, x, 15)
      setDarkPixel(imageData, x, 70)
    }
    for (let y = 15; y <= 70; y += 1) {
      setDarkPixel(imageData, 20, y)
      setDarkPixel(imageData, 80, y)
    }

    for (let x = 105; x <= 155; x += 1) {
      setDarkPixel(imageData, x, 20)
      setDarkPixel(imageData, x, 72)
    }
    for (let y = 20; y <= 72; y += 1) {
      setDarkPixel(imageData, 105, y)
      setDarkPixel(imageData, 155, y)
    }

    const guide = {
      id: 'thin-line-disconnected-guide',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      type: 'guide',
    } as never
    const candidates = detectGuideCandidatesFromImageData(guide, imageData)

    expect(candidates.walls.length).toBeGreaterThanOrEqual(7)
  })

  test('detects a door-sized void inside a thin-line wall candidate', () => {
    const imageData = makeWhiteImageData(100, 40)

    for (let x = 10; x <= 34; x += 1) {
      setDarkPixel(imageData, x, 20)
    }

    for (let x = 50; x <= 82; x += 1) {
      setDarkPixel(imageData, x, 20)
    }

    const guide = {
      id: 'thin-line-opening-guide',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      type: 'guide',
    } as never
    const candidates = detectGuideCandidatesFromImageData(guide, imageData)

    expect(candidates.walls).toHaveLength(1)
    expect(candidates.openings).toHaveLength(1)
    expect(candidates.openings[0]?.kind).toBe('door')
  })

  test('requires door-swing ink to be anchored at an opening hinge', () => {
    const dimensions = { height: 100, width: 120 }
    const wall = {
      axis: 'horizontal' as const,
      band: { end: 52, start: 48 },
      id: 'door-swing-wall',
      segment: { end: 110, start: 10 },
    }
    const gap = { end: 55, start: 40 }
    const doorMask = new Uint8ClampedArray(dimensions.width * dimensions.height)
    const windowMask = new Uint8ClampedArray(dimensions.width * dimensions.height)
    const setMaskPixel = (mask: Uint8ClampedArray, x: number, y: number) => {
      mask[Math.round(y) * dimensions.width + Math.round(x)] = 1
    }

    for (let y = 53; y <= 68; y += 1) {
      setMaskPixel(doorMask, 50, y)
    }
    for (let angleDegrees = 12; angleDegrees <= 82; angleDegrees += 3) {
      const angle = (angleDegrees * Math.PI) / 180
      setMaskPixel(doorMask, 50 + Math.cos(angle) * 16, 50 + Math.sin(angle) * 16)
    }

    for (let y = 45; y <= 55; y += 1) {
      setMaskPixel(windowMask, 50, y)
      setMaskPixel(windowMask, 65, y)
    }
    for (let y = 10; y <= 90; y += 1) {
      setMaskPixel(windowMask, 32, y)
      setMaskPixel(windowMask, 84, y)
    }
    for (let x = 10; x <= 110; x += 1) {
      setMaskPixel(windowMask, x, 76)
    }

    const doorEvidence = getDoorSwingEvidence(doorMask, dimensions, wall, gap)
    const windowEvidence = getDoorSwingEvidence(windowMask, dimensions, wall, gap)

    expect(doorEvidence.hasSignal).toBe(true)
    expect(doorEvidence.leafCoverage).toBeGreaterThan(0.8)
    expect(doorEvidence.strictSignal).toBe(true)
    expect(windowEvidence.hasSignal).toBe(false)
    expect(getDoorSwingEvidence(doorMask, dimensions, wall, gap, [-1]).hasSignal).toBe(false)
  })

  test('defaults exterior gaps to windows unless a strict door swing survives', () => {
    expect(getOpeningKind('void', 1, false, true)).toBe('window')
    expect(getOpeningKind('void', 1, true, true)).toBe('door')
    expect(getOpeningKind('void', 1, false, false)).toBe('door')
  })

  test('maps detected image pixels into the same orientation as the 3D guide plane', () => {
    const imageData = makeWhiteImageData(100, 100)

    for (let y = 12; y <= 17; y += 1) {
      for (let x = 10; x <= 40; x += 1) {
        setDarkPixel(imageData, x, y)
      }
    }

    const guide = {
      id: 'orientation-guide',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      type: 'guide',
    } as never
    const candidates = detectGuideCandidatesFromImageData(guide, imageData)

    expect(candidates.walls).toHaveLength(1)
    expect(candidates.walls[0]?.start[0]).toBeLessThan(0)
    expect(candidates.walls[0]?.start[1]).toBeLessThan(0)
    expect(candidates.walls[0]?.end[0]).toBeLessThan(0)
    expect(candidates.walls[0]?.end[1]).toBeLessThan(0)
  })

  test('converts a persisted detection region into the expected pixel crop window', () => {
    expect(
      getGuideDetectionPixelRegion(
        {
          detectionRegion: {
            x: 0.1,
            y: 0.2,
            width: 0.5,
            height: 0.4,
          },
        },
        { height: 800, width: 1200 },
      ),
    ).toEqual({
      x: 120,
      y: 160,
      width: 600,
      height: 320,
    })
  })

  test('keeps a dense range continuous across short gaps so openings can be detected later', () => {
    expect(groupDenseRangesWithGapTolerance([5, 5, 0, 0, 5, 5], 4, 4, 2)).toEqual([
      { start: 0, end: 5 },
    ])
    expect(groupDenseRangesWithGapTolerance([5, 5, 0, 0, 0, 5, 5], 4, 4, 2)).toEqual([])
  })

  test('recovers a solid wall run when sparse annotation ink makes a broad segment fail coverage', () => {
    const samples = Array.from({ length: 90 }, () => 0)
    for (const start of [0, 12, 24, 36]) {
      samples.fill(5, start, start + 3)
    }
    samples.fill(5, 50)

    expect(groupCoveredRangesWithGapTolerance(samples, 4, 18, 14, 0.58)).toEqual([
      { start: 50, end: 89 },
    ])
  })

  test('trims isolated furniture ink that only extends a wall candidate at its endpoint', () => {
    const samples = Array.from({ length: 120 }, () => 0)
    samples.fill(5, 0, 71)
    samples.fill(5, 111, 114)

    expect(groupCoveredRangesWithGapTolerance(samples, 4, 18, 50, 0.58, true)).toEqual([
      { start: 0, end: 70 },
    ])
  })

  test('filters page-frame candidates before turning them into detected walls', () => {
    const filtered = filterFrameLikeWallCandidates(
      [
        {
          axis: 'vertical',
          band: { end: 6, start: 2 },
          id: 'frame-left',
          segment: { end: 956, start: 18 },
        },
        {
          axis: 'horizontal',
          band: { end: 798, start: 794 },
          id: 'frame-bottom',
          segment: { end: 1184, start: 12 },
        },
        {
          axis: 'vertical',
          band: { end: 328, start: 320 },
          id: 'interior-wall',
          segment: { end: 702, start: 188 },
        },
      ],
      { height: 800, width: 1200 },
    )

    expect(filtered.map((candidate) => candidate.id)).toEqual(['interior-wall'])
  })

  test('dedupes overlapping raster walls before they become user-visible candidates', () => {
    const deduped = dedupeRasterWallCandidates([
      {
        axis: 'horizontal',
        band: { end: 106, start: 100 },
        id: 'primary-wall',
        segment: { end: 460, start: 80 },
      },
      {
        axis: 'horizontal',
        band: { end: 105, start: 101 },
        id: 'overlapping-duplicate',
        segment: { end: 455, start: 92 },
      },
      {
        axis: 'horizontal',
        band: { end: 132, start: 126 },
        id: 'separate-wall',
        segment: { end: 458, start: 80 },
      },
    ])

    expect(deduped.map((candidate) => candidate.id)).toEqual(['primary-wall', 'separate-wall'])
  })

  test('merges wall fragments separated by plausible door or window gaps', () => {
    const merged = mergeCollinearRasterWallCandidates(
      [
        {
          axis: 'horizontal',
          band: { end: 24, start: 20 },
          id: 'exterior-wall-left',
          segment: { end: 80, start: 10 },
        },
        {
          axis: 'horizontal',
          band: { end: 24, start: 20 },
          id: 'exterior-wall-middle',
          segment: { end: 160, start: 105 },
        },
        {
          axis: 'horizontal',
          band: { end: 34, start: 30 },
          id: 'different-wall-band',
          segment: { end: 160, start: 105 },
        },
      ],
      { horizontal: 24, vertical: 24 },
    )

    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({
      id: 'exterior-wall-left',
      segment: { end: 160, start: 10 },
    })
    expect(merged[1]?.id).toBe('different-wall-band')
  })

  test('does not rejoin separated dense cores past their local merge limit', () => {
    const merged = mergeCollinearRasterWallCandidates(
      [
        {
          axis: 'vertical',
          band: { end: 24, start: 20 },
          id: 'wall-core-top',
          maxCollinearGap: 16,
          segment: { end: 80, start: 10 },
        },
        {
          axis: 'vertical',
          band: { end: 24, start: 20 },
          id: 'wall-core-bottom',
          maxCollinearGap: 16,
          segment: { end: 160, start: 100 },
        },
      ],
      { horizontal: 128, vertical: 128 },
    )

    expect(merged).toHaveLength(2)
  })

  test('closes a rectangular exterior wall only when all four corners have wall evidence', () => {
    const top = {
      axis: 'horizontal' as const,
      band: { end: 14, start: 10 },
      id: 'top-wall',
      segment: { end: 90, start: 10 },
    }
    const bottomLeft = {
      axis: 'horizontal' as const,
      band: { end: 94, start: 90 },
      id: 'bottom-wall',
      segment: { end: 24, start: 10 },
    }
    const bottomRight = {
      ...bottomLeft,
      id: 'bottom-wall-right',
      segment: { end: 90, start: 76 },
    }
    const left = {
      axis: 'vertical' as const,
      band: { end: 14, start: 10 },
      id: 'left-wall',
      segment: { end: 90, start: 10 },
    }
    const right = {
      ...left,
      band: { end: 94, start: 90 },
      id: 'right-wall',
    }

    const closed = closeRectangularRasterWallPerimeter(
      [top, bottomLeft, left, right],
      [top, bottomLeft, bottomRight, left, right],
      { height: 100, width: 100 },
    )

    expect(closed.walls).toHaveLength(4)
    expect(
      closed.walls.find((wall) => wall.axis === 'horizontal' && wall.id === 'top-wall')?.segment,
    ).toEqual({ end: 92, start: 12 })
    expect(
      closed.walls.find((wall) => wall.axis === 'horizontal' && wall.id === 'bottom-wall')?.segment,
    ).toEqual({ end: 92, start: 12 })
    expect(closed.perimeterWallIds).toEqual(
      new Set(['top-wall', 'bottom-wall', 'left-wall', 'right-wall']),
    )

    const incomplete = closeRectangularRasterWallPerimeter(
      [top, bottomLeft, left, { ...right, segment: { end: 72, start: 10 } }],
      [top, bottomLeft, left, { ...right, segment: { end: 72, start: 10 } }],
      { height: 100, width: 100 },
    )
    expect(incomplete.perimeterWallIds.size).toBe(0)
    expect(incomplete.walls).toHaveLength(4)
  })

  test('preserves a supported exterior offset run that only exists in evidence walls', () => {
    const top = {
      axis: 'horizontal' as const,
      band: { end: 24, start: 20 },
      id: 'top-wall',
      segment: { end: 180, start: 20 },
    }
    const bottom = {
      ...top,
      band: { end: 184, start: 180 },
      id: 'bottom-wall',
    }
    const left = {
      axis: 'vertical' as const,
      band: { end: 24, start: 20 },
      id: 'left-wall',
      segment: { end: 180, start: 20 },
    }
    const right = {
      ...left,
      band: { end: 184, start: 180 },
      id: 'right-wall',
    }
    const offset = {
      ...top,
      band: { end: 10, start: 6 },
      id: 'offset-wall',
      segment: { end: 130, start: 70 },
    }
    const offsetLeft = {
      ...left,
      band: { end: 72, start: 68 },
      id: 'offset-left',
      segment: { end: 24, start: 6 },
    }
    const offsetRight = {
      ...offsetLeft,
      band: { end: 132, start: 128 },
      id: 'offset-right',
    }

    const closed = closeRectangularRasterWallPerimeter(
      [top, bottom, left, right, offsetLeft, offsetRight],
      [top, bottom, left, right, offset, offsetLeft, offsetRight],
      { height: 200, width: 200 },
    )

    expect(closed.walls.map((wall) => wall.id)).toContain('offset-wall')
    expect(closed.perimeterWallIds).toContain('offset-wall')
    expect(
      closed.walls.filter((wall) => wall.id.startsWith('top-wall')).map((wall) => wall.segment),
    ).toEqual([
      { end: 70, start: 22 },
      { end: 182, start: 130 },
    ])
  })

  test('splits a wide horizontal perimeter band into a stepped exterior outline', () => {
    const dimensions = { height: 120, width: 200 }
    const horizontalMask = new Uint8ClampedArray(dimensions.width * dimensions.height)
    const fillMask = (startX: number, endX: number, startY: number, endY: number) => {
      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          horizontalMask[y * dimensions.width + x] = 1
        }
      }
    }

    fillMask(20, 40, 82, 94)
    fillMask(70, 130, 82, 94)
    fillMask(160, 180, 82, 94)
    fillMask(20, 75, 100, 110)
    fillMask(125, 180, 100, 110)

    const refined = refineWideSteppedHorizontalPerimeter(
      {
        perimeterWallIds: new Set(['wide-bottom']),
        walls: [
          {
            axis: 'horizontal',
            band: { end: 113, start: 80 },
            id: 'wide-bottom',
            segment: { end: 180, start: 20 },
          },
        ],
      },
      horizontalMask,
      dimensions,
    )

    expect(refined.walls.map((wall) => wall.id)).toEqual([
      'wide-bottom',
      'wide-bottom:step:right',
      'wide-bottom:step:offset',
      'wide-bottom:step:left-connector',
      'wide-bottom:step:right-connector',
    ])
    expect(refined.walls.slice(0, 3)).toMatchObject([
      { axis: 'horizontal', band: { end: 110, start: 100 }, segment: { end: 75, start: 20 } },
      {
        axis: 'horizontal',
        band: { end: 110, start: 100 },
        segment: { end: 180, start: 125 },
      },
      { axis: 'horizontal', band: { end: 94, start: 82 }, segment: { end: 130, start: 70 } },
    ])
    expect(refined.walls.slice(3)).toMatchObject([
      { axis: 'vertical', band: { end: 75, start: 70 }, perimeterConnector: true },
      { axis: 'vertical', band: { end: 130, start: 125 }, perimeterConnector: true },
    ])
    expect(refined.perimeterWallIds).toEqual(
      new Set([
        'wide-bottom',
        'wide-bottom:step:right',
        'wide-bottom:step:offset',
        'wide-bottom:step:left-connector',
        'wide-bottom:step:right-connector',
      ]),
    )
  })

  test('removes broad texture bands while preserving a recovered exterior wall', () => {
    const regularWalls = Array.from({ length: 6 }, (_, index) => ({
      axis: (index % 2 === 0 ? 'horizontal' : 'vertical') as 'horizontal' | 'vertical',
      band: { end: index * 10 + 5, start: index * 10 + 1 },
      id: `regular-${index}`,
      segment: { end: 180, start: 20 },
    }))
    const textureBand = {
      axis: 'horizontal' as const,
      band: { end: 80, start: 45 },
      id: 'rug-edge',
      segment: { end: 180, start: 20 },
    }
    const protectedExterior = {
      ...textureBand,
      band: { end: 130, start: 95 },
      id: 'recovered-exterior',
    }

    const filtered = filterRasterWallThicknessOutliers(
      [...regularWalls, textureBand, protectedExterior],
      { height: 200, width: 200 },
      new Set(['recovered-exterior']),
    )

    expect(filtered.map((wall) => wall.id)).not.toContain('rug-edge')
    expect(filtered.map((wall) => wall.id)).toContain('recovered-exterior')
  })

  test('extracts a dense wall core from a broad projection band merged with nearby objects', () => {
    const values = new Array(80).fill(0)
    for (let index = 10; index <= 40; index += 1) {
      values[index] = 24
    }
    for (let index = 18; index <= 25; index += 1) {
      values[index] = 100
    }
    for (let index = 50; index <= 65; index += 1) {
      values[index] = 30
    }

    expect(
      refineWideDenseBands(
        values,
        [
          { start: 10, end: 40 },
          { start: 50, end: 65 },
        ],
        20,
        3,
      ),
    ).toEqual([
      { start: 18, end: 25 },
      { start: 50, end: 65 },
    ])
  })

  test('merges adjacent dense edge bands of the same physical wall', () => {
    const merged = mergeAdjacentParallelRasterWalls([
      {
        axis: 'horizontal',
        band: { start: 10, end: 15 },
        id: 'long-wall-edge',
        segment: { start: 20, end: 180 },
      },
      {
        axis: 'horizontal',
        band: { start: 20, end: 25 },
        id: 'short-wall-edge',
        segment: { start: 30, end: 170 },
      },
      {
        axis: 'horizontal',
        band: { start: 40, end: 45 },
        id: 'separate-partition',
        segment: { start: 20, end: 180 },
      },
    ])

    expect(merged).toHaveLength(2)
    expect(merged.find((wall) => wall.id === 'long-wall-edge')).toMatchObject({
      band: { start: 10, end: 25 },
      segment: { start: 20, end: 180 },
    })
    expect(merged.map((wall) => wall.id)).toContain('separate-partition')
  })

  test('keeps the broader structural wall body when adjacent parallel evidence is asymmetric', () => {
    const merged = mergeAdjacentParallelRasterWalls([
      {
        axis: 'horizontal',
        band: { start: 30, end: 39 },
        id: 'structural-core',
        segment: { start: 20, end: 180 },
      },
      {
        axis: 'horizontal',
        band: { start: 41, end: 59 },
        id: 'broad-fixture-shadow',
        segment: { start: 20, end: 180 },
      },
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      band: { start: 41, end: 59 },
      openingSampleBand: { start: 30, end: 59 },
      parallelEvidenceSupported: true,
      segment: { start: 20, end: 180 },
    })
  })

  test('aligns only a protected perimeter wall to localized broad facade evidence', () => {
    const candidates = [
      {
        axis: 'vertical' as const,
        band: { start: 220, end: 233 },
        id: 'protected-perimeter',
        segment: { start: 164, end: 790 },
      },
      {
        axis: 'vertical' as const,
        band: { start: 220, end: 233 },
        id: 'interior-wall',
        segment: { start: 164, end: 790 },
      },
    ]
    const aligned = alignPerimeterRasterWallsToBroadLocalEvidence(
      candidates,
      [
        {
          axis: 'vertical',
          band: { start: 204, end: 240 },
          id: 'localized-facade-evidence',
          segment: { start: 356, end: 584 },
        },
      ],
      new Set(['protected-perimeter']),
    )

    expect(aligned.find((wall) => wall.id === 'protected-perimeter')).toMatchObject({
      band: { start: 215, end: 228 },
      openingSampleBand: { start: 220, end: 233 },
    })
    expect(aligned.find((wall) => wall.id === 'interior-wall')).toMatchObject({
      band: { start: 220, end: 233 },
      openingSampleBand: undefined,
    })
  })

  test('keeps a shorter offset wall run separate from a nearby longer perimeter run', () => {
    const merged = mergeAdjacentParallelRasterWalls([
      {
        axis: 'horizontal',
        band: { start: 10, end: 15 },
        id: 'offset-run',
        segment: { start: 60, end: 140 },
      },
      {
        axis: 'horizontal',
        band: { start: 20, end: 25 },
        id: 'long-perimeter-run',
        segment: { start: 20, end: 180 },
      },
    ])

    expect(merged).toHaveLength(2)
    expect(new Set(merged.map((wall) => wall.id))).toEqual(
      new Set(['long-perimeter-run', 'offset-run']),
    )
  })

  test('does not merge a protected perimeter segment into an unprotected parallel candidate', () => {
    const merged = mergeAdjacentParallelRasterWalls(
      [
        {
          axis: 'horizontal',
          band: { start: 10, end: 15 },
          id: 'protected-perimeter',
          segment: { start: 20, end: 180 },
        },
        {
          axis: 'horizontal',
          band: { start: 20, end: 25 },
          id: 'interior-edge',
          segment: { start: 25, end: 175 },
        },
      ],
      8,
      new Set(['protected-perimeter']),
    )

    expect(merged).toHaveLength(2)
  })

  test('does not chain three adjacent parallel bands into one oversized wall', () => {
    const merged = mergeAdjacentParallelRasterWalls([
      {
        axis: 'horizontal',
        band: { start: 0, end: 4 },
        id: 'edge-a',
        segment: { start: 20, end: 180 },
      },
      {
        axis: 'horizontal',
        band: { start: 10, end: 14 },
        id: 'edge-b',
        segment: { start: 20, end: 180 },
      },
      {
        axis: 'horizontal',
        band: { start: 20, end: 24 },
        id: 'edge-c',
        segment: { start: 20, end: 180 },
      },
    ])

    expect(merged).toHaveLength(2)
    expect(Math.max(...merged.map((wall) => wall.band.end - wall.band.start + 1))).toBe(15)
  })

  test('drops dangling furniture strokes but keeps supported partitions and perimeter walls', () => {
    const walls = [
      {
        axis: 'vertical' as const,
        band: { end: 104, start: 100 },
        id: 'left-exterior',
        segment: { end: 900, start: 100 },
      },
      {
        axis: 'horizontal' as const,
        band: { end: 404, start: 400 },
        id: 'middle-wall',
        segment: { end: 900, start: 100 },
      },
      {
        axis: 'horizontal' as const,
        band: { end: 204, start: 200 },
        id: 'furniture-stroke',
        segment: { end: 160, start: 100 },
      },
      {
        axis: 'vertical' as const,
        band: { end: 504, start: 500 },
        id: 'crossing-stroke',
        segment: { end: 460, start: 340 },
      },
      {
        axis: 'vertical' as const,
        band: { end: 304, start: 300 },
        id: 'partition-support-left',
        segment: { end: 760, start: 540 },
      },
      {
        axis: 'vertical' as const,
        band: { end: 364, start: 360 },
        id: 'partition-support-right',
        segment: { end: 760, start: 540 },
      },
      {
        axis: 'horizontal' as const,
        band: { end: 604, start: 600 },
        id: 'supported-short-partition',
        segment: { end: 360, start: 300 },
      },
      {
        axis: 'horizontal' as const,
        band: { end: 904, start: 900 },
        id: 'protected-perimeter-fragment',
        segment: { end: 130, start: 100 },
      },
    ]

    const filtered = filterShortDanglingRasterWalls(
      walls,
      { height: 1000, width: 1000 },
      new Set(['protected-perimeter-fragment']),
    )
    const ids = filtered.map((wall) => wall.id)

    expect(ids).not.toContain('furniture-stroke')
    expect(ids).not.toContain('crossing-stroke')
    expect(ids).toContain('supported-short-partition')
    expect(ids).toContain('protected-perimeter-fragment')
  })

  test('drops a short one-ended wall shadow beside a much longer structural wall', () => {
    const walls = [
      {
        axis: 'vertical' as const,
        band: { end: 54, start: 40 },
        id: 'long-structural-wall',
        segment: { end: 600, start: 100 },
      },
      {
        axis: 'vertical' as const,
        band: { end: 92, start: 76 },
        id: 'lift-outline-shadow',
        segment: { end: 575, start: 450 },
      },
      {
        axis: 'horizontal' as const,
        band: { end: 452, start: 448 },
        id: 'shadow-top-anchor',
        segment: { end: 110, start: 60 },
      },
      {
        axis: 'horizontal' as const,
        band: { end: 512, start: 508 },
        id: 'shadow-crossing',
        segment: { end: 110, start: 60 },
      },
      {
        axis: 'vertical' as const,
        band: { end: 314, start: 300 },
        id: 'supported-short-partition',
        segment: { end: 575, start: 450 },
      },
      {
        axis: 'horizontal' as const,
        band: { end: 452, start: 448 },
        id: 'partition-top-anchor',
        segment: { end: 330, start: 280 },
      },
      {
        axis: 'horizontal' as const,
        band: { end: 577, start: 573 },
        id: 'partition-bottom-anchor',
        segment: { end: 330, start: 280 },
      },
    ]

    const ids = filterShortParallelShadowRasterWalls(walls, {
      height: 1000,
      width: 1000,
    }).map((wall) => wall.id)

    expect(ids).not.toContain('lift-outline-shadow')
    expect(ids).toContain('long-structural-wall')
    expect(ids).toContain('supported-short-partition')
  })

  test('splits an interior wall across a room-sized unsupported span', () => {
    const dimensions = { height: 80, width: 240 }
    const horizontal = new Uint8ClampedArray(dimensions.width * dimensions.height)
    for (let y = 30; y <= 34; y += 1) {
      for (let x = 20; x <= 80; x += 1) {
        horizontal[y * dimensions.width + x] = 1
      }
      for (let x = 161; x <= 220; x += 1) {
        horizontal[y * dimensions.width + x] = 1
      }
    }

    const result = splitRasterWallsAtLongUnsupportedSpans(
      [
        {
          axis: 'horizontal',
          band: { start: 30, end: 34 },
          id: 'cross-room-wall',
          segment: { start: 20, end: 220 },
        },
      ],
      {
        horizontal,
        vertical: new Uint8ClampedArray(horizontal.length),
      },
      dimensions,
      { horizontal: 60, vertical: 60 },
      { horizontal: 40, vertical: 40 },
    )

    expect(result.splitWallIds).toEqual(new Set(['cross-room-wall']))
    expect(result.walls).toEqual([
      {
        axis: 'horizontal',
        band: { start: 30, end: 34 },
        id: 'cross-room-wall:part:1',
        segment: { start: 20, end: 80 },
      },
      {
        axis: 'horizontal',
        band: { start: 30, end: 34 },
        id: 'cross-room-wall:part:2',
        segment: { start: 161, end: 220 },
      },
    ])
  })

  test('uses a stable room-fill color boundary to preserve an occluded wall span', () => {
    const width = 140
    const height = 90
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = (y * width + x) * 4
        const color = y < 45 ? [210, 188, 176] : [170, 196, 218]
        data[pixelIndex] = color[0]!
        data[pixelIndex + 1] = color[1]!
        data[pixelIndex + 2] = color[2]!
        data[pixelIndex + 3] = 255
      }
    }
    const wall = {
      axis: 'horizontal' as const,
      band: { start: 42, end: 48 },
      id: 'occluded-wall',
      segment: { start: 20, end: 120 },
    }

    expect(
      hasStrongColorBoundaryAcrossRasterWall({ data, height, width }, wall, {
        start: 40,
        end: 100,
      }),
    ).toBe(true)

    for (let y = 45; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = (y * width + x) * 4
        data[pixelIndex] = 210
        data[pixelIndex + 1] = 188
        data[pixelIndex + 2] = 176
      }
    }
    expect(
      hasStrongColorBoundaryAcrossRasterWall({ data, height, width }, wall, {
        start: 40,
        end: 100,
      }),
    ).toBe(false)
  })

  test('does not split a long unsupported range when secondary evidence preserves it', () => {
    const dimensions = { height: 80, width: 240 }
    const horizontal = new Uint8ClampedArray(dimensions.width * dimensions.height)
    for (let y = 30; y <= 34; y += 1) {
      for (let x = 20; x <= 80; x += 1) {
        horizontal[y * dimensions.width + x] = 1
      }
      for (let x = 161; x <= 220; x += 1) {
        horizontal[y * dimensions.width + x] = 1
      }
    }
    const wall = {
      axis: 'horizontal' as const,
      band: { start: 30, end: 34 },
      id: 'occluded-wall',
      segment: { start: 20, end: 220 },
    }

    const result = splitRasterWallsAtLongUnsupportedSpans(
      [wall],
      {
        horizontal,
        vertical: new Uint8ClampedArray(horizontal.length),
      },
      dimensions,
      { horizontal: 60, vertical: 60 },
      { horizontal: 40, vertical: 40 },
      new Set(),
      (_candidate, range) => range.start === 81 && range.end === 160,
    )

    expect(result.splitWallIds.size).toBe(0)
    expect(result.walls).toEqual([wall])
  })

  test('keeps a normal door gap and protects exterior window runs from splitting', () => {
    const dimensions = { height: 80, width: 240 }
    const horizontal = new Uint8ClampedArray(dimensions.width * dimensions.height)
    for (let y = 30; y <= 34; y += 1) {
      for (let x = 20; x <= 220; x += 1) {
        if (x < 91 || x > 140) {
          horizontal[y * dimensions.width + x] = 1
        }
      }
    }
    const walls = [
      {
        axis: 'horizontal' as const,
        band: { start: 30, end: 34 },
        id: 'interior-door-wall',
        segment: { start: 20, end: 220 },
      },
      {
        axis: 'horizontal' as const,
        band: { start: 40, end: 44 },
        id: 'exterior-window-wall',
        segment: { start: 20, end: 220 },
      },
    ]

    const result = splitRasterWallsAtLongUnsupportedSpans(
      walls,
      {
        horizontal,
        vertical: new Uint8ClampedArray(horizontal.length),
      },
      dimensions,
      { horizontal: 60, vertical: 60 },
      { horizontal: 40, vertical: 40 },
      new Set(['exterior-window-wall']),
    )

    expect(result.splitWallIds.size).toBe(0)
    expect(result.walls).toEqual(walls)
  })

  test('keeps a long narrow wall anchored to a dominant exterior boundary', () => {
    const thickWalls = [
      {
        axis: 'horizontal' as const,
        band: { start: 93, end: 107 },
        id: 'top',
        segment: { start: 200, end: 850 },
      },
      {
        axis: 'horizontal' as const,
        band: { start: 782, end: 796 },
        id: 'bottom',
        segment: { start: 200, end: 850 },
      },
      {
        axis: 'vertical' as const,
        band: { start: 193, end: 207 },
        id: 'left',
        segment: { start: 100, end: 790 },
      },
      {
        axis: 'vertical' as const,
        band: { start: 843, end: 857 },
        id: 'right',
        segment: { start: 100, end: 790 },
      },
      {
        axis: 'horizontal' as const,
        band: { start: 393, end: 407 },
        id: 'middle-a',
        segment: { start: 200, end: 500 },
      },
      {
        axis: 'horizontal' as const,
        band: { start: 493, end: 507 },
        id: 'middle-b',
        segment: { start: 500, end: 850 },
      },
    ]
    const longBoundaryWall = {
      axis: 'vertical' as const,
      band: { start: 411, end: 419 },
      id: 'long-boundary-wall',
      segment: { start: 616, end: 801 },
    }
    const furnitureLine = {
      axis: 'vertical' as const,
      band: { start: 339, end: 345 },
      id: 'furniture-line',
      segment: { start: 404, end: 585 },
    }

    const filtered = filterDecorativeThinRasterWalls(
      [...thickWalls, longBoundaryWall, furnitureLine],
      0.65,
      { height: 980, width: 1080 },
    )

    expect(filtered.find((wall) => wall.id === 'long-boundary-wall')).toMatchObject({
      boundaryAnchored: true,
    })
    expect(filtered.map((wall) => wall.id)).not.toContain('furniture-line')
  })

  test('splits a two-end thin-line candidate at wall anchors and keeps only dense spans', () => {
    const dimensions = { height: 200, width: 200 }
    const horizontal = new Uint8ClampedArray(dimensions.width * dimensions.height)
    for (let y = 48; y <= 52; y += 1) {
      for (let x = 100; x <= 160; x += 1) {
        horizontal[y * dimensions.width + x] = 1
      }
    }
    const primaryWalls = [40, 100, 160].map((center, index) => ({
      axis: 'vertical' as const,
      band: { start: center - 2, end: center + 2 },
      id: `anchor-${index}`,
      segment: { start: 30, end: 80 },
    }))

    const result = supplementRasterWallCandidates(
      primaryWalls,
      [
        {
          axis: 'horizontal',
          band: { start: 48, end: 52 },
          id: 'thin-span',
          segment: { start: 40, end: 160 },
        },
      ],
      dimensions,
      {
        horizontal,
        vertical: new Uint8ClampedArray(horizontal.length),
      },
    )

    expect(result.walls.find((wall) => wall.id === 'thin-span:anchored:2')?.segment).toEqual({
      start: 100,
      end: 160,
    })
    expect(result.walls.map((wall) => wall.id)).not.toContain('thin-span:anchored:1')
  })

  test('rejects a dense thin-wall span when only one candidate endpoint is anchored', () => {
    const dimensions = { height: 200, width: 200 }
    const vertical = new Uint8ClampedArray(dimensions.width * dimensions.height)
    for (let y = 50; y <= 110; y += 1) {
      for (let x = 98; x <= 102; x += 1) {
        vertical[y * dimensions.width + x] = 1
      }
    }
    const primaryWalls = [50, 110, 170].map((center, index) => ({
      axis: 'horizontal' as const,
      band: { start: center - 2, end: center + 2 },
      id: `anchor-${index}`,
      segment: { start: 80, end: 120 },
    }))

    const result = supplementRasterWallCandidates(
      primaryWalls,
      [
        {
          axis: 'vertical',
          band: { start: 98, end: 102 },
          id: 'one-ended-thin-wall',
          segment: { start: 50, end: 185 },
        },
      ],
      dimensions,
      {
        horizontal: new Uint8ClampedArray(vertical.length),
        vertical,
      },
    )

    expect(result.walls.map((wall) => wall.id)).not.toContain('one-ended-thin-wall:anchored:1')
    expect(result.supplementedWallIds).toEqual(new Set())
  })

  test('bridges aligned wall cores through a structurally supported anchored occlusion', () => {
    const dimensions = { height: 200, width: 200 }
    const vertical = new Uint8ClampedArray(dimensions.width * dimensions.height)
    for (let y = 71; y <= 87; y += 1) {
      for (let x = 98; x <= 99; x += 1) {
        vertical[y * dimensions.width + x] = 1
      }
    }
    const primaryWalls = [
      {
        axis: 'vertical' as const,
        band: { start: 98, end: 102 },
        id: 'upper-wall-core',
        maxCollinearGap: 16,
        segment: { start: 20, end: 70 },
      },
      {
        axis: 'vertical' as const,
        band: { start: 98, end: 102 },
        id: 'lower-wall-core',
        maxCollinearGap: 16,
        segment: { start: 88, end: 150 },
      },
      {
        axis: 'horizontal' as const,
        band: { start: 68, end: 72 },
        id: 'upper-gap-anchor',
        segment: { start: 60, end: 140 },
      },
      {
        axis: 'horizontal' as const,
        band: { start: 86, end: 90 },
        id: 'lower-gap-anchor',
        segment: { start: 60, end: 140 },
      },
    ]

    const result = bridgeRasterWallsAcrossAnchoredOcclusions(
      primaryWalls,
      {
        horizontal: new Uint8ClampedArray(vertical.length),
        vertical,
      },
      dimensions,
    )

    expect(result.walls.find((wall) => wall.id === 'upper-wall-core')?.segment).toEqual({
      start: 20,
      end: 150,
    })
    expect(result.walls.find((wall) => wall.id === 'upper-wall-core')?.occludedSpans).toEqual([
      { start: 71, end: 87 },
    ])
    expect(result.walls.map((wall) => wall.id)).not.toContain('lower-wall-core')
    expect(result.bridgedWallIds).toEqual(new Set(['upper-wall-core']))
  })

  test('supplements boundary walls while rejecting interior thin-line crossings', () => {
    const primaryWalls = [
      {
        axis: 'vertical' as const,
        band: { start: 8, end: 12 },
        id: 'left-wall',
        segment: { start: 20, end: 80 },
      },
      {
        axis: 'vertical' as const,
        band: { start: 88, end: 92 },
        id: 'right-wall',
        segment: { start: 20, end: 80 },
      },
    ]
    const supplementalWalls = [
      {
        axis: 'horizontal' as const,
        band: { start: 19, end: 21 },
        id: 'top-boundary',
        segment: { start: 10, end: 90 },
      },
      {
        axis: 'horizontal' as const,
        band: { start: 49, end: 51 },
        id: 'interior-grid-line',
        segment: { start: 10, end: 90 },
      },
    ]

    const result = supplementRasterWallCandidates(primaryWalls, supplementalWalls, {
      height: 100,
      width: 100,
    })

    expect(result.walls.map((wall) => wall.id)).toContain('top-boundary')
    expect(result.walls.map((wall) => wall.id)).not.toContain('interior-grid-line')
    expect(result.walls.find((wall) => wall.id === 'right-wall')?.segment).toEqual({
      start: 20,
      end: 80,
    })
    expect(result.supplementedWallIds).toEqual(new Set(['top-boundary']))
  })

  test('extends a collinear wall core when its new endpoint terminates at another wall', () => {
    const result = supplementRasterWallCandidates(
      [
        {
          axis: 'vertical',
          band: { start: 48, end: 52 },
          id: 'wall-core',
          segment: { start: 20, end: 50 },
        },
        {
          axis: 'horizontal',
          band: { start: 78, end: 82 },
          id: 'bottom-wall',
          segment: { start: 20, end: 80 },
        },
      ],
      [
        {
          axis: 'vertical',
          band: { start: 48, end: 52 },
          id: 'thin-wall-extension',
          segment: { start: 20, end: 80 },
        },
      ],
      { height: 100, width: 100 },
    )

    expect(result.walls.find((wall) => wall.id === 'wall-core')?.segment).toEqual({
      start: 20,
      end: 80,
    })
    expect(result.supplementedWallIds).toEqual(new Set(['wall-core']))
  })

  test('extends an existing structural wall along collinear thin-line support', () => {
    const dimensions = { height: 100, width: 100 }
    const vertical = new Uint8ClampedArray(dimensions.width * dimensions.height)
    for (let y = 2; y <= 80; y += 1) {
      for (let x = 89; x <= 91; x += 1) {
        vertical[y * dimensions.width + x] = 1
      }
    }

    const result = extendRasterWallCandidatesWithThinLineSupport(
      [
        {
          axis: 'vertical',
          band: { start: 88, end: 92 },
          id: 'right-wall',
          segment: { start: 20, end: 80 },
        },
      ],
      {
        combined: vertical,
        horizontal: new Uint8ClampedArray(vertical.length),
        vertical,
      },
      dimensions,
      { x: { start: 0, end: 99 }, y: { start: 0, end: 99 } },
    )

    expect(result.walls[0]?.segment).toEqual({ start: 2, end: 80 })
    expect(result.supplementedWallIds).toEqual(new Set(['right-wall']))
  })

  test('merges the two strokes of a thin outlined boundary into one wall band', () => {
    const merged = mergeParallelThinRasterWallCandidates([
      {
        axis: 'horizontal',
        band: { start: 10, end: 13 },
        id: 'outline-top',
        segment: { start: 20, end: 90 },
      },
      {
        axis: 'horizontal',
        band: { start: 21, end: 24 },
        id: 'outline-bottom',
        segment: { start: 20, end: 90 },
      },
    ])

    expect(merged).toEqual([
      {
        axis: 'horizontal',
        band: { start: 10, end: 24 },
        id: 'outline-top',
        segment: { start: 20, end: 90 },
      },
    ])
  })

  test('keeps only the main connected wall network and drops detached annotation islands', () => {
    const filtered = filterDisconnectedRasterWalls([
      {
        axis: 'horizontal',
        band: { end: 44, start: 40 },
        id: 'main-top',
        segment: { end: 100, start: 30 },
      },
      {
        axis: 'vertical',
        band: { end: 64, start: 58 },
        id: 'main-right',
        segment: { end: 92, start: 20 },
      },
      {
        axis: 'horizontal',
        band: { end: 80, start: 76 },
        id: 'main-bottom',
        segment: { end: 100, start: 30 },
      },
      {
        axis: 'horizontal',
        band: { end: 12, start: 8 },
        id: 'detached-top-dimension',
        segment: { end: 42, start: 4 },
      },
      {
        axis: 'vertical',
        band: { end: 22, start: 18 },
        id: 'detached-bottom-dimension',
        segment: { end: 98, start: 86 },
      },
    ])

    expect(filtered.map((candidate) => candidate.id)).toEqual([
      'main-top',
      'main-right',
      'main-bottom',
    ])
  })

  test('keeps meaningful secondary wall components inside the main plan body', () => {
    const filtered = filterDisconnectedRasterWalls([
      {
        axis: 'horizontal',
        band: { end: 44, start: 40 },
        id: 'main-top',
        segment: { end: 120, start: 30 },
      },
      {
        axis: 'vertical',
        band: { end: 64, start: 58 },
        id: 'main-right',
        segment: { end: 100, start: 20 },
      },
      {
        axis: 'horizontal',
        band: { end: 104, start: 100 },
        id: 'main-bottom',
        segment: { end: 120, start: 30 },
      },
      {
        axis: 'horizontal',
        band: { end: 74, start: 70 },
        id: 'secondary-room-top',
        segment: { end: 72, start: 34 },
      },
      {
        axis: 'vertical',
        band: { end: 72, start: 68 },
        id: 'secondary-room-side',
        segment: { end: 100, start: 70 },
      },
      {
        axis: 'horizontal',
        band: { end: 12, start: 8 },
        id: 'single-dimension-line',
        segment: { end: 42, start: 4 },
      },
    ])

    expect(filtered.map((candidate) => candidate.id)).toEqual([
      'main-top',
      'main-right',
      'main-bottom',
      'secondary-room-top',
      'secondary-room-side',
    ])
  })

  test('can restrict thin-line detection to the primary connected wall component', () => {
    const candidates = [
      {
        axis: 'horizontal',
        band: { end: 44, start: 40 },
        id: 'main-top',
        segment: { end: 120, start: 30 },
      },
      {
        axis: 'vertical',
        band: { end: 64, start: 58 },
        id: 'main-right',
        segment: { end: 100, start: 20 },
      },
      {
        axis: 'horizontal',
        band: { end: 104, start: 100 },
        id: 'main-bottom',
        segment: { end: 120, start: 30 },
      },
      {
        axis: 'horizontal',
        band: { end: 74, start: 70 },
        id: 'secondary-noisy-line',
        segment: { end: 188, start: 150 },
      },
      {
        axis: 'vertical',
        band: { end: 188, start: 184 },
        id: 'secondary-noisy-side',
        segment: { end: 100, start: 70 },
      },
    ] satisfies Parameters<typeof filterDisconnectedRasterWalls>[0]

    expect(
      filterDisconnectedRasterWalls(candidates, false).map((candidate) => candidate.id),
    ).toEqual(['main-top', 'main-right', 'main-bottom'])
  })

  test('focuses structure bounds on the main floorplan body instead of detached dimension lines', () => {
    const width = 120
    const height = 100
    const structuralMask = new Uint8ClampedArray(width * height)

    for (let y = 22; y <= 74; y += 1) {
      for (let x = 28; x <= 92; x += 1) {
        structuralMask[y * width + x] = 1
      }
    }

    for (let x = 38; x <= 82; x += 1) {
      structuralMask[6 * width + x] = 1
      structuralMask[90 * width + x] = 1
    }

    for (let y = 32; y <= 70; y += 1) {
      structuralMask[y * width + 8] = 1
    }

    expect(getStructuralBounds(structuralMask, { width, height })).toEqual({
      x: { start: 16, end: 104 },
      y: { start: 10, end: 86 },
    })
  })

  test('trims raster walls to the main structure bounds and drops detached annotation candidates', () => {
    const trimmed = trimRasterWallCandidatesToStructureBounds(
      [
        {
          axis: 'horizontal',
          band: { end: 44, start: 40 },
          id: 'interior-wall',
          segment: { end: 80, start: 12 },
        },
        {
          axis: 'horizontal',
          band: { end: 8, start: 4 },
          id: 'top-dimension-line',
          segment: { end: 88, start: 30 },
        },
        {
          axis: 'vertical',
          band: { end: 52, start: 48 },
          id: 'bottom-protrusion',
          segment: { end: 92, start: 18 },
        },
        {
          axis: 'horizontal',
          band: { end: 48, start: 44 },
          id: 'left-annotation-line',
          segment: { end: 10, start: 0 },
        },
      ],
      {
        x: { start: 20, end: 84 },
        y: { start: 24, end: 76 },
      },
    )

    expect(trimmed).toEqual([
      {
        axis: 'horizontal',
        band: { end: 44, start: 40 },
        id: 'interior-wall',
        segment: { end: 80, start: 20 },
      },
      {
        axis: 'vertical',
        band: { end: 52, start: 48 },
        id: 'bottom-protrusion',
        segment: { end: 76, start: 24 },
      },
    ])
  })

  test('requires gaps to be flanked by enough wall support and not sit on wall ends', () => {
    expect(
      isGapLikelyOpening(
        [4, 4, 4, 0, 0, 4, 4, 4],
        [4, 4, 4, 0, 0, 4, 4, 4],
        { start: 3, end: 4 },
        4,
        'void',
      ),
    ).toBe(false)
    expect(
      isGapLikelyOpening(
        [
          4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
          4, 4,
        ],
        [
          4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
          4, 4,
        ],
        { start: 12, end: 19 },
        4,
        'void',
      ),
    ).toBe(true)
    expect(
      isGapLikelyOpening(
        [
          4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
          4, 4,
        ],
        [
          4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
          4, 4,
        ],
        { start: 12, end: 19 },
        4,
        'framed',
      ),
    ).toBe(true)
  })

  test('accepts an opening near a wall end when both adaptive flanks still have enough support', () => {
    const structuralSamples = Array.from({ length: 80 }, () => 4)
    const rawDarkSamples = Array.from({ length: 80 }, () => 4)
    structuralSamples.fill(0, 15, 30)
    rawDarkSamples.fill(0, 15, 30)

    expect(
      isGapLikelyOpening(
        structuralSamples,
        rawDarkSamples,
        { start: 15, end: 29 },
        4,
        'void',
        4,
        true,
      ),
    ).toBe(true)

    expect(
      isGapLikelyOpening(
        structuralSamples,
        rawDarkSamples,
        { start: 9, end: 29 },
        4,
        'void',
        4,
        true,
      ),
    ).toBe(false)
  })

  test('keeps structural door voids separate from wider framed signals and prefers door swing evidence', () => {
    const structuralSamples = Array.from({ length: 70 }, () => 4)
    const rawDarkSamples = Array.from({ length: 70 }, () => 4)
    structuralSamples.fill(0, 20, 32)
    rawDarkSamples.fill(0, 20, 46)

    const signals = buildOpeningSignalCandidates(structuralSamples, rawDarkSamples, 4)
    expect(signals).toEqual([
      { mode: 'void', range: { start: 20, end: 31 } },
      { mode: 'framed', range: { start: 20, end: 45 } },
    ])
    expect(buildOpeningSignalCandidates(structuralSamples, rawDarkSamples, 4, 4, false)).toEqual([
      { mode: 'void', range: { start: 20, end: 45 } },
    ])
    expect(
      resolveOverlappingOpeningSignals(
        signals.map((signal) => ({
          ...signal,
          hasDoorSwing: signal.mode === 'void',
        })),
      ).map((signal) => signal.mode),
    ).toEqual(['void'])
    expect(
      resolveOverlappingOpeningSignals(
        signals.map((signal) => ({
          ...signal,
          hasDoorSwing: false,
        })),
      ).map((signal) => signal.mode),
    ).toEqual(['framed'])
  })

  test('does not treat crop-edge candidates as page borders when the crop sits away from the image edge', () => {
    const filtered = filterFrameLikeWallCandidates(
      [
        {
          axis: 'horizontal',
          band: { end: 4, start: 0 },
          id: 'cropped-top-wall',
          segment: { end: 717, start: 0 },
        },
      ],
      { height: 800, width: 1200 },
      { x: 180, y: 120 },
    )

    expect(filtered.map((candidate) => candidate.id)).toEqual(['cropped-top-wall'])
  })

  test('keeps long structural walls that are not hugging the page edge', () => {
    const filtered = filterFrameLikeWallCandidates(
      [
        {
          axis: 'horizontal',
          band: { end: 352, start: 346 },
          id: 'cropped-exterior-wall',
          segment: { end: 1128, start: 72 },
        },
      ],
      { height: 800, width: 1200 },
    )

    expect(filtered.map((candidate) => candidate.id)).toEqual(['cropped-exterior-wall'])
  })

  test('creates formal wall nodes from detected guide candidates and returns their mapping', () => {
    const created: Array<{ node: Record<string, unknown>; parentId?: AnyNodeId }> = []

    const wallIdMap = applyDetectedWalls(
      'level_detection_test' as AnyNodeId,
      {
        generatedAt: 1,
        guideId: 'guide_detection_test',
        openings: [],
        walls: [
          {
            end: [5, 0],
            id: 'candidate-wall-1',
            start: [0, 0],
            thickness: 0.18,
          },
        ],
      },
      (node, parentId) => {
        created.push({ node: node as Record<string, unknown>, parentId })
      },
    )

    expect(created).toHaveLength(1)
    expect(created[0]?.parentId).toBe('level_detection_test')
    expect(created[0]?.node.type).toBe('wall')
    expect(created[0]?.node.parentId).toBe('level_detection_test')
    expect(created[0]?.node.metadata).toMatchObject({
      blueprintDetection: true,
      sourceGuideId: 'guide_detection_test',
    })
    expect(wallIdMap.get('candidate-wall-1')).toBe(created[0]?.node.id)
  })

  test('applies only reviewed guide detection candidates', () => {
    const candidates = {
      generatedAt: 1,
      guideId: 'guide_detection_test',
      selectedOpeningIds: ['opening-door-1'],
      selectedWallIds: ['candidate-wall-1'],
      openings: [
        {
          center: [1, 0],
          height: 2.1,
          id: 'opening-door-1',
          kind: 'door' as const,
          wallCandidateId: 'candidate-wall-1',
          width: 0.9,
          yOffset: 1.05,
        },
        {
          center: [2, 0],
          height: 1.5,
          id: 'opening-window-1',
          kind: 'window' as const,
          wallCandidateId: 'candidate-wall-2',
          width: 1.2,
          yOffset: 1.45,
        },
      ],
      walls: [
        {
          end: [4, 0] as [number, number],
          id: 'candidate-wall-1',
          start: [0, 0] as [number, number],
          thickness: 0.18,
        },
        {
          end: [0, 4] as [number, number],
          id: 'candidate-wall-2',
          start: [0, 0] as [number, number],
          thickness: 0.18,
        },
      ],
    }

    expect(getSelectedGuideDetectionCandidates(candidates)).toMatchObject({
      openings: [{ id: 'opening-door-1' }],
      walls: [{ id: 'candidate-wall-1' }],
    })

    const created: Array<{ node: Record<string, unknown>; parentId?: AnyNodeId }> = []
    const wallIdMap = applyDetectedWalls(
      'level_detection_test' as AnyNodeId,
      candidates,
      (node, parentId) => {
        created.push({ node: node as Record<string, unknown>, parentId })
      },
    )

    expect(wallIdMap.has('candidate-wall-1')).toBe(true)
    expect(wallIdMap.has('candidate-wall-2')).toBe(false)
    expect(created).toHaveLength(1)

    const openingCount = applyDetectedOpenings(
      candidates,
      wallIdMap,
      (node, parentId) => {
        created.push({ node: node as Record<string, unknown>, parentId })
      },
      candidates.walls,
    )

    expect(openingCount).toBe(1)
    expect(created).toHaveLength(2)
    expect(created[1]?.node.type).toBe('door')
  })

  test('creates the reviewed 3D wall and opening model in one operation', () => {
    const created: Array<{ node: Record<string, unknown>; parentId?: AnyNodeId }> = []
    const candidates = {
      generatedAt: 1,
      guideId: 'guide_generate_3d',
      openings: [
        {
          center: [2, 0] as [number, number],
          height: 1.5,
          id: 'window-generate-1',
          kind: 'window' as const,
          wallCandidateId: 'wall-generate-1',
          width: 1.2,
          yOffset: 1.45,
        },
      ],
      walls: [
        {
          end: [5, 0] as [number, number],
          id: 'wall-generate-1',
          start: [0, 0] as [number, number],
          thickness: 0.18,
        },
      ],
    }

    const result = applyDetectedGuideModel(
      'level_generate_3d' as AnyNodeId,
      candidates,
      (node, parentId) => created.push({ node: node as Record<string, unknown>, parentId }),
    )

    expect(result.wallCount).toBe(1)
    expect(result.openingCount).toBe(1)
    expect(created.map((entry) => entry.node.type)).toEqual(['wall', 'window'])
    expect(created[1]?.parentId).toBe(created[0]?.node.id)
  })

  test('reuses previously applied walls when generating the remaining 3D openings', () => {
    const created: Array<{ node: Record<string, unknown>; parentId?: AnyNodeId }> = []
    const result = applyDetectedGuideModel(
      'level_generate_3d' as AnyNodeId,
      {
        appliedWallIds: { 'wall-generate-1': 'wall_existing_1' },
        generatedAt: 1,
        guideId: 'guide_generate_3d',
        openings: [
          {
            center: [2, 0],
            height: 1.5,
            id: 'window-generate-1',
            kind: 'window',
            wallCandidateId: 'wall-generate-1',
            width: 1.2,
            yOffset: 1.45,
          },
          {
            center: [2, 3],
            height: 2.1,
            id: 'door-generate-2',
            kind: 'door',
            wallCandidateId: 'wall-generate-2',
            width: 0.9,
            yOffset: 1.05,
          },
        ],
        walls: [
          {
            end: [5, 0],
            id: 'wall-generate-1',
            start: [0, 0],
            thickness: 0.18,
          },
          {
            end: [5, 3],
            id: 'wall-generate-2',
            start: [0, 3],
            thickness: 0.18,
          },
        ],
      },
      (node, parentId) => created.push({ node: node as Record<string, unknown>, parentId }),
    )

    expect(result.wallCount).toBe(2)
    expect(result.openingCount).toBe(2)
    expect(created.map((entry) => entry.node.type)).toEqual(['wall', 'window', 'door'])
    expect(created[1]?.parentId).toBe('wall_existing_1')
    expect(created[2]?.parentId).toBe(created[0]?.node.id)
  })

  test('creates door and window nodes from confirmed candidates and clamps the opening offset', () => {
    const created: Array<{ node: Record<string, unknown>; parentId?: AnyNodeId }> = []

    const wallIdMap = new Map<string, `wall_${string}`>([['candidate-wall-1', 'wall_confirmed_1']])

    const createdCount = applyDetectedOpenings(
      {
        appliedWallIds: { 'candidate-wall-1': 'wall_confirmed_1' },
        generatedAt: 1,
        guideId: 'guide_detection_test',
        openings: [
          {
            center: [5.6, 0],
            height: 2.1,
            id: 'opening-door-1',
            kind: 'door',
            wallCandidateId: 'candidate-wall-1',
            width: 1,
            yOffset: 1.05,
          },
          {
            center: [2.2, 0],
            height: 1.5,
            id: 'opening-window-1',
            kind: 'window',
            wallCandidateId: 'candidate-wall-1',
            width: 1.2,
            yOffset: 1.45,
          },
        ],
        walls: [
          {
            end: [4, 0],
            id: 'candidate-wall-1',
            start: [0, 0],
            thickness: 0.18,
          },
        ],
      },
      wallIdMap,
      (node, parentId) => {
        created.push({ node: node as Record<string, unknown>, parentId })
      },
      [
        {
          end: [4, 0],
          id: 'candidate-wall-1',
          start: [0, 0],
          thickness: 0.18,
        },
      ],
    )

    expect(createdCount).toBe(2)
    expect(created).toHaveLength(2)
    expect(created[0]?.node.type).toBe('door')
    expect(created[0]?.parentId).toBe('wall_confirmed_1')
    expect(created[0]?.node.wallId).toBe('wall_confirmed_1')
    expect(created[0]?.node.position).toEqual([3.85, 1.05, 0])
    expect(created[0]?.node.metadata).toMatchObject({
      blueprintDetection: true,
      sourceGuideId: 'guide_detection_test',
    })

    expect(created[1]?.node.type).toBe('window')
    expect(created[1]?.parentId).toBe('wall_confirmed_1')
    expect(created[1]?.node.wallId).toBe('wall_confirmed_1')
    expect(created[1]?.node.position).toEqual([2.2, 1.45, 0])
  })
})
