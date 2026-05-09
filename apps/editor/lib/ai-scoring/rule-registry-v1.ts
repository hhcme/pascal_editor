import type { AiAnalysisIssueCode } from '@pascal-app/editor'
import type {
  AiNegativePatternDefinition,
  AiRuleRegistry,
  AiRuleSourceProfile,
  AiScoreWeights,
} from './constraint-types'
import { getAiScoreWeightTotal } from './constraint-types'

const SOURCE_PROFILES = [
  {
    id: 'CN_GB55038_2025_BASE',
    region: 'CN',
    kind: 'mandatory',
    effectiveDate: '2025-05-01',
    sourceUrls: [
      'https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2025/art_66adac27fa2144bb86f98fe4c297efd6.html',
      'https://www.mohurd.gov.cn/xinwen/gzdt/art/2025/art_f87d0d50e2bf404ca2f95ee273fbafbf.html',
    ],
    rules: {
      residentialFloorHeightMinM: 3.0,
      elevatorRequiredFromFloorCount: 4,
      requiresAtLeastOneDaylitRoom: true,
      requiresAccessiblePublicEntry: true,
      requiresAgingFriendlyAccessChecks: true,
    },
  },
  {
    id: 'UK_NDSS_REFERENCE',
    region: 'UK',
    kind: 'reference',
    effectiveDate: '2015-03-27',
    sourceUrls: [
      'https://www.gov.uk/government/publications/technical-housing-standards-nationally-described-space-standard',
      'https://assets.publishing.service.gov.uk/media/6123c60e8fa8f53dd1f9b04d/160519_Nationally_Described_Space_Standard.pdf',
    ],
    rules: {
      singleBedroomAreaMinSqm: 7.5,
      singleBedroomWidthMinM: 2.15,
      doubleBedroomAreaMinSqm: 11.5,
      primaryDoubleBedroomWidthMinM: 2.75,
      secondaryDoubleBedroomWidthMinM: 2.55,
      giaHeightCoverageMinPercent: 75,
      floorToCeilingHeightMinM: 2.3,
      exampleDwellingAreasSqm: {
        '1b1p': 39,
        '1b1p_shower_room': 37,
        '1b2p': 50,
        '2b3p': 61,
        '2b4p': 70,
        '3b4p': 74,
        '3b5p': 86,
      },
    },
  },
  {
    id: 'ABCB_LIVABLE_REFERENCE',
    region: 'AU',
    kind: 'reference',
    effectiveDate: '2022-10-01',
    sourceUrls: [
      'https://www.abcb.gov.au/resource/standard/livable-housing-design-standard',
      'https://codemark.abcb.gov.au/faq/livable-housing-design-standard',
    ],
    rules: {
      internalDoorClearOpeningMinMm: 820,
      requiresStepFreeAccessPath: true,
      requiresAccessiblePathToHabitableRooms: true,
      requiresAccessiblePathToLaundry: true,
      requiresAccessiblePathToCompliantShower: true,
    },
  },
] as const satisfies AiRuleSourceProfile[]

const SCORE_WEIGHTS = {
  program_fit: 20,
  zoning_privacy: 15,
  circulation: 15,
  furniture_fit: 15,
  daylight_ventilation: 10,
  storage_chores: 10,
  accessibility_lifecycle: 10,
  adaptability: 5,
} satisfies AiScoreWeights

function negativePattern(
  code: AiAnalysisIssueCode,
  severity: AiNegativePatternDefinition['severity'],
  detectionFocus: string[],
  repairHints: string[],
): AiNegativePatternDefinition {
  return {
    code,
    severity,
    detectionFocus,
    repairHints,
  }
}

