'use client'

import {
  Blocks,
  BrickWall,
  Circle,
  Construction,
  DoorOpen,
  Fence,
  House,
  Layers,
  PanelTop,
  PencilLine,
  RectangleHorizontal,
  Ruler,
  Shapes,
  Spline,
  Square,
  type LucideIcon,
} from 'lucide-react'
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
  Icon: LucideIcon
  iconSrc: string
  label: string
  catalogCategory?: CatalogCategory
}

export const tools: ToolConfig[] = [
  { id: 'wall', Icon: BrickWall, iconSrc: '/icons/wall.png', label: 'Wall' },
  { id: 'sketch-line', Icon: PencilLine, iconSrc: '/icons/sketch-line.svg', label: '草图线' },
  {
    id: 'sketch-rectangle',
    Icon: Square,
    iconSrc: '/icons/sketch-rectangle.svg',
    label: '草图矩形',
  },
  { id: 'sketch-circle', Icon: Circle, iconSrc: '/icons/sketch-circle.svg', label: '草图圆' },
  { id: 'sketch-arc', Icon: Spline, iconSrc: '/icons/sketch-arc.svg', label: '草图圆弧' },
  {
    id: 'sketch-construction-line',
    Icon: Construction,
    iconSrc: '/icons/sketch-construction-line.svg',
    label: '参考线',
  },
  { id: 'smart-dimension', Icon: Ruler, iconSrc: '/icons/smart-dimension.svg', label: '智能尺寸' },
  // { id: 'room', iconSrc: '/icons/room.png', label: 'Room' },
  // { id: 'custom-room', iconSrc: '/icons/custom-room.png', label: 'Custom Room' },
  { id: 'slab', Icon: Layers, iconSrc: '/icons/floor.png', label: 'Slab' },
  { id: 'ceiling', Icon: PanelTop, iconSrc: '/icons/ceiling.png', label: 'Ceiling' },
  { id: 'roof', Icon: House, iconSrc: '/icons/roof.png', label: 'Gable Roof' },
  { id: 'stair', Icon: Blocks, iconSrc: '/icons/stairs.png', label: 'Stairs' },
  { id: 'door', Icon: DoorOpen, iconSrc: '/icons/door.png', label: 'Door' },
  { id: 'window', Icon: RectangleHorizontal, iconSrc: '/icons/window.png', label: 'Window' },
  { id: 'fence', Icon: Fence, iconSrc: '/icons/fence.png', label: 'Fence' },
  { id: 'zone', Icon: Shapes, iconSrc: '/icons/zone.png', label: 'Zone' },
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
        const Icon = tool.Icon

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
            <Icon
              aria-hidden="true"
              className={cn(
                'h-5 w-5 stroke-[1.9] transition-colors duration-200',
                isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
          </ActionButton>
        )
      })}
    </div>
  )
}
