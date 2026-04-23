import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Fog,
  type Group,
  type LineBasicMaterial,
  MathUtils,
  type PointLight,
  type PointsMaterial,
  Vector3,
} from 'three'
import { resolveWeatherState, type WeatherMode } from '../../lib/weather'
import useViewer from '../../store/use-viewer'

const RAIN_DROP_COUNT = 760
const SNOW_FLAKE_COUNT = 620
const CLOUD_CLUSTER_COUNT = 18
const PUDDLE_COUNT = 26
const SNOW_PATCH_COUNT = 34
const RAIN_RADIUS = 42
const RAIN_HEIGHT = 34
const SNOW_RADIUS = 44
const SNOW_HEIGHT = 32
const GROUND_EFFECT_RADIUS = 62
const CLOUD_RADIUS = 74
const CLOUD_WRAP_PADDING = 24
const LIGHTNING_SEGMENTS = 18

type RainRuntime = {
  geometry: BufferGeometry
  positions: Float32Array
  speeds: Float32Array
}

type SnowRuntime = {
  geometry: BufferGeometry
  positions: Float32Array
  speeds: Float32Array
  phases: Float32Array
}

type WindVector = {
  x: number
  z: number
  speed: number
}

type GroundPatch = {
  x: number
  z: number
  rotation: number
  scaleX: number
  scaleZ: number
  opacity: number
}

type CloudPuff = {
  offsetX: number
  offsetY: number
  offsetZ: number
  scaleX: number
  scaleY: number
  scaleZ: number
  opacity: number
}

type CloudCluster = {
  x: number
  y: number
  z: number
  phase: number
  driftSpeed: number
  swayAmount: number
  swaySpeed: number
  bobAmount: number
  opacity: number
  puffs: CloudPuff[]
}

function randomSigned(range: number) {
  return (Math.random() - 0.5) * range
}

function getWindVector(directionDeg: number, speed: number): WindVector {
  const radians = MathUtils.degToRad(directionDeg)
  const windSpeed = MathUtils.clamp(speed, 0, 1)

  return {
    x: Math.sin(radians) * windSpeed,
    z: -Math.cos(radians) * windSpeed,
    speed: windSpeed,
  }
}

function resetRainDrop(
  positions: Float32Array,
  index: number,
  wind: WindVector,
  particleSize: number,
  height = RAIN_HEIGHT + Math.random() * 8,
) {
  const x = randomSigned(RAIN_RADIUS * 2)
  const y = height
  const z = randomSigned(RAIN_RADIUS * 2)
  const length = (1.1 + Math.random() * 1.8) * MathUtils.lerp(0.62, 1.85, particleSize)
  const slantX = wind.x * MathUtils.lerp(0.24, 1.2, wind.speed)
  const slantZ = wind.z * MathUtils.lerp(0.18, 0.96, wind.speed)

  positions[index] = x
  positions[index + 1] = y
  positions[index + 2] = z
  positions[index + 3] = x - 0.18 - slantX
  positions[index + 4] = y - length
  positions[index + 5] = z + 0.1 - slantZ
}

function createRainRuntime(): RainRuntime {
  const positions = new Float32Array(RAIN_DROP_COUNT * 2 * 3)
  const speeds = new Float32Array(RAIN_DROP_COUNT)

  for (let i = 0; i < RAIN_DROP_COUNT; i++) {
    const x = randomSigned(RAIN_RADIUS * 2)
    const y = Math.random() * RAIN_HEIGHT + 3
    const z = randomSigned(RAIN_RADIUS * 2)
    const length = 1.6 + Math.random() * 1.8
    const index = i * 6

    positions[index] = x
    positions[index + 1] = y
    positions[index + 2] = z
    positions[index + 3] = x - 0.18
    positions[index + 4] = y - length
    positions[index + 5] = z + 0.1
    speeds[i] = 18 + Math.random() * 15
  }

  const geometry = new BufferGeometry()
  const attribute = new BufferAttribute(positions, 3)
  attribute.setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', attribute)

  return { geometry, positions, speeds }
}