const NEGATIVE_PATTERNS = [
  negativePattern(
    'ENTRY_NO_BUFFER',
    'medium',
    ['entry_to_public_visibility', 'shoe_storage_missing', 'dust_buffer_missing'],
    ['add_entry_buffer', 'rotate_entry_path', 'insert_partition'],
  ),
  negativePattern(
    'TOILET_EXPOSED_TO_PUBLIC_VIEW',
    'high',
    ['bathroom_door_visibility_from_living', 'bathroom_door_visibility_from_dining'],
    ['move_bathroom_door', 'insert_transition_zone', 'swap_room_positions'],
  ),
  negativePattern(
    'PRIVATE_ROOM_TRAVERSED',
    'high',
    ['private_room_path_through_private_room', 'private_room_path_through_public_room'],
    ['add_corridor', 'reroute_access', 'swap_room_positions'],
  ),
  negativePattern(
    'DOOR_SWING_COLLISION',
    'high',
    ['door_to_door_collision', 'door_to_fixture_collision', 'door_to_furniture_collision'],
    ['reverse_door_swing', 'shift_door', 'replace_with_sliding_door'],
  ),
  negativePattern(
    'BASIC_FURNITURE_MISSING',
    'medium',
    [
      'bedroom_missing_bed_wardrobe_or_bedside',
      'living_room_missing_seating_table_or_media_storage',
      'dining_kitchen_bathroom_missing_core_fixtures',
      'study_missing_desk_chair_or_storage',
    ],
    ['add_furniture_anchor', 'expand_room', 'reduce_furniture_set'],
  ),
  negativePattern(
    'BEDROOM_FURNITURE_IMPOSSIBLE',
    'high',
    ['bed_cannot_fit', 'wardrobe_cannot_fit', 'bedside_clearance_invalid'],
    ['expand_room', 'reassign_room_type', 'reduce_furniture_set'],
  ),
  negativePattern(
    'KITCHEN_WORKFLOW_BROKEN',
    'medium',
    ['fridge_prep_cook_sink_flow_disconnected', 'appliance_door_blocks_main_path'],
    ['reorder_kitchen_modules', 'swap_appliance_positions', 'expand_work_surface'],
  ),
  negativePattern(
    'DINING_PULL_OUT_BLOCKED',
    'medium',
    ['dining_pull_out_conflict', 'table_clearance_below_target'],
    ['shrink_table', 'rotate_table', 'expand_dining_zone'],
  ),
  negativePattern(
    'CORRIDOR_AREA_WASTE',
    'medium',
    ['corridor_area_ratio_high', 'corridor_daylight_missing', 'corridor_dead_end'],
    ['compress_corridor', 'merge_with_adjacent_room', 'rezone_layout'],
  ),
  negativePattern(
    'NO_DAYLIT_HABITABLE_ROOM',
    'high',
    ['habitable_rooms_without_daylight', 'best_orientation_allocated_to_secondary_rooms'],
    ['swap_room_positions', 'add_opening', 'reduce_layout_depth'],
  ),
  negativePattern(
    'SINGLE_SIDED_DEEP_LAYOUT',
    'medium',
    ['deep_single_aspect_room', 'cross_ventilation_absent'],
    ['introduce_courtyard', 'reduce_depth', 'reallocate_daylight_rooms'],
  ),
  negativePattern(
    'STORAGE_MISSING',
    'medium',
    ['entry_storage_missing', 'kitchen_storage_missing', 'cleaning_storage_missing'],
    ['add_storage_room', 'add_built_in_cabinet', 'expand_service_zone'],
  ),
  negativePattern(
    'LAUNDRY_DRYING_CONFLICT',
    'medium',
    ['laundry_blocks_circulation', 'drying_space_conflicts_with_kitchen', 'service_balcony_missing'],
    ['move_laundry_zone', 'split_balcony_roles', 'add_service_storage'],
  ),
  negativePattern(
    'AGING_PATH_UNSAFE',
    'high',
    ['elder_room_far_from_toilet', 'night_path_contains_obstacles', 'grab_bar_upgrade_path_missing'],
    ['add_ground_floor_sleeping_option', 'shorten_night_path', 'reserve_support_installation'],
  ),
  negativePattern(
    'PUBLIC_PRIVATE_REVERSED',
    'medium',
    ['secondary_rooms_take_best_frontage', 'living_room_daylight_priority_low', 'primary_bedroom_frontage_priority_low'],
    ['swap_room_positions', 'reweight_frontage_allocation', 'rebuild_zone_order'],
  ),
] as const satisfies AiNegativePatternDefinition[]

export const AI_BUILDING_RULE_REGISTRY_V1 = {
  version: 'ai-building-rule-registry:v1',
  notes: [
    'This registry is a starting point for profile-driven rule evaluation.',
    'Mandatory rules must be selected by region and product type instead of being applied globally.',
    'Academic-only datasets must not be merged into commercial product training without legal review.',
  ],
  sourceProfiles: SOURCE_PROFILES,
  scoreWeights: SCORE_WEIGHTS,
  householdAxes: [
    'occupant_count',
    'age_structure',
    'elder_living',
    'child_living',
    'work_from_home',
    'pet_living',
    'cooking_intensity',
    'storage_priority',
    'guest_frequency',
    'caregiving_need',
    'rental_flexibility',
  ],
  negativePatterns: NEGATIVE_PATTERNS,
} as const satisfies AiRuleRegistry

export function getAiRuleRegistryV1() {
  return AI_BUILDING_RULE_REGISTRY_V1
}

export function getAiRuleSourceProfile(profileId: string) {
  return AI_BUILDING_RULE_REGISTRY_V1.sourceProfiles.find((profile) => profile.id === profileId) ?? null
}

export function getAiNegativePattern(code: AiAnalysisIssueCode) {
  return AI_BUILDING_RULE_REGISTRY_V1.negativePatterns.find((pattern) => pattern.code === code) ?? null
}

export function getAiRuleRegistryScoreMax() {
  return getAiScoreWeightTotal(AI_BUILDING_RULE_REGISTRY_V1.scoreWeights)
}
