import type { MeasurementUnit } from '../measurement'
import type {
  AiAnalysisIssueCode,
  AiAnalysisIssueScope,
  AiAnalysisIssueSeverity,
} from './issue-codes'

export type AiAnalysisSnapshotVersion = 'ai-analysis:v1'
export type AiAnalysisSource = 'scene-graph' | 'ai-plan-preview'

export type AiHouseholdCookingIntensity = 'low' | 'medium' | 'high'
export type AiHouseholdPreferenceLevel = 'low' | 'medium' | 'high'
export type AiHouseholdGuestFrequency = 'rare' | 'occasional' | 'frequent'
export type AiHouseholdAgeGroup = 'child' | 'teen' | 'adult' | 'senior'
export type AiHouseholdMobilityNeed = 'independent' | 'limited' | 'wheelchair'
export type AiRoomPrivacyClass = 'public' | 'semi-private' | 'private' | 'service' | 'outdoor' | 'unknown'
export type AiDaylightStatus = 'preferred' | 'present' | 'missing' | 'conflict' | 'unknown'
export type AiDaylightTagKey =
  | 'primary-daylight'
  | 'secondary-daylight'
  | 'single-aspect'
  | 'dual-aspect'
  | 'cross-ventilation'
  | 'borrowed-light'
  | 'no-direct-daylight'
  | 'best-frontage'
  | 'service-frontage'
export type AiOperationSupportLevel = 'supported' | 'partial' | 'missing'

export type AiAnalysisSnapshot = {
  version: AiAnalysisSnapshotVersion
  source: AiAnalysisSource
  unit: MeasurementUnit
  generatedAt: string
  buildingId: string | null
  levelCount: number
  activeProfileIds: string[]
  householdBrief: AiHouseholdBrief | null
  site: AiSiteSnapshot | null
  building: AiBuildingSnapshot | null
  levels: AiLevelSnapshot[]
  issues: AiAnalysisIssue[]
}

export type AiHouseholdBrief = {
  householdType: string | null
  occupantCount: number | null
  occupants: AiHouseholdOccupant[]
  elderLiving: boolean | null
  childLiving: boolean | null
  workFromHome: boolean | null
  petLiving: boolean | null
  cookingIntensity: AiHouseholdCookingIntensity | null
  storagePriority: AiHouseholdPreferenceLevel | null
  guestFrequency: AiHouseholdGuestFrequency | null
  caregivingNeed: boolean | null
  rentalFlexibility: boolean | null
  notes: string[]
}

export type AiHouseholdOccupant = {
  id: string
  label: string | null
  role: string | null
  ageGroup: AiHouseholdAgeGroup | null
  mobilityNeed: AiHouseholdMobilityNeed | null
  worksFromHome: boolean | null
}

export type AiSiteSnapshot = {
  nodeId: string
  area: number | null
  perimeter: number | null
  faceWidth: number | null
  depth: number | null
  slopePercent: number | null
  orientationDegrees: number | null
  polygon: Array<[number, number]>
  buildableRange?: {
    frontSetbackMin: number | null
    backSetbackMin: number | null
    leftSetbackMin: number | null
    rightSetbackMin: number | null
  }
}

export type AiBuildingSnapshot = {
  nodeId: string
  footprintArea: number | null
  perimeter: number | null
  faceWidth: number | null
  depth: number | null
  height: number | null
  setbacks: {
    front: number | null
    back: number | null
    left: number | null
    right: number | null
  }
}

export type AiLevelSnapshot = {
  nodeId: string
  level: number
  area: number | null
  clearHeight: number | null
  rooms: AiRoomSnapshot[]
  openings: AiOpeningSnapshot[]
  items: AiItemSnapshot[]
  circulation?: AiCirculationSnapshot | null
  operations?: AiOperationsSnapshot | null
  accessibility?: AiAccessibilitySnapshot | null
}

export type AiRoomSnapshot = {
  nodeId: string
  programKey: string | null
  name: string
  area: number | null
  faceWidth: number | null
  depth: number | null
  clearHeight: number | null
  aspectRatio: number | null
  polygon: Array<[number, number]>
  openings: string[]
  items: string[]
  adjacency: string[]
  privacyClass?: AiRoomPrivacyClass | null
  daylightTags?: AiDaylightTag[] | null
}

export type AiDaylightTag = {
  key: AiDaylightTagKey
  status: AiDaylightStatus
  orientationDegrees: number | null
  note?: string | null
}

export type AiOpeningSnapshot = {
  nodeId: string
  kind: 'door' | 'window'
  levelId: string
  hostNodeId: string | null
  width: number | null
  height: number | null
  sillHeight: number | null
  topClearance: number | null
}

export type AiItemSnapshot = {
  nodeId: string
  assetId: string | null
  category: string | null
  levelId: string
  roomId: string | null
  attachType: 'floor' | 'wall' | 'ceiling' | 'unknown'
  bbox: {
    width: number
    height: number
    depth: number
  } | null
  clearance: {
    front: number | null
    back: number | null
    left: number | null
    right: number | null
    top: number | null
    nearestHorizontal: number | null
    floorOffset: number | null
  }
  placement: {
    valid: boolean
    blockedBy?: string[]
    wallAligned?: boolean | null
  }
}

export type AiCirculationSnapshot = {
  minPathWidth: number | null
  blockedSegments: Array<{
    start: [number, number]
    end: [number, number]
    width: number
  }>
}

export type AiOperationsSnapshot = {
  activities: AiOperationActivity[]
  strengths: string[]
  missing: string[]
}

export type AiOperationActivity = {
  key: string
  label: string
  roomId: string | null
  supportLevel: AiOperationSupportLevel
  connectedRoomIds: string[]
  notes: string[]
}

export type AiAccessibilitySnapshot = {
  hasStepFreeEntry: boolean | null
  hasStepFreePathToPrimaryRoom: boolean | null
  hasStepFreePathToBathroom: boolean | null
  minimumDoorClearWidth: number | null
  turningRadius: number | null
  bathroomGrabBarReady: boolean | null
  nightPathObstacleCount: number | null
}

export type AiAnalysisIssue = {
  scope: AiAnalysisIssueScope
  targetId: string | null
  code: AiAnalysisIssueCode
  severity: AiAnalysisIssueSeverity
  message: string
  metricValue: number | null
  relatedIds?: string[]
  sourceProfileIds?: string[]
}

export type CreateAiAnalysisSnapshotInput = {
  source: AiAnalysisSource
  unit?: MeasurementUnit
  generatedAt?: string
  buildingId?: string | null
  activeProfileIds?: string[]
  householdBrief?: AiHouseholdBrief | null
  site?: AiSiteSnapshot | null
  building?: AiBuildingSnapshot | null
  levels?: AiLevelSnapshot[]
  issues?: AiAnalysisIssue[]
}
