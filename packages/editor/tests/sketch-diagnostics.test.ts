import { describe, expect, test } from 'bun:test'
import { SketchCircleNode as SketchCircleNodeSchema } from '../../core/src/schema/nodes/sketch-circle'
import { SketchLineNode as SketchLineNodeSchema } from '../../core/src/schema/nodes/sketch-line'
import {
  buildCleanSketchDiagnosticUpdates,
  buildCleanSketchCircleDiagnosticPatch,
  buildCleanSketchLineDiagnosticPatch,
  getSketchDiagnosticSummary,
  getSketchCircleDiagnosticIssues,
  getSketchLineDiagnosticIssues,
} from '../src/components/tools/sketch/sketch-diagnostics'

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

describe('sketch diagnostics', () => {
  test('reports and cleans dangling line references', () => {
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_diagnostic_primary',
      constraints: [{ kind: 'parallel', targetId: 'sketch_line_diagnostic_missing' }],
      coincident: {
        start: {
          lineId: 'sketch_line_diagnostic_missing',
          endpoint: 'end',
        },
      },
      tangent: {
        circleId: 'sketch_circle_diagnostic_missing',
        endpoint: 'end',
      },
    })

    const issues = getSketchLineDiagnosticIssues({
      line,
      linesById: new Map([[line.id, line]]),
      circlesById: new Map(),
    })

    expect(issues.map((issue) => issue.kind)).toEqual([
      'dangling-line-constraint',
      'dangling-coincident',
      'dangling-tangent',
    ])

    expect(
      buildCleanSketchLineDiagnosticPatch({
        line,
        linesById: new Map([[line.id, line]]),
        circlesById: new Map(),
      }),
    ).toEqual({
      coincident: {},
      constraints: [],
      tangent: undefined,
    })
  })

  test('reports and cleans unsupported curved line constraints and tangents', () => {
    const target = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_diagnostic_target',
    })
    const curved = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_diagnostic_curved',
      curveOffset: 0.5,
      constraints: [{ kind: 'equal-length', targetId: target.id }],
      tangent: {
        circleId: 'sketch_circle_diagnostic_valid',
        endpoint: 'end',
      },
    })
    const circle = makeSketchCircle([4, 1], 1, { id: 'sketch_circle_diagnostic_valid' })

    const issues = getSketchLineDiagnosticIssues({
      line: curved,
      linesById: new Map([
        [curved.id, curved],
        [target.id, target],
      ]),
      circlesById: new Map([[circle.id, circle]]),
    })

    expect(issues.map((issue) => issue.kind)).toEqual([
      'unsupported-curved-line-constraint',
      'unsupported-curved-tangent',
    ])

    expect(
      buildCleanSketchLineDiagnosticPatch({
        line: curved,
        linesById: new Map([
          [curved.id, curved],
          [target.id, target],
        ]),
        circlesById: new Map([[circle.id, circle]]),
      }),
    ).toEqual({
      constraints: [],
      tangent: undefined,
    })
  })

  test('reports and cleans dangling and unsupported coincident attachments', () => {
    const curvedTarget = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_diagnostic_attach_target',
      curveOffset: 0.5,
    })
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_diagnostic_attach_source',
      coincident: {
        start: {
          kind: 'line-point',
          lineId: curvedTarget.id,
          t: 0.5,
        },
        end: {
          kind: 'circle-point',
          circleId: 'sketch_circle_diagnostic_attach_missing',
          angle: Math.PI / 2,
        },
      },
    })

    const issues = getSketchLineDiagnosticIssues({
      line,
      linesById: new Map([
        [line.id, line],
        [curvedTarget.id, curvedTarget],
      ]),
      circlesById: new Map(),
    })

    expect(issues.map((issue) => issue.kind)).toEqual([
      'unsupported-coincident',
      'dangling-coincident',
    ])

    expect(
      buildCleanSketchLineDiagnosticPatch({
        line,
        linesById: new Map([
          [line.id, line],
          [curvedTarget.id, curvedTarget],
        ]),
        circlesById: new Map(),
      }),
    ).toEqual({
      coincident: {},
    })
  })

  test('reports and cleans dangling circle constraints', () => {
    const circle = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_diagnostic_primary',
      constraints: [{ kind: 'equal-radius', targetId: 'sketch_circle_diagnostic_missing' }],
    })

    const issues = getSketchCircleDiagnosticIssues({
      circle,
      circlesById: new Map([[circle.id, circle]]),
    })

    expect(issues.map((issue) => issue.kind)).toEqual(['dangling-circle-constraint'])
    expect(
      buildCleanSketchCircleDiagnosticPatch({
        circle,
        circlesById: new Map([[circle.id, circle]]),
      }),
    ).toEqual({
      constraints: [],
    })
  })

  test('returns null cleanup patches when diagnostics are clean', () => {
    const line = makeSketchLine([0, 0], [4, 0], { id: 'sketch_line_diagnostic_clean' })
    const circle = makeSketchCircle([0, 0], 2, { id: 'sketch_circle_diagnostic_clean' })

    expect(
      buildCleanSketchLineDiagnosticPatch({
        line,
        linesById: new Map([[line.id, line]]),
        circlesById: new Map(),
      }),
    ).toBeNull()
    expect(
      buildCleanSketchCircleDiagnosticPatch({
        circle,
        circlesById: new Map([[circle.id, circle]]),
      }),
    ).toBeNull()
  })

  test('aggregates current sketch diagnostics and builds batch cleanup updates', () => {
    const missingLineId = 'sketch_line_diagnostic_summary_missing'
    const missingCircleId = 'sketch_circle_diagnostic_summary_missing'
    const line = makeSketchLine([0, 0], [4, 0], {
      id: 'sketch_line_diagnostic_summary_primary',
      parentId: 'level_diagnostic_summary',
      constraints: [{ kind: 'parallel', targetId: missingLineId }],
    })
    const circle = makeSketchCircle([0, 0], 2, {
      id: 'sketch_circle_diagnostic_summary_primary',
      parentId: 'level_diagnostic_summary',
      constraints: [{ kind: 'equal-radius', targetId: missingCircleId }],
    })
    const cleanLine = makeSketchLine([0, 2], [4, 2], {
      id: 'sketch_line_diagnostic_summary_clean',
      parentId: 'level_diagnostic_summary',
    })

    const summary = getSketchDiagnosticSummary({
      lines: [line, cleanLine],
      circles: [circle],
      linesById: new Map([
        [line.id, line],
        [cleanLine.id, cleanLine],
      ]),
      circlesById: new Map([[circle.id, circle]]),
    })

    expect(summary).toEqual({
      totalIssues: 2,
      affectedLineIds: [line.id],
      affectedCircleIds: [circle.id],
      lineIssueCount: 1,
      circleIssueCount: 1,
    })

    expect(
      buildCleanSketchDiagnosticUpdates({
        lines: [line, cleanLine],
        circles: [circle],
        linesById: new Map([
          [line.id, line],
          [cleanLine.id, cleanLine],
        ]),
        circlesById: new Map([[circle.id, circle]]),
      }),
    ).toEqual([
      {
        id: line.id,
        data: { constraints: [] },
      },
      {
        id: circle.id,
        data: { constraints: [] },
      },
    ])
  })
})
