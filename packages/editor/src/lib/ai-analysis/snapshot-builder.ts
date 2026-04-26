import {
  getAiAnalysisIssueDefinition,
  type AiAnalysisIssueCode,
  type AiAnalysisIssueScope,
  type AiAnalysisIssueSeverity,
} from './issue-codes'
import type {
  AiAnalysisIssue,
  AiAnalysisSnapshot,
  CreateAiAnalysisSnapshotInput,
} from './snapshot-types'

export type CreateAiAnalysisIssueInput = {
  code: AiAnalysisIssueCode
  targetId?: string | null
  message?: string
  metricValue?: number | null
  severity?: AiAnalysisIssueSeverity
  scope?: AiAnalysisIssueScope
  relatedIds?: string[]
  sourceProfileIds?: string[]
}

export function createAiAnalysisSnapshot(
  input: CreateAiAnalysisSnapshotInput,
): AiAnalysisSnapshot {
  return {
    version: 'ai-analysis:v1',
    source: input.source,
    unit: input.unit ?? 'metric',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    buildingId: input.buildingId ?? null,
    levelCount: input.levels?.length ?? 0,
    activeProfileIds: input.activeProfileIds ?? [],
    householdBrief: input.householdBrief ?? null,
    site: input.site ?? null,
    building: input.building ?? null,
    levels: input.levels ?? [],
    issues: input.issues ?? [],
  }
}

export function createAiAnalysisIssue(
  input: CreateAiAnalysisIssueInput,
): AiAnalysisIssue {
  const definition = getAiAnalysisIssueDefinition(input.code)

  return {
    scope: input.scope ?? definition.scope,
    targetId: input.targetId ?? null,
    code: input.code,
    severity: input.severity ?? definition.severity,
    message: input.message ?? definition.summary,
    metricValue: input.metricValue ?? null,
    relatedIds: input.relatedIds,
    sourceProfileIds: input.sourceProfileIds,
  }
}

export function appendAiAnalysisIssues(
  snapshot: AiAnalysisSnapshot,
  issues: AiAnalysisIssue[],
): AiAnalysisSnapshot {
  return {
    ...snapshot,
    issues: [...snapshot.issues, ...issues],
  }
}
