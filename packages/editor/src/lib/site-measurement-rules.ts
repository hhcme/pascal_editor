'use client'

import type { SiteNode } from '@pascal-app/core'

const SITE_SETBACK_RULES_KEY = 'measurementSetbackRulesV1'

export type SiteSetbackRuleKey = 'front' | 'back' | 'left' | 'right'

export type SiteSetbackRules = Partial<Record<SiteSetbackRuleKey, number>>

function getMetadataObject(metadata: SiteNode['metadata']): Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

function normalizeRuleValue(value: unknown) {
  if (!(typeof value === 'number' && Number.isFinite(value) && value > 0.0001)) {
    return null
  }

  return value
}

export function getSiteSetbackRules(
  site: Pick<SiteNode, 'metadata'> | null | undefined,
): SiteSetbackRules {
  const metadata = getMetadataObject(site?.metadata ?? {})
  const rawRules = metadata[SITE_SETBACK_RULES_KEY]
  if (!(typeof rawRules === 'object' && rawRules !== null && !Array.isArray(rawRules))) {
    return {}
  }

  const rules = rawRules as Record<string, unknown>

  return {
    front: normalizeRuleValue(rules.front) ?? undefined,
    back: normalizeRuleValue(rules.back) ?? undefined,
    left: normalizeRuleValue(rules.left) ?? undefined,
    right: normalizeRuleValue(rules.right) ?? undefined,
  }
}

export function withSiteSetbackRule(
  site: Pick<SiteNode, 'metadata'>,
  key: SiteSetbackRuleKey,
  value: number,
): SiteNode['metadata'] {
  const metadata = getMetadataObject(site.metadata)
  const currentRules = getSiteSetbackRules(site)
  const normalized = normalizeRuleValue(value)
  const nextRules: SiteSetbackRules = {
    ...currentRules,
    [key]: normalized ?? undefined,
  }

  const filteredRules = Object.fromEntries(
    Object.entries(nextRules).filter(([, entry]) => typeof entry === 'number'),
  )

  if (Object.keys(filteredRules).length === 0) {
    const nextMetadata = { ...metadata }
    delete nextMetadata[SITE_SETBACK_RULES_KEY]
    return nextMetadata as SiteNode['metadata']
  }

  return {
    ...metadata,
    [SITE_SETBACK_RULES_KEY]: filteredRules,
  } as SiteNode['metadata']
}
