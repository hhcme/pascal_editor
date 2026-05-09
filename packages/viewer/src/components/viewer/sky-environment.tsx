'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { type ReactNode, useLayoutEffect, useMemo, useRef } from 'react'
import type { Group } from 'three/webgpu'
import * as THREE from 'three/webgpu'
import type { SunStudyState } from '../../lib/sun-study'
import useViewer from '../../store/use-viewer'

type SkyMode = 'day' | 'night'

type CloudPuff = {
  offset: [number, number, number]
  scale: [number, number, number]
  opacity: number
}

type Cloud = {
  position: [number, number, number]
  puffs: CloudPuff[]
}

type Star = {
  position: [number, number, number]
  scale: number
  opacity: number
}

const DAY_SKY = '#78bff2'
const NIGHT_SKY = '#050815'
const CAMERA_FOLLOW_Y = 0
const CLOUD_COUNT = 14
const STAR_COUNT = 140
const SKY_LAYER = 10
const NIGHT_START_MINUTES = 19 * 60
const NIGHT_END_MINUTES = 5 * 60 + 30

function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function randomBetween(seed: number, min: number, max: number) {
  return min + seededRandom(seed) * (max - min)
}

function randomSigned(seed: number, range: number) {
  return randomBetween(seed, -range, range)
}

function resolveSkyMode(theme: 'light' | 'dark', sunStudy: SunStudyState): SkyMode {
  if (theme === 'dark') return 'night'

  if (sunStudy.enabled && sunStudy.mode === 'real') {
    const minutes = sunStudy.minutesOfDay
    if (minutes >= NIGHT_START_MINUTES || minutes <= NIGHT_END_MINUTES) {
      return 'night'
    }
  }

  return 'day'
}

function createClouds(): Cloud[] {
  return Array.from({ length: CLOUD_COUNT }, (_, cloudIndex) => {
    const seed = cloudIndex + 1
    const puffCount = 5 + Math.floor(seededRandom(seed * 3.1) * 4)
    const baseRadius = 220 + seededRandom(seed * 4.7) * 280
    const angle = randomBetween(seed * 5.3, 0, Math.PI * 2)

    return {
      position: [
        Math.cos(angle) * baseRadius,
        randomBetween(seed * 7.9, 180, 420),
        Math.sin(angle) * baseRadius,
      ],
      puffs: Array.from({ length: puffCount }, (_, puffIndex) => {
        const puffSeed = seed * 23 + puffIndex
        const isCore = puffIndex === 0

        return {
          offset: [
            isCore ? 0 : randomSigned(puffSeed * 1.7, 8),
            randomSigned(puffSeed * 2.3, 1.6),
            isCore ? 0 : randomSigned(puffSeed * 3.1, 4.5),
          ],
          scale: [
            randomBetween(puffSeed * 4.1, 26, 64),
            randomBetween(puffSeed * 5.9, 7, 18),
            randomBetween(puffSeed * 6.7, 18, 48),
          ],
          opacity: randomBetween(puffSeed * 8.3, 0.22, 0.42),
        }
      }),
    }
  })
}

function createStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, (_, index) => {
    const seed = index + 1
    const radius = randomBetween(seed * 2.1, 320, 920)
    const angle = randomBetween(seed * 3.7, 0, Math.PI * 2)

    return {
      position: [
        Math.cos(angle) * radius,
        randomBetween(seed * 4.9, 260, 980),
        Math.sin(angle) * radius,
      ],
      scale: randomBetween(seed * 6.1, 0.75, 2.2),
      opacity: randomBetween(seed * 8.9, 0.35, 0.95),
    }
  })
}

