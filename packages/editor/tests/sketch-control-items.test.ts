import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  buildRemoveSketchLevelControlEntriesUpdates,
  buildRemoveSketchCircleControlItemsUpdates,
  buildRemoveSketchCircleControlUpdates,
  buildRemoveSketchLineControlItemsUpdates,
  buildRemoveSketchLineControlUpdates,
  getSketchLevelControlEntries,
  getSketchCircleControlItemCategory,
  getSketchCircleControlItems,
  getSketchLineControlItemCategory,
  getSketchLineControlItems,
} from '../src/components/tools/sketch/sketch-control-items'

function makeSketchLine(
  start: [number, number],
  end: [number, number],
  extra: Record<string, unknown> = {},
) {
  return SketchLineNodeSchema.parse({
    name: 'Sketch Line',
    start,
    end,
    ...extra,
  })
}

function makeSketchCircle(
  center: [number, number],
  radius: number,
  extra: Record<string, unknown> = {},
) {
  return SketchCircleNodeSchema.parse({
    name: 'Sketch Circle',
    center,
    radius,
    ...extra,
  })
}

describe('sketch control items', () => {
  test('lists active line controls with readable details', () => {
    const targetLine = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_control_target',
      name: 'Target Line',
    })
    const targetCircle = makeSketchCircle([2, 2], 1, {
      id: 'sketch_circle_control_target',
      name: 'Target Circle',
    })
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_control_primary',
      relations: ['horizontal', 'fixed'],
      dimensions: { length: 4 },
      tangent: {
        circleId: targetCircle.id,
        endpoint: 'end',
      },
      coincident: {
        start: {
          lineId: targetLine.id,
          endpoint: 'end',
        },
      },
      constraints: [{ kind: 'parallel', targetId: targetLine.id }],
    })

    const items = getSketchLineControlItems({
      line,
      linesById: new Map([
        [line.id, line],
        [targetLine.id, targetLine],
      ]),
      circlesById: new Map([[targetCircle.id, targetCircle]]),
    })

    expect(items.map((item) => `${item.kind}:${item.label}`)).toEqual([
      'relation:水平',
      'relation:固定',
      'dimension:驱动长度',
      'tangent:相切',
      'coincident:起点重合',
      'constraint:平行',
    ])
    expect(items.find((item) => item.kind === 'tangent')?.detail).toContain('Target Circle')
    expect(items.find((item) => item.kind === 'constraint')?.detail).toContain('Target Line')
  })

  test('labels reference dimensions distinctly in control items', () => {
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_control_reference',
      dimensions: { length: 4, lengthMode: 'reference' },
    })
    const circle = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_control_reference',
      dimensions: { radius: 2, radiusMode: 'reference' },
    })

    expect(
      getSketchLineControlItems({
        line,
        linesById: new Map([[line.id, line]]),
        circlesById: new Map(),
      }).find((item) => item.kind === 'dimension')?.label,
    ).toBe('参考长度')

    expect(
      getSketchCircleControlItems({
        circle,
        circlesById: new Map([[circle.id, circle]]),
      }).find((item) => item.kind === 'dimension')?.label,
    ).toBe('参考半径')
  })

  test('lists advanced coincident references with readable details', () => {
    const targetLine = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_control_attach_target',
      name: 'Attach Line',
    })
    const midpointLine = makeSketchLine([2, 4], [6, 4], {
      id: 'sketch_line_control_midpoint_target',
      name: 'Midpoint Line',
    })
    const targetCircle = makeSketchCircle([4, 2], 1, {
      id: 'sketch_circle_control_attach_target',
      name: 'Attach Circle',
    })
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_control_attach_source',
      coincident: {
        start: {
          kind: 'line-point',
          lineId: targetLine.id,
          t: 0.25,
        },
        end: {
          kind: 'line-point',
          lineId: midpointLine.id,
          t: 0.5,
        },
      },
    })
    const circleLine = makeSketchLine([0, -2], [4, -2], {
      id: 'sketch_line_control_attach_circle_source',
      coincident: {
        end: {
          kind: 'circle-point',
          circleId: targetCircle.id,
          angle: Math.PI / 2,
        },
      },
    })

    const items = getSketchLineControlItems({
      line,
      linesById: new Map([
        [line.id, line],
        [targetLine.id, targetLine],
        [midpointLine.id, midpointLine],
        [circleLine.id, circleLine],
      ]),
      circlesById: new Map([[targetCircle.id, targetCircle]]),
    }).filter((item) => item.kind === 'coincident')
    const circleItems = getSketchLineControlItems({
      line: circleLine,
      linesById: new Map([
        [circleLine.id, circleLine],
        [targetLine.id, targetLine],
        [midpointLine.id, midpointLine],
      ]),
      circlesById: new Map([[targetCircle.id, targetCircle]]),
    }).filter((item) => item.kind === 'coincident')

    expect(items.map((item) => item.detail)).toEqual([
      '在线上 -> Attach Line',
      '中点 -> Midpoint Line',
    ])
    expect(circleItems.map((item) => item.detail)).toEqual(['在圆上 -> Attach Circle'])

    expect(
      buildRemoveSketchLineControlUpdates({
        line,
        item: items[0]!,
        linesById: new Map([
          [line.id, line],
          [targetLine.id, targetLine],
        ]),
      }),
    ).toEqual([
      {
        id: line.id,
        data: {
          coincident: {
            end: {
              kind: 'line-point',
              lineId: midpointLine.id,
              t: 0.5,
            },
          },
        },
      },
    ])
  })

  test('labels full-circle diameter dimensions distinctly in control items', () => {
    const circle = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_control_diameter',
      kind: 'circle',
      dimensions: { radius: 2, radiusMode: 'driven', radiusDisplay: 'diameter' },
    })

    const item = getSketchCircleControlItems({
      circle,
      circlesById: new Map([[circle.id, circle]]),
    }).find((candidate) => candidate.kind === 'dimension')

    expect(item?.label).toBe('驱动直径')
    expect(item?.detail).toBe('4.00 m')
  })

  test('removes line control items and clears reciprocal references', () => {
    const targetLine = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_control_remove_target',
      coincident: {
        end: {
          lineId: 'sketch_line_control_remove_primary',
          endpoint: 'start',
        },
      },
      constraints: [{ kind: 'parallel', targetId: 'sketch_line_control_remove_primary' }],
    })
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_control_remove_primary',
      constraints: [{ kind: 'parallel', targetId: targetLine.id }],
      coincident: {
        start: {
          lineId: targetLine.id,
          endpoint: 'end',
        },
      },
      tangent: {
        circleId: 'sketch_circle_control_remove',
        endpoint: 'end',
      },
    })
    const linesById = new Map([
      [line.id, line],
      [targetLine.id, targetLine],
    ] as const)
    const items = getSketchLineControlItems({
      line,
      linesById,
      circlesById: new Map(),
    })

    expect(
      buildRemoveSketchLineControlUpdates({
        line,
        item: items.find((item) => item.kind === 'constraint')!,
        linesById,
      }),
    ).toEqual([
      {
        id: line.id,
        data: { constraints: [] },
      },
      {
        id: targetLine.id,
        data: { constraints: [] },
      },
    ])

    expect(
      buildRemoveSketchLineControlUpdates({
        line,
        item: items.find((item) => item.kind === 'coincident')!,
        linesById,
      }),
    ).toEqual([
      {
        id: line.id,
        data: { coincident: {} },
      },
      {
        id: targetLine.id,
        data: { coincident: {} },
      },
    ])

    expect(
      buildRemoveSketchLineControlUpdates({
        line,
        item: items.find((item) => item.kind === 'tangent')!,
        linesById,
      }),
    ).toEqual([
      {
        id: line.id,
        data: { tangent: undefined },
      },
    ])
  })

  test('lists and removes circle control items symmetrically', () => {
    const targetCircle = makeSketchCircle([4, 0], 2, {
      id: 'sketch_circle_control_pair_target',
      name: 'Target Circle',
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_control_pair_primary' }],
    })
    const circle = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_control_pair_primary',
      relations: ['fixed'],
      dimensions: { radius: 2 },
      constraints: [{ kind: 'equal-radius', targetId: targetCircle.id }],
    })
    const circlesById = new Map([
      [circle.id, circle],
      [targetCircle.id, targetCircle],
    ] as const)

    const items = getSketchCircleControlItems({
      circle,
      circlesById,
    })

    expect(items.map((item) => `${item.kind}:${item.label}`)).toEqual([
      'relation:固定',
      'dimension:驱动半径',
      'constraint:等半径',
    ])

    expect(
      buildRemoveSketchCircleControlUpdates({
        circle,
        item: items.find((item) => item.kind === 'constraint')!,
        circlesById,
      }),
    ).toEqual([
      {
        id: circle.id,
        data: { constraints: [] },
      },
      {
        id: targetCircle.id,
        data: { constraints: [] },
      },
    ])
  })

  test('labels tangent circle constraints with tangent mode detail', () => {
    const targetCircle = makeSketchCircle([4, 0], 2, {
      id: 'sketch_circle_control_tangent_target',
      name: 'Target Circle',
      constraints: [
        {
          kind: 'tangent',
          targetId: 'sketch_circle_control_tangent_primary',
          tangentMode: 'internal',
        },
      ],
    })
    const circle = makeSketchCircle([1, 0], 1, {
      id: 'sketch_circle_control_tangent_primary',
      constraints: [{ kind: 'tangent', targetId: targetCircle.id, tangentMode: 'internal' }],
    })

    const item = getSketchCircleControlItems({
      circle,
      circlesById: new Map([
        [circle.id, circle],
        [targetCircle.id, targetCircle],
      ] as const),
    }).find((candidate) => candidate.kind === 'constraint')

    expect(item?.label).toBe('相切')
    expect(item?.detail).toContain('内切')
    expect(item?.detail).toContain('Target Circle')
  })

  test('categorizes control items and batches line removals sequentially', () => {
    const peer = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_control_batch_peer',
      coincident: {
        start: {
          lineId: 'sketch_line_control_batch_primary',
          endpoint: 'start',
        },
        end: {
          lineId: 'sketch_line_control_batch_primary',
          endpoint: 'end',
        },
      },
    })
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_control_batch_primary',
      relations: ['horizontal'],
      dimensions: { length: 4 },
      coincident: {
        start: {
          lineId: peer.id,
          endpoint: 'start',
        },
        end: {
          lineId: peer.id,
          endpoint: 'end',
        },
      },
    })
    const linesById = new Map([
      [line.id, line],
      [peer.id, peer],
    ] as const)
    const items = getSketchLineControlItems({
      line,
      linesById,
      circlesById: new Map(),
    })

    expect(items.map(getSketchLineControlItemCategory)).toEqual([
      'relation',
      'dimension',
      'connection',
      'connection',
    ])

    expect(
      buildRemoveSketchLineControlItemsUpdates({
        line,
        items,
        linesById,
      }),
    ).toEqual([
      {
        id: line.id,
        data: {
          relations: [],
          dimensions: {},
          coincident: {},
        },
      },
      {
        id: peer.id,
        data: {
          coincident: {},
        },
      },
    ])
  })

  test('categorizes circle control items and batches circle removals sequentially', () => {
    const targetCircle = makeSketchCircle([4, 0], 2, {
      id: 'sketch_circle_control_batch_target',
      constraints: [{ kind: 'concentric', targetId: 'sketch_circle_control_batch_primary' }],
    })
    const circle = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_control_batch_primary',
      relations: ['fixed'],
      dimensions: { radius: 2 },
      constraints: [{ kind: 'concentric', targetId: targetCircle.id }],
    })
    const circlesById = new Map([
      [circle.id, circle],
      [targetCircle.id, targetCircle],
    ] as const)
    const items = getSketchCircleControlItems({
      circle,
      circlesById,
    })

    expect(items.map(getSketchCircleControlItemCategory)).toEqual([
      'relation',
      'dimension',
      'constraint',
    ])

    expect(
      buildRemoveSketchCircleControlItemsUpdates({
        circle,
        items,
        circlesById,
      }),
    ).toEqual([
      {
        id: circle.id,
        data: {
          relations: [],
          dimensions: {},
          constraints: [],
        },
      },
      {
        id: targetCircle.id,
        data: {
          constraints: [],
        },
      },
    ])
  })

  test('builds current-level control entries and removes mixed entries sequentially', () => {
    const linePeer = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_level_control_peer',
      name: 'Peer Line',
      parentId: 'level_control',
      constraints: [{ kind: 'parallel', targetId: 'sketch_line_level_control_primary' }],
    })
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_level_control_primary',
      name: 'Primary Line',
      parentId: 'level_control',
      relations: ['horizontal'],
      constraints: [{ kind: 'parallel', targetId: linePeer.id }],
    })
    const circlePeer = makeSketchCircle([4, 0], 2, {
      id: 'sketch_circle_level_control_peer',
      name: 'Peer Circle',
      parentId: 'level_control',
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_level_control_primary' }],
    })
    const circle = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_level_control_primary',
      name: 'Primary Circle',
      parentId: 'level_control',
      dimensions: { radius: 2 },
      constraints: [{ kind: 'equal-radius', targetId: circlePeer.id }],
    })
    const linesById = new Map([
      [line.id, line],
      [linePeer.id, linePeer],
    ] as const)
    const circlesById = new Map([
      [circle.id, circle],
      [circlePeer.id, circlePeer],
    ] as const)

    const entries = getSketchLevelControlEntries({
      lines: [line, linePeer],
      circles: [circle, circlePeer],
      linesById,
      circlesById,
    })

    expect(entries.map((entry) => `${entry.ownerType}:${entry.category}:${entry.label}`)).toEqual([
      'line:relation:Primary Line · 水平',
      'line:constraint:Primary Line · 平行',
      'line:constraint:Peer Line · 平行',
      'circle:dimension:Primary Circle · 驱动半径',
      'circle:constraint:Primary Circle · 等半径',
      'circle:constraint:Peer Circle · 等半径',
    ])

    expect(
      buildRemoveSketchLevelControlEntriesUpdates({
        entries: [
          entries.find((entry) => entry.label === 'Primary Line · 水平')!,
          entries.find((entry) => entry.label === 'Primary Circle · 等半径')!,
        ],
        linesById,
        circlesById,
      }),
    ).toEqual([
      {
        id: line.id,
        data: { relations: [] },
      },
      {
        id: circle.id,
        data: { constraints: [] },
      },
      {
        id: circlePeer.id,
        data: { constraints: [] },
      },
    ])
  })
})
