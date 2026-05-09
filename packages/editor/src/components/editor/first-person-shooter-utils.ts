export const FIRST_PERSON_SHOOTER_SHOT_EVENT = 'editor:first-person-shooter-shot'
export const FIRST_PERSON_SHOOTER_COMMAND_EVENT = 'editor:first-person-shooter-command'
export const FIRST_PERSON_SHOOTER_STATE_EVENT = 'editor:first-person-shooter-state'
export const FIRST_PERSON_SHOOTER_SETTINGS_EVENT = 'editor:first-person-shooter-settings'
export const FIRST_PERSON_SHOOTER_GRENADE_EVENT = 'editor:first-person-shooter-grenade'
export const FIRST_PERSON_SHOOTER_RELOAD_EVENT = 'editor:first-person-shooter-reload'

export type ShooterCommand = 'start' | 'stop' | 'restart'
export type ShooterWeapon = 'pistol' | 'sniper' | 'knife'
export type ShooterStance = 'stand' | 'crouch' | 'prone'
export type ShooterMonsterKind = 'grunt' | 'runner' | 'brute'
export type ShooterSupplyKind = 'ammo'

export type ShooterShotPayload = {
  clientX: number
  clientY: number
  weapon?: ShooterWeapon
}

export type ShooterSettingsPayload = {
  weapon?: ShooterWeapon
  stance?: ShooterStance
  scoped?: boolean
}

export type ShooterVec3 = {
  x: number
  y: number
  z: number
}

export type ShooterMonster = {
  id: string
  kind: ShooterMonsterKind
  x: number
  y: number
  z: number
  health: number
  maxHealth: number
  radius: number
  speed: number
  damage: number
  scoreValue: number
  attackCooldown: number
}

export type ShooterSupply = {
  id: string
  kind: ShooterSupplyKind
  x: number
  y: number
  z: number
  radius: number
}

export type ShooterRadarMonster = {
  id: string
  kind: ShooterMonsterKind
  x: number
  z: number
  healthRatio: number
}

export type ShooterRadarSupply = {
  id: string
  kind: ShooterSupplyKind
  x: number
  z: number
}

export type ShooterRuntimeState = {
  active: boolean
  health: number
  score: number
  kills: number
  gameOver: boolean
  spawnTimer: number
  nextMonsterId: number
  supplyTimer: number
  nextSupplyId: number
  monsters: ShooterMonster[]
  supplies: ShooterSupply[]
  lastShotHit: boolean | null
  lastScoreAward: number
  hitPulse: number
  weapon: ShooterWeapon
  stance: ShooterStance
  scoped: boolean
  grenades: number
  lastShotFired: boolean
  weaponAmmo: Record<ShooterWeapon, number>
  weaponCooldowns: Record<ShooterWeapon, number>
  weaponReloads: Record<ShooterWeapon, number>
  comboCount: number
  comboTimer: number
  lastComboBonus: number
  wave: number
  waveKills: number
  waveTargetKills: number
  waveBreakTimer: number
  waveIntroTimer: number
  spawnWarningTimer: number
  supplyFlashTimer: number
}

export type FirstPersonShooterPublicState = {
  active: boolean
  health: number
  maxHealth: number
  lastScoreAward: number
  score: number
  kills: number
  monsterCount: number
  supplyCount: number
  radarMonsters: ShooterRadarMonster[]
  radarSupplies: ShooterRadarSupply[]
  gameOver: boolean
  lastShotHit: boolean | null
  weapon: ShooterWeapon
  stance: ShooterStance
  scoped: boolean
  grenades: number
  lastShotFired: boolean
  weaponAmmo: number
  weaponMagazineSize: number
  weaponCooldown: number
  weaponReload: number
  comboCount: number
  comboTimer: number
  lastComboBonus: number
  wave: number
  waveKills: number
  waveTargetKills: number
  waveBreakTimer: number
  waveIntroTimer: number
  spawnWarningTimer: number
  supplyFlashTimer: number
}

