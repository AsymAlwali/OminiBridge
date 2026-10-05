import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Pool } from 'pg'
import { API_KEY_PREFIX_LENGTH, hashApiKey } from './auth.js'
import { closeDatabasePool } from './database.js'
import { closeRedisClient } from './redis.js'

test('serves repeated production search requests from the shared Redis cache', {
  skip: !process.env.DATABASE_URL || !process.env.REDIS_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const tenantId = randomUUID()
  const tenantName = `cache-test-${tenantId}`
  const apiKey = `omni_live_${randomBytes(32).toString('base64url')}`
  const savedEnvironment = {
    authMode: process.env.AUTH_MODE,
    cacheBackend: process.env.SEARCH_CACHE_BACKEND,
    cacheFailureMode: process.env.SEARCH_CACHE_FAILURE_MODE,
    serperKey: process.env.SERPER_API_KEY
  }
  const originalFetch = globalThis.fetch
  let upstreamCalls = 0

  try {
    await pool.query(await readFile(new URL('../migrations/001_tenant_api_keys.sql', import.meta.url), 'utf8'))
    await pool.query(await readFile(new URL('../migrations/002_shared_limits_and_usage.sql', import.meta.url), 'utf8'))
    await pool.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, tenantName])
    await pool.query(
      `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes)
       VALUES ($1, 'search key', $2, $3, $4)`,
      [tenantId, apiKey.slice(0, API_KEY_PREFIX_LENGTH), hashApiKey(apiKey), ['search:read']]
    )
    process.env.AUTH_MODE = 'required'
    process.env.SEARCH_CACHE_BACKEND = 'redis'
    process.env.SEARCH_CACHE_FAILURE_MODE = 'fail'
    process.env.SERPER_API_KEY = 'integration-test-key'
    globalThis.fetch = async () => {
      upstreamCalls += 1
      return Response.json({
        organic: [{ title: 'Cached title', link: 'https://example.com/', snippet: 'Cached snippet' }]
      })
    }

    const { default: app } = await import('./index.js')
    const query = `cache integration ${tenantId}`
    const request = () => app.fetch(new Request('http://localhost/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, max_results: 1 })
    }))
    const first = await request()
    const firstBody = await first.json()
    const second = await request()
    const secondBody = await second.json()

    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(upstreamCalls, 1)
    assert.deepEqual(secondBody, firstBody)
  } finally {
    globalThis.fetch = originalFetch
    if (savedEnvironment.authMode === undefined) delete process.env.AUTH_MODE
    else process.env.AUTH_MODE = savedEnvironment.authMode
    if (savedEnvironment.cacheBackend === undefined) delete process.env.SEARCH_CACHE_BACKEND
    else process.env.SEARCH_CACHE_BACKEND = savedEnvironment.cacheBackend
    if (savedEnvironment.cacheFailureMode === undefined) delete process.env.SEARCH_CACHE_FAILURE_MODE
    else process.env.SEARCH_CACHE_FAILURE_MODE = savedEnvironment.cacheFailureMode
    if (savedEnvironment.serperKey === undefined) delete process.env.SERPER_API_KEY
    else process.env.SERPER_API_KEY = savedEnvironment.serperKey
    await pool.query('DELETE FROM api_keys WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM request_usage WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId])
    await pool.end()
    await closeRedisClient()
    await closeDatabasePool()
  }
})