function createSnowRuntime(): SnowRuntime {
  const positions = new Float32Array(SNOW_FLAKE_COUNT * 3)
  const speeds = new Float32Array(SNOW_FLAKE_COUNT)
  const phases = new Float32Array(SNOW_FLAKE_COUNT)

  for (let i = 0; i < SNOW_FLAKE_COUNT; i++) {
    const index = i * 3
    positions[index] = randomSigned(SNOW_RADIUS * 2)
    positions[index + 1] = Math.random() * SNOW_HEIGHT + 2
    positions[index + 2] = randomSigned(SNOW_RADIUS * 2)
    speeds[i] = 1.2 + Math.random() * 2.4
    phases[i] = Math.random() * Math.PI * 2
  }

  const geometry = new BufferGeometry()
  const attribute = new BufferAttribute(positions, 3)
  attribute.setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', attribute)

  return { geometry, positions, speeds, phases }
}

function updateWeatherVolumePosition(group: Group | null, cameraPosition: Vector3) {
  if (!group) return

  group.position.set(cameraPosition.x, 0, cameraPosition.z)
}

function RainField({
  intensity,
  particleSize,
  storm = false,
  wind,
}: {
  intensity: number
  particleSize: number
  storm?: boolean
  wind: WindVector
}) {
  const groupRef = useRef<Group>(null)
  const runtime = useMemo(() => createRainRuntime(), [])
  const materialRef = useRef<LineBasicMaterial>(null)
  const cameraPosition = useMemo(() => new Vector3(), [])

  useFrame(({ camera }, delta) => {
    camera.getWorldPosition(cameraPosition)
    updateWeatherVolumePosition(groupRef.current, cameraPosition)

    const speedScale = MathUtils.lerp(0.58, storm ? 1.24 : 1, intensity)
    const windPush = MathUtils.lerp(2.4, 10.5, wind.speed) * Math.min(delta, 0.08)
    const positions = runtime.positions

    for (let i = 0; i < RAIN_DROP_COUNT; i++) {
      const index = i * 6
      const fallDistance = runtime.speeds[i]! * speedScale * Math.min(delta, 0.08)
      const driftX = wind.x * windPush
      const driftZ = wind.z * windPush
      positions[index] = positions[index]! + driftX
      positions[index + 1] = positions[index + 1]! - fallDistance
      positions[index + 2] = positions[index + 2]! + driftZ
      positions[index + 3] = positions[index + 3]! + driftX
      positions[index + 4] = positions[index + 4]! - fallDistance
      positions[index + 5] = positions[index + 5]! + driftZ

      if (
        positions[index + 4]! < -1.5 ||
        Math.abs(positions[index]!) > RAIN_RADIUS ||
        Math.abs(positions[index + 2]!) > RAIN_RADIUS
      ) {
        resetRainDrop(positions, index, wind, particleSize)
      }
    }

    const attribute = runtime.geometry.getAttribute('position') as BufferAttribute
    attribute.needsUpdate = true

    if (materialRef.current) {
      materialRef.current.opacity = MathUtils.lerp(
        materialRef.current.opacity,
        storm ? 0.54 : 0.34 + intensity * 0.18,
        0.08,
      )
      materialRef.current.linewidth = MathUtils.lerp(1, 2.6, particleSize)
    }
  })

  return (
    <group frustumCulled={false} ref={groupRef}>
      <lineSegments frustumCulled={false} geometry={runtime.geometry} renderOrder={40}>
        <lineBasicMaterial
          color={storm ? '#b7cdf5' : '#8fb5d7'}
          depthWrite={false}
          opacity={0.42}
          ref={materialRef}
          transparent
        />
      </lineSegments>
    </group>
  )
}

