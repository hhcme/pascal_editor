'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type GuideNode,
  type ScanNode,
  useScene,
} from '@pascal-app/core'
import {
  Box,
  CheckSquare,
  Crop,
  DoorOpen,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Ruler,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  applyDetectedGuideModel,
  applyDetectedOpenings,
  applyDetectedWalls,
  detectGuideCandidates,
  getSelectedGuideDetectionCandidates,
} from '../../../lib/guide-detection'
import { useEditorLanguage } from '../../../hooks/use-editor-language'
import { cn } from '../../../lib/utils'
import { useDeliveryStore } from '../../../store/use-delivery'
import useEditor from '../../../store/use-editor'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { PanelSection } from '../controls/panel-section'
import { Button } from '../primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

type ReferenceNode = ScanNode | GuideNode

const REFERENCE_PANEL_COPY = {
  'zh-CN': {
    applyOpenings: '应用开口',
    applyWalls: '应用墙体',
    calibration: '校准',
    calibrationSummary: (distance: string) => `已通过两个校准点标定为 ${distance} m`,
    cancelCalibration: '取消校准',
    clearCandidates: '清除候选',
    clearDetectionRegion: '清除范围',
    detectWallsAndOpenings: '识别墙体 / 开口',
    detecting: '识别中…',
    detectionFailed: '识别失败，请确认参考图仍可访问后重试。',
    detectionCandidates: '识别候选结果',
    detectionReviewHint: '先确认候选，再应用到模型。取消墙体会同时跳过其门窗。',
    detectionRegion: '识别范围',
    detectionRegionHint: '可选：先框选要识别的区域，避开图框、标注和家具。',
    detectionRegionLockedHint: '已设置识别范围，识别时只分析框选区域。',
    detectionSummary: (wallCount: number, openingCount: number) =>
      `${wallCount} 个墙体候选 · ${openingCount} 个开口候选`,
    door: '门',
    doorsAndWindows: (doorCount: number, windowCount: number) =>
      `${doorCount} 门 · ${windowCount} 窗`,
    guideCalibrationPromptAction: '开始两点校准',
    guideCalibrationPromptBody: '已导入参考图。建议先校准比例，再继续识别墙体、开口或描图。',
    guideCalibrationPromptLater: '稍后',
    guideCalibrationPromptTitle: '先校准参考图',
    guideLockPromptAction: '锁定参考图',
    guideLockPromptBody: '比例已经校准完成。建议现在锁定参考图，避免后续描图或识别时误拖动。',
    guideLockPromptLater: '稍后',
    guideLockPromptTitle: '建议锁定参考图',
    guideImage: '参考图',
    generate3D: (wallCount: number, openingCount: number) =>
      `生成 3D · ${wallCount} 墙 / ${openingCount} 开口`,
    lockGuide: '锁定参考图',
    lockedHint: '参考图已锁定。解锁前不可移动、旋转或缩放。',
    opacity: '不透明度',
    openingKind: '开口类型',
    position: '位置',
    positionAxisSuffix: '位置',
    rotation: '旋转',
    rotationAxisSuffix: '旋转',
    scanTitle: '3D 扫描',
    scale: '缩放与不透明度',
    scaleAxisSuffix: '缩放',
    selectAllCandidates: '全选',
    selectedDetectionSummary: (wallCount: number, openingCount: number) =>
      `将应用 ${wallCount} 墙 · ${openingCount} 开口`,
    selectNoCandidates: '全不选',
    startDetectionRegion: '框选识别范围',
    startCalibration: '两点校准',
    tracing: '描图',
    unlockGuide: '解锁参考图',
    unlockedHint: '对齐后建议锁定参考图，避免描图时误拖动。',
    window: '窗',
    cancelDetectionRegion: '取消框选',
  },
  en: {
    applyOpenings: 'Apply Openings',
    applyWalls: 'Apply Walls',
    calibration: 'Calibration',
    calibrationSummary: (distance: string) => `${distance} m from two picked points`,
    cancelCalibration: 'Cancel Calibration',
    clearCandidates: 'Clear Candidates',
    clearDetectionRegion: 'Clear Region',
    detectWallsAndOpenings: 'Detect Walls / Openings',
    detecting: 'Detecting…',
    detectionFailed: 'Detection failed. Make sure the guide image is still available and try again.',
    detectionCandidates: 'Detection candidates',
    detectionReviewHint: 'Review candidates before applying them to the model. Clearing a wall also skips its openings.',
    detectionRegion: 'Detection Region',
    detectionRegionHint: 'Optional: box the area to detect first so borders, dimensions, and furniture are skipped.',
    detectionRegionLockedHint: 'A detection region is set. Recognition will only analyze the boxed area.',
    detectionSummary: (wallCount: number, openingCount: number) =>
      `${wallCount} wall candidates · ${openingCount} opening candidates`,
    door: 'Door',
    doorsAndWindows: (doorCount: number, windowCount: number) =>
      `${doorCount} doors · ${windowCount} windows`,
    guideCalibrationPromptAction: 'Start 2-point calibration',
    guideCalibrationPromptBody:
      'The guide image is ready. Calibrate the scale before tracing or detecting walls and openings.',
    guideCalibrationPromptLater: 'Later',
    guideCalibrationPromptTitle: 'Calibrate The Guide First',
    guideLockPromptAction: 'Lock guide',
    guideLockPromptBody:
      'Calibration is complete. Lock the guide now to avoid accidental moves while tracing or detecting.',
    guideLockPromptLater: 'Later',
    guideLockPromptTitle: 'Lock The Guide',
    guideImage: 'Guide Image',
    generate3D: (wallCount: number, openingCount: number) =>
      `Generate 3D · ${wallCount} walls / ${openingCount} openings`,
    lockGuide: 'Lock Guide',
    lockedHint: 'Guide is locked. Move / rotate / scale is disabled until you unlock it.',
    opacity: 'Opacity',
    openingKind: 'Opening type',
    position: 'Position',
    positionAxisSuffix: 'pos',
    rotation: 'Rotation',
    rotationAxisSuffix: 'rot',
    scanTitle: '3D Scan',
    scale: 'Scale & Opacity',
    scaleAxisSuffix: 'scale',
    selectAllCandidates: 'Select all',
    selectedDetectionSummary: (wallCount: number, openingCount: number) =>
      `Applying ${wallCount} walls · ${openingCount} openings`,
    selectNoCandidates: 'Select none',
    startDetectionRegion: 'Box Detection Area',
    startCalibration: '2-Point Calibration',
    tracing: 'Tracing',
    unlockGuide: 'Unlock Guide',
    unlockedHint: 'Lock the guide after alignment to avoid accidental drags while tracing.',
    window: 'Window',
    cancelDetectionRegion: 'Cancel Boxing',
  },
} satisfies Record<
  'zh-CN' | 'en',
  {
    applyOpenings: string
    applyWalls: string
    calibration: string
    calibrationSummary: (distance: string) => string
    cancelCalibration: string
    clearCandidates: string
    clearDetectionRegion: string
    detectWallsAndOpenings: string
    detecting: string
    detectionFailed: string
    detectionCandidates: string
    detectionReviewHint: string
    detectionRegion: string
    detectionRegionHint: string
    detectionRegionLockedHint: string
    detectionSummary: (wallCount: number, openingCount: number) => string
    door: string
    doorsAndWindows: (doorCount: number, windowCount: number) => string
    guideCalibrationPromptAction: string
    guideCalibrationPromptBody: string
    guideCalibrationPromptLater: string
    guideCalibrationPromptTitle: string
    guideLockPromptAction: string
    guideLockPromptBody: string
    guideLockPromptLater: string
    guideLockPromptTitle: string
    guideImage: string
    generate3D: (wallCount: number, openingCount: number) => string
    lockGuide: string
    lockedHint: string
    opacity: string
    openingKind: string
    position: string
    positionAxisSuffix: string
    rotation: string
    rotationAxisSuffix: string
    scanTitle: string
    scale: string
    scaleAxisSuffix: string
    selectAllCandidates: string
    selectedDetectionSummary: (wallCount: number, openingCount: number) => string
    selectNoCandidates: string
    startDetectionRegion: string
    startCalibration: string
    tracing: string
    unlockGuide: string
    unlockedHint: string
    window: string
    cancelDetectionRegion: string
  }
