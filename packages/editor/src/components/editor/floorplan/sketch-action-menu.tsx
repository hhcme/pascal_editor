'use client'

import { Icon } from '@iconify/react'
import type { SketchCircleNode, SketchLineNode } from '@pascal-app/core'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { NodeActionMenuExtraAction } from '../node-action-menu'
import type { SketchCircleOperation, SketchLineOperation } from './sketch-action-helpers'

type ActionHandler = (event: ReactMouseEvent<HTMLButtonElement>) => void

type BuildSketchLineActionMenuExtraActionsArgs = {
  selectedSketchLine: SketchLineNode | null
  selectedSketchLineCount: number
  hasSelectedSketchProfile: boolean
  sketchLineEditOperation: SketchLineOperation | null
  isEqualLengthActive: boolean
  isParallelActive: boolean
  isPerpendicularActive: boolean
  isCollinearActive: boolean
  onCreateWall: ActionHandler
  onSetLength: ActionHandler
  onHorizontal: ActionHandler
  onVertical: ActionHandler
  onToggleFixed: ActionHandler
  onToggleConstruction: ActionHandler
  onParallel: ActionHandler
  onPerpendicular: ActionHandler
  onCollinear: ActionHandler
  onTangent: ActionHandler
  onTrimExtend: ActionHandler
  onSplit: ActionHandler
  onOffset: ActionHandler
  onEqualLength: ActionHandler
  onFillet: ActionHandler
  onMirror: ActionHandler
  onLinearPattern: ActionHandler
  onChamfer: ActionHandler
  onCreateProfileWalls: ActionHandler
  onCreateProfileSlab: ActionHandler
  onCreateProfileZone: ActionHandler
  onCreateProfileExtrude: ActionHandler
  onCreateProfileRevolve: ActionHandler
  onCutProfile: ActionHandler
}

