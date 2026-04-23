export type WeatherMode = 'clear' | 'rain' | 'snow' | 'thunder'

export type WeatherState = {
  mode: WeatherMode
  intensity: number
  particleSize: number
  windDirectionDeg: number
  windSpeed: number
  soundEnabled: boolean
}

export type WeatherOption = {
  id: WeatherMode
  label: string
  intensity: number
}

export const DEFAULT_WEATHER_STATE: WeatherState = {
  mode: 'clear',
  intensity: 0.72,
  particleSize: 0.5,
  windDirectionDeg: 112,
  windSpeed: 0.34,
  soundEnabled: false,
}

export const WEATHER_OPTIONS: WeatherOption[] = [
  { id: 'clear', label: 'Clear', intensity: 0 },
  { id: 'rain', label: 'Rain', intensity: 0.7 },
  { id: 'snow', label: 'Snow', intensity: 0.64 },
  { id: 'thunder', label: 'Thunder', intensity: 0.92 },
]

const WEATHER_OPTIONS_BY_ID = WEATHER_OPTIONS.reduce(
  (acc, option) => {
    acc[option.id] = option
    return acc
  },
  {} as Record<WeatherMode, WeatherOption>,
)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function clampWeatherIntensity(intensity: number) {
  return Number.isFinite(intensity) ? clamp(intensity, 0, 1) : DEFAULT_WEATHER_STATE.intensity
}

export function clampWeatherParticleSize(size: number) {
  return Number.isFinite(size) ? clamp(size, 0, 1) : DEFAULT_WEATHER_STATE.particleSize
}

export function clampWeatherWindSpeed(speed: number) {
  return Number.isFinite(speed) ? clamp(speed, 0, 1) : DEFAULT_WEATHER_STATE.windSpeed
}

export function normalizeWeatherWindDirection(directionDeg: number) {
  if (!Number.isFinite(directionDeg)) return DEFAULT_WEATHER_STATE.windDirectionDeg

  return ((directionDeg % 360) + 360) % 360
}

export function resolveWeatherOption(mode: WeatherMode | string | null | undefined) {
  if (mode && mode in WEATHER_OPTIONS_BY_ID) {
    return WEATHER_OPTIONS_BY_ID[mode as WeatherMode]
  }

  return WEATHER_OPTIONS_BY_ID[DEFAULT_WEATHER_STATE.mode]
}

export function resolveWeatherState(state: Partial<WeatherState> | null | undefined): WeatherState {
  const option = resolveWeatherOption(state?.mode)

  return {
    ...DEFAULT_WEATHER_STATE,
    ...state,
    mode: option.id,
    intensity:
      option.id === 'clear' ? 0 : clampWeatherIntensity(state?.intensity ?? option.intensity),
    particleSize: clampWeatherParticleSize(
      state?.particleSize ?? DEFAULT_WEATHER_STATE.particleSize,
    ),
    windDirectionDeg: normalizeWeatherWindDirection(
      state?.windDirectionDeg ?? DEFAULT_WEATHER_STATE.windDirectionDeg,
    ),
    windSpeed: clampWeatherWindSpeed(state?.windSpeed ?? DEFAULT_WEATHER_STATE.windSpeed),
    soundEnabled: state?.soundEnabled ?? DEFAULT_WEATHER_STATE.soundEnabled,
  }
}
