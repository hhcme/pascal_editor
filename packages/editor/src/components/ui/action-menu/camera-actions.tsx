'use client'

import { emitter } from '@pascal-app/core'
import { Box, RotateCcw, RotateCw } from 'lucide-react'
import { ActionButton } from './action-button'

type CameraViewDirection = 'front' | 'left' | 'right' | 'back' | 'top' | 'bottom'

const viewDirectionOptions: Array<{
  direction: CameraViewDirection
  label: string
}> = [
  { direction: 'front', label: '正视图' },
  { direction: 'left', label: '左视图' },
  { direction: 'right', label: '右视图' },
  { direction: 'back', label: '后视图' },
  { direction: 'top', label: '俯视图' },
  { direction: 'bottom', label: '仰视图' },
]

const viewDirectionEmitter = emitter as unknown as {
  emit: (
    type: 'camera-controls:view-direction',
    event: { direction: CameraViewDirection },
  ) => void
}

export function CameraActions() {
  const goToTopView = () => {
    emitter.emit('camera-controls:top-view')
  }

  const orbitCW = () => {
    emitter.emit('camera-controls:orbit-cw')
  }

  const orbitCCW = () => {
    emitter.emit('camera-controls:orbit-ccw')
  }

  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="切换视角"
        className="h-10 rounded-md border border-transparent bg-transparent px-2 font-medium text-muted-foreground text-xs outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        defaultValue=""
        onChange={(event) => {
          const direction = event.currentTarget.value as CameraViewDirection
          if (!direction) return
          viewDirectionEmitter.emit('camera-controls:view-direction', { direction })
          event.currentTarget.value = ''
        }}
        title="切换视角"
      >
        <option value="">视角</option>
        {viewDirectionOptions.map((option) => (
          <option key={option.direction} value={option.direction}>
            {option.label}
          </option>
        ))}
      </select>

      {/* Orbit CCW */}
      <ActionButton
        className="group text-muted-foreground hover:bg-accent hover:text-foreground"
        label="Orbit Left"
        onClick={orbitCCW}
        size="icon"
        variant="ghost"
      >
        <RotateCcw aria-hidden="true" className="h-5 w-5 stroke-[1.9]" />
      </ActionButton>

      {/* Orbit CW */}
      <ActionButton
        className="group text-muted-foreground hover:bg-accent hover:text-foreground"
        label="Orbit Right"
        onClick={orbitCW}
        size="icon"
        variant="ghost"
      >
        <RotateCw aria-hidden="true" className="h-5 w-5 stroke-[1.9]" />
      </ActionButton>

      {/* Top View */}
      <ActionButton
        className="group text-muted-foreground hover:bg-accent hover:text-foreground"
        label="Top View"
        onClick={goToTopView}
        size="icon"
        variant="ghost"
      >
        <Box aria-hidden="true" className="h-5 w-5 stroke-[1.9]" />
      </ActionButton>
    </div>
  )
}
