import type {
  FeatureCut,
  FeatureDefinition,
  FeatureBody,
  FeatureCombineStep,
  FeatureExtrudeCutStep,
  FeatureExtrudeStep,
  FeatureDraftStep,
  FeatureEdgeTreatmentStep,
  FeatureHoleStep,
  FeatureShellStep,
  FeatureMirrorStep,
  FeatureNode,
  FeaturePatternStep,
  FeatureProfile,
  FeatureReferenceGeometry,
  FeatureRevolveStep,
  FeatureStep,
  FeatureSweepStep,
  FeatureLoftStep,
} from '../../schema'
import { generateId } from '../../schema/base'

export type RenderableFeatureStep = FeatureExtrudeStep | FeatureRevolveStep

export type FeatureRebuildOptions = {
  existingNodeIds?: ReadonlySet<string> | readonly string[]
  sourceProfile?: FeatureProfile
  depth?: number
  baseElevation?: number
  rebuiltAt?: string
}

export function createFeatureDefinitionFromLegacyNode(node: FeatureNode): FeatureDefinition {
  const baseStep =
    node.kind === 'revolve'
      ? ({
          id: generateId('feature_step'),
          kind: 'revolve',
          name: '旋转',
          operation: 'add',
          profile: node.profile,
          baseElevation: node.baseElevation,
          revolveAxisX: node.revolveAxisX,
          revolveAxisLineId: node.revolveAxisLineId,
          revolveAngle: node.revolveAngle,
          suppressed: false,
          references: buildProfileReferences(node.profile),
          rebuild: { status: 'ok' },
        } satisfies FeatureRevolveStep)
      : ({
          id: generateId('feature_step'),
          kind: 'extrude',
          name: '拉伸',
          operation: 'add',
          profile: node.profile,
          depth: node.depth,
          baseElevation: node.baseElevation,
          suppressed: false,
          references: buildProfileReferences(node.profile),
          rebuild: { status: 'ok' },
        } satisfies FeatureExtrudeStep)

  const cutSteps = node.cuts.map((cut, index) => createExtrudeCutStepFromLegacyCut(cut, index))

  return {
    version: 1,
    autoRebuild: false,
    steps: [baseStep, ...cutSteps],
    bodies: [createDefaultFeatureBody([baseStep.id], node.profile, node.depth, node.baseElevation)],
    referenceGeometry: [],
    rebuild: { status: 'ok' },
  }
}

export function getFeatureDefinition(node: FeatureNode): FeatureDefinition {
  return node.definition ?? createFeatureDefinitionFromLegacyNode(node)
}

export function getRenderableFeatureStep(node: FeatureNode): RenderableFeatureStep | null {
  const definition = getFeatureDefinition(node)
  const primary = definition.steps.find((step) => !step.suppressed)
  if (primary?.kind === 'extrude' || primary?.kind === 'revolve') {
    return primary
  }

  return node.kind === 'revolve'
    ? {
        id: generateId('feature_step'),
        kind: 'revolve',
        name: '旋转',
        operation: 'add',
        profile: node.profile,
        baseElevation: node.baseElevation,
        revolveAxisX: node.revolveAxisX,
        revolveAxisLineId: node.revolveAxisLineId,
        revolveAngle: node.revolveAngle,
        suppressed: false,
        references: buildProfileReferences(node.profile),
        rebuild: { status: 'ok' },
      }
    : {
        id: generateId('feature_step'),
        kind: 'extrude',
        name: '拉伸',
        operation: 'add',
        profile: node.profile,
        depth: node.depth,
        baseElevation: node.baseElevation,
        suppressed: false,
        references: buildProfileReferences(node.profile),
        rebuild: { status: 'ok' },
      }
}

export function getExtrudeCutSteps(node: FeatureNode): FeatureExtrudeCutStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureExtrudeCutStep => !step.suppressed && step.kind === 'extrude-cut',
  )
}

