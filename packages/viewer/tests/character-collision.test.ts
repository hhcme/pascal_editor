import { describe, expect, mock, test } from 'bun:test'

mock.module('@pascal-app/core', () => ({
  getScaledDimensions: () => ({ depth: 1, height: 1, width: 1 }),
}))

const { buildCharacterCollisionMap } = await import('../src/lib/character-collision')

const squarePolygon: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

describe('character collision water areas', () => {
  test('does not classify riverside green land as water from place-name characters', () => {
    const collision = buildCharacterCollisionMap({
      green: {
        id: 'green',
        name: '珠江北岸城市绿地',
        polygon: squarePolygon,
        position: [0, 0, 0],
        type: 'slab',
      },
    })

    expect(collision.waterAreas).toHaveLength(0)
  })

  test('classifies explicit water surface labels as water', () => {
    const collision = buildCharacterCollisionMap({
      water: {
        id: 'water',
        name: '珠江水面',
        polygon: squarePolygon,
        position: [0, 0.02, 0],
        type: 'slab',
      },
    })

    expect(collision.waterAreas).toHaveLength(1)
    expect(collision.waterAreas[0]?.surfaceY).toBeCloseTo(0.02, 6)
  })
})
