export const FIRST_PERSON_SHOOTER_SHOT_EVENT = 'editor:first-person-shooter-shot'
export const FIRST_PERSON_SHOOTER_COMMAND_EVENT = 'editor:first-person-shooter-command'
export const FIRST_PERSON_SHOOTER_STATE_EVENT = 'editor:first-person-shooter-state'

export type ShooterCommand = 'start' | 'stop' | 'restart'

export type ShooterVec3 = {
  x: number
  y: number
  z: number
}

export type ShooterMonster = {
  id: string
  x: number
  y: number
  z: number
  health: number
  maxHealth: number
  radius: number
  speed: number
  attackCooldown: number
}

export type ShooterRuntimeState = {
  active: boolean
  health: number
  score: number
  kills: number
  gameOver: boolean
  spawnTimer: number
  nextMonsterId: number
  monsters: ShooterMonster[]
  lastShotHit: boolean | null
  lastScoreAward: number
  hitPulse: number
}

export type FirstPersonShooterPublicState = {
  active: boolean
  health: number
  maxHealth: number
  lastScoreAward: number
  score: number
  kills: number
  monsterCount: number
  gameOver: boolean
  lastShotHit: boolean | null
}

export type ShooterConfig = {
  maxHealth: number
  monsterHealth: number
  monsterDamage: number
  monsterAttackCooldown: number
  monsterAttackRange: number
  monsterRadius: number
  monsterSpeed: number
  maxMonsters: number
  spawnInterval: number
  spawnMinDistance: number
  spawnMaxDistance: number
  shotRange: number
  shotDamage: number
  killScore: number
  hitScore: number
  hitPulseDuration: number
}

export const DEFAULT_SHOOTER_CONFIG: ShooterConfig = {
  maxHealth: 100,
  monsterHealth: 2,
  monsterDamage: 15,
  monsterAttackCooldown: 1,
  monsterAttackRange: 1.25,
  monsterRadius: 0.52,
  monsterSpeed: 2.2,
  maxMonsters: 8,
  spawnInterval: 1.45,
  spawnMinDistance: 9,
  spawnMaxDistance: 16,
  shotRange: 30,
  shotDamage: 1,
  killScore: 10,
  hitScore: 2,
  hitPulseDuration: 0.16,
}

const DEFAULT_PUBLIC_STATE: FirstPersonShooterPublicState = {
  active: false,
  health: DEFAULT_SHOOTER_CONFIG.maxHealth,
  maxHealth: DEFAULT_SHOOTER_CONFIG.maxHealth,
  lastScoreAward: 0,
  score: 0,
  kills: 0,
  monsterCount: 0,
  gameOver: false,
  lastShotHit: null,
}

const shooterSubscribers = new Set<() => void>()
let shooterPublicState: FirstPersonShooterPublicState = DEFAULT_PUBLIC_STATE

function emitShooterState() {
  for (const subscriber of shooterSubscribers) subscriber()

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<FirstPersonShooterPublicState>(FIRST_PERSON_SHOOTER_STATE_EVENT, {
        detail: shooterPublicState,
      }),
    )
  }
}

export function subscribeFirstPersonShooterState(subscriber: () => void) {
  shooterSubscribers.add(subscriber)
  return () => {
    shooterSubscribers.delete(subscriber)
  }
}

export function getFirstPersonShooterStateSnapshot() {
  return shooterPublicState
}

export function setFirstPersonShooterPublicState(
  nextState: FirstPersonShooterPublicState,
  options: { notify?: boolean } = {},
) {
  shooterPublicState = nextState
  if (options.notify !== false) emitShooterState()
}

export function dispatchFirstPersonShooterCommand(command: ShooterCommand) {
  if (command === 'start' || command === 'restart') {
    setFirstPersonShooterPublicState({
      ...DEFAULT_PUBLIC_STATE,
      active: true,
      lastShotHit: null,
    })
  } else {
    setFirstPersonShooterPublicState(DEFAULT_PUBLIC_STATE)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<{ command: ShooterCommand }>(FIRST_PERSON_SHOOTER_COMMAND_EVENT, {
        detail: { command },
      }),
    )
  }
}

export function dispatchFirstPersonShooterShot() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FIRST_PERSON_SHOOTER_SHOT_EVENT))
}

export function createShooterRuntimeState(
  active = false,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): ShooterRuntimeState {
  return {
    active,
    health: config.maxHealth,
    score: 0,
    kills: 0,
    gameOver: false,
    spawnTimer: 0,
    nextMonsterId: 1,
    monsters: [],
    lastShotHit: null,
    lastScoreAward: 0,
    hitPulse: 0,
  }
}

export function toShooterPublicState(
  state: ShooterRuntimeState,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): FirstPersonShooterPublicState {
  return {
    active: state.active,
    health: state.health,
    maxHealth: config.maxHealth,
    lastScoreAward: state.lastScoreAward,
    score: state.score,
    kills: state.kills,
    monsterCount: state.monsters.length,
    gameOver: state.gameOver,
    lastShotHit: state.lastShotHit,
  }
}

