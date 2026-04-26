import type {
  AiAnalysisIssueCode,
  AiAnalysisIssueScope,
  AiAnalysisIssueSeverity,
  AiAnalysisSnapshot,
} from '@pascal-app/editor'

export type AiRuleSourceKind = 'mandatory' | 'reference'
export type AiScoreDimensionKey =
  | 'program_fit'
  | 'zoning_privacy'
  | 'circulation'
  | 'furniture_fit'
  | 'daylight_ventilation'
  | 'storage_chores'
  | 'accessibility_lifecycle'
  | 'adaptability'

type AiRulePrimitive = string | number | boolean | null
export type AiRuleValue = AiRulePrimitive | AiRuleValue[] | { [key: string]: AiRuleValue }

export type AiRuleSourceProfile = {
  id: string
  region: string
  kind: AiRuleSourceKind
  effectiveDate: string
  sourceUrls: string[]
  rules: Record<string, AiRuleValue>
}

export type AiScoreWeights = Record<AiScoreDimensionKey, number>

export type AiFengShuiEvidenceLevel =
  | 'A_ENVIRONMENT_OVERLAP'
  | 'B_TRADITIONAL_STRONG'
  | 'C_SYMBOLIC_OPTIONAL'

export type AiFengShuiRuleGroup =
  | 'site_form'
  | 'entry_flow'
  | 'public_private_zoning'
  | 'living_bedroom_stability'
  | 'kitchen_toilet'
  | 'environmental_comfort'
  | 'maintenance_state'
  | 'advanced_symbolic'

export type AiFengShuiImplementationStage =
  | 'implemented_bridge'
  | 'future_detection'
  | 'optional_research_only'

export type AiFengShuiSeverity = 'low' | 'medium' | 'high'

export type AiFengShuiAdvisoryDefinition = {
  code: string
  group: AiFengShuiRuleGroup
  evidenceLevel: AiFengShuiEvidenceLevel
  defaultEnabled: boolean
  severity: AiFengShuiSeverity
  implementationStage: AiFengShuiImplementationStage
  scoringDimensions: AiScoreDimensionKey[]
  linkedIssueCodes: AiAnalysisIssueCode[]
  detectionFocus: string[]
  repairHints: string[]
  traditionalRationale: string
  modernRationale: string
  userFacingLabels: {
    traditional: string
    modern: string
  }
}

export type AiFengShuiRoomRef = {
  level: number
  roomKey: string
  roomName: string
}

export type AiFengShuiAdvisory = AiFengShuiAdvisoryDefinition & {
  relatedIssueCodes: AiAnalysisIssueCode[]
  relatedTargetIds: string[]
  relatedMessages: string[]
  roomRefs: AiFengShuiRoomRef[]
}

export type AiNegativePatternDefinition = {
  code: AiAnalysisIssueCode
  severity: 'medium' | 'high'
  detectionFocus: string[]
  repairHints: string[]
}

export type AiRuleRegistry = {
  version: string
  notes: string[]
  sourceProfiles: AiRuleSourceProfile[]
  scoreWeights: AiScoreWeights
  householdAxes: string[]
  negativePatterns: AiNegativePatternDefinition[]
}

export type AiConstraintViolation = {
  code: AiAnalysisIssueCode
  scope: AiAnalysisIssueScope
  severity: AiAnalysisIssueSeverity
  message: string
  targetId: string | null
  sourceProfileIds: string[]
  metricValue: number | null
  fengShuiAdvisories: AiFengShuiAdvisoryDefinition[]
}

export type AiConstraintDimensionScore = {
  key: AiScoreDimensionKey
  score: number
  maxScore: number
  notes: string[]
}

export type AiConstraintEvaluation = {
  registryVersion: string
  activeProfileIds: string[]
  passed: boolean
  hardFailures: AiConstraintViolation[]
  warnings: AiConstraintViolation[]
  dimensionScores: AiConstraintDimensionScore[]
  totalScore: number
  maxScore: number
  fengShuiAdvisories: AiFengShuiAdvisory[]
}

export type AiConstraintEvaluationInput = {
  snapshot: AiAnalysisSnapshot
  registry: AiRuleRegistry
  activeProfileIds: string[]
}

export function getAiScoreWeightTotal(weights: AiScoreWeights) {
  return Object.values(weights).reduce((sum, value) => sum + value, 0)
}

export function createEmptyAiConstraintEvaluation(
  registry: AiRuleRegistry,
  activeProfileIds: string[],
): AiConstraintEvaluation {
  const maxScore = getAiScoreWeightTotal(registry.scoreWeights)

  return {
    registryVersion: registry.version,
    activeProfileIds,
    passed: true,
    hardFailures: [],
    warnings: [],
    dimensionScores: [],
    totalScore: maxScore,
    maxScore,
    fengShuiAdvisories: [],
  }
}
