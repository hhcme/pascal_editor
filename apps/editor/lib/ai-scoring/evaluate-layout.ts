import {
  type AiAnalysisIssue,
  type AiAnalysisIssueCode,
  type AiAnalysisSnapshot,
  type AiRoomSnapshot,
  getAiAnalysisIssueDefinition,
} from '@pascal-app/editor'
import {
  type AiConstraintDimensionScore,
  type AiConstraintEvaluation,
  type AiConstraintViolation,
  type AiRuleRegistry,
  type AiRuleSourceProfile,
  type AiScoreDimensionKey,
  createEmptyAiConstraintEvaluation,
} from './constraint-types'
import {
  collectAiFengShuiAdvisoriesForViolations,
  getAiFengShuiAdvisoriesForIssue,
  mergeAiFengShuiAdvisories,
} from './feng-shui-advisories-v1'
import { getAiRuleRegistryV1 } from './rule-registry-v1'

export type EvaluateAiLayoutConstraintsInput = {
  snapshot: AiAnalysisSnapshot
  registry?: AiRuleRegistry
  activeProfileIds?: string[]
}

type ActiveRuleBundle = {
  requiresAtLeastOneDaylitRoom: boolean
  requiresAccessiblePublicEntry: boolean
  requiresAgingFriendlyAccessChecks: boolean
  elevatorRequiredFromFloorCount: number | null
  internalDoorClearOpeningMinMm: number | null
  singleBedroomAreaMinSqm: number | null
  singleBedroomWidthMinM: number | null
  doubleBedroomAreaMinSqm: number | null
  primaryDoubleBedroomWidthMinM: number | null
}

const SCORE_DIMENSION_ORDER: AiScoreDimensionKey[] = [
  'program_fit',
  'zoning_privacy',
  'circulation',
  'furniture_fit',
  'daylight_ventilation',
  'storage_chores',
  'accessibility_lifecycle',
  'adaptability',
]

const ISSUE_DIMENSION_MAP: Record<AiAnalysisIssueCode, AiScoreDimensionKey> = {
  BUILDING_SETBACK_VIOLATION: 'adaptability',
  DAYLIT_ROOM_REQUIRED: 'daylight_ventilation',
  ROOM_AREA_BELOW_MIN: 'furniture_fit',
  ROOM_SPAN_BELOW_MIN: 'furniture_fit',
  ROOM_ASPECT_RATIO_EXCEEDED: 'furniture_fit',
  OPENING_SIZE_BELOW_MIN: 'accessibility_lifecycle',
  ITEM_PLACEMENT_INVALID: 'furniture_fit',
  ITEM_CLEARANCE_BELOW_MIN: 'furniture_fit',
  CIRCULATION_WIDTH_BELOW_MIN: 'circulation',
  ROOM_DOOR_MISSING: 'circulation',
  ROOM_ENCLOSURE_INCOMPLETE: 'program_fit',
  STAIR_REQUIRED_BETWEEN_FLOORS: 'circulation',
  STAIR_WALKABILITY_BROKEN: 'circulation',
  STAIR_WALL_COLLISION: 'circulation',
  STAIR_ROUTE_DISCONNECTED: 'circulation',
  PROGRAM_MISSING_CORE_SPACE: 'program_fit',
  ACCESSIBLE_ENTRY_REQUIRED: 'accessibility_lifecycle',
  ELEVATOR_REQUIRED: 'accessibility_lifecycle',
  WORKFLOW_SUPPORT_MISSING: 'storage_chores',
  ENTRY_NO_BUFFER: 'storage_chores',
  TOILET_EXPOSED_TO_PUBLIC_VIEW: 'zoning_privacy',
  PRIVATE_ROOM_TRAVERSED: 'zoning_privacy',
  DOOR_SWING_COLLISION: 'circulation',
  BEDROOM_FURNITURE_IMPOSSIBLE: 'furniture_fit',
  KITCHEN_WORKFLOW_BROKEN: 'storage_chores',
  DINING_PULL_OUT_BLOCKED: 'circulation',
  CORRIDOR_AREA_WASTE: 'circulation',
  NO_DAYLIT_HABITABLE_ROOM: 'daylight_ventilation',
  SINGLE_SIDED_DEEP_LAYOUT: 'daylight_ventilation',
  STORAGE_MISSING: 'storage_chores',
  LAUNDRY_DRYING_CONFLICT: 'storage_chores',
  AGING_PATH_UNSAFE: 'accessibility_lifecycle',
  PUBLIC_PRIVATE_REVERSED: 'zoning_privacy',
}

