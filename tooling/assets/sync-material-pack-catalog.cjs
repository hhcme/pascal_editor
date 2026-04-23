#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const EDITOR_ROOT = path.resolve(__dirname, '../..')
const MATERIAL_LIBRARY_FILE = path.join(EDITOR_ROOT, 'packages/core/src/material-library.ts')
const LEDGER_FILE = path.join(EDITOR_ROOT, 'assets/material-source-ledger.json')
const PACK_FILES = [
  path.join(EDITOR_ROOT, 'assets/ambientcg-material-packs.json'),
  path.join(EDITOR_ROOT, 'assets/polyhaven-material-packs.json'),
]

main()

function main() {
  const packs = PACK_FILES.flatMap((filePath) => readPackManifest(filePath))
  syncMaterialLibrary(packs)
  syncMaterialLedger(packs)
}

function readPackManifest(filePath) {
  const manifest = readJson(filePath)
  return manifest.packs.map((pack) => ({
    ...pack,
    provider: manifest.provider,
    providerName: manifest.providerName,
    licenseId: manifest.licenseId,
    licenseUrl: manifest.licenseUrl,
  }))
}

function syncMaterialLibrary(packs) {
  const source = fs.readFileSync(MATERIAL_LIBRARY_FILE, 'utf8')
  const missingPacks = packs.filter((pack) => !source.includes(`id: '${pack.materialId}'`))

  if (missingPacks.length === 0) {
    console.log('Material catalog already includes all material packs.')
    return
  }

  const arrayEnd = findMaterialCatalogEnd(source)
  const entries = `${missingPacks.map((pack) => buildMaterialCatalogEntry(pack)).join('\n')}\n`
  const nextSource = `${source.slice(0, arrayEnd)}${entries}${source.slice(arrayEnd)}`
  fs.writeFileSync(MATERIAL_LIBRARY_FILE, nextSource)

  console.log(`Material catalog added ${missingPacks.length} texture material entries.`)
}

function syncMaterialLedger(packs) {
  const ledger = readJson(LEDGER_FILE)
  let added = 0

  ledger.materialOverrides ??= {}

  for (const pack of packs) {
    if (ledger.materialOverrides[pack.materialId]) continue

    ledger.materialOverrides[pack.materialId] = {
      sourceId: pack.provider,
      licenseId: pack.licenseId,
      licenseUrl: pack.licenseUrl,
      sourceUrl: pack.sourceUrl,
      author: pack.providerName,
      reviewStatus: 'approved',
      distribution: 'bundled',
      notes:
        pack.provider === 'poly-haven'
          ? 'Downloaded through the Poly Haven public API as 1k jpg maps with md5 verification.'
          : 'Downloaded as the 1K-JPG PBR package.',
    }
    added += 1
  }

  if (added === 0) {
    console.log('Material ledger already includes all material packs.')
    return
  }

  fs.writeFileSync(LEDGER_FILE, `${JSON.stringify(ledger, null, 2)}\n`)
  console.log(`Material ledger added ${added} provenance overrides.`)
}

function findMaterialCatalogEnd(source) {
  const marker = 'export const MATERIAL_CATALOG:'
  const declarationStart = source.indexOf(marker)
  if (declarationStart === -1) {
    throw new Error(`Could not find ${marker} in ${MATERIAL_LIBRARY_FILE}`)
  }

  const assignmentStart = source.indexOf('=', declarationStart)
  const arrayStart = source.indexOf('[', assignmentStart)
  if (assignmentStart === -1 || arrayStart === -1) {
    throw new Error(`Could not find MATERIAL_CATALOG assignment in ${MATERIAL_LIBRARY_FILE}`)
  }

  return findMatchingDelimiter(source, arrayStart, '[', ']')
}

