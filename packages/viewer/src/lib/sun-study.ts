export type SunTimeOfDay = 'morning' | 'noon' | 'afternoon' | 'evening'
export type SunStudyMode = 'preset' | 'real'

export type SunStudyState = {
  enabled: boolean
  mode: SunStudyMode
  timeOfDay: SunTimeOfDay
  progress: number
  date: string | null
  minutesOfDay: number
}

export type SunPreset = {
  id: SunTimeOfDay
  label: string
  progress: number
  azimuthDeg: number
  elevationDeg: number
  intensity: number
  ambientIntensity: number
  fillIntensity: number
  shadowIntensity: number
  color: string
}

export type SunResolvedPreset = Omit<SunPreset, 'id' | 'label'> & {
  id: SunTimeOfDay | 'custom'
  label: string
}

const SUN_PATH_START_AZIMUTH_DEG = 72
const SUN_PATH_AZIMUTH_SPAN_DEG = 218
const SUN_PATH_BASE_ELEVATION_DEG = 12
const SUN_PATH_ELEVATION_SPAN_DEG = 58
const DEFAULT_SUN_TIME_OF_DAY: SunTimeOfDay = 'afternoon'
const DEFAULT_SUN_MODE: SunStudyMode = 'preset'
const DEFAULT_SUN_MINUTES_OF_DAY = 14 * 60

export const DEFAULT_SUN_STUDY_STATE: SunStudyState = {
  enabled: false,
  mode: DEFAULT_SUN_MODE,
  timeOfDay: DEFAULT_SUN_TIME_OF_DAY,
  progress: 0.78,
  date: null,
  minutesOfDay: DEFAULT_SUN_MINUTES_OF_DAY,
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function isValidSunStudyDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number.parseInt(match[1] ?? '', 10)
  const month = Number.parseInt(match[2] ?? '', 10)
  const day = Number.parseInt(match[3] ?? '', 10)
  const candidate = new Date(Date.UTC(year, month - 1, day))

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  )
}

function formatDatePart(value: number) {
  return value.toString().padStart(2, '0')
}

function degToRad(value: number) {
  return (value * Math.PI) / 180
}