export function buildSketchLineActionMenuExtraActions({
  selectedSketchLine,
  selectedSketchLineCount,
  hasSelectedSketchProfile,
  sketchLineEditOperation,
  isEqualLengthActive,
  isParallelActive,
  isPerpendicularActive,
  isCollinearActive,
  onCreateWall,
  onSetLength,
  onHorizontal,
  onVertical,
  onToggleFixed,
  onToggleConstruction,
  onParallel,
  onPerpendicular,
  onCollinear,
  onTangent,
  onTrimExtend,
  onSplit,
  onOffset,
  onEqualLength,
  onFillet,
  onMirror,
  onLinearPattern,
  onChamfer,
  onCreateProfileWalls,
  onCreateProfileSlab,
  onCreateProfileZone,
  onCreateProfileExtrude,
  onCreateProfileRevolve,
  onCutProfile,
}: BuildSketchLineActionMenuExtraActionsArgs): NodeActionMenuExtraAction[] {
  const isFixed = Boolean(selectedSketchLine?.relations?.includes('fixed'))
  const isConstruction = Boolean(selectedSketchLine?.construction)

  const actions: NodeActionMenuExtraAction[] = [
    {
      id: 'sketch-line-create-wall',
      label: '生成墙体',
      icon: <Icon height={16} icon="mdi:walls" width={16} />,
      onClick: onCreateWall,
    },
    {
      id: 'sketch-line-set-length',
      label: '智能尺寸',
      icon: <Icon height={16} icon="mdi:ruler-square" width={16} />,
      onClick: onSetLength,
    },
    {
      id: 'sketch-line-horizontal',
      label: '水平',
      icon: <Icon height={16} icon="mdi:format-horizontal-align-center" width={16} />,
      onClick: onHorizontal,
      active: selectedSketchLine?.relations?.includes('horizontal'),
    },
    {
      id: 'sketch-line-vertical',
      label: '垂直',
      icon: <Icon height={16} icon="mdi:format-vertical-align-center" width={16} />,
      onClick: onVertical,
      active: selectedSketchLine?.relations?.includes('vertical'),
    },
    {
      id: 'sketch-line-fixed',
      label: '固定',
      icon: <Icon height={16} icon="mdi:lock-outline" width={16} />,
      onClick: onToggleFixed,
      active: isFixed,
    },
    {
      id: 'sketch-line-construction',
      label: '参考线',
      icon: <Icon height={16} icon="mdi:vector-line" width={16} />,
      onClick: onToggleConstruction,
      active: isConstruction,
    },
    {
      id: 'sketch-line-tangent',
      label: '相切',
      icon: <Icon height={16} icon="mdi:vector-circle-variant" width={16} />,
      onClick: onTangent,
      active: sketchLineEditOperation === 'tangent',
      disabled: selectedSketchLineCount > 1,
    },
    {
      id: 'sketch-line-trim-extend',
      label: '修剪/延伸',
      icon: <Icon height={16} icon="mdi:vector-line" width={16} />,
      onClick: onTrimExtend,
      active: sketchLineEditOperation === 'trim-extend',
    },
    {
      id: 'sketch-line-split',
      label: '分割',
      icon: <Icon height={16} icon="mdi:call-split" width={16} />,
      onClick: onSplit,
      active: sketchLineEditOperation === 'split',
    },
    {
      id: 'sketch-line-offset',
      label: '偏移',
      icon: <Icon height={16} icon="mdi:arrow-expand-horizontal" width={16} />,
      onClick: onOffset,
    },
    {
      id: 'sketch-line-equal-length',
      label: '等长',
      icon: <Icon height={16} icon="mdi:equal" width={16} />,
      onClick: onEqualLength,
      active: isEqualLengthActive,
    },
    {
      id: 'sketch-line-parallel',
      label: '平行',
      icon: <Icon height={16} icon="mdi:format-line-style" width={16} />,
      onClick: onParallel,
      active: isParallelActive,
    },
    {
      id: 'sketch-line-perpendicular',
      label: '垂直约束',
      icon: <Icon height={16} icon="mdi:angle-right" width={16} />,
      onClick: onPerpendicular,
      active: isPerpendicularActive,
    },
    {
      id: 'sketch-line-collinear',
      label: '共线',
      icon: <Icon height={16} icon="mdi:vector-line" width={16} />,
      onClick: onCollinear,
      active: isCollinearActive,
    },
    {
      id: 'sketch-line-fillet',
      label: '圆角',
      icon: <Icon height={16} icon="mdi:vector-radius" width={16} />,
      onClick: onFillet,
    },
    {
      id: 'sketch-line-mirror',
      label: '镜像',
      icon: <Icon height={16} icon="mdi:mirror" width={16} />,
      onClick: onMirror,
    },
    {
      id: 'sketch-line-linear-pattern',
      label: '线性阵列',
      icon: <Icon height={16} icon="mdi:grid" width={16} />,
      onClick: onLinearPattern,
    },
    {
      id: 'sketch-line-chamfer',
      label: '倒角',
      icon: <Icon height={16} icon="mdi:vector-polyline-edit" width={16} />,
      onClick: onChamfer,
    },
  ]

  if (hasSelectedSketchProfile) {
    actions.push(
      {
        id: 'sketch-profile-extrude',
        label: '拉伸',
        icon: <Icon height={16} icon="mdi:cube-outline" width={16} />,
        onClick: onCreateProfileExtrude,
      },
      {
        id: 'sketch-profile-revolve',
        label: '旋转',
        icon: <Icon height={16} icon="mdi:rotate-360" width={16} />,
        onClick: onCreateProfileRevolve,
      },
      {
        id: 'sketch-profile-cut',
        label: '切割',
        icon: <Icon height={16} icon="mdi:selection-remove" width={16} />,
        onClick: onCutProfile,
      },
      {
        id: 'sketch-profile-walls',
        label: '生成墙体',
        icon: <Icon height={16} icon="mdi:walls" width={16} />,
        onClick: onCreateProfileWalls,
      },
      {
        id: 'sketch-profile-slab',
        label: '生成楼板',
        icon: <Icon height={16} icon="mdi:layers-plus" width={16} />,
        onClick: onCreateProfileSlab,
      },
      {
        id: 'sketch-profile-zone',
        label: '生成区域',
        icon: <Icon height={16} icon="mdi:shape-square-plus" width={16} />,
        onClick: onCreateProfileZone,
      },
    )
  }

  return actions
}

