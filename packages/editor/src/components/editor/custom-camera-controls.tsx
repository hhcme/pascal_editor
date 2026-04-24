'use client'

import { type CameraControlEvent, emitter, sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer, ZONE_LAYER } from '@pascal-app/viewer'
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Box3, type Object3D, Raycaster, Vector2, Vector3 } from 'three'
import { EDITOR_LAYER } from '../../lib/constants'
import useEditor from '../../store/use-editor'

const currentTarget = new Vector3()
const tempBox = new Box3()
const tempSceneBounds = new Box3()
const tempSceneObjectBox = new Box3()
const tempCenter = new Vector3()
const tempDelta = new Vector3()
const tempOrbitCenter = new Vector3()
const tempPosition = new Vector3()
const tempSize = new Vector3()
const tempTarget = new Vector3()
const DEFAULT_MAX_POLAR_ANGLE = Math.PI / 2 - 0.1
const DEBUG_MAX_POLAR_ANGLE = Math.PI - 0.05
const SIDE_VIEW_POLAR_ANGLE = Math.PI / 2 - 0.12
const LEFT_CAMERA_DRAG_THRESHOLD_PX = 4
const TRI_VIEW_INTERACTIVE_AREA = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }
const FULL_INTERACTIVE_AREA = { x: 0, y: 0, width: 1, height: 1 }

const EDITOR_INTERACTION_NODE_TYPES = [
  'site',
  'building',
  'level',
  'zone',
  'wall',
  'fence',
  'item',
  'slab',
  'ceiling',
  'roof',
  'roof-segment',
  'sketch-circle',
  'sketch-line',
  'stair',
  'stair-segment',
  'window',
  'door',
] as const

type LeftMouseAction =
  | typeof CameraControlsImpl.ACTION.ROTATE
  | typeof CameraControlsImpl.ACTION.SCREEN_PAN
  | typeof CameraControlsImpl.ACTION.NONE

type LeftButtonGesture = {
  pointerId: number
  startX: number
  startY: number
  startedOnEditableNode: boolean
  mode: 'pending-camera' | 'camera' | 'blocked'
}

type CameraViewDirection = 'front' | 'left' | 'right' | 'back' | 'top' | 'bottom'

type CameraViewDirectionPayload = {
  direction: CameraViewDirection
}

const viewDirectionEmitter = emitter as unknown as {
  on: (
    type: 'camera-controls:view-direction',
    handler: (event: CameraViewDirectionPayload) => void,
  ) => void
  off: (
    type: 'camera-controls:view-direction',
    handler: (event: CameraViewDirectionPayload) => void,
  ) => void
}

const VIEW_DIRECTION_AZIMUTHS: Partial<Record<CameraViewDirection, number>> = {
  front: 0,
  right: Math.PI / 2,
  back: Math.PI,
  left: -Math.PI / 2,
}

