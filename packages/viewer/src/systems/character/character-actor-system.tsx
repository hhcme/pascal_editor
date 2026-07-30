'use client'

import { useScene } from '@pascal-app/core'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Matrix3, type Group, type Object3D, Plane, Raycaster, Vector2, Vector3 } from 'three'
import {
  buildCharacterCollisionMap,
  getCharacterWaterAreaAt,
  resolveCharacterWalkPosition,
  type CharacterCollisionMap,
} from '../../lib/character-collision'
import useViewer, {
  type CharacterKind,
  type CharacterMotion,
  type CharacterPersonState,
} from '../../store/use-viewer'

type CharacterKeys = {
  backward: boolean
  crouch: boolean
  forward: boolean
  jump: boolean
  left: boolean
  right: boolean
  run: boolean
}

type RigRefs = {
  actor: Group | null
  root: Group | null
  hips: Group | null
  spine: Group | null
  head: Group | null
  leftUpperArm: Group | null
  leftLowerArm: Group | null
  rightUpperArm: Group | null
  rightLowerArm: Group | null
  leftUpperLeg: Group | null
  leftLowerLeg: Group | null
  rightUpperLeg: Group | null
  rightLowerLeg: Group | null
  leftFoot: Group | null
  rightFoot: Group | null
}

type SceneNodeLike = {
  id: string
  metadata?: Record<string, unknown>
  parentId?: string | null
  position?: [number, number, number]
  rotation?: [number, number, number]
  type: string
  wallId?: string
  width?: number
  start?: [number, number]
  end?: [number, number]
}

const characterMotionLabels: Record<CharacterMotion, string> = {
  idle: '站立',
  walk: '走',
  run: '跑',
  jump: '跳',
  sit: '坐',
  crouch: '蹲',
  lie: '躺',
  chat: '闲聊',
  swim: '游泳',
  drown: '挣扎求救',
  dead: '漂浮',
}

const CHARACTER_WALK_SPEED = 1.4
const CHARACTER_RUN_SPEED = 3.2
const _forward = new Vector3()
const _right = new Vector3()
const _direction = new Vector3()
const _dragPlane = new Plane(new Vector3(0, 1, 0), 0)
const _dragPoint = new Vector3()
const _surfaceNormal = new Vector3()
const _pointer = new Vector2()
const _normalMatrix = new Matrix3()

const CHARACTER_ROAM_EVENT = 'editor:character-roam-request'
const CHARACTER_MENU_EVENT = 'editor:character-menu-request'
const CHARACTER_COMMAND_EVENT = 'editor:character-command'
const FIRST_PERSON_POSE_EVENT = 'editor:first-person-pose'
const FIRST_PERSON_END_EVENT = 'editor:first-person-ended'

const CHARACTER_KIND_NAMES: Record<CharacterKind, string> = {
  adult: '成人',
  dog: '小狗',
  child: '小孩',
  elder: '老人',
  wheelchair: '轮椅',
}

type PointerCaptureTarget = {
  setPointerCapture?: (pointerId: number) => void
  releasePointerCapture?: (pointerId: number) => void
}

type CharacterCommandDetail = {
  command?: unknown
  id?: unknown
  motion?: unknown
  roam?: unknown
}

type CharacterRoamTarget = {
  x: number
  z: number
}

type CharacterRoamActivityKind = 'walk' | 'run' | 'pause' | 'sit' | 'jump' | 'chat'

type CharacterRoamActivity = {
  kind: CharacterRoamActivityKind
  partnerId?: string
  target?: CharacterRoamTarget
  until: number
}

type SeededCharacterActor = {
  color?: unknown
  enabled?: unknown
  id?: unknown
  kind?: unknown
  motion?: unknown
  name?: unknown
  position?: unknown
  roam?: unknown
  route?: unknown
  showBones?: unknown
  speed?: unknown
}

type FirstPersonPoseDetail = {
  x?: unknown
  y?: unknown
  z?: unknown
  yaw?: unknown
}

