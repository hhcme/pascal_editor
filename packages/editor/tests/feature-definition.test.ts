import { describe, expect, test } from 'bun:test'
import { FeatureCut, FeatureNode } from '../../core/src/schema/nodes/feature'
import {
  createCircularPatternStep,
  createCombineStep,
  createDefaultChamferStep,
  createDerivedFeatureBody,
  createDefaultDraftStep,
  createDefaultFilletStep,
  createDefaultLoftStep,
  createDefaultShellStep,
  createDefaultSweepStep,
  createReferenceAxis,
  createReferencePlane,
  createReferencePoint,
  deleteFeatureBody,
  diagnoseFeatureDefinition,
  createExtrudeCutStepFromProfile,
  createFeatureDefinitionFromLegacyNode,
  createHoleStep,
  createLinearPatternStep,
  createMirrorStep,
  getExtrudeCutSteps,
  getCombineSteps,
  getDraftSteps,
  getEdgeTreatmentSteps,
  getFeatureDefinition,
  getFeatureProfileCenter,
  getHoleSteps,
  getLoftSteps,
  getMirrorSteps,
  getPatternSteps,
  getRenderableFeatureStep,
  getShellSteps,
  getSweepSteps,
  ensureDefaultFeatureBody,
  moveFeatureStep,
  rebuildFeatureDefinition,
  setFeatureBodyVisible,
  setPatternInstanceSkipped,
  updateCombineStepBodies,
  updateFeatureBodyTranslationX,
} from '../../core/src/systems/feature/feature-definition'

const profile = {
  kind: 'sketch-profile' as const,
  lineIds: ['sketch_line_a', 'sketch_line_b', 'sketch_line_c'],
  points: [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ] as Array<[number, number]>,
}

