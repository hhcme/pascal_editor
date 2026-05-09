'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type Group, Vector3 } from 'three'
import { sfxEmitter } from '../../lib/sfx-bus'
import {
  createShooterRuntimeState,
  DEFAULT_SHOOTER_CONFIG,
  FIRST_PERSON_SHOOTER_COMMAND_EVENT,
  FIRST_PERSON_SHOOTER_GRENADE_EVENT,
  FIRST_PERSON_SHOOTER_RELOAD_EVENT,
  FIRST_PERSON_SHOOTER_SETTINGS_EVENT,
  FIRST_PERSON_SHOOTER_SHOT_EVENT,
  reloadShooterWeapon,
  type ShooterCommand,
  type ShooterRuntimeState,
  type ShooterSettingsPayload,
  type ShooterShotPayload,
  setFirstPersonShooterPublicState,
  shootShooterMonster,
  throwShooterGrenade,
  toShooterPublicState,
  updateShooterRuntime,
} from './first-person-shooter-utils'

const _shotDirection = new Vector3()
const _shotTarget = new Vector3()
const EXPLOSION_DURATION = 0.72

type ShooterExplosion = {
  id: string
  kind: 'blast' | 'detonation'
  x: number
  y: number
  z: number
}

function readCommand(event: Event): ShooterCommand | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
    return null
  }

  const command = (event.detail as { command?: unknown }).command
  return command === 'start' || command === 'stop' || command === 'restart' ? command : null
}

function readSettings(event: Event): ShooterSettingsPayload | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
    return null
  }

  const detail = event.detail as ShooterSettingsPayload
  return {
    weapon:
      detail.weapon === 'pistol' || detail.weapon === 'sniper' || detail.weapon === 'knife'
        ? detail.weapon
        : undefined,
    stance:
      detail.stance === 'stand' || detail.stance === 'crouch' || detail.stance === 'prone'
        ? detail.stance
        : undefined,
    scoped: typeof detail.scoped === 'boolean' ? detail.scoped : undefined,
  }
}

function MonsterMesh({ monster }: { monster: ShooterRuntimeState['monsters'][number] }) {
  const { camera } = useThree()
  const healthBarRef = useRef<Group>(null)
  const wobble = useMemo(() => Math.random() * Math.PI * 2, [])
  const healthRatio = Math.max(0, Math.min(1, monster.health / Math.max(1, monster.maxHealth)))
  const healthColor = healthRatio > 0.5 ? '#22c55e' : healthRatio > 0.25 ? '#f59e0b' : '#ef4444'
  const bodyColor =
    monster.kind === 'runner' ? '#b91c1c' : monster.kind === 'brute' ? '#581c87' : '#7f1d1d'
  const headColor =
    monster.kind === 'runner' ? '#dc2626' : monster.kind === 'brute' ? '#6d28d9' : '#991b1b'
  const scale = monster.kind === 'runner' ? 0.86 : monster.kind === 'brute' ? 1.18 : 1

  useFrame(() => {
    if (!healthBarRef.current) return
    healthBarRef.current.quaternion.copy(camera.quaternion)
  })

  return (
    <group position={[monster.x, monster.y, monster.z]} rotation={[0, wobble, 0]} scale={scale}>
      <group ref={healthBarRef} position={[0, 2.05, 0]}>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[0.92, 0.13]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.72} depthTest={false} />
        </mesh>
        <mesh position={[-0.46 * (1 - healthRatio), 0, 0.01]} scale={[healthRatio, 1, 1]}>
          <planeGeometry args={[0.82, 0.07]} />
          <meshBasicMaterial color={healthColor} transparent opacity={0.96} depthTest={false} />
        </mesh>
      </group>
      <mesh castShadow position={[0, 0.72, 0]}>
        <capsuleGeometry args={[0.34, 0.72, 5, 10]} />
        <meshStandardMaterial color={bodyColor} roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh castShadow position={[0, 1.34, 0]}>
        <sphereGeometry args={[0.36, 14, 10]} />
        <meshStandardMaterial color={headColor} roughness={0.65} />
      </mesh>
      {monster.kind === 'brute' ? (
        <mesh castShadow position={[0, 1.78, -0.02]}>
          <boxGeometry args={[0.72, 0.18, 0.28]} />
          <meshStandardMaterial color="#a855f7" emissive="#6d28d9" emissiveIntensity={0.45} />
        </mesh>
      ) : null}
      {monster.kind === 'runner' ? (
        <mesh castShadow position={[0, 1.72, -0.02]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.48, 0.08, 0.18]} />
          <meshStandardMaterial color="#facc15" emissive="#f97316" emissiveIntensity={0.7} />
        </mesh>
      ) : null}
      <mesh castShadow position={[-0.13, 1.4, -0.28]}>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshStandardMaterial color="#fde68a" emissive="#f97316" emissiveIntensity={1.4} />
      </mesh>
      <mesh castShadow position={[0.13, 1.4, -0.28]}>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshStandardMaterial color="#fde68a" emissive="#f97316" emissiveIntensity={1.4} />
      </mesh>
      <mesh castShadow position={[-0.34, 0.82, 0]} rotation={[0, 0, -0.42]}>
        <capsuleGeometry args={[0.08, 0.42, 4, 8]} />
        <meshStandardMaterial color="#5b1111" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.34, 0.82, 0]} rotation={[0, 0, 0.42]}>
        <capsuleGeometry args={[0.08, 0.42, 4, 8]} />
        <meshStandardMaterial color="#5b1111" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.58, 18]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.22} />
      </mesh>
    </group>
  )
}

