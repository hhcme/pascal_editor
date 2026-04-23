#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')
const { execFileSync } = require('node:child_process')

const EDITOR_ROOT = path.resolve(__dirname, '../..')
const MATERIAL_ROOT = path.join(EDITOR_ROOT, 'apps/editor/public/material')
const PACKS_FILE = path.join(EDITOR_ROOT, 'assets/polyhaven-material-packs.json')

const MAPS = [
  ['Diffuse', 'albedoMap.jpg'],
  ['nor_gl', 'normalMap.jpg'],
  ['Rough', 'roughnessMap.jpg'],
  ['AO', 'aoMap.jpg'],
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
    console.log('No Poly Haven material packs selected.')
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
    'aoMap.jpg',
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

  const files = fetchJson(`https://api.polyhaven.com/files/${pack.assetId}`, manifest.userAgent)
  const importedMaps = []

  for (const [polyHavenKey, destinationName] of MAPS) {
    const file = files[polyHavenKey]?.[manifest.downloadResolution]?.[manifest.downloadFormat]
    if (!file?.url) continue

    const destinationPath = path.join(destinationDir, destinationName)
    downloadFile(file.url, destinationPath, manifest.userAgent)
    verifyMd5(destinationPath, file.md5, pack.assetId, destinationName)
    importedMaps.push(destinationName)
  }

  if (!importedMaps.includes('albedoMap.jpg')) {
    throw new Error(`${pack.assetId}: missing required Diffuse ${manifest.downloadResolution} ${manifest.downloadFormat}`)
  }

  const thumbnailPath = path.join(os.tmpdir(), `${pack.assetId}-polyhaven-thumbnail.png`)
  try {
    downloadFile(
      `https://cdn.polyhaven.com/asset_img/thumbs/${pack.assetId}.png?width=512&height=512`,
      thumbnailPath,
      manifest.userAgent,
    )
    await options.sharp(thumbnailPath)
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 86 })
      .toFile(path.join(destinationDir, 'thumbnail.webp'))
  } finally {
    fs.rmSync(thumbnailPath, { force: true })
  }

  console.log(
    `${pack.assetId}: imported ${importedMaps.length} maps to ${path.relative(
      EDITOR_ROOT,
      destinationDir,
    )}`,
  )
}

function fetchJson(url, userAgent) {
  const output = execFileSync(
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
      '180',
      '--silent',
      '--show-error',
      '-H',
      `User-Agent: ${userAgent}`,
      url,
    ],
    { encoding: 'utf8' },
  )

  return JSON.parse(output)
}

function downloadFile(url, destinationPath, userAgent) {
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
      '-H',
      `User-Agent: ${userAgent}`,
      url,
      '-o',
      destinationPath,
    ],
    { stdio: 'inherit' },
  )
}

function verifyMd5(filePath, expectedMd5, assetId, destinationName) {
  if (!expectedMd5) return
  const actualMd5 = crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex')
  if (actualMd5 !== expectedMd5) {
    throw new Error(`${assetId}: ${destinationName} md5 mismatch`)
  }
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
