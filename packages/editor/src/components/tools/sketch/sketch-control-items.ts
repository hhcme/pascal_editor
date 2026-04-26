import type {
  SketchCircleConstraintKind,
  SketchCircleNode,
  SketchDimensionNode,
  SketchLineCoincidentReference,
  SketchCircleRelation,
  SketchLineConstraintKind,
  SketchLineEndpoint,
  SketchLineNode,
  SketchLineRelation,
} from '@pascal-app/core'
import {
  clearSketchCircleRadiusDimensionData,
  clearSketchLineAngleDimensionData,
  clearSketchLineLengthDimensionData,
  getSketchCircleDisplayedDimensionLabel,
  getSketchCircleDisplayedDimensionMode,
  getSketchCircleDisplayedDimensionValue,
  getSketchLineAngleDimensionMode,
  getSketchLineDisplayedAngleDegrees,
  hasSketchCircleAnyDimension,
  getSketchLineLengthDimensionMode,
} from './sketch-dimensions'
import {
  isSketchCoincidentCirclePointReference,
  isSketchCoincidentEndpointReference,
  isSketchLineMidpointParameter,
  isSketchCoincidentLinePointReference,
} from './sketch-coincident'
import {
  getSketchDistanceDimensionCircleRole,
  getSketchDistanceDimensionLineRole,
  getSketchDistanceDimensionValue,
  getSketchDistanceMeasurementRelationLabel,
  resolveSketchDistanceMeasurement,
  type SketchDistanceDimensionEntityRole,
} from './sketch-distance-dimensions'

type SketchLineUpdate = {
  id: SketchLineNode['id']
  data: Partial<SketchLineNode>
}

type SketchCircleUpdate = {
  id: SketchCircleNode['id']
  data: Partial<SketchCircleNode>
}

type SketchDimensionDeleteUpdate = {
  id: SketchDimensionNode['id']
  delete: true
}

type SketchControlItemBase = {
  id: string
  label: string
  detail?: string
}

export type SketchControlItemCategory = 'relation' | 'dimension' | 'constraint' | 'connection'

export type SketchLineControlItem =
  | (SketchControlItemBase & {
      kind: 'relation'
      relation: SketchLineRelation
    })
  | (SketchControlItemBase & {
      kind: 'dimension'
      dimension: 'length' | 'angle'
    })
  | (SketchControlItemBase & {
      kind: 'constraint'
      constraintKind: SketchLineConstraintKind
      targetId: SketchLineNode['id']
    })
  | (SketchControlItemBase & {
      kind: 'coincident'
      endpoint: SketchLineEndpoint
      reference: SketchLineCoincidentReference
    })
  | (SketchControlItemBase & {
      kind: 'tangent'
      endpoint: SketchLineEndpoint
      circleId: SketchCircleNode['id']
    })
  | (SketchControlItemBase & {
      kind: 'distance-dimension'
      dimensionId: SketchDimensionNode['id']
      mode: SketchDimensionNode['mode']
      role: SketchDistanceDimensionEntityRole
    })

export type SketchCircleControlItem =
  | (SketchControlItemBase & {
      kind: 'relation'
      relation: SketchCircleRelation
    })
  | (SketchControlItemBase & {
      kind: 'dimension'
      dimension: 'radius'
    })
  | (SketchControlItemBase & {
      kind: 'constraint'
      constraintKind: SketchCircleConstraintKind
      targetId: SketchCircleNode['id']
    })
  | (SketchControlItemBase & {
      kind: 'distance-dimension'
      dimensionId: SketchDimensionNode['id']
      mode: SketchDimensionNode['mode']
      role: SketchDistanceDimensionEntityRole
    })

export type SketchLevelControlEntry =
  | {
      id: string
      ownerType: 'line'
      ownerId: SketchLineNode['id']
      ownerLabel: string
      category: SketchControlItemCategory
      label: string
      detail?: string
      item: SketchLineControlItem
    }
  | {
      id: string
      ownerType: 'circle'
      ownerId: SketchCircleNode['id']
      ownerLabel: string
      category: SketchControlItemCategory
      label: string
      detail?: string
      item: SketchCircleControlItem
    }

