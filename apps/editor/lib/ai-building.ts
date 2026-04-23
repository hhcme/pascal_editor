'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type AssetInput,
  BuildingNode,
  CeilingNode,
  DoorNode,
  FenceNode,
  ItemNode,
  LevelNode,
  type MaterialSchema,
  RoofNode,
  RoofSegmentNode,
  resolveLevelId,
  SlabNode,
  StairNode,
  StairSegmentNode,
  useScene,
  WallNode,
  WindowNode,
  ZoneNode,
} from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'

export type AiBuildingLanguage = 'zh-CN' | 'en'
export type AiBuildingType = 'villa' | 'residential' | 'apartment' | 'shop' | 'office' | 'hotel'
export type AiBuildingStyle = 'modern' | 'newChinese' | 'minimal'
export type AiBuildingVariant = 'balanced' | 'courtyard' | 'daylight'

export type AiBuildingRequestedSpace = {
  key: string
  label?: string
  count: number
}

export type AiBuildingFormState = {
  buildingType: AiBuildingType
  style: AiBuildingStyle
  variant: AiBuildingVariant
  floors: number
  width: number
  depth: number
  prompt: string
  requestedSpaces?: AiBuildingRequestedSpace[]
}

export type AiBuildingMassingIntent = {
  asymmetry: boolean
  cantilever: boolean
  setbacks: boolean
  roofTerrace: boolean
  courtyard: boolean
  grandEntrance: boolean
  largeGlazing: boolean
}

type AiBuildingFeatureIntent = {
  roof: boolean
  ceiling: boolean
  stairs: boolean
  courtyard: boolean
  pool: boolean
  fencedGarden: boolean
  garage: boolean
  landscape: boolean
  furnish: boolean
  kitchen: boolean
  bathroom: boolean
  bedroom: boolean
  living: boolean
  terrace: boolean
}

export type AiBuildingBrief = {
  id: string
  title: string
  briefText: string
  designIntent: string
  massing: AiBuildingMassingIntent
  mustHave: string[]
  avoid: string[]
  floorProgram: string[]
  normalizedForm: AiBuildingFormState
}

type Point2D = [number, number]
type Point3D = [number, number, number]

type AiBuildingAssetId =
  | 'bathroom-sink'
  | 'bathtub'
  | 'bedside-table'
  | 'closet'
  | 'coffee-table'
  | 'dining-chair'
  | 'dining-table'
  | 'double-bed'
  | 'fridge'
  | 'kitchen-counter'
  | 'lounge-chair'
  | 'palm'
  | 'parking-spot'
  | 'patio-umbrella'
  | 'shower-square'
  | 'sofa'
  | 'stove'
  | 'sunbed'
  | 'television'
  | 'tesla'
  | 'toilet'
  | 'tree'
  | 'tv-stand'

type AiBuildingRoomPlan = {
  key: string
  name: string
  programKey?: string
  color: string
  polygon: Point2D[]
}

type AiBuildingWallPlan = {
  key: string
  name: string
  start: Point2D
  end: Point2D
  role: 'outer' | 'inner'
  exteriorMaterial?: MaterialSchema
  interiorMaterial?: MaterialSchema
}

type AiBuildingOpeningPlan = {
  kind: 'door' | 'window'
  wallKey: string
  name: string
  localX: number
  centerY: number
  width: number
  height: number
}

type AiBuildingCeilingPlan = {
  key: string
  name: string
  polygon: Point2D[]
  height: number
  material?: MaterialSchema
}

type AiBuildingDetailSlabPlan = {
  key: string
  name: string
  polygon: Point2D[]
  elevation: number
  material?: MaterialSchema
}

type AiBuildingFencePlan = {
  key: string
  start: Point2D
  end: Point2D
  height: number
  color: string
  style: 'slat' | 'rail' | 'privacy'
}

type AiBuildingItemPlan = {
  key: string
  assetId: AiBuildingAssetId
  position: Point3D
  rotation?: Point3D
  scale?: Point3D
}

type AiBuildingRoofPlan = {
  key: string
  roofType: 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat'
  position: Point3D
  width: number
  depth: number
  roofHeight: number
  material?: MaterialSchema
  wallMaterial?: MaterialSchema
}

type AiBuildingStairPlan = {
  key: string
  position: Point3D
  rotation: number
  width: number
  runLength: number
  totalRise: number
  stepCount: number
}

export type AiBuildingFloorPlan = {
  level: number
  label: string
  rooms: AiBuildingRoomPlan[]
  walls: AiBuildingWallPlan[]
  openings: AiBuildingOpeningPlan[]
  slabPolygon: Point2D[]
  slabMaterial?: MaterialSchema
  ceilings: AiBuildingCeilingPlan[]
  detailSlabs: AiBuildingDetailSlabPlan[]
  fences: AiBuildingFencePlan[]
  items: AiBuildingItemPlan[]
  roofs: AiBuildingRoofPlan[]
  stairs: AiBuildingStairPlan[]
  wallHeight: number
}

export type AiBuildingPlan = {
  id: string
  summary: string
  footprint: {
    width: number
    depth: number
  }
  floors: AiBuildingFloorPlan[]
}

export type SceneContext = {
  buildingId: string | null
  levelCount: number
  siteWidth: number | null
  siteDepth: number | null
}

export type AiBuildingBriefRequest = {
  form: AiBuildingFormState
  language: AiBuildingLanguage
  sceneContext: SceneContext
}

export type AiBuildingBriefResponse = {
  provider: 'codex-debug'
  brief: AiBuildingBrief
}

export type AiBuildingPlanRequest = {
  brief: AiBuildingBrief
  language: AiBuildingLanguage
  sceneContext: SceneContext
}

export type AiBuildingPlanResponse = {
  provider: 'codex-debug'
  plan: AiBuildingPlan
  brief: AiBuildingBrief
  normalizedForm: AiBuildingFormState
}

export type AiBuildingApiResponse = AiBuildingPlanResponse

const AI_BUILDING_SOURCE = 'ai-building:v1'
export const MIN_DIMENSION = 6
export const MAX_DIMENSION = 28
const WALL_THICKNESS = 0.2
const ROOM_COLORS = [
  '#0ea5e9',
  '#22c55e',
  '#f97316',
  '#a855f7',
  '#eab308',
  '#14b8a6',
  '#ef4444',
  '#6366f1',
  '#84cc16',
  '#ec4899',
  '#06b6d4',
  '#f59e0b',
]
const ITEM_ASSETS = {
  'bathroom-sink': asset('bathroom-sink', 'bathroom', 'Bathroom Sink', [2, 1, 1.5], {
    offset: [0.11, 0, 0.02],
  }),
  bathtub: asset('bathtub', 'bathroom', 'Bathtub', [2.5, 0.8, 1.5], {
    offset: [0, 0, 0.01],
  }),
  'bedside-table': asset('bedside-table', 'furniture', 'Bedside Table', [0.5, 0.5, 0.5], {
    offset: [0, 0, -0.01],
  }),
  closet: asset('closet', 'furniture', 'Closet', [2, 2.5, 1], {
    offset: [0, 0, -0.01],
  }),
  'coffee-table': asset('coffee-table', 'furniture', 'Coffee Table', [2, 0.4, 1.5]),
  'dining-chair': asset('dining-chair', 'furniture', 'Dining Chair', [0.5, 1, 0.5]),
  'dining-table': asset('dining-table', 'furniture', 'Dining Table', [2.5, 0.8, 1], {
    offset: [0, 0, -0.01],
  }),
  'double-bed': asset('double-bed', 'furniture', 'Double Bed', [2, 0.8, 2.5], {
    offset: [0, 0, -0.03],
  }),
  fridge: asset('fridge', 'kitchen', 'Fridge', [1, 2, 1], {
    offset: [0.01, 0, -0.05],
  }),
  'kitchen-counter': asset('kitchen-counter', 'kitchen', 'Kitchen Counter', [2, 0.8, 1]),
  'lounge-chair': asset('lounge-chair', 'furniture', 'Lounge Chair', [1, 1.1, 1.5], {
    offset: [0, 0, 0.09],
  }),
  palm: asset('palm', 'outdoor', 'Palm', [1, 4.5, 1], {
    offset: [0, 0, 0.02],
    scale: [0.37, 0.37, 0.37],
  }),
  'parking-spot': asset('parking-spot', 'outdoor', 'Parking Spot', [2.6, 0.06, 5]),
  'patio-umbrella': asset('patio-umbrella', 'outdoor', 'Patio Umbrella', [0.5, 3.7, 0.5]),
  'shower-square': asset('shower-square', 'bathroom', 'Squared Shower', [1, 2, 1], {
    offset: [0.41, 0, -0.42],
  }),
  sofa: asset('sofa', 'furniture', 'Sofa', [2.5, 0.8, 1.5], {
    offset: [0, 0, 0.04],
  }),
  stove: asset('stove', 'kitchen', 'Stove', [1, 1, 1], {
    offset: [0, 0, -0.05],
  }),
  sunbed: asset('sunbed', 'outdoor', 'Sunbed', [1, 1.2, 1.5], {
    offset: [0, 0.04, 0],
  }),
  television: asset('television', 'appliance', 'Television', [2, 1.1, 0.5]),
  tesla: asset('tesla', 'outdoor', 'Tesla', [2, 1.7, 5]),
  toilet: asset('toilet', 'bathroom', 'Toilet', [1, 0.9, 1], {
    offset: [0, 0, -0.23],
  }),
  tree: asset('tree', 'outdoor', 'Tree', [1, 5, 1], {
    offset: [-0.02, 0.17, -0.04],
    scale: [0.65, 0.65, 0.65],
  }),
  'tv-stand': asset('tv-stand', 'furniture', 'TV Stand', [2, 0.4, 0.5], {
    offset: [0, 0.21, 0],
  }),
} satisfies Record<AiBuildingAssetId, AssetInput>
export const AI_BUILDING_TYPE_OPTIONS: AiBuildingType[] = [
  'villa',
  'residential',
  'apartment',
  'shop',
  'office',
  'hotel',
]

