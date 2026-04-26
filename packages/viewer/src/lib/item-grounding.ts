import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

export interface ItemBounds {
  min: [number, number, number]
  max: [number, number, number]
}

export interface ItemTransform {
  offset: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

/**
 * Projects an item's raw local-space bounds through its corrective transform so we can
 * determine how far below the placement plane the visual mesh extends.
 */
export function getTransformedBoundsMinY(bounds: ItemBounds, transform: ItemTransform): number {
  const matrix = new Matrix4().compose(
    new Vector3(...transform.offset),
    new Quaternion().setFromEuler(new Euler(...transform.rotation)),
    new Vector3(...transform.scale),
  )

  let minY = Number.POSITIVE_INFINITY
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        minY = Math.min(minY, new Vector3(x, y, z).applyMatrix4(matrix).y)
      }
    }
  }

  return minY
}

export function getGroundAlignmentOffsetY(bounds: ItemBounds, transform: ItemTransform): number {
  const minY = getTransformedBoundsMinY(bounds, transform)
  if (!Number.isFinite(minY) || minY >= 0) return 0
  return -minY
}