describe('feature definition', () => {
  test('builds a timeline definition from a legacy extrude feature', () => {
    const feature = FeatureNode.parse({
      name: '拉伸 1',
      kind: 'extrude',
      profile,
      depth: 2.8,
      baseElevation: 0.4,
      cuts: [
        FeatureCut.parse({
          profile: {
            ...profile,
            lineIds: ['sketch_line_cut_a', 'sketch_line_cut_b', 'sketch_line_cut_c'],
            points: [
              [1, 1],
              [2, 1],
              [2, 2],
              [1, 2],
            ],
          },
        }),
      ],
    })

    const definition = createFeatureDefinitionFromLegacyNode(feature)

    expect(definition.version).toBe(1)
    expect(definition.autoRebuild).toBe(false)
    expect(definition.steps).toHaveLength(2)
    expect(definition.steps[0]?.kind).toBe('extrude')
    expect(definition.steps[1]?.kind).toBe('extrude-cut')
    expect(getRenderableFeatureStep({ ...feature, definition })?.kind).toBe('extrude')
    expect(getExtrudeCutSteps({ ...feature, definition })).toHaveLength(1)
  })

  test('keeps legacy features readable when definition is absent', () => {
    const feature = FeatureNode.parse({
      name: '旋转 1',
      kind: 'revolve',
      profile,
      revolveAxisX: -1,
      revolveAngle: Math.PI,
    })

    const definition = getFeatureDefinition(feature)
    const renderable = getRenderableFeatureStep(feature)

    expect(definition.steps[0]?.kind).toBe('revolve')
    expect(renderable?.kind).toBe('revolve')
    expect(renderable?.revolveAngle).toBe(Math.PI)
  })

  test('creates first-class cut steps for future rebuild pipelines', () => {
    const step = createExtrudeCutStepFromProfile(profile, 0)

    expect(step.kind).toBe('extrude-cut')
    expect(step.operation).toBe('subtract')
    expect(step.throughAll).toBe(true)
    expect(step.references.map((reference) => reference.id)).toEqual(profile.lineIds)
  })

  test('creates usable hole and reuse steps', () => {
    const feature = FeatureNode.parse({
      name: '拉伸 2',
      kind: 'extrude',
      profile,
      definition: {
        version: 1,
        autoRebuild: false,
        steps: [
          createHoleStep({ center: getFeatureProfileCenter(profile), diameter: 0.4, index: 0 }),
          createMirrorStep(0),
          createLinearPatternStep(0),
          createCircularPatternStep(0),
        ],
      },
    })

    expect(getHoleSteps(feature)).toHaveLength(1)
    expect(getHoleSteps(feature)[0]?.center).toEqual([2, 1.5])
    expect(getMirrorSteps(feature)).toHaveLength(1)
    expect(getPatternSteps(feature).map((step) => step.kind)).toEqual([
      'linear-pattern',
      'circular-pattern',
    ])
  })

  test('creates default sweep and loft steps from the source profile', () => {
    const sweep = createDefaultSweepStep(profile, 0)
    const loft = createDefaultLoftStep(profile, 0)
    const feature = FeatureNode.parse({
      name: '成形 1',
      kind: 'extrude',
      profile,
      definition: {
        version: 1,
        autoRebuild: false,
        steps: [sweep, loft],
      },
    })

    expect(sweep.pathPoints).toHaveLength(3)
    expect(loft.profiles).toHaveLength(2)
    expect(loft.profiles[1]?.points).toHaveLength(profile.points.length)
    expect(getSweepSteps(feature)).toHaveLength(1)
    expect(getLoftSteps(feature)).toHaveLength(1)
  })

  test('creates applied feature preview steps', () => {
    const feature = FeatureNode.parse({
      name: '应用特征 1',
      kind: 'extrude',
      profile,
      definition: {
        version: 1,
        autoRebuild: false,
        steps: [
          createDefaultFilletStep(0),
          createDefaultChamferStep(0),
          createDefaultShellStep(0),
          createDefaultDraftStep(0),
        ],
      },
    })

    expect(getEdgeTreatmentSteps(feature).map((step) => step.kind)).toEqual(['fillet', 'chamfer'])
    expect(getShellSteps(feature)[0]?.thickness).toBe(0.15)
    expect(getDraftSteps(feature)[0]?.angle).toBe(5)
  })

  test('creates reference geometry and default body records', () => {
    const feature = FeatureNode.parse({
      name: '参考 1',
      kind: 'extrude',
      profile,
      definition: {
        version: 1,
        autoRebuild: false,
        steps: [],
        referenceGeometry: [createReferencePlane(0), createReferenceAxis(1), createReferencePoint(2)],
      },
    })
    const definition = ensureDefaultFeatureBody(feature.definition!)

    expect(definition.bodies).toHaveLength(1)
    expect(definition.referenceGeometry.map((reference) => reference.kind)).toEqual([
      'plane',
      'axis',
      'point',
    ])
    expect(definition.referenceGeometry[0]?.name).toBe('基准面 1')
  })

  test('diagnoses missing references and unsupported lofts', () => {
    const badLoft = createDefaultLoftStep(profile, 0)
    badLoft.profiles = [
      badLoft.profiles[0]!,
      {
        ...badLoft.profiles[1]!,
        points: badLoft.profiles[1]!.points.slice(0, 3),
      },
    ]
    const diagnosed = diagnoseFeatureDefinition(
      {
        version: 1,
        autoRebuild: false,
        steps: [createDefaultSweepStep(profile, 0), badLoft],
        bodies: [],
        referenceGeometry: [],
        rebuild: { status: 'ok' },
      },
      ['sketch_line_a', 'sketch_line_b'],
    )

    expect(diagnosed.rebuild.status).toBe('failed')
    expect(diagnosed.bodies).toHaveLength(1)
    expect(diagnosed.steps[0]?.rebuild.status).toBe('failed')
    expect(diagnosed.steps[1]?.rebuild.message).toBe('放样截面点数不一致。')
  })

  test('creates and diagnoses combine steps against body records', () => {
    const firstBody = createDerivedFeatureBody(0, [], profile, 2.8)
    const secondBody = createDerivedFeatureBody(1, [], profile, 2.8)
    const diagnosed = diagnoseFeatureDefinition({
      version: 1,
      autoRebuild: false,
      steps: [
        createCombineStep({
          operation: 'intersect',
          targetBodyId: firstBody.id,
          toolBodyIds: [secondBody.id],
          index: 0,
        }),
      ],
      bodies: [firstBody, secondBody],
      referenceGeometry: [],
      rebuild: { status: 'ok' },
    })
    const feature = FeatureNode.parse({
      name: 'Combine',
      kind: 'extrude',
      profile,
      definition: diagnosed,
    })

    expect(getCombineSteps(feature)).toHaveLength(1)
    expect(secondBody.profile?.points).toEqual(profile.points)
    expect(secondBody.transform?.translation[0]).toBeGreaterThan(0)
    expect(diagnosed.rebuild.status).toBe('ok')
    expect(diagnosed.steps[0]?.references.every((reference) => reference.status === 'resolved')).toBe(
      true,
    )
  })

  test('rebuilds timeline state in order and hydrates the default body', () => {
    const sweep = createDefaultSweepStep(profile, 0)
    sweep.pathLineIds = ['missing_path_line']
    const mirror = createMirrorStep(0)
    mirror.sourceStepIds = [sweep.id]

    const rebuilt = rebuildFeatureDefinition(
      {
        version: 1,
        autoRebuild: false,
        steps: [sweep, mirror],
        bodies: [],
        referenceGeometry: [],
        rebuild: { status: 'warning' },
      },
      {
        existingNodeIds: profile.lineIds,
        sourceProfile: profile,
        depth: 2.8,
        baseElevation: 0.25,
        rebuiltAt: '2026-04-29T00:00:00.000Z',
      },
    )

    expect(rebuilt.rebuild.status).toBe('failed')
    expect(rebuilt.bodies[0]?.profile?.points).toEqual(profile.points)
    expect(rebuilt.bodies[0]?.depth).toBe(2.8)
    expect(rebuilt.bodies[0]?.baseElevation).toBe(0.25)
    expect(rebuilt.steps[0]?.rebuild.message).toBe('1 个引用缺失。')
    expect(rebuilt.steps[1]?.rebuild.message).toBe('1 个上游步骤失败。')
    expect(rebuilt.steps[1]?.rebuild.rebuiltAt).toBe('2026-04-29T00:00:00.000Z')
  })

  test('updates body state and cleans combine references when deleting a body', () => {
    const firstBody = createDerivedFeatureBody(0, [], profile, 2.8)
    const secondBody = createDerivedFeatureBody(1, [], profile, 2.8)
    const thirdBody = createDerivedFeatureBody(2, [], profile, 2.8)
    const combine = createCombineStep({
      operation: 'add',
      targetBodyId: firstBody.id,
      toolBodyIds: [secondBody.id, thirdBody.id],
      index: 0,
    })

    const moved = updateFeatureBodyTranslationX(
      {
        version: 1,
        autoRebuild: false,
        steps: [combine],
        bodies: [firstBody, secondBody, thirdBody],
        referenceGeometry: [],
        rebuild: { status: 'ok' },
      },
      secondBody.id,
      6.25,
    )
    const hidden = setFeatureBodyVisible(moved, secondBody.id, false)
    const deleted = deleteFeatureBody(hidden, secondBody.id)

    expect(hidden.bodies[1]?.visible).toBe(false)
    expect(hidden.bodies[1]?.transform?.translation[0]).toBe(6.25)
    expect(deleted.bodies.map((body) => body.id)).toEqual([firstBody.id, thirdBody.id])
    expect(getCombineSteps({ kind: 'extrude', profile, definition: deleted } as FeatureNode)[0]?.toolBodyIds).toEqual([
      thirdBody.id,
    ])
    expect(deleteFeatureBody({ ...deleted, bodies: [firstBody] }, firstBody.id).rebuild.status).toBe(
      'failed',
    )
  })

  test('updates combine targets and tool bodies without self-references', () => {
    const firstBody = createDerivedFeatureBody(0, [], profile, 2.8)
    const secondBody = createDerivedFeatureBody(1, [], profile, 2.8)
    const thirdBody = createDerivedFeatureBody(2, [], profile, 2.8)
    const combine = createCombineStep({
      operation: 'subtract',
      targetBodyId: firstBody.id,
      toolBodyIds: [secondBody.id],
      index: 0,
    })

    const updated = updateCombineStepBodies(
      {
        version: 1,
        autoRebuild: false,
        steps: [combine],
        bodies: [firstBody, secondBody, thirdBody],
        referenceGeometry: [],
        rebuild: { status: 'ok' },
      },
      combine.id,
      {
        operation: 'intersect',
        targetBodyId: secondBody.id,
        toolBodyIds: [secondBody.id, thirdBody.id],
        keepTools: true,
      },
    )
    const step = updated.steps[0]

    expect(step?.kind).toBe('combine')
    if (step?.kind !== 'combine') return
    expect(step.operation).toBe('intersect')
    expect(step.targetBodyId).toBe(secondBody.id)
    expect(step.toolBodyIds).toEqual([thirdBody.id])
    expect(step.keepTools).toBe(true)
    expect(step.references.map((reference) => reference.id)).toEqual([secondBody.id, thirdBody.id])
  })

  test('toggles skipped pattern instances and prunes out-of-range indexes', () => {
    const pattern = createLinearPatternStep(0)
    pattern.count = 4
    const skipped = setPatternInstanceSkipped(
      {
        version: 1,
        autoRebuild: false,
        steps: [pattern],
        bodies: [],
        referenceGeometry: [],
        rebuild: { status: 'ok' },
      },
      pattern.id,
      2,
      true,
    )
    const pruned = setPatternInstanceSkipped(skipped, pattern.id, 9, true)
    const restored = setPatternInstanceSkipped(pruned, pattern.id, 2, false)

    expect(getPatternSteps({ kind: 'extrude', profile, definition: skipped } as FeatureNode)[0]?.skippedInstances).toEqual([
      2,
    ])
    expect(getPatternSteps({ kind: 'extrude', profile, definition: pruned } as FeatureNode)[0]?.skippedInstances).toEqual([
      2,
    ])
    expect(getPatternSteps({ kind: 'extrude', profile, definition: restored } as FeatureNode)[0]?.skippedInstances).toEqual(
      [],
    )
  })

  test('moves timeline steps and keeps boundary moves non-destructive', () => {
    const hole = createHoleStep({ center: getFeatureProfileCenter(profile), diameter: 0.4, index: 0 })
    const pattern = createLinearPatternStep(0)
    const mirror = createMirrorStep(0)
    const definition = {
      version: 1 as const,
      autoRebuild: false,
      steps: [hole, pattern, mirror],
      bodies: [],
      referenceGeometry: [],
      rebuild: { status: 'ok' as const },
    }

    const moved = moveFeatureStep(definition, mirror.id, 'up')
    const bounded = moveFeatureStep(moved, hole.id, 'up')

    expect(moved.steps.map((step) => step.id)).toEqual([hole.id, mirror.id, pattern.id])
    expect(moved.rebuild.message).toBe('特征步骤顺序已更新，等待重建。')
    expect(bounded.steps.map((step) => step.id)).toEqual([hole.id, mirror.id, pattern.id])
    expect(bounded.rebuild.message).toBe('特征步骤已在边界位置。')
  })
})