export const COPY = {
  'zh-CN': {
    title: 'AI建房',
    projectContext: '当前场地',
    type: '建筑类型',
    style: '建筑风格',
    floors: '层数',
    width: '宽',
    depth: '深',
    prompt: '描述',
    brief: '设计 Brief',
    plan: '方案',
    apply: '应用到当前项目',
    regenerate: '生成方案',
    generateBrief: '生成提示词',
    generatePlan: '生成方案',
    applied: (wallCount: number, floorCount: number) =>
      `已生成 ${floorCount} 层、${wallCount} 面墙体`,
    noBuilding: '未找到建筑，已创建默认建筑',
    replaceHint: '再次应用会替换上一次 AI 生成内容，手工内容会保留。',
    siteFallback: '未读取到场地尺寸，使用 30m x 30m 默认场地。',
    meters: 'm',
    rooms: '房间',
    openings: '门窗',
    walls: '墙体',
    details: '细节',
    floorsUnit: '层',
    variants: {
      balanced: '均衡',
      courtyard: '庭院',
      daylight: '采光',
    },
    buildingTypes: {
      villa: '别墅',
      residential: '住宅',
      apartment: '公寓',
      shop: '商铺',
      office: '办公',
      hotel: '酒店',
    },
    styles: {
      modern: '现代',
      newChinese: '新中式',
      minimal: '极简',
    },
    defaultPrompt: '三层现代住宅，一层客餐厨，二层卧室，顶层露台，南向采光。',
    provider: 'Codex 调试 API',
    generating: '正在调用 Codex 调试 API...',
    generatingBrief: '正在生成设计 Brief...',
    generatingPlan: '正在生成建筑方案...',
    briefPlaceholder: '先生成提示词，再在这里微调设计 Brief。',
    briefGenerated: '已生成可编辑设计 Brief',
    briefRequired: '请先生成或确认设计 Brief',
    generated: '已返回调试 AI 方案',
    planRequired: '请先生成方案',
    generateFailed: '调试 AI 方案生成失败',
  },
  en: {
    title: 'AI Build',
    projectContext: 'Site',
    type: 'Building Type',
    style: 'Style',
    floors: 'Floors',
    width: 'Width',
    depth: 'Depth',
    prompt: 'Prompt',
    brief: 'Design Brief',
    plan: 'Plan',
    apply: 'Apply to Project',
    regenerate: 'Generate Plan',
    generateBrief: 'Generate Brief',
    generatePlan: 'Generate Plan',
    applied: (wallCount: number, floorCount: number) =>
      `Generated ${floorCount} floors and ${wallCount} walls`,
    noBuilding: 'No building found. A default building was created.',
    replaceHint: 'Applying again replaces the previous AI-generated structure only.',
    siteFallback: 'No site dimensions found. Using the default 30m x 30m site.',
    meters: 'm',
    rooms: 'Rooms',
    openings: 'Openings',
    walls: 'Walls',
    details: 'Details',
    floorsUnit: 'floors',
    variants: {
      balanced: 'Balanced',
      courtyard: 'Courtyard',
      daylight: 'Daylight',
    },
    buildingTypes: {
      villa: 'Villa',
      residential: 'Residential',
      apartment: 'Apartment',
      shop: 'Retail',
      office: 'Office',
      hotel: 'Hotel',
    },
    styles: {
      modern: 'Modern',
      newChinese: 'New Chinese',
      minimal: 'Minimal',
    },
    defaultPrompt:
      'Three-floor modern residence with living and dining on level one, bedrooms above, and a roof terrace.',
    provider: 'Codex Debug API',
    generating: 'Calling Codex Debug API...',
    generatingBrief: 'Generating design brief...',
    generatingPlan: 'Generating building plan...',
    briefPlaceholder: 'Generate a prompt first, then refine the design brief here.',
    briefGenerated: 'Editable design brief generated',
    briefRequired: 'Generate or confirm the design brief first',
    generated: 'Debug AI plan returned',
    planRequired: 'Generate a plan first',
    generateFailed: 'Debug AI plan failed',
  },
} satisfies Record<
  AiBuildingLanguage,
  {
    title: string
    projectContext: string
    type: string
    style: string
    floors: string
    width: string
    depth: string
    prompt: string
    brief: string
    plan: string
    apply: string
    regenerate: string
    generateBrief: string
    generatePlan: string
    applied: (wallCount: number, floorCount: number) => string
    noBuilding: string
    replaceHint: string
    siteFallback: string
    meters: string
    rooms: string
    openings: string
    walls: string
    details: string
    floorsUnit: string
    variants: Record<AiBuildingVariant, string>
    buildingTypes: Record<AiBuildingType, string>
    styles: Record<AiBuildingStyle, string>
    defaultPrompt: string
    provider: string
    generating: string
    generatingBrief: string
    generatingPlan: string
    briefPlaceholder: string
    briefGenerated: string
    briefRequired: string
    generated: string
    planRequired: string
    generateFailed: string
  }
>

export type AiBuildingCopy = (typeof COPY)[AiBuildingLanguage]

export function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function parseNumberInput(value: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseFloat(value)
  return clampNumber(Number.isFinite(parsed) ? parsed : fallback, min, max)
}

function asset(
  id: AiBuildingAssetId,
  category: string,
  name: string,
  dimensions: Point3D,
  options: Partial<Pick<AssetInput, 'offset' | 'rotation' | 'scale' | 'tags'>> = {},
): AssetInput {
  return {
    id,
    category,
    name,
    thumbnail: `/items/${id}/thumbnail.webp`,
    src: `/items/${id}/model.glb`,
    dimensions,
    ...options,
  }
}

function material(
  color: string,
  roughness = 0.75,
  metalness = 0,
  opacity = 1,
  side: 'front' | 'back' | 'double' = opacity < 1 ? 'double' : 'front',
): MaterialSchema {
  return {
    preset: 'custom',
    properties: {
      color,
      roughness,
      metalness,
      opacity,
      transparent: opacity < 1,
      side,
    },
  }
}

function waitForDebugApiLatency() {
  return new Promise((resolve) => window.setTimeout(resolve, 280))
}

function inferBuildingTypeFromPrompt(prompt: string, fallback: AiBuildingType): AiBuildingType {
  const normalizedPrompt = prompt.toLowerCase()
  if (/别墅|villa|house/.test(normalizedPrompt)) return 'villa'
  if (/公寓|apartment|flat/.test(normalizedPrompt)) return 'apartment'
  if (/酒店|hotel|民宿|guesthouse/.test(normalizedPrompt)) return 'hotel'
  if (/商铺|门店|零售|shop|store|retail/.test(normalizedPrompt)) return 'shop'
  if (/办公|office|工作室|studio/.test(normalizedPrompt)) return 'office'
  if (/住宅|residential|home/.test(normalizedPrompt)) return 'residential'
  return fallback
}

function normalizeAiBuildingFormForDebugApi(
  form: AiBuildingFormState,
  sceneContext: SceneContext,
): AiBuildingFormState {
  const siteWidth = sceneContext.siteWidth ?? 30
  const siteDepth = sceneContext.siteDepth ?? 30
  const buildingType = inferBuildingTypeFromPrompt(form.prompt, form.buildingType)
  const villaDefaults =
    buildingType === 'villa'
      ? {
          floors: Math.min(form.floors, 4),
          width: Math.min(form.width, siteWidth - 8),
          depth: Math.min(form.depth, siteDepth - 8),
          variant: form.variant === 'balanced' ? 'courtyard' : form.variant,
        }
      : {}

  return {
    ...form,
    ...villaDefaults,
    buildingType,
    floors: Math.round(clampNumber(villaDefaults.floors ?? form.floors, 1, 8)),
    width: clampNumber(
      villaDefaults.width ?? form.width,
      MIN_DIMENSION,
      Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, siteWidth - 2)),
    ),
    depth: clampNumber(
      villaDefaults.depth ?? form.depth,
      MIN_DIMENSION,
      Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, siteDepth - 2)),
    ),
  }
}

function inferMassingIntent(form: AiBuildingFormState): AiBuildingMassingIntent {
  const prompt = form.prompt.toLowerCase()
  return {
    asymmetry: /个性|异形|错落|不规则|雕塑|asym|sculptural|unique/.test(prompt),
    cantilever: /悬挑|挑檐|漂浮|cantilever|floating/.test(prompt),
    setbacks: /退台|错层|露台层|setback|stepped/.test(prompt),
    roofTerrace: /露台|屋顶|天台|terrace|roof/.test(prompt) || form.buildingType === 'villa',
    courtyard: form.variant === 'courtyard' || /庭院|院子|花园|courtyard|garden/.test(prompt),
    grandEntrance: /大门|门面|入口|门廊|前厅|grand|entrance|facade/.test(prompt),
    largeGlazing:
      form.variant === 'daylight' || /采光|落地窗|玻璃|幕墙|daylight|glazing|window/.test(prompt),
  }
}

function inferFeatureIntent(form: AiBuildingFormState): AiBuildingFeatureIntent {
  const prompt = form.prompt.toLowerCase()
  const isVilla = form.buildingType === 'villa'
  const isResidentialLike =
    isVilla || form.buildingType === 'residential' || form.buildingType === 'apartment'
  const asksComplete =
    /完整|丰富|详细|精装|软装|家具|陈设|室内|interior|furnish|furniture|complete|detailed/.test(
      prompt,
    )
  const wantsCourtyard =
    form.variant === 'courtyard' ||
    /庭院|院子|花园|景观|合院|courtyard|garden|landscape/.test(prompt)
  const wantsTerrace = /露台|阳台|屋顶|天台|terrace|balcony|roof\s*deck/.test(prompt)
  const wantsPool = /泳池|游泳池|水景|pool|swimming/.test(prompt)
  const wantsGarage = /车库|车位|停车|garage|parking|carport/.test(prompt)
  const wantsFence = /围栏|围墙|院墙|围合|fence|enclosed|wall enclosure/.test(prompt)
  const wantsStair = form.floors > 1 && !/不要楼梯|无楼梯|no stair/.test(prompt)

  return {
    roof: !/不要屋顶|无屋顶|no roof/.test(prompt),
    ceiling: !/不要吊顶|不要顶面|无吊顶|open ceiling|no ceiling/.test(prompt),
    stairs: wantsStair,
    courtyard: wantsCourtyard,
    pool: wantsPool,
    fencedGarden: wantsFence || (wantsCourtyard && /围合|私家庭院|enclosed|private/.test(prompt)),
    garage: wantsGarage,
    landscape: wantsCourtyard || /绿化|树|棕榈|植物|草坪|landscape|tree|plant|lawn/.test(prompt),
    furnish:
      isResidentialLike ||
      form.buildingType === 'hotel' ||
      asksComplete ||
      /卧室|客厅|餐厅|厨房|卫生间|浴室|套房|bedroom|living|dining|kitchen|bath/.test(prompt),
    kitchen: isResidentialLike || /厨房|餐厨|中厨|西厨|吧台|kitchen|pantry|island/.test(prompt),
    bathroom:
      isResidentialLike ||
      form.buildingType === 'hotel' ||
      /卫生间|卫浴|浴室|套卫|bath|restroom|toilet|powder/.test(prompt),
    bedroom: isResidentialLike || /卧室|主卧|套房|客房|bedroom|suite|guest room/.test(prompt),
    living: isResidentialLike || /客厅|起居|会客|family|living|lounge|great room/.test(prompt),
    terrace: wantsTerrace,
  }
}

