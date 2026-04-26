import type { AiAnalysisIssueCode, AiAnalysisSnapshot } from '@pascal-app/editor'
import type {
  AiConstraintViolation,
  AiFengShuiAdvisory,
  AiFengShuiAdvisoryDefinition,
  AiFengShuiRoomRef,
} from './constraint-types'

function advisory(definition: AiFengShuiAdvisoryDefinition): AiFengShuiAdvisoryDefinition {
  return definition
}

const AI_FENG_SHUI_ADVISORIES_V1 = [
  advisory({
    code: 'FS_ENTRY_NO_BUFFER',
    group: 'entry_flow',
    evidenceLevel: 'B_TRADITIONAL_STRONG',
    defaultEnabled: true,
    severity: 'medium',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['storage_chores', 'zoning_privacy'],
    linkedIssueCodes: ['ENTRY_NO_BUFFER'],
    detectionFocus: ['entry_to_public_visibility', 'shoe_storage_missing', 'dust_buffer_missing'],
    repairHints: ['add_entry_buffer', 'rotate_entry_path', 'insert_partition'],
    traditionalRationale: '入户宜有缓冲，不宜一眼看尽全屋。',
    modernRationale: '缺少玄关会让隐私、落尘控制和心理过渡都变差。',
    userFacingLabels: {
      traditional: '入户无缓冲',
      modern: '玄关过渡不足',
    },
  }),
  advisory({
    code: 'FS_TOILET_EXPOSED_FROM_ENTRY',
    group: 'entry_flow',
    evidenceLevel: 'B_TRADITIONAL_STRONG',
    defaultEnabled: true,
    severity: 'high',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['zoning_privacy'],
    linkedIssueCodes: ['TOILET_EXPOSED_TO_PUBLIC_VIEW'],
    detectionFocus: [
      'bathroom_door_visibility_from_living',
      'bathroom_door_visibility_from_dining',
      'entry_first_sight_hits_toilet_door',
    ],
    repairHints: ['move_bathroom_door', 'insert_transition_zone', 'swap_room_positions'],
    traditionalRationale: '入户见厕常被视为不吉，不利气口整洁。',
    modernRationale: '卫生观感、隐私和气味管理都会变差，第一视线体验也较弱。',
    userFacingLabels: {
      traditional: '入户见厕',
      modern: '卫生间直暴露在主视线',
    },
  }),
  advisory({
    code: 'FS_PUBLIC_PRIVATE_GRADIENT_WEAK',
    group: 'public_private_zoning',
    evidenceLevel: 'A_ENVIRONMENT_OVERLAP',
    defaultEnabled: true,
    severity: 'medium',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['zoning_privacy', 'circulation'],
    linkedIssueCodes: ['PRIVATE_ROOM_TRAVERSED', 'PUBLIC_PRIVATE_REVERSED'],
    detectionFocus: [
      'private_room_path_through_public_room',
      'private_room_path_through_private_room',
      'secondary_rooms_take_best_frontage',
    ],
    repairHints: ['add_corridor', 'reroute_access', 'rebuild_zone_order', 'swap_room_positions'],
    traditionalRationale: '住宅讲究动静分区、主次有序，卧室不宜受公共路径干扰。',
    modernRationale: '公私混杂会带来穿越、噪声、视线暴露和日常秩序混乱。',
    userFacingLabels: {
      traditional: '动静主次不清',
      modern: '公私梯度过弱',
    },
  }),
  advisory({
    code: 'FS_LIVING_ROOM_BRIGHT_PRIORITY',
    group: 'living_bedroom_stability',
    evidenceLevel: 'A_ENVIRONMENT_OVERLAP',
    defaultEnabled: true,
    severity: 'medium',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['daylight_ventilation', 'zoning_privacy'],
    linkedIssueCodes: ['NO_DAYLIT_HABITABLE_ROOM', 'PUBLIC_PRIVATE_REVERSED'],
    detectionFocus: [
      'living_room_daylight_priority_low',
      'best_orientation_allocated_to_secondary_rooms',
      'primary_bedroom_frontage_priority_low',
    ],
    repairHints: ['swap_room_positions', 'reweight_frontage_allocation', 'reduce_layout_depth'],
    traditionalRationale: '明厅宜明、宜开、宜聚。',
    modernRationale: '客厅是高频公共活动区，通常应优先获得更好的采光、通风与开阔感。',
    userFacingLabels: {
      traditional: '明厅优先',
      modern: '公共主空间采光优先',
    },
  }),
  advisory({
    code: 'FS_KITCHEN_WATER_FIRE_CLASH',
    group: 'kitchen_toilet',
    evidenceLevel: 'B_TRADITIONAL_STRONG',
    defaultEnabled: true,
    severity: 'medium',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['storage_chores', 'furniture_fit'],
    linkedIssueCodes: ['KITCHEN_WORKFLOW_BROKEN'],
    detectionFocus: [
      'fridge_prep_cook_sink_flow_disconnected',
      'sink_stove_face_off',
      'appliance_door_blocks_main_path',
    ],
    repairHints: [
      'reorder_kitchen_modules',
      'increase_prep_surface',
      'separate_sink_and_stove_conflict',
    ],
    traditionalRationale: '灶属火，水槽属水，正冲或过近常被视作水火不调。',
    modernRationale: '水火工作面冲突会破坏厨房操作连续性，也更容易增加湿热、杂乱和清洁负担。',
    userFacingLabels: {
      traditional: '水火相冲',
      modern: '厨房工作流冲突',
    },
  }),
  advisory({
    code: 'FS_LONG_DARK_CORRIDOR',
    group: 'environmental_comfort',
    evidenceLevel: 'A_ENVIRONMENT_OVERLAP',
    defaultEnabled: true,
    severity: 'medium',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['circulation', 'daylight_ventilation'],
    linkedIssueCodes: ['CORRIDOR_AREA_WASTE'],
    detectionFocus: ['corridor_area_ratio_high', 'corridor_daylight_missing', 'corridor_dead_end'],
    repairHints: ['compress_corridor', 'merge_with_adjacent_room', 'borrow_light'],
    traditionalRationale: '狭长阴暗走道不利气的舒展与停驻。',
    modernRationale: '长黑走廊容易压抑、浪费面积，也会降低导航与日常体验。',
    userFacingLabels: {
      traditional: '阴暗长廊',
      modern: '走廊低效且缺光',
    },
  }),
  advisory({
    code: 'FS_MAIN_ROOM_POOR_DAYLIGHT',
    group: 'environmental_comfort',
    evidenceLevel: 'A_ENVIRONMENT_OVERLAP',
    defaultEnabled: true,
    severity: 'high',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['daylight_ventilation'],
    linkedIssueCodes: ['NO_DAYLIT_HABITABLE_ROOM', 'SINGLE_SIDED_DEEP_LAYOUT'],
    detectionFocus: [
      'habitable_rooms_without_daylight',
      'deep_single_aspect_room',
      'best_orientation_allocated_to_secondary_rooms',
    ],
    repairHints: [
      'swap_room_positions',
      'add_opening',
      'reduce_layout_depth',
      'reallocate_daylight_rooms',
    ],
    traditionalRationale: '阳宅重阳面与生气，主房不宜长期阴暗。',
    modernRationale: '主要房间采光不足会直接拉低日常舒适度、空间可用性和情绪体验。',
    userFacingLabels: {
      traditional: '主房采光不足',
      modern: '主要房间缺少优先光照',
    },
  }),
  advisory({
    code: 'FS_CROSS_VENTILATION_DEFICIT',
    group: 'environmental_comfort',
    evidenceLevel: 'A_ENVIRONMENT_OVERLAP',
    defaultEnabled: true,
    severity: 'medium',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['daylight_ventilation'],
    linkedIssueCodes: ['SINGLE_SIDED_DEEP_LAYOUT'],
    detectionFocus: ['cross_ventilation_absent', 'deep_single_aspect_room', 'ineffective_air_path'],
    repairHints: [
      'introduce_courtyard',
      'reduce_depth',
      'optimize_window_pairing',
      'improve_internal_air_path',
    ],
    traditionalRationale: '藏风不是闭风，宜缓纳而不宜闷滞。',
    modernRationale: '缺少有效通风会积热、积湿、积味，直接损伤空气质量与热舒适。',
    userFacingLabels: {
      traditional: '气滞不畅',
      modern: '交叉通风不足',
    },
  }),
  advisory({
    code: 'FS_CLUTTER_AND_DISREPAIR',
    group: 'maintenance_state',
    evidenceLevel: 'A_ENVIRONMENT_OVERLAP',
    defaultEnabled: true,
    severity: 'medium',
    implementationStage: 'implemented_bridge',
    scoringDimensions: ['storage_chores', 'circulation'],
    linkedIssueCodes: ['STORAGE_MISSING'],
    detectionFocus: [
      'entry_storage_missing',
      'cleaning_storage_missing',
      'path_obstruction_by_objects',
      'key_fixture_disrepair',
    ],
    repairHints: [
      'add_built_in_cabinet',
      'clear_main_paths',
      'repair_damaged_fixtures',
      'expand_service_zone',
    ],
    traditionalRationale: '杂乱、破损、堵塞会被视作败气与失序。',
    modernRationale: '长期堆物和失修会增加压力、绊倒风险和维护成本，也会让动线效率明显下降。',
    userFacingLabels: {
      traditional: '失序败气',
      modern: '杂乱与维护状态差',
    },
  }),
] as const satisfies AiFengShuiAdvisoryDefinition[]

