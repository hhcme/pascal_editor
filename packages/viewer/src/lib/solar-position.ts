import type { ResolvedSiteSolarLocation } from './site-solar'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const DAY_MS = 86_400_000
const MINUTE_MS = 60_000
const J1970 = 2_440_588
const J2000 = 2_451_545
const EARTH_OBLIQUITY = 23.4397 * RAD

const formatterCache = new Map<string, Intl.DateTimeFormat>()

export type SolarPosition = {
  azimuthDeg: number
  elevationDeg: number
  isAboveHorizon: boolean
}

export type SolarPathSample = SolarPosition & {
  minutesOfDay: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeDegrees(value: number) {
  const normalized = ((value % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

function clampMinutesOfDay(value: number) {
  return clamp(Math.round(value), 0, 23 * 60 + 59)
}

function parseDateString(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null

  const year = Number.parseInt(match[1] ?? '', 10)
  const month = Number.parseInt(match[2] ?? '', 10)
  const day = Number.parseInt(match[3] ?? '', 10)
  const candidate = new Date(Date.UTC(year, month - 1, day))

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

function getFormatter(timeZone: string) {
  const cached = formatterCache.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  formatterCache.set(timeZone, formatter)
  return formatter
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = getFormatter(timeZone).formatToParts(date)
  let year = 0
  let month = 0
  let day = 0
  let hour = 0
  let minute = 0
  let second = 0

  for (const part of parts) {
    const value = Number.parseInt(part.value, 10)
    if (Number.isNaN(value)) continue

    switch (part.type) {
      case 'year':
        year = value
        break
      case 'month':
        month = value
        break
      case 'day':
        day = value
        break
      case 'hour':
        hour = value
        break
      case 'minute':
        minute = value
        break
      case 'second':
        second = value
        break
    }
  }

  return { year, month, day, hour, minute, second }
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const parts = getTimeZoneParts(date, timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

  return Math.round((asUtc - date.getTime()) / MINUTE_MS)
}

function getZonedDateUtcMs(date: string, minutesOfDay: number, timeZone: string) {
  const parsedDate = parseDateString(date)
  if (!parsedDate) return null

  const clampedMinutes = clampMinutesOfDay(minutesOfDay)
  const hours = Math.floor(clampedMinutes / 60)
  const minutes = clampedMinutes % 60
  const localAsUtc = Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day, hours, minutes)

  let utcMs = localAsUtc

  for (let index = 0; index < 3; index++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, new Date(utcMs))
    const nextUtcMs = localAsUtc - offsetMinutes * MINUTE_MS
    if (Math.abs(nextUtcMs - utcMs) < 1) {
      utcMs = nextUtcMs
      break
    }
    utcMs = nextUtcMs
  }

  return utcMs
}

function toJulian(dateMs: number) {
  return dateMs / DAY_MS - 0.5 + J1970
}

function toDays(dateMs: number) {
  return toJulian(dateMs) - J2000
}

function rightAscension(longitude: number, latitude: number) {
  return Math.atan2(
    Math.sin(longitude) * Math.cos(EARTH_OBLIQUITY) -
      Math.tan(latitude) * Math.sin(EARTH_OBLIQUITY),
    Math.cos(longitude),
  )
}

function declination(longitude: number, latitude: number) {
  return Math.asin(
    Math.sin(latitude) * Math.cos(EARTH_OBLIQUITY) +
      Math.cos(latitude) * Math.sin(EARTH_OBLIQUITY) * Math.sin(longitude),
  )
}

function solarMeanAnomaly(days: number) {
  return RAD * (357.5291 + 0.98560028 * days)
}

function eclipticLongitude(meanAnomaly: number) {
  const equationOfCenter =
    RAD *
    (1.9148 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly) +
      0.0003 * Math.sin(3 * meanAnomaly))
  const perihelion = RAD * 102.9372

  return meanAnomaly + equationOfCenter + perihelion + Math.PI
}

function siderealTime(days: number, longitudeWest: number) {
  return RAD * (280.16 + 360.9856235 * days) - longitudeWest
}

function solarAzimuth(hourAngle: number, latitude: number, declinationValue: number) {
  return Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declinationValue) * Math.cos(latitude),
  )
}

function solarAltitude(hourAngle: number, latitude: number, declinationValue: number) {
  return Math.asin(
    Math.sin(latitude) * Math.sin(declinationValue) +
      Math.cos(latitude) * Math.cos(declinationValue) * Math.cos(hourAngle),
  )
}

function getSunCoordinates(days: number) {
  const meanAnomaly = solarMeanAnomaly(days)
  const longitude = eclipticLongitude(meanAnomaly)

  return {
    rightAscension: rightAscension(longitude, 0),
    declination: declination(longitude, 0),
  }
}

export function getSolarPositionForLocation(
  location: ResolvedSiteSolarLocation,
  date: string,
  minutesOfDay: number,
): SolarPosition | null {
  const utcMs = getZonedDateUtcMs(date, minutesOfDay, location.timezone)
  if (utcMs === null) return null

  const longitudeWest = -location.longitude * RAD
  const latitude = location.latitude * RAD
  const days = toDays(utcMs)
  const sunCoordinates = getSunCoordinates(days)
  const hourAngle = siderealTime(days, longitudeWest) - sunCoordinates.rightAscension
  const azimuth = solarAzimuth(hourAngle, latitude, sunCoordinates.declination)
  const altitude = solarAltitude(hourAngle, latitude, sunCoordinates.declination)
  const azimuthDeg = normalizeDegrees(azimuth * DEG + 180)
  const elevationDeg = altitude * DEG

  return {
    azimuthDeg,
    elevationDeg,
    isAboveHorizon: elevationDeg > 0,
  }
}

export function getSolarPathForLocation(
  location: ResolvedSiteSolarLocation,
  date: string,
  stepMinutes = 10,
): SolarPathSample[] {
  const samples: SolarPathSample[] = []
  const normalizedStep = Math.max(1, Math.round(stepMinutes))

  for (let minutes = 0; minutes < 24 * 60; minutes += normalizedStep) {
    const position = getSolarPositionForLocation(location, date, minutes)
    if (!position) continue

    samples.push({
      minutesOfDay: minutes,
      ...position,
    })
  }

  if (samples[samples.length - 1]?.minutesOfDay !== 23 * 60 + 59) {
    const position = getSolarPositionForLocation(location, date, 23 * 60 + 59)
    if (position) {
      samples.push({
        minutesOfDay: 23 * 60 + 59,
        ...position,
      })
    }
  }

  return samples
}
