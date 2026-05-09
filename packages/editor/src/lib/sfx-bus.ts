import mitt from 'mitt'
import { playSFX } from './sfx-player'

/**
 * SFX-specific events that tools can trigger
 */
type SFXEvents = {
  'sfx:grid-snap': undefined
  'sfx:item-delete': undefined
  'sfx:item-pick': undefined
  'sfx:item-place': undefined
  'sfx:item-rotate': undefined
  'sfx:structure-build': undefined
  'sfx:structure-delete': undefined
  'sfx:shooter-start': undefined
  'sfx:shooter-fire': undefined
  'sfx:shooter-hit': undefined
  'sfx:shooter-kill': undefined
  'sfx:shooter-damage': undefined
}

/**
 * Dedicated event emitter for SFX
 * Tools should use this to trigger sound effects
 */
export const sfxEmitter = mitt<SFXEvents>()

let sfxBusInitialized = false

/**
 * Initialize SFX Bus - connects SFX events to actual sound playback.
 * Safe to call multiple times; re-registration is a no-op once initialized.
 */
export function initSFXBus() {
  if (sfxBusInitialized) return
  sfxBusInitialized = true
  // Map SFX events to sound playback
  sfxEmitter.on('sfx:grid-snap', () => playSFX('gridSnap'))
  sfxEmitter.on('sfx:item-delete', () => playSFX('itemDelete'))
  sfxEmitter.on('sfx:item-pick', () => playSFX('itemPick'))
  sfxEmitter.on('sfx:item-place', () => playSFX('itemPlace'))
  sfxEmitter.on('sfx:item-rotate', () => playSFX('itemRotate'))
  sfxEmitter.on('sfx:structure-build', () => playSFX('structureBuild'))
  sfxEmitter.on('sfx:structure-delete', () => playSFX('structureDelete'))
  sfxEmitter.on('sfx:shooter-start', () => playSFX('shooterStart'))
  sfxEmitter.on('sfx:shooter-fire', () => playSFX('shooterFire'))
  sfxEmitter.on('sfx:shooter-hit', () => playSFX('shooterHit'))
  sfxEmitter.on('sfx:shooter-kill', () => playSFX('shooterKill'))
  sfxEmitter.on('sfx:shooter-damage', () => playSFX('shooterDamage'))
}

/**
 * Helper function to trigger SFX events from tools
 * @example
 * triggerSFX('sfx:item-place')
 */
export function triggerSFX(event: keyof SFXEvents) {
  sfxEmitter.emit(event)
}
