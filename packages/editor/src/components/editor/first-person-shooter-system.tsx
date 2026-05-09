'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type Group, Vector3 } from 'three'
import { sfxEmitter } from '../../lib/sfx-bus'
import {
  createShooterRuntimeState,
  FIRST_PERSON_SHOOTER_COMMAND_EVENT,
  FIRST_PERSON_SHOOTER_SHOT_EVENT,
  type ShooterCommand,
  type ShooterRuntimeState,
  setFirstPersonShooterPublicState,
  shootShooterMonster,
  toShooterPublicState,
  updateShooterRuntime,
} from './first-person-shooter-utils'

const _shotDirection = new Vector3()

function readCommand(event: Event): ShooterCommand | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
    return null
  }

  const command = (event.detail as { command?: unknown }).command
  return command === 'start' || command === 'stop' || command === 'restart' ? command : null
}

function MonsterMesh({ monster }: { monster: ShooterRuntimeState['monsters'][number] }) {
  const { camera } = useThree()
  const healthBarRef = useRef<Group>(null)
  const wobble = useMemo(() => Math.random() * Math.PI * 2, [])
  const healthRatio = Math.max(0, Math.min(1, monster.health / Math.max(1, monster.maxHealth)))
  const healthColor = healthRatio > 0.5 ? '#22c55e' : healthRatio > 0.25 ? '#f59e0b' : '#ef4444'

  useFrame(() => {
    if (!healthBarRef.current) return
    healthBarRef.current.quaternion.copy(camera.quaternion)
  })

  return (
    <group position={[monster.x, monster.y, monster.z]} rotation={[0, wobble, 0]}>
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
        <meshStandardMaterial color="#7f1d1d" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh castShadow position={[0, 1.34, 0]}>
        <sphereGeometry args={[0.36, 14, 10]} />
        <meshStandardMaterial color="#991b1b" roughness={0.65} />
      </mesh>
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

export function FirstPersonShooterSystem() {
  const { camera } = useThree()
  const runtimeRef = useRef(createShooterRuntimeState(true))
  const [runtime, setRuntime] = useState(() => runtimeRef.current)

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

    const handleCommand = (event: Event) => {
      const command = readCommand(event)
      if (!command) return

      if (command === 'stop') {
        reset(false)
        return
      }

      reset(true)
    }

    const handleShot = () => {
      const previous = runtimeRef.current
      camera.getWorldDirection(_shotDirection)
      const next = shootShooterMonster(previous, camera.position, _shotDirection)
      runtimeRef.current = next
      setRuntime(next)
      publish(next)
      if (!(previous.active && !previous.gameOver)) return
      sfxEmitter.emit('sfx:shooter-fire')
      if (next.kills > previous.kills) {
        sfxEmitter.emit('sfx:shooter-kill')
      } else if (next.lastShotHit) {
        sfxEmitter.emit('sfx:shooter-hit')
      }
    }

    publish(runtimeRef.current)
    sfxEmitter.emit('sfx:shooter-start')
    window.addEventListener(FIRST_PERSON_SHOOTER_COMMAND_EVENT, handleCommand)
    window.addEventListener(FIRST_PERSON_SHOOTER_SHOT_EVENT, handleShot)

    return () => {
      window.removeEventListener(FIRST_PERSON_SHOOTER_COMMAND_EVENT, handleCommand)
      window.removeEventListener(FIRST_PERSON_SHOOTER_SHOT_EVENT, handleShot)
      setFirstPersonShooterPublicState(toShooterPublicState(createShooterRuntimeState(false)), {
        notify: true,
      })
    }
  }, [camera])

  useFrame((_, delta) => {
    const previous = runtimeRef.current
    const next = updateShooterRuntime(previous, camera.position, delta)
    if (next === previous) return

    runtimeRef.current = next
    setRuntime(next)
    setFirstPersonShooterPublicState(toShooterPublicState(next), { notify: true })
    if (next.health < previous.health) sfxEmitter.emit('sfx:shooter-damage')
  })

  if (!runtime.active) return null

  return (
    <>
      {runtime.monsters.map((monster) => (
        <MonsterMesh key={monster.id} monster={monster} />
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
