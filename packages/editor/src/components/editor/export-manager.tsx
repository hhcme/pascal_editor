'use client'

import { useViewer } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { exportFilters, saveBlobExport } from '../../lib/export'

export function ExportManager() {
  const scene = useThree((state) => state.scene)
  const setExportScene = useViewer((state) => state.setExportScene)

  useEffect(() => {
    const exportFn = async (format: 'glb' | 'stl' | 'obj' = 'glb') => {
      // Find the scene renderer group by name
      const sceneGroup = scene.getObjectByName('scene-renderer')
      if (!sceneGroup) {
        console.error('scene-renderer group not found')
        return
      }

      const date = new Date().toISOString().split('T')[0]

      if (format === 'stl') {
        const exporter = new STLExporter()
        const result = exporter.parse(sceneGroup, { binary: true })
        const blob = new Blob([result], { type: 'model/stl' })
        await saveBlobExport(blob, `model_${date}.stl`, exportFilters.stl)
        return
      }

      if (format === 'obj') {
        const exporter = new OBJExporter()
        const result = exporter.parse(sceneGroup)
        const blob = new Blob([result], { type: 'model/obj' })
        await saveBlobExport(blob, `model_${date}.obj`, exportFilters.obj)
        return
      }

      // Default: GLB export (existing behavior)
      const exporter = new GLTFExporter()

      return new Promise<void>((resolve, reject) => {
        exporter.parse(
          sceneGroup,
          async (gltf) => {
            const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' })
            await saveBlobExport(blob, `model_${date}.glb`, exportFilters.glb)
            resolve()
          },
          (error) => {
            console.error('Export error:', error)
            reject(error)
          },
          { binary: true },
        )
      })
    }

    setExportScene(exportFn)

    return () => {
      setExportScene(null)
    }
  }, [scene, setExportScene])

  return null
}
