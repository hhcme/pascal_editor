'use client'

import NextImage from 'next/image'
import { cn } from '../../../lib/utils'
import useEditor, {
  isSketchStructureTool,
  SKETCH_STRUCTURE_TOOLS,
  type CatalogCategory,
  type StructureTool,
} from '../../../store/use-editor'
import { ActionButton } from './action-button'

export type ToolConfig = {
  id: StructureTool
  iconSrc: string
  label: string
  catalogCategory?: CatalogCategory
}

export const tools: ToolConfig[] = [
  { id: 'wall', iconSrc: '/icons/wall.png', label: 'Wall' },
  { id: 'sketch-line', iconSrc: '/icons/sketch-line.svg', label: '草图线' },
  { id: 'sketch-rectangle', iconSrc: '/icons/sketch-rectangle.svg', label: '草图矩形' },
  { id: 'sketch-circle', iconSrc: '/icons/sketch-circle.svg', label: '草图圆' },
  { id: 'sketch-arc', iconSrc: '/icons/sketch-arc.svg', label: '草图圆弧' },
  {
    id: 'sketch-construction-line',
    iconSrc: '/icons/sketch-construction-line.svg',
    label: '参考线',
  },
  { id: 'smart-dimension', iconSrc: '/icons/smart-dimension.svg', label: '智能尺寸' },
  // { id: 'room', iconSrc: '/icons/room.png', label: 'Room' },
  // { id: 'custom-room', iconSrc: '/icons/custom-room.png', label: 'Custom Room' },
  { id: 'slab', iconSrc: '/icons/floor.png', label: 'Slab' },
  { id: 'ceiling', iconSrc: '/icons/ceiling.png', label: 'Ceiling' },
  { id: 'roof', iconSrc: '/icons/roof.png', label: 'Gable Roof' },
  { id: 'stair', iconSrc: '/icons/stairs.png', label: 'Stairs' },
  { id: 'door', iconSrc: '/icons/door.png', label: 'Door' },
  { id: 'window', iconSrc: '/icons/window.png', label: 'Window' },
  { id: 'fence', iconSrc: '/icons/fence.png', label: 'Fence' },
  { id: 'zone', iconSrc: '/icons/zone.png', label: 'Zone' },
]

const sketchToolIds = new Set<StructureTool>(SKETCH_STRUCTURE_TOOLS)

export function StructureTools() {
  const activeTool = useEditor((state) => state.tool)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const structureLayer = useEditor((state) => state.structureLayer)
  const setTool = useEditor((state) => state.setTool)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)

  // Filter tools based on structureLayer
  const visibleTools =
    structureLayer === 'zones'
      ? tools.filter((t) => t.id === 'zone')
      : isSketchStructureTool(activeTool)
        ? tools.filter((t) => sketchToolIds.has(t.id))
        : tools.filter((t) => t.id !== 'zone' && !sketchToolIds.has(t.id))

  return (
    <div className="flex items-center gap-1.5 px-1">
      {visibleTools.map((tool, index) => {
        // For item tools with catalog category, check both tool and category match
        const isActive =
          activeTool === tool.id &&
          (tool.catalogCategory ? catalogCategory === tool.catalogCategory : true)

        return (
          <ActionButton
            className={cn(
              'rounded-md duration-200',
              isActive
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15'
                : 'bg-transparent opacity-70 grayscale hover:bg-accent hover:opacity-100 hover:grayscale-0',
            )}
            key={`${tool.id}-${tool.catalogCategory ?? index}`}
            label={tool.label}
            onClick={() => {
              if (!isActive) {
                setTool(tool.id)
                setCatalogCategory(tool.catalogCategory ?? null)

                // Automatically switch to build mode if we select a tool
                if (useEditor.getState().mode !== 'build') {
                  useEditor.getState().setMode('build')
                }
              }
            }}
            size="icon"
            variant="ghost"
          >
            <NextImage
              alt={tool.label}
              className="h-7 w-7 object-contain"
              height={28}
              src={tool.iconSrc}
              width={28}
            />
          </ActionButton>
        )
      })}
    </div>
  )
}