function getBriefTitle(form: AiBuildingFormState, language: AiBuildingLanguage) {
  const copy = COPY[language]
  return language === 'zh-CN'
    ? `${copy.styles[form.style]}${copy.buildingTypes[form.buildingType]}设计提示词`
    : `${copy.styles[form.style]} ${copy.buildingTypes[form.buildingType]} design brief`
}

function getMassingNotes(massing: AiBuildingMassingIntent, language: AiBuildingLanguage) {
  const zhNotes = [
    massing.asymmetry ? '体块错落、有识别度' : null,
    massing.cantilever ? '可加入悬挑体块' : null,
    massing.setbacks ? '立面可做退台处理' : null,
    massing.roofTerrace ? '预留屋顶/顶层露台' : null,
    massing.courtyard ? '组织庭院或花园界面' : null,
    massing.grandEntrance ? '强化大门面与入口仪式感' : null,
    massing.largeGlazing ? '南向采光和大开窗优先' : null,
  ].filter((note): note is string => Boolean(note))

  const enNotes = [
    massing.asymmetry ? 'distinct asymmetric massing' : null,
    massing.cantilever ? 'optional cantilevered volume' : null,
    massing.setbacks ? 'stepped setbacks on the facade' : null,
    massing.roofTerrace ? 'roof or upper-level terrace' : null,
    massing.courtyard ? 'courtyard or garden edge' : null,
    massing.grandEntrance ? 'strong entrance and facade presence' : null,
    massing.largeGlazing ? 'south-facing daylight and large glazing' : null,
  ].filter((note): note is string => Boolean(note))

  return language === 'zh-CN' ? zhNotes : enNotes
}

function getFloorProgram(form: AiBuildingFormState, language: AiBuildingLanguage) {
  return Array.from({ length: form.floors }, (_, floorIndex) => {
    const label = language === 'zh-CN' ? `${floorIndex + 1}层` : `Level ${floorIndex + 1}`
    return `${label}: ${getRoomNames(form, floorIndex, language).join(' / ')}`
  })
}

function getBriefMustHave(
  form: AiBuildingFormState,
  massing: AiBuildingMassingIntent,
  language: AiBuildingLanguage,
) {
  const copy = COPY[language]
  const notes = getMassingNotes(massing, language)
  const base =
    language === 'zh-CN'
      ? [
          `${form.floors}层`,
          `控制在 ${form.width}m x ${form.depth}m 内`,
          `${copy.styles[form.style]}风格`,
          `${copy.variants[form.variant]}布局倾向`,
        ]
      : [
          `${form.floors} floors`,
          `within ${form.width}m x ${form.depth}m`,
          `${copy.styles[form.style]} style`,
          `${copy.variants[form.variant]} layout tendency`,
        ]

  const userPrompt = form.prompt.trim()
  if (userPrompt) {
    base.push(language === 'zh-CN' ? `用户原始要求：${userPrompt}` : `User request: ${userPrompt}`)
  }

  return [...base, ...notes]
}

function getBriefAvoid(language: AiBuildingLanguage) {
  return language === 'zh-CN'
    ? ['不要超出当前场地边界', '不要生成过密的小房间', '保持清晰交通核和主要入口']
    : [
        'Do not exceed the current site boundary',
        'Avoid overly dense tiny rooms',
        'Keep a clear core and main entry',
      ]
}

function buildBriefText({
  avoid,
  floorProgram,
  form,
  massing,
  mustHave,
  title,
  language,
}: {
  avoid: string[]
  floorProgram: string[]
  form: AiBuildingFormState
  massing: AiBuildingMassingIntent
  mustHave: string[]
  title: string
  language: AiBuildingLanguage
}) {
  const copy = COPY[language]
  const massingNotes = getMassingNotes(massing, language)
  const designIntent =
    language === 'zh-CN'
      ? `生成一个${copy.styles[form.style]}${copy.buildingTypes[form.buildingType]}，占地约 ${form.width}m x ${form.depth}m，共 ${form.floors} 层。重点是${massingNotes.length ? massingNotes.join('、') : copy.variants[form.variant]}。`
      : `Generate a ${copy.styles[form.style]} ${copy.buildingTypes[form.buildingType]}, about ${form.width}m x ${form.depth}m, with ${form.floors} floors. Focus on ${massingNotes.length ? massingNotes.join(', ') : copy.variants[form.variant]}.`

  const labels =
    language === 'zh-CN'
      ? {
          intent: '设计目标',
          program: '楼层功能',
          mustHave: '必须满足',
          avoid: '避免',
        }
      : {
          intent: 'Design Intent',
          program: 'Floor Program',
          mustHave: 'Must Have',
          avoid: 'Avoid',
        }

  return [
    title,
    '',
    `${labels.intent}: ${designIntent}`,
    '',
    labels.program,
    ...floorProgram.map((item) => `- ${item}`),
    '',
    labels.mustHave,
    ...mustHave.map((item) => `- ${item}`),
    '',
    labels.avoid,
    ...avoid.map((item) => `- ${item}`),
  ].join('\n')
}

function createAiBuildingBrief(
  normalizedForm: AiBuildingFormState,
  language: AiBuildingLanguage,
): AiBuildingBrief {
  const massing = inferMassingIntent(normalizedForm)
  const floorProgram = getFloorProgram(normalizedForm, language)
  const mustHave = getBriefMustHave(normalizedForm, massing, language)
  const avoid = getBriefAvoid(language)
  const title = getBriefTitle(normalizedForm, language)
  const briefText = buildBriefText({
    avoid,
    floorProgram,
    form: normalizedForm,
    massing,
    mustHave,
    title,
    language,
  })
  const designIntent = briefText.split('\n').find((line) => line.includes(':')) ?? title

  return {
    id: `brief-${normalizedForm.buildingType}-${normalizedForm.style}-${normalizedForm.variant}-${normalizedForm.floors}-${normalizedForm.width}-${normalizedForm.depth}`,
    title,
    briefText,
    designIntent,
    massing,
    mustHave,
    avoid,
    floorProgram,
    normalizedForm,
  }
}

export async function requestAiBuildingBrief({
  form,
  language,
  sceneContext,
}: AiBuildingBriefRequest): Promise<AiBuildingBriefResponse> {
  await waitForDebugApiLatency()

  const normalizedForm = normalizeAiBuildingFormForDebugApi(form, sceneContext)
  return {
    provider: 'codex-debug',
    brief: createAiBuildingBrief(normalizedForm, language),
  }
}

export async function requestAiBuildingPlan({
  brief,
  language,
  sceneContext,
}: AiBuildingPlanRequest): Promise<AiBuildingPlanResponse> {
  await waitForDebugApiLatency()

  const originalPrompt = brief.normalizedForm.prompt
  const normalizedForm = normalizeAiBuildingFormForDebugApi(
    {
      ...brief.normalizedForm,
      prompt: brief.briefText,
    },
    sceneContext,
  )
  const visibleForm = {
    ...normalizedForm,
    prompt: originalPrompt,
  }
  const planForm = {
    ...normalizedForm,
    prompt: brief.briefText,
  }
  const planBrief = {
    ...brief,
    briefText: brief.briefText,
    normalizedForm: visibleForm,
  }

  return {
    provider: 'codex-debug',
    plan: createPlan(planForm, language),
    brief: planBrief,
    normalizedForm: visibleForm,
  }
}

function getMetadata(node: AnyNode | undefined): Record<string, unknown> {
  const metadata = node?.metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

function isAiBuildingNode(node: AnyNode | undefined) {
  return getMetadata(node).source === AI_BUILDING_SOURCE
}

function resolveChildNode(child: unknown, nodes: Record<AnyNodeId, AnyNode>): AnyNode | null {
  if (typeof child === 'string') {
    return nodes[child as AnyNodeId] ?? null
  }
  return child && typeof child === 'object' && 'type' in child ? (child as AnyNode) : null
}

function getBuildingLevels(building: AnyNode | null, nodes: Record<AnyNodeId, AnyNode>) {
  if (!building || building.type !== 'building') return []
  return building.children
    .map((childId) => nodes[childId as AnyNodeId])
    .filter((node): node is LevelNode => node?.type === 'level')
    .sort((left, right) => left.level - right.level)
}

export function getSceneContext(
  nodes: Record<AnyNodeId, AnyNode>,
  rootNodeIds: AnyNodeId[],
  selectedBuildingId: string | null,
): SceneContext {
  const selectedBuilding =
    selectedBuildingId && nodes[selectedBuildingId as AnyNodeId]?.type === 'building'
      ? nodes[selectedBuildingId as AnyNodeId]
      : null

  const site = rootNodeIds.map((rootId) => nodes[rootId]).find((node) => node?.type === 'site') as
    | (AnyNode & { polygon?: { points?: Point2D[] }; children?: unknown[] })
    | undefined

  const firstBuilding =
    selectedBuilding ??
    site?.children
      ?.map((child) => resolveChildNode(child, nodes))
      .find((node) => node?.type === 'building') ??
    Object.values(nodes).find((node) => node.type === 'building') ??
    null

  const sitePoints = site?.polygon?.points ?? []
  const xs = sitePoints.map((point) => point[0])
  const zs = sitePoints.map((point) => point[1])
  const siteWidth = xs.length ? Math.max(...xs) - Math.min(...xs) : null
  const siteDepth = zs.length ? Math.max(...zs) - Math.min(...zs) : null

  return {
    buildingId: firstBuilding?.type === 'building' ? firstBuilding.id : null,
    levelCount: getBuildingLevels(firstBuilding, nodes).length,
    siteWidth,
    siteDepth,
  }
}

const MIN_ROOM_SLOTS_PER_FLOOR = 4
const MAX_ROOM_SLOTS_PER_FLOOR = 12
const MIN_ROOM_SPAN = 2.25

const REQUESTED_SPACE_LABELS: Record<string, { zh: string; en: string }> = {
  living_room: { zh: '客厅', en: 'Living Room' },
  dining_room: { zh: '餐厅', en: 'Dining Room' },
  kitchen: { zh: '厨房', en: 'Kitchen' },
  bedroom: { zh: '卧室', en: 'Bedroom' },
  primary_bedroom: { zh: '主卧', en: 'Primary Bedroom' },
  bathroom: { zh: '卫生间', en: 'Bathroom' },
  study: { zh: '书房', en: 'Study' },
  balcony: { zh: '阳台', en: 'Balcony' },
  open_office: { zh: '开放办公', en: 'Open Office' },
  meeting_room: { zh: '会议室', en: 'Meeting Room' },
  reception: { zh: '前台', en: 'Reception' },
  pantry: { zh: '茶水间', en: 'Pantry' },
  archive: { zh: '档案室', en: 'Archive' },
  retail_area: { zh: '营业区', en: 'Retail Area' },
  display_area: { zh: '展示区', en: 'Display Area' },
  cashier: { zh: '收银区', en: 'Cashier' },
  storage: { zh: '仓储', en: 'Storage' },
  production: { zh: '生产区', en: 'Production Area' },
  equipment_room: { zh: '设备间', en: 'Mechanical Room' },
  entry: { zh: '入口', en: 'Entry' },
  corridor: { zh: '走廊', en: 'Corridor' },
  stairs: { zh: '楼梯', en: 'Stairs' },
  elevator: { zh: '电梯', en: 'Elevator' },
  garage: { zh: '车库', en: 'Garage' },
}

const REQUESTED_SPACE_PRIORITY: Record<string, number> = {
  entry: 0,
  reception: 1,
  living_room: 2,
  retail_area: 2,
  display_area: 3,
  production: 3,
  open_office: 3,
  kitchen: 4,
  dining_room: 5,
  meeting_room: 6,
  primary_bedroom: 7,
  bedroom: 8,
  bathroom: 9,
  pantry: 10,
  cashier: 11,
  study: 12,
  storage: 13,
  archive: 14,
  equipment_room: 15,
  garage: 16,
  stairs: 17,
  elevator: 18,
  balcony: 19,
  corridor: 20,
}

const GROUND_FLOOR_SPACE_KEYS = new Set([
  'entry',
  'reception',
  'living_room',
  'dining_room',
  'kitchen',
  'retail_area',
  'display_area',
  'cashier',
  'production',
  'open_office',
  'garage',
  'storage',
  'equipment_room',
  'stairs',
  'elevator',
  'corridor',
])

const UPPER_FLOOR_SPACE_KEYS = new Set(['primary_bedroom', 'bedroom', 'study'])
const TOP_FLOOR_SPACE_KEYS = new Set(['balcony'])

type RequestedRoomCandidate = {
  key: string
  name: string
  sourceIndex: number
  instanceIndex: number
  priority: number
}

type RoomProgram = {
  key: string
  name: string
  source: 'requested' | 'default'
}

type NormalizedRequestedSpace = AiBuildingRequestedSpace & {
  sourceIndex: number
}

function normalizeRequestedSpaceKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, '_')
}

