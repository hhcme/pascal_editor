'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type CeilingNode,
  DoorNode,
  emitter,
  FenceNode,
  ItemNode,
  type NodeEvent,
  RoofNode,
  RoofSegmentNode,
  type SlabNode,
  StairNode,
  StairSegmentNode,
  sceneRegistry,
  useScene,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import { type CharacterMotion, useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Activity, Copy, Footprints, MousePointer2, Move, Navigation, Trash2, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { float } from 'three/tsl'
import { useStore } from 'zustand'
import { sfxEmitter } from '../../lib/sfx-bus'
import useEditor from '../../store/use-editor'
import { collectSketchDistanceDimensionIdsReferencingEntities } from '../tools/sketch/sketch-distance-dimensions'
import { NodeActionMenu } from './node-action-menu'
import { SelectionTransformGizmo } from './selection-transform-gizmo'

const ALLOWED_TYPES = [
  'item',
  'door',
  'window',
  'roof',
  'roof-segment',
  'stair',
  'stair-segment',
  'wall',
  'fence',
  'slab',
  'ceiling',
] as const
const ALLOWED_TYPE_SET = new Set<string>(ALLOWED_TYPES)
const DELETE_ONLY_TYPES: string[] = []
const HOLE_TYPES = ['slab', 'ceiling']
const ACTION_MENU_TRANSPARENT_METADATA_KEY = 'actionMenuTransparent'
const MANAGED_TRANSPARENCY_STATE_KEY = '__actionMenuTransparencyState'
const TRANSPARENT_OPACITY = 0.22
const transparentOpacityNode = float(TRANSPARENT_OPACITY)
const CHARACTER_ROAM_EVENT = 'editor:character-roam-request'
const CHARACTER_MENU_EVENT = 'editor:character-menu-request'
const CHARACTER_COMMAND_EVENT = 'editor:character-command'
const FIRST_PERSON_JUMP_TO_POSE_EVENT = 'editor:first-person-jump-pose'
const FIRST_PERSON_END_EVENT = 'editor:first-person-ended'

const CHARACTER_MOTION_ACTIONS: Array<{ label: string; motion: CharacterMotion }> = [
  { motion: 'idle', label: '站立' },
  { motion: 'walk', label: '走' },
  { motion: 'run', label: '跑' },
  { motion: 'jump', label: '跳' },
  { motion: 'sit', label: '坐' },
  { motion: 'crouch', label: '蹲' },
  { motion: 'lie', label: '躺' },
  { motion: 'chat', label: '闲聊' },
  { motion: 'swim', label: '游泳' },
  { motion: 'drown', label: '挣扎求救' },
  { motion: 'dead', label: '漂浮' },
]

type ManagedTransparencyState = {
  original: THREE.Material | THREE.Material[]
  transparent: THREE.Material | THREE.Material[]
}

type ActionMenuAnchor = [number, number, number]

type CharacterMenuState = {
  anchor: [number, number, number]
  eyeHeight: number
  id: string
  motion?: CharacterMotion
  name?: string
  position: [number, number, number]
  roam?: boolean
  yaw: number
}

type ManagedMesh = THREE.Mesh & {
  userData: THREE.Mesh['userData'] & {
    [MANAGED_TRANSPARENCY_STATE_KEY]?: ManagedTransparencyState
  }
}

function preventNativeContextMenu(event: NodeEvent) {
  event.nativeEvent.nativeEvent?.preventDefault()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function detailIsCharacterRoamEvent(value: unknown): value is {
  anchor?: [number, number, number]
  eyeHeight: number
  id?: string
  motion?: unknown
  name?: string
  position: [number, number, number]
  roam?: unknown
  yaw: number
} {
  if (!isRecord(value)) return false
  const position = value.position
  return (
    Array.isArray(position) &&
    position.length >= 3 &&
    position.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) &&
    typeof value.yaw === 'number' &&
    Number.isFinite(value.yaw) &&
    typeof value.eyeHeight === 'number' &&
    Number.isFinite(value.eyeHeight)
  )
}

function detailIsCharacterMenuEvent(value: unknown): value is CharacterMenuState {
  if (!detailIsCharacterRoamEvent(value)) return false
  if (typeof value.id !== 'string') return false
  if (
    value.motion !== undefined &&
    !CHARACTER_MOTION_ACTIONS.some((action) => action.motion === value.motion)
  ) {
    return false
  }
  if (value.roam !== undefined && typeof value.roam !== 'boolean') return false
  const anchor = value.anchor
  return (
    Array.isArray(anchor) &&
    anchor.length >= 3 &&
    anchor.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function isNodeTransparentFromActionMenu(node: AnyNode | null | undefined): boolean {
  return isRecord(node?.metadata) && node.metadata[ACTION_MENU_TRANSPARENT_METADATA_KEY] === true
}

function getActionMenuTransparencyMetadata(node: AnyNode, enabled: boolean) {
  const metadata = isRecord(node.metadata) ? { ...node.metadata } : {}

  if (enabled) {
    metadata[ACTION_MENU_TRANSPARENT_METADATA_KEY] = true
  } else {
    delete metadata[ACTION_MENU_TRANSPARENT_METADATA_KEY]
  }

  return metadata
}

function cloneTransparentMaterial(material: THREE.Material): THREE.Material {
  const clone = material.clone()
  clone.transparent = true
  clone.opacity = Math.min(material.opacity ?? 1, TRANSPARENT_OPACITY)
  if ('opacityNode' in clone) {
    clone.opacityNode = transparentOpacityNode
  }
  clone.depthWrite = false
  clone.side = THREE.DoubleSide
  clone.needsUpdate = true
  return clone
}

function cloneTransparentMaterialInput(
  material: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  return Array.isArray(material)
    ? material.map((entry) => cloneTransparentMaterial(entry))
    : cloneTransparentMaterial(material)
}

function disposeMaterialInput(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => {
      entry.dispose()
    })
    return
  }

  material.dispose()
}

function hasMeshMaterial(object: THREE.Object3D): object is ManagedMesh {
  return Boolean((object as THREE.Mesh).isMesh && (object as THREE.Mesh).material)
}

function applyManagedTransparency(mesh: ManagedMesh) {
  const state = mesh.userData[MANAGED_TRANSPARENCY_STATE_KEY]

  if (state && mesh.material === state.transparent) {
    return
  }

  if (state) {
    disposeMaterialInput(state.transparent)
  }

  const original = mesh.material
  const transparent = cloneTransparentMaterialInput(original)
  mesh.userData[MANAGED_TRANSPARENCY_STATE_KEY] = { original, transparent }
  mesh.material = transparent
}

function restoreManagedTransparency(mesh: ManagedMesh) {
  const state = mesh.userData[MANAGED_TRANSPARENCY_STATE_KEY]
  if (!state) return

  if (mesh.material === state.transparent) {
    mesh.material = state.original
  }

  disposeMaterialInput(state.transparent)
  delete mesh.userData[MANAGED_TRANSPARENCY_STATE_KEY]
}

function objectHasManagedTransparency(object: THREE.Object3D): boolean {
  let found = false
  object.traverse((child) => {
    if (!found && hasMeshMaterial(child) && child.userData[MANAGED_TRANSPARENCY_STATE_KEY]) {
      found = true
    }
  })
  return found
}

function setObjectManagedTransparency(object: THREE.Object3D, enabled: boolean) {
  object.traverse((child) => {
    if (!hasMeshMaterial(child)) return
    if (enabled) {
      applyManagedTransparency(child)
    } else {
      restoreManagedTransparency(child)
    }
  })
}

function setObjectVisibleNow(nodeId: string, visible: boolean) {
  const object = sceneRegistry.nodes.get(nodeId)
  if (object) {
    object.visible = visible
  }
}

function resolveActionMenuNode(node: AnyNode): AnyNode | null {
  if (node.type === 'roof-segment' && node.parentId) {
    const parentNode = useScene.getState().nodes[node.parentId as AnyNodeId]
    return parentNode?.type === 'roof' ? parentNode : node
  }

  if (node.type === 'stair-segment' && node.parentId) {
    const parentNode = useScene.getState().nodes[node.parentId as AnyNodeId]
    return parentNode?.type === 'stair' ? parentNode : node
  }

  return ALLOWED_TYPE_SET.has(node.type) ? node : null
}

function isPersonItemNode(node: AnyNode | null | undefined): node is ItemNode {
  if (node?.type !== 'item') return false

  const assetId = node.asset.id.toLowerCase()
  const category = node.asset.category.toLowerCase()
  const tags = node.asset.tags?.map((tag) => tag.toLowerCase()) ?? []

  return (
    assetId.startsWith('person-') ||
    category === 'people' ||
    tags.includes('person') ||
    tags.includes('people') ||
    tags.includes('human')
  )
}

function getFirstPersonPresetForPerson(node: ItemNode): 'adult' | 'child' {
  return node.asset.id.toLowerCase().includes('child') ? 'child' : 'adult'
}

export function FloatingActionMenu() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const updateNode = useScene((s) => s.updateNode)
  const mode = useEditor((s) => s.mode)
  const isFloorplanHovered = useEditor((s) => s.isFloorplanHovered)
  const movingWallEndpoint = useEditor((s) => s.movingWallEndpoint)
  const setMovingNode = useEditor((s) => s.setMovingNode)
  const setMovingWallEndpoint = useEditor((s) => s.setMovingWallEndpoint)
  const setCurvingWall = useEditor((s) => s.setCurvingWall)
  const setSelection = useViewer((s) => s.setSelection)
  const setEditingHole = useEditor((s) => s.setEditingHole)
  const camera = useThree((state) => state.camera)
  const canUndo = useStore(useScene.temporal, (state) => state.pastStates.length > 0)
  const canRedo = useStore(useScene.temporal, (state) => state.futureStates.length > 0)
  const canShowAll = useScene((state) =>
    Object.values(state.nodes).some((entry) => entry.visible === false),
  )

  const groupRef = useRef<THREE.Group>(null)
  const startEndpointGroupRef = useRef<THREE.Group>(null)
  const endEndpointGroupRef = useRef<THREE.Group>(null)
  const characterMenuOpenedAtRef = useRef(0)
  const [altPressed, setAltPressed] = useState(false)
  const [actionMenuNodeId, setActionMenuNodeId] = useState<AnyNodeId | null>(null)
  const [actionMenuAnchor, setActionMenuAnchor] = useState<ActionMenuAnchor | null>(null)
  const [characterMenu, setCharacterMenu] = useState<CharacterMenuState | null>(null)
  const transparentNodeIdKey = useScene((s) =>
    Object.values(s.nodes)
      .filter((sceneNode) => ALLOWED_TYPE_SET.has(sceneNode.type))
      .filter(isNodeTransparentFromActionMenu)
      .map((sceneNode) => sceneNode.id)
      .sort()
      .join('\n'),
  )
  const transparentNodeIds = useMemo(
    () => new Set(transparentNodeIdKey ? transparentNodeIdKey.split('\n') : []),
    [transparentNodeIdKey],
  )

  // Only show for single selection of specific types
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null

  // Subscribe just to the selected node so unrelated scene updates do not
  // re-render this menu.
  const node = useScene((s) => (selectedId ? (s.nodes[selectedId as AnyNodeId] ?? null) : null))
  const isValidType = node ? ALLOWED_TYPE_SET.has(node.type) : false
  const isTransparent = isNodeTransparentFromActionMenu(node)
  const canRenderSelectionOverlays =
    Boolean(selectedId && node && isValidType && !isFloorplanHovered && mode !== 'delete') &&
    !movingWallEndpoint
  const shouldShowActionMenu = canRenderSelectionOverlays && actionMenuNodeId === selectedId

  const enterCharacterRoam = useCallback(
    (detail: { eyeHeight: number; position: [number, number, number]; yaw: number }) => {
      const jumpToCharacterPose = () => {
        window.dispatchEvent(
          new CustomEvent(FIRST_PERSON_JUMP_TO_POSE_EVENT, {
            detail: {
              x: detail.position[0],
              y: detail.position[1] + detail.eyeHeight,
              z: detail.position[2],
              yaw: detail.yaw,
              pitch: 0,
              mode: 'walk',
              eyeHeight: detail.eyeHeight,
              arrivalMode: 'instant',
            },
          }),
        )
      }

      camera.position.set(
        detail.position[0],
        detail.position[1] + detail.eyeHeight,
        detail.position[2],
      )
      camera.quaternion.setFromEuler(new THREE.Euler(0, detail.yaw, 0, 'YXZ'))
      useEditor
        .getState()
        .setFirstPersonEyeHeightPreset(detail.eyeHeight < 1.4 ? 'child' : 'adult')
      useEditor.getState().setFirstPersonMode(true)
      requestAnimationFrame(jumpToCharacterPose)
      window.setTimeout(jumpToCharacterPose, 60)
      window.setTimeout(jumpToCharacterPose, 180)
      setActionMenuNodeId(null)
      setActionMenuAnchor(null)
      setCharacterMenu(null)
    },
    [camera],
  )

  useEffect(() => {
    const handleCharacterRoam = (event: Event) => {
      const detail =
        event instanceof CustomEvent && detailIsCharacterRoamEvent(event.detail)
          ? event.detail
          : null
      if (!detail) return

      enterCharacterRoam(detail)
    }

    window.addEventListener(CHARACTER_ROAM_EVENT, handleCharacterRoam)
    return () => window.removeEventListener(CHARACTER_ROAM_EVENT, handleCharacterRoam)
  }, [enterCharacterRoam])

  useEffect(() => {
    const handleCharacterMenu = (event: Event) => {
      const detail =
        event instanceof CustomEvent && detailIsCharacterMenuEvent(event.detail)
          ? event.detail
          : null
      if (!detail) return

      characterMenuOpenedAtRef.current = performance.now()
      setActionMenuNodeId(null)
      setActionMenuAnchor(null)
      setSelection({ selectedIds: [] })
      setCharacterMenu(detail)
    }

    window.addEventListener(CHARACTER_MENU_EVENT, handleCharacterMenu)
    return () => window.removeEventListener(CHARACTER_MENU_EVENT, handleCharacterMenu)
  }, [])

  // Boolean selector, only re-renders when curving availability actually flips.
  const canCurveSelectedWall = useScene((s) => {
    if (!selectedId) return false
    const selectedNode = s.nodes[selectedId as AnyNodeId]
    if (selectedNode?.type !== 'wall') return false
    return !(selectedNode.children ?? []).some((childId) => {
      const child = s.nodes[childId as AnyNodeId]
      if (!child) return false
      if (child.type === 'door' || child.type === 'window') return true
      if (child.type === 'item') {
        const attachTo = child.asset?.attachTo
        return attachTo === 'wall' || attachTo === 'wall-side'
      }
      return false
    })
  })

  useEffect(() => {
    const handleContextMenu = (event: NodeEvent) => {
      if (useViewer.getState().cameraDragging) return
      if (useEditor.getState().mode === 'delete') return
      if (performance.now() - characterMenuOpenedAtRef.current < 350) {
        event.stopPropagation()
        preventNativeContextMenu(event)
        return
      }

      const actionNode = resolveActionMenuNode(event.node)
      if (!actionNode) return

      event.stopPropagation()
      preventNativeContextMenu(event)
      useViewer.getState().setSelection({ selectedIds: [actionNode.id] })
      setActionMenuNodeId(actionNode.id as AnyNodeId)
      setActionMenuAnchor(event.position)
    }

    ALLOWED_TYPES.forEach((type) => {
      emitter.on(`${type}:context-menu` as any, handleContextMenu as any)
    })

    return () => {
      ALLOWED_TYPES.forEach((type) => {
        emitter.off(`${type}:context-menu` as any, handleContextMenu as any)
      })
    }
  }, [])

  useEffect(() => {
    const closeActionMenu = () => {
      setActionMenuNodeId(null)
      setActionMenuAnchor(null)
      setCharacterMenu(null)
    }

    ALLOWED_TYPES.forEach((type) => {
      emitter.on(`${type}:click` as any, closeActionMenu as any)
    })
    emitter.on('grid:click', closeActionMenu)

    return () => {
      ALLOWED_TYPES.forEach((type) => {
        emitter.off(`${type}:click` as any, closeActionMenu as any)
      })
      emitter.off('grid:click', closeActionMenu)
    }
  }, [])

  const dispatchCharacterCommand = useCallback(
    (
      command: 'delete' | 'duplicate' | 'roam' | 'select' | 'set-all-roam' | 'set-motion' | 'set-roam',
      options?: { motion?: CharacterMotion; roam?: boolean },
    ) => {
      if (!characterMenu) return
      window.dispatchEvent(
        new CustomEvent(CHARACTER_COMMAND_EVENT, {
          detail: { command, id: characterMenu.id, motion: options?.motion, roam: options?.roam },
        }),
      )
      setCharacterMenu(null)
    },
    [characterMenu],
  )

  const handleCharacterRoam = useCallback(() => {
    if (!characterMenu) return
    dispatchCharacterCommand('roam')
  }, [characterMenu, dispatchCharacterCommand])

  useEffect(() => {
    if (actionMenuNodeId && (!selectedId || actionMenuNodeId !== selectedId)) {
      setActionMenuNodeId(null)
      setActionMenuAnchor(null)
    }
  }, [actionMenuNodeId, selectedId])

  useEffect(() => {
    if (actionMenuNodeId && !canRenderSelectionOverlays) {
      setActionMenuNodeId(null)
      setActionMenuAnchor(null)
    }
  }, [actionMenuNodeId, canRenderSelectionOverlays])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        setAltPressed(true)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        setAltPressed(false)
      }
    }

    const handleBlur = () => {
      setAltPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  useFrame(() => {
    sceneRegistry.nodes.forEach((object, nodeId) => {
      const enabled = transparentNodeIds.has(nodeId)
      if (enabled || objectHasManagedTransparency(object)) {
        setObjectManagedTransparency(object, enabled)
      }
    })
  })

  useFrame(() => {
    if (!(shouldShowActionMenu && selectedId && groupRef.current)) return

    const obj = sceneRegistry.nodes.get(selectedId)
    if (obj) {
      if (actionMenuAnchor) {
        groupRef.current.position.set(actionMenuAnchor[0], actionMenuAnchor[1], actionMenuAnchor[2])
      } else {
        // Fallback for any legacy path that opens the menu without a pointer hit.
        const box = new THREE.Box3().setFromObject(obj)
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3())
          const isStructural = node && [...DELETE_ONLY_TYPES, ...HOLE_TYPES].includes(node.type)
          const yOffset = isStructural ? 0.8 : 0.3
          groupRef.current.position.set(center.x, box.max.y + yOffset, center.z)
        }
      }

      if (node?.type === 'wall') {
        const wall = node as WallNode
        const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
        const endpointYOffset = 0.35
        const startWorld = obj.localToWorld(new THREE.Vector3(0, 0, 0))
        const endWorld = obj.localToWorld(new THREE.Vector3(wallLength, 0, 0))

        if (startEndpointGroupRef.current) {
          startEndpointGroupRef.current.position.set(
            startWorld.x,
            startWorld.y + endpointYOffset,
            startWorld.z,
          )
        }
        if (endEndpointGroupRef.current) {
          endEndpointGroupRef.current.position.set(
            endWorld.x,
            endWorld.y + endpointYOffset,
            endWorld.z,
          )
        }
      }
    }
  })

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!node) return
      sfxEmitter.emit('sfx:item-pick')
      if (
        node.type === 'item' ||
        node.type === 'window' ||
        node.type === 'door' ||
        node.type === 'wall' ||
        node.type === 'fence' ||
        node.type === 'slab' ||
        node.type === 'ceiling' ||
        node.type === 'roof' ||
        node.type === 'roof-segment' ||
        node.type === 'stair' ||
        node.type === 'stair-segment'
      ) {
        setMovingNode(node as any)
      }
      setSelection({ selectedIds: [] })
    },
    [node, setMovingNode, setSelection],
  )
  const handleRoamFromPerson = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!isPersonItemNode(node)) return

      const object = sceneRegistry.nodes.get(node.id)
      const worldPosition = object
        ? object.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(node.position[0], node.position[1], node.position[2])
      const yaw = node.rotation[1] ?? 0

      camera.position.set(worldPosition.x, worldPosition.y + 1.65, worldPosition.z)
      camera.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'))

      useEditor.getState().setFirstPersonEyeHeightPreset(getFirstPersonPresetForPerson(node))
      useEditor.getState().setFirstPersonMode(true)
      setObjectVisibleNow(node.id, false)

      const restorePersonVisibility = () => {
        setObjectVisibleNow(node.id, node.visible !== false)
        window.removeEventListener(FIRST_PERSON_END_EVENT, restorePersonVisibility)
      }
      window.addEventListener(FIRST_PERSON_END_EVENT, restorePersonVisibility)
      setActionMenuNodeId(null)
      setActionMenuAnchor(null)
    },
    [camera, node],
  )
  const handleHide = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!selectedId) return
      updateNode(selectedId as AnyNodeId, { visible: false })
      setObjectVisibleNow(selectedId, false)
      setActionMenuNodeId(null)
      setActionMenuAnchor(null)
      setSelection({ selectedIds: [] })
    },
    [selectedId, setSelection, updateNode],
  )
  const handleShowAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const hiddenNodes = Object.values(useScene.getState().nodes).filter(
      (entry) => entry.visible === false,
    )
    if (hiddenNodes.length > 0) {
      useScene.getState().updateNodes(
        hiddenNodes.map((entry) => ({
          id: entry.id,
          data: { visible: true },
        })),
      )
      hiddenNodes.forEach((entry) => {
        setObjectVisibleNow(entry.id, true)
      })
    }
    setActionMenuNodeId(null)
    setActionMenuAnchor(null)
  }, [])
  const handleUndo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setActionMenuNodeId(null)
    setActionMenuAnchor(null)
    useScene.temporal.getState().undo()
  }, [])
  const handleRedo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setActionMenuNodeId(null)
    setActionMenuAnchor(null)
    useScene.temporal.getState().redo()
  }, [])
  const handleToggleTransparency = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!(node && selectedId)) return
      sfxEmitter.emit('sfx:item-pick')
      updateNode(
        selectedId as AnyNodeId,
        {
          metadata: getActionMenuTransparencyMetadata(node, !isNodeTransparentFromActionMenu(node)),
        } as Partial<AnyNode>,
      )
    },
    [node, selectedId, updateNode],
  )
  const handleCurve = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!canCurveSelectedWall || !node || node.type !== 'wall') return
      sfxEmitter.emit('sfx:item-pick')
      setCurvingWall(node)
      setSelection({ selectedIds: [] })
    },
    [canCurveSelectedWall, node, setCurvingWall, setSelection],
  )
  const handleEndpointMove = useCallback(
    (endpoint: 'start' | 'end', e: React.MouseEvent) => {
      e.stopPropagation()
      if (!(node && node.type === 'wall')) return
      sfxEmitter.emit('sfx:item-pick')
      setMovingWallEndpoint({ wall: node, endpoint })
      setSelection({ selectedIds: [] })
    },
    [node, setMovingWallEndpoint, setSelection],
  )

  const handleDuplicate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!node?.parentId) return
      sfxEmitter.emit('sfx:item-pick')
      useScene.temporal.getState().pause()

      let duplicateInfo = structuredClone(node) as any
      delete duplicateInfo.id
      duplicateInfo.metadata = { ...duplicateInfo.metadata, isNew: true }

      let duplicate: AnyNode | null = null
      try {
        if (node.type === 'door') {
          duplicate = DoorNode.parse(duplicateInfo)
        } else if (node.type === 'window') {
          duplicate = WindowNode.parse(duplicateInfo)
        } else if (node.type === 'item') {
          duplicate = ItemNode.parse(duplicateInfo)
        } else if (node.type === 'wall') {
          duplicate = WallNode.parse(duplicateInfo)
        } else if (node.type === 'fence') {
          duplicate = FenceNode.parse(duplicateInfo)
          duplicate.start = [duplicate.start[0] + 1, duplicate.start[1] + 1]
          duplicate.end = [duplicate.end[0] + 1, duplicate.end[1] + 1]
        } else if (node.type === 'roof') {
          duplicateInfo.children = []
          duplicate = RoofNode.parse(duplicateInfo)
        } else if (node.type === 'roof-segment') {
          duplicate = RoofSegmentNode.parse(duplicateInfo)
        } else if (node.type === 'stair') {
          duplicateInfo.children = []
          duplicateInfo.metadata = { ...duplicateInfo.metadata }
          delete duplicateInfo.metadata?.isNew
          duplicate = StairNode.parse(duplicateInfo)
        } else if (node.type === 'stair-segment') {
          duplicate = StairSegmentNode.parse(duplicateInfo)
        }
      } catch (error) {
        console.error('Failed to parse duplicate', error)
        useScene.temporal.getState().resume()
        return
      }

      if (!duplicate) {
        useScene.temporal.getState().resume()
        return
      }

      if (duplicate) {
        if (duplicate.type === 'door' || duplicate.type === 'window') {
          useScene.getState().createNode(duplicate, duplicate.parentId as AnyNodeId)
        } else if (duplicate.type === 'wall') {
          useScene.getState().createNode(duplicate, duplicate.parentId as AnyNodeId)
        } else if (duplicate.type === 'fence') {
          useScene.getState().createNode(duplicate, duplicate.parentId as AnyNodeId)
        } else if (
          duplicate.type === 'roof' ||
          duplicate.type === 'roof-segment' ||
          duplicate.type === 'stair' ||
          duplicate.type === 'stair-segment'
        ) {
          // Add small offset to make it visible
          if ('position' in duplicate) {
            duplicate.position = [
              duplicate.position[0] + 1,
              duplicate.position[1],
              duplicate.position[2] + 1,
            ]
          }
          if (node.type === 'stair' && duplicate.type === 'stair') {
            const nodesState = useScene.getState().nodes
            const createOps: { node: AnyNode; parentId?: AnyNodeId }[] = [
              { node: duplicate, parentId: duplicate.parentId as AnyNodeId },
            ]

            for (const childId of node.children ?? []) {
              const childNode = nodesState[childId]
              if (childNode?.type !== 'stair-segment') {
                continue
              }

              let childDuplicateInfo = structuredClone(childNode) as any
              delete childDuplicateInfo.id
              childDuplicateInfo.metadata = { ...childDuplicateInfo.metadata }
              delete childDuplicateInfo.metadata?.isNew

              try {
                const childDuplicate = StairSegmentNode.parse(childDuplicateInfo)
                createOps.push({ node: childDuplicate, parentId: duplicate.id as AnyNodeId })
              } catch (e) {
                console.error('Failed to duplicate stair segment', e)
              }
            }

            useScene.getState().createNodes(createOps)
          } else {
            useScene.getState().createNode(duplicate, duplicate.parentId as AnyNodeId)
          }

          // Duplicate children for roof nodes
          if (node.type === 'roof' && node.children) {
            const nodesState = useScene.getState().nodes
            for (const childId of node.children) {
              const childNode = nodesState[childId]
              if (childNode && childNode.type === 'roof-segment') {
                let childDuplicateInfo = structuredClone(childNode) as any
                delete childDuplicateInfo.id
                childDuplicateInfo.metadata = { ...childDuplicateInfo.metadata, isNew: true }
                try {
                  const childDuplicate = RoofSegmentNode.parse(childDuplicateInfo)
                  useScene.getState().createNode(childDuplicate, duplicate.id as AnyNodeId)
                } catch (e) {
                  console.error('Failed to duplicate roof segment', e)
                }
              }
            }
          }

          // Duplicate children for stair nodes
        }
        if (
          duplicate.type === 'item' ||
          duplicate.type === 'wall' ||
          duplicate.type === 'fence' ||
          duplicate.type === 'window' ||
          duplicate.type === 'door' ||
          duplicate.type === 'roof' ||
          duplicate.type === 'roof-segment' ||
          duplicate.type === 'stair-segment'
        ) {
          setMovingNode(duplicate as any)
        } else if (duplicate.type === 'stair') {
          setSelection({ selectedIds: [duplicate.id as AnyNodeId] })
        }
        if (duplicate.type !== 'stair') {
          setSelection({ selectedIds: [] })
        }
      }
    },
    [node, setMovingNode, setSelection],
  )

  const handleAddHole = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!(node && selectedId && (node.type === 'slab' || node.type === 'ceiling'))) return

      const polygon = (node as SlabNode | CeilingNode).polygon
      let cx = 0
      let cz = 0
      for (const [x, z] of polygon) {
        cx += x
        cz += z
      }
      cx /= polygon.length
      cz /= polygon.length

      const holeSize = 0.5
      const newHole: Array<[number, number]> = [
        [cx - holeSize, cz - holeSize],
        [cx + holeSize, cz - holeSize],
        [cx + holeSize, cz + holeSize],
        [cx - holeSize, cz + holeSize],
      ]
      const surfaceNode = node as SlabNode | CeilingNode
      const currentHoles = surfaceNode.holes || []
      const currentMetadata = currentHoles.map(
        (_, index) => surfaceNode.holeMetadata?.[index] ?? { source: 'manual' as const },
      )
      updateNode(selectedId as AnyNodeId, {
        holes: [...currentHoles, newHole],
        holeMetadata: [...currentMetadata, { source: 'manual' }],
      })
      setEditingHole({ nodeId: selectedId, holeIndex: currentHoles.length })
      // Re-assert selection so the node stays selected
      setSelection({ selectedIds: [selectedId] })
    },
    [node, selectedId, updateNode, setEditingHole, setSelection],
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!selectedId) return
      const scene = useScene.getState()
      const sketchDimensions = Object.values(scene.nodes).filter(
        (candidate): candidate is AnyNode & { type: 'sketch-dimension' } =>
          candidate.type === 'sketch-dimension',
      )
      const dependentSketchDimensionIds = collectSketchDistanceDimensionIdsReferencingEntities({
        dimensions: sketchDimensions,
        deletedLineIds: node?.type === 'sketch-line' ? [node.id] : undefined,
        deletedCircleIds: node?.type === 'sketch-circle' ? [node.id] : undefined,
      })
      if (node?.type === 'item') {
        sfxEmitter.emit('sfx:item-delete')
      } else {
        sfxEmitter.emit('sfx:structure-delete')
      }
      setActionMenuNodeId(null)
      setActionMenuAnchor(null)
      setSelection({ selectedIds: [] })
      for (const dimensionId of dependentSketchDimensionIds) {
        scene.deleteNode(dimensionId as AnyNodeId)
      }
      scene.deleteNode(selectedId as AnyNodeId)
    },
    [node?.type, selectedId, setSelection],
  )

  if (!(canRenderSelectionOverlays || characterMenu)) return null

  return (
    <group>
      {characterMenu && (
        <group position={characterMenu.anchor}>
          <Html
            style={{
              pointerEvents: 'auto',
              touchAction: 'none',
            }}
            zIndexRange={[100, 0]}
          >
            <NodeActionMenu
              extraActions={[
                {
                  id: 'character-roam',
                  label: '从此人视角漫游',
                  icon: <Navigation className="h-4 w-4" />,
                  onClick: handleCharacterRoam,
                },
                {
                  id: 'character-select-move',
                  label: '移动人物',
                  icon: <MousePointer2 className="h-4 w-4" />,
                  onClick: () => dispatchCharacterCommand('select'),
                },
                {
                  id: 'character-motion',
                  label: `动作：${
                    CHARACTER_MOTION_ACTIONS.find((action) => action.motion === characterMenu.motion)?.label ??
                    '站立'
                  }`,
                  icon: <Activity className="h-4 w-4" />,
                  children: CHARACTER_MOTION_ACTIONS.map((action) => ({
                    id: `character-motion-${action.motion}`,
                    label: action.label,
                    icon: <Activity className="h-4 w-4" />,
                    active: characterMenu.motion === action.motion,
                    onClick: () => dispatchCharacterCommand('set-motion', { motion: action.motion }),
                  })),
                },
                {
                  id: 'character-toggle-roam',
                  label: characterMenu.roam ? '停止随意走动' : '随意走动',
                  icon: <Footprints className="h-4 w-4" />,
                  active: characterMenu.roam === true,
                  onClick: () => dispatchCharacterCommand('set-roam', { roam: !characterMenu.roam }),
                },
                ...[
                  {
                    id: 'character-all-roam',
                    label: '全部随意走动',
                    icon: <UsersRound className="h-4 w-4" />,
                    onClick: () => dispatchCharacterCommand('set-all-roam', { roam: true }),
                  },
                  {
                    id: 'character-all-stop-roam',
                    label: '全部停止走动',
                    icon: <UsersRound className="h-4 w-4" />,
                    onClick: () => dispatchCharacterCommand('set-all-roam', { roam: false }),
                  },
                ].map((action) => ({
                  ...action,
                })),
                {
                  id: 'character-duplicate',
                  label: '复制人物',
                  icon: <Copy className="h-4 w-4" />,
                  onClick: () => dispatchCharacterCommand('duplicate'),
                },
                {
                  id: 'character-delete',
                  label: '删除人物',
                  icon: <Trash2 className="h-4 w-4" />,
                  onClick: () => dispatchCharacterCommand('delete'),
                },
              ]}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            />
          </Html>
        </group>
      )}
      {shouldShowActionMenu && (
        <group ref={groupRef}>
          <Html
            style={{
              pointerEvents: 'auto',
              touchAction: 'none',
            }}
            zIndexRange={[100, 0]}
          >
            <NodeActionMenu
              canRedo={canRedo}
              canShowAll={canShowAll}
              canUndo={canUndo}
              isTransparent={isTransparent}
              onAddHole={node && HOLE_TYPES.includes(node.type) ? handleAddHole : undefined}
              onCurve={canCurveSelectedWall ? handleCurve : undefined}
              onDelete={handleDelete}
              onDuplicate={
                node && !DELETE_ONLY_TYPES.includes(node.type) && !HOLE_TYPES.includes(node.type)
                  ? handleDuplicate
                  : undefined
              }
              extraActions={
                isPersonItemNode(node)
                  ? [
                      {
                        id: 'roam-from-person',
                        label: 'Roam',
                        icon: <Navigation className="h-4 w-4" />,
                        onClick: handleRoamFromPerson,
                      },
                    ]
                  : undefined
              }
              onHide={handleHide}
              onMove={node && !DELETE_ONLY_TYPES.includes(node.type) ? handleMove : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onRedo={handleRedo}
              onShowAll={handleShowAll}
              onToggleTransparency={handleToggleTransparency}
              onUndo={handleUndo}
            />
          </Html>
        </group>
      )}
      {node?.type === 'item' && <SelectionTransformGizmo node={node as ItemNode} />}
      {shouldShowActionMenu && node?.type === 'wall' && (
        <>
          <group ref={startEndpointGroupRef}>
            <Html
              center
              style={{ pointerEvents: 'auto', touchAction: 'none' }}
              zIndexRange={[100, 0]}
            >
              <button
                aria-label="Move wall start"
                className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border bg-background/95 shadow-lg backdrop-blur-md transition-colors ${
                  altPressed
                    ? 'border-amber-500/80 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20 hover:text-white'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                onClick={(e) => handleEndpointMove('start', e)}
                onPointerDown={(e) => e.stopPropagation()}
                title="Move wall start (Alt to detach)"
                type="button"
              >
                <Move className="h-4 w-4" />
              </button>
            </Html>
          </group>
          <group ref={endEndpointGroupRef}>
            <Html
              center
              style={{ pointerEvents: 'auto', touchAction: 'none' }}
              zIndexRange={[100, 0]}
            >
              <button
                aria-label="Move wall end"
                className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border bg-background/95 shadow-lg backdrop-blur-md transition-colors ${
                  altPressed
                    ? 'border-amber-500/80 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20 hover:text-white'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                onClick={(e) => handleEndpointMove('end', e)}
                onPointerDown={(e) => e.stopPropagation()}
                title="Move wall end (Alt to detach)"
                type="button"
              >
                <Move className="h-4 w-4" />
              </button>
            </Html>
          </group>
        </>
      )}
    </group>
  )
}
