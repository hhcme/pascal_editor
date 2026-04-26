import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GuideNode } from '@pascal-app/core'
import { mock } from 'bun:test'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import type {
  GuideDetectionDebugSnapshot,
  GuideDetectionImageData,
  RasterWallCandidate,
} from '../packages/editor/src/lib/guide-detection'

type DebugOptions = {
  guideScaleOverride: number | null
  input: string
  limit: number | null
  out: string
  summaryOnly: boolean
}

type DatasetHints = {
  expectedWallRectsByImage: Map<string, number>
  pixelsPerMeterByImage: Map<string, number>
}

type PixelPoint = {
  x: number
  y: number
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, '..')
const defaultInput = join(workspaceRoot, 'packages/editor/fixtures/guide-detection/mlstructfp')
const defaultOutput = join(workspaceRoot, 'packages/editor/fixtures/guide-detection/debug-output')
const maxDebugWidth = 1600

mock.module('@pascal-app/core', () => ({
  DoorNode: { parse: (input: Record<string, unknown>) => ({ id: 'debug-door', ...input }) },
  WallNode: { parse: (input: Record<string, unknown>) => ({ id: 'debug-wall', ...input }) },
  WindowNode: { parse: (input: Record<string, unknown>) => ({ id: 'debug-window', ...input }) },
  loadAssetUrl: async () => null,
}))

const { buildGuideDetectionDebugSnapshot } = await import('../packages/editor/src/lib/guide-detection')

function parseArgs(argv: string[]): DebugOptions {
  const options: DebugOptions = {
    guideScaleOverride: null,
    input: defaultInput,
    limit: null,
    out: defaultOutput,
    summaryOnly: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input' && argv[index + 1]) {
      options.input = resolve(workspaceRoot, argv[index + 1]!)
      index += 1
      continue
    }
    if (arg === '--out' && argv[index + 1]) {
      options.out = resolve(workspaceRoot, argv[index + 1]!)
      index += 1
      continue
    }
    if (arg === '--limit' && argv[index + 1]) {
      const parsed = Number.parseInt(argv[index + 1]!, 10)
      options.limit = Number.isFinite(parsed) ? parsed : null
      index += 1
      continue
    }
    if (arg === '--scale' && argv[index + 1]) {
      const parsed = Number.parseFloat(argv[index + 1]!)
      options.guideScaleOverride = Number.isFinite(parsed) && parsed > 0 ? parsed : null
      index += 1
      continue
    }
    if (arg === '--summary-only') {
      options.summaryOnly = true
    }
  }

  return options
}

const supportedImageExtensions = new Set(['.jpeg', '.jpg', '.png'])

