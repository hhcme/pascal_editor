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

type DebugRunSummary = Awaited<ReturnType<typeof debugOne>>

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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
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
  quality: DebugQuality,
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
    quality,
    candidates: snapshot.candidates,
    rasterWalls: snapshot.rasterWalls,
  }
}

type DebugQuality = {
  flags: string[]
  score: number
  wallRecallEstimate: number | null
}

function evaluateDebugQuality(input: {
  expectedWallRects: number | null
  mode: GuideDetectionDebugSnapshot['detectionMode']
  openings: number
  rasterWalls: number
  walls: number
}): DebugQuality {
  const flags: string[] = []
  const wallRecallEstimate =
    input.expectedWallRects && input.expectedWallRects > 0
      ? Number((input.walls / input.expectedWallRects).toFixed(3))
      : null

  if (input.walls === 0) {
    flags.push('zero-walls')
  }
  if (input.openings === 0) {
    flags.push('zero-openings')
  }
  if (wallRecallEstimate !== null && wallRecallEstimate < 0.25) {
    flags.push('low-wall-recall')
  }
  if (input.mode === 'thin-line' && input.walls <= 4) {
    flags.push('thin-line-underfit')
  }
  if (input.rasterWalls > 90) {
    flags.push('many-wall-candidates')
  }

  let score = 100
  score -= flags.includes('zero-walls') ? 60 : 0
  score -= flags.includes('zero-openings') ? 12 : 0
  score -= flags.includes('thin-line-underfit') ? 18 : 0
  score -= flags.includes('many-wall-candidates') ? 15 : 0
  if (wallRecallEstimate !== null) {
    score -= Math.max(0, Math.round((0.45 - wallRecallEstimate) * 100))
  }

  return {
    flags,
    score: clampNumber(score, 0, 100),
    wallRecallEstimate,
  }
}

function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildReportHtml(
  summaries: DebugRunSummary[],
  stats: ReturnType<typeof summarizeRuns>,
  outRoot: string,
) {
  const rows = [...summaries].sort((left, right) => left.quality.score - right.quality.score)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Guide Detection Debug Report</title>
  <style>
    body { margin: 0; background: #f8fafc; color: #0f172a; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid #e2e8f0; background: rgba(248,250,252,0.94); padding: 16px 20px; backdrop-filter: blur(10px); }
    h1 { margin: 0 0 8px; font-size: 18px; }
    .stats { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #475569; }
    .stat { border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; padding: 6px 8px; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; padding: 14px; }
    article { overflow: hidden; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
    article.bad { border-color: #fecaca; }
    article.warn { border-color: #fed7aa; }
    .meta { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    .source { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
    .metrics { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; color: #475569; }
    .pill { border-radius: 999px; background: #f1f5f9; padding: 2px 7px; }
    .flag { background: #fee2e2; color: #991b1b; }
    .images { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e2e8f0; }
    .images figure { margin: 0; background: #fff; }
    .images img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: #fff; }
    .images figcaption { padding: 5px 7px; color: #64748b; font-size: 10px; }
  </style>
</head>
<body>
  <header>
    <h1>Guide Detection Debug Report</h1>
    <div class="stats">
      ${Object.entries(stats)
        .map(([key, value]) => `<span class="stat">${htmlEscape(key)}: ${htmlEscape(String(value))}</span>`)
        .join('\n      ')}
    </div>
  </header>
  <main>
    ${rows
      .map((summary) => {
        const outputPath = summary.output ? resolve(workspaceRoot, summary.output) : null
        const relOutput = outputPath ? relative(outRoot, outputPath).replaceAll('\\', '/') : null
        const articleClass =
          summary.quality.score < 50 ? 'bad' : summary.quality.score < 75 ? 'warn' : ''
        const imageBlock = relOutput
          ? `<div class="images">
              <figure><img src="${htmlEscape(relOutput)}/overlay.png" /><figcaption>overlay</figcaption></figure>
              <figure><img src="${htmlEscape(relOutput)}/wall-mask.png" /><figcaption>wall mask</figcaption></figure>
            </div>`
          : ''

        return `<article class="${articleClass}">
          <div class="meta">
            <div class="source">${htmlEscape(summary.source)}</div>
            <div class="metrics">
              <span class="pill">score ${summary.quality.score}</span>
              <span class="pill">${summary.mode}</span>
              <span class="pill">${summary.walls} walls</span>
              <span class="pill">${summary.openings} openings</span>
              ${
                summary.quality.wallRecallEstimate === null
                  ? ''
                  : `<span class="pill">wall recall est. ${summary.quality.wallRecallEstimate}</span>`
              }
              ${summary.quality.flags
                .map((flag) => `<span class="pill flag">${htmlEscape(flag)}</span>`)
                .join('')}
            </div>
          </div>
          ${imageBlock}
        </article>`
      })
      .join('\n    ')}
  </main>
</body>
</html>
`
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
  const quality = evaluateDebugQuality({
    expectedWallRects,
    mode: snapshot.detectionMode,
    openings: snapshot.candidates.openings.length,
    rasterWalls: snapshot.rasterWalls.length,
    walls: snapshot.candidates.walls.length,
  })
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
        }, quality),
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
    quality,
  }
}

function summarizeRuns(
  summaries: Array<{
    quality: DebugQuality
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
  const scoreTotal = summaries.reduce((sum, summary) => sum + summary.quality.score, 0)

  return {
    total,
    structural,
    thinLine,
    zeroWallImages: summaries.filter((summary) => summary.walls === 0).length,
    zeroOpeningImages: summaries.filter((summary) => summary.openings === 0).length,
    flaggedImages: summaries.filter((summary) => summary.quality.flags.length > 0).length,
    avgQualityScore: Number((scoreTotal / safeTotal).toFixed(2)),
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
  const stats = summarizeRuns(summaries)
  await writeFile(join(options.out, 'stats.json'), `${JSON.stringify(stats, null, 2)}\n`)
  if (!options.summaryOnly) {
    await writeFile(join(options.out, 'report.html'), buildReportHtml(summaries, stats, options.out))
  }
  console.table(summaries)
  console.table([stats])
  console.log(`Guide detection debug output: ${relative(workspaceRoot, options.out)}`)
}

await main()
