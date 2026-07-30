import type {
  AnyNode,
  FeatureCut,
  FeatureDefinition,
  FeatureNode,
  FeatureProfile,
  FeatureStep,
  SketchCircleNode,
  SketchLineNode,
} from '@pascal-app/core'
import { detectClosedSketchProfiles, type SketchProfile } from './sketch-geometry'

type FeatureProfileReference = {
  lineIds: readonly string[]
  circleIds?: readonly string[]
  points: readonly [number, number][]
}

export type SourceStatus = {
  canRefresh: boolean
  label: string
  tone: 'ok' | 'warning' | 'danger'
}

const SOURCE_MISSING_MESSAGE = '来源草图缺失，保留上次快照。'
const SOURCE_OPEN_MESSAGE = '来源草图未闭合，保留上次快照。'
const SOURCE_SYNCED_MESSAGE = '已自动同步来源草图。'
const SOURCE_MESSAGES = new Set([
  SOURCE_MISSING_MESSAGE,
  SOURCE_OPEN_MESSAGE,
  SOURCE_SYNCED_MESSAGE,
])

export function haveSameLineIds(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length) return false
  const secondIds = new Set(second)
  return first.every((id) => secondIds.has(id))
}

export function haveSameProfilePoints(
  first: readonly [number, number][],
  second: readonly [number, number][],
) {
  if (first.length !== second.length) return false

  return first.every((point, index) => {
    const other = second[index]
    if (!other) return false
    return Math.hypot(point[0] - other[0], point[1] - other[1]) <= 1e-4
  })
}

function haveSameCircleIds(first: readonly string[] = [], second: readonly string[] = []) {
  return haveSameLineIds(first, second)
}

function haveSameProfileSource(first: FeatureProfileReference, second: FeatureProfileReference) {
  return (
    haveSameLineIds(first.lineIds, second.lineIds) &&
    haveSameCircleIds(first.circleIds ?? [], second.circleIds ?? [])
  )
}

function hasProfileSource(profile: FeatureProfileReference) {
  return profile.lineIds.length > 0 || (profile.circleIds?.length ?? 0) > 0
}

function haveSameJsonValue(first: unknown, second: unknown) {
  return JSON.stringify(first) === JSON.stringify(second)
}

export function getSourceSketchLines(
  nodes: Record<string, AnyNode>,
  lineIds: readonly string[],
): SketchLineNode[] {
  return lineIds
    .map((lineId) => nodes[lineId])
    .filter((line): line is SketchLineNode => line?.type === 'sketch-line')
}

function getSourceSketchCircles(
  nodes: Record<string, AnyNode>,
  circleIds: readonly string[] = [],
): SketchCircleNode[] {
  return circleIds
    .map((circleId) => nodes[circleId])
    .filter((circle): circle is SketchCircleNode => circle?.type === 'sketch-circle')
}

export function syncFeatureProfileFromSketchProfile(
  profile: SketchProfile,
  previous: FeatureProfile,
): FeatureProfile {
  return {
    ...previous,
    lineIds: profile.lineIds,
    circleIds: profile.circleIds ?? [],
    points: profile.points,
    holes:
      profile.holes?.map((hole) => ({
        kind: 'sketch-profile',
        lineIds: hole.lineIds,
        circleIds: hole.circleIds ?? [],
        points: hole.points,
      })) ?? [],
  }
}

export function rebuildProfileFromSourceGeometry(
  nodes: Record<string, AnyNode>,
  profile: FeatureProfileReference,
): SketchProfile | null {
  const lineIds = profile.lineIds
  const circleIds = profile.circleIds ?? []
  const sourceLines = getSourceSketchLines(nodes, lineIds)
  const sourceCircles = getSourceSketchCircles(nodes, circleIds)
  if (sourceLines.length !== lineIds.length || sourceCircles.length !== circleIds.length) {
    return null
  }

  if (sourceLines.length + sourceCircles.length === 0) {
    return null
  }

  return (
    detectClosedSketchProfiles(sourceLines, sourceCircles).find((candidate) =>
      haveSameProfileSource(candidate, profile),
    ) ?? null
  )
}

export function getSourceStatus(
  nodes: Record<string, AnyNode>,
  profile: FeatureProfileReference,
): SourceStatus {
  const lineIds = profile.lineIds
  const circleIds = profile.circleIds ?? []
  const sourceLines = getSourceSketchLines(nodes, lineIds)
  const sourceCircles = getSourceSketchCircles(nodes, circleIds)
  if (sourceLines.length !== lineIds.length || sourceCircles.length !== circleIds.length) {
    return { canRefresh: false, label: '来源缺失', tone: 'danger' }
  }

  const rebuiltProfile = rebuildProfileFromSourceGeometry(nodes, profile)
  if (!rebuiltProfile) {
    return { canRefresh: false, label: '未闭合', tone: 'warning' }
  }

  if (
    haveSameProfileSource(rebuiltProfile, profile) &&
    haveSameProfilePoints(rebuiltProfile.points, profile.points)
  ) {
    return { canRefresh: false, label: '已同步', tone: 'ok' }
  }

  return { canRefresh: true, label: '可更新', tone: 'warning' }
}