const SLEEP_PROGRAM_KEYS = new Set(['primary_bedroom', 'bedroom'])
const LIVING_PROGRAM_KEYS = new Set(['living_room', 'reception'])
const KITCHEN_PROGRAM_KEYS = new Set(['kitchen'])
const BATHROOM_PROGRAM_KEYS = new Set(['bathroom'])
const WORK_PROGRAM_KEYS = new Set(['study', 'open_office'])
const STORAGE_PROGRAM_KEYS = new Set(['storage', 'pantry', 'archive', 'equipment_room', 'laundry'])
const CORE_FRONTAGE_PROGRAM_KEYS = new Set(['living_room', 'dining_room', 'primary_bedroom'])
const ELEVATOR_PROGRAM_KEYS = new Set(['elevator'])

const PROGRAM_ALIASES: Record<string, string[]> = {
  archive: ['archive', '档案'],
  bathroom: ['bath', 'bathroom', 'toilet', 'washroom', '卫生间', '卫浴', '洗手间'],
  bedroom: ['bedroom', '次卧', '客卧', '卧室'],
  dining_room: ['dining', '餐厅'],
  elevator: ['elevator', 'lift', '电梯'],
  entry: ['entry', 'foyer', 'mudroom', '玄关', '门厅'],
  kitchen: ['kitchen', '厨房'],
  laundry: ['laundry', 'utility', '洗衣', '家政'],
  living_room: ['living', 'lounge', '客厅', '起居'],
  open_office: ['office', 'studio', '办公'],
  pantry: ['pantry', '食品储藏', '备餐'],
  primary_bedroom: ['master bedroom', 'primary bedroom', '主卧'],
  reception: ['reception', '会客'],
  storage: ['closet', 'storage', '储物', '收纳'],
  study: ['study', '书房'],
}

export function evaluateAiLayoutConstraints(
  input: EvaluateAiLayoutConstraintsInput,
): AiConstraintEvaluation {
  const registry = input.registry ?? getAiRuleRegistryV1()
  const activeProfileIds = resolveActiveProfileIds(
    registry,
    input.activeProfileIds ?? input.snapshot.activeProfileIds,
  )
  const activeProfiles = activeProfileIds
    .map((profileId) => registry.sourceProfiles.find((profile) => profile.id === profileId) ?? null)
    .filter((profile): profile is AiRuleSourceProfile => profile !== null)
  const activeRules = buildActiveRuleBundle(activeProfiles)
  const evaluation = createEmptyAiConstraintEvaluation(registry, activeProfileIds)
  const violations = collectViolations(input.snapshot, activeRules, activeProfileIds)
  const hardFailures = violations.filter((violation) => violation.severity === 'error')
  const warnings = violations.filter((violation) => violation.severity !== 'error')
  const dimensionScores = buildDimensionScores(input.snapshot, registry, violations)
  const totalScore = dimensionScores.reduce((sum, score) => sum + score.score, 0)
  const fengShuiAdvisories = collectAiFengShuiAdvisoriesForViolations(violations, input.snapshot)

  return {
    ...evaluation,
    activeProfileIds,
    passed: hardFailures.length === 0,
    hardFailures,
    warnings,
    dimensionScores,
    totalScore,
    fengShuiAdvisories,
  }
}

