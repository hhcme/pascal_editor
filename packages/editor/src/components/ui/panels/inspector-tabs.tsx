'use client'

import { SegmentedControl } from '../controls/segmented-control'

export type InspectorTabOption<T extends string> = {
  label: string
  value: T
}

export function InspectorTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: InspectorTabOption<T>[]
}) {
  return (
    <div className="border-border/30 border-b px-3 py-2">
      <SegmentedControl onChange={onChange} options={options} value={value} />
    </div>
  )
}
