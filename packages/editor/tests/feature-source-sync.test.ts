import { describe, expect, mock, test } from 'bun:test'
import type { AnyNode } from '../../core/src/schema'
import { FeatureNode } from '../../core/src/schema/nodes/feature'
import { SketchLineNode } from '../../core/src/schema/nodes/sketch-line'

mock.module('@pascal-app/core', () => ({
  getSketchCirclePathLength: () => 0,
}))

const { buildFeatureSourceSyncUpdate } = await import(
  '../src/components/tools/sketch/feature-source-sync'
)

function createSketchLine(
  id: SketchLineNode['id'],
  start: [number, number],
  end: [number, number],
) {
  return SketchLineNode.parse({
    id,
    parentId: 'level_0',
    start,
    end,
  })
}

describe('feature source sync', () => {
  test('refreshes feature profile snapshots from changed source sketch lines', () => {
    const lines = [
      createSketchLine('sketch_line_a', [0, 0], [3, 0]),
      createSketchLine('sketch_line_b', [3, 0], [3, 2]),
      createSketchLine('sketch_line_c', [3, 2], [0, 2]),
      createSketchLine('sketch_line_d', [0, 2], [0, 0]),
    ]
    const feature = FeatureNode.parse({
      id: 'feature_from_profile',
      parentId: 'level_0',
      kind: 'extrude',
      profile: {
        kind: 'sketch-profile',
        lineIds: ['sketch_line_a', 'sketch_line_b', 'sketch_line_c', 'sketch_line_d'],
        points: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      },
    })
    const featureWithDefinition = {
      ...feature,
      definition: {
        version: 1 as const,
        autoRebuild: false,
        steps: [
          {
            id: 'feature_step_base',
            kind: 'extrude' as const,
            name: '拉伸',
            operation: 'add' as const,
            profile: feature.profile,
            depth: feature.depth,
            baseElevation: feature.baseElevation,
            suppressed: false,
            references: feature.profile.lineIds.map((lineId) => ({
              id: lineId,
              role: 'profile-line',
              status: 'resolved' as const,
            })),
            rebuild: { status: 'ok' as const },
          },
        ],
        bodies: [
          {
            id: 'feature_body_base',
            sourceStepIds: ['feature_step_base'],
            profile: feature.profile,
            depth: feature.depth,
            baseElevation: feature.baseElevation,
            visible: true,
          },
        ],
        referenceGeometry: [],
        rebuild: { status: 'ok' as const },
      },
    }
    const nodes = Object.fromEntries(
      [...lines, featureWithDefinition].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const update = buildFeatureSourceSyncUpdate(featureWithDefinition, nodes)

    expect(update?.profile?.points).toContainEqual([3, 0])
    expect(update?.profile?.points).toContainEqual([3, 2])
    const firstStep = update?.definition?.steps[0]
    expect(firstStep?.kind).toBe('extrude')
    expect(firstStep && 'profile' in firstStep ? firstStep.profile.points : []).toContainEqual([
      3, 0,
    ])
  })

  test('refreshes timeline cut step profiles that are not mirrored in legacy cuts', () => {
    const baseLines = [
      createSketchLine('sketch_line_a', [0, 0], [2, 0]),
      createSketchLine('sketch_line_b', [2, 0], [2, 2]),
      createSketchLine('sketch_line_c', [2, 2], [0, 2]),
      createSketchLine('sketch_line_d', [0, 2], [0, 0]),
    ]
    const cutLines = [
      createSketchLine('sketch_line_cut_a', [0.25, 0.25], [1.25, 0.25]),
      createSketchLine('sketch_line_cut_b', [1.25, 0.25], [1.25, 1.25]),
      createSketchLine('sketch_line_cut_c', [1.25, 1.25], [0.25, 1.25]),
      createSketchLine('sketch_line_cut_d', [0.25, 1.25], [0.25, 0.25]),
    ]
    const feature = FeatureNode.parse({
      id: 'feature_with_face_cut',
      parentId: 'level_0',
      kind: 'extrude',
      profile: {
        kind: 'sketch-profile',
        lineIds: ['sketch_line_a', 'sketch_line_b', 'sketch_line_c', 'sketch_line_d'],
        points: [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      },
      definition: {
        version: 1,
        autoRebuild: false,
        steps: [
          {
            id: 'feature_step_base',
            kind: 'extrude',
            operation: 'add',
            profile: {
              kind: 'sketch-profile',
              lineIds: ['sketch_line_a', 'sketch_line_b', 'sketch_line_c', 'sketch_line_d'],
              points: [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 2],
              ],
            },
            depth: 2.8,
            baseElevation: 0,
            references: [],
            rebuild: { status: 'ok' },
          },
          {
            id: 'feature_step_face_cut',
            kind: 'extrude-cut',
            operation: 'subtract',
            profile: {
              kind: 'sketch-profile',
              lineIds: [
                'sketch_line_cut_a',
                'sketch_line_cut_b',
                'sketch_line_cut_c',
                'sketch_line_cut_d',
              ],
              points: [
                [0.25, 0.25],
                [1, 0.25],
                [1, 1],
                [0.25, 1],
              ],
            },
            targetIds: ['feature_with_face_cut'],
            throughAll: true,
            references: [],
            rebuild: { status: 'ok' },
          },
        ],
        bodies: [],
        referenceGeometry: [],
        rebuild: { status: 'ok' },
      },
    })
    const nodes = Object.fromEntries(
      [...baseLines, ...cutLines, feature].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const update = buildFeatureSourceSyncUpdate(feature, nodes)
    const cutStep = update?.definition?.steps.find((step) => step.id === 'feature_step_face_cut')

    expect(cutStep && 'profile' in cutStep ? cutStep.profile.points : []).toContainEqual([
      1.25, 1.25,
    ])
  })

  test('does not update synced feature definitions again', () => {
    const lines = [
      createSketchLine('sketch_line_a', [0, 0], [2, 0]),
      createSketchLine('sketch_line_b', [2, 0], [2, 2]),
      createSketchLine('sketch_line_c', [2, 2], [0, 2]),
      createSketchLine('sketch_line_d', [0, 2], [0, 0]),
    ]
    const profile = {
      kind: 'sketch-profile' as const,
      lineIds: ['sketch_line_a', 'sketch_line_b', 'sketch_line_c', 'sketch_line_d'],
      circleIds: [],
      points: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ] as [number, number][],
      holes: [],
    }
    const feature = FeatureNode.parse({
      id: 'feature_synced',
      parentId: 'level_0',
      kind: 'extrude',
      profile,
      definition: {
        version: 1,
        autoRebuild: false,
        steps: [
          {
            id: 'feature_step_base',
            kind: 'extrude',
            name: '拉伸',
            operation: 'add',
            profile,
            depth: 2.8,
            baseElevation: 0,
            suppressed: false,
            references: profile.lineIds.map((lineId) => ({
              id: lineId,
              role: 'profile-line',
              status: 'resolved' as const,
            })),
            rebuild: { status: 'ok', message: '已自动同步来源草图。' },
          },
        ],
        bodies: [
          {
            id: 'feature_body_base',
            sourceStepIds: ['feature_step_base'],
            profile,
            depth: 2.8,
            baseElevation: 0,
            visible: true,
          },
        ],
        referenceGeometry: [],
        rebuild: { status: 'ok', message: '已自动同步来源草图。' },
      },
    })
    const nodes = Object.fromEntries([...lines, feature].map((node) => [node.id, node])) as Record<
      string,
      AnyNode
    >

    expect(buildFeatureSourceSyncUpdate(feature, nodes)).toBeNull()
  })

  test('marks feature step failed when source sketch geometry is missing', () => {
    const lines = [
      createSketchLine('sketch_line_a', [0, 0], [2, 0]),
      createSketchLine('sketch_line_b', [2, 0], [2, 2]),
      createSketchLine('sketch_line_c', [2, 2], [0, 2]),
    ]
    const profile = {
      kind: 'sketch-profile' as const,
      lineIds: ['sketch_line_a', 'sketch_line_b', 'sketch_line_c', 'sketch_line_d'],
      circleIds: [],
      points: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ] as [number, number][],
      holes: [],
    }
    const feature = FeatureNode.parse({
      id: 'feature_missing_source',
      parentId: 'level_0',
      kind: 'extrude',
      profile,
      definition: {
        version: 1,
        autoRebuild: false,
        steps: [
          {
            id: 'feature_step_base',
            kind: 'extrude',
            operation: 'add',
            profile,
            depth: 2.8,
            baseElevation: 0,
            references: [],
            rebuild: { status: 'ok' },
          },
        ],
        bodies: [],
        referenceGeometry: [],
        rebuild: { status: 'ok' },
      },
    })
    const nodes = Object.fromEntries([...lines, feature].map((node) => [node.id, node])) as Record<
      string,
      AnyNode
    >

    const update = buildFeatureSourceSyncUpdate(feature, nodes)
    const firstStep = update?.definition?.steps[0]

    expect(firstStep?.rebuild.status).toBe('failed')
    expect(firstStep?.rebuild.message).toContain('来源草图缺失')
    expect(update?.definition?.rebuild.status).toBe('failed')
  })

  test('marks feature step warning when source sketch profile is open', () => {
    const lines = [
      createSketchLine('sketch_line_a', [0, 0], [2, 0]),
      createSketchLine('sketch_line_b', [2, 0], [2, 2]),
      createSketchLine('sketch_line_c', [2, 2], [0, 2]),
      createSketchLine('sketch_line_d', [0, 2], [0, 0.5]),
    ]
    const profile = {
      kind: 'sketch-profile' as const,
      lineIds: ['sketch_line_a', 'sketch_line_b', 'sketch_line_c', 'sketch_line_d'],
      circleIds: [],
      points: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ] as [number, number][],
      holes: [],
    }
    const feature = FeatureNode.parse({
      id: 'feature_open_source',
      parentId: 'level_0',
      kind: 'extrude',
      profile,
      definition: {
        version: 1,
        autoRebuild: false,
        steps: [
          {
            id: 'feature_step_base',
            kind: 'extrude',
            operation: 'add',
            profile,
            depth: 2.8,
            baseElevation: 0,
            references: [],
            rebuild: { status: 'ok' },
          },
        ],
        bodies: [],
        referenceGeometry: [],
        rebuild: { status: 'ok' },
      },
    })
    const nodes = Object.fromEntries([...lines, feature].map((node) => [node.id, node])) as Record<
      string,
      AnyNode
    >

    const update = buildFeatureSourceSyncUpdate(feature, nodes)
    const firstStep = update?.definition?.steps[0]

    expect(firstStep?.rebuild.status).toBe('warning')
    expect(firstStep?.rebuild.message).toContain('来源草图未闭合')
    expect(update?.definition?.rebuild.status).toBe('warning')
  })
})
