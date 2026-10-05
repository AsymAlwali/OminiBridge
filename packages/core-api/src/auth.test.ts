import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  API_KEY_PREFIX_LENGTH,
  authenticateApiKey,
  hashApiKey,
  type ApiKeyRecord,
  type ApiKeyStore
} from './auth.js'
import app from './index.js'

const apiKey = `omni_live_${'A'.repeat(43)}`
const record: ApiKeyRecord = {
  id: 'key-id',
  tenantId: 'tenant-id',
  keyHash: hashApiKey(apiKey),
  scopes: ['chat:complete']
}

function storeWith(candidate?: ApiKeyRecord): ApiKeyStore {
  return {
    async findActiveApiKeyByPrefix(prefix) {
      return prefix === apiKey.slice(0, API_KEY_PREFIX_LENGTH) ? candidate : undefined
    }
  }
}

function statusOf(result: Awaited<ReturnType<typeof authenticateApiKey>>) {
  return result.ok ? 200 : result.status
}

test('rejects missing and malformed bearer tokens', async () => {
  assert.deepEqual(await authenticateApiKey(undefined, 'chat:complete', storeWith(record)), {
    ok: false,
    status: 401,
    error: 'A valid bearer API key is required.'
  })
  assert.equal(statusOf(await authenticateApiKey('Bearer placeholder', 'chat:complete', storeWith(record))), 401)
})

test('accepts a matching active key with the required scope', async () => {
  assert.deepEqual(
    await authenticateApiKey(`Bearer ${apiKey}`, 'chat:complete', storeWith(record)),
    { ok: true, apiKey: record }
  )
})

test('rejects unknown or revoked keys and keys without the required scope', async () => {
  assert.equal(statusOf(await authenticateApiKey(`Bearer ${apiKey}`, 'chat:complete', storeWith())), 401)
  assert.equal(statusOf(await authenticateApiKey(`Bearer ${apiKey}`, 'search:read', storeWith(record))), 403)
})

test('rejects a token whose prefix matches but whose secret does not', async () => {
  const alteredKey = `${apiKey.slice(0, -1)}B`
  assert.equal(statusOf(await authenticateApiKey(`Bearer ${alteredKey}`, 'chat:complete', storeWith(record))), 401)
})

test('protects API routes by default while keeping health public', async () => {
  const previousMode = process.env.AUTH_MODE
  const previousMetricsToken = process.env.METRICS_TOKEN
  const previousFailureMode = process.env.SEARCH_CACHE_FAILURE_MODE
  delete process.env.AUTH_MODE
  try {
    const unauthorized = await app.fetch(new Request('http://localhost/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' })
    }))
    assert.equal(unauthorized.status, 401)
    assert.equal(unauthorized.headers.get('www-authenticate'), 'Bearer')

    const health = await app.fetch(new Request('http://localhost/health'))
    assert.equal(health.status, 200)

    process.env.AUTH_MODE = 'invalid'
    const misconfigured = await app.fetch(new Request('http://localhost/v1/search', { method: 'POST' }))
    assert.equal(misconfigured.status, 503)
    const notReady = await app.fetch(new Request('http://localhost/ready'))
    assert.equal(notReady.status, 503)

    process.env.AUTH_MODE = 'development'
    const localReady = await app.fetch(new Request('http://localhost/ready'))
    assert.equal(localReady.status, 200)

    process.env.METRICS_TOKEN = 'metrics-test-token'
    assert.equal((await app.fetch(new Request('http://localhost/metrics'))).status, 401)
    const metrics = await app.fetch(new Request('http://localhost/metrics', {
      headers: { Authorization: 'Bearer metrics-test-token' }
    }))
    assert.equal(metrics.status, 200)
    assert.match(metrics.headers.get('content-type') ?? '', /text\/plain/)
    assert.match(await metrics.text(), /omnibridge_http_requests_total/)
    delete process.env.METRICS_TOKEN
    assert.equal((await app.fetch(new Request('http://localhost/metrics'))).status, 404)
  } finally {
    if (previousMode === undefined) delete process.env.AUTH_MODE
    else process.env.AUTH_MODE = previousMode
    if (previousMetricsToken === undefined) delete process.env.METRICS_TOKEN
    else process.env.METRICS_TOKEN = previousMetricsToken
    if (previousFailureMode === undefined) delete process.env.SEARCH_CACHE_FAILURE_MODE
    else process.env.SEARCH_CACHE_FAILURE_MODE = previousFailureMode
  }
})
