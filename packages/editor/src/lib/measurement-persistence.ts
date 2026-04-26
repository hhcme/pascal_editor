'use client'

import type { SiteNode } from '@pascal-app/core'

const MEASUREMENT_SITE_METADATA_KEY = 'measurementAnnotationsV1'

export type SavedGridMeasurementGroup = {
  id: string
  createdAt: number
  nodeIds: string[]
}

function getMetadataObject(metadata: SiteNode['metadata']): Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

function normalizeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function normalizeGridRecord(value: unknown): SavedGridMeasurementGroup | null {
  if (!(typeof value === 'object' && value !== null)) return null

  const candidate = value as Record<string, unknown>
  if (
    candidate.kind !== 'grid' ||
    !Array.isArray(candidate.nodeIds) ||
    !candidate.nodeIds.every((entry) => typeof entry === 'string')
  ) {
    return null
  }

  const nodeIds = Array.from(new Set(candidate.nodeIds as string[])).sort()
  if (nodeIds.length < 2) return null

  const id = typeof candidate.id === 'string' ? candidate.id : `grid:${nodeIds.join('|')}`
  return {
    id,
    createdAt: normalizeTimestamp(candidate.createdAt),
    nodeIds,
  }
}

export function getSavedGridMeasurementGroups(
  site: Pick<SiteNode, 'metadata'> | null | undefined,
): SavedGridMeasurementGroup[] {
  const metadata = getMetadataObject(site?.metadata ?? {})
  const raw = metadata[MEASUREMENT_SITE_METADATA_KEY]

  if (!(typeof raw === 'object' && raw !== null && !Array.isArray(raw))) {
    return []
  }

  const snapshot = raw as Record<string, unknown>
  if (!Array.isArray(snapshot.pinnedRecords)) return []

  return snapshot.pinnedRecords
    .map((entry) => normalizeGridRecord(entry))
    .filter((entry): entry is SavedGridMeasurementGroup => Boolean(entry))
}