function collectViolations(
  snapshot: AiAnalysisSnapshot,
  activeRules: ActiveRuleBundle,
  activeProfileIds: string[],
) {
  const violations = new Map<string, AiConstraintViolation>()
  const pushViolation = (violation: AiConstraintViolation) => {
    const key = `${violation.code}:${violation.targetId ?? 'global'}:${normalizeText(violation.message)}`
    const current = violations.get(key)
    if (!current) {
      violations.set(key, violation)
      return
    }

    violations.set(key, {
      ...current,
      message:
        current.message.length >= violation.message.length ? current.message : violation.message,
      metricValue: current.metricValue ?? violation.metricValue,
      sourceProfileIds: dedupeStrings([...current.sourceProfileIds, ...violation.sourceProfileIds]),
      fengShuiAdvisories: mergeAiFengShuiAdvisories([
        ...current.fengShuiAdvisories,
        ...violation.fengShuiAdvisories,
      ]),
    })
  }

  for (const issue of snapshot.issues) {
    pushViolation(issueToViolation(issue, activeProfileIds))
  }

  evaluateDaylightRequirements(snapshot, activeRules, activeProfileIds, pushViolation)
  evaluateAccessibility(snapshot, activeRules, activeProfileIds, pushViolation)
  evaluateBedroomThresholds(snapshot, activeRules, activeProfileIds, pushViolation)
  evaluateProgramFit(snapshot, activeRules, activeProfileIds, pushViolation)
  evaluatePrivacyFrontage(snapshot, activeProfileIds, pushViolation)

  return [...violations.values()].sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === 'error' ? -1 : 1
    }
    if (left.code !== right.code) {
      return left.code.localeCompare(right.code)
    }
    return (left.targetId ?? '').localeCompare(right.targetId ?? '')
  })
}

function buildDimensionScores(
  snapshot: AiAnalysisSnapshot,
  registry: AiRuleRegistry,
  violations: AiConstraintViolation[],
): AiConstraintDimensionScore[] {
  const deductions = new Map<AiScoreDimensionKey, number>()
  const notes = new Map<AiScoreDimensionKey, string[]>()

  for (const dimension of SCORE_DIMENSION_ORDER) {
    deductions.set(dimension, 0)
    notes.set(dimension, [])
  }

  for (const violation of violations) {
    const dimension = ISSUE_DIMENSION_MAP[violation.code]
    const nextDeduction = (deductions.get(dimension) ?? 0) + getViolationPenalty(violation)
    deductions.set(dimension, nextDeduction)
    appendUniqueNote(notes, dimension, violation.message)
  }

  appendPositiveSignals(snapshot, notes)

  return SCORE_DIMENSION_ORDER.map((key) => {
    const maxScore = registry.scoreWeights[key]
    const score = Math.max(0, maxScore - (deductions.get(key) ?? 0))
    return {
      key,
      score,
      maxScore,
      notes: notes.get(key) ?? [],
    }
  })
}

function appendPositiveSignals(
  snapshot: AiAnalysisSnapshot,
  notes: Map<AiScoreDimensionKey, string[]>,
) {
  const rooms = getAllRooms(snapshot)
  const habitableRooms = rooms.filter(isHabitableRoom)
  const daylitHabitableCount = habitableRooms.filter(hasPositiveDaylight).length
  const hasLivingRoom = rooms.some((room) => roomMatches(room, LIVING_PROGRAM_KEYS))
  const hasKitchen = rooms.some((room) => roomMatches(room, KITCHEN_PROGRAM_KEYS))
  const hasBathroom = rooms.some((room) => roomMatches(room, BATHROOM_PROGRAM_KEYS))
  const hasWorkRoom = rooms.some((room) => roomMatches(room, WORK_PROGRAM_KEYS))
  const storageRoomCount = rooms.filter((room) => roomMatches(room, STORAGE_PROGRAM_KEYS)).length
  const primaryAccessibility = getPrimaryLevelAccessibility(snapshot)

  if (hasLivingRoom && hasKitchen && hasBathroom) {
    appendUniqueNote(
      notes,
      'program_fit',
      'Current snapshot includes living, kitchen, and bathroom core spaces.',
    )
  }

  if (snapshot.householdBrief?.workFromHome && hasWorkRoom) {
    appendUniqueNote(notes, 'program_fit', 'Work-from-home demand is matched by a dedicated room.')
  }

  if (daylitHabitableCount > 0) {
    appendUniqueNote(
      notes,
      'daylight_ventilation',
      `${daylitHabitableCount} habitable room(s) already show direct daylight tags.`,
    )
  }

  if (storageRoomCount > 0) {
    appendUniqueNote(
      notes,
      'storage_chores',
      `${storageRoomCount} dedicated storage or service room(s) are present.`,
    )
  }

  if (primaryAccessibility?.hasStepFreeEntry === true) {
    appendUniqueNote(notes, 'accessibility_lifecycle', 'Primary access path appears step-free.')
  }
}

