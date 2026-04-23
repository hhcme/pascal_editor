#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const EDITOR_ROOT = path.resolve(__dirname, '../..')
const CATALOG_FILE = path.join(EDITOR_ROOT, 'packages/core/src/material-library.ts')
const PUBLIC_ROOT = path.join(EDITOR_ROOT, 'apps/editor/public')
const MATERIAL_ROOT = path.join(PUBLIC_ROOT, 'material')
const LEDGER_FILE = path.join(EDITOR_ROOT, 'assets/material-source-ledger.json')
const MANIFEST_FILE = path.join(PUBLIC_ROOT, 'material/material-manifest.json')

const MATERIAL_MAP_KEYS = [
  'albedoMap',
  'metalnessMap',
  'roughnessMap',
  'normalMap',
  'displacementMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'alphaMap',
  'lightMap',
]

const KNOWN_CATEGORIES = new Set([
  'paint',
  'wood',
  'stone',
  'tile',
  'wall-covering',
  'fabric',
  'leather',
  'metal',
  'glass',
  'plastic',
  'building',
])
const KNOWN_SOURCES = new Set(['public', 'mine'])
const KNOWN_COLOR_FAMILIES = new Set([
  'white',
  'gray',
  'black',
  'brown',
  'red',
  'yellow',
  'blue',
  'green',
  'wood',
  'transparent',
  'mixed',
])
const KNOWN_FINISHES = new Set(['matte', 'satin', 'glossy', 'rough', 'metallic', 'transparent'])
const KNOWN_PREVIEW_SHAPES = new Set(['tile', 'sphere', 'fabric', 'glass'])

const args = new Set(process.argv.slice(2))
const shouldCheck = args.has('--check')
const shouldWrite = !shouldCheck

main()