const ADVISORIES_BY_ISSUE = new Map<AiAnalysisIssueCode, AiFengShuiAdvisoryDefinition[]>()

for (const definition of AI_FENG_SHUI_ADVISORIES_V1) {
  for (const issueCode of definition.linkedIssueCodes) {
    const current = ADVISORIES_BY_ISSUE.get(issueCode) ?? []
    current.push(definition)
    ADVISORIES_BY_ISSUE.set(issueCode, current)
  }
}

export function getAiFengShuiAdvisoriesV1() {
  return AI_FENG_SHUI_ADVISORIES_V1
}

export function getAiFengShuiAdvisoriesForIssue(code: AiAnalysisIssueCode) {
  return ADVISORIES_BY_ISSUE.get(code) ?? []
}

export function mergeAiFengShuiAdvisories(
  advisories: AiFengShuiAdvisoryDefinition[],
): AiFengShuiAdvisoryDefinition[] {
  const merged = new Map<string, AiFengShuiAdvisoryDefinition>()
  for (const advisoryEntry of advisories) {
    merged.set(advisoryEntry.code, advisoryEntry)
  }
  return [...merged.values()]
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function dedupeRoomRefs(roomRefs: AiFengShuiRoomRef[]) {
  const merged = new Map<string, AiFengShuiRoomRef>()
  for (const roomRef of roomRefs) {
    merged.set(`${roomRef.level}:${roomRef.roomKey}`, roomRef)
  }
  return [...merged.values()]
}

function getRoomRefsForTarget(
  snapshot: AiAnalysisSnapshot,
  targetId: string | null | undefined,
): AiFengShuiRoomRef[] {
  if (!targetId) return []

  return snapshot.levels.flatMap((level) =>
    level.rooms
      .filter((room) => room.nodeId === targetId)
      .map((room) => ({
        level: level.level,
        roomKey: room.nodeId,
        roomName: room.name,
      })),
  )
}

export function collectAiFengShuiAdvisoriesForViolations(
  violations: Array<
    Pick<AiConstraintViolation, 'code' | 'message' | 'targetId' | 'fengShuiAdvisories'>
  >,
  snapshot: AiAnalysisSnapshot,
): AiFengShuiAdvisory[] {
  const merged = new Map<string, AiFengShuiAdvisory>()

  for (const violation of violations) {
    for (const definition of violation.fengShuiAdvisories) {
      const roomRefs = getRoomRefsForTarget(snapshot, violation.targetId)
      const current = merged.get(definition.code)

      if (!current) {
        merged.set(definition.code, {
          ...definition,
          relatedIssueCodes: [violation.code],
          relatedTargetIds: violation.targetId ? [violation.targetId] : [],
          relatedMessages: [violation.message],
          roomRefs,
        })
        continue
      }

      merged.set(definition.code, {
        ...current,
        relatedIssueCodes: dedupeStrings([
          ...current.relatedIssueCodes,
          violation.code,
        ]) as AiAnalysisIssueCode[],
        relatedTargetIds: dedupeStrings([
          ...current.relatedTargetIds,
          ...(violation.targetId ? [violation.targetId] : []),
        ]),
        relatedMessages: dedupeStrings([...current.relatedMessages, violation.message]),
        roomRefs: dedupeRoomRefs([...current.roomRefs, ...roomRefs]),
      })
    }
  }

  return [...merged.values()]
}
