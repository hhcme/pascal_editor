#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const vm = require('node:vm')

const EDITOR_ROOT = path.resolve(__dirname, '../..')
const CATALOG_FILE = path.join(
  EDITOR_ROOT,
  'packages/editor/src/components/ui/item-catalog/catalog-items.tsx',
)
const PUBLIC_ROOT = path.join(EDITOR_ROOT, 'apps/editor/public')
const ITEMS_ROOT = path.join(PUBLIC_ROOT, 'items')
const LEDGER_FILE = path.join(EDITOR_ROOT, 'assets/asset-source-ledger.json')
const MANIFEST_FILE = path.join(PUBLIC_ROOT, 'items/asset-manifest.json')

const args = new Set(process.argv.slice(2))
const shouldCheck = args.has('--check')
const shouldWrite = !shouldCheck

main()

function main() {
  const catalogItems = loadCatalogItems(CATALOG_FILE)
  const ledger = readJson(LEDGER_FILE)
  const diagnostics = validateCatalog(catalogItems, ledger)
  const manifest = buildManifest(catalogItems, ledger, diagnostics)
  const nextContent = `${JSON.stringify(manifest, null, 2)}\n`

  if (shouldCheck) {
    const currentContent = fs.existsSync(MANIFEST_FILE)
      ? fs.readFileSync(MANIFEST_FILE, 'utf8')
      : null

    if (currentContent !== nextContent) {
      console.error(
        `Asset manifest is stale. Run: node ${path.relative(
          EDITOR_ROOT,
          __filename,
        )}`,
      )
      process.exitCode = 1
    }
  }

  if (shouldWrite) {
    fs.writeFileSync(MANIFEST_FILE, nextContent)
  }

  printSummary(manifest, diagnostics)

  if (diagnostics.errors.length > 0) {
    process.exitCode = 1
  }
}

function loadCatalogItems(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const marker = 'export const CATALOG_ITEMS'
  const declarationStart = source.indexOf(marker)
  if (declarationStart === -1) {
    throw new Error(`Could not find ${marker} in ${filePath}`)
  }

  const assignmentStart = source.indexOf('=', declarationStart)
  if (assignmentStart === -1) {
    throw new Error(`Could not find catalog assignment in ${filePath}`)
  }

  const arrayStart = source.indexOf('[', assignmentStart)
  if (arrayStart === -1) {
    throw new Error(`Could not find catalog array in ${filePath}`)
  }

  const arrayEnd = findMatchingBracket(source, arrayStart)
  const arraySource = source.slice(arrayStart, arrayEnd + 1)
  const script = new vm.Script(`const CATALOG_ITEMS = ${arraySource}; CATALOG_ITEMS`)
  return script.runInNewContext({ Math })
}

function findMatchingBracket(source, startIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = null
      continue
    }

    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }

    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }

    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  throw new Error('Catalog array is missing its closing bracket')
}

