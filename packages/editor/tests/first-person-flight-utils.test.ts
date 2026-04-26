import { describe, expect, test } from 'bun:test'
import {
  buildBuildingFocusTarget,
  getYawPitchToWorldPoint,
  shouldAppendRouteSample,
} from '../src/components/editor/first-person-flight-utils'

describe('first person flight utils', () => {
  test('builds a stable building focus target from the footprint bounds', () => {
    const focusTarget = buildBuildingFocusTarget(
      [
        { x: -6, z: -4 },
        { x: 10, z: -2 },
        { x: 8, z: 5 },
        { x: -2, z: 6 },
      ],
      7.2,
    )

    expect(focusTarget).toEqual({
      x: 2,
      y: 4.176,
      z: 1,
    })
  })

  test('falls back to a reasonable mid-height when no roof height is available', () => {
    const focusTarget = buildBuildingFocusTarget(
      [
        { x: 0, z: 0 },
        { x: 4, z: 4 },
      ],
      null,
    )

    expect(focusTarget?.x).toBe(2)
    expect(focusTarget?.z).toBe(2)
    expect(focusTarget?.y).toBeCloseTo(1.74, 6)
  })

  test('computes yaw and pitch with the walkthrough camera conventions', () => {
    const orientation = getYawPitchToWorldPoint(
      { x: 0, y: 8, z: 0 },
      { x: 6, y: 2, z: -6 },
    )

    expect(orientation.yaw).toBeCloseTo(-Math.PI / 4, 6)
    expect(orientation.pitch).toBeCloseTo(-0.6154797, 6)
  })

  test('samples dragged route points only after the cursor moves far enough', () => {
    expect(shouldAppendRouteSample(null, { x: 0, z: 0 }, 0.8)).toBe(true)
    expect(shouldAppendRouteSample({ x: 0, z: 0 }, { x: 0.3, z: 0.4 }, 0.8)).toBe(false)
    expect(shouldAppendRouteSample({ x: 0, z: 0 }, { x: 0.6, z: 0.7 }, 0.8)).toBe(true)
  })
})