function SnowField({
  intensity,
  particleSize,
  wind,
}: {
  intensity: number
  particleSize: number
  wind: WindVector
}) {
  const groupRef = useRef<Group>(null)
  const runtime = useMemo(() => createSnowRuntime(), [])
  const materialRef = useRef<PointsMaterial>(null)
  const cameraPosition = useMemo(() => new Vector3(), [])

  useFrame(({ camera, clock }, delta) => {
    camera.getWorldPosition(cameraPosition)
    updateWeatherVolumePosition(groupRef.current, cameraPosition)

    const elapsed = clock.elapsedTime
    const driftScale = MathUtils.lerp(0.18, 0.52, intensity)
    const windPush = MathUtils.lerp(0.5, 4.8, wind.speed) * Math.min(delta, 0.08)
    const positions = runtime.positions

    for (let i = 0; i < SNOW_FLAKE_COUNT; i++) {
      const index = i * 3
      const phase = runtime.phases[i]!
      positions[index] =
        positions[index]! + Math.sin(elapsed * 0.9 + phase) * driftScale * delta + wind.x * windPush
      positions[index + 1] =
        positions[index + 1]! - runtime.speeds[i]! * MathUtils.lerp(0.8, 1.34, intensity) * delta
      positions[index + 2] =
        positions[index + 2]! +
        Math.cos(elapsed * 0.7 + phase) * driftScale * delta +
        wind.z * windPush

      if (
        positions[index + 1]! < -0.5 ||
        Math.abs(positions[index]!) > SNOW_RADIUS ||
        Math.abs(positions[index + 2]!) > SNOW_RADIUS
      ) {
        positions[index] = randomSigned(SNOW_RADIUS * 2)
        positions[index + 1] = SNOW_HEIGHT + Math.random() * 6
        positions[index + 2] = randomSigned(SNOW_RADIUS * 2)
      }
    }

    const attribute = runtime.geometry.getAttribute('position') as BufferAttribute
    attribute.needsUpdate = true

    if (materialRef.current) {
      materialRef.current.opacity = MathUtils.lerp(
        materialRef.current.opacity,
        0.58 + intensity * 0.2,
        0.08,
      )
      materialRef.current.size = MathUtils.lerp(
        materialRef.current.size,
        MathUtils.lerp(0.045, 0.2, particleSize) + intensity * 0.035,
        0.08,
      )
    }
  })

  return (
    <group frustumCulled={false} ref={groupRef}>
      <points frustumCulled={false} geometry={runtime.geometry} renderOrder={42}>
        <pointsMaterial
          color="#ffffff"
          depthWrite={false}
          opacity={0.68}
          ref={materialRef}
          size={0.1}
          sizeAttenuation
          transparent
        />
      </points>
    </group>
  )
}

function writeLightningSegment(
  positions: Float32Array,
  segmentIndex: number,
  from: Vector3,
  to: Vector3,
) {
  const index = segmentIndex * 6
  positions[index] = from.x
  positions[index + 1] = from.y
  positions[index + 2] = from.z
  positions[index + 3] = to.x
  positions[index + 4] = to.y
  positions[index + 5] = to.z
}

function LightningField({ intensity }: { intensity: number }) {
  const groupRef = useRef<Group>(null)
  const lightRef = useRef<PointLight>(null)
  const materialRef = useRef<LineBasicMaterial>(null)
  const cameraPosition = useMemo(() => new Vector3(), [])
  const flash = useRef(0)
  const nextFlash = useRef(1.2)
  const positions = useMemo(() => new Float32Array(LIGHTNING_SEGMENTS * 2 * 3), [])
  const geometry = useMemo(() => {
    const boltGeometry = new BufferGeometry()
    const attribute = new BufferAttribute(positions, 3)
    attribute.setUsage(DynamicDrawUsage)
    boltGeometry.setAttribute('position', attribute)
    boltGeometry.setDrawRange(0, 0)
    return boltGeometry
  }, [positions])

  const regenerateBolt = () => {
    let segmentIndex = 0
    const from = new Vector3(randomSigned(18), 38 + Math.random() * 10, -26 + randomSigned(16))
    const to = new Vector3()

    for (let i = 0; i < 10 && segmentIndex < LIGHTNING_SEGMENTS; i++) {
      to.set(
        from.x + randomSigned(4.5),
        from.y - (2.5 + Math.random() * 3.4),
        from.z + randomSigned(4.5),
      )
      writeLightningSegment(positions, segmentIndex, from, to)
      segmentIndex++

      if (i > 2 && Math.random() > 0.58 && segmentIndex < LIGHTNING_SEGMENTS) {
        const branch = new Vector3(
          to.x + randomSigned(7),
          to.y - Math.random() * 3,
          to.z + randomSigned(7),
        )
        writeLightningSegment(positions, segmentIndex, to, branch)
        segmentIndex++
      }

      from.copy(to)
    }

    const attribute = geometry.getAttribute('position') as BufferAttribute
    attribute.needsUpdate = true
    geometry.setDrawRange(0, segmentIndex * 2)
  }

  useFrame(({ camera }, delta) => {
    camera.getWorldPosition(cameraPosition)
    updateWeatherVolumePosition(groupRef.current, cameraPosition)

    nextFlash.current -= delta
    if (nextFlash.current <= 0) {
      flash.current = 1
      nextFlash.current = MathUtils.lerp(2.8, 1.1, intensity) + Math.random() * 2.4
      regenerateBolt()
    }

    flash.current = Math.max(0, flash.current - delta * 5.2)
    const flashPower = flash.current > 0.04 ? flash.current ** 2 : 0

    if (lightRef.current) {
      lightRef.current.intensity = flashPower * MathUtils.lerp(18, 42, intensity)
    }

    if (materialRef.current) {
      materialRef.current.opacity = flashPower * 0.92
    }

    if (flashPower <= 0.002) {
      geometry.setDrawRange(0, 0)
    }
  })

  return (
    <group frustumCulled={false} ref={groupRef}>
      <pointLight
        color="#dbeafe"
        distance={180}
        intensity={0}
        position={[0, 32, -12]}
        ref={lightRef}
      />
      <lineSegments frustumCulled={false} geometry={geometry} renderOrder={45}>
        <lineBasicMaterial
          color="#f8fbff"
          depthWrite={false}
          opacity={0}
          ref={materialRef}
          transparent
        />
      </lineSegments>
    </group>
  )
}

