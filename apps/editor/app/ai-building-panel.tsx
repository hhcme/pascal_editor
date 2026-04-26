'use client'

import { type AnyNode, emitter, type LevelNode, useScene, type ZoneNode } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AiBuildingCopy,
  type AiBuildingDiagnosticFocusRef,
  type AiBuildingFormState,
  type AiBuildingLanguage,
  type AiBuildingPlan,
  type AiBuildingRepairSummary,
  type AiBuildingRoomDiagnostic,
  COPY,
  clampNumber,
  createPlan,
  getSceneContext,
  getSceneFootprintLimits,
} from '../lib/ai-building'

type AiBuildingFengShuiAdvisory = NonNullable<
  AiBuildingPlan['analysis']['rules']
>['fengShuiAdvisories'][number]
type AiBuildingRoomLocator = {
  level: number
  roomKey: string
  roomName: string
}

function getNodeMetadata(
  node: Pick<AnyNode, 'metadata'> | null | undefined,
): Record<string, unknown> {
  return node && typeof node.metadata === 'object' && node.metadata
    ? (node.metadata as Record<string, unknown>)
    : {}
}

function findAppliedRoomNode(
  nodes: Record<string, AnyNode>,
  planId: string,
  roomRef: Pick<AiBuildingRoomLocator, 'level' | 'roomKey'>,
) {
  return (
    Object.values(nodes).find((node): node is ZoneNode => {
      if (node.type !== 'zone') return false

      const metadata = getNodeMetadata(node)
      return (
        metadata.source === 'ai-building:v1' &&
        metadata.planId === planId &&
        metadata.role === 'room' &&
        metadata.roomKey === roomRef.roomKey &&
        metadata.level === roomRef.level
      )
    }) ?? null
  )
}

function findAppliedDiagnosticNodeIds(
  nodes: Record<string, AnyNode>,
  planId: string,
  diagnostic: AiBuildingRoomDiagnostic,
) {
  const matchingIds = diagnostic.focusRefs.flatMap((focusRef) =>
    Object.values(nodes)
      .filter((node) => {
        const metadata = getNodeMetadata(node)
        if (
          metadata.source !== 'ai-building:v1' ||
          metadata.planId !== planId ||
          metadata.level !== diagnostic.level
        ) {
          return false
        }

        return matchesDiagnosticFocusRef(metadata, focusRef)
      })
      .map((node) => node.id),
  )

  return Array.from(new Set(matchingIds))
}

function matchesDiagnosticFocusRef(
  metadata: Record<string, unknown>,
  focusRef: AiBuildingDiagnosticFocusRef,
) {
  if (focusRef.type === 'item') {
    return metadata.role === 'item' && metadata.detailKey === focusRef.key
  }

  if (focusRef.type === 'wall') {
    return (
      metadata.wallKey === focusRef.key && (metadata.role === 'inner' || metadata.role === 'outer')
    )
  }

  return metadata.role === focusRef.openingKind && metadata.wallKey === focusRef.key
}