type CharacterWaterRuntime = {
  enteredAt: number
  motion: CharacterMotion
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function updateCharacterPerson(
  personId: string,
  updater: (person: CharacterPersonState) => CharacterPersonState,
) {
  const current = useViewer.getState().characterActor
  const people = getCharacterPeopleFromState(current)
  const nextPeople = people.map((person) => (person.id === personId ? updater(person) : person))
  const selectedPerson =
    nextPeople.find((person) => person.id === current.selectedPersonId) ?? nextPeople[0]

  useViewer.getState().setCharacterActor({
    people: nextPeople,
    selectedPersonId: personId,
    position: selectedPerson?.position ?? current.position,
  })
}

function getCharacterEyeHeight(person: CharacterPersonState) {
  if (person.kind === 'dog') return 0.55
  if (person.kind === 'child') return 1.2
  if (person.kind === 'wheelchair') return 1.25
  if (person.kind === 'elder') return 1.55
  return 1.65
}

function getCharacterYaw(actor: Group | null | undefined) {
  return actor?.rotation.y ?? 0
}

function getCharacterWorldPosition(actor: Group | null | undefined, fallback: [number, number, number]) {
  if (!actor) return fallback
  const position = actor.getWorldPosition(_dragPoint)
  return [position.x, position.y, position.z] as [number, number, number]
}

function getCharacterForwardYaw(actor: Group | null | undefined) {
  // The procedural character faces local +Z, while first-person forward uses -Z.
  return getCharacterYaw(actor) + Math.PI
}

function getCharacterInteractionDetail(person: CharacterPersonState, actor: Group | null | undefined) {
  const position = getCharacterWorldPosition(actor, person.position)
  return {
    id: person.id,
    name: person.name,
    position,
    anchor: [position[0], position[1] + 2.1, position[2]] as [number, number, number],
    yaw: getCharacterForwardYaw(actor),
    eyeHeight: getCharacterEyeHeight(person),
    motion: person.motion,
    roam: person.roam,
  }
}

function dispatchCharacterRoam(person: CharacterPersonState, actor: Group | null | undefined) {
  window.dispatchEvent(
    new CustomEvent(CHARACTER_ROAM_EVENT, {
      detail: getCharacterInteractionDetail(person, actor),
    }),
  )
}

function dispatchCharacterMenu(person: CharacterPersonState, actor: Group | null | undefined) {
  window.dispatchEvent(
    new CustomEvent(CHARACTER_MENU_EVENT, {
      detail: getCharacterInteractionDetail(person, actor),
    }),
  )
}

function detailIsCharacterCommand(value: unknown): value is CharacterCommandDetail {
  return Boolean(value && typeof value === 'object')
}

function isCharacterMotion(value: unknown): value is CharacterMotion {
  return (
    value === 'idle' ||
    value === 'walk' ||
    value === 'run' ||
    value === 'jump' ||
    value === 'sit' ||
    value === 'crouch' ||
    value === 'lie' ||
    value === 'chat' ||
    value === 'swim' ||
    value === 'drown' ||
    value === 'dead'
  )
}

function detailIsFirstPersonPose(value: unknown): value is FirstPersonPoseDetail {
  return Boolean(value && typeof value === 'object')
}

function getCharacterIdFromObject(object: Object3D | null): string | null {
  let current: Object3D | null = object

  while (current) {
    const characterId = current.userData?.characterId
    if (typeof characterId === 'string') return characterId
    current = current.parent
  }

  return null
}

function isCharacterObject(object: Object3D | null) {
  return Boolean(getCharacterIdFromObject(object) || object?.name?.startsWith('character-'))
}

function resetRig(refs: RigRefs) {
  const { actor: _actor, ...poseRefs } = refs
  for (const group of Object.values(poseRefs)) {
    group?.rotation.set(0, 0, 0)
  }
  refs.root?.position.set(0, 0, 0)
}

function poseRig(refs: RigRefs, motion: CharacterMotion, elapsedSeconds: number, speed: number) {
  const t = elapsedSeconds * speed
  resetRig(refs)

  if (refs.root) {
    refs.root.rotation.y = Math.sin(t * 0.24) * 0.08
  }

  if (refs.leftUpperArm) refs.leftUpperArm.rotation.z = 0.22
  if (refs.rightUpperArm) refs.rightUpperArm.rotation.z = -0.22

  if (motion === 'idle') {
    if (refs.root) refs.root.position.y = Math.sin(t * 1.6) * 0.018
    if (refs.spine) refs.spine.rotation.x = Math.sin(t * 1.4) * 0.025
    if (refs.head) refs.head.rotation.y = Math.sin(t * 0.8) * 0.08
    return
  }

  if (motion === 'chat') {
    if (refs.root) refs.root.position.y = Math.sin(t * 1.4) * 0.014
    if (refs.spine) refs.spine.rotation.x = Math.sin(t * 1.1) * 0.035
    if (refs.head) {
      refs.head.rotation.y = Math.sin(t * 1.7) * 0.16
      refs.head.rotation.x = Math.sin(t * 0.9) * 0.04
    }
    if (refs.leftUpperArm) {
      refs.leftUpperArm.rotation.x = -0.34 + Math.sin(t * 2.1) * 0.12
      refs.leftUpperArm.rotation.z = 0.34
    }
    if (refs.rightUpperArm) {
      refs.rightUpperArm.rotation.x = -0.48 + Math.sin(t * 1.8 + Math.PI) * 0.14
      refs.rightUpperArm.rotation.z = -0.34
    }
    if (refs.leftLowerArm) refs.leftLowerArm.rotation.x = -0.36 + Math.sin(t * 2.1) * 0.1
    if (refs.rightLowerArm) refs.rightLowerArm.rotation.x = -0.42 + Math.sin(t * 1.8) * 0.12
    return
  }

  if (motion === 'swim') {
    const stroke = Math.sin(t * 4.2)
    if (refs.root) {
      refs.root.position.y = -0.54 + Math.sin(t * 2.2) * 0.035
      refs.root.rotation.x = Math.PI / 2 + Math.sin(t * 1.8) * 0.08
      refs.root.rotation.y = 0
    }
    if (refs.spine) refs.spine.rotation.x = Math.sin(t * 2.4) * 0.06
    if (refs.head) refs.head.rotation.x = -0.42 + Math.sin(t * 1.5) * 0.08
    if (refs.leftUpperArm) {
      refs.leftUpperArm.rotation.x = -1.35 + stroke * 0.62
      refs.leftUpperArm.rotation.z = 0.58
    }
    if (refs.rightUpperArm) {
      refs.rightUpperArm.rotation.x = -1.35 - stroke * 0.62
      refs.rightUpperArm.rotation.z = -0.58
    }
    if (refs.leftLowerArm) refs.leftLowerArm.rotation.x = -0.52 + Math.max(0, stroke) * 0.36
    if (refs.rightLowerArm) refs.rightLowerArm.rotation.x = -0.52 + Math.max(0, -stroke) * 0.36
    if (refs.leftUpperLeg) refs.leftUpperLeg.rotation.x = Math.sin(t * 5.2) * 0.38
    if (refs.rightUpperLeg) refs.rightUpperLeg.rotation.x = Math.sin(t * 5.2 + Math.PI) * 0.38
    if (refs.leftLowerLeg) refs.leftLowerLeg.rotation.x = Math.max(0, -Math.sin(t * 5.2)) * 0.45
    if (refs.rightLowerLeg) refs.rightLowerLeg.rotation.x = Math.max(0, Math.sin(t * 5.2)) * 0.45
    return
  }

  if (motion === 'drown') {
    const thrash = Math.sin(t * 8.4)
    if (refs.root) {
      refs.root.position.y = -0.66 + Math.abs(thrash) * 0.1
      refs.root.rotation.x = 0.34 + Math.sin(t * 3.1) * 0.22
      refs.root.rotation.z = Math.sin(t * 5.4) * 0.12
    }
    if (refs.spine) refs.spine.rotation.x = -0.18 + Math.sin(t * 4.3) * 0.18
    if (refs.head) refs.head.rotation.x = -0.22 + Math.sin(t * 5.1) * 0.18
    if (refs.leftUpperArm) {
      refs.leftUpperArm.rotation.x = -2.2 + thrash * 0.5
      refs.leftUpperArm.rotation.z = 0.62
    }
    if (refs.rightUpperArm) {
      refs.rightUpperArm.rotation.x = -2.2 - thrash * 0.5
      refs.rightUpperArm.rotation.z = -0.62
    }
    if (refs.leftLowerArm) refs.leftLowerArm.rotation.x = -0.32 + Math.sin(t * 7.2) * 0.28
    if (refs.rightLowerArm) refs.rightLowerArm.rotation.x = -0.32 - Math.sin(t * 7.2) * 0.28
    if (refs.leftUpperLeg) refs.leftUpperLeg.rotation.x = Math.sin(t * 6.4) * 0.58
    if (refs.rightUpperLeg) refs.rightUpperLeg.rotation.x = -Math.sin(t * 6.4) * 0.58
    return
  }

  if (motion === 'dead') {
    if (refs.root) {
      refs.root.position.y = -0.72 + Math.sin(t * 0.9) * 0.018
      refs.root.rotation.x = Math.PI / 2
      refs.root.rotation.y = Math.sin(t * 0.35) * 0.05
      refs.root.rotation.z = 0.18
    }
    if (refs.head) refs.head.rotation.x = -0.08
    if (refs.leftUpperArm) refs.leftUpperArm.rotation.z = 0.72
    if (refs.rightUpperArm) refs.rightUpperArm.rotation.z = -0.72
    if (refs.leftUpperLeg) refs.leftUpperLeg.rotation.x = 0.08
    if (refs.rightUpperLeg) refs.rightUpperLeg.rotation.x = -0.06
    return
  }

  if (motion === 'crouch') {
    if (refs.root) refs.root.position.y = -0.42 + Math.sin(t * 1.3) * 0.012
    if (refs.spine) refs.spine.rotation.x = -0.22
    if (refs.leftUpperLeg) refs.leftUpperLeg.rotation.x = -1.08
    if (refs.rightUpperLeg) refs.rightUpperLeg.rotation.x = -1.08
    if (refs.leftLowerLeg) refs.leftLowerLeg.rotation.x = 1.72
    if (refs.rightLowerLeg) refs.rightLowerLeg.rotation.x = 1.72
    if (refs.leftUpperArm) refs.leftUpperArm.rotation.x = -0.42
    if (refs.rightUpperArm) refs.rightUpperArm.rotation.x = -0.42
    if (refs.leftFoot) refs.leftFoot.rotation.x = -0.52
    if (refs.rightFoot) refs.rightFoot.rotation.x = -0.52
    return
  }

  if (motion === 'jump') {
    const phase = (t * 0.72) % 1
    const crouch = phase < 0.18 ? 1 - phase / 0.18 : 0
    const airtime = phase > 0.18 && phase < 0.74 ? Math.sin(((phase - 0.18) / 0.56) * Math.PI) : 0
    if (refs.root) refs.root.position.y = -crouch * 0.22 + airtime * 0.74
    if (refs.leftUpperLeg) refs.leftUpperLeg.rotation.x = -0.58 * crouch + 0.18 * airtime
    if (refs.rightUpperLeg) refs.rightUpperLeg.rotation.x = -0.58 * crouch + 0.18 * airtime
    if (refs.leftLowerLeg) refs.leftLowerLeg.rotation.x = 1.05 * crouch - 0.28 * airtime
    if (refs.rightLowerLeg) refs.rightLowerLeg.rotation.x = 1.05 * crouch - 0.28 * airtime
    if (refs.leftUpperArm) {
      refs.leftUpperArm.rotation.x = -1.25 * airtime
      refs.leftUpperArm.rotation.z = 0.45
    }
    if (refs.rightUpperArm) {
      refs.rightUpperArm.rotation.x = -1.25 * airtime
      refs.rightUpperArm.rotation.z = -0.45
    }
    return
  }

  if (motion === 'sit') {
    if (refs.root) refs.root.position.y = -0.5 + Math.sin(t * 1.2) * 0.01
    if (refs.spine) refs.spine.rotation.x = -0.08
    if (refs.leftUpperLeg) refs.leftUpperLeg.rotation.x = -1.35
    if (refs.rightUpperLeg) refs.rightUpperLeg.rotation.x = -1.35
    if (refs.leftLowerLeg) refs.leftLowerLeg.rotation.x = 1.5
    if (refs.rightLowerLeg) refs.rightLowerLeg.rotation.x = 1.5
    if (refs.leftUpperArm) refs.leftUpperArm.rotation.x = -0.18
    if (refs.rightUpperArm) refs.rightUpperArm.rotation.x = -0.18
    if (refs.leftLowerArm) refs.leftLowerArm.rotation.x = -0.28
    if (refs.rightLowerArm) refs.rightLowerArm.rotation.x = -0.28
    if (refs.leftFoot) refs.leftFoot.rotation.x = -0.28
    if (refs.rightFoot) refs.rightFoot.rotation.x = -0.28
    return
  }

  if (motion === 'lie') {
    if (refs.root) {
      refs.root.position.y = -0.42
      refs.root.rotation.x = Math.PI / 2
      refs.root.rotation.y = 0
    }
    if (refs.spine) refs.spine.rotation.x = 0.06
    if (refs.head) refs.head.rotation.x = -0.16
    if (refs.leftUpperArm) {
      refs.leftUpperArm.rotation.x = -0.18
      refs.leftUpperArm.rotation.z = 0.46
    }
    if (refs.rightUpperArm) {
      refs.rightUpperArm.rotation.x = -0.18
      refs.rightUpperArm.rotation.z = -0.46
    }
    if (refs.leftUpperLeg) refs.leftUpperLeg.rotation.x = 0.08
    if (refs.rightUpperLeg) refs.rightUpperLeg.rotation.x = 0.08
    if (refs.leftLowerLeg) refs.leftLowerLeg.rotation.x = 0.08
    if (refs.rightLowerLeg) refs.rightLowerLeg.rotation.x = 0.08
    return
  }

  const isRun = motion === 'run'
  const stride = Math.sin(t * (isRun ? 7.8 : 4.4))
  const counter = Math.sin(t * (isRun ? 7.8 : 4.4) + Math.PI)
  const amplitude = isRun ? 0.86 : 0.48
  const knee = isRun ? 0.74 : 0.42

  if (refs.root) refs.root.position.y = Math.abs(stride) * (isRun ? 0.055 : 0.028)
  if (refs.spine) refs.spine.rotation.x = isRun ? -0.1 : -0.04
  if (refs.leftUpperLeg) refs.leftUpperLeg.rotation.x = stride * amplitude
  if (refs.rightUpperLeg) refs.rightUpperLeg.rotation.x = counter * amplitude
  if (refs.leftLowerLeg) refs.leftLowerLeg.rotation.x = Math.max(0, -stride) * knee
  if (refs.rightLowerLeg) refs.rightLowerLeg.rotation.x = Math.max(0, -counter) * knee
  if (refs.leftUpperArm) refs.leftUpperArm.rotation.x = counter * amplitude * 0.78
  if (refs.rightUpperArm) refs.rightUpperArm.rotation.x = stride * amplitude * 0.78
  if (refs.leftLowerArm) refs.leftLowerArm.rotation.x = isRun ? -0.45 : -0.22
  if (refs.rightLowerArm) refs.rightLowerArm.rotation.x = isRun ? -0.45 : -0.22
}

function LimbSegment({
  color,
  length,
  radius,
}: {
  color: string
  length: number
  radius: number
}) {
  return (
    <mesh castShadow position={[0, -length / 2, 0]} receiveShadow>
      <cylinderGeometry args={[radius, radius, length, 16]} />
      <meshStandardMaterial color={color} metalness={0.02} roughness={0.62} />
    </mesh>
  )
}

function Joint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <mesh>
      <sphereGeometry args={[0.045, 12, 8]} />
      <meshStandardMaterial color="#f4c56b" emissive="#3b2a07" emissiveIntensity={0.08} roughness={0.58} />
    </mesh>
  )
}

