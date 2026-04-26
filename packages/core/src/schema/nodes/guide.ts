import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

const GuideAssetSource = z
  .object({
    type: z.enum(['image', 'pdf-rasterized']).default('image'),
    originalFileName: z.string().optional(),
  })
  .default({ type: 'image' })

const GuideCalibration = z.object({
  kind: z.literal('two-point').default('two-point'),
  distance: z.number().positive(),
  measuredDistance: z.number().positive(),
  points: z.tuple([
    z.tuple([z.number(), z.number()]),
    z.tuple([z.number(), z.number()]),
  ]),
  unit: z.literal('m').default('m'),
})

export const GuideDetectionRegion = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((region) => region.x + region.width <= 1.000001, {
    message: 'Guide detection region must stay within the image width',
    path: ['width'],
  })
  .refine((region) => region.y + region.height <= 1.000001, {
    message: 'Guide detection region must stay within the image height',
    path: ['height'],
  })

export const GuideNode = BaseNode.extend({
  id: objectId('guide'),
  type: nodeType('guide'),
  url: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.number().default(1),
  opacity: z.number().min(0).max(100).default(50),
  locked: z.boolean().default(false),
  calibration: GuideCalibration.optional(),
  detectionRegion: GuideDetectionRegion.optional(),
  assetSource: GuideAssetSource,
})

export type GuideNode = z.infer<typeof GuideNode>