function SkyBackdrop({ mode }: { mode: SkyMode }) {
  const targetColor = useMemo(() => new THREE.Color(), [])
  const initialized = useRef(false)

  useFrame(({ scene }, delta) => {
    const dt = Math.min(delta, 0.1) * 4
    const targetHex = mode === 'night' ? NIGHT_SKY : DAY_SKY

    if (!(scene.background && scene.background instanceof THREE.Color)) {
      scene.background = new THREE.Color(targetHex)
      initialized.current = true
      return
    }

    if (!initialized.current) {
      scene.background.set(targetHex)
      initialized.current = true
      return
    }

    targetColor.set(targetHex)
    scene.background.lerp(targetColor, dt)
  })

  return null
}

function CameraAnchoredSky({
  children,
  opacity,
}: {
  children: ReactNode
  opacity: number
}) {
  const groupRef = useRef<Group>(null)

  useLayoutEffect(() => {
    groupRef.current?.traverse((object) => {
      object.layers.set(SKY_LAYER)
    })
  }, [])

  useFrame(({ camera }) => {
    if (!groupRef.current) return

    groupRef.current.position.set(camera.position.x, CAMERA_FOLLOW_Y, camera.position.z)
  })

  return (
    <group frustumCulled={false} ref={groupRef} visible={opacity > 0.01}>
      {children}
    </group>
  )
}

function DayClouds({ opacity }: { opacity: number }) {
  const clouds = useMemo(() => createClouds(), [])

  return (
    <CameraAnchoredSky opacity={opacity}>
      {clouds.map((cloud, cloudIndex) => (
        <group
          frustumCulled={false}
          key={`sky-cloud-${cloudIndex}`}
          position={cloud.position}
          renderOrder={-20}
        >
          {cloud.puffs.map((puff, puffIndex) => (
            <mesh
              frustumCulled={false}
              key={`sky-cloud-${cloudIndex}-puff-${puffIndex}`}
              position={puff.offset}
              renderOrder={-20}
              scale={puff.scale}
            >
              <sphereGeometry args={[1, 16, 8]} />
              <meshBasicMaterial
                color="#ffffff"
                depthWrite={false}
                opacity={puff.opacity * opacity}
                transparent
              />
            </mesh>
          ))}
        </group>
      ))}
    </CameraAnchoredSky>
  )
}

function NightStars({ opacity }: { opacity: number }) {
  const stars = useMemo(() => createStars(), [])

  return (
    <CameraAnchoredSky opacity={opacity}>
      {stars.map((star, index) => (
        <mesh
          frustumCulled={false}
          key={`sky-star-${index}`}
          position={star.position}
          renderOrder={-30}
          scale={star.scale}
        >
          <sphereGeometry args={[1, 8, 4]} />
          <meshBasicMaterial
            color="#ffffff"
            depthWrite={false}
            opacity={star.opacity * opacity}
            transparent
          />
        </mesh>
      ))}
    </CameraAnchoredSky>
  )
}

export function SkyEnvironment() {
  const camera = useThree((state) => state.camera)
  const theme = useViewer((state) => state.theme)
  const sunStudy = useViewer((state) => state.sunStudy)
  const mode = resolveSkyMode(theme, sunStudy)
  const dayOpacity = mode === 'day' ? 1 : 0
  const nightOpacity = mode === 'night' ? 1 : 0

  useFrame(({ camera: activeCamera }) => {
    const cameraLike = activeCamera as typeof activeCamera & { isPerspectiveCamera?: boolean }

    if (cameraLike.isPerspectiveCamera) {
      activeCamera.layers.enable(SKY_LAYER)
    } else {
      activeCamera.layers.disable(SKY_LAYER)
    }
  })

  useLayoutEffect(() => {
    const cameraLike = camera as typeof camera & { isPerspectiveCamera?: boolean }

    if (cameraLike.isPerspectiveCamera) {
      camera.layers.enable(SKY_LAYER)
    } else {
      camera.layers.disable(SKY_LAYER)
    }
  }, [camera])

  return (
    <>
      <SkyBackdrop mode={mode} />
      <DayClouds opacity={dayOpacity} />
      <NightStars opacity={nightOpacity} />
    </>
  )
}