export function getHoleSteps(node: FeatureNode): FeatureHoleStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureHoleStep => !step.suppressed && step.kind === 'hole',
  )
}

export function getMirrorSteps(node: FeatureNode): FeatureMirrorStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureMirrorStep => !step.suppressed && step.kind === 'mirror',
  )
}

export function getPatternSteps(node: FeatureNode): FeaturePatternStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeaturePatternStep =>
      !step.suppressed && (step.kind === 'linear-pattern' || step.kind === 'circular-pattern'),
  )
}

export function getSweepSteps(node: FeatureNode): FeatureSweepStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureSweepStep => !step.suppressed && step.kind === 'sweep',
  )
}

export function getLoftSteps(node: FeatureNode): FeatureLoftStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureLoftStep => !step.suppressed && step.kind === 'loft',
  )
}

export function getEdgeTreatmentSteps(node: FeatureNode): FeatureEdgeTreatmentStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureEdgeTreatmentStep =>
      !step.suppressed && (step.kind === 'fillet' || step.kind === 'chamfer'),
  )
}

export function getShellSteps(node: FeatureNode): FeatureShellStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureShellStep => !step.suppressed && step.kind === 'shell',
  )
}

export function getDraftSteps(node: FeatureNode): FeatureDraftStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureDraftStep => !step.suppressed && step.kind === 'draft',
  )
}

export function getCombineSteps(node: FeatureNode): FeatureCombineStep[] {
  return getFeatureDefinition(node).steps.filter(
    (step): step is FeatureCombineStep => !step.suppressed && step.kind === 'combine',
  )
}

export function getFeatureTimelineSteps(node: FeatureNode): FeatureStep[] {
  return getFeatureDefinition(node).steps
}

export function createExtrudeCutStepFromProfile(
  profile: FeatureProfile,
  index: number,
): FeatureStep {
  return {
    id: generateId('feature_step'),
    kind: 'extrude-cut',
    name: `切割 ${index + 1}`,
    operation: 'subtract',
    profile,
    targetIds: [],
    throughAll: true,
    suppressed: false,
    references: buildProfileReferences(profile),
    rebuild: { status: 'ok' },
  }
}

function createExtrudeCutStepFromLegacyCut(cut: FeatureCut, index: number): FeatureStep {
  return createExtrudeCutStepFromProfile(cut.profile, index)
}

export function createHoleStep(args: {
  center: [number, number]
  diameter: number
  index: number
}): FeatureHoleStep {
  return {
    id: generateId('feature_step'),
    kind: 'hole',
    name: `孔 ${args.index + 1}`,
    operation: 'subtract',
    targetIds: [],
    center: args.center,
    diameter: args.diameter,
    endCondition: 'through-all',
    holeKind: 'simple',
    suppressed: false,
    references: [],
    rebuild: { status: 'ok' },
  }
}

export function createMirrorStep(index: number, mirrorPlaneId?: string): FeatureMirrorStep {
  return {
    id: generateId('feature_step'),
    kind: 'mirror',
    name: `镜像 ${index + 1}`,
    operation: 'add',
    sourceStepIds: [],
    mirrorPlaneId: mirrorPlaneId as FeatureMirrorStep['mirrorPlaneId'],
    suppressed: false,
    references: [],
    rebuild: { status: 'ok', message: 'V1 uses the world YZ plane as the mirror plane.' },
  }
}

export function createLinearPatternStep(index: number): FeaturePatternStep {
  return {
    id: generateId('feature_step'),
    kind: 'linear-pattern',
    name: `线性阵列 ${index + 1}`,
    operation: 'add',
    sourceStepIds: [],
    count: 3,
    spacing: 1,
    skippedInstances: [],
    suppressed: false,
    references: [],
    rebuild: { status: 'ok' },
  }
}

