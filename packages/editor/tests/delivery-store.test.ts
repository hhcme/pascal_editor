import { beforeEach, describe, expect, test } from 'bun:test'
import { useDeliveryStore } from '../src/store/use-delivery'

describe('guide detection candidate review', () => {
  beforeEach(() => {
    useDeliveryStore.getState().clearDetectionCandidates()
  })

  test('keeps geometry defaults aligned when a reviewer changes an opening kind', () => {
    useDeliveryStore.getState().setDetectionCandidates({
      generatedAt: 1,
      guideId: 'guide_review' as never,
      openings: [
        {
          center: [2, 0],
          height: 2.1,
          id: 'opening-review-1',
          kind: 'door',
          wallCandidateId: 'wall-review-1',
          width: 1.2,
          yOffset: 1.05,
        },
      ],
      walls: [
        {
          end: [4, 0],
          id: 'wall-review-1',
          start: [0, 0],
          thickness: 0.18,
        },
      ],
    })

    useDeliveryStore.getState().setDetectionOpeningKind('opening-review-1', 'window')

    expect(useDeliveryStore.getState().detectionCandidates?.openings[0]).toMatchObject({
      height: 1.5,
      kind: 'window',
      yOffset: 1.45,
    })
    expect(useDeliveryStore.getState().detectionCandidates?.selectedOpeningIds).toEqual([
      'opening-review-1',
    ])
  })
})
