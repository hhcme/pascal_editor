'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useMemo, useState } from 'react'
import {
  AI_BUILDING_TYPE_OPTIONS,
  type AiBuildingBrief,
  type AiBuildingCopy,
  type AiBuildingFormState,
  type AiBuildingLanguage,
  type AiBuildingPlan,
  type AiBuildingStyle,
  type AiBuildingType,
  type AiBuildingVariant,
  applyPlanToScene,
  COPY,
  clampNumber,
  createPlan,
  getSceneContext,
  MAX_DIMENSION,
  MIN_DIMENSION,
  parseNumberInput,
  requestAiBuildingBrief,
  requestAiBuildingPlan,
} from '../lib/ai-building'

function PlanPreview({ copy, plan }: { copy: AiBuildingCopy; plan: AiBuildingPlan }) {
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
    </section>
  )
}

function NumberField({
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  suffix?: string
  value: number
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center rounded-md border border-border/60 bg-background">
        <input
          className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          max={max}
          min={min}
          onChange={(event) =>
            onChange(parseNumberInput(event.currentTarget.value, value, min, max))
          }
          type="number"
          value={value}
        />
        {suffix ? <span className="pr-2 text-muted-foreground text-xs">{suffix}</span> : null}
      </div>
    </label>
  )
}

export function AiBuildingPanel({ language }: { language: AiBuildingLanguage }) {
  const copy = COPY[language]
  const selectedBuildingId = useViewer((state) => state.selection.buildingId)
  const nodes = useScene((state) => state.nodes)
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const sceneContext = useMemo(
    () => getSceneContext(nodes, rootNodeIds, selectedBuildingId),
    [nodes, rootNodeIds, selectedBuildingId],
  )
  const [status, setStatus] = useState<{ tone: 'success' | 'info'; text: string } | null>(null)
  const [didInitializeFromScene, setDidInitializeFromScene] = useState(false)
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false)
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false)
  const [brief, setBrief] = useState<AiBuildingBrief | null>(null)
  const [briefText, setBriefText] = useState('')
  const [generatedPlan, setGeneratedPlan] = useState<AiBuildingPlan | null>(null)
  const [form, setForm] = useState<AiBuildingFormState>({
    buildingType: 'residential',
    style: 'modern',
    variant: 'balanced',
    floors: 3,
    width: 18,
    depth: 14,
    prompt: copy.defaultPrompt,
  })

  useEffect(() => {
    if (didInitializeFromScene) return

    const siteWidth = sceneContext.siteWidth ?? 30
    const siteDepth = sceneContext.siteDepth ?? 30
    setForm((current) => ({
      ...current,
      floors:
        sceneContext.levelCount > 1 ? clampNumber(sceneContext.levelCount, 1, 8) : current.floors,
      width: clampNumber(Math.round((siteWidth - 6) * 10) / 10, MIN_DIMENSION, MAX_DIMENSION),
      depth: clampNumber(Math.round((siteDepth - 8) * 10) / 10, MIN_DIMENSION, MAX_DIMENSION),
    }))
    setDidInitializeFromScene(true)
  }, [
    didInitializeFromScene,
    sceneContext.levelCount,
    sceneContext.siteDepth,
    sceneContext.siteWidth,
  ])

  const draftPlan = useMemo(() => createPlan(form, language), [form, language])
  const plan = generatedPlan ?? draftPlan
  const updateForm = <TKey extends keyof AiBuildingFormState>(
    key: TKey,
    value: AiBuildingFormState[TKey],
  ) => {
    setStatus(null)
    setBrief(null)
    setBriefText('')
    setGeneratedPlan(null)
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleGenerateBrief = async () => {
    setIsGeneratingBrief(true)
    setStatus({ tone: 'info', text: copy.generatingBrief })
    setGeneratedPlan(null)
    try {
      const response = await requestAiBuildingBrief({
        form,
        language,
        sceneContext,
      })
      setForm(response.brief.normalizedForm)
      setBrief(response.brief)
      setBriefText(response.brief.briefText)
      setStatus({ tone: 'info', text: `${copy.briefGenerated} · ${copy.provider}` })
    } catch (error) {
      setStatus({
        tone: 'info',
        text: error instanceof Error ? error.message : copy.generateFailed,
      })
    } finally {
      setIsGeneratingBrief(false)
    }
  }

  const handleBriefTextChange = (value: string) => {
    setBriefText(value)
    setGeneratedPlan(null)
    setStatus(null)
    setBrief((current) => (current ? { ...current, briefText: value } : current))
  }

  const handleGeneratePlan = async () => {
    if (!brief) {
      setStatus({ tone: 'info', text: copy.briefRequired })
      return
    }

    setIsGeneratingPlan(true)
    setStatus({ tone: 'info', text: copy.generatingPlan })
    try {
      const confirmedBrief = {
        ...brief,
        briefText: briefText.trim() || brief.briefText,
      }
      const response = await requestAiBuildingPlan({
        brief: confirmedBrief,
        language,
        sceneContext,
      })
      setForm(response.normalizedForm)
      setBrief(response.brief)
      setBriefText(response.brief.briefText)
      setGeneratedPlan(response.plan)
      setStatus({ tone: 'info', text: `${copy.generated} · ${copy.provider}` })
    } catch (error) {
      setStatus({
        tone: 'info',
        text: error instanceof Error ? error.message : copy.generateFailed,
      })
    } finally {
      setIsGeneratingPlan(false)
    }
  }

  const handleApply = () => {
    if (!generatedPlan) {
      setStatus({ tone: 'info', text: copy.planRequired })
      return
    }

    const result = applyPlanToScene(generatedPlan, sceneContext)
    setStatus({
      tone: 'success',
      text: result.createdDefaultBuilding
        ? `${copy.noBuilding}，${copy.applied(result.wallCount, result.floorCount)}`
        : copy.applied(result.wallCount, result.floorCount),
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar">
      <div className="shrink-0 border-border/50 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 font-semibold text-base">{copy.title}</h2>
            <p className="m-0 mt-1 truncate text-muted-foreground text-xs">
              {sceneContext.siteWidth && sceneContext.siteDepth
                ? `${copy.projectContext} ${sceneContext.siteWidth.toFixed(0)}m x ${sceneContext.siteDepth.toFixed(0)}m`
                : copy.siteFallback}
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 font-medium text-primary text-xs">
            API
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <section className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-muted-foreground text-xs">{copy.type}</span>
              <select
                className="h-9 rounded-md border border-border/60 bg-background px-2 text-sm outline-none"
                onChange={(event) =>
                  updateForm('buildingType', event.currentTarget.value as AiBuildingType)
                }
                value={form.buildingType}
              >
                {AI_BUILDING_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {copy.buildingTypes[type]}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5">
              <div className="font-medium text-muted-foreground text-xs">{copy.style}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['modern', 'newChinese', 'minimal'] as AiBuildingStyle[]).map((style) => {
                  const active = form.style === style
                  return (
                    <button
                      className={`h-8 rounded-md border text-xs transition-colors ${
                        active
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
                      }`}
                      key={style}
                      onClick={() => updateForm('style', style)}
                      type="button"
                    >
                      {copy.styles[style]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="font-medium text-muted-foreground text-xs">{copy.plan}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['balanced', 'courtyard', 'daylight'] as AiBuildingVariant[]).map((variant) => {
                  const active = form.variant === variant
                  return (
                    <button
                      className={`h-8 rounded-md border text-xs transition-colors ${
                        active
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
                      }`}
                      key={variant}
                      onClick={() => updateForm('variant', variant)}
                      type="button"
                    >
                      {copy.variants[variant]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <NumberField
                label={copy.floors}
                max={8}
                min={1}
                onChange={(value) => updateForm('floors', Math.round(value))}
                suffix={copy.floorsUnit}
                value={form.floors}
              />
              <NumberField
                label={copy.width}
                max={MAX_DIMENSION}
                min={MIN_DIMENSION}
                onChange={(value) => updateForm('width', value)}
                suffix={copy.meters}
                value={form.width}
              />
              <NumberField
                label={copy.depth}
                max={MAX_DIMENSION}
                min={MIN_DIMENSION}
                onChange={(value) => updateForm('depth', value)}
                suffix={copy.meters}
                value={form.depth}
              />
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-muted-foreground text-xs">{copy.prompt}</span>
              <textarea
                className="min-h-24 resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none"
                onChange={(event) => updateForm('prompt', event.currentTarget.value)}
                value={form.prompt}
              />
            </label>
          </section>

          <section className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm">{copy.brief}</div>
              {brief ? (
                <span className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary text-xs">
                  {copy.provider}
                </span>
              ) : null}
            </div>
            <textarea
              className="min-h-36 resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!brief}
              onChange={(event) => handleBriefTextChange(event.currentTarget.value)}
              placeholder={copy.briefPlaceholder}
              value={briefText}
            />
            {brief ? (
              <div className="flex flex-wrap gap-1.5">
                {brief.mustHave.slice(0, 4).map((item) => (
                  <span
                    className="rounded-full border border-border/60 px-2 py-1 text-muted-foreground text-xs"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <PlanPreview copy={copy} plan={plan} />

          {status ? (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                status.tone === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                  : 'border-border/60 bg-background text-muted-foreground'
              }`}
            >
              {status.text}
            </div>
          ) : (
            <div className="rounded-md border border-border/60 bg-background px-3 py-2 text-muted-foreground text-xs">
              {copy.replaceHint}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-border/50 border-t p-3">
        <div className="grid grid-cols-3 gap-2">
          <button
            className="h-9 rounded-md border border-border/60 bg-background px-2 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isGeneratingBrief || isGeneratingPlan}
            onClick={() => void handleGenerateBrief()}
            type="button"
          >
            <span className="block truncate">
              {isGeneratingBrief ? copy.generatingBrief : copy.generateBrief}
            </span>
          </button>
          <button
            className="h-9 rounded-md border border-border/60 bg-background px-2 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!brief || isGeneratingBrief || isGeneratingPlan}
            onClick={() => void handleGeneratePlan()}
            type="button"
          >
            <span className="block truncate">
              {isGeneratingPlan ? copy.generatingPlan : copy.generatePlan}
            </span>
          </button>
          <button
            className="h-9 rounded-md bg-primary px-2 font-semibold text-primary-foreground text-xs transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!generatedPlan || isGeneratingBrief || isGeneratingPlan}
            onClick={handleApply}
            type="button"
          >
            <span className="block truncate">{copy.apply}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