export type ShooterWeaponConfig = {
  label: string
  range: number
  damage: number
  radiusScale: number
  magazineSize: number
  fireCooldown: number
  reloadDuration: number
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
  grenades: number
  grenadeRange: number
  grenadeRadius: number
  grenadeDamage: number
  waveBaseKills: number
  waveKillsIncrement: number
  waveBreakDuration: number
  waveIntroDuration: number
  waveHealthBonus: number
  waveGrenadeBonus: number
  comboWindow: number
  comboBonusStep: number
  comboMaxBonus: number
  spawnWarningDuration: number
  supplyInterval: number
  maxSupplies: number
  supplyRadius: number
  supplyMinDistance: number
  supplyMaxDistance: number
  supplyGrenadeBonus: number
  supplyFlashDuration: number
  weapons: Record<ShooterWeapon, ShooterWeaponConfig>
}

export function shouldShooterBlockFirstPersonNavigation(
  state: Pick<FirstPersonShooterPublicState, 'active'>,
) {
  return state.active
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
  shotRange: 90,
  shotDamage: 1,
  killScore: 10,
  hitScore: 2,
  hitPulseDuration: 0.16,
  grenades: 3,
  grenadeRange: 32,
  grenadeRadius: 4.2,
  grenadeDamage: 3,
  waveBaseKills: 6,
  waveKillsIncrement: 2,
  waveBreakDuration: 3.5,
  waveIntroDuration: 2.2,
  waveHealthBonus: 20,
  waveGrenadeBonus: 1,
  comboWindow: 2.8,
  comboBonusStep: 3,
  comboMaxBonus: 18,
  spawnWarningDuration: 0.75,
  supplyInterval: 13,
  maxSupplies: 2,
  supplyRadius: 1.35,
  supplyMinDistance: 4.5,
  supplyMaxDistance: 10,
  supplyGrenadeBonus: 1,
  supplyFlashDuration: 1.2,
  weapons: {
    pistol: {
      label: '手枪',
      range: 55,
      damage: 1,
      radiusScale: 1,
      magazineSize: 12,
      fireCooldown: 0.22,
      reloadDuration: 1.05,
    },
    sniper: {
      label: '狙击枪',
      range: 180,
      damage: 2,
      radiusScale: 0.85,
      magazineSize: 5,
      fireCooldown: 0.9,
      reloadDuration: 1.65,
    },
    knife: {
      label: '刀',
      range: 2.25,
      damage: 2,
      radiusScale: 1.35,
      magazineSize: 0,
      fireCooldown: 0.46,
      reloadDuration: 0,
    },
  },
}

function getWaveTargetKills(wave: number, config: ShooterConfig = DEFAULT_SHOOTER_CONFIG) {
  return config.waveBaseKills + Math.max(0, wave - 1) * config.waveKillsIncrement
}

function createWeaponNumberMap(
  getValue: (weapon: ShooterWeapon, config: ShooterWeaponConfig) => number,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): Record<ShooterWeapon, number> {
  return {
    pistol: getValue('pistol', config.weapons.pistol),
    sniper: getValue('sniper', config.weapons.sniper),
    knife: getValue('knife', config.weapons.knife),
  }
}

const DEFAULT_PUBLIC_STATE: FirstPersonShooterPublicState = {
  active: false,
  health: DEFAULT_SHOOTER_CONFIG.maxHealth,
  maxHealth: DEFAULT_SHOOTER_CONFIG.maxHealth,
  lastScoreAward: 0,
  score: 0,
  kills: 0,
  monsterCount: 0,
  supplyCount: 0,
  radarMonsters: [],
  radarSupplies: [],
  gameOver: false,
  lastShotHit: null,
  weapon: 'pistol',
  stance: 'stand',
  scoped: false,
  grenades: DEFAULT_SHOOTER_CONFIG.grenades,
  lastShotFired: false,
  weaponAmmo: DEFAULT_SHOOTER_CONFIG.weapons.pistol.magazineSize,
  weaponMagazineSize: DEFAULT_SHOOTER_CONFIG.weapons.pistol.magazineSize,
  weaponCooldown: 0,
  weaponReload: 0,
  comboCount: 0,
  comboTimer: 0,
  lastComboBonus: 0,
  wave: 1,
  waveKills: 0,
  waveTargetKills: getWaveTargetKills(1),
  waveBreakTimer: 0,
  waveIntroTimer: DEFAULT_SHOOTER_CONFIG.waveIntroDuration,
  spawnWarningTimer: 0,
  supplyFlashTimer: 0,
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
      weapon: 'pistol',
      stance: 'stand',
      scoped: false,
      grenades: DEFAULT_SHOOTER_CONFIG.grenades,
      lastShotFired: false,
      weaponAmmo: DEFAULT_SHOOTER_CONFIG.weapons.pistol.magazineSize,
      weaponMagazineSize: DEFAULT_SHOOTER_CONFIG.weapons.pistol.magazineSize,
      weaponCooldown: 0,
      weaponReload: 0,
      comboCount: 0,
      comboTimer: 0,
      lastComboBonus: 0,
      wave: 1,
      waveKills: 0,
      waveTargetKills: getWaveTargetKills(1),
      waveBreakTimer: 0,
      waveIntroTimer: DEFAULT_SHOOTER_CONFIG.waveIntroDuration,
      spawnWarningTimer: 0,
      supplyFlashTimer: 0,
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

export function dispatchFirstPersonShooterShot(payload?: ShooterShotPayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ShooterShotPayload | undefined>(FIRST_PERSON_SHOOTER_SHOT_EVENT, {
      detail: payload,
    }),
  )
}

