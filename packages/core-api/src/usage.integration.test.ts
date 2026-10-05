import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Pool } from 'pg'
import { API_KEY_PREFIX_LENGTH, hashApiKey } from './auth.js'
import { closeDatabasePool } from './database.js'
import { closeRedisClient } from './redis.js'

test('enforces shared limits and records request metadata without prompt content', {
  skip: !process.env.DATABASE_URL || !process.env.REDIS_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const tenantName = `usage-test-${randomUUID()}`
  const tenantId = randomUUID()
  const previousLimit = process.env.RATE_LIMIT_MAX_REQUESTS
  const previousWindow = process.env.RATE_LIMIT_WINDOW_MS
  const apiKey = `omni_live_${randomBytes(32).toString('base64url')}`

  try {
    await pool.query(await readFile(new URL('../migrations/001_tenant_api_keys.sql', import.meta.url), 'utf8'))
    await pool.query(await readFile(new URL('../migrations/002_shared_limits_and_usage.sql', import.meta.url), 'utf8'))
    await pool.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, tenantName])
    await pool.query(
      `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes)
       VALUES ($1, 'test key', $2, $3, $4)`,
      [tenantId, apiKey.slice(0, API_KEY_PREFIX_LENGTH), hashApiKey(apiKey), ['chat:complete']]
    )
    process.env.AUTH_MODE = 'required'
    process.env.RATE_LIMIT_MAX_REQUESTS = '3'
    process.env.RATE_LIMIT_WINDOW_MS = '60000'

    const { default: app } = await import('./index.js')
    const requests = await Promise.all(Array.from({ length: 6 }, () => app.fetch(new Request(
      'http://localhost/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `private prompt ${randomUUID()}` }]
        })
      }
    ))))

    assert.equal(requests.filter((response) => response.status === 200).length, 3)
    assert.equal(requests.filter((response) => response.status === 429).length, 3)
    for (const response of requests) {
      assert.ok(response.headers.get('x-request-id'))
      assert.ok(response.headers.has('ratelimit-limit'))
    }
    assert.ok(requests.find((response) => response.status === 429)?.headers.has('retry-after'))

    const usage = await pool.query<{
      request_id: string
      operation: string
      status_code: number
      duration_ms: number
    }>(
      `SELECT request_id, operation, status_code, duration_ms
       FROM request_usage WHERE tenant_id = $1`,
      [tenantId]
    )
    assert.equal(usage.rows.length, 6)
    assert.deepEqual(usage.rows.map((row) => row.status_code).sort(), [200, 200, 200, 429, 429, 429])
    assert.ok(usage.rows.every((row) => row.operation === 'chat:complete' && row.duration_ms >= 0))

    const storedSchema = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'request_usage'`
    )
    assert.ok(!storedSchema.rows.some((row) => ['prompt', 'authorization', 'api_key'].includes(row.column_name)))
  } finally {
    if (previousLimit === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS
    else process.env.RATE_LIMIT_MAX_REQUESTS = previousLimit
    if (previousWindow === undefined) delete process.env.RATE_LIMIT_WINDOW_MS
    else process.env.RATE_LIMIT_WINDOW_MS = previousWindow
    await pool.query('DELETE FROM api_keys WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM request_usage WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId])
    await pool.end()
    await closeRedisClient()
    await closeDatabasePool()
  }
})