function getRequestedSpaceLabel(space: AiBuildingRequestedSpace, language: AiBuildingLanguage) {
  const key = normalizeRequestedSpaceKey(space.key)
  const catalogLabel = REQUESTED_SPACE_LABELS[key]
  if (catalogLabel) return language === 'en' ? catalogLabel.en : catalogLabel.zh

  const customLabel = typeof space.label === 'string' ? space.label.trim() : ''
  return customLabel || key.replace(/_/g, ' ')
}

function getNormalizedRequestedSpaces(form: AiBuildingFormState): NormalizedRequestedSpace[] {
  const spaces: NormalizedRequestedSpace[] = []

  for (const [sourceIndex, space] of (form.requestedSpaces ?? []).entries()) {
    const key = normalizeRequestedSpaceKey(space.key)
    const count = Math.round(clampNumber(Number(space.count), 0, 20))
    if (!key || count <= 0) continue
    spaces.push({
      key,
      label: space.label,
      count,
      sourceIndex,
    })
  }

  return spaces
}

function getRequestedRoomCandidates(
  form: AiBuildingFormState,
  language: AiBuildingLanguage,
): RequestedRoomCandidate[] {
  return getNormalizedRequestedSpaces(form)
    .flatMap((space) =>
      Array.from({ length: space.count }, (_, instanceIndex) => {
        const baseName = getRequestedSpaceLabel(space, language)
        return {
          key: space.key,
          name:
            space.count > 1
              ? language === 'zh-CN'
                ? `${baseName}${instanceIndex + 1}`
                : `${baseName} ${instanceIndex + 1}`
              : baseName,
          sourceIndex: space.sourceIndex,
          instanceIndex,
          priority: REQUESTED_SPACE_PRIORITY[space.key] ?? 100,
        }
      }),
    )
    .sort(
      (a, b) =>
        a.instanceIndex - b.instanceIndex ||
        a.priority - b.priority ||
        a.sourceIndex - b.sourceIndex,
    )
}

function getPreferredFloorIndexes(spaceKey: string, form: AiBuildingFormState) {
  const floorCount = Math.max(1, Math.round(form.floors))
  const floorIndexes = Array.from({ length: floorCount }, (_, index) => index)
  if (floorCount === 1) return floorIndexes

  const upperFloorIndexes = floorIndexes.slice(1)
  const isResidentialLike =
    form.buildingType === 'villa' ||
    form.buildingType === 'residential' ||
    form.buildingType === 'apartment' ||
    form.buildingType === 'hotel'

  if (TOP_FLOOR_SPACE_KEYS.has(spaceKey)) {
    const topFloorIndex = floorCount - 1
    return [topFloorIndex, ...floorIndexes.filter((index) => index !== topFloorIndex)]
  }

  if (UPPER_FLOOR_SPACE_KEYS.has(spaceKey) || (spaceKey === 'bathroom' && isResidentialLike)) {
    return [...upperFloorIndexes, 0]
  }

  if (GROUND_FLOOR_SPACE_KEYS.has(spaceKey)) {
    return [0, ...upperFloorIndexes]
  }

  return floorIndexes
}

function getRoomGridCapacity(form: AiBuildingFormState) {
  const maxColumns = Math.max(1, Math.floor(form.width / MIN_ROOM_SPAN))
  const maxRows = Math.max(1, Math.floor(form.depth / MIN_ROOM_SPAN))
  return Math.max(
    MIN_ROOM_SLOTS_PER_FLOOR,
    Math.min(MAX_ROOM_SLOTS_PER_FLOOR, maxColumns * maxRows),
  )
}

function getRequestedRoomProgramsByFloor(form: AiBuildingFormState, language: AiBuildingLanguage) {
  const candidates = getRequestedRoomCandidates(form, language)
  const floorCount = Math.max(1, Math.round(form.floors))
  const floorIndexes = Array.from({ length: floorCount }, (_, index) => index)
  const roomLimit = getRoomGridCapacity(form)
  const roomsByFloor = floorIndexes.map(() => [] as RoomProgram[])

  for (const candidate of candidates) {
    const preferredFloorIndex =
      getPreferredFloorIndexes(candidate.key, form).find(
        (index) => (roomsByFloor[index]?.length ?? roomLimit) < roomLimit,
      ) ?? floorIndexes.find((index) => (roomsByFloor[index]?.length ?? roomLimit) < roomLimit)

    const floorRooms =
      preferredFloorIndex === undefined ? undefined : roomsByFloor[preferredFloorIndex]
    if (!floorRooms) continue
    floorRooms.push({
      key: candidate.key,
      name: candidate.name,
      source: 'requested',
    })
  }

  return roomsByFloor
}

function normalizeRoomNameForCompare(name: string) {
  return name.toLowerCase().replace(/\s+/g, '')
}

function inferRoomProgramKey(name: string) {
  const normalized = normalizeRoomNameForCompare(name)

  if (/楼梯|stair/.test(normalized)) return 'stairs'
  if (/电梯|elevator|lift/.test(normalized)) return 'elevator'
  if (/车库|garage/.test(normalized)) return 'garage'
  if (/卫|浴|bath|restroom|toilet|powder/.test(normalized)) return 'bathroom'
  if (/主卧|主套|primary|suite/.test(normalized)) return 'primary_bedroom'
  if (/卧|客房|bedroom|guestroom/.test(normalized)) return 'bedroom'
  if (/餐|厨|kitchen|dining|pantry|cafe/.test(normalized)) return 'kitchen'
  if (/客厅|起居|家庭厅|会客|living|lounge|family/.test(normalized)) return 'living_room'
  if (/书房|studio|study|focus/.test(normalized)) return 'study'
  if (/露台|阳台|庭院|花园|terrace|balcony|courtyard|garden/.test(normalized)) return 'balcony'
  if (/开放办公|团队办公|office|workspace|work/.test(normalized)) return 'open_office'
  if (/会议|meeting/.test(normalized)) return 'meeting_room'
  if (/前台|门厅|大堂|lobby|entry|reception/.test(normalized)) return 'entry'
  if (/展示|陈列|营业|showroom|display|retail/.test(normalized)) return 'display_area'
  if (/收银|cashier/.test(normalized)) return 'cashier'
  if (/库|仓储|storage|archive/.test(normalized)) return 'storage'
  if (/生产|production/.test(normalized)) return 'production'
  if (/设备|服务|后勤|service|mechanical/.test(normalized)) return 'equipment_room'

  return 'room'
}

function hasOverlappingRoomProgram(programs: RoomProgram[], fallbackProgram: RoomProgram) {
  const normalizedFallback = normalizeRoomNameForCompare(fallbackProgram.name)
  return programs.some((program) => {
    if (program.key === fallbackProgram.key) return true

    const normalizedName = normalizeRoomNameForCompare(program.name)
    return (
      normalizedName === normalizedFallback ||
      normalizedName.includes(normalizedFallback) ||
      normalizedFallback.includes(normalizedName)
    )
  })
}

function mergeRequestedAndDefaultRoomPrograms(
  requestedPrograms: RoomProgram[],
  defaultPrograms: RoomProgram[],
  roomLimit: number,
) {
  const targetRoomCount = requestedPrograms.length
    ? Math.min(roomLimit, Math.max(MIN_ROOM_SLOTS_PER_FLOOR, requestedPrograms.length))
    : Math.min(roomLimit, MIN_ROOM_SLOTS_PER_FLOOR)
  const programs = requestedPrograms.slice(0, roomLimit)

  for (const fallbackProgram of defaultPrograms) {
    if (programs.length >= targetRoomCount) break
    if (!hasOverlappingRoomProgram(programs, fallbackProgram)) {
      programs.push(fallbackProgram)
    }
  }

  for (const fallbackProgram of defaultPrograms) {
    if (programs.length >= targetRoomCount) break
    programs.push(fallbackProgram)
  }

  return programs.slice(0, targetRoomCount)
}

