import type { SiteNode } from '@pascal-app/core'

export const ORIENTATION_OPTIONS = [
  { label: '北', shortLabel: 'N', degrees: 0 },
  { label: '东北', shortLabel: 'NE', degrees: 45 },
  { label: '东', shortLabel: 'E', degrees: 90 },
  { label: '东南', shortLabel: 'SE', degrees: 135 },
  { label: '南', shortLabel: 'S', degrees: 180 },
  { label: '西南', shortLabel: 'SW', degrees: 225 },
  { label: '西', shortLabel: 'W', degrees: 270 },
  { label: '西北', shortLabel: 'NW', degrees: 315 },
] as const

export const ORIENTATION_STEPS = [-5, -1, 1, 5] as const

const SITE_ORIENTATION_DEGREES_KEY = 'orientationDegrees'

export function normalizeDegrees(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

export function radiansToDegrees(radians: number): number {
  return normalizeDegrees((-radians * 180) / Math.PI)
}

export function degreesToRadians(degrees: number): number {
  return (-normalizeDegrees(degrees) * Math.PI) / 180
}

export function getCircularDegreeDistance(a: number, b: number): number {
  const distance = Math.abs(normalizeDegrees(a) - normalizeDegrees(b))
  return Math.min(distance, 360 - distance)
}

export function getNearestOrientation(degrees: number) {
  return ORIENTATION_OPTIONS.reduce((nearest, option) =>
    getCircularDegreeDistance(degrees, option.degrees) <
    getCircularDegreeDistance(degrees, nearest.degrees)
      ? option
      : nearest,
  )
}

export function getOrientationText(degrees: number): string {
  const nearest = getNearestOrientation(degrees)
  const distance = getCircularDegreeDistance(degrees, nearest.degrees)
  const prefix =
    distance < 0.05
      ? nearest.label
      : distance <= 5
        ? `接近${nearest.label}`
        : `偏向${nearest.label}`

  return `${prefix} ${degrees.toFixed(1)}°`
}

function getMetadataObject(metadata: SiteNode['metadata']): Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

export function getSiteOrientationDegrees(
  site: Pick<SiteNode, 'metadata'> | null | undefined,
): number {
  const metadata = getMetadataObject(site?.metadata ?? {})
  const degrees = metadata[SITE_ORIENTATION_DEGREES_KEY]
  return typeof degrees === 'number' && Number.isFinite(degrees) ? normalizeDegrees(degrees) : 0
}

export function withSiteOrientationDegrees(
  site: Pick<SiteNode, 'metadata'>,
  degrees: number,
): SiteNode['metadata'] {
  return {
    ...getMetadataObject(site.metadata),
    [SITE_ORIENTATION_DEGREES_KEY]: normalizeDegrees(degrees),
  } as SiteNode['metadata']
}
