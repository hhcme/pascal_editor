'use client'

import { type BuildingNode, sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import { sfxEmitter } from '../../lib/sfx-bus'
import useEditor from '../../store/use-editor'
import { NodeActionMenu } from './node-action-menu'

function getBuildingOrientationDegrees(rotationY: number): number {
  return (((-rotationY * 180) / Math.PI) % 360 + 360) % 360
}

function BuildingOrientationArrow({ rotationY }: { rotationY: number }) {
  const degrees = getBuildingOrientationDegrees(rotationY)

  return (
    <group position={[0, 0.08, 0]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, -2.15]} renderOrder={12}>
        <boxGeometry args={[0.14, 0.035, 2.6]} />
        <meshBasicMaterial color="#2563eb" depthWrite={false} opacity={0.64} transparent />
      </mesh>
      <mesh position={[0, 0, -3.55]} renderOrder={12} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.42, 0.86, 3]} />
        <meshBasicMaterial color="#2563eb" depthWrite={false} opacity={0.78} transparent />
      </mesh>
      <mesh position={[0, -0.01, -1.95]} renderOrder={11} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 0.94, 48]} />
        <meshBasicMaterial color="#2563eb" depthWrite={false} opacity={0.2} transparent />
      </mesh>
      <Html
        center
        position={[0, 0.24, -4.1]}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div className="whitespace-nowrap rounded-full border border-primary/20 bg-background/90 px-2 py-1 font-mono text-[10px] text-primary shadow-lg backdrop-blur-md">
          {degrees.toFixed(1)}°
        </div>
      </Html>
    </group>
  )
}

export function FloatingBuildingActionMenu() {
  const buildingId = useViewer((s) => s.selection.buildingId)
  const levelId = useViewer((s) => s.selection.levelId)
  const setMovingNode = useEditor((s) => s.setMovingNode)
  const setSelection = useViewer((s) => s.setSelection)
  const building = useScene((s) =>
    buildingId ? ((s.nodes[buildingId] as BuildingNode | undefined) ?? null) : null,
  )

  const arrowGroupRef = useRef<THREE.Group>(null)
  const menuGroupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!(buildingId && !levelId)) return

    const obj = sceneRegistry.nodes.get(buildingId)
    if (obj) {
      const box = new THREE.Box3().setFromObject(obj)
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        arrowGroupRef.current?.position.set(center.x, 0.08, center.z)
        menuGroupRef.current?.position.set(center.x, 1.5, center.z)
      }
    }
  })

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!buildingId) return
      // Read lazily at click time — no need to subscribe to nodes for a
      // one-shot action.
      const node = useScene.getState().nodes[buildingId]
      if (!node || node.type !== 'building') return
      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(node as BuildingNode)
      setSelection({ buildingId: null })
    },
    [buildingId, setMovingNode, setSelection],
  )

  // Only show when a building is selected without a level
  if (!(buildingId && building && !levelId)) return null

  return (
    <>
      <group ref={arrowGroupRef}>
        <BuildingOrientationArrow rotationY={building.rotation[1] ?? 0} />
      </group>
      <group ref={menuGroupRef}>
        <Html
          center
          style={{
            pointerEvents: 'auto',
            touchAction: 'none',
          }}
          zIndexRange={[100, 0]}
        >
          <NodeActionMenu
            onMove={handleMove}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          />
        </Html>
      </group>
    </>
  )
}