function getDefaultRoomNames(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
) {
  const prompt = form.prompt.toLowerCase()
  const wantsGarage = /车库|garage/.test(prompt)
  const wantsTerrace = /露台|terrace|roof/.test(prompt)
  const wantsCourtyard = form.variant === 'courtyard' || /庭院|院子|courtyard/.test(prompt)
  const isTopFloor = floorIndex === form.floors - 1

  if (language === 'en') {
    if (form.buildingType === 'villa') {
      if (isTopFloor && wantsTerrace) {
        return ['Suite', 'Studio', 'Roof Terrace', 'Stair']
      }
      return floorIndex === 0
        ? [wantsGarage ? 'Garage' : 'Living', 'Dining Kitchen', 'Garden Room', 'Stair']
        : ['Primary Suite', 'Bedroom', 'Family Lounge', 'Bathroom']
    }
    if (form.buildingType === 'apartment') {
      return floorIndex === 0
        ? ['Lobby', 'Apartment A', 'Apartment B', 'Stair']
        : ['Apartment A', 'Apartment B', 'Shared Lounge', 'Services']
    }
    if (form.buildingType === 'shop') {
      return floorIndex === 0
        ? ['Showroom', 'Cashier', 'Storage', 'Restroom']
        : ['Display', 'Office', 'Pantry', 'Stair']
    }
    if (form.buildingType === 'office') {
      return floorIndex === 0
        ? ['Lobby', 'Open Office', 'Meeting', 'Pantry']
        : ['Team Office', 'Focus Room', 'Meeting', 'Restroom']
    }
    if (form.buildingType === 'hotel') {
      return floorIndex === 0
        ? ['Lobby', 'Cafe', 'Service', 'Restroom']
        : ['Guest Room', 'Guest Room', 'Lounge', 'Services']
    }

    if (isTopFloor && wantsTerrace) {
      return ['Bedroom', 'Studio', 'Roof Terrace', 'Stair']
    }
    if (floorIndex === 0) {
      return [
        wantsGarage ? 'Garage' : 'Living',
        'Dining Kitchen',
        wantsCourtyard ? 'Courtyard' : 'Guest Room',
        'Stair',
      ]
    }
    return ['Primary Bedroom', 'Bedroom', 'Family Room', 'Restroom']
  }

  if (form.buildingType === 'villa') {
    if (isTopFloor && wantsTerrace) {
      return ['套房', '书房', '屋顶露台', '楼梯间']
    }
    return floorIndex === 0
      ? [wantsGarage ? '车库' : '客厅', '餐厨', '花园房', '楼梯间']
      : ['主套房', '卧室', '家庭厅', '卫浴']
  }
  if (form.buildingType === 'apartment') {
    return floorIndex === 0
      ? ['门厅', '公寓 A', '公寓 B', '楼梯间']
      : ['公寓 A', '公寓 B', '共享厅', '设备间']
  }
  if (form.buildingType === 'shop') {
    return floorIndex === 0
      ? ['展示区', '收银区', '库房', '卫生间']
      : ['陈列区', '办公室', '茶水间', '楼梯间']
  }
  if (form.buildingType === 'office') {
    return floorIndex === 0
      ? ['门厅', '开放办公', '会议室', '茶水间']
      : ['团队办公', '专注室', '会议室', '卫生间']
  }
  if (form.buildingType === 'hotel') {
    return floorIndex === 0
      ? ['大堂', '咖啡区', '后勤', '卫生间']
      : ['客房', '客房', '休息厅', '服务间']
  }

  if (isTopFloor && wantsTerrace) {
    return ['卧室', '书房', '露台', '楼梯间']
  }
  if (floorIndex === 0) {
    return [wantsGarage ? '车库' : '客厅', '餐厨', wantsCourtyard ? '庭院' : '客房', '楼梯间']
  }
  return ['主卧', '次卧', '家庭厅', '卫生间']
}

function getDefaultRoomPrograms(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
): RoomProgram[] {
  return getDefaultRoomNames(form, floorIndex, language).map((name) => ({
    key: inferRoomProgramKey(name),
    name,
    source: 'default',
  }))
}

function getRoomPrograms(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
) {
  const defaultPrograms = getDefaultRoomPrograms(form, floorIndex, language)
  const requestedPrograms = getRequestedRoomProgramsByFloor(form, language)[floorIndex] ?? []

  return mergeRequestedAndDefaultRoomPrograms(
    requestedPrograms,
    defaultPrograms,
    getRoomGridCapacity(form),
  )
}

function getRoomNames(form: AiBuildingFormState, floorIndex: number, language: AiBuildingLanguage) {
  return getRoomPrograms(form, floorIndex, language).map((program) => program.name)
}

function rect(minX: number, minZ: number, maxX: number, maxZ: number): Point2D[] {
  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ]
}

function getRoomColor(index: number) {
  return ROOM_COLORS[index % ROOM_COLORS.length] ?? ROOM_COLORS[0]!
}

function safeRoomKeyPart(value: string) {
  return (
    normalizeRequestedSpaceKey(value)
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'room'
  )
}

function createEvenBreakpoints(min: number, max: number, count: number) {
  return Array.from({ length: count + 1 }, (_, index) => min + ((max - min) * index) / count)
}

function createColumnBreakpoints(
  minX: number,
  maxX: number,
  count: number,
  form: AiBuildingFormState,
) {
  if (count === 2 && form.variant === 'courtyard') {
    const splitX = clampNumber(-form.width * 0.12, minX + MIN_ROOM_SPAN, maxX - MIN_ROOM_SPAN)
    return [minX, splitX, maxX]
  }

  return createEvenBreakpoints(minX, maxX, count)
}

function createRowBreakpoints(
  minZ: number,
  maxZ: number,
  count: number,
  form: AiBuildingFormState,
) {
  if (count === 2 && form.variant === 'daylight') {
    const splitZ = clampNumber(form.depth * 0.08, minZ + MIN_ROOM_SPAN, maxZ - MIN_ROOM_SPAN)
    return [minZ, splitZ, maxZ]
  }

  return createEvenBreakpoints(minZ, maxZ, count)
}

function getRoomRowCounts(roomCount: number, form: AiBuildingFormState) {
  const maxColumns = Math.max(1, Math.floor(form.width / MIN_ROOM_SPAN))
  const maxRows = Math.max(1, Math.floor(form.depth / MIN_ROOM_SPAN))
  const boundedRoomCount = Math.max(1, Math.min(roomCount, getRoomGridCapacity(form)))
  const minRowsForColumns = Math.ceil(boundedRoomCount / maxColumns)
  const aspectRows = Math.round(
    Math.sqrt((boundedRoomCount * form.depth) / Math.max(form.width, MIN_ROOM_SPAN)),
  )
  const rowCount = Math.min(boundedRoomCount, maxRows, Math.max(1, minRowsForColumns, aspectRows))
  const baseCount = Math.floor(boundedRoomCount / rowCount)
  const remainder = boundedRoomCount % rowCount

  return Array.from(
    { length: rowCount },
    (_, index) => baseCount + (index >= rowCount - remainder ? 1 : 0),
  ).filter((count) => count > 0)
}

function createInteriorWall(
  key: string,
  name: string,
  start: Point2D,
  end: Point2D,
): AiBuildingWallPlan {
  return {
    key,
    name,
    start,
    end,
    role: 'inner',
  }
}

function createRoomLayout(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
) {
  const roomPrograms = getRoomPrograms(form, floorIndex, language)
  const rowCounts = getRoomRowCounts(roomPrograms.length, form)
  const rowEdges = createRowBreakpoints(minZ, maxZ, rowCounts.length, form)
  const partitionName = language === 'zh-CN' ? 'AI 隔墙' : 'AI Partition'
  const rooms: AiBuildingRoomPlan[] = []
  const walls: AiBuildingWallPlan[] = []
  let roomIndex = 0

  for (let rowIndex = 0; rowIndex < rowCounts.length; rowIndex += 1) {
    const rowMinZ = rowEdges[rowIndex] ?? minZ
    const rowMaxZ = rowEdges[rowIndex + 1] ?? maxZ
    const columnCount = rowCounts[rowIndex] ?? 1
    const columnEdges = createColumnBreakpoints(minX, maxX, columnCount, form)

    if (rowIndex > 0) {
      walls.push(
        createInteriorWall(
          `divider-row-${rowIndex}`,
          partitionName,
          [minX, rowMinZ],
          [maxX, rowMinZ],
        ),
      )
    }

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const columnMinX = columnEdges[columnIndex] ?? minX
      const columnMaxX = columnEdges[columnIndex + 1] ?? maxX
      const program = roomPrograms[roomIndex] ?? {
        key: 'room',
        name: language === 'zh-CN' ? '房间' : 'Room',
        source: 'default' as const,
      }

      if (columnIndex > 0) {
        walls.push(
          createInteriorWall(
            `divider-row-${rowIndex}-col-${columnIndex}`,
            partitionName,
            [columnMinX, rowMinZ],
            [columnMinX, rowMaxZ],
          ),
        )
      }

      rooms.push({
        key: `${safeRoomKeyPart(program.key)}-${roomIndex + 1}`,
        name: program.name,
        programKey: program.key,
        color: getRoomColor(roomIndex),
        polygon: rect(columnMinX, rowMinZ, columnMaxX, rowMaxZ),
      })
      roomIndex += 1
    }
  }

  return { rooms, walls }
}

function createWallPositions(length: number, count: number) {
  return Array.from({ length: count }, (_, index) => (length * (index + 1)) / (count + 1))
}

function createPlanOpenings(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
  walls: AiBuildingWallPlan[],
): AiBuildingOpeningPlan[] {
  const openings: AiBuildingOpeningPlan[] = []
  const doorName = language === 'zh-CN' ? '室内门' : 'Interior Door'
  const windowLabels =
    language === 'zh-CN'
      ? { south: '南窗', north: '北窗', side: '侧窗' }
      : { south: 'South Window', north: 'North Window', side: 'Side Window' }

  if (floorIndex === 0) {
    openings.push({
      kind: 'door',
      wallKey: 'south',
      name: language === 'zh-CN' ? '入户门' : 'Entry Door',
      localX: form.width / 2,
      centerY: 1.05,
      width: 0.9,
      height: 2.1,
    })
  }

  for (const wall of walls.filter((entry) => entry.role === 'inner')) {
    const length = getWallLength(wall)
    if (length < 1.5) continue

    openings.push({
      kind: 'door',
      wallKey: wall.key,
      name: doorName,
      localX: length / 2,
      centerY: 1.05,
      width: 0.85,
      height: 2.05,
    })
  }

  for (const localX of createWallPositions(
    form.width,
    Math.min(3, Math.max(1, Math.floor(form.width / 5))),
  )) {
    openings.push({
      kind: 'window',
      wallKey: 'south',
      name: windowLabels.south,
      localX,
      centerY: 1.45,
      width: 1.35,
      height: 1.15,
    })
  }

  for (const localX of createWallPositions(
    form.width,
    Math.min(2, Math.max(1, Math.floor(form.width / 7))),
  )) {
    openings.push({
      kind: 'window',
      wallKey: 'north',
      name: windowLabels.north,
      localX,
      centerY: 1.45,
      width: 1.2,
      height: 1.1,
    })
  }

  for (const localX of createWallPositions(
    form.depth,
    Math.min(2, Math.max(1, Math.floor(form.depth / 7))),
  )) {
    openings.push({
      kind: 'window',
      wallKey: form.variant === 'daylight' ? 'east' : 'west',
      name: windowLabels.side,
      localX,
      centerY: 1.45,
      width: 1.2,
      height: 1.1,
    })
  }

  return openings
}