export function setFirstPersonShooterWeapon(weapon: ShooterWeapon) {
  setFirstPersonShooterPublicState({
    ...shooterPublicState,
    weapon,
    scoped: weapon === 'sniper' ? shooterPublicState.scoped : false,
  })
  dispatchFirstPersonShooterSettings({
    weapon,
    scoped: weapon === 'sniper' ? shooterPublicState.scoped : false,
  })
}

export function setFirstPersonShooterStance(stance: ShooterStance) {
  setFirstPersonShooterPublicState({ ...shooterPublicState, stance })
  dispatchFirstPersonShooterSettings({ stance })
}

export function setFirstPersonShooterScoped(scoped: boolean) {
  setFirstPersonShooterPublicState({
    ...shooterPublicState,
    scoped: shooterPublicState.weapon === 'sniper' ? scoped : false,
  })
  dispatchFirstPersonShooterSettings({ scoped })
}

export function dispatchFirstPersonShooterGrenade(payload?: ShooterShotPayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ShooterShotPayload | undefined>(FIRST_PERSON_SHOOTER_GRENADE_EVENT, {
      detail: payload,
    }),
  )
}

export function dispatchFirstPersonShooterReload() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FIRST_PERSON_SHOOTER_RELOAD_EVENT))
}

function dispatchFirstPersonShooterSettings(payload: ShooterSettingsPayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ShooterSettingsPayload>(FIRST_PERSON_SHOOTER_SETTINGS_EVENT, {
      detail: payload,
    }),
  )
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
    supplyTimer: 0,
    nextSupplyId: 1,
    monsters: [],
    supplies: [],
    lastShotHit: null,
    lastScoreAward: 0,
    hitPulse: 0,
    weapon: 'pistol',
    stance: 'stand',
    scoped: false,
    grenades: config.grenades,
    lastShotFired: false,
    weaponAmmo: createWeaponNumberMap((_, weapon) => weapon.magazineSize, config),
    weaponCooldowns: createWeaponNumberMap(() => 0, config),
    weaponReloads: createWeaponNumberMap(() => 0, config),
    comboCount: 0,
    comboTimer: 0,
    lastComboBonus: 0,
    wave: 1,
    waveKills: 0,
    waveTargetKills: getWaveTargetKills(1, config),
    waveBreakTimer: 0,
    waveIntroTimer: config.waveIntroDuration,
    spawnWarningTimer: 0,
    supplyFlashTimer: 0,
  }
}

