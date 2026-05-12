'use client'

import {
  type AnyNode,
  type AnyNodeId,
  createCircularPatternStep,
  createDefaultChamferStep,
  createDefaultDraftStep,
  createDefaultFilletStep,
  createDefaultLoftStep,
  createDefaultShellStep,
  createDefaultSweepStep,
  createDerivedFeatureBody,
  createCombineStep,
  createFeatureDefinitionFromLegacyNode,
  createHoleStep,
  createLinearPatternStep,
  createMirrorStep,
  createReferenceAxis,
  createReferencePlane,
  createReferencePoint,
  deleteFeatureBody,
  ensureDefaultFeatureBody,
  type FeatureCut,
  type FeatureDefinition,
  type FeatureNode,
  type FeatureStep,
  getFeatureDefinition,
  getFeatureProfileCenter,
  moveFeatureStep,
  rebuildFeatureDefinition,
  setFeatureBodyVisible,
  setPatternInstanceSkipped,
  type SketchLineNode,
  updateCombineStepBodies,
  updateFeatureBodyTranslationX,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  CheckCircle2,
  CircleDot,
  Copy,
  Crosshair,
  Dot,
  Eye,
  EyeOff,
  Grid3X3,
  Layers3,
  MousePointer2,
  PencilLine,
  Plane,
  Plus,
  RefreshCcw,
  RotateCw,
  Ruler,
  Scissors,
  Shell,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import useEditor, { type SketchPlane } from '../../../store/use-editor'
import {
  getSourceSketchLines,
  getSourceStatus,
  haveSameProfilePoints,
  rebuildProfileFromSourceGeometry,
  type SourceStatus,
  syncFeatureProfileFromSketchProfile,
} from '../../tools/sketch/feature-source-sync'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { InspectorStat, InspectorSummary } from '../controls/inspector-summary'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

const FULL_REVOLVE_ANGLE_RADIANS = Math.PI * 2
const MIN_REVOLVE_ANGLE_DEGREES = 5
const MAX_REVOLVE_ANGLE_DEGREES = 360
const REVOLVE_AXIS_LINE_EPSILON = 1e-4

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180
}

function clampRevolveAngleDegrees(value: number) {
  if (!(Number.isFinite(value) && value > 0)) return MAX_REVOLVE_ANGLE_DEGREES
  return Math.min(MAX_REVOLVE_ANGLE_DEGREES, Math.max(MIN_REVOLVE_ANGLE_DEGREES, value))
}

function getFeatureStepLabel(step: FeatureStep) {
  const fallback = {
    extrude: '拉伸',
    revolve: '旋转',
    'extrude-cut': '拉伸切除',
    'revolve-cut': '旋转切除',
    hole: '孔',
    fillet: '圆角',
    chamfer: '倒角',
    shell: '抽壳',
    draft: '拔模',
    sweep: '扫描',
    loft: '放样',
    mirror: '镜像',
    'linear-pattern': '线性阵列',
    'circular-pattern': '圆周阵列',
    combine: '组合',
  } satisfies Record<FeatureStep['kind'], string>

  return step.name ?? fallback[step.kind]
}

function scaleProfileAroundCenter(profile: FeatureNode['profile'], scale: number) {
  const center = getFeatureProfileCenter(profile)
  return {
    ...profile,
    lineIds: [],
    points: profile.points.map(
      ([x, z]) =>
        [
          center[0] + (x - center[0]) * scale,
          center[1] + (z - center[1]) * scale,
        ] as [number, number],
    ),
  }
}

function getApproximateLoftScale(step: Extract<FeatureStep, { kind: 'loft' }>) {
  const first = step.profiles[0]
  const second = step.profiles[1]
  if (!(first && second && first.points.length === second.points.length && first.points.length > 0)) {
    return 0.65
  }

  const firstCenter = getFeatureProfileCenter(first)
  const secondCenter = getFeatureProfileCenter(second)
  let firstRadius = 0
  let secondRadius = 0
  for (let index = 0; index < first.points.length; index += 1) {
    const a = first.points[index]!
    const b = second.points[index]!
    firstRadius += Math.hypot(a[0] - firstCenter[0], a[1] - firstCenter[1])
    secondRadius += Math.hypot(b[0] - secondCenter[0], b[1] - secondCenter[1])
  }

  return firstRadius > 1e-6 ? secondRadius / firstRadius : 0.65
}

function getBodyLabel(definition: FeatureDefinition, bodyId: string) {
  const index = definition.bodies.findIndex((body) => body.id === bodyId)
  const body = definition.bodies[index]
  return body?.name ?? (index >= 0 ? `实体 ${index + 1}` : bodyId)
}

function shouldSyncDefinitionFromLegacyFields(updates: Partial<FeatureNode>) {
  return [
    'kind',
    'operation',
    'profile',
    'depth',
    'baseElevation',
    'cuts',
    'revolveAxisX',
    'revolveAxisLineId',
    'revolveAngle',
  ].some((key) => key in updates)
}

function calculatePolygonArea(polygon: Array<[number, number]>): number {
  if (polygon.length < 3) return 0

  let area = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    if (!(current && next)) continue
    area += current[0] * next[1] - next[0] * current[1]
  }

  return Math.abs(area) / 2
}

function isNumberTuple3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function getSketchPlaneFromMetadata(metadata: unknown): SketchPlane | null {
  if (!(typeof metadata === 'object' && metadata !== null && 'sketchPlane' in metadata)) {
    return null
  }

  const rawPlane = (metadata as Record<string, unknown>).sketchPlane
  if (!(typeof rawPlane === 'object' && rawPlane !== null)) {
    return null
  }

  const plane = rawPlane as Record<string, unknown>
  if (plane.kind === 'feature-top') {
    if (
      typeof plane.targetNodeId !== 'string' ||
      !(typeof plane.elevation === 'number' && Number.isFinite(plane.elevation))
    ) {
      return null
    }

    return {
      kind: 'feature-top',
      targetNodeId: plane.targetNodeId as AnyNodeId,
      elevation: plane.elevation,
    }
  }

  if (plane.kind !== 'feature-face') {
    return null
  }

  if (
    typeof plane.targetNodeId !== 'string' ||
    !isNumberTuple3(plane.origin) ||
    !isNumberTuple3(plane.uAxis) ||
    !isNumberTuple3(plane.vAxis) ||
    !isNumberTuple3(plane.normal)
  ) {
    return null
  }

  return {
    kind: 'feature-face',
    targetNodeId: plane.targetNodeId as AnyNodeId,
    origin: plane.origin,
    uAxis: plane.uAxis,
    vAxis: plane.vAxis,
    normal: plane.normal,
    label: typeof plane.label === 'string' ? plane.label : undefined,
  }
}

function getSketchPlaneFromLineIds(
  nodes: Record<string, AnyNode>,
  lineIds: readonly string[],
): SketchPlane | null {
  for (const lineId of lineIds) {
    const line = nodes[lineId]
    if (line?.type !== 'sketch-line') continue
    const plane = getSketchPlaneFromMetadata(line.metadata)
    if (plane) return plane
  }

  return null
}

function getRevolveAxisLine(
  nodes: Record<string, AnyNode>,
  lineId: string | undefined,
): SketchLineNode | null {
  if (!lineId) return null
  const line = nodes[lineId]
  return line?.type === 'sketch-line' ? line : null
}

function getRevolveAxisXFromLine(line: SketchLineNode | null) {
  if (!line) return null
  return (line.start[0] + line.end[0]) / 2
}