>

export function ReferencePanel() {
  const language = useEditorLanguage()
  const copy = REFERENCE_PANEL_COPY[language]
  const selectedReferenceId = useEditor((s) => s.selectedReferenceId)
  const setSelectedReferenceId = useEditor((s) => s.setSelectedReferenceId)
  const setViewMode = useEditor((s) => s.setViewMode)
  const updateNode = useScene((s) => s.updateNode)
  const createNode = useScene((s) => s.createNode)
  const calibrationDraft = useDeliveryStore((s) => s.calibrationDraft)
  const calibrationPromptGuideId = useDeliveryStore((s) => s.calibrationPromptGuideId)
  const detectionRegionDraftGuideId = useDeliveryStore((s) => s.detectionRegionDraftGuideId)
  const lockPromptGuideId = useDeliveryStore((s) => s.lockPromptGuideId)
  const startCalibrationDraft = useDeliveryStore((s) => s.startCalibrationDraft)
  const startDetectionRegionDraft = useDeliveryStore((s) => s.startDetectionRegionDraft)
  const clearCalibrationDraft = useDeliveryStore((s) => s.clearCalibrationDraft)
  const clearCalibrationPrompt = useDeliveryStore((s) => s.clearCalibrationPrompt)
  const clearDetectionRegionDraft = useDeliveryStore((s) => s.clearDetectionRegionDraft)
  const clearLockPrompt = useDeliveryStore((s) => s.clearLockPrompt)
  const detectionCandidates = useDeliveryStore((s) => s.detectionCandidates)
  const hoveredDetectionCandidateId = useDeliveryStore((s) => s.hoveredDetectionCandidateId)
  const setDetectionCandidates = useDeliveryStore((s) => s.setDetectionCandidates)
  const setDetectionOpeningKind = useDeliveryStore((s) => s.setDetectionOpeningKind)
  const setDetectionWallSelected = useDeliveryStore((s) => s.setDetectionWallSelected)
  const setDetectionOpeningSelected = useDeliveryStore((s) => s.setDetectionOpeningSelected)
  const setHoveredDetectionCandidateId = useDeliveryStore((s) => s.setHoveredDetectionCandidateId)
  const setAllDetectionCandidatesSelected = useDeliveryStore(
    (s) => s.setAllDetectionCandidatesSelected,
  )
  const clearDetectionCandidates = useDeliveryStore((s) => s.clearDetectionCandidates)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionError, setDetectionError] = useState<string | null>(null)

  const node = useScene((s) =>
    selectedReferenceId
      ? (s.nodes[selectedReferenceId as AnyNode['id']] as ReferenceNode | undefined)
      : undefined,
  )
  const isLockedGuide = node?.type === 'guide' ? node.locked : false

  const handleUpdate = useCallback(
    (updates: Partial<ReferenceNode>) => {
      if (!selectedReferenceId) return

      const lockedGuide =
        node?.type === 'guide' &&
        isLockedGuide &&
        ('position' in updates || 'rotation' in updates || 'scale' in updates)

      if (lockedGuide) {
        return
      }

      updateNode(selectedReferenceId as AnyNode['id'], updates)
    },
    [isLockedGuide, node?.type, selectedReferenceId, updateNode],
  )

  const handleClose = useCallback(() => {
    setSelectedReferenceId(null)
  }, [setSelectedReferenceId])

  const handleDetectGuide = useCallback(async () => {
    if (!(node?.type === 'guide' && node.locked && node.calibration)) {
      return
    }

    setIsDetecting(true)
    setDetectionError(null)
    try {
      const candidates = await detectGuideCandidates(node)
      setDetectionCandidates(candidates)
    } catch {
      setDetectionError(copy.detectionFailed)
    } finally {
      setIsDetecting(false)
    }
  }, [copy.detectionFailed, node, setDetectionCandidates])

  const handleApplyDetectedWalls = useCallback(() => {
    if (!(node?.type === 'guide' && node.parentId && detectionCandidates?.guideId === node.id)) {
      return
    }
    if (Object.keys(detectionCandidates.appliedWallIds ?? {}).length > 0) {
      return
    }

    const selectedCandidates = getSelectedGuideDetectionCandidates(detectionCandidates)
    const wallIdMap = applyDetectedWalls(
      node.parentId as AnyNodeId,
      selectedCandidates,
      createNode,
    )
    setDetectionCandidates({
      ...detectionCandidates,
      appliedWallIds: Object.fromEntries(wallIdMap),
    })
  }, [createNode, detectionCandidates, node, setDetectionCandidates])

  const handleApplyDetectedOpenings = useCallback(() => {
    if (!(node?.type === 'guide' && detectionCandidates?.guideId === node.id)) {
      return
    }

    const wallIdMap = new Map(Object.entries(detectionCandidates.appliedWallIds ?? {}))
    if (wallIdMap.size === 0) {
      return
    }

    const selectedCandidates = getSelectedGuideDetectionCandidates(detectionCandidates)
    applyDetectedOpenings(selectedCandidates, wallIdMap, createNode, detectionCandidates.walls)
    clearDetectionCandidates()
  }, [clearDetectionCandidates, createNode, detectionCandidates, node])

  const handleGenerateDetectedModel = useCallback(() => {
    if (!(node?.type === 'guide' && node.parentId && detectionCandidates?.guideId === node.id)) {
      return
    }

    const selectedCandidates = getSelectedGuideDetectionCandidates(detectionCandidates)
    if (selectedCandidates.walls.length === 0) {
      return
    }

    applyDetectedGuideModel(node.parentId as AnyNodeId, selectedCandidates, createNode)
    clearDetectionCandidates()
    setSelectedReferenceId(null)
    setViewMode('3d')
  }, [
    clearDetectionCandidates,
    createNode,
    detectionCandidates,
    node,
    setSelectedReferenceId,
    setViewMode,
  ])

  const isScan = node?.type === 'scan'
  const isGuide = node?.type === 'guide'
  const isCalibrationActive = calibrationDraft?.guideId === node?.id
  const isDetectionRegionActive =
    node?.type === 'guide' && detectionRegionDraftGuideId === node.id
  const guideCandidates =
    node?.type === 'guide' && detectionCandidates?.guideId === node.id ? detectionCandidates : null
  const selectedGuideCandidates = guideCandidates
    ? getSelectedGuideDetectionCandidates(guideCandidates)
    : null
  const selectedWallCount = selectedGuideCandidates?.walls.length ?? 0
  const selectedOpeningCount = selectedGuideCandidates?.openings.length ?? 0
  const selectedWallIds = new Set(
    guideCandidates?.selectedWallIds ?? guideCandidates?.walls.map((wall) => wall.id) ?? [],
  )
  const selectedOpeningIds = new Set(
    guideCandidates?.selectedOpeningIds ??
      guideCandidates?.openings.map((opening) => opening.id) ??
      [],
  )
  const doorCount = guideCandidates?.openings.filter((opening) => opening.kind === 'door').length ?? 0
  const windowCount =
    guideCandidates?.openings.filter((opening) => opening.kind === 'window').length ?? 0
  const hasAppliedWalls = Object.keys(guideCandidates?.appliedWallIds ?? {}).length > 0
  const shouldShowCalibrationPrompt =
    node?.type === 'guide' &&
    calibrationPromptGuideId === node.id &&
    !node.calibration &&
    !isCalibrationActive
  const shouldShowLockPrompt =
    node?.type === 'guide' && lockPromptGuideId === node.id && !node.locked && !!node.calibration

  useEffect(() => {
    if (node?.type === 'guide' && calibrationPromptGuideId === node.id && node.calibration) {
      clearCalibrationPrompt()
    }
  }, [calibrationPromptGuideId, clearCalibrationPrompt, node])

  useEffect(() => {
    if (node?.type === 'guide' && lockPromptGuideId === node.id && node.locked) {
      clearLockPrompt()
    }
  }, [clearLockPrompt, lockPromptGuideId, node])

  const handleStartCalibrationFromPrompt = useCallback(() => {
    if (node?.type !== 'guide') return
    clearCalibrationPrompt()
    startCalibrationDraft(node.id)
  }, [clearCalibrationPrompt, node, startCalibrationDraft])

  const handleLockGuideFromPrompt = useCallback(() => {
    if (node?.type !== 'guide') return
    clearLockPrompt()
    updateNode(node.id, { locked: true })
  }, [clearLockPrompt, node, updateNode])

  const handleToggleDetectionRegionDraft = useCallback(() => {
    if (node?.type !== 'guide') return

    clearDetectionCandidates()
    if (isDetectionRegionActive) {
      clearDetectionRegionDraft()
      return
    }

    startDetectionRegionDraft(node.id)
  }, [
    clearDetectionCandidates,
    clearDetectionRegionDraft,
    isDetectionRegionActive,
    node,
    startDetectionRegionDraft,
  ])

  const handleClearDetectionRegion = useCallback(() => {
    if (node?.type !== 'guide') return

    clearDetectionRegionDraft()
    clearDetectionCandidates()
    updateNode(node.id, { detectionRegion: undefined })
  }, [clearDetectionCandidates, clearDetectionRegionDraft, node, updateNode])

  if (!node || (node.type !== 'scan' && node.type !== 'guide')) return null

  return (
    <PanelWrapper
      icon={isScan ? <Box className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
      onClose={handleClose}
      title={node.name || (isScan ? copy.scanTitle : copy.guideImage)}
      width={340}
    >
      {isGuide ? (
        <Dialog onOpenChange={(open) => !open && clearCalibrationPrompt()} open={shouldShowCalibrationPrompt}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{copy.guideCalibrationPromptTitle}</DialogTitle>
              <DialogDescription>{copy.guideCalibrationPromptBody}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => clearCalibrationPrompt()} type="button" variant="outline">
                {copy.guideCalibrationPromptLater}
              </Button>
              <Button onClick={handleStartCalibrationFromPrompt} type="button">
                {copy.guideCalibrationPromptAction}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {isGuide ? (
        <Dialog onOpenChange={(open) => !open && clearLockPrompt()} open={shouldShowLockPrompt}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{copy.guideLockPromptTitle}</DialogTitle>
              <DialogDescription>{copy.guideLockPromptBody}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => clearLockPrompt()} type="button" variant="outline">
                {copy.guideLockPromptLater}
              </Button>
              <Button onClick={handleLockGuideFromPrompt} type="button">
                {copy.guideLockPromptAction}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {isGuide ? (
        <PanelSection title={copy.tracing}>
          <ActionGroup>
            <ActionButton
              icon={node.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              label={node.locked ? copy.unlockGuide : copy.lockGuide}
              onClick={() => handleUpdate({ locked: !node.locked })}
            />
            <ActionButton
              icon={<Ruler className="h-4 w-4" />}
              label={isCalibrationActive ? copy.cancelCalibration : copy.startCalibration}
              onClick={() =>
                isCalibrationActive ? clearCalibrationDraft() : startCalibrationDraft(node.id)
              }
            />
          </ActionGroup>

          <div className="px-1 pt-2 text-[11px] text-muted-foreground">
            {node.locked ? copy.lockedHint : copy.unlockedHint}
          </div>

          {node.calibration ? (
            <div className="rounded-md border border-border/55 bg-card px-3 py-2 text-xs">
              <div className="font-medium text-foreground">{copy.calibration}</div>
              <div className="mt-1 text-muted-foreground">
                {copy.calibrationSummary(node.calibration.distance.toFixed(2))}
              </div>
            </div>
          ) : null}

          <ActionGroup className="pt-1">
            <ActionButton
              disabled={!node.locked}
              icon={<Crop className="h-4 w-4" />}
              label={
                isDetectionRegionActive ? copy.cancelDetectionRegion : copy.startDetectionRegion
              }
              onClick={handleToggleDetectionRegionDraft}
            />
            <ActionButton
              disabled={!(node.detectionRegion || isDetectionRegionActive)}
              icon={<X className="h-4 w-4" />}
              label={copy.clearDetectionRegion}
              onClick={handleClearDetectionRegion}
            />
          </ActionGroup>

          <div className="px-1 pt-2 text-[11px] text-muted-foreground">
            {node.detectionRegion ? copy.detectionRegionLockedHint : copy.detectionRegionHint}
          </div>

          {node.detectionRegion ? (
            <div className="rounded-md border border-border/55 bg-card px-3 py-2 text-xs">
              <div className="font-medium text-foreground">{copy.detectionRegion}</div>
              <div className="mt-1 text-muted-foreground">{copy.detectionRegionLockedHint}</div>
            </div>
          ) : null}

          <ActionGroup className="pt-1">
            <ActionButton
              icon={<Sparkles className="h-4 w-4" />}
              label={isDetecting ? copy.detecting : copy.detectWallsAndOpenings}
              onClick={() => void handleDetectGuide()}
              disabled={!node.locked || !node.calibration || isDetecting || isDetectionRegionActive}
            />
          </ActionGroup>

          {detectionError ? (
            <div
              className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {detectionError}
            </div>
          ) : null}

          {guideCandidates ? (
            <>
              <div className="rounded-md border border-border/55 bg-card px-3 py-2 text-xs">
                <div className="font-medium text-foreground">{copy.detectionCandidates}</div>
                <div className="mt-1 text-muted-foreground">
                  {copy.detectionSummary(
                    guideCandidates.walls.length,
                    guideCandidates.openings.length,
                  )}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {copy.doorsAndWindows(doorCount, windowCount)}
                </div>
                <div className="mt-2 rounded bg-muted/45 px-2 py-1 text-muted-foreground">
                  {copy.selectedDetectionSummary(selectedWallCount, selectedOpeningCount)}
                </div>
              </div>

              <ActionGroup className="pt-1">
                <ActionButton
                  className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85"
                  icon={<Box className="h-4 w-4" />}
                  label={copy.generate3D(selectedWallCount, selectedOpeningCount)}
                  onClick={handleGenerateDetectedModel}
                  disabled={!selectedWallCount}
                />
              </ActionGroup>

              <ActionGroup className="pt-1">
                <ActionButton
                  label={`${copy.applyWalls} ${selectedWallCount}`}
                  onClick={handleApplyDetectedWalls}
                  disabled={!selectedWallCount || hasAppliedWalls}
                />
                <ActionButton
                  label={`${copy.applyOpenings} ${selectedOpeningCount}`}
                  onClick={handleApplyDetectedOpenings}
                  disabled={
                    !selectedOpeningCount ||
                    !guideCandidates.appliedWallIds ||
                    Object.keys(guideCandidates.appliedWallIds).length === 0
                  }
                />
              </ActionGroup>

              <ActionGroup className="pt-1">
                <ActionButton
                  disabled={hasAppliedWalls}
                  icon={<CheckSquare className="h-4 w-4" />}
                  label={copy.selectAllCandidates}
                  onClick={() => setAllDetectionCandidatesSelected(true)}
                />
                <ActionButton
                  disabled={hasAppliedWalls}
                  icon={<Square className="h-4 w-4" />}
                  label={copy.selectNoCandidates}
                  onClick={() => setAllDetectionCandidatesSelected(false)}
                />
              </ActionGroup>

              <div className="rounded-md border border-border/55 bg-card px-3 py-2 text-xs">
                <div className="text-muted-foreground">{copy.detectionReviewHint}</div>
                <div className="mt-2 max-h-56 space-y-1.5 overflow-auto pr-1">
                  {guideCandidates.walls.map((wall, index) => {
                    const wallOpenings = guideCandidates.openings.filter(
                      (opening) => opening.wallCandidateId === wall.id,
                    )
                    const selectedWall = selectedWallIds.has(wall.id)
                    const selectedOpenings = wallOpenings.filter((opening) =>
                      selectedOpeningIds.has(opening.id),
                    )
                    const wallLength = Math.hypot(
                      wall.end[0] - wall.start[0],
                      wall.end[1] - wall.start[1],
                    )
                    const isWallHovered =
                      hoveredDetectionCandidateId === wall.id ||
                      wallOpenings.some((opening) => opening.id === hoveredDetectionCandidateId)

                    return (
                      <div
                        key={wall.id}
                        className={cn(
                          'rounded border border-border/50 bg-background/70 px-2 py-1.5 transition-colors',
                          isWallHovered && 'border-primary/45 bg-primary/5',
                        )}
                        onMouseEnter={() => setHoveredDetectionCandidateId(wall.id)}
                        onMouseLeave={() => setHoveredDetectionCandidateId(null)}
                      >
                        <label className="flex items-center gap-2 text-foreground">
                          <input
                            checked={selectedWall}
                            className="h-3.5 w-3.5 accent-primary"
                            disabled={hasAppliedWalls}
                            onChange={(event) =>
                              setDetectionWallSelected(wall.id, event.target.checked)
                            }
                            type="checkbox"
                          />
                          <span className="font-medium">Wall {index + 1}</span>
                          <span className="text-muted-foreground">{wallLength.toFixed(2)} m</span>
                          <span className="ml-auto text-muted-foreground">
                            {wallOpenings.length
                              ? `${selectedOpenings.length}/${wallOpenings.length}`
                              : '0'}
                          </span>
                        </label>

                        {wallOpenings.length ? (
                          <div className="mt-1 grid gap-1 pl-5">
                            {wallOpenings.map((opening) => {
                              const isOpeningHovered = hoveredDetectionCandidateId === opening.id

                              return (
                                <div
                                  className={cn(
                                    'flex items-center gap-2 rounded px-1 py-0.5 text-muted-foreground transition-colors',
                                    isOpeningHovered && 'bg-primary/10 text-foreground',
                                  )}
                                  key={opening.id}
                                  onMouseEnter={(event) => {
                                    event.stopPropagation()
                                    setHoveredDetectionCandidateId(opening.id)
                                  }}
                                  onMouseLeave={(event) => {
                                    event.stopPropagation()
                                    setHoveredDetectionCandidateId(wall.id)
                                  }}
                                >
                                  <input
                                    aria-label={`${opening.kind === 'door' ? copy.door : copy.window} ${opening.width.toFixed(2)} m`}
                                    checked={selectedOpeningIds.has(opening.id)}
                                    className="h-3.5 w-3.5 accent-primary"
                                    disabled={!selectedWall}
                                    onChange={(event) =>
                                      setDetectionOpeningSelected(opening.id, event.target.checked)
                                    }
                                    type="checkbox"
                                  />
                                  <DoorOpen className="h-3.5 w-3.5" />
                                  <select
                                    aria-label={copy.openingKind}
                                    className="h-6 rounded border border-border/60 bg-background px-1 text-[11px] text-foreground"
                                    disabled={!selectedWall}
                                    onChange={(event) =>
                                      setDetectionOpeningKind(
                                        opening.id,
                                        event.target.value as 'door' | 'window',
                                      )
                                    }
                                    value={opening.kind}
                                  >
                                    <option value="door">{copy.door}</option>
                                    <option value="window">{copy.window}</option>
                                  </select>
                                  <span>· {opening.width.toFixed(2)} m</span>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>

              <ActionGroup className="pt-1">
                <ActionButton
                  label={copy.clearCandidates}
                  onClick={() => clearDetectionCandidates()}
                />
              </ActionGroup>
            </>
          ) : null}
        </PanelSection>
      ) : null}

      <PanelSection title={copy.position}>
        <SliderControl
          label={`X ${copy.positionAxisSuffix}`}
          max={50}
          min={-50}
          onChange={(value) => {
            const pos = [...node.position] as [number, number, number]
            pos[0] = value
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[0] * 100) / 100}
        />
        <SliderControl
          label={`Y ${copy.positionAxisSuffix}`}
          max={50}
          min={-50}
          onChange={(value) => {
            const pos = [...node.position] as [number, number, number]
            pos[1] = value
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[1] * 100) / 100}
        />
        <SliderControl
          label={`Z ${copy.positionAxisSuffix}`}
          max={50}
          min={-50}
          onChange={(value) => {
            const pos = [...node.position] as [number, number, number]
            pos[2] = value
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[2] * 100) / 100}
        />
      </PanelSection>

      <PanelSection title={copy.rotation}>
        <SliderControl
          label={`Y ${copy.rotationAxisSuffix}`}
          max={180}
          min={-180}
          onChange={(degrees) => {
            const radians = (degrees * Math.PI) / 180
            handleUpdate({
              rotation: [node.rotation[0], radians, node.rotation[2]],
            })
          }}
          precision={0}
          step={1}
          unit="°"
          value={Math.round((node.rotation[1] * 180) / Math.PI)}
        />
        <div className="flex gap-1.5 px-1 pt-2 pb-1">
          <ActionButton
            label="-45°"
            onClick={() =>
              handleUpdate({
                rotation: [node.rotation[0], node.rotation[1] - Math.PI / 4, node.rotation[2]],
              })
            }
          />
          <ActionButton
            label="+45°"
            onClick={() =>
              handleUpdate({
                rotation: [node.rotation[0], node.rotation[1] + Math.PI / 4, node.rotation[2]],
              })
            }
          />
        </div>
      </PanelSection>

      <PanelSection title={copy.scale}>
        <SliderControl
          label={`XYZ ${copy.scaleAxisSuffix}`}
          max={10}
          min={0.01}
          onChange={(value) => {
            if (value > 0) {
              handleUpdate({ scale: value })
            }
          }}
          precision={2}
          step={0.1}
          value={Math.round(node.scale * 100) / 100}
        />

        <SliderControl
          label={copy.opacity}
          max={100}
          min={0}
          onChange={(v) => handleUpdate({ opacity: v })}
          precision={0}
          step={1}
          unit="%"
          value={node.opacity}
        />
      </PanelSection>
    </PanelWrapper>
  )
}
