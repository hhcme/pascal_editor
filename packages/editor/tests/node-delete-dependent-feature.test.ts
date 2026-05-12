import { describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '../../core/src/schema'
import { FeatureNode } from '../../core/src/schema/nodes/feature'
import { LevelNode } from '../../core/src/schema/nodes/level'
import { SketchLineNode } from '../../core/src/schema/nodes/sketch-line'
import { deleteNodesAction } from '../../core/src/store/actions/node-actions'

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

function createScene(nodes: Record<string, AnyNode>) {
  let state = {
    readOnly: false,
    nodes,
    collections: {},
    rootNodeIds: ['level_0'],
    markDirty: () => {},
  } as any

  const set = (fn: (scene: typeof state) => Partial<typeof state>) => {
    state = { ...state, ...fn(state) }
  }
  const get = () => state

  return { get, set }
}

describe('deleteNodesAction dependent features', () => {
  test('deletes extrude features generated from deleted sketch profile lines', () => {
    const sketchLines = [
      createSketchLine('sketch_line_a', [0, 0], [2, 0]),
      createSketchLine('sketch_line_b', [2, 0], [2, 2]),
      createSketchLine('sketch_line_c', [2, 2], [0, 2]),
      createSketchLine('sketch_line_d', [0, 2], [0, 0]),
      createSketchLine('sketch_line_unrelated', [4, 0], [5, 0]),
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
    const level = LevelNode.parse({
      id: 'level_0',
      children: [...sketchLines.map((line) => line.id), feature.id],
    })
    const nodes = Object.fromEntries(
      [level, ...sketchLines, feature].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const scene = createScene(nodes)

    deleteNodesAction(scene.set, scene.get, ['sketch_line_a' as AnyNodeId])

    expect(scene.get().nodes.sketch_line_a).toBeUndefined()
    expect(scene.get().nodes.feature_from_profile).toBeUndefined()
    expect(scene.get().nodes.sketch_line_unrelated).toBeDefined()
    expect(scene.get().nodes.level_0.children).not.toContain('feature_from_profile')
  })
})