export function toShooterPublicState(
  state: ShooterRuntimeState,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): FirstPersonShooterPublicState {
  const weapon = config.weapons[state.weapon] ?? config.weapons.pistol

  return {
    active: state.active,
    health: state.health,
    maxHealth: config.maxHealth,
    lastScoreAward: state.lastScoreAward,
    score: state.score,
    kills: state.kills,
    monsterCount: state.monsters.length,
    supplyCount: state.supplies.length,
    radarMonsters: state.monsters.map((monster) => ({
      id: monster.id,
      kind: monster.kind,
      x: monster.x,
      z: monster.z,
      healthRatio: Math.max(0, Math.min(1, monster.health / Math.max(1, monster.maxHealth))),
    })),
    radarSupplies: state.supplies.map((supply) => ({
      id: supply.id,
      kind: supply.kind,
      x: supply.x,
      z: supply.z,
    })),
    gameOver: state.gameOver,
    lastShotHit: state.lastShotHit,
    weapon: state.weapon,
    stance: state.stance,
    scoped: state.scoped,
    grenades: state.grenades,
    lastShotFired: state.lastShotFired,
    weaponAmmo: state.weaponAmmo[state.weapon] ?? 0,
    weaponMagazineSize: weapon.magazineSize,
    weaponCooldown: state.weaponCooldowns[state.weapon] ?? 0,
    weaponReload: state.weaponReloads[state.weapon] ?? 0,
    comboCount: state.comboCount,
    comboTimer: state.comboTimer,
    lastComboBonus: state.lastComboBonus,
    wave: state.wave,
    waveKills: state.waveKills,
    waveTargetKills: state.waveTargetKills,
    waveBreakTimer: state.waveBreakTimer,
    waveIntroTimer: state.waveIntroTimer,
    spawnWarningTimer: state.spawnWarningTimer,
    supplyFlashTimer: state.supplyFlashTimer,
  }
}

export function getShooterStanceSpeedMultiplier(stance: ShooterStance) {
  if (stance === 'crouch') return 0.58
  if (stance === 'prone') return 0.28
  return 1
}

export function getShooterStanceEyeHeightMultiplier(stance: ShooterStance) {
  if (stance === 'crouch') return 0.62
  if (stance === 'prone') return 0.28
  return 1
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
  const variantRoll = random()
  const runnerChance = Math.min(0.32, Math.max(0, config.monsterSpeed / 2.2 - 1) * 0.18 + 0.08)
  const bruteChance = Math.min(0.24, Math.max(0, config.monsterHealth - 2) * 0.08 + 0.06)
  const kind: ShooterMonsterKind =
    variantRoll < runnerChance ? 'runner' : variantRoll > 1 - bruteChance ? 'brute' : 'grunt'
  const health =
    kind === 'runner'
      ? Math.max(1, config.monsterHealth - 1)
      : kind === 'brute'
        ? config.monsterHealth + 3
        : config.monsterHealth
  const radius =
    kind === 'runner'
      ? config.monsterRadius * 0.82
      : kind === 'brute'
        ? config.monsterRadius * 1.22
        : config.monsterRadius
  const speed =
    config.monsterSpeed *
    (kind === 'runner' ? 1.48 : kind === 'brute' ? 0.72 : 1) *
    (0.82 + random() * 0.36)

  return {
    id,
    kind,
    x: player.x + Math.cos(angle) * distance,
    y: player.y - 1.18,
    z: player.z + Math.sin(angle) * distance,
    health,
    maxHealth: health,
    radius,
    speed,
    damage: kind === 'brute' ? Math.round(config.monsterDamage * 1.35) : config.monsterDamage,
    scoreValue:
      kind === 'runner'
        ? Math.round(config.killScore * 1.2)
        : kind === 'brute'
          ? Math.round(config.killScore * 1.8)
          : config.killScore,
    attackCooldown: 0,
  }
}

export function createShooterSupply(
  id: string,
  player: ShooterVec3,
  random: () => number = Math.random,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): ShooterSupply {
  const angle = random() * Math.PI * 2
  const distance =
    config.supplyMinDistance + random() * (config.supplyMaxDistance - config.supplyMinDistance)

  return {
    id,
    kind: 'ammo',
    x: player.x + Math.cos(angle) * distance,
    y: player.y - 1.08,
    z: player.z + Math.sin(angle) * distance,
    radius: config.supplyRadius,
  }
}

