'use client'

import {
  type AnyNode,
  type AnyNodeId,
  getSketchCirclePathLength,
  type SketchCircleNode,
  type SketchDimensionNode,
  type SketchLineNode,
  type SketchCircleRelation,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { AlertTriangle, Lock, Trash2, Wrench } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { cn } from '../../../lib/utils'
import useEditor from '../../../store/use-editor'
import {
  buildSetSketchCircleArcLengthPlan,
  buildRemoveSketchCircleConstraintReferencesPlan,
  buildSetSketchCircleCenterPlan,
  buildSetSketchCircleRadiusPlan,
  type SketchCircleEditResult,
} from '../../tools/sketch/sketch-circle-constraints'
import {
  buildSketchCircleArcLengthDimensionData,
  buildSketchCircleRadiusDimensionData,
  clearSketchCircleDisplayedDimensionData,
  getSketchCircleDimensionDisplay,
  getSketchCircleDisplayedDimensionLabel,
  getSketchCircleDisplayedDimensionMode,
  getSketchCircleDisplayedDimensionValue,
  toSketchCircleRadiusFromDisplayedValue,
} from '../../tools/sketch/sketch-dimensions'
import {
  getSketchCircleDefinitionState,
  getSketchDefinitionStatusBadgeLabel,
} from '../../tools/sketch/sketch-definition-state'
import {
  buildCleanSketchDiagnosticUpdates,
  buildCleanSketchCircleDiagnosticPatch,
  getSketchDiagnosticSummary,
  getSketchCircleDiagnosticIssues,
} from '../../tools/sketch/sketch-diagnostics'
import {
  buildRemoveSketchCircleControlItemsUpdates,
  buildRemoveSketchLevelControlEntriesUpdates,
  buildRemoveSketchCircleControlUpdates,
  getSketchLevelControlEntries,
  getSketchCircleControlItemCategory,
  getSketchCircleControlItems,
  isSketchControlDeleteUpdate,
  type SketchLevelControlEntry,
  type SketchCircleControlItem,
  type SketchLevelControlUpdate,
} from '../../tools/sketch/sketch-control-items'
import { buildRemoveSketchLineCoincidentReferencesPlan } from '../../tools/sketch/sketch-line-coincident'
import { buildResolvedSketchLineUpdateSet } from '../../tools/sketch/sketch-line-resolution'
import {
  buildPropagateSketchLineTangentsFromCircles,
  buildRemoveSketchLineTangentReferencesPlan,
} from '../../tools/sketch/sketch-line-tangent'
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

function hasRelation(node: SketchCircleNode, relation: SketchCircleRelation) {
  return (node.relations ?? []).includes(relation)
}

export function SketchCirclePanel() {
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
    selectedId
      ? (state.nodes[selectedId as AnyNode['id']] as SketchCircleNode | undefined)
      : undefined,
  )
  const radiusDisplay = node ? getSketchCircleDimensionDisplay(node) : 'radius'
  const sketchCircleById = useMemo(
    () =>
      new Map(
        Object.values(nodes)
          .filter((candidate): candidate is SketchCircleNode => candidate.type === 'sketch-circle')
          .map((circle) => [circle.id, circle] as const),
      ),
    [nodes],
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

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const runSketchCircleEditResult = useCallback(
    (result: SketchCircleEditResult) => {
      if (!result.ok) {
        return
      }

      const nextCircleById = new Map(sketchCircleById)
      for (const update of result.updates) {
        const circle = nextCircleById.get(update.id)
        if (!circle) {
          continue
        }
        nextCircleById.set(update.id, { ...circle, ...update.data })
      }

      const tangentPropagation = buildPropagateSketchLineTangentsFromCircles({
        circlesById: nextCircleById,
        linesById: sketchLineById,
        changedCircleIds: result.updates.map((update) => update.id),
      })
      if (!tangentPropagation.ok) {
        return
      }

      const resolvedLineUpdates = buildResolvedSketchLineUpdateSet({
        linesById: sketchLineById,
        circlesById: nextCircleById,
        initialUpdates: tangentPropagation.updates.map((update) => ({
          id: update.id,
          data: update.data,
        })),
        changedCircleIds: result.updates.map((update) => update.id),
      })
      if (!resolvedLineUpdates.ok) {
        return
      }

      const allUpdates = [
        ...result.updates.map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        })),
        ...resolvedLineUpdates.updates.map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        })),
      ]

      if (allUpdates.length > 0) {
        useScene.getState().updateNodes(
          allUpdates,
        )
        for (const update of allUpdates) {
          useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
        }
        sfxEmitter.emit('sfx:structure-build')
      }

      if (result.selectIds) {
        setSelection({ selectedIds: result.selectIds })
      }
    },
    [setSelection, sketchCircleById, sketchLineById],
  )

  const handleRadiusChange = useCallback(
    (value: number) => {
      if (!(selectedId && node)) {
        return
      }

      if (getSketchCircleDimensionDisplay(node) === 'arc-length') {
        runSketchCircleEditResult(
          buildSetSketchCircleArcLengthPlan({
            circle: node,
            circlesById: sketchCircleById,
            arcLength: value,
            dimensionMode: getSketchCircleDisplayedDimensionMode(node) ?? 'driven',
          }),
        )
        return
      }

      runSketchCircleEditResult(
        buildSetSketchCircleRadiusPlan({
          circle: node,
          circlesById: sketchCircleById,
          dimensionMode: getSketchCircleDisplayedDimensionMode(node) ?? 'driven',
          radius: toSketchCircleRadiusFromDisplayedValue({
            circle: node,
            value,
          }),
        }),
      )
    },
    [node, runSketchCircleEditResult, selectedId, sketchCircleById],
  )

  const handleRadiusDisplayChange = useCallback(
    (display: 'radius' | 'diameter' | 'arc-length') => {
      if (!node) {
        return
      }

      const currentDisplay = getSketchCircleDimensionDisplay(node)
      const currentMode = getSketchCircleDisplayedDimensionMode(node)
      let dimensions = { ...(node.dimensions ?? {}) }

      if (node.kind === 'arc' && display !== currentDisplay) {
        dimensions =
          display === 'arc-length'
            ? currentMode
              ? buildSketchCircleArcLengthDimensionData({
                  circle: { ...node, dimensions },
                  arcLength: getSketchCirclePathLength(node),
                  mode: currentMode,
                })
              : {
                  ...clearSketchCircleDisplayedDimensionData(node),
                  radiusDisplay: 'arc-length' as const,
                }
            : currentMode
              ? buildSketchCircleRadiusDimensionData({
                  circle: { ...node, dimensions },
                  radius: node.radius,
                  mode: currentMode,
                  display: 'radius',
                })
              : {
                  ...clearSketchCircleDisplayedDimensionData(node),
                  radiusDisplay: 'radius' as const,
                }
      } else {
        dimensions = {
          ...dimensions,
          radiusDisplay: display,
        }
      }

      updateNode(
        node.id as AnyNodeId,
        {
          dimensions,
        } as Partial<AnyNode>,
      )
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, updateNode],
  )

  const handleRadiusDimensionModeChange = useCallback(
    (mode: 'none' | 'driven' | 'reference') => {
      if (!node) {
        return
      }

      const dimensions =
        mode === 'none'
          ? clearSketchCircleDisplayedDimensionData(node)
          : radiusDisplay === 'arc-length'
            ? buildSketchCircleArcLengthDimensionData({
                circle: node,
                arcLength: getSketchCirclePathLength(node),
                mode,
              })
            : buildSketchCircleRadiusDimensionData({
                circle: node,
                radius: node.radius,
                mode,
                display: radiusDisplay,
              })
      updateNode(node.id as AnyNodeId, { dimensions } as Partial<AnyNode>)
      useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
      sfxEmitter.emit('sfx:structure-build')
    },
    [node, radiusDisplay, updateNode],
  )

  const handleCenterChange = useCallback(
    (center: SketchCircleNode['center']) => {
      if (!(selectedId && node)) {
        return
      }

      runSketchCircleEditResult(
        buildSetSketchCircleCenterPlan({
          circle: node,
          circlesById: sketchCircleById,
          center,
        }),
      )
    },
    [node, runSketchCircleEditResult, selectedId, sketchCircleById],
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
    const cleanupUpdates = buildRemoveSketchCircleConstraintReferencesPlan({
      circlesById: sketchCircleById,
      deletedIds: [node.id],
    })
    const tangentCleanupUpdates = buildRemoveSketchLineTangentReferencesPlan({
      deletedCircleIds: [node.id],
      linesById: sketchLineById,
    })
    const coincidentCleanupUpdates = buildRemoveSketchLineCoincidentReferencesPlan({
      linesById: sketchLineById,
      deletedCircleIds: [node.id],
    })
    if (
      cleanupUpdates.length > 0 ||
      tangentCleanupUpdates.length > 0 ||
      coincidentCleanupUpdates.length > 0
    ) {
      useScene.getState().updateNodes(
        [
          ...cleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
          ...tangentCleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
          ...coincidentCleanupUpdates.map((update) => ({
            id: update.id as AnyNodeId,
            data: update.data as Partial<AnyNode>,
          })),
        ],
      )
      for (const update of [
        ...cleanupUpdates,
        ...tangentCleanupUpdates,
        ...coincidentCleanupUpdates,
      ]) {
        useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
      }
    }
    sfxEmitter.emit('sfx:item-delete')
    deleteNode(node.id as AnyNodeId)
    setSelection({ selectedIds: [] })
  }, [deleteNode, node, setSelection, sketchCircleById, sketchLineById])

  if (!(node && node.type === 'sketch-circle' && selectedId && selectedCount === 1)) {
    return null
  }

  const isFixed = hasRelation(node, 'fixed')
  const circleDimensionLabel = getSketchCircleDisplayedDimensionLabel(node)
  const displayedDimensionValue = getSketchCircleDisplayedDimensionValue({ circle: node })
  const radiusDimensionMode = getSketchCircleDisplayedDimensionMode(node) ?? 'none'
  const concentricCount = (node.constraints ?? []).filter(
    (constraint) => constraint.kind === 'concentric',
  ).length
  const equalRadiusCount = (node.constraints ?? []).filter(
    (constraint) => constraint.kind === 'equal-radius',
  ).length
  const tangentCount = (node.constraints ?? []).filter(
    (constraint) => constraint.kind === 'tangent',
  ).length
  const constraintSummary =
    concentricCount || equalRadiusCount || tangentCount
      ? [
          concentricCount > 0 ? `同心 ${concentricCount}` : null,
          equalRadiusCount > 0 ? `等半径 ${equalRadiusCount}` : null,
          tangentCount > 0 ? `相切 ${tangentCount}` : null,
        ]
          .filter(Boolean)
          .join(' / ')
      : '无'
  const definitionState = getSketchCircleDefinitionState({
    circle: node,
    sketchLines: [...sketchLineById.values()],
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
      ? isFixed
        ? '固定'
        : '自由'
      : isFixed
        ? `固定 / ${constraintSummary}`
        : constraintSummary
  const definitionNoticeClassName = cn(
    'rounded-md border px-3 py-2 text-[11px]',
    definitionState.status === 'over-defined'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : definitionState.status === 'under-defined'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
        : 'border-border/55 bg-muted/35 text-muted-foreground',
  )
  const definitionHintLabel = definitionState.status === 'over-defined' ? '冲突' : '提示'
  const diagnostics = getSketchCircleDiagnosticIssues({
    circle: node,
    circlesById: sketchCircleById,
  })
  const currentLevelId = node.parentId
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
  const controlItems = getSketchCircleControlItems({
    circle: node,
    circlesById: sketchCircleById,
  })
  const levelControlEntries = getSketchLevelControlEntries({
    lines: levelSketchLines,
    circles: levelSketchCircles,
    linesById: sketchLineById,
    circlesById: sketchCircleById,
  })
  const icon = node.kind === 'arc' ? '/icons/sketch-arc.svg' : '/icons/sketch-circle.svg'
  const title = node.name || (node.kind === 'arc' ? '草图圆弧' : '草图圆')

  const handleCleanDiagnostics = () => {
    if (!node) {
      return
    }

    const patch = buildCleanSketchCircleDiagnosticPatch({
      circle: node,
      circlesById: sketchCircleById,
    })
    if (!patch) {
      return
    }

    updateNode(node.id as AnyNodeId, patch as Partial<AnyNode>)
    useScene.getState().dirtyNodes.add(node.id as AnyNodeId)
    sfxEmitter.emit('sfx:structure-build')
  }

  const applySketchLevelControlUpdates = useCallback(
    (updates: SketchLevelControlUpdate[]) => {
      const nodeUpdates = updates
        .filter((update): update is Exclude<SketchLevelControlUpdate, { delete: true }> => !isSketchControlDeleteUpdate(update))
        .map((update) => ({
          id: update.id as AnyNodeId,
          data: update.data as Partial<AnyNode>,
        }))

      if (nodeUpdates.length > 0) {
        updateNodes(nodeUpdates)
      }

      for (const update of updates) {
        if (isSketchControlDeleteUpdate(update)) {
          deleteNode(update.id as AnyNodeId)
          continue
        }
        useScene.getState().dirtyNodes.add(update.id as AnyNodeId)
      }

      sfxEmitter.emit('sfx:structure-build')
    },
    [deleteNode, updateNodes],
  )

  const handleRemoveControl = (item: SketchCircleControlItem) => {
    const updates = buildRemoveSketchCircleControlUpdates({
      circle: node,
      item,
      circlesById: sketchCircleById,
    })
    if (updates.length === 0) {
      return
    }

    applySketchLevelControlUpdates(updates)
  }

  const handleRemoveControlItems = (items: SketchCircleControlItem[]) => {
    const updates = buildRemoveSketchCircleControlItemsUpdates({
      circle: node,
      items,
      circlesById: sketchCircleById,
    })
    if (updates.length === 0) {
      return
    }

    applySketchLevelControlUpdates(updates)
  }

  const handleRemoveLevelControlEntry = (entry: SketchLevelControlEntry) => {
    const updates = buildRemoveSketchLevelControlEntriesUpdates({
      entries: [entry],
      linesById: sketchLineById,
      circlesById: sketchCircleById,
    })
    if (updates.length === 0) {
      return
    }

    applySketchLevelControlUpdates(updates)
  }

  const handleRemoveLevelControlEntries = (entries: SketchLevelControlEntry[]) => {
    const updates = buildRemoveSketchLevelControlEntriesUpdates({
      entries,
      linesById: sketchLineById,
      circlesById: sketchCircleById,
    })
    if (updates.length === 0) {
      return
    }

    applySketchLevelControlUpdates(updates)
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

    useScene.getState().updateNodes(
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
    <PanelWrapper icon={icon} onClose={handleClose} title={title} width={340}>
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
              <InspectorBadge>{node.kind === 'arc' ? '圆弧' : '圆'}</InspectorBadge>
              <InspectorBadge>{node.construction ? '参考线' : '轮廓'}</InspectorBadge>
            </>
          }
        />
        <InspectorStat label={circleDimensionLabel} value={`${displayedDimensionValue.toFixed(2)} m`} />
        <InspectorStat label="长度" value={`${getSketchCirclePathLength(node).toFixed(2)} m`} />
        <InspectorStat label="约束状态" value={constraintStatusSummary} />
        <InspectorStat label="定义状态" value={definitionSummaryValue} />
      </InspectorSummary>

      <PanelSection title="几何">
        <MetricControl
          label={circleDimensionLabel}
          max={200}
          min={node.kind === 'circle' && radiusDisplay === 'diameter' ? 0.02 : 0.01}
          onChange={handleRadiusChange}
          precision={2}
          step={0.01}
          unit="m"
          value={displayedDimensionValue}
        />
        <MetricControl
          label="中心 X"
          onChange={(value) => handleCenterChange([value, node.center[1]])}
          precision={2}
          step={0.01}
          unit="m"
          value={node.center[0]}
        />
        <MetricControl
          label="中心 Z"
          onChange={(value) => handleCenterChange([node.center[0], value])}
          precision={2}
          step={0.01}
          unit="m"
          value={node.center[1]}
        />
        {isFixed && (
          <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
            草图圆已固定，关闭固定后才能修改几何。
          </div>
        )}
      </PanelSection>

      <PanelSection title="尺寸">
        <SegmentedControl
          onChange={handleRadiusDimensionModeChange}
          options={[
            { label: '无', value: 'none' },
            { label: '驱动', value: 'driven' },
            { label: '参考', value: 'reference' },
          ]}
          value={radiusDimensionMode}
        />
        <SegmentedControl
          className="mt-2"
          onChange={handleRadiusDisplayChange}
          options={
            node.kind === 'circle'
              ? [
                  { label: '半径', value: 'radius' },
                  { label: '直径', value: 'diameter' },
                ]
              : [
                  { label: '半径', value: 'radius' },
                  { label: '弧长', value: 'arc-length' },
                ]
          }
          value={radiusDisplay}
        />
        <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
          {radiusDimensionMode === 'reference'
            ? `参考尺寸只显示当前${circleDimensionLabel}，不参与几何锁定。`
            : radiusDimensionMode === 'driven'
              ? `驱动尺寸会作为${circleDimensionLabel}控制项参与草图定义。`
              : `当前没有持久化${circleDimensionLabel}尺寸。`}
        </div>
      </PanelSection>

      <PanelSection title="关系">
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
        {(concentricCount > 0 || equalRadiusCount > 0 || tangentCount > 0) && (
          <div className="rounded-md border border-border/55 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
            {concentricCount > 0 && <div>{`同心约束: ${concentricCount}`}</div>}
            {equalRadiusCount > 0 && <div>{`等半径约束: ${equalRadiusCount}`}</div>}
            {tangentCount > 0 && <div>{`相切约束: ${tangentCount}`}</div>}
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
          getCategory={getSketchCircleControlItemCategory}
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