function isRevolveAxisLineCandidate(line: SketchLineNode) {
  const dx = Math.abs(line.end[0] - line.start[0])
  const dy = Math.abs(line.end[1] - line.start[1])
  return Boolean(line.construction && dy > REVOLVE_AXIS_LINE_EPSILON && dx <= REVOLVE_AXIS_LINE_EPSILON)
}

function SourceStatusBadge({ status }: { status: SourceStatus }) {
  const className =
    status.tone === 'ok'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status.tone === 'warning'
        ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-destructive/25 bg-destructive/10 text-destructive'
  const Icon = status.tone === 'ok' ? CheckCircle2 : AlertTriangle

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-medium text-[10px] ${className}`}
    >
      <Icon className="h-3 w-3" />
      {status.label}
    </span>
  )
}

export function FeaturePanel() {
  const selectedId = useViewer((s) => s.selection.selectedIds[0])
  const setSelection = useViewer((s) => s.setSelection)
  const nodes = useScene((s) => s.nodes as Record<string, AnyNode>)
  const updateNode = useScene((s) => s.updateNode)
  const setMode = useEditor((s) => s.setMode)
  const setPhase = useEditor((s) => s.setPhase)
  const setSketchPlane = useEditor((s) => s.setSketchPlane)
  const setStructureLayer = useEditor((s) => s.setStructureLayer)
  const setTool = useEditor((s) => s.setTool)
  const setViewMode = useEditor((s) => s.setViewMode)
  const revolveAxisPick = useEditor((s) => s.revolveAxisPick)
  const setRevolveAxisPick = useEditor((s) => s.setRevolveAxisPick)
  const [feedback, setFeedback] = useState<string | null>(null)
  const activeFeatureId = useScene((s) => {
    if (revolveAxisPick && s.nodes[revolveAxisPick.featureId]?.type === 'feature') {
      return revolveAxisPick.featureId
    }

    if (!selectedId) return null
    return s.nodes[selectedId as AnyNode['id']]?.type === 'feature'
      ? (selectedId as AnyNode['id'])
      : null
  })
  const node = useScene((s) =>
    activeFeatureId ? (s.nodes[activeFeatureId] as FeatureNode | undefined) : undefined,
  )
  const isPickingRevolveAxis =
    Boolean(revolveAxisPick && activeFeatureId && revolveAxisPick.featureId === activeFeatureId)

  const handleUpdate = useCallback(
    (updates: Partial<FeatureNode>) => {
      if (!activeFeatureId) return
      const nextUpdates =
        node?.definition && shouldSyncDefinitionFromLegacyFields(updates)
          ? {
              ...updates,
              definition: createFeatureDefinitionFromLegacyNode({
                ...node,
                ...updates,
              }),
            }
          : updates
      updateNode(activeFeatureId, nextUpdates)
    },
    [activeFeatureId, node, updateNode],
  )

  const handleClose = useCallback(() => {
    setRevolveAxisPick(null)
    setSelection({ selectedIds: [] })
  }, [setRevolveAxisPick, setSelection])

  const activateSourceSketch = useCallback(
    (lineIds: readonly string[]) => {
      const sketchPlane = getSketchPlaneFromLineIds(nodes, lineIds)
      const existingLineIds = getSourceSketchLines(nodes, lineIds).map((line) => line.id)
      if (existingLineIds.length === 0) {
        setFeedback('未找到可选择的来源草图。')
        return
      }

      setSketchPlane(sketchPlane)
      setViewMode('split')
      setPhase('structure')
      setMode('select')
      setStructureLayer('elements')
      setTool(null)
      setSelection({ selectedIds: existingLineIds as AnyNode['id'][] })
      setFeedback(null)
    },
    [
      nodes,
      setMode,
      setPhase,
      setSelection,
      setSketchPlane,
      setStructureLayer,
      setTool,
      setViewMode,
    ],
  )

  const handleSelectSourceSketch = useCallback(() => {
    if (!node) return
    activateSourceSketch(node.profile.lineIds)
  }, [activateSourceSketch, node])

  const handleRebuildProfile = useCallback(() => {
    if (!node) return

    const rebuiltProfile = rebuildProfileFromSourceGeometry(nodes, node.profile)
    if (!rebuiltProfile) {
      setFeedback('未找到完整的来源闭合草图，无法更新拉伸轮廓。')
      return
    }

    handleUpdate({
      profile: syncFeatureProfileFromSketchProfile(rebuiltProfile, node.profile),
    })
    setFeedback('已从来源草图更新拉伸轮廓。')
  }, [handleUpdate, node, nodes])

  const handleSketchOnTopFace = useCallback(() => {
    if (!(node && activeFeatureId)) return

    setSketchPlane({
      kind: 'feature-top',
      targetNodeId: activeFeatureId,
      elevation: node.baseElevation + node.depth,
    })
    setViewMode('split')
    setPhase('structure')
    setMode('build')
    setStructureLayer('elements')
    setTool('sketch-line')
    setSelection({ selectedIds: [] })
  }, [
    activeFeatureId,
    node,
    setMode,
    setPhase,
    setSelection,
    setSketchPlane,
    setStructureLayer,
    setTool,
    setViewMode,
  ])

  const handleSelectCutSketch = useCallback(
    (cut: FeatureCut) => {
      activateSourceSketch(cut.profile.lineIds)
    },
    [activateSourceSketch],
  )

  const handleRebuildCut = useCallback(
    (index: number) => {
      if (!node) return

      const cut = node.cuts[index]
      if (!cut) return

      const rebuiltProfile = rebuildProfileFromSourceGeometry(nodes, cut.profile)
      if (!rebuiltProfile) {
        setFeedback(`切割 ${index + 1} 的来源草图不是完整闭合轮廓。`)
        return
      }

      const nextCuts = node.cuts.map((candidate, candidateIndex) =>
        candidateIndex === index
          ? {
              ...candidate,
              profile: syncFeatureProfileFromSketchProfile(rebuiltProfile, candidate.profile),
            }
          : candidate,
      )
      handleUpdate({ cuts: nextCuts })
      setFeedback(`已更新切割 ${index + 1}。`)
    },
    [handleUpdate, node, nodes],
  )

  const handleRebuildAll = useCallback(() => {
    if (!node) return

    const rebuiltProfile = rebuildProfileFromSourceGeometry(nodes, node.profile)
    const nextUpdates: Partial<FeatureNode> = {}
    let updateCount = 0
    let failedCount = 0

    if (rebuiltProfile) {
      if (!haveSameProfilePoints(rebuiltProfile.points, node.profile.points)) {
        nextUpdates.profile = {
          ...syncFeatureProfileFromSketchProfile(rebuiltProfile, node.profile),
        }
        updateCount += 1
      }
    } else {
      failedCount += 1
    }

    const nextCuts = node.cuts.map((cut) => {
      const rebuiltCutProfile = rebuildProfileFromSourceGeometry(nodes, cut.profile)
      if (!rebuiltCutProfile) {
        failedCount += 1
        return cut
      }

      if (haveSameProfilePoints(rebuiltCutProfile.points, cut.profile.points)) {
        return cut
      }

      updateCount += 1
      return {
        ...cut,
        profile: syncFeatureProfileFromSketchProfile(rebuiltCutProfile, cut.profile),
      }
    })

    if (node.cuts.some((cut, index) => nextCuts[index] !== cut)) {
      nextUpdates.cuts = nextCuts
    }

    if (Object.keys(nextUpdates).length > 0) {
      handleUpdate(nextUpdates)
    }

    if (updateCount > 0 && failedCount > 0) {
      setFeedback(`已更新 ${updateCount} 个步骤，${failedCount} 个步骤无法刷新。`)
      return
    }

    if (updateCount > 0) {
      setFeedback(`已更新 ${updateCount} 个特征历史步骤。`)
      return
    }

    if (failedCount > 0) {
      setFeedback(`${failedCount} 个步骤无法刷新，请检查来源草图。`)
      return
    }

    setFeedback('所有特征历史步骤已同步。')
  }, [handleUpdate, node, nodes])

  const handleDeleteCut = useCallback(
    (index: number) => {
      if (!node) return
      handleUpdate({ cuts: node.cuts.filter((_, candidateIndex) => candidateIndex !== index) })
      setFeedback(`已删除切割 ${index + 1}。`)
    },
    [handleUpdate, node],
  )

  const appendFeatureStep = useCallback(
    (
      step: ReturnType<
        | typeof createHoleStep
        | typeof createMirrorStep
        | typeof createLinearPatternStep
        | typeof createCircularPatternStep
        | typeof createDefaultSweepStep
        | typeof createDefaultLoftStep
        | typeof createDefaultFilletStep
        | typeof createDefaultChamferStep
        | typeof createDefaultShellStep
        | typeof createDefaultDraftStep
      >,
    ) => {
      if (!node) return
      const definition = getFeatureDefinition(node)
      handleUpdate({
        definition: {
          ...definition,
          steps: [...definition.steps, step],
          rebuild: { status: 'warning', message: '特征历史已更新，等待重建。' },
        },
      })
    },
    [handleUpdate, node],
  )

  const handleAddThroughHole = useCallback(() => {
    if (!node) return
    const holeCount = getFeatureDefinition(node).steps.filter((step) => step.kind === 'hole').length
    const center = getFeatureProfileCenter(node.profile)
    appendFeatureStep(createHoleStep({ center, diameter: 0.35, index: holeCount }))
    setFeedback('已添加贯穿孔。V1 孔位默认放在轮廓中心，可在后续版本接入草图点/圆。')
  }, [appendFeatureStep, node])

  const handleAddMirror = useCallback(() => {
    if (!node) return
    const definition = ensureDefaultFeatureBody(getFeatureDefinition(node))
    const count = definition.steps.filter((step) => step.kind === 'mirror').length
    const existingPlane = definition.referenceGeometry.find((reference) => reference.kind === 'plane')
    const mirrorPlane = existingPlane ?? createReferencePlane(definition.referenceGeometry.length)
    handleUpdate({
      definition: {
        ...definition,
        referenceGeometry: existingPlane
          ? definition.referenceGeometry
          : [...definition.referenceGeometry, mirrorPlane],
        steps: [...definition.steps, createMirrorStep(count, mirrorPlane.id)],
        rebuild: { status: 'warning', message: '已添加镜像步骤和基准面引用。' },
      },
    })
    setFeedback('已添加特征镜像。V1 默认使用世界 YZ 平面。')
  }, [handleUpdate, node])

  const handleAddLinearPattern = useCallback(() => {
    if (!node) return
    const count = getFeatureDefinition(node).steps.filter((step) => step.kind === 'linear-pattern').length
    appendFeatureStep(createLinearPatternStep(count))
    setFeedback('已添加线性阵列。V1 默认沿 X 方向生成 3 个实例。')
  }, [appendFeatureStep, node])

  const handleAddCircularPattern = useCallback(() => {
    if (!node) return
    const count = getFeatureDefinition(node).steps.filter(
      (step) => step.kind === 'circular-pattern',
    ).length
    appendFeatureStep(createCircularPatternStep(count))
    setFeedback('已添加圆周阵列。V1 默认绕特征原点生成 4 个实例。')
  }, [appendFeatureStep, node])

  const handleAddSweep = useCallback(() => {
    if (!node) return
    const count = getFeatureDefinition(node).steps.filter((step) => step.kind === 'sweep').length
    appendFeatureStep(createDefaultSweepStep(node.profile, count))
    setFeedback('已添加扫描。V1 使用默认三点路径，后续可接草图路径。')
  }, [appendFeatureStep, node])

  const handleAddLoft = useCallback(() => {
    if (!node) return
    const count = getFeatureDefinition(node).steps.filter((step) => step.kind === 'loft').length
    appendFeatureStep(createDefaultLoftStep(node.profile, count))
    setFeedback('已添加放样。V1 使用当前轮廓和缩放后的第二截面。')
  }, [appendFeatureStep, node])

  const handleAddFillet = useCallback(() => {
    if (!node) return
    const count = getFeatureDefinition(node).steps.filter((step) => step.kind === 'fillet').length
    appendFeatureStep(createDefaultFilletStep(count))
    setFeedback('已添加圆角。V1 对整体拉伸体使用统一圆角预览。')
  }, [appendFeatureStep, node])

  const handleAddChamfer = useCallback(() => {
    if (!node) return
    const count = getFeatureDefinition(node).steps.filter((step) => step.kind === 'chamfer').length
    appendFeatureStep(createDefaultChamferStep(count))
    setFeedback('已添加倒角。V1 对整体拉伸体使用统一倒角预览。')
  }, [appendFeatureStep, node])

  const handleAddShell = useCallback(() => {
    if (!node) return
    const count = getFeatureDefinition(node).steps.filter((step) => step.kind === 'shell').length
    appendFeatureStep(createDefaultShellStep(count))
    setFeedback('已添加抽壳。V1 使用中心内缩轮廓形成空腔。')
  }, [appendFeatureStep, node])

  const handleAddDraft = useCallback(() => {
    if (!node) return
    const count = getFeatureDefinition(node).steps.filter((step) => step.kind === 'draft').length
    appendFeatureStep(createDefaultDraftStep(count))
    setFeedback('已添加拔模。V1 围绕轮廓中心收放顶部截面。')
  }, [appendFeatureStep, node])

  const updateFeatureDefinition = useCallback(
    (updater: (definition: FeatureDefinition) => FeatureDefinition) => {
      if (!node) return
      handleUpdate({ definition: updater(getFeatureDefinition(node)) })
    },
    [handleUpdate, node],
  )

  const updateFeatureStep = useCallback(
    (stepId: FeatureStep['id'], updater: (step: FeatureStep) => FeatureStep) => {
      updateFeatureDefinition((definition) => ({
        ...definition,
        steps: definition.steps.map((step) => (step.id === stepId ? updater(step) : step)),
        rebuild: { status: 'warning', message: '特征参数已更新，等待重建。' },
      }))
    },
    [updateFeatureDefinition],
  )

  const toggleFeatureStepSuppressed = useCallback(
    (stepId: FeatureStep['id']) => {
      updateFeatureStep(stepId, (step) => ({
        ...step,
        suppressed: !step.suppressed,
        rebuild: {
          ...step.rebuild,
          status: step.suppressed ? 'ok' : 'suppressed',
        },
      }))
    },
    [updateFeatureStep],
  )

  const deleteFeatureStep = useCallback(
    (stepId: FeatureStep['id']) => {
      updateFeatureDefinition((definition) => ({
        ...definition,
        steps: definition.steps.filter((step) => step.id !== stepId),
        rebuild: { status: 'warning', message: '特征步骤已删除，等待重建。' },
      }))
    },
    [updateFeatureDefinition],
  )

  const moveTimelineStep = useCallback(
    (stepId: FeatureStep['id'], direction: 'up' | 'down') => {
      updateFeatureDefinition((definition) => moveFeatureStep(definition, stepId, direction))
    },
    [updateFeatureDefinition],
  )

  const addReferencePlane = useCallback(() => {
    updateFeatureDefinition((definition) => ({
      ...definition,
      referenceGeometry: [
        ...definition.referenceGeometry,
        createReferencePlane(definition.referenceGeometry.length),
      ],
      rebuild: { status: 'warning', message: '已添加参考几何。' },
    }))
  }, [updateFeatureDefinition])

  const addReferenceAxis = useCallback(() => {
    updateFeatureDefinition((definition) => ({
      ...definition,
      referenceGeometry: [
        ...definition.referenceGeometry,
        createReferenceAxis(definition.referenceGeometry.length),
      ],
      rebuild: { status: 'warning', message: '已添加参考几何。' },
    }))
  }, [updateFeatureDefinition])

  const addReferencePoint = useCallback(() => {
    updateFeatureDefinition((definition) => ({
      ...definition,
      referenceGeometry: [
        ...definition.referenceGeometry,
        createReferencePoint(definition.referenceGeometry.length),
      ],
      rebuild: { status: 'warning', message: '已添加参考几何。' },
    }))
  }, [updateFeatureDefinition])

  const deleteReferenceGeometry = useCallback(
    (referenceId: string) => {
      updateFeatureDefinition((definition) => ({
        ...definition,
        referenceGeometry: definition.referenceGeometry.filter(
          (reference) => reference.id !== referenceId,
        ),
        steps: definition.steps.map((step) =>
          step.kind === 'mirror' && step.mirrorPlaneId === referenceId
            ? { ...step, mirrorPlaneId: undefined }
            : step,
        ),
        rebuild: { status: 'warning', message: '参考几何已删除，相关步骤已回退默认引用。' },
      }))
    },
    [updateFeatureDefinition],
  )

  const updateReferencePlaneX = useCallback(
    (referenceId: string, x: number) => {
      updateFeatureDefinition((definition) => ({
        ...definition,
        referenceGeometry: definition.referenceGeometry.map((reference) =>
          reference.kind === 'plane' && reference.id === referenceId
            ? { ...reference, origin: [x, reference.origin[1], reference.origin[2]] }
            : reference,
        ),
        rebuild: { status: 'warning', message: '参考几何参数已更新。' },
      }))
    },
    [updateFeatureDefinition],
  )

  const addDerivedBody = useCallback(() => {
    if (!node) return
    updateFeatureDefinition((definition) => ({
      ...definition,
      bodies: [
        ...definition.bodies,
        createDerivedFeatureBody(
          definition.bodies.length,
          definition.steps.slice(0, 1).map((step) => step.id),
          node.profile,
          node.depth,
        ),
      ],
      rebuild: { status: 'warning', message: '已添加实体记录。' },
    }))
  }, [node, updateFeatureDefinition])

  const toggleBodyVisible = useCallback(
    (bodyId: string, visible: boolean) => {
      updateFeatureDefinition((definition) => setFeatureBodyVisible(definition, bodyId, visible))
    },
    [updateFeatureDefinition],
  )

  const updateBodyTranslationX = useCallback(
    (bodyId: string, x: number) => {
      updateFeatureDefinition((definition) => updateFeatureBodyTranslationX(definition, bodyId, x))
    },
    [updateFeatureDefinition],
  )

  const removeBody = useCallback(
    (bodyId: string) => {
      updateFeatureDefinition((definition) => deleteFeatureBody(definition, bodyId))
    },
    [updateFeatureDefinition],
  )

  const updateCombineBodies = useCallback(
    (
      stepId: string,
      updates: Parameters<typeof updateCombineStepBodies>[2],
    ) => {
      updateFeatureDefinition((definition) => updateCombineStepBodies(definition, stepId, updates))
    },
    [updateFeatureDefinition],
  )

  const setPatternSkipped = useCallback(
    (stepId: string, instanceIndex: number, skipped: boolean) => {
      updateFeatureDefinition((definition) =>
        setPatternInstanceSkipped(definition, stepId, instanceIndex, skipped),
      )
    },
    [updateFeatureDefinition],
  )

  const addCombineStep = useCallback(
    (operation: 'add' | 'subtract' | 'intersect') => {
      updateFeatureDefinition((definition) => {
        const nextDefinition = ensureDefaultFeatureBody(definition)
        const targetBody = nextDefinition.bodies[0]
        const toolBody = nextDefinition.bodies[1]
        if (!(targetBody && toolBody)) {
          return {
            ...nextDefinition,
            rebuild: { status: 'failed', message: '组合操作至少需要两个实体。' },
          }
        }

        const count = nextDefinition.steps.filter((step) => step.kind === 'combine').length
        return {
          ...nextDefinition,
          steps: [
            ...nextDefinition.steps,
            createCombineStep({
              operation,
              targetBodyId: targetBody.id,
              toolBodyIds: [toolBody.id],
              index: count,
            }),
          ],
          rebuild: { status: 'warning', message: '已添加组合步骤，等待诊断。' },
        }
      })
    },
    [updateFeatureDefinition],
  )

  const handleDiagnoseFeatureHistory = useCallback(() => {
    if (!node) return
    const rebuilt = rebuildFeatureDefinition(getFeatureDefinition(node), {
      existingNodeIds: new Set(Object.keys(nodes)),
      sourceProfile: node.profile,
      depth: node.depth,
      baseElevation: node.baseElevation,
    })
    handleUpdate({ definition: rebuilt })
    setFeedback(rebuilt.rebuild.message ?? '特征历史重建完成。')
  }, [handleUpdate, node, nodes])

  const handleSelectRevolveAxisLine = useCallback(() => {
    if (!(node?.kind === 'revolve' && node.revolveAxisLineId)) return
    const axisLine = getRevolveAxisLine(nodes, node.revolveAxisLineId)
    if (!axisLine) {
      setFeedback('未找到旋转轴来源参考线。')
      return
    }

    const sketchPlane = getSketchPlaneFromLineIds(nodes, [axisLine.id])
    setSketchPlane(sketchPlane)
    setViewMode('split')
    setPhase('structure')
    setMode('select')
    setStructureLayer('elements')
    setTool(null)
    setSelection({ selectedIds: [axisLine.id as AnyNode['id']] })
    setFeedback(null)
  }, [
    node,
    nodes,
    setMode,
    setPhase,
    setSelection,
    setSketchPlane,
    setStructureLayer,
    setTool,
    setViewMode,
  ])

  const handleUpdateRevolveAxisLine = useCallback(() => {
    if (!(node?.kind === 'revolve' && node.revolveAxisLineId)) return
    const axisLine = getRevolveAxisLine(nodes, node.revolveAxisLineId)
    const axisX = getRevolveAxisXFromLine(axisLine)
    if (axisX === null) {
      setFeedback('未找到旋转轴来源参考线，无法更新轴线。')
      return
    }

    handleUpdate({ revolveAxisX: axisX })
    setFeedback('已从来源参考线更新旋转轴。')
  }, [handleUpdate, node, nodes])

  const handleStartReassignRevolveAxisLine = useCallback(() => {
    if (!(node?.kind === 'revolve' && activeFeatureId)) return

    setRevolveAxisPick({ featureId: activeFeatureId })
    setViewMode('split')
    setPhase('structure')
    setMode('select')
    setStructureLayer('elements')
    setTool(null)
    setSelection({ selectedIds: [activeFeatureId] })
    setFeedback('请选择一条垂直参考线作为新的旋转轴。')
  }, [
    activeFeatureId,
    node,
    setMode,
    setPhase,
    setRevolveAxisPick,
    setSelection,
    setStructureLayer,
    setTool,
    setViewMode,
  ])

  const handleCancelReassignRevolveAxisLine = useCallback(() => {
    setRevolveAxisPick(null)
    if (activeFeatureId) {
      setSelection({ selectedIds: [activeFeatureId] })
    }
    setFeedback(null)
  }, [activeFeatureId, setRevolveAxisPick, setSelection])

  useEffect(() => {
    if (!(isPickingRevolveAxis && node?.kind === 'revolve' && activeFeatureId && selectedId)) {
      return
    }

    if (selectedId === activeFeatureId) {
      return
    }

    const selectedNode = nodes[selectedId]
    if (selectedNode?.type !== 'sketch-line') {
      setFeedback('请选择一条垂直 construction 参考线作为旋转轴。')
      return
    }

    if (!isRevolveAxisLineCandidate(selectedNode)) {
      setFeedback('旋转轴 V0 只支持垂直 construction 参考线。')
      return
    }

    const axisX = getRevolveAxisXFromLine(selectedNode)
    if (axisX === null) {
      setFeedback('无法读取所选参考线的位置。')
      return
    }

    handleUpdate({
      revolveAxisLineId: selectedNode.id,
      revolveAxisX: axisX,
    })
    setSketchPlane(getSketchPlaneFromLineIds(nodes, [selectedNode.id]))
    setRevolveAxisPick(null)
    setSelection({ selectedIds: [activeFeatureId] })
    setFeedback('已重新指定旋转轴线。')
  }, [
    activeFeatureId,
    handleUpdate,
    isPickingRevolveAxis,
    node,
    nodes,
    selectedId,
    setRevolveAxisPick,
    setSelection,
    setSketchPlane,
  ])

  if (!(node && node.type === 'feature' && activeFeatureId)) return null

  const isExtrude = node.kind === 'extrude'
  const isRevolve = node.kind === 'revolve'
  const area = calculatePolygonArea(node.profile.points)
  const profileXs = node.profile.points.map(([x]) => x)
  const profileMinX = profileXs.length > 0 ? Math.min(...profileXs) : 0
  const profileMaxX = profileXs.length > 0 ? Math.max(...profileXs) : 0
  const revolveAxisX =
    typeof node.revolveAxisX === 'number' && Number.isFinite(node.revolveAxisX)
      ? node.revolveAxisX
      : profileMinX
  const revolveAxisLine = isRevolve ? getRevolveAxisLine(nodes, node.revolveAxisLineId) : null
  const revolveAxisLineX = getRevolveAxisXFromLine(revolveAxisLine)
  const hasRevolveAxisLine = Boolean(node.revolveAxisLineId)
  const canUpdateRevolveAxisLine =
    isRevolve &&
    revolveAxisLineX !== null &&
    Math.abs(revolveAxisLineX - revolveAxisX) > 1e-4
  const revolveAngleRadians =
    typeof node.revolveAngle === 'number' && Number.isFinite(node.revolveAngle)
      ? node.revolveAngle
      : FULL_REVOLVE_ANGLE_RADIANS
  const revolveAngleDegrees = clampRevolveAngleDegrees(radiansToDegrees(revolveAngleRadians))
  const cutSummaries = node.cuts.map((cut, index) => ({
    cut,
    area: calculatePolygonArea(cut.profile.points),
    index,
    status: getSourceStatus(nodes, cut.profile),
  }))
  const cutArea = cutSummaries.reduce((sum, cut) => sum + cut.area, 0)
  const netArea = Math.max(0, area - cutArea)
  const volume = netArea * node.depth
  const sourceSketchLines = getSourceSketchLines(nodes, node.profile.lineIds)
  const profileStatus = getSourceStatus(nodes, node.profile)
  const topElevation = node.baseElevation + node.depth
  const canRebuildAll =
    profileStatus.canRefresh || cutSummaries.some((summary) => summary.status.canRefresh)
  const definition = ensureDefaultFeatureBody(getFeatureDefinition(node))
  const enabledStepCount = definition.steps.filter((step) => !step.suppressed).length
  const editableSteps = definition.steps.filter(
    (step) => step.kind !== 'extrude' && step.kind !== 'revolve',
  )
  const holeStepCount = definition.steps.filter((step) => step.kind === 'hole').length
  const reuseStepCount = definition.steps.filter(
    (step) =>
      step.kind === 'mirror' || step.kind === 'linear-pattern' || step.kind === 'circular-pattern',
  ).length
  const advancedShapeStepCount = definition.steps.filter(
    (step) => step.kind === 'sweep' || step.kind === 'loft',
  ).length
  const appliedStepCount = definition.steps.filter(
    (step) =>
      step.kind === 'fillet' ||
      step.kind === 'chamfer' ||
      step.kind === 'shell' ||
      step.kind === 'draft',
  ).length
  const referenceGeometryCount = definition.referenceGeometry.length
  const bodyCount = definition.bodies.length
  const failedStepCount = definition.steps.filter((step) => step.rebuild.status === 'failed').length
  const warningStepCount = definition.steps.filter(
    (step) => step.rebuild.status === 'warning',
  ).length
  const timelineStatus =
    failedStepCount > 0 ? '失败' : warningStepCount > 0 ? '需检查' : '正常'

  return (
    <PanelWrapper
      icon={<Box className="h-4 w-4" />}
      onClose={handleClose}
      title={node.name || (isRevolve ? '旋转' : '拉伸')}
      width={340}
    >
      <InspectorSummary>
        <InspectorStat label="类型" value={isRevolve ? '旋转' : '拉伸'} />
        <InspectorStat label="净面积" value={`${netArea.toFixed(2)} m²`} />
        <InspectorStat label="历史" value={`${enabledStepCount} 步`} />
        <InspectorStat label="重建" value={timelineStatus} />
        <InspectorStat label="成形" value={advancedShapeStepCount} />
        <InspectorStat label="应用" value={appliedStepCount} />
        <InspectorStat label="实体" value={bodyCount} />
        <InspectorStat label="参考" value={referenceGeometryCount} />
        {isExtrude ? (
          <>
            <InspectorStat label="深度" value={`${node.depth.toFixed(2)} m`} />
            <InspectorStat label="体积" value={`${volume.toFixed(2)} m³`} />
            <InspectorStat label="切割" value={node.cuts.length} />
            <InspectorStat label="孔" value={holeStepCount} />
            <InspectorStat label="顶面" value={`${topElevation.toFixed(2)} m`} />
          </>
        ) : (
          <>
            <InspectorStat label="旋转角" value={`${Math.round(revolveAngleDegrees)}°`} />
            <InspectorStat label="轴 X" value={`${revolveAxisX.toFixed(2)} m`} />
            <InspectorStat label="轴线" value={revolveAxisLine ? '参考线' : '手动'} />
            <InspectorStat label="复用" value={reuseStepCount} />
          </>
        )}
      </InspectorSummary>

      <PanelSection title="草图">
        <ActionGroup>
          <ActionButton
            disabled={isPickingRevolveAxis || node.profile.lineIds.length === 0}
            icon={<MousePointer2 className="h-3.5 w-3.5" />}
            label="来源草图"
            onClick={handleSelectSourceSketch}
          />
          <ActionButton
            disabled={isPickingRevolveAxis || !profileStatus.canRefresh}
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
            label="更新轮廓"
            onClick={handleRebuildProfile}
          />
        </ActionGroup>
        <ActionGroup className="mt-1.5">
          {isExtrude ? (
            <ActionButton
              icon={<PencilLine className="h-3.5 w-3.5" />}
              label="顶面草图"
              onClick={handleSketchOnTopFace}
            />
          ) : null}
          <ActionButton
            disabled={isPickingRevolveAxis || !canRebuildAll}
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
            label="更新全部"
            onClick={handleRebuildAll}
          />
          <ActionButton
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="重建"
            onClick={handleDiagnoseFeatureHistory}
          />
        </ActionGroup>
        {isRevolve ? (
          <ActionGroup className="mt-1.5">
            {hasRevolveAxisLine ? (
              <>
                <ActionButton
                  disabled={!revolveAxisLine || isPickingRevolveAxis}
                  icon={<MousePointer2 className="h-3.5 w-3.5" />}
                  label="来源轴线"
                  onClick={handleSelectRevolveAxisLine}
                />
                <ActionButton
                  disabled={!canUpdateRevolveAxisLine || isPickingRevolveAxis}
                  icon={<RefreshCcw className="h-3.5 w-3.5" />}
                  label="更新轴线"
                  onClick={handleUpdateRevolveAxisLine}
                />
              </>
            ) : null}
            <ActionButton
              icon={
                isPickingRevolveAxis ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Crosshair className="h-3.5 w-3.5" />
                )
              }
              label={isPickingRevolveAxis ? '取消' : '重选轴线'}
              onClick={
                isPickingRevolveAxis
                  ? handleCancelReassignRevolveAxisLine
                  : handleStartReassignRevolveAxisLine
              }
            />
          </ActionGroup>
        ) : null}
        {feedback ? (
          <div className="mt-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-muted-foreground text-xs">
            {feedback}
          </div>
        ) : null}
      </PanelSection>

      <PanelSection title="实体特征">
        <ActionGroup>
          {isExtrude ? (
            <ActionButton
              icon={<CircleDot className="h-3.5 w-3.5" />}
              label="贯穿孔"
              onClick={handleAddThroughHole}
            />
          ) : null}
          <ActionButton
            icon={<Copy className="h-3.5 w-3.5" />}
            label="镜像"
            onClick={handleAddMirror}
          />
        </ActionGroup>
        <ActionGroup className="mt-1.5">
          <ActionButton
            icon={<Grid3X3 className="h-3.5 w-3.5" />}
            label="线性阵列"
            onClick={handleAddLinearPattern}
          />
          <ActionButton
            icon={<RotateCw className="h-3.5 w-3.5" />}
            label="圆周阵列"
            onClick={handleAddCircularPattern}
          />
        </ActionGroup>
        <ActionGroup className="mt-1.5">
          <ActionButton
            icon={<WandSparkles className="h-3.5 w-3.5" />}
            label="扫描"
            onClick={handleAddSweep}
          />
          <ActionButton
            icon={<Layers3 className="h-3.5 w-3.5" />}
            label="放样"
            onClick={handleAddLoft}
          />
        </ActionGroup>
        {isExtrude ? (
          <>
            <ActionGroup className="mt-1.5">
              <ActionButton
                icon={<RotateCw className="h-3.5 w-3.5" />}
                label="圆角"
                onClick={handleAddFillet}
              />
              <ActionButton
                icon={<Scissors className="h-3.5 w-3.5" />}
                label="倒角"
                onClick={handleAddChamfer}
              />
            </ActionGroup>
            <ActionGroup className="mt-1.5">
              <ActionButton
                icon={<Shell className="h-3.5 w-3.5" />}
                label="抽壳"
                onClick={handleAddShell}
              />
              <ActionButton
                icon={<Crosshair className="h-3.5 w-3.5" />}
                label="拔模"
                onClick={handleAddDraft}
              />
            </ActionGroup>
          </>
        ) : null}
      </PanelSection>

      <PanelSection title="参考几何与实体">
        <ActionGroup>
          <ActionButton
            icon={<Plus className="h-3.5 w-3.5" />}
            label="新增实体"
            onClick={addDerivedBody}
          />
          <ActionButton
            icon={<Plane className="h-3.5 w-3.5" />}
            label="基准面"
            onClick={addReferencePlane}
          />
        </ActionGroup>
        <ActionGroup className="mt-1.5">
          <ActionButton
            icon={<Crosshair className="h-3.5 w-3.5" />}
            label="基准轴"
            onClick={addReferenceAxis}
          />
          <ActionButton
            icon={<Dot className="h-3.5 w-3.5" />}
            label="基准点"
            onClick={addReferencePoint}
          />
        </ActionGroup>
        <ActionGroup className="mt-1.5">
          <ActionButton
            icon={<Copy className="h-3.5 w-3.5" />}
            label="合并"
            onClick={() => addCombineStep('add')}
          />
          <ActionButton
            icon={<Scissors className="h-3.5 w-3.5" />}
            label="相减"
            onClick={() => addCombineStep('subtract')}
          />
          <ActionButton
            icon={<Crosshair className="h-3.5 w-3.5" />}
            label="相交"
            onClick={() => addCombineStep('intersect')}
          />
        </ActionGroup>
        <div className="mt-2 flex flex-col gap-1.5">
          {definition.bodies.map((body, index) => (
            <div className="flex flex-col gap-1" key={body.id}>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/65 bg-card/70 px-2.5 py-2 text-xs">
                <div className="min-w-0">
                  <div className="font-medium">{body.name ?? `实体 ${index + 1}`}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {body.sourceStepIds.length} 来源步骤 · X{' '}
                    {(body.transform?.translation[0] ?? 0).toFixed(2)} m
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors hover:bg-muted"
                    onClick={() => toggleBodyVisible(body.id, !body.visible)}
                    title={body.visible ? '隐藏实体' : '显示实体'}
                    type="button"
                  >
                    {body.visible ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={definition.bodies.length <= 1}
                    onClick={() => removeBody(body.id)}
                    title="删除实体"
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <SliderControl
                label="实体 X"
                max={10}
                min={-10}
                onChange={(value) => updateBodyTranslationX(body.id, value)}
                precision={2}
                step={0.05}
                unit="m"
                value={body.transform?.translation[0] ?? 0}
              />
            </div>
          ))}
          {definition.referenceGeometry.map((reference) => (
            <div className="flex flex-col gap-1" key={reference.id}>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/65 bg-card/70 px-2.5 py-2 text-xs">
                <div className="min-w-0">
                  <div className="font-medium">{reference.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {reference.kind === 'plane'
                      ? `Plane · X ${reference.origin[0].toFixed(2)} m`
                      : reference.kind === 'axis'
                        ? `Axis · ${reference.direction.map((value) => value.toFixed(0)).join(', ')}`
                        : `Point · ${reference.position.map((value) => value.toFixed(2)).join(', ')}`}
                  </div>
                </div>
                <button
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15"
                  onClick={() => deleteReferenceGeometry(reference.id)}
                  title="删除参考几何"
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {reference.kind === 'plane' ? (
                <SliderControl
                  label="基准 X"
                  max={5}
                  min={-5}
                  onChange={(value) => updateReferencePlaneX(reference.id, value)}
                  precision={2}
                  step={0.05}
                  unit="m"
                  value={reference.origin[0]}
                />
              ) : null}
            </div>
          ))}
        </div>
      </PanelSection>

      {editableSteps.length > 0 ? (
        <PanelSection title="参数化步骤">
          <div className="flex flex-col gap-1.5">
            {editableSteps.map((step, index) => (
              <div
                className="rounded-md border border-border/65 bg-card/70 px-2.5 py-2"
                key={step.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground text-xs">
                      {index + 1}. {getFeatureStepLabel(step)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {step.suppressed
                        ? '已禁用'
                        : step.rebuild.message || `状态 ${step.rebuild.status}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={index === 0}
                      onClick={() => moveTimelineStep(step.id, 'up')}
                      title="上移步骤"
                      type="button"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={index === editableSteps.length - 1}
                      onClick={() => moveTimelineStep(step.id, 'down')}
                      title="下移步骤"
                      type="button"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
                      onClick={() => toggleFeatureStepSuppressed(step.id)}
                      title={step.suppressed ? '恢复步骤' : '禁用步骤'}
                      type="button"
                    >
                      {step.suppressed ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15"
                      onClick={() => deleteFeatureStep(step.id)}
                      title="删除步骤"
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  {step.kind === 'hole' ? (
                    <SliderControl
                      label="直径"
                      max={2}
                      min={0.05}
                      onChange={(value) =>
                        updateFeatureStep(step.id, (current) =>
                          current.kind === 'hole' ? { ...current, diameter: value } : current,
                        )
                      }
                      precision={2}
                      step={0.05}
                      unit="m"
                      value={step.diameter}
                    />
                  ) : null}

                  {step.kind === 'linear-pattern' ? (
                    <>
                      <SliderControl
                        label="数量"
                        max={12}
                        min={1}
                        onChange={(value) =>
                          updateFeatureStep(step.id, (current) =>
                            current.kind === 'linear-pattern'
                              ? { ...current, count: Math.max(1, Math.round(value)) }
                              : current,
                          )
                        }
                        precision={0}
                        step={1}
                        value={step.count}
                      />
                      <SliderControl
                        label="间距"
                        max={5}
                        min={0.1}
                        onChange={(value) =>
                          updateFeatureStep(step.id, (current) =>
                            current.kind === 'linear-pattern'
                              ? { ...current, spacing: value }
                              : current,
                          )
                        }
                        precision={2}
                        step={0.1}
                        unit="m"
                        value={step.spacing ?? 1}
                      />
                      {step.count > 1 ? (
                        <div className="flex flex-wrap gap-1 rounded-md bg-muted/30 px-2 py-1.5">
                          {Array.from({ length: step.count - 1 }, (_, offset) => offset + 1).map(
                            (instanceIndex) => (
                              <button
                                className={`h-6 min-w-7 rounded border px-2 text-[11px] transition-colors ${
                                  step.skippedInstances.includes(instanceIndex)
                                    ? 'border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                }`}
                                key={instanceIndex}
                                onClick={() =>
                                  setPatternSkipped(
                                    step.id,
                                    instanceIndex,
                                    !step.skippedInstances.includes(instanceIndex),
                                  )
                                }
                                title={
                                  step.skippedInstances.includes(instanceIndex)
                                    ? `恢复实例 ${instanceIndex + 1}`
                                    : `跳过实例 ${instanceIndex + 1}`
                                }
                                type="button"
                              >
                                {instanceIndex + 1}
                              </button>
                            ),
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {step.kind === 'circular-pattern' ? (
                    <>
                      <SliderControl
                        label="数量"
                        max={16}
                        min={1}
                        onChange={(value) =>
                          updateFeatureStep(step.id, (current) =>
                            current.kind === 'circular-pattern'
                              ? { ...current, count: Math.max(1, Math.round(value)) }
                              : current,
                          )
                        }
                        precision={0}
                        step={1}
                        value={step.count}
                      />
                      <SliderControl
                        label="角度"
                        max={360}
                        min={5}
                        onChange={(value) =>
                          updateFeatureStep(step.id, (current) =>
                            current.kind === 'circular-pattern'
                              ? { ...current, angle: degreesToRadians(value) }
                              : current,
                          )
                        }
                        precision={0}
                        step={5}
                        unit="°"
                        value={Math.round(radiansToDegrees(step.angle ?? Math.PI * 2))}
                      />
                      {step.count > 1 ? (
                        <div className="flex flex-wrap gap-1 rounded-md bg-muted/30 px-2 py-1.5">
                          {Array.from({ length: step.count - 1 }, (_, offset) => offset + 1).map(
                            (instanceIndex) => (
                              <button
                                className={`h-6 min-w-7 rounded border px-2 text-[11px] transition-colors ${
                                  step.skippedInstances.includes(instanceIndex)
                                    ? 'border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                }`}
                                key={instanceIndex}
                                onClick={() =>
                                  setPatternSkipped(
                                    step.id,
                                    instanceIndex,
                                    !step.skippedInstances.includes(instanceIndex),
                                  )
                                }
                                title={
                                  step.skippedInstances.includes(instanceIndex)
                                    ? `恢复实例 ${instanceIndex + 1}`
                                    : `跳过实例 ${instanceIndex + 1}`
                                }
                                type="button"
                              >
                                {instanceIndex + 1}
                              </button>
                            ),
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {step.kind === 'fillet' ? (
                    <SliderControl
                      label="半径"
                      max={0.5}
                      min={0.01}
                      onChange={(value) =>
                        updateFeatureStep(step.id, (current) =>
                          current.kind === 'fillet' ? { ...current, radius: value } : current,
                        )
                      }
                      precision={2}
                      step={0.01}
                      unit="m"
                      value={step.radius ?? 0.08}
                    />
                  ) : null}

                  {step.kind === 'chamfer' ? (
                    <SliderControl
                      label="距离"
                      max={0.5}
                      min={0.01}
                      onChange={(value) =>
                        updateFeatureStep(step.id, (current) =>
                          current.kind === 'chamfer' ? { ...current, distance: value } : current,
                        )
                      }
                      precision={2}
                      step={0.01}
                      unit="m"
                      value={step.distance ?? 0.08}
                    />
                  ) : null}

                  {step.kind === 'shell' ? (
                    <SliderControl
                      label="厚度"
                      max={0.8}
                      min={0.02}
                      onChange={(value) =>
                        updateFeatureStep(step.id, (current) =>
                          current.kind === 'shell' ? { ...current, thickness: value } : current,
                        )
                      }
                      precision={2}
                      step={0.02}
                      unit="m"
                      value={step.thickness}
                    />
                  ) : null}

                  {step.kind === 'draft' ? (
                    <SliderControl
                      label="角度"
                      max={30}
                      min={-30}
                      onChange={(value) =>
                        updateFeatureStep(step.id, (current) =>
                          current.kind === 'draft' ? { ...current, angle: value } : current,
                        )
                      }
                      precision={0}
                      step={1}
                      unit="°"
                      value={step.angle}
                    />
                  ) : null}

                  {step.kind === 'sweep' ? (
                    <SliderControl
                      label="路径抬高"
                      max={3}
                      min={-3}
                      onChange={(value) =>
                        updateFeatureStep(step.id, (current) =>
                          current.kind === 'sweep'
                            ? {
                                ...current,
                                pathPoints: current.pathPoints.map((point, pointIndex) =>
                                  pointIndex === 1 ? [point[0], value, point[2]] : point,
                                ),
                              }
                            : current,
                        )
                      }
                      precision={2}
                      step={0.05}
                      unit="m"
                      value={step.pathPoints[1]?.[1] ?? 0}
                    />
                  ) : null}

                  {step.kind === 'loft' ? (
                    <SliderControl
                      label="截面缩放"
                      max={1.5}
                      min={0.2}
                      onChange={(value) =>
                        updateFeatureStep(step.id, (current) =>
                          current.kind === 'loft'
                            ? {
                                ...current,
                                profiles: [
                                  current.profiles[0] ?? node.profile,
                                  scaleProfileAroundCenter(current.profiles[0] ?? node.profile, value),
                                ],
                              }
                            : current,
                        )
                      }
                      precision={2}
                      step={0.05}
                      value={getApproximateLoftScale(step)}
                    />
                  ) : null}

                  {step.kind === 'combine' ? (
                    <div className="flex flex-col gap-1.5 rounded-md bg-muted/30 px-2 py-2">
                      <label className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground">操作</span>
                        <select
                          className="h-7 rounded border border-border bg-background px-2 text-foreground text-xs"
                          onChange={(event) =>
                            updateCombineBodies(step.id, {
                              operation: event.target.value as typeof step.operation,
                            })
                          }
                          value={step.operation}
                        >
                          <option value="add">合并</option>
                          <option value="subtract">相减</option>
                          <option value="intersect">相交</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground">目标体</span>
                        <select
                          className="h-7 rounded border border-border bg-background px-2 text-foreground text-xs"
                          onChange={(event) =>
                            updateCombineBodies(step.id, { targetBodyId: event.target.value })
                          }
                          value={step.targetBodyId}
                        >
                          {definition.bodies.map((body) => (
                            <option key={body.id} value={body.id}>
                              {getBodyLabel(definition, body.id)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-col gap-1">
                        <div className="text-[11px] text-muted-foreground">工具体</div>
                        {definition.bodies
                          .filter((body) => body.id !== step.targetBodyId)
                          .map((body) => (
                            <label
                              className="flex items-center justify-between gap-2 rounded border border-border/45 bg-background/65 px-2 py-1 text-[11px]"
                              key={body.id}
                            >
                              <span>{getBodyLabel(definition, body.id)}</span>
                              <input
                                checked={step.toolBodyIds.includes(body.id)}
                                onChange={(event) => {
                                  const nextToolBodyIds = event.target.checked
                                    ? [...step.toolBodyIds, body.id]
                                    : step.toolBodyIds.filter((bodyId) => bodyId !== body.id)
                                  updateCombineBodies(step.id, { toolBodyIds: nextToolBodyIds })
                                }}
                                type="checkbox"
                              />
                            </label>
                          ))}
                      </div>
                      <label className="flex items-center justify-between gap-2 rounded border border-border/45 bg-background/65 px-2 py-1 text-[11px]">
                        <span>保留工具体</span>
                        <input
                          checked={step.keepTools}
                          onChange={(event) =>
                            updateCombineBodies(step.id, { keepTools: event.target.checked })
                          }
                          type="checkbox"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </PanelSection>
      ) : null}

      <PanelSection title="历史">
        <div className="flex flex-col gap-1.5">
          <div className="rounded-md border border-border/65 bg-card/70 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                  <MousePointer2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>1. 基础轮廓</span>
                  <SourceStatusBadge status={profileStatus} />
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {area.toFixed(2)} m² · {node.profile.lineIds.length} 条草图边 · 已找到{' '}
                  {sourceSketchLines.length} 条
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={node.profile.lineIds.length === 0}
                  onClick={handleSelectSourceSketch}
                  title="选择来源草图"
                  type="button"
                >
                  <MousePointer2 className="h-3.5 w-3.5" />
                </button>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!profileStatus.canRefresh}
                  onClick={handleRebuildProfile}
                  title="从来源草图更新轮廓"
                  type="button"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border/65 bg-card/70 px-2.5 py-2">
            <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              <span>2. {isRevolve ? '旋转' : '拉伸'}</span>
            </div>
            {isExtrude ? (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                基准 {node.baseElevation.toFixed(2)} m · 深度 {node.depth.toFixed(2)} m · 顶面{' '}
                {topElevation.toFixed(2)} m
              </div>
            ) : (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                轴 X {revolveAxisX.toFixed(2)} m · 角度 {Math.round(revolveAngleDegrees)}° · 基准{' '}
                {node.baseElevation.toFixed(2)} m
                {hasRevolveAxisLine
                  ? revolveAxisLine
                    ? ` · 来源参考线${canUpdateRevolveAxisLine ? '可更新' : '已同步'}`
                    : ' · 来源轴线缺失'
                  : ' · 手动轴'}
              </div>
            )}
          </div>

          {isExtrude && cutSummaries.length > 0 ? (
            cutSummaries.map(({ area: cutAreaValue, cut, index, status }) => (
              <div
                className="rounded-md border border-border/65 bg-card/70 px-2.5 py-2"
                key={cut.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                      <Scissors className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{index + 3}. 切割 {index + 1}</span>
                      <SourceStatusBadge status={status} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {cutAreaValue.toFixed(2)} m² · {cut.profile.lineIds.length} 条草图边
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
                      onClick={() => handleSelectCutSketch(cut)}
                      title="选择切割草图"
                      type="button"
                    >
                      <MousePointer2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!status.canRefresh}
                      onClick={() => handleRebuildCut(index)}
                      title="从来源草图更新切割"
                      type="button"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15"
                      onClick={() => handleDeleteCut(index)}
                      title="删除切割"
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : isExtrude ? (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-4 text-center text-muted-foreground text-xs">
              暂无切割
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-4 text-center text-muted-foreground text-xs">
              旋转 V0 暂不支持切割步骤
            </div>
          )}
        </div>
      </PanelSection>

      <PanelSection title="参数">
        {isExtrude ? (
          <SliderControl
            label="拉伸深度"
            max={10}
            min={0.05}
            onChange={(value) => handleUpdate({ depth: value })}
            precision={2}
            step={0.05}
            unit="m"
            value={Math.round(node.depth * 100) / 100}
          />
        ) : (
          <>
            <SliderControl
              label="旋转角度"
              max={MAX_REVOLVE_ANGLE_DEGREES}
              min={MIN_REVOLVE_ANGLE_DEGREES}
              onChange={(value) => handleUpdate({ revolveAngle: degreesToRadians(value) })}
              precision={0}
              step={5}
              unit="°"
              value={Math.round(revolveAngleDegrees)}
            />
            <SliderControl
              label="旋转轴 X"
              max={profileMaxX + 5}
              min={profileMinX - 5}
              onChange={(value) => handleUpdate({ revolveAxisX: value })}
              precision={2}
              step={0.05}
              unit="m"
              value={Math.round(revolveAxisX * 100) / 100}
            />
          </>
        )}
        <SliderControl
          label="基准高度"
          max={5}
          min={-2}
          onChange={(value) => handleUpdate({ baseElevation: value })}
          precision={2}
          step={0.05}
          unit="m"
          value={Math.round(node.baseElevation * 100) / 100}
        />
      </PanelSection>
    </PanelWrapper>
  )
}