export function distanceXZ(a: ShooterVec3, b: ShooterVec3) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function reloadShooterWeapon(
  state: ShooterRuntimeState,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): ShooterRuntimeState {
  const weapon = config.weapons[state.weapon] ?? config.weapons.pistol
  const currentAmmo = state.weaponAmmo[state.weapon] ?? 0
  if (
    !(state.active && !state.gameOver) ||
    weapon.magazineSize <= 0 ||
    currentAmmo >= weapon.magazineSize ||
    (state.weaponReloads[state.weapon] ?? 0) > 0
  ) {
    return { ...state, lastShotFired: false }
  }

  return {
    ...state,
    lastShotFired: false,
    weaponReloads: { ...state.weaponReloads, [state.weapon]: weapon.reloadDuration },
  }
}

function getWaveSpawnInterval(wave: number, config: ShooterConfig) {
  return Math.max(0.62, config.spawnInterval * 0.9 ** Math.max(0, wave - 1))
}

function getWaveMaxMonsters(wave: number, config: ShooterConfig) {
  return Math.min(16, config.maxMonsters + Math.floor(Math.max(0, wave - 1) / 2))
}

function getWaveShooterConfig(wave: number, config: ShooterConfig): ShooterConfig {
  const waveIndex = Math.max(0, wave - 1)
  return {
    ...config,
    monsterHealth: config.monsterHealth + Math.floor(waveIndex / 3),
    monsterSpeed: config.monsterSpeed * (1 + waveIndex * 0.06),
  }
}

function completeWave(state: ShooterRuntimeState, config: ShooterConfig): ShooterRuntimeState {
  return {
    ...state,
    health: Math.min(config.maxHealth, state.health + config.waveHealthBonus),
    grenades: Math.min(config.grenades, state.grenades + config.waveGrenadeBonus),
    monsters: [],
    supplies: [],
    spawnTimer: 0,
    supplyTimer: 0,
    waveKills: state.waveTargetKills,
    waveBreakTimer: config.waveBreakDuration,
  }
}