function isRevolveAxisLineCandidate(line: SketchLineNode) {
  const dx = Math.abs(line.end[0] - line.start[0])
  const dy = Math.abs(line.end[1] - line.start[1])
  return Boolean(line.construction && dy > 1e-4 && dx <= 1e-4)
}

function getRevolveAxisXFromLine(line: SketchLineNode | null) {
  if (!line) return null
  return (line.start[0] + line.end[0]) / 2
}

function getRevolveAxisLine(
  nodes: Record<string, AnyNode>,
  lineId: string | undefined,
): SketchLineNode | null {
  if (!lineId) return null
  const line = nodes[lineId]
  return line?.type === 'sketch-line' ? line : null
}

function buildProfileReferences(profile: FeatureProfile) {
  return [
    ...profile.lineIds.map((lineId) => ({
      id: lineId,
      role: 'profile-line',
      status: 'resolved' as const,
    })),
    ...(profile.circleIds ?? []).map((circleId) => ({
      id: circleId,
      role: 'profile-circle',
      status: 'resolved' as const,
    })),
  ]
}

function syncStepProfile(step: FeatureStep, previous: FeatureProfile, next: FeatureProfile) {
  if (!('profile' in step) || !haveSameProfileSource(step.profile, previous)) {
    return step
  }

  return {
    ...step,
    profile: next,
    references: buildProfileReferences(next),
    rebuild: { status: 'ok' as const, message: SOURCE_SYNCED_MESSAGE },
  } as FeatureStep
}

function rebuildStepProfileFromSource(step: FeatureStep, nodes: Record<string, AnyNode>) {
  if (!('profile' in step)) {
    return step
  }

  const rebuiltProfile = rebuildProfileFromSourceGeometry(nodes, step.profile)
  if (!rebuiltProfile || haveSameProfilePoints(rebuiltProfile.points, step.profile.points)) {
    return step
  }

  const nextProfile = syncFeatureProfileFromSketchProfile(rebuiltProfile, step.profile)
  return {
    ...step,
    profile: nextProfile,
    references: buildProfileReferences(nextProfile),
    rebuild: { status: 'ok' as const, message: SOURCE_SYNCED_MESSAGE },
  } as FeatureStep
}

function getProfileSourceIssue(nodes: Record<string, AnyNode>, profile: FeatureProfileReference) {
  if (!hasProfileSource(profile)) {
    return null
  }

  const status = getSourceStatus(nodes, profile)
  if (status.tone === 'danger') {
    return {
      status: 'failed' as const,
      message: SOURCE_MISSING_MESSAGE,
    }
  }

  if (status.label === '未闭合') {
    return {
      status: 'warning' as const,
      message: SOURCE_OPEN_MESSAGE,
    }
  }

  return null
}

function markStepSourceState(step: FeatureStep, nodes: Record<string, AnyNode>) {
  if (!('profile' in step)) {
    return step
  }

  const issue = getProfileSourceIssue(nodes, step.profile)
  if (!issue) {
    if (SOURCE_MESSAGES.has(step.rebuild.message ?? '')) {
      return {
        ...step,
        rebuild: {
          ...step.rebuild,
          status: 'ok',
          message: SOURCE_SYNCED_MESSAGE,
        },
      } as FeatureStep
    }

    return step
  }

  return {
    ...step,
    rebuild: {
      ...step.rebuild,
      status: issue.status,
      message: issue.message,
    },
  } as FeatureStep
}

function getDefinitionStatus(
  steps: readonly FeatureStep[],
): FeatureDefinition['rebuild']['status'] {
  if (steps.some((step) => step.rebuild.status === 'failed')) {
    return 'failed'
  }

  if (steps.some((step) => step.rebuild.status === 'warning')) {
    return 'warning'
  }

  return 'ok'
}

