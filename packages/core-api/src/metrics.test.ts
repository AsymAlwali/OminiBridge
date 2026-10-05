import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordRequestMetric, renderPrometheusMetrics } from './metrics.js'

test('exports bounded-cardinality request counters and duration histograms', () => {
  recordRequestMetric('chat:complete', 201, 25)
  const metrics = renderPrometheusMetrics()

  assert.match(metrics, /omnibridge_http_requests_total\{operation="chat:complete",status="201"\} 1/)
  assert.match(metrics, /omnibridge_http_request_duration_seconds_bucket\{operation="chat:complete",status="201",le="0.05"\} 1/)
  assert.match(metrics, /omnibridge_http_request_duration_seconds_count\{operation="chat:complete",status="201"\} 1/)
  assert.doesNotMatch(metrics, /tenant_id|query|prompt|api_key/i)
})