export function createCircularPatternStep(index: number): FeaturePatternStep {
  return {
    id: generateId('feature_step'),
    kind: 'circular-pattern',
    name: `圆周阵列 ${index + 1}`,
    operation: 'add',
    sourceStepIds: [],
    count: 4,
    angle: Math.PI * 2,
    skippedInstances: [],
    suppressed: false,
    references: [],
    rebuild: { status: 'ok', message: 'V1 rotates instances around the feature origin.' },
  }
}

export function getFeatureProfileCenter(profile: FeatureProfile): [number, number] {
  if (profile.points.length === 0) return [0, 0]

  let x = 0
  let z = 0
  for (const point of profile.points) {
    x += point[0]
    z += point[1]
  }

  return [x / profile.points.length, z / profile.points.length]
}

export function createDefaultSweepStep(profile: FeatureProfile, index: number): FeatureSweepStep {
  return {
    id: generateId('feature_step'),
    kind: 'sweep',
    name: `扫描 ${index + 1}`,
    operation: 'add',
    profile,
    pathLineIds: [],
    pathPoints: [
      [0, 0, 0],
      [1.5, 0.8, 0],
      [3, 0, 0],
    ],
    twistMode: 'keep-normal',
    suppressed: false,
    references: buildProfileReferences(profile),
    rebuild: { status: 'ok', message: 'V1 uses a default 3-point sweep path.' },
  }
}

export function createDefaultLoftStep(profile: FeatureProfile, index: number): FeatureLoftStep {
  const center = getFeatureProfileCenter(profile)
  const upperProfile: FeatureProfile = {
    ...profile,
    lineIds: [],
    points: profile.points.map(([x, z]) => [
      center[0] + (x - center[0]) * 0.65,
      center[1] + (z - center[1]) * 0.65,
    ]),
  }

  return {
    id: generateId('feature_step'),
    kind: 'loft',
    name: `放样 ${index + 1}`,
    operation: 'add',
    profiles: [profile, upperProfile],
    guideLineIds: [],
    suppressed: false,
    references: buildProfileReferences(profile),
    rebuild: { status: 'ok', message: 'V1 creates a two-section loft from the source profile.' },
  }
}

export function createDefaultFilletStep(index: number): FeatureEdgeTreatmentStep {
  return {
    id: generateId('feature_step'),
    kind: 'fillet',
    name: `圆角 ${index + 1}`,
    operation: 'add',
    targetIds: [],
    edgeIds: [],
    radius: 0.08,
    suppressed: false,
    references: [],
    rebuild: { status: 'ok', message: 'V1 applies a uniform bevel preview.' },
  }
}

export function createDefaultChamferStep(index: number): FeatureEdgeTreatmentStep {
  return {
    id: generateId('feature_step'),
    kind: 'chamfer',
    name: `倒角 ${index + 1}`,
    operation: 'add',
    targetIds: [],
    edgeIds: [],
    distance: 0.08,
    angle: 45,
    suppressed: false,
    references: [],
    rebuild: { status: 'ok', message: 'V1 applies a uniform bevel preview.' },
  }
}

export function createDefaultShellStep(index: number): FeatureShellStep {
  return {
    id: generateId('feature_step'),
    kind: 'shell',
    name: `抽壳 ${index + 1}`,
    operation: 'add',
    targetIds: [],
    openFaceIds: [],
    thickness: 0.15,
    direction: 'inside',
    suppressed: false,
    references: [],
    rebuild: { status: 'ok', message: 'V1 hollows the profile using a centered inset.' },
  }
}

export function createDefaultDraftStep(index: number): FeatureDraftStep {
  return {
    id: generateId('feature_step'),
    kind: 'draft',
    name: `拔模 ${index + 1}`,
    operation: 'add',
    targetIds: [],
    faceIds: [],
    angle: 5,
    suppressed: false,
    references: [],
    rebuild: { status: 'ok', message: 'V1 tapers the top section around the profile center.' },
  }
}