function isIgnoredDirectory(path: string, excludedRoots: string[]) {
  const resolvedPath = resolve(path)
  if (['.git', 'debug-output', 'node_modules'].includes(basename(path))) {
    return true
  }

  return excludedRoots.some((root) => {
    const resolvedRoot = resolve(root)
    return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}/`)
  })
}

async function getImageInputs(input: string, excludedRoots: string[] = []) {
  if (supportedImageExtensions.has(extname(input).toLowerCase())) {
    return [input]
  }

  const results: string[] = []
  const pending = [input]

  while (pending.length > 0) {
    const current = pending.pop()!
    const entries = await readdir(current, { withFileTypes: true })

    for (const entry of entries) {
      const entryPath = join(current, entry.name)
      if (entry.isDirectory()) {
        if (isIgnoredDirectory(entryPath, excludedRoots)) {
          continue
        }

        pending.push(entryPath)
        continue
      }

      if (entry.isFile() && supportedImageExtensions.has(extname(entry.name).toLowerCase())) {
        results.push(entryPath)
      }
    }
  }

  return results.sort((left, right) => left.localeCompare(right))
}

function getPixelOffset(width: number, x: number, y: number) {
  return (y * width + x) * 4
}

function resizePngNearest(source: PNG, targetWidth: number, targetHeight: number) {
  const resized = new PNG({ width: targetWidth, height: targetHeight })

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y / targetHeight) * source.height))
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x / targetWidth) * source.width))
      const sourceOffset = getPixelOffset(source.width, sourceX, sourceY)
      const targetOffset = getPixelOffset(targetWidth, x, y)
      resized.data[targetOffset] = source.data[sourceOffset]
      resized.data[targetOffset + 1] = source.data[sourceOffset + 1]
      resized.data[targetOffset + 2] = source.data[sourceOffset + 2]
      resized.data[targetOffset + 3] = source.data[sourceOffset + 3]
    }
  }

  return resized
}

function normalizePngForDetection(source: PNG) {
  if (source.width <= maxDebugWidth) {
    return source
  }

  const width = maxDebugWidth
  const height = Math.max(1, Math.round((width / source.width) * source.height))
  return resizePngNearest(source, width, height)
}

async function decodeImageFile(inputPath: string) {
  const buffer = await readFile(inputPath)
  const extension = extname(inputPath).toLowerCase()

  if (extension === '.png') {
    return PNG.sync.read(buffer)
  }

  const decoded = jpeg.decode(buffer, { useTArray: true })
  const png = new PNG({ width: decoded.width, height: decoded.height })
  png.data.set(decoded.data)
  return png
}

function pngToImageData(png: PNG): GuideDetectionImageData {
  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
  }
}

function makeDebugGuide(id: string, scale = 1): GuideNode {
  return {
    id,
    type: 'guide',
    name: id,
    url: id,
    visible: true,
    locked: true,
    opacity: 0.5,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale,
  } as GuideNode
}

function cloneBaseImage(source: PNG) {
  const output = new PNG({ width: source.width, height: source.height })
  output.data.set(source.data)

  for (let index = 0; index < output.data.length; index += 4) {
    const alpha = output.data[index + 3] ?? 255
    if (alpha === 255) {
      continue
    }

    const blend = alpha / 255
    output.data[index] = Math.round((output.data[index] ?? 255) * blend + 255 * (1 - blend))
    output.data[index + 1] = Math.round((output.data[index + 1] ?? 255) * blend + 255 * (1 - blend))
    output.data[index + 2] = Math.round((output.data[index + 2] ?? 255) * blend + 255 * (1 - blend))
    output.data[index + 3] = 255
  }

  return output
}

function blendPixel(png: PNG, x: number, y: number, color: [number, number, number], alpha: number) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return
  }

  const offset = getPixelOffset(png.width, x, y)
  png.data[offset] = Math.round((png.data[offset] ?? 255) * (1 - alpha) + color[0] * alpha)
  png.data[offset + 1] = Math.round((png.data[offset + 1] ?? 255) * (1 - alpha) + color[1] * alpha)
  png.data[offset + 2] = Math.round((png.data[offset + 2] ?? 255) * (1 - alpha) + color[2] * alpha)
  png.data[offset + 3] = 255
}

function fillRect(
  png: PNG,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  color: [number, number, number],
  alpha: number,
) {
  const startX = Math.max(0, Math.floor(minX))
  const startY = Math.max(0, Math.floor(minY))
  const endX = Math.min(png.width - 1, Math.ceil(maxX))
  const endY = Math.min(png.height - 1, Math.ceil(maxY))

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      blendPixel(png, x, y, color, alpha)
    }
  }
}

function drawRasterWall(output: PNG, wall: RasterWallCandidate) {
  if (wall.axis === 'horizontal') {
    fillRect(output, wall.segment.start, wall.band.start, wall.segment.end, wall.band.end, [239, 68, 68], 0.55)
    return
  }

  fillRect(output, wall.band.start, wall.segment.start, wall.band.end, wall.segment.end, [14, 165, 233], 0.55)
}

function worldPointToPixel(
  point: [number, number],
  guide: GuideNode,
  dimensions: { width: number; height: number },
): PixelPoint {
  const planWidth = 10 * guide.scale
  const planHeight = planWidth / (dimensions.width / dimensions.height)
  return {
    x: ((guide.position[0] - point[0]) / planWidth + 0.5) * dimensions.width,
    y: ((guide.position[2] - point[1]) / planHeight + 0.5) * dimensions.height,
  }
}

function drawOpeningOverlay(output: PNG, snapshot: GuideDetectionDebugSnapshot, guide: GuideNode) {
  for (const opening of snapshot.candidates.openings) {
    const center = worldPointToPixel(opening.center, guide, snapshot.guideDimensions)
    const widthPx =
      (opening.width / (10 * guide.scale)) * snapshot.guideDimensions.width
    const half = Math.max(4, widthPx / 2)
    const color: [number, number, number] = opening.kind === 'door' ? [34, 197, 94] : [37, 99, 235]
    fillRect(output, center.x - half, center.y - 4, center.x + half, center.y + 4, color, 0.85)
  }
}

function writeMaskPng(mask: Uint8ClampedArray, width: number, height: number) {
  const output = new PNG({ width, height })

  for (let index = 0; index < width * height; index += 1) {
    const value = mask[index] === 1 ? 35 : 255
    const offset = index * 4
    output.data[offset] = value
    output.data[offset + 1] = value
    output.data[offset + 2] = value
    output.data[offset + 3] = 255
  }

  return PNG.sync.write(output)
}

function buildOverlayPng(source: PNG, snapshot: GuideDetectionDebugSnapshot, guide: GuideNode) {
  const output = cloneBaseImage(source)
  for (const wall of snapshot.rasterWalls) {
    drawRasterWall(output, wall)
  }
  drawOpeningOverlay(output, snapshot, guide)
  return PNG.sync.write(output)
}

function toJsonSummary(
  snapshot: GuideDetectionDebugSnapshot,
  source: string,
  calibration: { expectedWallRects: number | null; guideScale: number; pixelsPerMeter: number | null },
) {
  return {
    source,
    dimensions: snapshot.sampleDimensions,
    darkThreshold: snapshot.darkThreshold,
    detectionMode: snapshot.detectionMode,
    expectedWallRects: calibration.expectedWallRects,
    guideScale: calibration.guideScale,
    pixelsPerMeter: calibration.pixelsPerMeter,
    structureBounds: snapshot.structureBounds,
    wallCount: snapshot.candidates.walls.length,
    openingCount: snapshot.candidates.openings.length,
    rasterWallCount: snapshot.rasterWalls.length,
    openingsByKind: snapshot.candidates.openings.reduce<Record<string, number>>((acc, opening) => {
      acc[opening.kind] = (acc[opening.kind] ?? 0) + 1
      return acc
    }, {}),
    candidates: snapshot.candidates,
    rasterWalls: snapshot.rasterWalls,
  }
}

async function loadDatasetHints(input: string): Promise<DatasetHints> {
  const hintPath =
    extname(input).toLowerCase() === '.png' ? join(dirname(input), 'fp.json') : join(input, 'fp.json')

  try {
    const db = JSON.parse(await readFile(hintPath, 'utf8')) as {
      floor?: Record<string, { image?: string; scale?: number }>
      rect?: Record<string, { floorID?: number | string }>
    }
    const hints: DatasetHints = {
      expectedWallRectsByImage: new Map(),
      pixelsPerMeterByImage: new Map(),
    }

    for (const floor of Object.values(db.floor ?? {})) {
      if (floor.image && typeof floor.scale === 'number' && Number.isFinite(floor.scale)) {
        hints.pixelsPerMeterByImage.set(floor.image, floor.scale)
        hints.expectedWallRectsByImage.set(floor.image, 0)
      }
    }

    for (const rect of Object.values(db.rect ?? {})) {
      const image = db.floor?.[String(rect.floorID)]?.image
      if (image) {
        hints.expectedWallRectsByImage.set(image, (hints.expectedWallRectsByImage.get(image) ?? 0) + 1)
      }
    }

    return hints
  } catch {
    return {
      expectedWallRectsByImage: new Map(),
      pixelsPerMeterByImage: new Map(),
    }
  }
}

async function debugOne(
  inputPath: string,
  outRoot: string,
  hints: DatasetHints,
  options: Pick<DebugOptions, 'guideScaleOverride' | 'summaryOnly'>,
) {
  const original = await decodeImageFile(inputPath)
  const png = normalizePngForDetection(original)
  const imageData = pngToImageData(png)
  const sourceName = basename(inputPath)
  const pixelsPerMeter = hints.pixelsPerMeterByImage.get(sourceName)
  const expectedWallRects = hints.expectedWallRectsByImage.get(sourceName) ?? null
  const guideScale =
    options.guideScaleOverride ?? (pixelsPerMeter ? original.width / pixelsPerMeter / 10 : 1)
  const id = `debug-${sourceName.replace(/\.png$/i, '')}`
  const guide = makeDebugGuide(id, guideScale)
  const snapshot = buildGuideDetectionDebugSnapshot(guide, imageData)
  const openingsByKind = snapshot.candidates.openings.reduce<Record<string, number>>(
    (acc, opening) => {
      acc[opening.kind] = (acc[opening.kind] ?? 0) + 1
      return acc
    },
    {},
  )
  const name = relative(workspaceRoot, inputPath)
    .replace(/\.(jpe?g|png)$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '__')
  const outDir = join(outRoot, name)

  if (!options.summaryOnly) {
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'overlay.png'), buildOverlayPng(png, snapshot, guide))
    await writeFile(
      join(outDir, 'raw-dark-mask.png'),
      writeMaskPng(snapshot.masks.rawDark, png.width, png.height),
    )
    await writeFile(
      join(outDir, 'wall-mask.png'),
      writeMaskPng(snapshot.masks.structuralCombined, png.width, png.height),
    )
    await writeFile(
      join(outDir, 'candidates.json'),
      `${JSON.stringify(
        toJsonSummary(snapshot, relative(workspaceRoot, inputPath), {
          guideScale,
          expectedWallRects,
          pixelsPerMeter: pixelsPerMeter ?? null,
        }),
        null,
        2,
      )}\n`,
    )
  }

  return {
    source: relative(workspaceRoot, inputPath),
    output: options.summaryOnly ? null : relative(workspaceRoot, outDir),
    pixelsPerMeter: pixelsPerMeter ?? null,
    guideScale,
    expectedWallRects,
    mode: snapshot.detectionMode,
    walls: snapshot.candidates.walls.length,
    openings: snapshot.candidates.openings.length,
    doors: openingsByKind.door ?? 0,
    windows: openingsByKind.window ?? 0,
    rasterWalls: snapshot.rasterWalls.length,
  }
}

function summarizeRuns(
  summaries: Array<{
    mode: GuideDetectionDebugSnapshot['detectionMode']
    openings: number
    doors: number
    rasterWalls: number
    walls: number
    windows: number
  }>,
) {
  const total = summaries.length
  const safeTotal = Math.max(1, total)
  const structural = summaries.filter((summary) => summary.mode === 'structural').length
  const thinLine = summaries.filter((summary) => summary.mode === 'thin-line').length
  const wallTotal = summaries.reduce((sum, summary) => sum + summary.walls, 0)
  const openingTotal = summaries.reduce((sum, summary) => sum + summary.openings, 0)
  const doorTotal = summaries.reduce((sum, summary) => sum + summary.doors, 0)
  const windowTotal = summaries.reduce((sum, summary) => sum + summary.windows, 0)
  const rasterWallTotal = summaries.reduce((sum, summary) => sum + summary.rasterWalls, 0)

  return {
    total,
    structural,
    thinLine,
    zeroWallImages: summaries.filter((summary) => summary.walls === 0).length,
    zeroOpeningImages: summaries.filter((summary) => summary.openings === 0).length,
    avgWalls: Number((wallTotal / safeTotal).toFixed(2)),
    avgOpenings: Number((openingTotal / safeTotal).toFixed(2)),
    avgDoors: Number((doorTotal / safeTotal).toFixed(2)),
    avgWindows: Number((windowTotal / safeTotal).toFixed(2)),
    avgRasterWalls: Number((rasterWallTotal / safeTotal).toFixed(2)),
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const inputs = (await getImageInputs(options.input, [options.out])).slice(
    0,
    options.limit ?? undefined,
  )
  const datasetHints = await loadDatasetHints(options.input)
  await mkdir(options.out, { recursive: true })
  const summaries = []

  for (const input of inputs) {
    summaries.push(await debugOne(input, options.out, datasetHints, options))
  }

  await writeFile(join(options.out, 'summary.json'), `${JSON.stringify(summaries, null, 2)}\n`)
  await writeFile(join(options.out, 'stats.json'), `${JSON.stringify(summarizeRuns(summaries), null, 2)}\n`)
  console.table(summaries)
  console.table([summarizeRuns(summaries)])
  console.log(`Guide detection debug output: ${relative(workspaceRoot, options.out)}`)
}

await main()
