'use client'

import {
  type AnyNode,
  type AnyNodeId,
  getClampedSketchLineCurveOffset,
  getMaxSketchLineCurveOffset,
  normalizeSketchLineCurveOffset,
  type SketchCircleNode,
  type SketchDimensionNode,
  type SketchLineNode,
  type SketchLineRelation,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlertTriangle,
  Lock,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { cn } from '../../../lib/utils'
import useEditor from '../../../store/use-editor'
import {
  buildSetSketchLineAnglePlan,
  buildOrientSketchLinePlan,
  buildSetSketchLineLengthPlan,
  getSketchLineLength2D,
  getSketchLinePathLength2D,
  type SketchLineEditResult,
  type SketchPlanPoint,
} from '../../tools/sketch/sketch-geometry'
import {
  buildSketchLineAngleDimensionData,
  buildSketchLineLengthDimensionData,
  clearSketchLineAngleDimensionData,
  clearSketchLineLengthDimensionData,
  getSketchLineAngleDimensionMode,
  getSketchLineDisplayedAngleDegrees,
  getSketchLineLengthDimensionMode,
} from '../../tools/sketch/sketch-dimensions'
import {
  getSketchDefinitionStatusBadgeLabel,
  getSketchLineDefinitionState,
} from '../../tools/sketch/sketch-definition-state'
import {
  buildCleanSketchLineDiagnosticPatch,
  buildCleanSketchDiagnosticUpdates,
  getSketchDiagnosticSummary,
  getSketchLineDiagnosticIssues,
} from '../../tools/sketch/sketch-diagnostics'
import {
  buildRemoveSketchLineControlItemsUpdates,
  buildRemoveSketchLevelControlEntriesUpdates,
  buildRemoveSketchLineControlUpdates,
  getSketchLevelControlEntries,
  getSketchLineControlItemCategory,
  getSketchLineControlItems,
  isSketchControlDeleteUpdate,
  type SketchLevelControlEntry,
  type SketchLineControlItem,
} from '../../tools/sketch/sketch-control-items'
import { buildRemoveSketchLineCoincidentReferencesPlan } from '../../tools/sketch/sketch-line-coincident'
import { buildRemoveSketchLineConstraintReferencesPlan } from '../../tools/sketch/sketch-line-constraints'
import { buildResolvedSketchLineUpdateSet } from '../../tools/sketch/sketch-line-resolution'
import { ActionButton, ActionGroup } from '../controls/action-button'
import {
  InspectorBadge,
  InspectorHighlight,
  InspectorStat,
  InspectorSummary,
} from '../controls/inspector-summary'
import { MetricControl } from '../controls/metric-control'
import { PanelSection } from '../controls/panel-section'
import { SegmentedControl } from '../controls/segmented-control'
import { ToggleControl } from '../controls/toggle-control'
import { PanelWrapper } from './panel-wrapper'
import { SketchControlManager } from './sketch-control-manager'

function hasRelation(node: SketchLineNode, relation: SketchLineRelation) {
  return (node.relations ?? []).includes(relation)
}

function getEndpointPatch(
  node: SketchLineNode,
  endpoint: 'start' | 'end',
  axis: 0 | 1,
  value: number,
): Pick<SketchLineNode, 'start' | 'end'> {
  const start: SketchPlanPoint = [...node.start]
  const end: SketchPlanPoint = [...node.end]
  const target = endpoint === 'start' ? start : end
  target[axis] = value

  if (hasRelation(node, 'horizontal')) {
    const z = target[1]
    start[1] = z
    end[1] = z
  } else if (hasRelation(node, 'vertical')) {
    const x = target[0]
    start[0] = x
    end[0] = x
  }

  return { start, end }
}

function formatRelations(node: SketchLineNode) {
  const relations = node.relations ?? []
  if (relations.length === 0) return '自由'
  return relations
    .map((relation) => {
      if (relation === 'horizontal') return '水平'
      if (relation === 'vertical') return '垂直'
      return '固定'
    })
    .join(', ')
}

function formatConstraints(node: SketchLineNode) {
  const parts: string[] = []
  const constraints = node.constraints ?? []
  const countByKind = (kind: 'equal-length' | 'parallel' | 'perpendicular' | 'collinear') =>
    constraints.filter((constraint) => constraint.kind === kind).length

  const equalLengthCount = countByKind('equal-length')
  const parallelCount = countByKind('parallel')
  const perpendicularCount = countByKind('perpendicular')
  const collinearCount = countByKind('collinear')

  if (node.tangent) {
    parts.push('相切')
  }
  if (equalLengthCount > 0) {
    parts.push(`等长 ${equalLengthCount}`)
  }
  if (parallelCount > 0) {
    parts.push(`平行 ${parallelCount}`)
  }
  if (perpendicularCount > 0) {
    parts.push(`垂直 ${perpendicularCount}`)
  }
  if (collinearCount > 0) {
    parts.push(`共线 ${collinearCount}`)
  }

  return parts.join(', ') || '无'
}

export function SketchLinePanel() {
  const selectedId = useViewer((state) => state.selection.selectedIds[0])
  const selectedCount = useViewer((state) => state.selection.selectedIds.length)
  const setSelection = useViewer((state) => state.setSelection)
  const showSketchRelations = useEditor((state) => state.showSketchRelations)
  const setShowSketchRelations = useEditor((state) => state.setShowSketchRelations)
  const nodes = useScene((state) => state.nodes)
  const updateNode = useScene((state) => state.updateNode)
  const updateNodes = useScene((state) => state.updateNodes)
  const deleteNode = useScene((state) => state.deleteNode)

  const node = useScene((state) =>
    selectedId ? (state.nodes[selectedId as AnyNode['id']] as SketchLineNode | undefined) : undefined,
  )
  const sketchLineById = useMemo(
    () =>
      new Map(
        Object.values(nodes)
          .filter((candidate): candidate is SketchLineNode => candidate.type === 'sketch-line')
          .map((line) => [line.id, line] as const),
      ),
    [nodes],
  )
  const sketchCircleById = useMemo(
    () =>
      new Map(
        Object.values(nodes)
          .filter((candidate): candidate is SketchCircleNode => candidate.type === 'sketch-circle')
          .map((circle) => [circle.id, circle] as const),
      ),
    [nodes],
  )
  const sketchDimensions = useMemo(
    () =>
      Object.values(nodes).filter(
        (candidate): candidate is SketchDimensionNode => candidate.type === 'sketch-dimension',
      ),
    [nodes],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleUpdate = useCallback(
    (updates: Partial<SketchLineNode>) => {
      if (!(selectedId && node) || hasRelation(node, 'fixed')) return
      const resolvedUpdates = buildResolvedSketchLineUpdateSet({
        linesById: sketchLineById,
        circlesById: sketchCircleById,
        initialUpdates: [{ id: node.id, data: updates }],
      })
      if (!resolvedUpdates.ok) {
        return
      }

      updateNodes(
        resolvedUpdates.updates.map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        })),
      )
      for (const update of resolvedUpdates.updates) {
        useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
      }
    },
    [node, selectedId, sketchCircleById, sketchLineById, updateNodes],
  )

  const runEditResult = useCallback(
    (result: SketchLineEditResult) => {
      if (!result.ok) return
      const resolvedUpdates = buildResolvedSketchLineUpdateSet({
        linesById: sketchLineById,
        circlesById: sketchCircleById,
        initialUpdates: result.updates.map((update) => ({
          id: update.id,
          data: update.data,
        })),
      })
      if (!resolvedUpdates.ok) {
        return
      }

      const allUpdates = resolvedUpdates.updates.map((update) => ({
        id: update.id as AnyNodeId,
        data: update.data as Partial<AnyNode>,
      }))
      updateNodes(allUpdates)
      for (const update of allUpdates) {
        useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
      }
      setSelection({
        selectedIds: result.selectIds ?? allUpdates.map((update) => update.id),
      })
      sfxEmitter.emit('sfx:structure-build')
    },
    [setSelection, sketchCircleById, sketchLineById, updateNodes],
  )

  const handleLengthChange = useCallback(
    (length: number) => {
      if (!node) return
      runEditResult(
        buildSetSketchLineLengthPlan({
          line: node,
          length,
          dimensionMode: getSketchLineLengthDimensionMode(node) ?? 'driven',
        }),
      )
    },
    [node, runEditResult],
  )

  const handleAngleChange = useCallback(
    (degrees: number) => {
      if (!node) return
      runEditResult(
        buildSetSketchLineAnglePlan({
          line: node,
          angle: (degrees * Math.PI) / 180,
          dimensionMode: getSketchLineAngleDimensionMode(node) ?? 'driven',
        }),
      )
    },
    [node, runEditResult],
  )

  const handleLengthDimensionModeChange = useCallback(
    (mode: 'none' | 'driven' | 'reference') => {
      if (!node) {
        return
      }

      const dimensions =
        mode === 'none'
          ? clearSketchLineLengthDimensionData(node)
          : buildSketchLineLengthDimensionData({
              line: node,
              length: getSketchLineLength2D(node),
              mode,
            })
      updateNode(node.id as AnyNodeId, { dimensions } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, updateNode],
  )

  const handleAngleDimensionModeChange = useCallback(
    (mode: 'none' | 'driven' | 'reference') => {
      if (!node) {
        return
      }

      const dimensions =
        mode === 'none'
          ? clearSketchLineAngleDimensionData(node)
          : buildSketchLineAngleDimensionData({
              line: node,
              angle: (getSketchLineDisplayedAngleDegrees(node) * Math.PI) / 180,
              mode,
            })
      updateNode(node.id as AnyNodeId, { dimensions } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, updateNode],
  )

  const handleOrientationChange = useCallback(
    (orientation: 'horizontal' | 'vertical', checked: boolean) => {
      if (!node) return

      if (checked) {
        runEditResult(buildOrientSketchLinePlan({ line: node, orientation }))
        return
      }

      const relations = (node.relations ?? []).filter((relation) => relation !== orientation)
      updateNode(node.id as AnyNodeId, { relations } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, runEditResult, updateNode],
  )

  const handleFixedChange = useCallback(
    (checked: boolean) => {
      if (!node) return
      const relations = new Set(node.relations ?? [])
      if (checked) {
        relations.add('fixed')
      } else {
        relations.delete('fixed')
      }
      updateNode(node.id as AnyNodeId, { relations: [...relations] } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, updateNode],
  )

  const handleConstructionChange = useCallback(
    (checked: boolean) => {
      if (!node) return
      updateNode(node.id as AnyNodeId, { construction: checked } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, updateNode],
  )

  const handleDelete = useCallback(() => {
    if (!node) return
    const constraintCleanupUpdates = buildRemoveSketchLineConstraintReferencesPlan({
      linesById: sketchLineById,
      deletedIds: [node.id],
    })
    const coincidentCleanupUpdates = buildRemoveSketchLineCoincidentReferencesPlan({
      linesById: sketchLineById,
      deletedLineIds: [node.id],
    })
    if (constraintCleanupUpdates.length > 0 || coincidentCleanupUpdates.length > 0) {
      updateNodes(
        [
          ...constraintCleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
          ...coincidentCleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
        ],
      )
      for (const update of [...constraintCleanupUpdates, ...coincidentCleanupUpdates]) {
        useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
      }
    }
    sfxEmitter.emit('sfx:item-delete')
    deleteNode(node.id as AnyNodeId)
    setSelection({ selectedIds: [] })
  }, [deleteNode, node, setSelection, sketchLineById, updateNodes])

  if (!(node && node.type === 'sketch-line' && selectedId && selectedCount === 1)) {
    return null
  }

  const chordLength = getSketchLineLength2D(node)
  const length = getSketchLinePathLength2D(node)
  const angleDegrees = getSketchLineDisplayedAngleDegrees(node)
  const lengthDimensionMode = getSketchLineLengthDimensionMode(node) ?? 'none'
  const angleDimensionMode = getSketchLineAngleDimensionMode(node) ?? 'none'
  const curveOffset = getClampedSketchLineCurveOffset(node)
  const maxCurveOffset = getMaxSketchLineCurveOffset(node)
  const isFixed = hasRelation(node, 'fixed')
  const icon = node.construction ? '/icons/sketch-construction-line.svg' : '/icons/sketch-line.svg'
  const constraintSummary = formatConstraints(node)
  const relationSummary = formatRelations(node)
  const currentLevelId = node.parentId
  const levelSketchDimensions = sketchDimensions.filter(
    (dimension) => dimension.parentId === currentLevelId,
  )
  const definitionState = getSketchLineDefinitionState(node, {
    sketchDimensions: levelSketchDimensions,
  })
  const constrainedBySummary = definitionState.constrainedBy.join(' / ') || '自由拖动'
  const definitionReasonSummary =
    definitionState.reasons.length > 0 ? definitionState.reasons.join('；') : null
  const definitionTone =
    definitionState.status === 'over-defined'
      ? 'danger'
      : definitionState.status === 'under-defined'
        ? 'warning'
        : 'success'
  const definitionSummaryValue = `${definitionState.label} · ${definitionState.score}/${definitionState.target}`
  const constraintStatusSummary =
    constraintSummary === '无'
      ? relationSummary
      : relationSummary === '自由'
        ? constraintSummary
        : `${relationSummary} / ${constraintSummary}`
  const definitionNoticeClassName = cn(
    'rounded-md border px-3 py-2 text-[11px]',
    definitionState.status === 'over-defined'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : definitionState.status === 'under-defined'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
        : 'border-border/55 bg-muted/35 text-muted-foreground',
  )
  const definitionHintLabel = definitionState.status === 'over-defined' ? '冲突' : '提示'
  const diagnostics = getSketchLineDiagnosticIssues({
    line: node,
    linesById: sketchLineById,
    circlesById: sketchCircleById,
  })
  const levelSketchLines = [...sketchLineById.values()].filter(
    (line) => line.parentId === currentLevelId,
  )
  const levelSketchCircles = [...sketchCircleById.values()].filter(
    (circle) => circle.parentId === currentLevelId,
  )
  const levelDiagnosticSummary = getSketchDiagnosticSummary({
    lines: levelSketchLines,
    circles: levelSketchCircles,
    linesById: sketchLineById,
    circlesById: sketchCircleById,
  })
  const controlItems = getSketchLineControlItems({
    line: node,
    linesById: sketchLineById,
    circlesById: sketchCircleById,
    sketchDimensions: levelSketchDimensions,
  })
  const levelControlEntries = getSketchLevelControlEntries({
    lines: levelSketchLines,
    circles: levelSketchCircles,
    linesById: sketchLineById,
    circlesById: sketchCircleById,
    sketchDimensions: levelSketchDimensions,
  })

  const applyControlUpdates = (updates: ReturnType<typeof buildRemoveSketchLineControlUpdates>) => {
    if (updates.length === 0) {
      return
    }

    const nodeUpdates = updates.filter(
      (update): update is Exclude<(typeof updates)[number], { delete: true }> =>
        !isSketchControlDeleteUpdate(update),
    )
    if (nodeUpdates.length > 0) {
      updateNodes(
        nodeUpdates.map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        })),
      )
      for (const update of nodeUpdates) {
        useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
      }
    }

    for (const update of updates) {
      if (!isSketchControlDeleteUpdate(update)) {
        continue
      }
      deleteNode(update.id as AnyNodeId)
    }
    sfxEmitter.emit('sfx:structure-build')
  }

  const handleCleanDiagnostics = () => {
    if (!node) {
      return
    }

    const patch = buildCleanSketchLineDiagnosticPatch({
      line: node,
      linesById: sketchLineById,
      circlesById: sketchCircleById,
    })
    if (!patch) {
      return
    }

    updateNode(node.id as AnyNodeId, patch as Partial<AnyNode>)
    useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
    sfxEmitter.emit('sfx:structure-build')
  }

  const handleRemoveControl = (item: SketchLineControlItem) => {
    applyControlUpdates(
      buildRemoveSketchLineControlUpdates({
        line: node,
        item,
        linesById: sketchLineById,
      }),
    )
  }

  const handleRemoveControlItems = (items: SketchLineControlItem[]) => {
    applyControlUpdates(
      buildRemoveSketchLineControlItemsUpdates({
        line: node,
        items,
        linesById: sketchLineById,
      }),
    )
  }

  const handleRemoveLevelControlEntry = (entry: SketchLevelControlEntry) => {
    applyControlUpdates(
      buildRemoveSketchLevelControlEntriesUpdates({
        entries: [entry],
        linesById: sketchLineById,
        circlesById: sketchCircleById,
      }),
    )
  }

  const handleRemoveLevelControlEntries = (entries: SketchLevelControlEntry[]) => {
    applyControlUpdates(
      buildRemoveSketchLevelControlEntriesUpdates({
        entries,
        linesById: sketchLineById,
        circlesById: sketchCircleById,
      }),
    )
  }

  const handleCleanLevelDiagnostics = () => {
    const updates = buildCleanSketchDiagnosticUpdates({
      lines: levelSketchLines,
      circles: levelSketchCircles,
      linesById: sketchLineById,
      circlesById: sketchCircleById,
    })
    if (updates.length === 0) {
      return
    }

    updateNodes(
      updates.map((update) => ({
        id: update.id as AnyNodeId,
        data: update.data as Partial<AnyNode>,
      })),
    )
    for (const update of updates) {
      useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
    }
    sfxEmitter.emit('sfx:structure-build')
  }

  return (
    <PanelWrapper icon={icon} onClose={handleClose} title={node.name || '草图线'} width={340}>
      <InspectorSummary
        className="border-border/60 bg-sidebar/86 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.45)]"
        sticky
      >
        <InspectorHighlight
          badge={
            <InspectorBadge tone={definitionTone}>
              {getSketchDefinitionStatusBadgeLabel(definitionState.status)}
            </InspectorBadge>
          }
          description={
            <>
              <div>{`控制来源：${constrainedBySummary}`}</div>
              {definitionReasonSummary ? (
                <div className="mt-1">{`${definitionHintLabel}：${definitionReasonSummary}`}</div>
              ) : null}
            </>
          }
          meta={`覆盖 ${definitionState.score}/${definitionState.target}`}
          title={definitionState.label}
          tone={definitionTone}
          trailing={
            <>
              <InspectorBadge>{node.construction ? '参考线' : '轮廓'}</InspectorBadge>
              {relationSummary !== '自由' ? <InspectorBadge>{relationSummary}</InspectorBadge> : null}
            </>
          }
        />
        <InspectorStat label="长度" value={`${length.toFixed(2)} m`} />
        <InspectorStat label="角度" value={`${angleDegrees.toFixed(1)}°`} />
        <InspectorStat label="约束状态" value={constraintStatusSummary} />
        <InspectorStat label="定义状态" value={definitionSummaryValue} />
      </InspectorSummary>

      <PanelSection title="几何">
        <MetricControl
          label="长度"
          max={200}
          min={0.01}
          onChange={handleLengthChange}
          precision={2}
          step={0.01}
          unit="m"
          value={node.dimensions?.length ?? chordLength}
        />
        <MetricControl
          label="角度"
          max={360}
          min={0}
          onChange={handleAngleChange}
          precision={1}
          step={1}
          unit="°"
          value={Math.round(angleDegrees * 10) / 10}
        />
        <MetricControl
          label="弯曲"
          max={Math.max(0.01, maxCurveOffset)}
          min={-Math.max(0.01, maxCurveOffset)}
          onChange={(value) =>
            handleUpdate({ curveOffset: normalizeSketchLineCurveOffset(node, value) })
          }
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(curveOffset * 100) / 100}
        />
        <MetricControl
          label="起点 X"
          onChange={(value) => handleUpdate(getEndpointPatch(node, 'start', 0, value))}
          precision={2}
          step={0.01}
          unit="m"
          value={node.start[0]}
        />
        <MetricControl
          label="起点 Z"
          onChange={(value) => handleUpdate(getEndpointPatch(node, 'start', 1, value))}
          precision={2}
          step={0.01}
          unit="m"
          value={node.start[1]}
        />
        <MetricControl
          label="终点 X"
          onChange={(value) => handleUpdate(getEndpointPatch(node, 'end', 0, value))}
          precision={2}
          step={0.01}
          unit="m"
          value={node.end[0]}
        />
        <MetricControl
          label="终点 Z"
          onChange={(value) => handleUpdate(getEndpointPatch(node, 'end', 1, value))}
          precision={2}
          step={0.01}
          unit="m"
          value={node.end[1]}
        />
        {isFixed && (
          <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
            草图线已固定，关闭固定后才能修改几何。
          </div>
        )}
      </PanelSection>

      <PanelSection title="尺寸">
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-muted-foreground">长度</div>
          <SegmentedControl
            onChange={handleLengthDimensionModeChange}
            options={[
              { label: '无', value: 'none' },
              { label: '驱动', value: 'driven' },
              { label: '参考', value: 'reference' },
            ]}
            value={lengthDimensionMode}
          />
        </div>
        <div className="mt-3 space-y-2">
          <div className="text-[11px] font-medium text-muted-foreground">角度</div>
          <SegmentedControl
            onChange={handleAngleDimensionModeChange}
            options={[
              { label: '无', value: 'none' },
              { label: '驱动', value: 'driven' },
              { label: '参考', value: 'reference' },
            ]}
            value={angleDimensionMode}
          />
        </div>
        <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
          {lengthDimensionMode === 'reference' || angleDimensionMode === 'reference'
            ? '参考尺寸只显示当前测量值，不参与几何锁定。'
            : lengthDimensionMode === 'driven' || angleDimensionMode === 'driven'
              ? '驱动尺寸会作为长度或角度控制项参与草图定义。'
              : '当前没有持久化长度或角度尺寸。'}
        </div>
      </PanelSection>

      <PanelSection title="关系">
        <ToggleControl
          checked={hasRelation(node, 'horizontal')}
          label="水平"
          onChange={(checked) => handleOrientationChange('horizontal', checked)}
        />
        <ToggleControl
          checked={hasRelation(node, 'vertical')}
          label="垂直"
          onChange={(checked) => handleOrientationChange('vertical', checked)}
        />
        <ToggleControl checked={isFixed} label="固定" onChange={handleFixedChange} />
        <ToggleControl
          checked={node.construction}
          label="参考线"
          onChange={handleConstructionChange}
        />
        <ToggleControl
          checked={showSketchRelations}
          label="总是显示约束徽标"
          onChange={setShowSketchRelations}
        />
        {constraintSummary !== '无' && (
          <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
            {constraintSummary}
          </div>
        )}
      </PanelSection>

      <PanelSection defaultExpanded={false} title="求解详情">
        <div className={definitionNoticeClassName}>
          <div className="flex items-center justify-between gap-3">
            <span>定义状态</span>
            <span className="font-medium text-foreground dark:text-foreground">{definitionState.label}</span>
          </div>
          <div className="mt-2">{`控制来源: ${constrainedBySummary}`}</div>
          <div className="mt-1">{`约束覆盖: ${definitionState.score}/${definitionState.target}`}</div>
          {definitionReasonSummary && <div className="mt-1">{`${definitionHintLabel}: ${definitionReasonSummary}`}</div>}
        </div>
      </PanelSection>

      <PanelSection title="控制项">
        <SketchControlManager
          emptyLabel="当前没有可管理的关系或尺寸。"
          getCategory={getSketchLineControlItemCategory}
          items={controlItems}
          onRemoveItem={handleRemoveControl}
          onRemoveItems={handleRemoveControlItems}
        />
      </PanelSection>

      <PanelSection title="当前楼层控制项">
        <SketchControlManager
          emptyLabel="当前楼层没有草图控制项。"
          getCategory={(entry) => entry.category}
          items={levelControlEntries}
          onRemoveItem={handleRemoveLevelControlEntry}
          onRemoveItems={handleRemoveLevelControlEntries}
        />
      </PanelSection>

      <PanelSection title="诊断">
        {diagnostics.length > 0 ? (
          <>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{`发现 ${diagnostics.length} 个问题`}</span>
              </div>
              <ul className="space-y-1">
                {diagnostics.map((issue, index) => (
                  <li key={`${issue.kind}:${index}`}>{issue.message}</li>
                ))}
              </ul>
            </div>
            <ActionGroup>
              <ActionButton
                icon={<Wrench className="h-3.5 w-3.5" />}
                label="清理问题"
                onClick={handleCleanDiagnostics}
              />
            </ActionGroup>
          </>
        ) : (
          <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
            未发现坏约束或悬空引用。
          </div>
        )}
        <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>当前楼层草图</span>
            <span className="font-medium text-foreground">{`${levelDiagnosticSummary.totalIssues} 个问题`}</span>
          </div>
          <div className="mt-2">{`草图线问题: ${levelDiagnosticSummary.lineIssueCount}`}</div>
          <div className="mt-1">{`圆/圆弧问题: ${levelDiagnosticSummary.circleIssueCount}`}</div>
          <div className="mt-1">{`受影响实体: 线 ${levelDiagnosticSummary.affectedLineIds.length} / 圆 ${levelDiagnosticSummary.affectedCircleIds.length}`}</div>
        </div>
        {levelDiagnosticSummary.totalIssues > 0 && (
          <ActionGroup>
            <ActionButton
              icon={<Wrench className="h-3.5 w-3.5" />}
              label="清理当前楼层"
              onClick={handleCleanLevelDiagnostics}
            />
          </ActionGroup>
        )}
      </PanelSection>

      <PanelSection title="操作">
        <ActionGroup>
          <ActionButton
            icon={<AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />}
            label="水平"
            onClick={() => handleOrientationChange('horizontal', true)}
          />
          <ActionButton
            icon={<AlignVerticalJustifyCenter className="h-3.5 w-3.5" />}
            label="垂直"
            onClick={() => handleOrientationChange('vertical', true)}
          />
        </ActionGroup>
        <ActionGroup>
          <ActionButton
            icon={<Lock className="h-3.5 w-3.5" />}
            label={isFixed ? '解除固定' : '固定'}
            onClick={() => handleFixedChange(!isFixed)}
          />
          <ActionButton
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="删除"
            onClick={handleDelete}
            tone="danger"
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