function BoneGuide({ length, visible }: { length: number; visible: boolean }) {
  if (!visible) return null
  return (
    <mesh position={[0, -length / 2, 0]}>
      <cylinderGeometry args={[0.012, 0.012, length, 8]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.82} />
    </mesh>
  )
}

function normalizeCharacterKind(value: unknown): CharacterKind {
  if (
    value === 'adult' ||
    value === 'child' ||
    value === 'elder' ||
    value === 'wheelchair' ||
    value === 'dog'
  ) {
    return value
  }

  return 'adult'
}

function isFinitePoint3D(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function normalizeCharacterMotion(value: unknown): CharacterMotion {
  return isCharacterMotion(value) ? value : 'walk'
}

function normalizeCharacterRoute(value: unknown): [number, number, number][] | undefined {
  if (!Array.isArray(value)) return undefined
  const route = value.filter(isFinitePoint3D)
  return route.length > 0 ? route : undefined
}

function getSceneCharacterSeeds(rawNodes: Record<string, unknown>): CharacterPersonState[] {
  const nodes = rawNodes as Record<string, SceneNodeLike>
  const seeds: SeededCharacterActor[] = []

  for (const node of Object.values(nodes)) {
    const actors = node.metadata?.characterActors
    if (Array.isArray(actors)) {
      seeds.push(...(actors as SeededCharacterActor[]))
    }
  }

  return seeds
    .map((seed, index): CharacterPersonState | null => {
      const position = isFinitePoint3D(seed.position) ? seed.position : null
      if (!position) return null

      const kind = normalizeCharacterKind(seed.kind)
      const route = normalizeCharacterRoute(seed.route)
      const id = typeof seed.id === 'string' && seed.id.trim() ? seed.id : `scene-character-${index + 1}`

      return {
        id,
        name: typeof seed.name === 'string' && seed.name.trim() ? seed.name : `${CHARACTER_KIND_NAMES[kind]} ${index + 1}`,
        kind,
        enabled: seed.enabled !== false,
        motion: normalizeCharacterMotion(seed.motion),
        roam: seed.roam !== false,
        speed: typeof seed.speed === 'number' && Number.isFinite(seed.speed) ? seed.speed : kind === 'dog' ? 1.2 : 1,
        showBones: typeof seed.showBones === 'boolean' ? seed.showBones : kind !== 'dog',
        position,
        route,
        color:
          typeof seed.color === 'string' && seed.color.trim()
            ? seed.color
            : ['#4c6fff', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6'][index % 6] ?? '#4c6fff',
      }
    })
    .filter((person): person is CharacterPersonState => Boolean(person))
}

function normalizeCharacterPerson(person: CharacterPersonState): CharacterPersonState {
  return {
    ...person,
    kind: normalizeCharacterKind((person as CharacterPersonState & { kind?: unknown }).kind),
    roam: (person as CharacterPersonState & { roam?: unknown }).roam === true,
  }
}

function getCharacterPeopleFromState(character: {
  motion: CharacterMotion
  people?: CharacterPersonState[]
  position: [number, number, number]
  selectedPersonId?: string
  showBones: boolean
  speed: number
}): CharacterPersonState[] {
  if (character.people?.length) {
    return character.people.map(normalizeCharacterPerson)
  }

  return [
    {
      id: character.selectedPersonId || 'character-1',
      name: '角色 1',
      kind: 'adult',
      enabled: true,
      motion: character.motion,
      roam: false,
      speed: character.speed,
      showBones: character.showBones,
      position: character.position,
      color: '#4c6fff',
    },
  ]
}

function createPlacedCharacterPerson(
  kind: CharacterKind,
  index: number,
  position: [number, number, number],
): CharacterPersonState {
  const suffix = index + 1
  return {
    id: `character-${kind}-${Date.now()}-${suffix}`,
    name: `${CHARACTER_KIND_NAMES[kind]} ${suffix}`,
    kind,
    enabled: true,
    motion: 'idle',
    roam: false,
    speed: kind === 'dog' ? 1.2 : 1,
    showBones: kind !== 'dog',
    position,
    color: ['#4c6fff', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6'][
      index % 6
    ] ?? '#4c6fff',
  }
}

function pickCharacterRoamTarget(
  person: CharacterPersonState,
  actor: Group,
  collision: CharacterCollisionMap,
  canPenetrate: boolean,
): CharacterRoamTarget {
  const fromX = actor.position.x
  const fromZ = actor.position.z

  if (person.route && person.route.length > 0) {
    const nearestIndex = person.route.reduce((bestIndex, point, index, route) => {
      const best = route[bestIndex]
      if (!best) return index
      const bestDistance = Math.hypot(best[0] - fromX, best[2] - fromZ)
      const currentDistance = Math.hypot(point[0] - fromX, point[2] - fromZ)
      return currentDistance < bestDistance ? index : bestIndex
    }, 0)
    const direction = Math.random() > 0.34 ? 1 : -1
    const nextPoint = person.route[(nearestIndex + direction + person.route.length) % person.route.length]
    if (nextPoint) {
      const next = resolveCharacterWalkPosition(
        fromX,
        fromZ,
        nextPoint[0],
        nextPoint[2],
        collision,
        canPenetrate,
      )
      if (Math.hypot(next.x - fromX, next.z - fromZ) > 0.25) {
        return next
      }
    }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = 1.8 + Math.random() * 4.2
    const targetX = fromX + Math.sin(angle) * radius
    const targetZ = fromZ + Math.cos(angle) * radius
    const next = resolveCharacterWalkPosition(fromX, fromZ, targetX, targetZ, collision, canPenetrate)
    if (Math.hypot(next.x - fromX, next.z - fromZ) > 0.85) {
      return next
    }
  }

  return { x: fromX, z: fromZ }
}

function pickCharacterRoamActivity(
  person: CharacterPersonState,
  actor: Group,
  collision: CharacterCollisionMap,
  canPenetrate: boolean,
  now: number,
): CharacterRoamActivity {
  const roll = Math.random()
  const dog = person.kind === 'dog'

  if (roll < (dog ? 0.12 : 0.16)) {
    return { kind: 'pause', until: now + 1.4 + Math.random() * 3.6 }
  }

  if (!dog && roll < 0.3) {
    return { kind: 'sit', until: now + 2.4 + Math.random() * 5.2 }
  }

  if (roll < (dog ? 0.38 : 0.36)) {
    return { kind: 'jump', until: now + 0.9 + Math.random() * 0.7 }
  }

  const run = roll > 0.82
  return {
    kind: run ? 'run' : 'walk',
    target: pickCharacterRoamTarget(person, actor, collision, canPenetrate),
    until: now + (run ? 1.2 + Math.random() * 2.1 : 2.5 + Math.random() * 4.5),
  }
}

function getRoamMotion(activity: CharacterRoamActivity): CharacterMotion {
  if (activity.kind === 'pause') return 'idle'
  if (activity.kind === 'chat') return 'chat'
  return activity.kind
}

function getWaterMotion(
  person: CharacterPersonState,
  now: number,
  waterRuntimeRef: MutableRefObject<Record<string, CharacterWaterRuntime | undefined>>,
): CharacterMotion | null {
  const runtime = waterRuntimeRef.current[person.id]
  if (!runtime) {
    waterRuntimeRef.current[person.id] = { enteredAt: now, motion: 'swim' }
    return 'swim'
  }

  if (runtime.motion === 'dead') return 'dead'

  const elapsed = now - runtime.enteredAt
  const swimSeconds = person.kind === 'dog' ? 7 : 10
  const drownSeconds = person.kind === 'dog' ? 6 : 8
  const motion: CharacterMotion =
    elapsed > swimSeconds + drownSeconds ? 'dead' : elapsed > swimSeconds ? 'drown' : 'swim'

  runtime.motion = motion
  return motion
}

function DogLeg({
  legRef,
  x,
  z,
}: {
  legRef: { current: Group | null }
  x: number
  z: number
}) {
  return (
    <group position={[x, 0.34, z]} ref={legRef}>
      <mesh castShadow position={[0, -0.14, 0]}>
        <cylinderGeometry args={[0.045, 0.055, 0.28, 10]} />
        <meshStandardMaterial color="#8a5a36" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, -0.31, 0.035]} scale={[1.15, 0.55, 1.45]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial color="#6f4428" roughness={0.72} />
      </mesh>
    </group>
  )
}

function DogCharacterMesh({
  isSelected,
  motion,
  startedAt,
}: {
  isSelected: boolean
  motion: CharacterMotion
  startedAt: number
}) {
  const rootRef = useRef<Group | null>(null)
  const tailRef = useRef<Group | null>(null)
  const frontLeftLegRef = useRef<Group | null>(null)
  const frontRightLegRef = useRef<Group | null>(null)
  const backLeftLegRef = useRef<Group | null>(null)
  const backRightLegRef = useRef<Group | null>(null)

  useFrame(() => {
    const elapsed = (performance.now() - startedAt) / 1000
    const moving = motion === 'walk' || motion === 'run'
    const speed = motion === 'run' ? 9.5 : motion === 'walk' ? 6.2 : 2.2
    const stride = moving ? Math.sin(elapsed * speed) * (motion === 'run' ? 0.52 : 0.36) : 0
    const counterStride = -stride

    if (rootRef.current) {
      rootRef.current.rotation.set(0, 0, moving ? Math.sin(elapsed * speed) * 0.025 : 0)
      rootRef.current.position.y = moving
        ? Math.abs(Math.sin(elapsed * speed)) * 0.035
        : Math.sin(elapsed * 1.6) * 0.012

      if (motion === 'jump') {
        rootRef.current.position.y = Math.max(0, Math.sin((elapsed * 2.2) % Math.PI)) * 0.38
      } else if (motion === 'swim') {
        rootRef.current.position.y = -0.22 + Math.sin(elapsed * 3.2) * 0.035
        rootRef.current.rotation.x = 0.12 + Math.sin(elapsed * 2.4) * 0.08
      } else if (motion === 'drown') {
        rootRef.current.position.y = -0.3 + Math.abs(Math.sin(elapsed * 7.2)) * 0.08
        rootRef.current.rotation.x = 0.22 + Math.sin(elapsed * 5.6) * 0.18
        rootRef.current.rotation.z = Math.sin(elapsed * 6.1) * 0.16
      } else if (motion === 'dead') {
        rootRef.current.position.y = -0.34 + Math.sin(elapsed * 0.8) * 0.012
        rootRef.current.rotation.x = Math.PI / 2
        rootRef.current.rotation.z = 0.22
      } else if (motion === 'sit') {
        rootRef.current.position.y = -0.12
        rootRef.current.rotation.x = -0.28
      } else if (motion === 'crouch') {
        rootRef.current.position.y = -0.16
        rootRef.current.rotation.x = -0.18
      } else if (motion === 'lie') {
        rootRef.current.position.y = -0.3
        rootRef.current.rotation.x = 0.04
      }
    }

    if (tailRef.current) {
      tailRef.current.rotation.y = Math.sin(elapsed * (moving ? 9 : 3.5)) * 0.38
      tailRef.current.rotation.x =
        motion === 'sit' || motion === 'lie' ? 0.18 : 0.48 + Math.sin(elapsed * 2.4) * 0.08
    }

    const legPose =
      motion === 'sit'
        ? { front: 0.18, back: -1.05 }
        : motion === 'crouch'
          ? { front: 0.62, back: 0.48 }
          : motion === 'lie'
            ? { front: 1.34, back: 1.18 }
            : motion === 'dead'
              ? { front: 1.22, back: 1.14 }
            : null

    if (frontLeftLegRef.current) frontLeftLegRef.current.rotation.x = legPose?.front ?? stride
    if (frontRightLegRef.current) frontRightLegRef.current.rotation.x = legPose?.front ?? counterStride
    if (backLeftLegRef.current) backLeftLegRef.current.rotation.x = legPose?.back ?? counterStride
    if (backRightLegRef.current) backRightLegRef.current.rotation.x = legPose?.back ?? stride
  })

  return (
    <group name={`character-dog-${motion}`} ref={rootRef}>
      <mesh castShadow position={[0, 0.46, 0]} scale={[0.52, 0.68, 1.38]}>
        <sphereGeometry args={[0.34, 28, 18]} />
        <meshStandardMaterial color="#c58b54" roughness={0.68} />
      </mesh>
      <mesh castShadow position={[0, 0.68, 0.68]} scale={[0.7, 0.66, 0.78]}>
        <sphereGeometry args={[0.25, 24, 16]} />
        <meshStandardMaterial color="#b77946" roughness={0.68} />
      </mesh>
      <mesh castShadow position={[0, 0.58, 0.92]} scale={[0.74, 0.5, 0.92]}>
        <sphereGeometry args={[0.13, 18, 12]} />
        <meshStandardMaterial color="#8a5a36" roughness={0.72} />
      </mesh>
      <mesh castShadow position={[-0.09, 0.77, 0.9]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color="#111827" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0.09, 0.77, 0.9]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color="#111827" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.54, 1.05]} scale={[1.1, 0.72, 0.72]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshStandardMaterial color="#111827" roughness={0.55} />
      </mesh>
      <mesh castShadow position={[-0.19, 0.88, 0.58]} rotation={[0.18, 0.08, -0.52]}>
        <coneGeometry args={[0.07, 0.28, 14]} />
        <meshStandardMaterial color="#7a4b2e" roughness={0.74} />
      </mesh>
      <mesh castShadow position={[0.19, 0.88, 0.58]} rotation={[0.18, -0.08, 0.52]}>
        <coneGeometry args={[0.07, 0.28, 14]} />
        <meshStandardMaterial color="#7a4b2e" roughness={0.74} />
      </mesh>
      <group ref={tailRef} position={[0, 0.6, -0.62]} rotation={[0.48, 0, 0]}>
        <mesh castShadow position={[0, 0.05, -0.28]} rotation={[1.22, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.055, 0.48, 12]} />
          <meshStandardMaterial color="#b77946" roughness={0.7} />
        </mesh>
      </group>
      <DogLeg legRef={frontLeftLegRef} x={-0.29} z={0.28} />
      <DogLeg legRef={frontRightLegRef} x={0.29} z={0.28} />
      <DogLeg legRef={backLeftLegRef} x={-0.29} z={-0.26} />
      <DogLeg legRef={backRightLegRef} x={0.29} z={-0.26} />
      {isSelected ? (
        <mesh position={[0, 1.04, 0.68]}>
          <sphereGeometry args={[0.04, 10, 8]} />
          <meshBasicMaterial color="#f59e0b" depthTest={false} />
        </mesh>
      ) : null}
    </group>
  )
}

