'use client'

import { emitter, type SiteNode, useScene } from '@pascal-app/core'
import {
  formatSunMinutesOfDay,
  getDefaultSunStudyDate,
  getSolarPositionForLocation,
  resolveSiteSolarLocation,
  resolveSunMinutesOfDay,
  resolveSunStudyDate,
  SUN_TIME_OPTIONS,
  WEATHER_OPTIONS,
  type SunTimeOfDay,
  type WeatherMode,
  useViewer,
} from '@pascal-app/viewer'
import {
  ArrowLeftRight,
  ArrowUpDown,
  Box,
  Camera,
  Check,
  ChevronsLeft,
  ChevronsRight,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  DraftingCompass,
  Grid3X3,
  Ruler,
  Square,
  SunMedium,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useMemo, type ComponentType } from 'react'
import { cn } from '../../lib/utils'
import useEditor from '../../store/use-editor'
import type { GridSnapStep, MeasurementMode, ViewMode } from '../../store/use-editor'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './primitives/dropdown-menu'
import { Input } from './primitives/input'
import { Slider } from './primitives/slider'
import { useSidebarStore } from './primitives/sidebar'
import { Switch } from './primitives/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip'

// ── Shared styles ───────────────────────────────────────────────────────────

/** Compact glass rail for canvas HUD controls. */
const TOOLBAR_CONTAINER = 'editor-toolbar-group'

/** Ghost button inside a HUD rail. */
const TOOLBAR_BTN =
  'editor-icon-button flex min-h-9 min-w-9 items-center justify-center px-2 text-muted-foreground transition-colors'

function ToolbarIcon({
  src,
  alt = '',
  className = 'h-4 w-4',
}: {
  src: string
  alt?: string
  className?: string
}) {
  return <img alt={alt} className={cn('shrink-0 object-contain', className)} src={src} />
}

// ── View mode segmented control ─────────────────────────────────────────────

const VIEW_MODES: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    id: '3d',
    label: '3D',
    icon: <img alt="" className="h-3.5 w-3.5 object-contain" src="/icons/building.png" />,
  },
  {
    id: '2d',
    label: '2D',
    icon: <img alt="" className="h-3.5 w-3.5 object-contain" src="/icons/blueprint.png" />,
  },
  {
    id: 'split',
    label: 'Split',
    icon: <ToolbarIcon className="h-3.5 w-3.5" src="/icons/split-view.svg" />,
  },
  {
    id: 'tri-view',
    label: '三视图',
    icon: <ToolbarIcon className="h-3.5 w-3.5" src="/icons/camera-orthographic.svg" />,
  },
]