export function createDefaultFeatureBody(
  sourceStepIds: string[] = [],
  profile?: FeatureProfile,
  depth?: number,
  baseElevation?: number,
): FeatureBody {
  return {
    id: generateId('feature_body'),
    name: '实体 1',
    sourceStepIds,
    profile,
    depth,
    baseElevation,
    visible: true,
  }
}

export function createReferencePlane(index: number): FeatureReferenceGeometry {
  return {
    id: generateId('feature_ref'),
    kind: 'plane',
    name: `基准面 ${index + 1}`,
    origin: [0, 0, 0],
    normal: [1, 0, 0],
    offset: 0,
  }
}

export function createReferenceAxis(index: number): FeatureReferenceGeometry {
  return {
    id: generateId('feature_ref'),
    kind: 'axis',
    name: `基准轴 ${index + 1}`,
    origin: [0, 0, 0],
    direction: [0, 1, 0],
  }
}

export function createReferencePoint(index: number): FeatureReferenceGeometry {
  return {
    id: generateId('feature_ref'),
    kind: 'point',
    name: `基准点 ${index + 1}`,
    position: [0, 0, 0],
  }
}

export function ensureDefaultFeatureBody(definition: FeatureDefinition): FeatureDefinition {
  if (definition.bodies.length > 0) return definition
  const firstStep = definition.steps.find(
    (step) => step.kind === 'extrude' || step.kind === 'revolve',
  )
  return {
    ...definition,
    bodies: [createDefaultFeatureBody(firstStep ? [firstStep.id] : [])],
  }
}

