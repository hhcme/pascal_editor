'use client'

import { useScene } from '@pascal-app/core'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type Group, type Object3D, Plane, Raycaster, Vector2, Vector3 } from 'three'
import useViewer, { type CharacterMotion, type CharacterPersonState } from '../../store/use-viewer'

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
  parentId?: string | null
  position?: [number, number, number]
  rotation?: [number, number, number]
  type: string
  wallId?: string
  width?: number
  start?: [number, number]
  end?: [number, number]
}

type DoorOpening = {
  leftT: number
  rightT: number
}

type WallCollisionSegment = {
  ex: number
  ez: number
  length: number
  openings: DoorOpening[]
  sx: number
  sz: number
}

const characterMotionLabels: Record<CharacterMotion, string> = {
  idle: '站立',
  walk: '走',
  run: '跑',
  crouch: '蹲',
  jump: '跳',
}

const CHARACTER_WALK_SPEED = 1.4
const CHARACTER_RUN_SPEED = 3.2
const CHARACTER_COLLISION_RADIUS = 0.3
const DOOR_OPENING_PADDING = 0.16
const MIN_WALL_LENGTH = 0.001
const _forward = new Vector3()
const _right = new Vector3()
const _direction = new Vector3()
const _dragPlane = new Plane(new Vector3(0, 1, 0), 0)
const _dragPoint = new Vector3()
const _pointer = new Vector2()

const CHARACTER_ROAM_EVENT = 'editor:character-roam-request'
const CHARACTER_MENU_EVENT = 'editor:character-menu-request'
const CHARACTER_COMMAND_EVENT = 'editor:character-command'
const FIRST_PERSON_POSE_EVENT = 'editor:first-person-pose'
const FIRST_PERSON_END_EVENT = 'editor:first-person-ended'

type PointerCaptureTarget = {
  setPointerCapture?: (pointerId: number) => void
  releasePointerCapture?: (pointerId: number) => void
}

type CharacterCommandDetail = {
  command?: unknown
  id?: unknown
}

