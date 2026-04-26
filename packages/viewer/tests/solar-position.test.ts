import { describe, expect, test } from 'bun:test'
import { getSolarPathForLocation, getSolarPositionForLocation } from '../src/lib/solar-position'
import { normalizeSiteSolarLocation } from '../src/lib/site-solar'

describe('site solar location', () => {
  test('requires latitude, longitude and timezone to resolve', () => {
    expect(
      normalizeSiteSolarLocation({
        latitude: 31.2304,
        longitude: 121.4737,
      }),
    ).toBeNull()

    expect(
      normalizeSiteSolarLocation({
        latitude: 31.2304,
        longitude: 121.4737,
        timezone: 'Asia/Shanghai',
      }),
    ).toEqual({
      latitude: 31.2304,
      longitude: 121.4737,
      timezone: 'Asia/Shanghai',
    })
  })
})

describe('solar position', () => {
  const shanghai = {
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
  }

  test('june solstice noon is higher than december solstice noon in shanghai', () => {
    const juneNoon = getSolarPositionForLocation(shanghai, '2026-06-21', 12 * 60)
    const decemberNoon = getSolarPositionForLocation(shanghai, '2026-12-21', 12 * 60)

    expect(juneNoon).not.toBeNull()
    expect(decemberNoon).not.toBeNull()
    expect(juneNoon?.isAboveHorizon).toBe(true)
    expect(decemberNoon?.isAboveHorizon).toBe(true)
    expect(juneNoon?.elevationDeg ?? 0).toBeGreaterThan(decemberNoon?.elevationDeg ?? 0)
  })

  test('solar path samples span the local day in ascending order', () => {
    const samples = getSolarPathForLocation(shanghai, '2026-03-20', 120)

    expect(samples.length).toBeGreaterThan(2)
    expect(samples[0]?.minutesOfDay).toBe(0)
    expect(samples[samples.length - 1]?.minutesOfDay).toBe(23 * 60 + 59)
    expect(samples.some((sample) => sample.isAboveHorizon)).toBe(true)
    expect(
      samples.every(
        (sample, index) => index === 0 || sample.minutesOfDay > (samples[index - 1]?.minutesOfDay ?? -1),
      ),
    ).toBe(true)
  })
})