export type SketchLevelControlUpdate =
  | SketchLineUpdate
  | SketchCircleUpdate
  | SketchDimensionDeleteUpdate

export function isSketchControlDeleteUpdate(
  update: SketchLevelControlUpdate,
): update is SketchDimensionDeleteUpdate {
  return 'delete' in update && update.delete === true
}

function isSketchLineUpdate(update: SketchLevelControlUpdate): update is SketchLineUpdate {
  return 'data' in update && update.id.startsWith('sketch_line_')
}

function isSketchCircleUpdate(update: SketchLevelControlUpdate): update is SketchCircleUpdate {
  return 'data' in update && update.id.startsWith('sketch_circle_')
}

function formatMeters(value: number) {
  return `${value.toFixed(2)} m`
}

function formatDegrees(value: number) {
  return `${value.toFixed(1)}°`
}

function getSketchLineRelationLabel(relation: SketchLineRelation) {
  if (relation === 'horizontal') {
    return '水平'
  }
  if (relation === 'vertical') {
    return '垂直'
  }
  return '固定'
}

function getSketchCircleRelationLabel(relation: SketchCircleRelation) {
  return relation === 'fixed' ? '固定' : relation
}

function getSketchLineConstraintLabel(kind: SketchLineConstraintKind) {
  if (kind === 'equal-length') {
    return '等长'
  }
  if (kind === 'parallel') {
    return '平行'
  }
  if (kind === 'perpendicular') {
    return '垂直'
  }
  return '共线'
}

function getSketchCircleConstraintLabel(kind: SketchCircleConstraintKind) {
  if (kind === 'concentric') {
    return '同心'
  }
  if (kind === 'equal-radius') {
    return '等半径'
  }
  return '相切'
}

function getSketchLineDisplayName(line: SketchLineNode | undefined) {
  if (!line) {
    return '缺失草图线'
  }
  return line.name || '草图线'
}

function getSketchCircleDisplayName(circle: SketchCircleNode | undefined) {
  if (!circle) {
    return '缺失草图圆'
  }
  return circle.name || (circle.kind === 'arc' ? '草图圆弧' : '草图圆')
}

function getEndpointLabel(endpoint: SketchLineEndpoint) {
  return endpoint === 'start' ? '起点' : '终点'
}

function getSketchCoincidentDetail(args: {
  reference: SketchLineCoincidentReference
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}) {
  const { reference, linesById, circlesById } = args
  if (isSketchCoincidentEndpointReference(reference)) {
    return `${getSketchLineDisplayName(linesById.get(reference.lineId))} ${getEndpointLabel(reference.endpoint)}`
  }

  if (isSketchCoincidentLinePointReference(reference)) {
    return `${isSketchLineMidpointParameter(reference.t) ? '中点' : '在线上'} -> ${getSketchLineDisplayName(
      linesById.get(reference.lineId),
    )}`
  }

  return `在圆上 -> ${getSketchCircleDisplayName(circlesById.get(reference.circleId))}`
}

function getSketchLineOwnerLabel(line: SketchLineNode) {
  if (line.name?.trim()) {
    return line.name
  }
  return `草图线 ${line.id.slice(-4)}`
}

function getSketchCircleOwnerLabel(circle: SketchCircleNode) {
  if (circle.name?.trim()) {
    return circle.name
  }
  const baseLabel = circle.kind === 'arc' ? '草图圆弧' : '草图圆'
  return `${baseLabel} ${circle.id.slice(-4)}`
}

function getSketchDistanceDimensionLabel(args: {
  mode: SketchDimensionNode['mode']
  role: SketchDistanceDimensionEntityRole
}) {
  const { mode, role } = args
  if (mode !== 'driven') {
    return '参考距离'
  }
  return role === 'anchor' ? '驱动距离锚点' : '驱动距离'
}