function buildMaterialCatalogEntry(pack) {
  const directory = `/material/${pack.directory}`
  const previewShape = previewShapeForPack(pack)
  const roughness = roughnessForPack(pack)
  const mapProperties = mapPropertiesForPack(pack)

  return `  textureMaterialCatalogItem({
    id: '${pack.materialId}',
    label: '${escapeString(pack.label)}',
    description: 'CC0 PBR ${escapeString(pack.label.toLowerCase())} from ${escapeString(pack.providerName)}',
    category: '${pack.category}',
    colorFamily: '${pack.colorFamily}',
    finish: '${pack.finish}',
    tags: ${formatStringArray(pack.tags)},
    previewShape: '${previewShape}',
    targets: ${targetsForPack(pack)},
    previewThumbnailUrl: '${directory}/thumbnail.webp',
    maps: {
      albedoMap: '${directory}/albedoMap.jpg',
      normalMap: '${directory}/normalMap.jpg',
      roughnessMap: '${directory}/roughnessMap.jpg',
      aoMap: '${directory}/aoMap.jpg',
      displacementMap: '${directory}/displacementMap.jpg',
    },
    roughness: ${roughness},
    mapProperties: {
      repeatX: ${mapProperties.repeatX},
      repeatY: ${mapProperties.repeatY},
      displacementScale: ${mapProperties.displacementScale},
      normalScaleX: ${mapProperties.normalScale},
      normalScaleY: ${mapProperties.normalScale},
    },
  }),
`
}

function targetsForPack(pack) {
  const tags = new Set(pack.tags)
  const label = pack.label.toLowerCase()
  const isFloor = tags.has('floor') || label.includes('floor') || label.includes('pavement')
  const isWall = tags.has('wall') || tags.has('facade') || label.includes('wall')

  if (pack.category === 'fabric') {
    return tags.has('carpet') || isFloor ? 'SLAB_TARGETS' : 'WALL_TARGETS'
  }

  if (pack.category === 'leather') return 'WALL_TARGETS'

  if (pack.category === 'tile') {
    return isWall && !isFloor ? 'WALL_TARGETS' : 'WALL_AND_SLAB_TARGETS'
  }

  if (pack.category === 'wall-covering') return 'WALL_TARGETS'

  if (pack.category === 'building') {
    if (isFloor && !isWall) return '[...SLAB_TARGETS, ...STAIR_TARGETS]'
    if (isWall && !isFloor) return 'WALL_TARGETS'
    return 'HARD_SURFACE_TARGETS'
  }

  if (pack.category === 'wood') {
    return isFloor && !isWall
      ? '[...SLAB_TARGETS, ...STAIR_TARGETS]'
      : '[...WALL_TARGETS, ...SLAB_TARGETS, ...STAIR_TARGETS]'
  }

  if (pack.category === 'stone') {
    return '[...WALL_TARGETS, ...SLAB_TARGETS, ...STAIR_TARGETS]'
  }

  return 'HARD_SURFACE_TARGETS'
}

function previewShapeForPack(pack) {
  if (pack.category === 'fabric' || pack.category === 'leather') return 'fabric'
  if (pack.category === 'stone') return 'sphere'
  return 'tile'
}

function roughnessForPack(pack) {
  if (pack.finish === 'glossy') return 0.3
  if (pack.finish === 'satin') return 0.52
  if (pack.finish === 'rough') return 0.82
  if (pack.finish === 'metallic') return 0.32
  return 0.68
}

function mapPropertiesForPack(pack) {
  const tags = new Set(pack.tags)
  const isFineSurface =
    pack.category === 'fabric' || pack.category === 'leather' || tags.has('carpet')
  const isGlossy = pack.finish === 'glossy'

  return {
    repeatX: isFineSurface ? 3 : 2,
    repeatY: isFineSurface ? 3 : 2,
    displacementScale: isFineSurface || isGlossy ? 0.004 : 0.008,
    normalScale: isFineSurface || isGlossy ? 0.6 : 0.75,
  }
}

function formatStringArray(values) {
  return `[${values.map((value) => `'${escapeString(value)}'`).join(', ')}]`
}

function escapeString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
