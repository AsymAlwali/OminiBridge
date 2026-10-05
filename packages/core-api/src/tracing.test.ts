import assert from 'node:assert/strict'
import { trace } from '@opentelemetry/api'
import { test } from 'node:test'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'

test('propagates W3C trace context without recording request contents or credentials', async () => {
  const previous = {
    tracesEndpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  }
  delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT

  const tracing = await import('./tracing.js')
  const exporter = new InMemorySpanExporter()
  assert.equal(tracing.isTracingEnabled(), false)
  assert.equal(tracing.initializeTracing(exporter), true)

  try {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736'
    const request = new Request('https://gateway.example/v1/search?query=private-query', {
      method: 'POST',
      headers: {
        traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
        authorization: 'Bearer private-api-key'
      },
      body: JSON.stringify({ query: 'private-query' })
    })

    await tracing.withServerSpan(request, async () => {
      const activeSpan = trace.getActiveSpan()
      assert.ok(activeSpan)
      assert.equal(activeSpan.spanContext().traceId, traceId)

      const response = await tracing.tracedFetch(
        'provider.openai',
        'https://api.openai.com/v1/chat/completions?token=private-token',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer upstream-secret' },
          body: 'private prompt'
        },
        async (_input, init) => {
          assert.equal(new Headers(init?.headers).get('traceparent')?.split('-')[1], traceId)
          return new Response('ok', { status: 200 })
        }
      )
      assert.equal(response.status, 200)
      return response
    })

    const { default: app } = await import('./index.js')
    const healthResponse = await app.fetch(new Request('http://localhost/health'))
    assert.equal(healthResponse.status, 200)
    assert.match(healthResponse.headers.get('x-trace-id') ?? '', /^[a-f0-9]{32}$/)

    await tracing.flushTracing()
    const spans = exporter.getFinishedSpans()
    assert.equal(spans.length, 3)

    const serverSpan = spans.find((span) => span.name === 'HTTP POST /v1/search')
    const clientSpan = spans.find((span) => span.kind === 2)
    const healthSpan = spans.find((span) => span.name === 'HTTP GET /health')
    assert.ok(serverSpan)
    assert.ok(clientSpan)
    assert.ok(healthSpan)
    assert.equal(clientSpan.name, 'HTTP POST provider.openai')
    assert.equal(serverSpan.spanContext().traceId, traceId)
    assert.equal(clientSpan.parentSpanContext?.spanId, serverSpan.spanContext().spanId)
    assert.equal(healthResponse.headers.get('x-trace-id'), healthSpan.spanContext().traceId)

    const serializedSpans = JSON.stringify(spans.map((span) => ({
      name: span.name,
      attributes: span.attributes
    })))
    for (const sensitiveValue of [
      'private-query',
      'private-api-key',
      'upstream-secret',
      'private-token',
      'private prompt'
    ]) {
      assert.equal(serializedSpans.includes(sensitiveValue), false)
    }
  } finally {
    await tracing.shutdownTracing()
    if (previous.tracesEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    else process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = previous.tracesEndpoint
    if (previous.endpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previous.endpoint
  }
})
