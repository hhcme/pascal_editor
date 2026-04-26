import type { SiteNode } from '@pascal-app/core'

const SITE_SOLAR_LOCATION_KEY = 'solarLocation'

export type SiteSolarLocation = {
  latitude?: number
  longitude?: number
  timezone?: string
  elevationMeters?: number
}

export type ResolvedSiteSolarLocation = {
  latitude: number
  longitude: number
  timezone: string
  elevationMeters?: number
}

function getMetadataObject(metadata: SiteNode['metadata']): Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

function normalizeCoordinate(value: unknown, min: number, max: number) {
  if (!(typeof value === 'number' && Number.isFinite(value))) return undefined
  return Math.min(Math.max(value, min), max)
}

function normalizeElevation(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeTimezone(value: unknown) {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  return isValidTimeZone(trimmed) ? trimmed : undefined
}

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false

  const trimmed = value.trim()
  if (!trimmed) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function getBrowserTimeZone() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isValidTimeZone(timezone) ? timezone : 'UTC'
}

export function getSiteSolarLocation(
  site: Pick<SiteNode, 'metadata'> | null | undefined,
): SiteSolarLocation {
  const metadata = getMetadataObject(site?.metadata ?? {})
  const rawLocation = metadata[SITE_SOLAR_LOCATION_KEY]

  if (!(typeof rawLocation === 'object' && rawLocation !== null && !Array.isArray(rawLocation))) {
    return {}
  }

  const location = rawLocation as Record<string, unknown>

  return {
    latitude: normalizeCoordinate(location.latitude, -90, 90),
    longitude: normalizeCoordinate(location.longitude, -180, 180),
    timezone: normalizeTimezone(location.timezone),
    elevationMeters: normalizeElevation(location.elevationMeters),
  }
}

export function normalizeSiteSolarLocation(
  location: SiteSolarLocation | null | undefined,
): ResolvedSiteSolarLocation | null {
  const latitude = normalizeCoordinate(location?.latitude, -90, 90)
  const longitude = normalizeCoordinate(location?.longitude, -180, 180)
  const timezone = normalizeTimezone(location?.timezone)

  if (!(typeof latitude === 'number' && typeof longitude === 'number' && timezone)) {
    return null
  }

  const elevationMeters = normalizeElevation(location?.elevationMeters)

  return {
    latitude,
    longitude,
    timezone,
    elevationMeters,
  }
}

export function resolveSiteSolarLocation(
  site: Pick<SiteNode, 'metadata'> | null | undefined,
): ResolvedSiteSolarLocation | null {
  return normalizeSiteSolarLocation(getSiteSolarLocation(site))
}

export function withSiteSolarLocation(
  site: Pick<SiteNode, 'metadata'>,
  updates: Partial<SiteSolarLocation>,
): SiteNode['metadata'] {
  const metadata = getMetadataObject(site.metadata)
  const currentLocation = getSiteSolarLocation(site)

  const nextLocation: SiteSolarLocation = {
    ...currentLocation,
    ...updates,
  }

  const filteredLocation: SiteSolarLocation = {}
  const latitude = normalizeCoordinate(nextLocation.latitude, -90, 90)
  const longitude = normalizeCoordinate(nextLocation.longitude, -180, 180)
  const timezone = normalizeTimezone(nextLocation.timezone)
  const elevationMeters = normalizeElevation(nextLocation.elevationMeters)

  if (typeof latitude === 'number') filteredLocation.latitude = latitude
  if (typeof longitude === 'number') filteredLocation.longitude = longitude
  if (timezone) filteredLocation.timezone = timezone
  if (typeof elevationMeters === 'number') filteredLocation.elevationMeters = elevationMeters

  if (Object.keys(filteredLocation).length === 0) {
    const nextMetadata = { ...metadata }
    delete nextMetadata[SITE_SOLAR_LOCATION_KEY]
    return nextMetadata as SiteNode['metadata']
  }

  return {
    ...metadata,
    [SITE_SOLAR_LOCATION_KEY]: filteredLocation,
  } as SiteNode['metadata']
}
