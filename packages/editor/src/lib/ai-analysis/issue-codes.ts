export type AiAnalysisIssueScope =
  | 'site'
  | 'building'
  | 'level'
  | 'room'
  | 'opening'
  | 'item'
  | 'circulation'
  | 'household'
  | 'operations'
  | 'accessibility'

export type AiAnalysisIssueSeverity = 'info' | 'warning' | 'error'
export type AiAnalysisIssueCategory =
  | 'constraint'
  | 'negative-pattern'
  | 'quality'
  | 'program'
  | 'operations'
  | 'accessibility'
  | 'daylight'

export const AI_ANALYSIS_NEGATIVE_PATTERN_CODES = [
  'ENTRY_NO_BUFFER',
  'TOILET_EXPOSED_TO_PUBLIC_VIEW',
  'PRIVATE_ROOM_TRAVERSED',
  'DOOR_SWING_COLLISION',
  'BASIC_FURNITURE_MISSING',
  'BEDROOM_FURNITURE_IMPOSSIBLE',
  'KITCHEN_WORKFLOW_BROKEN',
  'DINING_PULL_OUT_BLOCKED',
  'CORRIDOR_AREA_WASTE',
  'NO_DAYLIT_HABITABLE_ROOM',
  'SINGLE_SIDED_DEEP_LAYOUT',
  'STORAGE_MISSING',
  'LAUNDRY_DRYING_CONFLICT',
  'AGING_PATH_UNSAFE',
  'PUBLIC_PRIVATE_REVERSED',
] as const

export const AI_ANALYSIS_CONSTRAINT_CODES = [
  'BUILDING_SETBACK_VIOLATION',
  'DAYLIT_ROOM_REQUIRED',
  'ROOM_AREA_BELOW_MIN',
  'ROOM_SPAN_BELOW_MIN',
  'ROOM_ASPECT_RATIO_EXCEEDED',
  'OPENING_SIZE_BELOW_MIN',
  'ITEM_PLACEMENT_INVALID',
  'ITEM_CLEARANCE_BELOW_MIN',
  'CIRCULATION_WIDTH_BELOW_MIN',
  'ROOM_DOOR_MISSING',
  'ROOM_ENCLOSURE_INCOMPLETE',
  'STAIR_REQUIRED_BETWEEN_FLOORS',
  'STAIR_WALKABILITY_BROKEN',
  'STAIR_WALL_COLLISION',
  'STAIR_ROUTE_DISCONNECTED',
  'PROGRAM_MISSING_CORE_SPACE',
  'ACCESSIBLE_ENTRY_REQUIRED',
  'ELEVATOR_REQUIRED',
  'WORKFLOW_SUPPORT_MISSING',
] as const

export const AI_ANALYSIS_ISSUE_CODES = [
  ...AI_ANALYSIS_CONSTRAINT_CODES,
  ...AI_ANALYSIS_NEGATIVE_PATTERN_CODES,
] as const

export type AiAnalysisIssueCode = (typeof AI_ANALYSIS_ISSUE_CODES)[number]

export type AiAnalysisIssueCodeDefinition = {
  code: AiAnalysisIssueCode
  scope: AiAnalysisIssueScope
  severity: AiAnalysisIssueSeverity
  category: AiAnalysisIssueCategory
  summary: string
}

