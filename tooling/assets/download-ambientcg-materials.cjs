#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')
const { execFileSync } = require('node:child_process')

const EDITOR_ROOT = path.resolve(__dirname, '../..')
const MATERIAL_ROOT = path.join(EDITOR_ROOT, 'apps/editor/public/material')
const PACKS_FILE = path.join(EDITOR_ROOT, 'assets/ambientcg-material-packs.json')
const MAPS = [
  ['Color', 'albedoMap.jpg'],
  ['NormalGL', 'normalMap.jpg'],
  ['Roughness', 'roughnessMap.jpg'],
  ['AmbientOcclusion', 'aoMap.jpg'],
  ['Displacement', 'displacementMap.jpg'],
]

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifest = readJson(PACKS_FILE)
  const packs = resolvePacks(manifest.packs, options.targets)
  const sharp = loadSharp()

  if (packs.length === 0) {
    console.log('No ambientCG material packs selected.')
    return
  }

  for (const pack of packs) {
    await importPack(pack, manifest, { ...options, sharp })
  }
}

function parseArgs(args) {
  const options = {
    force: false,
    targets: [],
  }

  for (const arg of args) {
    if (arg === '--force') {
      options.force = true
      continue
    }
    options.targets.push(arg)
  }

  return options
}

function resolvePacks(packs, targets) {
  if (targets.length === 0) return packs
  const wanted = new Set(targets)
  return packs.filter(
    (pack) =>
      wanted.has(pack.assetId) ||
      wanted.has(pack.materialId) ||
      wanted.has(pack.directory),
  )
}

async function importPack(pack, manifest, options) {
  const destinationDir = path.join(MATERIAL_ROOT, pack.directory)
  const requiredFiles = [
    'albedoMap.jpg',
    'normalMap.jpg',
    'roughnessMap.jpg',
    'displacementMap.jpg',
    'thumbnail.webp',
  ]

  if (
    !options.force &&
    fs.existsSync(destinationDir) &&
    requiredFiles.every((fileName) => fs.existsSync(path.join(destinationDir, fileName)))
  ) {
    console.log(`${pack.assetId}: skipped, material directory already exists`)
    return
  }

  fs.mkdirSync(destinationDir, { recursive: true })

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ambientcg-${pack.assetId}-`))
  try {
    const zipPath = path.join(tmpDir, `${pack.assetId}_${manifest.downloadAttributes}.zip`)
    const extractDir = path.join(tmpDir, 'extract')
    fs.mkdirSync(extractDir)

    downloadZip(pack, manifest, zipPath)
    execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'inherit' })

    const importedMaps = []
    for (const [ambientSuffix, destinationName] of MAPS) {
      const sourceFile = findExtractedFile(
        extractDir,
        `${pack.assetId}_${manifest.downloadAttributes}_${ambientSuffix}.jpg`,
      )
      if (!sourceFile) continue

      fs.copyFileSync(sourceFile, path.join(destinationDir, destinationName))
      importedMaps.push(destinationName)
    }

    const thumbnailSource =
      findExtractedFile(extractDir, `${pack.assetId}.png`) ??
      findExtractedFile(extractDir, `${pack.assetId}_${manifest.downloadAttributes}_Color.jpg`)

    if (!thumbnailSource) {
      throw new Error(`${pack.assetId}: missing thumbnail source`)
    }

    await options.sharp(thumbnailSource)
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 86 })
      .toFile(path.join(destinationDir, 'thumbnail.webp'))

    console.log(
      `${pack.assetId}: imported ${importedMaps.length} maps to ${path.relative(
        EDITOR_ROOT,
        destinationDir,
      )}`,
    )
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function downloadZip(pack, manifest, zipPath) {
  const downloadUrl = `https://ambientcg.com/get?file=${pack.assetId}_${manifest.downloadAttributes}.zip`

  execFileSync(
    'curl',
    [
      '-L',
      '--fail',
      '--retry',
      '5',
      '--retry-delay',
      '2',
      '--connect-timeout',
      '25',
      '--max-time',
      '240',
      '--silent',
      '--show-error',
      downloadUrl,
      '-o',
      zipPath,
    ],
    { stdio: 'inherit' },
  )
}

function findExtractedFile(rootDir, fileName) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name)
    if (entry.isFile() && entry.name === fileName) return entryPath
    if (entry.isDirectory()) {
      const nested = findExtractedFile(entryPath, fileName)
      if (nested) return nested
    }
  }
  return null
}

function loadSharp() {
  try {
    return require('sharp')
  } catch {}

  const fallbackPath = path.join(
    EDITOR_ROOT,
    'node_modules/.bun/sharp@0.34.5/node_modules/sharp/lib/index.js',
  )
  if (fs.existsSync(fallbackPath)) return require(fallbackPath)

  throw new Error('Missing sharp. Run bun install before importing material thumbnails.')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