function isVisibleInHierarchy(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function isTransformControlsObject(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    const candidate = current as Object3D & {
      isTransformControls?: boolean
      isTransformControlsGizmo?: boolean
    }
    if (
      candidate.isTransformControls ||
      candidate.isTransformControlsGizmo ||
      current.type === 'TransformControlsGizmo'
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function hasActiveEditorPointerInteraction() {
  const editor = useEditor.getState()

  return (
    editor.mode !== 'select' ||
    editor.floorplanSelectionTool === 'marquee' ||
    Boolean(
      editor.tool ||
        editor.movingNode ||
        editor.movingWallEndpoint ||
        editor.curvingWall ||
        editor.editingHole,
    )
  )
}

function getEditorOrbitCenter(out: Vector3) {
  tempSceneBounds.makeEmpty()

  const scene = useScene.getState()
  let hasRootBounds = false

  for (const nodeId of scene.rootNodeIds) {
    const object = sceneRegistry.nodes.get(String(nodeId))
    if (!object || !isVisibleInHierarchy(object)) continue

    tempSceneObjectBox.setFromObject(object)
    if (tempSceneObjectBox.isEmpty()) continue

    tempSceneBounds.union(tempSceneObjectBox)
    hasRootBounds = true
  }

  if (!hasRootBounds) {
    for (const object of sceneRegistry.nodes.values()) {
      if (!isVisibleInHierarchy(object)) continue

      tempSceneObjectBox.setFromObject(object)
      if (!tempSceneObjectBox.isEmpty()) {
        tempSceneBounds.union(tempSceneObjectBox)
      }
    }
  }

  if (tempSceneBounds.isEmpty()) return false

  tempSceneBounds.getCenter(out)
  return [out.x, out.y, out.z].every(Number.isFinite)
}

export const CustomCameraControls = () => {
  const controls = useRef<CameraControlsImpl>(null!)
  const pointer = useRef(new Vector2())
  const interactionRaycaster = useRef(new Raycaster())
  const leftButtonGesture = useRef<LeftButtonGesture | null>(null)
  const spacePressed = useRef(false)
  const cameraDragResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPreviewMode = useEditor((s) => s.isPreviewMode)
  const walkthroughMode = useViewer((s) => s.walkthroughMode)
  const allowUndergroundCamera = useEditor((s) => s.allowUndergroundCamera)
  const selection = useViewer((s) => s.selection)
  const currentLevelId = selection.levelId
  const firstLoad = useRef(true)
  const lastSceneSignature = useRef<string | null>(null)
  const maxPolarAngle =
    !isPreviewMode && allowUndergroundCamera ? DEBUG_MAX_POLAR_ANGLE : DEFAULT_MAX_POLAR_ANGLE
  const sceneSignature = useScene(
    (state) => `${state.rootNodeIds.join('|')}::${Object.keys(state.nodes).length}`,
  )

  const camera = useThree((state) => state.camera)
  const raycaster = useThree((state) => state.raycaster)
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    camera.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(ZONE_LAYER)
    interactionRaycaster.current.layers.enable(EDITOR_LAYER)
    interactionRaycaster.current.layers.enable(ZONE_LAYER)
  }, [camera, raycaster])

  const focusSceneObject = useCallback((nodeId: string | null, animated: boolean) => {
    if (!(controls.current && nodeId)) return false

    const object3D = sceneRegistry.nodes.get(nodeId)
    if (!object3D) return false

    tempBox.setFromObject(object3D)
    if (tempBox.isEmpty()) return false

    tempBox.getCenter(tempCenter)
    tempBox.getSize(tempSize)

    const maxDim = Math.max(tempSize.x, tempSize.y, tempSize.z, 10)
    const distance = Math.max(maxDim * 1.8, 20)

    controls.current.setLookAt(
      tempCenter.x + distance * 0.75,
      tempCenter.y + distance * 0.55,
      tempCenter.z + distance * 0.75,
      tempCenter.x,
      tempCenter.y,
      tempCenter.z,
      animated,
    )

    return true
  }, [])

  useEffect(() => {
    if (isPreviewMode) return // Preview mode uses auto-navigate instead
    if (!controls.current) return

    const isNewScene = lastSceneSignature.current !== sceneSignature
    lastSceneSignature.current = sceneSignature

    if (firstLoad.current || isNewScene) {
      firstLoad.current = false

      let cancelled = false
      let attempts = 0

      const targetNodeId =
        currentLevelId ??
        selection.buildingId ??
        (useScene.getState().rootNodeIds[0] ? String(useScene.getState().rootNodeIds[0]) : null)

      const focusSelection = () => {
        if (cancelled) return

        if (focusSceneObject(targetNodeId, true)) return

        attempts += 1
        if (attempts < 6) {
          requestAnimationFrame(focusSelection)
          return
        }

        controls.current?.setLookAt(20, 20, 20, 0, 0, 0, true)
      }

      requestAnimationFrame(focusSelection)

      return () => {
        cancelled = true
      }
    }

    let targetY = 0
    if (currentLevelId) {
      const levelMesh = sceneRegistry.nodes.get(currentLevelId)
      if (levelMesh) {
        targetY = levelMesh.position.y
      }
    }

    controls.current.getTarget(currentTarget)
    controls.current.moveTo(currentTarget.x, targetY, currentTarget.z, true)
  }, [currentLevelId, focusSceneObject, isPreviewMode, sceneSignature, selection.buildingId])

  useEffect(() => {
    if (!controls.current) return

    controls.current.maxPolarAngle = maxPolarAngle
    controls.current.minPolarAngle = 0

    if (controls.current.polarAngle > maxPolarAngle) {
      controls.current.rotateTo(controls.current.azimuthAngle, maxPolarAngle, true)
    }
  }, [maxPolarAngle])

  const focusNode = useCallback(
    (nodeId: string) => {
      if (isPreviewMode || !controls.current) return

      const object3D = sceneRegistry.nodes.get(nodeId)
      if (!object3D) return

      tempBox.setFromObject(object3D)
      if (tempBox.isEmpty()) return

      tempBox.getCenter(tempCenter)
      controls.current.getPosition(tempPosition)
      controls.current.getTarget(tempTarget)
      tempDelta.copy(tempCenter).sub(tempTarget)

      controls.current.setLookAt(
        tempPosition.x + tempDelta.x,
        tempPosition.y + tempDelta.y,
        tempPosition.z + tempDelta.z,
        tempCenter.x,
        tempCenter.y,
        tempCenter.z,
        true,
      )
    },
    [isPreviewMode],
  )

  // Configure mouse buttons based on control mode and camera mode
  const cameraMode = useViewer((state) => state.cameraMode)
  const viewMode = useEditor((state) => state.viewMode)
  const mouseButtons = useMemo(() => {
    // Use ZOOM for orthographic camera, DOLLY for perspective camera
    const wheelAction =
      cameraMode === 'orthographic'
        ? CameraControlsImpl.ACTION.ZOOM
        : CameraControlsImpl.ACTION.DOLLY

    return {
      left: isPreviewMode ? CameraControlsImpl.ACTION.SCREEN_PAN : CameraControlsImpl.ACTION.NONE,
      middle: CameraControlsImpl.ACTION.SCREEN_PAN,
      right: CameraControlsImpl.ACTION.ROTATE,
      wheel: wheelAction,
    }
  }, [cameraMode, isPreviewMode])

  const getIdleLeftMouseAction = useCallback((): LeftMouseAction => {
    if (isPreviewMode) return CameraControlsImpl.ACTION.SCREEN_PAN
    if (spacePressed.current) return CameraControlsImpl.ACTION.SCREEN_PAN
    return CameraControlsImpl.ACTION.NONE
  }, [isPreviewMode])

  const syncMouseButtons = useCallback(
    (leftAction: LeftMouseAction = getIdleLeftMouseAction()) => {
      if (!controls.current) return

      const wheelAction =
        cameraMode === 'orthographic'
          ? CameraControlsImpl.ACTION.ZOOM
          : CameraControlsImpl.ACTION.DOLLY

      controls.current.mouseButtons.wheel = wheelAction
      controls.current.mouseButtons.middle = CameraControlsImpl.ACTION.SCREEN_PAN
      controls.current.mouseButtons.right = CameraControlsImpl.ACTION.ROTATE
      controls.current.mouseButtons.left = leftAction
    },
    [cameraMode, getIdleLeftMouseAction],
  )

  const syncLeftOrbitPoint = useCallback(() => {
    if (!controls.current) return
    if (!getEditorOrbitCenter(tempOrbitCenter)) return

    controls.current.setOrbitPoint(tempOrbitCenter.x, tempOrbitCenter.y, tempOrbitCenter.z)
  }, [])

  const setInteractionRayFromPointer = useCallback(
    (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const viewportLeft = viewMode === 'tri-view' ? rect.left + rect.width * 0.5 : rect.left
      const viewportTop = viewMode === 'tri-view' ? rect.top + rect.height * 0.5 : rect.top
      const viewportWidth = viewMode === 'tri-view' ? rect.width * 0.5 : rect.width
      const viewportHeight = viewMode === 'tri-view' ? rect.height * 0.5 : rect.height

      pointer.current.x = ((event.clientX - viewportLeft) / viewportWidth) * 2 - 1
      pointer.current.y = -((event.clientY - viewportTop) / viewportHeight) * 2 + 1
      interactionRaycaster.current.setFromCamera(pointer.current, camera)
    },
    [camera, gl, viewMode],
  )

  useEffect(() => {
    if (!controls.current) return

    const control = controls.current
    const canvas = gl.domElement

    const resetViewport = () => {
      control.setViewport(null, 0, 0, 0)
      control.interactiveArea = FULL_INTERACTIVE_AREA
    }

    if (viewMode !== 'tri-view') {
      resetViewport()
      return
    }

    const updateViewport = () => {
      const rect = canvas.getBoundingClientRect()
      control.setViewport(rect.width * 0.5, 0, rect.width * 0.5, rect.height * 0.5)
      control.interactiveArea = TRI_VIEW_INTERACTIVE_AREA
    }

    updateViewport()

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateViewport) : null
    resizeObserver?.observe(canvas)
    window.addEventListener('resize', updateViewport)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateViewport)
      resetViewport()
    }
  }, [gl, viewMode])

  const hasTransformControlsHit = useCallback(() => {
    const transformControlRoots: Object3D[] = []

    scene.traverse((object) => {
      if ((object as Object3D & { isTransformControls?: boolean }).isTransformControls) {
        transformControlRoots.push(object)
      }
    })

    if (transformControlRoots.length === 0) return false

    return interactionRaycaster.current
      .intersectObjects(transformControlRoots, true)
      .some((intersection) => isTransformControlsObject(intersection.object))
  }, [scene])

  const hasEditableNodeHit = useCallback(() => {
    const objects: Object3D[] = []
    const seen = new Set<string>()

    for (const type of EDITOR_INTERACTION_NODE_TYPES) {
      for (const id of sceneRegistry.byType[type]) {
        if (seen.has(id)) continue

        const object = sceneRegistry.nodes.get(id)
        if (!object || !isVisibleInHierarchy(object)) continue

        seen.add(id)
        objects.push(object)
      }
    }

    if (objects.length === 0) return false

    return interactionRaycaster.current.intersectObjects(objects, true).length > 0
  }, [])

  const scheduleCameraDragReset = useCallback(() => {
    if (cameraDragResetTimer.current) {
      clearTimeout(cameraDragResetTimer.current)
    }

    cameraDragResetTimer.current = setTimeout(() => {
      cameraDragResetTimer.current = null
      useViewer.getState().setCameraDragging(false)
    }, 0)
  }, [])

  useEffect(() => {
    const canvas = gl.domElement

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === 'touch') return

      syncMouseButtons(getIdleLeftMouseAction())
      leftButtonGesture.current = null

      if (isPreviewMode || spacePressed.current) return

      setInteractionRayFromPointer(event)

      if (hasActiveEditorPointerInteraction() || hasTransformControlsHit()) {
        syncMouseButtons(CameraControlsImpl.ACTION.NONE)
        leftButtonGesture.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startedOnEditableNode: false,
          mode: 'blocked',
        }
        return
      }

      // Start with camera disabled so a short left click can still select or deselect.
      // If the pointer moves past the drag threshold, the gesture becomes camera orbit.
      syncMouseButtons(CameraControlsImpl.ACTION.NONE)
      leftButtonGesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startedOnEditableNode: hasEditableNodeHit(),
        mode: 'pending-camera',
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const gesture = leftButtonGesture.current
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.mode !== 'pending-camera') {
        return
      }

      if (useViewer.getState().cameraDragging || hasActiveEditorPointerInteraction()) {
        gesture.mode = 'blocked'
        syncMouseButtons(CameraControlsImpl.ACTION.NONE)
        return
      }

      const dx = event.clientX - gesture.startX
      const dy = event.clientY - gesture.startY
      const threshold = gesture.startedOnEditableNode
        ? LEFT_CAMERA_DRAG_THRESHOLD_PX * 2
        : LEFT_CAMERA_DRAG_THRESHOLD_PX
      if (Math.hypot(dx, dy) < threshold) return

      syncLeftOrbitPoint()
      gesture.mode = 'camera'
      syncMouseButtons(CameraControlsImpl.ACTION.ROTATE)
      useViewer.getState().setCameraDragging(true)
    }

    const handlePointerEnd = (event: PointerEvent) => {
      const gesture = leftButtonGesture.current
      if (!gesture || gesture.pointerId !== event.pointerId) return

      const wasCameraGesture = gesture.mode === 'camera'
      leftButtonGesture.current = null
      syncMouseButtons(getIdleLeftMouseAction())

      if (wasCameraGesture) {
        scheduleCameraDragReset()
      }
    }

    canvas.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointermove', handlePointerMove, true)
    document.addEventListener('pointerup', handlePointerEnd, true)
    document.addEventListener('pointercancel', handlePointerEnd, true)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('pointerup', handlePointerEnd, true)
      document.removeEventListener('pointercancel', handlePointerEnd, true)
      if (cameraDragResetTimer.current) {
        clearTimeout(cameraDragResetTimer.current)
      }
      leftButtonGesture.current = null
    }
  }, [
    getIdleLeftMouseAction,
    gl,
    hasEditableNodeHit,
    hasTransformControlsHit,
    isPreviewMode,
    scheduleCameraDragReset,
    setInteractionRayFromPointer,
    syncLeftOrbitPoint,
    syncMouseButtons,
  ])

  useEffect(() => {
    const keyState = {
      shiftRight: false,
      shiftLeft: false,
      controlRight: false,
      controlLeft: false,
      space: false,
    }

    const updateConfig = () => {
      if (!controls.current) return

      const space = keyState.space

      spacePressed.current = space
      syncMouseButtons()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        keyState.space = true
        document.body.style.cursor = 'grab'
      }
      if (event.code === 'ShiftRight') {
        keyState.shiftRight = true
      }
      if (event.code === 'ShiftLeft') {
        keyState.shiftLeft = true
      }
      if (event.code === 'ControlRight') {
        keyState.controlRight = true
      }
      if (event.code === 'ControlLeft') {
        keyState.controlLeft = true
      }
      updateConfig()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        keyState.space = false
        document.body.style.cursor = ''
      }
      if (event.code === 'ShiftRight') {
        keyState.shiftRight = false
      }
      if (event.code === 'ShiftLeft') {
        keyState.shiftLeft = false
      }
      if (event.code === 'ControlRight') {
        keyState.controlRight = false
      }
      if (event.code === 'ControlLeft') {
        keyState.controlLeft = false
      }
      updateConfig()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    updateConfig()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [syncMouseButtons])

  // Preview mode: auto-navigate camera to selected node (viewer behavior)
  const previewTargetNodeId = isPreviewMode
    ? (selection.zoneId ?? selection.levelId ?? selection.buildingId)
    : null

  useEffect(() => {
    if (!(isPreviewMode && controls.current)) return

    const nodes = useScene.getState().nodes
    let node = previewTargetNodeId ? nodes[previewTargetNodeId] : null

    if (!previewTargetNodeId) {
      const site = Object.values(nodes).find((n) => n.type === 'site')
      node = site || null
    }
    if (!node) return

    // Check if node has a saved camera
    if (node.camera) {
      const { position, target } = node.camera
      if (
        position &&
        target &&
        position.length >= 3 &&
        target.length >= 3 &&
        position.every((v) => v !== null && v !== undefined) &&
        target.every((v) => v !== null && v !== undefined)
      ) {
        requestAnimationFrame(() => {
          if (!controls.current) return
          controls.current.setLookAt(
            position[0],
            position[1],
            position[2],
            target[0],
            target[1],
            target[2],
            true,
          )
        })
      }
      return
    }

    if (!previewTargetNodeId) return

    // Calculate camera position from bounding box
    const object3D = sceneRegistry.nodes.get(previewTargetNodeId)
    if (!object3D) return

    tempBox.setFromObject(object3D)
    tempBox.getCenter(tempCenter)
    tempBox.getSize(tempSize)

    const maxDim = Math.max(tempSize.x, tempSize.y, tempSize.z)
    const distance = Math.max(maxDim * 2, 15)

    controls.current.setLookAt(
      tempCenter.x + distance * 0.7,
      tempCenter.y + distance * 0.5,
      tempCenter.z + distance * 0.7,
      tempCenter.x,
      tempCenter.y,
      tempCenter.z,
      true,
    )
  }, [isPreviewMode, previewTargetNodeId])

  useEffect(() => {
    const handleNodeCapture = ({ nodeId }: CameraControlEvent) => {
      if (!controls.current) return

      const position = new Vector3()
      const target = new Vector3()
      controls.current.getPosition(position)
      controls.current.getTarget(target)

      const state = useScene.getState()

      state.updateNode(nodeId, {
        camera: {
          position: [position.x, position.y, position.z],
          target: [target.x, target.y, target.z],
          mode: useViewer.getState().cameraMode,
        },
      })
    }
    const handleNodeView = ({ nodeId }: CameraControlEvent) => {
      if (!controls.current) return

      const node = useScene.getState().nodes[nodeId]
      if (!node?.camera) return
      const { position, target } = node.camera

      controls.current.setLookAt(
        position[0],
        position[1],
        position[2],
        target[0],
        target[1],
        target[2],
        true,
      )
    }

    const handleTopView = () => {
      if (!controls.current) return

      controls.current.maxPolarAngle = maxPolarAngle
      const currentPolarAngle = controls.current.polarAngle

      // Toggle: if already near top view (< 0.1 radians ≈ 5.7°), go back to 45°
      // Otherwise, go to top view (0°)
      const targetAngle = currentPolarAngle < 0.1 ? Math.PI / 4 : 0

      controls.current.rotatePolarTo(targetAngle, true)
    }

    const handleOrbitCW = () => {
      if (!controls.current) return

      const currentAzimuth = controls.current.azimuthAngle
      const currentPolar = controls.current.polarAngle
      // Round to nearest 90° increment, then rotate 90° clockwise
      const rounded = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2)
      const target = rounded - Math.PI / 2

      controls.current.rotateTo(target, currentPolar, true)
    }

    const handleOrbitCCW = () => {
      if (!controls.current) return

      const currentAzimuth = controls.current.azimuthAngle
      const currentPolar = controls.current.polarAngle
      // Round to nearest 90° increment, then rotate 90° counter-clockwise
      const rounded = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2)
      const target = rounded + Math.PI / 2

      controls.current.rotateTo(target, currentPolar, true)
    }

    const handleViewDirection = ({ direction }: { direction: CameraViewDirection }) => {
      if (!controls.current) return

      const allowBottomView = direction === 'bottom'
      const targetMaxPolarAngle = allowBottomView ? DEBUG_MAX_POLAR_ANGLE : maxPolarAngle
      controls.current.maxPolarAngle = targetMaxPolarAngle

      const targetPolar =
        direction === 'top'
          ? 0
          : allowBottomView
            ? DEBUG_MAX_POLAR_ANGLE
            : Math.min(SIDE_VIEW_POLAR_ANGLE, targetMaxPolarAngle)
      const targetAzimuth = VIEW_DIRECTION_AZIMUTHS[direction] ?? controls.current.azimuthAngle

      controls.current.rotateTo(targetAzimuth, targetPolar, true)
    }

    const handleNodeFocus = ({ nodeId }: CameraControlEvent) => {
      focusNode(nodeId)
    }

    emitter.on('camera-controls:capture', handleNodeCapture)
    emitter.on('camera-controls:focus', handleNodeFocus)
    emitter.on('camera-controls:view', handleNodeView)
    emitter.on('camera-controls:top-view', handleTopView)
    emitter.on('camera-controls:orbit-cw', handleOrbitCW)
    emitter.on('camera-controls:orbit-ccw', handleOrbitCCW)
    viewDirectionEmitter.on('camera-controls:view-direction', handleViewDirection)

    return () => {
      emitter.off('camera-controls:capture', handleNodeCapture)
      emitter.off('camera-controls:focus', handleNodeFocus)
      emitter.off('camera-controls:view', handleNodeView)
      emitter.off('camera-controls:top-view', handleTopView)
      emitter.off('camera-controls:orbit-cw', handleOrbitCW)
      emitter.off('camera-controls:orbit-ccw', handleOrbitCCW)
      viewDirectionEmitter.off('camera-controls:view-direction', handleViewDirection)
    }
  }, [focusNode, maxPolarAngle])

  const onTransitionStart = useCallback(() => {
    useViewer.getState().setCameraDragging(true)
  }, [])

  const onRest = useCallback(() => {
    useViewer.getState().setCameraDragging(false)
  }, [])

  if (walkthroughMode) {
    return null
  }

  return (
    <CameraControls
      dollyToCursor
      makeDefault
      maxDistance={100}
      maxPolarAngle={maxPolarAngle}
      minDistance={10}
      minPolarAngle={0}
      mouseButtons={mouseButtons}
      onRest={onRest}
      onSleep={onRest}
      onTransitionStart={onTransitionStart}
      ref={controls}
      restThreshold={0.01}
    />
  )
}
