import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type TextMapGetter,
  type TextMapSetter
} from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, type SpanExporter } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'omnibridge-core-api'
const tracer = trace.getTracer(serviceName)
const headerGetter: TextMapGetter<Headers> = {
  get: (headers, key) => headers.get(key) ?? undefined,
  keys: (headers) => [...headers.keys()]
}
const headerSetter: TextMapSetter<Headers> = {
  set: (headers, key, value) => headers.set(key, value)
}
const knownRoutes = new Set([
  '/health',
  '/ready',
  '/metrics',
  '/v1/chat/completions',
  '/v1/search'
])

let provider: NodeTracerProvider | undefined

function getTraceEndpoint() {
  const tracesEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim()
  if (tracesEndpoint) return tracesEndpoint

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
  if (!endpoint) return undefined
  return new URL('v1/traces', `${endpoint.replace(/\/+$/, '')}/`).toString()
}

export function initializeTracing(exporter?: SpanExporter) {
  if (provider) return false
  const endpoint = getTraceEndpoint()
  if (!exporter && !endpoint) return false

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': serviceName }),
    spanProcessors: [
      new BatchSpanProcessor(exporter ?? new OTLPTraceExporter({ url: endpoint }))
    ]
  })
  provider.register({ propagator: new W3CTraceContextPropagator() })
  return true
}

export function isTracingEnabled() {
  return provider !== undefined
}

export async function shutdownTracing() {
  const activeProvider = provider
  provider = undefined
  await activeProvider?.shutdown()
}

export async function flushTracing() {
  await provider?.forceFlush()
}

export async function withServerSpan<T>(
  request: Request,
  handler: (span: Span) => Promise<T>
): Promise<T> {
  const path = new URL(request.url).pathname
  const route = knownRoutes.has(path) ? path : 'unmatched'
  const parentContext = propagation.extract(context.active(), request.headers, headerGetter)
  return tracer.startActiveSpan(
    `HTTP ${request.method} ${route}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.request.method': request.method,
        'http.route': route
      }
    },
    parentContext,
    async (span) => {
      try {
        return await handler(span)
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    }
  )
}

export type OutboundOperation =
  | 'provider.openai'
  | 'search.serper'
  | 'search.duckduckgo'
  | 'search.scrape'

export async function tracedFetch(
  operation: OutboundOperation,
  input: string | URL,
  init: RequestInit,
  fetchImplementation: typeof fetch = fetch
) {
  if (!provider) return fetchImplementation(input, init)

  return tracer.startActiveSpan(
    `HTTP ${init.method ?? 'GET'} ${operation}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.request.method': (init.method ?? 'GET').toUpperCase(),
        'omnibridge.operation': operation
      }
    },
    async (span) => {
      const headers = new Headers(init.headers)
      propagation.inject(context.active(), headers, headerSetter)
      try {
        const response = await fetchImplementation(input, { ...init, headers })
        span.setAttribute('http.response.status_code', response.status)
        if (!response.ok) span.setStatus({ code: SpanStatusCode.ERROR })
        return response
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    }
  )
}

initializeTracing()
