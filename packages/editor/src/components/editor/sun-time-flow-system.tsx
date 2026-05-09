'use client'

import { type SiteNode, useScene } from '@pascal-app/core'
import {
  getDefaultSunStudyDate,
  getZonedSolarClockTime,
  resolveSiteSolarLocation,
  resolveSunMinutesOfDay,
  resolveSunStudyDate,
  useViewer,
} from '@pascal-app/viewer'
import { useEffect, useRef } from 'react'

const SUN_DAY_CYCLE_DURATION_MS = 60_000
const SUN_DAY_MINUTES = 24 * 60

function useSiteNode() {
  return useScene((state) => {
    const rootId = state.rootNodeIds[0]
    const node = rootId ? state.nodes[rootId] : null
    if (node?.type === 'site') return node as SiteNode

    const fallbackSite = Object.values(state.nodes).find(
      (candidate): candidate is SiteNode => candidate.type === 'site',
    )

    return fallbackSite ?? null
  })
}

export function SunTimeFlowSystem() {
  const siteNode = useSiteNode()
  const sunStudy = useViewer((state) => state.sunStudy)
  const setSunStudy = useViewer((state) => state.setSunStudy)
  const cycleStartRef = useRef<{ startedAt: number; minutesOfDay: number } | null>(null)
  const solarLocation = resolveSiteSolarLocation(siteNode)
  const solarTimeZone = solarLocation?.timezone ?? null
  const timeFlowMode = sunStudy.timeFlowMode ?? (sunStudy.followClock ? 'clock' : 'manual')
  const resolvedDate = resolveSunStudyDate(sunStudy.date) ?? getDefaultSunStudyDate()
  const resolvedMinutesOfDay = resolveSunMinutesOfDay(sunStudy.minutesOfDay)

  useEffect(() => {
    if (!(sunStudy.enabled && sunStudy.mode === 'real' && timeFlowMode === 'clock' && solarTimeZone)) {
      return
    }

    const syncToClock = () => {
      const clockTime = getZonedSolarClockTime(solarTimeZone)
      if (!clockTime) return

      const current = useViewer.getState().sunStudy
      if (
        current.mode === 'real' &&
        current.timeFlowMode === 'clock' &&
        current.date === clockTime.date &&
        resolveSunMinutesOfDay(current.minutesOfDay) === clockTime.minutesOfDay
      ) {
        return
      }

      setSunStudy({
        enabled: true,
        mode: 'real',
        date: clockTime.date,
        minutesOfDay: clockTime.minutesOfDay,
        followClock: true,
        timeFlowMode: 'clock',
      })
    }

    syncToClock()
    const intervalId = window.setInterval(syncToClock, 30_000)

    return () => window.clearInterval(intervalId)
  }, [setSunStudy, solarTimeZone, sunStudy.enabled, sunStudy.mode, timeFlowMode])

  useEffect(() => {
    if (!(sunStudy.enabled && sunStudy.mode === 'real' && timeFlowMode === 'day-cycle' && solarTimeZone)) {
      cycleStartRef.current = null
      return
    }

    cycleStartRef.current = {
      startedAt: performance.now(),
      minutesOfDay: resolvedMinutesOfDay,
    }

    const intervalId = window.setInterval(() => {
      const cycle = cycleStartRef.current
      if (!cycle) return

      const elapsedRatio =
        ((performance.now() - cycle.startedAt) % SUN_DAY_CYCLE_DURATION_MS) /
        SUN_DAY_CYCLE_DURATION_MS
      const nextMinutes = Math.floor(
        (cycle.minutesOfDay + elapsedRatio * SUN_DAY_MINUTES) % SUN_DAY_MINUTES,
      )

      setSunStudy({
        enabled: true,
        mode: 'real',
        date: resolvedDate,
        minutesOfDay: nextMinutes,
        followClock: false,
        timeFlowMode: 'day-cycle',
      })
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [
    resolvedDate,
    setSunStudy,
    solarTimeZone,
    sunStudy.enabled,
    sunStudy.mode,
    timeFlowMode,
  ])

  return null
}
