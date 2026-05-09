import { describe, expect, test } from 'bun:test'
import {
  createShooterRuntimeState,
  DEFAULT_SHOOTER_CONFIG,
  type ShooterMonster,
  shootShooterMonster,
  updateShooterRuntime,
} from '../src/components/editor/first-person-shooter-utils'

function sequenceRandom(values: number[]) {
  let index = 0
  return () => {
    const value = values[index] ?? values.at(-1) ?? 0
    index += 1
    return value
  }
}

function monster(overrides: Partial<ShooterMonster> = {}): ShooterMonster {
  return {
    id: 'monster-1',
    x: 0,
    y: 0.4,
    z: -8,
    health: DEFAULT_SHOOTER_CONFIG.monsterHealth,
    maxHealth: DEFAULT_SHOOTER_CONFIG.monsterHealth,
    radius: DEFAULT_SHOOTER_CONFIG.monsterRadius,
    speed: DEFAULT_SHOOTER_CONFIG.monsterSpeed,
    attackCooldown: 0,
    ...overrides,
  }
}

describe('first person shooter utils', () => {
  test('spawns monsters away from the player', () => {
    const state = createShooterRuntimeState(true)
    const next = updateShooterRuntime(
      state,
      { x: 2, y: 1.6, z: -3 },
      DEFAULT_SHOOTER_CONFIG.spawnInterval,
      sequenceRandom([0, 0.5, 0.5]),
    )

    expect(next.monsters).toHaveLength(1)
    const spawned = next.monsters[0]!
    const distance = Math.hypot(spawned.x - 2, spawned.z + 3)

    expect(distance).toBeGreaterThanOrEqual(DEFAULT_SHOOTER_CONFIG.spawnMinDistance)
    expect(distance).toBeLessThanOrEqual(DEFAULT_SHOOTER_CONFIG.spawnMaxDistance)
  })

  test('moves monsters toward the player over time', () => {
    const state = {
      ...createShooterRuntimeState(true),
      monsters: [monster({ x: 0, z: -10, speed: 2 })],
    }
    const next = updateShooterRuntime(state, { x: 0, y: 1.6, z: 0 }, 0.5)

    expect(next.monsters[0]!.z).toBeGreaterThan(-10)
    expect(next.monsters[0]!.z).toBeLessThan(-8.9)
  })

  test('damages the player in range and respects attack cooldown', () => {
    const state = {
      ...createShooterRuntimeState(true),
      monsters: [monster({ z: -0.8 })],
    }
    const firstHit = updateShooterRuntime(state, { x: 0, y: 1.6, z: 0 }, 0.1)
    const duringCooldown = updateShooterRuntime(firstHit, { x: 0, y: 1.6, z: 0 }, 0.5)
    const afterCooldown = updateShooterRuntime(duringCooldown, { x: 0, y: 1.6, z: 0 }, 0.6)

    expect(firstHit.health).toBe(85)
    expect(duringCooldown.health).toBe(85)
    expect(afterCooldown.health).toBe(70)
  })

  test('shoots the nearest monster on the center ray', () => {
    const state = {
      ...createShooterRuntimeState(true),
      monsters: [
        monster({ id: 'far', z: -12, health: 1 }),
        monster({ id: 'near', z: -6, health: 1 }),
      ],
    }
    const next = shootShooterMonster(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })

    expect(next.lastShotHit).toBe(true)
    expect(next.kills).toBe(1)
    expect(next.score).toBe(DEFAULT_SHOOTER_CONFIG.killScore)
    expect(next.lastScoreAward).toBe(DEFAULT_SHOOTER_CONFIG.killScore)
    expect(next.monsters.map((candidate) => candidate.id)).toEqual(['far'])
  })

  test('misses monsters outside the center ray', () => {
    const state = {
      ...createShooterRuntimeState(true),
      monsters: [monster({ x: 3, z: -6 })],
    }
    const next = shootShooterMonster(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })

    expect(next.lastShotHit).toBe(false)
    expect(next.lastScoreAward).toBe(0)
    expect(next.kills).toBe(0)
    expect(next.monsters).toHaveLength(1)
  })

  test('ends the game at zero health and prevents negative health', () => {
    const state = {
      ...createShooterRuntimeState(true),
      health: 10,
      monsters: [monster({ z: -0.8 })],
    }
    const gameOver = updateShooterRuntime(state, { x: 0, y: 1.6, z: 0 }, 0.1)
    const afterGameOver = updateShooterRuntime(gameOver, { x: 0, y: 1.6, z: 0 }, 2)

    expect(gameOver.health).toBe(0)
    expect(gameOver.gameOver).toBe(true)
    expect(afterGameOver.health).toBe(0)
    expect(afterGameOver.gameOver).toBe(true)
  })
})
