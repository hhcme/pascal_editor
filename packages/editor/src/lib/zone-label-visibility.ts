import type { ZoneNode } from '@pascal-app/core'

const ZONE_LABEL_HIDDEN_KEY = 'labelHidden'

function getMetadataObject(metadata: ZoneNode['metadata']): Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

export function isZoneLabelHidden(zone: Pick<ZoneNode, 'metadata'> | null | undefined): boolean {
  return getMetadataObject(zone?.metadata ?? {}).labelHidden === true
}

export function withZoneLabelHidden(
  zone: Pick<ZoneNode, 'metadata'>,
  hidden: boolean,
): ZoneNode['metadata'] {
  const metadata = { ...getMetadataObject(zone.metadata) }

  if (hidden) {
    metadata[ZONE_LABEL_HIDDEN_KEY] = true
  } else {
    delete metadata[ZONE_LABEL_HIDDEN_KEY]
  }

  return metadata as ZoneNode['metadata']
}