function CharacterPersonMesh({
  canPenetrate,
  collision,
  isSelected,
  onActorRef,
  person,
  startedAt,
}: {
  canPenetrate: boolean
  collision: CharacterCollisionMap
  isSelected: boolean
  onActorRef: (id: string, group: Group | null) => void
  person: CharacterPersonState
  startedAt: number
}) {
  const refs = useRef<RigRefs>({
    actor: null,
    root: null,
    hips: null,
    spine: null,
    head: null,
    leftUpperArm: null,
    leftLowerArm: null,
    rightUpperArm: null,
    rightLowerArm: null,
    leftUpperLeg: null,
    leftLowerLeg: null,
    rightUpperLeg: null,
    rightLowerLeg: null,
    leftFoot: null,
    rightFoot: null,
  })
  const dragRef = useRef<{
    offsetX: number
    offsetZ: number
  } | null>(null)

  useFrame(() => {
    poseRig(refs.current, person.motion, (performance.now() - startedAt) / 1000, person.speed)

    if (person.kind === 'elder') {
      if (refs.current.root) refs.current.root.rotation.x += 0.08
      if (refs.current.hips) refs.current.hips.rotation.x += 0.18
      if (refs.current.spine) refs.current.spine.rotation.x += 0.48
      if (refs.current.head) refs.current.head.rotation.x -= 0.24
      if (refs.current.leftUpperArm) {
        refs.current.leftUpperArm.rotation.x -= 0.12
        refs.current.leftUpperArm.rotation.z += 0.12
      }
      if (refs.current.leftLowerArm) refs.current.leftLowerArm.rotation.x -= 0.06
      if (refs.current.rightUpperArm) {
        refs.current.rightUpperArm.rotation.x -= 0.98
        refs.current.rightUpperArm.rotation.z += 0.2
      }
      if (refs.current.rightLowerArm) refs.current.rightLowerArm.rotation.x += 0.38
    }

    if (person.kind === 'wheelchair') {
      if (refs.current.root) refs.current.root.position.y -= 0.32
      if (refs.current.spine) refs.current.spine.rotation.x -= 0.18
      if (refs.current.leftUpperLeg) refs.current.leftUpperLeg.rotation.x = -1.18
      if (refs.current.rightUpperLeg) refs.current.rightUpperLeg.rotation.x = -1.18
      if (refs.current.leftLowerLeg) refs.current.leftLowerLeg.rotation.x = 1.58
      if (refs.current.rightLowerLeg) refs.current.rightLowerLeg.rotation.x = 1.58
      if (refs.current.leftFoot) refs.current.leftFoot.rotation.x = -0.3
      if (refs.current.rightFoot) refs.current.rightFoot.rotation.x = -0.3
      if (refs.current.leftUpperArm) refs.current.leftUpperArm.rotation.x = -0.28
      if (refs.current.rightUpperArm) refs.current.rightUpperArm.rotation.x = -0.28
    }
  })

  const selectPerson = () => {
    useViewer.getState().setCharacterActor({
      selectedPersonId: person.id,
      position: person.position,
    })
  }

  const beginDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    selectPerson()
    _dragPlane.constant = -person.position[1]
    if (!event.ray.intersectPlane(_dragPlane, _dragPoint)) return

    dragRef.current = {
      offsetX: person.position[0] - _dragPoint.x,
      offsetZ: person.position[2] - _dragPoint.z,
    }
    useViewer.getState().setCameraDragging(true)
    ;(event.target as unknown as PointerCaptureTarget).setPointerCapture?.(event.pointerId)
  }

  const dragPerson = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag) return
    event.stopPropagation()
    _dragPlane.constant = -person.position[1]
    if (!event.ray.intersectPlane(_dragPlane, _dragPoint)) return

    const targetX = _dragPoint.x + drag.offsetX
    const targetZ = _dragPoint.z + drag.offsetZ
    const next = resolveCharacterWalkPosition(
      person.position[0],
      person.position[2],
      targetX,
      targetZ,
      collision,
      canPenetrate,
    )

    updateCharacterPerson(person.id, (currentPerson) => ({
      ...currentPerson,
      motion: 'idle',
      position: [next.x, currentPerson.position[1], next.z],
    }))
  }

  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current) return
    event.stopPropagation()
    dragRef.current = null
    useViewer.getState().setCameraDragging(false)
    ;(event.target as unknown as PointerCaptureTarget).releasePointerCapture?.(event.pointerId)
  }

  const roamFromPerson = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    event.nativeEvent.preventDefault()
    selectPerson()
    dispatchCharacterMenu(person, refs.current.actor)
  }

  const kind = person.kind ?? 'adult'
  const isDog = kind === 'dog'
  const humanScale = kind === 'child' ? 0.68 : kind === 'wheelchair' ? 0.78 : kind === 'elder' ? 0.92 : 1
  const hitboxArgs: [number, number, number] = isDog ? [1.05, 0.72, 1.35] : [0.78, 1.9 * humanScale, 0.78]
  const hitboxY = isDog ? 0.36 : 0.95 * humanScale
  const labelY = isDog ? 1.05 : 2.25 * humanScale

  return (
    <group
      name={`character-actor-${person.id}`}
      position={person.position}
      onContextMenu={roamFromPerson}
      onPointerDown={beginDrag}
      onPointerMove={dragPerson}
      onPointerUp={finishDrag}
      ref={(group) => {
        refs.current.actor = group
        onActorRef(person.id, group)
      }}
      userData={{ characterId: person.id, selectable: false }}
    >
      <mesh
        name={`character-hitbox-${person.id}`}
        position={[0, hitboxY, 0]}
      >
        <boxGeometry args={hitboxArgs} />
        <meshBasicMaterial depthWrite={false} opacity={0} transparent />
      </mesh>
      {isSelected && (
        <mesh name={`character-selection-ring-${person.id}`} position={[0, 0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[isDog ? 0.62 : 0.46, 0.025, 8, 48]} />
          <meshBasicMaterial color="#2563eb" depthTest={false} />
        </mesh>
      )}
      {isDog ? (
        <DogCharacterMesh isSelected={isSelected} motion={person.motion} startedAt={startedAt} />
      ) : (
      <group
        name={`character-motion-${person.motion}`}
        ref={(group) => {
          refs.current.root = group
        }}
        scale={[humanScale, humanScale, humanScale]}
      >
        <group
          name="hips"
          position={[0, 1.15, 0]}
          ref={(group) => {
            refs.current.hips = group
          }}
        >
          <Joint visible={person.showBones || isSelected} />
          <group
            name="spine"
            position={[0, 0.36, 0]}
            ref={(group) => {
              refs.current.spine = group
            }}
          >
            <mesh castShadow position={[0, 0.24, 0]} scale={[1.05, 1.18, 0.68]}>
              <sphereGeometry args={[0.28, 28, 18]} />
              <meshStandardMaterial color={person.color} roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0, 0.43, 0.01]} scale={[1.42, 0.24, 0.46]}>
              <sphereGeometry args={[0.18, 24, 12]} />
              <meshStandardMaterial color={person.color} roughness={0.62} />
            </mesh>
            <mesh castShadow position={[0, -0.03, 0]} scale={[0.92, 0.36, 0.58]}>
              <sphereGeometry args={[0.2, 24, 12]} />
              <meshStandardMaterial color={person.kind === 'elder' ? '#3f3f46' : '#25304a'} roughness={0.66} />
            </mesh>
            <Joint visible={person.showBones || isSelected} />
            <group
              name="head"
              position={[0, 0.52, 0]}
              ref={(group) => {
                refs.current.head = group
              }}
            >
              <mesh castShadow position={[0, -0.04, 0]}>
                <cylinderGeometry args={[0.07, 0.08, 0.16, 14]} />
                <meshStandardMaterial color="#cfa981" roughness={0.58} />
              </mesh>
              <mesh castShadow position={[0, 0.2, 0]} scale={[0.92, 1.08, 0.86]}>
                <sphereGeometry args={[0.18, 28, 18]} />
                <meshStandardMaterial color="#d9b78f" roughness={0.55} />
              </mesh>
              <mesh castShadow position={[0, 0.25, 0.14]} scale={[0.8, 0.42, 0.34]}>
                <sphereGeometry args={[0.06, 12, 8]} />
                <meshStandardMaterial color="#c89f76" roughness={0.6} />
              </mesh>
              <mesh castShadow position={[-0.055, 0.25, 0.145]}>
                <sphereGeometry args={[0.018, 8, 6]} />
                <meshStandardMaterial color="#111827" roughness={0.5} />
              </mesh>
              <mesh castShadow position={[0.055, 0.25, 0.145]}>
                <sphereGeometry args={[0.018, 8, 6]} />
                <meshStandardMaterial color="#111827" roughness={0.5} />
              </mesh>
              <mesh castShadow position={[0, 0.34, -0.02]} scale={[1.02, 0.42, 0.9]}>
                <sphereGeometry args={[0.16, 18, 10]} />
                <meshStandardMaterial color={person.kind === 'elder' ? '#e5e7eb' : '#5b4636'} roughness={0.74} />
              </mesh>
              <Joint visible={person.showBones || isSelected} />
            </group>

            <group
              name="left-upper-arm"
              position={[-0.34, 0.42, 0]}
              ref={(group) => {
                refs.current.leftUpperArm = group
              }}
            >
              <Joint visible={person.showBones || isSelected} />
              <LimbSegment color="#d9b78f" length={0.42} radius={0.055} />
              <BoneGuide length={0.42} visible={person.showBones || isSelected} />
              <group
                name="left-lower-arm"
                position={[0, -0.42, 0]}
                ref={(group) => {
                  refs.current.leftLowerArm = group
                }}
              >
	                <Joint visible={person.showBones || isSelected} />
	                <LimbSegment color="#d9b78f" length={0.38} radius={0.048} />
	                <BoneGuide length={0.38} visible={person.showBones || isSelected} />
	                <mesh castShadow position={[0, -0.4, 0.02]} scale={[0.9, 0.7, 1.05]}>
	                  <sphereGeometry args={[0.065, 12, 8]} />
	                  <meshStandardMaterial color="#d9b78f" roughness={0.58} />
	                </mesh>
	              </group>
            </group>

            <group
              name="right-upper-arm"
              position={[0.34, 0.42, 0]}
              ref={(group) => {
                refs.current.rightUpperArm = group
              }}
            >
              <Joint visible={person.showBones || isSelected} />
              <LimbSegment color="#d9b78f" length={0.42} radius={0.055} />
              <BoneGuide length={0.42} visible={person.showBones || isSelected} />
              <group
                name="right-lower-arm"
                position={[0, -0.42, 0]}
                ref={(group) => {
                  refs.current.rightLowerArm = group
                }}
              >
	                <Joint visible={person.showBones || isSelected} />
	                <LimbSegment color="#d9b78f" length={0.38} radius={0.048} />
	                <BoneGuide length={0.38} visible={person.showBones || isSelected} />
	                <mesh castShadow position={[0, -0.4, 0.02]} scale={[0.9, 0.7, 1.05]}>
	                  <sphereGeometry args={[0.065, 12, 8]} />
	                  <meshStandardMaterial color="#d9b78f" roughness={0.58} />
	                </mesh>
	              </group>
            </group>
          </group>

          <group
            name="left-upper-leg"
            position={[-0.16, -0.06, 0]}
            ref={(group) => {
              refs.current.leftUpperLeg = group
            }}
          >
            <Joint visible={person.showBones || isSelected} />
            <LimbSegment color="#25304a" length={0.58} radius={0.075} />
            <BoneGuide length={0.58} visible={person.showBones || isSelected} />
            <group
              name="left-lower-leg"
              position={[0, -0.58, 0]}
              ref={(group) => {
                refs.current.leftLowerLeg = group
              }}
            >
              <Joint visible={person.showBones || isSelected} />
              <LimbSegment color="#25304a" length={0.52} radius={0.065} />
              <BoneGuide length={0.52} visible={person.showBones || isSelected} />
              <group
                name="left-foot"
                position={[0, -0.52, 0.08]}
                ref={(group) => {
                  refs.current.leftFoot = group
                }}
              >
                <mesh castShadow position={[0, -0.04, 0.08]} scale={[0.62, 0.2, 1.2]}>
                  <boxGeometry args={[0.16, 0.1, 0.28]} />
                  <meshStandardMaterial color="#1d2435" roughness={0.68} />
                </mesh>
              </group>
            </group>
          </group>

          <group
            name="right-upper-leg"
            position={[0.16, -0.06, 0]}
            ref={(group) => {
              refs.current.rightUpperLeg = group
            }}
          >
            <Joint visible={person.showBones || isSelected} />
            <LimbSegment color="#25304a" length={0.58} radius={0.075} />
            <BoneGuide length={0.58} visible={person.showBones || isSelected} />
            <group
              name="right-lower-leg"
              position={[0, -0.58, 0]}
              ref={(group) => {
                refs.current.rightLowerLeg = group
              }}
            >
              <Joint visible={person.showBones || isSelected} />
              <LimbSegment color="#25304a" length={0.52} radius={0.065} />
              <BoneGuide length={0.52} visible={person.showBones || isSelected} />
              <group
                name="right-foot"
                position={[0, -0.52, 0.08]}
                ref={(group) => {
                  refs.current.rightFoot = group
                }}
              >
                <mesh castShadow position={[0, -0.04, 0.08]} scale={[0.62, 0.2, 1.2]}>
                  <boxGeometry args={[0.16, 0.1, 0.28]} />
                  <meshStandardMaterial color="#1d2435" roughness={0.68} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
      )}
      {kind === 'wheelchair' ? (
        <group name="character-wheelchair" position={[0, 0.34, -0.08]} scale={[0.96, 0.96, 0.96]}>
          <mesh castShadow position={[-0.42, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.34, 0.028, 14, 56]} />
            <meshStandardMaterial color="#111827" metalness={0.05} roughness={0.48} />
          </mesh>
          <mesh position={[-0.42, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.24, 0.012, 10, 44]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.45} roughness={0.32} />
          </mesh>
          <mesh castShadow position={[0.42, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.34, 0.028, 14, 56]} />
            <meshStandardMaterial color="#111827" metalness={0.05} roughness={0.48} />
          </mesh>
          <mesh position={[0.42, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.24, 0.012, 10, 44]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.45} roughness={0.32} />
          </mesh>
          <mesh castShadow position={[-0.28, -0.2, 0.45]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.11, 0.018, 10, 28]} />
            <meshStandardMaterial color="#111827" roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0.28, -0.2, 0.45]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.11, 0.018, 10, 28]} />
            <meshStandardMaterial color="#111827" roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0, 0.28, 0.02]} rotation={[0.02, 0, 0]}>
            <boxGeometry args={[0.74, 0.1, 0.58]} />
            <meshStandardMaterial color="#2563eb" roughness={0.56} />
          </mesh>
          <mesh castShadow position={[0, 0.62, -0.36]} rotation={[-0.18, 0, 0]}>
            <boxGeometry args={[0.74, 0.64, 0.08]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.58} />
          </mesh>
          <mesh castShadow position={[0, 0.25, 0.26]}>
            <boxGeometry args={[0.8, 0.045, 0.05]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.35} roughness={0.36} />
          </mesh>
          <mesh castShadow position={[-0.34, 0.24, -0.1]} rotation={[0, 0, -0.28]}>
            <cylinderGeometry args={[0.018, 0.018, 0.82, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.35} roughness={0.36} />
          </mesh>
          <mesh castShadow position={[0.34, 0.24, -0.1]} rotation={[0, 0, 0.28]}>
            <cylinderGeometry args={[0.018, 0.018, 0.82, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.35} roughness={0.36} />
          </mesh>
          <mesh castShadow position={[-0.28, 0.5, -0.56]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.24, 10]} />
            <meshStandardMaterial color="#111827" roughness={0.42} />
          </mesh>
          <mesh castShadow position={[0.28, 0.5, -0.56]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.24, 10]} />
            <meshStandardMaterial color="#111827" roughness={0.42} />
          </mesh>
          <mesh castShadow position={[-0.2, 0.08, 0.56]} rotation={[0.18, 0, 0]}>
            <boxGeometry args={[0.28, 0.035, 0.22]} />
            <meshStandardMaterial color="#475569" roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0.2, 0.08, 0.56]} rotation={[0.18, 0, 0]}>
            <boxGeometry args={[0.28, 0.035, 0.22]} />
            <meshStandardMaterial color="#475569" roughness={0.5} />
          </mesh>
        </group>
      ) : null}
      {kind === 'elder' ? (
        <group name="character-cane" position={[0.38, 0.55, 0.88]} rotation={[0.32, 0, -0.16]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.022, 0.022, 1.04, 10]} />
            <meshStandardMaterial color="#7c4a2d" roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0.08, 0.52, 0.02]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.22, 10]} />
            <meshStandardMaterial color="#5b341f" roughness={0.62} />
          </mesh>
          <mesh castShadow position={[-0.01, -0.54, -0.02]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshStandardMaterial color="#1f2937" roughness={0.7} />
          </mesh>
        </group>
      ) : null}
      <group name="character-label" position={[0, labelY, 0]}>
        <mesh>
          <sphereGeometry args={[isSelected ? 0.07 : 0.045, 12, 8]} />
          <meshBasicMaterial color={isSelected ? '#f59e0b' : person.motion === 'idle' ? '#22c55e' : '#38bdf8'} />
        </mesh>
      </group>
    </group>
  )
}