function syncFeatureDefinition(
  feature: FeatureNode,
  updates: Partial<FeatureNode>,
  nodes: Record<string, AnyNode>,
): FeatureDefinition | undefined {
  if (!feature.definition) {
    return undefined
  }

  const nextFeature = { ...feature, ...updates }
  const definition = feature.definition
  const previousProfile = feature.profile
  const nextProfile = updates.profile ?? feature.profile
  const nextCuts = updates.cuts ?? feature.cuts
  const previousCuts = feature.cuts

  const nextDefinition: FeatureDefinition = {
    ...definition,
    steps: definition.steps.map((step) => {
      let nextStep = syncStepProfile(step, previousProfile, nextProfile)
      for (let index = 0; index < previousCuts.length; index += 1) {
        const previousCut = previousCuts[index]
        const nextCut = nextCuts[index]
        if (previousCut && nextCut) {
          nextStep = syncStepProfile(nextStep, previousCut.profile, nextCut.profile)
        }
      }

      if (nextStep.kind === 'extrude') {
        return markStepSourceState(
          {
            ...nextStep,
            depth: nextFeature.depth,
            baseElevation: nextFeature.baseElevation,
          },
          nodes,
        )
      }

      if (nextStep.kind === 'revolve') {
        return markStepSourceState(
          {
            ...nextStep,
            baseElevation: nextFeature.baseElevation,
            revolveAxisX: nextFeature.revolveAxisX,
            revolveAxisLineId: nextFeature.revolveAxisLineId,
            revolveAngle: nextFeature.revolveAngle,
          },
          nodes,
        )
      }

      return markStepSourceState(rebuildStepProfileFromSource(nextStep, nodes), nodes)
    }),
    bodies: definition.bodies.map((body, index) =>
      index === 0
        ? {
            ...body,
            profile: nextProfile,
            depth: nextFeature.depth,
            baseElevation: nextFeature.baseElevation,
          }
        : body,
    ),
    rebuild: { status: 'ok', message: '已自动同步来源草图。' },
  }

  const nextDefinitionWithStatus: FeatureDefinition = {
    ...nextDefinition,
    rebuild: {
      status: getDefinitionStatus(nextDefinition.steps),
      message:
        getDefinitionStatus(nextDefinition.steps) === 'failed'
          ? '存在来源缺失的特征步骤。'
          : getDefinitionStatus(nextDefinition.steps) === 'warning'
            ? '存在来源未闭合的特征步骤。'
            : SOURCE_SYNCED_MESSAGE,
    },
  }

  return haveSameJsonValue(nextDefinitionWithStatus, definition)
    ? undefined
    : nextDefinitionWithStatus
}

export function buildFeatureSourceSyncUpdate(
  feature: FeatureNode,
  nodes: Record<string, AnyNode>,
): Partial<FeatureNode> | null {
  const updates: Partial<FeatureNode> = {}
  const rebuiltProfile = rebuildProfileFromSourceGeometry(nodes, feature.profile)

  if (rebuiltProfile && !haveSameProfilePoints(rebuiltProfile.points, feature.profile.points)) {
    updates.profile = syncFeatureProfileFromSketchProfile(rebuiltProfile, feature.profile)
  }

  const nextCuts = feature.cuts.map((cut): FeatureCut => {
    const rebuiltCutProfile = rebuildProfileFromSourceGeometry(nodes, cut.profile)
    if (!rebuiltCutProfile || haveSameProfilePoints(rebuiltCutProfile.points, cut.profile.points)) {
      return cut
    }

    return {
      ...cut,
      profile: syncFeatureProfileFromSketchProfile(rebuiltCutProfile, cut.profile),
    }
  })
  if (nextCuts.some((cut, index) => cut !== feature.cuts[index])) {
    updates.cuts = nextCuts
  }

  if (feature.kind === 'revolve' && feature.revolveAxisLineId) {
    const axisLine = getRevolveAxisLine(nodes, feature.revolveAxisLineId)
    if (axisLine && isRevolveAxisLineCandidate(axisLine)) {
      const nextAxisX = getRevolveAxisXFromLine(axisLine)
      if (nextAxisX !== null && Math.abs(nextAxisX - (feature.revolveAxisX ?? 0)) > 1e-4) {
        updates.revolveAxisX = nextAxisX
      }
    }
  }

  const definition = syncFeatureDefinition(feature, updates, nodes)
  if (definition && definition !== feature.definition) {
    updates.definition = definition
  }

  if (Object.keys(updates).length === 0) {
    return null
  }

  return updates
}

export function buildFeatureSourceSyncUpdates(nodes: Record<string, AnyNode>) {
  return Object.values(nodes)
    .filter((node): node is FeatureNode => node?.type === 'feature')
    .map((feature) => ({
      id: feature.id,
      data: buildFeatureSourceSyncUpdate(feature, nodes),
    }))
    .filter((update): update is { id: FeatureNode['id']; data: Partial<FeatureNode> } =>
      Boolean(update.data),
    )
}
