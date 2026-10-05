import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Pool } from 'pg'
import { API_KEY_PREFIX_LENGTH, hashApiKey } from './auth.js'
import { closeDatabasePool } from './database.js'
import { closeRedisClient } from './redis.js'
import { runMigrations } from './migrate.js'
import { recordRequestUsage, reserveMonthlyRequest } from './usage.js'
import app from './index.js'

test('enforces a concurrent monthly success budget and does not charge failed requests', {
  skip: !process.env.DATABASE_URL || !process.env.REDIS_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const tenantId = randomUUID()
  const apiKey = `omni_live_${randomBytes(32).toString('base64url')}`
  const previousEnvironment = {
    authMode: process.env.AUTH_MODE,
    requestLimit: process.env.RATE_LIMIT_MAX_REQUESTS,
    requestWindow: process.env.RATE_LIMIT_WINDOW_MS,
    openAiKey: process.env.OPENAI_API_KEY,
    openAiKeys: process.env.OPENAI_API_KEYS
  }

  try {
    await runMigrations(pool)
    await pool.query(
      'INSERT INTO tenants (id, name, monthly_request_budget) VALUES ($1, $2, 2)',
      [tenantId, `budget-test-${tenantId}`]
    )
    await pool.query(
      `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes)
       VALUES ($1, 'budget test key', $2, $3, $4)`,
      [tenantId, apiKey.slice(0, API_KEY_PREFIX_LENGTH), hashApiKey(apiKey), ['chat:complete']]
    )

    const reservations = await Promise.all(Array.from({ length: 5 }, () => {
      const requestId = randomUUID()
      return reserveMonthlyRequest(requestId, tenantId).then((decision) => ({ requestId, decision }))
    }))
    const admitted = reservations.filter(({ decision }) => decision.allowed)
    assert.equal(admitted.length, 2)
    for (const { requestId } of admitted) {
      await recordRequestUsage({
        requestId,
        tenantId,
        operation: 'chat:complete',
        statusCode: 502,
        durationMs: 1
      })
    }

    process.env.AUTH_MODE = 'required'
    process.env.RATE_LIMIT_MAX_REQUESTS = '60'
    process.env.RATE_LIMIT_WINDOW_MS = '60000'
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEYS
    const request = (messages: unknown) => app.fetch(new Request(
      'http://localhost/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages })
      }
    ))

    assert.equal((await request(undefined)).status, 400)
    const success = await request([{ role: 'user', content: 'budget check' }])
    assert.equal(success.status, 200)
    assert.equal(success.headers.get('monthly-request-limit'), '2')
    const secondSuccess = await request([{ role: 'user', content: 'budget check' }])
    assert.equal(secondSuccess.status, 200)
    const limited = await request([{ role: 'user', content: 'budget check' }])
    assert.equal(limited.status, 429)
    assert.match((await limited.json()).error, /successful request budget/i)

    const statuses = await pool.query<{ status_code: number }>(
      'SELECT status_code FROM request_usage WHERE tenant_id = $1 ORDER BY created_at',
      [tenantId]
    )
    assert.deepEqual(statuses.rows.map(({ status_code }) => status_code).sort(), [200, 200, 400, 429, 502, 502])
    const remainingReservations = await pool.query(
      'SELECT request_id FROM monthly_request_reservations WHERE tenant_id = $1',
      [tenantId]
    )
    assert.equal(remainingReservations.rowCount, 0)
  } finally {
    if (previousEnvironment.authMode === undefined) delete process.env.AUTH_MODE
    else process.env.AUTH_MODE = previousEnvironment.authMode
    if (previousEnvironment.requestLimit === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS
    else process.env.RATE_LIMIT_MAX_REQUESTS = previousEnvironment.requestLimit
    if (previousEnvironment.requestWindow === undefined) delete process.env.RATE_LIMIT_WINDOW_MS
    else process.env.RATE_LIMIT_WINDOW_MS = previousEnvironment.requestWindow
    if (previousEnvironment.openAiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousEnvironment.openAiKey
    if (previousEnvironment.openAiKeys === undefined) delete process.env.OPENAI_API_KEYS
    else process.env.OPENAI_API_KEYS = previousEnvironment.openAiKeys
    await pool.query('DELETE FROM monthly_request_reservations WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM request_usage WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM api_keys WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId])
    await pool.end()
    await closeRedisClient()
    await closeDatabasePool()
  }
})