function ViewModeControl() {
  const viewMode = useEditor((s) => s.viewMode)
  const setViewMode = useEditor((s) => s.setViewMode)
  const setCameraMode = useViewer((s) => s.setCameraMode)

  return (
    <div className={TOOLBAR_CONTAINER}>
      {VIEW_MODES.map((mode) => {
        const isActive = viewMode === mode.id
        return (
          <button
            className={cn(
              'flex min-h-9 items-center justify-center gap-1.5 px-3 font-semibold text-xs transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            key={mode.id}
            onClick={() => {
              setViewMode(mode.id)
              if (mode.id === 'tri-view') {
                setCameraMode('perspective')
              }
            }}
            type="button"
          >
            {mode.icon}
            <span>{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Collapse sidebar button ─────────────────────────────────────────────────

function CollapseSidebarButton() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const setIsCollapsed = useSidebarStore((s) => s.setIsCollapsed)

  const toggle = useCallback(() => {
    setIsCollapsed(!isCollapsed)
  }, [isCollapsed, setIsCollapsed])

  return (
    <div className={TOOLBAR_CONTAINER}>
      <button
        className={TOOLBAR_BTN}
        onClick={toggle}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
      >
        {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Right toolbar buttons ───────────────────────────────────────────────────

function WalkthroughButton() {
  const isFirstPersonMode = useEditor((s) => s.isFirstPersonMode)
  const setFirstPersonMode = useEditor((s) => s.setFirstPersonMode)

  const toggle = () => {
    setFirstPersonMode(!isFirstPersonMode)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            isFirstPersonMode && 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20',
          )}
          onClick={toggle}
          type="button"
        >
          <ToolbarIcon src="/icons/walkthrough.svg" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Walkthrough</TooltipContent>
    </Tooltip>
  )
}

function ViewpointCameraButton() {
  const isPlacementMode = useEditor((s) => s.isViewpointPlacementMode)
  const setViewpointPlacementMode = useEditor((s) => s.setViewpointPlacementMode)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            isPlacementMode && 'bg-primary/10 text-primary hover:bg-primary/15',
          )}
          onClick={() => setViewpointPlacementMode(!isPlacementMode)}
          type="button"
        >
          <Camera className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">取景相机</TooltipContent>
    </Tooltip>
  )
}

const measurementModeLabels: Record<MeasurementMode, string> = {
  distance: '距离',
  area: '面积',
  volume: '体积',
  clearance: '净空',
  angle: '角度',
  perimeter: '周长',
  grid: '轴网',
}

const measurementModeIcons: Record<MeasurementMode, ComponentType<{ className?: string }>> = {
  distance: Ruler,
  area: Square,
  volume: Box,
  clearance: ArrowUpDown,
  angle: DraftingCompass,
  perimeter: ArrowLeftRight,
  grid: Grid3X3,
}

function MeasurementControl() {
  const measurementMode = useEditor((s) => s.measurementMode)
  const setMeasurementMode = useEditor((s) => s.setMeasurementMode)
  const isFirstPersonMode = useEditor((s) => s.isFirstPersonMode)

  if (isFirstPersonMode) return null

  const ActiveIcon = measurementMode ? measurementModeIcons[measurementMode] : Ruler

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                TOOLBAR_BTN,
                'w-auto gap-1.5 px-2.5',
                measurementMode && 'bg-primary/10 text-primary',
              )}
              type="button"
            >
              <ActiveIcon className="h-4 w-4" />
              <span className="font-medium text-xs">
                {measurementMode ? measurementModeLabels[measurementMode] : '测量'}
              </span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {measurementMode ? `3D 测量: ${measurementModeLabels[measurementMode]}` : '3D 测量'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" className="w-40" side="bottom">
        <DropdownMenuLabel>3D 测量</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => setMeasurementMode(value as MeasurementMode)}
          value={measurementMode ?? ''}
        >
          {Object.entries(measurementModeLabels).map(([mode, label]) => {
            const Icon = measurementModeIcons[mode as MeasurementMode]
            return (
              <DropdownMenuRadioItem key={mode} value={mode}>
                <span className="mr-2 flex h-4 w-4 items-center justify-center">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        {measurementMode ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setMeasurementMode(null)}>关闭测量</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UnitToggle() {
  const unit = useViewer((s) => s.unit)
  const setUnit = useViewer((s) => s.setUnit)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(TOOLBAR_BTN, 'w-auto gap-1.5 px-2.5')}
          onClick={() => setUnit(unit === 'metric' ? 'imperial' : 'metric')}
          type="button"
        >
          <ToolbarIcon src="/icons/unit-ruler.svg" />
          <span className="font-semibold text-[10px]">{unit === 'metric' ? 'm' : 'ft'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {unit === 'metric' ? 'Metric (m)' : 'Imperial (ft)'}
      </TooltipContent>
    </Tooltip>
  )
}

function ThemeToggle() {
  const theme = useViewer((s) => s.theme)
  const setTheme = useViewer((s) => s.setTheme)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={TOOLBAR_BTN}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          type="button"
        >
          <ToolbarIcon src={theme === 'dark' ? '/icons/theme-dark.svg' : '/icons/theme-light.svg'} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{theme === 'dark' ? 'Dark' : 'Light'}</TooltipContent>
    </Tooltip>
  )
}

const QUICK_SUN_DATES = [
  { dateKey: 'spring-equinox', label: '春分', month: 3, day: 20 },
  { dateKey: 'june-solstice', label: '夏至', month: 6, day: 21 },
  { dateKey: 'autumn-equinox', label: '秋分', month: 9, day: 22 },
  { dateKey: 'december-solstice', label: '冬至', month: 12, day: 21 },
] as const

function formatDatePart(value: number) {
  return value.toString().padStart(2, '0')
}

function getSunStudyYear(date: string | null | undefined) {
  const match = /^(\d{4})-/.exec(date ?? '')
  return match ? Number.parseInt(match[1] ?? '', 10) : new Date().getFullYear()
}

function getQuickSunStudyDate(
  key: (typeof QUICK_SUN_DATES)[number]['dateKey'],
  currentDate: string | null | undefined,
) {
  const option = QUICK_SUN_DATES.find((entry) => entry.dateKey === key)
  if (!option) return getDefaultSunStudyDate()

  const year = getSunStudyYear(currentDate)
  return `${year}-${formatDatePart(option.month)}-${formatDatePart(option.day)}`
}

function parseTimeInputValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null

  const hours = Number.parseInt(match[1] ?? '', 10)
  const minutes = Number.parseInt(match[2] ?? '', 10)
  if (!(Number.isInteger(hours) && Number.isInteger(minutes))) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return hours * 60 + minutes
}

function OrientationSunControl() {
  const siteNode = useScene((state) => {
    const rootId = state.rootNodeIds[0]
    const node = rootId ? state.nodes[rootId] : null
    return node?.type === 'site' ? (node as SiteNode) : null
  })
  const showCompass = useViewer((s) => s.showCompass)
  const setShowCompass = useViewer((s) => s.setShowCompass)
  const sunStudy = useViewer((s) => s.sunStudy)
  const setSunStudyEnabled = useViewer((s) => s.setSunStudyEnabled)
  const setSunStudyMode = useViewer((s) => s.setSunStudyMode)
  const setSunTimeOfDay = useViewer((s) => s.setSunTimeOfDay)
  const setSunStudyDate = useViewer((s) => s.setSunStudyDate)
  const setSunMinutesOfDay = useViewer((s) => s.setSunMinutesOfDay)
  const setPhase = useEditor((s) => s.setPhase)
  const isActive = showCompass || sunStudy.enabled
  const solarLocation = resolveSiteSolarLocation(siteNode)
  const hasSolarLocation = solarLocation !== null
  const isRealSun = sunStudy.mode === 'real'
  const resolvedDate = resolveSunStudyDate(sunStudy.date) ?? getDefaultSunStudyDate()
  const resolvedMinutesOfDay = resolveSunMinutesOfDay(sunStudy.minutesOfDay)
  const realSunSummary = useMemo(() => {
    if (!(solarLocation && isRealSun)) return null

    return getSolarPositionForLocation(solarLocation, resolvedDate, resolvedMinutesOfDay)
  }, [isRealSun, resolvedDate, resolvedMinutesOfDay, solarLocation])

  const openSiteSolarSettings = useCallback(() => {
    setPhase('site')
    emitter.emit('site:open-solar-settings' as any, undefined)
  }, [setPhase])

  const handleRealSunCheckedChange = useCallback(
    (checked: boolean) => {
      if (checked !== true) {
        setSunStudyMode('preset')
        return
      }

      if (!hasSolarLocation) {
        openSiteSolarSettings()
        return
      }

      setSunStudyEnabled(true)
      setSunStudyMode('real')
    },
    [hasSolarLocation, openSiteSolarSettings, setSunStudyEnabled, setSunStudyMode],
  )

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(TOOLBAR_BTN, isActive && 'bg-primary/10 text-primary')}
              type="button"
            >
              {sunStudy.enabled ? <SunMedium className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">方位与日照</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" className="w-72" side="bottom">
        <DropdownMenuCheckboxItem
          checked={showCompass}
          onCheckedChange={(checked) => setShowCompass(checked === true)}
        >
          方位标识
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={sunStudy.enabled}
          onCheckedChange={(checked) => setSunStudyEnabled(checked === true)}
        >
          日照阴影
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <div
          className="space-y-3 px-2 py-2"
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className={cn(
              'flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 transition-colors',
              !hasSolarLocation &&
                !isRealSun &&
                'cursor-pointer ring-1 ring-amber-300/45 hover:bg-accent/55',
            )}
            onClick={!hasSolarLocation && !isRealSun ? openSiteSolarSettings : undefined}
          >
            <div className="min-w-0">
              <div className="font-medium text-xs text-foreground">真实太阳</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {hasSolarLocation
                  ? solarLocation?.timezone
                  : '点击后前往“场地规则 > 位置与日照”填写经纬度和时区。'}
              </div>
            </div>
            <Switch
              checked={isRealSun}
              onCheckedChange={handleRealSunCheckedChange}
            />
          </div>

          {!hasSolarLocation ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1">
                真实太阳需要先填写场地纬度、经度和有效时区。
              </span>
              <button
                className="shrink-0 rounded-md border border-border/60 px-2 py-1 text-foreground transition-colors hover:bg-accent/55"
                onClick={openSiteSolarSettings}
                type="button"
              >
                去设置
              </button>
            </div>
          ) : null}

          {isRealSun ? (
            hasSolarLocation ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">日期</span>
                    <Input
                      className="h-8 text-xs"
                      onChange={(event) => setSunStudyDate(event.target.value)}
                      type="date"
                      value={resolvedDate}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">时间</span>
                    <Input
                      className="h-8 text-xs"
                      onChange={(event) => {
                        const minutesOfDay = parseTimeInputValue(event.target.value)
                        if (minutesOfDay !== null) setSunMinutesOfDay(minutesOfDay)
                      }}
                      type="time"
                      value={formatSunMinutesOfDay(resolvedMinutesOfDay)}
                    />
                  </label>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-muted-foreground text-xs">
                    <span>日内时间</span>
                    <span>{formatSunMinutesOfDay(resolvedMinutesOfDay)}</span>
                  </div>
                  <Slider
                    max={23 * 60 + 59}
                    min={0}
                    onValueChange={(value) => setSunMinutesOfDay(value[0] ?? resolvedMinutesOfDay)}
                    step={1}
                    value={[resolvedMinutesOfDay]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {QUICK_SUN_DATES.map((option) => {
                    const nextDate = getQuickSunStudyDate(option.dateKey, resolvedDate)
                    const isSelected = resolvedDate === nextDate

                    return (
                      <button
                        className={cn(
                          'rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors',
                          isSelected
                            ? 'border-primary/35 bg-primary/10 text-primary'
                            : 'border-border/55 bg-card text-muted-foreground hover:bg-accent/55 hover:text-foreground',
                        )}
                        key={option.dateKey}
                        onClick={() => setSunStudyDate(nextDate)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {realSunSummary ? (
                  <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                    方位角 {realSunSummary.azimuthDeg.toFixed(1)}°
                    {' · '}
                    高度角 {realSunSummary.elevationDeg.toFixed(1)}°
                    {realSunSummary.isAboveHorizon ? '' : ' · 地平线下'}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
                <span className="min-w-0 flex-1">
                  真实太阳需要先填写场地纬度、经度和有效时区。
                </span>
                <button
                  className="shrink-0 rounded-md border border-border/60 px-2 py-1 text-foreground transition-colors hover:bg-accent/55"
                  onClick={openSiteSolarSettings}
                  type="button"
                >
                  去设置
                </button>
              </div>
            )
          ) : (
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">太阳位置</div>
              <div className="grid grid-cols-2 gap-1">
                {SUN_TIME_OPTIONS.map((option) => {
                  const isSelected = sunStudy.timeOfDay === option.id

                  return (
                    <button
                      className={cn(
                        'rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                        isSelected
                          ? 'border-primary/35 bg-primary/10 text-primary'
                          : 'border-border/55 bg-card text-muted-foreground hover:bg-accent/55 hover:text-foreground',
                      )}
                      key={option.id}
                      onClick={() => setSunTimeOfDay(option.id as SunTimeOfDay)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WeatherIcon({ mode }: { mode: WeatherMode }) {
  switch (mode) {
    case 'rain':
      return <CloudRain className="h-4 w-4" />
    case 'snow':
      return <CloudSnow className="h-4 w-4" />
    case 'thunder':
      return <CloudLightning className="h-4 w-4" />
    case 'clear':
      return <CloudSun className="h-4 w-4" />
  }
}

function WeatherControl() {
  const weather = useViewer((s) => s.weather)
  const setWeatherMode = useViewer((s) => s.setWeatherMode)
  const setWeatherIntensity = useViewer((s) => s.setWeatherIntensity)
  const setWeatherParticleSize = useViewer((s) => s.setWeatherParticleSize)
  const setWeatherWindDirection = useViewer((s) => s.setWeatherWindDirection)
  const setWeatherWindSpeed = useViewer((s) => s.setWeatherWindSpeed)
  const setWeatherSoundEnabled = useViewer((s) => s.setWeatherSoundEnabled)
  const mode = weather?.mode ?? 'clear'
  const intensity = weather?.intensity ?? 0
  const particleSize = weather?.particleSize ?? 0.5
  const windDirectionDeg = weather?.windDirectionDeg ?? 112
  const windSpeed = weather?.windSpeed ?? 0.34
  const soundEnabled = weather?.soundEnabled ?? false
  const isActive = mode !== 'clear'

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(TOOLBAR_BTN, isActive && 'bg-primary/10 text-primary')}
              type="button"
            >
              <WeatherIcon mode={mode} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Weather</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" className="w-64" side="bottom">
        <DropdownMenuLabel>Weather</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => setWeatherMode(value as WeatherMode)}
          value={mode}
        >
          {WEATHER_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              <span className="mr-2 flex h-4 w-4 items-center justify-center">
                <WeatherIcon mode={option.id} />
              </span>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <div
          className="space-y-3 px-2 py-2"
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>Strength</span>
              <span>{Math.round(intensity * 100)}%</span>
            </div>
            <Slider
              disabled={mode === 'clear'}
              max={1}
              min={0}
              onValueChange={(value) => setWeatherIntensity(value[0] ?? intensity)}
              step={0.01}
              value={[intensity]}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>Particle size</span>
              <span>{Math.round(particleSize * 100)}%</span>
            </div>
            <Slider
              disabled={mode === 'clear'}
              max={1}
              min={0}
              onValueChange={(value) => setWeatherParticleSize(value[0] ?? particleSize)}
              step={0.01}
              value={[particleSize]}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>Wind</span>
              <span>{Math.round(windSpeed * 100)}%</span>
            </div>
            <Slider
              disabled={mode === 'clear'}
              max={1}
              min={0}
              onValueChange={(value) => setWeatherWindSpeed(value[0] ?? windSpeed)}
              step={0.01}
              value={[windSpeed]}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>Direction</span>
              <span>{Math.round(windDirectionDeg)}°</span>
            </div>
            <Slider
              disabled={mode === 'clear'}
              max={359}
              min={0}
              onValueChange={(value) => setWeatherWindDirection(value[0] ?? windDirectionDeg)}
              step={1}
              value={[windDirectionDeg]}
            />
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span>Sound</span>
            </div>
            <Switch
              checked={soundEnabled}
              disabled={mode === 'clear'}
              onCheckedChange={(checked) => setWeatherSoundEnabled(checked === true)}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Level mode toggle ───────────────────────────────────────────────────────

const levelModeOrder = ['stacked', 'exploded', 'solo'] as const
const levelModeLabels: Record<string, string> = {
  manual: 'Stack',
  stacked: 'Stack',
  exploded: 'Exploded',
  solo: 'Solo',
}
const levelModeIcons: Record<string, string> = {
  manual: '/icons/level-stack.svg',
  stacked: '/icons/level-stack.svg',
  exploded: '/icons/level-exploded.svg',
  solo: '/icons/level-solo.svg',
}

const gridSnapOrder: GridSnapStep[] = [0.5, 0.25, 0.1, 0.05]
const gridSnapLabels: Record<GridSnapStep, string> = {
  0.5: '0.50',
  0.25: '0.25',
  0.1: '0.10',
  0.05: '0.05',
}

function formatGridSnapStep(step: GridSnapStep): string {
  return gridSnapLabels[step]
}

function LevelModeToggle() {
  const levelMode = useViewer((s) => s.levelMode)
  const setLevelMode = useViewer((s) => s.setLevelMode)

  const cycle = () => {
    if (levelMode === 'manual') {
      setLevelMode('stacked')
      return
    }
    const idx = levelModeOrder.indexOf(levelMode as (typeof levelModeOrder)[number])
    const next = levelModeOrder[(idx + 1) % levelModeOrder.length]
    if (next) setLevelMode(next)
  }

  const isDefault = levelMode === 'stacked' || levelMode === 'manual'
  const icon = levelModeIcons[levelMode] ?? levelModeIcons.stacked!

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            'w-auto gap-1.5 px-2.5',
            !isDefault && 'bg-primary/10 text-primary',
          )}
          onClick={cycle}
          type="button"
        >
          <ToolbarIcon src={icon} />
          <span className="font-medium text-xs">{levelModeLabels[levelMode] ?? 'Stack'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Levels: {levelMode === 'manual' ? 'Manual' : levelModeLabels[levelMode]}
      </TooltipContent>
    </Tooltip>
  )
}

function GridSnapToggle() {
  const gridSnapStep = useEditor((s) => s.gridSnapStep)
  const setGridSnapStep = useEditor((s) => s.setGridSnapStep)

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button className={cn(TOOLBAR_BTN, 'w-auto gap-1.5 px-2.5')} type="button">
              <ToolbarIcon src="/icons/grid-snap.svg" />
              <span className="font-medium text-xs">{formatGridSnapStep(gridSnapStep)}</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Grid snap: {formatGridSnapStep(gridSnapStep)}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" side="bottom">
        {gridSnapOrder.map((step) => {
          const isActive = step === gridSnapStep
          return (
            <DropdownMenuItem key={step} onSelect={() => setGridSnapStep(step)}>
              <span className="flex min-w-12 items-center justify-between gap-3">
                <span>{formatGridSnapStep(step)}</span>
                {isActive ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Wall mode toggle ────────────────────────────────────────────────────────

const wallModeOrder = ['cutaway', 'up', 'down'] as const
const wallModeConfig: Record<string, { icon: string; label: string }> = {
  up: { icon: '/icons/room.png', label: 'Full height' },
  cutaway: { icon: '/icons/wallcut.png', label: 'Cutaway' },
  down: { icon: '/icons/walllow.png', label: 'Low' },
}

function WallModeToggle() {
  const wallMode = useViewer((s) => s.wallMode)
  const setWallMode = useViewer((s) => s.setWallMode)

  const cycle = () => {
    const idx = wallModeOrder.indexOf(wallMode as (typeof wallModeOrder)[number])
    const next = wallModeOrder[(idx + 1) % wallModeOrder.length]
    if (next) setWallMode(next)
  }

  const config = wallModeConfig[wallMode] ?? wallModeConfig.cutaway!

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            'w-auto gap-1.5 px-2.5',
            wallMode !== 'cutaway'
              ? 'bg-primary/10 text-primary'
              : 'opacity-70 grayscale hover:opacity-100 hover:grayscale-0',
          )}
          onClick={cycle}
          type="button"
        >
          <img alt={config.label} className="h-4 w-4 object-contain" src={config.icon} />
          <span className="font-medium text-xs">{config.label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Walls: {config.label}</TooltipContent>
    </Tooltip>
  )
}

// ── View direction buttons ─────────────────────────────────────────────────

type CameraViewDirection = 'front' | 'left' | 'right' | 'back' | 'top' | 'bottom'

const viewDirectionButtons: Array<{
  direction: CameraViewDirection
  label: string
  tooltip: string
}> = [
  { direction: 'front', label: '正', tooltip: '正视图' },
  { direction: 'left', label: '左', tooltip: '左视图' },
  { direction: 'right', label: '右', tooltip: '右视图' },
  { direction: 'back', label: '后', tooltip: '后视图' },
  { direction: 'top', label: '上', tooltip: '俯视图' },
  { direction: 'bottom', label: '下', tooltip: '仰视图' },
]

const viewDirectionEmitter = emitter as unknown as {
  emit: (
    type: 'camera-controls:view-direction',
    event: { direction: CameraViewDirection },
  ) => void
}

function ViewDirectionButtons() {
  return (
    <>
      {viewDirectionButtons.map((button) => (
        <Tooltip key={button.direction}>
          <TooltipTrigger asChild>
            <button
              aria-label={button.tooltip}
              className={cn(TOOLBAR_BTN, 'min-w-8 px-2 font-semibold text-[11px]')}
              onClick={() =>
                viewDirectionEmitter.emit('camera-controls:view-direction', {
                  direction: button.direction,
                })
              }
              type="button"
            >
              {button.label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{button.tooltip}</TooltipContent>
        </Tooltip>
      ))}
    </>
  )
}

// ── Camera mode toggle ──────────────────────────────────────────────────────

function CameraModeToggle() {
  const cameraMode = useViewer((s) => s.cameraMode)
  const setCameraMode = useViewer((s) => s.setCameraMode)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            cameraMode === 'orthographic' && 'bg-primary/10 text-primary',
          )}
          onClick={() =>
            setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective')
          }
          type="button"
        >
          <ToolbarIcon
            src={
              cameraMode === 'perspective'
                ? '/icons/camera-perspective.svg'
                : '/icons/camera-orthographic.svg'
            }
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {cameraMode === 'perspective' ? 'Perspective' : 'Orthographic'}
      </TooltipContent>
    </Tooltip>
  )
}

function PreviewButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="editor-icon-button flex min-h-9 items-center gap-1.5 px-3 font-semibold text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => useEditor.getState().setPreviewMode(true)}
          type="button"
        >
          <ToolbarIcon src="/icons/preview.svg" />
          <span>Preview</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Preview mode</TooltipContent>
    </Tooltip>
  )
}

// ── Composed toolbar sections ───────────────────────────────────────────────

export function ViewerToolbarLeft() {
  return (
    <>
      <CollapseSidebarButton />
      <ViewModeControl />
    </>
  )
}

export function ViewerToolbarRight() {
  return (
    <div className={TOOLBAR_CONTAINER}>
      <LevelModeToggle />
      <WallModeToggle />
      <GridSnapToggle />
      <div className="my-2 w-px bg-border/70" />
      <UnitToggle />
      <ThemeToggle />
      <OrientationSunControl />
      <WeatherControl />
      <CameraModeToggle />
      <MeasurementControl />
      <ViewpointCameraButton />
      <ViewDirectionButtons />
      <div className="my-2 w-px bg-border/70" />
      <WalkthroughButton />
      <PreviewButton />
    </div>
  )
}