function getSketchDistanceDimensionDetail(args: {
  dimension: SketchDimensionNode
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  role: SketchDistanceDimensionEntityRole
}) {
  const { circlesById, dimension, linesById, role } = args
  const measurementResult = resolveSketchDistanceMeasurement({
    circlesById,
    dimension,
    linesById,
  })
  if (!measurementResult.ok) {
    return role === 'anchor' ? '锚点 · 引用失效' : '引用失效'
  }

  const parts = [
    role === 'anchor' ? '锚点' : null,
    getSketchDistanceMeasurementRelationLabel(measurementResult.measurement.relation),
    formatMeters(measurementResult.measurement.value),
  ].filter((part): part is string => Boolean(part))
  return parts.join(' · ')
}

function removeLineConstraintPair(args: {
  line: SketchLineNode
  targetId: SketchLineNode['id']
  kind: SketchLineConstraintKind
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
}) {
  const { line, targetId, kind, linesById } = args
  const updates: SketchLineUpdate[] = []
  const nextLineConstraints = (line.constraints ?? []).filter(
    (constraint) => !(constraint.kind === kind && constraint.targetId === targetId),
  )
  if (nextLineConstraints.length !== (line.constraints ?? []).length) {
    updates.push({
      id: line.id,
      data: { constraints: nextLineConstraints },
    })
  }

  const target = linesById.get(targetId)
  if (!target) {
    return updates
  }

  const nextTargetConstraints = (target.constraints ?? []).filter(
    (constraint) => !(constraint.kind === kind && constraint.targetId === line.id),
  )
  if (nextTargetConstraints.length !== (target.constraints ?? []).length) {
    updates.push({
      id: target.id,
      data: { constraints: nextTargetConstraints },
    })
  }

  return updates
}

function removeCircleConstraintPair(args: {
  circle: SketchCircleNode
  targetId: SketchCircleNode['id']
  kind: SketchCircleConstraintKind
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}) {
  const { circle, targetId, kind, circlesById } = args
  const updates: SketchCircleUpdate[] = []
  const nextCircleConstraints = (circle.constraints ?? []).filter(
    (constraint) => !(constraint.kind === kind && constraint.targetId === targetId),
  )
  if (nextCircleConstraints.length !== (circle.constraints ?? []).length) {
    updates.push({
      id: circle.id,
      data: { constraints: nextCircleConstraints },
    })
  }

  const target = circlesById.get(targetId)
  if (!target) {
    return updates
  }

  const nextTargetConstraints = (target.constraints ?? []).filter(
    (constraint) => !(constraint.kind === kind && constraint.targetId === circle.id),
  )
  if (nextTargetConstraints.length !== (target.constraints ?? []).length) {
    updates.push({
      id: target.id,
      data: { constraints: nextTargetConstraints },
    })
  }

  return updates
}

