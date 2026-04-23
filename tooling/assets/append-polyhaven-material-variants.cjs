#!/usr/bin/env node

const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')
const process = require('node:process')

const EDITOR_ROOT = path.resolve(__dirname, '../..')
const PACKS_FILE = path.join(EDITOR_ROOT, 'assets/polyhaven-material-packs.json')
const MANIFEST_FILE = path.join(EDITOR_ROOT, 'apps/editor/public/material/material-manifest.json')

const DEFAULT_CATEGORY_LIMITS = {
  brick: 10,
  tiles: 8,
  wood: 10,
  concrete: 8,
  plaster: 6,
  fabric: 8,
  leather: 3,
  marble: 3,
}

const CATEGORY_OVERRIDES = {
  brick: {
    category: 'building',
    colorFamily: 'red',
    finish: 'rough',
    tags: ['brick'],
  },
  tiles: {
    category: 'tile',
    colorFamily: 'mixed',
    finish: 'satin',
    tags: ['tile'],
  },
  wood: {
    category: 'wood',
    colorFamily: 'wood',
    finish: 'rough',
    tags: ['wood'],
  },
  concrete: {
    category: 'building',
    colorFamily: 'gray',
    finish: 'rough',
    tags: ['concrete'],
  },
  plaster: {
    category: 'wall-covering',
    colorFamily: 'gray',
    finish: 'rough',
    tags: ['plaster'],
  },
  fabric: {
    category: 'fabric',
    colorFamily: 'mixed',
    finish: 'rough',
    tags: ['fabric'],
  },
  leather: {
    category: 'leather',
    colorFamily: 'brown',
    finish: 'satin',
    tags: ['leather'],
  },
  marble: {
    category: 'stone',
    colorFamily: 'white',
    finish: 'glossy',
    tags: ['marble'],
  },
}

const REQUIRED_MAPS = ['Diffuse', 'nor_gl', 'Rough', 'AO', 'Displacement']

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifest = readJson(PACKS_FILE)
  const materialManifest = fs.existsSync(MANIFEST_FILE) ? readJson(MANIFEST_FILE) : null
  const existingAssetIds = new Set(manifest.packs.map((pack) => pack.assetId))
  const existingMaterialIds = new Set(manifest.packs.map((pack) => pack.materialId))
  const existingHashes = new Set(
    materialManifest?.materials
      ?.flatMap((material) => material.assets ?? [])
      .map((asset) => asset.sha256)
      .filter(Boolean) ?? [],
  )

  const additions = []

  for (const [categoryId, limit] of Object.entries(options.categoryLimits)) {
    const candidates = await fetchJson(
      `https://api.polyhaven.com/assets?t=textures&categories=${encodeURIComponent(categoryId)}`,
      manifest.userAgent,
    )

    for (const [assetId, asset] of Object.entries(candidates)) {
      if (additions.filter((pack) => pack._categoryId === categoryId).length >= limit) break
      if (existingAssetIds.has(assetId)) continue

      const files = await fetchJson(`https://api.polyhaven.com/files/${assetId}`, manifest.userAgent)
      if (!hasRequiredMaps(files, manifest)) continue

      const contentKey = REQUIRED_MAPS.map((mapKey) => {
        const file = files[mapKey][manifest.downloadResolution][manifest.downloadFormat]
        return file.md5 ?? file.url
      }).join('|')
      if (existingHashes.has(contentKey)) continue

      const pack = buildPack(assetId, asset, categoryId, existingMaterialIds)
      additions.push(pack)
      existingAssetIds.add(pack.assetId)
      existingMaterialIds.add(pack.materialId)
    }
  }

  if (additions.length === 0) {
    console.log('No new Poly Haven material variants found.')
    return
  }

  manifest.packs.push(...additions.map(({ _categoryId, ...pack }) => pack))
  fs.writeFileSync(PACKS_FILE, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(`Added ${additions.length} Poly Haven material variants:`)
  for (const pack of additions) {
    console.log(`- ${pack.assetId} (${pack._categoryId})`)
  }
}

function parseArgs(args) {
  const options = {
    categoryLimits: { ...DEFAULT_CATEGORY_LIMITS },
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--category') {
      const [categoryId, limitValue] = args[index + 1].split(':')
      options.categoryLimits = {
        [categoryId]: Number(limitValue ?? DEFAULT_CATEGORY_LIMITS[categoryId] ?? 10),
      }
      index += 1
      continue
    }

    if (arg === '--limit') {
      const limit = Number(args[index + 1])
      options.categoryLimits = Object.fromEntries(
        Object.keys(options.categoryLimits).map((categoryId) => [categoryId, limit]),
      )
      index += 1
    }
  }

  return options
}

function hasRequiredMaps(files, manifest) {
  return REQUIRED_MAPS.every(
    (mapKey) => files[mapKey]?.[manifest.downloadResolution]?.[manifest.downloadFormat]?.url,
  )
}

function buildPack(assetId, asset, categoryId, existingMaterialIds) {
  const override = CATEGORY_OVERRIDES[categoryId]
  const sourceTags = asset.tags ?? []
  const categories = asset.categories ?? []
  const label = asset.name ?? titleCase(assetId)
  const materialIdBase = `polyhaven-${slugify(assetId)}`
  const materialId = uniqueId(materialIdBase, existingMaterialIds)
  const directory = materialId

  const tags = [
    'polyhaven',
    'cc0',
    ...override.tags,
    ...sourceTags.slice(0, 4).map((tag) => slugify(tag).replace(/-/g, ' ')),
  ]

  return {
    _categoryId: categoryId,
    assetId,
    materialId,
    directory,
    label,
    category: override.category,
    colorFamily: inferColorFamily(`${label} ${sourceTags.join(' ')} ${categories.join(' ')}`, override),
    finish: inferFinish(`${label} ${sourceTags.join(' ')} ${categories.join(' ')}`, override),
    tags: [...new Set(tags)].slice(0, 9),
    sourceUrl: `https://polyhaven.com/a/${assetId}`,
  }
}

function inferColorFamily(text, override) {
  const value = text.toLowerCase()
  if (value.includes('black') || value.includes('charcoal')) return 'black'
  if (value.includes('white')) return 'white'
  if (value.includes('blue')) return 'blue'
  if (value.includes('green') || value.includes('moss')) return 'green'
  if (value.includes('red') || value.includes('brick')) return 'red'
  if (value.includes('brown') || value.includes('leather')) return 'brown'
  if (value.includes('yellow') || value.includes('beige') || value.includes('gold')) return 'yellow'
  if (value.includes('gray') || value.includes('grey') || value.includes('concrete')) return 'gray'
  return override.colorFamily
}

function inferFinish(text, override) {
  const value = text.toLowerCase()
  if (value.includes('gloss') || value.includes('shiny') || value.includes('satin')) return 'glossy'
  if (value.includes('smooth') || value.includes('clean')) return 'satin'
  if (value.includes('rough') || value.includes('weathered') || value.includes('dirty')) return 'rough'
  return override.finish
}

function uniqueId(baseId, existingIds) {
  let id = baseId
  let suffix = 2
  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }
  return id
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function titleCase(value) {
  return String(value)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}

function fetchJson(url, userAgent) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': userAgent } }, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GET ${url} failed with ${response.statusCode}`))
          response.resume()
          return
        }

        let data = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          data += chunk
        })
        response.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (error) {
            reject(error)
          }
        })
      })
      .on('error', reject)
  })
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
