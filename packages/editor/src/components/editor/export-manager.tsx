'use client'

import { useViewer } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { exportFilters, saveBlobExport } from '../../lib/export'
import type { ExportSceneRequest } from '../../../../viewer/src/store/use-viewer'

export function ExportManager() {
  const scene = useThree((state) => state.scene)
  const setExportScene = useViewer((state) => state.setExportScene)

  useEffect(() => {
    const exportFn = async (request: ExportSceneRequest = 'glb') => {
      const normalizedRequest = typeof request === 'string' ? { format: request } : request
      const format = normalizedRequest.format ?? 'glb'

      // Find the scene renderer group by name
      const sceneGroup = scene.getObjectByName('scene-renderer')
      if (!sceneGroup) {
        console.error('scene-renderer group not found')
        return null
      }

      const date = new Date().toISOString().split('T')[0]
      const filename =
        normalizedRequest.filename || `model_${date}.${format}`

      if (format === 'stl') {
        const exporter = new STLExporter()
        const result = exporter.parse(sceneGroup, { binary: true })
        const blob = new Blob([result], { type: 'model/stl' })
        return saveBlobExport(blob, filename, exportFilters.stl, normalizedRequest.directoryPath)
      }

      if (format === 'obj') {
        const exporter = new OBJExporter()
        const result = exporter.parse(sceneGroup)
        const blob = new Blob([result], { type: 'model/obj' })
        return saveBlobExport(blob, filename, exportFilters.obj, normalizedRequest.directoryPath)
      }

      // Default: GLB export (existing behavior)
      const exporter = new GLTFExporter()

      return new Promise<string | null>((resolve, reject) => {
        exporter.parse(
          sceneGroup,
          async (gltf) => {
            try {
              const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' })
              const filePath = await saveBlobExport(
                blob,
                filename,
                exportFilters.glb,
                normalizedRequest.directoryPath,
              )
              resolve(filePath)
            } catch (error) {
              reject(error)
            }
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
