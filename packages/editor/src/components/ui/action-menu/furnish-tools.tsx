'use client'

import {
  Bath,
  CookingPot,
  Lamp,
  PawPrint,
  Plug,
  Sofa,
  Sprout,
  TreePine,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from './../../../lib/utils'
import useEditor, { type CatalogCategory } from './../../../store/use-editor'
import { ActionButton } from './action-button'

export type FurnishToolConfig = {
  id: 'item'
  Icon: LucideIcon
  iconSrc: string
  label: string
  catalogCategory: CatalogCategory
}

// Furnish mode tools: furniture, appliances, decoration (painting is now a control mode)
export const furnishTools: FurnishToolConfig[] = [
  {
    id: 'item',
    Icon: Sofa,
    iconSrc: '/icons/couch.png',
    label: 'Furniture',
    catalogCategory: 'furniture',
  },
  {
    id: 'item',
    Icon: Users,
    iconSrc: '/icons/people.svg',
    label: 'People',
    catalogCategory: 'people',
  },
  {
    id: 'item',
    Icon: Sprout,
    iconSrc: '/icons/plants.svg',
    label: 'Plants',
    catalogCategory: 'plants',
  },
  {
    id: 'item',
    Icon: PawPrint,
    iconSrc: '/icons/animal.svg',
    label: 'Animals',
    catalogCategory: 'animals',
  },
  {
    id: 'item',
    Icon: Lamp,
    iconSrc: '/icons/environment.png',
    label: 'Lighting',
    catalogCategory: 'lighting',
  },
  {
    id: 'item',
    Icon: Plug,
    iconSrc: '/icons/appliance.png',
    label: 'Appliance',
    catalogCategory: 'appliance',
  },
  {
    id: 'item',
    Icon: CookingPot,
    iconSrc: '/icons/kitchen.png',
    label: 'Kitchen',
    catalogCategory: 'kitchen',
  },
  {
    id: 'item',
    Icon: Bath,
    iconSrc: '/icons/bathroom.png',
    label: 'Bathroom',
    catalogCategory: 'bathroom',
  },
  {
    id: 'item',
    Icon: TreePine,
    iconSrc: '/icons/tree.png',
    label: 'Outdoor',
    catalogCategory: 'outdoor',
  },
]

export function FurnishTools() {
  const mode = useEditor((state) => state.mode)
  const activeTool = useEditor((state) => state.tool)
  const setActiveTool = useEditor((state) => state.setTool)
  const setMode = useEditor((state) => state.setMode)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)

  const hasActiveTool = furnishTools.some(
    (tool) => mode === 'build' && activeTool === 'item' && catalogCategory === tool.catalogCategory,
  )

  return (
    <div className="flex items-center gap-1.5 px-1">
      {furnishTools.map((tool, index) => {
        // For item tools with catalog category, check both tool and category match
        const isActive =
          mode === 'build' && activeTool === 'item' && catalogCategory === tool.catalogCategory
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
                setCatalogCategory(tool.catalogCategory)
                setActiveTool('item')
                if (mode !== 'build') {
                  setMode('build')
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
