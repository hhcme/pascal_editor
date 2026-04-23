'use client'

import { type AnyNodeId, type ItemNode, sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Html, TransformControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { sfxEmitter } from '../../lib/sfx-bus'

const TRANSLATION_SNAP = 0.05
const ROTATION_SNAP = Math.PI / 180
const POSITION_EPSILON = 0.0001
const ROTATION_EPSILON = 0.0001

type TransformSession = {
  position: THREE.Vector3
  rotation: THREE.Euler
}

function normalizeRadians(angle: number) {
  const twoPi = Math.PI * 2
  return ((((angle + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI
}

function formatDegrees(angle: number) {
  return Math.round((normalizeRadians(angle) * 180) / Math.PI)
}

function toItemPosition(object: THREE.Object3D): ItemNode['position'] {
  return [object.position.x, object.position.y, object.position.z]
}

function toItemRotation(node: ItemNode, rotationY: number): ItemNode['rotation'] {
  return [node.rotation[0], normalizeRadians(rotationY), node.rotation[2]]
}

function didPositionChange(a: THREE.Vector3, b: THREE.Vector3) {
  return a.distanceToSquared(b) > POSITION_EPSILON * POSITION_EPSILON
}

function didRotationChange(a: THREE.Euler, b: THREE.Euler) {
  return Math.abs(normalizeRadians(a.y - b.y)) > ROTATION_EPSILON
}

function isAttachedItem(node: ItemNode) {
  return (
    node.asset.attachTo === 'wall' ||
    node.asset.attachTo === 'wall-side' ||
    node.asset.attachTo === 'ceiling'
  )
}

type SelectionTransformGizmoProps = {
  node: ItemNode
}

export function SelectionTransformGizmo({ node }: SelectionTransformGizmoProps) {
  const [targetObject, setTargetObject] = useState<THREE.Object3D | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [displayDegrees, setDisplayDegrees] = useState(() => formatDegrees(node.rotation[1] ?? 0))
  const hudRef = useRef<THREE.Group>(null)
  const sessionRef = useRef<TransformSession | null>(null)
  const boxRef = useRef(new THREE.Box3())
  const centerRef = useRef(new THREE.Vector3())

  const canTranslate = useMemo(() => !isAttachedItem(node), [node])

  useEffect(() => {
    setDisplayDegrees(formatDegrees(node.rotation[1] ?? 0))
  }, [node.rotation])

  useEffect(() => {
    let cancelled = false
    let frameId = 0
    let attempts = 0

    const resolveTarget = () => {
      if (cancelled) return

      const nextObject = sceneRegistry.nodes.get(node.id) ?? null
      if (nextObject || attempts > 8) {
        setTargetObject(nextObject)
        return
      }

      attempts += 1
      frameId = requestAnimationFrame(resolveTarget)
    }

    resolveTarget()

    return () => {
      cancelled = true
      if (frameId) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [node.id])

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        useScene.temporal.getState().resume()
        useViewer.getState().setCameraDragging(false)
        sessionRef.current = null
      }
    }
  }, [])

  useFrame(() => {
    if (!(targetObject && hudRef.current)) return

    const box = boxRef.current.setFromObject(targetObject)
    if (box.isEmpty()) {
      hudRef.current.position.copy(targetObject.getWorldPosition(centerRef.current))
      hudRef.current.position.y += 0.5
      return
    }

    const center = box.getCenter(centerRef.current)
    hudRef.current.position.set(center.x, box.max.y + 0.42, center.z)
  })

  const beginTransform = useCallback(() => {
    if (!(targetObject && !sessionRef.current)) return

    sessionRef.current = {
      position: targetObject.position.clone(),
      rotation: targetObject.rotation.clone(),
    }
    useScene.temporal.getState().pause()
    useViewer.getState().setCameraDragging(true)
    setIsDragging(true)
  }, [targetObject])

  const syncObjectChange = useCallback(() => {
    if (!targetObject) return

    // The selected item schema stores freeform Y rotation, while X/Z are
    // corrective or attachment-preserving values from the node data.
    targetObject.rotation.x = node.rotation[0]
    targetObject.rotation.z = node.rotation[2]
    setDisplayDegrees(formatDegrees(targetObject.rotation.y))
  }, [node.rotation, targetObject])

  const finishTransform = useCallback(() => {
    const session = sessionRef.current
    if (!(targetObject && session)) return

    sessionRef.current = null
    setIsDragging(false)
    useViewer.getState().setCameraDragging(false)

    const sceneState = useScene.getState()
    const latestNode = sceneState.nodes[node.id as AnyNodeId]
    if (!latestNode || latestNode.type !== 'item') {
      useScene.temporal.getState().resume()
      return
    }

    const positionChanged =
      canTranslate && didPositionChange(session.position, targetObject.position)
    const rotationChanged = didRotationChange(session.rotation, targetObject.rotation)

    useScene.temporal.getState().resume()

    if (!(positionChanged || rotationChanged)) {
      return
    }

    if (rotationChanged) {
      sfxEmitter.emit('sfx:item-rotate')
    }

    sceneState.updateNode(node.id as AnyNodeId, {
      ...(positionChanged ? { position: toItemPosition(targetObject) } : {}),
      ...(rotationChanged ? { rotation: toItemRotation(latestNode, targetObject.rotation.y) } : {}),
    })

    if (latestNode.parentId && isAttachedItem(latestNode)) {
      requestAnimationFrame(() => {
        useScene.getState().markDirty(latestNode.parentId as AnyNodeId)
      })
    }
  }, [canTranslate, node.id, targetObject])

  if (!targetObject) return null

  return (
    <>
      {canTranslate && (
        <TransformControls
          mode="translate"
          object={targetObject}
          onMouseDown={beginTransform}
          onMouseUp={finishTransform}
          onObjectChange={syncObjectChange}
          showX
          showY
          showZ
          size={0.78}
          space="local"
          translationSnap={TRANSLATION_SNAP}
        />
      )}
      <TransformControls
        mode="rotate"
        object={targetObject}
        onMouseDown={beginTransform}
        onMouseUp={finishTransform}
        onObjectChange={syncObjectChange}
        rotationSnap={ROTATION_SNAP}
        showX={false}
        showY
        showZ={false}
        size={1.02}
        space="local"
      />
      <group ref={hudRef}>
        <Html center style={{ pointerEvents: 'none' }} zIndexRange={[90, 0]}>
          <div
            className={[
              'rounded-md border border-border bg-background/95 px-2 py-1 font-medium text-[11px]',
              'text-foreground shadow-lg backdrop-blur-md transition-opacity',
              isDragging ? 'opacity-100' : 'opacity-70',
            ].join(' ')}
          >
            {displayDegrees} deg
          </div>
        </Html>
      </group>
    </>
  )
}