export function getSketchLineControlItems(args: {
  line: SketchLineNode
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  sketchDimensions?: SketchDimensionNode[]
}): SketchLineControlItem[] {
  const { line, linesById, circlesById, sketchDimensions = [] } = args
  const items: SketchLineControlItem[] = []

  for (const relation of line.relations ?? []) {
    items.push({
      id: `relation:${relation}`,
      kind: 'relation',
      relation,
      label: getSketchLineRelationLabel(relation),
      detail: relation === 'fixed' ? '锁定位置与方向' : '方向控制',
    })
  }

  if (line.dimensions?.length) {
    const mode = getSketchLineLengthDimensionMode(line) ?? 'driven'
    items.push({
      id: 'dimension:length',
      kind: 'dimension',
      dimension: 'length',
      label: mode === 'reference' ? '参考长度' : '驱动长度',
      detail: formatMeters(line.dimensions.length),
    })
  }
  if (line.dimensions?.angle !== undefined) {
    const mode = getSketchLineAngleDimensionMode(line) ?? 'driven'
    items.push({
      id: 'dimension:angle',
      kind: 'dimension',
      dimension: 'angle',
      label: mode === 'reference' ? '参考角度' : '驱动角度',
      detail: formatDegrees(getSketchLineDisplayedAngleDegrees(line)),
    })
  }

  if (line.tangent) {
    items.push({
      id: `tangent:${line.tangent.circleId}:${line.tangent.endpoint}`,
      kind: 'tangent',
      endpoint: line.tangent.endpoint,
      circleId: line.tangent.circleId,
      label: '相切',
      detail: `${getEndpointLabel(line.tangent.endpoint)} -> ${getSketchCircleDisplayName(
        circlesById.get(line.tangent.circleId),
      )}`,
    })
  }

  for (const endpoint of ['start', 'end'] as const) {
    const reference = line.coincident?.[endpoint]
    if (!reference) {
      continue
    }
    items.push({
      id: `coincident:${endpoint}`,
      kind: 'coincident',
      endpoint,
      reference,
      label: `${getEndpointLabel(endpoint)}重合`,
      detail: getSketchCoincidentDetail({
        reference,
        linesById,
        circlesById,
      }),
    })
  }

  for (const constraint of line.constraints ?? []) {
    items.push({
      id: `constraint:${constraint.kind}:${constraint.targetId}`,
      kind: 'constraint',
      constraintKind: constraint.kind,
      targetId: constraint.targetId,
      label: getSketchLineConstraintLabel(constraint.kind),
      detail: getSketchLineDisplayName(linesById.get(constraint.targetId)),
    })
  }

  for (const dimension of sketchDimensions) {
    const role = getSketchDistanceDimensionLineRole({
      dimension,
      lineId: line.id,
    })
    if (!role) {
      continue
    }

    items.push({
      id: `distance-dimension:${dimension.id}:${role}`,
      kind: 'distance-dimension',
      dimensionId: dimension.id,
      mode: dimension.mode,
      role,
      label: getSketchDistanceDimensionLabel({
        mode: dimension.mode,
        role,
      }),
      detail: getSketchDistanceDimensionDetail({
        dimension,
        linesById,
        circlesById,
        role,
      }),
    })
  }

  return items
}

export function buildRemoveSketchLineControlUpdates(args: {
  line: SketchLineNode
  item: SketchLineControlItem
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
}): SketchLevelControlUpdate[] {
  const { line, item, linesById } = args

  if (item.kind === 'relation') {
    const nextRelations = (line.relations ?? []).filter((relation) => relation !== item.relation)
    if (nextRelations.length === (line.relations ?? []).length) {
      return []
    }
    return [{ id: line.id, data: { relations: nextRelations } }]
  }

  if (item.kind === 'dimension') {
    if (item.dimension === 'length') {
      if (!line.dimensions?.length) {
        return []
      }
      return [{ id: line.id, data: { dimensions: clearSketchLineLengthDimensionData(line) } }]
    }

    if (line.dimensions?.angle === undefined) {
      return []
    }
    return [{ id: line.id, data: { dimensions: clearSketchLineAngleDimensionData(line) } }]
  }

  if (item.kind === 'tangent') {
    if (
      !(
        line.tangent &&
        line.tangent.circleId === item.circleId &&
        line.tangent.endpoint === item.endpoint
      )
    ) {
      return []
    }
    return [{ id: line.id, data: { tangent: undefined } }]
  }

  if (item.kind === 'constraint') {
    return removeLineConstraintPair({
      line,
      targetId: item.targetId,
      kind: item.constraintKind,
      linesById,
    })
  }

  if (item.kind === 'distance-dimension') {
    return [{ id: item.dimensionId, delete: true }]
  }

  const updates: SketchLineUpdate[] = []
  if (!isSketchCoincidentEndpointReference(item.reference)) {
    const nextCoincident = { ...(line.coincident ?? {}) }
    if (!nextCoincident[item.endpoint]) {
      return []
    }

    delete nextCoincident[item.endpoint]
    return [
      {
        id: line.id,
        data: { coincident: nextCoincident },
      },
    ]
  }

  for (const candidate of linesById.values()) {
    const nextCoincident = { ...(candidate.coincident ?? {}) }
    let changed = false

    if (candidate.id === line.id && nextCoincident[item.endpoint]) {
      delete nextCoincident[item.endpoint]
      changed = true
    }

    for (const endpoint of ['start', 'end'] as const) {
      const reference = nextCoincident[endpoint]
      if (
        isSketchCoincidentEndpointReference(reference) &&
        reference.lineId === line.id &&
        reference.endpoint === item.endpoint
      ) {
        delete nextCoincident[endpoint]
        changed = true
      }
    }

    if (changed) {
      updates.push({
        id: candidate.id,
        data: { coincident: nextCoincident },
      })
    }
  }

  return updates
}

