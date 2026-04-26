type AiBuildingType = 'villa' | 'residential' | 'apartment' | 'shop' | 'office' | 'hotel'

export type ProgramDrivenRoomRule = {
  order: number
  areaWeight: number
  preferredMinArea: number
  hardMinArea: number
  maxAspectRatio: number
  minSpan: number
  preferNear: string[]
  avoidNear: string[]
}

type RoomRuleOverride = Partial<Omit<ProgramDrivenRoomRule, 'preferNear' | 'avoidNear'>> & {
  preferNear?: string[]
  avoidNear?: string[]
}

const DEFAULT_ROOM_RULES: Record<string, ProgramDrivenRoomRule> = {
  entry: rule(0, 0.75, 3.2, 2.2, 2.5, 1.4, ['living_room', 'reception', 'corridor', 'stairs'], []),
  reception: rule(1, 0.9, 5, 3.5, 2.8, 1.7, ['living_room', 'open_office', 'meeting_room'], ['bathroom']),
  corridor: rule(2, 0.55, 4.5, 2.8, 4.8, 1.2, ['entry', 'stairs', 'bathroom'], []),
  stairs: rule(3, 0.8, 6, 4.5, 2.4, 1.8, ['entry', 'corridor', 'living_room'], []),
  elevator: rule(4, 0.55, 2.5, 1.6, 1.8, 1.4, ['corridor', 'reception'], []),
  living_room: rule(5, 1.6, 18, 14, 2.4, 3.2, ['dining_room', 'kitchen', 'study', 'balcony', 'courtyard'], ['garage', 'equipment_room', 'production']),
  open_office: rule(6, 1.8, 24, 18, 2.8, 3.4, ['meeting_room', 'pantry', 'reception'], []),
  display_area: rule(7, 1.5, 18, 12, 2.8, 3, ['cashier', 'storage', 'retail_area'], ['bathroom']),
  retail_area: rule(8, 1.55, 18, 12, 2.8, 3, ['cashier', 'storage', 'display_area'], ['bathroom']),
  dining_room: rule(9, 1.15, 10, 7, 2.6, 2.4, ['living_room', 'kitchen', 'pantry'], ['garage']),
  kitchen: rule(10, 1.05, 8, 5.5, 3.2, 1.8, ['dining_room', 'pantry', 'storage'], ['bedroom', 'primary_bedroom']),
  pantry: rule(11, 0.65, 4, 2.5, 3.2, 1.5, ['kitchen', 'dining_room', 'storage'], []),
  meeting_room: rule(12, 1.15, 10, 7, 2.4, 2.4, ['open_office', 'reception'], ['bathroom']),
  primary_bedroom: rule(13, 1.35, 14, 11, 2.3, 2.8, ['bathroom', 'study', 'balcony'], ['garage', 'retail_area', 'display_area', 'production', 'kitchen']),
  bedroom: rule(14, 1.05, 10, 8, 2.3, 2.4, ['bathroom', 'study'], ['garage', 'retail_area', 'display_area', 'production', 'kitchen']),
  study: rule(15, 0.95, 8, 5.5, 2.4, 2.2, ['primary_bedroom', 'bedroom', 'living_room'], ['production']),
  bathroom: rule(16, 0.62, 4, 2.8, 2.2, 1.6, ['bedroom', 'primary_bedroom', 'study', 'corridor'], ['living_room', 'dining_room', 'reception', 'display_area']),
  garage: rule(17, 1.45, 18, 14, 2.4, 2.8, ['entry', 'storage'], ['living_room', 'bedroom', 'primary_bedroom', 'study']),
  storage: rule(18, 0.7, 5, 3.5, 3.2, 1.7, ['kitchen', 'cashier', 'garage'], []),
  archive: rule(19, 0.7, 5, 3.5, 3, 1.7, ['open_office', 'meeting_room'], []),
  equipment_room: rule(20, 0.65, 4, 3, 2.8, 1.6, ['storage', 'garage'], ['living_room', 'bedroom', 'primary_bedroom']),
  cashier: rule(21, 0.7, 4, 2.5, 2.2, 1.4, ['display_area', 'retail_area', 'storage'], ['bathroom']),
  production: rule(22, 1.35, 16, 12, 3, 2.8, ['storage', 'equipment_room'], ['bedroom', 'primary_bedroom', 'living_room']),
  balcony: rule(23, 0.75, 5, 3, 4.2, 1.5, ['living_room', 'primary_bedroom', 'bedroom'], []),
  courtyard: rule(24, 1.3, 12, 8, 3.5, 3, ['living_room', 'dining_room'], []),
}

