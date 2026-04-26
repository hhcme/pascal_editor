export type FlightPlanPoint = {
  x: number
  z: number
}

export type FlightWorldPoint = FlightPlanPoint & {
  y: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function buildBuildingFocusTarget(
  footprint: FlightPlanPoint[],
  buildingTopY: number | null,
): FlightWorldPoint | null {
  if (footprint.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of footprint) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }

  const usableTopY = isFiniteNumber(buildingTopY) ? Math.max(buildingTopY, 1.8) : 3

  return {
    x: (minX + maxX) / 2,
    y: Math.max(1.6, usableTopY * 0.58),
    z: (minZ + maxZ) / 2,
  }
}

export function getYawPitchToWorldPoint(from: FlightWorldPoint, target: FlightWorldPoint) {
  const deltaX = target.x - from.x
  const deltaY = target.y - from.y
  const deltaZ = target.z - from.z
  const horizontalDistance = Math.hypot(deltaX, deltaZ)

  return {
    yaw: Math.atan2(-deltaX, -deltaZ),
    pitch: Math.atan2(deltaY, Math.max(horizontalDistance, 1e-6)),
  }
}

export function shouldAppendRouteSample(
  previous: FlightPlanPoint | null,
  next: FlightPlanPoint,
  minDistance: number,
) {
  if (!previous) return true
  if (!(minDistance > 0)) return true

  return Math.hypot(next.x - previous.x, next.z - previous.z) >= minDistance
}