function getStairAnchorRoom(rooms: AiBuildingRoomPlan[]) {
  return (
    rooms.find((room) => room.programKey === 'stairs') ??
    rooms.find((room) => room.programKey === 'entry' || room.programKey === 'corridor') ??
    rooms.at(-1)
  )
}

function getRoomBounds(room: AiBuildingRoomPlan) {
  const xs = room.polygon.map((point) => point[0])
  const zs = room.polygon.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function roomPoint(room: AiBuildingRoomPlan, xRatio: number, zRatio: number): Point3D {
  const bounds = getRoomBounds(room)
  return [
    bounds.minX + (bounds.maxX - bounds.minX) * xRatio,
    0,
    bounds.minZ + (bounds.maxZ - bounds.minZ) * zRatio,
  ]
}

function itemPlan(
  key: string,
  assetId: AiBuildingAssetId,
  position: Point3D,
  options: Pick<AiBuildingItemPlan, 'rotation' | 'scale'> = {},
): AiBuildingItemPlan {
  return {
    key,
    assetId,
    position,
    ...options,
  }
}

function hasRoomMeaning(room: AiBuildingRoomPlan, pattern: RegExp) {
  return pattern.test(room.name.toLowerCase())
}

function createRoomItemPlans(
  form: AiBuildingFormState,
  intent: AiBuildingFeatureIntent,
  floorIndex: number,
  room: AiBuildingRoomPlan,
): AiBuildingItemPlan[] {
  if (!intent.furnish) return []

  const items: AiBuildingItemPlan[] = []
  const prefix = `${floorIndex}_${room.key}`
  const prompt = form.prompt.toLowerCase()
  const programKey = room.programKey ?? ''
  const isBedroom =
    programKey === 'bedroom' ||
    programKey === 'primary_bedroom' ||
    hasRoomMeaning(room, /卧|套房|客房|bedroom|suite|guest/)
  const isLiving =
    programKey === 'living_room' ||
    hasRoomMeaning(room, /客厅|起居|家庭厅|会客|living|lounge|great/)
  const isKitchen =
    programKey === 'kitchen' ||
    programKey === 'dining_room' ||
    programKey === 'pantry' ||
    hasRoomMeaning(room, /餐|厨|dining|kitchen|pantry|cafe/)
  const isBath =
    programKey === 'bathroom' || hasRoomMeaning(room, /卫|浴|卫生间|bath|restroom|toilet|powder/)
  const isTerrace =
    programKey === 'balcony' ||
    hasRoomMeaning(room, /露台|阳台|庭院|terrace|balcony|courtyard|garden/)
  const isGarage = programKey === 'garage' || hasRoomMeaning(room, /车库|garage/)
  const isStair =
    programKey === 'stairs' || programKey === 'elevator' || hasRoomMeaning(room, /楼梯|stair/)

  if (isStair) return items

  if (isBedroom && intent.bedroom) {
    items.push(
      itemPlan(`${prefix}_bed`, 'double-bed', roomPoint(room, 0.38, 0.52), {
        rotation: [0, Math.PI, 0],
        scale: [0.85, 0.85, 0.85],
      }),
      itemPlan(`${prefix}_bedside`, 'bedside-table', roomPoint(room, 0.22, 0.3)),
      itemPlan(`${prefix}_closet`, 'closet', roomPoint(room, 0.78, 0.78), {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.68, 0.85, 0.68],
      }),
    )
  }

  if (isLiving && intent.living) {
    items.push(
      itemPlan(`${prefix}_sofa`, 'sofa', roomPoint(room, 0.55, 0.62), {
        rotation: [0, Math.PI, 0],
        scale: [0.78, 0.85, 0.78],
      }),
      itemPlan(`${prefix}_coffee`, 'coffee-table', roomPoint(room, 0.55, 0.42), {
        scale: [0.68, 0.8, 0.62],
      }),
      itemPlan(`${prefix}_tv_stand`, 'tv-stand', roomPoint(room, 0.18, 0.42), {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.72, 0.8, 0.72],
      }),
      itemPlan(`${prefix}_tv`, 'television', roomPoint(room, 0.16, 0.42), {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.55, 0.55, 0.55],
      }),
    )
  }

  if (isKitchen && intent.kitchen) {
    items.push(
      itemPlan(`${prefix}_dining_table`, 'dining-table', roomPoint(room, 0.34, 0.38), {
        scale: [0.72, 0.82, 0.72],
      }),
      itemPlan(`${prefix}_dining_chair_a`, 'dining-chair', roomPoint(room, 0.25, 0.25)),
      itemPlan(`${prefix}_dining_chair_b`, 'dining-chair', roomPoint(room, 0.43, 0.52), {
        rotation: [0, Math.PI, 0],
      }),
      itemPlan(`${prefix}_counter`, 'kitchen-counter', roomPoint(room, 0.72, 0.62), {
        scale: [0.82, 0.9, 0.82],
      }),
      itemPlan(`${prefix}_fridge`, 'fridge', roomPoint(room, 0.84, 0.78), {
        scale: [0.72, 0.82, 0.72],
      }),
      itemPlan(`${prefix}_stove`, 'stove', roomPoint(room, 0.62, 0.78), {
        scale: [0.72, 0.78, 0.72],
      }),
    )
  }

  if (isBath && intent.bathroom) {
    items.push(
      itemPlan(`${prefix}_toilet`, 'toilet', roomPoint(room, 0.25, 0.72), {
        scale: [0.7, 0.7, 0.7],
      }),
      itemPlan(`${prefix}_sink`, 'bathroom-sink', roomPoint(room, 0.55, 0.28), {
        scale: [0.5, 0.72, 0.5],
      }),
      itemPlan(`${prefix}_shower`, 'shower-square', roomPoint(room, 0.76, 0.72), {
        scale: [0.62, 0.72, 0.62],
      }),
    )

    if (/浴缸|泡池|bathtub|spa/.test(prompt) || /主|primary|spa/.test(room.name.toLowerCase())) {
      items.push(
        itemPlan(`${prefix}_bathtub`, 'bathtub', roomPoint(room, 0.72, 0.36), {
          rotation: [0, Math.PI / 2, 0],
          scale: [0.55, 0.7, 0.55],
        }),
      )
    }
  }

  if (isTerrace && intent.terrace) {
    items.push(
      itemPlan(`${prefix}_lounge_a`, 'lounge-chair', roomPoint(room, 0.32, 0.55), {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.75, 0.75, 0.75],
      }),
      itemPlan(`${prefix}_lounge_b`, 'lounge-chair', roomPoint(room, 0.62, 0.55), {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.75, 0.75, 0.75],
      }),
    )
  }

  if (isGarage && intent.garage) {
    items.push(
      itemPlan(`${prefix}_car`, 'tesla', roomPoint(room, 0.52, 0.5), {
        rotation: [0, Math.PI, 0],
        scale: [0.5, 0.5, 0.5],
      }),
    )
  }

  return items
}