export function getSketchLineControlItemCategory(
  item: SketchLineControlItem,
): SketchControlItemCategory {
  if (item.kind === 'relation') {
    return 'relation'
  }
  if (item.kind === 'dimension' || item.kind === 'distance-dimension') {
    return 'dimension'
  }
  if (item.kind === 'constraint') {
    return 'constraint'
  }
  return 'connection'
}

function mergeLineUpdate(
  current: Partial<SketchLineNode> | undefined,
  next: Partial<SketchLineNode>,
): Partial<SketchLineNode> {
  return {
    ...(current ?? {}),
    ...next,
  }
}

export function buildRemoveSketchLineControlItemsUpdates(args: {
  line: SketchLineNode
  items: SketchLineControlItem[]
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
}): SketchLevelControlUpdate[] {
  const { line, items, linesById } = args
  const nextLinesById = new Map(linesById)
  const updatesById = new Map<SketchLineNode['id'], Partial<SketchLineNode>>()
  const deletedDimensionIds = new Set<SketchDimensionNode['id']>()

  for (const item of items) {
    const currentLine = nextLinesById.get(line.id)
    if (!currentLine) {
      break
    }

    const itemUpdates = buildRemoveSketchLineControlUpdates({
      line: currentLine,
      item,
      linesById: nextLinesById,
    })
    for (const update of itemUpdates) {
      if (isSketchControlDeleteUpdate(update)) {
        deletedDimensionIds.add(update.id)
        continue
      }
      if (!isSketchLineUpdate(update)) {
        continue
      }
      updatesById.set(update.id, mergeLineUpdate(updatesById.get(update.id), update.data))
      const currentNode = nextLinesById.get(update.id)
      if (currentNode) {
        nextLinesById.set(update.id, {
          ...currentNode,
          ...update.data,
        })
      }
    }
  }

  return [
    ...[...updatesById.entries()].map(([id, data]) => ({
      id,
      data,
    })),
    ...[...deletedDimensionIds].map((id) => ({
      id,
      delete: true as const,
    })),
  ]
}

export function getSketchCircleControlItems(args: {
  circle: SketchCircleNode
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  linesById?: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  sketchDimensions?: SketchDimensionNode[]
}): SketchCircleControlItem[] {
  const { circle, circlesById, linesById = new Map(), sketchDimensions = [] } = args
  const items: SketchCircleControlItem[] = []

  for (const relation of circle.relations ?? []) {
    items.push({
      id: `relation:${relation}`,
      kind: 'relation',
      relation,
      label: getSketchCircleRelationLabel(relation),
      detail: '锁定圆心与半径',
    })
  }

  if (hasSketchCircleAnyDimension(circle)) {
    const mode = getSketchCircleDisplayedDimensionMode(circle) ?? 'driven'
    const dimensionLabel = getSketchCircleDisplayedDimensionLabel(circle)
    items.push({
      id: 'dimension:radius',
      kind: 'dimension',
      dimension: 'radius',
      label: mode === 'reference' ? `参考${dimensionLabel}` : `驱动${dimensionLabel}`,
      detail: formatMeters(getSketchCircleDisplayedDimensionValue({ circle })),
    })
  }

  for (const constraint of circle.constraints ?? []) {
    items.push({
      id: `constraint:${constraint.kind}:${constraint.targetId}:${constraint.tangentMode ?? 'none'}`,
      kind: 'constraint',
      constraintKind: constraint.kind,
      targetId: constraint.targetId,
      label: getSketchCircleConstraintLabel(constraint.kind),
      detail:
        constraint.kind === 'tangent'
          ? `${constraint.tangentMode === 'internal' ? '内切' : '外切'} -> ${getSketchCircleDisplayName(
              circlesById.get(constraint.targetId),
            )}`
          : getSketchCircleDisplayName(circlesById.get(constraint.targetId)),
    })
  }

  for (const dimension of sketchDimensions) {
    const role = getSketchDistanceDimensionCircleRole({
      circleId: circle.id,
      dimension,
    })
    if (!role) {
      continue
    }

    items.push({
      id: `distance-dimension:${dimension.id}:${role}`,
      kind: 'distance-dimension',
      dimensionId: dimension.id,
      mode: dimension.mode,
      role,
      label: getSketchDistanceDimensionLabel({
        mode: dimension.mode,
        role,
      }),
      detail: getSketchDistanceDimensionDetail({
        dimension,
        linesById,
        circlesById,
        role,
      }),
    })
  }

  return items
}

