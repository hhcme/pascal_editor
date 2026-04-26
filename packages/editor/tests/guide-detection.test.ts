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
let applyDetectedWalls: typeof import('../src/lib/guide-detection').applyDetectedWalls
let buildGuideDetectionDebugSnapshot: typeof import('../src/lib/guide-detection').buildGuideDetectionDebugSnapshot
let buildStructuralWallMask: typeof import('../src/lib/guide-detection').buildStructuralWallMask
let dedupeRasterWallCandidates: typeof import('../src/lib/guide-detection').dedupeRasterWallCandidates
let detectGuideCandidatesFromImageData: typeof import('../src/lib/guide-detection').detectGuideCandidatesFromImageData
let filterDisconnectedRasterWalls: typeof import('../src/lib/guide-detection').filterDisconnectedRasterWalls
let filterFrameLikeWallCandidates: typeof import('../src/lib/guide-detection').filterFrameLikeWallCandidates
let getGuideDetectionPixelRegion: typeof import('../src/lib/guide-detection').getGuideDetectionPixelRegion
let getAdaptiveDarkThreshold: typeof import('../src/lib/guide-detection').getAdaptiveDarkThreshold
let getSelectedGuideDetectionCandidates: typeof import('../src/lib/guide-detection').getSelectedGuideDetectionCandidates
let getStructuralBounds: typeof import('../src/lib/guide-detection').getStructuralBounds
let groupDenseRangesWithGapTolerance: typeof import('../src/lib/guide-detection').groupDenseRangesWithGapTolerance
let isGapLikelyOpening: typeof import('../src/lib/guide-detection').isGapLikelyOpening
let trimRasterWallCandidatesToStructureBounds: typeof import('../src/lib/guide-detection').trimRasterWallCandidatesToStructureBounds

beforeAll(async () => {
  ;({
    applyDetectedOpenings,
    applyDetectedWalls,
    buildGuideDetectionDebugSnapshot,
    buildStructuralWallMask,
    dedupeRasterWallCandidates,
    detectGuideCandidatesFromImageData,
    filterDisconnectedRasterWalls,
    filterFrameLikeWallCandidates,
    getAdaptiveDarkThreshold,
    getGuideDetectionPixelRegion,
    getSelectedGuideDetectionCandidates,
    getStructuralBounds,
    groupDenseRangesWithGapTolerance,
    isGapLikelyOpening,
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
