import { describe, expect, test } from 'bun:test'
import {
  buildDeliveryPreset,
  getDeliveryCameraPresetSource,
  resolveDeliveryPresetEffects,
} from '../../../apps/editor/lib/delivery-preset-logic'

describe('delivery preset logic', () => {
  test('captures a floorplan preset and preserves overwrite identity fields', () => {
    const preset = buildDeliveryPreset({
      now: '2026-04-24T10:00:00.000Z',
      request: {
        createdAt: '2026-04-20T10:00:00.000Z',
        exportFormat: 'pdf',
        kind: 'floorplan',
        name: 'Level Sheet',
        presetId: 'delivery-preset:existing-floorplan',
      },
      state: {
        levelId: 'level_delivery_test',
        overlays: {
          showPerimeterGuides: false,
          showRoomArea: true,
          showRoomName: false,
          showWallLength: true,
        },
        viewMode: '2d',
      },
    })

    expect(preset).toMatchObject({
      createdAt: '2026-04-20T10:00:00.000Z',
      exportFormat: 'pdf',
      id: 'delivery-preset:existing-floorplan',
      kind: 'floorplan',
      levelId: 'level_delivery_test',
      name: 'Level Sheet',
      overlays: {
        showPerimeterGuides: false,
        showRoomArea: true,
        showRoomName: false,
        showWallLength: true,
      },
      updatedAt: '2026-04-24T10:00:00.000Z',
      viewMode: '2d',
    })
  })

  test('captures a camera preset from the current selected node camera snapshot', () => {
    const source = getDeliveryCameraPresetSource(
      {
        buildingId: 'building_delivery_test',
        levelId: 'level_delivery_test',
        selectedIds: ['zone_delivery_camera'],
        zoneId: null,
      },
      {
        zone_delivery_camera: {
          camera: {
            mode: 'perspective',
            position: [4, 5, 6],
            target: [1, 2, 3],
            zoom: 1.4,
          },
        },
      },
    )

    const preset = buildDeliveryPreset({
      cameraSource: source,
      now: '2026-04-24T10:00:00.000Z',
      request: {
        kind: 'camera',
        name: 'Hero Camera',
      },
      state: {
        levelId: 'level_delivery_test',
        overlays: {
          showPerimeterGuides: true,
          showRoomArea: false,
          showRoomName: true,
          showWallLength: true,
        },
        viewMode: '3d',
      },
    })

    expect(source).toMatchObject({
      nodeId: 'zone_delivery_camera',
      camera: {
        mode: 'perspective',
        position: [4, 5, 6],
        target: [1, 2, 3],
        zoom: 1.4,
      },
    })
    expect(preset).toMatchObject({
      kind: 'camera',
      name: 'Hero Camera',
      camera: {
        mode: 'perspective',
        nodeId: 'zone_delivery_camera',
        position: [4, 5, 6],
        target: [1, 2, 3],
        zoom: 1.4,
      },
    })
  })

  test('throws when saving a camera preset without any available camera snapshot', () => {
    expect(() =>
      buildDeliveryPreset({
        request: {
          kind: 'camera',
          name: 'Missing Camera',
        },
        state: {
          levelId: 'level_delivery_test',
          overlays: {
            showPerimeterGuides: true,
            showRoomArea: false,
            showRoomName: true,
            showWallLength: true,
          },
          viewMode: '3d',
        },
      }),
    ).toThrow('Take a level / building / room camera snapshot before saving a camera preset.')
  })

  test('resolves camera preset application into selection, overlays, view mode and camera event', () => {
    const effects = resolveDeliveryPresetEffects(
      {
        camera: {
          mode: 'orthographic',
          nodeId: 'level_delivery_focus',
          position: [8, 9, 10],
          target: [1, 0, 1],
          zoom: 1.2,
        },
        createdAt: '2026-04-20T10:00:00.000Z',
        id: 'delivery-preset:camera-apply',
        kind: 'camera',
        levelId: 'level_delivery_focus',
        name: 'Applied Camera',
        overlays: {
          showPerimeterGuides: false,
          showRoomArea: true,
          showRoomName: true,
          showWallLength: false,
        },
        updatedAt: '2026-04-24T10:00:00.000Z',
        viewMode: 'tri-view',
      },
      {
        buildingId: 'building_delivery_test',
        levelId: 'level_delivery_test',
        selectedIds: ['zone_delivery_camera'],
        zoneId: null,
      },
    )

    expect(effects.selection).toEqual({
      buildingId: 'building_delivery_test',
      levelId: 'level_delivery_focus',
      selectedIds: [],
      zoneId: null,
    })
    expect(effects.viewMode).toBe('tri-view')
    expect(effects.overlays).toEqual({
      showPerimeterGuides: false,
      showRoomArea: true,
      showRoomName: true,
      showWallLength: false,
    })
    expect(effects.cameraEvent).toEqual({
      type: 'camera-controls:view',
      payload: {
        nodeId: 'level_delivery_focus',
      },
    })
  })
})
