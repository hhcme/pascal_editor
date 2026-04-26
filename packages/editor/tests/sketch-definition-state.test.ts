import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  getSketchCircleDefinitionState,
  getSketchDefinitionStatusBadgeLabel,
  getSketchLineDefinitionState,
} from '../src/components/tools/sketch/sketch-definition-state'

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
    name: 'Circle',
    center,
    radius,
    ...extra,
  })
}

describe('sketch definition state', () => {
  test('marks a free line as under-defined with missing-lock reasons', () => {
    const line = makeSketchLine([0, 0], [4, 1], { id: 'sketch_line_definition_under' })

    const state = getSketchLineDefinitionState(line)

    expect(state.status).toBe('under-defined')
    expect(state.label).toBe('欠定义')
    expect(state.constrainedBy).toEqual([])
    expect(state.reasons).toEqual(['端点位置未完全锁定', '方向未锁定', '长度未锁定'])
    expect(state.score).toBe(0)
    expect(state.target).toBe(4)
  })

  test('marks a fixed line as fully-defined without residual warnings', () => {
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_definition_fixed',
      relations: ['fixed'],
      dimensions: { length: 4 },
    })

    const state = getSketchLineDefinitionState(line)

    expect(state.status).toBe('fully-defined')
    expect(state.constrainedBy).toEqual(['固定'])
    expect(state.reasons).toEqual([])
    expect(state.score).toBe(4)
  })

  test('marks conflicting line orientation as over-defined', () => {
    const line = makeSketchLine([0, 0], [3, 1], {
      id: 'sketch_line_definition_over',
      relations: ['horizontal', 'vertical'],
    })

    const state = getSketchLineDefinitionState(line)

    expect(state.status).toBe('over-defined')
    expect(state.reasons).toContain('同时设置了水平和垂直关系')
  })

  test('marks conflicting target constraints as over-defined', () => {
    const line = makeSketchLine([0, 0], [3, 1], {
      id: 'sketch_line_definition_target_conflict',
      constraints: [
        { kind: 'parallel', targetId: 'sketch_line_definition_target_peer' },
        { kind: 'perpendicular', targetId: 'sketch_line_definition_target_peer' },
      ],
    })

    const state = getSketchLineDefinitionState(line)

    expect(state.status).toBe('over-defined')
    expect(state.reasons).toContain('同一目标同时存在平行和垂直约束')
  })

  test('treats driven angle dimensions as direction locks and detects orientation conflicts', () => {
    const drivenAngleLine = makeSketchLine([0, 0], [3, 3], {
      id: 'sketch_line_definition_angle',
      dimensions: { angle: Math.PI / 4, angleMode: 'driven' },
    })
    const conflictingLine = makeSketchLine([0, 0], [3, 3], {
      id: 'sketch_line_definition_angle_conflict',
      relations: ['horizontal'],
      dimensions: { angle: Math.PI / 4, angleMode: 'driven' },
    })

    const drivenState = getSketchLineDefinitionState(drivenAngleLine)
    const conflictingState = getSketchLineDefinitionState(conflictingLine)

    expect(drivenState.constrainedBy).toContain('角度尺寸')
    expect(drivenState.reasons).not.toContain('方向未锁定')
    expect(conflictingState.status).toBe('over-defined')
    expect(conflictingState.reasons).toContain('水平关系与角度尺寸冲突')
  })

  test('marks a free circle as under-defined', () => {
    const circle = makeSketchCircle([0, 0], 2, { id: 'sketch_circle_definition_under' })

    const state = getSketchCircleDefinitionState({ circle })

    expect(state.status).toBe('under-defined')
    expect(state.constrainedBy).toEqual([])
    expect(state.reasons).toEqual(['圆心未完全锁定', '半径未锁定'])
    expect(state.score).toBe(0)
    expect(state.target).toBe(3)
  })

  test('marks a constrained circle as fully-defined', () => {
    const circle = makeSketchCircle([3, 2], 2, {
      id: 'sketch_circle_definition_full',
      constraints: [{ kind: 'concentric', targetId: 'sketch_circle_definition_target' }],
      dimensions: { radius: 2 },
    })

    const state = getSketchCircleDefinitionState({ circle })

    expect(state.status).toBe('fully-defined')
    expect(state.constrainedBy).toEqual(['同心 1', '半径尺寸'])
    expect(state.reasons).toEqual([])
    expect(state.score).toBe(3)
  })

  test('marks conflicting circle constraints as over-defined', () => {
    const circle = makeSketchCircle([3, 2], 2, {
      id: 'sketch_circle_definition_conflict',
      constraints: [
        { kind: 'concentric', targetId: 'sketch_circle_definition_conflict_target' },
        {
          kind: 'tangent',
          targetId: 'sketch_circle_definition_conflict_target',
          tangentMode: 'external',
        },
      ],
    })

    const state = getSketchCircleDefinitionState({ circle })

    expect(state.status).toBe('over-defined')
    expect(state.reasons).toContain('同一目标同时存在同心和相切约束')
  })

  test('does not treat reference dimensions as locking geometry', () => {
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_definition_reference',
      dimensions: { length: 4, lengthMode: 'reference' },
    })
    const circle = makeSketchCircle([3, 2], 2, {
      id: 'sketch_circle_definition_reference',
      dimensions: { radius: 2, radiusMode: 'reference' },
    })

    const lineState = getSketchLineDefinitionState(line)
    const circleState = getSketchCircleDefinitionState({ circle })

    expect(lineState.status).toBe('under-defined')
    expect(lineState.constrainedBy).toEqual([])
    expect(lineState.reasons).toContain('长度未锁定')
    expect(circleState.status).toBe('under-defined')
    expect(circleState.constrainedBy).toEqual([])
    expect(circleState.reasons).toContain('半径未锁定')
  })

  test('returns compact badge labels for each status', () => {
    expect(getSketchDefinitionStatusBadgeLabel('under-defined')).toBe('欠')
    expect(getSketchDefinitionStatusBadgeLabel('fully-defined')).toBe('全')
    expect(getSketchDefinitionStatusBadgeLabel('over-defined')).toBe('过')
  })
})