export function createDerivedFeatureBody(
  index: number,
  sourceStepIds: string[] = [],
  profile?: FeatureProfile,
  depth?: number,
): FeatureBody {
  const span =
    profile && profile.points.length > 0
      ? profile.points.reduce(
          (bounds, [x]) => ({
            min: Math.min(bounds.min, x),
            max: Math.max(bounds.max, x),
          }),
          { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
        )
      : null
  const offsetX =
    span && Number.isFinite(span.min) && Number.isFinite(span.max)
      ? Math.max(1, span.max - span.min) + 0.75
      : 1.5

  return {
    id: generateId('feature_body'),
    name: `实体 ${index + 1}`,
    sourceStepIds,
    profile,
    depth,
    transform: profile
      ? {
          translation: [offsetX * index, 0, 0],
        }
      : undefined,
    visible: true,
  }
}

export function createCombineStep(args: {
  operation: 'add' | 'subtract' | 'intersect'
  targetBodyId: string
  toolBodyIds: string[]
  index: number
}): FeatureCombineStep {
  const operationLabel = args.operation === 'add' ? '合并' : args.operation === 'subtract' ? '相减' : '相交'
  return {
    id: generateId('feature_step'),
    kind: 'combine',
    name: `${operationLabel} ${args.index + 1}`,
    operation: args.operation,
    targetBodyId: args.targetBodyId,
    toolBodyIds: args.toolBodyIds,
    keepTools: false,
    suppressed: false,
    references: [
      { id: args.targetBodyId, role: 'target-body', status: 'resolved' },
      ...args.toolBodyIds.map((bodyId) => ({
        id: bodyId,
        role: 'target-body',
        status: 'resolved' as const,
      })),
    ],
    rebuild: { status: 'ok', message: 'V1 records body combine intent.' },
  }
}

export function setFeatureBodyVisible(
  definition: FeatureDefinition,
  bodyId: string,
  visible: boolean,
): FeatureDefinition {
  return {
    ...definition,
    bodies: definition.bodies.map((body) => (body.id === bodyId ? { ...body, visible } : body)),
    rebuild: { status: 'warning', message: '实体可见性已更新，等待重建。' },
  }
}

export function updateFeatureBodyTranslationX(
  definition: FeatureDefinition,
  bodyId: string,
  x: number,
): FeatureDefinition {
  return {
    ...definition,
    bodies: definition.bodies.map((body) =>
      body.id === bodyId
        ? {
            ...body,
            transform: {
              ...body.transform,
              translation: [
                x,
                body.transform?.translation[1] ?? 0,
                body.transform?.translation[2] ?? 0,
              ],
            },
          }
        : body,
    ),
    rebuild: { status: 'warning', message: '实体位置已更新，等待重建。' },
  }
}

export function deleteFeatureBody(definition: FeatureDefinition, bodyId: string): FeatureDefinition {
  if (definition.bodies.length <= 1) {
    return {
      ...definition,
      rebuild: { status: 'failed', message: '至少需要保留一个实体。' },
    }
  }

  const nextBodies = definition.bodies.filter((body) => body.id !== bodyId)
  const nextSteps: FeatureStep[] = []
  for (const step of definition.steps) {
    if (step.kind !== 'combine') {
      nextSteps.push(step)
      continue
    }

    if (step.targetBodyId === bodyId) continue

    const toolBodyIds = step.toolBodyIds.filter((toolBodyId) => toolBodyId !== bodyId)
    if (toolBodyIds.length === 0) continue

    nextSteps.push(
      {
        ...step,
        toolBodyIds,
        rebuild: { ...step.rebuild, status: 'warning', message: '实体删除后已更新组合引用。' },
      } as FeatureStep,
    )
  }

  return {
    ...definition,
    bodies: nextBodies,
    steps: nextSteps,
    rebuild: { status: 'warning', message: '实体已删除，相关组合步骤已清理。' },
  }
}

export function updateCombineStepBodies(
  definition: FeatureDefinition,
  stepId: string,
  updates: Partial<
    Pick<FeatureCombineStep, 'targetBodyId' | 'toolBodyIds' | 'keepTools' | 'operation'>
  >,
): FeatureDefinition {
  const bodyIds = new Set<string>(definition.bodies.map((body) => body.id))

  return {
    ...definition,
    steps: definition.steps.map((step) => {
      if (step.kind !== 'combine' || step.id !== stepId) return step

      const targetBodyId =
        updates.targetBodyId && bodyIds.has(updates.targetBodyId)
          ? updates.targetBodyId
          : step.targetBodyId
      const toolBodyIds = (updates.toolBodyIds ?? step.toolBodyIds).filter(
        (bodyId) => bodyId !== targetBodyId && bodyIds.has(bodyId),
      )

      return {
        ...step,
        ...updates,
        targetBodyId,
        toolBodyIds,
        references: [
          { id: targetBodyId, role: 'target-body', status: 'resolved' as const },
          ...toolBodyIds.map((bodyId) => ({
            id: bodyId,
            role: 'target-body',
            status: 'resolved' as const,
          })),
        ],
        rebuild: { ...step.rebuild, status: 'warning' as const, message: '组合参数已更新。' },
      }
    }),
    rebuild: { status: 'warning', message: '组合参数已更新，等待重建。' },
  }
}

export function setPatternInstanceSkipped(
  definition: FeatureDefinition,
  stepId: string,
  instanceIndex: number,
  skipped: boolean,
): FeatureDefinition {
  return {
    ...definition,
    steps: definition.steps.map((step) => {
      if (
        step.id !== stepId ||
        (step.kind !== 'linear-pattern' && step.kind !== 'circular-pattern')
      ) {
        return step
      }

      const normalizedIndex = Math.max(1, Math.round(instanceIndex))
      const existing = new Set(step.skippedInstances)
      if (skipped) {
        existing.add(normalizedIndex)
      } else {
        existing.delete(normalizedIndex)
      }

      return {
        ...step,
        skippedInstances: Array.from(existing)
          .filter((index) => index > 0 && index < step.count)
          .sort((first, second) => first - second),
        rebuild: { ...step.rebuild, status: 'warning' as const, message: '阵列跳过实例已更新。' },
      }
    }),
    rebuild: { status: 'warning', message: '阵列跳过实例已更新，等待重建。' },
  }
}

export function moveFeatureStep(
  definition: FeatureDefinition,
  stepId: string,
  direction: 'up' | 'down',
): FeatureDefinition {
  const currentIndex = definition.steps.findIndex((step) => step.id === stepId)
  if (currentIndex < 0) {
    return {
      ...definition,
      rebuild: { status: 'warning', message: '未找到要移动的特征步骤。' },
    }
  }

  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (nextIndex < 0 || nextIndex >= definition.steps.length) {
    return {
      ...definition,
      rebuild: { status: 'warning', message: '特征步骤已在边界位置。' },
    }
  }

  const steps = [...definition.steps]
  const current = steps[currentIndex]
  const next = steps[nextIndex]
  if (!(current && next)) return definition
  steps[currentIndex] = next
  steps[nextIndex] = current

  return {
    ...definition,
    steps,
    rebuild: { status: 'warning', message: '特征步骤顺序已更新，等待重建。' },
  }
}

export function diagnoseFeatureDefinition(
  definition: FeatureDefinition,
  existingNodeIds: ReadonlySet<string> | readonly string[] = [],
): FeatureDefinition {
  return rebuildFeatureDefinition(definition, { existingNodeIds })
}

export function rebuildFeatureDefinition(
  definition: FeatureDefinition,
  options: FeatureRebuildOptions = {},
): FeatureDefinition {
  const resolvedNodeIds =
    options.existingNodeIds instanceof Set
      ? options.existingNodeIds
      : new Set<string>(options.existingNodeIds ?? [])
  const stepIds = new Set(definition.steps.map((step) => step.id))
  const initialDefinition = ensureDefaultFeatureBody(definition)
  const bodyIds = new Set(initialDefinition.bodies.map((body) => body.id))
  const referenceIds = new Set(definition.referenceGeometry.map((reference) => reference.id))
  const failedStepIds = new Set<string>()
  const sourceHash = createFeatureSourceHash({
    steps: definition.steps.length,
    bodies: initialDefinition.bodies.length,
    references: definition.referenceGeometry.length,
  })
  const rebuiltAt = options.rebuiltAt ?? new Date().toISOString()

  let failedCount = 0
  let warningCount = 0
  const diagnosedSteps = definition.steps.map((step) => {
    const references = collectFeatureStepReferences(step)
    const diagnosedReferences = references.map((reference) => {
      const targetSet =
        reference.role === 'source-step'
          ? stepIds
          : reference.role === 'target-body'
            ? bodyIds
            : reference.role === 'reference-geometry'
              ? referenceIds
              : resolvedNodeIds
      return {
        ...reference,
        status: targetSet.has(reference.id) ? ('resolved' as const) : ('missing' as const),
      }
    })
    const missingCount = diagnosedReferences.filter(
      (reference) => reference.status === 'missing',
    ).length
    const unsupportedReason = getUnsupportedStepReason(step)
    const failedDependencyCount = diagnosedReferences.filter(
      (reference) => reference.role === 'source-step' && failedStepIds.has(reference.id),
    ).length
    const status = step.suppressed
      ? ('suppressed' as const)
      : missingCount > 0 || unsupportedReason || failedDependencyCount > 0
        ? ('failed' as const)
        : ('ok' as const)

    if (status === 'failed') {
      failedCount += 1
      failedStepIds.add(step.id)
    }

    return {
      ...step,
      references: diagnosedReferences,
      rebuild: {
        ...step.rebuild,
        status,
        message:
          status === 'suppressed'
            ? '步骤已禁用。'
            : unsupportedReason
              ? unsupportedReason
              : failedDependencyCount > 0
                ? `${failedDependencyCount} 个上游步骤失败。`
                : missingCount > 0
                ? `${missingCount} 个引用缺失。`
                : '重建通过。',
        rebuiltAt,
        sourceHash,
      },
    } as FeatureStep
  })

  const diagnosedDefinition = hydrateFeatureBodies({
    ...initialDefinition,
    steps: diagnosedSteps,
  }, options)

  if (initialDefinition !== definition && definition.bodies.length === 0) {
    warningCount += 1
  }

  const status = failedCount > 0 ? 'failed' : warningCount > 0 ? 'warning' : 'ok'

  return {
    ...diagnosedDefinition,
    rebuild: {
      status,
      message:
        status === 'failed'
          ? `${failedCount} 个步骤诊断失败。`
          : status === 'warning'
            ? `${warningCount} 个结构项已自动补齐。`
            : '特征历史重建通过。',
      rebuiltAt,
      sourceHash,
    },
  }
}

function hydrateFeatureBodies(
  definition: FeatureDefinition,
  options: Pick<FeatureRebuildOptions, 'sourceProfile' | 'depth' | 'baseElevation'>,
): FeatureDefinition {
  if (!(options.sourceProfile || options.depth || typeof options.baseElevation === 'number')) {
    return definition
  }

  return {
    ...definition,
    bodies: definition.bodies.map((body, index) => {
      if (index > 0) return body
      return {
        ...body,
        profile: body.profile ?? options.sourceProfile,
        depth: body.depth ?? options.depth,
        baseElevation: body.baseElevation ?? options.baseElevation,
      }
    }),
  }
}

function createFeatureSourceHash(input: {
  steps: number
  bodies: number
  references: number
}) {
  return `steps:${input.steps}|bodies:${input.bodies}|refs:${input.references}`
}

function collectFeatureStepReferences(step: FeatureStep) {
  const references = [...step.references]

  if ('profile' in step) {
    references.push(...buildProfileReferences(step.profile))
  }

  if ('profiles' in step) {
    for (const profile of step.profiles) {
      references.push(...buildProfileReferences(profile))
    }
  }

  if ('pathLineIds' in step) {
    references.push(
      ...step.pathLineIds.map((lineId) => ({
        id: lineId,
        role: 'path-line',
        status: 'resolved' as const,
      })),
    )
  }

  if ('guideLineIds' in step) {
    references.push(
      ...step.guideLineIds.map((lineId) => ({
        id: lineId,
        role: 'guide-line',
        status: 'resolved' as const,
      })),
    )
  }

  if ('targetIds' in step) {
    references.push(
      ...step.targetIds.map((targetId) => ({
        id: targetId,
        role: 'target-body',
        status: 'resolved' as const,
      })),
    )
  }

  if (step.kind === 'combine') {
    references.push({
      id: step.targetBodyId,
      role: 'target-body',
      status: 'resolved' as const,
    })
    references.push(
      ...step.toolBodyIds.map((bodyId) => ({
        id: bodyId,
        role: 'target-body',
        status: 'resolved' as const,
      })),
    )
  }

  if ('sourceStepIds' in step) {
    references.push(
      ...step.sourceStepIds.map((stepId) => ({
        id: stepId,
        role: 'source-step',
        status: 'resolved' as const,
      })),
    )
  }

  if (step.kind === 'mirror' && step.mirrorPlaneId) {
    references.push({
      id: step.mirrorPlaneId,
      role: 'reference-geometry',
      status: 'resolved' as const,
    })
  }

  const seen = new Set<string>()
  return references.filter((reference) => {
    const key = `${reference.role}:${reference.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getUnsupportedStepReason(step: FeatureStep) {
  if (step.kind === 'loft') {
    const pointCount = step.profiles[0]?.points.length ?? 0
    if (step.profiles.length < 2 || pointCount < 3) {
      return '放样至少需要两个闭合截面。'
    }
    if (step.profiles.some((profile) => profile.points.length !== pointCount)) {
      return '放样截面点数不一致。'
    }
  }

  if (step.kind === 'sweep' && step.pathPoints.length > 0 && step.pathPoints.length < 2) {
    return '扫描路径至少需要两个点。'
  }

  return null
}

function buildProfileReferences(profile: FeatureProfile) {
  return profile.lineIds.map((lineId) => ({
    id: lineId,
    role: 'profile-line',
    status: 'resolved' as const,
  }))
}