export function buildRemoveSketchCircleControlUpdates(args: {
  circle: SketchCircleNode
  item: SketchCircleControlItem
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): SketchLevelControlUpdate[] {
  const { circle, item, circlesById } = args

  if (item.kind === 'relation') {
    const nextRelations = (circle.relations ?? []).filter((relation) => relation !== item.relation)
    if (nextRelations.length === (circle.relations ?? []).length) {
      return []
    }
    return [{ id: circle.id, data: { relations: nextRelations } }]
  }

  if (item.kind === 'dimension') {
    if (!circle.dimensions?.radius) {
      return []
    }
    return [{ id: circle.id, data: { dimensions: clearSketchCircleRadiusDimensionData(circle) } }]
  }

  if (item.kind === 'distance-dimension') {
    return [{ id: item.dimensionId, delete: true }]
  }

  return removeCircleConstraintPair({
    circle,
    targetId: item.targetId,
    kind: item.constraintKind,
    circlesById,
  })
}

export function getSketchCircleControlItemCategory(
  item: SketchCircleControlItem,
): SketchControlItemCategory {
  if (item.kind === 'relation') {
    return 'relation'
  }
  if (item.kind === 'dimension' || item.kind === 'distance-dimension') {
    return 'dimension'
  }
  return 'constraint'
}

function mergeCircleUpdate(
  current: Partial<SketchCircleNode> | undefined,
  next: Partial<SketchCircleNode>,
): Partial<SketchCircleNode> {
  return {
    ...(current ?? {}),
    ...next,
  }
}

export function buildRemoveSketchCircleControlItemsUpdates(args: {
  circle: SketchCircleNode
  items: SketchCircleControlItem[]
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): SketchLevelControlUpdate[] {
  const { circle, items, circlesById } = args
  const nextCirclesById = new Map(circlesById)
  const updatesById = new Map<SketchCircleNode['id'], Partial<SketchCircleNode>>()
  const deletedDimensionIds = new Set<SketchDimensionNode['id']>()

  for (const item of items) {
    const currentCircle = nextCirclesById.get(circle.id)
    if (!currentCircle) {
      break
    }

    const itemUpdates = buildRemoveSketchCircleControlUpdates({
      circle: currentCircle,
      item,
      circlesById: nextCirclesById,
    })
    for (const update of itemUpdates) {
      if (isSketchControlDeleteUpdate(update)) {
        deletedDimensionIds.add(update.id)
        continue
      }
      if (!isSketchCircleUpdate(update)) {
        continue
      }
      updatesById.set(update.id, mergeCircleUpdate(updatesById.get(update.id), update.data))
      const currentNode = nextCirclesById.get(update.id)
      if (currentNode) {
        nextCirclesById.set(update.id, {
          ...currentNode,
          ...update.data,
        })
      }
    }
  }

  return [
    ...[...updatesById.entries()].map(([id, data]) => ({
      id,
      data,
    })),
    ...[...deletedDimensionIds].map((id) => ({
      id,
      delete: true as const,
    })),
  ]
}

export function getSketchLevelControlEntries(args: {
  lines: SketchLineNode[]
  circles: SketchCircleNode[]
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
  sketchDimensions?: SketchDimensionNode[]
}): SketchLevelControlEntry[] {
  const { lines, circles, linesById, circlesById, sketchDimensions = [] } = args
  const entries: SketchLevelControlEntry[] = []

  for (const line of lines) {
    const ownerLabel = getSketchLineOwnerLabel(line)
    for (const item of getSketchLineControlItems({
      line,
      linesById,
      circlesById,
      sketchDimensions,
    })) {
      entries.push({
        id: `line:${line.id}:${item.id}`,
        ownerType: 'line',
        ownerId: line.id,
        ownerLabel,
        category: getSketchLineControlItemCategory(item),
        label: `${ownerLabel} · ${item.label}`,
        detail: item.detail,
        item,
      })
    }
  }

  for (const circle of circles) {
    const ownerLabel = getSketchCircleOwnerLabel(circle)
    for (const item of getSketchCircleControlItems({
      circle,
      circlesById,
      linesById,
      sketchDimensions,
    })) {
      entries.push({
        id: `circle:${circle.id}:${item.id}`,
        ownerType: 'circle',
        ownerId: circle.id,
        ownerLabel,
        category: getSketchCircleControlItemCategory(item),
        label: `${ownerLabel} · ${item.label}`,
        detail: item.detail,
        item,
      })
    }
  }

  return entries
}

export function buildRemoveSketchLevelControlEntriesUpdates(args: {
  entries: SketchLevelControlEntry[]
  linesById: ReadonlyMap<SketchLineNode['id'], SketchLineNode>
  circlesById: ReadonlyMap<SketchCircleNode['id'], SketchCircleNode>
}): SketchLevelControlUpdate[] {
  const { entries, linesById, circlesById } = args
  const nextLinesById = new Map(linesById)
  const nextCirclesById = new Map(circlesById)
  const lineUpdatesById = new Map<SketchLineNode['id'], Partial<SketchLineNode>>()
  const circleUpdatesById = new Map<SketchCircleNode['id'], Partial<SketchCircleNode>>()
  const deletedDimensionIds = new Set<SketchDimensionNode['id']>()

  for (const entry of entries) {
    if (entry.ownerType === 'line') {
      const currentLine = nextLinesById.get(entry.ownerId)
      if (!currentLine) {
        continue
      }

      const itemUpdates = buildRemoveSketchLineControlUpdates({
        line: currentLine,
        item: entry.item,
        linesById: nextLinesById,
      })
      for (const update of itemUpdates) {
        if (isSketchControlDeleteUpdate(update)) {
          deletedDimensionIds.add(update.id)
          continue
        }
        if (!isSketchLineUpdate(update)) {
          continue
        }
        lineUpdatesById.set(update.id, mergeLineUpdate(lineUpdatesById.get(update.id), update.data))
        const currentNode = nextLinesById.get(update.id)
        if (currentNode) {
          nextLinesById.set(update.id, {
            ...currentNode,
            ...update.data,
          })
        }
      }
      continue
    }

    const currentCircle = nextCirclesById.get(entry.ownerId)
    if (!currentCircle) {
      continue
    }

    const itemUpdates = buildRemoveSketchCircleControlUpdates({
      circle: currentCircle,
      item: entry.item,
      circlesById: nextCirclesById,
    })
    for (const update of itemUpdates) {
      if (isSketchControlDeleteUpdate(update)) {
        deletedDimensionIds.add(update.id)
        continue
      }
      if (!isSketchCircleUpdate(update)) {
        continue
      }
      circleUpdatesById.set(
        update.id,
        mergeCircleUpdate(circleUpdatesById.get(update.id), update.data),
      )
      const currentNode = nextCirclesById.get(update.id)
      if (currentNode) {
        nextCirclesById.set(update.id, {
          ...currentNode,
          ...update.data,
        })
      }
    }
  }

  return [
    ...[...lineUpdatesById.entries()].map(([id, data]) => ({
      id,
      data,
    })),
    ...[...circleUpdatesById.entries()].map(([id, data]) => ({
      id,
      data,
    })),
    ...[...deletedDimensionIds].map((id) => ({
      id,
      delete: true as const,
    })),
  ]
}
