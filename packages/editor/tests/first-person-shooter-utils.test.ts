import { describe, expect, test } from 'bun:test'
import {
  createShooterMonster,
  createShooterRuntimeState,
  createShooterSupply,
  DEFAULT_SHOOTER_CONFIG,
  getShooterStanceEyeHeightMultiplier,
  getShooterStanceSpeedMultiplier,
  reloadShooterWeapon,
  shouldShooterBlockFirstPersonNavigation,
  type ShooterMonster,
  shootShooterMonster,
  throwShooterGrenade,
  toShooterPublicState,
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
    kind: 'grunt',
    x: 0,
    y: 0.4,
    z: -8,
    health: DEFAULT_SHOOTER_CONFIG.monsterHealth,
    maxHealth: DEFAULT_SHOOTER_CONFIG.monsterHealth,
    radius: DEFAULT_SHOOTER_CONFIG.monsterRadius,
    speed: DEFAULT_SHOOTER_CONFIG.monsterSpeed,
    damage: DEFAULT_SHOOTER_CONFIG.monsterDamage,
    scoreValue: DEFAULT_SHOOTER_CONFIG.killScore,
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

  test('spawns runner and brute variants from the same monster factory', () => {
    const runner = createShooterMonster(
      'runner',
      { x: 0, y: 1.6, z: 0 },
      sequenceRandom([0, 0.5, 0, 0.5]),
    )
    const brute = createShooterMonster(
      'brute',
      { x: 0, y: 1.6, z: 0 },
      sequenceRandom([0, 0.5, 0.99, 0.5]),
    )

    expect(runner.kind).toBe('runner')
    expect(runner.speed).toBeGreaterThan(DEFAULT_SHOOTER_CONFIG.monsterSpeed)
    expect(brute.kind).toBe('brute')
    expect(brute.maxHealth).toBeGreaterThan(DEFAULT_SHOOTER_CONFIG.monsterHealth)
    expect(brute.scoreValue).toBeGreaterThan(DEFAULT_SHOOTER_CONFIG.killScore)
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

  test('brute monsters use their own attack damage', () => {
    const state = {
      ...createShooterRuntimeState(true),
      monsters: [monster({ kind: 'brute', z: -0.8, damage: 25 })],
    }
    const next = updateShooterRuntime(state, { x: 0, y: 1.6, z: 0 }, 0.1)

    expect(next.health).toBe(75)
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

  test('awards combo bonus for quick chained kills', () => {
    const firstState = {
      ...createShooterRuntimeState(true),
      monsters: [monster({ id: 'first', z: -6, health: 1 })],
    }
    const firstKill = shootShooterMonster(firstState, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })
    const cooledOnce = updateShooterRuntime(
      {
        ...firstKill,
        monsters: [monster({ id: 'second', z: -6, health: 1 })],
      },
      { x: 0, y: 1.6, z: 0 },
      DEFAULT_SHOOTER_CONFIG.weapons.pistol.fireCooldown,
    )
    const secondKill = shootShooterMonster(
      cooledOnce,
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 0, z: -1 },
    )
    const cooledTwice = updateShooterRuntime(
      {
        ...secondKill,
        monsters: [monster({ id: 'third', z: -6, health: 1 })],
      },
      { x: 0, y: 1.6, z: 0 },
      DEFAULT_SHOOTER_CONFIG.weapons.pistol.fireCooldown,
    )
    const thirdKill = shootShooterMonster(
      cooledTwice,
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 0, z: -1 },
    )

    expect(thirdKill.comboCount).toBe(3)
    expect(thirdKill.lastComboBonus).toBe(DEFAULT_SHOOTER_CONFIG.comboBonusStep)
    expect(thirdKill.lastScoreAward).toBe(
      DEFAULT_SHOOTER_CONFIG.killScore + DEFAULT_SHOOTER_CONFIG.comboBonusStep,
    )
    expect(thirdKill.score).toBe(
      DEFAULT_SHOOTER_CONFIG.killScore * 3 + DEFAULT_SHOOTER_CONFIG.comboBonusStep,
    )
  })

  test('resets combo after the combo window expires', () => {
    const state = {
      ...createShooterRuntimeState(true),
      comboCount: 3,
      comboTimer: 0.1,
    }
    const next = updateShooterRuntime(state, { x: 0, y: 1.6, z: 0 }, 0.2)

    expect(next.comboCount).toBe(0)
    expect(next.comboTimer).toBe(0)
  })

  test('sniper shoots monsters across a building-site scale distance', () => {
    const state = {
      ...createShooterRuntimeState(true),
      weapon: 'sniper' as const,
      monsters: [monster({ z: -72, health: 1 })],
    }
    const next = shootShooterMonster(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })

    expect(next.lastShotHit).toBe(true)
    expect(next.kills).toBe(1)
    expect(next.monsters).toHaveLength(0)
  })

  test('pistol does not inherit sniper range', () => {
    const state = {
      ...createShooterRuntimeState(true),
      weapon: 'pistol' as const,
      monsters: [monster({ z: -72, health: 1 })],
    }
    const next = shootShooterMonster(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })

    expect(next.lastShotHit).toBe(false)
    expect(next.monsters).toHaveLength(1)
  })

  test('weapon cooldown blocks rapid repeated shots', () => {
    const state = {
      ...createShooterRuntimeState(true),
      monsters: [monster({ z: -6, health: 2 })],
    }
    const firstShot = shootShooterMonster(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })
    const blockedShot = shootShooterMonster(
      firstShot,
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 0, z: -1 },
    )
    const cooled = updateShooterRuntime(
      firstShot,
      { x: 0, y: 1.6, z: 0 },
      DEFAULT_SHOOTER_CONFIG.weapons.pistol.fireCooldown,
    )
    const secondShot = shootShooterMonster(cooled, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })

    expect(firstShot.lastShotFired).toBe(true)
    expect(blockedShot.lastShotFired).toBe(false)
    expect(blockedShot.monsters[0]!.health).toBe(1)
    expect(secondShot.lastShotFired).toBe(true)
    expect(secondShot.kills).toBe(1)
  })

  test('empty magazines reload automatically over time', () => {
    const state = {
      ...createShooterRuntimeState(true),
      weaponAmmo: {
        ...createShooterRuntimeState(true).weaponAmmo,
        sniper: 1,
      },
      weapon: 'sniper' as const,
      monsters: [monster({ z: -24, health: 3 })],
    }
    const shot = shootShooterMonster(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })
    const reloaded = updateShooterRuntime(
      shot,
      { x: 0, y: 1.6, z: 0 },
      DEFAULT_SHOOTER_CONFIG.weapons.sniper.reloadDuration,
    )

    expect(shot.weaponAmmo.sniper).toBe(0)
    expect(shot.weaponReloads.sniper).toBeGreaterThan(0)
    expect(reloaded.weaponAmmo.sniper).toBe(DEFAULT_SHOOTER_CONFIG.weapons.sniper.magazineSize)
    expect(reloaded.weaponReloads.sniper).toBe(0)
  })

  test('shooter mode blocks first-person navigation even after game over', () => {
    expect(shouldShooterBlockFirstPersonNavigation({ active: true })).toBe(true)
    expect(shouldShooterBlockFirstPersonNavigation({ active: false })).toBe(false)
  })

  test('manual reload starts when the current magazine is partially used', () => {
    const state = {
      ...createShooterRuntimeState(true),
      weaponAmmo: {
        ...createShooterRuntimeState(true).weaponAmmo,
        pistol: 8,
      },
    }
    const next = reloadShooterWeapon(state)

    expect(next.weaponReloads.pistol).toBe(DEFAULT_SHOOTER_CONFIG.weapons.pistol.reloadDuration)
    expect(next.weaponAmmo.pistol).toBe(8)
  })

  test('knife only hits close monsters', () => {
    const state = {
      ...createShooterRuntimeState(true),
      weapon: 'knife' as const,
      monsters: [monster({ z: -1.8, health: 1 })],
    }
    const next = shootShooterMonster(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })

    expect(next.lastShotHit).toBe(true)
    expect(next.kills).toBe(1)
  })

  test('grenade damages monsters around the aimed target and spends ammo', () => {
    const state = {
      ...createShooterRuntimeState(true),
      monsters: [
        monster({ id: 'center', z: -12, health: 1 }),
        monster({ id: 'near-blast', x: 2, z: -12, health: 1 }),
        monster({ id: 'safe', x: 8, z: -12, health: 1 }),
      ],
    }
    const next = throwShooterGrenade(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })

    expect(next.grenades).toBe(DEFAULT_SHOOTER_CONFIG.grenades - 1)
    expect(next.kills).toBe(2)
    expect(next.monsters.map((candidate) => candidate.id)).toEqual(['safe'])
  })

  test('completes a wave, clears monsters, and advances after the break', () => {
    const state = {
      ...createShooterRuntimeState(true),
      waveTargetKills: 2,
      monsters: [
        monster({ id: 'center', z: -12, health: 1 }),
        monster({ id: 'near-blast', x: 2, z: -12, health: 1 }),
      ],
    }
    const completed = throwShooterGrenade(state, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 })
    const nextWave = updateShooterRuntime(
      completed,
      { x: 0, y: 1.6, z: 0 },
      DEFAULT_SHOOTER_CONFIG.waveBreakDuration,
    )

    expect(completed.waveBreakTimer).toBe(DEFAULT_SHOOTER_CONFIG.waveBreakDuration)
    expect(completed.monsters).toHaveLength(0)
    expect(nextWave.wave).toBe(2)
    expect(nextWave.waveKills).toBe(0)
    expect(nextWave.waveIntroTimer).toBe(DEFAULT_SHOOTER_CONFIG.waveIntroDuration)
    expect(nextWave.waveTargetKills).toBe(
      DEFAULT_SHOOTER_CONFIG.waveBaseKills + DEFAULT_SHOOTER_CONFIG.waveKillsIncrement,
    )
  })

  test('collects ammo supplies and refills magazines and grenades', () => {
    const supply = createShooterSupply('supply-1', { x: 0, y: 1.6, z: 0 }, sequenceRandom([0, 0]))
    const state = {
      ...createShooterRuntimeState(true),
      grenades: 0,
      weaponAmmo: {
        ...createShooterRuntimeState(true).weaponAmmo,
        pistol: 2,
        sniper: 1,
      },
      supplies: [{ ...supply, x: 0.4, z: 0.2 }],
    }
    const next = updateShooterRuntime(state, { x: 0, y: 1.6, z: 0 }, 0.1)

    expect(next.supplies).toHaveLength(0)
    expect(next.weaponAmmo.pistol).toBe(DEFAULT_SHOOTER_CONFIG.weapons.pistol.magazineSize)
    expect(next.weaponAmmo.sniper).toBe(DEFAULT_SHOOTER_CONFIG.weapons.sniper.magazineSize)
    expect(next.grenades).toBe(1)
    expect(next.supplyFlashTimer).toBe(DEFAULT_SHOOTER_CONFIG.supplyFlashDuration)
  })

  test('publishes radar markers for monsters and supplies', () => {
    const state = {
      ...createShooterRuntimeState(true),
      monsters: [monster({ id: 'runner-1', kind: 'runner', health: 1, maxHealth: 2 })],
      supplies: [createShooterSupply('supply-1', { x: 0, y: 1.6, z: 0 }, sequenceRandom([0, 0]))],
    }
    const publicState = toShooterPublicState(state)

    expect(publicState.radarMonsters).toEqual([
      { id: 'runner-1', kind: 'runner', x: 0, z: -8, healthRatio: 0.5 },
    ])
    expect(publicState.radarSupplies).toHaveLength(1)
    expect(publicState.radarSupplies[0]!.kind).toBe('ammo')
  })

  test('warns shortly before the next monster spawn', () => {
    const state = {
      ...createShooterRuntimeState(true),
      spawnTimer: DEFAULT_SHOOTER_CONFIG.spawnInterval - 0.2,
    }
    const next = updateShooterRuntime(state, { x: 0, y: 1.6, z: 0 }, 0.01)

    expect(next.spawnWarningTimer).toBeGreaterThan(0)
    expect(next.spawnWarningTimer).toBeLessThanOrEqual(DEFAULT_SHOOTER_CONFIG.spawnWarningDuration)
  })

  test('stance multipliers lower movement speed and eye height', () => {
    expect(getShooterStanceSpeedMultiplier('stand')).toBe(1)
    expect(getShooterStanceSpeedMultiplier('crouch')).toBeLessThan(1)
    expect(getShooterStanceSpeedMultiplier('prone')).toBeLessThan(
      getShooterStanceSpeedMultiplier('crouch'),
    )
    expect(getShooterStanceEyeHeightMultiplier('prone')).toBeLessThan(
      getShooterStanceEyeHeightMultiplier('crouch'),
    )
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