function main() {
  const catalogSource = fs.readFileSync(CATALOG_FILE, 'utf8')
  const catalogItems = loadMaterialCatalog(catalogSource)
  const ledger = readJson(LEDGER_FILE)
  const diagnostics = validateCatalog(catalogItems, ledger)
  const manifest = buildManifest(catalogItems, ledger, diagnostics, catalogSource)
  const nextContent = `${JSON.stringify(manifest, null, 2)}\n`

  if (shouldCheck) {
    const currentContent = fs.existsSync(MANIFEST_FILE)
      ? fs.readFileSync(MANIFEST_FILE, 'utf8')
      : null

    if (currentContent !== nextContent) {
      console.error(
        `Material manifest is stale. Run: node ${path.relative(
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

function loadMaterialCatalog(source) {
  const marker = 'export const MATERIAL_CATALOG:'
  const declarationStart = source.indexOf(marker)
  if (declarationStart === -1) {
    throw new Error(`Could not find ${marker} in ${CATALOG_FILE}`)
  }

  const assignmentStart = source.indexOf('=', declarationStart)
  if (assignmentStart === -1) {
    throw new Error(`Could not find catalog assignment in ${CATALOG_FILE}`)
  }

  const arrayStart = source.indexOf('[', assignmentStart)
  if (arrayStart === -1) {
    throw new Error(`Could not find catalog array in ${CATALOG_FILE}`)
  }

  const arrayEnd = findMatchingDelimiter(source, arrayStart, '[', ']')
  const arrayBody = source.slice(arrayStart + 1, arrayEnd)

  return splitTopLevelEntries(arrayBody)
    .map((entry, index) => parseMaterialEntry(entry, index))
    .filter(Boolean)
}

function parseMaterialEntry(entry, index) {
  const source = entry.trim()
  if (!source) return null

  const maps = {}
  const assetReferences = []
  for (const key of MATERIAL_MAP_KEYS) {
    const value = readStringProperty(source, key)
    if (!value) continue
    maps[key] = value
    assetReferences.push({ kind: 'map', key, path: value })
  }

  const previewThumbnailUrl = readStringProperty(source, 'previewThumbnailUrl')
  if (previewThumbnailUrl) {
    assetReferences.push({ kind: 'preview', key: 'previewThumbnailUrl', path: previewThumbnailUrl })
  }

  const targetExpression = readPropertyExpression(source, 'targets') ?? ''
  const id = readStringProperty(source, 'id')

  return cleanObject({
    id,
    label: readStringProperty(source, 'label'),
    description: readStringProperty(source, 'description'),
    category: readStringProperty(source, 'category'),
    source: readStringProperty(source, 'source') ?? 'public',
    colorFamily: readStringProperty(source, 'colorFamily'),
    finish: readStringProperty(source, 'finish'),
    tags: readStringArrayProperty(source, 'tags'),
    previewShape: readStringProperty(source, 'previewShape') ?? 'tile',
    previewThumbnailUrl,
    previewColor: readStringProperty(source, 'previewColor'),
    targetExpression,
    targetRefs: parseTargetRefs(targetExpression),
    maps,
    assetReferences,
    kind: assetReferences.some((reference) => reference.kind === 'map') ? 'texture' : 'procedural',
    catalogIndex: index,
  })
}

function validateCatalog(items, ledger) {
  const errors = []
  const warnings = []
  const ids = new Map()
  const referencedFiles = new Set()
  const referencedDirs = new Set()
  const approvedSourceIds = new Set(ledger.approvedSources.map((source) => source.id))
  const defaultSourceIds = new Set([
    ledger.defaultTexturePolicy.sourceId,
    ledger.defaultProceduralPolicy.sourceId,
  ])

  for (const item of items) {
    const label = item?.id ?? `<material at index ${item?.catalogIndex ?? '?'}>`

    if (!item.id) errors.push(`${label}: missing required id`)
    if (!item.label) errors.push(`${label}: missing required label`)
    if (!item.category) errors.push(`${label}: missing required category`)
    if (!item.colorFamily) errors.push(`${label}: missing required colorFamily`)
    if (!item.finish) errors.push(`${label}: missing required finish`)

    if (item.id && ids.has(item.id)) {
      errors.push(`${label}: duplicate id, first seen at index ${ids.get(item.id)}`)
    } else if (item.id) {
      ids.set(item.id, item.catalogIndex)
    }

    checkKnownValue(item.category, KNOWN_CATEGORIES, 'category', label, errors)
    checkKnownValue(item.source, KNOWN_SOURCES, 'source', label, errors)
    checkKnownValue(item.colorFamily, KNOWN_COLOR_FAMILIES, 'colorFamily', label, errors)
    checkKnownValue(item.finish, KNOWN_FINISHES, 'finish', label, errors)
    checkKnownValue(item.previewShape, KNOWN_PREVIEW_SHAPES, 'previewShape', label, errors)

    if (!item.targetExpression) {
      errors.push(`${label}: missing required targets expression`)
    }

    for (const reference of item.assetReferences) {
      checkPublicMaterialPath(reference.path, `${reference.kind}:${reference.key}`, label, errors)
      const absolutePath = publicPath(reference.path)
      referencedFiles.add(absolutePath)

      const directory = getMaterialDirectory(reference.path)
      if (directory) referencedDirs.add(directory)

      if (!fs.existsSync(absolutePath)) {
        errors.push(`${label}: material asset does not exist: ${reference.path}`)
      }
    }

    if (item.kind === 'texture' && !item.previewThumbnailUrl) {
      warnings.push(`${label}: texture material has no previewThumbnailUrl`)
    }

    const provenance = provenanceForMaterial(item, ledger)
    if (!defaultSourceIds.has(provenance.sourceId) && !approvedSourceIds.has(provenance.sourceId)) {
      errors.push(`${label}: unknown sourceId "${provenance.sourceId}" in material ledger`)
    }
  }

  const materialFiles = listMaterialFiles()
  const unreferencedMaterialFiles = materialFiles
    .filter((filePath) => !referencedFiles.has(filePath))
    .map((filePath) => path.relative(PUBLIC_ROOT, filePath))
    .sort()

  const uncatalogedMaterialDirs = fs
    .readdirSync(MATERIAL_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((dirName) => !referencedDirs.has(dirName))
    .sort()

  for (const filePath of unreferencedMaterialFiles) {
    warnings.push(`${filePath}: material file exists but is not referenced by MATERIAL_CATALOG`)
  }

  for (const dirName of uncatalogedMaterialDirs) {
    warnings.push(`${dirName}: material directory exists but is not referenced by MATERIAL_CATALOG`)
  }

  return {
    errors,
    warnings,
    unreferencedMaterialFiles,
    uncatalogedMaterialDirs,
  }
}

function checkKnownValue(value, knownValues, fieldName, label, errors) {
  if (!value) return
  if (!knownValues.has(value)) {
    errors.push(`${label}: unknown ${fieldName} "${value}"`)
  }
}

function checkPublicMaterialPath(assetPath, fieldName, label, errors) {
  if (typeof assetPath !== 'string') return
  if (!assetPath.startsWith('/material/')) {
    errors.push(`${label}: ${fieldName} must start with /material/: ${assetPath}`)
    return
  }
  if (assetPath.includes('..')) {
    errors.push(`${label}: ${fieldName} cannot contain "..": ${assetPath}`)
  }
}

function buildManifest(items, ledger, diagnostics, catalogSource) {
  const materials = items.map((item) => {
    const assets = item.assetReferences.map((reference) => {
      const stats = fileStats(reference.path)
      return {
        ...reference,
        bytes: stats.bytes,
        sha256: stats.sha256,
      }
    })

    return cleanObject({
      id: item.id,
      label: item.label,
      description: item.description,
      category: item.category,
      source: item.source,
      colorFamily: item.colorFamily,
      finish: item.finish,
      tags: item.tags,
      previewShape: item.previewShape,
      previewThumbnailUrl: item.previewThumbnailUrl,
      previewColor: item.previewColor,
      targetExpression: item.targetExpression,
      targetRefs: item.targetRefs,
      maps: item.maps,
      kind: item.kind,
      textureBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
      assets,
      provenance: provenanceForMaterial(item, ledger),
    })
  })

  return {
    schemaVersion: 1,
    generatedBy: 'editor/tooling/assets/generate-material-manifest.cjs',
    sourceCatalog: 'packages/core/src/material-library.ts',
    sourceLedger: 'assets/material-source-ledger.json',
    sourceFingerprint: hashString(catalogSource),
    summary: summarize(materials, diagnostics),
    licensePolicy: ledger.licensePolicy,
    approvedSources: ledger.approvedSources,
    materials,
  }
}

function summarize(materials, diagnostics) {
  return {
    totalMaterials: materials.length,
    textureBackedMaterials: materials.filter((material) => material.kind === 'texture').length,
    proceduralMaterials: materials.filter((material) => material.kind === 'procedural').length,
    totalTextureBytes: materials.reduce((total, material) => total + material.textureBytes, 0),
    categories: countBy(materials, (material) => material.category),
    finishes: countBy(materials, (material) => material.finish),
    colorFamilies: countBy(materials, (material) => material.colorFamily),
    sources: countBy(materials, (material) => material.source),
    provenanceReviewStatus: countBy(materials, (material) => material.provenance.reviewStatus),
    unreferencedMaterialFiles: diagnostics.unreferencedMaterialFiles,
    uncatalogedMaterialDirectories: diagnostics.uncatalogedMaterialDirs,
  }
}

function provenanceForMaterial(item, ledger) {
  return (
    ledger.materialOverrides?.[item.id] ??
    (item.kind === 'texture' ? ledger.defaultTexturePolicy : ledger.defaultProceduralPolicy)
  )
}

function readStringProperty(source, key) {
  const expression = readPropertyExpression(source, key)
  if (!expression) return null
  return parseStringLiteral(expression)
}

function readStringArrayProperty(source, key) {
  const expression = readPropertyExpression(source, key)
  if (!expression) return []
  const values = []
  const pattern = /'((?:\\'|[^'])*)'/g
  let match
  while ((match = pattern.exec(expression))) {
    values.push(match[1].replace(/\\'/g, "'"))
  }
  return values
}

function readPropertyExpression(source, key) {
  const pattern = new RegExp(`\\b${key}\\s*:`)
  const match = pattern.exec(source)
  if (!match) return null

  let start = match.index + match[0].length
  while (/\s/.test(source[start])) start += 1

  return readExpressionUntilComma(source, start).trim()
}

function readExpressionUntilComma(source, startIndex) {
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
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

    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth -= 1
    if (char === '[') bracketDepth += 1
    if (char === ']') bracketDepth -= 1
    if (char === '{') braceDepth += 1
    if (char === '}') braceDepth -= 1

    if (
      char === ',' &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      return source.slice(startIndex, index)
    }
  }

  return source.slice(startIndex)
}

function parseStringLiteral(expression) {
  const source = expression.trim()
  if (!source.startsWith("'")) return null

  let escaped = false
  for (let index = 1; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === "'") {
      return source.slice(1, index).replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    }
  }

  return null
}

function parseTargetRefs(expression) {
  const refs = new Set()
  const enumPattern = /MaterialTargetSchema\.enum(?:\.([a-zA-Z-]+)|\[['"]([^'"]+)['"]\])/g
  let enumMatch
  while ((enumMatch = enumPattern.exec(expression))) {
    refs.add(enumMatch[1] ?? enumMatch[2])
  }

  const constants = [
    ['WALL_TARGETS', ['wall']],
    ['SLAB_TARGETS', ['slab']],
    ['WALL_AND_SLAB_TARGETS', ['wall', 'slab']],
    ['STAIR_TARGETS', ['stair', 'stair-segment']],
    ['STAIR_AND_FENCE_TARGETS', ['stair', 'stair-segment', 'fence']],
    ['ROOF_TARGETS', ['roof', 'roof-segment']],
    ['CEILING_TARGETS', ['ceiling']],
    ['WALL_SLAB_STAIR_FENCE_TARGETS', ['wall', 'slab', 'stair', 'stair-segment', 'fence']],
    [
      'HARD_SURFACE_TARGETS',
      ['wall', 'slab', 'roof', 'roof-segment', 'stair', 'stair-segment', 'fence', 'ceiling'],
    ],
  ]

  for (const [constant, targets] of constants) {
    if (!expression.includes(constant)) continue
    for (const target of targets) refs.add(target)
  }

  return [...refs].sort()
}

function splitTopLevelEntries(source) {
  const entries = []
  let start = 0
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < source.length; index += 1) {
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

    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth -= 1
    if (char === '[') bracketDepth += 1
    if (char === ']') bracketDepth -= 1
    if (char === '{') braceDepth += 1
    if (char === '}') braceDepth -= 1

    if (
      char === ',' &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      const entry = source.slice(start, index).trim()
      if (entry) entries.push(entry)
      start = index + 1
    }
  }

  const trailingEntry = source.slice(start).trim()
  if (trailingEntry) entries.push(trailingEntry)
  return entries
}

function findMatchingDelimiter(source, startIndex, openChar, closeChar) {
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

    if (char === openChar) depth += 1
    if (char === closeChar) {
      depth -= 1
      if (depth === 0) return index
    }
  }

  throw new Error(`Could not find closing ${closeChar}`)
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

function getMaterialDirectory(assetPath) {
  const match = /^\/material\/([^/]+)\//.exec(assetPath)
  return match?.[1] ?? null
}

function listMaterialFiles() {
  const files = []
  for (const entry of fs.readdirSync(MATERIAL_ROOT, { withFileTypes: true })) {
    const entryPath = path.join(MATERIAL_ROOT, entry.name)
    if (entry.isDirectory()) {
      for (const nestedEntry of fs.readdirSync(entryPath, { withFileTypes: true })) {
        if (nestedEntry.isFile()) {
          files.push(path.join(entryPath, nestedEntry.name))
        }
      }
    }
  }
  return files
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
        .filter(([, entry]) => entry !== undefined && entry !== null)
        .map(([key, entry]) => [key, cleanObject(entry)]),
    )
  }

  return value
}

function printSummary(manifest, diagnostics) {
  const mode = shouldCheck ? 'checked' : 'wrote'
  console.log(
    `Material manifest ${mode}: ${manifest.summary.totalMaterials} catalog materials, ` +
      `${manifest.summary.textureBackedMaterials} texture-backed, ` +
      `${diagnostics.uncatalogedMaterialDirs.length} uncataloged material dirs`,
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