function createOutdoorDetails(
  form: AiBuildingFormState,
  intent: AiBuildingFeatureIntent,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): Pick<AiBuildingFloorPlan, 'detailSlabs' | 'fences' | 'items'> {
  const detailSlabs: AiBuildingDetailSlabPlan[] = []
  const fences: AiBuildingFencePlan[] = []
  const items: AiBuildingItemPlan[] = []
  const siteMinX = minX - 3
  const siteMaxX = maxX + 3
  const siteMinZ = minZ - 3
  const siteMaxZ = maxZ + 3
  const entryGap = Math.min(2.8, Math.max(1.8, form.width * 0.12))

  detailSlabs.push({
    key: 'entry_walk',
    name: 'Entry Walk',
    polygon: rect(-entryGap / 2, siteMinZ + 0.2, entryGap / 2, minZ + 0.35),
    elevation: 0.045,
    material: material('#c8ccd0', 0.82),
  })

  if (intent.garage) {
    detailSlabs.push({
      key: 'driveway',
      name: 'Driveway',
      polygon: rect(maxX - 4.2, siteMinZ + 0.35, maxX - 0.4, minZ + 2.5),
      elevation: 0.045,
      material: material('#bfc5ca', 0.84),
    })
    items.push(
      itemPlan('driveway_parking', 'parking-spot', [maxX - 2.3, 0, siteMinZ + 2.9], {
        scale: [0.9, 1, 0.75],
      }),
    )
  }

  if (intent.courtyard || intent.terrace) {
    detailSlabs.push({
      key: 'rear_terrace',
      name: 'Garden Terrace',
      polygon: rect(minX + 1.2, maxZ - 0.15, maxX - 1.2, siteMaxZ - 1.2),
      elevation: 0.055,
      material: material('#b98958', 0.68),
    })
  }

  if (intent.pool) {
    const poolX1 = maxX + 0.65
    const poolX2 = siteMaxX - 0.55
    const poolZ1 = minZ + Math.max(2.1, form.depth * 0.28)
    const poolZ2 = Math.min(maxZ - 1.2, poolZ1 + Math.max(3.2, form.depth * 0.22))
    const hasEastPoolSpace = poolX2 - poolX1 >= 2.1 && poolZ2 - poolZ1 >= 2.4
    const waterPolygon = hasEastPoolSpace
      ? rect(poolX1, poolZ1, poolX2, poolZ2)
      : rect(maxX - 5.2, maxZ + 0.8, maxX - 1.0, siteMaxZ - 0.8)
    const deckPolygon = hasEastPoolSpace
      ? rect(poolX1 - 0.6, poolZ1 - 0.6, poolX2 + 0.45, poolZ2 + 0.6)
      : rect(maxX - 5.8, maxZ + 0.35, maxX - 0.35, siteMaxZ - 0.35)

    detailSlabs.push(
      {
        key: 'pool_deck',
        name: 'Pool Deck',
        polygon: deckPolygon,
        elevation: 0.052,
        material: material('#d7d1c5', 0.85),
      },
      {
        key: 'pool',
        name: 'Pool',
        polygon: waterPolygon,
        elevation: 0.04,
        material: material('#58b9d4', 0.2, 0, 0.78),
      },
    )

    const poolBounds = getPolygonBounds(waterPolygon)
    items.push(
      itemPlan('pool_sunbed_a', 'sunbed', [poolBounds.maxX + 0.55, 0, poolBounds.minZ + 0.9], {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.75, 0.75, 0.75],
      }),
      itemPlan('pool_sunbed_b', 'sunbed', [poolBounds.maxX + 0.55, 0, poolBounds.maxZ - 0.9], {
        rotation: [0, Math.PI / 2, 0],
        scale: [0.75, 0.75, 0.75],
      }),
      itemPlan(
        'pool_umbrella',
        'patio-umbrella',
        [poolBounds.minX - 0.55, 0, poolBounds.maxZ - 0.65],
        {
          scale: [0.95, 0.95, 0.95],
        },
      ),
    )
  }

  if (intent.landscape) {
    items.push(
      itemPlan('garden_tree', 'tree', [siteMinX + 1.2, 0, siteMaxZ - 1.2]),
      itemPlan('front_palm_left', 'palm', [minX + 1.6, 0, minZ - 1.2], {
        scale: [0.65, 0.65, 0.65],
      }),
      itemPlan('front_palm_right', 'palm', [maxX - 1.6, 0, minZ - 1.2], {
        scale: [0.65, 0.65, 0.65],
      }),
    )
  }

  if (intent.fencedGarden) {
    const fenceStyle = form.style === 'minimal' ? 'rail' : 'slat'
    const fenceColor = form.style === 'newChinese' ? '#2f3437' : '#3f454a'
    fences.push(
      {
        key: 'front_left',
        start: [siteMinX, siteMinZ],
        end: [-entryGap / 2 - 0.4, siteMinZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
      {
        key: 'front_right',
        start: [entryGap / 2 + 0.4, siteMinZ],
        end: [siteMaxX, siteMinZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
      {
        key: 'left',
        start: [siteMinX, siteMinZ],
        end: [siteMinX, siteMaxZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
      {
        key: 'back',
        start: [siteMinX, siteMaxZ],
        end: [siteMaxX, siteMaxZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
      {
        key: 'right',
        start: [siteMaxX, siteMaxZ],
        end: [siteMaxX, siteMinZ],
        height: 1.05,
        color: fenceColor,
        style: fenceStyle,
      },
    )
  }

  return { detailSlabs, fences, items }
}

function getPolygonBounds(points: Point2D[]) {
  const xs = points.map((point) => point[0])
  const zs = points.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function getStyleMaterials(form: AiBuildingFormState) {
  if (form.style === 'newChinese') {
    return {
      exteriorWall: material('#e8ddcc', 0.82),
      interiorWall: material('#f7f0e3', 0.86),
      slab: material('#d9cfbd', 0.84),
      ceiling: material('#f7f0e3', 0.9),
      roof: material('#4b5563', 0.72),
      roofWall: material('#f7f0e3', 0.86),
    }
  }

  if (form.style === 'minimal') {
    return {
      exteriorWall: material('#f8fafc', 0.8),
      interiorWall: material('#ffffff', 0.88),
      slab: material('#d7dce0', 0.82),
      ceiling: material('#f8fafc', 0.9),
      roof: material('#c8ccd0', 0.78),
      roofWall: material('#f8fafc', 0.86),
    }
  }

  return {
    exteriorWall: material('#f4f0e8', 0.86),
    interiorWall: material('#f8fafc', 0.78),
    slab: material('#d7d1c5', 0.85),
    ceiling: material('#f7f7f2', 0.9),
    roof: material('#5b6470', 0.72),
    roofWall: material('#f4f0e8', 0.86),
  }
}

function getRoofType(
  form: AiBuildingFormState,
  intent: AiBuildingFeatureIntent,
): AiBuildingRoofPlan['roofType'] {
  if (intent.terrace || form.style === 'minimal') return 'flat'
  if (form.style === 'newChinese') return 'hip'
  if (/坡屋顶|山墙|gable|pitched/.test(form.prompt.toLowerCase())) return 'gable'
  if (/单坡|shed/.test(form.prompt.toLowerCase())) return 'shed'
  return form.buildingType === 'shop' || form.buildingType === 'office' ? 'flat' : 'hip'
}

function createFloorPlan(
  form: AiBuildingFormState,
  floorIndex: number,
  language: AiBuildingLanguage,
): AiBuildingFloorPlan {
  const halfWidth = form.width / 2
  const halfDepth = form.depth / 2
  const minX = -halfWidth
  const maxX = halfWidth
  const minZ = -halfDepth
  const maxZ = halfDepth
  const layout = createRoomLayout(form, floorIndex, language, minX, maxX, minZ, maxZ)
  const wallHeight = floorIndex === 0 ? 3 : 2.8
  const intent = inferFeatureIntent(form)
  const materials = getStyleMaterials(form)

  const walls: AiBuildingWallPlan[] = [
    {
      key: 'south',
      name: language === 'zh-CN' ? '南外墙' : 'South Wall',
      start: [minX, minZ],
      end: [maxX, minZ],
      role: 'outer',
    },
    {
      key: 'east',
      name: language === 'zh-CN' ? '东外墙' : 'East Wall',
      start: [maxX, minZ],
      end: [maxX, maxZ],
      role: 'outer',
    },
    {
      key: 'north',
      name: language === 'zh-CN' ? '北外墙' : 'North Wall',
      start: [maxX, maxZ],
      end: [minX, maxZ],
      role: 'outer',
    },
    {
      key: 'west',
      name: language === 'zh-CN' ? '西外墙' : 'West Wall',
      start: [minX, maxZ],
      end: [minX, minZ],
      role: 'outer',
    },
    ...layout.walls,
  ]

  for (const wall of walls) {
    wall.interiorMaterial = materials.interiorWall
    wall.exteriorMaterial = wall.role === 'outer' ? materials.exteriorWall : materials.interiorWall
  }

  const rooms = layout.rooms
  const openings = createPlanOpenings(form, floorIndex, language, walls)

  const slabPolygon = rect(minX, minZ, maxX, maxZ)
  const isTopFloor = floorIndex === form.floors - 1
  const outdoorDetails =
    floorIndex === 0
      ? createOutdoorDetails(form, intent, minX, maxX, minZ, maxZ)
      : { detailSlabs: [], fences: [], items: [] }
  const terraceSlabs =
    intent.terrace || intent.courtyard
      ? rooms
          .filter((room) => hasRoomMeaning(room, /露台|阳台|庭院|terrace|balcony|courtyard|garden/))
          .map((room) => ({
            key: `${room.key}_finish`,
            name: `${room.name} Finish`,
            polygon: room.polygon,
            elevation: 0.065,
            material: material('#b98958', 0.68),
          }))
      : []
  const ceilings = intent.ceiling
    ? [
        {
          key: 'ceiling',
          name: floorIndex === 0 ? 'AI Ceiling' : `AI Ceiling ${floorIndex + 1}`,
          polygon: slabPolygon,
          height: wallHeight,
          material: materials.ceiling,
        },
      ]
    : []
  const roofs =
    isTopFloor && intent.roof
      ? [
          {
            key: 'main_roof',
            roofType: getRoofType(form, intent),
            position: [0, wallHeight + 0.08, 0] as Point3D,
            width: form.width + 1.2,
            depth: form.depth + 1.2,
            roofHeight: getRoofType(form, intent) === 'flat' ? 0.28 : 1.25,
            material: materials.roof,
            wallMaterial: materials.roofWall,
          },
        ]
      : []
  const stairAnchor = getStairAnchorRoom(rooms)
  const stairAnchorPoint = stairAnchor ? roomPoint(stairAnchor, 0.55, 0.45) : ([0, 0, 0] as Point3D)
  const stairs =
    intent.stairs && floorIndex < form.floors - 1
      ? [
          {
            key: 'core_stair',
            position: [
              clampNumber(stairAnchorPoint[0], minX + 1.4, maxX - 1.4),
              0,
              clampNumber(stairAnchorPoint[2], minZ + 1.7, maxZ - 1.7),
            ] as Point3D,
            rotation: 0,
            width: 1.12,
            runLength: 3.9,
            totalRise: wallHeight,
            stepCount: Math.max(12, Math.round(wallHeight / 0.16)),
          },
        ]
      : []
  const roomItems = rooms.flatMap((room) => createRoomItemPlans(form, intent, floorIndex, room))

  return {
    level: floorIndex,
    label: language === 'zh-CN' ? `第 ${floorIndex + 1} 层` : `Level ${floorIndex + 1}`,
    rooms,
    walls,
    openings,
    slabPolygon,
    slabMaterial: materials.slab,
    ceilings,
    detailSlabs: [...outdoorDetails.detailSlabs, ...terraceSlabs],
    fences: outdoorDetails.fences,
    items: [...roomItems, ...outdoorDetails.items],
    roofs,
    stairs,
    wallHeight,
  }
}

export function createPlan(
  form: AiBuildingFormState,
  language: AiBuildingLanguage,
): AiBuildingPlan {
  const normalizedForm = {
    ...form,
    floors: Math.round(clampNumber(form.floors, 1, 8)),
    width: clampNumber(form.width, MIN_DIMENSION, MAX_DIMENSION),
    depth: clampNumber(form.depth, MIN_DIMENSION, MAX_DIMENSION),
  }
  const floors = Array.from({ length: normalizedForm.floors }, (_, index) =>
    createFloorPlan(normalizedForm, index, language),
  )
  const summary =
    language === 'zh-CN'
      ? `${COPY[language].buildingTypes[form.buildingType]} · ${normalizedForm.floors} 层 · ${normalizedForm.width}m x ${normalizedForm.depth}m`
      : `${COPY[language].buildingTypes[form.buildingType]} · ${normalizedForm.floors} floors · ${normalizedForm.width}m x ${normalizedForm.depth}m`

  return {
    id: `${normalizedForm.buildingType}-${normalizedForm.style}-${normalizedForm.variant}-${normalizedForm.floors}-${normalizedForm.width}-${normalizedForm.depth}`,
    summary,
    footprint: {
      width: normalizedForm.width,
      depth: normalizedForm.depth,
    },
    floors,
  }
}

function getWallLength(wall: AiBuildingWallPlan) {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

function findTargetBuilding(nodes: Record<AnyNodeId, AnyNode>, context: SceneContext) {
  if (context.buildingId) {
    const node = nodes[context.buildingId as AnyNodeId]
    if (node?.type === 'building') return node
  }

  return Object.values(nodes).find((node) => node.type === 'building') ?? null
}

function createDefaultBuilding() {
  const scene = useScene.getState()
  let site = scene.rootNodeIds
    .map((rootId) => scene.nodes[rootId])
    .find((node) => node?.type === 'site')

  if (!site) {
    scene.clearScene()
    const nextScene = useScene.getState()
    site = nextScene.rootNodeIds
      .map((rootId) => nextScene.nodes[rootId])
      .find((node) => node?.type === 'site')
  }

  if (!site) return null

  const level = LevelNode.parse({ level: 0 })
  const building = BuildingNode.parse({ children: [] })
  useScene.getState().createNodes([
    { node: building, parentId: site.id as AnyNodeId },
    { node: level, parentId: building.id as AnyNodeId },
  ])
  return building
}

function ensureTargetLevels(building: AnyNode, floorCount: number) {
  const scene = useScene.getState()
  const levels = getBuildingLevels(building, scene.nodes)
  const byLevelNumber = new Map(levels.map((level) => [level.level, level]))
  const createOps: { node: LevelNode; parentId: AnyNodeId }[] = []

  for (let levelIndex = 0; levelIndex < floorCount; levelIndex += 1) {
    if (byLevelNumber.has(levelIndex)) continue

    const level = LevelNode.parse({
      level: levelIndex,
      name: `Level ${levelIndex}`,
    })
    byLevelNumber.set(levelIndex, level)
    createOps.push({ node: level, parentId: building.id as AnyNodeId })
  }

  if (createOps.length) {
    scene.createNodes(createOps)
  }

  return Array.from({ length: floorCount }, (_, index) => byLevelNumber.get(index)).filter(
    (level): level is LevelNode => Boolean(level),
  )
}

function removePreviousAiBuildingNodes(building: AnyNode) {
  const scene = useScene.getState()
  const buildingLevels = new Set(getBuildingLevels(building, scene.nodes).map((level) => level.id))
  const generatedIds = Object.values(scene.nodes)
    .filter((node) => {
      if (!isAiBuildingNode(node)) return false
      const levelId = resolveLevelId(node, scene.nodes)
      return levelId ? buildingLevels.has(levelId as LevelNode['id']) : false
    })
    .map((node) => node.id as AnyNodeId)

  if (generatedIds.length) {
    scene.deleteNodes(generatedIds)
  }
}

export function applyPlanToScene(plan: AiBuildingPlan, context: SceneContext) {
  let scene = useScene.getState()
  let targetBuilding = findTargetBuilding(scene.nodes, context)
  let createdDefaultBuilding = false

  if (!targetBuilding) {
    targetBuilding = createDefaultBuilding()
    createdDefaultBuilding = Boolean(targetBuilding)
  }

  if (!targetBuilding) {
    return { wallCount: 0, floorCount: 0, createdDefaultBuilding }
  }

  removePreviousAiBuildingNodes(targetBuilding)
  scene = useScene.getState()
  const refreshedTargetBuilding = scene.nodes[targetBuilding.id as AnyNodeId]
  const buildingForApply =
    refreshedTargetBuilding?.type === 'building' ? refreshedTargetBuilding : targetBuilding
  const targetLevels = ensureTargetLevels(buildingForApply, plan.floors.length)
  const operations: { node: AnyNode; parentId: AnyNodeId }[] = []
  const selectedIds: AnyNodeId[] = []

  for (const floorPlan of plan.floors) {
    const level = targetLevels[floorPlan.level]
    if (!level) continue

    const wallIdsByKey = new Map<string, WallNode>()
    const metadataBase = {
      source: AI_BUILDING_SOURCE,
      planId: plan.id,
      level: floorPlan.level,
    }

    const slab = SlabNode.parse({
      name: floorPlan.level === 0 ? 'AI Slab' : `AI Slab ${floorPlan.level + 1}`,
      polygon: floorPlan.slabPolygon,
      material: floorPlan.slabMaterial,
      autoFromWalls: true,
      metadata: { ...metadataBase, role: 'slab' },
    })
    operations.push({ node: slab, parentId: level.id as AnyNodeId })

    for (const wallPlan of floorPlan.walls) {
      const wall = WallNode.parse({
        name: wallPlan.name,
        start: wallPlan.start,
        end: wallPlan.end,
        thickness: WALL_THICKNESS,
        height: floorPlan.wallHeight,
        interiorMaterial: wallPlan.interiorMaterial,
        exteriorMaterial: wallPlan.exteriorMaterial,
        metadata: { ...metadataBase, role: wallPlan.role, wallKey: wallPlan.key },
      })
      wallIdsByKey.set(wallPlan.key, wall)
      selectedIds.push(wall.id as AnyNodeId)
      operations.push({ node: wall, parentId: level.id as AnyNodeId })
    }

    for (const room of floorPlan.rooms) {
      const zone = ZoneNode.parse({
        name: room.name,
        polygon: room.polygon,
        color: room.color,
        metadata: { ...metadataBase, role: 'room', roomKey: room.key },
      })
      operations.push({ node: zone, parentId: level.id as AnyNodeId })
    }

    for (const ceilingPlan of floorPlan.ceilings) {
      const ceiling = CeilingNode.parse({
        name: ceilingPlan.name,
        polygon: ceilingPlan.polygon,
        height: ceilingPlan.height,
        material: ceilingPlan.material,
        metadata: { ...metadataBase, role: 'ceiling', detailKey: ceilingPlan.key },
      })
      operations.push({ node: ceiling, parentId: level.id as AnyNodeId })
    }

    for (const detailSlabPlan of floorPlan.detailSlabs) {
      const detailSlab = SlabNode.parse({
        name: detailSlabPlan.name,
        polygon: detailSlabPlan.polygon,
        elevation: detailSlabPlan.elevation,
        material: detailSlabPlan.material,
        metadata: { ...metadataBase, role: 'detail-slab', detailKey: detailSlabPlan.key },
      })
      operations.push({ node: detailSlab, parentId: level.id as AnyNodeId })
    }

    for (const fencePlan of floorPlan.fences) {
      const fence = FenceNode.parse({
        name: `AI Fence ${fencePlan.key}`,
        start: fencePlan.start,
        end: fencePlan.end,
        height: fencePlan.height,
        color: fencePlan.color,
        style: fencePlan.style,
        material: material(fencePlan.color, 0.65),
        metadata: { ...metadataBase, role: 'fence', detailKey: fencePlan.key },
      })
      operations.push({ node: fence, parentId: level.id as AnyNodeId })
    }

    for (const item of floorPlan.items) {
      const assetInput = ITEM_ASSETS[item.assetId]
      const itemNode = ItemNode.parse({
        name: assetInput.name,
        position: item.position,
        rotation: item.rotation ?? [0, 0, 0],
        scale: item.scale ?? [1, 1, 1],
        asset: assetInput,
        metadata: { ...metadataBase, role: 'item', detailKey: item.key, assetId: item.assetId },
      })
      operations.push({ node: itemNode, parentId: level.id as AnyNodeId })
    }

    for (const roofPlan of floorPlan.roofs) {
      const roof = RoofNode.parse({
        name: 'AI Roof',
        position: roofPlan.position,
        topMaterial: roofPlan.material,
        edgeMaterial: roofPlan.material,
        wallMaterial: roofPlan.wallMaterial,
        metadata: { ...metadataBase, role: 'roof', detailKey: roofPlan.key },
      })
      const roofSegment = RoofSegmentNode.parse({
        name: 'AI Roof Segment',
        roofType: roofPlan.roofType,
        width: roofPlan.width,
        depth: roofPlan.depth,
        roofHeight: roofPlan.roofHeight,
        wallHeight: roofPlan.roofType === 'flat' ? 0.24 : 0.45,
        wallThickness: 0.14,
        deckThickness: 0.12,
        overhang: 0.42,
        shingleThickness: 0.04,
        metadata: { ...metadataBase, role: 'roof-segment', detailKey: roofPlan.key },
      })
      operations.push(
        { node: roof, parentId: level.id as AnyNodeId },
        { node: roofSegment, parentId: roof.id as AnyNodeId },
      )
    }

    for (const stairPlan of floorPlan.stairs) {
      const nextLevel = targetLevels[floorPlan.level + 1]
      const stairSegment = StairSegmentNode.parse({
        name: 'AI Stair Flight',
        segmentType: 'stair',
        width: stairPlan.width,
        length: stairPlan.runLength,
        height: stairPlan.totalRise,
        stepCount: stairPlan.stepCount,
        attachmentSide: 'front',
        fillToFloor: true,
        thickness: 0.24,
        metadata: { ...metadataBase, role: 'stair-segment', detailKey: stairPlan.key },
      })
      const stair = StairNode.parse({
        name: 'AI Stair',
        position: stairPlan.position,
        rotation: stairPlan.rotation,
        stairType: 'straight',
        fromLevelId: level.id,
        toLevelId: nextLevel?.id ?? level.id,
        slabOpeningMode: nextLevel ? 'destination' : 'none',
        openingOffset: nextLevel ? 0.1 : 0,
        width: stairPlan.width,
        totalRise: stairPlan.totalRise,
        stepCount: stairPlan.stepCount,
        thickness: 0.24,
        fillToFloor: true,
        railingMode: 'both',
        railingHeight: 0.92,
        children: [stairSegment.id],
        metadata: { ...metadataBase, role: 'stair', detailKey: stairPlan.key },
      })
      operations.push(
        { node: stair, parentId: level.id as AnyNodeId },
        { node: stairSegment, parentId: stair.id as AnyNodeId },
      )
    }

    for (const opening of floorPlan.openings) {
      const wall = wallIdsByKey.get(opening.wallKey)
      if (!wall) continue
      const wallLength = getWallLength({
        key: opening.wallKey,
        name: '',
        start: wall.start,
        end: wall.end,
        role: 'outer',
      })
      const localX = clampNumber(opening.localX, opening.width / 2, wallLength - opening.width / 2)
      const metadata = { ...metadataBase, role: opening.kind, wallKey: opening.wallKey }

      if (opening.kind === 'door') {
        const door = DoorNode.parse({
          name: opening.name,
          position: [localX, opening.height / 2, 0],
          width: opening.width,
          height: opening.height,
          wallId: wall.id,
          parentId: wall.id,
          metadata,
        })
        operations.push({ node: door, parentId: wall.id as AnyNodeId })
      } else {
        const windowNode = WindowNode.parse({
          name: opening.name,
          position: [localX, opening.centerY, 0],
          width: opening.width,
          height: opening.height,
          wallId: wall.id,
          parentId: wall.id,
          metadata,
        })
        operations.push({ node: windowNode, parentId: wall.id as AnyNodeId })
      }
    }
  }

  if (operations.length) {
    useScene.getState().createNodes(operations)
  }

  const firstLevel = targetLevels[0]
  useViewer.getState().setSelection({
    buildingId: buildingForApply.id as never,
    levelId: firstLevel?.id as never,
    selectedIds: selectedIds.slice(0, 4),
    zoneId: null,
  })
  const editor = useEditor.getState()
  editor.setPhase('structure')
  editor.setStructureLayer('elements')
  editor.setMode('select')
  editor.setViewMode('3d')

  return {
    wallCount: plan.floors.reduce((total, floor) => total + floor.walls.length, 0),
    floorCount: plan.floors.length,
    createdDefaultBuilding,
  }
}