const BUILDING_TYPE_OVERRIDES: Partial<Record<AiBuildingType, Record<string, RoomRuleOverride>>> = {
  villa: {
    corridor: { preferredMinArea: 5.5, hardMinArea: 3.6, maxAspectRatio: 5.4, minSpan: 1.25 },
    living_room: { areaWeight: 1.8, preferredMinArea: 24, hardMinArea: 18, minSpan: 3.6 },
    primary_bedroom: { areaWeight: 1.5, preferredMinArea: 18, hardMinArea: 13, minSpan: 3.1 },
    dining_room: { preferredMinArea: 12, hardMinArea: 8.5 },
    garage: { preferredMinArea: 20, hardMinArea: 15, minSpan: 3.1 },
  },
  residential: {
    corridor: {
      preferredMinArea: 5.2,
      hardMinArea: 3.4,
      maxAspectRatio: 5.2,
      minSpan: 1.25,
      preferNear: ['entry', 'stairs', 'bathroom', 'living_room'],
    },
    living_room: { preferredMinArea: 20, hardMinArea: 15, minSpan: 3.4 },
    primary_bedroom: { preferredMinArea: 15, hardMinArea: 11.5 },
    dining_room: { preferredMinArea: 10.5, hardMinArea: 7.5 },
  },
  apartment: {
    corridor: { preferredMinArea: 4.8, hardMinArea: 3.1, maxAspectRatio: 5.2, minSpan: 1.2 },
    living_room: { preferredMinArea: 16, hardMinArea: 12.5, minSpan: 3 },
    primary_bedroom: { preferredMinArea: 13, hardMinArea: 10 },
    bedroom: { preferredMinArea: 9, hardMinArea: 7.5 },
    kitchen: { preferredMinArea: 7, hardMinArea: 5 },
  },
  office: {
    corridor: {
      preferredMinArea: 7,
      hardMinArea: 4.5,
      maxAspectRatio: 6,
      minSpan: 1.35,
      preferNear: ['reception', 'open_office', 'meeting_room', 'bathroom', 'archive'],
    },
    reception: { preferredMinArea: 7, hardMinArea: 4.5 },
    open_office: {
      order: 4,
      areaWeight: 2.1,
      preferredMinArea: 30,
      hardMinArea: 22,
      minSpan: 4,
      preferNear: ['meeting_room', 'pantry', 'reception', 'archive'],
    },
    meeting_room: { order: 7, preferredMinArea: 14, hardMinArea: 10, minSpan: 2.8 },
    pantry: { preferredMinArea: 4.5, hardMinArea: 3 },
    archive: { preferredMinArea: 6, hardMinArea: 4.2 },
  },
  shop: {
    display_area: {
      order: 4,
      areaWeight: 1.8,
      preferredMinArea: 22,
      hardMinArea: 16,
      minSpan: 3.4,
      preferNear: ['cashier', 'retail_area', 'storage'],
    },
    retail_area: {
      order: 4,
      areaWeight: 1.85,
      preferredMinArea: 24,
      hardMinArea: 18,
      minSpan: 3.6,
      preferNear: ['cashier', 'display_area', 'storage'],
    },
    cashier: { order: 5, preferredMinArea: 5, hardMinArea: 3.2, minSpan: 1.6 },
    storage: { preferredMinArea: 7, hardMinArea: 4.5 },
    production: { order: 6, preferredMinArea: 18, hardMinArea: 13, minSpan: 3 },
  },
  hotel: {
    corridor: {
      preferredMinArea: 7.5,
      hardMinArea: 4.8,
      maxAspectRatio: 6.2,
      minSpan: 1.35,
      preferNear: ['reception', 'elevator', 'stairs', 'bedroom', 'bathroom'],
    },
    reception: { order: 0, preferredMinArea: 8, hardMinArea: 5 },
    living_room: { order: 4, preferredMinArea: 18, hardMinArea: 13, preferNear: ['dining_room', 'courtyard', 'reception'] },
    bedroom: { preferredMinArea: 12, hardMinArea: 9, minSpan: 2.6 },
    bathroom: { preferredMinArea: 4.5, hardMinArea: 3.1 },
  },
}

const RESIDENTIAL_RULE_FLOORS: Partial<
  Record<string, Pick<ProgramDrivenRoomRule, 'preferredMinArea' | 'hardMinArea' | 'minSpan'>>
> = {
  entry: { preferredMinArea: 3.2, hardMinArea: 2.4, minSpan: 1.4 },
  corridor: { preferredMinArea: 4.8, hardMinArea: 3.1, minSpan: 1.2 },
  dining_room: { preferredMinArea: 10.5, hardMinArea: 7.5, minSpan: 2.4 },
  kitchen: { preferredMinArea: 7, hardMinArea: 5, minSpan: 1.8 },
  bathroom: { preferredMinArea: 4, hardMinArea: 3.1, minSpan: 1.6 },
  primary_bedroom: { preferredMinArea: 14, hardMinArea: 11.5, minSpan: 2.75 },
  bedroom: { preferredMinArea: 9, hardMinArea: 7.5, minSpan: 2.15 },
}

export function getProgramLayoutRule(buildingType: AiBuildingType, programKey?: string) {
  const baseKey = programKey ?? 'room'
  const baseRule = DEFAULT_ROOM_RULES[baseKey] ?? rule(100, 1, 6, 4, 3, 1.8, [], [])
  const override = BUILDING_TYPE_OVERRIDES[buildingType]?.[baseKey]
  const nextRule = !override
    ? baseRule
    : {
        ...baseRule,
        ...override,
        preferNear: override.preferNear ?? baseRule.preferNear,
        avoidNear: override.avoidNear ?? baseRule.avoidNear,
      }

  return applyResidentialRuleFloors(buildingType, baseKey, nextRule)
}

function applyResidentialRuleFloors(
  buildingType: AiBuildingType,
  programKey: string,
  rule: ProgramDrivenRoomRule,
): ProgramDrivenRoomRule {
  if (
    buildingType !== 'villa' &&
    buildingType !== 'residential' &&
    buildingType !== 'apartment'
  ) {
    return rule
  }

  const floor = RESIDENTIAL_RULE_FLOORS[programKey]
  if (!floor) return rule

  return {
    ...rule,
    preferredMinArea: Math.max(rule.preferredMinArea, floor.preferredMinArea),
    hardMinArea: Math.max(rule.hardMinArea, floor.hardMinArea),
    minSpan: Math.max(rule.minSpan, floor.minSpan),
  }
}

function rule(
  order: number,
  areaWeight: number,
  preferredMinArea: number,
  hardMinArea: number,
  maxAspectRatio: number,
  minSpan: number,
  preferNear: string[],
  avoidNear: string[],
): ProgramDrivenRoomRule {
  return {
    order,
    areaWeight,
    preferredMinArea,
    hardMinArea,
    maxAspectRatio,
    minSpan,
    preferNear,
    avoidNear,
  }
}