function createGroundPatches(count: number, radius: number): GroundPatch[] {
  return Array.from({ length: count }, () => ({
    x: randomSigned(radius * 2),
    z: randomSigned(radius * 2),
    rotation: Math.random() * Math.PI,
    scaleX: 1.6 + Math.random() * 5.5,
    scaleZ: 0.6 + Math.random() * 2.2,
    opacity: 0.05 + Math.random() * 0.12,
  }))
}

function WeatherGroundLayer({ intensity, mode }: { intensity: number; mode: WeatherMode }) {
  const groupRef = useRef<Group>(null)
  const cameraPosition = useMemo(() => new Vector3(), [])
  const puddles = useMemo(() => createGroundPatches(PUDDLE_COUNT, GROUND_EFFECT_RADIUS), [])
  const snowPatches = useMemo(() => createGroundPatches(SNOW_PATCH_COUNT, GROUND_EFFECT_RADIUS), [])
  const isRain = mode === 'rain' || mode === 'thunder'
  const isSnow = mode === 'snow'

  useFrame(({ camera }) => {
    camera.getWorldPosition(cameraPosition)
    updateWeatherVolumePosition(groupRef.current, cameraPosition)
  })

  if (!(isRain || isSnow)) return null

  return (
    <group frustumCulled={false} ref={groupRef}>
      {isRain ? (
        <>
          <mesh position-y={0.012} renderOrder={26} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[GROUND_EFFECT_RADIUS, 96]} />
            <meshBasicMaterial
              color={mode === 'thunder' ? '#93a4ba' : '#bed6ea'}
              depthWrite={false}
              opacity={MathUtils.lerp(0.08, mode === 'thunder' ? 0.2 : 0.15, intensity)}
              transparent
            />
          </mesh>
          {puddles.map((patch, index) => (
            <mesh
              key={`puddle-${index}`}
              position={[patch.x, 0.018, patch.z]}
              renderOrder={27}
              rotation={[-Math.PI / 2, 0, patch.rotation]}
              scale={[patch.scaleX, patch.scaleZ, 1]}
            >
              <circleGeometry args={[1, 24]} />
              <meshBasicMaterial
                color="#e9f8ff"
                depthWrite={false}
                opacity={patch.opacity * MathUtils.lerp(0.65, 1.6, intensity)}
                transparent
              />
            </mesh>
          ))}
        </>
      ) : null}
      {isSnow ? (
        <>
          <mesh position-y={0.014} renderOrder={26} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[GROUND_EFFECT_RADIUS, 96]} />
            <meshBasicMaterial
              color="#f8fbff"
              depthWrite={false}
              opacity={MathUtils.lerp(0.1, 0.36, intensity)}
              transparent
            />
          </mesh>
          {snowPatches.map((patch, index) => (
            <mesh
              key={`snow-${index}`}
              position={[patch.x, 0.02, patch.z]}
              renderOrder={27}
              rotation={[-Math.PI / 2, 0, patch.rotation]}
              scale={[patch.scaleX * 1.2, patch.scaleZ * 1.1, 1]}
            >
              <circleGeometry args={[1, 20]} />
              <meshBasicMaterial
                color="#ffffff"
                depthWrite={false}
                opacity={(patch.opacity + 0.08) * MathUtils.lerp(0.75, 1.8, intensity)}
                transparent
              />
            </mesh>
          ))}
        </>
      ) : null}
    </group>
  )
}

