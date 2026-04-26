import { describe, expect, test } from 'bun:test'
import { getGroundAlignmentOffsetY, getTransformedBoundsMinY } from '../src/lib/item-grounding'

describe('item grounding', () => {
  test('returns the lift needed to keep a floor item above the ground plane', () => {
    const offset = getGroundAlignmentOffsetY(
      {
        min: [-0.5, -0.2, -0.5],
        max: [0.5, 1.8, 0.5],
      },
      {
        offset: [0, 0, 0.02],
        rotation: [0, 0, 0],
        scale: [0.37, 0.37, 0.37],
      },
    )

    expect(offset).toBeCloseTo(0.074, 6)
  })

  test('scales the grounding lift with the rendered item scale', () => {
    const offset = getGroundAlignmentOffsetY(
      {
        min: [-0.4, -0.2, -0.4],
        max: [0.4, 0.8, 0.4],
      },
      {
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 3, 1],
      },
    )

    expect(offset).toBeCloseTo(0.6, 6)
  })

  test('accounts for corrective rotations when evaluating the lowest point', () => {
    const minY = getTransformedBoundsMinY(
      {
        min: [-1, -0.5, -0.25],
        max: [1, 0.5, 0.25],
      },
      {
        offset: [0, 0.3, 0],
        rotation: [0, 0, Math.PI / 2],
        scale: [1, 1, 1],
      },
    )

    expect(minY).toBeCloseTo(-0.7, 6)
    expect(
      getGroundAlignmentOffsetY(
        {
          min: [-1, -0.5, -0.25],
          max: [1, 0.5, 0.25],
        },
        {
          offset: [0, 0.3, 0],
          rotation: [0, 0, Math.PI / 2],
          scale: [1, 1, 1],
        },
      ),
    ).toBeCloseTo(0.7, 6)
  })

  test('does not move assets that are already on or above the ground plane', () => {
    expect(
      getGroundAlignmentOffsetY(
        {
          min: [-0.5, 0, -0.5],
          max: [0.5, 1, 0.5],
        },
        {
          offset: [0, 0.1, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ),
    ).toBe(0)
  })
})