function evaluateDaylightRequirements(
  snapshot: AiAnalysisSnapshot,
  activeRules: ActiveRuleBundle,
  activeProfileIds: string[],
  pushViolation: (violation: AiConstraintViolation) => void,
) {
  const habitableRooms = getAllRooms(snapshot).filter(isHabitableRoom)

  if (activeRules.requiresAtLeastOneDaylitRoom && !habitableRooms.some(hasPositiveDaylight)) {
    pushViolation(
      createViolation(
        'DAYLIT_ROOM_REQUIRED',
        'No habitable room currently secures direct daylight under the active profile.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }

  for (const room of habitableRooms) {
    if (isSingleSidedDeepRoom(room)) {
      pushViolation(
        createViolation(
          'SINGLE_SIDED_DEEP_LAYOUT',
          `${room.name} is deep and single-aspect, which weakens daylight and cross-ventilation.`,
          {
            targetId: room.nodeId,
            sourceProfileIds: activeProfileIds,
            metricValue: room.depth ?? room.aspectRatio ?? null,
          },
        ),
      )
    }
  }
}

function evaluateAccessibility(
  snapshot: AiAnalysisSnapshot,
  activeRules: ActiveRuleBundle,
  activeProfileIds: string[],
  pushViolation: (violation: AiConstraintViolation) => void,
) {
  const primaryAccessibility = getPrimaryLevelAccessibility(snapshot)
  if (
    activeRules.requiresAccessiblePublicEntry &&
    primaryAccessibility?.hasStepFreeEntry !== true
  ) {
    pushViolation(
      createViolation(
        'ACCESSIBLE_ENTRY_REQUIRED',
        'The primary entry is not confirmed as step-free under the active accessibility profile.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }

  if (
    typeof activeRules.internalDoorClearOpeningMinMm === 'number' &&
    Number.isFinite(activeRules.internalDoorClearOpeningMinMm)
  ) {
    const minDoorWidthMm = activeRules.internalDoorClearOpeningMinMm
    const measuredMinimumDoorWidth = primaryAccessibility?.minimumDoorClearWidth
    if (
      typeof measuredMinimumDoorWidth === 'number' &&
      Number.isFinite(measuredMinimumDoorWidth) &&
      measuredMinimumDoorWidth < minDoorWidthMm
    ) {
      pushViolation(
        createViolation(
          'OPENING_SIZE_BELOW_MIN',
          `Door clear width ${Math.round(measuredMinimumDoorWidth)} mm is below the ${Math.round(minDoorWidthMm)} mm target.`,
          {
            sourceProfileIds: activeProfileIds,
            metricValue: measuredMinimumDoorWidth,
          },
        ),
      )
    } else {
      for (const level of snapshot.levels) {
        for (const opening of level.openings) {
          if (opening.kind !== 'door' || opening.width == null) continue
          const openingWidthMm = toMillimeters(opening.width, snapshot)
          if (openingWidthMm >= minDoorWidthMm) continue
          pushViolation(
            createViolation(
              'OPENING_SIZE_BELOW_MIN',
              `Door opening ${Math.round(openingWidthMm)} mm is below the ${Math.round(minDoorWidthMm)} mm target.`,
              {
                targetId: opening.nodeId,
                sourceProfileIds: activeProfileIds,
                metricValue: openingWidthMm,
              },
            ),
          )
        }
      }
    }
  }

  if (
    typeof activeRules.elevatorRequiredFromFloorCount === 'number' &&
    snapshot.levelCount >= activeRules.elevatorRequiredFromFloorCount &&
    !hasElevatorProgram(snapshot)
  ) {
    pushViolation(
      createViolation(
        'ELEVATOR_REQUIRED',
        `Layouts at ${snapshot.levelCount} levels should reserve an elevator core under the active profile.`,
        {
          sourceProfileIds: activeProfileIds,
          metricValue: snapshot.levelCount,
        },
      ),
    )
  }

  if (
    activeRules.requiresAgingFriendlyAccessChecks &&
    (snapshot.householdBrief?.elderLiving || snapshot.householdBrief?.caregivingNeed) &&
    (primaryAccessibility?.hasStepFreePathToBathroom === false ||
      (primaryAccessibility?.nightPathObstacleCount ?? 0) > 0)
  ) {
    pushViolation(
      createViolation(
        'AGING_PATH_UNSAFE',
        'Night-time access to the bathroom is not yet safe enough for ageing or caregiving use.',
        {
          sourceProfileIds: activeProfileIds,
          metricValue: primaryAccessibility?.nightPathObstacleCount ?? null,
        },
      ),
    )
  }
}

function evaluateBedroomThresholds(
  snapshot: AiAnalysisSnapshot,
  activeRules: ActiveRuleBundle,
  activeProfileIds: string[],
  pushViolation: (violation: AiConstraintViolation) => void,
) {
  const rooms = getAllRooms(snapshot)
  for (const room of rooms) {
    const areaSqm = toSquareMeters(room.area, snapshot)
    const widthMeters = toMeters(room.faceWidth, snapshot)

    if (roomMatchesProgram(room, 'primary_bedroom')) {
      if (
        areaSqm != null &&
        activeRules.doubleBedroomAreaMinSqm != null &&
        areaSqm < activeRules.doubleBedroomAreaMinSqm
      ) {
        pushViolation(
          createViolation(
            'ROOM_AREA_BELOW_MIN',
            `${room.name} is ${roundMetric(areaSqm)} sqm, below the ${roundMetric(activeRules.doubleBedroomAreaMinSqm)} sqm primary bedroom reference.`,
            {
              targetId: room.nodeId,
              sourceProfileIds: activeProfileIds,
              metricValue: areaSqm,
            },
          ),
        )
      }

      if (
        widthMeters != null &&
        activeRules.primaryDoubleBedroomWidthMinM != null &&
        widthMeters < activeRules.primaryDoubleBedroomWidthMinM
      ) {
        pushViolation(
          createViolation(
            'ROOM_SPAN_BELOW_MIN',
            `${room.name} frontage ${roundMetric(widthMeters)} m is below the ${roundMetric(activeRules.primaryDoubleBedroomWidthMinM)} m primary bedroom width reference.`,
            {
              targetId: room.nodeId,
              sourceProfileIds: activeProfileIds,
              metricValue: widthMeters,
            },
          ),
        )
      }
      continue
    }

    if (!roomMatchesProgram(room, 'bedroom')) continue

    if (
      areaSqm != null &&
      activeRules.singleBedroomAreaMinSqm != null &&
      areaSqm < activeRules.singleBedroomAreaMinSqm
    ) {
      pushViolation(
        createViolation(
          'ROOM_AREA_BELOW_MIN',
          `${room.name} is ${roundMetric(areaSqm)} sqm, below the ${roundMetric(activeRules.singleBedroomAreaMinSqm)} sqm bedroom reference.`,
          {
            targetId: room.nodeId,
            sourceProfileIds: activeProfileIds,
            metricValue: areaSqm,
          },
        ),
      )
    }

    if (
      widthMeters != null &&
      activeRules.singleBedroomWidthMinM != null &&
      widthMeters < activeRules.singleBedroomWidthMinM
    ) {
      pushViolation(
        createViolation(
          'ROOM_SPAN_BELOW_MIN',
          `${room.name} frontage ${roundMetric(widthMeters)} m is below the ${roundMetric(activeRules.singleBedroomWidthMinM)} m bedroom width reference.`,
          {
            targetId: room.nodeId,
            sourceProfileIds: activeProfileIds,
            metricValue: widthMeters,
          },
        ),
      )
    }
  }
}

function evaluateProgramFit(
  snapshot: AiAnalysisSnapshot,
  activeRules: ActiveRuleBundle,
  activeProfileIds: string[],
  pushViolation: (violation: AiConstraintViolation) => void,
) {
  const rooms = getAllRooms(snapshot)
  const occupantCount = snapshot.householdBrief?.occupantCount ?? 0
  const isResidentialProgram = occupantCount > 0 || snapshot.householdBrief?.householdType !== null
  if (!isResidentialProgram) return

  const hasSleepingRoom = rooms.some((room) => roomMatches(room, SLEEP_PROGRAM_KEYS))
  const hasLivingRoom = rooms.some((room) => roomMatches(room, LIVING_PROGRAM_KEYS))
  const hasKitchen = rooms.some((room) => roomMatches(room, KITCHEN_PROGRAM_KEYS))
  const hasBathroom = rooms.some((room) => roomMatches(room, BATHROOM_PROGRAM_KEYS))
  const hasWorkRoom = rooms.some((room) => roomMatches(room, WORK_PROGRAM_KEYS))
  const hasStorageRoom = rooms.some((room) => roomMatches(room, STORAGE_PROGRAM_KEYS))

  if (!hasSleepingRoom) {
    pushViolation(
      createViolation(
        'PROGRAM_MISSING_CORE_SPACE',
        'The current household brief still lacks a sleeping room.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }

  if (!hasLivingRoom) {
    pushViolation(
      createViolation(
        'PROGRAM_MISSING_CORE_SPACE',
        'The current household brief still lacks a primary living room or reception space.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }

  if (!hasBathroom) {
    pushViolation(
      createViolation(
        'PROGRAM_MISSING_CORE_SPACE',
        'The current household brief still lacks a bathroom.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }

  if ((snapshot.householdBrief?.cookingIntensity ?? 'medium') !== 'low' && !hasKitchen) {
    pushViolation(
      createViolation(
        'PROGRAM_MISSING_CORE_SPACE',
        'Cooking demand exists in the household brief, but no kitchen is reserved.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }

  if (snapshot.householdBrief?.workFromHome && !hasWorkRoom) {
    pushViolation(
      createViolation(
        'WORKFLOW_SUPPORT_MISSING',
        'Work-from-home demand exists, but no study or office room is currently reserved.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }

  if (snapshot.householdBrief?.storagePriority === 'high' && !hasStorageRoom) {
    pushViolation(
      createViolation(
        'STORAGE_MISSING',
        'High storage priority is declared, but no dedicated storage or service room is present.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }

  if (
    activeRules.requiresAgingFriendlyAccessChecks &&
    snapshot.householdBrief?.elderLiving &&
    !rooms.some(
      (room) =>
        room.level === getPrimaryLevelNumber(snapshot) && roomMatches(room, SLEEP_PROGRAM_KEYS),
    )
  ) {
    pushViolation(
      createViolation(
        'AGING_PATH_UNSAFE',
        'Elder living is requested, but there is no sleeping room reserved on the primary access level.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }
}

function evaluatePrivacyFrontage(
  snapshot: AiAnalysisSnapshot,
  activeProfileIds: string[],
  pushViolation: (violation: AiConstraintViolation) => void,
) {
  const rooms = getAllRooms(snapshot)
  if (rooms.length === 0) return

  const bestFrontageRooms = rooms.filter((room) =>
    room.daylightTags?.some(
      (tag) =>
        tag.key === 'best-frontage' && (tag.status === 'preferred' || tag.status === 'present'),
    ),
  )
  if (bestFrontageRooms.length === 0) return

  const hasCoreFrontage = bestFrontageRooms.some((room) =>
    roomMatches(room, CORE_FRONTAGE_PROGRAM_KEYS),
  )
  const hasServiceFrontage = bestFrontageRooms.some(
    (room) =>
      room.privacyClass === 'service' ||
      room.daylightTags?.some((tag) => tag.key === 'service-frontage'),
  )

  if (!hasCoreFrontage && hasServiceFrontage) {
    pushViolation(
      createViolation(
        'PUBLIC_PRIVATE_REVERSED',
        'Best frontage is currently consumed by service rooms instead of living or sleeping spaces.',
        {
          sourceProfileIds: activeProfileIds,
        },
      ),
    )
  }
}

function resolveActiveProfileIds(registry: AiRuleRegistry, requestedProfileIds: string[]) {
  const validRequested = dedupeStrings(requestedProfileIds).filter((profileId) =>
    registry.sourceProfiles.some((profile) => profile.id === profileId),
  )
  if (validRequested.length > 0) return validRequested
  return registry.sourceProfiles
    .filter((profile) => profile.kind === 'mandatory')
    .map((profile) => profile.id)
}

function buildActiveRuleBundle(profiles: AiRuleSourceProfile[]): ActiveRuleBundle {
  return {
    requiresAtLeastOneDaylitRoom: getBooleanRule(profiles, 'requiresAtLeastOneDaylitRoom'),
    requiresAccessiblePublicEntry: getBooleanRule(profiles, 'requiresAccessiblePublicEntry'),
    requiresAgingFriendlyAccessChecks: getBooleanRule(
      profiles,
      'requiresAgingFriendlyAccessChecks',
    ),
    elevatorRequiredFromFloorCount: getNumericRule(profiles, 'elevatorRequiredFromFloorCount'),
    internalDoorClearOpeningMinMm: getNumericRule(profiles, 'internalDoorClearOpeningMinMm'),
    singleBedroomAreaMinSqm: getNumericRule(profiles, 'singleBedroomAreaMinSqm'),
    singleBedroomWidthMinM: getNumericRule(profiles, 'singleBedroomWidthMinM'),
    doubleBedroomAreaMinSqm: getNumericRule(profiles, 'doubleBedroomAreaMinSqm'),
    primaryDoubleBedroomWidthMinM: getNumericRule(profiles, 'primaryDoubleBedroomWidthMinM'),
  }
}

function getBooleanRule(profiles: AiRuleSourceProfile[], key: string) {
  return profiles.some((profile) => profile.rules[key] === true)
}

function getNumericRule(profiles: AiRuleSourceProfile[], key: string) {
  const numericValues = profiles
    .map((profile) => profile.rules[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numericValues.length === 0) return null
  return Math.max(...numericValues)
}

function getAllRooms(snapshot: AiAnalysisSnapshot) {
  return snapshot.levels.flatMap((level) =>
    level.rooms.map((room) => ({
      ...room,
      level: level.level,
    })),
  )
}

function getPrimaryLevelNumber(snapshot: AiAnalysisSnapshot) {
  const primaryLevel = [...snapshot.levels].sort((left, right) => left.level - right.level)[0]
  return primaryLevel?.level ?? 1
}

function getPrimaryLevelAccessibility(snapshot: AiAnalysisSnapshot) {
  const primaryLevel = [...snapshot.levels].sort((left, right) => left.level - right.level)[0]
  return primaryLevel?.accessibility ?? null
}

function isHabitableRoom(room: AiRoomSnapshot) {
  if (room.privacyClass === 'service' || room.privacyClass === 'outdoor') {
    return false
  }

  if (room.programKey && BATHROOM_PROGRAM_KEYS.has(room.programKey)) return false
  if (room.programKey && STORAGE_PROGRAM_KEYS.has(room.programKey)) return false
  if (room.programKey && room.programKey === 'corridor') return false
  return true
}

function hasPositiveDaylight(room: AiRoomSnapshot) {
  return (
    room.daylightTags?.some((tag) => {
      if (tag.status !== 'preferred' && tag.status !== 'present') return false
      return (
        tag.key === 'primary-daylight' ||
        tag.key === 'secondary-daylight' ||
        tag.key === 'best-frontage'
      )
    }) ?? false
  )
}

function isSingleSidedDeepRoom(room: AiRoomSnapshot) {
  const hasSingleAspect =
    room.daylightTags?.some(
      (tag) =>
        tag.key === 'single-aspect' && (tag.status === 'present' || tag.status === 'preferred'),
    ) ?? false
  const hasCrossVentilation =
    room.daylightTags?.some(
      (tag) =>
        tag.key === 'cross-ventilation' && (tag.status === 'present' || tag.status === 'preferred'),
    ) ?? false
  if (!hasSingleAspect || hasCrossVentilation) return false

  if (typeof room.depth === 'number' && typeof room.faceWidth === 'number') {
    return room.depth >= 6 && room.depth > room.faceWidth * 1.5
  }

  return typeof room.aspectRatio === 'number' && room.aspectRatio > 2.2
}

function roomMatches(room: AiRoomSnapshot, programKeys: Set<string>) {
  for (const programKey of programKeys) {
    if (roomMatchesProgram(room, programKey)) return true
  }
  return false
}

function roomMatchesProgram(room: AiRoomSnapshot, programKey: string) {
  if (room.programKey === programKey) return true
  const normalizedName = normalizeText(room.name)
  return (PROGRAM_ALIASES[programKey] ?? []).some((alias) =>
    normalizedName.includes(normalizeText(alias)),
  )
}

function hasElevatorProgram(snapshot: AiAnalysisSnapshot) {
  return getAllRooms(snapshot).some((room) => roomMatches(room, ELEVATOR_PROGRAM_KEYS))
}

function getViolationPenalty(violation: AiConstraintViolation) {
  if (violation.severity === 'error') return 6
  if (violation.code === 'WORKFLOW_SUPPORT_MISSING') return 2
  return 3
}

function appendUniqueNote(
  notes: Map<AiScoreDimensionKey, string[]>,
  key: AiScoreDimensionKey,
  note: string,
) {
  const current = notes.get(key) ?? []
  if (current.includes(note)) return
  current.push(note)
  notes.set(key, current)
}

function issueToViolation(
  issue: AiAnalysisIssue,
  fallbackProfileIds: string[],
): AiConstraintViolation {
  const definition = getAiAnalysisIssueDefinition(issue.code)
  return {
    code: issue.code,
    scope: issue.scope ?? definition.scope,
    severity: issue.severity ?? definition.severity,
    message: issue.message || definition.summary,
    targetId: issue.targetId ?? null,
    sourceProfileIds: dedupeStrings(issue.sourceProfileIds ?? fallbackProfileIds),
    metricValue: issue.metricValue ?? null,
    fengShuiAdvisories: getAiFengShuiAdvisoriesForIssue(issue.code),
  }
}

function createViolation(
  code: AiAnalysisIssueCode,
  message: string,
  options: {
    targetId?: string | null
    sourceProfileIds?: string[]
    metricValue?: number | null
  },
): AiConstraintViolation {
  const definition = getAiAnalysisIssueDefinition(code)
  return {
    code,
    scope: definition.scope,
    severity: definition.severity,
    message,
    targetId: options.targetId ?? null,
    sourceProfileIds: dedupeStrings(options.sourceProfileIds ?? []),
    metricValue: options.metricValue ?? null,
    fengShuiAdvisories: getAiFengShuiAdvisoriesForIssue(code),
  }
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.length > 0))]
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function toMillimeters(value: number | null, snapshot: AiAnalysisSnapshot) {
  const meters = toMeters(value, snapshot)
  if (meters == null) return 0
  return meters * 1000
}

function toMeters(value: number | null, snapshot: AiAnalysisSnapshot) {
  if (!(typeof value === 'number' && Number.isFinite(value))) return null
  return snapshot.unit === 'imperial' ? value * 0.3048 : value
}

function toSquareMeters(value: number | null, snapshot: AiAnalysisSnapshot) {
  if (!(typeof value === 'number' && Number.isFinite(value))) return null
  return snapshot.unit === 'imperial' ? value * 0.092903 : value
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10
}