type BuildSketchCircleActionMenuExtraActionsArgs = {
  circles: SketchCircleNode[]
  isConcentricActive: boolean
  isEqualRadiusActive: boolean
  isTangentActive: boolean
  sketchCircleEditOperation: SketchCircleOperation | null
  onSetRadius: ActionHandler
  onToggleFixed: ActionHandler
  onToggleConstruction: ActionHandler
  onToggleConcentric: ActionHandler
  onToggleEqualRadius: ActionHandler
  onToggleTangent: ActionHandler
  onTrimExtend: ActionHandler
  onOffset: ActionHandler
  onMirror: ActionHandler
  onLinearPattern: ActionHandler
  onCreateProfileExtrude: ActionHandler
  onCutProfile: ActionHandler
}

export function buildSketchCircleActionMenuExtraActions({
  circles,
  isConcentricActive,
  isEqualRadiusActive,
  isTangentActive,
  sketchCircleEditOperation,
  onSetRadius,
  onToggleFixed,
  onToggleConstruction,
  onToggleConcentric,
  onToggleEqualRadius,
  onToggleTangent,
  onTrimExtend,
  onOffset,
  onMirror,
  onLinearPattern,
  onCreateProfileExtrude,
  onCutProfile,
}: BuildSketchCircleActionMenuExtraActionsArgs): NodeActionMenuExtraAction[] {
  const isAllFixed =
    circles.length > 0 && circles.every((circle) => circle.relations?.includes('fixed'))
  const isAllConstruction = circles.length > 0 && circles.every((circle) => circle.construction)
  const canUseCircleProfile = circles.length === 1 && !circles[0]?.construction

  return [
    {
      id: 'sketch-profile-extrude',
      label: '拉伸',
      icon: <Icon height={16} icon="mdi:cube-outline" width={16} />,
      onClick: onCreateProfileExtrude,
      disabled: !canUseCircleProfile,
    },
    {
      id: 'sketch-profile-cut',
      label: '切割',
      icon: <Icon height={16} icon="mdi:selection-remove" width={16} />,
      onClick: onCutProfile,
      disabled: !canUseCircleProfile,
    },
    {
      id: 'sketch-circle-set-radius',
      label: '智能尺寸',
      icon: <Icon height={16} icon="mdi:ruler-square" width={16} />,
      onClick: onSetRadius,
      disabled: circles.length !== 1,
    },
    {
      id: 'sketch-circle-fixed',
      label: '固定',
      icon: <Icon height={16} icon="mdi:lock-outline" width={16} />,
      onClick: onToggleFixed,
      active: isAllFixed,
    },
    {
      id: 'sketch-circle-construction',
      label: '参考线',
      icon: <Icon height={16} icon="mdi:circle-outline" width={16} />,
      onClick: onToggleConstruction,
      active: isAllConstruction,
    },
    {
      id: 'sketch-circle-concentric',
      label: '同心',
      icon: <Icon height={16} icon="mdi:circle-multiple-outline" width={16} />,
      onClick: onToggleConcentric,
      active: isConcentricActive,
      disabled: circles.length < 2,
    },
    {
      id: 'sketch-circle-equal-radius',
      label: '等半径',
      icon: <Icon height={16} icon="mdi:equal" width={16} />,
      onClick: onToggleEqualRadius,
      active: isEqualRadiusActive,
      disabled: circles.length < 2,
    },
    {
      id: 'sketch-circle-tangent',
      label: '相切',
      icon: <Icon height={16} icon="mdi:vector-circle-variant" width={16} />,
      onClick: onToggleTangent,
      active: isTangentActive,
      disabled: circles.length !== 2,
    },
    {
      id: 'sketch-circle-trim-extend',
      label: '修剪/延伸',
      icon: <Icon height={16} icon="mdi:vector-circle-variant" width={16} />,
      onClick: onTrimExtend,
      active: sketchCircleEditOperation === 'trim-extend',
      disabled: circles.length !== 1 || circles[0]?.kind !== 'arc',
    },
    {
      id: 'sketch-circle-offset',
      label: '偏移',
      icon: <Icon height={16} icon="mdi:arrow-expand-horizontal" width={16} />,
      onClick: onOffset,
    },
    {
      id: 'sketch-circle-mirror',
      label: '镜像',
      icon: <Icon height={16} icon="mdi:mirror" width={16} />,
      onClick: onMirror,
    },
    {
      id: 'sketch-circle-linear-pattern',
      label: '线性阵列',
      icon: <Icon height={16} icon="mdi:grid" width={16} />,
      onClick: onLinearPattern,
    },
  ]
}