export function CharacterActorSystem() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const character = useViewer((state) => state.characterActor)
  const nodes = useScene((state) => state.nodes)
  const collision = useMemo(() => buildCharacterCollisionMap(nodes), [nodes])
  const actorRefs = useRef(new Map<string, Group>())
  const pointerRaycaster = useRef(new Raycaster())
  const pointerDragRef = useRef<{
    offsetX: number
    offsetZ: number
    personId: string
  } | null>(null)
  const pendingMovePersonIdRef = useRef<string | null>(null)
  const firstPersonFollowPersonIdRef = useRef<string | null>(null)
  const [hiddenFirstPersonPersonId, setHiddenFirstPersonPersonId] = useState<string | null>(null)
  const startedAt = useMemo(() => performance.now(), [])
  const keysRef = useRef<CharacterKeys>({
    backward: false,
    crouch: false,
    forward: false,
    jump: false,
    left: false,
    right: false,
    run: false,
  })
  const jumpVelocityRef = useRef<Record<string, number>>({})
  const jumpOffsetRef = useRef<Record<string, number>>({})
  const manualMotionRef = useRef<Record<string, CharacterMotion | undefined>>({})
  const roamActivitiesRef = useRef<Record<string, CharacterRoamActivity | undefined>>({})
  const waterRuntimeRef = useRef<Record<string, CharacterWaterRuntime | undefined>>({})
  const sceneSeedSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    const seededPeople = getSceneCharacterSeeds(nodes)
    if (seededPeople.length === 0) return

    const signature = JSON.stringify(
      seededPeople.map((person) => [person.id, person.kind, person.position, person.route]),
    )
    if (sceneSeedSignatureRef.current === signature) return

    sceneSeedSignatureRef.current = signature
    manualMotionRef.current = {}
    roamActivitiesRef.current = {}
    useViewer.getState().setCharacterActor({
      enabled: true,
      motion: 'walk',
      count: seededPeople.length,
      people: seededPeople,
      selectedPersonId: seededPeople[0]?.id ?? 'scene-character-1',
      position: seededPeople[0]?.position ?? [0, 0, 0],
    })
  }, [nodes])

  useEffect(() => {
    const canvas = gl.domElement
    canvas.style.cursor = character.pendingPlacementKind ? 'crosshair' : ''

    return () => {
      if (character.pendingPlacementKind) {
        canvas.style.cursor = ''
      }
    }
  }, [character.pendingPlacementKind, gl])

  useEffect(() => {
    const canvas = gl.domElement

    const setRayFromPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      pointerRaycaster.current.setFromCamera(_pointer, camera)
    }

    const isPointerInsideCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    }

    const findHitPerson = (event: PointerEvent) => {
      const current = useViewer.getState().characterActor
      if (!current.enabled) return null

      const actors = [...actorRefs.current.values()]
      if (actors.length === 0) return null

      setRayFromPointer(event)
      const hit = pointerRaycaster.current.intersectObjects(actors, true)[0]
      if (!hit) return null

      const personId = getCharacterIdFromObject(hit.object)
      if (!personId) return null

      const people = getCharacterPeopleFromState(current)
      const person = people.find((entry) => entry.id === personId)
      const actor = actorRefs.current.get(personId)
      if (!(person && actor)) return null

      return { actor, person }
    }

    const stopPointerEvent = (event: PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const getPointerSurfacePoint = (event: PointerEvent, fallbackY = 0) => {
      if (!isPointerInsideCanvas(event)) return null

      setRayFromPointer(event)
      const hits = pointerRaycaster.current.intersectObjects(scene.children, true)
      for (const hit of hits) {
        if (isCharacterObject(hit.object)) continue
        if (hit.object.visible === false) continue
        if (hit.object.userData?.isGridHelper === true) continue
        if (hit.face) {
          _normalMatrix.getNormalMatrix(hit.object.matrixWorld)
          _surfaceNormal.copy(hit.face.normal).applyMatrix3(_normalMatrix).normalize()
          if (_surfaceNormal.y < 0.45) continue
        }
        return hit.point
      }

      _dragPlane.constant = -fallbackY
      if (pointerRaycaster.current.ray.intersectPlane(_dragPlane, _dragPoint)) {
        return _dragPoint.clone()
      }
      return null
    }

    const movePersonToPointer = (event: PointerEvent, personId: string) => {
      if (!isPointerInsideCanvas(event)) return false

      const current = useViewer.getState().characterActor
      const person = getCharacterPeopleFromState(current).find((entry) => entry.id === personId)
      if (!person) return false

      const point = getPointerSurfacePoint(event, person.position[1])
      if (!point) return false

      updateCharacterPerson(person.id, (currentPerson) => ({
        ...currentPerson,
        motion: 'idle',
        position: [point.x, point.y, point.z],
      }))
      return true
    }

    const placeNewPersonAtPointer = (event: PointerEvent, kind: CharacterKind) => {
      if (!isPointerInsideCanvas(event)) return false

      const point = getPointerSurfacePoint(event, 0)
      if (!point) return false

      const current = useViewer.getState().characterActor
      const currentPeople = current.enabled ? getCharacterPeopleFromState(current) : []
      const position = [point.x, point.y, point.z] as [number, number, number]
      const person = createPlacedCharacterPerson(kind, currentPeople.length, position)

      useViewer.getState().setCharacterActor({
        enabled: true,
        pendingPlacementKind: null,
        people: [...currentPeople, person],
        count: currentPeople.length + 1,
        selectedPersonId: person.id,
        position,
      })
      useViewer.getState().setCameraDragging(false)
      return true
    }

    const handlePointerDown = (event: PointerEvent) => {
      const pendingPlacementKind = useViewer.getState().characterActor.pendingPlacementKind
      if (event.button === 0 && pendingPlacementKind) {
        if (placeNewPersonAtPointer(event, pendingPlacementKind)) {
          stopPointerEvent(event)
        }
        return
      }

      if (event.button === 0 && pendingMovePersonIdRef.current) {
        const personId = pendingMovePersonIdRef.current
        stopPointerEvent(event)
        if (movePersonToPointer(event, personId)) {
          pendingMovePersonIdRef.current = null
          useViewer.getState().setCameraDragging(false)
        }
        return
      }

      if (event.button !== 0 && event.button !== 2) return

      const hit = findHitPerson(event)
      if (!hit) return

      stopPointerEvent(event)
      useViewer.getState().setCharacterActor({
        selectedPersonId: hit.person.id,
        position: hit.person.position,
      })

      if (event.button === 2) {
        dispatchCharacterMenu(hit.person, hit.actor)
        return
      }

      _dragPlane.constant = -hit.person.position[1]
      if (!pointerRaycaster.current.ray.intersectPlane(_dragPlane, _dragPoint)) return

      pointerDragRef.current = {
        personId: hit.person.id,
        offsetX: hit.person.position[0] - _dragPoint.x,
        offsetZ: hit.person.position[2] - _dragPoint.z,
      }
      canvas.setPointerCapture?.(event.pointerId)
      useViewer.getState().setCameraDragging(true)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = pointerDragRef.current
      const pendingMovePersonId = pendingMovePersonIdRef.current
      if (!(drag || pendingMovePersonId)) return

      stopPointerEvent(event)

      const current = useViewer.getState().characterActor
      const personId = drag?.personId ?? pendingMovePersonId
      const person = getCharacterPeopleFromState(current).find((entry) => entry.id === personId)
      if (!person) return

      const point = getPointerSurfacePoint(event, person.position[1])
      if (!point) return

      const targetX = drag ? point.x + drag.offsetX : point.x
      const targetZ = drag ? point.z + drag.offsetZ : point.z
      const next = resolveCharacterWalkPosition(
        person.position[0],
        person.position[2],
        targetX,
        targetZ,
        collision,
        current.canPenetrate,
      )

      updateCharacterPerson(person.id, (currentPerson) => ({
        ...currentPerson,
        motion: 'idle',
        position: [next.x, point.y, next.z],
      }))
    }

    const finishPointerDrag = (event: PointerEvent) => {
      const drag = pointerDragRef.current
      if (!drag) return

      stopPointerEvent(event)
      pointerDragRef.current = null
      canvas.releasePointerCapture?.(event.pointerId)
      useViewer.getState().setCameraDragging(false)
    }

    const preventNativeCharacterMenu = (event: MouseEvent) => {
      const hit = findHitPerson(event as PointerEvent)
      if (hit) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
    }

    canvas.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointermove', handlePointerMove, true)
    document.addEventListener('pointerup', finishPointerDrag, true)
    document.addEventListener('pointercancel', finishPointerDrag, true)
    canvas.addEventListener('contextmenu', preventNativeCharacterMenu, true)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('pointerup', finishPointerDrag, true)
      document.removeEventListener('pointercancel', finishPointerDrag, true)
      canvas.removeEventListener('contextmenu', preventNativeCharacterMenu, true)
      if (pointerDragRef.current) {
        useViewer.getState().setCameraDragging(false)
        pointerDragRef.current = null
      }
      if (pendingMovePersonIdRef.current) {
        useViewer.getState().setCameraDragging(false)
        pendingMovePersonIdRef.current = null
      }
    }
  }, [camera, collision, gl, scene])

  useEffect(() => {
    const handleCharacterCommand = (event: Event) => {
      if (!(event instanceof CustomEvent) || !detailIsCharacterCommand(event.detail)) return

      const command = event.detail.command
      const personId = event.detail.id
      if (typeof command !== 'string' || typeof personId !== 'string') return

      const current = useViewer.getState().characterActor
      const people = getCharacterPeopleFromState(current)
      const person = people.find((entry) => entry.id === personId)
      if (!person) return

      if (command === 'roam') {
        firstPersonFollowPersonIdRef.current = person.id
        setHiddenFirstPersonPersonId(person.id)
        dispatchCharacterRoam(person, actorRefs.current.get(person.id))
        return
      }

      if (command === 'select') {
        useViewer.getState().setCharacterActor({
          selectedPersonId: person.id,
          position: person.position,
        })
        pendingMovePersonIdRef.current = person.id
        useViewer.getState().setCameraDragging(true)
        return
      }

      if (command === 'set-motion') {
        const motion = event.detail.motion
        if (!isCharacterMotion(motion)) return
        manualMotionRef.current[person.id] = motion
        delete roamActivitiesRef.current[person.id]
        delete waterRuntimeRef.current[person.id]
        updateCharacterPerson(person.id, (entry) => ({
          ...entry,
          motion,
          roam: false,
        }))
        return
      }

      if (command === 'set-roam') {
        const roam = event.detail.roam === true
        delete manualMotionRef.current[person.id]
        delete roamActivitiesRef.current[person.id]
        delete waterRuntimeRef.current[person.id]
        updateCharacterPerson(person.id, (entry) => ({
          ...entry,
          motion: roam ? 'walk' : 'idle',
          roam,
        }))
        return
      }

      if (command === 'set-all-roam') {
        const roam = event.detail.roam === true
        manualMotionRef.current = {}
        roamActivitiesRef.current = {}
        waterRuntimeRef.current = {}
        useViewer.getState().setCharacterActor({
          people: people.map((entry) => ({
            ...entry,
            motion: roam ? 'walk' : 'idle',
            roam,
          })),
          motion: roam ? 'walk' : 'idle',
        })
        return
      }

      if (command === 'duplicate') {
        const copyIndex = people.filter((entry) => entry.id.startsWith(`${person.id}-copy`)).length + 1
        const copy: CharacterPersonState = {
          ...person,
          id: `${person.id}-copy-${Date.now()}`,
          name: `${person.name || '角色'} 副本 ${copyIndex}`,
          position: [person.position[0] + 0.55, person.position[1], person.position[2] + 0.55],
        }
        useViewer.getState().setCharacterActor({
          people: [...people, copy],
          count: people.length + 1,
          selectedPersonId: copy.id,
          position: copy.position,
        })
        return
      }

      if (command === 'delete') {
        delete manualMotionRef.current[person.id]
        delete roamActivitiesRef.current[person.id]
        delete waterRuntimeRef.current[person.id]
        if (pendingMovePersonIdRef.current === person.id) {
          pendingMovePersonIdRef.current = null
          useViewer.getState().setCameraDragging(false)
        }
        if (firstPersonFollowPersonIdRef.current === person.id) {
          firstPersonFollowPersonIdRef.current = null
          setHiddenFirstPersonPersonId(null)
        }
        const nextPeople = people.filter((entry) => entry.id !== person.id)
        const selectedPerson = nextPeople[0]
        useViewer.getState().setCharacterActor({
          people: nextPeople,
          count: Math.max(1, nextPeople.length),
          selectedPersonId: selectedPerson?.id,
          position: selectedPerson?.position ?? current.position,
          enabled: nextPeople.length > 0,
        })
      }
    }

    window.addEventListener(CHARACTER_COMMAND_EVENT, handleCharacterCommand)
    return () => window.removeEventListener(CHARACTER_COMMAND_EVENT, handleCharacterCommand)
  }, [])

  useEffect(() => {
    const stopFirstPersonFollow = () => {
      firstPersonFollowPersonIdRef.current = null
      setHiddenFirstPersonPersonId(null)
    }

    window.addEventListener(FIRST_PERSON_END_EVENT, stopFirstPersonFollow)
    return () => window.removeEventListener(FIRST_PERSON_END_EVENT, stopFirstPersonFollow)
  }, [])

  useEffect(() => {
    const handleFirstPersonPose = (event: Event) => {
      if (!(event instanceof CustomEvent) || !detailIsFirstPersonPose(event.detail)) return
      const personId = firstPersonFollowPersonIdRef.current
      if (!personId) return

      const { x, z, yaw } = event.detail
      if (!(typeof x === 'number' && Number.isFinite(x))) return
      if (!(typeof z === 'number' && Number.isFinite(z))) return

      updateCharacterPerson(personId, (person) => ({
        ...person,
        motion: 'idle',
        position: [x, person.position[1], z],
      }))

      const actor = actorRefs.current.get(personId)
      if (actor && typeof yaw === 'number' && Number.isFinite(yaw)) {
        actor.rotation.y = yaw - Math.PI
      }
    }

    window.addEventListener(FIRST_PERSON_POSE_EVENT, handleFirstPersonPose)
    return () => window.removeEventListener(FIRST_PERSON_POSE_EVENT, handleFirstPersonPose)
  }, [])

  useEffect(() => {
    const updateKey = (event: KeyboardEvent, pressed: boolean) => {
      if (isEditableTarget(event.target)) return
      const keys = keysRef.current

      if (event.code === 'KeyW' || event.code === 'ArrowUp') keys.forward = pressed
      else if (event.code === 'KeyA' || event.code === 'ArrowLeft') keys.left = pressed
      else if (event.code === 'KeyS' || event.code === 'ArrowDown') keys.backward = pressed
      else if (event.code === 'KeyD' || event.code === 'ArrowRight') keys.right = pressed
      else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.run = pressed
      else if (event.code === 'ControlLeft' || event.code === 'ControlRight') keys.crouch = pressed
      else if (event.code === 'Space') keys.jump = pressed
      else return

      if (useViewer.getState().characterActor.enabled) {
        event.preventDefault()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => updateKey(event, true)
    const handleKeyUp = (event: KeyboardEvent) => updateKey(event, false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      keysRef.current = {
        backward: false,
        crouch: false,
        forward: false,
        jump: false,
        left: false,
        right: false,
        run: false,
      }
    }
  }, [])

  useFrame(({ camera }, delta) => {
    const current = useViewer.getState().characterActor
    const people = getCharacterPeopleFromState(current)
    const selectedPerson =
      people.find((person) => person.id === current.selectedPersonId) ?? people[0]
    if (!(current.enabled && selectedPerson)) return
    const selectedActor = actorRefs.current.get(selectedPerson.id)

    const keys = keysRef.current
    const wantsMove = keys.forward || keys.backward || keys.left || keys.right
    const wantsCrouch = keys.crouch
    const wantsRun = keys.run && wantsMove && !wantsCrouch
    const selectedId = selectedPerson.id

    const now = performance.now() / 1000
    const selectedWaterArea = selectedActor
      ? getCharacterWaterAreaAt(selectedActor.position.x, selectedActor.position.z, collision)
      : null
    const selectedWaterMotion = selectedWaterArea
      ? getWaterMotion(selectedPerson, now, waterRuntimeRef)
      : null
    if (!selectedWaterArea) {
      delete waterRuntimeRef.current[selectedId]
    }
    const selectedIsImmobile = selectedWaterMotion === 'dead'
    const selectedIsKeyboardControlled =
      Boolean(selectedActor) && (wantsMove || wantsCrouch || keys.jump) && !selectedIsImmobile
    const roamUpdates = new Map<string, { motion: CharacterMotion; position: [number, number, number] }>()
    const roamingPeople = people.filter((person) => person.roam && person.enabled)

    for (let index = 0; index < roamingPeople.length; index += 1) {
      const person = roamingPeople[index]
      if (!person || roamActivitiesRef.current[person.id]?.kind === 'chat') continue
      const actor = actorRefs.current.get(person.id)
      if (!actor) continue

      for (let otherIndex = index + 1; otherIndex < roamingPeople.length; otherIndex += 1) {
        const other = roamingPeople[otherIndex]
        if (!other || roamActivitiesRef.current[other.id]?.kind === 'chat') continue
        const otherActor = actorRefs.current.get(other.id)
        if (!otherActor) continue

        const distance = Math.hypot(actor.position.x - otherActor.position.x, actor.position.z - otherActor.position.z)
        if (distance > 1.25 || Math.random() > 0.025) continue

        const until = now + 2.4 + Math.random() * 3.8
        roamActivitiesRef.current[person.id] = { kind: 'chat', partnerId: other.id, until }
        roamActivitiesRef.current[other.id] = { kind: 'chat', partnerId: person.id, until }
        break
      }
    }

    for (const person of people) {
      if (!person.roam || !person.enabled) continue
      if (person.id === selectedId && selectedIsKeyboardControlled) continue

      const roamActor = actorRefs.current.get(person.id)
      if (!roamActor) continue

      const waterArea = getCharacterWaterAreaAt(roamActor.position.x, roamActor.position.z, collision)
      if (waterArea) {
        delete roamActivitiesRef.current[person.id]
        const waterMotion = getWaterMotion(person, now, waterRuntimeRef) ?? 'swim'
        roamActor.position.y = waterArea.surfaceY
        roamUpdates.set(person.id, {
          motion: waterMotion,
          position: [roamActor.position.x, waterArea.surfaceY, roamActor.position.z],
        })
        continue
      }
      delete waterRuntimeRef.current[person.id]

      let activity = roamActivitiesRef.current[person.id]
      if (!activity || now >= activity.until) {
        activity = pickCharacterRoamActivity(person, roamActor, collision, current.canPenetrate, now)
        roamActivitiesRef.current[person.id] = activity
      }

      if (activity.kind === 'chat') {
        const partnerActor = activity.partnerId ? actorRefs.current.get(activity.partnerId) : null
        if (partnerActor) {
          const dx = partnerActor.position.x - roamActor.position.x
          const dz = partnerActor.position.z - roamActor.position.z
          if (Math.hypot(dx, dz) > 0.001) {
            roamActor.rotation.y = Math.atan2(dx, dz)
          }
        }
        roamUpdates.set(person.id, {
          motion: 'chat',
          position: [roamActor.position.x, person.position[1], roamActor.position.z],
        })
        continue
      }

      if (activity.kind === 'pause' || activity.kind === 'sit' || activity.kind === 'jump') {
        roamActor.position.y = person.position[1]
        roamUpdates.set(person.id, {
          motion: getRoamMotion(activity),
          position: [roamActor.position.x, person.position[1], roamActor.position.z],
        })
        continue
      }

      let target = activity.target
      const distanceToTarget = target
        ? Math.hypot(target.x - roamActor.position.x, target.z - roamActor.position.z)
        : 0
      if (!target || distanceToTarget < 0.25) {
        activity = pickCharacterRoamActivity(person, roamActor, collision, current.canPenetrate, now)
        if (activity.kind === 'walk' || activity.kind === 'run') {
          target = activity.target
        } else {
          roamActivitiesRef.current[person.id] = activity
          roamUpdates.set(person.id, {
            motion: getRoamMotion(activity),
            position: [roamActor.position.x, person.position[1], roamActor.position.z],
          })
          continue
        }
        roamActivitiesRef.current[person.id] = activity
      }
      if (!target) continue

      const dx = target.x - roamActor.position.x
      const dz = target.z - roamActor.position.z
      const distance = Math.hypot(dx, dz)
      if (distance > 0.001) {
        const baseSpeed = activity.kind === 'run' ? CHARACTER_RUN_SPEED : CHARACTER_WALK_SPEED
        const speed = baseSpeed * (person.speed || 1) * (person.kind === 'dog' ? 1.25 : 1)
        const step = Math.min(distance, speed * delta)
        roamActor.position.x += (dx / distance) * step
        roamActor.position.z += (dz / distance) * step
        roamActor.position.y = person.position[1]
        roamActor.rotation.y = Math.atan2(dx, dz)
        roamUpdates.set(person.id, {
          motion: activity.kind,
          position: [roamActor.position.x, person.position[1], roamActor.position.z],
        })
      }
    }

    if (!selectedActor) {
      if (roamUpdates.size > 0) {
        const nextPeople = people.map((person) =>
          roamUpdates.has(person.id)
            ? {
                ...person,
                motion: roamUpdates.get(person.id)?.motion ?? person.motion,
                position: roamUpdates.get(person.id)?.position ?? person.position,
              }
            : person,
        )
        useViewer.setState({
          characterActor: {
            ...current,
            people: nextPeople,
          },
        })
      }
      return
    }

    const actor = selectedActor
    const jumpOffset = jumpOffsetRef.current[selectedId] ?? 0
    const jumpVelocity = jumpVelocityRef.current[selectedId] ?? 0

    if (keys.jump && jumpOffset <= 0.001 && jumpVelocity <= 0) {
      jumpVelocityRef.current[selectedId] = 4.2
    }

    if (
      !selectedWaterMotion &&
      ((jumpVelocityRef.current[selectedId] ?? 0) !== 0 || (jumpOffsetRef.current[selectedId] ?? 0) > 0)
    ) {
      jumpVelocityRef.current[selectedId] = (jumpVelocityRef.current[selectedId] ?? 0) - 9.8 * delta
      jumpOffsetRef.current[selectedId] = Math.max(
        0,
        (jumpOffsetRef.current[selectedId] ?? 0) + (jumpVelocityRef.current[selectedId] ?? 0) * delta,
      )
      if (jumpOffsetRef.current[selectedId] === 0) jumpVelocityRef.current[selectedId] = 0
    }

    let nextMotion: CharacterMotion =
      roamUpdates.get(selectedId)?.motion ?? manualMotionRef.current[selectedId] ?? 'idle'
    if (selectedWaterMotion) {
      delete manualMotionRef.current[selectedId]
      nextMotion = selectedWaterMotion
    } else if ((jumpOffsetRef.current[selectedId] ?? 0) > 0.025 || (jumpVelocityRef.current[selectedId] ?? 0) > 0) {
      delete manualMotionRef.current[selectedId]
      nextMotion = 'jump'
    } else if (wantsCrouch) {
      delete manualMotionRef.current[selectedId]
      nextMotion = 'crouch'
    } else if (wantsRun) {
      delete manualMotionRef.current[selectedId]
      nextMotion = 'run'
    } else if (wantsMove) {
      delete manualMotionRef.current[selectedId]
      nextMotion = 'walk'
    }

    _direction.set(0, 0, 0)
    if (wantsMove && !selectedIsImmobile) {
      camera.getWorldDirection(_forward)
      _forward.y = 0
      if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1)
      _forward.normalize()
      _right.crossVectors(_forward, camera.up).normalize()

      if (keys.forward) _direction.add(_forward)
      if (keys.backward) _direction.sub(_forward)
      if (keys.right) _direction.add(_right)
      if (keys.left) _direction.sub(_right)

      if (_direction.lengthSq() > 0) {
        _direction.normalize()
        const speed = wantsRun ? CHARACTER_RUN_SPEED : CHARACTER_WALK_SPEED
        const fromX = actor.position.x
        const fromZ = actor.position.z
        const toX = fromX + _direction.x * speed * delta
        const toZ = fromZ + _direction.z * speed * delta
        const next = resolveCharacterWalkPosition(
          fromX,
          fromZ,
          toX,
          toZ,
          collision,
          current.canPenetrate,
        )
        actor.position.x = next.x
        actor.position.z = next.z
        actor.rotation.y = Math.atan2(_direction.x, _direction.z)
      }
    }

    const selectedWaterAreaAfterMove = getCharacterWaterAreaAt(actor.position.x, actor.position.z, collision)
    const selectedWaterMotionAfterMove = selectedWaterAreaAfterMove
      ? getWaterMotion(selectedPerson, now, waterRuntimeRef)
      : null
    if (selectedWaterAreaAfterMove && selectedWaterMotionAfterMove) {
      nextMotion = selectedWaterMotionAfterMove
      actor.position.y = selectedWaterAreaAfterMove.surfaceY
    } else {
      actor.position.y = selectedPerson.position[1] + (jumpOffsetRef.current[selectedId] ?? 0)
    }

    if (
      roamUpdates.size > 0 ||
      selectedPerson.motion !== nextMotion ||
      Math.abs(selectedPerson.position[0] - actor.position.x) > 0.001 ||
      Math.abs(selectedPerson.position[2] - actor.position.z) > 0.001
    ) {
      const nextPeople = people.map((person) =>
        person.id === selectedId
          ? {
              ...person,
              motion: nextMotion,
              position: [actor.position.x, actor.position.y, actor.position.z] as [number, number, number],
            }
          : roamUpdates.has(person.id)
            ? {
                ...person,
                motion: roamUpdates.get(person.id)?.motion ?? person.motion,
                position: roamUpdates.get(person.id)?.position ?? person.position,
              }
            : person,
      )
      useViewer.setState({
        characterActor: {
          ...current,
          motion: nextMotion,
          position: [actor.position.x, actor.position.y, actor.position.z],
          people: nextPeople,
        },
      })
    }
  })

  if (!character.enabled) return null

  const people = getCharacterPeopleFromState(character)

  return (
    <group name="character-actors">
      {people.map((person) =>
        person.enabled && person.id !== hiddenFirstPersonPersonId ? (
          <CharacterPersonMesh
            canPenetrate={character.canPenetrate}
            collision={collision}
            isSelected={person.id === character.selectedPersonId}
            key={person.id}
            onActorRef={(id, group) => {
              if (group) actorRefs.current.set(id, group)
              else actorRefs.current.delete(id)
            }}
            person={person}
            startedAt={startedAt}
          />
        ) : null,
      )}
    </group>
  )
}

export { characterMotionLabels }
