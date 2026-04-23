import { describe, expect, test } from 'bun:test'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  findSketchEndpointSnapTarget,
  getCoincidentSketchEndpointRefs,
  getSketchEndpointKey,
  getSketchEndpointReferenceFromSnapTarget,
} from '../src/components/tools/sketch/sketch-coincident'

type TestSketchLineNode = {
  object: 'node'
  id: `sketch_line_${string}`
  type: 'sketch-line'
  parentId: string | null
  visible: boolean
  metadata: Record<string, unknown>
  start: [number, number]
  end: [number, number]
  construction: boolean
  relations: Array<'horizontal' | 'vertical' | 'fixed'>
  dimensions: { length?: number }
  coincident: {
    start?: { lineId: `sketch_line_${string}`; endpoint: 'start' | 'end' }
    end?: { lineId: `sketch_line_${string}`; endpoint: 'start' | 'end' }
  }
}

function makeSketchLine(
  id: `sketch_line_${string}`,
  start: [number, number],
  end: [number, number],
  extra: Partial<TestSketchLineNode> = {},
): TestSketchLineNode {
  return {
    object: 'node',
    id,
    type: 'sketch-line',
    parentId: null,
    visible: true,
    metadata: {},
    start,
    end,
    construction: false,
    relations: [],
    dimensions: {},
    coincident: {},
    ...extra,
  }
}

function endpointKeys(refs: Array<{ lineId: string; endpoint: 'start' | 'end' }>) {
  return refs.map((reference) => getSketchEndpointKey(reference as any)).sort()
}

describe('sketch coincident endpoints', () => {
  test('parses sketch line coincident endpoints with a default empty object', () => {
    const plainLine = SketchLineNodeSchema.parse({
      name: 'Sketch Line',
      start: [0, 0],
      end: [1, 0],
    })
    const connectedLine = SketchLineNodeSchema.parse({
      name: 'Connected Sketch Line',
      start: [1, 0],
      end: [2, 0],
      coincident: {
        start: { lineId: 'sketch_line_anchor', endpoint: 'end' },
      },
    })

    expect(plainLine.coincident).toEqual({})
    expect(connectedLine.coincident.start).toEqual({
      lineId: 'sketch_line_anchor',
      endpoint: 'end',
    })
  })

  test('walks stored direct and reverse coincident references', () => {
    const lines = [
      makeSketchLine('sketch_line_a', [0, 0], [1, 0], {
        coincident: {
          end: { lineId: 'sketch_line_b', endpoint: 'start' },
        },
      }),
      makeSketchLine('sketch_line_b', [1, 0], [2, 0]),
    ]

    const refs = getCoincidentSketchEndpointRefs(lines as any, {
      lineId: 'sketch_line_b',
      endpoint: 'start',
    })

    expect(endpointKeys(refs)).toEqual(['sketch_line_a:end', 'sketch_line_b:start'])
  })

  test('groups legacy endpoints that already share the same coordinates', () => {
    const lines = [
      makeSketchLine('sketch_line_a', [0, 0], [1, 0]),
      makeSketchLine('sketch_line_b', [1, 0], [2, 1]),
    ]

    const refs = getCoincidentSketchEndpointRefs(lines as any, {
      lineId: 'sketch_line_a',
      endpoint: 'end',
    })

    expect(endpointKeys(refs)).toEqual(['sketch_line_a:end', 'sketch_line_b:start'])
  })

  test('finds nearest sketch endpoint while ignoring the active coincident group', () => {
    const lines = [
      makeSketchLine('sketch_line_a', [0, 0], [1, 0], {
        coincident: {
          end: { lineId: 'sketch_line_b', endpoint: 'start' },
        },
      }),
      makeSketchLine('sketch_line_b', [1, 0], [2, 0]),
      makeSketchLine('sketch_line_c', [1.1, 0], [3, 0]),
    ]
    const ignored = getCoincidentSketchEndpointRefs(lines as any, {
      lineId: 'sketch_line_a',
      endpoint: 'end',
    })

    const target = findSketchEndpointSnapTarget({
      point: [1.02, 0],
      lines: lines as any,
      ignoreEndpoints: ignored,
    })

    expect(target?.reference).toEqual({ lineId: 'sketch_line_c', endpoint: 'start' })
  })

  test('converts wall sketch snap metadata to a sketch endpoint reference', () => {
    expect(
      getSketchEndpointReferenceFromSnapTarget({
        kind: 'sketch-endpoint',
        point: [1, 0],
        sourceId: 'sketch_line_a',
        sourceEndpoint: 'end',
      } as any),
    ).toEqual({ lineId: 'sketch_line_a', endpoint: 'end' })

    expect(
      getSketchEndpointReferenceFromSnapTarget({
        kind: 'alignment',
        sourceId: 'sketch_line_a',
        sourceEndpoint: 'end',
      }),
    ).toBeUndefined()
  })
})