function createCloudPuffs(width: number, depth: number, height: number): CloudPuff[] {
  const puffCount = 5 + Math.floor(Math.random() * 5)

  return Array.from({ length: puffCount }, (_, index) => {
    const isCore = index === 0
    const offsetX = isCore ? 0 : randomSigned(width * 1.15)
    const offsetZ = isCore ? 0 : randomSigned(depth * 1.05)
    const distance = Math.min(
      1,
      Math.hypot(offsetX / Math.max(width, 1), offsetZ / Math.max(depth, 1)),
    )
    const edgeScale = MathUtils.lerp(1.18, 0.62, distance)
    const puffScale = edgeScale * (0.78 + Math.random() * 0.5)

    return {
      offsetX,
      offsetY: randomSigned(height * 0.45) + Math.random() * height * 0.32,
      offsetZ,
      scaleX: (2.8 + Math.random() * 4.8) * puffScale,
      scaleY: (0.75 + Math.random() * 1.7) * puffScale,
      scaleZ: (2.2 + Math.random() * 4.4) * puffScale,
      opacity: MathUtils.lerp(0.62, 1, Math.random()) * MathUtils.lerp(1, 0.72, distance),
    }
  })
}

function createCloudClusters(): CloudCluster[] {
  return Array.from({ length: CLOUD_CLUSTER_COUNT }, () => {
    const width = 7 + Math.random() * 12
    const depth = 4 + Math.random() * 9
    const height = 1.2 + Math.random() * 2.6

    return {
      x: randomSigned(CLOUD_RADIUS * 2),
      y: 23 + Math.random() * 18,
      z: randomSigned(CLOUD_RADIUS * 2),
      phase: Math.random() * Math.PI * 2,
      driftSpeed: 0.62 + Math.random() * 0.96,
      swayAmount: 0.8 + Math.random() * 2.8,
      swaySpeed: 0.12 + Math.random() * 0.18,
      bobAmount: 0.12 + Math.random() * 0.34,
      opacity: 0.09 + Math.random() * 0.15,
      puffs: createCloudPuffs(width, depth, height),
    }
  })
}