function getFengShuiSeverityToneClass(severity: AiBuildingFengShuiAdvisory['severity']) {
  if (severity === 'high') return 'bg-red-100 text-red-700'
  if (severity === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-sky-100 text-sky-700'
}

function getFengShuiEvidenceToneClass(evidenceLevel: AiBuildingFengShuiAdvisory['evidenceLevel']) {
  if (evidenceLevel === 'A_ENVIRONMENT_OVERLAP') return 'bg-emerald-100 text-emerald-700'
  if (evidenceLevel === 'B_TRADITIONAL_STRONG') return 'bg-stone-100 text-stone-700'
  return 'bg-muted text-muted-foreground'
}

function getRepairStatusToneClass(status: AiBuildingRepairSummary['status']) {
  if (status === 'active') return 'bg-red-100 text-red-700'
  if (status === 'watch') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function formatFengShuiRepairHint(copy: AiBuildingCopy, hint: string) {
  const repairHintLabels = copy.fengShuiRepairHintLabels as Record<string, string>
  const label = repairHintLabels[hint]
  return label ?? hint.replaceAll('_', ' ')
}

function formatPlanRoomRefLabel(copy: AiBuildingCopy, roomRef: AiBuildingRoomLocator) {
  const levelLabel = copy.floorsUnit === '层' ? `层 ${roomRef.level + 1}` : `L${roomRef.level + 1}`
  return `${levelLabel} · ${roomRef.roomName}`
}

function getFengShuiEvidenceItems(copy: AiBuildingCopy, advisory: AiBuildingFengShuiAdvisory) {
  const issueLabelsByCode = copy.fengShuiIssueLabels as Partial<Record<string, string>>
  const issueLabels = Array.from(
    new Set(
      advisory.relatedIssueCodes
        .map((issueCode) => issueLabelsByCode[issueCode] ?? null)
        .filter((label): label is string => Boolean(label)),
    ),
  )

  if (issueLabels.length > 0) return issueLabels
  return Array.from(new Set(advisory.relatedMessages.filter(Boolean)))
}

function PlanPreview({
  copy,
  onFocusRepairSummary,
  onFocusFengShuiAdvisory,
  onFocusRoomDiagnostic,
  plan,
}: {
  copy: AiBuildingCopy
  onFocusRepairSummary: (summary: AiBuildingRepairSummary) => void
  onFocusFengShuiAdvisory: (advisory: AiBuildingFengShuiAdvisory) => void
  onFocusRoomDiagnostic: (diagnostic: AiBuildingRoomDiagnostic) => void
  plan: AiBuildingPlan
}) {
  const wallCount = plan.floors.reduce((total, floor) => total + floor.walls.length, 0)
  const openingCount = plan.floors.reduce((total, floor) => total + floor.openings.length, 0)
  const roomCount = plan.floors.reduce((total, floor) => total + floor.rooms.length, 0)
  const detailCount = plan.floors.reduce(
    (total, floor) =>
      total +
      floor.ceilings.length +
      floor.detailSlabs.length +
      floor.fences.length +
      floor.items.length +
      floor.roofs.length +
      floor.stairs.length,
    0,
  )
  const firstFloor = plan.floors[0]
  const formatMeters = (value: number | null) =>
    typeof value === 'number' ? `${value.toFixed(1)}m` : '—'
  const strategySummary =
    copy.selectedStrategy +
    ' · ' +
    copy.openingBiasLabels[plan.analysis.selection.openingBias] +
    ' / ' +
    copy.furnishingBiasLabels[plan.analysis.selection.furnishingBias]
  const repairSummaries = plan.analysis.repairSummaries.slice(0, 3)
  const roomDiagnostics = plan.analysis.roomDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic.optimized || diagnostic.warnings.length > 0 || diagnostic.highlights.length > 0,
    )
    .slice(0, 4)
  const fengShuiAdvisories = (plan.analysis.rules?.fengShuiAdvisories ?? []).slice(0, 4)
  const formatLevelLabel = (level: number) =>
    copy.floorsUnit === '层' ? `层 ${level + 1}` : `L${level + 1}`

  return (
    <section className="rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{copy.plan}</div>
          <div className="truncate text-muted-foreground text-xs">{plan.summary}</div>
        </div>
        <div className="shrink-0 rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary text-xs">
          {plan.floors.length} {copy.floorsUnit}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-md border border-border/50 bg-sidebar px-2 py-2">
          <div className="font-semibold">{wallCount}</div>
          <div className="text-muted-foreground">{copy.walls}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-sidebar px-2 py-2">
          <div className="font-semibold">{roomCount}</div>
          <div className="text-muted-foreground">{copy.rooms}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-sidebar px-2 py-2">
          <div className="font-semibold">{openingCount}</div>
          <div className="text-muted-foreground">{copy.openings}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-sidebar px-2 py-2">
          <div className="font-semibold">{detailCount}</div>
          <div className="text-muted-foreground">{copy.details}</div>
        </div>
      </div>

      {firstFloor ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {firstFloor.rooms.map((room) => (
            <span
              className="rounded-full border border-border/50 px-2 py-1 text-xs"
              key={room.key}
              style={{ borderColor: `${room.color}66`, color: room.color }}
            >
              {room.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-border/50 bg-sidebar/70 p-3">
        <div className="font-semibold text-sm">{copy.analysis}</div>
        <div className="mt-1 text-muted-foreground text-xs">{strategySummary}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md border border-border/50 bg-background px-2 py-2">
            <div className="font-semibold">{plan.analysis.scores.overall}</div>
            <div className="text-muted-foreground">{copy.overallScore}</div>
          </div>
          <div className="rounded-md border border-border/50 bg-background px-2 py-2">
            <div className="font-semibold">{plan.analysis.scores.openingAlignment}</div>
            <div className="text-muted-foreground">{copy.openingAlignment}</div>
          </div>
          <div className="rounded-md border border-border/50 bg-background px-2 py-2">
            <div className="font-semibold">{plan.analysis.scores.circulation}</div>
            <div className="text-muted-foreground">{copy.circulationScore}</div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border/50 bg-background px-2 py-2">
            <div className="font-medium">
              {plan.analysis.openingStrategy.alignedOpenings}/
              {plan.analysis.openingStrategy.eligibleOpenings}
            </div>
            <div className="text-muted-foreground">{copy.alignedOpenings}</div>
          </div>
          <div className="rounded-md border border-border/50 bg-background px-2 py-2">
            <div className="font-medium">
              {formatMeters(plan.analysis.circulation.averageClearance)}
            </div>
            <div className="text-muted-foreground">{copy.averageClearance}</div>
          </div>
        </div>

        {plan.analysis.highlights.length ? (
          <div className="mt-3 space-y-1 text-xs">
            <div className="font-medium text-foreground">{copy.highlights}</div>
            {plan.analysis.highlights.map((highlight) => (
              <div className="text-muted-foreground" key={highlight}>
                {highlight}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-3 space-y-1 text-xs">
          <div className="font-medium text-foreground">{copy.warnings}</div>
          {plan.analysis.warnings.length ? (
            plan.analysis.warnings.map((warning) => (
              <div className="text-muted-foreground" key={warning}>
                {warning}
              </div>
            ))
          ) : (
            <div className="text-muted-foreground">{copy.noWarnings}</div>
          )}
        </div>

        <div className="mt-3 space-y-2 text-xs">
          <div className="font-medium text-foreground">{copy.repairSummaries}</div>
          {repairSummaries.length ? (
            repairSummaries.map((summary) => {
              const focusable = summary.roomRefs.length > 0

              return (
                <button
                  className="w-full rounded-md border border-border/50 bg-background px-2 py-2 text-left transition-shadow hover:shadow-sm disabled:cursor-default disabled:hover:shadow-none"
                  disabled={!focusable}
                  key={summary.key}
                  onClick={() => onFocusRepairSummary(summary)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{summary.title}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-medium text-[11px] ${getRepairStatusToneClass(summary.status)}`}
                    >
                      {copy.repairStatusLabels[summary.status]}
                    </span>
                  </div>

                  {summary.roomRefs.length ? (
                    <div className="mt-2">
                      <div className="mb-1 font-medium text-foreground">
                        {copy.repairRelatedRooms}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {summary.roomRefs.slice(0, 3).map((roomRef) => (
                          <span
                            className="rounded-full border border-border/50 bg-sidebar px-2 py-0.5 text-[11px] text-muted-foreground"
                            key={`${summary.key}:${roomRef.level}:${roomRef.roomKey}`}
                          >
                            {formatPlanRoomRefLabel(copy, roomRef)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-2 space-y-2 text-muted-foreground">
                    <div>
                      <div className="font-medium text-foreground">{copy.repairWhy}</div>
                      <div>{summary.reason}</div>
                    </div>

                    {summary.appliedActions.length ? (
                      <div>
                        <div className="mb-1 font-medium text-foreground">{copy.repairApplied}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {summary.appliedActions.slice(0, 3).map((action) => (
                            <span
                              className="rounded-full border border-border/50 bg-sidebar px-2 py-0.5 text-[11px] text-muted-foreground"
                              key={`${summary.key}:applied:${action}`}
                            >
                              {action}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {summary.nextActions.length ? (
                      <div>
                        <div className="mb-1 font-medium text-foreground">{copy.repairNext}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {summary.nextActions.slice(0, 3).map((action) => (
                            <span
                              className="rounded-full border border-border/50 bg-sidebar px-2 py-0.5 text-[11px] text-muted-foreground"
                              key={`${summary.key}:next:${action}`}
                            >
                              {action}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })
          ) : (
            <div className="text-muted-foreground">{copy.repairSummariesEmpty}</div>
          )}
        </div>

        <div className="mt-3 space-y-2 text-xs">
          <div className="font-medium text-foreground">{copy.fengShui}</div>
          {fengShuiAdvisories.length ? (
            fengShuiAdvisories.map((advisory) => {
              const focusable = advisory.roomRefs.length > 0
              const evidenceItems = getFengShuiEvidenceItems(copy, advisory).slice(0, 2)

              return (
                <button
                  className="w-full rounded-md border border-border/50 bg-background px-2 py-2 text-left transition-shadow hover:shadow-sm disabled:cursor-default disabled:hover:shadow-none"
                  disabled={!focusable}
                  key={advisory.code}
                  onClick={() => onFocusFengShuiAdvisory(advisory)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {advisory.userFacingLabels.modern}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {advisory.userFacingLabels.traditional}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium text-[11px] ${getFengShuiSeverityToneClass(advisory.severity)}`}
                      >
                        {copy.fengShuiSeverityLabels[advisory.severity]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium text-[11px] ${getFengShuiEvidenceToneClass(advisory.evidenceLevel)}`}
                      >
                        {copy.fengShuiEvidenceLabels[advisory.evidenceLevel]}
                      </span>
                    </div>
                  </div>

                  {advisory.roomRefs.length ? (
                    <div className="mt-2">
                      <div className="mb-1 font-medium text-foreground">
                        {copy.fengShuiRelatedRooms}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {advisory.roomRefs.slice(0, 3).map((roomRef) => (
                          <span
                            className="rounded-full border border-border/50 bg-sidebar px-2 py-0.5 text-[11px] text-muted-foreground"
                            key={`${advisory.code}:${roomRef.level}:${roomRef.roomKey}`}
                          >
                            {formatPlanRoomRefLabel(copy, roomRef)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {evidenceItems.length ? (
                    <div className="mt-2">
                      <div className="mb-1 font-medium text-foreground">{copy.fengShuiWhy}</div>
                      <div className="space-y-1 text-muted-foreground">
                        {evidenceItems.map((item) => (
                          <div key={`${advisory.code}:${item}`}>{item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div>
                      <span className="mr-1 font-medium text-foreground">
                        {copy.fengShuiTraditional}
                      </span>
                      {advisory.traditionalRationale}
                    </div>
                    <div>
                      <span className="mr-1 font-medium text-foreground">
                        {copy.fengShuiModern}
                      </span>
                      {advisory.modernRationale}
                    </div>
                  </div>

                  {advisory.repairHints.length ? (
                    <div className="mt-2">
                      <div className="mb-1 font-medium text-foreground">{copy.fengShuiFix}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {advisory.repairHints.slice(0, 3).map((hint) => (
                          <span
                            className="rounded-full border border-border/50 bg-sidebar px-2 py-0.5 text-[11px] text-muted-foreground"
                            key={`${advisory.code}:${hint}`}
                          >
                            {formatFengShuiRepairHint(copy, hint)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </button>
              )
            })
          ) : (
            <div className="text-muted-foreground">{copy.fengShuiEmpty}</div>
          )}
        </div>

        <div className="mt-3 space-y-2 text-xs">
          <div className="font-medium text-foreground">{copy.roomDiagnostics}</div>
          {roomDiagnostics.length ? (
            roomDiagnostics.map((diagnostic) => {
              const toneClass =
                diagnostic.status === 'bad'
                  ? 'border-red-200 bg-red-50/60 text-red-700'
                  : diagnostic.status === 'warn'
                    ? 'border-amber-200 bg-amber-50/60 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50/60 text-emerald-700'
              const scoreClass =
                diagnostic.status === 'bad'
                  ? 'bg-red-100 text-red-700'
                  : diagnostic.status === 'warn'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
              const messages =
                diagnostic.warnings.length > 0 ? diagnostic.warnings : diagnostic.highlights

              return (
                <button
                  className={`w-full rounded-md border px-2 py-2 text-left transition-shadow hover:shadow-sm ${toneClass}`}
                  key={`${diagnostic.level}:${diagnostic.roomKey}`}
                  onClick={() => onFocusRoomDiagnostic(diagnostic)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {diagnostic.roomName}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatLevelLabel(diagnostic.level)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {diagnostic.optimized ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[11px] text-primary">
                          {copy.optimizedRoom}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold text-[11px] ${scoreClass}`}
                      >
                        {diagnostic.score}
                      </span>
                    </div>
                  </div>
                  {typeof diagnostic.minBoundaryClearance === 'number' ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {copy.averageClearance} {formatMeters(diagnostic.minBoundaryClearance)}
                    </div>
                  ) : null}
                  {messages.length ? (
                    <div className="mt-1 space-y-1">
                      {messages.slice(0, 2).map((message) => (
                        <div className="text-muted-foreground" key={message}>
                          {message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </button>
              )
            })
          ) : (
            <div className="text-muted-foreground">{copy.roomDiagnosticsEmpty}</div>
          )}
        </div>
      </div>
    </section>
  )
}

export function AiBuildingPanel({ language }: { language: AiBuildingLanguage }) {
  const copy = COPY[language]
  const selectedBuildingId = useViewer((state) => state.selection.buildingId)
  const setPreviewSelectedIds = useViewer((state) => state.setPreviewSelectedIds)
  const nodes = useScene((state) => state.nodes)
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const sceneContext = useMemo(
    () => getSceneContext(nodes, rootNodeIds, selectedBuildingId),
    [nodes, rootNodeIds, selectedBuildingId],
  )
  const [status, setStatus] = useState<{ tone: 'success' | 'info'; text: string } | null>(null)
  const [form, setForm] = useState<AiBuildingFormState>({
    buildingType: 'residential',
    style: 'modern',
    variant: 'balanced',
    floors: 3,
    width: 18,
    depth: 14,
    prompt: copy.defaultPrompt,
  })
  const footprintLimits = useMemo(
    () => getSceneFootprintLimits(sceneContext, form.buildingType),
    [form.buildingType, sceneContext],
  )
  const panelTitle = copy.analysis
  const panelModeLabel = language === 'zh-CN' ? '只读' : 'Read-only'
  const workspaceHint =
    language === 'zh-CN'
      ? '左侧仅保留方案评估和房间诊断；生成与应用请在右侧 AI 工作区完成。'
      : 'This panel is read-only for plan analysis and room diagnostics. Generate and apply drafts from the AI workspace.'
  const roomFocusUnavailableMessage =
    language === 'zh-CN'
      ? '当前评估结果还未和已应用方案对齐，请先在右侧 AI 工作区应用到编辑器后再定位房间。'
      : 'This analysis is not aligned with an applied draft yet. Apply the draft from the AI workspace before focusing a room.'

  useEffect(() => {
    setForm((current) => ({
      ...current,
      floors:
        sceneContext.levelCount > 1 ? clampNumber(sceneContext.levelCount, 1, 8) : current.floors,
      width: footprintLimits.suggestedWidth,
      depth: footprintLimits.suggestedDepth,
      prompt: copy.defaultPrompt,
    }))
  }, [
    copy.defaultPrompt,
    footprintLimits.suggestedDepth,
    footprintLimits.suggestedWidth,
    sceneContext.levelCount,
  ])

  const formatMeters = (value: number) =>
    Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)

  const siteSummary =
    typeof sceneContext.siteWidth === 'number' && typeof sceneContext.siteDepth === 'number'
      ? `${copy.projectContext} ${formatMeters(sceneContext.siteWidth)}m x ${formatMeters(sceneContext.siteDepth)}m`
      : copy.siteFallback
  const buildableSummary =
    typeof footprintLimits.buildableWidth === 'number' &&
    typeof footprintLimits.buildableDepth === 'number'
      ? `${copy.buildableContext} ${formatMeters(footprintLimits.buildableWidth)}m x ${formatMeters(footprintLimits.buildableDepth)}m`
      : null
  const setbackSummary = footprintLimits.hasSetbackRules
    ? Object.entries(footprintLimits.setbackRules)
        .filter(
          (entry): entry is [keyof typeof copy.setbackRuleLabels, number] =>
            typeof entry[1] === 'number',
        )
        .map(([key, value]) => `${copy.setbackRuleLabels[key]} ${formatMeters(value)}m`)
        .join(' / ')
    : ''
  const primaryGridSummary = footprintLimits.primaryGrid
    ? [
        `${copy.gridContext} ${footprintLimits.primaryGrid.axisCount}${language === 'zh-CN' ? ' 轴' : ' axes'}`,
        language === 'zh-CN'
          ? `平均轴距 ${formatMeters(footprintLimits.primaryGrid.averageSpacing ?? 0)}m`
          : `Avg spacing ${formatMeters(footprintLimits.primaryGrid.averageSpacing ?? 0)}m`,
        typeof footprintLimits.primaryGrid.totalSpan === 'number'
          ? language === 'zh-CN'
            ? `总跨度 ${formatMeters(footprintLimits.primaryGrid.totalSpan)}m`
            : `Total span ${formatMeters(footprintLimits.primaryGrid.totalSpan)}m`
          : null,
      ]
        .filter((entry): entry is string => Boolean(entry))
        .join(' / ')
    : ''

  const draftPlan = useMemo(
    () => createPlan(form, language, sceneContext),
    [form, language, sceneContext],
  )
  const plan = draftPlan

  useEffect(() => {
    if (!plan.id) return
    setPreviewSelectedIds([])
  }, [plan.id, setPreviewSelectedIds])

  const handleFocusRoomDiagnostic = useCallback(
    (diagnostic: AiBuildingRoomDiagnostic) => {
      const roomNode = findAppliedRoomNode(nodes, plan.id, diagnostic)
      if (!roomNode) {
        setPreviewSelectedIds([])
        setStatus({ tone: 'info', text: roomFocusUnavailableMessage })
        return
      }

      const focusNodeIds = findAppliedDiagnosticNodeIds(nodes, plan.id, diagnostic).filter(
        (nodeId) => nodeId !== roomNode.id,
      )

      const levelId = roomNode.parentId as LevelNode['id']
      const levelNode = nodes[levelId]
      const buildingId =
        levelNode?.type === 'level'
          ? (levelNode.parentId as typeof selectedBuildingId)
          : selectedBuildingId

      useEditor.getState().setViewMode('3d')
      useViewer.getState().setSelection({
        buildingId: (buildingId ?? null) as never,
        levelId: levelId as never,
        zoneId: roomNode.id as never,
      })
      setPreviewSelectedIds(focusNodeIds)

      requestAnimationFrame(() => {
        emitter.emit('camera-controls:focus', { nodeId: roomNode.id })
      })
      setStatus({ tone: 'info', text: copy.focusedRoom(diagnostic.roomName) })
    },
    [copy, nodes, plan.id, roomFocusUnavailableMessage, selectedBuildingId, setPreviewSelectedIds],
  )

  const handleFocusFengShuiAdvisory = useCallback(
    (advisory: AiBuildingFengShuiAdvisory) => {
      const focusRoom =
        advisory.roomRefs.find((roomRef) =>
          plan.analysis.roomDiagnostics.some(
            (diagnostic) =>
              diagnostic.level === roomRef.level && diagnostic.roomKey === roomRef.roomKey,
          ),
        ) ?? advisory.roomRefs[0]

      if (!focusRoom) {
        setPreviewSelectedIds([])
        return
      }

      const roomNode = findAppliedRoomNode(nodes, plan.id, focusRoom)
      if (!roomNode) {
        setPreviewSelectedIds([])
        setStatus({ tone: 'info', text: roomFocusUnavailableMessage })
        return
      }

      const relatedDiagnostic =
        plan.analysis.roomDiagnostics.find(
          (diagnostic) =>
            diagnostic.level === focusRoom.level && diagnostic.roomKey === focusRoom.roomKey,
        ) ?? null
      const focusNodeIds = relatedDiagnostic
        ? findAppliedDiagnosticNodeIds(nodes, plan.id, relatedDiagnostic).filter(
            (nodeId) => nodeId !== roomNode.id,
          )
        : []

      const levelId = roomNode.parentId as LevelNode['id']
      const levelNode = nodes[levelId]
      const buildingId =
        levelNode?.type === 'level'
          ? (levelNode.parentId as typeof selectedBuildingId)
          : selectedBuildingId

      useEditor.getState().setViewMode('3d')
      useViewer.getState().setSelection({
        buildingId: (buildingId ?? null) as never,
        levelId: levelId as never,
        zoneId: roomNode.id as never,
      })
      setPreviewSelectedIds(focusNodeIds)

      requestAnimationFrame(() => {
        emitter.emit('camera-controls:focus', { nodeId: roomNode.id })
      })
      setStatus({ tone: 'info', text: copy.focusedRoom(focusRoom.roomName) })
    },
    [
      copy,
      nodes,
      plan.analysis.roomDiagnostics,
      plan.id,
      roomFocusUnavailableMessage,
      selectedBuildingId,
      setPreviewSelectedIds,
    ],
  )

  const handleFocusRepairSummary = useCallback(
    (summary: AiBuildingRepairSummary) => {
      const focusRoom =
        summary.roomRefs.find((roomRef) =>
          plan.analysis.roomDiagnostics.some(
            (diagnostic) =>
              diagnostic.level === roomRef.level && diagnostic.roomKey === roomRef.roomKey,
          ),
        ) ?? summary.roomRefs[0]

      if (!focusRoom) {
        setPreviewSelectedIds([])
        return
      }

      const roomNode = findAppliedRoomNode(nodes, plan.id, focusRoom)
      if (!roomNode) {
        setPreviewSelectedIds([])
        setStatus({ tone: 'info', text: roomFocusUnavailableMessage })
        return
      }

      const relatedDiagnostic =
        plan.analysis.roomDiagnostics.find(
          (diagnostic) =>
            diagnostic.level === focusRoom.level && diagnostic.roomKey === focusRoom.roomKey,
        ) ?? null
      const focusNodeIds = relatedDiagnostic
        ? findAppliedDiagnosticNodeIds(nodes, plan.id, relatedDiagnostic).filter(
            (nodeId) => nodeId !== roomNode.id,
          )
        : []

      const levelId = roomNode.parentId as LevelNode['id']
      const levelNode = nodes[levelId]
      const buildingId =
        levelNode?.type === 'level'
          ? (levelNode.parentId as typeof selectedBuildingId)
          : selectedBuildingId

      useEditor.getState().setViewMode('3d')
      useViewer.getState().setSelection({
        buildingId: (buildingId ?? null) as never,
        levelId: levelId as never,
        zoneId: roomNode.id as never,
      })
      setPreviewSelectedIds(focusNodeIds)

      requestAnimationFrame(() => {
        emitter.emit('camera-controls:focus', { nodeId: roomNode.id })
      })
      setStatus({ tone: 'info', text: copy.focusedRoom(focusRoom.roomName) })
    },
    [
      copy,
      nodes,
      plan.analysis.roomDiagnostics,
      plan.id,
      roomFocusUnavailableMessage,
      selectedBuildingId,
      setPreviewSelectedIds,
    ],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar">
      <div className="shrink-0 border-border/50 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 font-semibold text-base">{panelTitle}</h2>
            <div className="mt-1 space-y-1 text-muted-foreground text-xs">
              <p className="m-0 truncate">{siteSummary}</p>
              {buildableSummary ? <p className="m-0 truncate">{buildableSummary}</p> : null}
              {setbackSummary ? (
                <p className="m-0 truncate">
                  {copy.setbackContext} {setbackSummary}
                </p>
              ) : null}
              {primaryGridSummary ? <p className="m-0 truncate">{primaryGridSummary}</p> : null}
              {primaryGridSummary ? <p className="m-0 truncate">{copy.gridGuidance}</p> : null}
            </div>
          </div>
          <span className="shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 font-medium text-primary text-xs">
            {panelModeLabel}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-muted-foreground text-xs">
            {workspaceHint}
          </div>

          <PlanPreview
            copy={copy}
            onFocusRepairSummary={handleFocusRepairSummary}
            onFocusFengShuiAdvisory={handleFocusFengShuiAdvisory}
            onFocusRoomDiagnostic={handleFocusRoomDiagnostic}
            plan={plan}
          />

          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              status?.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                : 'border-border/60 bg-background text-muted-foreground'
            }`}
          >
            {status?.text ?? workspaceHint}
          </div>
        </div>
      </div>
    </div>
  )
}