function addWaveKills(
  state: ShooterRuntimeState,
  killsAward: number,
  config: ShooterConfig,
): ShooterRuntimeState {
  if (killsAward <= 0 || state.waveBreakTimer > 0) return state
  const comboCount = state.comboTimer > 0 ? state.comboCount + killsAward : killsAward
  const comboBonus =
    comboCount >= 3
      ? Math.min(config.comboMaxBonus, Math.max(0, comboCount - 2) * config.comboBonusStep)
      : 0
  const nextWaveKills = Math.min(state.waveTargetKills, state.waveKills + killsAward)
  const next = {
    ...state,
    score: state.score + comboBonus,
    lastScoreAward: state.lastScoreAward + comboBonus,
    comboCount,
    comboTimer: config.comboWindow,
    lastComboBonus: comboBonus,
    waveKills: nextWaveKills,
  }
  return nextWaveKills >= state.waveTargetKills ? completeWave(next, config) : next
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
    supplyTimer: state.supplyTimer + elapsed,
    monsters: state.monsters.map((monster) => ({ ...monster })),
    supplies: state.supplies.map((supply) => ({ ...supply })),
    hitPulse: Math.max(0, state.hitPulse - dt),
    comboTimer: Math.max(0, state.comboTimer - elapsed),
    lastComboBonus: 0,
    waveIntroTimer: Math.max(0, state.waveIntroTimer - elapsed),
    spawnWarningTimer: 0,
    supplyFlashTimer: Math.max(0, state.supplyFlashTimer - elapsed),
    lastShotFired: false,
    weaponAmmo: { ...state.weaponAmmo },
    weaponCooldowns: createWeaponNumberMap(
      (weapon) => Math.max(0, (state.weaponCooldowns[weapon] ?? 0) - elapsed),
      config,
    ),
    weaponReloads: createWeaponNumberMap(
      (weapon) => Math.max(0, (state.weaponReloads[weapon] ?? 0) - elapsed),
      config,
    ),
    waveBreakTimer: Math.max(0, state.waveBreakTimer - elapsed),
  }

  for (const weaponKey of Object.keys(config.weapons) as ShooterWeapon[]) {
    const weapon = config.weapons[weaponKey]
    if (
      weapon.magazineSize > 0 &&
      (state.weaponReloads[weaponKey] ?? 0) > 0 &&
      next.weaponReloads[weaponKey] <= 0
    ) {
      next.weaponAmmo[weaponKey] = weapon.magazineSize
    }
  }

  if (next.hitPulse <= 0) {
    next.lastShotHit = null
    next.lastScoreAward = 0
  }

  if (next.comboTimer <= 0) next.comboCount = 0

  if (state.waveBreakTimer > 0 && next.waveBreakTimer <= 0 && !next.gameOver) {
    next.wave += 1
    next.waveKills = 0
    next.waveTargetKills = getWaveTargetKills(next.wave, config)
    next.spawnTimer = 0
    next.supplyTimer = 0
    next.waveIntroTimer = config.waveIntroDuration
  }

  const waveConfig = getWaveShooterConfig(next.wave, config)
  const spawnInterval = getWaveSpawnInterval(next.wave, config)
  const maxMonsters = getWaveMaxMonsters(next.wave, config)

  if (!(next.gameOver || next.waveBreakTimer > 0)) {
    const timeUntilSpawn = Math.max(0, spawnInterval - next.spawnTimer)
    if (next.monsters.length < maxMonsters && timeUntilSpawn <= config.spawnWarningDuration) {
      next.spawnWarningTimer = timeUntilSpawn
    }

    while (next.spawnTimer >= spawnInterval && next.monsters.length < maxMonsters) {
      next.spawnTimer -= spawnInterval
      next.monsters.push(
        createShooterMonster(`monster-${next.nextMonsterId}`, player, random, waveConfig),
      )
      next.nextMonsterId += 1
    }

    while (next.supplyTimer >= config.supplyInterval && next.supplies.length < config.maxSupplies) {
      next.supplyTimer -= config.supplyInterval
      next.supplies.push(createShooterSupply(`supply-${next.nextSupplyId}`, player, random, config))
      next.nextSupplyId += 1
    }
  }

  if (next.gameOver || next.waveBreakTimer > 0) return next

  const remainingSupplies: ShooterSupply[] = []
  let collectedSupply = false
  for (const supply of next.supplies) {
    if (distanceXZ(supply, player) <= supply.radius) {
      collectedSupply = true
      continue
    }
    remainingSupplies.push(supply)
  }

  if (collectedSupply) {
    next.supplies = remainingSupplies
    next.supplyFlashTimer = config.supplyFlashDuration
    next.grenades = Math.min(config.grenades, next.grenades + config.supplyGrenadeBonus)
    for (const weaponKey of Object.keys(config.weapons) as ShooterWeapon[]) {
      const weapon = config.weapons[weaponKey]
      if (weapon.magazineSize > 0) {
        next.weaponAmmo[weaponKey] = weapon.magazineSize
        next.weaponReloads[weaponKey] = 0
      }
    }
  }

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
      next.health = Math.max(0, next.health - monster.damage)
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
  const weapon = config.weapons[state.weapon] ?? config.weapons.pistol
  const cooldown = state.weaponCooldowns[state.weapon] ?? 0
  const reload = state.weaponReloads[state.weapon] ?? 0
  const ammo = state.weaponAmmo[state.weapon] ?? 0

  if (cooldown > 0 || reload > 0 || (weapon.magazineSize > 0 && ammo <= 0)) {
    const weaponReloads = { ...state.weaponReloads }
    if (weapon.magazineSize > 0 && ammo <= 0 && reload <= 0) {
      weaponReloads[state.weapon] = weapon.reloadDuration
    }
    return {
      ...state,
      weaponReloads,
      lastShotFired: false,
      lastShotHit: null,
      lastScoreAward: 0,
    }
  }

  const weaponAmmo = { ...state.weaponAmmo }
  const weaponCooldowns = { ...state.weaponCooldowns, [state.weapon]: weapon.fireCooldown }
  const weaponReloads = { ...state.weaponReloads }
  if (weapon.magazineSize > 0) {
    weaponAmmo[state.weapon] = Math.max(0, ammo - 1)
    if (weaponAmmo[state.weapon] <= 0) weaponReloads[state.weapon] = weapon.reloadDuration
  }

  state.monsters.forEach((monster, index) => {
    const ox = monster.x - origin.x
    const oy = monster.y + 0.8 - origin.y
    const oz = monster.z - origin.z
    const projected = ox * dir.x + oy * dir.y + oz * dir.z

    if (projected < 0 || projected > weapon.range) return

    const closestX = origin.x + dir.x * projected
    const closestY = origin.y + dir.y * projected
    const closestZ = origin.z + dir.z * projected
    const missDistance = Math.hypot(
      monster.x - closestX,
      monster.y + 0.8 - closestY,
      monster.z - closestZ,
    )

    if (missDistance <= monster.radius * weapon.radiusScale && projected < hitDistance) {
      hitIndex = index
      hitDistance = projected
    }
  })

  if (hitIndex < 0) {
    return {
      ...state,
      weaponAmmo,
      weaponCooldowns,
      weaponReloads,
      lastShotFired: true,
      lastShotHit: false,
      lastScoreAward: 0,
      hitPulse: config.hitPulseDuration,
    }
  }

  const monsters = state.monsters.map((monster) => ({ ...monster }))
  const monster = monsters[hitIndex]!
  monster.health -= weapon.damage

  if (monster.health <= 0) {
    monsters.splice(hitIndex, 1)
    const scoreAward = monster.scoreValue
    return addWaveKills(
      {
        ...state,
        weaponAmmo,
        weaponCooldowns,
        weaponReloads,
        monsters,
        kills: state.kills + 1,
        score: state.score + scoreAward,
        lastScoreAward: scoreAward,
        lastShotFired: true,
        lastShotHit: true,
        hitPulse: config.hitPulseDuration,
      },
      1,
      config,
    )
  }

  return {
    ...state,
    weaponAmmo,
    weaponCooldowns,
    weaponReloads,
    monsters,
    score: state.score + config.hitScore,
    lastScoreAward: config.hitScore,
    lastShotFired: true,
    lastShotHit: true,
    hitPulse: config.hitPulseDuration,
  }
}

