'use client'

import { sceneRegistry, useScene } from '@pascal-app/core'
import { SCENE_LAYER, ZONE_LAYER } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Box3,
  Color,
  type Camera,
  type Object3D,
  OrthographicCamera,
  type PerspectiveCamera,
  type Scene,
  Vector3,
} from 'three'
import { EDITOR_LAYER } from '../../lib/constants'

type CadViewId = 'top' | 'front' | 'right'

type CadViewport = {
  x: number
  y: number
  width: number
  height: number
}

type CadSceneBounds = {
  center: Vector3
  size: Vector3
  radius: number
}

type MultiViewportRenderer = {
  autoClear: boolean
  setViewport: (x: number, y: number, width: number, height: number) => void
  setScissor: (x: number, y: number, width: number, height: number) => void
  setScissorTest: (enabled: boolean) => void
  setClearColor: (color: Color, alpha?: number) => void
  clear: (color?: boolean, depth?: boolean, stencil?: boolean) => void
  render: (scene: Scene, camera: Camera) => void
}

const CAD_VIEW_PADDING = 1.22
const MIN_VIEW_SPAN = 12
const MIN_CAMERA_DISTANCE = 40
const BOUNDS_RECALC_INTERVAL_MS = 250
const DEFAULT_BOUNDS_SIZE = new Vector3(40, 16, 40)
const VIEW_BACKGROUND = new Color('#f8fafc')

const tempBox = new Box3()
const tempObjectBox = new Box3()

function enableEditorCameraLayers(camera: Camera) {
  camera.layers.enable(SCENE_LAYER)
  camera.layers.enable(EDITOR_LAYER)
  camera.layers.enable(ZONE_LAYER)
}

function isVisibleInHierarchy(object: Object3D) {
  let current: Object3D | null = object

  while (current) {
    if (!current.visible) return false
    current = current.parent
  }

  return true
}

function calculateSceneBounds(out: CadSceneBounds) {
  tempBox.makeEmpty()

  for (const object of sceneRegistry.nodes.values()) {
    if (!isVisibleInHierarchy(object)) continue

    tempObjectBox.setFromObject(object)
    if (!tempObjectBox.isEmpty()) {
      tempBox.union(tempObjectBox)
    }
  }

  if (tempBox.isEmpty()) {
    out.center.set(0, 0, 0)
    out.size.copy(DEFAULT_BOUNDS_SIZE)
    out.radius = DEFAULT_BOUNDS_SIZE.length() * 0.5
    return
  }

  tempBox.getCenter(out.center)
  tempBox.getSize(out.size)
  out.radius = Math.max(out.size.length() * 0.5, MIN_CAMERA_DISTANCE)
}

function fitOrthographicCamera(
  camera: OrthographicCamera,
  viewId: CadViewId,
  viewport: CadViewport,
  bounds: CadSceneBounds,
) {
  const aspect = Math.max(viewport.width / Math.max(viewport.height, 1), 0.01)
  const width =
    viewId === 'right'
      ? Math.max(bounds.size.z, MIN_VIEW_SPAN)
      : Math.max(bounds.size.x, MIN_VIEW_SPAN)
  const height =
    viewId === 'top'
      ? Math.max(bounds.size.z, MIN_VIEW_SPAN)
      : Math.max(bounds.size.y, MIN_VIEW_SPAN)

  const paddedWidth = width * CAD_VIEW_PADDING
  const paddedHeight = height * CAD_VIEW_PADDING
  const contentAspect = paddedWidth / paddedHeight

  let halfWidth: number
  let halfHeight: number

  if (contentAspect > aspect) {
    halfWidth = paddedWidth * 0.5
    halfHeight = halfWidth / aspect
  } else {
    halfHeight = paddedHeight * 0.5
    halfWidth = halfHeight * aspect
  }

  const distance = Math.max(bounds.radius * 2.6, MIN_CAMERA_DISTANCE)
  camera.left = -halfWidth
  camera.right = halfWidth
  camera.top = halfHeight
  camera.bottom = -halfHeight
  camera.near = -distance * 4
  camera.far = distance * 4
  camera.zoom = 1

  if (viewId === 'top') {
    camera.position.set(bounds.center.x, bounds.center.y + distance, bounds.center.z)
    camera.up.set(0, 0, -1)
  } else if (viewId === 'front') {
    camera.position.set(bounds.center.x, bounds.center.y, bounds.center.z + distance)
    camera.up.set(0, 1, 0)
  } else {
    camera.position.set(bounds.center.x + distance, bounds.center.y, bounds.center.z)
    camera.up.set(0, 1, 0)
  }

  camera.lookAt(bounds.center)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

function updatePerspectiveViewportCamera(camera: Camera, viewport: CadViewport) {
  const aspect = Math.max(viewport.width / Math.max(viewport.height, 1), 0.01)
  const perspectiveCamera = camera as PerspectiveCamera

  if (perspectiveCamera.isPerspectiveCamera && perspectiveCamera.aspect !== aspect) {
    perspectiveCamera.aspect = aspect
    perspectiveCamera.updateProjectionMatrix()
  }
}

function renderViewport(
  renderer: MultiViewportRenderer,
  scene: Scene,
  camera: Camera,
  viewport: CadViewport,
) {
  if (viewport.width <= 1 || viewport.height <= 1) return

  renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height)
  renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height)
  renderer.clear(true, true, true)
  renderer.render(scene, camera)
}

