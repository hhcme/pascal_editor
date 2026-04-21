'use client'

import { cn } from '../../../lib/utils'

export function InspectorSummary({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border-border/50 border-b bg-muted/25 px-3 py-3', className)}>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

export function InspectorStat({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 rounded-md border border-border/55 bg-card px-2.5 py-2', className)}>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono font-semibold text-foreground text-xs tabular-nums">
        {value}
      </div>
    </div>
  )
}
