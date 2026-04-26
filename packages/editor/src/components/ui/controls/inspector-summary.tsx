'use client'

import { cn } from '../../../lib/utils'

type InspectorTone = 'neutral' | 'success' | 'warning' | 'danger'

const INSPECTOR_HIGHLIGHT_TONE_CLASSNAME: Record<InspectorTone, string> = {
  neutral: 'border-border/60 bg-card/90',
  success: 'border-emerald-500/25 bg-emerald-500/8',
  warning: 'border-amber-500/30 bg-amber-500/10',
  danger: 'border-destructive/25 bg-destructive/8',
}

const INSPECTOR_BADGE_TONE_CLASSNAME: Record<InspectorTone, string> = {
  neutral: 'border-border/60 bg-background/90 text-foreground',
  success: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-200',
  danger: 'border-destructive/25 bg-destructive/12 text-destructive',
}

export function InspectorSummary({
  children,
  className,
  contentClassName,
  sticky = false,
}: {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  sticky?: boolean
}) {
  return (
    <div
      className={cn(
        'border-border/50 border-b bg-muted/25 px-3 py-3',
        sticky && 'sticky top-0 z-10 bg-sidebar/94 backdrop-blur-md',
        className,
      )}
    >
      <div className={cn('grid grid-cols-2 gap-2', contentClassName)}>{children}</div>
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

export function InspectorHighlight({
  badge,
  children,
  className,
  description,
  meta,
  title,
  tone = 'neutral',
  trailing,
}: {
  badge?: React.ReactNode
  children?: React.ReactNode
  className?: string
  description?: React.ReactNode
  meta?: React.ReactNode
  title: React.ReactNode
  tone?: InspectorTone
  trailing?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'col-span-2 rounded-lg border px-3 py-3 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.45)]',
        INSPECTOR_HIGHLIGHT_TONE_CLASSNAME[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            <span className="font-semibold text-foreground text-sm">{title}</span>
            {meta ? (
              <span className="text-[11px] text-muted-foreground leading-none">{meta}</span>
            ) : null}
          </div>
          {description ? (
            <div className="mt-2 text-[11px] leading-5 text-muted-foreground">{description}</div>
          ) : null}
          {children ? <div className="mt-2">{children}</div> : null}
        </div>
        {trailing ? <div className="flex shrink-0 flex-wrap justify-end gap-1">{trailing}</div> : null}
      </div>
    </div>
  )
}

export function InspectorBadge({
  children,
  className,
  tone = 'neutral',
}: {
  children: React.ReactNode
  className?: string
  tone?: InspectorTone
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 font-semibold text-[11px] leading-none',
        INSPECTOR_BADGE_TONE_CLASSNAME[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