function parseHexColor(color: string): [number, number, number] {
  const normalized = color.replace('#', '')
  const value = Number.parseInt(
    normalized.length === 3 ? normalized.replace(/(.)/g, '$1$1') : normalized,
    16,
  )

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function toHexColor(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
}

function lerpHexColor(start: string, end: string, amount: number) {
  const [sr, sg, sb] = parseHexColor(start)
  const [er, eg, eb] = parseHexColor(end)

  return `#${toHexColor(lerp(sr, er, amount))}${toHexColor(lerp(sg, eg, amount))}${toHexColor(lerp(sb, eb, amount))}`
}

export function clampSunProgress(progress: number) {
  return Number.isFinite(progress) ? clamp(progress, 0, 1) : DEFAULT_SUN_STUDY_STATE.progress
}

export function clampSunMinutesOfDay(minutesOfDay: number) {
  return Number.isFinite(minutesOfDay)
    ? clamp(Math.round(minutesOfDay), 0, 23 * 60 + 59)
    : DEFAULT_SUN_STUDY_STATE.minutesOfDay
}

export function getDefaultSunStudyDate() {
  const now = new Date()
  return `${now.getFullYear()}-${formatDatePart(now.getMonth() + 1)}-${formatDatePart(now.getDate())}`
}

export function resolveSunStudyDate(date: string | null | undefined) {
  return typeof date === 'string' && isValidSunStudyDate(date) ? date : null
}

export function resolveSunMinutesOfDay(minutesOfDay: number | null | undefined) {
  return typeof minutesOfDay === 'number' && Number.isFinite(minutesOfDay)
    ? clampSunMinutesOfDay(minutesOfDay)
    : DEFAULT_SUN_STUDY_STATE.minutesOfDay
}

export function formatSunMinutesOfDay(minutesOfDay: number) {
  const totalMinutes = clampSunMinutesOfDay(minutesOfDay)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${formatDatePart(hours)}:${formatDatePart(minutes)}`
}

export function getSunAnglesForProgress(progress: number): {
  azimuthDeg: number
  elevationDeg: number
} {
  const t = clampSunProgress(progress)

  return {
    azimuthDeg: SUN_PATH_START_AZIMUTH_DEG + t * SUN_PATH_AZIMUTH_SPAN_DEG,
    elevationDeg: SUN_PATH_BASE_ELEVATION_DEG + Math.sin(t * Math.PI) * SUN_PATH_ELEVATION_SPAN_DEG,
  }
}

function sunPreset(preset: Omit<SunPreset, 'azimuthDeg' | 'elevationDeg'>): SunPreset {
  return {
    ...preset,
    ...getSunAnglesForProgress(preset.progress),
  }
}

export const SUN_TIME_OPTIONS: SunPreset[] = [
  sunPreset({
    id: 'morning',
    label: '上午',
    progress: 0.08,
    intensity: 3.4,
    ambientIntensity: 0.42,
    fillIntensity: 0.28,
    shadowIntensity: 0.72,
    color: '#ffd39a',
  }),
  sunPreset({
    id: 'noon',
    label: '正午',
    progress: 0.5,
    intensity: 4.2,
    ambientIntensity: 0.54,
    fillIntensity: 0.38,
    shadowIntensity: 0.42,
    color: '#fff6dc',
  }),
  sunPreset({
    id: 'afternoon',
    label: '下午',
    progress: 0.78,
    intensity: 3.8,
    ambientIntensity: 0.45,
    fillIntensity: 0.26,
    shadowIntensity: 0.68,
    color: '#ffd08a',
  }),
  sunPreset({
    id: 'evening',
    label: '傍晚',
    progress: 0.96,
    intensity: 2.8,
    ambientIntensity: 0.36,
    fillIntensity: 0.18,
    shadowIntensity: 0.82,
    color: '#ffb46b',
  }),
]

const SUN_PRESETS_BY_ID = SUN_TIME_OPTIONS.reduce(
  (acc, preset) => {
    acc[preset.id] = preset
    return acc
  },
  {} as Record<SunTimeOfDay, SunPreset>,
)

export function resolveSunPreset(timeOfDay: SunTimeOfDay | string | null | undefined): SunPreset {
  if (timeOfDay && timeOfDay in SUN_PRESETS_BY_ID) {
    return SUN_PRESETS_BY_ID[timeOfDay as SunTimeOfDay]
  }

  return SUN_PRESETS_BY_ID[DEFAULT_SUN_STUDY_STATE.timeOfDay]
}

export function getSunProgressForTimeOfDay(timeOfDay: SunTimeOfDay | string | null | undefined) {
  return resolveSunPreset(timeOfDay).progress
}

export function resolveSunProgress(
  timeOfDay: SunTimeOfDay | string | null | undefined,
  progress: number | null | undefined,
) {
  return typeof progress === 'number' && Number.isFinite(progress)
    ? clampSunProgress(progress)
    : getSunProgressForTimeOfDay(timeOfDay)
}

export function getNearestSunTimeOfDay(progress: number): SunTimeOfDay {
  const sunProgress = clampSunProgress(progress)
  let nearest = SUN_TIME_OPTIONS[0]!
  let nearestDistance = Math.abs(sunProgress - nearest.progress)

  for (const preset of SUN_TIME_OPTIONS.slice(1)) {
    const distance = Math.abs(sunProgress - preset.progress)
    if (distance < nearestDistance) {
      nearest = preset
      nearestDistance = distance
    }
  }

  return nearest.id
}

export function resolveSunStudyState(
  state: Partial<SunStudyState> | SunStudyState | null | undefined,
): SunStudyState {
  const timeOfDay = state?.timeOfDay && state.timeOfDay in SUN_PRESETS_BY_ID
    ? (state.timeOfDay as SunTimeOfDay)
    : DEFAULT_SUN_STUDY_STATE.timeOfDay

  return {
    enabled: state?.enabled === true,
    mode: state?.mode === 'real' ? 'real' : DEFAULT_SUN_MODE,
    timeOfDay,
    progress: resolveSunProgress(timeOfDay, state?.progress),
    date: resolveSunStudyDate(state?.date),
    minutesOfDay: resolveSunMinutesOfDay(state?.minutesOfDay),
  }
}

export function resolveSunLighting(progress: number): SunResolvedPreset {
  const sunProgress = clampSunProgress(progress)
  const first = SUN_TIME_OPTIONS[0]!
  const last = SUN_TIME_OPTIONS[SUN_TIME_OPTIONS.length - 1]!
  const { azimuthDeg, elevationDeg } = getSunAnglesForProgress(sunProgress)

  if (sunProgress <= first.progress) {
    return { ...first, azimuthDeg, elevationDeg }
  }

  if (sunProgress >= last.progress) {
    return { ...last, azimuthDeg, elevationDeg }
  }

  for (let index = 0; index < SUN_TIME_OPTIONS.length - 1; index++) {
    const start = SUN_TIME_OPTIONS[index]!
    const end = SUN_TIME_OPTIONS[index + 1]!

    if (sunProgress < start.progress || sunProgress > end.progress) continue

    const span = end.progress - start.progress
    const amount = span > 0 ? (sunProgress - start.progress) / span : 0

    return {
      id: sunProgress === start.progress ? start.id : 'custom',
      label: '自定义',
      progress: sunProgress,
      azimuthDeg,
      elevationDeg,
      intensity: lerp(start.intensity, end.intensity, amount),
      ambientIntensity: lerp(start.ambientIntensity, end.ambientIntensity, amount),
      fillIntensity: lerp(start.fillIntensity, end.fillIntensity, amount),
      shadowIntensity: lerp(start.shadowIntensity, end.shadowIntensity, amount),
      color: lerpHexColor(start.color, end.color, amount),
    }
  }

  return { ...resolveSunPreset(DEFAULT_SUN_TIME_OF_DAY), azimuthDeg, elevationDeg }
}

export function resolveRealSunLighting(
  azimuthDeg: number,
  elevationDeg: number,
): SunResolvedPreset {
  const daylight = clamp((elevationDeg + 2) / 12, 0, 1)
  const altitudeFactor = clamp(elevationDeg / 65, 0, 1)
  const warmth = 1 - clamp((elevationDeg - 6) / 36, 0, 1)

  return {
    id: 'custom',
    label: '真实太阳',
    progress: altitudeFactor,
    azimuthDeg,
    elevationDeg,
    intensity: daylight > 0 ? lerp(0.9, 4.3, altitudeFactor) * daylight : 0.02,
    ambientIntensity: daylight > 0 ? lerp(0.18, 0.58, altitudeFactor) : 0.12,
    fillIntensity: daylight > 0 ? lerp(0.14, 0.38, altitudeFactor) : 0.05,
    shadowIntensity: daylight > 0 ? lerp(0.88, 0.38, altitudeFactor) : 0,
    color: daylight > 0 ? lerpHexColor('#fff6dc', '#ffb46b', warmth) : '#94a3b8',
  }
}

export function getSunDirection(
  azimuthDeg: number,
  elevationDeg: number,
): [number, number, number] {
  const azimuth = degToRad(azimuthDeg)
  const elevation = degToRad(elevationDeg)
  const horizontal = Math.cos(elevation)

  // World convention: north is -Z, east is +X.
  return [Math.sin(azimuth) * horizontal, Math.sin(elevation), -Math.cos(azimuth) * horizontal]
}

export function getSunPositionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
  radius: number,
): [number, number, number] {
  const [x, y, z] = getSunDirection(azimuthDeg, elevationDeg)
  return [x * radius, y * radius, z * radius]
}

export function getSunPositionForProgress(
  progress: number,
  radius: number,
): [number, number, number] {
  const { azimuthDeg, elevationDeg } = getSunAnglesForProgress(progress)
  return getSunPositionFromAngles(azimuthDeg, elevationDeg, radius)
}

export function getSunPosition(
  timeOfDay: SunTimeOfDay | string | null | undefined,
  radius: number,
  progress?: number | null,
): [number, number, number] {
  return getSunPositionForProgress(resolveSunProgress(timeOfDay, progress), radius)
}

export function getSunPathPosition(progress: number, radius: number): [number, number, number] {
  return getSunPositionForProgress(progress, radius)
}
