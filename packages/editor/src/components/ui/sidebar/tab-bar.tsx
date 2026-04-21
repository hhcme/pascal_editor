'use client'

import { cn } from './../../../lib/utils'

export type SidebarTab = {
  id: string
  label: string
}

interface TabBarProps {
  tabs: SidebarTab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="editor-panel-header flex h-12 shrink-0 items-center gap-1 border-border/50 border-b px-3">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            className={cn(
              'relative h-8 rounded-md px-3 font-semibold text-sm transition-colors',
              isActive
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
