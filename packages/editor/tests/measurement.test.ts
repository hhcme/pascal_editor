import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three'

type MeasurementModule = typeof import('../src/lib/measurement')

const sceneNodes = new Map<string, Mesh>()

function pointInPolygon(x: number, z: number, polygon: Array<[number, number]>) {
  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index]
    const last = polygon[previous]
    if (!(current && last)) continue

    const intersects =
      current[1] > z !== last[1] > z &&
      x < ((last[0] - current[0]) * (z - current[1])) / (last[1] - current[1]) + current[0]

    if (intersects) inside = !inside
  }

  return inside
}

mock.module('@pascal-app/core', () => ({
  DEFAULT_WALL_HEIGHT: 3,
  getScaledDimensions: () => [1, 1, 1],
  getSketchLineChordLength: (line: { start: [number, number]; end: [number, number] }) =>
    Math.hypot(line.end[0] - line.start[0], line.end[1] - line.start[1]),
  getWallCurveFrameAt: () => ({
    point: [0, 0],
    tangent: [1, 0],
    normal: [0, 1],
  }),
  getWallCurveLength: (wall: { start: [number, number]; end: [number, number] }) =>
    Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]),
  getWallThickness: (wall: { thickness?: number }) => wall.thickness ?? 0.2,
  isCurvedWall: (wall: { curveOffset?: number }) =>
    typeof wall.curveOffset === 'number' && Math.abs(wall.curveOffset) > 0.0001,
  pointInPolygon,
  sampleWallCenterline: (
    wall: { start: [number, number]; end: [number, number] },
    _segmentLength = 1,
  ) => [wall.start, wall.end],
  sampleSketchLineCenterline: (
    line: { start: [number, number]; end: [number, number] },
    _segments = 36,
  ) => [
    { x: line.start[0], y: line.start[1] },
    { x: line.end[0], y: line.end[1] },
  ],
  sceneRegistry: {
    nodes: sceneNodes,
  },
}))

let measurement: MeasurementModule

function registerBox(
  id: string,
  size: { width: number; depth: number; height?: number },
  position: [number, number, number] = [0, 0, 0],
) {
  const mesh = new Mesh(
    new BoxGeometry(size.width, size.height ?? 1, size.depth),
    new MeshBasicMaterial(),
  )
  mesh.position.set(position[0], position[1], position[2])
  mesh.updateMatrixWorld(true)
  sceneNodes.set(id, mesh)
  return mesh
}

beforeAll(async () => {
  measurement = await import('../src/lib/measurement')
})

beforeEach(() => {
  sceneNodes.clear()
})