function SupplyMesh({ supply }: { supply: ShooterRuntimeState['supplies'][number] }) {
  const groupRef = useRef<Group>(null)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y += delta * 1.6
  })

  return (
    <group ref={groupRef} position={[supply.x, supply.y + 0.45, supply.z]}>
      <pointLight color="#38bdf8" distance={4.5} intensity={0.7} />
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.82, 0.5, 0.56]} />
        <meshStandardMaterial color="#0f766e" roughness={0.48} metalness={0.06} />
      </mesh>
      <mesh position={[0, 0.26, -0.285]}>
        <boxGeometry args={[0.16, 0.38, 0.02]} />
        <meshBasicMaterial color="#e0f2fe" />
      </mesh>
      <mesh position={[0, 0.26, -0.29]}>
        <boxGeometry args={[0.46, 0.12, 0.02]} />
        <meshBasicMaterial color="#e0f2fe" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.68, 0.86, 24]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

function ExplosionEffect({
  explosion,
  onDone,
}: {
  explosion: ShooterExplosion
  onDone: (id: string) => void
}) {
  const groupRef = useRef<Group>(null)
  const elapsedRef = useRef(0)
  const [progress, setProgress] = useState(0)

  useFrame((_, delta) => {
    elapsedRef.current += delta
    const nextProgress = Math.min(1, elapsedRef.current / EXPLOSION_DURATION)
    setProgress(nextProgress)
    if (nextProgress >= 1) onDone(explosion.id)
  })

  const blastScale = 0.55 + progress * 4.4
  const coreScale = Math.max(0.1, 1.15 - progress * 0.55)
  const opacity = Math.max(0, 1 - progress)
  const isDetonation = explosion.kind === 'detonation'

  return (
    <group ref={groupRef} position={[explosion.x, explosion.y + 0.65, explosion.z]}>
      <pointLight
        color="#f97316"
        distance={(isDetonation ? 5 : 8) + progress * 7}
        intensity={Math.max(0, (isDetonation ? 2.8 : 5.5) * opacity)}
      />
      <mesh scale={[coreScale, coreScale, coreScale]}>
        <sphereGeometry args={[0.58, 16, 12]} />
        <meshBasicMaterial
          color="#fef3c7"
          transparent
          opacity={0.62 * opacity}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={[blastScale, blastScale, blastScale]}>
        <sphereGeometry args={[0.42, 16, 10]} />
        <meshBasicMaterial
          color="#fb923c"
          transparent
          opacity={0.24 * opacity}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[blastScale * 1.25, blastScale * 1.25, 1]}>
        <ringGeometry args={[0.34, 0.52, 28]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0.48 * opacity}
          depthWrite={false}
        />
      </mesh>
      {!isDetonation ? (
        <>
          <mesh position={[0.18, 0.28 + progress * 1.2, -0.1]} scale={[0.7, 0.7, 0.7]}>
            <sphereGeometry args={[0.22 + progress * 0.18, 10, 8]} />
            <meshBasicMaterial
              color="#7f1d1d"
              transparent
              opacity={0.36 * opacity}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[-0.3, 0.46 + progress * 1.5, 0.24]} scale={[0.55, 0.55, 0.55]}>
            <sphereGeometry args={[0.22 + progress * 0.16, 10, 8]} />
            <meshBasicMaterial
              color="#111827"
              transparent
              opacity={0.28 * opacity}
              depthWrite={false}
            />
          </mesh>
        </>
      ) : null}
    </group>
  )
}

