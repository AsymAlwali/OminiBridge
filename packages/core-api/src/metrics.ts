export type MeteredOperation = 'chat:complete' | 'search:read'

const histogramBounds = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, Infinity]

interface MetricSeries {
  count: number
  durationSeconds: number
  buckets: number[]
}

const requestSeries = new Map<string, MetricSeries>()

export function recordRequestMetric(operation: MeteredOperation, statusCode: number, durationMs: number) {
  const key = `${operation}:${statusCode}`
  const series = requestSeries.get(key) ?? {
    count: 0,
    durationSeconds: 0,
    buckets: histogramBounds.map(() => 0)
  }
  const durationSeconds = Math.max(0, durationMs) / 1000
  series.count += 1
  series.durationSeconds += durationSeconds
  histogramBounds.forEach((bound, index) => {
    if (durationSeconds <= bound) series.buckets[index] += 1
  })
  requestSeries.set(key, series)
}

function escapeLabel(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
}

export function renderPrometheusMetrics() {
  const output = [
    '# HELP omnibridge_http_requests_total Authenticated API requests by operation and response status.',
    '# TYPE omnibridge_http_requests_total counter',
    '# HELP omnibridge_http_request_duration_seconds Authenticated API request duration in seconds.',
    '# TYPE omnibridge_http_request_duration_seconds histogram'
  ]
  for (const [key, series] of requestSeries) {
    const separator = key.lastIndexOf(':')
    const operation = escapeLabel(key.slice(0, separator))
    const status = escapeLabel(key.slice(separator + 1))
    output.push(`omnibridge_http_requests_total{operation="${operation}",status="${status}"} ${series.count}`)
    histogramBounds.forEach((bound, index) => {
      const label = Number.isFinite(bound) ? String(bound) : '+Inf'
      output.push(
        `omnibridge_http_request_duration_seconds_bucket{operation="${operation}",status="${status}",le="${label}"} ${series.buckets[index]}`
      )
    })
    output.push(`omnibridge_http_request_duration_seconds_sum{operation="${operation}",status="${status}"} ${series.durationSeconds}`)
    output.push(`omnibridge_http_request_duration_seconds_count{operation="${operation}",status="${status}"} ${series.count}`)
  }
  return `${output.join('\n')}\n`
}
