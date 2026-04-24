import { type SiteNode, useScene } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { AmbientLight, DirectionalLight, OrthographicCamera } from 'three/webgpu'
import * as THREE from 'three/webgpu'
import {
  getSunPositionForProgress,
  resolveSunLighting,
  resolveSunProgress,
} from '../../lib/sun-study'
import useViewer from '../../store/use-viewer'

const SITE_ORIENTATION_DEGREES_KEY = 'orientationDegrees'

function normalizeDegrees(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360
  return Object.is(normalized, -0) ? 0 : normalized
}

function degreesToRadians(degrees: number): number {
  return (-normalizeDegrees(degrees) * Math.PI) / 180
}

function getSiteOrientationDegrees(site: Pick<SiteNode, 'metadata'> | null | undefined): number {
  const metadata =
    typeof site?.metadata === 'object' && site.metadata !== null && !Array.isArray(site.metadata)
      ? (site.metadata as Record<string, unknown>)
      : {}
  const degrees = metadata[SITE_ORIENTATION_DEGREES_KEY]

  return typeof degrees === 'number' && Number.isFinite(degrees) ? normalizeDegrees(degrees) : 0
}

function rotateSunPosition(
  position: [number, number, number],
  orientationDegrees: number,
): [number, number, number] {
  const rotation = degreesToRadians(orientationDegrees)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const [x, y, z] = position

  return [x * cos + z * sin, y, -x * sin + z * cos]
}

export function Lights() {
  const theme = useViewer((state) => state.theme)
  const sunStudy = useViewer((state) => state.sunStudy)
  const siteOrientationDegrees = useScene((state) => {
    const rootId = state.rootNodeIds[0]
    const node = rootId ? state.nodes[rootId] : null
    return node?.type === 'site' ? getSiteOrientationDegrees(node as SiteNode) : 0
  })
  const isDark = theme === 'dark'
  const sunEnabled = sunStudy.enabled
  const sunProgress = resolveSunProgress(sunStudy.timeOfDay, sunStudy.progress)
  const sunPreset = resolveSunLighting(sunProgress)

  const light1Ref = useRef<DirectionalLight>(null)
  const shadowCamera = useRef<OrthographicCamera>(null)
  const shadowCameraSize = 50 // The "area" around the camera to shadow

  const light2Ref = useRef<DirectionalLight>(null)
  const light3Ref = useRef<DirectionalLight>(null)
  const ambientRef = useRef<AmbientLight>(null)

  const initialized = useRef(false)

  const targets = useMemo(
    () => ({
      l1Color: new THREE.Color(),
      l2Color: new THREE.Color(),
      l3Color: new THREE.Color(),
      ambColor: new THREE.Color(),
      sunPosition: new THREE.Vector3(),
    }),
    [],
  )

  useFrame((_, delta) => {
    // clamp delta to avoid huge jumps on tab switch
    const dt = Math.min(delta, 0.1) * 4
    const sunPosition = rotateSunPosition(
      getSunPositionForProgress(sunProgress, 36),
      siteOrientationDegrees,
    )

    const l1Intensity = sunEnabled ? sunPreset.intensity * (isDark ? 0.34 : 1) : isDark ? 0.8 : 4
    const l1Color = sunEnabled ? sunPreset.color : isDark ? '#e0e5ff' : '#ffffff'
    const shadowIntensity = sunEnabled
      ? sunPreset.shadowIntensity * (isDark ? 0.75 : 1)
      : isDark
        ? 0.8
        : 0.4

    const l2Intensity = sunEnabled
      ? sunPreset.fillIntensity * (isDark ? 0.4 : 1)
      : isDark
        ? 0.2
        : 0.75
    const l2Color = sunEnabled ? '#c7d7ff' : isDark ? '#8090ff' : '#ffffff'

    const l3Intensity = sunEnabled ? (isDark ? 0.08 : 0.18) : isDark ? 0.3 : 1
    const l3Color = sunEnabled ? '#dbe7ff' : isDark ? '#a0b0ff' : '#ffffff'

    const ambientIntensity = sunEnabled
      ? sunPreset.ambientIntensity * (isDark ? 0.55 : 1)
      : isDark
        ? 0.15
        : 0.5
    const ambientColor = sunEnabled ? '#f4f7ff' : isDark ? '#a0b0ff' : '#ffffff'

    if (!initialized.current) {
      if (light1Ref.current) {
        light1Ref.current.intensity = l1Intensity
        light1Ref.current.color.set(l1Color)
        light1Ref.current.position.set(
          sunEnabled ? sunPosition[0] : 10,
          sunEnabled ? sunPosition[1] : 10,
          sunEnabled ? sunPosition[2] : 10,
        )

        if (light1Ref.current.shadow) light1Ref.current.shadow.intensity = shadowIntensity
      }
      if (light2Ref.current) {
        light2Ref.current.intensity = l2Intensity
        light2Ref.current.color.set(l2Color)
      }
      if (light3Ref.current) {
        light3Ref.current.intensity = l3Intensity
        light3Ref.current.color.set(l3Color)
      }
      if (ambientRef.current) {
        ambientRef.current.intensity = ambientIntensity
        ambientRef.current.color.set(ambientColor)
      }
      initialized.current = true
      return
    }

    if (light1Ref.current) {
      light1Ref.current.intensity = THREE.MathUtils.lerp(
        light1Ref.current.intensity,
        l1Intensity,
        dt,
      )
      targets.l1Color.set(l1Color)
      light1Ref.current.color.lerp(targets.l1Color, dt)
      targets.sunPosition.set(
        sunEnabled ? sunPosition[0] : 10,
        sunEnabled ? sunPosition[1] : 10,
        sunEnabled ? sunPosition[2] : 10,
      )
      light1Ref.current.position.lerp(targets.sunPosition, dt)

      if (light1Ref.current.shadow) {
        if (light1Ref.current.shadow.intensity !== undefined) {
          light1Ref.current.shadow.intensity = THREE.MathUtils.lerp(
            light1Ref.current.shadow.intensity,
            shadowIntensity,
            dt,
          )
        }
      }
    }

    if (light2Ref.current) {
      light2Ref.current.intensity = THREE.MathUtils.lerp(
        light2Ref.current.intensity,
        l2Intensity,
        dt,
      )
      targets.l2Color.set(l2Color)
      light2Ref.current.color.lerp(targets.l2Color, dt)
    }

    if (light3Ref.current) {
      light3Ref.current.intensity = THREE.MathUtils.lerp(
        light3Ref.current.intensity,
        l3Intensity,
        dt,
      )
      targets.l3Color.set(l3Color)
      light3Ref.current.color.lerp(targets.l3Color, dt)
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(
        ambientRef.current.intensity,
        ambientIntensity,
        dt,
      )
      targets.ambColor.set(ambientColor)
      ambientRef.current.color.lerp(targets.ambColor, dt)
    }
  })

  return (
    <>
      <directionalLight
        castShadow
        position={[10, 10, 10]}
        ref={light1Ref}
        shadow-bias={-0.002}
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.3}
        shadow-radius={3}
      >
        <orthographicCamera
          attach="shadow-camera"
          bottom={-shadowCameraSize}
          far={100}
          left={-shadowCameraSize}
          near={1}
          ref={shadowCamera}
          right={shadowCameraSize}
          top={shadowCameraSize}
        />
      </directionalLight>

      <directionalLight position={[-10, 10, -10]} ref={light2Ref} />

      <directionalLight position={[-10, 10, 10]} ref={light3Ref} />

      <ambientLight ref={ambientRef} />
    </>
  )
}