function validateCatalog(items, ledger) {
  const errors = []
  const warnings = []
  const ids = new Map()
  const srcs = new Map()
  const thumbnails = new Map()
  const catalogedDirs = new Set()
  const approvedSourceIds = new Set(ledger.approvedSources.map((source) => source.id))

  for (const item of items) {
    const label = item?.id ?? '<missing id>'

    if (!item || typeof item !== 'object') {
      errors.push('Catalog item is not an object')
      continue
    }

    for (const key of ['id', 'category', 'name', 'thumbnail', 'src']) {
      if (typeof item[key] !== 'string' || item[key].length === 0) {
        errors.push(`${label}: missing required string field "${key}"`)
      }
    }

    if (!Array.isArray(item.dimensions) || item.dimensions.length !== 3) {
      errors.push(`${label}: dimensions must be a [width, height, depth] tuple`)
    }

    if (ids.has(item.id)) {
      errors.push(`${label}: duplicate id, first seen at index ${ids.get(item.id)}`)
    } else {
      ids.set(item.id, ids.size)
    }

    if (srcs.has(item.src)) {
      errors.push(`${label}: duplicate model src with ${srcs.get(item.src)}`)
    } else {
      srcs.set(item.src, item.id)
    }

    if (thumbnails.has(item.thumbnail)) {
      warnings.push(`${label}: duplicate thumbnail with ${thumbnails.get(item.thumbnail)}`)
    } else {
      thumbnails.set(item.thumbnail, item.id)
    }

    checkPublicAssetPath(item.src, 'model src', label, errors, warnings)
    checkPublicAssetPath(item.thumbnail, 'thumbnail', label, errors, warnings)

    const srcPath = publicPath(item.src)
    const thumbnailPath = publicPath(item.thumbnail)
    if (!fs.existsSync(srcPath)) errors.push(`${label}: model file does not exist: ${item.src}`)
    if (!fs.existsSync(thumbnailPath)) {
      errors.push(`${label}: thumbnail file does not exist: ${item.thumbnail}`)
    }

    const itemDir = getItemDirectory(item.src)
    if (itemDir) catalogedDirs.add(itemDir)

    const provenance = ledger.assetOverrides[item.id] ?? ledger.defaultLegacyPolicy
    if (
      provenance.sourceId !== ledger.defaultLegacyPolicy.sourceId &&
      !approvedSourceIds.has(provenance.sourceId)
    ) {
      errors.push(`${label}: unknown sourceId "${provenance.sourceId}" in asset ledger`)
    }
  }

  const uncatalogedDirs = fs
    .readdirSync(ITEMS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((dirName) => fs.existsSync(path.join(ITEMS_ROOT, dirName, 'model.glb')))
    .filter((dirName) => !catalogedDirs.has(dirName))
    .sort()

  for (const dirName of uncatalogedDirs) {
    warnings.push(`${dirName}: model directory exists but is not exposed in CATALOG_ITEMS`)
  }

  return {
    errors,
    warnings,
    uncatalogedDirs,
  }
}

function checkPublicAssetPath(assetPath, fieldName, label, errors, warnings) {
  if (typeof assetPath !== 'string') return
  if (!assetPath.startsWith('/items/')) {
    errors.push(`${label}: ${fieldName} must start with /items/: ${assetPath}`)
    return
  }
  if (assetPath.includes('..')) {
    errors.push(`${label}: ${fieldName} cannot contain "..": ${assetPath}`)
  }
  if (assetPath.includes(' ')) {
    warnings.push(`${label}: ${fieldName} contains spaces: ${assetPath}`)
  }
}

function buildManifest(items, ledger, diagnostics) {
  const manifestItems = items.map((item) => {
    const modelStats = fileStats(item.src)
    const thumbnailStats = fileStats(item.thumbnail)
    const provenance = ledger.assetOverrides[item.id] ?? ledger.defaultLegacyPolicy

    return cleanObject({
      id: item.id,
      category: item.category,
      tags: item.tags ?? [],
      name: item.name,
      thumbnail: item.thumbnail,
      thumbnailBytes: thumbnailStats.bytes,
      thumbnailSha256: thumbnailStats.sha256,
      src: item.src,
      modelBytes: modelStats.bytes,
      modelSha256: modelStats.sha256,
      dimensions: item.dimensions,
      attachTo: item.attachTo,
      grounding: item.grounding,
      offset: item.offset,
      rotation: item.rotation,
      scale: item.scale,
      surface: item.surface,
      interactive: item.interactive,
      provenance,
    })
  })

  return {
    schemaVersion: 1,
    generatedBy: 'editor/tooling/assets/generate-asset-manifest.cjs',
    sourceCatalog: 'packages/editor/src/components/ui/item-catalog/catalog-items.tsx',
    sourceLedger: 'assets/asset-source-ledger.json',
    sourceFingerprint: hashString(JSON.stringify(items)),
    summary: summarize(manifestItems, diagnostics),
    licensePolicy: ledger.licensePolicy,
    approvedSources: ledger.approvedSources,
    items: manifestItems,
  }
}

function summarize(items, diagnostics) {
  return {
    totalItems: items.length,
    totalModelBytes: items.reduce((total, item) => total + item.modelBytes, 0),
    totalThumbnailBytes: items.reduce((total, item) => total + item.thumbnailBytes, 0),
    categories: countBy(items, (item) => item.category),
    tags: countBy(
      items.flatMap((item) => item.tags),
      (tag) => tag,
    ),
    attachmentTargets: countBy(items, (item) => item.attachTo ?? 'floor'),
    provenanceReviewStatus: countBy(items, (item) => item.provenance.reviewStatus),
    uncatalogedModelDirectories: diagnostics.uncatalogedDirs,
  }
}

function countBy(values, selector) {
  return values.reduce((counts, value) => {
    const key = selector(value)
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function fileStats(assetPath) {
  const absolutePath = publicPath(assetPath)
  if (!fs.existsSync(absolutePath)) return { bytes: 0, sha256: null }
  const buffer = fs.readFileSync(absolutePath)
  return {
    bytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  }
}

function publicPath(assetPath) {
  return path.join(PUBLIC_ROOT, assetPath.replace(/^\//, ''))
}

function getItemDirectory(assetPath) {
  const match = /^\/items\/([^/]+)\//.exec(assetPath)
  return match?.[1] ?? null
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function hashString(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function cleanObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanObject(entry))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, cleanObject(entry)]),
    )
  }

  return value
}

function printSummary(manifest, diagnostics) {
  const mode = shouldCheck ? 'checked' : 'wrote'
  console.log(
    `Asset manifest ${mode}: ${manifest.summary.totalItems} catalog items, ` +
      `${diagnostics.uncatalogedDirs.length} uncataloged model dirs`,
  )

  if (diagnostics.warnings.length > 0) {
    console.warn(`Warnings: ${diagnostics.warnings.length}`)
    for (const warning of diagnostics.warnings.slice(0, 12)) {
      console.warn(`- ${warning}`)
    }
    if (diagnostics.warnings.length > 12) {
      console.warn(`- ... ${diagnostics.warnings.length - 12} more`)
    }
  }

  if (diagnostics.errors.length > 0) {
    console.error(`Errors: ${diagnostics.errors.length}`)
    for (const error of diagnostics.errors) {
      console.error(`- ${error}`)
    }
  }
}