export function CadMultiViewRenderer() {
  const { camera, gl, scene, size } = useThree()
  const renderer = gl as unknown as MultiViewportRenderer
  const sceneSignature = useScene(
    (state) => `${state.rootNodeIds.join('|')}::${Object.keys(state.nodes).length}`,
  )
  const bounds = useRef<CadSceneBounds>({
    center: new Vector3(),
    size: DEFAULT_BOUNDS_SIZE.clone(),
    radius: DEFAULT_BOUNDS_SIZE.length() * 0.5,
  })
  const lastBoundsAt = useRef(0)
  const lastSceneSignature = useRef<string | null>(null)

  const orthoCameras = useMemo(
    () => ({
      top: new OrthographicCamera(),
      front: new OrthographicCamera(),
      right: new OrthographicCamera(),
    }),
    [],
  )

  useEffect(() => {
    for (const orthoCamera of Object.values(orthoCameras)) {
      enableEditorCameraLayers(orthoCamera)
    }
  }, [orthoCameras])

  useEffect(() => {
    enableEditorCameraLayers(camera)
  }, [camera])

  useEffect(() => {
    return () => {
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, size.width, size.height)
      renderer.setScissor(0, 0, size.width, size.height)
    }
  }, [renderer, size.height, size.width])

  useFrame(() => {
    const width = Math.floor(size.width)
    const height = Math.floor(size.height)
    if (width < 4 || height < 4) return

    const now = performance.now()
    if (
      lastSceneSignature.current !== sceneSignature ||
      now - lastBoundsAt.current > BOUNDS_RECALC_INTERVAL_MS
    ) {
      calculateSceneBounds(bounds.current)
      lastSceneSignature.current = sceneSignature
      lastBoundsAt.current = now
    }

    const leftWidth = Math.floor(width / 2)
    const rightWidth = width - leftWidth
    const bottomHeight = Math.floor(height / 2)
    const topHeight = height - bottomHeight

    const topViewport = { x: 0, y: bottomHeight, width: leftWidth, height: topHeight }
    const perspectiveViewport = {
      x: leftWidth,
      y: bottomHeight,
      width: rightWidth,
      height: topHeight,
    }
    const frontViewport = { x: 0, y: 0, width: leftWidth, height: bottomHeight }
    const rightViewport = {
      x: leftWidth,
      y: 0,
      width: rightWidth,
      height: bottomHeight,
    }

    fitOrthographicCamera(orthoCameras.top, 'top', topViewport, bounds.current)
    fitOrthographicCamera(orthoCameras.front, 'front', frontViewport, bounds.current)
    fitOrthographicCamera(orthoCameras.right, 'right', rightViewport, bounds.current)
    updatePerspectiveViewportCamera(camera, perspectiveViewport)

    const previousAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setClearColor(VIEW_BACKGROUND, 1)
    renderer.setScissorTest(true)

    renderViewport(renderer, scene, orthoCameras.top, topViewport)
    renderViewport(renderer, scene, camera, perspectiveViewport)
    renderViewport(renderer, scene, orthoCameras.front, frontViewport)
    renderViewport(renderer, scene, orthoCameras.right, rightViewport)

    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    renderer.setScissor(0, 0, width, height)
    renderer.autoClear = previousAutoClear
  }, 1)

  return null
}
