import type {
  AngleMetric,
  AngleSummary,
  ClearanceMetric,
  ClearanceSummary,
  MeasurementMetric,
  MeasurementSummary,
  PerimeterMetric,
  PerimeterSummary,
} from '../measurement'

type MetricLike<TId extends string> = {
  id: TId
  value: number
}

export type MetricValueMap<TId extends string> = Partial<Record<TId, number>>

export type NodeMeasurementFacts = {
  area?: number
  volume?: number
  perimeter?: MetricValueMap<PerimeterMetric['id']>
  clearance?: MetricValueMap<ClearanceMetric['id']>
  angle?: MetricValueMap<AngleMetric['id']>
  approximate: boolean
}

export type BuildNodeMeasurementFactsInput = {
  measurement?: MeasurementSummary | null
  perimeter?: PerimeterSummary | null
  clearance?: ClearanceSummary | null
  angle?: AngleSummary | null
}

export function indexMetricValueMap<TId extends string>(
  metrics: Array<MetricLike<TId>>,
): MetricValueMap<TId> {
  const entries = metrics.map((metric) => [metric.id, metric.value] as const)
  return Object.fromEntries(entries) as MetricValueMap<TId>
}

export function getMetricValue<TId extends string>(
  metrics: Array<MetricLike<TId>>,
  id: TId,
): number | null {
  return metrics.find((metric) => metric.id === id)?.value ?? null
}

export function buildNodeMeasurementFacts(
  input: BuildNodeMeasurementFactsInput,
): NodeMeasurementFacts {
  const facts: NodeMeasurementFacts = {
    approximate:
      Boolean(input.measurement?.approximate) ||
      Boolean(input.perimeter?.approximate) ||
      Boolean(input.clearance?.approximate) ||
      Boolean(input.angle?.approximate),
  }

  if (input.measurement) {
    if (input.measurement.kind === 'area') facts.area = input.measurement.value
    if (input.measurement.kind === 'volume') facts.volume = input.measurement.value
  }

  if (input.perimeter) {
    facts.perimeter = indexMetricValueMap(input.perimeter.metrics)
  }

  if (input.clearance) {
    facts.clearance = indexMetricValueMap(input.clearance.metrics)
  }

  if (input.angle) {
    facts.angle = indexMetricValueMap(input.angle.metrics)
  }

  return facts
}

export function getMeasurementValueByKind(
  summary: MeasurementSummary | null | undefined,
  kind: MeasurementSummary['kind'],
): number | null {
  if (!summary || summary.kind !== kind) return null
  return summary.value
}

export function getMeasurementMetricValue(
  metrics: MeasurementMetric[],
  id: string,
): number | null {
  return metrics.find((metric) => metric.id === id)?.value ?? null
}
