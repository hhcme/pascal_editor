import type { GuideNode } from '@pascal-app/core'

type GuideCalibration = NonNullable<GuideNode['calibration']>

/**
 * Calibration points are captured in the guide's local coordinates before its scale changes.
 * Convert persisted points to the calibrated guide scale so they remain anchored to the same
 * image pixels after the guide is resized.
 */
export function getGuideCalibrationDisplayPoints(
  calibration: GuideCalibration | null | undefined,
): GuideCalibration['points'] | [] {
  if (!calibration) {
    return []
  }

  const pointScale = calibration.distance / calibration.measuredDistance

  return calibration.points.map(([x, y]) => [
    x * pointScale,
    y * pointScale,
  ]) as GuideCalibration['points']
}
