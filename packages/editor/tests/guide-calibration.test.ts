import { describe, expect, test } from 'bun:test'
import { getGuideCalibrationDisplayPoints } from '../src/lib/guide-calibration'

describe('guide calibration display points', () => {
  test('keeps persisted points anchored to the same image positions after calibration scales the guide', () => {
    const measuredDistance = 1.3115846117937409
    const distance = 2.799
    const calibratedScale = distance / measuredDistance
    const points = [
      [1.3402113914489746, -2.4103095531463623],
      [0.02869793213903904, -2.3966479301452637],
    ] as const

    const displayPoints = getGuideCalibrationDisplayPoints({
      kind: 'two-point',
      distance,
      measuredDistance,
      points,
      unit: 'm',
    })

    expect(displayPoints[0]?.[0]).toBeCloseTo(2.8599969839749213)
    expect(displayPoints[0]?.[1]).toBeCloseTo(-5.143747873137756)
    expect(displayPoints[1]?.[0]).toBeCloseTo(0.06124309349668919)
    expect(displayPoints[1]?.[1]).toBeCloseTo(-5.114592413422524)

    for (const index of [0, 1]) {
      expect(displayPoints[index]?.[0] / calibratedScale).toBeCloseTo(points[index]![0])
      expect(displayPoints[index]?.[1] / calibratedScale).toBeCloseTo(points[index]![1])
    }
  })

  test('returns no display points when the guide has not been calibrated', () => {
    expect(getGuideCalibrationDisplayPoints(undefined)).toEqual([])
  })
})