describe('measurement geometry', () => {
  test('rejects self-intersecting polygons for area and perimeter calculations', () => {
    const bowtie: Array<[number, number]> = [
      [0, 0],
      [2, 2],
      [0, 2],
      [2, 0],
    ]

    expect(measurement.calculatePolygonArea(bowtie)).toBe(0)
    expect(measurement.calculatePolygonPerimeter(bowtie)).toBe(0)
  })

  test('projects building span, depth and setbacks against the site orientation', () => {
    const site = {
      id: 'site_test',
      type: 'site',
      parentId: null,
      children: ['building_test'],
      polygon: {
        points: [
          [0, 0],
          [30, 0],
          [30, 20],
          [0, 20],
        ],
      },
      metadata: {
        orientationDegrees: 90,
        measurementSetbackRulesV1: {
          front: 20,
          left: 4,
        },
      },
    }
    const building = {
      id: 'building_test',
      type: 'building',
      parentId: 'site_test',
      children: ['level_test'],
      name: '主楼',
    }
    const level = {
      id: 'level_test',
      type: 'level',
      parentId: 'building_test',
      children: ['zone_test'],
      level: 0,
    }
    const zone = {
      id: 'zone_test',
      type: 'zone',
      parentId: 'level_test',
      children: [],
      polygon: [
        [5, 4],
        [11, 4],
        [11, 12],
        [5, 12],
      ],
      name: '首层空间',
    }

    const nodes = {
      [site.id]: site,
      [building.id]: building,
      [level.id]: level,
      [zone.id]: zone,
    } as any

    const summary = measurement.getPerimeterSummaryForNode(building as any, nodes, 'metric', {
      precision: 0,
    })

    expect(summary).not.toBeNull()

    const metrics = new Map(summary!.metrics.map((metric) => [metric.id, metric]))
    expect(metrics.get('span')?.value).toBeCloseTo(8)
    expect(metrics.get('depth')?.value).toBeCloseTo(6)
    expect(metrics.get('front-setback')?.value).toBeCloseTo(19)
    expect(metrics.get('back-setback')?.value).toBeCloseTo(5)
    expect(metrics.get('left-setback')?.value).toBeCloseTo(4)
    expect(metrics.get('right-setback')?.value).toBeCloseTo(8)
    expect(metrics.get('front-setback')?.rule?.status).toBe('fail')
    expect(metrics.get('front-setback')?.rule?.target).toBe(20)
    expect(metrics.get('left-setback')?.rule?.status).toBe('pass')

    const guides = measurement.getPerimeterGuidesForNode(building as any, nodes, 'metric', {
      precision: 0,
    })

    expect(guides.find((guide) => guide.id === 'span')?.value).toBeCloseTo(8)
    expect(guides.find((guide) => guide.id === 'depth')?.value).toBeCloseTo(6)
    expect(guides.find((guide) => guide.id === 'front-setback')?.referenceLabel).toBe('东侧地界')
    expect(guides.find((guide) => guide.id === 'left-setback')?.referenceLabel).toBe('北侧地界')
  })

  test('falls back to object bounds when zone polygon is self-intersecting', () => {
    registerBox('zone_invalid', { width: 4, depth: 3, height: 2 }, [2, 1, 1.5])

    const zone = {
      id: 'zone_invalid',
      type: 'zone',
      parentId: null,
      children: [],
      polygon: [
        [0, 0],
        [4, 3],
        [0, 3],
        [4, 0],
      ],
      name: '异常区域',
    }
    const nodes = { [zone.id]: zone } as any

    const areaSummary = measurement.getMeasurementSummaryForNode(
      zone as any,
      'area',
      nodes,
      'metric',
      { precision: 0 },
    )
    const perimeterSummary = measurement.getPerimeterSummaryForNode(zone as any, nodes, 'metric', {
      precision: 0,
    })

    expect(areaSummary?.approximate).toBe(true)
    expect(areaSummary?.value).toBeCloseTo(12)
    expect(areaSummary?.description).toBe('区域包围盒占地面积')

    expect(perimeterSummary?.approximate).toBe(true)
    expect(
      perimeterSummary?.metrics.find((metric) => metric.id === 'perimeter')?.value,
    ).toBeCloseTo(14)
    expect(perimeterSummary?.metrics.find((metric) => metric.id === 'span')?.value).toBeCloseTo(4)
    expect(perimeterSummary?.metrics.find((metric) => metric.id === 'depth')?.value).toBeCloseTo(3)
  })

  test('falls back to footprint envelope when site polygon is unavailable for setbacks', () => {
    const site = {
      id: 'site_invalid',
      type: 'site',
      parentId: null,
      children: ['building_invalid_site'],
      polygon: {
        points: [
          [0, 0],
          [10, 0],
        ],
      },
      metadata: {
        orientationDegrees: 0,
      },
    }
    const building = {
      id: 'building_invalid_site',
      type: 'building',
      parentId: 'site_invalid',
      children: ['level_invalid_site'],
    }
    const level = {
      id: 'level_invalid_site',
      type: 'level',
      parentId: 'building_invalid_site',
      children: ['zone_invalid_site'],
      level: 0,
    }
    const zone = {
      id: 'zone_invalid_site',
      type: 'zone',
      parentId: 'level_invalid_site',
      children: [],
      polygon: [
        [2, 1],
        [6, 1],
        [6, 4],
        [2, 4],
      ],
    }
    const nodes = {
      [site.id]: site,
      [building.id]: building,
      [level.id]: level,
      [zone.id]: zone,
    } as any

    const summary = measurement.getPerimeterSummaryForNode(building as any, nodes, 'metric', {
      precision: 0,
    })

    expect(summary).not.toBeNull()
    expect(summary?.approximate).toBe(true)
    expect(summary?.metrics.some((metric) => metric.id.endsWith('setback'))).toBe(false)
    expect(summary?.metrics.find((metric) => metric.id === 'span')?.value).toBeCloseTo(4)
    expect(summary?.metrics.find((metric) => metric.id === 'depth')?.value).toBeCloseTo(3)
  })

  test('deducts wall openings from area and volume and exposes detailed metrics', () => {
    const wall = {
      id: 'wall_measurement',
      type: 'wall',
      parentId: null,
      children: ['door_measurement', 'window_measurement'],
      start: [0, 0],
      end: [5, 0],
      height: 3,
      thickness: 0.2,
      frontSide: 'interior',
      backSide: 'exterior',
    }
    const door = {
      id: 'door_measurement',
      type: 'door',
      parentId: 'wall_measurement',
      width: 1,
      height: 2,
      frameDepth: 0.07,
    }
    const windowNode = {
      id: 'window_measurement',
      type: 'window',
      parentId: 'wall_measurement',
      width: 1.5,
      height: 1.2,
      frameDepth: 0.07,
    }
    const nodes = {
      [wall.id]: wall,
      [door.id]: door,
      [windowNode.id]: windowNode,
    } as any

    const areaSummary = measurement.getMeasurementSummaryForNode(
      wall as any,
      'area',
      nodes,
      'metric',
      { precision: 1 },
    )
    const volumeSummary = measurement.getMeasurementSummaryForNode(
      wall as any,
      'volume',
      nodes,
      'metric',
      { precision: 2 },
    )

    expect(areaSummary?.primaryLabel).toBe('单侧净面积')
    expect(areaSummary?.value).toBeCloseTo(11.2)
    expect(
      areaSummary?.metrics.find((metric) => metric.id === 'wall-opening-area-deduction')?.value,
    ).toBeCloseTo(3.8)
    expect(
      areaSummary?.metrics.find((metric) => metric.id === 'wall-double-face-net-area')?.value,
    ).toBeCloseTo(22.4)

    expect(volumeSummary?.primaryLabel).toBe('净实体体积')
    expect(volumeSummary?.value).toBeCloseTo(2.24)
    expect(
      volumeSummary?.metrics.find((metric) => metric.id === 'wall-opening-deduction-volume')?.value,
    ).toBeCloseTo(0.76)
  })

  test('prefers aggregated floor area for building summaries and keeps roof projection details', () => {
    const building = {
      id: 'building_area',
      type: 'building',
      parentId: null,
      children: ['level_area'],
      name: '聚合建筑',
    }
    const level = {
      id: 'level_area',
      type: 'level',
      parentId: 'building_area',
      children: ['slab_area', 'roof_area'],
      level: 0,
    }
    const slab = {
      id: 'slab_area',
      type: 'slab',
      parentId: 'level_area',
      children: [],
      polygon: [
        [0, 0],
        [8, 0],
        [8, 6],
        [0, 6],
      ],
      holes: [
        [
          [1, 1],
          [3, 1],
          [3, 2],
          [1, 2],
        ],
      ],
    }
    const roof = {
      id: 'roof_area',
      type: 'roof',
      parentId: 'level_area',
      children: ['roof_segment_area'],
      position: [0, 0, 0],
      rotation: 0,
    }
    const roofSegment = {
      id: 'roof_segment_area',
      type: 'roof-segment',
      parentId: 'roof_area',
      width: 8,
      depth: 6,
      overhang: 0,
      roofType: 'gable',
      wallHeight: 0.5,
      roofHeight: 2,
      rotation: 0,
    }
    const nodes = {
      [building.id]: building,
      [level.id]: level,
      [slab.id]: slab,
      [roof.id]: roof,
      [roofSegment.id]: roofSegment,
    } as any

    const buildingArea = measurement.getMeasurementSummaryForNode(
      building as any,
      'area',
      nodes,
      'metric',
      { precision: 1 },
    )
    const roofArea = measurement.getMeasurementSummaryForNode(
      roof as any,
      'area',
      nodes,
      'metric',
      { precision: 1 },
    )

    expect(buildingArea?.primaryLabel).toBe('总楼地面面积')
    expect(buildingArea?.value).toBeCloseTo(46)
    expect(
      buildingArea?.metrics.find((metric) => metric.id === 'building-floor-area')?.value,
    ).toBeCloseTo(46)
    expect(
      buildingArea?.metrics.find((metric) => metric.id === 'building-roof-projection-area')?.value,
    ).toBeCloseTo(48)

    expect(roofArea?.primaryLabel).toBe('投影面积合计')
    expect(roofArea?.value).toBeCloseTo(48)
    expect(
      roofArea?.metrics.find((metric) => metric.id === 'roof-surface-area')?.value,
    ).toBeGreaterThan(48)
  })

  test('measures grid spacing and total span from parallel sketch lines', () => {
    const level = {
      id: 'level_grid',
      type: 'level',
      parentId: null,
      children: ['axis_a', 'axis_b', 'axis_c'],
      level: 0,
    }
    const axisA = {
      id: 'axis_a',
      type: 'sketch-line',
      parentId: 'level_grid',
      children: [],
      start: [0, 0],
      end: [0, 8],
      construction: true,
    }
    const axisB = {
      id: 'axis_b',
      type: 'sketch-line',
      parentId: 'level_grid',
      children: [],
      start: [4, 0],
      end: [4, 8],
      construction: true,
    }
    const axisC = {
      id: 'axis_c',
      type: 'sketch-line',
      parentId: 'level_grid',
      children: [],
      start: [9, 0],
      end: [9, 8],
      construction: true,
    }
    const nodes = {
      [level.id]: level,
      [axisA.id]: axisA,
      [axisB.id]: axisB,
      [axisC.id]: axisC,
    } as any

    const summary = measurement.getGridMeasurementSummaryForSelection(
      [axisA.id, axisB.id, axisC.id],
      nodes,
      'metric',
      { precision: 1 },
    )
    const guides = measurement.getGridMeasurementGuidesForSelection(
      [axisA.id, axisB.id, axisC.id],
      nodes,
      'metric',
      { precision: 1 },
    )

    expect(summary).not.toBeNull()
    expect(summary?.targetLabel).toBe('草图轴线组 (3 条)')
    expect(summary?.primaryLabel).toBe('总跨度')
    expect(summary?.value).toBeCloseTo(9)
    expect(summary?.metrics.find((metric) => metric.id === 'axis-count')?.value).toBe(3)
    expect(summary?.metrics.find((metric) => metric.id === 'bay-count')?.value).toBe(2)
    expect(summary?.metrics.find((metric) => metric.id === 'average-spacing')?.value).toBeCloseTo(
      4.5,
    )
    expect(summary?.metrics.find((metric) => metric.id === 'bay:1')?.value).toBeCloseTo(4)
    expect(summary?.metrics.find((metric) => metric.id === 'bay:2')?.value).toBeCloseTo(5)
    expect(summary?.metrics.find((metric) => metric.id === 'grid-angle')?.value).toBeCloseTo(90)

    expect(guides).toHaveLength(3)
    expect(guides.find((guide) => guide.id === 'bay:1')?.value).toBeCloseTo(4)
    expect(guides.find((guide) => guide.id === 'bay:2')?.value).toBeCloseTo(5)
    expect(guides.find((guide) => guide.id === 'total-span')?.value).toBeCloseTo(9)
  })

  test('reports parapet height for flat roofs and keeps it in the height chain', () => {
    const building = {
      id: 'building_flat',
      type: 'building',
      parentId: null,
      children: ['level_flat'],
    }
    const level = {
      id: 'level_flat',
      type: 'level',
      parentId: 'building_flat',
      children: ['roof_flat'],
      level: 0,
    }
    const roof = {
      id: 'roof_flat',
      type: 'roof',
      parentId: 'level_flat',
      children: ['roof_segment_flat'],
      position: [0, 0, 0],
      rotation: 0,
    }
    const roofSegment = {
      id: 'roof_segment_flat',
      type: 'roof-segment',
      parentId: 'roof_flat',
      position: [0, 0, 0],
      rotation: 0,
      roofType: 'flat',
      width: 8,
      depth: 8,
      wallHeight: 0.9,
      roofHeight: 0,
      wallThickness: 0.12,
      deckThickness: 0.1,
      overhang: 0,
      shingleThickness: 0.05,
    }
    const nodes = {
      [building.id]: building,
      [level.id]: level,
      [roof.id]: roof,
      [roofSegment.id]: roofSegment,
    } as any

    const roofSummary = measurement.getClearanceSummaryForNode(roof as any, nodes, 'metric', {
      precision: 1,
    })
    const levelSummary = measurement.getClearanceSummaryForNode(level as any, nodes, 'metric', {
      precision: 1,
    })
    const buildingSummary = measurement.getClearanceSummaryForNode(
      building as any,
      nodes,
      'metric',
      { precision: 1 },
    )

    expect(roofSummary?.primaryLabel).toBe('最高女儿墙高')
    expect(roofSummary?.value).toBeCloseTo(0.9)
    expect(
      roofSummary?.metrics.find((metric) => metric.id === 'parapet-height')?.value,
    ).toBeCloseTo(0.9)

    expect(
      levelSummary?.metrics.find((metric) => metric.id === 'parapet-height')?.value,
    ).toBeCloseTo(0.9)
    expect(
      buildingSummary?.metrics.find((metric) => metric.id === 'parapet-height')?.value,
    ).toBeCloseTo(0.9)
  })

  test('reports world-axis bounding box dimensions for rendered nodes', () => {
    registerBox('item_bounds', { width: 2, depth: 4, height: 3 }, [5, 1.5, -2])

    const item = {
      id: 'item_bounds',
      type: 'item',
      parentId: null,
      children: [],
      position: [5, 1.5, -2],
      rotation: 0,
      dimensions: [2, 3, 4],
      scale: [1, 1, 1],
      name: '测试构件',
    }
    const nodes = { [item.id]: item } as any

    const summary = measurement.getBoundsSummaryForNode(item as any, nodes, 'metric', {
      precision: 1,
    })

    expect(summary).not.toBeNull()
    expect(summary?.targetLabel).toBe('测试构件')
    expect(summary?.primaryLabel).toBe('包围盒尺寸')
    expect(summary?.bounds.center[0]).toBeCloseTo(5)
    expect(summary?.bounds.center[1]).toBeCloseTo(1.5)
    expect(summary?.bounds.center[2]).toBeCloseTo(-2)
    expect(summary?.metrics.find((metric) => metric.id === 'width')?.value).toBeCloseTo(2)
    expect(summary?.metrics.find((metric) => metric.id === 'height')?.value).toBeCloseTo(3)
    expect(summary?.metrics.find((metric) => metric.id === 'depth')?.value).toBeCloseTo(4)
    expect(summary?.metrics.find((metric) => metric.id === 'diagonal')?.value).toBeCloseTo(
      Math.hypot(2, 3, 4),
    )
  })
})