type FirstPersonPoseDetail = {
  x?: unknown
  y?: unknown
  z?: unknown
  yaw?: unknown
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function wallLength(wall: SceneNodeLike) {
  if (!(wall.start && wall.end)) return 0
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

function isWallOpening(wall: WallCollisionSegment, t: number) {
  return wall.openings.some((opening) => t >= opening.leftT && t <= opening.rightT)
}

function pointToSegmentDistanceT(
  px: number,
  pz: number,
  sx: number,
  sz: number,
  ex: number,
  ez: number,
) {
  const dx = ex - sx
  const dz = ez - sz
  const lengthSq = dx * dx + dz * dz

  if (lengthSq < 1e-9) {
    return { distance: Math.hypot(px - sx, pz - sz), t: 0 }
  }

  const t = clamp01(((px - sx) * dx + (pz - sz) * dz) / lengthSq)
  const closestX = sx + dx * t
  const closestZ = sz + dz * t
  return { distance: Math.hypot(px - closestX, pz - closestZ), t }
}

function wallIntersectionT(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  wall: WallCollisionSegment,
) {
  const rx = bx - ax
  const rz = bz - az
  const sx = wall.ex - wall.sx
  const sz = wall.ez - wall.sz
  const denominator = rx * sz - rz * sx

  if (Math.abs(denominator) < 1e-9) return null

  const qpx = wall.sx - ax
  const qpz = wall.sz - az
  const moveT = (qpx * sz - qpz * sx) / denominator
  const wallT = (qpx * rz - qpz * rx) / denominator

  if (moveT < 0 || moveT > 1 || wallT < 0 || wallT > 1) return null
  return wallT
}

function isMovementBlocked(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  walls: WallCollisionSegment[],
) {
  if (Math.hypot(toX - fromX, toZ - fromZ) < 1e-6) return false

  for (const wall of walls) {
    const intersectionT = wallIntersectionT(fromX, fromZ, toX, toZ, wall)
    if (intersectionT !== null && !isWallOpening(wall, intersectionT)) {
      return true
    }

    const next = pointToSegmentDistanceT(toX, toZ, wall.sx, wall.sz, wall.ex, wall.ez)
    const previous = pointToSegmentDistanceT(fromX, fromZ, wall.sx, wall.sz, wall.ex, wall.ez)
    if (
      next.distance < CHARACTER_COLLISION_RADIUS &&
      !isWallOpening(wall, next.t) &&
      (previous.distance >= CHARACTER_COLLISION_RADIUS || next.distance < previous.distance - 0.01)
    ) {
      return true
    }
  }

  return false
}

function resolveWalkPosition(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  walls: WallCollisionSegment[],
) {
  if (!isMovementBlocked(fromX, fromZ, toX, toZ, walls)) {
    return { x: toX, z: toZ }
  }

  if (!isMovementBlocked(fromX, fromZ, toX, fromZ, walls)) {
    return { x: toX, z: fromZ }
  }

  if (!isMovementBlocked(fromX, fromZ, fromX, toZ, walls)) {
    return { x: fromX, z: toZ }
  }

  return { x: fromX, z: fromZ }
}

function buildCharacterCollisionWalls(rawNodes: Record<string, unknown>): WallCollisionSegment[] {
  const nodes = rawNodes as Record<string, SceneNodeLike>
  const doorsByWallId = new Map<string, SceneNodeLike[]>()

  for (const node of Object.values(nodes)) {
    if (node?.type !== 'door') continue
    const wallId = node.wallId ?? node.parentId
    if (!wallId) continue
    const doors = doorsByWallId.get(wallId) ?? []
    doors.push(node)
    doorsByWallId.set(wallId, doors)
  }

  const walls: WallCollisionSegment[] = []
  for (const node of Object.values(nodes)) {
    if (node?.type !== 'wall') continue
    const length = wallLength(node)
    if (!(node.start && node.end) || length < MIN_WALL_LENGTH) continue

    const openings = (doorsByWallId.get(node.id) ?? []).map((door) => {
      const doorX = door.position?.[0] ?? 0
      const doorWidth = door.width ?? 0.9
      return {
        leftT: clamp01((doorX - doorWidth / 2 - DOOR_OPENING_PADDING) / length),
        rightT: clamp01((doorX + doorWidth / 2 + DOOR_OPENING_PADDING) / length),
      }
    })

    walls.push({
      sx: node.start[0],
      sz: node.start[1],
      ex: node.end[0],
      ez: node.end[1],
      length,
      openings,
    })
  }

  return walls
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
  return person.id.includes('child') ? 1.2 : 1.65
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

function getCharacterPeopleFromState(character: {
  motion: CharacterMotion
  people?: CharacterPersonState[]
  position: [number, number, number]
  selectedPersonId?: string
  showBones: boolean
  speed: number
}) {
  if (character.people?.length) return character.people

  return [
    {
      id: character.selectedPersonId || 'character-1',
      name: '角色 1',
      enabled: true,
      motion: character.motion,
      speed: character.speed,
      showBones: character.showBones,
      position: character.position,
      color: '#4c6fff',
    },
  ]
}

function CharacterPersonMesh({
  isSelected,
  onActorRef,
  person,
  startedAt,
  walls,
}: {
  isSelected: boolean
  onActorRef: (id: string, group: Group | null) => void
  person: CharacterPersonState
  startedAt: number
  walls: WallCollisionSegment[]
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
    const next = resolveWalkPosition(person.position[0], person.position[2], targetX, targetZ, walls)

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
        position={[0, 0.95, 0]}
      >
        <boxGeometry args={[0.78, 1.9, 0.78]} />
        <meshBasicMaterial depthWrite={false} opacity={0} transparent />
      </mesh>
      {isSelected && (
        <mesh name={`character-selection-ring-${person.id}`} position={[0, 0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.46, 0.025, 8, 48]} />
          <meshBasicMaterial color="#2563eb" depthTest={false} />
        </mesh>
      )}
      <group
        name={`character-motion-${person.motion}`}
        ref={(group) => {
          refs.current.root = group
        }}
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
            <mesh castShadow position={[0, 0.22, 0]} scale={[1.15, 1, 0.72]}>
              <sphereGeometry args={[0.28, 28, 18]} />
              <meshStandardMaterial color={person.color} roughness={0.6} />
            </mesh>
            <Joint visible={person.showBones || isSelected} />
            <group
              name="head"
              position={[0, 0.52, 0]}
              ref={(group) => {
                refs.current.head = group
              }}
            >
              <mesh castShadow position={[0, 0.18, 0]}>
                <sphereGeometry args={[0.18, 24, 16]} />
                <meshStandardMaterial color="#d9b78f" roughness={0.55} />
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
      <group name="character-label" position={[0, 2.25, 0]}>
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
  const character = useViewer((state) => state.characterActor)
  const nodes = useScene((state) => state.nodes)
  const walls = useMemo(() => buildCharacterCollisionWalls(nodes), [nodes])
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

    const movePersonToPointer = (event: PointerEvent, personId: string) => {
      if (!isPointerInsideCanvas(event)) return false

      const current = useViewer.getState().characterActor
      const person = getCharacterPeopleFromState(current).find((entry) => entry.id === personId)
      if (!person) return false

      setRayFromPointer(event)
      _dragPlane.constant = -person.position[1]
      if (!pointerRaycaster.current.ray.intersectPlane(_dragPlane, _dragPoint)) return false

      updateCharacterPerson(person.id, (currentPerson) => ({
        ...currentPerson,
        motion: 'idle',
        position: [_dragPoint.x, currentPerson.position[1], _dragPoint.z],
      }))
      return true
    }

    const handlePointerDown = (event: PointerEvent) => {
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

      setRayFromPointer(event)
      _dragPlane.constant = -person.position[1]
      if (!pointerRaycaster.current.ray.intersectPlane(_dragPlane, _dragPoint)) return

      const targetX = drag ? _dragPoint.x + drag.offsetX : _dragPoint.x
      const targetZ = drag ? _dragPoint.z + drag.offsetZ : _dragPoint.z
      const next = resolveWalkPosition(person.position[0], person.position[2], targetX, targetZ, walls)

      updateCharacterPerson(person.id, (currentPerson) => ({
        ...currentPerson,
        motion: 'idle',
        position: [next.x, currentPerson.position[1], next.z],
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
  }, [camera, gl, walls])

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
    const actor = actorRefs.current.get(selectedPerson.id)
    if (!actor) return

    const keys = keysRef.current
    const wantsMove = keys.forward || keys.backward || keys.left || keys.right
    const wantsCrouch = keys.crouch
    const wantsRun = keys.run && wantsMove && !wantsCrouch

    const selectedId = selectedPerson.id
    const jumpOffset = jumpOffsetRef.current[selectedId] ?? 0
    const jumpVelocity = jumpVelocityRef.current[selectedId] ?? 0

    if (keys.jump && jumpOffset <= 0.001 && jumpVelocity <= 0) {
      jumpVelocityRef.current[selectedId] = 4.2
    }

    if ((jumpVelocityRef.current[selectedId] ?? 0) !== 0 || (jumpOffsetRef.current[selectedId] ?? 0) > 0) {
      jumpVelocityRef.current[selectedId] = (jumpVelocityRef.current[selectedId] ?? 0) - 9.8 * delta
      jumpOffsetRef.current[selectedId] = Math.max(
        0,
        (jumpOffsetRef.current[selectedId] ?? 0) + (jumpVelocityRef.current[selectedId] ?? 0) * delta,
      )
      if (jumpOffsetRef.current[selectedId] === 0) jumpVelocityRef.current[selectedId] = 0
    }

    let nextMotion: CharacterMotion = 'idle'
    if ((jumpOffsetRef.current[selectedId] ?? 0) > 0.025 || (jumpVelocityRef.current[selectedId] ?? 0) > 0) {
      nextMotion = 'jump'
    } else if (wantsCrouch) {
      nextMotion = 'crouch'
    } else if (wantsRun) {
      nextMotion = 'run'
    } else if (wantsMove) {
      nextMotion = 'walk'
    }

    _direction.set(0, 0, 0)
    if (wantsMove) {
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
        const next = resolveWalkPosition(fromX, fromZ, toX, toZ, walls)
        actor.position.x = next.x
        actor.position.z = next.z
        actor.rotation.y = Math.atan2(_direction.x, _direction.z)
      }
    }

    actor.position.y = selectedPerson.position[1] + (jumpOffsetRef.current[selectedId] ?? 0)

    if (
      selectedPerson.motion !== nextMotion ||
      Math.abs(selectedPerson.position[0] - actor.position.x) > 0.001 ||
      Math.abs(selectedPerson.position[2] - actor.position.z) > 0.001
    ) {
      const nextPeople = people.map((person) =>
        person.id === selectedId
          ? {
              ...person,
              motion: nextMotion,
              position: [actor.position.x, person.position[1], actor.position.z] as [number, number, number],
            }
          : person,
      )
      useViewer.setState({
        characterActor: {
          ...current,
          motion: nextMotion,
          position: [actor.position.x, selectedPerson.position[1], actor.position.z],
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
            isSelected={person.id === character.selectedPersonId}
            key={person.id}
            onActorRef={(id, group) => {
              if (group) actorRefs.current.set(id, group)
              else actorRefs.current.delete(id)
            }}
            person={person}
            startedAt={startedAt}
            walls={walls}
          />
        ) : null,
      )}
    </group>
  )
}

export { characterMotionLabels }