function CloudLayer({
  intensity,
  mode,
  wind,
}: {
  intensity: number
  mode: WeatherMode
  wind: WindVector
}) {
  const groupRef = useRef<Group>(null)
  const clusterRefs = useRef<Array<Group | null>>([])
  const cameraPosition = useMemo(() => new Vector3(), [])
  const clouds = useMemo(() => createCloudClusters(), [])

  useFrame(({ camera, clock }, delta) => {
    camera.getWorldPosition(cameraPosition)
    updateWeatherVolumePosition(groupRef.current, cameraPosition)

    if (!groupRef.current) return

    const deltaTime = Math.min(delta, 0.08)
    const directionX = wind.speed > 0.02 ? wind.x / wind.speed : 0.42
    const directionZ = wind.speed > 0.02 ? wind.z / wind.speed : -0.9
    const crossX = -directionZ
    const crossZ = directionX
    const driftSpeed = MathUtils.lerp(0.78, 4.8, wind.speed)
    const wrapRadius = CLOUD_RADIUS + CLOUD_WRAP_PADDING

    clouds.forEach((cloud, index) => {
      const cluster = clusterRefs.current[index]
      if (!cluster) return

      const drift = driftSpeed * cloud.driftSpeed * deltaTime
      cloud.x += directionX * drift
      cloud.z += directionZ * drift

      if (Math.abs(cloud.x) > wrapRadius || Math.abs(cloud.z) > wrapRadius) {
        cloud.x = -directionX * CLOUD_RADIUS + randomSigned(22)
        cloud.y = 23 + Math.random() * 18
        cloud.z = -directionZ * CLOUD_RADIUS + randomSigned(22)
      }

      const sway = Math.sin(clock.elapsedTime * cloud.swaySpeed + cloud.phase) * cloud.swayAmount
      const bob = Math.sin(clock.elapsedTime * 0.32 + cloud.phase) * cloud.bobAmount

      cluster.position.set(cloud.x + crossX * sway, cloud.y + bob, cloud.z + crossZ * sway)
      cluster.rotation.y = Math.sin(clock.elapsedTime * 0.08 + cloud.phase) * 0.035
    })
  })

  if (mode === 'clear') return null

  const color = mode === 'snow' ? '#f4f8ff' : mode === 'thunder' ? '#637086' : '#d4deea'
  const opacityScale = mode === 'thunder' ? 1.65 : mode === 'rain' ? 1.22 : 0.95

  return (
    <group frustumCulled={false} ref={groupRef}>
      {clouds.map((cloud, index) => (
        <group
          frustumCulled={false}
          key={`cloud-${index}`}
          ref={(node) => {
            clusterRefs.current[index] = node
          }}
          position={[cloud.x, cloud.y, cloud.z]}
          renderOrder={18}
        >
          {cloud.puffs.map((puff, puffIndex) => (
            <mesh
              frustumCulled={false}
              key={`cloud-${index}-puff-${puffIndex}`}
              position={[puff.offsetX, puff.offsetY, puff.offsetZ]}
              renderOrder={18}
              scale={[puff.scaleX, puff.scaleY, puff.scaleZ]}
            >
              <sphereGeometry args={[1, 16, 8]} />
              <meshBasicMaterial
                color={color}
                depthWrite={false}
                opacity={
                  cloud.opacity * puff.opacity * opacityScale * MathUtils.lerp(0.7, 1.45, intensity)
                }
                transparent
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

type WeatherAudioRuntime = {
  context: AudioContext
  source: AudioBufferSourceNode
  gain: GainNode
  rumble?: OscillatorNode
  rumbleGain?: GainNode
  thunderTimer?: number
}

function createNoiseBuffer(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1
  }

  return buffer
}

function getWeatherSoundGain(mode: WeatherMode, intensity: number) {
  return mode === 'snow' ? intensity * 0.018 : intensity * (mode === 'thunder' ? 0.07 : 0.045)
}

function createWeatherAudio(
  mode: WeatherMode,
  getIntensity: () => number,
): WeatherAudioRuntime | null {
  if (typeof window === 'undefined') return null

  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioContextClass) return null

  const context = new AudioContextClass()
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  const intensity = getIntensity()

  source.buffer = createNoiseBuffer(context)
  source.loop = true
  filter.type = mode === 'snow' ? 'highpass' : 'lowpass'
  filter.frequency.value = mode === 'snow' ? 1400 : mode === 'thunder' ? 1250 : 1900
  gain.gain.value = getWeatherSoundGain(mode, intensity)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start()
  void context.resume().catch(() => undefined)

  const runtime: WeatherAudioRuntime = { context, source, gain }

  if (mode === 'thunder') {
    const rumble = context.createOscillator()
    const rumbleGain = context.createGain()
    rumble.type = 'sine'
    rumble.frequency.value = 46
    rumbleGain.gain.value = 0.0001
    rumble.connect(rumbleGain)
    rumbleGain.connect(context.destination)
    rumble.start()

    const triggerThunder = () => {
      const thunderIntensity = getIntensity()
      const now = context.currentTime
      rumbleGain.gain.cancelScheduledValues(now)
      rumbleGain.gain.setValueAtTime(0.0001, now)
      rumbleGain.gain.exponentialRampToValueAtTime(
        Math.max(0.002, thunderIntensity * 0.16),
        now + 0.08,
      )
      rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25 + Math.random() * 0.8)
    }

    runtime.rumble = rumble
    runtime.rumbleGain = rumbleGain
    runtime.thunderTimer = window.setInterval(triggerThunder, MathUtils.lerp(4200, 1800, intensity))
    window.setTimeout(triggerThunder, 700)
  }

  return runtime
}

function stopWeatherAudio(runtime: WeatherAudioRuntime | null) {
  if (!runtime) return

  if (runtime.thunderTimer) {
    window.clearInterval(runtime.thunderTimer)
  }

  runtime.gain.gain.setTargetAtTime(0.0001, runtime.context.currentTime, 0.05)
  runtime.rumbleGain?.gain.setTargetAtTime(0.0001, runtime.context.currentTime, 0.05)
  window.setTimeout(() => {
    try {
      runtime.source.stop()
      runtime.rumble?.stop()
    } catch {
      // Already stopped.
    }
    void runtime.context.close().catch(() => undefined)
  }, 120)
}

function WeatherAudio({
  intensity,
  mode,
  soundEnabled,
}: {
  intensity: number
  mode: WeatherMode
  soundEnabled: boolean
}) {
  const runtimeRef = useRef<WeatherAudioRuntime | null>(null)
  const intensityRef = useRef(intensity)
  const canPlayWeatherAudio = soundEnabled && mode !== 'clear' && intensity > 0.01

  useEffect(() => {
    intensityRef.current = intensity
    const runtime = runtimeRef.current
    if (!runtime) return

    runtime.gain.gain.setTargetAtTime(
      getWeatherSoundGain(mode, intensity),
      runtime.context.currentTime,
      0.08,
    )
  }, [intensity, mode])

  useEffect(() => {
    stopWeatherAudio(runtimeRef.current)
    runtimeRef.current = null

    if (!canPlayWeatherAudio) return undefined

    runtimeRef.current = createWeatherAudio(mode, () => intensityRef.current)

    return () => {
      stopWeatherAudio(runtimeRef.current)
      runtimeRef.current = null
    }
  }, [canPlayWeatherAudio, mode])

  return null
}

function WeatherAtmosphere({ intensity, mode }: { intensity: number; mode: WeatherMode }) {
  const { scene } = useThree()
  const previousFog = useRef(scene.fog)
  const targetFogColor = useMemo(() => new Color(), [])

  useEffect(
    () => () => {
      scene.fog = previousFog.current
    },
    [scene],
  )

  useFrame((_, delta) => {
    if (mode === 'clear') {
      scene.fog = null
      return
    }

    const fogTarget = mode === 'snow' ? '#edf4ff' : mode === 'thunder' ? '#74849b' : '#aab8c8'
    const nearTarget =
      mode === 'thunder' ? MathUtils.lerp(18, 10, intensity) : MathUtils.lerp(30, 18, intensity)
    const farTarget =
      mode === 'snow' ? MathUtils.lerp(112, 74, intensity) : MathUtils.lerp(96, 54, intensity)

    if (!(scene.fog instanceof Fog)) {
      scene.fog = new Fog(fogTarget, nearTarget, farTarget)
      return
    }

    targetFogColor.set(fogTarget)
    scene.fog.color.lerp(targetFogColor, Math.min(delta, 0.08) * 4)
    scene.fog.near = MathUtils.lerp(scene.fog.near, nearTarget, Math.min(delta, 0.08) * 4)
    scene.fog.far = MathUtils.lerp(scene.fog.far, farTarget, Math.min(delta, 0.08) * 4)
  })

  return null
}

export function WeatherSystem() {
  const rawWeather = useViewer((state) => state.weather)
  const weather = useMemo(() => resolveWeatherState(rawWeather), [rawWeather])
  const mode = weather.mode
  const intensity = weather.intensity
  const particleSize = weather.particleSize
  const wind = useMemo(
    () => getWindVector(weather.windDirectionDeg, weather.windSpeed),
    [weather.windDirectionDeg, weather.windSpeed],
  )

  return (
    <>
      <WeatherAtmosphere intensity={intensity} mode={mode} />
      <WeatherGroundLayer intensity={intensity} mode={mode} />
      <CloudLayer intensity={intensity} mode={mode} wind={wind} />
      <WeatherAudio intensity={intensity} mode={mode} soundEnabled={weather.soundEnabled} />
      {mode === 'rain' ? (
        <RainField intensity={intensity} particleSize={particleSize} wind={wind} />
      ) : null}
      {mode === 'snow' ? (
        <SnowField intensity={intensity} particleSize={particleSize} wind={wind} />
      ) : null}
      {mode === 'thunder' ? (
        <>
          <RainField intensity={intensity} particleSize={particleSize} storm wind={wind} />
          <LightningField intensity={intensity} />
        </>
      ) : null}
    </>
  )
}