export function createShooterMonster(
  id: string,
  player: ShooterVec3,
  random: () => number = Math.random,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): ShooterMonster {
  const angle = random() * Math.PI * 2
  const distance =
    config.spawnMinDistance + random() * (config.spawnMaxDistance - config.spawnMinDistance)

  return {
    id,
    x: player.x + Math.cos(angle) * distance,
    y: player.y - 1.18,
    z: player.z + Math.sin(angle) * distance,
    health: config.monsterHealth,
    maxHealth: config.monsterHealth,
    radius: config.monsterRadius,
    speed: config.monsterSpeed * (0.82 + random() * 0.36),
    attackCooldown: 0,
  }
}

export function distanceXZ(a: ShooterVec3, b: ShooterVec3) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function updateShooterRuntime(
  state: ShooterRuntimeState,
  player: ShooterVec3,
  delta: number,
  random: () => number = Math.random,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): ShooterRuntimeState {
  if (!state.active) return state

  const elapsed = Math.max(0, delta)
  const dt = Math.min(elapsed, 0.1)
  const next: ShooterRuntimeState = {
    ...state,
    spawnTimer: state.spawnTimer + elapsed,
    monsters: state.monsters.map((monster) => ({ ...monster })),
    hitPulse: Math.max(0, state.hitPulse - dt),
  }

  if (next.hitPulse <= 0) {
    next.lastShotHit = null
    next.lastScoreAward = 0
  }

  if (!next.gameOver) {
    while (next.spawnTimer >= config.spawnInterval && next.monsters.length < config.maxMonsters) {
      next.spawnTimer -= config.spawnInterval
      next.monsters.push(
        createShooterMonster(`monster-${next.nextMonsterId}`, player, random, config),
      )
      next.nextMonsterId += 1
    }
  }

  if (next.gameOver) return next

  for (const monster of next.monsters) {
    const dx = player.x - monster.x
    const dz = player.z - monster.z
    const distance = Math.hypot(dx, dz)
    monster.attackCooldown = Math.max(0, monster.attackCooldown - elapsed)

    if (distance > config.monsterAttackRange && distance > 0.001) {
      const step = Math.min(distance - config.monsterAttackRange, monster.speed * dt)
      monster.x += (dx / distance) * step
      monster.z += (dz / distance) * step
    } else if (monster.attackCooldown <= 0) {
      next.health = Math.max(0, next.health - config.monsterDamage)
      monster.attackCooldown = config.monsterAttackCooldown
    }
  }

  if (next.health <= 0) {
    next.health = 0
    next.gameOver = true
  }

  return next
}

export function shootShooterMonster(
  state: ShooterRuntimeState,
  origin: ShooterVec3,
  direction: ShooterVec3,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): ShooterRuntimeState {
  if (!(state.active && !state.gameOver)) {
    return { ...state, lastShotHit: false, lastScoreAward: 0, hitPulse: config.hitPulseDuration }
  }

  const directionLength = Math.hypot(direction.x, direction.y, direction.z)
  if (directionLength <= 0.001) {
    return { ...state, lastShotHit: false, lastScoreAward: 0, hitPulse: config.hitPulseDuration }
  }

  const dir = {
    x: direction.x / directionLength,
    y: direction.y / directionLength,
    z: direction.z / directionLength,
  }
  let hitIndex = -1
  let hitDistance = Number.POSITIVE_INFINITY

  state.monsters.forEach((monster, index) => {
    const ox = monster.x - origin.x
    const oy = monster.y + 0.8 - origin.y
    const oz = monster.z - origin.z
    const projected = ox * dir.x + oy * dir.y + oz * dir.z

    if (projected < 0 || projected > config.shotRange) return

    const closestX = origin.x + dir.x * projected
    const closestY = origin.y + dir.y * projected
    const closestZ = origin.z + dir.z * projected
    const missDistance = Math.hypot(
      monster.x - closestX,
      monster.y + 0.8 - closestY,
      monster.z - closestZ,
    )

    if (missDistance <= monster.radius && projected < hitDistance) {
      hitIndex = index
      hitDistance = projected
    }
  })

  if (hitIndex < 0) {
    return { ...state, lastShotHit: false, lastScoreAward: 0, hitPulse: config.hitPulseDuration }
  }

  const monsters = state.monsters.map((monster) => ({ ...monster }))
  const monster = monsters[hitIndex]!
  monster.health -= config.shotDamage

  if (monster.health <= 0) {
    monsters.splice(hitIndex, 1)
    return {
      ...state,
      monsters,
      kills: state.kills + 1,
      score: state.score + config.killScore,
      lastScoreAward: config.killScore,
      lastShotHit: true,
      hitPulse: config.hitPulseDuration,
    }
  }

  return {
    ...state,
    monsters,
    score: state.score + config.hitScore,
    lastScoreAward: config.hitScore,
    lastShotHit: true,
    hitPulse: config.hitPulseDuration,
  }
}