export const AI_ANALYSIS_ISSUE_CODE_DEFINITIONS = {
  BUILDING_SETBACK_VIOLATION: {
    code: 'BUILDING_SETBACK_VIOLATION',
    scope: 'building',
    severity: 'error',
    category: 'constraint',
    summary: 'Building footprint exceeds the allowed setback envelope.',
  },
  DAYLIT_ROOM_REQUIRED: {
    code: 'DAYLIT_ROOM_REQUIRED',
    scope: 'room',
    severity: 'error',
    category: 'daylight',
    summary: 'At least one habitable room must satisfy the daylight requirement.',
  },
  ROOM_AREA_BELOW_MIN: {
    code: 'ROOM_AREA_BELOW_MIN',
    scope: 'room',
    severity: 'error',
    category: 'constraint',
    summary: 'Room area is below the active minimum threshold.',
  },
  ROOM_SPAN_BELOW_MIN: {
    code: 'ROOM_SPAN_BELOW_MIN',
    scope: 'room',
    severity: 'error',
    category: 'constraint',
    summary: 'Room span is below the active minimum threshold.',
  },
  ROOM_ASPECT_RATIO_EXCEEDED: {
    code: 'ROOM_ASPECT_RATIO_EXCEEDED',
    scope: 'room',
    severity: 'warning',
    category: 'quality',
    summary: 'Room aspect ratio is too extreme for comfortable use.',
  },
  OPENING_SIZE_BELOW_MIN: {
    code: 'OPENING_SIZE_BELOW_MIN',
    scope: 'opening',
    severity: 'error',
    category: 'constraint',
    summary: 'Door or window size does not meet the active profile requirement.',
  },
  ITEM_PLACEMENT_INVALID: {
    code: 'ITEM_PLACEMENT_INVALID',
    scope: 'item',
    severity: 'error',
    category: 'constraint',
    summary: 'Placed item violates placement validation rules.',
  },
  ITEM_CLEARANCE_BELOW_MIN: {
    code: 'ITEM_CLEARANCE_BELOW_MIN',
    scope: 'item',
    severity: 'error',
    category: 'constraint',
    summary: 'Placed item leaves insufficient clearance for use or movement.',
  },
  CIRCULATION_WIDTH_BELOW_MIN: {
    code: 'CIRCULATION_WIDTH_BELOW_MIN',
    scope: 'circulation',
    severity: 'error',
    category: 'constraint',
    summary: 'Path width is below the active circulation threshold.',
  },
  ROOM_DOOR_MISSING: {
    code: 'ROOM_DOOR_MISSING',
    scope: 'room',
    severity: 'error',
    category: 'constraint',
    summary: 'Room has no usable door opening.',
  },
  ROOM_ENCLOSURE_INCOMPLETE: {
    code: 'ROOM_ENCLOSURE_INCOMPLETE',
    scope: 'room',
    severity: 'error',
    category: 'constraint',
    summary: 'Room boundaries are not enclosed by enough wall segments.',
  },
  STAIR_REQUIRED_BETWEEN_FLOORS: {
    code: 'STAIR_REQUIRED_BETWEEN_FLOORS',
    scope: 'level',
    severity: 'error',
    category: 'constraint',
    summary: 'Every floor transition in a multi-floor building must include a stair.',
  },
  STAIR_WALKABILITY_BROKEN: {
    code: 'STAIR_WALKABILITY_BROKEN',
    scope: 'circulation',
    severity: 'error',
    category: 'constraint',
    summary: 'Stair geometry or landing sequence does not support a realistic walking route.',
  },
  STAIR_WALL_COLLISION: {
    code: 'STAIR_WALL_COLLISION',
    scope: 'circulation',
    severity: 'error',
    category: 'constraint',
    summary: 'Stair body or walking route intersects a solid wall.',
  },
  STAIR_ROUTE_DISCONNECTED: {
    code: 'STAIR_ROUTE_DISCONNECTED',
    scope: 'circulation',
    severity: 'error',
    category: 'constraint',
    summary: 'Stair does not connect into a continuous route between entry and upper rooms.',
  },
  PROGRAM_MISSING_CORE_SPACE: {
    code: 'PROGRAM_MISSING_CORE_SPACE',
    scope: 'household',
    severity: 'error',
    category: 'program',
    summary: 'A required program space is missing for the current household brief.',
  },
  ACCESSIBLE_ENTRY_REQUIRED: {
    code: 'ACCESSIBLE_ENTRY_REQUIRED',
    scope: 'accessibility',
    severity: 'error',
    category: 'accessibility',
    summary: 'An accessible public entry is required by the active profile.',
  },
  ELEVATOR_REQUIRED: {
    code: 'ELEVATOR_REQUIRED',
    scope: 'building',
    severity: 'error',
    category: 'constraint',
    summary: 'An elevator is required for the current building height or profile.',
  },
  WORKFLOW_SUPPORT_MISSING: {
    code: 'WORKFLOW_SUPPORT_MISSING',
    scope: 'operations',
    severity: 'warning',
    category: 'operations',
    summary: 'A required household workflow is not adequately supported.',
  },
  ENTRY_NO_BUFFER: {
    code: 'ENTRY_NO_BUFFER',
    scope: 'room',
    severity: 'warning',
    category: 'negative-pattern',
    summary: 'The layout lacks a useful entry buffer or drop zone.',
  },
  TOILET_EXPOSED_TO_PUBLIC_VIEW: {
    code: 'TOILET_EXPOSED_TO_PUBLIC_VIEW',
    scope: 'room',
    severity: 'error',
    category: 'negative-pattern',
    summary: 'Bathroom doors are exposed to the main public sightline.',
  },
  PRIVATE_ROOM_TRAVERSED: {
    code: 'PRIVATE_ROOM_TRAVERSED',
    scope: 'circulation',
    severity: 'error',
    category: 'negative-pattern',
    summary: 'A private room must be crossed to reach another destination.',
  },
  DOOR_SWING_COLLISION: {
    code: 'DOOR_SWING_COLLISION',
    scope: 'opening',
    severity: 'error',
    category: 'negative-pattern',
    summary: 'Door swing conflicts with another door, fixture, or furniture zone.',
  },
  BASIC_FURNITURE_MISSING: {
    code: 'BASIC_FURNITURE_MISSING',
    scope: 'room',
    severity: 'warning',
    category: 'quality',
    summary: 'Room is missing the minimum furniture or fixtures required for daily living.',
  },
  BEDROOM_FURNITURE_IMPOSSIBLE: {
    code: 'BEDROOM_FURNITURE_IMPOSSIBLE',
    scope: 'room',
    severity: 'error',
    category: 'negative-pattern',
    summary: 'Bedroom furniture and circulation cannot be resolved together.',
  },
  KITCHEN_WORKFLOW_BROKEN: {
    code: 'KITCHEN_WORKFLOW_BROKEN',
    scope: 'operations',
    severity: 'warning',
    category: 'negative-pattern',
    summary: 'Kitchen storage, prep, cooking, and cleaning flow is broken.',
  },
  DINING_PULL_OUT_BLOCKED: {
    code: 'DINING_PULL_OUT_BLOCKED',
    scope: 'operations',
    severity: 'warning',
    category: 'negative-pattern',
    summary: 'Dining chair pull-out conflicts with circulation or adjacent fixtures.',
  },
  CORRIDOR_AREA_WASTE: {
    code: 'CORRIDOR_AREA_WASTE',
    scope: 'circulation',
    severity: 'warning',
    category: 'negative-pattern',
    summary: 'Corridor area is excessive relative to usable living space.',
  },
  NO_DAYLIT_HABITABLE_ROOM: {
    code: 'NO_DAYLIT_HABITABLE_ROOM',
    scope: 'room',
    severity: 'error',
    category: 'negative-pattern',
    summary: 'Habitable rooms do not secure adequate daylight frontage.',
  },
  SINGLE_SIDED_DEEP_LAYOUT: {
    code: 'SINGLE_SIDED_DEEP_LAYOUT',
    scope: 'room',
    severity: 'warning',
    category: 'negative-pattern',
    summary: 'Deep single-sided rooms reduce daylight and ventilation quality.',
  },
  STORAGE_MISSING: {
    code: 'STORAGE_MISSING',
    scope: 'operations',
    severity: 'warning',
    category: 'negative-pattern',
    summary: 'Daily storage is missing for entry, kitchen, or cleaning workflows.',
  },
  LAUNDRY_DRYING_CONFLICT: {
    code: 'LAUNDRY_DRYING_CONFLICT',
    scope: 'operations',
    severity: 'warning',
    category: 'negative-pattern',
    summary: 'Laundry and drying functions conflict with movement or cooking areas.',
  },
  AGING_PATH_UNSAFE: {
    code: 'AGING_PATH_UNSAFE',
    scope: 'accessibility',
    severity: 'error',
    category: 'negative-pattern',
    summary: 'Night-time or ageing-related paths are too long or unsafe.',
  },
  PUBLIC_PRIVATE_REVERSED: {
    code: 'PUBLIC_PRIVATE_REVERSED',
    scope: 'room',
    severity: 'warning',
    category: 'negative-pattern',
    summary: 'Best frontage is allocated to a secondary room instead of key living spaces.',
  },
} satisfies Record<AiAnalysisIssueCode, AiAnalysisIssueCodeDefinition>

export function isAiAnalysisIssueCode(value: string): value is AiAnalysisIssueCode {
  return value in AI_ANALYSIS_ISSUE_CODE_DEFINITIONS
}

export function getAiAnalysisIssueDefinition(code: AiAnalysisIssueCode) {
  return AI_ANALYSIS_ISSUE_CODE_DEFINITIONS[code]
}
