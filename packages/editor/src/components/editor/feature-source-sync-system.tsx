'use client'

import { type AnyNode, type AnyNodeId, useScene } from '@pascal-app/core'
import { useEffect } from 'react'
import { buildFeatureSourceSyncUpdates } from '../tools/sketch/feature-source-sync'

export function FeatureSourceSyncSystem() {
  const nodes = useScene((state) => state.nodes as Record<string, AnyNode>)
  const updateNodes = useScene((state) => state.updateNodes)

  useEffect(() => {
    const updates = buildFeatureSourceSyncUpdates(nodes)
    if (updates.length === 0) {
      return
    }

    updateNodes(
      updates.map((update) => ({
        id: update.id as AnyNodeId,
        data: update.data as Partial<AnyNode>,
      })),
    )
  }, [nodes, updateNodes])

  return null
}