export function throwShooterGrenade(
  state: ShooterRuntimeState,
  origin: ShooterVec3,
  direction: ShooterVec3,
  config: ShooterConfig = DEFAULT_SHOOTER_CONFIG,
): ShooterRuntimeState {
  if (!(state.active && !state.gameOver) || state.grenades <= 0) {
    return {
      ...state,
      lastShotFired: false,
      lastShotHit: false,
      lastScoreAward: 0,
      hitPulse: config.hitPulseDuration,
    }
  }

  const directionLength = Math.hypot(direction.x, direction.y, direction.z)
  if (directionLength <= 0.001) {
    return {
      ...state,
      lastShotFired: false,
      lastShotHit: false,
      lastScoreAward: 0,
      hitPulse: config.hitPulseDuration,
    }
  }

  const dir = {
    x: direction.x / directionLength,
    y: direction.y / directionLength,
    z: direction.z / directionLength,
  }
  let targetDistance = config.grenadeRange

  for (const monster of state.monsters) {
    const ox = monster.x - origin.x
    const oy = monster.y + 0.8 - origin.y
    const oz = monster.z - origin.z
    const projected = ox * dir.x + oy * dir.y + oz * dir.z
    if (projected > 0 && projected < targetDistance) targetDistance = projected
  }

  const target = {
    x: origin.x + dir.x * targetDistance,
    y: origin.y + dir.y * targetDistance,
    z: origin.z + dir.z * targetDistance,
  }
  let scoreAward = 0
  let killsAward = 0
  let hit = false
  const monsters: ShooterMonster[] = []

  for (const monster of state.monsters) {
    const distance = Math.hypot(
      monster.x - target.x,
      monster.y + 0.8 - target.y,
      monster.z - target.z,
    )
    if (distance <= config.grenadeRadius) {
      hit = true
      const nextMonster = { ...monster, health: monster.health - config.grenadeDamage }
      if (nextMonster.health <= 0) {
        scoreAward += monster.scoreValue
        killsAward += 1
      } else {
        scoreAward += config.hitScore
        monsters.push(nextMonster)
      }
    } else {
      monsters.push({ ...monster })
    }
  }

  return addWaveKills(
    {
      ...state,
      grenades: state.grenades - 1,
      monsters,
      kills: state.kills + killsAward,
      score: state.score + scoreAward,
      lastScoreAward: scoreAward,
      lastShotFired: true,
      lastShotHit: hit,
      hitPulse: config.hitPulseDuration,
    },
    killsAward,
    config,
  )
}