export function FirstPersonShooterSystem() {
  const { camera, gl } = useThree()
  const runtimeRef = useRef(createShooterRuntimeState(true))
  const [runtime, setRuntime] = useState(() => runtimeRef.current)
  const [explosions, setExplosions] = useState<ShooterExplosion[]>([])

  useEffect(() => {
    const publish = (state: ShooterRuntimeState) => {
      setFirstPersonShooterPublicState(toShooterPublicState(state), { notify: true })
    }

    const reset = (active: boolean) => {
      const next = createShooterRuntimeState(active)
      runtimeRef.current = next
      setRuntime(next)
      publish(next)
      if (active) sfxEmitter.emit('sfx:shooter-start')
    }

    const addKillExplosions = (previous: ShooterRuntimeState, next: ShooterRuntimeState) => {
      const survivingIds = new Set(next.monsters.map((monster) => monster.id))
      const killedMonsters = previous.monsters.filter((monster) => !survivingIds.has(monster.id))
      if (killedMonsters.length === 0) return

      setExplosions((current) => [
        ...current,
        ...killedMonsters.map((monster, index) => ({
          id: `${monster.id}-${performance.now()}-${index}`,
          kind: 'blast' as const,
          x: monster.x,
          y: monster.y,
          z: monster.z,
        })),
      ])
      sfxEmitter.emit('sfx:shooter-explosion')
    }

    const addDetonation = (origin: Vector3, direction: Vector3, state: ShooterRuntimeState) => {
      let targetDistance = DEFAULT_SHOOTER_CONFIG.grenadeRange

      for (const monster of state.monsters) {
        const ox = monster.x - origin.x
        const oy = monster.y + 0.8 - origin.y
        const oz = monster.z - origin.z
        const projected = ox * direction.x + oy * direction.y + oz * direction.z
        if (projected > 0 && projected < targetDistance) targetDistance = projected
      }

      setExplosions((current) => [
        ...current,
        {
          id: `grenade-${performance.now()}`,
          kind: 'detonation',
          x: origin.x + direction.x * targetDistance,
          y: origin.y + direction.y * targetDistance - 0.65,
          z: origin.z + direction.z * targetDistance,
        },
      ])
    }

    const emitWeaponFire = (state: ShooterRuntimeState) => {
      if (state.weapon === 'sniper') {
        sfxEmitter.emit('sfx:shooter-sniper')
      } else if (state.weapon === 'knife') {
        sfxEmitter.emit('sfx:shooter-knife')
      } else {
        sfxEmitter.emit('sfx:shooter-pistol')
      }
    }

    const handleCommand = (event: Event) => {
      const command = readCommand(event)
      if (!command) return

      if (command === 'stop') {
        reset(false)
        return
      }

      reset(true)
    }

    const handleSettings = (event: Event) => {
      const settings = readSettings(event)
      if (!settings) return

      const previous = runtimeRef.current
      const next: ShooterRuntimeState = {
        ...previous,
        weapon: settings.weapon ?? previous.weapon,
        stance: settings.stance ?? previous.stance,
        scoped: settings.scoped ?? previous.scoped,
      }
      if (next.weapon !== 'sniper') next.scoped = false
      runtimeRef.current = next
      setRuntime(next)
      publish(next)
    }

    const handleReload = () => {
      const previous = runtimeRef.current
      const next = reloadShooterWeapon(previous)
      if (next === previous) return
      runtimeRef.current = next
      setRuntime(next)
      publish(next)
    }

    const getShotDirection = (payload: unknown) => {
      const canvas = gl.domElement
      const rect = canvas.getBoundingClientRect()
      const detail = payload as Partial<ShooterShotPayload> | undefined
      const clientX = Number.isFinite(detail?.clientX)
        ? Number(detail?.clientX)
        : rect.left + rect.width / 2
      const clientY = Number.isFinite(detail?.clientY)
        ? Number(detail?.clientY)
        : rect.top + rect.height / 2

      if (rect.width <= 0 || rect.height <= 0) {
        camera.getWorldDirection(_shotDirection)
        return _shotDirection
      }

      _shotTarget.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
        0.5,
      )
      _shotTarget.unproject(camera)
      _shotDirection.copy(_shotTarget).sub(camera.position).normalize()
      return _shotDirection
    }

    const handleShot = (event: Event) => {
      const previous = runtimeRef.current
      const payload = event instanceof CustomEvent ? event.detail : undefined
      const detail = payload as Partial<ShooterShotPayload> | undefined
      const next = shootShooterMonster(
        detail?.weapon ? { ...previous, weapon: detail.weapon } : previous,
        camera.position,
        getShotDirection(payload),
      )
      runtimeRef.current = next
      setRuntime(next)
      publish(next)
      if (!(previous.active && !previous.gameOver) || !next.lastShotFired) return
      emitWeaponFire(previous)
      addKillExplosions(previous, next)
      if (next.kills > previous.kills) {
        sfxEmitter.emit('sfx:shooter-kill')
        if (next.lastComboBonus > 0) sfxEmitter.emit('sfx:shooter-combo')
      } else if (next.lastShotHit) {
        sfxEmitter.emit('sfx:shooter-hit')
      }
    }

    const handleGrenade = (event: Event) => {
      const previous = runtimeRef.current
      const payload = event instanceof CustomEvent ? event.detail : undefined
      const shotDirection = getShotDirection(payload).clone()
      const next = throwShooterGrenade(previous, camera.position, shotDirection)
      runtimeRef.current = next
      setRuntime(next)
      publish(next)
      if (!(previous.active && !previous.gameOver) || !next.lastShotFired) return
      sfxEmitter.emit('sfx:shooter-grenade')
      addDetonation(camera.position, shotDirection, previous)
      addKillExplosions(previous, next)
      if (next.kills > previous.kills) {
        sfxEmitter.emit('sfx:shooter-kill')
        if (next.lastComboBonus > 0) sfxEmitter.emit('sfx:shooter-combo')
      } else if (next.lastShotHit) {
        sfxEmitter.emit('sfx:shooter-hit')
      }
    }

    publish(runtimeRef.current)
    sfxEmitter.emit('sfx:shooter-start')
    window.addEventListener(FIRST_PERSON_SHOOTER_COMMAND_EVENT, handleCommand)
    window.addEventListener(FIRST_PERSON_SHOOTER_SETTINGS_EVENT, handleSettings)
    window.addEventListener(FIRST_PERSON_SHOOTER_RELOAD_EVENT, handleReload)
    window.addEventListener(FIRST_PERSON_SHOOTER_SHOT_EVENT, handleShot)
    window.addEventListener(FIRST_PERSON_SHOOTER_GRENADE_EVENT, handleGrenade)

    return () => {
      window.removeEventListener(FIRST_PERSON_SHOOTER_COMMAND_EVENT, handleCommand)
      window.removeEventListener(FIRST_PERSON_SHOOTER_SETTINGS_EVENT, handleSettings)
      window.removeEventListener(FIRST_PERSON_SHOOTER_RELOAD_EVENT, handleReload)
      window.removeEventListener(FIRST_PERSON_SHOOTER_SHOT_EVENT, handleShot)
      window.removeEventListener(FIRST_PERSON_SHOOTER_GRENADE_EVENT, handleGrenade)
      setFirstPersonShooterPublicState(toShooterPublicState(createShooterRuntimeState(false)), {
        notify: true,
      })
    }
  }, [camera, gl])

  const removeExplosion = (id: string) => {
    setExplosions((current) => current.filter((explosion) => explosion.id !== id))
  }

  useFrame((_, delta) => {
    const previous = runtimeRef.current
    const next = updateShooterRuntime(previous, camera.position, delta)
    if (next === previous) return

    runtimeRef.current = next
    setRuntime(next)
    setFirstPersonShooterPublicState(toShooterPublicState(next), { notify: true })
    if (next.health < previous.health) sfxEmitter.emit('sfx:shooter-damage')
    if (next.spawnWarningTimer > 0 && previous.spawnWarningTimer <= 0) {
      sfxEmitter.emit('sfx:shooter-spawn-warning')
    }
    if (next.supplyFlashTimer > previous.supplyFlashTimer) sfxEmitter.emit('sfx:shooter-hit')
  })

  if (!runtime.active) return null

  return (
    <>
      {runtime.monsters.map((monster) => (
        <MonsterMesh key={monster.id} monster={monster} />
      ))}
      {runtime.supplies.map((supply) => (
        <SupplyMesh key={supply.id} supply={supply} />
      ))}
      {explosions.map((explosion) => (
        <ExplosionEffect key={explosion.id} explosion={explosion} onDone={removeExplosion} />
      ))}
      {runtime.hitPulse > 0 && runtime.lastShotHit === true ? (
        <pointLight
          color="#fef3c7"
          distance={6}
          intensity={1.8}
          position={[camera.position.x, camera.position.y - 0.2, camera.position.z]}
        />
      ) : null}
    </>
  )
}
