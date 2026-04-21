'use client'

import { cn } from '../../../lib/utils'

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode
  label: string
  tone?: 'default' | 'danger'
}

export function ActionButton({ icon, label, tone = 'default', className, ...props }: ActionButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border/55 bg-card px-3 font-medium text-foreground text-xs transition-colors hover:bg-accent/55 active:bg-accent',
        tone === 'danger' &&
          'border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/10 active:bg-destructive/15',
        className,
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export function ActionGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('flex gap-1.5', className)}>{children}</div>
}
